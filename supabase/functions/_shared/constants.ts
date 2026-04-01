export const MAX_CONCURRENT = 1;
export const STALE_MS = 5 * 60 * 1000; // 5 min — must be longer than any single stage API call (75s timeout + overhead)
export const API_TIMEOUT = 75_000; // 75s per model — allows 2 fallback attempts within ~150s edge function timeout
export const RESEARCH_TIMEOUT = 120_000; // 120s — research web search needs more time (single model, no fallback chain)
export const RESEARCH_PARALLEL_TIMEOUT = 90_000; // 90s per model in parallel research (3 models, limited by slowest)
// Active statuses = currently processing (used by stale detection + concurrency guard)
export const ACTIVE = ["started","searching","publishing","editor_reviewing","editor_qc","independence_review"];
// All pipeline statuses (active + waiting + terminal)
export const IN_PIPELINE = [...ACTIVE,"research_done","editor_approved","written","independence_done","qc_approved"];

// Pricing per million tokens (USD) — updated March 2026
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6":          { input: 5,    output: 25 },
  "claude-sonnet-4-6":        { input: 3,    output: 15 },
  "gpt-5.4":                  { input: 2.50, output: 15 },
  "gpt-5":                    { input: 1.25, output: 10 },
  "gemini-3.1-pro-preview":   { input: 2,    output: 12 },
  "gemini-2.5-pro":           { input: 1.25, output: 10 },
  "grok-4":                   { input: 3,    output: 15 },
  "grok-3":                   { input: 3,    output: 15 },
  "gemini-2.5-flash":         { input: 0.30, output: 2.50 },
  "gemini-3.1-flash-lite":    { input: 0.25, output: 1.50 },
};

export const CATEGORY_GRADIENTS: Record<string, { from: string; to: string; hex: string }> = {
  "Neuroscience":          { from: "violet-600",  to: "purple-700",  hex: "#7c3aed" },
  "Mental Health":         { from: "sky-500",     to: "blue-600",    hex: "#0ea5e9" },
  "Longevity":             { from: "emerald-500", to: "teal-600",    hex: "#10b981" },
  "Clinical Evidence":     { from: "amber-500",   to: "orange-600",  hex: "#f59e0b" },
  "Environmental Health":  { from: "lime-500",    to: "green-600",   hex: "#84cc16" },
  "Nutrition":             { from: "emerald-600", to: "teal-700",    hex: "#059669" },
  "Fitness":               { from: "rose-600",    to: "red-700",     hex: "#e11d48" },
  "Sleep Science":         { from: "indigo-500",  to: "purple-600",  hex: "#6366f1" },
  "Pharmacology":          { from: "amber-500",   to: "orange-600",  hex: "#f59e0b" },
};

export const VALID_CATEGORIES = ["Neuroscience", "Mental Health", "Longevity", "Clinical Evidence", "Environmental Health", "Nutrition", "Fitness", "Sleep Science", "Pharmacology"];

export function getCategoryGradient(category: string): { from: string; to: string } {
  const g = CATEGORY_GRADIENTS[category];
  return g ? { from: g.from, to: g.to } : { from: "rose-600", to: "red-700" };
}

export type ModelProvider = "anthropic" | "xai" | "google" | "openai";

export const MODEL_PROVIDERS: Record<string, ModelProvider> = {
  "claude-opus-4-6": "anthropic",
  "claude-sonnet-4-6": "anthropic",
  "gpt-5.4": "openai",
  "gpt-5": "openai",
  "gemini-3.1-pro-preview": "google",
  "gemini-2.5-pro": "google",
  "grok-4": "xai",
  "grok-3": "xai",
  "gemini-2.5-flash": "google",
  "gemini-3.1-flash-lite": "google",
};

// ═══════════════════════════════════════════════════════════════════════════
// MODEL CONFIGURATION — SINGLE SOURCE OF TRUTH
// ═══════════════════════════════════════════════════════════════════════════
// DO NOT HARDCODE MODEL IDs ANYWHERE ELSE IN THE CODEBASE.
// Import these constants instead. Models change frequently — centralizing
// them here prevents stale model IDs from creeping back in.
//
// CLAUDE / AI ASSISTANTS: NEVER change these based on your training data.
// These are verified working model IDs as of March 2026. If you think a
// model ID is wrong, ASK THE USER or do a web search — do not guess.
// ═══════════════════════════════════════════════════════════════════════════

