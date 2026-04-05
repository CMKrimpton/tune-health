-- ============================================================================
-- Migration: Editorial Analytics — Self-Learning Feedback System
-- Date: 2026-04-08
--
-- Creates materialized views and SQL functions that aggregate editorial
-- performance data. Refreshed daily by cron at 4am UTC. Zero AI cost.
-- Used by pipeline stages to inject performance context into prompts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. mv_category_performance — per-category quality aggregates (90-day window)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_category_performance AS
SELECT
  a.category,
  COUNT(*)::int AS article_count,
  ROUND(AVG(dal.editor_score), 1) AS avg_editor_score,
  ROUND(AVG(dal.grok_score), 1) AS avg_grok_score,
  ROUND(AVG(dal.revision_count), 1) AS avg_revisions,
  ROUND(
    COUNT(*) FILTER (WHERE dal.status = 'failed')::numeric /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS kill_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE dal.research_data ? '_voiceRewriteRequested')::numeric /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS voice_rewrite_rate_pct,
  ROUND(AVG(dal.cost_usd::numeric), 4) AS avg_cost_usd
FROM daily_article_log dal
JOIN articles a ON a.pipeline_log_id = dal.id
WHERE dal.created_at > NOW() - INTERVAL '90 days'
  AND dal.status IN ('published', 'failed')
  AND a.category IS NOT NULL
GROUP BY a.category
ORDER BY article_count DESC;

CREATE UNIQUE INDEX IF NOT EXISTS mv_category_perf_cat_idx ON mv_category_performance (category);

