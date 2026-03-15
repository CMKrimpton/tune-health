import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import type { DragEvent, ChangeEvent } from 'react';

// ─── Types ──────────────────────────────────────────────────────────

interface ArticleMetadata {
  title: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  gradient: { from: string; to: string };
  featured: boolean;
  readTime: number;
  publishDate: string;
  keywords: string[];
}

interface GeneratedArticle {
  html: string;
  metadata: ArticleMetadata;
  svg: string;
  toc: Array<{ id: string; title: string }>;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ArticleSnapshot {
  article: GeneratedArticle;
  metadata: ArticleMetadata;
  label: string;
  timestamp: number;
}

type EditorState = 'upload' | 'processing' | 'preview' | 'publishing' | 'done';

// ─── Constants ──────────────────────────────────────────────────────

const EDGE_FUNCTION_BASE = import.meta.env.PUBLIC_SUPABASE_URL
  ? `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`
  : '';

const STORAGE_KEY = 'alumi_admin_draft';

const CATEGORY_OPTIONS = [
  'Mental Health', 'Neuroscience', 'Nutrition', 'Longevity',
  'Fitness', 'Sleep Science', 'Clinical Evidence', 'Research Summary',
  'Environmental Health', 'Pharmacology',
];

const GRADIENT_PRESETS: Array<{ from: string; to: string; label: string; colors: [string, string] }> = [
  { from: 'rose-600', to: 'red-700', label: 'Rose', colors: ['#e11d48', '#b91c1c'] },
  { from: 'violet-600', to: 'purple-700', label: 'Violet', colors: ['#7c3aed', '#7e22ce'] },
  { from: 'emerald-500', to: 'teal-600', label: 'Emerald', colors: ['#10b981', '#0d9488'] },
  { from: 'emerald-600', to: 'teal-700', label: 'Deep Emerald', colors: ['#059669', '#0f766e'] },
  { from: 'amber-500', to: 'orange-600', label: 'Amber', colors: ['#f59e0b', '#ea580c'] },
  { from: 'sky-500', to: 'blue-600', label: 'Sky', colors: ['#0ea5e9', '#2563eb'] },
  { from: 'indigo-500', to: 'purple-600', label: 'Indigo', colors: ['#6366f1', '#9333ea'] },
  { from: 'lime-500', to: 'green-600', label: 'Lime', colors: ['#84cc16', '#16a34a'] },
];

const REFINE_TEMPLATES = [
  { label: 'Punchier intro', prompt: 'Make the introduction more compelling and punchy. Lead with the strongest hook.' },
  { label: 'More evidence', prompt: 'Add more specific data points, study citations, and statistics throughout the article.' },
  { label: 'Shorter', prompt: 'Make the article more concise. Remove redundancy, tighten sentences, cut filler.' },
  { label: 'Add pull quote', prompt: 'Add another compelling pull quote in the middle section of the article.' },
  { label: 'Stronger conclusion', prompt: 'Rewrite the conclusion to be more actionable and memorable.' },
  { label: 'Simplify language', prompt: 'Simplify the language throughout. Shorter sentences, fewer jargon terms.' },
];

// ─── Helpers ────────────────────────────────────────────────────────

function getAdminToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)admin_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function wordCount(text: string): number {
  return text.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
}

