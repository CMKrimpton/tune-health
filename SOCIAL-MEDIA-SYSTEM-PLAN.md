# Social Media Mega-Viral System — Implementation Plan

> **Status**: Design complete. Ready to build.
> **Date**: 2026-04-02
> **Goal**: Autonomous social media newsroom that produces 10+ posts/day/platform across all major services, powered by the 190+ article catalog, with $0/month platform costs.

---

## Architecture Overview — The Agency Model

The system operates like a real media agency: a strategic brain at the top, specialized desks at the bottom, with intelligence layers that learn and adapt.

```
         ┌──────────────────────────────────────┐
         │      WEEKLY ARC PLANNER              │
         │      (Sunday 11pm UTC)               │
         │                                      │
         │  • Select week's theme               │
         │  • Plan recurring series slots        │
         │  • Check competitor feeds             │
         │  • Review engagement patterns         │
         │  • Ensure category diversity          │
         └──────────────┬───────────────────────┘
                        │
         ┌──────────────▼───────────────────────┐
         │      DAILY EDITORIAL MEETING         │
         │      social-planner (5am UTC)         │
         │                                      │
         │  • Fill to 10/platform from:         │
         │    - New article promos              │
         │    - Catalog reshares (fresh angles) │
         │    - Setup engagement (primes next   │
         │      day's article)                  │
         │    - Trending reactions              │
         │    - Recurring series content        │
         │  • 2-day lookahead for funneling     │
         │  • Angle registry check (no repeats) │
         │  • Assign persona × model × format   │
         └──────────────┬───────────────────────┘
                        │
    ┌───────────────────┼───────────────────────┐
    ▼                   ▼                       ▼
 ARTICLE           CATALOG                ENGAGEMENT
 ENGINE            MINER                  ENGINE
 (Sonnet)          (Sonnet)               (Flash)
    │                   │                       │
    └────────┬──────────┘                       │
             ▼                                  ▼
    ┌──────────────────────────────────────────────┐
    │              DESK DISPATCH                    │
    │                                              │
    │  Microblog → Grok(skeptic), Sonnet(brand),   │
    │              Gemini(reporter)                 │
    │  Forum     → Grok(skeptic), Sonnet(brand)    │
    │  Professional → Gemini Pro(all)              │
    │  Visual    → Flash(all)                      │
    │  Broadcast → Sonnet(curator)                 │
    └──────────────────┬───────────────────────────┘
                       ▼
                social_posts
                       │
    ┌──────────────────┼───────────────────────┐
    ▼                  ▼                       ▼
 POSTER          VELOCITY              PINGER
 (cron */5)      DETECTOR              INTEGRATION
 → free APIs     (hot post?            (trending topic
                  → amplify)            → emergency post)
                       │
                       ▼
                 WEEKLY LEARNER
                 (evolves arcs,
                  angles, timing,
                  format mix)
```

---

## The Daily Content Mix (per platform, per day)

| Type | Count | Source |
|------|-------|--------|
| **New article promo** | 1-2 | Today's publish (brand + persona angles) |
| **Evergreen reshare** | 2-3 | Catalog mining — fresh angle on an older article |
| **Engagement post** | 2 | Polls, questions, "what do you think?" — no article link |
| **Trending reaction** | 1-2 | Connect a catalog article to today's trending health topic |
| **Thread / deep-dive** | 1 | Long-form breakdown of a catalog article's key findings |
| **Quote / stat card** | 1-2 | Single compelling stat or quote from any article |

**= 10-12 posts/day/platform**

---

## Platform Coverage — $0/Month

All platforms use free APIs or open protocols. No paid API tiers.

