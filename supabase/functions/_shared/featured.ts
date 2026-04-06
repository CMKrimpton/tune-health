import { supabase } from "./db.ts";

export async function rotateFeatured(db: ReturnType<typeof supabase>): Promise<string | null> {
  // Freshness guard: prevent rapid re-rotation (e.g. manual triggers in quick succession).
  // Uses 5h window — shorter than the 6h cron interval so every scheduled run can rotate.
  // NOTE: updated_at drifts when pipeline/QC/illustration touches the article row,
  // so this is a conservative guard, not exact. The -50 penalty on the current featured
  // article in the scoring algorithm is the primary mechanism preventing re-selection.
  const { data: currentFeaturedCheck } = await db
    .from("articles")
    .select("slug, updated_at")
    .eq("featured", true)
    .eq("status", "published")
    .maybeSingle();

  if (currentFeaturedCheck?.updated_at) {
    const featuredSince = Date.now() - new Date(currentFeaturedCheck.updated_at).getTime();
    const hoursAgo = Math.round(featuredSince / (1000 * 60 * 60) * 10) / 10;
    if (featuredSince < 5 * 60 * 60 * 1000) {
      console.log(`[Featured] Skipping rotation — current featured updated ${hoursAgo}h ago (< 5h guard)`);
      return null;
    }
    console.log(`[Featured] Guard passed — current featured updated ${hoursAgo}h ago, proceeding with rotation`);
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
  const top3 = scored.slice(0, 3);
  console.log(`[Featured] Top 3 candidates: ${top3.map((s: { slug: unknown; score: number }) => `${s.slug} (${Math.round(s.score)})`).join(", ")}`);

  if (!winner || winner.score < 30 || (currentFeatured && winner.slug === currentFeatured.slug)) {
    console.log(`[Featured] No rotation: winner=${winner?.slug || "none"}, score=${winner?.score || 0}, same=${currentFeatured && winner?.slug === currentFeatured.slug}`);
    return null;
  }

  // Update database
  await db.from("articles").update({ featured: false }).eq("featured", true);
  await db.from("articles").update({ featured: true }).eq("slug", winner.slug);
  console.log(`[Featured] DB: Rotated to ${winner.slug} (score: ${Math.round(winner.score)})`);

  return winner.slug;
}
