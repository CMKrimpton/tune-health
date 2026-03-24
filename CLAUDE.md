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
    └── admin.css             # Admin portal styles
supabase/
├── migrations/
│   ├── 20260315_create_articles.sql    # Articles table schema
│   ├── 20260322_daily_article_agent.sql # Log table + pg_cron schedule
│   └── 20260324_hourly_article_schedule.sql # Staged pipeline + 15-min cron
└── functions/
    ├── articles-api/          # CRUD for articles database (auth on writes)
    ├── process-article/       # Claude Opus article generation
    ├── refine-article/        # Chat-based article refinement
    ├── publish-article/       # GitHub commit pipeline (auth required)
    ├── delete-article/        # GitHub file deletion (auth required)
    ├── fetch-article/         # GitHub file fetching
    ├── generate-illustration/ # OpenAI GPT Image editorial art
    ├── editorial-qc/          # Autonomous QC agent (Claude audits collection)
    └── daily-article-agent/   # Staged article pipeline (research → write → publish)
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
- Dark mode via `class` strategy (toggle in JS, persisted to localStorage)
- **Warm color palette**:
  - `black` = `#1b1a18` (HSL 47°, 3%, 10%) - warm dark gray
  - `white` = `#e7e6e3` (HSL 47°, 3%, 90%) - warm off-white
  - Primary: red tones (`primary-500` = `#ef4444`)
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
- Actions: theme toggle, share, print
- Recently used items tracking
- Keyboard navigation (↑↓ Enter Esc)

#### Admin Mission Control (/admin)
- Protected by `ADMIN_TOKEN` cookie (middleware auth gate, server-side only — no `PUBLIC_` prefix). Wrong token redirects to `/admin/login?error=1` with inline error display.
- **Dashboard**: 8 compact stat cards (Total, Published, Drafts, Featured, Illustrated, Avg Read, Pipeline Spend, $/Article), 3 tab panels (Pipeline, Articles, AI Agents)
- **Pipeline tab** (React island: `PipelineMonitor`):
  - 5-stage visual pipeline: Research (Gemini + Sonnet) → Editor (Sonnet → Grok → Gemini) → Write (rotates hourly) → Independence (Grok 3) → QC+Publish (Sonnet + GPT Image)
  - Write stage dynamically shows current primary model based on UTC hour (matches backend `pickWriterModel()`)
  - Real-time polling (15s), "in flight" counter, progress bar to 100 articles
  - **Manual triggers**: individual scout buttons (Gemini / Sonnet / Grok / All 3) + "Produce Now" with full API response feedback
  - **Topic Queue with full controls**: every queued item has Produce (expedite + trigger), Expedite toggle, Priority ↑↓, Delete. IN_PROGRESS items get Reset + Delete buttons. Manual topics default to P10 (high priority). Queue form shows success/error feedback.
  - Published articles with model pen names, independence scores, Edit + View links
  - Editor decisions with kill reasons, failed articles with Re-queue + Retry buttons
  - Scout/produce results shown in colored banners (green success, red error)
- **Articles tab** (React island: `ArticlesManager`): search, filter (status/category), sort (newest/oldest/A-Z/read time/independence score), inline editing, bulk actions, featured toggle, **Improve button** (AI review + auto-fix per article), Refresh button, independence & editor score display per row
- **AI Agents tab** (React island: `AgentsPanel`): Reader Questions (mines alumi Health chat data for popular user questions, adds to queue with source: reader_request), Cron Schedule (5 active jobs), editorial QC, illustration agent, Database & Maintenance (Refresh DB, Backfill Costs, Rotate Featured), editor decision log
- **New Article Editor** (`/admin/new`): drag-and-drop upload, AI generation, chat refinement, live preview, one-click publish
- **Edit page** (`/admin/edit/[slug]`): metadata/content/AI refine tabs, autosave with 2s debounce + indicator, Cmd+S keyboard shortcut, score badges (independence/editor), live preview auto-refresh, Publish + Delete from GitHub buttons, XSS-safe chat rendering

