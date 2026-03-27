-- Remove automatic queue pickup from dispatch_pipeline_stage()
-- The cron was auto-producing up to 5 articles/day from the queue without admin approval.
-- Now: admin must click "Produce" in the dashboard to start any article.
-- Steps 1-3 remain (stale cleanup, concurrency guard, advancing in-progress articles).
-- Step 4 (auto queue pickup) is deleted entirely.

CREATE OR REPLACE FUNCTION dispatch_pipeline_stage()
RETURNS void AS $$
DECLARE
  v_log_id uuid;
  v_status text;
  v_function_name text;
  v_base_url text := 'https://mvkiornsximonxxitiwr.supabase.co';
  v_service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg';
  v_stale_threshold timestamptz;
  v_active_statuses text[] := ARRAY['started','searching','writing','publishing','editor_reviewing','editor_qc','independence_review','researching','topic_selected','rewriting_voice'];
BEGIN
  v_stale_threshold := now() - interval '5 minutes';

  -- Step 1: Stale detection — recover articles stuck in active statuses
  UPDATE daily_article_log
  SET status = CASE
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
  FOR v_status, v_function_name IN
    SELECT s, f FROM (VALUES
      ('voice_rewrite_done', 'stage-publish'),
      ('qc_approved', 'stage-publish'),
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

  -- Step 4 REMOVED: No more automatic queue pickup.
  -- Admin must click "Produce" in the dashboard to start any article.
  -- produce-topic action in pipeline-admin handles manual production.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
