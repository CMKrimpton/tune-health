# Next Session Plan

> **Status**: v14.5.0 live. ~140 articles. Full mobile audit complete — touch targets, safe areas, accessibility. Admin responsive on all iPhones.

---

## Current Architecture (v14.5.0)

- **Admin UI**: `client:only="react"` on all islands — no hydration, no server-render for admin components. All data fetched client-side via polling
- **Admin Editor** (`/admin/new`): generates article via `process-article` (Sonnet), then submits to pipeline (independence → QC → publish)
- **Pipeline Upload** (Dashboard): "Upload Article to Pipeline" form with two modes — Full Chain (queues as topic) or Finished Article (straight to independence). Supports file drop (.pdf/.docx/.md/.html/.txt), URL fetch, paste. Server-side file parsing
- **Pipeline**: 7-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
- **Mobile**: viewport-fit=cover on all pages, safe area insets, 44px touch targets, iOS auto-zoom prevention, responsive stat grid/nav/modals
- **Accessibility**: aria-live regions for newsletter, label/id pairing, skip links, ARIA landmarks

## What Was Done This Session

1. **Full mobile audit** — 3 parallel audits (public mobile, admin mobile, accessibility/SEO) across all components
2. **HighlightShare 44px touch targets** — expanded from 36px on touch devices
3. **FloatingTOC safe-area** — pill now respects notch bottom inset, text not selectable
4. **ShareButtons gap** — widened from 4px to 8px for touch safety
5. **viewport-fit=cover** — added to all 5 page templates (BaseLayout + 4 admin pages)
6. **Admin mobile overhaul** — stat grid responsive (3→2 col), 44px nav/button targets, iOS zoom prevention, safe area insets, modal viewport safety, iPhone SE breakpoint
7. **Newsletter accessibility** — label/id pairing, aria-live status announcements, autocomplete
8. **Input zoom prevention** — articles search and all admin inputs at 16px+ on touch

## Priority for Next Session

### 1. Produce Articles
- Queue has ~130 topics ready
- Pick 3-5 via dashboard, produce, write with Opus, verify end-to-end
- Test the upload-to-pipeline flow with a real PDF/article

### 2. Content Gaps to Fill
- Cardiology / cardiovascular (ZERO articles — #1 killer)
- Diabetes / metabolic syndrome (near-zero)
- Immunology beyond vaccines (ZERO)
- Musculoskeletal / back pain / arthritis (ZERO)
- Respiratory (ZERO — no asthma, COPD)

### 3. Further Polish
- Queue: show total counts per filter tab
- Article table column headers in Articles tab
- Narration: sync narrationUrl into all GitHub JSON files
- Monitor ElevenLabs credit usage (Starter plan: 30K chars/mo)

### 4. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Performance audit — Lighthouse scores, image optimization
- Real device testing on iPhone SE, iPhone 14 Pro, iPad
