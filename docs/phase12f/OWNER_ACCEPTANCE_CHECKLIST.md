# Phase 12F-A owner acceptance checklist

Do not check these items until the owner personally reviews the local candidate. Automated
validation does not satisfy visual acceptance.

## Art direction

- [ ] Compare V1, rejected V2, and Phase 12F-A.
- [ ] Confirm Phase 12F-A is meaningfully different.
- [ ] Confirm the style feels premium.
- [ ] Confirm the style feels original.
- [ ] Confirm the style fits Starville.

## Character

- [ ] Inspect face and hair.
- [ ] Inspect outfit.
- [ ] Inspect proportions.
- [ ] Inspect front.
- [ ] Inspect back.
- [ ] Inspect sides.
- [ ] Inspect diagonals.
- [ ] Walk all directions.
- [ ] Jog all directions.
- [ ] Stop in all directions.
- [ ] Confirm no sliding.
- [ ] Confirm no anchor jump.
- [ ] Confirm no frame identity drift.

## Environment

- [ ] Inspect grass.
- [ ] Inspect path.
- [ ] Inspect plaza.
- [ ] Inspect water.
- [ ] Inspect building.
- [ ] Inspect trees.
- [ ] Inspect bushes.
- [ ] Inspect flowers.
- [ ] Inspect notice board.
- [ ] Inspect lamp.
- [ ] Inspect fence.
- [ ] Inspect rocks.
- [ ] Inspect bench.
- [ ] Inspect shadows.
- [ ] Inspect lighting.

## Composition

- [ ] Confirm the primary landmark.
- [ ] Confirm the readable route.
- [ ] Confirm intentional negative space.
- [ ] Confirm there is no random prop placement.
- [ ] Confirm there is no giant empty plaza.
- [ ] Confirm there is no awkward building crop at the intended review viewports.

## HUD

- [ ] Confirm compact presentation.
- [ ] Confirm the objective does not dominate.
- [ ] Confirm the location label is appropriately compact/transient.
- [ ] Confirm controls are compact.
- [ ] Confirm the hotbar is smaller.
- [ ] Confirm status is compact.
- [ ] Confirm chat is minimized.
- [ ] Confirm gameplay remains visible.

## Modal

- [ ] Open the notice board.
- [ ] Confirm the modal matches the art direction.
- [ ] Confirm the modal is sharp.
- [ ] Confirm the backdrop is restrained.
- [ ] Confirm close and Escape behavior.
- [ ] Confirm focus restoration.

## Responsive and accessibility

- [ ] Review at 1440 × 900 desktop.
- [ ] Review at 1920 × 1080 desktop.
- [ ] Review at 820 × 1180 tablet.
- [ ] Review at 390 × 844 mobile.
- [ ] Review High Contrast.
- [ ] Review Reduced Motion.
- [ ] Review the 200% layout-equivalent checkpoint.

## Safety

- [ ] Confirm V1 remains unchanged and the normal default.
- [ ] Confirm rejected V2 remains unchanged and inactive.
- [ ] Confirm Phase 12F-A remains local and unpublished.
- [ ] Confirm no hosted activation occurred.
- [ ] Confirm no world publication occurred.
- [ ] Confirm no hosted write occurred.

## Review routes

Start the local game client on its normal repository port, then open:

- Candidate: `http://localhost:3001/?visual-candidate=production-slice-v3`
- Character matrix:
  `http://localhost:3001/?visual-candidate=production-slice-v3&review-panel=characters`
- V1/V2/V3 comparison:
  `http://localhost:3001/?visual-candidate=production-slice-v3&review-panel=comparison`
- Behind pine checkpoint:
  `http://localhost:3001/?visual-candidate=production-slice-v3&review-position=behind-pine`
- In front of pine checkpoint:
  `http://localhost:3001/?visual-candidate=production-slice-v3&review-position=front-pine`
- Cottage entrance checkpoint:
  `http://localhost:3001/?visual-candidate=production-slice-v3&review-position=cottage-entry`

Use the V1/V2/V3 buttons at identical viewport and camera scale. Use WASD or arrows to walk, hold
Shift to jog, and release movement to inspect last-facing idle. Press E or the interaction prompt to
open the notice. Open Settings to inspect Reduced Motion and High Contrast. Do not activate or
publish the candidate during review.
