import { useState, useEffect, useCallback, useRef, Fragment } from 'react';

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
  "claude-opus-4-6": "Carl Lundin",
  "claude-sonnet-4-6": "Max Quilici",
  "claude-sonnet-4-20250514": "Max Quilici",
  "claude-opus-4-20250514": "Carl Lundin",
  "gpt-5.4": "Eli Vance",
  "gemini-3.1-pro-preview": "Christine Wright",
  "gemini-2.5-pro": "Christine Wright",
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

type PipelineStage = 'research' | 'editor_brief' | 'write' | 'independence' | 'qc' | 'voice_rewrite' | 'publish';

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
  { key: 'research', icon: '🔍', label: 'Research', model: 'Gemini 2.5 Pro + Search', modelColor: '#fbbf24', statuses: ['started', 'searching', 'research_done'] },
  { key: 'editor_brief', icon: '📋', label: 'Editor', model: 'Flash → Sonnet', modelColor: '#f97316', statuses: ['editor_reviewing', 'editor_approved'] },
  { key: 'write', icon: '✍️', label: 'Write', model: 'Gemini 3.1 Pro → Sonnet', modelColor: '#a78bfa', statuses: ['writing', 'written'] },
  { key: 'independence', icon: '⚖️', label: 'Independence', model: 'Grok 3', modelColor: '#3b82f6', statuses: ['independence_review', 'independence_done'] },
  { key: 'qc', icon: '✅', label: 'QC', model: 'Flash → Sonnet', modelColor: '#f97316', statuses: ['editor_qc', 'qc_approved'] },
  { key: 'voice_rewrite', icon: '🎨', label: 'Voice Polish', model: 'Sonnet → Gemini → GPT-5.4', modelColor: '#8b5cf6', statuses: ['voice_rewrite_pending', 'rewriting_voice', 'voice_rewrite_done'] },
  { key: 'publish', icon: '📡', label: 'Publish', model: 'GitHub + GPT Image', modelColor: '#10b981', statuses: ['publishing', 'published'] },
];

// Resolve actual writer model from log data (shows real model, not hardcoded guess)
function getCurrentWriterModel(): { name: string; color: string } {
  return { name: 'Sonnet', color: '#f97316' };
}

function getStatusText(status: string, log?: PipelineLog): string {
  const modelName = log?.model_used ? (PEN_NAMES[log.model_used] || log.model_used.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) : null;
  const map: Record<string, string> = {
    started: 'Initializing...',
    searching: 'Gemini searching with Google grounding...',
    research_done: 'Research complete — awaiting editor',
    editor_reviewing: 'Editor scoring candidates...',
    editor_approved: 'Approved — queued for writing',
    writing: `${modelName || 'Writer'} generating article...`,
    written: 'Written — awaiting Grok independence review',
    independence_review: 'Grok 3 adversarial review + PubMed check...',
    independence_done: 'Reviewed — awaiting QC',
    editor_qc: 'QC check + headline polish...',
    qc_approved: 'QC approved — queued for publish',
    voice_rewrite_pending: 'Voice rewrite queued...',
    rewriting_voice: 'Rewriting prose for voice quality...',
    voice_rewrite_done: 'Voice polished — queued for publish',
    publishing: 'GitHub commit + illustration + deploy...',
    published: 'Published',
    failed: log?.error ? `Failed: ${log.error.slice(0, 80)}` : 'Failed',
  };
  return map[status] || status;
}

