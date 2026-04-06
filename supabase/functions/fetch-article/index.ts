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
    const { slug } = await req.json();

    if (!slug) {
      return new Response(
        JSON.stringify({ error: "slug is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: article, error } = await db
      .from("articles")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !article) {
      return new Response(
        JSON.stringify({ error: "Article not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        articleHtml: article.article_html || "",
        toc: article.toc || [],
        metadata: {
          title: article.title,
          description: article.description,
          category: article.category,
          tags: article.tags,
          keywords: article.keywords,
          readTime: article.read_time,
          publishDate: article.publish_date,
          featured: article.featured,
          draft: article.draft,
          gradient: { from: article.gradient_from, to: article.gradient_to },
          heroImage: article.hero_image,
          heroImageAlt: article.hero_image_alt,
          heroImageLight: article.hero_image_light,
          narrationUrl: article.narration_url,
          author: { name: article.author_name, role: article.author_role },
          sortOrder: article.sort_order,
          series: article.series,
          seriesOrder: article.series_order,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
