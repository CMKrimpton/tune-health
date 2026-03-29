# Next Session Plan

> **Status**: v14.6.0 live. ~140 articles. Admin UX polish complete — styled modals, ARIA tabs, dialog a11y, fetch timeouts.

---

## Current Architecture (v14.5.1)

- **Admin UI**: `client:only="react"` on all islands — no hydration, no server-render for admin components. All data fetched client-side via polling
- **Admin Editor** (`/admin/new`): generates article via `process-article` (Sonnet), then submits to pipeline (independence → QC → publish)
- **Pipeline Upload** (Dashboard): "Upload Article to Pipeline" form with two modes — Full Chain (queues as topic) or Finished Article (straight to independence). Supports file drop (.pdf/.docx/.md/.html/.txt), URL fetch, paste. Server-side file parsing
- **Pipeline**: 7-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
- **Mobile**: viewport-fit=cover on all pages, safe area insets, 44px touch targets, iOS auto-zoom prevention, responsive stat grid/nav/modals
- **Accessibility**: aria-live regions for newsletter, label/id pairing, focus-visible on all interactive elements, aria-hidden on decorative SVGs

## What Was Done This Session

1. **Styled confirm modals** — replaced all 13 native `confirm()` dialogs with ConfirmModal component (glass morphism, focus trapping, Escape, entrance animation)
2. **useConfirm hook** — Promise-based async confirm that replaces `if (confirm(...))` pattern
3. **ARIA tab roles** — dashboard tabs + edit page tabs: `role="tablist/tab/tabpanel"`, `aria-selected`, arrow key nav, roving tabindex
4. **Dialog accessibility** — `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, auto-focus on cancel
5. **fetchWithTimeout utility** — 60s AbortController-based timeout on all 37 admin fetch calls
6. **ArticlesManager modal upgrade** — delete + bulk delete modals now use ConfirmModal component
7. **Edit page vanilla modals** — `styledConfirm()` function for publish/delete in inline scripts

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

### 3. Admin UX Polish (from audit) ✓ DONE
- ~~Replace native `confirm()` dialogs with styled modals in admin components~~
- ~~Add proper ARIA tab roles to dashboard tab navigation~~
- ~~Add `role="dialog"` and focus trapping to delete confirmation modals~~
- ~~Request timeout handling on all admin fetch calls~~

### 4. Further Polish
- Narration: sync narrationUrl into all GitHub JSON files
- Monitor ElevenLabs credit usage (Starter plan: 30K chars/mo)
- Performance audit — Lighthouse scores, image optimization

### 5. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Real device testing on iPhone SE, iPhone 14 Pro, iPad
