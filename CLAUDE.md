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
│   └── articles/             # Article metadata (JSON) - 46 published articles
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
│   └── 20260322_daily_article_agent.sql # Log table + pg_cron schedule
└── functions/
    ├── articles-api/          # CRUD for articles database (auth on writes)
    ├── process-article/       # Claude Opus article generation
    ├── refine-article/        # Chat-based article refinement
    ├── publish-article/       # GitHub commit pipeline (auth required)
    ├── delete-article/        # GitHub file deletion (auth required)
    ├── fetch-article/         # GitHub file fetching
    ├── generate-illustration/ # OpenAI GPT Image editorial art
    ├── editorial-qc/          # Autonomous QC agent (Claude audits collection)
    └── daily-article-agent/   # Autonomous daily article pipeline (pg_cron)
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

#### Admin Publishing Portal (/admin)
- Protected by `ADMIN_TOKEN` cookie (middleware auth gate, server-side only — no `PUBLIC_` prefix)
- **Dashboard**: 6 stat cards (total, published, drafts, featured, illustrated, avg read time), category breakdown pills, recently updated row, article search
- **New Article Editor**: two-column layout (upload/chat + live preview)
  - Drag-and-drop file upload (.md, .docx, .txt)
  - Claude Opus generates article in exact editorial format (via Supabase Edge Function)
  - **Auto-generates editorial illustration** via OpenAI GPT Image 1.5 after article creation
  - Chat refinement interface for iterating on the article
  - Metadata editor (title, slug, category, tags, gradient, featured)
  - One-click publish to GitHub (commits .astro + .json with heroImage, triggers Vercel rebuild)
- **AI Agents panel** on dashboard:
  - **Editorial QC Agent**: "Audit Only", "Dry Run (Preview Fixes)", "Audit & Auto-Fix" with severity selector (High/Medium+/All), pattern warnings, copy report, per-issue fix status
  - **Illustration Agent**: single-article selector, "Generate Missing", "Regenerate All" with cost confirmation
  - **Database Sync**: refresh DB from content
- Edge Functions: `process-article`, `refine-article`, `publish-article`, `generate-illustration`, `editorial-qc`

#### Autonomous AI Pipeline
- **Article creation**: source doc → Claude writes article → OpenAI generates illustration → both saved to DB → publish commits to GitHub → Vercel deploys
- **Daily article agent**: `daily-article-agent` runs via `pg_cron` at 6 AM UTC daily → Claude with native `web_search` tool autonomously discovers trending health topics → picks the best one → deep research with web search fact-checking → writes full article → saves to DB → generates illustration (synchronous, waits for heroImage URL) → publishes to GitHub with illustration included → Vercel deploys. Logs to `daily_article_log` table. One run per day (rate-limited).
- **Quality control**: `editorial-qc` reviews full article collection holistically → identifies headline repetition, weak descriptions → auto-fixes via `articles-api`
- **Illustration generation**: `generate-illustration` creates editorial art per article with house style prompt + category color palettes → stored in Supabase Storage
- **All secrets** (ANTHROPIC_API_KEY, OPENAI_API_KEY, GITHUB_TOKEN, ADMIN_TOKEN) stored in Supabase secrets only — never in code

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
| `process-article` | Claude Opus article generation with editorial system prompt | None (rate-limited by Anthropic) |
| `refine-article` | Chat-based article refinement | None |
| `publish-article` | Commits .astro + .json to GitHub via REST API | ADMIN_TOKEN (Bearer) |
| `delete-article` | Removes article files from GitHub | ADMIN_TOKEN (Bearer) |
| `fetch-article` | Fetches .astro file content from GitHub | None |
| `generate-illustration` | AI illustration generation (OpenAI GPT Image 1.5) → Supabase Storage | None (rate-limited by OpenAI) |
| `editorial-qc` | Autonomous editorial quality control (Claude audits collection holistically, auto-fixes via other functions) | None |
| `daily-article-agent` | Autonomous daily article pipeline: Claude with native `web_search` tool discovers trending health topics → picks best one → deep research with fact-checking → writes full article → saves to DB → publishes to GitHub. Runs daily via `pg_cron` at 6 AM UTC. Actions: `run`, `dry-run`, `status`. Rate-limited to one successful run per day. Uses Claude Sonnet 4.6 by default, Opus 4.6 with `model: "opus"`. | None (rate-limited internally) |

**Deploy commands:**
```bash
supabase functions deploy <function-name> --no-verify-jwt
```

**Required secrets** (set via `supabase secrets set`):
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO`, `ADMIN_TOKEN`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-set by Supabase)
- Note: `daily-article-agent` uses Claude's native `web_search` tool — no additional search API key required

**Database tables:**
- `articles` — main content table (see schema above)
- `daily_article_log` — tracks daily article agent runs (run_date, topic, slug, title, status, error, search_queries, research_snippets)
- `newsletter_subscribers` — email subscriptions (email unique, subscribed_at, source). Upsert via `/api/subscribe` endpoint

**Cron schedule** (via `pg_cron` + `pg_net`):
- `daily-article-agent`: runs at 6 AM UTC daily, invokes the Edge Function via HTTP POST
- Requires `pg_cron` and `pg_net` extensions enabled in Supabase Dashboard > Database > Extensions
- View schedule: `SELECT * FROM cron.job WHERE jobname = 'daily-article-agent';`
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
