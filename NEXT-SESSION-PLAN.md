# Next Session Plan

> **Status**: v14.4.0 live. ~140 articles. Pipeline upload form working. Admin dashboard stable with client:only rendering. Editor never kills manual topics.

---

## Current Architecture (v14.4.0)

- **Admin UI**: `client:only="react"` on all islands — no hydration, no server-render for admin components. All data fetched client-side via polling
- **Admin Editor** (`/admin/new`): generates article via `process-article` (Sonnet), then submits to pipeline (independence → QC → publish)
- **Pipeline Upload** (Dashboard): "Upload Article to Pipeline" form with two modes — Full Chain (queues as topic) or Finished Article (straight to independence). Supports file drop (.pdf/.docx/.md/.html/.txt), URL fetch, paste. Server-side file parsing
- **Pipeline**: 7-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
- **Editor override**: manually queued topics can never be killed by editor — concerns become structural notes in brief
- **Queue**: search + filter (Queued/All/Completed/Active), Requeue/Delete on completed items, sorted by expedite → priority → created_at

## What Was Done This Session

1. **Admin editor completely broken on Vercel** — env var, gradient crash, draft restore crash, preview iframe blocked. All fixed
2. **Pipeline integration** — ArticleEditor and dashboard upload both feed into production chain
3. **Upload Article to Pipeline** — two entry points (Full Chain / Finished Article), file upload, URL fetch, auto-title, drag-and-drop
4. **React hydration crash** — mammoth + pdfjs in client bundle caused hydration mismatch. Moved all file parsing server-side. Switched to `client:only="react"`
5. **Queue UX** — search, filter tabs, requeue/delete on completed items, sort fixed
6. **Housekeeping bug** — auto-completed fresh topics as duplicates within seconds. Now 2-hour grace period
7. **Editor killing manual topics** — overridden to approve with structural notes
8. **Voice rewrite loop** — admin-editor articles skip voice rewrite (Sonnet rewriting Sonnet is circular)

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

### 3. Admin Polish
- Mobile admin experience (responsive breakpoints)
- Queue: show total counts per filter tab
- Article table column headers in Articles tab

### 4. Narration Polish
- Sync narrationUrl into all GitHub JSON files
- Monitor ElevenLabs credit usage (Starter plan: 30K chars/mo)

### 5. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Performance audit — Lighthouse scores, image optimization
- Mobile UX review on real device
