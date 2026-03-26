New session kickoff — load full context, then plan and execute.

**Step 1 — Load context:**
1. Read NEXT-SESSION-PLAN.md (current status + priorities)
2. Read CLAUDE.md (architecture, edge functions, pipeline, database schema)
3. Read BRAND.md (voice, editorial standards)
4. Read the last 20 entries of CHANGELOG.md (recent work and trajectory)
5. Read the latest 15 git commits (`git log --oneline -15`) for what happened most recently
6. Check git status for any uncommitted work from a previous session

**Step 2 — Understand the ask:**
If I provide instructions (e.g. `/start fix the pinger`), that's the task.
If I don't, look at NEXT-SESSION-PLAN.md priorities and ask me which one to tackle.

**Step 3 — Plan:**
Before writing ANY code:
1. Identify every file that needs to change
2. Trace the full execution path end-to-end (trigger → state changes → side effects)
3. Check for feedback loops and dual-trigger bugs
4. Identify what could break
5. Present the plan and get my approval before implementing

**Step 4 — Implement systematically:**
1. Work through the plan one step at a time
2. After each meaningful change, verify it doesn't break the build
3. If deploying edge functions, deploy and verify
4. When done, run `/ship` to wrap up

Arguments: $ARGUMENTS