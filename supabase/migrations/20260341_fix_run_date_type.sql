-- Fix: run_date column is type date, not text. Cast correctly.
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
  v_topic record;
BEGIN
  v_stale_threshold := now() - interval '5 minutes';

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

  IF EXISTS (
    SELECT 1 FROM daily_article_log
    WHERE status = ANY(v_active_statuses)
    AND stage_started_at >= v_stale_threshold
  ) THEN
    RETURN;
  END IF;

  FOR v_status, v_function_name IN
    SELECT s, f FROM (VALUES
      ('voice_rewrite_done', 'stage-publish'),
      ('qc_approved', 'stage-publish'),
      ('voice_rewrite_pending', 'stage-voice-rewrite'),
      ('independence_done', 'stage-qc'),
      ('written', 'stage-independence'),
      ('editor_approved', 'stage-write'),
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

  SELECT id, topic, source INTO v_topic
  FROM topic_queue
  WHERE status = 'queued'
  ORDER BY expedite DESC, priority ASC, created_at ASC
  LIMIT 1;

  IF v_topic.id IS NOT NULL THEN
    UPDATE topic_queue SET status = 'in_progress' WHERE id = v_topic.id;

    INSERT INTO daily_article_log (run_date, status, topic, source, stage_started_at)
    VALUES (current_date, 'started', v_topic.topic, 'queue', now())
    RETURNING id INTO v_log_id;

    PERFORM net.http_post(
      url := v_base_url || '/functions/v1/stage-research',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'logId', v_log_id::text,
        'topic', v_topic.topic,
        'source', v_topic.source,
        'queueId', v_topic.id::text
      )
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
