import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────

interface ResearchData {
  topic?: string;
  headline_draft?: string;
  category?: string;
  why?: string;
  keyFindings?: string[];
  studies?: Array<{ title: string; journal: string; year: string; finding: string }>;
  _editorBrief?: {
    decision: string;
    topicScore: number;
    headline: string;
    slug: string;
    description: string;
    angle: string;
    killReason: string | null;
    brief?: {
      tone: string;
      openWith: string;
      emphasize: string[];
      avoid: string[];
      closingDirection: string;
    };
  };
  _article?: {
    metadata: Record<string, unknown>;
    html: string;
    readTime: number;
  };
}

interface PipelineLog {
  id: string;
  run_date: string;
  topic: string | null;
  slug: string | null;
  title: string | null;
  status: string;
  error: string | null;
  search_queries: string[] | null;
  research_snippets: Array<Record<string, string>> | null;
  research_data: ResearchData | null;
  created_at: string;
  completed_at: string | null;
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
  { key: 'research', icon: '🔍', label: 'Research', statuses: ['started', 'searching', 'research_done'] },
  { key: 'editor_brief', icon: '📋', label: 'Editor Brief', statuses: ['editor_reviewing', 'editor_approved'] },
  { key: 'write', icon: '✍️', label: 'Write', statuses: ['writing', 'written'] },
  { key: 'qc_publish', icon: '✅', label: 'QC + Publish', statuses: ['editor_qc', 'publishing', 'published'] },
];

const STATUS_TEXT: Record<string, string> = {
  started: 'Initializing...',
  searching: 'Searching for trending topics...',
  research_done: 'Research complete — awaiting editor',
  editor_reviewing: 'Senior Editor reviewing...',
  editor_approved: 'Editor approved — awaiting writer',
  writing: 'Writing article...',
  written: 'Article written — awaiting QC',
  editor_qc: 'Senior Editor quality check...',
  publishing: 'Generating illustration & publishing...',
  published: 'Published ✓',
  failed: 'Failed',
};

const ACTIVE_STATUSES = new Set([
  'started', 'searching', 'editor_reviewing', 'writing', 'editor_qc', 'publishing',
]);

// ─── Helpers ────────────────────────────────────────────────────────

function getOverallStatus(logs: PipelineLog[]): 'running' | 'waiting' | 'failed' | 'idle' {
  const nonTerminal = logs.filter(l => l.status !== 'published' && l.status !== 'failed');
  if (nonTerminal.some(l => ACTIVE_STATUSES.has(l.status))) return 'running';
  if (nonTerminal.length > 0) return 'waiting';
  const recent = logs[0];
  if (recent?.status === 'failed' && !isEditorKill(recent)) return 'failed';
  return 'idle';
}

