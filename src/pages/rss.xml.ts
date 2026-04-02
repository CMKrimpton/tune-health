import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getArticles } from '../utils/articles';

export async function GET(context: APIContext) {
  const articles = await getArticles();

  return rss({
    title: 'alumi news',
    description:
      'Evidence-based health insights. Independent analysis for people who think for themselves.',
    site: context.site?.toString() || 'https://tune-health.vercel.app',
    items: articles.map((article) => ({
      title: article.title,
      description: article.description,
      pubDate: new Date(article.publishDate),
      link: article.href,
      categories: article.tags,
    })),
    customData: '<language>en</language>',
  });
}
