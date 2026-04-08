-- Bulk-dispatch narration regeneration via pg_net.http_post.
--
-- pg_net is a postgres background worker that survives the lifetime of the
-- calling SQL session. Unlike fetch() from inside an edge function (which
-- gets killed when the parent function returns), pg_net actually delivers
-- the HTTP request reliably.
--
-- This is the same pattern used by chain_dispatch() and dispatch_pipeline_stage()
-- elsewhere in the codebase.

CREATE OR REPLACE FUNCTION dispatch_narration_regen_batch(p_slugs text[])
RETURNS integer AS $$
DECLARE
  v_base_url text := 'https://mvkiornsximonxxitiwr.supabase.co';
  v_service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg';
  v_slug text;
  v_count integer := 0;
BEGIN
  FOREACH v_slug IN ARRAY p_slugs LOOP
    PERFORM net.http_post(
      url := v_base_url || '/functions/v1/generate-narration',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'action', 'generate',
        'slug', v_slug,
        'force', true
      ),
      timeout_milliseconds := 60000
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
