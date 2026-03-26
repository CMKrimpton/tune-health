Full ship sequence: build check → commit → push.

1. Run `npm run build` to verify the Astro build passes
2. If the build fails, fix the issue and rebuild
3. Once clean:
   - `git status` to see all changes
   - `git diff` to review what's being committed
   - `git log --oneline -3` to match commit message style
   - Stage all relevant files (not .env or secrets)
   - Commit with an appropriate conventional commit message (feat/fix/docs/perf prefix)
   - Push to main

If I provide a commit message hint (e.g. `/ship fix pipeline timeout`), use that as the basis for the commit message.

Arguments: $ARGUMENTS