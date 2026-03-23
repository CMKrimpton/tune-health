import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────

interface ResearchData {
  topic?: string;
  headline_draft?: string;
  category?: string;
  why?: string;
  keyFindings?: string[];
  candidates?: Array<{
    rank: number;
    topic: string;
    headline_draft: string;
    why: string;
    category: string;
    keyFindings?: string[];
  }>;
  studies?: Array<{ title: string; journal: string; year: string; finding: string }>;
  _editorBrief?: {
    decision: string;
    topicScore: number;
    headline: string;
    slug: string;
    description: string;
    angle: string;
    killReason: string | null;
    chosenCandidate?: number;
    candidateScores?: Array<{ rank: number; score: number; verdict: string }>;
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
  _independenceReview?: {
    overallAssessment: string;
    independenceScore: number | null;
    annotations: Array<{
      type: string;
      severity: string;
      location: string;
      observation: string;
      suggestion: string;
    }>;
    strengths: string[];
    summary: string;
  };
  _queueId?: string | null;
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

interface QueueItem {
  id: string;
  topic: string;
  notes: string | null;
  category: string | null;
  priority: number;
  expedite: boolean;
  source: string;
  status: string;
  created_at: string;
}

type PipelineStage = 'research' | 'editor_brief' | 'write' | 'independence' | 'qc_publish';

interface StageConfig {
  key: PipelineStage;
  icon: string;
  label: string;
  model: string;
  modelColor: string;
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
  { key: 'research', icon: '🔍', label: 'Research', model: 'Sonnet 4.6', modelColor: '#f97316', statuses: ['started', 'searching', 'research_done'] },
  { key: 'editor_brief', icon: '📋', label: 'Editor', model: 'Sonnet 4.6', modelColor: '#f97316', statuses: ['editor_reviewing', 'editor_approved'] },
  { key: 'write', icon: '✍️', label: 'Write', model: 'Opus 4.6', modelColor: '#a855f7', statuses: ['writing', 'written'] },
  { key: 'independence', icon: '⚖️', label: 'Independence', model: 'Grok 3', modelColor: '#3b82f6', statuses: ['independence_review', 'independence_done'] },
  { key: 'qc_publish', icon: '✅', label: 'QC + Publish', model: 'Sonnet 4.6', modelColor: '#f97316', statuses: ['editor_qc', 'publishing', 'published'] },
];

const STATUS_TEXT: Record<string, string> = {
  started: 'Initializing...',
  searching: 'Finding 3-5 trending topics...',
  research_done: 'Research complete — awaiting editor pick',
  editor_reviewing: 'Senior Editor picking best topic...',
  editor_approved: 'Editor approved — queued for Opus',
  writing: 'Opus writing article...',
  written: 'Written — awaiting independence review',
  independence_review: 'Grok checking editorial independence...',
  independence_done: 'Independence reviewed — awaiting QC',
  editor_qc: 'Senior Editor final QC...',
  publishing: 'Generating illustration & publishing...',
  published: 'Published',
  failed: 'Failed',
};

const ACTIVE_STATUSES = new Set([
  'started', 'searching', 'editor_reviewing', 'writing', 'independence_review', 'editor_qc', 'publishing',
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
  return text.length <= max ? text : text.slice(0, max - 1) + '\u2026';
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

function getIndependenceScore(log: PipelineLog): number | null {
  return log.research_data?._independenceReview?.independenceScore ?? null;
}

function getAdminToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)admin_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// ─── Component ──────────────────────────────────────────────────────

export default function PipelineMonitor({ initialLogs, initialArticleCount, apiBase }: Props) {
  const [logs, setLogs] = useState<PipelineLog[]>(initialLogs);
  const [articleCount, setArticleCount] = useState(initialArticleCount);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<Date>(new Date());
  const [newTopic, setNewTopic] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newExpedite, setNewExpedite] = useState(false);
  const [queueing, setQueueing] = useState(false);
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
      if (data.queue) setQueue(data.queue);
      setLastPoll(new Date());
    } catch { /* retry on next poll */ }
  }, [apiBase]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStatus]);

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

  const queueTopic = async () => {
    if (!newTopic.trim()) return;
    setQueueing(true);
    try {
      await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({
          action: 'queue-topic',
          topic: newTopic.trim(),
          category: newCategory || undefined,
          expedite: newExpedite,
        }),
      });
      setNewTopic('');
      setNewCategory('');
      setNewExpedite(false);
      setTimeout(fetchStatus, 1000);
    } catch { /* next poll */ }
    finally { setQueueing(false); }
  };

  const deleteQueueItem = async (queueId: string) => {
    try {
      await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'delete-queue', queueId }),
      });
      setTimeout(fetchStatus, 500);
    } catch { /* ignore */ }
  };

  // ─── Derived ────────────────────────────────────────────────────

  const overallStatus = getOverallStatus(logs);

  const stageLogsMap: Record<PipelineStage, PipelineLog[]> = {
    research: [], editor_brief: [], write: [], independence: [], qc_publish: [],
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

  const inPipeline = Object.values(stageLogsMap).reduce((n, arr) => n + arr.length, 0);
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
          {inPipeline > 0 && (
            <span style={{ color: '#a8a29e', fontSize: '0.7rem', marginLeft: '0.4rem' }}>
              {inPipeline} in flight
            </span>
          )}
          <span style={{ color: '#57534e', fontSize: '0.7rem', marginLeft: '0.5rem' }}>
            {timeAgo(lastPoll.toISOString())}
          </span>
        </div>

        <div className="pipeline-progress-wrap">
          <span className="pipeline-progress-count">{articleCount} / {ARTICLE_GOAL}</span>
          <div className="pipeline-progress-bar">
            <div className="pipeline-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="pipeline-quick-actions">
          <span className="pipeline-auto-label">Self-chaining + 5m cron</span>
          <button
            className="pipeline-trigger-btn primary"
            onClick={triggerRun}
            disabled={triggering || overallStatus === 'running'}
          >
            {triggering ? 'Triggering\u2026' : 'Trigger Run'}
          </button>
        </div>
      </div>

      {/* ── 5-Stage Pipeline ── */}
      <div className="pipeline-container">
        {STAGES.map((stage) => {
          const items = stageLogsMap[stage.key];
          return (
            <div key={stage.key} className="pipeline-stage">
              <div className="pipeline-stage-header">
                <span className="pipeline-stage-icon">{stage.icon}</span>
                <span>{stage.label}</span>
                <span style={{ fontSize: '0.5625rem', color: stage.modelColor, fontWeight: 600, marginLeft: '0.25rem', opacity: 0.8 }}>
                  {stage.model}
                </span>
                <span className={`pipeline-stage-count${items.length > 0 ? ' has-items' : ''}`}>
                  {items.length}
                </span>
              </div>
              <div className="pipeline-stage-body">
                {items.length === 0 ? (
                  <div className="pipeline-stage-empty">Waiting</div>
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

      {/* ── Topic Queue ── */}
      <section style={{ marginTop: '1rem' }}>
        <h3 className="pipeline-section-title">
          Topic Queue {queue.filter(q => q.status === 'queued').length > 0 && (
            <span style={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 400 }}>
              {' '}{queue.filter(q => q.status === 'queued').length} queued
            </span>
          )}
        </h3>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Topic idea (e.g. 'Microbiome-sleep connection')"
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') queueTopic(); }}
            style={{ flex: 1, minWidth: '200px', padding: '0.5rem 0.75rem', background: '#292524', border: '1px solid #44403c', borderRadius: '6px', color: '#e7e6e3', fontSize: '0.8125rem' }}
          />
          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            style={{ padding: '0.5rem', background: '#292524', border: '1px solid #44403c', borderRadius: '6px', color: '#a8a29e', fontSize: '0.8125rem' }}
          >
            <option value="">Category</option>
            {['Neuroscience', 'Mental Health', 'Longevity', 'Clinical Evidence', 'Environmental Health', 'Nutrition', 'Fitness', 'Sleep Science', 'Pharmacology'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#a8a29e', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={newExpedite}
              onChange={e => setNewExpedite(e.target.checked)}
              style={{ accentColor: '#dc2626' }}
            />
            Expedite
          </label>
          <button
            onClick={queueTopic}
            disabled={queueing || !newTopic.trim()}
            className="pipeline-trigger-btn primary"
            style={{ fontSize: '0.8125rem' }}
          >
            {queueing ? 'Adding\u2026' : '+ Queue'}
          </button>
        </div>

        {queue.filter(q => q.status === 'queued').length > 0 && (
          <div className="pipeline-completed-list">
            {queue.filter(q => q.status === 'queued').map(item => (
              <div key={item.id} className="pipeline-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeftColor: item.expedite ? '#dc2626' : '#44403c', borderLeftWidth: '3px' }}>
                <div style={{ flex: 1 }}>
                  <div className="pipeline-card-title" style={{ fontSize: '0.8125rem' }}>{item.topic}</div>
                  <div style={{ fontSize: '0.6875rem', color: '#78716c', display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    {item.category && <span>{item.category}</span>}
                    {item.expedite && <span style={{ color: '#dc2626', fontWeight: 600 }}>EXPEDITE</span>}
                    <span>Priority: {item.priority}</span>
                  </div>
                </div>
                <button
                  onClick={() => deleteQueueItem(item.id)}
                  style={{ background: 'none', border: 'none', color: '#78716c', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem' }}
                  aria-label="Remove from queue"
                >
                  \u00d7
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Recently Published ── */}
      {completedLogs.length > 0 && (
        <section>
          <h3 className="pipeline-section-title">
            Recently Published \u2014 {completedLogs.length}
          </h3>
          <div className="pipeline-completed-list">
            {completedLogs.slice(0, 5).map(log => {
              const indScore = getIndependenceScore(log);
              return (
                <div key={log.id} className="pipeline-card completed" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="pipeline-card-title" style={{ marginBottom: '0.25rem' }}>
                      {log.title || log.topic || 'Untitled'}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6875rem', color: '#78716c' }}>
                      {log.slug && <code style={{ color: '#57534e' }}>/{log.slug}</code>}
                      {indScore !== null && (
                        <span style={{ color: indScore >= 7 ? '#16a34a' : indScore >= 4 ? '#f59e0b' : '#dc2626' }}>
                          Independence: {indScore}/10
                        </span>
                      )}
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
                      View \u2192
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Editor Decisions (kills) ── */}
      {editorKills.length > 0 && (
        <section>
          <h3 className="pipeline-section-title">
            Editor Decisions \u2014 {editorKills.length} killed
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
            Errors \u2014 {failedLogs.length}
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
                    {retryingId === log.id ? 'Retrying\u2026' : 'Retry'}
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
  const displayTitle = log.title || log.topic || 'Pending topic\u2026';
  const statusText = STATUS_TEXT[log.status] || log.status;
  const score = getEditorScore(log);
  const angle = getEditorAngle(log);
  const indScore = getIndependenceScore(log);
  const indReview = log.research_data?._independenceReview;
  const candidates = log.research_data?.candidates;
  const candidateScores = log.research_data?._editorBrief?.candidateScores;

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

      {(score !== null || indScore !== null) && (
        <div className="pipeline-card-meta">
          {score !== null && (
            <span className={`pipeline-card-score ${score >= 7 ? 'high' : score >= 4 ? 'mid' : 'low'}`}>
              Editor: {score}/10
            </span>
          )}
          {indScore !== null && (
            <span className={`pipeline-card-score ${indScore >= 7 ? 'high' : indScore >= 4 ? 'mid' : 'low'}`} style={{ marginLeft: '0.5rem' }}>
              Independence: {indScore}/10
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #44403c', fontSize: '0.75rem' }}>
          {/* Candidates from research */}
          {candidates && candidates.length > 1 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <span style={{ color: '#78716c', fontWeight: 600 }}>Research Candidates:</span>
              {candidates.map((c, i) => {
                const cScore = candidateScores?.find(cs => cs.rank === c.rank);
                return (
                  <div key={i} style={{ marginTop: '0.25rem', paddingLeft: '0.5rem', borderLeft: '2px solid #44403c' }}>
                    <span style={{ color: cScore ? (cScore.score >= 7 ? '#16a34a' : '#f59e0b') : '#a8a29e' }}>
                      #{c.rank}: {c.headline_draft || c.topic}
                    </span>
                    {cScore && <span style={{ color: '#78716c', marginLeft: '0.5rem' }}>({cScore.score}/10) {cScore.verdict}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {angle && (
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: '#78716c', fontWeight: 600 }}>Angle: </span>
              <span style={{ color: '#a8a29e', fontStyle: 'italic' }}>{angle}</span>
            </div>
          )}

          {/* Independence Review */}
          {indReview && indReview.overallAssessment !== 'skipped' && (
            <div style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#1c1917', borderRadius: '6px' }}>
              <span style={{ color: '#78716c', fontWeight: 600 }}>Grok Independence: </span>
              <span style={{
                color: indReview.overallAssessment === 'independent' ? '#16a34a'
                  : indReview.overallAssessment === 'minor_concerns' ? '#f59e0b'
                  : '#dc2626'
              }}>
                {indReview.overallAssessment} ({indReview.independenceScore}/10)
              </span>
              {indReview.annotations && indReview.annotations.length > 0 && (
                <div style={{ marginTop: '0.375rem' }}>
                  {indReview.annotations.slice(0, 3).map((a, i) => (
                    <div key={i} style={{ color: a.severity === 'high' ? '#dc2626' : '#f59e0b', fontSize: '0.6875rem', marginTop: '0.125rem' }}>
                      [{a.type}] {a.observation}
                    </div>
                  ))}
                </div>
              )}
              {indReview.summary && (
                <div style={{ color: '#78716c', fontSize: '0.6875rem', marginTop: '0.25rem', fontStyle: 'italic' }}>
                  {indReview.summary}
                </div>
              )}
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
          {log.research_data?._queueId && (
            <div style={{ marginTop: '0.25rem' }}>
              <span style={{ color: '#f59e0b', fontSize: '0.6875rem' }}>From topic queue</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
