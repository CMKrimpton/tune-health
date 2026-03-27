# Next Session Plan

> **Status**: v12.9.0 live. Full UX/UI audit + navigation overhaul + search redesign + queue bug permanently killed. 127 articles, all clean.

---

## Current Architecture (v12.9.0)

- **Manual Produce only**: Admin clicks "Produce" → `produce-topic` → pg_net → research → chain-dispatch → editor brief → pause. No auto-production.
- **Safety-net cron**: `dispatch_pipeline_stage()` runs every 5 min. Recovers stuck articles, advances in-progress stages. **Does NOT pick from queue.**
- **Post-submit**: chain-dispatch → independence (Grok 4) → QC (Flash) → publish. Seconds to publish.
- **Queue tracking**: `queue_id` is a proper column on `daily_article_log` — can't be overwritten by research_data updates. Permanently fixed the "stuck at producing" bug.
- **Scout schedule**: 6am Gemini + Search, 2pm Grok/X, 10pm Grok/X. Mandatory 5+ everyday health topics per run.
- **Dedup**: 25% overlap + 3 matching words + 40+ domain stop words.
- **Search**: Command palette with category drill-down, tag matching, result counts. No more article dump on open.
- **Article cards**: 3/2 image ratio, flex column layout, no 2-row large card.
- **Encoding**: All GitHub read/write paths are UTF-8-safe.
- **Model config**: ALL model IDs centralized in `constants.ts` → `MODELS` object.

## What Was Fixed This Session

1. **Full UX/UI audit** — 8 files: card white space, broken TOC links, admin a11y, XSS, heading hierarchy
2. **Navigation overhaul** — articles page with category-grouped view, chip counts, next-in-category, URL state
3. **Animation stuttering** — in-viewport reveals instant after View Transitions
4. **Search redesign** — CommandPalette rebuilt with category browse, tag search, result counts
5. **Deep dive sharing** — share button per series with Web Share API
6. **Touch targets** — 44px minimum across Header, Footer, SideNav, ShareButtons
7. **Z-index hierarchy** — loader/SideNav/Header/MobileNav/back-to-top/noise properly layered
8. **Reduced motion** — admin.css + MobileNav respect `prefers-reduced-motion`
9. **ARIA** — progressbar values, breadcrumb separators, category chip pressed state
10. **Card proportions** — 3/2 image ratio, removed 2-row large card overlay
11. **Scout everyday topics** — mandatory 5+ per run, expanded topic list
12. **Grok/X 2 of 3 scout runs** — better social trend coverage
13. **Tighter dedup** — 25% threshold, 3+ words, 40+ stop words, cleaned 29 dupes
14. **"The" heading variety** — pipeline prompts enforce max 1-2 per article
15. **Queue stuck at producing** — permanent structural fix (queue_id column, not jsonb)

## What's Working
- Pipeline is manual-only: admin picks topics, clicks Produce
- Chain-dispatch works for all stages (research → editor → pause → submit → independence → QC → publish)
- Queue items correctly marked completed on publish (queue_id column)
- Scouts fill queue with everyday + investigative + trending mix
- All 127 articles are HTML-clean, encoding-clean, heading-hierarchy-clean
- Search is category-browsable with tag matching
- Touch targets WCAG compliant, z-index layered, reduced-motion supported

## Priority for Next Session

### 1. Produce Articles
- Queue has 59 topics ready — good mix of everyday health + investigations
- Pick 3-5, produce, write with Opus, verify end-to-end
- Verify queue_id fix holds (queue items marked completed on publish)

### 2. Content Gaps to Fill
- Common cold, allergies, back pain, headaches — everyday topics now in queue
- Heart health basics (blood pressure at 30, cholesterol)
- Women's health (periods, PCOS, UTIs)

### 3. Consider
- Queue cleanup: purge old completed items (150+ cluttering the DB)
- Category pages: dedicated `/articles/category/[name]` with descriptions
- Tag-based navigation: clickable tags that filter to articles page
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
