import type { APIRoute } from 'astro';

/**
 * Newsletter subscription endpoint.
 * Stores emails in Supabase `newsletter_subscribers` table.
 * Falls back gracefully if Supabase is not configured.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const email = body?.email?.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      // Supabase not configured — log and return success so the UX isn't broken
      console.warn('[newsletter] Supabase not configured, email not saved:', email);
      return new Response(
        JSON.stringify({ success: true, message: 'Subscribed (pending backend setup)' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Upsert to newsletter_subscribers table
    const response = await fetch(`${supabaseUrl}/rest/v1/newsletter_subscribers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        email,
        subscribed_at: new Date().toISOString(),
        source: body?.source || 'website',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[newsletter] Supabase error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to subscribe. Please try again.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Subscribed successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[newsletter] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
