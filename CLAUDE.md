# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

alumi news is a premium health and wellness editorial website built with **Astro**, Tailwind CSS, and React islands for interactivity. The site features a magazine-style design with articles on mental health, nutrition, fitness, sleep science, and longevity.

## AI Model Policy (CRITICAL — read before touching any pipeline code)

**NEVER change model IDs based on your training data.** Models change monthly. Your training data is always stale.

All model selections are centralized in `supabase/functions/_shared/constants.ts` → `MODELS` object. Every pipeline function imports from there. **No model IDs should appear as string literals anywhere else in pipeline code.**

If you need to change a model:
1. **Do a web search** to verify the model ID actually exists RIGHT NOW
2. Update ONLY the `MODELS` object in `constants.ts`
3. Update `PRICING` and `MODEL_PROVIDERS` tables in the same file
4. All pipeline functions automatically pick up the change via imports

If you see a hardcoded model string in a pipeline function, replace it with the appropriate `MODELS.*` constant. Never introduce new hardcoded model strings.

## Development Commands

```bash
npm install      # Install dependencies (required before first run)
npm run dev      # Start Astro development server on port 4321
npm run build    # Build for production (outputs to dist/)
npm run preview  # Preview production build
```

## Architecture

### Build System
- **Astro v5** with `output: 'server'` (full SSR via `@astrojs/vercel` serverless adapter)
- **React** for interactive components (Command Palette, Admin Editor)
- **Tailwind CSS** with PostCSS for styling
- **View Transitions API** for smooth page navigation
- **Supabase PostgreSQL** for article storage, queried at request time via SSR
- **Supabase Edge Functions** for AI article processing and DB publishing
- **Sitemap**: custom SSR endpoint (not `@astrojs/sitemap` integration)
- Node version specified in `.nvmrc`

### Core Libraries
- **Astro**: SSR site with View Transitions, Supabase data layer
- **React + cmdk**: Command palette (⌘K) for site-wide navigation
- **React**: Admin publishing portal (ArticleEditor island)
- **IntersectionObserver**: CSS-triggered reveal animations and scroll spy
- **@astrojs/rss**: RSS feed generation
- **Zod**: Schema validation
- **mammoth**: DOCX file parsing in admin portal

