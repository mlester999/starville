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
`cozy_gameplay.test.sql` statically verifies the Phase 7A item catalog, DUST ledger, inventory,
quickbar, forced-RLS defaults, immutable histories, and narrow trusted RPC grants. Real bootstrap
and replay behavior runs in the isolated local PostgreSQL execution fixture before hosted review.
`economy.test.sql` verifies the Phase 9A source, sink, policy, shop, receipt, reconciliation,
correction, risk-review, simulation, and read-only STAR-utility boundaries; append-only ledger
authority; forced-RLS defaults; exact role mappings; narrow service RPC grants; and the absence of
on-chain settlement or player-to-player DUST transfer authority. It also verifies that the additive
shop-offer and avatar-selection lint repair preserves exact signatures, function metadata, owners,
grants, and closed eligibility boundaries. `platform_configuration.test.sql` covers the Phase 7.5B
presentation authority, permission matrix, forced RLS, immutable publication, approved branding
profiles, and public-versus-preview execution boundaries. `realtime_presence.test.sql` covers Phase
8A channel capacity, one-use ticket admission, session checkpointing, forced-RLS defaults,
service-role-only RPC grants, safe administrator visibility, and the absence of private wallet or
credential fields from presence contracts. `multiplayer_chat.test.sql` verifies the Phase 8B
permission matrix, forced-RLS/default-deny chat storage, narrow realtime/API/worker RPC grants,
immutable evidence references, idempotency, and append-only moderation actions.
`social_interactions.test.sql` verifies the Phase 8C proximity authority, transfer policy,
forced-RLS/default-deny settlement tables, exact-revision confirmations, immutable receipts,
reservation cleanup, and read-only administrator visibility. `social_graph.test.sql` verifies Phase
8D-A unique friendships, one-party membership, exactly-one leader and ready-response constraints,
forced-RLS/default-deny storage, service-only realtime and worker authority, narrow administrator
permissions, private party-chat binding, and deterministic leader transfer.

The separate `pnpm rls:test:hosted` suite uses real temporary Auth sessions for RLS, API, and
revocation behavior. Both commands verify the exact development target and require
`RUN_HOSTED_SUPABASE_TESTS=true`.

Tests must never reset, truncate, drop, roll back unrelated migrations, or delete unknown data.
Fixture cleanup is exact-ID scoped and cleanup failure is a test failure.
