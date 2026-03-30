-- Add copy_editing / copy_edited statuses and route dispatch through stage-copy-edit.
-- Copy edit sits between QC and publish: qc_approved → copy_editing → copy_edited → publishing.

-- 1. Update status constraint
ALTER TABLE daily_article_log DROP CONSTRAINT IF EXISTS daily_article_log_status_check;
ALTER TABLE daily_article_log ADD CONSTRAINT daily_article_log_status_check
  CHECK (status IN (
    'started', 'searching', 'research_done',
    'editor_reviewing', 'editor_approved',
    'writing', 'written',
    'independence_review', 'independence_done',
    'editor_qc', 'qc_approved',
    'voice_rewrite_pending', 'rewriting_voice', 'voice_rewrite_done',
    'copy_editing', 'copy_edited',
    'publishing', 'published',
    'failed',
    'topic_selected', 'researching', 'saved'
  ));

-- 2. Update safety-net dispatch to route qc_approved and voice_rewrite_done through copy-edit
CREATE OR REPLACE FUNCTION dispatch_pipeline_stage()
RETURNS void AS $$
DECLARE
  v_log_id uuid;
  v_status text;
  v_function_name text;
  v_base_url text := 'https://mvkiornsximonxxitiwr.supabase.co';
  v_service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg';
  v_stale_threshold timestamptz;
  v_active_statuses text[] := ARRAY['started','searching','writing','publishing','editor_reviewing','editor_qc','independence_review','researching','topic_selected','rewriting_voice','copy_editing'];
BEGIN
  v_stale_threshold := now() - interval '5 minutes';

  -- Step 1: Stale detection — recover articles stuck in active statuses
  UPDATE daily_article_log
  SET status = CASE
    WHEN research_data ? '_copyEditResult' AND research_data ? '_article' THEN 'copy_edited'
    WHEN research_data ? '_voiceRewriteCompleted' AND research_data ? '_article' THEN 'voice_rewrite_done'
    WHEN research_data ? '_voiceRewriteRequested' AND NOT (research_data ? '_voiceRewriteCompleted') AND research_data ? '_article' THEN 'voice_rewrite_pending'
    WHEN research_data ? '_independenceReview' AND research_data ? '_article' THEN 'independence_done'
    WHEN research_data ? '_article' THEN 'written'
    WHEN research_data ? '_editorBrief' THEN 'editor_approved'
    WHEN research_data ? 'topic' OR research_data ? 'keyFindings' OR research_data ? 'candidates' THEN 'research_done'
    ELSE 'failed'
  END,
  error = CASE
    WHEN NOT (research_data ? 'topic' OR research_data ? 'keyFindings' OR research_data ? 'candidates' OR research_data ? '_editorBrief' OR research_data ? '_article')
    THEN 'Timed out (stale run)'
    ELSE null
  END,
  stage_started_at = now()
  WHERE status = ANY(v_active_statuses)
  AND stage_started_at < v_stale_threshold;

  -- Step 2: Concurrency check — don't dispatch if something is actively running
  IF EXISTS (
    SELECT 1 FROM daily_article_log
    WHERE status = ANY(v_active_statuses)
    AND stage_started_at >= v_stale_threshold
  ) THEN
    RETURN;
  END IF;

  -- Step 3: Advance in-progress articles to next stage (safety net for chain-dispatch)
  -- qc_approved and voice_rewrite_done now route through stage-copy-edit, not stage-publish
  FOR v_status, v_function_name IN
    SELECT s, f FROM (VALUES
      ('copy_edited', 'stage-publish'),
      ('voice_rewrite_done', 'stage-copy-edit'),
      ('qc_approved', 'stage-copy-edit'),
      ('voice_rewrite_pending', 'stage-voice-rewrite'),
      ('independence_done', 'stage-qc'),
      ('written', 'stage-independence'),
      ('research_done', 'stage-editor')
    ) AS stages(s, f)
  LOOP
    SELECT id INTO v_log_id
    FROM daily_article_log
    WHERE status = v_status
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_log_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_base_url || '/functions/v1/' || v_function_name,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object('logId', v_log_id::text)
      );
      RETURN;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
