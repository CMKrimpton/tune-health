import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addOverheadCost } from "../_shared/db.ts";
import { gemini, grok } from "../_shared/api-clients.ts";
import { classifyCategory, MODELS } from "../_shared/constants.ts";
import { extractFingerprint, isDuplicate, buildFingerprints } from "../_shared/dedup.ts";
import { getPingerContext } from "../_shared/analytics.ts";

// ---------------------------------------------------------------------------
// Pinger — 4x/hour breaking health news detector
// Rotates signal sources: :00 Gemini Search, :15 PubMed, :30 Grok Social, :45 PubMed
// Budget: ~$0.16/day. Only promotes genuinely breaking signals to topic_queue.
// ---------------------------------------------------------------------------

interface Signal {
  topic: string;
  why_breaking: string;
  source: string;
  urgency: "high" | "medium";
  raw_data?: Record<string, unknown>;
}

/** SHA-256 hash for dedup */
async function hashSignal(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.toLowerCase().trim());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Signal Source: Gemini Flash + Google Search (trending health searches)
// ---------------------------------------------------------------------------
async function checkGeminiSearch(accuracyContext: string = ""): Promise<{ signals: Signal[]; cost: number }> {
  const { text, usage } = await gemini({
    system: `Health news detector for a 20-35 reader health magazine. Find health stories that are trending or newsworthy in the last 24 hours. Not evergreen topics — something must have HAPPENED.${accuracyContext}`,
    user: `Search for noteworthy health news from the last 24 hours. Report if ANY of these apply:
1. Study published in a major journal (NEJM, Lancet, JAMA, Nature Medicine, BMJ, Cell, Science, PNAS, Nature) in the last 48h
2. FDA/EMA drug approval, warning, or recall
3. Health crisis, outbreak, or policy change
4. Health study getting mainstream media coverage or going viral
5. Supplement, diet, or wellness claim debunked or validated by new evidence
6. Health controversy trending on social media (TikTok health trends, influencer claims challenged)

If NOTHING qualifies: {"breaking": false}
If something does: {"breaking": true, "signals": [{"topic": "specific angle for 25-year-old readers", "why_breaking": "what happened and why it matters", "urgency": "high or medium"}]}
Max 3 signals. Focus on stories a 25-year-old would text to a friend.`,
    model: MODELS.PINGER_GEMINI,
    maxTokens: 500,
    temperature: 0.3,
    webSearch: true,
    timeout: 60000,
  }, "pinger-gemini");

  try {
    const parsed = JSON.parse(text.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim());
    if (!parsed.breaking || !parsed.signals) return { signals: [], cost: usage.costUsd };
    return { signals: (parsed.signals as Array<{ topic: string; why_breaking: string; urgency: string }>).map(s => ({
      topic: s.topic,
      why_breaking: s.why_breaking,
      source: "gemini_search",
      urgency: (s.urgency === "high" ? "high" : "medium") as "high" | "medium",
    })), cost: usage.costUsd };
  } catch {
    return { signals: [], cost: usage.costUsd };
  }
}

// ---------------------------------------------------------------------------
// Signal Source: Grok (real-time X/Twitter trending)
// ---------------------------------------------------------------------------
async function checkGrokSocial(accuracyContext: string = ""): Promise<{ signals: Signal[]; cost: number }> {
  const { text, usage } = await grok({
    system: `Health news detector with X/Twitter access. Report health topics getting notable social media attention.${accuracyContext}`,
    user: `What health or medical topics are getting attention on X/Twitter right now? Report if:
1. Notable discussion volume (hundreds+ posts, not single tweets)
2. About health, medicine, drugs, supplements, diet trends, fitness claims, disease, or public health
3. Not a recurring daily topic (e.g. "drink water" doesn't count)
4. Includes: health influencer claims being challenged, viral health misinformation, supplement/diet debates, new study reactions, pharma controversies

If nothing notable: {"breaking": false}
If something is: {"breaking": true, "signals": [{"topic": "specific angle for 25-year-old readers", "why_trending": "what's driving the conversation", "urgency": "high or medium"}]}
Max 3 signals.`,
    maxTokens: 500,
    temperature: 0.3,
  }, "pinger-grok");

  try {
    const parsed = JSON.parse(text.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim());
    if (!parsed.breaking || !parsed.signals) return { signals: [], cost: usage.costUsd };
    return { signals: (parsed.signals as Array<{ topic: string; why_trending: string; urgency: string }>).map(s => ({
      topic: s.topic,
      why_breaking: s.why_trending,
      source: "grok_social",
      urgency: (s.urgency === "high" ? "high" : "medium") as "high" | "medium",
    })), cost: usage.costUsd };
  } catch {
    return { signals: [], cost: usage.costUsd };
  }
}

