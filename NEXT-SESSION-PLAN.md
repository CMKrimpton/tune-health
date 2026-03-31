# Next Session Plan

> **Status**: v15.6.0 live. ~168 articles. 8-stage pipeline + topic merge system. UI ultra-audited + perf/a11y/security polish (90+ fixes across 29 files over 3 sessions).

---

## Current Architecture (v15.6.0)

- **Admin UI**: `client:only="react"` on all islands — no hydration, no server-render for admin components. All data fetched client-side via polling
- **Admin Editor** (`/admin/new`): generates article via `process-article` (Sonnet), then submits to pipeline (independence → QC → copy edit → publish)
- **Pipeline Upload** (Dashboard): "Upload Article to Pipeline" form with two modes — Full Chain (queues as topic) or Finished Article (straight to independence). Supports file drop (.pdf/.docx/.md/.html/.txt), URL fetch, paste. Server-side file parsing
- **Pipeline**: 8-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
  - Research → Editor Brief → Write (human) → Independence → QC → **Copy Edit** → Voice Polish → Publish
  - Copy Edit: Sonnet primary, Gemini Pro fallback. Confidence gate at 8/10 — only clearly better changes applied
- **Topic Merge System**: GPT-5.4 clusters queue semantically + Sonnet merges approved clusters. "Find Duplicates" button, per-topic checkboxes, already-published detection. `topic-merge` edge function proxied via `pipeline-admin`
- **Narration**: ElevenLabs `eleven_multilingual_v2`, voice `LkgZkNm7dD8b7nbdptAB`, stability 0.3, similarity 0.6, style 0.4
- **QC protections**: manually queued and human-written articles cannot be killed or voice-rewritten
- **Mobile**: viewport-fit=cover on all pages, safe area insets, 44px touch targets, iOS auto-zoom prevention, responsive stat grid/nav/modals
- **Security**: HSTS preload, CSP with base-uri/form-action/upgrade-insecure-requests, immutable asset caching

## What Was Done This Session

1. **Ultra polish** — 12 files changed, 148 insertions:
   - Performance: 22 `transition-all` eliminated (global.css + 6 pages), hero image CLS fix (width/height/decoding), immutable asset caching
   - Security: HSTS preload, CSP hardening (base-uri, form-action, upgrade-insecure-requests)
   - Accessibility: focus-visible on buttons, aria-hidden on decorative SVGs, aria-live on dynamic counts
   - Print: expanded stylesheet with page-break rules, heading orphan/widow control, dark mode resets
   - Admin design system: 60+ hardcoded hex → CSS variables, 5 new shade vars in admin.css

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

### 3. Visual Verification of UI Changes
- Spot-check the live site in light + dark mode after deploy
- Check: card hover effects (should only change shadow/border, no scale), focus rings, print preview
- Test on real device (iPhone) if possible — tap feedback, touch targets, safe areas
- Verify reduced motion preference works (System Preferences → Accessibility → Reduce Motion)

### 4. Further Polish (if time)
- Lighthouse scores — run audit, optimize any flagged items
- Tune Copy Edit confidence threshold if it's over/under-editing
- Monitor ElevenLabs credit usage

### 5. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Real device testing on iPhone SE, iPhone 14 Pro, iPad
