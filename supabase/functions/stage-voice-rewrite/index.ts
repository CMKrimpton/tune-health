import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addCostToLog } from "../_shared/db.ts";
import { generateWithFallback } from "../_shared/api-clients.ts";
import { auditVoiceQuality } from "../_shared/voice-audit.ts";
import { VOICE_REWRITE_CHAIN } from "../_shared/constants.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let parsedLogId: string | null = null;
  try {
    const { logId } = await req.json();
    parsedLogId = logId;
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();

    // Atomic CAS: claim this article. Only ONE instance can transition voice_rewrite_pending → rewriting_voice.
    const { data: claimed } = await db
      .from("daily_article_log")
      .update({ status: "rewriting_voice", stage_started_at: new Date().toISOString() })
      .eq("id", logId)
      .eq("status", "voice_rewrite_pending")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      return json({ skipped: true, logId, message: "Another instance already claimed this article" });
    }

    // Fetch log entry with article data
    const { data: logEntry } = await db.from("daily_article_log").select("research_data").eq("id", logId).maybeSingle();
    if (!logEntry) return json({ error: "Log entry not found" }, 404);

    const researchData = (logEntry.research_data as Record<string, unknown>) || {};
    const articleData = (researchData._article as Record<string, unknown>) || {};
    const metadata = (articleData.metadata as Record<string, unknown>) || {};
    const articleHtml = (articleData.html as string) || "";

    // Get QC feedback for targeted rewrite instructions
    const qcResult = (researchData._qcResult as Record<string, unknown>) || {};
    const qcFeedback = (qcResult.reviseInstructions as string) || "Voice is too bland/Wikipedia-like. Needs personality, editorial positions, and direct reader address.";

    // Run mechanical voice audit to give the rewriter hard metrics
    const voiceAudit = auditVoiceQuality(articleHtml);

    const VOICE_REWRITE_PROMPT = `You are the VOICE DOCTOR for alumi news. Your ONLY job is to rewrite this article's PROSE for voice quality. The facts, citations, evidence, structure, and sources are ALL CORRECT — do NOT change any of them.

## WHAT YOU MUST FIX
${qcFeedback}

## MECHANICAL AUDIT (code-generated, these numbers are facts):
- "you/your" count: ${voiceAudit.youCount} (minimum 6 — ADD MORE)
- Banned phrases found: ${voiceAudit.bannedPhrases.length > 0 ? voiceAudit.bannedPhrases.map(p => `"${p}"`).join(", ") : "none"}
- Paragraphs over 3 sentences: ${voiceAudit.paragraphsOver3Sentences} (BREAK THEM UP)
- Short sentences (< 8 words): ${voiceAudit.shortSentenceCount} total across ${voiceAudit.totalParagraphs} paragraphs (need at least 1 per 3 paragraphs)
- Rhetorical questions: ${voiceAudit.rhetoricQuestionCount} (max 2)
- Word count: ${voiceAudit.wordCount}

## BRAND VOICE (this is non-negotiable)
Write at the level of the best long-form magazine journalism — The Atlantic, Vanity Fair, NYT Magazine, WSJ features — with the moral clarity of Hitchens, the uncomfortable honesty of Bill Maher, the intellectual precision of Sam Harris, the investigative accountability of 60 Minutes (make institutions answer for themselves), the deep-build structure of PBS Frontline (patient, multi-source investigation that constructs an airtight case — openings that drop you into the stakes before you know the subject), and the revelatory curiosity of Veritasium (make complex science feel like a discovery, not a lecture). Authoritative, slightly irreverent. The prose should feel like a smart friend who reads the studies, not a professor or a wellness influencer. Say the uncomfortable thing when the evidence supports it. No sacred cows.

## REWRITE RULES
1. Vary sentence length dramatically. Follow long analytical sentences with short verdicts that land with force. Monotonous rhythm is what makes prose feel flat — break the pattern constantly.
2. Break paragraphs over 3 sentences. Short paragraphs create emphasis and pacing.
3. Remove ALL banned phrases. Replace with specific, vivid language that could only belong in THIS article.
4. Add at least 2 editorial opinions stated directly — not hedged with qualifiers, but clear verdicts backed by the evidence in the article.
5. There must be at least one moment where the writing says something a cautious institutional publication never would — something honest, uncomfortable, or irreverent that earns the reader's trust.
6. Add everyday analogies drawn from ordinary life that make complex mechanisms feel intuitive and concrete.
7. KEEP every fact, study citation, number, source, and HTML structure tag (<section>, <h2>, <aside>, etc.) EXACTLY as they are.
8. Keep the same approximate word count. You are rewriting sentences, not adding new content.

Return ONLY the rewritten HTML. No JSON wrapper, no explanation, no markdown fences.`;

    const { text: rewrittenRaw, usage: rewriteUsage, modelUsed } = await generateWithFallback({
      system: VOICE_REWRITE_PROMPT,
      user: articleHtml,
      models: VOICE_REWRITE_CHAIN,
      maxTokens: 16384,
      temperature: 0.5,
      stage: "voice-rewrite",
      webSearch: false,
    });
    await addCostToLog(db, logId, rewriteUsage);

    // Clean up — strip markdown fences if present
    const cleaned = rewrittenRaw.replace(/^```html?\n?/, "").replace(/\n?```$/, "").trim();

    // Validate: must be at least 50% of original length (don't accept garbage)
    if (cleaned.length < articleHtml.length * 0.5) {
      console.warn(`[VoiceRewrite] Output too short (${cleaned.length} vs ${articleHtml.length}). Keeping original.`);
    } else {
      // Update article in database with rewritten HTML
      const slug = (metadata.slug as string);
      if (slug) {
        await db.from("articles").update({ article_html: cleaned }).eq("slug", slug);
      }
      // Update article data for downstream publish
      articleData.html = cleaned;
    }

    // Run voice audit on the result to log improvement
    const afterAudit = auditVoiceQuality(articleData.html as string);
    console.log(`[VoiceRewrite] Model: ${modelUsed}. Before: you=${voiceAudit.youCount}, banned=${voiceAudit.bannedPhrases.length}. After: you=${afterAudit.youCount}, banned=${afterAudit.bannedPhrases.length}`);

    // Update log — article goes to voice_rewrite_done, produce loop will publish it
    const existingResearch = (logEntry.research_data as Record<string, unknown>) || {};
    await db.from("daily_article_log").update({
      status: "voice_rewrite_done",
      research_data: {
        ...existingResearch,
        _article: articleData,
        _voiceRewrite: {
          modelUsed,
          beforeAudit: { youCount: voiceAudit.youCount, bannedPhrases: voiceAudit.bannedPhrases.length, passed: voiceAudit.passed },
          afterAudit: { youCount: afterAudit.youCount, bannedPhrases: afterAudit.bannedPhrases.length, passed: afterAudit.passed },
        },
        _voiceRewriteCompleted: true,
      },
    }).eq("id", logId);

    return json({
      success: true,
      logId,
      modelUsed,
      before: { youCount: voiceAudit.youCount, bannedPhrases: voiceAudit.bannedPhrases.length, passed: voiceAudit.passed },
      after: { youCount: afterAudit.youCount, bannedPhrases: afterAudit.bannedPhrases.length, passed: afterAudit.passed },
    });
  } catch (err: unknown) {
    // Log failure to DB so stale detection doesn't loop on it
    try {
      const db = supabase();
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[stage-voice-rewrite] Error: ${msg}`);
      if (parsedLogId) {
        await db.from("daily_article_log").update({
          status: "failed",
          error: `Voice rewrite error: ${msg}`,
          completed_at: new Date().toISOString(),
        }).eq("id", parsedLogId);
      }
    } catch { /* best effort */ }
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
