# `@starville/database`

This package validates migration naming and statically checks Phase 2 and Phase 3 migration
invariants. The canonical CLI project is `infrastructure/supabase`; application packages must not
create another migration directory.

Migration files use a valid UTC timestamp and lowercase snake-case description:

```text
YYYYMMDDHHMMSS_short_description.sql
```

Phase 2 contains three ordered administrator migrations: schema/security triggers, deterministic
role-permission metadata, then trusted functions/RLS. Existing migration files are immutable after
hosted application. Phase 3 follows them with two ordered token-access migrations: schema first,
then trusted functions/RLS. Later changes require a new migration.

## Generated types

Generate database definitions only from the verified hosted development project after its migration
history is current:

```bash
pnpm exec supabase --workdir infrastructure gen types typescript --linked --schema public \
  > packages/database/src/database.types.generated.ts
```

Review generated changes before use. Do not hand-author a file that claims to reflect an unapplied
database, and never generate from production for local development.

## Safety

Use the root target verifier, list, and dry-run commands before any push. No
reset/down/truncate/drop script exists. System role/permission rows are metadata, not fake
production users or gameplay data. See
[hosted Supabase development](../../docs/deployment/hosted-supabase-development.md).
