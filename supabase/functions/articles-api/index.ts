import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { updateGitHubJson } from "../_shared/github.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function supabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...payload } = await req.json();

    // Auth check for write operations
    if (action !== "list" && action !== "get") {
      const adminToken = (Deno.env.get("ADMIN_TOKEN") || "").trim();
      const authHeader = req.headers.get("authorization")?.replace("Bearer ", "") || "";
      if (!adminToken || authHeader !== adminToken) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const db = supabase();

    // ─── LIST: Get all articles ───
    if (action === "list") {
      const { data, error } = await db
        .from("articles")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("publish_date", { ascending: false });

      if (error) throw error;
      return json(data);
    }

    // ─── GET: Get single article by slug ───
    if (action === "get") {
      const { data, error } = await db
        .from("articles")
        .select("*")
        .eq("slug", payload.slug)
        .maybeSingle();

      if (error) throw error;
      if (!data) return json({ error: "Article not found" }, 404);
      return json(data);
    }

    // ─── SAVE: Create or update article ───
    if (action === "save") {
      const article = payload.article;
      if (!article || !article.slug) return json({ error: "article with slug required" }, 400);

      // Check if article already exists
      const { data: existing } = await db
        .from("articles")
        .select("id")
        .eq("slug", article.slug)
        .maybeSingle();

      let result;
      if (existing) {
        // Partial update — only set provided fields
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const [key, val] of Object.entries(article)) {
          if (key !== "slug" && val !== undefined) updates[key] = val;
        }
        const { data, error } = await db
          .from("articles")
          .update(updates)
          .eq("slug", article.slug)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        // Insert — requires all fields
        article.updated_at = new Date().toISOString();
        const { data, error } = await db
          .from("articles")
          .insert(article)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      // Auto-sync published articles to GitHub so the live site stays in sync.
      // Only syncs fields that affect the rendered page (not DB-only fields like status).
      if (result.status === "published") {
        const syncFields: Record<string, unknown> = {};
        const fieldMap: Record<string, string> = {
          title: "title", description: "description", category: "category",
          tags: "tags", keywords: "keywords", read_time: "readTime",
          publish_date: "publishDate", featured: "featured", draft: "draft",
          hero_image: "heroImage", hero_image_alt: "heroImageAlt",
          hero_image_light: "heroImageLight", narration_url: "narrationUrl",
        };
        for (const [dbKey, jsonKey] of Object.entries(fieldMap)) {
          if (dbKey in updates) syncFields[jsonKey] = updates[dbKey];
        }
        if (Object.keys(syncFields).length > 0) {
          updateGitHubJson(article.slug, syncFields, `chore: Sync metadata — '${article.slug}'`)
            .catch((err: unknown) => console.warn(`[articles-api] GitHub sync failed for "${article.slug}":`, err));
        }
      }

      return json(result);
    }

    // ─── DELETE: Remove article ───
    if (action === "delete") {
      const { error } = await db
        .from("articles")
        .delete()
        .eq("slug", payload.slug);

      if (error) throw error;
      return json({ success: true });
    }

    // ─── SEED: Import articles from JSON payload (for initial migration) ───
    if (action === "seed") {
      const articles = payload.articles;
      if (!Array.isArray(articles)) return json({ error: "articles array required" }, 400);

      const { data, error } = await db
        .from("articles")
        .upsert(articles, { onConflict: "slug" })
        .select();

      if (error) throw error;
      return json({ inserted: data?.length || 0 });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: unknown) {
    return json({ error: "An internal error occurred" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
