# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

alumi news is a premium health and wellness editorial website built with **Astro**, Tailwind CSS, and React islands for interactivity. The site features a magazine-style design with articles on mental health, nutrition, fitness, sleep science, and longevity.

## Development Commands

```bash
npm install      # Install dependencies (required before first run)
npm run dev      # Start Astro development server on port 4321
npm run build    # Build for production (outputs to dist/)
npm run preview  # Preview production build
```

## Architecture

### Build System
- **Astro v5** with SSR support via `@astrojs/vercel` adapter
- **React** for interactive components (Command Palette, Admin Editor)
- **Tailwind CSS** with PostCSS for styling
- **View Transitions API** for smooth page navigation
- **Content Collections** for type-safe article management
- **Supabase Edge Functions** for AI article processing and GitHub publishing
- Node version specified in `.nvmrc`

### Core Libraries
- **Astro**: Static site generation with View Transitions and Content Collections
- **React + cmdk**: Command palette (⌘K) for site-wide navigation
- **React**: Admin publishing portal (ArticleEditor island)
- **IntersectionObserver**: CSS-triggered reveal animations and scroll spy
- **@astrojs/rss**: RSS feed generation
- **@astrojs/sitemap**: Automatic sitemap generation
- **Zod**: Schema validation for content collections
- **mammoth**: DOCX file parsing in admin portal

