-- Social Media System — Cron Jobs (Phase 1B)
-- Requires pg_cron and pg_net extensions enabled in Supabase Dashboard

-- ─── Social Poster: every 5 min ─────────────────────────────────────────
-- Dispatches scheduled social_posts to platform APIs
SELECT cron.schedule(
  'social-poster',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/social-poster',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ─── Social Planner: daily 5am UTC ──────────────────────────────────────
-- Daily editorial meeting: selects articles, creates arcs, generates briefs
SELECT cron.schedule(
  'social-planner',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/social-planner',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ─── Social Sync: every 6 hours ─────────────────────────────────────────
-- Pulls engagement metrics from platform APIs, detects velocity
SELECT cron.schedule(
  'social-sync',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/social-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
