# Hosted database policy tests

`admin_authorization.test.sql` uses pgTAP to verify the six-table catalog, deterministic metadata,
RLS enablement, and absence of direct anonymous/authenticated mutations. Run it only through:

```bash
pnpm db:test:hosted
```

The reviewed suite also includes token access, the Phase 4 player slice,
`secure_player_operations.test.sql` for Phase 5 moderation, and `world_management.test.sql` for the
Phase 6 five-map graph, published-version loading, authoritative transitions, immutable history,
append-only world audit, role mappings, dynamic approved-spawn reset, and default-deny world tables.

The separate `pnpm rls:test:hosted` suite uses real temporary Auth sessions for RLS, API, and
revocation behavior. Both commands verify the exact development target and require
`RUN_HOSTED_SUPABASE_TESTS=true`.

Tests must never reset, truncate, drop, roll back unrelated migrations, or delete unknown data.
Fixture cleanup is exact-ID scoped and cleanup failure is a test failure.
