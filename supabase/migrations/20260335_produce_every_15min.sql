-- Change produce cron from hourly to every 15 minutes.
-- The hourly cron was too infrequent as a safety net for stuck self-chains.
-- With 15-minute polling, a dropped chain is retried within 15 min instead of 60.
-- The concurrency guard and empty-queue check are cheap — no wasted API calls.

SELECT cron.unschedule('article-produce');

SELECT cron.schedule(
  'article-produce',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-article-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"action": "produce"}'::jsonb
  );
  $$
);
