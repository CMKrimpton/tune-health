import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addOverheadCost } from "../_shared/db.ts";
import { gemini, generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { MODELS, EDITOR_CHAIN } from "../_shared/constants.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "analyze") return await handleAnalyze();
    if (action === "merge") return await handleMerge(body.topicIds as string[]);

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[topic-merge] Error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Analyze: AI clusters the full queue into semantic duplicate groups
// ---------------------------------------------------------------------------
async function handleAnalyze() {
  const db = supabase();

  // Fetch all queued topics
  const { data: topics, error: qErr } = await db
    .from("topic_queue")
    .select("id, topic, notes, category, priority, source, research_summary")
    .eq("status", "queued")
    .order("priority", { ascending: true });
  if (qErr) throw qErr;
  if (!topics || topics.length < 2) {
    return json({ clusters: [], alreadyPublished: [], message: "Not enough queued topics to analyze." });
  }

  // Fetch published article titles for cross-check
  const { data: articles } = await db
    .from("articles")
    .select("title, slug")
    .eq("status", "published");
  const publishedTitles = (articles || []).map((a) => a.title);

  // Build numbered topic list for the prompt
  const topicList = topics.map((t, i) => `${i + 1}. [${t.id}] ${t.topic}${t.category ? ` (${t.category})` : ""}`).join("\n");

  const publishedList = publishedTitles.length > 0
    ? "\n\nAlready-published articles:\n" + publishedTitles.map((t, i) => `P${i + 1}. ${t}`).join("\n")
    : "";

  const analyzeSystem = `You are a deduplication assistant for a health editorial queue. Identify clusters of topics that are about the same core story — even if worded completely differently. Two topics are duplicates if a single well-written article would cover both. Be aggressive about finding conceptual overlap but never merge topics that merely share a category.

Also flag any queued topics that substantially duplicate an already-published article.

Return ONLY valid JSON matching this schema:
{
  "clusters": [
    { "topicIds": ["uuid1", "uuid2"], "reason": "one-line explanation", "confidence": "high" | "medium" }
  ],
  "alreadyPublished": [
    { "topicId": "uuid", "matchedArticle": "published title", "reason": "one-line explanation" }
  ]
}

Rules:
- Only include clusters with 2+ topics
- Each topic should appear in at most one cluster
- "high" confidence = clearly the same story; "medium" = likely the same, editor should verify
- For alreadyPublished, only flag strong matches where the published article already covers the queued topic's core angle`;

  const analyzeUser = `Here are ${topics.length} queued topics. Find duplicate clusters and flag any that match published articles.\n\nQueued topics:\n${topicList}${publishedList}`;

  const result = await generateWithFallback({
    system: analyzeSystem,
    user: analyzeUser,
    models: [MODELS.DEFAULT_OPENAI, MODELS.DEFAULT_CLAUDE],
    maxTokens: 8192,
    temperature: 0.1,
    stage: "merge-analyze",
    webSearch: false,
    timeout: 120_000,
  });

  let parsed: {
    clusters?: Array<{ topicIds: string[]; reason: string; confidence: string }>;
    alreadyPublished?: Array<{ topicId: string; matchedArticle: string; reason: string }>;
  };
  try {
    parsed = parseClaudeJSON(result.text) as typeof parsed;
  } catch {
    // Fallback: brace-count to find the first complete JSON object
    const start = result.text.indexOf("{");
    if (start < 0) return json({ error: "No JSON found in AI response" }, 500);
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = start; i < result.text.length; i++) {
      const ch = result.text[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end > start) {
      try {
        parsed = JSON.parse(result.text.slice(start, end + 1)) as typeof parsed;
      } catch {
        return json({ error: "JSON parse failed after brace-counting", rawPreview: result.text.slice(start, start + 2000) }, 500);
      }
    } else {
      return json({ error: "Incomplete JSON in AI response (truncated?)", rawLen: result.text.length }, 500);
    }
  }

  // Validate: only keep IDs that actually exist in our topic list
  const validIds = new Set(topics.map((t) => t.id));
  const clusters = (parsed.clusters || [])
    .map((c) => ({ ...c, topicIds: c.topicIds.filter((id) => validIds.has(id)) }))
    .filter((c) => c.topicIds.length >= 2);

  const alreadyPublished = (parsed.alreadyPublished || [])
    .filter((ap) => validIds.has(ap.topicId));

  // Enrich clusters with topic text for the UI
  const topicMap = new Map(topics.map((t) => [t.id, t]));
  const enrichedClusters = clusters.map((c) => ({
    ...c,
    topics: c.topicIds.map((id) => topicMap.get(id)).filter(Boolean),
  }));

  // Log analysis cost
  await addOverheadCost(db, result.usage);

  return json({
    clusters: enrichedClusters,
    alreadyPublished,
    cost: result.usage,
    totalAnalyzed: topics.length,
  });
}

// ---------------------------------------------------------------------------
// Merge: AI synthesizes a cluster into one super-topic
// ---------------------------------------------------------------------------
async function handleMerge(topicIds: string[]) {
  if (!topicIds || topicIds.length < 2) {
    return json({ error: "Need at least 2 topicIds to merge" }, 400);
  }

  const db = supabase();

  // Fetch and verify all topics still exist and are queued
  const { data: topics, error } = await db
    .from("topic_queue")
    .select("*")
    .in("id", topicIds)
    .eq("status", "queued");
  if (error) throw error;

  const found = new Set((topics || []).map((t) => t.id));
  const missing = topicIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return json({ error: `Topics no longer available: ${missing.join(", ")}` }, 400);
  }

  // Build detailed input for the editorial merge
  const topicDetails = topics!.map((t, i) => [
    `--- Topic ${i + 1} ---`,
    `Title: ${t.topic}`,
    t.category ? `Category: ${t.category}` : null,
    t.notes ? `Scout Notes: ${t.notes}` : null,
    t.research_summary ? `Research: ${t.research_summary}` : null,
    `Source: ${t.source} | Priority: ${t.priority}`,
  ].filter(Boolean).join("\n")).join("\n\n");

  const result = await generateWithFallback({
    system: `You are a senior health editor merging duplicate topic briefs into one stronger brief. Preserve every unique angle, source, and research finding. The merged version should be richer and more specific than any individual original.

Return ONLY valid JSON:
{
  "topic": "The best, sharpest topic title — more specific and compelling than any original",
  "notes": "Combined notes preserving all unique angles, sources, and framing from every version",
  "research_summary": "Combined research context from all versions",
  "category": "Best-fit category"
}`,

    user: `Merge these ${topics!.length} duplicate topic briefs into one super-brief:\n\n${topicDetails}`,
    models: EDITOR_CHAIN,
    maxTokens: 2048,
    temperature: 0.3,
    stage: "merge-execute",
  });

  const merged = parseClaudeJSON(result.text) as {
    topic: string;
    notes: string;
    research_summary: string;
    category: string;
  };

  // Calculate best priority and check expedite
  const bestPriority = Math.min(...topics!.map((t) => t.priority));
  const anyExpedited = topics!.some((t) => t.expedite);
  const bestEditorScore = Math.max(...topics!.map((t) => t.editor_score ?? 0)) || null;

  // Insert merged super-topic
  const { data: newTopic, error: insertErr } = await db
    .from("topic_queue")
    .insert({
      topic: merged.topic,
      notes: `[Merged from ${topics!.length} topics] ${merged.notes}`,
      research_summary: merged.research_summary,
      category: merged.category || topics![0].category,
      priority: bestPriority,
      expedite: anyExpedited,
      source: "merged",
      editor_score: bestEditorScore,
      status: "queued",
    })
    .select()
    .single();
  if (insertErr) throw insertErr;

  // Clear FK references in daily_article_log before deleting originals
  await db
    .from("daily_article_log")
    .update({ queue_id: null })
    .in("queue_id", topicIds);

  // Delete originals
  const { error: delErr } = await db
    .from("topic_queue")
    .delete()
    .in("id", topicIds);
  if (delErr) throw delErr;

  // Log merge cost
  await addOverheadCost(db, result.usage);

  return json({
    success: true,
    merged: newTopic,
    deletedCount: topicIds.length,
    cost: result.usage,
  });
}
