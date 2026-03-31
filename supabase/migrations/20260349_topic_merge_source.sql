-- Add 'merged' and 'breaking' to topic_queue source constraint
ALTER TABLE topic_queue DROP CONSTRAINT IF EXISTS topic_queue_source_check;
ALTER TABLE topic_queue ADD CONSTRAINT topic_queue_source_check
  CHECK (source IN ('manual', 'trending', 'series', 'reader_request', 'breaking', 'merged'));
