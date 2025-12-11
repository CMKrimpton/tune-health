# Tune Health

A premium health and wellness editorial website featuring science-backed articles on mental health, nutrition, fitness, sleep science, and longevity.

**Live Site:** https://tune-health.vercel.app

## Tech Stack

- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom design system
- **Animations**: GSAP (hero only) + CSS transitions with IntersectionObserver
- **Scroll**: Native browser scroll (no scroll hijacking)
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

Opens the development server at `http://localhost:3000`

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
├── index.html              # Homepage
├── articles/               # Article pages
│   ├── mirtazapine-guide.html
│   └── nicotine-research.html
├── js/
│   └── main.js            # JavaScript (theme, navigation, animations)
├── css/
│   └── style.css          # Tailwind + custom components
├── assets/                 # Images, icons, logos
├── public/                 # Static assets (robots.txt, manifest.json)
├── tailwind.config.js      # Tailwind theme configuration
├── vite.config.js          # Vite build configuration
└── postcss.config.js       # PostCSS configuration
```

## Features

- Responsive design with mobile-first approach
- Dark/light theme toggle with system preference detection
- Native scroll with CSS-powered animations (60fps)
- Magazine-style editorial layout
- Search overlay
- Newsletter subscription form
- Article reading progress indicator
- Full accessibility support (skip links, focus states, ARIA labels)
- PWA-ready with manifest.json
- Open Graph / Twitter cards for social sharing
- Print stylesheet
- Safe area support for notched devices
- Reduced motion support for accessibility

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

## Performance

The site prioritizes native browser capabilities for maximum performance:

- **No scroll hijacking** - Uses native browser scroll instead of JS libraries
- **CSS animations** - GPU-accelerated transitions via IntersectionObserver
- **Passive scroll listeners** - Non-blocking scroll event handling
- **Minimal JavaScript** - GSAP only used for hero entrance animation

## Accessibility

- Skip link for keyboard navigation
- ARIA labels on interactive elements
- Focus-visible states for keyboard users
- Reduced motion support (`prefers-reduced-motion`)
- Semantic HTML structure
- Sufficient color contrast

## Deployment

The site is deployed on Vercel with automatic deployments:
- **Push to `main`** → Production deployment
- **Push to other branches** → Preview deployments

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guidelines for AI assistants
- [CHANGELOG.md](./CHANGELOG.md) - Version history and changes

## License

All rights reserved.
