# Next Session Plan

> **Status**: Pipeline split is deployed. Crons are running via SQL dispatch function (`dispatch_pipeline_stage()`). First autonomous article in progress. Multiple bugs were found and fixed during this session — see postmortem below.

---

## Current Architecture (v11.1.0)

- **Cron** (`* * * * *`) calls SQL function `dispatch_pipeline_stage()` directly
- SQL function queries DB for next article, dispatches the appropriate `stage-*` edge function via `pg_net.http_post()` (fire-and-forget)
- Each stage has its own 150s timeout, atomic CAS status transitions, and independent error handling
- `pipeline-orchestrator` edge function exists but is **NOT used by cron** — the SQL function replaced it
- Sonnet is primary writer, Gemini 3.1 Pro fallback

## Priority for Next Session

### 1. Verify End-to-End Pipeline
- Check Postgres logs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`
- Check edge function logs for `stage-research`, `stage-editor`, `stage-write`, `stage-independence`, `stage-qc`, `stage-voice-rewrite`, `stage-publish`
- Verify an article goes queue → published autonomously
- If stuck: check the `error` field in `daily_article_log` — it now captures real DB errors

### 2. Clean Up Dead Code
- Delete `supabase/functions/daily-article-agent/` (the old monolith)
- Delete `supabase/functions/pipeline-orchestrator/` (replaced by SQL function)
- Remove old cron jobs that reference dead functions

### 3. Known Issues to Watch
- `editor_score` parsed with `parseInt()` — AI sometimes returns "8/10" instead of 8
- `stage-editor` uses direct `claude()` call (no fallback) — if Sonnet is down, editor fails and admin must retry
- Stale detection in SQL function may reset articles that a stage-function is still actively processing (5-min threshold)

---

## Postmortem: What Went Wrong (March 25-26, 2026)

### The Task
Split the `daily-article-agent` monolith (3,984 lines) into separate edge functions per stage.

### What Actually Happened
The split itself was done correctly (11 edge functions + 10 shared modules). But deploying and making it work autonomously took ~10 hours due to a cascade of failures:

1. **Root cause never checked**: `pg_cron` jobs had been failing the ENTIRE TIME with `unrecognized configuration parameter "app.settings.supabase_url"`. The `app.settings.*` database config was never set. Every test was manual curl calls that bypassed the cron — giving false positives.

2. **Orchestrator-calls-stage architecture didn't work**: Supabase terminates edge function invocations when the calling HTTP client disconnects. The orchestrator edge function called stage functions via `fetch()`, but when the orchestrator's own 150s timeout expired, it killed the stage function too. Three iterations of dispatch patterns were tried (5s timeout, full await, fire-and-forget) before the correct solution: SQL function using `pg_net.http_post()`.

3. **DB CHECK constraint missing new statuses**: `voice_rewrite_pending`, `qc_approved`, etc. weren't in the PostgreSQL CHECK constraint. Status updates were silently rejected. No error was returned by the Supabase client.

4. **Silent DB failures everywhere**: Status updates, score writes, and research_data saves all used `await db.update().eq()` without checking the return value. When updates failed (type mismatches, constraint violations), the function returned 200 "success" while the DB was unchanged. The `editor_score` column is integer but the AI returned `"8/10"`.

5. **OpenAI API changed**: `max_tokens` → `max_completion_tokens` for GPT-5.4. All three QC fallback models were failing.

6. **`run_date` type mismatch**: The SQL dispatch function used `current_date::text` but the column is type `date`.

### What Should Have Been Done
1. Check `cron.job_run_details` in the FIRST 5 minutes
2. Use `pg_net.http_post()` from the start (documented Supabase pattern for fire-and-forget)
3. Add error checking on ALL DB writes (never trust silent `.update().eq()`)
4. Test with actual cron dispatch, not manual curl
5. Check column types before casting AI output to database fields
