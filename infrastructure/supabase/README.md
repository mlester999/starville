# Supabase local foundation

This directory is the only Supabase CLI work directory for Starville. It is deliberately separate
from any other project and has no remote project reference.

## Safe local workflow

Prerequisites are Docker Desktop (or another compatible Docker daemon), Node.js 22+, and pnpm 11+.
The CLI is version-pinned by the root scripts and downloaded with `pnpm dlx`; a global installation
is not required.

```bash
pnpm supabase:start
pnpm supabase:status
pnpm supabase:stop
```

Phase 1 contains no product tables, storage buckets, or production seed data. Authentication signup
is disabled in the local configuration. Later phases must introduce schema through reviewed SQL
migrations and enable RLS before exposing a table through the Data API.

Do not run `db reset`, `db push`, `link`, or any remote command against an unknown project. Linking
a hosted Supabase project and applying remote migrations always requires explicit owner approval.

## Layout

- `config.toml` defines local-only service ports and secure defaults.
- `migrations/` contains ordered SQL migrations once a phase has an actual schema need.
- `tests/` will contain database and RLS policy tests alongside the migrations that introduce them.

See [the database package guide](../../packages/database/README.md) for naming and type-generation
rules once that package is installed, and
[the Phase 1 trust-boundary document](../../docs/security/phase-1-trust-boundaries.md) for access
rules.
