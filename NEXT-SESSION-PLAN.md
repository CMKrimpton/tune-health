# Next Session Plan

> **Status**: v14.5.1 live. ~140 articles. Full UI audit complete — focus-visible, z-index, accessibility, dead CSS cleanup.

---

## Current Architecture (v14.5.1)

- **Admin UI**: `client:only="react"` on all islands — no hydration, no server-render for admin components. All data fetched client-side via polling
- **Admin Editor** (`/admin/new`): generates article via `process-article` (Sonnet), then submits to pipeline (independence → QC → publish)
- **Pipeline Upload** (Dashboard): "Upload Article to Pipeline" form with two modes — Full Chain (queues as topic) or Finished Article (straight to independence). Supports file drop (.pdf/.docx/.md/.html/.txt), URL fetch, paste. Server-side file parsing
- **Pipeline**: 7-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
- **Mobile**: viewport-fit=cover on all pages, safe area insets, 44px touch targets, iOS auto-zoom prevention, responsive stat grid/nav/modals
- **Accessibility**: aria-live regions for newsletter, label/id pairing, focus-visible on all interactive elements, aria-hidden on decorative SVGs

## What Was Done This Session

1. **Full UI audit** — 3 parallel deep audits (public components, pages/layouts/CSS, admin UI)
2. **Focus-visible keyboard navigation** — global styles for all interactive elements
3. **Z-index hierarchy fix** — clear stacking: ShareBar (35) < TOC (40) < MobileNav (45) < Back-to-top (46)
4. **Decorative SVGs** — `aria-hidden="true"` on 12 icons across 6 components
5. **FloatingTOC design tokens** — 12 hardcoded `rgb()` → `theme()` functions
6. **AudioNarration error state** — visual feedback on audio load failure
7. **Newsletter accessibility** — `role="status"` on aria-live region
8. **Dead CSS cleanup** — removed ~150 lines of unused classes from global.css
9. **Reveal animation performance** — `will-change` hints

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

### 3. Admin UX Polish (from audit)
- Replace native `confirm()` dialogs with styled modals in admin components
- Add proper ARIA tab roles to dashboard tab navigation
- Add `role="dialog"` and focus trapping to delete confirmation modals
- Request timeout handling on all admin fetch calls

### 4. Further Polish
- Narration: sync narrationUrl into all GitHub JSON files
- Monitor ElevenLabs credit usage (Starter plan: 30K chars/mo)
- Performance audit — Lighthouse scores, image optimization

### 5. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Real device testing on iPhone SE, iPhone 14 Pro, iPad
