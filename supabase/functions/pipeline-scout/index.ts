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

    const scoutPrompt = `Find 20 health stories that will ACTUALLY GET READERS. Not just "interesting science" — topics people are actively searching for, talking about, or that just broke in the news cycle.

## WHAT MAKES A TOPIC WORTH WRITING (ranked)
1. **Trending NOW** — it's in the news, on social media, people are Googling it THIS WEEK
2. **Search demand** — thousands of people search for this monthly but existing coverage is bad (WebMD-level, pharma-biased, or outdated)
3. **Counter-narrative** — mainstream says X, new evidence says Y. Readers click because we tell them something their doctor didn't.
4. **Personally relevant** — affects the reader directly (their medication, their diet, their risk factors)
5. **Emotional hook** — makes you angry (industry fraud), hopeful (breakthrough), or surprised (everything you thought was wrong)

## FORMAT FOR EACH TOPIC
For each of the 20 topics, provide ALL of these:
- **Topic**: specific angle, not just a subject area
- **Why now**: what happened in the last 7-30 days that makes this timely? (new study, news event, policy change, viral discussion)
- **Search demand**: estimate whether people are actively searching for this (high/medium/low)
- **Our angle**: how would alumi news cover this differently than WebMD or CNN Health?
- **Category**: one of ${VALID_CATEGORIES.join(", ")}

## COVERAGE GAPS — prioritize these
${priorityCats.length > 0 ? `Underserved: ${priorityCats.join(", ")}` : "Categories are balanced."}
We especially need: cardiology, diabetes/metabolic, kidney disease, liver disease, respiratory, addiction, dermatology, pain science.
DO NOT suggest more neuroscience unless it's genuinely trending.

## ALREADY COVERED (${titles.length} articles — avoid):
${titles.map(t => `- ${t.split(" (")[0]}`).join("\n")}

Number them 1-20. Plain text, no JSON.`;

    let rawFindings: string;
    let scoutCost: ApiUsage;

    if (scoutModel === "gemini") {
      // Gemini with Google Search grounding — best for real-time trending data
      const r = await gemini({ system: "You are a health editorial scout with Google Search access. Your job: find what people are ACTUALLY SEARCHING FOR and TALKING ABOUT in health right now. Prioritize: trending searches, viral studies, policy changes, drug approvals/warnings, and topics where existing online coverage is bad. Our biggest gaps are cardiology, diabetes, kidney/liver disease, respiratory, addiction, and dermatology.", user: scoutPrompt, model: "gemini-2.5-pro", maxTokens: 4000, temperature: 0.5, webSearch: true }, "scout-gemini");
      rawFindings = r.text; scoutCost = r.usage;
    } else if (scoutModel === "grok") {
      // Grok — contrarian perspective, finds what mainstream outlets won't cover
      const r = await grok({ system: "You are a contrarian health editorial scout. Find stories the mainstream DELIBERATELY avoids: industry fraud, regulatory capture, inconvenient clinical data, underfunded research that challenges profitable treatments. Focus on: who profits from the status quo? What data is being buried? Our biggest gaps are cardiology, diabetes, kidney disease, addiction, pain science, and pharmacology. Do NOT default to neuroscience.", user: scoutPrompt, maxTokens: 4000, temperature: 0.5 }, "scout-grok");
      rawFindings = r.text; scoutCost = r.usage;
    } else {
      // "Sonnet" scout — now uses Gemini with search grounding (Sonnet web search costs $0.40+/call due to 120K+ input tokens)
      // Gemini search grounding gives the same quality at 1/10th the cost
      const r = await gemini({ system: "You are a health editorial scout focused on editorial potential. Find stories where the science contradicts popular belief, where there's a strong mechanism discovery, or where a policy failure affects millions. Look for the second-order insight — not just 'new study finds X' but 'new study finds X, which means everything you were told about Y is wrong.' Our biggest gaps are cardiology, diabetes, immunology, kidney/liver disease, respiratory, and musculoskeletal.", user: scoutPrompt, model: "gemini-2.5-pro", maxTokens: 4000, temperature: 0.5, webSearch: true }, "scout-sonnet");
      rawFindings = r.text; scoutCost = r.usage;
    }

    // Parse raw findings — extract topic, category, why now, search demand
    const topics: Array<{ topic: string; category: string; why: string; whyNow: string; searchDemand: string }> = [];
    const lines = rawFindings.split("\n").filter(l => l.trim());
    let current: { topic: string; category: string; why: string; whyNow: string; searchDemand: string } | null = null;

    for (const line of lines) {
      const numbered = line.match(/^\d+[\.\)]\s*(.+)/);
      if (numbered) {
        if (current) topics.push(current);
        const text = numbered[1].trim()
          .replace(/\*\*/g, "")
          .replace(/^\s*Topic\s*(?:Description)?\s*:?\s*/i, "")
          .replace(/^\s*[-\u2013\u2014]\s*/, "")
          .trim();
        current = { topic: text, category: "", why: "", whyNow: "", searchDemand: "" };
      } else if (current) {
        const stripped = line.trim().replace(/\*\*/g, "");
        const catLabel = stripped.match(/(?:category|suggested\s*category)\s*[:=]\s*(.+)/i);
        const whyNowLabel = stripped.match(/(?:why\s*now)\s*[:=]\s*(.+)/i);
        const searchLabel = stripped.match(/(?:search\s*demand)\s*[:=]\s*(.+)/i);
        const angleLabel = stripped.match(/(?:our\s*angle)\s*[:=]\s*(.+)/i);
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
    if (current) topics.push(current);

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
