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
// API usage tracking & cost calculation
// ---------------------------------------------------------------------------
interface ApiUsage {
  model: string;
  stage: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// Pricing per million tokens (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6":       { input: 3,    output: 15 },
  "claude-sonnet-4-20250514": { input: 3,   output: 15 },
  "claude-opus-4-20250514":  { input: 15,   output: 75 },
  "grok-3":                  { input: 3,    output: 15 },
  "gemini-2.5-flash":        { input: 0.15, output: 0.60 },
};

// ---------------------------------------------------------------------------
// Deterministic category gradients + minimal SVG (no AI tokens wasted)
// ---------------------------------------------------------------------------
const CATEGORY_GRADIENTS: Record<string, { from: string; to: string; hex: string }> = {
  "Neuroscience":          { from: "violet-600",  to: "purple-700",  hex: "#7c3aed" },
  "Mental Health":         { from: "sky-500",     to: "blue-600",    hex: "#0ea5e9" },
  "Longevity":             { from: "emerald-500", to: "teal-600",    hex: "#10b981" },
  "Clinical Evidence":     { from: "amber-500",   to: "orange-600",  hex: "#f59e0b" },
  "Environmental Health":  { from: "lime-500",    to: "green-600",   hex: "#84cc16" },
  "Nutrition":             { from: "emerald-600", to: "teal-700",    hex: "#059669" },
  "Fitness":               { from: "rose-600",    to: "red-700",     hex: "#e11d48" },
  "Sleep Science":         { from: "indigo-500",  to: "purple-600",  hex: "#6366f1" },
  "Pharmacology":          { from: "amber-500",   to: "orange-600",  hex: "#f59e0b" },
};

const VALID_CATEGORIES = ["Neuroscience", "Mental Health", "Longevity", "Clinical Evidence", "Environmental Health", "Nutrition", "Fitness", "Sleep Science", "Pharmacology"];

function getCategoryGradient(category: string): { from: string; to: string } {
  const g = CATEGORY_GRADIENTS[category];
  return g ? { from: g.from, to: g.to } : { from: "rose-600", to: "red-700" };
}

function generateMinimalSvg(category: string): string {
  const color = CATEGORY_GRADIENTS[category]?.hex || "#dc2626";
  return `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#0a0a15"/></linearGradient></defs><rect width="1200" height="600" fill="url(#bg)"/><circle cx="900" cy="200" r="120" fill="${color}15"/><circle cx="300" cy="400" r="80" fill="${color}10"/>`;
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] || PRICING["claude-sonnet-4-6"];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

async function addCostToLog(
  db: ReturnType<typeof supabase>,
  logId: string,
  usage: ApiUsage,
) {
  const { data: current } = await db
    .from("daily_article_log")
    .select("cost_usd, token_usage")
    .eq("id", logId)
    .maybeSingle();
  const currentCost = parseFloat(current?.cost_usd ?? "0") || 0;
  const currentUsage = (current?.token_usage as ApiUsage[]) || [];
  await db.from("daily_article_log").update({
    cost_usd: Math.round((currentCost + usage.costUsd) * 10000) / 10000,
    token_usage: [...currentUsage, usage],
  }).eq("id", logId);
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

interface ApiResult { text: string; usage: ApiUsage }

async function claude(opts: ClaudeOptions, stage = "unknown"): Promise<ApiResult> {
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
    signal: AbortSignal.timeout(135_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    // Surface spending limit errors clearly so pipeline can bail early
    if (res.status === 400 && errText.includes("usage limits")) {
      throw new Error("SPENDING_LIMIT: Anthropic API usage limit reached. Pipeline paused until limit resets.");
    }
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

  const u = data.usage || {};
  const inputTokens = u.input_tokens || 0;
  const outputTokens = u.output_tokens || 0;

  return {
    text: fullText,
    usage: {
      model,
      stage,
      inputTokens,
      outputTokens,
      costUsd: calcCost(model, inputTokens, outputTokens),
    },
  };
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
async function grok(opts: { system: string; user: string; maxTokens?: number; temperature?: number }, stage = "independence"): Promise<ApiResult> {
  const key = (Deno.env.get("XAI_API_KEY") || "").trim();
  if (!key) throw new Error("XAI_API_KEY not set");
  const model = "grok-3";
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
      max_tokens: opts.maxTokens || 2000,
      temperature: opts.temperature || 0.4,
    }),
  });
  if (!res.ok) throw new Error("Grok " + res.status);
  const d = await res.json();
  const text = d.choices?.[0]?.message?.content || "";
  const finishReason = d.choices?.[0]?.finish_reason || "unknown";
  if (finishReason === "length") {
    console.log(`[Grok] WARNING: Response truncated (finish_reason=length) for stage ${stage}. max_tokens=${opts.maxTokens || 2000} was not enough.`);
  }
  const u = d.usage || {};
  const inputTokens = u.prompt_tokens || 0;
  const outputTokens = u.completion_tokens || 0;
  return {
    text,
    usage: { model, stage, inputTokens, outputTokens, costUsd: calcCost(model, inputTokens, outputTokens) },
  };
}

// ---------------------------------------------------------------------------
// Gemini API (Google) — topic discovery & web search
// ---------------------------------------------------------------------------
async function gemini(opts: { system: string; user: string; maxTokens?: number; temperature?: number }, stage = "research"): Promise<ApiResult> {
  const key = (Deno.env.get("GOOGLE_API_KEY") || "").trim();
  if (!key) throw new Error("GOOGLE_API_KEY not set");
  const model = "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        generationConfig: {
          maxOutputTokens: opts.maxTokens || 4000,
          temperature: opts.temperature || 0.4,
        },
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 500)}`);
  }
  let data = await res.json();
  let parts = data.candidates?.[0]?.content?.parts || [];
  let text = parts.map((p: { text?: string }) => p.text || "").join("");

  // Retry once if empty (Gemini sometimes returns empty on first try with search grounding)
  if (!text.trim()) {
    console.log(`[Gemini] Empty response on first try for ${stage}, retrying...`);
    const retry = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: [{ text: opts.user }] }],
          generationConfig: { maxOutputTokens: opts.maxTokens || 4000, temperature: opts.temperature || 0.4 },
          tools: [{ google_search: {} }],
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );
    if (retry.ok) {
      data = await retry.json();
      parts = data.candidates?.[0]?.content?.parts || [];
      text = parts.map((p: { text?: string }) => p.text || "").join("");
    }
  }

  if (!text.trim()) throw new Error("Empty Gemini response (after retry)");
  const um = data.usageMetadata || {};
  const inputTokens = um.promptTokenCount || 0;
  const outputTokens = um.candidatesTokenCount || 0;
  return {
    text,
    usage: { model, stage, inputTokens, outputTokens, costUsd: calcCost(model, inputTokens, outputTokens) },
  };
}

// ---------------------------------------------------------------------------
// Universal model dispatch — call any model through one interface
// ---------------------------------------------------------------------------
type ModelProvider = "anthropic" | "xai" | "google";

const MODEL_PROVIDERS: Record<string, ModelProvider> = {
  "claude-sonnet-4-6": "anthropic",
  "claude-sonnet-4-20250514": "anthropic",
  "claude-opus-4-20250514": "anthropic",
  "grok-3": "xai",
  "gemini-2.5-flash": "google",
};

// Ordered fallback chain: try Anthropic → Grok → Gemini
const WRITER_FALLBACK_CHAIN = ["claude-sonnet-4-6", "grok-3", "gemini-2.5-flash"];

async function generate(opts: { system: string; user: string; model: string; maxTokens?: number; temperature?: number; stage?: string }): Promise<ApiResult> {
  const provider = MODEL_PROVIDERS[opts.model];
  if (provider === "anthropic") {
    return claude({ system: opts.system, user: opts.user, model: opts.model, maxTokens: opts.maxTokens, temperature: opts.temperature }, opts.stage || "unknown");
  } else if (provider === "xai") {
    return grok({ system: opts.system, user: opts.user, maxTokens: opts.maxTokens, temperature: opts.temperature }, opts.stage || "unknown");
  } else if (provider === "google") {
    return gemini({ system: opts.system, user: opts.user, maxTokens: opts.maxTokens, temperature: opts.temperature }, opts.stage || "unknown");
  }
  throw new Error(`Unknown model: ${opts.model}`);
}

// Try models in order, falling back on failure (especially spending limits)
async function generateWithFallback(opts: { system: string; user: string; models: string[]; maxTokens?: number; temperature?: number; stage?: string }): Promise<ApiResult & { modelUsed: string }> {
  let lastError = "";
  for (const model of opts.models) {
    try {
      const result = await generate({ ...opts, model });
      return { ...result, modelUsed: model };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : "Unknown error";
      // If it's a spending limit, try next model
      if (lastError.includes("SPENDING_LIMIT") || lastError.includes("usage limits") || lastError.includes("rate_limit")) {
        console.log(`[Fallback] ${model} unavailable (${lastError.slice(0, 50)}), trying next...`);
        continue;
      }
      // For other errors (bad JSON, timeout), also try next
      console.log(`[Fallback] ${model} failed (${lastError.slice(0, 50)}), trying next...`);
      continue;
    }
  }
  throw new Error(`All models failed. Last error: ${lastError}`);
}

// Model pen names — each model gets a human byline
const MODEL_BYLINES: Record<string, { name: string; role: string }> = {
  "claude-sonnet-4-6":        { name: "Max Quilici",      role: "Senior Health Correspondent" },
  "claude-sonnet-4-20250514": { name: "Max Quilici",      role: "Senior Health Correspondent" },
  "claude-opus-4-20250514":   { name: "Carl Lundin",      role: "Editor-at-Large" },
  "grok-3":                   { name: "Linda Carnes",     role: "Investigative Health Reporter" },
  "gemini-2.5-flash":         { name: "Christine Wright",  role: "Science & Evidence Desk" },
};

function getByline(model: string): { name: string; role: string } {
  return MODEL_BYLINES[model] || { name: "alumi news Editorial", role: "Medical Review Board" };
}

// Pick a writer model — rotates to distribute across providers
function pickWriterModel(): string[] {
  const hour = new Date().getUTCHours();
  if (hour % 3 === 0) return ["claude-sonnet-4-6", "grok-3", "gemini-2.5-flash"];
  if (hour % 3 === 1) return ["grok-3", "claude-sonnet-4-6", "gemini-2.5-flash"];
  return ["gemini-2.5-flash", "grok-3", "claude-sonnet-4-6"];
}

// ---------------------------------------------------------------------------
// PubMed citation verification — non-blocking, stores results in log
// ---------------------------------------------------------------------------
async function verifyPubMedCitations(
  studies: Array<{ title?: string; journal?: string; year?: string }>,
): Promise<{ verified: number; failed: number; total: number; details: Array<{ title: string; found: boolean }> }> {
  if (!studies || studies.length === 0) return { verified: 0, failed: 0, total: 0, details: [] };

  const toCheck = studies.slice(0, 5); // Limit to 5 to avoid rate limiting
  const details: Array<{ title: string; found: boolean }> = [];
  let verified = 0;

  for (const study of toCheck) {
    if (!study.title) continue;
    try {
      // Search PubMed E-utilities (free, no API key needed for moderate use)
      const query = encodeURIComponent(study.title.slice(0, 200));
      const res = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${query}&retmode=json&retmax=1`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = await res.json();
        const count = parseInt(data?.esearchresult?.count || "0", 10);
        const found = count > 0;
        if (found) verified++;
        details.push({ title: study.title, found });
      } else {
        details.push({ title: study.title, found: false });
      }
    } catch {
      details.push({ title: study.title, found: false });
    }
    // Small delay to respect PubMed rate limits (3 req/s without API key)
    await new Promise(r => setTimeout(r, 350));
  }

  return { verified, failed: details.filter(d => !d.found).length, total: details.length, details };
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
  // Check when the current featured article was last set using updated_at
  // (featured=true is set via update, so updated_at reflects when it became featured)
  const { data: currentFeaturedCheck } = await db
    .from("articles")
    .select("updated_at")
    .eq("featured", true)
    .eq("status", "published")
    .maybeSingle();

  if (currentFeaturedCheck?.updated_at) {
    const featuredSince = Date.now() - new Date(currentFeaturedCheck.updated_at).getTime();
    if (featuredSince < 12 * 60 * 60 * 1000) return null; // Featured <12h ago, skip
  }

  const { data: articles } = await db
    .from("articles")
    .select("slug, title, category, publish_date, published_at, hero_image, read_time, featured, editor_score, independence_score")
    .eq("status", "published")
    .eq("draft", false)
    .order("published_at", { ascending: false });

  if (!articles || articles.length < 3) return null;

  const currentFeatured = articles.find((a: Record<string, unknown>) => a.featured);
  const now = Date.now();

  const scored = articles.map((a: Record<string, unknown>) => {
    const publishedAt = (a.published_at as string) || (a.publish_date as string);
    const ageHours = (now - new Date(publishedAt).getTime()) / (1000 * 60 * 60);

    // Quality gate — must have illustration to be featured
    if (!a.hero_image) return { slug: a.slug, score: -100 };

    // Recency: 30% — strong preference for recent, decays over 3 days
    const recency = Math.max(0, 30 * Math.exp(-ageHours / 72));

    // Editor quality: 25% — editor score (0-10 mapped to 0-25)
    const edScore = (a.editor_score as number) || 7;
    const quality = (edScore / 10) * 25;

    // Independence: 15% — Grok score (0-10 mapped to 0-15)
    const indScore = (a.independence_score as number) || 7;
    const independence = (indScore / 10) * 15;

    // Illustration: 10% (guaranteed since we gate above)
    const illustration = 10;

    // Read time sweet spot: 10% — 8-15 min is ideal
    const rt = (a.read_time as number) || 5;
    const readTime = rt >= 8 && rt <= 15 ? 10 : rt > 15 ? 7 : 3;

    // Category diversity: 10% — different category from current featured
    const diversity = currentFeatured && a.category === currentFeatured.category ? 0 : 10;

    // Penalty for already-featured — strong, prevents same article repeating
    const penalty = a.featured ? -50 : 0;

    return { slug: a.slug, score: recency + quality + independence + illustration + readTime + diversity + penalty };
  });

  scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
  const winner = scored[0];
  if (!winner || winner.score < 30 || (currentFeatured && winner.slug === currentFeatured.slug)) return null;

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
5. **Fits the voice** — "Evidence over allegiance." Aggressively neutral. Skeptical of all sources equally

