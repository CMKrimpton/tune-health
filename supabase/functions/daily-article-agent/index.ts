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
// Pipeline constants
// ---------------------------------------------------------------------------
const MAX_CONCURRENT = 1; // Serial until pipeline is proven stable
const STALE_MS = 5 * 60 * 1000;
const ACTIVE = ["started","searching","writing","publishing","editor_reviewing","editor_qc","independence_review","researching","topic_selected"];
const IN_PIPELINE = [...ACTIVE,"research_done","editor_approved","written","independence_done","saved"];

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
    model = "claude-sonnet-4-6",
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
    signal: AbortSignal.timeout(135_000), // 135s — Supabase Edge Functions timeout at ~150s
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
  // Step 1: Strip markdown code fences
  const cleaned = text
    .replace(/^[\s\S]*?```json?\n?/, "")
    .replace(/\n?```[\s\S]*$/, "")
    .trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // Step 2: Find the first { and match its closing }
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }

  if (end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* continue */ }
  }

  // Step 3: Try to repair truncated JSON (close open braces/brackets)
  let candidate = text.slice(start);
  // Count unclosed braces/brackets
  let openBraces = 0, openBrackets = 0;
  inString = false; escape = false;
  for (const ch of candidate) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "[") openBrackets++;
    if (ch === "]") openBrackets--;
  }
  // Close any trailing string, then close brackets/braces
  if (inString) candidate += '"';
  for (let i = 0; i < openBrackets; i++) candidate += "]";
  for (let i = 0; i < openBraces; i++) candidate += "}";
  try { return JSON.parse(candidate); } catch { /* continue */ }

  throw new Error("Failed to parse response as JSON (tried 3 strategies)");
}