| Platform | Free Method | Content Formats |
|----------|-------------|-----------------|
| **Bluesky** | AT Protocol — fully open, free, unlimited | Posts, threads, quote posts |
| **Reddit** | Free API (within rate limits) | Link posts, self-posts, comments in relevant threads |
| **Mastodon** | ActivityPub — open protocol, free | Posts, threads |
| **Threads** | Meta Content Publishing API — free | Posts, replies, carousel text |
| **LinkedIn** | Community Management API — free organic | Text posts, document carousels, articles, polls |
| **Telegram** | Bot API — free | Broadcast channel posts |
| **Medium** | Free to publish | SEO backlink excerpts with "read full article" CTA |
| **Pinterest** | Free API | Standard pins, idea pins, article pins |
| **Newsletter** | Beehiiv free tier (up to 2,500 subs) | Feature articles, quick hits, stat cards, reader Q&A |
| **X/Twitter** | Content generated + queued for manual posting or Buffer free tier | Tweets, threads, quote tweets, polls |
| **Quora** | Free to post | Answers citing articles as evidence |
| **Hacker News** | Manual posting (HN hates automation) | Link posts when relevant to biotech/longevity/quantified self |
| **Instagram** | Meta Graph API — free | Carousel posts (slide decks), Reels scripts |
| **WhatsApp Channels** | Free broadcast API | Ultra-short summaries with links |

**X/Twitter approach**: The system generates perfect tweet content, threads, and quote-tweet choreography. Posting via Buffer free tier (3 channels, 10 scheduled posts) or manual copy-paste from admin dashboard. Revisit paid API ($100/mo) once audience justifies it.

**Tier 4 — Automated syndication (no persona needed):**
- RSS (already exists) → Flipboard auto-import
- Apple News via RSS submission
- Google News (already eligible via NewsArticle schema in v18.0.0)

---

## The 4 Personas

| ID | Name | Tier | Voice | Model | Platforms |
|----|------|------|-------|-------|-----------|
| `brand` | alumi news | Official | Authoritative, evidence-first, clean. No emojis. Sharp hooks | Sonnet | ALL |
| `reporter` | Max Lundin | Journalist | "I spent the week reading the studies so you don't have to." Curious, slightly irreverent, behind-the-scenes framing | Gemini Pro | X, Bluesky, LinkedIn, Reddit, Medium |
| `skeptic` | (TBD fan name) | Enthusiast | "Wait, I've been doing X wrong this whole time?" Reactive, relatable, invites debate, contrarian | Grok | X, Bluesky, Threads, Reddit |
| `curator` | (TBD digest name) | Newsletter | "This week's must-read." Concise summaries, curatorial framing, thematic | Sonnet | Newsletter, Medium, LinkedIn, Telegram |

### Multi-Model Persona Voices

Different AI models produce genuinely different voices — not simulated diversity through prompting, but real diversity from different model training:

- **Brand (Sonnet)**: Clean, authoritative, precise — Sonnet's natural register
- **Reporter (Gemini Pro)**: Data-focused, slightly different cadence, good at structured analysis
- **Skeptic (Grok)**: Naturally contrarian, edgy, irreverent — Grok's training on X data makes it natively understand Twitter culture
- **Curator (Sonnet)**: Editorial curation needs judgment, similar to brand but warmer/more personal

---

## 10x Intelligence Features

### 1. Trend Surfing via Pinger Integration

The existing `pipeline-pinger` runs 4x/hour scanning for breaking health news. The social system piggybacks on pinger signals in real-time.

When a pinger signal has `urgency >= 7` AND matches a catalog article (keyword overlap with tags/category), the system triggers an emergency desk dispatch — post within minutes, not at tomorrow's morning meeting.

This is how accounts go viral: being the first smart voice connecting a trending moment to real analysis.

### 2. Persona Cross-Promotion Choreography

Personas interact with each other to create visible public conversation:

```
T+0h   @alumihealth: "New: The melatonin doses people are taking are
        10-100x what the body produces. Why this matters. [link]"

T+1h   @maxlundin quotes @alumihealth:
        "I spent 3 days on this one. The dosing data genuinely shocked
        me — the 10mg gummies are pharmacological doses, not supplements."

T+3h   @skeptic replies to @maxlundin:
        "Wait, so I've been taking a drug dose and calling it a supplement?
        How is this not regulated?"

T+4h   @maxlundin replies to @skeptic:
        "That's literally the question the article asks. Short answer:
        DSHEA 1994. Long answer: it's worse than you think."
```

The Content Brief includes a `choreography` section with parent references and timing offsets. The poster waits for parent posts to exist before posting replies/quotes.

### 3. Engagement → Article Funnel (Bait Then Hook)

Engagement posts are strategic — they set up tomorrow's article:

```
Monday:    Poll — "Do you check the ingredient list on your supplements?"
Tuesday:   "Yesterday 62% of you said you never check supplement ingredients.
           Here's what we found when we did: [link]"
```

