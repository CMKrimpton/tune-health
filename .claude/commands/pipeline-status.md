---
description: Check pipeline state — queue, stuck articles, cron jobs, errors
---

Check the current state of the article pipeline.

1. Query the `daily_article_log` table for recent entries (last 48 hours), ordered by most recent:
   - Show: topic, slug, status, stage, error (if any), model_used, cost_usd, created_at
   - Highlight any stuck articles (status not 'published' or 'killed' and older than 30 min)

2. Query the `topic_queue` table for active items:
   - Show: topic, priority, status, source, expedite flag
   - Count by status (queued/assigned/in_progress/completed/skipped)

3. Check the cron schedule: `SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;`

4. Check recent cron runs for errors: `SELECT jobid, job_name, status, return_message FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

5. Count total published articles: `SELECT count(*) FROM articles WHERE status = 'published';`

Summarize: what's running, what's stuck, what's queued, any errors.

Use the Supabase CLI or direct psql connection. If neither is available, use the pipeline-admin edge function status action.