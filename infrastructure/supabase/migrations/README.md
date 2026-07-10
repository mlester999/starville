# Migration convention

No SQL migration is required in Phase 1 because no product tables are authorized for this phase.
This file keeps the migration boundary explicit without inventing speculative schema.

Future migration files must use UTC timestamps and a descriptive snake-case name:

```text
YYYYMMDDHHMMSS_descriptive_change.sql
```

Every migration that exposes a table through Supabase must enable Row Level Security in the same
change and ship with policy tests. Migrations are immutable after they have been applied to a shared
environment; corrections use a new migration. Production data must never appear in seed files.
