# Next Session Plan

> **Status**: v14.3.0 live. ~139 articles. Admin editor fixed and pipeline-integrated. First article published via editor → pipeline flow.

---

## Current Architecture (v14.3.0)

- **Admin UI**: Bloomberg terminal density — flat, compact, data-forward. All save/update operations authenticated and error-reported
- **Admin Editor** (`/admin/new`): generates article via `process-article` (Sonnet), then submits to pipeline (independence → QC → publish). No more direct GitHub publish bypass
- **Pipeline**: 7-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
- **Narration**: ElevenLabs v3, "Frontline" custom voice, reads article description
- **Citation verification**: 3-source cascade (PubMed → CrossRef → Semantic Scholar)
- **Manual Produce only**: Admin clicks "Produce" → chain-dispatch → editor brief → pause for human writing

## What Was Done This Session

1. **Admin editor completely broken** — `getApiBase()` used optional chaining (`?.`) which Vite doesn't statically replace. Fixed by passing `apiBase` as server-side prop
2. **Gradient crash** — `process-article` doesn't return gradient; editor crashed. Fixed with category-based defaults and guards on draft restore
3. **Preview iframe blocked** — `X-Frame-Options: DENY` → `SAMEORIGIN`
4. **Pipeline integration** — new `submit-new-article` action creates pipeline log + dispatches to independence. "Publish to GitHub" → "Submit to Pipeline"
5. **Voice rewrite loop** — admin-editor articles (Sonnet) got stuck in voice rewrite (also Sonnet). QC now skips voice rewrite for `_writtenBy: "admin-editor"`
6. **First pipeline article from editor** — "Biology's Machine Metaphor Is Broken" published end-to-end through the new flow

## Priority for Next Session

### 1. Produce Articles
- Queue has ~55+ topics ready
- Pick 3-5, produce, write with Opus, verify end-to-end pipeline
- Test admin editor flow again with a real article

### 2. Content Gaps to Fill
- Common cold, allergies, back pain, headaches
- Heart health basics (blood pressure at 30, cholesterol)
- Women's health (periods, PCOS, UTIs)

### 3. Admin UI Polish (Remaining)
- Mobile admin experience (responsive breakpoints)
- Article table column headers in Articles tab
- Test all admin functionality on deployed Vercel after these fixes

### 4. Narration Polish
- Sync narrationUrl into all GitHub JSON files (backfill only updates DB, not GitHub)
- Consider: narration for article body sections (not just description)
- Monitor ElevenLabs credit usage (Starter plan: 30K chars/mo)

### 5. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Performance audit — Lighthouse scores, image optimization
- Mobile UX review — verify MobileNav, touch targets, safe areas on real device