// Per-stage model assignments — every pipeline stage reads from here
export const MODELS = {
  // Research stage: needs web search grounding
  RESEARCH_PRIMARY: "gemini-2.5-pro",         // Google Search grounding, 10x cheaper than Claude web search
  RESEARCH_FALLBACK: "claude-sonnet-4-6",     // Claude web search fallback

  // Editor stage: most important editorial decision — needs strong judgment
  EDITOR_PRIMARY: "claude-sonnet-4-6",        // Strong editorial reasoning
  EDITOR_FALLBACK: "gemini-3.1-pro-preview",  // Newest Gemini flagship

  // Independence review: adversarial — needs contrarian thinking
  INDEPENDENCE: "grok-4",                     // Best for adversarial review

  // Independence + fact-check revisions: mechanical find-and-replace
  REVISION_PRIMARY: "gemini-2.5-flash",       // Cheap, fast for mechanical edits
  REVISION_FALLBACK: "claude-sonnet-4-6",

  // QC stage: structured pass/fail — voice audit does most work
  QC_PRIMARY: "gemini-2.5-flash",
  QC_FALLBACK: "claude-sonnet-4-6",

  // Copy edit: editorial judgment needs intelligence — conservative by design
  COPY_EDIT_PRIMARY: "claude-sonnet-4-6",
  COPY_EDIT_FALLBACK: "gemini-2.5-pro",

  // Scout: real-time trending data
  SCOUT_GEMINI: "gemini-2.5-pro",             // Google Search grounding for trends
  SCOUT_GROK: "grok-4",                       // X/Twitter access for social trends

  // Pinger: breaking news detection
  PINGER_GEMINI: "gemini-2.5-flash",          // Fast + cheap for frequent checks
  PINGER_TRIAGE: "gemini-2.5-flash",          // PubMed triage

  // Defaults for API clients
  DEFAULT_CLAUDE: "claude-sonnet-4-6",
  DEFAULT_OPENAI: "gpt-5.4",
  DEFAULT_GEMINI: "gemini-2.5-flash",

  // Image generation
  ILLUSTRATION: "gpt-image-1",

  // Narration (ElevenLabs TTS)
  NARRATION_MODEL: "eleven_multilingual_v2",
  NARRATION_VOICE: "LkgZkNm7dD8b7nbdptAB",
} as const;

export const NARRATION_SETTINGS = {
  stability: 0.3,
  similarity_boost: 0.6,
  style: 0.4,
  use_speaker_boost: true,
  speed: 1.0,
} as const;

// Fallback chains — ordered by preference
export const WRITER_FALLBACK_CHAIN = ["gemini-3.1-pro-preview", "claude-sonnet-4-6", "gpt-5.4"];
export const VOICE_REWRITE_CHAIN = ["claude-sonnet-4-6", "gemini-3.1-pro-preview", "gpt-5.4", "grok-4"];
export const EDITOR_CHAIN = [MODELS.EDITOR_PRIMARY, MODELS.EDITOR_FALLBACK];
export const REVISION_CHAIN = [MODELS.REVISION_PRIMARY, MODELS.REVISION_FALLBACK];
export const QC_CHAIN = [MODELS.QC_PRIMARY, MODELS.QC_FALLBACK];
export const COPY_EDIT_CHAIN = [MODELS.COPY_EDIT_PRIMARY, MODELS.COPY_EDIT_FALLBACK];

