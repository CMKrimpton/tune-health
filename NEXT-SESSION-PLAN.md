# Next Session Plan

> **Status**: v16.6.0 live. ~185 published articles across 9 categories. UX polish pass complete — navigation, dropdowns, transitions, admin spacing.

---

## Current Architecture (v16.6.0)

- **Navigation**: domain-grouped dropdown (Mind/Body/Medicine/Environment), TopicNav with per-category hover dropdowns (tagline + 4 latest articles, viewport-clamped), SideNav grouped by domain, MobileNav with improved scroll sensitivity
- **Sort Dropdowns**: custom glass dropdowns (backdrop-blur, chevron animation, keyboard accessible) on articles index + category pages — replaced native `<select>`
- **Category Landing Pages**: `/topics/[slug]` — 9 pages with gradient hero, editorial metadata, featured article, sorted grid, polished related topics
- **Collections**: 5 curated themed reading lists at `/collections/[slug]`
- **Start Here**: `/start-here` — onboarding with 5 handpicked articles, editorial philosophy, domain browser
- **Author Bylines**: all articles use "Max Lundin" with model-specific roles
- **Reading Progress**: localStorage scroll tracking per article, "Continue Reading" section on homepage with fade transition
- **Pipeline**: 8-stage + post-publish narration + illustration. Hybrid model (human writes with Opus). ~$0.13/article
- **Narration**: ElevenLabs TTS with admin voice settings panel (6 presets + custom sliders). Fire-and-forget batch dispatch
- **Security**: HSTS preload, CSP hardening, immutable asset caching
- **Admin Pipeline UI**: 2-row adaptive grid — Write card spans right column at full height, 5 post-write stages in bottom row. Dashboard max-width 1600px. Queue/Published 3fr/2fr split. Tightened animations (0.2s), consistent card padding

## What Was Done This Session

1. **TopicNav dropdown fixes** — vertical clamping (maxHeight based on viewport), small-screen width safety (min(320px, 100vw - 16px))
2. **MobileNav scroll sensitivity** — threshold 200→300px, dead zone 8→15px, directional lock (40px sustained movement)
3. **Continue Reading fade** — opacity + max-height CSS transition replaces instant display toggle
4. **Glass sort dropdowns** — custom dropdowns on articles/index and topics/[slug] replacing native `<select>`
5. **Related topics polish** — max-w-2xl containment, white card backgrounds, chevron arrows
6. **Admin pipeline spacing** — grid gaps 6→8px, standardized card padding, increased stage header padding
7. **Admin typography** — agent panel headers bumped 0.6875→0.75rem, increased padding
8. **Admin animations** — tightened 0.3s→0.2s across pipeline stages, cards, count badges, tabs

## Priority for Next Session

### 1. Visual Verification & Device Testing
- Test TopicNav dropdowns on various viewport sizes — confirm clamping works
- Test MobileNav scroll behavior on real iPhone (SE, 14 Pro)
- Verify glass sort dropdown on mobile touch devices
- Check all category landing pages in light + dark mode
- Test "Continue Reading" transition appearance

### 2. Content Production
- Use merge system to clean up topic queue
- Produce articles to fill content gaps (cardiology, diabetes, immunology, musculoskeletal, respiratory)
- Pick 3-5 topics, produce, write with Opus, verify end-to-end

### 3. Narration Voice Tuning
- Listen to narrations generated with different presets, pick a house standard
- Consider logging voice settings per article for reproducibility

### 4. Further Polish
- Lighthouse audit on new pages
- Add `updatedDate` to articles that have been revised
- Consider "Most Read" section (needs analytics/view counting)
- Newsletter integration with Beehiiv
- Dropdown menu layout check on narrow screens (375px)
