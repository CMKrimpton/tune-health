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
- **GSAP**: Hero entrance animation and counter number tweening only
- **IntersectionObserver**: CSS-triggered reveal animations and scroll spy
- **Zod**: Schema validation for content collections
- **mammoth**: DOCX file parsing in admin portal

### File Structure
```
src/
├── content/
│   ├── config.ts             # Content collection schema (Zod)
│   └── articles/             # Article metadata (JSON) - 29 published articles
├── layouts/
│   ├── BaseLayout.astro      # Main layout with View Transitions
│   └── ArticleLayout.astro   # Reusable article template (auto-fetches related articles)
├── components/
│   ├── Header.astro          # Navigation with glass dropdown menu
│   ├── Footer.astro          # Site footer
│   ├── SideNav.astro         # Magazine-style sidebar (collection-driven)
│   ├── CommandPalette.tsx    # React command palette (dynamic via window injection)
│   ├── CommandPaletteWrapper.astro  # Injects article data for React island
│   ├── FloatingTOC.astro     # Floating table of contents with scroll spy
│   ├── ArticleCard.astro     # Reusable article preview cards
│   ├── Newsletter.astro      # Newsletter signup section
│   ├── Breadcrumbs.astro     # Navigation breadcrumbs
│   ├── SEO.astro             # JSON-LD structured data
│   └── admin/
│       └── ArticleEditor.tsx # Admin publishing portal React component
├── pages/
│   ├── index.astro           # Homepage (collection-driven)
│   ├── deep-dives.astro      # Deep dive series page
│   ├── subscribe.astro       # Newsletter subscription page
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
│   └── reading-time.ts       # Reading time calculation
└── styles/
    ├── global.css            # Tailwind directives + custom styles
    └── admin.css             # Admin portal styles
supabase/
└── functions/
    ├── process-article/      # Claude 4.6 article generation
    ├── refine-article/       # Chat-based article refinement
    └── publish-article/      # GitHub commit pipeline
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
- Featured section is **collection-driven** (auto-populates from latest articles)
- Custom scrollbar, badges for "New" articles
- Search and theme toggle buttons

#### Command Palette (⌘K)
- React component using `cmdk` library
- **Collection-driven**: article data injected from Astro via `window.__ALUMI_ARTICLES__`
- Site-wide search: articles, sections, pages
- Actions: theme toggle, share, print
- Recently used items tracking
- Keyboard navigation (↑↓ Enter Esc)

#### Admin Publishing Portal (/admin)
- Protected by `ADMIN_TOKEN` cookie (middleware auth gate)
- **Dashboard**: article stats, published articles table
- **New Article Editor**: two-column layout (upload/chat + live preview)
  - Drag-and-drop file upload (.md, .docx, .txt)
  - Claude 4.6 generates article in exact editorial format (via Supabase Edge Function)
  - Chat refinement interface for iterating on the article
  - Metadata editor (title, slug, category, tags, gradient, featured)
  - One-click publish to GitHub (commits .astro + .json, triggers Vercel rebuild)
- Edge Functions: `process-article`, `refine-article`, `publish-article`

#### Collection-Driven Navigation
- All navigation components pull from `getCollection('articles')` — no hardcoded article references
- Homepage, articles index, SideNav, CommandPalette, and related articles are all dynamic
- New articles auto-appear everywhere when their .json is added to `src/content/articles/`

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
| `articles-api` | CRUD for articles table (list, get, save, delete, seed) | Write ops require ADMIN_TOKEN |
| `process-article` | Claude Opus article generation with editorial system prompt | None (rate-limited by Anthropic) |
| `refine-article` | Chat-based article refinement | None |
| `publish-article` | Commits .astro + .json to GitHub via REST API | Bearer token |
| `delete-article` | Removes article files from GitHub | Bearer token |
| `fetch-article` | Fetches .astro file content from GitHub | None |

**Deploy commands:**
```bash
supabase functions deploy <function-name> --no-verify-jwt
```

**Required secrets** (set via `supabase secrets set`):
- `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO`, `ADMIN_TOKEN`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-set by Supabase)

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
