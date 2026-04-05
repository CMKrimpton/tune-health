/**
 * Editorial Analytics — Self-Learning Feedback System
 *
 * Queries the get_editorial_digest() SQL function (one round-trip) and formats
 * the results into prompt-injectable text blocks for each pipeline stage.
 * Zero AI cost — pure SQL aggregation from materialized views refreshed daily.
 */

import { supabase } from "./db.ts";

// ── Types ──────────────────────────────────────────────────────────────────

interface TopArticle {
  slug: string;
  title: string;
  category: string;
  editor_score: number | null;
  independence_score: number | null;
  social_engagement: number;
  composite_score: number;
}

interface CategoryPerf {
  category: string;
  article_count: number;
  avg_editor_score: number | null;
  avg_grok_score: number | null;
  avg_revisions: number | null;
  kill_rate_pct: number;
  voice_rewrite_rate_pct: number;
  avg_cost_usd: number;
}

interface ScoutPerf {
  desk: string;
  topics_suggested: number;
  topics_published: number;
  topics_skipped: number;
  publish_rate_pct: number;
  avg_editor_score: number | null;
  avg_grok_score: number | null;
}

interface SocialPerf {
  platform: string;
  persona: string;
  post_count: number;
  avg_engagement: number;
  max_engagement: number;
  best_hook_type: string | null;
}

interface VoiceFailure {
  phrase: string;
  occurrences: number;
}

interface PingerAccuracy {
  source: string;
  signals_total: number;
  signals_promoted: number;
  articles_published: number;
  avg_editor_score: number | null;
}

interface EditorialDigest {
  top_articles: TopArticle[];
  category_performance: CategoryPerf[];
  scout_performance: ScoutPerf[];
  social_performance: SocialPerf[];
  voice_failures: VoiceFailure[];
  pinger_accuracy: PingerAccuracy[];
  generated_at: string;
}

// ── Cache (in-memory, per edge function invocation) ─────────────────────

let cachedDigest: EditorialDigest | null = null;

async function getDigest(db: ReturnType<typeof supabase>): Promise<EditorialDigest> {
  if (cachedDigest) return cachedDigest;

  const { data, error } = await db.rpc("get_editorial_digest");
  if (error) {
    console.warn(`[Analytics] get_editorial_digest() failed: ${error.message}. Using empty digest.`);
    return {
      top_articles: [], category_performance: [], scout_performance: [],
      social_performance: [], voice_failures: [], pinger_accuracy: [],
      generated_at: new Date().toISOString(),
    };
  }

  cachedDigest = data as EditorialDigest;
  return cachedDigest;
}

// ── Exported formatters ─────────────────────────────────────────────────

/**
 * Scout context: top performing articles + per-desk stats + coverage gaps.
 * Injected into pipeline-scout prompts after sharedExclusions.
 */
export async function getScoutContext(db: ReturnType<typeof supabase>): Promise<string> {
  const d = await getDigest(db);
  if (d.top_articles.length === 0 && d.scout_performance.length === 0) return "";

  const lines: string[] = ["\n## EDITORIAL PERFORMANCE FEEDBACK"];

  if (d.top_articles.length > 0) {
    lines.push("Our top-performing articles (find MORE topics like these):");
    for (const a of d.top_articles.slice(0, 8)) {
      lines.push(`- "${a.title}" (${a.category}, editor: ${a.editor_score ?? "?"}, independence: ${a.independence_score ?? "?"}, social: ${Math.round(a.social_engagement)})`);
    }
  }

  if (d.scout_performance.length > 0) {
    lines.push("\nScout desk performance (last 90 days):");
    for (const s of d.scout_performance) {
      if (s.desk === "unknown") continue;
      lines.push(`- ${s.desk}: ${s.topics_suggested} suggested → ${s.topics_published} published (${s.publish_rate_pct}%), avg editor: ${s.avg_editor_score ?? "?"}, avg independence: ${s.avg_grok_score ?? "?"}`);
    }
  }

  if (d.category_performance.length > 0) {
    const underperforming = d.category_performance.filter(c => (c.avg_editor_score ?? 10) < 6);
    if (underperforming.length > 0) {
      lines.push(`\nCategories with low quality scores (need stronger topics): ${underperforming.map(c => `${c.category} (avg ${c.avg_editor_score})`).join(", ")}`);
    }
  }

  lines.push("\nUse this data to find topics that match our highest-performing patterns.");
  return lines.join("\n");
}

/**
 * QC context: category baselines + voice failures for calibration.
 * Injected into stage-qc prompt after independence section.
 */
export async function getQCContext(db: ReturnType<typeof supabase>, category: string): Promise<string> {
  const d = await getDigest(db);
  if (d.category_performance.length === 0) return "";

  const lines: string[] = ["\n## HISTORICAL QUALITY CONTEXT (calibrate your score against these baselines)"];

  const catPerf = d.category_performance.find(c => c.category === category);
  if (catPerf) {
    lines.push(`This article's category (${category}): avg editor score ${catPerf.avg_editor_score ?? "?"}, avg independence ${catPerf.avg_grok_score ?? "?"}, kill rate ${catPerf.kill_rate_pct}%, voice rewrite rate ${catPerf.voice_rewrite_rate_pct}%, avg revisions ${catPerf.avg_revisions ?? "?"}`);
  }

  // Show 3 comparison categories
  const others = d.category_performance.filter(c => c.category !== category).slice(0, 3);
  if (others.length > 0) {
    lines.push("Comparison categories:");
    for (const c of others) {
      lines.push(`- ${c.category}: avg editor ${c.avg_editor_score ?? "?"}, kill rate ${c.kill_rate_pct}%`);
    }
  }

  if (d.voice_failures.length > 0) {
    lines.push(`\nMost common voice failures in recent articles: ${d.voice_failures.slice(0, 5).map(v => `"${v.phrase}" (${v.occurrences}x)`).join(", ")}`);
  }

  lines.push("\nA score of 7 should mean this article is average for its category. Calibrate accordingly.");
  return lines.join("\n");
}

