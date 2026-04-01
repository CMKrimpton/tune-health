import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { MODELS, NARRATION_SETTINGS } from "../_shared/constants.ts";
import { readGitHubJson, updateGitHubJson } from "../_shared/github.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

/**
 * Extract the first paragraph's plain text from article HTML.
 * Strips all HTML tags, returns just the opening paragraph text.
 */
function extractIntroParagraph(html: string): string {
  // Find the first <p>...</p> block
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!match) return "";

  // Strip inner HTML tags (em, strong, a, etc.) to get plain text
  return match[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "generate") {
      return await handleGenerate(body);
    }

    if (action === "batch") {
      return await handleBatch(body);
    }

    return json({ error: "Invalid action. Use 'generate' or 'batch'." }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

/**
 * Generate narration for a single article.
 * Accepts: { action: "generate", slug }
 */
async function handleGenerate(body: Record<string, unknown>) {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    return json({ error: "ELEVENLABS_API_KEY not configured" }, 500);
  }

  const db = supabase();
  const slug = body.slug as string;
  if (!slug) {
    return json({ error: "slug is required" }, 400);
  }

  // Read from GitHub JSON (the deployed page) as primary source.
  // This guarantees the narration always matches what the reader sees,
  // even if the DB has a stale or truncated description.
  const ghJson = await readGitHubJson(slug);

  // DB as fallback for articles not yet on GitHub
  const { data: article, error } = await db
    .from("articles")
    .select("description, title, narration_url")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!article && !ghJson) return json({ error: `Article '${slug}' not found` }, 404);

  // Skip if narration already exists (unless force flag)
  const existingNarration = article?.narration_url || (ghJson?.narrationUrl as string);
  if (existingNarration && !body.force) {
    return json({
      success: true,
      slug,
      narrationUrl: existingNarration,
      message: "Narration already exists",
      skipped: true,
    });
  }

  // GitHub JSON description takes priority — it's what the reader sees
  const description = (ghJson?.description as string) || article?.description;
  const title = (ghJson?.title as string) || article?.title;

  if (!description) {
    return json({ error: `Article '${slug}' has no description` }, 400);
  }

  // Self-heal: if GitHub has a different description than the DB, update the DB
  if (ghJson?.description && article?.description && ghJson.description !== article.description) {
    console.log(`[Narration] DB/GitHub description drift detected for ${slug} — syncing DB`);
    await db.from("articles").update({
      description: ghJson.description as string,
      title: (ghJson.title as string) || article.title,
    }).eq("slug", slug);
  }

  const introText = description.trim();
  if (introText.length < 20) {
    return json({ error: `Description too short for '${slug}'` }, 400);
  }

  console.log(`[Narration] Generating for ${slug} (${introText.length} chars)`);

  // Merge caller-provided voice settings over defaults
  const voiceSettings = body.voiceSettings
    ? { ...NARRATION_SETTINGS, ...(body.voiceSettings as Record<string, unknown>) }
    : { ...NARRATION_SETTINGS };

  // Call ElevenLabs TTS API
  const ttsResponse = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${MODELS.NARRATION_VOICE}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: introText,
        model_id: MODELS.NARRATION_MODEL,
        voice_settings: voiceSettings,
        output_format: "mp3_44100_128",
      }),
    }
  );

  if (!ttsResponse.ok) {
    const errText = await ttsResponse.text();
    throw new Error(`ElevenLabs API error ${ttsResponse.status}: ${errText}`);
  }

  const audioBuffer = await ttsResponse.arrayBuffer();

  // Upload to Supabase Storage
  const storagePath = `narrations/${slug}.mp3`;
  const { error: uploadError } = await db.storage
    .from("article-narrations")
    .upload(storagePath, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // Get the public URL
  const { data: urlData } = db.storage
    .from("article-narrations")
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  // Update the article record
  const { error: updateError } = await db
    .from("articles")
    .update({ narration_url: publicUrl })
    .eq("slug", slug);

  if (updateError) {
    console.warn(`[Narration] DB update failed for ${slug}: ${updateError.message}`);
  }

  // Sync narrationUrl to GitHub JSON so the Astro site can render the audio player
  await updateGitHubJson(slug, { narrationUrl: publicUrl }, `feat: Add narration — '${slug}'`);

  console.log(`[Narration] Generated for ${slug}: ${publicUrl}`);

  return json({
    success: true,
    slug,
    narrationUrl: publicUrl,
    characters: introText.length,
    message: `Narration generated for "${title}"`,
  });
}

