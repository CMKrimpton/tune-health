import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, parseScore } from "../_shared/db.ts";

import { getByline, MODELS } from "../_shared/constants.ts";
import { rotateFeatured } from "../_shared/featured.ts";
import { descriptionLooksBroken, extractDescriptionFromHtml } from "../_shared/description.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { logId } = await req.json();
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();

    // Atomic CAS: claim this article. Three valid input statuses — try each.
    let claimed = (await db.from("daily_article_log")
      .update({ status: "publishing", stage_started_at: new Date().toISOString() })
      .eq("id", logId).eq("status", "copy_edited").select("id").maybeSingle()).data;
    if (!claimed) {
      claimed = (await db.from("daily_article_log")
        .update({ status: "publishing", stage_started_at: new Date().toISOString() })
        .eq("id", logId).eq("status", "qc_approved").select("id").maybeSingle()).data;
    }
    if (!claimed) {
      claimed = (await db.from("daily_article_log")
        .update({ status: "publishing", stage_started_at: new Date().toISOString() })
        .eq("id", logId).eq("status", "voice_rewrite_done").select("id").maybeSingle()).data;
    }
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
    const qcResult = (researchData._qcResult as Record<string, unknown>) || {};

    if (!slug) return json({ error: "No slug found in log entry" }, 400);

    // Editor approved — apply any headline/description improvements
    const finalTitle = (qcResult.headline as string) || (metadata.title as string);
    let finalDescription = (qcResult.description as string) || (metadata.description as string);

    // A description is legitimately a standfirst/dek (no terminal period OK)
    // when the upstream extractor flagged it. publish-direct and submit-new-article
    // set this when they pulled the dek from the article HTML.
    const descIsStandfirst = Boolean(
      (metadata.descriptionIsStandfirst as boolean | undefined) ||
        ((qcResult as Record<string, unknown>).descriptionIsStandfirst as boolean | undefined)
    );

    // HARD GATE: only replace descriptions that look genuinely broken —
    // empty, mid-word, dangling connector, or metadata strip. A valid
    // standfirst like "Why some people 'get it'…needed both" passes.
    // This prevents the previous nonsense fallback that concatenated the
    // standfirst with the first body paragraph as "sentence 1".
    if (descriptionLooksBroken(finalDescription, { isStandfirst: descIsStandfirst })) {
      console.warn(`[Publish] ⚠️ Description looks broken: "${(finalDescription || "").slice(0, 80)}" (${(finalDescription || "").length} chars, standfirst=${descIsStandfirst})`);

      // Try each fallback source in order: QC → writer metadata → editor brief
      const { data: logForBrief } = await db.from("daily_article_log").select("research_data").eq("id", logId).maybeSingle();
      const editorBriefDesc = ((logForBrief?.research_data as Record<string, unknown>)?._editorBrief as Record<string, unknown>)?.description as string | undefined;
      const candidates = [
        qcResult.description as string,
        metadata.description as string,
        editorBriefDesc,
      ].filter((d): d is string => !!d && !descriptionLooksBroken(d));

      if (candidates.length > 0) {
        finalDescription = candidates[0];
        console.log(`[Publish] Restored description from candidate source (${finalDescription.length} chars)`);
      } else {
        // All sources are broken — synthesize using the shared extractor.
        // This walks <section id="introduction"> properly, skips breadcrumbs,
        // prefers a standfirst, and falls back to the first prose paragraph
        // truncated at a sentence boundary. Never concatenates standfirst +
        // body into a single run-on sentence.
        const synth = extractDescriptionFromHtml((articleData.html as string) || "");
        if (synth.description) {
          finalDescription = synth.description;
          console.log(`[Publish] Synthesized description via shared extractor (${synth.source}, ${finalDescription.length} chars)`);
        }
      }
    }

    // Fetch log entry scores for the articles table
    const { data: logScores } = await db
      .from("daily_article_log")
      .select("editor_score, grok_score, model_used")
      .eq("id", logId)
      .single();

    // Update article to published status with editor's final touches
    await db
      .from("articles")
      .update({
        title: finalTitle,
        description: finalDescription,
        draft: false,
        status: "published",
        published_at: new Date().toISOString(),
        sort_order: Date.now(),
        independence_score: logScores?.grok_score || null,
        editor_score: logScores?.editor_score || null,
        pipeline_log_id: logId,
        author_name: getByline(logScores?.model_used || MODELS.DEFAULT_CLAUDE).name,
        author_role: getByline(logScores?.model_used || MODELS.DEFAULT_CLAUDE).role,
      })
      .eq("slug", slug);

    // CAS already set status to "publishing" — just update title and editor_score
    await db
      .from("daily_article_log")
      .update({
        title: finalTitle,
        editor_score: parseScore(qcResult.qualityScore) ?? logScores?.editor_score ?? null,
      })
      .eq("id", logId);

    // Check if illustration pair already exists (handles retry after timeout)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let heroImage: string | undefined;
    let heroImageLight: string | undefined;

    const { data: existingArticle } = await db
      .from("articles")
      .select("hero_image, hero_image_light, narration_url")
      .eq("slug", slug)
      .maybeSingle();

    if (existingArticle?.hero_image) {
      heroImage = existingArticle.hero_image;
      heroImageLight = existingArticle.hero_image_light || undefined;
      if (heroImageLight) {
        console.log(`[Publish] Hero image pair already exists for ${slug} — skipping illustration generation.`);
      } else {
        console.log(`[Publish] Dark hero image exists for ${slug} — light variant still needed.`);
      }
    }

    // If this article replaces an older one, archive the old one
    const { data: logForReplace } = await db.from("daily_article_log").select("research_data").eq("id", logId).maybeSingle();
    const replacesSlug = ((logForReplace?.research_data as Record<string, unknown>)?._editorBrief as Record<string, unknown>)?.replacesSlug as string | null;
    if (replacesSlug) {
      await db.from("articles").update({ status: "archived", draft: true }).eq("slug", replacesSlug);
      console.log(`[Publish] Archived old article "${replacesSlug}" — replaced by "${slug}"`);
    }

    // ---- POST-PUBLISH ILLUSTRATION (fire-and-forget) ----
    // generate-illustration handles DB update and cost logging internally.
    // No need to block stage-publish waiting for image generation (~60-120s).
    const needsDark = !heroImage;
    const needsLight = !heroImageLight;
    if ((needsDark || needsLight) && supabaseUrl) {
      const variant = needsDark ? "both" : "light";
      console.log(`[Publish] Dispatching illustration (${variant}) for ${slug} — fire-and-forget.`);
      fetch(`${supabaseUrl}/functions/v1/generate-illustration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ action: "generate", slug, title: finalTitle, category: metadata.category, variant, logId }),
      }).catch(err =>
        console.warn(`[Publish] Illustration dispatch failed for ${slug}: ${err instanceof Error ? err.message : "unknown"}`)
      );
    }

    // ---- POST-PUBLISH NARRATION (fire-and-forget) ----
    // generate-narration handles DB update and cost logging internally.
    // Always force regeneration — if we're publishing, the narration must match the
    // current description. No conditional checks, no skip paths.
    if (supabaseUrl) {
      console.log(`[Publish] Dispatching narration for ${slug} — fire-and-forget (force=true).`);
      fetch(`${supabaseUrl}/functions/v1/generate-narration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ action: "generate", slug, logId, force: true }),
      }).catch(err =>
        console.warn(`[Publish] Narration dispatch failed for ${slug}: ${err instanceof Error ? err.message : "unknown"}`)
      );
    }

    // Smart featured rotation
    const newFeatured = await rotateFeatured(db);

    await db
      .from("daily_article_log")
      .update({ status: "published", completed_at: new Date().toISOString() })
      .eq("id", logId);

    // ── Social media content generation (non-blocking) ──
    // Fire-and-forget: social-engine generates Content Briefs for all platforms.
    // Uses direct fetch (not chain_dispatch) because logId is already "published"
    // and chain_dispatch targets pipeline stages that check active statuses.
    if (supabaseUrl) {
      fetch(`${supabaseUrl}/functions/v1/social-engine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ logId, mode: "new_article" }),
      }).catch(err =>
        console.warn(`[Publish] Social engine dispatch failed: ${err instanceof Error ? err.message : "unknown"}`)
      );
    }

    // Complete the queue item (if this article came from the queue).
    // queue_id is a proper column — can't be overwritten by research_data updates.
    // Falls back to _queueId in research_data for articles created before the column existed.
    const { data: logRow } = await db.from("daily_article_log").select("queue_id").eq("id", logId).maybeSingle();
    const queueId = logRow?.queue_id || researchData?._queueId as string | undefined;
    if (queueId) {
      await db.from("topic_queue").update({
        status: "completed",
        editor_score: logScores?.editor_score || null,
      }).eq("id", queueId);
      console.log(`[Publish] Queue item ${queueId} marked completed (editor_score: ${logScores?.editor_score ?? "null"})`);
    }

    return json({
      success: true,
      logId,
      slug,
      newFeatured,
    });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
