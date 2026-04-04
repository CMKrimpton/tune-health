import { API_TIMEOUT, MODEL_PROVIDERS, MODELS } from "./constants.ts";
import { calcCost } from "./db.ts";
import type { ApiResult, ApiUsage, ClaudeOptions } from "./types.ts";

export async function claude(opts: ClaudeOptions, stage = "unknown"): Promise<ApiResult> {
  const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  const {
    system,
    user,
    model = MODELS.DEFAULT_CLAUDE,
    maxTokens = 4096,
    temperature = 0.35,
    webSearch = false,
    maxSearches = 5,
    timeout,
  } = opts;
  const timeoutMs = timeout || API_TIMEOUT;

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
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    // Surface spending limit errors clearly so pipeline can bail early
    // Anthropic returns 400 or 429 for spending/rate limits
    if (errText.includes("usage limits") || errText.includes("rate_limit") || errText.includes("spending") || res.status === 429) {
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

export function parseClaudeJSON(text: string): unknown {
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
  // WARNING: This means the model's output was truncated (likely hit token limit).
  // Fields at the end of the JSON may contain garbage/partial data.
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
  const needsRepair = inString || openBrackets > 0 || openBraces > 0;
  if (needsRepair) {
    console.warn(`[parseClaudeJSON] ⚠️ TRUNCATED OUTPUT — repairing ${openBraces} unclosed braces, ${openBrackets} unclosed brackets, inString=${inString}. Fields near the end of the JSON may be corrupt.`);
  }
  // Close any trailing string, then close brackets/braces
  if (inString) candidate += '"';
  for (let i = 0; i < openBrackets; i++) candidate += "]";
  for (let i = 0; i < openBraces; i++) candidate += "}";
  try { return JSON.parse(candidate); } catch { /* continue */ }

  throw new Error("Failed to parse response as JSON (tried 3 strategies)");
}

export async function openai(opts: { system: string; user: string; model?: string; maxTokens?: number; temperature?: number; timeout?: number }, stage = "unknown"): Promise<ApiResult> {
  const key = (Deno.env.get("OPENAI_API_KEY") || "").trim();
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const model = opts.model || MODELS.DEFAULT_OPENAI;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
      max_completion_tokens: opts.maxTokens || 4000,
      temperature: opts.temperature || 0.4,
    }),
    signal: AbortSignal.timeout(opts.timeout || API_TIMEOUT),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 429 || errText.includes("rate_limit") || errText.includes("quota")) {
      throw new Error(`SPENDING_LIMIT: OpenAI rate/quota limit. ${errText.slice(0, 200)}`);
    }
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 500)}`);
  }
  const d = await res.json();
  const text = d.choices?.[0]?.message?.content || "";
  const finishReason = d.choices?.[0]?.finish_reason || "unknown";
  if (finishReason === "length") {
    console.log(`[OpenAI] WARNING: Response truncated (finish_reason=length) for stage ${stage}. max_completion_tokens=${opts.maxTokens || 4000} was not enough.`);
  }
  const u = d.usage || {};
  const inputTokens = u.prompt_tokens || 0;
  const outputTokens = u.completion_tokens || 0;
  return {
    text,
    usage: { model, stage, inputTokens, outputTokens, costUsd: calcCost(model, inputTokens, outputTokens) },
  };
}

export async function grok(opts: { system: string; user: string; maxTokens?: number; temperature?: number; timeout?: number }, stage = "independence"): Promise<ApiResult> {
  const key = (Deno.env.get("XAI_API_KEY") || "").trim();
  if (!key) throw new Error("XAI_API_KEY not set");
  const model = MODELS.INDEPENDENCE;
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
      max_tokens: opts.maxTokens || 2000,
      temperature: opts.temperature || 0.4,
    }),
    signal: AbortSignal.timeout(opts.timeout || API_TIMEOUT),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Grok ${res.status}: ${errText.slice(0, 500)}`);
  }
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

export async function gemini(opts: { system: string; user: string; model?: string; maxTokens?: number; temperature?: number; webSearch?: boolean; timeout?: number }, stage = "research"): Promise<ApiResult> {
  const key = (Deno.env.get("GOOGLE_API_KEY") || "").trim();
  if (!key) throw new Error("GOOGLE_API_KEY not set");
  const model = opts.model || MODELS.DEFAULT_GEMINI;
  const useSearch = opts.webSearch !== false; // default true, explicitly disable with false
  const requestBody: Record<string, unknown> = {
    system_instruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      maxOutputTokens: opts.maxTokens || 4000,
      temperature: opts.temperature || 0.4,
    },
  };
  if (useSearch) {
    requestBody.tools = [{ google_search: {} }];
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(opts.timeout || API_TIMEOUT),
    },
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 500)}`);
  }
  let data = await res.json();
  let parts = data.candidates?.[0]?.content?.parts || [];
  let text = parts.map((p: { text?: string }) => p.text || "").join("");

  // Track tokens from first attempt (even if empty — we still paid for the input)
  const firstUm = data.usageMetadata || {};
  let totalInputTokens = firstUm.promptTokenCount || 0;
  let totalOutputTokens = firstUm.candidatesTokenCount || 0;

  // Retry once if empty (Gemini sometimes returns empty on first try with search grounding)
  if (!text.trim()) {
    console.log(`[Gemini] Empty response on first try for ${stage}, retrying...`);
    const retryBody = { ...requestBody };
    const retry = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryBody),
        signal: AbortSignal.timeout(opts.timeout || API_TIMEOUT),
      },
    );
    if (retry.ok) {
      data = await retry.json();
      parts = data.candidates?.[0]?.content?.parts || [];
      text = parts.map((p: { text?: string }) => p.text || "").join("");
      // Accumulate retry tokens — both attempts cost money
      const retryUm = data.usageMetadata || {};
      totalInputTokens += retryUm.promptTokenCount || 0;
      totalOutputTokens += retryUm.candidatesTokenCount || 0;
    }
  }

  if (!text.trim()) throw new Error("Empty Gemini response (after retry)");
  return {
    text,
    usage: { model, stage, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: calcCost(model, totalInputTokens, totalOutputTokens) },
  };
}

export async function generate(opts: { system: string; user: string; model: string; maxTokens?: number; temperature?: number; stage?: string; webSearch?: boolean; timeout?: number }): Promise<ApiResult> {
  const provider = MODEL_PROVIDERS[opts.model];
  if (provider === "anthropic") {
    return claude({ system: opts.system, user: opts.user, model: opts.model, maxTokens: opts.maxTokens, temperature: opts.temperature, timeout: opts.timeout }, opts.stage || "unknown");
  } else if (provider === "openai") {
    return openai({ system: opts.system, user: opts.user, model: opts.model, maxTokens: opts.maxTokens, temperature: opts.temperature, timeout: opts.timeout }, opts.stage || "unknown");
  } else if (provider === "xai") {
    return grok({ system: opts.system, user: opts.user, maxTokens: opts.maxTokens, temperature: opts.temperature, timeout: opts.timeout }, opts.stage || "unknown");
  } else if (provider === "google") {
    return gemini({ system: opts.system, user: opts.user, model: opts.model, maxTokens: opts.maxTokens, temperature: opts.temperature, webSearch: opts.webSearch, timeout: opts.timeout }, opts.stage || "unknown");
  }
  throw new Error(`Unknown model: ${opts.model}`);
}

// Try models in order, falling back on failure (especially spending limits)
export async function generateWithFallback(opts: { system: string; user: string; models: string[]; maxTokens?: number; temperature?: number; stage?: string; webSearch?: boolean; timeout?: number }): Promise<ApiResult & { modelUsed: string }> {
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
