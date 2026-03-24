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
    score: number | null;
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
  cost_usd: number | string | null;
  model_used: string | null;
  editor_score: number | null;
  grok_score: number | null;
  source: string | null;
}

const PEN_NAMES: Record<string, string> = {
  "claude-sonnet-4-6": "Max Quilici",
  "claude-sonnet-4-20250514": "Max Quilici",
  "claude-opus-4-20250514": "Carl Lundin",
  "grok-3": "Linda Carnes",
  "gemini-2.5-flash": "Christine Wright",
};

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
  initialTotalCost?: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const ARTICLE_GOAL = 100;
const POLL_INTERVAL = 15_000;

const STAGES: StageConfig[] = [
  { key: 'research', icon: '🔍', label: 'Research', model: 'Gemini + Sonnet', modelColor: '#fbbf24', statuses: ['started', 'searching', 'research_done'] },
  { key: 'editor_brief', icon: '📋', label: 'Editor', model: 'Sonnet → Grok → Gemini', modelColor: '#f97316', statuses: ['editor_reviewing', 'editor_approved'] },
  { key: 'write', icon: '✍️', label: 'Write', model: 'Rotates hourly', modelColor: '#a78bfa', statuses: ['writing', 'written'] },
  { key: 'independence', icon: '⚖️', label: 'Independence', model: 'Grok 3', modelColor: '#3b82f6', statuses: ['independence_review', 'independence_done'] },
  { key: 'qc_publish', icon: '✅', label: 'QC + Publish', model: 'Sonnet + GPT Image', modelColor: '#f97316', statuses: ['editor_qc', 'publishing', 'published'] },
];

// Current primary writer model based on UTC hour (matches backend pickWriterModel)
function getCurrentWriterModel(): { name: string; color: string } {
  const hour = new Date().getUTCHours();
  if (hour % 3 === 0) return { name: 'Sonnet', color: '#f97316' };
  if (hour % 3 === 1) return { name: 'Grok', color: '#3b82f6' };
  return { name: 'Gemini', color: '#fbbf24' };
}

function getStatusText(status: string, log?: PipelineLog): string {
  const modelName = log?.model_used ? (PEN_NAMES[log.model_used] || log.model_used.split('-')[0]) : null;
  const writerModel = getCurrentWriterModel();
  const map: Record<string, string> = {
    started: 'Initializing...',
    searching: 'Gemini searching + Sonnet structuring...',
    research_done: 'Research complete — awaiting editor',
    editor_reviewing: 'Senior Editor scoring candidates...',
    editor_approved: 'Approved — queued for writing',
    writing: `${modelName || writerModel.name} writing article...`,
    written: 'Written — awaiting Grok review',
    independence_review: 'Grok 3 reviewing independence...',
    independence_done: 'Reviewed — awaiting QC',
    editor_qc: 'Sonnet final QC + headline polish...',
    publishing: 'GPT Image illustrating + GitHub commit...',
    published: 'Published',
    failed: 'Failed',
  };
  return map[status] || status;
}

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
  const r = log.research_data?._independenceReview;
  return r?.independenceScore ?? r?.score ?? null;
}

function getAdminToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)admin_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function formatCost(value: number | string | null | undefined): string {
  const n = parseFloat(String(value ?? '0')) || 0;
  if (n === 0) return '-';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

// ─── Component ──────────────────────────────────────────────────────

export default function PipelineMonitor({ initialLogs, initialArticleCount, apiBase, initialTotalCost }: Props) {
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
  const [killingId, setKillingId] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState<number>(initialTotalCost || 0);
  const [scouting, setScouting] = useState<string | null>(null);
  const [scoutResult, setScoutResult] = useState<string | null>(null);
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
      if (typeof data.totalCost === 'number') setTotalCost(data.totalCost);
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

  const [produceResult, setProduceResult] = useState<string | null>(null);

  const triggerRun = async () => {
    setTriggering(true);
    setProduceResult(null);
    try {
      const res = await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'produce' }),
      });
      const data = await res.json();
      if (data.skipped) {
        setProduceResult(`Skipped: ${data.message}`);
      } else if (data.error) {
        setProduceResult(`Error: ${data.error}${data.detail ? ' — ' + data.detail : ''}`);
      } else {
        setProduceResult(data.message || `Started: ${data.stage || 'produce'}`);
      }
      setTimeout(fetchStatus, 3000);
    } catch (err) {
      setProduceResult(`Network error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    finally { setTriggering(false); }
  };

  const triggerSingleScout = async (model: string) => {
    setScouting(model);
    setScoutResult(null);
    try {
      const res = await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'scout', scoutModel: model }),
      });
      const data = await res.json();
      setScoutResult(`${model}: ${data.message || data.error || 'done'}`);
    } catch (err) {
      setScoutResult(`${model}: ${err instanceof Error ? err.message : 'failed'}`);
    }
    setScouting(null);
    setTimeout(fetchStatus, 2000);
  };

  const triggerScout = async () => {
    const models = ['gemini', 'sonnet', 'grok'];
    setScoutResult(null);
    for (const model of models) {
      setScouting(model);
      try {
        const res = await fetch(`${apiBase}/daily-article-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
          body: JSON.stringify({ action: 'scout', scoutModel: model }),
        });
        const data = await res.json();
        setScoutResult(prev => (prev ? prev + '\n' : '') + `${model}: ${data.message || data.error || 'done'}`);
      } catch { /* continue to next */ }
    }
    setScouting(null);
    setTimeout(fetchStatus, 2000);
  };

  const requeueFromFailed = async (logId: string, topic: string) => {
    try {
      await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'queue-topic', topic, priority: 1, expedite: true }),
      });
      setTimeout(fetchStatus, 1000);
    } catch { /* ignore */ }
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

  const produceFromQueue = async (queueId: string, topic: string) => {
    if (!confirm(`Produce "${topic.replace(/\*\*/g, '').slice(0, 80)}" now? This will start the full pipeline.`)) return;
    setTriggering(true);
    setProduceResult(null);
    try {
      // First expedite this item so it's picked first
      await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'update-queue', queueId, expedite: true, priority: 0 }),
      });
      // Then trigger produce
      const res = await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'produce' }),
      });
      const data = await res.json();
      if (data.skipped) {
        setProduceResult(`Skipped: ${data.message}`);
      } else if (data.error) {
        setProduceResult(`Error: ${data.error}${data.detail ? ' — ' + data.detail : ''}`);
      } else {
        setProduceResult(data.message || `Started producing topic`);
      }
      setTimeout(fetchStatus, 3000);
    } catch (err) {
      setProduceResult(`Network error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    finally { setTriggering(false); }
  };

  const updateQueueItem = async (queueId: string, updates: Record<string, unknown>) => {
    try {
      await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'update-queue', queueId, ...updates }),
      });
      // Optimistic update for expedite/priority
      setQueue(prev => prev.map(q => q.id === queueId ? { ...q, ...updates } as QueueItem : q));
      setTimeout(fetchStatus, 1000);
    } catch { /* next poll */ }
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

  const killArticle = async (logId: string) => {
    if (!confirm('Kill this article? It will be marked as failed and removed from the pipeline.')) return;
    setKillingId(logId);
    try {
      await fetch(`${apiBase}/daily-article-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'kill-article', logId, reason: 'Killed by admin from Mission Control' }),
      });
      setTimeout(fetchStatus, 1000);
    } catch { /* ignore */ }
    finally { setKillingId(null); }
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

        {totalCost > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.5rem', background: '#1c1917', borderRadius: '6px', border: '1px solid #44403c' }}>
            <span style={{ fontSize: '0.6875rem', color: '#78716c' }}>Total Spend</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: totalCost > 50 ? '#f87171' : totalCost > 20 ? '#f59e0b' : '#a8a29e', fontVariantNumeric: 'tabular-nums' }}>
              ${totalCost.toFixed(2)}
            </span>
          </div>
        )}

        <div className="pipeline-quick-actions">
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.5625rem', color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.25rem' }}>Scout</span>
            {[
              { id: 'gemini', label: 'Gemini', color: '#fbbf24' },
              { id: 'sonnet', label: 'Sonnet', color: '#f97316' },
              { id: 'grok', label: 'Grok', color: '#3b82f6' },
            ].map(s => (
              <button
                key={s.id}
                className="pipeline-trigger-btn"
                onClick={() => triggerSingleScout(s.id)}
                disabled={scouting !== null}
                style={{ padding: '0.3125rem 0.625rem', fontSize: '0.6875rem', borderColor: scouting === s.id ? s.color : undefined, color: scouting === s.id ? s.color : undefined }}
              >
                {scouting === s.id ? '\u2026' : s.label}
              </button>
            ))}
            <button
              className="pipeline-trigger-btn"
              onClick={triggerScout}
              disabled={scouting !== null}
              style={{ padding: '0.3125rem 0.625rem', fontSize: '0.6875rem' }}
            >
              {scouting ? `${scouting}\u2026` : 'All 3'}
            </button>
          </div>
          <button
            className="pipeline-trigger-btn primary"
            onClick={triggerRun}
            disabled={triggering || overallStatus === 'running'}
          >
            {triggering ? 'Producing\u2026' : 'Produce Now'}
          </button>
        </div>
      </div>

      {/* ── Action Results ── */}
      {scoutResult && (
        <div style={{ padding: '0.5rem 0.75rem', background: '#052e16', border: '1px solid #166534', borderRadius: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem', color: '#86efac', whiteSpace: 'pre-line' }}>
          {scoutResult}
          <button onClick={() => setScoutResult(null)} style={{ marginLeft: '0.75rem', background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', fontSize: '0.75rem' }}>{'\u00d7 dismiss'}</button>
        </div>
      )}
      {produceResult && (
        <div style={{ padding: '0.5rem 0.75rem', background: produceResult.includes('Error') || produceResult.includes('Skipped') ? '#450a0a' : '#052e16', border: `1px solid ${produceResult.includes('Error') || produceResult.includes('Skipped') ? '#991b1b' : '#166534'}`, borderRadius: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem', color: produceResult.includes('Error') || produceResult.includes('Skipped') ? '#fca5a5' : '#86efac' }}>
          {produceResult}
          <button onClick={() => setProduceResult(null)} style={{ marginLeft: '0.75rem', background: 'none', border: 'none', color: '#a8a29e', cursor: 'pointer', fontSize: '0.75rem' }}>{'\u00d7 dismiss'}</button>
        </div>
      )}

      {/* ── 5-Stage Pipeline ── */}
      <div className="pipeline-container">
        {STAGES.map((stage) => {
          const items = stageLogsMap[stage.key];
          const writerInfo = getCurrentWriterModel();
          const displayModel = stage.key === 'write' ? `${writerInfo.name} (primary)` : stage.model;
          const displayColor = stage.key === 'write' ? writerInfo.color : stage.modelColor;
          return (
            <div key={stage.key} className="pipeline-stage">
              <div className="pipeline-stage-header">
                <span className="pipeline-stage-icon">{stage.icon}</span>
                <span>{stage.label}</span>
                <span style={{ fontSize: '0.5625rem', color: displayColor, fontWeight: 600, marginLeft: '0.25rem', opacity: 0.8 }}>
                  {displayModel}
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
                      onKill={() => killArticle(log.id)}
                      killing={killingId === log.id}
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

        {queue.length > 0 && (
          <div className="pipeline-completed-list">
            {queue.map(item => {
              const isActive = item.status === 'in_progress' || item.status === 'assigned';
              const isQueued = item.status === 'queued';
              const cleanTopic = item.topic.replace(/\*\*/g, '').replace(/^[\s\-]*Topic\s*Description\s*:?\s*/i, '').trim();
              return (
                <div key={item.id} className="pipeline-card" style={{ borderLeftColor: item.expedite ? '#dc2626' : isActive ? '#16a34a' : '#44403c', borderLeftWidth: '3px', opacity: isActive ? 1 : 0.85 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pipeline-card-title" style={{ fontSize: '0.8125rem' }}>{cleanTopic}</div>
                      <div style={{ fontSize: '0.6875rem', color: '#78716c', display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                        {item.category && <span>{item.category}</span>}
                        {item.expedite && <span style={{ color: '#dc2626', fontWeight: 600 }}>EXPEDITE</span>}
                        {isActive && <span style={{ color: '#16a34a', fontWeight: 600 }}>{item.status.toUpperCase()}</span>}
                        <span style={{ color: '#57534e' }}>P{item.priority}</span>
                        <span style={{ color: '#57534e' }}>{item.source}</span>
                      </div>
                    </div>
                    {/* ── Queue Item Controls ── */}
                    {isQueued && (
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, alignItems: 'center' }}>
                        <button
                          className="pipeline-retry-btn"
                          onClick={() => produceFromQueue(item.id, item.topic)}
                          disabled={triggering || overallStatus === 'running'}
                          style={{ color: '#4ade80', borderColor: '#166534', fontWeight: 600, fontSize: '0.6875rem' }}
                          title="Produce this topic now"
                        >
                          {'\u25B6'} Produce
                        </button>
                        <button
                          className="pipeline-retry-btn"
                          onClick={() => updateQueueItem(item.id, { expedite: !item.expedite })}
                          style={{ color: item.expedite ? '#dc2626' : '#a8a29e', borderColor: item.expedite ? '#7f1d1d' : '#44403c', fontSize: '0.6875rem' }}
                          title={item.expedite ? 'Remove expedite' : 'Expedite (jump to front)'}
                        >
                          {item.expedite ? '\u2B07 Normal' : '\u26A1 Expedite'}
                        </button>
                        <button
                          className="pipeline-retry-btn"
                          onClick={() => updateQueueItem(item.id, { priority: Math.max(1, item.priority - 10) })}
                          style={{ fontSize: '0.6875rem', padding: '0.25rem 0.375rem' }}
                          title="Raise priority (lower number = higher priority)"
                        >
                          {'\u2191'}
                        </button>
                        <button
                          className="pipeline-retry-btn"
                          onClick={() => updateQueueItem(item.id, { priority: Math.min(100, item.priority + 10) })}
                          style={{ fontSize: '0.6875rem', padding: '0.25rem 0.375rem' }}
                          title="Lower priority"
                        >
                          {'\u2193'}
                        </button>
                        <button
                          className="pipeline-retry-btn"
                          onClick={() => { if (confirm(`Delete "${cleanTopic}" from queue?`)) deleteQueueItem(item.id); }}
                          style={{ color: '#f87171', borderColor: '#7f1d1d', fontSize: '0.6875rem' }}
                          title="Delete from queue"
                        >
                          {'\u2715'}
                        </button>
                      </div>
                    )}
                    {isActive && (
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.625rem', color: '#16a34a', fontWeight: 600, padding: '0.25rem 0.5rem', background: '#052e16', borderRadius: '0.25rem', whiteSpace: 'nowrap' }}>
                          {item.status === 'in_progress' ? 'Producing\u2026' : 'Assigned'}
                        </span>
                        <button
                          className="pipeline-retry-btn"
                          onClick={() => updateQueueItem(item.id, { status: 'queued' })}
                          style={{ fontSize: '0.6875rem', color: '#fbbf24', borderColor: '#92400e' }}
                          title="Reset to queued (if stuck)"
                        >
                          Reset
                        </button>
                        <button
                          className="pipeline-retry-btn"
                          onClick={() => { if (confirm(`Delete "${cleanTopic}" from queue?`)) deleteQueueItem(item.id); }}
                          style={{ color: '#f87171', borderColor: '#7f1d1d', fontSize: '0.6875rem' }}
                          title="Delete from queue"
                        >
                          {'\u2715'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Recently Published ── */}
      {completedLogs.length > 0 && (
        <section>
          <h3 className="pipeline-section-title">
            Recently Published {'\u2014'} {completedLogs.length}
          </h3>
          <div className="pipeline-completed-list">
            {completedLogs.slice(0, 10).map(log => {
              const indScore = getIndependenceScore(log);
              const penName = log.model_used ? PEN_NAMES[log.model_used] : null;
              return (
                <div key={log.id} className="pipeline-card completed" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pipeline-card-title" style={{ marginBottom: '0.25rem' }}>
                      {log.title || log.topic || 'Untitled'}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6875rem', color: '#78716c', flexWrap: 'wrap' }}>
                      {penName && (
                        <span style={{ color: '#a78bfa', fontWeight: 500 }}>{penName}</span>
                      )}
                      {indScore !== null && (
                        <span style={{ color: indScore >= 7 ? '#16a34a' : indScore >= 4 ? '#f59e0b' : '#dc2626' }}>
                          Independence: {indScore}/10
                        </span>
                      )}
                      {log.cost_usd && parseFloat(String(log.cost_usd)) > 0 && (
                        <span style={{ color: '#a8a29e', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCost(log.cost_usd)}
                        </span>
                      )}
                      <span>{timeAgo(log.completed_at || log.created_at)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                    {log.slug && (
                      <a href={`/admin/edit/${log.slug}`} className="pipeline-retry-btn" style={{ textDecoration: 'none' }}>Edit</a>
                    )}
                    {log.slug && (
                      <a href={`/articles/${log.slug}`} target="_blank" rel="noopener noreferrer" className="pipeline-retry-btn" style={{ textDecoration: 'none' }}>{'\u2192'} View</a>
                    )}
                  </div>
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
            Editor Decisions {'\u2014'} {editorKills.length} killed
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
            Errors {'\u2014'} {failedLogs.length}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', gap: '0.5rem' }}>
                  <span className="pipeline-card-time">
                    {timeAgo(log.completed_at || log.created_at)}
                  </span>
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    {log.topic && (
                      <button
                        className="pipeline-retry-btn"
                        onClick={() => requeueFromFailed(log.id, log.topic!)}
                        style={{ color: '#fbbf24', borderColor: '#92400e' }}
                      >
                        Re-queue
                      </button>
                    )}
                    <button
                      className="pipeline-retry-btn"
                      onClick={() => retryArticle(log.id)}
                      disabled={retryingId === log.id}
                    >
                      {retryingId === log.id ? 'Retrying\u2026' : 'Retry'}
                    </button>
                  </div>
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

function PipelineCard({ log, expanded, onToggle, onKill, killing }: { log: PipelineLog; expanded: boolean; onToggle: () => void; onKill: () => void; killing: boolean }) {
  const isActive = ACTIVE_STATUSES.has(log.status);
  const displayTitle = log.title || log.topic || 'Pending topic\u2026';
  const statusText = getStatusText(log.status, log);
  const score = getEditorScore(log);
  const angle = getEditorAngle(log);
  const indScore = getIndependenceScore(log);
  const indReview = log.research_data?._independenceReview;
  const candidates = log.research_data?.candidates;
  const candidateScores = log.research_data?._editorBrief?.candidateScores;
  const penName = log.model_used ? PEN_NAMES[log.model_used] : null;
  const modelShort = log.model_used ? log.model_used.replace('claude-', '').replace('-20250514', '') : null;

  return (
    <div
      className={`pipeline-card${isActive ? ' active' : ''}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
    >
      <div className="pipeline-card-title">{truncate(displayTitle, 60)}</div>
      <div className="pipeline-card-status">
        {statusText}
        {penName && <span style={{ marginLeft: '0.375rem', color: '#a78bfa', fontWeight: 500 }}>by {penName}</span>}
      </div>
      <div className="pipeline-card-time">
        {timeAgo(log.created_at)}
        {modelShort && <span style={{ marginLeft: '0.375rem', color: '#57534e' }}>{modelShort}</span>}
        {log.source && <span style={{ marginLeft: '0.375rem', color: '#57534e' }}>{log.source}</span>}
      </div>

      {(score !== null || indScore !== null || (log.cost_usd && parseFloat(String(log.cost_usd)) > 0)) && (
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
          {log.cost_usd && parseFloat(String(log.cost_usd)) > 0 && (
            <span style={{ marginLeft: '0.5rem', color: '#a8a29e', fontSize: '0.6875rem', fontVariantNumeric: 'tabular-nums' }}>
              {formatCost(log.cost_usd)}
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
                {indReview.overallAssessment} {(indReview.independenceScore || indReview.score) ? `(${indReview.independenceScore || indReview.score}/10)` : ''}
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

          <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #3a3633' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onKill(); }}
              disabled={killing}
              style={{
                fontSize: '0.6875rem', padding: '0.25rem 0.625rem',
                background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d',
                borderRadius: '0.25rem', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}
            >
              {killing ? 'Killing\u2026' : 'Kill Article'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
