# Next Session Plan

> **Status**: v18.0.0 live. ~190 published articles across 9 categories. Comprehensive SEO system: NewsArticle schema, E-E-A-T signals, CollectionPage on topics, dynamic robots.txt, smart sitemap, all site URLs centralized in `src/config/site.ts`. Domain migration: set `SITE_URL` env var in Vercel + update `FALLBACK_URL` in site.ts.

---

## Current Architecture (v17.2.0)

- **Navigation**: domain-grouped dropdown (Mind/Body/Medicine/Environment), TopicNav with per-category hover dropdowns, SideNav grouped by domain, MobileNav with improved scroll sensitivity, QuickNav floating pill
- **Breadcrumbs**: visual breadcrumbs on topic and collection pages (Home > Articles > Category)
- **Sort Dropdowns**: custom glass dropdowns on articles index + category pages
- **Category Landing Pages**: `/topics/[slug]` — 9 pages with gradient hero, editorial metadata, featured article, sorted grid, breadcrumbs
- **Collections**: 5 curated themed reading lists at `/collections/[slug]` — now with share buttons in hero
- **Start Here**: `/start-here` — onboarding with 5 handpicked articles, editorial philosophy, domain browser
- **How We Write**: `/howwewrite` — editorial manual (pipeline transparency, voice standards)
- **Author Bylines**: all articles use "Max Lundin" with model-specific roles
- **Reading Progress**: localStorage scroll tracking per article, "Continue Reading" section on homepage
- **Pipeline**: 8-stage (added stage-copy-edit between QC and publish). Hybrid model (human writes with Opus). ~$0.13/article
- **Narration**: ElevenLabs TTS with admin voice settings panel (6 presets + custom sliders)
- **Security**: HSTS preload, CSP hardening, immutable asset caching
- **Admin**: Pipeline/Articles/Agents tabs. Supabase Realtime live updates
- **Newsletter**: `/api/subscribe` → Supabase + Beehiiv forward (when BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID env vars set)

## What Was Done This Session (v18.0.0)

1. **Centralized site identity** — `src/config/site.ts` — brand name, URL, social handles, editorial paths, OG dimensions, author constants. Single `FALLBACK_URL` replaces 5 scattered hardcoded URLs
2. **NewsArticle schema** — `Article` → `NewsArticle` in JSON-LD. Google News eligible. Includes wordCount, copyrightYear, inLanguage
3. **E-E-A-T for YMYL health content** — Organization schema: `publishingPrinciples` (→ /howwewrite), `actionableFeedbackPolicy` (→ /about), `foundingDate`, `sameAs` (Twitter + Bluesky), logo with dimensions
4. **Person author** — Schema author is now `Person` with `jobTitle` + `worksFor` Organization, using actual per-article name
5. **CollectionPage on topic pages** — All 10 `/topics/[slug]` pages emit `CollectionPage` + `BreadcrumbList` JSON-LD
6. **Homepage JSON-LD** — `index.astro` now has `Organization` + `WebSite` schemas (enables Sitelinks Search Box)
7. **Article OG tags** — `article:published_time`, `article:modified_time`, `article:author`, `article:section`, `article:tag` on every article
8. **Enhanced meta** — `og:locale`, `og:image:alt`, `twitter:image:alt` on all pages
9. **Dynamic robots.txt** — Reads `Astro.site`, auto-updates on domain migration. Added `Disallow: /admin/`
10. **Smart sitemap** — `SITE_URL` env var, filters /admin/, per-page priorities (homepage 1.0, articles 0.9, topics 0.8)
11. **Admin noindex** — `X-Robots-Tag: noindex, nofollow` in vercel.json for `/admin/*`
12. **RSS enrichment** — copyright, managingEditor, Atom self-link, per-article author
13. **Build**: `npm run build` passes clean

## Two Sessions Ago (v17.6.0)

1. **Footer category links fixed** — Was linking to `/articles?topic=` (broken); now `/topics/[slug]`. Imported `getCategorySlug` from category-domains
2. **Empty alt text fixed** — `collections/[slug].astro` and `reading-list.astro` hero images now use `heroImageAlt || title` instead of `alt=""`
3. **ContinueReading TypeScript** — Added `ReadingProgress` interface, eliminated 3 `any` casts in localStorage progress reader

## Three Sessions Ago (v17.5.0)

