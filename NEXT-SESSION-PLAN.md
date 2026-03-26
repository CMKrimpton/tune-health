# Next Session Plan

> **Status**: v12.5.0 live. Major session: 3 critical bugs fixed, anti-industry-capture overhaul, model upgrades, dashboard refactor. First hybrid article published (seed oils). Pipeline fully operational.

---

## Current Architecture (v12.5.0)

- **Manual Produce**: `produce-topic` → pg_net → research (reads topic from DB) → chain-dispatch → editor (Sonnet) → pause. Bypasses 5-brief daily cap. queueId persisted in research_data for proper cleanup.
- **Auto-produce**: 5-min cron processes ≤5 queue items/day.
- **Post-submit**: chain-dispatch → independence (Grok 4) → QC (Flash) → publish. Seconds to publish.
- **Scouts (3x/day)**: Anti-establishment framing. Topics framed as investigations, not debates.
- **Pinger (4x/hour)**: 90s timeout, broadened criteria (24h window, 10 journals, influencer trends).
- **Featured rotation**: every 6h, updates DB + GitHub JSON + triggers Vercel rebuild.
- **Queue cleanup**: failed AND published articles auto-reset queue items.
- **Model config**: ALL model IDs centralized in `constants.ts` → `MODELS` object. Zero hardcoded strings.
- **Dashboard**: 333→32 inline styles, all config from types.ts, correct model labels.

## What Was Fixed This Session

### Critical Bugs
1. **Research crash** — `chain_dispatch()` only sent `{logId}`, research needed topic. Now reads from DB.
2. **Pinger zero signals** — pg_net 5s timeout killed Gemini Search. Now 90s. Broadened criteria.
3. **Featured rotation stale** — only updated DB, not GitHub. Now commits JSON + triggers Vercel.
4. **Queue stuck at "producing"** — failed/published articles didn't reset queue. Now they do.

### Editorial Integrity
5. **Anti-industry-capture overhaul** — Research prompt dogma traps were defending industry positions. Replaced with "Industry-Captured Consensus" section. All scout/research/independence prompts rewritten to investigate industry, not defend it.
6. **Tested**: seed oil article went from industry defense ("Seed Oils Aren't Killing You") to investigation ("How 'Heart-Healthy' Fat Advice Raised Your Death Risk — And Who Profited").

### Model & Code Quality
7. **Editor: Flash→Sonnet primary**, Grok 3→Grok 4, pricing table corrected.
8. **All 28 model IDs centralized** into `MODELS` constant. Rule in CLAUDE.md: never change from training data.
9. **Dashboard refactor**: 333→32 inline styles, types.ts as single source of truth, stale labels fixed.

## What's Working
- First hybrid article published: seed oil investigation ($0.064 total)
- Grok 4 independence review: caught fabricated citation, tightened money trail
- Chain-dispatch: seconds from submit to publish
- Featured rotation: updates GitHub + Vercel
- Dashboard: correct model labels, centralized config

## Priority for Next Session

### 1. Produce More Hybrid Articles
- Queue has 20 topics ready. Pick 2-3, produce, write with Opus, verify end-to-end.
- Check pinger_signals table — should start seeing signals now with broadened criteria.

### 2. Monitor 24 Hours
- Pinger: are signals being stored? Any promoted to queue?
- Scout quality: do topics use investigative framing?
- Featured rotation: does it update GitHub correctly on each cycle?
- Daily cap: still 5 briefs/day via cron?

### 3. Consider
- Reduce scouts from 3x/day to 1x/day (60 topics/day is excessive for 2-3 articles/day)
- Dead CSS cleanup in admin.css (83 classes from original pre-React layouts)
- Reader analytics: Vercel traffic → scout prompts
