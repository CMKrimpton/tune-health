# Next Session Plan

> **Status**: v16.3.0 live. ~185 published articles across 9 categories. Admin pipeline redesigned with 2-row adaptive grid, wider dashboard, improved spacing.

---

## Current Architecture (v16.3.0)

- **Navigation**: domain-grouped dropdown (Mind/Body/Medicine/Environment), TopicNav with per-category hover dropdowns (tagline + 4 latest articles), SideNav grouped by domain
- **Category Landing Pages**: `/topics/[slug]` — 9 pages with gradient hero, editorial metadata, featured article, sorted grid, related topics
- **Collections**: 5 curated themed reading lists at `/collections/[slug]`
- **Start Here**: `/start-here` — onboarding with 5 handpicked articles, editorial philosophy, domain browser
- **Author Bylines**: all articles use "Max Lundin" with model-specific roles
- **Reading Progress**: localStorage scroll tracking per article, "Continue Reading" section on homepage
- **Pipeline**: 8-stage + post-publish narration + illustration. Hybrid model (human writes with Opus). Tightened heading/title word limits across all stages
- **Narration**: ElevenLabs TTS with admin voice settings panel (6 presets + custom sliders). Fire-and-forget batch dispatch
- **Security**: HSTS preload, CSP hardening, immutable asset caching
- **Admin Pipeline UI**: 2-row adaptive grid — Write card spans right column at full height, 5 post-write stages in bottom row. Dashboard max-width 1600px. Queue/Published 3fr/2fr split

## What Was Done This Session

1. **Pipeline stage layout redesign** — 2-row adaptive grid replaces cramped 7-equal-column layout. Write card spans right third at full height for hybrid workflow. Bottom row: Independence → QC → Voice Polish → Copy Edit → Publish
2. **Dashboard widened** — max-width 1400px → 1600px for header and main
3. **Queue/Published rebalanced** — 3fr/2fr split with larger gap (1.25rem)
4. **Spacing pass** — stats cards, pipeline cards, stage headers/bodies, status bar, section titles, opus box all improved
5. **3 responsive breakpoints** — 1400px, 1100px, 900px for clean degradation

## Priority for Next Session

### 1. Visual Verification & Polish
- Check TopicNav dropdowns on all pages — desktop hover, viewport edge clamping
- Verify homepage TopicNav hidden-until-scroll behavior (was reported as showing early)
- Check all category landing pages in light + dark mode
- Test "Continue Reading" section
- Real device testing (iPhone SE, iPhone 14 Pro, iPad)
- Verify admin pipeline layout on 1440px, 1280px, 1024px, 768px screens

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
