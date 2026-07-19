# Phase 12C visual trust boundaries

Phase 12C changes presentation and advisory validation only. It does not move gameplay, economy,
inventory, progression, wallet, authentication, collision, interaction, asset lifecycle, or world
publication authority into the browser.

## Authority boundaries

- The world manifest remains the canonical source for coordinates, safe-save bounds, collision,
  spawns, exits, interaction ranges, stable asset keys, and immutable version identity.
- The shared visual policy may normalize drawing scale, camera framing, shadows, labels, ambience,
  and warning thresholds. It must not rewrite the manifest or expand the authoritative walkable
  area.
- Decorative terrain outside map bounds is camera framing only. Movement stays constrained by the
  manifest safe bounds and blocking shapes.
- Visual-quality, reduced-motion, label, bubble, and HUD preferences are local presentation
  settings. Lower quality never disables collision, server state, moderation, access verification,
  or realtime authority.
- World Composer diagnostics are advisory. They may report an error, strong warning, or
  recommendation, but do not save, validate, approve, publish, activate, or replace content.
- Draft Preview independently loads the protected preview and draft projections. It renders only
  when map ID, version ID, non-null checksum, and exact immutable asset pins agree; missing or
  mismatched pins fail closed instead of discovering a current asset version.
- Visual Readiness requires `maps.read`, loads a caller-selected exact map/version pair through the
  protected server route, and refuses mismatched or unavailable identities. Its checkmarks and
  screenshot markers are browser-local and are not publication evidence.
- Game Test remains no-progression and requires the exact authorized bootstrap grant. The exact
  revision stays the default rendering source. After an authorized Lantern Square grant only, an
  administrator may explicitly choose the checked-in unpublished `local_draft`; non-Lantern maps
  fail closed, and local content is never silently substituted. Its asset deliveries are verified
  bundled-only values in the `game_test` resolver context. It is repository fixture data, not a read
  or disclosure of hosted unpublished-draft metadata. Deterministic one/eleven-player and
  chat-bubble fixtures stay in memory and never become durable player, realtime, telemetry,
  publication, activation, or approval evidence.

## Assets and originality

Bundled media remains repository-owned and manifest-allowlisted. Uploaded media continues through
the existing validated immutable-version, protected-route, exact-pin, and safe-fallback lifecycle.
Camera and scale work does not permit arbitrary URLs, paths, SVG/HTML injection, CSS injection,
cross-game asset lookup, or active-version discovery where exact pins are required.

The visual direction is original Starville work. No external commercial-game asset, map, UI,
character, signature silhouette, or copied mechanic may enter the repository. The absence of a
copyrighted source file is not sufficient when a visual is still a close reproduction.

## Labels and chat bubbles

Player labels consume only the existing bounded public presence projection. They do not expose a
wallet address, authentication identifier, private profile field, or administrator field. No title
or badge is rendered until a narrow authoritative public projection is approved.

World chat bubbles are a second presentation of already-authorized chat messages, not a new send or
history channel. They:

- accept text only from the validated realtime chat contract;
- render text nodes/canvas text, never raw HTML;
- do not convert URLs into active links;
- respect the existing scope, block/mute/moderation, world/channel, distance, and history decisions;
- have bounded text length, duration, count, and distance; and
- never replace the persistent moderated chat panel or report workflow.

## Camera, performance, and failure behavior

Camera fitting is derived from manifest geometry and viewport dimensions. Inputs are finite and
clamped to bounded zoom/overscan settings. Resize does not change player coordinates, interaction
distance, movement speed, or collision. Missing visual media continues to fall back to the bundled
key and then the stable missing material while logical gameplay remains present.

Ambient objects and animations are capped, non-authoritative, and disposable on scene teardown.
Reduced Motion and low-quality modes further reduce them. No effect may allocate per frame without a
bound, attach an uncleaned realtime listener, continuously measure DOM layout, or trigger a hosted
request solely because it is visible.

Phone movement buttons are presentation-only inputs. Pointer and keyboard activation merge into the
same runtime movement vector as WASD and therefore retain the existing collision, safe-bound,
checkpoint, and server-authority contracts. They cannot provide coordinates directly to a player
write or bypass input blocking.

## Database and hosted boundary

Phase 12C adds the forward-only local `20260718122000_phase12c_world_manifest_object_contract.sql`
migration. It layers exact optional quarter-turn rotation and `furniture` object validation over the
prior private validator, preserves its security-definer empty search path, revokes every direct role
grant, and adds no RLS or public RPC surface. No storage policy, asset pointer, world revision,
player row, inventory, DUST, progression, visit, or telemetry record is changed by the local visual
implementation. The separate `20260718121000_fix_phase12_hosted_validation.sql` migration remains
the earlier Phase 12 repair and is not reclassified as visual work. Neither migration was pushed.
Applying any migration, activating an upload, publishing a world, deploying, or writing to a hosted
target requires separate explicit authorization and validation.
