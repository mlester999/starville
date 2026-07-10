# `@starville/database`

This Phase 1 package owns database conventions and migration-name validation. The canonical Supabase
project and SQL migration directory live at `infrastructure/supabase/` and
`infrastructure/supabase/migrations/`; application code must not invent a second migration location.

## Migrations

Migration files use a valid UTC timestamp followed by a focused lowercase snake-case description:

```text
YYYYMMDDHHMMSS_short_description.sql
```

Create changes through the local Supabase CLI, review the generated SQL, and keep each migration
narrowly reversible. Phase 1 intentionally creates no player, economy, reward, item, map, or
administrator tables.

Never reset, push, or repair an unknown remote database from a development command. Remote database
changes require explicit project-owner approval.

## Local development and generated types

Start and inspect the isolated local stack from the repository root:

```sh
pnpm supabase:start
pnpm supabase:status
pnpm supabase:stop
```

After local migrations are applied, generate TypeScript definitions from the local database only:

```sh
pnpm dlx supabase@2.109.1 --workdir infrastructure gen types typescript --local --schema public > packages/database/src/database.types.generated.ts
```

Generated definitions reflect the database; hand-authored speculative table types are not allowed.

## Development seeds

Seed SQL belongs to the local Supabase project and must contain development-only data. It must never
contain production exports, real player information, credentials, wallet secrets, or fabricated
records presented as production data. Production seeding is a separate, explicitly authorized
deployment operation.
