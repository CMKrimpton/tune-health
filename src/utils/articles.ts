/**
 * Article utilities — queries Supabase for all article data.
 * Uses a per-request cache so getArticles() only hits the DB once
 * even when called by 10+ components on the same page render.
 */

import { supabase } from '../lib/supabase';

// Render-scoped cache: collapses 10-15 duplicate getArticles() calls into one
// DB query per SSR render. The 2s TTL is intentionally short — it only needs to
// survive a single render (~100-500ms). In warm Vercel functions, module vars
// persist across requests, so 2s ensures we never serve cross-request stale data
// for more than a blink. The CDN s-maxage header handles real caching.
let _cachedArticles: Article[] | null = null;
let _cachedComingSoon: Article[] | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL = 2_000; // 2 seconds — one SSR render, never cross-request

function isCacheValid(): boolean {
  return Date.now() - _cacheTimestamp < CACHE_TTL;
}

function setCacheArticles(articles: Article[], comingSoon?: Article[]) {
  _cachedArticles = articles;
  if (comingSoon !== undefined) _cachedComingSoon = comingSoon;
  _cacheTimestamp = Date.now();
}

export interface Article {
  slug: string;
  title: string;
  description: string;
  category: string;
  publishDate: string;
  updatedDate?: string;
  readTime: number;
  tags: string[];
  keywords: string[];
  gradient: { from: string; to: string };
  featured: boolean;
  heroImage?: string;
  heroImageLight?: string;
  heroImageAlt?: string;
  narrationUrl?: string;
  comingSoon: boolean;
  href: string;
  sortOrder?: number;
  series?: string;
  seriesOrder?: number;
  author: { name: string; role: string };
}

/** DB row shape (snake_case) → Article (camelCase) */
function mapRow(row: Record<string, unknown>): Article {
  return {
    slug: row.slug as string,
    title: row.title as string,
    description: row.description as string,
    category: row.category as string,
    publishDate: row.publish_date as string,
    updatedDate: row.updated_at ? (row.updated_at as string) : undefined,
    readTime: row.read_time as number,
    tags: (row.tags as string[]) || [],
    keywords: (row.keywords as string[]) || [],
    gradient: {
      from: (row.gradient_from as string) || 'rose-600',
      to: (row.gradient_to as string) || 'red-700',
    },
    featured: row.featured as boolean,
    heroImage: row.hero_image as string | undefined,
    heroImageLight: row.hero_image_light as string | undefined,
    heroImageAlt: row.hero_image_alt as string | undefined,
    narrationUrl: row.narration_url as string | undefined,
    comingSoon: row.coming_soon as boolean,
    sortOrder: row.sort_order as number | undefined,
    href: `/articles/${row.slug}`,
    series: row.series as string | undefined,
    seriesOrder: row.series_order as number | undefined,
    author: {
      name: (row.author_name as string) || 'alumi news Editorial',
      role: (row.author_role as string) || 'Medical Review Board',
    },
  };
}

/**
 * Get all published articles sorted by date.
 * Cached per SSR render — safe to call from every component.
 */
export async function getArticles(): Promise<Article[]> {
  if (_cachedArticles && isCacheValid()) return _cachedArticles;

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('draft', false)
    .eq('coming_soon', false)
    .order('sort_order', { ascending: false, nullsFirst: false })
    .order('publish_date', { ascending: false });

  if (error) {
    console.error('Failed to fetch articles:', error.message);
    return [];
  }

  const articles = (data || []).map(mapRow);
  setCacheArticles(articles);
  return articles;
}

/**
 * Render-time dedup: strip the first <p> from <section id="introduction">
 * if it duplicates the description. ArticleLayout already renders the
 * description as a standfirst above the body — leaving the matching
 * paragraph in produces a duplicated intro.
 *
 * This is the same logic as `_shared/description.ts::stripDuplicateStandfirst`
 * but ported here so the Astro render pipeline doesn't have to import from
 * the Deno edge functions directory. Publish-time dedup also runs (see
 * pipeline-admin + stage-publish + articles-api), but render-time dedup
 * fixes existing articles immediately without re-publishing.
 */
