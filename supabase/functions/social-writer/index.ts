import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addOverheadCost } from "../_shared/db.ts";
import { generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { SOCIAL_CHAINS } from "../_shared/constants.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Social Writer — The Content Factory
// Takes Content Briefs from social_content_plan → generates platform-native
// post text using each persona's model → writes to social_posts.
// Triggered by: social-engine (chain) or social-planner (chain) or manual.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_BATCH = 20; // Max plan rows to process per invocation

// Platform character limits and format rules
const PLATFORM_RULES: Record<string, { maxChars: number; rules: string }> = {
  bluesky:   { maxChars: 300, rules: "Max 300 chars. No hashtags in body (Bluesky doesn't support them). Include article URL. Punchy, direct, no fluff." },
  reddit:    { maxChars: 10000, rules: "Markdown format. For self-posts: compelling title (max 300 chars) + body with key points, stats, and discussion prompt. End with a question to spark comments. Include article link naturally. No clickbait titles — Reddit hates that." },
  mastodon:  { maxChars: 500, rules: "Max 500 chars. Hashtags welcome (3-5 relevant ones at end). Include article URL. More casual, community-oriented tone." },
  threads:   { maxChars: 500, rules: "Max 500 chars. Conversational, punchy. Can use emojis sparingly. Include article URL." },
  linkedin:  { maxChars: 3000, rules: "Professional tone. Lead with a hook, use line breaks for readability. Include 3-5 hashtags at end. Data-forward. Include article URL." },
  x:         { maxChars: 280, rules: "Max 280 chars. Sharp, quotable. Include article URL (counts ~23 chars). No hashtags unless truly trending." },
  telegram:  { maxChars: 4096, rules: "Can be longer. HTML formatting (bold, italic, links). Informative digest style. Include article URL as inline link." },
  medium:    { maxChars: 50000, rules: "Article excerpt format. 2-3 paragraphs highlighting key findings. End with 'Read the full article' link. Markdown." },
  newsletter: { maxChars: 5000, rules: "Email-friendly digest format. 1-2 paragraph summary + key bullet points + read more link. No images (plain text)." },
  pinterest: { maxChars: 500, rules: "Description for a health infographic pin. Include key stat + article URL. Keyword-rich for search." },
  instagram: { maxChars: 2200, rules: "Caption for image post. Hook in first line. Use emojis as section markers. 15-20 hashtags at end. Include 'link in bio' CTA." },
  quora:     { maxChars: 5000, rules: "Answer format. Start by addressing a question this article answers. Evidence-first, cite specific findings. Include article URL as source." },
  hackernews: { maxChars: 300, rules: "Title only (max 80 chars for title). Factual, no hype, no clickbait. HN audience is technical and skeptical. Submit as link post." },
};

// Persona voice directions
const PERSONA_VOICES: Record<string, string> = {
  brand: `You ARE alumi news — the publication's voice. Evidence-first, slightly irreverent, never preachy.
Think: Bloomberg meets a brilliant friend who reads the studies. Lead with the surprise. No emojis. No hedging.
Sharp hooks that make smart 25-35 year olds stop scrolling. Confident, not arrogant. "We found" not "Studies suggest."`,

  reporter: `You are Max Lundin, senior health correspondent. Data-obsessed, methodical, loves threading complex findings into digestible sequences.
Your thing: "Here's what the study actually found" — you cut through headlines to the real data.
Use specific numbers. Cite sources. Build threads that teach. Slightly academic but never boring.`,

  skeptic: `You are The Devil's Advocate. Your job is to challenge, question, provoke.
"But wait — have we considered..." "The study everyone's sharing has a problem..." "Industry doesn't want you asking this..."
Contrarian but intellectually honest. You don't deny evidence — you stress-test it. Provocative questions > assertions.
Think: science journalist who's been burned by p-hacking and industry-funded studies.`,

  curator: `You are The alumi Digest. You curate, connect, contextualize.
"If you read one thing today..." "This connects to something we covered last week..." "Three studies, one pattern..."
Your strength is synthesis — connecting dots between articles, studies, and trends. Warm but authoritative.
Reading-list energy. The smart friend who always has the perfect article recommendation.`,
};

interface PlanRow {
  id: string;
  platform: string;
  persona: string;
  content_format: string;
  article_slug: string;
  desk: string;
  brief: Record<string, unknown>;
  arc_id: string | null;
  series_tag: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { articleSlug } = body as { articleSlug?: string };
    const db = supabase();

    // Recovery: unstick plan rows that have been "generating" for 10+ minutes (crashed previous run)
    const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await db.from("social_content_plan")
      .update({ status: "planned" })
      .eq("status", "generating")
      .lt("created_at", stuckCutoff);

    // Fetch planned content that needs writing
    let query = db
      .from("social_content_plan")
      .select("id, platform, persona, content_format, article_slug, desk, brief, arc_id, series_tag")
      .eq("status", "planned")
      .order("created_at", { ascending: true })
      .limit(MAX_BATCH);

    if (articleSlug) {
      query = query.eq("article_slug", articleSlug);
    }

    const { data: planRows, error: planError } = await query;
    if (planError) return json({ error: planError.message }, 500);
    if (!planRows || planRows.length === 0) {
      return json({ success: true, message: "No planned content to write", postsCreated: 0 });
    }

    // Mark them as generating so no other invocation picks them up
    const planIds = planRows.map((r: PlanRow) => r.id);
    await db.from("social_content_plan").update({ status: "generating" }).in("id", planIds);

    // Group by choreography: all posts for same article get same choreography_group
    const choreographyGroups: Record<string, string> = {};
    for (const row of planRows as PlanRow[]) {
      if (!choreographyGroups[row.article_slug]) {
        choreographyGroups[row.article_slug] = crypto.randomUUID();
      }
    }

    const posts: Array<Record<string, unknown>> = [];
    const usages: Array<{ costUsd: number }> = [];
    const succeededPlanIds: string[] = [];
    let failedCount = 0;

    for (const row of planRows as PlanRow[]) {
      try {
        const brief = row.brief || {};
        const article = (brief.article as Record<string, unknown>) || {};
        const platformRule = PLATFORM_RULES[row.platform] || { maxChars: 500, rules: "General social post. Include article URL." };
        const personaVoice = PERSONA_VOICES[row.persona] || PERSONA_VOICES.brand;
        const chain = SOCIAL_CHAINS[row.persona] || SOCIAL_CHAINS.brand;

        // Check if platform is configured for automated posting
        const { data: platformConfig } = await db
          .from("social_platform_config")
          .select("api_configured, config")
          .eq("platform", row.platform)
          .maybeSingle();

        const isManual = !platformConfig?.api_configured;

        const system = `You are writing a social media post for ${row.platform}.

PERSONA: ${row.persona}
${personaVoice}

PLATFORM RULES:
${platformRule.rules}

OUTPUT FORMAT:
Return a JSON object:
${row.platform === "reddit" ? `{
  "title": "Reddit post title (max 300 chars, no clickbait)",
  "body": "Full post body in markdown",
  "subreddit": "best matching subreddit from: health, science, supplements, nutrition, fitness, longevity, sleep, neuroscience"
}` : row.platform === "hackernews" ? `{
  "title": "HN submission title (max 80 chars, factual)",
  "body": ""
}` : `{
  "title": "",
  "body": "The full post text including article URL"
}`}

IMPORTANT:
- The post must be COMPLETE and ready to publish as-is
- Article URL: ${article.url || `https://tune-health.vercel.app/articles/${row.article_slug}`}
- Stay within the character limit
- Sound like a real person, not a marketing bot
- No "Check out our latest article!" energy — lead with the insight`;

        const user = `Write a ${row.content_format} for ${row.platform} about this article:

ARTICLE: "${article.title || row.article_slug}"
CATEGORY: ${article.category || "Health"}

CONTENT BRIEF:
- Core thesis: ${(brief.core_thesis as string) || ""}
- Viral angle: ${(brief.viral_angle as string) || ""}
- Controversy: ${(brief.controversy as string) || "none"}
- Key findings: ${JSON.stringify((brief.key_findings as unknown[]) || [])}
- Quotable lines: ${JSON.stringify((brief.quotable_lines as unknown[]) || [])}
- Emotional triggers: ${JSON.stringify((brief.emotional_triggers as unknown[]) || [])}
- Hashtags: ${JSON.stringify((brief.hashtags as unknown) || {})}
${(brief.references as string) ? `\nThis is a REPLY to the ${brief.references} persona's post — reference their angle and build on it or challenge it.` : ""}

Generate the post now.`;

        const result = await generateWithFallback({
          system,
          user,
          models: chain,
          maxTokens: 1500,
          temperature: 0.5,
          stage: `social-writer-${row.persona}`,
        });

        const parsed = parseClaudeJSON(result.text) as Record<string, string>;
        const contentText = parsed.body || parsed.title || result.text;
        const contentMeta: Record<string, unknown> = {};

        if (parsed.title) contentMeta.title = parsed.title;
        if (parsed.subreddit) contentMeta.subreddit = parsed.subreddit;
        if (parsed.hashtags) contentMeta.hashtags = parsed.hashtags;
        contentMeta.modelUsed = result.modelUsed;
        contentMeta.isManual = isManual;

        // Calculate scheduled_at from choreography offset
        const baseTime = new Date();

        // Stagger: brand at 0, reporter at 60min, skeptic at 180min
        const personaOffsets: Record<string, number> = { brand: 0, reporter: 60, skeptic: 180, curator: 120 };
        const offset = personaOffsets[row.persona] || 0;
        const scheduledAt = new Date(baseTime.getTime() + offset * 60 * 1000);

        posts.push({
          article_slug: row.article_slug,
          platform: row.platform,
          persona: row.persona,
          content_type: row.desk === "forum" ? "discussion" : "promotion",
          content_format: row.content_format,
          content_text: contentText,
          content_meta: contentMeta,
          choreography_group: choreographyGroups[row.article_slug],
          timing_offset_minutes: offset,
          scheduled_at: isManual ? null : scheduledAt.toISOString(),
          status: isManual ? "draft" : "scheduled",
          arc_id: row.arc_id,
          series_tag: row.series_tag,
          cost_usd: Math.round(result.usage.costUsd * 10000) / 10000,
        });

        usages.push({ costUsd: result.usage.costUsd });
        succeededPlanIds.push(row.id);

        // Log overhead cost
        await addOverheadCost(db, result.usage);
      } catch (err) {
        console.error(`[Social Writer] Failed to write for ${row.platform}/${row.persona}: ${err instanceof Error ? err.message : "unknown"}`);
        failedCount++;
        // Mark this plan row as failed
        await db.from("social_content_plan").update({ status: "failed" }).eq("id", row.id);
      }
    }

    // Insert all generated posts
    if (posts.length > 0) {
      const { error: insertError } = await db.from("social_posts").insert(posts);
      if (insertError) {
        console.error(`[Social Writer] Failed to insert posts: ${insertError.message}`);
        // Mark plan rows as failed
        await db.from("social_content_plan").update({ status: "failed" }).in("id", planIds);
        return json({ error: insertError.message }, 500);
      }
    }

    // Mark successfully processed plan rows as generated
    if (succeededPlanIds.length > 0) {
      await db.from("social_content_plan").update({ status: "generated" }).in("id", succeededPlanIds);
    }

    const totalCost = usages.reduce((s, u) => s + u.costUsd, 0);

    return json({
      success: true,
      postsCreated: posts.length,
      failedCount,
      totalCost: Math.round(totalCost * 10000) / 10000,
      scheduledCount: posts.filter(p => p.status === "scheduled").length,
      draftCount: posts.filter(p => p.status === "draft").length,
    });
  } catch (err: unknown) {
    console.error(`[Social Writer] Error: ${err instanceof Error ? err.message : "Unknown"}`);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
