import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import {
  getAdminToken,
  VALID_CATEGORIES,
  GRADIENT_PRESETS,
  CATEGORY_GRADIENTS,
  fetchWithTimeout,
} from './types';
import { useConfirm } from './ConfirmModal';

// ─── Types ──────────────────────────────────────────────────────

interface ArticleMetadata {
  title: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  gradient: { from: string; to: string };
  featured: boolean;
  comingSoon: boolean;
  readTime: number;
  publishDate: string;
  keywords: string[];
  heroImage: string;
  heroImageAlt: string;
  heroImageLight: string;
}

interface GeneratedArticle {
  html: string;
  metadata: ArticleMetadata;
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

// ─── Constants ──────────────────────────────────────────────────

const STORAGE_KEY = 'alumi_admin_draft';

const REFINE_TEMPLATES = [
  { label: 'Punchier intro', prompt: 'Make the introduction more compelling and punchy. Lead with the strongest hook.' },
  { label: 'More evidence', prompt: 'Add more specific data points, study citations, and statistics throughout the article.' },
  { label: 'Shorter', prompt: 'Make the article more concise. Remove redundancy, tighten sentences, cut filler.' },
  { label: 'Add pull quote', prompt: 'Add another compelling pull quote in the middle section of the article.' },
  { label: 'Stronger conclusion', prompt: 'Rewrite the conclusion to be more actionable and memorable.' },
  { label: 'Simplify language', prompt: 'Simplify the language throughout. Shorter sentences, fewer jargon terms.' },
];

// ─── Helpers ────────────────────────────────────────────────────

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

interface DraftData {
  state: EditorState;
  sourceText: string;
  article: GeneratedArticle | null;
  metadata: ArticleMetadata | null;
  chatMessages: ChatMessage[];
  snapshots: ArticleSnapshot[];
}

function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearDraft() {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Component ──────────────────────────────────────────────────

export default function ArticleEditor({ apiBase }: { apiBase: string }) {
  const API_BASE = apiBase;

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

  // Confirm modal
  const { ask, ConfirmDialog } = useConfirm();

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string>('');

  // ─── Persistence ────────────────────────────────────────────────

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.state && draft.state !== 'upload') {
      setState(draft.state === 'publishing' ? 'preview' : draft.state);
      setSourceText(draft.sourceText || '');
      setArticle(draft.article || null);
      const m = draft.metadata;
      if (m) {
        if (!m.gradient) {
          const cat = CATEGORY_GRADIENTS[m.category];
          m.gradient = cat ? { from: cat.from, to: cat.to } : { from: 'rose-600', to: 'red-700' };
        }
        if (!m.heroImageLight) m.heroImageLight = '';
        if (m.comingSoon === undefined) m.comingSoon = false;
      }
      setMetadata(m || null);
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
        setStatusMessage('');
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
    setStatusMessage('Generating article... (30-90 seconds)');

    const controller = new AbortController();
    abortRef.current = controller;

    const timers = [
      setTimeout(() => setStatusMessage('Reading and analyzing your source document...'), 8000),
      setTimeout(() => setStatusMessage('Generating article structure and editorial content...'), 25000),
      setTimeout(() => setStatusMessage('Creating pull quotes, info cards, and SVG hero...'), 50000),
      setTimeout(() => setStatusMessage('Finalizing metadata and assembling output...'), 80000),
    ];

    try {
      const res = await fetch(`${API_BASE}/process-article`, {
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

      // Fill in missing metadata fields the API doesn't return
      if (data.metadata) {
        if (!data.metadata.slug) {
          data.metadata.slug = slugify(data.metadata.title);
        }
        data.metadata.publishDate = new Date().toISOString().split('T')[0];
        if (!data.metadata.gradient) {
          const cat = CATEGORY_GRADIENTS[data.metadata.category];
          data.metadata.gradient = cat
            ? { from: cat.from, to: cat.to }
            : { from: 'rose-600', to: 'red-700' };
        }
        if (!data.metadata.heroImage) data.metadata.heroImage = '';
        if (!data.metadata.heroImageAlt) data.metadata.heroImageAlt = '';
        if (!data.metadata.heroImageLight) data.metadata.heroImageLight = '';
        if (data.metadata.comingSoon === undefined) data.metadata.comingSoon = false;
      }

      setArticle(data);
      setMetadata(data.metadata);
      setState('preview');
      setStatusMessage('');

      // Save to database
      try {
        const saveRes = await fetchWithTimeout(`${API_BASE}/articles-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
          body: JSON.stringify({
            action: 'save',
            article: {
              slug: data.metadata.slug,
              title: data.metadata.title,
              description: data.metadata.description,
              category: data.metadata.category,
              tags: data.metadata.tags,
              keywords: data.metadata.keywords || [],
              gradient_from: data.metadata.gradient?.from || 'rose-600',
              gradient_to: data.metadata.gradient?.to || 'red-700',
              featured: data.metadata.featured,
              coming_soon: false,
              read_time: data.metadata.readTime,
              publish_date: data.metadata.publishDate,
              hero_image: data.metadata.heroImage || null,
              hero_image_alt: data.metadata.heroImageAlt || null,
              hero_image_light: data.metadata.heroImageLight || null,
              article_html: data.html,
              toc: data.toc,
              source_text: sourceText.slice(0, 50000),
              status: 'draft',
            }
          }),
        });
        if (!saveRes.ok) throw new Error(`DB save returned ${saveRes.status}`);
      } catch {
        // Non-blocking — don't fail if DB save fails, article is still in local state
        setStatusMessage('Note: could not save to database, but article is available locally.');
      }

      // Auto-generate editorial illustration
      try {
        setStatusMessage('Generating editorial illustration...');
        const illustrationRes = await fetchWithTimeout(`${API_BASE}/generate-illustration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generate',
            slug: data.metadata.slug,
            title: data.metadata.title,
            description: data.metadata.description,
            category: data.metadata.category,
          }),
        });
        if (illustrationRes.ok) {
          const illustrationData = await illustrationRes.json();
          if (illustrationData.imageUrl || illustrationData.darkUrl) {
            data.metadata.heroImage = illustrationData.imageUrl || illustrationData.darkUrl || '';
            data.metadata.heroImageAlt = illustrationData.heroImageAlt || `Editorial illustration for ${data.metadata.title}`;
            data.metadata.heroImageLight = illustrationData.lightUrl || '';
            setMetadata({ ...data.metadata });
          }
        }
        setStatusMessage('');
      } catch {
        // Non-blocking — illustration generation failed but article is still usable
        setStatusMessage('Illustration generation failed. You can retry from the dashboard.');
      }

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

      // Save draft immediately (include initial chat + snapshot so refresh doesn't lose them)
      const initialChat: ChatMessage[] = [{
        role: 'assistant',
        content: `Article generated: "${data.metadata.title}" (${data.metadata.readTime} min read, ${wordCount(data.html)} words).\n\nYou can refine it using the chat or quick actions below, edit the metadata on the left, or publish when ready.`,
        timestamp: Date.now(),
      }];
      const initialSnaps: ArticleSnapshot[] = [{
        article: data, metadata: data.metadata, label: 'Initial generation', timestamp: Date.now(),
      }];
      saveDraft({
        state: 'preview', sourceText, article: data, metadata: data.metadata,
        chatMessages: initialChat, snapshots: initialSnaps,
      });
    } catch (err: unknown) {
      timers.forEach(clearTimeout);
      if (err instanceof Error && err.name === 'AbortError') return;
      setState('upload');
      setError(err instanceof Error ? err.message : 'Generation failed. Try a shorter document.');
      setStatusMessage('');
    } finally {
      abortRef.current = null;
    }
  }, [sourceText, sourceFormat, API_BASE]);

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
      const res = await fetchWithTimeout(`${API_BASE}/refine-article`, {
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

      // Save refined content to database
      try {
        const m = data.metadata || metadata;
        if (m) {
          const syncRes = await fetchWithTimeout(`${API_BASE}/articles-api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
            body: JSON.stringify({
              action: 'save',
              article: { slug: m.slug, article_html: data.html }
            }),
          });
          if (!syncRes.ok) console.warn('DB sync failed after refinement:', syncRes.status);
        }
      } catch {
        // Non-blocking — refinement succeeded even if DB sync failed
      }

      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message || 'Article updated. Check the preview.',
        timestamp: Date.now(),
      }]);
    } catch (err: unknown) {
      setChatMessages(prev => [...prev, {
        role: 'system',
        content: `Refinement failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsRefining(false);
    }
  }, [chatInput, article, metadata, chatMessages, isRefining, API_BASE]);

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
    if (metadata.description.length > 500) errors.push('Description must be under 500 characters');
    if (!metadata.category) errors.push('Category is required');
    if (metadata.tags.length === 0) errors.push('At least one tag is required');
    if (metadata.readTime <= 0) errors.push('Read time must be positive');
    return errors;
  }, [metadata]);

  // Which publish path was used (for done-state messaging)
  const [publishPath, setPublishPath] = useState<'pipeline' | 'direct' | null>(null);

  const submitToPipeline = useCallback(async () => {
    if (!article || !metadata) return;

    const errors = validateMetadata();
    if (errors.length > 0) {
      setError(`Fix before submitting: ${errors.join(', ')}`);
      setShowPublishConfirm(false);
      return;
    }

    setIsPublishing(true);
    setState('publishing');
    setShowPublishConfirm(false);
    setPublishPath('pipeline');
    setStatusMessage('Submitting to pipeline — independence review next...');

    try {
      const res = await fetchWithTimeout(`${API_BASE}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
        body: JSON.stringify({
          action: 'submit-new-article',
          articleHtml: article.html,
          title: metadata.title,
          slug: metadata.slug,
          description: metadata.description,
          category: metadata.category,
          tags: metadata.tags,
          keywords: metadata.keywords,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Pipeline submission failed');
      }

      setState('done');
      setStatusMessage('');
      clearDraft();
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Submitted to pipeline! Grok independence review → QC → publish will run automatically. Track progress on the Dashboard → Pipeline tab.`,
        timestamp: Date.now(),
      }]);
    } catch (err: unknown) {
      setState('preview');
      setError(err instanceof Error ? err.message : 'Pipeline submission failed.');
      setStatusMessage('');
    } finally {
      setIsPublishing(false);
    }
  }, [article, metadata, validateMetadata, API_BASE]);

  const publishDirectly = useCallback(async () => {
    if (!article || !metadata) return;

    const errors = validateMetadata();
    if (errors.length > 0) {
      setError(`Fix before publishing: ${errors.join(', ')}`);
      return;
    }

    if (!await ask({
      title: 'Publish directly',
      message: 'This skips independence review and QC — the article goes straight to illustration, narration, and deploy. Only use this for articles you\'ve already reviewed.',
      confirmLabel: 'Publish Now',
      danger: true,
    })) return;

    setIsPublishing(true);
    setState('publishing');
    setShowPublishConfirm(false);
    setPublishPath('direct');
    setStatusMessage('Publishing directly — generating art + narration + deploying...');

    try {
      const res = await fetchWithTimeout(`${API_BASE}/pipeline-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
        body: JSON.stringify({
          action: 'publish-direct',
          articleHtml: article.html,
          title: metadata.title,
          slug: metadata.slug,
          description: metadata.description,
          category: metadata.category,
          tags: metadata.tags,
          keywords: metadata.keywords,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Direct publish failed');
      }

      setState('done');
      setStatusMessage('');
      clearDraft();
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Published directly! Illustration and narration are generating in the background. The article will be live on the site within ~2 minutes.`,
        timestamp: Date.now(),
      }]);
    } catch (err: unknown) {
      setState('preview');
      setError(err instanceof Error ? err.message : 'Direct publish failed.');
      setStatusMessage('');
    } finally {
      setIsPublishing(false);
    }
  }, [article, metadata, validateMetadata, ask, API_BASE]);

  // ─── Metadata helpers ───────────────────────────────────────────

  const updateMetadata = useCallback((field: string, value: string | number | boolean | string[] | { from: string; to: string }) => {
    setMetadata(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      // Auto-update slug when title changes
      if (field === 'title' && typeof value === 'string' && prev.slug === slugify(prev.title)) {
        updated.slug = slugify(value);
      }
      return updated;
    });
  }, []);

  // ─── Start Over ─────────────────────────────────────────────────

  const startOver = useCallback(async () => {
    if (!await ask({ title: 'Start over', message: 'Start over? This will discard the current article.', confirmLabel: 'Discard', danger: true })) return;
    setState('upload');
    setSourceText('');
    setArticle(null);
    setMetadata(null);
    setChatMessages([]);
    setSnapshots([]);
    setError('');
    setStatusMessage('');
    setShowPublishConfirm(false);
    setPublishPath(null);
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
.hero-img{margin:0 -2rem 2rem}
.hero-img img{width:100%;height:auto;border-radius:0.5rem;aspect-ratio:16/9;object-fit:cover}
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
${metadata.heroImage ? `<div class="hero-img"><img src="${metadata.heroImage}" alt="${metadata.heroImageAlt || metadata.title}" /></div>` : ''}
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
          <div className="admin-editor-upload-panel">
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
              <input ref={fileInputRef} type="file" accept=".md,.txt,.docx" className="admin-hidden" onChange={handleFileSelect}/>
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
              Generate Article
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
                  {/* ─── Core ─── */}
                  <div className="admin-field admin-field-full">
                    <label>Title</label>
                    <input value={metadata.title} onChange={(e) => updateMetadata('title', e.target.value)}/>
                  </div>
                  <div className="admin-field admin-field-full">
                    <label>Slug</label>
                    <div className="admin-flex-center admin-gap-md">
                      <span className="admin-slug-prefix">/articles/</span>
                      <input value={metadata.slug} onChange={(e) => updateMetadata('slug', e.target.value)} className="admin-flex-1"/>
                    </div>
                  </div>
                  <div className="admin-field admin-field-full">
                    <label>Description <span style={{ fontWeight: 400, color: metadata.description.length > 160 ? 'var(--admin-red-light)' : metadata.description.length > 140 ? 'var(--admin-yellow)' : 'var(--admin-text-4)' }}>({metadata.description.length}/160)</span></label>
                    <textarea value={metadata.description} onChange={(e) => updateMetadata('description', e.target.value)} rows={3}/>
                  </div>
                  <div className="admin-field">
                    <label>Category</label>
                    <select value={metadata.category} onChange={(e) => updateMetadata('category', e.target.value)}>
                      {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="admin-field">
                    <label>Gradient</label>
                    <div className="admin-gradient-picker">
                      {GRADIENT_PRESETS.map(g => (
                        <button
                          key={g.label}
                          title={g.label}
                          className={`admin-gradient-swatch${metadata.gradient?.from === g.from ? ' active' : ''}`}
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
                  <div className="admin-field admin-field-full">
                    <label>Keywords (comma-separated)</label>
                    <input
                      value={metadata.keywords.join(', ')}
                      onChange={(e) => updateMetadata('keywords', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                      placeholder="SEO keywords for search"
                    />
                  </div>

                  {/* ─── Hero Image ─── */}
                  <div className="admin-field admin-field-full" style={{ borderTop: '1px solid var(--admin-border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ margin: 0 }}>Hero Image</label>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!metadata.slug) return;
                          setStatusMessage('Generating illustration...');
                          try {
                            const res = await fetchWithTimeout(`${API_BASE}/generate-illustration`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: 'generate',
                                slug: metadata.slug,
                                title: metadata.title,
                                description: metadata.description,
                                category: metadata.category,
                                variant: 'both',
                              }),
                            });
                            if (!res.ok) throw new Error('Failed');
                            const data = await res.json();
                            // Refresh from DB to get updated URLs
                            const getRes = await fetchWithTimeout(`${API_BASE}/articles-api`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'get', slug: metadata.slug }),
                            });
                            if (getRes.ok) {
                              const updated = await getRes.json();
                              if (updated.hero_image) updateMetadata('heroImage', updated.hero_image);
                              if (updated.hero_image_light) updateMetadata('heroImageLight', updated.hero_image_light);
                              if (updated.hero_image_alt) updateMetadata('heroImageAlt', updated.hero_image_alt);
                            }
                            setStatusMessage('Illustration generated.');
                            setTimeout(() => setStatusMessage(''), 3000);
                          } catch {
                            setError('Illustration generation failed. You can retry.');
                            setStatusMessage('');
                          }
                        }}
                        style={{ padding: '0.25rem 0.625rem', borderRadius: '4px', background: 'var(--admin-surface-3)', border: '1px solid var(--admin-border-2)', color: 'var(--admin-text-3)', fontSize: '0.625rem', fontWeight: 500, cursor: 'pointer' }}
                      >
                        Generate
                      </button>
                    </div>
                    {/* Preview */}
                    {(metadata.heroImage || metadata.heroImageLight) && (
                      <div style={{ display: 'grid', gridTemplateColumns: metadata.heroImageLight ? '1fr 1fr' : '1fr', gap: '0.375rem', marginBottom: '0.5rem', borderRadius: '6px', overflow: 'hidden' }}>
                        {metadata.heroImage && (
                          <div style={{ position: 'relative', aspectRatio: '16/10', borderRadius: '6px', overflow: 'hidden', background: '#0f0e0c', border: '1px solid var(--admin-border)' }}>
                            <img src={metadata.heroImage} alt="Dark" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.1875rem 0.375rem', fontSize: '0.5625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(0,0,0,0.7)', color: 'var(--admin-text-4)' }}>Dark</span>
                          </div>
                        )}
                        {metadata.heroImageLight && (
                          <div style={{ position: 'relative', aspectRatio: '16/10', borderRadius: '6px', overflow: 'hidden', background: '#e7e6e3', border: '1px solid var(--admin-border)' }}>
                            <img src={metadata.heroImageLight} alt="Light" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.1875rem 0.375rem', fontSize: '0.5625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(255,255,255,0.7)', color: '#57534e' }}>Light</span>
                          </div>
                        )}
                      </div>
                    )}
                    <input
                      value={metadata.heroImage || ''}
                      onChange={(e) => updateMetadata('heroImage', e.target.value)}
                      placeholder="Dark variant URL"
                      style={{ marginBottom: '0.375rem' }}
                    />
                    <input
                      value={metadata.heroImageLight || ''}
                      onChange={(e) => updateMetadata('heroImageLight', e.target.value)}
                      placeholder="Light variant URL"
                      style={{ marginBottom: '0.375rem' }}
                    />
                    <input
                      value={metadata.heroImageAlt || ''}
                      onChange={(e) => updateMetadata('heroImageAlt', e.target.value)}
                      placeholder="Alt text for hero image"
                    />
                  </div>

                  {/* ─── Flags ─── */}
                  <div className="admin-field admin-field-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', borderTop: '1px solid var(--admin-border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label className="admin-checkbox-label">
                        <input type="checkbox" checked={metadata.featured} onChange={(e) => updateMetadata('featured', e.target.checked)}/>
                        Featured
                      </label>
                      <label className="admin-checkbox-label">
                        <input type="checkbox" checked={metadata.comingSoon} onChange={(e) => updateMetadata('comingSoon', e.target.checked)}/>
                        Coming Soon
                      </label>
                    </div>
                    <span className="admin-text-sm admin-color-subtle">{metadata.readTime} min read &middot; {wordCount(article?.html || '')} words</span>
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
            {error && <div className="admin-error admin-error-inset">{error}</div>}

            {/* Publish Bar */}
            <div className="admin-publish-bar">
              <div className="admin-flex-center admin-gap-lg">
                <div className="admin-status" title={validationErrors.length > 0 ? validationErrors.join('\n') : undefined} style={{ cursor: validationErrors.length > 0 ? 'help' : 'default' }}>
                  <span className={`admin-status-dot ${
                    state === 'done' ? 'admin-status-dot-ready' :
                    state === 'publishing' ? 'admin-status-dot-processing' :
                    validationErrors.length > 0 ? 'admin-status-dot-error' :
                    'admin-status-dot-ready'
                  }`}/>
                  {state === 'done' ? (publishPath === 'direct' ? 'Published' : 'In Pipeline') :
                   state === 'publishing' ? (publishPath === 'direct' ? 'Publishing...' : 'Submitting...') :
                   validationErrors.length > 0 ? validationErrors[0] :
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
                <div className="admin-flex admin-gap-md">
                  {publishPath === 'direct' ? (
                    <a href={`/articles/${metadata?.slug}`} target="_blank" rel="noopener" className="admin-publish-btn admin-publish-btn-view">
                      View Article
                    </a>
                  ) : (
                    <a href="/admin#pipeline" className="admin-publish-btn admin-publish-btn-view">
                      Track in Pipeline
                    </a>
                  )}
                  <button onClick={startOver} className="admin-publish-btn admin-publish-btn-dark">
                    New Article
                  </button>
                </div>
              ) : showPublishConfirm ? (
                <div className="admin-flex-center admin-gap-md">
                  <span className="admin-text-base admin-color-secondary">Submit to pipeline?</span>
                  <button className="admin-publish-btn" onClick={submitToPipeline} disabled={isPublishing}>
                    {isPublishing ? 'Submitting...' : 'Confirm'}
                  </button>
                  <button className="admin-cancel-btn admin-cancel-btn-compact" onClick={() => setShowPublishConfirm(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="admin-flex admin-gap-md" style={{ alignItems: 'center' }}>
                  <button
                    className="admin-publish-btn"
                    onClick={() => setShowPublishConfirm(true)}
                    disabled={isPublishing || validationErrors.length > 0}
                    title="Independence review → QC → publish"
                  >
                    Submit to Pipeline
                  </button>
                  <button
                    onClick={publishDirectly}
                    disabled={isPublishing || validationErrors.length > 0}
                    title="Skip editorial review — art + narration + deploy"
                    style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--admin-green-light)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap', opacity: isPublishing || validationErrors.length > 0 ? 0.4 : 1 }}
                  >
                    Publish Now
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── Right Panel — Preview ─── */}
      <div className="admin-editor-right">
        {state === 'upload' && (
          <div className="admin-preview-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="admin-preview-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            Upload a source document to preview
          </div>
        )}
        {state === 'processing' && (
          <div className="admin-preview-empty">
            <div className="admin-spinner admin-preview-spinner"/>
            Generating article...
          </div>
        )}
        {(state === 'preview' || state === 'publishing' || state === 'done') && article && (
          <iframe className="admin-preview-frame" srcDoc={previewHtml} title="Article Preview"/>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}
