// ─── Shared Admin Portal Types ──────────────────────────────────────────────
// Central type definitions for the admin CMS, pipeline monitor, and editor UI.
// Matches Supabase table schemas and Edge Function contracts.
// ────────────────────────────────────────────────────────────────────────────

// ─── ArticleRecord ─────────────────────────────────────────────────────────
// Matches the `articles` table in Supabase (see migrations/20260315_create_articles.sql)

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
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface TocEntry {
  id: string;
  title: string;
}

// ─── PipelineLog ───────────────────────────────────────────────────────────
// Matches the `daily_article_log` table (see migrations/20260322_daily_article_agent.sql)
// with the nested research_data JSONB structure used by the pipeline stages.

export type PipelineStatus =
  | 'started'
  | 'searching'
  | 'research_done'
  | 'editor_reviewing'
  | 'editor_approved'
  | 'writing'
  | 'written'
  | 'editor_qc'
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
  /** Populated after stage 2 (Senior Editor brief) */
  _editorBrief?: EditorBrief;
  /** Populated after stage 3 (article writing) */
  _article?: {
    metadata: Record<string, unknown>;
    svg: string;
    html: string;
    toc: TocEntry[];
    readTime: number;
  };
  /** Populated when Senior Editor QC requests revisions */
  _reviseInstructions?: string | null;
}

export interface PipelineLog {
  id: string;
  run_date: string;
  topic: string | null;
  slug: string | null;
  title: string | null;
  status: PipelineStatus;
  error: string | null;
  search_queries: unknown[];
  research_snippets: unknown[];
  research_data: PipelineResearchData | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Pipeline Stages ───────────────────────────────────────────────────────
// Maps individual statuses into the 4 high-level pipeline stages.

export type PipelineStage = 'research' | 'editor_brief' | 'write' | 'publish';

export const PIPELINE_STAGES: Record<PipelineStage, PipelineStatus[]> = {
  research: ['started', 'searching', 'research_done'],
  editor_brief: ['editor_reviewing', 'editor_approved'],
  write: ['writing', 'written'],
  publish: ['editor_qc', 'publishing', 'published'],
} as const;

/** Terminal statuses that indicate the pipeline run is complete. */
const TERMINAL_STATUSES = new Set<PipelineStatus>([
  'published',
  'failed',
]);

/** Active (in-flight) statuses where a stage is currently processing. */
const ACTIVE_PROCESSING_STATUSES = new Set<PipelineStatus>([
  'started',
  'searching',
  'editor_reviewing',
  'writing',
  'editor_qc',
  'publishing',
]);

// ─── EditorBrief ───────────────────────────────────────────────────────────
// The Senior Editor's creative brief, returned by stage 2 (editor_brief).
// Stored in research_data._editorBrief.

export interface EditorBriefDirections {
  tone: string;
  openWith: string;
  emphasize: string[];
  avoid: string[];
  closingDirection: string;
}

export interface EditorBrief {
  decision: 'approve' | 'kill';
  topicScore: number;
  headline: string;
  slug: string;
  description: string;
  angle: string;
  brief: EditorBriefDirections;
  categoryOverride: string | null;
  killReason: string | null;
}

// ─── QCResult ──────────────────────────────────────────────────────────────
// The Senior Editor's quality-control result, returned by stage 4 (editor_qc).

export interface QCEdits {
  headlineChanged: boolean;
  descriptionChanged: boolean;
  notes: string;
}

export interface QCResult {
  decision: 'publish' | 'revise' | 'kill';
  qualityScore: number;
  headline: string;
  description: string;
  edits: QCEdits;
  killReason: string | null;
  reviseInstructions: string | null;
}

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Extract the admin_token value from document cookies.
 * Returns an empty string if the cookie is not set.
 */
export function getAdminToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)admin_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Return the Supabase Edge Function base URL (e.g. `https://<ref>.supabase.co/functions/v1`).
 * Works in both Astro server context (`import.meta.env`) and client-side builds.
 */
export function getApiBase(): string {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const meta = import.meta as any;
  const url = (
    typeof process !== 'undefined' && process.env?.PUBLIC_SUPABASE_URL
      ? process.env.PUBLIC_SUPABASE_URL
      : meta.env?.PUBLIC_SUPABASE_URL ?? ''
  ).trim();
  return url ? `${url}/functions/v1` : '';
}

/**
 * Map any pipeline status string to its high-level stage.
 * Returns `null` for terminal/unknown statuses like `"failed"`.
 */
export function getStageForStatus(status: string): PipelineStage | null {
  for (const [stage, statuses] of Object.entries(PIPELINE_STAGES)) {
    if ((statuses as string[]).includes(status)) {
      return stage as PipelineStage;
    }
  }
  return null;
}

/** Human-readable labels for each pipeline stage. */
const STAGE_LABELS: Record<PipelineStage | 'failed', string> = {
  research: 'Research',
  editor_brief: 'Editor Review',
  write: 'Writing',
  publish: 'QC & Publish',
  failed: 'Failed',
};

/**
 * Get a human-readable label for a pipeline stage.
 * Falls back to title-casing the input if the stage is unrecognized.
 */
export function getStageLabel(stage: string): string {
  return (
    STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ??
    stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Format a timestamp string as a relative time display.
 * Examples: "just now", "2m ago", "3h ago", "5d ago"
 */
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

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/**
 * Whether a status represents an active (non-terminal) pipeline stage.
 * Returns `true` for any status that is still in progress or waiting to advance.
 * Returns `false` for `"published"` and `"failed"`.
 */
export function isActiveStatus(status: string): boolean {
  return !TERMINAL_STATUSES.has(status as PipelineStatus);
}

/**
 * Whether a status represents a stage that is currently processing
 * (as opposed to waiting at a checkpoint like `research_done` or `written`).
 */
export function isProcessingStatus(status: string): boolean {
  return ACTIVE_PROCESSING_STATUSES.has(status as PipelineStatus);
}
