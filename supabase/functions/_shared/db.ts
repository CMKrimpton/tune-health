import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PRICING, MODELS } from "./constants.ts";
import type { ApiUsage } from "./types.ts";

export function supabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Safely parse AI score output like "8/10", "8", 8, "7.5/10" → integer or null */
export function parseScore(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Math.round(raw);
  const str = String(raw).trim();
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

export function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] || PRICING[MODELS.DEFAULT_CLAUDE];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export async function addCostToLog(
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

/**
 * Log costs for non-article operations (scout, pinger, topic-merge, etc.)
 * Uses a daily system row in daily_article_log with slug "_system_overhead".
 * Creates the row if it doesn't exist for today, otherwise increments.
 */
export async function addOverheadCost(
  db: ReturnType<typeof supabase>,
  usage: ApiUsage,
) {
  const today = new Date().toISOString().slice(0, 10);
  const systemTopic = `System overhead (${today})`;

  // Find or create today's overhead row
  const { data: existing } = await db
    .from("daily_article_log")
    .select("id, cost_usd, token_usage")
    .eq("slug", "_system_overhead")
    .eq("run_date", today)
    .maybeSingle();

  if (existing) {
    const currentCost = parseFloat(existing.cost_usd ?? "0") || 0;
    const currentUsage = (existing.token_usage as ApiUsage[]) || [];
    await db.from("daily_article_log").update({
      cost_usd: Math.round((currentCost + usage.costUsd) * 10000) / 10000,
      token_usage: [...currentUsage, usage],
    }).eq("id", existing.id);
  } else {
    await db.from("daily_article_log").insert({
      run_date: today,
      slug: "_system_overhead",
      topic: systemTopic,
      status: "system",
      source: "system",
      cost_usd: Math.round(usage.costUsd * 10000) / 10000,
      token_usage: [usage],
      stage_started_at: new Date().toISOString(),
    });
  }
}

export async function getExistingArticles(
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

/** Fire-and-forget dispatch via pg_net (survives edge function termination).
 *  Uses SQL function chain_dispatch() which calls pg_net.http_post() —
 *  the HTTP request persists at the database level even after the calling
 *  edge function's connection closes. JS fetch() gets killed. */
export async function dispatchStage(functionName: string, logId: string): Promise<void> {
  const db = supabase();
  const { error } = await db.rpc("chain_dispatch", {
    p_function_name: functionName,
    p_log_id: logId,
  });
  if (error) {
    console.error(`[dispatchStage] Failed to dispatch ${functionName} for ${logId}: ${error.message}`);
  }
}

export async function safeStage(
  db: ReturnType<typeof supabase>,
  logId: string,
  stageName: string,
  fn: () => Promise<unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
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
    await db.from("daily_article_log").update({
      status: "failed",
      error: `${stageName}: ${msg}`,
      completed_at: new Date().toISOString(),
    }).eq("id", logId);
    return { ok: false, error: msg };
  }
}
