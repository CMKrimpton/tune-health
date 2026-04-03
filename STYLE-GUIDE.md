# alumi news — Style Guide

> Visual and typographic reference for collaborators. Everything here is derived from the live design system in `tailwind.config.js` and `src/styles/global.css`.

---

## Fonts

| Role | Family | Weights | Style | Usage |
|------|--------|---------|-------|-------|
| **Headings** | Playfair Display | 400, 600, 700 | Normal + Italic | All headings (h1–h3), article titles, card titles, series names, blockquotes |
| **UI / Navigation** | Inter | 400, 500, 600, 700 | Normal | Navigation, buttons, labels, badges, category tags, metadata, captions |
| **Body Copy** | Crimson Pro | 400, 500 | Normal + Italic | Article body text, descriptions, card descriptions |

**Loading**: Google Fonts with `display=swap`. Preconnect to `fonts.googleapis.com` and `fonts.gstatic.com`.

**Fallbacks**:
- Serif: Georgia → Times New Roman → serif
- Sans: -apple-system → BlinkMacSystemFont → Segoe UI → Roboto → sans-serif
- Body: Georgia → serif

---

## Type Scale

All sizes are fluid (`clamp()`) for responsive scaling.

| Token | Size (mobile → desktop) | Line Height | Letter Spacing | Usage |
|-------|------------------------|-------------|----------------|-------|
| `display-1` | 40px → 72px | 1.05 | -0.025em | Hero headlines (homepage) |
| `display-2` | 32px → 56px | 1.1 | -0.02em | Section heroes |
| `heading-1` | 28px → 44px | 1.15 | -0.015em | Article titles, featured card headlines |
| `heading-2` | 22px → 30px | 1.2 | — | Section headings, topic page titles |
| `heading-3` | 18px → 24px | 1.3 | — | Card titles, sidebar headings |
| `body-lg` | 20px → 21px | 1.75 | — | Article body copy, standfirst |
| `body` | 17px → 18px | 1.7 | — | Card descriptions, general body |
| `caption` | 13px | 1.5 | 0.02em | Timestamps, metadata |
| `overline` | 12px | 1.4 | 0.1em | Category labels, section labels (always uppercase) |

**Standfirst** (article lede/description): 22px → 24px, line-height 1.75, letter-spacing -0.005em, `text-wrap: pretty`.

**Article body**: 20px (`1.25rem`) with line-height 1.8. Max width 680px. Headings use Playfair Display 600. Body paragraphs use Crimson Pro.

---

## Color Palette

### Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `black` | `#1b1a18` | Text, backgrounds (warm dark gray, not pure black) |
| `white` | `#e7e6e3` | Backgrounds, text on dark (warm off-white, not pure white) |
| `primary-500` | `#ef4444` | Accent, links, badges, hover states |
| `primary-600` | `#dc2626` | Primary red — category labels, CTAs, active states |
| `primary-700` | `#b91c1c` | Hover state for links |

### Neutral Scale (Stone)

Warm gray palette — never use cool grays.

| Token | Hex | Usage |
|-------|-----|-------|
| `stone-50` | `#fafaf9` | Light backgrounds, subtle surfaces |
| `stone-100` | `#f5f5f4` | Card backgrounds (light mode) |
| `stone-200` | `#e7e5e4` | Borders (light mode) |
| `stone-300` | `#d6d3d1` | Dividers, muted text |
| `stone-400` | `#a8a29e` | Secondary text, timestamps |
| `stone-500` | `#78716c` | Body text (light mode), metadata |
| `stone-600` | `#57534e` | Body text (light mode) |
| `stone-700` | `#44403c` | Prose body (light mode) |
| `stone-800` | `#292524` | Borders (dark mode), surface dark |
| `stone-900` | `#1c1917` | Card backgrounds (dark mode) |
| `stone-950` | `#0c0a09` | Deepest backgrounds |

### Dark Mode

- Class-based (`html.dark`), three-state toggle: system → light → dark
- Dark mode uses `stone-900` cards on near-black backgrounds
- Text inverts: `stone-300` for body, `stone-100` for headings
- Primary shifts from `primary-600` to `primary-400` for links
- Borders shift from `stone-200` to `stone-800`

---

## Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| `container` max-width | 1240px | Main content container |
| `article` max-width | 680px | Article body column |
| `narrow` max-width | 720px | Prose/typography max width |
| Container padding | 20px / 32px / 40px | Mobile / Tablet / Desktop |

---

## Border Radius

| Context | Value |
|---------|-------|
| Cards | 16px (`rounded-2xl`) |
| Buttons / Badges | Full (`rounded-full`) |
| Small elements | 12px (`rounded-xl`) |
| Images | Inherit from container |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `card` | `0 4px 20px rgba(0,0,0,0.06)` | Default card shadow |
| `card-hover` | `0 20px 40px rgba(0,0,0,0.12)` | Card hover state |
| `editorial` | `0 25px 50px -12px rgba(0,0,0,0.08)` | Featured sections |
| `glow` | `0 0 60px rgba(220,38,38,0.15)` | Primary accent glow |

---

## Illustrations

Every article has two illustration variants:

| Variant | Aesthetic | Background | Style |
|---------|-----------|------------|-------|
| **Dark** | Moody, atmospheric | Deep blacks, rich shadows | Painterly with grain — Vanity Fair meets Nature journal |
| **Light** | Airy, luminous | Warm whites, soft creams | Soft watercolor wash — Scientific American meets Kinfolk |

**Specifications**:
- Size: 1536 x 1024 (3:2 aspect ratio)
- Format: PNG
- Abstract and conceptual — never literal depictions
- No text, no human faces, no clipart
- Subtle scientific motifs: molecular structures, neural pathways, cellular forms, waveforms
- Category-specific color accents (e.g., indigo/violet for Mental Health, emerald/gold for Longevity)

**Display**: Dark variant shows in dark mode, light variant in light mode. CSS `hidden dark:block` / `dark:hidden` handles the swap. Articles without a light variant get a subtle 15% white overlay as fallback.

---

## Animation & Motion

| Token | Value | Usage |
|-------|-------|-------|
| `ease-editorial` | `cubic-bezier(0.22, 1, 0.36, 1)` | Page transitions, card animations |
| `ease-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` | General UI transitions |
| Default duration | 200–250ms | Hover states, color transitions |
| Card image hover | `scale(1.05)` over 700ms | Image zoom on card hover |

**Rules**:
- Large elements (cards, featured areas): shadow/glow changes only on hover — NO scale or translate
- Small elements (icons, arrows): subtle scale/translate OK
- Page entrances: staggered fade-up animations with reveal delays
- Transitions: always specify explicit properties (never `transition: all`)

---

## Interactive States

### Card Hover
- Title: turns `primary-600` (red)
- Category label: flips from red to neutral (`stone-800` light / `stone-300` dark) to avoid clash
- Image: subtle 5% scale zoom
- Border: shifts from `stone-200` to `stone-300` (light) / `stone-800` to `stone-700` (dark)
- Shadow: lifts to `card-hover`

### Links
- Color: `primary-600` → `primary-700` on hover
- Style: no underline, 1px bottom border
- Transition: 200ms color ease

### Buttons
- Primary: `primary-600` background, white text, full radius
- Font: Inter semibold, 14px
- Touch target: minimum 44px on touch devices

---

## Category Color Mapping

Each category has a signature gradient and illustration accent palette:

| Category | Color Direction |
|----------|----------------|
| Mental Health | Indigo, violet, lavender |
| Neuroscience | Blue, cyan, electric teal |
| Longevity | Emerald green, teal, warm gold |
| Clinical Evidence | Purple, indigo, cool silver |
| Environmental Health | Amber, burnt orange, earth tones |
| Nutrition | Green, warm gold, earth tones |
| Fitness | Crimson, warm red, coral |
| Sleep Science | Navy, midnight blue, moonlit silver |
| Pharmacology | Teal, clinical blue, white |

---

## Key Don'ts

- Never use pure black (`#000`) or pure white (`#fff`) — use the warm `black`/`white` tokens
- Never hardcode hex values in components — use Tailwind tokens or CSS variables
- Never use cool grays — always stone palette
- Never use `transition: all` — specify properties
- Never scale/translate large cards on hover
- Never use `backdrop-blur` heavier than `md` (performance)
- Never use `100vh` — use `100dvh` for iOS compatibility
- Never put text on illustrations
