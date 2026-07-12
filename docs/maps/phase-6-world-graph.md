# Phase 6 development world graph

## Graph

| Map                 | Identity and visual purpose                                   | Active route                                                                  | Approved arrival                             |
| ------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| Lantern Square      | Village center, cottages, lamps, paths, stream, bridge, signs | North → Moonpetal; East → Brooklight; South → Hearthfield; West → Whisperpine | `default`, plus `from-north/east/south/west` |
| Moonpetal Meadow    | Moonlit flowers, stone marker, meadow path, pond              | South → Lantern Square                                                        | `from-south`, facing north                   |
| Brooklight Crossing | River, broad bridge, crossing lamp and sign                   | West → Lantern Square                                                         | `from-west`, facing east                     |
| Hearthfield Road    | Warm orchard-edge road, fences and lantern                    | North → Lantern Square                                                        | `from-north`, facing south                   |
| Whisperpine Gate    | Dense pines, forest gate, stone path                          | East → Lantern Square                                                         | `from-east`, facing west                     |

Every map has exactly four directional exit slots. The three inactive routes on each outer map have
null destinations, blocking collision, and visible closed-route markers. They cannot trigger travel.

## Coordinate and safety rules

- Map geometry uses logical world coordinates and an isometric projection; no map is a flattened
  background image.
- Exit rectangles sit at the matching map edge and must have a walkable center.
- Destination spawns are enabled `transition-entry` spawns, lie inside safe-save bounds, remain
  clear of collision, face inward in the travel direction, and do not overlap an active exit
  trigger.
- Each enabled destination has an enabled return route to its source.
- Lantern Square retains the accepted Phase 4 capsule house footprints, swept collision,
  water/bridge behavior, fences, lamps, trees, rocks, and welcome notice.

## Development art

All five maps use original antialiased procedural development art rendered from terrain and object
layers. The palettes are deliberately distinct (`village`, `meadow`, `brook`, `hearth`, `forest`)
but temporary. They use no pixel art, voxel art, previous-project assets, crypto/casino graphics, or
copyrighted game art.

## Acceptance still requiring an authenticated owner session

Travel all four Lantern exits and return, verify each map HUD/camera/collision/notice, refresh
inside an outer map, confirm resume, test disabled paths and transition-loop prevention, and confirm
no wallet transaction prompt. Automated graph, manifest, API, stale-save, and runtime-swap tests do
not replace this visual/gameplay acceptance.
