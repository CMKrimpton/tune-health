import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase } from "../_shared/db.ts";
import { getBlueskyEngagement, getRedditEngagement } from "../_shared/social-clients.ts";
import type { EngagementData } from "../_shared/social-clients.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Social Sync — Engagement Feedback Loop
// Pulls metrics from platform APIs for posted content → updates social_posts
// → logs time-series snapshots → detects velocity (viral posts).
// Triggered by: pg_cron every 6 hours.
// ═══════════════════════════════════════════════════════════════════════════

const SYNC_WINDOW_DAYS = 7;       // Sync engagement for posts from last 7 days
const MAX_POSTS_PER_RUN = 50;     // Limit per sync run
const VELOCITY_MULTIPLIER = 3;    // 3x avg engagement = "going viral"

// Engagement score formula: weighted sum normalized to 0-100
function calculateEngagementScore(e: EngagementData): number {
  // Weights: likes=1, shares=3 (amplification), comments=2 (depth), impressions=0.01, clicks=1.5
  const raw = (e.likes * 1) + (e.shares * 3) + (e.comments * 2) + (e.impressions * 0.01) + (e.clicks * 1.5);
  // Log scale to handle viral posts gracefully
  return raw > 0 ? Math.round(Math.log10(raw + 1) * 25) : 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = supabase();
    const cutoff = new Date(Date.now() - SYNC_WINDOW_DAYS * 86400000).toISOString();

    // Fetch posted content that needs engagement sync
    const { data: posts, error: fetchError } = await db
      .from("social_posts")
      .select("id, platform, platform_post_id, impressions, likes, shares, comments, clicks, engagement_score")
      .eq("status", "posted")
      .gte("posted_at", cutoff)
      .not("platform_post_id", "is", null)
      .order("posted_at", { ascending: false })
      .limit(MAX_POSTS_PER_RUN);

    if (fetchError) return json({ error: fetchError.message }, 500);
    if (!posts || posts.length === 0) {
      return json({ success: true, message: "No posted content to sync", synced: 0 });
    }

    let synced = 0;
    let failed = 0;
    let velocityAlerts: string[] = [];

    // Calculate current average engagement for velocity detection
    const { data: avgData } = await db
      .from("social_posts")
      .select("engagement_score")
      .eq("status", "posted")
      .not("engagement_score", "is", null)
      .gte("posted_at", cutoff);

    const avgScore = avgData && avgData.length > 0
      ? avgData.reduce((s: number, r: { engagement_score: number }) => s + (parseFloat(String(r.engagement_score)) || 0), 0) / avgData.length
      : 0;

    for (const post of posts) {
      try {
        let engagement: EngagementData | null = null;

        if (post.platform === "bluesky" && post.platform_post_id) {
          engagement = await getBlueskyEngagement(post.platform_post_id);
        } else if (post.platform === "reddit" && post.platform_post_id) {
          engagement = await getRedditEngagement(post.platform_post_id);
        }
        // Mastodon engagement API could be added here when needed

        if (!engagement) continue;

        const score = calculateEngagementScore(engagement);

        // Update the post with latest engagement data
        await db.from("social_posts").update({
          impressions: engagement.impressions,
          likes: engagement.likes,
          shares: engagement.shares,
          comments: engagement.comments,
          clicks: engagement.clicks,
          engagement_score: score,
          engagement_updated_at: new Date().toISOString(),
        }).eq("id", post.id);

        // Log time-series snapshot
        await db.from("social_engagement_log").insert({
          social_post_id: post.id,
          impressions: engagement.impressions,
          likes: engagement.likes,
          shares: engagement.shares,
          comments: engagement.comments,
          clicks: engagement.clicks,
          sampled_at: new Date().toISOString(),
        });

        // Velocity detection: is this post going viral?
        if (avgScore > 0 && score > avgScore * VELOCITY_MULTIPLIER) {
          velocityAlerts.push(`Post ${post.id} on ${post.platform}: score ${score} vs avg ${Math.round(avgScore)} (${Math.round(score / avgScore)}x)`);
          console.log(`[Social Sync] 🚀 VELOCITY ALERT: Post ${post.id} on ${post.platform} at ${score} (${Math.round(score / avgScore)}x average)`);
        }

        // Update angle registry engagement score (best score for this article)
        const { data: postData } = await db
          .from("social_posts")
          .select("article_slug")
          .eq("id", post.id)
          .maybeSingle();

        if (postData?.article_slug) {
          const { data: currentAngle } = await db
            .from("social_angle_registry")
            .select("id, engagement_score")
            .eq("article_slug", postData.article_slug)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (currentAngle && (currentAngle.engagement_score === null || score > currentAngle.engagement_score)) {
            await db.from("social_angle_registry").update({ engagement_score: score }).eq("id", currentAngle.id);
          }
        }

        // ── Template extraction: learn from high-performing posts ──
        // If this post scored 2x+ the platform average, save it as a template
        if (avgScore > 0 && score >= avgScore * 2) {
          try {
            const { data: fullPost } = await db
              .from("social_posts")
              .select("content_text, platform, persona, content_format")
              .eq("id", post.id)
              .maybeSingle();

            if (fullPost?.content_text && fullPost.content_text.length > 20) {
              // Anonymize: replace article-specific references with placeholders
              const templateText = fullPost.content_text
                .replace(/https?:\/\/[^\s)]+/g, "[ARTICLE_URL]")
                .replace(/"[^"]{20,}"/g, "[ARTICLE_TITLE]");

              // Dedup: skip if we already have a template for this platform+persona+format
              const { count: existingCount } = await db
                .from("social_templates")
                .select("*", { count: "exact", head: true })
                .eq("platform", fullPost.platform)
                .eq("persona", fullPost.persona)
                .eq("content_format", fullPost.content_format)
                .eq("source", "learned");

              // Keep max 5 learned templates per platform+persona+format combo
              if ((existingCount || 0) < 5) {
                await db.from("social_templates").insert({
                  platform: fullPost.platform,
                  persona: fullPost.persona,
                  content_format: fullPost.content_format,
                  template_text: templateText,
                  avg_engagement: score,
                  source: "learned",
                });
                console.log(`[Social Sync] Learned template from post ${post.id} (score ${score}, ${fullPost.platform}/${fullPost.persona})`);
              }
            }
          } catch (tplErr) {
            // Non-fatal — template extraction is bonus, not critical
            console.warn(`[Social Sync] Template extraction failed: ${tplErr instanceof Error ? tplErr.message : "unknown"}`);
          }
        }

        synced++;
      } catch (err) {
        console.warn(`[Social Sync] Failed to sync post ${post.id}: ${err instanceof Error ? err.message : "unknown"}`);
        failed++;
      }
    }

    console.log(`[Social Sync] Complete: ${synced} synced, ${failed} failed, ${velocityAlerts.length} velocity alerts`);

    return json({
      success: true,
      synced,
      failed,
      totalPosts: posts.length,
      avgEngagement: Math.round(avgScore * 100) / 100,
      velocityAlerts,
    });
  } catch (err: unknown) {
    console.error(`[Social Sync] Error: ${err instanceof Error ? err.message : "Unknown"}`);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
