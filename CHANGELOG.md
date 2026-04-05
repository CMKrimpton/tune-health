# Changelog

All notable changes to the alumi news project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [20.5.1] - 2026-04-04

### Added — Replace Article Button

- **Replace button on published articles** — each published article card in the Pipeline tab now has a "Replace" button alongside Edit/View/Delete
- Opens a modal with editable title (pre-filled), locked slug, a textarea for new HTML/Markdown, and a two-way toggle:
  - **Review → Publish**: routes through Grok independence review → QC → copy edit → publish
  - **Direct Publish**: skips editorial stages, goes straight to art + narration + deploy
- Uses `submit-new-article` or `publish-direct` with the exact slug from the existing article — no more guessing slug from title
- Title field is editable so new headlines propagate correctly through the pipeline

## [20.5.0] - 2026-04-04

### Fixed — Scout Dedup Overhaul

The scout system was re-adding published, merged, and discarded stories because of 6 compounding dedup gaps. All fixed:

- **Stop words gutted fingerprints** — Previous stop list removed health-domain words (`health`, `study`, `brain`, `treatment`, `diet`, `food`, `drugs`, `clinical`, `patients`, etc.). For a health publication, those ARE the distinguishing words. Now only true function words (articles, prepositions, conjunctions) are filtered
- **Skipped topics invisible to dedup** — `buildFingerprints` excluded queue items with status "skipped". Now includes ALL queue statuses
- **Failed/killed articles invisible to dedup** — Pipeline articles with status "failed" were not in the fingerprint set AND were never logged to `topic_dedup_log`. Now `kill-article` writes to the permanent dedup log, and `buildFingerprints` includes all pipeline articles regardless of status
- **Weak word-overlap threshold** — Raised from 25%/3 words to 35% bidirectional + 50% small-set perspective. Added bigram matching for compound health terms (`sleep_apnea`, `back_pain`, `seed_oils`)

### Added — AI Semantic Dedup (Scout)

- After word-overlap filtering, a Flash call batch-compares surviving candidates against the 150 most recent article titles + queue topics. Catches "Tylenol for back pain" = "Acetaminophen efficacy for lumbar pain" — same story, different words. Fail-open: if Flash errors, all candidates pass through

### Added — Differentiated Scout Prompts

- **Gemini (6am)**: Trending Desk — must cite something from the last 7 days, searches Google Trends/news/journals
- **Sonnet (2pm)**: Investigation Desk — follow-the-money, "wait really?" stories, evidence contradictions
- **Grok (10pm)**: Contrarian Desk — what nobody else publishes, both-sides-dirty-hands stories
- All three now have a mandatory recency gate: "If you can't cite a specific recent event, don't include the topic"
- Recently rejected topics (killed/deleted in last 7 days) fed back into scout prompts as editorial signal

### Fixed — PipelineMonitor Crash

- `Cannot access 'p' before initialization` — `startRapidPolling` referenced `fetchStatus` before it was declared. Moved `fetchStatus` above `startRapidPolling` to fix temporal dead zone

### Fixed — Produced Articles Vanishing from Pipeline

- After clicking Produce, articles disappeared for ~3 minutes because `fetchStatus` at +1s overwrote the optimistic log entry before the server confirmed it via pg_net
- Optimistic logs now registered with 30s TTL protection — `fetchStatus` merges server logs with protected optimistic entries instead of replacing
- Queue item removed from display immediately on produce (no more vanishing into nowhere)
- Rapid polling (5s for 3 min) shows Research → Editor stage transitions in near-realtime

## [20.4.0] - 2026-04-04

### Security — Admin Hardening

- **HttpOnly cookies** — Login now POSTs to server-side middleware which sets the auth cookie with `HttpOnly; Secure; SameSite=Lax`. Cookie can no longer be read by client-side JavaScript. Admin token injected via `<meta>` tag for cross-origin API calls
- **Server-side logout** — Logout clears cookie via server POST (`/admin/logout`) instead of client-side `document.cookie` manipulation
- **Iframe sandbox** — Article preview iframe on edit page now has `sandbox="allow-same-origin allow-popups"` preventing script execution from article HTML
- **beforeunload warning** — Edit page warns before navigation if there are unsaved changes (autosave timer active)
- **100dvh fallback** — Login page adds `min-height: 100vh` fallback for older Safari before `100dvh`

### Added — Error Boundaries & Accessibility

- **ErrorBoundary component** — All 6 React islands (PipelineMonitor, ArticlesManager, AgentsPanel, SocialDashboard, ArticleEditor, SocialPreview) wrapped in error boundaries. Crashes show styled error message with "Try again" button instead of white screen
- **aria-live toast region** — Pipeline action feedback toasts wrapped in `aria-live="polite"` for screen reader announcements
- **aria-labels** — Dismiss buttons on pipeline cards and toast messages have descriptive labels. ConfirmModal adds `aria-describedby` linking to the message body
- **Color-only indicator text** — Stats strip adds `⚠`/`✓` text alongside color-only illustrated/narrated counts, plus `title` tooltips with exact counts

### Fixed — Pipeline Stage Visibility

- **Optimistic log injection** — When producing a topic, a synthetic log entry with status `started` is immediately injected into state, making the article appear in the Research box instantly instead of waiting for the next poll
- **Rapid polling** — After any produce action, polling switches to every 5 seconds for 3 minutes (was 60s). Admin now sees Research → Editor stage transitions in near-realtime
- **Reduced initial poll delay** — Post-produce fetch reduced from 2s to 1s

### Improved — Performance

- **useMemo for derived state** — Pipeline stage log mapping (`stageLogsMap`, `completedLogs`, `failedLogs`, `inPipeline`) wrapped in `useMemo`, only recalculates when `logs` array changes

### Changed — Research Prompt Anti-Hedging

- **No-hedging rule** added to both research prompts (trending + directed). Explicit ban on defensive formulas like "the story isn't that X is a fraud", "this doesn't mean X is bad". Research agent now reports evidence without pre-emptive institutional defense

## [20.3.1] - 2026-04-04

### Added — Delete from Recently Published

- **Delete button** on each published article card in the Pipeline tab — calls `delete-article` for full cleanup (GitHub, DB, illustrations, narration, pipeline logs) with confirmation dialog

### Fixed — Unified Delete Action

- **ArticlesManager delete** was calling two endpoints (`articles-api` delete then `delete-article` best-effort) — fragile and could leave orphaned files. Now all three delete surfaces (PipelineMonitor, ArticlesManager, Edit page) call `delete-article` only

## [20.3.0] - 2026-04-04

### Fixed — Article Ingestor (All Three Upload Paths)

The "Article → Review → Publish" path (`submit-new-article`) was missing every fix previously applied to the other two upload modes. Raw markdown published to the live site, QC renamed the human's title, and garbage description was synthesized from markdown headers.

- **Markdown → HTML conversion** added to `submit-new-article` — matches `submit-article` and `publish-direct`. Includes full HTML page wrapper stripping
- **Description auto-extraction** from markdown standfirst (paragraph after `# Title`) and `## subtitle` pattern (heading right after title with no body between). Falls back to first `<p>` in introduction section for HTML input
- **`_writtenBy` set to `"human-opus"`** in `submit-new-article` — enables title lock, prose protection, voice rewrite skip across all downstream stages
- **Title lock in `stage-qc`** — human-written articles now keep their original title. QC can suggest a headline but `metadata.title` takes priority via `resolveTitle()`. Previously QC blindly overwrote the writer's title
- **`## subtitle` deduplication** in `convertMarkdownToSiteHtml` — when the first `##` heading follows `# title` with no body paragraphs between, it's treated as a subtitle (description), not a section heading. Prevents the standfirst from appearing twice on the page
- **`narrationUrl` preserved across republishes** in `stage-publish` — reads existing `narration_url` from `articles` table and includes it in the initial JSON commit. Previously lost on every republish due to fire-and-forget narration timing
- **Frontend headline extraction** — `extractAndStripTitle()` replaces `suggestTitle()` in PipelineMonitor. Extracts `# heading` or `<h1>` into the title field AND strips it from the pasted content body. Works for paste, file upload, and URL fetch across all three upload modes

### Republished

- **"The Sorting Problem"** — corrected from raw markdown to proper HTML, title restored (was "Recycling Is Three Different Problems"), category fixed to "Environmental Health" (was "Clinical Evidence"), description and narration regenerated

## [20.2.0] - 2026-04-03

### Improved — Admin Design System Hardening

- **14 new CSS custom properties** added to `:root` — `--admin-blue-light`, `--admin-green-lighter`, `--admin-accent-hover`, `--admin-indigo-*`, `--admin-surface-deep`, `--admin-surface-invert`, `--admin-surface-dark`, `--admin-text-warm`, `--admin-green-hover`, `--admin-green-dark`
- **~60 hardcoded hex values replaced** in `public/admin.css` with CSS variable references — single source of truth for all colors
- **Stats strip** (`index.astro`) now uses `var(--admin-*)` instead of inline hex. Error banner uses proper toast class
- **ArticlesManager** — 15 inline hex replaced (verdicts, scores, voice checks, PubMed citations)
- **AgentsPanel** — white-on-color text uses `var(--admin-text)` instead of `#fff`
- **SocialDashboard** — ~40 inline hex replaced (persona colors, status colors, toast borders, health indicators, pill styles). External platform brand colors correctly remain hardcoded
- **types.ts** — `getScoreColor()` and all 8 `PIPELINE_STAGE_CONFIG` modelColors now use CSS variables
- **`src/styles/admin.css` synced** with `public/admin.css`

## [20.1.0] - 2026-04-03

### Fixed — Paste-and-Publish Flow

- **Markdown title extraction fixed** — `suggestTitle()` was running regex on whitespace-collapsed text, so `# Title\n\nStandfirst` became one long string. Now matches on raw text with newlines intact
- **Auto-extract description from markdown** — `publish-direct` now pulls the standfirst paragraph (between `# Title` and `## First Section`) as the description when none provided. Also works for HTML input (extracts first `<p>` from introduction)
- **Description truncation false positive fixed** — `stage-publish` flagged descriptions under 80 chars as "truncated" even when properly punctuated. Now only fires when description doesn't end with sentence-ending punctuation
- **Narration regenerates on republish** — `stage-publish` now always regenerates narration for human-opus republishes, since the description may have changed
- **sort_order integer overflow fixed** — column changed from `integer` to `bigint` (Date.now() returns ~1.77 trillion, exceeds integer max of 2.1 billion)
- **Orphaned pipeline logs cleaned up** — `publish-direct` and `submit-new-article` now mark the log as `failed` if the articles table upsert fails, preventing stuck "copy_edited" entries in the dashboard

## [20.0.0] - 2026-04-03

### Fixed — Publishing System Hardening (Full Audit)

All publish paths now enforce the same invariants. No more ghost articles, orphan data, or silent drift between DB and GitHub.

- **Ghost articles eliminated** — `publish-article` now upserts to DB (status, published_at, sort_order, all metadata). Previously only pushed to GitHub, creating articles visible on site but invisible in admin
- **DB↔GitHub auto-sync** — `articles-api` save now auto-syncs published articles' metadata to GitHub. Admin edits to title/description/tags propagate to the live site immediately
- **Article sort order fixed everywhere** — `publish-article`, `publish-direct`, `submit-new-article`, and `stage-publish` all set `sort_order` in the DB. Previously only `stage-publish` set it in the JSON, causing articles to sort to the bottom of category pages
- **Intro paragraph deduplication** — `assembleAstroFile()` and the edit page now strip the first `<p>` from `<section id="introduction">` when it matches the description standfirst. Prevents readers seeing the same text twice
- **Edit page preserves author on republish** — now fetches existing GitHub JSON to preserve pen name (Marc London / Paul Quilici). Previously overwrote with hardcoded "alumi news Editorial"
- **Resilient article deletion** — `delete-article` checks if GitHub files exist before attempting deletion. No longer crashes on already-deleted articles; always cleans up DB and storage
- **Publish buttons unblocked** — description validation limit raised from 200 to 500 chars. Status bar now shows the actual error message instead of just "1 issue"
- **`fetch-article` returns JSON metadata** — edit page can now read existing author, gradient, and other fields from GitHub

### Fixed — Cost Tracking Pipeline Audit