### File Structure
```
src/
├── lib/
│   └── supabase.ts           # Server-side Supabase client (used by all SSR pages)
├── layouts/
│   ├── BaseLayout.astro      # Main layout with View Transitions
│   └── ArticleLayout.astro   # Reusable article template (auto-fetches related articles)
├── components/
│   ├── Header.astro          # Navigation with glass dropdown menu (home + article variants, both with full menu)
│   ├── MenuDropdownContent.astro  # Shared dropdown content (extracted from Header to DRY both variants)
│   ├── TopicNav.astro        # Domain-grouped topic navigation bar (Mind/Body/Medicine/Environment) with per-category dropdowns
│   ├── Footer.astro          # Site footer
│   ├── SideNav.astro         # Magazine-style sidebar (collection-driven topics, series, featured)
│   ├── MobileNav.astro       # Fixed bottom nav bar for touch devices (Home, Articles, Search, Saved, Series)
│   ├── QuickNav.astro        # Floating quick navigation pill with keyboard shortcuts
│   ├── CommandPalette.tsx    # React command palette (dynamic via window injection)
│   ├── CommandPaletteWrapper.astro  # Injects article data for React island
│   ├── FloatingTOC.astro     # Floating table of contents with scroll spy
│   ├── ArticleCard.astro     # Reusable article preview cards
│   ├── Newsletter.astro      # Newsletter signup section (→ Supabase + Beehiiv if configured)
│   ├── Breadcrumbs.astro     # Navigation breadcrumbs
│   ├── SEO.astro             # JSON-LD structured data
│   ├── ArticleCTA.astro      # Category-contextual app CTA (article end)
│   ├── AppPromo.astro        # Homepage alumi Health section (4-feature grid)
│   ├── ShareButtons.astro    # 8-platform share (X, LinkedIn, Facebook, Reddit, Bluesky, WhatsApp, Email, copy) + Web Share API
│   ├── FloatingShareBar.astro # Sticky vertical share sidebar on article pages (desktop xl+)
│   ├── HighlightShare.astro  # Select text to share quote popup (X, Bluesky, copy)
│   ├── SeriesNav.astro       # Series prev/next navigation with progress dots
│   ├── AudioNarration.astro  # ElevenLabs TTS intro narration (speaker icon, localStorage preference)
│   ├── BookmarkButton.astro  # localStorage reading list / bookmark toggle
│   ├── ContinueReading.astro # Homepage "Continue Reading" section (localStorage scroll tracking)
│   ├── ReadingProgressTracker.astro  # Tracks per-article scroll progress in localStorage
│   └── admin/
│       ├── PipelineMonitor.tsx   # Pipeline tab React island
│       ├── ArticlesManager.tsx   # Articles tab React island
│       ├── AgentsPanel.tsx       # AI Agents tab React island
│       ├── ArticleEditor.tsx     # New article editor React component
│       ├── SocialDashboard.tsx   # Social media dashboard React island (Bloomberg-inspired)
│       ├── ConfirmModal.tsx      # Shared confirm dialog
│       └── types.ts              # Shared admin types, pipeline config, status maps
├── pages/
│   ├── index.astro           # Homepage (collection-driven)
│   ├── deep-dives.astro      # Deep dive series page (collection-driven)
│   ├── about.astro           # About / mission / editorial standards
│   ├── howwewrite.astro      # Editorial manual (pipeline transparency, voice standards)
│   ├── start-here.astro      # Onboarding page: 5 handpicked articles + domain browser
│   ├── 404.astro             # Custom 404 page
│   ├── rss.xml.ts            # RSS feed (via @astrojs/rss)
│   ├── reading-list.astro    # Bookmarked articles page (reads localStorage)
│   ├── subscribe.astro       # Newsletter subscription page
│   ├── api/
│   │   └── subscribe.ts      # Newsletter API: Supabase upsert + Beehiiv forward (if BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID set)
│   ├── admin/
│   │   ├── login.astro       # Admin token login (SSR)
│   │   ├── index.astro       # Admin dashboard (SSR)
│   │   ├── new.astro         # New article editor (SSR)
│   │   └── edit/[slug].astro # Article edit page (SSR)
│   ├── topics/
│   │   └── [slug].astro      # Category landing pages (9 pages: gradient hero, featured article, sorted grid)
│   ├── collections/
│   │   ├── index.astro       # Collections index page
│   │   └── [slug].astro      # Curated reading lists (5 collections with share buttons)
│   └── articles/
│       ├── index.astro       # Articles index page (Supabase query)
│       └── [slug].astro      # Dynamic article route (SSR — fetches from Supabase at request time)
├── middleware.ts              # Auth gate for /admin routes
├── utils/
│   ├── articles.ts           # Article query helpers (Supabase), gradient styles, category utils
│   ├── collections.ts        # Curated collection definitions
│   ├── funnel.ts             # Category-to-feature mapping, UTM link builder
│   └── reading-time.ts       # Reading time calculation
└── styles/
    ├── global.css            # Tailwind directives + custom styles
    └── admin.css             # Admin portal styles (source copy — public/admin.css is the served file)
supabase/
├── migrations/               # All schema changes (latest: 20260351_topic_dedup_log.sql)
└── functions/
    ├── _shared/                          # Shared utilities (NOT a deployed function)
    │   ├── api-clients.ts                # claude(), gemini(), grok(), openai() + generateWithFallback()
    │   ├── astro.ts                      # todayISO(), escapeAttr() (assembleAstroFile deprecated — SSR reads from DB)
    │   ├── constants.ts                  # PRICING, MODEL_PROVIDERS, MODEL_BYLINES, chains
    │   ├── cors.ts                       # CORS headers, json() helper
    │   ├── db.ts                         # supabase(), addCostToLog(), safeStage(), parseScore()
    │   ├── dedup.ts                      # extractFingerprint(), isDuplicate(), buildFingerprints() + topic_dedup_log
    │   ├── featured.ts                   # rotateFeatured()
    │   ├── github.ts                     # GitHub utilities (legacy — article publishing now uses DB directly)
    │   ├── pubmed.ts                     # verifyPubMedCitations()
    │   ├── types.ts                      # ApiResult, ApiUsage, VoiceAudit interfaces
    │   ├── voice-audit.ts               # auditVoiceQuality()
    │   └── social-clients.ts            # Bluesky (AT Protocol), Reddit (OAuth2), Mastodon, platform router
    │
    ├── stage-research/                   # Stage 1: Gemini 2.5 Pro + Google Search → Sonnet fallback
    ├── stage-editor/                     # Stage 2: Sonnet → Gemini 3.1 Pro. Editor brief — archetype/tone
    ├── stage-write/                      # Stage 3: Gemini 3.1 Pro → Sonnet (fallback path only — hybrid model pauses here)
    ├── stage-independence/               # Stage 4: Grok 4 adversarial review + Flash corrections + PubMed
    ├── stage-qc/                         # Stage 5: Flash → Sonnet. QC — publish/rewrite_voice/revise/kill
    ├── stage-voice-rewrite/              # Stage 6: Sonnet → Gemini → GPT-5.4 (skipped for human-written articles)
    ├── stage-copy-edit/                  # Stage 7: Sonnet → Gemini Pro. Conservative headline + header polish (confidence ≥8 only)
    ├── stage-publish/                    # Stage 8: DB publish + GPT Image illustration + ElevenLabs narration + featured rotation
    ├── pipeline-scout/                   # Scout — 3x/day topic discovery (all Gemini + Google Search)
    ├── pipeline-pinger/                  # Pinger — 2x/hour breaking news detector (Gemini Flash/Grok/PubMed RSS)
    ├── pipeline-admin/                   # Admin: status, queue CRUD, retry, kill, get-brief, submit-article, improve-article, merge
    │
    ├── topic-merge/                      # AI topic deduplication + merge (GPT-5.4 analyze, Sonnet merge)
    │
    ├── articles-api/                     # CRUD for articles table
    ├── process-article/                  # Manual article generation
    ├── refine-article/                   # Chat-based article refinement
    ├── publish-article/                  # DB upsert — publish article to database
    ├── delete-article/                   # Remove article from database
    ├── fetch-article/                    # Fetch article content from database
    ├── generate-illustration/            # AI illustration (GPT Image 1)
    ├── generate-narration/               # ElevenLabs TTS narration of article description
    ├── editorial-qc/                     # Collection-wide QC
    │
    ├── social-engine/                    # Content Brief generator — strategic brain for social media
    ├── social-writer/                    # Content factory — generates platform-native post text per persona
    ├── social-poster/                    # Dispatcher — posts scheduled content to platform APIs
    ├── social-planner/                   # Daily editorial meeting — mines catalog, creates arcs, fills schedule
    ├── social-sync/                      # Engagement feedback — pulls metrics, detects velocity
    └── social-admin/                     # Social dashboard API (status, posts, plan, platforms, setup, triggers)
```