### File Structure
```
src/
├── content/
│   ├── config.ts             # Content collection schema (Zod)
│   └── articles/             # Article metadata (JSON) - 79 published articles
├── layouts/
│   ├── BaseLayout.astro      # Main layout with View Transitions
│   └── ArticleLayout.astro   # Reusable article template (auto-fetches related articles)
├── components/
│   ├── Header.astro          # Navigation with glass dropdown menu (home + article variants, both with full menu)
│   ├── MenuDropdownContent.astro  # Shared dropdown content (extracted from Header to DRY both variants)
│   ├── Footer.astro          # Site footer
│   ├── SideNav.astro         # Magazine-style sidebar (collection-driven topics, series, featured)
│   ├── MobileNav.astro       # Fixed bottom nav bar for touch devices (Home, Articles, Search, Saved, Series)
│   ├── CommandPalette.tsx    # React command palette (dynamic via window injection)
│   ├── CommandPaletteWrapper.astro  # Injects article data for React island
│   ├── FloatingTOC.astro     # Floating table of contents with scroll spy
│   ├── ArticleCard.astro     # Reusable article preview cards
│   ├── Newsletter.astro      # Newsletter signup section
│   ├── Breadcrumbs.astro     # Navigation breadcrumbs
│   ├── SEO.astro             # JSON-LD structured data
│   ├── ArticleCTA.astro      # Category-contextual app CTA (article end)
│   ├── AppPromo.astro        # Homepage alumi Health section (4-feature grid)
│   ├── ShareButtons.astro    # 8-platform share (X, LinkedIn, Facebook, Reddit, Bluesky, WhatsApp, Email, copy) + Web Share API
│   ├── FloatingShareBar.astro # Sticky vertical share sidebar on article pages (desktop xl+)
│   ├── HighlightShare.astro  # Select text to share quote popup (X, Bluesky, copy)
│   ├── SeriesNav.astro       # Series prev/next navigation with progress dots
│   ├── BookmarkButton.astro  # localStorage reading list / bookmark toggle
│   └── admin/
│       └── ArticleEditor.tsx # Admin publishing portal React component
├── pages/
│   ├── index.astro           # Homepage (collection-driven)
│   ├── deep-dives.astro      # Deep dive series page (collection-driven)
│   ├── about.astro           # About / mission / editorial standards
│   ├── 404.astro             # Custom 404 page
│   ├── rss.xml.ts            # RSS feed (via @astrojs/rss)
│   ├── reading-list.astro    # Bookmarked articles page (reads localStorage)
│   ├── subscribe.astro       # Newsletter subscription page
│   ├── api/
│   │   └── subscribe.ts      # Newsletter subscription API (POST, Supabase upsert)
│   ├── admin/
│   │   ├── login.astro       # Admin token login (SSR)
│   │   ├── index.astro       # Admin dashboard (SSR)
│   │   └── new.astro         # New article editor (SSR)
│   └── articles/
│       ├── index.astro       # Articles index page (collection-driven)
│       └── *.astro           # Individual article pages
├── middleware.ts              # Auth gate for /admin routes
├── utils/
│   ├── articles.ts           # Article collection helpers
│   ├── funnel.ts             # Category-to-feature mapping, UTM link builder
│   └── reading-time.ts       # Reading time calculation
└── styles/
    ├── global.css            # Tailwind directives + custom styles
    └── admin.css             # Admin portal styles (source copy — public/admin.css is the served file)
supabase/
├── migrations/
│   ├── 20260315_create_articles.sql    # Articles table schema
│   ├── 20260322_daily_article_agent.sql # Log table + pg_cron schedule
│   └── 20260324_hourly_article_schedule.sql # Staged pipeline + 15-min cron
└── functions/
    ├── _shared/                          # Shared utilities (NOT a deployed function)
    │   ├── api-clients.ts                # claude(), gemini(), grok(), openai() + generateWithFallback()
    │   ├── astro.ts                      # assembleAstroFile(), todayISO(), escapeAttr()
    │   ├── constants.ts                  # PRICING, MODEL_PROVIDERS, MODEL_BYLINES, chains
    │   ├── cors.ts                       # CORS headers, json() helper
    │   ├── db.ts                         # supabase(), addCostToLog(), safeStage(), parseScore()
    │   ├── dedup.ts                     # extractFingerprint(), isDuplicate(), buildFingerprints()
    │   ├── featured.ts                   # rotateFeatured()
    │   ├── github.ts                     # publishToGitHub() with retry
    │   ├── pubmed.ts                     # verifyPubMedCitations()
    │   ├── types.ts                      # ApiResult, ApiUsage, VoiceAudit interfaces
    │   └── voice-audit.ts               # auditVoiceQuality()
    │
    ├── stage-research/                   # Stage 1: Gemini 2.5 Pro + Google Search → Sonnet fallback
    ├── stage-editor/                     # Stage 2: Flash → Sonnet. Editor brief — archetype/tone
    ├── stage-write/                      # Stage 3: Gemini 3.1 Pro → Sonnet (fallback path only — hybrid model pauses here)
    ├── stage-independence/               # Stage 4: Grok 3 adversarial review + Flash corrections + PubMed
    ├── stage-qc/                         # Stage 5: Flash → Sonnet. QC — publish/rewrite_voice/revise/kill
    ├── stage-voice-rewrite/              # Stage 6: Sonnet → Gemini → GPT-5.4 (skipped for human-written articles)
    ├── stage-publish/                    # Stage 7: GitHub commit + Vercel hook + GPT Image illustration
    ├── pipeline-scout/                   # Scout — 3x/day topic discovery (all Gemini + Google Search)
    ├── pipeline-pinger/                  # Pinger — 4x/hour breaking news detector (Gemini Flash/Grok/PubMed RSS)
    ├── pipeline-admin/                   # Admin: status, queue CRUD, retry, kill, get-brief, submit-article
    │
    ├── articles-api/                     # (existing) CRUD for articles table
    ├── process-article/                  # (existing) manual article generation
    ├── refine-article/                   # (existing) chat refinement
    ├── publish-article/                  # (existing) manual GitHub publish
    ├── delete-article/                   # (existing) GitHub deletion
    ├── fetch-article/                    # (existing) GitHub fetch
    ├── generate-illustration/            # (existing) AI illustration
    └── editorial-qc/                     # (existing) collection-wide QC
```

### Content Collections

Articles use Astro's Content Collections for type-safe data management:

```typescript
// src/content/config.ts
const articles = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    publishDate: z.string(),
    readTime: z.number(),
    tags: z.array(z.string()),
    series: z.string().optional(),
    seriesOrder: z.number().optional(),
    // ... more fields
  }),
});
```