- **Illustration batch/batch-light costs now tracked** — previously `handleBatch()` and `handleBatchLight()` generated images ($0.08 each) with zero cost logging. Now logs cumulative batch cost as system overhead and returns `costUsd` in response
- **Narration costs always tracked** — removed `if (logId)` guard that silently dropped costs when called from admin UI or batch dispatch. Now falls back to `addOverheadCost()` for non-pipeline invocations
- **Standalone illustration costs tracked** — admin-triggered and editorial-qc-triggered illustration generation now logs as system overhead instead of silently eating costs
- **Gemini retry double-billing fixed** — when Gemini returns empty and retries, both attempts' input/output tokens are now accumulated. Previously only the retry's tokens were counted, losing the first attempt's cost
- **Race condition in `addCostToLog`/`addOverheadCost` fixed** — replaced read-modify-write pattern with atomic SQL functions (`increment_article_cost`, `increment_overhead_cost`). Prevents data loss when parallel API calls (e.g. stage-research's 3 models) update the same row simultaneously. Graceful fallback to old pattern if RPC unavailable

### Technical

- New migration: `20260406_atomic_cost_tracking.sql` — `increment_article_cost()` and `increment_overhead_cost()` PostgreSQL functions with `SECURITY DEFINER`
- All 20 edge functions redeployed to pick up shared utility changes

## [19.5.0] - 2026-04-03

### Fixed — Full Article Deletion + Honest Published List

- **"Delete from GitHub" now deletes everything** — renamed to "Delete Article". Now cleans up: GitHub files, `articles` table row, pipeline logs (marked as deleted), illustration files in storage, narration MP3 in storage. Previously only deleted GitHub files, leaving orphaned database rows and storage files
- **"Recently Published" list now shows actual published articles** — previously only showed pipeline log entries, missing articles published via the admin editor. Now queries the `articles` table as source of truth, enriched with pipeline log data. Articles without pipeline history show "Admin" tag
- **Confirmation dialog updated** — clearly states all systems that will be cleaned up on delete

## [19.4.0] - 2026-04-03

### Fixed — New Article Editor

- **Button falsely claimed "Claude Opus"** — process-article uses `MODELS.DEFAULT_CLAUDE` (Sonnet). Button now says "Generate Article"
- **Description validation was 300 chars** — tightened to 200 (SEO best practice is 160)
- **Hero image placeholder said "unsplash"** — updated to match Supabase Storage workflow
- **DB save missing fields** — now persists `hero_image`, `hero_image_alt`, `hero_image_light`, `coming_soon` on initial article creation
- **Illustration callback didn't capture light variant** — now reads `lightUrl` from generate-illustration response and sets `heroImageLight`
- **`svg` field removed from GeneratedArticle** — deprecated field (article_svg no longer generated)

### Added — New Article Editor Improvements

- **Publish Now (direct publish)** — new green button alongside "Submit to Pipeline". Skips independence review and QC, goes straight to illustration + narration + deploy. Confirmation dialog warns this skips editorial review. Done state shows "View Article" link instead of "Track in Pipeline"
- **Keywords field** — visible in metadata panel (data flowed through but was invisible)
- **Hero image preview** — dark/light side-by-side preview in metadata panel, updates live
- **Hero image light URL field** — editable alongside dark variant
- **Hero image alt text field** — editable in metadata panel
- **Generate Illustration button** — manual retry from metadata panel, refreshes URLs from DB after generation
- **Coming Soon checkbox** — alongside Featured toggle
- **Description character count** — color-coded (green/yellow/red at 140/160 thresholds)

## [19.3.0] - 2026-04-03

### Fixed — Admin Editor Data Loss

- **Publish to GitHub no longer drops fields** — `narrationUrl`, `heroImageLight`, `heroImageAlt`, and `sortOrder` are now included in the JSON metadata when publishing from the admin editor. Previously the publish flow built JSON from scratch and omitted these fields, overwriting pipeline-generated data
- **Metadata save now persists all fields** — `doSaveMetadata` now includes `hero_image_light`, `hero_image_alt`, `gradient_from`, `gradient_to`, and `coming_soon`. Previously these were silently dropped on every save
- **Metadata tab renders on load** — tab panel had CSS `display:none` without an `active` class override, causing a blank screen until tab-switching. Now uses explicit inline display

### Added — Editor Overhaul

- **Hero image preview** — side-by-side dark/light image preview cards with proper background colors, live-updating when URLs change
- **Narration audio player** — inline play/pause, progress bar with click-to-seek, time display
- **Generate Illustration button** — calls `generate-illustration` directly from editor, auto-refreshes preview with new URLs
- **Generate Narration button** — calls `generate-narration` from editor with force flag
- **Gradient preview swatch** — live gradient preview updates as you type, "Use Category Preset" button auto-fills from category defaults
- **Description character count** — SEO-oriented 160-char counter with warning colors
- **Missing form fields** — `heroImageLight`, `heroImageAlt`, `gradientFrom`, `gradientTo`, `comingSoon` checkbox now editable
- **Status pill** — Published/Draft badge next to article title
- **Organized form sections** — Core, Hero Image, Narration, Gradient, Deploy — with labeled dividers
- **Design system compliance** — all inline styles converted from hardcoded hex to CSS custom properties

## [19.2.0] - 2026-04-03

### Changed — Cost Optimization

- **Remove auto-pick from queue** — `dispatch_pipeline_stage()` no longer auto-produces articles from the topic queue. Admin must click "Produce" to start any article. Prevents burning API costs on unreviewed topics
- **Slow pinger from `*/15` to `*/30`** — halves breaking news detector invocations (96→48/day). Still catches breaking news within 30 minutes
- **Slow social-poster from `*/5` to `*/15`** — social posts don't need sub-15-minute dispatch precision (288→96 invocations/day)
- **Fire-and-forget illustration + narration** — `stage-publish` no longer blocks ~120-180s waiting for image generation and TTS narration. Both are dispatched async, self-log their own costs to the pipeline via `logId`. Saves ~$15-20/month in edge function compute time per active article volume

## [19.1.0] - 2026-04-03

### Fixed — Human-Opus Prose Protection

- **`stage-independence`: prose rewrite guard** — when `_writtenBy` is `human-opus` or `admin-editor`, Grok still reviews and scores (editorial independence check), but Flash/Sonnet never rewrite the prose. PubMed verification runs and logs results but does not modify article text
- **`stage-copy-edit`: code-level title lock** — human-written article titles are now locked in code (not just a prompt instruction). No model can override the author's headline. Description changes blocked unless clearly broken (truncated < 50 chars or trailing `...`)
- **`constants.ts`: REVISION_PRIMARY upgraded** — prose correction model changed from `gemini-2.5-flash` to `claude-sonnet-4-6`. AI-written article corrections now use editorial-quality models. Fallback changed from Sonnet to `gemini-2.5-pro`

### Added — Markdown Auto-Conversion in submit-article

- **`submit-article` detects markdown** — if submitted content lacks `<section>` / `<p>` tags but contains `# ` / `## ` patterns, auto-converts to site HTML format
- Converts `## Heading` → `<section id="slug" class="reveal"><h2>`, paragraphs → `<p>`, `> quote` → `<aside class="pull-quote reveal">`, inline formatting (`*`, `**`, `` ` ``, links)
- TOC parser now works on converted content (previously returned empty for markdown input)
- Brief still asks Opus for HTML, but markdown is now handled gracefully as a safety net

### Added — Direct Publish Path

- **New `publish-direct` action** in `pipeline-admin` — finished articles skip the entire editorial pipeline (research, editor, independence, QC, voice rewrite, copy edit) and go straight to illustration + narration + GitHub publish
- **Three-way toggle in admin Upload Article UI**: "Topic → Full Chain", "Article → Review → Publish", "Ready → Art + Publish"
- Green-highlighted button and helper text distinguish the direct publish path from editorial flows
- Auto-generates slug from title if not provided, supports markdown auto-conversion

### Fixed — "Where the Funding Doesn't Shine" Article

- Republished with original Opus prose (pipeline had rewritten 3 paragraphs via Flash)
- Restored original title (pipeline copy-edit had changed to generic SEO headline)
- Converted from raw markdown to proper site HTML with sections, paragraphs, pull-quotes
- Added TOC (7 sections), tags (7), keywords (9), and disclaimer

## [19.0.1] - 2026-04-03

### Fixed — Pipeline Admin 502 Errors

- **Status response reduced 80%**: 1.7MB → 328KB by trimming `research_data` to only frontend-needed fields server-side
- **Explicit column selection**: replaced `select("*")` with specific columns on `daily_article_log` and `topic_queue` queries
- **Queue payload trimmed**: excluded completed/skipped queue items (213 rows were being sent unnecessarily)
- **Cost query optimized**: filtered to `cost_usd > 0` to skip zero-cost rows
- **Result**: eliminates 502 errors on cold starts, enables Realtime to show Research/Editor stages in real time

## [19.0.0] - 2026-04-03

### Added — Theme-Aware Illustration Pairs (Dark + Light)

- **Dual illustration system**: every article now gets a dark and light variant, swapped automatically by theme
- **Light house style**: airy watercolor on cream backgrounds (Scientific American meets Kinfolk) — complements existing dark moody aesthetic
- **`generate-illustration` updated**: `variant` param (`"dark"` / `"light"` / `"both"`), per-category light palettes, `batch-light` action for migrating existing articles
- **`stage-publish` updated**: detects which variants are missing, generates only what's needed, tracks cost per variant
- **Database**: `hero_image_light` column on `articles` table, `heroImageLight` in content collection schema
- **Frontend**: 13 image locations updated across 8 files — two `<img>` tags with `hidden dark:block` / `dark:hidden` when both variants exist
- **Graceful fallback**: articles without a light variant keep the legacy white overlay (CSS `:has()` selector auto-removes overlay when light image arrives)
- **GitHub JSON sync**: `heroImageLight` field synced to article metadata on publish

### Changed — Card Hover Interaction

- **Category label deconflict**: red category label turns neutral (stone-800/stone-300) on card hover so it doesn't clash with the red title highlight
- Applies site-wide via CSS rule targeting `.group:hover .text-primary-600[class*="uppercase"]`

## [18.8.1] - 2026-04-03

### Fixed — Image Aspect Ratios

- **Unified all image containers to 3:2** — matches the 1536x1024 dimensions illustrations are generated at
- Eliminated `aspect-auto` on featured cards (homepage, topics, start-here) that caused height guessing from text column
- Replaced mixed ratios (4:3, 16:10) across articles index, topics, deep-dives, and start-here pages
- Zero cropping, zero black gaps — every image fills its container perfectly

## [18.8.0] - 2026-04-03

### Changed — Article Typography

- **Body copy bumped to 20px** (`1.25rem`) with line-height 1.8 — matches NYT/Atlantic standards
- **Site-wide type scale uplift**: `body-lg` 17→20px, `body` 16→17px, `overline` 11→12px
- **Card descriptions**: 14px → 16px across all components (ArticleCard, homepage, topics, collections, etc.)
- **SideNav**: micro-text bumped from 10px → 12px (badges, meta, hints)
- **Standfirst**: article description styled as italic serif lede with custom size scale, thin rule separator below
- **Drop "In This Article" TOC blocks**: removed inline TOC from all 160 articles (FloatingTOC sidebar remains)
- **Lede paragraph**: first paragraph gets slightly darker ink + `font-weight: 450` for subtle presence

## [18.7.1] - 2026-04-03

### Changed — Author Pen Names

- Replaced single pen name "Max Lundin" with two authors: **Marc London** and **Paul Quilici**
- 162 existing articles split 50/50 between the two authors (alphabetical sort)
- Pipeline `MODEL_BYLINES`: Human/Claude/GPT models → Marc London, Gemini/Grok models → Paul Quilici
- Updated site config, SEO component, admin types, social preview, and social writer persona

## [18.7.0] - 2026-04-03

### Added — Social Media Simulator (`/admin/social-preview`)

**Platform-native post previews** — see exactly how posts will look on each platform before they go live:
- **6 platforms**: X (threads with connecting lines, verified badges), Bluesky (dark navy, link cards), Reddit (vote arrows, karma, subreddit headers), Threads (Instagram-dark aesthetic), LinkedIn (professional cards, follow button), Mastodon (boost/favourite icons)
- **iPhone mockup**: Dynamic Island, status bar, home indicator — full hardware frame. Posts render inside the phone screen
- **Desktop preview**: Reddit and LinkedIn also render in a browser frame alongside the phone (desktop-first platforms)
- **Character count per post**: Shows `247/280` overlay, turns red when over platform limit
- **Copy button**: One-click copy post text to clipboard on every post
- **Filters**: Persona (brand/reporter/skeptic/curator), status (draft/scheduled/posted/failed/skipped), article
- **Deterministic fake engagement**: Timestamps, karma, comment counts derived from post ID hash (no jitter on re-render)
- **Error handling**: API failure shows error message + retry button (not infinite spinner)
- **Responsive**: Phone frame scales down on viewports under 500px
- **Accessible**: aria-labels on all interactive elements, keyboard-navigable tabs
- Nav link added to all admin pages (Dashboard, New Article, Edit, Social Preview)

## [18.6.0] - 2026-04-03

### Improved — Social Dashboard UI + Voice Overhaul

**Dashboard font-size bump (SocialDashboard.tsx)**
- Every font tier bumped one step: panel titles 10→11px, body text 11→12px, row content 12→13px, mono/data 11→12px, buttons 10→11px, pills 9→10px, micro labels 8→9px, stat values 20→22px
- Increased row height (32→36px), panel padding, pill padding, button touch targets for better readability
- Expanded post preview now 13px with more max-height

**Social persona voice overhaul — "receipts, not vibes"**
- All 4 persona voices rewritten with sharper, younger, more confrontational energy
- Brand: Bill Maher's health desk — second-person address ("You've been told X"), lead with the gut-punch stat
- Reporter (Max Lundin): "I read the actual paper, not the press release" — names sample sizes, funding sources, what headlines omit
- Skeptic: forensic follow-the-money — names institutions, dollar amounts, revolving doors. John Oliver compressed to 280 chars
- Curator: pattern-finder — "A sleep study, a glucose study, and an EPA report walk into a bar..."
- Engine brief prompts updated to match: requires dollar amounts, institution names, at least one funny quotable line
- Choreography templates rewritten: "the one-line gut punch," "the receipts," "who funded this?"

**Research basis**: Health Ranger rhetorical structure analysis (hooks, follow-the-money, direct address) adapted for evidence-based journalism — same engagement patterns, but with verifiable citations instead of conspiracy

## [18.5.0] - 2026-04-03

### Improved — Social Content Quality Revolution

**Social Engine (strategic brain)**
- Capped choreography to 5-6 posts max across 2-3 platforms (was spraying 10-18 identical posts across every platform)
- Each choreography item now carries a unique `hook` field — a different angle/entry point per post
- Stronger prompt constraints: varied quotable lines, platform-appropriate audience targeting
- Example output: brand/Bluesky gets the punchy finding, brand/Reddit gets the systems analysis, skeptic/Reddit challenges what the article left unresolved

**Social Writer (content factory)**
- Parallel processing: 5 concurrent AI calls per batch (was sequential, causing edge function timeouts)
- Hook-first prompts: writer uses the per-item hook as its opening angle, not the global viral_angle
- Explicit uniqueness enforcement: "do NOT default to the core thesis as your opener"
- Pre-fetched platform configs (eliminated N+1 database queries)
- Stuck recovery threshold reduced from 10 min to 2 min (faster iteration on timeouts)
- Stronger JSON output enforcement for Gemini (reduced truncation on reporter persona)
- Max tokens bumped from 1500 → 2000 for thread-format posts
- Batch size reduced from 20 → 10 to stay within edge function timeout

**Verified output quality** — tested on 3 articles (migraine/pharma, seed oils/AHA, contact lenses):
- Brand posts: platform-native, data-forward, no marketing energy
- Skeptic posts (Grok): genuine devil's advocate, pushes back on article's own thesis
- Reddit posts: deep structural analysis with discussion prompts
- X threads: numbered multi-tweet format with article link in final tweet

## [18.4.0] - 2026-04-03

### Fixed — Full-Stack Hardening & Admin Intelligence

**Critical Bug Fixes**
- Social dashboard 500 errors — new `batch` endpoint replaces 6 parallel requests with 1
- social-writer `successIds` bug — plan rows stuck in "generating" forever (was slicing by index, not tracking actual successes)
- social-writer stuck recovery — auto-resets rows stuck in "generating" for 10+ minutes from crashed runs
- CommandPalette trigger event listener cleanup — memory leak on View Transitions
- PipelineMonitor brief copy XSS — replaced `document.write()` with safe `textContent` DOM API
- dispatchStage silent failures — now logs dispatch errors directly to article record (visible in admin dashboard)

**Intelligent Safeguards (social-admin)**
- Article existence check before social generation — prevents burning AI credits on non-existent articles
- Duplicate generation prevention — returns 409 if content already being generated for a slug
- Slug format validation — rejects malformed slug strings with clear error
- Platform existence validation — rejects toggle requests for unknown platforms
- Action field validation — returns 400 instead of 500 on missing/invalid request bodies
- social-poster auto-drafts posts for unconfigured platforms instead of silently skipping forever

**Admin Dashboard UX**
- Expandable post rows in Post Feed — click to see full content, metadata, cost, scheduled time, article link
- Copy button available on all posts (not just drafts) — useful for manual platform posting
- Content Plan date navigator — browse plans for any date with prev/next arrows, date picker, Today button
- Better error messages — "Article not found", "already being generated" instead of generic 500s

**Full-Stack Audit**
- Ran 4 parallel deep audits: social functions, admin dashboard, public site, pipeline functions
- 9 bugs fixed, 5 safeguards added, 3 UX improvements across 7 files

## [18.3.1] - 2026-04-02

### Improved — Social Dashboard Quality & Accessibility

**Error Handling (bulletproof)**
- Every API action (`skipPost`, `retryPost`, `generateForArticle`, `runAction`) wrapped in try/catch with user-facing feedback
- All `res.json()` calls guarded by `res.ok` checks — non-JSON error responses no longer crash the UI
- Failed JSON parsing has fallback error extraction

**Toast Notification System**
- Fixed-position toast container with `role="log"` + `aria-live="polite"`
- 3 types: success (green), error (red), info (blue) with animated entrance/exit
- Auto-dismiss after 4s, max 5 visible, manual dismiss button

**Skeleton Loading States**
- Shimmer-animated skeleton strips replace bare "Loading..." text
- Skeleton rows in panels, skeleton stat strip, skeleton setup cards

**Accessibility (WCAG AA)**
- All tabs: `role="tab"`, `aria-selected`, `aria-controls`, proper id pairs
- All panels: `role="tabpanel"`, `aria-labelledby`
- All buttons: descriptive `aria-label` for screen readers
- Platform/status badges: `role="img"`/`role="status"` with labels
- Progress bars: `role="progressbar"` + `aria-valuenow/min/max`
- Filter groups: `role="toolbar"`, `aria-labelledby`
- Tables: `scope="col"` on headers, `role="table"` + `aria-label`

**Keyboard Shortcuts**
- `1`–`5` switch tabs, `R` refresh, `G` focus generate input
- Shortcut hints on tab hover, reference panel in Setup tab

**UI Enhancements**
- SVG sparkline mini-charts (7-day post activity)
- Optimistic updates on skip/retry with revert on failure
- Action button feedback: checkmark/X for 3s after completion
- Fade-in animations on tab switch, hover glow on panels
- Pulsing status dots for active operations, pulsing failed count
- Content type breakdown panel (new)
- Last refresh timestamp in action bar
- Architecture diagram expanded to 5 columns (includes Sync)
- Copy-to-clipboard feedback via toast

**Type Safety**
- Admin edit page: replaced `let article: any` with proper `EditArticle` interface
- Empty catch block now logs errors with article slug context

## [18.3.0] - 2026-04-02

### Added — Social Media System Phase 1B (Execution Layer)

**Social Writer** (`social-writer/index.ts`) — the content factory:
- Takes Content Briefs from `social_content_plan` → generates platform-native post text
- Uses each persona's assigned AI model (Sonnet for brand, Gemini for reporter, Grok for skeptic)
- Platform-specific formatting: Bluesky (300 char, no hashtags), Reddit (markdown + subreddit selection), Mastodon (500 char + hashtags), LinkedIn (professional), etc.
- Choreography timing: brand at 0min, reporter at 60min, skeptic at 180min, curator at 120min
- Outputs to `social_posts` table with status=scheduled (API platforms) or status=draft (manual platforms)
- Chain-dispatched by social-engine after brief generation

**Social Poster** (`social-poster/index.ts`) — the dispatcher:
- Reads scheduled posts that are due → calls platform APIs via `postToPlatform()`
- Respects choreography ordering: skips posts whose parent hasn't been posted yet
- Rate limit awareness: checks hourly post count per platform against `rate_limit_per_hour`
- Exponential backoff on failure (5min, 25min, 125min), max 3 retries
- Cron: every 5 min

**Social Planner** (`social-planner/index.ts`) — the daily editorial meeting:
- Mines article catalog for reshare candidates (not promoted in 14+ days, independence score ≥ 5)
- Creates weekly arcs via AI (theme, category focus, recurring series)
- Selects 4 articles/day with category diversity + arc alignment
- Recurring series: "Actually..." Monday, "Study of the Week" Wednesday, "By the Numbers" Friday
- Chain-dispatches to social-engine for each selected article
- Cron: daily 5am UTC

**Social Sync** (`social-sync/index.ts`) — engagement feedback loop:
- Pulls metrics from Bluesky + Reddit APIs for posted content (last 7 days)
- Updates `social_posts` engagement columns + `social_engagement_log` time-series
- Calculates weighted engagement score (likes×1, shares×3, comments×2, impressions×0.01, clicks×1.5)
- Velocity detection: flags posts exceeding 3× average engagement
- Updates `social_angle_registry` engagement scores for learning
- Cron: every 6 hours

**Social Admin** — 6 new endpoints:
- `run-planner`: manually trigger daily editorial meeting
- `run-writer`: manually trigger content writing for planned items
- `run-poster`: manually trigger post dispatch
- `run-sync`: manually trigger engagement sync
- `setup-status`: credential status for all platforms + setup instructions
- `toggle-platform`: activate/deactivate platform or mark as API-configured

**Dashboard Updates** (`SocialDashboard.tsx`):
- New "Setup" tab with platform credential guide (Bluesky, Reddit, Mastodon)
- System architecture diagram showing Planner → Engine → Writer → Poster → Sync flow
- Cron job reference with schedules
- Quick Start Guide with step-by-step setup instructions
- Manual trigger buttons in tab bar: Planner, Writer, Poster, Sync
- Updated arc message to reflect automatic creation via planner

**Cron Jobs** (`20260403_social_cron_jobs.sql`):
- `social-poster`: `*/5 * * * *` — dispatch scheduled posts
- `social-planner`: `0 5 * * *` — daily editorial meeting
- `social-sync`: `0 */6 * * *` — engagement metrics sync

### Fixed
- Social engine arc_id assignment (was always null due to `undefined` vs `currentArc.id`)
- Chain-dispatch from social-engine → social-writer (posts now auto-generate after briefs)

### Architecture
- **End-to-end flow**: Article publishes → social-engine (brief) → social-writer (posts) → social-poster (dispatch) → social-sync (metrics)
- 4 new edge functions, 3 new cron jobs, 6 new admin endpoints
- Platform-native content generation (not cross-posting)
- Multi-model persona system: each persona writes with their assigned AI model

## [18.2.0] - 2026-04-02

### Added — Social Media System Phase 1A+1C (Foundation + Dashboard)

**Database** (`20260402_social_media_system.sql`) — 8 new tables with full schema, indexes, RLS, and seed data:
- `social_personas` — 4 AI personas (brand/reporter/skeptic/curator) with model assignments, voice prompts, platform arrays
- `social_platform_config` — 14 platforms with desk assignments, tiers, rate limits, content format arrays
- `social_posts` — core post table with choreography groups, scheduling, engagement tracking, 7 indexes
- `social_content_plan` — daily editorial plans per platform/persona/desk
- `social_angle_registry` — never-repeat angle tracking per article
- `social_arcs` — weekly thematic arcs with recurring series
- `social_engagement_log` — time-series engagement snapshots for velocity detection
- `social_templates` — learned + manual content templates with engagement scoring

**Social Engine** (`social-engine/index.ts`) — strategic brain that generates Content Briefs:
- Fetches article data from pipeline log + articles table
- Loads existing angles (never repeats), active platforms, personas, current weekly arc
- Generates Content Brief via AI (Sonnet with Gemini Pro fallback) with choreography sequence
- Writes content plan rows and registers angles
- Triggered by stage-publish (new articles) or social-admin (catalog mining)

**Social Admin** (`social-admin/index.ts`) — dashboard API with 10 actions:
- `status`, `posts`, `plan`, `platforms`, `arcs`, `angles`, `leaderboard`, `personas`, `skip`/`retry`, `generate`

**Social Dashboard** (`SocialDashboard.tsx`) — Bloomberg Terminal-inspired admin UI:
- 8-KPI stats strip matching existing admin design system
- 4 section tabs: Overview (platform matrix + arc + personas), Post Feed (filtered table), Content Plan (editorial schedule), Platforms (health cards with fill rate progress bars)
- Generate-for-article widget in tab bar
- All inline styles reference admin.css custom properties (warm dark palette, tabular-nums, glass surfaces)

**Pipeline integration** — `stage-publish` now fires social-engine (non-blocking) after every successful publish

**Shared utilities**:
- `_shared/social-clients.ts` — Bluesky (AT Protocol), Reddit (OAuth2), Mastodon (ActivityPub) clients with session caching + platform router
- `_shared/constants.ts` — 6 new MODELS entries (SOCIAL_BRAND/REPORTER/SKEPTIC/CURATOR/REVIEW/PLANNER) + SOCIAL_CHAINS fallback chains

#### Files changed
- `supabase/migrations/20260402_social_media_system.sql` (new) — 8 tables, seed data
- `supabase/functions/_shared/constants.ts` — social model constants + chains
- `supabase/functions/_shared/social-clients.ts` (new) — platform API clients
- `supabase/functions/social-engine/index.ts` (new) — Content Brief generator
- `supabase/functions/social-admin/index.ts` (new) — dashboard API
- `supabase/functions/stage-publish/index.ts` — social-engine dispatch hook
- `src/components/admin/SocialDashboard.tsx` (new) — Bloomberg-inspired dashboard
- `src/pages/admin/index.astro` — Social tab added (4th tab)
- `public/admin.css` — social dashboard table hover + scrollbar styles

## [18.1.0] - 2026-04-02

### Added — Social Media Mega-Viral System Design

**Complete architecture plan** (`SOCIAL-MEDIA-SYSTEM-PLAN.md`) for an autonomous social media newsroom that sits downstream of the article pipeline:

- **Agency model**: Editorial Engine → 5 specialized Desks (microblog, forum, professional, visual, broadcast) → platform-native content for 10+ services
- **4 AI personas** (brand, reporter, skeptic, curator) using different AI models (Sonnet, Gemini Pro, Grok, Flash) for genuine voice diversity
- **10+ posts/day/platform** across X, Bluesky, Reddit, LinkedIn, Threads, Mastodon, Pinterest, Medium, Telegram, WhatsApp, Newsletter — all free APIs, $0/month platform costs
- **Intelligence features**: trend surfing via pinger integration, persona cross-promotion choreography, engagement→article funnels, weekly thematic arcs, angle registry (never repeat), viral velocity detection, competitive intelligence
- **8 new database tables**: social_personas, social_platform_config, social_posts, social_content_plan, social_angle_registry, social_arcs, social_engagement_log, social_templates
- **14 new edge functions** planned: arc-planner, planner, engine, miner, 5 desks, review, poster, engagement-sync, learn, admin
- **~$5-6/month total AI cost** for 60+ daily posts

#### Files changed
- `SOCIAL-MEDIA-SYSTEM-PLAN.md` (new) — complete implementation plan
- `NEXT-SESSION-PLAN.md` — updated priorities for social system build

## [18.0.0] - 2026-04-02

### Added — Comprehensive SEO System (13 files)

**Centralized site identity** (`src/config/site.ts`) — Single source of truth for site URL, brand name, social handles, editorial policy paths, OG image dimensions, and author constants. The hardcoded `tune-health.vercel.app` URL now exists in exactly one location across the entire codebase. Domain migration: set `SITE_URL` env var in Vercel + update `FALLBACK_URL` in `site.ts`.

**NewsArticle structured data** — `Article` → `NewsArticle` schema on all article pages. Required for Google News eligibility and health-related rich results. Includes `wordCount` (estimated from readTime), `copyrightYear`, `copyrightHolder`, `inLanguage`, and `timeRequired`.

**E-E-A-T signals for YMYL health content** — Organization schema now includes `publishingPrinciples` (→ `/howwewrite`), `actionableFeedbackPolicy` (→ `/about`), `foundingDate`, `sameAs` (Twitter + Bluesky), and logo with explicit dimensions. Critical for Google's evaluation of health/medical content trustworthiness.

**Person author schema** — Author is now a `Person` with `jobTitle` and `worksFor` Organization, using the actual per-article author name from content collection (not a hardcoded string).

**CollectionPage schema on topic pages** — All 10 category pages (`/topics/[slug]`) now emit `CollectionPage` + `BreadcrumbList` JSON-LD with `numberOfItems`. Helps Google present these as curated topic hubs.

**Homepage JSON-LD** — `index.astro` now includes `Organization` + `WebSite` schemas. Enables Sitelinks Search Box when users Google "alumi news".

**Article-specific Open Graph tags** — Every article page now emits `article:published_time`, `article:modified_time`, `article:author`, `article:section`, and per-tag `article:tag` meta properties. Significantly improves link previews in Slack, Discord, iMessage, and LinkedIn.

**Enhanced meta tags** — Added `og:locale` (`en_US`), `og:image:alt`, and `twitter:image:alt` to all pages via BaseLayout. Twitter handle now reads from site config.

**Dynamic robots.txt** — Static `public/robots.txt` replaced by `src/pages/robots.txt.ts` that reads `Astro.site`, so the Sitemap URL auto-updates on domain migration. Added `Disallow: /admin/`.

**Smart sitemap** — `astro.config.mjs` now reads `SITE_URL` from env var, filters `/admin/` routes from sitemap, and assigns priorities: homepage 1.0 daily, articles 0.9 monthly, topics/collections 0.8 weekly, everything else 0.7 monthly.

**Admin noindex** — `vercel.json` adds `X-Robots-Tag: noindex, nofollow` header for all `/admin/` routes.

**RSS enrichment** — Added `copyright`, `managingEditor`, `webMaster`, `ttl`, Atom self-link, and per-article `author` fields. All values read from site config.

**Zero hardcoded URLs** — `ShareButtons.astro` and `HighlightShare.astro` now import `FALLBACK_URL` from site config instead of hardcoding the URL string.

#### Files changed
- `src/config/site.ts` (new) — centralized site identity
- `src/pages/robots.txt.ts` (new) — dynamic robots.txt
- `public/robots.txt` (deleted) — replaced by dynamic endpoint
- `astro.config.mjs` — env-driven URL + smart sitemap
- `src/components/SEO.astro` — NewsArticle, E-E-A-T, Person, CollectionPage
- `src/layouts/BaseLayout.astro` — og:locale, og:image:alt, site config imports
- `src/layouts/ArticleLayout.astro` — updatedDate, readTime, author pass-through + article:* OG
- `src/pages/index.astro` — homepage JSON-LD
- `src/pages/topics/[slug].astro` — CollectionPage schema
- `vercel.json` — admin X-Robots-Tag
- `src/pages/rss.xml.ts` — copyright, managing editor, Atom link
- `src/components/ShareButtons.astro` — FALLBACK_URL import
- `src/components/HighlightShare.astro` — FALLBACK_URL import

## [17.6.0] - 2026-04-02

### Fixed — Accessibility, Navigation & TypeScript (4 files)

**Empty alt text (WCAG)** — Two article hero images had `alt=""` (empty), failing accessibility requirements for content images. Images inside article cards are contextual (not decorative) and require descriptive alt text.
- `collections/[slug].astro` — article thumbnails now use `heroImageAlt || title` fallback
- `reading-list.astro` — dynamically-built HTML template string updated with same pattern

**Footer category links (broken navigation)** — Footer was the only navigation component using the stale `/articles?topic=` query-param pattern. The articles index page doesn't handle topic filtering via query params — clicking any category in the Footer landed on the unfiltered articles list. All other nav components (Header, TopicNav, SideNav, ArticleLayout) correctly link to `/topics/[slug]`.
- Added `getCategorySlug` import from `category-domains`
- Replaced `href="/articles?topic=${encodeURIComponent(cat)}"` → `href="/topics/${getCategorySlug(cat)}"`

**TypeScript `any` types** — `ContinueReading.astro` script block used `(p: any)`, `(a: any)`, `(b: any)` for localStorage reading progress objects.
- Added `ReadingProgress` interface: `{ scrollPercent, lastRead, slug, category, title, readTime }`
- All three filter/sort/forEach callbacks now properly typed

## [17.5.0] - 2026-04-02

### Fixed — Pipeline Chain Dispatch + Status Constants (5 edge functions)

**stage-write chain dispatch** — After writing an article (fallback auto-write path), `stage-write` was setting status to `"written"` and returning without dispatching `stage-independence`. Articles got stuck at `"written"` waiting for the 5-min safety-net cron. Added `dispatchStage("stage-independence", logId)` + `dispatchStage` import.

**constants.ts status completeness** — `ACTIVE` and `IN_PIPELINE` arrays were missing voice-rewrite statuses added in v17:
- Added `"writing"` and `"rewriting_voice"` to `ACTIVE` (currently-processing states)
- Added `"voice_rewrite_pending"` and `"voice_rewrite_done"` to `IN_PIPELINE` (in-flight waiting states)
- These are used by stale detection and concurrency guards

**Hardcoded model strings** — Two remaining hardcoded model IDs replaced with `MODELS.*` constants:
- `refine-article/index.ts`: `"gemini-2.5-flash"` → `MODELS.DEFAULT_GEMINI`
- `_shared/db.ts` (calcCost fallback): `"claude-sonnet-4-6"` → `MODELS.DEFAULT_CLAUDE`; added `MODELS` import

**Deployed** all 11 pipeline functions (all import `_shared/db.ts` or `_shared/constants.ts`).

## [17.4.0] - 2026-04-02

### Fixed — Voice-Rewrite Chain Dispatch (2 edge functions)

Articles needing voice polish were waiting up to 10 minutes for the 5-minute safety-net cron to fire — twice (once from `voice_rewrite_pending`, once from `voice_rewrite_done`). Both transitions now chain-dispatch immediately.

- **`stage-qc`** — after setting status `voice_rewrite_pending`, now calls `dispatchStage("stage-voice-rewrite", logId)` immediately. Previously returned without dispatching, leaving articles to wait for the cron
- **`stage-voice-rewrite`** — added `dispatchStage` import; after setting status `voice_rewrite_done`, now calls `dispatchStage("stage-copy-edit", logId)` immediately. Voice-rewrite path now chains in seconds, not minutes

### Fixed — Admin types.ts MODEL_PEN_NAMES Sync

Frontend admin `MODEL_PEN_NAMES` in `src/components/admin/types.ts` had stale per-model pen names (Carl Lundin, Max Quilici, Eli Vance, Christine Wright, Linda Carnes) from before the single-byline architecture. Backend `MODEL_BYLINES` was already updated to use "Max Lundin" for all models. Frontend now matches.

- Updated "last synced" comment to 2026-04-02
- All 10 model entries now use `name: "Max Lundin"` (roles preserved for admin display)

## [17.3.0] - 2026-04-02

### Fixed — Model Centralization (9 edge functions)

Eliminated every hardcoded model ID string across the entire codebase. All model references now go through `MODELS.*` constants in `_shared/constants.ts`.

#### Functions updated
- **`refine-article`** — primary Claude call + fallback Grok: `"claude-sonnet-4-6"` → `MODELS.DEFAULT_CLAUDE`, `"grok-3"` → `MODELS.INDEPENDENCE` (also added `_shared/constants.ts` import)
- **`stage-publish`** — cost-logging calls: `"gpt-image-1"` → `MODELS.ILLUSTRATION`, `"eleven_multilingual_v2"` → `MODELS.NARRATION_MODEL`
- **`stage-research`** — `_researchSources` label: `"grok-4"` → `MODELS.INDEPENDENCE`
- **`pipeline-admin`** — backfill-costs entries: same illustration + narration → constants
- **`editorial-qc`** — stale model ID `"claude-sonnet-4-20250514"` → `MODELS.DEFAULT_CLAUDE`
- **`generate-illustration`** — GPT Image API call: `"gpt-image-1"` → `MODELS.ILLUSTRATION`
- **`process-article`** — primary + cost logging: `"claude-sonnet-4-6"` → `MODELS.DEFAULT_CLAUDE`

### Fixed — Dedup Fingerprint Status Values

`buildFingerprints()` in `_shared/dedup.ts` was querying `daily_article_log` with stale status strings (`"research"`, `"editor"`, `"independence"`) that never matched real rows. Updated to the full set of actual pipeline statuses including all `copy_editing`/`copy_edited` stages. In-flight articles are now correctly excluded from scout suggestions.

### Fixed — backfill-costs Missing Stage 7

`backfill-costs` action in `pipeline-admin` did not include `copy-edit` in `STAGE_ESTIMATES` or `STAGES_BY_STATUS`. Articles at `copy_editing`, `copy_edited`, `publishing`, and `published` status now correctly estimate copy-edit token costs.

### Fixed — Homepage Newsletter Copy

`src/pages/index.astro` homepage newsletter section still had "Real Wealth Starts Here" (alumi Wealth project copy that leaked in). Corrected to "Evidence in Your Inbox" — consistent with `Newsletter.astro` fix from v17.2.0.

## [17.2.0] - 2026-04-02

### Fixed — Post-merge Scout Dedup (4 edge functions + migration)

Scouts were re-suggesting topic angles that had already been merged, because the merge operation deleted the original topic rows and their fingerprints disappeared from dedup.

#### Root cause
`buildFingerprints()` reconstructs dedup memory from live operational tables. When topics were merged, originals were hard-deleted — their text was gone. The merged super-topic has a different title, so scouts could easily slip through with re-suggestions of the original angles.

#### Solution: dedicated `topic_dedup_log` table
- **New table** `topic_dedup_log(id, topic_text, source, created_at)` — purpose-built for dedup memory, independent of operational tables
- **90-day TTL** via `pg_cron` — bounded size, no infinite growth
- **Each original topic gets its own fingerprint entry** (not diluted into one combined fingerprint), giving the dedup check the tightest possible net per original angle

#### Changes
- **Migration** `20260351_topic_dedup_log.sql` — table + index + cron job applied to Supabase
- **`_shared/dedup.ts`** — `buildFingerprints()` now queries `topic_dedup_log` with 90-day window; reverted erroneous `skipped` status addition
- **`topic-merge`** — writes each original topic to dedup log before deleting; reverted `skipped` status approach; restored FK null + hard delete
- **`pipeline-admin`** — `delete-queue` action now fetches topic text and writes to dedup log before deleting

## [17.1.1] - 2026-04-02

### Fixed — Scout Button Timeout

- **UI fetch timeout raised to 130s** — `triggerSingleScout` and `triggerScout` loop both now pass `timeout: 130_000` to `fetchWithTimeout`. Previously used the 60s default, which is shorter than the 120s Gemini/Grok AI timeout in pipeline-scout. Result: scouts completed in the backend but the UI showed a false timeout error.

## [17.1.0] - 2026-04-02

### Fixed — Topic Dedup Overhaul (4 edge functions)

Scouts and pinger were suggesting topics already published or already in queue. Root causes: truncated title list, missing fingerprint sources, broken dedup calls.

#### dedup.ts (core engine)
- **Word filter** `> 3` → `>= 3` — "oil", "gut", "IBS", "UTI", "ADHD" now survive fingerprinting (were silently dropped)
- **Added 3-letter stop words** — prevents noise from relaxed filter ("the", "and", "for", etc.)
- **buildFingerprints** now checks 3 sources: published articles, completed + active queue items (was active-only), and in-progress `daily_article_log` pipeline articles

#### pipeline-scout
- **Full title list** — scout AI now sees all 188+ article titles (was truncated at 50 — AI didn't know 138 articles existed)
- **Queue visibility** — active queue topics now included in scout prompt so AI avoids duplicating queued topics

#### stage-editor
- **Fixed broken unchosen-candidate dedup** — was passing `topic` as both args; now passes proper `headline_draft`, `category`, `keyFindings`, `mechanism` from candidate data
- **Moved dedup before `.map()`** — eliminates index misalignment between filtered candidates and mapped queue entries

#### pipeline-admin
- **Added dedup to `queue-topic`** — manual topic inserts now check against `buildFingerprints()`, returns 409 if duplicate detected

## [17.0.0] - 2026-04-02

### Changed — First-Principles Pipeline Audit (7 edge functions)

Rewrote all pipeline prompts to investigate from primary evidence rather than from any authority's conclusion. Replaced directional bias (anti-institutional) with symmetrical funding audit methodology.

#### stage-research
- **Deleted** 12-topic "KNOWN INDUSTRY-CAPTURED CONSENSUS" list (predetermined conclusions) → replaced with **FUNDING AUDIT PROTOCOL** (a method for tracing funding on ALL sides, including contrarian conflicts)
- **Added** FIRST-PRINCIPLES INVESTIGATION METHOD — start from primary data, mechanisms, dose-response curves
- **Fixed** triangulated research lens prompts: dissenting lens now scrutinizes dissenter conflicts (book sales, supplement lines, speaking fees)
- **Fixed** merge order: primary evidence first (was contrarian-first, which primed editors toward anti-institutional framing)

#### stage-independence
- Scoring rubric now rewards **evidence-following**, not institution-challenging — a 9-10 means "follows primary evidence wherever it leads"
- **Symmetrical conflict disclosure**: flags articles that only trace money on ONE side (institutional or contrarian)
- Category-specific focus updated: nutrition audits supplement-funded contrarian research alongside food industry conflicts

#### pipeline-scout
- BAD framing now includes uncritical contrarian deference alongside institutional deference
- GOOD framing requires funding investigation on ALL sides
- All 3 scout model system prompts rewritten for symmetrical investigation

#### stage-editor
- Replaced "assume institutional capture" directive with two explicit failure modes: institutional deference AND reflexive contrarianism
- Dogma check now flags outdated contrarian narratives alongside outdated institutional ones

#### stage-write
- **Added steel-man requirement** — present opposing position in strongest form before critiquing
- Funding disclosure mandatory for ALL cited studies (institutional AND contrarian sources)

#### stage-qc
- "Follow the money" requires symmetrical disclosure — one-sided funding audit triggers revision
- Scoring: 3-4 now includes "one-sided advocacy in either direction"

#### stage-voice-rewrite
- "Uncomfortable truth" can challenge contrarian narratives or reader assumptions, not just institutions

## [16.9.0] - 2026-04-02

### Added — Realtime Admin Dashboard
- **Supabase Realtime subscriptions** — PipelineMonitor now receives live database changes via WebSocket instead of polling. Pipeline stage transitions (Research → Editor → Write → etc.) appear instantly in the dashboard
- **Live topic queue updates** — INSERT, UPDATE, DELETE on `topic_queue` stream to the dashboard in real time (priority changes, produces, deletes)
- **Fallback polling** — 60s safety-net poll (was 15s) keeps aggregate stats in sync; Realtime handles row-level updates
- **Realtime migration** — `daily_article_log` and `topic_queue` added to `supabase_realtime` publication with public SELECT RLS policies

## [16.8.0] - 2026-04-01

### Improved — Ultra Audit & Polish Pass (12 files)

#### Accessibility & Contrast (Phase 1)
- **Footer contrast** — link text `stone-400` → `stone-300`, fine print `stone-600` → `stone-500` for WCAG AA on dark backgrounds
- **Newsletter contrast** — body/benefit text `stone-400` → `stone-300`, placeholder `stone-500` → `stone-400`
- **AudioNarration** — added `aria-pressed` toggle state for screen readers
- **SeriesNav** — focus-visible rings on progress dots, smooth 0.3s color transitions, subtle scaleY hover feedback
- **HighlightShare** — Escape key closes popup, Tab key traps focus between share buttons (keyboard-accessible)

#### Visual Polish (Phase 2)
- **Scroll progress bar** — 2px → 3px for better visibility across themes
- **HighlightShare entry animation** — added scale(0.95→1) spring for snappier popup appearance

#### Interaction & Navigation (Phase 3)
- **CommandPalette empty state** — shows top 5 topic category pills when search yields no results (browse instead of dead end)
- **CommandPalette focus restoration** — restores focus to trigger element on close
- **Share brand colors** — moved hardcoded hex to CSS custom properties with fallbacks (`--brand-linkedin`, `--brand-bluesky`, etc.)

#### SEO & Navigation (Phase 4)
- **Visual breadcrumbs** — added `Home > Articles > Category` on topic pages, `Home > Collections > Title` on collection pages via Breadcrumbs component

#### Performance (Phase 5)
- **Admin CSS cleanup** — removed legacy table, article card, and modal selectors: **81.8 KB → 71.4 KB** (−10.4 KB dead CSS)

## [16.7.0] - 2026-04-01

### Improved — Search UX Overhaul

#### Command Palette (⌘K) — Mobile-First
- **iOS zoom fix** — input forced to 16px on mobile to prevent Safari auto-zoom on focus
- **44px touch targets** — all list items now meet minimum touch target size (was ~34px)
- **Responsive card layout** — proper 16px horizontal margins with `w-[calc(100%-2rem)]`, positioned below safe area
- **visualViewport keyboard adaptation** — container dynamically shrinks when iOS keyboard opens via `visualViewport` resize listener
- **Clear button** — circle × button appears when text/category is active, clears and refocuses
- **Search match highlighting** — `<mark>` highlights matching substring in title and description
- **Context-aware footer** — touch devices see "Close" button; desktop keeps ↑↓/↵ keyboard hints
- **Better placeholder** — "Search articles, topics, pages..." communicates scope
- **Fade-in animation** — smooth entrance via CSS keyframes
- **Active tap feedback** — `active:bg-stone-100` for immediate visual response on touch

#### Articles Page Search
- **Clear button** — × button inside search input, appears when text is entered
- **Sort dropdown touch targets** — options now 44px min-height with flex alignment

## [16.6.0] - 2026-04-01

### Improved — UX Polish Pass (6 files)

#### Navigation Fixes
- **TopicNav dropdown vertical clamping** — panels now constrain to viewport height with `maxHeight` + scrollable inner container. Width clamps to `min(320px, 100vw - 16px)` for small screens
- **MobileNav scroll sensitivity** — increased hide threshold (200→300px), widened dead zone (8→15px), added directional lock requiring 40px sustained movement before toggling. Prevents iOS momentum jitter

#### Sort Dropdown Redesign
- **Custom glass sort dropdown** — replaced native `<select>` on articles index and category landing pages with styled glass dropdown (backdrop-blur, rounded-xl, animated chevron rotation, active state highlighting, keyboard accessible with Escape-to-close)

#### Transitions & Polish
- **Continue Reading fade transition** — smooth opacity + max-height CSS animation replaces instant display toggle
- **Related topics section** — added `max-w-2xl` containment, white card backgrounds, subtle chevron arrows for visual refinement

#### Admin Dashboard Polish
- **Pipeline grid gaps** — 6px → 8px, standardized card padding to 0.625rem, increased stage header/body padding
- **Agent panel typography** — headers 0.6875rem → 0.75rem with increased padding for breathing room
- **Snappier animations** — tightened 0.3s → 0.2s across pipeline stages, cards, count badges, tab navigation

## [16.5.0] - 2026-04-01

### Added — Complete Cost Tracking
- **Full pipeline cost logging** — illustration (GPT Image, $0.08 padded) and narration (ElevenLabs, $0.14/1k chars padded) now logged to `daily_article_log` via `addCostToLog` in stage-publish
- **System overhead tracking** — new `addOverheadCost()` utility creates daily `_system_overhead` rows for non-article costs: scout (3x/day), pinger (4x/hour), topic-merge, process-article, refine-article, editorial-qc
- **All pricing padded 10-15%** above listed API rates so dashboard never under-reports actual spend
- **`FLAT_PRICING` constant** in constants.ts for non-token services (illustration, narration)
- **Cost dashboard breakdown** — Total Spend now shows $/article avg and overhead spend underneath
- **`backfill-media-costs` action** — retroactively adds illustration + narration costs to historical published articles (105 articles, +$13.95)
- Pipeline admin filters `_system_overhead` from UI logs but includes in total spend

### Added — Narration Controls
- **Voice selector (CMK1/CMK2)** — admin can choose between two ElevenLabs voices for narration generation
- **Persistent narration settings** — voice choice, preset, and all slider values saved to localStorage

### Improved
- **Light-mode article images** — translucent white overlay (15% opacity) on all card image containers in light mode via `hero-img-wrap` class across all 6 card types

### Fixed
- **Admin narration regeneration** — single-article "Generate" now sends `force: true`
- **Narration cache-busting** — append `?v=timestamp` to narration URLs so browsers serve fresh audio

## [16.3.0] - 2026-04-01

### Improved — Admin Pipeline Layout Redesign
- **2-row adaptive pipeline grid** — replaces cramped 7-equal-column layout. Row 1: Research + Editor (left), Write card spanning the right third at full height for hybrid workflow (Copy Brief, Submit Article, headline input). Row 2: Independence → QC → Voice Polish → Copy Edit → Publish (5 equal columns). Three responsive breakpoints (1400px, 1100px, 900px)
- **Dashboard max-width widened** from 1400px to 1600px — all sections have more breathing room
- **Queue/Published split** changed from 1fr/1fr to 3fr/2fr — queue gets 60% of width since it has more controls (upload, search, filters, topic cards)
- **Improved spacing** throughout: stats cards, pipeline cards, stage headers/bodies, status bar, section titles, opus workflow box all get more padding
- **Write stage body** has no max-height limit — hybrid workflow UI (brief copy, article submission) is never clipped

## [16.2.0] - 2026-04-01

### Added
- **Improve button → full pipeline re-run** — "Improve" on any published article sends it back through research → editor → write → independence → QC → publish, keeping the same slug so it overwrites the old version. Replaces the previous lightweight AI-review behavior. Confirmation dialog prevents accidental triggers. Stage-editor preserves the original slug for improve runs (`source: "improve"`). Narration is regenerated on publish for improved articles
- **Expandable article detail panel** — clicking any article row in the Articles tab expands a full-info panel: metadata (slug, dates, tags, keywords, word count), scores (independence/editor/QC with color coding), pipeline log (source, model, cost, token usage table), editor brief (archetype, tone, emphasis/avoid), independence review (verdict, flags with quotes/rewrites, strengths), QC result (decision, voice check grid), PubMed verification (citation details), audio narration player, illustration preview, and TOC. Pipeline log fetched on-demand via new `get-log` action
- **Text action labels** — replaced cryptic SVG icons with readable text: Improve, View, Edit, Delete

## [16.1.0] - 2026-04-01

### Added
- **TopicNav hover dropdowns** — each category pill shows a glass dropdown on hover with tagline, 4 latest articles, "New" badges, and "View all" link. Panels rendered outside scroll container to avoid overflow clipping, positioned via JS
- **Voice settings panel** for narration (admin → AI Agents → Narrations) — 6 presets (Default, Anchor, Podcast, Dramatic, Clinical, Storyteller) + 4 custom sliders (Stability, Similarity Boost, Style Exaggeration, Speed). Settings pass through to ElevenLabs API
- **Author unification** — all 153 articles + all pipeline bylines now use "Max Lundin" as author name

### Fixed
- **Title/heading word limits tightened** across 7 pipeline prompts — "target 5-8, hard cap 10, count before submitting" replaces soft "max 10". Section headings: "4-8 words hard range, 9 is a failure." Added missing constraints to `process-article`
- **Batch narration timeout** — replaced sequential processing (guaranteed timeout for >5 articles) with fire-and-forget dispatch. Each article generates in its own function invocation
- **Narration "missing" count** was including draft/archived articles — now filters to published only, matching batch query logic
- **Narration result messages** now show article title instead of slug

## [16.0.1] - 2026-03-31

### Improved — Section Heading Prompts Across Pipeline
- **stage-write**: Enhanced h2 guidance — headings must state findings/failures/consequences, trace the article's argument in sequence, match article mode (provocation vs narrative vs explainer), banned colon constructions/list headings/meta-commentary, 4–8 word target
- **stage-copy-edit**: Added banned heading patterns, argument-tracing check, mode-matching awareness to header review rules
- **stage-qc**: New "Section Heading Check" block — flags colons, lists, meta-commentary, table-of-contents patterns
- **editorial-qc**: Added section heading spot-check to collection-level QC — catches cross-article heading pattern repetition
- **pipeline-admin**: Upgraded "Copy Brief for Claude" prompt with full heading guidance for human writer

## [16.0.0] - 2026-03-31

### Added — Ultra UX Overhaul: Categories, Navigation, Discovery (17 files: 9 new, 8 modified)

#### Category Domain System
- **4 editorial domains** group 9 categories: Mind (Neuroscience, Mental Health, Sleep Science), Body (Nutrition, Fitness, Longevity), Medicine (Clinical Evidence, Pharmacology), Environment (Environmental Health)
- **Per-category editorial metadata** — tagline + description for landing pages and navigation
- **Domain helpers** — `getDomainForCategory()`, `getCategorySlug()`, `getCategoryFromSlug()`

#### Category Landing Pages (`/topics/[slug]`)
- **9 category pages** generated via Astro dynamic routes — each with gradient hero, editorial tagline/description, article count, featured article lead card, sorted article grid, related topics footer
- **Sort dropdown** on each category page (Newest, Oldest, Shortest, Longest, A–Z)
- **"New" + narration badges** on all category page cards

#### Navigation Redesign
- **Dropdown menu** — flat topic pills replaced with 4-column domain-grouped layout, each category shows article count badge. Added "Start Here" + "Collections" to sections grid (6 items total). Widened to `max-w-3xl`
- **SideNav** — topics grouped by domain with article counts, "Start Here" + "Collections" links added
- **TopicNav** — links now point to `/topics/[slug]` routes instead of `?topic=` query params
- **Breadcrumbs** — article pages link to `/topics/[slug]` instead of `?topic=`

#### Start Here Page (`/start-here`)
- **Curated onboarding** for new readers — 5 handpicked articles, numbered, with editorial intro
- **"How We Work"** section linking to editorial standards
- **Browse by Interest** — 4 domain cards with icons and category listings
- **"Ready to dig in?"** CTA to articles + collections

#### Curated Collections (`/collections`, `/collections/[slug]`)
- **5 themed collections**: "Your Body Is Lying to You", "The Invisible Exposures", "Follow the Money", "Brain Deep Cuts", "The Sleep Files"
- **Collections index** — gradient cards with article count + total read time
- **Collection detail** — numbered article list in editorial order, gradient hero, related collections footer

#### Author Bylines
- **Dynamic author names** — article hero and footer card now show `author.name` and `author.role` from article JSON (previously hardcoded "alumi news Editorial")
- **Author initials** in avatar circle (e.g., "lc" for Linda Carnes instead of generic "an")
- **`getAuthorInitials()` helper** added to articles.ts

#### Reading Progress
- **Scroll tracking** — `ReadingProgressTracker` component saves scroll position per article to localStorage (throttled via rAF, records after 5%, marks complete at 90%)
- **"Continue Reading" on homepage** — shows up to 3 in-progress articles with progress bar and percentage, auto-hidden when empty

## [15.7.0] - 2026-03-31

### Added — Content Discovery & Article Presentation UX (10 files)

#### Clickable Tags & Tag Filtering
- **Article tags are now links** — every tag on article pages links to `/articles?tag=X`, replacing static spans
- **Tag filtering on articles index** — `?tag=` URL param filters articles by tag with active filter pill and clear button
- **Keywords in search** — article search now matches against the `keywords` metadata field (previously title + tags only)

#### Discovery Badges
- **"New" badge** — red pill badge on article cards for articles published within 7 days (homepage, articles index, category overview)
- **Audio narration badge** — speaker icon on cards with `narrationUrl` (homepage, articles index, category overview)
- **Series indicator** — "Part X of Y" badge on ArticleCard component when article belongs to a series
- **"Updated" indicator** — article hero shows "Updated {date}" when `updatedDate` differs from `publishDate`

#### Sort & Filter Controls
- **Sort dropdown on articles index** — Newest, Oldest, Shortest, Longest, A–Z (client-side reordering)
- **Active filters bar** — shows current tag filter with dismiss button, "Clear all" action
- **Sort changes auto-switch to filtered view** for sorted results

#### Reading List Enhancements
- **Total read time** — reading list page shows "X saved · Y min total"
- **Sort options** — Date Saved, Shortest First, Longest First, By Category, A–Z
- **Reading list count badge** — numeric badge on SideNav and MobileNav (reads localStorage, updates on storage events)

#### SideNav Fix
- **"New" badge logic corrected** — SideNav featured articles only show "New" if published within 7 days (was showing for all 5 featured articles regardless of age)

#### Utility Layer
- `Article` interface: added `updatedDate`, `keywords` fields
- New helpers: `isNewArticle()`, `getAllTags()`, `getSeriesTotal()`

## [15.6.1] - 2026-03-31

### Fixed — Merge All loops until queue is clean
- **Multi-pass merge**: "Merge All" now automatically re-analyzes after merging, repeating until no more duplicate clusters are found (max 5 passes). Eliminates the manual reload-and-rescan cycle
- **Auto-removes already-published dupes** found in each pass
- **Extracted `runMergeAnalysis()` helper** — shared between single-scan and loop, no code duplication
- **Pass-by-pass progress feedback**: "Pass 2: re-scanning for new duplicates…" shown during each re-analysis
- **Summary message**: "Merged 12 clusters · across 3 passes · removed 4 already-published"

## [15.6.0] - 2026-03-31

### Improved — Ultra Polish: Performance, Security & Design System (12 files)

#### Performance
- **22 `transition-all` eliminated** — global.css (12), pages (10). Every transition now targets only the properties that actually animate (box-shadow, border-color, width, opacity, transform, background-color, color)
- **Hero image CLS fix** — added `width="1200" height="675" decoding="async"` to ArticleLayout hero `<img>`
- **Asset caching** — `Cache-Control: immutable, max-age=1yr` for `/_astro/` and `/assets/` hashed files via vercel.json

#### Security
- **HSTS** header — `max-age=31536000; includeSubDomains; preload`
- **CSP hardened** — added `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`
- **OG image dimensions** — `og:image:width/height` meta tags for faster social card rendering

#### Accessibility
- **`focus-visible`** on "See all" category buttons and "Clear all" reading list button
- **`aria-hidden="true"`** on search magnifier SVG (decorative)
- **`aria-live="polite"`** on reading list count (screen readers announce changes)

#### Print Stylesheet
- **Expanded print rules** — page-break-inside avoid for images/quotes/callouts, orphan/widow control on headings, code block background reset, dark mode resets, hide floating UI (TOC, share bar, CTA), skip URL display for internal/anchor links

#### Admin Design System
- **60+ hardcoded hex → CSS variables** in PipelineMonitor.tsx and AgentsPanel.tsx — zero hex colors remain in either component
- **5 new shade variables** in admin.css: `--admin-green-light`, `--admin-yellow-light`, `--admin-red-light`, `--admin-red-pale`, `--admin-purple-light`

## [15.5.1] - 2026-03-31

### Improved — Performance & Accessibility Polish (17 files)

#### Performance
- **CommandPalette deferred hydration** — `client:load` → `client:idle`, React bundle no longer blocks initial page load
- **`transition-all` eliminated** — Header menu toggle and articles lead card now animate only specific properties (color, transform, box-shadow)
- **Backdrop blur reduced** — MenuDropdown `backdrop-blur-xl` (24px) → `backdrop-blur-md` (12px), less GPU work
- **Progress bar layout thrashing fixed** — admin pipeline + agents progress bars now use `transform: scaleX()` instead of animating `width` (avoids per-frame layout recalculation)

#### Accessibility
- **`focus-visible` rings** on 6 components: ShareButtons, HighlightShare, BookmarkButton, AudioNarration, FloatingTOC collapse, Breadcrumbs links
- **`aria-current="page"`** on MobileNav active item — screen readers now announce current page
- **BookmarkButton touch target** — 40px → 44px (meets WCAG minimum)

#### Motion Sensitivity
- **`prefers-reduced-motion`** media queries added to Header, FloatingTOC, FloatingShareBar, HighlightShare — disables transitions for users with vestibular sensitivity
- **FloatingTOC smooth scroll** respects reduced motion (falls back to instant jump)

#### Vertical Rhythm
- **Reading list** — non-standard `py-14 md:py-20` normalized to `py-16 md:py-24`
- **Articles App CTA** — `py-16 md:py-24` normalized to `py-12 md:py-16` (matches articles page section scale)

## [15.5.0] - 2026-03-31

### Improved — UI Ultra Audit (17 files, 50+ fixes)

#### Accessibility
- **Universal focus-visible styles** — added explicit focus ring + glow on icon buttons (share, back-to-top, bookmark, narration, footer social, mobile nav)
- **AudioNarration touch target** — bumped from 32px to 40px with larger 18px icons, meeting 44px minimum with padding
- **BookmarkButton `aria-pressed`** — screen readers now announce toggle state; JS syncs attribute on click
- **MobileNav tap feedback** — restored `:active` background highlight (was removed by `-webkit-tap-highlight-color: transparent`)

#### Interaction Polish
- **Image zoom on card hover** — article cards and featured cards now `scale-105` their images on hover via CSS
- **ShareButtons scale** — reduced hover scale from 1.1 (too aggressive) to 1.05
- **BookmarkButton press-scale** — micro-interaction `scale(0.9)` on press, bookmarked state gets subtle primary background
- **Footer social buttons** — hover lift increased from -1px to -2px with box-shadow depth
- **MobileNav active state** — current page gets primary background fill + bolder font weight + thicker icon stroke
- **SeriesNav progress dots** — height increased from 6px to 8px for better visibility and touch targeting
- **Reading list** — empty state wrapped in card with border, cards get `shadow-card` on hover, title shows 2 lines instead of 1

#### Design Token Consistency
- **15+ hardcoded RGB/RGBA values → `theme()` functions** in FloatingTOC, MobileNav, FloatingShareBar, HighlightShare, ShareButtons, SideNav, global.css (data-callout, search-overlay, category-chip)
- **HighlightShare** — button size 36→40px, border-radius 10→12px (matches design system)

#### Transition Consistency
- **12+ bare `transition-colors` fixed** with explicit `duration-200` across MenuDropdownContent, SideNav, SeriesNav, AppPromo, ArticleCard, FloatingTOC
- **All transitions use `ease-out`** — replaced browser-default easing in AudioNarration, HighlightShare, ShareButtons, FloatingTOC, Footer
- **FloatingTOC collapse icon** — SVG rotation now animated (was instant)
- **Newsletter subscribe button** — multi-property transition instead of flat `transition-colors`

#### Dark Mode Contrast
- **8 instances of `dark:text-stone-500` bumped to `stone-400`** — labels in MenuDropdownContent, SideNav (meta, hint), SeriesNav (count, link-label) were below WCAG AA contrast on dark backgrounds
- **SideNav `text-[11px]`** → `text-xs` (12px) for readability

## [15.4.1] - 2026-03-31

### Fixed
- **Topic merge timeout bug** — `fetchWithTimeout` timeout was passed as a 3rd positional argument (silently ignored by JS) instead of inside the init object. Analyze calls defaulted to 60s instead of 120s, causing client-side abort before GPT-5.4 could finish clustering 130+ topics. Fixed both `analyzeMerge` and `executeMerge` calls

### Improved — Topic Merge UX
- **"Merge All" button** — one-click sequential merge of all clusters with confirmation dialog, progress indicator, and failure count
- **"Clusters ▾" toggle** — button now toggles panel open/closed instead of re-running analysis. Shows ▾/▸ indicator
- **"Re-scan" button** — moved re-analysis to explicit button inside panel header
- **Safe guards** — Re-scan and Dismiss buttons disabled during active merge operations

## [15.4.0] - 2026-03-31

### Added — Intelligent Topic Merge System
- **AI-powered duplicate detection** — "Find Duplicates" button in Topic Queue uses GPT-5.4 to semantically cluster duplicate topics across the entire queue (~157 topics analyzed, 29 clusters found in first run). Catches conceptual duplicates that word-overlap dedup misses (e.g., "Ozempic side effects" vs "GLP-1 adverse events")
- **One-click merge** — each cluster shows per-topic checkboxes, AI reason, and confidence badge. Merge uses Sonnet to synthesize the best framing, all unique angles, and combined research from all versions into one "super-topic" brief (~$0.01/merge)
- **Already-published detection** — flags queued topics that duplicate existing articles (51 flagged in first run) with batch-remove
- **"Merged" filter tab** — purple badge in queue filters, only appears when merged topics exist. Merged topics show purple "MERGED" source badge
- **New edge function**: `topic-merge` with `analyze` and `merge` actions, proxied through `pipeline-admin`
- **DB migration**: extended `topic_queue.source` check constraint to include `'merged'` and `'breaking'`

### Fixed
- **Batch narration force-regen bug** — `force: true` was re-narrating the same 20 newest articles repeatedly. Now orders by `updated_at ASC` (oldest-updated first) and explicitly bumps `updated_at` after each narration, so each batch makes progress through the full catalog
- **16 legacy articles backfilled** — articles that existed on GitHub but had no DB record are now seeded (boredom-is-a-superpower, thyroid series, free-will series, etc.)

## [15.3.0] - 2026-03-31

### Fixed — Narration/Illustration GitHub Sync
- **Admin-generated narrations now appear on the live site** — `generate-narration` was only saving to DB + Storage, never syncing `narrationUrl` to the GitHub JSON file. Since the Astro site reads from JSON, narrations generated via the admin panel were invisible to readers
- **Same fix applied to `generate-illustration`** — illustrations generated from the admin panel now sync `heroImage` to GitHub JSON automatically
- **Shared `updateGitHubJson()` utility** — extracted duplicated GitHub JSON update code (~110 lines) from `stage-publish` into a reusable function in `_shared/github.ts`. Both `generate-narration` and `generate-illustration` use it
- **Admin CSS overflow fix** — narration "Generate" button was getting pushed off-screen by long article titles. Added `min-width: 0` on select + `flex-shrink: 0` on `.admin-nowrap`

### Changed
- **Narration voice** updated to `LkgZkNm7dD8b7nbdptAB`
- **Narration model** switched from `eleven_v3` to `eleven_multilingual_v2`
- **Narration settings** tuned: stability 0.3, similarity 0.6, style 0.4
- **Regenerated all narrations** (~166 articles) with new voice/model/settings

### Known Issues
- **Batch force-regen repeats same articles** — `force: true` re-narrates already-narrated articles ordered by publish date, so the same recent articles get re-narrated each batch instead of progressing through the full list. Needs a "last regenerated" timestamp or batch offset
- **16 legacy articles not in DB** — older articles exist as GitHub files but have no DB record, so `generate-narration` can't find their descriptions. Need DB backfill or file-based fallback

## [15.2.0] - 2026-03-30

### Added — Triangulated Research
- **Multi-model research** — directed research now fires Gemini (establishment sources + Google Search), Grok (contrarian evidence, independent investigators, social data), and Claude (primary evidence, funding trails, court documents) in parallel via `Promise.allSettled`. Results merged with `[Contrarian]`, `[Academic]`, `[Establishment]` labels. Raw per-model output preserved in `_researchSources`
- Contrarian findings appear **first** in merged output — editor reads top-down, forms initial impression from uncomfortable evidence before institutional response
- Grok gets **6000 maxTokens** (up from 4000) for deeper contrarian investigation

### Changed
- **Editorial prompt tweaks** (from Opus self-diagnosis): "follow the money in both directions" (product AND narrative), ban meta-commentary sentences, replace 7-point self-editing checklist with two-pass instruction
- **Narration settings** tuned: stability 0.2, similarity 0.6, style 0.6

### Fixed
- **Admin crash on expand** — `dogmaWarnings.join()` on string instead of array
- **Editor kill override** generated null slug/headline/description — now generates from topic text
- **Queue delete** silently failing — FK constraint on `daily_article_log.queue_id`
- **Copy Brief** clipboard failure — prefetches from server on mount, copies synchronously on click
- **Missing imports** in stage-research (`grok`, `ApiResult`)

## [15.1.1] - 2026-03-30

### Fixed
- **Copy Brief for Claude** — prefetches from server on card mount, copies synchronously on click. Single source of truth (server's `get-brief` endpoint). Previous versions either used a stale client-side copy or broke clipboard permissions with async fetch
- **Queue delete silently failing** — FK constraint on `daily_article_log.queue_id` blocked deletes. Now clears FK reference first and checks the delete result
- **Editor kill override** — was checking `_queueSource === "manual"` but produced topics had `_queueSource: "queue"`. Changed to check `_fromQueue` which is always true for any topic you click Produce on
- **Array.isArray guards** — brief fields (`emphasize`, `avoid`, `dogmaWarnings`) could be strings or arrays depending on editor model output. Added defensive checks in `stage-write`, `pipeline-admin`, and `stage-copy-edit`
- **QC voiceCheck type** — frontend type updated to match new craft-focused fields (`craftTest`, `gearChanges`, `textToFriendParagraph`)
- **Optimistic queue delete** — item disappears from UI immediately on confirm instead of waiting for full 330-item list re-render
- **Dead code cleanup** in stage-copy-edit error recovery path

### Changed
- **Editor brief fields** rewritten with editorial voice: `emphasize` → "threads to weave through the piece", `openWith` → "the actual detail that should hit the reader first", etc.
- **Header variety rule** — softened from rigid "no two headers can share..." to "read them back to back, they should feel varied and natural"
- **Removed hardcoded examples** from editor headline rules, dogma warnings, stage-write verdicts
- **stage-write** banned phrase list synced with voice-audit (33 phrases), removed hardcoded dogma trap list

## [15.1.0] - 2026-03-29

### Changed — Editorial Quality Overhaul
- **Craft-first QC**: rewrote QC prompt around craft quality (rhythm, gear changes, "text to a friend" test, "exceptional writer" test) instead of blunt mechanical checks. Removed "you" count minimum as a quality signal
- **Voice blend updated across all stages**: Hitchens, Maher, Harris, 60 Minutes (investigative accountability), PBS Frontline (deep-build structure, exceptional openings), Veritasium (revelatory curiosity). All 8 stages now share the same blend
- **Writer brief self-editing checklist**: 7-point craft checklist the writer must pass before submission
- **Voice audit metrics**: added sentence length variance, micro-sentence count, opening sentence length. Removed "you" count enforcement
- **Removed all hardcoded examples** from every editorial prompt — replaced with descriptions of principles. Prevents AI parroting of example headlines/sentences
- **Synced banned phrase lists**: stage-write now matches voice-audit (33 phrases)
- **Pipeline harmony audit**: all stages now share consistent voice blend, craft standards, metrics, and no hardcoded examples

## [15.0.0] - 2026-03-29

### Added — Copy Edit Pipeline Stage
- **Stage 8: Copy Edit** — new pipeline stage between QC and Publish. Reviews headline, description, and section headers for quality. Sonnet primary, Gemini Pro fallback. Conservative by design: confidence gate at 8/10 means only clearly better changes are applied. 0 changes is a valid and common outcome
- **`data-callout` CSS class** — styled methodology notes, caveats, and disclaimers with dark theme support. Replaces inline-styled yellow notepad boxes
- **Inline style ban in writer prompt** — stage-write now explicitly forbids `style=""` attributes and hardcoded colors in generated HTML

### Changed
- Pipeline is now 8 stages: Research → Editor → Write → Independence → QC → Copy Edit → Voice Polish → Publish
- QC stage dispatches to `stage-copy-edit` instead of directly to `stage-publish`
- `stage-publish` accepts `copy_edited` as entry status (plus existing `qc_approved` and `voice_rewrite_done` for backwards compat)
- Safety-net SQL dispatch routes `qc_approved` and `voice_rewrite_done` through copy-edit
- Dashboard pipeline view shows Copy Edit stage column with applied/proposed change details

### Fixed
- **Yellow notepad bug** — removed hardcoded inline `background: #fef3c7` from medical-error article, replaced with proper `data-callout` class
- **QC kill override** — manually queued and human-written articles can no longer be killed by QC (force-publishes instead, matching existing revise/voice-rewrite protections)

## [14.6.1] - 2026-03-29

### Added
- **Narration Agent panel** — admin AI Agents tab now has a Narration panel (side-by-side with Illustrations) with single-article selector, "Generate Missing" batch button, and "Regenerate All" with styled confirm modal

### Changed
- **ElevenLabs voice ID** updated to `rmcMTKMrh0yz0C1KMQPs` in centralized constants for all future narrations

## [14.6.0] - 2026-03-29

### Added — Admin UX Polish
- **Styled confirm modals** — replaced all 13 native `confirm()` dialogs with glass morphism modals (ConfirmModal component + useConfirm hook). Focus trapping, Escape key, backdrop click, entrance animation
- **ARIA tab roles** — dashboard and edit page tabs now use `role="tablist/tab/tabpanel"`, `aria-selected`, `aria-controls/aria-labelledby`, arrow key navigation (Left/Right/Home/End), roving tabindex
- **Dialog accessibility** — all modals have `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, auto-focus on cancel button
- **Request timeout handling** — `fetchWithTimeout()` utility (60s default, AbortController-based) applied to all 37 admin fetch calls. Prevents hung requests from blocking the UI

### Changed
- ArticlesManager delete modals upgraded from inline JSX to reusable ConfirmModal component
- Edit page publish/delete confirmations now use styled modals instead of native browser dialogs

## [14.5.1] - 2026-03-29

### Fixed — UI Polish & Accessibility Audit
- **Focus-visible styles** — all interactive elements (links, buttons, tabs, inputs) now have visible keyboard focus rings with primary color outline
- **Z-index stacking conflicts** — established clear hierarchy: FloatingShareBar (35) < FloatingTOC (40) < MobileNav (45) < Back-to-top (46). Previously MobileNav and FloatingTOC both at z-40
- **Decorative SVGs missing aria-hidden** — added `aria-hidden="true"` to 12 decorative icons across BaseLayout, SeriesNav, AudioNarration, BookmarkButton, Newsletter
- **FloatingTOC hardcoded colors** — replaced 12 raw `rgb()` values with Tailwind `theme()` tokens for consistent theming
- **FloatingShareBar hardcoded color** — replaced `#a8a29e` with `theme('colors.stone.400')`
- **AudioNarration error state** — audio load failure now visually dims button and disables interaction instead of only logging to console
- **Newsletter aria-live region** — added `role="status"` for proper screen reader announcements
- **SeriesNav empty placeholders** — changed empty `<div />` to `<span />` to reduce semantic noise in grid

### Removed — Dead CSS Cleanup (~150 lines)
- `.cursor-dot` / `.cursor-ring` — custom cursor classes never implemented
- `.split-text` / `.char` — GSAP split text animation never used
- `.blur-gradient` — gradient utility never referenced
- `.home-layout`, `.home-main`, `.home-masthead`, `.home-featured`, `.featured-label`, `.home-sidebar` — old homepage layout classes replaced by current implementation
- `.sidebar-section`, `.sidebar-heading`, `.sidebar-list`, `.sidebar-link`, `.sidebar-num`, `.sidebar-more`, `.sidebar-tag`, `.sidebar-newsletter` — old sidebar classes replaced by SideNav component

### Improved — Performance
- **Reveal animations** — added `will-change: opacity, transform` for smoother GPU-accelerated transitions

## [14.5.0] - 2026-03-29

### Fixed — Mobile & Accessibility Audit
- **HighlightShare touch targets** — 36px buttons expanded to 44px on touch devices via `@media (pointer: coarse)`
- **FloatingTOC pill overlaps MobileNav** — added `env(safe-area-inset-bottom)` to bottom positioning on notched iPhones
- **FloatingTOC pill text selectable** — added `user-select: none` to prevent accidental selection when tapping
- **ShareButtons gap too tight** — inline share button gap widened from 4px to 8px for fat-finger safety
- **Back-to-top hidden behind MobileNav** — z-index raised from 30 to 40
- **iOS auto-zoom on admin inputs** — all admin form inputs forced to 16px font on touch devices
- **Admin stat grid unreadable on phones** — now wraps to 3-column at 900px, 2-column at 600px
- **Admin nav links too small for touch** — 44px min-height, responsive font size
- **Admin modals overflow on small screens** — max-width respects viewport, reduced padding
- **Articles search input triggers iOS zoom** — changed from `text-sm` (14px) to `text-base` (16px)

### Added — Mobile & Accessibility Polish
- **`viewport-fit=cover`** on all pages (public + 4 admin pages) for proper notch/safe-area support
- **Admin safe area insets** — left/right padding respects notch on header and main content
- **Admin iPhone SE breakpoint** (380px) — smaller stat numbers, tighter padding, hidden logo badge
- **Newsletter form accessibility** — `<label>` with `htmlFor`/`id` pairing, `autocomplete="email"`, `aria-live="polite"` region announces subscribe/error status to screen readers
- **Admin touch scrolling** — dashboard tabs use `-webkit-overflow-scrolling: touch` for smooth horizontal scroll
- **Admin action buttons** — 44px min-height touch targets on mobile

## [14.4.0] - 2026-03-29

### Added — Upload Article to Pipeline (Dashboard)
- **"Upload Article to Pipeline"** collapsible form on Pipeline tab, above topic queue
- **Two entry points**: "Full Chain" (research → editor → write → QC → publish) queues as topic with source material; "Finished Article" (independence → QC → publish) submits directly
- **File upload**: drag-and-drop or file picker for .pdf, .md, .docx, .html, .txt — PDF/DOCX parsed server-side via `parse-file` action
- **URL fetch**: paste a URL, server fetches and strips to clean text via `fetch-url` action
- **Auto-suggest title**: first heading, markdown heading, or first sentence auto-fills the title field on paste/upload/fetch
- **Queue search and filter**: search bar filters by topic/category/notes, status tabs (Queued/All/Completed/Active), search overrides status filter
- **Requeue + Delete buttons** on completed/skipped queue items
- **Queue sort fixed**: now matches dispatch order (expedite first, low priority number first)

### Fixed — Admin Dashboard Stability
- **React hydration crash killed all admin components** — Astro prop serialization of large objects (article HTML, research_data) caused React 19 hydration mismatch (#418) that left event handlers dead. Fixed by switching all admin islands to `client:only="react"` (no server HTML = no hydration = no mismatch)
- **mammoth + pdfjs-dist broke React hydration** — both libraries (884KB total) had Node.js `process` references that caused hydration mismatches even as dynamic imports due to Vite preload-helper. Removed both from client bundle; file parsing moved server-side
- **CSP blocked pdfjs worker** — added `cdn.jsdelivr.net` to `script-src` and `worker-src`
- **Housekeeping nuked fresh queue items** — status endpoint's dedup logic auto-completed manually queued topics within seconds if 50%+ words matched a published title. Now only deduplicates items >2 hours old
- **Status endpoint hid completed queue items** — only returned queued/assigned/in_progress, so search couldn't find completed items. Now returns all
- **Editor killed manually queued topics** — category balance rules overrode MANDATORY EDITORIAL DIRECTION. Now: manually queued topics are NEVER killed; editor concerns become structural notes in the brief
- **QC voice rewrite loop on admin-editor articles** — Sonnet rewriting Sonnet is circular and timed out. QC now skips voice rewrite for `_writtenBy: "admin-editor"`
- **ArticlesManager missing auto-fetch** — needed for `client:only` rendering; now fetches on mount when initialArticles is empty

## [14.3.0] - 2026-03-29

### Fixed — Admin Article Editor Overhaul
- **ArticleEditor completely broken on Vercel** — `getApiBase()` used `import.meta.env?.PUBLIC_SUPABASE_URL` (optional chaining) which Vite's define plugin doesn't match for static replacement. Supabase URL was never injected into client bundle, so all API calls 404'd. Fixed by passing `apiBase` as a server-side prop (same pattern as dashboard components). Removed dead `getApiBase()` function
- **ArticleEditor crash on generate** — `process-article` API returns no `gradient` field in metadata, but editor accessed `gradient.from` unconditionally. Now defaults gradient from `CATEGORY_GRADIENTS` based on category
- **ArticleEditor crash on draft restore** — drafts saved before gradient fix had no `gradient` field. Added gradient defaulting on localStorage draft load and optional chaining on all render-time gradient access
- **Preview iframe blocked on edit page** — `X-Frame-Options: DENY` and `frame-ancestors 'none'` in `vercel.json` blocked same-origin iframes. Changed to `SAMEORIGIN` / `frame-ancestors 'self'`

### Added — Article Editor Pipeline Integration
- **Articles from `/admin/new` now enter the production pipeline** — previously bypassed all quality gates (independence review, QC, voice audit) with direct GitHub publish. Now submits to pipeline via new `submit-new-article` action
- **New `submit-new-article` action in `pipeline-admin`** — creates pipeline log entry with `source: "admin-editor"`, saves article to DB, and chain-dispatches to `stage-independence` for Grok adversarial review
- **UI updated**: "Publish to GitHub" → "Submit to Pipeline", done state links to Dashboard pipeline tab instead of article page
- **QC skips voice rewrite for admin-editor articles** — articles generated by Sonnet via `process-article` don't benefit from Sonnet voice rewrite (circular). Treated same as human-written: skip voice rewrite, publish directly

## [14.2.0] - 2026-03-28

### Fixed — Admin Auth & Error Handling Overhaul
- **Edit page saves were returning 401 Unauthorized** — `doSaveMetadata()`, `doSaveContent()`, and save-refined-article all called `articles-api` without Authorization header. Every save, autosave, and Cmd+S silently failed. Fixed all 3 calls
- **PipelineMonitor missing auth on 3 calls** — `produce-topic`, `submit-article`, and `clearAllBriefs` loop now send Authorization header
- **7 PipelineMonitor operations silently swallowed errors** — requeue, retry, update queue, delete queue, kill article now show success/failure toast via new `flashFeedback` system
- **6 fetch calls missing `res.ok` checks** — `triggerRun`, `triggerSingleScout`, `triggerScout`, `produceFromQueue`, `submit-article` now verify response status before parsing JSON
- **3 ArticleEditor DB saves missing status checks** — initial draft save, refine sync, publish status update now check `res.ok`
- **Edit page autosave race condition** — added `autosaveInFlight` mutex to prevent concurrent saves
- **Refine result triggered redundant autosave** — `suppressAutosave` flag prevents content textarea input event from firing during programmatic value set
- **Status messages persisted forever** — metadata/content save confirmations now auto-clear after 4 seconds
- **Refine save error used `alert()`** — now uses the `refineError` div consistent with other error patterns
- **Draft persistence lost initial chat/snapshot** — `saveDraft()` now includes generation message and initial snapshot instead of empty arrays
- **DOCX parse error left stale status** — "Parsing DOCX..." message now cleared on failure
- **Illustration result used `dangerouslySetInnerHTML`** — replaced with safe JSX rendering + separate `resultUrl` state
- **PipelineMonitor optimistic update without rollback** — `updateQueueItem` now refetches on failure

### Added — Narration Data in Admin
- **Dashboard stats bar** — new "Narrated" stat card showing article narration coverage (yellow if incomplete, green if all narrated)
- **Articles tab narration indicator** — each article row shows 🔊 (has narration) or 🔇 (missing) next to illustration indicator
- **Edit page narration field** — "Narration URL" input in metadata form, saved with autosave
- **`narration_url` added to `ArticleRecord` type** — all admin components can now access narration data

## [14.1.0] - 2026-03-28

### Added — Article Intro Narration (ElevenLabs TTS)
- **ElevenLabs v3 integration** — article descriptions narrated by custom "Frontline" voice, stored as MP3 in Supabase Storage
- **New edge function `generate-narration`** — extracts article description, calls ElevenLabs TTS API, uploads to `article-narrations` storage bucket, updates `narration_url` in articles table
- **Pipeline integration** — `stage-publish` auto-generates narration post-publish (after illustration), updates GitHub JSON, triggers Vercel rebuild. Non-fatal — articles publish without narration if TTS fails
- **Elegant UX** — small speaker icon inline with article metadata (category / date / read time / speaker). First tap enables narration and saves preference to localStorage. Subsequent articles auto-play. Tap again to mute
- **Batch backfill** — `generate-narration` supports `{ action: "batch" }` to narrate existing articles in chunks of 20
- **Voice settings** — stability 0.3, similarity 0.7, style 0.6, speaker boost on, centralized in `_shared/constants.ts`
- **Content schema** — `narrationUrl` added to Zod schema, Article interface, and mapArticle function
- **Database** — `narration_url` text column on articles table, `article-narrations` public storage bucket

## [14.0.0] - 2026-03-27

### Changed — Admin UI Redesign (Bloomberg Terminal Style)
- **Design system tightened** — border radii 12/8/6px → 6/4/3px, shadows simplified, decorative glass effects removed, ambient gradient removed
- **Stats bar** — 4×2 grid → horizontal ticker strip (single flex row, hairline dividers, left-aligned numbers, Inter with tabular-nums replacing Playfair Display serif)
- **Header** — 56px → 44px, compact nav links
- **Tabs** — uppercase, smaller, tighter padding
- **Pipeline** — 7-stage grid (was 5), tighter stage headers/cards, scrollable stage bodies (max-height 300px), compact status bar and buttons
- **Articles** — tighter toolbar, compact rows
- **AI Agents tab completely restructured**:
  - Collapsible accordions → always-visible panels (no toggle/chevron/expand)
  - Cron, Pinger, Database → compact status strip (one row of chips and buttons)
  - Decision Log → full-width table with columns (Status | Score | Headline | QC | Time), scrollable
  - QC + Reader Questions → side by side (3:2 grid)
  - Illustrations → compact bottom panel
- **All buttons** — ~30% smaller padding, no bounce hover effects
- **Responsive breakpoints** — pipeline 7→4→3→2→1 columns

## [13.1.0] - 2026-03-27

### Added — Multi-Source Citation Verification
- **Three academic databases** — citations now verified against PubMed, CrossRef, AND Semantic Scholar in cascade. Previously only PubMed, which missed most non-biomedical papers
- **Smart search strategies** — PubMed uses 4 tiers (exact title `[ti]`, title+journal, title+year, keyword fallback). CrossRef uses relevance scoring + fuzzy title match. Semantic Scholar as broadest fallback
- **PMIDs and DOIs returned** — verified citations now include clickable links to source papers (PubMed, DOI.org, Semantic Scholar)
- **DOI shortcut** — if research stage provides a DOI, verified instantly via CrossRef without title search
- **Non-academic source classification** — government reports, news, think tank publications classified as "skipped" instead of "NOT FOUND" failures
- **Research prompt updated** — now requests DOIs alongside title/journal/year for each cited study
- **Dashboard upgraded** — verified citations show green checkmarks with source badges (PUBMED/CROSSREF/S2) and clickable links. Failed stay red. Skipped show as gray dashes
- **Backfill button** — "Re-verify Citations" in admin Database & Maintenance section re-runs the 3-source verifier against all published articles retroactively
- **8 citations checked** per article (was 5)

## [13.0.1] - 2026-03-27

### Fixed — Footer Topic Links
- **Footer topic links were broken** — used `.toLowerCase().replace(/\s+/g, '-')` which produced `mental-health` instead of `Mental%20Health`. Articles page filtering matches against raw category names with spaces, so hyphenated links never matched. Fixed to `encodeURIComponent(cat)` matching TopicNav

### Added — Editorial Manual Links
- **`/howwewrite` linked from footer** — added to Explore column alongside About, Deep Dives, Subscribe
- **`/howwewrite` linked from about page** — "Read the full editorial manual" link under the "How We Write" section heading

### Changed — Editorial Manual Prose
- **Voice archetypes renamed** — replaced real-name influences with archetype nicknames: The Prosecutor (forensic structure), The Documentarian (rhythmic economy), The Cartographer (no throat-clearing), The Comedian (holding insiders accountable)
- **Brevity pass** — trimmed redundant prose across all 8 sections (~20% shorter) while preserving substance
- **Founding voice rewritten** — Mission and Legitimacy sections now lead with "health obsessives who got tired of the math" and the 90% agenda-driven content problem. No sponsors, no sacred cows, seriously balanced coverage
- **About page mission aligned** — same founding energy: "exists to push back," 90% line, no sponsors

## [13.0.0] - 2026-03-27

### Added — Topic Navigation Bar
- **Persistent topic nav** below header on every page — category links (`/articles?topic=X`) visible site-wide
- Hidden on homepage until user scrolls past hero, visible immediately on all other pages
- Hides/shows in sync with header on article page scroll
- Hidden on mobile touch devices (MobileNav handles navigation there)
- Replaces the inline "Browse by Topic" section that was floating mid-homepage

### Added — Editorial Manual (`/howwewrite`)
- Full editorial manual published as a page — mission, voice & tone, evidence standards, pipeline, article structure, always/never rules, legitimacy, funnel strategy
- Uses site design system with pull quotes, callout boxes, pipeline steps, always/never grid

### Changed — Design System Overhaul
- **Glow effects removed** — stripped ~100 lines of red hover glow from cards, buttons, nav links, footer, share buttons, TOC, back-to-top. Kept only on `.btn-primary`
- **Card numbers removed** — no more "01", "02", "03" overlays on article cards across homepage, articles page, related articles, ArticleCard component
- **Hero badge** — "Spring 2026" with pulsing dot replaced with dynamic "{count} investigations and counting"
- **Featured label** — "Featured Story" replaced with category-aware labels (The Evidence, The Research, The Mind, Brain Science, Investigation, The Body, The Long Game)
- **Newsletter visual** — rotated card stack replaced with clean vertical list of recent articles
- **Subscribe page** — aligned to site conventions: container width, button radius (`rounded-full`), input radius
- **Command palette redesigned** — emojis removed, frosted glass background, cleaner group headings, Pages + Actions merged into single "Navigate" group, tighter layout
- **Footer headings** — custom `text-[10px]` replaced with `text-overline` matching site typography scale
- **Subscribe page emojis** replaced with monospaced ordinal markers

### Fixed — View Transition Dark Mode Flash
- **Root cause**: during View Transitions, new page's `<html>` arrived without `dark` class — one frame rendered in light mode before `astro:after-swap` re-applied it
- **Fix**: `astro:before-swap` listener applies `dark` class to incoming document BEFORE DOM swap
- Added `background-color` on `html` and `html.dark` as safety net

### Fixed — Command Palette Focus Styles
- Global `*:focus-visible` red outline + `input:focus` glow leaked into command palette search input
- Excluded `[cmdk-input]` from both rules, added `outline: none` + `box-shadow: none` directly

### Changed — Spacing & Consistency
- **Section padding standardized** to `py-16 md:py-24` (major) and `py-12 md:py-16` (compact) across all pages
- **Page top padding** bumped to `pt-32 md:pt-36` (inner pages) and `pt-36 md:pt-44` (articles) to clear header + topic nav
- **Card borders unified** — featured card `stone-100` → `stone-200`, newsletter items `rounded-xl` → `rounded-2xl`
- **Inline line-heights removed** — 12 instances of `style="line-height: 1.7/1.8/1.85"` across 8 files (redundant with `text-body-lg` config)
- **Dead CSS removed** — `.article-card-number`, `.editorial-divider`, zoom comments
- **Homepage category chips** converted from filter buttons to navigation links, then replaced by topic nav
- **Articles page category chips** removed (redundant with topic nav)

## [12.9.0] - 2026-03-27

### Fixed — Queue Items Stuck at 'Producing' (Permanent Structural Fix)
- **Root cause**: `_queueId` was stored inside `research_data` (jsonb), which every pipeline stage overwrites entirely. Three prior "fixes" added read-before-overwrite band-aids in individual stages — each broke when the next stage touched `research_data`
- **Structural fix**: added `queue_id` UUID column to `daily_article_log` (FK → `topic_queue`). A column can't be overwritten by a JSON blob replacement. Removed all `_queueId` band-aids from `stage-research`
- `produce-topic` writes `queue_id` to the column; `stage-publish` reads it to mark queue completed; housekeeping uses it with `research_data._queueId` as fallback for pre-migration articles

### Added — Search Redesign & Deep Dive Sharing
- **Command Palette rebuilt** — idle state shows Recent + Browse by Topic (with counts) + Jump to Section + Pages + Actions instead of dumping all 124 articles. Search matches title, description, category, AND tags. Category drill-down with back button. Result count shown. Proper `role="dialog"` + `aria-modal`
- **Deep Dives sharing** — share button on each published series (Web Share API + clipboard fallback with anchor hash)

### Added — Scout Improvements
- **Everyday health topics required** — scout prompt now mandates 5+ everyday topics per run (common cold, allergies, back pain, headaches, bloating, blood pressure, etc.) alongside 5+ investigations and up to 10 deep/trending topics
- **Grok/X gets 2 of 3 daily scout runs** — 6am Gemini, 2pm Grok, 10pm Grok (was Gemini/Gemini/Grok). Better X/Twitter social trend coverage
- **Tighter dedup** — threshold 30% → 25% overlap, min words 2 → 3, added 40+ domain stop words. Cleaned 29 duplicates from queue

### Fixed — Accessibility & Polish
- **Touch targets to 44px** — Header theme/search (40→44), Footer social (40→44), SideNav actions (32→44), ShareButtons (36→44), HighlightShare (32→36)
- **Z-index hierarchy** — loader z-60, SideNav z-50, Header/MobileNav z-40, back-to-top z-30, noise z-10
- **`prefers-reduced-motion`** — admin.css + MobileNav now disable animations
- **ARIA** — scroll progress valuenow/min/max, breadcrumb separator aria-hidden, category chips aria-pressed
- **Article cards compacted** — image ratio 16/9 → 3/2, removed 2-row large card span

### Fixed — Pipeline Heading Variety
- Writer prompt + human brief enforce max 1-2 of 5-7 section headings starting with "The"

## [12.8.0] - 2026-03-26

### Added — Navigation Overhaul
- **Articles page: "Browse by Topic" view** — when "All" is active, articles are grouped by category (4 per topic) with section headers, counts, and "See all N" drill-down links. Selecting a category switches to a filtered grid with back-to-all navigation
- **Category chip counts** — both homepage and articles page show article counts inline: "Nutrition 15"
- **"Next in [Category]" strip** — at the end of every article, a one-line "Next in Nutrition" link shows the next article in the same category for continuous reading flow
- **URL state for category filters** — articles page updates `?topic=` param on filter change, making filtered views shareable and bookmarkable
- **Article utility helpers** — `getCategoriesWithCounts()`, `getArticlesByCategory()`, `getNextInCategory()` in articles.ts

### Fixed — Animation & Performance
- **View Transition stuttering eliminated** — reveal animations no longer cascade on page swap. Elements in/near viewport appear instantly (`transition: none` + immediate `.active`); only below-fold elements animate on scroll
- **Pipeline heading variety** — writer prompt and human-brief now enforce max 1-2 of 5-7 section headings starting with "The". Suggests questions, imperatives, provocations instead

## [12.7.2] - 2026-03-26

### Fixed — Full UX/UI Audit
- **Article card white space bug** — cards in CSS grid stretched vertically but content didn't fill the space, leaving large empty gaps. Added `flex flex-col` to `.article-card` and `flex flex-col flex-1` to `.article-card-content` so the footer pushes to the bottom via `mt-auto`
- **Broken TOC anchor links** — 5 of 7 "In This Article" links in `calcium-phosphorus-ratio-diet-health` pointed to non-existent IDs (e.g., `#why-ratio-matters` vs actual `#why-the-ratio-matters`)
- **Admin keyboard accessibility** — all admin form inputs had `outline: none` with no `focus-visible` replacement, making them invisible to keyboard users. Added global `focus-visible` styles
- **Subscribe page missing aria-label** — email input had no accessible label for screen readers
- **HighlightShare incorrect ARIA role** — used `role="tooltip"` on an interactive popup with buttons (tooltips must be non-interactive per ARIA spec). Changed to `role="group"`
- **Admin edit page XSS** — preview iframe srcdoc concatenated `articleData.title` and `.category` directly into HTML without escaping. Added `esc()` helper
- **Heading hierarchy violation** — `non-opioid-painkillers` article used `<h4>` as section headings directly after `<h2>`, skipping `<h3>`. Fixed to proper hierarchy

## [12.7.1] - 2026-03-26

### Fixed — Recurring Mojibake Root Cause (atob UTF-8 corruption)
- **Root cause found**: `atob()` in `featured.ts` and `stage-publish` decoded Base64 GitHub content to a binary string, corrupting multi-byte UTF-8 characters (em dashes, smart quotes) into mojibake (`Ã¢ÂÂ`). Every 6-hour featured rotation cycle re-corrupted the same files — which is why SGLT2 article had **triple**-encoded mojibake
- **Fixed `featured.ts` and `stage-publish`**: `atob()` → `Uint8Array.from()` + `TextDecoder` for proper UTF-8 decoding
- **Repaired 6 corrupted JSON article files**: circadian-syndrome, protein-powder, sglt2-inhibitors, chemical-sunscreen, blue-light-glasses, probiotic-skin

## [12.7.0] - 2026-03-26

### Changed — Headline System Overhaul
- **10-word max cap enforced across entire pipeline** — research, editor, writer, and QC stages all enforce max 10 words, one sentence only
- **Fixed contradictory editor prompt** — banned "two-sentence kickers" but every example was a two-sentence kicker. Replaced with 6 short single-sentence examples (5-9 words each)
- **Writer now owns the headline** — editor's headline reframed as "working headline" that the writer can improve. Write stage no longer force-overrides writer's title with editor's
- **submit-article accepts optional `title` field** — writer's title takes priority over editor's headline. Also accepts optional `description`
- **Dashboard submit form has title input** — new text field above the HTML textarea for overriding the editor's working headline
- **get-brief tells writer headline is improvable** — brief prompt explicitly says "improve if you can — max 10 words"
- **QC enforces the cap** — headlines over 10 words are shortened at QC stage as a hard gate

## [12.6.1] - 2026-03-26

### Fixed — Article HTML Tag Audit
- **Fixed 4 articles with broken HTML tags** causing layout issues (content flowing outside containers, styling not applying):
  - `omega-3-supplement-industry-waste-claims`: `</div>` closing a `<section>` → fixed to `</section>`
  - `aging-metabolic-reprogramming-caveats`: `</div>` closing a `<section>` → fixed to `</section>`
  - `intermittent-fasting-metabolic-switch-risks`: missing `</div>` for `article-content` wrapper
  - `engineered-bacteria-cancer-therapy-probiotics`: missing `</div>` for `article-content` wrapper
- **Audited all 121 article files** — no encoding issues, no mojibake, no broken symbols. 117 files clean

## [12.6.0] - 2026-03-27

### Changed — Manual-Only Production
- **Removed automatic queue pickup from `dispatch_pipeline_stage()`** — the 5-min cron was auto-producing up to 5 articles/day from scout-discovered topics without admin approval. Killed 6 ghost articles that had been auto-produced overnight
- **Cron now safety-net only** — recovers stuck articles and advances in-progress pipeline stages, but never picks new topics from the queue
- **All production is manual** — admin must click "Produce" on a specific topic in the dashboard. `produce-topic` action dispatches research directly via pg_net

## [12.5.1] - 2026-03-26

### Fixed — Post-Dashboard-Refactor Bugs
- **UTF-8 double-encoding in GitHub commits** — `btoa(unescape(encodeURIComponent()))` double-encoded non-ASCII characters in Deno, producing mojibake (â€" instead of —). Switched to `encoding: "utf-8"` for Git Blobs API and `TextEncoder`-based base64 for Contents API. Fixed in 4 files. Repaired 2 corrupted article JSONs
- **editor_approved → Write stage** — cards now appear in the Write box (not Editor) when waiting for human writing. Editor is done; Write is where the user acts
- **Articles tab auto-refresh** — IntersectionObserver fires on dashboard tab switch, visibilitychange on browser tab switch. No more stale article lists
- **Queue items stuck at "producing"** — topic matching replaced with `_queueId` lookup. `stage-publish` now marks queue items completed on publish. 30-minute auto-reset fallback for orphaned items
- **Opus brief rewritten** — removed prescriptive rules ("use 'you' 6 times", "max 3 sentences") that constrained Opus into forced prose. Replaced with aspirational voice direction: "Write like The Atlantic, Vanity Fair, WSJ Magazine with Maher/Hitchens/Harris enrichments"
- **Voice audit relaxed** — "you" count no longer enforced, paragraph density only flags when >30% exceed 3 sentences

## [12.5.0] - 2026-03-26

### Refactored — Admin Dashboard Code Quality
- **Centralized all config into types.ts** — MODEL_PEN_NAMES, CATEGORY_GRADIENTS, PIPELINE_STAGE_CONFIG, VALID_CATEGORIES. Components import, never redefine
- **Replaced 333+ inline styles with CSS classes** across 4 React components. Remaining: 32 (all truly dynamic — progress widths, per-item colors, conditional states)
- **Fixed stale model labels** — "Grok 3" → "Grok 4", "Flash → Sonnet" → "Sonnet → Gemini 3.1 Pro" for editor, Write stage shows "Human (Opus)"
- **Added ~100 CSS utility classes** to admin.css — layout, typography, toasts, badges, scores, buttons, pipeline/agent/article-specific
- **Deleted duplicated code** — local getAdminToken(), timeAgo(), PEN_NAMES, CATEGORY_COLORS, GRADIENT_PRESETS, interfaces (EditorBrief, QCResult, PipelineLog) all consolidated into types.ts
- **Total line reduction**: 4,054 → 3,756 lines (~7% smaller with more functionality)

## [12.4.0] - 2026-03-26

### Fixed — Research Crash (Critical)
- **`stage-research` crashed with "Cannot read properties of undefined (reading 'topic')"** on every queued article. `chain_dispatch()` only sends `{logId}` but the function expected `topic` in the request body. Now reads topic from `daily_article_log` table when not in the request
- **Queue items stuck at "producing" after pipeline failure.** `produce-topic` sets queue to `in_progress` but nothing reset it on failure. Added reset in `stage-research` (on failure) and defensive cleanup in `status` action housekeeping

### Fixed — Pinger Zero Signals
- **pg_net 5-second default timeout** killed every Gemini Search tick before it could complete. Updated pinger cron to `timeout_milliseconds := 90000`
- **Breaking news bar was unreachably high**: "last 2 hours" → "last 24 hours", "thousands of posts" → "hundreds+", 5 journals → 10 (added JAMA Network Open, Cell, Science, Nature, PNAS). Gemini prompt now includes TikTok trends, influencer claims, mainstream media coverage. Grok prompt includes influencer controversies

### Fixed — Featured Rotation Not Updating Site
- **`rotateFeatured()` only updated the database** — the Astro homepage reads from GitHub JSON files, so rotation had zero effect on what users see. Now updates GitHub JSON files and triggers Vercel rebuild
- **15 stale `featured: true` JSON files** accumulated over time. Cleaned up — only the DB-chosen winner gets `featured: true`
- **12-hour freshness guard** was longer than the 6-hour cron interval, blocking most rotations. Reduced to 5 hours
- Added detailed logging at every rotation decision point

## [12.3.1] - 2026-03-26

### Changed — VS Code & Dev Tooling Optimization
- Added VS Code 1.113 settings: session forking for Claude agents, nested subagents, browser tab management
- Fixed Tailwind intellisense in `.astro` files — added `astro: "html"` to `tailwindCSS.includeLanguages`
- Added `*.astro` file association for proper language detection
- Updated README.md: corrected pipeline architecture (SQL dispatch, 5-min cron, pinger, hybrid model)
- Updated README.md: removed dead `pipeline-orchestrator` reference, fixed model attributions

## [12.3.0] - 2026-03-26

### Fixed — Produce Button Bypasses Daily Cap
- "Produce" button was calling `dispatch_pipeline_stage()` which checks the 5-brief daily cap. Manual topic selection should never be blocked by a cap meant to prevent auto-processing waste
- New `produce-topic` action dispatches research directly via pg_net for a specific queue topic — no cap check
- Chain-dispatch added from stage-research → stage-editor — manually produced topics don't wait 5 min for the cron

### Added — Dashboard UX
- Click-to-expand on queue items — shows scout notes, why now, search demand, research summary, editor score
- `editor_score` and `research_summary` added to QueueItem interface

## [12.2.0] - 2026-03-26

### Changed — Scout & Editor Rewrite for Younger Readers (20-35)
- Scout prompts rewritten: "would a 25-year-old text this to a friend?" filter
- Topics prioritize cultural relevance: Ozempic culture, seed oils, gut health, psychedelics, supplement fraud, protein obsession, wellness influencer debunks
- Coverage gaps reframed for younger readers: cardiology → "your heart at 30", liver → "what alcohol is doing to your liver"
- Three scout lenses updated: Gemini (TikTok/Reddit/Trends), Grok (health Twitter debates), editorial (belief-challenging)
- Editor headline rules: TEXT TEST, ban medical jargon (PCSK9, MASLD), examples of shareable headlines

### Added — Dashboard UX
- **"Clear All Briefs" button** in pipeline status bar — one-click kills all stale editor_approved articles
- **× dismiss button** on every pipeline card — visible without expanding, hover turns red
- **Missing heroImage** added to fasting + HIIT article JSON metadata

### Fixed — Scout Parser & Timeouts
- Scout parser handles bold numbered items, `**Topic**:` labels, varied Gemini output formats
- Scout Gemini timeout increased to 120s (was 75s default — caused "Signal timed out" failures)
- Existing articles list capped at 50 in scout prompt (was 126 — contributed to timeouts)

## [12.1.0] - 2026-03-26

### Fixed — Chain-Dispatch via pg_net (Critical)
- **dispatchStage() was using JS fetch()** — the exact bug from the March 25 postmortem. Edge functions kill background fetches on return. Replaced with SQL function `chain_dispatch()` using `pg_net.http_post()` which persists at the DB level
- **isHumanWritten used before declaration** — ReferenceError would crash on any human article where QC said "revise". Moved declaration before both revise and voice_rewrite checks

### Changed — Hybrid Architecture Optimizations
- **Chain-dispatch**: submit → independence → QC → publish fires as a direct chain via pg_net. No cron waits between stages
- **5-brief daily cap**: dispatch function stops auto-processing queue after 5 briefs/day. Saves ~$2-5/day on unused research+editor API calls
- **5-minute cron** (was 1-minute): 1,440 → 288 SQL calls/day. Cron is now a safety net, not the primary dispatch
- **QC revise on human articles**: force-publishes instead of silently parking at editor_approved (dead end)
- **model_used: "human-opus"**: explicit byline entry instead of coincidental Opus mapping

### Removed — Dead Code Cleanup
- Two-model scout path from stage-research (53 lines, never fires)
- Dead statuses from ACTIVE/IN_PIPELINE: writing, rewriting_voice, researching, topic_selected, voice_rewrite_pending/done, saved
- Unused WRITER_FALLBACK_CHAIN import from stage-research

### Added
- `chain_dispatch(function_name, log_id)` SQL function for pg_net dispatch
- `$0 cost entry` for human write stage in token_usage timeline
- `"human-opus"` entry in MODEL_BYLINES for consistent author attribution

## [12.0.0] - 2026-03-25

### BREAKING — Hybrid Pipeline (Human + AI)
- **Pipeline pauses at `editor_approved`** — articles no longer auto-dispatch to the write stage
- SQL dispatch function `dispatch_pipeline_stage()` skips `editor_approved` status
- User writes articles with Opus via Claude Max subscription ($0/article writing cost)
- New admin actions: `get-brief` (formats editorial brief as Claude prompt), `submit-article` (accepts user's HTML, resumes pipeline at "written")
- Dashboard shows purple-highlighted `editor_approved` cards with "Copy Brief for Claude" + "Submit Article" UI
- Pipeline resumes automatically after submission: independence review → QC → publish

### Changed — Cost Reduction ($0.94 → $0.13/article)
- **Opus removed from voice rewrite chain** — was $0.87/call, now Sonnet primary ($0.17)
- **Gemini 3.1 Pro primary writer** (fallback path) — $0.14 vs Sonnet's $0.18
- **Flash for structured stages** — editor brief, QC, and independence revision now use Gemini 2.5 Flash ($0.003/call vs $0.03-0.08)
- **Research switched to Gemini 2.5 Pro + Google Search grounding** — $0.04/call vs Sonnet web search $0.40+ (120K input token inflation from web page dumps)
- **All scouts switched to Gemini search grounding** — daily scout cost $0.12 vs $1.30
- Writing stage costs $0 with hybrid model (Max subscription)

### Added — Scout Quality Upgrade
- Scout prompts now require **"Why now"** (what happened this week), **search demand** (high/medium/low), and **"Our angle"**
- High search-demand topics get automatic priority boost in queue (lower priority number)
- Three distinct editorial lenses: Gemini (trending/search data), Grok (contrarian/buried data), editorial potential (counter-narratives)
- Sonnet web search eliminated from scouts entirely — all use Gemini + Google Search grounding

### Fixed — Pipeline Hardening (v11.2.0)
- **`parseScore()` helper** — safely parses "8/10", "8", 8 → integer for all `editor_score` writes
- **`stage-publish` "8/10" bug** — was passing raw string to integer column, causing `invalid input syntax` PostgreSQL errors
- **`stage-editor` fallback chain** — was single `claude()` call with no fallback, now uses `generateWithFallback()`
- **`stage-qc` error handler** — was reading consumed request body in catch block, now stores `parsedLogId` before try
- **`stage-voice-rewrite` error handling** — had no DB error logging on failure, now writes failed status
- **DB error checking** — added to `stage-research` and `stage-independence` final status updates
- **Dashboard accuracy** — fixed hardcoded model names, fixed cron schedule (showed "every hour", actually every minute), failed articles now show actual error message

### Removed — Dead Code
- **`daily-article-agent/`** — 3,984-line monolith (replaced in v11.0.0)
- **`pipeline-orchestrator/`** — 192-line edge function (replaced by SQL dispatch in v11.1.0)
- **`pipeline-admin` produce action** — now calls `dispatch_pipeline_stage()` via SQL RPC instead of deleted orchestrator
- Unused `API_TIMEOUT` import from `github.ts`
- Unused `count` destructure from `stage-editor`

## [11.1.0] - 2026-03-25

### Fixed — Pipeline Concurrency & Reliability
- **Atomic CAS (compare-and-swap) on ALL status transitions** — prevents duplicate dispatch when cron and stale detection race. Each stage atomically claims its article via `UPDATE...WHERE status = expected`
- **Stale detection also uses CAS** — won't overwrite a stage that already completed successfully. Previously the orchestrator blindly reset articles even after a stage had already advanced them
- **DB CHECK constraint updated** — added `voice_rewrite_pending`, `rewriting_voice`, `voice_rewrite_done`, `qc_approved` to the `daily_article_log.status` constraint. Status updates were silently rejected by PostgreSQL

### Fixed — Timeout Architecture
- **API_TIMEOUT reduced to 75s** with separate `RESEARCH_TIMEOUT` (120s) for web search — prevents `generateWithFallback` chains from exceeding the ~150s edge function timeout
- **Editor stage uses direct `claude()` call** instead of fallback chain — single model gets the full timeout budget
- **Write and QC limited to 2-model fallback** — 3 models × 75s = 225s > 150s edge timeout
- **Optional `timeout` parameter on all API clients** — stages can override per-call

### Changed — Model Chain
- **Sonnet now primary writer** — spending limit raised, reverted from Gemini 3.1 Pro primary
- **Writer chain**: `["claude-sonnet-4-6", "gemini-3.1-pro-preview", "gpt-5.4"]`
- **OpenAI GPT-5.4**: `max_tokens` → `max_completion_tokens` (API change)

### Fixed — UI & Admin
- **Produce button feedback** — shows actual topic name and dispatched stage instead of generic "Started: produce"
- **Orchestrator fire-and-return** — 5s dispatch timeout prevents orchestrator from blocking on slow stage calls

## [11.0.0] - 2026-03-25

### BREAKING — Pipeline Split (Monolith → Microservices)
- **Monolith `daily-article-agent` (3,984 lines) split into 11 edge functions + shared utilities**
- **`pipeline-orchestrator`**: lightweight dispatcher (~150 lines) called every minute by pg_cron. Checks DB for articles needing work, dispatches the appropriate stage function via HTTP. Does NO AI work itself
- **7 stage functions** (each does ONE job with its own timeout):
  - `stage-research` — web search + structure findings
  - `stage-editor` — editor brief, pick topic, assign archetype/tone
  - `stage-write` — write article from brief
  - `stage-independence` — Grok adversarial review + PubMed check
  - `stage-qc` — QC check (publish/rewrite_voice/revise/kill)
  - `stage-voice-rewrite` — voice-only rewrite by premium models
  - `stage-publish` — GitHub commit + Vercel hook + illustration
- **`pipeline-scout`**: topic discovery (called by 3 daily crons)
- **`pipeline-admin`**: admin actions (status, queue CRUD, retry, kill, rotate featured, backfill costs)
- **`_shared/` utilities**: 10 shared modules (api-clients, constants, db, cors, types, voice-audit, astro, github, pubmed, featured)

### Added — New `qc_approved` Status
- QC stage now sets `qc_approved` when approving for publish (was previously combined in one function)
- Orchestrator maps `qc_approved` → `stage-publish` and `voice_rewrite_done` → `stage-publish`
- PipelineMonitor updated with `qc_approved` status display

### Changed — Cron Schedule
- `article-produce` now calls `pipeline-orchestrator` (not `daily-article-agent`)
- Scout crons now call `pipeline-scout` (not `daily-article-agent`)
- `featured-rotation` now calls `pipeline-admin` (not `daily-article-agent`)

### Changed — Admin Frontend
- All admin API calls updated from `daily-article-agent` to `pipeline-admin`
- PipelineMonitor, AgentsPanel, admin dashboard all point to new endpoints
- QC model label updated from "Gemini 3.1 Pro" to "Gemini 2.5 Pro" (matches backend)

### Fixed — Timeout Architecture
- Each stage function has its OWN ~150s timeout — a slow API call in one stage cannot block other stages
- Orchestrator completes in <5s (just DB queries + one HTTP call)
- No more stale detection hacks needed for timeout recovery
- Articles go from queue to published in ~7 minutes (same as before, but each stage is independent)

## [10.0.0] - 2026-03-25

### BREAKING — Model Upgrade (Flash → Premium)
- **ALL quality stages upgraded from `gemini-2.5-flash` to premium models**. Flash was writing every article — the #1 cause of boring, Wikipedia-like output
- **Writer**: `gemini-3.1-pro-preview` primary, `claude-sonnet-4-6` + `gpt-5.4` fallback
- **QC**: `gemini-2.5-pro` primary (fast enough for edge function timeout)
- **Editor Brief**: `gemini-3.1-pro-preview` primary
- **Voice Rewrite**: `claude-opus-4-6` → `claude-sonnet-4-6` → `gpt-5.4` → `gemini-3.1-pro-preview` → `grok-3`
- **Flash kept ONLY for**: scout discovery, fact-check verification
- **New API integrations**: GPT-5.4 (OpenAI), Gemini 3.1 Pro Preview, Gemini 2.5 Pro, Claude Opus 4.6
- **New model byline**: Eli Vance (GPT-5.4, Health & Science Editor)

### Added — Voice Rewrite Stage (7-Stage Pipeline)
- **New QC decision: `rewrite_voice`** — when content is solid but prose is bland, QC sends to voice rewrite instead of killing or full-rewriting
- **`stageVoiceRewrite()`**: focused voice-only rewrite using premium models (Opus → Sonnet → GPT-5.4 → Gemini Pro → Grok). Keeps all facts, citations, structure. Rewrites for personality, "you" usage, short sentences, editorial positions, Bill Maher moments
- **Before/after voice audit**: mechanical metrics logged for each rewrite (you count, banned phrases, paragraph length)
- **Pipeline now 7 stages**: Research → Editor Brief → Write → Independence Review → QC → Voice Polish → Publish
- **Admin PipelineMonitor updated**: 7-stage display with new model names and Voice Polish stage

### Added — Vercel Deploy Hook
- Pipeline commits via GitHub API now trigger Vercel rebuild via deploy hook
- `VERCEL_DEPLOY_HOOK` secret set in Supabase — POSTs after every publish
- Fixes: articles were committed to GitHub but Vercel never rebuilt

### Added — Illustration Recovery
- Illustration generation moved from pre-QC (parallel) to post-publish (sequential)
- Checks DB for existing `hero_image` before generating — avoids duplicate generation on retry
- If illustration fails, article still publishes with gradient fallback

### Fixed — Self-Chaining Was Dead
- **`chainNextStage()` (fire-and-forget HTTP) removed** — Deno runtime killed fetches before they completed. Stages were only advancing via the 15-min cron, not self-chaining
- **Replaced with synchronous stage loop** in produce handler — runs 1 stage per invocation
- **Cron changed from `*/15` to `* * * * *`** (every minute) — drives stage progression. Each article publishes in ~7 minutes

### Fixed — Stale Run Recovery
- **Stale cleanup now runs BEFORE concurrency guard** — previously a timed-out stage blocked all future produce calls because the guard saw it as "active" and the stale cleanup never ran
- **Stale threshold reduced**: 5 min → 2 min for faster self-healing
- **Voice rewrite states added** to stale recovery: `voice_rewrite_pending` and `voice_rewrite_done`

### Fixed — Multiple Pipeline Bugs
- **Grok removed from ALL writer/editor fallback chains** — was writing 67% of articles despite being designated "independence review only"
- **`webSearch: false` on all non-research stages** — Gemini's Google Search was corrupting JSON output during write/QC/editor stages
- **Scout category classifier**: keyword-based (90+ health terms → 9 categories) replaces broken literal-match parser. 25 existing queue topics backfilled
- **GitHub commit 422 retry**: 3-attempt loop handles both `create commit: 422` and `update ref: 422` race conditions
- **HTML `<` sanitization**: `assembleAstroFile` escapes stray `<` not followed by tag characters. Fixes Astro build break from `(<0.25 nmol/L)` in article content
- **API timeout reduced**: 135s → 75s constant (`API_TIMEOUT`) — leaves margin within ~150s edge function timeout
- **Spending limit detection expanded**: catches 429, "spending", and "quota" in error text

### Known Issues — CRITICAL for Next Session
- **Monolith architecture**: entire 7-stage pipeline is ONE edge function (~4000 lines). Each stage risks timeout. MUST be split into separate edge functions (see NEXT-SESSION-PLAN.md)
- **Gemini 3.1 Pro Preview is slow** ("thinking" model) — may still timeout on complex articles. Gemini 2.5 Pro used for QC as workaround
- **Sonnet spending-limited until April 1** — revert writer chain to Sonnet-primary after limit resets

## [9.10.0] - 2026-03-25

### Fixed — Pipeline Silent Failures & Data Integrity
- **CRITICAL: QC truncation → silent publish**: if `parseClaudeJSON` repaired truncated QC JSON, `decision` field was missing → code fell through kill/revise checks → article auto-published. Now defaults to "revise" when decision is missing/unrecognized (default-deny)
- **CRITICAL: Editor brief truncation**: `maxTokens` bumped 2500 → 4000. Added validation for slug, headline, description, and tonePreset after parsing — logs warnings when fields are missing/corrupt from truncation
- **CRITICAL: Description truncation at publish**: hard gate before committing to GitHub validates description ends with punctuation and is ≥ 80 chars. Tries 3 fallback sources; synthesizes from article opening if all are corrupt. No truncated description can reach production
- **Writer maxTokens**: bumped 8192 → 16384. 8K was causing token-limit truncation on longer articles, which `parseClaudeJSON` Step 3 silently "repaired" into valid JSON with corrupt fields
- **Grok null score bypass**: `reviewResult.score ?? 10` meant missing scores defaulted to 10 (perfect), skipping all rewrites. Now defaults to 5 (triggers rewrite review)
- **Queue topic lost on editor kill**: topics were unconditionally marked "completed" after editor stage, even when editor killed the article. Topic was permanently lost. Now re-queued when editor kills
- **Grok flags field name mismatch**: QC display read `f.suggestion` but independence prompt outputs `f.rewrite`. QC editor never saw Grok's actual rewrite suggestions. Fixed to read `f.rewrite` with `f.suggestion` fallback
- **Gemini web search on QC/revision stages**: disabled Google Search tool for QC, fact-check, and independence-revision stages — they analyze article text, not the web. Reduces wasted tokens and prevents search interference with JSON output
- **Silent catch blocks**: independence revision failure and illustration retrieval failure now log warnings instead of swallowing errors silently
- **Grok error messages**: now include response body (was just status code)
- **parseClaudeJSON truncation logging**: Step 3 repair now logs `⚠️ TRUNCATED OUTPUT` with counts of unclosed braces/brackets

### Fixed — Article Data Quality
- **7 truncated descriptions fixed**: thyroid-levels-metabolic-engine, 49ers-injuries-emf-substation-theory, birth-control-eugenic-history, calcium-phosphorus-ratio-diet-health, non-opioid-painkillers-ngf-sodium-blockers, pancreatic-cancer-new-treatments-mrna-kras, resuscitation-long-term-outcomes-babies — all rewritten from article content
- **8 .astro description mismatches synced**: boredom-is-a-superpower, certainty-dealers-wellness-industry, examined-life-overrated, human-proclivity-religion-psychology, kids-who-learned-not-to-need, least-curious-question-why, ninos-que-aprendieron-no-necesitar, your-doctor-cant-answer-that
- **Invalid category fixed**: nicotine-research.json changed from "Research Summary" (invalid) to "Pharmacology"

## [9.9.0] - 2026-03-25

### Fixed — Editorial Voice Quality Enforcement
- **Mechanical voice scanner**: new `auditVoiceQuality()` function runs code (not AI) on every article before QC. Scans for 30+ banned phrases, counts "you" usage, measures paragraph length, checks short-sentence ratio, counts rhetorical questions. Feeds hard metrics into QC prompt so the editor has objective data
- **QC prompt upgraded to gate on voice**: Senior Editor QC now checks voice quality, not just headlines. Auto-revise triggers: banned phrases found, "you" count below 4, paragraphs over 3 sentences, zero editorial opinions. Auto-kill: 3+ banned phrases AND zero opinion. Previously QC was told "don't re-litigate the content" — it now explicitly must
- **Writer self-audit required**: output JSON now requires a `selfAudit` field where the writer reports its own banned phrase check, "you" count, analogies, editorial positions, follow-the-money angle, and Bill Maher moment. If the writer can't fill these fields, the article fails before it leaves the write stage
- **Follow-the-money directive**: every article assignment now explicitly asks "who profits from the status quo on this topic?" — not buried in system prompt, but in the per-article user prompt where recency bias helps
- **Editorial opinion minimum raised**: articles must now take at least 2 clear positions (up from 1). "you" count minimum raised to 6 (up from 4). Both are mechanically verified
- **Pre-flight checklist hardened**: "Think of your/it as" added to banned phrases. Description completeness check added. Bill Maher test, follow-the-money, and editorial positions are now mandatory self-audit fields, not mental checks

## [9.8.0] - 2026-03-25

### Fixed — Hero Images Now Display in Articles
- **Articles now show AI-generated illustrations**: `ArticleLayout.astro` displays `heroImage` from article metadata as full-width hero art. Previously, the layout used a `<slot name="feature-image">` that expected inline SVGs — the generated illustrations (from `generate-illustration`) were only used for OG tags and card thumbnails. Now the illustration pipeline works end-to-end: generate → store in Supabase Storage → display in article
- **Removed all inline SVG placeholders**: stripped the generic gradient+circle SVG blocks from all 103 article `.astro` files. These were meaningless filler — two circles on a dark gradient, identical across every article
- **Pipeline no longer generates SVGs**: `generateMinimalSvg()` removed from `daily-article-agent`. `assembleAstroFile()` no longer includes SVG slot. New articles are leaner
- **Admin publish flow cleaned up**: edit page and ArticleEditor no longer inject `article_svg` into generated `.astro` files or database saves
- **ArticleCard.astro updated**: now accepts `heroImage`/`heroImageAlt` props and displays the actual illustration instead of Tailwind gradient classes
- **Gradient fallback preserved**: articles without `heroImage` (if any) get a category-based CSS gradient instead of a broken empty area

## [9.7.0] - 2026-03-25

### Fixed — Admin CSS, Layouts, Writer Prompts
- **Admin CSS was never loading in production**: Astro's frontmatter `import './admin.css'` was silently dropped for SSR pages. The entire admin portal was unstyled raw HTML on Vercel. Fixed by placing `admin.css` in `public/` and linking via `<link rel="stylesheet" href="/admin.css">` in each admin page's `<head>`
- **Multi-column layouts**: Pipeline tab now shows Topic Queue alongside Recently Published/Kills/Errors in a 2-column grid. AI Agents tab splits 6 sections into 2 columns. Both collapse to single-column below 1100px. Articles tab stays single-column (rows need full width for inline editing and metadata)
- **Stats grid**: changed from cramped 8-column single row to 4-column grid (2 rows of 4)
- **Pre-flight checklist added to writer prompt**: 10-item self-verification at the END of the prompt (recency bias) — checks opening, banned phrases, paragraph length, short sentences, "you" count, analogies, editorial opinion, rhetorical questions, section count, and the Bill Maher test
- **Hardcoded examples removed from all prompts**: 6 voice examples, 7 headline examples, short-sentence/parenthetical/analogy examples all replaced with structural descriptions and "invent your own" directives. Models were copying them verbatim
- **Fallback chain fixed**: was Sonnet → Grok → Gemini, now Sonnet → Gemini → Grok everywhere (Gemini is better than Grok at following structure)
- **Expanded banned phrases**: "Picture this", "Imagine", "What if" as openers, "Let's explore/dive in", "hidden in plain sight", "marvel of biology", "Remarkably", rhetorical question paragraph endings
- **ArticlesManager init order**: `apiCall` moved above `improveArticle` to fix `ReferenceError: Cannot access before initialization`

## [9.6.0] - 2026-03-25

### Fixed — Writer Quality & Pipeline Reliability
- **Sonnet is now always-primary writer**: Gemini removed from hourly rotation — it writes dead, wiki-style prose that ignores editorial voice instructions. Gemini/Grok are fallback only (spending limit or rate limit)
- **Brand voice formula added to ALL editorial prompts**: the 60/20/15/15 formula (journalism/Maher/Hitchens/Harris) was missing from the autonomous writer prompt, Senior Editor brief, and independence review. Now in: `daily-article-agent` writer + editor + Grok review, `refine-article`, `process-article`, `editorial-qc`
- **Anti-wiki rules added to writer prompt**: concrete measurable rules — max 3 sentences per paragraph, at least 1 sub-8-word sentence per 3 paragraphs, 4+ uses of "you", 2+ everyday analogies, 1+ parenthetical aside, ban on consecutive "The [noun]..." openings, 90% of rhetorical questions cut
- **Pipeline hardened against stuck articles**: produce cron changed from hourly to every 15 minutes (safety net for dropped self-chains). `chainNextStage()` now retries once after 10s on failure. Concurrency guard widened from 2 to 5 minutes (write stages can take 2-3 min)
- **Grok independence review flags voice failures**: AI voice tell #9 now checks for 80+ word paragraphs, missing "you", zero analogies, Wikipedia tone — using the brand voice formula as the standard

## [9.5.0] - 2026-03-24

### Changed — Theme System & Pipeline Rebalancing
- **Three-state theme toggle**: system (default) → light → dark → system. "System" follows `prefers-color-scheme` and listens for live OS changes. Monitor/sun/moon icons in Header, SideNav, and Command Palette. Old localStorage values (`light`/`dark`) preserved; no key = system
- **Autonomous pipeline rebalanced for coverage gaps**: scout prompts now include explicit subject-level gap guidance listing 12 uncovered subjects (cardiology, diabetes, immunology, kidney, liver, respiratory, musculoskeletal, addiction, prostate, pain, dermatology, pediatrics). At least 8 of 20 scouted topics must come from gaps. Each scout model system prompt reinforced. Editor brief gets +2 score bonus for gap-filling topics and hard constraint against approving more Neuroscience/Clinical Evidence unless scoring 8+ with no underserved alternatives. Category balance thresholds tightened from 5%/15% to 8%/12%. Scout priority threshold raised to 10%
- **First gap-filling article published**: "Non-Opioid Painkillers: NGF Inhibitors and Sodium Channel Blockers" (pain science + pharmacology)

## [9.4.0] - 2026-03-24

### Changed — Admin Portal Complete Redesign
- **admin.css rewritten from scratch** — CSS custom properties design system (`--admin-bg`, `--admin-surface`, `--admin-border`, `--admin-accent`, etc.) replacing all hardcoded hex values. Darker, richer background (`#0f0e0c`), rgba-based borders at varying opacities, layered shadow system, 12px/8px/6px border-radius scale
- **Glass morphism throughout** — header uses `backdrop-filter: blur(20px)`, login card uses `blur(24px)`, modals use `blur(8px)` backdrop. Subtle gradient overlays on stat cards and pipeline stages
- **Ambient background** — radial gradient glow (red/purple) behind the dashboard body, subtle grid pattern on login page
- **Login page redesigned** — animated drifting glow orbs, glass card with entrance animation, "mission control" pill badge, footer tagline, error slide-in animation
- **Refined animations** — `cubic-bezier(0.22, 1, 0.36, 1)` ease throughout, tab panel fade-in, modal scale+translate entry, button lift effect (`translateY(-1px)` + shadow on hover), pipeline card pulse glow
- **Pipeline stages** — hover reveals top-edge gradient line, active cards have green glow animation, stage count badges glow red when items present
- **Status badges** — all use semitransparent `rgba()` backgrounds instead of opaque dark blocks (published, draft, killed, failed, etc.)
- **200+ inline style updates** across PipelineMonitor, ArticlesManager, and AgentsPanel — all hardcoded hex colors replaced with the new warmer, higher-contrast palette
- **Feedback banners** — redesigned with semitransparent backgrounds, rounded 10px corners, inline dismiss buttons
- **Better focus states** — red ring glow (`box-shadow: 0 0 0 3px rgba(239,68,68,0.15)`) on all focused inputs
- **Dashboard widened** — max-width 1400px (was 1200px) for better screen utilization
- **Consistent branding** — "mission control" pill badge on all admin pages (login, dashboard, new article)

## [9.3.0] - 2026-03-24

### Added — Opus Editorial Series & First Localization
- **"Meaning & Mind" series** — 5-part Opus series published:
  1. The Least Curious Question (22 min) — why vs how
  2. The Certainty Dealers (20 min) — the $5.6T meaning industry
  3. The Examined Life Is Overrated (20 min) — Socrates got the floor, not the ceiling
  4. Your Doctor Can't Answer That Either (24 min) — the clinical encounter mismatch
  5. Boredom Is a Superpower (18 min) — the pause we engineered away
- **"The Kids Who Learned Not to Need"** (38 min) — three-part series on abandonment trauma, five siblings, earned secure attachment. 12 peer-reviewed sources
- **First Spanish article**: "Los Niños Que Aprendieron a No Necesitar" — proof of concept for site localization
- **"The Platonic Problem"** (14 min), **"Why Humans Keep Inventing Gods"** (18 min), **"The Free Will Debate Is Ridiculous"** (6 + 16 min) — standalone Opus articles
- All articles include AI-generated editorial illustrations

## [9.2.0] - 2026-03-24

### Added — Opus Editorial Content & Writer Rotation
- **3 new Opus articles published**: "The Platonic Problem" (14 min), "The Free Will Debate Is Ridiculous" (6 min + 16 min extended), "Why Humans Keep Inventing Gods" (18 min)
- **Voice reference in writer prompt**: concrete GOOD vs BAD examples from Opus Plato article as gold standard. Covers irreverent metaphors, short sentences for impact, everyday analogies, parenthetical asides, opinion-taking, anti-padding rules
- **refine-article fallback**: Claude → Grok → Gemini (was Claude Opus only, no fallback)
- **Sources section `id="sources"`**: CSS can now target it for footnote-sized styling

### Changed
- **Grok removed from writer rotation**: only Sonnet and Gemini write articles now. Grok stays on independence review and scouting. Evidence: Grok free will article scored 2-3/10 vs Opus at 10/10 on voice and personality
- **Writer rotation simplified**: even hours = Sonnet (primary), odd hours = Gemini (primary). Grok is last-resort fallback only
- **Deleted Grok and Gemini free will articles**: replaced by Opus versions

## [9.1.0] - 2026-03-24

### Added — Reader Questions, Fact-Check Pipeline, Creation History
- **Reader Questions**: new section in AI Agents tab mines alumi Health AI assistant chat data. Finds health questions asked by 2+ different users, shows with popularity count and "+ Queue" button. Source: `reader_request`, priority P5
- **Fact-check pipeline step**: PubMed verification results (previously stored but ignored) now trigger article revision when 2+ studies or >50% of citations fail verification. Unverified citations get "(citation unverified)" tags
- **Mandatory Sources section**: every article must end with a Sources list citing author, journal, year, and key finding used
- **Full creation history**: click any published article to see complete pipeline reasoning — research findings, editor brief (score/archetype/angle/tone/dogma warnings), writer model + pen name, Grok independence review (verdict/score/flags/rewrites), PubMed verification (verified vs NOT FOUND), QC decision, cost breakdown per stage
- **Sources section styling**: footnote-sized text (0.8125rem) with top border separator, not body text size

### Changed — Editorial Quality (continued)
- **Zero fabrication rule**: writer prompt restricted to research data only — "use ONLY studies from RESEARCH DATA below." Banned patterns: "studies show" without naming, precise stats without source, unnamed trials
- **Independence review overhauled**: HTML stripped before sending to Grok (was parsing raw tags), category-specific review focus (Pharmacology: "who funded trials?", Nutrition: "food industry influence?"), anti-template instruction ("do NOT write 'consider adding a section'"), temperature raised 0.4→0.6, tokens 2500→3000
- **QC uses Gemini not Grok**: different model from independence reviewer prevents rubber-stamping. Prompt rewritten for headline/description polish only
- **All score examples removed**: every JSON template uses text instructions instead of numbers. Models were copying hardcoded examples verbatim
- **Opening variety enforced**: "34% of articles open with narrative vignettes — ONLY for storyteller preset." Writer must vary: statistic, claim, question, mechanism, contradiction
- **Status API expanded**: returns 30 recent + 15 published logs (deduplicated). Published articles no longer lost when failures flood the window

### Fixed
- React.Fragment crash (missing import in PipelineMonitor cost breakdown grid)
- Sources section rendering at body text size instead of footnote size

## [9.0.0] - 2026-03-24

### Added — Admin Dashboard Overhaul & Pipeline Hardening
- **Admin dashboard overhaul**: 8 compact stat cards, 3-tab layout (Pipeline, Articles, AI Agents)
- **Manual scout triggers**: individual Gemini / Sonnet / Grok buttons + "All 3" from Pipeline tab
- **Manual produce trigger**: "Produce Now" with full API response feedback (success/skipped/error)
- **Topic queue controls**: every queued item has Produce, Expedite, Priority ↑↓, Delete buttons
- **Stuck queue recovery**: IN_PROGRESS items get Reset + Delete controls
- **Article Improve button**: purple button on every article in Articles tab — sends through AI review + auto-fix in place
- **Backfill Costs button**: estimate spend for articles published before cost tracking (AI Agents tab)
- **Rotate Featured button**: manual featured rotation trigger (AI Agents tab)
- **Cron Schedule section**: shows all 5 cron jobs with schedules, models, and status (AI Agents tab)
- **Independence & editor scores** displayed on article rows and edit page
- **Model pen names** on published articles in pipeline view (Max Quilici, Linda Carnes, Christine Wright)
- **Sort by independence score** option in Articles tab
- **Refresh button** in Articles tab to re-fetch from DB
- **Login error handling**: wrong token shows inline error, middleware redirects to `/admin/login?error=1`
- **Edit page autosave**: 2-second debounce with "Autosaving..." / "Saved" indicator
- **Edit page Cmd+S / Ctrl+S** keyboard shortcut
- **Edit page score badges**: independence and editor scores in header
- **Edit page Delete from GitHub** button
- **XSS fix**: all innerHTML replaced with createElement/textContent in edit page chat

### Changed — Pipeline Intelligence
- **Fallback chain on ALL stages**: Research, Scout structuring, Sonnet scout, QC — all now fall back through Sonnet → Grok → Gemini (previously only Editor Brief and Write had fallback)
- **Smart duplicate detection**: mechanical word-overlap check raised to 55%/5 words (near-exact only). Single queued topics always pass to the AI editor for intelligent judgment instead of being mechanically killed
- **Grok scout markdown stripping**: `**Topic Description**:` prefix stripped before dedup and queue insertion
- **Gemini research JSON**: explicit JSON schema in prompt when Gemini is research fallback, plus plain-text extraction safety net
- **Gemini auto-retry**: retries once if first response is empty (Google Search grounding sometimes returns empty)
- **Duplicate threshold relaxed**: 55% overlap + 5 matching words (was 30%/2 — too aggressive at 94 articles)

### Changed — Editorial Quality
- **Editorial independence directive**: writer and editor prompts now explicitly say "you are a journalist, not a PR department" — if assigned a critical investigation, investigate it, don't flip to defense
- **Queue source tracking**: manually queued topics (`source: manual`) get "MANDATORY EDITORIAL DIRECTION" telling editor to preserve the original angle. Scout topics (`source: trending`) get normal editorial freedom
- **Grok independence review rewritten**: adversarial prompt, must quote exact article text, must provide concrete replacement sentences, adds AI voice detection. Scores use text instructions instead of example numbers
- **Grok review now triggers rewrites**: fires for `major_issues` OR `minor_issues with score < 7` (previously only `major_issues` — which never happened with the old soft prompt)
- **QC uses Gemini, not Grok**: QC stage now uses Gemini → Sonnet (not Grok). Independence review uses Grok — different models for review vs QC prevents same-model rubber-stamping
- **QC prompt rewritten**: focused on headline/description polish only, not re-reviewing content
- **All score examples removed from prompts**: every `"score"`, `"qualityScore"`, `"topicScore"` in JSON templates replaced with text instructions ("integer 1-10, see scoring rules"). Models were copying hardcoded example numbers verbatim
- **Article endings enforced**: writer prompt requires proper conclusion — "cut a middle section shorter rather than omitting the ending"
- **Pipeline stage labels**: reflect actual multi-model system (Research: Gemini + Sonnet, Write: rotates hourly, QC: Gemini + GPT Image)
- **Write stage shows current primary model**: based on UTC hour, matching backend `pickWriterModel()` logic
- **Status API returns published + recent**: fetches 30 recent logs + 15 published separately, deduplicates. Published articles no longer pushed out by failures

### Fixed
- Pipeline 503 BOOT_ERROR from duplicate `grokScore` variable declaration
- Template literal syntax error in editor prompt (broke function deployment)
- Scout topics with Grok markdown formatting passing dedup filter
- Empty Gemini responses crashing research stage (now retries once)
- Queue form silently swallowing errors (now shows success/failure feedback)
- Manual topics defaulting to P50 (now P10 — appear near top of queue)
- Published articles disappearing from "Recently Published" when failures flooded the 20-entry log window
- CSS duplicate class definitions (.agents-btn, .agents-decision-card, .agents-grade, .agents-issue) causing cascade conflicts

## [8.6.0] - 2026-03-23

### Added — Model Pen Names & Cron Activation
- **Model bylines**: Max Quilici (Sonnet), Carl Lundin (Opus), Linda Carnes (Grok), Christine Wright (Gemini). Automatically set in article metadata based on which model wrote the article
- **All crons activated**: scout-gemini (6am), scout-sonnet (2pm), scout-grok (10pm), article-produce (hourly), featured-rotation (6h)
- **Multi-model scout migration applied** to Supabase

## [8.5.0] - 2026-03-23

### Added — Multi-Model Writer Rotation
- **`generateWithFallback()`** — universal dispatch that routes to Anthropic, xAI, or Google with automatic fallback. If one provider hits spending limits, rate limits, or errors, it tries the next. Same prompts, same editorial rules for all models
- **Writer rotation** — cycles primary model by hour (Sonnet → Grok → Gemini). Ensures variety in article voice and no single provider dependency
- **`WRITER_FALLBACK_CHAIN`** — ordered fallback: Sonnet → Grok → Gemini Flash. Applied to editor brief, write, and independence revision stages
- **Model tracking** — `model_used` in daily_article_log records which model actually wrote each article for quality comparison

## [8.4.0] - 2026-03-23

### Changed — Multi-Model Scout Architecture (92% cost reduction)
- **3 daily scouts replace 96** — Gemini (6am UTC, Google Search), Sonnet (2pm, web search), Grok (10pm, contrarian perspective). Each finds 20 topics. ~$0.14/day total vs ~$9.55/day before
- **No Sonnet structuring step** — raw findings parsed directly, no expensive intermediate API call. Editor brief stage handles scoring during production
- **Per-scout dedup** — each topic checked against all articles + queue before insertion. Within-batch dedup prevents same-scout duplicates
- **Produce cron: hourly** — editor picks best topic from queue every hour. Self-chaining handles multi-stage production. Up to 24 articles/day
- **Monthly cost**: ~$25/month at 2 articles/day (was ~$300/month)
- **Migration**: new pg_cron jobs (scout-gemini, scout-sonnet, scout-grok, article-produce). Old high-frequency crons removed

## [8.3.0] - 2026-03-23

### Fixed — Full Collection Audit (all 78 articles read in full)

**Critical content fixes:**
- `nitric-oxide-paradox-aging-vasodilator`: Complete editorial overhaul — removed Ray Peat citation, reframed CO2 from "true primary vasodilator" to "underappreciated contributor", added eNOS/iNOS distinction throughout, removed sildenafil/minoxidil aging claims (no clinical evidence), replaced tetracycline anti-aging recommendation with proper caveats, fixed self-contradicting pull-quote, added Cochrane antioxidant data
- `chronic-inflammation`: omega-6 seed oils caveated, omega-6/3 ratio replaced with HOMA-IR
- `fermented-foods`: moderate wine claim corrected with sick-quitter confound + Mendelian randomization

**Moderate content fixes:**
- `gut-microbiome-brain`: Added BBB caveat to gut serotonin claim (doesn't cross into brain), softened "50% of dopamine precursors" to "substantial proportion"
- `deja-vu-neuroscience-memory-system`: Dopamine relabeled from "excitatory neurotransmitter" to "neuromodulator"
- `brain-overheating-yawn-thermoregulation`: Removed "without a single contradicting result" overclaim
- `hardware-of-awe-musical-frisson-neuroscience`: Replaced "genuinely addicted in the technical neurochemical sense" with accurate reward circuit framing
- `depression-energy-problem`: Exercise "more effective than antidepressants" changed to "comparable to"
- `the-serotonin-deception`: Added Cipriani 2018 counterpoint (116K participants) to the active-placebo overclaim
- `neuroscience-of-itch-social-contagion`: Mirror neuron mechanism changed from stated fact to unconfirmed hypothesis

**Broken tags fixed (9 articles):**
- adhd-wakefulness-sleep-neural-activity, engineered-bacteria-cancer-therapy-probiotics, fusobacterium-nucleatum-gum-disease-breast-cancer-mechanism, non-hormonal-menopause-fezolinetant-elinzanetant-nk3, glp1-discontinuation-rebound-real-world-vs-trials, paternal-preconception-health-pregnancy-outcomes, early-life-stress-gut-brain-pathways, chlorpyrifos-parkinsons-risk-autophagy-mechanism, prediabetes-reversal-without-weight-loss

**Truncation fixes:**
- `engineered-bacteria-cancer-therapy-probiotics`: Completed truncated disclaimer
- `chlorpyrifos-parkinsons-risk-autophagy-mechanism`: Completed truncated article ending + added missing disclaimer

## [8.2.0] - 2026-03-23

### Added — Epistemic Integrity Framework
- **Evidence hierarchy** in research prompt — recent meta-analyses > individual studies, large cohorts > small trials, 2023-2026 > older, industry-funded must be flagged
- **Known dogma traps list** — omega-3/6 ratio, saturated fat absolutism, BMI reliability, breakfast industry claims, moderate alcohol, generic probiotics, multivitamins, "natural = better", antioxidant supplements, low-fat dogma, detox products, blanket sunscreen absolutism
- **Writer epistemic integrity rules** — "your training data is not the truth", flag own uncertainty, cite most recent evidence, name the funder, never use "studies show" without specifics, "more research needed" is not a conclusion
- **Contrarian checkpoint** — cross-reference metabolism/thyroid/fat/inflammation articles against independent thinkers (Ray Peat, Chris Masterjohn, Weston Price) as a bullshit detector for institutional groupthink — not as authorities, but as early signal
- **Follow the money** — name the funder when they have financial interest in the outcome
- **Editor dogma warnings** — `dogmaWarnings` field in editor brief flags specific claims the writer must verify before repeating. Wired into writer prompt
- **Grok independence review expanded** — 3 new flag types: `outdated_dogma`, `stale_evidence`, `unfunded_claim`
- **Directed research prompt updated** — prioritize 2023-2026 evidence, note funding sources

## [8.1.0] - 2026-03-23

### Fixed
- **Featured rotation uses `updated_at`** — was using `published_at` (when article was published, not when it became featured), causing stale featured articles. Now tracks when the article was actually set as featured
- **Standalone `rotate-featured` action** — works independently of pipeline, even when production crons are paused
- **Independent `pg_cron` job** — `featured-rotation` fires every 6 hours, separate from article scout/produce crons
- **Stronger duplicate detection** — `isDuplicate()` now includes candidate's category, keyFindings, and mechanism in fingerprint. Previously only compared topic + headline words, which missed same-subject-different-angle duplicates (e.g., two oral microbiome articles)
- **Removed duplicate article** — archived `oral-microbiome-systemic-disease` (broad overview), kept `oral-microbiome-alzheimers-cardiovascular-systemic-disease` (specific angle, better headline)

## [8.0.0] - 2026-03-23

### Added — Pipeline Intelligence Overhaul
- **10 tone presets** — straight-science, smart-casual, dry-analytical, storyteller, debunker, wire-dispatch, pointed, measured-authority, curious, understated. All share the same core voice — subtle variation like the same journalist on different days. Editor picks per article.
- **Anti-AI rules** baked into writer prompt — bans manufactured wonder, false intimacy, empty transitions, hedging stacks. Enforces dramatic sentence length variation.
- **PubMed citation verification** — after write stage, verifies up to 5 cited studies against PubMed E-utilities API. Results stored in pipeline log. Non-blocking.
- **Grok rewrite wiring** — when Grok independence review flags `major_issues`, Claude now applies the specific rewrite suggestions before QC. Independence review is no longer decorative.
- **Hard category balance rule** — underserved categories (<5% of collection) get priority over overserved (>15%) unless quality score difference >3 points. Fixes 53% neuroscience/clinical skew.
- **Deterministic category gradients** — each category maps to a fixed gradient (Neuroscience=violet, Mental Health=sky, Nutrition=emerald, etc.). No more AI choosing gradients. Fixes 29% rose-red visual monotony.
- **Programmatic SVG generation** — minimal category-colored SVG generated in code, not by AI. Zero tokens wasted on unused hero SVGs.

### Changed — Pipeline Improvements
- **QC switched from Sonnet to Grok** — different model family reviewing Sonnet's work prevents same-model self-review blindness
- **Full articles sent to Grok + QC** — removed `.slice(0, 4000)` and `.slice(0, 3000)` truncation. Both review stages now see the complete article including conclusions
- **Illustration parallelized with QC** — fires illustration generation before QC call, awaits after. Saves 30-60s per article
- **Featured rotation early exit** — checks if current featured is <12h old with one lightweight query before doing full scoring
- **Scout payload optimized** — sends all article titles to Gemini (removed 30-article cap)
- **process-article switched from Opus to Sonnet** — ~$0.68 savings per manual article
- **refine-article metadata routing** — "change the headline" no longer sends full article HTML. Saves ~70% input tokens on metadata-only edits

### Changed — Editorial Quality
- **31 headlines rewritten** — reduced "Your Brain" pattern from 6→0, "Just [verb]" from 6→1, "Medicine/Science [ignores]" conspiracy framing eliminated, 8 headlines over 100 chars shortened
- **67 article gradients updated** — all existing articles now use category-consistent gradients
- **SVG removed from all AI prompts** — process-article, refine-article, and daily-article-agent writer prompt no longer request SVG generation
- **Gradient removed from AI prompts** — writer no longer picks gradient colors (deterministic from category)
- **Shorter paragraphs** enforced — "2-3 sentences ideal, 4 max" added to core editorial standards

## [7.0.0] - 2026-03-23

### Added — Cost Tracking
- **Per-call API cost tracking** — every Claude, Grok, and Gemini call logs input/output tokens and calculates USD cost using model-specific pricing
- **`cost_usd` + `token_usage` columns** on `daily_article_log` — cumulative cost per article, per-call breakdown (model, stage, tokens, cost)
- **Dashboard cost stats** — Total AI Spend and Avg Cost/Article stat cards on admin dashboard. Per-article cost in pipeline cards and completed articles list. Running total with color-coded thresholds ($20/$50)
- **`backfill-costs` action** — estimates costs for all pre-tracking articles based on pipeline stage completion. Backfilled 98 log entries (~$20.58 estimated total)
- **Spending limit detection** — Claude API 400 errors with "usage limits" now surface as `SPENDING_LIMIT:` prefix instead of raw error text

### Added — Article Variety System
- **7 article archetypes** — deep-investigation, explainer, provocation, case-study, profile, roundup, myth-autopsy. Each has distinct word count range, structural rules, and pull-quote/info-card guidance
- **Voice modulation** — register (clinical/conversational/provocative), density (data-heavy/narrative-driven/balanced), pacing (slow-build/rapid-fire/crescendo). Set per article by editor brief
- **Banned AI patterns** — explicit list of overused phrases ("The honest answer is...", "What is not in dispute...", "In short...") and structural patterns (every article opening with myth inversion, every closing with paradox, uniform citation formula)
- **Tone matching by subject type** — institutional failures get pointed language, mechanism discoveries get intellectual curiosity, practical health gets directness without drama. Not everything is an exposé
- **Headline variety rules** — banned "The [X] That..." (40% of headlines), "Your [Body] Is [Claim]" (7+), "Nobody/Science [dramatic verb]" framing. Good models: direct claims, questions, mechanism-forward, understated
- **QC headline rewriting** — QC stage actively rewrites headlines starting with "The" or using conspiracy framing
- **Series candidate flagging** — editor brief can flag topics with natural multi-part potential
- **Writing temperature 0.4 → 0.5** for more natural variation

### Fixed — Duplicate Detection
- **Bidirectional overlap check** — old filter only checked candidate→existing (40% threshold). Now checks both directions and takes the max (30% threshold)
- **Stop-word filtering** — common health/science terms ("brain", "health", "study", "evidence", etc.) no longer inflate word counts and mask real overlap
- **Broader fingerprinting** — old filter only used title + slug + keywords. Now includes tags + description for much richer subject matching
- **Archived 5 duplicate articles** — cannabis-mental-health, adhd-sleep-brain, glp1-addiction-craving-mechanism, gut-microbiome-circadian-clock-sleep, pfas-forever-chemicals-adolescent-bone-density
- **Fixed corrupted metadata** on 8 articles — sentence fragments in tags/keywords replaced with proper short terms

### Changed
- **Crons paused** — Anthropic API spending limit reached (resets 2026-04-01). Both `article-scout` and `article-produce` unscheduled
- **Admin dashboard layout** — 8 stat cards in 2 rows of 4 (was 6 in 1 row)
- **Article count** — 66 published (was 71, removed 5 duplicates)

## [6.1.0] - 2026-03-23

### Fixed (critical — post-6.0 stabilization)
- **Massive duplicate cleanup** — deleted 14 duplicate articles across fusobacterium (4), GLP-1/Ozempic (3), PFAS (3), chlorpyrifos (2), Y-chromosome (1), cholesterol (1). Archived matching DB records
- **Hard programmatic duplicate filter** — `isDuplicate()` checks >40% word overlap with ALL existing articles + queue before ANY candidate reaches the editor. Not AI judgment — code
- **Writer restored to JSON output** — the raw HTML experiment broke tags, categories, and metadata. Reverted to original JSON format (html + metadata + svg + toc). Sonnet 4.6 handles it within timeout
- **Tags were sentence fragments** — "A national Swedish", "Semaglutide was associated" — now proper tags from Sonnet's JSON
- **`researchData is not defined`** — blocked ALL publishes. The `replacesSlug` feature referenced a variable that didn't exist in `stageQCAndPublish`
- **`safeStage` rollback loops** — failed writes rolled back to `editor_approved`, causing infinite write→timeout→rollback→write. Now fails hard, no rollback
- **Category leaked editor reasoning** — editor's rationale stored as category string. Now sanitized against 9-value whitelist
- **Scout and produce blocking each other** — global active guard blocked scout when produce was running. Now independent
- **Gemini findings not parseable** — Gemini returns grounded text, not JSON. Two-model scout: Gemini discovers, Sonnet structures

### Added
- **Two-model scout** — Gemini 2.5 Flash (Google Search) discovers 10 topics across recent + landmark timeframes. Sonnet 4.6 structures the best 5 into candidates
- **Full off-limits list** — Gemini now sees ALL article titles + queue topics (was truncated to 20, missing 49 articles)
- **Category balance in scout** — underserved categories (Nutrition, Fitness, Sleep Science) explicitly prioritized, oversaturated categories flagged
- **Featured rotation upgrade** — twice daily (12h), quality-gated (must have illustration, score >30), weighted by editor score (25%), recency (30%), independence score (15%), category diversity (10%)
- **Admin kill button** + `kill-article` edge function action
- **Hard duplicate filter** on queue inserts — same `isDuplicate()` check

### Changed
- **Scout frequency** — designed to run less often with bigger sweeps (10 topics per run vs 3)
- **Produce cron** — every 3 min (was 5)
- **QC defaults to publish** — only revises for serious factual errors, max 1 revision
- **Models**: Sonnet 4.6 (research/editor/write/QC), Gemini 2.5 Flash (scout discovery), Grok 3 (independence review)

## [6.0.0] - 2026-03-23

### Architecture — Two-Job AI Newsroom
- **Scout job** (cron: `*/15`) — Gemini discovers topics via Google Search, Sonnet structures and scores, editor picks winner, unchosen auto-save to queue
- **Produce job** (cron: `*/3`) — editor picks from queue, self-chains: Editor Brief → Write (JSON) → Grok Independence Review → QC + Publish
- **Self-chaining** — each production stage triggers the next via HTTP POST. Cron is just the initial trigger
- **Topic queue** — `topic_queue` table. Admin can add manually. Scout auto-fills. Hard dedup prevents duplicates
- **`safeStage()` wrapper** — catches all errors, fails hard, records in log
- **Robust JSON parser** — proper brace-matching, truncated JSON repair
- **135s API timeout** — prevents Edge Function silent kills
- **`sortOrder`** (epoch ms) — newest articles always first
- **Schema columns** — `stage_started_at`, `model_used`, `grok_score`, `editor_score`, `revision_count`, `source`, `independence_score`, `pipeline_log_id`
- **Category sanitization** — whitelist of 9 valid categories
- **Pipeline Monitor** — 5-stage visualization, model badges, topic queue, kill buttons, independence scores

## [5.19.0] - 2026-03-23

### Changed
- **Daily article agent → staged pipeline** — broke monolithic pipeline (research + write + illustrate + publish) into 3 independent stages that each complete within Edge Function timeout limits. Each cron invocation processes ONE stage of ONE article
- **Cron schedule: daily → every 15 minutes** — with staged pipeline, one article takes ~45 min (3 stages x 15 min intervals). Capacity: ~32 articles/day. Temporary ramp-up until 100 articles reached
- **Rate limit: per-day → per-hour** — allows multiple articles per day instead of one

### Added
- **Smart featured rotation** — after each article publish, scores all articles on recency (40%), category diversity (20%), illustration quality (20%), read time (10%), and engagement proxy (10%). Auto-rotates featured article every 24h. Prevents stale featured stories
- **Auto-stop at 100 articles** — pipeline self-disables once article count reaches 100
- **Stale run cleanup** — automatically marks timed-out pipeline runs as failed, preventing zombie entries from blocking new runs
- **Concurrent execution guard** — prevents overlapping pipeline stages from running simultaneously
- **`research_data` column** on `daily_article_log` — stores research JSON between pipeline stages

### Fixed
- **Pipeline timeout crashes** — old monolithic pipeline (~4 min total) exceeded Edge Function wall clock limits. Staged approach keeps each invocation under 2 min

## [5.18.0] - 2026-03-23

### Fixed
- **Newsletter API not saving in production** — `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` were missing from Vercel env vars. Set via CLI. Verified: emails now save to `newsletter_subscribers` table in production
- **OG image URLs relative instead of absolute** — social platforms (Twitter, LinkedIn, Facebook) cannot resolve relative paths. Now prepends site URL when image doesn't start with `http`
- **manifest.json wrong branding** — still said "Tune Health" instead of "alumi news"
- **robots.txt wrong sitemap URL** — pointed to nonexistent `tunehealth.com` domain. Corrected to `tune-health.vercel.app/sitemap-index.xml`
- **Double search icon on iPhone** — `.nav-inner button { display: flex }` in touch media query was overriding Tailwind's `hidden` class on the ⌘K trigger button. Removed the display override

### Removed
- **Article reactions system** — localStorage-only emoji counters that displayed personal clicks as "counts," appearing as social proof with no backend aggregation. Replaced with nothing — a serious magazine doesn't need fake engagement metrics

### Changed
- **All animations slowed 25%** — Tailwind duration scale overridden (200→250ms, 300→375ms, 500→625ms, 700→875ms), all raw CSS durations scaled proportionally. View Transitions, reveals, cards, SideNav, buttons all feel smoother
- **Grain texture tightened** — noise overlay `baseFrequency` 0.65 → 0.78 (~20% finer grain)
- **Vanity stats removed** — article counts, category counts, and "Est. 2024" removed from homepage hero, footer, articles index, and subscribe page. Subscribe page stats replaced with reader-relevant "Weekly / Free / Zero Sponsors"
- **Subscribe page** — wired to real `/api/subscribe` endpoint (was fake setTimeout)

## [5.17.0] - 2026-03-22

### Fixed
- **Stale header state after View Transition** — `updateScroll()` now called immediately on init to clear leftover `.scrolled` / `.header-hidden` classes from the previous page
- **HighlightShare listener leak** — added AbortController cleanup; `selectionchange`, `scroll`, and `mousedown` listeners were stacking on every page navigation
- **FloatingShareBar listener leak + duplicate logic** — replaced dual IntersectionObserver + scroll listener with single AbortController-managed scroll listener
- **Missing site assets** — favicon.svg, apple-touch-icon.png, og-image.png, and logo.png were referenced in BaseLayout and SEO.astro but didn't exist in `/public/assets/`. All now present
- **Newsletter API failing as static endpoint** — added `export const prerender = false` and try/catch around `request.json()` parsing

### Added
- **Supabase migration for newsletter_subscribers** — `20260323_newsletter_subscribers.sql` creates table with email unique constraint, RLS enabled, applied to production

## [5.16.0] - 2026-03-22

### Added
- **Sticky header hide/show on scroll** — on article pages (desktop), header slides up when scrolling down and reappears when scrolling up (like Medium/Substack). Maximizes reading real estate. 8px dead zone prevents jitter
- **View Transition anti-flash CSS** — custom `::view-transition-old(root)` / `::view-transition-new(root)` keyframes with 200ms cross-fade prevent the white flash that occurred between page navigations
- **FloatingTOC keyboard accessibility** — added `:focus-visible` ring on TOC links and mobile pill text truncation (`max-width: 180px` with ellipsis) to prevent overflow on narrow screens
- **404 page noindex** — `<meta name="robots" content="noindex, nofollow">` prevents search engines from indexing error pages

### Fixed
- **Event listener memory leak across all nav components** — Header, SideNav, MobileNav, FloatingTOC, and BaseLayout core interactions now use `AbortController` to clean up old event listeners before re-attaching on View Transitions. Previously, every page navigation stacked duplicate listeners (N listeners after N navigations)
- **Header menu close race condition** — added `isHovering` state guard so rapid hover→leave→hover cycles no longer cause unpredictable menu state. Close timeout increased from 150ms to 250ms to match CSS transition
- **MobileNav scroll jitter on iOS** — added 8px dead zone to scroll delta detection, preventing momentum scroll oscillation from rapidly toggling the nav bar visibility
- **CommandPalette scroll lock** — body scroll now locked (`overflow: hidden`) when palette is open, preventing background page from scrolling behind the modal backdrop
- **CommandPalette backdrop click** — fixed click event bubbling by checking `e.target === e.currentTarget` instead of always closing on backdrop click
- **SideNav active link matching** — rewrote matching logic to properly handle query params and hash fragments. Added `aria-label` for accessibility
- **Subscribe page fake newsletter handler** — replaced `setTimeout` mock with real `/api/subscribe` API call with error handling
- **Subscribe page hardcoded stats** — "46+" articles and "7" categories now dynamically pulled from content collection

### Changed
- **Header transition refined** — replaced `transition-all duration-300` (caused white flash during View Transitions) with targeted `transition: border-color 0.15s, transform 0.3s`. Only the properties that need to animate now animate
- **All nav transitions optimized** — replaced 15+ `transition-all` usages with specific property transitions (background-color, box-shadow, opacity, transform) across cards, buttons, SideNav links, back-to-top. Eliminates unnecessary property watching and reduces visual jank
- **Menu dropdown shadow** — upgraded from generic `shadow-2xl` to editorial-quality custom shadow with directional depth (`0 20px 60px`)
- **SideNav stagger timing** — reduced logo delay from 100ms to 50ms, scroll delay from 150ms to 100ms for snappier feel

## [5.15.0] - 2026-03-22

### Added
- **Content-Security-Policy header** — CSP in `vercel.json` restricts scripts, styles, fonts, images, and connections to known origins (self, Google Fonts, Supabase, Unsplash). Blocks framing entirely
- **Newsletter API endpoint** (`/api/subscribe`) — server-side endpoint that validates email and upserts to Supabase `newsletter_subscribers` table. Falls back gracefully if Supabase is not configured
- **Article reactions tooltip** — "Reactions are saved locally on this device" note under reactions bar, setting correct user expectations

### Fixed
- **Newsletter form was fake** — both `Newsletter.astro` and homepage form used `setTimeout` to fake "Subscribed!" without saving data. Both now call `/api/subscribe` with proper error handling and feedback
- **Article search had no debounce** — articles index search input now debounces with 150ms delay instead of filtering on every keystroke
- **Dead sorting in `getArticlesForHomepage()`** — removed no-op `.sort()` that sorted by own index (preserving existing order). Function now simply concatenates published + coming-soon articles

## [5.14.0] - 2026-03-22

### Fixed
- **HighlightShare popup visibility** — increased background opacity from 0.92 to 0.95 and enhanced shadow contrast for better visibility against both light and dark article content
- **MobileNav hardcoded colors** — replaced raw RGB values (`rgb(120 113 108)`, `rgb(220 38 38)`) with Tailwind `theme()` tokens (`stone.500`, `primary.600`, etc.) for proper design system integration
- **Drop cap color hardcoded** — replaced `#dc2626` / `#f87171` hex values with `theme('colors.primary.600')` / `theme('colors.primary.400')` for design system consistency
- **View Transitions ignore reduced-motion** — added `@media (prefers-reduced-motion: reduce)` to disable article page transition animations for users who prefer reduced motion

### Changed
- **Font loading optimized** — added `preload` hint for Inter (critical UI font) to reduce render-blocking time

## [5.13.0] - 2026-03-22

### Added
- **`truncate()` utility** in `articles.ts` — replaces 7+ copy-pasted `.slice(0, N) + '...'` patterns across Header, Footer, SideNav
- **`MenuDropdownContent.astro`** — shared dropdown menu content extracted from Header, eliminating ~100 lines of duplicated markup between home and article variants
- **`twitter:site` meta tag** — `@aluminews` handle added to Twitter Card meta for proper attribution on social shares

### Fixed
- **Homepage Deep Dives were hardcoded** — 3 static "Coming Soon" cards with Unsplash images replaced with collection-driven published series from `getAllSeries()`. Published Thyroid Deep Dive now actually appears on homepage
- **Back-to-top button touch target** — increased from 40px (`w-10`) to 48px (`w-12`) for WCAG-compliant touch target
- **Duplicate `id="newsletter"` on homepage** — Newsletter component and homepage section both used same ID. Renamed homepage wrapper to `newsletter-section`
- **Mobile nav scroll jank** — added `will-change: transform` to `.mobile-nav` for GPU-accelerated scroll hide/show

### Changed
- **Header refactored** — dropdown menu markup extracted to `MenuDropdownContent.astro`, eliminating full duplication between home and article variants. Both variants now share identical menu content

## [5.12.0] - 2026-03-22

### Fixed
- **SEO structured data domain mismatch** — `SEO.astro` was generating all JSON-LD schemas (Organization, WebSite, BreadcrumbList, Article) pointing to `alumi-news.vercel.app` instead of `tune-health.vercel.app`. Now uses `Astro.site` for correct domain resolution
- **Duplicate Footer and CommandPaletteWrapper** on reading list page — `reading-list.astro` rendered Footer and CommandPaletteWrapper twice, producing double footers
- **Article schema missing `image` field** — Google rich results require an `image` property on Article schema. Added `ImageObject` with `heroImage` URL and alt text to structured data
- **Type safety gap in article utilities** — `mapArticle()` used `data: any` instead of `CollectionEntry<'articles'>`, losing all type checking on the most-used function in the codebase
- **Missing robots meta tag** — Added explicit `<meta name="robots" content="index, follow">` to `BaseLayout.astro` as defensive SEO measure

## [5.11.0] - 2026-03-22

### Added
- **Mobile bottom navigation bar** (`MobileNav.astro`) — fixed 5-item nav (Home, Articles, Search, Saved, Series) for touch devices under 1024px. Active state highlighting, auto-hides on scroll down, safe-area-aware, hidden in print
- **"More in [Category]" link** on article pages — browse-category CTA below related articles for easy topic exploration
- **Active state indicators** in Header menu — highlights current section (Home, Articles, Deep Dives, Subscribe)
- **SideNav on article pages** — readers can now access sidebar navigation from any article (previously missing)
- **SideNav on Reading List page** — was missing Footer, CommandPalette, and SideNav
- **Deep Dives anchor IDs** — published series sections have slugified IDs for direct linking

### Fixed
- **3 dead topic links** — Header and SideNav hardcoded `?topic=sleep`, `?topic=hormones`, `?topic=supplements` which matched no real categories. All topic links now dynamically generated from `getCategories()` across Header, SideNav, and Footer
- **2 missing categories** — Clinical Evidence (10 articles) and Environmental Health (4 articles) were absent from Header and SideNav topic lists. Now auto-populated
- **Header article links could 404** — "Latest" section used raw `article.id` (with `.json` extension) instead of mapped `article.href`. Fixed to use `getArticles()` utility
- **SideNav series links pointed to nonexistent anchors** — 5 hardcoded coming-soon series linked to `#habit-formation`, `#microbiome`, etc. which had no matching IDs on the Deep Dives page. Replaced with dynamic published series from `getAllSeries()`, linking to first article of each series
- **Homepage category counter hardcoded "7"** — now uses dynamic `{categories.length}` (actual count: 9)
- **Article pages were a navigation dead end** — article variant Header only showed Home/Articles/Series text links with no menu dropdown. Now includes full dropdown menu with sections + topics
- **No outside-click close on Header menu** — touch devices got stuck with menu open. Added document click listener
- **Reading List page used stripped Header variant** — changed to home variant with full menu access

### Changed
- **Header** — refactored from `getCollection('articles')` to `getArticles()` + `getCategories()` utilities for consistency. Article variant now has full dropdown menu matching home variant
- **SideNav** — topics and series sections are now fully collection-driven (were hardcoded). Series links to first article with "All Deep Dives" link. Topics pulled from `getCategories()`
- **BaseLayout** — imports and renders `MobileNav` component on all pages
- **Back-to-top button** — repositioned above mobile nav on touch devices
- **Footer padding** — adjusted on touch devices to not be hidden behind mobile nav

## [5.10.0] - 2026-03-22

### Added
- **Expanded social sharing** (`ShareButtons.astro`) — now supports 8 platforms: X/Twitter, LinkedIn, Facebook, Reddit, Bluesky, WhatsApp, Email (mailto with prefilled body), and copy link. Each platform icon highlights in its brand color on hover. Reddit and Bluesky hidden on small screens to prevent overflow
- **Native Web Share API** — on mobile devices, a "More" share button taps into the OS share sheet (Messages, AirDrop, etc.). Only renders when `navigator.share` is available
- **Floating share sidebar** (`FloatingShareBar.astro`) — sticky vertical share bar fixed to the left edge of article pages on xl+ screens. Glass morphism styling, appears when article content is in view, hides at footer
- **Article reactions** (`ArticleReactions.astro`) — emoji reaction bar (Insightful, Mind-blown, Rigorous, Practical) with localStorage persistence per article slug. Pop animation on click, toggle on/off, count display
- **Highlight-to-share** (`HighlightShare.astro`) — when users select 10–400 characters of article text, a dark tooltip popup appears with options to share the quote on X, Bluesky, or copy with attribution. Only triggers within article content
- **Reading List page** (`/reading-list`) — full page for viewing all bookmarked articles from localStorage. Shows article cards with hero images, category, read time. Per-article remove button + "Clear all" with confirmation. Empty state with CTA
- **Social follow links in Footer** — RSS, X/Twitter, and Bluesky follow buttons with hover-lift effect in a new "Follow & Subscribe" section
- **RSS autodiscovery** — `<link rel="alternate" type="application/rss+xml">` in BaseLayout `<head>` so feed readers auto-detect the RSS feed
- **Reading List + RSS links in SideNav** — bookmark icon link to `/reading-list` and RSS icon link to `/rss.xml` in the sidebar "More" section

### Fixed
- **Share URL domain** — ShareButtons now uses correct `tune-health.vercel.app` via `Astro.site` (was hardcoded to `aluminews.com`)
- **Package version sync** — bumped from 5.8.0 to 5.10.0 to match changelog

### Changed
- **ShareButtons** supports `variant` prop (`"inline"` | `"vertical"`) and `description` prop for richer share text
- **ArticleLayout** now includes FloatingShareBar, ArticleReactions, and HighlightShare components
- **Footer** has new social/follow section above the bottom bar
- **SideNav** "More" section expanded with Reading List and RSS Feed links

## [5.9.0] - 2026-03-22

### Added
- **RSS feed** (`/rss.xml`) — via `@astrojs/rss`, includes all published articles with tags as categories
- **Sitemap** — `@astrojs/sitemap` integration generates `sitemap-index.xml` on build
- **Custom 404 page** — branded error page with "Back to Home" and "Browse Articles" CTAs
- **About page** (`/about`) — mission statement, editorial standards, brand tone cards, app CTA. Linked from Footer and SideNav
- **Series infrastructure** — `series` and `seriesOrder` fields in content schema, `getSeriesArticles()` and `getAllSeries()` utility functions
- **Series navigation component** (`SeriesNav.astro`) — progress dots, "Part X of Y" counter, prev/next links. Auto-renders on articles with a `series` field
- **Social share buttons** (`ShareButtons.astro`) — Twitter, LinkedIn, copy link on every article page
- **Breadcrumbs** on article pages — Home > Articles > Category with topic link wiring
- **Bookmark / reading list** (`BookmarkButton.astro`) — localStorage-based save system on article pages
- **Article pagination** — articles index shows 12 initially with "Show More" button; auto-expands when filtering or searching
- **Per-article OG images** — `heroImage` from Supabase used as Open Graph image for social sharing

### Fixed
- **Canonical URL mismatch** — `siteUrl` corrected from `alumi-news.vercel.app` to `tune-health.vercel.app` in BaseLayout. All OG tags, canonical links, and Twitter cards now point to the correct domain
- **Topic nav links were dead** — 16+ links from Header/SideNav/Footer to `/articles?topic=X` now work. Articles index reads `?topic=` URL param and auto-selects matching category chip
- **Related articles were random** — `getRelatedArticles()` now scores by category match (+10) and shared tag overlap (+3 each) instead of returning first 3 articles
- **Fake social proof removed** — subscribe page no longer claims fabricated subscriber counts, open rates, or quotes a fictional doctor. Replaced with honest article stats
- **Homepage category filter inconsistency** — featured hero card now respects category filter (hidden when category doesn't match)
- **Package version mismatch** — package.json synced from 5.5.0 to 5.8.0 (now 5.9.0)
- **Newsletter form duplication** — homepage form now uses shared `data-newsletter-form` pattern; removed duplicate inline handler

### Changed
- **Deep Dives page rewrite** — now dynamically renders published series (Thyroid Deep Dive, 6 articles with cards) above coming-soon series, using `getAllSeries()` from content collection
- **Thyroid articles** — all 6 articles tagged with `series: "The Thyroid Deep Dive"` and `seriesOrder: 1-6`
- **Article header navigation** — article pages now show Home / Articles / Series links instead of just a back arrow
- **Font loading optimized** — reduced from 22 font weights to 13 across 3 families (Playfair Display 8→5, Inter 5→4, Crimson Pro 7→3)
- **Loader speed** — reduced forced delay from 1.6s to 0.6s
- **Footer nav** — added About link to Explore section
- **SideNav** — "Our Mission" link changed to About page link

### Removed
- **GSAP dependency** — unused (zero imports in src/), removed from package.json and astro.config.mjs

## [5.8.0] - 2026-03-23

### Added
- **Thyroid Series (Parts 2–6)** — 5 deep-dive articles published from source docs with AI-generated editorial illustrations:
  - **Part 2: "The War Within"** (`thyroid-war-within`) — Hashimoto's, Graves', gut-thyroid axis, molecular mimicry, selenium, microbiome signatures. 15 min read. Clinical Evidence.
  - **Part 3: "The Poisoned Well"** (`thyroid-poisoned-well`) — PFAS, fluoride, perchlorate, BPA, phthalates, pesticides, mixture toxicology, regulatory failure. 13 min read. Environmental Health.
  - **Part 4: "The Fetal Blueprint"** (`thyroid-fetal-blueprint`) — Maternal thyroid dependency, iodine deficiency resurgence, autism link (2x risk with uncontrolled hypothyroidism), IQ effects, universal screening failure. 11 min read. Clinical Evidence.
  - **Part 5: "The Cancer That Wasn't"** (`thyroid-cancer-conversation`) — Overdiagnosis paradox, active surveillance, thermal ablation, BRAF/RET/NTRK molecular targeting, 2025 ATA guidelines. 11 min read. Clinical Evidence.
  - **Part 6: "Rebuilding the Thyroid"** (`thyroid-rebuilding`) — IMITHOT FMT trial, AI-assisted diagnostics, polygenic risk scores, DIO2-guided T3 therapy, precision medicine vision for 2035. 12 min read. Clinical Evidence.
- Total published articles: 46

### Fixed
- **Production URL** — README updated from stale `alumi-news.vercel.app` to correct `tune-health.vercel.app`

## [5.7.0] - 2026-03-22

### Added
- **Daily Article Agent** (`daily-article-agent` Edge Function) — fully autonomous daily editorial pipeline
  - **Phase 1: Research** — Claude with native `web_search_20250305` tool autonomously discovers trending health topics from the last 3 days (up to 10 web searches), cross-referenced against existing article catalog to avoid duplicates. No third-party search API needed.
  - **Phase 2: Article Writing** — Claude with web search (up to 5 fact-checking searches) writes a 2,500-3,000+ word investigative article with full editorial formatting (sections, pull quotes, info cards, SVG hero, TOC, disclaimer)
  - **Phase 3: Publish** — saves to Supabase DB, commits .astro + .json to GitHub (triggers Vercel deploy), fires illustration generation
  - Actions: `run` (full pipeline), `dry-run` (everything except GitHub publish), `status` (recent log entries)
  - Rate-limited: one successful run per calendar day
  - Supports `model` parameter: defaults to Claude Sonnet 4.6 for speed, accepts `"opus"` for Claude Opus 4.6 quality
- **`daily_article_log` table** — tracks each agent run: topic, slug, title, status, error, search queries, research snippets, timestamps
- **`pg_cron` schedule** — daily at 6 AM UTC via `pg_net` HTTP POST to Edge Function
- **New article: "The Shingles Shot That Quietly Became a Heart Drug"** — investigative article on the ACC.26 study showing 46% MACE reduction from shingles vaccination, Korean cohort (1.27M participants), ESC meta-analysis, VZV vascular damage mechanisms, dementia protection evidence, and skeptics' assessment. 13-minute read, Clinical Evidence category.
### Fixed
- **Illustration pipeline sync** — daily agent was committing article JSON to GitHub *before* illustration was generated (fire-and-forget), so heroImage never reached the static site. Now waits for illustration generation (up to 60s), gets the URL, and includes `heroImage`/`heroImageAlt` in the GitHub commit. Articles deploy with art from the first build.
- **Large article card (01) missing title** — `.article-card-large` image had `lg:h-full` which filled the entire card, pushing `.article-card-content` out of view via `overflow-hidden`. Fixed with magazine-style overlay: content sits on top of the image with a gradient, scoped to `lg+` only (mobile keeps stacked layout).
- **Newsletter input iOS auto-zoom** — `text-sm` (14px) → `text-base` (16px) to prevent Safari zoom on focus.

### Changed
- **UI tightening across the site** — reduced visual bloat for a more refined, magazine-like density:
  - **Typography**: display-1 max 6rem→4.5rem, heading-1 3.5rem→2.75rem, heading-2 2.25rem→1.875rem, body-lg and overline slightly reduced
  - **Container**: max-width 1400px→1240px, padding px-6/8/12→px-5/8/10
  - **Nav**: height h-18/h-20→h-14/h-16
  - **Hero**: full viewport (100dvh), stats + scroll indicator absolute-anchored at bottom
  - **Section padding**: py-20/py-28→py-14/py-20, mission py-24/py-32→py-16/py-24
  - **Cards**: content padding p-5/p-6→p-4/p-5, image aspect 16/10→16/9, featured image 4/5→4/3, featured card rounded-3xl→rounded-2xl
  - **Buttons**: px-6 py-3→px-5 py-2.5
  - **Card numbers**: opacity 15%→10%, sizes reduced one step throughout
  - **Deep dives hero**: tightened padding

### Architecture
- Daily article agent pipeline: Claude with native `web_search` tool → autonomous topic discovery & research → article writing with fact-checking → DB save → GitHub publish → illustration generation. No third-party search API — uses Anthropic's built-in server-side web search.
- `pg_cron` + `pg_net` extensions for scheduled execution (must be enabled in Supabase Dashboard)
- Migration: `supabase/migrations/20260322_daily_article_agent.sql`

## [5.6.1] - 2026-03-22

### Added
- **Funnel expansion** — 3 additional touchpoints from quality audit:
  - **Command Palette**: "Open alumi Health" action (power users, ⌘K)
  - **Subscribe page**: app cross-promo card after "Recent Issues" sidebar
  - **Deep Dives page**: "Apply What You Learn" bridge section between series list and newsletter
  - **Articles index**: compact "Take Your Learning Further" CTA section above newsletter

### Fixed
- **AppPromo section background** — added `bg-white dark:bg-stone-900` so the homepage app section visually separates from surrounding sections (was blending into default background)
- **ArticleCTA touch target** — added `min-h-[44px]` to CTA button for WCAG AA compliance on touch devices

## [5.6.0] - 2026-03-22

### Added
- **alumi Health funnel system** — 5 touchpoints connecting the editorial magazine to the alumi Health app (`https://tune-sigma.vercel.app`)
  - **Article-end CTA** (`ArticleCTA.astro`): contextual per category — maps article topics to relevant app features (e.g., Longevity → Lab Results, Nutrition → Meal Analysis, Neuroscience → AI Analyst). Appears after every article's author card
  - **Homepage section** (`AppPromo.astro`): 4-feature grid (Lab Results, Meal Analysis, AI Analyst, N=1 Experiments) with "Start 14-Day Free Trial" CTA, placed between the Mission section and Deep Dives
  - **Header nav link**: subtle pill-shaped "alumi Health" link with external arrow, hidden on mobile to keep header clean
  - **Footer section**: alumi Health promo bar with description and "Start Free Trial" button, placed above the copyright bar
  - **SideNav promo card**: compact app card in the sidebar under a new "App" section label
- **Funnel configuration module** (`src/utils/funnel.ts`): centralized category-to-feature mapping, CTA copy, and UTM link builder — single source of truth for all 5 touchpoints
- **UTM tracking**: every app link includes `utm_source=alumi-news`, `utm_medium={touchpoint}`, `utm_campaign={category}`, `utm_content={article-slug}` for conversion tracking
- **CSS**: `.app-cta`, `.app-cta-icon`, `.app-cta-feature-pill`, `.app-promo-card` styles in `@layer components`

## [5.5.1] - 2026-03-22

### Fixed
- **Drop cap baseline alignment** — replaced manual `float-left` + hardcoded `font-size`/`margin-top`/`margin-bottom` with CSS `initial-letter: 3` (+ `-webkit-initial-letter` for Safari), which automatically sizes and aligns the drop cap to span exactly 3 text lines with proper baseline alignment. Moved rule outside `@layer components` to prevent cascade layer from suppressing `initial-letter`. Float fallback (`font-size: 6.1rem`) for browsers without support. Fixed selector to `> section:first-child > p:first-of-type` so only the article's opening paragraph gets a drop cap (was applying to every section's first paragraph).

## [5.5.0] - 2026-03-22

### Security
- **Auth added to `delete-article` and `publish-article` Edge Functions** — both were previously unauthenticated, allowing anyone to delete or publish articles. Now require `ADMIN_TOKEN` Bearer auth.
- **Auth bypass fixed in `articles-api`** — logic `if (adminToken && ...)` allowed write ops when `ADMIN_TOKEN` env var was unset. Changed to `if (!adminToken || ...)`.
- **Error info leakage fixed** — all 8 Edge Functions now return generic error messages instead of raw `err.message` (which could expose internal details like DB errors, API rate limits)
- **Admin token env var renamed** — `PUBLIC_ADMIN_TOKEN` → `ADMIN_TOKEN` (server-side only). The `PUBLIC_` prefix was exposing the token in client-side Astro bundles.
- **Security headers** — added `vercel.json` with X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy

### Added
- **AI Agents panel** on admin dashboard (replaces minimal "AI Tools" section):
  - **Editorial QC Agent**: 3 modes (Audit Only, Dry Run preview, Audit & Auto-Fix), severity selector (High/Medium+/All), pattern warnings, copy report to clipboard, per-issue fix status with check/skip/error indicators, status badge showing grade
  - **Illustration Agent**: single-article dropdown selector for targeted generation, batch controls (Generate Missing, Regenerate All with cost confirmation)
  - **Database Sync**: refresh DB from content button
- **Admin dashboard enhancements**: 6 stat cards (total, published, drafts, featured, illustrated, avg read time), category breakdown pill row, recently updated horizontal scroll, article search/filter, description preview per card, illustration status indicator (green/gray dot), tag count
- **Category gradient mapping** — added "Research Summary" and "Pharmacology" to `getArticleGradientStyle()` (were falling back to gray default)

### Fixed
- **iPhone scroll-back-up bug** — reveal animations used 700ms `translateY` transitions that fought with iOS Safari scroll momentum. On touch devices, transforms are now disabled — opacity-only transitions at 300ms. Removed negative `rootMargin` from IntersectionObserver. Removed `will-change: transform` from scroll progress bar.
- **iOS auto-zoom on inputs** — newsletter email input and admin form inputs were below 16px (iOS auto-zooms on < 16px). Changed to `text-base` / `1rem`.
- **Mobile menu scroll lock** — added `body.menu-open { overflow: hidden }` to prevent background scroll when hamburger menu is open
- **SideNav back-gesture conflict** — trigger zone moved 12px from left edge, hidden entirely on touch devices to avoid conflicting with iOS Safari back-swipe
- **Admin layout viewport units** — changed `100vh` to `100dvh` (3 instances) so layout doesn't extend behind iOS browser chrome
- **Scroll progress bar address bar** — now uses `visualViewport.height` instead of `innerHeight` to handle iOS address bar collapse/expand
- **Command Palette safe area** — respects `env(safe-area-inset-top)` for iPhone notch, added `px-4` edge padding
- **FloatingTOC touch target** — collapse button expands to 44px on touch devices (was 24px, below Apple minimum)
- **TypeScript errors** — fixed `slugify()` union type mismatch in ArticleEditor, reverted `mapArticle` data param to proper Astro type
- **Silent catch blocks** — 3 empty `catch {}` blocks in ArticleEditor now provide user feedback
- **`as any` casts eliminated** — added `Window` interface extension, proper type narrowing in CommandPalette, DraftData interface in ArticleEditor, typed `updateMetadata` parameter
- **`console.error` removed** from generate-illustration Edge Function (production code rule)

### Changed
- **Branding consistency** — BRAND.md, CHANGELOG.md, package.json updated from "Tune Health" to "alumi news"
- **Package.json** — name `alumi-news`, version `5.5.0`, removed unused `@astrojs/node` dependency
- **`.nvmrc`** — updated from Node 20 to 22 (matches runtime)
- **Deprecated CSS removed** — `-webkit-overflow-scrolling: touch` (unnecessary in modern iOS)
- **Reveal animation timing** — reduced from 700ms to 400ms on desktop, 300ms on mobile; stagger delays reduced proportionally

### Removed
- `astro-temp/` leftover scaffold directory (44KB, was gitignored but cluttering workspace)

## [5.4.0] - 2026-03-22

### Added
- **AI Tools panel** on admin dashboard — live controls for Editorial QC and Illustration generation
  - "Audit Only" button: runs editorial-qc audit, shows grade + issues with before/after comparisons
  - "Audit & Fix" button: audits then auto-applies medium+ severity fixes
  - "Generate Missing" button: batch-generates illustrations for articles without them
  - "Regenerate All" button: regenerates all illustrations (with cost confirmation dialog)
  - 4th stat card showing illustration coverage (X/Y illustrated)
- **Auto-illustration on article creation** — ArticleEditor now calls `generate-illustration` automatically after Claude generates a new article

### Changed
- **14 headlines refined for brand voice** — replaced QC-generated titles that were too clickbaity with headlines matching the editorial voice (provocative + intellectual, not BuzzFeed)
  - "IQ Tests Are Mostly Bullshit" → "What IQ Actually Measures — and What It Misses Entirely"
  - "The Ovary Apocalypse" → "Half the Population Goes Through Menopause. Medicine Barely Noticed."
  - "Empathy Is Overrated" → "Empathy Has a Problem Science Is Only Now Admitting"

### Fixed
- **Title mismatch between cards and article pages** — all 39 `.astro` page files synced with JSON metadata titles. Previously, card titles (from JSON) were updated but article page titles (hardcoded in `.astro` props) still showed old values.

## [5.3.0] - 2026-03-22

### Added
- **`editorial-qc` Edge Function** — autonomous editorial quality control system
  - `audit`: Claude (Sonnet) reviews ALL articles holistically as a collection, analyzing headline variety, reader magnetism, description quality, illustration status, and metadata completeness. Returns structured JSON report with issues, severity levels, specific suggestions, and an overall grade.
  - `fix`: Auto-applies changes by dispatching to other Edge Functions (`articles-api` for titles/descriptions, `generate-illustration` for missing art). Supports `min_severity` threshold and `dry_run` mode.
  - `audit-and-fix`: Combined flow — audit then auto-fix in one call.
  - Identifies patterns like structural repetition ("22/39 titles start with 'The'"), weak differentiation, and monotonous headline rhythms.
- All 39 articles seeded to Supabase database (was only 8)

### Changed
- **16 article titles improved** based on QC audit — reduced "The X" pattern from 56% to ~30%, increased structural variety, improved reader magnetism
- Examples: "The Disease Medicine Forgot" → "190 Million Women Have a Disease Science Ignores", "The Switching Brain: What Creativity Actually Is" → "Creativity Isn't What You Think It Is"

## [5.2.0] - 2026-03-22

### Added
- **`generate-illustration` Edge Function** — automated AI illustration pipeline using OpenAI GPT Image 1.5
  - `generate` action: creates an editorial illustration for a single article by slug
  - `batch` action: generates illustrations for all articles missing them (with `force` option)
  - House style prompt ensures consistent "premium health science magazine" visual language
  - Category-specific color palettes (8 categories) for cohesive art direction
  - Images stored in Supabase Storage (`article-illustrations` bucket)
  - Auto-updates `hero_image` and `hero_image_alt` in database
  - Rate-limit-safe sequential processing for batch operations
- **heroImage rendering with gradient fallback** — all card components now check for `heroImage` first, then fall back to category gradient art. This means illustrations automatically appear everywhere once generated.
- `OPENAI_API_KEY` stored securely in Supabase secrets (never in code or .env)

### Architecture
- Image pipeline: OpenAI GPT Image 1.5 → Supabase Storage → database `hero_image` field → static site JSON → card rendering
- All secrets (OPENAI_API_KEY, ANTHROPIC_API_KEY, GITHUB_TOKEN, ADMIN_TOKEN) stored in Supabase secrets only

## [5.1.0] - 2026-03-22

### Changed
- **Homepage redesigned** — article grid limited to 9 cards with "Browse all" CTA (was dumping all 40)
- **Category filters are now functional** — JS-powered filtering on homepage and articles index
- **Articles index completely redesigned** — compact 3-column grid with featured row (was full-width stacked cards requiring excessive scrolling)
- **Category-based gradient art system** — replaced broken dynamic Tailwind gradients and generic Unsplash stock photos with intentional, editorial-quality CSS gradient palettes per category via `getArticleGradientStyle()`
- **Footer redesigned** — added brand tagline ("Health is wealth. We help you protect it."), 4-column layout with topic links
- **Newsletter component improved** — progressive feedback animation, benefit checkmarks on default variant, prevents duplicate event bindings
- **SideNav cleaned up** — removed 8 dead links to non-existent pages (/research, /glossary, /protocols, /tools, /about, /team, /methodology, /contact)
- **Related articles fixed** — ArticleLayout now uses gradient art system (was showing empty gray boxes from broken dynamic classes)
- **Newsletter visual cards** on homepage now pull real article data instead of hardcoded fakes

### Added
- **Article search** on articles index page — real-time filtering by title, tags, and category
- **Category filter pills** on articles index — functional filtering with live result count
- **No results state** when search/filter yields no matches
- `getArticleGradientStyle()` utility — maps categories to rich CSS gradient palettes (Mental Health = indigo/violet, Neuroscience = blue/cyan, Longevity = emerald/teal, etc.)
- `getCategories()` used in homepage and articles index for dynamic category rendering

### Fixed
- **Broken gradient rendering** — dynamic Tailwind classes (`from-${var}`) were being purged at build time, showing empty gray card images. Now uses real CSS via inline styles
- Removed `heroImage`/`heroImageAlt`/`sortOrder` fields from all article JSON files (unused, replaced by gradient art system)

## [5.0.0] - 2026-03-22

### Added
- **24 new articles published** — massive content expansion across all categories
  - **Longevity**: "The Fire That Never Goes Out" (chronic inflammation), "Men Are Losing a Chromosome" (Y chromosome loss), "The Menopause Research Debt"
  - **Neuroscience**: "The Nerve That Runs Everything" (vagus nerve), "ADHD Brains Are Half Asleep", "The Blood-Brain Barrier Is Leaking", "Why Everyone Is Going Nearsighted" (myopia), "The Second Brain's Second Opinion" (gut-microbiome), "THC Doesn't Just Blur Memories", "The Intelligence Trap: What IQ Actually Measures", "The Switching Brain: What Creativity Actually Is", "The Empathy Problem", "The Neuroscience of Awe"
  - **Mental Health**: "The Largest Cannabis Study Ever Conducted", "Depression May Be an Energy Problem", "Emotional Intelligence Is Real. The Industry Mostly Isn't.", "The Positive Thinking Trap", "Faith Without God: The Case for Secular Hope"
  - **Clinical Evidence**: "The Nocebo Effect: How Belief Makes Drugs Toxic", "What Ozempic Is Actually Doing to Your Brain" (GLP-1)
  - **Environmental Health**: "You Are Mostly Plastic Now" (microplastics)
  - **Nutrition**: "Your Body Has a Gear It's Forgotten How to Use" (metabolic flexibility)
  - **Fitness**: "Zone 2 Training: The Science Behind Slow"
  - **Longevity**: "Senolytics: Clearing the Path to Longevity"
- Each article includes custom SVG feature image, table of contents, pull quotes, info cards, and medical disclaimer
- Featured articles: chronic-inflammation, glp1-brain, intelligence
- Source documents preserved in `source-docs/` directory

### Changed
- **3 "coming soon" articles converted to full published articles** (metabolic-flexibility, zone-2-training, senolytics)
  - Updated JSON metadata: `comingSoon: false`, `draft: false`, expanded tags and keywords
  - Created full `.astro` page files with complete article content
- Total published articles: 5 → 29
- All new articles auto-appear in homepage, articles index, SideNav, and Command Palette (collection-driven navigation)

## [4.0.0] - 2026-03-15

### Added
- **Admin Publishing Portal** at `/admin` — full editorial CMS
  - Token-based auth with middleware gate; logout button in header
  - **Dashboard** reads from Supabase database; shows Published, Drafts, and Coming Soon sections with status badges (Featured, Has Content, Draft, Coming Soon)
  - **New Article editor** (two-column: upload/chat + live preview)
    - Drag-and-drop file upload (.md, .docx, .txt) with mammoth for DOCX parsing
    - Claude Opus generates articles in exact editorial format (sections, pull quotes, info cards, SVG hero, TOC, disclaimer)
    - Progressive status messages during generation; cancel button
    - Chat refinement with 6 quick-action templates (Punchier intro, More evidence, Shorter, etc.)
    - Version history with restore (snapshots before each refinement)
    - Metadata editor with validation, auto-slug, visual gradient picker, hero image URL
    - localStorage auto-save (never lose work on refresh)
    - Publish confirmation dialog; validation gate
  - **Edit existing articles** at `/admin/edit/[slug]` (three tabs)
    - Metadata tab: all fields, saves instantly to database
    - Content tab: raw HTML code editor with word count and preview
    - AI Refine tab: chat with Claude to modify article content with quick actions
    - Live article preview in right panel
    - "Publish to GitHub" button assembles .astro + .json and commits
  - **Delete articles** with confirmation modal; removes from both database and GitHub
- **Supabase PostgreSQL database** — `articles` table as source of truth for editing
  - Full schema: HTML content, SVG, TOC, metadata, status, timestamps
  - Auto-updating `updated_at` trigger; RLS enabled
  - All 5 existing articles seeded with full HTML/SVG/TOC content
- **Supabase Edge Functions** (6 total, deployed to TUNE project)
  - `articles-api`: CRUD operations with auth (list, get, save, delete, seed)
  - `process-article`: Claude Opus article generation with editorial system prompt
  - `refine-article`: Chat-based article refinement
  - `publish-article`: GitHub REST API commit pipeline (supports full and metadata-only updates)
  - `delete-article`: Removes .astro + .json files from GitHub
  - `fetch-article`: Fetches article content from GitHub (fallback)
- **Coming Soon articles** as content collection entries
  - `metabolic-flexibility.json`, `zone-2-training.json`, `senolytics.json`
  - Rendered with "Coming Soon" badges on homepage and articles index

### Changed
- **All navigation is now collection-driven** — zero hardcoded article references
  - Homepage article grid, featured article, article counter all dynamic
  - Articles index page renders from collection
  - SideNav featured links auto-populated from latest articles
  - CommandPalette article data injected from Astro via `window.__ALUMI_ARTICLES__`
  - Related articles auto-fetched by ArticleLayout
- **Content schema extended** with `heroImage`, `heroImageAlt`, `sortOrder`, `comingSoon` fields
- **Article utilities extended** with `getComingSoonArticles()`, `getArticlesForHomepage()`, `formatPublishDateShort()`
- All 5 article JSON files updated with `heroImage` and `heroImageAlt` values

### Architecture
- SSR via `@astrojs/vercel` adapter (admin pages server-rendered, public pages static)
- Auth middleware at `src/middleware.ts` protects `/admin/*` routes
- Client-side cookie auth (Vercel blocks POST to serverless functions)
- Database is source of truth for edits; GitHub for static site deployment
- Generated articles auto-saved to database; publish pushes to GitHub

## [3.0.0] - 2026-03-14

### Changed
- **REBRAND: Tune Health → alumi news** — Company renamed from Tune to Alumi
  - All brand references updated: "Tune Health" → "alumi news" (lowercase)
  - Logo text changed from "Tune Health" to "alumi news" in header, footer, sidenav, and loader
  - Logo font changed from serif (Playfair Display) to sans-serif (Inter) for brand consistency with alumi Health app
  - Author bylines: "Tune Health Editorial" → "alumi news Editorial"
  - Avatar initials: "TH" → "an"
  - Page titles, meta tags, Open Graph, and SEO structured data updated
  - Command palette footer branding updated
  - Site URL updated to alumi-news.vercel.app
  - All 5 article JSON author fields updated
  - Copyright notice updated

## [2.7.0] - 2026-03-14

### Added
- **New Article** - "The Serotonin Deception: How a Flawed Theory Became Medicine's Most Profitable Myth"
  - 22-minute evidence review of the serotonin/chemical imbalance theory of depression
  - Covers the 2022 Moncrieff umbrella review in Molecular Psychiatry
  - Examines pharmaceutical marketing of the chemical imbalance narrative
  - SSRI efficacy data from Cipriani meta-analysis (522 trials, 116,477 participants)
  - Placebo problem analysis (active vs inert placebos)
  - Withdrawal crisis: 56% experience symptoms, 46% describe them as severe
  - Evidence-based alternatives: exercise, CBT, psilocybin-assisted therapy, social connection
  - Located at `/articles/the-serotonin-deception`
- Article added to homepage grid (position 01), articles index, command palette, and SideNav featured section
- Homepage article counter updated from 3 to 4

### Added
- **New Article** - "Pan-demic: The Truth About Your Non-Stick Cookware"
  - 10-minute evidence review of PFAS "forever chemicals" in non-stick coatings
  - Covers DuPont/3M corporate cover-up history and litigation
  - PFAS health risks: 56% increased thyroid cancer risk, 97% of Americans contaminated
  - Heat decomposition and microplastic release from scratched surfaces
  - Safer cookware alternatives: borosilicate glass, stainless steel 18/10, cast iron
  - Reformatted from external source into TUNE editorial voice (removed emojis, added evidence framing)
  - Located at `/articles/nonstick-pan-pfas`
- Article added to homepage grid, articles index, command palette, and SideNav
- Homepage article counter updated from 4 to 5

## [2.6.0] - 2025-12-11

### Changed
- **Brand Messaging Overhaul** - Refined hero and site-wide copy
  - Hero slogan: "Evidence. Wherever it leads." (positive framing, replaces "No..." opener)
  - About section heading: "Health Without the Hype"
  - Health/Wealth theme woven throughout:
    - Footer: "Health is wealth. We help you protect it."
    - About closer: "The only wealth that matters."
    - Newsletter: "Real Wealth Starts Here"
  - Updated BRAND.md with final brand voice
- **Dynamic Header Menu** - Latest articles now fetched dynamically
  - Uses `getCollection('articles')` to show 3 most recent
  - No more hardcoded article links
  - Section renamed from "Featured" to "Latest"

## [2.5.0] - 2025-12-11

### Changed
- **Warm Color Palette** - Custom black and white with subtle warm tint
  - `black` now `#1b1a18` (HSL 47°, 3%, 10%) - warm dark gray instead of pure black
  - `white` now `#e7e6e3` (HSL 47°, 3%, 90%) - warm off-white instead of pure white
  - Creates a cohesive, premium editorial aesthetic
  - All Tailwind utilities (`bg-black`, `text-white`, etc.) use these warm tones
- Fixed Tailwind content paths to include `src/` directory for Astro files

## [2.4.0] - 2024-12-11

### Added
- **New Article** - "Do Any Longevity Interventions Actually Work?"
  - Comprehensive 25-minute evidence review of longevity interventions
  - Covers OMAD, caloric restriction, autophagy, primate studies, CALERIE trials
  - Reviews supplements: rapamycin, metformin, resveratrol, NAD+ precursors
  - Includes ProLon fasting-mimicking diet analysis
  - Critical examination of translation problems from animal to human studies
  - Section on failed interventions and "zombie ideas"
  - Exercise as the only proven intervention
  - Located at `/articles/longevity-interventions`
- Article added to homepage grid, articles index, command palette, and header menu

## [2.3.0] - 2024-12-11

### Changed
- **Header Menu** - Now opens on hover instead of click for smoother UX
  - 150ms delay on mouse leave prevents accidental closing
  - Click still works for mobile/touch devices
- **Calmer Hover Effects** - Removed zoom/movement from large elements
  - Removed `scale-105` hover effect from article card images
  - Removed `translate-y-1` hover lift from cards (featured, article, newsletter)
  - Removed button translate on hover
  - Cards now only have shadow/glow changes on hover
  - Small elements (arrows, logo "T") retain subtle motion

## [2.2.0] - 2024-12-11

### Added
- **Magazine-Style Navigation** - Complete navigation overhaul for premium editorial experience
  - `SideNav.astro` - Left sidebar with 26+ links organized by Topics, Series, Resources, About
  - Glass dropdown menu in Header with sections, topics grid, and featured articles
  - Animated hamburger-to-X icon toggle
- **New Pages**
  - `articles/index.astro` - Articles index with published and coming soon sections
  - `deep-dives.astro` - Deep dive series landing page
  - `subscribe.astro` - Newsletter subscription page
- **Editorial Imagery** - Premium Unsplash images throughout
  - Featured article hero images
  - Article card thumbnails
  - Deep dive section thumbnails with gradient overlays
  - Thematically relevant images (meditation for mental health, food for nutrition, etc.)

### Changed
- Header now uses glass dropdown menu instead of simple "Articles" link
- Unified stone-900/50 gradient overlays on all images for consistency
- Updated image quality parameter (&q=80) across all Unsplash URLs

## [2.1.0] - 2024-12-11

### Added
- **Content Collections** - Type-safe article management using Astro's content collections
  - `src/content/config.ts` - Schema definition with Zod validation
  - `src/content/articles/*.json` - Article metadata (title, description, tags, etc.)
  - Type-safe article queries with `getCollection()`
- **SEO Component** - Rich structured data for search engines
  - JSON-LD schema generation (Article, WebSite, Organization, BreadcrumbList)
  - Automatic schema injection into article pages
- **Reusable Components**
  - `ArticleCard.astro` - Configurable article preview cards with View Transition support
  - `Newsletter.astro` - Reusable newsletter signup section with form handling
  - `Breadcrumbs.astro` - Navigation breadcrumbs with responsive truncation
- **Utility Functions**
  - `src/utils/reading-time.ts` - Calculate reading time from content
  - `src/utils/articles.ts` - Article collection helpers (getArticles, getRelatedArticles, etc.)

### Changed
- **Improved View Transitions**
  - Custom fade/slide animations per element
  - Article-specific transition names for smoother morphing
  - Custom CSS keyframes for article title transitions
- **ArticleLayout Enhancements**
  - Now accepts `tags` and `slug` props for better SEO
  - Uses Newsletter component instead of inline markup
  - Integrated SEO component for structured data
- **BaseLayout Updates**
  - Added `head` slot for injecting additional head content (SEO schemas, etc.)

## [2.0.0] - 2024-12-11

### Changed
- **MAJOR: Migrated from Vite to Astro** - Complete architecture overhaul for premium editorial UX
  - Zero JavaScript by default for static content (islands architecture)
  - Native View Transitions API for smooth page navigation
  - React islands for interactive components only

### Added
- **Command Palette (⌘K)** - Site-wide navigation using `cmdk` library
  - Search articles, sections, and pages
  - Quick actions: theme toggle, share, print
  - Recently used items tracking
  - Full keyboard navigation (↑↓ Enter Esc)
- **Floating Table of Contents** - Article navigation with scroll spy
  - Appears after scrolling past hero
  - Highlights current section via IntersectionObserver
  - Collapses to pill on mobile showing current section name
- **View Transitions** - Smooth morphing between pages
  - Logo and header elements persist across navigation
  - Theme state preserved during transitions
- **Reusable ArticleLayout.astro** - DRY article template with slots for feature image, tags, and related content

### Architecture
- New file structure under `src/`:
  - `src/layouts/BaseLayout.astro` - Main layout with View Transitions
  - `src/layouts/ArticleLayout.astro` - Reusable article template
  - `src/components/Header.astro` - Navigation (home/article variants)
  - `src/components/Footer.astro` - Site footer
  - `src/components/CommandPalette.tsx` - React command palette
  - `src/components/FloatingTOC.astro` - Floating table of contents
  - `src/pages/index.astro` - Homepage
  - `src/pages/articles/*.astro` - Article pages
  - `src/styles/global.css` - Tailwind + custom styles
- Updated dependencies: Astro v5, React 19, cmdk v1.1.1
- Dev server now runs on port 4321

## [1.0.7] - 2024-12-10

### Changed
- **Article Content Overhaul**: Rewrote both articles to faithfully match source documents
  - `mirtazapine-guide.html`: Now reflects "Mirtazapine: The Quiet Overachiever of Modern Psychopharmacology" source with all clinical data (400x overdose survival, 89 overdose cases with no deaths, Phase III nausea trials, etc.)
  - `nicotine-research.html`: Now reflects "Nicotine's Promising Health Benefits" source with all research statistics (40-60% Parkinson's reduction, 46% memory recovery, 41 meta-analysis studies, etc.)
- Added prominent medical disclaimer to nicotine article
- Updated article dates to December 2025
- Updated CLAUDE.md to reflect current architecture (removed Lenis/SplitType references)

### Fixed
- Fixed invisible body text on article pages (initAnimations not called when no loader present)

## [1.0.6] - 2024-12-10

### Added
- **SEO & Social Sharing**
  - Open Graph meta tags for rich social media previews
  - Twitter Card meta tags
  - Theme color meta tags for browser UI theming
  - Canonical URLs for articles
  - Keywords meta tag
- **Accessibility Enhancements**
  - Skip link for keyboard navigation ("Skip to main content")
  - ARIA labels on progress bars and interactive elements
  - Enhanced focus-visible states for keyboard users
  - `prefers-reduced-motion` support across all animations
  - Semantic `<main>` wrapper for content
- **Mobile Experience**
  - 44px minimum touch targets for all interactive elements
  - Safe area inset support for notched devices (iPhone, etc.)
  - iOS momentum scrolling on scroll containers
  - Prevented text selection on buttons and cards
- **PWA Support**
  - Added `manifest.json` for Progressive Web App
  - Apple touch icon support
- **Print Stylesheet**
  - Hide navigation, loader, and decorative elements
  - Show URLs after links in print

### Changed
- Updated README with accurate tech stack (removed Lenis references)
- Improved article page meta tags with article-specific Open Graph data

## [1.0.5] - 2024-12-10

### Changed
- **MAJOR Performance Overhaul**: Removed Lenis scroll hijacking for native browser scroll
  - Sites like Nutrafol, Vanity Fair, Washington Post use native scroll - now we do too
  - Eliminated JS scroll synchronization overhead for instant 60fps scrolling
- Replaced GSAP ScrollTrigger with IntersectionObserver for reveal animations
  - CSS transitions handle animations (GPU-accelerated)
  - IntersectionObserver triggers class additions only
- Converted scroll event listeners to passive with requestAnimationFrame batching
- Removed SplitType dependency (text animations now CSS-only)
- GSAP now only used for:
  - Hero entrance animation (complex, one-time)
  - Counter number animation (innerText tweening)

### Removed
- Lenis smooth scroll library (~2kb saved)
- SplitType library
- GSAP ScrollTrigger plugin (scroll animations now CSS-based)
- Parallax effects (minor visual, major performance cost)
- Magnetic button GSAP animations (replaced with CSS transform)

### Fixed
- Added `prefers-reduced-motion` media query for accessibility
- Passive scroll listeners prevent blocking main thread

## [1.0.4] - 2024-12-10

### Fixed
- Removed all dead `href="#"` links throughout the site
- Converted placeholder article cards to non-clickable "Coming Soon" cards with badges
- Changed navigation links to scroll to actual page sections (#featured, #latest, #deep-dives, #newsletter)
- Changed category filter chips from links to buttons (proper UI pattern)
- Converted article tags from links to non-clickable labels
- Simplified footer to only include working links
- Fixed mobile menu to navigate to real sections
- Cleaned up search overlay to only show existing articles

### Changed
- Removed social media icons from footer (no active accounts)
- Simplified article page footers with medical disclaimer
- Deep dives section now shows "Coming Soon" labels
- Related articles sections now link to real articles or show "Coming Soon" badges

## [1.0.3] - 2024-12-10

### Added
- New article: "Nicotine's Promising Health Benefits: A Comprehensive Research Summary"
  - Covers neurodegenerative disease protection (Parkinson's, Alzheimer's)
  - Cognitive enhancement research findings
  - Anti-inflammatory effects and ulcerative colitis
  - Mood disorders (late-life depression, ADHD)
  - Schizophrenia symptom management
  - Metabolic effects and weight regulation
  - Other therapeutic applications (Tourette's, sleep apnea, wound healing)
- Added nicotine article to homepage "Latest Stories" grid
- Added nicotine article to search trending topics

### Changed
- Updated vite.config.js with new article entry point
- Updated trending searches in search overlay

## [1.0.2] - 2024-12-10

### Added
- Deployed to Vercel with auto-deployment from GitHub
- Live site: https://tune-health-mdt774sf1-krimptons-projects.vercel.app

### Changed
- Updated README.md with live site URL and deployment info

## [1.0.1] - 2024-12-10

### Fixed
- Removed `group` from `@apply` directive in `.article-card` (Tailwind build error)
- Fixed circular dependency with `visible` utility in `.back-to-top.visible`
- Fixed circular dependency with `visible` utility in `.search-overlay.active`
- Replaced invalid `bg-stone-50/98` with raw CSS `rgb(250 250 249 / 0.98)`

### Changed
- **Performance**: Reduced Lenis scroll duration from 1.2s to 0.8s
- **Performance**: Increased wheel multiplier for snappier scroll response
- **Performance**: Removed duplicate article card hover effects (CSS handles it)
- **Performance**: Removed infinite newsletter card float animations
- **Performance**: Reduced hero glow blur from `blur-[120px]` to `blur-3xl`
- **Performance**: Reduced nav header blur from `backdrop-blur-xl` to `backdrop-blur-md`
- **Performance**: Removed `backdrop-blur-lg` from search overlay
- **Performance**: Reduced glass effect blur intensity

### Added
- Created CLAUDE.md with development guidelines
- Created README.md with project documentation
- Created CHANGELOG.md for version tracking

## [1.0.0] - 2024-12-10

### Added
- Initial project setup with Vite, Tailwind CSS, GSAP
- Homepage with hero section, featured articles, category navigation
- Article page template (mirtazapine-guide.html)
- Dark/light theme toggle with localStorage persistence
- Smooth scroll with Lenis
- GSAP scroll-triggered animations
- Mobile navigation menu
- Search overlay
- Newsletter subscription form
- Back to top button
- Scroll progress indicator

---

## Changelog Guidelines

When updating this file:

1. **Add entries under `[Unreleased]`** for ongoing work
2. **Move to versioned section** when releasing
3. **Use these categories**:
   - `Added` - New features
   - `Changed` - Changes to existing functionality
   - `Deprecated` - Features to be removed
   - `Removed` - Removed features
   - `Fixed` - Bug fixes
   - `Security` - Vulnerability fixes
4. **Include date** in ISO format (YYYY-MM-DD)
5. **Be specific** - mention file names and what exactly changed
