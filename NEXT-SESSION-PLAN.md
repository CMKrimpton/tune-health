# Next Session Plan

> **Status**: v12.3.0 live. Full chain-dispatch everywhere (produce → research → editor, submit → independence → QC → publish). Manual Produce bypasses daily cap. Queue items expandable.

---

## Current Architecture (v12.3.0)

- **Manual Produce**: `produce-topic` action → pg_net → research → chain-dispatch → editor → pause. Bypasses 5-brief daily cap.
- **Auto-produce**: 5-min cron processes ≤5 queue items/day. Research chain-dispatches editor.
- **Post-submit**: chain-dispatch → independence → QC → publish. Seconds to publish.
- **Scouts (3x/day)**: rewritten for 20-35 demographic, shareability filter
- **Pinger (4x/hour)**: Gemini Flash/Grok/PubMed RSS breaking news
- **Dashboard**: expandable queue items, Clear All Briefs, dismiss buttons, pinger panel

## What's Working
- Topics in queue with scout notes visible on click
- Produce button dispatches immediately (no cap block)
- Chain-dispatch eliminates cron waits on all user-triggered flows
- Human-written articles skip voice rewrite and force-publish on revise

## Priority for Next Session

### 1. Write First Hybrid Article End-to-End
- Pick a topic, hit Produce, wait for editor brief (~1 min)
- Copy Brief, write in Claude Mac with Opus, Submit
- Watch it chain-dispatch through independence → QC → publish
- Verify on Vercel: correct layout, hero image, no Opus HTML artifacts

### 2. Monitor 24 Hours
- Pinger signals: is it detecting real breaking news?
- Scout quality: are the younger-reader topics better?
- Daily cap: are exactly 5 auto-briefs being created?
- API costs: should be dramatically lower

### 3. Consider
- Reduce scouts from 3x/day to 1x/day
- On-demand research: pick from raw queue THEN research runs
- Reader analytics: Vercel traffic → scout prompts
