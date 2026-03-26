Update all .md documentation files for a new version.

1. Read the current CHANGELOG.md, README.md, CLAUDE.md, and NEXT-SESSION-PLAN.md
2. Look at all commits since the last changelog entry to understand what changed
3. Bump the version number (patch for fixes, minor for features, major for breaking changes)
4. Update CHANGELOG.md with a new version entry covering all changes
5. Update README.md if any features, edge functions, architecture, or cron schedules changed
6. Update CLAUDE.md if any architecture, file structure, or edge function details changed
7. Update NEXT-SESSION-PLAN.md with current status and version

Follow the existing commit message style: `docs: Update all .md docs for vX.Y.Z — summary`

Commit with the docs prefix and push to main.

Arguments: $ARGUMENTS