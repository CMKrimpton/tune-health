import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase } from "../_shared/db.ts";
import { postToPlatform } from "../_shared/social-clients.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Social Poster — The Dispatcher
// Reads scheduled posts that are due → calls platform APIs → updates status.
// Respects choreography: skips posts whose parent hasn't been posted yet.
// Triggered by: pg_cron every 5 min.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_POSTS_PER_RUN = 10; // Rate limit: max posts per cron cycle
const MAX_RETRIES = 3;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = supabase();
    const now = new Date().toISOString();

    // Fetch posts that are due for posting
    const { data: duePosts, error: fetchError } = await db
      .from("social_posts")
      .select("id, article_slug, platform, persona, content_type, content_format, content_text, content_meta, choreography_group, timing_offset_minutes, parent_post_id, retry_count")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(MAX_POSTS_PER_RUN);

    if (fetchError) return json({ error: fetchError.message }, 500);
    if (!duePosts || duePosts.length === 0) {
      return json({ success: true, message: "No posts due", posted: 0, skipped: 0 });
    }

    // Check platform rate limits
    const platformCounts: Record<string, number> = {};
    const { data: platformConfigs } = await db
      .from("social_platform_config")
      .select("platform, rate_limit_per_hour, api_configured");

    const configMap: Record<string, { rateLimit: number; configured: boolean }> = {};
    for (const c of platformConfigs || []) {
      configMap[c.platform] = { rateLimit: c.rate_limit_per_hour || 0, configured: c.api_configured || false };
    }

    // Check how many posts were made per platform in the last hour
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recentPosts } = await db
      .from("social_posts")
      .select("platform")
      .eq("status", "posted")
      .gte("posted_at", hourAgo);

    for (const p of recentPosts || []) {
      platformCounts[p.platform] = (platformCounts[p.platform] || 0) + 1;
    }

    // Get all posted post IDs for choreography parent checks
    const choreographyGroups = [...new Set(duePosts.filter(p => p.parent_post_id).map(p => p.choreography_group))];
    const postedParentIds = new Set<string>();
    if (choreographyGroups.length > 0) {
      const { data: postedInGroups } = await db
        .from("social_posts")
        .select("id")
        .eq("status", "posted")
        .in("choreography_group", choreographyGroups);
      for (const p of postedInGroups || []) {
        postedParentIds.add(p.id);
      }
    }

    let posted = 0;
    let skipped = 0;
    let failed = 0;

    for (const post of duePosts) {
      // Skip if parent hasn't been posted yet (choreography ordering)
      if (post.parent_post_id && !postedParentIds.has(post.parent_post_id)) {
        skipped++;
        continue;
      }

      // Skip if platform isn't configured for API posting
      const config = configMap[post.platform];
      if (!config?.configured) {
        // Move to draft — these need manual posting or the platform needs to be configured
        await db.from("social_posts").update({
          status: "draft",
          error: `${post.platform} API not configured — moved to draft for manual posting`,
        }).eq("id", post.id);
        skipped++;
        continue;
      }

      // Check rate limit
      const hourlyCount = platformCounts[post.platform] || 0;
      if (config.rateLimit > 0 && hourlyCount >= config.rateLimit) {
        skipped++;
        continue;
      }

      // Mark as posting
      await db.from("social_posts").update({ status: "posting" }).eq("id", post.id);

      // Build platform-specific metadata
      const meta: Record<string, unknown> = (post.content_meta as Record<string, unknown>) || {};
      if (post.platform === "reddit") {
        meta.subreddit = (meta.subreddit as string) || "health";
        meta.kind = meta.kind || "self";
        meta.title = (meta.title as string) || (post.content_text || "").slice(0, 300);
      }

      // Post to platform
      const result = await postToPlatform(post.platform, post.content_text || "", meta);

      if (result.success) {
        await db.from("social_posts").update({
          status: "posted",
          posted_at: new Date().toISOString(),
          platform_post_id: result.platformPostId || null,
          platform_url: result.platformUrl || null,
          error: null,
        }).eq("id", post.id);

        posted++;
        platformCounts[post.platform] = hourlyCount + 1;

        // Add to posted set for choreography
        postedParentIds.add(post.id);
      } else {
        const retryCount = (post.retry_count || 0) + 1;
        const newStatus = retryCount >= MAX_RETRIES ? "failed" : "scheduled";
        // Exponential backoff: 5min, 25min, 125min
        const backoffMs = Math.pow(5, retryCount) * 60 * 1000;
        const retryAt = new Date(Date.now() + backoffMs).toISOString();

        await db.from("social_posts").update({
          status: newStatus,
          error: result.error || "Unknown posting error",
          retry_count: retryCount,
          scheduled_at: newStatus === "scheduled" ? retryAt : undefined,
        }).eq("id", post.id);

        failed++;
        console.warn(`[Social Poster] Failed to post ${post.id} to ${post.platform}: ${result.error}`);
      }
    }

    console.log(`[Social Poster] Run complete: ${posted} posted, ${skipped} skipped, ${failed} failed`);
    return json({ success: true, posted, skipped, failed, total: duePosts.length });
  } catch (err: unknown) {
    console.error(`[Social Poster] Error: ${err instanceof Error ? err.message : "Unknown"}`);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
