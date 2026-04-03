/**
 * site.ts — Single source of truth for all site identity & SEO configuration.
 *
 * DOMAIN MIGRATION: Set SITE_URL env var in Vercel (e.g. https://aluminews.com).
 * astro.config.mjs reads the same env var, so Astro.site updates everywhere.
 * Update FALLBACK_URL below to the new domain once live.
 *
 * Nothing else needs to change on domain migration.
 */

// ─── Canonical URL ────────────────────────────────────────────────────────────

/**
 * Update this when you move to the real domain.
 * This is the fallback when SITE_URL env var is not set (local dev, preview deploys).
 */
export const FALLBACK_URL = 'https://tune-health.vercel.app';

// ─── Brand Identity ───────────────────────────────────────────────────────────

export const SITE_NAME = 'alumi news';
export const SITE_TAGLINE = 'Evidence. Wherever It Leads.';
export const SITE_DESCRIPTION =
  'Evidence-based health journalism. Independent analysis of health claims — peer-reviewed journals and naturopathic remedies alike. No ads, no sponsors, no agenda.';

/** Used in JSON-LD, OG tags, RSS */
export const SITE_LOGO_PATH = '/assets/logo.png';
export const SITE_OG_IMAGE_PATH = '/assets/og-image.png';
export const SITE_OG_IMAGE_WIDTH = 1200;
export const SITE_OG_IMAGE_HEIGHT = 675;

/** The pen name used for all articles */
export const EDITORIAL_AUTHOR_NAME = 'Max Lundin';
export const EDITORIAL_AUTHOR_ROLE = 'Editor-at-Large';
export const EDITORIAL_ORG_NAME = 'alumi news';

/** Approximate words per minute for word count estimation from readTime */
export const WORDS_PER_MINUTE = 220;

// ─── Social / Presence ───────────────────────────────────────────────────────

export const SOCIAL = {
  twitterHandle: '@aluminews',
  twitterUrl: 'https://x.com/aluminews',
  blueskyUrl: 'https://bsky.app/profile/aluminews.bsky.social',
  rssPath: '/rss.xml',
};

// ─── E-E-A-T / Editorial Policy URLs ─────────────────────────────────────────
// These are used in JSON-LD Organization schema to signal editorial standards
// to Google for YMYL (health) content. Critical for search quality signals.

export const EDITORIAL = {
  /** How we write — editorial standards, AI pipeline transparency */
  publishingPrinciples: '/howwewrite',
  /** About / mission page */
  aboutUrl: '/about',
  /** Founding year (used in Organization schema) */
  foundingYear: '2024',
};

// ─── Derived helpers (used in components that can't use Astro.site) ──────────
// Components that run in JS context (ShareButtons, HighlightShare) need the
// site URL. They should use getSiteUrl() so the fallback is always consistent.

export function getSiteUrl(): string {
  // In SSR context this is populated from the env var via astro.config.mjs.
  // In pure JS/client context we fall back to the constant.
  return typeof import.meta !== 'undefined' && import.meta.env?.SITE
    ? import.meta.env.SITE
    : FALLBACK_URL;
}
