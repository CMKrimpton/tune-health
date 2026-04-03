# Next Session Plan

> **Status**: v18.6.0 live. ~192 published articles across 9 categories. Social Media System producing quality output with sharp, confrontational voice: follow-the-money framing, named institutions/dollar amounts, forensic skepticism. Dashboard UI polished with readable font sizes.

---

## What Was Done This Session (v18.6.0 — Social Dashboard UI + Voice Overhaul)

### Dashboard UI Polish
- **Systematic font-size bump** — every tier bumped one step up across the board (panel titles, body text, rows, mono, buttons, pills, micro labels, stat values)
- **Increased spacing** — row height 32→36px, panel padding, pill padding, button touch targets
- **Expanded post preview** — larger font, more max-height for reading content

### Social Voice Overhaul — "Receipts, Not Vibes"
- **All 4 persona voices rewritten** — sharper, younger, more Bill Maher energy
- **Brand**: second-person address, gut-punch stats, "You've been told X. The data says Y."
- **Reporter**: "I read the actual paper, not the press release" — names sample sizes, funding sources
- **Skeptic**: forensic follow-the-money — John Oliver compressed to 280 chars
- **Curator**: surprise pattern-finder connecting disparate studies
- **Engine prompts updated** — requires dollar amounts, institution names, at least one funny line
- **Choreography templates rewritten** for the new voice direction

### Research & Strategy
- Analyzed Health Ranger rhetorical patterns (hooks, follow-the-money, direct address)
- Adapted structure for evidence-based journalism: same engagement, verifiable citations
- Key insight: the gap in the market is forensic institutional skepticism with receipts

### Tested & Deployed
- Generated social content for seed-oils-aha-funding-cardiovascular-evidence with new voice
- Quotable output: "The AHA didn't follow the science. It followed the $1.7 million."
- 2 functions deployed: social-engine, social-writer

## Current Architecture (v18.4.0)

- **Navigation**: domain-grouped dropdown (Mind/Body/Medicine/Environment), TopicNav with per-category hover dropdowns, SideNav grouped by domain, MobileNav with improved scroll sensitivity, QuickNav floating pill
- **Pipeline**: 8-stage hybrid model (human writes with Opus). ~$0.13/article. Chain-dispatch via pg_net with error logging
- **Admin**: Pipeline/Articles/Agents/Social tabs. Supabase Realtime live updates. Batch API for Social tab
- **Social Media System**: 8 tables, 4 AI personas, 14 platform configs, 6 edge functions (engine + writer + poster + planner + sync + admin), 3 cron jobs, Bloomberg-inspired dashboard with setup guide. Input validation on all endpoints. Stuck recovery on writer. Draft auto-move on poster

## Priority for Next Session

### 1. Platform Account Setup (CRITICAL — system needs credentials to actually post)
- **Bluesky**: Create account on bsky.app → Settings → App Passwords → Add
  - `supabase secrets set BLUESKY_HANDLE=alumihealth.bsky.social BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx`
  - `UPDATE social_platform_config SET api_configured = true WHERE platform = 'bluesky';`
- **Reddit**: Create app at reddit.com/prefs/apps → Script type
  - `supabase secrets set REDDIT_CLIENT_ID=xxx REDDIT_CLIENT_SECRET=xxx REDDIT_USERNAME=xxx REDDIT_PASSWORD=xxx`
  - `UPDATE social_platform_config SET api_configured = true WHERE platform = 'reddit';`
- **Mastodon**: Create app at mastodon.social → Preferences → Development
  - `supabase secrets set MASTODON_ACCESS_TOKEN=xxx MASTODON_INSTANCE=mastodon.social`
  - `UPDATE social_platform_config SET api_configured = true WHERE platform = 'mastodon';`

### 2. End-to-End Verification
- Click "Planner" in admin dashboard → verify articles selected + briefs generated
- Click "Writer" → verify posts created in social_posts table
- Click "Poster" → verify posts dispatched to platforms (after credentials are set)
- Click "Sync" → verify engagement metrics pulled back
- Verify the full chain works on next article publish

### 3. Audit Findings — Medium Priority (from this session's audits)
- **social-engine mode validation** — validate `mode` parameter is "new_article" or "catalog"
- **social-writer choreography references** — wire up `brief.references` to actual persona chaining
- **social-sync velocity averaging** — compute baseline BEFORE syncing new scores
- **Independence review skip monitoring** — alert when Grok is unavailable and review skipped
- **Cost dedup on retries** — track retry count per article, only log cost once per stage

### 4. Social Media — Phase 2 (Intelligence Layer)
- Template learning: analyze top-performing posts → extract patterns → `social_templates`
- Velocity amplification: when post goes viral, auto-generate amplification on other platforms
- Pinger integration: connect breaking news signals to emergency social dispatch
- Additional desk functions for visual (Pinterest, Instagram) and broadcast (Telegram, newsletter)

### 5. Additional Platform APIs (Phase 2+)
- LinkedIn API (requires company page + OAuth2 app)
- Threads API (Meta developer account)
- Telegram Bot API (create bot via BotFather)
- Medium API (integration tokens)

### 6. Deferred Items
- Beehiiv account activation + newsletter integration
- Content production to fill category gaps
- Visual verification & device testing
- Narration voice tuning
- Lighthouse audit
- HighlightShare selection race condition (low priority)
- FloatingTOC tablet height constraint (low priority)
