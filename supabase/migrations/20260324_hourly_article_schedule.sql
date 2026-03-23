-- ============================================================================
-- 4-stage pipeline with Senior Editor: schema + 5-minute cron
-- ============================================================================
-- Pipeline stages (each cron invocation processes ONE stage):
--   1. Research (~60s)        — find trending topic via web search
--   2. Editor Brief (~45s)    — Senior Editor reviews, creates creative brief
--   3. Write (~120s)          — writer follows brief, saves article to DB
--   4. Editor QC + Publish    — final quality check, illustration, GitHub commit
-- 5-min interval for development. Will ramp down after 100 articles.
-- ============================================================================

-- 1. Add research_data column for storing data between stages
alter table public.daily_article_log
  add column if not exists research_data jsonb default '{}';

-- 2. Update status CHECK constraint for all pipeline statuses
alter table public.daily_article_log
  drop constraint if exists daily_article_log_status_check;

alter table public.daily_article_log
  add constraint daily_article_log_status_check
  check (status in (
    'started', 'searching', 'research_done',
    'editor_reviewing', 'editor_approved',
    'writing', 'written',
    'editor_qc', 'publishing', 'published',
    'failed',
    -- Legacy statuses (from pre-pipeline runs)
    'topic_selected', 'researching', 'saved'
  ));

-- 3. Remove the old schedule
select cron.unschedule('daily-article-agent');

-- 4. Schedule every 5 minutes for development (one stage per invocation)
select cron.schedule(
  'daily-article-agent',
  '*/5 * * * *',
  $$
  select net.http_post(
    url    := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/daily-article-agent',
    body   := '{"action": "run"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
