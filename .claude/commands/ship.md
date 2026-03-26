Full ship sequence: update docs → build check → commit → push.

**Step 1 — Update all .md docs:**
1. Read the current CHANGELOG.md, README.md, CLAUDE.md, and NEXT-SESSION-PLAN.md
2. Look at all commits since the last changelog entry to understand what changed
3. Bump the version number (patch for fixes, minor for features, major for breaking changes)
4. Update CHANGELOG.md with a new version entry covering all changes
5. Update README.md if any features, edge functions, architecture, or cron schedules changed
6. Update CLAUDE.md if any architecture, file structure, or edge function details changed
7. Update NEXT-SESSION-PLAN.md with current status and version

**Step 2 — Build check:**
1. Run `npm run build` to verify the Astro build passes
2. If the build fails, fix the issue and rebuild

**Step 3 — Commit and push:**
1. `git status` to see all changes
2. `git diff` to review what's being committed
3. `git log --oneline -3` to match commit message style
4. Stage all relevant files (not .env or secrets)
5. Commit with style: `docs: Update all .md docs for vX.Y.Z — summary`
6. Push to main

If I provide a hint (e.g. `/ship fix pipeline timeout`), use that context for the version summary.

Arguments: $ARGUMENTS