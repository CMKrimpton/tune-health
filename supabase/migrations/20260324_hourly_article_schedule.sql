-- ============================================================================
-- Staged pipeline: add research_data column + 15-minute cron schedule
-- ============================================================================
-- The daily-article-agent now operates in 3 stages:
--   1. Research (~60s) — find trending topic, save to research_data
--   2. Write (~120s)   — write article from research, save to articles table
--   3. Publish (~60s)  — generate illustration + commit to GitHub
-- Each cron invocation processes ONE stage. 15-min interval = ~32 articles/day capacity.
-- Auto-stops at 100 articles. Temporary until target reached, then ramp down.
-- ============================================================================

-- 1. Add research_data column for storing research between stages
alter table public.daily_article_log
  add column if not exists research_data jsonb default '{}';

-- 2. Update status CHECK constraint to include new stage statuses
alter table public.daily_article_log
  drop constraint if exists daily_article_log_status_check;

alter table public.daily_article_log
  add constraint daily_article_log_status_check
  check (status in (
    'started', 'searching', 'research_done',
    'writing', 'written',
    'publishing', 'published',
    'failed',
    -- Legacy statuses (from pre-staged runs)
    'topic_selected', 'researching', 'saved'
  ));

-- 3. Remove the old schedule
select cron.unschedule('daily-article-agent');

-- 4. Schedule every 15 minutes (processes one stage per invocation)
select cron.schedule(
  'daily-article-agent',
  '*/15 * * * *',
  $$
  select net.http_post(
    url    := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/daily-article-agent',
    body   := '{"action": "run"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