### Article Data

Articles are stored in the Supabase `articles` table and queried at request time via SSR. No file-based content collections — the database is the single source of truth for both the admin CMS and the public site.

```typescript
// src/utils/articles.ts — helper functions for querying articles
import { supabase } from '../lib/supabase';
const { data } = await supabase.from('articles').select('*').eq('status', 'published');
```

All navigation components (homepage, articles index, SideNav, CommandPalette, related articles) query Supabase directly. New articles appear on the live site immediately after being published to the database — no git commit or rebuild needed.

### Styling Approach
- Tailwind utility classes with custom component layer in `src/styles/global.css`
- Dark mode via `class` strategy. Three-state toggle: system (default, follows `prefers-color-scheme` with live listener) → light → dark. Icons: monitor/sun/moon. `localStorage.theme` stores `'light'` or `'dark'`; absent key = system
- **Warm color palette** (public site):
  - `black` = `#1b1a18` (HSL 47°, 3%, 10%) - warm dark gray
  - `white` = `#e7e6e3` (HSL 47°, 3%, 90%) - warm off-white
  - Primary: red tones (`primary-500` = `#ef4444`)
- **Admin design system** (`admin.css`): CSS custom properties (`--admin-bg: #0f0e0c`, `--admin-surface`, `--admin-border`, `--admin-accent`, etc.). Glass morphism with `backdrop-filter: blur()`, rgba-based borders, layered shadow system (`--admin-shadow-sm/md/lg`), border-radius scale (12px/8px/6px). All admin inline styles use the same palette — never reference old hex values like `#44403c` or `#292524`
- Custom typography: Playfair Display (headings), Inter (sans), Crimson Pro (body)
- Custom easing: `ease-editorial` = `cubic-bezier(0.22, 1, 0.36, 1)`
- **Category-based gradient art**: `getArticleGradientStyle()` in `src/utils/articles.ts` generates CSS gradients per category for card visuals — no stock photos, no dynamic Tailwind classes (which get purged)

### Key Features

#### Glass Dropdown Menu (Header)
- Opens on hover (mouseenter), closes on mouse leave with 150ms delay
- Click also works for mobile/touch devices. Outside-click closes menu
- Contains: Sections (4 with icons + active state), Topics (dynamic from `getCategories()`), Latest articles (3 with badges)
- Both `home` and `article` variants have full dropdown menu (article variant also shows Home/Articles breadcrumbs)
- Glass morphism effect with `backdrop-blur-xl`
- Animated hamburger-to-X icon

#### SideNav (Magazine Sidebar)
- Reveals on left edge hover. Present on **all pages** including articles
- Links organized by: Sections, Topics, Featured, Series, More
- **All sections are collection-driven**: Topics from `getCategories()`, Series from `getAllSeries()`, Featured from latest articles
- Custom scrollbar, badges for "New" articles
- Search and theme toggle buttons

#### Mobile Bottom Navigation
- Fixed 5-item bar: Home, Articles, Search, Saved (Reading List), Series (Deep Dives)
- Only shows on touch devices (`@media (pointer: coarse)`) under 1024px
- Active state highlighting for current page
- Auto-hides on scroll down, reappears on scroll up
- Safe-area-aware (`env(safe-area-inset-bottom)`)
- Hidden in print stylesheet

#### Command Palette (⌘K)
- React component using `cmdk` library
- **Collection-driven**: article data injected from Astro via `window.__ALUMI_ARTICLES__`
- Site-wide search: articles, sections, pages
- Actions: cycle theme (system/light/dark), share, print
- Recently used items tracking
- Keyboard navigation (↑↓ Enter Esc)

#### Admin Mission Control (/admin)
- **Glass design system**: CSS served from `public/admin.css` (SSR pages cannot use frontmatter CSS imports — Astro silently drops them). CSS custom properties (`--admin-bg`, `--admin-surface`, `--admin-border`, `--admin-accent`, etc.). Glass morphism header/cards/modals, ambient gradient glow background, layered shadows, `cubic-bezier(0.22, 1, 0.36, 1)` easing, border-radius scale (12px/8px/6px). All React component inline styles use the same palette. **IMPORTANT**: when adding new admin pages, always link CSS via `<link rel="stylesheet" href="/admin.css">` in `<head>`, never via frontmatter import
- **Login**: glass card with animated gradient orbs, entrance animation, "mission control" pill badge
- Protected by `ADMIN_TOKEN` cookie (middleware auth gate, server-side only — no `PUBLIC_` prefix). Wrong token redirects to `/admin/login?error=1` with inline error display.
- **Dashboard**: 4-column stat grid (Total, Published, Drafts, Featured, Illustrated, Avg Read, Pipeline Spend, $/Article), 4 tab panels with fade-in animation (Pipeline, Articles, AI Agents, Social). Max-width 1400px. Multi-column layouts: Pipeline tab has 2-col grid (queue + published side-by-side), AI Agents tab has 2-col grid (6 sections split). Articles tab is single-column (rows need full width for inline editing). Social tab has Bloomberg-inspired data-dense layout with platform activity matrix, post feed, content plan, platform health cards, Setup tab with credential guide + architecture diagram
- **Pipeline tab** (React island: `PipelineMonitor`):
  - 8-stage visual pipeline: Research (Gemini 2.5 Pro + Search) → Editor (Sonnet → Gemini) → **PAUSE for Opus writing** → Independence (Grok 4) → QC (Flash → Sonnet) → Voice Polish (Sonnet → Gemini, skipped for human articles) → Copy Edit (Sonnet → Gemini Pro, conservative headline/header polish) → Publish (DB + GPT Image)
  - **Hybrid workflow UI**: editor_approved articles show purple highlight, "Copy Brief for Claude" button (client-side clipboard), "Submit Written Article" textarea + submit button
  - **"Clear All Briefs" button**: one-click kills all stale editor_approved articles
  - **× dismiss button**: on every pipeline card, visible without expanding, hover turns red
  - Real-time polling (15s), "in flight" counter, progress bar to 100 articles
  - **Manual triggers**: individual scout buttons (Gemini / Sonnet / Grok / All 3) + "Produce Now"
  - **Topic Queue with full controls**: Produce, Expedite, Priority ↑↓, Delete, Reset. BREAKING badge for pinger-promoted topics
  - **Upload Article**: three-way toggle — "Topic → Full Chain" (queues for research), "Article → Review → Publish" (independence review entry), "Ready → Art + Publish" (direct publish, skips editorial pipeline). Accepts HTML or Markdown (auto-converted). File upload (.pdf, .md, .docx, .html, .txt) and URL fetch supported
  - Published articles with model pen names, independence/editor scores, cost per article, Edit + View links
  - Failed articles show actual error message
