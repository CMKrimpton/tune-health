import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * House style prompt — defines the visual language for all alumi news illustrations.
 * Every article gets this as the base, with topic-specific additions.
 */
const HOUSE_STYLE = `Create an abstract, editorial illustration for a premium health science magazine called "alumi news".

Style requirements:
- Dark, moody color palette — deep blacks, rich shadows, with selective color accents
- Abstract and conceptual — NOT literal, NOT stock-photo-like
- Minimalist composition with strong focal point
- Subtle scientific/medical motifs: molecular structures, neural pathways, cellular forms, waveforms
- Painterly quality with slight grain texture — like a high-end magazine cover
- NO text, NO words, NO letters, NO labels in the image
- NO human faces or recognizable people
- NO clipart, NO cartoon style, NO flat design
- Think: Vanity Fair meets Nature journal — premium, intellectual, beautiful
- Horizontal composition (16:10 aspect ratio)`;

/**
 * Maps article categories to color accent guidance for visual consistency.
 */
const CATEGORY_PALETTES: Record<string, string> = {
  "Mental Health":
    "Color accents: deep indigo, violet, and soft lavender against dark backgrounds. Mood: introspective, contemplative.",
  Neuroscience:
    "Color accents: deep blue, cyan, and electric teal against dark backgrounds. Mood: complex, interconnected, luminous.",
  Longevity:
    "Color accents: emerald green, teal, and warm gold against dark backgrounds. Mood: vital, enduring, organic.",
  "Clinical Evidence":
    "Color accents: deep purple, indigo, and cool silver against dark backgrounds. Mood: rigorous, precise, authoritative.",
  "Environmental Health":
    "Color accents: warm amber, burnt orange, and deep earth tones against dark backgrounds. Mood: urgent, elemental.",
  Nutrition:
    "Color accents: rich green, warm gold, and organic earth tones against dark backgrounds. Mood: natural, nourishing.",
  Fitness:
    "Color accents: deep crimson, warm red, and energetic coral against dark backgrounds. Mood: dynamic, powerful.",
  "Sleep Science":
    "Color accents: deep navy, midnight blue, and soft moonlit silver against dark backgrounds. Mood: serene, mysterious.",
  Pharmacology:
    "Color accents: deep teal, clinical blue, and precise white against dark backgrounds. Mood: precise, molecular.",
  "Research Summary":
    "Color accents: warm stone, muted gold, and scholarly burgundy against dark backgrounds. Mood: measured, authoritative.",
};

const DEFAULT_PALETTE =
  "Color accents: selective warm tones against a predominantly dark, rich background. Mood: intellectual, editorial.";

function supabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ─── GENERATE: Create illustration for a single article ───
    if (action === "generate") {
      return await handleGenerate(body);
    }

    // ─── BATCH: Generate illustrations for all articles missing them ───
    if (action === "batch") {
      return await handleBatch(body);
    }

    return json({ error: "Invalid action. Use 'generate' or 'batch'." }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

/**
 * Generate an illustration for a single article.
 * Accepts: { action: "generate", slug, title, description, category }
 * Or:      { action: "generate", slug } — fetches metadata from database
 */
async function handleGenerate(body: Record<string, unknown>) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return json({ error: "OPENAI_API_KEY not configured" }, 500);
  }

  const db = supabase();
  let { slug, title, description, category } = body as Record<string, string>;

  // If only slug provided, fetch metadata from database
  if (slug && (!title || !description || !category)) {
    const { data, error } = await db
      .from("articles")
      .select("title, description, category")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) return json({ error: `Article '${slug}' not found` }, 404);

    title = data.title;
    description = data.description;
    category = data.category;
  }

  if (!slug || !title || !description) {
    return json(
      { error: "slug, title, and description are required" },
      400
    );
  }

  // Build the prompt
  const palette = CATEGORY_PALETTES[category] || DEFAULT_PALETTE;
  const prompt = `${HOUSE_STYLE}

${palette}

Article: "${title}"
Topic: ${description}

Create an abstract, atmospheric illustration that captures the essence of this article's subject matter through abstract visual metaphor — NOT a literal depiction. The illustration should feel like it belongs on the cover of a premium science magazine.`;

  // Call OpenAI GPT Image 1.5
  const imageUrl = await generateImage(openaiKey, prompt);

  // Download the image
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download generated image: ${imageResponse.status}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();

  // Upload to Supabase Storage
  const storagePath = `illustrations/${slug}.png`;
  const { error: uploadError } = await db.storage
    .from("article-illustrations")
    .upload(storagePath, imageBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // Get the public URL
  const { data: urlData } = db.storage
    .from("article-illustrations")
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  // Update the article record in the database
  const { error: updateError } = await db
    .from("articles")
    .update({
      hero_image: publicUrl,
      hero_image_alt: `Editorial illustration for ${title}`,
    })
    .eq("slug", slug);

  if (updateError) {
    // Non-fatal — image was generated and stored, just DB update failed
    // Error is surfaced in the response below
  }

  return json({
    success: true,
    slug,
    imageUrl: publicUrl,
    message: `Illustration generated and stored for "${title}"`,
  });
}

