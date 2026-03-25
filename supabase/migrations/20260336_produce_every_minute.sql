-- Change produce cron from every 15 minutes to every minute.
-- With the stage-loop architecture (1-2 stages per invocation), the cron
-- drives stage progression. Each invocation runs 1-2 stages to avoid the
-- ~150s edge function timeout. At 1-minute intervals, a full 7-stage article
-- publishes in ~7 minutes instead of 1.5 hours.
-- The concurrency guard prevents duplicate runs — each invocation checks
-- for active stages and skips if one is running.

SELECT cron.unschedule('article-produce');

SELECT cron.schedule(
  'article-produce',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-article-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"action": "produce"}'::jsonb
  );
  $$
);
