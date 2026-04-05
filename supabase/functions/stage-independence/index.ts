import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addCostToLog, safeStage, dispatchStage } from "../_shared/db.ts";
import { grok, generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { REVISION_CHAIN } from "../_shared/constants.ts";
import { verifyPubMedCitations } from "../_shared/pubmed.ts";
import { getIndependenceContext } from "../_shared/analytics.ts";

// ---------------------------------------------------------------------------
// Independence Review (Grok) — checks for institutional deference
// ---------------------------------------------------------------------------
const INDEPENDENCE_REVIEW_PROMPT = `You are the independence reviewer for alumi news — "Evidence. Wherever it leads." Your job is to verify that this article follows the evidence honestly, discloses funding conflicts on ALL sides, and doesn't defer to any authority — institutional or contrarian — without scrutiny.

YOUR JOB: Find every place this article accepts a claim on authority rather than evidence. AI writers have TWO systematic failure modes: (1) reflexively defending institutional positions because their training data over-represents them, and (2) reflexively attacking institutions when prompted to be "independent" — replacing one bias with another. True independence means following the primary evidence regardless of who it supports.

## SCORING RULES (READ CAREFULLY — do NOT default to 7-8)
- **9-10**: Article follows primary evidence wherever it leads. Funding disclosed on ALL sides. Steel-mans opposing views before critiquing. Takes clear positions backed by specific data. Genuinely independent — not captured by institutions OR by contrarian narratives.
- **7-8**: Solid evidence-following but incomplete funding disclosure. May miss conflicts on one side (institutional OR contrarian). Acceptable for topics without major funding conflicts.
- **5-6**: Picks a side and finds evidence for it rather than following the evidence to a conclusion. One-sided funding disclosure (only names industry conflicts, or only names contrarian conflicts). Hedges where evidence is clear.
- **3-4**: Reads like advocacy — either for an institution or against one. Buries inconvenient evidence. Treats one side's claims as fact and the other's as suspect.
- **1-2**: Active misinformation, fabrication, or pure propaganda in either direction.

MOST AI-WRITTEN HEALTH ARTICLES SCORE 5-7. A score of 8+ should be RARE and EARNED. If you're giving 8/10 to every article, you're not doing your job.

## WHAT TO FLAG (be specific — quote the problematic text)
0. **FABRICATION (highest priority)** — does the article cite specific statistics, study names, journal citations, or expert quotes that look invented? AI writers routinely fabricate authoritative-sounding numbers ("87.5% detection rate"), unnamed studies ("a Phase III trial found..."), and precise comparisons ("37 months vs 26.6 months") without any real source. If a claim has a specific number but no named source, FLAG IT. This is the most dangerous type of AI error.
1. **One-sided funding disclosure** — does the article name industry funding but ignore contrarian conflicts? Or vice versa? A doctor who sells anti-statin books has a conflict. A supplement company funding "independent" research has a conflict. A wellness influencer monetizing anti-establishment content has a conflict. Funding disclosure must be SYMMETRICAL.
2. **Authority substituted for evidence** — does the article say "the CDC recommends" or "independent researchers say" without citing the specific data behind the claim? Both institutional and contrarian authority claims need specific evidence.
3. **Pulled punches** — evidence is clear but article hedges? "May suggest" when the meta-analysis is definitive? This applies to clear evidence in EITHER direction.
4. **Missing counter-evidence** — does the article address the strongest evidence against its conclusion? Steel-manning is required. If the article argues against an institution, it must present the institution's best evidence first. If it supports an institution, it must present the critics' best evidence first.
5. **Advocacy framing** — does the article start from a conclusion and arrange evidence to support it? Or does it start from the evidence and arrive at a conclusion? The former is advocacy regardless of which side it advocates for.
6. **Undisclosed conflicts on ANY side** — who funded the cited studies? Who profits from the conclusion? Apply this check to EVERY source cited — institutional, academic, contrarian, alternative. An article that only traces money on one side is doing advocacy, not journalism.
7. **Stale evidence** — citing famous old studies when newer, larger evidence exists? This applies to dated contrarian claims just as much as dated institutional ones.
8. **Unfalsifiable claims** — does any position in the article lack a clear "what would prove this wrong?" If a claim is structured so no evidence could disprove it, flag it — whether it comes from the WHO or from a health influencer.
9. **AI voice tells** — uniform sentence length, banned filler phrases, mechanical evidence presentation, paragraphs over 80 words with no personality, zero analogies from everyday life. Our brand voice: the best long-form magazine journalism with moral clarity, uncomfortable honesty, intellectual precision, and revelatory curiosity. If it reads like a Wikipedia entry or medical textbook, flag it.

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
  "Pharmacology": "Audit funding on all sides. Drug companies fund pro-drug trials. Anti-pharma doctors sell books and supplements. Check who funded each cited trial AND who profits from the article's conclusion.",
  "Clinical Evidence": "Check if the article treats study results as definitive when they're preliminary. Does it name sample sizes, effect sizes, and confidence intervals? Are replication attempts cited?",
  "Nutrition": "Nutrition has conflicts on EVERY side. Food industry funds pro-product research. Anti-seed-oil influencers sell alternative products. Supplement companies fund anti-food-industry research. Check funding for ALL cited studies and experts — institutional AND contrarian.",
  "Mental Health": "Check for one-sided framing in either direction: pharma-only (medication as first-line without lifestyle context) OR anti-pharma (dismissing effective medication based on industry distrust). Both are incomplete.",
  "Longevity": "Watch for hype from ANY direction. Anti-aging supplement sellers have conflicts just as pharma companies do. Are animal study results presented as applicable to humans without caveat?",
  "Neuroscience": "Check for oversimplification of brain mechanisms. Does it treat correlation as causation? Are neuroimaging claims overstated?",
  "Environmental Health": "Chemical companies fund safety research. Environmental activists fund risk research. Both have conflicts. Check who funded the safety AND the risk assessments.",
  "Fitness": "Check for supplement industry influence, overstated exercise claims, AND fitness influencer conflicts (equipment endorsements, program sales, supplement lines).",
  "Sleep Science": "Watch for sleep product marketing (mattresses, supplements, devices, apps) disguised as science — AND for anti-technology advocacy that overstates screen risks.",
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

      // Historical bias patterns for this category (SQL-driven, zero AI cost)
      const biasPatterns = await getIndependenceContext(db, (metadata.category as string) || "");

      try {
        const { text: reviewRaw, usage: grokUsage } = await grok({
          system: INDEPENDENCE_REVIEW_PROMPT,
          user: `## ARTICLE FOR REVIEW
Title: ${metadata.title}
Category: ${metadata.category}
Word count: ~${wordCount}

## CATEGORY-SPECIFIC FOCUS
${focus}${biasPatterns}

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
      // When Grok flags issues, apply rewrite suggestions via Sonnet
      // before proceeding to QC. Makes independence review actually improve
      // the article rather than just scoring it.
      //
      // HUMAN-OPUS PROTECTION: When _writtenBy is "human-opus", Grok still
      // reviews and scores (editorial independence is the point), but NO
      // model rewrites the prose. A lesser model rewriting Opus prose is
      // always a downgrade. Flags are logged for the human to review.
      let revisedHtml = articleHtml;
      let revisionApplied = false;

      const isHumanWritten = researchData._writtenBy === "human-opus" || researchData._writtenBy === "admin-editor";
      const grokVerdict = reviewResult?.verdict as string;
      const grokScore = (typeof reviewResult?.score === "number") ? reviewResult.score as number : 5;

      if (isHumanWritten) {
        console.log(`[Independence] Human-written article (${researchData._writtenBy}) — Grok scored ${grokScore}, verdict: ${grokVerdict}. Skipping all prose rewrites to preserve author voice.`);
      } else if (grokVerdict === "major_issues" || (grokVerdict === "minor_issues" && grokScore < 7)) {
        const flags = (reviewResult!.flags as Array<{ type: string; quote: string; rewrite: string; reason: string }>) || [];
        if (flags.length > 0) {
          try {
            const rewritePrompt = flags
              .map((f, i) => `${i + 1}. [${f.type}] Find: "${f.quote}" → Replace with: "${f.rewrite}" (Reason: ${f.reason})`)
              .join("\n");

            const { text: revisedRaw, usage: revisionUsage } = await generateWithFallback({
              system: `You are applying editorial corrections flagged by an independent reviewer. Apply each suggested rewrite where it genuinely improves the article's independence and honesty. Preserve the editorial voice and HTML structure. If a suggestion would weaken the article or is wrong, skip it. Return ONLY the corrected HTML — no JSON wrapper, no explanation.`,
              user: `## CORRECTIONS TO APPLY\n${rewritePrompt}\n\n## CURRENT ARTICLE HTML\n${articleHtml}`,
              models: REVISION_CHAIN,
              maxTokens: 8192,
              temperature: 0.2,
              stage: "independence-revision",
              webSearch: false,
            });
            await addCostToLog(db, logId, revisionUsage);

            const cleaned = revisedRaw.replace(/^```html?\n?/, "").replace(/\n?```$/, "").trim();
            if (cleaned.length > articleHtml.length * 0.5) {
              revisedHtml = cleaned;
              revisionApplied = true;

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
      // For human-written articles: log results but never rewrite prose
      const unverifiedStudies = (pubmedResult.details || []).filter(d => !d.found && !d.skipped);
      if (unverifiedStudies.length > 0 && pubmedResult.total > 0) {
        const failRate = unverifiedStudies.length / pubmedResult.total;
        console.log(`[Fact-check] ${unverifiedStudies.length}/${pubmedResult.total} studies unverified on PubMed (${Math.round(failRate * 100)}%)`);

        if (isHumanWritten) {
          console.log(`[Fact-check] Human-written article — logging unverified citations but preserving prose. Unverified: ${unverifiedStudies.map(s => s.title).join(", ")}`);
        } else if (unverifiedStudies.length >= 2 || failRate > 0.5) {
          try {
            const unverifiedList = unverifiedStudies.map(s => `- "${s.title}"`).join("\n");
            const { text: factCheckedRaw, usage: factCheckUsage } = await generateWithFallback({
              system: `You are a fact-checker. The following studies cited in an article could NOT be verified on PubMed. For each unverified study: if the article makes a specific claim citing this study, either (a) remove the specific citation and reword the claim as a general observation with "evidence suggests" hedging, or (b) add "(citation unverified)" after the claim. Do NOT remove the underlying point if it's supported by other evidence in the article — just fix the attribution. Preserve all HTML structure. Return ONLY the corrected HTML.`,
              user: `## UNVERIFIED STUDIES (not found on PubMed)\n${unverifiedList}\n\n## ARTICLE HTML\n${revisedHtml}`,
              models: REVISION_CHAIN,
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

    // Chain-dispatch: fire QC immediately (no cron wait)
    await dispatchStage("stage-qc", logId);
    return json({ success: true, logId, status: "independence_done" });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
