import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { MODELS, NARRATION_SETTINGS, FLAT_PRICING } from "../_shared/constants.ts";
import { addCostToLog, addOverheadCost, supabase as createDb } from "../_shared/db.ts";

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
  const logId = body.logId as string | undefined;
  if (!slug) {
    return json({ error: "slug is required" }, 400);
  }

  const { data: article, error } = await db
    .from("articles")
    .select("description, title, narration_url")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!article) return json({ error: `Article '${slug}' not found` }, 404);

  // Skip if narration already exists (unless force flag)
  if (article.narration_url && !body.force) {
    return json({
      success: true,
      slug,
      narrationUrl: article.narration_url,
      message: "Narration already exists",
      skipped: true,
    });
  }

  const description = article.description;
  const title = article.title;

  if (!description) {
    return json({ error: `Article '${slug}' has no description` }, 400);
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

  // Caller can override voice; fall back to default
  const voiceId = (body.voiceId as string) || MODELS.NARRATION_VOICE;

  // Call ElevenLabs TTS API
  const ttsResponse = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
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

  // Append cache-busting timestamp so browsers/CDN serve the new file on regeneration
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  // Update the article record
  const { error: updateError } = await db
    .from("articles")
    .update({ narration_url: publicUrl })
    .eq("slug", slug);

  if (updateError) {
    console.warn(`[Narration] DB update failed for ${slug}: ${updateError.message}`);
  }

  // Log cost — to pipeline log if logId provided, otherwise as system overhead
  if (introText.length > 0) {
    const narrationCost = {
      model: MODELS.NARRATION_MODEL,
      stage: "narration",
      inputTokens: introText.length,
      outputTokens: 0,
      costUsd: Math.round(introText.length * FLAT_PRICING.NARRATION_PER_CHAR_USD * 10000) / 10000,
    };
    try {
      if (logId) {
        await addCostToLog(db, logId, narrationCost);
      } else {
        await addOverheadCost(db, narrationCost);
      }
    } catch (costErr) {
      console.warn(`[Narration] Cost logging failed: ${costErr instanceof Error ? costErr.message : "unknown"}`);
    }
  }

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
 * Fire-and-forget: dispatches individual generate calls with staggered delays
 * so each runs within edge function timeout. Returns immediately with count.
 * Accepts: { action: "batch", limit?: number, force?: boolean, voiceSettings?: object }
 */
async function handleBatch(body: Record<string, unknown>) {
  const db = supabase();
  const limit = (body.limit as number) || 20;

  // Get published articles needing narration
  let query = db
    .from("articles")
    .select("slug, title, description, narration_url, updated_at")
    .eq("status", "published");

  if (body.force) {
    query = query.order("updated_at", { ascending: true, nullsFirst: true });
  } else {
    query = query.is("narration_url", null)
      .order("publish_date", { ascending: false });
  }

  const { data: articles, error } = await query.limit(limit);
  if (error) throw error;

  if (!articles || articles.length === 0) {
    return json({
      success: true,
      message: "All articles already have narrations.",
      dispatched: 0,
    });
  }

  // Fire individual generate calls via self-invocation (staggered to respect rate limits)
  const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-narration`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let dispatched = 0;
  for (const article of articles) {
    const description = article.description || "";
    if (!description.trim() || description.trim().length < 20) continue;

    // Fire-and-forget: don't await the response
    fetch(selfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        action: "generate",
        slug: article.slug,
        force: !!body.force,
        voiceId: body.voiceId || undefined,
        voiceSettings: body.voiceSettings || undefined,
      }),
    }).catch((err) => {
      console.error(`[Narration] Dispatch failed for ${article.slug}: ${(err as Error).message}`);
    });

    dispatched++;

    // Stagger dispatches to respect ElevenLabs rate limits
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`[Narration] Batch dispatched ${dispatched} individual generate calls`);

  return json({
    success: true,
    message: `Dispatched ${dispatched} narrations — they'll generate in the background over ~${Math.ceil(dispatched * 3 / 60)} min.`,
    dispatched,
    slugs: articles.slice(0, dispatched).map((a: { slug: string }) => a.slug),
  });
}
