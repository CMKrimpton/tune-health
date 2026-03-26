# Next Session Plan

> **Status**: v12.2.0 live. Scouts rewritten for 20-35 demographic. Dashboard has Clear All Briefs + dismiss buttons. Chain-dispatch via pg_net. 14 fresh topics in queue (Ozempic, PFAS, gut-cancer link).

---

## Current Architecture (v12.2.0)

- **Scouts (3x/day)**: rewritten for younger readers — TikTok/Reddit/Trends, shareability filter, "would a 25-year-old text this?"
- **Pinger (4x/hour)**: Gemini Flash/Grok/PubMed RSS breaking news detection
- **Pre-submit**: 5-min cron processes ≤5 queue items/day → research → editor brief → PAUSE
- **Human writes**: Copy Brief for Claude → Opus writes → Submit Article
- **Post-submit**: chain-dispatch via pg_net → independence → QC → publish (seconds, not minutes)
- **Dashboard**: Clear All Briefs button, × dismiss per card, BREAKING badges, pinger activity panel

## What's Working
- 14 queue topics from rewritten scouts (Ozempic psychiatric benefits, PFAS in bones, etc.)
- Chain-dispatch eliminates cron waits after submit
- Human-written articles skip voice rewrite and force-publish on revise
- Pinger monitoring for breaking health news

## Priority for Next Session

### 1. Write Your First Hybrid Article End-to-End
- Wait for pipeline to process queue topics into editor_approved briefs
- Pick one, Copy Brief, write in Claude Mac with Opus, Submit
- Watch it chain-dispatch through independence → QC → publish
- Verify: published on Vercel, correct layout, hero image generated

### 2. Monitor Scout Quality
- Are the new younger-reader topics better? Check the next scout run (6am UTC)
- Is the dedup catching the obvious duplicates (multiple Ozempic angles)?
- Are editor briefs generating shareable headlines (no medical jargon)?

### 3. Consider
- Reduce scouts from 3x/day to 1x/day (queue accumulates faster than human writes)
- On-demand research: let human pick from raw queue THEN research runs (instead of auto)
- Reader analytics: Vercel traffic data → inform scout prompts
- Trim editor brief prompt (also very long, same attention dilution issue as writer prompt was)
