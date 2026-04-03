import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addOverheadCost } from "../_shared/db.ts";
import { generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { MODELS, SOCIAL_CHAINS, VALID_CATEGORIES } from "../_shared/constants.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Social Engine — The Strategic Brain
// Generates Content Briefs for new + catalog articles.
// Triggered by: stage-publish (new article) or social-planner (catalog mining)
// ═══════════════════════════════════════════════════════════════════════════

interface ContentBrief {
  article: {
    slug: string;
    title: string;
    url: string;
    category: string;
    readTime: number;
    heroImage?: string;
  };
  strategy: {
    core_thesis: string;
    viral_angle: string;
    controversy?: string;
    emotional_triggers: string[];
    key_findings: Array<{ finding: string; stat?: string; source?: string }>;
    quotable_lines: string[];
    visual_concept?: string;
    target_segments: string[];
    hashtags: { primary: string[]; niche: string[] };
  };
  assignments: {
    desks: string[];
    personas: Record<string, string[]>;
    priority: "high" | "normal" | "low";
    choreography?: {
      sequence: Array<{
        persona: string;
        platform: string;
        format: string;
        offset_min: number;
        references?: string;
        hook?: string;
      }>;
    };
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { logId, slug, mode } = body;
    // mode: "new_article" (from stage-publish) or "catalog" (from planner)

    const db = supabase();

    // Fetch article data
    let articleSlug = slug;
    let articleTitle = "";
    let articleDescription = "";
    let articleCategory = "";
    let readTime = 0;
    let heroImage: string | null = null;
    let articleTags: string[] = [];

    if (logId) {
      // New article — fetch from pipeline log
      const { data: log } = await db
        .from("daily_article_log")
        .select("slug, title, research_data")
        .eq("id", logId)
        .maybeSingle();
      if (!log) return json({ error: "Log entry not found" }, 404);

      articleSlug = log.slug;
      articleTitle = log.title || "";
      const rd = (log.research_data as Record<string, unknown>) || {};
      const meta = ((rd._article as Record<string, unknown>)?.metadata as Record<string, unknown>) || {};
      articleDescription = (meta.description as string) || "";
      articleCategory = (meta.category as string) || (rd.category as string) || "";
      readTime = ((rd._article as Record<string, unknown>)?.readTime as number) || 0;
      articleTags = (meta.tags as string[]) || (rd.tags as string[]) || [];
    }

    if (articleSlug) {
      // Enrich from articles table
      const { data: article } = await db
        .from("articles")
        .select("title, description, category, tags, read_time, hero_image, keywords")
        .eq("slug", articleSlug)
        .maybeSingle();
      if (article) {
        articleTitle = articleTitle || article.title;
        articleDescription = articleDescription || article.description;
        articleCategory = articleCategory || article.category;
        readTime = readTime || article.read_time;
        heroImage = article.hero_image;
        articleTags = articleTags.length > 0 ? articleTags : (article.tags || []);
      }
    }

    if (!articleSlug || !articleTitle) {
      return json({ error: "No article found — need logId or slug" }, 400);
    }

    // Fetch existing angles to avoid repetition
    const { data: existingAngles } = await db
      .from("social_angle_registry")
      .select("angle_used, hook_type, engagement_score")
      .eq("article_slug", articleSlug)
      .order("created_at", { ascending: false })
      .limit(20);

    const anglesUsed = (existingAngles || []).map(a => `- ${a.angle_used} (${a.hook_type}, score: ${a.engagement_score})`).join("\n");

    // Fetch active platforms + desks
    const { data: platforms } = await db
      .from("social_platform_config")
      .select("platform, desk, daily_post_target, content_formats, config")
      .eq("active", true);

    const activePlatforms = (platforms || []).map(p => `${p.platform} (${p.desk}): formats=${(p.content_formats || []).join(",")}`).join("\n");

    // Fetch personas
    const { data: personas } = await db
      .from("social_personas")
      .select("id, display_name, platforms")
      .eq("active", true);

    const activePersonas = (personas || []).map(p => `${p.id} (${p.display_name}): platforms=${(p.platforms || []).join(",")}`).join("\n");

    // Fetch current arc (if any)
    const today = new Date().toISOString().slice(0, 10);
    const { data: currentArc } = await db
      .from("social_arcs")
      .select("id, theme, description, category_focus, recurring_series")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const arcContext = currentArc
      ? `Current weekly arc: "${currentArc.theme}" — ${currentArc.description || "no description"}. Category focus: ${currentArc.category_focus || "none"}.`
      : "No active weekly arc.";

    const siteUrl = "https://tune-health.vercel.app";

    // Generate Content Brief via AI
    const system = `You are a social media strategist for alumi news — a health newsroom that questions everything, cites everything, and talks to 20-35 year olds like adults.

Your job is to create a Content Brief — a strategic document that tells content desks WHAT to say and WHY, but never writes the actual posts.

VOICE RULES:
- Think: Bill Maher's writing staff meets a Bloomberg health desk. Sharp, funny when possible, always specific
- Lead with what's surprising, counterintuitive, or uncomfortable. "You've been told X. The data says Y."
- Follow-the-money framing: name the institution, the dollar amount, the incentive structure
- No emojis in brand voice. No hedging. No wellness-speak. No "Studies suggest" — say what the data shows
- Second-person address: speak TO the reader, not about "people" or "consumers"
- Every quotable line should make someone screenshot it and send it to a group chat

STRATEGY RULES:
- The viral angle should make someone text it to a friend: "wait, did you know...?"
- Key findings MUST include specific numbers, specific institutions, specific dollar amounts
- Quotable lines should be standalone-provocative. Each one a different angle — the finding, the money trail, the institutional failure, the personal implication, the uncomfortable question
- Choreography: brand drops the bomb first, reporter shows the receipts 1h later, skeptic follows the money 3h later
- Assign desks and personas based on where the content fits naturally
- Skip desks that don't fit (e.g., skip visual desk for complex policy articles)

CRITICAL CONSTRAINTS:
- MAX 5-6 posts total. Quality over quantity. Never spam 10+ platforms with the same take.
- Pick 2-3 PLATFORMS max (the ones where this article's audience actually lives)
- Each choreography item MUST have a unique "hook" — a different angle or entry point. If brand leads with the shocking finding, reporter leads with the methodology/sample size, skeptic leads with who funded it and why. NEVER repeat the same hook across items.
- The quotable_lines array should have 5+ VARIED lines — not variations of the same sentence. At least one should be funny. At least one should name a dollar amount or institution.`;

    const user = `Generate a Content Brief for this article:

ARTICLE:
- Title: ${articleTitle}
- Description: ${articleDescription}
- Category: ${articleCategory}
- Tags: ${articleTags.join(", ")}
- Read time: ${readTime} min
- URL: ${siteUrl}/articles/${articleSlug}

${anglesUsed ? `ANGLES ALREADY USED (must find a NEW angle):\n${anglesUsed}` : "No previous angles — this is the first social push for this article."}

ACTIVE PLATFORMS:
${activePlatforms}

ACTIVE PERSONAS:
${activePersonas}

${arcContext}

MODE: ${mode === "catalog" ? "Catalog reshare — find a fresh angle on an older article" : "New article promotion — this just published"}

Return a JSON Content Brief with this structure:
{
  "strategy": {
    "core_thesis": "one sentence — the article's central claim",
    "viral_angle": "the primary hook that makes someone stop scrolling",
    "controversy": "the uncomfortable question this raises (optional)",
    "emotional_triggers": ["surprise", "curiosity", etc.],
    "key_findings": [{"finding": "...", "stat": "X%", "source": "Journal 2025"}],
    "quotable_lines": ["5+ standalone-compelling lines — each one DIFFERENT, covering different aspects of the article"],
    "visual_concept": "image/graphic idea for visual platforms",
    "target_segments": ["who cares most about this"],
    "hashtags": {"primary": ["3-5 broad"], "niche": ["3-5 specific"]}
  },
  "assignments": {
    "desks": ["microblog", "forum"],
    "personas": {"brand": ["bluesky", "reddit"], "reporter": ["bluesky"], "skeptic": ["reddit"]},
    "priority": "high" | "normal" | "low",
    "choreography": {
      "sequence": [
        {"persona": "brand", "platform": "bluesky", "format": "post", "offset_min": 0, "hook": "The one-line gut punch — the stat or claim that makes someone stop scrolling and say 'wait, what?'"},
        {"persona": "brand", "platform": "reddit", "format": "link_post", "offset_min": 15, "hook": "Follow the money — name the companies, the dollar amounts, the incentive structure behind this finding"},
        {"persona": "reporter", "platform": "bluesky", "format": "thread", "offset_min": 60, "hook": "The receipts — what the study actually measured, the sample size, and what the press release conveniently left out", "references": "brand"},
        {"persona": "skeptic", "platform": "reddit", "format": "comment", "offset_min": 180, "hook": "The uncomfortable question — who funded this, who benefits, and what are they not telling you?", "references": "brand"}
      ]
    }
  }
}

RULES FOR CHOREOGRAPHY:
- MAX 5-6 items. Think carefully — which 5 posts will have the most impact?
- Each item's "hook" field describes a UNIQUE angle. The writer will use this hook, NOT the viral_angle, to write the post. If two hooks sound similar, delete one.
- 2-3 platforms max. Pick where the audience for THIS topic actually is.
- Brand gets 2-3 posts (different platforms, different hooks). Reporter and skeptic get 1-2 each.`;

    const result = await generateWithFallback({
      system,
      user,
      models: SOCIAL_CHAINS.planner,
      maxTokens: 3000,
      temperature: 0.4,
      stage: "social-engine",
    });

    const briefData = parseClaudeJSON(result.text) as Record<string, unknown>;
    const strategy = briefData.strategy as ContentBrief["strategy"];
    const assignments = briefData.assignments as ContentBrief["assignments"];

    if (!strategy || !assignments) {
      return json({ error: "AI returned invalid Content Brief — missing strategy or assignments" }, 500);
    }

    // Build full brief
    const brief: ContentBrief = {
      article: {
        slug: articleSlug,
        title: articleTitle,
        url: `${siteUrl}/articles/${articleSlug}`,
        category: articleCategory,
        readTime: readTime,
        heroImage: heroImage || undefined,
      },
      strategy,
      assignments,
    };

    // Write content plan rows — one per desk×persona×platform assignment
    const planRows: Array<Record<string, unknown>> = [];
    const now = new Date();
    const baseTime = new Date(now.getTime());

    for (const item of assignments.choreography?.sequence || []) {
      const desk = (platforms || []).find(p => p.platform === item.platform)?.desk || "microblog";
      planRows.push({
        plan_date: today,
        platform: item.platform,
        content_type: mode === "catalog" ? "evergreen" : "new_promo",
        content_format: item.format || "post",
        article_slug: articleSlug,
        persona: item.persona,
        desk,
        brief: {
          ...brief.strategy,
          article: brief.article,
          references: item.references || null,
          hook: (item as Record<string, unknown>).hook || null,
        },
        arc_id: currentArc?.id || null,
        status: "planned",
      });
    }

    // Insert plan rows
    if (planRows.length > 0) {
      const { error: planError } = await db.from("social_content_plan").insert(planRows);
      if (planError) {
        console.error(`[Social Engine] Failed to insert content plan: ${planError.message}`);
      }
    }

    // Chain-dispatch to social-writer to generate actual post text
    // social-writer reads all planned content_plan rows — no need to pass IDs
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    if (supabaseUrl && planRows.length > 0) {
      fetch(`${supabaseUrl}/functions/v1/social-writer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ articleSlug }),
      }).catch(err =>
        console.warn(`[Social Engine] Writer dispatch failed: ${err instanceof Error ? err.message : "unknown"}`)
      );
    }

    // Register the angle
    if (strategy.viral_angle) {
      await db.from("social_angle_registry").insert({
        article_slug: articleSlug,
        angle_used: strategy.viral_angle,
        hook_type: strategy.emotional_triggers?.[0] || "general",
        platforms_used: assignments.choreography?.sequence?.map(s => s.platform) || [],
      });
    }

    // Log overhead cost
    await addOverheadCost(db, result.usage);

    return json({
      success: true,
      articleSlug,
      brief,
      planRowsCreated: planRows.length,
      modelUsed: result.modelUsed,
      cost: result.usage.costUsd,
    });
  } catch (err: unknown) {
    console.error(`[Social Engine] Error: ${err instanceof Error ? err.message : "Unknown"}`);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
