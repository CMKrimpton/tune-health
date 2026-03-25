# Next Session Plan

> The pipeline split (v11.0.0) is **DONE**. The monolith has been replaced by 11 edge functions + shared utilities.

---

## Completed: Pipeline Split (v11.0.0 — March 25, 2026)

The ~4000-line `daily-article-agent` monolith has been split into:
- `pipeline-orchestrator` — lightweight dispatcher (1-min cron)
- 7 `stage-*` functions — each does ONE job with its own timeout
- `pipeline-scout` — topic discovery (3 daily crons)
- `pipeline-admin` — admin actions
- `_shared/` — 10 shared utility modules

All functions deployed. Crons updated. Frontend updated. Build passes.

---

## Priority for Next Session

### 1. Monitor the Pipeline (First 24h)
- Watch Supabase Edge Function logs for errors
- Verify an article goes from queue → research → editor → write → independence → QC → publish
- Check that scouts run at their scheduled times (6am, 2pm, 10pm UTC)
- Verify featured rotation triggers every 6h

### 2. After April 1, 2026 — Revert Writer Chain
- Change `WRITER_FALLBACK_CHAIN` in `_shared/constants.ts` to Sonnet-primary:
  ```typescript
  export const WRITER_FALLBACK_CHAIN = ["claude-sonnet-4-6", "gemini-3.1-pro-preview", "gpt-5.4"];
  ```
- Redeploy: `stage-research`, `stage-editor`, `stage-write`, `stage-independence`
- Test Sonnet writing quality vs Gemini 3.1 Pro

### 3. Delete the Monolith
Once the split pipeline has run successfully for 24-48h:
- Delete `supabase/functions/daily-article-agent/` directory
- Unschedule any remaining crons pointing to `daily-article-agent`
- The old function will remain in Supabase but receive no traffic
