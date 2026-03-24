# alumi news (formerly Tune Health)

A premium health and wellness editorial website featuring science-backed articles on mental health, nutrition, fitness, sleep science, and longevity.

**Live Site:** https://tune-health.vercel.app

## Tech Stack

- **Framework**: Astro v5 with Islands Architecture
- **Styling**: Tailwind CSS with custom design system
- **Interactivity**: React (Command Palette + Admin Portal)
- **Animations**: CSS transitions with IntersectionObserver + GSAP (counter tweening)
- **Navigation**: Native View Transitions API
- **Typography**: Playfair Display, Inter, Crimson Pro

## Getting Started

### Prerequisites

- Node.js (see `.nvmrc` for version)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens the development server at `http://localhost:4321`

### Production Build

```bash
npm run build
```

Outputs to `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── content/
│   ├── config.ts             # Content collection schema
│   └── articles/             # Article metadata (JSON)
├── layouts/
│   ├── BaseLayout.astro      # Main layout with View Transitions
│   └── ArticleLayout.astro   # Reusable article template
├── components/
│   ├── Header.astro          # Navigation with glass dropdown menu (both variants)
│   ├── Footer.astro          # Site footer with social follow links
│   ├── SideNav.astro         # Magazine-style sidebar (collection-driven)
│   ├── MobileNav.astro       # Fixed bottom nav for touch devices
│   ├── CommandPalette.tsx    # React command palette (⌘K)
│   ├── FloatingTOC.astro     # Floating table of contents
│   ├── FloatingShareBar.astro # Sticky vertical share sidebar (desktop)
│   ├── ShareButtons.astro    # 8-platform share buttons + Web Share API
│   ├── ArticleReactions.astro # Emoji reactions with localStorage
│   ├── HighlightShare.astro  # Select-text-to-share popup
│   ├── BookmarkButton.astro  # localStorage reading list toggle
│   ├── ArticleCard.astro     # Article preview cards
│   ├── Newsletter.astro      # Newsletter signup
│   ├── Breadcrumbs.astro     # Navigation breadcrumbs
│   └── SEO.astro             # JSON-LD structured data
├── pages/
│   ├── index.astro           # Homepage
│   ├── articles/             # Article pages & index
│   ├── deep-dives.astro      # Deep dive series page
│   ├── reading-list.astro    # Bookmarked articles page
│   └── subscribe.astro       # Newsletter subscription
├── utils/
│   ├── articles.ts           # Article collection helpers
│   └── reading-time.ts       # Reading time calculation
└── styles/
    └── global.css            # Tailwind + custom components
```

## Features

### Navigation
- **Glass Dropdown Menu** — Premium header navigation with sections, topics, and featured articles. Available on all pages (including article pages). Active state highlighting for current section
- **SideNav** — Magazine-style sidebar with collection-driven Topics, Published Series, and Featured articles. Present on all pages including articles
- **Mobile Bottom Nav** — Fixed 5-item bar (Home, Articles, Search, Saved, Series) for touch devices. Auto-hides on scroll down, safe-area-aware
- **Command Palette (⌘K)** — Site-wide search for articles, sections, and pages
- **Floating Table of Contents** — Scroll spy navigation for articles
- **Breadcrumbs** — Category-linked breadcrumb trail on article pages
- **"More in Category"** — Browse-category link after related articles on every article page
- **View Transitions** — Smooth page-to-page animations
- **All navigation is collection-driven** — topics, series, and featured articles auto-populate from content collection

### Content
- **79 published articles** across Neuroscience, Mental Health, Longevity, Clinical Evidence, Environmental Health, Nutrition, Fitness, Sleep Science, and Pharmacology
- **Series support** — multi-part article series with `series`/`seriesOrder` fields, prev/next navigation, and progress indicators
- **Deep Dives page** dynamically renders published series (e.g., 6-part Thyroid Deep Dive) alongside coming-soon series
- Content Collections with Zod schema validation
- Type-safe article queries
- Automatic reading time calculation
- **All navigation is collection-driven** — new articles auto-appear everywhere
- **Category-based gradient art system** — editorial card visuals generated from category palette
- **Functional category filtering** on homepage and articles index (topic nav links wire to filter state)
- **Article search** with real-time filtering on articles index
- **Pagination** — articles index shows 12 initially with "Show More" button; auto-expands on search/filter

