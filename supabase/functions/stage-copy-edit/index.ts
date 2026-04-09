import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addCostToLog, dispatchStage } from "../_shared/db.ts";
import { generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { COPY_EDIT_CHAIN } from "../_shared/constants.ts";

// ---------------------------------------------------------------------------
// Copy Editor Prompt — conservative by design
// ---------------------------------------------------------------------------
const COPY_EDITOR_PROMPT = `You are a copy editor doing a final headline and section header review for alumi news — a health and wellness magazine for smart, skeptical 20-35 year olds.

YOUR DEFAULT IS TO CHANGE NOTHING. Most articles already have good headlines and headers. You are here to catch the clearly weak ones, not to put your fingerprints on everything.

## What "clearly better" means

A change is justified ONLY when:
- The original is generic enough to fit on any article about this topic ("The Science Behind X", "Understanding Y", "What You Need to Know")
- The original is truncated, grammatically broken, or factually misleading
- The original exceeds 10 words (for the main title only — section headers have no word limit)
- The original is vague where the article makes a specific, interesting argument

A change is NOT justified when:
- You simply prefer different phrasing — that's taste, not editing
- The original has personality you'd write differently — personality is good, even when imperfect
- The original uses an unusual structure that still works — unusual is often better than polished
- You want to add cleverness — forced cleverness is worse than plain clarity

## The alumi news voice

Direct. Specific. Evidence-based but never boring. Slightly irreverent — like a smart friend who reads the studies, not a professor or a wellness influencer.

A strong headline makes a specific claim or asks a specific question that could only belong to THIS article. It tells the reader exactly what argument the article makes. A weak headline is interchangeable — it could be swapped onto any article about the same broad topic without anyone noticing.

Patterns that signal a weak headline:
- Generic topic labels that name a subject without an angle or argument
- Clickbait structures that manufacture mystery or conspiracy ("what they won't tell you", "the truth about", "everything you know is wrong")
- Filler phrases that add words without meaning ("what you need to know", "a deep dive into", "exploring")

A strong section header names what the section actually argues or reveals — not what category of information it contains. A header that could be reused across ten different articles on the same topic is too generic. If swapping it onto another article wouldn't feel wrong, it needs to be more specific.

## Rules

TITLE (H1):
- Target 5-8 words, hard cap 10. Count every word. If it's 9+, shorten it — that's an automatic change
- Must make a specific claim or ask a specific question
- If the current title is good AND under 10 words, return null for proposed. Don't change for the sake of changing

DESCRIPTION:
- Must be complete sentences (no truncation mid-thought)
- 2-3 sentences that make a reader stop scrolling
- If the current description works, return null

SECTION HEADERS (H2/H3):
- Each heading must state a finding, name a failure, or imply a consequence — never label a topic
- Replace generic labels ("The Role of X", "Understanding Y") with specific claims about what the section argues or reveals
- Leave headers alone if they're already specific, even if you'd phrase them differently
- Read all headers in sequence: they should trace the article's argument, not list its subjects. If someone read only the headings, they should grasp the article's trajectory
- Match the article's mode: provocation pieces use compressed verdicts and numbers; narrative pieces use past-tense, agent-driven framing; explainers use direct claims
- **Banned**: colon constructions ("Zinc: the honest version"), list headings ("Salt water, fluids, time"), meta-commentary ("One distinction that actually matters", "What the research actually shows")
- **4–8 words is a soft target, not a hard rule.** A 9- or 10-word header that carries a specific argument is BETTER than a 5-word header that flattens the argument into a generic hook. Length is taste; specificity is editing. Only shorten a long header if shortening it preserves (or improves) the argument. If shortening forces you to drop the verb, the agent, or the specific claim, leave it alone
- Vary structure — mix of questions, imperatives, noun phrases, and provocative statements

FOR HUMAN-WRITTEN ARTICLES (writtenBy = "human-opus"):
- Only fix clear errors: truncation, grammar, >10 word titles
- Exception: if headers are clearly templated (most sharing the same opener or structure), that is a pattern the writer likely didn't notice — propose alternatives

## Output format

Return ONLY valid JSON:
{
  "title": {
    "original": "exact original title",
    "proposed": "your version" or null,
    "reason": "specific reason this is clearly better, not just different" or null,
    "confidence": 1-10
  },
  "description": {
    "original": "exact original description",
    "proposed": "your version" or null,
    "reason": "specific reason" or null,
    "confidence": 1-10
  },
  "headers": [
    {
      "original": "exact original header text",
      "proposed": "your version" or null,
      "reason": "specific reason" or null,
      "confidence": 1-10,
      "level": "h2" or "h3"
    }
  ],
  "changeCount": 0,
  "summary": "No changes needed" or brief summary of what you changed and why
}

CRITICAL RULES:
- Set "proposed" to null for ANY element that doesn't need changing
- A confidence of 8+ means you are CERTAIN this is clearly better, not just different
- If you return more than 3 non-null proposals for a single article, you are almost certainly over-editing. Step back
- An article with 0 changes is a perfectly valid (and common) outcome`;

// ---------------------------------------------------------------------------
// Confidence threshold — only apply changes at or above this level
// ---------------------------------------------------------------------------
const CONFIDENCE_THRESHOLD = 8;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let parsedLogId: string | null = null;
  try {
    const { logId } = await req.json();
    parsedLogId = logId;
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();

    // Atomic CAS: claim from qc_approved or voice_rewrite_done
    let claimed = (await db.from("daily_article_log")
      .update({ status: "copy_editing", stage_started_at: new Date().toISOString() })
      .eq("id", logId).eq("status", "qc_approved").select("id").maybeSingle()).data;
    if (!claimed) {
      claimed = (await db.from("daily_article_log")
        .update({ status: "copy_editing", stage_started_at: new Date().toISOString() })
        .eq("id", logId).eq("status", "voice_rewrite_done").select("id").maybeSingle()).data;
    }
    if (!claimed) {
      return json({ skipped: true, logId, message: "Another instance already claimed this article" });
    }

    // Fetch log entry
    const { data: logEntry } = await db.from("daily_article_log")
      .select("slug, research_data")
      .eq("id", logId).maybeSingle();
    if (!logEntry) return json({ error: "Log entry not found" }, 404);

    const researchData = (logEntry.research_data as Record<string, unknown>) || {};
    const articleData = (researchData._article as Record<string, unknown>) || {};
    const metadata = (articleData.metadata as Record<string, unknown>) || {};
    const qcResult = (researchData._qcResult as Record<string, unknown>) || {};
    const html = (articleData.html as string) || "";
    const isHumanWritten = researchData._writtenBy === "human-opus" || researchData._writtenBy === "admin-editor";

    // Use QC's polished title/description as the starting point (QC may have already improved these)
    // DESCRIPTION LOCK: for human-written articles, prefer the writer's original description
    // over QC's rewrite — QC models routinely replace punchy standfirsts with dry summaries.
    const currentTitle = (qcResult.headline as string) || (metadata.title as string) || "";
    const originalDesc = (metadata.description as string) || "";
    const currentDescription = (isHumanWritten && originalDesc.length >= 20)
      ? originalDesc
      : (qcResult.description as string) || originalDesc;

    // Extract H2/H3 headers from article HTML
    const headers: Array<{ text: string; level: string; fullTag: string }> = [];
    const headerRegex = /<(h[23])[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = headerRegex.exec(html)) !== null) {
      const plainText = match[2].replace(/<[^>]+>/g, "").trim();
      if (plainText) {
        headers.push({ text: plainText, level: match[1].toLowerCase(), fullTag: match[0] });
      }
    }

    // Build the prompt
    const headerList = headers.length > 0
      ? headers.map((h, i) => `${i + 1}. [${h.level.toUpperCase()}] ${h.text}`).join("\n")
      : "(no section headers found)";

    const userPrompt = `Review this article's headlines and section headers.${isHumanWritten ? "\n\nIMPORTANT: This article was written by a human editor. Only fix clear errors (truncation, grammar, >10 word title). Do not rewrite working copy." : ""}

TITLE: ${currentTitle}

DESCRIPTION: ${currentDescription}

SECTION HEADERS:
${headerList}

ARTICLE CATEGORY: ${metadata.category || "unknown"}

For context, here is the article opening (first ~1500 chars):
${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1500)}

Review each element. Return null for proposed on anything that doesn't need changing. Remember: 0 changes is a valid outcome.`;

    const { text: raw, usage } = await generateWithFallback({
      system: COPY_EDITOR_PROMPT,
      user: userPrompt,
      models: COPY_EDIT_CHAIN,
      maxTokens: 2000,
      temperature: 0.2,
      stage: "copy_edit",
      webSearch: false,
    });
    await addCostToLog(db, logId, usage);

    const result = parseClaudeJSON(raw) as Record<string, unknown>;

    // Apply high-confidence changes
    let appliedChanges = 0;
    const appliedDetails: string[] = [];

    // Title — LOCKED for human-written articles (code-level, not prompt-level)
    const titleResult = result.title as Record<string, unknown> | undefined;
    let finalTitle = currentTitle;
    if (isHumanWritten) {
      if (titleResult?.proposed) {
        console.log(`[CopyEdit] Human-written article — title change BLOCKED: "${currentTitle}" → "${titleResult.proposed}" (would have been confidence ${titleResult.confidence})`);
      }
    } else if (titleResult?.proposed && (titleResult.confidence as number) >= CONFIDENCE_THRESHOLD) {
      finalTitle = titleResult.proposed as string;
      appliedChanges++;
      appliedDetails.push(`Title: "${currentTitle}" → "${finalTitle}" (confidence ${titleResult.confidence})`);
    }

    // Description — for human-written, only fix if clearly broken (truncated/empty)
    const descResult = result.description as Record<string, unknown> | undefined;
    let finalDescription = currentDescription;
    if (isHumanWritten) {
      // Only apply if current description is clearly broken
      if (descResult?.proposed && (currentDescription.length < 50 || currentDescription.endsWith("..."))) {
        finalDescription = descResult.proposed as string;
        appliedChanges++;
        appliedDetails.push(`Description fixed (was truncated/broken, confidence ${descResult.confidence})`);
      } else if (descResult?.proposed) {
        console.log(`[CopyEdit] Human-written article — description change BLOCKED (not broken)`);
      }
    } else if (descResult?.proposed && (descResult.confidence as number) >= CONFIDENCE_THRESHOLD) {
      finalDescription = descResult.proposed as string;
      appliedChanges++;
      appliedDetails.push(`Description updated (confidence ${descResult.confidence})`);
    }

    // Section headers — apply to HTML
    let finalHtml = html;
    const toc = (articleData.toc as Array<{ id: string; title: string }>) || [];
    const headerResults = (result.headers as Array<Record<string, unknown>>) || [];

    // A header is "clearly broken" only when it's structurally damaged, NOT when
    // it's merely long. Word count is taste, not damage. We block model rewrites
    // of human-written headers unless one of these structural failures applies:
    //   - Empty / whitespace
    //   - Ends mid-thought (trailing comma, dash, ellipsis, semicolon, "and"/"or"/"the")
    //   - Contains a stray HTML tag fragment (open angle bracket)
    const isStructurallyBroken = (text: string): boolean => {
      const t = (text || "").trim();
      if (!t) return true;
      if (/[,;\-\u2013\u2014]$/.test(t)) return true;
      if (/\.\.\.$/.test(t)) return true;
      if (/\b(and|or|the|a|an|of|to|with|for|by|in|on)$/i.test(t)) return true;
      if (/[<>]/.test(t)) return true;
      return false;
    };

    for (const h of headerResults) {
      if (!h.proposed || (h.confidence as number) < CONFIDENCE_THRESHOLD) continue;

      const original = h.original as string;
      const proposed = h.proposed as string;

      // Human-written articles: header rewrites are BLOCKED at code level
      // unless the original is structurally broken. Mirrors the title lock.
      // The model's prompt asks it to be conservative, but it has historically
      // ignored that and shortened "long" headers (e.g. OCD article 2026-04-08
      // changed "Finding the Right Help Requires Asking the Right Question" →
      // "Ask Providers This One Question" — flattening editorial voice).
      if (isHumanWritten && !isStructurallyBroken(original)) {
        console.log(`[CopyEdit] Human-written article — header change BLOCKED: "${original}" → "${proposed}" (would have been confidence ${h.confidence})`);
        continue;
      }

      // Find and replace in HTML — match the header text within its tag
      // Use a regex that matches the exact text inside any h2/h3 tag
      const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tagRegex = new RegExp(`(<h[23][^>]*>)((?:<[^>]+>)*?)${escapedOriginal}((?:<[^>]+>)*?)(</h[23]>)`, "i");

      if (tagRegex.test(finalHtml)) {
        finalHtml = finalHtml.replace(tagRegex, `$1$2${proposed}$3$4`);
        appliedChanges++;
        appliedDetails.push(`Header: "${original}" → "${proposed}" (confidence ${h.confidence})`);

        // Update TOC entry if it matches
        const tocEntry = toc.find(t => t.title === original);
        if (tocEntry) {
          tocEntry.title = proposed;
        }
      }
    }

    console.log(`[CopyEdit] ${logEntry.slug}: ${appliedChanges} changes applied out of ${result.changeCount || 0} proposed`);
    if (appliedDetails.length > 0) {
      for (const d of appliedDetails) console.log(`[CopyEdit]   ${d}`);
    }

    // Update research_data with copy edit results and any changes
    const updatedArticle = {
      ...articleData,
      html: finalHtml,
      toc,
      metadata: {
        ...metadata,
        title: finalTitle,
        description: finalDescription,
      },
    };

    // Also update QC result's headline/description so stage-publish reads the right values
    const updatedQcResult = {
      ...qcResult,
      headline: finalTitle,
      description: finalDescription,
    };

    await db.from("daily_article_log").update({
      status: "copy_edited",
      research_data: {
        ...researchData,
        _article: updatedArticle,
        _qcResult: updatedQcResult,
        _copyEditResult: {
          appliedChanges,
          totalProposed: result.changeCount || 0,
          summary: result.summary || "No changes needed",
          details: appliedDetails,
          confidenceThreshold: CONFIDENCE_THRESHOLD,
        },
      },
    }).eq("id", logId);

    // Chain-dispatch to publish
    await dispatchStage("stage-publish", logId);

    return json({
      success: true,
      logId,
      appliedChanges,
      totalProposed: result.changeCount || 0,
      summary: result.summary,
      details: appliedDetails,
    });
  } catch (err: unknown) {
    try {
      const db = supabase();
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[stage-copy-edit] Error: ${msg}`);
      if (parsedLogId) {
        // On failure, skip copy edit and dispatch directly to publish
        // Copy edit is a polish step — failure should never block publication
        console.log(`[stage-copy-edit] Recovering — dispatching directly to stage-publish`);
        await db.from("daily_article_log").update({ status: "copy_edited" }).eq("id", parsedLogId);
        await dispatchStage("stage-publish", parsedLogId);
      }
    } catch { /* best effort */ }
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
