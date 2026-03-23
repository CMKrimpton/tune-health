-- ============================================================================
-- Daily Article Agent: log table + pg_cron schedule
-- ============================================================================
-- This migration creates:
-- 1. daily_article_log table — tracks each autonomous run
-- 2. pg_cron job — triggers the Edge Function daily at 6 AM UTC
--
-- Prerequisites:
--   - pg_cron extension enabled (Dashboard > Database > Extensions)
--   - pg_net extension enabled  (Dashboard > Database > Extensions)
--   - Edge Function "daily-article-agent" deployed
--   - BRAVE_SEARCH_API_KEY set via `supabase secrets set`
-- ============================================================================

-- 1. Log table
create table if not exists public.daily_article_log (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default current_date,
  topic text,
  slug text,
  title text,
  status text not null default 'started'
    check (status in ('started', 'searching', 'topic_selected', 'researching', 'written', 'saved', 'published', 'failed')),
  error text,
  search_queries jsonb default '[]',
  research_snippets jsonb default '[]',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Index for rate-limit check (one run per day)
create index if not exists daily_log_date_status_idx
  on public.daily_article_log (run_date, status);

-- RLS: service role full access (same pattern as articles table)
alter table public.daily_article_log enable row level security;

create policy "Service role full access" on public.daily_article_log
  for all using (true) with check (true);

-- 2. Enable required extensions (safe to run if already enabled)
create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;

-- 3. Schedule the daily run at 6:00 AM UTC
-- The Edge Function is deployed with --no-verify-jwt so no auth header needed.
-- The function has its own rate-limiting (one successful run per day).
select cron.schedule(
  'daily-article-agent',
  '0 6 * * *',
  $$
  select net.http_post(
    url    := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/daily-article-agent',
    body   := '{"action": "run"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- To verify the cron job was created:
-- SELECT * FROM cron.job WHERE jobname = 'daily-article-agent';
--
-- To check recent cron run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--
-- To remove the cron job:
-- SELECT cron.unschedule('daily-article-agent');
--
-- To change the schedule (e.g., 8 AM UTC):
-- SELECT cron.unschedule('daily-article-agent');
-- SELECT cron.schedule('daily-article-agent', '0 8 * * *', $$ ... $$);
