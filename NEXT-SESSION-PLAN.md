# Next Session Plan

> **Status**: v15.3.0 live. ~166 articles with narration. 8-stage pipeline. Narration/illustration GitHub sync fixed. ElevenLabs credits exhausted — resets next billing cycle.

---

## Current Architecture (v15.3.0)

- **Admin UI**: `client:only="react"` on all islands — no hydration, no server-render for admin components. All data fetched client-side via polling
- **Admin Editor** (`/admin/new`): generates article via `process-article` (Sonnet), then submits to pipeline (independence → QC → copy edit → publish)
- **Pipeline Upload** (Dashboard): "Upload Article to Pipeline" form with two modes — Full Chain (queues as topic) or Finished Article (straight to independence). Supports file drop (.pdf/.docx/.md/.html/.txt), URL fetch, paste. Server-side file parsing
- **Pipeline**: 8-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
  - Research → Editor Brief → Write (human) → Independence → QC → **Copy Edit** → Voice Polish → Publish
  - Copy Edit: Sonnet primary, Gemini Pro fallback. Confidence gate at 8/10 — only clearly better changes applied
- **Narration**: ElevenLabs `eleven_multilingual_v2`, voice `LkgZkNm7dD8b7nbdptAB`, stability 0.3, similarity 0.6, style 0.4. Both pipeline and admin panel now sync to GitHub JSON via `updateGitHubJson()`
- **Illustration**: GPT Image 1. Both pipeline and admin panel now sync to GitHub JSON via `updateGitHubJson()`
- **QC protections**: manually queued and human-written articles cannot be killed or voice-rewritten
- **Mobile**: viewport-fit=cover on all pages, safe area insets, 44px touch targets, iOS auto-zoom prevention, responsive stat grid/nav/modals

## What Was Done This Session

1. **Narration GitHub sync fix** — `generate-narration` and `generate-illustration` now sync to GitHub JSON after every generation (single + batch). Admin panel narrations/illustrations appear on the live site immediately
2. **Shared `updateGitHubJson()`** — extracted from `stage-publish` into `_shared/github.ts`. Removed ~110 lines of duplicated inline code
3. **Voice ID updated** to `LkgZkNm7dD8b7nbdptAB`
4. **Model switched** from `eleven_v3` to `eleven_multilingual_v2`
5. **Settings tuned** — stability 0.3, similarity 0.6, style 0.4
6. **Regenerated all narrations** (~166 articles) with new voice/model/settings
7. **Admin CSS fix** — narration Generate button no longer gets cut off by long titles

## Priority for Next Session

### 1. Fix Batch Force-Regen Bug
- `force: true` batch re-narrates the same recent articles repeatedly (ordered by `publish_date DESC`). The DB query doesn't track which articles were already regenerated in the current batch run
- Fix: add `updated_at` check or batch offset, or track "last_narration_generated_at" timestamp

### 2. Backfill 16 Legacy Articles into DB
- 16 articles exist on GitHub but have no `articles` table record: boredom-is-a-superpower, certainty-dealers-wellness-industry, examined-life-overrated, free-will-debate-opus, free-will-debate-opus-extended, human-proclivity-religion-psychology, kids-who-learned-not-to-need, least-curious-question-why, ninos-que-aprendieron-no-necesitar, shingles-vaccine-heart-protection, thyroid-cancer-conversation, thyroid-fetal-blueprint, thyroid-poisoned-well, thyroid-rebuilding, thyroid-war-within, your-doctor-cant-answer-that
- 2 more have descriptions too short: 49ers-injuries-emf-substation-theory, non-opioid-painkillers-ngf-sodium-blockers

### 3. Produce Articles
- Queue has ~130 topics ready
- Pick 3-5 via dashboard, produce, write with Opus, verify end-to-end

### 4. Content Gaps to Fill
- Cardiology / cardiovascular (ZERO articles — #1 killer)
- Diabetes / metabolic syndrome (near-zero)
- Immunology beyond vaccines (ZERO)
- Musculoskeletal / back pain / arthritis (ZERO)
- Respiratory (ZERO — no asthma, COPD)

### 5. Further Polish
- Monitor ElevenLabs credit usage (exhausted this cycle from bulk regen)
- Performance audit — Lighthouse scores, image optimization
- Tune Copy Edit confidence threshold if it's over/under-editing

### 6. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Real device testing on iPhone SE, iPhone 14 Pro, iPad