#### Autonomous AI Newsroom (Two-Job Architecture)

Two independent cron jobs power the newsroom:

**Job 1 — Scout** (3 crons/day: `scout-gemini` 6am UTC, `scout-sonnet` 2pm, `scout-grok` 10pm):
Three-model discovery — each finds 20 topics, all deduped and inserted directly into `topic_queue`. Gemini (Google Search, trending topics), Sonnet (web search, editorial potential), Grok (contrarian, independent perspective). No expensive structuring step — raw findings parsed directly. Per-scout dedup against all articles + queue + within-batch. Category balance prioritizes underserved areas. ~$0.14/day total scout cost.

**Job 2 — Produce** (cron: `0 * * * *`, hourly, action: `produce`):
Picks the best topic from the queue, self-chains through 4 production stages:
  - **Editor Brief** (~30s): Sonnet 4.6 picks topic, checks overlap, assigns **article archetype** (deep-investigation, explainer, provocation, case-study, profile, roundup, myth-autopsy), picks **tone preset** (10 options: straight-science, smart-casual, dry-analytical, storyteller, debunker, wire-dispatch, pointed, measured-authority, curious, understated), sets density + pacing. Hard category balance rule: underserved categories (<5%) get priority over overserved (>15%) unless score gap >3. Can flag `replacesSlug` to replace an older article.
  - **Write** (~90s, temp 0.5): Multi-model rotation (Sonnet → Grok → Gemini, with automatic fallback). Same prompts, same rules for all models. Epistemic integrity framework: evidence hierarchy, dogma traps list, contrarian checkpoint, follow-the-money. Anti-AI rules enforced. Deterministic category gradients + programmatic SVG. Variable word counts per archetype (1,200–2,400). `model_used` tracked for quality comparison.
  - **Grok Independence Review** (~30s): Grok 3 (xAI) reviews FULL article for pharma framing, institutional deference, pulled punches, **outdated dogma**, **stale evidence**, **unfunded claims**, **AI voice tells**. Adversarial prompt — score examples use text instructions (no hardcoded numbers for model to copy). When verdict is `major_issues` OR `minor_issues with score < 7`, Claude applies Grok's specific rewrite suggestions before QC. Must quote exact article text and provide concrete replacements. PubMed citation verification runs in parallel (non-blocking, up to 5 studies verified).
  - **PubMed Fact-Check** (after Grok review): verifies cited studies on PubMed. If 2+ studies or >50% fail verification → article revised with "(citation unverified)" tags. Previously ran but results were ignored.
  - **QC + Publish** (~60s): **Gemini → Sonnet** fallback chain (NOT Grok — different model from independence reviewer, prevents same-model rubber-stamping). Focused on headline/description polish only — not re-reviewing content. Illustration generation runs in parallel with QC (saves 30-60s). Defaults to publish, max 1 revision. OpenAI GPT Image generates illustration. Commits .astro + .json to GitHub. Featured rotation with early-exit optimization.

