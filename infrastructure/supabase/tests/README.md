# Database policy tests

Database and Row Level Security tests belong here when a migration first introduces an exposed
table. Phase 1 has no schema, so there are no fabricated policies to test.

Each future policy suite must cover anonymous, owning player, other player, authenticated non-admin,
authorized administrator, suspended administrator, and privileged server behavior as applicable.
Tests must run against the local Supabase stack and never against a hosted production project.
