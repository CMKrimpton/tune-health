-- Pinger: real-time breaking health news detector (4x/hour)
-- Stores detected signals for dedup and corroboration tracking.

CREATE TABLE IF NOT EXISTS pinger_signals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_hash text NOT NULL,
  topic text NOT NULL,
  source text NOT NULL,               -- 'gemini_search', 'grok_social', 'pubmed_rss'
  urgency text DEFAULT 'medium',      -- 'high' or 'medium'
  why_breaking text,
  raw_data jsonb DEFAULT '{}',
  promoted_to_queue boolean DEFAULT false,
  queue_id uuid,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '48 hours'
);

CREATE INDEX IF NOT EXISTS pinger_signals_hash_idx
  ON pinger_signals (signal_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS pinger_signals_expires_idx
  ON pinger_signals (expires_at);

CREATE INDEX IF NOT EXISTS pinger_signals_source_created_idx
  ON pinger_signals (source, created_at DESC);

ALTER TABLE pinger_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on pinger_signals"
  ON pinger_signals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Schedule pinger: every 15 minutes
SELECT cron.schedule(
  'pinger',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := 'https://mvkiornsximonxxitiwr.supabase.co/functions/v1/pipeline-pinger',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
