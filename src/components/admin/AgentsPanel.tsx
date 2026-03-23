import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────

interface Props {
  apiBase: string;
  initialArticleCount: number;
}

interface EditorBrief {
  decision: 'approve' | 'kill';
  topicScore: number;
  headline: string;
  slug: string;
  description: string;
  angle: string;
  brief?: { tone?: string; openWith?: string; emphasize?: string[]; avoid?: string[]; closingDirection?: string };
  killReason?: string | null;
}

interface QCResult {
  decision: 'publish' | 'revise' | 'kill';
  qualityScore: number;
  headline: string;
  description: string;
  edits?: { headlineChanged?: boolean; descriptionChanged?: boolean; notes?: string };
  killReason?: string | null;
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

function getAdminToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)admin_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function timeAgo(d: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#4ade80';
  if (grade.startsWith('B')) return '#fbbf24';
  return '#f87171';
}

function gradeBg(grade: string): string {
  if (grade.startsWith('A')) return '#052e16';
  if (grade.startsWith('B')) return '#422006';
  return '#450a0a';
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
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          {icon}
          <span>{title}</span>
        </span>
        {badge}
        <span style={{ fontSize: '1rem', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>
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
    <div className="agents-panel">
      <CronSchedule />
      <DecisionLog apiBase={apiBase} />
      <EditorialQC apiBase={apiBase} articleCount={initialArticleCount} />
      <IllustrationAgent apiBase={apiBase} />
      <DatabaseSync apiBase={apiBase} initialCount={initialArticleCount} />
    </div>
  );
}

// ─── 0. Cron Schedule Display ───────────────────────────────────────

function CronSchedule() {
  const cronJobs = [
    { name: 'Scout (Gemini)', schedule: 'Daily 6:00 AM UTC', model: 'gemini-2.5-flash', color: '#fbbf24' },
    { name: 'Scout (Sonnet)', schedule: 'Daily 2:00 PM UTC', model: 'claude-sonnet-4-6', color: '#f97316' },
    { name: 'Scout (Grok)', schedule: 'Daily 10:00 PM UTC', model: 'grok-3', color: '#3b82f6' },
    { name: 'Article Produce', schedule: 'Every hour (0 * * * *)', model: 'Multi-model', color: '#16a34a' },
    { name: 'Featured Rotation', schedule: 'Every 6 hours (0 */6 * * *)', model: 'DB-only', color: '#a78bfa' },
  ];

  return (
    <Section
      title="Cron Schedule"
      defaultOpen={false}
      icon={
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #1e1b4b, #4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
      }
      badge={<span style={{ fontSize: '0.6875rem', color: '#4ade80', fontWeight: 500 }}>5 active</span>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
        {cronJobs.map(job => (
          <div key={job.name} style={{ padding: '0.5rem 0.75rem', background: '#1c1917', borderRadius: '0.375rem', borderLeft: `3px solid ${job.color}` }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e7e6e3', marginBottom: '0.125rem' }}>{job.name}</div>
            <div style={{ fontSize: '0.6875rem', color: '#78716c' }}>{job.schedule}</div>
            <div style={{ fontSize: '0.625rem', color: job.color, marginTop: '0.125rem' }}>{job.model}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '0.6875rem', color: '#57534e', marginTop: '0.75rem' }}>
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
      const res = await fetch(`${apiBase}/daily-article-agent`, {
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
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #78350f, #b45309)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
          <div className="admin-spinner admin-spinner-lg" style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ fontSize: '0.8125rem', color: '#a8a29e' }}>Loading decision log...</p>
        </div>
      ) : decisionsLogs.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: '#78716c', textAlign: 'center', padding: '1.5rem' }}>
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            {isPublished && <span style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.125rem 0.375rem', background: '#052e16', color: '#4ade80', borderRadius: '0.25rem', fontWeight: 600 }}>Published</span>}
            {isKilled && <span style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.125rem 0.375rem', background: '#450a0a', color: '#f87171', borderRadius: '0.25rem', fontWeight: 600 }}>Killed</span>}
            {isFailed && !isKilled && <span style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.125rem 0.375rem', background: '#450a0a', color: '#f87171', borderRadius: '0.25rem', fontWeight: 600 }}>Failed</span>}
            {!isPublished && !isFailed && brief?.decision === 'approve' && <span style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.125rem 0.375rem', background: '#1e3a5f', color: '#93c5fd', borderRadius: '0.25rem', fontWeight: 600 }}>{log.status}</span>}
            {brief?.topicScore != null && (
              <span style={{ fontSize: '0.625rem', color: brief.topicScore >= 7 ? '#4ade80' : brief.topicScore >= 5 ? '#fbbf24' : '#f87171', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {brief.topicScore}/10
              </span>
            )}
          </div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', lineHeight: 1.3 }}>
            {brief?.headline || log.title || log.topic || 'Untitled'}
          </h4>
          {brief?.angle && !isKilled && (
            <p style={{ fontSize: '0.6875rem', color: '#a8a29e', lineHeight: 1.5, marginBottom: '0.25rem' }}>{brief.angle}</p>
          )}
          {isKilled && brief?.killReason && (
            <p style={{ fontSize: '0.6875rem', color: '#f87171', lineHeight: 1.5, marginBottom: '0.25rem' }}>
              {brief.killReason}
            </p>
          )}
          {isFailed && !isKilled && log.error && (
            <p style={{ fontSize: '0.6875rem', color: '#f87171', lineHeight: 1.5, marginBottom: '0.25rem' }}>
              {log.error}
            </p>
          )}
          {isPublished && qc && (
            <div style={{ fontSize: '0.6875rem', color: '#a8a29e', lineHeight: 1.5 }}>
              {qc.qualityScore != null && <span style={{ color: qc.qualityScore >= 7 ? '#4ade80' : '#fbbf24', fontWeight: 600 }}>QC {qc.qualityScore}/10</span>}
              {qc.edits?.headlineChanged && <span style={{ marginLeft: '0.5rem' }}>Headline revised</span>}
              {qc.edits?.notes && <p style={{ marginTop: '0.125rem', color: '#78716c', fontStyle: 'italic' }}>{qc.edits.notes}</p>}
            </div>
          )}
        </div>
        <span style={{ fontSize: '0.625rem', color: '#57534e', whiteSpace: 'nowrap', flexShrink: 0 }}>
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
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #312e81, #4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
        </div>
      }
      badge={statusBadge ? (
        <span style={{ padding: '0.25rem 0.75rem', borderRadius: 999, fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: statusBadge.bg, color: statusBadge.color }}>
          {statusBadge.text}
        </span>
      ) : undefined}
    >
      {/* Severity selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.6875rem', color: '#78716c', whiteSpace: 'nowrap' }}>Min severity:</label>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {(['high', 'medium', 'low'] as Severity[]).map(s => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              style={{
                padding: '0.25rem 0.625rem', borderRadius: '1rem', fontSize: '0.6875rem', fontWeight: 500,
                border: `1px solid ${severity === s ? '#4338ca' : '#44403c'}`,
                background: severity === s ? '#312e81' : 'transparent',
                color: severity === s ? '#a5b4fc' : '#a8a29e',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {s === 'high' ? 'High only' : s === 'medium' ? 'Medium+' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
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
        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
          <div className="admin-spinner admin-spinner-lg" style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ fontSize: '0.8125rem', color: '#a8a29e' }}>{loadingText}</p>
          <p style={{ fontSize: '0.6875rem', color: '#57534e', marginTop: '0.25rem' }}>
            Claude is analyzing {articleCount} articles holistically (30-60s)
          </p>
        </div>
      )}

      {/* Results */}
      {report && !loading && (
        <div className="agents-qc-results">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <span className="agents-grade" style={{ color: gradeColor(grade) }}>{grade}</span>
            <div style={{ flex: 1, fontSize: '0.75rem', color: '#a8a29e', lineHeight: 1.6 }}>
              <strong>{summary?.total_issues || 0} issues</strong> ({summary?.high || 0} high, {summary?.medium || 0} medium, {summary?.low || 0} low)
              {dryRun && <><br /><span style={{ color: '#818cf8' }}>DRY RUN -- no changes applied. Use Auto-Fix to apply.</span></>}
              {applied != null && !dryRun && (
                <>
                  <br /><span style={{ color: '#4ade80' }}>Applied {applied} fixes</span>
                  {skipped > 0 && <span style={{ color: '#78716c' }}> / {skipped} skipped</span>}
                  {errored > 0 && <span style={{ color: '#f87171' }}> / {errored} errors</span>}
                </>
              )}
              {summary?.editorial_notes && <><br /><br /><em style={{ color: '#d6d3d1' }}>{summary.editorial_notes}</em></>}
            </div>
            <button className="agents-btn" onClick={copyReport} style={{ flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          </div>

          {/* Pattern warnings */}
          {summary?.patterns && summary.patterns.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              {summary.patterns.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.375rem 0', fontSize: '0.6875rem', color: '#a8a29e' }}>
                  <span style={{ color: '#fbbf24', flexShrink: 0 }}>&#9888;</span>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          )}

          {/* Issues list */}
          <div style={{ maxHeight: 300, overflowY: 'auto', fontSize: '0.75rem' }}>
            {issues.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#4ade80' }}>No issues found. Collection looks great.</div>
            ) : issues.map((issue, i) => {
              const color = issue.severity === 'high' ? '#f87171' : issue.severity === 'medium' ? '#fbbf24' : '#78716c';
              const fix = fixResults.find(r => r.slug === issue.slug && r.field === issue.field);
              return (
                <div key={i} className="agents-issue">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.625rem' }}>
                      {issue.severity}
                      {fix && (fix.status === 'applied' ? <span style={{ color: '#4ade80' }}> &#10003;</span> : fix.status === 'skipped' ? <span style={{ color: '#78716c' }}> &#9678;</span> : <span style={{ color: '#f87171' }}> &#10007;</span>)}
                    </span>
                    <span style={{ color: '#a8a29e', fontSize: '0.6875rem' }}>{issue.slug}</span>
                    <span style={{ color: '#57534e', fontSize: '0.625rem', marginLeft: 'auto' }}>{issue.field}</span>
                  </div>
                  {issue.suggested && issue.suggested !== issue.current && issue.suggested !== 'Keep as is' ? (
                    <div style={{ marginTop: '0.25rem', color: '#57534e', fontSize: '0.6875rem' }}>
                      <span style={{ textDecoration: 'line-through' }}>{issue.current.length > 80 ? issue.current.slice(0, 80) + '...' : issue.current}</span>
                      <br /><span style={{ color: '#e7e6e3' }}>&rarr; {issue.suggested.length > 80 ? issue.suggested.slice(0, 80) + '...' : issue.suggested}</span>
                    </div>
                  ) : (
                    <div style={{ marginTop: '0.25rem', color: '#57534e', fontSize: '0.6875rem' }}>
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
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #064e3b, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </div>
      }
      badge={
        <span style={{ fontSize: '0.6875rem', color: withoutIllustration.length > 0 ? '#f59e0b' : '#4ade80', fontWeight: 500 }}>
          {withIllustration.length}/{articles.length} illustrated
        </span>
      }
    >
      {/* Single article selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <label style={{ fontSize: '0.6875rem', color: '#78716c', whiteSpace: 'nowrap' }}>Single article:</label>
        <select
          value={selectedSlug}
          onChange={e => setSelectedSlug(e.target.value)}
          style={{ flex: 1, background: '#292524', border: '1px solid #3f3f46', borderRadius: 4, padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#e7e6e3', outline: 'none' }}
        >
          <option value="">Select article...</option>
          {articles.map(a => (
            <option key={a.slug} value={a.slug}>{a.hero_image ? '\u25C9' : '\u25CB'} {a.title}</option>
          ))}
        </select>
        <button className="agents-btn" disabled={loading || !selectedSlug} onClick={runSingle} style={{ whiteSpace: 'nowrap' }}>
          Generate
        </button>
      </div>

      {/* Batch buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
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
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <div className="admin-spinner admin-spinner-lg" style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ fontSize: '0.75rem', color: '#a8a29e' }}>{loadingText}</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div>
          <p style={{ fontSize: '0.75rem', color: '#a8a29e', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: result.startsWith('Batch') ? `<span style="color:#fbbf24">${result}</span>` : `<span style="color:#4ade80">&#10003; ${result}</span>` }} />
          <div style={{ marginTop: '0.5rem', height: 4, background: '#292524', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#059669', width: `${progress}%`, transition: 'width 0.3s' }} />
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

  return (
    <Section
      title="Database Sync"
      icon={
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #78350f, #b45309)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
        </div>
      }
      badge={<span style={{ fontSize: '0.6875rem', color: '#78716c' }}>{count} articles</span>}
    >
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="agents-btn agents-btn-primary" disabled={loading} onClick={refresh}>
          {loading ? 'Syncing...' : 'Refresh DB from Content'}
        </button>
      </div>
      {result && (
        <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: result.startsWith('Failed') ? '#f87171' : '#4ade80' }}>
          {result.startsWith('Failed') ? result : `\u2713 ${result}`}
        </p>
      )}
    </Section>
  );
}
