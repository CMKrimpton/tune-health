# Next Session Plan

> **Status**: v14.0.0 live. 133 articles. Bloomberg-style admin redesign shipped. Multi-source citation verification deployed. Editorial manual voice rewritten.

---

## Current Architecture (v14.0.0)

- **Admin UI**: Bloomberg terminal density — flat, compact, data-forward. No glass morphism or decorative effects
- **Stats bar**: horizontal ticker strip (8 cells, Inter tabular-nums)
- **AI Agents tab**: status strip (cron/pinger/db) → decision log table → QC + reader questions → illustrations
- **Pipeline**: 7-stage grid, scrollable stage bodies, compact cards
- **Citation verification**: 3-source cascade (PubMed → CrossRef → Semantic Scholar), returns PMIDs/DOIs
- **Topic nav bar**: persistent on all pages, links to `/articles?topic=X`
- **Manual Produce only**: Admin clicks "Produce" → chain-dispatch → editor brief → pause for human writing

## What Was Done This Session

1. **Footer topic links fixed** — were using hyphens instead of `encodeURIComponent`, breaking filtering
2. **`/howwewrite` linked** — footer Explore column + about page "How We Write" section
3. **Editorial manual rewritten** — voice archetypes (Prosecutor, Documentarian, Cartographer, Comedian), founding energy ("health obsessives who got tired of the math"), honest about 50/50 human/AI writing split
4. **Multi-source citation verification** — PubMed + CrossRef + Semantic Scholar cascade, PMIDs/DOIs returned, non-academic sources classified as skipped, research prompt requests DOIs
5. **Backfill citations button** — admin Database & Maintenance, re-verifies all published articles retroactively
6. **Admin UI Bloomberg redesign (v14.0.0)** — radii tightened 6/4/3px, decorative effects removed, stats ticker strip, header 44px, tabs uppercase, AI Agents tab restructured (status strip + decision log table + side-by-side tools), pipeline 7 stages, all spacing ~30% more compact
7. **CSS cleanup** — 167 lines dead CSS removed, button class mismatch fixed, px normalized to rem

## Priority for Next Session

### 1. Produce Articles
- Queue has ~55+ topics ready
- Pick 3-5, produce, write with Opus, verify end-to-end pipeline
- Run "Re-verify Citations" backfill to update all existing articles

### 2. Content Gaps to Fill
- Common cold, allergies, back pain, headaches
- Heart health basics (blood pressure at 30, cholesterol)
- Women's health (periods, PCOS, UTIs)

### 3. Admin UI Polish (post-redesign)
- Test all admin functionality on deployed Vercel (buttons, inline editing, pipeline controls)
- Mobile admin experience (responsive breakpoints)
- Consider: article table column headers in Articles tab

### 4. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Performance audit — Lighthouse scores, image optimization
- Mobile UX review — verify MobileNav, touch targets, safe areas on real device
