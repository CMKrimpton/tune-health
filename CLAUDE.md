# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tune Health is a premium health and wellness editorial website built with Vite, Tailwind CSS, and GSAP animations. The site features a magazine-style design with articles on mental health, nutrition, fitness, sleep science, and longevity.

## Development Commands

```bash
npm install      # Install dependencies (required before first run)
npm run dev      # Start development server on port 3000
npm run build    # Build for production (outputs to dist/)
npm run preview  # Preview production build
```

## Architecture

### Build System
- **Vite** as the build tool with multi-page configuration
- Entry points defined in `vite.config.js`: main index and article pages
- Tailwind CSS with PostCSS for styling
- Node version specified in `.nvmrc`

### Core Libraries
- **GSAP + ScrollTrigger**: All scroll-based animations and reveal effects
- **Lenis**: Smooth scrolling (integrated with GSAP ticker)
- **SplitType**: Text splitting for character/word animations

### File Structure
- `index.html` - Main homepage
- `articles/` - Article pages (e.g., `mirtazapine-guide.html`)
- `js/main.js` - All JavaScript: animations, navigation, theme toggle, form handling
- `css/style.css` - Tailwind directives + custom component styles
- `tailwind.config.js` - Extended theme with custom colors, typography, animations
- `assets/` - Images and SVG assets

### Styling Approach
- Tailwind utility classes with custom component layer in `css/style.css`
- Dark mode via `class` strategy (toggle in JS)
- Primary color palette: red tones (`primary-500` = `#ef4444`)
- Custom typography: Playfair Display (headings), Inter (sans), Crimson Pro (body)
- Custom easing: `ease-editorial` = `cubic-bezier(0.22, 1, 0.36, 1)`

### Key CSS Components
- `.container-editorial` - Main content container
- `.reveal` - Elements that animate on scroll
- `.btn-primary`, `.btn-secondary` - Button styles
- `.article-card`, `.featured-card` - Article card layouts
- `.glass` - Glassmorphism effect

### Animation Patterns
All animations handled in `js/main.js`:
- Reveal animations trigger at 85% viewport intersection
- Counter animations use GSAP `snap` for integer display
- Magnetic button effect on `.magnetic` class
- Parallax effects via `data-parallax` attribute
- Text split animations via `data-split` attribute

### Navigation
- Fixed header with scroll state detection
- Mobile menu with Lenis scroll stop/start
- Search overlay with keyboard support (Escape to close)
- Theme persisted to localStorage

## CSS/Tailwind Guidelines

When writing CSS in this project, follow these rules to avoid build errors:

### Avoid in @apply directives
- `group` - Add directly in HTML class attribute instead
- `visible`/`invisible` when the selector contains `.visible` or `.invisible` (circular dependency)
- Non-standard opacity values like `/98` - use raw CSS instead

### Correct patterns
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
- Prefer CSS hover effects over JS (GSAP) for simple transforms
- Limit `backdrop-blur` usage - use `backdrop-blur-sm` or `backdrop-blur-md` max
- Avoid infinite GSAP animations (`repeat: -1`)
- Use higher opacity backgrounds instead of heavy blur effects

## Documentation Requirements

**Always update these files when making changes:**

1. **CHANGELOG.md** - Log all changes with date, description, and category
2. **README.md** - Update if adding new features, commands, or dependencies
