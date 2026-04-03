import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { fetchWithTimeout, timeAgo, getAdminToken, CATEGORY_GRADIENTS } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Social Dashboard — Bloomberg Terminal-Inspired
// Data-dense, real-time, zero wasted space, bulletproof error handling
// ═══════════════════════════════════════════════════════════════════════════

interface Props {
  apiBase: string;
}

// ─── Types ───────────────────────────────────────────────────────────────

interface SocialStats {
  totalPosts: number;
  postedToday: number;
  queueSize: number;
  draftCount: number;
  failedToday: number;
  avgEngagement: number;
  todayCost: number;
  activePlatforms: number;
  platformBreakdown: Record<string, { posted: number; scheduled: number; failed: number; draft: number }>;
}

interface SocialPost {
  id: string;
  article_slug: string | null;
  platform: string;
  persona: string;
  content_type: string;
  content_format: string;
  content_text: string;
  content_meta: Record<string, unknown>;
  status: string;
  error: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  platform_url: string | null;
  impressions: number;
  likes: number;
  shares: number;
  comments: number;
  clicks: number;
  engagement_score: number;
  series_tag: string | null;
  cost_usd: number;
  created_at: string;
  choreography_group: string | null;
  timing_offset_minutes: number;
  retry_count: number;
}

interface ContentPlan {
  id: string;
  plan_date: string;
  platform: string;
  content_type: string;
  content_format: string;
  article_slug: string | null;
  persona: string;
  desk: string;
  brief: Record<string, unknown>;
  status: string;
  series_tag: string | null;
  created_at: string;
}

interface PlatformHealth {
  platform: string;
  tier: number;
  desk: string;
  api_configured: boolean;
  rate_limit_per_hour: number;
  daily_post_target: number;
  content_formats: string[];
  active: boolean;
  lastPostAt: string | null;
  todayPosted: number;
}

interface Arc {
  id: string;
  week_start: string;
  theme: string;
  description: string | null;
  category_focus: string | null;
  article_slugs: string[];
  recurring_series: Record<string, string>;
  status: string;
}

interface Persona {
  id: string;
  display_name: string;
  bio: string;
  voice_prompt: string;
  model_override: string | null;
  platforms: string[];
  active: boolean;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  exiting?: boolean;
}

// ─── Platform Visual Config ──────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, { icon: string; color: string; abbr: string }> = {
  bluesky:    { icon: '🦋', color: '#0085ff', abbr: 'BSK' },
  reddit:     { icon: '🔴', color: '#ff4500', abbr: 'RDT' },
  mastodon:   { icon: '🐘', color: '#6364ff', abbr: 'MST' },
  threads:    { icon: '📎', color: '#000000', abbr: 'THR' },
  linkedin:   { icon: '💼', color: '#0a66c2', abbr: 'LIN' },
  telegram:   { icon: '✈️', color: '#26a5e4', abbr: 'TLG' },
  medium:     { icon: '📝', color: '#00ab6c', abbr: 'MED' },
  pinterest:  { icon: '📌', color: '#e60023', abbr: 'PIN' },
  newsletter: { icon: '📨', color: '#f59e0b', abbr: 'NWS' },
  x:          { icon: '𝕏', color: '#ffffff', abbr: 'X' },
  quora:      { icon: '❓', color: '#b92b27', abbr: 'QRA' },
  hackernews: { icon: '🟧', color: '#ff6600', abbr: 'HN' },
  instagram:  { icon: '📷', color: '#e4405f', abbr: 'IG' },
  whatsapp:   { icon: '💬', color: '#25d366', abbr: 'WA' },
};

const PERSONA_COLORS: Record<string, string> = {
  brand: '#ef4444',
  reporter: '#3b82f6',
  skeptic: '#f59e0b',
  curator: '#a78bfa',
};

const STATUS_COLORS: Record<string, string> = {
  draft: '#7d7871',
  scheduled: '#3b82f6',
  posting: '#f59e0b',
  posted: '#22c55e',
  failed: '#ef4444',
  skipped: '#5c5752',
  planned: '#7d7871',
  generating: '#f59e0b',
  generated: '#22c55e',
};

type SectionId = 'overview' | 'posts' | 'plan' | 'platforms' | 'setup';
const SECTIONS: { id: SectionId; label: string; shortcut: string }[] = [
  { id: 'overview', label: 'Overview', shortcut: '1' },
  { id: 'posts', label: 'Post Feed', shortcut: '2' },
  { id: 'plan', label: 'Content Plan', shortcut: '3' },
  { id: 'platforms', label: 'Platforms', shortcut: '4' },
  { id: 'setup', label: 'Setup', shortcut: '5' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '\u2026';
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Styles ──────────────────────────────────────────────────────────────

const S = {
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' } as React.CSSProperties,
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' } as React.CSSProperties,
  panel: {
    background: 'var(--admin-surface)',
    border: '1px solid var(--admin-border)',
    borderRadius: 'var(--admin-radius)',
    overflow: 'hidden',
    transition: 'border-color 0.2s var(--admin-ease)',
  } as React.CSSProperties,
  panelHeader: {
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid var(--admin-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  } as React.CSSProperties,
  panelTitle: {
    fontSize: '0.625rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'var(--admin-text-2)',
  } as React.CSSProperties,
  panelBody: {
    padding: '0.5rem 0.75rem',
    maxHeight: '480px',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.375rem 0',
    borderBottom: '1px solid var(--admin-border)',
    fontSize: '0.75rem',
    minHeight: '32px',
  } as React.CSSProperties,
  mono: {
    fontFamily: 'var(--admin-mono)',
    fontSize: '0.6875rem',
    fontVariantNumeric: 'tabular-nums',
  } as React.CSSProperties,
  pill: (color: string, bg?: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '0.5625rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color,
    background: bg || `${color}18`,
    whiteSpace: 'nowrap' as const,
    lineHeight: '16px',
  } as React.CSSProperties),
  btn: (accent = false) => ({
    padding: '3px 8px',
    fontSize: '0.625rem',
    fontWeight: 600,
    border: accent ? 'none' : '1px solid var(--admin-border-2)',
    borderRadius: 'var(--admin-radius-xs)',
    background: accent ? 'var(--admin-accent)' : 'var(--admin-surface-2)',
    color: accent ? '#fff' : 'var(--admin-text-2)',
    cursor: 'pointer',
    transition: 'all 0.15s var(--admin-ease)',
    fontFamily: 'inherit',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties),
  microLabel: {
    fontSize: '0.5rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    color: 'var(--admin-text-4)',
    lineHeight: '1',
  } as React.CSSProperties,
} as const;

// ─── Toast System ────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: '0.5rem',
        pointerEvents: 'none',
        maxWidth: '340px',
      }}
    >
      {toasts.map(toast => {
        const borderColor = toast.type === 'success' ? '#22c55e' : toast.type === 'error' ? '#ef4444' : '#3b82f6';
        const iconColor = borderColor;
        const icon = toast.type === 'success' ? '\u2713' : toast.type === 'error' ? '\u2717' : '\u2139';
        return (
          <div
            key={toast.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              background: 'var(--admin-surface)',
              border: `1px solid ${borderColor}40`,
              borderLeft: `3px solid ${borderColor}`,
              borderRadius: 'var(--admin-radius)',
              padding: '0.5rem 0.75rem',
              fontSize: '0.6875rem',
              color: 'var(--admin-text)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: `0 4px 20px rgba(0,0,0,0.3), 0 0 15px ${borderColor}15`,
              backdropFilter: 'blur(12px)',
              animation: toast.exiting
                ? 'toast-exit 0.2s var(--admin-ease) forwards'
                : 'toast-enter 0.25s var(--admin-ease)',
            }}
          >
            <span style={{ color: iconColor, fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>{icon}</span>
            <span style={{ flex: 1, lineHeight: '1.4' }}>{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--admin-text-4)',
                cursor: 'pointer',
                padding: '2px',
                fontSize: '0.75rem',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              \u00d7
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeleton Loaders ────────────────────────────────────────────────────

function SkeletonPulse({ width, height = '12px', style }: { width: string; height?: string; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: '3px',
        background: 'linear-gradient(90deg, var(--admin-surface-2) 25%, var(--admin-surface-3) 50%, var(--admin-surface-2) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        ...style,
      }}
    />
  );
}

function SkeletonRow() {
  return (
    <div style={{ ...S.row, gap: '0.5rem' }} aria-hidden="true">
      <SkeletonPulse width="48px" height="16px" />
      <SkeletonPulse width="40px" height="16px" />
      <SkeletonPulse width="200px" height="12px" style={{ flex: 1 }} />
      <SkeletonPulse width="56px" height="16px" />
    </div>
  );
}

function SkeletonStatStrip() {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius)', overflow: 'hidden', marginBottom: '0.75rem' }} aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ flex: 1, padding: '0.625rem 0.875rem', borderRight: '1px solid var(--admin-border)', background: 'var(--admin-surface)' }}>
          <SkeletonPulse width="60px" height="20px" />
          <SkeletonPulse width="48px" height="8px" style={{ marginTop: '4px' }} />
        </div>
      ))}
    </div>
  );
}

