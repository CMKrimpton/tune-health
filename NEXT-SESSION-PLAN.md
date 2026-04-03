# Next Session Plan

> **Status**: v18.2.0 live. ~190 published articles across 9 categories. Social Media System Phase 1A+1C complete: 8 database tables, social-engine (Content Brief generator), social-admin (dashboard API), Bloomberg-inspired Social tab in admin dashboard. Stage-publish auto-triggers social content generation for every new article.

---

## Current Architecture (v18.2.0)

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
- **Social Media System**: 8 tables, 4 AI personas, 14 platform configs, social-engine + social-admin edge functions, Bloomberg-inspired dashboard

## What Was Done This Session (v18.2.0 — Social Media System Build)

### Phase 1A — Foundation (complete)
1. **Database migration** (`20260402_social_media_system.sql`) — 8 tables with full schema:
   - `social_personas` — 4 seeded personas (brand/reporter/skeptic/curator) with model assignments + voice prompts
   - `social_platform_config` — 14 platforms seeded with desk assignments, tier, rate limits, content formats
   - `social_posts` — core table with choreography, scheduling, engagement tracking, 7 indexes
   - `social_content_plan` — daily editorial plans per platform/persona/desk
   - `social_angle_registry` — never-repeat angle tracking per article
   - `social_arcs` — weekly thematic arcs
   - `social_engagement_log` — time-series engagement snapshots
   - `social_templates` — learned + manual content templates
   - All tables: RLS enabled, service_role full access, Realtime on posts + plan

2. **Social model constants** in `_shared/constants.ts`:
   - 6 new MODELS entries: SOCIAL_BRAND, SOCIAL_REPORTER, SOCIAL_SKEPTIC, SOCIAL_CURATOR, SOCIAL_REVIEW, SOCIAL_PLANNER
   - SOCIAL_CHAINS fallback chains per persona

3. **Social API clients** (`_shared/social-clients.ts`):
   - Bluesky AT Protocol: auth session caching, facet detection (URLs), createRecord
   - Reddit OAuth2: token caching, submit (link/self), engagement fetch
   - Mastodon ActivityPub: status posting
   - Platform router: `postToPlatform()` dispatches to correct client
   - Stubs for Phase 2 platforms (LinkedIn, Threads, Telegram, Pinterest, Medium, Instagram, WhatsApp)

4. **Social Engine** (`social-engine/index.ts`) — the strategic brain:
   - Fetches article data from pipeline log + articles table
   - Loads existing angles (never repeat), active platforms, personas, current arc
   - Generates Content Brief via AI (Sonnet with Gemini fallback)
   - Writes content plan rows (one per choreography sequence item)
   - Registers angle in angle_registry
   - Logs overhead cost

5. **Stage-publish hook** — non-blocking fire-and-forget dispatch to social-engine after every publish

### Phase 1C — Admin Dashboard (complete, moved up from plan)
6. **Social Admin** (`social-admin/index.ts`) — dashboard API with 10 actions:
   - `status`: stats strip (total, today, queued, drafts, failed, engagement, cost, platforms)
   - `posts`: paginated post feed with platform + status filters
   - `plan`: today's content plan
   - `platforms`: platform health with last-post time + today's count
   - `arcs`: recent weekly arcs
   - `angles`: angle registry per article
   - `leaderboard`: top posts by engagement
   - `personas`: persona list
   - `skip`/`retry`: post management
   - `generate`: trigger social-engine for any article slug

7. **SocialDashboard.tsx** — Bloomberg Terminal-inspired React island:
   - **Stats strip**: 8 KPIs matching existing admin design (total, today, queued, drafts, failed, engagement, AI cost, platforms)
   - **4 section tabs**: Overview, Post Feed, Content Plan, Platforms
   - **Overview**: Platform Activity Matrix (24h with progress bars to target), Weekly Arc display, AI Personas panel, Persona Distribution chart, Recent Posts compact feed
   - **Post Feed**: filterable by status + platform, full table with platform/persona badges, engagement metrics, action buttons (retry/skip/copy/view)
   - **Content Plan**: today's editorial plan table with desk/persona/format breakdown
   - **Platforms**: 2-column grid of platform cards with health status, fill rate progress bars, last post time, content format pills
   - **Generate widget**: slug input + generate button in tab bar for on-demand social generation
   - All inline styles reference admin.css custom properties (warm dark palette, glass surfaces, tabular-nums)

8. **Admin integration** — Social tab added as 4th tab in `/admin/index.astro`

### Deployed
- Migration applied to Supabase (8 tables, seed data confirmed)
- `social-engine`, `social-admin`, `stage-publish` deployed
- Build passes clean

## Priority for Next Session

### 1. Social Media — Phase 1B (Desks + Posting)
- Create `social-desk-microblog/index.ts` — X + Bluesky + Threads + Mastodon content generation
- Create `social-desk-forum/index.ts` — Reddit + Quora content generation
- Create `social-review/index.ts` — brand safety QC pass before posting
- Create `social-planner/index.ts` — daily editorial meeting (fill to 10/platform, 2-day lookahead)
- Create `social-miner/index.ts` — catalog mining + engagement content generation
- Create `social-poster/index.ts` — free API dispatch + viral velocity detection
- Set up cron jobs: planner (daily 5am), poster (*/5), engagement sync (*/6h)
- Test end-to-end: article → social-engine → desks → review → poster → platform

### 2. Social Media — Phase 2 (Intelligence Layer)
- Create `social-arc-planner/index.ts` — weekly themes (Sunday 11pm UTC)
- Create `social-engagement-sync/index.ts` — pull metrics from platform APIs
- Create `social-learn/index.ts` — weekly analysis + template evolution
- Add pinger integration for trend surfing (emergency social dispatch)
- Remaining desk functions: professional, visual, broadcast

### 3. Platform API Setup
- Set up Bluesky account + app password → set BLUESKY_HANDLE + BLUESKY_APP_PASSWORD secrets
- Set up Reddit app → set REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD secrets
- Mark platforms as api_configured=true as credentials are added

### 4. Deferred Items
- Beehiiv account activation + newsletter integration
- Content production to fill category gaps
- Visual verification & device testing
- Narration voice tuning
- Lighthouse audit
