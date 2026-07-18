# World Game Test operations

World Game Test is a staff-only, non-publishing route from an exact validated World Editor revision
into the real game-client renderer at `/preview/world`. It is not a player draft selector and does
not change the public world boundary: ordinary player routes continue to resolve only the active
published version.

## Security boundary

- The administrator must hold `maps.preview` in a current AAL2 session.
- Grant issuance is bound to the canonical map UUID, immutable version UUID, edit revision,
  checksum, environment, administrator, and revocable administrator session.
- The API generates 256 bits of random grant material. PostgreSQL stores only its SHA-256 hash.
- The admin portal puts the one-time grant in the launch URL fragment. The game client removes the
  fragment with `history.replaceState` before exchange. It is never placed in a query string,
  referrer, cookie, local storage, or session storage.
- A successful atomic exchange consumes the grant and sets a separate host-only `HttpOnly`,
  `SameSite=Strict` cookie. Deployed production cookies are `Secure`; the cookie is scoped to
  `/api/v1/game-test` and expires after 20 minutes.
- Reload uses only that cookie. Expiry, explicit exit, administrator revocation, administrator
  suspension, session revocation, permission changes, and active maintenance fail closed.
- Preview API responses are `no-store`, `noindex`, `nofollow`, and `no-referrer`. The game-client
  preview document also installs matching metadata. The deployment proxy must preserve these headers
  for `/preview/world`.
- Return navigation is a server-generated same-origin Admin path. Arbitrary URLs, protocol-relative
  paths, backslashes, controls, and credential-bearing targets are rejected.

## Runtime isolation

The preview mounts `GameCanvas`, the same Phaser renderer used by normal play, with the exact draft
manifest and immutable asset-version deliveries. It permits local movement, camera behavior,
collision, depth sorting, asset rendering, and object inspection.

It deliberately does not mount player persistence, token access, rewards, economy, inventory, shops,
crafting, gifts, trades, activities, wardrobe mutation, social graph, public chat, public presence,
or world transitions. The first version is a private solo session: no realtime socket is opened, so
public presence cannot enter the preview and preview movement cannot reach a public channel. The
preview identity and movement state exist only in memory.

The persistent banner identifies Game Test, world/version/revision, expiry, return, and exit. The
debug panel reports the exact revision, pinned asset count, renderer readiness, fallback count,
private-solo realtime state, and current in-memory position.

## Evidence and publication policy

The administrator explicitly records one of `Passed`, `Failed`, `Blocked`, or `Needs Changes`, plus
a boolean checklist, notes, game-client build, environment, tester identity, session, and immutable
version. The database copies build and environment from the exchanged session rather than trusting
browser-submitted evidence metadata. Evidence is append-only. Nothing automatically records a pass.

A passed result for the exact revision is required by the Phase 10C publication review. The review
receipt binds that evidence, the actor, the current public pointer, and the proposed revision before
the separate publish RPC can run. Evidence never publishes by itself. Publishing remains a distinct
`maps.publish` action with confirmation, validation, optimistic concurrency, RLS, and audit
controls. A successor draft has a new version UUID and therefore has no current evidence; the prior
pass is automatically outdated.

`Return to Admin` adds only the non-secret Game Test session UUID to the validated same-origin
return path. The Admin page accepts it only when it is a UUID and the authenticated administrator's
current server-loaded active-session list contains it. The returned panel identifies the tested
world and revision, reports a bounded duration, states that evidence is still unrecorded, and offers
the explicit result form. Grant and session bearer tokens never enter the return URL.

## Owner acceptance checklist

Status: prepared but intentionally unchecked. Record environment, migration/release IDs, tester,
date, browser/device, administrator role, map/revision/session UUIDs, result, and evidence location.

### Admin Portal

- [ ] Save a Lantern Square draft and confirm the exact immutable revision UUID/checksum.
- [ ] Confirm `Open in Game Test` reports `READY` only for the saved validated revision.
- [ ] Confirm unsaved, unvalidated, stale, non-AAL2, unauthorized, and maintenance-blocked states
      remain unavailable with an explicit reason.
- [ ] Open Game Test and confirm the real game opens in a new tab.
- [ ] Confirm the address becomes `/preview/world` without a fragment, grant, or session token.
- [ ] Confirm Admin shows the active session status and permits safe reopen and revocation.
- [ ] Revoke a controlled session and confirm reload/use fails closed.

### Game Client

- [ ] Confirm the persistent preview banner is visible and identifies the intended world, version,
      revision, expiry, public-visibility boundary, and no-progression mode.
- [ ] Compare the debug revision UUID/checksum and pinned asset deliveries with the selected draft.
- [ ] Verify WASD movement, Shift jog, camera, collision, player depth, and spawn.
- [ ] Verify the candidate asset version, scale, foot anchor, depth, collision, interaction point,
      nearby overlap, and any marker fallback explanation.
- [ ] Verify public chat, rewards, inventory persistence, economy, settlement, social mutation, and
      cross-world transitions are unavailable.
- [ ] Reload and confirm the same exact revision resumes during the short session.
- [ ] Confirm a newer draft does not silently replace the revision under test.
- [ ] Use `Return to Admin`; confirm the exact safe editor/revision path, returned session summary,
      bounded duration, and unrecorded-evidence message.
- [ ] Use `Exit Game Test`; confirm the cookie/session clears and no world or player state changes.
- [ ] Confirm expiry ends the session safely and a replayed grant cannot reopen it.

### Public separation

- [ ] In a normal player session, confirm the active published revision still loads.
- [ ] Confirm the preview identity is not present in public presence, population, movement, or chat.
- [ ] Confirm public players are not visible inside private-solo Game Test.
- [ ] Confirm the published pointer and draft manifest remain unchanged throughout Game Test.

### Evidence

- [ ] Record `Failed` against a controlled exact revision.
- [ ] Record `Needs Changes` against a controlled exact revision.
- [ ] Record `Blocked` against a controlled exact revision.
- [ ] Record `Passed` explicitly; confirm opening a session never auto-passes it.
- [ ] Save a successor and confirm the previous pass remains history but becomes `Test Outdated`.

### Publication

- [ ] Confirm Game Test launch, return, and evidence submission never publish.
- [ ] Confirm publish-impact review identifies current public and proposed exact revisions plus
      bound Passed evidence.
- [ ] Confirm only the separate authorized Phase 10C publication action can advance the public
      revision pointer.

### Responsive and accessibility

- [ ] Verify Admin and Game Test at 360×800, 390×844, 768×1024, 820×1180, 1024×768, 1280×800,
      1440×900, and 1920×1080 without overlap or horizontal overflow.
- [ ] Verify keyboard launch, modal focus trap/restoration, Escape, live status, semantic banner,
      accessible return/exit controls, visible disabled explanations, 44-pixel touch targets, and
      reduced-motion behavior.

## Local and hosted sequence

Run locally before review:

```text
pnpm env:check
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm security:scan
pnpm db:test:local:world
git diff --check
```

Migration `20260716120000_open_in_game_test_sessions.sql` is forward-only. A later authorized hosted
rollout must separately verify the target, review the migration dry run, push the migration, run
hosted database lint/tests, deploy API/Admin/game client together, verify cross-origin cookie
behavior under HTTPS, and execute the owner checklist. None of those hosted actions are part of a
local implementation session.

Production game-client deployments must set `NEXT_PUBLIC_GAME_BUILD_ID` to the immutable deployment
identifier included in evidence. Local development falls back to an environment-labelled local
identifier.
