# Changelog

All notable changes to the alumi news project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [9.1.0] - 2026-03-24

### Added — Reader Questions, Fact-Check Pipeline, Creation History
- **Reader Questions**: new section in AI Agents tab mines alumi Health AI assistant chat data. Finds health questions asked by 2+ different users, shows with popularity count and "+ Queue" button. Source: `reader_request`, priority P5
- **Fact-check pipeline step**: PubMed verification results (previously stored but ignored) now trigger article revision when 2+ studies or >50% of citations fail verification. Unverified citations get "(citation unverified)" tags
- **Mandatory Sources section**: every article must end with a Sources list citing author, journal, year, and key finding used
- **Full creation history**: click any published article to see complete pipeline reasoning — research findings, editor brief (score/archetype/angle/tone/dogma warnings), writer model + pen name, Grok independence review (verdict/score/flags/rewrites), PubMed verification (verified vs NOT FOUND), QC decision, cost breakdown per stage
- **Sources section styling**: footnote-sized text (0.8125rem) with top border separator, not body text size

### Changed — Editorial Quality (continued)
- **Zero fabrication rule**: writer prompt restricted to research data only — "use ONLY studies from RESEARCH DATA below." Banned patterns: "studies show" without naming, precise stats without source, unnamed trials
- **Independence review overhauled**: HTML stripped before sending to Grok (was parsing raw tags), category-specific review focus (Pharmacology: "who funded trials?", Nutrition: "food industry influence?"), anti-template instruction ("do NOT write 'consider adding a section'"), temperature raised 0.4→0.6, tokens 2500→3000
- **QC uses Gemini not Grok**: different model from independence reviewer prevents rubber-stamping. Prompt rewritten for headline/description polish only
- **All score examples removed**: every JSON template uses text instructions instead of numbers. Models were copying hardcoded examples verbatim
- **Opening variety enforced**: "34% of articles open with narrative vignettes — ONLY for storyteller preset." Writer must vary: statistic, claim, question, mechanism, contradiction
- **Status API expanded**: returns 30 recent + 15 published logs (deduplicated). Published articles no longer lost when failures flood the window

### Fixed
- React.Fragment crash (missing import in PipelineMonitor cost breakdown grid)
- Sources section rendering at body text size instead of footnote size

## [9.0.0] - 2026-03-24

### Added — Admin Dashboard Overhaul & Pipeline Hardening
- **Admin dashboard overhaul**: 8 compact stat cards, 3-tab layout (Pipeline, Articles, AI Agents)
- **Manual scout triggers**: individual Gemini / Sonnet / Grok buttons + "All 3" from Pipeline tab
- **Manual produce trigger**: "Produce Now" with full API response feedback (success/skipped/error)
- **Topic queue controls**: every queued item has Produce, Expedite, Priority ↑↓, Delete buttons
- **Stuck queue recovery**: IN_PROGRESS items get Reset + Delete controls
- **Article Improve button**: purple button on every article in Articles tab — sends through AI review + auto-fix in place
- **Backfill Costs button**: estimate spend for articles published before cost tracking (AI Agents tab)
- **Rotate Featured button**: manual featured rotation trigger (AI Agents tab)
- **Cron Schedule section**: shows all 5 cron jobs with schedules, models, and status (AI Agents tab)
- **Independence & editor scores** displayed on article rows and edit page
- **Model pen names** on published articles in pipeline view (Max Quilici, Linda Carnes, Christine Wright)
- **Sort by independence score** option in Articles tab
- **Refresh button** in Articles tab to re-fetch from DB
- **Login error handling**: wrong token shows inline error, middleware redirects to `/admin/login?error=1`
- **Edit page autosave**: 2-second debounce with "Autosaving..." / "Saved" indicator
- **Edit page Cmd+S / Ctrl+S** keyboard shortcut
- **Edit page score badges**: independence and editor scores in header
- **Edit page Delete from GitHub** button
- **XSS fix**: all innerHTML replaced with createElement/textContent in edit page chat

### Changed — Pipeline Intelligence
- **Fallback chain on ALL stages**: Research, Scout structuring, Sonnet scout, QC — all now fall back through Sonnet → Grok → Gemini (previously only Editor Brief and Write had fallback)
- **Smart duplicate detection**: mechanical word-overlap check raised to 55%/5 words (near-exact only). Single queued topics always pass to the AI editor for intelligent judgment instead of being mechanically killed
- **Grok scout markdown stripping**: `**Topic Description**:` prefix stripped before dedup and queue insertion
- **Gemini research JSON**: explicit JSON schema in prompt when Gemini is research fallback, plus plain-text extraction safety net
- **Gemini auto-retry**: retries once if first response is empty (Google Search grounding sometimes returns empty)
- **Duplicate threshold relaxed**: 55% overlap + 5 matching words (was 30%/2 — too aggressive at 94 articles)

### Changed — Editorial Quality
- **Editorial independence directive**: writer and editor prompts now explicitly say "you are a journalist, not a PR department" — if assigned a critical investigation, investigate it, don't flip to defense
- **Queue source tracking**: manually queued topics (`source: manual`) get "MANDATORY EDITORIAL DIRECTION" telling editor to preserve the original angle. Scout topics (`source: trending`) get normal editorial freedom
- **Grok independence review rewritten**: adversarial prompt, must quote exact article text, must provide concrete replacement sentences, adds AI voice detection. Scores use text instructions instead of example numbers
- **Grok review now triggers rewrites**: fires for `major_issues` OR `minor_issues with score < 7` (previously only `major_issues` — which never happened with the old soft prompt)
- **QC uses Gemini, not Grok**: QC stage now uses Gemini → Sonnet (not Grok). Independence review uses Grok — different models for review vs QC prevents same-model rubber-stamping
- **QC prompt rewritten**: focused on headline/description polish only, not re-reviewing content
- **All score examples removed from prompts**: every `"score"`, `"qualityScore"`, `"topicScore"` in JSON templates replaced with text instructions ("integer 1-10, see scoring rules"). Models were copying hardcoded example numbers verbatim
- **Article endings enforced**: writer prompt requires proper conclusion — "cut a middle section shorter rather than omitting the ending"
- **Pipeline stage labels**: reflect actual multi-model system (Research: Gemini + Sonnet, Write: rotates hourly, QC: Gemini + GPT Image)
- **Write stage shows current primary model**: based on UTC hour, matching backend `pickWriterModel()` logic
- **Status API returns published + recent**: fetches 30 recent logs + 15 published separately, deduplicates. Published articles no longer pushed out by failures

### Fixed
- Pipeline 503 BOOT_ERROR from duplicate `grokScore` variable declaration
- Template literal syntax error in editor prompt (broke function deployment)
- Scout topics with Grok markdown formatting passing dedup filter
- Empty Gemini responses crashing research stage (now retries once)
- Queue form silently swallowing errors (now shows success/failure feedback)
- Manual topics defaulting to P50 (now P10 — appear near top of queue)
- Published articles disappearing from "Recently Published" when failures flooded the 20-entry log window
- CSS duplicate class definitions (.agents-btn, .agents-decision-card, .agents-grade, .agents-issue) causing cascade conflicts

## [8.6.0] - 2026-03-23

### Added — Model Pen Names & Cron Activation
- **Model bylines**: Max Quilici (Sonnet), Carl Lundin (Opus), Linda Carnes (Grok), Christine Wright (Gemini). Automatically set in article metadata based on which model wrote the article
- **All crons activated**: scout-gemini (6am), scout-sonnet (2pm), scout-grok (10pm), article-produce (hourly), featured-rotation (6h)
- **Multi-model scout migration applied** to Supabase

## [8.5.0] - 2026-03-23

### Added — Multi-Model Writer Rotation
- **`generateWithFallback()`** — universal dispatch that routes to Anthropic, xAI, or Google with automatic fallback. If one provider hits spending limits, rate limits, or errors, it tries the next. Same prompts, same editorial rules for all models
- **Writer rotation** — cycles primary model by hour (Sonnet → Grok → Gemini). Ensures variety in article voice and no single provider dependency
- **`WRITER_FALLBACK_CHAIN`** — ordered fallback: Sonnet → Grok → Gemini Flash. Applied to editor brief, write, and independence revision stages
- **Model tracking** — `model_used` in daily_article_log records which model actually wrote each article for quality comparison

## [8.4.0] - 2026-03-23

### Changed — Multi-Model Scout Architecture (92% cost reduction)
- **3 daily scouts replace 96** — Gemini (6am UTC, Google Search), Sonnet (2pm, web search), Grok (10pm, contrarian perspective). Each finds 20 topics. ~$0.14/day total vs ~$9.55/day before
- **No Sonnet structuring step** — raw findings parsed directly, no expensive intermediate API call. Editor brief stage handles scoring during production
- **Per-scout dedup** — each topic checked against all articles + queue before insertion. Within-batch dedup prevents same-scout duplicates
- **Produce cron: hourly** — editor picks best topic from queue every hour. Self-chaining handles multi-stage production. Up to 24 articles/day
- **Monthly cost**: ~$25/month at 2 articles/day (was ~$300/month)
- **Migration**: new pg_cron jobs (scout-gemini, scout-sonnet, scout-grok, article-produce). Old high-frequency crons removed

## [8.3.0] - 2026-03-23

### Fixed — Full Collection Audit (all 78 articles read in full)

**Critical content fixes:**
- `nitric-oxide-paradox-aging-vasodilator`: Complete editorial overhaul — removed Ray Peat citation, reframed CO2 from "true primary vasodilator" to "underappreciated contributor", added eNOS/iNOS distinction throughout, removed sildenafil/minoxidil aging claims (no clinical evidence), replaced tetracycline anti-aging recommendation with proper caveats, fixed self-contradicting pull-quote, added Cochrane antioxidant data
- `chronic-inflammation`: omega-6 seed oils caveated, omega-6/3 ratio replaced with HOMA-IR
- `fermented-foods`: moderate wine claim corrected with sick-quitter confound + Mendelian randomization

