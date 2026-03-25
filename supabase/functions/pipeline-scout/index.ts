import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, getExistingArticles } from "../_shared/db.ts";
import { VALID_CATEGORIES, classifyCategory } from "../_shared/constants.ts";
import { claude, gemini, grok } from "../_shared/api-clients.ts";
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

    // Get existing queue + articles for dedup
    const { data: existingArticles } = await db.from("articles").select("title, slug, keywords, tags, description, category").eq("status", "published");
    const { data: queuedItems } = await db.from("topic_queue").select("topic").in("status", ["queued", "assigned", "in_progress"]);

    // Build dedup fingerprints (same logic as editor stage)
    const STOP_WORDS_SCOUT = new Set([
      "that", "this", "with", "from", "have", "been", "your", "what", "when", "just",
      "more", "most", "than", "also", "about", "into", "does", "will", "could", "would",
      "should", "every", "their", "these", "those", "some", "other", "only", "first",
      "health", "study", "research", "evidence", "science", "brain", "body", "human",
      "people", "patients", "treatment", "medical", "clinical", "risk", "effect",
      "effects", "years", "shows", "found", "actually", "problem", "really", "new",
    ]);
    function scoutExtract(text: string): Set<string> {
      return new Set(text.toLowerCase().split(/[\s\-:,\u2014\u2013.'"?!()]+/).filter(w => w.length > 3 && !STOP_WORDS_SCOUT.has(w)));
    }
    const fingerprints: Set<string>[] = [];
    for (const a of (existingArticles || []) as Array<{ title: string; slug: string; keywords: string[] | null; tags: string[] | null; description: string | null }>) {
      fingerprints.push(scoutExtract([a.title, (a.slug || "").replace(/-/g, " "), ...(a.keywords || []), ...(a.tags || []), a.description || ""].join(" ")));
    }
    for (const q of (queuedItems || []) as Array<{ topic: string }>) {
      fingerprints.push(scoutExtract(q.topic));
    }
    function isScoutDupe(topic: string): boolean {
      const words = scoutExtract(topic);
      if (words.size === 0) return false;
      for (const fp of fingerprints) {
        if (fp.size === 0) continue;
        const overlap = [...words].filter(w => fp.has(w)).length;
        const reverse = [...fp].filter(w => words.has(w)).length;
        if (Math.max(overlap / words.size, reverse / fp.size) >= 0.30 && overlap >= 2) return true;
      }
      return false;
    }

    const underserved = Object.entries(categoryCounts).filter(([, c]) => (c as number) / (titles.length || 1) < 0.10).map(([cat]) => cat);
    const missing = VALID_CATEGORIES.filter(c => !categoryCounts[c]);
    const priorityCats = [...new Set([...underserved, ...missing])];

    const scoutPrompt = `Find 20 compelling, evidence-based health stories. Mix of recent (last 30 days) and landmark (last 5 years). Every topic must be backed by real studies — no celebrity health, no supplement hype.

PRIORITY CATEGORIES (need more articles): ${priorityCats.join(", ") || "all balanced"}

## CRITICAL COVERAGE GAPS — at least 8 of your 20 topics MUST come from these underserved subjects:
Our collection is heavily skewed toward Neuroscience (23%) and Clinical Evidence (31%). The following subjects have ZERO or near-zero coverage and urgently need articles:

**Zero coverage (top priority — find multiple topics in these):**
- Cardiology / cardiovascular disease (heart failure, atherosclerosis, hypertension, statin debate — #1 killer worldwide, we have NOTHING)
- Diabetes / metabolic syndrome (type 2 diabetes mechanisms, insulin resistance, GLP-1 beyond weight loss)
- Immunology / immune system biology (beyond vaccines — autoimmune mechanisms, allergy science, immune aging)
- Kidney disease / nephrology (CKD affects 1 in 7 adults — completely absent)
- Liver disease / hepatology (NAFLD/MASLD affects 25% of adults globally — completely absent)
- Respiratory / pulmonary (asthma, COPD, long COVID pulmonary effects)
- Musculoskeletal / rheumatology (arthritis, back pain, lupus, fibromyalgia)
- Addiction biology (alcohol neuroscience, behavioral addiction, stimulant pharmacology)
- Prostate health / male reproductive health (most common cancer in men — zero coverage)
- Pain science / neuropathic pain mechanisms
- Dermatology (psoriasis, eczema, wound healing, skin-gut axis)
- Pediatric health (childhood development, pediatric conditions)

**Underdeveloped categories (need 3-4x more articles):**
- Nutrition: missing fasting science, protein and aging, hydration, alcohol metabolism, micronutrient deficiencies (vitamin D, iron, B12), artificial sweeteners, seed oils debate
- Fitness: missing VO2 max as mortality predictor, strength training and mortality data, exercise dose-response for mental health, mobility science, overtraining
- Sleep Science: missing circadian disruption and metabolic disease, sleep apnea, melatonin evidence, shift work health effects
- Longevity: missing caloric restriction evidence, NAD+/NMN data, blue zones (real vs myth), rapamycin/metformin off-label use, telomere biology
- Pharmacology: missing psychedelic therapy (psilocybin, MDMA, ketamine), polypharmacy in elderly, drug pricing mechanisms, generic vs brand bioequivalence

DO NOT give me 15 more neuroscience or brain mechanism articles. We have 23 of those. Diversify.

ALREADY COVERED (${titles.length} articles — avoid these subjects):
${titles.map(t => `- ${t.split(" (")[0]}`).join("\n")}

For each topic return: a one-line topic description, suggested category, and why it matters. Number them 1-20. Plain text, no JSON.`;

    let rawFindings: string;
    let scoutCost: ApiUsage;

    if (scoutModel === "gemini") {
      const r = await gemini({ system: "You are a health science researcher with access to Google Search. Find the most compelling stories. Prioritize recent meta-analyses, large cohort studies, and findings that challenge conventional wisdom. IMPORTANT: Our collection is overweight in neuroscience and brain science — actively seek out cardiology, diabetes, immunology, kidney disease, liver disease, respiratory, and musculoskeletal topics. These are the biggest gaps.", user: scoutPrompt, maxTokens: 4000, temperature: 0.5 }, "scout-gemini");
      rawFindings = r.text; scoutCost = r.usage;
    } else if (scoutModel === "grok") {
      const r = await grok({ system: "You are a health science researcher. Find stories the mainstream misses — contrarian findings, underfunded research, industry-inconvenient data. Prioritize independence and surprise. IMPORTANT: Our collection badly needs cardiology, diabetes/metabolic, immunology, addiction biology, pain science, and pharmacology topics. We have almost nothing in these areas. Do NOT default to neuroscience — we have 23 of those already.", user: scoutPrompt, maxTokens: 4000, temperature: 0.5 }, "scout-grok");
      rawFindings = r.text; scoutCost = r.usage;
    } else {
      // Sonnet scout with web search — fall back to Gemini if Claude spending limit hit
      try {
        const r = await claude({ system: "You are a health science researcher. Find stories with strong evidence and editorial potential. Look for mechanism discoveries, policy failures, and emerging fields. IMPORTANT: Our biggest coverage gaps are cardiology (zero articles on #1 killer), diabetes/metabolic syndrome, immunology, kidney/liver disease, respiratory, musculoskeletal, addiction, and dermatology. At least half your suggestions should address these gaps. Do NOT over-index on neuroscience or brain mechanism stories — we have 23 of those.", user: scoutPrompt, model: "claude-sonnet-4-6", maxTokens: 4000, temperature: 0.5, webSearch: true, maxSearches: 8 }, "scout-sonnet");
        rawFindings = r.text; scoutCost = r.usage;
      } catch (scoutErr: unknown) {
        const errMsg = scoutErr instanceof Error ? scoutErr.message : "";
        if (errMsg.includes("SPENDING_LIMIT") || errMsg.includes("usage limits") || errMsg.includes("rate_limit")) {
          console.log("[Scout fallback] Claude spending limit, falling back to Gemini for Sonnet scout...");
          const r = await gemini({ system: "You are a health science researcher. Find stories with strong evidence and editorial potential. Look for mechanism discoveries, policy failures, and emerging fields. IMPORTANT: Our biggest coverage gaps are cardiology, diabetes/metabolic, immunology, kidney/liver disease, respiratory, and musculoskeletal. Prioritize these over neuroscience.", user: scoutPrompt, maxTokens: 4000, temperature: 0.5 }, "scout-sonnet-fallback");
          rawFindings = r.text; scoutCost = r.usage;
        } else {
          throw scoutErr;
        }
      }
    }

    // Parse raw findings directly — no expensive Sonnet structuring step.
    // The editor brief stage (during produce) handles editorial scoring.
    // Simple extraction: split by numbered lines, clean up.
    const topics: Array<{ topic: string; category: string; why: string }> = [];
    const lines = rawFindings.split("\n").filter(l => l.trim());
    let current: { topic: string; category: string; why: string } | null = null;

    for (const line of lines) {
      const numbered = line.match(/^\d+[\.\)]\s*(.+)/);
      if (numbered) {
        if (current) topics.push(current);
        // Strip Grok markdown formatting: **bold**, *italic*, "Topic Description:" prefix
        const text = numbered[1].trim()
          .replace(/\*\*/g, "")
          .replace(/^\s*Topic\s*Description\s*:?\s*/i, "")
          .replace(/^\s*[-\u2013\u2014]\s*/, "")
          .trim();
        current = { topic: text, category: "", why: "" };
      } else if (current) {
        const stripped = line.trim().replace(/\*\*/g, "");
        // Check if this line has an explicit "Category: X" label
        const catLabel = stripped.match(/(?:category|suggested\s*category)\s*[:=]\s*(.+)/i);
        if (catLabel && !current.category) {
          const catName = catLabel[1].trim().replace(/[."']/g, "");
          const match = VALID_CATEGORIES.find(c => catName.toLowerCase().includes(c.toLowerCase()));
          if (match) current.category = match;
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
      if (isScoutDupe(t.topic)) { dupes++; continue; }
      // Classify category: explicit label → keyword classifier → null
      const cat = t.category
        || classifyCategory(t.topic + " " + (t.why || ""))
        || null;
      await db.from("topic_queue").insert({
        topic: t.topic,
        category: cat,
        notes: `${scoutModel} scout: ${t.why || ""}.`,
        priority: 50,
        source: "trending",
        research_summary: t.why || null,
      });
      // Add to fingerprints so subsequent topics in same batch don't dupe each other
      fingerprints.push(scoutExtract(t.topic));
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
