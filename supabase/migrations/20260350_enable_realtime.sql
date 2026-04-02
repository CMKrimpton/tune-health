-- Enable Realtime on pipeline tables for live admin dashboard updates
-- daily_article_log: pipeline stage transitions
-- topic_queue: queue changes (produce, priority, delete)

ALTER PUBLICATION supabase_realtime ADD TABLE daily_article_log;
ALTER PUBLICATION supabase_realtime ADD TABLE topic_queue;

-- RLS must be enabled for Realtime to work with anon key
-- These tables are read-only from the client (all writes go through Edge Functions)

ALTER TABLE daily_article_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read for realtime" ON daily_article_log
  FOR SELECT USING (true);

ALTER TABLE topic_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read for realtime" ON topic_queue
  FOR SELECT USING (true);
