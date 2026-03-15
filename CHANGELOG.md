# Changelog

All notable changes to the Tune Health project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [4.0.0] - 2026-03-15

### Added
- **Admin Publishing Portal** - Complete article publishing system at `/admin`
  - Token-based auth with middleware gate on all `/admin` routes
  - Dashboard showing published articles, coming soon count, and stats
  - New Article editor with two-column layout (upload/chat + live preview)
  - Drag-and-drop file upload supporting .md, .docx, .txt
  - Claude 4.6 integration for article generation matching exact editorial format
  - Chat refinement interface for iterating on articles (like working in Claude Code)
  - Metadata editor for title, slug, category, tags, gradient, featured status
  - One-click publish to GitHub via API (commits .astro + .json, triggers Vercel rebuild)
  - Live preview with site fonts and article CSS
- **Supabase Edge Functions** (deployed to TUNE project)
  - `process-article`: Sends source text to Claude 4.6 with full editorial system prompt
  - `refine-article`: Chat-style refinement with conversation history
  - `publish-article`: GitHub REST API commit pipeline
- **Coming Soon articles** as content collection entries
  - `metabolic-flexibility.json`, `zone-2-training.json`, `senolytics.json`
  - Rendered with "Coming Soon" badges on homepage and articles index

### Changed
- **MAJOR: All navigation is now collection-driven** — zero hardcoded article references
  - Homepage article grid renders from `getCollection('articles')`
  - Homepage featured article renders from `getFeaturedArticles()`
  - Homepage article counter is dynamic (`articles.length`)
  - Articles index page renders from collection (was hardcoded arrays)
  - SideNav featured links auto-populated from latest articles
  - CommandPalette article data injected from Astro via `window.__ALUMI_ARTICLES__`
  - Related articles auto-fetched by ArticleLayout (removed `slot="related"` from all 5 article pages)
- **Content schema extended** with `heroImage`, `heroImageAlt`, `sortOrder`, `comingSoon` fields
- **Article utilities extended** with `getComingSoonArticles()`, `getArticlesForHomepage()`, `formatPublishDateShort()`
- **Astro config** switched to use `@astrojs/node` adapter for SSR on admin routes
- All 5 article JSON files updated with `heroImage` and `heroImageAlt` values

### Architecture
- SSR support via `@astrojs/node` adapter (admin pages are server-rendered, public pages remain static)
- Auth middleware at `src/middleware.ts` protects `/admin/*` routes
- Admin React island (`ArticleEditor.tsx`) with file parsing, preview, chat, and publish
- Admin styles in `src/styles/admin.css` (warm stone palette matching site design)

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
