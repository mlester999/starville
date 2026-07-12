# Phase 6 world-management architecture

## Status and scope

Phase 6 is implemented locally. Hosted migration, hosted pgTAP/RLS execution, authenticated player
travel acceptance, and authenticated administrator acceptance remain pending the owner-controlled
maintenance gates and sessions.

Phase 4 implementation and owner gameplay acceptance are complete. Phase 5 implementation and hosted
automated validation are complete; Phase 5 owner administrator acceptance remains pending. Nothing
in this phase adds Phase 7 cozy systems, Phase 8 multiplayer, or Phase 9 economy/rewards.

## Ownership

| Boundary                     | Responsibility                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `@starville/game-core`       | Renderer-independent map schema, collision, projection, movement, spawns, exits, and graph validation            |
| `@starville/game-content`    | Five reviewed manifests, approved procedural asset catalog, and shared admin world response contracts            |
| API world services           | Player/admin request schemas, safe error mapping, response revalidation, and structured logging                  |
| PostgreSQL trusted functions | Published content authority, transition resolution, optimistic writes, lifecycle changes, rate limits, and audit |
| React                        | Access/loading boundaries, HUD, transition presentation, Settings, and administrator workflows                   |
| Phaser                       | One active scene, map rendering/unloading, movement, collision, interaction, camera, and exit detection          |

There is one canonical manifest schema. The game client, API, admin portal, seed generator, and
tests import it rather than maintaining parallel map types.

## World-content model

`world_maps` stores stable identity, status, reviewed default spawn key, record version, and the
active publication pointer. `world_map_versions` stores immutable historical manifests, checksums,
validation evidence, authorship, timestamps, publication reason, and derivation/supersession links.
`world_assets` stores stable approved keys and truthful provenance. The join table retains
historical asset references. `world_audit_events` is append-only. `world_operation_rate_limits`
provides durable limits for reads, edits, validation, preview, publication, derivation, and travel.

All six tables have RLS enabled and no browser-facing policies. Even the service role has no direct
table privileges; the API calls only reviewed security-definer functions with empty search paths.

## Lifecycle

The lifecycle is deliberately narrow:

1. A `draft` is editable with `maps.edit` and optimistic edit/checksum guards.
2. Each save performs structural API validation and full database validation. A safe but
   semantically invalid draft may be retained with explicit blockers; executable or structurally
   malformed content is rejected.
3. Explicit validation moves a valid draft to `validated`; invalid content remains a draft with safe
   validation issues and an audit event.
4. `maps.preview` can open only a validated version through the isolated administrator preview.
5. Publication requires `maps.publish`, a reason, confirmation, expected active version, edit
   version, checksum, a second database validation, and a durable rate-limit claim.
6. One transaction marks the previous publication `superseded`, freezes the new version as
   `published`, changes the active pointer, increments the map record version, and appends audit.
7. Rollback is non-destructive: derive a new draft from a published/superseded version, validate it,
   and publish it as a new version.

Database triggers reject edits to validated, published, superseded, or archived history outside the
trusted publication transition and reject update/delete of world audit rows.

## Manifest

Schema version 1 is strict data only. It includes map identity/revision, development-art disclosure,
palette, dimensions, projection and camera bounds, safe-save bounds, terrain, collision shapes,
objects, notice interactions, asset keys, named spawns, and exactly four directional exit slots.

Validation rejects unsupported schema or object types, non-finite/out-of-range geometry, duplicate
identifiers, undeclared/unapproved assets, invalid or blocked spawns, malformed bounds/collisions,
bridges without walkable water crossings, incomplete or overlapping exits, missing maps/spawns,
arrival spawns inside exit triggers, missing return routes, unsafe text, extra fields, and payloads
over 256 KiB. No script, markup, expression, SQL, arbitrary URL, or executable behavior is stored.

## Published player loading

The protected routes remain below `/api/v1/token-access/player`, preserving the narrow Phase 3
HttpOnly cookie path. Before world loading, the API derives wallet ownership from the access session
and checks the Phase 5 moderation/rename boundary. The database returns only an active published
map, immutable version/checksum, public map metadata, manifest, and authoritative player resume
state.

Normal players cannot provide a draft ID. Client responses are revalidated against the canonical
schema and approved asset catalog before Phaser receives them. Published manifest responses include
the checksum as an ETag but remain private and revalidated; no administrator validation details or
storage credentials are exposed.

## Transition sequence

1. Phaser arms an enabled exit only after the player has been outside an exit trigger.
2. Entering the trigger blocks input and emits only exit ID, current map ID, and immutable map
   version ID to React.
3. React starts the transition lock, clears stale queued saves, and sends exit ID plus optimistic
   game-state/map-version guards. It never sends a destination or spawn coordinate.
4. PostgreSQL locks the player row, rechecks moderation, versions, cooldown, source publication and
   exit, resolves the active destination publication and named spawn, validates safety, and updates
   map/version/position/facing/state version atomically.
5. React validates the response, shows the approximately 0.95-second normal transition (120 ms under
   reduced motion), accepts the authoritative state, and asks the existing runtime to load it.
6. Phaser destroys only old map-specific terrain, objects, markers, and debug graphics; shared
   player rendering, keys, game instance, and scene remain.
7. Camera, collision, interactions, HUD, and map metadata change together. Arrival is unarmed for at
   least 500 ms and must be outside every active trigger before travel can occur again.

The request aborts after 15 seconds. On failure, Phaser restores the last confirmed source-side
position, stale checkpoints remain discarded, input returns safely, and the UI displays a safe
request ID when available. Access/moderation loss returns to the existing access boundary.

## Publication reconciliation

An already loaded player may continue on the immutable source version after it is superseded. State
saves accept that exact published/superseded version, avoiding a mixed scene. At the next safe load,
the profile reconciles to the active publication while preserving a still-walkable position or using
the approved default spawn. A transition always enters the current destination publication.

## Deliberate limits

- The five approved map identities are fixed for this phase; administrators create/edit versions,
  not arbitrary new production map identities.
- Repository-owned procedural development art is temporary and truthfully labelled.
- Secure browser raster upload is withheld; see the asset boundary document.
- Position is resume convenience, not anti-cheat or reward authority.
- Realtime server and worker remain Phase 1 lifecycle foundations; travel uses the API/database and
  adds no multiplayer synchronization or jobs.
