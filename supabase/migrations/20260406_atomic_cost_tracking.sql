-- Atomic cost increment for daily_article_log
-- Prevents race conditions when parallel API calls update the same row
-- Uses jsonb_array_cat to atomically append usage entries

CREATE OR REPLACE FUNCTION increment_article_cost(
  p_log_id UUID,
  p_cost_delta NUMERIC,
  p_usage_item JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE daily_article_log
  SET
    cost_usd = COALESCE(cost_usd, 0) + p_cost_delta,
    token_usage = COALESCE(token_usage, '[]'::jsonb) || jsonb_build_array(p_usage_item)
  WHERE id = p_log_id;
END;
$$;

-- Atomic cost increment for system overhead rows
-- Finds or creates today's overhead row, then atomically increments
CREATE OR REPLACE FUNCTION increment_overhead_cost(
  p_cost_delta NUMERIC,
  p_usage_item JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_topic TEXT := 'System overhead (' || v_today::TEXT || ')';
BEGIN
  -- Try to update existing row first (most common path)
  UPDATE daily_article_log
  SET
    cost_usd = COALESCE(cost_usd, 0) + p_cost_delta,
    token_usage = COALESCE(token_usage, '[]'::jsonb) || jsonb_build_array(p_usage_item)
  WHERE slug = '_system_overhead'
    AND run_date = v_today;

  -- If no row existed, insert one
  IF NOT FOUND THEN
    INSERT INTO daily_article_log (run_date, slug, topic, status, source, cost_usd, token_usage, stage_started_at)
    VALUES (v_today, '_system_overhead', v_topic, 'system', 'system', p_cost_delta, jsonb_build_array(p_usage_item), NOW())
    ON CONFLICT (slug, run_date) DO UPDATE SET
      cost_usd = COALESCE(daily_article_log.cost_usd, 0) + p_cost_delta,
      token_usage = COALESCE(daily_article_log.token_usage, '[]'::jsonb) || jsonb_build_array(p_usage_item);
  END IF;
END;
$$;

-- Grant execute to service role (edge functions use service role key)
GRANT EXECUTE ON FUNCTION increment_article_cost(UUID, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION increment_overhead_cost(NUMERIC, JSONB) TO service_role;
