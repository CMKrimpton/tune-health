import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addCostToLog, parseScore, dispatchStage } from "../_shared/db.ts";
import { generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { auditVoiceQuality } from "../_shared/voice-audit.ts";
import { QC_CHAIN } from "../_shared/constants.ts";

// ---------------------------------------------------------------------------
// Senior Editor QC Prompt
// ---------------------------------------------------------------------------
const SENIOR_EDITOR_QC_PROMPT = `You are the Senior Editor of alumi news doing a FINAL quality check before publication. This is the last gate. Once you approve, this goes live to readers.

You have TWO jobs: (1) polish the headline and description, and (2) ASSESS WHETHER THIS ARTICLE IS GENUINELY EXCEPTIONAL. Not "adequate." Not "passes the checks." Exceptional. The kind of writing that makes a reader stop, read a paragraph twice, and text it to a friend.

## THE CRAFT TEST (read the full article before answering)

Ask yourself these questions honestly. They are not a checklist — they are a way of reading:

**1. Does this read like it was written by a truly exceptional writer?**
Not competent. Not professional. Exceptional. A writer whose sentences have rhythm — short verdicts after long analysis, a three-word sentence that lands like a verdict after a complex paragraph. Someone who makes you feel the moral weight of a claim, not just understand it. If the prose is uniformly measured and even-keeled throughout — all medium-length sentences, all the same analytical tone — it may be accurate, but it is not exceptional.

**2. Does the article have gear changes?**
Great journalism shifts emotional temperature. You're reading calm analysis, and then a sentence makes you angry. Or surprised. Or uncomfortable. The tick article that's all analysis from start to finish, with no moment that raises the temperature, will bore a smart reader even if every fact is correct. Look for at least one moment where the writing does something unexpected.

**3. Would a 25-year-old text a paragraph to a friend?**
This is the ultimate test. Not "is this informative?" but "is there a single paragraph so striking, surprising, or well-stated that someone would screenshot it?" If you can't identify that paragraph, the article has a craft problem.

**4. Does the opening earn the second paragraph?**
The first 2-3 sentences decide whether a reader stays. A procedural fact, a definition, or a broad context-setter is a weak opening. A specific claim, a surprising detail, a tension that demands resolution — those earn the next paragraph.

**5. Does it follow the money — on ALL sides?**
Every health topic has financial interests. Insurance, pharma, supplement brands, hospital systems, testing labs, food industry — but also book authors, influencers, alternative medicine practitioners, and contrarian doctors building brands. Does the article disclose funding conflicts SYMMETRICALLY? An article that only traces industry money while ignoring contrarian conflicts is doing advocacy, not journalism. If no significant financial conflicts exist for this topic, that's fine — don't force a conspiracy angle where none exists.

**6. Does it take evidence-backed positions?**
An article that explains without ever judging is an encyclopedia entry, not journalism. There should be at least two moments where the writer states a verdict — not hedged with "some experts believe," but a direct editorial opinion backed by the specific evidence presented. Positions must follow FROM the evidence, not precede it.

You will receive a MECHANICAL VOICE AUDIT with the article. Trust its factual measurements (banned phrases, paragraph density, sentence counts). But the audit cannot measure craft, rhythm, or emotional impact — that is YOUR job.

**VOICE REWRITE triggers** (if ANY of these are true AND the content/evidence is solid, decision MUST be "rewrite_voice"):
- Banned phrases found (the audit will list them)
- Paragraph density flagged (>30% over 3 sentences)
- Sentence length variance below 4.0 (monotonous rhythm — every sentence roughly the same length)
- Zero micro-sentences (no short punchy verdicts breaking up the analysis)
- Zero editorial opinions — article merely explains without taking positions
- Fails the craft test above — prose is competent but not exceptional, uniformly measured, no gear changes
- No paragraph you'd text to a friend
A "rewrite_voice" decision sends the article to our best models for a voice-only rewrite. The facts stay — only the prose gets personality. USE THIS when the content is solid but the writing is flat.

**Content REVISE triggers** (decision = "revise"):
- Factual/structural problems, wrong angle, missing evidence, bad citations
- Content is fundamentally flawed, not just bland
- One-sided funding disclosure — article traces money on only one side of the debate (institutional OR contrarian)
- Article takes positions that aren't supported by the specific evidence presented

**Auto-kill trigger** (decision MUST be "kill"):
- 3+ banned phrases AND zero editorial opinion — this is AI slop, not journalism
- Topic is unsalvageable or evidence is too thin

If the voice fails but the content is solid, decision = "rewrite_voice" — NOT "revise" or "kill".

## Headline Rules
- Target 5-8 words. Hard cap 10. Count before finalizing — if it's 9+, edit it shorter
- One sentence only. No two-sentence kicker structures — banned
- Must be specific and honest. No clickbait, no manufactured mystery or conspiracy framing
- If the current headline is good AND under 10 words, KEEP IT. Don't change for the sake of changing

## Section Heading Check
- Each h2 must state a finding, name a failure, or imply a consequence — not label a topic
- **4–8 words, hard range. Count every heading. A 9-word heading is a failure — edit it shorter**
- Flag colon constructions ("X: the honest version"), list headings ("Salt, fluids, time"), or meta-commentary ("What the research actually shows")
- Read headings in sequence: they should trace the article's argument. If they read like a table of contents, flag for revision

## Description Rules
- 2-3 sentences that make a reader stop scrolling. COMPLETE sentences — never truncated
- Must accurately represent the article's argument, not just its topic

## Quality Score (craft-weighted — a well-researched but flat article is not a 7)
- 9-10: Exceptional — writing you would be proud to publish anywhere. Has rhythm, gear changes, at least one paragraph worth sharing. Takes clear evidence-backed positions. Funding disclosed symmetrically on all sides
- 7-8: Strong — genuinely good writing with voice and edge. Minor craft issues but the reader stays engaged throughout. Has editorial opinions backed by cited evidence
- 5-6: Competent — accurate, well-structured, but reads like a health blog. Uniformly measured prose, no surprises, no moments that raise the temperature. This is the most common failure mode: articles that pass every mechanical check but that no one would read twice. SHOULD TRIGGER REWRITE_VOICE
- 3-4: Weak — AI slop. No voice, no opinion, banned phrases. OR: one-sided advocacy disguised as journalism. SHOULD TRIGGER KILL
Score honestly. An article where every paragraph is the same analytical tone, with no rhythm variation and no moment of surprise, is a 5-6 regardless of how accurate it is.

## Output Format
Return ONLY valid JSON:
{
  "decision": "publish" | "rewrite_voice" | "revise" | "kill",
  "qualityScore": "(integer 1-10, see scoring guide above)",
  "headline": "Final headline — target 5-8 words, hard cap 10. Count before submitting. Keep original if good enough",
  "description": "Final description — MUST be complete sentences, never truncated",
  "voiceCheck": {
    "craftTest": true/false,
    "gearChanges": true/false,
    "textToFriendParagraph": true/false,
    "openingEarnsSecondParagraph": true/false,
    "followsTheMoney": true/false,
    "takesPositions": true/false,
    "overallVoicePass": true/false
  },
  "edits": {
    "headlineChanged": false,
    "descriptionChanged": false,
    "notes": "What you changed and why — or 'No changes needed'"
  },
  "killReason": null,
  "reviseInstructions": null
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let parsedLogId: string | null = null;
  try {
    const { logId } = await req.json();
    parsedLogId = logId;
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();

    // Atomic CAS: claim this article. Only ONE instance can transition independence_done → editor_qc.
    const { data: claimed } = await db
      .from("daily_article_log")
      .update({ status: "editor_qc", stage_started_at: new Date().toISOString() })
      .eq("id", logId)
      .eq("status", "independence_done")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      return json({ skipped: true, logId, message: "Another instance already claimed this article" });
    }

    // Fetch log entry with article data (CAS already claimed it)
    const { data: logEntry } = await db.from("daily_article_log").select("slug, research_data").eq("id", logId).maybeSingle();
    if (!logEntry) return json({ error: "Log entry not found" }, 404);

    const researchData = (logEntry.research_data as Record<string, unknown>) || {};
    const articleData = (researchData._article as Record<string, unknown>) || {};
    const metadata = (articleData.metadata as Record<string, unknown>) || {};
    const slug = logEntry.slug || (metadata.slug as string);
    const independenceReview = (researchData._independenceReview as Record<string, unknown>) || null;

    if (!slug) return json({ error: "No slug found in log entry" }, 400);

    // Build independence review section for QC prompt
    let independenceSection = "";
    if (independenceReview && !independenceReview.skipped) {
      const flags = (independenceReview.flags as Array<Record<string, string>>) || [];
      if (flags.length > 0) {
        independenceSection = `\n## INDEPENDENCE REVIEW (external reviewer)
Verdict: ${independenceReview.verdict}
Summary: ${independenceReview.summary}
Flags:
${flags.map((f) => `- [${f.type}] "${f.quote}" — Rewrite: ${f.rewrite || f.suggestion || "no suggestion"} (Reason: ${f.reason || "not stated"})`).join("\n")}

Consider these flags in your review. Address any legitimate concerns.\n`;
      } else {
        independenceSection = `\n## INDEPENDENCE REVIEW: Clean — no flags raised.\n`;
      }
    }

    // Run mechanical voice audit — code, not AI
    const voiceAudit = auditVoiceQuality((articleData.html as string) || "");
    const voiceAuditSection = `\n## MECHANICAL VOICE AUDIT (generated by code — factual measurements, not opinions)
${voiceAudit.passed ? "ALL MECHANICAL CHECKS PASSED (but mechanical checks cannot measure craft — that is your job)" : "MECHANICAL FAILURES DETECTED:"}
${voiceAudit.failures.map(f => `- ${f}`).join("\n")}

Metrics:
- Word count: ${voiceAudit.wordCount}
- Paragraphs: ${voiceAudit.totalParagraphs}
- Sentence length variance: ${voiceAudit.sentenceLengthVariance} (< 4 = monotonous rhythm, 5-8 = good variety, 9+ = dynamic range)
- Micro-sentences (< 5 words): ${voiceAudit.microSentenceCount} (punchy verdicts that break monotony — 0 is a red flag)
- Opening sentence: ${voiceAudit.openingSentenceWords} words (shorter openings tend to grip harder)
- Short sentences (< 8 words): ${voiceAudit.shortSentenceCount} (${voiceAudit.shortSentenceRatio})
- Paragraphs over 3 sentences: ${voiceAudit.paragraphsOver3Sentences}
- Longest paragraph: ${voiceAudit.longestParagraphSentences} sentences
- "you/your" count: ${voiceAudit.youCount} (informational — some article types don't need direct address)
- Rhetorical questions: ${voiceAudit.rhetoricQuestionCount} (max: 2)
- Banned phrases: ${voiceAudit.bannedPhrases.length > 0 ? voiceAudit.bannedPhrases.map(p => `"${p}"`).join(", ") : "none"}

${!voiceAudit.passed ? "This article has mechanical failures that must factor into your decision." : ""}
NOTE: Passing all mechanical checks does NOT mean the article is good enough to publish. A flat, monotonous article with no banned phrases still fails the craft test.\n`;

    // Senior Editor QC pass
    const qcPrompt = `Review this article before publication.

## ARTICLE
Title: ${metadata.title}
Description: ${metadata.description}
Category: ${metadata.category}
Word count: ~${voiceAudit.wordCount}
${voiceAuditSection}
## FULL ARTICLE HTML:
${(articleData.html as string) || ""}

## TABLE OF CONTENTS
${((articleData.toc as Array<{ title: string }>) || []).map((t) => `- ${t.title}`).join("\n")}
${independenceSection}
Make your final call. Publish, request revisions, or kill. Remember: voice failures from the mechanical audit are auto-revise triggers.`;

    // QC uses a DIFFERENT model from independence review (Grok).
    // Gemini primary for QC — fast, cheap, good at headline/description polish.
    // Falls back to Sonnet if Gemini fails. Never Grok — already reviewed.
    // webSearch: false — QC analyzes the article text, doesn't need web search
    // QC is a structured pass/fail decision — mechanical voice audit does most of the work,
    // QC just reads the metrics and makes the call. Flash handles this well at 15x cheaper.
    const { text: qcRaw, usage: qcUsage } = await generateWithFallback({
      system: SENIOR_EDITOR_QC_PROMPT + `\n\nCRITICAL: Return ONLY valid JSON. No markdown, no explanation — just the JSON object.`,
      user: qcPrompt,
      models: QC_CHAIN,
      maxTokens: 2000,
      temperature: 0.3,
      stage: "qc",
      webSearch: false,
    });
    await addCostToLog(db, logId, qcUsage);

    const qcResult = parseClaudeJSON(qcRaw) as Record<string, unknown>;

    // DEFAULT-DENY: if decision is missing or unrecognized, treat as rewrite_voice (not silent publish)
    const qcDecision = qcResult.decision as string;
    if (!qcDecision || !["publish", "rewrite_voice", "revise", "kill"].includes(qcDecision)) {
      console.warn(`[QC] ⚠️ Invalid/missing decision: "${qcDecision}" — treating as rewrite_voice (default-deny). Raw QC output may be truncated.`);
      qcResult.decision = "rewrite_voice";
      qcResult.reviseInstructions = "QC output was truncated or invalid. Voice rewrite requested as safety fallback.";
    }

    // Detect human-written, admin-editor, or manually queued articles BEFORE any kill/revise checks
    // admin-editor articles are generated by Sonnet via process-article — voice rewrite by Sonnet is circular
    const isHumanWritten = researchData._writtenBy === "human-opus" || researchData._writtenBy === "admin-editor";
    const isManuallyQueued = !!researchData._fromQueue;

    // If editor kills the article, mark as failed — UNLESS human-written or manually queued
    if (qcResult.decision === "kill") {
      if (isHumanWritten || isManuallyQueued) {
        console.log(`[QC] Kill requested but article was ${isHumanWritten ? "human-written" : "manually queued"} — force publishing with QC improvements`);
        const finalTitle = (qcResult.headline as string) || (metadata.title as string);
        const finalDescription = (qcResult.description as string) || (metadata.description as string);
        if (finalTitle) (metadata as Record<string, unknown>).title = finalTitle;
        if (finalDescription) (metadata as Record<string, unknown>).description = finalDescription;
        const { error: forceErr } = await db.from("daily_article_log").update({
          status: "qc_approved",
          editor_score: parseScore(qcResult.qualityScore),
          research_data: { ...researchData, _article: articleData, _qcResult: qcResult },
        }).eq("id", logId);
        if (!forceErr) await dispatchStage("stage-copy-edit", logId);
        return json({ success: true, logId, qcResult, decision: "publish_forced_kill_override" });
      }

      await db.from("articles").update({ status: "archived", draft: true }).eq("slug", slug);
      await db
        .from("daily_article_log")
        .update({
          status: "failed",
          error: `Senior Editor QC killed: ${qcResult.killReason || "Quality standards not met"}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
      return json({ success: true, logId, qcResult, decision: "kill" });
    }

    // If editor requests revisions, send back to write stage (max 1 revision to avoid loops)
    if (qcResult.decision === "revise") {
      // In hybrid mode, human wrote with Opus. Flash QC requesting a revise should not
      // silently park the article at editor_approved (dead end). Force-publish with
      // QC's headline/description improvements applied. The human's prose is the product.
      if (isHumanWritten) {
        console.log(`[QC] Revise requested but article was human-written — force publishing with QC improvements`);
        const finalTitle = (qcResult.headline as string) || (metadata.title as string);
        const finalDescription = (qcResult.description as string) || (metadata.description as string);
        if (finalTitle) (metadata as Record<string, unknown>).title = finalTitle;
        if (finalDescription) (metadata as Record<string, unknown>).description = finalDescription;
        const { error: forceErr } = await db.from("daily_article_log").update({
          status: "qc_approved",
          editor_score: parseScore(qcResult.qualityScore),
          research_data: { ...researchData, _article: articleData, _qcResult: qcResult },
        }).eq("id", logId);
        if (!forceErr) await dispatchStage("stage-copy-edit", logId);
        return json({ success: true, logId, qcResult, decision: "publish_forced_human_written" });
      }

      // Non-human articles: standard revise logic (back to editor_approved for rewrite)
      const currentLog = (await db.from("daily_article_log").select("research_data, revision_count").eq("id", logId).single()).data as { research_data: Record<string, unknown>; revision_count: number | null } | null;
      const currentData = (currentLog?.research_data as Record<string, unknown>) || {};
      const revisionCount = ((currentLog?.revision_count as number) || 0) + 1;

      if (revisionCount > 1) {
        console.log(`[QC] Max revisions (${revisionCount}) reached for ${slug} — force publishing`);
        const finalTitle = (qcResult.headline as string) || (metadata.title as string);
        const finalDescription = (qcResult.description as string) || (metadata.description as string);
        if (finalTitle) (metadata as Record<string, unknown>).title = finalTitle;
        if (finalDescription) (metadata as Record<string, unknown>).description = finalDescription;
        await db.from("daily_article_log").update({
          status: "qc_approved",
          editor_score: parseScore(qcResult.qualityScore),
          research_data: { ...currentData, _article: articleData, _qcResult: qcResult },
        }).eq("id", logId);
        await dispatchStage("stage-copy-edit", logId);
        return json({ success: true, logId, qcResult, decision: "publish_forced_max_revisions" });
      } else {
        await db.from("daily_article_log").update({
          status: "editor_approved",
          revision_count: revisionCount,
          research_data: { ...currentData, _reviseInstructions: qcResult.reviseInstructions },
        }).eq("id", logId);
        return json({ success: true, logId, qcResult, decision: "revise" });
      }
    }

    // If voice needs rewriting, send to voice rewrite stage (max 1 voice rewrite)
    // EXCEPTION: human-written articles (Opus via Max) skip voice rewrite — never degrade Opus prose with a lesser model
    if (qcResult.decision === "rewrite_voice" && isHumanWritten) {
      console.log(`[QC] Voice rewrite requested but article was human-written with Opus — skipping, publishing directly`);
      qcResult.decision = "publish";
    }
    if (qcResult.decision === "rewrite_voice") {
      const currentLog = (await db.from("daily_article_log").select("research_data, revision_count").eq("id", logId).single()).data as { research_data: Record<string, unknown>; revision_count: number | null } | null;
      const currentData = (currentLog?.research_data as Record<string, unknown>) || {};
      const voiceRewriteCount = (currentData._voiceRewriteCount as number) || 0;

      if (voiceRewriteCount > 0) {
        // Already voice-rewritten once — force publish
        console.log(`[QC] Voice rewrite already applied for ${slug} — force publishing`);
        // Apply headline/description improvements and set to qc_approved
        const finalTitle = (qcResult.headline as string) || (metadata.title as string);
        const finalDescription = (qcResult.description as string) || (metadata.description as string);
        if (finalTitle) (metadata as Record<string, unknown>).title = finalTitle;
        if (finalDescription) (metadata as Record<string, unknown>).description = finalDescription;
        await db.from("daily_article_log").update({
          status: "qc_approved",
          editor_score: parseScore(qcResult.qualityScore),
          research_data: {
            ...currentData,
            _article: articleData,
            _qcResult: qcResult,
          },
        }).eq("id", logId);
        await dispatchStage("stage-copy-edit", logId);
        return json({ success: true, logId, qcResult, decision: "publish_forced_already_rewritten" });
      } else {
        const { error: updateErr } = await db.from("daily_article_log").update({
          status: "voice_rewrite_pending",
          research_data: {
            ...currentData,
            _qcResult: qcResult,
            _voiceRewriteRequested: true,
            _voiceRewriteCount: 1,
          },
        }).eq("id", logId);
        if (updateErr) {
          console.error(`[stage-qc] DB update failed for voice_rewrite_pending: ${updateErr.message}`);
          return json({ error: `DB update failed: ${updateErr.message}`, logId }, 500);
        }
        return json({ success: true, logId, qcResult, decision: "rewrite_voice" });
      }
    }

    // Decision is "publish" — apply headline/description improvements, set to qc_approved
    const finalTitle = (qcResult.headline as string) || (metadata.title as string);
    const finalDescription = (qcResult.description as string) || (metadata.description as string);
    if (finalTitle) (metadata as Record<string, unknown>).title = finalTitle;
    if (finalDescription) (metadata as Record<string, unknown>).description = finalDescription;

    const { error: publishErr } = await db.from("daily_article_log").update({
      status: "qc_approved",
      editor_score: parseScore(qcResult.qualityScore),
      research_data: {
        ...researchData,
        _article: articleData,
        _qcResult: qcResult,
      },
    }).eq("id", logId);
    if (publishErr) {
      console.error(`[stage-qc] DB update failed for qc_approved: ${publishErr.message}`);
      return json({ error: `DB update failed: ${publishErr.message}`, logId }, 500);
    }

    // Chain-dispatch: fire publish immediately (no cron wait)
    await dispatchStage("stage-copy-edit", logId);
    return json({ success: true, logId, qcResult, decision: "publish" });
  } catch (err: unknown) {
    // Mark as failed so stale detection doesn't loop on it
    try {
      const db = supabase();
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[stage-qc] Error: ${msg}`);
      if (parsedLogId) {
        await db.from("daily_article_log").update({
          status: "failed",
          error: `QC stage error: ${msg}`,
          completed_at: new Date().toISOString(),
        }).eq("id", parsedLogId);
      }
    } catch { /* best effort */ }
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
