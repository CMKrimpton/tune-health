import { supabase } from "./db.ts";

export async function rotateFeatured(db: ReturnType<typeof supabase>): Promise<string | null> {
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