## EVIDENCE HIERARCHY (CRITICAL)
Always prioritize the LATEST and LARGEST evidence. Health science is full of outdated dogma that persists in training data and popular media. When researching:
- **Recent meta-analyses and systematic reviews** outrank individual studies, no matter how famous
- **Large cohort studies (n>10,000)** outrank small trials
- **Studies published 2023-2026** outrank older evidence IF they update or contradict it
- **Industry-funded studies** must be flagged as such — note the funder
- **Retracted or corrected studies** must never be cited as current evidence
- If the LATEST evidence contradicts the mainstream consensus, report the latest evidence. Do not default to the older consensus just because it's more widely known.

## KNOWN DOGMA TRAPS — verify before repeating
These are areas where popular health advice is outdated, oversimplified, or industry-driven. Do NOT repeat these as fact without checking the latest evidence:
- Omega-3/omega-6 ratio theory (recent meta-analyses find the ratio largely irrelevant; individual fatty acid levels matter more)
- "Saturated fat causes heart disease" (oversimplified — context, source, and overall dietary pattern matter; the original Keys hypothesis has been substantially revised)
- "Breakfast is the most important meal of the day" (originated from industry-funded research; intermittent fasting evidence complicates this)
- BMI as a reliable health metric (poor proxy for metabolic health; waist-to-hip ratio and body composition are better predictors)
- Multivitamin supplements for general health (most large meta-analyses show no benefit for well-nourished populations)
- "Moderate alcohol is heart-healthy" (recent large Mendelian randomization studies and the Global Burden of Disease data challenge this — sick-quitter bias in older observational studies)
- Generic probiotic supplements (strain-specific evidence only; most commercial products lack evidence for their specific formulations)
- "Natural" = safe or better (naturalistic fallacy; many natural compounds are toxic, many synthetic ones are safe)
- Antioxidant supplements (several large RCTs show no benefit or harm; the oxidative stress theory of aging is far more nuanced than supplement marketing suggests)
- Low-fat diet as default healthy (the low-fat era is largely over; dietary fat quality matters more than quantity)
- "Detox" and "cleanse" products (the liver and kidneys handle detoxification; no supplement improves on healthy organ function)
- Blanket sunscreen absolutism (UV protection is important, but vitamin D deficiency has real costs; chemical vs mineral sunscreen safety is a legitimate debate)

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

CRITICAL: Prioritize the LATEST evidence (2023-2026). Health science is full of outdated dogma. If a recent meta-analysis contradicts older consensus, report the newer findings. Always note study funding sources. Never rely on "conventional wisdom" — verify it against current data.

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

## EDITORIAL INDEPENDENCE (CRITICAL — READ FIRST)
If a topic questions an industry or institution — your job is to SHARPEN that investigation, not neutralize it. If the research team brings you "vaccine industry financial incentives" — you craft an angle that follows the money. You do NOT reframe it as "actually vaccines are great." That's PR, not journalism. We are a journalism publication.

The AI default is to DEFEND powerful institutions. You must actively resist this. When in doubt: would Ben Goldacre flip this angle to make pharma look good? No. Neither do you.

This does NOT mean manufacturing outrage or ignoring evidence that defends the institution. It means: investigate the ASSIGNED ANGLE honestly. Present what you find. Let the reader decide.

## TONE MATCHING (CRITICAL)
The tone must fit the SUBJECT. Not every article is a scandal. Not every finding is a "hidden truth." Match the energy:

- **Genuine institutional failure** (pharma fraud, funding bias, suppressed data) → pointed, investigative, controlled anger OK
- **New mechanism discovery** (how GLP-1 works in the brain, microbiome-sleep link) → intellectual curiosity, "isn't this fascinating" energy, wonder
- **Clinical evidence review** (meta-analysis, trial results) → measured, authoritative, "here's what the data actually says"
- **Emerging/preliminary science** (single study, animal models) → cautious excitement, clear about limitations, "early but interesting"
- **Practical health** (exercise, nutrition, sleep hygiene) → direct, useful, no drama needed — just tell people what works and why
- **Contrarian/myth-busting** (only when the myth genuinely exists) → confident, evidence-first, but don't manufacture outrage where there isn't any

The AI default is to frame EVERYTHING as a hidden scandal. Resist this. A study about yawning and brain temperature doesn't need "Nobody is talking about this" energy. It's just interesting science. Let it be interesting.

## Your Job Right Now
Your research team has delivered candidate topics. You need to:

1. **Score ALL candidates** — Rate each 1-10. Substance, timeliness, counter-narrative potential.
2. **Check for overlap with existing articles** — This is CRITICAL. For EACH candidate, check if we already have an article covering the same subject area. If we do, compare: is the new angle genuinely better? If yes, the new piece can REPLACE the old one. If no, kill that candidate.
3. **Pick the winner** — considering collection balance, depth, and reader value.
4. **Craft the angle** — The second-order insight. The thing that makes a reader stop scrolling.
5. **Set the headline** — Magazine-quality. Specific. Honest. NOT clickbait.

## HEADLINE RULES (CRITICAL — read every time)
40% of our existing headlines start with "The." This is now BANNED as the default. Vary the structure.

**Banned headline patterns (overused — find alternatives):**
- "The [Noun] That [Dramatic Verb]..." — way overused. Dozens of these already.
- "Your [Body Part] Is [Dramatic Claim]" — we have 7+ of these. Stop.
- "[Subject]. Nobody Is Talking About It." / "...Nobody Wants to Fund" / "...Science Ignores" / "...Medicine Barely Noticed" — this framing implies conspiracy. We're a science publication, not a blog.
- "[Study] Just [Dramatic Verb]" — "Just Delivered Bad News", "Just Collapsed", "Just Exposed" — breathless language.
- "[Dramatic Claim]. That Explains Everything." — melodramatic.
- Two-sentence headlines where the second sentence is a short dramatic kicker — overused.

**Good headline models (vary across these):**
- Direct claim: "Exercise Beats SSRIs for Moderate Depression"
- Question: "Can a Soil Bacterium Replace Vancomycin?"
- Mechanism-forward: "How GLP-1 Drugs Quiet the Brain's Reward Circuitry"
- Person/study-forward: "A Harvard Lab Accidentally Discovered Why Sleep Clears Amyloid"
- Number-forward: "Three Genes. 75% of Preventable Drug Reactions."
- Understated: "Mirtazapine Deserves Better Than Its Reputation"
- Ironic/dry: "The Placebo Worked Better"

The goal: if you read 10 headlines in a row, they should feel like they came from different writers at the same magazine — not from the same headline generator.
6. **Assign the article archetype** — This determines the article's fundamental form and feel. NOT every article should be written the same way. Match the archetype to the material.
7. **Dogma check** — Before writing the brief, ask: does this topic touch any area where popular health advice is outdated or industry-driven? If so, add a "dogmaWarnings" field listing specific claims the writer must NOT repeat without verification (e.g., "Do not repeat omega-3/6 ratio claims as fact", "Note that the breakfast-is-essential claim is industry-funded"). This is CRITICAL editorial oversight.
8. **Write the creative brief** — Tone, angle, emphasis, avoidance, opening, closing direction. Include dogma warnings in the "avoid" field.
9. **Make the call** — approve or kill the entire batch.
10. **Flag series potential** — If a topic is so rich it naturally breaks into 2-4 standalone pieces (e.g., a drug class with distinct mechanisms, a condition with distinct subtopics), flag it. Don't force a series, but don't ignore natural multi-part material either.

## Article Archetypes
Choose ONE. This is the most important editorial decision — it shapes the entire article's form.

