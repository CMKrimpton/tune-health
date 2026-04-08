import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { stripDuplicateStandfirst } from "../_shared/description.ts";

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

    // Defensive: callers (notably the legacy edit-page "Publish to GitHub" button)
    // sometimes pass a full Astro file with frontmatter as `astroContent`. Storing
    // that as `article_html` corrupts the article — the SSR site renders the whole
    // file as if it were body HTML. Extract just the inner body content.
    if (astroContent) {
      let html = astroContent;
      // Strip Astro frontmatter (---\n...\n---)
      const frontmatterMatch = html.match(/^---[\s\S]*?---\s*/);
      if (frontmatterMatch) {
        html = html.slice(frontmatterMatch[0].length).trim();
      }
      // If wrapped in <ArticleLayout>...</ArticleLayout>, extract the
      // <div class="article-content">...</div> contents (or any <section>s).
      const articleContentMatch = html.match(/<div[^>]*class=["'][^"']*article-content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?=<\/ArticleLayout>|<Fragment)/i);
      if (articleContentMatch) {
        html = articleContentMatch[1].trim();
      } else {
        // Fallback: extract all <section> tags directly
        const sectionMatches = [...html.matchAll(/<section[\s\S]*?<\/section>/gi)];
        if (sectionMatches.length > 0) {
          html = sectionMatches.map(m => m[0]).join("\n");
        }
      }

      // Apply duplicate-standfirst dedup so the body never repeats the description
      const desc = (metadata.description as string) || "";
      dbFields.article_html = stripDuplicateStandfirst(html, desc);
    }

    // Optional fields — only set if present
    if (metadata.heroImage) dbFields.hero_image = metadata.heroImage;
    if (metadata.heroImageAlt) dbFields.hero_image_alt = metadata.heroImageAlt;
    if (metadata.heroImageLight) dbFields.hero_image_light = metadata.heroImageLight;
    if (metadata.narrationUrl) dbFields.narration_url = metadata.narrationUrl;

    // Detect description change BEFORE upsert so we can fire narration regen.
    // For inserts (new article), we always regen if description present.
    const { data: existingRow } = await db
      .from("articles")
      .select("description")
      .eq("slug", slug)
      .maybeSingle();
    const newDesc = (metadata.description as string | undefined) ?? null;
    const oldDesc = existingRow?.description ?? null;
    const descriptionChanged = !!newDesc && newDesc !== oldDesc;

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

    // Auto-regen narration if description changed (mirrors articles-api save).
    // Fire-and-forget so the publish response stays instant.
    if (descriptionChanged && newDesc && newDesc.trim().length >= 20) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      if (supabaseUrl) {
        console.log(`[publish-article] description changed for ${slug} — dispatching narration regen (force=true)`);
        fetch(`${supabaseUrl}/functions/v1/generate-narration`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ action: "generate", slug, force: true }),
        }).catch(err =>
          console.warn(`[publish-article] narration dispatch failed for ${slug}: ${err instanceof Error ? err.message : "unknown"}`)
        );
      }
    }

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