Query articles with full TypeScript support:
```typescript
import { getCollection } from 'astro:content';
const articles = await getCollection('articles');
```

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
- **Dashboard**: 4-column stat grid (Total, Published, Drafts, Featured, Illustrated, Avg Read, Pipeline Spend, $/Article), 3 tab panels with fade-in animation (Pipeline, Articles, AI Agents). Max-width 1400px. Multi-column layouts: Pipeline tab has 2-col grid (queue + published side-by-side), AI Agents tab has 2-col grid (6 sections split). Articles tab is single-column (rows need full width for inline editing)
- **Pipeline tab** (React island: `PipelineMonitor`):
  - 7-stage visual pipeline: Research (Gemini 2.5 Pro + Search) → Editor (Flash → Sonnet) → **PAUSE for Opus writing** → Independence (Grok 3) → QC (Flash → Sonnet) → Voice Polish (Sonnet → Gemini, skipped for human articles) → Publish (GitHub + GPT Image)
  - **Hybrid workflow UI**: editor_approved articles show purple highlight, "Copy Brief for Claude" button (client-side clipboard), "Submit Written Article" textarea + submit button
  - **"Clear All Briefs" button**: one-click kills all stale editor_approved articles
  - **× dismiss button**: on every pipeline card, visible without expanding, hover turns red
  - Real-time polling (15s), "in flight" counter, progress bar to 100 articles
  - **Manual triggers**: individual scout buttons (Gemini / Sonnet / Grok / All 3) + "Produce Now"
  - **Topic Queue with full controls**: Produce, Expedite, Priority ↑↓, Delete, Reset. BREAKING badge for pinger-promoted topics
  - Published articles with model pen names, independence/editor scores, cost per article, Edit + View links
  - Failed articles show actual error message
- **Articles tab** (React island: `ArticlesManager`): search, filter (status/category), sort (newest/oldest/A-Z/read time/independence score), inline editing, bulk actions, featured toggle, **Improve button** (AI review + auto-fix per article), Refresh button, independence & editor score display per row
- **AI Agents tab** (React island: `AgentsPanel`): Reader Questions (mines alumi Health chat data), **Breaking News Pinger** (recent signals with source color coding, PROMOTED badges, refresh button), Cron Schedule (6 active jobs), editorial QC, illustration agent, Database & Maintenance, editor decision log
- **New Article Editor** (`/admin/new`): drag-and-drop upload, AI generation, chat refinement, live preview, one-click publish
- **Edit page** (`/admin/edit/[slug]`): metadata/content/AI refine tabs, autosave with 2s debounce + indicator, Cmd+S keyboard shortcut, score badges (independence/editor), live preview auto-refresh, Publish + Delete from GitHub buttons, XSS-safe chat rendering

#### Hybrid AI Newsroom (v12 — Human + AI)

AI handles discovery, research, editorial judgment, and quality control. Human writes with Opus via Max subscription. ~$0.13/article.

**Job 1 — Scout** (3 crons/day → `pipeline-scout`, all Gemini + Google Search grounding):
- `scout-gemini` 6am UTC: TikTok/Reddit/Google Trends health debates, viral studies, what 20-35 year olds are searching for
- `scout-sonnet` 2pm UTC: "wait, really?" stories — belief-challenging science, supplement debunks, diet culture lies (uses Gemini, not Sonnet)
- `scout-grok` 10pm UTC: contrarian — industry fraud, wellness influencer debunks, health Twitter debates, what young people are being lied to about
Each finds 20 topics with "why now" + search demand + shareability filter ("would a 25-year-old text this to a friend?"). ~$0.12/day total.

**Job 2 — Pipeline Dispatch** (cron: `*/5 * * * *`, every 5 min → SQL function `dispatch_pipeline_stage()`):
Safety-net cron. Chain-dispatch via `chain_dispatch()` SQL → `pg_net.http_post()` handles post-submit flow directly. Cron processes ≤5 queue items/day through research → editor brief → pause.

