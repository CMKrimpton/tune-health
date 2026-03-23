import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS (standard pattern across all Edge Functions)
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
function supabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ---------------------------------------------------------------------------
// Claude API with native web search
// ---------------------------------------------------------------------------
// Uses Anthropic's built-in web_search server-side tool. Claude autonomously
// decides what to search, when, and how many times. The API handles search
// execution — no third-party search provider needed.
// ---------------------------------------------------------------------------

interface ClaudeOptions {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  webSearch?: boolean;
  maxSearches?: number;
}

async function claude(opts: ClaudeOptions): Promise<string> {
  const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  const {
    system,
    user,
    model = "claude-sonnet-4-20250514",
    maxTokens = 4096,
    temperature = 0.35,
    webSearch = false,
    maxSearches = 5,
  } = opts;

  // Build tools array — only include web_search if requested
  const tools: unknown[] = [];
  if (webSearch) {
    tools.push({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: maxSearches,
    });
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: "user", content: user }],
  };

  if (tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();

  // Extract all text blocks from the response.
  // When web_search is used, the response contains a mix of:
  //   - text blocks (Claude's analysis)
  //   - server_tool_use blocks (search requests)
  //   - web_search_tool_result blocks (search results)
  // We concatenate all text blocks to get Claude's final output.
  const contentBlocks = data.content || [];
  const textParts: string[] = [];

  for (const block of contentBlocks) {
    if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
  }

  const fullText = textParts.join("\n");
  if (!fullText.trim()) throw new Error("Empty Claude response");
  return fullText;
}

function parseClaudeJSON(text: string): unknown {
  // Claude may wrap JSON in code fences — strip them
  const cleaned = text
    .replace(/^[\s\S]*?```json?\n?/, "")
    .replace(/\n?```[\s\S]*$/, "")
    .trim();
  // If no code fence was found, try parsing the raw text
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from the text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse Claude response as JSON");
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function publishDateDisplay(): string {
  const d = new Date();
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Assemble .astro file from parts
// ---------------------------------------------------------------------------
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function assembleAstroFile(
  metadata: {
    title: string;
    description: string;
    category: string;
    readTime: number;
    tags: string[];
  },
  html: string,
  svg: string,
  toc: { id: string; title: string }[],
): string {
  const tocHtml = toc
    .map(
      (t) =>
        `      <a href="#${t.id}" class="block text-sm text-stone-600 dark:text-stone-400 hover:text-primary-600 transition-colors">${t.title}</a>`,
    )
    .join("\n");

  const tagsHtml = metadata.tags
    .map(
      (tag) =>
        `    <span class="px-3 py-1 bg-stone-100 dark:bg-stone-800 rounded-full text-sm">${tag}</span>`,
    )
    .join("\n");

  return `---
import ArticleLayout from '../../layouts/ArticleLayout.astro';
---

<ArticleLayout
  title="${escapeAttr(metadata.title)}"
  description="${escapeAttr(metadata.description)}"
  category="${escapeAttr(metadata.category)}"
  readTime="${metadata.readTime} min read"
  publishDate="${publishDateDisplay()}"
>
  <!-- Feature Image -->
  <svg slot="feature-image" viewBox="0 0 1200 600" class="w-full h-full">
    ${svg}
  </svg>

  <!-- Table of Contents -->
  <div class="mb-12 p-6 bg-stone-100 dark:bg-stone-900 rounded-2xl reveal">
    <h2 class="font-serif text-lg font-semibold mb-4">In This Article</h2>
    <nav class="space-y-2">
${tocHtml}
    </nav>
  </div>

  <!-- Article Content -->
  <div class="article-content">
    ${html}
  </div>

  <!-- Tags -->
  <Fragment slot="tags">
${tagsHtml}
  </Fragment>
</ArticleLayout>
`;
}

// ---------------------------------------------------------------------------
// Publish to GitHub (inlined from publish-article)
// ---------------------------------------------------------------------------
async function publishToGitHub(
  slug: string,
  astroContent: string,
  metadata: Record<string, unknown>,
): Promise<{ commitSha: string; commitUrl: string }> {
  const githubToken = (Deno.env.get("GITHUB_TOKEN") || "").trim();
  const githubRepo = (Deno.env.get("GITHUB_REPO") || "").trim();
  if (!githubToken || !githubRepo) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPO must be configured");
  }

  const branch = "main";
  const apiBase = `https://api.github.com/repos/${githubRepo}`;
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  async function createBlob(content: string): Promise<string> {
    const res = await fetch(`${apiBase}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: btoa(unescape(encodeURIComponent(content))),
        encoding: "base64",
      }),
    });
    if (!res.ok) throw new Error(`Failed to create blob: ${res.status}`);
    return (await res.json()).sha;
  }

  const refRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, { headers });
  if (!refRes.ok) throw new Error(`Failed to get branch ref: ${refRes.status}`);
  const currentCommitSha = (await refRes.json()).object.sha;

  const commitRes = await fetch(
    `${apiBase}/git/commits/${currentCommitSha}`,
    { headers },
  );
  if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`);
  const baseTreeSha = (await commitRes.json()).tree.sha;

  const jsonContent = JSON.stringify(metadata, null, 2) + "\n";
  const [jsonBlob, astroBlob] = await Promise.all([
    createBlob(jsonContent),
    createBlob(astroContent),
  ]);

  const treeRes = await fetch(`${apiBase}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        { path: `src/content/articles/${slug}.json`, mode: "100644", type: "blob", sha: jsonBlob },
        { path: `src/pages/articles/${slug}.astro`, mode: "100644", type: "blob", sha: astroBlob },
      ],
    }),
  });
  if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
  const treeData = await treeRes.json();

  const newCommitRes = await fetch(`${apiBase}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: `feat: Daily article — '${slug}'`,
      tree: treeData.sha,
      parents: [currentCommitSha],
    }),
  });
  if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${newCommitRes.status}`);
  const newCommitData = await newCommitRes.json();

  const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: newCommitData.sha }),
  });
  if (!updateRefRes.ok) throw new Error(`Failed to update ref: ${updateRefRes.status}`);

  return { commitSha: newCommitData.sha, commitUrl: newCommitData.html_url };
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------
const RESEARCH_PROMPT = `You are an editorial research agent for alumi news, a premium health editorial website whose slogan is "Evidence. Wherever it leads."

