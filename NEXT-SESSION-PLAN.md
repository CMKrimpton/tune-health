# Next Session Plan

> **Status**: v15.4.0 live. ~167 articles. 8-stage pipeline + topic merge system. 16 legacy articles backfilled. Narration batch bug fixed.

---

## Current Architecture (v15.4.0)

- **Admin UI**: `client:only="react"` on all islands — no hydration, no server-render for admin components. All data fetched client-side via polling
- **Admin Editor** (`/admin/new`): generates article via `process-article` (Sonnet), then submits to pipeline (independence → QC → copy edit → publish)
- **Pipeline Upload** (Dashboard): "Upload Article to Pipeline" form with two modes — Full Chain (queues as topic) or Finished Article (straight to independence). Supports file drop (.pdf/.docx/.md/.html/.txt), URL fetch, paste. Server-side file parsing
- **Pipeline**: 8-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
  - Research → Editor Brief → Write (human) → Independence → QC → **Copy Edit** → Voice Polish → Publish
  - Copy Edit: Sonnet primary, Gemini Pro fallback. Confidence gate at 8/10 — only clearly better changes applied
- **Topic Merge System**: GPT-5.4 clusters queue semantically (29 clusters from 157 topics in first run) + Sonnet merges approved clusters. "Find Duplicates" button, per-topic checkboxes, already-published detection. `topic-merge` edge function proxied via `pipeline-admin`
- **Narration**: ElevenLabs `eleven_multilingual_v2`, voice `LkgZkNm7dD8b7nbdptAB`, stability 0.3, similarity 0.6, style 0.4. Batch force-regen now progresses through all articles (oldest-updated first)
- **QC protections**: manually queued and human-written articles cannot be killed or voice-rewritten
- **Mobile**: viewport-fit=cover on all pages, safe area insets, 44px touch targets, iOS auto-zoom prevention, responsive stat grid/nav/modals

## What Was Done This Session

1. **Intelligent topic merge system** — new `topic-merge` edge function with GPT-5.4 for semantic clustering and Sonnet for editorial merge. Admin UI with "Find Duplicates" button, cluster review with checkboxes, already-published detection, "Merged" filter tab. First run: 29 clusters from 157 topics + 51 already-published flags
2. **Batch narration force-regen fix** — was re-narrating same 20 newest articles repeatedly. Now orders by `updated_at ASC` and bumps timestamp after each narration
3. **16 legacy articles backfilled** into DB via seed endpoint
4. **DB migration** — extended `topic_queue.source` constraint to include `'merged'` and `'breaking'`

## Priority for Next Session

### 1. Use the Merge System to Clean Up Queue
- Run "Find Duplicates" from the dashboard
- Review and merge the 29 clusters (or re-run after this session's single test merge)
- Remove the 51 already-published duplicate topics
- Result: ~80-90 unique, high-quality topics ready for production

### 2. Produce Articles to Fill Content Gaps
- Queue has ~130+ topics but ZERO articles in: cardiology/cardiovascular, diabetes/metabolic, immunology, musculoskeletal, respiratory
- Queue new targeted topics for these gaps if nothing suitable exists after merge cleanup
- Pick 3-5 via dashboard, produce, write with Opus, verify end-to-end

### 3. Further Polish
- Monitor ElevenLabs credit usage (exhausted last cycle from bulk regen)
- Performance audit — Lighthouse scores, image optimization
- Tune Copy Edit confidence threshold if it's over/under-editing

### 4. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Real device testing on iPhone SE, iPhone 14 Pro, iPad