**Hybrid pipeline** (AI stages + human writing):
  1. **Research** (~30-80s): Gemini 2.5 Pro + Google Search grounding → Sonnet fallback. Deep research for queue topics.
  2. **Editor Brief** (~30-60s): Flash → Sonnet fallback. Assigns archetype (7 types), tone preset (10 options), density, pacing.
  3. **PAUSE at `editor_approved`** — Article waits for human writing. Dashboard shows purple-highlighted card with:
     - "Copy Brief for Claude" button (fetches formatted prompt via `pipeline-admin` `get-brief` action)
     - "Submit Written Article" form (accepts HTML, resumes pipeline via `submit-article` action)
  4. **Human writes with Opus** — User pastes brief to Claude Mac/Code, Opus writes the article ($0 via Max subscription). User pastes HTML back into admin dashboard.
  5. **Grok Independence Review** (~30-60s): Grok 3 adversarial review. Flash applies corrections. PubMed verification in parallel.
  6. **QC** (~30s): Flash → Sonnet fallback. Publish/rewrite_voice/revise/kill. Mechanical voice audit.
  7. **Voice Rewrite** (if QC triggers): Sonnet → Gemini → GPT-5.4 → Grok. Voice-only prose rewrite.
  8. **Publish** (~30s): GitHub commit (.astro + .json) with 422 retry loop. Vercel deploy hook. GPT Image illustration. Featured rotation.

**Architecture (split pipeline, SQL dispatch)**:
Each stage is its own edge function with shared utilities in `_shared/`. The SQL function `dispatch_pipeline_stage()` (called by pg_cron) reads DB state, picks the highest-priority article, and dispatches via `pg_net.http_post()` (fire-and-forget — no shared timeout). `editor_approved` is EXCLUDED from auto-dispatch — articles pause there for human writing. Dead code deleted: `daily-article-agent/` (old monolith) and `pipeline-orchestrator/` (replaced by SQL dispatch).

**Chain-dispatch (all user-triggered flows)**: All stages fire the next directly via `chain_dispatch()` SQL → `pg_net.http_post()`. No cron waits.
- Post-submit: submit-article → independence → QC → publish (seconds to publish)
- Manual produce: produce-topic → research → editor brief → pause (bypasses daily cap)
- Pre-submit auto: cron processes ≤5 queue items/day, research chain-dispatches editor
**Safety-net cron**: `dispatch_pipeline_stage()` runs every 5 min (`*/5 * * * *`) to catch stuck articles and auto-process queue. NOT the primary dispatch mechanism.
**5-brief daily cap**: cron-driven auto-processing caps at 5/day. Manual "Produce" button bypasses this cap via `produce-topic` action.
**Error handling**: `safeStage()` wrapper + `parseScore()` for safe integer parsing. All stages log errors to DB on failure.
**Model chains**: Writer (fallback path): Gemini 3.1 Pro → Sonnet → GPT-5.4. QC: Flash → Sonnet. Voice rewrite: Sonnet → Gemini → GPT-5.4 → Grok. Independence revision: Flash → Sonnet.
**API timeout**: 75s constant (`API_TIMEOUT`).
**Human-article protections**: QC detects `_writtenBy: "human-opus"` → skips voice rewrite, force-publishes on revise. Never degrades Opus prose.
**Mechanical voice audit**: `auditVoiceQuality()` — 30+ banned phrases, "you" count (min 6), paragraph length (max 3 sentences).
**Editorial independence**: Manually queued topics get "MANDATORY EDITORIAL DIRECTION".
**Duplicate filter**: `isDuplicate()` — bidirectional 55% word overlap with 5+ matching subject words.
**Cost tracking**: every API call logs tokens + USD to `daily_article_log.cost_usd` + `token_usage` (jsonb). ~$0.13/article with hybrid model.