Your job: use web search to discover what health topic is MOST searched, discussed, and trending in the last 3 days — then research it thoroughly.

## Process
1. Search for trending health news, viral health stories, and the most-discussed health research from the last 72 hours
2. Evaluate candidates by: scientific substance, trending momentum, counter-narrative potential, surprise factor
3. Pick the SINGLE most compelling topic
4. Deep-research that topic: find the key studies, statistics, expert positions, mechanisms, counter-arguments
5. Return structured research findings

## Selection Criteria (ranked)
1. **Genuine scientific substance** — real studies, real data, not celebrity gossip or supplement hype
2. **Trending RIGHT NOW** — people are actively searching for it, it's in the news cycle
3. **Surprising or counter-narrative** — challenges conventional wisdom, reveals something unexpected
4. **Not already covered** — must not duplicate existing articles (list provided)
5. **Fits the voice** — "Evidence over allegiance." Aggressively neutral. Skeptical of all sources equally.

## Output Format
After completing your research, return ONLY valid JSON (no code fences, no explanation):
{
  "topic": "The specific topic/angle",
  "headline_draft": "A working headline (magazine-quality, not clickbait)",
  "why": "1-2 sentences on why this topic wins over alternatives",
  "category": "One of: Neuroscience, Mental Health, Longevity, Clinical Evidence, Environmental Health, Nutrition, Fitness, Sleep Science, Pharmacology",
  "keyFindings": [
    "Finding 1 with specific study/stat",
    "Finding 2 with specific study/stat",
    "Finding 3..."
  ],
  "studies": [
    { "title": "Study title", "journal": "Journal name", "year": "Year", "finding": "Key finding with numbers" }
  ],
  "counterArguments": ["Skeptic point 1", "Skeptic point 2"],
  "mechanism": "Brief explanation of the biological/physiological mechanism",
  "expertQuotes": ["Any notable expert positions or statements found"],
  "statistics": ["Key statistic 1", "Key statistic 2"]
}`;

const ARTICLE_WRITING_PROMPT = `You are the editorial AI for alumi news, a premium health and wellness editorial website. Your job is to write an investigative, deeply researched article using the provided research AND your own web search to verify facts and find additional details.

