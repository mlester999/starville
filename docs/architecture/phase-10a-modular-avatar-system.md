# Phase 10A modular avatar architecture

Status: implemented locally; hosted deployment and signed-in owner acceptance pending.

## Purpose

Phase 10A replaces a single appearance preset as the primary presentation contract with a versioned,
modular, cosmetic-only avatar profile. It preserves `player_profiles.id` as the canonical player
identity and preserves the legacy appearance preset as a safe rendering fallback. It does not
introduce paid cosmetics, unlock inventory, DUST purchases, token gating, NFTs, trading, equipment
statistics, or a cosmetic marketplace.

The browser can stage a selection and render a preview. Trusted services remain authoritative for
which catalog keys are active, compatible, and available; whether a player may create or update a
profile; the current revision; and the privacy-safe appearance returned to another player.

## System boundaries

| Boundary            | Owns                                                                                                             | Does not own                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Game client         | Staged selection, responsive creator and Wardrobe, procedural fallback rendering, local animation                | Catalog publication, raw asset paths, render order, profile revision, administrator cosmetics |
| Game API            | Authentication, bounded request validation, rate limiting, idempotency, friendly error mapping                   | Direct browser-selected assets or database table mutation                                     |
| Realtime server     | Compact appearance reference hydration and in-place appearance refresh                                           | Asset URLs, profile authoring, durable catalog mutation                                       |
| PostgreSQL          | One profile per canonical player, closed references, revisions, forced RLS, immutable active content, audit      | Public direct mutation                                                                        |
| Admin portal        | Permission-aware structured authoring, validation, review, approval, activation, superseding, settings and audit | Raw JSON, executable mappings, source-asset mutation, automatic publication                   |
| World Asset Manager | Asset intake, processing, review, approval and protected game-asset versions                                     | Player profile selection or avatar publication policy                                         |

## Shared contracts

`@starville/avatar` defines one canonical 3–80 character stable-key schema, closed selection layers,
a maximum of four unique accessories, player mutation requests, public resolved profiles, compact
realtime appearance references, asset types, and animation mapping rules. All eight canonical
directions are required for each of `idle`, `walk`, and `jog`. Modular layers must align on frame
dimensions and frame counts.

The public player selection contains only stable catalog keys. It never contains storage locations,
external URLs, data URLs, SVG, scripts, dynamic imports, render order, wallet data, email, session
identifiers, DUST, token holdings, private inventory, or administrative metadata.

## Profile and catalog lifecycle

The canonical avatar profile belongs to the existing player row and has one appearance identifier
plus a positive revision. First creation is unique and idempotent. Updates require the expected
revision; two updates from the same revision cannot both overwrite the profile. The legacy preset
remains available when no modular profile exists or when a compatible active selection cannot be
resolved.

Avatar definitions and versions follow:

`Draft → Validate → Submit for Review → Review → Approve → Activate → Supersede`

Validation does not approve. Review does not silently edit the submitted version. Approval is
explicit. Activation requires approval. Active versions and their child mappings are immutable. A
previous valid version can return only through a controlled activation. Audit evidence is
append-only, and stale revisions are rejected.

Starter presets are reviewed combinations of active compatible definitions. Procedural fallback
values may support local development rendering, but they are not silently inserted into an
authoritative player profile and are never presented as published production artwork.

## Rendering and movement

The renderer assembles modular visual layers around a shared foot anchor. The authoritative movement
validator computes one of eight facings from accepted isometric displacement and preserves the last
facing during stationary jitter. It also computes `idle`, `walking`, or `jogging`; a client-supplied
facing or state cannot override that result.

The local and remote renderers select `idle`, `walk`, or `jog` using that accepted state. Remote
entities retain a stable player identity and depth-sort from their current foot position. Replacing
appearance layers does not reset position, create a duplicate entity, or manufacture movement.

The production contract supports approved sprite and layer sheets. The development renderer can draw
modular non-pixel procedural shapes when approved artwork is unavailable or fails. That fallback is
deliberately labeled and remains behind the same closed-key profile authority.

## Realtime synchronization

Presence may include only the paired compact fields `appearanceId` and `appearanceRevision`; one
cannot appear without the other. The realtime service hydrates them from trusted persistence rather
than from a join message. Movement messages remain URL-free and do not repeat the full selection.

After an authoritative profile mutation, the client requests an appearance refresh. The server
reloads the current compact reference, rejects a no-op revision, and broadcasts `appearance_updated`
within the admitted world and channel. Receiving clients resolve the public profile through the
trusted API and reconcile it in place. Channel switch, world transition, reconnect, and disconnect
continue to own entity admission and removal.

## Compatibility and failure behavior

- A missing modular profile resolves through the existing legacy appearance preset.
- An incomplete or unavailable server catalog disables save; compiled procedural choices remain
  preview-only.
- A disabled or superseded definition resolves through a compatible active version or the approved
  fallback rather than an arbitrary browser replacement.
- An asset load failure uses the safe renderer fallback without changing the authoritative profile.
- A stale profile update asks the player to reload the latest appearance.
- Module maintenance blocks new mutations while preserving the current resolved public appearance
  and durable data.
- Player suspension, rename requirements, revoked access, and rate limits fail closed through
  friendly bounded errors.

## Phase boundary

Phase 10B may later consider wardrobe unlocks, cosmetic shop integration, more appearance slots,
emotes, furniture interactions, activity animations, seasonal catalogs, and collections. None of
those are activated by Phase 10A. Existing identity, access, movement, world, social, activity,
economy, ledger, receipt, shop, and token-claim-disabled behavior must remain unchanged.
