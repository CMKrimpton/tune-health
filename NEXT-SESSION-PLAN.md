# Next Session Plan

> **Status**: v14.1.0 live. ~138 articles. ElevenLabs TTS narration deployed. All articles backfilled with intro narrations.

---

## Current Architecture (v14.1.0)

- **Admin UI**: Bloomberg terminal density — flat, compact, data-forward
- **Pipeline**: 7-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
- **Narration**: ElevenLabs v3, "Frontline" custom voice, reads article description. Speaker icon in article metadata bar. localStorage opt-in auto-plays on subsequent articles. `generate-narration` edge function, `article-narrations` storage bucket
- **Citation verification**: 3-source cascade (PubMed → CrossRef → Semantic Scholar)
- **Manual Produce only**: Admin clicks "Produce" → chain-dispatch → editor brief → pause for human writing

## What Was Done This Session

1. **ElevenLabs TTS narration for all articles** — custom "Frontline" voice reads article descriptions
2. **Voice tuning** — stability 0.3, similarity 0.7, style 0.6, speaker boost on (tested multiple combinations)
3. **`generate-narration` edge function** — extracts description, calls ElevenLabs v3, uploads MP3 to Supabase Storage, updates DB. Supports `generate` (single) and `batch` (bulk backfill)
4. **Pipeline wired** — `stage-publish` auto-generates narration post-publish, updates GitHub JSON, triggers Vercel rebuild
5. **Elegant UX** — small speaker icon inline with metadata (category / date / read time / 🔊). localStorage preference: first tap enables, subsequent articles auto-play, tap to mute
6. **Content schema updated** — `narrationUrl` in Zod schema, Article interface, mapArticle
7. **All ~138 articles backfilled** with narration audio

## Priority for Next Session

### 1. Produce Articles
- Queue has ~55+ topics ready
- Pick 3-5, produce, write with Opus, verify end-to-end pipeline (now includes narration)

### 2. Content Gaps to Fill
- Common cold, allergies, back pain, headaches
- Heart health basics (blood pressure at 30, cholesterol)
- Women's health (periods, PCOS, UTIs)

### 3. Narration Polish
- Sync narrationUrl into all GitHub JSON files (backfill only updates DB, not GitHub)
- Consider: narration for article body sections (not just description)
- Monitor ElevenLabs credit usage (Starter plan: 30K chars/mo)

### 4. Admin UI Polish
- Test all admin functionality on deployed Vercel
- Mobile admin experience (responsive breakpoints)
- Article table column headers in Articles tab

### 5. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Performance audit — Lighthouse scores, image optimization
- Mobile UX review — verify MobileNav, touch targets, safe areas on real device
