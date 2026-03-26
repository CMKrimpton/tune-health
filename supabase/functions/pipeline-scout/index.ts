import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, getExistingArticles } from "../_shared/db.ts";
import { VALID_CATEGORIES, classifyCategory } from "../_shared/constants.ts";
import { gemini, grok } from "../_shared/api-clients.ts";
import { extractFingerprint, isDuplicate, buildFingerprints } from "../_shared/dedup.ts";
import type { ApiUsage } from "../_shared/types.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const db = supabase();

  try {
    let body: { scoutModel?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const scoutModel = (body.scoutModel as string) || "gemini";
    const { titles, categoryCounts } = await getExistingArticles(db);

    // Build dedup fingerprints from existing articles + queue
    const fingerprints = await buildFingerprints(db);

    const underserved = Object.entries(categoryCounts).filter(([, c]) => (c as number) / (titles.length || 1) < 0.10).map(([cat]) => cat);
    const missing = VALID_CATEGORIES.filter(c => !categoryCounts[c]);
    const priorityCats = [...new Set([...underserved, ...missing])];

    const scoutPrompt = `Find 20 health stories that will get SHARED by 20-35 year olds. Our readers are smart, health-curious, skeptical of institutions, and live on social media. They're NOT medical professionals. They want to understand their own bodies, optimize their health, and call out industry BS.

## WHAT MAKES A TOPIC WORTH WRITING (ranked)
1. **"Wait, really?"** — challenges something readers believed was true (seed oils, sunscreen, breakfast, moderate drinking)
2. **Personally relevant RIGHT NOW** — affects what they eat today, how they sleep tonight, what supplements they take, their workout routine, their prescriptions
3. **Culturally trending** — debated on TikTok, Reddit, Twitter. Ozempic culture, protein obsession, gut health, longevity biohacking, psychedelics, seed oil discourse, ultra-processed food debates
4. **Follow-the-money exposé** — pharma pricing, supplement fraud, food industry manipulation, insurance denials. Young people are angry about healthcare costs
5. **New science that changes behavior** — not just "interesting mechanism" but "this changes what you should DO"

## TOPICS YOUNG READERS ACTUALLY CARE ABOUT (use as inspiration, not limits)
- Their medications: Ozempic/GLP-1 culture, SSRIs, birth control side effects, Adderall
- Their diet: seed oils, ultra-processed food, protein amounts, artificial sweeteners, alcohol truth, fasting, gut microbiome
- Their fitness: creatine for brain health, VO2 max as mortality predictor, overtraining, zone 2 cardio hype
- Their mental health: psychedelics vs SSRIs, social media and anxiety, burnout biology, ADHD meds
- Their sleep: blue light truth, melatonin evidence, caffeine half-life, sleep trackers accuracy
- Their skin: retinoids, sunscreen chemicals, gut-skin connection, acne and diet
- Things they're being lied to about: supplement industry, wellness influencers, "clean eating" pseudoscience
- Longevity biohacking: rapamycin, NMN/NAD+, cold plunges (evidence vs hype), metformin

## THE SHAREABILITY TEST
For EACH topic, ask: would a 25-year-old text this to a friend? If the answer is "no, this is interesting but I wouldn't share it" — find a better angle or drop the topic. We want topics that make people say "holy shit, did you know this?"

## FORMAT FOR EACH TOPIC
- **Topic**: specific angle a 25-year-old would click on, not a journal article title
- **Why now**: what happened recently that makes this timely?
- **Search demand**: high/medium/low
- **Our angle**: what would make this go viral? What's the "holy shit" moment?
- **Category**: one of ${VALID_CATEGORIES.join(", ")}

## COVERAGE GAPS
${priorityCats.length > 0 ? `Underserved: ${priorityCats.join(", ")}` : "Categories are balanced."}
Frame these for younger readers: cardiology = "your heart at 30", diabetes = "insulin resistance from your diet", liver = "what alcohol/processed food is doing to your liver", addiction = "why you can't stop scrolling/drinking/vaping".

## ALREADY COVERED (${titles.length} articles — avoid these subjects):
${titles.slice(0, 50).map(t => `- ${t.split(" (")[0]}`).join("\n")}${titles.length > 50 ? `\n... and ${titles.length - 50} more (diversify away from neuroscience, mental health, longevity — we have plenty)` : ""}

Number them 1-20. Plain text, no JSON.`;

    let rawFindings: string;
    let scoutCost: ApiUsage;

    if (scoutModel === "gemini") {
      // Gemini with Google Search grounding — best for real-time trending data
      const r = await gemini({ system: "You are a health editorial scout for a publication read by smart 20-35 year olds. Use Google Search to find what's TRENDING in health right now — TikTok health debates, viral studies, Reddit health threads, Google Trends spikes. NOT what doctors find interesting. What young, health-curious people are actually searching for and arguing about. Frame everything for readers who are smart but not medical professionals.", user: scoutPrompt, model: "gemini-2.5-pro", maxTokens: 4000, temperature: 0.5, webSearch: true, timeout: 120000 }, "scout-gemini");
      rawFindings = r.text; scoutCost = r.usage;
    } else if (scoutModel === "grok") {
      // Grok — contrarian perspective, finds what mainstream outlets won't cover
      const r = await grok({ system: "You are a contrarian health scout for readers aged 20-35 who distrust institutions. Use your X/Twitter access. Find: supplement industry fraud young people fall for, pharma pricing that affects their generation, wellness influencer claims that are actually dangerous, inconvenient truths about popular health trends (seed oils, carnivore diet, cold plunges, nootropics). What's being debated on health Twitter/X RIGHT NOW that has real science behind it? What are young people being lied to about?", user: scoutPrompt, maxTokens: 4000, temperature: 0.5 }, "scout-grok");
      rawFindings = r.text; scoutCost = r.usage;
    } else {
      // "Sonnet" scout — now uses Gemini with search grounding (Sonnet web search costs $0.40+/call due to 120K+ input tokens)
      // Gemini search grounding gives the same quality at 1/10th the cost
      const r = await gemini({ system: "You are a health editorial scout for a magazine that young adults actually read. Find the 'wait, really?' stories — where popular belief is WRONG and new evidence proves it. Think: things your health-conscious friend would be shocked to learn. Seed oil science, supplement debunks, exercise myths, medication side effects nobody talks about, diet culture lies backed by industry funding. The second-order insight: not 'new study finds X' but 'everything you were told about Y is wrong, and here's who profited from the lie.'", user: scoutPrompt, model: "gemini-2.5-pro", maxTokens: 4000, temperature: 0.5, webSearch: true, timeout: 120000 }, "scout-sonnet");
      rawFindings = r.text; scoutCost = r.usage;
    }

    // Parse raw findings — flexible parser handles multiple formats from different models
    console.log(`[Scout] Raw output (first 500 chars): ${rawFindings.slice(0, 500)}`);

    const topics: Array<{ topic: string; category: string; why: string; whyNow: string; searchDemand: string }> = [];
    const lines = rawFindings.split("\n").filter(l => l.trim());
    let current: { topic: string; category: string; why: string; whyNow: string; searchDemand: string } | null = null;

    for (const line of lines) {
      // Match numbered lines: "1. ...", "1) ...", "**1.**...", "1: ..."
      const numbered = line.match(/^\*{0,2}\d+[\.\):\-]\*{0,2}\s*(.+)/);
      // Also match "**Topic**: ..." as a new topic start if preceded by a number pattern
      const topicLabel = line.match(/^\s*[-*]*\s*\*{0,2}Topic\*{0,2}\s*[:=]\s*(.+)/i);

      if (numbered || topicLabel) {
        if (current && current.topic) topics.push(current);
        const text = (numbered ? numbered[1] : topicLabel![1]).trim()
          .replace(/\*\*/g, "")
          .replace(/^\s*Topic\s*(?:Description)?\s*:?\s*/i, "")
          .replace(/^\s*[-\u2013\u2014]\s*/, "")
          .trim();
        if (text.length > 10) {
          current = { topic: text, category: "", why: "", whyNow: "", searchDemand: "" };
        }
      } else if (current) {
        const stripped = line.trim().replace(/\*\*/g, "");
        const catLabel = stripped.match(/(?:category|suggested\s*category)\s*[:=]\s*(.+)/i);
        const whyNowLabel = stripped.match(/(?:why\s*now)\s*[:=]\s*(.+)/i);
        const searchLabel = stripped.match(/(?:search\s*demand)\s*[:=]\s*(.+)/i);
        const angleLabel = stripped.match(/(?:our\s*angle|angle|holy\s*shit|viral)\s*[:=]\s*(.+)/i);
        if (catLabel && !current.category) {
          const catName = catLabel[1].trim().replace(/[."']/g, "");
          const match = VALID_CATEGORIES.find(c => catName.toLowerCase().includes(c.toLowerCase()));
          if (match) current.category = match;
        } else if (whyNowLabel && !current.whyNow) {
          current.whyNow = whyNowLabel[1].trim().slice(0, 200);
        } else if (searchLabel && !current.searchDemand) {
          current.searchDemand = searchLabel[1].trim().slice(0, 50);
        } else if (angleLabel && !current.why) {
          current.why = angleLabel[1].trim().slice(0, 200);
        } else if (!current.why && stripped.length > 20) {
          current.why = stripped.slice(0, 200);
        }
      }
    }
    if (current && current.topic) topics.push(current);
    console.log(`[Scout] Parsed ${topics.length} topics from ${lines.length} lines`);

    // Dedup and insert into queue
    let added = 0;
    let dupes = 0;
    for (const t of topics) {
      if (isDuplicate(t.topic, fingerprints)) { dupes++; continue; }
      // Classify category: explicit label → keyword classifier → null
      const cat = t.category
        || classifyCategory(t.topic + " " + (t.why || ""))
        || null;
      // Priority boost for high search demand topics
      const demandLower = (t.searchDemand || "").toLowerCase();
      const priorityBoost = demandLower.includes("high") ? -20 : demandLower.includes("medium") ? -10 : 0;
      await db.from("topic_queue").insert({
        topic: t.topic,
        category: cat,
        notes: `${scoutModel} scout${t.whyNow ? ` | Why now: ${t.whyNow}` : ""}${t.searchDemand ? ` | Search: ${t.searchDemand}` : ""}${t.why ? ` | ${t.why}` : ""}`,
        priority: 50 + priorityBoost, // lower number = higher priority
        source: "trending",
        research_summary: t.whyNow || t.why || null,
      });
      // Add to fingerprints so subsequent topics in same batch don't dupe each other
      fingerprints.push(extractFingerprint(t.topic));
      added++;
    }

    const { count: queueCount } = await db.from("topic_queue").select("*", { count: "exact", head: true }).eq("status", "queued");

    return json({
      success: true,
      stage: "scout",
      scoutModel,
      found: topics.length,
      added,
      duplicatesFiltered: dupes,
      queueSize: queueCount || 0,
      cost: scoutCost.costUsd,
      message: `${scoutModel} scout: found ${topics.length}, added ${added} to queue (${dupes} dupes filtered). Queue: ${queueCount || 0} topics.`,
    });
  } catch (err: unknown) {
    return json({
      error: "An internal error occurred",
      detail: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