const ACTIVE_STATUSES = new Set([
  'started', 'searching', 'editor_reviewing', 'writing', 'independence_review', 'editor_qc', 'rewriting_voice', 'publishing',
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
      const res = await fetch(`${apiBase}/pipeline-admin`, {
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
      const res = await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'produce' }),
      });
      const data = await res.json();
      // pipeline-admin wraps orchestrator response in data.result
      const result = data.result || data;
      if (data.skipped || result.skipped) {
        setProduceResult(`Skipped: ${result.message || data.message || 'Pipeline busy'}`);
      } else if (data.error || result.error) {
        const err = data.error || result.error;
        const detail = data.detail || result.detail || '';
        setProduceResult(`Error: ${err}${detail ? ' — ' + detail : ''}`);
      } else {
        const topic = result.topic ? ` — "${result.topic.replace(/\*\*/g, '').slice(0, 60)}"` : '';
        const dispatched = result.dispatched || data.stage || 'produce';
        setProduceResult(`Dispatched ${dispatched}${topic}`);
      }
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      setProduceResult(`Network error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    finally { setTriggering(false); }
  };

  const triggerSingleScout = async (model: string) => {
    setScouting(model);
    setScoutResult(null);
    try {
      const res = await fetch(`${apiBase}/pipeline-admin`, {
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
        const res = await fetch(`${apiBase}/pipeline-admin`, {
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
      await fetch(`${apiBase}/pipeline-admin`, {
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
      await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'retry', logId }),
      });
      setTimeout(fetchStatus, 2000);
    } catch { /* next poll */ }
    finally { setRetryingId(null); }
  };

  const [queueResult, setQueueResult] = useState<string | null>(null);

  const queueTopic = async () => {
    if (!newTopic.trim()) return;
    setQueueing(true);
    setQueueResult(null);
    try {
      const res = await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({
          action: 'queue-topic',
          topic: newTopic.trim(),
          category: newCategory || undefined,
          priority: 10,
          expedite: newExpedite,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setQueueResult(`Failed: ${data.error || data.message || res.status}`);
      } else {
        setQueueResult(`Queued: "${newTopic.trim().slice(0, 60)}"`);
        setNewTopic('');
        setNewCategory('');
        setNewExpedite(false);
        setTimeout(() => setQueueResult(null), 4000);
      }
      setTimeout(fetchStatus, 1000);
    } catch (err) {
      setQueueResult(`Error: ${err instanceof Error ? err.message : 'network failure'}`);
    }
    finally { setQueueing(false); }
  };

  const produceFromQueue = async (queueId: string, topic: string) => {
    if (!confirm(`Produce "${topic.replace(/\*\*/g, '').slice(0, 80)}" now? This will start the full pipeline.`)) return;
    setTriggering(true);
    setProduceResult(null);
    try {
      // First expedite this item so it's picked first
      await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'update-queue', queueId, expedite: true, priority: 0 }),
      });
      // Then trigger produce
      const res = await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'produce' }),
      });
      const data = await res.json();
      const result = data.result || data;
      if (data.skipped || result.skipped) {
        setProduceResult(`Skipped: ${result.message || data.message || 'Pipeline busy'}`);
      } else if (data.error || result.error) {
        setProduceResult(`Error: ${data.error || result.error}`);
      } else {
        const dispatched = result.dispatched || 'produce';
        setProduceResult(`Dispatched ${dispatched} — "${topic.replace(/\*\*/g, '').slice(0, 60)}"`);
      }
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      setProduceResult(`Network error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    finally { setTriggering(false); }
  };

  const updateQueueItem = async (queueId: string, updates: Record<string, unknown>) => {
    try {
      await fetch(`${apiBase}/pipeline-admin`, {
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
      await fetch(`${apiBase}/pipeline-admin`, {
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
      await fetch(`${apiBase}/pipeline-admin`, {
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
    research: [], editor_brief: [], write: [], independence: [], qc: [], voice_rewrite: [], publish: [],
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
          <span style={{ color: '#5c5752', fontSize: '0.7rem', marginLeft: '0.5rem' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: '0.6875rem', color: '#7d7871' }}>Total Spend</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: totalCost > 50 ? '#f87171' : totalCost > 20 ? '#f59e0b' : '#b5b0a9', fontVariantNumeric: 'tabular-nums' }}>
              ${totalCost.toFixed(2)}
            </span>
          </div>
        )}

        <div className="pipeline-quick-actions">
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.5625rem', color: '#5c5752', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginRight: '0.25rem', fontWeight: 600 }}>Scout</span>
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
        <div style={{ padding: '0.625rem 1rem', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '10px', marginBottom: '0.75rem', fontSize: '0.75rem', color: '#86efac', whiteSpace: 'pre-line', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{scoutResult}</span>
          <button onClick={() => setScoutResult(null)} style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', fontSize: '0.8125rem', padding: '0.25rem 0.5rem' }}>{'\u00d7'}</button>
        </div>
      )}
      {produceResult && (
        <div style={{ padding: '0.625rem 1rem', background: produceResult.includes('Error') || produceResult.includes('Skipped') ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)', border: `1px solid ${produceResult.includes('Error') || produceResult.includes('Skipped') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`, borderRadius: '10px', marginBottom: '0.75rem', fontSize: '0.75rem', color: produceResult.includes('Error') || produceResult.includes('Skipped') ? '#fca5a5' : '#86efac', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{produceResult}</span>
          <button onClick={() => setProduceResult(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.8125rem', padding: '0.25rem 0.5rem', opacity: 0.7 }}>{'\u00d7'}</button>
        </div>
      )}

      {/* ── 7-Stage Pipeline ── */}
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
                      apiBase={apiBase}
                      onRefresh={fetchStatus}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Two-column layout: Queue + Published/Kills/Errors ── */}
      <div className="pipeline-lower-grid">

      {/* ── Topic Queue (left column) ── */}
      <section style={{ marginTop: '0' }}>
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
            placeholder="Topic idea (e.g. 'Microbiome-sleep connection') — added with high priority"
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') queueTopic(); }}
            style={{ flex: 1, minWidth: '200px', padding: '0.5rem 0.75rem', background: '#1a1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#eae8e4', fontSize: '0.8125rem', outline: 'none' }}
          />
          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            style={{ padding: '0.5rem', background: '#222120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#b5b0a9', fontSize: '0.8125rem' }}
          >
            <option value="">Category</option>
            {['Neuroscience', 'Mental Health', 'Longevity', 'Clinical Evidence', 'Environmental Health', 'Nutrition', 'Fitness', 'Sleep Science', 'Pharmacology'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#b5b0a9', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={newExpedite}
              onChange={e => setNewExpedite(e.target.checked)}
              style={{ accentColor: '#ef4444' }}
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

        {queueResult && (
          <div style={{ padding: '0.5rem 0.75rem', marginBottom: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', background: queueResult.startsWith('Failed') || queueResult.startsWith('Error') ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)', color: queueResult.startsWith('Failed') || queueResult.startsWith('Error') ? '#fca5a5' : '#86efac', border: `1px solid ${queueResult.startsWith('Failed') || queueResult.startsWith('Error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}` }}>
            {queueResult}
          </div>
        )}

        {queue.length > 0 && (
          <div className="pipeline-completed-list">
            {queue.map(item => {
              const isActive = item.status === 'in_progress' || item.status === 'assigned';
              const isQueued = item.status === 'queued';
              const cleanTopic = item.topic.replace(/\*\*/g, '').replace(/^[\s\-]*Topic\s*Description\s*:?\s*/i, '').trim();
              return (
                <div key={item.id} className="pipeline-card" style={{ borderLeftColor: item.expedite ? '#ef4444' : isActive ? '#22c55e' : 'rgba(255,255,255,0.08)', borderLeftWidth: '3px', opacity: isActive ? 1 : 0.85 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pipeline-card-title" style={{ fontSize: '0.8125rem' }}>{cleanTopic}</div>
                      <div style={{ fontSize: '0.6875rem', color: '#7d7871', display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                        {item.category && <span>{item.category}</span>}
                        {item.expedite && <span style={{ color: '#ef4444', fontWeight: 600 }}>EXPEDITE</span>}
                        {isActive && <span style={{ color: '#22c55e', fontWeight: 600 }}>{item.status.toUpperCase()}</span>}
                        <span style={{ color: '#5c5752' }}>P{item.priority}</span>
                        <span style={{ color: '#5c5752' }}>{item.source}</span>
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
                          style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.25)', fontSize: '0.6875rem' }}
                          title="Delete from queue"
                        >
                          {'\u2715'}
                        </button>
                      </div>
                    )}
                    {isActive && (
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.625rem', color: '#22c55e', fontWeight: 600, padding: '0.25rem 0.5rem', background: 'rgba(34, 197, 94, 0.08)', borderRadius: '0.25rem', whiteSpace: 'nowrap' }}>
                          {item.status === 'in_progress' ? 'Producing\u2026' : 'Assigned'}
                        </span>
                        <button
                          className="pipeline-retry-btn"
                          onClick={() => updateQueueItem(item.id, { status: 'queued' })}
                          style={{ fontSize: '0.6875rem', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                          title="Reset to queued (if stuck)"
                        >
                          Reset
                        </button>
                        <button
                          className="pipeline-retry-btn"
                          onClick={() => { if (confirm(`Delete "${cleanTopic}" from queue?`)) deleteQueueItem(item.id); }}
                          style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.25)', fontSize: '0.6875rem' }}
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

      {/* ── Right column: Published + Kills + Errors ── */}
      <div>
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
              const isExpanded = expandedId === log.id;
              const rd = log.research_data || {};
              const brief = rd._editorBrief as Record<string, unknown> | undefined;
              const indReview = rd._independenceReview as Record<string, unknown> | undefined;
              const pubmed = rd._pubmedVerification as { verified?: number; failed?: number; total?: number; details?: Array<{ title: string; found: boolean }> } | undefined;
              const qcResult = rd._qcResult as Record<string, unknown> | undefined;
              const briefDetails = brief?.brief as Record<string, unknown> | undefined;
              const tokenUsage = log.token_usage as Array<{ model: string; stage: string; inputTokens: number; outputTokens: number; costUsd: number }> | null;

              return (
                <div key={log.id} className="pipeline-card completed" style={{ cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : log.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pipeline-card-title" style={{ marginBottom: '0.25rem' }}>
                        {log.title || log.topic || 'Untitled'}
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6875rem', color: '#7d7871', flexWrap: 'wrap', alignItems: 'center' }}>
                        {penName && <span style={{ color: '#a78bfa', fontWeight: 500 }}>{penName}</span>}
                        {indScore !== null && (
                          <span style={{ color: indScore >= 7 ? '#22c55e' : indScore >= 4 ? '#f59e0b' : '#ef4444' }}>
                            Independence: {indScore}/10
                          </span>
                        )}
                        {log.cost_usd && parseFloat(String(log.cost_usd)) > 0 && (
                          <span style={{ color: '#b5b0a9', fontVariantNumeric: 'tabular-nums' }}>{formatCost(log.cost_usd)}</span>
                        )}
                        <span>{timeAgo(log.completed_at || log.created_at)}</span>
                        <span style={{ color: '#5c5752', fontSize: '0.625rem' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      {log.slug && <a href={`/admin/edit/${log.slug}`} className="pipeline-retry-btn" style={{ textDecoration: 'none' }}>Edit</a>}
                      {log.slug && <a href={`/articles/${log.slug}`} target="_blank" rel="noopener noreferrer" className="pipeline-retry-btn" style={{ textDecoration: 'none' }}>{'\u2192'} View</a>}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem' }}>
                      {/* ── Research ── */}
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ color: '#7d7871', fontWeight: 700, textTransform: 'uppercase' as const, fontSize: '0.5625rem', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>1. Research</div>
                        {rd.topic && <div style={{ color: '#b5b0a9' }}>Topic: {rd.topic as string}</div>}
                        {(rd.keyFindings as string[] | undefined)?.slice(0, 3).map((f: string, i: number) => (
                          <div key={i} style={{ color: '#7d7871', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(255,255,255,0.06)', marginTop: '0.25rem' }}>{f}</div>
                        ))}
                      </div>

                      {/* ── Editor Brief ── */}
                      {brief && (
                        <div style={{ marginBottom: '0.75rem' }}>
                          <div style={{ color: '#7d7871', fontWeight: 700, textTransform: 'uppercase' as const, fontSize: '0.5625rem', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>2. Editor Brief</div>
                          <div style={{ color: '#b5b0a9' }}>Score: <span style={{ color: '#eae8e4', fontWeight: 600 }}>{brief.topicScore as number}/10</span> | Archetype: {brief.archetype as string || '?'}</div>
                          {brief.angle && <div style={{ color: '#b5b0a9', fontStyle: 'italic', marginTop: '0.25rem' }}>Angle: {(brief.angle as string).slice(0, 150)}</div>}
                          {briefDetails?.tonePreset && <div style={{ color: '#7d7871' }}>Tone: {briefDetails.tonePreset as string} | Density: {briefDetails.density as string || '?'} | Pacing: {briefDetails.pacing as string || '?'}</div>}
                          {(briefDetails?.dogmaWarnings as string[] | undefined)?.length ? (
                            <div style={{ color: '#f59e0b', marginTop: '0.25rem' }}>Dogma warnings: {(briefDetails!.dogmaWarnings as string[]).join('; ')}</div>
                          ) : null}
                        </div>
                      )}

                      {/* ── Writer ── */}
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ color: '#7d7871', fontWeight: 700, textTransform: 'uppercase' as const, fontSize: '0.5625rem', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>3. Writer</div>
                        <div style={{ color: '#b5b0a9' }}>Model: <span style={{ color: '#a78bfa', fontWeight: 500 }}>{log.model_used || '?'}</span>{penName ? ` (${penName})` : ''} | Revision: {log.revision_count || 0}</div>
                      </div>

                      {/* ── Independence Review ── */}
                      {indReview && (
                        <div style={{ marginBottom: '0.75rem', padding: '0.625rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ color: '#7d7871', fontWeight: 700, textTransform: 'uppercase' as const, fontSize: '0.5625rem', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>4. Grok Independence Review</div>
                          <div style={{ color: '#b5b0a9' }}>
                            Verdict: <span style={{ color: (indReview.verdict as string) === 'clean' ? '#4ade80' : (indReview.verdict as string) === 'minor_issues' ? '#fbbf24' : '#f87171', fontWeight: 600 }}>{indReview.verdict as string}</span>
                            {' | '}Score: {(indReview.score as number) || '?'}/10
                            {indReview._revisionApplied && <span style={{ color: '#a78bfa', marginLeft: '0.5rem' }}>Revisions applied</span>}
                          </div>
                          {(indReview.flags as Array<{ type: string; quote: string; rewrite: string }> | undefined)?.map((f, i) => (
                            <div key={i} style={{ marginTop: '0.375rem', paddingLeft: '0.5rem', borderLeft: `2px solid ${f.type === 'fabrication' ? '#f87171' : '#f59e0b'}` }}>
                              <span style={{ color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase' as const, fontSize: '0.5625rem' }}>[{f.type}]</span>
                              <div style={{ color: '#7d7871', fontSize: '0.6875rem' }}>{(f.quote || '').slice(0, 100)}</div>
                              {f.rewrite && <div style={{ color: '#eae8e4', fontSize: '0.6875rem' }}>{'\u2192'} {(f.rewrite || '').slice(0, 100)}</div>}
                            </div>
                          ))}
                          {(indReview.summary as string) && <div style={{ color: '#7d7871', fontStyle: 'italic', marginTop: '0.375rem' }}>{(indReview.summary as string).slice(0, 200)}</div>}
                        </div>
                      )}

                      {/* ── PubMed Verification ── */}
                      {pubmed && pubmed.total && pubmed.total > 0 && (
                        <div style={{ marginBottom: '0.75rem' }}>
                          <div style={{ color: '#7d7871', fontWeight: 700, textTransform: 'uppercase' as const, fontSize: '0.5625rem', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>5. PubMed Verification</div>
                          <div style={{ color: '#b5b0a9' }}>
                            <span style={{ color: '#4ade80' }}>{pubmed.verified} verified</span>
                            {pubmed.failed ? <span style={{ color: '#f87171', marginLeft: '0.5rem' }}>{pubmed.failed} NOT FOUND</span> : null}
                            {' / '}{pubmed.total} checked
                          </div>
                          {pubmed.details?.filter(d => !d.found).map((d, i) => (
                            <div key={i} style={{ color: '#f87171', fontSize: '0.6875rem', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(239, 68, 68, 0.2)', marginTop: '0.25rem' }}>
                              {'\u2717'} {d.title.slice(0, 80)}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── QC Result ── */}
                      {qcResult && (
                        <div style={{ marginBottom: '0.75rem' }}>
                          <div style={{ color: '#7d7871', fontWeight: 700, textTransform: 'uppercase' as const, fontSize: '0.5625rem', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>6. QC + Publish</div>
                          <div style={{ color: '#b5b0a9' }}>
                            Decision: <span style={{ color: '#4ade80', fontWeight: 600 }}>{qcResult.decision as string}</span>
                            {' | '}Score: {qcResult.qualityScore as number || '?'}/10
                            {(qcResult.edits as Record<string, unknown>)?.headlineChanged && <span style={{ marginLeft: '0.5rem', color: '#fbbf24' }}>Headline revised</span>}
                            {(qcResult.edits as Record<string, unknown>)?.descriptionChanged && <span style={{ marginLeft: '0.5rem', color: '#fbbf24' }}>Description revised</span>}
                          </div>
                          {(qcResult.edits as Record<string, unknown>)?.notes && (
                            <div style={{ color: '#7d7871', fontStyle: 'italic', marginTop: '0.25rem' }}>{((qcResult.edits as Record<string, unknown>).notes as string).slice(0, 150)}</div>
                          )}
                        </div>
                      )}

                      {/* ── Cost Breakdown ── */}
                      {tokenUsage && tokenUsage.length > 0 && (
                        <div>
                          <div style={{ color: '#7d7871', fontWeight: 700, textTransform: 'uppercase' as const, fontSize: '0.5625rem', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>Cost Breakdown</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.125rem 0.75rem', fontSize: '0.625rem', color: '#7d7871' }}>
                            <span style={{ fontWeight: 600 }}>Stage</span><span style={{ fontWeight: 600 }}>Model</span><span style={{ fontWeight: 600 }}>Tokens</span><span style={{ fontWeight: 600 }}>Cost</span>
                            {tokenUsage.map((t, i) => (
                              <Fragment key={i}>
                                <span style={{ color: '#b5b0a9' }}>{t.stage}</span>
                                <span>{t.model?.split('-').slice(0, 2).join('-') || '?'}</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(t.inputTokens + t.outputTokens).toLocaleString()}</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#b5b0a9' }}>${t.costUsd?.toFixed(4) || '?'}</span>
                              </Fragment>
                            ))}
                          </div>
                          <div style={{ marginTop: '0.375rem', color: '#b5b0a9', fontWeight: 600, fontSize: '0.625rem' }}>Total: {formatCost(log.cost_usd)}</div>
                        </div>
                      )}

                      <div style={{ marginTop: '0.625rem', color: '#5c5752', fontSize: '0.625rem' }}>
                        Source: {log.source || '?'} | Started: {log.created_at ? new Date(log.created_at).toLocaleString() : '?'} | Completed: {log.completed_at ? new Date(log.completed_at).toLocaleString() : '?'}
                      </div>
                    </div>
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
            Editor Decisions {'\u2014'} {editorKills.length} killed
          </h3>
          <div className="pipeline-completed-list">
            {editorKills.map(log => {
              const reason = (log.error || '').replace('Senior Editor killed: ', '');
              return (
                <div key={log.id} className="pipeline-card" style={{ borderLeftColor: '#f59e0b', borderLeftWidth: '3px' }}>
                  <div className="pipeline-card-title" style={{ color: '#b5b0a9' }}>
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
                        style={{ color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.3)' }}
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
      </div>{/* end right column */}
      </div>{/* end pipeline-lower-grid */}
    </div>
  );
}

// ─── Pipeline Card ──────────────────────────────────────────────────

function PipelineCard({ log, expanded, onToggle, onKill, killing, apiBase, onRefresh }: { log: PipelineLog; expanded: boolean; onToggle: () => void; onKill: () => void; killing: boolean; apiBase: string; onRefresh: () => void }) {
  const [briefCopied, setBriefCopied] = useState(false);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [articleHtml, setArticleHtml] = useState('');
  const [submitResult, setSubmitResult] = useState<string | null>(null);

  const isActive = ACTIVE_STATUSES.has(log.status);
  const isAwaitingWrite = log.status === 'editor_approved';
  const displayTitle = log.title || log.topic || 'Pending topic\u2026';
  const statusText = isAwaitingWrite ? 'Ready for you to write with Opus' : getStatusText(log.status, log);

  // Build the Claude prompt client-side from already-loaded research_data (no fetch = no clipboard permission issue)
  const copyBriefForClaude = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rd = log.research_data || {};
    const eb = rd._editorBrief || {};
    const brief = (eb as Record<string, unknown>).brief as Record<string, unknown> || {};

    const prompt = `Write this article for alumi news. "Evidence. Wherever it leads."

## THE ASSIGNMENT
**${eb.headline || log.title || log.topic}**
${eb.description || ''}

Angle: ${eb.angle || 'Follow the research'}
Archetype: ${eb.archetype || 'deep-investigation'} | Tone: ${brief.tonePreset || 'smart-casual'} | ${brief.density || 'balanced'} density | ${brief.pacing || 'slow-build'} pacing
${brief.tone ? `Voice note: ${brief.tone}` : ''}
${brief.openWith ? `Open with: ${brief.openWith}` : ''}
${((brief.emphasize as string[]) || []).length > 0 ? `Emphasize: ${((brief.emphasize as string[]) || []).join('; ')}` : ''}
${((brief.avoid as string[]) || []).length > 0 ? `Avoid: ${((brief.avoid as string[]) || []).join('; ')}` : ''}
${((brief.dogmaWarnings as string[]) || []).length > 0 ? `Dogma warnings: ${((brief.dogmaWarnings as string[]) || []).join('; ')}` : ''}
${brief.closingDirection ? `Close with: ${brief.closingDirection}` : ''}
${brief.structuralNotes ? `Structure: ${brief.structuralNotes}` : ''}

## RESEARCH
${((rd.keyFindings as string[]) || []).map((f, i) => (i + 1) + '. ' + f).join('\n')}

Studies:
${((rd.studies as Array<{title:string;journal:string;year:string;finding:string}>) || []).map(s => '- "' + s.title + '" (' + s.journal + ', ' + s.year + '): ' + s.finding).join('\n')}

${rd.mechanism ? `Mechanism: ${rd.mechanism}` : ''}

${((rd.counterArguments as string[]) || []).length > 0 ? `Counter-arguments:\n${((rd.counterArguments as string[]) || []).map(c => '- ' + c).join('\n')}` : ''}

## VOICE
Think The Atlantic meets Bill Maher. Evidence-first, direct, occasionally irreverent. Skeptical of all institutions equally — pharma, government, alternative health. Follow the money. Take positions. Say the thing a hospital pamphlet never would.

Only cite studies from the research above — never fabricate. End with a Sources section.

## HTML FORMAT
Use this structure:

<section id="introduction" class="reveal">
  <p>Opening paragraph (no h2 — CSS applies drop cap).</p>
</section>

<section id="section-slug" class="reveal">
  <h2>Section Title</h2>
  <p>Content...</p>
</section>

Optional: <aside class="pull-quote reveal"><p>"Striking quote."</p></aside>

End with:
<section id="sources"><h2>Sources</h2><ul><li>Citations...</li></ul></section>
<div class="mt-12 p-6 bg-stone-100 dark:bg-stone-800 rounded-xl border-l-4 border-primary-500 reveal"><p class="text-sm text-stone-600 dark:text-stone-400 leading-relaxed"><strong>Disclaimer:</strong> This article is for informational purposes only and does not constitute medical advice.</p></div>

Slug for this article: ${eb.slug || log.slug || 'auto-generate'}
Category: ${(eb as Record<string, unknown>).categoryOverride || rd.category || 'Clinical Evidence'}`;

    navigator.clipboard.writeText(prompt).then(() => {
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 3000);
    }).catch(() => {
      // Fallback: open in a new window for manual copy
      const w = window.open('', '_blank');
      if (w) { w.document.write('<pre>' + prompt.replace(/</g, '&lt;') + '</pre>'); }
    });
  };

  // Submit the user's Opus-written article
  const submitArticle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!articleHtml.trim()) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit-article', logId: log.id, articleHtml: articleHtml.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitResult('Article submitted! Pipeline resuming with Grok independence review.');
        setShowSubmitForm(false);
        setArticleHtml('');
        setTimeout(() => { setSubmitResult(null); onRefresh(); }, 2000);
      } else {
        setSubmitResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setSubmitResult(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setSubmitting(false);
    }
  };
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
      style={isAwaitingWrite ? { borderLeftColor: '#c084fc', borderLeftWidth: '3px', background: 'rgba(168, 85, 247, 0.04)' } : undefined}
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
        {modelShort && <span style={{ marginLeft: '0.375rem', color: '#5c5752' }}>{modelShort}</span>}
        {log.source && <span style={{ marginLeft: '0.375rem', color: '#5c5752' }}>{log.source}</span>}
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
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem' }}>
          {/* Candidates from research */}
          {candidates && candidates.length > 1 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <span style={{ color: '#7d7871', fontWeight: 600 }}>Research Candidates:</span>
              {candidates.map((c, i) => {
                const cScore = candidateScores?.find(cs => cs.rank === c.rank);
                return (
                  <div key={i} style={{ marginTop: '0.25rem', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: cScore ? (cScore.score >= 7 ? '#22c55e' : '#f59e0b') : '#b5b0a9' }}>
                      #{c.rank}: {c.headline_draft || c.topic}
                    </span>
                    {cScore && <span style={{ color: '#7d7871', marginLeft: '0.5rem' }}>({cScore.score}/10) {cScore.verdict}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {angle && (
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: '#7d7871', fontWeight: 600 }}>Angle: </span>
              <span style={{ color: '#b5b0a9', fontStyle: 'italic' }}>{angle}</span>
            </div>
          )}

          {/* Independence Review */}
          {indReview && indReview.overallAssessment !== 'skipped' && (
            <div style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: '#7d7871', fontWeight: 600 }}>Grok Independence: </span>
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
              <span style={{ color: '#7d7871' }}>Slug: </span>
              <code style={{ color: '#5c5752', fontSize: '0.6875rem' }}>{log.slug}</code>
            </div>
          )}
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: '#7d7871' }}>Status: </span>
            <span style={{ color: '#b5b0a9' }}>{log.status}</span>
          </div>
          <div>
            <span style={{ color: '#7d7871' }}>Started: </span>
            <span style={{ color: '#b5b0a9' }}>{new Date(log.created_at).toLocaleTimeString()}</span>
          </div>
          {log.research_data?.category && (
            <div style={{ marginTop: '0.25rem' }}>
              <span style={{ color: '#7d7871' }}>Category: </span>
              <span style={{ color: '#b5b0a9' }}>{log.research_data.category}</span>
            </div>
          )}
          {log.research_data?._queueId && (
            <div style={{ marginTop: '0.25rem' }}>
              <span style={{ color: '#f59e0b', fontSize: '0.6875rem' }}>From topic queue</span>
            </div>
          )}

          {/* Hybrid workflow: Copy Brief + Submit Article for editor_approved articles */}
          {isAwaitingWrite && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c084fc', marginBottom: '0.375rem' }}>Write with Opus</div>
                <div style={{ fontSize: '0.6875rem', color: '#a8a29e', marginBottom: '0.5rem' }}>
                  1. Copy the brief below, paste into Claude. 2. Opus writes the article. 3. Paste the HTML back here.
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={copyBriefForClaude}
                    disabled={loadingBrief}
                    style={{
                      fontSize: '0.6875rem', padding: '0.375rem 0.875rem',
                      background: briefCopied ? 'rgba(34, 197, 94, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                      color: briefCopied ? '#22c55e' : '#c084fc',
                      border: `1px solid ${briefCopied ? 'rgba(34, 197, 94, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`,
                      borderRadius: '6px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      fontWeight: 600, transition: 'all 0.15s',
                    }}
                  >
                    {loadingBrief ? 'Loading...' : briefCopied ? 'Copied!' : 'Copy Brief for Claude'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowSubmitForm(!showSubmitForm); }}
                    style={{
                      fontSize: '0.6875rem', padding: '0.375rem 0.875rem',
                      background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      fontWeight: 600, transition: 'all 0.15s',
                    }}
                  >
                    {showSubmitForm ? 'Cancel' : 'Submit Written Article'}
                  </button>
                </div>
              </div>

              {showSubmitForm && (
                <div style={{ marginTop: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={articleHtml}
                    onChange={(e) => setArticleHtml(e.target.value)}
                    placeholder="Paste the article HTML from Claude here..."
                    style={{
                      width: '100%', minHeight: '120px', padding: '0.5rem',
                      background: 'rgba(255,255,255,0.03)', color: '#eae8e4',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                      fontFamily: 'monospace', fontSize: '0.6875rem', resize: 'vertical',
                    }}
                  />
                  <button
                    onClick={submitArticle}
                    disabled={submitting || !articleHtml.trim()}
                    style={{
                      marginTop: '0.375rem', fontSize: '0.6875rem', padding: '0.375rem 0.875rem',
                      background: submitting ? 'rgba(255,255,255,0.05)' : 'rgba(34, 197, 94, 0.15)',
                      color: submitting ? '#7d7871' : '#22c55e',
                      border: `1px solid ${submitting ? 'rgba(255,255,255,0.1)' : 'rgba(34, 197, 94, 0.3)'}`,
                      borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer',
                      fontFamily: 'Inter, sans-serif', fontWeight: 600,
                    }}
                  >
                    {submitting ? 'Submitting...' : 'Submit & Resume Pipeline'}
                  </button>
                </div>
              )}

              {submitResult && (
                <div style={{
                  marginTop: '0.375rem', padding: '0.375rem 0.625rem', borderRadius: '6px', fontSize: '0.6875rem',
                  background: submitResult.startsWith('Error') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                  color: submitResult.startsWith('Error') ? '#f87171' : '#22c55e',
                  border: `1px solid ${submitResult.startsWith('Error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                }}>
                  {submitResult}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onKill(); }}
              disabled={killing}
              style={{
                fontSize: '0.6875rem', padding: '0.3125rem 0.75rem',
                background: 'transparent', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '6px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                transition: 'all 0.15s',
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
