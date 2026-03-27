import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addCostToLog, getExistingArticles, safeStage, dispatchStage } from "../_shared/db.ts";
import { gemini, claude, parseClaudeJSON } from "../_shared/api-clients.ts";
import { RESEARCH_TIMEOUT, MODELS } from "../_shared/constants.ts";
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
- **Retracted or corrected studies** must never be cited as current evidence
- If the LATEST evidence contradicts the mainstream consensus, report the latest evidence. Do not default to the older consensus just because it's more widely known.

## FOLLOW THE MONEY (CRITICAL — READ FIRST)
**Industry-funded studies are NOT neutral evidence.** When researching ANY health topic:
1. **Identify who funded the key studies.** If the funder profits from the conclusion, flag it prominently. A study funded by Unilever showing seed oils are safe is not the same as an independent study showing the same thing.
2. **Check who funds the "consensus" organizations.** The AHA, AND, ADA, and many professional bodies receive significant funding from food, pharma, and supplement industries. Their position statements reflect their funders. Note this when citing their recommendations.
3. **Industry-funded meta-analyses are the most dangerous form of evidence manipulation.** They use study selection, endpoint manipulation, and statistical framing to produce "overwhelming evidence" for their funder's position. Always check who funded the meta-analysis, not just the individual studies it includes.
4. **When industry consensus and independent research diverge, INVESTIGATE THE DIVERGENCE.** This is where the story is. Do not default to the industry-backed consensus because it appears more "official."
5. **Your training data has an establishment bias.** AI models are trained on web data that over-represents institutional positions, industry press releases, and mainstream medical consensus. You must actively counteract this by seeking out independent researchers, whistleblowers, and funding-conflict analyses.

## KNOWN INDUSTRY-CAPTURED CONSENSUS — investigate, don't repeat
These are areas where the mainstream "scientific consensus" is substantially shaped by industry funding. Do NOT repeat the consensus position as fact. Instead, investigate BOTH sides and note the funding:
- **Seed oils are safe/heart-healthy** — The "replace saturated fat with polyunsaturated vegetable oils" consensus is heavily funded by soybean, canola, and corn oil industries (Cargill, ADM, Bunge). The AHA receives millions from these companies. Independent research raises serious concerns: modern diets contain 10-20x more omega-6 linoleic acid than ancestral diets, seed oil consumption correlates with inflammatory disease, industrial processing creates oxidized lipids and trans fats. The "ratio doesn't matter" talking point is itself industry-funded. ALWAYS report who funded the studies on both sides.
- **"Saturated fat causes heart disease"** — The original Keys hypothesis has been substantially revised. Context, source (grass-fed vs feedlot), and overall dietary pattern matter more than the saturated fat label. Many cultures with high saturated fat intake have low CVD. The sugar industry funded research to shift blame to fat.
- **Statin benefits for primary prevention** — Heavily promoted by pharma (statins are a $20B+ market). Benefits for primary prevention (no prior heart event) are much smaller than industry marketing suggests. NNT (number needed to treat) is often 100+ for primary prevention. Side effects (myopathy, diabetes risk, cognitive effects) are systematically underreported in pharma-funded trials.
- **"Moderate alcohol is heart-healthy"** — The "J-curve" was sick-quitter bias in observational studies. Large Mendelian randomization studies and the Global Burden of Disease data show no safe level. The alcohol industry funded decades of "moderate drinking" research.
- **"Breakfast is the most important meal of the day"** — Originated from Kellogg's-funded research. Intermittent fasting evidence directly contradicts this.
- **BMI as a reliable health metric** — Insurance industry invention. Poor proxy for metabolic health; waist-to-hip ratio and body composition are far better predictors.
- **Multivitamin supplements for general health** — Most large meta-analyses show no benefit for well-nourished populations. Supplement industry ($50B+) funds studies designed to show marginal benefit.
- **Generic probiotic supplements** — Strain-specific evidence only. Most commercial products lack evidence for their specific formulations. The probiotic industry funds almost all probiotic research.
- **Antioxidant supplements** — Several large RCTs show no benefit or harm. The "oxidative stress" theory of aging is far more nuanced than supplement marketing suggests.
- **"Detox" and "cleanse" products** — The liver and kidneys handle detoxification. No supplement improves on healthy organ function.
- **Chemical sunscreen safety** — UV protection is important, but chemical sunscreen ingredients (oxybenzone, octinoxate) have documented endocrine-disrupting properties. The sunscreen industry lobbies against mineral-only alternatives. Vitamin D deficiency from blanket sun avoidance has real costs.
- **Fluoride in water** — The "safe and effective" consensus is maintained by dental industry lobbying. Recent NTP review and large cohort studies link fluoride exposure to neurodevelopmental effects in children. This is actively debated in toxicology, not settled science.

