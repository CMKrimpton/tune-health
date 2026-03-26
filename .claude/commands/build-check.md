Run the Astro production build and verify it passes cleanly.

1. Run `npm run build` in the project root
2. If the build fails:
   - Read the error output carefully
   - Identify the failing file and line
   - Fix the issue (common: unescaped `<` in article HTML, missing imports, Tailwind @apply issues)
   - Re-run the build to verify the fix
3. If the build succeeds:
   - Report the number of pages generated and build time
   - Check for any warnings that should be addressed

Do NOT commit or push — just verify the build is clean.