### Admin Mission Control (`/admin`)
- Token-based authentication with inline error handling (wrong token shows error, doesn't silently redirect)
- **Dashboard**: 8 compact stat cards, 3 tab panels (Pipeline, Articles, AI Agents)
- **Pipeline Monitor**: 5-stage visual pipeline with live model labels (Research: Gemini + Sonnet, Write: rotates hourly, etc.). Manual triggers: individual scout buttons (Gemini/Sonnet/Grok/All 3) + Produce Now with API response feedback. Topic queue with full controls per item (Produce, Expedite, Priority ↑↓, Delete, Reset stuck items). Published articles show model pen names + independence scores. Failed articles have Re-queue + Retry buttons.
- **Articles Manager**: search, filter, sort (including by independence score), inline editing, bulk actions, featured toggle, **Improve button** (AI review + auto-fix per article), Refresh from DB
- **AI Agents**: Cron Schedule (5 active jobs), editorial QC, illustration agent, Database & Maintenance (Refresh DB, Backfill Costs, Rotate Featured), editor decision log
- **Edit page**: metadata/content/AI refine tabs, 2s autosave + Cmd+S, score badges, live preview auto-refresh, Publish + Delete from GitHub, XSS-safe chat
- **New Article** (`/admin/new`): upload source docs or paste text → AI generates article → chat refinement → publish

### Autonomous AI Newsroom
Four AI companies, five models, two independent jobs, full fallback on every stage:

- **Scout** (3 crons/day): **Gemini** (6am, Google Search), **Sonnet** (2pm, web search, falls back to Gemini), **Grok** (10pm, contrarian). Each finds 20 topics, Grok markdown stripped, deduped and inserted into topic_queue. ~$0.14/day total
- **Produce** (cron: hourly): editor picks best topic from queue → self-chains through:
  1. **Research** — Claude with web search, falls back to Gemini (Google Search). Directed research for queue topics, two-model discovery for scouts
  2. **Editor Brief** (Sonnet → Grok → Gemini fallback) — assigns archetype (7 types) + tone preset (10 options) + density + pacing. Manually queued topics get "MANDATORY EDITORIAL DIRECTION" preserving the admin's intended angle. Smart duplicate detection: AI editor judges overlap, not word counting
  3. **Write** (multi-model rotation by hour + fallback) — follows archetype + tone. Anti-AI rules enforced. Editorial independence directive: "you are a journalist, not a PR department." Must include proper conclusion. `model_used` tracked
  4. **Grok Independence Review** (Grok 3) — adversarial review, scores use text instructions (no hardcoded numbers). Must quote exact article text. Rewrites trigger for `major_issues` OR `minor_issues with score < 7`. PubMed verification in parallel
  5. **QC + Publish** (Gemini → Sonnet fallback + OpenAI GPT Image) — different model from independence reviewer (not Grok). Headline/description polish only. Illustration parallelized, commit to GitHub. Author byline from writer model pen name
- **Fallback chain**: every stage has provider fallback — pipeline survives any single provider outage or spending limit
- **Cost tracking**: every API call logs token usage + USD cost. Backfill Costs button for pre-tracking articles
- **Featured rotation**: every 6h via independent `pg_cron` job. Manual trigger available in admin
- **Topic queue**: admin can add manually (P10 high priority), edit priority/expedite, produce specific topics on demand
- **94+ articles published**, diverse categories

### alumi Health Funnel
- **5 touchpoints** connecting readers to the [alumi Health](https://tune-sigma.vercel.app) app
- **Article-end CTA**: category-contextual (maps article topics → app features)
- **Homepage section**: 4-feature grid (Lab Results, Meal Analysis, AI Analyst, N=1 Experiments)
- **Header**, **Footer**, and **SideNav** links with UTM tracking
- Centralized config in `src/utils/funnel.ts` — single source of truth for all CTA copy and deep links

### Design
- Responsive design with mobile-first approach
- Dark/light theme toggle with system preference detection
- Magazine-style editorial layout
- **AI-generated editorial illustrations** (OpenAI GPT Image 1.5) with category gradient fallback
- Custom View Transition animations

### Performance
- Zero JavaScript by default (Islands Architecture)
- React only loads for Command Palette and Admin Portal
- Native CSS animations (60fps) with targeted property transitions (no `transition-all` on critical elements)
- Passive scroll listeners with AbortController cleanup across View Transitions (no listener leaks)
- iOS-optimized: opacity-only reveal animations on touch, `100dvh` viewport units, `visualViewport` API for scroll progress, 8px dead zone on mobile nav scroll hide
- View Transition anti-flash CSS with custom cross-fade keyframes

### SEO & Accessibility
- JSON-LD structured data (Article, Organization, BreadcrumbList)
- **Per-article OG images** — uses `heroImage` from Supabase for social sharing
- Open Graph / Twitter cards for social sharing
- **RSS feed** at `/rss.xml` via `@astrojs/rss`
- **Sitemap** via `@astrojs/sitemap`
- Skip links for keyboard navigation
- ARIA labels on interactive elements
- Focus-visible states for keyboard users
- Reduced motion support (`prefers-reduced-motion`)
- Semantic HTML structure

### Social Sharing & Interaction
- **8-platform share buttons** — X, LinkedIn, Facebook, Reddit, Bluesky, WhatsApp, Email, and copy link on every article
- **Native Web Share API** — mobile devices get an OS-level share sheet (Messages, AirDrop, etc.)
- **Floating share sidebar** — sticky vertical share bar on the left edge of article pages (desktop xl+ screens)
- **Highlight-to-share** — select article text to share the quote on X/Bluesky or copy with attribution
- **Reading List page** (`/reading-list`) — view and manage all bookmarked articles. Linked from SideNav and Footer
- **Social follow links** — RSS, X/Twitter, and Bluesky follow buttons in Footer
- **RSS autodiscovery** — `<link rel="alternate">` in `<head>` for feed reader auto-detection

### Additional
- **Reading list** — localStorage bookmark system with toggle on articles
- **About page** — mission statement, editorial standards, and brand tone
- **Custom 404 page** with article recommendations (noindex for SEO)
- **Newsletter subscription** — real API endpoint (`/api/subscribe`) saves to Supabase `newsletter_subscribers` table with email validation and error handling
- **Sticky header** — hides on scroll down, reappears on scroll up on article pages (desktop)
- Article reading progress indicator
- PWA-ready with manifest.json
- Print stylesheet
- Safe area support for notched devices
- **Content-Security-Policy** header restricting scripts, styles, fonts, images, and connections

## Design System

### Colors

- **Primary**: Red palette (`#ef4444` base)
- **Neutral**: Stone palette

### Typography

- **Headings**: Playfair Display (serif)
- **UI/Navigation**: Inter (sans-serif)
- **Body Text**: Crimson Pro (serif)

### Key Components

- `.container-editorial` - Main content container (max-width: 1400px)
- `.btn-primary`, `.btn-secondary` - Button styles
- `.article-card`, `.featured-card` - Article card layouts
- `.reveal` - Scroll-triggered animation class (CSS-based)

## Deployment

The site is deployed on Vercel with automatic deployments:
- **Push to `main`** → Production deployment
- **Push to other branches** → Preview deployments

### Backend (Supabase)
- **Database**: PostgreSQL `articles` table for CMS editing
- **Edge Functions** (TUNE project `mvkiornsximonxxitiwr`):
  - `articles-api` — CRUD for articles database
  - `process-article` — Claude Sonnet article generation
  - `refine-article` — Chat-based article refinement
  - `publish-article` — GitHub commit pipeline
  - `delete-article` — GitHub file deletion
  - `fetch-article` — GitHub file fetching
  - `generate-illustration` — AI illustration generation (OpenAI GPT Image 1.5) with batch support
  - `editorial-qc` — Autonomous editorial quality control (Claude audits full collection, auto-fixes headlines/descriptions/illustrations)
  - `daily-article-agent` — 5-stage article pipeline (research → editor brief → write → independence review → QC+publish). Multi-model rotation with full fallback chain. 10 tone presets, PubMed verification, Grok rewrite wiring, parallel illustration. Smart featured rotation. Manual scout/produce triggers.
- **Storage**: `article-illustrations` bucket for AI-generated editorial art
- **Cron**: `pg_cron` + `pg_net` — scout-gemini (6am), scout-sonnet (2pm), scout-grok (10pm), article-produce (hourly), featured-rotation (every 6h)

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guidelines for AI assistants
- [CHANGELOG.md](./CHANGELOG.md) - Version history and changes
- [BRAND.md](./BRAND.md) - Brand voice and editorial guidelines

## License

All rights reserved.
