-- topic_dedup_log: persistent memory of topic angles that have been considered,
-- even after the source row is deleted (merged, manually removed, etc.)
-- buildFingerprints() queries this with a 90-day window so scouts don't re-suggest
-- angles that were already consumed by a merge or manual delete.

CREATE TABLE IF NOT EXISTS topic_dedup_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_text  TEXT        NOT NULL,
  source      TEXT        NOT NULL CHECK (source IN ('merged', 'deleted')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for time-bounded queries in buildFingerprints (90-day window)
CREATE INDEX IF NOT EXISTS topic_dedup_log_created_at_idx
  ON topic_dedup_log (created_at);

-- Prune entries older than 90 days — runs at 3am UTC daily
SELECT cron.schedule(
  'prune-topic-dedup-log',
  '0 3 * * *',
  $$DELETE FROM topic_dedup_log WHERE created_at < NOW() - INTERVAL '90 days'$$
);
