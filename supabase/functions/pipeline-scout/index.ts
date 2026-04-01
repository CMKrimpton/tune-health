import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, getExistingArticles, addOverheadCost } from "../_shared/db.ts";
import { VALID_CATEGORIES, classifyCategory, MODELS } from "../_shared/constants.ts";
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
1. **"Wait, really?"** — challenges something readers believed was true. NOT "debunking internet trends" — challenging ESTABLISHMENT consensus that turns out to be industry-funded
2. **Follow-the-money exposé** — pharma pricing, seed oil industry capture, supplement fraud, food industry manipulation, insurance denials, industry-funded "scientific consensus." Young people are angry about being lied to by institutions.
3. **Everyday health people actually search for** — common cold, flu, allergies, back pain, headaches, bloating, acid reflux, UTIs, sinus infections, sore throat, ear infections, blood pressure, cholesterol, acne, eczema, eye strain, dental health, period problems, injury recovery. These are the #1 search volume topics. Frame them with our editorial voice — not WebMD recitations but "here's what actually works vs what's industry marketing."
4. **Personally relevant RIGHT NOW** — affects what they eat today, how they sleep tonight, what supplements they take, their workout routine, their prescriptions
5. **Culturally trending** — debated on TikTok, Reddit, Twitter. Ozempic culture, gut health, longevity biohacking, psychedelics, seed oil truth, ultra-processed food exposure
6. **New science that changes behavior** — not just "interesting mechanism" but "this changes what you should DO"

## TOPIC MIX (MANDATORY)
Of your 20 topics, deliver this mix:
- **At least 5 everyday health topics** — conditions millions deal with weekly (colds, allergies, back pain, headaches, digestion, skin, heart basics, women's/men's health). Frame with our voice: what actually works, what's marketing, what your doctor won't tell you
- **At least 5 investigation/exposé topics** — follow the money, industry capture, pharma/food/supplement fraud
- **Up to 10 trending/contrarian/deep topics** — the "holy shit" stories
Do NOT fill all 20 slots with niche deep-dives. A publication needs breadth to serve real readers.

## TOPIC FRAMING (CRITICAL — read every time)
How you frame a topic determines the entire downstream article. BAD framing produces industry PR. GOOD framing produces journalism.

**BAD (defends industry):**
- "The Anti-Seed Oil Movement Has a Problem" (frames critics as the problem)
- "Why Experts Say Seed Oils Are Safe" (uncritical institutional deference)
- "The Science Behind Statin Benefits" (pharma press release)
- "Debunking Supplement Myths" (treats industry consensus as truth)

**GOOD (investigates industry):**
- "Seed Oils: How Cargill and ADM Funded the Science That Defends Their Product" (follows the money)
- "The AHA Gets Millions From the Food Industry. Here's What That Buys." (institutional capture)
- "Statin Trials Hide a Dirty Secret: Who Funds Them" (pharma investigation)
- "Your Supplement Labels Are Legal Fiction. The FDA Doesn't Check." (regulatory failure)

When suggesting industry-related topics: frame them as investigations OF the industry, not neutral "debates" about the product. The story is always WHO PROFITS and WHO FUNDS THE SCIENCE.

## TOPICS YOUNG READERS ACTUALLY CARE ABOUT (use as inspiration, not limits)
- **Everyday body stuff**: common cold (what actually works), allergies (why they're getting worse), back pain (why it's epidemic in 20s-30s), headaches vs migraines, bloating & IBS, acid reflux, UTIs, sinus infections, sore throats, ear infections, eye strain from screens, dental health & heart disease link
- **Heart & metabolic basics**: blood pressure at 30, cholesterol myths, resting heart rate, when to worry about chest pain, pre-diabetes signs
- **Women's health**: periods & pain, PCOS, birth control side effects, UTIs, endometriosis, iron deficiency
- **Men's health**: testosterone truth, prostate basics, hair loss science, fertility
- **Skin**: acne & diet, eczema triggers, retinoids, sunscreen chemicals, gut-skin connection
- Their medications: Ozempic/GLP-1 culture, SSRIs, birth control, Adderall, antibiotics overuse
- Their diet: seed oils, ultra-processed food, protein amounts, artificial sweeteners, alcohol truth, fasting, gut microbiome
- Their fitness: creatine for brain health, VO2 max, overtraining, zone 2 cardio, injury recovery (sprains, tendinitis)
- Their mental health: psychedelics vs SSRIs, social media and anxiety, burnout biology, ADHD meds
- Their sleep: blue light truth, melatonin evidence, caffeine half-life, sleep trackers accuracy
- Things they're being lied to about: supplement industry, wellness influencers, "clean eating" pseudoscience
- Longevity biohacking: rapamycin, NMN/NAD+, cold plunges (evidence vs hype), metformin

