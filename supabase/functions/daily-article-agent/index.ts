import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS
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
  const cleaned = text
    .replace(/^[\s\S]*?```json?\n?/, "")
    .replace(/\n?```[\s\S]*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
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
// Assemble .astro file
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
// Publish to GitHub
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
      message: `feat: Publish article — '${slug}'`,
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
// Smart featured rotation
// ---------------------------------------------------------------------------
async function rotateFeatured(db: ReturnType<typeof supabase>): Promise<string | null> {
  const { data: articles } = await db
    .from("articles")
    .select("slug, title, category, publish_date, hero_image, read_time, featured")
    .eq("status", "published")
    .eq("draft", false)
    .order("publish_date", { ascending: false });

  if (!articles || articles.length < 3) return null;

  const currentFeatured = articles.find((a: Record<string, unknown>) => a.featured);
  const now = Date.now();

  if (currentFeatured) {
    const featuredAge = now - new Date(currentFeatured.publish_date as string).getTime();
    if (featuredAge < 24 * 60 * 60 * 1000) return null;
  }

  const scored = articles.map((a: Record<string, unknown>) => {
    const ageDays = (now - new Date(a.publish_date as string).getTime()) / (1000 * 60 * 60 * 24);
    const recency = Math.max(0, 40 * Math.exp(-ageDays / 7));
    const illustration = a.hero_image ? 20 : 0;
    const rt = (a.read_time as number) || 5;
    const readTime = rt >= 8 && rt <= 15 ? 10 : rt > 15 ? 7 : 5;
    const diversity = currentFeatured && a.category === currentFeatured.category ? 0 : 20;
    const penalty = a.featured ? -30 : 0;
    return { slug: a.slug, score: recency + illustration + readTime + diversity + penalty };
  });

  scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
  const winner = scored[0];
  if (!winner || (currentFeatured && winner.slug === currentFeatured.slug)) return null;

  await db.from("articles").update({ featured: false }).eq("featured", true);
  await db.from("articles").update({ featured: true }).eq("slug", winner.slug);
  return winner.slug;
}

// ===========================================================================
// SYSTEM PROMPTS
// ===========================================================================

// ---------------------------------------------------------------------------
// Research Agent — finds trending topics
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
Return ONLY valid JSON (no code fences, no explanation):
{
  "topic": "The specific topic/angle",
  "headline_draft": "A working headline (magazine-quality, not clickbait)",
  "why": "1-2 sentences on why this topic wins over alternatives",
  "category": "One of: Neuroscience, Mental Health, Longevity, Clinical Evidence, Environmental Health, Nutrition, Fitness, Sleep Science, Pharmacology",
  "keyFindings": ["Finding 1...", "Finding 2..."],
  "studies": [{ "title": "...", "journal": "...", "year": "...", "finding": "..." }],
  "counterArguments": ["Skeptic point 1", "Skeptic point 2"],
  "mechanism": "Brief explanation of the biological/physiological mechanism",
  "expertQuotes": ["Any notable expert positions or statements found"],
  "statistics": ["Key statistic 1", "Key statistic 2"]
}`;

// ---------------------------------------------------------------------------
// Senior Editor — editorial oversight, creative briefs, quality control
// ---------------------------------------------------------------------------
const SENIOR_EDITOR_BRIEF_PROMPT = `You are the Senior Editor of alumi news — a premium health editorial publication. You are the most senior editorial voice. You set the tone, protect quality, and make the call on what gets published.

Your voice: Think Ben Goldacre editing The New Yorker's science desk. Ruthless about evidence, allergic to clickbait, but deeply compelling.

## Your Job Right Now
You're reviewing a research brief from your research team. You need to:

1. **Evaluate the topic** — Is this genuinely worth covering? Is the science real? Is it trending enough? Rate it 1-10.
2. **Check collection balance** — Look at the existing article lineup. Is this category overrepresented? Is there a gap we should be filling instead?
3. **Craft the angle** — What's the REAL story here? Not the obvious headline. The second-order insight. The thing that makes a reader stop and think.
4. **Set the headline** — Write the FINAL headline. Magazine-quality. Specific. Magnetic. Not clickbait.
5. **Write the creative brief** — Give the writer clear direction: tone, angle, what to emphasize, what to avoid, how to open, what the reader should feel.
6. **Make the call** — approve, revise angle, or kill the story.

## Output Format
Return ONLY valid JSON:
{
  "decision": "approve" | "kill",
  "topicScore": 8,
  "headline": "The final, polished headline",
  "slug": "url-friendly-slug",
  "description": "2-3 sentence SEO description that SELLS the article. Specific. Surprising.",
  "angle": "The specific editorial angle — what makes this piece different from every other article on this topic",
  "brief": {
    "tone": "Specific tone guidance for this piece",
    "openWith": "How to open — a specific scene, stat, or provocation",
    "emphasize": ["Key point 1 to drive home", "Key point 2", "Key point 3"],
    "avoid": ["What NOT to do", "Common clichés for this topic to avoid"],
    "closingDirection": "How to end — what question to leave the reader with"
  },
  "categoryOverride": null,
  "killReason": null
}`;

const SENIOR_EDITOR_QC_PROMPT = `You are the Senior Editor of alumi news doing a FINAL quality check before publication. This is the last gate. Once you approve, this goes live to readers.

Your standards:
- Voice: Evidence over allegiance. Aggressively neutral. Smart friend who reads the studies.
- Style: 60% exceptional journalism, 20% Bill Maher, 15% Christopher Hitchens, 15% Sam Harris.
- Every claim must have a specific citation. No hand-waving.
- NO filler phrases: "it's important to note," "interestingly," "it's worth mentioning" — kill on sight.
- Headline must be magnetic, specific, and honest.
- Description must SELL the article without clickbait.
- Minimum 2,500 words of substance, not padding.

## Your Job
Review the article and return your editorial judgment.

## Output Format
Return ONLY valid JSON:
{
  "decision": "publish" | "revise" | "kill",
  "qualityScore": 8,
  "headline": "Final headline (may be the same or improved)",
  "description": "Final description (may be the same or improved)",
  "edits": {
    "headlineChanged": false,
    "descriptionChanged": false,
    "notes": "Brief editorial notes on what was changed and why"
  },
  "killReason": null,
  "reviseInstructions": null
}`;

// ---------------------------------------------------------------------------
// Article Writer
// ---------------------------------------------------------------------------
const ARTICLE_WRITING_PROMPT = `You are a senior health journalist at alumi news, a premium editorial publication. You are writing a piece assigned by your Senior Editor. Follow the editorial brief precisely.

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
Return ONLY valid JSON:
{
  "html": "...",
  "metadata": { ... },
  "svg": "...",
  "toc": [ ... ],
  "readTime": number
}

### html field
Article body HTML using these patterns:

<section id="section-slug" class="reveal">
  <h2>Section Title</h2>
  <p>Content...</p>
</section>

The FIRST section: id="introduction", NO h2 tag (CSS drop cap on first paragraph).
Opening: Start with a specific, vivid scene, study finding, or provocative observation.

Pull quotes (2-3):
<aside class="pull-quote reveal"><p>"Quote text."</p></aside>

Info cards (1-2):
<div class="info-card my-12 reveal">
  <h4 class="font-serif text-lg font-semibold mb-3 text-primary-700 dark:text-primary-400">Card Title</h4>
  <ul class="space-y-2 text-sm"><li><strong>Label:</strong> Value</li></ul>
</div>

End with disclaimer:
<div class="mt-12 p-6 bg-stone-100 dark:bg-stone-800 rounded-xl border-l-4 border-primary-500 reveal">
  <p class="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
    <strong>Disclaimer:</strong> This article is for informational purposes only and does not constitute medical advice.
  </p>
</div>

### metadata field
{
  "title": "Use the headline from the editorial brief",
  "slug": "Use the slug from the editorial brief",
  "description": "Use the description from the editorial brief",
  "category": "From the brief",
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"],
  "gradient": { "from": "color-weight", "to": "color-weight" },
  "featured": false,
  "readTime": <number>,
  "publishDate": "${todayISO()}",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6"]
}

Gradient options: rose-600/red-700, violet-600/purple-700, emerald-500/teal-600, emerald-600/teal-700, amber-500/orange-600, sky-500/blue-600, indigo-500/purple-600, lime-500/green-600

### svg field
SVG inner content (no outer <svg>). Dark gradient background. Abstract scientific motif. Glow filters, geometric shapes, organic curves. Colors matching gradient.

### toc field
Array of { "id": "section-id", "title": "Display Title" }.

### readTime field
Estimated minutes (220 wpm, rounded up).

## Rules
- Use web search to verify key claims and find additional evidence.
- NEVER fabricate study data, statistics, or author names.
- Follow the editorial brief's angle, opening direction, emphasis points, and closing direction.
- Structure: hook → evidence → mechanism → implications → honest unknowns.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getExistingArticles(
  db: ReturnType<typeof supabase>,
): Promise<{ titles: string[]; categoryCounts: Record<string, number> }> {
  const { data } = await db.from("articles").select("title, slug, category");
  if (!data) return { titles: [], categoryCounts: {} };

  const titles = data.map(
    (a: { title: string; slug: string }) => `${a.title} (${a.slug})`,
  );

  const categoryCounts: Record<string, number> = {};
  for (const a of data as Array<{ category: string }>) {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
  }

  return { titles, categoryCounts };
}

// ===========================================================================
// PIPELINE STAGES
// ===========================================================================

// ---------------------------------------------------------------------------
// STAGE 1: Research — find trending topic (~60s)
// ---------------------------------------------------------------------------
async function stageResearch(
  db: ReturnType<typeof supabase>,
  logId: string,
): Promise<void> {
  const today = todayISO();
  const { titles } = await getExistingArticles(db);

  await db
    .from("daily_article_log")
    .update({ status: "searching", created_at: new Date().toISOString() })
    .eq("id", logId);

  const researchRaw = await claude({
    system: RESEARCH_PROMPT,
    user: `Today's date: ${today}

## Your Task
Search the web for the most trending, most-searched, most-discussed health topic from the last 3 days. Then thoroughly research the winner.

## Existing Articles (DO NOT duplicate these topics):
${titles.map((t) => `- ${t}`).join("\n")}

Search broadly first (trending health news, viral health stories, health research breakthroughs this week), then deep-dive the most promising topic. Return structured JSON with your findings.`,
    model: "claude-sonnet-4-20250514",
    maxTokens: 4000,
    webSearch: true,
    maxSearches: 10,
  });

  const research = parseClaudeJSON(researchRaw) as Record<string, unknown>;

  await db
    .from("daily_article_log")
    .update({
      topic: research.topic as string,
      status: "research_done",
      search_queries: ((research.keyFindings as string[]) || []).slice(0, 10),
      research_snippets: (research.studies as unknown[]) || [],
      research_data: research,
    })
    .eq("id", logId);
}

// ---------------------------------------------------------------------------
// STAGE 2: Senior Editor Brief — editorial review + creative brief (~45s)
// ---------------------------------------------------------------------------
async function stageEditorBrief(
  db: ReturnType<typeof supabase>,
  logId: string,
  researchData: Record<string, unknown>,
): Promise<void> {
  await db
    .from("daily_article_log")
    .update({ status: "editor_reviewing", created_at: new Date().toISOString() })
    .eq("id", logId);

  const { titles, categoryCounts } = await getExistingArticles(db);

  const editorPrompt = `Review this research brief and create an editorial brief for the writer.

## RESEARCH BRIEF
Topic: ${researchData.topic}
Working headline: ${researchData.headline_draft}
Category: ${researchData.category}
Why this topic: ${researchData.why}

Key findings:
${((researchData.keyFindings as string[]) || []).map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")}

Studies:
${((researchData.studies as Array<{ title: string; journal: string; year: string; finding: string }>) || []).map((s) => `- "${s.title}" (${s.journal}, ${s.year}): ${s.finding}`).join("\n")}

Mechanism: ${researchData.mechanism || "Not provided"}

Counter-arguments:
${((researchData.counterArguments as string[]) || []).map((c: string) => `- ${c}`).join("\n")}

Expert positions:
${((researchData.expertQuotes as string[]) || []).join("\n")}

## CURRENT COLLECTION BALANCE
Category distribution (${titles.length} total articles):
${Object.entries(categoryCounts).sort(([, a], [, b]) => (b as number) - (a as number)).map(([cat, count]) => `- ${cat}: ${count}`).join("\n")}

## EXISTING HEADLINES (for differentiation):
${titles.slice(0, 30).map((t) => `- ${t}`).join("\n")}
${titles.length > 30 ? `... and ${titles.length - 30} more` : ""}

Make your editorial call. Approve with a killer brief, or kill it with a reason.`;

  const editorRaw = await claude({
    system: SENIOR_EDITOR_BRIEF_PROMPT,
    user: editorPrompt,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2000,
    temperature: 0.4,
  });

  const editorBrief = parseClaudeJSON(editorRaw) as Record<string, unknown>;

  if (editorBrief.decision === "kill") {
    await db
      .from("daily_article_log")
      .update({
        status: "failed",
        error: `Senior Editor killed: ${editorBrief.killReason || "Did not meet editorial standards"}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", logId);
    return;
  }

  // Editor approved — store the brief alongside research data
  await db
    .from("daily_article_log")
    .update({
      topic: (editorBrief.headline as string) || (researchData.topic as string),
      title: editorBrief.headline as string,
      slug: editorBrief.slug as string,
      status: "editor_approved",
      research_data: {
        ...researchData,
        _editorBrief: editorBrief,
      },
    })
    .eq("id", logId);
}

// ---------------------------------------------------------------------------
// STAGE 3: Write article following editor's brief (~120s)
// ---------------------------------------------------------------------------
async function stageWrite(
  db: ReturnType<typeof supabase>,
  logId: string,
  researchData: Record<string, unknown>,
  model: string,
): Promise<void> {
  const today = todayISO();
  const editorBrief = researchData._editorBrief as Record<string, unknown>;
  const brief = editorBrief?.brief as Record<string, unknown> | undefined;

  await db
    .from("daily_article_log")
    .update({ status: "writing", created_at: new Date().toISOString() })
    .eq("id", logId);

  const articleUserPrompt = `Write a comprehensive, investigative article following this editorial brief from the Senior Editor.

## EDITORIAL BRIEF
Headline: ${editorBrief?.headline || researchData.headline_draft}
Slug: ${editorBrief?.slug || "auto-generate"}
Description: ${editorBrief?.description || "Write a compelling 2-3 sentence description"}
Angle: ${editorBrief?.angle || "Follow the research"}
Category: ${editorBrief?.categoryOverride || researchData.category}

### Writer's Direction
Tone: ${brief?.tone || "Standard editorial voice"}
Open with: ${brief?.openWith || "A compelling hook"}
Emphasize: ${((brief?.emphasize as string[]) || []).map((e: string) => `- ${e}`).join("\n") || "Key findings"}
Avoid: ${((brief?.avoid as string[]) || []).map((a: string) => `- ${a}`).join("\n") || "Clichés and filler"}
Closing direction: ${brief?.closingDirection || "End with honest unknowns"}

## RESEARCH DATA
Topic: ${researchData.topic}
Key findings:
${((researchData.keyFindings as string[]) || []).map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")}

Studies:
${((researchData.studies as Array<{ title: string; journal: string; year: string; finding: string }>) || []).map((s) => `- "${s.title}" (${s.journal}, ${s.year}): ${s.finding}`).join("\n")}

Mechanism: ${(researchData.mechanism as string) || "Research and explain."}

Counter-arguments:
${((researchData.counterArguments as string[]) || []).map((c: string) => `- ${c}`).join("\n")}

Expert positions:
${((researchData.expertQuotes as string[]) || []).join("\n")}

Key statistics:
${((researchData.statistics as string[]) || []).join("\n")}

Today's date: ${today}

IMPORTANT: Use the headline, slug, and description from the editorial brief exactly. Use web search to verify key statistics and find additional evidence. Return ONLY valid JSON.`;

  const articleRaw = await claude({
    system: ARTICLE_WRITING_PROMPT,
    user: articleUserPrompt,
    model,
    maxTokens: 16000,
    temperature: 0.4,
    webSearch: true,
    maxSearches: 5,
  });

  const article = parseClaudeJSON(articleRaw) as {
    html: string;
    metadata: Record<string, unknown>;
    svg: string;
    toc: { id: string; title: string }[];
    readTime: number;
  };

  const slug = (editorBrief?.slug as string) || (article.metadata.slug as string);
  const readTime = article.readTime || (article.metadata.readTime as number) || 12;

  // Override metadata with editor's headline/description
  if (editorBrief?.headline) article.metadata.title = editorBrief.headline as string;
  if (editorBrief?.description) article.metadata.description = editorBrief.description as string;
  if (editorBrief?.slug) article.metadata.slug = editorBrief.slug as string;
  if (editorBrief?.categoryOverride) article.metadata.category = editorBrief.categoryOverride as string;

  // Save article to database as draft (editor QC hasn't happened yet)
  const dbArticle = {
    slug,
    title: article.metadata.title as string,
    description: article.metadata.description as string,
    category: (article.metadata.category as string) || (researchData.category as string),
    tags: (article.metadata.tags as string[]) || [],
    keywords: (article.metadata.keywords as string[]) || [],
    gradient_from: (article.metadata.gradient as Record<string, string>)?.from || "rose-600",
    gradient_to: (article.metadata.gradient as Record<string, string>)?.to || "red-700",
    featured: false,
    draft: true, // Draft until editor QC approves
    coming_soon: false,
    read_time: readTime,
    publish_date: today,
    article_html: article.html,
    article_svg: article.svg,
    toc: article.toc,
    source_text: `[Article Agent — ${today}]\nTopic: ${researchData.topic}\nEditor: ${editorBrief?.headline || "No brief"}`,
    status: "draft" as const,
  };

  const { error: dbError } = await db
    .from("articles")
    .upsert(dbArticle, { onConflict: "slug" })
    .select()
    .single();

  if (dbError) throw new Error(`DB save failed: ${dbError.message}`);

  await db
    .from("daily_article_log")
    .update({
      slug,
      title: article.metadata.title as string,
      status: "written",
      research_data: {
        ...researchData,
        _article: {
          metadata: article.metadata,
          svg: article.svg,
          html: article.html,
          toc: article.toc,
          readTime,
        },
      },
    })
    .eq("id", logId);
}

// ---------------------------------------------------------------------------
// STAGE 4: Senior Editor QC + Publish (~60s)
// ---------------------------------------------------------------------------
async function stageQCAndPublish(
  db: ReturnType<typeof supabase>,
  logId: string,
  slug: string,
  articleData: Record<string, unknown>,
  action: string,
): Promise<{ commitSha?: string; commitUrl?: string; newFeatured?: string | null; qcResult?: Record<string, unknown> }> {
  const today = todayISO();

  await db
    .from("daily_article_log")
    .update({ status: "editor_qc", created_at: new Date().toISOString() })
    .eq("id", logId);

  const metadata = articleData.metadata as Record<string, unknown>;

  // Senior Editor QC pass
  const qcPrompt = `Review this article before publication.

## ARTICLE
Title: ${metadata.title}
Description: ${metadata.description}
Category: ${metadata.category}
Word count: ~${((articleData.html as string) || "").split(/\s+/).length}

## FULL ARTICLE HTML (first 3000 chars for review):
${((articleData.html as string) || "").slice(0, 3000)}

## TABLE OF CONTENTS
${((articleData.toc as Array<{ title: string }>) || []).map((t) => `- ${t.title}`).join("\n")}

Make your final call. Publish, request revisions, or kill.`;

  const qcRaw = await claude({
    system: SENIOR_EDITOR_QC_PROMPT,
    user: qcPrompt,
    model: "claude-sonnet-4-20250514",
    maxTokens: 1500,
    temperature: 0.3,
  });

  const qcResult = parseClaudeJSON(qcRaw) as Record<string, unknown>;

  // If editor kills the article, mark as failed
  if (qcResult.decision === "kill") {
    await db.from("articles").update({ status: "archived", draft: true }).eq("slug", slug);
    await db
      .from("daily_article_log")
      .update({
        status: "failed",
        error: `Senior Editor QC killed: ${qcResult.killReason || "Quality standards not met"}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", logId);
    return { qcResult };
  }

  // If editor requests revisions, send back to write stage
  if (qcResult.decision === "revise") {
    await db
      .from("daily_article_log")
      .update({
        status: "editor_approved", // Back to write queue (next invocation will re-write)
        research_data: {
          ...((await db.from("daily_article_log").select("research_data").eq("id", logId).single()).data?.research_data || {}),
          _reviseInstructions: qcResult.reviseInstructions,
        },
      })
      .eq("id", logId);
    return { qcResult };
  }

  // Editor approved — apply any headline/description improvements
  const finalTitle = (qcResult.headline as string) || (metadata.title as string);
  const finalDescription = (qcResult.description as string) || (metadata.description as string);

  // Update article to published status with editor's final touches
  await db
    .from("articles")
    .update({
      title: finalTitle,
      description: finalDescription,
      draft: false,
      status: "published",
      published_at: new Date().toISOString(),
    })
    .eq("slug", slug);

  // Update metadata for GitHub publish
  metadata.title = finalTitle;
  metadata.description = finalDescription;

  await db
    .from("daily_article_log")
    .update({ title: finalTitle, status: "publishing", created_at: new Date().toISOString() })
    .eq("id", logId);

  const readTime = (articleData.readTime as number) || 12;

  // Generate illustration
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
          heroImageAlt = `Editorial illustration for ${finalTitle}`;
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Publish to GitHub
  let commitInfo: { commitSha: string; commitUrl: string } | null = null;

  if (action !== "dry-run") {
    const astroContent = assembleAstroFile(
      {
        title: finalTitle,
        description: finalDescription,
        category: metadata.category as string,
        readTime,
        tags: (metadata.tags as string[]) || [],
      },
      articleData.html as string,
      articleData.svg as string,
      (articleData.toc as { id: string; title: string }[]) || [],
    );

    const jsonMetadata: Record<string, unknown> = {
      title: finalTitle,
      description: finalDescription,
      category: metadata.category,
      publishDate: today,
      author: { name: "alumi news Editorial", role: "Medical Review Board" },
      readTime,
      featured: false,
      draft: false,
      tags: metadata.tags,
      gradient: metadata.gradient,
      keywords: metadata.keywords,
    };

    if (heroImage) {
      jsonMetadata.heroImage = heroImage;
      jsonMetadata.heroImageAlt = heroImageAlt;
    }

    commitInfo = await publishToGitHub(slug, astroContent, jsonMetadata);
  }

  // Smart featured rotation
  const newFeatured = await rotateFeatured(db);

  const finalStatus = action === "dry-run" ? "written" : "published";
  await db
    .from("daily_article_log")
    .update({ status: finalStatus, completed_at: new Date().toISOString() })
    .eq("id", logId);

  return {
    commitSha: commitInfo?.commitSha,
    commitUrl: commitInfo?.commitUrl,
    newFeatured,
    qcResult,
  };
}

// ===========================================================================
// MAIN HANDLER — 4-stage pipeline with Senior Editor
// ===========================================================================
// Each invocation processes ONE stage of ONE article.
// Priority: finish existing articles before starting new ones.
//   1. "written"          → Senior Editor QC + publish
//   2. "editor_approved"  → write the article
//   3. "research_done"    → Senior Editor brief
//   4. Nothing pending    → new research
// ===========================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const db = supabase();

  try {
    let body: { action?: string; model?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = { action: "run" };
    }
    const { action = "run", model } = body;

    // ------ STATUS ------
    if (action === "status") {
      const { data } = await db
        .from("daily_article_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      const { count: articleCount } = await db
        .from("articles")
        .select("*", { count: "exact", head: true });

      return json({ logs: data || [], articleCount });
    }

    // ------ Cleanup stale runs (>8 min) ------
    const eightMinutesAgo = new Date(Date.now() - 8 * 60 * 1000).toISOString();
    const { data: staleRuns } = await db
      .from("daily_article_log")
      .select("id")
      .in("status", [
        "started", "searching", "writing", "publishing", "editor_reviewing", "editor_qc",
        // Legacy
        "researching", "topic_selected", "saved",
      ])
      .lt("created_at", eightMinutesAgo);

    if (staleRuns && staleRuns.length > 0) {
      for (const stale of staleRuns) {
        await db
          .from("daily_article_log")
          .update({ status: "failed", error: "Timed out (stale run)", completed_at: new Date().toISOString() })
          .eq("id", (stale as { id: string }).id);
      }
    }

    // ------ Auto-stop at 100 articles ------
    const { count: articleCount } = await db
      .from("articles")
      .select("*", { count: "exact", head: true });

    if (articleCount && articleCount >= 100) {
      return json({
        skipped: true,
        message: `Target reached: ${articleCount} articles published. Ramp down the schedule.`,
        articleCount,
      });
    }

    // ------ Guard: block if a stage is already in progress ------
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: activeRuns } = await db
      .from("daily_article_log")
      .select("id, status")
      .in("status", [
        "started", "searching", "writing", "publishing", "editor_reviewing", "editor_qc",
        // Legacy
        "researching", "topic_selected",
      ])
      .gte("created_at", twoMinutesAgo)
      .limit(1);

    if (activeRuns && activeRuns.length > 0) {
      return json({
        skipped: true,
        message: `A stage is currently running (status: ${(activeRuns[0] as { status: string }).status}). Skipping.`,
      });
    }

    const articleModel =
      model === "opus" ? "claude-opus-4-6" : "claude-sonnet-4-6";

    // ================================================================
    // PRIORITY 1: Finish — QC + publish any "written" entries
    // ================================================================
    const { data: writtenEntries } = await db
      .from("daily_article_log")
      .select("id, slug, research_data")
      .eq("status", "written")
      .order("created_at", { ascending: true })
      .limit(1);

    if (writtenEntries && writtenEntries.length > 0) {
      const entry = writtenEntries[0] as { id: string; slug: string; research_data: Record<string, unknown> };
      const articleData = (entry.research_data as Record<string, unknown>)?._article as Record<string, unknown>;

      if (!articleData) {
        await db
          .from("daily_article_log")
          .update({ status: "failed", error: "Missing article data for QC stage" })
          .eq("id", entry.id);
        return json({ error: "Missing article data" }, 500);
      }

      const result = await stageQCAndPublish(db, entry.id, entry.slug, articleData, action);

      return json({
        success: true,
        stage: "editor_qc_publish",
        slug: entry.slug,
        qcDecision: (result.qcResult as Record<string, unknown>)?.decision,
        qcScore: (result.qcResult as Record<string, unknown>)?.qualityScore,
        commit: result.commitSha ? { sha: result.commitSha, url: result.commitUrl } : null,
        newFeatured: result.newFeatured,
        articleCount: (articleCount || 0) + 1,
      });
    }

    // ================================================================
    // PRIORITY 2: Advance — write any "editor_approved" entries
    // ================================================================
    const { data: approvedEntries } = await db
      .from("daily_article_log")
      .select("id, research_data")
      .eq("status", "editor_approved")
      .order("created_at", { ascending: true })
      .limit(1);

    if (approvedEntries && approvedEntries.length > 0) {
      const entry = approvedEntries[0] as { id: string; research_data: Record<string, unknown> };

      await stageWrite(db, entry.id, entry.research_data, articleModel);

      return json({
        success: true,
        stage: "write",
        logId: entry.id,
        message: "Article written. Next: Senior Editor QC + publish.",
      });
    }

    // ================================================================
    // PRIORITY 3: Review — editorial brief for any "research_done" entries
    // ================================================================
    const { data: researchedEntries } = await db
      .from("daily_article_log")
      .select("id, research_data")
      .eq("status", "research_done")
      .order("created_at", { ascending: true })
      .limit(1);

    if (researchedEntries && researchedEntries.length > 0) {
      const entry = researchedEntries[0] as { id: string; research_data: Record<string, unknown> };

      await stageEditorBrief(db, entry.id, entry.research_data);

      return json({
        success: true,
        stage: "editor_brief",
        logId: entry.id,
        message: "Senior Editor reviewed research. Next: write the article.",
      });
    }

    // ================================================================
    // PRIORITY 4: Start — research a fresh topic
    // ================================================================
    // Only block if there's an article actively in the pipeline (any non-terminal status).
    // Once all articles are published or failed, a new one starts immediately.
    const { data: activePipeline } = await db
      .from("daily_article_log")
      .select("id, status")
      .in("status", ["started", "searching", "research_done", "editor_reviewing", "editor_approved", "writing", "written", "editor_qc", "publishing"])
      .limit(1);

    if (activePipeline && activePipeline.length > 0) {
      return json({
        skipped: true,
        message: `Article already in pipeline (status: ${(activePipeline[0] as { status: string }).status}). Will start new research once it completes.`,
      });
    }

    // Create log entry and start research
    const today = todayISO();
    const { data: logEntry } = await db
      .from("daily_article_log")
      .insert({ run_date: today, status: "started" })
      .select("id")
      .single();

    if (!logEntry) throw new Error("Failed to create log entry");

    await stageResearch(db, logEntry.id);

    return json({
      success: true,
      stage: "research",
      logId: logEntry.id,
      message: "Research complete. Next: Senior Editor will review and create brief.",
    });
  } catch (err: unknown) {
    return json({
      error: "An internal error occurred",
      detail: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
