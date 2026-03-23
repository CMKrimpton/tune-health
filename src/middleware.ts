import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  // Only protect /admin routes (except /admin/login)
  if (url.pathname.startsWith('/admin') && !url.pathname.startsWith('/admin/login')) {
    const cookie = context.cookies.get('admin_token');
    const adminToken = (process.env.ADMIN_TOKEN || import.meta.env.ADMIN_TOKEN || process.env.PUBLIC_ADMIN_TOKEN || import.meta.env.PUBLIC_ADMIN_TOKEN || '').trim();

    if (!cookie) {
      return context.redirect('/admin/login');
    }
    if (cookie.value !== adminToken) {
      // They tried a token and it was wrong — redirect with error flag
      return context.redirect('/admin/login?error=1');
    }
  }

  return next();
});