function stripDuplicateStandfirst(articleHtml: string, description: string): string {
  const desc = (description || '').replace(/\s+/g, ' ').trim();
  if (desc.length < 30) return articleHtml;

  const introMatch = articleHtml.match(
    /(<section[^>]*id=["']introduction["'][^>]*>\s*)(<p[^>]*>([\s\S]*?)<\/p>\s*)/i
  );
  if (!introMatch) return articleHtml;

  const innerHtml = introMatch[3];
  const paraText = innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!paraText) return articleHtml;

  // Identical match
  if (paraText === desc) return articleHtml.replace(introMatch[0], introMatch[1]);

  const minLen = Math.min(paraText.length, desc.length);
  const maxLen = Math.max(paraText.length, desc.length);
  const ratio = minLen / maxLen;

  const normalize = (s: string) =>
    s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').trim();
  const np = normalize(paraText);
  const nd = normalize(desc);
  const sliceLen = Math.min(80, minLen);
  const leadingMatch =
    np.startsWith(nd.slice(0, sliceLen)) || nd.startsWith(np.slice(0, sliceLen));

  if (ratio > 0.8 && leadingMatch) {
    return articleHtml.replace(introMatch[0], introMatch[1]);
  }

  // Description is a sentence-truncated prefix of the paragraph
  if (paraText.length > desc.length && np.startsWith(nd.slice(0, Math.min(120, nd.length)))) {
    if (desc.length / paraText.length > 0.4) {
      return articleHtml.replace(introMatch[0], introMatch[1]);
    }
  }

  // Standfirst dek wrapped in <strong>/<b>/<em>
  const isStandfirst = /^\s*<(strong|b|em|i)[^>]*>[\s\S]*?<\/\1>\s*$/i.test(innerHtml.trim());
  if (isStandfirst) {
    const sharedHead = Math.min(40, minLen);
    if (sharedHead > 20 && np.slice(0, sharedHead) === nd.slice(0, sharedHead)) {
      return articleHtml.replace(introMatch[0], introMatch[1]);
    }
  }

  return articleHtml;
}

/**
 * Get a single article by slug (includes draft/unpublished for preview)
 */
export async function getArticleBySlug(slug: string): Promise<(Article & { articleHtml: string; toc: { id: string; title: string }[] }) | null> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;

  const mapped = mapRow(data);
  const rawHtml = (data.article_html as string) || '';
  return {
    ...mapped,
    articleHtml: stripDuplicateStandfirst(rawHtml, mapped.description),
    toc: (data.toc as { id: string; title: string }[]) || [],
  };
}

/**
 * Get featured articles
 */
export async function getFeaturedArticles(): Promise<Article[]> {
  const articles = await getArticles();
  return articles.filter((a) => a.featured);
}

/**
 * Get coming soon articles.
 * Cached per SSR render.
 */
export async function getComingSoonArticles(): Promise<Article[]> {
  if (_cachedComingSoon && isCacheValid()) return _cachedComingSoon;

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('coming_soon', true)
    .order('sort_order', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Failed to fetch coming soon articles:', error.message);
    return [];
  }

  const articles = (data || []).map(mapRow);
  _cachedComingSoon = articles;
  _cacheTimestamp = Date.now();
  return articles;
}

/**
 * Get articles for homepage: published (sorted by sortOrder then date) + coming soon appended
 */
export async function getArticlesForHomepage(): Promise<Article[]> {
  const [published, comingSoon] = await Promise.all([
    getArticles(),
    getComingSoonArticles(),
  ]);

  return [...published, ...comingSoon];
}

/**
 * Get related articles by category and tag overlap (excludes the current article)
 */