/**
 * Generate narrations for all articles missing them.
 * Accepts: { action: "batch", limit?: number, force?: boolean }
 */
async function handleBatch(body: Record<string, unknown>) {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    return json({ error: "ELEVENLABS_API_KEY not configured" }, 500);
  }

  const db = supabase();
  const limit = (body.limit as number) || 20;

  // Merge caller-provided voice settings over defaults
  const voiceSettings = body.voiceSettings
    ? { ...NARRATION_SETTINGS, ...(body.voiceSettings as Record<string, unknown>) }
    : { ...NARRATION_SETTINGS };

  // Get published articles needing narration
  let query = db
    .from("articles")
    .select("slug, title, description, narration_url, updated_at")
    .eq("status", "published");

  if (body.force) {
    // Force-regen: oldest-updated first so each batch makes progress
    query = query.order("updated_at", { ascending: true, nullsFirst: true });
  } else {
    // Normal: only articles missing narration, newest first
    query = query.is("narration_url", null)
      .order("publish_date", { ascending: false });
  }

  const { data: articles, error } = await query.limit(limit);
  if (error) throw error;

  if (!articles || articles.length === 0) {
    return json({
      success: true,
      message: "All articles already have narrations.",
      generated: 0,
    });
  }

  const results: Array<{ slug: string; status: string; characters?: number; error?: string }> = [];

  for (const article of articles) {
    try {
      // Read from GitHub JSON (deployed source of truth) with DB fallback
      const ghJson = await readGitHubJson(article.slug);
      const description = (ghJson?.description as string) || article.description || "";
      const introText = description.trim();
      if (!introText || introText.length < 20) {
        results.push({ slug: article.slug, status: "skipped", error: "No description found" });
        continue;
      }

      // Self-heal DB drift
      if (ghJson?.description && article.description && ghJson.description !== article.description) {
        await db.from("articles").update({ description: ghJson.description as string }).eq("slug", article.slug);
      }

      const ttsResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${MODELS.NARRATION_VOICE}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: introText,
            model_id: MODELS.NARRATION_MODEL,
            voice_settings: voiceSettings,
            output_format: "mp3_44100_128",
          }),
        }
      );

      if (!ttsResponse.ok) {
        const errText = await ttsResponse.text();
        throw new Error(`ElevenLabs ${ttsResponse.status}: ${errText}`);
      }

      const audioBuffer = await ttsResponse.arrayBuffer();

      const storagePath = `narrations/${article.slug}.mp3`;
      const { error: uploadError } = await db.storage
        .from("article-narrations")
        .upload(storagePath, audioBuffer, {
          contentType: "audio/mpeg",
          upsert: true,
        });

      if (uploadError) throw new Error(`Upload: ${uploadError.message}`);

      const { data: urlData } = db.storage
        .from("article-narrations")
        .getPublicUrl(storagePath);

      await db
        .from("articles")
        .update({ narration_url: urlData.publicUrl, updated_at: new Date().toISOString() })
        .eq("slug", article.slug);

      // Sync to GitHub JSON
      await updateGitHubJson(article.slug, { narrationUrl: urlData.publicUrl }, `feat: Add narration — '${article.slug}'`);

      results.push({ slug: article.slug, status: "success", characters: introText.length });
    } catch (err) {
      results.push({ slug: article.slug, status: "error", error: (err as Error).message });
    }

    // Pause between calls to respect rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  return json({
    success: true,
    message: `Generated ${succeeded} narrations (${failed} failed)`,
    generated: succeeded,
    failed,
    results,
  });
}
