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
  href: string;
}

/**
 * Get all published articles sorted by date
 */
export async function getArticles(): Promise<Article[]> {
  const articles = await getCollection('articles');

  return articles
    .filter((article) => !article.data.draft)
    .map((article) => ({
      slug: article.id.replace('.json', ''),
      title: article.data.title,
      description: article.data.description,
      category: article.data.category,
      publishDate: article.data.publishDate,
      readTime: article.data.readTime,
      tags: article.data.tags,
      gradient: article.data.gradient,
      featured: article.data.featured,
      href: `/articles/${article.id.replace('.json', '')}`,
    }))
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