- **Articles tab** (React island: `ArticlesManager`): search, filter (status/category), sort (newest/oldest/A-Z/read time/independence score), inline editing, bulk actions, featured toggle, **Improve button** (sends article back through full pipeline, same slug), Refresh button, independence & editor score display per row
- **AI Agents tab** (React island: `AgentsPanel`): Reader Questions (mines alumi Health chat data), **Breaking News Pinger** (recent signals with source color coding, PROMOTED badges, refresh button), Cron Schedule (6 active jobs), editorial QC, illustration agent, Database & Maintenance, editor decision log
- **New Article Editor** (`/admin/new`): drag-and-drop upload, AI generation, chat refinement, live preview, one-click publish
- **Edit page** (`/admin/edit/[slug]`): metadata/content/AI refine tabs, autosave with 2s debounce + indicator, Cmd+S keyboard shortcut, score badges (independence/editor), live preview auto-refresh, Publish + Delete buttons, XSS-safe chat rendering

#### Hybrid AI Newsroom (v17 — Human + AI)

AI handles discovery, research, editorial judgment, and quality control. Human writes with Opus via Max subscription. ~$0.13/article.

**Job 1 — Scout** (3 crons/day → `pipeline-scout`, differentiated editorial desks):
- `scout-gemini` 6am UTC — **Trending Desk**: Google Search grounding for real-time trending. Must cite something from last 7 days. News-driven topics, Google Trends spikes, journal publications, FDA actions
- `scout-sonnet` 2pm UTC — **Investigation Desk**: "wait, really?" stories. Evidence contradicting conventional wisdom, follow-the-money investigations, industry-funded consensus challenged by independent data
- `scout-grok` 10pm UTC — **Contrarian Desk**: X/Twitter access. Stories mainstream outlets won't cover. Both-sides-dirty-hands investigations, regulatory capture, uncomfortable truths
Each finds 20 topics with mandatory recency gate + editorial feedback loop. Three-layer dedup: (1) word overlap with bigrams, (2) AI semantic dedup via Flash, (3) recently rejected topics fed back as "don't re-suggest." ~$0.15/day total.

**Job 2 — Pipeline Dispatch** (cron: `*/5 * * * *`, every 5 min → SQL function `dispatch_pipeline_stage()`):
Safety-net cron only — recovers stuck articles and advances in-progress stages. **Does NOT auto-pick from queue.** Admin must click "Produce" on a topic to start any article. Chain-dispatch via `chain_dispatch()` SQL → `pg_net.http_post()` handles post-produce flow directly.

**Hybrid pipeline** (AI stages + human writing):
  1. **Research** (~30-80s): Gemini 2.5 Pro + Google Search grounding → Sonnet fallback. Deep research for queue topics.
  2. **Editor Brief** (~30-60s): Flash → Sonnet fallback. Assigns archetype (7 types), tone preset (10 options), density, pacing.
  3. **PAUSE at `editor_approved`** — Article waits for human writing. Dashboard shows purple-highlighted card with:
     - "Copy Brief for Claude" button (fetches formatted prompt via `pipeline-admin` `get-brief` action)
     - "Submit Written Article" form (accepts HTML, resumes pipeline via `submit-article` action)
  4. **Human writes with Opus** — User pastes brief to Claude Mac/Code, Opus writes the article ($0 via Max subscription). User pastes HTML back into admin dashboard.
  5. **Grok Independence Review** (~30-60s): Grok 4 adversarial review. Flash applies corrections. PubMed verification in parallel.
  6. **QC** (~30s): Flash → Sonnet fallback. Publish/rewrite_voice/revise/kill. Mechanical voice audit.
  7. **Voice Rewrite** (if QC triggers): Sonnet → Gemini → GPT-5.4 → Grok. Voice-only prose rewrite.
  8. **Copy Edit** (~15-30s): Sonnet → Gemini Pro. Conservative headline + section header polish. Confidence threshold ≥8. Failures skip gracefully to publish.
  9. **Publish** (~30s): Database publish (article_html + metadata to Supabase articles table). GPT Image illustration. ElevenLabs narration. Featured rotation. Articles appear instantly on the SSR site — no git commit or rebuild needed.