- **Smart featured rotation**: every 6h via independent `pg_cron` job (`featured-rotation`). Uses `updated_at` to track when article became featured (not publish date). Scores: editor quality (25%), recency (30%), independence score (15%), illustration (10%), read time (10%), category diversity (10%). Must have illustration and score >30 to qualify. Standalone `rotate-featured` action works even when pipeline crons are paused.
- **Quality control**: `editorial-qc` reviews full article collection holistically → identifies issues → auto-fixes via `articles-api`
- **Illustration generation**: `generate-illustration` creates editorial art per article with house style prompt + category color palettes → stored in Supabase Storage
- **All secrets** stored in Supabase secrets only — never in code

#### Collection-Driven Navigation
- All navigation components pull from `getCollection('articles')` — no hardcoded article references
- Homepage, articles index, SideNav, CommandPalette, and related articles are all dynamic
- New articles auto-appear everywhere when their .json is added to `src/content/articles/`
- Homepage limited to 9 grid articles + "Browse all" CTA
- Category filtering is functional on homepage and articles index
- Articles index has real-time search by title, tags, and category

### Database (Supabase PostgreSQL)

The admin CMS uses a Supabase PostgreSQL database as the source of truth for editing. The static site still builds from files on GitHub.

**`articles` table schema:**
- `slug` (unique), `title`, `description`, `category`, `tags[]`, `keywords[]`
- `gradient_from`, `gradient_to`, `featured`, `draft`, `coming_soon`
- `read_time`, `publish_date`, `sort_order`, `hero_image`, `hero_image_alt`
- `article_html` (full article body), `article_svg` (deprecated, no longer generated), `toc` (jsonb)
- `source_text` (original source document), `status` (draft/published/archived)
- `independence_score` (Grok), `editor_score`, `pipeline_log_id` (FK to daily_article_log)
- `created_at`, `updated_at`, `published_at`

**Data flow:**
1. New article: Claude generates → saved to database as draft
2. Edits: metadata/content/AI refine → saved to database instantly
3. Publish: assembles .astro + .json from database → commits to GitHub → Vercel rebuilds

### Edge Functions (Supabase)

All deployed to the TUNE project (`mvkiornsximonxxitiwr`):

| Function | Purpose | Auth |
|---|---|---|
| `stage-research` | Stage 1: Gemini 2.5 Pro + Google Search grounding → Sonnet fallback | None (called by SQL dispatch) |
| `stage-editor` | Stage 2: Flash → Sonnet. Editor brief — archetype, tone, density, pacing | None (called by SQL dispatch) |
| `stage-write` | Stage 3: Gemini 3.1 Pro → Sonnet → GPT-5.4. Full article (fallback path only — hybrid pauses at editor_approved) | None (called by SQL dispatch) |
| `stage-independence` | Stage 4: Grok 3 adversarial review + Flash corrections + PubMed verification | None (called by SQL dispatch) |
| `stage-qc` | Stage 5: Flash → Sonnet. QC — publish/rewrite_voice/revise/kill. Skips voice rewrite for human-written articles | None (called by SQL dispatch) |
| `stage-voice-rewrite` | Stage 6: Sonnet → Gemini → GPT-5.4 → Grok. Voice-only prose rewrite (skipped for Opus/human articles) | None (called by SQL dispatch) |
| `stage-publish` | Stage 7: GitHub commit + Vercel deploy hook + GPT Image illustration + featured rotation | None (called by SQL dispatch) |
| `pipeline-scout` | 3x/day topic discovery — all Gemini + Google Search grounding. Trending signals, search demand, "why now" | None (called by pg_cron) |
| `pipeline-pinger` | 4x/hour breaking news detector — rotates Gemini Flash/Grok/PubMed RSS. Corroboration gate | None (called by pg_cron) |
| `pipeline-admin` | Admin API: `status`, `get-brief`, `submit-article`, `produce-topic` (bypasses cap), `produce`, `scout`, `pinger-status`, `retry`, `kill-article`, `queue-topic`, `list-queue`, `update-queue`, `delete-queue`, `backfill-costs`, `rotate-featured` | None (rate-limited internally) |
| `articles-api` | CRUD for articles table (list, get, save, delete, seed) | Write ops require ADMIN_TOKEN (Bearer) |
| `process-article` | Claude Sonnet article generation with editorial system prompt | None (rate-limited by Anthropic) |
| `refine-article` | Chat-based article refinement | None |
| `publish-article` | Commits .astro + .json to GitHub via REST API | ADMIN_TOKEN (Bearer) |
| `delete-article` | Removes article files from GitHub | ADMIN_TOKEN (Bearer) |
| `fetch-article` | Fetches .astro file content from GitHub | None |
| `generate-illustration` | AI illustration generation (OpenAI GPT Image 1.5) → Supabase Storage | None (rate-limited by OpenAI) |
| `editorial-qc` | Autonomous editorial quality control (Claude audits collection holistically, auto-fixes via other functions) | None |