1. **stage-write chain dispatch** — Added `dispatchStage("stage-independence", logId)` to fallback write path. Articles no longer get stuck at "written"
2. **constants.ts status completeness** — Added `"writing"`, `"rewriting_voice"` to `ACTIVE`; `"voice_rewrite_pending"`, `"voice_rewrite_done"` to `IN_PIPELINE`
3. **refine-article model fix** — `"gemini-2.5-flash"` → `MODELS.DEFAULT_GEMINI` (hardcoded string, now last remaining in pipeline)
4. **db.ts calcCost fallback** — `"claude-sonnet-4-6"` → `MODELS.DEFAULT_CLAUDE` (last hardcoded model string in shared utilities)
5. **Deployed**: All 11 pipeline functions redeployed (shared file changes)

## What Was Done Last Session (v17.4.0)

1. **Voice-rewrite chain dispatch fix** — QC now dispatches `stage-voice-rewrite` immediately on `rewrite_voice` decision (was waiting for 5-min cron). Voice-rewrite now dispatches `stage-copy-edit` immediately on completion (was waiting another 5-min cron). Up to 10-minute pipeline delay eliminated on voice-rewrite path
2. **Admin types.ts sync** — `MODEL_PEN_NAMES` updated to use "Max Lundin" for all models (was stale: Carl Lundin, Max Quilici, Eli Vance, etc.)
3. **Deployed**: `stage-qc`, `stage-voice-rewrite` redeployed to Supabase

## What Was Done Last Session (v17.3.0)

1. **Newsletter copy bug** — Fixed "Real Wealth Starts Here" (alumi Wealth leftover) → "Evidence in Your Inbox" in both `Newsletter.astro` AND `index.astro` (homepage newsletter section had same stale copy)
2. **Pipeline type completeness** — Added `copy_editing`/`copy_edited` to `PipelineStatus` type and `getStatusText` map in `types.ts`
3. **Backend constants** — Added `copy_editing`/`copy_edited` to `ACTIVE`/`IN_PIPELINE` arrays in `_shared/constants.ts`
4. **Beehiiv integration** — `/api/subscribe` now forwards to Beehiiv API after Supabase save. Graceful non-fatal fallback if env vars not set. Ready to activate once account is created
5. **Share buttons on collections** — Added `ShareButtons` component to collection hero with dark overlay styling
6. **Share buttons on topic pages** — Added `ShareButtons` to `/topics/[slug]` hero alongside article count
7. **backfill-costs fix** — Added copy-edit to `STAGE_ESTIMATES` + `STAGES_BY_STATUS` in pipeline-admin so cost reporting covers all 8 stages
8. **refine-article model fix** — Replaced hardcoded `"grok-3"` with `MODELS.INDEPENDENCE` (grok-4). Imported constants.ts.
9. **CLAUDE.md overhaul** — Updated to reflect 8-stage pipeline, all new pages/components, model chain corrections, Beehiiv env vars, topic_dedup_log, v17 architecture
10. **Deployed**: `pipeline-admin` + `refine-article` redeployed to Supabase

## Priority for Next Session

### 1. Beehiiv Account Activation
- Create Beehiiv account at beehiiv.com
- Set `BEEHIIV_API_KEY` + `BEEHIIV_PUBLICATION_ID` in Vercel env vars
- Test subscription flow end-to-end (subscribe → verify in Beehiiv dashboard)
- Configure welcome email in Beehiiv (first touchpoint for new subscribers)

### 2. Content Production
- Use merge system to clean up topic queue
- Produce articles to fill content gaps (cardiology, diabetes, immunology, musculoskeletal, respiratory)
- Pick 3-5 topics, produce, write with Opus, verify end-to-end

### 3. Visual Verification & Device Testing
- Test all changes on real iPhone (SE, 14 Pro) — collection share buttons, contrast, SeriesNav, HighlightShare
- Verify CommandPalette empty state on mobile
- Check breadcrumbs truncation on narrow screens (375px)
- Light + dark mode verification on topic/collection pages

### 4. Narration Voice Tuning
- Listen to narrations generated with different presets, pick a house standard
- Consider logging voice settings per article for reproducibility

### 5. Further Polish
- Lighthouse audit on new pages (topic, collection)
- Add `updatedDate` to articles that have been revised
- Consider "Most Read" section (needs analytics/view counting)