**Architecture (split pipeline, SQL dispatch)**:
Each stage is its own edge function with shared utilities in `_shared/`. The SQL function `dispatch_pipeline_stage()` (called by pg_cron) recovers stuck articles and advances in-progress stages via `pg_net.http_post()` (fire-and-forget). **It never auto-picks from the queue** — admin must click "Produce" to start any article. `editor_approved` is EXCLUDED from auto-dispatch — articles pause there for human writing. Dead code deleted: `daily-article-agent/` (old monolith) and `pipeline-orchestrator/` (replaced by SQL dispatch).

**Chain-dispatch (all user-triggered flows)**: All stages fire the next directly via `chain_dispatch()` SQL → `pg_net.http_post()`. No cron waits.
- Post-submit: submit-article → independence → QC → [voice rewrite if needed] → copy edit → publish (seconds to publish)
- Manual produce: produce-topic → research → editor brief → pause
**Safety-net cron**: `dispatch_pipeline_stage()` runs every 5 min (`*/5 * * * *`) to recover stuck articles and advance in-progress stages. Does NOT pick from queue.
**Manual production only**: Admin clicks "Produce" on a topic → `produce-topic` action → research → editor brief → pause. No auto-production.
**Error handling**: `safeStage()` wrapper + `parseScore()` for safe integer parsing. All stages log errors to DB on failure.
**Model chains**: Writer (fallback path): Gemini 3.1 Pro → Sonnet → GPT-5.4. Editor: Sonnet → Gemini 3.1 Pro. QC: Flash → Sonnet. Voice rewrite: Sonnet → Gemini → GPT-5.4 → Grok. Copy edit: Sonnet → Gemini Pro. Independence revision: Sonnet → Gemini Pro (upgraded from Flash — prose corrections need editorial quality).
**API timeout**: 75s constant (`API_TIMEOUT`).
**Human-article protections**: `_writtenBy: "human-opus"` triggers multi-stage guards: (1) `stage-independence` — Grok reviews + scores but NO prose rewrites (Flash/Sonnet never touch human text), PubMed verifies but logs only; (2) `stage-qc` — skips voice rewrite, force-publishes on revise; (3) `stage-copy-edit` — code-level title lock (no model can change the headline), description changes blocked unless truncated/broken. Never degrades Opus prose.
**Mechanical voice audit**: `auditVoiceQuality()` — 30+ banned phrases, "you" count (min 6), paragraph length (max 3 sentences).
**Editorial independence**: Manually queued topics get "MANDATORY EDITORIAL DIRECTION".
**Three-layer dedup filter**: (1) `isDuplicate()` — bidirectional 35% word overlap + 50% small-set perspective + bigram matching for compound health terms. Stop words are ONLY function words — health-domain words preserved as semantic signal. `buildFingerprints()` includes ALL queue items (incl. skipped), ALL pipeline articles (incl. failed/killed), and `topic_dedup_log` entries. (2) AI semantic dedup — Flash batch-compares candidates against existing articles/queue, catches rephrased duplicates. (3) Editorial feedback — recently killed/deleted topics fed back into scout prompts. Backed by `topic_dedup_log` table for permanent dedup memory (survives topic merges + queue deletes + kills).
**Cost tracking**: every API call logs tokens + USD to `daily_article_log.cost_usd` + `token_usage` (jsonb). ~$0.13/article with hybrid model.

- **Self-learning analytics** (v21): SQL materialized views (`mv_category_performance`, `mv_scout_performance`, `mv_social_performance`) refreshed daily at 4am UTC. `get_editorial_digest()` returns all performance data in one JSONB blob. `_shared/analytics.ts` exports formatters for each stage. Zero AI cost — pure SQL aggregation. Scouts see top articles + per-desk stats; QC sees category baselines; Grok sees bias patterns; social engine/writer get engagement intelligence + learned templates; pinger sees source accuracy. `social_templates` auto-populated from high-performing posts (2x avg engagement). `topic_queue.editor_score` backfilled at publish.
- **Smart featured rotation**: every 6h via independent `pg_cron` job (`featured-rotation`). Uses `updated_at` to track when article became featured (not publish date). Scores: editor quality (25%), recency (30%), independence score (15%), illustration (10%), read time (10%), category diversity (10%). Must have illustration and score >30 to qualify. Standalone `rotate-featured` action works even when pipeline crons are paused.
- **Quality control**: `editorial-qc` reviews full article collection holistically → identifies issues → auto-fixes via `articles-api`
- **Illustration generation**: `generate-illustration` creates editorial art per article with house style prompt + category color palettes → stored in Supabase Storage
- **All secrets** stored in Supabase secrets only — never in code

#### Database-Driven Navigation
- All navigation components query Supabase `articles` table — no hardcoded article references
- Homepage, articles index, SideNav, CommandPalette, and related articles are all dynamic
- New articles auto-appear everywhere immediately after DB publish (SSR — no rebuild needed)
- Homepage limited to 9 grid articles + "Browse all" CTA
- Category filtering is functional on homepage and articles index
- Articles index has real-time search by title, tags, and category

### Database (Supabase PostgreSQL)

Supabase PostgreSQL is the single source of truth for all article content. The SSR site queries the database at request time — no file-based content layer.

**`articles` table schema:**
- `slug` (unique), `title`, `description`, `category`, `tags[]`, `keywords[]`
- `gradient_from`, `gradient_to`, `featured`, `draft`, `coming_soon`
- `read_time`, `publish_date`, `sort_order`, `hero_image`, `hero_image_alt`
- `article_html` (full article body), `article_svg` (deprecated, no longer generated), `toc` (jsonb)
- `source_text` (original source document), `status` (draft/published/archived)
- `independence_score` (Grok), `editor_score`, `pipeline_log_id` (FK to daily_article_log), `narration_url`
- `created_at`, `updated_at`, `published_at`