## Editorial Voice
- Evidence over allegiance. Aggressively neutral. Smart friend who reads the studies.
- Direct, slightly irreverent, never condescending.
- Writing style: 60% exceptional journalism, 20% Bill Maher, 15% Christopher Hitchens, 15% Sam Harris.
- Oxford comma. US English. No emojis.
- Every claim must cite a specific study, statistic, or source. Include author names, journal names, sample sizes, effect sizes where possible.
- Balanced perspective: treat mainstream medicine and alternative health with the same skepticism.
- Vary sentence length dramatically. Some very short. Some longer and analytical.
- NO filler: no "it's important to note," no "interestingly," no "it's worth mentioning."
- Minimum 2,500 words, target 3,000+. This is a substantial investigation.
- 8-12 specific evidence citations minimum.

## Output Format
Return ONLY valid JSON with this exact structure:
{
  "html": "...",
  "metadata": { ... },
  "svg": "...",
  "toc": [ ... ],
  "readTime": number
}

### html field
The article body HTML. Use these exact patterns:

Sections with IDs:
<section id="section-slug" class="reveal">
  <h2>Section Title</h2>
  <p>Content...</p>
</section>

The FIRST section must have id="introduction" and NO h2 tag (the first paragraph gets a CSS drop cap).

Opening: Start with a specific, vivid scene, study finding, or provocative observation. Never throat-clear.

Pull quotes (2-3, distributed throughout):
<aside class="pull-quote reveal">
  <p>"Quote text here."</p>
</aside>

Info cards (1-2, for key statistics):
<div class="info-card my-12 reveal">
  <h4 class="font-serif text-lg font-semibold mb-3 text-primary-700 dark:text-primary-400">Card Title</h4>
  <ul class="space-y-2 text-sm">
    <li><strong>Label:</strong> Value</li>
  </ul>
</div>

Medical disclaimer at the end:
<div class="mt-12 p-6 bg-stone-100 dark:bg-stone-800 rounded-xl border-l-4 border-primary-500 reveal">
  <p class="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
    <strong>Disclaimer:</strong> This article is for informational purposes only and does not constitute medical advice. Consult a qualified healthcare provider for personalized guidance.
  </p>
</div>

Use: <p>, <ul>, <li>, <strong>, <em>, <h2>, <h3>. All sections have class="reveal".

### metadata field
{
  "title": "Magnetic, specific headline. Think NYT Magazine meets New Scientist.",
  "slug": "url-friendly-slug",
  "description": "2-3 sentence hook with a specific surprising fact. SEO-optimized.",
  "category": "One of: Mental Health, Neuroscience, Nutrition, Longevity, Fitness, Sleep Science, Clinical Evidence, Environmental Health, Pharmacology",
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"],
  "gradient": { "from": "color-weight", "to": "color-weight" },
  "featured": false,
  "readTime": <number in minutes>,
  "publishDate": "${todayISO()}",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6"]
}

Gradient options: rose-600/red-700, violet-600/purple-700, emerald-500/teal-600, emerald-600/teal-700, amber-500/orange-600, sky-500/blue-600, indigo-500/purple-600, lime-500/green-600

### svg field
SVG inner content (no outer <svg> tag). Dark gradient background. Abstract scientific/molecular motif related to the topic. Include glow filters, geometric shapes, organic curves. Use colors matching the gradient. Think: data visualization meets abstract art. NOT a literal illustration.

### toc field
Array of { "id": "section-id", "title": "Display Title" } for each h2 section.

### readTime field
Estimated minutes (220 words per minute, rounded up).

## Rules
- Use web search to verify key claims, find exact statistics, and discover additional evidence.
- NEVER fabricate study data, statistics, or author names.
- Structure: hook → evidence → mechanism → implications → honest assessment of unknowns.
- End with what we don't know. No neat bows. No "only time will tell."`;

