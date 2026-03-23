import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────

interface PipelineLog {
  id: string;
  run_date: string;
  topic: string | null;
  slug: string | null;
  title: string | null;
  status: string;
  error: string | null;
  search_queries: string[] | null;
  research_snippets: string[] | null;
  created_at: string;
  updated_at: string;
  qc_score?: number | null;
  commit_url?: string | null;
  editor_decision?: string | null;
  editor_score?: number | null;
}

type PipelineStage = 'research' | 'editor_brief' | 'write' | 'qc_publish';

interface StageConfig {
  key: PipelineStage;
  icon: string;
  label: string;
  statuses: string[];
}

interface Props {
  initialLogs: PipelineLog[];
  initialArticleCount: number;
  apiBase: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const ARTICLE_GOAL = 100;
const POLL_INTERVAL = 15_000;

const STAGES: StageConfig[] = [
  {
    key: 'research',
    icon: '\uD83D\uDD0D',
    label: 'Research',
    statuses: ['started', 'searching', 'research_done'],
  },
  {
    key: 'editor_brief',
    icon: '\uD83D\uDCCB',
    label: 'Editor Brief',
    statuses: ['editor_reviewing', 'editor_approved'],
  },
  {
    key: 'write',
    icon: '\u270D\uFE0F',
    label: 'Write',
    statuses: ['writing', 'written'],
  },
  {
    key: 'qc_publish',
    icon: '\u2705',
    label: 'QC + Publish',
    statuses: ['editor_qc', 'publishing', 'published'],
  },
];

const STATUS_TEXT: Record<string, string> = {
  started: 'Initializing...',
  searching: 'Searching for trending topics...',
  research_done: 'Research complete \u2014 awaiting editor',
  editor_reviewing: 'Senior Editor reviewing...',
  editor_approved: 'Editor approved \u2014 awaiting writer',
  writing: 'Writing article...',
  written: 'Article written \u2014 awaiting QC',
  editor_qc: 'Senior Editor quality check...',
  publishing: 'Generating illustration & publishing...',
  published: 'Published \u2713',
  failed: 'Failed',
};

const ACTIVE_STATUSES = new Set([
  'started', 'searching', 'editor_reviewing', 'writing', 'editor_qc', 'publishing',
]);

// ─── Helpers ────────────────────────────────────────────────────────

function getOverallStatus(logs: PipelineLog[]): 'running' | 'waiting' | 'failed' | 'idle' {
  const active = logs.filter((l) => l.status !== 'published' && l.status !== 'failed');
  if (active.some((l) => ACTIVE_STATUSES.has(l.status))) return 'running';
  const recent = logs[0];
  if (recent?.status === 'failed') return 'failed';
  if (active.length > 0) return 'waiting';
  return 'idle';
}

function statusColor(status: 'running' | 'waiting' | 'failed' | 'idle'): string {
  switch (status) {
    case 'running': return '#16a34a';
    case 'waiting': return '#f59e0b';
    case 'failed': return '#dc2626';
    case 'idle': return '#78716c';
  }
}

function statusLabel(status: 'running' | 'waiting' | 'failed' | 'idle'): string {
  switch (status) {
    case 'running': return 'Running';
    case 'waiting': return 'Waiting';
    case 'failed': return 'Failed';
    case 'idle': return 'Idle';
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '\u2026';
}

function getStageForLog(log: PipelineLog): PipelineStage | null {
  for (const stage of STAGES) {
    if (stage.statuses.includes(log.status)) return stage.key;
  }
  return null;
}

function getAdminToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)admin_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// ─── Component ──────────────────────────────────────────────────────

export default function PipelineMonitor({ initialLogs, initialArticleCount, apiBase }: Props) {
  const [logs, setLogs] = useState<PipelineLog[]>(initialLogs);
  const [articleCount, setArticleCount] = useState(initialArticleCount);
  const [triggering, setTriggering] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch status ────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
      if (typeof data.articleCount === 'number') setArticleCount(data.articleCount);
      setLastPoll(new Date());
    } catch {
      // Silently fail — will retry on next poll
    }
  }, [apiBase]);

  // ─── Polling ─────────────────────────────────────────────────────

  useEffect(() => {
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  // ─── Live timer tick (forces re-render every 10s for timeAgo) ───

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(timer);
  }, []);

  // ─── Trigger run ─────────────────────────────────────────────────

  const triggerRun = async () => {
    setTriggering(true);
    try {
      await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ action: 'run' }),
      });
      setTimeout(fetchStatus, 2000);
    } catch {
      // Error handled by next poll
    } finally {
      setTriggering(false);
    }
  };

  // ─── Retry ───────────────────────────────────────────────────────

  const retryArticle = async (logId: string) => {
    setRetryingId(logId);
    try {
      await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ action: 'retry', logId }),
      });
      setTimeout(fetchStatus, 2000);
    } catch {
      // Error handled by next poll
    } finally {
      setRetryingId(null);
    }
  };

  // ─── Derived data ────────────────────────────────────────────────

  const overallStatus = getOverallStatus(logs);

  const stageLogsMap: Record<PipelineStage, PipelineLog[]> = {
    research: [],
    editor_brief: [],
    write: [],
    qc_publish: [],
  };

  const completedLogs: PipelineLog[] = [];
  const failedLogs: PipelineLog[] = [];

  for (const log of logs) {
    if (log.status === 'published') {
      completedLogs.push(log);
    } else if (log.status === 'failed') {
      failedLogs.push(log);
    } else {
      const stage = getStageForLog(log);
      if (stage) stageLogsMap[stage].push(log);
    }
  }

  const completedDisplay = completedLogs.slice(0, 5);
  const progressPct = Math.min(100, Math.round((articleCount / ARTICLE_GOAL) * 100));

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="pipeline-monitor">
      {/* ── Top Status Bar ── */}
      <div className="pipeline-status-bar">
        <div className="pipeline-status-left">
          <span
            className="pipeline-status-dot"
            style={{ backgroundColor: statusColor(overallStatus) }}
          />
          <span className="pipeline-status-label">{statusLabel(overallStatus)}</span>
          <span className="pipeline-poll-time">
            Polled {timeAgo(lastPoll.toISOString())} ago
          </span>
        </div>

        <div className="pipeline-status-center">
          <span className="pipeline-count">
            {articleCount} / {ARTICLE_GOAL}
          </span>
          <div className="pipeline-progress">
            <div
              className="pipeline-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="pipeline-status-right">
          <span className="pipeline-auto-label">Auto: every 24h</span>
          <button
            className="pipeline-trigger-btn"
            onClick={triggerRun}
            disabled={triggering || overallStatus === 'running'}
            aria-label="Trigger pipeline run"
          >
            {triggering ? (
              <>
                <span className="admin-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Triggering...
              </>
            ) : (
              'Trigger Run'
            )}
          </button>
        </div>
      </div>

      {/* ── Pipeline Stages ── */}
      <div className="pipeline-container">
        {STAGES.map((stage, i) => {
          const stageLogs = stageLogsMap[stage.key];
          return (
            <div key={stage.key} className="pipeline-stage-wrapper">
              <div className="pipeline-stage">
                <div className="pipeline-stage-header">
                  <span className="pipeline-stage-icon">{stage.icon}</span>
                  <span className="pipeline-stage-label">{stage.label}</span>
                  {stageLogs.length > 0 && (
                    <span className="pipeline-stage-count">{stageLogs.length}</span>
                  )}
                </div>
                <div className="pipeline-stage-body">
                  {stageLogs.length === 0 ? (
                    <div className="pipeline-empty">No items</div>
                  ) : (
                    stageLogs.map((log) => (
                      <PipelineCard
                        key={log.id}
                        log={log}
                        expanded={expandedId === log.id}
                        onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      />
                    ))
                  )}
                </div>
              </div>
              {i < STAGES.length - 1 && (
                <div className="pipeline-connector" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14m-4-4l4 4-4 4" stroke="#44403c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Completed Section ── */}
      {completedDisplay.length > 0 && (
        <div className="pipeline-completed">
          <h3 className="pipeline-section-title">
            Recently Published
            <span className="pipeline-section-count">{completedLogs.length}</span>
          </h3>
          <div className="pipeline-completed-list">
            {completedDisplay.map((log) => (
              <div key={log.id} className="pipeline-completed-item">
                <div className="pipeline-completed-info">
                  <span className="pipeline-completed-title">
                    {log.title || log.topic || 'Untitled'}
                  </span>
                  <span className="pipeline-completed-meta">
                    {log.slug && <code className="pipeline-slug">/{log.slug}</code>}
                    {log.qc_score != null && (
                      <span className="pipeline-qc-badge">
                        QC: {log.qc_score}
                      </span>
                    )}
                    <span className="pipeline-completed-time">
                      {timeAgo(log.updated_at)} ago
                    </span>
                  </span>
                </div>
                {log.commit_url && (
                  <a
                    href={log.commit_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pipeline-commit-link"
                    aria-label={`View commit for ${log.title || 'article'}`}
                  >
                    Commit
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Failed Section ── */}
      {failedLogs.length > 0 && (
        <div className="pipeline-failed">
          <h3 className="pipeline-section-title">
            Failed
            <span className="pipeline-section-count pipeline-section-count-error">
              {failedLogs.length}
            </span>
          </h3>
          <div className="pipeline-failed-list">
            {failedLogs.map((log) => (
              <div key={log.id} className="pipeline-failed-item">
                <div className="pipeline-failed-info">
                  <span className="pipeline-failed-title">
                    {log.topic || log.title || 'Unknown topic'}
                  </span>
                  <span className="pipeline-failed-error">
                    {log.error || 'Unknown error'}
                  </span>
                  <span className="pipeline-failed-time">
                    {timeAgo(log.updated_at)} ago
                  </span>
                </div>
                <button
                  className="pipeline-retry-btn"
                  onClick={() => retryArticle(log.id)}
                  disabled={retryingId === log.id}
                  aria-label={`Retry ${log.topic || 'failed article'}`}
                >
                  {retryingId === log.id ? (
                    <span className="admin-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                  ) : (
                    'Retry'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Card Sub-Component ────────────────────────────────────

interface PipelineCardProps {
  log: PipelineLog;
  expanded: boolean;
  onToggle: () => void;
}

function PipelineCard({ log, expanded, onToggle }: PipelineCardProps) {
  const isActive = ACTIVE_STATUSES.has(log.status);
  const displayTitle = log.title || log.topic || 'Pending topic...';
  const statusText = log.status === 'failed'
    ? (log.error || STATUS_TEXT.failed)
    : (STATUS_TEXT[log.status] || log.status);

  return (
    <div
      className={`pipeline-card${isActive ? ' active' : ''}${log.status === 'failed' ? ' failed' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      aria-expanded={expanded}
      aria-label={`${displayTitle} — ${statusText}`}
    >
      <div className="pipeline-card-header">
        <span className="pipeline-card-title">{truncate(displayTitle, 48)}</span>
        <span className="pipeline-card-time">{timeAgo(log.created_at)}</span>
      </div>

      <div className="pipeline-card-status">
        {isActive && <span className="pipeline-card-pulse" />}
        <span className="pipeline-card-status-text">{statusText}</span>
      </div>

      {log.editor_score != null && (
        <div className="pipeline-card-score">
          <span className="pipeline-score-badge" style={{
            backgroundColor: log.editor_score >= 7 ? '#052e16' : log.editor_score >= 4 ? '#422006' : '#450a0a',
            color: log.editor_score >= 7 ? '#4ade80' : log.editor_score >= 4 ? '#fbbf24' : '#f87171',
          }}>
            Score: {log.editor_score}/10
          </span>
          {log.editor_decision && (
            <span className="pipeline-decision-badge">
              {log.editor_decision}
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div className="pipeline-card-details">
          {log.slug && (
            <div className="pipeline-detail-row">
              <span className="pipeline-detail-label">Slug</span>
              <code className="pipeline-detail-value">{log.slug}</code>
            </div>
          )}
          <div className="pipeline-detail-row">
            <span className="pipeline-detail-label">Status</span>
            <span className="pipeline-detail-value">{log.status}</span>
          </div>
          <div className="pipeline-detail-row">
            <span className="pipeline-detail-label">Run Date</span>
            <span className="pipeline-detail-value">{log.run_date}</span>
          </div>
          <div className="pipeline-detail-row">
            <span className="pipeline-detail-label">Created</span>
            <span className="pipeline-detail-value">
              {new Date(log.created_at).toLocaleString()}
            </span>
          </div>
          <div className="pipeline-detail-row">
            <span className="pipeline-detail-label">Updated</span>
            <span className="pipeline-detail-value">
              {new Date(log.updated_at).toLocaleString()}
            </span>
          </div>
          {log.search_queries && log.search_queries.length > 0 && (
            <div className="pipeline-detail-row pipeline-detail-row-col">
              <span className="pipeline-detail-label">Search Queries</span>
              <ul className="pipeline-detail-list">
                {log.search_queries.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {log.research_snippets && log.research_snippets.length > 0 && (
            <div className="pipeline-detail-row pipeline-detail-row-col">
              <span className="pipeline-detail-label">Research Snippets</span>
              <ul className="pipeline-detail-list">
                {log.research_snippets.slice(0, 3).map((s, i) => (
                  <li key={i}>{truncate(s, 120)}</li>
                ))}
                {log.research_snippets.length > 3 && (
                  <li className="pipeline-detail-more">
                    +{log.research_snippets.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          )}
          {log.error && (
            <div className="pipeline-detail-row pipeline-detail-row-col">
              <span className="pipeline-detail-label">Error</span>
              <span className="pipeline-detail-error">{log.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