**Data flow:**
1. New article: Claude generates → saved to database as draft
2. Edits: metadata/content/AI refine → saved to database instantly
3. Publish: updates article in database → SSR site serves latest data immediately (no git commit or rebuild needed)

### Edge Functions (Supabase)

All deployed to the TUNE project (`mvkiornsximonxxitiwr`):

| Function | Purpose | Auth |
|---|---|---|
| `stage-research` | Stage 1: Gemini 2.5 Pro + Google Search grounding → Sonnet fallback | None (called by SQL dispatch) |
| `stage-editor` | Stage 2: Sonnet → Gemini 3.1 Pro. Editor brief — archetype, tone, density, pacing | None (called by SQL dispatch) |
| `stage-write` | Stage 3: Gemini 3.1 Pro → Sonnet → GPT-5.4. Full article (fallback path only — hybrid pauses at editor_approved) | None (called by SQL dispatch) |
| `stage-independence` | Stage 4: Grok 4 adversarial review + Flash corrections + PubMed verification | None (called by SQL dispatch) |
| `stage-qc` | Stage 5: Flash → Sonnet. QC — publish/rewrite_voice/revise/kill. Skips voice rewrite for human-written articles | None (called by SQL dispatch) |
| `stage-voice-rewrite` | Stage 6: Sonnet → Gemini → GPT-5.4 → Grok. Voice-only prose rewrite (skipped for Opus/human articles) | None (called by SQL dispatch) |
| `stage-copy-edit` | Stage 7: Sonnet → Gemini Pro. Conservative headline + section header polish (confidence ≥8 threshold). Failures skip gracefully to publish | None (called by SQL dispatch) |
| `stage-publish` | Stage 8: DB publish + illustration/narration dispatch + featured rotation | None (called by SQL dispatch) |
| `pipeline-scout` | 3x/day topic discovery — all Gemini + Google Search grounding. Trending signals, search demand, "why now" | None (called by pg_cron) |
| `pipeline-pinger` | 2x/hour breaking news detector — rotates Gemini Flash/Grok/PubMed RSS. Corroboration gate | None (called by pg_cron) |
| `pipeline-admin` | Admin API: `status`, `get-brief`, `submit-article` (markdown auto-converted to site HTML), `publish-direct` (skip editorial pipeline → art + narration + publish), `improve-article` (full pipeline re-run, same slug), `produce-topic` (bypasses cap), `produce`, `scout`, `pinger-status`, `retry`, `kill-article`, `queue-topic`, `list-queue`, `update-queue`, `delete-queue`, `backfill-costs`, `rotate-featured`, `merge-analyze`, `merge-execute` | None (rate-limited internally) |
| `articles-api` | CRUD for articles table (list, get, save, delete, seed) | Write ops require ADMIN_TOKEN (Bearer) |
| `process-article` | Claude Sonnet article generation with editorial system prompt | None (rate-limited by Anthropic) |
| `refine-article` | Chat-based article refinement | None |
| `publish-article` | DB upsert — publishes article to Supabase articles table | ADMIN_TOKEN (Bearer) |
| `delete-article` | Removes article from database | ADMIN_TOKEN (Bearer) |
| `fetch-article` | Fetches article content from database | None |
| `generate-narration` | ElevenLabs TTS narration of article description → Supabase Storage | None |
| `generate-illustration` | AI illustration generation (OpenAI GPT Image 1.5) → Supabase Storage | None (rate-limited by OpenAI) |
| `editorial-qc` | Autonomous editorial quality control (Claude audits collection holistically, auto-fixes via other functions) | None |
| `topic-merge` | AI-powered topic deduplication: `analyze` (GPT-5.4 clusters queue semantically) + `merge` (Sonnet synthesizes super-brief) | None (proxied via pipeline-admin) |
| `social-engine` | Content Brief generator — strategic brain for social media. Generates briefs per article with angle registry, choreography, persona assignments. Chains to social-writer | None (chain from stage-publish) |
| `social-writer` | Content factory — takes briefs from social_content_plan, generates platform-native post text per persona using persona-specific AI models. Outputs to social_posts | None (chain from social-engine) |
| `social-poster` | Dispatcher — reads scheduled posts due for posting, calls platform APIs (Bluesky/Reddit/Mastodon), respects choreography + rate limits, exponential backoff | None (called by pg_cron `*/5 * * * *`) |
| `social-planner` | Daily editorial meeting — mines catalog for reshare candidates, creates weekly arcs, selects 4 articles/day, chain-dispatches to social-engine | None (called by pg_cron `0 5 * * *`) |
| `social-sync` | Engagement feedback loop — pulls metrics from platform APIs (last 7 days), updates scores, logs time-series, detects viral velocity (3x avg) | None (called by pg_cron `0 */6 * * *`) |
| `social-admin` | Social dashboard API: `status`, `posts`, `plan`, `platforms`, `arcs`, `angles`, `leaderboard`, `personas`, `skip`, `retry`, `generate`, `run-planner`, `run-writer`, `run-poster`, `run-sync`, `setup-status`, `toggle-platform` | None |

**Deploy commands:**
```bash
supabase functions deploy <function-name> --no-verify-jwt

# Deploy all pipeline functions at once
for fn in stage-research stage-editor stage-write stage-independence stage-qc stage-voice-rewrite stage-copy-edit stage-publish pipeline-scout pipeline-pinger pipeline-admin topic-merge social-engine social-admin; do
  supabase functions deploy $fn --no-verify-jwt
done
```

