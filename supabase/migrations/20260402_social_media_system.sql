-- ═══════════════════════════════════════════════════════════════════════════
-- Social Media Mega-Viral System — Database Schema
-- v18.2.0 — 2026-04-02
-- 8 tables: personas, platform config, posts, content plan, angle registry,
--           arcs, engagement log, templates
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. social_personas ──────────────────────────────────────────────────
-- 4 AI personas with distinct voices and model assignments

CREATE TABLE IF NOT EXISTS public.social_personas (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  bio text NOT NULL,
  voice_prompt text NOT NULL,
  model_override text,
  platforms text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  config jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE social_personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_personas"
  ON social_personas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. social_platform_config ───────────────────────────────────────────
-- Per-platform settings: API status, rate limits, content formats, desk assignment

CREATE TABLE IF NOT EXISTS public.social_platform_config (
  platform text PRIMARY KEY,
  tier integer NOT NULL DEFAULT 2,
  desk text NOT NULL,
  api_configured boolean NOT NULL DEFAULT false,
  rate_limit_per_hour integer DEFAULT 10,
  daily_post_target integer DEFAULT 10,
  content_formats text[] DEFAULT '{}',
  config jsonb DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE social_platform_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_platform_config"
  ON social_platform_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. social_posts ─────────────────────────────────────────────────────
-- The core table: every generated social post across all platforms

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_slug text,

  -- Content
  platform text NOT NULL,
  persona text NOT NULL DEFAULT 'brand',
  content_type text NOT NULL DEFAULT 'post',
  content_format text NOT NULL DEFAULT 'post',
  content_text text NOT NULL,
  content_meta jsonb DEFAULT '{}',

  -- Choreography
  parent_post_id uuid REFERENCES social_posts(id),
  choreography_group uuid,
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
  arc_id uuid,
  series_tag text,
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
CREATE INDEX social_posts_posted_at_idx ON social_posts (posted_at DESC) WHERE posted_at IS NOT NULL;

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_posts"
  ON social_posts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. social_content_plan ──────────────────────────────────────────────
-- Daily editorial plan — what to post, where, when, by whom

CREATE TABLE IF NOT EXISTS public.social_content_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date date NOT NULL,
  platform text NOT NULL,
  content_type text NOT NULL,
  content_format text NOT NULL DEFAULT 'post',
  article_slug text,
  persona text NOT NULL,
  desk text NOT NULL,
  brief jsonb NOT NULL,
  arc_id uuid,
  series_tag text,
  status text DEFAULT 'planned'
    CHECK (status IN ('planned', 'generating', 'generated', 'failed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX social_content_plan_date_idx ON social_content_plan (plan_date, status);
CREATE INDEX social_content_plan_platform_idx ON social_content_plan (plan_date, platform);

ALTER TABLE social_content_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_content_plan"
  ON social_content_plan FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 5. social_angle_registry ────────────────────────────────────────────
-- Never repeat an angle — tracks every angle used for every article

CREATE TABLE IF NOT EXISTS public.social_angle_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_slug text NOT NULL,
  angle_used text NOT NULL,
  hook_type text NOT NULL,
  platforms_used text[] NOT NULL,
  engagement_score numeric(6,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX social_angle_registry_slug_idx ON social_angle_registry (article_slug);

ALTER TABLE social_angle_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_angle_registry"
  ON social_angle_registry FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 6. social_arcs ─────────────────────────────────────────────────────
-- Weekly thematic arcs — narrative momentum across days

CREATE TABLE IF NOT EXISTS public.social_arcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  theme text NOT NULL,
  description text,
  category_focus text,
  article_slugs text[] DEFAULT '{}',
  recurring_series jsonb DEFAULT '{}',
  status text DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'completed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX social_arcs_week_idx ON social_arcs (week_start);

ALTER TABLE social_arcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_arcs"
  ON social_arcs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 7. social_engagement_log ────────────────────────────────────────────
-- Time-series engagement snapshots for velocity detection

CREATE TABLE IF NOT EXISTS public.social_engagement_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  social_post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
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

-- ─── 8. social_templates ─────────────────────────────────────────────────
-- Learned + manual templates for proven content patterns

CREATE TABLE IF NOT EXISTS public.social_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  persona text NOT NULL,
  content_format text NOT NULL,
  template_text text NOT NULL,
  avg_engagement numeric(6,2) DEFAULT 0,
  use_count integer DEFAULT 0,
  source text DEFAULT 'manual',
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX social_templates_lookup_idx ON social_templates (platform, persona, content_format, active) WHERE active = true;

ALTER TABLE social_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on social_templates"
  ON social_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA — Personas
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO social_personas (id, display_name, bio, voice_prompt, model_override, platforms, config) VALUES
(
  'brand',
  'alumi news',
  'Evidence-based health journalism. No allegiance except to the science.',
  'You are the official voice of alumi news — an evidence-first health publication. Your tone is authoritative, clean, and sharp. No emojis. No hedging. Lead with the most surprising finding. Write hooks that make smart people stop scrolling. Never be preachy or condescending. Think: Bloomberg meets a brilliant friend who reads the studies.',
  'claude-sonnet-4-6',
  ARRAY['bluesky', 'reddit', 'linkedin', 'threads', 'mastodon', 'telegram', 'medium', 'pinterest', 'x', 'whatsapp', 'newsletter'],
  '{"bluesky_handle": "alumihealth.bsky.social"}'::jsonb
),
(
  'reporter',
  'Max Lundin',
  'Health & Science Editor at alumi news. I read the studies so you don''t have to.',
  'You are Max Lundin, a health journalist who writes with genuine curiosity and slight irreverence. Your voice says "I spent the week reading the studies so you don''t have to." You share behind-the-scenes framing — what surprised you, what the headline doesn''t tell you, what the study actually measured vs what the press release claimed. You''re the smart friend in the group chat who happens to read medical journals.',
  'gemini-3.1-pro-preview',
  ARRAY['bluesky', 'reddit', 'linkedin', 'medium', 'x'],
  '{}'::jsonb
),
(
  'skeptic',
  'The Devil''s Advocate',
  'Wait, I''ve been doing this wrong my whole life?',
  'You are a health-curious skeptic who reacts to findings with genuine surprise and relatable disbelief. Your voice says "Wait, really?" and "Hold on, let me get this straight..." You invite debate, ask the uncomfortable questions, and make people feel like they''re not alone in being confused by health advice. You''re contrarian but honest — you''ll change your mind when the evidence is strong. Never dismissive, always curious.',
  'grok-4',
  ARRAY['bluesky', 'reddit', 'threads', 'x'],
  '{}'::jsonb
),
(
  'curator',
  'The alumi Digest',
  'Your weekly guide to what actually matters in health science.',
  'You are a thoughtful curator who packages health journalism into must-read digests. Your voice says "This week''s essential reads" and "Here''s what you missed." You create narrative coherence across disparate articles — finding the theme, the through-line, the "why now." You write concise summaries that respect the reader''s time while making them feel they''ll miss out if they don''t click. Think: the best newsletter editor you''ve ever read.',
  'claude-sonnet-4-6',
  ARRAY['newsletter', 'medium', 'linkedin', 'telegram'],
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA — Platform Config
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO social_platform_config (platform, tier, desk, api_configured, rate_limit_per_hour, daily_post_target, content_formats, config) VALUES
('bluesky',    1, 'microblog',     false, 30, 12, ARRAY['post', 'thread', 'quote'],              '{"char_limit": 300}'::jsonb),
('reddit',     1, 'forum',         false, 10,  6, ARRAY['link_post', 'self_post', 'comment'],     '{"subreddits": ["health", "science", "supplements", "nutrition", "fitness", "longevity", "sleep", "neuroscience"]}'::jsonb),
('mastodon',   1, 'microblog',     false, 30, 10, ARRAY['post', 'thread'],                        '{"char_limit": 500, "instance": "mastodon.social"}'::jsonb),
('threads',    2, 'microblog',     false, 20, 10, ARRAY['post', 'reply', 'carousel_text'],        '{"char_limit": 500}'::jsonb),
('linkedin',   2, 'professional',  false, 10,  6, ARRAY['post', 'document_carousel', 'article', 'poll'], '{"char_limit": 3000}'::jsonb),
('telegram',   2, 'broadcast',     false, 20,  8, ARRAY['post'],                                  '{"char_limit": 4096}'::jsonb),
('medium',     2, 'professional',  false,  5,  3, ARRAY['article', 'excerpt'],                    '{}'::jsonb),
('pinterest',  3, 'visual',        false, 20,  8, ARRAY['standard_pin', 'idea_pin', 'article_pin'], '{}'::jsonb),
('newsletter', 2, 'broadcast',     false,  1,  1, ARRAY['feature', 'quick_hits', 'stat_card'],    '{}'::jsonb),
('x',          3, 'microblog',     false,  0, 12, ARRAY['tweet', 'thread', 'quote', 'poll'],      '{"char_limit": 280, "manual_posting": true}'::jsonb),
('quora',      3, 'forum',         false,  5,  3, ARRAY['answer'],                                '{}'::jsonb),
('hackernews', 4, 'forum',         false,  0,  1, ARRAY['link_post'],                             '{"manual_posting": true}'::jsonb),
('instagram',  3, 'visual',        false, 10,  4, ARRAY['carousel', 'reel_script'],               '{}'::jsonb),
('whatsapp',   3, 'broadcast',     false, 10,  4, ARRAY['post'],                                  '{"char_limit": 1024}'::jsonb)
ON CONFLICT (platform) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Enable Realtime for key tables
-- ═══════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE social_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE social_content_plan;
