import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { updateGitHubJson } from "../_shared/github.ts";
import { MODELS } from "../_shared/constants.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── DARK house style (existing — dark moody aesthetic) ───
const HOUSE_STYLE_DARK = `Create an abstract, editorial illustration for a premium health science magazine called "alumi news".

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

// ─── LIGHT house style (new — bright airy aesthetic) ───
const HOUSE_STYLE_LIGHT = `Create an abstract, editorial illustration for a premium health science magazine called "alumi news".

Style requirements:
- Light, luminous color palette — warm whites, soft creams, with rich color accents
- Airy, open composition — bright backgrounds with depth and warmth
- Abstract and conceptual — NOT literal, NOT stock-photo-like
- Minimalist composition with strong focal point
- Subtle scientific/medical motifs: molecular structures, neural pathways, cellular forms, waveforms
- Soft watercolor wash quality with gentle grain texture — like an elegant science journal cover
- NO text, NO words, NO letters, NO labels in the image
- NO human faces or recognizable people
- NO clipart, NO cartoon style, NO flat design
- Think: Scientific American meets Kinfolk — airy, intellectual, refined
- Horizontal composition (16:10 aspect ratio)`;

/**
 * Maps article categories to color accent guidance — DARK variant.
 */
const CATEGORY_PALETTES_DARK: Record<string, string> = {
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

/**
 * Maps article categories to color accent guidance — LIGHT variant.
 */
const CATEGORY_PALETTES_LIGHT: Record<string, string> = {
  "Mental Health":
    "Color accents: soft violet, lavender, and warm lilac on a light cream background. Mood: introspective, calm, open.",
  Neuroscience:
    "Color accents: sky blue, soft cyan, and gentle teal on a warm white background. Mood: complex, luminous, clear.",
  Longevity:
    "Color accents: sage green, soft teal, and warm gold on a light cream background. Mood: vital, enduring, fresh.",
  "Clinical Evidence":
    "Color accents: soft purple, gentle indigo, and warm silver on a light background. Mood: rigorous, clean, authoritative.",
  "Environmental Health":
    "Color accents: warm amber, soft terracotta, and sandy earth tones on a cream background. Mood: warm, elemental, grounded.",
  Nutrition:
    "Color accents: fresh green, warm gold, and soft earth tones on a light cream background. Mood: natural, nourishing, bright.",
  Fitness:
    "Color accents: warm coral, soft red, and rose on a light background. Mood: dynamic, energetic, warm.",
  "Sleep Science":
    "Color accents: soft periwinkle, gentle blue, and warm moonlit silver on a cream background. Mood: serene, gentle, peaceful.",
  Pharmacology:
    "Color accents: soft teal, powder blue, and clean white on a light background. Mood: precise, molecular, clean.",
  "Research Summary":
    "Color accents: warm stone, soft gold, and muted burgundy on a cream background. Mood: measured, scholarly, warm.",
};

const DEFAULT_PALETTE_DARK =
  "Color accents: selective warm tones against a predominantly dark, rich background. Mood: intellectual, editorial.";

const DEFAULT_PALETTE_LIGHT =
  "Color accents: selective warm tones against a predominantly light, cream background. Mood: intellectual, refined.";

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

    // ─── GENERATE: Create illustration pair for a single article ───
    if (action === "generate") {
      return await handleGenerate(body);
    }

    // ─── BATCH: Generate illustrations for all articles missing them ───
    if (action === "batch") {
      return await handleBatch(body);
    }

    // ─── BATCH-LIGHT: Generate ONLY light variants for articles that have dark but no light ───
    if (action === "batch-light") {
      return await handleBatchLight(body);
    }

    return json({ error: "Invalid action. Use 'generate', 'batch', or 'batch-light'." }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

/**
 * Build the prompt for a given variant (dark or light).
 */
function buildPrompt(
  variant: "dark" | "light",
  title: string,
  description: string,
  category: string
): string {
  const style = variant === "dark" ? HOUSE_STYLE_DARK : HOUSE_STYLE_LIGHT;
  const palettes = variant === "dark" ? CATEGORY_PALETTES_DARK : CATEGORY_PALETTES_LIGHT;
  const fallback = variant === "dark" ? DEFAULT_PALETTE_DARK : DEFAULT_PALETTE_LIGHT;
  const palette = palettes[category] || fallback;

  return `${style}

