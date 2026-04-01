import { useState, useEffect, useCallback, useRef } from 'react';
import { getAdminToken, timeAgo, getScoreColor, fetchWithTimeout } from './types';
import type { EditorBrief, QCResult } from './types';
import { useConfirm } from './ConfirmModal';

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
  if (grade.startsWith('A')) return 'var(--admin-green-light)';
  if (grade.startsWith('B')) return 'var(--admin-yellow-light)';
  return 'var(--admin-red-light)';
}

function gradeBg(grade: string): string {
  if (grade.startsWith('A')) return 'rgba(34, 197, 94, 0.1)';
  if (grade.startsWith('B')) return 'rgba(245, 158, 11, 0.1)';
  return 'rgba(239, 68, 68, 0.1)';
}

// ─── Panel (Bloomberg-style block) ─────────────────────────────────

function Panel({ title, badge, children, maxHeight }: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: string;
}) {
  return (
    <div className="agents-panel-block">
      <div className="agents-panel-header">
        <span className="agents-panel-title">{title}</span>
        {badge}
      </div>
      <div className="agents-panel-content" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function AgentsPanel({ apiBase, initialArticleCount }: Props) {
  return (
    <div className="agents-layout">
      {/* Row 1: Compact status strip */}
      <div className="agents-status-strip">
        <CronSchedule />
        <PingerActivity apiBase={apiBase} />
        <DatabaseSync apiBase={apiBase} initialCount={initialArticleCount} />
      </div>

      {/* Row 2: Decision Log (full width) */}
      <DecisionLog apiBase={apiBase} />

      {/* Row 3: QC + Reader Questions side by side */}
      <div className="agents-tools-row">
        <EditorialQC apiBase={apiBase} articleCount={initialArticleCount} />
        <ReaderQuestions apiBase={apiBase} />
      </div>

      {/* Row 4: Illustration + Narration side by side */}
      <div className="agents-tools-row">
        <IllustrationAgent apiBase={apiBase} />
        <NarrationAgent apiBase={apiBase} />
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
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
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
      await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getAdminToken() },
        body: JSON.stringify({ action: 'queue-topic', topic, source: 'reader_request', priority: 5, notes: `Asked by multiple users in alumi Health AI assistant` }),
      });
      setQueued(prev => new Set(prev).add(idx));
    } catch { /* silent */ }
    finally { setQueueingIdx(null); }
  }, [apiBase]);

  return (
    <Panel
      title="Reader Questions"
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
            <div key={i} className="agents-question-card" style={{ borderLeft: `3px solid ${q.uniqueUsers >= 5 ? 'var(--admin-accent)' : q.uniqueUsers >= 3 ? 'var(--admin-yellow)' : 'rgba(255,255,255,0.08)'}` }}>
              <div className="admin-flex-between-top admin-gap-md">
                <div className="admin-flex-1">
                  <div className="agents-question-topic">
                    {q.topic.slice(0, 120)}{q.topic.length > 120 ? '...' : ''}
                  </div>
                  <div className="agents-question-meta">
                    <span style={{ color: q.uniqueUsers >= 5 ? 'var(--admin-red-light)' : q.uniqueUsers >= 3 ? 'var(--admin-yellow-light)' : 'var(--admin-text-2)', fontWeight: 600 }}>{q.uniqueUsers} users</span>
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
    </Panel>
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
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
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

  return (
    <div className="agents-strip-cell" style={{ flex: '0 1 auto' }}>
      <span className="agents-strip-label">Pinger</span>
      <span className={`agents-pinger-dot ${promoted > 0 ? 'active' : ''}`} />
      <span style={{ fontSize: '0.6875rem', color: promoted > 0 ? 'var(--admin-green)' : 'var(--admin-text-3)' }}>
        {promoted > 0 ? `${promoted} promoted` : 'idle'}
      </span>
      {signals.length > 0 && (
        <span style={{ fontSize: '0.625rem', color: 'var(--admin-text-4)' }}>{signals.length} signals</span>
      )}
      <button onClick={fetchPinger} disabled={loading} className="agents-strip-btn">
        {loading ? '...' : '\u21BB'}
      </button>
    </div>
  );
}

// ─── 0b. Cron Schedule Display ──────────────────────────────────────

