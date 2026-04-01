# Next Session Plan

> **Status**: v15.7.0 live. ~168 articles. 8-stage pipeline + topic merge. Content discovery UX overhaul (clickable tags, sort/filter, badges, reading list enhancements).

---

## Current Architecture (v15.7.0)

- **Admin UI**: `client:only="react"` on all islands — no hydration, no server-render for admin components. All data fetched client-side via polling
- **Admin Editor** (`/admin/new`): generates article via `process-article` (Sonnet), then submits to pipeline (independence → QC → copy edit → publish)
- **Pipeline Upload** (Dashboard): "Upload Article to Pipeline" form with two modes — Full Chain (queues as topic) or Finished Article (straight to independence). Supports file drop (.pdf/.docx/.md/.html/.txt), URL fetch, paste. Server-side file parsing
- **Pipeline**: 8-stage + post-publish narration (ElevenLabs TTS) + illustration (GPT Image)
  - Research → Editor Brief → Write (human) → Independence → QC → **Copy Edit** → Voice Polish → Publish
  - Copy Edit: Sonnet primary, Gemini Pro fallback. Confidence gate at 8/10 — only clearly better changes applied
- **Topic Merge System**: GPT-5.4 clusters queue semantically + Sonnet merges approved clusters. "Find Duplicates" button, per-topic checkboxes, already-published detection. `topic-merge` edge function proxied via `pipeline-admin`
- **Content Discovery**: clickable tags → `/articles?tag=X`, sort dropdown (newest/oldest/shortest/longest/A-Z), keyword search, "New" badges (7-day), narration badges, series indicators, reading list count badges, total read time
- **Mobile**: viewport-fit=cover on all pages, safe area insets, 44px touch targets, iOS auto-zoom prevention, responsive stat grid/nav/modals, reading list count on mobile nav
- **Security**: HSTS preload, CSP with base-uri/form-action/upgrade-insecure-requests, immutable asset caching

## What Was Done This Session

1. **Content discovery UX overhaul** — 10 files changed:
   - Clickable tags on article pages → `/articles?tag=X` filtering
   - Sort dropdown on articles index (Newest, Oldest, Shortest, Longest, A-Z)
   - Keywords added to search (previously title + tags only)
   - "New" badge (7-day window) on homepage, articles index, category overview cards
   - Audio narration badge (speaker icon) on cards with narration
   - Series indicator ("Part X of Y") on ArticleCard component
   - "Updated" date shown in article hero when updatedDate differs from publishDate
   - Active filter bar with tag pill + clear buttons
   - Reading list: total read time, sort options (5 modes)
   - Reading list count badge on SideNav + MobileNav
   - SideNav "New" badge fixed to 7-day window (was all featured)
   - Article interface: added updatedDate, keywords fields + isNewArticle/getAllTags/getSeriesTotal helpers

## Priority for Next Session

### 1. Use the Merge System to Clean Up Queue
- Run "Find Duplicates" from the dashboard
- Review and merge duplicate clusters
- Remove already-published duplicate topics
- Result: clean, deduplicated topic queue

### 2. Produce Articles to Fill Content Gaps
- Queue has topics but ZERO articles in: cardiology/cardiovascular, diabetes/metabolic, immunology, musculoskeletal, respiratory
- Queue new targeted topics for these gaps if nothing suitable exists after merge cleanup
- Pick 3-5 via dashboard, produce, write with Opus, verify end-to-end

### 3. Visual Verification of UX Changes
- Spot-check live site in light + dark mode:
  - "New" badges on recent articles (verify 7-day window)
  - Narration badges on articles with audio
  - Tag click → articles index filtered view
  - Sort dropdown behavior (all 5 options)
  - Reading list count badges on SideNav + MobileNav
  - Reading list sort options + total read time
  - Active filter bar with clear buttons
- Test on real device (iPhone) — touch targets, badges, sort dropdown

### 4. Further Polish (if time)
- Lighthouse scores — run audit, optimize flagged items
- Add `updatedDate` to articles that have been revised (currently no articles use it)
- Tune Copy Edit confidence threshold if it's over/under-editing
- Monitor ElevenLabs credit usage

### 5. Consider
- Newsletter integration with Beehiiv (per NEWSLETTER-STRATEGY.md)
- Real device testing on iPhone SE, iPhone 14 Pro, iPad
- Popular/trending section (would need analytics data)
