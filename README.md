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
- Token-based authentication with logout (server-side only, no `PUBLIC_` prefix)
- **Dashboard**: 8 stat cards (Total, Published, Drafts, Featured, Illustrated, Avg Read Time, Total AI Spend, Avg Cost/Article), 3 tab panels (Pipeline, Articles, AI Agents)
- **Pipeline Monitor**: 5-stage visual pipeline (Research → Editor → Write → Grok Review → QC+Publish) with model badges, per-article cost tracking, topic queue management, kill buttons, independence scores
- **Articles Manager**: search, filter, sort, inline editing, bulk actions, featured toggle
- **AI Agents**: editorial QC, illustration agent, DB sync, editor decision log
- **New Article** (`/admin/new`): upload source docs or paste text → AI generates article → chat refinement → publish

### Autonomous AI Newsroom
Four AI companies, five models, two independent jobs:

- **Scout** (cron: every 15 min): **Gemini 2.5 Flash** (Google Search) discovers 10 topics across recent + landmark timeframes. **Sonnet 4.6** structures best 5 into candidates. Editor scores, picks winner. Unchosen auto-save to queue. Hard `isDuplicate()` filter (bidirectional 30% overlap + stop-word filtering). Hard category balance rule: underserved categories (<5%) get priority unless score gap >3
- **Produce** (cron: every 3 min): editor picks best topic from queue → self-chains through:
  1. **Editor Brief** (Sonnet 4.6) — assigns archetype (7 types) + **tone preset** (10 options: straight-science, smart-casual, dry-analytical, storyteller, debunker, wire-dispatch, pointed, measured-authority, curious, understated) + density + pacing. Overlap detection, can replace older articles
  2. **Write** (Sonnet 4.6, temp 0.5) — follows archetype + tone preset. Anti-AI rules enforced. Deterministic category gradients + programmatic SVG (no AI tokens on visuals). Variable word counts per archetype
  3. **Grok Independence Review** (Grok 3, xAI) — reviews FULL article. When `major_issues` flagged, Claude applies rewrite suggestions. PubMed citation verification runs in parallel
  4. **QC + Publish** (Grok 3 + OpenAI GPT Image) — different model family reviews Sonnet's work (prevents self-review blindness). Illustration generation parallelized with QC (saves 30-60s). Commit to GitHub
- **Cost tracking**: every API call logs token usage + USD cost. Dashboard shows per-article cost and total spend
- **Featured rotation**: twice daily (12h) with early-exit optimization. Quality-gated: must have illustration, score >30
- **Topic queue**: vetted ideas always ready. Admin can add manually with priority/expedite. Hard dedup on inserts
- **Error handling**: `safeStage()` fails hard (no rollback loops), 135s API timeouts, spending limit detection, category sanitization
- **79 articles published**, diverse categories

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
  - `daily-article-agent` — 4-stage article pipeline (research → write → independence review → QC+publish). 10 tone presets, PubMed verification, Grok rewrite wiring, parallel illustration. Smart featured rotation.
- **Storage**: `article-illustrations` bucket for AI-generated editorial art
- **Cron**: `pg_cron` + `pg_net` trigger article pipeline every 15 min (requires extensions enabled in Dashboard)

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guidelines for AI assistants
- [CHANGELOG.md](./CHANGELOG.md) - Version history and changes
- [BRAND.md](./BRAND.md) - Brand voice and editorial guidelines

## License

All rights reserved.
