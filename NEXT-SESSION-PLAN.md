# Next Session Plan

> **Status**: v15.1.1 live. ~140 articles. 8-stage pipeline. Editorial quality overhaul complete. Copy Brief, queue delete, and editor kill override all fixed. Single source of truth for writer brief (server-side).

---

## Current Architecture (v15.0.0)

- **Admin UI**: `client:only="react"` on all islands — no hydration, no server-render for admin components. All data fetched client-side via polling
- **Admin Editor** (`/admin/new`): generates article via `process-article` (Sonnet), then submits to pipeline (independence → QC → copy edit → publish)
- **Pipeline Upload** (Dashboard): "Upload Article to Pipeline" form with two modes — Full Chain (queues as topic) or Finished Article (straight to independence). Supports file drop (.pdf/.docx/.md/.html/.txt), URL fetch, paste. Server-side file parsing
- **Pipeline**: 8-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
  - Research → Editor Brief → Write (human) → Independence → QC → **Copy Edit** → Voice Polish → Publish
  - Copy Edit: Sonnet primary, Gemini Pro fallback. Confidence gate at 8/10 — only clearly better changes applied
- **Narration Agent**: admin panel for batch/single narration generation. Voice ID `rmcMTKMrh0yz0C1KMQPs`
- **QC protections**: manually queued and human-written articles cannot be killed or voice-rewritten
- **Mobile**: viewport-fit=cover on all pages, safe area insets, 44px touch targets, iOS auto-zoom prevention, responsive stat grid/nav/modals
- **Accessibility**: aria-live regions for newsletter, label/id pairing, focus-visible on all interactive elements, aria-hidden on decorative SVGs

## What Was Done This Session

1. **Narration Agent panel** — admin AI Agents tab, side-by-side with Illustrations. Single/batch generate, regenerate all
2. **Voice ID updated** to `rmcMTKMrh0yz0C1KMQPs` in centralized constants
3. **QC kill override** — manually queued (`_fromQueue`) and human-written articles force-publish instead of being killed
4. **Copy Edit stage** (stage 8) — Sonnet reviews headline, description, H2/H3 headers. Confidence gate at 8/10. Non-blocking on failure
5. **data-callout CSS class** — proper styling for methodology notes/caveats. Replaced yellow notepad inline styles
6. **Writer inline style ban** — stage-write prompt forbids `style=""` and hardcoded colors
7. **Admin crash fix** — `copy_edit` added to PipelineStage type, PIPELINE_STAGES, STAGE_LABELS, stageLogsMap

## Priority for Next Session

### 1. Produce Articles
- Queue has ~130 topics ready
- Pick 3-5 via dashboard, produce, write with Opus, verify end-to-end
- **Test the Copy Edit stage** — watch an article flow through and verify it doesn't over-edit
- Test the upload-to-pipeline flow with a real PDF/article

### 2. Content Gaps to Fill
- Cardiology / cardiovascular (ZERO articles — #1 killer)
- Diabetes / metabolic syndrome (near-zero)
- Immunology beyond vaccines (ZERO)
- Musculoskeletal / back pain / arthritis (ZERO)
- Respiratory (ZERO — no asthma, COPD)

### 3. Further Polish
- Narration: sync narrationUrl into all GitHub JSON files
- Monitor ElevenLabs credit usage (Starter plan: 30K chars/mo)
- Performance audit — Lighthouse scores, image optimization
- Tune Copy Edit confidence threshold if it's over/under-editing

### 4. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Real device testing on iPhone SE, iPhone 14 Pro, iPad
