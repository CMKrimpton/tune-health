-- ============================================================================
-- Migration: Fill schema gaps — proper columns instead of JSON blobs
-- ============================================================================

-- daily_article_log — extract buried fields from research_data JSON
ALTER TABLE daily_article_log ADD COLUMN IF NOT EXISTS stage_started_at timestamptz;
ALTER TABLE daily_article_log ADD COLUMN IF NOT EXISTS model_used text;
ALTER TABLE daily_article_log ADD COLUMN IF NOT EXISTS grok_score integer;
ALTER TABLE daily_article_log ADD COLUMN IF NOT EXISTS editor_score integer;
ALTER TABLE daily_article_log ADD COLUMN IF NOT EXISTS revision_count integer DEFAULT 0;
ALTER TABLE daily_article_log ADD COLUMN IF NOT EXISTS source text DEFAULT 'trending';

-- topic_queue — context for the editor
ALTER TABLE topic_queue ADD COLUMN IF NOT EXISTS editor_score integer;
ALTER TABLE topic_queue ADD COLUMN IF NOT EXISTS research_summary text;

-- articles — traceability and scores
ALTER TABLE articles ADD COLUMN IF NOT EXISTS independence_score integer;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS editor_score integer;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS pipeline_log_id uuid REFERENCES daily_article_log(id);
