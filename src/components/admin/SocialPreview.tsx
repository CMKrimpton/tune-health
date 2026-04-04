import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchWithTimeout, timeAgo, getAdminToken } from './types';
import { ErrorBoundary } from './ConfirmModal';

// ═══════════════════════════════════════════════════════════════════════════
// Social Preview — Platform Simulator
// Renders social posts as they'd appear on each platform's native UI.
// Used for visual QA before posts go live.
// ═══════════════════════════════════════════════════════════════════════════

interface Props {
  apiBase: string;
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
  cost_usd: number;
  created_at: string;
}

// ─── Persona Display Config ─────────────────────────────────────────────

const PERSONA_PROFILES: Record<string, { name: string; handle: string; avatar: string; verified: boolean }> = {
  brand:    { name: 'alumi news',            handle: 'aluminews',        avatar: '📰', verified: true },
  reporter: { name: 'Marc London',            handle: 'marclondon_health', avatar: '🔬', verified: false },
  skeptic:  { name: "The Devil's Advocate",  handle: 'devils_advocate',  avatar: '🔥', verified: false },
  curator:  { name: 'The alumi Digest',      handle: 'alumidigest',      avatar: '📚', verified: true },
};

type PlatformId = 'x' | 'bluesky' | 'reddit' | 'threads' | 'linkedin' | 'mastodon';

const PLATFORMS: { id: PlatformId; label: string; icon: string; bg: string; accent: string }[] = [
  { id: 'x',        label: 'X',        icon: '𝕏',  bg: '#000000', accent: '#1d9bf0' },
  { id: 'bluesky',  label: 'Bluesky',  icon: '🦋', bg: '#0a1628', accent: '#0085ff' },
  { id: 'reddit',   label: 'Reddit',   icon: '🔴', bg: '#1a1a1b', accent: '#ff4500' },
  { id: 'threads',  label: 'Threads',  icon: '📎', bg: '#101010', accent: '#ffffff' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', bg: '#1b1f23', accent: '#0a66c2' },
  { id: 'mastodon', label: 'Mastodon', icon: '🐘', bg: '#282c37', accent: '#6364ff' },
];

// Platform character limits
const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  x: 280, bluesky: 300, reddit: 10000, threads: 500,
  linkedin: 3000, mastodon: 500, telegram: 4096, medium: 50000,
  newsletter: 5000, pinterest: 500, instagram: 2200, quora: 5000, hackernews: 300,
};

