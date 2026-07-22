# Phase 12F-A.1 browser and animation evidence

Status: **STORED ARTIFACT SET STALE; FINAL IN-TASK LIVE QA RECORDED BELOW**.

The 27 JPEG files under `docs/phase12f-a1/evidence/` are retained as historical local engineering
captures. They predate the latest 72×60 world/profile correction, 47-object/70-collision specialized
manifest, wave-column river, environmental boundary frame, interior wall/door fade, transition
hardening, shifted review checkpoints, mobile action controls, and four-unique-frame idle rebuild.
They must not be cited as current browser QA, owner acceptance, authenticated integration, or
production performance evidence.

Base route for a new capture pass:

`http://localhost:3101/?visual-candidate=production-slice-v3&visual-version=v3`

The route works only in a development build on a loopback host. Port 3101 reflects the current local
QA session; the port is not part of the product contract.

## Final in-task live browser observations

The final local browser pass produced transient, actual CSS-constrained 1440×900 and 1920×1080
captures. They were observed during this task but were not saved over the stale repository JPEGs:

- At the 1440×900 water checkpoint, diagnostics reported 1,664/4,320 terrain cells, 27/72 chunks,
  43/135 auxiliary nodes, and 25/47 objects visible.
- Desktop and exact 390×844 mobile Enter/Exit succeeded without a browser refresh; both mobile
  exterior and interior states were captured transiently.
- Reduced Motion and High Contrast checkboxes and their resulting document classes were verified.
- In a timed 633 ms character-matrix sequence, 16 of 24 cells changed frame.
- Five north-facing samples were idle `3,3,0,0,1`, walk `5,7,4,6,7`, and jog `9,11,9,11,9`.
- Live west walk held west-facing position and sampled frames `1,3,1,3,4,2,1`.
- Live east jog held east-facing position and sampled frames `1,3,1,3,2,4,1`.

These observations support the local fixture behavior only. They are not durable repository
artifacts, physical-device results, authenticated/realtime evidence, or owner acceptance. The water
treatment and broad world composition still require owner judgment.

## Retained artifact inventory

| Files                | Historical intent                              | Current disposition                                                                     |
| -------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `01`–`03`            | desktop world size, camera, and culling        | Superseded by 72×60 and environmental-frame changes                                     |
| `04`–`09`            | exterior prompts and static collision overlays | Useful only as checkpoint references; still images do not prove blocking                |
| `10`–`11`            | tree behind/front ordering                     | Rejected as proof: capture 10 fully hides the avatar and predates the new fade policy   |
| `12`–`15`            | interior, transition, exit, return             | Predate transition and interior occlusion hardening; no authenticated state is shown    |
| `16`–`19`            | animation matrix and Reduced Motion            | Predate the rebuilt four-unique-frame idle source; stills cannot prove no skating       |
| `20`                 | high-contrast diagnostic overlay               | Historical only                                                                         |
| `21`–`22`            | 390×844 exterior/interior                      | Predate the dedicated mobile Enter/Exit action validation; not physical-device evidence |
| `23`–`25`, `27`–`28` | east/west walk and northeast jog frames        | Historical frame checkpoints; numbering has no `26` artifact                            |

## Evidence that exists outside screenshots

Current repository contracts and focused tests establish the following engineering facts:

- Lantern Square is 72×60 and the other four canonical outdoor candidates are 60×54.
- The specialized Lantern fixture has 47 objects and 70 collision shapes.
- The interior is a separate 18×14 local world with 29 objects and 16 collision shapes.
- Exterior solid categories and required interior furniture are exercised from eight approach
  directions at walk- and jog-sized deltas.
- The direction resolver supports eight octants with hysteresis; remote visual gait derives from
  interpolated velocity.
- The atlas declares 96 frames / 24 mappings, and the asset validator requires four decoded-pixel-
  unique frames plus no more than one pixel of vertical foot-row drift for every mapping. Idle
  mappings also retain one lower-body root and horizontal foot anchor.
- The transition component tests duplicate suppression, cancellation/error recovery, destination
  matching, version-switch reset, and diagnostics.

Those are automated facts, not replacements for required visual proof.

## Required repository recapture

A durable artifact set must capture the final code at minimum for:

- 1440×900 and 1920×1080 exterior views;
- camera travel far from spawn, each relevant boundary, and visible/culled counts for 4,320 terrain
  nodes and 47 objects;
- player scale beside the cottage and mature trees;
- grass variation, perimeter framing, river bank, water motion, Reduced Motion water, and both
  bridge corridors;
- actual blocked movement—not only debug footprints—at cottage, tree, bench, workbench, fence,
  notice board, rocks, water, bridge boundaries, and interior furniture;
- behind/in-front tree, cottage, bench, table, wardrobe, fireplace, wall, and door cases without
  half- or full-body disappearance;
- all eight movement directions, east/west agreement, idle-facing preservation, walk frame sequence,
  jog frame sequence, and four-frame idle sequence with frame index/timer visible;
- Enter Home, fade/loading, furnished interior, Exit Home, return position, transition focus, and no
  refresh;
- exact 390×844 touch entry and exit, tablet, 200% zoom, high contrast, and Reduced Motion.

Animation proof must be a timed frame sequence, inspector capture sequence, or repository-supported
video—not one still per state. Physical-mobile performance, authenticated state preservation,
location-scoped realtime presence, and reconnect require separate evidence from the actual
integrated gameplay path.

## Acceptance boundary

No current repository screenshot proves:

- authenticated identity/inventory/DUST/progression/wallet/session preservation;
- server-authoritative transition or persistence behavior;
- exterior/interior realtime presence separation;
- reconnect without duplicate avatars;
- production or physical-device performance;
- owner acceptance.

Until the repository recapture, integration work, and owner review above are complete, acceptance
evidence status is **pending**.
