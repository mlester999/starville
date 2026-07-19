# Phase 12D owner acceptance

Phase status: **PRODUCTION CANDIDATE, NOT FINAL**. Owner acceptance: pending. Every item is
intentionally unchecked.

Run this checklist against the exact local revision and record evidence. It authorizes no hosted
write, migration push, upload, activation, replacement, publication, deployment, commit, or Git
push.

## Review identity

- [ ] Record reviewer and timestamp
- [ ] Record exact HEAD and dirty-worktree diff identity
- [ ] Record V1 and V2 manifest checksums
- [ ] Record tested map/version/checksum and exact asset pins
- [ ] Record browser, operating system, viewport, zoom, quality, and motion settings
- [ ] Record screenshots and every unresolved observation

## Originality and art direction

- [ ] Confirm no commercial-game or marketplace artwork was copied
- [ ] Confirm character proportions, faces, hair, clothing, accessories, palettes, and silhouettes
      are original Starville work
- [ ] Confirm terrain, structures, crops, furniture, workstations, icons, landmarks, and effects
      share the approved Starville identity
- [ ] Confirm 96×48 projection, bottom-center grounding, upper-left light, lower-right shadow, warm
      palette, and non-pixel presentation
- [ ] Treat the generated character PNG as concept reference only

## Character matrix

- [ ] Inspect north idle, walk, and jog
- [ ] Inspect northeast idle, walk, and jog
- [ ] Inspect east idle, walk, and jog
- [ ] Inspect southeast idle, walk, and jog
- [ ] Inspect south idle, walk, and jog
- [ ] Inspect southwest idle, walk, and jog
- [ ] Inspect west idle, walk, and jog
- [ ] Inspect northwest idle, walk, and jog
- [ ] Confirm front, back, profile, and diagonal head/body turns are unambiguous
- [ ] Confirm near/far limbs, stride, arm swing, bob, and jog speed read correctly
- [ ] Confirm the foot remains planted at the world anchor without sliding
- [ ] Confirm shadow, nameplate, level, and chat bubble remain aligned
- [ ] Confirm local and remote players use the same pose vocabulary
- [ ] Confirm every supported body, skin, hair, outfit, and accessory combination remains readable
- [ ] Confirm Reduced Motion removes nonessential motion without hiding direction/state
- [ ] Record missing action animation; do not mark the character final while required actions are
      absent

## Terrain and environment

- [ ] Inspect grass base and variation without obvious checkerboard repetition
- [ ] Inspect dirt, path, plaza, dry/watered soil, bridge, and water
- [ ] Inspect path intersections and water/bridge edges
- [ ] Confirm terrain delivery matches exact immutable pins where present
- [ ] Force selected-terrain failure and confirm same-key bundled fallback
- [ ] Force bundled failure and confirm missing/procedural behavior without collision change
- [ ] Inspect trees, bushes, flowers, rocks, fences, lamps, signs, and boundary treatment
- [ ] Confirm no dark void or false walkable surface appears

## Buildings, stations, crops, furniture, and icons

- [ ] Inspect General Store silhouette, roof, walls, door, windows, sign, shadow, and interaction
- [ ] Inspect both cottage families and the personal-home entrance
- [ ] Inspect Cooking Hearth normal, active, and ready states
- [ ] Inspect Crafting Workbench normal, active, and ready states
- [ ] Inspect wardrobe mirror and wardrobe furniture
- [ ] Inspect empty/prepared/dry/watered/planted/selected/invalid farm plots
- [ ] Inspect every Moonbean, Sunroot, and Cloudberry growth stage and harvest-ready alias
- [ ] Inspect all enabled furniture and every supported quarter-turn
- [ ] Confirm unsupported rotations fail safely
- [ ] Inspect inventory, crop, seed, recipe, DUST, category, objective, quest, interaction, social,
      warning, success, and error icons at actual UI sizes
- [ ] Confirm authoritative states remain visually distinguishable

## Composer, Draft Preview, Admin, and Game Test

- [ ] Compare V1, V2 candidate, and controlled uploaded media on all four Admin backdrops
- [ ] Confirm comparison does not activate, approve, upload, or repin
- [ ] Place and rotate V2 identities in World Composer without changing stable keys
- [ ] Confirm anchors, footprint, collision, scale, and depth match Draft Preview
- [ ] Confirm Draft Preview exact map/version/checksum/pins fail closed on mismatch
- [ ] Open protected Game Test on the exact authorized revision
- [ ] Explicitly select the labeled local unpublished V2 candidate source
- [ ] Confirm non-Lantern sessions cannot select that local source
- [ ] Compare one/eleven players, depth, bubbles, labels, HUD, missing media, low quality, and
      Reduced Motion
- [ ] Confirm no fixture publishes, activates, progresses, rewards, joins public realtime, or
      persists acceptance

## Responsive and accessibility matrix

- [ ] 360 × 800
- [ ] 390 × 844
- [ ] 768 × 1024
- [ ] 820 × 1180
- [ ] 1024 × 768
- [ ] 1280 × 800
- [ ] 1440 × 900
- [ ] 1920 × 1080
- [ ] At every viewport, confirm no clipping, horizontal overflow, dark void, hidden prompt, or
      unusable safe-area control
- [ ] Complete keyboard-only review with visible focus and restoration
- [ ] Inspect at 200 percent browser zoom
- [ ] Confirm 44-pixel touch targets and actual touch behavior
- [ ] Complete screen-reader review of labels, status, comparison, and controls
- [ ] Confirm contrast and status do not rely on color alone

## Performance

- [ ] Record first meaningful render
- [ ] Record runtime and thumbnail network waterfall
- [ ] Confirm immutable V1/V2 cache behavior and no duplicate downloads
- [ ] Record desktop and mobile frame time
- [ ] Record browser/GPU and mobile memory
- [ ] Inspect eleven-player rendering and dense environment
- [ ] Confirm low quality and Reduced Motion remain usable
- [ ] Confirm no file or decoded frame exceeds the approved budget

## Classification decision

- [ ] For every V2 stable key, retain `production_candidate` or record `needs_refinement`,
      `needs_owner_replacement`, or `blocking`
- [ ] Record evidence for every proposed `FINAL` entry
- [ ] Confirm no generated or merely present file was promoted automatically
- [ ] Confirm the disabled Animal Care metadata remains disabled and unreleased
- [ ] Confirm no animal/livestock, NFT, marketplace, crypto reward, Fablesol, Pokentara, Sailana, or
      AIvanza feature entered the phase

Owner decision: [ ] accept candidate [ ] reject [ ] revise.

Final-art decision: [ ] no assets final [ ] selected assets final with attached per-key evidence.

Owner acceptance closure itself remains Phase 12E work. A local checklist does not authorize hosted
activation or publication.

The focused runtime-integration checklist is maintained separately in
`docs/deployment/phase-12d-runtime-hotfix-owner-review.md`; its items are also intentionally
unchecked.
