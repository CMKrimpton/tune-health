# Next Session Plan

> **Status**: v16.0.0 live. ~168 articles across 9 categories. Category landing pages, curated collections, Start Here onboarding, reading progress, author bylines, domain-grouped navigation.

---

## Current Architecture (v16.0.0)

- **Navigation**: domain-grouped dropdown (Mind/Body/Medicine/Environment) with article counts, TopicNav links to `/topics/[slug]`, SideNav grouped by domain
- **Category Landing Pages**: `/topics/[slug]` — 9 pages with gradient hero, editorial metadata, featured article, sorted grid, related topics
- **Collections**: 5 curated themed reading lists at `/collections/[slug]` — "Your Body Is Lying to You", "The Invisible Exposures", "Follow the Money", "Brain Deep Cuts", "The Sleep Files"
- **Start Here**: `/start-here` — onboarding with 5 handpicked articles, editorial philosophy, domain browser
- **Author Bylines**: dynamic from article JSON, shown in article hero + footer card
- **Reading Progress**: localStorage scroll tracking per article, "Continue Reading" section on homepage
- **Content Discovery**: clickable tags, sort/filter, "New" badges, narration badges, series indicators, reading list count badges
- **Pipeline**: 8-stage + post-publish narration + illustration. Hybrid model (human writes with Opus)
- **Security**: HSTS preload, CSP hardening, immutable asset caching

## What Was Done This Session

1. **Category domain system** — 4 editorial domains grouping 9 categories with metadata
2. **9 category landing pages** — `/topics/[slug]` with hero, featured article, sorted grid
3. **Navigation redesign** — dropdown, SideNav, TopicNav all use domain groupings
4. **Start Here page** — curated onboarding for new readers
5. **5 curated collections** — themed reading lists at `/collections/`
6. **Author bylines** — dynamic from JSON data, replacing hardcoded generic
7. **Reading progress** — scroll tracking + "Continue Reading" on homepage
8. **Content discovery badges** — "New" (7-day), narration, series indicators across all surfaces

## Priority for Next Session

### 1. Visual Verification & Polish
- Check all new pages in light + dark mode on desktop + mobile
- Verify dropdown menu layout on narrow screens (375px)
- Check category landing page heroes (gradient + text contrast)
- Verify reading progress tracking actually works (scroll an article, go home)
- Test "Continue Reading" section appearance/disappearance
- Verify author bylines on 5+ articles with different authors
- Check collections page card layouts

### 2. Content Production
- Use merge system to clean up topic queue
- Produce articles to fill content gaps (cardiology, diabetes, immunology, musculoskeletal, respiratory)
- Pick 3-5 topics, produce, write with Opus, verify end-to-end

### 3. Collection Curation
- Verify all 5 collections resolve their article slugs correctly
- Consider adding 2-3 more collections covering underrepresented domains
- Review editorial order within each collection

### 4. Further Polish
- Lighthouse audit on new pages
- Add `updatedDate` to articles that have been revised
- Consider "Most Read" section (needs analytics/view counting)
- Newsletter integration with Beehiiv
- Real device testing (iPhone SE, iPhone 14 Pro, iPad)