function saveDraft(data: {
  state: EditorState;
  sourceText: string;
  article: GeneratedArticle | null;
  metadata: ArticleMetadata | null;
  chatMessages: ChatMessage[];
  snapshots: ArticleSnapshot[];
}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

function loadDraft(): ReturnType<typeof saveDraft extends (d: infer T) => void ? () => T : never> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearDraft() {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Component ──────────────────────────────────────────────────────

export default function ArticleEditor() {
  // Core state
  const [state, setState] = useState<EditorState>('upload');
  const [sourceText, setSourceText] = useState('');
  const [sourceFormat, setSourceFormat] = useState<'markdown' | 'text' | 'html'>('markdown');
  const [article, setArticle] = useState<GeneratedArticle | null>(null);
  const [metadata, setMetadata] = useState<ArticleMetadata | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // Publishing
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'versions'>('chat');

  // Version history
  const [snapshots, setSnapshots] = useState<ArticleSnapshot[]>([]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string>('');

  // ─── Persistence ────────────────────────────────────────────────

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft() as any;
    if (draft && draft.state && draft.state !== 'upload') {
      setState(draft.state === 'publishing' ? 'preview' : draft.state);
      setSourceText(draft.sourceText || '');
      setArticle(draft.article || null);
      setMetadata(draft.metadata || null);
      setChatMessages(draft.chatMessages || []);
      setSnapshots(draft.snapshots || []);
    }
  }, []);

  // Auto-save every 5 seconds when in preview/done state
  useEffect(() => {
    if (state !== 'preview' && state !== 'done') return;
    const timer = setInterval(() => {
      saveDraft({ state, sourceText, article, metadata, chatMessages, snapshots });
    }, 5000);
    return () => clearInterval(timer);
  }, [state, sourceText, article, metadata, chatMessages, snapshots]);

  // Auto-scroll chat
  useLayoutEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isRefining]);

  // ─── File Parsing ───────────────────────────────────────────────

  const parseFile = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large (max 10MB). Try a smaller file or paste the text.');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    setError('');

    if (ext === 'md' || ext === 'txt') {
      setSourceText(await file.text());
      setSourceFormat('markdown');
    } else if (ext === 'docx') {
      try {
        setStatusMessage('Parsing DOCX...');
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        setSourceText(result.value);
        setSourceFormat('html');
        setStatusMessage('');
      } catch {
        setError('Failed to parse DOCX. Try pasting the text instead.');
        return;
      }
    } else {
      setError(`Unsupported file type: .${ext}. Accepted: .md, .txt, .docx`);
      return;
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  // ─── Process Article ────────────────────────────────────────────

  const cancelProcessing = useCallback(() => {
    abortRef.current?.abort();
    setState('upload');
    setStatusMessage('');
    setError('Generation cancelled.');
  }, []);

  const processArticle = useCallback(async () => {
    if (!sourceText.trim()) {
      setError('Please provide source text or upload a file.');
      return;
    }

    setState('processing');
    setError('');
    setStatusMessage('Sending to Claude Opus... (30-90 seconds)');

    const controller = new AbortController();
    abortRef.current = controller;

    const timers = [
      setTimeout(() => setStatusMessage('Reading and analyzing your source document...'), 8000),
      setTimeout(() => setStatusMessage('Generating article structure and editorial content...'), 25000),
      setTimeout(() => setStatusMessage('Creating pull quotes, info cards, and SVG hero...'), 50000),
      setTimeout(() => setStatusMessage('Finalizing metadata and assembling output...'), 80000),
    ];

    try {
      const res = await fetch(`${EDGE_FUNCTION_BASE}/process-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
        signal: controller.signal,
        body: JSON.stringify({ sourceText, sourceFormat }),
      });

      timers.forEach(clearTimeout);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.detail || `Processing failed (${res.status})`);
      }

      const data: GeneratedArticle = await res.json();

      // Auto-generate slug if missing
      if (data.metadata && !data.metadata.slug) {
        data.metadata.slug = slugify(data.metadata.title);
      }

      // Set today's date
      if (data.metadata) {
        data.metadata.publishDate = new Date().toISOString().split('T')[0];
      }

      setArticle(data);
      setMetadata(data.metadata);
      setState('preview');
      setStatusMessage('');

      // Save initial snapshot
      setSnapshots([{
        article: data,
        metadata: data.metadata,
        label: 'Initial generation',
        timestamp: Date.now(),
      }]);

      setChatMessages([{
        role: 'assistant',
        content: `Article generated: "${data.metadata.title}" (${data.metadata.readTime} min read, ${wordCount(data.html)} words).\n\nYou can refine it using the chat or quick actions below, edit the metadata on the left, or publish when ready.`,
        timestamp: Date.now(),
      }]);

      // Save draft immediately
      saveDraft({
        state: 'preview', sourceText, article: data, metadata: data.metadata,
        chatMessages: [], snapshots: [],
      });
    } catch (err: any) {
      timers.forEach(clearTimeout);
      if (err.name === 'AbortError') return;
      setState('upload');
      setError(err.message || 'Generation failed. Try a shorter document.');
      setStatusMessage('');
    } finally {
      abortRef.current = null;
    }
  }, [sourceText, sourceFormat]);

  // ─── Refine Article ─────────────────────────────────────────────

  const refineArticle = useCallback(async (instruction?: string) => {
    const prompt = instruction || chatInput.trim();
    if (!prompt || !article || isRefining) return;

    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: prompt, timestamp: Date.now() }]);
    setIsRefining(true);

    // Save snapshot before refinement
    if (metadata) {
      setSnapshots(prev => [...prev, {
        article: { ...article },
        metadata: { ...metadata },
        label: `Before: "${prompt.slice(0, 40)}${prompt.length > 40 ? '...' : ''}"`,
        timestamp: Date.now(),
      }]);
    }

    try {
      const res = await fetch(`${EDGE_FUNCTION_BASE}/refine-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
        body: JSON.stringify({
          currentHtml: article.html,
          currentMetadata: metadata,
          messages: chatMessages.slice(-6), // Only send last 6 messages to limit tokens
          instruction: prompt,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Refinement failed');
      }

      const data = await res.json();
      setArticle(data);
      if (data.metadata) setMetadata(data.metadata);

      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message || 'Article updated. Check the preview.',
        timestamp: Date.now(),
      }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, {
        role: 'system',
        content: `Refinement failed: ${err.message}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsRefining(false);
    }
  }, [chatInput, article, metadata, chatMessages, isRefining]);

  // ─── Version History ────────────────────────────────────────────

  const restoreSnapshot = useCallback((snapshot: ArticleSnapshot) => {
    setArticle(snapshot.article);
    setMetadata(snapshot.metadata);
    setChatMessages(prev => [...prev, {
      role: 'system',
      content: `Restored version: "${snapshot.label}"`,
      timestamp: Date.now(),
    }]);
    setActiveTab('chat');
  }, []);

  // ─── Publish ────────────────────────────────────────────────────

  const validateMetadata = useCallback((): string[] => {
    if (!metadata) return ['No metadata'];
    const errors: string[] = [];
    if (!metadata.title.trim()) errors.push('Title is required');
    if (!metadata.slug.trim()) errors.push('Slug is required');
    if (!/^[a-z0-9-]+$/.test(metadata.slug)) errors.push('Slug must be lowercase letters, numbers, and hyphens only');
    if (!metadata.description.trim()) errors.push('Description is required');
    if (metadata.description.length > 300) errors.push('Description should be under 300 characters');
    if (!metadata.category) errors.push('Category is required');
    if (metadata.tags.length === 0) errors.push('At least one tag is required');
    if (metadata.readTime <= 0) errors.push('Read time must be positive');
    return errors;
  }, [metadata]);

  const publishArticle = useCallback(async () => {
    if (!article || !metadata) return;

    const errors = validateMetadata();
    if (errors.length > 0) {
      setError(`Fix before publishing: ${errors.join(', ')}`);
      setShowPublishConfirm(false);
      return;
    }

    setIsPublishing(true);
    setState('publishing');
    setShowPublishConfirm(false);
    setStatusMessage('Committing to GitHub...');

    try {
      const astroContent = assembleAstroFile(article, metadata);

      const res = await fetch(`${EDGE_FUNCTION_BASE}/publish-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
        body: JSON.stringify({
          slug: metadata.slug,
          astroContent,
          metadata: {
            ...metadata,
            author: { name: 'alumi news Editorial', role: 'Medical Review Board' },
            draft: false,
          },
          commitMessage: `feat: Add '${metadata.title}' article`,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Publish failed');
      }

      setState('done');
      setStatusMessage('');
      clearDraft();
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Published! Vercel is rebuilding now. Your article will be live at /articles/${metadata.slug} within ~60 seconds.`,
        timestamp: Date.now(),
      }]);
    } catch (err: any) {
      setState('preview');
      setError(err.message || 'Publish failed.');
      setStatusMessage('');
    } finally {
      setIsPublishing(false);
    }
  }, [article, metadata, validateMetadata]);

  // ─── Metadata helpers ───────────────────────────────────────────

  const updateMetadata = useCallback((field: string, value: any) => {
    setMetadata(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      // Auto-update slug when title changes
      if (field === 'title' && prev.slug === slugify(prev.title)) {
        updated.slug = slugify(value);
      }
      return updated;
    });
  }, []);

  // ─── Start Over ─────────────────────────────────────────────────

  const startOver = useCallback(() => {
    if (!confirm('Start over? This will discard the current article.')) return;
    setState('upload');
    setSourceText('');
    setArticle(null);
    setMetadata(null);
    setChatMessages([]);
    setSnapshots([]);
    setError('');
    setStatusMessage('');
    setShowPublishConfirm(false);
    clearDraft();
  }, []);

  // ─── Preview HTML ───────────────────────────────────────────────

  const previewHtml = (() => {
    if (!article || !metadata) return '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600&family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Crimson Pro',serif;color:#1b1a18;background:#e7e6e3;padding:2rem;max-width:720px;margin:0 auto;font-size:1.125rem;line-height:1.8}
h1,h2,h3{font-family:'Playfair Display',serif;margin:2rem 0 1rem;line-height:1.3}
h1{font-size:2.25rem}h2{font-size:1.5rem}h3{font-size:1.25rem}
p{margin-bottom:1rem}
ul,ol{margin:1rem 0;padding-left:1.5rem}
li{margin-bottom:0.5rem}
strong{font-weight:600}em{font-style:italic}
a{color:#dc2626;text-decoration:none}
.pull-quote{border-left:3px solid #dc2626;padding:1rem 1.5rem;margin:2rem 0;background:rgba(220,38,38,0.05);font-style:italic;font-size:1.15rem;font-family:'Playfair Display',serif}
.info-card{background:#fef2f2;border:1px solid #fecaca;border-radius:0.75rem;padding:1.5rem;margin:2rem 0}
.info-card h4{font-family:'Playfair Display',serif;font-size:1.125rem;color:#b91c1c;margin-bottom:0.75rem}
.info-card ul{font-size:0.875rem}
.hero{text-align:center;padding:2rem 0 3rem;border-bottom:1px solid #d6d3d1;margin-bottom:2rem}
.cat{display:inline-block;padding:0.25rem 0.75rem;background:#fef2f2;color:#dc2626;border-radius:1rem;font-family:'Inter',sans-serif;font-size:0.6875rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:1rem}
.meta{font-family:'Inter',sans-serif;font-size:0.8125rem;color:#78716c;margin-top:0.75rem}
.svg-wrap{margin:0 -2rem 2rem}
.svg-wrap svg{width:100%;height:auto;border-radius:0.5rem}
section{margin-bottom:1.5rem}
.disclaimer{background:#f5f5f4;border:1px solid #d6d3d1;border-left:4px solid #dc2626;border-radius:0.5rem;padding:1.5rem;margin:2rem 0;font-size:0.875rem;font-family:'Inter',sans-serif;color:#57534e}
</style>
</head>
<body>
<div class="hero">
<span class="cat">${metadata.category}</span>
<h1>${metadata.title}</h1>
<p style="color:#78716c;font-size:1rem;margin-top:0.75rem">${metadata.description}</p>
<div class="meta">${metadata.readTime} min read &middot; alumi news Editorial</div>
</div>
${article.svg ? `<div class="svg-wrap"><svg viewBox="0 0 1200 600">${article.svg}</svg></div>` : ''}
<div class="article-content">${article.html}</div>
</body></html>`;
  })();

  // ─── Render ─────────────────────────────────────────────────────

  const wc = sourceText ? wordCount(sourceText) : 0;
  const validationErrors = metadata ? validateMetadata() : [];

  return (
    <div className="admin-editor-layout">
      {/* ─── Left Panel ─── */}
      <div className="admin-editor-left">

        {/* UPLOAD STATE */}
        {state === 'upload' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
            <div
              className={`admin-upload-zone${dragOver ? ' dragover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="admin-upload-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="admin-upload-title">Drop a source document</div>
              <div className="admin-upload-subtitle">.md, .docx, or .txt (max 10MB)</div>
              <input ref={fileInputRef} type="file" accept=".md,.txt,.docx" style={{ display: 'none' }} onChange={handleFileSelect}/>
            </div>

            <div className="admin-divider">or paste text below</div>

            <textarea
              value={sourceText}
              onChange={(e) => { setSourceText(e.target.value); setError(''); }}
              placeholder="Paste your source document text here..."
              className="admin-source-textarea"
            />

            {/* Word count */}
            {wc > 0 && (
              <div className="admin-word-count">
                {wc.toLocaleString()} words &middot; ~{Math.ceil(wc / 220)} min read
              </div>
            )}

            {error && <div className="admin-error">{error}</div>}

            <button
              onClick={processArticle}
              disabled={!sourceText.trim()}
              className="admin-generate-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Generate with Claude Opus
            </button>
          </div>
        )}

        {/* PROCESSING STATE */}
        {state === 'processing' && (
          <div className="admin-processing">
            <div className="admin-spinner admin-spinner-lg"/>
            <div className="admin-processing-text">
              <strong>Processing Article</strong>
              <span>{statusMessage}</span>
            </div>
            <button onClick={cancelProcessing} className="admin-cancel-btn">Cancel</button>
          </div>
        )}

        {/* PREVIEW / PUBLISHING / DONE STATE */}
        {(state === 'preview' || state === 'publishing' || state === 'done') && (
          <>
            {/* Metadata Panel */}
            <div className="admin-metadata">
              <div className="admin-metadata-header" onClick={() => setMetadataOpen(!metadataOpen)}>
                <span>Article Metadata</span>
                {validationErrors.length > 0 && (
                  <span className="admin-validation-count">{validationErrors.length}</span>
                )}
                <span className="admin-chevron">{metadataOpen ? '−' : '+'}</span>
              </div>
              {metadataOpen && metadata && (
                <div className="admin-metadata-grid">
                  <div className="admin-field admin-field-full">
                    <label>Title</label>
                    <input value={metadata.title} onChange={(e) => updateMetadata('title', e.target.value)}/>
                  </div>
                  <div className="admin-field admin-field-full">
                    <label>Slug</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ color: '#78716c', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>/articles/</span>
                      <input value={metadata.slug} onChange={(e) => updateMetadata('slug', e.target.value)} style={{ flex: 1 }}/>
                    </div>
                  </div>
                  <div className="admin-field admin-field-full">
                    <label>Description <span style={{ color: '#78716c', fontWeight: 400 }}>({metadata.description.length}/300)</span></label>
                    <textarea value={metadata.description} onChange={(e) => updateMetadata('description', e.target.value)} rows={3}/>
                  </div>
                  <div className="admin-field">
                    <label>Category</label>
                    <select value={metadata.category} onChange={(e) => updateMetadata('category', e.target.value)}>
                      {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="admin-field">
                    <label>Gradient</label>
                    <div className="admin-gradient-picker">
                      {GRADIENT_PRESETS.map(g => (
                        <button
                          key={g.label}
                          title={g.label}
                          className={`admin-gradient-swatch${metadata.gradient.from === g.from ? ' active' : ''}`}
                          style={{ background: `linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]})` }}
                          onClick={() => updateMetadata('gradient', { from: g.from, to: g.to })}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="admin-field admin-field-full">
                    <label>Tags (comma-separated)</label>
                    <input
                      value={metadata.tags.join(', ')}
                      onChange={(e) => updateMetadata('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                    />
                  </div>
                  <div className="admin-field admin-field-full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="admin-checkbox-label">
                      <input type="checkbox" checked={metadata.featured} onChange={(e) => updateMetadata('featured', e.target.checked)}/>
                      Featured Article
                    </label>
                    <span style={{ fontSize: '0.6875rem', color: '#78716c' }}>{metadata.readTime} min read &middot; {wordCount(article?.html || '')} words</span>
                  </div>
                </div>
              )}
            </div>

            {/* Tabs: Chat / Versions */}
            <div className="admin-tabs">
              <button className={`admin-tab${activeTab === 'chat' ? ' active' : ''}`} onClick={() => setActiveTab('chat')}>
                Refine
              </button>
              <button className={`admin-tab${activeTab === 'versions' ? ' active' : ''}`} onClick={() => setActiveTab('versions')}>
                Versions ({snapshots.length})
              </button>
            </div>

            {/* Chat Tab */}
            {activeTab === 'chat' && (
              <div className="admin-chat">
                <div className="admin-chat-messages">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`admin-chat-msg admin-chat-msg-${msg.role}`}>
                      {msg.content}
                    </div>
                  ))}
                  {isRefining && (
                    <div className="admin-chat-msg admin-chat-msg-assistant">
                      <div className="admin-spinner"/>
                    </div>
                  )}
                  <div ref={chatEndRef}/>
                </div>

                {/* Quick refine buttons */}
                {state === 'preview' && !isRefining && (
                  <div className="admin-refine-templates">
                    <span className="admin-refine-label">Quick actions</span>
                    {REFINE_TEMPLATES.map(t => (
                      <button key={t.label} className="admin-template-btn" onClick={() => refineArticle(t.prompt)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="admin-chat-input-area">
                  <input
                    type="text"
                    className="admin-chat-input"
                    placeholder={state === 'done' ? 'Article published!' : 'Custom refinement instruction...'}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); refineArticle(); } }}
                    disabled={isRefining || state === 'done'}
                  />
                  <button className="admin-chat-send" onClick={() => refineArticle()} disabled={isRefining || !chatInput.trim() || state === 'done'}>
                    Send
                  </button>
                </div>
              </div>
            )}

            {/* Versions Tab */}
            {activeTab === 'versions' && (
              <div className="admin-versions">
                {snapshots.length === 0 ? (
                  <div className="admin-versions-empty">No versions yet. Versions are saved before each refinement.</div>
                ) : (
                  snapshots.map((snap, i) => (
                    <div key={i} className="admin-version-item">
                      <div>
                        <div className="admin-version-label">{snap.label}</div>
                        <div className="admin-version-time">{new Date(snap.timestamp).toLocaleTimeString()}</div>
                      </div>
                      <button className="admin-version-restore" onClick={() => restoreSnapshot(snap)}>Restore</button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Error */}
            {error && <div className="admin-error" style={{ margin: '0 1rem 1rem' }}>{error}</div>}

            {/* Publish Bar */}
            <div className="admin-publish-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="admin-status">
                  <span className={`admin-status-dot ${
                    state === 'done' ? 'admin-status-dot-ready' :
                    state === 'publishing' ? 'admin-status-dot-processing' :
                    validationErrors.length > 0 ? 'admin-status-dot-error' :
                    'admin-status-dot-ready'
                  }`}/>
                  {state === 'done' ? 'Published' :
                   state === 'publishing' ? 'Publishing...' :
                   validationErrors.length > 0 ? `${validationErrors.length} issue${validationErrors.length > 1 ? 's' : ''}` :
                   'Ready'}
                </div>
                <button onClick={startOver} className="admin-start-over" title="Start over">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                  </svg>
                </button>
              </div>
              {state === 'done' ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <a href={`/articles/${metadata?.slug}`} target="_blank" className="admin-publish-btn" style={{ background: '#16a34a', textDecoration: 'none', color: 'white' }}>
                    View Article
                  </a>
                  <button onClick={startOver} className="admin-publish-btn" style={{ background: '#292524' }}>
                    New Article
                  </button>
                </div>
              ) : showPublishConfirm ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#a8a29e' }}>Publish to production?</span>
                  <button className="admin-publish-btn" onClick={publishArticle} disabled={isPublishing}>
                    {isPublishing ? 'Publishing...' : 'Confirm'}
                  </button>
                  <button className="admin-cancel-btn" onClick={() => setShowPublishConfirm(false)} style={{ padding: '0.5rem 1rem' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="admin-publish-btn"
                  onClick={() => setShowPublishConfirm(true)}
                  disabled={isPublishing || validationErrors.length > 0}
                >
                  Publish to GitHub
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── Right Panel — Preview ─── */}
      <div className="admin-editor-right">
        {state === 'upload' && (
          <div className="admin-preview-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: '1rem', opacity: 0.3 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            Upload a source document to preview
          </div>
        )}
        {state === 'processing' && (
          <div className="admin-preview-empty">
            <div className="admin-spinner" style={{ marginBottom: '1rem' }}/>
            Generating article...
          </div>
        )}
        {(state === 'preview' || state === 'publishing' || state === 'done') && article && (
          <iframe className="admin-preview-frame" srcDoc={previewHtml} title="Article Preview"/>
        )}
      </div>
    </div>
  );
}

// ─── Assemble .astro file ───────────────────────────────────────────

function assembleAstroFile(article: GeneratedArticle, metadata: ArticleMetadata): string {
  const publishDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const tagsHtml = metadata.tags
    .map(tag => `    <span class="px-3 py-1 bg-stone-100 dark:bg-stone-800 rounded-full text-sm">${tag}</span>`)
    .join('\n');

  const tocHtml = article.toc
    .map(item => `      <a href="#${item.id}" class="block text-sm text-stone-600 dark:text-stone-400 hover:text-primary-600 transition-colors">${item.title}</a>`)
    .join('\n');

  return `---
import ArticleLayout from '../../layouts/ArticleLayout.astro';
---

<ArticleLayout
  title="${metadata.title.replace(/"/g, '&quot;')}"
  description="${metadata.description.replace(/"/g, '&quot;')}"
  category="${metadata.category}"
  readTime="${metadata.readTime} min read"
  publishDate="${publishDate}"
>
  <!-- Feature Image -->
  ${article.svg ? `<svg slot="feature-image" viewBox="0 0 1200 600" class="w-full h-full">\n${article.svg}\n  </svg>` : ''}

  <!-- Table of Contents -->
  <div class="mb-12 p-6 bg-stone-100 dark:bg-stone-900 rounded-2xl reveal">
    <h2 class="font-serif text-lg font-semibold mb-4">In This Article</h2>
    <nav class="space-y-2">
${tocHtml}
    </nav>
  </div>

  <!-- Article Content -->
  <div class="article-content">
${article.html}
  </div>

  <!-- Tags -->
  <Fragment slot="tags">
${tagsHtml}
  </Fragment>
</ArticleLayout>
`;
}
