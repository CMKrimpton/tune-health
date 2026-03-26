import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PRICING } from "./constants.ts";
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
  const p = PRICING[model] || PRICING["claude-sonnet-4-6"];
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