export async function getRelatedArticles(currentSlug: string, limit = 3): Promise<Article[]> {
  const articles = await getArticles();
  const current = articles.find((a) => a.slug === currentSlug);
  const others = articles.filter((a) => a.slug !== currentSlug);

  if (!current) return others.slice(0, limit);

  const scored = others.map((article) => {
    let score = 0;
    if (article.category === current.category) score += 10;
    const sharedTags = article.tags.filter((t) => current.tags.includes(t));
    score += sharedTags.length * 3;
    return { article, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.article);
}

/**
 * Get articles in a series, sorted by seriesOrder
 */
export async function getSeriesArticles(seriesName: string): Promise<Article[]> {
  const articles = await getArticles();
  return articles
    .filter((a) => a.series === seriesName)
    .sort((a, b) => (a.seriesOrder ?? 99) - (b.seriesOrder ?? 99));
}

/**
 * Get all unique series with their articles
 */
export async function getAllSeries(): Promise<{ name: string; articles: Article[] }[]> {
  const articles = await getArticles();
  const seriesMap = new Map<string, Article[]>();

  articles.forEach((article) => {
    if (article.series) {
      const existing = seriesMap.get(article.series) || [];
      existing.push(article);
      seriesMap.set(article.series, existing);
    }
  });

  return Array.from(seriesMap.entries()).map(([name, arts]) => ({
    name,
    articles: arts.sort((a, b) => (a.seriesOrder ?? 99) - (b.seriesOrder ?? 99)),
  }));
}

/**
 * Format publish date for display
 */
export function formatPublishDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format publish date with day for cards
 */
export function formatPublishDateShort(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get unique categories from all published articles
 */
export async function getCategories(): Promise<string[]> {
  const articles = await getArticles();
  const categories = [...new Set(articles.map((a) => a.category))];
  return categories.sort();
}

/**
 * Get categories with article counts
 */
export async function getCategoriesWithCounts(): Promise<{ name: string; count: number }[]> {
  const articles = await getArticles();
  const countMap = new Map<string, number>();
  articles.forEach((a) => {
    countMap.set(a.category, (countMap.get(a.category) || 0) + 1);
  });
  return Array.from(countMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get articles grouped by category, sorted by recency within each group
 */
export async function getArticlesByCategory(): Promise<Map<string, Article[]>> {
  const articles = await getArticles();
  const grouped = new Map<string, Article[]>();
  articles.forEach((a) => {
    const existing = grouped.get(a.category) || [];
    existing.push(a);
    grouped.set(a.category, existing);
  });
  return grouped;
}

/**
 * Get the next article in the same category (for continuous reading)
 */
export async function getNextInCategory(currentSlug: string): Promise<Article | null> {
  const articles = await getArticles();
  const current = articles.find((a) => a.slug === currentSlug);
  if (!current) return null;

  const sameCategory = articles.filter((a) => a.category === current.category && a.slug !== currentSlug);
  const currentIndex = articles.indexOf(current);
  // Find the next article in same category that comes after the current one
  const next = sameCategory.find((a) => articles.indexOf(a) > currentIndex);
  return next || sameCategory[0] || null; // wrap around to first if at end
}

/**
 * Truncate a string to a max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

/**
 * Check if an article was published within the last N days
 */
export function isNewArticle(publishDate: string, days = 7): boolean {
  const published = new Date(publishDate);
  const now = new Date();
  const diffMs = now.getTime() - published.getTime();
  return diffMs < days * 24 * 60 * 60 * 1000;
}

/**
 * Get all unique tags across published articles, sorted by frequency
 */
export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const articles = await getArticles();
  const tagCount = new Map<string, number>();
  articles.forEach((a) => {
    a.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1));
  });
  return Array.from(tagCount.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get total article count for a series
 */
export async function getSeriesTotal(seriesName: string): Promise<number> {
  const articles = await getSeriesArticles(seriesName);
  return articles.length;
}

/**
 * Get author initials for avatar display (e.g. "Linda Carnes" → "lc")
 */
export function getAuthorInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return 'an';
  return parts.map((p) => p[0]).join('').toLowerCase().slice(0, 2);
}

/**
 * Get all published articles for a specific category
 */
export async function getArticlesForCategory(category: string): Promise<Article[]> {
  const articles = await getArticles();
  return articles.filter((a) => a.category === category);
}

/**
 * Category-based gradient palette for article cards.
 */
const categoryGradients: Record<string, { bg: string; pattern: string }> = {
  'Mental Health': {
    bg: 'linear-gradient(135deg, #312e81 0%, #581c87 40%, #7e22ce 100%)',
    pattern: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.04) 0%, transparent 40%)',
  },
  'Neuroscience': {
    bg: 'linear-gradient(135deg, #0c4a6e 0%, #1e3a5f 40%, #164e63 100%)',
    pattern: 'radial-gradient(circle at 70% 30%, rgba(56,189,248,0.12) 0%, transparent 50%), radial-gradient(circle at 20% 70%, rgba(34,211,238,0.08) 0%, transparent 40%)',
  },
  'Longevity': {
    bg: 'linear-gradient(135deg, #064e3b 0%, #065f46 40%, #115e59 100%)',
    pattern: 'radial-gradient(circle at 30% 70%, rgba(52,211,153,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 30%, rgba(45,212,191,0.08) 0%, transparent 40%)',
  },
  'Clinical Evidence': {
    bg: 'linear-gradient(135deg, #3b0764 0%, #4c1d95 40%, #5b21b6 100%)',
    pattern: 'radial-gradient(circle at 60% 40%, rgba(196,181,253,0.1) 0%, transparent 50%), radial-gradient(circle at 25% 75%, rgba(167,139,250,0.06) 0%, transparent 40%)',
  },
  'Environmental Health': {
    bg: 'linear-gradient(135deg, #78350f 0%, #92400e 40%, #b45309 100%)',
    pattern: 'radial-gradient(circle at 40% 60%, rgba(251,191,36,0.1) 0%, transparent 50%), radial-gradient(circle at 75% 25%, rgba(245,158,11,0.08) 0%, transparent 40%)',
  },
  'Nutrition': {
    bg: 'linear-gradient(135deg, #14532d 0%, #166534 40%, #15803d 100%)',
    pattern: 'radial-gradient(circle at 50% 50%, rgba(74,222,128,0.08) 0%, transparent 50%), radial-gradient(circle at 20% 30%, rgba(134,239,172,0.06) 0%, transparent 40%)',
  },
  'Fitness': {
    bg: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 40%, #dc2626 100%)',
    pattern: 'radial-gradient(circle at 30% 40%, rgba(252,165,165,0.1) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(248,113,113,0.08) 0%, transparent 40%)',
  },
  'Sleep Science': {
    bg: 'linear-gradient(135deg, #1e1b4b 0%, #1e3a5f 40%, #312e81 100%)',
    pattern: 'radial-gradient(circle at 60% 30%, rgba(129,140,248,0.1) 0%, transparent 50%), radial-gradient(circle at 30% 80%, rgba(99,102,241,0.06) 0%, transparent 40%)',
  },
  'Research': {
    bg: 'linear-gradient(135deg, #1c1917 0%, #292524 40%, #44403c 100%)',
    pattern: 'radial-gradient(circle at 50% 50%, rgba(168,162,158,0.08) 0%, transparent 50%)',
  },
  'Research Summary': {
    bg: 'linear-gradient(135deg, #1c1917 0%, #292524 40%, #44403c 100%)',
    pattern: 'radial-gradient(circle at 50% 50%, rgba(168,162,158,0.08) 0%, transparent 50%)',
  },
  'Pharmacology': {
    bg: 'linear-gradient(135deg, #134e4a 0%, #115e59 40%, #0d9488 100%)',
    pattern: 'radial-gradient(circle at 40% 60%, rgba(94,234,212,0.1) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(45,212,191,0.06) 0%, transparent 40%)',
  },
};

const defaultGradient = {
  bg: 'linear-gradient(135deg, #1c1917 0%, #292524 40%, #44403c 100%)',
  pattern: 'radial-gradient(circle at 50% 50%, rgba(168,162,158,0.08) 0%, transparent 50%)',
};

/**
 * Get the CSS gradient style for an article's card art
 */
export function getArticleGradientStyle(category: string): string {
  const grad = categoryGradients[category] || defaultGradient;
  return `background: ${grad.pattern}, ${grad.bg};`;
}
