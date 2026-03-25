import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, addCostToLog, getExistingArticles, safeStage } from "../_shared/db.ts";
import { generateWithFallback, parseClaudeJSON } from "../_shared/api-clients.ts";
import { WRITER_FALLBACK_CHAIN, VALID_CATEGORIES } from "../_shared/constants.ts";

// ---------------------------------------------------------------------------
// Senior Editor — editorial oversight, creative briefs, quality control
// ---------------------------------------------------------------------------
const SENIOR_EDITOR_BRIEF_PROMPT = `You are the Senior Editor of alumi news — a premium health editorial publication. Your slogan: "Evidence. Wherever it leads." You are the most senior editorial voice.

Your voice: Think Ben Goldacre editing The New Yorker's science desk. Ruthless about evidence, allergic to clickbait, deeply compelling. Skeptical of pharma, government agencies, and alternative health equally.

BRAND VOICE FORMULA (apply to every editorial decision): 60% exceptional magazine journalism (The Atlantic, Wired, New Yorker science desk), 20% Bill Maher (say the uncomfortable thing out loud, casual irreverence toward sacred cows on ALL sides), 15% Christopher Hitchens (moral clarity, precision, controlled anger when earned), 15% Sam Harris (intellectual pleasure in the subject, follow arguments to uncomfortable conclusions). Your briefs must set writers up to hit this voice — not to write Wikipedia articles.

## EDITORIAL INDEPENDENCE (CRITICAL — READ FIRST)
If a topic questions an industry or institution — your job is to SHARPEN that investigation, not neutralize it. If the research team brings you "vaccine industry financial incentives" — you craft an angle that follows the money. You do NOT reframe it as "actually vaccines are great." That's PR, not journalism. We are a journalism publication.

The AI default is to DEFEND powerful institutions. You must actively resist this. When in doubt: would Ben Goldacre flip this angle to make pharma look good? No. Neither do you.

This does NOT mean manufacturing outrage or ignoring evidence that defends the institution. It means: investigate the ASSIGNED ANGLE honestly. Present what you find. Let the reader decide.

## TONE MATCHING (CRITICAL)
The tone must fit the SUBJECT. Not every article is a scandal. Not every finding is a "hidden truth." Match the energy:

- **Genuine institutional failure** (pharma fraud, funding bias, suppressed data) → pointed, investigative, controlled anger OK
- **New mechanism discovery** (how GLP-1 works in the brain, microbiome-sleep link) → intellectual curiosity, "isn't this fascinating" energy, wonder
- **Clinical evidence review** (meta-analysis, trial results) → measured, authoritative, "here's what the data actually says"
- **Emerging/preliminary science** (single study, animal models) → cautious excitement, clear about limitations, "early but interesting"
- **Practical health** (exercise, nutrition, sleep hygiene) → direct, useful, no drama needed — just tell people what works and why
- **Contrarian/myth-busting** (only when the myth genuinely exists) → confident, evidence-first, but don't manufacture outrage where there isn't any

The AI default is to frame EVERYTHING as a hidden scandal. Resist this. A study about yawning and brain temperature doesn't need "Nobody is talking about this" energy. It's just interesting science. Let it be interesting.

## Your Job Right Now
Your research team has delivered candidate topics. You need to:

1. **Score ALL candidates** — Rate each 1-10. Substance, timeliness, counter-narrative potential.
2. **Check for overlap with existing articles** — This is CRITICAL. For EACH candidate, check if we already have an article covering the same subject area. If we do, compare: is the new angle genuinely better? If yes, the new piece can REPLACE the old one. If no, kill that candidate.
3. **Pick the winner** — considering collection balance, depth, and reader value.
4. **Craft the angle** — The second-order insight. The thing that makes a reader stop scrolling.
5. **Set the headline** — Magazine-quality. Specific. Honest. NOT clickbait.

## HEADLINE RULES (CRITICAL — read every time)
40% of our existing headlines start with "The." This is now BANNED as the default. Vary the structure.

**Banned headline patterns (overused — find alternatives):**
- "The [Noun] That [Dramatic Verb]..." — way overused. Dozens of these already.
- "Your [Body Part] Is [Dramatic Claim]" — we have 7+ of these. Stop.
- "[Subject]. Nobody Is Talking About It." / "...Nobody Wants to Fund" / "...Science Ignores" / "...Medicine Barely Noticed" — this framing implies conspiracy. We're a science publication, not a blog.
- "[Study] Just [Dramatic Verb]" — "Just Delivered Bad News", "Just Collapsed", "Just Exposed" — breathless language.
- "[Dramatic Claim]. That Explains Everything." — melodramatic.
- Two-sentence headlines where the second sentence is a short dramatic kicker — overused.

**Good headline STRUCTURES (invent your own — never copy these patterns verbatim):**
- Direct claim: a specific, falsifiable statement about what the evidence shows
- Question: a genuine question the article answers — not rhetorical fluff
- Mechanism-forward: "How [thing] does [surprising action]" — leads with the biology
- Person/study-forward: names a researcher, lab, or specific study as the hook
- Number-forward: opens with a striking statistic that earns the click
- Understated: quiet, confident, lets the topic's weight speak for itself
- Ironic/dry: the headline itself contains the editorial commentary

Generate a FRESH headline for each article. If you read 10 of our headlines in a row, they should feel like they came from different writers at the same magazine — not from a headline template.
6. **Assign the article archetype** — This determines the article's fundamental form and feel. NOT every article should be written the same way. Match the archetype to the material.
7. **Dogma check** — Before writing the brief, ask: does this topic touch any area where popular health advice is outdated or industry-driven? If so, add a "dogmaWarnings" field listing specific claims the writer must NOT repeat without verification (e.g., "Do not repeat omega-3/6 ratio claims as fact", "Note that the breakfast-is-essential claim is industry-funded"). This is CRITICAL editorial oversight.
8. **Write the creative brief** — Tone, angle, emphasis, avoidance, opening, closing direction. Include dogma warnings in the "avoid" field.
9. **Make the call** — approve or kill the entire batch.
10. **Flag series potential** — If a topic is so rich it naturally breaks into 2-4 standalone pieces (e.g., a drug class with distinct mechanisms, a condition with distinct subtopics), flag it. Don't force a series, but don't ignore natural multi-part material either.

## Article Archetypes
Choose ONE. This is the most important editorial decision — it shapes the entire article's form.

- **"deep-investigation"** — Multi-source, methodical build. For complex topics with competing evidence, institutional failures, or layered mechanisms. 2,000-2,400 words. Opens with a scene or observation. Builds slowly. Lots of evidence. This is your prestige format.
- **"the-explainer"** — "Here's how X actually works." Didactic but not boring. Uses analogies, metaphors, step-by-step breakdowns. Good for mechanisms, biological processes, "why does X happen" topics. 1,600-2,000 words. Can be warmer, more patient.
- **"provocation"** — Short, sharp, opinion-forward (backed by evidence). Takes a clear position and defends it. More conversational, more Hitchens. Good for institutional failures, bad science, overdue corrections. 1,200-1,600 words. Gets in, makes the case, gets out.
- **"case-study"** — Built around ONE study, one patient scenario, or one specific situation. Zooms in tight, then pulls out to implications. Good for breakthrough papers, unusual clinical presentations, single dramatic findings. 1,400-1,800 words.
- **"profile"** — Centers a researcher, lab, or clinical program doing interesting work. Human angle first, science through the lens of the person. Good for pioneering work, contrarian researchers, underfunded fields. 1,600-2,000 words.
- **"the-roundup"** — Covers multiple angles of a broader question. Shorter sections, more ground covered. Good for "state of the science" pieces, emerging fields, topics where 5 recent papers tell a story together. 1,800-2,200 words.
- **"myth-autopsy"** — Dissects a specific widely-held belief. Opens with the myth stated plainly, then dismantles it with evidence. This is ONE archetype, not the default. Only use when the topic genuinely IS a myth worth debunking. 1,600-2,000 words.

## Voice Modulation
Set these dials for each article:

- **tonePreset**: Choose ONE from: "straight-science" | "smart-casual" | "dry-analytical" | "storyteller" | "debunker" | "wire-dispatch" | "pointed" | "measured-authority" | "curious" | "understated". This is the MOST IMPORTANT editorial decision after archetype. All presets share the same core voice — the difference is subtle, like the same journalist on different days. VARY across the collection. Match to the SUBJECT.
- **density**: "data-heavy" | "narrative-driven" | "balanced" — Ratio of evidence citations to storytelling.
- **pacing**: "slow-build" | "rapid-fire" | "crescendo" — Does the article build methodically, hit fast, or start quiet and escalate?

## Overlap Rules
- Same drug/condition/study as an existing article? That's overlap. Kill it UNLESS the new angle is substantially better.
- If the new piece IS better: set "replacesSlug" to the slug of the article it should replace. We'll unpublish the old one.
- "Better" means: stronger evidence, more surprising angle, more relevant to readers right now.
- When in doubt, pick a topic in a DIFFERENT subject area entirely.

## Output Format
Return ONLY valid JSON:
{
  "decision": "approve" | "kill",
  "candidateScores": [{ "rank": 1, "topic": "...", "score": "(1-10, be honest — 7+ only for genuinely strong topics)", "note": "why this score", "overlapsExisting": "slug-of-overlapping-article or null" }],
  "chosenCandidate": 1,
  "topicScore": "(1-10, your honest assessment of the chosen topic)",
  "headline": "The final headline — DO NOT start with 'The' by default. Match the tone to the subject: understated for nuanced science, direct for clear findings, pointed for institutional failures. See HEADLINE RULES above.",
  "slug": "url-friendly-slug",
  "description": "2-3 sentence description. Specific about what the reader will learn. Match the subject's weight — don't hype a quiet study, don't underplay a major finding.",
  "angle": "The specific editorial angle",
  "replacesSlug": null,
  "archetype": "deep-investigation | the-explainer | provocation | case-study | profile | the-roundup | myth-autopsy",
  "wordCount": { "min": 1600, "max": 2000 },
  "brief": {
    "tonePreset": "straight-science | smart-casual | dry-analytical | storyteller | debunker | wire-dispatch | pointed | measured-authority | curious | understated — Same voice, different gear. Match to subject. Vary across collection.",
    "tone": "Specific tone guidance for THIS piece beyond the preset — what makes this article's voice unique?",
    "density": "data-heavy | narrative-driven | balanced",
    "pacing": "slow-build | rapid-fire | crescendo",
    "openWith": "How to open — VARY THIS. 34% of our articles open with narrative vignettes ('Picture someone...', 'In 2019, a 45-year-old...'). Only use narrative openings for storyteller preset. Otherwise choose: a striking statistic, a direct provocative claim, a mechanism description, a historical fact, a contradiction, or the single most important finding. Be SPECIFIC about what the writer should open with.",
    "emphasize": ["Key point 1", "Key point 2", "Key point 3"],
    "avoid": ["What NOT to do", "Clichés to avoid"],
    "dogmaWarnings": ["Specific outdated claims the writer must NOT repeat as fact for this topic — e.g., 'Do not treat omega-3/6 ratio as established science', 'Note that the cited breakfast study was Kellogg-funded'"],
    "closingDirection": "How to end — NOT always a twist/paradox. Options: quiet observation, direct challenge, unanswered question, call to action, historical echo, clinical implication",
    "structuralNotes": "Any specific structural choices: should this skip info-cards? Use more/fewer pull-quotes? Open with a scene that returns at the end? Use short rapid-fire sections?"
  },
  "seriesCandidate": false,
  "seriesNotes": null,
  "categoryOverride": null,
  "killReason": null
}`;

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  "that", "this", "with", "from", "have", "been", "your", "what", "when", "just",
  "more", "most", "than", "also", "about", "into", "does", "will", "could", "would",
  "should", "every", "their", "these", "those", "some", "other", "only", "first",
  "still", "even", "much", "many", "very", "between", "being", "after", "before",
  "here", "there", "where", "while", "each", "both", "through", "over", "under",
  // Generic health/science terms
  "health", "study", "research", "evidence", "science", "brain", "body", "human",
  "people", "patients", "treatment", "medical", "clinical", "risk", "effect",
  "effects", "years", "shows", "found", "according", "actually", "problem",
  "really", "everything", "explains", "never", "time", "new", "like",
]);

function extractSubjectWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .split(/[\s\-:,—–.'"?!()]+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { logId } = await req.json();
    if (!logId) return json({ error: "logId is required" }, 400);

    const db = supabase();

    const stageResult = await safeStage(db, logId, "editor-brief", async () => {
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

      await db
        .from("daily_article_log")
        .update({ status: "editor_reviewing", stage_started_at: new Date().toISOString() })
        .eq("id", logId);

      const { titles, categoryCounts } = await getExistingArticles(db);

      // ── HARD DUPLICATE FILTER ──────────────────────────────────────
      // Before the editor even sees candidates, programmatically remove
      // any that overlap with existing articles or queued topics.
      // This is the ONLY line of defense — do not rely on AI judgment.
      //
      // Strategy: bidirectional word overlap with stop-word filtering.
      // Checks BOTH directions (candidate→existing AND existing→candidate)
      // and flags if either exceeds 30%. Includes tags + description.
      const { data: existingArticles } = await db.from("articles").select("title, slug, keywords, tags, description, category").eq("status", "published");
      const { data: queuedItems } = await db.from("topic_queue").select("topic").in("status", ["queued", "assigned", "in_progress"]);

      // Build fingerprints from title + slug + keywords + tags + description
      const existingFingerprints: { words: Set<string>; title: string }[] = [];
      for (const a of (existingArticles || []) as Array<{ title: string; slug: string; keywords: string[] | null; tags: string[] | null; description: string | null; category: string }>) {
        const raw = [
          a.title,
          (a.slug || "").replace(/-/g, " "),
          ...(a.keywords || []),
          ...(a.tags || []),
          a.description || "",
        ].join(" ");
        existingFingerprints.push({ words: extractSubjectWords(raw), title: a.title });
      }
      for (const q of (queuedItems || []) as Array<{ topic: string }>) {
        existingFingerprints.push({ words: extractSubjectWords(q.topic), title: q.topic });
      }

      function isDuplicate(topic: string, headline: string, extras?: { category?: string; keyFindings?: string[]; mechanism?: string }): boolean {
        // Build candidate fingerprint from ALL available info (topic + headline + category + findings + mechanism)
        const candidateText = [topic, headline, extras?.category || "", extras?.mechanism || "", ...(extras?.keyFindings || [])].join(" ");
        const candidateWords = extractSubjectWords(candidateText);
        if (candidateWords.size === 0) return false;

        for (const fp of existingFingerprints) {
          if (fp.words.size === 0) continue;
          // Bidirectional overlap: check both directions, take the higher %
          const candidateArr = [...candidateWords];
          const existingArr = [...fp.words];
          const overlapCount = candidateArr.filter(w => fp.words.has(w)).length;
          const reverseCount = existingArr.filter(w => candidateWords.has(w)).length;
          const candidatePct = overlapCount / candidateWords.size;
          const existingPct = reverseCount / fp.words.size;
          const maxPct = Math.max(candidatePct, existingPct);
          // 55% bidirectional overlap AND 5+ matching subject words → duplicate
          // Only catches near-exact matches. The AI editor handles nuanced overlap detection.
          if (maxPct >= 0.55 && overlapCount >= 5) return true;
        }
        return false;
      }

      // Filter candidates BEFORE the editor sees them
      let candidates = researchData.candidates as Array<Record<string, unknown>> | undefined;

      if (candidates) {
        const before = candidates.length;
        candidates = candidates.filter(c =>
          !isDuplicate((c.topic as string) || "", (c.headline_draft as string) || "", {
            category: c.category as string,
            keyFindings: c.keyFindings as string[],
            mechanism: c.mechanism as string,
          })
        );
        if (candidates.length < before) {
          console.log(`[Editor] Filtered ${before - candidates.length} duplicate candidates (${before} → ${candidates.length})`);
        }
        if (candidates.length === 0) {
          // All candidates were duplicates — kill this run
          await db.from("daily_article_log").update({
            status: "failed",
            error: `All ${before} candidates were duplicates of existing articles. Scout needs to find different topics.`,
            completed_at: new Date().toISOString(),
          }).eq("id", logId);
          return;
        }
      } else if (researchData.topic) {
        // Single topic from queue — let the editor decide if it's a duplicate.
        // The editor sees ALL existing titles and can make a nuanced judgment.
        // Only block exact-match duplicates (mechanical check catches near-identical titles).
        if (isDuplicate((researchData.topic as string) || "", (researchData.headline_draft as string) || "", {
          category: researchData.category as string,
          keyFindings: researchData.keyFindings as string[],
          mechanism: researchData.mechanism as string,
        })) {
          console.log(`[Editor] Mechanical dupe check flagged "${researchData.topic}" — passing to editor for final judgment.`);
          // Don't kill — let the editor see it. The editor prompt includes all existing titles
          // and will kill it if it's genuinely redundant, or find a fresh angle if it's not.
        }
      }

      let researchSection: string;

      if (candidates && candidates.length > 0) {
        // Multi-candidate format
        researchSection = candidates.map((c, i) => {
          const studies = (c.studies as Array<{ title: string; journal: string; year: string; finding: string }>) || [];
          return `### CANDIDATE ${i + 1} (Research rank: ${c.rank || i + 1})
Topic: ${c.topic}
Working headline: ${c.headline_draft}
Category: ${c.category}
Why: ${c.why}

Key findings:
${((c.keyFindings as string[]) || []).map((f: string, j: number) => `${j + 1}. ${f}`).join("\n")}

Studies:
${studies.map((s) => `- "${s.title}" (${s.journal}, ${s.year}): ${s.finding}`).join("\n")}

Mechanism: ${c.mechanism || "Not provided"}
Counter-arguments: ${((c.counterArguments as string[]) || []).map((a: string) => a).join("; ")}
Key statistics: ${((c.statistics as string[]) || []).join("; ")}`;
        }).join("\n\n");
      } else {
        // Single-topic format (from queue or legacy)
        researchSection = `### RESEARCH BRIEF
Topic: ${researchData.topic}
Working headline: ${researchData.headline_draft}
Category: ${researchData.category}
Why this topic: ${researchData.why}

Key findings:
${((researchData.keyFindings as string[]) || []).map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")}

Studies:
${((researchData.studies as Array<{ title: string; journal: string; year: string; finding: string }>) || []).map((s) => `- "${s.title}" (${s.journal}, ${s.year}): ${s.finding}`).join("\n")}

Mechanism: ${researchData.mechanism || "Not provided"}
Counter-arguments: ${((researchData.counterArguments as string[]) || []).map((c: string) => `- ${c}`).join("\n")}
Expert positions: ${((researchData.expertQuotes as string[]) || []).join("\n")}`;
      }

      const isManuallyQueued = researchData._queueSource === "manual";
      const originalQueuedTopic = (researchData.topic as string) || "";

      const queueDirective = isManuallyQueued ? `\n## MANDATORY EDITORIAL DIRECTION\nThis topic was MANUALLY QUEUED by the editor-in-chief. The original topic was:\n"${originalQueuedTopic}"\n\nYou MUST preserve the editorial intent of this topic. If the topic is critical of an industry, your headline and angle must reflect that critical investigation — NOT neutralize it into a "balanced" overview. If the topic asks to follow the money, your brief must direct the writer to follow the money. Do NOT reframe a pointed investigation as a neutral explainer. The editor-in-chief chose this angle for a reason.\n` : "";

      const editorPrompt = `Review ${candidates ? `these ${candidates.length} research candidates` : "this research brief"} and create an editorial brief for the writer.
${queueDirective}
## RESEARCH
${researchSection}
${researchData.searchSummary ? `\nSearch summary: ${researchData.searchSummary}` : ""}

## CURRENT COLLECTION BALANCE
Category distribution (${titles.length} total articles):
${Object.entries(categoryCounts).sort(([, a], [, b]) => (b as number) - (a as number)).map(([cat, count]) => `- ${cat}: ${count}`).join("\n")}

## EXISTING HEADLINES (for differentiation):
${titles.slice(0, 30).map((t) => `- ${t}`).join("\n")}
${titles.length > 30 ? `... and ${titles.length - 30} more` : ""}

## CATEGORY BALANCE RULE (HARD CONSTRAINT)
${(() => {
    const total = titles.length || 1;
    const overserved = Object.entries(categoryCounts).filter(([, c]) => (c as number) / total > 0.12).map(([cat]) => cat);
    const underserved = Object.entries(categoryCounts).filter(([, c]) => (c as number) / total < 0.08).map(([cat]) => cat);
    const missing = VALID_CATEGORIES.filter(c => !categoryCounts[c]);
    const all = [...underserved, ...missing];
    if (all.length > 0) {
      return `PRIORITY: These categories are severely underserved: ${all.join(", ")}. If ANY candidate is in one of these categories AND scores 5+, pick it OVER a higher-scoring candidate from an overserved category (${overserved.join(", ")}) — UNLESS the score difference is >3 points.\n\nDo NOT approve another Clinical Evidence or Neuroscience article unless it scores 8+ AND no underserved-category candidate scores 5+. We need to rebalance.`;
    }
    return "Categories are well-balanced. Pick purely on quality.";
  })()}

## SUBJECT-LEVEL GAPS (editorial priority)
Beyond category balance, these specific SUBJECTS have zero or near-zero coverage and should be prioritized when candidates touch them:
- Cardiology / cardiovascular disease (ZERO articles — #1 killer worldwide)
- Diabetes / metabolic syndrome (near-zero — affects 500M+ people)
- Immunology beyond vaccines (ZERO dedicated immune system articles)
- Kidney disease (ZERO — affects 1 in 7 adults)
- Liver disease / NAFLD (ZERO — affects 25% of adults)
- Respiratory medicine (ZERO — no asthma, COPD, or pulmonary content)
- Musculoskeletal / arthritis / back pain (ZERO)
- Addiction biology (ZERO)
- Prostate / male reproductive health (ZERO)
- Pain science (near-zero)
- Dermatology (ZERO)
If a candidate covers any of the above, give it a +2 score bonus in your assessment. A 6/10 cardiology topic is worth more to the collection than an 8/10 neuroscience topic right now.

${candidates ? "Score ALL candidates, pick the best one considering collection balance, then write the brief for that topic." : "Make your editorial call. Approve with a killer brief, or kill it with a reason."}`;

      const { text: editorRaw, usage: editorUsage } = await generateWithFallback({
        system: SENIOR_EDITOR_BRIEF_PROMPT,
        user: editorPrompt,
        models: WRITER_FALLBACK_CHAIN,
        maxTokens: 4000,
        temperature: 0.4,
        stage: "editor-brief",
        webSearch: false, // Editorial decision on existing data — no search needed
      });
      await addCostToLog(db, logId, editorUsage);

      const editorBrief = parseClaudeJSON(editorRaw) as Record<string, unknown>;

      // Validate critical editor brief fields — catch truncation early
      if (editorBrief.decision === "approve") {
        const slug = editorBrief.slug as string;
        const headline = editorBrief.headline as string;
        const description = editorBrief.description as string;
        if (!slug || slug.length < 5) {
          console.warn(`[Editor] ⚠️ Missing/corrupt slug: "${slug}" — editor brief may be truncated`);
        }
        if (!headline || headline.length < 10) {
          console.warn(`[Editor] ⚠️ Missing/corrupt headline: "${headline}" — editor brief may be truncated`);
        }
        if (!description || description.length < 40 || !/[.!?]["')\u2019]?\s*$/.test(description.trim())) {
          console.warn(`[Editor] ⚠️ Missing/truncated description: "${(description || "").slice(-50)}" (${(description || "").length} chars)`);
        }
        if (!editorBrief.brief || !(editorBrief.brief as Record<string, unknown>).tonePreset) {
          console.warn(`[Editor] ⚠️ Missing brief.tonePreset — writer will get generic defaults. Editor brief may be truncated.`);
        }
      }

      if (editorBrief.decision === "kill") {
        await db
          .from("daily_article_log")
          .update({
            status: "failed",
            error: `Senior Editor killed: ${editorBrief.killReason || "Did not meet editorial standards"}`,
            completed_at: new Date().toISOString(),
          })
          .eq("id", logId);
        return;
      }

      // Extract the chosen candidate's research data for the writer
      let chosenResearch = researchData;
      if (candidates && editorBrief.chosenCandidate != null) {
        const idx = (editorBrief.chosenCandidate as number) - 1;
        const chosen = candidates[idx] || candidates[0];
        // Merge chosen candidate fields into top-level for downstream stages
        chosenResearch = { ...researchData, ...chosen, _allCandidates: candidates };
      }

      // Save unchosen candidates to topic queue for future articles
      if (candidates && candidates.length > 1 && editorBrief.chosenCandidate != null) {
        const chosenIdx = (editorBrief.chosenCandidate as number) - 1;
        const candidateScores = (editorBrief.candidateScores as Array<{ rank: number; score: number; verdict: string }>) || [];
        const unchosenTopics = candidates
          .filter((_: unknown, i: number) => i !== chosenIdx)
          .filter((c: Record<string, unknown>) => {
            const cs = candidateScores.find(s => s.rank === c.rank);
            return !cs || cs.score >= 5; // Only save decent candidates (score 5+)
          })
          .map((c: Record<string, unknown>) => {
            const cs = candidateScores.find(s => s.rank === c.rank);
            return {
              topic: c.topic as string,
              category: (c.category as string) || null,
              notes: `Auto-saved from research cycle. Editor scored: ${cs?.score || "?"}/10. ${cs?.verdict || ""}`,
              priority: 50,
              source: "trending",
              editor_score: cs?.score || null,
              research_summary: (c.why as string) || ((c.keyFindings as string[]) || []).slice(0, 2).join("; ") || null,
            };
          });

        if (unchosenTopics.length > 0) {
          // Use the same isDuplicate check from above
          const deduped = unchosenTopics.filter((t: Record<string, unknown>) =>
            !isDuplicate((t.topic as string) || "", (t.topic as string) || "")
          );

          if (deduped.length > 0) {
            await db.from("topic_queue").insert(deduped).select();
          }
        }
      }

      // Editor approved — store the brief alongside research data
      await db
        .from("daily_article_log")
        .update({
          topic: (editorBrief.headline as string) || (chosenResearch.topic as string),
          title: editorBrief.headline as string,
          slug: editorBrief.slug as string,
          status: "editor_approved",
          editor_score: (editorBrief.topicScore as number) || null,
          source: researchData._queueId || researchData._fromQueue ? "queue" : "trending",
          research_data: {
            ...chosenResearch,
            _editorBrief: editorBrief,
          },
        })
        .eq("id", logId);
    });

    if (!stageResult.ok) {
      return json({ error: stageResult.error, logId }, 500);
    }

    return json({ success: true, logId, status: "editor_approved" });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
