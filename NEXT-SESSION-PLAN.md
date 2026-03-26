# Next Session Plan

> **Status**: v12.1.0 live. Hybrid pipeline fully optimized. Chain-dispatch via pg_net (no cron waits). 5-brief daily cap. 5-min safety-net cron. All 18 self-audit checks pass.

---

## Current Architecture (v12.1.0)

- **Signal detection**: 3x/day scouts (Gemini + Google Search) + 4x/hour pinger (Gemini Flash/Grok/PubMed RSS)
- **Pre-submit**: SQL dispatch every 5 min processes queue → research → editor brief → PAUSE. Capped at 5 briefs/day.
- **Human writes**: picks topic from dashboard, copies brief to Claude, Opus writes, pastes back
- **Post-submit**: chain-dispatch via `chain_dispatch()` SQL → `pg_net.http_post()`. independence → QC → publish fires as a direct chain. No cron waits.
- **Human-article protections**: QC skips voice rewrite, force-publishes on revise. `_writtenBy: "human-opus"` checked before all QC decision paths.

## What Was Built This Session

### Pipeline Hardening
- `parseScore()`, fallback chains, DB error checking, error handlers on all stages

### Cost Reduction ($0.94 → $0.13/article)
- Gemini for research/scouts (was Sonnet web search at $0.40/call)
- Flash for structured stages (editor brief, QC, independence revision)
- Opus removed from voice rewrite chain
- Writing: $0 via Max subscription

### Hybrid Pipeline
- Pipeline pauses at `editor_approved`, human writes with Opus
- Copy Brief + Submit Article dashboard UI
- HTML auto-stripping for full pages from Opus
- Chain-dispatch via pg_net (not JS fetch — proven pattern)
- 5-brief daily cap, 5-min cron safety net

### Breaking News Pinger
- 4x/hour rotating: Gemini Flash, PubMed RSS, Grok social
- Three-gate filter with corroboration
- ~$0.16/day

### Dead Code Removed
- 4,176 lines: daily-article-agent, pipeline-orchestrator
- Two-model scout path, dead statuses, unused imports

## Priority for Next Session

### 1. Test Full Hybrid Flow
- 12 articles at editor_approved. Pick one, write with Opus, submit, watch it publish.
- Verify: chain-dispatch fires immediately, Grok reviews, QC passes, publishes to GitHub, Vercel rebuilds.
- Check the published .astro file has correct structure (assembleAstroFile format).

### 2. Monitor Over 24 Hours
- Check pinger_signals after a day — are real signals being detected?
- Check daily_article_log — are only 5 briefs/day being processed (not 60)?
- Check cron.job_run_details — 5-min dispatch, 15-min pinger, both clean?
- Check Anthropic API billing — should be dramatically lower

### 3. Consider Further
- Reduce scouts from 3x/day to 1x/day (human writes 2-3/day, 60 topics is excessive)
- On-demand research: let human pick from raw queue, THEN research+brief runs (instead of pre-processing)
- Reader analytics: feed Vercel traffic data into scout prompts
