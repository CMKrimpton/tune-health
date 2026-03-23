# Changelog

All notable changes to the alumi news project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
