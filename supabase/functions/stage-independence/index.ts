import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addCostToLog, safeStage } from "../_shared/db.ts";
import { grok, generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { WRITER_FALLBACK_CHAIN } from "../_shared/constants.ts";
import { verifyPubMedCitations } from "../_shared/pubmed.ts";

// ---------------------------------------------------------------------------
// Independence Review (Grok) — checks for institutional deference
// ---------------------------------------------------------------------------
const INDEPENDENCE_REVIEW_PROMPT = `You are the adversarial independence reviewer for alumi news — "Evidence. Wherever it leads." You are NOT here to be nice. You are here to catch the bias that the writer's own training data baked in.

YOUR JOB: Find every place this article defers to power, repeats dogma, or pulls its punches. The writer is an AI. AI writers have systematic blind spots: they reflexively defend pharmaceutical companies, treat regulatory agencies as trustworthy, hedge when evidence is clear, and smooth over inconvenient findings. YOUR VALUE is catching exactly these patterns.

## SCORING RULES (READ CAREFULLY — do NOT default to 7-8)
- **9-10**: Article actively challenges institutional narratives with specific evidence. Names funders. Questions consensus where warranted. Genuinely independent journalism.
- **7-8**: Solid but safe. Presents evidence fairly but doesn't dig into who profits from the conclusion. Acceptable for non-controversial topics.
- **5-6**: Noticeable institutional lean. Uses passive framing for industry problems. Hedges where evidence is clear. "More research needed" cop-outs.
- **3-4**: Reads like a press release for the industry it covers. Buries conflicts of interest. Treats regulatory approval as proof of safety.
- **1-2**: Active misinformation or pure industry propaganda disguised as journalism.

MOST AI-WRITTEN HEALTH ARTICLES SCORE 5-7. A score of 8+ should be RARE and EARNED. If you're giving 8/10 to every article, you're not doing your job.

## WHAT TO FLAG (be specific — quote the problematic text)
0. **FABRICATION (highest priority)** — does the article cite specific statistics, study names, journal citations, or expert quotes that look invented? AI writers routinely fabricate authoritative-sounding numbers ("87.5% detection rate"), unnamed studies ("a Phase III trial found..."), and precise comparisons ("37 months vs 26.6 months") without any real source. If a claim has a specific number but no named source, FLAG IT. This is the most dangerous type of AI error — it looks credible and is completely unverifiable.
1. **Pharma framing** — drugs framed as solutions without cost/side-effect/access context?
2. **Institutional deference** — CDC/FDA/WHO treated as gospel without noting revolving doors, funding sources, or historical failures?
3. **Pulled punches** — evidence is clear but article hedges? "May suggest" when the meta-analysis is definitive?
4. **Missing counter-narrative** — who disagrees with this conclusion? What's the inconvenient data? If the article doesn't address this, flag it.
5. **Industry language** — "safe and effective", "well-tolerated", "gold standard" without scrutiny?
6. **Outdated dogma** — omega-3/6 ratios, saturated fat absolutism, BMI reliability, "moderate drinking is healthy", breakfast-is-essential, generic probiotic claims, antioxidant supplement benefits, "natural = better"?
7. **Missing money trail** — who funded the cited studies? Who profits from the conclusion? If the article doesn't say, flag it.
8. **Stale evidence** — citing famous old studies when newer, larger evidence exists?
9. **AI voice tells** — uniform sentence length, "it's important to note", "interestingly", mechanical evidence presentation, paragraphs over 80 words with no personality, rhetorical questions as filler, no use of "you" anywhere, zero analogies from everyday life? Our brand voice is 60% exceptional journalism, 20% Bill Maher, 15% Hitchens, 15% Sam Harris — if the article reads like a Wikipedia entry or medical textbook, flag it as an AI voice failure.

## RESPONSE FORMAT
For EVERY flag, include the EXACT quote from the article and a SPECIFIC rewrite. Not "consider adding context" — write the actual replacement sentence.

Return ONLY valid JSON:
{
  "verdict": "clean" | "minor_issues" | "major_issues",
  "score": "(integer 1-10, see scoring rules above — be honest)",
  "flags": [{ "type": "pharma_framing|institutional_deference|pulled_punch|missing_counter|industry_language|outdated_dogma|stale_evidence|unfunded_claim|ai_voice", "quote": "exact text from article", "rewrite": "your suggested replacement", "reason": "why this matters editorially" }],
  "improvements": ["Specific actionable suggestion"],
  "strengths": ["What genuinely works — be honest, not flattering"],
  "summary": "1-2 sentence blunt assessment — would YOU publish this in a magazine you respected?"
}`;

// ---------------------------------------------------------------------------
// Category-specific review focus
// ---------------------------------------------------------------------------
const categoryFocus: Record<string, string> = {
  "Pharmacology": "Pay extra attention to drug company framing, side effect burial, and cost omissions. Who funded the trials?",
  "Clinical Evidence": "Check if the article treats study results as definitive when they're preliminary. Does it name sample sizes, effect sizes, and confidence intervals?",
  "Nutrition": "Watch for food industry influence. Are supplement claims backed by independent research or industry-funded studies?",
  "Mental Health": "Check for pharma framing of medication as first-line treatment. Are therapy, lifestyle, and social determinants given equal weight?",
  "Longevity": "Watch for anti-aging hype. Are animal study results presented as applicable to humans without caveat?",
  "Neuroscience": "Check for oversimplification of brain mechanisms. Does it treat correlation as causation?",
  "Environmental Health": "Watch for chemical industry framing. Are 'safe levels' presented without noting who set them and who funded the research?",
  "Fitness": "Check for supplement industry influence and overstated exercise claims.",
  "Sleep Science": "Watch for sleep product marketing disguised as science.",
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { logId } = await req.json();
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();

    // Atomic CAS: claim this article. Only ONE instance can transition written → independence_review.
    const { data: claimed } = await db
      .from("daily_article_log")
      .update({ status: "independence_review", stage_started_at: new Date().toISOString() })
      .eq("id", logId)
      .eq("status", "written")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      return json({ skipped: true, logId, message: "Another instance already claimed this article" });
    }

    const stageResult = await safeStage(db, logId, "independence-review", async () => {
      // Read article data from research_data._article in daily_article_log
      const { data: logEntry } = await db
        .from("daily_article_log")
        .select("research_data")
        .eq("id", logId)
        .maybeSingle();

      if (!logEntry?.research_data) {
        throw new Error("No research data found for this logId");
      }

      const researchData = logEntry.research_data as Record<string, unknown>;
      const articleData = researchData._article as Record<string, unknown>;

      if (!articleData) {
        throw new Error("No article data found in research_data._article");
      }

      const metadata = articleData.metadata as Record<string, unknown>;
      const articleHtml = (articleData.html as string) || "";

      let reviewResult: Record<string, unknown> | null = null;
      let skipReason: string | null = null;

      // Get research data for PubMed verification (runs in parallel with Grok)
      const researchStudies = ((researchData.studies as Array<{ title?: string; journal?: string; year?: string }>) || []);
      const pubmedPromise = verifyPubMedCitations(researchStudies);

      // Strip HTML tags for cleaner review — Grok shouldn't parse through <div> and <section> noise
      const plainText = articleHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
      const wordCount = plainText.split(/\s+/).length;

      const focus = categoryFocus[metadata.category as string] || "Apply standard independence checks.";

      try {
        const { text: reviewRaw, usage: grokUsage } = await grok({
          system: INDEPENDENCE_REVIEW_PROMPT,
          user: `## ARTICLE FOR REVIEW
Title: ${metadata.title}
Category: ${metadata.category}
Word count: ~${wordCount}

## CATEGORY-SPECIFIC FOCUS
${focus}

## FULL ARTICLE TEXT:
${plainText}

INSTRUCTIONS — do NOT give a generic review. This article is about "${metadata.title}" in the ${metadata.category} category. Your review must be SPECIFIC to this article's claims, sources, and framing.

For each flag:
- Quote the EXACT sentence from the article (not a paraphrase)
- Explain what's wrong with THAT specific sentence
- Write a replacement sentence that fixes THAT specific problem

Do NOT write generic suggestions like "consider adding a section on..." — that's not a review, that's a template. Point to SPECIFIC text that needs to change.

Score this article honestly. A 7 means "publishable but has real problems." An 8 means "genuinely strong independent journalism." A 5 means "reads like it was written to please the industry it covers."`,
          maxTokens: 3000,
          temperature: 0.6,
        });
        await addCostToLog(db, logId, grokUsage);

        reviewResult = parseClaudeJSON(reviewRaw) as Record<string, unknown>;
      } catch (err: unknown) {
        // Non-fatal — if Grok fails, we skip and continue
        skipReason = err instanceof Error ? err.message : "Grok unavailable";
      }

      // ── GROK REWRITE WIRING ──────────────────────────────────────────
      // When Grok flags major_issues, apply rewrite suggestions via Claude
      // before proceeding to QC. Makes independence review actually improve
      // the article rather than just scoring it.
      let revisedHtml = articleHtml;
      let revisionApplied = false;

      // Apply Grok's rewrite suggestions for both major AND minor issues.
      // Previously only major_issues triggered rewrites — which meant Grok's
      // feedback was stored but never acted on (and the old prompt always said "minor").
      const grokVerdict = reviewResult?.verdict as string;
      // Default to 5 (not 10) when score is missing — a missing score means truncated output,
      // which should trigger rewrites rather than silently passing
      const grokScore = (typeof reviewResult?.score === "number") ? reviewResult.score as number : 5;
      if (grokVerdict === "major_issues" || (grokVerdict === "minor_issues" && grokScore < 7)) {
        const flags = (reviewResult!.flags as Array<{ type: string; quote: string; rewrite: string; reason: string }>) || [];
        if (flags.length > 0) {
          try {
            const rewritePrompt = flags
              .map((f, i) => `${i + 1}. [${f.type}] Find: "${f.quote}" → Replace with: "${f.rewrite}" (Reason: ${f.reason})`)
              .join("\n");

            const { text: revisedRaw, usage: revisionUsage } = await generateWithFallback({
              system: `You are applying editorial corrections flagged by an independent reviewer. Apply each suggested rewrite where it genuinely improves the article's independence and honesty. Preserve the editorial voice and HTML structure. If a suggestion would weaken the article or is wrong, skip it. Return ONLY the corrected HTML — no JSON wrapper, no explanation.`,
              user: `## CORRECTIONS TO APPLY\n${rewritePrompt}\n\n## CURRENT ARTICLE HTML\n${articleHtml}`,
              models: WRITER_FALLBACK_CHAIN,
              maxTokens: 8192,
              temperature: 0.2,
              stage: "independence-revision",
              webSearch: false,
            });
            await addCostToLog(db, logId, revisionUsage);

            // The response should be raw HTML
            const cleaned = revisedRaw.replace(/^```html?\n?/, "").replace(/\n?```$/, "").trim();
            if (cleaned.length > articleHtml.length * 0.5) {
              revisedHtml = cleaned;
              revisionApplied = true;

              // Update article in database with revised HTML
              const slug = (articleData.metadata as Record<string, unknown>)?.slug as string;
              if (slug) {
                await db.from("articles").update({ article_html: revisedHtml }).eq("slug", slug);
              }
            }
          } catch (revErr) {
            console.warn(`[Independence] ⚠️ Revision application failed: ${revErr instanceof Error ? revErr.message : "unknown"}. Proceeding with original article.`);
          }
        }
      }

      // Store review in research_data alongside existing data
      const existingResearch = researchData;

      const grokScoreFinal = reviewResult ? ((reviewResult.score as number) || (reviewResult.independenceScore as number) || null) : null;

      // Await PubMed verification (was running in parallel with Grok)
      const pubmedResult = await pubmedPromise;

      // ── FACT-CHECK: If PubMed can't verify studies, revise the article to flag them ──
      const unverifiedStudies = (pubmedResult.details || []).filter(d => !d.found);
      if (unverifiedStudies.length > 0 && pubmedResult.total > 0) {
        const failRate = unverifiedStudies.length / pubmedResult.total;
        console.log(`[Fact-check] ${unverifiedStudies.length}/${pubmedResult.total} studies unverified on PubMed (${Math.round(failRate * 100)}%)`);

        // If more than half of cited studies can't be found, revise the article
        if (unverifiedStudies.length >= 2 || failRate > 0.5) {
          try {
            const unverifiedList = unverifiedStudies.map(s => `- "${s.title}"`).join("\n");
            const { text: factCheckedRaw, usage: factCheckUsage } = await generateWithFallback({
              system: `You are a fact-checker. The following studies cited in an article could NOT be verified on PubMed. For each unverified study: if the article makes a specific claim citing this study, either (a) remove the specific citation and reword the claim as a general observation with "evidence suggests" hedging, or (b) add "(citation unverified)" after the claim. Do NOT remove the underlying point if it's supported by other evidence in the article — just fix the attribution. Preserve all HTML structure. Return ONLY the corrected HTML.`,
              user: `## UNVERIFIED STUDIES (not found on PubMed)\n${unverifiedList}\n\n## ARTICLE HTML\n${revisedHtml}`,
              models: ["gemini-2.5-flash", "claude-sonnet-4-6"],
              maxTokens: 8192,
              temperature: 0.15,
              stage: "fact-check",
              webSearch: false,
            });
            await addCostToLog(db, logId, factCheckUsage);

            const fcCleaned = factCheckedRaw.replace(/^```html?\n?/, "").replace(/\n?```$/, "").trim();
            if (fcCleaned.length > revisedHtml.length * 0.5) {
              revisedHtml = fcCleaned;
              revisionApplied = true;
              console.log(`[Fact-check] Applied corrections for ${unverifiedStudies.length} unverified citations`);

              const slug = (articleData.metadata as Record<string, unknown>)?.slug as string;
              if (slug) {
                await db.from("articles").update({ article_html: revisedHtml }).eq("slug", slug);
              }
            }
          } catch (fcErr) {
            console.log(`[Fact-check] Non-fatal error: ${fcErr instanceof Error ? fcErr.message : "unknown"}`);
          }
        }
      }

      // Update article data with revised HTML if rewrites were applied
      const updatedArticle = revisionApplied
        ? { ...existingResearch._article as Record<string, unknown>, html: revisedHtml }
        : existingResearch._article;

      const { error: updateErr } = await db
        .from("daily_article_log")
        .update({
          status: "independence_done",
          grok_score: grokScoreFinal,
          research_data: {
            ...existingResearch,
            _article: updatedArticle,
            _independenceReview: {
              ...(reviewResult || { skipped: true, reason: skipReason }),
              _revisionApplied: revisionApplied,
            },
            _pubmedVerification: pubmedResult,
          },
        })
        .eq("id", logId);
      if (updateErr) throw new Error(`DB update to independence_done failed: ${updateErr.message}`);
    });

    if (!stageResult.ok) {
      return json({ error: stageResult.error, logId }, 500);
    }

    return json({ success: true, logId, status: "independence_done" });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
