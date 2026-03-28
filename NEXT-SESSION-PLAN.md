# Next Session Plan

> **Status**: v13.0.0 live. 132 articles published. Site polish pass done — /howwewrite linked, footer topic links fixed.

---

## Current Architecture (v13.0.0)

- **Topic nav bar**: persistent below header on all pages, links to `/articles?topic=X`. Hidden on homepage until scroll past hero. Hidden on mobile (MobileNav covers it)
- **Manual Produce only**: Admin clicks "Produce" → `produce-topic` → pg_net → research → chain-dispatch → editor brief → pause. No auto-production
- **Safety-net cron**: `dispatch_pipeline_stage()` runs every 5 min. Recovers stuck articles, advances in-progress stages. **Does NOT pick from queue**
- **View Transitions**: dark mode class applied via `astro:before-swap` to prevent light-mode flash. Timing restored to 0.25s ease-out
- **Design system**: no glow effects except `.btn-primary`, no card numbers, standardized spacing (`py-16 md:py-24` / `py-12 md:py-16`)

## What Was Done This Session

1. **Articles page filtering verified** — TopicNav → `?topic=` → `initArticlesPage()` → case-insensitive match → card filtering. `astro:after-swap` re-initializes on View Transitions. Working correctly
2. **Footer topic links fixed** — were using `.toLowerCase().replace(/\s+/g, '-')` (hyphens), which broke filtering since articles page matches against raw category names with spaces. Fixed to `encodeURIComponent(cat)`
3. **`/howwewrite` linked** — added to footer Explore column and about page "How We Write" section

## Priority for Next Session

### 1. Produce Articles
- Queue has ~55+ topics ready — good mix of everyday health + investigations
- Pick 3-5, produce, write with Opus, verify end-to-end pipeline

### 2. Content Gaps to Fill
- Common cold, allergies, back pain, headaches — everyday topics in queue
- Heart health basics (blood pressure at 30, cholesterol)
- Women's health (periods, PCOS, UTIs)

### 3. Site Polish
- Queue cleanup: purge old completed items from `topic_queue`

### 4. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Performance audit — check Lighthouse scores, image optimization
- Mobile UX review — verify MobileNav, touch targets, safe areas on real device
