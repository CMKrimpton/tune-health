import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, parseScore } from "../_shared/db.ts";
import { publishToGitHub } from "../_shared/github.ts";
import { assembleAstroFile, todayISO } from "../_shared/astro.ts";
import { getByline, API_TIMEOUT } from "../_shared/constants.ts";
import { rotateFeatured } from "../_shared/featured.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { logId } = await req.json();
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();
    const today = todayISO();

    // Atomic CAS: claim this article. Two valid input statuses — try each.
    let claimed = (await db.from("daily_article_log")
      .update({ status: "publishing", stage_started_at: new Date().toISOString() })
      .eq("id", logId).eq("status", "qc_approved").select("id").maybeSingle()).data;
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
      author: getByline(logScores?.model_used || "claude-sonnet-4-6"),
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
            heroImage = illData.imageUrl;
            heroImageAlt = `Editorial illustration for ${finalTitle}`;
            console.log(`[Publish] Illustration generated for ${slug}: ${heroImage}`);

            // Update the article DB record with the hero image
            await db.from("articles").update({
              hero_image: heroImage,
              hero_image_alt: heroImageAlt,
            }).eq("slug", slug);

            // Update the GitHub .json file to include heroImage
            const githubToken = (Deno.env.get("GITHUB_TOKEN") || "").trim();
            const githubRepo = (Deno.env.get("GITHUB_REPO") || "").trim();
            if (githubToken && githubRepo) {
              try {
                const jsonPath = `src/content/articles/${slug}.json`;
                const apiBase = `https://api.github.com/repos/${githubRepo}`;
                const ghHeaders = {
                  Authorization: `Bearer ${githubToken}`,
                  Accept: "application/vnd.github.v3+json",
                  "Content-Type": "application/json",
                };
                // Fetch current .json file from GitHub to get its SHA and content
                const fileRes = await fetch(`${apiBase}/contents/${jsonPath}?ref=main`, { headers: ghHeaders });
                if (fileRes.ok) {
                  const fileData = await fileRes.json();
                  const existingContent = JSON.parse(atob(fileData.content.replace(/\n/g, "")));
                  existingContent.heroImage = heroImage;
                  existingContent.heroImageAlt = heroImageAlt;
                  const updatedContent = btoa(unescape(encodeURIComponent(JSON.stringify(existingContent, null, 2) + "\n")));
                  const updateRes = await fetch(`${apiBase}/contents/${jsonPath}`, {
                    method: "PUT",
                    headers: ghHeaders,
                    body: JSON.stringify({
                      message: `feat: Add hero image — '${slug}'`,
                      content: updatedContent,
                      sha: fileData.sha,
                      branch: "main",
                    }),
                  });
                  if (updateRes.ok) {
                    console.log(`[Publish] Updated GitHub .json with hero image for ${slug}`);
                    // Trigger another Vercel rebuild for the hero image update
                    const rebuildHook = Deno.env.get("VERCEL_DEPLOY_HOOK");
                    if (rebuildHook) {
                      fetch(rebuildHook, { method: "POST" }).catch(() => {});
                    }
                  } else {
                    console.warn(`[Publish] ⚠️ Failed to update GitHub .json with hero image: ${updateRes.status}`);
                  }
                }
              } catch (ghErr) {
                console.warn(`[Publish] ⚠️ GitHub .json hero image update failed: ${ghErr instanceof Error ? ghErr.message : "unknown"}`);
              }
            }
          }
        } else {
          console.warn(`[Publish] ⚠️ Illustration generation returned ${illRes.status} for ${slug}`);
        }
      } catch (illErr) {
        console.warn(`[Publish] ⚠️ Illustration generation failed for ${slug}: ${illErr instanceof Error ? illErr.message : "unknown"}. Article published without hero image — will recover on next retry.`);
      }
    }

    // Smart featured rotation
    const newFeatured = await rotateFeatured(db);

    await db
      .from("daily_article_log")
      .update({ status: "published", completed_at: new Date().toISOString() })
      .eq("id", logId);

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
