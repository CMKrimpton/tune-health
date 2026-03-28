import { useState, useEffect, useCallback, useRef } from 'react';
import { getAdminToken, timeAgo, getScoreColor } from './types';
import type { EditorBrief, QCResult } from './types';

// ─── Types ──────────────────────────────────────────────────────────

interface Props {
  apiBase: string;
  initialArticleCount: number;
}

interface LogEntry {
  id: string;
  run_date: string;
  topic: string;
  slug: string | null;
  title: string | null;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  research_data: {
    topic?: string;
    category?: string;
    _editorBrief?: EditorBrief;
    _qcResult?: QCResult;
    _article?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
}

interface QCReport {
  summary?: {
    overall_grade?: string;
    total_issues?: number;
    high?: number;
    medium?: number;
    low?: number;
    patterns?: string[];
    editorial_notes?: string;
  };
  issues?: QCIssue[];
}

interface QCIssue {
  slug: string;
  field: string;
  severity: 'high' | 'medium' | 'low';
  reason: string;
  current: string;
  suggested: string;
}

interface FixResult {
  slug: string;
  field: string;
  status: 'applied' | 'skipped' | 'error';
}

type Severity = 'high' | 'medium' | 'low';

// ─── Helpers ────────────────────────────────────────────────────────

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#4ade80';
  if (grade.startsWith('B')) return '#fbbf24';
  return '#f87171';
}

function gradeBg(grade: string): string {
  if (grade.startsWith('A')) return 'rgba(34, 197, 94, 0.1)';
  if (grade.startsWith('B')) return 'rgba(245, 158, 11, 0.1)';
  return 'rgba(239, 68, 68, 0.1)';
}

// ─── Collapsible Section ────────────────────────────────────────────

