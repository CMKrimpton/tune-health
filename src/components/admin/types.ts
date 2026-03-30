// ─── Shared Admin Portal Types & Config ─────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the admin dashboard.
// All React components import from here — never redefine constants locally.
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// SYNCED FROM supabase/functions/_shared/constants.ts
// Last synced: 2026-03-26. If you update these, update the backend too.
// Backend is the source of truth for: VALID_CATEGORIES, CATEGORY_GRADIENTS,
// MODEL_PEN_NAMES (MODEL_BYLINES in backend).
//
// CLAUDE / AI ASSISTANTS: NEVER change model IDs or model labels based on
// your training data. Do a web search first to verify current model IDs.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Valid Categories ────────────────────────────────────────────────────────

export const VALID_CATEGORIES = [
  'Neuroscience', 'Mental Health', 'Longevity', 'Clinical Evidence',
  'Environmental Health', 'Nutrition', 'Fitness', 'Sleep Science', 'Pharmacology',
] as const;

// ─── Category Gradients ──────────────────────────────────────────────────────
// Synced from backend CATEGORY_GRADIENTS. Used for article stripe colors,
// gradient pickers, and category badges.

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

/** Resolve a Tailwind gradient class to a hex color for inline rendering. */
const GRADIENT_HEX_MAP: Record<string, string> = {
  "rose-600": "#e11d48", "violet-600": "#7c3aed", "emerald-500": "#10b981",
  "emerald-600": "#059669", "amber-500": "#f59e0b", "sky-500": "#0ea5e9",
  "indigo-500": "#6366f1", "lime-500": "#84cc16", "red-700": "#b91c1c",
  "purple-700": "#7e22ce", "teal-600": "#0d9488", "teal-700": "#0f766e",
  "orange-600": "#ea580c", "blue-600": "#2563eb", "purple-600": "#9333ea",
  "green-600": "#16a34a",
};

/** Get the hex color for an article's category stripe. */
export function getCategoryColor(category: string): string {
  return CATEGORY_GRADIENTS[category]?.hex ?? '#dc2626';
}

/** Get the hex color for a Tailwind gradient class name. */
export function getGradientHex(gradientClass: string): string {
  return GRADIENT_HEX_MAP[gradientClass] ?? '#dc2626';
}

/** Gradient presets for the article editor color picker. */
export const GRADIENT_PRESETS = Object.entries(CATEGORY_GRADIENTS).map(([label, g]) => ({
  from: g.from,
  to: g.to,
  label,
  colors: [getGradientHex(g.from), getGradientHex(g.to)] as [string, string],
}));

// ─── Model Pen Names ─────────────────────────────────────────────────────────
// Synced from backend MODEL_BYLINES. Human bylines for AI model attribution.

export const MODEL_PEN_NAMES: Record<string, { name: string; role: string }> = {
  "human-opus":               { name: "Carl Lundin",       role: "Editor-at-Large" },
  "claude-opus-4-6":          { name: "Carl Lundin",       role: "Editor-at-Large" },
  "claude-sonnet-4-6":        { name: "Max Quilici",       role: "Senior Health Correspondent" },
  "gpt-5.4":                  { name: "Eli Vance",         role: "Health & Science Editor" },
  "gpt-5":                    { name: "Eli Vance",         role: "Health & Science Editor" },
  "gemini-3.1-pro-preview":   { name: "Christine Wright",  role: "Science & Evidence Desk" },
  "gemini-2.5-pro":           { name: "Christine Wright",  role: "Science & Evidence Desk" },
  "grok-4":                   { name: "Linda Carnes",      role: "Investigative Health Reporter" },
  "grok-3":                   { name: "Linda Carnes",      role: "Investigative Health Reporter" },
  "gemini-2.5-flash":         { name: "Christine Wright",  role: "Science & Evidence Desk" },
};

export function getPenName(model: string | null | undefined): string {
  if (!model) return "alumi Editorial";
  return MODEL_PEN_NAMES[model]?.name ?? "alumi Editorial";
}

// ─── ArticleRecord ───────────────────────────────────────────────────────────

export type ArticleStatus = 'draft' | 'published' | 'archived';

export interface ArticleRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  keywords: string[];
  gradient_from: string;
  gradient_to: string;
  featured: boolean;
  draft: boolean;
  coming_soon: boolean;
  read_time: number;
  publish_date: string;
  sort_order: number | null;
  hero_image: string | null;
  hero_image_alt: string | null;
  article_html: string;
  article_svg: string | null;
  toc: TocEntry[];
  source_text: string | null;
  status: ArticleStatus;
  independence_score: number | null;
  editor_score: number | null;
  pipeline_log_id: string | null;
  narration_url: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface TocEntry {
  id: string;
  title: string;
}

// ─── Pipeline Types ──────────────────────────────────────────────────────────

export type PipelineStatus =
  | 'started'
  | 'searching'
  | 'research_done'
  | 'editor_reviewing'
  | 'editor_approved'
  | 'writing'
  | 'written'
  | 'independence_review'
  | 'independence_done'
  | 'editor_qc'
  | 'qc_approved'
  | 'voice_rewrite_pending'
  | 'rewriting_voice'
  | 'voice_rewrite_done'
  | 'publishing'
  | 'published'
  | 'failed';

