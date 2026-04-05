import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, getExistingArticles, addOverheadCost } from "../_shared/db.ts";
import { VALID_CATEGORIES, classifyCategory, MODELS } from "../_shared/constants.ts";
import { gemini, grok } from "../_shared/api-clients.ts";
import { extractFingerprint, isDuplicate, buildFingerprints } from "../_shared/dedup.ts";
import { getScoutContext } from "../_shared/analytics.ts";
import type { ApiUsage } from "../_shared/types.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const db = supabase();

  try {
    let body: { scoutModel?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const scoutModel = (body.scoutModel as string) || "gemini";
    const { titles, categoryCounts } = await getExistingArticles(db);

    // Build dedup fingerprints from existing articles + queue + pipeline
    const fingerprints = await buildFingerprints(db);

    // Fetch active queue topics so scout AI knows what's already queued
    const { data: queuedTopics } = await db
      .from("topic_queue")
      .select("topic")
      .in("status", ["queued", "assigned", "in_progress"]);
    const queueTitles = (queuedTopics || []).map((q: { topic: string }) => q.topic);

    // Fetch recently rejected topics for editorial feedback loop
    const rejectCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rejectedTopics } = await db
      .from("topic_dedup_log")
      .select("topic_text, source")
      .gte("created_at", rejectCutoff)
      .in("source", ["deleted", "killed"])
      .limit(20);
    const rejectedList = (rejectedTopics || []).map((r: { topic_text: string; source: string }) =>
      `- ${r.topic_text} (${r.source})`
    );

    const underserved = Object.entries(categoryCounts).filter(([, c]) => (c as number) / (titles.length || 1) < 0.10).map(([cat]) => cat);
    const missing = VALID_CATEGORIES.filter(c => !categoryCounts[c]);
    const priorityCats = [...new Set([...underserved, ...missing])];

    // ── Shared prompt sections (used by all three scouts) ──

    const sharedFraming = `## TOPIC FRAMING (CRITICAL)
Frame topics as INVESTIGATIONS that follow money and evidence on ALL sides. The story is never "industry bad" or "institution right" — it's WHERE THE EVIDENCE LEADS when you trace funding on every side.
BAD: "Why Experts Say Seed Oils Are Safe" / "Seed Oils Are Killing You" / "Big Pharma Is Hiding the Cure" (uncritical deference to ANY authority)
GOOD: "Who Funds the Seed Oil Studies? A Funding Map of Both Sides" / "Statin Trials: Who Funded Them and What Independent Data Shows"`;

    const sharedFormat = `## FORMAT (for each topic)
- **Topic**: specific angle a 25-year-old would click on
- **Why now**: what happened in the LAST 7 DAYS that makes this timely? Cite a date, event, publication, or trend spike. If you cannot cite a specific recent event, DO NOT include this topic.
- **Search demand**: high/medium/low
- **Our angle**: what's the "holy shit" moment?
- **Category**: one of ${VALID_CATEGORIES.join(", ")}`;

    const sharedExclusions = `## ALREADY COVERED (${titles.length} articles — DO NOT suggest these or SIMILAR angles, even reworded):
${titles.slice(0, 80).map(t => `- ${t.split(" (")[0]}`).join("\n")}${titles.length > 80 ? `\n... and ${titles.length - 80} more articles.` : ""}
${queueTitles.length > 0 ? `\n## ALREADY IN QUEUE (${queueTitles.length} topics):\n${queueTitles.map(t => `- ${t}`).join("\n")}` : ""}
${rejectedList.length > 0 ? `\n## RECENTLY REJECTED BY EDITORS (do NOT re-suggest these angles):\n${rejectedList.join("\n")}` : ""}

Number them 1-20. Plain text, no JSON.`;

    const coverageGaps = priorityCats.length > 0
      ? `\n## COVERAGE GAPS\nUnderserved: ${priorityCats.join(", ")}. Frame for younger readers.`
      : "";

    // Performance feedback from editorial analytics (SQL-driven, zero AI cost)
    const performanceContext = await getScoutContext(db);

    // ── Scout-specific prompts — each has a distinct editorial mandate ──

    const scoutPrompts: Record<string, string> = {
      // GEMINI (6am UTC): Trending search + news — what people are actively searching for
      gemini: `You are the TRENDING DESK. Your job: find health stories people are ACTIVELY SEARCHING FOR or that just broke in the news. Use Google Search to find what's trending RIGHT NOW.

## YOUR MANDATE: What's happening THIS WEEK
Find 20 health topics where something SPECIFIC happened in the last 7 days:
- Study published in a major journal (NEJM, Lancet, JAMA, Nature, BMJ, Cell, Science, PNAS)
- FDA/EMA action (approval, warning, recall, advisory)
- Health story going viral on social media or mainstream news
- Google Trends spike for a health topic
- Policy change, outbreak, or health crisis update

## TOPIC MIX
- **At least 8 news-driven topics** — something happened this week that makes this timely
- **At least 5 high-search-volume everyday topics** — conditions millions search for (colds, allergies, back pain, headaches, bloating, UTIs, blood pressure, acne, period problems). Frame with our voice: what actually works vs what's marketing
- **Up to 7 trending cultural topics** — TikTok health debates, viral studies, Ozempic culture, supplement trends

## RECENCY TEST (MANDATORY)
For EVERY topic, you MUST be able to cite a specific event from the last 7 days. "This has always been interesting" is NOT a valid reason. If nothing newsworthy happened this week about a topic, do not include it.

${sharedFraming}
${sharedFormat}
${coverageGaps}
${performanceContext}
${sharedExclusions}`,

      // SONNET (2pm UTC): "Wait, really?" — belief-challenging stories from the evidence
      sonnet: `You are the INVESTIGATION DESK. Your job: find health stories where the primary evidence CONTRADICTS what people have been told — by institutions, influencers, supplement sellers, or wellness gurus. Use Google Search to find the latest.

## YOUR MANDATE: "Wait, really?" stories
Find 20 topics where recent evidence challenges conventional wisdom:
- Industry-funded studies that shaped guidelines but have been contradicted by independent research
- Supplement claims that got debunked (or validated) by new data
- Medical practices that continued for decades without good evidence
- Wellness trends where the science doesn't support the hype (OR where skeptics were wrong)
- Follow-the-money investigations: who profits from the current consensus?

## TOPIC MIX
- **At least 8 investigation/exposé topics** — pharma, food industry, supplement industry, insurance, medical device, wellness influencer funding trails
- **At least 5 "the evidence changed" topics** — where a recent study (last 30 days) contradicts what was previously believed
- **Up to 7 everyday health topics** — common conditions where standard advice is wrong or outdated (back pain, antibiotics, cold medicine, cholesterol thresholds, etc.)

## INVESTIGATION QUALITY TEST
Every investigation topic must answer: WHO PROFITS from the current consensus? If you can't name a specific financial incentive on at least one side, the topic isn't ready.

${sharedFraming}
${sharedFormat}
${coverageGaps}
${performanceContext}
${sharedExclusions}`,

      // GROK (10pm UTC): Contrarian — what's being debated, what's being hidden
      grok: `You are the CONTRARIAN DESK. Your job: find health stories that mainstream outlets WON'T cover — industry fraud, regulatory capture, uncomfortable truths, and debates where both sides have dirty hands. Use your X/Twitter access.

## YOUR MANDATE: What nobody else is publishing
Find 20 topics that challenge BOTH establishment AND alternative health narratives:
- Health controversies trending on X/Twitter with real scientific substance (not conspiracy noise)
- Industry fraud, regulatory capture, revolving door stories
- Cases where BOTH the mainstream AND contrarian positions are financially compromised
- Things young people are being lied to about by EVERYONE — institutions AND influencers
- Health debates where the real story is more nuanced than either side admits

## TOPIC MIX
- **At least 8 "both sides have dirty hands" topics** — trace funding on establishment AND alternative/contrarian side
- **At least 5 social media debate topics** — health arguments currently happening on X/Twitter/Reddit with substance behind the noise
- **Up to 7 uncomfortable truth topics** — things the health industry (broad: pharma, supplements, wellness, insurance, FDA) doesn't want examined

## CONTRARIAN QUALITY TEST
Every topic must challenge at least TWO authorities (not just "pharma bad"). If your topic only has one villain, dig deeper — the contrarian side usually has its own financial angle too.

${sharedFraming}
${sharedFormat}
${coverageGaps}
${performanceContext}
${sharedExclusions}`,
    };

    const scoutPrompt = scoutPrompts[scoutModel] || scoutPrompts.gemini;

    let rawFindings: string;
    let scoutCost: ApiUsage;

    if (scoutModel === "gemini") {
      // Gemini with Google Search grounding — best for real-time trending data
      const r = await gemini({ system: "You are a health editorial scout for a publication whose slogan is 'Evidence. Wherever it leads.' Read by smart, skeptical 20-35 year olds. Use Google Search to find what's TRENDING in health right now — TikTok health debates, viral studies, Reddit health threads, Google Trends spikes. PRIORITY: find stories where the primary evidence diverges from what authorities claim — whether those authorities are institutions, influencers, or contrarian doctors. Frame topics as INVESTIGATIONS that trace funding on ALL sides. When anyone — industry, government, or influencer — makes a health claim, the first question is: who funded the evidence behind it?", user: scoutPrompt, model: MODELS.SCOUT_GEMINI, maxTokens: 4000, temperature: 0.5, webSearch: true, timeout: 120000 }, "scout-gemini");
      rawFindings = r.text; scoutCost = r.usage;
    } else if (scoutModel === "grok") {
      // Grok — contrarian perspective, finds what mainstream outlets won't cover
      const r = await grok({ system: "You are a health scout for readers aged 20-35 who are skeptical of ALL authority — institutional and alternative. Use your X/Twitter access. PRIORITY: find where the PRIMARY EVIDENCE contradicts what people are being told — by institutions, influencers, supplement sellers, or wellness gurus. Find stories where money corrupts science ON EVERY SIDE: pharma-funded trials, industry-funded consensus, BUT ALSO supplement-seller-funded contrarian research, influencer-monetized health scares, and book-deal-driven anti-establishment narratives. The question is never 'who is the good guy' — it's 'where does the money trail lead on ALL sides?'", user: scoutPrompt, maxTokens: 4000, temperature: 0.5 }, "scout-grok");
      rawFindings = r.text; scoutCost = r.usage;
    } else {
      // "Sonnet" scout — now uses Gemini with search grounding (Sonnet web search costs $0.40+/call due to 120K+ input tokens)
      // Gemini search grounding gives the same quality at 1/10th the cost
      const r = await gemini({ system: "You are a health editorial scout for a magazine whose slogan is 'Evidence. Wherever it leads.' Find the 'wait, really?' stories — where the primary evidence contradicts what ANY authority claims. This includes: institutional consensus that's industry-funded, BUT ALSO contrarian narratives that are monetized by their promoters. The second-order insight: not just 'institutions lie' but 'everyone in health has a financial angle — institutions, influencers, supplement companies, book authors, wellness brands — and first-principles investigation means tracing the money on every side before deciding what the evidence actually shows.'", user: scoutPrompt, model: MODELS.SCOUT_GEMINI, maxTokens: 4000, temperature: 0.5, webSearch: true, timeout: 120000 }, "scout-sonnet");
      rawFindings = r.text; scoutCost = r.usage;
    }

    // Parse raw findings — flexible parser handles multiple formats from different models
    console.log(`[Scout] Raw output (first 500 chars): ${rawFindings.slice(0, 500)}`);

    const topics: Array<{ topic: string; category: string; why: string; whyNow: string; searchDemand: string }> = [];
    const lines = rawFindings.split("\n").filter(l => l.trim());
    let current: { topic: string; category: string; why: string; whyNow: string; searchDemand: string } | null = null;

    for (const line of lines) {
      // Match numbered lines: "1. ...", "1) ...", "**1.**...", "1: ..."
      const numbered = line.match(/^\*{0,2}\d+[\.\):\-]\*{0,2}\s*(.+)/);
      // Also match "**Topic**: ..." as a new topic start if preceded by a number pattern
      const topicLabel = line.match(/^\s*[-*]*\s*\*{0,2}Topic\*{0,2}\s*[:=]\s*(.+)/i);

      if (numbered || topicLabel) {
        if (current && current.topic) topics.push(current);
        const text = (numbered ? numbered[1] : topicLabel![1]).trim()
          .replace(/\*\*/g, "")
          .replace(/^\s*Topic\s*(?:Description)?\s*:?\s*/i, "")
          .replace(/^\s*[-\u2013\u2014]\s*/, "")
          .trim();
        if (text.length > 10) {
          current = { topic: text, category: "", why: "", whyNow: "", searchDemand: "" };
        }
      } else if (current) {
        const stripped = line.trim().replace(/\*\*/g, "");
        const catLabel = stripped.match(/(?:category|suggested\s*category)\s*[:=]\s*(.+)/i);
        const whyNowLabel = stripped.match(/(?:why\s*now)\s*[:=]\s*(.+)/i);
        const searchLabel = stripped.match(/(?:search\s*demand)\s*[:=]\s*(.+)/i);
        const angleLabel = stripped.match(/(?:our\s*angle|angle|holy\s*shit|viral)\s*[:=]\s*(.+)/i);
        if (catLabel && !current.category) {
          const catName = catLabel[1].trim().replace(/[."']/g, "");
          const match = VALID_CATEGORIES.find(c => catName.toLowerCase().includes(c.toLowerCase()));
          if (match) current.category = match;
        } else if (whyNowLabel && !current.whyNow) {
          current.whyNow = whyNowLabel[1].trim().slice(0, 200);
        } else if (searchLabel && !current.searchDemand) {
          current.searchDemand = searchLabel[1].trim().slice(0, 50);
        } else if (angleLabel && !current.why) {
          current.why = angleLabel[1].trim().slice(0, 200);
        } else if (!current.why && stripped.length > 20) {
          current.why = stripped.slice(0, 200);
        }
      }
    }
    if (current && current.topic) topics.push(current);
    console.log(`[Scout] Parsed ${topics.length} topics from ${lines.length} lines`);

    // ── Phase 1: Word-overlap dedup ──
    const wordDedupPassed: typeof topics = [];
    let wordDupes = 0;
    for (const t of topics) {
      if (isDuplicate(t.topic, fingerprints)) { wordDupes++; continue; }
      wordDedupPassed.push(t);
    }
    console.log(`[Scout] Word dedup: ${wordDupes} filtered, ${wordDedupPassed.length} passed`);

    // ── Phase 2: AI semantic dedup (Flash — cheap batch comparison) ──
    // Catches "same story, different words" that word overlap misses.
    let semanticFiltered = 0;
    let semanticPassed = wordDedupPassed;
    if (wordDedupPassed.length > 0) {
      try {
        // Build comparison list: recent articles + queue (compact format to stay cheap)
        const existingCompact = titles.slice(0, 100).map(t => t.split(" (")[0]); // article titles
        const queueCompact = queueTitles.slice(0, 50); // queue topics
        const compareList = [...existingCompact, ...queueCompact];

        const candidateList = wordDedupPassed.map((t, i) => `${i + 1}. ${t.topic}`).join("\n");
        const { text: dedupResult, usage: dedupUsage } = await gemini({
          system: `You are a semantic dedup filter for a health editorial queue. Given a list of EXISTING articles/topics and a list of CANDIDATE topics, identify which candidates cover substantially the same story as an existing item — even if worded differently. "Tylenol for back pain" = "Acetaminophen efficacy for lumbar pain". "Seed oil debate" = "Are vegetable oils bad". Be aggressive about filtering — if in doubt, mark as duplicate.`,
          user: `EXISTING (${compareList.length} items):\n${compareList.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nCANDIDATES:\n${candidateList}\n\nReturn ONLY a JSON array of candidate numbers that are NOVEL (not duplicates of any existing item). Example: [1, 3, 7]\nIf all are duplicates: []\nNo explanation, just the array.`,
          model: MODELS.DEFAULT_GEMINI, // Flash — cheapest
          maxTokens: 200,
          temperature: 0.1,
          webSearch: false,
        }, "scout-semantic-dedup");

        // Parse the novel indices
        const novelIndices = new Set<number>();
        try {
          const parsed = JSON.parse(dedupResult.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim());
          if (Array.isArray(parsed)) {
            for (const idx of parsed) {
              if (typeof idx === "number" && idx >= 1 && idx <= wordDedupPassed.length) {
                novelIndices.add(idx);
              }
            }
          }
        } catch {
          // If parsing fails, let all candidates through (fail-open)
          console.log(`[Scout] Semantic dedup parse failed, passing all candidates`);
          for (let i = 1; i <= wordDedupPassed.length; i++) novelIndices.add(i);
        }

        semanticPassed = wordDedupPassed.filter((_, i) => novelIndices.has(i + 1));
        semanticFiltered = wordDedupPassed.length - semanticPassed.length;
        console.log(`[Scout] Semantic dedup: ${semanticFiltered} filtered, ${semanticPassed.length} novel`);

        // Add semantic dedup cost to scout cost
        scoutCost.costUsd += dedupUsage.costUsd;
        scoutCost.inputTokens += dedupUsage.inputTokens;
        scoutCost.outputTokens += dedupUsage.outputTokens;
      } catch (err) {
        // Fail open — if semantic dedup crashes, proceed with word-dedup results
        console.error(`[Scout] Semantic dedup failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    // Dedup and insert into queue
    let added = 0;
    const dupes = wordDupes + semanticFiltered;
    for (const t of semanticPassed) {
      // Classify category: explicit label → keyword classifier → null
      const cat = t.category
        || classifyCategory(t.topic + " " + (t.why || ""))
        || null;
      // Priority boost for high search demand topics
      const demandLower = (t.searchDemand || "").toLowerCase();
      const priorityBoost = demandLower.includes("high") ? -20 : demandLower.includes("medium") ? -10 : 0;
      await db.from("topic_queue").insert({
        topic: t.topic,
        category: cat,
        notes: `${scoutModel} scout${t.whyNow ? ` | Why now: ${t.whyNow}` : ""}${t.searchDemand ? ` | Search: ${t.searchDemand}` : ""}${t.why ? ` | ${t.why}` : ""}`,
        priority: 50 + priorityBoost, // lower number = higher priority
        source: "trending",
        research_summary: t.whyNow || t.why || null,
      });
      // Add to fingerprints so subsequent topics in same batch don't dupe each other
      fingerprints.push(extractFingerprint(t.topic));
      added++;
    }

    const { count: queueCount } = await db.from("topic_queue").select("*", { count: "exact", head: true }).eq("status", "queued");

    // Log scout cost to daily overhead
    await addOverheadCost(db, scoutCost);

    return json({
      success: true,
      stage: "scout",
      scoutModel,
      found: topics.length,
      added,
      duplicatesFiltered: dupes,
      queueSize: queueCount || 0,
      cost: scoutCost.costUsd,
      message: `${scoutModel} scout: found ${topics.length}, added ${added} to queue (${dupes} dupes filtered). Queue: ${queueCount || 0} topics.`,
    });
  } catch (err: unknown) {
    return json({
      error: "An internal error occurred",
      detail: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