export const MODEL_BYLINES: Record<string, { name: string; role: string }> = {
  "human-opus":               { name: "Max Lundin",        role: "Editor-at-Large" },  // Human-written via Opus Max
  "claude-opus-4-6":          { name: "Max Lundin",        role: "Editor-at-Large" },
  "claude-sonnet-4-6":        { name: "Max Lundin",        role: "Senior Health Correspondent" },
  "gpt-5.4":                  { name: "Max Lundin",        role: "Health & Science Editor" },
  "gpt-5":                    { name: "Max Lundin",        role: "Health & Science Editor" },
  "gemini-3.1-pro-preview":   { name: "Max Lundin",        role: "Science & Evidence Desk" },
  "gemini-2.5-pro":           { name: "Max Lundin",        role: "Science & Evidence Desk" },
  "grok-4":                   { name: "Max Lundin",        role: "Investigative Health Reporter" },
  "grok-3":                   { name: "Max Lundin",        role: "Investigative Health Reporter" },
  "gemini-2.5-flash":         { name: "Max Lundin",        role: "Science & Evidence Desk" },
};

export function getByline(model: string): { name: string; role: string } {
  return MODEL_BYLINES[model] || { name: "Max Lundin", role: "Medical Review Board" };
}

export function pickWriterModel(): string[] {
  return ["gemini-3.1-pro-preview", "claude-sonnet-4-6", "gpt-5.4"];
}

// Category keyword classifier for scouts
export const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  ["Pharmacology", ["drug", "drugs", "medication", "pharmaceutical", "pharma", "prescri", "dosing", "FDA", "therapy", "therapeutic", "GLP-1", "SGLT2", "statin", "antibiotic", "opioid", "psychedelic", "psilocybin", "MDMA", "ketamine", "SSRI", "biologic", "inhibitor", "receptor", "agonist"]],
  ["Neuroscience", ["brain", "neuron", "neural", "cortex", "hippocampus", "dopamine", "serotonin", "synap", "neuro", "cognitive", "cognition", "amygdala", "prefrontal", "cerebell", "neuroplasticity", "EEG", "fMRI"]],
  ["Mental Health", ["depression", "anxiety", "PTSD", "trauma", "psychiatric", "psycholog", "bipolar", "schizophren", "OCD", "ADHD", "therapy", "counseling", "suicide", "mental illness", "emotional", "burnout", "stress resilience"]],
  ["Sleep Science", ["sleep", "insomnia", "circadian", "melatonin", "REM", "sleep apnea", "chronotype", "shift work"]],
  ["Nutrition", ["diet", "dietary", "nutrient", "vitamin", "mineral", "protein", "omega-3", "fasting", "microbiome", "gut bacteria", "prebiotic", "probiotic", "calori", "plant-based", "food", "meal", "eating", "supplement"]],
  ["Fitness", ["exercise", "workout", "strength training", "resistance training", "VO2", "aerobic", "HIIT", "cardio", "muscle", "physical activity", "sedentary", "mobility", "athletic"]],
  ["Longevity", ["aging", "lifespan", "healthspan", "longevity", "senescence", "telomere", "NAD+", "NMN", "rapamycin", "metformin", "caloric restriction", "blue zone", "mTOR", "sirtuin", "epigenetic clock"]],
  ["Environmental Health", ["pollution", "pollutant", "PFAS", "microplastic", "pesticide", "toxin", "endocrine disrupt", "lead exposure", "air quality", "water contam", "chemical", "BPA", "EMF", "environmental"]],
  ["Clinical Evidence", ["clinical trial", "meta-analysis", "cohort study", "randomized", "systematic review", "evidence-based", "diagnosis", "biomarker", "screening", "treatment outcome", "mortality", "morbidity", "epidemiol", "incidence", "prevalence", "cardiovascular", "heart", "cardiac", "diabetes", "insulin", "kidney", "renal", "liver", "hepat", "respiratory", "lung", "COPD", "asthma", "cancer", "tumor", "oncol", "autoimmune", "arthritis", "pain", "prostate", "dermatol", "vaccine", "immunol"]],
];

export function classifyCategory(text: string): string {
  const lower = text.toLowerCase();
  const exact = VALID_CATEGORIES.find(c => lower.includes(c.toLowerCase()));
  if (exact) return exact;
  let bestCat = "";
  let bestScore = 0;
  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    const score = keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
    if (score > bestScore) { bestScore = score; bestCat = cat; }
  }
  return bestScore >= 1 ? bestCat : "";
}