function isEditorKill(log: PipelineLog): boolean {
  return log.status === 'failed' && (log.error || '').includes('Senior Editor killed');
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (isNaN(ms) || ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

function getStageForLog(log: PipelineLog): PipelineStage | null {
  for (const stage of STAGES) {
    if (stage.statuses.includes(log.status)) return stage.key;
  }
  return null;
}

function getEditorScore(log: PipelineLog): number | null {
  return log.research_data?._editorBrief?.topicScore ?? null;
}

function getEditorAngle(log: PipelineLog): string | null {
  return log.research_data?._editorBrief?.angle ?? null;
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
    } catch { /* retry on next poll */ }
  }, [apiBase]);

  useEffect(() => {
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStatus]);

  // Force re-render every 10s for live time updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const triggerRun = async () => {
    setTriggering(true);
    try {
      await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'run' }),
      });
      setTimeout(fetchStatus, 2000);
    } catch { /* next poll */ }
    finally { setTriggering(false); }
  };

  const retryArticle = async (logId: string) => {
    setRetryingId(logId);
    try {
      await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'retry', logId }),
      });
      setTimeout(fetchStatus, 2000);
    } catch { /* next poll */ }
    finally { setRetryingId(null); }
  };

  // ─── Derived ────────────────────────────────────────────────────

  const overallStatus = getOverallStatus(logs);

  const stageLogsMap: Record<PipelineStage, PipelineLog[]> = {
    research: [], editor_brief: [], write: [], qc_publish: [],
  };
  const completedLogs: PipelineLog[] = [];
  const editorKills: PipelineLog[] = [];
  const failedLogs: PipelineLog[] = [];

  for (const log of logs) {
    if (log.status === 'published') {
      completedLogs.push(log);
    } else if (log.status === 'failed') {
      if (isEditorKill(log)) {
        editorKills.push(log);
      } else {
        failedLogs.push(log);
      }
    } else {
      const stage = getStageForLog(log);
      if (stage) stageLogsMap[stage].push(log);
    }
  }

  const progressPct = Math.min(100, Math.round((articleCount / ARTICLE_GOAL) * 100));
  const statusColors: Record<string, string> = {
    running: '#16a34a', waiting: '#f59e0b', failed: '#dc2626', idle: '#78716c',
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div style={{ padding: '0.5rem 0' }}>
      {/* ── Top Status Bar ── */}
      <div className="pipeline-status-bar">
        <div className="pipeline-status-indicator">
          <span className={`pipeline-status-dot ${overallStatus}`} />
          <span style={{ color: statusColors[overallStatus], fontWeight: 600 }}>
            {overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}
          </span>
          <span style={{ color: '#57534e', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
            Polled {timeAgo(lastPoll.toISOString())}
          </span>
        </div>

        <div className="pipeline-progress-wrap">
          <span className="pipeline-progress-count">{articleCount} / {ARTICLE_GOAL}</span>
          <div className="pipeline-progress-bar">
            <div className="pipeline-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="pipeline-quick-actions">
          <span className="pipeline-auto-label">Auto: every 5 min</span>
          <button
            className="pipeline-trigger-btn primary"
            onClick={triggerRun}
            disabled={triggering || overallStatus === 'running'}
          >
            {triggering ? 'Triggering…' : 'Trigger Run'}
          </button>
        </div>
      </div>

      {/* ── 4-Stage Pipeline ── */}
      <div className="pipeline-container">
        {STAGES.map((stage) => {
          const items = stageLogsMap[stage.key];
          return (
            <div key={stage.key} className="pipeline-stage">
              <div className="pipeline-stage-header">
                <span className="pipeline-stage-icon">{stage.icon}</span>
                {stage.label}
                <span className={`pipeline-stage-count${items.length > 0 ? ' has-items' : ''}`}>
                  {items.length}
                </span>
              </div>
              <div className="pipeline-stage-body">
                {items.length === 0 ? (
                  <div className="pipeline-stage-empty">Waiting for articles</div>
                ) : (
                  items.map(log => (
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
          );
        })}
      </div>

      {/* ── Recently Published ── */}
      {completedLogs.length > 0 && (
        <section>
          <h3 className="pipeline-section-title">
            Recently Published — {completedLogs.length}
          </h3>
          <div className="pipeline-completed-list">
            {completedLogs.slice(0, 5).map(log => (
              <div key={log.id} className="pipeline-card completed" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="pipeline-card-title" style={{ marginBottom: '0.25rem' }}>
                    {log.title || log.topic || 'Untitled'}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6875rem', color: '#78716c' }}>
                    {log.slug && <code style={{ color: '#57534e' }}>/{log.slug}</code>}
                    <span>{timeAgo(log.completed_at || log.created_at)}</span>
                  </div>
                </div>
                {log.slug && (
                  <a
                    href={`/articles/${log.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pipeline-retry-btn"
                    style={{ textDecoration: 'none' }}
                  >
                    View →
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Editor Decisions (kills) ── */}
      {editorKills.length > 0 && (
        <section>
          <h3 className="pipeline-section-title">
            Editor Decisions — {editorKills.length} killed
          </h3>
          <div className="pipeline-completed-list">
            {editorKills.map(log => {
              const reason = (log.error || '').replace('Senior Editor killed: ', '');
              return (
                <div key={log.id} className="pipeline-card" style={{ borderLeftColor: '#f59e0b', borderLeftWidth: '3px' }}>
                  <div className="pipeline-card-title" style={{ color: '#a8a29e' }}>
                    {log.title || log.topic || 'Untitled'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.375rem', fontStyle: 'italic' }}>
                    Killed: {truncate(reason, 200)}
                  </div>
                  <div className="pipeline-card-time" style={{ marginTop: '0.25rem' }}>
                    {timeAgo(log.completed_at || log.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Actual Failures ── */}
      {failedLogs.length > 0 && (
        <section>
          <h3 className="pipeline-section-title" style={{ color: '#dc2626' }}>
            Errors — {failedLogs.length}
          </h3>
          <div className="pipeline-failed-list">
            {failedLogs.map(log => (
              <div key={log.id} className="pipeline-card failed">
                <div className="pipeline-card-title">
                  {log.title || log.topic || 'Unknown topic'}
                </div>
                <div className="pipeline-card-error">
                  {log.error || 'Unknown error'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                  <span className="pipeline-card-time">
                    {timeAgo(log.completed_at || log.created_at)}
                  </span>
                  <button
                    className="pipeline-retry-btn"
                    onClick={() => retryArticle(log.id)}
                    disabled={retryingId === log.id}
                  >
                    {retryingId === log.id ? 'Retrying…' : 'Retry'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Pipeline Card ──────────────────────────────────────────────────

function PipelineCard({ log, expanded, onToggle }: { log: PipelineLog; expanded: boolean; onToggle: () => void }) {
  const isActive = ACTIVE_STATUSES.has(log.status);
  const displayTitle = log.title || log.topic || 'Pending topic…';
  const statusText = STATUS_TEXT[log.status] || log.status;
  const score = getEditorScore(log);
  const angle = getEditorAngle(log);

  return (
    <div
      className={`pipeline-card${isActive ? ' active' : ''}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
    >
      <div className="pipeline-card-title">{truncate(displayTitle, 60)}</div>
      <div className="pipeline-card-status">{statusText}</div>
      <div className="pipeline-card-time">{timeAgo(log.created_at)}</div>

      {score !== null && (
        <div className="pipeline-card-meta">
          <span className={`pipeline-card-score ${score >= 7 ? 'high' : score >= 4 ? 'mid' : 'low'}`}>
            Score: {score}/10
          </span>
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #44403c', fontSize: '0.75rem' }}>
          {angle && (
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: '#78716c', fontWeight: 600 }}>Angle: </span>
              <span style={{ color: '#a8a29e', fontStyle: 'italic' }}>{angle}</span>
            </div>
          )}
          {log.slug && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: '#78716c' }}>Slug: </span>
              <code style={{ color: '#57534e' }}>{log.slug}</code>
            </div>
          )}
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: '#78716c' }}>Status: </span>
            <span style={{ color: '#a8a29e' }}>{log.status}</span>
          </div>
          <div>
            <span style={{ color: '#78716c' }}>Started: </span>
            <span style={{ color: '#a8a29e' }}>{new Date(log.created_at).toLocaleTimeString()}</span>
          </div>
          {log.research_data?.category && (
            <div style={{ marginTop: '0.25rem' }}>
              <span style={{ color: '#78716c' }}>Category: </span>
              <span style={{ color: '#a8a29e' }}>{log.research_data.category}</span>
            </div>
          )}
          {log.search_queries && log.search_queries.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <span style={{ color: '#78716c', fontWeight: 600 }}>Key Findings:</span>
              <ul style={{ margin: '0.25rem 0 0 1rem', color: '#78716c' }}>
                {log.search_queries.slice(0, 3).map((q, i) => (
                  <li key={i} style={{ marginBottom: '0.125rem' }}>{truncate(String(q).replace(/<[^>]+>/g, ''), 100)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