function CronSchedule() {
  const jobs = [
    { name: 'Scout', time: '06:00', color: 'var(--admin-yellow-light)' },
    { name: 'Scout', time: '14:00', color: 'var(--admin-yellow)' },
    { name: 'Scout', time: '22:00', color: 'var(--admin-blue)' },
    { name: 'Dispatch', time: '*/5m', color: 'var(--admin-green)' },
    { name: 'Featured', time: '*/6h', color: 'var(--admin-purple)' },
  ];
  return (
    <div className="agents-strip-cell" style={{ flex: '1 1 auto' }}>
      <span className="agents-strip-label">Cron</span>
      {jobs.map((j, i) => (
        <span key={i} className="agents-cron-chip" style={{ borderColor: j.color }}>
          <span style={{ color: j.color }}>{j.name}</span>
          <span className="agents-cron-time">{j.time}</span>
        </span>
      ))}
    </div>
  );
}

// ─── 1. Senior Editor Decision Log ─────────────────────────────────

function DecisionLog({ apiBase }: { apiBase: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
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
    <Panel title="Decision Log">
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
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          <div className="agents-decision-table-header">
            <span>Status</span>
            <span>Score</span>
            <span>Headline</span>
            <span>QC</span>
            <span>Time</span>
          </div>
          {decisionsLogs.map(log => (
            <DecisionRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function DecisionRow({ log }: { log: LogEntry }) {
  const brief = log.research_data?._editorBrief;
  const qc = log.research_data?._qcResult;
  const isPublished = log.status === 'published';
  const isFailed = log.status === 'failed';
  const isKilled = brief?.decision === 'kill';

  return (
    <div className="agents-decision-row">
      <span>
        {isPublished && <span className="admin-status-badge admin-status-published" style={{ fontSize: '0.5625rem', padding: '1px 5px' }}>Published</span>}
        {isKilled && <span className="admin-status-badge admin-status-failed" style={{ fontSize: '0.5625rem', padding: '1px 5px' }}>Killed</span>}
        {isFailed && !isKilled && <span className="admin-status-badge admin-status-failed" style={{ fontSize: '0.5625rem', padding: '1px 5px' }}>Failed</span>}
        {!isPublished && !isFailed && <span style={{ fontSize: '0.625rem', color: 'var(--admin-text-3)' }}>{log.status}</span>}
      </span>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: brief?.topicScore != null ? getScoreColor(brief.topicScore) : 'var(--admin-text-4)', fontVariantNumeric: 'tabular-nums' }}>
        {brief?.topicScore != null ? `${brief.topicScore}/10` : '\u2014'}
      </span>
      <span style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {brief?.headline || log.title || log.topic || 'Untitled'}
      </span>
      <span style={{ fontSize: '0.6875rem', color: qc?.qualityScore != null ? getScoreColor(qc.qualityScore) : 'var(--admin-text-4)', fontVariantNumeric: 'tabular-nums' }}>
        {qc?.qualityScore != null ? `${qc.qualityScore}/10` : '\u2014'}
      </span>
      <span style={{ fontSize: '0.625rem', color: 'var(--admin-text-4)', whiteSpace: 'nowrap' }}>
        {timeAgo(log.completed_at || log.created_at)}
      </span>
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
  const { ask, ConfirmDialog } = useConfirm();

  const runQC = useCallback(async (mode: 'audit' | 'dryrun' | 'fix') => {
    setReport(null);
    setFixResults([]);
    setApplied(null);
    setLoading(true);
    setStatusBadge({ text: 'Running', bg: 'rgba(167, 139, 250, 0.15)', color: 'var(--admin-purple-light)' });

    const labels = { audit: 'Running editorial audit...', dryrun: 'Running dry-run preview...', fix: 'Auditing and applying fixes...' };
    setLoadingText(labels[mode]);

    try {
      let body: Record<string, unknown>;
      if (mode === 'audit') body = { action: 'audit' };
      else if (mode === 'dryrun') body = { action: 'audit-and-fix', min_severity: severity, dry_run: true };
      else body = { action: 'audit-and-fix', min_severity: severity };

      const res = await fetchWithTimeout(`${apiBase}/editorial-qc`, {
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
      setStatusBadge({ text: 'Error', bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--admin-red-light)' });
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
    <Panel
      title="Editorial QC"
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
          onClick={async () => { if (await ask({ title: 'Auto-fix all articles', message: 'This will audit all articles and auto-apply fixes. Continue?', confirmLabel: 'Auto-Fix', danger: true })) runQC('fix'); }}
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
              const color = issue.severity === 'high' ? 'var(--admin-red-light)' : issue.severity === 'medium' ? 'var(--admin-yellow-light)' : 'var(--admin-text-3)';
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
      {ConfirmDialog}
    </Panel>
  );
}

// ─── 3. Illustration Agent ──────────────────────────────────────────

function IllustrationAgent({ apiBase }: { apiBase: string }) {
  const [articles, setArticles] = useState<Array<{ slug: string; title: string; hero_image: string | null }>>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const { ask, ConfirmDialog: IllustrationConfirm } = useConfirm();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithTimeout(`${apiBase}/articles-api`, {
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
    setResultUrl(null);
    setLoading(true);
    setProgress(0);
    setLoadingText(force ? 'Regenerating all illustrations...' : 'Generating missing illustrations...');

    try {
      const res = await fetchWithTimeout(`${apiBase}/generate-illustration`, {
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
      const res = await fetchWithTimeout(`${apiBase}/generate-illustration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', slug: selectedSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setProgress(100);
      setResultUrl(data.imageUrl || null);
      setResult(`Illustration generated for "${selectedSlug}"`);
    } catch (err) {
      alert('Generation error: ' + ((err as Error).message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [apiBase, selectedSlug]);

  return (
    <Panel
      title="Illustrations"
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
          onClick={async () => { if (await ask({ title: 'Regenerate all illustrations', message: 'Regenerate ALL illustrations? This replaces existing ones and costs ~$0.04/article.', confirmLabel: 'Regenerate All', danger: true })) runBatch(true); }}
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
          <p className="admin-text-base agents-result-line-height admin-color-secondary">
            <span style={{ color: result.startsWith('Batch') ? 'var(--admin-yellow-light)' : 'var(--admin-green-light)' }}>
              {result.startsWith('Batch') ? '' : '\u2713 '}{result}
            </span>
            {resultUrl && (
              <> <a href={resultUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--admin-green-light)', textDecoration: 'underline' }}>View</a></>
            )}
          </p>
          <div className="agents-progress-bar">
            <div className="agents-progress-fill" style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        </div>
      )}
      {IllustrationConfirm}
    </Panel>
  );
}

// ─── 3b. Narration Agent ──────────────────────────────────────────────

// Voice setting presets for ElevenLabs narrations
const VOICE_PRESETS: Record<string, { label: string; desc: string; settings: { stability: number; similarity_boost: number; style: number; speed: number } }> = {
  default:   { label: 'Default',   desc: 'Current production settings', settings: { stability: 0.3, similarity_boost: 0.6, style: 0.4, speed: 1.0 } },
  anchor:    { label: 'Anchor',    desc: 'Steady, authoritative — NPR evening news', settings: { stability: 0.65, similarity_boost: 0.7, style: 0.2, speed: 0.95 } },
  podcast:   { label: 'Podcast',   desc: 'Warm, conversational — like talking to a friend', settings: { stability: 0.35, similarity_boost: 0.55, style: 0.5, speed: 1.0 } },
  dramatic:  { label: 'Dramatic',  desc: 'Expressive, cinematic — documentary narrator', settings: { stability: 0.2, similarity_boost: 0.5, style: 0.7, speed: 0.9 } },
  clinical:  { label: 'Clinical',  desc: 'Measured, precise — medical journal review', settings: { stability: 0.75, similarity_boost: 0.8, style: 0.1, speed: 0.95 } },
  storyteller: { label: 'Storyteller', desc: 'Engaging, varied pacing — longform narrative', settings: { stability: 0.25, similarity_boost: 0.6, style: 0.6, speed: 0.95 } },
};

function NarrationAgent({ apiBase }: { apiBase: string }) {
  const [articles, setArticles] = useState<Array<{ slug: string; title: string; narration_url: string | null; status: string }>>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [preset, setPreset] = useState('default');
  const [voiceSettings, setVoiceSettings] = useState(VOICE_PRESETS.default.settings);
  const [showSettings, setShowSettings] = useState(false);
  const { ask, ConfirmDialog: NarrationConfirm } = useConfirm();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithTimeout(`${apiBase}/articles-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list' }),
        });
        if (res.ok) {
          const data = await res.json();
          setArticles(Array.isArray(data) ? data.map((a: Record<string, unknown>) => ({
            slug: a.slug as string,
            title: a.title as string,
            narration_url: (a.narration_url as string) || null,
            status: (a.status as string) || 'draft',
          })) : []);
        }
      } catch { /* silent */ }
    })();
  }, [apiBase]);

  const published = articles.filter(a => a.status === 'published');
  const withoutNarration = published.filter(a => !a.narration_url);
  const withNarration = published.filter(a => a.narration_url);

  const runBatch = useCallback(async (force: boolean) => {
    setResult(null);
    setLoading(true);
    setLoadingText(force ? 'Regenerating all narrations...' : 'Generating missing narrations...');

    try {
      const res = await fetchWithTimeout(`${apiBase}/generate-narration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch', force, voiceSettings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setResult(data.dispatched != null
        ? `${data.dispatched} narrations dispatched — generating in background. ${data.message || ''}`
        : `${data.generated} narrations generated` + (data.failed > 0 ? `, ${data.failed} failed` : ''));
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('timeout') || msg.includes('Failed to fetch')) {
        setResult('Batch timed out -- use single-article selector above.');
      } else {
        setResult('Error: ' + msg);
      }
    } finally {
      setLoading(false);
    }
  }, [apiBase, voiceSettings]);

  const runSingle = useCallback(async () => {
    if (!selectedSlug) return;
    const selectedTitle = articles.find(a => a.slug === selectedSlug)?.title || selectedSlug;
    setResult(null);
    setLoading(true);
    setLoadingText(`Generating narration for "${selectedTitle}"...`);

    try {
      const res = await fetchWithTimeout(`${apiBase}/generate-narration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', slug: selectedSlug, voiceSettings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setResult(data.skipped
        ? `Narration already exists for "${selectedTitle}"`
        : `Narration generated for "${selectedTitle}" (${data.characters} chars)`
      );
    } catch (err) {
      setResult('Error: ' + ((err as Error).message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [apiBase, selectedSlug, voiceSettings]);

  return (
    <Panel
      title="Narrations"
      badge={
        <span className={withoutNarration.length > 0 ? 'agents-badge-yellow' : 'agents-badge-green'}>
          {withNarration.length}/{published.length} narrated
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
          {published.map(a => (
            <option key={a.slug} value={a.slug}>{a.narration_url ? '\uD83D\uDD0A' : '\uD83D\uDD07'} {a.title}</option>
          ))}
        </select>
        <button className="agents-btn admin-nowrap" disabled={loading || !selectedSlug} onClick={runSingle}>
          Generate
        </button>
      </div>

      {/* Preview current narration */}
      {selectedSlug && (() => {
        const selected = published.find(a => a.slug === selectedSlug);
        if (!selected?.narration_url) return (
          <p style={{ fontSize: 11, color: 'var(--admin-text-secondary)', marginTop: 8, fontStyle: 'italic' }}>
            No narration yet for this article.
          </p>
        );
        return (
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--admin-text-secondary)', display: 'block', marginBottom: 4 }}>
              Current narration:
            </label>
            <audio
              controls
              src={selected.narration_url}
              style={{ width: '100%', height: 36, borderRadius: 8 }}
              preload="none"
            />
          </div>
        );
      })()}

      {/* Voice Settings */}
      <div style={{ marginTop: 12 }}>
        <button
          className="agents-btn"
          onClick={() => setShowSettings(!showSettings)}
          style={{ fontSize: 12, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span style={{ transform: showSettings ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s', display: 'inline-block' }}>&#9654;</span>
          Voice Settings
          <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400 }}>({VOICE_PRESETS[preset]?.label})</span>
        </button>
        {showSettings && (
          <div style={{ marginTop: 10, padding: 14, borderRadius: 10, background: 'var(--admin-surface)', border: '1px solid var(--admin-border)' }}>
            {/* Presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {Object.entries(VOICE_PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  className="agents-btn"
                  onClick={() => { setPreset(key); setVoiceSettings(p.settings); }}
                  style={{
                    fontSize: 11,
                    padding: '5px 10px',
                    background: preset === key ? 'var(--admin-accent)' : 'var(--admin-surface-hover)',
                    color: preset === key ? '#fff' : 'var(--admin-text-secondary)',
                    borderRadius: 6,
                    border: preset === key ? '1px solid var(--admin-accent)' : '1px solid var(--admin-border)',
                  }}
                  title={p.desc}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--admin-text-secondary)', marginBottom: 12, fontStyle: 'italic' }}>
              {VOICE_PRESETS[preset]?.desc}
            </p>

            {/* Sliders — ElevenLabs API parameter names */}
            {([
              { key: 'stability', label: 'Stability', desc: 'Low = broader emotional range. High = consistent, monotone' },
              { key: 'similarity_boost', label: 'Similarity Boost', desc: 'Low = more variation. High = closer to original voice' },
              { key: 'style', label: 'Style Exaggeration', desc: 'Low = neutral delivery. High = amplified speaker style' },
              { key: 'speed', label: 'Speed', desc: '0.7 = deliberate. 1.0 = natural. 1.2 = brisk' },
            ] as const).map(({ key, label, desc }) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <label style={{ fontSize: 11, color: 'var(--admin-text-secondary)' }}>{label}</label>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--admin-text-primary)', minWidth: 32, textAlign: 'right' }}>
                    {voiceSettings[key].toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={key === 'speed' ? 0.7 : 0}
                  max={key === 'speed' ? 1.2 : 1}
                  step={0.05}
                  value={voiceSettings[key]}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setVoiceSettings(prev => ({ ...prev, [key]: val }));
                    setPreset('custom');
                  }}
                  style={{ width: '100%', accentColor: 'var(--admin-accent)' }}
                  title={desc}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--admin-text-secondary)', opacity: 0.5, marginTop: 1 }}>
                  <span>{key === 'speed' ? '0.70' : '0.00'}</span>
                  <span style={{ fontStyle: 'italic' }}>{desc}</span>
                  <span>{key === 'speed' ? '1.20' : '1.00'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Batch buttons */}
      <div className="agents-illust-batch">
        <button
          className="agents-btn agents-btn-primary"
          disabled={loading || withoutNarration.length === 0}
          onClick={() => runBatch(false)}
        >
          Generate Missing ({withoutNarration.length})
        </button>
        <button
          className="agents-btn agents-btn-danger"
          disabled={loading}
          onClick={async () => { if (await ask({ title: 'Regenerate all narrations', message: 'Regenerate ALL narrations? This replaces existing ones and uses ElevenLabs credits.', confirmLabel: 'Regenerate All', danger: true })) runBatch(true); }}
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
        <p className="admin-text-base agents-result-line-height admin-color-secondary">
          <span style={{ color: result.startsWith('Error') || result.startsWith('Batch') ? 'var(--admin-yellow-light)' : 'var(--admin-green-light)' }}>
            {result.startsWith('Error') || result.startsWith('Batch') ? '' : '\u2713 '}{result}
          </span>
        </p>
      )}
      {NarrationConfirm}
    </Panel>
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
  const { ask, ConfirmDialog: DbConfirm } = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetchWithTimeout(`${apiBase}/articles-api`, {
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
    if (!await ask({ title: 'Backfill costs', message: 'Estimate costs for all articles with missing cost data? This uses stage-based estimates.', confirmLabel: 'Backfill' })) return;
    setBackfilling(true);
    setResult(null);
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
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
    if (!await ask({ title: 'Re-verify citations', message: 'Re-verify citations for ALL published articles using PubMed + CrossRef + Semantic Scholar? This may take several minutes.', confirmLabel: 'Verify All' })) return;
    setVerifying(true);
    setResult(null);
    try {
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
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
      const res = await fetchWithTimeout(`${apiBase}/pipeline-admin`, {
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
    <div className="agents-strip-cell" style={{ flex: '0 1 auto' }}>
      <span className="agents-strip-label">DB</span>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--admin-text-2)' }}>{count}</span>
      <button className="agents-strip-btn" disabled={loading} onClick={refresh}>Sync</button>
      <button className="agents-strip-btn" disabled={backfilling} onClick={backfillCosts}>Costs</button>
      <button className="agents-strip-btn" disabled={rotating} onClick={rotateFeatured}>Rotate</button>
      <button className="agents-strip-btn" disabled={verifying} onClick={backfillCitations}>Citations</button>
      {result && <span className="agents-strip-result">{result.includes('Failed') ? '\u2717' : '\u2713'} {result.slice(0, 40)}</span>}
      {DbConfirm}
    </div>
  );
}
