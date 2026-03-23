-- Replace old high-frequency scout/produce crons with smart multi-model scouts
-- Old: scout every 15 min ($286/month) + produce every 3 min
-- New: 3 model-specific scouts per day ($5/month) + produce every 15 min

-- Remove old crons if they exist (they may already be unscheduled)
SELECT cron.unschedule('article-scout') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'article-scout');
SELECT cron.unschedule('article-produce') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'article-produce');

-- Gemini scout: 6am UTC — Google Search, trending topics
SELECT cron.schedule(
  'scout-gemini',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-article-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"action": "scout", "scoutModel": "gemini"}'::jsonb
  );
  $$
);

-- Sonnet scout: 2pm UTC — web search, editorial potential
SELECT cron.schedule(
  'scout-sonnet',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-article-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"action": "scout", "scoutModel": "sonnet"}'::jsonb
  );
  $$
);

-- Grok scout: 10pm UTC — contrarian, independent perspective
SELECT cron.schedule(
  'scout-grok',
  '0 22 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-article-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"action": "scout", "scoutModel": "grok"}'::jsonb
  );
  $$
);

-- Produce: every hour (editor picks best topic from queue, self-chains through stages)
-- 24 articles/day max. Self-chaining handles multi-stage production within each hour.
SELECT cron.schedule(
  'article-produce',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-article-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"action": "produce"}'::jsonb
  );
  $$
);
