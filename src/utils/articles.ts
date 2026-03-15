/**
 * Article utilities for content collection integration
 */

import { getCollection } from 'astro:content';

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
}

function mapArticle(article: { id: string; data: any }): Article {
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
    // Sort by sortOrder if available, then by date
    const orderA = published.indexOf(a);
    const orderB = published.indexOf(b);
    return orderA - orderB;
  });

  return [...sorted, ...comingSoon];
}

/**
 * Get related articles (excludes the current article, returns up to `limit`)
 */
export async function getRelatedArticles(currentSlug: string, limit = 3): Promise<Article[]> {
  const articles = await getArticles();
  return articles.filter((a) => a.slug !== currentSlug).slice(0, limit);
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
