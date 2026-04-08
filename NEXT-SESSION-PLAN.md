# Next Session Plan

> **Status**: v22.5.0 live. ~192 published articles. Site is fully SSR-driven from Supabase. Default typography is Newsreader. Copy-edit stage no longer flattens human-written headers. Social-engine validates `mode` and chains briefs cross-persona. Independence skip monitoring surfaces in dashboard. **Description extraction unified across all four publish paths via `_shared/description.ts` — standfirsts/deks no longer get fused with body paragraphs and breadcrumb strips no longer leak into descriptions.**

> **Last updated**: 2026-04-08

---

## What Shipped Since v18.7 (3 weeks of work)

### v22.x — Typography Preset System
- **37 editorial type presets** (Newsreader, Fraunces, Source Serif, Bodoni Moda, Spectral, Plex, Apple News, New Yorker tribute, Playfair, etc.) loaded via per-preset `<link>` tags with deduped families
- **`/admin/typography` gallery** — 2-column preview cards with full editorial sample, sorted by recommendation quality (Medium/Newsreader leads, Playfair demoted to #26, Tinos to #37)
- **Instant apply** — optimistic UI, no page reload, cookie POST in background
- **`font-size-adjust: ex-height`** normalization so different x-height fonts read at the same apparent size; per-preset overrides for Cormorant, Bodoni, etc.
- **CDN cache bypass** — middleware reads `typography_preset` cookie and switches to `private, no-store` for cookie-bearing visitors; anonymous visitors still get full edge caching
- **Default preset** is still `classic` (Playfair) — see "Open decisions" below

### v22.0 — SSR Migration
- Astro switched to `output: 'server'` on Vercel serverless adapter
- Single dynamic `[slug].astro` route replaced 172 static article pages
- Articles served from Supabase `articles` table at request time
- Custom `sitemap.xml` SSR endpoint replaced `@astrojs/sitemap`
- All edge functions write to DB only — no GitHub commits for article publishing
- Per-request article cache + middleware CDN cache headers (5 min for articles, 1 min for listings)
- Deleted 343 static content files (`src/content/`); deleted dead `_shared/github.ts`

### v21.0 — Self-Learning Editorial Pipeline
- 3 materialized views (`mv_category_performance`, `mv_scout_performance`, `mv_social_performance`) refreshed daily at 4am UTC
- `get_editorial_digest()` SQL function returns single JSONB blob; pipeline stages inject analytics context into prompts
- Scouts see top performers + per-desk publish rates; QC sees category baselines; Grok sees its own bias patterns; social engine/writer get engagement intelligence + learned templates; pinger sees per-source accuracy
- `social_templates` auto-populated from posts scoring 2x+ platform average

### v20.x — Publishing & Cost Hardening
- **Atomic cost tracking** (`increment_article_cost`/`increment_overhead_cost` SQL functions) — fixes race condition + double-billing on retries across parallel API calls
- **All publish paths unified** — `publish-direct`, `submit-new-article`, edit page, and `stage-publish` all set `sort_order`, `narration_url`, `hero_image_light`; ghost articles eliminated
- **Three-way upload toggle**: Topic → Full Chain / Article → Review → Publish / Ready → Art + Publish
- **Replace Article button** on every published card (review-or-direct toggle, slug-locked, title editable)
- **Auto-reconcile section IDs** from h2 text at publish; intro paragraph dedup; markdown standfirst → description auto-extraction
- **Force narration regen** on every publish (~$0.001, not worth conditional skip complexity)
- **Cost optimization**: removed auto-pick from queue (admin must click Produce), pinger `*/15`→`*/30`, social-poster `*/5`→`*/15`, fire-and-forget illustration + narration. Article cost trended from ~$0.94 → ~$0.39
- **Admin hardening**: HttpOnly auth cookies, server-side logout, sandboxed preview iframe, beforeunload warning on unsaved edits
- **ErrorBoundary** wrapping all 6 React islands
- **Self-learning scout dedup overhaul** (v20.5.0): preserved health-domain words, included skipped/failed/killed in fingerprints, raised threshold to 35% bidirectional + bigrams, AI semantic dedup pass via Flash, differentiated Trending/Investigation/Contrarian desks

### v19.x — Theme-aware illustration pairs (dark + light variants), 502 error fix on pipeline-admin, human-Opus prose protection (code-level title lock, prose rewrite guard), markdown auto-conversion in submit-article, direct publish path

### v18.8 — Article typography uplift (body 20px / 1.8 line-height), unified 3:2 image aspect ratios, two-author byline split (Marc London / Paul Quilici)

---

## Current Architecture

- **Frontend**: Astro v5 SSR, React islands for admin + interactive components, Tailwind 4, View Transitions API
- **Data**: Supabase Postgres is the single source of truth. No file-based content. Articles, pipeline logs, queue, social tables, dedup log, materialized views
- **Pipeline**: 8 stages, hybrid (Opus writes via Max subscription), chain-dispatch via `pg_net`, safety-net cron every 5 min. ~$0.13–0.39/article depending on stages used
- **Social system**: 8 tables, 4 personas, 14 platform configs, 6 edge functions, 3 cron jobs, Bloomberg-inspired dashboard
- **Cron schedule** (9 jobs): 3 scouts (6am/2pm/10pm UTC), pinger `*/30`, featured-rotation `0 */6`, article-produce `*/5` (safety net only), social-poster `*/15`, social-planner `0 5`, social-sync `0 */6`, analytics-refresh `0 4`

---

## What Shipped in v22.4.0 (this session)

- **Typography default → Newsreader** (`medium` preset). `DEFAULT_PRESET_ID` flipped; admin reset button reads default name from data attributes
- **Copy-edit header lock for human-Opus articles** — code-level guard mirrors title lock. Headers BLOCKED unless structurally broken (empty / dangling punctuation / dangling preposition / stray HTML). Length is no longer brokenness. Triggered by OCD article 2026-04-08 regression where a 9-word editorial header was flattened to a 4-word listicle hook. Prompt's hard "4–8 words = failure" rule also softened to a guideline
- **Social-engine `mode` validation** + cross-brief `references` chaining (3-tier cascade: AI value → prior persona on same platform → earlier persona in same brief)
- **Independence skip monitoring** — `pipeline-admin` returns `independenceSkipped24h`; `PipelineMonitor` renders red warning pill when ≥3 in 24h
- `TYPOGRAPHY-AUDIT.md` + `alumi news — Style Guide.pdf` committed

---

## Priority for Next Session

### 1. Social platform credentials — still the blocker for the social system to actually post (HIGH if you want social to ship)

The full social pipeline (engine → writer → poster → sync) is built and tested end-to-end against the database. **Nothing has ever been posted because no platform credentials are set.** `social_platform_config.api_configured = false` for all 14 platforms.

Setup commands (unchanged from old plan, still valid):
```bash
# Bluesky (easiest, no review)
supabase secrets set BLUESKY_HANDLE=alumihealth.bsky.social BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
# Then: UPDATE social_platform_config SET api_configured = true WHERE platform = 'bluesky';

# Reddit (requires script-type app at reddit.com/prefs/apps)
supabase secrets set REDDIT_CLIENT_ID=xxx REDDIT_CLIENT_SECRET=xxx REDDIT_USERNAME=xxx REDDIT_PASSWORD=xxx
# Then: UPDATE social_platform_config SET api_configured = true WHERE platform = 'reddit';

# Mastodon (mastodon.social → Preferences → Development)
supabase secrets set MASTODON_ACCESS_TOKEN=xxx MASTODON_INSTANCE=mastodon.social
# Then: UPDATE social_platform_config SET api_configured = true WHERE platform = 'mastodon';
```

After credentials are set, end-to-end verification:
- Click "Planner" in admin dashboard → verify catalog mining + briefs generated in `social_content_plan`
- Click "Writer" → verify posts created in `social_posts`
- Click "Poster" → verify dispatch to platform APIs (check returned `platform_post_id`)
- Click "Sync" → verify engagement metrics return after 24h

---

### 2. Deferred / low priority (still open, no recent activity)

- **Beehiiv newsletter activation** — code is conditional on `BEEHIIV_API_KEY` + `BEEHIIV_PUBLICATION_ID` env vars in `src/pages/api/subscribe.ts`. Falls back gracefully if absent. Activation requires Beehiiv account
- **Lighthouse audit** — never run since the SSR migration. Worth a baseline now that we're on per-request rendering
- **HighlightShare race condition** — `src/components/HighlightShare.astro`, untouched since v18, still low priority
- **FloatingTOC tablet height constraint** — fixed `max-height: 60vh` with no tablet media query, untouched since v18, still low priority
- **Narration voice tuning** — current voice `GK8yfgyvbDZaYf0rm78A` on `eleven_multilingual_v2`, no recent feedback
- **Visual verification & device testing pass** — never done systematically

---

### 3. Phase 2 Social (when phase 1 is actually posting)

- LinkedIn API (company page + OAuth2 app — requires Meta-style review)
- Threads API (Meta developer account)
- Telegram Bot API (BotFather, lowest friction)
- Medium API (integration tokens)
- Pinger → social emergency dispatch wiring
- Velocity amplification — when one platform's post hits 3x avg, auto-dispatch to others

---

## Codebase Health

- **Zero `TODO` / `FIXME` / `XXX` / `HACK` comments** anywhere in `src/` or `supabase/functions/`
- **TypeScript strict** clean
- **No raw `console.*` in production paths** (verified)
- **All 9 cron jobs healthy and documented**
- **Pipeline cost tracking** atomic and complete across all 20 edge functions
