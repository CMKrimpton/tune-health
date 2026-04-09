# Next Session Plan

> **Status**: v22.8.3 live. ~192 published articles. Site is fully SSR-driven from Supabase. Default typography is Newsreader. **Full human-article protection**: title lock + description lock + voice-rewrite guard across all pipeline stages (QC, copy-edit, publish). `###` standfirsts handled correctly in extraction, dedup, and markdown conversion. Retry/produce-topic guards prevent article corruption. Proper 404 status codes for SEO. Per-cache timestamps prevent stale data. `extractDescriptionFromHtml` now finds `<h3>` elements.

> **Last updated**: 2026-04-09

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

## What Shipped in v22.8.x (this session — 2026-04-09)

### Human-article protection (v22.8.0–22.8.1)
- **Description lock**: `resolveDescription()` in stage-qc mirrors `resolveTitle()` — human standfirsts preserved unless `descriptionLooksBroken()`. Applied in stage-qc (5 code paths), stage-copy-edit, stage-publish
- **Title lock in stage-publish + stage-copy-edit**: Both were missing the lock — QC's rewritten headline always won. Now `metadata.title` wins for human-opus articles
- **Markdown H1 extraction**: `submit-article` now captures H1 before `convertMarkdownToSiteHtml` strips it. Title priority: `writerTitle → markdownH1 → logEntry.title → editorBrief.headline`

### Pipeline audit (v22.8.2)
- **`###` standfirst**: `extractDescriptionFromMarkdown` handles `#{2,3}`, `convertMarkdownToSiteHtml` skips `###` standfirsts (mirrors `##` pattern), `stripDuplicateStandfirst` matches `<h3>` not just `<p>`
- **Voice-rewrite human guard**: Hard `isHumanWritten` check blocks Opus prose destruction, advances to copy-edit
- **Stage-publish description gate**: Forces `isStandfirst: true` for human articles in second `descriptionLooksBroken` check
- **Stage-copy-edit threshold**: Aligned description "broken" threshold (20 → 50 chars)
- **Score preservation**: `|| null` → `?? null` for independence_score/editor_score

### Full-app ultra-audit (v22.8.3)
- **`extractDescriptionFromHtml` + `getIntroParagraphs`**: Now find `<h3>` elements as standfirsts (root cause of invisible standfirst + duplication)
- **Upload direct path**: Removed hardcoded `description: ''` — server now extracts from body
- **Retry guard**: Blocks retrying published articles (was silently corrupting live content)
- **Produce-topic guard**: Checks for existing in-progress pipeline run before creating new one
- **PostgREST filter**: `improve-article` fix — `'("published","failed")'` → `"(published,failed)"`
- **404 status codes**: `[slug].astro` + `topics/[slug].astro` return proper 404 instead of 302 redirect
- **Middleware security**: Removed `PUBLIC_ADMIN_TOKEN` fallback, removed dead `isArticle ? 15 : 15` ternary
- **Env var trimming**: `supabase.ts` now `.trim()`s env vars per CLAUDE.md gotcha #4
- **Cache timestamps**: Split shared `_cacheTimestamp` into per-cache timestamps (coming-soon no longer invalidates articles cache)
- **Dead code**: Removed unused `sentenceEnd` variable, removed unused `allTags` fetch + import

---

## Priority for Next Session

### 1. Add "Science" as a 10th category (user requested)

Some articles don't fit the 9 health-specific categories (e.g., "The Modelers and the Operators" is in Neuroscience but is really about AI/epistemology; the moon landings investigation is general science). User wants a "Science" category for topics that aren't health/medical.

**Files that need changes**: `_shared/constants.ts` (VALID_CATEGORIES, CATEGORY_GRADIENTS, CATEGORY_KEYWORDS), `admin/types.ts` (VALID_CATEGORIES, CATEGORY_GRADIENTS, GRADIENT_HEX_MAP), `category-domains.ts` (CATEGORY_DOMAINS, CATEGORY_META), `articles.ts` (categoryGradients). Then run the `reclassify-all-categories` action with updated decision rules.

**Open decisions**: Which domain should it go in? (new "Ideas"/"Discovery" domain, or expand "Medicine" to "Science & Medicine"?). What color/gradient? (cyan/teal-blue suggested). What keywords for auto-classification?

### 2. Social platform credentials — still the blocker for the social system to actually post (HIGH if you want social to ship)

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
