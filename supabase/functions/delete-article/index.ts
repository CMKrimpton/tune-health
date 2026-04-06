import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const { slug } = await req.json();

    if (!slug || typeof slug !== "string") {
      return new Response(
        JSON.stringify({ error: "slug is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cleanup: string[] = [];

    // 1. Delete from articles table
    const { error: dbErr } = await db.from("articles").delete().eq("slug", slug);
    if (dbErr) {
      console.error(`[delete-article] DB delete failed for "${slug}":`, dbErr.message);
      cleanup.push(`DB delete failed: ${dbErr.message}`);
    } else {
      cleanup.push("articles row deleted");
    }

    // 2. Clean up pipeline logs (mark as deleted, preserve for audit)
    const { error: logErr } = await db
      .from("daily_article_log")
      .update({ status: "failed", error: `Deleted via admin editor` })
      .eq("slug", slug)
      .neq("status", "failed");
    if (!logErr) cleanup.push("pipeline logs marked deleted");

    // 3. Delete illustrations from storage
    const illustrationFiles = [
      `illustrations/${slug}.png`,
      `illustrations/${slug}-light.png`,
    ];
    const { error: illErr } = await db.storage
      .from("article-illustrations")
      .remove(illustrationFiles);
    if (!illErr) cleanup.push("illustrations deleted");

    // 4. Delete narration from storage
    const { error: narErr } = await db.storage
      .from("article-narrations")
      .remove([`narrations/${slug}.mp3`]);
    if (!narErr) cleanup.push("narration deleted");

    console.log(`[delete-article] "${slug}" fully cleaned up:`, cleanup.join(", "));

    return new Response(
      JSON.stringify({ success: true, cleanup }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[delete-article] Error:", err);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
