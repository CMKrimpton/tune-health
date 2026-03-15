import { useState, useCallback, useRef } from 'react';
import type { FormEvent, DragEvent, ChangeEvent } from 'react';

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
  role: 'user' | 'assistant';
  content: string;
}

type EditorState = 'upload' | 'processing' | 'preview' | 'publishing' | 'done';

const EDGE_FUNCTION_BASE = import.meta.env.PUBLIC_SUPABASE_URL
  ? `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`
  : '';

const CATEGORY_OPTIONS = [
  'Mental Health', 'Neuroscience', 'Nutrition', 'Longevity',
  'Fitness', 'Sleep Science', 'Clinical Evidence', 'Research Summary',
  'Environmental Health', 'Pharmacology',
];

const GRADIENT_PRESETS = [
  { from: 'rose-600', to: 'red-700', label: 'Rose' },
  { from: 'violet-600', to: 'purple-700', label: 'Violet' },
  { from: 'emerald-500', to: 'teal-600', label: 'Emerald' },
  { from: 'emerald-600', to: 'teal-700', label: 'Deep Emerald' },
  { from: 'amber-500', to: 'orange-600', label: 'Amber' },
  { from: 'sky-500', to: 'blue-600', label: 'Sky' },
  { from: 'indigo-500', to: 'purple-600', label: 'Indigo' },
  { from: 'lime-500', to: 'green-600', label: 'Lime' },
];

