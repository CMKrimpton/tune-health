/**
 * Article utilities for content collection integration
 */

import { getCollection, type CollectionEntry } from 'astro:content';

export interface Article {
  slug: string;
  title: string;
  description: string;
  category: string;
  publishDate: string;
  readTime: number;
  tags: string[];
  gradient: { from: string; to: string };
  featured: boolean;
  heroImage?: string;
  heroImageAlt?: string;
  comingSoon: boolean;
  href: string;
  series?: string;
  seriesOrder?: number;
}

function mapArticle(article: CollectionEntry<'articles'>): Article {
  return {
    slug: article.id.replace('.json', ''),
    title: article.data.title,
    description: article.data.description,
    category: article.data.category,
    publishDate: article.data.publishDate,
    readTime: article.data.readTime,
    tags: article.data.tags,
    gradient: article.data.gradient,
    featured: article.data.featured,
    heroImage: article.data.heroImage,
    heroImageAlt: article.data.heroImageAlt,
    comingSoon: article.data.comingSoon ?? false,
    href: `/articles/${article.id.replace('.json', '')}`,
    series: article.data.series,
    seriesOrder: article.data.seriesOrder,
  };
}

/**
 * Get all published articles sorted by date
 */
export async function getArticles(): Promise<Article[]> {
  const articles = await getCollection('articles');

  return articles
    .filter((article) => !article.data.draft && !article.data.comingSoon)
    .map(mapArticle)
    .sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());
}

/**
 * Get featured articles
 */
export async function getFeaturedArticles(): Promise<Article[]> {
  const articles = await getArticles();
  return articles.filter((a) => a.featured);
}

/**
 * Get coming soon articles
 */
export async function getComingSoonArticles(): Promise<Article[]> {
  const articles = await getCollection('articles');

  return articles
    .filter((article) => article.data.comingSoon)
    .sort((a, b) => (a.data.sortOrder ?? 99) - (b.data.sortOrder ?? 99))
    .map(mapArticle);
}

/**
 * Get articles for homepage: published (sorted by sortOrder then date) + coming soon appended
 */
export async function getArticlesForHomepage(): Promise<Article[]> {
  const [published, comingSoon] = await Promise.all([
    getArticles(),
    getComingSoonArticles(),
  ]);

  const sorted = [...published].sort((a, b) => {
    const orderA = published.indexOf(a);
    const orderB = published.indexOf(b);
    return orderA - orderB;
  });

  return [...sorted, ...comingSoon];
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
