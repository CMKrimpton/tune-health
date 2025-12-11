# Changelog

All notable changes to the Tune Health project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
