# Phase 8D-A social graph deployment

No hosted operation is performed automatically. Before owner-approved deployment, keep maintenance
gates false, confirm the target is the Starville development project, back up the database, and
review `20260715130000_friends_parties_social_graph.sql` plus all pending Phase 8A-C migrations.

Owner-approved sequence:

```bash
pnpm env:check
pnpm supabase:target:verify
pnpm supabase:db:push:dry-run
pnpm supabase:db:push
pnpm supabase:db:lint
pnpm supabase:test:hosted
pnpm supabase:test:hosted:rls
```

Use the repository's exact hosted command names when they differ; never reset a hosted database.
Then deploy API, realtime, worker, game client, and admin portal together so protocol, RPC
signatures, and UI remain compatible. Confirm the cleanup job is registered and the nine new social
rate-limit environment variables are set to reviewed values.

Rollback is application-only: disable the optional `social_graph` module or roll back services while
preserving tables and audit. Do not reverse or delete the migration, friendships, parties, or
evidence. Correct schema issues with a forward-only migration.
