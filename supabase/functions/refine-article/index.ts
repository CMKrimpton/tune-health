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
  "svg": "updated SVG if changed, or the original",
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

    // Build conversation history for context
    const conversationContext = (messages || [])
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n");

    const userPrompt = `Here is the current article state:

METADATA:
${JSON.stringify(currentMetadata, null, 2)}

ARTICLE HTML:
${currentHtml}

${conversationContext ? `CONVERSATION HISTORY:\n${conversationContext}\n` : ""}
EDITOR'S INSTRUCTION:
${instruction}

Apply the requested changes and return the complete updated article as JSON.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error: ${response.status}`, detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content returned from Claude" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed;
    try {
      const jsonStr = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse response", raw: content.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
