# Phase 12 hosted-validation repair

Status: locally repaired; additive migration push and hosted revalidation are pending.

The hosted Phase 12A/12B validation run exposed three independent compatibility issues after the
owner applied the Phase 12 migrations:

- `public.reconcile_phase12a_player_experience(integer,text)` used an eight-argument onboarding
  recovery call, while the only deployed `private.cozy_add_item` accepted seven arguments. The
  resulting `SQLSTATE 42883` is repaired by the additive
  `20260718121000_fix_phase12_hosted_validation.sql` migration. Its private eight-argument overload
  accepts only the fixed one-item `starter_grant` / `onboarding_recovery` shape, validates metadata
  against the exact `player_inventory_history` bounds (composed reference within 128 characters,
  16-128 character idempotency key), and accepts the complete existing caller contract of a 1-128
  character worker request ID followed by the fixed recovery suffix. A composed child request ID
  above the 128-character ledger bound becomes a deterministic SHA-256-bound identifier; shorter IDs
  remain unchanged. The wrapper then delegates to the canonical seven-argument capacity-, history-,
  and idempotency-aware inventory implementation. No browser or service-role execute grant is added.
- `world_management.test.sql` still checked the retired pre-Phase-10C `publish_admin_world_version`
  RPC. The protected contract is now
  `publish_admin_world_revision(uuid,uuid,text,uuid,uuid,integer,uuid,text,uuid,text,text,integer)`:
  service-role execute only, `SECURITY DEFINER`, empty trusted search path, internal `maps.publish`
  authorization, AAL2, exact revision/checksum/review evidence, rate limit, and audit controls. The
  database grant was already correct, so only the stale test contract changed.
- The same pgTAP file still asserted the legacy 20-key procedural world subset. Phase 12B
  intentionally registered an immutable, reviewed 106-key bundled catalog. The assertion now
  enumerates the deterministic, explicit 106-key allowlist from `world_asset_bundled_catalog` and
  binds every entry to its exact checksum-bound `repository_procedural` bundled version. A
  stable-key collision (a pre-existing user-owned asset already holding a bundled key, the
  documented Phase 12B hosted-upgrade case) keeps the user-owned asset intact, so asset-level
  development-marker checks apply to repository-owned rows while collided rows must remain
  non-procedural; both worlds were validated locally. A new companion assertion (`plan` 70 to 71)
  proves no `repository_procedural` asset exists outside the reviewed catalog, restoring the full
  allowlist strength of the old whole-table test. No procedure or function was added to a callable
  catalog.

The Phase 12A `player_experience.*` admin permissions were verified against
`admin_authorization.test.sql`: the explicit `expected_phase6_admin_permissions` catalog already
contains all four keys, so no permission-catalog repair was needed.

Regression coverage added with the repair:

- `phase12a-postgres-execution.sql` now drives `reconcile_phase12a_player_experience` end to end
  through every `starter_seed_missing` branch: a full inventory fails into investigation without a
  partial mutation, the repaired caller grants exactly one audited moonbean seed through the
  canonical inventory authority using the maximum valid 128-character caller request ID, an
  already-owned seed resolves without a duplicate grant, a spent recovery is rejected instead of
  re-granted, and direct overload calls with a bulk quantity, a foreign reason, a foreign reference,
  or a settled idempotency key are refused with no ledger or inventory residue.
- `cozy_gameplay.test.sql` asserts the eight-argument overload exists and is not executable by
  `service_role`, `authenticated`, or `anon`.
- `migrations.test.ts` pins the repair migration to a single narrow overload with the exact ledger
  bounds, no `grant execute`, and pins the hosted catalog test to the checksum-bound 106-key
  contract plus the no-asset-outside-catalog companion assertion.

No applied migration was edited. The repair does not change RLS, world publication data, immutable
world pins, active asset pointers, economy balances, XP, progression, farming, housing, social data,
or existing player inventory. Rolling back after the migration is hosted would require a later
forward migration that drops only the exact eight-argument private overload; migration history must
not be rewritten.

## Owner-only hosted sequence

Run only after reviewing the local diff:

```sh
cd "/Users/marklesteracak/Documents/Marky Files/Programming/starville"

pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run

SUPABASE_REMOTE_WRITES_APPROVED=true pnpm db:migrations:push

pnpm db:migrations:list
pnpm db:migrations:dry-run

RUN_HOSTED_SUPABASE_TESTS=true pnpm db:lint:hosted
RUN_HOSTED_SUPABASE_TESTS=true pnpm db:test:hosted
```

After the API is running:

```sh
RUN_HOSTED_SUPABASE_TESTS=true pnpm rls:test:hosted
```

Expected results are no pending migrations, hosted lint with zero errors and zero warnings, all
hosted pgTAP tests passing, and all hosted RLS tests passing. Then return the local approval gate
to:

```sh
SUPABASE_REMOTE_WRITES_APPROVED=false
```

These hosted results are not yet claimed by this report.