## THE SHAREABILITY TEST
For EACH topic, ask: would a 25-year-old text this to a friend OR search for it when they're feeling sick? Both count. "Holy shit, did you know this?" is great for investigations. "Wait, Tylenol doesn't actually work for back pain?" is great for everyday topics. Everyday health topics don't need to be shocking — they need to be USEFUL and framed with our editorial voice (not WebMD recitations).

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
      const r = await gemini({ system: "You are a health editorial scout for a publication whose slogan is 'Evidence. Wherever it leads.' Read by smart, skeptical 20-35 year olds who distrust institutions. Use Google Search to find what's TRENDING in health right now — TikTok health debates, viral studies, Reddit health threads, Google Trends spikes. PRIORITY: find stories where industry funding has corrupted the science, where the 'expert consensus' is paid for, where young people are being lied to by the establishment. Frame topics as INVESTIGATIONS of industry, not neutral debates. When an industry funds the science that defends its product, that IS the story.", user: scoutPrompt, model: MODELS.SCOUT_GEMINI, maxTokens: 4000, temperature: 0.5, webSearch: true, timeout: 120000 }, "scout-gemini");
      rawFindings = r.text; scoutCost = r.usage;
    } else if (scoutModel === "grok") {
      // Grok — contrarian perspective, finds what mainstream outlets won't cover
      const r = await grok({ system: "You are a contrarian health scout for readers aged 20-35 who distrust institutions. Use your X/Twitter access. PRIORITY: find where the establishment is WRONG and industry money is WHY. Seed oil companies fund the AHA to say their product is safe. Pharma companies design trials to hide side effects. Food companies fund nutritionists to defend ultra-processed food. The supplement industry sells $50B of unregulated products. Find the stories where money corrupts science. Also find: wellness influencer claims that are actually dangerous, inconvenient truths about popular health trends. Frame topics as INVESTIGATIONS — 'who profits and who funds the science' — not neutral debates.", user: scoutPrompt, maxTokens: 4000, temperature: 0.5 }, "scout-grok");
      rawFindings = r.text; scoutCost = r.usage;
    } else {
      // "Sonnet" scout — now uses Gemini with search grounding (Sonnet web search costs $0.40+/call due to 120K+ input tokens)
      // Gemini search grounding gives the same quality at 1/10th the cost
      const r = await gemini({ system: "You are a health editorial scout for a magazine whose slogan is 'Evidence. Wherever it leads.' Find the 'wait, really?' stories — where ESTABLISHMENT CONSENSUS is wrong because it's funded by the industry that profits from it. The 'popular belief' that's wrong isn't the Reddit skeptic — it's the AHA recommendation funded by Cargill, the FDA approval fast-tracked by pharma lobbying, the dietary guideline written by industry consultants. Think: seed oil industry capture of nutrition science, pharma-designed trials that hide side effects, food industry funding of nutrition research, supplement companies exploiting regulatory gaps. The second-order insight: not 'debunking internet health trends' but 'the institutions young people trust are funded by the industries they should be questioning, and here's the evidence.'", user: scoutPrompt, model: MODELS.SCOUT_GEMINI, maxTokens: 4000, temperature: 0.5, webSearch: true, timeout: 120000 }, "scout-sonnet");
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

    // Log scout cost to daily overhead
    await addOverheadCost(db, scoutCost);

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
