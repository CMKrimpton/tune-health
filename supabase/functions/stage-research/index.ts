import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addCostToLog, getExistingArticles, safeStage, dispatchStage } from "../_shared/db.ts";
import { gemini, claude, grok, parseClaudeJSON } from "../_shared/api-clients.ts";
import { RESEARCH_TIMEOUT, RESEARCH_PARALLEL_TIMEOUT, MODELS } from "../_shared/constants.ts";
import { todayISO } from "../_shared/astro.ts";
import type { ApiUsage, ApiResult } from "../_shared/types.ts";

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

## FUNDING AUDIT PROTOCOL (CRITICAL — apply to EVERY source on EVERY side)
For EVERY study, claim, expert, or organization you cite — on ANY side of the debate:
1. **Who funded this research?** Name the funder. If the funder profits from the conclusion (whether that's a pharma company, a supplement seller, a food manufacturer, or a contrarian author selling books), flag it.
2. **Who funds the organization?** Professional bodies (AHA, AND, ADA), think tanks, advocacy groups, and "independent" institutes all have funders. Name them. This applies equally to institutional organizations and to contrarian/alternative health organizations.
3. **Who funded the meta-analysis?** Meta-analyses can be designed to produce predetermined conclusions through study selection. Check the funder of the synthesis, not just the individual studies.
4. **Does the person citing this evidence have a financial interest?** Researchers, doctors, influencers, authors, supplement companies, food companies, pharma companies — anyone can have a conflict. Disclose conflicts on ALL sides.
5. **Does the contrarian have conflicts too?** Independent researchers sell books, supplements, coaching, courses, and speaking fees. A doctor who built a brand on anti-statin content has a financial incentive to maintain that position, just as a pharma-funded cardiologist has an incentive to defend statins. Apply the same scrutiny to dissenting voices as to institutional ones.

## FIRST-PRINCIPLES INVESTIGATION METHOD
Do NOT start from what any institution or critic CLAIMS. Start from:
1. **What does the primary data show?** Find the actual studies — sample sizes, effect sizes, confidence intervals, dose-response curves, replication status.
2. **What is the biological mechanism?** Does the proposed mechanism make sense at the molecular/cellular level? Is it demonstrated in humans, or only in vitro/animal models?
3. **What is the quality of the evidence?** Large pre-registered RCTs > observational cohorts > case reports > expert opinion > anecdote. Apply this hierarchy to ALL sides equally.
4. **Where do the funding trails lead?** Map who funded the key studies on every side. When industry-funded and independently-funded research diverge, the divergence itself is the story — but investigate WHY they diverge rather than assuming one side is right.
5. **What would change your mind?** For each position, identify what evidence would falsify it. If a position is unfalsifiable, flag that — whether it comes from an institution or a critic.

## EVIDENCE INTEGRITY (applies to ALL sources)
- A claim repeated by many institutions is not stronger if they all cite the same original study
- A contrarian claim repeated across social media is not stronger if it all traces to one author
- "Everyone knows" is not evidence. "The establishment says" is not evidence. "Independent researchers say" is not evidence. The DATA is evidence
- When the "scientific consensus" is funded by the industry that profits from it, that is worth investigating. When the "contrarian consensus" is funded by people who profit from the counter-narrative, that is equally worth investigating
- The goal is not to defend or attack any institution. The goal is to follow the primary evidence and disclose who has financial stakes in each interpretation

## NO HEDGING — ABSOLUTE RULE
Do NOT pre-emptively defend any institution, industry, practice, or product. NEVER write hedging formulas like:
- "The story isn't that X is a fraud..."
- "This doesn't mean X is bad/wrong/useless..."
- "To be clear, X still has value..."
- "It's important to note that X is still recommended..."
These defensive framings protect incumbents. They signal to the editor and writer that the research agent is editorializing instead of reporting evidence.
**Your job is to report what the evidence shows — not to manage the reader's reaction.** If the evidence is damning, report it as damning. If it's mixed, report it as mixed. If it vindicates the mainstream view, report that. But NEVER soften findings with pre-emptive institutional defense. The writer and editor will handle tone. You handle evidence.

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
      "studies": [{ "title": "exact paper title", "journal": "...", "year": "...", "doi": "10.xxxx/... (if available)", "finding": "..." }],
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
2. **ALWAYS note study funding sources — on ALL sides.** For EVERY study you cite, identify who funded it. A Unilever-funded study on seed oils is not independent evidence. Neither is a study cited by a doctor who sells anti-seed-oil supplements. Flag conflicts on every side.
3. **Investigate the assigned topic honestly.** Find the evidence FOR and AGAINST. Do not reflexively defend any position — institutional or contrarian. If the topic questions an industry, investigate the question. If the evidence supports the industry, report that too. Follow the data.
4. **Your training data has biases.** AI models over-represent the most-published narrative, which is often (but not always) the institutional position. Be aware of this, but do not overcorrect by assuming the contrarian position is right by default. Seek out independent researchers on all sides.
5. **Trace funding on all sides.** Professional bodies (AHA, AND, ADA) receive industry funding — note it. But contrarian voices also have financial interests (book sales, supplement lines, paid speaking, coaching programs, social media monetization). Apply the same funding scrutiny to critics as to institutions.
6. **Steel-man before criticizing.** Before presenting evidence against any position (institutional OR contrarian), present that position in its strongest, most honest form. Then test it against the evidence.
7. **The divergence IS the story.** When industry-funded and independently-funded research disagree, investigate WHY. Don't assume either side is right — find the methodological differences, the study design choices, the endpoint selections that produce different conclusions.
8. **Start from the mechanism, not the conclusion.** What does the biology actually show at the molecular/cellular level? What do dose-response curves look like? What is the replication status? Build from primary evidence upward rather than from any authority's conclusion downward.
9. **NO HEDGING.** Do NOT pre-emptively defend any institution, industry, or product. Never write "the story isn't that X is a fraud" or "this doesn't mean X is bad" or "to be clear, X still has value." These defensive framings protect incumbents. Report what the evidence shows. If it's damning, say so. If it's mixed, say so. Do not soften findings with pre-emptive institutional defense — the writer handles tone, you handle evidence.

## Output Format
Return ONLY valid JSON (no code fences, no explanation):
{
  "topic": "The specific topic as researched",
  "headline_draft": "Working headline — max 10 words, one sentence, no two-part kickers",
  "why": "1-2 sentences on why this topic is worth covering",
  "category": "One of: Neuroscience, Mental Health, Longevity, Clinical Evidence, Environmental Health, Nutrition, Fitness, Sleep Science, Pharmacology",
  "keyFindings": ["Finding 1...", "Finding 2..."],
  "studies": [{ "title": "exact paper title", "journal": "...", "year": "...", "doi": "10.xxxx/... (if available)", "finding": "..." }],
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
        // ── TRIANGULATED RESEARCH ──────────────────────────────────────
        // Three models in parallel, each with a different investigative lens.
        // No single model's training bias can capture the framing.

        const existingList = titles.map((t) => `- ${t}`).join("\n");
        const jsonInstruction = `\n\nCRITICAL: Return ONLY a valid JSON object. No markdown, no explanation. Just the JSON object starting with { and ending with }.\nReturn this structure: {"topic":"...","headline_draft":"...","why":"...","category":"...","keyFindings":["..."],"studies":[{"title":"...","journal":"...","year":"...","finding":"..."}],"counterArguments":["..."],"mechanism":"...","expertQuotes":["..."],"statistics":["..."]}`;

        // 1. INSTITUTIONAL LENS — Gemini + Google Search: what do official bodies and consensus science say?
        const establishmentPrompt = `You are a research agent mapping the INSTITUTIONAL POSITION on a topic. Report what regulatory bodies, professional associations, consensus reviews, and major media say. Be accurate and complete. For each source: name who funds or sponsors it. This is one perspective — report it honestly without endorsing or dismissing it.

Today's date: ${today}. Topic: ${topic}

Existing articles (avoid duplicates): ${existingList}

Find: official positions, consensus reviews, major news coverage, institutional statements. For EACH source, note: who funds this organization? Who funded this study? Does the funder profit from the conclusion?${jsonInstruction}`;

        // 2. DISSENTING LENS — Grok: who disagrees, and what is their evidence?
        const contrarianPrompt = `You are a research agent mapping the DISSENTING POSITIONS on a topic. Find researchers, clinicians, and investigators who disagree with the mainstream position. Report their evidence accurately and completely — but apply the same scrutiny to them as to institutions. Dissenters can also have financial conflicts (book sales, supplement lines, paid speaking, social media monetization, coaching programs). Note these conflicts just as you would note industry funding.

Today's date: ${today}. Topic: ${topic}

Find: dissenting researchers and their evidence, court rulings, whistleblower accounts, financial conflicts in the mainstream position AND in the dissenting position. For each dissenting voice: what evidence do they cite? What are THEIR financial interests? Has their evidence been tested or replicated?${jsonInstruction}`;

        // 3. PRIMARY EVIDENCE LENS — Claude + web search: the actual data, mechanisms, and funding map
        const academicPrompt = `You are a research agent finding the PRIMARY EVIDENCE on a topic — not what any authority claims, but what the data itself shows. Find the actual studies, their methodologies, sample sizes, effect sizes, confidence intervals, and replication status. Trace funding on ALL sides. Your job is to build a funding map: for every major claim in this debate, who funded the research behind it?

Today's date: ${today}. Topic: ${topic}

Existing articles (avoid duplicates): ${existingList}

Find: primary studies (sample size, effect size, CI), replication attempts, funding sources for EVERY major study on EVERY side, dose-response data, mechanistic evidence. Build a funding map: claim → study → funder → financial interest.${jsonInstruction}`;

        // Fire all three in parallel — Promise.allSettled so one failure doesn't block the others
        console.log(`[Research] Triangulated research for "${topic}" — firing Gemini + Grok + Claude in parallel`);
        const [establishmentResult, contrarianResult, academicResult] = await Promise.allSettled([
          gemini({
            system: DIRECTED_RESEARCH_PROMPT,
            user: establishmentPrompt,
            model: MODELS.RESEARCH_PRIMARY,
            maxTokens: 4000,
            temperature: 0.35,
            webSearch: true,
            timeout: RESEARCH_PARALLEL_TIMEOUT,
          }, "research-establishment"),
          grok({
            system: DIRECTED_RESEARCH_PROMPT,
            user: contrarianPrompt,
            maxTokens: 6000,
            temperature: 0.5,
            timeout: RESEARCH_PARALLEL_TIMEOUT,
          }, "research-contrarian"),
          claude({
            system: DIRECTED_RESEARCH_PROMPT,
            user: academicPrompt,
            model: MODELS.RESEARCH_FALLBACK,
            maxTokens: 4000,
            webSearch: true,
            maxSearches: 5,
            timeout: RESEARCH_PARALLEL_TIMEOUT,
          }),
        ]);

        // Parse each result — extract what we can from each model
        function parseResearchResult(result: PromiseSettledResult<ApiResult>, label: string): { data: Record<string, unknown> | null; usage: ApiUsage | null } {
          if (result.status === "rejected") {
            console.warn(`[Research] ${label} failed: ${result.reason instanceof Error ? result.reason.message.slice(0, 80) : "unknown"}`);
            return { data: null, usage: null };
          }
          try {
            const parsed = parseClaudeJSON(result.value.text) as Record<string, unknown>;
            return { data: parsed, usage: result.value.usage };
          } catch {
            console.warn(`[Research] ${label} returned invalid JSON, extracting from plain text...`);
            const lines = result.value.text.split("\n").filter((l: string) => l.trim().length > 10);
            return {
              data: {
                keyFindings: lines.slice(0, 8).map((l: string) => l.replace(/^[\d\.\-\*]+\s*/, "").trim()),
                studies: [],
                counterArguments: [],
              },
              usage: result.value.usage,
            };
          }
        }

        const establishment = parseResearchResult(establishmentResult, "Establishment (Gemini)");
        const contrarian = parseResearchResult(contrarianResult, "Contrarian (Grok)");
        const academic = parseResearchResult(academicResult, "Academic (Claude)");

        // Log costs for each successful call
        if (establishment.usage) await addCostToLog(db, logId, establishment.usage);
        if (contrarian.usage) await addCostToLog(db, logId, contrarian.usage);
        if (academic.usage) await addCostToLog(db, logId, academic.usage);

        const succeeded = [establishment, contrarian, academic].filter(r => r.data).length;
        console.log(`[Research] ${succeeded}/3 models returned results`);

        if (succeeded === 0) {
          throw new Error("All three research models failed — no data to work with");
        }

        // Merge results — concatenate findings from all perspectives, clearly attributed
        const e = establishment.data || {};
        const c = contrarian.data || {};
        const a = academic.data || {};

        // Primary evidence first, then dissenting, then institutional —
        // lead with data, not with any authority's interpretation
        research = {
          topic: (a.topic as string) || (e.topic as string) || (c.topic as string) || topic,
          headline_draft: (a.headline_draft as string) || (c.headline_draft as string) || (e.headline_draft as string) || topic,
          why: (a.why as string) || (c.why as string) || (e.why as string) || "",
          category: (e.category as string) || (a.category as string) || (c.category as string) || "",
          keyFindings: [
            ...((a.keyFindings as string[]) || []).map((f: string) => `[Primary Evidence] ${f}`),
            ...((c.keyFindings as string[]) || []).map((f: string) => `[Dissenting] ${f}`),
            ...((e.keyFindings as string[]) || []).map((f: string) => `[Institutional] ${f}`),
          ],
          studies: [
            ...((a.studies as unknown[]) || []),
            ...((c.studies as unknown[]) || []),
            ...((e.studies as unknown[]) || []),
          ],
          counterArguments: [
            ...((a.counterArguments as string[]) || []),
            ...((c.counterArguments as string[]) || []),
            ...((e.counterArguments as string[]) || []),
          ],
          mechanism: (a.mechanism as string) || (c.mechanism as string) || (e.mechanism as string) || "",
          expertQuotes: [
            ...((a.expertQuotes as string[]) || []),
            ...((c.expertQuotes as string[]) || []),
            ...((e.expertQuotes as string[]) || []),
          ],
          statistics: [
            ...((a.statistics as string[]) || []),
            ...((c.statistics as string[]) || []),
            ...((e.statistics as string[]) || []),
          ],
          // Preserve raw per-model output so editor/writer can see where each finding came from
          _researchSources: {
            establishment: { model: MODELS.RESEARCH_PRIMARY, ...(establishment.data || {}) },
            contrarian: { model: MODELS.INDEPENDENCE, ...(contrarian.data || {}) },
            academic: { model: MODELS.RESEARCH_FALLBACK, ...(academic.data || {}) },
          },
          _fromQueue: true,
          _queueSource: source || "manual",
        };
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