The planner has a 2-day lookahead. When planning engagement posts, it receives the titles/angles of articles publishing tomorrow and generates polls/questions that prime the audience.

### 4. Thematic Weekly Arcs

The weekly arc planner selects a theme and plans a multi-day campaign:

```
Week theme: "The Gut Truth"
Mon: Microbiome myth debunk (catalog) + poll about fermented foods
Tue: Gut-brain connection article (catalog) + stat card
Wed: New article drops on ultra-processed food + microbiome
Thu: Reporter thread breaking down the week's gut research
Fri: Curator newsletter featuring all 3 articles as a package
```

People follow accounts with predictable, anticipated rhythms. Recurring series:
- **"Actually..." Mondays** — skeptic debunks one popular health claim
- **"Study of the Week"** — reporter breaks down one paper every Wednesday
- **"Friday Numbers"** — a single stat card that makes you rethink something
- **"Weekend Deep Dive"** — curator's newsletter pick for long-form reading

### 5. Angle Registry — Never Repeat

Every angle used for every article is tracked. When the catalog miner selects an article for reshare, it loads all previous angles and instructs the engine to find a genuinely new way in.

Over time, the registry becomes an intelligence asset — it knows which angles work for which articles on which platforms.

### 6. Viral Velocity Detection

The poster (running every 5 min) checks engagement on posts from the last 4 hours. If any post exceeds 3x average engagement:
1. Another persona amplifies it (quote, share)
2. A follow-up thread is generated going deeper
3. The same angle is cross-posted to platforms that haven't seen it

Turns lucky hits into intentional waves.

### 7. Competitive Intelligence

Monitor RSS feeds from 10-15 health content competitors (Huberman, Attia, ZOE, Examine, etc.). When they post about a topic your catalog covers, the system identifies opportunities to add to the conversation with deeper analysis.

### 8. Content Format Matrix

Each platform gets the right MIX of formats, not just text adapted to character limits:

- **X**: Single tweets, threads, quote tweets, polls, "ratio" posts
- **Reddit**: Link posts, self-posts (long analysis), comments in existing threads
- **Pinterest**: Standard pins, idea pins (multi-slide), article pins
- **LinkedIn**: Text posts, document carousels (PDF slides), articles, polls
- **Newsletter**: Feature article, quick hits, "the number," reader question

---

## Database Schema

### Table: `social_personas`

