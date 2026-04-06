import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PublishRequest {
  slug: string;
  astroContent: string;
  metadata: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const adminToken = (Deno.env.get("ADMIN_TOKEN") || "").trim();
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "") || "";
    if (!adminToken || authHeader !== adminToken) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { slug, astroContent, metadata }: PublishRequest = await req.json();

    if (!slug || !metadata) {
      return new Response(
        JSON.stringify({ error: "slug and metadata are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date().toISOString();
    const dbFields: Record<string, unknown> = {
      title: metadata.title,
      description: metadata.description,
      category: metadata.category,
      tags: metadata.tags || [],
      keywords: metadata.keywords || [],
      read_time: metadata.readTime || 5,
      publish_date: metadata.publishDate || now.slice(0, 10),
      sort_order: metadata.sortOrder || Date.now(),
      gradient_from: (metadata.gradient as Record<string, string>)?.from,
      gradient_to: (metadata.gradient as Record<string, string>)?.to,
      featured: metadata.featured ?? false,
      draft: false,
      coming_soon: false,
      status: "published",
      published_at: now,
      updated_at: now,
      author_name: (metadata.author as Record<string, string>)?.name || "alumi news Editorial",
      author_role: (metadata.author as Record<string, string>)?.role || "Medical Review Board",
    };

    // Store article HTML content if provided
    if (astroContent) {
      dbFields.article_html = astroContent;
    }

    // Optional fields — only set if present
    if (metadata.heroImage) dbFields.hero_image = metadata.heroImage;
    if (metadata.heroImageAlt) dbFields.hero_image_alt = metadata.heroImageAlt;
    if (metadata.heroImageLight) dbFields.hero_image_light = metadata.heroImageLight;
    if (metadata.narrationUrl) dbFields.narration_url = metadata.narrationUrl;

    // Upsert — create if new, update if exists
    const { error: dbErr } = await db
      .from("articles")
      .upsert({ slug, ...dbFields }, { onConflict: "slug" });

    if (dbErr) {
      console.error(`[publish-article] DB upsert failed for "${slug}":`, dbErr.message);
      return new Response(
        JSON.stringify({ error: `DB upsert failed: ${dbErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[publish-article] "${slug}" published to database`);

    return new Response(
      JSON.stringify({
        success: true,
        articleUrl: `/articles/${slug}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[publish-article] Error:", err);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
