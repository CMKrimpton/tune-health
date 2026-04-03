import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase } from "../_shared/db.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Social Admin — Dashboard API
// Actions: status, posts, plan, platforms, arcs, angles, skip, retry,
//          generate-for-article, pause-all
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    const db = supabase();

    switch (action) {
      // ─── Dashboard Status (stats strip) ────────────────────────────
      case "status": {
        const today = new Date().toISOString().slice(0, 10);

        // Total posts
        const { count: totalPosts } = await db
          .from("social_posts")
          .select("*", { count: "exact", head: true });

        // Posted today
        const { count: postedToday } = await db
          .from("social_posts")
          .select("*", { count: "exact", head: true })
          .eq("status", "posted")
          .gte("posted_at", `${today}T00:00:00Z`);

        // Scheduled (queue)
        const { count: queueSize } = await db
          .from("social_posts")
          .select("*", { count: "exact", head: true })
          .eq("status", "scheduled");

        // Draft (awaiting review)
        const { count: draftCount } = await db
          .from("social_posts")
          .select("*", { count: "exact", head: true })
          .eq("status", "draft");

        // Failed today
        const { count: failedToday } = await db
          .from("social_posts")
          .select("*", { count: "exact", head: true })
          .eq("status", "failed")
          .gte("created_at", `${today}T00:00:00Z`);

        // Avg engagement score (posted, last 7 days)
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: engagementData } = await db
          .from("social_posts")
          .select("engagement_score")
          .eq("status", "posted")
          .gte("posted_at", weekAgo)
          .not("engagement_score", "is", null);
        const avgEngagement = engagementData && engagementData.length > 0
          ? engagementData.reduce((s: number, r: { engagement_score: number }) => s + (parseFloat(String(r.engagement_score)) || 0), 0) / engagementData.length
          : 0;

        // Today's AI cost
        const { data: costData } = await db
          .from("social_posts")
          .select("cost_usd")
          .gte("created_at", `${today}T00:00:00Z`);
        const todayCost = (costData || []).reduce((s: number, r: { cost_usd: number }) => s + (parseFloat(String(r.cost_usd)) || 0), 0);

        // Active platforms count
        const { count: activePlatforms } = await db
          .from("social_platform_config")
          .select("*", { count: "exact", head: true })
          .eq("active", true);

        // Posts by platform (last 24h)
        const { data: recentPosts } = await db
          .from("social_posts")
          .select("platform, status")
          .gte("created_at", new Date(Date.now() - 86400000).toISOString());

        const platformBreakdown: Record<string, { posted: number; scheduled: number; failed: number; draft: number }> = {};
        for (const p of recentPosts || []) {
          if (!platformBreakdown[p.platform]) platformBreakdown[p.platform] = { posted: 0, scheduled: 0, failed: 0, draft: 0 };
          const status = p.status as "posted" | "scheduled" | "failed" | "draft";
          if (status in platformBreakdown[p.platform]) platformBreakdown[p.platform][status]++;
        }

        return json({
          totalPosts: totalPosts || 0,
          postedToday: postedToday || 0,
          queueSize: queueSize || 0,
          draftCount: draftCount || 0,
          failedToday: failedToday || 0,
          avgEngagement: Math.round(avgEngagement * 100) / 100,
          todayCost: Math.round(todayCost * 10000) / 10000,
          activePlatforms: activePlatforms || 0,
          platformBreakdown,
        });
      }

      // ─── Recent Posts Feed ─────────────────────────────────────────
      case "posts": {
        const limit = body.limit || 50;
        const offset = body.offset || 0;
        const platformFilter = body.platform || null;
        const statusFilter = body.statusFilter || null;

        let query = db
          .from("social_posts")
          .select("id, article_slug, platform, persona, content_type, content_format, content_text, content_meta, status, error, scheduled_at, posted_at, platform_url, impressions, likes, shares, comments, clicks, engagement_score, series_tag, cost_usd, created_at, choreography_group, timing_offset_minutes, retry_count")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (platformFilter) query = query.eq("platform", platformFilter);
        if (statusFilter) query = query.eq("status", statusFilter);

        const { data: posts, error } = await query;
        if (error) return json({ error: error.message }, 500);

        return json({ posts: posts || [] });
      }

      // ─── Today's Content Plan ──────────────────────────────────────
      case "plan": {
        const planDate = body.date || new Date().toISOString().slice(0, 10);
        const { data: plan } = await db
          .from("social_content_plan")
          .select("*")
          .eq("plan_date", planDate)
          .order("created_at", { ascending: true });

        return json({ plan: plan || [], date: planDate });
      }

      // ─── Platform Health ───────────────────────────────────────────
      case "platforms": {
        const { data: configs } = await db
          .from("social_platform_config")
          .select("*")
          .order("tier", { ascending: true });

        // Get last post time + counts per platform
        const { data: platformStats } = await db
          .from("social_posts")
          .select("platform, status, posted_at")
          .eq("status", "posted")
          .order("posted_at", { ascending: false });

        const lastPostMap: Record<string, string> = {};
        const todayCountMap: Record<string, number> = {};
        const today = new Date().toISOString().slice(0, 10);

        for (const p of platformStats || []) {
          if (!lastPostMap[p.platform] && p.posted_at) {
            lastPostMap[p.platform] = p.posted_at;
          }
          if (p.posted_at?.startsWith(today)) {
            todayCountMap[p.platform] = (todayCountMap[p.platform] || 0) + 1;
          }
        }

        const platformHealth = (configs || []).map(c => ({
          ...c,
          lastPostAt: lastPostMap[c.platform] || null,
          todayPosted: todayCountMap[c.platform] || 0,
        }));

        return json({ platforms: platformHealth });
      }

      // ─── Weekly Arc ────────────────────────────────────────────────
      case "arcs": {
        const { data: arcs } = await db
          .from("social_arcs")
          .select("*")
          .order("week_start", { ascending: false })
          .limit(4);

        return json({ arcs: arcs || [] });
      }

      // ─── Angle Registry ────────────────────────────────────────────
      case "angles": {
        const articleSlug = body.slug;
        let query = db
          .from("social_angle_registry")
          .select("*")
          .order("created_at", { ascending: false });

        if (articleSlug) query = query.eq("article_slug", articleSlug);
        else query = query.limit(50);

        const { data: angles } = await query;
        return json({ angles: angles || [] });
      }

      // ─── Top Performers (Engagement Leaderboard) ───────────────────
      case "leaderboard": {
        const limit = body.limit || 10;
        const { data: topPosts } = await db
          .from("social_posts")
          .select("id, article_slug, platform, persona, content_type, content_text, impressions, likes, shares, comments, clicks, engagement_score, posted_at")
          .eq("status", "posted")
          .order("engagement_score", { ascending: false })
          .limit(limit);

        return json({ topPosts: topPosts || [] });
      }

      // ─── Skip a Post ───────────────────────────────────────────────
      case "skip": {
        const { postId } = body;
        if (!postId) return json({ error: "postId required" }, 400);
        const { error } = await db
          .from("social_posts")
          .update({ status: "skipped" })
          .eq("id", postId)
          .in("status", ["draft", "scheduled"]);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, postId });
      }

      // ─── Retry a Failed Post ───────────────────────────────────────
      case "retry": {
        const { postId } = body;
        if (!postId) return json({ error: "postId required" }, 400);
        const { error } = await db
          .from("social_posts")
          .update({ status: "scheduled", error: null, retry_count: 0 })
          .eq("id", postId)
          .eq("status", "failed");
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, postId });
      }

      // ─── Generate Social for Article ───────────────────────────────
      case "generate": {
        const { slug } = body;
        if (!slug) return json({ error: "slug required" }, 400);

        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

        const res = await fetch(`${supabaseUrl}/functions/v1/social-engine`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ slug, mode: "catalog" }),
          signal: AbortSignal.timeout(120_000),
        });

        const data = await res.json();
        return json(data, res.ok ? 200 : 500);
      }

      // ─── Personas ──────────────────────────────────────────────────
      case "personas": {
        const { data: personas } = await db
          .from("social_personas")
          .select("*")
          .order("id");
        return json({ personas: personas || [] });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
