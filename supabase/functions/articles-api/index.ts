import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { stripDuplicateStandfirst } from "../_shared/description.ts";
// GitHub sync removed — site now serves from Supabase directly (SSR)

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

      // Check if article already exists — fetch description + narration_url so
      // we can detect a description change and trigger narration regen
      const { data: existing } = await db
        .from("articles")
        .select("id, description, narration_url, article_html")
        .eq("slug", article.slug)
        .maybeSingle();

      // Dedup the standfirst from the body if both description + html provided.
      // The render layer also dedups, but writing clean HTML to the DB means
      // RSS, social previews, and any future consumer all get the clean copy.
      const incomingDescription = (article.description as string | undefined) ?? existing?.description;
      const incomingHtml = (article.article_html as string | undefined) ?? existing?.article_html;
      if (incomingDescription && incomingHtml) {
        const cleaned = stripDuplicateStandfirst(incomingHtml, incomingDescription);
        if (cleaned !== incomingHtml) {
          article.article_html = cleaned;
        }
      }

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

      // ── Auto-regenerate narration if description changed ──────────────
      // Narration narrates the description field. If the user edited the
      // description (or this is a new article with a narration_url that
      // doesn't match the new text), the audio is now stale. Fire-and-forget
      // dispatch to generate-narration with force=true.
      // Trigger conditions:
      //   - description in payload differs from existing description, OR
      //   - new article being inserted with no narration yet
      const newDesc = (article.description as string | undefined) ?? null;
      const oldDesc = existing?.description ?? null;
      const descriptionChanged = newDesc !== null && newDesc !== oldDesc;
      if (descriptionChanged && newDesc && newDesc.trim().length >= 20) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        if (supabaseUrl) {
          console.log(`[articles-api] description changed for ${article.slug} — dispatching narration regen (force=true)`);
          fetch(`${supabaseUrl}/functions/v1/generate-narration`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ action: "generate", slug: article.slug, force: true }),
          }).catch(err =>
            console.warn(`[articles-api] narration dispatch failed for ${article.slug}: ${err instanceof Error ? err.message : "unknown"}`)
          );
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
