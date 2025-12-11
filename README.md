# Tune Health

A premium health and wellness editorial website featuring science-backed articles on mental health, nutrition, fitness, sleep science, and longevity.

**Live Site:** https://tune-health.vercel.app

## Tech Stack

- **Framework**: Astro v5 with Islands Architecture
- **Styling**: Tailwind CSS with custom design system
- **Interactivity**: React (Command Palette only)
- **Animations**: GSAP (hero only) + CSS transitions with IntersectionObserver
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
- **SideNav** - Magazine-style sidebar with 26+ links across Topics, Series, Resources, and About
- **Command Palette (⌘K)** - Site-wide search for articles, sections, and pages
- **Floating Table of Contents** - Scroll spy navigation for articles
- **View Transitions** - Smooth page-to-page animations

### Content
- Content Collections with Zod schema validation
- Type-safe article queries
- Automatic reading time calculation

### Design
- Responsive design with mobile-first approach
- Dark/light theme toggle with system preference detection
- Magazine-style editorial layout inspired by Vanity Fair
- Premium imagery from Unsplash throughout (editorial quality, not stock)
- Custom View Transition animations

### Performance
- Zero JavaScript by default (Islands Architecture)
- React only loads for Command Palette
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

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guidelines for AI assistants
- [CHANGELOG.md](./CHANGELOG.md) - Version history and changes

## License

All rights reserved.