// ---------------------------------------------------------------------------
// Existing article titles (fetched from DB to avoid duplicates)
// ---------------------------------------------------------------------------
async function getExistingTitles(
  db: ReturnType<typeof supabase>,
): Promise<string[]> {
  const { data } = await db.from("articles").select("title, slug");
  if (!data) return [];
  return data.map(
    (a: { title: string; slug: string }) => `${a.title} (${a.slug})`,
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let logId: string | null = null;
  const db = supabase();

  try {
    let body: { action?: string; model?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = { action: "run" };
    }
    const { action = "run", model } = body;

    // ------ STATUS action ------
    if (action === "status") {
      const { data } = await db
        .from("daily_article_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      return json({ logs: data || [] });
    }

    // ------ Rate limit: one successful run per day ------
    const today = todayISO();
    const { data: todayRun } = await db
      .from("daily_article_log")
      .select("id, slug, title")
      .eq("run_date", today)
      .eq("status", "published")
      .maybeSingle();

    if (todayRun) {
      return json({
        skipped: true,
        message: `Already published today: "${todayRun.title}" (${todayRun.slug})`,
      });
    }

    // ------ Create log entry ------
    const { data: logEntry } = await db
      .from("daily_article_log")
      .insert({ run_date: today, status: "started" })
      .select("id")
      .single();
    logId = logEntry?.id;

    const articleModel =
      model === "opus" ? "claude-opus-4-6" : "claude-sonnet-4-6";

    // ================================================================
    // STEP 1: Research — Claude searches the web autonomously
    // ================================================================
    // Claude uses its native web_search tool to discover trending health
    // topics and deep-dive the best one. No external search API needed.
    const existingTitles = await getExistingTitles(db);

    const researchUserPrompt = `Today's date: ${today}

## Your Task
Search the web for the most trending, most-searched, most-discussed health topic from the last 3 days. Then thoroughly research the winner.

## Existing Articles (DO NOT duplicate these topics):
${existingTitles.map((t) => `- ${t}`).join("\n")}

Search broadly first (trending health news, viral health stories, health research breakthroughs this week), then deep-dive the most promising topic. Return structured JSON with your findings.`;

    if (logId) {
      await db
        .from("daily_article_log")
        .update({ status: "searching" })
        .eq("id", logId);
    }

    const researchRaw = await claude({
      system: RESEARCH_PROMPT,
      user: researchUserPrompt,
      model: "claude-sonnet-4-20250514",
      maxTokens: 4000,
      webSearch: true,
      maxSearches: 10,
    });

    const research = parseClaudeJSON(researchRaw) as {
      topic: string;
      headline_draft: string;
      why: string;
      category: string;
      keyFindings: string[];
      studies: { title: string; journal: string; year: string; finding: string }[];
      counterArguments: string[];
      mechanism: string;
      expertQuotes: string[];
      statistics: string[];
    };

    if (logId) {
      await db
        .from("daily_article_log")
        .update({
          topic: research.topic,
          status: "topic_selected",
          search_queries: research.keyFindings?.slice(0, 10) || [],
          research_snippets: research.studies || [],
        })
        .eq("id", logId);
    }

    // ================================================================
    // STEP 2: Write the article — Claude with web search for fact-checking
    // ================================================================
    const articleUserPrompt = `Write a comprehensive, investigative article based on this research:

## TOPIC
${research.topic}

## WORKING HEADLINE
${research.headline_draft}

## CATEGORY
${research.category}

## WHY THIS TOPIC
${research.why}

## KEY FINDINGS
${(research.keyFindings || []).map((f, i) => `${i + 1}. ${f}`).join("\n")}

## STUDIES
${(research.studies || []).map((s) => `- "${s.title}" (${s.journal}, ${s.year}): ${s.finding}`).join("\n")}

## MECHANISM
${research.mechanism || "Not provided — research and explain the underlying mechanism."}

## COUNTER-ARGUMENTS
${(research.counterArguments || []).map((c) => `- ${c}`).join("\n")}

## EXPERT POSITIONS
${(research.expertQuotes || []).join("\n")}

## KEY STATISTICS
${(research.statistics || []).join("\n")}

## TODAY'S DATE
${today}

Use web search to verify key statistics, find additional evidence, and ensure accuracy. Write the full article. Return ONLY valid JSON matching the specified format.`;

    if (logId) {
      await db
        .from("daily_article_log")
        .update({ status: "researching" })
        .eq("id", logId);
    }

    const articleRaw = await claude({
      system: ARTICLE_WRITING_PROMPT,
      user: articleUserPrompt,
      model: articleModel,
      maxTokens: 16000,
      temperature: 0.4,
      webSearch: true,
      maxSearches: 5,
    });

    const article = parseClaudeJSON(articleRaw) as {
      html: string;
      metadata: {
        title: string;
        slug: string;
        description: string;
        category: string;
        tags: string[];
        gradient: { from: string; to: string };
        featured: boolean;
        readTime: number;
        publishDate: string;
        keywords: string[];
      };
      svg: string;
      toc: { id: string; title: string }[];
      readTime: number;
    };

    const slug = article.metadata.slug;
    const readTime = article.readTime || article.metadata.readTime || 12;

    if (logId) {
      await db
        .from("daily_article_log")
        .update({ slug, title: article.metadata.title, status: "written" })
        .eq("id", logId);
    }

    // ================================================================
    // STEP 3: Assemble .astro file
    // ================================================================
    const astroContent = assembleAstroFile(
      { ...article.metadata, readTime },
      article.html,
      article.svg,
      article.toc,
    );

    // ================================================================
    // STEP 4: Save to database
    // ================================================================
    const dbArticle = {
      slug,
      title: article.metadata.title,
      description: article.metadata.description,
      category: article.metadata.category,
      tags: article.metadata.tags,
      keywords: article.metadata.keywords || [],
      gradient_from: article.metadata.gradient?.from || "rose-600",
      gradient_to: article.metadata.gradient?.to || "red-700",
      featured: false,
      draft: false,
      coming_soon: false,
      read_time: readTime,
      publish_date: today,
      article_html: article.html,
      article_svg: article.svg,
      toc: article.toc,
      source_text: `[Daily Article Agent — ${today}]\nTopic: ${research.topic}\nWhy: ${research.why}`,
      status: "published" as const,
      published_at: new Date().toISOString(),
    };

    const { error: dbError } = await db
      .from("articles")
      .upsert(dbArticle, { onConflict: "slug" })
      .select()
      .single();

    if (dbError) throw new Error(`DB save failed: ${dbError.message}`);

    if (logId) {
      await db
        .from("daily_article_log")
        .update({ status: "saved" })
        .eq("id", logId);
    }

    // ================================================================
    // STEP 5: Generate illustration (synchronous — we need the URL for GitHub)
    // ================================================================
    let heroImage: string | undefined;
    let heroImageAlt: string | undefined;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (supabaseUrl) {
      try {
        const illustrationRes = await fetch(
          `${supabaseUrl}/functions/v1/generate-illustration`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "generate", slug }),
            signal: AbortSignal.timeout(60000),
          },
        );
        if (illustrationRes.ok) {
          const illustrationData = await illustrationRes.json();
          if (illustrationData.success && illustrationData.imageUrl) {
            heroImage = illustrationData.imageUrl;
            heroImageAlt = `Editorial illustration for ${article.metadata.title}`;
          }
        }
      } catch {
        // Non-fatal — article publishes with gradient fallback
      }
    }

    // ================================================================
    // STEP 6: Publish to GitHub (skip on dry-run)
    // ================================================================
    let commitInfo: { commitSha: string; commitUrl: string } | null = null;

    if (action !== "dry-run") {
      const jsonMetadata: Record<string, unknown> = {
        title: article.metadata.title,
        description: article.metadata.description,
        category: article.metadata.category,
        publishDate: today,
        author: { name: "alumi news Editorial", role: "Medical Review Board" },
        readTime,
        featured: false,
        draft: false,
        tags: article.metadata.tags,
        gradient: article.metadata.gradient,
        keywords: article.metadata.keywords,
      };

      // Include heroImage if illustration was generated successfully
      if (heroImage) {
        jsonMetadata.heroImage = heroImage;
        jsonMetadata.heroImageAlt = heroImageAlt;
      }

      commitInfo = await publishToGitHub(slug, astroContent, jsonMetadata);
    }

    // ================================================================
    // STEP 7: Final log update
    // ================================================================
    const finalStatus = action === "dry-run" ? "saved" : "published";
    if (logId) {
      await db
        .from("daily_article_log")
        .update({ status: finalStatus, completed_at: new Date().toISOString() })
        .eq("id", logId);
    }

    return json({
      success: true,
      action,
      topic: research.topic,
      slug,
      title: article.metadata.title,
      category: article.metadata.category,
      readTime,
      articleUrl: `/articles/${slug}`,
      commit: commitInfo,
      model: articleModel,
    });
  } catch (err: unknown) {
    if (logId) {
      await db
        .from("daily_article_log")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId)
        .then(() => {})
        .catch(() => {});
    }

    return json({ error: "An internal error occurred" }, 500);
  }
});
