# Next Session Plan

> **Status**: v17.3.0 live. ~190 published articles across 9 categories. Admin dashboard uses Supabase Realtime for live pipeline updates. 8-stage pipeline (stage-copy-edit live).

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

## What Was Done This Session (v17.3.0)

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