/**
 * Generate illustrations for all articles that don't have one yet.
 * Accepts: { action: "batch", force?: boolean }
 * force=true regenerates ALL illustrations, not just missing ones.
 */
async function handleBatch(body: Record<string, unknown>) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return json({ error: "OPENAI_API_KEY not configured" }, 500);
  }

  const force = body.force === true;
  const db = supabase();

  // Get articles that need illustrations
  let query = db
    .from("articles")
    .select("slug, title, description, category, hero_image")
    .order("publish_date", { ascending: false });

  if (!force) {
    query = query.or("hero_image.is.null,hero_image.eq.");
  }

  const { data: articles, error } = await query;
  if (error) throw error;

  if (!articles || articles.length === 0) {
    return json({
      success: true,
      message: "All articles already have illustrations.",
      generated: 0,
    });
  }

  const results: Array<{ slug: string; status: string; imageUrl?: string; error?: string }> = [];

  // Process sequentially to avoid rate limits
  for (const article of articles) {
    try {
      const palette = CATEGORY_PALETTES[article.category] || DEFAULT_PALETTE;
      const prompt = `${HOUSE_STYLE}

${palette}

Article: "${article.title}"
Topic: ${article.description}

Create an abstract, atmospheric illustration that captures the essence of this article's subject matter through abstract visual metaphor — NOT a literal depiction.`;

      const imageUrl = await generateImage(openaiKey, prompt);

      // Download
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error(`Download failed: ${imageResponse.status}`);
      const imageBuffer = await imageResponse.arrayBuffer();

      // Upload
      const storagePath = `illustrations/${article.slug}.png`;
      const { error: uploadError } = await db.storage
        .from("article-illustrations")
        .upload(storagePath, imageBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = db.storage
        .from("article-illustrations")
        .getPublicUrl(storagePath);

      // Update DB
      await db
        .from("articles")
        .update({
          hero_image: urlData.publicUrl,
          hero_image_alt: `Editorial illustration for ${article.title}`,
        })
        .eq("slug", article.slug);

      results.push({
        slug: article.slug,
        status: "success",
        imageUrl: urlData.publicUrl,
      });
    } catch (err) {
      results.push({
        slug: article.slug,
        status: "error",
        error: (err as Error).message,
      });
    }

    // Brief pause between generations to respect rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  return json({
    success: true,
    message: `Generated ${succeeded} illustrations (${failed} failed)`,
    generated: succeeded,
    failed,
    results,
  });
}

/**
 * Call OpenAI's image generation API (GPT Image 1.5).
 * Returns the URL of the generated image.
 */
async function generateImage(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1536x1024",
      quality: "medium",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // GPT Image returns base64 data - we need to handle both URL and b64 responses
  if (data.data?.[0]?.url) {
    return data.data[0].url;
  }

  if (data.data?.[0]?.b64_json) {
    // Convert base64 to a data URL for downstream processing
    return `data:image/png;base64,${data.data[0].b64_json}`;
  }

  throw new Error("No image data in OpenAI response");
}
