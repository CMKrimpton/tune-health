import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are the editorial AI for alumi news. You are refining an already-generated article based on the editor's feedback.

## Your Role
- Apply the requested changes to the article HTML and/or metadata
- Maintain the exact same HTML structure (sections with class="reveal", pull-quote, info-card patterns)
- Preserve the editorial voice: evidence-first, aggressively neutral, direct, slightly irreverent
- Return the COMPLETE updated article, not just the changed parts

## Output Format
Return valid JSON:
{
  "html": "complete updated article HTML",
  "metadata": { complete updated metadata object },
  "toc": [updated TOC array],
  "readTime": updated reading time,
  "message": "Brief description of what you changed"
}

Return ONLY valid JSON. No markdown fences, no explanation outside the JSON.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currentHtml, currentMetadata, messages, instruction } = await req.json();

    if (!instruction || !currentHtml) {
      return new Response(
        JSON.stringify({ error: "instruction and currentHtml are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect metadata-only changes to save tokens
    const metadataKeywords = ["title", "headline", "description", "tag", "category", "slug", "keyword", "featured"];
    const lowerInstruction = (instruction as string).toLowerCase();
    const isMetadataOnly = metadataKeywords.some(k => lowerInstruction.includes(k))
      && !lowerInstruction.includes("rewrite") && !lowerInstruction.includes("section")
      && !lowerInstruction.includes("paragraph") && !lowerInstruction.includes("content")
      && !lowerInstruction.includes("add ") && !lowerInstruction.includes("remove ");

    // Build conversation history for context
    const conversationContext = (messages || [])
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n");

    let userPrompt: string;
    let maxTokens: number;

    if (isMetadataOnly) {
      // Metadata-only mode — skip sending full HTML (saves ~70% input tokens)
      userPrompt = `The editor wants to change METADATA ONLY. Do not modify the article HTML or TOC.

CURRENT METADATA:
${JSON.stringify(currentMetadata, null, 2)}

${conversationContext ? `CONVERSATION HISTORY:\n${conversationContext}\n` : ""}
EDITOR'S INSTRUCTION:
${instruction}

Return JSON with: the ORIGINAL html field value set to "[unchanged]", updated metadata, original toc, original readTime, and a message describing what you changed.`;
      maxTokens = 2000;
    } else {
      // Full refinement mode — send everything
      userPrompt = `Here is the current article state:

METADATA:
${JSON.stringify(currentMetadata, null, 2)}

ARTICLE HTML:
${currentHtml}

${conversationContext ? `CONVERSATION HISTORY:\n${conversationContext}\n` : ""}
EDITOR'S INSTRUCTION:
${instruction}

Apply the requested changes and return the complete updated article as JSON.`;
      maxTokens = 16000;
    }

    // Try Claude first, fall back to Grok, then Gemini
    let content: string | null = null;
    let lastError = "";

    // Attempt 1: Claude Sonnet (fast, good at editing)
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, temperature: 0.3, system: SYSTEM_PROMPT, messages: [{ role: "user", content: userPrompt }] }),
        signal: AbortSignal.timeout(135_000),
      });
      if (res.ok) {
        const data = await res.json();
        content = data.content?.[0]?.text || null;
      } else {
        lastError = `Claude ${res.status}: ${(await res.text()).slice(0, 200)}`;
      }
    } catch (e: unknown) { lastError = e instanceof Error ? e.message : "Claude failed"; }

    // Attempt 2: Grok
    if (!content) {
      const xaiKey = (Deno.env.get("XAI_API_KEY") || "").trim();
      if (xaiKey) {
        try {
          const res = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + xaiKey },
            body: JSON.stringify({ model: "grok-3", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }], max_tokens: maxTokens, temperature: 0.3 }),
            signal: AbortSignal.timeout(135_000),
          });
          if (res.ok) {
            const data = await res.json();
            content = data.choices?.[0]?.message?.content || null;
          } else { lastError = `Grok ${res.status}`; }
        } catch (e: unknown) { lastError = e instanceof Error ? e.message : "Grok failed"; }
      }
    }

    // Attempt 3: Gemini
    if (!content) {
      const googleKey = (Deno.env.get("GOOGLE_API_KEY") || "").trim();
      if (googleKey) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: "user", parts: [{ text: userPrompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 } }),
            signal: AbortSignal.timeout(120_000),
          });
          if (res.ok) {
            const data = await res.json();
            content = (data.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
          } else { lastError = `Gemini ${res.status}`; }
        } catch (e: unknown) { lastError = e instanceof Error ? e.message : "Gemini failed"; }
      }
    }

    if (!content) {
      return new Response(
        JSON.stringify({ error: `All models failed. Last: ${lastError}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed;
    try {
      const jsonStr = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For metadata-only changes, restore original HTML
    if (isMetadataOnly && parsed.html === "[unchanged]") {
      parsed.html = currentHtml;
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
