import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import {
  type PipelineLog, type PipelineResearchData, type StageConfig,
  PIPELINE_STAGE_CONFIG, ACTIVE_STATUSES, VALID_CATEGORIES,
  getAdminToken, timeAgo, getStatusText, getPenName, getScoreColor,
  fetchWithTimeout,
} from './types';
import { useConfirm } from './ConfirmModal';

// ─── Types ──────────────────────────────────────────────────────

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
  research_summary: string | null;
  editor_score: number | null;
}

interface Props {
  initialLogs: PipelineLog[];
  initialArticleCount: number;
  apiBase: string;
  initialTotalCost?: number;
}

// ─── Constants ──────────────────────────────────────────────────

const ARTICLE_GOAL = 100;
const POLL_INTERVAL = 15_000;

// ─── Helpers ────────────────────────────────────────────────────

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

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '\u2026';
}

function getStageForLog(log: PipelineLog): StageConfig['key'] | null {
  for (const stage of PIPELINE_STAGE_CONFIG) {
    if (stage.statuses.includes(log.status)) return stage.key;
  }
  return null;
}

function getEditorScore(log: PipelineLog): number | null {
  return (log.research_data as PipelineResearchData | null)?._editorBrief?.topicScore ?? null;
}

function getEditorAngle(log: PipelineLog): string | null {
  return (log.research_data as PipelineResearchData | null)?._editorBrief?.angle ?? null;
}

function getIndependenceScore(log: PipelineLog): number | null {
  const r = (log.research_data as PipelineResearchData | null)?._independenceReview;
  return (r as Record<string, unknown> | undefined)?.independenceScore as number ?? r?.score ?? null;
}

