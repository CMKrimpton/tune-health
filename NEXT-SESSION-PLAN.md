# Next Session Plan: Split Pipeline Into Separate Edge Functions

> **Priority**: CRITICAL. The monolith edge function is the root cause of all timeout issues.
> **Estimated scope**: Split 1 file into 8 edge functions + 1 shared utilities module.

---

## Problem

`supabase/functions/daily-article-agent/index.ts` is ~4000 lines containing:
- 7 pipeline stages (research, editor brief, write, independence, QC, voice rewrite, publish)
- 5 API clients (Claude, Gemini, Grok, OpenAI, PubMed)
- Queue management (list, add, update, delete)
- Status/admin endpoints
- Scout (3 models)
- Featured rotation
- Cost tracking/backfill
- Stale run recovery

Each stage makes 1-2 API calls that take 30-120s. The edge function timeout is ~150s. ONE slow API call = timeout = stuck article = stale detection hack = more complexity.

## Solution: One Edge Function Per Stage

### New Function Structure

```
supabase/functions/
├── _shared/                          # Shared utilities (NOT a deployed function)
│   ├── api-clients.ts                # claude(), gemini(), grok(), openai() + generateWithFallback()
│   ├── constants.ts                  # PRICING, MODEL_PROVIDERS, MODEL_BYLINES, VALID_CATEGORIES, chains
│   ├── db.ts                         # supabase(), addCostToLog(), parseClaudeJSON()
│   ├── voice-audit.ts                # auditVoiceQuality()
│   ├── github.ts                     # publishToGitHub() with retry
│   ├── astro.ts                      # assembleAstroFile(), escapeAttr()
│   └── types.ts                      # ApiResult, ApiUsage, VoiceAudit interfaces
│
├── pipeline-orchestrator/            # Lightweight — checks DB status, calls the right stage
│   └── index.ts                      # ~100 lines. The 1-min cron calls THIS.
│
├── stage-research/                   # Stage 1: web search + structure findings
│   └── index.ts
│
├── stage-editor/                     # Stage 2: editor brief — pick topic, assign archetype/tone
│   └── index.ts
│
├── stage-write/                      # Stage 3: write article from brief
│   └── index.ts
│
├── stage-independence/               # Stage 4: Grok adversarial review + PubMed check
│   └── index.ts
│
├── stage-qc/                         # Stage 5: QC check — publish / rewrite_voice / revise / kill
│   └── index.ts
│
├── stage-voice-rewrite/              # Stage 6: voice-only rewrite by premium models
│   └── index.ts
│
├── stage-publish/                    # Stage 7: GitHub commit + Vercel hook + illustration
│   └── index.ts
│
├── pipeline-scout/                   # Scout — discovers topics (called by 3 daily crons)
│   └── index.ts
│
├── pipeline-admin/                   # Admin actions: status, queue CRUD, retry, kill, rotate featured
│   └── index.ts
│
├── articles-api/                     # (existing) CRUD for articles table
├── process-article/                  # (existing) manual article generation
├── refine-article/                   # (existing) chat refinement
├── publish-article/                  # (existing) manual GitHub publish
├── delete-article/                   # (existing) GitHub deletion
├── fetch-article/                    # (existing) GitHub fetch
├── generate-illustration/            # (existing) AI illustration
└── editorial-qc/                     # (existing) collection-wide QC
```

### Orchestrator Design (`pipeline-orchestrator/index.ts`)

```typescript
// ~100 lines. Called every minute by pg_cron.
// 1. Check for stale runs (>2 min in ACTIVE status) → reset to checkpoint
// 2. Find highest-priority article needing work
// 3. Call the appropriate stage function via HTTP
// 4. Return immediately

const STAGE_MAP: Record<string, string> = {
  "voice_rewrite_done":    "stage-publish",
  "voice_rewrite_pending": "stage-voice-rewrite",
  "independence_done":     "stage-qc",
  "written":               "stage-independence",
  "editor_approved":       "stage-write",
  "research_done":         "stage-editor",
};

// For each status, call the corresponding function:
const functionUrl = `${SUPABASE_URL}/functions/v1/${STAGE_MAP[status]}`;
await fetch(functionUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
  body: JSON.stringify({ logId: article.id }),
});
```

Each stage function:
1. Receives `{ logId }`
2. Reads article data from `daily_article_log`
3. Does its ONE job (one API call, maybe two)
4. Updates DB status
5. Returns

No chaining. No loops. No stale detection in stages. The orchestrator handles all of that.

### Migration Steps

1. **Create `_shared/` directory** with extracted utilities
2. **Create `pipeline-orchestrator/`** — lightweight dispatcher
3. **Extract each stage** from the monolith into its own function
4. **Create `pipeline-scout/`** — extract scout logic
5. **Create `pipeline-admin/`** — extract status/queue/retry/kill actions
6. **Update pg_cron** to call `pipeline-orchestrator` instead of `daily-article-agent`
7. **Update admin frontend** — API calls go to `pipeline-admin` for status/queue, stage functions are internal only
8. **Test each stage independently** — curl each function with a test logId
9. **Delete the monolith** once all stages are verified

### Cron Schedule (unchanged)

| Job | Schedule | Calls |
|-----|----------|-------|
| `article-produce` | `* * * * *` (every minute) | `pipeline-orchestrator` |
| `scout-gemini` | `0 6 * * *` | `pipeline-scout` with `scoutModel=gemini` |
| `scout-sonnet` | `0 14 * * *` | `pipeline-scout` with `scoutModel=sonnet` |
| `scout-grok` | `0 22 * * *` | `pipeline-scout` with `scoutModel=grok` |
| `featured-rotation` | `0 */6 * * *` | `pipeline-admin` with `action=rotate-featured` |

### Shared Import Pattern

Supabase edge functions support shared code via relative imports:

```typescript
// In stage-write/index.ts:
import { generateWithFallback, WRITER_FALLBACK_CHAIN } from "../_shared/api-clients.ts";
import { supabase, addCostToLog, parseClaudeJSON } from "../_shared/db.ts";
import { assembleAstroFile } from "../_shared/astro.ts";
```

The `_shared/` directory is NOT deployed as a function (no `index.ts` at its root).

### What NOT to Change

- Database schema — no changes needed
- Frontend admin — only change API endpoints from `daily-article-agent` to `pipeline-admin`
- Prompts — all editorial prompts stay exactly the same
- Model chains — keep current chains, just move constants to `_shared/constants.ts`
- Illustration, articles-api, and other existing functions — untouched

### Success Criteria

- [ ] Each stage completes within 60s (well under 150s timeout)
- [ ] Orchestrator completes in <5s (just DB queries + one HTTP call)
- [ ] Article goes from queue to published in <10 minutes
- [ ] No stale articles after 24 hours of autonomous operation
- [ ] Voice rewrite triggers and completes successfully
- [ ] Vercel deploys automatically after every publish
- [ ] Illustration attached to every published article

### After April 1, 2026

- Revert writer chain to Sonnet-primary: `["claude-sonnet-4-6", "gemini-3.1-pro-preview", "gpt-5.4"]`
- Revert `WRITER_FALLBACK_CHAIN` to match
- Test Sonnet writing quality — it should be significantly better than Gemini for editorial voice
