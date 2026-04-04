import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { type ArticleRecord, type PipelineLog, type PipelineResearchData, getAdminToken, getCategoryColor, getGradientHex, getScoreColor, getPenName, fetchWithTimeout } from './types';
import ConfirmModal, { ErrorBoundary } from './ConfirmModal';

// Extended article with scores (returned by DB but not in base type)
interface ArticleWithScores extends ArticleRecord {
  independence_score?: number | null;
  editor_score?: number | null;
}

// ─── Props ──────────────────────────────────────────────────────────

interface Props {
  initialArticles: ArticleRecord[];
  apiBase: string;
}

// ─── Constants ──────────────────────────────────────────────────────

type SortMode = 'newest' | 'oldest' | 'updated' | 'az' | 'readtime' | 'score' | 'editor_score' | 'no_narration' | 'no_illustration';
type StatusFilter = 'all' | 'published' | 'draft' | 'coming_soon';

function stripeColor(article: ArticleRecord): string {
  if (article.gradient_from) {
    return getGradientHex(article.gradient_from) !== '#dc2626'
      ? getGradientHex(article.gradient_from)
      : getCategoryColor(article.category);
  }
  return getCategoryColor(article.category);
}

function formatDate(d: string): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function scoreClassName(score: number): string {
  if (score >= 7) return 'admin-score-high';
  if (score >= 5) return 'admin-score-mid';
  return 'admin-score-low';
}

// ─── Detail Panel (shown when article row is expanded) ─────────────

