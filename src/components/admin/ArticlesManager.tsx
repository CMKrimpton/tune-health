import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { type ArticleRecord, getAdminToken } from './types';

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

type SortMode = 'newest' | 'oldest' | 'az' | 'readtime' | 'score';
type StatusFilter = 'all' | 'published' | 'draft' | 'coming_soon';

const CATEGORY_COLORS: Record<string, string> = {
  'Mental Health': '#a78bfa',
  'Neuroscience': '#818cf8',
  'Nutrition': '#4ade80',
  'Longevity': '#c084fc',
  'Fitness': '#f87171',
  'Sleep Science': '#818cf8',
  'Clinical Evidence': '#67e8f9',
  'Research Summary': '#a8a29e',
  'Environmental Health': '#fbbf24',
  'Pharmacology': '#2dd4bf',
};

const DEFAULT_STRIPE_COLOR = '#dc2626';

function stripeColor(article: ArticleRecord): string {
  if (article.gradient_from) {
    // gradient_from is a Tailwind class like "rose-600" — map known presets to hex
    const presetMap: Record<string, string> = {
      'rose-600': '#e11d48', 'violet-600': '#7c3aed', 'emerald-500': '#10b981',
      'emerald-600': '#059669', 'amber-500': '#f59e0b', 'sky-500': '#0ea5e9',
      'indigo-500': '#6366f1', 'lime-500': '#84cc16', 'red-700': '#b91c1c',
      'purple-700': '#7e22ce', 'teal-600': '#0d9488', 'teal-700': '#0f766e',
      'orange-600': '#ea580c', 'blue-600': '#2563eb', 'purple-600': '#9333ea',
      'green-600': '#16a34a',
    };
    return presetMap[article.gradient_from] || CATEGORY_COLORS[article.category] || DEFAULT_STRIPE_COLOR;
  }
  return CATEGORY_COLORS[article.category] || DEFAULT_STRIPE_COLOR;
}

function formatDate(d: string): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ──────────────────────────────────────────────────────

