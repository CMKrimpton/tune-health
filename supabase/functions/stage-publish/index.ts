import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, parseScore, addCostToLog } from "../_shared/db.ts";
import { publishToGitHub } from "../_shared/github.ts";
import { assembleAstroFile, todayISO } from "../_shared/astro.ts";
import { getByline, API_TIMEOUT, MODELS, FLAT_PRICING } from "../_shared/constants.ts";
import { rotateFeatured } from "../_shared/featured.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { logId } = await req.json();
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();
    const today = todayISO();

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

    // HARD GATE: reject truncated descriptions at the last line of defense.
    // parseClaudeJSON Step 3 silently repairs truncated JSON — which can produce
    // descriptions like "Thyroid hormones are the master regulators of your metabolism, but interpreting their"
    // (cut off mid-sentence). This check catches it at publish time.
    const descTrimmed = (finalDescription || "").trim();
    const endsWithPunctuation = /[.!?]["')\u2019]?\s*$/.test(descTrimmed);
    if (!endsWithPunctuation || descTrimmed.length < 80) {
      console.warn(`[Publish] ⚠️ Description appears truncated: "${descTrimmed.slice(-60)}" (${descTrimmed.length} chars, endsPunct=${endsWithPunctuation})`);
      // Try each fallback source in order: QC → writer metadata → editor brief (from log's research_data)
      const { data: logForBrief } = await db.from("daily_article_log").select("research_data").eq("id", logId).maybeSingle();
      const editorBriefDesc = ((logForBrief?.research_data as Record<string, unknown>)?._editorBrief as Record<string, unknown>)?.description as string | undefined;
      const candidates = [
        qcResult.description as string,
        metadata.description as string,
        editorBriefDesc,
      ].filter((d): d is string => !!d && d.trim().length >= 80 && /[.!?]["')\u2019]?\s*$/.test(d.trim()));

      if (candidates.length > 0) {
        finalDescription = candidates[0];
        console.log(`[Publish] Restored description from fallback (${finalDescription.length} chars)`);
      } else {
        // All sources are truncated — synthesize from the article's first paragraph
        const firstParagraph = ((articleData.html as string) || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .split(/(?<=[.!?])\s+/)
          .slice(0, 2)
          .join(" ")
          .trim();
        if (firstParagraph.length >= 60) {
          finalDescription = firstParagraph;
          console.log(`[Publish] Synthesized description from article opening (${finalDescription.length} chars)`);
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
        independence_score: logScores?.grok_score || null,
        editor_score: logScores?.editor_score || null,
        pipeline_log_id: logId,
      })
      .eq("slug", slug);

    // Update metadata for GitHub publish
    metadata.title = finalTitle;
    metadata.description = finalDescription;

    // CAS already set status to "publishing" — just update title and editor_score
    await db
      .from("daily_article_log")
      .update({
        title: finalTitle,
        editor_score: parseScore(qcResult.qualityScore) ?? logScores?.editor_score ?? null,
      })
      .eq("id", logId);

    const readTime = (articleData.readTime as number) || 12;

    // Check if illustration already exists (handles retry after timeout)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let heroImage: string | undefined;
    let heroImageAlt: string | undefined;

    const { data: existingArticle } = await db
      .from("articles")
      .select("hero_image, hero_image_alt")
      .eq("slug", slug)
      .maybeSingle();

    if (existingArticle?.hero_image) {
      heroImage = existingArticle.hero_image;
      heroImageAlt = existingArticle.hero_image_alt || `Editorial illustration for ${finalTitle}`;
      console.log(`[Publish] Hero image already exists for ${slug} — skipping illustration generation.`);
    }

    // Publish to GitHub
    let commitInfo: { commitSha: string; commitUrl: string } | null = null;

    const astroContent = assembleAstroFile(
      {
        title: finalTitle,
        description: finalDescription,
        category: metadata.category as string,
        readTime,
        tags: (metadata.tags as string[]) || [],
      },
      articleData.html as string,
      (articleData.toc as { id: string; title: string }[]) || [],
    );

    const jsonMetadata: Record<string, unknown> = {
      title: finalTitle,
      description: finalDescription,
      category: metadata.category,
      publishDate: today,
      author: getByline(logScores?.model_used || MODELS.DEFAULT_CLAUDE),
      readTime,
      featured: false,
      draft: false,
      tags: metadata.tags,
      gradient: metadata.gradient,
      keywords: metadata.keywords,
      sortOrder: Date.now(),
    };

    if (heroImage) {
      jsonMetadata.heroImage = heroImage;
      jsonMetadata.heroImageAlt = heroImageAlt;
    }

    commitInfo = await publishToGitHub(slug, astroContent, jsonMetadata);

    // Trigger Vercel rebuild — GitHub API commits don't always fire the push webhook
    const deployHook = Deno.env.get("VERCEL_DEPLOY_HOOK");
    if (deployHook) {
      fetch(deployHook, { method: "POST" }).catch(err =>
        console.warn(`[Vercel] Deploy hook failed: ${err instanceof Error ? err.message : "unknown"}`)
      );
    } else {
      console.warn("[Vercel] VERCEL_DEPLOY_HOOK not set — Vercel won't auto-rebuild from pipeline commits");
    }

    // If this article replaces an older one, archive the old one
    const { data: logForReplace } = await db.from("daily_article_log").select("research_data").eq("id", logId).maybeSingle();
    const replacesSlug = ((logForReplace?.research_data as Record<string, unknown>)?._editorBrief as Record<string, unknown>)?.replacesSlug as string | null;
    if (replacesSlug) {
      await db.from("articles").update({ status: "archived", draft: true }).eq("slug", replacesSlug);
      console.log(`[Publish] Archived old article "${replacesSlug}" — replaced by "${slug}"`);
    }

    // ---- POST-PUBLISH ILLUSTRATION RECOVERY ----
    // Illustration runs AFTER publish (not in parallel with QC) so that:
    // 1. We don't waste GPU time on articles QC kills/revises
    // 2. If the function timed out mid-illustration, retry picks it up here
    // 3. If hero_image already existed (from a previous run), we skip generation
    // generate-illustration handles DB update + GitHub JSON sync internally
    if (!heroImage && supabaseUrl) {
      console.log(`[Publish] No hero image for ${slug} — generating illustration post-publish.`);
      try {
        const illRes = await fetch(`${supabaseUrl}/functions/v1/generate-illustration`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ action: "generate", slug, title: finalTitle, category: metadata.category }),
          signal: AbortSignal.timeout(API_TIMEOUT),
        });
        if (illRes.ok) {
          const illData = await illRes.json();
          if (illData.success && illData.imageUrl) {
            console.log(`[Publish] Illustration generated for ${slug}: ${illData.imageUrl}`);
            // Log illustration cost to pipeline
            await addCostToLog(db, logId, {
              model: "gpt-image-1",
              stage: "illustration",
              inputTokens: 0,
              outputTokens: 0,
              costUsd: FLAT_PRICING.ILLUSTRATION_USD,
            });
          }
        } else {
          console.warn(`[Publish] Illustration generation returned ${illRes.status} for ${slug}`);
        }
      } catch (illErr) {
        console.warn(`[Publish] Illustration generation failed for ${slug}: ${illErr instanceof Error ? illErr.message : "unknown"}. Article published without hero image — will recover on next retry.`);
      }
    }

    // ---- POST-PUBLISH NARRATION ----
    // Generate intro narration via ElevenLabs TTS (non-fatal — article publishes without it)
    // generate-narration handles GitHub JSON sync internally
    if (supabaseUrl) {
      const { data: narrationCheck } = await db
        .from("articles")
        .select("narration_url")
        .eq("slug", slug)
        .maybeSingle();

      const isImproveRun = !!researchData._improves;
      if (!narrationCheck?.narration_url || isImproveRun) {
        console.log(`[Publish] No narration for ${slug} — generating TTS post-publish.`);
        try {
          const narRes = await fetch(`${supabaseUrl}/functions/v1/generate-narration`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ action: "generate", slug }),
            signal: AbortSignal.timeout(API_TIMEOUT),
          });
          if (narRes.ok) {
            const narData = await narRes.json();
            if (narData.success && narData.narrationUrl) {
              console.log(`[Publish] Narration generated for ${slug}: ${narData.narrationUrl}`);
              // Log narration cost to pipeline
              const charCount = narData.characters || 0;
              if (charCount > 0) {
                await addCostToLog(db, logId, {
                  model: "eleven_multilingual_v2",
                  stage: "narration",
                  inputTokens: charCount,
                  outputTokens: 0,
                  costUsd: Math.round(charCount * FLAT_PRICING.NARRATION_PER_CHAR_USD * 10000) / 10000,
                });
              }
            }
          } else {
            console.warn(`[Publish] Narration generation returned ${narRes.status} for ${slug}`);
          }
        } catch (narErr) {
          console.warn(`[Publish] Narration generation failed for ${slug}: ${narErr instanceof Error ? narErr.message : "unknown"}. Article published without narration.`);
        }
      }
    }

    // Smart featured rotation
    const newFeatured = await rotateFeatured(db);

    await db
      .from("daily_article_log")
      .update({ status: "published", completed_at: new Date().toISOString() })
      .eq("id", logId);

    // Complete the queue item (if this article came from the queue).
    // queue_id is a proper column — can't be overwritten by research_data updates.
    // Falls back to _queueId in research_data for articles created before the column existed.
    const { data: logRow } = await db.from("daily_article_log").select("queue_id").eq("id", logId).maybeSingle();
    const queueId = logRow?.queue_id || researchData?._queueId as string | undefined;
    if (queueId) {
      await db.from("topic_queue").update({ status: "completed" }).eq("id", queueId);
      console.log(`[Publish] Queue item ${queueId} marked completed`);
    }

    return json({
      success: true,
      logId,
      commitSha: commitInfo?.commitSha,
      commitUrl: commitInfo?.commitUrl,
      newFeatured,
    });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
