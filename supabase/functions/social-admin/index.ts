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
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    if (!action || typeof action !== "string") {
      return json({ error: "Missing or invalid 'action' field" }, 400);
    }
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
        if (!slug || typeof slug !== "string") return json({ error: "slug required (string)" }, 400);
        const cleanSlug = slug.trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(cleanSlug)) {
          return json({ error: "Invalid slug format" }, 400);
        }

        // Guard: check article exists before burning AI credits
        const { data: articleCheck } = await db.from("articles").select("slug").eq("slug", cleanSlug).maybeSingle();
        if (!articleCheck) return json({ error: `Article "${cleanSlug}" not found in database` }, 404);

        // Guard: check for in-progress generation (prevent duplicate spend)
        const { count: activePlans } = await db
          .from("social_content_plan")
          .select("*", { count: "exact", head: true })
          .eq("article_slug", cleanSlug)
          .in("status", ["planned", "generating"]);
        if (activePlans && activePlans > 0) {
          return json({ error: `Social content already being generated for "${cleanSlug}" (${activePlans} plans in progress)` }, 409);
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

        const res = await fetch(`${supabaseUrl}/functions/v1/social-engine`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ slug: cleanSlug, mode: "catalog" }),
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

      // ─── Trigger Daily Planner ─────────────────────────────────────
      case "run-planner": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const res = await fetch(`${supabaseUrl}/functions/v1/social-planner`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(120_000),
        });
        const data = await res.json();
        return json(data, res.ok ? 200 : 500);
      }

      // ─── Trigger Writer for planned content ───────────────────────
      case "run-writer": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const res = await fetch(`${supabaseUrl}/functions/v1/social-writer`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ articleSlug: body.slug || undefined }),
          signal: AbortSignal.timeout(120_000),
        });
        const data = await res.json();
        return json(data, res.ok ? 200 : 500);
      }

      // ─── Trigger Poster for scheduled posts ───────────────────────
      case "run-poster": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const res = await fetch(`${supabaseUrl}/functions/v1/social-poster`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(60_000),
        });
        const data = await res.json();
        return json(data, res.ok ? 200 : 500);
      }

      // ─── Trigger Engagement Sync ──────────────────────────────────
      case "run-sync": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const res = await fetch(`${supabaseUrl}/functions/v1/social-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(60_000),
        });
        const data = await res.json();
        return json(data, res.ok ? 200 : 500);
      }

      // ─── Platform Setup Status ────────────────────────────────────
      case "setup-status": {
        const { data: configs } = await db
          .from("social_platform_config")
          .select("platform, tier, desk, api_configured, config, active")
          .order("tier", { ascending: true });

        // Check which env vars are set (without revealing values)
        const envChecks: Record<string, boolean> = {
          BLUESKY_HANDLE: !!(Deno.env.get("BLUESKY_HANDLE") || "").trim(),
          BLUESKY_APP_PASSWORD: !!(Deno.env.get("BLUESKY_APP_PASSWORD") || "").trim(),
          REDDIT_CLIENT_ID: !!(Deno.env.get("REDDIT_CLIENT_ID") || "").trim(),
          REDDIT_CLIENT_SECRET: !!(Deno.env.get("REDDIT_CLIENT_SECRET") || "").trim(),
          REDDIT_USERNAME: !!(Deno.env.get("REDDIT_USERNAME") || "").trim(),
          REDDIT_PASSWORD: !!(Deno.env.get("REDDIT_PASSWORD") || "").trim(),
          MASTODON_ACCESS_TOKEN: !!(Deno.env.get("MASTODON_ACCESS_TOKEN") || "").trim(),
          MASTODON_INSTANCE: !!(Deno.env.get("MASTODON_INSTANCE") || "").trim(),
        };

        const platformSetup = {
          bluesky: {
            ready: envChecks.BLUESKY_HANDLE && envChecks.BLUESKY_APP_PASSWORD,
            missing: [
              ...(!envChecks.BLUESKY_HANDLE ? ["BLUESKY_HANDLE"] : []),
              ...(!envChecks.BLUESKY_APP_PASSWORD ? ["BLUESKY_APP_PASSWORD"] : []),
            ],
            instructions: "1. Go to bsky.app → Settings → App Passwords → Add App Password\n2. Run: supabase secrets set BLUESKY_HANDLE=your.handle BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx",
          },
          reddit: {
            ready: envChecks.REDDIT_CLIENT_ID && envChecks.REDDIT_CLIENT_SECRET && envChecks.REDDIT_USERNAME && envChecks.REDDIT_PASSWORD,
            missing: [
              ...(!envChecks.REDDIT_CLIENT_ID ? ["REDDIT_CLIENT_ID"] : []),
              ...(!envChecks.REDDIT_CLIENT_SECRET ? ["REDDIT_CLIENT_SECRET"] : []),
              ...(!envChecks.REDDIT_USERNAME ? ["REDDIT_USERNAME"] : []),
              ...(!envChecks.REDDIT_PASSWORD ? ["REDDIT_PASSWORD"] : []),
            ],
            instructions: "1. Go to reddit.com/prefs/apps → Create app → Script type\n2. Note: Client ID (under app name) + Secret\n3. Run: supabase secrets set REDDIT_CLIENT_ID=xxx REDDIT_CLIENT_SECRET=xxx REDDIT_USERNAME=xxx REDDIT_PASSWORD=xxx",
          },
          mastodon: {
            ready: envChecks.MASTODON_ACCESS_TOKEN,
            missing: [
              ...(!envChecks.MASTODON_ACCESS_TOKEN ? ["MASTODON_ACCESS_TOKEN"] : []),
            ],
            instructions: "1. Go to your Mastodon instance → Preferences → Development → New Application\n2. Scopes: read, write:statuses\n3. Run: supabase secrets set MASTODON_ACCESS_TOKEN=xxx MASTODON_INSTANCE=mastodon.social",
          },
        };

        // Check cron jobs
        const { data: cronJobs } = await db.rpc("get_cron_jobs").catch(() => ({ data: null }));

        return json({
          platforms: configs || [],
          credentials: platformSetup,
          envStatus: envChecks,
          cronJobs: cronJobs || "Unable to check cron jobs (pg_cron query failed)",
        });
      }

      // ─── Activate/Deactivate Platform ─────────────────────────────
      case "toggle-platform": {
        const { platform, active, apiConfigured } = body;
        if (!platform || typeof platform !== "string") return json({ error: "platform required (string)" }, 400);
        // Validate platform exists
        const { data: existingPlatform } = await db.from("social_platform_config").select("platform").eq("platform", platform).maybeSingle();
        if (!existingPlatform) return json({ error: `Unknown platform: ${platform}` }, 404);
        const updates: Record<string, unknown> = {};
        if (typeof active === "boolean") updates.active = active;
        if (typeof apiConfigured === "boolean") updates.api_configured = apiConfigured;
        if (Object.keys(updates).length === 0) return json({ error: "Nothing to update — provide 'active' or 'apiConfigured' (boolean)" }, 400);
        const { error } = await db.from("social_platform_config").update(updates).eq("platform", platform);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, platform, ...updates });
      }

      // ─── Batch — all dashboard data in one request ─────────────────
      case "batch": {
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const dayAgo = new Date(Date.now() - 86400000).toISOString();

        // Run all queries in parallel within a single function invocation
        const [
          totalPostsRes, postedTodayRes, queueSizeRes, draftCountRes, failedTodayRes,
          engagementRes, costRes, activePlatformsRes, recentPostsRes,
          postsRes, planRes, configsRes, platformStatsRes, arcsRes, personasRes,
        ] = await Promise.all([
          db.from("social_posts").select("*", { count: "exact", head: true }),
          db.from("social_posts").select("*", { count: "exact", head: true }).eq("status", "posted").gte("posted_at", `${today}T00:00:00Z`),
          db.from("social_posts").select("*", { count: "exact", head: true }).eq("status", "scheduled"),
          db.from("social_posts").select("*", { count: "exact", head: true }).eq("status", "draft"),
          db.from("social_posts").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", `${today}T00:00:00Z`),
          db.from("social_posts").select("engagement_score").eq("status", "posted").gte("posted_at", weekAgo).not("engagement_score", "is", null),
          db.from("social_posts").select("cost_usd").gte("created_at", `${today}T00:00:00Z`),
          db.from("social_platform_config").select("*", { count: "exact", head: true }).eq("active", true),
          db.from("social_posts").select("platform, status").gte("created_at", dayAgo),
          // Posts feed
          db.from("social_posts")
            .select("id, article_slug, platform, persona, content_type, content_format, content_text, content_meta, status, error, scheduled_at, posted_at, platform_url, impressions, likes, shares, comments, clicks, engagement_score, series_tag, cost_usd, created_at, choreography_group, timing_offset_minutes, retry_count")
            .order("created_at", { ascending: false }).limit(100),
          // Plan
          db.from("social_content_plan").select("*").eq("plan_date", today).order("created_at", { ascending: true }),
          // Platform configs
          db.from("social_platform_config").select("*").order("tier", { ascending: true }),
          // Platform stats (for lastPostAt)
          db.from("social_posts").select("platform, status, posted_at").eq("status", "posted").order("posted_at", { ascending: false }),
          // Arcs
          db.from("social_arcs").select("*").order("week_start", { ascending: false }).limit(4),
          // Personas
          db.from("social_personas").select("*").order("id"),
        ]);

        // Build stats
        const engagementData = engagementRes.data || [];
        const avgEngagement = engagementData.length > 0
          ? engagementData.reduce((s: number, r: { engagement_score: number }) => s + (parseFloat(String(r.engagement_score)) || 0), 0) / engagementData.length
          : 0;
        const todayCost = (costRes.data || []).reduce((s: number, r: { cost_usd: number }) => s + (parseFloat(String(r.cost_usd)) || 0), 0);

        const platformBreakdown: Record<string, { posted: number; scheduled: number; failed: number; draft: number }> = {};
        for (const p of recentPostsRes.data || []) {
          if (!platformBreakdown[p.platform]) platformBreakdown[p.platform] = { posted: 0, scheduled: 0, failed: 0, draft: 0 };
          const status = p.status as "posted" | "scheduled" | "failed" | "draft";
          if (status in platformBreakdown[p.platform]) platformBreakdown[p.platform][status]++;
        }

        // Build platform health
        const lastPostMap: Record<string, string> = {};
        const todayCountMap: Record<string, number> = {};
        for (const p of platformStatsRes.data || []) {
          if (!lastPostMap[p.platform] && p.posted_at) lastPostMap[p.platform] = p.posted_at;
          if (p.posted_at?.startsWith(today)) todayCountMap[p.platform] = (todayCountMap[p.platform] || 0) + 1;
        }
        const platforms = (configsRes.data || []).map((c: Record<string, unknown>) => ({
          ...c,
          lastPostAt: lastPostMap[c.platform as string] || null,
          todayPosted: todayCountMap[c.platform as string] || 0,
        }));

        return json({
          stats: {
            totalPosts: totalPostsRes.count || 0,
            postedToday: postedTodayRes.count || 0,
            queueSize: queueSizeRes.count || 0,
            draftCount: draftCountRes.count || 0,
            failedToday: failedTodayRes.count || 0,
            avgEngagement: Math.round(avgEngagement * 100) / 100,
            todayCost: Math.round(todayCost * 10000) / 10000,
            activePlatforms: activePlatformsRes.count || 0,
            platformBreakdown,
          },
          posts: postsRes.data || [],
          plan: planRes.data || [],
          platforms,
          arcs: arcsRes.data || [],
          personas: personasRes.data || [],
        });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
