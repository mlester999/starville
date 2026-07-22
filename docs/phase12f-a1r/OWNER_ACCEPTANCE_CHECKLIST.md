# Phase 12F-A.1R owner acceptance checklist

Open the live loopback review at:

`http://127.0.0.1:3001/?visual-candidate=production-slice-v3&visual-version=v3`

The task was left open on this page. V3 is local-only and unpublished.

## Composition and art

- [ ] The square, cottage, paths, bridges, stream, trees, fences, and hero props feel intentionally
      composed rather than sparse or sprinkled.
- [ ] The 48×40 world feels meaningfully larger than the old demo without making the hero area tiny
      or lost.
- [ ] Cottage, mature trees, player, furniture, and small vegetation have a believable scale
      hierarchy.
- [ ] Water reads immediately as stylized water at gameplay distance, including shallow/deep bands
      and the bridge transition.
- [ ] The illustrated non-pixel art direction is premium enough to continue toward later production
      phases.

## Movement and gameplay feel

- [ ] Move right/east and left/west; confirm the avatar faces the matching direction with no
      inversion.
- [ ] Hold movement and watch a complete walk cycle; confirm the feet progress and the character
      does not remain in a static walking pose.
- [ ] Toggle Jog and repeat; confirm jog is faster and visually distinct from walk.
- [ ] Test diagonals and confirm their visual direction matches travel.
- [ ] Walk into the cottage, fence, bench, notice board, workbench, trees, lamp, and rocks; confirm
      solid objects block with comfortable footprints.

## Depth, house, and camera

- [ ] Walk behind and in front of mature trees; confirm the player remains readable and the canopy
      fades only when appropriate.
- [ ] Approach the cottage from the side/front; confirm the player cannot clip halfway into the
      house.
- [ ] Use Enter Home; confirm the transition lands at the furnished interior entry without a page
      refresh.
- [ ] Move around the bed, table, chairs, storage, wardrobe, fireplace, counter, lamp, and plant;
      confirm room collision and foreground fading feel coherent.
- [ ] Use Exit Home; confirm the player returns to the exterior doorstep.
- [ ] Confirm outdoor framing presents the hero area and the interior fills the desktop view without
      a giant void.

## Mobile sanity

- [ ] At 390×844, confirm directional controls, Jog, action button, profile, chat, and hotbar remain
      usable and do not obscure the core interaction.
- [ ] Enter and exit the cottage using the touch action.
- [ ] Move inside and confirm the portrait camera follows at a useful zoom instead of fitting the
      entire room into a tiny view.

## Release boundary

- [x] V1 remains the published/default path.
- [x] V3 is loopback-only, inactive, additive, and unpublished.
- [x] One polished base character remains in scope; Phase 12F-B was not started.
- [x] No hosted write, migration push, deployment, commit, or Git push occurred.

Owner decision:

- [ ] Accept Phase 12F-A.1R as the rescued local art candidate.
- [ ] Request a bounded follow-up with exact visual changes.