export default function ArticlesManager({ initialArticles, apiBase }: Props) {
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
      case 'az': list.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'readtime': list.sort((a, b) => (b.read_time || 0) - (a.read_time || 0)); break;
      case 'score': list.sort((a, b) => ((b as ArticleWithScores).independence_score || 0) - ((a as ArticleWithScores).independence_score || 0)); break;
    }

    return list;
  }, [articles, statusFilter, categoryFilter, debouncedSearch, sort]);

  const refreshArticles = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${apiBase}/articles-api`, {
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

  // ─── Improve article (Grok review + auto-fix) ───────────────────

  const improveArticle = useCallback(async (slug: string) => {
    setImprovingSlug(slug);
    setImproveResult(null);
    try {
      // 1. Get article content
      const getRes = await apiCall('articles-api', { action: 'get', slug });
      if (!getRes.article_html) throw new Error('No article content');

      // 2. Send through refine-article with improvement instruction
      const refineRes = await fetch(`${apiBase}/refine-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({
          currentHtml: getRes.article_html,
          currentMetadata: { title: getRes.title, category: getRes.category, slug },
          instruction: 'Review this article for editorial quality. Fix any: pulled punches, institutional deference, missing study funders, vague "studies show" claims, weak conclusions, AI-sounding prose (uniform sentence length, "it\'s important to note"). Make the ending stronger if it feels abrupt. Preserve the editorial voice and angle. Return improved HTML.',
          messages: [],
        }),
      });
      if (!refineRes.ok) throw new Error(`Refine failed: ${refineRes.status}`);
      const data = await refineRes.json();

      if (data.html) {
        // 3. Save improved content back to DB
        await apiCall('articles-api', { action: 'save', article: { slug, article_html: data.html } });
        setImproveResult({ slug, message: data.message || 'Article improved and saved', ok: true });
      } else {
        setImproveResult({ slug, message: data.message || 'No changes needed', ok: true });
      }
    } catch (err) {
      setImproveResult({ slug, message: `Failed: ${(err as Error).message}`, ok: false });
    } finally {
      setImprovingSlug(null);
    }
  }, [apiBase, apiCall]);

  // ─── Search debounce ──────────────────────────────────────────────

  const handleSearch = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 300);
  }, []);

  // ─── API helpers ──────────────────────────────────────────────────

  const apiCall = useCallback(async (endpoint: string, body: Record<string, unknown>) => {
    const token = getAdminToken();
    const res = await fetch(`${apiBase}/${endpoint}`, {
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

  const confirmDelete = useCallback(async (slug: string) => {
    try {
      await apiCall('articles-api', { action: 'delete', slug });
      // Also remove from GitHub
      try { await apiCall('delete-article', { slug }); } catch { /* GitHub delete is best-effort */ }
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
      try {
        await apiCall('articles-api', { action: 'delete', slug });
        try { await apiCall('delete-article', { slug }); } catch { /* best-effort */ }
      } catch { /* continue */ }
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

  // ─── Status badge ────────────────────────────────────────────────

  function statusBadge(article: ArticleRecord) {
    if (article.coming_soon) return <span className="articles-badge" style={{ background: '#44403c', color: '#a8a29e' }}>Coming Soon</span>;
    if (article.draft || article.status === 'draft') return <span className="articles-badge" style={{ background: '#92400e', color: '#fbbf24' }}>Draft</span>;
    return <span className="articles-badge" style={{ background: '#052e16', color: '#4ade80' }}>Published</span>;
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div>
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
          <option value="az">A-Z</option>
          <option value="readtime">Read time</option>
          <option value="score">Independence score</option>
        </select>
        <button
          onClick={refreshArticles}
          disabled={refreshing}
          className="admin-action-btn"
          style={{ color: '#a8a29e', borderColor: '#44403c', padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}
        >
          {refreshing ? 'Refreshing\u2026' : 'Refresh'}
        </button>
      </div>

      {/* ── Count ── */}
      <div className="articles-count">
        {filtered.length} article{filtered.length !== 1 ? 's' : ''}
        {debouncedSearch && ` matching "${debouncedSearch}"`}
        {selected.size > 0 && <span style={{ marginLeft: '0.75rem', color: '#dc2626' }}>{selected.size} selected</span>}
      </div>

      {/* ── Bulk bar ── */}
      {selected.size > 0 && (
        <div className="articles-bulk-bar">
          <button onClick={selectAll} className="admin-action-btn" style={{ color: '#a8a29e', borderColor: '#44403c' }}>
            Select all ({filtered.length})
          </button>
          <button onClick={deselectAll} className="admin-action-btn" style={{ color: '#a8a29e', borderColor: '#44403c' }}>
            Deselect all
          </button>
          <button onClick={() => bulkSetFeatured(true)} className="admin-action-btn" style={{ color: '#fbbf24', borderColor: '#92400e' }}>
            Feature selected
          </button>
          <button onClick={() => bulkSetFeatured(false)} className="admin-action-btn" style={{ color: '#a8a29e', borderColor: '#44403c' }}>
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
            return (
              <div
                key={article.slug}
                className={`articles-row${selected.has(article.slug) ? ' articles-row-selected' : ''}`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(article.slug)}
                  onChange={() => toggleSelect(article.slug)}
                  aria-label={`Select ${article.title}`}
                  style={{ accentColor: '#dc2626', width: 16, height: 16, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
                />

                {/* Color stripe */}
                <div style={{ width: 4, borderRadius: 2, background: stripeColor(article), flexShrink: 0, alignSelf: 'stretch' }} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Title row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 2 }}>
                    {isEditing && editingField.field === 'title' ? (
                      <input
                        ref={editRef as React.RefObject<HTMLInputElement>}
                        className="articles-inline-edit"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={handleEditKey}
                        disabled={saving}
                        style={{ flex: 1, fontSize: '0.9375rem', fontWeight: 600 }}
                      />
                    ) : (
                      <span
                        onClick={() => startEdit(article.slug, 'title', article.title)}
                        style={{
                          fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                        }}
                        title="Click to edit title"
                      >
                        {article.title}
                      </span>
                    )}
                    {isSaved && <span style={{ fontSize: '0.625rem', color: '#4ade80', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saved</span>}
                  </div>

                  {/* Description */}
                  {isEditing && editingField.field === 'description' ? (
                    <textarea
                      ref={editRef as React.RefObject<HTMLTextAreaElement>}
                      className="articles-inline-edit"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={handleEditKey}
                      disabled={saving}
                      rows={2}
                      style={{ width: '100%', fontSize: '0.75rem', resize: 'vertical' }}
                    />
                  ) : (
                    <p
                      onClick={() => startEdit(article.slug, 'description', article.description)}
                      style={{
                        fontSize: '0.75rem', color: '#78716c', lineHeight: 1.4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: 600, cursor: 'pointer', margin: '0.125rem 0 0.375rem',
                      }}
                      title="Click to edit description"
                    >
                      {article.description}
                    </p>
                  )}

                  {/* Meta row */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="articles-badge" style={{ background: '#1c1917', border: '1px solid #44403c', color: '#d6d3d1' }}>
                      {article.category}
                    </span>
                    {statusBadge(article)}
                    <span style={{ fontSize: '0.6875rem', color: '#78716c' }}>{formatDate(article.publish_date)}</span>
                    <span style={{ fontSize: '0.6875rem', color: '#78716c' }}>{article.read_time || 0} min</span>
                    {article.tags && article.tags.length > 0 && (
                      <span style={{ fontSize: '0.6875rem', color: '#78716c' }} title={article.tags.join(', ')}>
                        {article.tags.length} tag{article.tags.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {/* Scores */}
                    {(article as ArticleWithScores).independence_score != null && (
                      <span style={{ fontSize: '0.6875rem', color: ((article as ArticleWithScores).independence_score || 0) >= 7 ? '#4ade80' : ((article as ArticleWithScores).independence_score || 0) >= 4 ? '#fbbf24' : '#f87171', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        Ind: {(article as ArticleWithScores).independence_score}/10
                      </span>
                    )}
                    {(article as ArticleWithScores).editor_score != null && (
                      <span style={{ fontSize: '0.6875rem', color: '#a8a29e', fontVariantNumeric: 'tabular-nums' }}>
                        Ed: {(article as ArticleWithScores).editor_score}/10
                      </span>
                    )}
                    {/* Hero image indicator */}
                    <span
                      style={{ fontSize: '0.6875rem', color: article.hero_image ? '#4ade80' : '#f87171' }}
                      title={article.hero_image ? 'Has illustration' : 'Missing illustration'}
                    >
                      {article.hero_image ? '\u25C9' : '\u25CB'}
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
                    className="admin-action-btn"
                    onClick={() => improveArticle(article.slug)}
                    disabled={improvingSlug === article.slug}
                    aria-label={`Improve ${article.title}`}
                    title="AI review + auto-fix"
                    style={{ color: '#a78bfa', borderColor: '#6d28d9' }}
                  >
                    {improvingSlug === article.slug ? (
                      <span style={{ fontSize: '0.625rem' }}>Improving\u2026</span>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    )}
                  </button>
                  <a
                    href={`/articles/${article.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-action-btn admin-action-view"
                    aria-label={`View ${article.title}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                  <a
                    href={`/admin/edit/${article.slug}`}
                    className="admin-action-btn admin-action-edit"
                    aria-label={`Edit ${article.title}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </a>
                  <button
                    className="admin-action-btn admin-action-delete"
                    onClick={() => setDeleteTarget(article)}
                    aria-label={`Delete ${article.title}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
                {improveResult?.slug === article.slug && (
                  <div style={{ gridColumn: '1 / -1', padding: '0.375rem 0.75rem', marginTop: '0.25rem', borderRadius: '0.25rem', fontSize: '0.6875rem', background: improveResult.ok ? '#052e16' : '#450a0a', color: improveResult.ok ? '#86efac' : '#fca5a5', border: `1px solid ${improveResult.ok ? '#166534' : '#991b1b'}` }}>
                    {improveResult.message}
                    <button onClick={() => setImproveResult(null)} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.6875rem' }}>{'\u00d7'}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <div className="admin-modal">
          <div className="admin-modal-backdrop" onClick={() => setDeleteTarget(null)} />
          <div className="admin-modal-card">
            <h3 className="admin-modal-title">Delete article</h3>
            <p className="admin-modal-text">
              Delete <strong>{deleteTarget.title}</strong>? This removes the article from the database and GitHub.
            </p>
            <div className="admin-modal-actions">
              <button className="admin-action-btn" style={{ color: '#a8a29e', borderColor: '#44403c' }} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="admin-action-btn admin-action-delete" onClick={() => confirmDelete(deleteTarget.slug)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk delete confirm modal ── */}
      {bulkDeleteConfirm && (
        <div className="admin-modal">
          <div className="admin-modal-backdrop" onClick={() => setBulkDeleteConfirm(false)} />
          <div className="admin-modal-card">
            <h3 className="admin-modal-title">Delete {selected.size} articles</h3>
            <p className="admin-modal-text">
              This will permanently remove {selected.size} article{selected.size !== 1 ? 's' : ''} from the database and GitHub. This cannot be undone.
            </p>
            <div className="admin-modal-actions">
              <button className="admin-action-btn" style={{ color: '#a8a29e', borderColor: '#44403c' }} onClick={() => setBulkDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="admin-action-btn admin-action-delete" onClick={confirmBulkDelete}>
                Delete {selected.size} article{selected.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
