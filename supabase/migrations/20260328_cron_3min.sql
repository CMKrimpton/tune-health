-- Update produce cron from 5 min to 3 min
SELECT cron.unschedule('article-produce');
SELECT cron.schedule(
  'article-produce',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/daily-article-agent',
    body := '{"action": "produce"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