// ---------------------------------------------------------------------------
// Signal Source: PubMed RSS (free — top 5 journals, last 24h)
// ---------------------------------------------------------------------------
async function checkPubMedRSS(db: ReturnType<typeof supabase>): Promise<{ signals: Signal[]; cost: number }> {
  const journals = [
    '"N Engl J Med"[Journal]',
    '"Lancet"[Journal]',
    '"JAMA"[Journal]',
    '"Nat Med"[Journal]',
    '"BMJ"[Journal]',
    '"JAMA Netw Open"[Journal]',
    '"Cell"[Journal]',
    '"Science"[Journal]',
    '"Nature"[Journal]',
    '"PNAS"[Journal]',
  ];
  const query = `(${journals.join(" OR ")}) AND "last 1 days"[PDAT]`;

  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=10`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
    if (!searchRes.ok) return { signals: [], cost: 0 };
    const searchData = await searchRes.json();
    const ids: string[] = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) return { signals: [], cost: 0 };

    // Check which IDs we've already seen
    const { data: seenSignals } = await db
      .from("pinger_signals")
      .select("raw_data")
      .eq("source", "pubmed_rss")
      .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());
    const seenIds = new Set<string>();
    for (const s of (seenSignals || []) as Array<{ raw_data: { pubmed_ids?: string[] } }>) {
      for (const id of s.raw_data?.pubmed_ids || []) seenIds.add(id);
    }
    const newIds = ids.filter((id: string) => !seenIds.has(id));
    if (newIds.length === 0) return { signals: [], cost: 0 };

    // Fetch titles for new publications
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${newIds.join(",")}&retmode=json`;
    const fetchRes = await fetch(fetchUrl, { signal: AbortSignal.timeout(10000) });
    if (!fetchRes.ok) return { signals: [], cost: 0 };
    const fetchData = await fetchRes.json();

    const titles: string[] = [];
    for (const id of newIds) {
      const article = fetchData.result?.[id];
      if (article?.title) titles.push(`${article.title} (${article.source || "journal"}, PMID: ${id})`);
    }
    if (titles.length === 0) return { signals: [], cost: 0 };

    // Triage with Flash: which of these are breaking news vs routine?
    const { text: triageRaw, usage } = await gemini({
      system: `Medical publication triage. Decide which new journal publications are BREAKING NEWS for a health magazine vs routine science.`,
      user: `New publications from top journals (last 24h):\n${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nFor each, is this BREAKING (affects large population + surprising/actionable) or ROUTINE?\n{"signals": [{"title": "...", "breaking": true/false, "topic": "reader-facing angle if breaking", "why": "one sentence"}]}`,
      model: MODELS.PINGER_TRIAGE,
      maxTokens: 500,
      temperature: 0.2,
      webSearch: false,
    }, "pinger-pubmed-triage");

    try {
      const parsed = JSON.parse(triageRaw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim());
      const breaking = (parsed.signals || []).filter((s: { breaking: boolean }) => s.breaking);
      return { signals: breaking.map((s: { topic: string; why: string }) => ({
        topic: s.topic,
        why_breaking: s.why,
        source: "pubmed_rss",
        urgency: "medium" as const,
        raw_data: { pubmed_ids: newIds },
      })), cost: usage.costUsd };
    } catch {
      return { signals: [], cost: usage.costUsd };
    }
  } catch {
    return { signals: [], cost: 0 };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db = supabase();

  try {
    // Determine tick type from current minute
    const minute = new Date().getMinutes();
    let tickSource: string;
    if (minute < 15) tickSource = "gemini_search";
    else if (minute < 30) tickSource = "pubmed_rss";
    else if (minute < 45) tickSource = "grok_social";
    else tickSource = "pubmed_rss";

    // Housekeeping: clean up expired signals
    await db.from("pinger_signals").delete().lt("expires_at", new Date().toISOString());

    // Source accuracy context (SQL-driven, zero AI cost)
    const accuracyContext = await getPingerContext(db);

    // Execute the appropriate signal source
    let signals: Signal[] = [];
    let sourceCost = 0;
    try {
      if (tickSource === "gemini_search") {
        const result = await checkGeminiSearch(accuracyContext);
        signals = result.signals; sourceCost = result.cost;
      } else if (tickSource === "grok_social") {
        const result = await checkGrokSocial(accuracyContext);
        signals = result.signals; sourceCost = result.cost;
      } else {
        const result = await checkPubMedRSS(db);
        signals = result.signals; sourceCost = result.cost;
      }
    } catch (sourceErr) {
      console.error(`[Pinger] ${tickSource} check failed: ${sourceErr instanceof Error ? sourceErr.message : "unknown"}`);
      return json({ checked: false, source: tickSource, error: sourceErr instanceof Error ? sourceErr.message : "unknown" });
    }

    // Log pinger cost to daily overhead (even if no signals found)
    if (sourceCost > 0) {
      await addOverheadCost(db, { model: tickSource, stage: "pinger", inputTokens: 0, outputTokens: 0, costUsd: sourceCost });
    }

    if (signals.length === 0) {
      return json({ checked: true, source: tickSource, signals: 0, promoted: 0 });
    }

    // Build fingerprints for dedup
    const fingerprints = await buildFingerprints(db);

    let promoted = 0;
    const signalDetails: Array<{ topic: string; action: string }> = [];

    for (const signal of signals) {
      const hash = await hashSignal(signal.topic);

      // Gate 1: Self-dedup — seen this signal in last 48h?
      const { data: existing } = await db
        .from("pinger_signals")
        .select("id")
        .eq("signal_hash", hash)
        .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (existing && existing.length > 0) {
        signalDetails.push({ topic: signal.topic, action: "skip_self_dedup" });
        continue;
      }

      // Gate 2: Queue/article dedup
      if (isDuplicate(signal.topic, fingerprints)) {
        signalDetails.push({ topic: signal.topic, action: "skip_article_dedup" });
        continue;
      }

      // Store the signal (always, for corroboration tracking)
      const { data: inserted } = await db.from("pinger_signals").insert({
        signal_hash: hash,
        topic: signal.topic,
        source: signal.source,
        urgency: signal.urgency,
        why_breaking: signal.why_breaking,
        raw_data: signal.raw_data || {},
      }).select("id").single();

      // Gate 3: Urgency + corroboration
      let shouldPromote = false;

      if (signal.urgency === "high") {
        // High urgency: promote immediately
        shouldPromote = true;
      } else {
        // Medium urgency: check for corroboration from a DIFFERENT source in last 60 min
        const { data: corroborating } = await db
          .from("pinger_signals")
          .select("id, topic")
          .neq("source", signal.source)
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .eq("promoted_to_queue", false);

        // Check if any recent signal from another source overlaps with this one
        if (corroborating && corroborating.length > 0) {
          const signalWords = extractFingerprint(signal.topic);
          for (const c of corroborating as Array<{ id: string; topic: string }>) {
            const cWords = extractFingerprint(c.topic);
            const overlap = [...signalWords].filter(w => cWords.has(w)).length;
            if (overlap >= 2 && signalWords.size > 0 && overlap / signalWords.size >= 0.3) {
              shouldPromote = true;
              // Also mark the corroborating signal as promoted
              await db.from("pinger_signals").update({ promoted_to_queue: true }).eq("id", c.id);
              break;
            }
          }
        }
      }

      if (shouldPromote) {
        const cat = classifyCategory(signal.topic + " " + signal.why_breaking) || null;
        const { data: queueEntry } = await db.from("topic_queue").insert({
          topic: signal.topic,
          category: cat,
          priority: signal.urgency === "high" ? 1 : 5,
          expedite: signal.urgency === "high",
          source: "breaking",
          notes: `PINGER ${signal.source}: ${signal.why_breaking} | Detected ${new Date().toISOString().split("T")[1].slice(0, 5)} UTC`,
          research_summary: signal.why_breaking,
        }).select("id").single();

        if (queueEntry && inserted) {
          await db.from("pinger_signals").update({
            promoted_to_queue: true,
            queue_id: queueEntry.id,
          }).eq("id", inserted.id);
        }

        // Add to fingerprints so other signals in this batch don't dupe
        fingerprints.push(extractFingerprint(signal.topic));
        promoted++;
        signalDetails.push({ topic: signal.topic, action: `promoted_${signal.urgency}` });
        console.log(`[Pinger] BREAKING: "${signal.topic}" (${signal.source}, ${signal.urgency}) → queued at P${signal.urgency === "high" ? 1 : 5}`);
      } else {
        signalDetails.push({ topic: signal.topic, action: "stored_awaiting_corroboration" });
      }
    }

    return json({
      checked: true,
      source: tickSource,
      signals: signals.length,
      promoted,
      details: signalDetails,
    });
  } catch (err: unknown) {
    return json({
      error: "Pinger error",
      detail: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