/**
 * Independence context: category-specific bias patterns + avg grok score.
 * Injected into stage-independence prompt after category focus section.
 */
export async function getIndependenceContext(db: ReturnType<typeof supabase>, category: string): Promise<string> {
  const d = await getDigest(db);

  const catPerf = d.category_performance.find(c => c.category === category);
  if (!catPerf) return "";

  const lines: string[] = ["\n## CATEGORY BIAS PATTERNS (from past reviews)"];
  lines.push(`${category} articles in the last 90 days: avg independence score ${catPerf.avg_grok_score ?? "?"}, avg editor score ${catPerf.avg_editor_score ?? "?"}, ${catPerf.article_count} articles reviewed.`);

  if ((catPerf.avg_grok_score ?? 10) < 6.5) {
    lines.push(`NOTE: This category has a below-average independence score. Common issues in ${category} may include institutional deference or one-sided funding disclosure. Look extra carefully.`);
  } else if ((catPerf.avg_grok_score ?? 0) >= 8) {
    lines.push(`This category typically scores well on independence. Focus on finding NEW patterns rather than rehashing common flags.`);
  }

  lines.push("Watch for patterns you haven't flagged before — avoid repetitive feedback on the same issues.");
  return lines.join("\n");
}

/**
 * Social context: engagement intelligence for content briefs.
 * Injected into social-engine prompt after arc context.
 */
export async function getSocialContext(db: ReturnType<typeof supabase>): Promise<string> {
  const d = await getDigest(db);
  if (d.social_performance.length === 0) return "";

  const lines: string[] = ["\n## ENGAGEMENT INTELLIGENCE (from past 60 days)"];

  // Top performing combos
  const sorted = [...d.social_performance].sort((a, b) => (b.avg_engagement ?? 0) - (a.avg_engagement ?? 0));
  lines.push("Top performing platform/persona combos:");
  for (const s of sorted.slice(0, 5)) {
    lines.push(`- ${s.platform}/${s.persona}: avg engagement ${s.avg_engagement}, best hook: ${s.best_hook_type || "varies"} (${s.post_count} posts)`);
  }

  // Worst performing (to avoid)
  const worst = sorted.filter(s => s.post_count >= 3).slice(-2);
  if (worst.length > 0) {
    lines.push(`\nLow-engagement combos (consider skipping): ${worst.map(s => `${s.platform}/${s.persona} (avg ${s.avg_engagement})`).join(", ")}`);
  }

  // Fetch top templates if available
  const { data: templates } = await db
    .from("social_templates")
    .select("platform, persona, template_text, avg_engagement")
    .eq("source", "learned")
    .order("avg_engagement", { ascending: false })
    .limit(3);

  if (templates && templates.length > 0) {
    lines.push("\nHigh-engagement post templates (use as structural inspiration):");
    for (const t of templates) {
      lines.push(`- [${t.platform}/${t.persona}, score ${t.avg_engagement}]: "${t.template_text.slice(0, 150)}${t.template_text.length > 150 ? "..." : ""}"`);
    }
  }

  lines.push("\nPREFER high-engagement patterns. Avoid low-engagement combos.");
  return lines.join("\n");
}

/**
 * Social writer context: proven templates for this specific platform/persona.
 * Injected into social-writer system prompt after platform rules.
 */
export async function getWriterTemplates(
  db: ReturnType<typeof supabase>,
  platform: string,
  persona: string,
): Promise<string> {
  const { data: templates } = await db
    .from("social_templates")
    .select("template_text, avg_engagement")
    .eq("platform", platform)
    .eq("persona", persona)
    .eq("source", "learned")
    .order("avg_engagement", { ascending: false })
    .limit(3);

  if (!templates || templates.length === 0) return "";

  const lines: string[] = ["\nPROVEN TEMPLATES (high-engagement examples — use as structural inspiration, don't copy):"];
  for (const t of templates) {
    lines.push(`- [score ${t.avg_engagement}]: "${t.template_text.slice(0, 200)}${t.template_text.length > 200 ? "..." : ""}"`);
  }
  return lines.join("\n");
}

/**
 * Pinger context: source accuracy rates.
 * Injected into pipeline-pinger system prompts.
 */
export async function getPingerContext(db: ReturnType<typeof supabase>): Promise<string> {
  const d = await getDigest(db);
  if (d.pinger_accuracy.length === 0) return "";

  const lines: string[] = ["\nSignal accuracy (last 90 days):"];
  for (const p of d.pinger_accuracy) {
    const publishRate = p.signals_promoted > 0
      ? Math.round(p.articles_published / p.signals_promoted * 100)
      : 0;
    lines.push(`- ${p.source}: ${p.signals_promoted} promoted → ${p.articles_published} published (${publishRate}% conversion)${p.avg_editor_score ? `, avg editor score ${p.avg_editor_score}` : ""}`);
  }
  return lines.join("\n");
}
