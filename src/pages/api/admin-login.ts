import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const token = formData.get('token')?.toString().trim();
  const adminToken = (process.env.PUBLIC_ADMIN_TOKEN || process.env.ADMIN_TOKEN || import.meta.env.PUBLIC_ADMIN_TOKEN || '').trim();

  if (token && token === adminToken) {
    cookies.set('admin_token', token, {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });
    return redirect('/admin', 302);
  }

  return redirect('/admin/login?error=1', 302);
};