// ─── Sparkline ───────────────────────────────────────────────────────────

function Sparkline({ data, color, width = 64, height = 20 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 2) - 1}`).join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 2px ${color}60)` }}
      />
    </svg>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function PlatformBadge({ platform, compact }: { platform: string; compact?: boolean }) {
  const cfg = PLATFORM_ICONS[platform] || { icon: '?', color: '#7d7871', abbr: platform.slice(0, 3).toUpperCase() };
  return (
    <span
      style={{ ...S.pill(cfg.color), gap: '3px', background: `${cfg.color}15` }}
      role="img"
      aria-label={platform}
    >
      <span style={{ fontSize: compact ? '0.5rem' : '0.625rem' }} aria-hidden="true">{cfg.icon}</span>
      {!compact && <span>{cfg.abbr}</span>}
    </span>
  );
}

function PersonaBadge({ persona }: { persona: string }) {
  const color = PERSONA_COLORS[persona] || '#7d7871';
  return <span style={S.pill(color)} aria-label={`Persona: ${persona}`}>{persona}</span>;
}

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#7d7871';
  const isActive = status === 'posting' || status === 'generating';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} role="status" aria-label={`Status: ${status}`}>
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          boxShadow: isActive ? `0 0 6px ${color}80` : 'none',
          animation: isActive ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
        }}
        aria-hidden="true"
      />
      <span style={{ fontSize: '0.625rem', color, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{status}</span>
    </span>
  );
}

function EngagementMini({ post }: { post: SocialPost }) {
  const total = post.likes + post.shares + post.comments;
  if (total === 0 && post.status !== 'posted') return null;
  return (
    <span style={{ ...S.mono, color: 'var(--admin-text-3)', display: 'flex', gap: '6px', alignItems: 'center' }} aria-label={`${post.likes} likes, ${post.shares} shares, ${post.comments} comments`}>
      {post.likes > 0 && <span aria-hidden="true" title="Likes">♥ {formatNum(post.likes)}</span>}
      {post.shares > 0 && <span aria-hidden="true" title="Shares">↗ {formatNum(post.shares)}</span>}
      {post.comments > 0 && <span aria-hidden="true" title="Comments">💬 {formatNum(post.comments)}</span>}
      {post.impressions > 0 && <span aria-hidden="true" title="Impressions" style={{ color: 'var(--admin-text-4)' }}>👁 {formatNum(post.impressions)}</span>}
    </span>
  );
}

// ─── Action Button ───────────────────────────────────────────────────────