## ANTI-DOGMA PRINCIPLE
When you research a topic and find that the "scientific consensus" is:
1. Funded primarily by the industry that profits from it
2. Promoted by organizations that receive industry funding
3. Contradicted by independent researchers who don't receive industry funding
4. Defended with ad hominem attacks on critics rather than evidence

...then the story IS the funding conflict. Report it as such. Do not side with the consensus just because it's the consensus. "Evidence. Wherever it leads" — even when it leads to uncomfortable conclusions about institutions.

## Output Format
Return ONLY valid JSON (no code fences, no explanation):
{
  "candidates": [
    {
      "rank": 1,
      "topic": "The specific topic/angle",
      "headline_draft": "Working headline — max 10 words, one sentence, no two-part kickers",
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

## CRITICAL RULES
1. Prioritize the LATEST evidence (2023-2026). Health science is full of outdated dogma. If a recent meta-analysis contradicts older consensus, report the newer findings.
2. **ALWAYS note study funding sources.** For EVERY study you cite, identify who funded it. A Unilever-funded study on seed oils, a Pfizer-funded statin trial, or a Kellogg's-funded breakfast study is NOT independent evidence. Flag it.
3. **If the topic questions an industry or its products, INVESTIGATE THAT QUESTION.** Do not reflexively defend the industry's position. If the topic is "Seed oils are harmful" — your job is to find the evidence FOR and AGAINST that claim, with funding sources noted on both sides. Do not frame the investigation as "debunking" the question.
4. **Your training data has an establishment bias.** AI models over-represent institutional positions and industry-friendly research. Actively seek out independent researchers, critics, and funding-conflict analyses.
5. **When "scientific consensus" is funded by the industry that profits from it, the consensus is suspect.** Report the funding conflict as a key finding. The AHA, AND, and many professional bodies receive millions from food and pharma companies — their position statements are not neutral.
6. Never rely on "conventional wisdom" — verify it against current, independently-funded data.
7. **When the topic implies industry wrongdoing or capture, your research MUST include:** (a) searching for "[industry] funding conflict of interest" and "[product] independent research critics", (b) identifying which professional bodies receive funding from the industry in question, (c) finding researchers who have published AGAINST the consensus and what evidence they cite, (d) tracing the money trail from industry to consensus organizations to policy. Do NOT present the industry-funded consensus as "the evidence" — present it as "the industry-funded position" and contrast with independent findings.
8. **FLIP THE DEFAULT for industry-questioning topics.** If the topic questions whether an industry product is harmful, your DEFAULT framing should be investigative skepticism of the industry — NOT defense of their product. Present the evidence, but lead with the funding conflicts and independent concerns, not with industry-funded reassurances.

## Output Format
Return ONLY valid JSON (no code fences, no explanation):
{
  "topic": "The specific topic as researched",
  "headline_draft": "Working headline — max 10 words, one sentence, no two-part kickers",
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
    const body = await req.json();
    const logId = body.logId as string;
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();

    // chain_dispatch() only sends {logId} — read topic/source from the log entry
    // when not provided in the request body (produce-topic saves these to the DB before dispatching)
    // queue_id is now a proper column on daily_article_log — no need to pass it through research_data
    let topic = body.topic as string | undefined;
    let source = body.source as string | undefined;

    if (!topic) {
      const { data: logMeta } = await db
        .from("daily_article_log")
        .select("topic, source")
        .eq("id", logId)
        .maybeSingle();
      if (logMeta?.topic) {
        topic = logMeta.topic;
        source = source || logMeta.source || undefined;
        console.log(`[Research] Read topic from DB: "${topic}" (source: ${source})`);
      }
    }

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
            model: MODELS.RESEARCH_PRIMARY,
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
            model: MODELS.RESEARCH_FALLBACK,
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
      // Reset queue item back to 'queued' so it can be retried
      if (topic) {
        await db.from("topic_queue")
          .update({ status: "queued" })
          .eq("status", "in_progress")
          .ilike("topic", `%${topic.slice(0, 40)}%`);
        console.log(`[Research] Failed — reset queue item for "${topic}" back to queued`);
      }
      return json({ error: stageResult.error, logId }, 500);
    }

    // Chain-dispatch: fire editor brief immediately (no 5-min cron wait)
    await dispatchStage("stage-editor", logId);
    return json({ success: true, logId, status: "research_done" });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