${palette}

Article: "${title}"
Topic: ${description}

Create an abstract, atmospheric illustration that captures the essence of this article's subject matter through abstract visual metaphor — NOT a literal depiction. The illustration should feel like it belongs on the cover of a premium science magazine.`;
}

/**
 * Generate, upload, and store a single illustration variant.
 * Returns the public URL on success.
 */
async function generateAndStore(
  openaiKey: string,
  db: ReturnType<typeof supabase>,
  slug: string,
  variant: "dark" | "light",
  title: string,
  description: string,
  category: string
): Promise<string> {
  const prompt = buildPrompt(variant, title, description, category);
  const imageUrl = await generateImage(openaiKey, prompt);

  // Download the image
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download generated image: ${imageResponse.status}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();

  // Upload to Supabase Storage
  const suffix = variant === "light" ? "-light" : "";
  const storagePath = `illustrations/${slug}${suffix}.png`;
  const { error: uploadError } = await db.storage
    .from("article-illustrations")
    .upload(storagePath, imageBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = db.storage
    .from("article-illustrations")
    .getPublicUrl(storagePath);

  return urlData.publicUrl;
}

/**
 * Generate illustration pair (dark + light) for a single article.
 * Accepts: { action: "generate", slug, title, description, category, variant? }
 * variant: "dark" | "light" | "both" (default "both")
 */
async function handleGenerate(body: Record<string, unknown>) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return json({ error: "OPENAI_API_KEY not configured" }, 500);
  }

  const db = supabase();
  let { slug, title, description, category } = body as Record<string, string>;
  const variant = (body.variant as string) || "both";

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

  const heroImageAlt = `Editorial illustration for ${title}`;
  let darkUrl: string | undefined;
  let lightUrl: string | undefined;

  // Generate dark variant
  if (variant === "dark" || variant === "both") {
    darkUrl = await generateAndStore(openaiKey, db, slug, "dark", title, description, category);
  }

  // Generate light variant
  if (variant === "light" || variant === "both") {
    lightUrl = await generateAndStore(openaiKey, db, slug, "light", title, description, category);
  }

  // Update the article record in the database
  const dbUpdate: Record<string, unknown> = {};
  if (darkUrl) {
    dbUpdate.hero_image = darkUrl;
    dbUpdate.hero_image_alt = heroImageAlt;
  }
  if (lightUrl) {
    dbUpdate.hero_image_light = lightUrl;
  }

  if (Object.keys(dbUpdate).length > 0) {
    const { error: updateError } = await db
      .from("articles")
      .update(dbUpdate)
      .eq("slug", slug);

    if (updateError) {
      console.warn(`[Illustration] DB update failed for ${slug}: ${updateError.message}`);
    }
  }

  // Sync to GitHub JSON so the Astro site renders the hero images
  const githubFields: Record<string, unknown> = {};
  if (darkUrl) {
    githubFields.heroImage = darkUrl;
    githubFields.heroImageAlt = heroImageAlt;
  }
  if (lightUrl) {
    githubFields.heroImageLight = lightUrl;
  }

  if (Object.keys(githubFields).length > 0) {
    await updateGitHubJson(slug, githubFields, `feat: Add hero image${lightUrl ? " pair" : ""} — '${slug}'`);
  }

  return json({
    success: true,
    slug,
    imageUrl: darkUrl,
    imageUrlLight: lightUrl,
    message: `Illustration${variant === "both" ? " pair" : ` (${variant})`} generated for "${title}"`,
  });
}

/**
 * Generate illustration pairs for all articles missing them.
 * Accepts: { action: "batch", force?: boolean }
 */