-- ---------------------------------------------------------------------------
-- 2. mv_scout_performance — per-scout-desk success rates (90-day window)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_scout_performance AS
SELECT
  CASE
    WHEN tq.notes ILIKE '%gemini scout%' THEN 'gemini'
    WHEN tq.notes ILIKE '%grok scout%' THEN 'grok'
    WHEN tq.notes ILIKE '%sonnet scout%' THEN 'sonnet'
    WHEN tq.source = 'breaking' THEN 'pinger'
    WHEN tq.source = 'manual' THEN 'manual'
    ELSE 'unknown'
  END AS desk,
  COUNT(*)::int AS topics_suggested,
  COUNT(*) FILTER (WHERE tq.status = 'completed')::int AS topics_published,
  COUNT(*) FILTER (WHERE tq.status = 'skipped')::int AS topics_skipped,
  ROUND(
    COUNT(*) FILTER (WHERE tq.status = 'completed')::numeric /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS publish_rate_pct,
  ROUND(AVG(
    CASE WHEN dal.editor_score IS NOT NULL THEN dal.editor_score ELSE NULL END
  ), 1) AS avg_editor_score,
  ROUND(AVG(
    CASE WHEN dal.grok_score IS NOT NULL THEN dal.grok_score ELSE NULL END
  ), 1) AS avg_grok_score
FROM topic_queue tq
LEFT JOIN daily_article_log dal ON dal.queue_id = tq.id
WHERE tq.created_at > NOW() - INTERVAL '90 days'
GROUP BY desk
ORDER BY topics_suggested DESC;

CREATE UNIQUE INDEX IF NOT EXISTS mv_scout_perf_desk_idx ON mv_scout_performance (desk);

-- ---------------------------------------------------------------------------
-- 3. mv_social_performance — engagement by platform+persona (60-day window)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_social_performance AS
SELECT
  sp.platform,
  sp.persona,
  COUNT(*)::int AS post_count,
  ROUND(AVG(sp.engagement_score), 1) AS avg_engagement,
  MAX(sp.engagement_score) AS max_engagement,
  -- Best hook_type: look up from angle registry for posts on this platform+persona
  (
    SELECT sar.hook_type
    FROM social_angle_registry sar
    JOIN social_posts sp2 ON sp2.article_slug = sar.article_slug
      AND sp2.platform = sp.platform AND sp2.persona = sp.persona
    WHERE sar.engagement_score IS NOT NULL
    GROUP BY sar.hook_type
    ORDER BY AVG(sar.engagement_score) DESC
    LIMIT 1
  ) AS best_hook_type
FROM social_posts sp
WHERE sp.status = 'posted'
  AND sp.posted_at > NOW() - INTERVAL '60 days'
  AND sp.engagement_score IS NOT NULL
GROUP BY sp.platform, sp.persona
ORDER BY avg_engagement DESC;

CREATE UNIQUE INDEX IF NOT EXISTS mv_social_perf_plat_persona_idx ON mv_social_performance (platform, persona);

-- ---------------------------------------------------------------------------
-- 4. get_editorial_digest() — single JSONB blob for all pipeline stages
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_editorial_digest()
RETURNS jsonb AS $$
DECLARE
  v_top_articles jsonb;
  v_category_perf jsonb;
  v_scout_perf jsonb;
  v_social_perf jsonb;
  v_voice_failures jsonb;
  v_pinger_accuracy jsonb;
BEGIN
  -- Top 10 articles by composite score
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_articles
  FROM (
    SELECT
      a.slug, a.title, a.category,
      a.editor_score, a.independence_score,
      COALESCE(
        (SELECT MAX(sar.engagement_score) FROM social_angle_registry sar WHERE sar.article_slug = a.slug),
        0
      ) AS social_engagement,
      ROUND(
        COALESCE(a.editor_score, 7) * 0.4 +
        COALESCE(a.independence_score, 7) * 0.3 +
        COALESCE(
          (SELECT MAX(sar.engagement_score) FROM social_angle_registry sar WHERE sar.article_slug = a.slug),
          0
        ) * 0.3,
        1
      ) AS composite_score
    FROM articles a
    WHERE a.status = 'published'
      AND a.published_at > NOW() - INTERVAL '90 days'
      AND (a.editor_score IS NOT NULL OR a.independence_score IS NOT NULL)
    ORDER BY composite_score DESC
    LIMIT 10
  ) t;

  -- Category performance from materialized view
  SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb) INTO v_category_perf
  FROM mv_category_performance c;

  -- Scout performance from materialized view
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_scout_perf
  FROM mv_scout_performance s;

  -- Social performance from materialized view
  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO v_social_perf
  FROM mv_social_performance p;

  -- Common voice failures (last 30 published articles)
  SELECT COALESCE(jsonb_agg(row_to_json(v)), '[]'::jsonb) INTO v_voice_failures
  FROM (
    SELECT phrase, COUNT(*)::int AS occurrences
    FROM (
      SELECT jsonb_array_elements_text(
        COALESCE(
          dal.research_data->'_qcResult'->'voiceCheck'->'bannedPhrases',
          '[]'::jsonb
        )
      ) AS phrase
      FROM daily_article_log dal
      WHERE dal.status = 'published'
        AND dal.created_at > NOW() - INTERVAL '60 days'
        AND dal.research_data ? '_qcResult'
    ) phrases
    GROUP BY phrase
    ORDER BY occurrences DESC
    LIMIT 10
  ) v;

  -- Pinger accuracy per source
  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO v_pinger_accuracy
  FROM (
    SELECT
      ps.source,
      COUNT(*)::int AS signals_total,
      COUNT(*) FILTER (WHERE ps.promoted_to_queue)::int AS signals_promoted,
      COUNT(*) FILTER (WHERE dal.status = 'published')::int AS articles_published,
      ROUND(AVG(
        CASE WHEN dal.editor_score IS NOT NULL THEN dal.editor_score ELSE NULL END
      ), 1) AS avg_editor_score
    FROM pinger_signals ps
    LEFT JOIN topic_queue tq ON tq.id = ps.queue_id
    LEFT JOIN daily_article_log dal ON dal.queue_id = tq.id AND dal.status = 'published'
    WHERE ps.created_at > NOW() - INTERVAL '90 days'
    GROUP BY ps.source
  ) p;

  RETURN jsonb_build_object(
    'top_articles', v_top_articles,
    'category_performance', v_category_perf,
    'scout_performance', v_scout_perf,
    'social_performance', v_social_perf,
    'voice_failures', v_voice_failures,
    'pinger_accuracy', v_pinger_accuracy,
    'generated_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5. Cron job — refresh materialized views daily at 4am UTC
--    (before 5am planner and 6am first scout)
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'analytics-refresh',
  '0 4 * * *',
  $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_scout_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_social_performance;
  $$
);

-- ---------------------------------------------------------------------------
-- 6. Fix topic_dedup_log source constraint to include 'killed'
--    (pipeline-admin inserts 'killed' but old constraint only allows 'merged', 'deleted')
-- ---------------------------------------------------------------------------
ALTER TABLE topic_dedup_log DROP CONSTRAINT IF EXISTS topic_dedup_log_source_check;
ALTER TABLE topic_dedup_log ADD CONSTRAINT topic_dedup_log_source_check
  CHECK (source IN ('merged', 'deleted', 'killed'));

-- ---------------------------------------------------------------------------
-- 7. Add 'breaking' to topic_queue.source constraint
--    (pinger inserts 'breaking' but original constraint only allows 4 values)
-- ---------------------------------------------------------------------------
ALTER TABLE topic_queue DROP CONSTRAINT IF EXISTS topic_queue_source_check;
ALTER TABLE topic_queue ADD CONSTRAINT topic_queue_source_check
  CHECK (source IN ('manual', 'trending', 'series', 'reader_request', 'breaking', 'queue', 'merged'));
