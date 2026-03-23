-- ============================================================================
-- Migration: Two separate cron jobs — Scout + Produce
-- Date: 2026-03-26
--
-- Scout: discovers topics, fills the queue (every 15 min)
-- Produce: editor picks from queue, writes, publishes (every 5 min)
-- ============================================================================

-- Remove old single cron job
SELECT cron.unschedule('daily-article-agent');

-- Scout: discover topics every 15 minutes
SELECT cron.schedule(
  'article-scout',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/daily-article-agent',
    body := '{"action": "scout"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Produce: pick from queue and publish every 5 minutes
SELECT cron.schedule(
  'article-produce',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/daily-article-agent',
    body := '{"action": "produce"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
