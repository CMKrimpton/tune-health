import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addCostToLog, getExistingArticles, safeStage, dispatchStage } from "../_shared/db.ts";
import { gemini, claude, parseClaudeJSON } from "../_shared/api-clients.ts";
import { RESEARCH_TIMEOUT } from "../_shared/constants.ts";
import { todayISO } from "../_shared/astro.ts";
import type { ApiUsage } from "../_shared/types.ts";

// ---------------------------------------------------------------------------
// Research Agent — finds trending topics
// ---------------------------------------------------------------------------
const RESEARCH_PROMPT = `You are an editorial research agent for alumi news, a premium health editorial website whose slogan is "Evidence. Wherever it leads."

Your job: use web search to discover 3-5 trending health topics from the last 3 days, then research each one enough to give the Senior Editor real options.

## Process
1. Search broadly for trending health news, viral health stories, and the most-discussed health research from the last 72 hours
2. Identify 3-5 distinct candidate topics with genuine scientific substance
3. For EACH candidate: find at least 2 studies/sources, the core mechanism, key statistics, and counter-arguments
4. Rank them by: scientific substance, trending momentum, counter-narrative potential, surprise factor
5. Return ALL candidates ranked — the Senior Editor will make the final pick

## Selection Criteria (ranked)
1. **Genuine scientific substance** — real studies, real data, not celebrity gossip or supplement hype
2. **Trending RIGHT NOW** — people are actively searching for it, it's in the news cycle
3. **Surprising or counter-narrative** — challenges conventional wisdom, reveals something unexpected
4. **Not already covered** — must not duplicate existing articles (list provided)
5. **Fits the voice** — "Evidence over allegiance." Aggressively neutral. Skeptical of all sources equally

## EVIDENCE HIERARCHY (CRITICAL)
Always prioritize the LATEST and LARGEST evidence. Health science is full of outdated dogma that persists in training data and popular media. When researching:
- **Recent meta-analyses and systematic reviews** outrank individual studies, no matter how famous
- **Large cohort studies (n>10,000)** outrank small trials
- **Studies published 2023-2026** outrank older evidence IF they update or contradict it
- **Industry-funded studies** must be flagged as such — note the funder
- **Retracted or corrected studies** must never be cited as current evidence
- If the LATEST evidence contradicts the mainstream consensus, report the latest evidence. Do not default to the older consensus just because it's more widely known.

## KNOWN DOGMA TRAPS — verify before repeating
These are areas where popular health advice is outdated, oversimplified, or industry-driven. Do NOT repeat these as fact without checking the latest evidence:
- Omega-3/omega-6 ratio theory (recent meta-analyses find the ratio largely irrelevant; individual fatty acid levels matter more)
- "Saturated fat causes heart disease" (oversimplified — context, source, and overall dietary pattern matter; the original Keys hypothesis has been substantially revised)
- "Breakfast is the most important meal of the day" (originated from industry-funded research; intermittent fasting evidence complicates this)
- BMI as a reliable health metric (poor proxy for metabolic health; waist-to-hip ratio and body composition are better predictors)
- Multivitamin supplements for general health (most large meta-analyses show no benefit for well-nourished populations)
- "Moderate alcohol is heart-healthy" (recent large Mendelian randomization studies and the Global Burden of Disease data challenge this — sick-quitter bias in older observational studies)
- Generic probiotic supplements (strain-specific evidence only; most commercial products lack evidence for their specific formulations)
- "Natural" = safe or better (naturalistic fallacy; many natural compounds are toxic, many synthetic ones are safe)
- Antioxidant supplements (several large RCTs show no benefit or harm; the oxidative stress theory of aging is far more nuanced than supplement marketing suggests)
- Low-fat diet as default healthy (the low-fat era is largely over; dietary fat quality matters more than quantity)
- "Detox" and "cleanse" products (the liver and kidneys handle detoxification; no supplement improves on healthy organ function)
- Blanket sunscreen absolutism (UV protection is important, but vitamin D deficiency has real costs; chemical vs mineral sunscreen safety is a legitimate debate)

## Output Format
Return ONLY valid JSON (no code fences, no explanation):
{
  "candidates": [
    {
      "rank": 1,
      "topic": "The specific topic/angle",
      "headline_draft": "A working headline (magazine-quality, not clickbait)",
      "why": "1-2 sentences on why this topic is compelling",
      "category": "One of: Neuroscience, Mental Health, Longevity, Clinical Evidence, Environmental Health, Nutrition, Fitness, Sleep Science, Pharmacology",
      "keyFindings": ["Finding 1...", "Finding 2..."],
      "studies": [{ "title": "...", "journal": "...", "year": "...", "finding": "..." }],
      "counterArguments": ["Skeptic point 1", "Skeptic point 2"],
      "mechanism": "Brief explanation of the biological/physiological mechanism",
      "statistics": ["Key statistic 1", "Key statistic 2"]
    }
  ],
  "searchSummary": "Brief description of what you searched and the overall landscape"
}`;

