-- ============================================================================
-- Migration: Parallel Pipeline, Grok Independence Review, Topic Queue
-- Date: 2026-03-25
-- Changes:
--   1. Add new pipeline statuses for independence review stage
--   2. Create topic_queue table for admin-controlled topics
--   3. Update cron schedule (keep 5-min, self-chaining handles speed)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Update status CHECK constraint for new pipeline statuses
-- ---------------------------------------------------------------------------
ALTER TABLE daily_article_log DROP CONSTRAINT IF EXISTS daily_article_log_status_check;
ALTER TABLE daily_article_log ADD CONSTRAINT daily_article_log_status_check
  CHECK (status IN (
    -- 5-stage pipeline statuses
    'started', 'searching', 'research_done',
    'editor_reviewing', 'editor_approved',
    'writing', 'written',
    'independence_review', 'independence_done',
    'editor_qc', 'publishing', 'published',
    'failed',
    -- Legacy statuses (backwards compat)
    'topic_selected', 'researching', 'saved'
  ));

-- Add pipeline_id column to group parallel articles
ALTER TABLE daily_article_log ADD COLUMN IF NOT EXISTS pipeline_id text;

-- Add index for parallel pipeline queries
CREATE INDEX IF NOT EXISTS daily_log_status_idx ON daily_article_log (status);
CREATE INDEX IF NOT EXISTS daily_log_pipeline_idx ON daily_article_log (pipeline_id);

-- ---------------------------------------------------------------------------
-- 2. Create topic_queue table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS topic_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic text NOT NULL,
  notes text,
  category text,
  priority integer DEFAULT 50,
  expedite boolean DEFAULT false,
  source text DEFAULT 'manual' CHECK (source IN ('manual', 'trending', 'series', 'reader_request')),
  status text DEFAULT 'queued' CHECK (status IN ('queued', 'assigned', 'in_progress', 'completed', 'skipped')),
  assigned_log_id uuid REFERENCES daily_article_log(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS for topic_queue
ALTER TABLE topic_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on topic_queue"
  ON topic_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for queue ordering
CREATE INDEX IF NOT EXISTS topic_queue_priority_idx ON topic_queue (expedite DESC, priority ASC, created_at ASC)
  WHERE status = 'queued';
