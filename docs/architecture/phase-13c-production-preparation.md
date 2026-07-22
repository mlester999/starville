# Phase 13C production-preparation architecture

Phase 13C completes Starville's repository-owned live-operations and production-configuration
preparation. It does not commission, deploy, seed, query, or mutate `starville-prod`. The output is
a locally verifiable release candidate whose remaining work is explicit Phase 13D owner
commissioning and acceptance.

## Source-of-truth hierarchy

1. `docs/STARVILLE_MASTER_SPEC.md` defines the product and trust boundaries.
2. `infrastructure/deployment/manifests/production-environment.v1.json` defines required production
   configuration without values or credentials.
3. `infrastructure/deployment/manifests/migrations.v1.json` binds every ordered migration to a
   SHA-256 hash.
4. `infrastructure/deployment/manifests/production-reference-seeds.v1.json` allowlists reference
   sources and rejects player/test data.
5. `infrastructure/deployment/manifests/release-evidence.v1.json` records evidence states without
   manufacturing approvals.
6. `packages/live-operations/src/release-readiness.ts` maps operator capabilities to authorization,
   server authority, audit, rollback, runbook, and automated evidence.

The manifests are descriptive controls. None is an executable production authorization. The release
validator reads only repository files and the provided process environment; it never opens a
database or network connection.

## Environment separation

`STARVILLE_DEPLOYMENT_TARGET` is distinct from `NODE_ENV` and the public application environment.
Allowed targets are `local`, `test`, `starville-dev`, and `starville-prod`. Production validation
rejects localhost, insecure schemes, wildcard CORS, debug mode, public source maps, development
network selection, a development Supabase ref, missing owner values, and every
remote-write/bootstrap approval gate. A successful validation means only that a candidate
configuration is internally consistent.

Browser bundles receive only explicitly profiled public variables. Service-role keys, database URLs,
provider credentials, and administrative secrets remain server-only. API, Realtime, and Worker
production builds do not emit source maps; Game Client source maps are explicitly disabled.

## Operational control plane

The existing Admin Portal remains the only Starville administrative application.
`/operations/release-live-ops` is a protected, read-only view using `operations.read`. It displays
local contract versions, a capability matrix, and disabled owner gates. Mutations continue through
their established, narrowly permissioned surfaces. There is no public administrator registration and
no alternate control plane.

The capability model uses four literal states:

- `ready`: repository workflow, authorization, server authority, audit, rollback, runbook, and tests
  exist.
- `ready_with_limitations`: the workflow exists but production configuration, hosted rehearsal, or a
  deliberate product limitation remains.
- `missing`: a required provider or capability has not been selected or implemented.
- `blocked`: work cannot complete locally because Phase 13D owner/hosted control is required.

Missing or blocked capabilities make `productionReady` false. Owner acceptance is never derived from
test output.

## Data and migration boundary

The 85-migration chain is the single schema and reference-catalog installation path. Each entry
carries its filename, timestamp, predecessor, and content hash. Phase 13D must bind the manifest to
an approved commit, compare the hosted migration ledger, execute a clean-chain rehearsal in
`starville-dev`, and stop on any drift.

Production seed policy excludes player profiles, identities, sessions, wallets, inventory, DUST,
moderation evidence, support cases, synthetic accounts, development URLs, and secrets. Accepted
bundled V1 remains the recovery default. V2 and V3 remain local candidates until explicit owner
acceptance. World and asset activation occur only through existing protected, audited Admin Portal
workflows after clean migration validation.

## Recovery and evidence

Rollback is service-specific and non-destructive: redeploy an approved artifact, restore an accepted
world/asset version, disable live-operations state with the current revision, apply an independently
reviewed inverse economy correction, or use an owner-approved provider restore. Published history,
ledgers, player state, and audit records are never silently rewritten.

The evidence bundle remains `productionReady: false` until hosted validation, exact domains, Reown
configuration, production Supabase/recovery controls, visual/audio/gameplay review, security review,
and Phase 13D authorization are recorded by their named owners.

## Explicit exclusions

- No hosted player, inventory, DUST, world, or asset mutation.
- No production connection, administrator bootstrap, seed, migration push, or deploy.
- No Git staging, commit, or push.
- No future animal gameplay. Animal Care remains disabled and unreleased.
- No Fablesol, Pokentara, Sailana, AIvanza, or other unrelated-project scope.