async function handleBatch(body: Record<string, unknown>) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return json({ error: "OPENAI_API_KEY not configured" }, 500);
  }

  const force = body.force === true;
  const db = supabase();

  let query = db
    .from("articles")
    .select("slug, title, description, category, hero_image, hero_image_light")
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

  const results: Array<{ slug: string; status: string; imageUrl?: string; imageUrlLight?: string; error?: string }> = [];

  for (const article of articles) {
    try {
      const heroImageAlt = `Editorial illustration for ${article.title}`;
      let darkUrl = article.hero_image;
      let lightUrl = article.hero_image_light;

      // Generate dark if missing (or force)
      if (!darkUrl || force) {
        darkUrl = await generateAndStore(openaiKey, db, article.slug, "dark", article.title, article.description, article.category);
      }

      // Generate light if missing (or force)
      if (!lightUrl || force) {
        lightUrl = await generateAndStore(openaiKey, db, article.slug, "light", article.title, article.description, article.category);
      }

      // Update DB
      await db
        .from("articles")
        .update({
          hero_image: darkUrl,
          hero_image_alt: heroImageAlt,
          hero_image_light: lightUrl,
        })
        .eq("slug", article.slug);

      // Sync to GitHub JSON
      await updateGitHubJson(
        article.slug,
        { heroImage: darkUrl, heroImageAlt, heroImageLight: lightUrl },
        `feat: Add hero image pair — '${article.slug}'`
      );

      results.push({
        slug: article.slug,
        status: "success",
        imageUrl: darkUrl,
        imageUrlLight: lightUrl,
      });
    } catch (err) {
      results.push({
        slug: article.slug,
        status: "error",
        error: (err as Error).message,
      });
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  return json({
    success: true,
    message: `Generated ${succeeded} illustration pairs (${failed} failed)`,
    generated: succeeded,
    failed,
    results,
  });
}

/**
 * Generate ONLY light variants for articles that have dark but no light.
 * This is the migration path for existing articles.
 * Accepts: { action: "batch-light", limit?: number }
 */
async function handleBatchLight(body: Record<string, unknown>) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return json({ error: "OPENAI_API_KEY not configured" }, 500);
  }

  const db = supabase();
  const limit = (body.limit as number) || 999;

  // Find articles with dark image but no light image
  const { data: articles, error } = await db
    .from("articles")
    .select("slug, title, description, category, hero_image")
    .not("hero_image", "is", null)
    .or("hero_image_light.is.null,hero_image_light.eq.")
    .order("publish_date", { ascending: false })
    .limit(limit);

  if (error) throw error;

  if (!articles || articles.length === 0) {
    return json({
      success: true,
      message: "All articles with dark images already have light variants.",
      generated: 0,
    });
  }

  const results: Array<{ slug: string; status: string; imageUrlLight?: string; error?: string }> = [];

  for (const article of articles) {
    try {
      const lightUrl = await generateAndStore(
        openaiKey, db, article.slug, "light",
        article.title, article.description, article.category
      );

      // Update DB — only the light column
      await db
        .from("articles")
        .update({ hero_image_light: lightUrl })
        .eq("slug", article.slug);

      // Sync to GitHub JSON
      await updateGitHubJson(
        article.slug,
        { heroImageLight: lightUrl },
        `feat: Add light hero image — '${article.slug}'`
      );

      results.push({
        slug: article.slug,
        status: "success",
        imageUrlLight: lightUrl,
      });
    } catch (err) {
      results.push({
        slug: article.slug,
        status: "error",
        error: (err as Error).message,
      });
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  return json({
    success: true,
    message: `Generated ${succeeded} light variants (${failed} failed) out of ${articles.length} articles`,
    generated: succeeded,
    failed,
    total: articles.length,
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
      model: MODELS.ILLUSTRATION,
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
    return `data:image/png;base64,${data.data[0].b64_json}`;
  }

  throw new Error("No image data in OpenAI response");
}