export default function ArticleEditor() {
  const [state, setState] = useState<EditorState>('upload');
  const [sourceText, setSourceText] = useState('');
  const [sourceFormat, setSourceFormat] = useState<'markdown' | 'text' | 'html'>('markdown');
  const [article, setArticle] = useState<GeneratedArticle | null>(null);
  const [metadata, setMetadata] = useState<ArticleMetadata | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // File parsing
  const parseFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'md' || ext === 'txt') {
      const text = await file.text();
      setSourceText(text);
      setSourceFormat('markdown');
    } else if (ext === 'docx') {
      try {
        const mammoth = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setSourceText(result.value);
        setSourceFormat('html');
      } catch {
        setError('Failed to parse DOCX file. Try pasting the text instead.');
        return;
      }
    } else if (ext === 'pdf') {
      setError('PDF parsing coming soon. Please paste the text or convert to markdown.');
      return;
    } else {
      setError(`Unsupported file type: .${ext}`);
      return;
    }

    setError('');
  }, []);

  // Drag and drop handlers
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

  // Process article
  const processArticle = useCallback(async () => {
    if (!sourceText.trim()) {
      setError('Please provide source text or upload a file.');
      return;
    }

    setState('processing');
    setError('');
    setStatusMessage('Sending to Claude 4.6 for processing...');

    try {
      const adminToken = document.cookie
        .split('; ')
        .find(c => c.startsWith('admin_token='))
        ?.split('=')[1];

      const res = await fetch(`${EDGE_FUNCTION_BASE}/process-article`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          sourceText,
          sourceFormat,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Processing failed (${res.status})`);
      }

      const data = await res.json();
      setArticle(data);
      setMetadata(data.metadata);
      setState('preview');
      setStatusMessage('');
      setChatMessages([{
        role: 'assistant',
        content: `Article generated: "${data.metadata.title}" (${data.metadata.readTime} min read). You can refine it by chatting below, edit the metadata, or publish when ready.`,
      }]);
    } catch (err: any) {
      setState('upload');
      setError(err.message || 'Failed to process article.');
      setStatusMessage('');
    }
  }, [sourceText, sourceFormat]);

  // Refine article via chat
  const refineArticle = useCallback(async () => {
    if (!chatInput.trim() || !article) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsRefining(true);

    try {
      const adminToken = document.cookie
        .split('; ')
        .find(c => c.startsWith('admin_token='))
        ?.split('=')[1];

      const res = await fetch(`${EDGE_FUNCTION_BASE}/refine-article`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          currentHtml: article.html,
          currentMetadata: metadata,
          messages: chatMessages,
          instruction: userMessage,
        }),
      });

      if (!res.ok) throw new Error('Refinement failed');

      const data = await res.json();
      setArticle(data);
      if (data.metadata) setMetadata(data.metadata);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message || 'Article updated. Check the preview.',
      }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message}. Try again.`,
      }]);
    } finally {
      setIsRefining(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [chatInput, article, metadata, chatMessages]);

  // Publish article
  const publishArticle = useCallback(async () => {
    if (!article || !metadata) return;

    setIsPublishing(true);
    setState('publishing');
    setStatusMessage('Committing to GitHub...');

    try {
      const adminToken = document.cookie
        .split('; ')
        .find(c => c.startsWith('admin_token='))
        ?.split('=')[1];

      // Assemble the .astro file
      const astroContent = assembleAstroFile(article, metadata);

      const res = await fetch(`${EDGE_FUNCTION_BASE}/publish-article`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
        },
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

      if (!res.ok) throw new Error('Publish failed');

      setState('done');
      setStatusMessage('');
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Published! The article is being deployed to Vercel. It should be live at /articles/${metadata.slug} within ~60 seconds.`,
      }]);
    } catch (err: any) {
      setState('preview');
      setError(err.message || 'Failed to publish.');
      setStatusMessage('');
    } finally {
      setIsPublishing(false);
    }
  }, [article, metadata]);

  // Metadata update helper
  const updateMetadata = useCallback((field: string, value: any) => {
    setMetadata(prev => prev ? { ...prev, [field]: value } : prev);
  }, []);

  // Build preview HTML
  const getPreviewHtml = useCallback(() => {
    if (!article) return '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600&family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Crimson Pro', serif;
      color: #1b1a18;
      background: #e7e6e3;
      padding: 2rem;
      max-width: 720px;
      margin: 0 auto;
      font-size: 1.125rem;
      line-height: 1.8;
    }
    h1, h2, h3 { font-family: 'Playfair Display', serif; margin: 2rem 0 1rem; }
    h1 { font-size: 2.25rem; }
    h2 { font-size: 1.5rem; }
    h3 { font-size: 1.25rem; }
    p { margin-bottom: 1rem; }
    ul, ol { margin: 1rem 0; padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; }
    strong { font-weight: 600; }
    em { font-style: italic; }
    .pull-quote {
      border-left: 3px solid #dc2626;
      padding: 1rem 1.5rem;
      margin: 2rem 0;
      background: rgba(220, 38, 38, 0.05);
      font-style: italic;
      font-size: 1.2rem;
    }
    .info-card {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin: 2rem 0;
    }
    .info-card h4 {
      font-family: 'Playfair Display', serif;
      font-size: 1.125rem;
      color: #b91c1c;
      margin-bottom: 0.75rem;
    }
    .info-card ul { font-size: 0.875rem; }
    .preview-hero {
      text-align: center;
      padding: 2rem 0 3rem;
      border-bottom: 1px solid #d6d3d1;
      margin-bottom: 2rem;
    }
    .preview-category {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: #fef2f2;
      color: #dc2626;
      border-radius: 1rem;
      font-family: 'Inter', sans-serif;
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    .preview-meta {
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      color: #78716c;
      margin-top: 0.75rem;
    }
    .preview-svg { margin: 0 -2rem 2rem; }
    .preview-svg svg { width: 100%; height: auto; border-radius: 0.5rem; }
    section { margin-bottom: 1.5rem; }
  </style>
</head>
<body>
  <div class="preview-hero">
    <span class="preview-category">${metadata?.category || ''}</span>
    <h1>${metadata?.title || ''}</h1>
    <p style="color: #78716c; font-size: 1rem;">${metadata?.description || ''}</p>
    <div class="preview-meta">${metadata?.readTime || 0} min read &middot; alumi news Editorial</div>
  </div>
  ${article.svg ? `<div class="preview-svg">${article.svg}</div>` : ''}
  <div class="article-content">
    ${article.html}
  </div>
</body>
</html>`;
  }, [article, metadata]);

  return (
    <div className="admin-editor-layout">
      {/* Left Panel - Upload / Chat */}
      <div className="admin-editor-left">
        {state === 'upload' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
            {/* Upload Zone */}
            <div
              className={`admin-upload-zone${dragOver ? ' dragover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="admin-upload-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="admin-upload-title">Drop a source document</div>
              <div className="admin-upload-subtitle">.md, .docx, or .txt</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.docx"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            {/* Or paste text */}
            <div style={{ margin: '1rem 0', textAlign: 'center', fontSize: '0.75rem', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              or paste text below
            </div>

            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste your source document text here..."
              style={{
                width: '100%',
                minHeight: '300px',
                padding: '1rem',
                background: '#292524',
                border: '1px solid #44403c',
                borderRadius: '0.5rem',
                color: '#e7e6e3',
                fontFamily: "'Inter', sans-serif",
                fontSize: '0.875rem',
                lineHeight: '1.6',
                resize: 'vertical',
                outline: 'none',
              }}
            />

            {error && (
              <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: '0.5rem', fontSize: '0.8125rem', color: '#fecaca' }}>
                {error}
              </div>
            )}

            <button
              onClick={processArticle}
              disabled={!sourceText.trim()}
              className="admin-new-article-btn"
              style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Generate Article with Claude 4.6
            </button>
          </div>
        )}

        {state === 'processing' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
            <div className="admin-spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Processing Article</div>
              <div style={{ fontSize: '0.8125rem', color: '#a8a29e' }}>{statusMessage}</div>
            </div>
          </div>
        )}

        {(state === 'preview' || state === 'publishing' || state === 'done') && (
          <>
            {/* Metadata Panel */}
            <div className="admin-metadata">
              <div className="admin-metadata-title" onClick={() => setMetadataOpen(!metadataOpen)}>
                Article Metadata
                <span>{metadataOpen ? '−' : '+'}</span>
              </div>
              {metadataOpen && metadata && (
                <div className="admin-metadata-grid">
                  <div className="admin-field admin-field-full">
                    <label>Title</label>
                    <input
                      value={metadata.title}
                      onChange={(e) => updateMetadata('title', e.target.value)}
                    />
                  </div>
                  <div className="admin-field admin-field-full">
                    <label>Slug</label>
                    <input
                      value={metadata.slug}
                      onChange={(e) => updateMetadata('slug', e.target.value)}
                    />
                  </div>
                  <div className="admin-field admin-field-full">
                    <label>Description</label>
                    <textarea
                      value={metadata.description}
                      onChange={(e) => updateMetadata('description', e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="admin-field">
                    <label>Category</label>
                    <select
                      value={metadata.category}
                      onChange={(e) => updateMetadata('category', e.target.value)}
                    >
                      {CATEGORY_OPTIONS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-field">
                    <label>Gradient</label>
                    <select
                      value={`${metadata.gradient.from}|${metadata.gradient.to}`}
                      onChange={(e) => {
                        const [from, to] = e.target.value.split('|');
                        updateMetadata('gradient', { from, to });
                      }}
                    >
                      {GRADIENT_PRESETS.map(g => (
                        <option key={g.label} value={`${g.from}|${g.to}`}>{g.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-field admin-field-full">
                    <label>Tags (comma-separated)</label>
                    <input
                      value={metadata.tags.join(', ')}
                      onChange={(e) => updateMetadata('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                    />
                  </div>
                  <div className="admin-field">
                    <label>
                      <input
                        type="checkbox"
                        checked={metadata.featured}
                        onChange={(e) => updateMetadata('featured', e.target.checked)}
                        style={{ marginRight: '0.5rem' }}
                      />
                      Featured Article
                    </label>
                  </div>
                  <div className="admin-field">
                    <label>Read Time: {metadata.readTime} min</label>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Interface */}
            <div className="admin-chat">
              <div className="admin-chat-messages">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`admin-chat-message admin-chat-message-${msg.role}`}>
                    {msg.content}
                  </div>
                ))}
                {isRefining && (
                  <div className="admin-chat-message admin-chat-message-assistant">
                    <div className="admin-spinner" />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="admin-chat-input-area">
                <input
                  type="text"
                  className="admin-chat-input"
                  placeholder={state === 'done' ? 'Article published!' : 'Refine the article... (e.g., "make the intro punchier")'}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && refineArticle()}
                  disabled={isRefining || state === 'done'}
                />
                <button
                  className="admin-chat-send"
                  onClick={refineArticle}
                  disabled={isRefining || !chatInput.trim() || state === 'done'}
                >
                  Send
                </button>
              </div>
            </div>

            {/* Publish Bar */}
            <div className="admin-publish-bar">
              <div className="admin-status">
                <span className={`admin-status-dot ${
                  state === 'done' ? 'admin-status-dot-ready' :
                  state === 'publishing' ? 'admin-status-dot-processing' :
                  'admin-status-dot-idle'
                }`} />
                {state === 'done' ? 'Published' :
                 state === 'publishing' ? 'Publishing...' :
                 'Ready to publish'}
              </div>
              {state === 'done' ? (
                <a
                  href={`/articles/${metadata?.slug}`}
                  target="_blank"
                  className="admin-publish-btn"
                  style={{ background: '#16a34a', textDecoration: 'none', color: 'white' }}
                >
                  View Article &rarr;
                </a>
              ) : (
                <button
                  className="admin-publish-btn"
                  onClick={publishArticle}
                  disabled={isPublishing || state === 'done'}
                >
                  {isPublishing && <div className="admin-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />}
                  {isPublishing ? 'Publishing...' : 'Publish to GitHub'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right Panel - Preview */}
      <div className="admin-editor-right">
        {state === 'upload' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#78716c', fontFamily: "'Inter', sans-serif", fontSize: '0.875rem' }}>
            Upload a source document to see the preview
          </div>
        )}
        {state === 'processing' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#78716c', fontFamily: "'Inter', sans-serif", fontSize: '0.875rem' }}>
            Generating article...
          </div>
        )}
        {(state === 'preview' || state === 'publishing' || state === 'done') && article && (
          <iframe
            className="admin-preview-frame"
            srcDoc={getPreviewHtml()}
            title="Article Preview"
          />
        )}
      </div>
    </div>
  );
}

// Assemble the complete .astro file for publishing
function assembleAstroFile(article: GeneratedArticle, metadata: ArticleMetadata): string {
  const today = new Date();
  const publishDate = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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