**Required secrets** (set via `supabase secrets set`):
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ADMIN_TOKEN`
- `GITHUB_TOKEN`, `GITHUB_REPO` (code deploys only — article publishing uses DB directly, not GitHub commits)
- `ELEVENLABS_API_KEY` (ElevenLabs TTS for article narrations — voice `GK8yfgyvbDZaYf0rm78A`, model `eleven_multilingual_v2`)
- `XAI_API_KEY` (Grok 4 for independence review + pinger social trending), `GOOGLE_API_KEY` (Gemini for research, scouts, pinger)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-set by Supabase)

**Vercel environment variables** (public site):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — newsletter subscribe API (server-side)
- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` — Realtime subscriptions in admin dashboard
- `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID` — newsletter forward to Beehiiv (optional; falls back gracefully if not set)
- `ADMIN_TOKEN` — admin dashboard auth gate

**Database tables:**
- `articles` — main content table. Key columns: `slug`, `title`, `description`, `category`, `tags[]`, `keywords[]`, `article_html`, `hero_image`, `status`, `independence_score`, `editor_score`, `pipeline_log_id` (FK to daily_article_log)
- `daily_article_log` — tracks pipeline stages. Key columns: `topic`, `slug`, `title`, `status`, `error`, `research_data` (jsonb), `editor_score`, `grok_score`, `model_used`, `revision_count`, `source` (trending/queue), `stage_started_at`, `cost_usd` (numeric, cumulative per article), `token_usage` (jsonb, per-call breakdown)
- `topic_queue` — editorial topic backlog. Key columns: `topic`, `notes`, `category`, `priority`, `expedite`, `source` (manual/trending/breaking), `status` (queued/assigned/in_progress/completed/skipped), `editor_score`, `research_summary`
- `pinger_signals` — breaking news signal tracking. Key columns: `signal_hash`, `topic`, `source` (gemini_search/grok_social/pubmed_rss), `urgency`, `why_breaking`, `promoted_to_queue`, `queue_id`, `expires_at` (48h auto-cleanup)
- `newsletter_subscribers` — email subscriptions (email unique, subscribed_at, source)
- `topic_dedup_log` — permanent dedup memory for scouts/pinger. Written when topics are merged or deleted. 90-day TTL via pg_cron. Prevents re-suggesting angles that were already explored
- `social_personas` — 4 AI personas (brand/reporter/skeptic/curator) with model assignments, voice prompts, platform arrays
- `social_platform_config` — 14 platforms with desk, tier, rate limits, content formats, API status
- `social_posts` — generated social content with choreography, scheduling, engagement tracking. Realtime-enabled
- `social_content_plan` — daily editorial plans per platform/persona/desk. Realtime-enabled
- `social_angle_registry` — never-repeat angle tracking per article
- `social_arcs` — weekly thematic arcs with recurring series
- `social_engagement_log` — time-series engagement snapshots for velocity detection
- `social_templates` — learned + manual content templates

**Cron schedule** (via `pg_cron` + `pg_net`):
- `scout-gemini`: daily 6am UTC → `pipeline-scout` — Trending Desk (Gemini + Google Search, news-driven, recency gate)
- `scout-sonnet`: daily 2pm UTC → `pipeline-scout` — Investigation Desk (Gemini + Google Search, follow-the-money, evidence contradictions)
- `scout-grok`: daily 10pm UTC → `pipeline-scout` — Contrarian Desk (Grok + X/Twitter, both-sides-dirty-hands)
- `article-produce`: every 5 min (`*/5 * * * *`) → SQL function `dispatch_pipeline_stage()`. Safety net only — recovers stuck articles, advances in-progress stages. Publishing writes to DB only (no git commits). **Does NOT auto-pick from queue** (removed in v12.6). Admin must click "Produce"
- `pinger`: every 30 min (`*/30 * * * *`) → `pipeline-pinger` — rotating breaking news detector (Gemini Flash/:00, PubMed RSS/:30)
- `featured-rotation`: every 6 hours (`0 */6 * * *`) → `pipeline-admin` — independent featured article rotation
- `analytics-refresh`: daily 4am UTC (`0 4 * * *`) → refreshes `mv_category_performance`, `mv_scout_performance`, `mv_social_performance` materialized views for self-learning feedback
- `social-poster`: every 15 min (`*/15 * * * *`) → `social-poster` — dispatch scheduled social posts to platform APIs
- `social-planner`: daily 5am UTC (`0 5 * * *`) → `social-planner` — daily editorial meeting, catalog mining, arc creation
- `social-sync`: every 6 hours (`0 */6 * * *`) → `social-sync` — pull engagement metrics from platform APIs
- Requires `pg_cron` and `pg_net` extensions enabled in Supabase Dashboard > Database > Extensions
- View schedule: `SELECT * FROM cron.job;`
- View run history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

#### User Funnel (alumi Health)

The magazine funnels readers to the **alumi Health** app (`https://tune-sigma.vercel.app`) — an AI-powered health tracking platform (lab OCR, meal analysis, AI analyst, N=1 experiments).

**5 touchpoints** (all link externally with `target="_blank"`):
1. **Article-end CTA** (`ArticleCTA.astro`): category-contextual — maps article topics to relevant app features via `funnel.ts`
2. **Homepage section** (`AppPromo.astro`): 4-feature grid between Mission and Deep Dives
3. **Header nav**: pill-shaped link, hidden on mobile
4. **Footer**: promo bar with "Start Free Trial" button
5. **SideNav**: compact promo card under "App" label

