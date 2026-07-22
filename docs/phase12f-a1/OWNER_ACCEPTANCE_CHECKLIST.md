# Phase 12F-A.1 owner acceptance checklist

Prepared only. Every item is intentionally unchecked. Automated tests, fixture labels, and stale
browser captures do not substitute for owner acceptance.

Current gate: **PHASE 12F-A.1 BLOCKED — NOT READY FOR OWNER SIGN-OFF**. Before final acceptance, the
candidate still needs durable current evidence plus an authenticated/realtime integration path. The
loopback review route is useful for visual and movement review but cannot prove account, inventory,
DUST, progression, wallet, reward, persistence, presence, or reconnect behavior.

## Integration prerequisites

- [ ] Enter V3 through an authenticated local gameplay path rather than the pre-auth review fixture
- [ ] Preserve the real account identity and profile
- [ ] Preserve the real selected appearance
- [ ] Preserve the real inventory and hotbar
- [ ] Preserve real DUST, XP, progression, and quest state
- [ ] Preserve wallet access and the current session
- [ ] Confirm no reward duplication or settlement during entry/exit
- [ ] Remove exterior presence while inside the private interior
- [ ] Show only appropriate same-instance interior presence
- [ ] Restore exterior presence once on exit
- [ ] Reconnect outside with one avatar at the correct location
- [ ] Reconnect inside with one avatar at the correct private instance
- [ ] Resolve or explicitly approve the interior wrapper/runtime `MapId` boundary
- [ ] Recapture current browser and timed animation evidence after final code changes

## World size

- [ ] Confirm exterior is approximately 3× wider
- [ ] Confirm exterior is approximately 3× taller
- [ ] Confirm full map does not fit in one viewport
- [ ] Walk far from spawn
- [ ] Confirm camera follows
- [ ] Confirm camera respects boundaries
- [ ] Confirm no visible empty out-of-world background during normal play

## Scale

- [ ] Confirm player is smaller
- [ ] Confirm player remains readable
- [ ] Confirm cottage scale feels believable
- [ ] Confirm mature trees are clearly large
- [ ] Confirm bushes remain smaller than trees
- [ ] Confirm paths support multiple players

## Grass

- [ ] Inspect repeated pattern
- [ ] Confirm checkerboard repetition is reduced
- [ ] Inspect edges
- [ ] Inspect path transitions
- [ ] Inspect building transitions
- [ ] Inspect shoreline transitions

## Water

- [ ] Inspect depth variation
- [ ] Inspect movement
- [ ] Inspect reflections
- [ ] Inspect shoreline
- [ ] Inspect bridge posts
- [ ] Inspect Reduced Motion
- [ ] Confirm player cannot walk into water
- [ ] Confirm bridge remains traversable

## Collision

- [ ] Walk into cottage wall
- [ ] Walk into tree trunk
- [ ] Walk into sofa or bench
- [ ] Walk into workbench
- [ ] Walk into fence
- [ ] Walk into notice board
- [ ] Walk into rocks
- [ ] Jog into collision
- [ ] Confirm no tunneling
- [ ] Confirm no invisible oversized walls

## Occlusion

- [ ] Walk behind tree
- [ ] Walk in front of tree
- [ ] Walk behind sofa or bench
- [ ] Walk in front of sofa or bench
- [ ] Walk near cottage
- [ ] Confirm no half-body cloaking
- [ ] Confirm no full-body disappearance
- [ ] Confirm no walking through foreground art

## Direction

- [ ] Walk N
- [ ] Walk NE
- [ ] Walk E
- [ ] Walk SE
- [ ] Walk S
- [ ] Walk SW
- [ ] Walk W
- [ ] Walk NW
- [ ] Confirm movement and facing agree
- [ ] Confirm left does not face right
- [ ] Confirm right does not face left

## Walk

- [ ] Confirm feet alternate
- [ ] Confirm arms alternate
- [ ] Confirm frames visibly advance
- [ ] Confirm no frozen pose
- [ ] Confirm no sliding
- [ ] Confirm stable anchor

## Jog

- [ ] Confirm longer stride
- [ ] Confirm faster frame cycle
- [ ] Confirm feet alternate
- [ ] Confirm arms alternate
- [ ] Confirm no frozen running pose
- [ ] Confirm no sliding

## Idle

- [ ] Stop in every direction
- [ ] Confirm facing is preserved
- [ ] Confirm idle does not reset south
- [ ] Confirm Reduced Motion

## House entry

- [ ] Approach door
- [ ] Confirm Enter Home prompt
- [ ] Press E
- [ ] Confirm input blocks during transition
- [ ] Confirm interior loads
- [ ] Confirm no browser refresh
- [ ] Confirm player spawns inside door

## Interior

- [ ] Inspect bed
- [ ] Inspect bedside table
- [ ] Inspect table
- [ ] Inspect chairs
- [ ] Inspect chest
- [ ] Inspect wardrobe
- [ ] Inspect rug
- [ ] Inspect windows
- [ ] Inspect fireplace or cooking area
- [ ] Inspect lighting
- [ ] Test all furniture collision
- [ ] Test interior depth sorting
- [ ] Confirm room feels spacious

## House exit

- [ ] Approach interior door
- [ ] Confirm Exit Home prompt
- [ ] Exit
- [ ] Confirm transition
- [ ] Confirm exterior restores
- [ ] Confirm player returns outside at the cottage door
- [ ] Confirm inventory, DUST, progression, and appearance remain

## Responsive

- [ ] Desktop
- [ ] Tablet
- [ ] Mobile
- [ ] Mobile touch controls
- [ ] Mobile entry and exit
- [ ] High contrast
- [ ] Reduced Motion
- [ ] 200 percent zoom

## Safety

- [ ] Confirm V1 unchanged
- [ ] Confirm V2 unchanged
- [ ] Confirm V3 local-only
- [ ] Confirm no hosted activation
- [ ] Confirm no publication
- [ ] Confirm no hosted write
- [ ] Confirm no migration was pushed
- [ ] Confirm no deployment occurred
- [ ] Confirm no commit or Git push occurred
- [ ] Confirm Phase 12F-B was not started

## Local review routes

Start the game client on its current local port, then open the paths below on `localhost` or
`127.0.0.1`. The examples use port 3101; change only the port if the local server uses another one.

- Candidate: `http://127.0.0.1:3101/?visual-candidate=production-slice-v3&visual-version=v3`
- Character matrix:
  `http://127.0.0.1:3101/?visual-candidate=production-slice-v3&visual-version=v3&review-panel=characters`
- Far-east camera/boundary checkpoint:
  `http://127.0.0.1:3101/?visual-candidate=production-slice-v3&visual-version=v3&review-position=far-east&diagnostics=1`
- Cottage entry:
  `http://127.0.0.1:3101/?visual-candidate=production-slice-v3&visual-version=v3&review-position=cottage-entry`
- Direct interior fixture:
  `http://127.0.0.1:3101/?visual-candidate=production-slice-v3&visual-version=v3&review-location=interior`
- Mobile exterior:
  `http://127.0.0.1:3101/?visual-candidate=production-slice-v3&visual-version=v3&review-mobile=1&review-position=cottage-entry`

Use WASD or arrows to walk, hold Shift to jog, press `E` at the cottage/door, and use the dedicated
touch action on the mobile fixture. Enable diagnostics, Reduced Motion, and High Contrast where the
checklist requests them. Do not activate, publish, or persist the candidate during review.
