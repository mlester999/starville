# Phase 12E beta trust boundaries

Status: local security design and test evidence. Hosted validation and owner acceptance remain
pending.

## Version authority

- Normal play receives the world revision and asset deliveries from the server.
- A published/unpinned bundled source remains V1.
- V2 local review requires development, loopback, and an exact in-memory candidate control.
- Protected Game Test remains revision-aware, time-bounded, nonpersistent, and no-progression.
- No browser value can rewrite world pins, choose collision, activate an asset, or publish a map.

## Mutation authority

The client may request farming, workstation, shop, progression, housing, and social actions only
through existing authoritative APIs. Visual state, interaction markers, ambience, retry state, and
Game Test inspection never author success.

When Player API, persistence, access, or an operation dependency is unavailable, mutation-capable
controls fail closed. Cached visual display is not authority to mutate.

## Recovery

- Retry controllers allow one request per dependency and use bounded backoff.
- A failed persistence checkpoint remains a retry candidate; it is not reported as saved.
- Realtime replacement disposes the prior socket/listeners before admitting one replacement.
- Revoked/expired access interrupts recovery and requires verification.
- Stable request IDs may be exposed in Details. Raw SQL, database messages, storage paths, secrets,
  cookies, and wallet signatures may not.

## Asset delivery

- Candidate selection is exact manifest/version/checksum scoped.
- Failed asset cache identities are suppressed for a bounded period.
- Fallback preserves manifest collision, interaction, footprint, and depth.
- Admin diagnostics expose stable asset keys and sanitized request IDs, not storage paths.
- Runtime media is data; uploaded or repository media is never executed as code.

## Admin readiness

Operations → Beta Readiness is protected by the existing `operations.read` server-side
authorization. It computes repository-local evidence and provides no write action. It cannot mark
hosted gates, owner acceptance, V2 activation, publication, or production readiness complete.

Sensitive future activation continues to require the existing asset/world permissions, active
administrator identity, AAL2, reason, expected revision, narrow authoritative RPC/API, idempotency,
and immutable audit evidence.

## Game Test and diagnostics

- Scenario progress exists only in component state.
- Synthetic players, gameplay states, reconnect failures, and missing assets are deterministic
  fixtures.
- No fixture sends production telemetry or touches player, inventory, DUST, progression, housing,
  visit, social, world, or asset lifecycle state.
- Development performance diagnostics are absent from normal production UI and contain no private
  player or wallet values.

## Audio

Audio playback requires a user gesture and local preference. Mute, visibility pause, location fade,
and disposal prevent duplicated loops. Only repository-authored or appropriately licensed sources
may be registered. Phase 12E does not invent or download audio media.

## Database and hosted boundary

Phase 12E needs no new database table or migration. It does not edit an applied migration, push a
migration, run a hosted mutation, activate V2, deactivate V1, publish a world, deploy, alter
players/inventory/DUST/progression/economy, or enable blockchain rewards/NFTs/marketplaces.

The locally repaired pgTAP seed contract remains `HOSTED RERUN PENDING` until the owner records
actual hosted evidence.

## Security acceptance

Local automation must verify:

- local-only V2 gate;
- published V1 default;
- exact revision/pin handling;
- no anonymous asset override;
- no client-authored collision or success;
- no browser service-role material;
- sanitized recovery/fallback details;
- nonpersistent Game Test;
- fail-closed Admin route;
- bounded retry/idempotency behavior;
- listener/socket/audio disposal;
- final secret scan and `git diff --check`.

Hosted RLS, real session revocation, AAL2 activation preview, and signed-in cross-role denial remain
owner-controlled gates.