- **"deep-investigation"** — Multi-source, methodical build. For complex topics with competing evidence, institutional failures, or layered mechanisms. 2,000-2,400 words. Opens with a scene or observation. Builds slowly. Lots of evidence. This is your prestige format.
- **"the-explainer"** — "Here's how X actually works." Didactic but not boring. Uses analogies, metaphors, step-by-step breakdowns. Good for mechanisms, biological processes, "why does X happen" topics. 1,600-2,000 words. Can be warmer, more patient.
- **"provocation"** — Short, sharp, opinion-forward (backed by evidence). Takes a clear position and defends it. More conversational, more Hitchens. Good for institutional failures, bad science, overdue corrections. 1,200-1,600 words. Gets in, makes the case, gets out.
- **"case-study"** — Built around ONE study, one patient scenario, or one specific situation. Zooms in tight, then pulls out to implications. Good for breakthrough papers, unusual clinical presentations, single dramatic findings. 1,400-1,800 words.
- **"profile"** — Centers a researcher, lab, or clinical program doing interesting work. Human angle first, science through the lens of the person. Good for pioneering work, contrarian researchers, underfunded fields. 1,600-2,000 words.
- **"the-roundup"** — Covers multiple angles of a broader question. Shorter sections, more ground covered. Good for "state of the science" pieces, emerging fields, topics where 5 recent papers tell a story together. 1,800-2,200 words.
- **"myth-autopsy"** — Dissects a specific widely-held belief. Opens with the myth stated plainly, then dismantles it with evidence. This is ONE archetype, not the default. Only use when the topic genuinely IS a myth worth debunking. 1,600-2,000 words.

## Voice Modulation
Set these dials for each article:

- **tonePreset**: Choose ONE from: "straight-science" | "smart-casual" | "dry-analytical" | "storyteller" | "debunker" | "wire-dispatch" | "pointed" | "measured-authority" | "curious" | "understated". This is the MOST IMPORTANT editorial decision after archetype. All presets share the same core voice — the difference is subtle, like the same journalist on different days. VARY across the collection. Match to the SUBJECT.
- **density**: "data-heavy" | "narrative-driven" | "balanced" — Ratio of evidence citations to storytelling.
- **pacing**: "slow-build" | "rapid-fire" | "crescendo" — Does the article build methodically, hit fast, or start quiet and escalate?

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
  "headline": "The final headline — DO NOT start with 'The' by default. Match the tone to the subject: understated for nuanced science, direct for clear findings, pointed for institutional failures. See HEADLINE RULES above.",
  "slug": "url-friendly-slug",
  "description": "2-3 sentence description. Specific about what the reader will learn. Match the subject's weight — don't hype a quiet study, don't underplay a major finding.",
  "angle": "The specific editorial angle",
  "replacesSlug": null,
  "archetype": "deep-investigation | the-explainer | provocation | case-study | profile | the-roundup | myth-autopsy",
  "wordCount": { "min": 1600, "max": 2000 },
  "brief": {
    "tonePreset": "straight-science | smart-casual | dry-analytical | storyteller | debunker | wire-dispatch | pointed | measured-authority | curious | understated — Same voice, different gear. Match to subject. Vary across collection.",
    "tone": "Specific tone guidance for THIS piece beyond the preset — what makes this article's voice unique?",
    "density": "data-heavy | narrative-driven | balanced",
    "pacing": "slow-build | rapid-fire | crescendo",
    "openWith": "How to open — a SPECIFIC scene, stat, question, anecdote, or provocation. NOT 'here's what everyone thinks, but actually...' unless this is a myth-autopsy",
    "emphasize": ["Key point 1", "Key point 2", "Key point 3"],
    "avoid": ["What NOT to do", "Clichés to avoid"],
    "dogmaWarnings": ["Specific outdated claims the writer must NOT repeat as fact for this topic — e.g., 'Do not treat omega-3/6 ratio as established science', 'Note that the cited breakfast study was Kellogg-funded'"],
    "closingDirection": "How to end — NOT always a twist/paradox. Options: quiet observation, direct challenge, unanswered question, call to action, historical echo, clinical implication",
    "structuralNotes": "Any specific structural choices: should this skip info-cards? Use more/fewer pull-quotes? Open with a scene that returns at the end? Use short rapid-fire sections?"
  },
  "seriesCandidate": false,
  "seriesNotes": null,
  "categoryOverride": null,
  "killReason": null
}`;

const SENIOR_EDITOR_QC_PROMPT = `You are the Senior Editor of alumi news doing a FINAL quality check before publication. This is the last gate. Once you approve, this goes live to readers.

IMPORTANT: This article has already passed editorial review and significant resources (research, writing, illustration) have been invested. Your job is to POLISH, not gatekeep. Prefer "publish" or "revise" over "kill". Only kill if the article has a fundamental factual error, ethical problem, or is genuinely unpublishable. A mediocre article that can be improved with revisions should get "revise", not "kill".

Your standards:
- Voice: Evidence over allegiance. Aggressively neutral. Smart friend who reads the studies.
- Style: 60% exceptional journalism, 20% Bill Maher, 15% Christopher Hitchens, 15% Sam Harris.
- Every claim should cite evidence. No hand-waving.
- Headline must be specific and honest. If it starts with "The" or uses "Nobody/Science/Medicine [dramatic verb]" framing, rewrite it. We have too many of those. Prefer direct claims, mechanisms, questions, or understated phrasing.
- Description must intrigue without clickbait. No "you won't believe" energy.
- Articles come in different archetypes (investigations, explainers, provocations, case studies, etc.) — do NOT penalize an article for being shorter or structured differently than the default long-form investigation. A tight 1,300-word provocation is as valid as a 2,200-word deep dive.
- Watch for AI-sounding prose: uniform sentence length, overuse of "it's important to note," mechanical evidence presentation, every paragraph following the same rhythm. If you catch it, note it but don't kill for it.

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
const INDEPENDENCE_REVIEW_PROMPT = `You are the adversarial independence reviewer for alumi news — "Evidence. Wherever it leads." You are NOT here to be nice. You are here to catch the bias that the writer's own training data baked in.

YOUR JOB: Find every place this article defers to power, repeats dogma, or pulls its punches. The writer is an AI. AI writers have systematic blind spots: they reflexively defend pharmaceutical companies, treat regulatory agencies as trustworthy, hedge when evidence is clear, and smooth over inconvenient findings. YOUR VALUE is catching exactly these patterns.

## SCORING RULES (READ CAREFULLY — do NOT default to 7-8)
- **9-10**: Article actively challenges institutional narratives with specific evidence. Names funders. Questions consensus where warranted. Genuinely independent journalism.
- **7-8**: Solid but safe. Presents evidence fairly but doesn't dig into who profits from the conclusion. Acceptable for non-controversial topics.
- **5-6**: Noticeable institutional lean. Uses passive framing for industry problems. Hedges where evidence is clear. "More research needed" cop-outs.
- **3-4**: Reads like a press release for the industry it covers. Buries conflicts of interest. Treats regulatory approval as proof of safety.
- **1-2**: Active misinformation or pure industry propaganda disguised as journalism.

MOST AI-WRITTEN HEALTH ARTICLES SCORE 5-7. A score of 8+ should be RARE and EARNED. If you're giving 8/10 to every article, you're not doing your job.

## WHAT TO FLAG (be specific — quote the problematic text)
1. **Pharma framing** — drugs framed as solutions without cost/side-effect/access context?
2. **Institutional deference** — CDC/FDA/WHO treated as gospel without noting revolving doors, funding sources, or historical failures?
3. **Pulled punches** — evidence is clear but article hedges? "May suggest" when the meta-analysis is definitive?
4. **Missing counter-narrative** — who disagrees with this conclusion? What's the inconvenient data? If the article doesn't address this, flag it.
5. **Industry language** — "safe and effective", "well-tolerated", "gold standard" without scrutiny?
6. **Outdated dogma** — omega-3/6 ratios, saturated fat absolutism, BMI reliability, "moderate drinking is healthy", breakfast-is-essential, generic probiotic claims, antioxidant supplement benefits, "natural = better"?
7. **Missing money trail** — who funded the cited studies? Who profits from the conclusion? If the article doesn't say, flag it.
8. **Stale evidence** — citing famous old studies when newer, larger evidence exists?
9. **AI voice tells** — uniform sentence length, "it's important to note", "interestingly", mechanical evidence presentation?

## RESPONSE FORMAT
For EVERY flag, include the EXACT quote from the article and a SPECIFIC rewrite. Not "consider adding context" — write the actual replacement sentence.

Return ONLY valid JSON:
{
  "verdict": "clean" | "minor_issues" | "major_issues",
  "score": 6,
  "flags": [{ "type": "pharma_framing|institutional_deference|pulled_punch|missing_counter|industry_language|outdated_dogma|stale_evidence|unfunded_claim|ai_voice", "quote": "exact text from article", "rewrite": "your suggested replacement", "reason": "why this matters editorially" }],
  "improvements": ["Specific actionable suggestion"],
  "strengths": ["What genuinely works — be honest, not flattering"],
  "summary": "1-2 sentence blunt assessment — would YOU publish this in a magazine you respected?"
}`;

