import { supabase } from "./db.ts";

/** UTF-8-safe base64 encoding. The standard btoa(unescape(encodeURIComponent()))
 *  pattern double-encodes non-ASCII chars in Deno, producing mojibake. */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Update the `featured` flag in a GitHub JSON file for an article.
 * Returns true on success, false on failure (non-fatal — DB is source of truth).
 */
async function updateGitHubFeatured(slug: string, featured: boolean): Promise<boolean> {
  const githubToken = (Deno.env.get("GITHUB_TOKEN") || "").trim();
  const githubRepo = (Deno.env.get("GITHUB_REPO") || "").trim();
  if (!githubToken || !githubRepo) {
    console.warn("[Featured] GITHUB_TOKEN or GITHUB_REPO not set — skipping GitHub update");
    return false;
  }

  const jsonPath = `src/content/articles/${slug}.json`;
  const apiBase = `https://api.github.com/repos/${githubRepo}`;
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  try {
    const fileRes = await fetch(`${apiBase}/contents/${jsonPath}?ref=main`, { headers });
    if (!fileRes.ok) {
      console.warn(`[Featured] GitHub file not found for ${slug}: ${fileRes.status}`);
      return false;
    }
    const fileData = await fileRes.json();
    const existingContent = JSON.parse(atob(fileData.content.replace(/\n/g, "")));
    existingContent.featured = featured;
    const updatedContent = utf8ToBase64(JSON.stringify(existingContent, null, 2) + "\n");

    const updateRes = await fetch(`${apiBase}/contents/${jsonPath}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `chore: ${featured ? "Feature" : "Unfeature"} article — '${slug}'`,
        content: updatedContent,
        sha: fileData.sha,
        branch: "main",
      }),
    });

    if (updateRes.ok) {
      console.log(`[Featured] GitHub: set featured=${featured} for ${slug}`);
      return true;
    }
    console.warn(`[Featured] GitHub update failed for ${slug}: ${updateRes.status}`);
    return false;
  } catch (err) {
    console.warn(`[Featured] GitHub update error for ${slug}: ${err instanceof Error ? err.message : "unknown"}`);
    return false;
  }
}

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

  // Update GitHub JSON files so Astro build reflects the rotation.
  // Unfeature ALL currently-featured articles in GitHub (there may be stale ones),
  // then feature the winner.
  const allFeaturedSlugs = articles
    .filter((a: Record<string, unknown>) => a.featured && a.slug !== winner.slug)
    .map((a: Record<string, unknown>) => a.slug as string);

  // Also unfeature the specific current featured from DB (may not be in the `articles` list if it was already unfeatured)
  if (currentFeatured && !allFeaturedSlugs.includes(currentFeatured.slug as string)) {
    allFeaturedSlugs.push(currentFeatured.slug as string);
  }

  // Unfeature old articles on GitHub (sequentially to avoid ref conflicts)
  for (const oldSlug of allFeaturedSlugs) {
    await updateGitHubFeatured(oldSlug, false);
  }

  // Feature the winner on GitHub
  const githubUpdated = await updateGitHubFeatured(winner.slug as string, true);

  // Trigger Vercel rebuild if any GitHub update succeeded
  if (githubUpdated) {
    const deployHook = Deno.env.get("VERCEL_DEPLOY_HOOK");
    if (deployHook) {
      fetch(deployHook, { method: "POST" }).catch(err =>
        console.warn(`[Featured] Vercel deploy hook failed: ${err instanceof Error ? err.message : "unknown"}`)
      );
      console.log("[Featured] Vercel rebuild triggered");
    }
  }

  return winner.slug;
}
