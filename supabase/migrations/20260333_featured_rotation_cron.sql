-- Independent featured rotation cron — runs every 6 hours
-- Works even when article production crons are paused
SELECT cron.schedule(
  'featured-rotation',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-article-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action": "rotate-featured"}'::jsonb
  );
  $$
);
