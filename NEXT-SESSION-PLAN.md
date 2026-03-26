# Next Session Plan

> **Status**: v12.4.0 live. All 3 critical bugs fixed — research crash, pinger zero signals, featured rotation stale. Pipeline fully operational: queue → produce → research → editor brief → pause → human write → publish.

---

## Current Architecture (v12.4.0)

- **Manual Produce**: `produce-topic` action → pg_net → research (reads topic from DB) → chain-dispatch → editor → pause. Bypasses 5-brief daily cap.
- **Auto-produce**: 5-min cron processes ≤5 queue items/day. Research chain-dispatches editor.
- **Post-submit**: chain-dispatch → independence → QC → publish. Seconds to publish.
- **Scouts (3x/day)**: rewritten for 20-35 demographic, shareability filter
- **Pinger (4x/hour)**: Gemini Flash (60s timeout)/Grok/PubMed RSS (10 journals). Broadened criteria for younger readers.
- **Featured rotation**: every 6h, updates DB + GitHub JSON + Vercel rebuild. 5h freshness guard.
- **Queue cleanup**: failed articles auto-reset queue items to 'queued'

## What's Working
- Produce from queue → research → editor brief → pause (**tested: seed oil article**)
- Featured rotation pushes to GitHub and triggers Vercel rebuild
- Pinger cron has 90s timeout (was 5s), broadened signal criteria
- Queue items reset on pipeline failure (no more stuck "producing")
- Chain-dispatch eliminates cron waits on all user-triggered flows
- Human-written articles skip voice rewrite and force-publish on revise

## Priority for Next Session

### 1. Write First Hybrid Article End-to-End
- Seed oil article is at `editor_approved` — ready for human writing
- Copy Brief, write in Claude Mac with Opus, Submit
- Watch it chain-dispatch through independence → QC → publish
- Verify on Vercel: correct layout, hero image, no Opus HTML artifacts

### 2. Monitor Pinger
- Wait for next pinger cycle and check `pinger_signals` table
- Verify Gemini Search tick completes within 90s timeout
- Are signals being stored? Any promoted to queue?

### 3. Monitor Featured Rotation
- Check next 6h rotation — does it update GitHub + trigger rebuild?
- Verify only 1 article has `featured: true` at any time

### 4. Consider
- Reduce scouts from 3x/day to 1x/day (60 topics/day is excessive)
- On-demand research: pick from raw queue THEN research runs
- Reader analytics: Vercel traffic → scout prompts
