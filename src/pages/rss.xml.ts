import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getArticles } from '../utils/articles';
import { FALLBACK_URL, SITE_NAME, SITE_DESCRIPTION, SOCIAL, EDITORIAL_ORG_NAME } from '../config/site';

export async function GET(context: APIContext) {
  const articles = await getArticles();
  const siteUrl = context.site?.toString().replace(/\/$/, '') || FALLBACK_URL;
  const year = new Date().getFullYear();

  return rss({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    site: siteUrl,
    items: articles.map((article) => ({
      title: article.title,
      description: article.description,
      pubDate: new Date(article.publishDate),
      link: article.href,
      categories: article.tags,
      author: `editorial@aluminews.com (${article.author?.name || 'alumi news Editorial'})`,
    })),
    customData: [
      '<language>en-US</language>',
      `<copyright>© ${year} ${EDITORIAL_ORG_NAME}</copyright>`,
      `<managingEditor>editorial@aluminews.com (${EDITORIAL_ORG_NAME})</managingEditor>`,
      `<webMaster>editorial@aluminews.com (${EDITORIAL_ORG_NAME})</webMaster>`,
      `<ttl>60</ttl>`,
      `<atom:link href="${siteUrl}${SOCIAL.rssPath}" rel="self" type="application/rss+xml" />`,
    ].join('\n'),
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
    },
  });
}
