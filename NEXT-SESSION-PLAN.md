# Next Session Plan

> **Status**: v18.4.0 live. ~190 published articles across 9 categories. Social Media System fully hardened: batch API, input validation, stuck recovery, dispatch error logging. 9 functions deployed with intelligent safeguards. Dashboard upgraded with expandable posts, plan date navigator, better error messages.

---

## What Was Done This Session (v18.4.0 — Full-Stack Hardening & Admin Intelligence)

### Critical Bug Fixes
- **Social dashboard 500 errors** — new `batch` endpoint replaces 6 parallel requests with 1 (Supabase concurrency limit)
- **social-writer `successIds` bug** — plan rows stuck in "generating" forever (was slicing by index, now tracks actual success IDs)
- **social-writer stuck recovery** — auto-resets rows stuck in "generating" for 10+ min from crashed runs
- **CommandPalette event listener cleanup** — memory leak on View Transitions (missing `removeEventListener`)
- **PipelineMonitor brief copy XSS** — replaced `document.write()` with safe `textContent` DOM API
- **dispatchStage silent failures** — now logs dispatch errors directly to article record (visible in admin dashboard)

### Intelligent Safeguards (social-admin)
- Article existence check before social generation — prevents burning AI credits on non-existent articles
- Duplicate generation prevention — returns 409 if content already being generated for a slug
- Slug format validation — rejects malformed slug strings with clear error
- Platform existence validation — rejects toggle requests for unknown platforms
- Action field validation — returns 400 instead of 500 on missing/invalid request bodies
- social-poster auto-drafts posts for unconfigured platforms instead of silently skipping forever

### Admin Dashboard UX
- Expandable post rows in Post Feed — click to see full content, metadata, cost, scheduled time, article link
- Copy button available on all posts (not just drafts) — useful for manual platform posting
- Content Plan date navigator — browse plans for any date with prev/next arrows, date picker, Today button

### Full-Stack Audit (4 parallel deep audits)
- **Social functions**: Found/fixed successIds bug, stuck generating recovery, unconfigured platform handling
- **Admin dashboard**: Found/fixed brief copy XSS, CommandPalette listener leak
- **Public site**: Found/fixed CommandPalette cleanup; noted HighlightShare race condition (low priority)
- **Pipeline functions**: Found/fixed dispatchStage silent failures; noted independence review skip monitoring (future)

### Deployed
- 9 functions deployed: stage-research, stage-editor, stage-independence, stage-qc, stage-voice-rewrite, stage-copy-edit, stage-publish, social-admin, social-writer, social-poster
- Build passes clean

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