// ─── Shared Helpers ─────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Deterministic "time ago" from post ID (stable across re-renders)
function stableTimestamp(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  const mins = (Math.abs(hash) % 120) + 5;
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`;
}

function stableKarma(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 7) - hash + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 200) + 15;
}

function getProfile(persona: string) {
  return PERSONA_PROFILES[persona] || PERSONA_PROFILES.brand;
}

// ─── Avatar Component ───────────────────────────────────────────────────

function Avatar({ persona, size = 40 }: { persona: string; size?: number }) {
  const profile = getProfile(persona);
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: persona === 'brand' ? 'linear-gradient(135deg, #ef4444, #dc2626)'
        : persona === 'reporter' ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
        : persona === 'skeptic' ? 'linear-gradient(135deg, #f59e0b, #d97706)'
        : 'linear-gradient(135deg, #a78bfa, #7c3aed)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.45,
      flexShrink: 0,
    }}>
      {profile.avatar}
    </div>
  );
}

// ─── Verified Badge ─────────────────────────────────────────────────────

function VerifiedBadge({ color = '#1d9bf0' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Platform Renderers
// ═══════════════════════════════════════════════════════════════════════════

// ─── X (Twitter) ────────────────────────────────────────────────────────

function XPost({ post }: { post: SocialPost }) {
  const profile = getProfile(post.persona);
  const lines = post.content_text.split('\n').filter(Boolean);
  const isThread = lines.length > 3 || post.content_format === 'thread';

  const renderTweet = (text: string, index: number, total: number) => (
    <div key={index} style={{
      padding: '12px 16px',
      borderBottom: '1px solid #2f3336',
      display: 'flex',
      gap: '12px',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Avatar persona={post.persona} size={40} />
        {index < total - 1 && (
          <div style={{ width: 2, flex: 1, background: '#333639', marginTop: 4 }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <span style={{ fontWeight: 700, color: '#e7e9ea', fontSize: '0.9375rem' }}>{profile.name}</span>
          {profile.verified && <VerifiedBadge />}
          <span style={{ color: '#71767b', fontSize: '0.9375rem' }}>@{profile.handle}</span>
          <span style={{ color: '#71767b', fontSize: '0.9375rem' }}>· {stableTimestamp(post.id)}</span>
        </div>
        <div style={{
          color: '#e7e9ea',
          fontSize: '0.9375rem',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {text}
        </div>
        {index === total - 1 && (
          <div style={{ display: 'flex', gap: 0, marginTop: 12, justifyContent: 'space-between', maxWidth: 425 }}>
            {[
              { icon: '💬', count: post.comments, label: 'Reply' },
              { icon: '🔄', count: post.shares, label: 'Repost' },
              { icon: '❤️', count: post.likes, label: 'Like' },
              { icon: '📊', count: post.impressions, label: 'Views' },
              { icon: '↗', count: 0, label: 'Share' },
            ].map(({ icon, count, label }) => (
              <button key={label} style={{
                background: 'none',
                border: 'none',
                color: '#71767b',
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 999,
              }}>
                <span style={{ fontSize: '1rem' }}>{icon}</span>
                {count > 0 && <span>{formatCount(count)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (isThread) {
    // Split on double newlines or numbered lines for threads
    const tweets = post.content_text.split(/\n\n+/).filter(Boolean);
    return <>{tweets.map((t, i) => renderTweet(t, i, tweets.length))}</>;
  }
  return renderTweet(post.content_text, 0, 1);
}

// ─── Bluesky ────────────────────────────────────────────────────────────

function BlueskyPost({ post }: { post: SocialPost }) {
  const profile = getProfile(post.persona);
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid #1e3a5f',
      display: 'flex',
      gap: '10px',
    }}>
      <Avatar persona={post.persona} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: '#f1f3f5', fontSize: '0.9375rem' }}>{profile.name}</span>
          <span style={{ color: '#7b8794', fontSize: '0.875rem' }}>@{profile.handle}.bsky.social</span>
          <span style={{ color: '#7b8794', fontSize: '0.8125rem' }}>· {stableTimestamp(post.id)}</span>
        </div>
        <div style={{
          color: '#d2dce8',
          fontSize: '0.9375rem',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {post.content_text}
        </div>
        {/* Link card preview */}
        {post.article_slug && (
          <div style={{
            marginTop: 10,
            border: '1px solid #1e3a5f',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <div style={{ height: 140, background: 'linear-gradient(135deg, #1a2a3f, #0d1b2a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '2rem', opacity: 0.3 }}>📰</span>
            </div>
            <div style={{ padding: '10px 12px', background: '#0d1b2a' }}>
              <div style={{ color: '#7b8794', fontSize: '0.75rem', marginBottom: 2 }}>tune-health.vercel.app</div>
              <div style={{ color: '#d2dce8', fontSize: '0.875rem', fontWeight: 600 }}>
                {(post.content_meta?.title as string) || post.article_slug?.replace(/-/g, ' ')}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
          {[
            { icon: '💬', count: post.comments },
            { icon: '🔄', count: post.shares },
            { icon: '❤️', count: post.likes },
          ].map(({ icon, count }, i) => (
            <span key={i} style={{ color: '#7b8794', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <span style={{ fontSize: '0.9375rem' }}>{icon}</span>
              {count > 0 && formatCount(count)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Reddit ─────────────────────────────────────────────────────────────

function RedditPost({ post }: { post: SocialPost }) {
  const profile = getProfile(post.persona);
  const meta = post.content_meta || {};
  const subreddit = (meta.subreddit as string) || 'health';
  const title = (meta.title as string) || post.content_text.split('\n')[0]?.slice(0, 120) || 'Discussion';
  const body = post.content_text;
  const isLink = post.content_format === 'link_post';
  const karma = stableKarma(post.id);

  return (
    <div style={{
      background: '#1a1a1b',
      border: '1px solid #343536',
      borderRadius: 4,
      padding: 0,
      display: 'flex',
      marginBottom: 8,
    }}>
      {/* Vote column */}
      <div style={{
        width: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 4px',
        gap: 2,
        background: '#161617',
        borderRadius: '4px 0 0 4px',
      }}>
        <span style={{ color: '#d7dadc', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1 }}>▲</span>
        <span style={{ color: '#d7dadc', fontSize: '0.75rem', fontWeight: 700 }}>{karma}</span>
        <span style={{ color: '#818384', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1 }}>▼</span>
      </div>
      {/* Content */}
      <div style={{ flex: 1, padding: '8px 12px' }}>
        {/* Subreddit header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <div style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#ff4500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.625rem',
            color: '#fff',
            fontWeight: 700,
          }}>r/</div>
          <span style={{ color: '#d7dadc', fontSize: '0.75rem', fontWeight: 700 }}>r/{subreddit}</span>
          <span style={{ color: '#818384', fontSize: '0.75rem' }}>· Posted by u/{profile.handle}</span>
          <span style={{ color: '#818384', fontSize: '0.75rem' }}>{stableTimestamp(post.id)} ago</span>
        </div>
        {/* Title */}
        <h3 style={{ color: '#d7dadc', fontSize: '1.125rem', fontWeight: 500, margin: '0 0 8px', lineHeight: 1.3 }}>
          {title}
        </h3>
        {/* Body */}
        {!isLink && (
          <div style={{
            color: '#d7dadc',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 300,
            overflow: 'hidden',
            maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)',
          }}>
            {body}
          </div>
        )}
        {/* Link card */}
        {isLink && post.article_slug && (
          <div style={{
            border: '1px solid #343536',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 8,
          }}>
            <div style={{ height: 100, background: 'linear-gradient(135deg, #2a1a1a, #1a1a1b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1.5rem', opacity: 0.3 }}>🔗</span>
            </div>
            <div style={{ padding: '8px 10px', borderTop: '1px solid #343536' }}>
              <div style={{ color: '#0079d3', fontSize: '0.75rem' }}>tune-health.vercel.app</div>
            </div>
          </div>
        )}
        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {[
            { icon: '💬', label: `${post.comments || (stableKarma(post.id) % 30) + 2} Comments` },
            { icon: '↗', label: 'Share' },
            { icon: '⭐', label: 'Save' },
            { icon: '···', label: '' },
          ].map(({ icon, label }, i) => (
            <button key={i} style={{
              background: 'none',
              border: 'none',
              color: '#818384',
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 4,
            }}>
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Threads ────────────────────────────────────────────────────────────

function ThreadsPost({ post }: { post: SocialPost }) {
  const profile = getProfile(post.persona);
  return (
    <div style={{
      padding: '16px',
      borderBottom: '1px solid #313131',
      display: 'flex',
      gap: '12px',
    }}>
      <Avatar persona={post.persona} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: '#f5f5f5', fontSize: '0.9375rem' }}>{profile.handle}</span>
          {profile.verified && <VerifiedBadge color="#ffffff" />}
          <span style={{ color: '#777', fontSize: '0.8125rem' }}>{stableTimestamp(post.id)}</span>
        </div>
        <div style={{
          color: '#f5f5f5',
          fontSize: '0.9375rem',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {post.content_text}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
          {[
            { icon: '❤️', count: post.likes },
            { icon: '💬', count: post.comments },
            { icon: '🔄', count: post.shares },
            { icon: '↗', count: 0 },
          ].map(({ icon, count }, i) => (
            <span key={i} style={{ color: '#777', fontSize: '0.9375rem', cursor: 'pointer' }}>
              {icon}{count > 0 ? ` ${formatCount(count)}` : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LinkedIn ───────────────────────────────────────────────────────────

function LinkedInPost({ post }: { post: SocialPost }) {
  const profile = getProfile(post.persona);
  const bioLine = post.persona === 'brand' ? 'Evidence-first health journalism | 192+ articles'
    : post.persona === 'reporter' ? 'Senior Health Correspondent at alumi news'
    : post.persona === 'skeptic' ? 'Independent Health Analyst'
    : 'Editorial Curator at alumi news';

  return (
    <div style={{
      background: '#1b1f23',
      borderRadius: 8,
      border: '1px solid #38434f',
      overflow: 'hidden',
      marginBottom: 8,
    }}>
      <div style={{ padding: '12px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <Avatar persona={post.persona} size={48} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontWeight: 700, color: '#e8e8e8', fontSize: '0.9375rem' }}>{profile.name}</span>
              <span style={{ color: '#ffffff60', fontSize: '0.8125rem' }}>· 1st</span>
            </div>
            <div style={{ color: '#ffffffa0', fontSize: '0.8125rem', lineHeight: 1.3 }}>{bioLine}</div>
            <div style={{ color: '#ffffff60', fontSize: '0.75rem', marginTop: 1 }}>{stableTimestamp(post.id)} · 🌐</div>
          </div>
          <span style={{ marginLeft: 'auto', color: '#71b7fb', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>+ Follow</span>
        </div>
        {/* Body */}
        <div style={{
          color: '#e8e8e8',
          fontSize: '0.875rem',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {post.content_text}
        </div>
      </div>
      {/* Link card */}
      {post.article_slug && (
        <div style={{ border: '1px solid #38434f', borderLeft: 'none', borderRight: 'none' }}>
          <div style={{ height: 120, background: 'linear-gradient(135deg, #1a2638, #1b1f23)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '2rem', opacity: 0.2 }}>📰</span>
          </div>
          <div style={{ padding: '10px 16px' }}>
            <div style={{ color: '#e8e8e8', fontSize: '0.875rem', fontWeight: 600 }}>
              {(post.content_meta?.title as string) || post.article_slug?.replace(/-/g, ' ')}
            </div>
            <div style={{ color: '#ffffff60', fontSize: '0.75rem' }}>tune-health.vercel.app</div>
          </div>
        </div>
      )}
      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 16px', borderTop: '1px solid #38434f' }}>
        {[
          { icon: '👍', label: 'Like' },
          { icon: '💬', label: 'Comment' },
          { icon: '🔄', label: 'Repost' },
          { icon: '↗', label: 'Send' },
        ].map(({ icon, label }) => (
          <button key={label} style={{
            background: 'none',
            border: 'none',
            color: '#ffffffa0',
            fontSize: '0.8125rem',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            padding: '6px 12px',
            borderRadius: 4,
            fontWeight: 600,
          }}>
            <span style={{ fontSize: '1rem' }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Mastodon ───────────────────────────────────────────────────────────

function MastodonPost({ post }: { post: SocialPost }) {
  const profile = getProfile(post.persona);
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid #393f4f',
      display: 'flex',
      gap: '10px',
    }}>
      <Avatar persona={post.persona} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: '#d9e1e8', fontSize: '0.9375rem' }}>{profile.name}</span>
          <span style={{ color: '#606984', fontSize: '0.875rem' }}>@{profile.handle}@mastodon.social</span>
        </div>
        <div style={{ color: '#606984', fontSize: '0.8125rem', marginBottom: 6 }}>{stableTimestamp(post.id)}</div>
        <div style={{
          color: '#d9e1e8',
          fontSize: '0.9375rem',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {post.content_text}
        </div>
        {/* Hashtags are already in the content_text — Mastodon renders them inline */}
        <div style={{ display: 'flex', gap: 24, marginTop: 14 }}>
          {[
            { icon: '↩️', count: post.comments, label: 'Reply' },
            { icon: '🔁', count: post.shares, label: 'Boost' },
            { icon: '⭐', count: post.likes, label: 'Favourite' },
            { icon: '📌', count: 0, label: 'Bookmark' },
          ].map(({ icon, count, label }) => (
            <span key={label} style={{ color: '#606984', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} title={label}>
              {icon}{count > 0 ? ` ${formatCount(count)}` : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

export default function SocialPreviewWrapped(props: Props) {
  return (
    <ErrorBoundary fallbackLabel="Social Preview encountered an error">
      <SocialPreviewInner {...props} />
    </ErrorBoundary>
  );
}

function SocialPreviewInner({ apiBase }: Props) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<PlatformId>('x');
  const [personaFilter, setPersonaFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [articleFilter, setArticleFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchWithTimeout(`${apiBase}/social-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'posts', limit: 100 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      setError(msg);
      console.error('[SocialPreview] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const copyPostText = useCallback((post: SocialPost) => {
    navigator.clipboard.writeText(post.content_text);
    setCopiedId(post.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const platformConfig = PLATFORMS.find(p => p.id === activePlatform)!;

  // Filter posts
  const filtered = posts.filter(p => {
    if (p.platform !== activePlatform) return false;
    if (personaFilter !== 'all' && p.persona !== personaFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (articleFilter !== 'all' && p.article_slug !== articleFilter) return false;
    return true;
  });

  // Get unique articles for filter
  const uniqueArticles = [...new Set(posts.filter(p => p.platform === activePlatform).map(p => p.article_slug).filter(Boolean))] as string[];

  // Count posts per platform
  const platformCounts: Record<string, number> = {};
  for (const p of posts) {
    platformCounts[p.platform] = (platformCounts[p.platform] || 0) + 1;
  }

  // Render post based on platform
  const renderPost = (post: SocialPost) => {
    switch (activePlatform) {
      case 'x': return <XPost key={post.id} post={post} />;
      case 'bluesky': return <BlueskyPost key={post.id} post={post} />;
      case 'reddit': return <RedditPost key={post.id} post={post} />;
      case 'threads': return <ThreadsPost key={post.id} post={post} />;
      case 'linkedin': return <LinkedInPost key={post.id} post={post} />;
      case 'mastodon': return <MastodonPost key={post.id} post={post} />;
    }
  };

  return (
    <div>
      <style>{`
        @keyframes preview-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .preview-platform-tab:hover { opacity: 1 !important; }
        .preview-filter-btn:hover { background: rgba(255,255,255,0.1) !important; }
        .preview-phone-feed::-webkit-scrollbar { width: 0; }
        .preview-phone-feed { scrollbar-width: none; }
        @media (max-width: 500px) {
          .preview-phone-frame { transform: scale(0.85); transform-origin: top center; }
        }
        @media (max-width: 400px) {
          .preview-phone-frame { transform: scale(0.75); transform-origin: top center; }
        }
      `}</style>

      {/* Platform Tabs */}
      <div style={{
        display: 'flex',
        gap: 2,
        marginBottom: 16,
        background: 'var(--admin-surface)',
        borderRadius: 'var(--admin-radius)',
        padding: 4,
        border: '1px solid var(--admin-border)',
      }}>
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            className="preview-platform-tab"
            onClick={() => setActivePlatform(p.id)}
            aria-label={`Preview ${p.label} posts`}
            aria-pressed={activePlatform === p.id}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 12px',
              background: activePlatform === p.id ? p.accent + '20' : 'transparent',
              border: activePlatform === p.id ? `1px solid ${p.accent}40` : '1px solid transparent',
              borderRadius: 'var(--admin-radius-sm)',
              color: activePlatform === p.id ? '#fff' : 'var(--admin-text-3)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: activePlatform === p.id ? 1 : 0.7,
              transition: 'background 0.15s var(--admin-ease), border-color 0.15s var(--admin-ease), color 0.15s var(--admin-ease), opacity 0.15s var(--admin-ease)',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: '1rem' }}>{p.icon}</span>
            {p.label}
            {platformCounts[p.id] > 0 && (
              <span style={{
                fontSize: '0.6875rem',
                background: activePlatform === p.id ? p.accent + '40' : 'rgba(255,255,255,0.08)',
                padding: '1px 6px',
                borderRadius: 10,
                fontWeight: 700,
              }}>
                {platformCounts[p.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '0.6875rem', color: 'var(--admin-text-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Persona:</span>
        {['all', 'brand', 'reporter', 'skeptic', 'curator'].map(p => (
          <button
            key={p}
            className="preview-filter-btn"
            onClick={() => setPersonaFilter(p)}
            style={{
              padding: '3px 10px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: personaFilter === p ? 'rgba(255,255,255,0.12)' : 'transparent',
              border: personaFilter === p ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
              borderRadius: 4,
              color: personaFilter === p ? '#fff' : 'var(--admin-text-3)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textTransform: 'capitalize',
            }}
          >
            {p}
          </button>
        ))}

        <span style={{ width: 1, height: 16, background: 'var(--admin-border)', margin: '0 4px' }} />

        <span style={{ fontSize: '0.6875rem', color: 'var(--admin-text-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status:</span>
        {['all', 'draft', 'scheduled', 'posted', 'failed', 'skipped'].map(s => (
          <button
            key={s}
            className="preview-filter-btn"
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '3px 10px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: statusFilter === s ? 'rgba(255,255,255,0.12)' : 'transparent',
              border: statusFilter === s ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
              borderRadius: 4,
              color: statusFilter === s ? '#fff' : 'var(--admin-text-3)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textTransform: 'capitalize',
            }}
          >
            {s}
          </button>
        ))}

        {uniqueArticles.length > 1 && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--admin-border)', margin: '0 4px' }} />
            <select
              value={articleFilter}
              onChange={e => setArticleFilter(e.target.value)}
              style={{
                padding: '3px 8px',
                fontSize: '0.75rem',
                background: 'var(--admin-surface-2)',
                border: '1px solid var(--admin-border-2)',
                borderRadius: 4,
                color: 'var(--admin-text)',
                fontFamily: 'inherit',
              }}
            >
              <option value="all">All articles</option>
              {uniqueArticles.map(slug => (
                <option key={slug} value={slug}>{slug}</option>
              ))}
            </select>
          </>
        )}

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-4)' }}>
            {filtered.length} post{filtered.length !== 1 ? 's' : ''}
          </span>
          <a
            href="/admin"
            style={{
              fontSize: '0.6875rem',
              color: 'var(--admin-accent)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Dashboard &rarr;
          </a>
        </span>
      </div>

      {/* Display mode: Phone or Desktop */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, animation: 'preview-fade 0.3s var(--admin-ease)' }}>
        {/* iPhone Frame */}
        <div className="preview-phone-frame" style={{
          width: 393,
          flexShrink: 0,
          position: 'relative',
        }}>
          {/* Phone bezel */}
          <div style={{
            background: '#1a1a1a',
            borderRadius: 44,
            padding: '12px 10px',
            boxShadow: `
              0 0 0 2px #333,
              0 0 0 4px #1a1a1a,
              0 20px 60px rgba(0,0,0,0.5),
              0 0 120px ${platformConfig.accent}10
            `,
          }}>
            {/* Dynamic Island */}
            <div style={{
              position: 'absolute',
              top: 18,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 126,
              height: 36,
              background: '#000',
              borderRadius: 20,
              zIndex: 10,
            }} />

            {/* Screen */}
            <div style={{
              background: platformConfig.bg,
              borderRadius: 36,
              overflow: 'hidden',
              position: 'relative',
            }}>
              {/* Status bar */}
              <div style={{
                padding: '14px 28px 8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#fff',
                paddingTop: 52,
              }}>
                <span>9:41</span>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem' }}>📶</span>
                  <span style={{ fontSize: '0.75rem' }}>📡</span>
                  <span style={{ fontSize: '0.875rem' }}>🔋</span>
                </div>
              </div>

              {/* App Header */}
              <div style={{
                padding: '8px 16px 10px',
                borderBottom: `1px solid ${platformConfig.accent}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.25rem' }}>{platformConfig.icon}</span>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.0625rem' }}>{platformConfig.label}</span>
                </div>
                <span style={{
                  fontSize: '0.625rem',
                  color: platformConfig.accent,
                  fontWeight: 700,
                  padding: '2px 8px',
                  border: `1px solid ${platformConfig.accent}40`,
                  borderRadius: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  Preview
                </span>
              </div>

              {/* Feed */}
              <div className="preview-phone-feed" style={{ height: 640, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#777' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 8, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</div>
                    <div style={{ fontSize: '0.875rem' }}>Loading posts...</div>
                  </div>
                ) : error ? (
                  <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#ef4444' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠</div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: 4 }}>Failed to load posts</div>
                    <div style={{ fontSize: '0.8125rem', color: '#f87171', marginBottom: 12 }}>{error}</div>
                    <button onClick={fetchPosts} style={{ padding: '6px 16px', fontSize: '0.8125rem', fontWeight: 600, background: '#ef444420', border: '1px solid #ef444440', borderRadius: 6, color: '#f87171', cursor: 'pointer', fontFamily: 'inherit' }}>Retry</button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#777' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 16, opacity: 0.3 }}>{platformConfig.icon}</div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#aaa', marginBottom: 4 }}>No {platformConfig.label} posts</div>
                    <div style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>Generate social content from the<br />dashboard to preview posts here.</div>
                  </div>
                ) : (
                  filtered.map(post => {
                    const charLimit = PLATFORM_CHAR_LIMITS[post.platform] || 500;
                    const charCount = post.content_text.length;
                    const overLimit = charCount > charLimit;
                    return (
                      <div key={post.id} style={{ position: 'relative' }}>
                        {renderPost(post)}
                        {/* Overlay: status + char count + copy */}
                        <div style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          display: 'flex',
                          gap: 4,
                          alignItems: 'center',
                        }}>
                          {/* Char count */}
                          <span
                            title={`${charCount}/${charLimit} characters`}
                            style={{
                              fontSize: '0.5rem',
                              fontWeight: 700,
                              fontFamily: 'var(--admin-mono)',
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: overLimit ? '#ef444425' : '#ffffff08',
                              color: overLimit ? '#ef4444' : '#666',
                              border: `1px solid ${overLimit ? '#ef444430' : '#ffffff10'}`,
                            }}
                          >
                            {charCount}/{charLimit}
                          </span>
                          {/* Copy button */}
                          <button
                            onClick={() => copyPostText(post)}
                            aria-label="Copy post text"
                            title="Copy post text"
                            style={{
                              fontSize: '0.5625rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: copiedId === post.id ? '#22c55e20' : '#ffffff08',
                              color: copiedId === post.id ? '#22c55e' : '#666',
                              border: `1px solid ${copiedId === post.id ? '#22c55e30' : '#ffffff10'}`,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            {copiedId === post.id ? '✓' : '⎘'}
                          </button>
                          {/* Status badge */}
                          {post.status !== 'posted' && (
                            <span style={{
                              fontSize: '0.5rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: post.status === 'scheduled' ? '#1d9bf020' : post.status === 'failed' ? '#ef444420' : '#ffffff10',
                              color: post.status === 'scheduled' ? '#1d9bf0' : post.status === 'failed' ? '#ef4444' : '#888',
                              border: `1px solid ${post.status === 'scheduled' ? '#1d9bf030' : post.status === 'failed' ? '#ef444430' : '#ffffff15'}`,
                            }}>
                              {post.status}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Home indicator */}
              <div style={{
                padding: '8px 0 6px',
                display: 'flex',
                justifyContent: 'center',
              }}>
                <div style={{
                  width: 134,
                  height: 5,
                  borderRadius: 3,
                  background: '#fff',
                  opacity: 0.2,
                }} />
              </div>
            </div>
          </div>
        </div>

        {/* Desktop/Wide Preview (Reddit, LinkedIn get this) */}
        {(activePlatform === 'reddit' || activePlatform === 'linkedin') && (
          <div style={{
            flex: 1,
            maxWidth: 680,
            background: platformConfig.bg,
            borderRadius: 12,
            border: `1px solid ${platformConfig.accent}15`,
            overflow: 'hidden',
            boxShadow: `0 4px 40px rgba(0,0,0,0.3)`,
          }}>
            {/* Desktop browser bar */}
            <div style={{
              padding: '8px 12px',
              background: '#2a2a2a',
              borderBottom: '1px solid #3a3a3a',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
              </div>
              <div style={{
                flex: 1,
                background: '#1a1a1a',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: '0.75rem',
                color: '#888',
                fontFamily: 'var(--admin-mono)',
              }}>
                {activePlatform === 'reddit' ? 'reddit.com/r/health' : 'linkedin.com/feed'}
              </div>
            </div>
            <div style={{ maxHeight: 720, overflowY: 'auto', padding: activePlatform === 'reddit' ? '8px' : 0 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#777' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.3 }}>{platformConfig.icon}</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#aaa' }}>No {platformConfig.label} posts</div>
                </div>
              ) : (
                filtered.map(post => {
                  const charLimit = PLATFORM_CHAR_LIMITS[post.platform] || 500;
                  const charCount = post.content_text.length;
                  const overLimit = charCount > charLimit;
                  return (
                    <div key={post.id} style={{ position: 'relative' }}>
                      {renderPost(post)}
                      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span title={`${charCount}/${charLimit}`} style={{
                          fontSize: '0.5625rem', fontWeight: 700, fontFamily: 'var(--admin-mono)',
                          padding: '1px 5px', borderRadius: 3,
                          background: overLimit ? '#ef444425' : '#ffffff08',
                          color: overLimit ? '#ef4444' : '#666',
                          border: `1px solid ${overLimit ? '#ef444430' : '#ffffff10'}`,
                        }}>{charCount}/{charLimit}</span>
                        <button onClick={() => copyPostText(post)} aria-label="Copy post text" title="Copy post text" style={{
                          fontSize: '0.625rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                          background: copiedId === post.id ? '#22c55e20' : '#ffffff08',
                          color: copiedId === post.id ? '#22c55e' : '#666',
                          border: `1px solid ${copiedId === post.id ? '#22c55e30' : '#ffffff10'}`,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>{copiedId === post.id ? '✓' : '⎘'}</button>
                        {post.status !== 'posted' && (
                          <span style={{
                            fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 3,
                            background: post.status === 'scheduled' ? '#1d9bf020' : post.status === 'failed' ? '#ef444420' : '#ffffff10',
                            color: post.status === 'scheduled' ? '#1d9bf0' : post.status === 'failed' ? '#ef4444' : '#888',
                            border: `1px solid ${post.status === 'scheduled' ? '#1d9bf030' : post.status === 'failed' ? '#ef444430' : '#ffffff15'}`,
                          }}>{post.status}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
