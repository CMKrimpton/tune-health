import { defineMiddleware } from 'astro:middleware';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getAdminToken(): string {
  return (process.env.ADMIN_TOKEN || import.meta.env.ADMIN_TOKEN || process.env.PUBLIC_ADMIN_TOKEN || import.meta.env.PUBLIC_ADMIN_TOKEN || '').trim();
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  // ─── Login POST: validate token, set HttpOnly cookie server-side ───
  if (url.pathname === '/admin/login' && context.request.method === 'POST') {
    try {
      const body = await context.request.json();
      const token = (body?.token || '').trim();
      const adminToken = getAdminToken();

      if (token && token === adminToken) {
        context.cookies.set('admin_token', token, {
          path: '/',
          maxAge: COOKIE_MAX_AGE,
          httpOnly: true,
          secure: url.protocol === 'https:',
          sameSite: 'lax',
        });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Bad request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ─── Logout POST: clear the HttpOnly cookie ───
  if (url.pathname === '/admin/logout' && context.request.method === 'POST') {
    context.cookies.delete('admin_token', { path: '/' });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─── Protect /admin routes (except /admin/login) ───
  if (url.pathname.startsWith('/admin') && !url.pathname.startsWith('/admin/login')) {
    const cookie = context.cookies.get('admin_token');
    const adminToken = getAdminToken();

    if (!cookie) {
      return context.redirect('/admin/login');
    }
    if (cookie.value !== adminToken) {
      context.cookies.delete('admin_token', { path: '/' });
      return context.redirect('/admin/login?error=1');
    }
  }

  const response = await next();

  // ─── CDN cache headers for public pages (SSR) ───
  // Vercel CDN caches at the edge when s-maxage is set.
  // Admin and API routes are never cached.
  if (!url.pathname.startsWith('/admin') && !url.pathname.startsWith('/api/')) {
    const isArticle = url.pathname.startsWith('/articles/') && url.pathname !== '/articles/';
    const ttl = isArticle ? 300 : 60; // articles: 5 min, listings: 1 min
    response.headers.set('Cache-Control', `s-maxage=${ttl}, stale-while-revalidate=3600`);
  }

  return response;
});