**Self-chaining**: each stage triggers the next via HTTP POST. Cron is just the initial trigger.
**Error handling**: `safeStage()` wrapper catches all errors, fails hard (no rollback). Admin can retry/kill/re-queue via UI. Spending limit errors surface immediately with `SPENDING_LIMIT:` prefix. All stages have provider fallback chains — pipeline survives any single provider outage.
**Fallback chain**: Every model call goes through `generateWithFallback()` or has explicit try/catch with provider fallback. Research falls back Claude → Gemini. Scout structuring uses full Sonnet → Grok → Gemini chain. QC uses Grok → Gemini → Sonnet chain.
**Editorial independence**: Manually queued topics (`source: manual`) get "MANDATORY EDITORIAL DIRECTION" — editor must preserve the original angle. Writer prompt says "you are a journalist, not a PR department." Critical investigations must not be neutralized into balanced overviews.
**Duplicate filter**: `isDuplicate()` — bidirectional 55% word overlap with 5+ matching subject words (near-exact only). Single queued topics always pass through to the AI editor for intelligent judgment. Mechanical filter only pre-screens multi-candidate scout batches. Scout topics have Grok markdown stripped before dedup.
**Category sanitization**: validates against whitelist of 9 categories.
**Article ordering**: `sortOrder` field (epoch ms) ensures newest articles always appear first.
**Cost tracking**: every API call (Claude, Grok, Gemini) logs input/output tokens and USD cost to `daily_article_log.cost_usd` + `token_usage` (jsonb breakdown). Dashboard shows per-article and total spend.

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
- `article_html` (full article body), `article_svg` (hero SVG), `toc` (jsonb)
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
| `articles-api` | CRUD for articles table (list, get, save, delete, seed) | Write ops require ADMIN_TOKEN (Bearer) |
| `process-article` | Claude Sonnet article generation with editorial system prompt | None (rate-limited by Anthropic) |
| `refine-article` | Chat-based article refinement | None |
| `publish-article` | Commits .astro + .json to GitHub via REST API | ADMIN_TOKEN (Bearer) |
| `delete-article` | Removes article files from GitHub | ADMIN_TOKEN (Bearer) |
| `fetch-article` | Fetches .astro file content from GitHub | None |
| `generate-illustration` | AI illustration generation (OpenAI GPT Image 1.5) → Supabase Storage | None (rate-limited by OpenAI) |
| `editorial-qc` | Autonomous editorial quality control (Claude audits collection holistically, auto-fixes via other functions) | None |
| `daily-article-agent` | Two-job newsroom: `scout` (discovers topics, fills queue) + `produce` (editor picks, self-chains through write → Grok review → QC → publish). Also: `status`, `retry`, `kill-article`, `queue-topic`, `list-queue`, `update-queue`, `delete-queue`, `backfill-costs`. Models: Sonnet 4.6 (research/editor/write/QC), Grok 3 (independence review). Per-call cost tracking. | None (rate-limited internally) |

**Deploy commands:**
```bash
supabase functions deploy <function-name> --no-verify-jwt
```

**Required secrets** (set via `supabase secrets set`):
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO`, `ADMIN_TOKEN`
- `XAI_API_KEY` (Grok 3 for independence review), `GOOGLE_API_KEY` (future use)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-set by Supabase)

**Database tables:**
- `articles` — main content table. Key columns: `slug`, `title`, `description`, `category`, `tags[]`, `keywords[]`, `article_html`, `hero_image`, `status`, `independence_score`, `editor_score`, `pipeline_log_id` (FK to daily_article_log)
- `daily_article_log` — tracks pipeline stages. Key columns: `topic`, `slug`, `title`, `status`, `error`, `research_data` (jsonb), `editor_score`, `grok_score`, `model_used`, `revision_count`, `source` (trending/queue), `stage_started_at`, `cost_usd` (numeric, cumulative per article), `token_usage` (jsonb, per-call breakdown)
- `topic_queue` — editorial topic backlog. Key columns: `topic`, `notes`, `category`, `priority`, `expedite`, `source` (manual/trending), `status` (queued/assigned/in_progress/completed/skipped), `editor_score`, `research_summary`
- `newsletter_subscribers` — email subscriptions (email unique, subscribed_at, source)

**Cron schedule** (via `pg_cron` + `pg_net`):
- `scout-gemini`: daily 6am UTC — Gemini discovers 20 topics via Google Search
- `scout-sonnet`: daily 2pm UTC — Sonnet discovers 20 topics via web search
- `scout-grok`: daily 10pm UTC — Grok discovers 20 topics (contrarian perspective)
- `article-produce`: every hour (`0 * * * *`) — editor picks best topic, self-chains through production
- `featured-rotation`: every 6 hours (`0 */6 * * *`) — independent featured article rotation (runs even when production crons are paused)
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