export interface PipelineResearchData {
  topic?: string;
  headline_draft?: string;
  why?: string;
  category?: string;
  keyFindings?: string[];
  studies?: Array<{
    title: string;
    journal: string;
    year: string;
    finding: string;
  }>;
  counterArguments?: string[];
  mechanism?: string;
  expertQuotes?: string[];
  statistics?: string[];
  candidates?: Array<Record<string, unknown>>;
  searchSummary?: string;
  tags?: string[];
  keywords?: string[];
  _fromQueue?: boolean;
  _queueId?: string;
  _queueSource?: string;
  _writtenBy?: string;
  _editorBrief?: EditorBrief;
  _article?: {
    metadata: Record<string, unknown>;
    html: string;
    toc: TocEntry[];
    readTime: number;
  };
  _independenceReview?: {
    verdict?: string;
    score?: number;
    summary?: string;
    flags?: Array<{ type: string; quote: string; rewrite: string; reason: string }>;
    strengths?: string[];
    improvements?: string[];
    skipped?: boolean;
    reason?: string;
    _revisionApplied?: boolean;
  };
  _pubmedVerification?: {
    verified?: number;
    failed?: number;
    skipped?: number;
    total?: number;
    details?: Array<{ title: string; found: boolean; skipped?: boolean; source?: string; pmid?: string; doi?: string; url?: string }>;
  };
  _qcResult?: QCResult;
  _reviseInstructions?: string | null;
  _voiceRewriteRequested?: boolean;
  _voiceRewriteCompleted?: boolean;
  _voiceRewriteCount?: number;
}

export interface PipelineLog {
  id: string;
  run_date: string;
  topic: string | null;
  slug: string | null;
  title: string | null;
  status: string;
  error: string | null;
  search_queries: unknown[];
  research_snippets: unknown[];
  research_data: PipelineResearchData | null;
  cost_usd: number | string | null;
  model_used: string | null;
  editor_score: number | null;
  grok_score: number | null;
  revision_count: number | null;
  source: string | null;
  stage_started_at: string | null;
  token_usage: Array<{
    model: string;
    stage: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }> | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export type PipelineStage = 'research' | 'editor_brief' | 'write' | 'independence' | 'qc' | 'voice_rewrite' | 'copy_edit' | 'publish';

export const PIPELINE_STAGES: Record<PipelineStage, string[]> = {
  research:       ['started', 'searching', 'research_done'],
  editor_brief:   ['editor_reviewing'],
  write:          ['editor_approved', 'writing', 'written'],
  independence:   ['independence_review', 'independence_done'],
  qc:             ['editor_qc', 'qc_approved'],
  voice_rewrite:  ['voice_rewrite_pending', 'rewriting_voice', 'voice_rewrite_done'],
  copy_edit:      ['copy_editing', 'copy_edited'],
  publish:        ['publishing', 'published'],
};

/** Pipeline stage configuration for the dashboard UI.
 *  Model labels here must match the backend MODELS config in constants.ts.
 *  NEVER update model labels based on AI training data — web search first. */
export interface StageConfig {
  key: PipelineStage;
  icon: string;
  label: string;
  model: string;
  modelColor: string;
  statuses: string[];
}

export const PIPELINE_STAGE_CONFIG: StageConfig[] = [
  { key: 'research',      icon: '🔍', label: 'Research',     model: 'Gemini 2.5 Pro + Search',    modelColor: '#fbbf24', statuses: ['started', 'searching', 'research_done'] },
  { key: 'editor_brief',  icon: '📋', label: 'Editor',       model: 'Sonnet → Gemini 3.1 Pro',    modelColor: '#f97316', statuses: ['editor_reviewing'] },
  { key: 'write',         icon: '✍️', label: 'Write',        model: 'Human (Opus)',                modelColor: '#a78bfa', statuses: ['editor_approved', 'writing', 'written'] },
  { key: 'independence',  icon: '⚖️', label: 'Independence', model: 'Grok 4',                     modelColor: '#3b82f6', statuses: ['independence_review', 'independence_done'] },
  { key: 'qc',            icon: '✅', label: 'QC',           model: 'Flash → Sonnet',              modelColor: '#f97316', statuses: ['editor_qc', 'qc_approved'] },
  { key: 'voice_rewrite', icon: '🎨', label: 'Voice Polish', model: 'Sonnet → Gemini → GPT-5.4',  modelColor: '#8b5cf6', statuses: ['voice_rewrite_pending', 'rewriting_voice', 'voice_rewrite_done'] },
  { key: 'copy_edit',     icon: '✏️', label: 'Copy Edit',    model: 'Sonnet → Gemini Pro',         modelColor: '#ec4899', statuses: ['copy_editing', 'copy_edited'] },
  { key: 'publish',       icon: '📡', label: 'Publish',      model: 'GitHub + GPT Image',          modelColor: '#10b981', statuses: ['publishing', 'published'] },
];

/** Terminal statuses that indicate the pipeline run is complete. */
const TERMINAL_STATUSES = new Set(['published', 'failed']);

/** Active (in-flight) statuses where a stage is currently processing. */
const ACTIVE_PROCESSING_STATUSES = new Set([
  'started', 'searching', 'editor_reviewing', 'writing',
  'independence_review', 'editor_qc', 'rewriting_voice', 'copy_editing', 'publishing',
]);

/** Statuses considered "in-flight" by the pipeline monitor. */
export const ACTIVE_STATUSES = new Set([
  'started', 'searching', 'research_done', 'editor_reviewing', 'editor_approved',
  'writing', 'written', 'independence_review', 'independence_done',
  'editor_qc', 'qc_approved', 'voice_rewrite_pending', 'rewriting_voice',
  'voice_rewrite_done', 'copy_editing', 'copy_edited', 'publishing',
]);

// ─── EditorBrief ─────────────────────────────────────────────────────────────

export interface EditorBriefDirections {
  tone: string;
  tonePreset?: string;
  density?: string;
  pacing?: string;
  openWith: string;
  emphasize: string[];
  avoid: string[];
  dogmaWarnings?: string[];
  closingDirection: string;
  structuralNotes?: string;
}

export interface EditorBrief {
  decision: 'approve' | 'kill';
  candidateScores?: Array<{ rank: number; topic: string; score: string; note: string; overlapsExisting: string | null }>;
  chosenCandidate?: number;
  topicScore: number;
  headline: string;
  slug: string;
  description: string;
  angle: string;
  archetype?: string;
  brief: EditorBriefDirections;
  categoryOverride: string | null;
  killReason: string | null;
  replacesSlug?: string | null;
  seriesCandidate?: boolean;
  seriesNotes?: string | null;
}

// ─── QCResult ────────────────────────────────────────────────────────────────

export interface QCEdits {
  headlineChanged: boolean;
  descriptionChanged: boolean;
  notes: string;
}

export interface QCResult {
  decision: 'publish' | 'rewrite_voice' | 'revise' | 'kill';
  qualityScore: number;
  headline: string;
  description: string;
  voiceCheck?: {
    billMaherTest: boolean;
    followsTheMoney: boolean;
    hasEditorialOpinion: boolean;
    pullQuotesStrong: boolean;
    overallVoicePass: boolean;
  };
  edits: QCEdits;
  killReason: string | null;
  reviseInstructions: string | null;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

export function getAdminToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)admin_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}


