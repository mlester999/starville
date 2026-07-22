# Phase 12F-A.1 asset provenance

Status: local V3 candidate art; unpublished; owner review required. The word `approved` in the local
asset-validation catalog means “allowed by the candidate manifest”; it is not owner visual approval
or authorization to publish.

## Generation source

Both A.1 sheets were newly generated with OpenAI's built-in image generation tool for this
repository task. They are not copied from a third-party pack and have no external license
dependency. The generated outputs are treated as original project candidate art under the
repository's existing `UNLICENSED` status.

### Terrain variation sheet

Prompt intent: a strict 4×3 modular 2:1 isometric diamond sheet matching Starville V3, containing
base/light/dark/worn grass; clover/flowers/path-edge/shore grass; deep/shallow/shore/disturbance
water; flat magenta background; no pixel art, text, extrusion, or flattened world composition.

- Chroma reference: `assets/references/phase12f-a1/starville-v3-terrain-variation-sheet-chroma.png`
- Chroma SHA-256: `465562469b1c90b5eff5c44a72c5b3e587bbd4ed846bf8cf471aa999f543436b`
- Transparent working sheet: `assets/source-v3/sheets/terrain-a1.png`
- Transparent SHA-256: `c840595d6c546466cf895386fa442edb6ce4ed991a5d017b027a841d820bdad9`

### Interior modular sheet

Prompt intent: a strict 4×4 modular sheet matching Starville V3 with floor, wall, door, bed, bedside
table, dining table/chair, chest, wardrobe, rug, window, fireplace, cooking counter, wall art, lamp,
and plant; flat magenta background; no text, pixel art, or flattened room.

- Chroma reference: `assets/references/phase12f-a1/starville-v3-interior-sheet-chroma.png`
- Chroma SHA-256: `a9b626113f7af12e7a6c96c13330b499c3321f28a5638ab74b3e8440698d3148`
- Transparent working sheet: `assets/source-v3/sheets/interior-a1.png`
- Transparent SHA-256: `e4bed39a48fdfac4f22a94932d161233762fe3c257ef48021bb6f39b062a0771`

## Processing

The image-generation skill's repository helper `remove_chroma_key.py` removed the magenta background
with an edge-contract value of `1`. `phase12f-source-art.ts` then crops the fixed grids, normalizes
transparent cutouts to manifest dimensions, writes deterministic PNG sources, and lets the normal
asset pipeline produce WebP runtime and thumbnail outputs.

No external URL, stock image, downloaded texture, hidden prompt asset, or hosted storage object is
used by these sheets. Asset keys remain stable and V3 paths are additive. The repository pipeline
implements integrity, dimension, alpha, deterministic-byte, budget, orphan, manifest, thumbnail,
coverage, and avatar-atlas checks. The latest asset regeneration, validation, manifest, thumbnail,
coverage, and drift checks passed. The final bounded-concurrency repository gate also passed; that
engineering result does not imply owner visual approval or production readiness.

## Repository-input boundary

The four hashed files above are the selected A.1 sheet inputs/working sheets in the repository.
Later experimental terrain replacements that did not satisfy seam and art review were not copied
into the repository and are not pipeline inputs. They do not supersede the hashes in this document.

The current V3 manifest is version `3.1.0` and lists 46 asset identities. The current size report
lists 46 source PNGs, 46 runtime WebPs, and 46 thumbnails (138 files total) with no missing or
over-budget files. The latest asset check verified the report and found no drift.

## Generated-art limitations

The owner must still review seams, regional color balance, shoreline readability, furniture
consistency, and style fit at real gameplay scale. Generated status does not imply production
approval.
