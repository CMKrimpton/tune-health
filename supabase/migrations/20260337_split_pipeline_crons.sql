-- Update all cron jobs to point to the new split pipeline functions.
-- The monolith `daily-article-agent` is replaced by:
--   - pipeline-orchestrator: 1-min cron, picks articles, dispatches stage functions
--   - pipeline-scout: 3 daily crons, discovers topics
--   - pipeline-admin: admin actions (status, queue CRUD, etc.)
--   - stage-*: individual stage functions called by orchestrator

-- Unschedule all existing crons that pointed to daily-article-agent
SELECT cron.unschedule('article-produce');
SELECT cron.unschedule('scout-gemini');
SELECT cron.unschedule('scout-sonnet');
SELECT cron.unschedule('scout-grok');

-- Produce: every minute — calls pipeline-orchestrator (not daily-article-agent)
SELECT cron.schedule(
  'article-produce',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/pipeline-orchestrator',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  );
  $$
);

-- Gemini scout: 6am UTC
SELECT cron.schedule(
  'scout-gemini',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/pipeline-scout',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"scoutModel": "gemini"}'::jsonb
  );
  $$
);

-- Sonnet scout: 2pm UTC
SELECT cron.schedule(
  'scout-sonnet',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/pipeline-scout',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"scoutModel": "sonnet"}'::jsonb
  );
  $$
);

-- Grok scout: 10pm UTC
SELECT cron.schedule(
  'scout-grok',
  '0 22 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/pipeline-scout',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"scoutModel": "grok"}'::jsonb
  );
  $$
);

-- Featured rotation: every 6 hours — calls pipeline-admin
SELECT cron.unschedule('featured-rotation');
SELECT cron.schedule(
  'featured-rotation',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/pipeline-admin',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"action": "rotate-featured"}'::jsonb
  );
  $$
);
