# Next Session Plan

> **Status**: v13.0.0 live. Design system overhaul, topic nav bar, editorial manual page, View Transition flash fixed. 130 articles.

---

## Current Architecture (v13.0.0)

- **Topic nav bar**: persistent below header on all pages, links to `/articles?topic=X`. Hidden on homepage until scroll past hero. Hidden on mobile (MobileNav covers it)
- **Manual Produce only**: Admin clicks "Produce" → `produce-topic` → pg_net → research → chain-dispatch → editor brief → pause. No auto-production
- **Safety-net cron**: `dispatch_pipeline_stage()` runs every 5 min. Recovers stuck articles, advances in-progress stages. **Does NOT pick from queue**
- **View Transitions**: dark mode class applied via `astro:before-swap` to prevent light-mode flash
- **Design system**: no glow effects except `.btn-primary`, no card numbers, standardized spacing (`py-16 md:py-24` / `py-12 md:py-16`)

## What Was Fixed This Session

1. **Design system overhaul** — removed glow effects, card numbers, template patterns, emojis
2. **Topic navigation bar** — persistent category links below header on every page
3. **View Transition dark mode flash** — `astro:before-swap` applies `dark` class before DOM swap
4. **Command palette redesigned** — clean, no emojis, frosted glass, merged groups
5. **Spacing standardized** — two-value rhythm across all pages
6. **Subscribe page aligned** — container, button, input match site conventions
7. **Newsletter visual** — rotated card stack replaced with article list
8. **Editorial manual** — `/howwewrite` page published
9. **Dead CSS cleaned** — article-card-number, editorial-divider, zoom comments

## Priority for Next Session

### 1. Produce Articles
- Queue has 59 topics ready — good mix of everyday health + investigations
- Pick 3-5, produce, write with Opus, verify end-to-end

### 2. Articles Page Filtering
- Topic nav links to `/articles?topic=X` — verify filtering works correctly on View Transition navigation
- The `astro:after-swap` handler should re-run `initArticlesPage()` with new URL params

### 3. Content Gaps to Fill
- Common cold, allergies, back pain, headaches — everyday topics now in queue
- Heart health basics (blood pressure at 30, cholesterol)
- Women's health (periods, PCOS, UTIs)

### 4. Consider
- Queue cleanup: purge old completed items
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Add `/howwewrite` link to footer or about page
