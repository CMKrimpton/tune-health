# Next Session Plan

> **Status**: v16.1.0 live. ~184 published articles across 9 categories. TopicNav dropdowns, voice settings panel, tightened heading prompts, unified author bylines.

---

## Current Architecture (v16.1.0)

- **Navigation**: domain-grouped dropdown (Mind/Body/Medicine/Environment), TopicNav with per-category hover dropdowns (tagline + 4 latest articles), SideNav grouped by domain
- **Category Landing Pages**: `/topics/[slug]` — 9 pages with gradient hero, editorial metadata, featured article, sorted grid, related topics
- **Collections**: 5 curated themed reading lists at `/collections/[slug]`
- **Start Here**: `/start-here` — onboarding with 5 handpicked articles, editorial philosophy, domain browser
- **Author Bylines**: all articles use "Max Lundin" with model-specific roles
- **Reading Progress**: localStorage scroll tracking per article, "Continue Reading" section on homepage
- **Pipeline**: 8-stage + post-publish narration + illustration. Hybrid model (human writes with Opus). Tightened heading/title word limits across all stages
- **Narration**: ElevenLabs TTS with admin voice settings panel (6 presets + custom sliders). Fire-and-forget batch dispatch
- **Security**: HSTS preload, CSP hardening, immutable asset caching

## What Was Done This Session

1. **Section heading prompt overhaul** — all pipeline stages now enforce 4-8 word h2 headings with banned patterns
2. **Title word limits tightened** — "target 5-8, hard cap 10" replaces soft "max 10" across 7 files
3. **TopicNav hover dropdowns** — glass dropdown per category with tagline, latest articles, badges
4. **Author unification** — all 153 articles + MODEL_BYLINES → "Max Lundin"
5. **Voice settings panel** — 6 ElevenLabs presets + custom sliders in admin narration panel
6. **Batch narration fix** — fire-and-forget dispatch replaces sequential processing (timeout fix)
7. **Narration UI fixes** — published-only counts, title instead of slug in results

## Priority for Next Session

### 1. Visual Verification & Polish
- Check TopicNav dropdowns on all pages — desktop hover, viewport edge clamping
- Verify homepage TopicNav hidden-until-scroll behavior (was reported as showing early)
- Check all category landing pages in light + dark mode
- Test "Continue Reading" section
- Real device testing (iPhone SE, iPhone 14 Pro, iPad)

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
