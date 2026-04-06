import type { APIRoute } from 'astro';
import { getArticles, getCategories } from '../utils/articles';
import { getCategorySlug } from '../utils/category-domains';
import { getAllCollections } from '../utils/collections';
import { FALLBACK_URL } from '../config/site';

export const GET: APIRoute = async (context) => {
  const siteUrl = (context.site?.toString() || FALLBACK_URL).replace(/\/$/, '');
  const articles = await getArticles();
  const categories = await getCategories();
  const collections = getAllCollections();

  const staticPages = [
    { path: '/', changefreq: 'daily', priority: '1.0' },
    { path: '/articles', changefreq: 'daily', priority: '0.8' },
    { path: '/deep-dives', changefreq: 'weekly', priority: '0.7' },
    { path: '/collections', changefreq: 'weekly', priority: '0.7' },
    { path: '/start-here', changefreq: 'monthly', priority: '0.7' },
    { path: '/about', changefreq: 'monthly', priority: '0.5' },
    { path: '/howwewrite', changefreq: 'monthly', priority: '0.5' },
    { path: '/subscribe', changefreq: 'monthly', priority: '0.5' },
    { path: '/reading-list', changefreq: 'monthly', priority: '0.4' },
  ];

  const urls = [
    ...staticPages.map((p) =>
      `  <url>
    <loc>${siteUrl}${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
    ),
    ...articles.map((a) =>
      `  <url>
    <loc>${siteUrl}${a.href}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>`
    ),
    ...categories.map((c) =>
      `  <url>
    <loc>${siteUrl}/topics/${getCategorySlug(c)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    ),
    ...collections.map((c) =>
      `  <url>
    <loc>${siteUrl}/collections/${c.slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
