# Next Session Plan

> **Status**: v11.2.0 deployed. All 8 stage functions hardened and deployed. Dead code removed. Pipeline confirmed running autonomously (research → editor → write → independence → QC all 200 OK).

---

## Current Architecture (v11.2.0)

- **Cron** (`* * * * *`) calls SQL function `dispatch_pipeline_stage()` directly
- SQL function queries DB for next article, dispatches the appropriate `stage-*` edge function via `pg_net.http_post()` (fire-and-forget)
- Each stage has its own 150s timeout, atomic CAS status transitions, and independent error handling
- Dead code deleted: `daily-article-agent/` and `pipeline-orchestrator/`
- `pipeline-admin` "produce" action now calls SQL function via RPC
- Sonnet is primary writer, Gemini 3.1 Pro fallback

## What Was Fixed (v11.2.0)

1. **`parseScore()` helper** — safely parses AI scores like "8/10", "8", 8 → integer. Used everywhere that writes `editor_score`.
2. **`stage-publish` "8/10" bug** — was passing raw string to integer column, causing PostgreSQL `invalid input syntax` errors.
3. **`stage-editor` no fallback** — was single `claude()` call with no fallback. Now uses `generateWithFallback()` with 2-model chain.
4. **`stage-qc` error handler** — was trying to read consumed request body in catch block. Fixed with `parsedLogId`.
5. **`stage-voice-rewrite` error handling** — had no DB error logging on failure. Now writes failed status + error message.
6. **DB error checking** — added to `stage-research` and `stage-independence` final status updates.
7. **Dead code cleanup** — deleted `daily-article-agent/` (3984-line monolith) and `pipeline-orchestrator/` (replaced by SQL dispatch).
8. **`pipeline-admin` produce** — now calls `dispatch_pipeline_stage()` via SQL RPC instead of deleted orchestrator.

## Priority for Next Session

### 1. Verify End-to-End Article Publication
- Check if the article that was in QC when fixes were deployed actually published
- Check edge function logs: `stage-publish` should have run after QC approved
- Check GitHub repo for new `.astro` + `.json` files
- Check Vercel for successful rebuild

### 2. Monitor stage-write Timeout Risk
- `stage-write` took 143s out of 150s edge function limit
- If longer articles timeout, consider: reducing `maxTokens` from 16384, or splitting write into outline + body stages
- Check `daily_article_log.error` for timeout-related failures

### 3. Cost Tracking
- Pipeline API calls cost real money (~$20 was charged during this session from research → QC)
- Most expensive stages: write (16K output tokens), voice-rewrite (16K output tokens), independence (Grok 3)
- `daily_article_log.cost_usd` tracks per-article spend

### 4. Known Non-Critical Issues
- `WARN: failed to read file: open supabase/layouts/ArticleLayout.astro` during deploy — harmless, template reference in astro.ts
- Supabase CLI v2.75.0 is installed, v2.84.2 is available — update when convenient
