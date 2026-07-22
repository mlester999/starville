# Deployment boundary

Phase 13C supplies provider-neutral, value-free production contracts under `manifests/`:

- `production-environment.v1.json` classifies every service-profile and commissioning variable,
  owner, exposure, expected production shape, rotation, and failure mode.
- `migrations.v1.json` orders and hashes the full PostgreSQL migration chain.
- `production-reference-seeds.v1.json` allowlists reference sources, excludes player/test/secret
  data, and keeps unaccepted asset candidates fail-closed.
- `production-reference-catalogs.v1.json` records stable key, idempotency, dependency, eligibility,
  environment restriction, owner state, and rollback limitation for each catalog family.
- `production-audio.v1.json` records zero-byte procedural provenance and the pending owner gate.
- `production-commissioning.v1.json` records the current Stage A block and never authorizes a write.
- `release-freeze.v1.json` stays explicitly unfrozen until the owner completes the required stages.
- `release-evidence.v1.json` records missing production, hosted, browser/device, and owner gates
  without manufacturing approval.

Provider-neutral per-service production examples are under `templates/`. They intentionally contain
owner-required placeholders and default every production mutation gate to false.

`pnpm release:validate` performs read-only manifest drift and environment-separation checks. It does
not select a provider, resolve owner placeholders, connect to Supabase, authorize a hosted command,
or deploy. `pnpm release:check` is the provider-neutral CI/release quality command; a future
provider pipeline should invoke it against the exact approved commit before artifact publication.

`pnpm production:audit` validates the local blocked commissioning package.
`pnpm production:verify-target` performs masked local identity/link validation and requires every
gate false. The owner-only command sequence is documented in
`docs/deployment/phase-13d-owner-commands.md`. No production credentials or hardcoded project
identifiers may be committed.
