# Phase 12F-A.1R browser evidence

All images were captured from the local loopback-only V3 route after the final implementation and
production build.

| File                                          | Proof                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `01-desktop-exterior-1904x1080.jpg`           | Full hero composition, scale hierarchy, plaza, cottage, path, stream, bridge, and HUD.                    |
| `02-water-bridge-1440x900.jpg`                | Deep/shallow water bands, surface texture, stream shape, bridge disturbances, and bank relationship.      |
| `03-desktop-interior-1904x1080.jpg`           | Bounded furnished room and desktop camera framing.                                                        |
| `04-east-facing-diagnostics-1440x900.jpg`     | East-facing avatar and runtime direction diagnostics.                                                     |
| `05-west-facing-diagnostics-1440x900.jpg`     | West-facing avatar and runtime direction diagnostics.                                                     |
| `06-entered-interior-transition-1440x900.jpg` | Actual Enter Home result, interior spawn, settled runtime, collision count, and Exit Home affordance.     |
| `07-cottage-collision-entry-1440x900.jpg`     | Player stopped outside the cottage façade with three nearby collision shapes and an aligned entry action. |
| `08-tree-occlusion-behind-1440x900.jpg`       | Pine canopy fades while the player is behind it.                                                          |
| `09-tree-occlusion-front-1440x900.jpg`        | Pine stays opaque while the player is in front.                                                           |
| `10-mobile-exterior-390x844.jpg`              | Portrait outdoor framing, directional pad, jog, action, HUD, and hotbar.                                  |
| `11-mobile-interior-390x844.jpg`              | Portrait follow camera, furnished interior, occlusion, controls, and touch Exit Home action.              |

The final browser console warning/error query returned an empty array. Desktop and touch entry/exit
were performed live; both transitions returned to a settled runtime without page navigation.
