import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

    const githubToken = Deno.env.get("GITHUB_TOKEN");
    const githubRepo = Deno.env.get("GITHUB_REPO");

    if (!githubToken || !githubRepo) {
      return new Response(
        JSON.stringify({ error: "GitHub not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github.v3.raw",
    };

    // Fetch the .astro file
    const astroRes = await fetch(
      `https://api.github.com/repos/${githubRepo}/contents/src/pages/articles/${slug}.astro`,
      { headers }
    );

    if (!astroRes.ok) {
      return new Response(
        JSON.stringify({ error: `Article not found (${astroRes.status})` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const astroContent = await astroRes.text();

    // Extract article HTML from between <div class="article-content"> and its closing </div>
    const contentMatch = astroContent.match(/<div class="article-content">([\s\S]*?)<\/div>\s*\n\s*<!-- Tags/);
    const articleHtml = contentMatch ? contentMatch[1].trim() : '';

    // Extract SVG
    const svgMatch = astroContent.match(/<svg slot="feature-image"[^>]*>([\s\S]*?)<\/svg>/);
    const svg = svgMatch ? svgMatch[1].trim() : '';

    // Extract TOC
    const tocMatches = [...astroContent.matchAll(/<a href="#([^"]+)"[^>]*>([^<]+)<\/a>/g)];
    const toc = tocMatches
      .filter(m => !m[0].includes('side-nav')) // exclude nav links
      .map(m => ({ id: m[1], title: m[2] }));

    // Extract tags
    const tagMatches = [...astroContent.matchAll(/rounded-full text-sm">([^<]+)<\/span>/g)];
    const tags = tagMatches.map(m => m[1]);

    return new Response(
      JSON.stringify({
        astroContent,
        articleHtml,
        svg,
        toc,
        extractedTags: tags,
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
