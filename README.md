# alumi news (formerly Tune Health)

A premium health and wellness editorial website featuring science-backed articles on mental health, nutrition, fitness, sleep science, and longevity.

**Live Site:** https://alumi-news.vercel.app

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
│   ├── Header.astro          # Navigation with glass dropdown menu
│   ├── Footer.astro          # Site footer
│   ├── SideNav.astro         # Magazine-style sidebar (26+ links)
│   ├── CommandPalette.tsx    # React command palette (⌘K)
│   ├── FloatingTOC.astro     # Floating table of contents
│   ├── ArticleCard.astro     # Article preview cards
│   ├── Newsletter.astro      # Newsletter signup
│   ├── Breadcrumbs.astro     # Navigation breadcrumbs
│   └── SEO.astro             # JSON-LD structured data
├── pages/
│   ├── index.astro           # Homepage
│   ├── articles/             # Article pages & index
│   ├── deep-dives.astro      # Deep dive series page
│   └── subscribe.astro       # Newsletter subscription
├── utils/
│   ├── articles.ts           # Article collection helpers
│   └── reading-time.ts       # Reading time calculation
└── styles/
    └── global.css            # Tailwind + custom components
```

## Features

### Navigation
- **Glass Dropdown Menu** - Premium header navigation with sections, topics, and featured articles
- **SideNav** - Magazine-style sidebar with Topics, Series, and Featured articles
- **Command Palette (⌘K)** - Site-wide search for articles, sections, and pages
- **Floating Table of Contents** - Scroll spy navigation for articles
- **View Transitions** - Smooth page-to-page animations

### Content
- **40 published articles** across Neuroscience, Mental Health, Longevity, Clinical Evidence, Environmental Health, Nutrition, and Fitness
- Content Collections with Zod schema validation
- Type-safe article queries
- Automatic reading time calculation
- **All navigation is collection-driven** — new articles auto-appear everywhere
- **Category-based gradient art system** — editorial card visuals generated from category palette
- **Functional category filtering** on homepage and articles index
- **Article search** with real-time filtering on articles index

### Admin Publishing Portal (`/admin`)
- Token-based authentication with logout
- **Dashboard**: published, drafts, and coming-soon articles with edit/delete actions
- **New Article**: upload source docs or paste text → Claude Opus generates full article
- **Edit Articles**: three-tab editor (Metadata, Content HTML, AI Refine) with live preview
- Chat refinement with quick-action templates
- Version history with restore
- localStorage auto-save
- One-click publish to GitHub (triggers Vercel rebuild)
- Database-backed (Supabase PostgreSQL) for instant editing

### Design
- Responsive design with mobile-first approach
- Dark/light theme toggle with system preference detection
- Magazine-style editorial layout
- **Category-based gradient art** — rich, editorial gradient palettes per category (no stock photos)
- Custom View Transition animations

### Performance
- Zero JavaScript by default (Islands Architecture)
- React only loads for Command Palette and Admin Portal
- Native CSS animations (60fps)
- Passive scroll listeners

### SEO & Accessibility
- JSON-LD structured data (Article, Organization, BreadcrumbList)
- Open Graph / Twitter cards for social sharing
- Skip links for keyboard navigation
- ARIA labels on interactive elements
- Focus-visible states for keyboard users
- Reduced motion support (`prefers-reduced-motion`)
- Semantic HTML structure

### Additional
- Newsletter subscription form
- Article reading progress indicator
- PWA-ready with manifest.json
- Print stylesheet
- Safe area support for notched devices

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
  - `process-article` — Claude Opus article generation
  - `refine-article` — Chat-based article refinement
  - `publish-article` — GitHub commit pipeline
  - `delete-article` — GitHub file deletion
  - `fetch-article` — GitHub file fetching
  - `generate-illustration` — AI illustration generation (OpenAI GPT Image 1.5) with batch support
  - `editorial-qc` — Autonomous editorial quality control (Claude audits full collection, auto-fixes headlines/descriptions/illustrations)
- **Storage**: `article-illustrations` bucket for AI-generated editorial art

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guidelines for AI assistants
- [CHANGELOG.md](./CHANGELOG.md) - Version history and changes

## License

All rights reserved.
