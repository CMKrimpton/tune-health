# Next Session Plan

> **Status**: v12.7.1 live. Headline system overhauled. Encoding bug permanently killed. All 121 articles audited and clean.

---

## Current Architecture (v12.7.1)

- **Manual Produce only**: Admin clicks "Produce" → `produce-topic` → pg_net → research → chain-dispatch → editor brief → pause. No auto-production.
- **Safety-net cron**: `dispatch_pipeline_stage()` runs every 5 min. Recovers stuck articles, advances in-progress stages. **Does NOT pick from queue.**
- **Post-submit**: chain-dispatch → independence (Grok 4) → QC (Flash) → publish. Seconds to publish.
- **Headline system**: 10-word max cap enforced at research, editor, writer, and QC stages. Writer owns the headline — editor's is a "working headline." Submit form has title input field.
- **Encoding**: All GitHub read paths use `Uint8Array + TextDecoder`. All write paths use `TextEncoder + btoa` or `encoding: "utf-8"`. No raw `atob()` on text content anywhere.
- **Featured rotation**: every 6h, updates DB + GitHub JSON + triggers Vercel rebuild. UTF-8-safe round-trip.
- **Model config**: ALL model IDs centralized in `constants.ts` → `MODELS` object. Zero hardcoded strings.

## What Was Fixed This Session

1. **Article HTML audit** — fixed 4 articles with broken tags (unclosed sections/divs in omega-3, aging-metabolic, intermittent-fasting, engineered-bacteria)
2. **Headline system overhaul** — editor prompt had contradictory rules (banned two-sentence kickers but every example was one). Added 10-word hard cap, single-sentence examples. Writer now owns the headline. Dashboard submit form has title input
3. **Recurring mojibake root cause** — `atob()` in `featured.ts` and `stage-publish` corrupted multi-byte UTF-8 chars every time it read+wrote GitHub files. Fixed with `Uint8Array + TextDecoder`. Repaired 6 corrupted JSON files
4. **Full encoding audit** — verified all 2 read paths and 4 write paths are now UTF-8-safe. No other `atob()` on text content in the codebase

## What's Working
- Pipeline is manual-only: admin picks topics, clicks Produce
- Chain-dispatch works for post-produce stages (research → editor → pause)
- Post-submit flow works (independence → QC → publish)
- Writer can override headline at submit time
- All 121 articles are HTML-clean with balanced tags
- All JSON content files are encoding-clean (no mojibake)
- Scouts still fill the queue for admin to curate

## Priority for Next Session

### 1. Produce Hybrid Articles
- Queue has topics ready. Pick 2-3, produce, write with Opus, verify end-to-end
- Verify the new headline system produces shorter titles (10-word cap)
- Verify the encoding fix holds through a full publish + featured rotation cycle

### 2. Monitor Pipeline Health
- Pinger: are signals being stored? Any promoted to queue?
- Scout quality: do topics use investigative framing?
- Featured rotation: confirm no mojibake after a full 6h cycle

### 3. Consider
- Reduce scouts from 3x/day to 1x/day (60 topics/day is excessive for 2-3 articles/day)
- Dead CSS cleanup in admin.css (83 classes from original pre-React layouts)
- Reader analytics: Vercel traffic → scout prompts
