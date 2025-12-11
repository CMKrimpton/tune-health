# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tune Health is a premium health and wellness editorial website built with **Astro**, Tailwind CSS, and React islands for interactivity. The site features a magazine-style design with articles on mental health, nutrition, fitness, sleep science, and longevity.

## Development Commands

```bash
npm install      # Install dependencies (required before first run)
npm run dev      # Start Astro development server on port 4321
npm run build    # Build for production (outputs to dist/)
npm run preview  # Preview production build
```

## Architecture

### Build System
- **Astro v5** as the static site generator with islands architecture
- **React** for interactive components (Command Palette)
- **Tailwind CSS** with PostCSS for styling
- **View Transitions API** for smooth page navigation
- **Content Collections** for type-safe article management
- Node version specified in `.nvmrc`

### Core Libraries
- **Astro**: Static site generation with View Transitions and Content Collections
- **React + cmdk**: Command palette (⌘K) for site-wide navigation
- **GSAP**: Hero entrance animation and counter number tweening only
- **IntersectionObserver**: CSS-triggered reveal animations and scroll spy
- **Zod**: Schema validation for content collections

### File Structure
```
src/
├── content/
│   ├── config.ts             # Content collection schema (Zod)
│   └── articles/             # Article metadata (JSON)
│       ├── mirtazapine-guide.json
│       └── nicotine-research.json
├── layouts/
│   ├── BaseLayout.astro      # Main layout with View Transitions
│   └── ArticleLayout.astro   # Reusable article template
├── components/
│   ├── Header.astro          # Navigation with glass dropdown menu
│   ├── Footer.astro          # Site footer
│   ├── SideNav.astro         # Magazine-style sidebar (26+ links)
│   ├── CommandPalette.tsx    # React command palette (⌘K)
│   ├── CommandPaletteWrapper.astro  # Astro wrapper for React island
│   ├── FloatingTOC.astro     # Floating table of contents with scroll spy
│   ├── ArticleCard.astro     # Reusable article preview cards
│   ├── Newsletter.astro      # Newsletter signup section
│   ├── Breadcrumbs.astro     # Navigation breadcrumbs
│   └── SEO.astro             # JSON-LD structured data
├── pages/
│   ├── index.astro           # Homepage
│   ├── deep-dives.astro      # Deep dive series page
│   ├── subscribe.astro       # Newsletter subscription page
│   └── articles/
│       ├── index.astro       # Articles index page
│       ├── mirtazapine-guide.astro
│       └── nicotine-research.astro
├── utils/
│   ├── articles.ts           # Article collection helpers
│   └── reading-time.ts       # Reading time calculation
└── styles/
    └── global.css            # Tailwind directives + custom styles
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

### Key Features

#### Glass Dropdown Menu (Header)
- Opens on hover (mouseenter), closes on mouse leave with 150ms delay
- Click also works for mobile/touch devices
- Contains: Sections (4 with icons), Topics (8 pills), Featured articles (2 with badges)
- Glass morphism effect with `backdrop-blur-xl`
- Animated hamburger-to-X icon

#### SideNav (Magazine Sidebar)
- Reveals on left edge hover
- 26+ links organized by: Topics, Featured, Series, Resources, About
- Custom scrollbar, badges for "New" articles
- Search and theme toggle buttons

#### Command Palette (⌘K)
- React component using `cmdk` library
- Site-wide search: articles, sections, pages
- Actions: theme toggle, share, print
- Recently used items tracking
- Keyboard navigation (↑↓ Enter Esc)

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

#### SEO & Structured Data
- JSON-LD schema generation (Article, WebSite, Organization, BreadcrumbList)
- Open Graph and Twitter Card meta tags
- Canonical URLs

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