// ---------------------------------------------------------------------------
// Directed Research — single topic from queue
// ---------------------------------------------------------------------------
const DIRECTED_RESEARCH_PROMPT = `You are an editorial research agent for alumi news ("Evidence. Wherever it leads.").

You have been assigned a SPECIFIC topic by the editorial team. Your job: deep-research it using web search and return structured findings.

Find the key studies, statistics, expert positions, biological mechanisms, and counter-arguments. Be thorough — the writer needs real evidence to work with.

CRITICAL: Prioritize the LATEST evidence (2023-2026). Health science is full of outdated dogma. If a recent meta-analysis contradicts older consensus, report the newer findings. Always note study funding sources. Never rely on "conventional wisdom" — verify it against current data.

## Output Format
Return ONLY valid JSON (no code fences, no explanation):
{
  "topic": "The specific topic as researched",
  "headline_draft": "A working headline (magazine-quality, not clickbait)",
  "why": "1-2 sentences on why this topic is worth covering",
  "category": "One of: Neuroscience, Mental Health, Longevity, Clinical Evidence, Environmental Health, Nutrition, Fitness, Sleep Science, Pharmacology",
  "keyFindings": ["Finding 1...", "Finding 2..."],
  "studies": [{ "title": "...", "journal": "...", "year": "...", "finding": "..." }],
  "counterArguments": ["Skeptic point 1", "Skeptic point 2"],
  "mechanism": "Brief explanation of the biological/physiological mechanism",
  "expertQuotes": ["Any notable expert positions or statements found"],
  "statistics": ["Key statistic 1", "Key statistic 2"]
}`;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { logId, topic, source, queueId } = await req.json();
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();

    // Atomic CAS: claim this article. Only ONE instance can transition started → searching.
    const { data: claimed } = await db
      .from("daily_article_log")
      .update({ status: "searching", stage_started_at: new Date().toISOString() })
      .eq("id", logId)
      .eq("status", "started")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      return json({ skipped: true, logId, message: "Another instance already claimed this article" });
    }

    const stageResult = await safeStage(db, logId, "research", async () => {
      const today = todayISO();
      const { titles, categoryCounts } = await getExistingArticles(db);

      // Also get recent pipeline topics (including killed/failed) to avoid repeating
      const { data: recentLogs } = await db
        .from("daily_article_log")
        .select("topic")
        .order("created_at", { ascending: false })
        .limit(20);
      const recentTopics = (recentLogs || [])
        .map((l: { topic: string | null }) => l.topic)
        .filter((t): t is string => !!t);

      // Get existing queue topics to avoid duplicates
      const { data: queueItems } = await db
        .from("topic_queue")
        .select("topic")
        .in("status", ["queued", "assigned", "in_progress"])
        .limit(50);
      const queueTopics = (queueItems || []).map((q: { topic: string }) => q.topic);

      let research: Record<string, unknown>;

      if (topic) {
        // Directed research — Gemini primary (Google Search grounding is 10x cheaper than Claude web search)
        // Claude web search inflates input to ~120K tokens ($0.40/call). Gemini Search grounding: ~$0.03/call.
        const researchPrompt = `Today's date: ${today}

## ASSIGNED TOPIC
${topic}

## Existing Articles (DO NOT duplicate):
${titles.map((t) => `- ${t}`).join("\n")}

Deep-research this topic thoroughly. Find the key studies, statistics, expert positions, mechanisms, and counter-arguments. Return structured JSON.`;

        let researchRaw: string;
        let researchUsage: ApiUsage;

        try {
          const gemResult = await gemini({
            system: DIRECTED_RESEARCH_PROMPT + `\n\nCRITICAL: You MUST return ONLY a valid JSON object. No markdown, no explanation, no preamble. Just the JSON object starting with { and ending with }.`,
            user: researchPrompt + `\n\nReturn ONLY valid JSON with this structure: {"topic":"...","headline_draft":"...","why":"...","category":"...","keyFindings":["..."],"studies":[{"title":"...","journal":"...","year":"...","finding":"..."}],"counterArguments":["..."],"mechanism":"...","expertQuotes":["..."],"statistics":["..."]}`,
            model: "gemini-2.5-pro",
            maxTokens: 4000,
            temperature: 0.35,
            webSearch: true,
            timeout: RESEARCH_TIMEOUT,
          }, "research-gemini");
          researchRaw = gemResult.text;
          researchUsage = gemResult.usage;
        } catch (geminiErr: unknown) {
          // Fallback to Claude web search if Gemini fails
          console.log(`[Research fallback] Gemini failed (${geminiErr instanceof Error ? geminiErr.message.slice(0, 50) : "unknown"}), falling back to Claude...`);
          const result = await claude({
            system: DIRECTED_RESEARCH_PROMPT,
            user: researchPrompt,
            model: "claude-sonnet-4-6",
            maxTokens: 4000,
            webSearch: true,
            maxSearches: 3,
            timeout: RESEARCH_TIMEOUT,
          });
          researchRaw = result.text;
          researchUsage = result.usage;
        }

        // Parse research JSON — with fallback to plain text extraction if Gemini didn't return valid JSON
        try {
          research = parseClaudeJSON(researchRaw) as Record<string, unknown>;
        } catch {
          console.log("[Research] JSON parse failed, extracting from plain text...");
          // Extract what we can from plain text response
          const lines = researchRaw.split("\n").filter((l: string) => l.trim().length > 10);
          research = {
            topic: topic,
            keyFindings: lines.slice(0, 8).map((l: string) => l.replace(/^[\d\.\-\*]+\s*/, "").trim()),
            studies: [],
            counterArguments: [],
            mechanism: lines.find((l: string) => l.toLowerCase().includes("mechanism")) || "",
            statistics: lines.filter((l: string) => /\d+%|\d+\s*(million|billion|thousand)/.test(l)).slice(0, 5),
          };
        }
        research._fromQueue = true;
        research._queueSource = source || "manual";
        if (queueId) research._queueId = queueId;
        await addCostToLog(db, logId, researchUsage);
      }

      // Build topic summary for log
      const topicSummary = (research.topic as string) || topic;

      const { error: updateErr } = await db
        .from("daily_article_log")
        .update({
          topic: topicSummary,
          status: "research_done",
          search_queries: ((research.keyFindings as string[]) || []).slice(0, 10),
          research_snippets: (research.studies as unknown[]) || [],
          research_data: research,
        })
        .eq("id", logId);
      if (updateErr) throw new Error(`DB update to research_done failed: ${updateErr.message}`);
    });

    if (!stageResult.ok) {
      return json({ error: stageResult.error, logId }, 500);
    }

    // Chain-dispatch: fire editor brief immediately (no 5-min cron wait)
    await dispatchStage("stage-editor", logId);
    return json({ success: true, logId, status: "research_done" });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
