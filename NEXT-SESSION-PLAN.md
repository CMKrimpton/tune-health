# Next Session Plan

> **Status**: v12.7.2 live. Full UX/UI audit complete. 8 files fixed. 124 articles, all clean.

---

## Current Architecture (v12.7.2)

- **Manual Produce only**: Admin clicks "Produce" → `produce-topic` → pg_net → research → chain-dispatch → editor brief → pause. No auto-production.
- **Safety-net cron**: `dispatch_pipeline_stage()` runs every 5 min. Recovers stuck articles, advances in-progress stages. **Does NOT pick from queue.**
- **Post-submit**: chain-dispatch → independence (Grok 4) → QC (Flash) → publish. Seconds to publish.
- **Headline system**: 10-word max cap enforced at research, editor, writer, and QC stages. Writer owns the headline — editor's is a "working headline." Submit form has title input field.
- **Encoding**: All GitHub read paths use `Uint8Array + TextDecoder`. All write paths use `TextEncoder + btoa` or `encoding: "utf-8"`. No raw `atob()` on text content anywhere.
- **Featured rotation**: every 6h, updates DB + GitHub JSON + triggers Vercel rebuild. UTF-8-safe round-trip.
- **Model config**: ALL model IDs centralized in `constants.ts` → `MODELS` object. Zero hardcoded strings.
- **Article cards**: flex column layout ensures cards fill grid height properly with footer pushed to bottom via `mt-auto`.

## What Was Fixed This Session

1. **Article card white space** — `.article-card` lacked flex layout, causing empty white gaps when CSS grid stretched cards vertically. Added `flex flex-col` to card and `flex-1` to content area
2. **Broken TOC links** — calcium-phosphorus article had 5/7 anchor links pointing to non-existent IDs
3. **Admin keyboard accessibility** — all form inputs had `outline: none` with no focus-visible replacement. Added global `focus-visible` styles
4. **Subscribe page aria-label** — email input missing screen reader label
5. **HighlightShare ARIA role** — `role="tooltip"` on interactive popup → `role="group"`
6. **Admin edit page XSS** — preview iframe srcdoc concatenated raw strings. Added `esc()` helper
7. **Heading hierarchy** — non-opioid-painkillers article used h4 as section headings after h2 (skipping h3)

## What's Working
- Pipeline is manual-only: admin picks topics, clicks Produce
- Chain-dispatch works for post-produce stages (research → editor → pause)
- Post-submit flow works (independence → QC → publish)
- Writer can override headline at submit time
- All 124 articles are HTML-clean with balanced tags and correct heading hierarchy
- All JSON content files are encoding-clean (no mojibake)
- Article cards fill grid height properly (no empty white space)
- Admin inputs are keyboard-accessible with visible focus rings
- Scouts still fill the queue for admin to curate

## Priority for Next Session

### 1. Produce Hybrid Articles
- Queue has topics ready. Pick 2-3, produce, write with Opus, verify end-to-end
- Verify the new headline system produces shorter titles (10-word cap)
- Verify the encoding fix holds through a full publish + featured rotation cycle

### 2. Remaining UX/UI Polish (from audit)
- **Touch targets below 44px**: Header theme/search buttons (40px), Footer social buttons (40px), SideNav action buttons (32px), ShareButtons (36px), HighlightShare buttons (32px)
- **Z-index conflicts**: Header dropdown, SideNav, MobileNav, noise overlay all at z-50 — needs a z-index scale
- **No `prefers-reduced-motion`** in admin.css animations
- **CommandPalette** missing `role="dialog"` and `aria-modal`
- **Missing `aria-pressed`** on category filter buttons
- **No `beforeunload`** warning in ArticleEditor for unsaved changes

### 3. Consider
- Reduce scouts from 3x/day to 1x/day (60 topics/day is excessive for 2-3 articles/day)
- Dead CSS cleanup in admin.css (83 classes from original pre-React layouts)
- Reader analytics: Vercel traffic → scout prompts
