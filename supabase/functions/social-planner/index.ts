import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addOverheadCost } from "../_shared/db.ts";
import { generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { SOCIAL_CHAINS, VALID_CATEGORIES } from "../_shared/constants.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Social Planner — The Daily Editorial Meeting
// Runs daily at 5am UTC. Mines the article catalog for reshare candidates,
// creates/maintains weekly arcs, fills the day's content plan, then
// chain-dispatches to social-engine for brief generation.
// ═══════════════════════════════════════════════════════════════════════════

const TARGET_ARTICLES_PER_DAY = 4; // How many distinct articles to promote daily
const MIN_DAYS_SINCE_SOCIAL = 14;  // Don't reshare articles promoted in last 14 days
const MIN_INDEPENDENCE_SCORE = 5;  // Quality floor for reshares

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = supabase();
    const today = new Date().toISOString().slice(0, 10);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // ── Step 1: Check if we already have enough planned content for today ──
    const { count: existingPlanCount } = await db
      .from("social_content_plan")
      .select("*", { count: "exact", head: true })
      .eq("plan_date", today)
      .in("status", ["planned", "generating", "generated"]);

    if ((existingPlanCount || 0) >= TARGET_ARTICLES_PER_DAY * 3) {
      return json({ success: true, message: "Today's plan is already full", planCount: existingPlanCount });
    }

    // ── Step 2: Create or continue weekly arc ──
    const weekStart = getWeekStart(new Date());
    const { data: existingArc } = await db
      .from("social_arcs")
      .select("id, theme, category_focus")
      .eq("week_start", weekStart)
      .maybeSingle();

    let arcId: string | null = existingArc?.id || null;

    if (!existingArc) {
      // Create a new weekly arc via AI
      const arcResult = await generateWeeklyArc(db);
      if (arcResult.arcId) {
        arcId = arcResult.arcId;
      }
    }

    // ── Step 3: Find reshare candidates from the article catalog ──
    // Articles that haven't had social promotion recently
    const cutoffDate = new Date(Date.now() - MIN_DAYS_SINCE_SOCIAL * 86400000).toISOString();

    // Get articles that were recently promoted (to exclude them)
    const { data: recentlyPromoted } = await db
      .from("social_angle_registry")
      .select("article_slug")
      .gte("created_at", cutoffDate);

    const recentSlugs = new Set((recentlyPromoted || []).map(r => r.article_slug));

    // Get all published articles
    const { data: allArticles } = await db
      .from("articles")
      .select("slug, title, description, category, tags, read_time, independence_score, hero_image, publish_date")
      .eq("status", "published")
      .eq("draft", false)
      .order("publish_date", { ascending: false });

    if (!allArticles || allArticles.length === 0) {
      return json({ success: true, message: "No published articles to promote" });
    }

    // Filter: not recently promoted, meets quality threshold
    const candidates = allArticles.filter(a =>
      !recentSlugs.has(a.slug) &&
      (a.independence_score === null || a.independence_score >= MIN_INDEPENDENCE_SCORE)
    );

    // ── Step 4: Select articles for today ──
    // Strategy: mix of recent + evergreen, category diversity
    const selectedSlugs = selectArticlesForDay(candidates, TARGET_ARTICLES_PER_DAY, existingArc?.category_focus);

    if (selectedSlugs.length === 0) {
      // If no fresh candidates, pick from least-recently-promoted
      const { data: leastRecent } = await db
        .from("social_angle_registry")
        .select("article_slug")
        .order("created_at", { ascending: true })
        .limit(TARGET_ARTICLES_PER_DAY);

      for (const r of leastRecent || []) {
        if (selectedSlugs.length < TARGET_ARTICLES_PER_DAY) {
          selectedSlugs.push(r.article_slug);
        }
      }
    }

    // ── Step 5: Chain-dispatch to social-engine for each selected article ──
    let dispatched = 0;
    for (const slug of selectedSlugs) {
      if (!supabaseUrl) continue;
      try {
        await fetch(`${supabaseUrl}/functions/v1/social-engine`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ slug, mode: "catalog" }),
          signal: AbortSignal.timeout(120_000),
        });
        dispatched++;
      } catch (err) {
        console.warn(`[Social Planner] Failed to dispatch social-engine for ${slug}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    // ── Step 6: Check for recurring series content ──
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ...
    const seriesForToday = getRecurringSeries(dayOfWeek);

    console.log(`[Social Planner] Daily meeting complete: ${dispatched} articles dispatched, arc=${arcId ? "active" : "none"}, series=${seriesForToday.join(",") || "none"}`);

    return json({
      success: true,
      articlesSelected: selectedSlugs.length,
      articlesDispatched: dispatched,
      arcId,
      todaySeries: seriesForToday,
      existingPlanCount: existingPlanCount || 0,
    });
  } catch (err: unknown) {
    console.error(`[Social Planner] Error: ${err instanceof Error ? err.message : "Unknown"}`);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function selectArticlesForDay(
  candidates: Array<{ slug: string; category: string; publish_date: string; independence_score: number | null }>,
  target: number,
  arcCategoryFocus?: string | null,
): string[] {
  const selected: string[] = [];
  const usedCategories = new Set<string>();

  // Priority 1: If there's an arc with category focus, pick one from that category
  if (arcCategoryFocus) {
    const arcCandidate = candidates.find(a => a.category === arcCategoryFocus);
    if (arcCandidate) {
      selected.push(arcCandidate.slug);
      usedCategories.add(arcCandidate.category);
    }
  }

  // Priority 2: Recent articles (published in last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const recent = candidates.filter(a => a.publish_date >= thirtyDaysAgo && !selected.includes(a.slug));
  for (const a of recent) {
    if (selected.length >= target) break;
    if (!usedCategories.has(a.category)) {
      selected.push(a.slug);
      usedCategories.add(a.category);
    }
  }

  // Priority 3: Fill remaining with highest independence score (evergreen quality)
  const evergreen = candidates
    .filter(a => !selected.includes(a.slug))
    .sort((a, b) => (b.independence_score || 0) - (a.independence_score || 0));
  for (const a of evergreen) {
    if (selected.length >= target) break;
    if (!usedCategories.has(a.category) || selected.length < target - 1) {
      selected.push(a.slug);
      usedCategories.add(a.category);
    }
  }

  return selected.slice(0, target);
}

function getRecurringSeries(dayOfWeek: number): string[] {
  // Recurring series schedule
  const schedule: Record<number, string[]> = {
    1: ["actually_monday"],     // Monday: myth-busting "Actually..." posts
    3: ["study_of_week"],       // Wednesday: Study of the Week breakdown
    5: ["friday_numbers"],      // Friday: "By the Numbers" data visualization
  };
  return schedule[dayOfWeek] || [];
}

async function generateWeeklyArc(
  db: ReturnType<typeof supabase>,
): Promise<{ arcId: string | null }> {
  try {
    // Get recent article categories to find a good theme
    const { data: recentArticles } = await db
      .from("articles")
      .select("category, title, slug")
      .eq("status", "published")
      .order("publish_date", { ascending: false })
      .limit(20);

    const categories = (recentArticles || []).map(a => a.category);
    const categoryCounts: Record<string, number> = {};
    for (const c of categories) {
      categoryCounts[c] = (categoryCounts[c] || 0) + 1;
    }

    // Pick the category with most recent articles
    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Neuroscience";
    const topArticles = (recentArticles || []).filter(a => a.category === topCategory).slice(0, 5);

    const result = await generateWithFallback({
      system: `You are a social media strategist for alumi news, a premium health publication.
Create a weekly thematic arc — a narrative thread that connects multiple articles over the week.
The arc should feel like a developing story, not just a category dump.
Return JSON: { "theme": "short title", "description": "1-2 sentences", "recurring_series": {"actually_monday": "topic", "study_of_week": "topic", "friday_numbers": "topic"} }`,
      user: `This week's focus category: ${topCategory}
Recent articles in this category:
${topArticles.map(a => `- ${a.title} (${a.slug})`).join("\n")}

All available categories: ${VALID_CATEGORIES.join(", ")}

Create a compelling weekly arc.`,
      models: SOCIAL_CHAINS.planner,
      maxTokens: 500,
      temperature: 0.5,
      stage: "social-planner-arc",
    });

    const arcData = parseClaudeJSON(result.text) as Record<string, unknown>;
    const weekStart = getWeekStart(new Date());

    const { data: inserted } = await db.from("social_arcs").insert({
      week_start: weekStart,
      theme: (arcData.theme as string) || `${topCategory} Week`,
      description: (arcData.description as string) || "",
      category_focus: topCategory,
      article_slugs: topArticles.map(a => a.slug),
      recurring_series: arcData.recurring_series || {},
      status: "active",
    }).select("id").single();

    await addOverheadCost(db, result.usage);

    return { arcId: inserted?.id || null };
  } catch (err) {
    console.warn(`[Social Planner] Arc generation failed: ${err instanceof Error ? err.message : "unknown"}`);
    return { arcId: null };
  }
}
