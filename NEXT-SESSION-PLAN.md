# Next Session Plan

> **Status**: v14.2.0 live. ~138 articles. Admin auth + error handling overhauled. Narration data visible in admin.

---

## Current Architecture (v14.2.0)

- **Admin UI**: Bloomberg terminal density — flat, compact, data-forward. All save/update operations now authenticated and error-reported
- **Pipeline**: 7-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
- **Narration**: ElevenLabs v3, "Frontline" custom voice, reads article description. Speaker icon in article metadata bar. Admin shows narration coverage in stats bar + per-article indicators
- **Citation verification**: 3-source cascade (PubMed → CrossRef → Semantic Scholar)
- **Manual Produce only**: Admin clicks "Produce" → chain-dispatch → editor brief → pause for human writing

## What Was Done This Session

1. **Full admin audit** — traced every fetch call, event handler, and state flow across all 4 admin React components + edit page
2. **Critical auth fix** — edit page `doSaveMetadata()`, `doSaveContent()`, save-refined-article all missing Authorization headers → 401 on every save. Root cause of "editing completely broken"
3. **PipelineMonitor auth consistency** — added auth to `produce-topic`, `submit-article`, `clearAllBriefs`
4. **Error feedback overhaul** — 7 silent `catch {}` blocks now show toast feedback via `flashFeedback` system. 6 missing `res.ok` checks added
5. **Autosave hardening** — mutex prevents concurrent saves, refine results no longer trigger redundant autosave, status messages auto-clear
6. **ArticleEditor fixes** — 3 DB saves now check response status, draft persistence includes initial chat/snapshot, DOCX error clears status
7. **Narration data in admin** — stats bar "Narrated" count, per-article 🔊/🔇 indicator, edit page narration URL field, `narration_url` in type system
8. **Replaced `dangerouslySetInnerHTML`** in AgentsPanel illustration results with safe JSX

## Priority for Next Session

### 1. Produce Articles
- Queue has ~55+ topics ready
- Pick 3-5, produce, write with Opus, verify end-to-end pipeline
- Test that admin saves now work correctly on deployed Vercel

### 2. Content Gaps to Fill
- Common cold, allergies, back pain, headaches
- Heart health basics (blood pressure at 30, cholesterol)
- Women's health (periods, PCOS, UTIs)

### 3. Admin UI Polish (Remaining)
- Mobile admin experience (responsive breakpoints)
- Article table column headers in Articles tab
- Test all admin functionality on deployed Vercel after this fix

### 4. Narration Polish
- Sync narrationUrl into all GitHub JSON files (backfill only updates DB, not GitHub)
- Consider: narration for article body sections (not just description)
- Monitor ElevenLabs credit usage (Starter plan: 30K chars/mo)

### 5. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Performance audit — Lighthouse scores, image optimization
- Mobile UX review — verify MobileNav, touch targets, safe areas on real device
