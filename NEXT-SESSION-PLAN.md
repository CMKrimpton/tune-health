# Next Session Plan

> **Status**: v12.0.0 live. Hybrid pipeline (AI discovers, human writes with Opus). Pinger detecting breaking news 4x/hour. Pipeline hardened. Cost: ~$0.13/article + ~$0.28/day signal detection.

---

## Current Architecture (v12.0.0)

- **Signal detection**: 3x/day scouts (Gemini + Google Search) + 4x/hour pinger (rotating Gemini Flash/Grok/PubMed RSS)
- **Pipeline**: SQL dispatch `dispatch_pipeline_stage()` via pg_cron every minute → pg_net fire-and-forget
- **Hybrid flow**: research → editor brief → **PAUSE** → human writes with Opus (Max subscription) → submit → independence → QC → publish
- **Human-written articles skip voice rewrite** — QC detects `_writtenBy: "human-opus"` and overrides rewrite_voice → publish
- **submit-article auto-strips full HTML pages** — if Opus generates `<!DOCTYPE>`, extracts body sections automatically
- Dead code removed: `daily-article-agent/`, `pipeline-orchestrator/`

## What Was Built This Session

### Pipeline Hardening
- `parseScore()` — safely handles "8/10" AI output for integer columns
- Fallback chain added to stage-editor (was single point of failure)
- Error handlers fixed in stage-qc and stage-voice-rewrite
- DB error checking on all critical status updates

### Cost Reduction ($0.94 → $0.13/article)
- Research: Gemini 2.5 Pro + Google Search ($0.04) — was Sonnet web search ($0.40)
- Editor/QC/Independence revision: Flash ($0.003) — was Sonnet/Gemini Pro ($0.03-0.08)
- Writer: Gemini 3.1 Pro primary ($0.14) — was Sonnet ($0.24)
- Voice rewrite: Opus removed ($0.87/call eliminated)
- Writing: $0 via Max subscription (Opus)
- Scouts: all Gemini Search ($0.12/day) — was Sonnet web search ($1.30/day)

### Hybrid Pipeline
- Pipeline pauses at `editor_approved` (SQL dispatch skips this status)
- Dashboard: "Copy Brief for Claude" button (client-side, no fetch)
- Dashboard: "Submit Written Article" form → resumes pipeline at "written"
- Human-written articles skip voice rewrite
- submit-article auto-strips full HTML pages from Opus
- Gradient + tags included in metadata for Astro schema validation

### Breaking News Pinger
- `pipeline-pinger` edge function, `*/15 * * * *` cron
- Rotating: Gemini Flash Search (:00), PubMed RSS (:15), Grok social (:30), PubMed RSS (:45)
- Three-gate filter: self-dedup → article/queue dedup → corroboration
- `pinger_signals` table with 48h auto-cleanup
- Breaking topics insert at P1 with expedite=true, source="breaking"
- ~$0.16/day

### Scout Upgrade
- "Why now" + search demand + "Our angle" required for each topic
- High-demand topics auto-prioritized
- All scouts use Gemini + Google Search (killed Sonnet web search entirely)

## Priority for Next Session

### 1. Test the Full Hybrid Flow End-to-End
- Queue has 12 topics. Pipeline should research → editor brief → pause
- Pick one, Copy Brief, write in Claude, submit, watch it publish
- Verify: Grok review runs, QC passes (no voice rewrite), publishes to GitHub, Vercel rebuilds

### 2. Monitor Pinger
- Check `pinger_signals` table after 24h — is it detecting real signals?
- Check if corroboration gate is working (medium signals need 2 sources)
- Check false positive rate — are junk topics getting promoted?

### 3. Possible Improvements
- **Prompt trimming**: the stage-write system prompt is 5,400 tokens — could be 2,500 (attention dilution)
- **Reader analytics integration**: which existing articles get the most traffic? Inform scouts
- **Admin dashboard**: show pinger activity, add "Daily Briefing" view of top editor_approved articles
- **Cost monitoring dashboard**: per-day spend chart, per-stage breakdown
