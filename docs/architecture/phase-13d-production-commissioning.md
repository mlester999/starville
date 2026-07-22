# Phase 13D production commissioning architecture

Phase 13D separates repository preparation from owner-controlled production mutation. The current
repository result is **Stage A blocked**; no later stage has started.

## Boundary and target identity

`starville-dev` remains the development/closed-beta target. `starville-prod` must be a distinct
Supabase project and a distinct Reown project with exact HTTPS/WSS domains, mainnet RPC, token mint,
program, decimals, and a version-1 environment contract. `production:verify-target` validates and
masks those identities, checks the linked Supabase workdir and database URL, and requires all three
mutation gates to be false. It does not contact the database.

Production templates under `infrastructure/deployment/templates/` cover Landing, Game Client, Admin
Portal, API, Realtime Server, and Worker. They contain owner-required placeholders only. Secrets
belong in provider-managed secret storage. Browser variables remain explicitly public; service-role
keys, database URLs, cookie secrets, recovery material, and realtime ticket secrets remain
server-only.

## Stages and authority

1. Stage A freezes an exact source commit and validates environment, migrations, catalogs, world,
   assets, audio, bootstrap, backup, rollback, observability, and predecessor gates.
2. Stage B is performed only by the owner in twelve checkpoints. Migration, test-fixture, bootstrap,
   world, asset, deployment, and access changes are separated and gate-scoped.
3. Stage C records production-only technical journeys and distinct browser, physical-device,
   accessibility, visual, audio, and owner evidence.
4. Stage D classifies QA data without deleting audit evidence and freezes the release inputs.
5. Stage E rehearses application/content rollback and an isolated database restore. Forward-only
   migrations use forward repair or provider restore, never an assumed automatic reversal.
6. Stage F issues a Phase 14 recommendation. Local automation cannot produce GO.

Every failed stage stops the sequence. Missing evidence stays missing in `release-evidence.v1.json`
and the protected Admin Production Release Candidate view.

## Database and reference data

The frozen manifest contains 85 ordered migrations through
`20260722130000_phase13b_closed_beta_security_hardening.sql`. Filename, timestamp, dependency, and
SHA-256 drift validation prevents in-place edits. The clean chain is the only reference-data
installation path; there is no second ad hoc production seed script. The catalog manifest describes
stable keys, owner state, idempotency, dependency, eligibility, environment restrictions, and
rollback limitations. It expressly excludes player, wallet, administrator, DUST, inventory,
progression, social, moderation, audit, QA, and fake analytics data from `starville-dev`.

The migration comparison parser accepts captured Supabase CLI tables and blocks missing local,
unknown remote, non-empty initial, and incomplete post-push states. Owner output is evidence only
after target identity and the exact commit are recorded.

## World, assets, and audio

No production world revision is approved, so Stage A cannot pass. Bundled V1 is the accepted
technical fallback and V2/V3 remain inactive; the Phase 13D production asset selection still needs
the product owner's signature. The ten-cue procedural audio foundation has zero embedded media bytes
and unambiguous project-owned provenance, but it remains `development_safe` pending owner listening
and production classification. No Animal Care or unrelated-project content is eligible.

## Administrator and public-access safety

The bootstrap CLI requires the exact linked target, exact Auth UUID, preview, both write/bootstrap
gates for one command, production-specific typed confirmation, immediate gate closure, AAL2,
role/audit verification, and second-attempt rejection. No identity is embedded in a migration and no
development administrator may be copied.

Public admission remains closed through an owner-selected server-side maintenance, allowlist, or
provider protection control. A client-only flag is insufficient. Phase 14 alone may open public
access.

## Current blockers

The source commit is ambiguous; exact production target/domains/Reown/token values are absent; the
Phase 13B hosted gate is pending; no world revision is approved; the asset selection is unsigned;
backup/PITR/isolated restore and production monitors are unverified; and all predecessor owner gates
remain pending. These are release governance and production-evidence blockers, not local-test
passes.
