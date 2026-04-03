import type { APIContext } from 'astro';
import { FALLBACK_URL } from '../config/site';

export async function GET(context: APIContext): Promise<Response> {
  const siteUrl = context.site?.toString().replace(/\/$/, '') || FALLBACK_URL;

  const body = `User-agent: *
Allow: /
Disallow: /admin/

Sitemap: ${siteUrl}/sitemap-index.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
