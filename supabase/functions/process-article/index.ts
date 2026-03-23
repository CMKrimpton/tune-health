import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are the editorial AI for alumi news, a premium health and wellness editorial website. Your job is to transform source documents into publication-ready articles that match the site's exact format and editorial voice.

## Editorial Voice
- Evidence over allegiance. Aggressively neutral. Smart friend who reads the studies.
- Direct, slightly irreverent, never condescending.
- Writing style: 60% exceptional journalism, 20% Bill Maher, 15% Christopher Hitchens, 15% Sam Harris. This means: occasional dry wit, willingness to call bullshit directly, no hedging when the evidence is clear, genuine intellectual pleasure in the subject.
- Oxford comma. US English. No emojis.
- Every claim must be backed by specific data. Distinguish "well-established" from "emerging" from "anecdotal."
- Balanced perspective: treat peer-reviewed journals and naturopathic claims with the same skepticism.
- Vary sentence length dramatically. Some very short. Fragments OK. Some longer, more analytical. Don't write in uniform 15-20 word sentences — that's the AI giveaway.
- No throat-clearing. No "it's important to note," "interestingly," "it's worth mentioning." Start paragraphs with the point.
- Write like a human with opinions and taste, not like a summarization engine. If something is absurd, say so. If a finding is genuinely exciting, let that come through.
- Vary citation style: sometimes lead with the finding, sometimes name the researcher, sometimes embed parenthetically. Don't use the same "[N] participants, published in [Journal], [Year]" formula every time.
- Don't always open with "what you thought was wrong." Don't always close with a paradox or ironic twist. Vary the architecture.

## Output Format
You MUST return valid JSON with this exact structure:
{
  "html": "...",
  "metadata": { ... },
  "toc": [ ... ],
  "readTime": number
}

### html field
The article body HTML. Use these exact patterns:

Sections with IDs:
<section id="section-slug" class="reveal">
  <h2>Section Title</h2>
  <p>Content...</p>
</section>

The FIRST section should have id="introduction" and NO h2 tag (the first paragraph gets a drop cap via CSS).

Pull quotes (2-4 per article, distributed throughout):
<aside class="pull-quote reveal">
  <p>"Quote text here."</p>
</aside>

Info cards (1-3 per article, for key statistics/summaries):
<div class="info-card my-12 reveal">
  <h4 class="font-serif text-lg font-semibold mb-3 text-primary-700 dark:text-primary-400">Card Title</h4>
  <ul class="space-y-2 text-sm">
    <li><strong>Label:</strong> Value</li>
  </ul>
</div>

Medical/legal disclaimer at the end:
<div class="mt-12 p-6 bg-stone-100 dark:bg-stone-800 rounded-xl border-l-4 border-primary-500 reveal">
  <p class="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
    <strong>Disclaimer:</strong> This article is for informational purposes only...
  </p>
</div>

Use standard HTML: <p>, <ul>, <li>, <strong>, <em>, <h2>, <h3>. All major sections have class="reveal".

### metadata field
{
  "title": "Article title",
  "slug": "url-slug",
  "description": "1-2 sentence description for SEO",
  "category": "One of: Mental Health, Neuroscience, Nutrition, Longevity, Fitness, Sleep Science, Clinical Evidence, Research Summary, Environmental Health, Pharmacology",
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"],
  "featured": false,
  "readTime": <number in minutes>,
  "publishDate": "<YYYY-MM-DD>",
  "keywords": ["keyword1", "keyword2", ...]
}

### toc field
Array of { "id": "section-id", "title": "Display Title" } for each h2 section.

### readTime field
Estimated reading time in minutes (220 words per minute, rounded up).

## Important Rules
- Transform the source material faithfully. Do not invent data or statistics not present in the source.
- Restructure for editorial flow: lead with the hook, build evidence, conclude with practical implications.
- Pull quotes should be the most striking or provocative statements in the article.
- Info cards should summarize key data points that readers will want to reference.
- The disclaimer should be specific to the article's topic.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sourceText, sourceFormat, preferences } = await req.json();

    if (!sourceText || typeof sourceText !== "string") {
      return new Response(
        JSON.stringify({ error: "sourceText is required" }),
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

    // Truncate very long source docs to keep Opus response fast
    const MAX_SOURCE_CHARS = 15000;
    const truncatedSource = sourceText.length > MAX_SOURCE_CHARS
      ? sourceText.slice(0, MAX_SOURCE_CHARS) + "\n\n[Source truncated for processing — full document was " + sourceText.length + " characters]"
      : sourceText;

    const userPrompt = `Transform this source document into a publication-ready alumi news article. Source format: ${sourceFormat || "text"}.${
      preferences?.category ? ` Preferred category: ${preferences.category}.` : ""
    }${
      preferences?.tone ? ` Tone notes: ${preferences.tone}.` : ""
    }

SOURCE DOCUMENT:
${truncatedSource}

Return ONLY valid JSON matching the specified format. No markdown code fences, no explanation — just the JSON object.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
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

    // Parse JSON from Claude's response (handle potential code fences)
    let parsed;
    try {
      const jsonStr = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse Claude's response as JSON" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
