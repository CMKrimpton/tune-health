import { defineMiddleware } from 'astro:middleware';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getAdminToken(): string {
  return (process.env.ADMIN_TOKEN || import.meta.env.ADMIN_TOKEN || '').trim();
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
    // EXCEPTION: when a typography_preset cookie is present, bypass the CDN
    // entirely. Vercel's edge cache does not vary on cookies — without this
    // bypass, the first uncookied visit caches the default-preset version and
    // every subsequent cookie-bearing visitor would get that stale render.
    const hasTypographyCookie = !!context.cookies.get('typography_preset')?.value;
    if (hasTypographyCookie) {
      response.headers.set('Cache-Control', 'private, no-store');
    } else {
      // Aggressive stale-while-revalidate: edge serves cached version
      // immediately but revalidates every 15s in the background. Edits made
      // in the admin propagate to readers within ~15-30s without per-page
      // cache purging infrastructure.
      // Previously was s-maxage=300 (5 minutes) for articles which meant
      // edits stayed invisible for up to 5 minutes — confusing for the
      // editor and hard to verify.
      const ttl = 15;
      response.headers.set('Cache-Control', `s-maxage=${ttl}, stale-while-revalidate=86400`);
    }
  }

  return response;
});