**Deploy commands:**
```bash
supabase functions deploy <function-name> --no-verify-jwt

# Deploy all pipeline functions at once
for fn in stage-research stage-editor stage-write stage-independence stage-qc stage-voice-rewrite stage-publish pipeline-scout pipeline-pinger pipeline-admin; do
  supabase functions deploy $fn --no-verify-jwt
done
```

**Required secrets** (set via `supabase secrets set`):
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO`, `ADMIN_TOKEN`
- `XAI_API_KEY` (Grok 3 for independence review + pinger social trending), `GOOGLE_API_KEY` (Gemini for research, scouts, pinger)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-set by Supabase)

**Database tables:**
- `articles` — main content table. Key columns: `slug`, `title`, `description`, `category`, `tags[]`, `keywords[]`, `article_html`, `hero_image`, `status`, `independence_score`, `editor_score`, `pipeline_log_id` (FK to daily_article_log)
- `daily_article_log` — tracks pipeline stages. Key columns: `topic`, `slug`, `title`, `status`, `error`, `research_data` (jsonb), `editor_score`, `grok_score`, `model_used`, `revision_count`, `source` (trending/queue), `stage_started_at`, `cost_usd` (numeric, cumulative per article), `token_usage` (jsonb, per-call breakdown)
- `topic_queue` — editorial topic backlog. Key columns: `topic`, `notes`, `category`, `priority`, `expedite`, `source` (manual/trending/breaking), `status` (queued/assigned/in_progress/completed/skipped), `editor_score`, `research_summary`
- `pinger_signals` — breaking news signal tracking. Key columns: `signal_hash`, `topic`, `source` (gemini_search/grok_social/pubmed_rss), `urgency`, `why_breaking`, `promoted_to_queue`, `queue_id`, `expires_at` (48h auto-cleanup)
- `newsletter_subscribers` — email subscriptions (email unique, subscribed_at, source)

**Cron schedule** (via `pg_cron` + `pg_net`):
- `scout-gemini`: daily 6am UTC → `pipeline-scout` — Gemini + Google Search discovers 20 trending topics
- `scout-sonnet`: daily 2pm UTC → `pipeline-scout` — Gemini + Google Search (editorial lens) discovers 20 topics
- `scout-grok`: daily 10pm UTC → `pipeline-scout` — Grok discovers 20 contrarian topics
- `article-produce`: every 5 min (`*/5 * * * *`) → SQL function `dispatch_pipeline_stage()`. Safety net only — chain-dispatch handles post-submit flow. Caps at 5 briefs/day. Skips `editor_approved`
- `pinger`: every 15 min (`*/15 * * * *`) → `pipeline-pinger` — rotating breaking news detector (Gemini Flash/:00, PubMed RSS/:15, Grok/:30, PubMed RSS/:45)
- `featured-rotation`: every 6 hours (`0 */6 * * *`) → `pipeline-admin` — independent featured article rotation
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
- Deep Dives page (`/deep-dives`) dynamically renders published series from content collection

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
- Sitemap via `@astrojs/sitemap`
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
- Content Collections provide type safety without runtime overhead
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