function ActionBtn({
  onClick,
  label,
  ariaLabel,
  accent = false,
  disabled = false,
  loading = false,
  danger = false,
  style: extraStyle,
}: {
  onClick: () => void;
  label: string;
  ariaLabel: string;
  accent?: boolean;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  style?: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const base = S.btn(accent);
  const hoverBg = danger
    ? 'rgba(239, 68, 68, 0.15)'
    : accent
      ? 'var(--admin-accent)'
      : 'var(--admin-surface-3)';
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...base,
        opacity: disabled ? 0.4 : 1,
        background: hover && !disabled ? hoverBg : base.background,
        color: danger && hover ? '#f87171' : base.color,
        borderColor: danger && hover ? 'rgba(239, 68, 68, 0.3)' : undefined,
        ...extraStyle,
      }}
    >
      {loading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block' }} aria-hidden="true">⟳</span>
          <span>{label}</span>
        </span>
      ) : label}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function SocialDashboard({ apiBase }: Props) {
  const [stats, setStats] = useState<SocialStats | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [plan, setPlan] = useState<ContentPlan[]>([]);
  const [platforms, setPlatforms] = useState<PlatformHealth[]>([]);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [postFilter, setPostFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [generating, setGenerating] = useState(false);
  const [generateSlug, setGenerateSlug] = useState('');
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [setupData, setSetupData] = useState<Record<string, unknown> | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [actionFeedback, setActionFeedback] = useState<Record<string, 'success' | 'error'>>({});
  const slugInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Toast Management ─────────────────────────────────────────────────

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = uid();
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 250);
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 250);
  }, []);

  // ─── Data Fetching ───────────────────────────────────────────────────

  const fetchAll = useCallback(async (silent = false) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const [statsRes, postsRes, planRes, platformsRes, arcsRes, personasRes] = await Promise.all([
        fetchWithTimeout(`${apiBase}/social-admin`, { method: 'POST', headers, body: JSON.stringify({ action: 'status' }) }),
        fetchWithTimeout(`${apiBase}/social-admin`, { method: 'POST', headers, body: JSON.stringify({ action: 'posts', limit: 100 }) }),
        fetchWithTimeout(`${apiBase}/social-admin`, { method: 'POST', headers, body: JSON.stringify({ action: 'plan' }) }),
        fetchWithTimeout(`${apiBase}/social-admin`, { method: 'POST', headers, body: JSON.stringify({ action: 'platforms' }) }),
        fetchWithTimeout(`${apiBase}/social-admin`, { method: 'POST', headers, body: JSON.stringify({ action: 'arcs' }) }),
        fetchWithTimeout(`${apiBase}/social-admin`, { method: 'POST', headers, body: JSON.stringify({ action: 'personas' }) }),
      ]);

      let errors = 0;
      if (statsRes.ok) setStats(await statsRes.json()); else errors++;
      if (postsRes.ok) { const d = await postsRes.json(); setPosts(d.posts || []); } else errors++;
      if (planRes.ok) { const d = await planRes.json(); setPlan(d.plan || []); } else errors++;
      if (platformsRes.ok) { const d = await platformsRes.json(); setPlatforms(d.platforms || []); } else errors++;
      if (arcsRes.ok) { const d = await arcsRes.json(); setArcs(d.arcs || []); } else errors++;
      if (personasRes.ok) { const d = await personasRes.json(); setPersonas(d.personas || []); } else errors++;

      setLastRefresh(new Date());
      if (errors > 0 && !silent) {
        addToast(`${errors} endpoint${errors > 1 ? 's' : ''} failed to respond`, 'error');
      }
    } catch (err) {
      console.error('[SocialDashboard] Fetch error:', err);
      if (!silent) addToast('Failed to connect to social API', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiBase, addToast]);

  useEffect(() => {
    fetchAll(true);
    const interval = setInterval(() => fetchAll(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ─── Keyboard Shortcuts ───────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Number keys 1-5 for tab switching
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= SECTIONS.length) {
        e.preventDefault();
        const section = SECTIONS[num - 1];
        setActiveSection(section.id);
        if (section.id === 'setup') fetchSetup();
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        fetchAll();
        addToast('Refreshing all data\u2026', 'info');
        return;
      }

      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        slugInputRef.current?.focus();
        return;
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [fetchAll, addToast]);

  // ─── Actions ─────────────────────────────────────────────────────────

  const skipPost = async (postId: string) => {
    // Optimistic update
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'skipped' } : p));
    try {
      const res = await fetchWithTimeout(`${apiBase}/social-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip', postId }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      addToast('Post skipped', 'success');
      fetchAll(true);
    } catch (err) {
      // Revert optimistic update
      fetchAll(true);
      addToast(`Failed to skip post: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  };

  const retryPost = async (postId: string) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'scheduled' } : p));
    try {
      const res = await fetchWithTimeout(`${apiBase}/social-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', postId }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      addToast('Post queued for retry', 'success');
      fetchAll(true);
    } catch (err) {
      fetchAll(true);
      addToast(`Retry failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  };

  const generateForArticle = async () => {
    if (!generateSlug.trim()) return;
    setGenerating(true);
    const slug = generateSlug.trim();
    try {
      const res = await fetchWithTimeout(`${apiBase}/social-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', slug }),
        timeout: 120_000,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      setGenerateSlug('');
      addToast(`Social content generated for "${slug}"`, 'success');
      fetchAll(true);
    } catch (err) {
      addToast(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const runAction = async (action: string) => {
    const label = action.replace('run-', '');
    setRunningAction(action);
    try {
      const res = await fetchWithTimeout(`${apiBase}/social-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
        timeout: 120_000,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      setActionFeedback(prev => ({ ...prev, [action]: 'success' }));
      addToast(`${label.charAt(0).toUpperCase() + label.slice(1)} completed successfully`, 'success');
      fetchAll(true);
    } catch (err) {
      setActionFeedback(prev => ({ ...prev, [action]: 'error' }));
      addToast(`${label} failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setRunningAction(null);
      // Clear feedback indicator after 3s
      setTimeout(() => setActionFeedback(prev => { const n = { ...prev }; delete n[action]; return n; }), 3000);
    }
  };

  const fetchSetup = async () => {
    try {
      const res = await fetchWithTimeout(`${apiBase}/social-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup-status' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSetupData(await res.json());
    } catch (err) {
      addToast(`Setup status fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  };

  // ─── Filtering ───────────────────────────────────────────────────────

  const filteredPosts = posts.filter(p => {
    if (postFilter !== 'all' && p.status !== postFilter) return false;
    if (platformFilter !== 'all' && p.platform !== platformFilter) return false;
    return true;
  });

  // ─── Stats Computed ──────────────────────────────────────────────────

  const postedByPersona: Record<string, number> = {};
  const postedByType: Record<string, number> = {};
  const engagementByDay: number[] = [];
  for (const p of posts.filter(p => p.status === 'posted')) {
    postedByPersona[p.persona] = (postedByPersona[p.persona] || 0) + 1;
    postedByType[p.content_type] = (postedByType[p.content_type] || 0) + 1;
  }

  // Build sparkline data from last 7 days of posts
  const now = Date.now();
  for (let i = 6; i >= 0; i--) {
    const dayStart = now - i * 86_400_000;
    const dayEnd = dayStart + 86_400_000;
    engagementByDay.push(
      posts.filter(p => {
        const t = new Date(p.created_at).getTime();
        return t >= dayStart && t < dayEnd && p.status === 'posted';
      }).length
    );
  }

  const currentArc = arcs.find(a => a.status === 'active') || arcs[0] || null;

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div ref={containerRef}>
      {/* Inject keyframe animations */}
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes toast-enter { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes toast-exit { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(4px) scale(0.96); } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .social-panel:hover { border-color: var(--admin-border-2) !important; }
        .social-row-hover:hover { background: var(--admin-surface-2); }
        .social-tab-hint { opacity: 0; transition: opacity 0.15s; font-size: 0.5rem; }
        .social-tab-btn:hover .social-tab-hint { opacity: 1; }
      `}</style>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ═══ Stats Strip ═══ */}
      {loading ? (
        <SkeletonStatStrip />
      ) : (
        <div
          style={{
            display: 'flex',
            border: '1px solid var(--admin-border)',
            borderRadius: 'var(--admin-radius)',
            overflow: 'hidden',
            marginBottom: '0.75rem',
            animation: 'fade-in 0.3s var(--admin-ease)',
          }}
          role="region"
          aria-label="Social media statistics"
        >
          <StatCell label="Total Posts" value={stats?.totalPosts ?? 0} sparkData={engagementByDay} sparkColor="#3b82f6" />
          <StatCell label="Today" value={stats?.postedToday ?? 0} color="#22c55e" />
          <StatCell label="Queued" value={stats?.queueSize ?? 0} color="#3b82f6" />
          <StatCell label="Drafts" value={stats?.draftCount ?? 0} color="#f59e0b" />
          <StatCell label="Failed" value={stats?.failedToday ?? 0} color={stats?.failedToday ? '#ef4444' : undefined} pulse={!!stats?.failedToday} />
          <StatCell label="Avg Engage" value={stats?.avgEngagement?.toFixed(1) ?? '0'} />
          <StatCell label="AI Cost" value={`$${(stats?.todayCost ?? 0).toFixed(3)}`} />
          <StatCell label="Platforms" value={stats?.activePlatforms ?? 0} color="#22c55e" />
        </div>
      )}

      {/* ═══ Section Tabs + Actions ═══ */}
      <div
        style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--admin-border)', marginBottom: '0.75rem', flexWrap: 'wrap' }}
        role="tablist"
        aria-label="Social dashboard sections"
      >
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className="social-tab-btn"
            onClick={() => { setActiveSection(s.id); if (s.id === 'setup') fetchSetup(); }}
            role="tab"
            aria-selected={activeSection === s.id}
            aria-controls={`social-panel-${s.id}`}
            id={`social-tab-${s.id}`}
            style={{
              ...S.btn(false),
              border: 'none',
              borderBottom: `2px solid ${activeSection === s.id ? 'var(--admin-accent)' : 'transparent'}`,
              borderRadius: 0,
              color: activeSection === s.id ? 'var(--admin-text)' : 'var(--admin-text-3)',
              background: 'none',
              padding: '0.375rem 0.75rem',
              fontSize: '0.6875rem',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {s.label}
            <span className="social-tab-hint" style={{ color: 'var(--admin-text-4)', fontFamily: 'var(--admin-mono)' }}>{s.shortcut}</span>
          </button>
        ))}

        {/* Quick actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem', paddingRight: '0.25rem' }}>
          {/* Last refresh indicator */}
          <span
            style={{ ...S.mono, color: 'var(--admin-text-4)', fontSize: '0.5625rem', marginRight: '4px' }}
            title={`Last refreshed: ${lastRefresh.toLocaleTimeString()}`}
            aria-label={`Last refreshed: ${lastRefresh.toLocaleTimeString()}`}
          >
            {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>

          <label htmlFor="social-generate-slug" className="sr-only" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Article slug for social generation</label>
          <input
            ref={slugInputRef}
            id="social-generate-slug"
            type="text"
            value={generateSlug}
            onChange={e => setGenerateSlug(e.target.value)}
            placeholder="article-slug"
            aria-label="Article slug for social generation"
            style={{
              width: '120px',
              padding: '2px 6px',
              fontSize: '0.625rem',
              fontFamily: 'var(--admin-mono)',
              background: 'var(--admin-surface-2)',
              border: '1px solid var(--admin-border-2)',
              borderRadius: 'var(--admin-radius-xs)',
              color: 'var(--admin-text)',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--admin-accent)'; }}
            onBlur={e => { e.target.style.borderColor = ''; }}
            onKeyDown={e => e.key === 'Enter' && generateForArticle()}
          />
          <ActionBtn
            onClick={generateForArticle}
            disabled={!generateSlug.trim()}
            loading={generating}
            accent
            label={generating ? 'Gen\u2026' : 'Generate'}
            ariaLabel="Generate social content for this article"
          />
          <span style={{ width: '1px', height: '14px', background: 'var(--admin-border-2)', margin: '0 2px' }} aria-hidden="true" />
          {[
            { action: 'run-planner', label: 'Planner' },
            { action: 'run-writer', label: 'Writer' },
            { action: 'run-poster', label: 'Poster' },
            { action: 'run-sync', label: 'Sync' },
          ].map(({ action, label }) => {
            const feedback = actionFeedback[action];
            const feedbackColor = feedback === 'success' ? '#22c55e' : feedback === 'error' ? '#ef4444' : undefined;
            return (
              <ActionBtn
                key={action}
                onClick={() => runAction(action)}
                disabled={!!runningAction}
                loading={runningAction === action}
                label={feedback === 'success' ? '\u2713' : feedback === 'error' ? '\u2717' : label}
                ariaLabel={`Manually trigger ${label.toLowerCase()}`}
                style={{
                  fontSize: '0.5625rem',
                  color: feedbackColor || undefined,
                  borderColor: feedbackColor ? `${feedbackColor}40` : undefined,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* ═══ OVERVIEW ═══ */}
      {activeSection === 'overview' && (
        <div
          id="social-panel-overview"
          role="tabpanel"
          aria-labelledby="social-tab-overview"
          style={{ ...S.grid2, animation: 'fade-in 0.2s var(--admin-ease)' }}
        >
          {/* Left column: Platform Breakdown + Arc */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Platform Activity Matrix */}
            <div style={S.panel} className="social-panel">
              <div style={S.panelHeader}>
                <span style={S.panelTitle}>Platform Activity (24h)</span>
                <ActionBtn onClick={() => fetchAll()} label="Refresh" ariaLabel="Refresh social data" />
              </div>
              <div style={{ padding: '0.375rem 0.75rem' }}>
                {loading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : Object.entries(stats?.platformBreakdown || {}).length === 0 ? (
                  <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--admin-text-4)', fontSize: '0.75rem' }}>
                    No activity yet. Generate social content for an article to get started.
                  </div>
                ) : (
                  Object.entries(stats?.platformBreakdown || {}).sort((a, b) => {
                    const totalA = a[1].posted + a[1].scheduled + a[1].draft;
                    const totalB = b[1].posted + b[1].scheduled + b[1].draft;
                    return totalB - totalA;
                  }).map(([platform, counts]) => {
                    const total = counts.posted + counts.scheduled + counts.draft + counts.failed;
                    const target = platforms.find(p => p.platform === platform)?.daily_post_target || 10;
                    return (
                      <div key={platform} style={{ ...S.row, gap: '0.375rem' }} className="social-row-hover">
                        <PlatformBadge platform={platform} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', gap: '8px', fontSize: '0.625rem' }}>
                            <span style={{ color: '#22c55e' }}>{counts.posted} posted</span>
                            <span style={{ color: '#3b82f6' }}>{counts.scheduled} queued</span>
                            {counts.failed > 0 && <span style={{ color: '#ef4444' }}>{counts.failed} failed</span>}
                          </div>
                          <div style={{ height: '3px', background: 'var(--admin-surface-3)', borderRadius: '2px', overflow: 'hidden' }} role="progressbar" aria-valuenow={counts.posted} aria-valuemax={target} aria-label={`${platform} daily progress: ${counts.posted} of ${target}`}>
                            <div style={{
                              width: `${Math.min(100, (counts.posted / target) * 100)}%`,
                              height: '100%',
                              background: counts.posted >= target ? '#22c55e' : counts.posted > 0 ? '#3b82f6' : 'var(--admin-surface-3)',
                              borderRadius: '2px',
                              transition: 'width 0.6s var(--admin-ease)',
                            }} />
                          </div>
                        </div>
                        <span style={{ ...S.mono, color: 'var(--admin-text-4)', minWidth: '32px', textAlign: 'right' }}>
                          {counts.posted}/{target}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Weekly Arc */}
            <div style={S.panel} className="social-panel">
              <div style={S.panelHeader}>
                <span style={S.panelTitle}>Weekly Arc</span>
                {currentArc && <StatusDot status={currentArc.status} />}
              </div>
              <div style={{ padding: '0.5rem 0.75rem' }}>
                {currentArc ? (
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '4px', color: 'var(--admin-text)' }}>
                      {currentArc.theme}
                    </div>
                    {currentArc.description && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-2)', marginBottom: '6px' }}>
                        {currentArc.description}
                      </div>
                    )}
                    {currentArc.category_focus && (
                      <span style={S.pill(CATEGORY_GRADIENTS[currentArc.category_focus]?.hex || '#7d7871')}>
                        {currentArc.category_focus}
                      </span>
                    )}
                    {currentArc.article_slugs?.length > 0 && (
                      <div style={{ marginTop: '8px', fontSize: '0.6875rem', color: 'var(--admin-text-3)' }}>
                        {currentArc.article_slugs.length} articles in arc
                      </div>
                    )}
                    {Object.keys(currentArc.recurring_series || {}).length > 0 && (
                      <div style={{ marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {Object.keys(currentArc.recurring_series).map(series => (
                          <span key={series} style={S.pill('#a78bfa')}>
                            {series.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem 0', textAlign: 'center', color: 'var(--admin-text-4)', fontSize: '0.75rem' }}>
                    No active arc. Click "Planner" above or wait for the daily 5am UTC run.
                  </div>
                )}
              </div>
            </div>

            {/* Personas */}
            <div style={S.panel} className="social-panel">
              <div style={S.panelHeader}>
                <span style={S.panelTitle}>AI Personas</span>
                <span style={{ ...S.mono, color: 'var(--admin-text-4)' }}>{personas.length} active</span>
              </div>
              <div style={{ padding: '0.375rem 0.75rem' }}>
                {personas.map(p => (
                  <div key={p.id} style={{ ...S.row, flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }} className="social-row-hover">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                      <PersonaBadge persona={p.id} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text)' }}>{p.display_name}</span>
                      {postedByPersona[p.id] != null && (
                        <span style={{ ...S.mono, color: '#22c55e', fontSize: '0.5625rem' }}>
                          {postedByPersona[p.id]} posted
                        </span>
                      )}
                      <span style={{ ...S.mono, color: 'var(--admin-text-4)', marginLeft: 'auto' }}>
                        {p.model_override || 'default'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.625rem', color: 'var(--admin-text-3)', lineHeight: '1.4', paddingLeft: '2px' }}>
                      {truncate(p.bio, 80)}
                    </div>
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                      {p.platforms.slice(0, 6).map(pl => <PlatformBadge key={pl} platform={pl} compact />)}
                      {p.platforms.length > 6 && <span style={{ fontSize: '0.5625rem', color: 'var(--admin-text-4)' }}>+{p.platforms.length - 6}</span>}
                    </div>
                  </div>
                ))}
                {personas.length === 0 && (
                  <div style={{ padding: '0.75rem 0', textAlign: 'center', color: 'var(--admin-text-4)', fontSize: '0.75rem' }}>
                    No personas configured. Run the migration to seed default personas.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column: Recent Posts + Quick Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Persona Distribution */}
            {Object.keys(postedByPersona).length > 0 && (
              <div style={S.panel} className="social-panel">
                <div style={S.panelHeader}>
                  <span style={S.panelTitle}>Persona Distribution</span>
                  {engagementByDay.some(v => v > 0) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ ...S.mono, color: 'var(--admin-text-4)', fontSize: '0.5625rem' }}>7d</span>
                      <Sparkline data={engagementByDay} color="#3b82f6" />
                    </div>
                  )}
                </div>
                <div style={{ padding: '0.5rem 0.75rem', display: 'flex', gap: '0.75rem' }}>
                  {Object.entries(postedByPersona).sort((a, b) => b[1] - a[1]).map(([persona, count]) => {
                    const max = Math.max(...Object.values(postedByPersona));
                    const color = PERSONA_COLORS[persona] || '#7d7871';
                    return (
                      <div key={persona} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '100%', height: '48px', background: 'var(--admin-surface-2)', borderRadius: '3px', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                          <div style={{
                            width: '100%',
                            height: `${(count / max) * 100}%`,
                            background: `linear-gradient(to top, ${color}, ${color}cc)`,
                            borderRadius: '3px',
                            transition: 'height 0.6s var(--admin-ease)',
                            minHeight: '4px',
                            boxShadow: `0 0 8px ${color}30`,
                          }} />
                        </div>
                        <span style={{ ...S.mono, fontSize: '0.75rem', color: 'var(--admin-text)' }}>{count}</span>
                        <span style={S.microLabel}>{persona}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Content Type Breakdown */}
            {Object.keys(postedByType).length > 0 && (
              <div style={S.panel} className="social-panel">
                <div style={S.panelHeader}>
                  <span style={S.panelTitle}>Content Types</span>
                </div>
                <div style={{ padding: '0.5rem 0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {Object.entries(postedByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                    <span key={type} style={{
                      ...S.pill('#7d7871'),
                      padding: '3px 8px',
                      fontSize: '0.625rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      {type}
                      <span style={{ ...S.mono, color: 'var(--admin-text-2)', fontWeight: 700 }}>{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Posts (compact) */}
            <div style={S.panel} className="social-panel">
              <div style={S.panelHeader}>
                <span style={S.panelTitle}>Recent Posts</span>
                <span style={{ ...S.mono, color: 'var(--admin-text-4)' }}>{posts.length} total</span>
              </div>
              <div style={{ ...S.panelBody, maxHeight: '520px' }}>
                {loading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : posts.slice(0, 20).map(post => (
                  <div key={post.id} style={S.row} className="social-row-hover">
                    <PlatformBadge platform={post.platform} compact />
                    <PersonaBadge persona={post.persona} />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--admin-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {truncate(post.content_text, 80)}
                      </span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <StatusDot status={post.status} />
                        <span style={{ ...S.mono, color: 'var(--admin-text-4)' }}>{timeAgo(post.created_at)}</span>
                        <EngagementMini post={post} />
                      </div>
                    </div>
                    {post.status === 'failed' && (
                      <ActionBtn onClick={() => retryPost(post.id)} label="↻" ariaLabel={`Retry posting: ${truncate(post.content_text, 30)}`} />
                    )}
                    {(post.status === 'draft' || post.status === 'scheduled') && (
                      <ActionBtn onClick={() => skipPost(post.id)} label="×" ariaLabel={`Skip post: ${truncate(post.content_text, 30)}`} danger />
                    )}
                  </div>
                ))}
                {!loading && posts.length === 0 && (
                  <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--admin-text-4)', fontSize: '0.75rem' }}>
                    No posts yet. Generate social content for an article above.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ POST FEED ═══ */}
      {activeSection === 'posts' && (
        <div
          id="social-panel-posts"
          role="tabpanel"
          aria-labelledby="social-tab-posts"
          style={{ animation: 'fade-in 0.2s var(--admin-ease)' }}
        >
          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }} role="toolbar" aria-label="Post filters">
            <span style={S.microLabel} id="status-filter-label">Status:</span>
            <div role="group" aria-labelledby="status-filter-label" style={{ display: 'flex', gap: '0.25rem' }}>
              {['all', 'draft', 'scheduled', 'posted', 'failed', 'skipped'].map(s => (
                <button
                  key={s}
                  onClick={() => setPostFilter(s)}
                  aria-pressed={postFilter === s}
                  style={{
                    ...S.btn(postFilter === s),
                    fontSize: '0.5625rem',
                  }}
                >
                  {s}
                  {s !== 'all' && (
                    <span style={{ ...S.mono, marginLeft: '3px', opacity: 0.7 }}>
                      {posts.filter(p => p.status === s).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <span style={{ ...S.microLabel, marginLeft: '12px' }} id="platform-filter-label">Platform:</span>
            <select
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value)}
              aria-labelledby="platform-filter-label"
              style={{
                padding: '2px 6px',
                fontSize: '0.625rem',
                background: 'var(--admin-surface-2)',
                border: '1px solid var(--admin-border-2)',
                borderRadius: 'var(--admin-radius-xs)',
                color: 'var(--admin-text)',
                fontFamily: 'inherit',
              }}
            >
              <option value="all">All</option>
              {[...new Set(posts.map(p => p.platform))].sort().map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <span style={{ ...S.mono, color: 'var(--admin-text-4)', marginLeft: 'auto' }} aria-live="polite">
              {filteredPosts.length} posts
            </span>
          </div>

          {/* Post Table */}
          <div style={S.panel} className="social-panel">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.6875rem' }} role="table" aria-label="Social posts">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--admin-border-2)' }}>
                    {['Platform', 'Persona', 'Type', 'Content', 'Status', 'Engagement', 'Time', 'Actions'].map(h => (
                      <th key={h} scope="col" style={{
                        ...S.microLabel,
                        padding: '6px 8px',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map(post => (
                    <tr key={post.id} style={{ borderBottom: '1px solid var(--admin-border)', transition: 'background 0.15s' }} className="social-row-hover">
                      <td style={{ padding: '5px 8px' }}><PlatformBadge platform={post.platform} /></td>
                      <td style={{ padding: '5px 8px' }}><PersonaBadge persona={post.persona} /></td>
                      <td style={{ padding: '5px 8px' }}>
                        <span style={S.pill('#7d7871')}>{post.content_type}</span>
                      </td>
                      <td style={{ padding: '5px 8px', maxWidth: '320px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--admin-text)' }}>
                          {truncate(post.content_text, 100)}
                        </div>
                        {post.article_slug && (
                          <div style={{ ...S.mono, color: 'var(--admin-text-4)', marginTop: '1px' }}>
                            {post.article_slug}
                          </div>
                        )}
                        {post.error && (
                          <div style={{ fontSize: '0.5625rem', color: '#f87171', marginTop: '2px' }} role="alert">
                            {truncate(post.error, 60)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '5px 8px' }}><StatusDot status={post.status} /></td>
                      <td style={{ padding: '5px 8px' }}><EngagementMini post={post} /></td>
                      <td style={{ padding: '5px 8px', ...S.mono, color: 'var(--admin-text-3)', whiteSpace: 'nowrap' }}>
                        {timeAgo(post.posted_at || post.created_at)}
                      </td>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {post.platform_url && (
                            <a
                              href={post.platform_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ ...S.btn(false), textDecoration: 'none', display: 'inline-flex' }}
                              aria-label={`View post on ${post.platform}`}
                            >↗</a>
                          )}
                          {post.status === 'failed' && (
                            <ActionBtn onClick={() => retryPost(post.id)} label="Retry" ariaLabel={`Retry failed post on ${post.platform}`} />
                          )}
                          {(post.status === 'draft' || post.status === 'scheduled') && (
                            <ActionBtn onClick={() => skipPost(post.id)} label="Skip" ariaLabel={`Skip scheduled post on ${post.platform}`} danger />
                          )}
                          {(post.status === 'draft' || post.status === 'scheduled') && (
                            <ActionBtn
                              onClick={() => {
                                navigator.clipboard.writeText(post.content_text);
                                addToast('Content copied to clipboard', 'success');
                              }}
                              label="Copy"
                              ariaLabel="Copy post content to clipboard"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPosts.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--admin-text-4)', fontSize: '0.75rem' }}>
                  No posts match current filters.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ CONTENT PLAN ═══ */}
      {activeSection === 'plan' && (
        <div
          id="social-panel-plan"
          role="tabpanel"
          aria-labelledby="social-tab-plan"
          style={{ animation: 'fade-in 0.2s var(--admin-ease)' }}
        >
          <div style={S.panel} className="social-panel">
            <div style={S.panelHeader}>
              <span style={S.panelTitle}>Today's Editorial Plan</span>
              <span style={{ ...S.mono, color: 'var(--admin-text-4)' }} aria-live="polite">{plan.length} items</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.6875rem' }} role="table" aria-label="Content plan">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--admin-border-2)' }}>
                    {['Platform', 'Persona', 'Desk', 'Type', 'Format', 'Article', 'Status', 'Series'].map(h => (
                      <th key={h} scope="col" style={{ ...S.microLabel, padding: '6px 8px', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--admin-border)' }} className="social-row-hover">
                      <td style={{ padding: '5px 8px' }}><PlatformBadge platform={item.platform} /></td>
                      <td style={{ padding: '5px 8px' }}><PersonaBadge persona={item.persona} /></td>
                      <td style={{ padding: '5px 8px' }}>
                        <span style={S.pill('#7d7871')}>{item.desk}</span>
                      </td>
                      <td style={{ padding: '5px 8px', color: 'var(--admin-text-2)' }}>{item.content_type}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--admin-text-3)' }}>{item.content_format}</td>
                      <td style={{ padding: '5px 8px' }}>
                        {item.article_slug ? (
                          <span style={{ ...S.mono, color: 'var(--admin-text-2)' }}>{item.article_slug}</span>
                        ) : (
                          <span style={{ color: 'var(--admin-text-4)' }} aria-label="No article">—</span>
                        )}
                      </td>
                      <td style={{ padding: '5px 8px' }}><StatusDot status={item.status} /></td>
                      <td style={{ padding: '5px 8px' }}>
                        {item.series_tag ? (
                          <span style={S.pill('#a78bfa')}>{item.series_tag.replace(/_/g, ' ')}</span>
                        ) : <span aria-label="No series">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--admin-text-4)', fontSize: '0.75rem' }}>
                  No content planned for today. Planner runs daily at 5am UTC.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PLATFORMS ═══ */}
      {activeSection === 'platforms' && (
        <div
          id="social-panel-platforms"
          role="tabpanel"
          aria-labelledby="social-tab-platforms"
          style={{ ...S.grid2, animation: 'fade-in 0.2s var(--admin-ease)' }}
        >
          {platforms.map(p => {
            const cfg = PLATFORM_ICONS[p.platform] || { icon: '?', color: '#7d7871', abbr: p.platform };
            const healthColor = p.api_configured ? '#22c55e' : p.active ? '#f59e0b' : '#ef4444';
            const pct = p.daily_post_target > 0 ? Math.round((p.todayPosted / p.daily_post_target) * 100) : 0;
            return (
              <div key={p.platform} style={S.panel} className="social-panel">
                <div style={{ ...S.panelHeader, borderBottom: `2px solid ${cfg.color}22` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1rem' }} aria-hidden="true">{cfg.icon}</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--admin-text)', textTransform: 'capitalize' }}>
                      {p.platform}
                    </span>
                    <span style={S.pill(healthColor)}>
                      {p.api_configured ? 'API LIVE' : p.active ? 'PENDING' : 'DISABLED'}
                    </span>
                  </div>
                  <span style={S.pill('#7d7871')}>Tier {p.tier}</span>
                </div>
                <div style={{ padding: '0.5rem 0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '8px' }}>
                    <div>
                      <div style={{ ...S.mono, fontSize: '1rem', fontWeight: 600, color: 'var(--admin-text)' }}>{p.todayPosted}</div>
                      <div style={S.microLabel}>Posted Today</div>
                    </div>
                    <div>
                      <div style={{ ...S.mono, fontSize: '1rem', fontWeight: 600, color: 'var(--admin-text)' }}>{p.daily_post_target}</div>
                      <div style={S.microLabel}>Daily Target</div>
                    </div>
                    <div>
                      <div style={{ ...S.mono, fontSize: '1rem', fontWeight: 600, color: pct >= 100 ? '#22c55e' : pct > 50 ? '#f59e0b' : 'var(--admin-text-3)' }}>{pct}%</div>
                      <div style={S.microLabel}>Fill Rate</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div
                    style={{ height: '4px', background: 'var(--admin-surface-3)', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${p.platform} fill rate: ${pct}%`}
                  >
                    <div style={{
                      width: `${Math.min(100, pct)}%`,
                      height: '100%',
                      background: pct >= 100 ? '#22c55e' : pct > 50 ? '#3b82f6' : 'var(--admin-text-4)',
                      borderRadius: '2px',
                      transition: 'width 0.6s var(--admin-ease)',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.625rem' }}>
                    <span style={{ color: 'var(--admin-text-3)' }}>Desk: {p.desk}</span>
                    <span style={{ color: 'var(--admin-text-4)' }}>
                      {p.lastPostAt ? `Last: ${timeAgo(p.lastPostAt)}` : 'Never posted'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {p.content_formats.map(f => (
                      <span key={f} style={S.pill('#7d7871')}>{f}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {platforms.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: 'var(--admin-text-4)', fontSize: '0.75rem' }}>
              No platforms configured. Run the migration to seed platform configs.
            </div>
          )}
        </div>
      )}

      {/* ═══ SETUP GUIDE ═══ */}
      {activeSection === 'setup' && (
        <div
          id="social-panel-setup"
          role="tabpanel"
          aria-labelledby="social-tab-setup"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', animation: 'fade-in 0.2s var(--admin-ease)' }}
        >
          {/* Credential Status */}
          <div style={S.panel} className="social-panel">
            <div style={S.panelHeader}>
              <span style={S.panelTitle}>Platform Credentials</span>
              <ActionBtn onClick={fetchSetup} label="Refresh" ariaLabel="Refresh setup status" />
            </div>
            <div style={{ padding: '0.75rem' }}>
              {!setupData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{ padding: '0.75rem', background: 'var(--admin-surface-2)', borderRadius: 'var(--admin-radius-sm)' }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <SkeletonPulse width="24px" height="24px" />
                        <SkeletonPulse width="80px" height="16px" />
                        <SkeletonPulse width="80px" height="16px" />
                      </div>
                      <SkeletonPulse width="100%" height="48px" />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {Object.entries((setupData.credentials || {}) as Record<string, { ready: boolean; missing: string[]; instructions: string }>).map(([platform, info]) => {
                    const cfg = PLATFORM_ICONS[platform];
                    return (
                      <div key={platform} style={{
                        padding: '0.75rem',
                        background: info.ready ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                        border: `1px solid ${info.ready ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                        borderRadius: 'var(--admin-radius-sm)',
                        transition: 'border-color 0.2s var(--admin-ease)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '1.125rem' }} aria-hidden="true">{cfg?.icon || '?'}</span>
                          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--admin-text)', textTransform: 'capitalize' }}>{platform}</span>
                          <span style={S.pill(info.ready ? '#22c55e' : '#ef4444')}>
                            {info.ready ? 'READY' : 'NOT CONFIGURED'}
                          </span>
                        </div>
                        {!info.ready && (
                          <>
                            {info.missing.length > 0 && (
                              <div style={{ fontSize: '0.6875rem', color: '#f87171', marginBottom: '6px' }} role="alert">
                                Missing: {info.missing.join(', ')}
                              </div>
                            )}
                            <div style={{
                              fontSize: '0.6875rem',
                              fontFamily: 'var(--admin-mono)',
                              color: 'var(--admin-text-2)',
                              whiteSpace: 'pre-line',
                              lineHeight: '1.6',
                              padding: '0.5rem',
                              background: 'var(--admin-surface-2)',
                              borderRadius: 'var(--admin-radius-xs)',
                            }}>
                              {info.instructions}
                            </div>
                          </>
                        )}
                        {info.ready && (
                          <div style={{ fontSize: '0.6875rem', color: '#22c55e' }}>
                            All credentials configured. Platform ready for automated posting.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* System Architecture */}
          <div style={S.panel} className="social-panel">
            <div style={S.panelHeader}>
              <span style={S.panelTitle}>Social System Architecture</span>
            </div>
            <div style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--admin-text-2)', lineHeight: '1.8' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                {[
                  { name: 'Planner', schedule: 'Daily 5am UTC', desc: 'Selects articles, creates weekly arcs' },
                  { name: 'Engine', schedule: 'On publish + planner', desc: 'Generates Content Brief (strategy)' },
                  { name: 'Writer', schedule: 'Chained from Engine', desc: 'Platform-native posts per persona' },
                  { name: 'Poster', schedule: 'Every 5 min', desc: 'Dispatches to platform APIs' },
                  { name: 'Sync', schedule: 'Every 6 hours', desc: 'Pulls engagement metrics back' },
                ].map((fn, i, arr) => (
                  <div key={fn.name} style={{ position: 'relative' }}>
                    <div style={{
                      padding: '0.625rem',
                      background: 'var(--admin-surface-2)',
                      borderRadius: 'var(--admin-radius-sm)',
                      border: '1px solid var(--admin-border)',
                      height: '100%',
                    }}>
                      <div style={{ fontWeight: 600, color: 'var(--admin-text)', marginBottom: '2px', fontSize: '0.75rem' }}>{fn.name}</div>
                      <div style={{ ...S.mono, color: 'var(--admin-accent)', fontSize: '0.5625rem', marginBottom: '4px' }}>{fn.schedule}</div>
                      <div style={{ fontSize: '0.5625rem', color: 'var(--admin-text-3)', lineHeight: '1.4' }}>{fn.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--admin-text-4)', fontSize: '0.625rem', fontFamily: 'var(--admin-mono)' }}>
                <span>Article publishes</span>
                <span style={{ color: 'var(--admin-accent)' }}>&rarr;</span>
                <span>Engine (brief)</span>
                <span style={{ color: 'var(--admin-accent)' }}>&rarr;</span>
                <span>Writer (posts)</span>
                <span style={{ color: 'var(--admin-accent)' }}>&rarr;</span>
                <span>Poster (dispatch)</span>
                <span style={{ color: 'var(--admin-accent)' }}>&rarr;</span>
                <span>Sync (metrics)</span>
              </div>
            </div>
          </div>

          {/* Cron Jobs */}
          <div style={S.panel} className="social-panel">
            <div style={S.panelHeader}>
              <span style={S.panelTitle}>Cron Jobs (pg_cron)</span>
            </div>
            <div style={{ padding: '0.75rem' }}>
              <div style={{ fontSize: '0.6875rem', fontFamily: 'var(--admin-mono)', color: 'var(--admin-text-2)', lineHeight: '2' }}>
                <div><span style={{ color: 'var(--admin-accent)' }}>*/5 * * * *</span> &nbsp; social-poster &mdash; dispatch scheduled posts</div>
                <div><span style={{ color: 'var(--admin-accent)' }}>0 5 * * *</span> &nbsp;&nbsp; social-planner &mdash; daily editorial meeting</div>
                <div><span style={{ color: 'var(--admin-accent)' }}>0 */6 * * *</span> &nbsp; social-sync &mdash; engagement metrics sync</div>
              </div>
              <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'var(--admin-surface-2)', borderRadius: 'var(--admin-radius-xs)', fontSize: '0.625rem', color: 'var(--admin-text-3)' }}>
                <strong style={{ color: 'var(--admin-text-2)' }}>Setup commands:</strong><br />
                These cron jobs are set up via SQL in the Supabase Dashboard (Database &gt; Extensions &gt; pg_cron + pg_net).<br />
                See the migration file or CLAUDE.md for the exact SQL.
              </div>
            </div>
          </div>

          {/* Quick Start Guide */}
          <div style={S.panel} className="social-panel">
            <div style={S.panelHeader}>
              <span style={S.panelTitle}>Quick Start Guide</span>
            </div>
            <div style={{ padding: '0.75rem', fontSize: '0.6875rem', color: 'var(--admin-text-2)', lineHeight: '1.8' }}>
              <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--admin-text)' }}>Set up Bluesky</strong> (free, easiest start):<br />
                  <code style={{ fontSize: '0.625rem', color: 'var(--admin-accent)' }}>supabase secrets set BLUESKY_HANDLE=youraccount.bsky.social BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx</code>
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--admin-text)' }}>Mark platform as configured</strong>:<br />
                  <code style={{ fontSize: '0.625rem', color: 'var(--admin-accent)' }}>UPDATE social_platform_config SET api_configured = true WHERE platform = 'bluesky';</code>
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--admin-text)' }}>Deploy functions</strong>:<br />
                  <code style={{ fontSize: '0.625rem', color: 'var(--admin-accent)' }}>for fn in social-writer social-poster social-planner social-sync social-engine social-admin; do supabase functions deploy $fn --no-verify-jwt; done</code>
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--admin-text)' }}>Set up cron jobs</strong> (run in Supabase SQL editor):<br />
                  <code style={{ fontSize: '0.625rem', color: 'var(--admin-accent)' }}>SELECT cron.schedule('social-poster', '*/5 * * * *', ...);</code>
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--admin-text)' }}>Test manually</strong>: Use the buttons above (Planner, Writer, Poster) to test each step, or enter an article slug and click Generate.
                </li>
                <li>
                  <strong style={{ color: 'var(--admin-text)' }}>Verify</strong>: Check the Overview tab for activity, the Post Feed for content, and Platforms for API status.
                </li>
              </ol>
            </div>
          </div>

          {/* Keyboard Shortcuts Reference */}
          <div style={S.panel} className="social-panel">
            <div style={S.panelHeader}>
              <span style={S.panelTitle}>Keyboard Shortcuts</span>
            </div>
            <div style={{ padding: '0.75rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: '0.6875rem' }}>
              {[
                ['1–5', 'Switch tabs'],
                ['R', 'Refresh all data'],
                ['G', 'Focus generate slug input'],
              ].map(([key, desc]) => (
                <Fragment key={key}>
                  <kbd style={{
                    padding: '1px 6px',
                    background: 'var(--admin-surface-3)',
                    borderRadius: '3px',
                    fontFamily: 'var(--admin-mono)',
                    fontSize: '0.625rem',
                    color: 'var(--admin-text)',
                    border: '1px solid var(--admin-border-2)',
                    textAlign: 'center',
                  }}>{key}</kbd>
                  <span style={{ color: 'var(--admin-text-3)' }}>{desc}</span>
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat Cell ───────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  color,
  pulse,
  sparkData,
  sparkColor,
}: {
  label: string;
  value: string | number;
  color?: string;
  pulse?: boolean;
  sparkData?: number[];
  sparkColor?: string;
}) {
  return (
    <div style={{
      flex: 1,
      padding: '0.625rem 0.875rem',
      textAlign: 'left',
      borderRight: '1px solid var(--admin-border)',
      background: 'var(--admin-surface)',
      minWidth: 0,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{
          display: 'block',
          fontFamily: "'Inter', sans-serif",
          fontSize: '1.25rem',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: color || 'var(--admin-text)',
          animation: pulse ? 'pulse-dot 2s ease-in-out infinite' : 'none',
        }}>
          {value}
        </span>
        {sparkData && sparkColor && sparkData.some(v => v > 0) && (
          <Sparkline data={sparkData} color={sparkColor} width={48} height={16} />
        )}
      </div>
      <span style={{
        display: 'block',
        fontSize: '0.5625rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--admin-text-3)',
        marginTop: '2px',
        fontWeight: 500,
      }}>
        {label}
      </span>
    </div>
  );
}
