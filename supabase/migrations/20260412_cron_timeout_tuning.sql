-- Tune cron timeouts based on actual observed runtimes.
--
-- 20260411 set everything to 60s. After verification:
--   - scout-gemini takes ~87s (Gemini 2.5 Pro + Google Search grounding
--     + dedup pass + DB inserts) → needs 180s
--   - pinger-gemini (gemini_search) takes ~30-60s + retry → 90s safe
--   - social-planner mines catalog and creates plan → needs 120s
--   - social-sync pulls metrics from 14 platforms → needs 120s
--   - social-engine generates briefs for ALL personas → needs 120s
--   - social-poster does 1-3 platform calls → 60s ok
--   - featured-rotation just runs SQL → 30s ok
--   - pinger covers 3 sources rotating → 90s
--
-- Generous timeouts here are FREE — pg_net doesn't bill on duration, it
-- just affects when the connection is closed and the call is logged as
-- complete vs timeout. The actual edge function work runs to completion
-- on Supabase's side regardless.

SELECT cron.unschedule('scout-gemini');
SELECT cron.schedule('scout-gemini', '0 6 * * *',
  $$SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/pipeline-scout',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg"}'::jsonb,
    body := '{"scoutModel":"gemini"}'::jsonb,
    timeout_milliseconds := 180000
  );$$
);

SELECT cron.unschedule('scout-grok');
SELECT cron.schedule('scout-grok', '0 22 * * *',
  $$SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/pipeline-scout',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg"}'::jsonb,
    body := '{"scoutModel":"grok"}'::jsonb,
    timeout_milliseconds := 180000
  );$$
);

SELECT cron.unschedule('scout-grok-afternoon');
SELECT cron.schedule('scout-grok-afternoon', '0 14 * * *',
  $$SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/pipeline-scout',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg"}'::jsonb,
    body := '{"scoutModel":"grok"}'::jsonb,
    timeout_milliseconds := 180000
  );$$
);

SELECT cron.unschedule('pinger');
SELECT cron.schedule('pinger', '*/30 * * * *',
  $$SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/pipeline-pinger',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );$$
);

SELECT cron.unschedule('social-planner');
SELECT cron.schedule('social-planner', '0 5 * * *',
  $$SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/social-planner',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );$$
);

SELECT cron.unschedule('social-sync');
SELECT cron.schedule('social-sync', '0 */6 * * *',
  $$SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/social-sync',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );$$
);

-- pinger, social-poster, featured-rotation keep their 60s from 20260411
-- (already sufficient — pinger ~10-65s observed, poster does 1-3 calls,
-- featured-rotation is pure SQL).
