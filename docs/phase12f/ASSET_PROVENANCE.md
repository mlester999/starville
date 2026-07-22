# Phase 12F-A asset provenance

All new Phase 12F-A painted media was generated specifically for this Starville repository during
this task, then cleaned, cropped, normalized, composited, and exported by the repository pipeline.
No downloaded asset pack, commercial-game artwork, stock art, or unverified third-party media is
included.

## Generated reference sheets

| Repository reference                                                           | Generation mode       | Purpose                                                                            |
| ------------------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------- |
| `assets/references/phase12f/starville-production-environment-sheet-chroma.png` | New raster generation | Cottage, vegetation, notice board, lamp, fence, rocks, bench, workstation, planter |
| `assets/references/phase12f/starville-production-terrain-sheet-chroma.png`     | New raster generation | Grass, variation, dirt/path, plaza, water, bridge terrain vocabulary               |
| `assets/references/phase12f/starville-production-walk-sheet-chroma.png`        | New raster generation | Four-phase directional walking source bands                                        |
| `assets/references/phase12f/starville-production-jog-sheet-chroma.png`         | New raster generation | Four-phase directional jogging source bands                                        |

The idle direction source is the pre-existing repository reference
`assets/references/phase12d/starville-character-eight-direction-reference.png`. It remains a
repository-authored Starville reference and is not an external download.

## Prompt record

The environment request described an original premium cozy storybook-gouache Starville asset sheet
with a strict 2:1 isometric camera, deep moss-brown painted outlines, warm cream/amber/sage/teal
palette, upper-left warm key light, lower-right soft shadows, dimensional wood/stone/foliage, clean
modular cutouts on a uniform chroma background, and no pixel art, vectors, text labels, logos,
photorealism, or plastic 3D rendering.

The terrain request described eight original modular 2:1 isometric diamonds for mottled grass,
clover variation, worn dirt/path, warm plaza stone, restrained teal water, and a wooden bridge; it
required compatible edges, subtle texture, upper-left light, lower-right shading, chroma separation,
and no noisy white-wave repetition or aggressive checkerboard outlines.

The walk and jog requests described the same copper-haired Starville adventurer in the same moss
scarf/cape, layered ochre tunic, cream sleeves, green trousers, boots, pouches, and brass accent.
They required coherent front/side/back/diagonal body rotation, clear contact/passing/stride poses,
separated legs, arm swing, stable scale and foot anchor, consistent upper-left light, clean chroma
background, and no black background, cropped limbs, labels, pixel art, vector-doll forms, or
identity drift.

Original generation outputs were produced through the configured OpenAI image-generation tool in
generate-new mode. Working outputs were copied into the repository references before cleanup; the
tool's transient source locations were:

- Environment:
  `/Users/marklesteracak/.codex/generated_images/019f79ee-3f7b-7011-a46b-91415fb4e035/exec-4bc27cf0-eca7-40ee-b4ca-366b16097303.png`
- Terrain:
  `/Users/marklesteracak/.codex/generated_images/019f79ee-3f7b-7011-a46b-91415fb4e035/exec-84719621-55a2-4d8a-b0fb-038bc68d5d5c.png`
- Walk:
  `/Users/marklesteracak/.codex/generated_images/019f79ee-3f7b-7011-a46b-91415fb4e035/exec-4fcc71d6-12e5-4c46-b7d2-3789a274f646.png`
- Jog:
  `/Users/marklesteracak/.codex/generated_images/019f79ee-3f7b-7011-a46b-91415fb4e035/exec-97c1526d-7745-4512-9d47-9125cdcc5a55.png`

An earlier walk-layout attempt at `exec-93f14d2d-f612-4c56-8181-9bc4b235723c.png` was rejected and
is not a repository input.

## Cleanup and export

The image-generation skill's chroma-removal helper produced transparent working sheets.
`packages/asset-pipeline/src/phase12f-source-art.ts` then isolates the principal alpha component,
removes stray sheet material, trims transparent bounds, normalizes scale and bottom anchors,
constructs terrain underlays, builds the 96-frame atlas, and exports deterministic source/runtime
files.

World sources are transparent PNGs under `assets/source-v3`; world runtime assets and thumbnails are
WebP under `assets/starville/bundled/v3`. The avatar source is PNG and the runtime atlas is
quality-92 WebP with full-quality alpha. Manifests contain source/runtime paths, dimensions,
anchors, mappings, and SHA-256 integrity metadata.

## License and ownership status

The new visual media is task-specific generated work and repository-authored processing output. No
attribution-dependent or third-party licensed asset is present. The owner should retain this
provenance record with any later art handoff and obtain the usual project/legal review before
commercial release.
