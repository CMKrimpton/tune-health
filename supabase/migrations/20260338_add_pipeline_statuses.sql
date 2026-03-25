-- Add missing pipeline statuses to the CHECK constraint.
-- v10.0.0 added voice rewrite stages but never updated the constraint.
-- v11.0.0 adds qc_approved (QC and publish are now separate functions).

ALTER TABLE daily_article_log DROP CONSTRAINT IF EXISTS daily_article_log_status_check;
ALTER TABLE daily_article_log ADD CONSTRAINT daily_article_log_status_check
  CHECK (status IN (
    -- 7-stage split pipeline statuses
    'started', 'searching', 'research_done',
    'editor_reviewing', 'editor_approved',
    'writing', 'written',
    'independence_review', 'independence_done',
    'editor_qc', 'qc_approved',
    'voice_rewrite_pending', 'rewriting_voice', 'voice_rewrite_done',
    'publishing', 'published',
    'failed',
    -- Legacy statuses (backwards compat)
    'topic_selected', 'researching', 'saved'
  ));
