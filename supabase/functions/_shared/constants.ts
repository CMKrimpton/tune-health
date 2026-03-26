export const MAX_CONCURRENT = 1;
export const STALE_MS = 5 * 60 * 1000; // 5 min — must be longer than any single stage API call (75s timeout + overhead)
export const API_TIMEOUT = 75_000; // 75s per model — allows 2 fallback attempts within ~150s edge function timeout
export const RESEARCH_TIMEOUT = 120_000; // 120s — research web search needs more time (single model, no fallback chain)
export const ACTIVE = ["started","searching","writing","publishing","editor_reviewing","editor_qc","independence_review","researching","topic_selected","rewriting_voice"];
export const IN_PIPELINE = [...ACTIVE,"research_done","editor_approved","written","independence_done","voice_rewrite_pending","voice_rewrite_done","qc_approved","saved"];

// Pricing per million tokens (USD)
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6":          { input: 15,   output: 75 },
  "claude-sonnet-4-6":        { input: 3,    output: 15 },
  "claude-sonnet-4-20250514": { input: 3,    output: 15 },
  "claude-opus-4-20250514":   { input: 15,   output: 75 },
  "gpt-5.4":                  { input: 2.50, output: 15 },
  "gemini-3.1-pro-preview":   { input: 2,    output: 12 },
  "gemini-2.5-pro":           { input: 1.25, output: 10 },
  "grok-3":                   { input: 3,    output: 15 },
  "gemini-2.5-flash":         { input: 0.15, output: 0.60 },
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
  "claude-sonnet-4-20250514": "anthropic",
  "claude-opus-4-20250514": "anthropic",
  "gpt-5.4": "openai",
  "gemini-3.1-pro-preview": "google",
  "gemini-2.5-pro": "google",
  "grok-3": "xai",
  "gemini-2.5-flash": "google",
};

// Quality fallback chains — Gemini 3.1 Pro primary (best cost/quality ratio)
export const WRITER_FALLBACK_CHAIN = ["gemini-3.1-pro-preview", "claude-sonnet-4-6", "gpt-5.4"];
// Voice rewrite: Opus removed ($0.87/call). Sonnet/Gemini write well enough with explicit voice instructions.
export const VOICE_REWRITE_CHAIN = ["claude-sonnet-4-6", "gemini-3.1-pro-preview", "gpt-5.4", "grok-3"];

export const MODEL_BYLINES: Record<string, { name: string; role: string }> = {
  "claude-opus-4-6":          { name: "Carl Lundin",       role: "Editor-at-Large" },
  "claude-sonnet-4-6":        { name: "Max Quilici",       role: "Senior Health Correspondent" },
  "claude-sonnet-4-20250514": { name: "Max Quilici",       role: "Senior Health Correspondent" },
  "claude-opus-4-20250514":   { name: "Carl Lundin",       role: "Editor-at-Large" },
  "gpt-5.4":                  { name: "Eli Vance",         role: "Health & Science Editor" },
  "gemini-3.1-pro-preview":   { name: "Christine Wright",  role: "Science & Evidence Desk" },
  "gemini-2.5-pro":           { name: "Christine Wright",  role: "Science & Evidence Desk" },
  "grok-3":                   { name: "Linda Carnes",      role: "Investigative Health Reporter" },
  "gemini-2.5-flash":         { name: "Christine Wright",  role: "Science & Evidence Desk" },
};

export function getByline(model: string): { name: string; role: string } {
  return MODEL_BYLINES[model] || { name: "alumi news Editorial", role: "Medical Review Board" };
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
