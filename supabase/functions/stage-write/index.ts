import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addCostToLog, safeStage } from "../_shared/db.ts";
import { generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { VALID_CATEGORIES, getCategoryGradient, pickWriterModel } from "../_shared/constants.ts";
import { todayISO } from "../_shared/astro.ts";

// ---------------------------------------------------------------------------
// Article Writer
// ---------------------------------------------------------------------------
const ARTICLE_WRITING_PROMPT = `You are a senior health journalist at alumi news. Slogan: "Evidence. Wherever it leads." Follow the editorial brief precisely.

## VOICE
Write at the level of the best long-form magazine journalism — The Atlantic, Vanity Fair, NYT Magazine, WSJ features — with the moral clarity of Hitchens, the uncomfortable honesty of Bill Maher, the intellectual precision of Sam Harris, the investigative accountability of 60 Minutes (make institutions answer for themselves, ask the question everyone is thinking), the deep-build structure of PBS Frontline (patient, multi-source investigation that constructs an airtight case — and openings that drop you into the stakes before you know the subject), and the revelatory curiosity of Veritasium (make complex science feel like a discovery, not a lecture — open with what surprises, not what summarizes). The prose should feel effortless and authoritative — the kind of writing where a reader forgets they're reading because the sentences carry them forward.

You are NOT writing Wikipedia. Every paragraph needs personality, rhythm, opinion. Max 3 sentences per paragraph. Vary sentence length dramatically — follow a long, complex analytical sentence with a short verdict that lands like a hammer. Monotonous sentence length is the single clearest sign of mediocre prose. Use everyday analogies drawn from ordinary life, not from other scientific fields. Take clear editorial positions. Name who profits from the status quo.

The article must have GEAR CHANGES — shifts in emotional temperature. Not every paragraph can be calm analysis. There must be moments where the writing gets angry, uncomfortable, or surprising. If the emotional register never shifts, the article will bore smart readers regardless of how accurate it is. At least one paragraph should be striking enough that a reader would share it with someone.

## EDITORIAL INDEPENDENCE
You are a journalist, not a PR department. Investigate the assigned angle honestly. Never preemptively defend an institution because your training data treats it as sacred. If evidence shows institutional failure, say so. Be fair to the evidence, not to institutions. False equivalence -- giving equal weight to a well-supported finding and an industry talking point -- is not fairness. When the evidence is clear, say so clearly.

## EVIDENCE RULES
- YOUR TRAINING DATA IS NOT THE TRUTH. The research provided IS the truth for this article.
- Never fabricate statistics, study names, or citations. Use ONLY the research data below.
- Name every study: journal, year, sample size. Never write "studies show" without specifying which.
- Name the funder when they have a financial interest in the outcome.
- Prefer the most recent evidence over the most famous. A 2024 meta-analysis outranks a famous 1980s cohort.
- If research is thin, write a shorter article. 1,200 words with 5 verified claims beats 2,400 with fabricated ones.
- Common dogma traps: omega-3/6 ratios, saturated fat absolutism, BMI reliability, "breakfast is essential", moderate alcohol benefits, generic probiotics, "natural = better".

## BANNED
Phrases: "let's explore", "let's dive in", "let's break this down", "let's unpack", "picture this", "think of your", "think of it as", "hidden in plain sight", "marvel of biology", "game-changer", "paradigm shift", "the honest answer is", "what is not in dispute", "in short", "what emerges from the research", "the research has produced", "this is not a theoretical construct", "it's important to note", "it's worth mentioning", "interestingly", "remarkably", "fascinatingly", "it turns out", "buckle up", "here's the thing", "moreover", "furthermore", "additionally", "the mechanism by which", "growing body of evidence", "the landscape is evolving", "imagine a", "imagine you".
Structures: Don't open with scene-setting vignettes (unless storyteller preset). Don't end every article with a paradox. Vary citation style — don't always use "[N] participants, published in [Journal]" format.

## SECTION HEADINGS (h2)
No two headers should start with the same word or follow the same syntactic pattern. If you notice headers falling into a repetitive structure — any repeated opener, any repeated grammatical form — rewrite until each one has a distinct structure. Mix questions, imperatives, noun phrases, and provocative statements. Every section header must be specific to THIS article's argument — if you could swap it onto a different article about the same broad topic without anyone noticing, it is too generic. Headers that merely name a category of information should be replaced with headers that name what the section actually argues or reveals.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "html": "<article body sections — see format below>",
  "metadata": {
    "title": "headline from editorial brief",
    "slug": "slug from editorial brief",
    "description": "description from editorial brief — MUST be complete sentences",
    "category": "one of: Neuroscience, Mental Health, Longevity, Clinical Evidence, Environmental Health, Nutrition, Fitness, Sleep Science, Pharmacology",
    "tags": ["5 tags"],
    "featured": false,
    "readTime": <minutes at 220wpm>,
    "publishDate": "${todayISO()}",
    "keywords": ["5 keywords"]
  },
  "toc": [{"id": "section-id", "title": "Display Title"}],
  "readTime": <number>
}

### HTML structure
<section id="introduction" class="reveal"><p>First paragraph (no h2 — CSS drop cap).</p></section>
<section id="section-slug" class="reveal"><h2>Section Title</h2><p>Content...</p></section>
<aside class="pull-quote reveal"><p>"Striking quote."</p></aside>
<div class="data-callout reveal"><p><strong>Methodology note title</strong></p><p>Context, caveats, or methodology notes go here.</p></div>
<section id="sources"><h2>Sources</h2><ul><li>Author. "Title." <em>Journal</em>, Year.</li></ul></section>
<div class="data-callout reveal"><p><strong>Disclaimer:</strong> This article is for informational purposes only and does not constitute medical advice.</p></div>

### CRITICAL HTML RULES
- NEVER use inline style="" attributes. All styling comes from CSS classes.
- NEVER use hardcoded colors (hex values, rgb, etc.) in HTML.
- Only use these CSS classes: "reveal", "pull-quote", "data-callout", "info-card".
- Tailwind utility classes are allowed only for spacing (mt-12, p-6, etc.).`;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { logId } = await req.json();
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();

    // Atomic CAS: claim this article. Only ONE instance can transition editor_approved → writing.
    const { data: claimed } = await db
      .from("daily_article_log")
      .update({ status: "writing", stage_started_at: new Date().toISOString() })
      .eq("id", logId)
      .eq("status", "editor_approved")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      return json({ skipped: true, logId, message: "Another instance already claimed this article" });
    }

    const stageResult = await safeStage(db, logId, "write", async () => {
      // Read research data from DB
      const { data: logEntry } = await db
        .from("daily_article_log")
        .select("research_data")
        .eq("id", logId)
        .maybeSingle();

      if (!logEntry?.research_data) {
        throw new Error("No research data found for this logId");
      }

      const researchData = logEntry.research_data as Record<string, unknown>;
      const today = todayISO();
      const editorBrief = researchData._editorBrief as Record<string, unknown>;
      const brief = editorBrief?.brief as Record<string, unknown> | undefined;
      const models = pickWriterModel();

      // Track initial model choice (CAS already set status to "writing")
      await db.from("daily_article_log").update({ model_used: models[0] }).eq("id", logId);

      const archetype = (editorBrief?.archetype as string) || "deep-investigation";
      const wordCount = editorBrief?.wordCount as { min?: number; max?: number } | undefined;
      const wordMin = wordCount?.min || 1800;
      const wordMax = wordCount?.max || 2200;

      const articleUserPrompt = `Write an article following this editorial brief from the Senior Editor. The archetype and voice modulation are critical -- they determine the article's form, not just its content.

## EDITORIAL BRIEF
Working headline (you may improve this — max 10 words, one sentence): ${editorBrief?.headline || researchData.headline_draft}
Slug: ${editorBrief?.slug || "auto-generate"}
Description: ${editorBrief?.description || "Write a compelling 2-3 sentence description"}
Angle: ${editorBrief?.angle || "Follow the research"}
Category: ${editorBrief?.categoryOverride || researchData.category}

### Article Form
Archetype: ${archetype}
Tone preset: ${brief?.tonePreset || "smart-casual"} — Same voice, different gear. Follow this preset precisely — it controls how much editorial energy the prose carries.
Word count target: ${wordMin}-${wordMax} words
Density: ${brief?.density || "balanced"}
Pacing: ${brief?.pacing || "slow-build"}

### Writer's Direction
Tone: ${brief?.tone || "Standard editorial voice"}
Open with: ${brief?.openWith || "A compelling hook"}
Emphasize: ${((brief?.emphasize as string[]) || []).map((e: string) => `- ${e}`).join("\n") || "Key findings"}
Avoid: ${((brief?.avoid as string[]) || []).map((a: string) => `- ${a}`).join("\n") || "Clichés and filler"}
${((brief?.dogmaWarnings as string[]) || []).length > 0 ? `\n### DOGMA WARNINGS (from the editor — DO NOT IGNORE)\n${((brief?.dogmaWarnings as string[]) || []).map((w: string) => `⚠️ ${w}`).join("\n")}\n` : ""}Closing direction: ${brief?.closingDirection || "End with honest unknowns"}
Structural notes: ${brief?.structuralNotes || "Use your judgment based on the archetype"}

## RESEARCH DATA
Topic: ${researchData.topic}
Key findings:
${((researchData.keyFindings as string[]) || []).map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")}

Studies:
${((researchData.studies as Array<{ title: string; journal: string; year: string; finding: string }>) || []).map((s) => `- "${s.title}" (${s.journal}, ${s.year}): ${s.finding}`).join("\n")}

Mechanism: ${(researchData.mechanism as string) || "Research and explain."}

Counter-arguments:
${((researchData.counterArguments as string[]) || []).map((c: string) => `- ${c}`).join("\n")}

Expert positions:
${((researchData.expertQuotes as string[]) || []).join("\n")}

Key statistics:
${((researchData.statistics as string[]) || []).join("\n")}

Today's date: ${today}

IMPORTANT: Use the slug from the editorial brief exactly. You may improve the headline (max 10 words, one sentence — no two-part kickers) and description if you can genuinely do better. Return ONLY valid JSON.

CRITICAL STRUCTURE RULE: Every article MUST have a proper ending. The last section should be a conclusion, sign-off, or forward-looking closing — NOT an abrupt stop mid-thought. If you're running low on space, cut a middle section shorter rather than omitting the ending. A missing conclusion is worse than a shorter article. Follow the closing direction from the editorial brief.

## EDITORIAL DIRECTIVES (from the Editor-in-Chief — non-negotiable)

**FOLLOW THE MONEY**: Before you write a single word, ask yourself: who profits from the current consensus on this topic? Insurance companies? Pharma manufacturers? Supplement brands? Hospital systems? Testing labs? Food industry? Name them in the article. Every health topic has a financial angle — if you can't find one, you haven't looked hard enough. This is not optional.

**TAKE POSITIONS**: This article must contain at least 2 clear editorial opinions — not hedged suggestions, not "some experts believe," but actual verdicts. "Doctors are undertesting." "The standard of care is outdated." "This industry profits from your confusion." If you can only explain without ever judging, you are writing an encyclopedia, not journalism.

**EARN THE BILL MAHER MOMENT**: Somewhere in this article, say the thing a hospital pamphlet never would. The uncomfortable observation. The pointed question about who benefits from keeping patients uninformed. The moment where you drop the neutral voice and speak directly. This is what makes our readers come back.

**DESCRIPTION MUST BE COMPLETE**: The description field must be 2-3 complete, compelling sentences. Never truncate mid-sentence. This appears in search results and social cards — a cut-off description looks broken and unprofessional.`;

      // Limit to 2 models — 3 × 75s = 225s > 150s edge function timeout
      const { text: articleRaw, usage: writeUsage, modelUsed } = await generateWithFallback({
        system: ARTICLE_WRITING_PROMPT,
        user: articleUserPrompt,
        models: models.slice(0, 2),
        maxTokens: 16384,
        temperature: 0.5,
        stage: "write",
        webSearch: false, // Writing stage — no search grounding (breaks Gemini JSON output)
      });
      await addCostToLog(db, logId, writeUsage);

      // Track which model actually wrote this article
      await db.from("daily_article_log").update({ model_used: modelUsed }).eq("id", logId);

      const article = parseClaudeJSON(articleRaw) as {
        html: string;
        metadata: Record<string, unknown>;
        toc: { id: string; title: string }[];
        readTime: number;
      };

      const slug = (editorBrief?.slug as string) || (article.metadata.slug as string);
      const readTime = article.readTime || (article.metadata.readTime as number) || 10;

      // Writer's title wins if they improved it; fall back to editor's headline
      if (!article.metadata.title && editorBrief?.headline) article.metadata.title = editorBrief.headline as string;
      // Writer's description wins if they improved it; fall back to editor's
      if (!article.metadata.description && editorBrief?.description) article.metadata.description = editorBrief.description as string;
      // Slug always comes from editor (URL stability)
      if (editorBrief?.slug) article.metadata.slug = editorBrief.slug as string;

      // Guard against truncated descriptions (from token-limit JSON repair)
      const desc = (article.metadata.description as string) || "";
      if (desc.length < 80 || !/[.!?]["')\u2019]?\s*$/.test(desc.trim())) {
        console.warn(`[Write] ⚠️ Description appears truncated (${desc.length} chars, no terminal punctuation): "${desc.slice(-50)}"`);
        // Fall back to editor brief description if available, otherwise mark it
        if (editorBrief?.description && (editorBrief.description as string).length > desc.length) {
          article.metadata.description = editorBrief.description as string;
          console.log(`[Write] Restored description from editor brief`);
        }
      }

      // Sanitize category to valid values only
      const rawCat = (editorBrief?.categoryOverride as string) || (article.metadata.category as string) || (researchData.category as string) || "";
      article.metadata.category = VALID_CATEGORIES.find(c => rawCat.toLowerCase().includes(c.toLowerCase())) || "Clinical Evidence";

      // Deterministic gradient + minimal SVG (no AI tokens wasted)
      const categoryStr = article.metadata.category as string;
      const gradient = getCategoryGradient(categoryStr);
      article.metadata.gradient = gradient;

      // Save article to database as draft (editor QC hasn't happened yet)
      const dbArticle = {
        slug,
        title: article.metadata.title as string,
        description: article.metadata.description as string,
        category: categoryStr || (researchData.category as string),
        tags: (article.metadata.tags as string[]) || [],
        keywords: (article.metadata.keywords as string[]) || [],
        gradient_from: gradient.from,
        gradient_to: gradient.to,
        featured: false,
        draft: true, // Draft until editor QC approves
        coming_soon: false,
        read_time: readTime,
        publish_date: today,
        article_html: article.html,
        toc: article.toc,
        source_text: `[Article Agent — ${today}]\nTopic: ${researchData.topic}\nEditor: ${editorBrief?.headline || "No brief"}`,
        status: "draft" as const,
      };

      const { error: dbError } = await db
        .from("articles")
        .upsert(dbArticle, { onConflict: "slug" })
        .select()
        .single();

      if (dbError) throw new Error(`DB save failed: ${dbError.message}`);

      await db
        .from("daily_article_log")
        .update({
          slug,
          title: article.metadata.title as string,
          status: "written",
          research_data: {
            ...researchData,
            _article: {
              metadata: article.metadata,
              html: article.html,
              toc: article.toc,
              readTime,
            },
          },
        })
        .eq("id", logId);
    });

    if (!stageResult.ok) {
      return json({ error: stageResult.error, logId }, 500);
    }

    return json({ success: true, logId, status: "written" });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