// ---------------------------------------------------------------------------
// Article Writer
// ---------------------------------------------------------------------------
const ARTICLE_WRITING_PROMPT = `You are a senior health journalist at alumi news, a premium editorial publication. You are writing a piece assigned by your Senior Editor. Follow the editorial brief precisely — especially the archetype, voice modulation, and structural notes. These shape the article's form. Every article should feel like it was written by the same publication but NOT by the same person on the same day.

## Core Editorial Standards (apply to ALL archetypes)
- Evidence over allegiance. Aggressively neutral. Smart friend who reads the studies.
- Direct, never condescending. Oxford comma. US English. No emojis.
- Every claim must cite a specific study, statistic, or source. Include author names, journal names, sample sizes, effect sizes where possible.
- Balanced perspective: treat mainstream medicine and alternative health with the same skepticism.
- NEVER fabricate study data, statistics, or author names.
- Sentence rhythm matters. Vary length. Short sentences after complex ones. Fragments OK. Don't write in uniform 15-20 word sentences — that's the AI giveaway.
- No throat-clearing. Start paragraphs with the point, not with setup for the point.
- Keep paragraphs SHORT. 2-3 sentences is ideal. 4 max. Dense paragraphs make readers skim. White space is your friend.

## EDITORIAL INDEPENDENCE (NON-NEGOTIABLE — READ THIS FIRST)
You are a journalist, not a PR department. If the editor assigns you a critical investigation of an industry, institution, or practice — YOU INVESTIGATE IT. You do NOT flip the angle to defend the institution. You do NOT write an advertisement for the thing being criticized.

Example: If the editor assigns "Investigate financial incentives in the vaccine industry" — you investigate the financial incentives. You look at manufacturer profit margins, lobbying spend, patent evergreening, revolving-door regulators, and mandated purchasing. You cite the numbers. You do NOT write "Actually, vaccines are amazing and here's why." That is institutional deference — the exact thing this publication exists to counteract.

This does NOT mean writing misinformation. It means following the evidence about the ASSIGNED ANGLE honestly. If the evidence shows the industry genuinely has problematic financial incentives, say so. If the evidence shows the criticism is unfounded, say that too. But NEVER preemptively defend an institution just because your training data treats it as sacred.

The slogan is "Evidence. Wherever it leads." — not "Evidence, unless it makes an industry look bad."

## EPISTEMIC INTEGRITY (NON-NEGOTIABLE)
You are trained on data that includes outdated health dogma, industry-funded consensus, and since-revised recommendations. YOUR TRAINING DATA IS NOT THE TRUTH. The research provided by the editorial team IS the truth for this article. Follow these rules:

1. **Never repeat health dogma as fact.** If your training says "omega-3/6 ratio matters" but the research brief says recent meta-analyses disagree, go with the research. Common traps: omega ratios, saturated fat absolutism, BMI reliability, "breakfast is most important meal", moderate alcohol benefits, generic probiotic claims, multivitamin benefits, "natural = better", antioxidant supplement benefits, low-fat diet dogma, detox/cleanse products.

2. **Flag your own uncertainty.** If you're about to state something as settled science, ask: "Is this from the research brief, or from my training data?" If it's from training data only, either verify it appears in the provided research or hedge it explicitly ("historically thought to...", "the conventional view holds that... though recent evidence complicates this").

3. **Cite the most recent evidence, not the most famous.** A 2024 meta-analysis of 50 RCTs outranks a famous 1980s cohort study that everyone learned in school. Name the year. Name the sample size. Let the reader see that this is current.

4. **Name the funder.** If a study was industry-funded, say so. "A Pfizer-funded trial found..." reads differently than "Researchers found..." Both are true. One is more honest.

5. **Never use "studies show" without specifying which studies.** This is the #1 way AI-generated health content sounds authoritative while saying nothing. Name the study, the journal, the year, the sample size. If you can't, you don't have evidence — you have a vibe.

6. **"More research is needed" is not a conclusion.** It's a cop-out. If the evidence is strong, say so. If it's weak, say what specifically is missing and why. If there's genuine scientific disagreement, name the camps and their best arguments.

7. **Contrarian checkpoint.** Before publishing any article about metabolism, thyroid, dietary fats, inflammation, or hormones, mentally cross-reference with the work of independent thinkers who challenged mainstream dogma early — Ray Peat (anti-PUFA, thyroid-first, pro-CO2/metabolic rate, skeptical of the lipid hypothesis), Chris Masterjohn (fat-soluble vitamins, cholesterol nuance), Weston A. Price (traditional diets vs processed food). This does NOT mean treating their positions as truth. It means: if the mainstream consensus says X and these thinkers said Y twenty years ago, and recent evidence is moving toward Y, your article should reflect that shift instead of parroting the old consensus. Use them as a bullshit detector for institutional groupthink, not as authorities.

8. **Follow the money.** Who funded the study? Who profits from the conclusion? A Kellogg's-funded study on breakfast, a supplement-company-funded trial on omega-3, a pharma-funded trial on their own drug — these aren't automatically wrong, but the reader deserves to know. Name the funder in the article when the funder has a financial interest in the outcome.

## Tone Presets (CRITICAL — from the editorial brief)
The brief specifies a tone preset. This prevents every article reading at the same intensity. ALL presets share the same DNA: evidence-first, direct, no throat-clearing, skeptical of all sources equally, never condescending. The difference between presets is SUBTLE — like the same journalist covering different beats on different days. Not different people. Same voice, different energy.

CRITICAL ANTI-AI RULES (apply to ALL presets):
- Never use manufactured wonder ("fascinatingly", "remarkably", "it turns out")
- Never use false intimacy ("let's dive in", "buckle up", "here's the thing")
- Never use empty transitions ("moreover", "furthermore", "additionally")
- Never use hedging stacks ("it's possible that perhaps this might suggest")
- Vary sentence length DRAMATICALLY within every preset. A 4-word sentence. Then a 30-word one that builds through a complex mechanism with multiple clauses before landing on the point. Then another short one. This is what makes prose feel human.
- Every paragraph earns its place. If a paragraph just restates what the previous one said in different words, delete it.

**"straight-science"** — The most restrained gear. Still has the alumi voice — still direct, still has opinions when the evidence warrants them — but the prose stays out of the way. Let the data and mechanisms carry the weight. Short paragraphs. Clear structure. The reader finishes feeling smarter without feeling worked over. The editorializing happens in WHAT you choose to emphasize, not in HOW you say it.

**"smart-casual"** — The default gear. Engaged, occasionally wry. Uses contractions naturally. Will note when something is interesting or absurd, but doesn't belabor it. Comfortable using "you" when it fits. This is the voice of someone who finds the subject genuinely interesting and assumes the reader does too.

**"dry-analytical"** — Same voice, cooler temperature. Lets the numbers do the talking. Humor comes through understatement, not commentary. A devastating finding gets stated plainly — the reader feels the impact without being told to feel it. Precise language. No adjective does more work than it should.

**"storyteller"** — Same voice, but opens with a scene, a person, or a moment. Evidence woven into narrative rather than presented as a list. Slightly longer sentences. Patient with detail. The difference from other presets: structure is chronological or character-driven rather than thematic. Still cites everything. Still skeptical.

**"debunker"** — Same voice, slightly more amused. Takes genuine intellectual pleasure in following bad logic to its conclusion. Not angry — confident. Presents the popular belief fairly before dismantling it with evidence. The wit is in the precision of the takedown, not in snark.

**"wire-dispatch"** — Same voice, maximum economy. Lead with the finding. Fill context after. Short sentences dominate. No scene-setting, no metaphors, no warm-up. For topics where the news itself is the story and commentary would slow it down.

**"pointed"** — The sharpest gear. This is where the editorial opinion is most visible. Takes a clear position backed by evidence. Will call out institutional failure, conflicts of interest, or willful ignorance directly. Not reckless — every pointed sentence is earned by the evidence preceding it. Use sparingly across the collection.

**"measured-authority"** — Same voice with slightly more formal sentence construction. Third person feels natural here. The prose has weight without being heavy. Appropriate for subjects where the reader expects expertise: pharmacology, treatment mechanisms, clinical evidence. Not academic — still readable, still has personality — but the personality is quieter.

**"curious"** — Same voice, slightly more openly interested. Asks genuine questions the research hasn't answered yet. Comfortable saying "we don't know yet" without it feeling like a cop-out. Good for frontier science where the fascination is in the gaps. The difference from smart-casual: more questions, more open threads, less resolution.

**"understated"** — Same voice at its quietest. States facts. Lets them land. Doesn't tell the reader how to feel about a statistic — presents it cleanly and moves on. The editorial perspective shows in what you choose to include and how you sequence it, not in commentary. For subjects where the data is stark enough to speak for itself.

## Voice Modulation (from the editorial brief)
The brief specifies a tone preset, density, and pacing. The tone preset is the primary control — follow it faithfully.

**Density:**
- "data-heavy" → lead with numbers, cite early and often. 10-15 citations. Tables of evidence OK. The data IS the story.
- "narrative-driven" → evidence woven into story. Fewer but more carefully placed citations (6-8). Scenes, characters, moments.
- "balanced" → standard mix. 8-12 citations. Evidence and narrative in roughly equal proportion.

**Pacing:**
- "slow-build" → long opening, patient development, payoff comes late. Good for investigations.
- "rapid-fire" → short paragraphs, quick transitions, high information density. Get in, make the case, get out.
- "crescendo" → starts quiet/observational, builds in intensity and stakes toward the end.

## Article Archetypes (from the editorial brief)
The archetype determines your article's fundamental FORM. Each suggests tone presets — the editor picks the final one.

**"deep-investigation"** (suggested presets: dry-analytical, storyteller, pointed) — Multi-source, methodical. 5-7 sections. Multiple evidence threads that converge. Pull quotes and info cards work well here. This earns its length.
**"the-explainer"** (suggested presets: straight-science, smart-casual, curious) — The reader wants to understand a mechanism or process. Analogies and metaphors welcome. Step-by-step is OK. Question-based section headings work well ("How does X work?", "What puts you at risk?"). Short paragraphs. Fewer pull quotes (0-2), info cards useful.
**"provocation"** (suggested presets: pointed, debunker) — Short, sharp. 3-5 sections max. Take a clear position in the opening and defend it. Pull quotes optional (0-1). Skip info cards unless they serve the argument.
**"case-study"** (suggested presets: storyteller, understated, smart-casual) — Zoom in tight on one study/case, then pull out. Open with the specific (the patient, the lab, the moment). Keep the scope narrow. 4-5 sections. 1-2 pull quotes, 1 info card max.
**"profile"** (suggested presets: storyteller, smart-casual) — Human angle first. Open with a scene involving the person/lab. Science through their lens. 4-6 sections. Pull quotes from the subject's own words.
**"the-roundup"** (suggested presets: straight-science, wire-dispatch, dry-analytical) — Multiple shorter sections (6-8), each covering a distinct angle or paper. Each section should be self-contained and scannable. Info cards useful for comparing across studies.
**"myth-autopsy"** (suggested presets: debunker, pointed) — State the myth plainly, then dismantle. Open with the myth as people actually believe it. Then the evidence. 4-6 sections. This is the ONLY archetype that should use the "here's what you thought... but actually" structure.

## BANNED PATTERNS — DO NOT USE
These phrases and structures have been overused. Find different ways to express the same ideas.

**Banned phrases:**
- "The honest answer is..."
- "What is not in dispute..."
- "In short..."
- "What emerges from the research..."
- "The research has produced..."
- "This is not a theoretical construct"
- "It's important to note" / "It's worth mentioning" / "Interestingly"
- "Consistent with..." as a transition between paragraphs
- "The mechanism by which..."

**Banned structural patterns:**
- Opening with "For X years/decades, people have been told..." followed by "But the science shows..." — unless this is a myth-autopsy archetype.
- Ending EVERY article with a paradox or ironic twist. Some articles should end quietly. Some should end with a direct statement. Some with a question. Vary the exit.
- Presenting EVERY study with the exact formula: "[N] participants, published in [Journal], [Year], found that..." — Vary citation style. Sometimes lead with the finding. Sometimes name the researcher. Sometimes embed the citation in the narrative.
- Using pull quotes that all follow the pattern: "[Mechanism statement] — [evidence] — [implication]." Pull quotes should feel like they were plucked from the text because they were striking, not because they follow a template.
- Starting every article with a declarative statement that frames the topic as a misconception.

**Vary instead:**
- Citation style: "Researchers at [University] discovered..." / "A [Year] paper in [Journal] upended..." / "The finding — [N] subjects, [effect size] — landed quietly" / "As [Researcher] put it in [Journal]..." / Just state the fact and parenthetically cite (Author, Journal, Year).
- Openings: scene, question, direct claim, historical moment, a number, a quiet observation, dialogue, a thought experiment.
- Closings: direct challenge, unanswered question, quiet observation, clinical implication, callback to opening, a single image, a fact that lingers.
- Transitions: not every section needs a bridge. Sometimes a hard cut is better.

## Output Format
Return ONLY valid JSON:
{
  "html": "...",
  "metadata": { ... },
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

Pull quotes (0-3, as appropriate for archetype):
<aside class="pull-quote reveal"><p>"Quote text."</p></aside>

Info cards (0-2, as appropriate for archetype):
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
  "category": "One of: Neuroscience, Mental Health, Longevity, Clinical Evidence, Environmental Health, Nutrition, Fitness, Sleep Science, Pharmacology",
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"],
  "featured": false,
  "readTime": <number>,
  "publishDate": "${todayISO()}",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}

### toc field
Array of { "id": "section-id", "title": "Display Title" }.

### readTime field
Estimated minutes (220 wpm, rounded up).

## Final Rules
- Follow the editorial brief's archetype, angle, opening direction, emphasis points, and closing direction.
- Respect the word count range from the brief. Not every article needs to be 2,000 words. A tight 1,300-word provocation is better than a padded 2,000-word one.
- The article should feel like it was CHOSEN to be this form — not forced into a template.`;

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
  queueSource?: string | null,
): Promise<void> {
  const today = todayISO();
  const { titles, categoryCounts } = await getExistingArticles(db);

  // Also get recent pipeline topics (including killed/failed) to avoid repeating
  const { data: recentLogs } = await db
    .from("daily_article_log")
    .select("topic")
    .order("created_at", { ascending: false })
    .limit(20);
  const recentTopics = (recentLogs || [])
    .map((l: { topic: string | null }) => l.topic)
    .filter((t): t is string => !!t);

  // Get existing queue topics to avoid duplicates
  const { data: queueItems } = await db
    .from("topic_queue")
    .select("topic")
    .in("status", ["queued", "assigned", "in_progress"])
    .limit(50);
  const queueTopics = (queueItems || []).map((q: { topic: string }) => q.topic);

  await db
    .from("daily_article_log")
    .update({ status: "searching", stage_started_at: new Date().toISOString() })
    .eq("id", logId);

  let research: Record<string, unknown>;

  if (queuedTopic) {
    // Directed research for a queued topic — try Claude (web search), fall back to Gemini (Google Search)
    const researchPrompt = `Today's date: ${today}

## ASSIGNED TOPIC
${queuedTopic}

## Existing Articles (DO NOT duplicate):
${titles.map((t) => `- ${t}`).join("\n")}

Deep-research this topic thoroughly. Find the key studies, statistics, expert positions, mechanisms, and counter-arguments. Return structured JSON.`;

    let researchRaw: string;
    let researchUsage: ApiUsage;

    try {
      const result = await claude({
        system: DIRECTED_RESEARCH_PROMPT,
        user: researchPrompt,
        model: "claude-sonnet-4-6",
        maxTokens: 4000,
        webSearch: true,
        maxSearches: 5,
      });
      researchRaw = result.text;
      researchUsage = result.usage;
    } catch (claudeErr: unknown) {
      const errMsg = claudeErr instanceof Error ? claudeErr.message : "";
      if (errMsg.includes("SPENDING_LIMIT") || errMsg.includes("usage limits") || errMsg.includes("rate_limit")) {
        console.log("[Research fallback] Claude spending limit hit, falling back to Gemini...");
        const gemResult = await gemini({
          system: DIRECTED_RESEARCH_PROMPT + `\n\nCRITICAL: You MUST return ONLY a valid JSON object. No markdown, no explanation, no preamble. Just the JSON object starting with { and ending with }.`,
          user: researchPrompt + `\n\nReturn ONLY valid JSON with this structure: {"topic":"...","keyFindings":["..."],"studies":[{"title":"...","journal":"...","year":"...","finding":"..."}],"counterArguments":["..."],"mechanism":"...","statistics":["..."]}`,
          maxTokens: 4000,
          temperature: 0.35,
        }, "research-fallback-gemini");
        researchRaw = gemResult.text;
        researchUsage = gemResult.usage;
      } else {
        throw claudeErr;
      }
    }

    // Parse research JSON — with fallback to plain text extraction if Gemini didn't return valid JSON
    try {
      research = parseClaudeJSON(researchRaw) as Record<string, unknown>;
    } catch {
      console.log("[Research] JSON parse failed, extracting from plain text...");
      // Extract what we can from plain text response
      const lines = researchRaw.split("\n").filter((l: string) => l.trim().length > 10);
      research = {
        topic: queuedTopic,
        keyFindings: lines.slice(0, 8).map((l: string) => l.replace(/^[\d\.\-\*]+\s*/, "").trim()),
        studies: [],
        counterArguments: [],
        mechanism: lines.find((l: string) => l.toLowerCase().includes("mechanism")) || "",
        statistics: lines.filter((l: string) => /\d+%|\d+\s*(million|billion|thousand)/.test(l)).slice(0, 5),
      };
    }
    research._fromQueue = true;
    research._queueSource = queueSource || "manual";
    await addCostToLog(db, logId, researchUsage);
  } else {
    // TWO-MODEL SCOUT: Gemini discovers via Google Search, Sonnet structures into candidates

    // Step 1: Gemini searches the web for trending health topics
    const { text: geminiFindings, usage: geminiUsage } = await gemini({
      system: "You are a health science researcher. Find the most compelling, evidence-based health stories. Every topic must be backed by real studies. No celebrity health, no supplement hype.",
      user: `Find 10 compelling health stories we should cover. Mix of recent (last 30 days) and landmark (last 5 years).

FOCUS on these underserved categories: ${Object.entries(categoryCounts).filter(([, count]) => (count as number) <= 5).map(([cat, count]) => `${cat} (only ${count} articles)`).join(", ") || "Nutrition, Fitness, Sleep Science"}

Every topic must be COMPLETELY DIFFERENT from these subjects we already covered (${titles.length} articles):
${titles.map((t) => `- ${t.split(" (")[0]}`).join("\n")}

For each: headline, key finding, source, why it matters. Plain text, numbered 1-10.`,
      maxTokens: 4000,
      temperature: 0.4,
    }, "scout-gemini");
    await addCostToLog(db, logId, geminiUsage);

    // Step 2: Structure raw findings into candidate JSON — with fallback
    const structureSystem = `You structure raw research findings into JSON. For each candidate, also suggest how the article should be treated — is it a deep investigation, a quick explainer, a provocative opinion piece, a case study about one key paper, or a roundup of recent findings? This affects the entire downstream pipeline. Return ONLY valid JSON, no explanation.`;
    const structureUser = `From these research findings, pick the 5 BEST topics that are NOT in the off-limits list. Prioritize: diversity across categories, scientific substance, counter-narrative potential. For each topic, suggest a treatment — how should this article be shaped?

Return ONLY this JSON (5 candidates max):

{"candidates":[{"rank":1,"topic":"...","headline_draft":"...","why":"...","category":"Neuroscience|Mental Health|Longevity|Clinical Evidence|Environmental Health|Nutrition|Fitness|Sleep Science|Pharmacology","keyFindings":["..."],"studies":[{"title":"...","journal":"...","year":"...","finding":"..."}],"counterArguments":["..."],"mechanism":"...","statistics":["..."],"suggestedTreatment":"deep-investigation|the-explainer|provocation|case-study|profile|the-roundup|myth-autopsy","treatmentReason":"Why this treatment suits this topic"}]}

## RAW FINDINGS:
${geminiFindings}

## OFF-LIMITS (do not include topics in same subject area):
${titles.map((t) => `- ${t}`).join("\n")}

## PRIORITY CATEGORIES (need more articles):
${Object.entries(categoryCounts).filter(([, count]) => (count as number) <= 3).map(([cat]) => `- ${cat}`).join("\n") || "All categories well-covered"}`;

    const { text: researchRaw, usage: structureUsage, modelUsed: _structModel } = await generateWithFallback({
      system: structureSystem,
      user: structureUser,
      models: WRITER_FALLBACK_CHAIN,
      maxTokens: 4000,
      stage: "scout-structure",
    });
    await addCostToLog(db, logId, structureUsage);

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

  // ── HARD DUPLICATE FILTER ──────────────────────────────────────
  // Before the editor even sees candidates, programmatically remove
  // any that overlap with existing articles or queued topics.
  // This is the ONLY line of defense — do not rely on AI judgment.
  //
  // Strategy: bidirectional word overlap with stop-word filtering.
  // Checks BOTH directions (candidate→existing AND existing→candidate)
  // and flags if either exceeds 30%. Includes tags + description.
  const { data: existingArticles } = await db.from("articles").select("title, slug, keywords, tags, description, category").eq("status", "published");
  const { data: queuedItems } = await db.from("topic_queue").select("topic").in("status", ["queued", "assigned", "in_progress"]);

  // Common health/science words that inflate word counts without indicating topic uniqueness
  const STOP_WORDS = new Set([
    "that", "this", "with", "from", "have", "been", "your", "what", "when", "just",
    "more", "most", "than", "also", "about", "into", "does", "will", "could", "would",
    "should", "every", "their", "these", "those", "some", "other", "only", "first",
    "still", "even", "much", "many", "very", "between", "being", "after", "before",
    "here", "there", "where", "while", "each", "both", "through", "over", "under",
    // Generic health/science terms
    "health", "study", "research", "evidence", "science", "brain", "body", "human",
    "people", "patients", "treatment", "medical", "clinical", "risk", "effect",
    "effects", "years", "shows", "found", "according", "actually", "problem",
    "really", "everything", "explains", "never", "time", "new", "like",
  ]);

  function extractSubjectWords(text: string): Set<string> {
    return new Set(
      text.toLowerCase()
        .split(/[\s\-:,—–.'"?!()]+/)
        .filter(w => w.length > 3 && !STOP_WORDS.has(w))
    );
  }

  // Build fingerprints from title + slug + keywords + tags + description
  const existingFingerprints: { words: Set<string>; title: string }[] = [];
  for (const a of (existingArticles || []) as Array<{ title: string; slug: string; keywords: string[] | null; tags: string[] | null; description: string | null; category: string }>) {
    const raw = [
      a.title,
      (a.slug || "").replace(/-/g, " "),
      ...(a.keywords || []),
      ...(a.tags || []),
      a.description || "",
    ].join(" ");
    existingFingerprints.push({ words: extractSubjectWords(raw), title: a.title });
  }
  for (const q of (queuedItems || []) as Array<{ topic: string }>) {
    existingFingerprints.push({ words: extractSubjectWords(q.topic), title: q.topic });
  }

  function isDuplicate(topic: string, headline: string, extras?: { category?: string; keyFindings?: string[]; mechanism?: string }): boolean {
    // Build candidate fingerprint from ALL available info (topic + headline + category + findings + mechanism)
    const candidateText = [topic, headline, extras?.category || "", extras?.mechanism || "", ...(extras?.keyFindings || [])].join(" ");
    const candidateWords = extractSubjectWords(candidateText);
    if (candidateWords.size === 0) return false;

    for (const fp of existingFingerprints) {
      if (fp.words.size === 0) continue;
      // Bidirectional overlap: check both directions, take the higher %
      const candidateArr = [...candidateWords];
      const existingArr = [...fp.words];
      const overlapCount = candidateArr.filter(w => fp.words.has(w)).length;
      const reverseCount = existingArr.filter(w => candidateWords.has(w)).length;
      const candidatePct = overlapCount / candidateWords.size;
      const existingPct = reverseCount / fp.words.size;
      const maxPct = Math.max(candidatePct, existingPct);
      // 55% bidirectional overlap AND 5+ matching subject words → duplicate
      // Only catches near-exact matches. The AI editor handles nuanced overlap detection.
      if (maxPct >= 0.55 && overlapCount >= 5) return true;
    }
    return false;
  }

  // Filter candidates BEFORE the editor sees them
  let candidates = researchData.candidates as Array<Record<string, unknown>> | undefined;

  if (candidates) {
    const before = candidates.length;
    candidates = candidates.filter(c =>
      !isDuplicate((c.topic as string) || "", (c.headline_draft as string) || "", {
        category: c.category as string,
        keyFindings: c.keyFindings as string[],
        mechanism: c.mechanism as string,
      })
    );
    if (candidates.length < before) {
      console.log(`[Editor] Filtered ${before - candidates.length} duplicate candidates (${before} → ${candidates.length})`);
    }
    if (candidates.length === 0) {
      // All candidates were duplicates — kill this run
      await db.from("daily_article_log").update({
        status: "failed",
        error: `All ${before} candidates were duplicates of existing articles. Scout needs to find different topics.`,
        completed_at: new Date().toISOString(),
      }).eq("id", logId);
      return;
    }
  } else if (researchData.topic) {
    // Single topic from queue — let the editor decide if it's a duplicate.
    // The editor sees ALL existing titles and can make a nuanced judgment.
    // Only block exact-match duplicates (mechanical check catches near-identical titles).
    if (isDuplicate((researchData.topic as string) || "", (researchData.headline_draft as string) || "", {
      category: researchData.category as string,
      keyFindings: researchData.keyFindings as string[],
      mechanism: researchData.mechanism as string,
    })) {
      console.log(`[Editor] Mechanical dupe check flagged "${researchData.topic}" — passing to editor for final judgment.`);
      // Don't kill — let the editor see it. The editor prompt includes all existing titles
      // and will kill it if it's genuinely redundant, or find a fresh angle if it's not.
    }
  }

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

  const isManuallyQueued = researchData._queueSource === "manual";
  const originalQueuedTopic = (researchData.topic as string) || "";

  const queueDirective = isManuallyQueued ? `\n## MANDATORY EDITORIAL DIRECTION\nThis topic was MANUALLY QUEUED by the editor-in-chief. The original topic was:\n"${originalQueuedTopic}"\n\nYou MUST preserve the editorial intent of this topic. If the topic is critical of an industry, your headline and angle must reflect that critical investigation — NOT neutralize it into a "balanced" overview. If the topic asks to follow the money, your brief must direct the writer to follow the money. Do NOT reframe a pointed investigation as a neutral explainer. The editor-in-chief chose this angle for a reason.\n` : "";

  const editorPrompt = `Review ${candidates ? `these ${candidates.length} research candidates` : "this research brief"} and create an editorial brief for the writer.
${queueDirective}
## RESEARCH
${researchSection}
${researchData.searchSummary ? `\nSearch summary: ${researchData.searchSummary}` : ""}

## CURRENT COLLECTION BALANCE
Category distribution (${titles.length} total articles):
${Object.entries(categoryCounts).sort(([, a], [, b]) => (b as number) - (a as number)).map(([cat, count]) => `- ${cat}: ${count}`).join("\n")}

## EXISTING HEADLINES (for differentiation):
${titles.slice(0, 30).map((t) => `- ${t}`).join("\n")}
${titles.length > 30 ? `... and ${titles.length - 30} more` : ""}

## CATEGORY BALANCE RULE (HARD CONSTRAINT)
${(() => {
    const total = titles.length || 1;
    const overserved = Object.entries(categoryCounts).filter(([, c]) => (c as number) / total > 0.15).map(([cat]) => cat);
    const underserved = Object.entries(categoryCounts).filter(([, c]) => (c as number) / total < 0.05).map(([cat]) => cat);
    const missing = VALID_CATEGORIES.filter(c => !categoryCounts[c]);
    const all = [...underserved, ...missing];
    if (all.length > 0) {
      return `PRIORITY: These categories are severely underserved: ${all.join(", ")}. If ANY candidate is in one of these categories AND scores 5+, pick it OVER a higher-scoring candidate from an overserved category (${overserved.join(", ")}) — UNLESS the score difference is >3 points.`;
    }
    return "Categories are well-balanced. Pick purely on quality.";
  })()}

${candidates ? "Score ALL candidates, pick the best one considering collection balance, then write the brief for that topic." : "Make your editorial call. Approve with a killer brief, or kill it with a reason."}`;

  const { text: editorRaw, usage: editorUsage } = await generateWithFallback({
    system: SENIOR_EDITOR_BRIEF_PROMPT,
    user: editorPrompt,
    models: WRITER_FALLBACK_CHAIN,
    maxTokens: 2500,
    temperature: 0.4,
    stage: "editor-brief",
  });
  await addCostToLog(db, logId, editorUsage);

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
      // Use the same isDuplicate check from above
      const deduped = unchosenTopics.filter((t: Record<string, unknown>) =>
        !isDuplicate((t.topic as string) || "", (t.topic as string) || "")
      );

      if (deduped.length > 0) {
        await db.from("topic_queue").insert(deduped).select();
      }
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
  models: string[],
): Promise<void> {
  const today = todayISO();
  const editorBrief = researchData._editorBrief as Record<string, unknown>;
  const brief = editorBrief?.brief as Record<string, unknown> | undefined;

  await db
    .from("daily_article_log")
    .update({ status: "writing", stage_started_at: new Date().toISOString(), model_used: models[0] })
    .eq("id", logId);

  const archetype = (editorBrief?.archetype as string) || "deep-investigation";
  const wordCount = editorBrief?.wordCount as { min?: number; max?: number } | undefined;
  const wordMin = wordCount?.min || 1800;
  const wordMax = wordCount?.max || 2200;

  const articleUserPrompt = `Write an article following this editorial brief from the Senior Editor. The archetype and voice modulation are critical — they determine the article's form, not just its content.

## EDITORIAL BRIEF
Headline: ${editorBrief?.headline || researchData.headline_draft}
Slug: ${editorBrief?.slug || "auto-generate"}
Description: ${editorBrief?.description || "Write a compelling 2-3 sentence description"}
Angle: ${editorBrief?.angle || "Follow the research"}
Category: ${editorBrief?.categoryOverride || researchData.category}

### Article Form
Archetype: ${archetype}
Tone preset: ${brief?.tonePreset || "smart-casual"} — Same voice, different gear. Follow this preset precisely — it controls how much editorial energy the prose carries.
Word count target: ${wordMin}-${wordMax} words
Density: ${brief?.density || "balanced"}
Pacing: ${brief?.pacing || "slow-build"}

### Writer's Direction
Tone: ${brief?.tone || "Standard editorial voice"}
Open with: ${brief?.openWith || "A compelling hook"}
Emphasize: ${((brief?.emphasize as string[]) || []).map((e: string) => `- ${e}`).join("\n") || "Key findings"}
Avoid: ${((brief?.avoid as string[]) || []).map((a: string) => `- ${a}`).join("\n") || "Clichés and filler"}
${((brief?.dogmaWarnings as string[]) || []).length > 0 ? `\n### DOGMA WARNINGS (from the editor — DO NOT IGNORE)\n${((brief?.dogmaWarnings as string[]) || []).map((w: string) => `⚠️ ${w}`).join("\n")}\n` : ""}Closing direction: ${brief?.closingDirection || "End with honest unknowns"}
Structural notes: ${brief?.structuralNotes || "Use your judgment based on the archetype"}

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

IMPORTANT: Use the headline, slug, and description from the editorial brief exactly. Return ONLY valid JSON.

CRITICAL STRUCTURE RULE: Every article MUST have a proper ending. The last section should be a conclusion, sign-off, or forward-looking closing — NOT an abrupt stop mid-thought. If you're running low on space, cut a middle section shorter rather than omitting the ending. A missing conclusion is worse than a shorter article. Follow the closing direction from the editorial brief.`;

  const { text: articleRaw, usage: writeUsage, modelUsed } = await generateWithFallback({
    system: ARTICLE_WRITING_PROMPT,
    user: articleUserPrompt,
    models,
    maxTokens: 8192,
    temperature: 0.5,
    stage: "write",
  });
  await addCostToLog(db, logId, writeUsage);

  // Track which model actually wrote this article
  await db.from("daily_article_log").update({ model_used: modelUsed }).eq("id", logId);

  const article = parseClaudeJSON(articleRaw) as {
    html: string;
    metadata: Record<string, unknown>;
    toc: { id: string; title: string }[];
    readTime: number;
  };

  const slug = (editorBrief?.slug as string) || (article.metadata.slug as string);
  const readTime = article.readTime || (article.metadata.readTime as number) || 10;

  // Override metadata with editor's headline/description
  if (editorBrief?.headline) article.metadata.title = editorBrief.headline as string;
  if (editorBrief?.description) article.metadata.description = editorBrief.description as string;
  if (editorBrief?.slug) article.metadata.slug = editorBrief.slug as string;

  // Sanitize category to valid values only
  const rawCat = (editorBrief?.categoryOverride as string) || (article.metadata.category as string) || (researchData.category as string) || "";
  article.metadata.category = VALID_CATEGORIES.find(c => rawCat.toLowerCase().includes(c.toLowerCase())) || "Clinical Evidence";

  // Deterministic gradient + minimal SVG (no AI tokens wasted)
  const categoryStr = article.metadata.category as string;
  const gradient = getCategoryGradient(categoryStr);
  article.metadata.gradient = gradient;
  const svg = generateMinimalSvg(categoryStr);

  // Save article to database as draft (editor QC hasn't happened yet)
  const dbArticle = {
    slug,
    title: article.metadata.title as string,
    description: article.metadata.description as string,
    category: categoryStr || (researchData.category as string),
    tags: (article.metadata.tags as string[]) || [],
    keywords: (article.metadata.keywords as string[]) || [],
    gradient_from: gradient.from,
    gradient_to: gradient.to,
    featured: false,
    draft: true, // Draft until editor QC approves
    coming_soon: false,
    read_time: readTime,
    publish_date: today,
    article_html: article.html,
    article_svg: svg,
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
          svg,
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
  const articleHtml = (articleData.html as string) || "";

  let reviewResult: Record<string, unknown> | null = null;
  let skipReason: string | null = null;

  // Get research data for PubMed verification (runs in parallel with Grok)
  const { data: logForStudies } = await db
    .from("daily_article_log")
    .select("research_data")
    .eq("id", logId)
    .maybeSingle();
  const researchStudies = ((logForStudies?.research_data as Record<string, unknown>)?.studies as Array<{ title?: string; journal?: string; year?: string }>) || [];
  const pubmedPromise = verifyPubMedCitations(researchStudies);

  try {
    const { text: reviewRaw, usage: grokUsage } = await grok({
      system: INDEPENDENCE_REVIEW_PROMPT,
      user: `## ARTICLE FOR REVIEW
Title: ${metadata.title}
Category: ${metadata.category}
Word count: ~${Math.round(articleHtml.replace(/<[^>]*>/g, '').split(/\s+/).length)}

## FULL ARTICLE TEXT (read every word):
${articleHtml}

Read the ENTIRE article above. Then:
1. Score it honestly (most AI articles score 5-7, not 8+)
2. Quote SPECIFIC sentences that show bias, deference, or pulled punches
3. For each quote, write a concrete replacement sentence
4. Check: does it name study funders? Does it treat regulators as trustworthy without evidence? Does it hedge clear findings?
5. Would you publish this in a magazine you respected?`,
      maxTokens: 2500,
      temperature: 0.4,
    });
    await addCostToLog(db, logId, grokUsage);

    reviewResult = parseClaudeJSON(reviewRaw) as Record<string, unknown>;
  } catch (err: unknown) {
    // Non-fatal — if Grok fails, we skip and continue
    skipReason = err instanceof Error ? err.message : "Grok unavailable";
  }

  // ── GROK REWRITE WIRING ──────────────────────────────────────────
  // When Grok flags major_issues, apply rewrite suggestions via Claude
  // before proceeding to QC. Makes independence review actually improve
  // the article rather than just scoring it.
  let revisedHtml = articleHtml;
  let revisionApplied = false;

  // Apply Grok's rewrite suggestions for both major AND minor issues.
  // Previously only major_issues triggered rewrites — which meant Grok's
  // feedback was stored but never acted on (and the old prompt always said "minor").
  const grokVerdict = reviewResult?.verdict as string;
  const grokScore = (reviewResult?.score as number) ?? 10;
  if (grokVerdict === "major_issues" || (grokVerdict === "minor_issues" && grokScore < 7)) {
    const flags = (reviewResult!.flags as Array<{ type: string; quote: string; rewrite: string; reason: string }>) || [];
    if (flags.length > 0) {
      try {
        const rewritePrompt = flags
          .map((f, i) => `${i + 1}. [${f.type}] Find: "${f.quote}" → Replace with: "${f.rewrite}" (Reason: ${f.reason})`)
          .join("\n");

        const { text: revisedRaw, usage: revisionUsage } = await generateWithFallback({
          system: `You are applying editorial corrections flagged by an independent reviewer. Apply each suggested rewrite where it genuinely improves the article's independence and honesty. Preserve the editorial voice and HTML structure. If a suggestion would weaken the article or is wrong, skip it. Return ONLY the corrected HTML — no JSON wrapper, no explanation.`,
          user: `## CORRECTIONS TO APPLY\n${rewritePrompt}\n\n## CURRENT ARTICLE HTML\n${articleHtml}`,
          models: WRITER_FALLBACK_CHAIN,
          maxTokens: 8192,
          temperature: 0.2,
          stage: "independence-revision",
        });
        await addCostToLog(db, logId, revisionUsage);

        // The response should be raw HTML
        const cleaned = revisedRaw.replace(/^```html?\n?/, "").replace(/\n?```$/, "").trim();
        if (cleaned.length > articleHtml.length * 0.5) {
          revisedHtml = cleaned;
          revisionApplied = true;

          // Update article in database with revised HTML
          const slug = (articleData.metadata as Record<string, unknown>)?.slug as string;
          if (slug) {
            await db.from("articles").update({ article_html: revisedHtml }).eq("slug", slug);
          }
        }
      } catch {
        // Non-fatal — if revision fails, proceed with original article
      }
    }
  }

  // Store review in research_data alongside existing data
  const { data: logEntry } = await db
    .from("daily_article_log")
    .select("research_data")
    .eq("id", logId)
    .single();

  const existingResearch = (logEntry?.research_data as Record<string, unknown>) || {};

  const grokScore = reviewResult ? ((reviewResult.score as number) || (reviewResult.independenceScore as number) || null) : null;

  // Await PubMed verification (was running in parallel with Grok)
  const pubmedResult = await pubmedPromise;

  // Update article data with revised HTML if rewrites were applied
  const updatedArticle = revisionApplied
    ? { ...existingResearch._article as Record<string, unknown>, html: revisedHtml }
    : existingResearch._article;

  await db
    .from("daily_article_log")
    .update({
      status: "independence_done",
      grok_score: grokScore,
      research_data: {
        ...existingResearch,
        _article: updatedArticle,
        _independenceReview: {
          ...(reviewResult || { skipped: true, reason: skipReason }),
          _revisionApplied: revisionApplied,
        },
        _pubmedVerification: pubmedResult,
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

## FULL ARTICLE HTML:
${(articleData.html as string) || ""}

## TABLE OF CONTENTS
${((articleData.toc as Array<{ title: string }>) || []).map((t) => `- ${t.title}`).join("\n")}
${independenceSection}
Make your final call. Publish, request revisions, or kill.`;

  // Fire illustration generation in parallel with QC (they're independent)
  // This saves 30-60s per article vs sequential
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const illustrationPromise = (supabaseUrl && action !== "dry-run")
    ? fetch(`${supabaseUrl}/functions/v1/generate-illustration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", slug }),
        signal: AbortSignal.timeout(60000),
      }).catch(() => null)
    : Promise.resolve(null);

  // Use Grok for QC — different model family reviewing Sonnet's work
  // prevents same-model self-review blindness. Falls back to Gemini → Sonnet if Grok unavailable.
  const { text: qcRaw, usage: qcUsage } = await generateWithFallback({
    system: SENIOR_EDITOR_QC_PROMPT + `\n\nCRITICAL: Return ONLY valid JSON. No markdown, no explanation — just the JSON object.`,
    user: qcPrompt,
    models: ["grok-3", "gemini-2.5-flash", "claude-sonnet-4-6"],
    maxTokens: 1500,
    temperature: 0.3,
    stage: "qc",
  });
  await addCostToLog(db, logId, qcUsage);

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
    .select("editor_score, grok_score, model_used")
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

  // Await illustration that was fired in parallel with QC
  let heroImage: string | undefined;
  let heroImageAlt: string | undefined;

  try {
    const illustrationRes = await illustrationPromise;
    if (illustrationRes && illustrationRes.ok) {
      const illustrationData = await illustrationRes.json();
      if (illustrationData.success && illustrationData.imageUrl) {
        heroImage = illustrationData.imageUrl;
        heroImageAlt = `Editorial illustration for ${finalTitle}`;
      }
    }
  } catch {
    // Non-fatal
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
      author: getByline(logScores?.model_used || "claude-sonnet-4-6"),
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
    const { data: logForReplace } = await db.from("daily_article_log").select("research_data").eq("id", logId).maybeSingle();
    const replacesSlug = ((logForReplace?.research_data as Record<string, unknown>)?._editorBrief as Record<string, unknown>)?.replacesSlug as string | null;
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

    // ------ ROTATE FEATURED — standalone, works even when crons are paused ------
    if (action === "rotate-featured") {
      const newFeatured = await rotateFeatured(db);
      return json({
        success: true,
        newFeatured,
        message: newFeatured
          ? `Featured rotated to: ${newFeatured}`
          : "No rotation needed (current featured is still fresh or no eligible articles)",
      });
    }

    // ------ STATUS ------
    if (action === "status") {
      // Housekeeping: clean up queue items whose topics have already been written
      const { data: publishedSlugs } = await db.from("articles").select("title").eq("status", "published");
      if (publishedSlugs && publishedSlugs.length > 0) {
        const publishedTitles = publishedSlugs.map((a: { title: string }) => a.title.toLowerCase());
        const { data: queuedItems } = await db.from("topic_queue").select("id, topic").eq("status", "queued");
        if (queuedItems) {
          for (const q of queuedItems as Array<{ id: string; topic: string }>) {
            const topicWords = q.topic.toLowerCase().split(/\s+/).filter(w => w.length > 4);
            const isWritten = publishedTitles.some(title => {
              const matchCount = topicWords.filter(w => title.includes(w)).length;
              return matchCount >= Math.ceil(topicWords.length * 0.5);
            });
            if (isWritten) {
              await db.from("topic_queue").update({ status: "completed" }).eq("id", q.id);
            }
          }
        }
      }

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

      // Calculate total spend across all logs
      const { data: costData } = await db
        .from("daily_article_log")
        .select("cost_usd");
      const totalCost = (costData || []).reduce((sum: number, row: { cost_usd: number | string | null }) =>
        sum + (parseFloat(String(row.cost_usd ?? "0")) || 0), 0);

      return json({ logs: data || [], articleCount, queue: queue || [], totalCost: Math.round(totalCost * 100) / 100 });
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

    // ------ BACKFILL COSTS — estimate costs for pre-tracking articles ------
    if (action === "backfill-costs") {
      // Estimated token counts per stage (based on pipeline prompts + typical responses)
      // Format: [inputTokens, outputTokens, model]
      const STAGE_ESTIMATES: Record<string, [number, number, string]> = {
        "scout-gemini":    [1200, 3000, "gemini-2.5-flash"],
        "scout-structure": [5000, 2500, "claude-sonnet-4-6"],
        "editor-brief":    [6000, 1800, "claude-sonnet-4-6"],
        "write":           [8000, 6500, "claude-sonnet-4-6"],
        "independence":    [5500, 1200, "grok-3"],
        "qc":              [4500, 1000, "claude-sonnet-4-6"],
      };

      // Which stages completed based on final status
      const STAGES_BY_STATUS: Record<string, string[]> = {
        "published":          ["scout-gemini", "scout-structure", "editor-brief", "write", "independence", "qc"],
        "publishing":         ["scout-gemini", "scout-structure", "editor-brief", "write", "independence", "qc"],
        "editor_qc":          ["scout-gemini", "scout-structure", "editor-brief", "write", "independence"],
        "independence_done":  ["scout-gemini", "scout-structure", "editor-brief", "write", "independence"],
        "independence_review":["scout-gemini", "scout-structure", "editor-brief", "write"],
        "written":            ["scout-gemini", "scout-structure", "editor-brief", "write"],
        "writing":            ["scout-gemini", "scout-structure", "editor-brief"],
        "editor_approved":    ["scout-gemini", "scout-structure", "editor-brief"],
        "editor_reviewing":   ["scout-gemini", "scout-structure"],
        "research_done":      ["scout-gemini", "scout-structure"],
        "searching":          ["scout-gemini"],
        "started":            [],
      };

      // For failed articles, estimate based on the error message to guess last completed stage
      function guessStagesForFailed(error: string | null, researchData: Record<string, unknown> | null): string[] {
        if (!researchData && !error) return ["scout-gemini"];
        if (researchData?._independenceReview) return ["scout-gemini", "scout-structure", "editor-brief", "write", "independence"];
        if (researchData?._article) return ["scout-gemini", "scout-structure", "editor-brief", "write"];
        if (researchData?._editorBrief) return ["scout-gemini", "scout-structure", "editor-brief"];
        if (researchData?.candidates || researchData?.topic) return ["scout-gemini", "scout-structure"];
        // API limit errors = at least one call was attempted
        if (error?.includes("Claude API") || error?.includes("SPENDING_LIMIT")) return ["scout-gemini"];
        return [];
      }

      const { data: allLogs } = await db
        .from("daily_article_log")
        .select("id, status, error, research_data, cost_usd, source")
        .or("cost_usd.is.null,cost_usd.eq.0");

      if (!allLogs || allLogs.length === 0) {
        return json({ message: "No logs need backfilling", updated: 0 });
      }

      let updated = 0;
      let totalEstimated = 0;

      for (const log of allLogs as Array<{ id: string; status: string; error: string | null; research_data: Record<string, unknown> | null; cost_usd: number | null; source: string | null }>) {
        let stages: string[];
        if (log.status === "failed") {
          stages = guessStagesForFailed(log.error, log.research_data);
        } else {
          stages = STAGES_BY_STATUS[log.status] || [];
        }

        // Queue-sourced articles skip gemini (directed research uses claude with web search instead)
        const fromQueue = log.source === "queue" || log.research_data?._fromQueue;
        if (fromQueue) {
          stages = stages.filter(s => s !== "scout-gemini").map(s =>
            s === "scout-structure" ? "editor-brief" : s // queue uses one claude call for research, roughly editor-brief cost
          );
          // Add the directed research call (claude with web search, ~= write cost)
          if (stages.length > 0) stages = ["write", ...stages.slice(1)];
        }

        let cost = 0;
        const usageEntries: ApiUsage[] = [];
        for (const stage of stages) {
          const est = STAGE_ESTIMATES[stage];
          if (!est) continue;
          const [input, output, m] = est;
          const stageCost = calcCost(m, input, output);
          cost += stageCost;
          usageEntries.push({ model: m, stage, inputTokens: input, outputTokens: output, costUsd: Math.round(stageCost * 10000) / 10000 });
        }

        if (cost > 0) {
          await db.from("daily_article_log").update({
            cost_usd: Math.round(cost * 10000) / 10000,
            token_usage: usageEntries,
          }).eq("id", log.id);
          updated++;
          totalEstimated += cost;
        }
      }

      return json({
        message: `Backfilled cost estimates for ${updated} log entries`,
        updated,
        totalEstimated: Math.round(totalEstimated * 100) / 100,
        note: "These are estimates based on typical token counts per stage. Actual costs may vary ±20%.",
      });
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

    // Multi-model rotation — cycles through Sonnet, Grok, Gemini based on hour
    // All models get the same prompts, same rules, same editorial standards
    const writerModels = pickWriterModel();

    // ==============================================================
    // JOB 1: SCOUT — multi-model topic discovery, adds to queue
    // 3 scouts/day (Gemini, Sonnet, Grok), each finds 20 topics
    // Runs isDuplicate on each before inserting into topic_queue
    // Triggered by: cron (3x/day) or action="scout"
    // Pass scoutModel: "gemini" | "sonnet" | "grok" (default: "gemini")
    // ==============================================================
    if (action === "scout") {
      const scoutModel = (body.scoutModel as string) || "gemini";
      const { titles, categoryCounts } = await getExistingArticles(db);

      // Get existing queue + articles for dedup
      const { data: existingArticles } = await db.from("articles").select("title, slug, keywords, tags, description, category").eq("status", "published");
      const { data: queuedItems } = await db.from("topic_queue").select("topic").in("status", ["queued", "assigned", "in_progress"]);

      // Build dedup fingerprints (same logic as editor stage)
      const STOP_WORDS_SCOUT = new Set([
        "that", "this", "with", "from", "have", "been", "your", "what", "when", "just",
        "more", "most", "than", "also", "about", "into", "does", "will", "could", "would",
        "should", "every", "their", "these", "those", "some", "other", "only", "first",
        "health", "study", "research", "evidence", "science", "brain", "body", "human",
        "people", "patients", "treatment", "medical", "clinical", "risk", "effect",
        "effects", "years", "shows", "found", "actually", "problem", "really", "new",
      ]);
      function scoutExtract(text: string): Set<string> {
        return new Set(text.toLowerCase().split(/[\s\-:,—–.'"?!()]+/).filter(w => w.length > 3 && !STOP_WORDS_SCOUT.has(w)));
      }
      const fingerprints: Set<string>[] = [];
      for (const a of (existingArticles || []) as Array<{ title: string; slug: string; keywords: string[] | null; tags: string[] | null; description: string | null }>) {
        fingerprints.push(scoutExtract([a.title, (a.slug || "").replace(/-/g, " "), ...(a.keywords || []), ...(a.tags || []), a.description || ""].join(" ")));
      }
      for (const q of (queuedItems || []) as Array<{ topic: string }>) {
        fingerprints.push(scoutExtract(q.topic));
      }
      function isScoutDupe(topic: string): boolean {
        const words = scoutExtract(topic);
        if (words.size === 0) return false;
        for (const fp of fingerprints) {
          if (fp.size === 0) continue;
          const overlap = [...words].filter(w => fp.has(w)).length;
          const reverse = [...fp].filter(w => words.has(w)).length;
          if (Math.max(overlap / words.size, reverse / fp.size) >= 0.30 && overlap >= 2) return true;
        }
        return false;
      }

      const underserved = Object.entries(categoryCounts).filter(([, c]) => (c as number) / (titles.length || 1) < 0.08).map(([cat]) => cat);
      const missing = VALID_CATEGORIES.filter(c => !categoryCounts[c]);
      const priorityCats = [...underserved, ...missing];

      const scoutPrompt = `Find 20 compelling, evidence-based health stories. Mix of recent (last 30 days) and landmark (last 5 years). Every topic must be backed by real studies — no celebrity health, no supplement hype.

PRIORITY CATEGORIES (need more articles): ${priorityCats.join(", ") || "all balanced"}

ALREADY COVERED (${titles.length} articles — avoid these subjects):
${titles.map(t => `- ${t.split(" (")[0]}`).join("\n")}

For each topic return: a one-line topic description, suggested category, and why it matters. Number them 1-20. Plain text, no JSON.`;

      let rawFindings: string;
      let scoutCost: ApiUsage;

      if (scoutModel === "gemini") {
        const r = await gemini({ system: "You are a health science researcher with access to Google Search. Find the most compelling stories. Prioritize recent meta-analyses, large cohort studies, and findings that challenge conventional wisdom.", user: scoutPrompt, maxTokens: 4000, temperature: 0.5 }, "scout-gemini");
        rawFindings = r.text; scoutCost = r.usage;
      } else if (scoutModel === "grok") {
        const r = await grok({ system: "You are a health science researcher. Find stories the mainstream misses — contrarian findings, underfunded research, industry-inconvenient data. Prioritize independence and surprise.", user: scoutPrompt, maxTokens: 4000, temperature: 0.5 }, "scout-grok");
        rawFindings = r.text; scoutCost = r.usage;
      } else {
        // Sonnet scout with web search — fall back to Gemini if Claude spending limit hit
        try {
          const r = await claude({ system: "You are a health science researcher. Find stories with strong evidence and editorial potential. Look for mechanism discoveries, policy failures, and emerging fields.", user: scoutPrompt, model: "claude-sonnet-4-6", maxTokens: 4000, temperature: 0.5, webSearch: true, maxSearches: 8 }, "scout-sonnet");
          rawFindings = r.text; scoutCost = r.usage;
        } catch (scoutErr: unknown) {
          const errMsg = scoutErr instanceof Error ? scoutErr.message : "";
          if (errMsg.includes("SPENDING_LIMIT") || errMsg.includes("usage limits") || errMsg.includes("rate_limit")) {
            console.log("[Scout fallback] Claude spending limit, falling back to Gemini for Sonnet scout...");
            const r = await gemini({ system: "You are a health science researcher. Find stories with strong evidence and editorial potential. Look for mechanism discoveries, policy failures, and emerging fields.", user: scoutPrompt, maxTokens: 4000, temperature: 0.5 }, "scout-sonnet-fallback");
            rawFindings = r.text; scoutCost = r.usage;
          } else {
            throw scoutErr;
          }
        }
      }

      // Parse raw findings directly — no expensive Sonnet structuring step.
      // The editor brief stage (during produce) handles editorial scoring.
      // Simple extraction: split by numbered lines, clean up.
      const topics: Array<{ topic: string; category: string; why: string }> = [];
      const lines = rawFindings.split("\n").filter(l => l.trim());
      let current: { topic: string; category: string; why: string } | null = null;

      for (const line of lines) {
        const numbered = line.match(/^\d+[\.\)]\s*(.+)/);
        if (numbered) {
          if (current) topics.push(current);
          // Strip Grok markdown formatting: **bold**, *italic*, "Topic Description:" prefix
          const text = numbered[1].trim()
            .replace(/\*\*/g, "")
            .replace(/^\s*Topic\s*Description\s*:?\s*/i, "")
            .replace(/^\s*[-–—]\s*/, "")
            .trim();
          // Try to extract category from the line
          const catMatch = VALID_CATEGORIES.find(c => text.toLowerCase().includes(c.toLowerCase()));
          current = { topic: text, category: catMatch || "", why: "" };
        } else if (current && !current.why && line.trim().length > 20) {
          current.why = line.trim().replace(/\*\*/g, "").slice(0, 200);
        }
      }
      if (current) topics.push(current);

      // Dedup and insert into queue
      let added = 0;
      let dupes = 0;
      for (const t of topics) {
        if (isScoutDupe(t.topic)) { dupes++; continue; }
        // Validate category
        const cat = VALID_CATEGORIES.find(c => (t.category || "").toLowerCase().includes(c.toLowerCase())) || null;
        await db.from("topic_queue").insert({
          topic: t.topic,
          category: cat,
          notes: `${scoutModel} scout: ${t.why || ""}. Treatment: ${t.suggestedTreatment || "TBD"}`,
          priority: 50,
          source: "trending",
          research_summary: t.why || null,
        });
        // Add to fingerprints so subsequent topics in same batch don't dupe each other
        fingerprints.push(scoutExtract(t.topic));
        added++;
      }

      const { count: queueCount } = await db.from("topic_queue").select("*", { count: "exact", head: true }).eq("status", "queued");

      return json({
        success: true,
        stage: "scout",
        scoutModel,
        found: topics.length,
        added,
        duplicatesFiltered: dupes,
        queueSize: queueCount || 0,
        cost: scoutCost.costUsd,
        message: `${scoutModel} scout: found ${topics.length}, added ${added} to queue (${dupes} dupes filtered). Queue: ${queueCount || 0} topics.`,
      });
    }

    // ==============================================================
    // JOB 2: PRODUCE — editor picks from queue, self-chains to publish
    // Triggered by: cron (every 5 min), action="produce", or action="run"
    // ==============================================================
    if (action === "run" || action === "produce") {
      // Guard: block if another production stage is actively running
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
          return safeStage(db, e.id, "Write", () => stageWrite(db, e.id, e.research_data, writerModels));
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
        .select("id, topic, notes, category, source")
        .eq("status", "queued")
        .order("expedite", { ascending: false })
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1);

      if (!topTopic || topTopic.length === 0) {
        return json({ skipped: true, message: "Queue empty. Run 'scout' to discover topics." });
      }

      const topic = topTopic[0] as { id: string; topic: string; notes: string | null; category: string | null; source: string | null };
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
        stageResearch(db, logEntry.id, topic.topic, topic.source));
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
