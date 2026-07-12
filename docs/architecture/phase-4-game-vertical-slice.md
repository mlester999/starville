# Phase 4 playable vertical-slice architecture

## Status and scope

Phase 4 adds one protected, locally buildable gameplay slice: a wallet-access session may create or
load a minimal player profile, enter Lantern Square, move an animated cosmetic character, collide
and depth-sort against the map, use one notice interaction, and resume from a validated safe
position. It does not add farming, inventory, economy, rewards, multiplayer, administrator player
operations, map editing, or blockchain transactions.

The database migration is deliberately owner-gated. Repository completion and hosted deployment are
separate states; see the [migration runbook](../deployment/phase-4-player-migration.md).

## Component ownership

| Component              | Owns                                                                                                                           | Does not own or prove                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| React game shell       | Access/profile boot states, character setup, HUD, settings/dialogue overlays, local audio preferences, save orchestration      | Movement authority, wallet verification, frame rendering         |
| Phaser runtime         | Active scene, keyboard polling, projection into screen space, procedural drawing, animation, camera, collision response        | Wallet SDK, API authorization, database access, React navigation |
| `@starville/game-core` | Strict contracts, manifest validation, projection, movement vectors, collision, depth and closest-interaction rules            | Browser APIs, Phaser, Supabase, secrets                          |
| API                    | Resolve the existing cookie, derive wallet identity, validate profile/state input, validate safe map state, return safe errors | Client-supplied wallet authority or gameplay rewards             |
| PostgreSQL             | One profile per wallet, idempotent creation, durable rate limits, resume state, grants and RLS boundary                        | Real-time movement or anti-cheat authority                       |

## Protected bootstrap sequence

1. The game client calls `GET /api/v1/token-access/me` with the host-only HttpOnly cookie.
2. No profile request or Phaser import occurs unless the server returns the typed `granted` state.
3. The client calls `GET /api/v1/token-access/player/profile`. The API resolves the cookie again and
   derives the wallet from the trusted session; no wallet appears in the request body or route.
4. A missing profile produces the React character-setup screen. Valid creation is idempotent and
   server-validated.
5. Only a valid returned profile is converted to the initial runtime state. The Phaser chunk is
   dynamically imported and mounted once.
6. Scheduled/focus access reconciliation remains active. Expiry, revocation, configuration change, a
   failed required recheck, or a protected player API 401 unmounts and destroys Phaser.

The Phase 3 cookie stays at `/api/v1/token-access`, `HttpOnly`, host-only, `SameSite=Lax`, and
`Secure` in production. Phase 4 routes live below that path, so cookie scope was not broadened.

## Coordinate and render model

Player state uses continuous logical tile coordinates. The shared projection is:

```text
screenX = originX + (worldX - worldY) × tileWidth / 2
screenY = originY + (worldX + worldY) × tileHeight / 2
```

Keyboard intent is screen-relative, then converted into the logical isometric plane and normalized.
WASD is the only movement input and points in the visible compass direction while collision and
persistence remain map-stable. Walking uses a shared 2.5 tiles/second constant; either physical
Shift key applies a bounded 1.35× jog. Both modes normalize diagonals. Delta time is capped at 100
ms and collision movement is subdivided from the previous valid position to prevent tunneling. A
blocked substep derives its world-space contact normal, removes only inward motion, and accepts a
tangent slide only when the resulting position is safe. It never prefers a raw world axis, because
those axes are diagonal in the rendered view. Arrow keys have no gameplay binding.

Depth is calculated from the logical foot position, not artwork height. A stable identifier hash
breaks equal-depth ties. The player collision circle is centered at the feet, allowing tall artwork
to pass correctly behind or in front of other objects.

## React–Phaser lifecycle

The runtime bridge exposes only `setInputBlocked`, master-bus `setAudioSettings`, `interact`,
`getState`, and idempotent `destroy`. Callbacks report ready/error, a throttled state snapshot, a
five-second dirty checkpoint, the current interaction target, dialogue opening, and a settings
request. React does not receive a state update every frame.

The host has at most one active runtime. Starting a replacement destroys the prior instance and
clears the host. React cleanup records one final snapshot, destroys Phaser, and removes the canvas.
Text-entry focus, Settings, dialogue, leaving, and hidden-tab state block movement. Page hide
requests a credentialed keepalive save; failures never enable offline authenticated play.

## Persistence and authority

Position writes occur after a dirty five-second checkpoint, on safe lifecycle events, and before an
explicit leave. They do not occur every frame. The API accepts only the single allowed map, finite
coordinates, a known facing direction, positions inside safe bounds, and positions outside blocking
collision shapes. Invalid persisted state is replaced in the response with the manifest spawn and a
focused diagnostic containing only request/profile identifiers.

The saved state is a convenience resume point. It must never establish rewards, achievements,
leaderboards, token earnings, multiplayer truth, or anti-cheat results.

## Performance envelope

Lantern Square is intentionally small (24 × 20 tiles). Terrain is drawn as one batched Phaser
graphics layer; each manifest object is a separate depth-sorted container. Static objects are not
resorted each frame. Only the player vector art redraws for walk/idle animation. The Phaser chunk is
lazy-loaded after access/profile authorization. No FPS number is claimed without browser
measurement; the production build currently reports the lazy Phaser chunk size in build output.

## Narrow viewport and accessibility

Desktop keyboard play is the Phase 4 target. At 700 px and below, Phaser does not mount; the client
shows an explicit keyboard-required state and keeps the leave action available. Character setup uses
a labeled form, radio group, validation alert, visible focus, and readable loading/error states.
Canvas content has an accessible label; important interaction and Settings content is owned by
normal HTML dialogs. Reduced-motion preference removes camera lag and decorative character/marker
motion.

## Settings and session exit

The semantic Settings dialog traps focus, restores focus on close, blocks local gameplay input, and
supports Escape when no action is pending. Phaser currently exposes one real master audio bus, so
only Master Volume and Mute are displayed and persisted as a bounded, non-sensitive local
preference. No music, ambience, or effects channels are represented until audio content exists.
Returning to the landing page flushes the current safe position and may retain the valid access
session. Ending the Starville session requires confirmation, revokes the trusted server session,
unmounts the private player runtime, and then navigates home. Neither action disconnects an external
wallet or sends a blockchain transaction.

## Collision development overlay

Set the browser-safe build variable `NEXT_PUBLIC_GAME_COLLISION_DEBUG=true` to draw blocking
manifest footprints in red and the player foot circle in cyan. It is disabled by default, contains
no wallet or session data, and is intended only for explicit local/map-development builds. Do not
enable the flag for normal production builds.
