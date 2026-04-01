# Next Session Plan

> **Status**: v16.8.0 live. ~186 published articles across 9 categories. Ultra audit complete — accessibility, visual polish, interaction, SEO, admin performance.

---

## Current Architecture (v16.8.0)

- **Navigation**: domain-grouped dropdown (Mind/Body/Medicine/Environment), TopicNav with per-category hover dropdowns, SideNav grouped by domain, MobileNav with improved scroll sensitivity
- **Breadcrumbs**: visual breadcrumbs on topic and collection pages (Home > Articles > Category)
- **Sort Dropdowns**: custom glass dropdowns (backdrop-blur, chevron animation, keyboard accessible) on articles index + category pages
- **Category Landing Pages**: `/topics/[slug]` — 9 pages with gradient hero, editorial metadata, featured article, sorted grid, breadcrumbs
- **Collections**: 5 curated themed reading lists at `/collections/[slug]` with breadcrumbs
- **Start Here**: `/start-here` — onboarding with 5 handpicked articles, editorial philosophy, domain browser
- **Author Bylines**: all articles use "Max Lundin" with model-specific roles
- **Reading Progress**: localStorage scroll tracking per article, "Continue Reading" section on homepage
- **Pipeline**: 8-stage + post-publish narration + illustration. Hybrid model (human writes with Opus). ~$0.13/article
- **Narration**: ElevenLabs TTS with admin voice settings panel (6 presets + custom sliders)
- **Security**: HSTS preload, CSP hardening, immutable asset caching
- **Admin**: Pipeline/Articles/Agents tabs. Admin CSS trimmed to 71.4KB (from 81.8KB)
- **Accessibility**: WCAG AA contrast on footer/newsletter, aria-pressed on narration, keyboard support on HighlightShare, focus-visible on SeriesNav dots
- **CommandPalette**: empty state with topic suggestions, focus restoration on close

## What Was Done This Session

1. **Accessibility & Contrast** — Footer links stone-400→300, fine print stone-600→500, Newsletter text stone-400→300, AudioNarration aria-pressed, SeriesNav focus rings + transitions, HighlightShare Escape/Tab keyboard support
2. **Visual Polish** — Scroll progress bar 2→3px, HighlightShare scale entry animation, Newsletter placeholder contrast
3. **Interaction** — CommandPalette empty state shows topic pills, focus restoration on close, share brand colors to CSS custom properties
4. **SEO** — Visual breadcrumbs on topic and collection pages
5. **Performance** — Admin CSS dead code removal (−10.4KB): legacy table, article card, modal selectors

## Priority for Next Session

### 1. Content Production
- Use merge system to clean up topic queue
- Produce articles to fill content gaps (cardiology, diabetes, immunology, musculoskeletal, respiratory)
- Pick 3-5 topics, produce, write with Opus, verify end-to-end

### 2. Visual Verification & Device Testing
- Test all changes on real iPhone (SE, 14 Pro) — breadcrumbs, contrast, SeriesNav, HighlightShare
- Verify CommandPalette empty state on mobile
- Check breadcrumbs truncation on narrow screens (375px)
- Light + dark mode verification on topic/collection pages

### 3. Narration Voice Tuning
- Listen to narrations generated with different presets, pick a house standard
- Consider logging voice settings per article for reproducibility

### 4. Further Polish
- Lighthouse audit on new pages (topic, collection with breadcrumbs)
- Add `updatedDate` to articles that have been revised
- Consider "Most Read" section (needs analytics/view counting)
- Newsletter integration with Beehiiv
- Consider adding share buttons to collection pages
