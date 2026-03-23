-- ============================================================================
-- Migration: Add cost tracking columns to daily_article_log
-- ============================================================================
-- Tracks per-article API costs and token usage breakdown.
-- cost_usd accumulates across all pipeline stages for a single article.
-- token_usage stores per-call breakdown: model, stage, tokens, cost.

ALTER TABLE daily_article_log ADD COLUMN IF NOT EXISTS cost_usd numeric(8,4) DEFAULT 0;
ALTER TABLE daily_article_log ADD COLUMN IF NOT EXISTS token_usage jsonb DEFAULT '[]';
