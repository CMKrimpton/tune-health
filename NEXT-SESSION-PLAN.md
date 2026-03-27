# Next Session Plan

> **Status**: v12.6.0 live. Auto-production disabled — admin must click "Produce" to start any article. Pipeline clean. 23 topics queued.

---

## Current Architecture (v12.6.0)

- **Manual Produce only**: Admin clicks "Produce" → `produce-topic` → pg_net → research → chain-dispatch → editor brief → pause. No auto-production.
- **Safety-net cron**: `dispatch_pipeline_stage()` runs every 5 min. Recovers stuck articles, advances in-progress stages. **Does NOT pick from queue.**
- **Post-submit**: chain-dispatch → independence (Grok 4) → QC (Flash) → publish. Seconds to publish.
- **Scouts (3x/day)**: Anti-establishment framing. Topics framed as investigations, not debates.
- **Pinger (4x/hour)**: 90s timeout, broadened criteria (24h window, 10 journals, influencer trends).
- **Featured rotation**: every 6h, updates DB + GitHub JSON + triggers Vercel rebuild.
- **Model config**: ALL model IDs centralized in `constants.ts` → `MODELS` object. Zero hardcoded strings.

## What Was Fixed This Session

1. **Killed auto-production** — `dispatch_pipeline_stage()` Step 4 was auto-picking queued topics every 5 min (up to 5/day). Removed entirely. New migration: `20260346_remove_auto_queue_pickup.sql`.
2. **Killed 6 ghost articles** — auto-produced overnight without admin approval. Queue items reset back to `queued`.

## What's Working
- Pipeline is manual-only: admin picks topics, clicks Produce
- Chain-dispatch still works for post-produce stages (research → editor → pause)
- Post-submit flow still works (independence → QC → publish)
- Scouts still fill the queue for admin to curate
- 23 topics queued and ready for manual production

## Priority for Next Session

### 1. Produce Hybrid Articles
- Queue has 23 topics ready. Pick 2-3, produce, write with Opus, verify end-to-end.
- Strong candidates in queue: Adderall generation, brain supplements, prediabetes, red wine myth, zero sugar drinks.

### 2. Monitor Pipeline Health
- Pinger: are signals being stored? Any promoted to queue?
- Scout quality: do topics use investigative framing?
- Featured rotation: does it update GitHub correctly on each cycle?

### 3. Consider
- Reduce scouts from 3x/day to 1x/day (60 topics/day is excessive for 2-3 articles/day)
- Dead CSS cleanup in admin.css (83 classes from original pre-React layouts)
- Reader analytics: Vercel traffic → scout prompts
