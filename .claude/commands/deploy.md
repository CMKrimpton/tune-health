Deploy one or more Supabase Edge Functions.

If I specify function names (e.g. `/deploy stage-research stage-qc`), deploy exactly those.
If I say "all pipeline" or just `/deploy pipeline`, deploy all 10 pipeline functions:
stage-research, stage-editor, stage-write, stage-independence, stage-qc, stage-voice-rewrite, stage-publish, pipeline-scout, pipeline-pinger, pipeline-admin

If I say "all" or `/deploy all`, deploy every function in supabase/functions/ (excluding _shared/).

Use `supabase functions deploy <name> --no-verify-jwt` for each.
Run deploys in parallel where possible.
Report success/failure for each function.

Arguments: $ARGUMENTS