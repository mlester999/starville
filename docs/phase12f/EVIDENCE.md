# Phase 12F-A browser evidence

All files below are actual browser captures from the loopback-only review route. QA used port 3101
because port 3001 was already occupied by an unrelated local process; the repository's documented
owner route remains port 3001.

| Checkpoint                                                                       | Evidence                                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Desktop 1440 × 900                                                               | `evidence/production-slice-v3-1440x900.png`                     |
| Desktop 1920 × 1080                                                              | `evidence/production-slice-v3-1920x1080.png`                    |
| Tablet 820 × 1180                                                                | `evidence/production-slice-v3-820x1180.png`                     |
| Mobile 390 × 844                                                                 | `evidence/production-slice-v3-390x844.png`                      |
| 24 character state mappings                                                      | `evidence/production-slice-v3-character-matrix.png`             |
| Player behind pine                                                               | `evidence/production-slice-v3-player-behind-tree.png`           |
| Player in front of pine                                                          | `evidence/production-slice-v3-player-front-tree.png`            |
| Player at cottage entrance                                                       | `evidence/production-slice-v3-player-cottage-entry.png`         |
| Notice modal                                                                     | `evidence/production-slice-v3-notice-modal.png`                 |
| Reduced Motion + High Contrast                                                   | `evidence/production-slice-v3-reduced-motion-high-contrast.png` |
| 200% layout equivalent (720 × 450 CSS viewport for 1440 × 900 physical viewport) | `evidence/production-slice-v3-200-percent-zoom.png`             |
| V1 preserved                                                                     | `evidence/production-slice-v1-preserved.png`                    |
| Rejected V2 preserved                                                            | `evidence/production-slice-v2-preserved.png`                    |
| Equal-scale V1/V2/V3 comparison                                                  | `evidence/production-slice-v1-v2-v3-comparison.png`             |

The character matrix shows idle, walk, and jog in N, NE, E, SE, S, SW, W, and NW. Each visible cell
is the first frame of a four-frame mapping; atlas metadata and tests validate all 96 frames. Browser
inspection also confirmed the notice dialog focus trap, Escape close, responsive touch controls,
explicit unpublished label, disabled persistence label, and an empty browser console diagnostic log.
