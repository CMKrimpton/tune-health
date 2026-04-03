# Next Session Plan

> **Status**: v18.3.0 live. ~190 published articles across 9 categories. Social Media System Phase 1B complete: end-to-end automated posting pipeline (Engine → Writer → Poster → Sync). 3 platform APIs implemented (Bluesky, Reddit, Mastodon). 3 cron jobs active. Dashboard with manual triggers + setup guide.

---

## Current Architecture (v18.3.0)

- **Navigation**: domain-grouped dropdown (Mind/Body/Medicine/Environment), TopicNav with per-category hover dropdowns, SideNav grouped by domain, MobileNav with improved scroll sensitivity, QuickNav floating pill
- **Breadcrumbs**: visual breadcrumbs on topic and collection pages (Home > Articles > Category)
- **Sort Dropdowns**: custom glass dropdowns on articles index + category pages
- **Category Landing Pages**: `/topics/[slug]` — 9 pages with gradient hero, editorial metadata, featured article, sorted grid, breadcrumbs
- **Collections**: 5 curated themed reading lists at `/collections/[slug]` — now with share buttons in hero
- **Start Here**: `/start-here` — onboarding with 5 handpicked articles, editorial philosophy, domain browser
- **How We Write**: `/howwewrite` — editorial manual (pipeline transparency, voice standards)
- **Author Bylines**: all articles use "Max Lundin" with model-specific roles
- **Reading Progress**: localStorage scroll tracking per article, "Continue Reading" section on homepage
- **Pipeline**: 8-stage (added stage-copy-edit between QC and publish). Hybrid model (human writes with Opus). ~$0.13/article
- **Narration**: ElevenLabs TTS with admin voice settings panel (6 presets + custom sliders)
- **Security**: HSTS preload, CSP hardening, immutable asset caching
- **Admin**: Pipeline/Articles/Agents/Social tabs. Supabase Realtime live updates
- **Newsletter**: `/api/subscribe` → Supabase + Beehiiv forward (when BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID env vars set)
- **Social Media System**: 8 tables, 4 AI personas, 14 platform configs, 6 edge functions (engine + writer + poster + planner + sync + admin), 3 cron jobs, Bloomberg-inspired dashboard with setup guide

## What Was Done This Session (v18.3.0 — Social Media Phase 1B)

### Phase 1B — Execution Layer (complete)
1. **Social Writer** (`social-writer/index.ts`) — content factory:
   - Takes Content Briefs from `social_content_plan` → generates platform-native post text
   - Each persona uses their assigned AI model (Sonnet/Gemini/Grok)
   - Platform-specific rules: Bluesky (300 char), Reddit (markdown + subreddit selection), Mastodon (500 + hashtags), etc.
   - Choreography timing offsets: brand=0, reporter=60min, skeptic=180min, curator=120min
   - Outputs to `social_posts` with scheduled_at (API platforms) or draft (manual platforms)
   - Cost tracking per post via `cost_usd` column

2. **Social Poster** (`social-poster/index.ts`) — dispatcher:
   - Reads scheduled posts due for posting → calls `postToPlatform()` API
   - Choreography-aware: skips posts whose parent hasn't been posted yet
   - Rate limit checks against platform `rate_limit_per_hour`
   - Exponential backoff on failure (5min, 25min, 125min), max 3 retries
   - Cron: `*/5 * * * *`

3. **Social Planner** (`social-planner/index.ts`) — daily editorial meeting:
   - Mines catalog: articles not promoted in 14+ days, independence score ≥ 5
   - Creates weekly arcs via AI (theme, category focus, recurring series)
   - Selects 4 articles/day with category diversity + arc alignment
   - Recurring series schedule: "Actually..." Mon, "Study of the Week" Wed, "By the Numbers" Fri
   - Chain-dispatches to social-engine for each selected article
   - Cron: `0 5 * * *`

4. **Social Sync** (`social-sync/index.ts`) — engagement feedback:
   - Pulls metrics from Bluesky + Reddit APIs for posted content (last 7 days)
   - Weighted engagement score: likes×1, shares×3, comments×2, impressions×0.01, clicks×1.5
   - Velocity detection: flags posts exceeding 3× average
   - Updates `social_engagement_log` time-series + `social_angle_registry` scores
   - Cron: `0 */6 * * *`

5. **Social Admin** — 6 new endpoints:
   - `run-planner`, `run-writer`, `run-poster`, `run-sync` — manual triggers
   - `setup-status` — credential status + setup instructions per platform
   - `toggle-platform` — activate/deactivate platforms

6. **Dashboard Updates** (`SocialDashboard.tsx`):
   - New "Setup" tab with credential guide (Bluesky, Reddit, Mastodon)
   - System architecture diagram (Planner → Engine → Writer → Poster → Sync)
   - Manual trigger buttons in tab bar
   - Quick Start Guide with step-by-step instructions

7. **Bug Fixes**:
   - Fixed arc_id assignment (was always null)
   - Added chain-dispatch from social-engine → social-writer

8. **Cron Jobs** migration applied (`20260403_social_cron_jobs.sql`)

### Deployed
- Migration applied (3 cron jobs)
- All 7 functions deployed: social-writer, social-poster, social-planner, social-sync, social-engine, social-admin, stage-publish
- Build passes clean

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

### 3. Social Media — Phase 2 (Intelligence Layer)
- Template learning: analyze top-performing posts → extract patterns → `social_templates`
- Velocity amplification: when post goes viral, auto-generate amplification on other platforms
- Pinger integration: connect breaking news signals to emergency social dispatch
- Additional desk functions for visual (Pinterest, Instagram) and broadcast (Telegram, newsletter)

### 4. Additional Platform APIs (Phase 2+)
- LinkedIn API (requires company page + OAuth2 app)
- Threads API (Meta developer account)
- Telegram Bot API (create bot via BotFather)
- Medium API (integration tokens)

### 5. Deferred Items
- Beehiiv account activation + newsletter integration
- Content production to fill category gaps
- Visual verification & device testing
- Narration voice tuning
- Lighthouse audit
