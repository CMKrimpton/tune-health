import type { APIRoute } from 'astro';
import { TYPOGRAPHY_PRESETS } from '../../config/typography-presets';
import { TYPOGRAPHY_COOKIE } from '../../utils/typography';

export const prerender = false;

/**
 * Typography preset cookie endpoint. Admin-only — gated on the same
 * admin_token cookie that protects /admin/* routes.
 *
 * POST { presetId } → sets cookie (or clears if presetId omitted/invalid)
 */
export const POST: APIRoute = async ({ request, cookies, url }) => {
  // Auth: must have a valid admin_token cookie (set by /admin/login flow).
  // We don't re-validate the value here — the middleware already gates /admin
  // routes, and this endpoint only runs for users who reached the typography
  // admin page in the first place.
  const adminToken = cookies.get('admin_token')?.value;
  if (!adminToken) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  let body: { presetId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const presetId = (body.presetId || '').trim();

  // Empty / unknown → clear the cookie (revert to DEFAULT_PRESET_ID)
  if (!presetId || !TYPOGRAPHY_PRESETS.find((p) => p.id === presetId)) {
    cookies.delete(TYPOGRAPHY_COOKIE, { path: '/' });
    return json({ ok: true, presetId: null });
  }

  cookies.set(TYPOGRAPHY_COOKIE, presetId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: false, // readable by client JS for the admin UI
    secure: url.protocol === 'https:',
    sameSite: 'lax',
  });

  return json({ ok: true, presetId });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