function Section({ title, icon, defaultOpen = false, badge, children }: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="agents-section">
      <button
        className="agents-section-header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="agents-header-left">
          {icon}
          <span>{title}</span>
        </span>
        {badge}
        <span className={`agents-chevron${open ? ' open' : ''}`}>
          &#9662;
        </span>
      </button>
      {open && <div className="agents-section-body">{children}</div>}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function AgentsPanel({ apiBase, initialArticleCount }: Props) {
  return (
    <div className="agents-panel-grid">
      <div>
        <ReaderQuestions apiBase={apiBase} />
        <EditorialQC apiBase={apiBase} articleCount={initialArticleCount} />
        <IllustrationAgent apiBase={apiBase} />
      </div>
      <div>
        <DecisionLog apiBase={apiBase} />
        <PingerActivity apiBase={apiBase} />
        <CronSchedule />
        <DatabaseSync apiBase={apiBase} initialCount={initialArticleCount} />
      </div>
    </div>
  );
}

// ─── 0. Reader Questions (from alumi Health app) ─────────────────

function ReaderQuestions({ apiBase }: { apiBase: string }) {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Array<{ topic: string; uniqueUsers: number; totalAsks: number; examples: string[]; keywords: string[] }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [queueingIdx, setQueueingIdx] = useState<number | null>(null);
  const [queued, setQueued] = useState<Set<number>>(new Set());

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getAdminToken() },
        body: JSON.stringify({ action: 'reader-questions' }),
      });
      const data = await res.json();
      setQuestions(data.questions || []);
      setMessage(data.message || `Found ${(data.questions || []).length} questions`);
      setQueued(new Set());
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const addToQueue = useCallback(async (idx: number, topic: string) => {
    setQueueingIdx(idx);
    try {
      await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getAdminToken() },
        body: JSON.stringify({ action: 'queue-topic', topic, source: 'reader_request', priority: 5, notes: `Asked by multiple users in alumi Health AI assistant` }),
      });
      setQueued(prev => new Set(prev).add(idx));
    } catch { /* silent */ }
    finally { setQueueingIdx(null); }
  }, [apiBase]);

  return (
    <Section
      title="Reader Questions"
      defaultOpen={true}
      icon={
        <div className="admin-section-icon-box admin-section-icon-red">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
      }
      badge={questions.length > 0 ? <span className="agents-badge-green">{questions.length} found</span> : undefined}
    >
      <p className="agents-hint">
        Finds health questions asked by 2+ different users in the alumi Health AI assistant. Real reader interest = real article ideas.
      </p>
      <button className="agents-btn agents-btn-primary" disabled={loading} onClick={fetchQuestions}>
        {loading ? 'Scanning conversations...' : 'Find Popular Questions'}
      </button>

      {message && (
        <p className={`agents-result ${message.startsWith('Error') ? 'agents-result-error' : 'admin-color-secondary'}`}>{message}</p>
      )}

      {questions.length > 0 && (
        <div className="agents-question-list">
          {questions.map((q, i) => (
            <div key={i} className="agents-question-card" style={{ borderLeft: `3px solid ${q.uniqueUsers >= 5 ? '#ef4444' : q.uniqueUsers >= 3 ? '#f59e0b' : 'rgba(255,255,255,0.08)'}` }}>
              <div className="admin-flex-between-top admin-gap-md">
                <div className="admin-flex-1">
                  <div className="agents-question-topic">
                    {q.topic.slice(0, 120)}{q.topic.length > 120 ? '...' : ''}
                  </div>
                  <div className="agents-question-meta">
                    <span style={{ color: q.uniqueUsers >= 5 ? '#f87171' : q.uniqueUsers >= 3 ? '#fbbf24' : '#a8a29e', fontWeight: 600 }}>{q.uniqueUsers} users</span>
                    <span>{q.totalAsks} times</span>
                    <span className="agents-question-keywords">{q.keywords.slice(0, 5).join(', ')}</span>
                  </div>
                </div>
                {queued.has(i) ? (
                  <span className="agents-queued-badge">Queued</span>
                ) : (
                  <button
                    className="pipeline-retry-btn admin-action-btn-green admin-nowrap"
                    onClick={() => addToQueue(i, q.topic)}
                    disabled={queueingIdx === i}
                  >
                    {queueingIdx === i ? 'Adding...' : '+ Queue'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── 0a. Pinger Activity Display ─────────────────────────────────────

function PingerActivity({ apiBase }: { apiBase: string }) {
  const [signals, setSignals] = useState<Array<{ id: string; topic: string; source: string; urgency: string; why_breaking: string; promoted_to_queue: boolean; created_at: string }>>([]);
  const [promoted, setPromoted] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchPinger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pinger-status' }),
      });
      const data = await res.json();
      setSignals(data.signals || []);
      setPromoted(data.promotedLast24h || 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => { fetchPinger(); }, [fetchPinger]);

  const sourceColors: Record<string, string> = {
    gemini_search: '#fbbf24',
    grok_social: '#3b82f6',
    pubmed_rss: '#10b981',
  };

  const sourceLabels: Record<string, string> = {
    gemini_search: 'Gemini Search',
    grok_social: 'Grok Social',
    pubmed_rss: 'PubMed RSS',
  };

  return (
    <Section
      title="Breaking News Pinger"
      defaultOpen={false}
      icon={
        <div className="admin-section-icon-box admin-section-icon-red">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
      }
      badge={
        <span className={promoted > 0 ? 'agents-badge-red' : 'agents-badge-green'}>
          {promoted > 0 ? `${promoted} promoted (24h)` : 'monitoring'}
        </span>
      }
    >
      <div className="agents-pinger-controls">
        <button onClick={fetchPinger} disabled={loading} className="agents-pinger-refresh">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <span className="agents-pinger-hint">
          Checks: :00 Gemini, :15 PubMed, :30 Grok, :45 PubMed
        </span>
      </div>

      {signals.length === 0 ? (
        <p className="agents-empty-muted">No signals detected recently. The pinger runs every 15 minutes.</p>
      ) : (
        <div className="agents-signal-list">
          {signals.slice(0, 10).map(s => (
            <div key={s.id} className={`agents-signal-card${s.promoted_to_queue ? ' promoted' : ''}`} style={{ borderLeft: `3px solid ${sourceColors[s.source] || '#5c5752'}` }}>
              <div className="admin-flex-between admin-flex-center">
                <span className="agents-signal-topic">{s.topic}</span>
                {s.promoted_to_queue && (
                  <span className="admin-status-badge admin-status-breaking">PROMOTED</span>
                )}
              </div>
              <div className="agents-signal-meta">
                <span style={{ color: sourceColors[s.source] || '#5c5752' }}>{sourceLabels[s.source] || s.source}</span>
                {' · '}
                <span>{s.urgency}</span>
                {s.why_breaking && <span> · {s.why_breaking.slice(0, 80)}</span>}
                {' · '}
                <span>{new Date(s.created_at).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── 0b. Cron Schedule Display ──────────────────────────────────────

function CronSchedule() {
  const cronJobs = [
    { name: 'Scout (Gemini)', schedule: 'Daily 6:00 AM UTC (0 6 * * *)', model: 'Gemini + Google Search', color: '#fbbf24' },
    { name: 'Scout (Sonnet)', schedule: 'Daily 2:00 PM UTC (0 14 * * *)', model: 'Sonnet + web search', color: '#f97316' },
    { name: 'Scout (Grok)', schedule: 'Daily 10:00 PM UTC (0 22 * * *)', model: 'Grok 4 (contrarian)', color: '#3b82f6' },
    { name: 'Pipeline Dispatch', schedule: 'Every minute (* * * * *)', model: 'SQL \u2192 pg_net \u2192 stage functions', color: '#16a34a' },
    { name: 'Featured Rotation', schedule: 'Every 6 hours (0 */6 * * *)', model: 'Score-weighted rotation', color: '#a78bfa' },
  ];

  return (
    <Section
      title="Cron Schedule"
      defaultOpen={false}
      icon={
        <div className="admin-section-icon-box admin-section-icon-indigo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
      }
      badge={<span className="agents-badge-green">5 active</span>}
    >
      <div className="agents-cron-grid">
        {cronJobs.map(job => (
          <div key={job.name} className="agents-cron-card" style={{ borderLeft: `3px solid ${job.color}` }}>
            <div className="agents-cron-name">{job.name}</div>
            <div className="agents-cron-schedule">{job.schedule}</div>
            <div className="agents-cron-model" style={{ color: job.color }}>{job.model}</div>
          </div>
        ))}
      </div>
      <p className="agents-hint-bottom">
        Managed via pg_cron in Supabase. Use Scout Now / Produce Now in Pipeline tab for manual triggers.
      </p>
    </Section>
  );
}

// ─── 1. Senior Editor Decision Log ─────────────────────────────────

function DecisionLog({ apiBase }: { apiBase: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => {
    fetchLogs();
    intervalRef.current = setInterval(fetchLogs, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchLogs]);

  const decisionsLogs = logs.filter(l =>
    l.research_data?._editorBrief || l.status === 'published' || l.status === 'failed'
  );

  return (
    <Section
      title="Senior Editor Decision Log"
      defaultOpen={true}
      icon={
        <div className="admin-section-icon-box admin-section-icon-amber">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </div>
      }
    >
      {loading ? (
        <div className="agents-loading-center">
          <div className="admin-spinner admin-spinner-lg agents-spinner-block" />
          <p className="admin-text-md admin-color-secondary">Loading decision log...</p>
        </div>
      ) : decisionsLogs.length === 0 ? (
        <p className="agents-empty">
          No editorial decisions yet. The daily pipeline will populate this log.
        </p>
      ) : (
        <div className="agents-decision-log">
          {decisionsLogs.map(log => (
            <DecisionCard key={log.id} log={log} />
          ))}
        </div>
      )}
    </Section>
  );
}

function DecisionCard({ log }: { log: LogEntry }) {
  const brief = log.research_data?._editorBrief;
  const qc = log.research_data?._qcResult;
  const isPublished = log.status === 'published';
  const isFailed = log.status === 'failed';
  const isKilled = brief?.decision === 'kill';

  return (
    <div className="agents-decision-card">
      <div className="agents-decision-layout">
        <div className="admin-flex-1">
          <div className="agents-decision-badges">
            {isPublished && <span className="admin-status-badge admin-status-published">Published</span>}
            {isKilled && <span className="admin-status-badge admin-status-failed">Killed</span>}
            {isFailed && !isKilled && <span className="admin-status-badge admin-status-failed">Failed</span>}
            {!isPublished && !isFailed && brief?.decision === 'approve' && <span className="admin-status-badge admin-status-in-progress">{log.status}</span>}
            {brief?.topicScore != null && (
              <span className="agents-score-badge" style={{ color: getScoreColor(brief.topicScore) }}>
                {brief.topicScore}/10
              </span>
            )}
          </div>
          <h4 className="agents-decision-title">
            {brief?.headline || log.title || log.topic || 'Untitled'}
          </h4>
          {brief?.angle && !isKilled && (
            <p className="agents-decision-angle">{brief.angle}</p>
          )}
          {isKilled && brief?.killReason && (
            <p className="agents-decision-error">
              {brief.killReason}
            </p>
          )}
          {isFailed && !isKilled && log.error && (
            <p className="agents-decision-error">
              {log.error}
            </p>
          )}
          {isPublished && qc && (
            <div className="agents-decision-qc">
              {qc.qualityScore != null && <span style={{ color: getScoreColor(qc.qualityScore), fontWeight: 600 }}>QC {qc.qualityScore}/10</span>}
              {qc.edits?.headlineChanged && <span className="admin-ml-md">Headline revised</span>}
              {qc.edits?.notes && <p className="admin-mt-xs admin-color-subtle admin-italic">{qc.edits.notes}</p>}
            </div>
          )}
        </div>
        <span className="agents-decision-time">
          {timeAgo(log.completed_at || log.created_at)}
        </span>
      </div>
    </div>
  );
}

// ─── 2. Editorial QC Agent ──────────────────────────────────────────

function EditorialQC({ apiBase, articleCount }: { apiBase: string; articleCount: number }) {
  const [severity, setSeverity] = useState<Severity>('medium');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [report, setReport] = useState<QCReport | null>(null);
  const [fixResults, setFixResults] = useState<FixResult[]>([]);
  const [dryRun, setDryRun] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [errored, setErrored] = useState(0);
  const [statusBadge, setStatusBadge] = useState<{ text: string; bg: string; color: string } | null>(null);
  const lastReportRef = useRef<QCReport | null>(null);

  const runQC = useCallback(async (mode: 'audit' | 'dryrun' | 'fix') => {
    setReport(null);
    setFixResults([]);
    setApplied(null);
    setLoading(true);
    setStatusBadge({ text: 'Running', bg: '#312e81', color: '#a5b4fc' });

    const labels = { audit: 'Running editorial audit...', dryrun: 'Running dry-run preview...', fix: 'Auditing and applying fixes...' };
    setLoadingText(labels[mode]);

    try {
      let body: Record<string, unknown>;
      if (mode === 'audit') body = { action: 'audit' };
      else if (mode === 'dryrun') body = { action: 'audit-and-fix', min_severity: severity, dry_run: true };
      else body = { action: 'audit-and-fix', min_severity: severity };

      const res = await fetch(`${apiBase}/editorial-qc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'QC failed');

      const qcReport: QCReport = data.report || data.full_report || {};
      lastReportRef.current = qcReport;
      setReport(qcReport);
      setFixResults(data.fix_results || []);
      setDryRun(!!data.dry_run);
      setApplied(data.applied ?? null);
      setSkipped(data.skipped || 0);
      setErrored(data.errored || 0);

      const grade = qcReport.summary?.overall_grade || '?';
      setStatusBadge({ text: grade, bg: gradeBg(grade), color: gradeColor(grade) });
    } catch (err) {
      setStatusBadge({ text: 'Error', bg: '#450a0a', color: '#f87171' });
      alert('QC error: ' + ((err as Error).message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [apiBase, severity]);

  const copyReport = useCallback(() => {
    if (lastReportRef.current) {
      navigator.clipboard.writeText(JSON.stringify(lastReportRef.current, null, 2));
    }
  }, []);

  const grade = report?.summary?.overall_grade || '';
  const summary = report?.summary;
  const issues = report?.issues || [];

  return (
    <Section
      title="Editorial QC Agent"
      icon={
        <div className="admin-section-icon-box admin-section-icon-indigo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
        </div>
      }
      badge={statusBadge ? (
        <span className="agents-qc-pill" style={{ background: statusBadge.bg, color: statusBadge.color }}>
          {statusBadge.text}
        </span>
      ) : undefined}
    >
      {/* Severity selector */}
      <div className="agents-severity-row">
        <label className="agents-severity-label">Min severity:</label>
        <div className="admin-flex admin-gap-sm">
          {(['high', 'medium', 'low'] as Severity[]).map(s => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={`agents-severity-btn${severity === s ? ' active' : ''}`}
            >
              {s === 'high' ? 'High only' : s === 'medium' ? 'Medium+' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="agents-action-row">
        <button className="agents-btn" disabled={loading} onClick={() => runQC('audit')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          Audit Only
        </button>
        <button className="agents-btn" disabled={loading} onClick={() => runQC('dryrun')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          Dry Run
        </button>
        <button
          className="agents-btn agents-btn-danger"
          disabled={loading}
          onClick={() => { if (confirm('This will audit all articles and auto-apply fixes. Continue?')) runQC('fix'); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Auto-Fix
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="agents-loading-center">
          <div className="admin-spinner admin-spinner-lg agents-spinner-block" />
          <p className="admin-text-md admin-color-secondary">{loadingText}</p>
          <p className="admin-text-sm admin-color-muted admin-mt-xs">
            Claude is analyzing {articleCount} articles holistically (30-60s)
          </p>
        </div>
      )}

      {/* Results */}
      {report && !loading && (
        <div className="agents-qc-results">
          <div className="agents-qc-header">
            <span className="agents-grade" style={{ color: gradeColor(grade) }}>{grade}</span>
            <div className="agents-qc-summary">
              <strong>{summary?.total_issues || 0} issues</strong> ({summary?.high || 0} high, {summary?.medium || 0} medium, {summary?.low || 0} low)
              {dryRun && <><br /><span className="agents-qc-dry-run">DRY RUN -- no changes applied. Use Auto-Fix to apply.</span></>}
              {applied != null && !dryRun && (
                <>
                  <br /><span className="agents-qc-applied">Applied {applied} fixes</span>
                  {skipped > 0 && <span className="agents-qc-skipped"> / {skipped} skipped</span>}
                  {errored > 0 && <span className="agents-qc-errored"> / {errored} errors</span>}
                </>
              )}
              {summary?.editorial_notes && <><br /><br /><em className="agents-qc-editorial">{summary.editorial_notes}</em></>}
            </div>
            <button className="agents-btn admin-flex-shrink-0" onClick={copyReport}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          </div>

          {/* Pattern warnings */}
          {summary?.patterns && summary.patterns.length > 0 && (
            <div className="admin-mb-lg">
              {summary.patterns.map((p, i) => (
                <div key={i} className="agents-pattern-row">
                  <span className="agents-pattern-icon">&#9888;</span>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          )}

          {/* Issues list */}
          <div className="agents-issues-list">
            {issues.length === 0 ? (
              <div className="agents-issues-empty">No issues found. Collection looks great.</div>
            ) : issues.map((issue, i) => {
              const color = issue.severity === 'high' ? '#f87171' : issue.severity === 'medium' ? '#fbbf24' : '#78716c';
              const fix = fixResults.find(r => r.slug === issue.slug && r.field === issue.field);
              return (
                <div key={i} className="agents-issue">
                  <div className="agents-issue-header">
                    <span className="agents-issue-severity" style={{ color }}>
                      {issue.severity}
                      {fix && (fix.status === 'applied' ? <span className="agents-qc-applied"> &#10003;</span> : fix.status === 'skipped' ? <span className="admin-color-subtle"> &#9678;</span> : <span className="agents-qc-errored"> &#10007;</span>)}
                    </span>
                    <span className="agents-issue-slug">{issue.slug}</span>
                    <span className="agents-issue-field-label">{issue.field}</span>
                  </div>
                  {issue.suggested && issue.suggested !== issue.current && issue.suggested !== 'Keep as is' ? (
                    <div className="agents-issue-diff">
                      <span className="agents-issue-strikethrough">{issue.current.length > 80 ? issue.current.slice(0, 80) + '...' : issue.current}</span>
                      <br /><span className="agents-issue-replacement">&rarr; {issue.suggested.length > 80 ? issue.suggested.slice(0, 80) + '...' : issue.suggested}</span>
                    </div>
                  ) : (
                    <div className="agents-issue-diff">
                      {issue.reason.length > 100 ? issue.reason.slice(0, 100) + '...' : issue.reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── 3. Illustration Agent ──────────────────────────────────────────

function IllustrationAgent({ apiBase }: { apiBase: string }) {
  const [articles, setArticles] = useState<Array<{ slug: string; title: string; hero_image: string | null }>>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiBase}/articles-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list' }),
        });
        if (res.ok) {
          const data = await res.json();
          setArticles(Array.isArray(data) ? data.map((a: Record<string, unknown>) => ({ slug: a.slug as string, title: a.title as string, hero_image: (a.hero_image as string) || null })) : []);
        }
      } catch { /* silent */ }
    })();
  }, [apiBase]);

  const withoutIllustration = articles.filter(a => !a.hero_image);
  const withIllustration = articles.filter(a => a.hero_image);

  const runBatch = useCallback(async (force: boolean) => {
    setResult(null);
    setLoading(true);
    setProgress(0);
    setLoadingText(force ? 'Regenerating all illustrations...' : 'Generating missing illustrations...');

    try {
      const res = await fetch(`${apiBase}/generate-illustration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch', force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setProgress(100);
      setResult(`${data.generated} illustrations generated` + (data.failed > 0 ? `, ${data.failed} failed` : ''));
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('timeout') || msg.includes('Failed to fetch')) {
        setResult('Batch timed out -- use single-article selector above.');
      } else {
        alert('Illustration error: ' + msg);
      }
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const runSingle = useCallback(async () => {
    if (!selectedSlug) { alert('Select an article first'); return; }
    setResult(null);
    setLoading(true);
    setProgress(0);
    setLoadingText(`Generating illustration for "${selectedSlug}"...`);

    try {
      const res = await fetch(`${apiBase}/generate-illustration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', slug: selectedSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setProgress(100);
      const link = data.imageUrl ? ` <a href="${data.imageUrl}" target="_blank" style="color:#6ee7b7;text-decoration:underline">View</a>` : '';
      setResult(`Illustration generated for "${selectedSlug}"${link}`);
    } catch (err) {
      alert('Generation error: ' + ((err as Error).message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [apiBase, selectedSlug]);

  return (
    <Section
      title="Illustration Agent"
      icon={
        <div className="admin-section-icon-box admin-section-icon-emerald">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </div>
      }
      badge={
        <span className={withoutIllustration.length > 0 ? 'agents-badge-yellow' : 'agents-badge-green'}>
          {withIllustration.length}/{articles.length} illustrated
        </span>
      }
    >
      {/* Single article selector */}
      <div className="agents-illust-selector">
        <label className="agents-illust-label">Single article:</label>
        <select
          value={selectedSlug}
          onChange={e => setSelectedSlug(e.target.value)}
          className="agents-illust-select"
        >
          <option value="">Select article...</option>
          {articles.map(a => (
            <option key={a.slug} value={a.slug}>{a.hero_image ? '\u25C9' : '\u25CB'} {a.title}</option>
          ))}
        </select>
        <button className="agents-btn admin-nowrap" disabled={loading || !selectedSlug} onClick={runSingle}>
          Generate
        </button>
      </div>

      {/* Batch buttons */}
      <div className="agents-illust-batch">
        <button
          className="agents-btn agents-btn-primary"
          disabled={loading || withoutIllustration.length === 0}
          onClick={() => runBatch(false)}
        >
          Generate Missing ({withoutIllustration.length})
        </button>
        <button
          className="agents-btn agents-btn-danger"
          disabled={loading}
          onClick={() => { if (confirm('Regenerate ALL illustrations? This replaces existing ones and costs ~$0.04/article.')) runBatch(true); }}
        >
          Regenerate All
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="agents-loading-single">
          <div className="admin-spinner admin-spinner-lg agents-spinner-block" />
          <p className="admin-text-base admin-color-secondary">{loadingText}</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div>
          <p className="admin-text-base agents-result-line-height admin-color-secondary" dangerouslySetInnerHTML={{ __html: result.startsWith('Batch') ? `<span style="color:#fbbf24">${result}</span>` : `<span style="color:#4ade80">&#10003; ${result}</span>` }} />
          <div className="agents-progress-bar">
            <div className="agents-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── 4. Database Sync ───────────────────────────────────────────────

function DatabaseSync({ apiBase, initialCount }: { apiBase: string; initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${apiBase}/articles-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() },
        body: JSON.stringify({ action: 'list' }),
      });
      const data = await res.json();
      const n = Array.isArray(data) ? data.length : 0;
      setCount(n);
      setResult(`${n} articles in database`);
    } catch (err) {
      setResult(`Failed: ${(err as Error).message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const backfillCosts = useCallback(async () => {
    if (!confirm('Estimate costs for all articles with missing cost data? This uses stage-based estimates.')) return;
    setBackfilling(true);
    setResult(null);
    try {
      const res = await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() },
        body: JSON.stringify({ action: 'backfill-costs' }),
      });
      const data = await res.json();
      setResult(data.message || `Updated ${data.updated} logs, estimated $${data.totalEstimated?.toFixed(2) || '?'}`);
    } catch (err) {
      setResult(`Backfill failed: ${(err as Error).message || 'Unknown error'}`);
    } finally {
      setBackfilling(false);
    }
  }, [apiBase]);

  const backfillCitations = useCallback(async () => {
    if (!confirm('Re-verify citations for ALL published articles using PubMed + CrossRef + Semantic Scholar? This may take several minutes.')) return;
    setVerifying(true);
    setResult(null);
    try {
      const res = await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() },
        body: JSON.stringify({ action: 'backfill-citations' }),
      });
      const data = await res.json();
      setResult(data.message || `Verified: ${data.totalVerified}, Failed: ${data.totalFailed}, Skipped: ${data.totalSkipped}`);
    } catch (err) {
      setResult(`Citation verification failed: ${(err as Error).message || 'Unknown error'}`);
    } finally {
      setVerifying(false);
    }
  }, [apiBase]);

  const rotateFeatured = useCallback(async () => {
    setRotating(true);
    setResult(null);
    try {
      const res = await fetch(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() },
        body: JSON.stringify({ action: 'rotate-featured' }),
      });
      const data = await res.json();
      setResult(data.message || `Featured rotated to: ${data.newFeatured || 'none'}`);
    } catch (err) {
      setResult(`Rotation failed: ${(err as Error).message || 'Unknown error'}`);
    } finally {
      setRotating(false);
    }
  }, [apiBase]);

  return (
    <Section
      title="Database & Maintenance"
      icon={
        <div className="admin-section-icon-box admin-section-icon-amber">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
        </div>
      }
      badge={<span className="agents-badge-muted">{count} articles</span>}
    >
      <div className="agents-db-buttons">
        <button className="agents-btn agents-btn-primary" disabled={loading} onClick={refresh}>
          {loading ? 'Syncing...' : 'Refresh DB'}
        </button>
        <button className="agents-btn" disabled={backfilling} onClick={backfillCosts}>
          {backfilling ? 'Estimating...' : 'Backfill Costs'}
        </button>
        <button className="agents-btn" disabled={rotating} onClick={rotateFeatured}>
          {rotating ? 'Rotating...' : 'Rotate Featured'}
        </button>
        <button className="agents-btn" disabled={verifying} onClick={backfillCitations} style={{ borderColor: verifying ? '#a78bfa' : undefined }}>
          {verifying ? 'Verifying citations...' : 'Re-verify Citations'}
        </button>
      </div>
      <p className="agents-db-help">
        Re-verify Citations: re-check all published articles against PubMed, CrossRef, and Semantic Scholar (takes a few minutes).
      </p>
      {result && (
        <p className={`agents-result ${result.includes('Failed') || result.includes('failed') ? 'agents-result-error' : 'agents-result-success'}`}>
          {result.includes('Failed') || result.includes('failed') ? result : `\u2713 ${result}`}
        </p>
      )}
    </Section>
  );
}