**Configuration**: `src/utils/funnel.ts` — centralized category-to-feature mapping and UTM link builder. All 5 touchpoints read from this single source. To add a new category mapping, update `CATEGORY_FEATURE_MAP`.

**UTM scheme**: `utm_source=alumi-news`, `utm_medium={touchpoint}`, `utm_campaign={category}`, `utm_content={slug}`

#### View Transitions
- Native browser View Transitions API via Astro
- Smooth morphing between pages with custom animations
- `transition:name` for element persistence (e.g., `title-${slug}`)
- Theme persists across transitions via `astro:after-swap`
- Custom fade/slide animations per element

#### Floating TOC (Articles)
- Appears after scrolling past hero
- Highlights current section via IntersectionObserver
- Collapses to pill on mobile showing current section
- Click to navigate to sections

#### Series Navigation
- Articles with `series` field get automatic prev/next navigation (`SeriesNav.astro`)
- Progress dots showing position in series, "Part X of Y" counter
- Deep Dives page (`/deep-dives`) dynamically renders published series from Supabase

#### Social Sharing & Interaction
- `ShareButtons.astro`: 8-platform sharing (X, LinkedIn, Facebook, Reddit, Bluesky, WhatsApp, Email, copy link) with `variant` prop (`"inline"` | `"vertical"`) and native Web Share API on mobile. Uses `Astro.site` for correct URL resolution. Each platform icon has brand-color hover state
- `FloatingShareBar.astro`: sticky vertical share bar fixed to left edge of article pages on xl+ screens. Glass morphism styling, appears when `#article-content` is in view, hides at footer
- `HighlightShare.astro`: when users select 10–400 chars of article text, a dark tooltip popup appears near the selection with options to share the quote on X, Bluesky, or copy with `"quote" — alumi news` attribution. Only triggers within `#article-content`
- `BookmarkButton.astro`: localStorage-based reading list toggle per article
- `/reading-list` page: shows all bookmarked articles from localStorage with article cards, per-item remove, and "Clear all". Linked from SideNav and Footer
- **Social follow links** in Footer: RSS, X/Twitter, Bluesky buttons with hover-lift effect

#### SEO & Structured Data
- JSON-LD schema generation (Article, WebSite, Organization, BreadcrumbList)
- Per-article OG images from `heroImage` field (Supabase Storage)
- Open Graph and Twitter Card meta tags
- Canonical URLs
- RSS feed at `/rss.xml` via `@astrojs/rss`
- RSS autodiscovery `<link rel="alternate">` in BaseLayout `<head>`
- Sitemap via custom SSR endpoint (queries Supabase for all published articles)
- Breadcrumbs on article pages (Home > Articles > Category)
- Custom 404 page with article recommendations

### CSS/Tailwind Guidelines

When writing CSS in this project, follow these rules to avoid build errors:

#### Avoid in @apply directives
- `group` - Add directly in HTML class attribute instead
- `visible`/`invisible` when the selector contains `.visible` or `.invisible` (circular dependency)
- Non-standard opacity values like `/98` - use raw CSS instead

#### Correct patterns
```css
/* BAD - causes circular dependency */
.back-to-top.visible {
  @apply visible;
}

/* GOOD - use raw CSS */
.back-to-top.visible {
  visibility: visible;
}

/* BAD - /98 doesn't exist */
.overlay {
  @apply bg-stone-50/98;
}

/* GOOD - use raw CSS for non-standard values */
.overlay {
  background-color: rgb(250 250 249 / 0.98);
}
```

### Performance considerations
- Astro outputs zero JS by default for static content
- React islands only hydrate interactive components (`client:load`)
- SSR pages query Supabase at request time — use appropriate caching headers where possible
- Prefer CSS hover effects over JS for simple transforms
- Limit `backdrop-blur` usage - use `backdrop-blur-sm` or `backdrop-blur-md` max
- Use higher opacity backgrounds instead of heavy blur effects

### iOS / Mobile considerations
- **Reveal animations**: on touch devices (`@media (pointer: coarse)`), transforms are disabled — opacity-only transitions prevent iOS Safari scroll-back-up
- **Input font-size**: all form inputs must be 16px+ (`text-base`) to prevent iOS auto-zoom
- **Viewport units**: use `100dvh` not `100vh` (admin.css, global.css) — `100vh` includes iOS browser chrome
- **SideNav trigger**: hidden on touch devices to avoid conflicting with iOS back-swipe gesture
- **Body scroll lock**: `body.menu-open { overflow: hidden }` prevents background scroll when mobile menu is open
- **Safe areas**: `env(safe-area-inset-*)` used for notch/home indicator (back-to-top, Command Palette)
- **Touch targets**: 44px minimum on `@media (pointer: coarse)` for all interactive elements
- **Scroll progress bar**: uses `visualViewport.height` instead of `innerHeight` to handle iOS address bar changes
- **Security headers**: `vercel.json` adds X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, Content-Security-Policy

### UX Guidelines
- **Hover effects on large elements**: Only use shadow/glow changes, NO scale or translate
  - Cards (article, featured, newsletter) should not zoom or move on hover
  - Exhausting when many large areas move simultaneously
- **Small UI elements**: Subtle scale/translate OK (arrows, icons, logo letters)
- **Menu dropdowns**: Prefer hover-to-open over click for desktop

## Documentation Requirements

**Always update these files when making changes:**

1. **CHANGELOG.md** - Log all changes with date, description, and category
2. **README.md** - Update if adding new features, commands, or dependencies