// ---------------------------------------------------------------------------
// Safe stage wrapper — catches errors and records them in the log
// ---------------------------------------------------------------------------
async function safeStage(
  db: ReturnType<typeof supabase>,
  logId: string,
  stageName: string,
  fn: () => Promise<unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  // Pre-flight: check the article hasn't been killed (race condition guard)
  const { data: check } = await db.from("daily_article_log").select("status").eq("id", logId).maybeSingle();
  if (check?.status === "failed") {
    return { ok: false, error: "Article was killed — skipping stage" };
  }
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[${stageName}] Error for log ${logId}: ${msg}`);
    // Always fail hard. No auto-rollback — that causes infinite loops.
    // Admin can retry manually via the Retry button.
    await db.from("daily_article_log").update({
      status: "failed",
      error: `${stageName}: ${msg}`,
      completed_at: new Date().toISOString(),
    }).eq("id", logId);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Grok API (xAI) — independence review
// ---------------------------------------------------------------------------
async function grok(opts: { system: string; user: string; maxTokens?: number; temperature?: number }): Promise<string> {
  const key = (Deno.env.get("XAI_API_KEY") || "").trim();
  if (!key) throw new Error("XAI_API_KEY not set");
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: "grok-3",
      messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
      max_tokens: opts.maxTokens || 2000,
      temperature: opts.temperature || 0.4,
    }),
  });
  if (!res.ok) throw new Error("Grok " + res.status);
  const d = await res.json();
  return d.choices?.[0]?.message?.content || "";
}

// ---------------------------------------------------------------------------
// Self-chaining — fire-and-forget next stage invocation
// ---------------------------------------------------------------------------
function chainNextStage(logId: string) {
  const u = Deno.env.get("SUPABASE_URL"), k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!u || !k) return;
  fetch(u + "/functions/v1/daily-article-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + k },
    body: JSON.stringify({ action: "produce", logId }),
  }).catch(() => {});
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

Your job: use web search to discover 3-5 trending health topics from the last 3 days, then research each one enough to give the Senior Editor real options.

## Process
1. Search broadly for trending health news, viral health stories, and the most-discussed health research from the last 72 hours
2. Identify 3-5 distinct candidate topics with genuine scientific substance
3. For EACH candidate: find at least 2 studies/sources, the core mechanism, key statistics, and counter-arguments
4. Rank them by: scientific substance, trending momentum, counter-narrative potential, surprise factor
5. Return ALL candidates ranked — the Senior Editor will make the final pick

## Selection Criteria (ranked)
1. **Genuine scientific substance** — real studies, real data, not celebrity gossip or supplement hype
2. **Trending RIGHT NOW** — people are actively searching for it, it's in the news cycle
3. **Surprising or counter-narrative** — challenges conventional wisdom, reveals something unexpected
4. **Not already covered** — must not duplicate existing articles (list provided)
5. **Fits the voice** — "Evidence over allegiance." Aggressively neutral. Skeptical of all sources equally.

## Output Format
Return ONLY valid JSON (no code fences, no explanation):
{
  "candidates": [
    {
      "rank": 1,
      "topic": "The specific topic/angle",
      "headline_draft": "A working headline (magazine-quality, not clickbait)",
      "why": "1-2 sentences on why this topic is compelling",
      "category": "One of: Neuroscience, Mental Health, Longevity, Clinical Evidence, Environmental Health, Nutrition, Fitness, Sleep Science, Pharmacology",
      "keyFindings": ["Finding 1...", "Finding 2..."],
      "studies": [{ "title": "...", "journal": "...", "year": "...", "finding": "..." }],
      "counterArguments": ["Skeptic point 1", "Skeptic point 2"],
      "mechanism": "Brief explanation of the biological/physiological mechanism",
      "statistics": ["Key statistic 1", "Key statistic 2"]
    }
  ],
  "searchSummary": "Brief description of what you searched and the overall landscape"
}`;

// ---------------------------------------------------------------------------
// Directed Research — single topic from queue
// ---------------------------------------------------------------------------
const DIRECTED_RESEARCH_PROMPT = `You are an editorial research agent for alumi news ("Evidence. Wherever it leads.").

You have been assigned a SPECIFIC topic by the editorial team. Your job: deep-research it using web search and return structured findings.

Find the key studies, statistics, expert positions, biological mechanisms, and counter-arguments. Be thorough — the writer needs real evidence to work with.

## Output Format
Return ONLY valid JSON (no code fences, no explanation):
{
  "topic": "The specific topic as researched",
  "headline_draft": "A working headline (magazine-quality, not clickbait)",
  "why": "1-2 sentences on why this topic is worth covering",
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
const SENIOR_EDITOR_BRIEF_PROMPT = `You are the Senior Editor of alumi news — a premium health editorial publication. Your slogan: "Evidence. Wherever it leads." You are the most senior editorial voice.

Your voice: Think Ben Goldacre editing The New Yorker's science desk. Ruthless about evidence, allergic to clickbait, deeply compelling. Skeptical of pharma, government agencies, and alternative health equally.

## Your Job Right Now
Your research team has delivered candidate topics. You need to:

1. **Score ALL candidates** — Rate each 1-10. Substance, timeliness, counter-narrative potential.
2. **Check for overlap with existing articles** — This is CRITICAL. For EACH candidate, check if we already have an article covering the same subject area. If we do, compare: is the new angle genuinely better? If yes, the new piece can REPLACE the old one. If no, kill that candidate.
3. **Pick the winner** — considering collection balance, depth, and reader value.
4. **Craft the angle** — The second-order insight. The thing that makes a reader stop scrolling.
5. **Set the headline** — Magazine-quality. Specific. Magnetic. Not clickbait.
6. **Write the creative brief** — Tone, angle, emphasis, avoidance, opening, closing direction.
7. **Make the call** — approve or kill the entire batch.

## Overlap Rules
- Same drug/condition/study as an existing article? That's overlap. Kill it UNLESS the new angle is substantially better.
- If the new piece IS better: set "replacesSlug" to the slug of the article it should replace. We'll unpublish the old one.
- "Better" means: stronger evidence, more surprising angle, more relevant to readers right now.
- When in doubt, pick a topic in a DIFFERENT subject area entirely.

## Output Format
Return ONLY valid JSON:
{
  "decision": "approve" | "kill",
  "candidateScores": [{ "rank": 1, "topic": "...", "score": 8, "note": "why this score", "overlapsExisting": "slug-of-overlapping-article or null" }],
  "chosenCandidate": 1,
  "topicScore": 8,
  "headline": "The final, polished headline",
  "slug": "url-friendly-slug",
  "description": "2-3 sentence SEO description that SELLS the article. Specific. Surprising.",
  "angle": "The specific editorial angle",
  "replacesSlug": null,
  "brief": {
    "tone": "Specific tone guidance for this piece",
    "openWith": "How to open — a specific scene, stat, or provocation",
    "emphasize": ["Key point 1", "Key point 2", "Key point 3"],
    "avoid": ["What NOT to do", "Clichés to avoid"],
    "closingDirection": "How to end"
  },
  "categoryOverride": null,
  "killReason": null
}`;

const SENIOR_EDITOR_QC_PROMPT = `You are the Senior Editor of alumi news doing a FINAL quality check before publication. This is the last gate. Once you approve, this goes live to readers.

IMPORTANT: This article has already passed editorial review and significant resources (research, writing, illustration) have been invested. Your job is to POLISH, not gatekeep. Prefer "publish" or "revise" over "kill". Only kill if the article has a fundamental factual error, ethical problem, or is genuinely unpublishable. A mediocre article that can be improved with revisions should get "revise", not "kill".

Your standards:
- Voice: Evidence over allegiance. Aggressively neutral. Smart friend who reads the studies.
- Style: 60% exceptional journalism, 20% Bill Maher, 15% Christopher Hitchens, 15% Sam Harris.
- Every claim should cite evidence. No hand-waving.
- Headline must be magnetic, specific, and honest.
- Description must SELL the article without clickbait.

## Your Job
Improve the headline and description if you can. Then PUBLISH. Your default decision should be "publish." Only use "revise" if the article has a SERIOUS factual error. Never revise for style, length, or minor issues — just fix the headline/description and publish.

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
// Independence Review (Grok) — checks for institutional deference
// ---------------------------------------------------------------------------
const INDEPENDENCE_REVIEW_PROMPT = `You are an independent editorial reviewer for alumi news — "Evidence. Wherever it leads." You are the outside skeptic. Your job is to make this article BETTER by catching bias and suggesting improvements.

## What to check
1. **Pharma framing** — does it uncritically frame drugs as the solution? Bury side effects or cost? Use industry PR language?
2. **Institutional deference** — does it treat CDC/FDA/WHO as gospel without noting conflicts of interest?
3. **Pulled punches** — does it hedge when the evidence is clear? Unnecessary "more research needed"?
4. **Missing counter-narrative** — is there a credible contrarian view or inconvenient data being ignored?
5. **Industry language** — "safe and effective" without nuance, unnamed "experts say"?

## How to respond
For each issue, give a SPECIFIC REWRITE SUGGESTION — not just "fix this" but actual replacement text the QC editor can use. Be constructive. The goal is to make the article more honest, not to block publication.

If the article is genuinely balanced and independent, say so enthusiastically.

Return ONLY valid JSON:
{
  "verdict": "clean" | "minor_issues" | "major_issues",
  "score": 8,
  "flags": [{ "type": "pharma_framing|institutional_deference|pulled_punch|missing_counter|industry_language", "quote": "the problematic text", "rewrite": "suggested replacement text", "reason": "why this matters" }],
  "improvements": ["Specific suggestion to make the article stronger", "Another suggestion"],
  "strengths": ["What the article does well"],
  "summary": "1-2 sentence overall assessment"
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
- Target 1,800-2,200 words. Dense and substantive, not padded.
- 8-12 specific evidence citations minimum.

## Output Format
Return ONLY the article body as raw HTML. NO JSON, NO metadata, NO SVG. Just the HTML sections.

Use these patterns:

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

## Rules
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
  queuedTopic?: string,
): Promise<void> {
  const today = todayISO();
  const { titles } = await getExistingArticles(db);

  // Also get recent pipeline topics (including killed/failed) to avoid repeating
  const { data: recentLogs } = await db
    .from("daily_article_log")
    .select("topic")
    .order("created_at", { ascending: false })
    .limit(20);
  const recentTopics = (recentLogs || [])
    .map((l: { topic: string | null }) => l.topic)
    .filter((t): t is string => !!t);

  await db
    .from("daily_article_log")
    .update({ status: "searching", stage_started_at: new Date().toISOString() })
    .eq("id", logId);

  let research: Record<string, unknown>;

  if (queuedTopic) {
    // Directed research for a queued topic
    const researchRaw = await claude({
      system: DIRECTED_RESEARCH_PROMPT,
      user: `Today's date: ${today}

## ASSIGNED TOPIC
${queuedTopic}

## Existing Articles (DO NOT duplicate):
${titles.map((t) => `- ${t}`).join("\n")}

Deep-research this topic thoroughly. Find the key studies, statistics, expert positions, mechanisms, and counter-arguments. Return structured JSON.`,
      model: "claude-sonnet-4-6",
      maxTokens: 4000,
      webSearch: true,
      maxSearches: 5,
    });

    research = parseClaudeJSON(researchRaw) as Record<string, unknown>;
    research._fromQueue = true;
  } else {
    // Multi-candidate trending research
    const researchRaw = await claude({
      system: RESEARCH_PROMPT,
      user: `Today's date: ${today}

## Your Task
Find 3 trending health topics from the last 3 days. Each must be a DIFFERENT subject area.

## OFF-LIMITS (already covered or recently tried):
${titles.slice(0, 20).map((t) => `- ${t}`).join("\n")}
${recentTopics.slice(0, 10).map((t) => `- TRIED: ${t}`).join("\n")}

Return 3 candidates across different categories. Keep research brief — editor picks, then we deep-dive.`,
      model: "claude-sonnet-4-6",
      maxTokens: 4000,
      webSearch: true,
      maxSearches: 3,
    });

    research = parseClaudeJSON(researchRaw) as Record<string, unknown>;
  }

  // Build topic summary for log
  const candidates = research.candidates as Array<Record<string, unknown>> | undefined;
  const topicSummary = candidates
    ? candidates.map((c, i) => `${i + 1}. ${c.topic}`).join(" | ")
    : (research.topic as string);

  await db
    .from("daily_article_log")
    .update({
      topic: topicSummary,
      status: "research_done",
      search_queries: candidates
        ? candidates.map((c) => c.headline_draft as string).slice(0, 10)
        : ((research.keyFindings as string[]) || []).slice(0, 10),
      research_snippets: candidates
        ? candidates.flatMap((c) => (c.studies as unknown[]) || []).slice(0, 10)
        : (research.studies as unknown[]) || [],
      research_data: research,
    })
    .eq("id", logId);

  chainNextStage(logId);
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
    .update({ status: "editor_reviewing", stage_started_at: new Date().toISOString() })
    .eq("id", logId);

  const { titles, categoryCounts } = await getExistingArticles(db);

  // Build editor prompt — multi-candidate or single-topic format
  const candidates = researchData.candidates as Array<Record<string, unknown>> | undefined;
  let researchSection: string;

  if (candidates && candidates.length > 0) {
    // Multi-candidate format
    researchSection = candidates.map((c, i) => {
      const studies = (c.studies as Array<{ title: string; journal: string; year: string; finding: string }>) || [];
      return `### CANDIDATE ${i + 1} (Research rank: ${c.rank || i + 1})
Topic: ${c.topic}
Working headline: ${c.headline_draft}
Category: ${c.category}
Why: ${c.why}

Key findings:
${((c.keyFindings as string[]) || []).map((f: string, j: number) => `${j + 1}. ${f}`).join("\n")}

Studies:
${studies.map((s) => `- "${s.title}" (${s.journal}, ${s.year}): ${s.finding}`).join("\n")}

Mechanism: ${c.mechanism || "Not provided"}
Counter-arguments: ${((c.counterArguments as string[]) || []).map((a: string) => a).join("; ")}
Key statistics: ${((c.statistics as string[]) || []).join("; ")}`;
    }).join("\n\n");
  } else {
    // Single-topic format (from queue or legacy)
    researchSection = `### RESEARCH BRIEF
Topic: ${researchData.topic}
Working headline: ${researchData.headline_draft}
Category: ${researchData.category}
Why this topic: ${researchData.why}

Key findings:
${((researchData.keyFindings as string[]) || []).map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")}

Studies:
${((researchData.studies as Array<{ title: string; journal: string; year: string; finding: string }>) || []).map((s) => `- "${s.title}" (${s.journal}, ${s.year}): ${s.finding}`).join("\n")}

Mechanism: ${researchData.mechanism || "Not provided"}
Counter-arguments: ${((researchData.counterArguments as string[]) || []).map((c: string) => `- ${c}`).join("\n")}
Expert positions: ${((researchData.expertQuotes as string[]) || []).join("\n")}`;
  }

  const editorPrompt = `Review ${candidates ? `these ${candidates.length} research candidates` : "this research brief"} and create an editorial brief for the writer.

## RESEARCH
${researchSection}
${researchData.searchSummary ? `\nSearch summary: ${researchData.searchSummary}` : ""}

## CURRENT COLLECTION BALANCE
Category distribution (${titles.length} total articles):
${Object.entries(categoryCounts).sort(([, a], [, b]) => (b as number) - (a as number)).map(([cat, count]) => `- ${cat}: ${count}`).join("\n")}

## EXISTING HEADLINES (for differentiation):
${titles.slice(0, 30).map((t) => `- ${t}`).join("\n")}
${titles.length > 30 ? `... and ${titles.length - 30} more` : ""}

${candidates ? "Score ALL candidates, pick the best one considering collection balance, then write the brief for that topic." : "Make your editorial call. Approve with a killer brief, or kill it with a reason."}`;

  const editorRaw = await claude({
    system: SENIOR_EDITOR_BRIEF_PROMPT,
    user: editorPrompt,
    model: "claude-sonnet-4-6",
    maxTokens: 2500,
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

  // Extract the chosen candidate's research data for the writer
  let chosenResearch = researchData;
  if (candidates && editorBrief.chosenCandidate != null) {
    const idx = (editorBrief.chosenCandidate as number) - 1;
    const chosen = candidates[idx] || candidates[0];
    // Merge chosen candidate fields into top-level for downstream stages
    chosenResearch = { ...researchData, ...chosen, _allCandidates: candidates };
  }

  // Save unchosen candidates to topic queue for future articles
  if (candidates && candidates.length > 1 && editorBrief.chosenCandidate != null) {
    const chosenIdx = (editorBrief.chosenCandidate as number) - 1;
    const candidateScores = (editorBrief.candidateScores as Array<{ rank: number; score: number; verdict: string }>) || [];
    const unchosenTopics = candidates
      .filter((_: unknown, i: number) => i !== chosenIdx)
      .filter((c: Record<string, unknown>) => {
        const cs = candidateScores.find(s => s.rank === c.rank);
        return !cs || cs.score >= 5; // Only save decent candidates (score 5+)
      })
      .map((c: Record<string, unknown>) => {
        const cs = candidateScores.find(s => s.rank === c.rank);
        return {
          topic: c.topic as string,
          category: (c.category as string) || null,
          notes: `Auto-saved from research cycle. Editor scored: ${cs?.score || "?"}/10. ${cs?.verdict || ""}`,
          priority: 50,
          source: "trending",
          editor_score: cs?.score || null,
          research_summary: (c.why as string) || ((c.keyFindings as string[]) || []).slice(0, 2).join("; ") || null,
        };
      });

    if (unchosenTopics.length > 0) {
      await db.from("topic_queue").insert(unchosenTopics).select();
    }
  }

  // Editor approved — store the brief alongside research data
  await db
    .from("daily_article_log")
    .update({
      topic: (editorBrief.headline as string) || (chosenResearch.topic as string),
      title: editorBrief.headline as string,
      slug: editorBrief.slug as string,
      status: "editor_approved",
      editor_score: (editorBrief.topicScore as number) || null,
      source: researchData._queueId || researchData._fromQueue ? "queue" : "trending",
      research_data: {
        ...chosenResearch,
        _editorBrief: editorBrief,
      },
    })
    .eq("id", logId);

  chainNextStage(logId);
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
    .update({ status: "writing", stage_started_at: new Date().toISOString(), model_used: model })
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

Write the article. Return ONLY the article HTML — no JSON wrapper, no metadata, no SVG. Just the raw HTML sections starting with <section id="introduction">.`;

  // Call 1: Write the article HTML only — fast, no JSON overhead
  const articleHtml = await claude({
    system: ARTICLE_WRITING_PROMPT,
    user: articleUserPrompt,
    model,
    maxTokens: 6000,
    temperature: 0.4,
  });

  // Build metadata from editor brief — no API call needed
  const slug = (editorBrief?.slug as string) || "untitled";
  const title = (editorBrief?.headline as string) || (researchData.headline_draft as string) || "Untitled";
  const description = (editorBrief?.description as string) || "";
  const VALID_CATEGORIES = ["Neuroscience", "Mental Health", "Longevity", "Clinical Evidence", "Environmental Health", "Nutrition", "Fitness", "Sleep Science", "Pharmacology"];
  const rawCategory = (editorBrief?.categoryOverride as string) || (researchData.category as string) || "";
  const category = VALID_CATEGORIES.find(c => rawCategory.toLowerCase().includes(c.toLowerCase())) || "Clinical Evidence";
  const tags = ((researchData.tags as string[]) || (researchData.keyFindings as string[]) || []).slice(0, 5).map(t => typeof t === "string" && t.length < 30 ? t : t.split(" ").slice(0, 3).join(" "));
  const wordCount = articleHtml.split(/\s+/).length;
  const readTime = Math.max(5, Math.ceil(wordCount / 220));

  // Extract TOC from HTML section headers
  const tocMatches = [...articleHtml.matchAll(/<section id="([^"]+)"[\s\S]*?<h2>([^<]+)<\/h2>/g)];
  const toc = tocMatches.map(m => ({ id: m[1], title: m[2] }));
  // Always include introduction
  if (!toc.find(t => t.id === "introduction")) {
    toc.unshift({ id: "introduction", title: "Introduction" });
  }

  // Minimal SVG placeholder — illustration agent generates real image at publish
  const svg = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#0a0a15"/></linearGradient></defs><rect width="1200" height="600" fill="url(#bg)"/><circle cx="600" cy="300" r="120" fill="#dc262610" stroke="#dc262630" stroke-width="1"/>`;

  const article = {
    html: articleHtml.trim(),
    metadata: {
      title,
      slug,
      description,
      category,
      tags,
      gradient: { from: "rose-600", to: "red-700" },
      featured: false,
      readTime,
      publishDate: today,
      keywords: tags,
    },
    svg,
    toc,
    readTime,
  };
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

  chainNextStage(logId);
}

// ---------------------------------------------------------------------------
// STAGE 4a: Independence Review (Grok) — non-fatal (~30s)
// ---------------------------------------------------------------------------
async function stageIndependenceReview(
  db: ReturnType<typeof supabase>,
  logId: string,
  articleData: Record<string, unknown>,
): Promise<void> {
  await db
    .from("daily_article_log")
    .update({ status: "independence_review", stage_started_at: new Date().toISOString() })
    .eq("id", logId);

  const metadata = articleData.metadata as Record<string, unknown>;
  const htmlSnippet = ((articleData.html as string) || "").slice(0, 4000);

  let reviewResult: Record<string, unknown> | null = null;
  let skipReason: string | null = null;

  try {
    const reviewRaw = await grok({
      system: INDEPENDENCE_REVIEW_PROMPT,
      user: `## ARTICLE FOR REVIEW
Title: ${metadata.title}
Category: ${metadata.category}

## ARTICLE TEXT (first 4000 chars):
${htmlSnippet}

Review this article for pharma framing, institutional deference, pulled punches, and missing counter-narratives.`,
      maxTokens: 1500,
      temperature: 0.3,
    });

    reviewResult = parseClaudeJSON(reviewRaw) as Record<string, unknown>;
  } catch (err: unknown) {
    // Non-fatal — if Grok fails, we skip and continue
    skipReason = err instanceof Error ? err.message : "Grok unavailable";
  }

  // Store review in research_data alongside existing data
  const { data: logEntry } = await db
    .from("daily_article_log")
    .select("research_data")
    .eq("id", logId)
    .single();

  const existingResearch = (logEntry?.research_data as Record<string, unknown>) || {};

  const grokScore = reviewResult ? ((reviewResult.score as number) || (reviewResult.independenceScore as number) || null) : null;

  await db
    .from("daily_article_log")
    .update({
      status: "independence_done",
      grok_score: grokScore,
      research_data: {
        ...existingResearch,
        _independenceReview: reviewResult || { skipped: true, reason: skipReason },
      },
    })
    .eq("id", logId);

  chainNextStage(logId);
}

// ---------------------------------------------------------------------------
// STAGE 4b: Senior Editor QC + Publish (~60s)
// ---------------------------------------------------------------------------
async function stageQCAndPublish(
  db: ReturnType<typeof supabase>,
  logId: string,
  slug: string,
  articleData: Record<string, unknown>,
  action: string,
  independenceReview?: Record<string, unknown> | null,
): Promise<{ commitSha?: string; commitUrl?: string; newFeatured?: string | null; qcResult?: Record<string, unknown> }> {
  const today = todayISO();

  await db
    .from("daily_article_log")
    .update({ status: "editor_qc", stage_started_at: new Date().toISOString() })
    .eq("id", logId);

  const metadata = articleData.metadata as Record<string, unknown>;

  // Build independence review section for QC prompt
  let independenceSection = "";
  if (independenceReview && !independenceReview.skipped) {
    const flags = (independenceReview.flags as Array<Record<string, string>>) || [];
    if (flags.length > 0) {
      independenceSection = `\n## INDEPENDENCE REVIEW (external reviewer)
Verdict: ${independenceReview.verdict}
Summary: ${independenceReview.summary}
Flags:
${flags.map((f) => `- [${f.type}] "${f.quote}" — Suggestion: ${f.suggestion}`).join("\n")}

Consider these flags in your review. Address any legitimate concerns.\n`;
    } else {
      independenceSection = `\n## INDEPENDENCE REVIEW: Clean — no flags raised.\n`;
    }
  }

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
${independenceSection}
Make your final call. Publish, request revisions, or kill.`;

  const qcRaw = await claude({
    system: SENIOR_EDITOR_QC_PROMPT,
    user: qcPrompt,
    model: "claude-sonnet-4-6",
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

  // If editor requests revisions, send back to write stage (max 1 revision to avoid loops)
  if (qcResult.decision === "revise") {
    const currentLog = (await db.from("daily_article_log").select("research_data, revision_count").eq("id", logId).single()).data as { research_data: Record<string, unknown>; revision_count: number | null } | null;
    const currentData = (currentLog?.research_data as Record<string, unknown>) || {};
    const revisionCount = ((currentLog?.revision_count as number) || 0) + 1;

    if (revisionCount > 1) {
      // Max revisions reached — force publish with editor's improvements applied
      console.log(`[QC] Max revisions (${revisionCount}) reached for ${slug} — force publishing`);
      // Fall through to the publish logic below
    } else {
      await db
        .from("daily_article_log")
        .update({
          status: "editor_approved", // Back to write queue
          revision_count: revisionCount,
          research_data: {
            ...currentData,
            _reviseInstructions: qcResult.reviseInstructions,
          },
        })
        .eq("id", logId);
      chainNextStage(logId);
      return { qcResult };
    }
  }

  // Editor approved — apply any headline/description improvements
  const finalTitle = (qcResult.headline as string) || (metadata.title as string);
  const finalDescription = (qcResult.description as string) || (metadata.description as string);

  // Fetch log entry scores for the articles table
  const { data: logScores } = await db
    .from("daily_article_log")
    .select("editor_score, grok_score")
    .eq("id", logId)
    .single();

  // Update article to published status with editor's final touches
  await db
    .from("articles")
    .update({
      title: finalTitle,
      description: finalDescription,
      draft: false,
      status: "published",
      published_at: new Date().toISOString(),
      independence_score: logScores?.grok_score || null,
      editor_score: logScores?.editor_score || null,
      pipeline_log_id: logId,
    })
    .eq("slug", slug);

  // Update metadata for GitHub publish
  metadata.title = finalTitle;
  metadata.description = finalDescription;

  await db
    .from("daily_article_log")
    .update({ title: finalTitle, status: "publishing", stage_started_at: new Date().toISOString() })
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
      sortOrder: Date.now(),
    };

    if (heroImage) {
      jsonMetadata.heroImage = heroImage;
      jsonMetadata.heroImageAlt = heroImageAlt;
    }

    commitInfo = await publishToGitHub(slug, astroContent, jsonMetadata);

    // If this article replaces an older one, archive the old one
    const replacesSlug = (researchData._editorBrief as Record<string, unknown>)?.replacesSlug as string | null;
    if (replacesSlug) {
      await db.from("articles").update({ status: "archived", draft: true }).eq("slug", replacesSlug);
      console.log(`[Publish] Archived old article "${replacesSlug}" — replaced by "${slug}"`);
    }
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
// MAIN HANDLER — 5-stage pipeline with Senior Editor + Independence Review
// ===========================================================================
// Each invocation processes ONE stage. Up to MAX_CONCURRENT articles in parallel.
// Priority: finish existing articles before starting new ones.
//   1. "independence_done" → Senior Editor QC + publish
//   2. "written"           → Independence review (Grok)
//   3. "editor_approved"   → write the article
//   4. "research_done"     → Senior Editor brief
//   5. Nothing pending     → check topic queue, then trending research
// ===========================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const db = supabase();

  try {
    let body: { action?: string; model?: string; logId?: string; topic?: string; category?: string; priority?: number; queueId?: string; status?: string } = {};
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
        .limit(20);

      const { count: articleCount } = await db
        .from("articles")
        .select("*", { count: "exact", head: true });

      const { data: queue } = await db
        .from("topic_queue")
        .select("*")
        .in("status", ["queued", "assigned", "in_progress"])
        .order("expedite", { ascending: false })
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });

      return json({ logs: data || [], articleCount, queue: queue || [] });
    }

    // ------ TOPIC QUEUE ACTIONS ------
    if (action === "queue-topic") {
      const { topic, category, priority } = body;
      if (!topic) return json({ error: "topic is required" }, 400);
      const { data: queueEntry, error: qErr } = await db
        .from("topic_queue")
        .insert({ topic, category: category || null, priority: priority || 50, expedite: body.expedite || false, notes: body.notes || null })
        .select("id")
        .single();
      if (qErr) return json({ error: "Failed to queue topic", detail: qErr.message }, 500);
      return json({ success: true, queueId: queueEntry.id, message: `Topic queued: "${topic}"` });
    }

    if (action === "list-queue") {
      const { data: queue } = await db
        .from("topic_queue")
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true });
      return json({ queue: queue || [] });
    }

    if (action === "update-queue") {
      const { queueId } = body;
      if (!queueId) return json({ error: "queueId is required" }, 400);
      const updates: Record<string, unknown> = {};
      if (body.topic) updates.topic = body.topic;
      if (body.category) updates.category = body.category;
      if (body.priority != null) updates.priority = body.priority;
      if (body.status) updates.status = body.status;
      const { error: uErr } = await db.from("topic_queue").update(updates).eq("id", queueId);
      if (uErr) return json({ error: "Failed to update queue", detail: uErr.message }, 500);
      return json({ success: true, queueId });
    }

    if (action === "delete-queue") {
      const { queueId } = body;
      if (!queueId) return json({ error: "queueId is required" }, 400);
      await db.from("topic_queue").delete().eq("id", queueId);
      return json({ success: true, queueId });
    }

    // ------ KILL — admin force-kills a pipeline entry ------
    if (action === "kill-article") {
      const { logId } = body;
      if (!logId) return json({ error: "logId is required" }, 400);
      await db.from("daily_article_log").update({
        status: "failed",
        error: "Admin killed: " + (body.reason || "Manually stopped by admin"),
        completed_at: new Date().toISOString(),
      }).eq("id", logId);
      // Also archive the article if it exists
      const { data: logEntry } = await db.from("daily_article_log").select("slug").eq("id", logId).maybeSingle();
      if (logEntry?.slug) {
        await db.from("articles").update({ status: "archived", draft: true }).eq("slug", logEntry.slug);
      }
      return json({ success: true, message: "Article killed" });
    }

    // ------ CHAIN — self-invocation to process next stage immediately ------
    if (action === "chain") {
      // Fall through to normal pipeline processing below
      // The logId hint is just informational — we still pick by priority
    }

    // ------ RETRY — resume a failed run from its last good checkpoint ------
    if (action === "retry") {
      const { logId } = body;
      if (!logId) return json({ error: "logId is required for retry action" }, 400);

      const { data: logEntry, error: logError } = await db
        .from("daily_article_log")
        .select("*")
        .eq("id", logId)
        .maybeSingle();

      if (logError || !logEntry) {
        return json({ error: "Log entry not found", detail: logError?.message }, 404);
      }

      const research = (logEntry.research_data as Record<string, unknown>) || {};
      let resumeStatus: string;

      if (research._independenceReview && research._article) {
        // Independence review done — resume at QC + Publish
        resumeStatus = "independence_done";
      } else if (research._article) {
        // Article was written — resume at Independence Review
        resumeStatus = "written";
      } else if (research._editorBrief) {
        // Editor brief exists — resume at Write
        resumeStatus = "editor_approved";
      } else if (research.topic || research.keyFindings || research.candidates) {
        // Research data exists — resume at Editor Brief
        resumeStatus = "research_done";
      } else {
        // Nothing salvageable — restart from scratch
        resumeStatus = "started";
      }

      await db
        .from("daily_article_log")
        .update({
          status: resumeStatus,
          error: null,
          stage_started_at: new Date().toISOString(),
        })
        .eq("id", logId);

      return json({
        success: true,
        logId,
        previousStatus: logEntry.status,
        resumeStatus,
        message: `Reset to "${resumeStatus}" — next invocation will resume from this checkpoint.`,
      });
    }

    // ------ Cleanup stale runs — self-healing for timeouts ------
    const staleThreshold = new Date(Date.now() - STALE_MS).toISOString();
    const { data: staleRuns } = await db
      .from("daily_article_log")
      .select("id, research_data")
      .in("status", ACTIVE)
      .lt("stage_started_at", staleThreshold);

    if (staleRuns && staleRuns.length > 0) {
      for (const stale of staleRuns) {
        const staleId = (stale as { id: string }).id;
        const research = ((stale as { research_data: Record<string, unknown> | null }).research_data) || {};

        // Self-healing: determine the best resumption checkpoint from saved data
        let resumeStatus: string | null = null;
        if (research._independenceReview && research._article) {
          resumeStatus = "independence_done";
        } else if (research._article) {
          resumeStatus = "written";
        } else if (research._editorBrief) {
          resumeStatus = "editor_approved";
        } else if (research.topic || research.keyFindings || research.candidates) {
          resumeStatus = "research_done";
        }

        if (resumeStatus) {
          // Timeout with salvageable data — reset to checkpoint instead of failing
          await db
            .from("daily_article_log")
            .update({
              status: resumeStatus,
              error: null,
              stage_started_at: new Date().toISOString(),
            })
            .eq("id", staleId);
        } else {
          // No salvageable data — mark as failed
          await db
            .from("daily_article_log")
            .update({ status: "failed", error: "Timed out (stale run — no checkpoint data)", completed_at: new Date().toISOString() })
            .eq("id", staleId);
        }
      }
    }

    // ------ Article count (for status reporting) ------
    const { count: articleCount } = await db
      .from("articles")
      .select("*", { count: "exact", head: true });

    // ------ Guard: block if MAX_CONCURRENT active stages running ------
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: activeRuns } = await db
      .from("daily_article_log")
      .select("id, status")
      .in("status", ACTIVE)
      .gte("stage_started_at", twoMinutesAgo);

    if (activeRuns && activeRuns.length >= MAX_CONCURRENT) {
      return json({
        skipped: true,
        message: `${activeRuns.length} stages currently running (max ${MAX_CONCURRENT}). Skipping.`,
        active: activeRuns.map((r: Record<string, unknown>) => r.status),
      });
    }

    const articleModel =
      "claude-sonnet-4-6"; // Sonnet 4.6 — Opus times out on Edge Functions (~150s limit). Upgrade when longer timeout available.

    // ==============================================================
    // JOB 1: SCOUT — discover topics and fill the queue
    // Triggered by: cron (every 15 min) or action="scout"
    // ==============================================================
    if (action === "scout") {
      const { data: activePipeline } = await db
        .from("daily_article_log")
        .select("id")
        .in("status", ["started", "searching"])
        .gte("stage_started_at", new Date(Date.now() - 2 * 60 * 1000).toISOString());

      if (activePipeline && activePipeline.length > 0) {
        return json({ skipped: true, message: "Scout already running." });
      }

      const today = todayISO();
      const { data: logEntry } = await db
        .from("daily_article_log")
        .insert({ run_date: today, status: "started", source: "trending", stage_started_at: new Date().toISOString() })
        .select("id")
        .single();

      if (!logEntry) throw new Error("Failed to create log entry");

      const { ok, error } = await safeStage(db, logEntry.id, "Scout", () =>
        stageResearch(db, logEntry.id));
      if (!ok) return json({ error: "Scout failed", detail: error }, 500);

      // Research found candidates — editor picks best, rest go to queue.
      // Run editor brief immediately to sort candidates into queue.
      const { data: entry } = await db
        .from("daily_article_log")
        .select("id, research_data")
        .eq("id", logEntry.id)
        .single();

      if (entry?.research_data) {
        const { ok: ok2, error: err2 } = await safeStage(db, entry.id, "Scout Editor", () =>
          stageEditorBrief(db, entry.id, entry.research_data as Record<string, unknown>));
        if (!ok2) return json({ error: "Scout editor failed", detail: err2 }, 500);
      }

      const { count: queueCount } = await db
        .from("topic_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "queued");

      return json({
        success: true,
        stage: "scout",
        logId: logEntry.id,
        queueSize: queueCount || 0,
        message: `Scout complete. ${queueCount || 0} topics now in queue.`,
      });
    }

    // ==============================================================
    // JOB 2: PRODUCE — editor picks from queue, self-chains to publish
    // Triggered by: cron (every 5 min), action="produce", or action="run"
    // ==============================================================
    if (action === "run" || action === "produce") {
      // First: advance any article already in the production pipeline
      // Priority: finish existing before starting new
      for (const [status, stageName, handler] of [
        ["independence_done", "QC+Publish", async (e: { id: string; slug: string; research_data: Record<string, unknown> }) => {
          const artData = e.research_data?._article as Record<string, unknown>;
          const indReview = e.research_data?._independenceReview as Record<string, unknown> | null;
          if (!artData) { await db.from("daily_article_log").update({ status: "failed", error: "Missing article data" }).eq("id", e.id); return null; }
          return safeStage(db, e.id, "QC+Publish", () => stageQCAndPublish(db, e.id, e.slug, artData, action, indReview));
        }],
        ["written", "Independence", async (e: { id: string; slug: string; research_data: Record<string, unknown> }) => {
          const artData = e.research_data?._article as Record<string, unknown>;
          if (!artData) { await db.from("daily_article_log").update({ status: "failed", error: "Missing article data" }).eq("id", e.id); return null; }
          return safeStage(db, e.id, "Independence Review", () => stageIndependenceReview(db, e.id, artData));
        }],
        ["editor_approved", "Write", async (e: { id: string; research_data: Record<string, unknown> }) => {
          return safeStage(db, e.id, "Write", () => stageWrite(db, e.id, e.research_data, articleModel));
        }],
      ] as const) {
        const { data: entries } = await db
          .from("daily_article_log")
          .select("id, slug, research_data")
          .eq("status", status)
          .order("created_at", { ascending: true })
          .limit(1);

        if (entries && entries.length > 0) {
          const entry = entries[0] as { id: string; slug: string; research_data: Record<string, unknown> };
          const result = await (handler as (e: typeof entry) => Promise<{ ok: boolean; result?: unknown; error?: string } | null>)(entry);
          if (result && !result.ok) return json({ error: `${stageName} failed`, detail: result.error }, 500);
          return json({ success: true, stage: stageName, logId: entry.id });
        }
      }

      // No articles in production — start a new one from the queue
      const { data: topTopic } = await db
        .from("topic_queue")
        .select("id, topic, notes, category")
        .eq("status", "queued")
        .order("expedite", { ascending: false })
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1);

      if (!topTopic || topTopic.length === 0) {
        return json({ skipped: true, message: "Queue empty. Run 'scout' to discover topics." });
      }

      const topic = topTopic[0] as { id: string; topic: string; notes: string | null; category: string | null };
      await db.from("topic_queue").update({ status: "in_progress" }).eq("id", topic.id);

      // Create log, do directed research on the queued topic
      const today = todayISO();
      const { data: logEntry } = await db
        .from("daily_article_log")
        .insert({ run_date: today, status: "started", topic: topic.topic, source: "queue", stage_started_at: new Date().toISOString() })
        .select("id")
        .single();

      if (!logEntry) throw new Error("Failed to create log entry");

      const { ok: resOk, error: resErr } = await safeStage(db, logEntry.id, "Research", () =>
        stageResearch(db, logEntry.id, topic.topic));
      if (!resOk) return json({ error: "Research failed", detail: resErr }, 500);

      // Immediately chain to editor brief
      const { data: resEntry } = await db
        .from("daily_article_log")
        .select("id, research_data")
        .eq("id", logEntry.id)
        .single();

      if (resEntry?.research_data) {
        const { ok: edOk, error: edErr } = await safeStage(db, resEntry.id, "Editor Brief", () =>
          stageEditorBrief(db, resEntry.id, resEntry.research_data as Record<string, unknown>));
        if (!edOk) return json({ error: "Editor brief failed", detail: edErr }, 500);
      }

      // Mark queue topic complete
      await db.from("topic_queue").update({ status: "completed" }).eq("id", topic.id);

      // Self-chain to continue production (write stage next)
      chainNextStage(logEntry.id);

      return json({
        success: true,
        stage: "produce_started",
        logId: logEntry.id,
        topic: topic.topic,
        message: `Started producing: "${topic.topic}". Self-chaining through write → Grok → publish.`,
      });
    }
  } catch (err: unknown) {
    return json({
      error: "An internal error occurred",
      detail: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
