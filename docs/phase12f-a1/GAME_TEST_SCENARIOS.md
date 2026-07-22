# Phase 12F-A.1 isolated Game Test scenarios

Status: local, deterministic, nonpersistent fixture coverage. These scenarios do not authenticate a
player, connect realtime presence, or write player/world/database/storage/activation/publication
state. Final live observations were transient; the checked-in screenshots remain stale.

Start the game client locally and use:

`/?visual-candidate=production-slice-v3&visual-version=v3`

The explicit candidate gate works only in a development build on `localhost`, `127.0.0.1`, or
`[::1]`. Fixture query controls include `review-position`, `review-location`, `review-panel`,
`review-motion`, `review-motion-state`, `review-mobile`, `review-size`, and `diagnostics`.

|   # | Scenario                 | Fixture or procedure                                                                 | Current support / limitation                                             |
| --: | ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
|   1 | Large V3 exterior        | Base route; add `review-size=1440x900` or `1920x1080`                                | Both CSS-constrained sizes passed live; durable captures pending         |
|   2 | Player scale comparison  | `review-position=cottage-entry`                                                      | Constant/test support `0.336`; owner visual judgment pending             |
|   3 | Mature-tree scale        | `review-position=behind-pine` and `front-pine`                                       | Authored scales tested; current occlusion captures pending               |
|   4 | Grass variation          | Base route and `review-position=far-east`                                            | Deterministic material tests; seam/pattern acceptance pending            |
|   5 | Water and shoreline      | `review-position=water`                                                              | Live treatment observed; owner visual acceptance remains pending         |
|   6 | Cottage collision        | `review-position=cottage-entry&diagnostics=1`; walk and jog into walls               | Eight-direction solver test; manual blocking capture pending             |
|   7 | Bench collision          | `review-position=bench&diagnostics=1`; approach from eight directions                | Eight-direction footprint test; manual capture pending                   |
|   8 | Workbench collision      | `review-position=workbench&diagnostics=1`                                            | Eight-direction footprint test; manual capture pending                   |
|   9 | Fence collision          | `review-position=fence&diagnostics=1`                                                | Eight-direction footprint test; manual capture pending                   |
|  10 | Notice-board collision   | `review-position=notice&diagnostics=1`                                               | Eight-direction footprint test; manual capture pending                   |
|  11 | Tree-trunk collision     | `review-position=tree-trunk&diagnostics=1`                                           | Trunk-footprint test; manual capture pending                             |
|  12 | Player behind tree       | `review-position=behind-pine`                                                        | Geometry/fade unit tests; previous capture rejected                      |
|  13 | Player in front of tree  | `review-position=front-pine`                                                         | Geometry/fade unit tests; current capture pending                        |
|  14 | Player behind bench      | Begin at `review-position=bench`; approach from northwest                            | Layer policy test only; owner/browser confirmation pending               |
|  15 | Player in front of bench | Begin at `review-position=bench`; approach from southeast                            | Layer policy test only; owner/browser confirmation pending               |
|  16 | East movement            | `review-position=east-movement&review-motion=east&diagnostics=1`                     | Live east jog held facing; frames `1,3,1,3,2,4,1`; stored proof pending  |
|  17 | West movement            | `review-position=west-movement&review-motion=west&diagnostics=1`                     | Live west walk held facing; frames `1,3,1,3,4,2,1`; stored proof pending |
|  18 | Diagonal movement        | Set `review-motion` to `northeast`, `southeast`, `southwest`, or `northwest`         | Eight-octant/hysteresis tests; browser sequence pending                  |
|  19 | Walk matrix              | `review-panel=characters`                                                            | Live 633 ms sequence changed 16/24 cells; durable capture pending        |
|  20 | Jog matrix               | Character panel plus `review-motion=northeast&review-motion-state=jog&diagnostics=1` | North samples `9,11,9,11,9`; perceived-stride owner review pending       |
|  21 | Idle matrix              | `review-panel=characters`                                                            | North samples `3,3,0,0,1`; root/anchor validator passed                  |
|  22 | House entry              | `review-position=cottage-entry`; press `E` or use the interaction button             | Desktop and mobile passed without refresh; fixture only                  |
|  23 | House interior           | `review-location=interior`                                                           | 18×14 fixture captured transiently; runtime `MapId` remains exterior ID  |
|  24 | Interior collision       | `review-location=interior&diagnostics=1`; approach each solid footprint              | Required furniture eight-direction tests; browser captures pending       |
|  25 | House exit               | `review-location=interior`; approach door and press `E`/touch action                 | Desktop/mobile passed; returns to normalized cottage checkpoint          |
|  26 | Reconnect outside        | Reload the base route                                                                | Deterministic fixture reset only; **not a realtime reconnect test**      |
|  27 | Reconnect inside         | Reload with `review-location=interior`                                               | Deterministic fixture reset only; **not a realtime reconnect test**      |
|  28 | Mobile interaction       | Add `review-mobile=1`; use dedicated Enter/Exit controls at 390×844                  | Exact viewport passed live; stored/physical-device evidence pending      |
|  29 | Reduced Motion           | Enable Settings → Reduced Motion; inspect world, transition, and matrix              | Checkbox and resulting class verified live; owner review pending         |
|  30 | High contrast            | Add `diagnostics=1`; enable Settings → High Contrast                                 | Checkbox and resulting class verified live; owner review pending         |

## Additional catalog checks

`V3_OUTDOOR_LOCATION_MANIFEST_CATALOG` also defines local 3×-axis candidates for Moonpetal Meadow,
Brooklight Crossing, Hearthfield Road, and Whisperpine Gate. Tests verify canonical landmark/spawn
translation, safe approaches, scenic clusters, and blocking scenic bases. The review UI does not
provide selectable browser scenarios for those four maps, so their composition and camera behavior
still require dedicated visual review.

## Integration scenarios still missing

The isolated route cannot complete these required scenarios:

- authenticated identity, appearance, inventory, DUST, XP, quests, wallet access, rewards, and
  session preservation across entry/exit;
- public exterior presence removal on entry and restoration on exit;
- same-private-instance interior presence and owner/visitor permission behavior;
- reconnect inside/outside with one avatar and the correct location;
- persistence/reward deduplication;
- real remote-player parity with 10/20/40 connected-player fixtures.

Those must be tested through the authenticated, server-authoritative gameplay architecture after V3
has a safe local integration seam. Do not simulate them with fixture labels or claim them from a
page reload.