```sql
CREATE TABLE IF NOT EXISTS public.social_personas (
  id text PRIMARY KEY,  -- 'brand', 'reporter', 'skeptic', 'curator'
  display_name text NOT NULL,
  bio text NOT NULL,
  voice_prompt text NOT NULL,
  model_override text,           -- which AI model to use for this persona
  platforms text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  config jsonb DEFAULT '{}',     -- { twitter_handle, bluesky_handle, etc. }
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE social_personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_personas"
  ON social_personas FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Table: `social_platform_config`

```sql
CREATE TABLE IF NOT EXISTS public.social_platform_config (
  platform text PRIMARY KEY,
  tier integer NOT NULL DEFAULT 2,
  desk text NOT NULL,            -- 'microblog', 'forum', 'professional', 'visual', 'broadcast'
  api_configured boolean NOT NULL DEFAULT false,
  rate_limit_per_hour integer DEFAULT 10,
  daily_post_target integer DEFAULT 10,
  content_formats text[] DEFAULT '{}',  -- ['post', 'thread', 'poll', 'carousel']
  config jsonb DEFAULT '{}',     -- { subreddits: [...], groups: [...], char_limit: 280 }
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE social_platform_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_platform_config"
  ON social_platform_config FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Table: `social_posts`

```sql
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_slug text,             -- NULL for engagement-only posts

  -- Content
  platform text NOT NULL,
  persona text NOT NULL DEFAULT 'brand',
  content_type text NOT NULL DEFAULT 'post',  -- 'new_promo', 'evergreen', 'engagement', 'trending', 'thread', 'stat_card', 'poll', 'comment'
  content_format text NOT NULL DEFAULT 'post', -- 'post', 'thread', 'poll', 'carousel', 'self_post', 'comment', 'pin', 'article'
  content_text text NOT NULL,
  content_meta jsonb DEFAULT '{}',  -- { subreddit, hashtags, carousel_slides[], hook, cta, poll_options[], thread_parts[] }

  -- Choreography
  parent_post_id uuid REFERENCES social_posts(id),  -- for replies/quotes referencing another persona's post
  choreography_group uuid,       -- groups posts in the same cross-persona sequence
  timing_offset_minutes integer DEFAULT 0,

  -- Scheduling
  scheduled_at timestamptz,
  posted_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'posting', 'posted', 'failed', 'skipped')),
  error text,
  retry_count integer DEFAULT 0,

  -- Platform response
  platform_post_id text,
  platform_url text,

  -- Engagement
  impressions integer DEFAULT 0,
  likes integer DEFAULT 0,
  shares integer DEFAULT 0,
  comments integer DEFAULT 0,
  clicks integer DEFAULT 0,
  engagement_score numeric(6,2) DEFAULT 0,
  engagement_updated_at timestamptz,

  -- Metadata
  arc_id uuid,                   -- weekly thematic arc this belongs to
  series_tag text,               -- recurring series: 'actually_monday', 'study_of_week', 'friday_numbers'
  generation_batch_id uuid,
  cost_usd numeric(8,4) DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX social_posts_status_schedule_idx ON social_posts (status, scheduled_at) WHERE status = 'scheduled';
CREATE INDEX social_posts_platform_idx ON social_posts (platform, status);
CREATE INDEX social_posts_article_idx ON social_posts (article_slug) WHERE article_slug IS NOT NULL;
CREATE INDEX social_posts_engagement_idx ON social_posts (engagement_score DESC) WHERE status = 'posted';
CREATE INDEX social_posts_choreography_idx ON social_posts (choreography_group) WHERE choreography_group IS NOT NULL;
CREATE INDEX social_posts_arc_idx ON social_posts (arc_id) WHERE arc_id IS NOT NULL;

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_posts"
  ON social_posts FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Table: `social_content_plan`

```sql
CREATE TABLE IF NOT EXISTS public.social_content_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date date NOT NULL,
  platform text NOT NULL,
  content_type text NOT NULL,    -- 'new_promo', 'evergreen', 'engagement', 'trending', 'thread', 'stat_card'
  content_format text NOT NULL DEFAULT 'post',
  article_slug text,             -- NULL for engagement posts
  persona text NOT NULL,
  desk text NOT NULL,            -- which desk handles this
  brief jsonb NOT NULL,          -- mini-brief for the desk
  arc_id uuid,
  series_tag text,
  status text DEFAULT 'planned'
    CHECK (status IN ('planned', 'generating', 'generated', 'failed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX social_content_plan_date_idx ON social_content_plan (plan_date, status);

ALTER TABLE social_content_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_content_plan"
  ON social_content_plan FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Table: `social_angle_registry`

```sql
CREATE TABLE IF NOT EXISTS public.social_angle_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_slug text NOT NULL,
  angle_used text NOT NULL,
  hook_type text NOT NULL,       -- 'stat', 'controversy', 'personal', 'trending', 'seasonal', 'debunk'
  platforms_used text[] NOT NULL,
  engagement_score numeric(6,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX social_angle_registry_slug_idx ON social_angle_registry (article_slug);

ALTER TABLE social_angle_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_angle_registry"
  ON social_angle_registry FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Table: `social_arcs`

```sql
CREATE TABLE IF NOT EXISTS public.social_arcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  theme text NOT NULL,
  description text,
  category_focus text,
  article_slugs text[] DEFAULT '{}',  -- articles selected for this arc
  recurring_series jsonb DEFAULT '{}', -- { "actually_monday": "slug-1", "study_of_week": "slug-2" }
  status text DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'completed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX social_arcs_week_idx ON social_arcs (week_start);

ALTER TABLE social_arcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_arcs"
  ON social_arcs FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Table: `social_engagement_log`

```sql
CREATE TABLE IF NOT EXISTS public.social_engagement_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  social_post_id uuid NOT NULL REFERENCES social_posts(id),
  impressions integer DEFAULT 0,
  likes integer DEFAULT 0,
  shares integer DEFAULT 0,
  comments integer DEFAULT 0,
  clicks integer DEFAULT 0,
  sampled_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX social_engagement_post_idx ON social_engagement_log (social_post_id, sampled_at DESC);

ALTER TABLE social_engagement_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_engagement_log"
  ON social_engagement_log FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Table: `social_templates`

```sql
CREATE TABLE IF NOT EXISTS public.social_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  persona text NOT NULL,
  content_format text NOT NULL,
  template_text text NOT NULL,   -- with {{title}}, {{hook}}, {{url}}, {{stat}}, {{category}} placeholders
  avg_engagement numeric(6,2) DEFAULT 0,
  use_count integer DEFAULT 0,
  source text DEFAULT 'manual',  -- 'manual', 'ai_generated', 'learned'
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX social_templates_lookup_idx ON social_templates (platform, persona, content_format, active) WHERE active = true;

ALTER TABLE social_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_templates"
  ON social_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

## Edge Functions

### New Functions (14)

| Function | Trigger | Purpose | Model | AI Calls |
|----------|---------|---------|-------|----------|
| `social-arc-planner` | Cron weekly (Sunday 11pm UTC) | Plan week's theme, recurring series, category balance, competitor scan | Sonnet | 1 |
| `social-planner` | Cron daily (5am UTC) + pinger emergency | Daily editorial meeting — fill to 10/platform, 2-day lookahead, trend surfing | Sonnet | 1 |
| `social-engine` | Chain from planner + chain from stage-publish | Content Briefs for new + catalog articles — the strategic brain | Sonnet | 1 per article |
| `social-miner` | Chain from planner | Catalog selection, engagement funnels, competitor responses, stat extraction | Sonnet | 1 |
| `social-desk-microblog` | Chain from engine/miner | X + Bluesky + Threads + Mastodon — multi-model per persona | Grok/Sonnet/Gemini | 1 per persona |
| `social-desk-forum` | Chain from engine/miner | Reddit + Quora + HN — anti-promotional, discussion-native formats | Grok/Sonnet | 1 per persona |
| `social-desk-professional` | Chain from engine/miner | LinkedIn + Medium — data-driven, carousel/document, thought leadership | Gemini Pro | 1 |
| `social-desk-visual` | Chain from engine/miner | Pinterest + Instagram — keyword SEO, image concepts, carousel slides | Flash | 1 |
| `social-desk-broadcast` | Chain from engine/miner | Newsletter + Telegram + WhatsApp — digest, subscriber conversion | Sonnet | 1 |
| `social-review` | After all desks complete | Brand safety, tone consistency, dedup, choreography validation | Flash | 1 |
| `social-poster` | Cron every 5 min | Free API dispatch + viral velocity detection | None | 0 |
| `social-engagement-sync` | Cron every 6 hours | Pull metrics from all platform APIs | None | 0 |
| `social-learn` | Cron weekly (Sunday 3am UTC) | Analyze performance → evolve angles, formats, timing, series, personas | Sonnet | 1 |
| `social-admin` | HTTP from admin dashboard | Dashboard API — status, preview, reschedule, skip, retry, pause | None | 0 |

### Integration Points

**stage-publish** — add one line after `status = 'published'` update (~line 302):
```typescript
await dispatchStage("social-engine", logId);
```

**pipeline-pinger** — add trend-surfing check after new signal detection:
```typescript
// If high-urgency signal matches catalog article → emergency social dispatch
```

### Chain Dispatch Flow

**New article publishes:**
```
stage-publish → social-engine → [desk-microblog, desk-forum, desk-professional, desk-visual, desk-broadcast] (parallel) → social-review
```

**Daily planning:**
```
social-planner → social-miner → social-engine (batch briefs) → desks (parallel) → social-review
```

**Weekly arc:**
```
social-arc-planner → writes social_arcs row → social-planner reads it next morning
```

**Pinger emergency (trending topic matches catalog):**
```
social-planner (emergency mode) → social-engine (single article) → desk-microblog only → social-review
```

---

## Shared Utilities

### New: `_shared/social-clients.ts`

Platform API wrappers following the pattern of `api-clients.ts`:

```typescript
// Posting
export async function postToBluesky(content: string, opts: BlueskyOpts): Promise<PlatformResult>
export async function postToReddit(title: string, body: string, opts: RedditOpts): Promise<PlatformResult>
export async function postToLinkedIn(content: string, opts: LinkedInOpts): Promise<PlatformResult>
export async function postToThreads(content: string, opts: ThreadsOpts): Promise<PlatformResult>
export async function postToTelegram(content: string, opts: TelegramOpts): Promise<PlatformResult>
export async function postToMedium(title: string, body: string, opts: MediumOpts): Promise<PlatformResult>
export async function postToPinterest(pin: PinData, opts: PinterestOpts): Promise<PlatformResult>

// Engagement fetching
export async function getBlueskyEngagement(uri: string): Promise<EngagementData>
export async function getRedditEngagement(postId: string): Promise<EngagementData>
export async function getLinkedInEngagement(postId: string): Promise<EngagementData>
// etc.

// RSS monitoring (competitive intelligence)
export async function fetchCompetitorFeeds(feeds: string[]): Promise<FeedItem[]>
```

### New constants in `_shared/constants.ts`

```typescript
// Social media models — per-persona assignments
SOCIAL_BRAND: "claude-sonnet-4-6",
SOCIAL_REPORTER: "gemini-3.1-pro-preview",
SOCIAL_SKEPTIC: "grok-4",
SOCIAL_CURATOR: "claude-sonnet-4-6",
SOCIAL_REVIEW: "gemini-2.5-flash",
SOCIAL_PLANNER: "claude-sonnet-4-6",
```

Plus `SOCIAL_CHAINS` export with fallback chains per persona.

### Environment Variables (Supabase Secrets)

```bash
# Bluesky (free, AT Protocol)
BLUESKY_HANDLE=alumihealth.bsky.social
BLUESKY_APP_PASSWORD=xxxx

# Reddit (free API)
REDDIT_CLIENT_ID=xxxx
REDDIT_CLIENT_SECRET=xxxx
REDDIT_USERNAME=xxxx
REDDIT_PASSWORD=xxxx

# LinkedIn (free Community Management API)
LINKEDIN_ACCESS_TOKEN=xxxx

# Threads (free Meta API)
THREADS_ACCESS_TOKEN=xxxx

# Telegram (free Bot API)
TELEGRAM_BOT_TOKEN=xxxx
TELEGRAM_CHANNEL_ID=xxxx

# Pinterest (free API)
PINTEREST_ACCESS_TOKEN=xxxx

# Medium (free)
MEDIUM_ACCESS_TOKEN=xxxx

# Beehiiv (already configured)
# BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID
```

---

## Cron Schedule

```sql
-- Weekly arc planner: Sunday 11pm UTC
SELECT cron.schedule('social-arc-planner', '0 23 * * 0', $$ ... $$);

-- Daily planner: 5am UTC
SELECT cron.schedule('social-planner', '0 5 * * *', $$ ... $$);

-- Social poster: every 5 minutes (dispatches + velocity detection)
SELECT cron.schedule('social-poster', '*/5 * * * *', $$ ... $$);

-- Engagement sync: every 6 hours
SELECT cron.schedule('social-engagement-sync', '0 */6 * * *', $$ ... $$);

-- Weekly learner: Sunday 3am UTC
SELECT cron.schedule('social-learn', '0 3 * * 0', $$ ... $$);
```

Note: `social-engine`, `social-miner`, all desk functions, `social-review`, and `social-admin` are NOT on crons — they are chain-dispatched or HTTP-triggered.

---

## Admin Dashboard — New "Social" Tab

Add a 4th tab to `/admin` dashboard with `SocialDashboard.tsx` React island.

### Sections

1. **Stats strip** (matching existing admin-stat-card pattern):
   - Total Posts (all time)
   - Posted Today
   - Avg Engagement Score
   - Social AI Cost (today)
   - Platforms Active (count)
   - Queue Size (scheduled pending)

2. **Content Calendar**:
   - Today's plan from `social_content_plan` — what's planned, generating, generated
   - Each row: time slot, platform icon, persona badge, content type, format, article (if any)
   - Expand to see full content + edit before posting
   - Drag to reschedule

3. **Post Feed**:
   - Chronological list of recent `social_posts`
   - Platform icon, persona badge, truncated content, status pill, engagement metrics
   - Action buttons: Skip, Reschedule, Retry (for failed), Copy (for manual platforms like X)
   - Choreography groups shown visually (connected posts)

4. **Weekly Arc**:
   - Current week's theme from `social_arcs`
   - Recurring series assignments (Actually Monday, Study of Week, etc.)
   - Category coverage visualization

5. **Platform Health**:
   - Status grid: green (active + API configured), yellow (active, no API), red (errors)
   - Rate limit usage bars
   - Last post time per platform
   - Daily target vs actual posted

6. **Engagement Leaderboard**:
   - Top 10 posts by engagement_score
   - Sortable by platform, persona, content type, article category
   - Pattern insights ("Controversy hooks outperform stat hooks on X by 2.3x")

7. **Angle Registry**:
   - Per-article: how many angles used, which performed best
   - "Stale" indicator for articles not shared in 30+ days

8. **Quick Actions**:
   - "Generate Social for Article" dropdown
   - "Emergency Trend Post" — manually trigger trend-surfing for a topic
   - "Pause All Posting" toggle
   - "Run Learning Analysis" button
   - "Plan Next Week's Arc" button

---

## Cost Model

### Daily AI Cost (~$0.15-0.20/day)

| Function | Model | Calls/day | Cost |
|----------|-------|-----------|------|
| `social-planner` | Sonnet | 1 | ~$0.02 |
| `social-engine` | Sonnet | 1-2 (per new article) | ~$0.02-0.04 |
| `social-miner` | Sonnet | 1 (batch) | ~$0.03 |
| Desks (microblog) | Grok + Sonnet + Gemini | 2-3 | ~$0.04 |
| Desks (forum) | Grok + Sonnet | 1-2 | ~$0.03 |
| Desks (professional) | Gemini Pro | 1 | ~$0.01 |
| Desks (visual) | Flash | 1 | ~$0.005 |
| Desks (broadcast) | Sonnet | 1 | ~$0.01 |
| `social-review` | Flash | 1 | ~$0.005 |
| **Daily total** | | | **~$0.15-0.20** |

### Weekly AI Cost

| Function | Cost |
|----------|------|
| `social-arc-planner` | ~$0.03 |
| `social-learn` | ~$0.03 |
| Daily × 7 | ~$1.05-1.40 |
| **Weekly total** | **~$1.10-1.45** |

### Monthly Total

- **AI cost**: ~$5-6/month
- **Platform cost**: $0/month
- **Total**: ~$5-6/month for 60+ posts/day across 10+ platforms

---

## Implementation Phases

### Phase 1A — Foundation (database + engine)
1. Create migration `supabase/migrations/20260402_social_media_system.sql` — all 8 tables, indexes, RLS, seed personas + platform config
2. Add social model constants to `supabase/functions/_shared/constants.ts`
3. Create `supabase/functions/_shared/social-clients.ts` — Bluesky + Reddit clients first
4. Create `supabase/functions/social-engine/index.ts` — Content Brief generator
5. Add `dispatchStage("social-engine", logId)` to `stage-publish/index.ts`

### Phase 1B — Desks (microblog + forum)
6. Create `supabase/functions/social-desk-microblog/index.ts` — X + Bluesky + Threads
7. Create `supabase/functions/social-desk-forum/index.ts` — Reddit + Quora
8. Create `supabase/functions/social-review/index.ts` — QC pass

### Phase 1C — Planning + Posting
9. Create `supabase/functions/social-planner/index.ts` — daily editorial meeting
10. Create `supabase/functions/social-miner/index.ts` — catalog mining + engagement content
11. Create `supabase/functions/social-poster/index.ts` — free API dispatch + velocity detection
12. Create migration for cron jobs

### Phase 1D — Admin Dashboard
13. Create `supabase/functions/social-admin/index.ts` — dashboard API
14. Create `src/components/admin/SocialDashboard.tsx` — React island
15. Modify `src/pages/admin/index.astro` — add Social tab

### Phase 2 — Intelligence Layer
16. Create `supabase/functions/social-arc-planner/index.ts` — weekly themes
17. Create `supabase/functions/social-engagement-sync/index.ts` — metrics collection
18. Create `supabase/functions/social-learn/index.ts` — weekly analysis + template evolution
19. Add pinger integration for trend surfing
20. Add remaining desk functions (professional, visual, broadcast)

### Phase 3 — Growth Features
21. Competitive intelligence (RSS monitoring)
22. A/B testing (2 variants, measure winner)
23. Template interpolation (skip AI for proven patterns)
24. Remaining platform API clients (LinkedIn, Threads, Telegram, Pinterest, Medium)

### Phase 4 — Scale
25. Instagram carousel generation
26. TikTok script generation
27. Newsletter personalization (per-reader click history)
28. Subject line A/B testing for Beehiiv
29. Full engagement analytics dashboard

---

## Content Brief Schema (Engine Output)

The Content Brief is the strategic document that every desk consumes:

```json
{
  "article": {
    "slug": "melatonin-dosing-problem",
    "title": "The Melatonin Doses People Are Taking Are 10-100x What the Body Produces",
    "url": "https://alumi.news/articles/melatonin-dosing-problem",
    "category": "Pharmacology",
    "readTime": 8,
    "heroImage": "https://..."
  },
  "strategy": {
    "core_thesis": "Commercial melatonin supplements contain pharmacological doses far exceeding physiological production",
    "viral_angle": "You're taking a drug dose and calling it a supplement",
    "controversy": "Melatonin is unregulated because of a 1994 law, not because it's safe at these doses",
    "emotional_triggers": ["surprise", "betrayal", "protective_instinct"],
    "key_findings": [
      { "finding": "Body produces 0.1-0.3mg nightly; gummies contain 5-10mg", "stat": "10-100x", "source": "JCI 2025" },
      { "finding": "Long-term high-dose effects in children unstudied", "stat": "0 RCTs >6mo in pediatrics", "source": "Cochrane" }
    ],
    "quotable_lines": [
      "The melatonin aisle at CVS is an unregulated pharmacy.",
      "DSHEA 1994 didn't protect consumers. It protected manufacturers."
    ],
    "visual_concept": "Split image: tiny natural melatonin amount vs mountain of supplement pills. Clinical color palette.",
    "target_segments": ["parents", "supplement_users", "pharma_skeptics"],
    "trending_hooks": ["connects to ongoing melatonin gummy debate on parenting forums"],
    "hashtags": { "primary": ["melatonin", "supplements"], "niche": ["DSHEA", "sleepscience", "pharma"] }
  },
  "assignments": {
    "desks": ["microblog", "forum", "professional", "broadcast"],
    "skip_desks": ["visual"],
    "personas": {
      "brand": ["microblog", "forum", "professional", "broadcast"],
      "reporter": ["microblog", "forum", "professional"],
      "skeptic": ["microblog", "forum"],
      "curator": ["broadcast"]
    },
    "priority": "high",
    "choreography": {
      "sequence": [
        { "persona": "brand", "platform": "bluesky", "format": "post", "offset_min": 0 },
        { "persona": "reporter", "platform": "bluesky", "format": "thread", "offset_min": 60, "references": "brand" },
        { "persona": "skeptic", "platform": "bluesky", "format": "quote", "offset_min": 180, "references": "reporter" },
        { "persona": "brand", "platform": "reddit", "format": "link_post", "offset_min": 60, "meta": { "subreddit": "health" } },
        { "persona": "skeptic", "platform": "reddit", "format": "self_post", "offset_min": 240, "meta": { "subreddit": "supplements" } }
      ]
    }
  },
  "funnel": {
    "setup_poll": "How many mg of melatonin do you take? Under 1mg / 1-3mg / 5-10mg / I don't know",
    "setup_question": "Parents: do you give your kids melatonin gummies? Genuinely curious, no judgment.",
    "followup_stat": "62% of you take 5mg+. Your body makes 0.1mg. That's a 50x difference."
  }
}
```

---

## Key Design Principles

1. **Engine produces strategy, desks produce content.** The engine never writes a tweet. Desks never decide the angle. Clean separation.
2. **Each platform gets genuinely different content.** A Pinterest pin and a Reddit self-post for the same article share nothing except the underlying strategy.
3. **Personas sound different because they ARE different models.** Grok's skeptic naturally sounds different from Sonnet's brand voice.
4. **The system thinks in arcs, not posts.** Weekly themes create narrative momentum. Engagement posts set up article drops. Posts reference each other.
5. **Never repeat an angle.** The angle registry ensures every reshare finds a fresh way in.
6. **Ride trends in real-time.** Pinger integration means the system can respond to breaking health news within minutes by connecting it to catalog articles.
7. **$0 platform fees.** Only free APIs and open protocols. Content for paid-API platforms (X) is generated and queued for manual posting or free schedulers.
8. **Learn and evolve.** Weekly analysis identifies what works, evolves templates, adjusts format mix, and improves persona effectiveness.
