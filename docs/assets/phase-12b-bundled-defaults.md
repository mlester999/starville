# Phase 12B bundled defaults

The Starville bundled pack is a repository-owned, deterministic visual baseline. It lets the game,
World Composer, farming, housing, onboarding, and Game Test resolve stable visual identities without
an Admin upload. Uploaded versions remain optional overrides.

## Inventory and coverage

Manifest version `1.0.0` contains 106 unique logical entries, 19 authored variant records, and 7
compatibility aliases. The generator emits 118 SVG sources, 118 runtime WebP files, and 99 WebP
thumbnails: 335 expected files in total.

| Manifest category | Logical entries |
| ----------------- | --------------: |
| boundary          |               3 |
| crop              |              19 |
| farming           |               9 |
| furniture         |               7 |
| interaction       |              16 |
| interior          |               2 |
| inventory         |              15 |
| lighting          |               1 |
| nature            |               6 |
| recipe            |               5 |
| shop              |               2 |
| signage           |               3 |
| structure         |               9 |
| terrain           |               9 |

Coverage includes the current terrain and world catalog; Lantern Square structures and
interactables; dry, prepared, planted, watered, selected, and invalid farm plots; every existing
Moonbean, Sunroot, and Cloudberry growth stage; the six enabled furniture definitions with authored
quarter-turn variants; current item/seed/recipe icons; and guidance/social/validation markers. The
aliases retain existing Phase 7 stable keys while pointing at canonical generated media.

The pack does not add crops, furniture mechanics, animals, livestock, economy logic, or crypto
rewards.

## Repository layout

```text
assets/
  source/<category>/*.svg
  starville/bundled/v1/<category>/*.webp
  starville/bundled/v1/thumbnails/<category>/*.webp
  manifests/starville-bundled-v1.json
  reports/starville-bundled-coverage.json
  reports/starville-bundled-sizes.json
packages/
  asset-management/src/bundled-assets.ts
  asset-management/src/resolver.ts
  asset-pipeline/src/
```

SVG is the editable, reproducible source. Lossless WebP is the runtime format because world art
needs alpha transparency. Thumbnails are 192 by 192 WebP with a transparent contain fit. Generated
files are written only when their bytes change; the pipeline uses no network and does not inspect or
modify user uploads.

## Manifest contract

Every logical entry records a stable key, type/category, human label and description, source and
runtime paths, thumbnail, dimensions/aspect ratio, normalized anchor/foot/depth points, footprint,
collision, optional interaction point/radius, layer, animation fields, directions/rotations,
variants, recommended scale, tags, accessibility label, bundled version, replacement policy,
fallback key, critical groups, usage locations, quality status, optional alias, and deterministic
generator recipe.

The schema requires:

- game identity `starville`, manifest version `1.0.0`, and 96 by 48 isometric projection;
- unique stable keys and declared fallback/alias targets;
- valid bounds and collision metadata;
- a declared default rotation contained in the supported rotations;
- variant rotations contained in the same supported set;
- at most 160 logical entries to prevent low-value pack growth;
- `technical_baseline` quality status on every current entry.

`system.missing-asset` is the stable final fallback. It has a predictable 192 by 192 transparent
canvas and an accessible label. Normal renderer diagnostics report the logical key and safe request
context, never a private storage or filesystem path.

## Commands

Run from the repository root:

```bash
pnpm assets:generate
pnpm assets:validate
pnpm assets:manifest
pnpm assets:thumbnails
pnpm assets:coverage
pnpm assets:check
```

`assets:generate` writes the complete deterministic set. `assets:manifest`, `assets:thumbnails`, and
`assets:coverage` rebuild their bounded outputs. `assets:validate` and `assets:check` are read-only;
`assets:check` renders the expected bytes in memory and fails on drift without repairing it, which
is suitable for CI. The commands are local-only and perform no Supabase, storage, activation,
publication, deployment, or other hosted write.

Validation checks the typed manifest, safe and case-sensitive paths, required files, WebP format,
SVG external-content denial, dimensions, alpha transparency and margins, static/animation metadata,
frame capacity/divisibility, anchors, footprint/collision bounds, aliases/fallback cycles, the
bounded 22-key current-world and 76-key gameplay reference sets, per-file/total budgets, orphans,
exact generated-byte drift, and stale manifest/coverage/size reports. Runtime and thumbnail reports
include SHA-256 hashes for exact cache and drift evidence.

## Size and performance report

The checked-in local report currently records:

| Material                 |   Files |         Bytes |
| ------------------------ | ------: | ------------: |
| Editable SVG sources     |     118 |       135,969 |
| Runtime WebP textures    |     118 |       556,608 |
| WebP thumbnails          |      99 |       467,048 |
| **Total generated pack** | **335** | **1,159,625** |

The total budget is 16,777,216 bytes. No expected file is missing, no file exceeds its budget, and
the largest file is `lamp-star` runtime material at 20,480 bytes. Per-file budgets are 48 KiB for
terrain and thumbnails, 64 KiB for interface runtime art, 160 KiB for object runtime art, 256 KiB
for structure runtime art and SVG sources.

Runtime planning figures use unique WebP paths so aliases are not double-counted:

| Set                                      | Logical entries | Textures | Compressed bytes | Upper-bound decoded RGBA |
| ---------------------------------------- | --------------: | -------: | ---------------: | -----------------------: |
| Published Lantern Square initial preload |         16 keys |       17 |          101,718 |                3,219,456 |
| Full Lantern Square critical group       |              26 |       27 |          171,088 |                5,318,656 |
| Personal-home critical group             |              54 |       66 |          273,276 |               10,037,248 |
| Farming critical group                   |              35 |       28 |           79,664 |                2,562,048 |
| Housing critical group                   |               7 |       25 |           99,504 |                3,981,312 |
| Interface critical group                 |              39 |       39 |          176,984 |                3,293,184 |

The 37 assets whose render layer is specifically `interface` occupy 159,454 compressed bytes. All
118 runtime textures together would decode to an estimated 17,176,576 RGBA bytes (about 16.38 MiB),
but the Game Client does not intentionally preload the complete catalog: it queues current world
keys and terrain; other UI, furniture, crop stages, comparison images, and Game Test galleries load
on demand. These are asset-only estimates, not total browser/GPU memory measurements.

Phaser de-duplicates selected cache identities. Browser duplicate-download behavior and first
meaningful render still require manual desktop/tablet/mobile network inspection; no local report is
presented as production CDN evidence.

## Replacement and preservation

Map and gameplay code refer to the stable key, never a generated filename. An eligible uploaded
override changes only the resolved media and cache identity. Exact immutable pins stay exact.
Restoring the bundled default changes the protected active source state while preserving uploaded
history, validation evidence, derivatives, audits, and placed-object coordinates.

No existing user-owned artwork was overwritten. The generated pack uses original repository-local
technical shapes and no downloaded commercial or identifiable external game art. Final art review
and replacement priority remain owner decisions.
