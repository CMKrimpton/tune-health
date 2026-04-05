import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addOverheadCost } from "../_shared/db.ts";
import { generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { SOCIAL_CHAINS } from "../_shared/constants.ts";
import { getWriterTemplates } from "../_shared/analytics.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Social Writer — The Content Factory
// Takes Content Briefs from social_content_plan → generates platform-native
// post text using each persona's model → writes to social_posts.
// Triggered by: social-engine (chain) or social-planner (chain) or manual.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_BATCH = 10; // Max plan rows to process per invocation
const MAX_CONCURRENCY = 5; // Parallel AI calls (avoid rate limits + stay within edge fn timeout)

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
  brand: `You ARE alumi news. Not a health blog. Not a wellness brand. A newsroom that reads the papers so your audience doesn't have to.
Your voice: direct, confident, a little bit dangerous. You say the thing the reader was thinking but couldn't articulate.
Lead with the most surprising finding — the one that makes someone stop and text it to a friend. Use second-person: "You've been told X. The data says otherwise."
No emojis. No hedging. No "Studies suggest" — say "We found" or "The data shows." Name specific numbers, specific institutions, specific dollar amounts.
Think: if Bill Maher had a health desk and actually read the studies. 20-35 year olds who are smart, skeptical, and tired of being lied to by wellness influencers AND the institutions that are supposed to protect them.
The hook should hit like a headline you can't ignore. The body should deliver receipts.`,

  reporter: `You are Marc London, senior health correspondent. Your thing: you read the actual paper, not the press release.
"The headline says X. Here's what the study actually measured." "They tested 47 people for 6 weeks. That's the evidence behind a $4 billion market."
You're data-obsessed but you write like you're explaining it to a sharp friend over drinks. Not academic — conversational, with teeth.
Use specific numbers. Name the journal. Name the sample size. Name who funded it. Build threads that make people feel smarter for reading them.
Your audience trusts you because you show your work. You don't tell them what to think — you give them the evidence and let them feel the outrage themselves.`,

  skeptic: `You are The Devil's Advocate. Your job: follow the money. Question the narrative. Name the conflict of interest.
"The study everyone's sharing? Funded by the company that sells the product." "The FDA approved this based on data the manufacturer provided. That's not a typo."
You are NOT a conspiracy theorist — you are a forensic skeptic. Every claim you make is backed by a specific, checkable fact.
The difference between you and a health grifter: you cite receipts, not vibes. You name the institution, the dollar amount, the revolving door.
Provocative questions > assertions. "Why did the AHA change their guidelines 6 months after receiving $X from Y?" Make them think. Make them angry. Make them look it up.
Think: the John Oliver segment on pharma marketing, but compressed to 280 characters. Funny when possible. Always specific.`,

  curator: `You are The alumi Digest. You see the pattern nobody else connected yet.
"Three studies dropped this week. They're all saying the same thing and nobody's talking about it."
"If you read one thing today, make it this — and here's why it matters more than the headline suggests."
You turn scattered findings into a narrative. You're the friend who reads everything and tells you what actually matters.
Warm but sharp. Never bland. Your recommendations feel urgent — like missing this would be a genuine loss.
When you connect dots between articles, make the connection surprising: "A sleep study, a glucose study, and an EPA report walk into a bar..."`,
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

    // Recovery: unstick plan rows that have been "generating" for 2+ minutes (crashed/timed-out previous run)
    const stuckCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
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

    // Pre-fetch platform configs once (avoid N+1 queries)
    const { data: allPlatformConfigs } = await db
      .from("social_platform_config")
      .select("platform, api_configured, config");
    const platformConfigMap = new Map(
      (allPlatformConfigs || []).map((c: { platform: string; api_configured: boolean; config: unknown }) => [c.platform, c])
    );

    // Process a single plan row → returns post data or null on failure
    async function processRow(row: PlanRow): Promise<{ post: Record<string, unknown>; usage: { costUsd: number }; planId: string } | null> {
      try {
        const brief = row.brief || {};
        const article = (brief.article as Record<string, unknown>) || {};
        const platformRule = PLATFORM_RULES[row.platform] || { maxChars: 500, rules: "General social post. Include article URL." };
        const personaVoice = PERSONA_VOICES[row.persona] || PERSONA_VOICES.brand;
        const chain = SOCIAL_CHAINS[row.persona] || SOCIAL_CHAINS.brand;

        // Proven templates for this platform/persona combo (SQL-driven, zero AI cost)
        const templateContext = await getWriterTemplates(db, row.platform, row.persona);

        const platformConfig = platformConfigMap.get(row.platform);
        const isManual = !platformConfig?.api_configured;

        const articleUrl = (article.url as string) || `https://tune-health.vercel.app/articles/${row.article_slug}`;
        const hookDirective = (brief.hook as string)
          ? `\nYOUR UNIQUE HOOK (use THIS as your opening angle — not the viral_angle):\n${brief.hook}`
          : "";

        const system = `You are writing a social media post for ${row.platform}.

PERSONA: ${row.persona}
${personaVoice}

PLATFORM RULES:
${platformRule.rules}
${templateContext}

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

CRITICAL RULES:
- Return ONLY a valid JSON object. No prose before or after. No markdown fences.
- The post must be COMPLETE and ready to publish as-is
- Article URL: ${articleUrl}
- Stay STRICTLY within the character limit (${platformRule.maxChars} chars max)
- Sound like a real person, not a marketing bot
- No "Check out our latest article!" energy — lead with the insight
- Your opening sentence MUST follow the UNIQUE HOOK directive below — do NOT default to the core thesis or viral angle as your opener
- For threads: put the ENTIRE thread in the "body" field as one text block (the poster will handle splitting)`;

        const user = `Write a ${row.content_format} for ${row.platform} about this article:

ARTICLE: "${article.title || row.article_slug}"
CATEGORY: ${article.category || "Health"}
${hookDirective}

CONTENT BRIEF (background context — but lead with YOUR HOOK, not these):
- Core thesis: ${(brief.core_thesis as string) || ""}
- Key findings: ${JSON.stringify((brief.key_findings as unknown[]) || [])}
- Quotable lines (pick ONE that fits your hook, don't reuse across posts): ${JSON.stringify((brief.quotable_lines as unknown[]) || [])}
- Controversy: ${(brief.controversy as string) || "none"}
- Hashtags: ${JSON.stringify((brief.hashtags as unknown) || {})}
${(brief.references as string) ? `\nThis is a REPLY/REACTION to the ${brief.references} persona's post — reference their angle and build on it or challenge it.` : ""}

Generate the post now.`;

        const result = await generateWithFallback({
          system,
          user,
          models: chain,
          maxTokens: 2000,
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

        const baseTime = new Date();
        const personaOffsets: Record<string, number> = { brand: 0, reporter: 60, skeptic: 180, curator: 120 };
        const offset = personaOffsets[row.persona] || 0;
        const scheduledAt = new Date(baseTime.getTime() + offset * 60 * 1000);

        await addOverheadCost(db, result.usage);

        return {
          post: {
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
          },
          usage: { costUsd: result.usage.costUsd },
          planId: row.id,
        };
      } catch (err) {
        console.error(`[Social Writer] Failed to write for ${row.platform}/${row.persona}: ${err instanceof Error ? err.message : "unknown"}`);
        await db.from("social_content_plan").update({ status: "failed" }).eq("id", row.id);
        return null;
      }
    }

    // Process in parallel batches of MAX_CONCURRENCY
    const rows = planRows as PlanRow[];
    for (let i = 0; i < rows.length; i += MAX_CONCURRENCY) {
      const batch = rows.slice(i, i + MAX_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(processRow));

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          posts.push(result.value.post);
          usages.push(result.value.usage);
          succeededPlanIds.push(result.value.planId);
        } else {
          failedCount++;
        }
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
