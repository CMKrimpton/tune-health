-- Re-enable crons after duplicate fix
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