export function getStageForStatus(status: string): PipelineStage | null {
  for (const [stage, statuses] of Object.entries(PIPELINE_STAGES)) {
    if (statuses.includes(status)) return stage as PipelineStage;
  }
  return null;
}

const STAGE_LABELS: Record<string, string> = {
  research: 'Research',
  editor_brief: 'Editor Review',
  write: 'Writing',
  independence: 'Independence Review',
  qc: 'QC',
  voice_rewrite: 'Voice Polish',
  copy_edit: 'Copy Edit',
  publish: 'Publishing',
  failed: 'Failed',
};

export function getStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function timeAgo(date: string): string {
  if (!date) return '';
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function isActiveStatus(status: string): boolean {
  return !TERMINAL_STATUSES.has(status);
}

export function isProcessingStatus(status: string): boolean {
  return ACTIVE_PROCESSING_STATUSES.has(status);
}

/** Human-readable status description for the pipeline monitor. */
export function getStatusText(status: string, modelName?: string): string {
  const map: Record<string, string> = {
    started: 'Initializing...',
    searching: 'Research agent searching with Google grounding...',
    research_done: 'Research complete — awaiting editor',
    editor_reviewing: 'Senior Editor reviewing...',
    editor_approved: 'Editor approved — awaiting writer',
    writing: `${modelName || 'Writer'} generating article...`,
    written: 'Written — awaiting independence review',
    independence_review: 'Grok adversarial review + PubMed check...',
    independence_done: 'Independence review complete',
    editor_qc: 'Senior Editor QC review...',
    qc_approved: 'QC approved — publishing...',
    voice_rewrite_pending: 'Voice rewrite queued',
    rewriting_voice: 'Voice polish in progress...',
    voice_rewrite_done: 'Voice polish complete',
    publishing: 'Publishing to GitHub...',
    published: 'Published',
    failed: 'Failed',
  };
  return map[status] ?? status.replace(/_/g, ' ');
}

/** Score color helper — green for 7+, yellow for 5-6, red for <5. */
export function getScoreColor(score: number | null | undefined): string {
  if (score == null) return '#7d7871';
  if (score >= 7) return '#4ade80';
  if (score >= 5) return '#fbbf24';
  return '#f87171';
}

// ─── Fetch with Timeout ─────────────────────────────────────────────
// Wraps fetch with an AbortController timeout (default 60s).
// Rejects with a descriptive error on timeout.

const DEFAULT_TIMEOUT = 60_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number },
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  if (fetchInit.signal) {
    // Chain with existing signal
    fetchInit.signal.addEventListener('abort', () => controller.abort(fetchInit.signal!.reason));
  }
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeout);
  return fetch(input, { ...fetchInit, signal: controller.signal }).finally(() => clearTimeout(timer));
}
