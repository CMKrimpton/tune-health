-- Chain-dispatch via pg_net (fire-and-forget at the DB level).
-- JavaScript fetch() in edge functions gets killed when the function returns.
-- pg_net.http_post() persists after the calling function's connection closes.

CREATE OR REPLACE FUNCTION chain_dispatch(p_function_name text, p_log_id uuid)
RETURNS void AS $$
DECLARE
  v_base_url text := 'https://mvkiornsximonxxitiwr.supabase.co';
  v_service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2lvcm5zeGltb254eGl0aXdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIyMzc4NSwiZXhwIjoyMDgyNzk5Nzg1fQ.hVhohYs4UoPQwBO9-LD7TtfJKneWZgi21vnNXEoRZPg';
BEGIN
  PERFORM net.http_post(
    url := v_base_url || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('logId', p_log_id::text)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