function ArticleDetailPanel({ article, pipelineLog, loading }: {
  article: ArticleWithScores;
  pipelineLog: PipelineLog | null;
  loading: boolean;
}) {
  const rd = (pipelineLog?.research_data || {}) as PipelineResearchData;
  const indReview = rd._independenceReview;
  const qcResult = rd._qcResult;
  const pubmed = rd._pubmedVerification;
  const editorBrief = rd._editorBrief;
  const tokenUsage = pipelineLog?.token_usage;
  const wordCount = useMemo(() => {
    if (!article.article_html) return 0;
    return article.article_html.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
  }, [article.article_html]);

  return (
    <div className="articles-detail-panel">
      {/* ── Metadata ── */}
      <div className="articles-detail-section">
        <div className="articles-detail-heading">Metadata</div>
        <div className="articles-detail-kv">
          <span className="articles-detail-key">Slug</span>
          <span>{article.slug}</span>
          <span className="articles-detail-key">Category</span>
          <span>{article.category}</span>
          <span className="articles-detail-key">Status</span>
          <span>{article.status}{article.featured ? ' \u2605 Featured' : ''}{article.draft ? ' (Draft)' : ''}{article.coming_soon ? ' (Coming Soon)' : ''}</span>
          <span className="articles-detail-key">Published</span>
          <span>{article.published_at ? new Date(article.published_at).toLocaleString() : '\u2014'}</span>
          <span className="articles-detail-key">Created</span>
          <span>{new Date(article.created_at).toLocaleString()}</span>
          <span className="articles-detail-key">Updated</span>
          <span>{new Date(article.updated_at).toLocaleString()}</span>
          <span className="articles-detail-key">Read Time</span>
          <span>{article.read_time} min ({wordCount.toLocaleString()} words)</span>
          <span className="articles-detail-key">Tags</span>
          <span>{(article.tags || []).join(', ') || '\u2014'}</span>
          <span className="articles-detail-key">Keywords</span>
          <span>{(article.keywords || []).join(', ') || '\u2014'}</span>
        </div>
      </div>

      {/* ── Scores ── */}
      {(article.independence_score != null || article.editor_score != null || qcResult) && (
        <div className="articles-detail-section">
          <div className="articles-detail-heading">Scores</div>
          <div className="articles-score-cards">
            {article.independence_score != null && (
              <div className="articles-score-card">
                <div className="articles-score-label">Independence</div>
                <div className="articles-score-value" style={{ color: getScoreColor(article.independence_score) }}>
                  {article.independence_score}/10
                </div>
              </div>
            )}
            {article.editor_score != null && (
              <div className="articles-score-card">
                <div className="articles-score-label">Editor</div>
                <div className="articles-score-value" style={{ color: getScoreColor(article.editor_score) }}>
                  {article.editor_score}/10
                </div>
              </div>
            )}
            {qcResult?.qualityScore != null && (
              <div className="articles-score-card">
                <div className="articles-score-label">QC Quality</div>
                <div className="articles-score-value" style={{ color: getScoreColor(qcResult.qualityScore) }}>
                  {qcResult.qualityScore}/10
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pipeline ── */}
      <div className="articles-detail-section">
        <div className="articles-detail-heading">Pipeline</div>
        {loading ? (
          <div className="articles-detail-loading">Loading pipeline data\u2026</div>
        ) : pipelineLog ? (
          <div className="articles-detail-kv">
            <span className="articles-detail-key">Source</span>
            <span>{pipelineLog.source || '\u2014'}</span>
            <span className="articles-detail-key">Model</span>
            <span>{pipelineLog.model_used ? `${pipelineLog.model_used} (${getPenName(pipelineLog.model_used)})` : '\u2014'}</span>
            <span className="articles-detail-key">Status</span>
            <span>{pipelineLog.status}</span>
            <span className="articles-detail-key">Cost</span>
            <span>${typeof pipelineLog.cost_usd === 'number' ? pipelineLog.cost_usd.toFixed(4) : pipelineLog.cost_usd || '0.0000'}</span>
            <span className="articles-detail-key">Revisions</span>
            <span>{pipelineLog.revision_count ?? 0}</span>
            <span className="articles-detail-key">Started</span>
            <span>{pipelineLog.created_at ? new Date(pipelineLog.created_at).toLocaleString() : '\u2014'}</span>
            <span className="articles-detail-key">Completed</span>
            <span>{pipelineLog.completed_at ? new Date(pipelineLog.completed_at).toLocaleString() : '\u2014'}</span>
          </div>
        ) : (
          <div className="articles-detail-muted">No pipeline data available</div>
        )}
        {/* Token usage breakdown */}
        {tokenUsage && tokenUsage.length > 0 && (
          <div className="articles-detail-subsection">
            <div className="articles-detail-subheading">Token Usage</div>
            <table className="articles-detail-table">
              <thead>
                <tr><th>Stage</th><th>Model</th><th>In</th><th>Out</th><th>Cost</th></tr>
              </thead>
              <tbody>
                {tokenUsage.map((t, i) => (
                  <tr key={i}>
                    <td>{t.stage}</td>
                    <td>{t.model}</td>
                    <td className="admin-tabular-nums">{t.inputTokens.toLocaleString()}</td>
                    <td className="admin-tabular-nums">{t.outputTokens.toLocaleString()}</td>
                    <td className="admin-tabular-nums">${t.costUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Editor Brief ── */}
      {editorBrief && (
        <div className="articles-detail-section">
          <div className="articles-detail-heading">Editor Brief</div>
          <div className="articles-detail-kv">
            <span className="articles-detail-key">Archetype</span>
            <span>{editorBrief.archetype || '\u2014'}</span>
            <span className="articles-detail-key">Angle</span>
            <span>{editorBrief.angle || '\u2014'}</span>
            <span className="articles-detail-key">Tone</span>
            <span>{editorBrief.brief?.tonePreset || editorBrief.brief?.tone || '\u2014'}</span>
            <span className="articles-detail-key">Density</span>
            <span>{editorBrief.brief?.density || '\u2014'}</span>
            <span className="articles-detail-key">Pacing</span>
            <span>{editorBrief.brief?.pacing || '\u2014'}</span>
            <span className="articles-detail-key">Open With</span>
            <span>{editorBrief.brief?.openWith || '\u2014'}</span>
            <span className="articles-detail-key">Closing</span>
            <span>{editorBrief.brief?.closingDirection || '\u2014'}</span>
          </div>
          {Array.isArray(editorBrief.brief?.emphasize) && editorBrief.brief.emphasize.length > 0 && (
            <div className="articles-detail-subsection">
              <div className="articles-detail-subheading">Emphasize</div>
              <ul className="articles-detail-list">{editorBrief.brief.emphasize.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          {Array.isArray(editorBrief.brief?.avoid) && editorBrief.brief.avoid.length > 0 && (
            <div className="articles-detail-subsection">
              <div className="articles-detail-subheading">Avoid</div>
              <ul className="articles-detail-list">{editorBrief.brief.avoid.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {/* ── Independence Review ── */}
      {indReview && !indReview.skipped && (
        <div className="articles-detail-section">
          <div className="articles-detail-heading">Independence Review</div>
          <div className="articles-detail-kv">
            <span className="articles-detail-key">Verdict</span>
            <span style={{ color: indReview.verdict === 'clean' ? 'var(--admin-green-light)' : indReview.verdict === 'minor_issues' ? 'var(--admin-yellow-light)' : 'var(--admin-red-light)' }}>
              {indReview.verdict || '\u2014'}
            </span>
            <span className="articles-detail-key">Score</span>
            <span style={{ color: getScoreColor(indReview.score ?? null) }}>{indReview.score ?? '\u2014'}/10</span>
            <span className="articles-detail-key">Summary</span>
            <span>{indReview.summary || '\u2014'}</span>
          </div>
          {Array.isArray(indReview.flags) && indReview.flags.length > 0 && (
            <div className="articles-detail-subsection">
              <div className="articles-detail-subheading">Flags ({indReview.flags.length})</div>
              {indReview.flags.map((f, i) => (
                <div key={i} className="articles-detail-flag">
                  <div className="articles-detail-flag-type">{f.type}</div>
                  <div className="articles-detail-flag-quote">&ldquo;{f.quote}&rdquo;</div>
                  <div className="articles-detail-flag-rewrite">&rarr; {f.rewrite}</div>
                  <div className="articles-detail-flag-reason">{f.reason}</div>
                </div>
              ))}
            </div>
          )}
          {Array.isArray(indReview.strengths) && indReview.strengths.length > 0 && (
            <div className="articles-detail-subsection">
              <div className="articles-detail-subheading">Strengths</div>
              <ul className="articles-detail-list">{indReview.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {/* ── QC Result ── */}
      {qcResult && (
        <div className="articles-detail-section">
          <div className="articles-detail-heading">QC Result</div>
          <div className="articles-detail-kv">
            <span className="articles-detail-key">Decision</span>
            <span style={{ color: qcResult.decision === 'publish' ? 'var(--admin-green-light)' : qcResult.decision === 'kill' ? 'var(--admin-red-light)' : 'var(--admin-yellow-light)' }}>
              {qcResult.decision}
            </span>
            {qcResult.edits?.notes && (
              <>
                <span className="articles-detail-key">Notes</span>
                <span>{qcResult.edits.notes}</span>
              </>
            )}
            {qcResult.reviseInstructions && (
              <>
                <span className="articles-detail-key">Revise</span>
                <span>{qcResult.reviseInstructions}</span>
              </>
            )}
          </div>
          {qcResult.voiceCheck && (
            <div className="articles-detail-subsection">
              <div className="articles-detail-subheading">Voice Check</div>
              <div className="articles-voice-grid">
                {Object.entries(qcResult.voiceCheck).map(([key, val]) => (
                  <span key={key} className="articles-voice-item">
                    <span style={{ color: val ? 'var(--admin-green-light)' : 'var(--admin-red-light)' }}>{val ? '\u2713' : '\u2717'}</span>{' '}
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PubMed Verification ── */}
      {pubmed && pubmed.total && pubmed.total > 0 && (
        <div className="articles-detail-section">
          <div className="articles-detail-heading">PubMed Verification</div>
          <div className="articles-score-cards">
            <div className="articles-score-card">
              <div className="articles-score-label">Verified</div>
              <div className="articles-score-value" style={{ color: 'var(--admin-green-light)' }}>{pubmed.verified ?? 0}</div>
            </div>
            <div className="articles-score-card">
              <div className="articles-score-label">Failed</div>
              <div className="articles-score-value" style={{ color: 'var(--admin-red-light)' }}>{pubmed.failed ?? 0}</div>
            </div>
            <div className="articles-score-card">
              <div className="articles-score-label">Skipped</div>
              <div className="articles-score-value" style={{ color: 'var(--admin-text-3)' }}>{pubmed.skipped ?? 0}</div>
            </div>
          </div>
          {Array.isArray(pubmed.details) && pubmed.details.length > 0 && (
            <div className="articles-detail-subsection">
              <div className="articles-detail-subheading">Citations</div>
              {pubmed.details.map((d, i) => (
                <div key={i} className="articles-detail-citation">
                  <span style={{ color: d.found ? 'var(--admin-green-light)' : d.skipped ? 'var(--admin-text-3)' : 'var(--admin-red-light)' }}>
                    {d.found ? '\u2713' : d.skipped ? '\u2013' : '\u2717'}
                  </span>{' '}
                  {d.title}
                  {d.pmid && <span className="articles-detail-muted"> PMID:{d.pmid}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Audio Narration ── */}
      {article.narration_url && (
        <div className="articles-detail-section">
          <div className="articles-detail-heading">Narration</div>
          <audio controls className="articles-audio-player" src={article.narration_url} preload="none" />
        </div>
      )}

      {/* ── Illustration ── */}
      {article.hero_image && (
        <div className="articles-detail-section">
          <div className="articles-detail-heading">Illustration</div>
          <img src={article.hero_image} alt={article.hero_image_alt || ''} className="articles-hero-preview" loading="lazy" />
          {article.hero_image_alt && <div className="articles-detail-muted">{article.hero_image_alt}</div>}
        </div>
      )}

      {/* ── Table of Contents ── */}
      {article.toc && article.toc.length > 0 && (
        <div className="articles-detail-section">
          <div className="articles-detail-heading">Table of Contents ({article.toc.length} sections)</div>
          <ol className="articles-detail-toc">
            {article.toc.map((entry, i) => <li key={i}>{entry.title}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export default function ArticlesManagerWrapped(props: Props) {
  return (
    <ErrorBoundary fallbackLabel="Articles Manager encountered an error">
      <ArticlesManagerInner {...props} />
    </ErrorBoundary>
  );
}

function ArticlesManagerInner({ initialArticles, apiBase }: Props) {
  const [articles, setArticles] = useState<ArticleWithScores[]>(initialArticles as ArticleWithScores[]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sort, setSort] = useState<SortMode>('newest');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<{ slug: string; field: 'title' | 'description' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArticleRecord | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [improvingSlug, setImprovingSlug] = useState<string | null>(null);
  const [improveResult, setImproveResult] = useState<{ slug: string; message: string; ok: boolean } | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [pipelineLog, setPipelineLog] = useState<PipelineLog | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const editRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ─── Derived data ─────────────────────────────────────────────────

  const categories = useMemo(() => {
    const cats = new Set<string>();
    articles.forEach(a => { if (a.category) cats.add(a.category); });
    return Array.from(cats).sort();
  }, [articles]);

  const debouncedSearch = useMemo(() => search.toLowerCase().trim(), [search]);

  const filtered = useMemo(() => {
    let list = [...articles];

    // Status filter
    if (statusFilter === 'published') list = list.filter(a => a.status === 'published' && !a.coming_soon && !a.draft);
    else if (statusFilter === 'draft') list = list.filter(a => a.draft || a.status === 'draft');
    else if (statusFilter === 'coming_soon') list = list.filter(a => a.coming_soon);

    // Category filter
    if (categoryFilter !== 'all') list = list.filter(a => a.category === categoryFilter);

    // Search
    if (debouncedSearch) {
      list = list.filter(a => {
        const haystack = `${a.title} ${a.description} ${a.category} ${(a.tags || []).join(' ')}`.toLowerCase();
        return haystack.includes(debouncedSearch);
      });
    }

    // Sort
    switch (sort) {
      case 'newest': list.sort((a, b) => new Date(b.publish_date || b.created_at).getTime() - new Date(a.publish_date || a.created_at).getTime()); break;
      case 'oldest': list.sort((a, b) => new Date(a.publish_date || a.created_at).getTime() - new Date(b.publish_date || b.created_at).getTime()); break;
      case 'updated': list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()); break;
      case 'az': list.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'readtime': list.sort((a, b) => (b.read_time || 0) - (a.read_time || 0)); break;
      case 'score': list.sort((a, b) => ((b as ArticleWithScores).independence_score || 0) - ((a as ArticleWithScores).independence_score || 0)); break;
      case 'editor_score': list.sort((a, b) => ((b as ArticleWithScores).editor_score || 0) - ((a as ArticleWithScores).editor_score || 0)); break;
      case 'no_narration': list.sort((a, b) => (a.narration_url ? 1 : 0) - (b.narration_url ? 1 : 0)); break;
      case 'no_illustration': list.sort((a, b) => (a.hero_image ? 1 : 0) - (b.hero_image ? 1 : 0)); break;
    }

    return list;
  }, [articles, statusFilter, categoryFilter, debouncedSearch, sort]);

  const refreshArticles = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetchWithTimeout(`${apiBase}/articles-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setArticles(data as ArticleWithScores[]);
      }
    } catch { /* silent */ }
    finally { setRefreshing(false); }
  }, [apiBase]);

  // Fetch articles on mount (needed for client:only rendering)
  useEffect(() => {
    if (initialArticles.length === 0) refreshArticles();
  }, [initialArticles.length, refreshArticles]);

  // Auto-refresh when the Articles tab becomes visible — handles both:
  // 1. Browser tab switches (visibilitychange)
  // 2. Dashboard tab switches (IntersectionObserver on the component root)
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshArticles(); };
    document.addEventListener('visibilitychange', onVisible);

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) refreshArticles(); },
      { threshold: 0.1 },
    );
    if (rootRef.current) observer.observe(rootRef.current);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      observer.disconnect();
    };
  }, [refreshArticles]);

  // ─── API helpers ──────────────────────────────────────────────────

  const apiCall = useCallback(async (endpoint: string, body: Record<string, unknown>) => {
    const token = getAdminToken();
    const res = await fetchWithTimeout(`${apiBase}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  }, [apiBase]);

  // ─── Improve article (full pipeline re-run) ────────────────────

  const improveArticle = useCallback(async (slug: string) => {
    const article = articles.find(a => a.slug === slug);
    if (!confirm(`Send "${article?.title || slug}" back through the full production pipeline?\n\nThis will re-research, re-edit, and pause for your writing — then replace the current version.`)) return;

    setImprovingSlug(slug);
    setImproveResult(null);
    try {
      const res = await apiCall('pipeline-admin', { action: 'improve-article', slug });
      setImproveResult({ slug, message: res.message || 'Article sent to pipeline', ok: true });
    } catch (err) {
      setImproveResult({ slug, message: `Failed: ${(err as Error).message}`, ok: false });
    } finally {
      setImprovingSlug(null);
    }
  }, [apiCall, articles]);

  // ─── Search debounce ──────────────────────────────────────────────

  const handleSearch = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 300);
  }, []);

  const saveField = useCallback(async (slug: string, field: string, value: string) => {
    setSaving(true);
    try {
      await apiCall('articles-api', { action: 'save', article: { slug, [field]: value } });
      setArticles(prev => prev.map(a => a.slug === slug ? { ...a, [field]: value } : a));
      setSavedSlug(slug);
      setTimeout(() => setSavedSlug(null), 1500);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [apiCall]);

  // ─── Inline editing ──────────────────────────────────────────────

  const startEdit = useCallback((slug: string, field: 'title' | 'description', currentValue: string) => {
    setEditingField({ slug, field });
    setEditValue(currentValue);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingField) return;
    const trimmed = editValue.trim();
    const article = articles.find(a => a.slug === editingField.slug);
    if (trimmed && article && trimmed !== article[editingField.field]) {
      saveField(editingField.slug, editingField.field, trimmed);
    }
    setEditingField(null);
  }, [editingField, editValue, articles, saveField]);

  const cancelEdit = useCallback(() => {
    setEditingField(null);
  }, []);

  const handleEditKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && editingField?.field === 'title') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') cancelEdit();
  }, [editingField, commitEdit, cancelEdit]);

  useEffect(() => {
    if (editingField && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingField]);

  // ─── Featured toggle ─────────────────────────────────────────────

  const toggleFeatured = useCallback(async (slug: string) => {
    const article = articles.find(a => a.slug === slug);
    if (!article) return;
    const newVal = !article.featured;
    // Optimistic update
    setArticles(prev => prev.map(a => a.slug === slug ? { ...a, featured: newVal } : a));
    try {
      await apiCall('articles-api', { action: 'save', article: { slug, featured: newVal } });
    } catch {
      // Revert on failure
      setArticles(prev => prev.map(a => a.slug === slug ? { ...a, featured: !newVal } : a));
    }
  }, [articles, apiCall]);

  // ─── Delete ───────────────────────────────────────────────────────

  // Single source of truth: delete-article handles everything
  // (GitHub files, DB row, illustrations, narration, pipeline logs)
  const confirmDelete = useCallback(async (slug: string) => {
    try {
      await apiCall('delete-article', { slug });
      setArticles(prev => prev.filter(a => a.slug !== slug));
      setSelected(prev => { const next = new Set(prev); next.delete(slug); return next; });
    } catch (err) {
      console.error('Delete failed:', err);
    }
    setDeleteTarget(null);
  }, [apiCall]);

  const confirmBulkDelete = useCallback(async () => {
    const slugs = Array.from(selected);
    for (const slug of slugs) {
      try { await apiCall('delete-article', { slug }); } catch { /* continue */ }
    }
    setArticles(prev => prev.filter(a => !selected.has(a.slug)));
    setSelected(new Set());
    setBulkDeleteConfirm(false);
  }, [selected, apiCall]);

  // ─── Bulk featured ────────────────────────────────────────────────

  const bulkSetFeatured = useCallback(async (featured: boolean) => {
    const slugs = Array.from(selected);
    setArticles(prev => prev.map(a => slugs.includes(a.slug) ? { ...a, featured } : a));
    for (const slug of slugs) {
      try { await apiCall('articles-api', { action: 'save', article: { slug, featured } }); } catch { /* continue */ }
    }
  }, [selected, apiCall]);

  // ─── Selection helpers ────────────────────────────────────────────

  const toggleSelect = useCallback((slug: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(filtered.map(a => a.slug)));
  }, [filtered]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  // ─── Expand detail panel ──────────────────────────────────────────

  const toggleExpand = useCallback(async (slug: string) => {
    if (expandedSlug === slug) {
      setExpandedSlug(null);
      setPipelineLog(null);
      return;
    }
    setExpandedSlug(slug);
    setPipelineLog(null);

    const article = articles.find(a => a.slug === slug);
    if (article?.pipeline_log_id) {
      setLoadingLog(true);
      try {
        const res = await apiCall('pipeline-admin', { action: 'get-log', logId: article.pipeline_log_id });
        setPipelineLog(res as PipelineLog);
      } catch { /* silent — panel shows article data without log */ }
      finally { setLoadingLog(false); }
    }
  }, [expandedSlug, articles, apiCall]);

  // ─── Status badge ────────────────────────────────────────────────

  function statusBadge(article: ArticleRecord) {
    if (article.coming_soon) return <span className="articles-badge admin-status-coming-soon">Coming Soon</span>;
    if (article.draft || article.status === 'draft') return <span className="articles-badge admin-status-draft">Draft</span>;
    return <span className="articles-badge admin-status-published">Published</span>;
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div ref={rootRef}>
      {/* ── Toolbar ── */}
      <div className="articles-toolbar">
        <input
          type="text"
          placeholder="Search title, description, category, tags..."
          defaultValue={search}
          onChange={handleSearch}
          aria-label="Search articles"
          style={{ flex: 2 }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="coming_soon">Coming Soon</option>
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortMode)}
          aria-label="Sort articles"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="updated">Recently updated</option>
          <option value="az">A-Z</option>
          <option value="readtime">Read time</option>
          <option value="score">Independence score</option>
          <option value="editor_score">Editor score</option>
          <option value="no_narration">Missing narration</option>
          <option value="no_illustration">Missing illustration</option>
        </select>
        <button
          onClick={refreshArticles}
          disabled={refreshing}
          className="admin-action-btn admin-action-btn-muted admin-nowrap"
        >
          {refreshing ? 'Refreshing\u2026' : 'Refresh'}
        </button>
      </div>

      {/* ── Count ── */}
      <div className="articles-count">
        {filtered.length} article{filtered.length !== 1 ? 's' : ''}
        {debouncedSearch && ` matching "${debouncedSearch}"`}
        {selected.size > 0 && <span className="articles-selected-count">{selected.size} selected</span>}
      </div>

      {/* ── Bulk bar ── */}
      {selected.size > 0 && (
        <div className="articles-bulk-bar">
          <button onClick={selectAll} className="admin-action-btn admin-action-btn-muted">
            Select all ({filtered.length})
          </button>
          <button onClick={deselectAll} className="admin-action-btn admin-action-btn-muted">
            Deselect all
          </button>
          <button onClick={() => bulkSetFeatured(true)} className="admin-action-btn admin-action-btn-yellow">
            Feature selected
          </button>
          <button onClick={() => bulkSetFeatured(false)} className="admin-action-btn admin-action-btn-muted">
            Unfeature selected
          </button>
          <button onClick={() => setBulkDeleteConfirm(true)} className="admin-action-btn admin-action-delete">
            Delete selected ({selected.size})
          </button>
        </div>
      )}

      {/* ── Article list ── */}
      {filtered.length === 0 ? (
        <div className="articles-empty">
          {articles.length === 0 ? 'No articles in database.' : 'No articles match your filters.'}
        </div>
      ) : (
        <div className="articles-list">
          {filtered.map(article => {
            const isEditing = editingField?.slug === article.slug;
            const isSaved = savedSlug === article.slug;
            const isExpanded = expandedSlug === article.slug;
            return (
              <div key={article.slug} className={`articles-row-wrapper${isExpanded ? ' articles-row-expanded' : ''}`}>
              <div
                className={`articles-row${selected.has(article.slug) ? ' articles-row-selected' : ''}`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(article.slug)}
                  onChange={() => toggleSelect(article.slug)}
                  aria-label={`Select ${article.title}`}
                  className="articles-checkbox"
                />

                {/* Color stripe */}
                <div className="articles-stripe" style={{ background: stripeColor(article) }} />

                {/* Content */}
                <div className="articles-content" onClick={() => toggleExpand(article.slug)} style={{ cursor: 'pointer' }}>
                  {/* Title row */}
                  <div className="admin-flex-center admin-gap-md admin-mb-sm">
                    {isEditing && editingField.field === 'title' ? (
                      <input
                        ref={editRef as React.RefObject<HTMLInputElement>}
                        className="articles-inline-edit articles-title-edit"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={handleEditKey}
                        disabled={saving}
                      />
                    ) : (
                      <span
                        onClick={(e) => { e.stopPropagation(); startEdit(article.slug, 'title', article.title); }}
                        className="articles-title"
                        title="Click to edit title"
                      >
                        {article.title}
                      </span>
                    )}
                    {isSaved && <span className="articles-saved-indicator">Saved</span>}
                  </div>

                  {/* Description */}
                  {isEditing && editingField.field === 'description' ? (
                    <textarea
                      ref={editRef as React.RefObject<HTMLTextAreaElement>}
                      className="articles-inline-edit articles-description-edit"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={handleEditKey}
                      disabled={saving}
                      rows={2}
                    />
                  ) : (
                    <p
                      onClick={(e) => { e.stopPropagation(); startEdit(article.slug, 'description', article.description); }}
                      className="articles-description"
                      title="Click to edit description"
                    >
                      {article.description}
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="admin-flex-center admin-flex-wrap admin-gap-md">
                    <span className="articles-badge articles-badge-category">
                      {article.category}
                    </span>
                    {statusBadge(article)}
                    <span className="admin-text-sm admin-color-subtle">{formatDate(article.publish_date)}</span>
                    <span className="admin-text-sm admin-color-subtle">{article.read_time || 0} min</span>
                    {article.tags && article.tags.length > 0 && (
                      <span className="admin-text-sm admin-color-subtle" title={article.tags.join(', ')}>
                        {article.tags.length} tag{article.tags.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {/* Scores */}
                    {(article as ArticleWithScores).independence_score != null && (
                      <span className={`admin-text-sm admin-tabular-nums ${scoreClassName((article as ArticleWithScores).independence_score || 0)}`}>
                        Ind: {(article as ArticleWithScores).independence_score}/10
                      </span>
                    )}
                    {(article as ArticleWithScores).editor_score != null && (
                      <span className="admin-text-sm admin-color-secondary admin-tabular-nums">
                        Ed: {(article as ArticleWithScores).editor_score}/10
                      </span>
                    )}
                    {/* Hero image indicator */}
                    <span
                      className={`articles-hero-indicator ${article.hero_image ? 'articles-hero-yes' : 'articles-hero-no'}`}
                      title={article.hero_image ? 'Has illustration' : 'Missing illustration'}
                    >
                      {article.hero_image ? '\u25C9' : '\u25CB'}
                    </span>
                    {/* Narration indicator */}
                    <span
                      className={`articles-hero-indicator ${article.narration_url ? 'articles-hero-yes' : 'articles-hero-no'}`}
                      title={article.narration_url ? 'Has narration' : 'Missing narration'}
                    >
                      {article.narration_url ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
                    </span>
                  </div>
                </div>

                {/* Featured star */}
                <button
                  className="articles-star"
                  onClick={() => toggleFeatured(article.slug)}
                  aria-label={article.featured ? 'Remove from featured' : 'Add to featured'}
                  title={article.featured ? 'Featured — click to remove' : 'Click to feature'}
                >
                  {article.featured ? '\u2605' : '\u2606'}
                </button>

                {/* Actions */}
                <div className="articles-actions">
                  <button
                    className="admin-action-btn admin-action-btn-purple"
                    onClick={() => improveArticle(article.slug)}
                    disabled={improvingSlug === article.slug}
                    aria-label={`Improve ${article.title}`}
                    title="Re-run full pipeline (research → edit → write → publish)"
                  >
                    {improvingSlug === article.slug ? 'Improving\u2026' : 'Improve'}
                  </button>
                  <a
                    href={`/articles/${article.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-action-btn admin-action-view"
                    aria-label={`View ${article.title}`}
                  >
                    View
                  </a>
                  <a
                    href={`/admin/edit/${article.slug}`}
                    className="admin-action-btn admin-action-edit"
                    aria-label={`Edit ${article.title}`}
                  >
                    Edit
                  </a>
                  <button
                    className="admin-action-btn admin-action-delete"
                    onClick={() => setDeleteTarget(article)}
                    aria-label={`Delete ${article.title}`}
                  >
                    Delete
                  </button>
                </div>
                {improveResult?.slug === article.slug && (
                  <div className={`admin-toast ${improveResult.ok ? 'admin-toast-success' : 'admin-toast-error'}`} style={{ gridColumn: '1 / -1', marginTop: '0.25rem' }}>
                    <span>{improveResult.message}</span>
                    <button onClick={() => setImproveResult(null)} className="admin-toast-dismiss">{'\u00d7'}</button>
                  </div>
                )}
              </div>
              {/* ── Expanded detail panel ── */}
              {isExpanded && (
                <ArticleDetailPanel article={article} pipelineLog={pipelineLog} loading={loadingLog} />
              )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete article"
        message={deleteTarget ? `Delete "${deleteTarget.title}"? This removes the article from the database and GitHub.` : ''}
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (deleteTarget) confirmDelete(deleteTarget.slug); }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Bulk delete confirm modal ── */}
      <ConfirmModal
        open={bulkDeleteConfirm}
        title={`Delete ${selected.size} articles`}
        message={`This will permanently remove ${selected.size} article${selected.size !== 1 ? 's' : ''} from the database and GitHub. This cannot be undone.`}
        confirmLabel={`Delete ${selected.size} article${selected.size !== 1 ? 's' : ''}`}
        danger
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />
    </div>
  );
}
