# Phase 12D runtime hotfix owner review

Status: **OWNER REVIEW PENDING**. Every item is intentionally unchecked.

This checklist authorizes no hosted write, migration push, asset activation, world publication,
deployment, commit, or Git push. Run it against the exact local worktree with the normal published
path and the explicit local V2 candidate path.

## HUD

- [ ] Enter the game on desktop
- [ ] Confirm objective and player card do not overlap
- [ ] Confirm location and controls do not overlap
- [ ] Confirm chat and hotbar do not overlap
- [ ] Confirm hotbar and status do not overlap
- [ ] Confirm the interaction prompt does not overlap the hotbar
- [ ] Confirm Details remains reachable and its panel stays in bounds
- [ ] Resize through 360×800, 390×844, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900, and
      1920×1080
- [ ] Test phone and tablet safe areas with touch controls visible

## Character V2

- [ ] Start the local development Game Client with `?visual-candidate=v2`
- [ ] Confirm the text label says `LOCAL V2 CANDIDATE REVIEW · UNPUBLISHED · IN MEMORY`
- [ ] Confirm the Phase 12D vector character appears
- [ ] Walk N, NE, E, SE, S, SW, W, and NW
- [ ] Jog N, NE, E, SE, S, SW, W, and NW
- [ ] Stop while facing every direction
- [ ] Confirm idle preserves the last direction
- [ ] Confirm body, head, face, and near/far limbs agree
- [ ] Confirm no sliding, anchor jump, or crop
- [ ] Confirm local/remote depth sorting in front of and behind trees and buildings
- [ ] Confirm reconnect preserves direction and the jogging transition remains correct

## V1 safety

- [ ] Remove `?visual-candidate=v2` and reload
- [ ] Confirm the unchanged published V1 renderer and V1 asset path return
- [ ] Confirm the current published world revision and checksum are unchanged
- [ ] Confirm no hosted V2 activation or published-world change occurred

## World assets

- [ ] Inspect V2 terrain, trees, signs, lamps, buildings, workstations, crops, furniture, and icons
- [ ] Confirm exact V2 candidate media appears locally where available
- [ ] Confirm a missing/invalid V2 key retains its exact published delivery or normal V1 fallback
- [ ] Confirm object positions, stable keys, collision, interactions, and depth anchors are
      unchanged
- [ ] Confirm no duplicate V1/V2 variant download occurs for the current visible material

## Board modal

- [ ] Approach a notice board and press Interact
- [ ] Confirm the background is dimmed and blurred
- [ ] Confirm the modal surface and content are sharp
- [ ] Confirm ready, loading, empty, and error presentations are readable
- [ ] Close with the footer button
- [ ] Close with Escape
- [ ] Close by clicking the backdrop where allowed
- [ ] Confirm focus is trapped, then restored to the trigger
- [ ] Confirm player input is paused while the modal is open
- [ ] Confirm world/network state can continue reconciling
- [ ] Confirm blur and input blocking clear after close

## Connection

- [ ] Simulate a realtime disconnect
- [ ] Confirm at most one reserved top reconnect banner is visible
- [ ] Confirm one compact bottom status is visible
- [ ] Open Details and inspect Player API, Realtime, Safe-position saves, and Access
- [ ] Confirm unavailable state is not represented as zero or success
- [ ] Use the single Retry action
- [ ] Confirm no duplicate connection, Level, or DUST retry panels appear

## Accessibility and performance

- [ ] Complete keyboard-only navigation
- [ ] Confirm modal focus trap and focus restoration
- [ ] Confirm screen-reader labels for candidate mode, HUD regions, status, Details, and modal
- [ ] Test Reduced Motion
- [ ] Test increased/high contrast and forced colors
- [ ] Test at 200 percent browser zoom
- [ ] Confirm 44-pixel touch targets
- [ ] Record first meaningful render, duplicate downloads, frame time, and memory on desktop/mobile

Owner decision: [ ] accept hotfix candidate [ ] reject [ ] revise.

V2 activation decision: [ ] remain inactive [ ] separately authorize a future reviewed activation.

The second line must remain unchecked during this local hotfix.