function formatCost(value: number | string | null | undefined): string {
  const n = parseFloat(String(value ?? '0')) || 0;
  if (n === 0) return '-';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

// ─── Component ──────────────────────────────────────────────────

export default function PipelineMonitor({ initialLogs, initialArticleCount, apiBase, initialTotalCost }: Props) {
  const [logs, setLogs] = useState<PipelineLog[]>(initialLogs);
  const [articleCount, setArticleCount] = useState(initialArticleCount);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedQueueId, setExpandedQueueId] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<Date>(new Date());
  const [newTopic, setNewTopic] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newExpedite, setNewExpedite] = useState(false);
  const [queueing, setQueueing] = useState(false);
  // Article upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadHtml, setUploadHtml] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [uploadParsing, setUploadParsing] = useState(false);
  const [uploadEntry, setUploadEntry] = useState<'full' | 'independence'>('full');
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [uploadUrl, setUploadUrl] = useState('');
  const [queueSearch, setQueueSearch] = useState('');
  const [queueFilter, setQueueFilter] = useState<'all' | 'queued' | 'completed' | 'in_progress'>('queued');
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const [killingId, setKillingId] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState<number>(initialTotalCost || 0);
  const [scouting, setScouting] = useState<string | null>(null);
  const [scoutResult, setScoutResult] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { ask, ConfirmDialog } = useConfirm();

  const flashFeedback = useCallback((ok: boolean, msg: string) => {
    setActionFeedback({ ok, msg });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setActionFeedback(null), 4000);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
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
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'produce' }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
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
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'scout', scoutModel: model }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
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
        const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
          body: JSON.stringify({ action: 'scout', scoutModel: model }),
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        setScoutResult(prev => (prev ? prev + '\n' : '') + `${model}: ${data.message || data.error || 'done'}`);
      } catch (err) { setScoutResult(prev => (prev ? prev + '\n' : '') + `${model}: ${err instanceof Error ? err.message : 'failed'}`); }
    }
    setScouting(null);
    setTimeout(fetchStatus, 2000);
  };

  const requeueFromFailed = async (logId: string, topic: string) => {
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'queue-topic', topic, priority: 1, expedite: true }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      flashFeedback(true, `Re-queued: "${topic.slice(0, 50)}"`);
      setTimeout(fetchStatus, 1000);
    } catch (err) { flashFeedback(false, `Re-queue failed: ${err instanceof Error ? err.message : 'unknown'}`); }
  };

  const retryArticle = async (logId: string) => {
    setRetryingId(logId);
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'retry', logId }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      flashFeedback(true, 'Retry dispatched');
      setTimeout(fetchStatus, 2000);
    } catch (err) { flashFeedback(false, `Retry failed: ${err instanceof Error ? err.message : 'unknown'}`); }
    finally { setRetryingId(null); }
  };

  const [queueResult, setQueueResult] = useState<string | null>(null);

  const queueTopic = async () => {
    if (!newTopic.trim()) return;
    setQueueing(true);
    setQueueResult(null);
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
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

  // ─── Article Upload ────────────────────────────────────────────
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const suggestTitle = useCallback((text: string) => {
    if (uploadTitle.trim()) return; // don't overwrite manual title
    const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Try: first heading
    const h1 = text.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1) { setUploadTitle(h1[1].trim().slice(0, 120)); return; }
    const h2 = text.match(/<h2[^>]*>([^<]+)<\/h2>/i);
    if (h2) { setUploadTitle(h2[1].trim().slice(0, 120)); return; }
    // Try: markdown heading
    const md = plain.match(/^#+ (.+)/m);
    if (md) { setUploadTitle(md[1].trim().slice(0, 120)); return; }
    // Fallback: first sentence
    const sentence = plain.match(/^[^.!?]{10,120}[.!?]/);
    if (sentence) { setUploadTitle(sentence[0].trim()); return; }
    // Last resort: first 80 chars
    if (plain.length > 10) setUploadTitle(plain.slice(0, 80));
  }, [uploadTitle]);

  const handleUploadFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    setUploadParsing(true);
    try {
      let parsed = '';
      if (ext === 'md' || ext === 'txt' || ext === 'html' || ext === 'htm') {
        parsed = await file.text();
      } else if (ext === 'docx' || ext === 'pdf') {
        const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
          body: JSON.stringify({ action: 'parse-file', fileBase64: await fileToBase64(file), fileName: file.name }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'File parse failed');
        parsed = data.text || '';
      } else {
        flashFeedback(false, `Unsupported: .${ext}. Use .pdf, .md, .txt, .html, or .docx`);
        return;
      }
      setUploadHtml(parsed);
      suggestTitle(parsed);
      flashFeedback(true, `Parsed ${file.name}`);
    } catch {
      flashFeedback(false, 'Failed to parse file');
    } finally {
      setUploadParsing(false);
      if (uploadFileRef.current) uploadFileRef.current.value = '';
    }
  };

  const fetchUrl = async () => {
    if (!uploadUrl.trim()) return;
    setUploadParsing(true);
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'fetch-url', url: uploadUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        flashFeedback(false, data.error || `Fetch failed: ${res.status}`);
      } else {
        const fetched = data.text || '';
        setUploadHtml(fetched);
        suggestTitle(fetched);
        flashFeedback(true, `Fetched ${uploadUrl.trim().slice(0, 50)}`);
        setUploadUrl('');
      }
    } catch {
      flashFeedback(false, 'Failed to fetch URL');
    } finally { setUploadParsing(false); }
  };

  const submitArticleToChain = async () => {
    if (!uploadTitle.trim()) return;
    if (uploadEntry === 'independence' && !uploadHtml.trim()) return;
    setUploading(true);
    setUploadResult(null);
    try {
      let res: Response;
      if (uploadEntry === 'full') {
        // Queue as topic — full chain from research
        res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
          body: JSON.stringify({
            action: 'queue-topic',
            topic: uploadTitle.trim(),
            category: uploadCategory || undefined,
            notes: uploadHtml.trim() || undefined,
            priority: 5,
            expedite: true,
          }),
        });
      } else {
        // Submit as finished article — independence review
        const slug = uploadTitle.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
        res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
          body: JSON.stringify({
            action: 'submit-new-article',
            articleHtml: uploadHtml.trim(),
            title: uploadTitle.trim(),
            slug,
            category: uploadCategory || undefined,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok || data.error) {
        setUploadResult(`Failed: ${data.error || res.status}`);
      } else {
        const msg = uploadEntry === 'full'
          ? `Queued "${uploadTitle.trim().slice(0, 50)}" — click Produce to start`
          : `Submitted "${uploadTitle.trim().slice(0, 50)}" — independence review dispatched`;
        setUploadResult(msg);
        setUploadTitle('');
        setUploadCategory('');
        setUploadHtml('');
        setTimeout(() => setUploadResult(null), 6000);
      }
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      setUploadResult(`Error: ${err instanceof Error ? err.message : 'network failure'}`);
    } finally { setUploading(false); }
  };

  const produceFromQueue = async (queueId: string, topic: string) => {
    const ok = await ask({ title: 'Produce topic', message: `Produce "${topic.replace(/\*\*/g, '').slice(0, 80)}" now? This will research and create an editorial brief.`, confirmLabel: 'Produce' });
    if (!ok) return;
    setTriggering(true);
    setProduceResult(null);
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'produce-topic', queueId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setProduceResult(`Error: ${data.error}`);
      } else {
        setProduceResult(data.message || `Dispatched research for "${topic.replace(/\*\*/g, '').slice(0, 60)}"`);
      }
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      setProduceResult(`Network error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    finally { setTriggering(false); }
  };

  const updateQueueItem = async (queueId: string, updates: Record<string, unknown>) => {
    const prev = queue.find(q => q.id === queueId);
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'update-queue', queueId, ...updates }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setQueue(q => q.map(item => item.id === queueId ? { ...item, ...updates } as QueueItem : item));
      setTimeout(fetchStatus, 1000);
    } catch (err) {
      flashFeedback(false, `Update failed: ${err instanceof Error ? err.message : 'unknown'}`);
      // Rollback: restore previous state via refetch
      if (prev) setTimeout(fetchStatus, 500);
    }
  };

  const deleteQueueItem = async (queueId: string) => {
    // Optimistically remove from local state immediately (prevents "where did it go?" confusion)
    setQueue(q => q.filter(item => item.id !== queueId));
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'delete-queue', queueId }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      flashFeedback(true, 'Topic removed from queue');
    } catch (err) {
      flashFeedback(false, `Delete failed: ${err instanceof Error ? err.message : 'unknown'}`);
      setTimeout(fetchStatus, 500); // Re-fetch to restore if delete actually failed
    }
  };

  const killArticle = async (logId: string) => {
    const ok = await ask({ title: 'Kill article', message: 'Kill this article? It will be marked as failed and removed from the pipeline.', confirmLabel: 'Kill', danger: true });
    if (!ok) return;
    setKillingId(logId);
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'kill-article', logId, reason: 'Killed by admin from Mission Control' }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      flashFeedback(true, 'Article killed');
      setTimeout(fetchStatus, 1000);
    } catch (err) { flashFeedback(false, `Kill failed: ${err instanceof Error ? err.message : 'unknown'}`); }
    finally { setKillingId(null); }
  };

  const clearAllBriefs = async () => {
    const briefCount = logs.filter(l => l.status === 'editor_approved').length;
    if (briefCount === 0) return;
    const ok = await ask({ title: 'Clear all briefs', message: `Clear all ${briefCount} editor-approved briefs? They will be marked as failed.`, confirmLabel: 'Clear All', danger: true });
    if (!ok) return;
    try {
      const briefLogs = logs.filter(l => l.status === 'editor_approved');
      for (const log of briefLogs) {
        await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
          body: JSON.stringify({ action: 'kill-article', logId: log.id, reason: 'Cleared by admin — stale brief' }),
        });
      }
      setTimeout(fetchStatus, 1000);
    } catch { /* ignore */ }
  };

  // ─── Derived ────────────────────────────────────────────────────

  const overallStatus = getOverallStatus(logs);

  type PipelineStageKey = StageConfig['key'];
  const stageLogsMap: Record<PipelineStageKey, PipelineLog[]> = {
    research: [], editor_brief: [], write: [], independence: [], qc: [], voice_rewrite: [], copy_edit: [], publish: [],
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
    <div className="pipeline-wrapper">
      {/* ── Top Status Bar ── */}
      <div className="pipeline-status-bar">
        <div className="pipeline-status-indicator">
          <span className={`pipeline-status-dot ${overallStatus}`} />
          <span className="admin-weight-600" style={{ color: statusColors[overallStatus] }}>
            {overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}
          </span>
          {inPipeline > 0 && (
            <span className="admin-text-xs admin-color-secondary admin-ml-sm">
              {inPipeline} in flight
            </span>
          )}
          <span className="admin-text-xs admin-color-muted admin-ml-md">
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
          <div className="pipeline-spend-box">
            <span className="admin-text-sm admin-color-subtle">Total Spend</span>
            <span className="admin-text-lg admin-weight-600 admin-tabular-nums" style={{ color: totalCost > 50 ? '#f87171' : totalCost > 20 ? '#f59e0b' : '#b5b0a9' }}>
              ${totalCost.toFixed(2)}
            </span>
          </div>
        )}

        {logs.filter(l => l.status === 'editor_approved').length > 0 && (
          <button
            onClick={clearAllBriefs}
            className="pipeline-retry-btn admin-action-btn-danger-subtle admin-weight-600"
          >
            Clear All Briefs ({logs.filter(l => l.status === 'editor_approved').length})
          </button>
        )}

        <div className="pipeline-quick-actions">
          <div className="admin-flex-center admin-gap-xs">
            <span className="admin-text-micro admin-color-muted admin-uppercase admin-weight-600 admin-ml-xs">Scout</span>
            {[
              { id: 'gemini', label: 'Gemini', color: '#fbbf24' },
              { id: 'sonnet', label: 'Sonnet', color: '#f97316' },
              { id: 'grok', label: 'Grok', color: '#3b82f6' },
            ].map(s => (
              <button
                key={s.id}
                className="pipeline-trigger-btn pipeline-scout-btn"
                onClick={() => triggerSingleScout(s.id)}
                disabled={scouting !== null}
                style={scouting === s.id ? { borderColor: s.color, color: s.color } : undefined}
              >
                {scouting === s.id ? '\u2026' : s.label}
              </button>
            ))}
            <button
              className="pipeline-trigger-btn pipeline-scout-btn"
              onClick={triggerScout}
              disabled={scouting !== null}
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
        <div className="admin-toast admin-toast-success admin-pre-wrap">
          <span>{scoutResult}</span>
          <button className="admin-toast-dismiss" onClick={() => setScoutResult(null)}>{'\u00d7'}</button>
        </div>
      )}
      {produceResult && (
        <div className={`admin-toast ${produceResult.includes('Error') || produceResult.includes('Skipped') ? 'admin-toast-error' : 'admin-toast-success'}`}>
          <span>{produceResult}</span>
          <button className="admin-toast-dismiss" onClick={() => setProduceResult(null)}>{'\u00d7'}</button>
        </div>
      )}
      {actionFeedback && (
        <div className={`admin-toast ${actionFeedback.ok ? 'admin-toast-success' : 'admin-toast-error'}`}>
          <span>{actionFeedback.msg}</span>
          <button className="admin-toast-dismiss" onClick={() => setActionFeedback(null)}>{'\u00d7'}</button>
        </div>
      )}

      {/* ── 7-Stage Pipeline ── */}
      <div className="pipeline-container">
        {PIPELINE_STAGE_CONFIG.map((stage) => {
          const items = stageLogsMap[stage.key];
          return (
            <div key={stage.key} className="pipeline-stage">
              <div className="pipeline-stage-header">
                <span className="pipeline-stage-icon">{stage.icon}</span>
                <span>{stage.label}</span>
                <span className="admin-text-micro admin-weight-600 admin-ml-xs" style={{ color: stage.modelColor, opacity: 0.8 }}>
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
      <section>
        <h3 className="pipeline-section-title">
          Topic Queue {queue.filter(q => q.status === 'queued').length > 0 && (
            <span className="admin-text-base admin-color-green">
              {' '}{queue.filter(q => q.status === 'queued').length} queued
            </span>
          )}
        </h3>

        {/* ── Upload Article ── */}
        <button
          onClick={() => setUploadOpen(!uploadOpen)}
          className="pipeline-trigger-btn admin-text-md"
          style={{ marginBottom: '0.5rem', width: '100%', justifyContent: 'center', gap: '0.375rem', background: uploadOpen ? 'rgba(168,162,158,0.1)' : 'transparent', border: '1px dashed rgba(168,162,158,0.25)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          {uploadOpen ? 'Close' : 'Upload Article to Pipeline'}
        </button>

        {uploadOpen && (
          <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'rgba(15,14,12,0.5)', border: '1px solid rgba(168,162,158,0.12)', borderRadius: '6px' }}>
            {/* Entry point toggle */}
            <div style={{ display: 'flex', gap: '2px', marginBottom: '0.5rem', background: 'rgba(168,162,158,0.08)', borderRadius: '4px', padding: '2px' }}>
              <button
                onClick={() => setUploadEntry('full')}
                className="admin-text-md"
                style={{ flex: 1, padding: '0.375rem 0.5rem', borderRadius: '3px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.6875rem', fontWeight: 600, transition: 'all 0.15s', background: uploadEntry === 'full' ? 'rgba(168,162,158,0.15)' : 'transparent', color: uploadEntry === 'full' ? '#e7e6e3' : '#78716c' }}
              >
                Full Chain — Research → Editor → Write → QC → Publish
              </button>
              <button
                onClick={() => setUploadEntry('independence')}
                className="admin-text-md"
                style={{ flex: 1, padding: '0.375rem 0.5rem', borderRadius: '3px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.6875rem', fontWeight: 600, transition: 'all 0.15s', background: uploadEntry === 'independence' ? 'rgba(168,162,158,0.15)' : 'transparent', color: uploadEntry === 'independence' ? '#e7e6e3' : '#78716c' }}
              >
                Finished Article — Independence → QC → Publish
              </button>
            </div>

            <input
              type="text"
              placeholder={uploadEntry === 'full' ? 'Topic or article title (required)' : 'Article title (required)'}
              value={uploadTitle}
              onChange={e => setUploadTitle(e.target.value)}
              className="pipeline-queue-input"
              style={{ marginBottom: '0.375rem', borderColor: !uploadTitle.trim() && uploadHtml.trim() ? '#ef4444' : undefined }}
            />
            <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem' }}>
              <select
                value={uploadCategory}
                onChange={e => setUploadCategory(e.target.value)}
                className="pipeline-queue-select"
              >
                <option value="">Category</option>
                {VALID_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                onClick={() => uploadFileRef.current?.click()}
                disabled={uploadParsing}
                className="pipeline-trigger-btn admin-text-md"
                style={{ whiteSpace: 'nowrap' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {uploadParsing ? 'Parsing\u2026' : '.pdf .md .docx .html .txt'}
              </button>
              <input ref={uploadFileRef} type="file" accept=".md,.txt,.html,.htm,.docx,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }} />
            </div>
            <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem' }}>
              <input
                type="text"
                placeholder="https://... — fetch article from URL"
                value={uploadUrl}
                onChange={e => setUploadUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') fetchUrl(); }}
                className="pipeline-queue-input"
                style={{ flex: 1 }}
              />
              <button
                onClick={fetchUrl}
                disabled={uploadParsing || !uploadUrl.trim()}
                className="pipeline-trigger-btn admin-text-md"
                style={{ whiteSpace: 'nowrap' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                {uploadParsing ? 'Fetching\u2026' : 'Fetch'}
              </button>
            </div>
            <textarea
              placeholder={uploadEntry === 'full' ? 'Paste or drop source material, notes, study text, or a draft (optional)' : 'Paste or drop finished article HTML, or use the file button above'}
              value={uploadHtml}
              onChange={e => setUploadHtml(e.target.value)}
              onPaste={e => { setTimeout(() => { const v = (e.target as HTMLTextAreaElement).value; if (v) suggestTitle(v); }, 0); }}
              onDragOver={e => { e.preventDefault(); setUploadDragOver(true); }}
              onDragLeave={() => setUploadDragOver(false)}
              onDrop={e => { e.preventDefault(); setUploadDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUploadFile(f); }}
              rows={4}
              className="pipeline-queue-input"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', resize: 'vertical', minHeight: '80px', borderColor: uploadDragOver ? '#ef4444' : undefined, background: uploadDragOver ? 'rgba(239,68,68,0.05)' : undefined }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.375rem' }}>
              <span style={{ fontSize: '0.6875rem', color: '#78716c' }}>
                {uploadHtml
                  ? `${uploadHtml.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length} words`
                  : uploadEntry === 'full'
                    ? 'Queues as topic with source material — click Produce to start'
                    : 'Finished article enters at Grok independence review'}
              </span>
              <button
                onClick={submitArticleToChain}
                disabled={uploading || !uploadTitle.trim() || (uploadEntry === 'independence' && !uploadHtml.trim())}
                className="pipeline-trigger-btn primary admin-text-md"
              >
                {uploading ? 'Submitting\u2026' : uploadEntry === 'full' ? 'Queue Topic' : 'Submit Article'}
              </button>
            </div>
            {uploadResult && (
              <div className={`admin-toast admin-mt-sm ${uploadResult.startsWith('Failed') || uploadResult.startsWith('Error') ? 'admin-toast-error' : 'admin-toast-success'}`}>
                {uploadResult}
              </div>
            )}
          </div>
        )}

        <div className="pipeline-queue-input-row">
          <input
            type="text"
            placeholder="Topic idea (e.g. 'Microbiome-sleep connection') — added with high priority"
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') queueTopic(); }}
            className="pipeline-queue-input"
          />
          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            className="pipeline-queue-select"
          >
            <option value="">Category</option>
            {VALID_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label className="pipeline-expedite-label">
            <input
              type="checkbox"
              checked={newExpedite}
              onChange={e => setNewExpedite(e.target.checked)}
              className="pipeline-expedite-check"
            />
            Expedite
          </label>
          <button
            onClick={queueTopic}
            disabled={queueing || !newTopic.trim()}
            className="pipeline-trigger-btn primary admin-text-md"
          >
            {queueing ? 'Adding\u2026' : '+ Queue'}
          </button>
        </div>

        {queueResult && (
          <div className={`admin-toast admin-mb-md ${queueResult.startsWith('Failed') || queueResult.startsWith('Error') ? 'admin-toast-error' : 'admin-toast-success'}`}>
            {queueResult}
          </div>
        )}

        {queue.length > 0 && (
          <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.5rem' }}>
            <input
              type="text"
              placeholder="Search queue..."
              value={queueSearch}
              onChange={e => setQueueSearch(e.target.value)}
              className="pipeline-queue-input"
              style={{ flex: 1 }}
            />
            {(['queued', 'all', 'completed', 'in_progress'] as const).map(f => {
              const count = f === 'all' ? queue.length : queue.filter(q => q.status === f).length;
              const label = f === 'in_progress' ? 'Active' : f.charAt(0).toUpperCase() + f.slice(1);
              return (
                <button
                  key={f}
                  onClick={() => setQueueFilter(f)}
                  className="pipeline-trigger-btn admin-text-md"
                  style={{ padding: '0.25rem 0.5rem', background: queueFilter === f ? 'rgba(168,162,158,0.15)' : 'transparent', color: queueFilter === f ? '#e7e6e3' : '#78716c', border: 'none', fontWeight: queueFilter === f ? 600 : 400 }}
                >
                  {label} <span style={{ opacity: 0.5, fontSize: '0.6875rem' }}>({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {queue.length > 0 && (
          <div className="pipeline-completed-list">
            {queue.filter(item => {
              const hasSearch = queueSearch.trim().length > 0;
              // When searching, show all statuses so results aren't hidden
              if (!hasSearch && queueFilter !== 'all' && item.status !== queueFilter) return false;
              if (hasSearch) {
                const s = queueSearch.toLowerCase();
                return item.topic.toLowerCase().includes(s) || (item.category || '').toLowerCase().includes(s) || (item.notes || '').toLowerCase().includes(s);
              }
              return true;
            }).map(item => {
              const isActive = item.status === 'in_progress' || item.status === 'assigned';
              const isQueued = item.status === 'queued';
              const cleanTopic = item.topic.replace(/\*\*/g, '').replace(/^[\s\-]*Topic\s*Description\s*:?\s*/i, '').trim();
              return (
                <div
                  key={item.id}
                  className="pipeline-card"
                  style={{ borderLeftColor: item.expedite ? '#ef4444' : isActive ? '#22c55e' : 'rgba(255,255,255,0.08)', borderLeftWidth: '3px', opacity: isActive ? 1 : 0.85, cursor: 'pointer' }}
                  onClick={() => setExpandedQueueId(expandedQueueId === item.id ? null : item.id)}
                >
                  <div className="admin-flex-between-top admin-gap-md">
                    <div className="admin-flex-1">
                      <div className="pipeline-card-title admin-text-md">{cleanTopic}</div>
                      <div className="admin-text-sm admin-color-subtle admin-flex admin-gap-md admin-flex-wrap admin-mt-sm">
                        {item.category && <span>{item.category}</span>}
                        {item.expedite && <span className="admin-weight-600 admin-color-red">EXPEDITE</span>}
                        {isActive && <span className="admin-weight-600 admin-color-green">{item.status.toUpperCase()}</span>}
                        <span className="admin-color-muted">P{item.priority}</span>
                        {item.source === 'breaking' ? (
                          <span className="admin-status-badge admin-status-breaking">BREAKING</span>
                        ) : (
                          <span className="admin-color-muted">{item.source}</span>
                        )}
                        {item.editor_score && <span className="admin-weight-600" style={{ color: getScoreColor(item.editor_score) }}>Score: {item.editor_score}/10</span>}
                      </div>
                    </div>
                    {/* ── Queue Item Controls ── */}
                    {isQueued && (
                      <div className="admin-flex-center admin-gap-xs admin-flex-shrink-0">
                        <button
                          className="pipeline-retry-btn admin-action-btn-green admin-weight-600"
                          onClick={() => produceFromQueue(item.id, item.topic)}
                          disabled={triggering || overallStatus === 'running'}
                          title="Produce this topic now"
                        >
                          {'\u25B6'} Produce
                        </button>
                        <button
                          className="pipeline-retry-btn"
                          onClick={() => updateQueueItem(item.id, { expedite: !item.expedite })}
                          style={{ color: item.expedite ? '#dc2626' : '#a8a29e', borderColor: item.expedite ? '#7f1d1d' : '#44403c' }}
                          title={item.expedite ? 'Remove expedite' : 'Expedite (jump to front)'}
                        >
                          {item.expedite ? '\u2B07 Normal' : '\u26A1 Expedite'}
                        </button>
                        <button
                          className="pipeline-retry-btn pipeline-priority-btn"
                          onClick={() => updateQueueItem(item.id, { priority: Math.max(1, item.priority - 10) })}
                          title="Raise priority (lower number = higher priority)"
                        >
                          {'\u2191'}
                        </button>
                        <button
                          className="pipeline-retry-btn pipeline-priority-btn"
                          onClick={() => updateQueueItem(item.id, { priority: Math.min(100, item.priority + 10) })}
                          title="Lower priority"
                        >
                          {'\u2193'}
                        </button>
                        <button
                          className="pipeline-retry-btn admin-action-btn-danger-subtle"
                          onClick={async () => { if (await ask({ title: 'Delete topic', message: `Delete "${cleanTopic}" from queue?`, confirmLabel: 'Delete', danger: true })) deleteQueueItem(item.id); }}
                          title="Delete from queue"
                        >
                          {'\u2715'}
                        </button>
                      </div>
                    )}
                    {isActive && (
                      <div className="admin-flex-center admin-gap-xs admin-flex-shrink-0">
                        <span className="admin-status-badge admin-status-in-progress admin-nowrap">
                          {item.status === 'in_progress' ? 'Producing\u2026' : 'Assigned'}
                        </span>
                        <button
                          className="pipeline-retry-btn admin-action-btn-yellow"
                          onClick={() => updateQueueItem(item.id, { status: 'queued' })}
                          title="Reset to queued (if stuck)"
                        >
                          Reset
                        </button>
                        <button
                          className="pipeline-retry-btn admin-action-btn-danger-subtle"
                          onClick={async () => { if (await ask({ title: 'Delete topic', message: `Delete "${cleanTopic}" from queue?`, confirmLabel: 'Delete', danger: true })) deleteQueueItem(item.id); }}
                          title="Delete from queue"
                        >
                          {'\u2715'}
                        </button>
                      </div>
                    )}
                    {!isQueued && !isActive && (
                      <div className="admin-flex-center admin-gap-xs admin-flex-shrink-0">
                        <span className="admin-color-muted admin-text-sm">{item.status}</span>
                        <button
                          className="pipeline-retry-btn admin-action-btn-yellow"
                          onClick={(e) => { e.stopPropagation(); updateQueueItem(item.id, { status: 'queued' }); }}
                          title="Requeue this topic"
                        >
                          Requeue
                        </button>
                        <button
                          className="pipeline-retry-btn admin-action-btn-danger-subtle"
                          onClick={async (e) => { e.stopPropagation(); if (await ask({ title: 'Delete topic', message: `Delete "${cleanTopic}" from queue?`, confirmLabel: 'Delete', danger: true })) deleteQueueItem(item.id); }}
                          title="Delete from queue"
                        >
                          {'\u2715'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded detail view */}
                  {expandedQueueId === item.id && (
                    <div className="admin-expanded-section admin-text-base" onClick={(e) => e.stopPropagation()}>
                      {item.notes && (
                        <div className="admin-mb-md">
                          <span className="admin-detail-label">Scout Notes: </span>
                          <span className="admin-color-secondary">{item.notes}</span>
                        </div>
                      )}
                      {item.research_summary && (
                        <div className="admin-mb-md">
                          <span className="admin-detail-label">Why: </span>
                          <span className="admin-color-secondary">{item.research_summary}</span>
                        </div>
                      )}
                      <div className="admin-flex admin-gap-xl admin-color-muted admin-text-sm">
                        <span>Added: {new Date(item.created_at).toLocaleString()}</span>
                        <span>Source: {item.source}</span>
                        <span>Priority: {item.priority}</span>
                      </div>
                    </div>
                  )}
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
              const penName = log.model_used ? getPenName(log.model_used) : null;
              const showPenName = penName && penName !== 'alumi Editorial';
              const isExpanded = expandedId === log.id;
              const rd = log.research_data || {};
              const brief = (rd as PipelineResearchData)._editorBrief as Record<string, unknown> | undefined;
              const indReview = (rd as PipelineResearchData)._independenceReview as Record<string, unknown> | undefined;
              const pubmed = (rd as PipelineResearchData)._pubmedVerification as { verified?: number; failed?: number; skipped?: number; total?: number; details?: Array<{ title: string; found: boolean; skipped?: boolean; source?: string; pmid?: string; doi?: string; url?: string }> } | undefined;
              const qcResult = (rd as PipelineResearchData)._qcResult as Record<string, unknown> | undefined;
              const copyEditResult = (rd as Record<string, unknown>)._copyEditResult as { appliedChanges: number; totalProposed: number; summary: string; details: string[] } | undefined;
              const briefDetails = brief?.brief as Record<string, unknown> | undefined;
              const tokenUsage = log.token_usage as Array<{ model: string; stage: string; inputTokens: number; outputTokens: number; costUsd: number }> | null;

              return (
                <div key={log.id} className="pipeline-card completed admin-pointer" onClick={() => setExpandedId(isExpanded ? null : log.id)}>
                  <div className="admin-flex-between">
                    <div className="admin-flex-1">
                      <div className="pipeline-card-title admin-mb-sm">
                        {log.title || log.topic || 'Untitled'}
                      </div>
                      <div className="admin-flex admin-gap-lg admin-text-sm admin-color-subtle admin-flex-wrap admin-flex-center">
                        {showPenName && <span className="admin-weight-500 admin-color-purple">{penName}</span>}
                        {indScore !== null && (
                          <span style={{ color: getScoreColor(indScore) }}>
                            Independence: {indScore}/10
                          </span>
                        )}
                        {log.cost_usd && parseFloat(String(log.cost_usd)) > 0 && (
                          <span className="admin-color-secondary admin-tabular-nums">{formatCost(log.cost_usd)}</span>
                        )}
                        <span>{timeAgo(log.completed_at || log.created_at)}</span>
                        <span className="admin-color-muted admin-text-xs">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                      </div>
                    </div>
                    <div className="admin-flex admin-gap-sm admin-flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {log.slug && <a href={`/admin/edit/${log.slug}`} className="pipeline-retry-btn admin-no-underline">Edit</a>}
                      {log.slug && <a href={`/articles/${log.slug}`} target="_blank" rel="noopener noreferrer" className="pipeline-retry-btn admin-no-underline">{'\u2192'} View</a>}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="admin-expanded-section">
                      {/* ── Research ── */}
                      <div className="admin-expanded-block">
                        <div className="admin-stage-label">1. Research</div>
                        {(rd as PipelineResearchData).topic && <div className="admin-color-secondary">Topic: {(rd as PipelineResearchData).topic}</div>}
                        {((rd as PipelineResearchData).keyFindings)?.slice(0, 3).map((f: string, i: number) => (
                          <div key={i} className="admin-color-subtle pipeline-research-bar admin-mt-xs">{f}</div>
                        ))}
                      </div>

                      {/* ── Editor Brief ── */}
                      {brief && (
                        <div className="admin-expanded-block">
                          <div className="admin-stage-label">2. Editor Brief</div>
                          <div className="admin-color-secondary">Score: <span className="admin-color-primary admin-weight-600">{brief.topicScore as number}/10</span> | Archetype: {brief.archetype as string || '?'}</div>
                          {brief.angle && <div className="admin-color-secondary admin-italic admin-mt-sm">Angle: {(brief.angle as string).slice(0, 150)}</div>}
                          {briefDetails?.tonePreset && <div className="admin-color-subtle">Tone: {briefDetails.tonePreset as string} | Density: {briefDetails.density as string || '?'} | Pacing: {briefDetails.pacing as string || '?'}</div>}
                          {(briefDetails?.dogmaWarnings as string[] | undefined)?.length ? (
                            <div className="admin-color-yellow admin-mt-sm">Dogma warnings: {(briefDetails!.dogmaWarnings as string[]).join('; ')}</div>
                          ) : null}
                        </div>
                      )}

                      {/* ── Writer ── */}
                      <div className="admin-expanded-block">
                        <div className="admin-stage-label">3. Writer</div>
                        <div className="admin-color-secondary">Model: <span className="admin-weight-500 admin-color-purple">{log.model_used || '?'}</span>{showPenName ? ` (${penName})` : ''} | Revision: {log.revision_count || 0}</div>
                      </div>

                      {/* ── Independence Review ── */}
                      {indReview && (
                        <div className="admin-expanded-block admin-expanded-highlight">
                          <div className="admin-stage-label">4. Grok Independence Review</div>
                          <div className="admin-color-secondary">
                            Verdict: <span className="admin-weight-600" style={{ color: (indReview.verdict as string) === 'clean' ? '#4ade80' : (indReview.verdict as string) === 'minor_issues' ? '#fbbf24' : '#f87171' }}>{indReview.verdict as string}</span>
                            {' | '}Score: {(indReview.score as number) || '?'}/10
                            {indReview._revisionApplied && <span className="admin-color-purple admin-ml-md">Revisions applied</span>}
                          </div>
                          {(indReview.flags as Array<{ type: string; quote: string; rewrite: string }> | undefined)?.map((f, i) => (
                            <div key={i} className="admin-mt-sm admin-pl-md" style={{ borderLeft: `2px solid ${f.type === 'fabrication' ? '#f87171' : '#f59e0b'}` }}>
                              <span className="admin-text-micro admin-weight-600 admin-uppercase admin-color-yellow">[{f.type}]</span>
                              <div className="admin-text-sm admin-color-subtle">{(f.quote || '').slice(0, 100)}</div>
                              {f.rewrite && <div className="admin-text-sm admin-color-primary">{'\u2192'} {(f.rewrite || '').slice(0, 100)}</div>}
                            </div>
                          ))}
                          {(indReview.summary as string) && <div className="admin-color-subtle admin-italic admin-mt-sm">{(indReview.summary as string).slice(0, 200)}</div>}
                        </div>
                      )}

                      {/* ── PubMed Verification ── */}
                      {pubmed && pubmed.total && pubmed.total > 0 && (
                        <div className="admin-expanded-block">
                          <div className="admin-stage-label">5. PubMed Verification</div>
                          <div className="admin-color-secondary">
                            <span className="admin-color-green">{pubmed.verified} verified</span>
                            {pubmed.failed ? <span className="admin-color-red admin-ml-md">{pubmed.failed} not found</span> : null}
                            {pubmed.skipped ? <span className="admin-color-muted admin-ml-md">{pubmed.skipped} skipped</span> : null}
                            {' / '}{pubmed.total} citations
                          </div>
                          {pubmed.details?.filter(d => d.found).map((d, i) => (
                            <div key={i} className="admin-text-sm admin-mt-sm admin-color-green admin-pl-md pipeline-error-bar">
                              {'\u2713'} {d.title.slice(0, 70)}
                              {d.source && <span className="admin-color-muted admin-ml-sm" style={{ fontSize: '10px', textTransform: 'uppercase' }}>{d.source === 'semantic_scholar' ? 'S2' : d.source}</span>}
                              {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="admin-color-purple admin-ml-sm admin-no-underline" onClick={e => e.stopPropagation()} style={{ fontSize: '10px' }}>{d.pmid ? `PMID:${d.pmid}` : d.doi ? `DOI` : 'link'}</a>}
                            </div>
                          ))}
                          {pubmed.details?.filter(d => !d.found && !d.skipped).map((d, i) => (
                            <div key={i} className="admin-text-sm admin-mt-sm admin-color-red admin-pl-md pipeline-error-bar">
                              {'\u2717'} {d.title.slice(0, 80)}
                            </div>
                          ))}
                          {pubmed.details?.filter(d => d.skipped).map((d, i) => (
                            <div key={i} className="admin-text-sm admin-mt-sm admin-color-muted admin-pl-md pipeline-error-bar">
                              {'—'} {d.title.slice(0, 80)}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── QC Result ── */}
                      {qcResult && (
                        <div className="admin-expanded-block">
                          <div className="admin-stage-label">6. QC</div>
                          <div className="admin-color-secondary">
                            Decision: <span className="admin-color-green admin-weight-600">{qcResult.decision as string}</span>
                            {' | '}Score: {qcResult.qualityScore as number || '?'}/10
                            {(qcResult.edits as Record<string, unknown>)?.headlineChanged && <span className="admin-color-yellow admin-ml-md">Headline revised</span>}
                            {(qcResult.edits as Record<string, unknown>)?.descriptionChanged && <span className="admin-color-yellow admin-ml-md">Description revised</span>}
                          </div>
                          {(qcResult.edits as Record<string, unknown>)?.notes && (
                            <div className="admin-color-subtle admin-italic admin-mt-sm">{((qcResult.edits as Record<string, unknown>).notes as string).slice(0, 150)}</div>
                          )}
                        </div>
                      )}

                      {/* ── Copy Edit ── */}
                      {copyEditResult && (
                        <div className="admin-expanded-block">
                          <div className="admin-stage-label">7. Copy Edit</div>
                          <div className="admin-color-secondary">
                            {copyEditResult.appliedChanges === 0
                              ? <span className="admin-color-green">No changes needed</span>
                              : <span className="admin-color-yellow">{copyEditResult.appliedChanges} change{copyEditResult.appliedChanges !== 1 ? 's' : ''} applied (of {copyEditResult.totalProposed} proposed)</span>
                            }
                          </div>
                          {copyEditResult.details?.map((d, i) => (
                            <div key={i} className="admin-color-subtle admin-text-sm admin-mt-xs admin-pl-md">{d}</div>
                          ))}
                        </div>
                      )}

                      {/* ── Cost Breakdown ── */}
                      {tokenUsage && tokenUsage.length > 0 && (
                        <div>
                          <div className="admin-stage-label">Cost Breakdown</div>
                          <div className="pipeline-cost-grid">
                            <span className="pipeline-cost-header">Stage</span><span className="pipeline-cost-header">Model</span><span className="pipeline-cost-header">Tokens</span><span className="pipeline-cost-header">Cost</span>
                            {tokenUsage.map((t, i) => (
                              <Fragment key={i}>
                                <span className="admin-color-secondary">{t.stage}</span>
                                <span>{t.model?.split('-').slice(0, 2).join('-') || '?'}</span>
                                <span className="admin-tabular-nums">{(t.inputTokens + t.outputTokens).toLocaleString()}</span>
                                <span className="admin-tabular-nums admin-color-secondary">${t.costUsd?.toFixed(4) || '?'}</span>
                              </Fragment>
                            ))}
                          </div>
                          <div className="admin-mt-sm admin-color-secondary admin-weight-600 admin-text-xs">Total: {formatCost(log.cost_usd)}</div>
                        </div>
                      )}

                      <div className="admin-mt-lg admin-color-muted admin-text-xs">
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
                <div key={log.id} className="pipeline-card admin-border-left-yellow">
                  <div className="pipeline-card-title admin-color-secondary">
                    {log.title || log.topic || 'Untitled'}
                  </div>
                  <div className="admin-text-base admin-color-yellow admin-italic admin-mt-sm">
                    Killed: {truncate(reason, 200)}
                  </div>
                  <div className="pipeline-card-time admin-mt-sm">
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
          <h3 className="pipeline-section-title admin-color-red">
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
                <div className="admin-flex-between admin-mt-md admin-gap-md">
                  <span className="pipeline-card-time">
                    {timeAgo(log.completed_at || log.created_at)}
                  </span>
                  <div className="admin-flex admin-gap-sm">
                    {log.topic && (
                      <button
                        className="pipeline-retry-btn admin-action-btn-yellow"
                        onClick={() => requeueFromFailed(log.id, log.topic!)}
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
      {ConfirmDialog}
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
  const [writerTitle, setWriterTitle] = useState('');
  const [submitResult, setSubmitResult] = useState<string | null>(null);

  const isActive = ACTIVE_STATUSES.has(log.status);
  const isAwaitingWrite = log.status === 'editor_approved';
  const displayTitle = log.title || log.topic || 'Pending topic\u2026';
  const modelName = log.model_used ? getPenName(log.model_used) : undefined;
  const statusText = isAwaitingWrite ? 'Ready for you to write with Opus' : getStatusText(log.status, modelName);

  // Build the Claude prompt client-side from already-loaded research_data (no fetch = no clipboard permission issue)
  const copyBriefForClaude = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingBrief(true);

    // Use ClipboardItem with a promise — preserves user gesture context across async fetch
    const briefPromise = fetch(`${apiBase}/pipeline-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-brief', logId: log.id }),
    })
      .then(res => res.json())
      .then(data => {
        if (!data.claudePrompt) throw new Error(data.error || 'No brief returned');
        const prompt = `CRITICAL OUTPUT RULE: Return ONLY the article body content — the <section> tags. Do NOT return a full HTML page. No <!DOCTYPE>, no <html>, no <head>, no <body>, no <style>, no CSS, no fonts, no layout wrappers. JUST the <section> elements with class="reveal" as shown in the format below. Your output gets inserted into an existing Astro template that already handles all layout, typography, and styling.

Slug for this article: ${data.slug || log.slug || 'auto-generate'}
Category: ${data.editorBrief?.categoryOverride || data.researchData?.category || 'Clinical Evidence'}

${data.claudePrompt}`;
        return new Blob([prompt], { type: 'text/plain' });
      });

    navigator.clipboard.write([
      new ClipboardItem({ 'text/plain': briefPromise }),
    ]).then(() => {
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 3000);
    }).catch(() => {
      // Fallback: fetch then open in new window for manual copy
      briefPromise.then(blob => blob.text()).then(text => {
        const w = window.open('', '_blank');
        if (w) {
          w.document.write('<pre style="white-space:pre-wrap;font-size:13px;padding:1rem">' + text.replace(/</g, '&lt;') + '</pre>');
          w.document.title = 'Copy Brief for Claude';
        }
      }).catch(err => {
        alert('Failed to load brief: ' + (err instanceof Error ? err.message : 'unknown'));
      });
    }).finally(() => {
      setLoadingBrief(false);
    });
  };

  // Submit the user's Opus-written article
  const submitArticle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!articleHtml.trim()) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ action: 'submit-article', logId: log.id, articleHtml: articleHtml.trim(), ...(writerTitle.trim() ? { title: writerTitle.trim() } : {}) }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setSubmitResult('Article submitted! Pipeline resuming with Grok independence review.');
        setShowSubmitForm(false);
        setArticleHtml('');
        setWriterTitle('');
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
  const indReview = (log.research_data as PipelineResearchData | null)?._independenceReview;
  const candidates = (log.research_data as PipelineResearchData | null)?.candidates;
  const candidateScores = (log.research_data as PipelineResearchData | null)?._editorBrief?.candidateScores;
  const penName = log.model_used ? getPenName(log.model_used) : null;
  const showPenName = penName && penName !== 'alumi Editorial';
  const modelShort = log.model_used ? log.model_used.replace('claude-', '').replace('-20250514', '') : null;

  return (
    <div
      className={`pipeline-card${isActive ? ' active' : ''}${isAwaitingWrite ? ' pipeline-hybrid-card' : ''}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
    >
      <div className="admin-flex-between-top admin-gap-md">
        <div className="pipeline-card-title admin-flex-1">{truncate(displayTitle, 60)}</div>
        <button
          className="pipeline-card-dismiss"
          onClick={(e) => { e.stopPropagation(); onKill(); }}
          disabled={killing}
          title="Dismiss this article"
        >
          ×
        </button>
      </div>
      <div className="pipeline-card-status">
        {statusText}
        {showPenName && <span className="admin-weight-500 admin-color-purple admin-ml-sm">by {penName}</span>}
      </div>
      <div className="pipeline-card-time">
        {timeAgo(log.created_at)}
        {modelShort && <span className="admin-color-muted admin-ml-sm">{modelShort}</span>}
        {log.source && <span className="admin-color-muted admin-ml-sm">{log.source}</span>}
      </div>

      {(score !== null || indScore !== null || (log.cost_usd && parseFloat(String(log.cost_usd)) > 0)) && (
        <div className="pipeline-card-meta">
          {score !== null && (
            <span className={`pipeline-card-score ${score >= 7 ? 'high' : score >= 4 ? 'mid' : 'low'}`}>
              Editor: {score}/10
            </span>
          )}
          {indScore !== null && (
            <span className={`pipeline-card-score admin-ml-md ${indScore >= 7 ? 'high' : indScore >= 4 ? 'mid' : 'low'}`}>
              Independence: {indScore}/10
            </span>
          )}
          {log.cost_usd && parseFloat(String(log.cost_usd)) > 0 && (
            <span className="admin-text-sm admin-color-secondary admin-tabular-nums admin-ml-md">
              {formatCost(log.cost_usd)}
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div className="admin-expanded-section">
          {/* Candidates from research */}
          {candidates && candidates.length > 1 && (
            <div className="admin-mb-lg">
              <span className="admin-detail-label">Research Candidates:</span>
              {candidates.map((c, i) => {
                const cScore = candidateScores?.find(cs => cs.rank === (c as Record<string, unknown>).rank);
                return (
                  <div key={i} className="admin-mt-sm pipeline-research-bar">
                    <span style={{ color: cScore ? (Number(cScore.score) >= 7 ? '#22c55e' : '#f59e0b') : '#b5b0a9' }}>
                      #{(c as Record<string, unknown>).rank}: {(c as Record<string, unknown>).headline_draft as string || (c as Record<string, unknown>).topic as string}
                    </span>
                    {cScore && <span className="admin-color-subtle admin-ml-md">({cScore.score}/10) {cScore.note}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {angle && (
            <div className="admin-mb-md">
              <span className="admin-detail-label">Angle: </span>
              <span className="admin-color-secondary admin-italic">{angle}</span>
            </div>
          )}

          {/* Independence Review */}
          {indReview && (indReview as Record<string, unknown>).overallAssessment !== 'skipped' && (
            <div className="admin-expanded-highlight admin-mb-md">
              <span className="admin-detail-label">Grok Independence: </span>
              <span style={{
                color: (indReview as Record<string, unknown>).overallAssessment === 'independent' ? '#16a34a'
                  : (indReview as Record<string, unknown>).overallAssessment === 'minor_concerns' ? '#f59e0b'
                  : '#dc2626'
              }}>
                {(indReview as Record<string, unknown>).overallAssessment as string} {((indReview as Record<string, unknown>).independenceScore || indReview.score) ? `(${(indReview as Record<string, unknown>).independenceScore || indReview.score}/10)` : ''}
              </span>
              {(indReview as Record<string, unknown>).annotations && ((indReview as Record<string, unknown>).annotations as Array<{ type: string; severity: string; observation: string }>).length > 0 && (
                <div className="admin-mt-sm">
                  {((indReview as Record<string, unknown>).annotations as Array<{ type: string; severity: string; observation: string }>).slice(0, 3).map((a, i) => (
                    <div key={i} className="admin-text-sm" style={{ color: a.severity === 'high' ? '#dc2626' : '#f59e0b', marginTop: '0.125rem' }}>
                      [{a.type}] {a.observation}
                    </div>
                  ))}
                </div>
              )}
              {indReview.summary && (
                <div className="admin-text-sm admin-italic admin-mt-sm admin-color-subtle">
                  {indReview.summary}
                </div>
              )}
            </div>
          )}

          {log.slug && (
            <div className="admin-detail-row">
              <span className="admin-color-subtle">Slug: </span>
              <code className="admin-color-muted admin-text-sm">{log.slug}</code>
            </div>
          )}
          <div className="admin-detail-row">
            <span className="admin-color-subtle">Status: </span>
            <span className="admin-color-secondary">{log.status}</span>
          </div>
          <div>
            <span className="admin-color-subtle">Started: </span>
            <span className="admin-color-secondary">{new Date(log.created_at).toLocaleTimeString()}</span>
          </div>
          {(log.research_data as PipelineResearchData | null)?.category && (
            <div className="admin-mt-sm">
              <span className="admin-color-subtle">Category: </span>
              <span className="admin-color-secondary">{(log.research_data as PipelineResearchData).category}</span>
            </div>
          )}
          {(log.research_data as PipelineResearchData | null)?._queueId && (
            <div className="admin-mt-sm">
              <span className="admin-color-yellow admin-text-sm">From topic queue</span>
            </div>
          )}

          {/* Hybrid workflow: Copy Brief + Submit Article for editor_approved articles */}
          {isAwaitingWrite && (
            <div className="admin-mt-lg pipeline-separator">
              <div className="pipeline-opus-box">
                <div className="admin-text-base admin-weight-600 admin-color-purple admin-mb-sm">Write with Opus</div>
                <div className="admin-text-sm admin-mb-md admin-color-secondary">
                  1. Copy the brief below, paste into Claude. 2. Opus writes the article. 3. Paste the HTML back here.
                </div>
                <div className="admin-flex admin-gap-md admin-flex-wrap">
                  <button
                    onClick={copyBriefForClaude}
                    disabled={loadingBrief}
                    className={`pipeline-retry-btn pipeline-btn-padded admin-weight-600 ${briefCopied ? 'admin-action-btn-green' : 'admin-action-btn-purple'}`}
                    style={{
                      background: briefCopied ? 'rgba(34, 197, 94, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                    }}
                  >
                    {loadingBrief ? 'Loading...' : briefCopied ? 'Copied!' : 'Copy Brief for Claude'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowSubmitForm(!showSubmitForm); }}
                    className="pipeline-retry-btn pipeline-btn-padded admin-weight-600 admin-action-btn-blue"
                  >
                    {showSubmitForm ? 'Cancel' : 'Submit Written Article'}
                  </button>
                </div>
              </div>

              {showSubmitForm && (
                <div className="admin-mt-md" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={writerTitle}
                    onChange={(e) => setWriterTitle(e.target.value)}
                    placeholder="Headline (optional — overrides editor's working headline)"
                    style={{
                      width: '100%', padding: '0.5rem',
                      background: 'rgba(255,255,255,0.03)', color: '#eae8e4',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                      fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.8125rem',
                      marginBottom: '0.5rem',
                    }}
                  />
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
                    className={`pipeline-retry-btn pipeline-btn-padded admin-weight-600 admin-mt-sm ${submitting ? 'admin-action-btn-muted' : 'admin-action-btn-green'}`}
                    style={{
                      background: submitting ? 'rgba(255,255,255,0.05)' : 'rgba(34, 197, 94, 0.15)',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {submitting ? 'Submitting...' : 'Submit & Resume Pipeline'}
                  </button>
                </div>
              )}

              {submitResult && (
                <div className={`admin-toast admin-mt-sm admin-text-sm ${submitResult.startsWith('Error') ? 'admin-toast-error' : 'admin-toast-success'}`}>
                  {submitResult}
                </div>
              )}
            </div>
          )}

          <div className="admin-mt-lg pipeline-separator">
            <button
              onClick={(e) => { e.stopPropagation(); onKill(); }}
              disabled={killing}
              className="pipeline-retry-btn admin-action-btn-danger-subtle"
            >
              {killing ? 'Killing\u2026' : 'Kill Article'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