**Moderate content fixes:**
- `gut-microbiome-brain`: Added BBB caveat to gut serotonin claim (doesn't cross into brain), softened "50% of dopamine precursors" to "substantial proportion"
- `deja-vu-neuroscience-memory-system`: Dopamine relabeled from "excitatory neurotransmitter" to "neuromodulator"
- `brain-overheating-yawn-thermoregulation`: Removed "without a single contradicting result" overclaim
- `hardware-of-awe-musical-frisson-neuroscience`: Replaced "genuinely addicted in the technical neurochemical sense" with accurate reward circuit framing
- `depression-energy-problem`: Exercise "more effective than antidepressants" changed to "comparable to"
- `the-serotonin-deception`: Added Cipriani 2018 counterpoint (116K participants) to the active-placebo overclaim
- `neuroscience-of-itch-social-contagion`: Mirror neuron mechanism changed from stated fact to unconfirmed hypothesis

**Broken tags fixed (9 articles):**
- adhd-wakefulness-sleep-neural-activity, engineered-bacteria-cancer-therapy-probiotics, fusobacterium-nucleatum-gum-disease-breast-cancer-mechanism, non-hormonal-menopause-fezolinetant-elinzanetant-nk3, glp1-discontinuation-rebound-real-world-vs-trials, paternal-preconception-health-pregnancy-outcomes, early-life-stress-gut-brain-pathways, chlorpyrifos-parkinsons-risk-autophagy-mechanism, prediabetes-reversal-without-weight-loss

**Truncation fixes:**
- `engineered-bacteria-cancer-therapy-probiotics`: Completed truncated disclaimer
- `chlorpyrifos-parkinsons-risk-autophagy-mechanism`: Completed truncated article ending + added missing disclaimer

## [8.2.0] - 2026-03-23

### Added — Epistemic Integrity Framework
- **Evidence hierarchy** in research prompt — recent meta-analyses > individual studies, large cohorts > small trials, 2023-2026 > older, industry-funded must be flagged
- **Known dogma traps list** — omega-3/6 ratio, saturated fat absolutism, BMI reliability, breakfast industry claims, moderate alcohol, generic probiotics, multivitamins, "natural = better", antioxidant supplements, low-fat dogma, detox products, blanket sunscreen absolutism
- **Writer epistemic integrity rules** — "your training data is not the truth", flag own uncertainty, cite most recent evidence, name the funder, never use "studies show" without specifics, "more research needed" is not a conclusion
- **Contrarian checkpoint** — cross-reference metabolism/thyroid/fat/inflammation articles against independent thinkers (Ray Peat, Chris Masterjohn, Weston Price) as a bullshit detector for institutional groupthink — not as authorities, but as early signal
- **Follow the money** — name the funder when they have financial interest in the outcome
- **Editor dogma warnings** — `dogmaWarnings` field in editor brief flags specific claims the writer must verify before repeating. Wired into writer prompt
- **Grok independence review expanded** — 3 new flag types: `outdated_dogma`, `stale_evidence`, `unfunded_claim`
- **Directed research prompt updated** — prioritize 2023-2026 evidence, note funding sources

## [8.1.0] - 2026-03-23

### Fixed
- **Featured rotation uses `updated_at`** — was using `published_at` (when article was published, not when it became featured), causing stale featured articles. Now tracks when the article was actually set as featured
- **Standalone `rotate-featured` action** — works independently of pipeline, even when production crons are paused
- **Independent `pg_cron` job** — `featured-rotation` fires every 6 hours, separate from article scout/produce crons
- **Stronger duplicate detection** — `isDuplicate()` now includes candidate's category, keyFindings, and mechanism in fingerprint. Previously only compared topic + headline words, which missed same-subject-different-angle duplicates (e.g., two oral microbiome articles)
- **Removed duplicate article** — archived `oral-microbiome-systemic-disease` (broad overview), kept `oral-microbiome-alzheimers-cardiovascular-systemic-disease` (specific angle, better headline)

## [8.0.0] - 2026-03-23

### Added — Pipeline Intelligence Overhaul
- **10 tone presets** — straight-science, smart-casual, dry-analytical, storyteller, debunker, wire-dispatch, pointed, measured-authority, curious, understated. All share the same core voice — subtle variation like the same journalist on different days. Editor picks per article.
- **Anti-AI rules** baked into writer prompt — bans manufactured wonder, false intimacy, empty transitions, hedging stacks. Enforces dramatic sentence length variation.
- **PubMed citation verification** — after write stage, verifies up to 5 cited studies against PubMed E-utilities API. Results stored in pipeline log. Non-blocking.
- **Grok rewrite wiring** — when Grok independence review flags `major_issues`, Claude now applies the specific rewrite suggestions before QC. Independence review is no longer decorative.
- **Hard category balance rule** — underserved categories (<5% of collection) get priority over overserved (>15%) unless quality score difference >3 points. Fixes 53% neuroscience/clinical skew.
- **Deterministic category gradients** — each category maps to a fixed gradient (Neuroscience=violet, Mental Health=sky, Nutrition=emerald, etc.). No more AI choosing gradients. Fixes 29% rose-red visual monotony.
- **Programmatic SVG generation** — minimal category-colored SVG generated in code, not by AI. Zero tokens wasted on unused hero SVGs.

### Changed — Pipeline Improvements
- **QC switched from Sonnet to Grok** — different model family reviewing Sonnet's work prevents same-model self-review blindness
- **Full articles sent to Grok + QC** — removed `.slice(0, 4000)` and `.slice(0, 3000)` truncation. Both review stages now see the complete article including conclusions
- **Illustration parallelized with QC** — fires illustration generation before QC call, awaits after. Saves 30-60s per article
- **Featured rotation early exit** — checks if current featured is <12h old with one lightweight query before doing full scoring
- **Scout payload optimized** — sends all article titles to Gemini (removed 30-article cap)
- **process-article switched from Opus to Sonnet** — ~$0.68 savings per manual article
- **refine-article metadata routing** — "change the headline" no longer sends full article HTML. Saves ~70% input tokens on metadata-only edits

### Changed — Editorial Quality
- **31 headlines rewritten** — reduced "Your Brain" pattern from 6→0, "Just [verb]" from 6→1, "Medicine/Science [ignores]" conspiracy framing eliminated, 8 headlines over 100 chars shortened
- **67 article gradients updated** — all existing articles now use category-consistent gradients
- **SVG removed from all AI prompts** — process-article, refine-article, and daily-article-agent writer prompt no longer request SVG generation
- **Gradient removed from AI prompts** — writer no longer picks gradient colors (deterministic from category)
- **Shorter paragraphs** enforced — "2-3 sentences ideal, 4 max" added to core editorial standards

## [7.0.0] - 2026-03-23

### Added — Cost Tracking
- **Per-call API cost tracking** — every Claude, Grok, and Gemini call logs input/output tokens and calculates USD cost using model-specific pricing
- **`cost_usd` + `token_usage` columns** on `daily_article_log` — cumulative cost per article, per-call breakdown (model, stage, tokens, cost)
- **Dashboard cost stats** — Total AI Spend and Avg Cost/Article stat cards on admin dashboard. Per-article cost in pipeline cards and completed articles list. Running total with color-coded thresholds ($20/$50)
- **`backfill-costs` action** — estimates costs for all pre-tracking articles based on pipeline stage completion. Backfilled 98 log entries (~$20.58 estimated total)
- **Spending limit detection** — Claude API 400 errors with "usage limits" now surface as `SPENDING_LIMIT:` prefix instead of raw error text

### Added — Article Variety System
- **7 article archetypes** — deep-investigation, explainer, provocation, case-study, profile, roundup, myth-autopsy. Each has distinct word count range, structural rules, and pull-quote/info-card guidance
- **Voice modulation** — register (clinical/conversational/provocative), density (data-heavy/narrative-driven/balanced), pacing (slow-build/rapid-fire/crescendo). Set per article by editor brief
- **Banned AI patterns** — explicit list of overused phrases ("The honest answer is...", "What is not in dispute...", "In short...") and structural patterns (every article opening with myth inversion, every closing with paradox, uniform citation formula)
- **Tone matching by subject type** — institutional failures get pointed language, mechanism discoveries get intellectual curiosity, practical health gets directness without drama. Not everything is an exposé
- **Headline variety rules** — banned "The [X] That..." (40% of headlines), "Your [Body] Is [Claim]" (7+), "Nobody/Science [dramatic verb]" framing. Good models: direct claims, questions, mechanism-forward, understated
- **QC headline rewriting** — QC stage actively rewrites headlines starting with "The" or using conspiracy framing
- **Series candidate flagging** — editor brief can flag topics with natural multi-part potential
- **Writing temperature 0.4 → 0.5** for more natural variation

### Fixed — Duplicate Detection
- **Bidirectional overlap check** — old filter only checked candidate→existing (40% threshold). Now checks both directions and takes the max (30% threshold)
- **Stop-word filtering** — common health/science terms ("brain", "health", "study", "evidence", etc.) no longer inflate word counts and mask real overlap
- **Broader fingerprinting** — old filter only used title + slug + keywords. Now includes tags + description for much richer subject matching
- **Archived 5 duplicate articles** — cannabis-mental-health, adhd-sleep-brain, glp1-addiction-craving-mechanism, gut-microbiome-circadian-clock-sleep, pfas-forever-chemicals-adolescent-bone-density
- **Fixed corrupted metadata** on 8 articles — sentence fragments in tags/keywords replaced with proper short terms

### Changed
- **Crons paused** — Anthropic API spending limit reached (resets 2026-04-01). Both `article-scout` and `article-produce` unscheduled
- **Admin dashboard layout** — 8 stat cards in 2 rows of 4 (was 6 in 1 row)
- **Article count** — 66 published (was 71, removed 5 duplicates)

## [6.1.0] - 2026-03-23

### Fixed (critical — post-6.0 stabilization)
- **Massive duplicate cleanup** — deleted 14 duplicate articles across fusobacterium (4), GLP-1/Ozempic (3), PFAS (3), chlorpyrifos (2), Y-chromosome (1), cholesterol (1). Archived matching DB records
- **Hard programmatic duplicate filter** — `isDuplicate()` checks >40% word overlap with ALL existing articles + queue before ANY candidate reaches the editor. Not AI judgment — code
- **Writer restored to JSON output** — the raw HTML experiment broke tags, categories, and metadata. Reverted to original JSON format (html + metadata + svg + toc). Sonnet 4.6 handles it within timeout
- **Tags were sentence fragments** — "A national Swedish", "Semaglutide was associated" — now proper tags from Sonnet's JSON
- **`researchData is not defined`** — blocked ALL publishes. The `replacesSlug` feature referenced a variable that didn't exist in `stageQCAndPublish`
- **`safeStage` rollback loops** — failed writes rolled back to `editor_approved`, causing infinite write→timeout→rollback→write. Now fails hard, no rollback
- **Category leaked editor reasoning** — editor's rationale stored as category string. Now sanitized against 9-value whitelist
- **Scout and produce blocking each other** — global active guard blocked scout when produce was running. Now independent
- **Gemini findings not parseable** — Gemini returns grounded text, not JSON. Two-model scout: Gemini discovers, Sonnet structures

### Added
- **Two-model scout** — Gemini 2.5 Flash (Google Search) discovers 10 topics across recent + landmark timeframes. Sonnet 4.6 structures the best 5 into candidates
- **Full off-limits list** — Gemini now sees ALL article titles + queue topics (was truncated to 20, missing 49 articles)
- **Category balance in scout** — underserved categories (Nutrition, Fitness, Sleep Science) explicitly prioritized, oversaturated categories flagged
- **Featured rotation upgrade** — twice daily (12h), quality-gated (must have illustration, score >30), weighted by editor score (25%), recency (30%), independence score (15%), category diversity (10%)
- **Admin kill button** + `kill-article` edge function action
- **Hard duplicate filter** on queue inserts — same `isDuplicate()` check

### Changed
- **Scout frequency** — designed to run less often with bigger sweeps (10 topics per run vs 3)
- **Produce cron** — every 3 min (was 5)
- **QC defaults to publish** — only revises for serious factual errors, max 1 revision
- **Models**: Sonnet 4.6 (research/editor/write/QC), Gemini 2.5 Flash (scout discovery), Grok 3 (independence review)

## [6.0.0] - 2026-03-23

### Architecture — Two-Job AI Newsroom
- **Scout job** (cron: `*/15`) — Gemini discovers topics via Google Search, Sonnet structures and scores, editor picks winner, unchosen auto-save to queue
- **Produce job** (cron: `*/3`) — editor picks from queue, self-chains: Editor Brief → Write (JSON) → Grok Independence Review → QC + Publish
- **Self-chaining** — each production stage triggers the next via HTTP POST. Cron is just the initial trigger
- **Topic queue** — `topic_queue` table. Admin can add manually. Scout auto-fills. Hard dedup prevents duplicates
- **`safeStage()` wrapper** — catches all errors, fails hard, records in log
- **Robust JSON parser** — proper brace-matching, truncated JSON repair
- **135s API timeout** — prevents Edge Function silent kills
- **`sortOrder`** (epoch ms) — newest articles always first
- **Schema columns** — `stage_started_at`, `model_used`, `grok_score`, `editor_score`, `revision_count`, `source`, `independence_score`, `pipeline_log_id`
- **Category sanitization** — whitelist of 9 valid categories
- **Pipeline Monitor** — 5-stage visualization, model badges, topic queue, kill buttons, independence scores

## [5.19.0] - 2026-03-23

### Changed
- **Daily article agent → staged pipeline** — broke monolithic pipeline (research + write + illustrate + publish) into 3 independent stages that each complete within Edge Function timeout limits. Each cron invocation processes ONE stage of ONE article
- **Cron schedule: daily → every 15 minutes** — with staged pipeline, one article takes ~45 min (3 stages x 15 min intervals). Capacity: ~32 articles/day. Temporary ramp-up until 100 articles reached
- **Rate limit: per-day → per-hour** — allows multiple articles per day instead of one

### Added
- **Smart featured rotation** — after each article publish, scores all articles on recency (40%), category diversity (20%), illustration quality (20%), read time (10%), and engagement proxy (10%). Auto-rotates featured article every 24h. Prevents stale featured stories
- **Auto-stop at 100 articles** — pipeline self-disables once article count reaches 100
- **Stale run cleanup** — automatically marks timed-out pipeline runs as failed, preventing zombie entries from blocking new runs
- **Concurrent execution guard** — prevents overlapping pipeline stages from running simultaneously
- **`research_data` column** on `daily_article_log` — stores research JSON between pipeline stages

### Fixed
- **Pipeline timeout crashes** — old monolithic pipeline (~4 min total) exceeded Edge Function wall clock limits. Staged approach keeps each invocation under 2 min

## [5.18.0] - 2026-03-23

### Fixed
- **Newsletter API not saving in production** — `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` were missing from Vercel env vars. Set via CLI. Verified: emails now save to `newsletter_subscribers` table in production
- **OG image URLs relative instead of absolute** — social platforms (Twitter, LinkedIn, Facebook) cannot resolve relative paths. Now prepends site URL when image doesn't start with `http`
- **manifest.json wrong branding** — still said "Tune Health" instead of "alumi news"
- **robots.txt wrong sitemap URL** — pointed to nonexistent `tunehealth.com` domain. Corrected to `tune-health.vercel.app/sitemap-index.xml`
- **Double search icon on iPhone** — `.nav-inner button { display: flex }` in touch media query was overriding Tailwind's `hidden` class on the ⌘K trigger button. Removed the display override

### Removed
- **Article reactions system** — localStorage-only emoji counters that displayed personal clicks as "counts," appearing as social proof with no backend aggregation. Replaced with nothing — a serious magazine doesn't need fake engagement metrics

### Changed
- **All animations slowed 25%** — Tailwind duration scale overridden (200→250ms, 300→375ms, 500→625ms, 700→875ms), all raw CSS durations scaled proportionally. View Transitions, reveals, cards, SideNav, buttons all feel smoother
- **Grain texture tightened** — noise overlay `baseFrequency` 0.65 → 0.78 (~20% finer grain)
- **Vanity stats removed** — article counts, category counts, and "Est. 2024" removed from homepage hero, footer, articles index, and subscribe page. Subscribe page stats replaced with reader-relevant "Weekly / Free / Zero Sponsors"
- **Subscribe page** — wired to real `/api/subscribe` endpoint (was fake setTimeout)

## [5.17.0] - 2026-03-22

### Fixed
- **Stale header state after View Transition** — `updateScroll()` now called immediately on init to clear leftover `.scrolled` / `.header-hidden` classes from the previous page
- **HighlightShare listener leak** — added AbortController cleanup; `selectionchange`, `scroll`, and `mousedown` listeners were stacking on every page navigation
- **FloatingShareBar listener leak + duplicate logic** — replaced dual IntersectionObserver + scroll listener with single AbortController-managed scroll listener
- **Missing site assets** — favicon.svg, apple-touch-icon.png, og-image.png, and logo.png were referenced in BaseLayout and SEO.astro but didn't exist in `/public/assets/`. All now present
- **Newsletter API failing as static endpoint** — added `export const prerender = false` and try/catch around `request.json()` parsing

### Added
- **Supabase migration for newsletter_subscribers** — `20260323_newsletter_subscribers.sql` creates table with email unique constraint, RLS enabled, applied to production

## [5.16.0] - 2026-03-22

### Added
- **Sticky header hide/show on scroll** — on article pages (desktop), header slides up when scrolling down and reappears when scrolling up (like Medium/Substack). Maximizes reading real estate. 8px dead zone prevents jitter
- **View Transition anti-flash CSS** — custom `::view-transition-old(root)` / `::view-transition-new(root)` keyframes with 200ms cross-fade prevent the white flash that occurred between page navigations
- **FloatingTOC keyboard accessibility** — added `:focus-visible` ring on TOC links and mobile pill text truncation (`max-width: 180px` with ellipsis) to prevent overflow on narrow screens
- **404 page noindex** — `<meta name="robots" content="noindex, nofollow">` prevents search engines from indexing error pages

### Fixed
- **Event listener memory leak across all nav components** — Header, SideNav, MobileNav, FloatingTOC, and BaseLayout core interactions now use `AbortController` to clean up old event listeners before re-attaching on View Transitions. Previously, every page navigation stacked duplicate listeners (N listeners after N navigations)
- **Header menu close race condition** — added `isHovering` state guard so rapid hover→leave→hover cycles no longer cause unpredictable menu state. Close timeout increased from 150ms to 250ms to match CSS transition
- **MobileNav scroll jitter on iOS** — added 8px dead zone to scroll delta detection, preventing momentum scroll oscillation from rapidly toggling the nav bar visibility
- **CommandPalette scroll lock** — body scroll now locked (`overflow: hidden`) when palette is open, preventing background page from scrolling behind the modal backdrop
- **CommandPalette backdrop click** — fixed click event bubbling by checking `e.target === e.currentTarget` instead of always closing on backdrop click
- **SideNav active link matching** — rewrote matching logic to properly handle query params and hash fragments. Added `aria-label` for accessibility
- **Subscribe page fake newsletter handler** — replaced `setTimeout` mock with real `/api/subscribe` API call with error handling
- **Subscribe page hardcoded stats** — "46+" articles and "7" categories now dynamically pulled from content collection

### Changed
- **Header transition refined** — replaced `transition-all duration-300` (caused white flash during View Transitions) with targeted `transition: border-color 0.15s, transform 0.3s`. Only the properties that need to animate now animate
- **All nav transitions optimized** — replaced 15+ `transition-all` usages with specific property transitions (background-color, box-shadow, opacity, transform) across cards, buttons, SideNav links, back-to-top. Eliminates unnecessary property watching and reduces visual jank
- **Menu dropdown shadow** — upgraded from generic `shadow-2xl` to editorial-quality custom shadow with directional depth (`0 20px 60px`)
- **SideNav stagger timing** — reduced logo delay from 100ms to 50ms, scroll delay from 150ms to 100ms for snappier feel

## [5.15.0] - 2026-03-22

### Added
- **Content-Security-Policy header** — CSP in `vercel.json` restricts scripts, styles, fonts, images, and connections to known origins (self, Google Fonts, Supabase, Unsplash). Blocks framing entirely
- **Newsletter API endpoint** (`/api/subscribe`) — server-side endpoint that validates email and upserts to Supabase `newsletter_subscribers` table. Falls back gracefully if Supabase is not configured
- **Article reactions tooltip** — "Reactions are saved locally on this device" note under reactions bar, setting correct user expectations

### Fixed
- **Newsletter form was fake** — both `Newsletter.astro` and homepage form used `setTimeout` to fake "Subscribed!" without saving data. Both now call `/api/subscribe` with proper error handling and feedback
- **Article search had no debounce** — articles index search input now debounces with 150ms delay instead of filtering on every keystroke
- **Dead sorting in `getArticlesForHomepage()`** — removed no-op `.sort()` that sorted by own index (preserving existing order). Function now simply concatenates published + coming-soon articles

## [5.14.0] - 2026-03-22

### Fixed
- **HighlightShare popup visibility** — increased background opacity from 0.92 to 0.95 and enhanced shadow contrast for better visibility against both light and dark article content
- **MobileNav hardcoded colors** — replaced raw RGB values (`rgb(120 113 108)`, `rgb(220 38 38)`) with Tailwind `theme()` tokens (`stone.500`, `primary.600`, etc.) for proper design system integration
- **Drop cap color hardcoded** — replaced `#dc2626` / `#f87171` hex values with `theme('colors.primary.600')` / `theme('colors.primary.400')` for design system consistency
- **View Transitions ignore reduced-motion** — added `@media (prefers-reduced-motion: reduce)` to disable article page transition animations for users who prefer reduced motion

### Changed
- **Font loading optimized** — added `preload` hint for Inter (critical UI font) to reduce render-blocking time

## [5.13.0] - 2026-03-22

### Added
- **`truncate()` utility** in `articles.ts` — replaces 7+ copy-pasted `.slice(0, N) + '...'` patterns across Header, Footer, SideNav
- **`MenuDropdownContent.astro`** — shared dropdown menu content extracted from Header, eliminating ~100 lines of duplicated markup between home and article variants
- **`twitter:site` meta tag** — `@aluminews` handle added to Twitter Card meta for proper attribution on social shares

### Fixed
- **Homepage Deep Dives were hardcoded** — 3 static "Coming Soon" cards with Unsplash images replaced with collection-driven published series from `getAllSeries()`. Published Thyroid Deep Dive now actually appears on homepage
- **Back-to-top button touch target** — increased from 40px (`w-10`) to 48px (`w-12`) for WCAG-compliant touch target
- **Duplicate `id="newsletter"` on homepage** — Newsletter component and homepage section both used same ID. Renamed homepage wrapper to `newsletter-section`
- **Mobile nav scroll jank** — added `will-change: transform` to `.mobile-nav` for GPU-accelerated scroll hide/show

### Changed
- **Header refactored** — dropdown menu markup extracted to `MenuDropdownContent.astro`, eliminating full duplication between home and article variants. Both variants now share identical menu content

## [5.12.0] - 2026-03-22

### Fixed
- **SEO structured data domain mismatch** — `SEO.astro` was generating all JSON-LD schemas (Organization, WebSite, BreadcrumbList, Article) pointing to `alumi-news.vercel.app` instead of `tune-health.vercel.app`. Now uses `Astro.site` for correct domain resolution
- **Duplicate Footer and CommandPaletteWrapper** on reading list page — `reading-list.astro` rendered Footer and CommandPaletteWrapper twice, producing double footers
- **Article schema missing `image` field** — Google rich results require an `image` property on Article schema. Added `ImageObject` with `heroImage` URL and alt text to structured data
- **Type safety gap in article utilities** — `mapArticle()` used `data: any` instead of `CollectionEntry<'articles'>`, losing all type checking on the most-used function in the codebase
- **Missing robots meta tag** — Added explicit `<meta name="robots" content="index, follow">` to `BaseLayout.astro` as defensive SEO measure

## [5.11.0] - 2026-03-22

### Added
- **Mobile bottom navigation bar** (`MobileNav.astro`) — fixed 5-item nav (Home, Articles, Search, Saved, Series) for touch devices under 1024px. Active state highlighting, auto-hides on scroll down, safe-area-aware, hidden in print
- **"More in [Category]" link** on article pages — browse-category CTA below related articles for easy topic exploration
- **Active state indicators** in Header menu — highlights current section (Home, Articles, Deep Dives, Subscribe)
- **SideNav on article pages** — readers can now access sidebar navigation from any article (previously missing)
- **SideNav on Reading List page** — was missing Footer, CommandPalette, and SideNav
- **Deep Dives anchor IDs** — published series sections have slugified IDs for direct linking

### Fixed
- **3 dead topic links** — Header and SideNav hardcoded `?topic=sleep`, `?topic=hormones`, `?topic=supplements` which matched no real categories. All topic links now dynamically generated from `getCategories()` across Header, SideNav, and Footer
- **2 missing categories** — Clinical Evidence (10 articles) and Environmental Health (4 articles) were absent from Header and SideNav topic lists. Now auto-populated
- **Header article links could 404** — "Latest" section used raw `article.id` (with `.json` extension) instead of mapped `article.href`. Fixed to use `getArticles()` utility
- **SideNav series links pointed to nonexistent anchors** — 5 hardcoded coming-soon series linked to `#habit-formation`, `#microbiome`, etc. which had no matching IDs on the Deep Dives page. Replaced with dynamic published series from `getAllSeries()`, linking to first article of each series
- **Homepage category counter hardcoded "7"** — now uses dynamic `{categories.length}` (actual count: 9)
- **Article pages were a navigation dead end** — article variant Header only showed Home/Articles/Series text links with no menu dropdown. Now includes full dropdown menu with sections + topics
- **No outside-click close on Header menu** — touch devices got stuck with menu open. Added document click listener
- **Reading List page used stripped Header variant** — changed to home variant with full menu access

### Changed
- **Header** — refactored from `getCollection('articles')` to `getArticles()` + `getCategories()` utilities for consistency. Article variant now has full dropdown menu matching home variant
- **SideNav** — topics and series sections are now fully collection-driven (were hardcoded). Series links to first article with "All Deep Dives" link. Topics pulled from `getCategories()`
- **BaseLayout** — imports and renders `MobileNav` component on all pages
- **Back-to-top button** — repositioned above mobile nav on touch devices
- **Footer padding** — adjusted on touch devices to not be hidden behind mobile nav

## [5.10.0] - 2026-03-22

### Added
- **Expanded social sharing** (`ShareButtons.astro`) — now supports 8 platforms: X/Twitter, LinkedIn, Facebook, Reddit, Bluesky, WhatsApp, Email (mailto with prefilled body), and copy link. Each platform icon highlights in its brand color on hover. Reddit and Bluesky hidden on small screens to prevent overflow
- **Native Web Share API** — on mobile devices, a "More" share button taps into the OS share sheet (Messages, AirDrop, etc.). Only renders when `navigator.share` is available
- **Floating share sidebar** (`FloatingShareBar.astro`) — sticky vertical share bar fixed to the left edge of article pages on xl+ screens. Glass morphism styling, appears when article content is in view, hides at footer
- **Article reactions** (`ArticleReactions.astro`) — emoji reaction bar (Insightful, Mind-blown, Rigorous, Practical) with localStorage persistence per article slug. Pop animation on click, toggle on/off, count display
- **Highlight-to-share** (`HighlightShare.astro`) — when users select 10–400 characters of article text, a dark tooltip popup appears with options to share the quote on X, Bluesky, or copy with attribution. Only triggers within article content
- **Reading List page** (`/reading-list`) — full page for viewing all bookmarked articles from localStorage. Shows article cards with hero images, category, read time. Per-article remove button + "Clear all" with confirmation. Empty state with CTA
- **Social follow links in Footer** — RSS, X/Twitter, and Bluesky follow buttons with hover-lift effect in a new "Follow & Subscribe" section
- **RSS autodiscovery** — `<link rel="alternate" type="application/rss+xml">` in BaseLayout `<head>` so feed readers auto-detect the RSS feed
- **Reading List + RSS links in SideNav** — bookmark icon link to `/reading-list` and RSS icon link to `/rss.xml` in the sidebar "More" section

### Fixed
- **Share URL domain** — ShareButtons now uses correct `tune-health.vercel.app` via `Astro.site` (was hardcoded to `aluminews.com`)
- **Package version sync** — bumped from 5.8.0 to 5.10.0 to match changelog

### Changed
- **ShareButtons** supports `variant` prop (`"inline"` | `"vertical"`) and `description` prop for richer share text
- **ArticleLayout** now includes FloatingShareBar, ArticleReactions, and HighlightShare components
- **Footer** has new social/follow section above the bottom bar
- **SideNav** "More" section expanded with Reading List and RSS Feed links

## [5.9.0] - 2026-03-22

### Added
- **RSS feed** (`/rss.xml`) — via `@astrojs/rss`, includes all published articles with tags as categories
- **Sitemap** — `@astrojs/sitemap` integration generates `sitemap-index.xml` on build
- **Custom 404 page** — branded error page with "Back to Home" and "Browse Articles" CTAs
- **About page** (`/about`) — mission statement, editorial standards, brand tone cards, app CTA. Linked from Footer and SideNav
- **Series infrastructure** — `series` and `seriesOrder` fields in content schema, `getSeriesArticles()` and `getAllSeries()` utility functions
- **Series navigation component** (`SeriesNav.astro`) — progress dots, "Part X of Y" counter, prev/next links. Auto-renders on articles with a `series` field
- **Social share buttons** (`ShareButtons.astro`) — Twitter, LinkedIn, copy link on every article page
- **Breadcrumbs** on article pages — Home > Articles > Category with topic link wiring
- **Bookmark / reading list** (`BookmarkButton.astro`) — localStorage-based save system on article pages
- **Article pagination** — articles index shows 12 initially with "Show More" button; auto-expands when filtering or searching
- **Per-article OG images** — `heroImage` from Supabase used as Open Graph image for social sharing

### Fixed
- **Canonical URL mismatch** — `siteUrl` corrected from `alumi-news.vercel.app` to `tune-health.vercel.app` in BaseLayout. All OG tags, canonical links, and Twitter cards now point to the correct domain
- **Topic nav links were dead** — 16+ links from Header/SideNav/Footer to `/articles?topic=X` now work. Articles index reads `?topic=` URL param and auto-selects matching category chip
- **Related articles were random** — `getRelatedArticles()` now scores by category match (+10) and shared tag overlap (+3 each) instead of returning first 3 articles
- **Fake social proof removed** — subscribe page no longer claims fabricated subscriber counts, open rates, or quotes a fictional doctor. Replaced with honest article stats
- **Homepage category filter inconsistency** — featured hero card now respects category filter (hidden when category doesn't match)
- **Package version mismatch** — package.json synced from 5.5.0 to 5.8.0 (now 5.9.0)
- **Newsletter form duplication** — homepage form now uses shared `data-newsletter-form` pattern; removed duplicate inline handler

### Changed
- **Deep Dives page rewrite** — now dynamically renders published series (Thyroid Deep Dive, 6 articles with cards) above coming-soon series, using `getAllSeries()` from content collection
- **Thyroid articles** — all 6 articles tagged with `series: "The Thyroid Deep Dive"` and `seriesOrder: 1-6`
- **Article header navigation** — article pages now show Home / Articles / Series links instead of just a back arrow
- **Font loading optimized** — reduced from 22 font weights to 13 across 3 families (Playfair Display 8→5, Inter 5→4, Crimson Pro 7→3)
- **Loader speed** — reduced forced delay from 1.6s to 0.6s
- **Footer nav** — added About link to Explore section
- **SideNav** — "Our Mission" link changed to About page link

### Removed
- **GSAP dependency** — unused (zero imports in src/), removed from package.json and astro.config.mjs

## [5.8.0] - 2026-03-23

### Added
- **Thyroid Series (Parts 2–6)** — 5 deep-dive articles published from source docs with AI-generated editorial illustrations:
  - **Part 2: "The War Within"** (`thyroid-war-within`) — Hashimoto's, Graves', gut-thyroid axis, molecular mimicry, selenium, microbiome signatures. 15 min read. Clinical Evidence.
  - **Part 3: "The Poisoned Well"** (`thyroid-poisoned-well`) — PFAS, fluoride, perchlorate, BPA, phthalates, pesticides, mixture toxicology, regulatory failure. 13 min read. Environmental Health.
  - **Part 4: "The Fetal Blueprint"** (`thyroid-fetal-blueprint`) — Maternal thyroid dependency, iodine deficiency resurgence, autism link (2x risk with uncontrolled hypothyroidism), IQ effects, universal screening failure. 11 min read. Clinical Evidence.
  - **Part 5: "The Cancer That Wasn't"** (`thyroid-cancer-conversation`) — Overdiagnosis paradox, active surveillance, thermal ablation, BRAF/RET/NTRK molecular targeting, 2025 ATA guidelines. 11 min read. Clinical Evidence.
  - **Part 6: "Rebuilding the Thyroid"** (`thyroid-rebuilding`) — IMITHOT FMT trial, AI-assisted diagnostics, polygenic risk scores, DIO2-guided T3 therapy, precision medicine vision for 2035. 12 min read. Clinical Evidence.
- Total published articles: 46

### Fixed
- **Production URL** — README updated from stale `alumi-news.vercel.app` to correct `tune-health.vercel.app`

## [5.7.0] - 2026-03-22

### Added
- **Daily Article Agent** (`daily-article-agent` Edge Function) — fully autonomous daily editorial pipeline
  - **Phase 1: Research** — Claude with native `web_search_20250305` tool autonomously discovers trending health topics from the last 3 days (up to 10 web searches), cross-referenced against existing article catalog to avoid duplicates. No third-party search API needed.
  - **Phase 2: Article Writing** — Claude with web search (up to 5 fact-checking searches) writes a 2,500-3,000+ word investigative article with full editorial formatting (sections, pull quotes, info cards, SVG hero, TOC, disclaimer)
  - **Phase 3: Publish** — saves to Supabase DB, commits .astro + .json to GitHub (triggers Vercel deploy), fires illustration generation
  - Actions: `run` (full pipeline), `dry-run` (everything except GitHub publish), `status` (recent log entries)
  - Rate-limited: one successful run per calendar day
  - Supports `model` parameter: defaults to Claude Sonnet 4.6 for speed, accepts `"opus"` for Claude Opus 4.6 quality
- **`daily_article_log` table** — tracks each agent run: topic, slug, title, status, error, search queries, research snippets, timestamps
- **`pg_cron` schedule** — daily at 6 AM UTC via `pg_net` HTTP POST to Edge Function
- **New article: "The Shingles Shot That Quietly Became a Heart Drug"** — investigative article on the ACC.26 study showing 46% MACE reduction from shingles vaccination, Korean cohort (1.27M participants), ESC meta-analysis, VZV vascular damage mechanisms, dementia protection evidence, and skeptics' assessment. 13-minute read, Clinical Evidence category.
### Fixed
- **Illustration pipeline sync** — daily agent was committing article JSON to GitHub *before* illustration was generated (fire-and-forget), so heroImage never reached the static site. Now waits for illustration generation (up to 60s), gets the URL, and includes `heroImage`/`heroImageAlt` in the GitHub commit. Articles deploy with art from the first build.
- **Large article card (01) missing title** — `.article-card-large` image had `lg:h-full` which filled the entire card, pushing `.article-card-content` out of view via `overflow-hidden`. Fixed with magazine-style overlay: content sits on top of the image with a gradient, scoped to `lg+` only (mobile keeps stacked layout).
- **Newsletter input iOS auto-zoom** — `text-sm` (14px) → `text-base` (16px) to prevent Safari zoom on focus.

### Changed
- **UI tightening across the site** — reduced visual bloat for a more refined, magazine-like density:
  - **Typography**: display-1 max 6rem→4.5rem, heading-1 3.5rem→2.75rem, heading-2 2.25rem→1.875rem, body-lg and overline slightly reduced
  - **Container**: max-width 1400px→1240px, padding px-6/8/12→px-5/8/10
  - **Nav**: height h-18/h-20→h-14/h-16
  - **Hero**: full viewport (100dvh), stats + scroll indicator absolute-anchored at bottom
  - **Section padding**: py-20/py-28→py-14/py-20, mission py-24/py-32→py-16/py-24
  - **Cards**: content padding p-5/p-6→p-4/p-5, image aspect 16/10→16/9, featured image 4/5→4/3, featured card rounded-3xl→rounded-2xl
  - **Buttons**: px-6 py-3→px-5 py-2.5
  - **Card numbers**: opacity 15%→10%, sizes reduced one step throughout
  - **Deep dives hero**: tightened padding

### Architecture
- Daily article agent pipeline: Claude with native `web_search` tool → autonomous topic discovery & research → article writing with fact-checking → DB save → GitHub publish → illustration generation. No third-party search API — uses Anthropic's built-in server-side web search.
- `pg_cron` + `pg_net` extensions for scheduled execution (must be enabled in Supabase Dashboard)
- Migration: `supabase/migrations/20260322_daily_article_agent.sql`

## [5.6.1] - 2026-03-22

### Added
- **Funnel expansion** — 3 additional touchpoints from quality audit:
  - **Command Palette**: "Open alumi Health" action (power users, ⌘K)
  - **Subscribe page**: app cross-promo card after "Recent Issues" sidebar
  - **Deep Dives page**: "Apply What You Learn" bridge section between series list and newsletter
  - **Articles index**: compact "Take Your Learning Further" CTA section above newsletter

### Fixed
- **AppPromo section background** — added `bg-white dark:bg-stone-900` so the homepage app section visually separates from surrounding sections (was blending into default background)
- **ArticleCTA touch target** — added `min-h-[44px]` to CTA button for WCAG AA compliance on touch devices

## [5.6.0] - 2026-03-22

### Added
- **alumi Health funnel system** — 5 touchpoints connecting the editorial magazine to the alumi Health app (`https://tune-sigma.vercel.app`)
  - **Article-end CTA** (`ArticleCTA.astro`): contextual per category — maps article topics to relevant app features (e.g., Longevity → Lab Results, Nutrition → Meal Analysis, Neuroscience → AI Analyst). Appears after every article's author card
  - **Homepage section** (`AppPromo.astro`): 4-feature grid (Lab Results, Meal Analysis, AI Analyst, N=1 Experiments) with "Start 14-Day Free Trial" CTA, placed between the Mission section and Deep Dives
  - **Header nav link**: subtle pill-shaped "alumi Health" link with external arrow, hidden on mobile to keep header clean
  - **Footer section**: alumi Health promo bar with description and "Start Free Trial" button, placed above the copyright bar
  - **SideNav promo card**: compact app card in the sidebar under a new "App" section label
- **Funnel configuration module** (`src/utils/funnel.ts`): centralized category-to-feature mapping, CTA copy, and UTM link builder — single source of truth for all 5 touchpoints
- **UTM tracking**: every app link includes `utm_source=alumi-news`, `utm_medium={touchpoint}`, `utm_campaign={category}`, `utm_content={article-slug}` for conversion tracking
- **CSS**: `.app-cta`, `.app-cta-icon`, `.app-cta-feature-pill`, `.app-promo-card` styles in `@layer components`

## [5.5.1] - 2026-03-22

### Fixed
- **Drop cap baseline alignment** — replaced manual `float-left` + hardcoded `font-size`/`margin-top`/`margin-bottom` with CSS `initial-letter: 3` (+ `-webkit-initial-letter` for Safari), which automatically sizes and aligns the drop cap to span exactly 3 text lines with proper baseline alignment. Moved rule outside `@layer components` to prevent cascade layer from suppressing `initial-letter`. Float fallback (`font-size: 6.1rem`) for browsers without support. Fixed selector to `> section:first-child > p:first-of-type` so only the article's opening paragraph gets a drop cap (was applying to every section's first paragraph).

## [5.5.0] - 2026-03-22

### Security
- **Auth added to `delete-article` and `publish-article` Edge Functions** — both were previously unauthenticated, allowing anyone to delete or publish articles. Now require `ADMIN_TOKEN` Bearer auth.
- **Auth bypass fixed in `articles-api`** — logic `if (adminToken && ...)` allowed write ops when `ADMIN_TOKEN` env var was unset. Changed to `if (!adminToken || ...)`.
- **Error info leakage fixed** — all 8 Edge Functions now return generic error messages instead of raw `err.message` (which could expose internal details like DB errors, API rate limits)
- **Admin token env var renamed** — `PUBLIC_ADMIN_TOKEN` → `ADMIN_TOKEN` (server-side only). The `PUBLIC_` prefix was exposing the token in client-side Astro bundles.
- **Security headers** — added `vercel.json` with X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy

### Added
- **AI Agents panel** on admin dashboard (replaces minimal "AI Tools" section):
  - **Editorial QC Agent**: 3 modes (Audit Only, Dry Run preview, Audit & Auto-Fix), severity selector (High/Medium+/All), pattern warnings, copy report to clipboard, per-issue fix status with check/skip/error indicators, status badge showing grade
  - **Illustration Agent**: single-article dropdown selector for targeted generation, batch controls (Generate Missing, Regenerate All with cost confirmation)
  - **Database Sync**: refresh DB from content button
- **Admin dashboard enhancements**: 6 stat cards (total, published, drafts, featured, illustrated, avg read time), category breakdown pill row, recently updated horizontal scroll, article search/filter, description preview per card, illustration status indicator (green/gray dot), tag count
- **Category gradient mapping** — added "Research Summary" and "Pharmacology" to `getArticleGradientStyle()` (were falling back to gray default)

### Fixed
- **iPhone scroll-back-up bug** — reveal animations used 700ms `translateY` transitions that fought with iOS Safari scroll momentum. On touch devices, transforms are now disabled — opacity-only transitions at 300ms. Removed negative `rootMargin` from IntersectionObserver. Removed `will-change: transform` from scroll progress bar.
- **iOS auto-zoom on inputs** — newsletter email input and admin form inputs were below 16px (iOS auto-zooms on < 16px). Changed to `text-base` / `1rem`.
- **Mobile menu scroll lock** — added `body.menu-open { overflow: hidden }` to prevent background scroll when hamburger menu is open
- **SideNav back-gesture conflict** — trigger zone moved 12px from left edge, hidden entirely on touch devices to avoid conflicting with iOS Safari back-swipe
- **Admin layout viewport units** — changed `100vh` to `100dvh` (3 instances) so layout doesn't extend behind iOS browser chrome
- **Scroll progress bar address bar** — now uses `visualViewport.height` instead of `innerHeight` to handle iOS address bar collapse/expand
- **Command Palette safe area** — respects `env(safe-area-inset-top)` for iPhone notch, added `px-4` edge padding
- **FloatingTOC touch target** — collapse button expands to 44px on touch devices (was 24px, below Apple minimum)
- **TypeScript errors** — fixed `slugify()` union type mismatch in ArticleEditor, reverted `mapArticle` data param to proper Astro type
- **Silent catch blocks** — 3 empty `catch {}` blocks in ArticleEditor now provide user feedback
- **`as any` casts eliminated** — added `Window` interface extension, proper type narrowing in CommandPalette, DraftData interface in ArticleEditor, typed `updateMetadata` parameter
- **`console.error` removed** from generate-illustration Edge Function (production code rule)

### Changed
- **Branding consistency** — BRAND.md, CHANGELOG.md, package.json updated from "Tune Health" to "alumi news"
- **Package.json** — name `alumi-news`, version `5.5.0`, removed unused `@astrojs/node` dependency
- **`.nvmrc`** — updated from Node 20 to 22 (matches runtime)
- **Deprecated CSS removed** — `-webkit-overflow-scrolling: touch` (unnecessary in modern iOS)
- **Reveal animation timing** — reduced from 700ms to 400ms on desktop, 300ms on mobile; stagger delays reduced proportionally

### Removed
- `astro-temp/` leftover scaffold directory (44KB, was gitignored but cluttering workspace)

## [5.4.0] - 2026-03-22

### Added
- **AI Tools panel** on admin dashboard — live controls for Editorial QC and Illustration generation
  - "Audit Only" button: runs editorial-qc audit, shows grade + issues with before/after comparisons
  - "Audit & Fix" button: audits then auto-applies medium+ severity fixes
  - "Generate Missing" button: batch-generates illustrations for articles without them
  - "Regenerate All" button: regenerates all illustrations (with cost confirmation dialog)
  - 4th stat card showing illustration coverage (X/Y illustrated)
- **Auto-illustration on article creation** — ArticleEditor now calls `generate-illustration` automatically after Claude generates a new article

### Changed
- **14 headlines refined for brand voice** — replaced QC-generated titles that were too clickbaity with headlines matching the editorial voice (provocative + intellectual, not BuzzFeed)
  - "IQ Tests Are Mostly Bullshit" → "What IQ Actually Measures — and What It Misses Entirely"
  - "The Ovary Apocalypse" → "Half the Population Goes Through Menopause. Medicine Barely Noticed."
  - "Empathy Is Overrated" → "Empathy Has a Problem Science Is Only Now Admitting"

### Fixed
- **Title mismatch between cards and article pages** — all 39 `.astro` page files synced with JSON metadata titles. Previously, card titles (from JSON) were updated but article page titles (hardcoded in `.astro` props) still showed old values.

## [5.3.0] - 2026-03-22

### Added
- **`editorial-qc` Edge Function** — autonomous editorial quality control system
  - `audit`: Claude (Sonnet) reviews ALL articles holistically as a collection, analyzing headline variety, reader magnetism, description quality, illustration status, and metadata completeness. Returns structured JSON report with issues, severity levels, specific suggestions, and an overall grade.
  - `fix`: Auto-applies changes by dispatching to other Edge Functions (`articles-api` for titles/descriptions, `generate-illustration` for missing art). Supports `min_severity` threshold and `dry_run` mode.
  - `audit-and-fix`: Combined flow — audit then auto-fix in one call.
  - Identifies patterns like structural repetition ("22/39 titles start with 'The'"), weak differentiation, and monotonous headline rhythms.
- All 39 articles seeded to Supabase database (was only 8)

### Changed
- **16 article titles improved** based on QC audit — reduced "The X" pattern from 56% to ~30%, increased structural variety, improved reader magnetism
- Examples: "The Disease Medicine Forgot" → "190 Million Women Have a Disease Science Ignores", "The Switching Brain: What Creativity Actually Is" → "Creativity Isn't What You Think It Is"

## [5.2.0] - 2026-03-22

### Added
- **`generate-illustration` Edge Function** — automated AI illustration pipeline using OpenAI GPT Image 1.5
  - `generate` action: creates an editorial illustration for a single article by slug
  - `batch` action: generates illustrations for all articles missing them (with `force` option)
  - House style prompt ensures consistent "premium health science magazine" visual language
  - Category-specific color palettes (8 categories) for cohesive art direction
  - Images stored in Supabase Storage (`article-illustrations` bucket)
  - Auto-updates `hero_image` and `hero_image_alt` in database
  - Rate-limit-safe sequential processing for batch operations
- **heroImage rendering with gradient fallback** — all card components now check for `heroImage` first, then fall back to category gradient art. This means illustrations automatically appear everywhere once generated.
- `OPENAI_API_KEY` stored securely in Supabase secrets (never in code or .env)

### Architecture
- Image pipeline: OpenAI GPT Image 1.5 → Supabase Storage → database `hero_image` field → static site JSON → card rendering
- All secrets (OPENAI_API_KEY, ANTHROPIC_API_KEY, GITHUB_TOKEN, ADMIN_TOKEN) stored in Supabase secrets only

## [5.1.0] - 2026-03-22

### Changed
- **Homepage redesigned** — article grid limited to 9 cards with "Browse all" CTA (was dumping all 40)
- **Category filters are now functional** — JS-powered filtering on homepage and articles index
- **Articles index completely redesigned** — compact 3-column grid with featured row (was full-width stacked cards requiring excessive scrolling)
- **Category-based gradient art system** — replaced broken dynamic Tailwind gradients and generic Unsplash stock photos with intentional, editorial-quality CSS gradient palettes per category via `getArticleGradientStyle()`
- **Footer redesigned** — added brand tagline ("Health is wealth. We help you protect it."), 4-column layout with topic links
- **Newsletter component improved** — progressive feedback animation, benefit checkmarks on default variant, prevents duplicate event bindings
- **SideNav cleaned up** — removed 8 dead links to non-existent pages (/research, /glossary, /protocols, /tools, /about, /team, /methodology, /contact)
- **Related articles fixed** — ArticleLayout now uses gradient art system (was showing empty gray boxes from broken dynamic classes)
- **Newsletter visual cards** on homepage now pull real article data instead of hardcoded fakes

### Added
- **Article search** on articles index page — real-time filtering by title, tags, and category
- **Category filter pills** on articles index — functional filtering with live result count
- **No results state** when search/filter yields no matches
- `getArticleGradientStyle()` utility — maps categories to rich CSS gradient palettes (Mental Health = indigo/violet, Neuroscience = blue/cyan, Longevity = emerald/teal, etc.)
- `getCategories()` used in homepage and articles index for dynamic category rendering

### Fixed
- **Broken gradient rendering** — dynamic Tailwind classes (`from-${var}`) were being purged at build time, showing empty gray card images. Now uses real CSS via inline styles
- Removed `heroImage`/`heroImageAlt`/`sortOrder` fields from all article JSON files (unused, replaced by gradient art system)

## [5.0.0] - 2026-03-22

### Added
- **24 new articles published** — massive content expansion across all categories
  - **Longevity**: "The Fire That Never Goes Out" (chronic inflammation), "Men Are Losing a Chromosome" (Y chromosome loss), "The Menopause Research Debt"
  - **Neuroscience**: "The Nerve That Runs Everything" (vagus nerve), "ADHD Brains Are Half Asleep", "The Blood-Brain Barrier Is Leaking", "Why Everyone Is Going Nearsighted" (myopia), "The Second Brain's Second Opinion" (gut-microbiome), "THC Doesn't Just Blur Memories", "The Intelligence Trap: What IQ Actually Measures", "The Switching Brain: What Creativity Actually Is", "The Empathy Problem", "The Neuroscience of Awe"
  - **Mental Health**: "The Largest Cannabis Study Ever Conducted", "Depression May Be an Energy Problem", "Emotional Intelligence Is Real. The Industry Mostly Isn't.", "The Positive Thinking Trap", "Faith Without God: The Case for Secular Hope"
  - **Clinical Evidence**: "The Nocebo Effect: How Belief Makes Drugs Toxic", "What Ozempic Is Actually Doing to Your Brain" (GLP-1)
  - **Environmental Health**: "You Are Mostly Plastic Now" (microplastics)
  - **Nutrition**: "Your Body Has a Gear It's Forgotten How to Use" (metabolic flexibility)
  - **Fitness**: "Zone 2 Training: The Science Behind Slow"
  - **Longevity**: "Senolytics: Clearing the Path to Longevity"
- Each article includes custom SVG feature image, table of contents, pull quotes, info cards, and medical disclaimer
- Featured articles: chronic-inflammation, glp1-brain, intelligence
- Source documents preserved in `source-docs/` directory

### Changed
- **3 "coming soon" articles converted to full published articles** (metabolic-flexibility, zone-2-training, senolytics)
  - Updated JSON metadata: `comingSoon: false`, `draft: false`, expanded tags and keywords
  - Created full `.astro` page files with complete article content
- Total published articles: 5 → 29
- All new articles auto-appear in homepage, articles index, SideNav, and Command Palette (collection-driven navigation)

## [4.0.0] - 2026-03-15

### Added
- **Admin Publishing Portal** at `/admin` — full editorial CMS
  - Token-based auth with middleware gate; logout button in header
  - **Dashboard** reads from Supabase database; shows Published, Drafts, and Coming Soon sections with status badges (Featured, Has Content, Draft, Coming Soon)
  - **New Article editor** (two-column: upload/chat + live preview)
    - Drag-and-drop file upload (.md, .docx, .txt) with mammoth for DOCX parsing
    - Claude Opus generates articles in exact editorial format (sections, pull quotes, info cards, SVG hero, TOC, disclaimer)
    - Progressive status messages during generation; cancel button
    - Chat refinement with 6 quick-action templates (Punchier intro, More evidence, Shorter, etc.)
    - Version history with restore (snapshots before each refinement)
    - Metadata editor with validation, auto-slug, visual gradient picker, hero image URL
    - localStorage auto-save (never lose work on refresh)
    - Publish confirmation dialog; validation gate
  - **Edit existing articles** at `/admin/edit/[slug]` (three tabs)
    - Metadata tab: all fields, saves instantly to database
    - Content tab: raw HTML code editor with word count and preview
    - AI Refine tab: chat with Claude to modify article content with quick actions
    - Live article preview in right panel
    - "Publish to GitHub" button assembles .astro + .json and commits
  - **Delete articles** with confirmation modal; removes from both database and GitHub
- **Supabase PostgreSQL database** — `articles` table as source of truth for editing
  - Full schema: HTML content, SVG, TOC, metadata, status, timestamps
  - Auto-updating `updated_at` trigger; RLS enabled
  - All 5 existing articles seeded with full HTML/SVG/TOC content
- **Supabase Edge Functions** (6 total, deployed to TUNE project)
  - `articles-api`: CRUD operations with auth (list, get, save, delete, seed)
  - `process-article`: Claude Opus article generation with editorial system prompt
  - `refine-article`: Chat-based article refinement
  - `publish-article`: GitHub REST API commit pipeline (supports full and metadata-only updates)
  - `delete-article`: Removes .astro + .json files from GitHub
  - `fetch-article`: Fetches article content from GitHub (fallback)
- **Coming Soon articles** as content collection entries
  - `metabolic-flexibility.json`, `zone-2-training.json`, `senolytics.json`
  - Rendered with "Coming Soon" badges on homepage and articles index

### Changed
- **All navigation is now collection-driven** — zero hardcoded article references
  - Homepage article grid, featured article, article counter all dynamic
  - Articles index page renders from collection
  - SideNav featured links auto-populated from latest articles
  - CommandPalette article data injected from Astro via `window.__ALUMI_ARTICLES__`
  - Related articles auto-fetched by ArticleLayout
- **Content schema extended** with `heroImage`, `heroImageAlt`, `sortOrder`, `comingSoon` fields
- **Article utilities extended** with `getComingSoonArticles()`, `getArticlesForHomepage()`, `formatPublishDateShort()`
- All 5 article JSON files updated with `heroImage` and `heroImageAlt` values

### Architecture
- SSR via `@astrojs/vercel` adapter (admin pages server-rendered, public pages static)
- Auth middleware at `src/middleware.ts` protects `/admin/*` routes
- Client-side cookie auth (Vercel blocks POST to serverless functions)
- Database is source of truth for edits; GitHub for static site deployment
- Generated articles auto-saved to database; publish pushes to GitHub

## [3.0.0] - 2026-03-14

### Changed
- **REBRAND: Tune Health → alumi news** — Company renamed from Tune to Alumi
  - All brand references updated: "Tune Health" → "alumi news" (lowercase)
  - Logo text changed from "Tune Health" to "alumi news" in header, footer, sidenav, and loader
  - Logo font changed from serif (Playfair Display) to sans-serif (Inter) for brand consistency with alumi Health app
  - Author bylines: "Tune Health Editorial" → "alumi news Editorial"
  - Avatar initials: "TH" → "an"
  - Page titles, meta tags, Open Graph, and SEO structured data updated
  - Command palette footer branding updated
  - Site URL updated to alumi-news.vercel.app
  - All 5 article JSON author fields updated
  - Copyright notice updated

## [2.7.0] - 2026-03-14

### Added
- **New Article** - "The Serotonin Deception: How a Flawed Theory Became Medicine's Most Profitable Myth"
  - 22-minute evidence review of the serotonin/chemical imbalance theory of depression
  - Covers the 2022 Moncrieff umbrella review in Molecular Psychiatry
  - Examines pharmaceutical marketing of the chemical imbalance narrative
  - SSRI efficacy data from Cipriani meta-analysis (522 trials, 116,477 participants)
  - Placebo problem analysis (active vs inert placebos)
  - Withdrawal crisis: 56% experience symptoms, 46% describe them as severe
  - Evidence-based alternatives: exercise, CBT, psilocybin-assisted therapy, social connection
  - Located at `/articles/the-serotonin-deception`
- Article added to homepage grid (position 01), articles index, command palette, and SideNav featured section
- Homepage article counter updated from 3 to 4

### Added
- **New Article** - "Pan-demic: The Truth About Your Non-Stick Cookware"
  - 10-minute evidence review of PFAS "forever chemicals" in non-stick coatings
  - Covers DuPont/3M corporate cover-up history and litigation
  - PFAS health risks: 56% increased thyroid cancer risk, 97% of Americans contaminated
  - Heat decomposition and microplastic release from scratched surfaces
  - Safer cookware alternatives: borosilicate glass, stainless steel 18/10, cast iron
  - Reformatted from external source into TUNE editorial voice (removed emojis, added evidence framing)
  - Located at `/articles/nonstick-pan-pfas`
- Article added to homepage grid, articles index, command palette, and SideNav
- Homepage article counter updated from 4 to 5

## [2.6.0] - 2025-12-11

### Changed
- **Brand Messaging Overhaul** - Refined hero and site-wide copy
  - Hero slogan: "Evidence. Wherever it leads." (positive framing, replaces "No..." opener)
  - About section heading: "Health Without the Hype"
  - Health/Wealth theme woven throughout:
    - Footer: "Health is wealth. We help you protect it."
    - About closer: "The only wealth that matters."
    - Newsletter: "Real Wealth Starts Here"
  - Updated BRAND.md with final brand voice
- **Dynamic Header Menu** - Latest articles now fetched dynamically
  - Uses `getCollection('articles')` to show 3 most recent
  - No more hardcoded article links
  - Section renamed from "Featured" to "Latest"

## [2.5.0] - 2025-12-11

### Changed
- **Warm Color Palette** - Custom black and white with subtle warm tint
  - `black` now `#1b1a18` (HSL 47°, 3%, 10%) - warm dark gray instead of pure black
  - `white` now `#e7e6e3` (HSL 47°, 3%, 90%) - warm off-white instead of pure white
  - Creates a cohesive, premium editorial aesthetic
  - All Tailwind utilities (`bg-black`, `text-white`, etc.) use these warm tones
- Fixed Tailwind content paths to include `src/` directory for Astro files

## [2.4.0] - 2024-12-11

### Added
- **New Article** - "Do Any Longevity Interventions Actually Work?"
  - Comprehensive 25-minute evidence review of longevity interventions
  - Covers OMAD, caloric restriction, autophagy, primate studies, CALERIE trials
  - Reviews supplements: rapamycin, metformin, resveratrol, NAD+ precursors
  - Includes ProLon fasting-mimicking diet analysis
  - Critical examination of translation problems from animal to human studies
  - Section on failed interventions and "zombie ideas"
  - Exercise as the only proven intervention
  - Located at `/articles/longevity-interventions`
- Article added to homepage grid, articles index, command palette, and header menu

## [2.3.0] - 2024-12-11

### Changed
- **Header Menu** - Now opens on hover instead of click for smoother UX
  - 150ms delay on mouse leave prevents accidental closing
  - Click still works for mobile/touch devices
- **Calmer Hover Effects** - Removed zoom/movement from large elements
  - Removed `scale-105` hover effect from article card images
  - Removed `translate-y-1` hover lift from cards (featured, article, newsletter)
  - Removed button translate on hover
  - Cards now only have shadow/glow changes on hover
  - Small elements (arrows, logo "T") retain subtle motion

## [2.2.0] - 2024-12-11

### Added
- **Magazine-Style Navigation** - Complete navigation overhaul for premium editorial experience
  - `SideNav.astro` - Left sidebar with 26+ links organized by Topics, Series, Resources, About
  - Glass dropdown menu in Header with sections, topics grid, and featured articles
  - Animated hamburger-to-X icon toggle
- **New Pages**
  - `articles/index.astro` - Articles index with published and coming soon sections
  - `deep-dives.astro` - Deep dive series landing page
  - `subscribe.astro` - Newsletter subscription page
- **Editorial Imagery** - Premium Unsplash images throughout
  - Featured article hero images
  - Article card thumbnails
  - Deep dive section thumbnails with gradient overlays
  - Thematically relevant images (meditation for mental health, food for nutrition, etc.)

### Changed
- Header now uses glass dropdown menu instead of simple "Articles" link
- Unified stone-900/50 gradient overlays on all images for consistency
- Updated image quality parameter (&q=80) across all Unsplash URLs

## [2.1.0] - 2024-12-11

### Added
- **Content Collections** - Type-safe article management using Astro's content collections
  - `src/content/config.ts` - Schema definition with Zod validation
  - `src/content/articles/*.json` - Article metadata (title, description, tags, etc.)
  - Type-safe article queries with `getCollection()`
- **SEO Component** - Rich structured data for search engines
  - JSON-LD schema generation (Article, WebSite, Organization, BreadcrumbList)
  - Automatic schema injection into article pages
- **Reusable Components**
  - `ArticleCard.astro` - Configurable article preview cards with View Transition support
  - `Newsletter.astro` - Reusable newsletter signup section with form handling
  - `Breadcrumbs.astro` - Navigation breadcrumbs with responsive truncation
- **Utility Functions**
  - `src/utils/reading-time.ts` - Calculate reading time from content
  - `src/utils/articles.ts` - Article collection helpers (getArticles, getRelatedArticles, etc.)

### Changed
- **Improved View Transitions**
  - Custom fade/slide animations per element
  - Article-specific transition names for smoother morphing
  - Custom CSS keyframes for article title transitions
- **ArticleLayout Enhancements**
  - Now accepts `tags` and `slug` props for better SEO
  - Uses Newsletter component instead of inline markup
  - Integrated SEO component for structured data
- **BaseLayout Updates**
  - Added `head` slot for injecting additional head content (SEO schemas, etc.)

## [2.0.0] - 2024-12-11

### Changed
- **MAJOR: Migrated from Vite to Astro** - Complete architecture overhaul for premium editorial UX
  - Zero JavaScript by default for static content (islands architecture)
  - Native View Transitions API for smooth page navigation
  - React islands for interactive components only

### Added
- **Command Palette (⌘K)** - Site-wide navigation using `cmdk` library
  - Search articles, sections, and pages
  - Quick actions: theme toggle, share, print
  - Recently used items tracking
  - Full keyboard navigation (↑↓ Enter Esc)
- **Floating Table of Contents** - Article navigation with scroll spy
  - Appears after scrolling past hero
  - Highlights current section via IntersectionObserver
  - Collapses to pill on mobile showing current section name
- **View Transitions** - Smooth morphing between pages
  - Logo and header elements persist across navigation
  - Theme state preserved during transitions
- **Reusable ArticleLayout.astro** - DRY article template with slots for feature image, tags, and related content

### Architecture
- New file structure under `src/`:
  - `src/layouts/BaseLayout.astro` - Main layout with View Transitions
  - `src/layouts/ArticleLayout.astro` - Reusable article template
  - `src/components/Header.astro` - Navigation (home/article variants)
  - `src/components/Footer.astro` - Site footer
  - `src/components/CommandPalette.tsx` - React command palette
  - `src/components/FloatingTOC.astro` - Floating table of contents
  - `src/pages/index.astro` - Homepage
  - `src/pages/articles/*.astro` - Article pages
  - `src/styles/global.css` - Tailwind + custom styles
- Updated dependencies: Astro v5, React 19, cmdk v1.1.1
- Dev server now runs on port 4321

## [1.0.7] - 2024-12-10

### Changed
- **Article Content Overhaul**: Rewrote both articles to faithfully match source documents
  - `mirtazapine-guide.html`: Now reflects "Mirtazapine: The Quiet Overachiever of Modern Psychopharmacology" source with all clinical data (400x overdose survival, 89 overdose cases with no deaths, Phase III nausea trials, etc.)
  - `nicotine-research.html`: Now reflects "Nicotine's Promising Health Benefits" source with all research statistics (40-60% Parkinson's reduction, 46% memory recovery, 41 meta-analysis studies, etc.)
- Added prominent medical disclaimer to nicotine article
- Updated article dates to December 2025
- Updated CLAUDE.md to reflect current architecture (removed Lenis/SplitType references)

### Fixed
- Fixed invisible body text on article pages (initAnimations not called when no loader present)

## [1.0.6] - 2024-12-10

### Added
- **SEO & Social Sharing**
  - Open Graph meta tags for rich social media previews
  - Twitter Card meta tags
  - Theme color meta tags for browser UI theming
  - Canonical URLs for articles
  - Keywords meta tag
- **Accessibility Enhancements**
  - Skip link for keyboard navigation ("Skip to main content")
  - ARIA labels on progress bars and interactive elements
  - Enhanced focus-visible states for keyboard users
  - `prefers-reduced-motion` support across all animations
  - Semantic `<main>` wrapper for content
- **Mobile Experience**
  - 44px minimum touch targets for all interactive elements
  - Safe area inset support for notched devices (iPhone, etc.)
  - iOS momentum scrolling on scroll containers
  - Prevented text selection on buttons and cards
- **PWA Support**
  - Added `manifest.json` for Progressive Web App
  - Apple touch icon support
- **Print Stylesheet**
  - Hide navigation, loader, and decorative elements
  - Show URLs after links in print

### Changed
- Updated README with accurate tech stack (removed Lenis references)
- Improved article page meta tags with article-specific Open Graph data

## [1.0.5] - 2024-12-10

### Changed
- **MAJOR Performance Overhaul**: Removed Lenis scroll hijacking for native browser scroll
  - Sites like Nutrafol, Vanity Fair, Washington Post use native scroll - now we do too
  - Eliminated JS scroll synchronization overhead for instant 60fps scrolling
- Replaced GSAP ScrollTrigger with IntersectionObserver for reveal animations
  - CSS transitions handle animations (GPU-accelerated)
  - IntersectionObserver triggers class additions only
- Converted scroll event listeners to passive with requestAnimationFrame batching
- Removed SplitType dependency (text animations now CSS-only)
- GSAP now only used for:
  - Hero entrance animation (complex, one-time)
  - Counter number animation (innerText tweening)

### Removed
- Lenis smooth scroll library (~2kb saved)
- SplitType library
- GSAP ScrollTrigger plugin (scroll animations now CSS-based)
- Parallax effects (minor visual, major performance cost)
- Magnetic button GSAP animations (replaced with CSS transform)

### Fixed
- Added `prefers-reduced-motion` media query for accessibility
- Passive scroll listeners prevent blocking main thread

## [1.0.4] - 2024-12-10

### Fixed
- Removed all dead `href="#"` links throughout the site
- Converted placeholder article cards to non-clickable "Coming Soon" cards with badges
- Changed navigation links to scroll to actual page sections (#featured, #latest, #deep-dives, #newsletter)
- Changed category filter chips from links to buttons (proper UI pattern)
- Converted article tags from links to non-clickable labels
- Simplified footer to only include working links
- Fixed mobile menu to navigate to real sections
- Cleaned up search overlay to only show existing articles

### Changed
- Removed social media icons from footer (no active accounts)
- Simplified article page footers with medical disclaimer
- Deep dives section now shows "Coming Soon" labels
- Related articles sections now link to real articles or show "Coming Soon" badges

## [1.0.3] - 2024-12-10

### Added
- New article: "Nicotine's Promising Health Benefits: A Comprehensive Research Summary"
  - Covers neurodegenerative disease protection (Parkinson's, Alzheimer's)
  - Cognitive enhancement research findings
  - Anti-inflammatory effects and ulcerative colitis
  - Mood disorders (late-life depression, ADHD)
  - Schizophrenia symptom management
  - Metabolic effects and weight regulation
  - Other therapeutic applications (Tourette's, sleep apnea, wound healing)
- Added nicotine article to homepage "Latest Stories" grid
- Added nicotine article to search trending topics

### Changed
- Updated vite.config.js with new article entry point
- Updated trending searches in search overlay

## [1.0.2] - 2024-12-10

### Added
- Deployed to Vercel with auto-deployment from GitHub
- Live site: https://tune-health-mdt774sf1-krimptons-projects.vercel.app

### Changed
- Updated README.md with live site URL and deployment info

## [1.0.1] - 2024-12-10

### Fixed
- Removed `group` from `@apply` directive in `.article-card` (Tailwind build error)
- Fixed circular dependency with `visible` utility in `.back-to-top.visible`
- Fixed circular dependency with `visible` utility in `.search-overlay.active`
- Replaced invalid `bg-stone-50/98` with raw CSS `rgb(250 250 249 / 0.98)`

### Changed
- **Performance**: Reduced Lenis scroll duration from 1.2s to 0.8s
- **Performance**: Increased wheel multiplier for snappier scroll response
- **Performance**: Removed duplicate article card hover effects (CSS handles it)
- **Performance**: Removed infinite newsletter card float animations
- **Performance**: Reduced hero glow blur from `blur-[120px]` to `blur-3xl`
- **Performance**: Reduced nav header blur from `backdrop-blur-xl` to `backdrop-blur-md`
- **Performance**: Removed `backdrop-blur-lg` from search overlay
- **Performance**: Reduced glass effect blur intensity

### Added
- Created CLAUDE.md with development guidelines
- Created README.md with project documentation
- Created CHANGELOG.md for version tracking

## [1.0.0] - 2024-12-10

### Added
- Initial project setup with Vite, Tailwind CSS, GSAP
- Homepage with hero section, featured articles, category navigation
- Article page template (mirtazapine-guide.html)
- Dark/light theme toggle with localStorage persistence
- Smooth scroll with Lenis
- GSAP scroll-triggered animations
- Mobile navigation menu
- Search overlay
- Newsletter subscription form
- Back to top button
- Scroll progress indicator

---

## Changelog Guidelines

When updating this file:

1. **Add entries under `[Unreleased]`** for ongoing work
2. **Move to versioned section** when releasing
3. **Use these categories**:
   - `Added` - New features
   - `Changed` - Changes to existing functionality
   - `Deprecated` - Features to be removed
   - `Removed` - Removed features
   - `Fixed` - Bug fixes
   - `Security` - Vulnerability fixes
4. **Include date** in ISO format (YYYY-MM-DD)
5. **Be specific** - mention file names and what exactly changed
