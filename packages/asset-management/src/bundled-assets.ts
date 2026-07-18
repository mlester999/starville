import { z } from 'zod';

import {
  assetAnchorSchema,
  assetCollisionProfileSchema,
  assetIdentifierSchema,
  assetRotationSchema,
} from './contracts';
import { assetCategorySchema, assetTypeSchema } from './profiles';

export const STARVILLE_BUNDLED_MANIFEST_VERSION = '1.0.0' as const;
export const STARVILLE_BUNDLED_PUBLIC_ROOT = '/assets/starville/bundled/v1' as const;

export const bundledAssetRenderLayerSchema = z.enum([
  'ground',
  'ground_detail',
  'object',
  'structure',
  'foreground',
  'interface',
]);
export type BundledAssetRenderLayer = z.infer<typeof bundledAssetRenderLayerSchema>;

export const bundledAssetCriticalGroupSchema = z.enum([
  'lantern_square',
  'personal_home',
  'farming',
  'housing',
  'interface',
  'game_test',
]);
export type BundledAssetCriticalGroup = z.infer<typeof bundledAssetCriticalGroupSchema>;

export const bundledAssetGeneratorSchema = z
  .object({
    kind: z.string().regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u),
    variant: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/u),
    palette: z.enum(['amber', 'sage', 'meadow', 'moon', 'hearth', 'stone', 'system']),
    stage: z.number().int().min(0).max(8).nullable(),
  })
  .strict();

export const bundledAssetVariantSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/u),
    rotation: assetRotationSchema.nullable(),
    state: z
      .string()
      .regex(/^[a-z][a-z0-9_-]*$/u)
      .nullable(),
    sourcePath: z.string().regex(/^assets\/source\/[a-z0-9_./-]+\.svg$/u),
    runtimePath: z.string().regex(/^\/assets\/starville\/bundled\/v1\/[a-z0-9_./-]+\.webp$/u),
  })
  .strict();
export type BundledAssetVariant = z.infer<typeof bundledAssetVariantSchema>;

export const bundledAssetEntrySchema = z
  .object({
    key: assetIdentifierSchema,
    assetType: assetTypeSchema,
    category: assetCategorySchema,
    displayName: z.string().trim().min(1).max(100),
    description: z.string().trim().min(8).max(280),
    sourceType: z.literal('bundled_svg'),
    sourcePath: z.string().regex(/^assets\/source\/[a-z0-9_./-]+\.svg$/u),
    runtimePath: z.string().regex(/^\/assets\/starville\/bundled\/v1\/[a-z0-9_./-]+\.webp$/u),
    thumbnailPath: z
      .string()
      .regex(/^\/assets\/starville\/bundled\/v1\/thumbnails\/[a-z0-9_./-]+\.webp$/u),
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
    aspectRatio: z.number().positive().max(8),
    anchor: assetAnchorSchema,
    footAnchor: assetAnchorSchema,
    depthAnchor: assetAnchorSchema,
    footprint: z
      .object({
        width: z.number().finite().positive().max(64),
        height: z.number().finite().positive().max(64),
      })
      .strict(),
    collision: assetCollisionProfileSchema,
    interactionAnchor: assetAnchorSchema.nullable(),
    interactionRadius: z.number().nonnegative().max(8),
    renderLayer: bundledAssetRenderLayerSchema,
    animated: z.boolean(),
    frameWidth: z.number().int().positive().nullable(),
    frameHeight: z.number().int().positive().nullable(),
    frameCount: z.number().int().positive().max(32),
    frameDurationMs: z.number().int().min(16).max(10_000),
    loopMode: z.enum(['none', 'loop', 'ping_pong']),
    supportedDirections: z.array(z.enum(['north', 'east', 'south', 'west'])).max(4),
    supportedRotations: z.array(assetRotationSchema).min(1).max(4),
    defaultRotation: assetRotationSchema,
    variants: z.array(bundledAssetVariantSchema).max(12),
    recommendedScale: z.number().positive().max(8),
    tags: z
      .array(z.string().regex(/^[a-z][a-z0-9-]*$/u))
      .min(1)
      .max(20),
    accessibilityLabel: z.string().trim().min(2).max(160),
    bundledVersion: z.literal(STARVILLE_BUNDLED_MANIFEST_VERSION),
    replacementAllowed: z.boolean(),
    safeFallbackKey: assetIdentifierSchema,
    criticalGroups: z.array(bundledAssetCriticalGroupSchema).max(6),
    usageLocations: z.array(z.string().trim().min(2).max(80)).min(1).max(16),
    qualityStatus: z.literal('technical_baseline'),
    aliasOf: assetIdentifierSchema.nullable(),
    generator: bundledAssetGeneratorSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (Math.abs(entry.aspectRatio - entry.width / entry.height) > 0.000_1) {
      context.addIssue({ code: 'custom', path: ['aspectRatio'], message: 'Aspect ratio mismatch' });
    }
    if (!entry.supportedRotations.includes(entry.defaultRotation)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultRotation'],
        message: 'Default rotation must be supported',
      });
    }
    if (new Set(entry.supportedRotations).size !== entry.supportedRotations.length) {
      context.addIssue({
        code: 'custom',
        path: ['supportedRotations'],
        message: 'Rotations must be unique',
      });
    }
    if (new Set(entry.supportedDirections).size !== entry.supportedDirections.length) {
      context.addIssue({
        code: 'custom',
        path: ['supportedDirections'],
        message: 'Directions must be unique',
      });
    }
    if (new Set(entry.variants.map(({ id }) => id)).size !== entry.variants.length) {
      context.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Variant identifiers must be unique',
      });
    }
    const variantSignatures = entry.variants.map(
      ({ rotation, state }) =>
        `${rotation === null ? 'none' : String(rotation)}:${state ?? 'none'}`,
    );
    if (new Set(variantSignatures).size !== variantSignatures.length) {
      context.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Variant rotation and state combinations must be unique',
      });
    }
    const variantRotations = entry.variants
      .map(({ rotation }) => rotation)
      .filter((rotation): rotation is 0 | 90 | 180 | 270 => rotation !== null);
    if (variantRotations.some((rotation) => !entry.supportedRotations.includes(rotation))) {
      context.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'A directional variant declares an unsupported rotation',
      });
    }
    if (entry.animated) {
      if (
        entry.frameWidth === null ||
        entry.frameHeight === null ||
        entry.frameCount <= 1 ||
        entry.loopMode === 'none'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['animated'],
          message: 'Animated assets require frame dimensions, multiple frames, and a loop mode',
        });
      } else {
        if (entry.width % entry.frameWidth !== 0 || entry.height % entry.frameHeight !== 0) {
          context.addIssue({
            code: 'custom',
            path: ['frameWidth'],
            message: 'Animation frame dimensions must divide the source dimensions exactly',
          });
        }
        const availableFrames =
          Math.floor(entry.width / entry.frameWidth) * Math.floor(entry.height / entry.frameHeight);
        if (entry.frameCount > availableFrames) {
          context.addIssue({
            code: 'custom',
            path: ['frameCount'],
            message: 'Animation frame count exceeds the declared sheet capacity',
          });
        }
      }
    } else if (
      entry.frameWidth !== null ||
      entry.frameHeight !== null ||
      entry.frameCount !== 1 ||
      entry.loopMode !== 'none'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['animated'],
        message: 'Static assets cannot declare animation frames or a looping mode',
      });
    }
    if (entry.collision.shape === 'rectangle') {
      const minimumX = -entry.footprint.width / 2;
      const minimumY = -entry.footprint.height / 2;
      const maximumX = minimumX + entry.footprint.width;
      const maximumY = minimumY + entry.footprint.height;
      if (
        entry.collision.offsetX < minimumX ||
        entry.collision.offsetX + entry.collision.width > maximumX ||
        entry.collision.offsetY < minimumY ||
        entry.collision.offsetY + entry.collision.height > maximumY
      ) {
        context.addIssue({
          code: 'custom',
          path: ['collision'],
          message: 'Rectangle collision must remain inside the declared footprint',
        });
      }
    }
    if (entry.collision.shape === 'capsule') {
      const collision = entry.collision;
      const halfWidth = entry.footprint.width / 2;
      const halfHeight = entry.footprint.height / 2;
      const points = [
        [collision.startX, collision.startY],
        [collision.endX, collision.endY],
      ] as const;
      if (
        points.some(
          ([x, y]) =>
            Math.abs(x) + collision.radius > halfWidth ||
            Math.abs(y) + collision.radius > halfHeight,
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['collision'],
          message: 'Capsule collision must remain inside the declared footprint',
        });
      }
    }
  });
export type BundledAssetEntry = z.infer<typeof bundledAssetEntrySchema>;

export const bundledAssetManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    game: z.literal('starville'),
    manifestVersion: z.literal(STARVILLE_BUNDLED_MANIFEST_VERSION),
    projection: z
      .object({
        tileWidth: z.literal(96),
        tileHeight: z.literal(48),
        lightDirection: z.literal('upper_left'),
        shadowDirection: z.literal('lower_right'),
        objectBase: z.literal('bottom_center'),
      })
      .strict(),
    assets: z.array(bundledAssetEntrySchema).min(1).max(160),
  })
  .strict()
  .superRefine((manifest, context) => {
    const keys = manifest.assets.map(({ key }) => key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', path: ['assets'], message: 'Asset keys must be unique' });
    }
    const known = new Set(keys);
    const catalog = new Map(manifest.assets.map((entry) => [entry.key, entry]));
    for (const [index, entry] of manifest.assets.entries()) {
      if (!known.has(entry.safeFallbackKey)) {
        context.addIssue({
          code: 'custom',
          path: ['assets', index, 'safeFallbackKey'],
          message: 'Fallback key is not present in the bundled manifest',
        });
      }
      if (entry.aliasOf !== null && !known.has(entry.aliasOf)) {
        context.addIssue({
          code: 'custom',
          path: ['assets', index, 'aliasOf'],
          message: 'Alias target is not present in the bundled manifest',
        });
      }
      const aliasChain = new Set<string>();
      let aliasKey: string | null = entry.key;
      while (aliasKey !== null) {
        if (aliasChain.has(aliasKey)) {
          context.addIssue({
            code: 'custom',
            path: ['assets', index, 'aliasOf'],
            message: 'Alias chain contains a cycle',
          });
          break;
        }
        aliasChain.add(aliasKey);
        aliasKey = catalog.get(aliasKey)?.aliasOf ?? null;
      }

      const fallbackChain = new Set<string>();
      let fallbackKey = entry.key;
      while (true) {
        const next = catalog.get(fallbackKey)?.safeFallbackKey;
        if (next === undefined) break;
        if (next === fallbackKey) {
          if (fallbackKey !== 'system.missing-asset') {
            context.addIssue({
              code: 'custom',
              path: ['assets', index, 'safeFallbackKey'],
              message: 'Only the canonical missing asset may terminate with a self fallback',
            });
          }
          break;
        }
        if (fallbackChain.has(next)) {
          context.addIssue({
            code: 'custom',
            path: ['assets', index, 'safeFallbackKey'],
            message: 'Safe fallback chain contains a cycle',
          });
          break;
        }
        fallbackChain.add(fallbackKey);
        fallbackKey = next;
      }
    }
  });
export type BundledAssetManifest = z.infer<typeof bundledAssetManifestSchema>;

type Rotation = 0 | 90 | 180 | 270;
type EntryInput = Readonly<{
  assetType: z.input<typeof assetTypeSchema>;
  category: z.input<typeof assetCategorySchema>;
  displayName: string;
  description: string;
  generatorKind: string;
  generatorVariant: string;
  palette?: z.input<typeof bundledAssetGeneratorSchema>['palette'];
  stage?: number | null;
  width?: number;
  height?: number;
  footprint?: Readonly<{ width: number; height: number }>;
  collision?: z.input<typeof assetCollisionProfileSchema>;
  anchor?: Readonly<{ x: number; y: number }>;
  footAnchor?: Readonly<{ x: number; y: number }>;
  depthAnchor?: Readonly<{ x: number; y: number }>;
  interactionAnchor?: Readonly<{ x: number; y: number }> | null;
  interactionRadius?: number;
  renderLayer?: z.input<typeof bundledAssetRenderLayerSchema>;
  supportedRotations?: readonly Rotation[];
  variants?: readonly Readonly<{ id: string; rotation?: Rotation; state?: string }>[];
  recommendedScale?: number;
  tags?: readonly string[];
  criticalGroups?: readonly z.input<typeof bundledAssetCriticalGroupSchema>[];
  usageLocations?: readonly string[];
  safeFallbackKey?: string;
  replacementAllowed?: boolean;
  aliasOf?: string | null;
}>;

function fileStem(key: string): string {
  return key.replaceAll('.', '__');
}

function sourcePath(category: string, stem: string): string {
  return `assets/source/${category}/${stem}.svg`;
}

function runtimePath(category: string, stem: string): string {
  return `${STARVILLE_BUNDLED_PUBLIC_ROOT}/${category}/${stem}.webp`;
}

function thumbnailPath(category: string, stem: string): string {
  return `${STARVILLE_BUNDLED_PUBLIC_ROOT}/thumbnails/${category}/${stem}.webp`;
}

function entry(key: string, input: EntryInput): BundledAssetEntry {
  const stem = fileStem(key);
  const mediaStem = fileStem(input.aliasOf ?? key);
  const width = input.width ?? 256;
  const height = input.height ?? 256;
  const rotations = [...(input.supportedRotations ?? ([0] as const))];
  const variants = (input.variants ?? []).map((variant) => {
    const variantStem = `${stem}--${variant.id}`;
    return {
      id: variant.id,
      rotation: variant.rotation ?? null,
      state: variant.state ?? null,
      sourcePath: sourcePath(input.category, variantStem),
      runtimePath: runtimePath(input.category, variantStem),
    };
  });
  return bundledAssetEntrySchema.parse({
    key,
    assetType: input.assetType,
    category: input.category,
    displayName: input.displayName,
    description: input.description,
    sourceType: 'bundled_svg',
    sourcePath: sourcePath(input.category, mediaStem),
    runtimePath: runtimePath(input.category, mediaStem),
    thumbnailPath: thumbnailPath(input.category, mediaStem),
    width,
    height,
    aspectRatio: width / height,
    anchor: input.anchor ?? { x: 0.5, y: 1 },
    footAnchor: input.footAnchor ?? { x: 0.5, y: 0.92 },
    depthAnchor: input.depthAnchor ?? { x: 0.5, y: 0.92 },
    footprint: input.footprint ?? { width: 1, height: 1 },
    collision: input.collision ?? { shape: 'none', blocking: false },
    interactionAnchor: input.interactionAnchor ?? null,
    interactionRadius: input.interactionRadius ?? 0,
    renderLayer: input.renderLayer ?? 'object',
    animated: false,
    frameWidth: null,
    frameHeight: null,
    frameCount: 1,
    frameDurationMs: 160,
    loopMode: 'none',
    supportedDirections: [],
    supportedRotations: rotations,
    defaultRotation: rotations[0] ?? 0,
    variants,
    recommendedScale: input.recommendedScale ?? 1,
    tags: [...(input.tags ?? [input.category])],
    accessibilityLabel: input.displayName,
    bundledVersion: STARVILLE_BUNDLED_MANIFEST_VERSION,
    replacementAllowed: input.replacementAllowed ?? true,
    safeFallbackKey: input.safeFallbackKey ?? 'system.missing-asset',
    criticalGroups: [...(input.criticalGroups ?? ['game_test'])],
    usageLocations: [...(input.usageLocations ?? ['Game Test'])],
    qualityStatus: 'technical_baseline',
    aliasOf: input.aliasOf ?? null,
    generator: {
      kind: input.generatorKind,
      variant: input.generatorVariant,
      palette: input.palette ?? 'meadow',
      stage: input.stage ?? null,
    },
  });
}

const terrainAssets = [
  entry('world.terrain.grass.base', {
    assetType: 'terrain_tile',
    category: 'terrain',
    displayName: 'Meadow Grass',
    description: 'Seam-safe isometric meadow grass with a restrained painted texture.',
    generatorKind: 'terrain',
    generatorVariant: 'grass',
    palette: 'meadow',
    width: 96,
    height: 48,
    anchor: { x: 0.5, y: 0.5 },
    footAnchor: { x: 0.5, y: 0.5 },
    depthAnchor: { x: 0.5, y: 0.5 },
    renderLayer: 'ground',
    tags: ['terrain', 'grass', 'walkable'],
    criticalGroups: ['lantern_square', 'personal_home'],
    usageLocations: ['Lantern Square', 'Personal home exterior'],
  }),
  entry('world.terrain.grass.clover', {
    assetType: 'terrain_tile',
    category: 'terrain',
    displayName: 'Clover Grass Variation',
    description: 'A compatible grass variation with tiny clover flecks for repeated areas.',
    generatorKind: 'terrain',
    generatorVariant: 'grass_clover',
    palette: 'meadow',
    width: 96,
    height: 48,
    anchor: { x: 0.5, y: 0.5 },
    footAnchor: { x: 0.5, y: 0.5 },
    depthAnchor: { x: 0.5, y: 0.5 },
    renderLayer: 'ground',
    tags: ['terrain', 'grass', 'variation'],
    criticalGroups: ['lantern_square', 'personal_home'],
    usageLocations: ['Lantern Square', 'Personal home exterior'],
  }),
  ...[
    ['world.terrain.dirt', 'Garden Dirt', 'dirt'],
    ['world.terrain.path.stone', 'Lantern Stone Path', 'path'],
    ['world.terrain.plaza', 'Lantern Plaza Stone', 'plaza'],
    ['world.terrain.water', 'Brook Water', 'water'],
    ['world.terrain.bridge', 'Willow Bridge Deck', 'bridge'],
    ['world.terrain.soil.dry', 'Dry Farm Soil', 'soil_dry'],
    ['world.terrain.soil.watered', 'Watered Farm Soil', 'soil_watered'],
  ].map(([key, displayName, variant]) =>
    entry(key!, {
      assetType: 'terrain_tile',
      category: 'terrain',
      displayName: displayName!,
      description: `${displayName!} rendered on the canonical 96 by 48 isometric tile plane.`,
      generatorKind: 'terrain',
      generatorVariant: variant!,
      palette: variant === 'water' ? 'moon' : variant === 'bridge' ? 'amber' : 'stone',
      width: 96,
      height: 48,
      anchor: { x: 0.5, y: 0.5 },
      footAnchor: { x: 0.5, y: 0.5 },
      depthAnchor: { x: 0.5, y: 0.5 },
      renderLayer: 'ground',
      tags: ['terrain', variant!.replaceAll('_', '-')],
      criticalGroups: ['lantern_square', 'personal_home', 'farming'],
      usageLocations: ['World terrain', 'Game Test terrain gallery'],
    }),
  ),
] as const;

const worldAssets = [
  entry('cottage-amber', {
    assetType: 'building',
    category: 'structure',
    displayName: 'Amber Cottage',
    description: 'A warm isometric cottage with a deep roof, lit windows, and readable doorway.',
    generatorKind: 'building',
    generatorVariant: 'cottage_amber',
    palette: 'amber',
    width: 384,
    height: 384,
    footprint: { width: 3, height: 2.5 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -1.1,
      offsetY: -0.7,
      width: 2.2,
      height: 1.4,
    },
    interactionAnchor: { x: 0.5, y: 0.88 },
    interactionRadius: 1.6,
    renderLayer: 'structure',
    tags: ['building', 'home', 'cottage'],
    criticalGroups: ['lantern_square', 'personal_home'],
    usageLocations: ['Lantern Square', 'Personal-home entrance'],
  }),
  entry('cottage-sage', {
    assetType: 'building',
    category: 'structure',
    displayName: 'Sage Cottage',
    description: 'A sage-roofed companion cottage sharing Starville projection and lighting.',
    generatorKind: 'building',
    generatorVariant: 'cottage_sage',
    palette: 'sage',
    width: 384,
    height: 384,
    footprint: { width: 3, height: 2.5 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -1.1,
      offsetY: -0.7,
      width: 2.2,
      height: 1.4,
    },
    renderLayer: 'structure',
    tags: ['building', 'cottage', 'sage'],
    criticalGroups: ['lantern_square'],
    usageLocations: ['Lantern Square'],
  }),
  entry('tree-pine', {
    assetType: 'tree',
    category: 'nature',
    displayName: 'Whisper Pine',
    description: 'A layered evergreen with a narrow trunk collision and soft canopy highlights.',
    generatorKind: 'tree',
    generatorVariant: 'pine',
    palette: 'sage',
    width: 256,
    height: 320,
    footprint: { width: 1, height: 1 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -0.22,
      offsetY: -0.24,
      width: 0.44,
      height: 0.48,
    },
    renderLayer: 'structure',
    tags: ['nature', 'tree', 'evergreen'],
    criticalGroups: ['lantern_square'],
    usageLocations: ['Lantern Square', 'Whisperpine Gate'],
  }),
  entry('tree-maple', {
    assetType: 'tree',
    category: 'nature',
    displayName: 'Star Maple',
    description: 'A rounded maple tree with moss, amber, and sage foliage clusters.',
    generatorKind: 'tree',
    generatorVariant: 'maple',
    palette: 'amber',
    width: 288,
    height: 320,
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -0.22,
      offsetY: -0.24,
      width: 0.44,
      height: 0.48,
    },
    renderLayer: 'structure',
    tags: ['nature', 'tree', 'maple'],
    criticalGroups: ['lantern_square'],
    usageLocations: ['Lantern Square'],
  }),
  ...[
    ['rock-moss', 'Mossy Waystone', 'rock', 'moss'],
    ['moonstone-marker', 'Moonstone Marker', 'rock', 'moonstone'],
    ['flowers-moon', 'Moonbell Flowers', 'decoration', 'flowers'],
    ['bush-round', 'Round-leaf Bush', 'decoration', 'bush'],
  ].map(([key, displayName, assetType, variant]) =>
    entry(key!, {
      assetType: assetType as 'rock' | 'decoration',
      category: 'nature',
      displayName: displayName!,
      description: `${displayName!} with a compact readable silhouette and soft upper-left light.`,
      generatorKind: 'nature_prop',
      generatorVariant: variant!,
      palette: variant === 'moonstone' || variant === 'flowers' ? 'moon' : 'sage',
      width: 192,
      height: 192,
      collision:
        assetType === 'rock'
          ? {
              shape: 'rectangle',
              blocking: true,
              offsetX: -0.35,
              offsetY: -0.25,
              width: 0.7,
              height: 0.5,
            }
          : { shape: 'none', blocking: false },
      tags: ['nature', variant!],
      criticalGroups: ['lantern_square'],
      usageLocations: ['Lantern Square', 'World Composer'],
    }),
  ),
  entry('fence-willow', {
    assetType: 'fence',
    category: 'boundary',
    displayName: 'Willow Fence',
    description: 'A low willow fence segment with distinct posts and a narrow collision base.',
    generatorKind: 'boundary',
    generatorVariant: 'fence',
    palette: 'amber',
    width: 288,
    height: 160,
    footprint: { width: 3, height: 0.5 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -1.5,
      offsetY: -0.2,
      width: 3,
      height: 0.4,
    },
    supportedRotations: [0, 90],
    variants: [{ id: 'rotation-90', rotation: 90 }],
    tags: ['boundary', 'fence', 'willow'],
    criticalGroups: ['lantern_square', 'personal_home'],
    usageLocations: ['Lantern Square', 'Personal home exterior'],
  }),
  entry('whisperpine-gate', {
    assetType: 'fence',
    category: 'boundary',
    displayName: 'Whisperpine Gate',
    description: 'A tall woodland gate with lantern finials and a clear passage opening.',
    generatorKind: 'boundary',
    generatorVariant: 'gate',
    palette: 'sage',
    width: 352,
    height: 288,
    footprint: { width: 3, height: 0.75 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -1.5,
      offsetY: -0.25,
      width: 3,
      height: 0.5,
    },
    renderLayer: 'structure',
    tags: ['boundary', 'gate', 'forest'],
    criticalGroups: ['game_test'],
    usageLocations: ['Whisperpine Gate'],
  }),
  entry('closed-route-marker', {
    assetType: 'fence',
    category: 'boundary',
    displayName: 'Closed Route Marker',
    description: 'A friendly rope-and-post closure marker with no alarming or corporate styling.',
    generatorKind: 'boundary',
    generatorVariant: 'closed_route',
    palette: 'amber',
    width: 224,
    height: 160,
    footprint: { width: 2, height: 0.5 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -1,
      offsetY: -0.2,
      width: 2,
      height: 0.4,
    },
    tags: ['boundary', 'closed-route'],
    usageLocations: ['Closed world exits'],
  }),
  entry('lamp-star', {
    assetType: 'lamp',
    category: 'lighting',
    displayName: 'Star Lantern',
    description: 'A slender village lantern with warm restrained glow and a stable post base.',
    generatorKind: 'lamp',
    generatorVariant: 'street',
    palette: 'hearth',
    width: 192,
    height: 288,
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -0.18,
      offsetY: -0.18,
      width: 0.36,
      height: 0.36,
    },
    renderLayer: 'structure',
    tags: ['lighting', 'lamp', 'lantern'],
    criticalGroups: ['lantern_square'],
    usageLocations: ['Lantern Square', 'World paths'],
  }),
  ...[
    ['notice-board', 'Lantern Notice Board', 'notice'],
    ['brooklight-sign', 'Brooklight Sign', 'brooklight'],
    ['orchard-road-sign', 'Orchard Road Sign', 'orchard'],
  ].map(([key, displayName, variant]) =>
    entry(key!, {
      assetType: 'sign',
      category: 'signage',
      displayName: displayName!,
      description: `${displayName!} with readable sign geometry and no baked interface text.`,
      generatorKind: 'sign',
      generatorVariant: variant!,
      palette: 'amber',
      width: 224,
      height: 224,
      collision: {
        shape: 'rectangle',
        blocking: true,
        offsetX: -0.35,
        offsetY: -0.18,
        width: 0.7,
        height: 0.36,
      },
      interactionAnchor: { x: 0.5, y: 0.92 },
      interactionRadius: 1.5,
      tags: ['signage', variant!],
      criticalGroups: key === 'notice-board' ? ['lantern_square'] : ['game_test'],
      usageLocations: ['World guidance', 'World Composer'],
    }),
  ),
  entry('phase7-general-store-marker', {
    assetType: 'shop',
    category: 'shop',
    displayName: 'General Store',
    description: 'A welcoming isometric village shop with a readable awning, sign, and entrance.',
    generatorKind: 'building',
    generatorVariant: 'general_store',
    palette: 'amber',
    width: 448,
    height: 416,
    footprint: { width: 3.5, height: 3 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -1.4,
      offsetY: -0.85,
      width: 2.8,
      height: 1.7,
    },
    interactionAnchor: { x: 0.5, y: 0.9 },
    interactionRadius: 1.8,
    renderLayer: 'structure',
    tags: ['shop', 'general-store', 'building'],
    criticalGroups: ['lantern_square'],
    usageLocations: ['Lantern Square', 'General Store interaction'],
  }),
  entry('world.building.general-store.highlight', {
    assetType: 'interaction_marker',
    category: 'interaction',
    displayName: 'General Store Highlight',
    description: 'A soft isometric selection ring sized for the General Store entrance.',
    generatorKind: 'marker',
    generatorVariant: 'store_highlight',
    palette: 'hearth',
    width: 256,
    height: 128,
    anchor: { x: 0.5, y: 0.5 },
    footAnchor: { x: 0.5, y: 0.5 },
    depthAnchor: { x: 0.5, y: 0.5 },
    renderLayer: 'ground_detail',
    tags: ['interaction', 'shop', 'highlight'],
    criticalGroups: ['lantern_square', 'interface'],
    usageLocations: ['General Store interaction'],
  }),
  entry('phase7-cooking-hearth-marker', {
    assetType: 'cooking_station',
    category: 'structure',
    displayName: 'Cooking Hearth',
    description:
      'A stone-and-copper cooking hearth with a clear pot, work surface, and warm coals.',
    generatorKind: 'station',
    generatorVariant: 'hearth_idle',
    palette: 'hearth',
    width: 288,
    height: 288,
    footprint: { width: 2, height: 1.5 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -0.75,
      offsetY: -0.45,
      width: 1.5,
      height: 0.9,
    },
    interactionAnchor: { x: 0.5, y: 0.9 },
    interactionRadius: 1.5,
    renderLayer: 'structure',
    tags: ['station', 'cooking', 'hearth'],
    criticalGroups: ['lantern_square', 'personal_home'],
    usageLocations: ['Lantern Square', 'Personal home workstation'],
  }),
  entry('world.station.cooking-hearth.active', {
    assetType: 'cooking_station',
    category: 'structure',
    displayName: 'Cooking Hearth Active',
    description: 'The bundled active-cooking visual with restrained flame and steam cues.',
    generatorKind: 'station',
    generatorVariant: 'hearth_active',
    palette: 'hearth',
    width: 288,
    height: 288,
    footprint: { width: 2, height: 1.5 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -0.75,
      offsetY: -0.45,
      width: 1.5,
      height: 0.9,
    },
    renderLayer: 'structure',
    tags: ['station', 'cooking', 'active'],
    criticalGroups: ['personal_home', 'game_test'],
    usageLocations: ['Cooking job active state', 'Game Test animation fixture'],
  }),
  entry('world.station.cooking-hearth.ready', {
    assetType: 'cooking_station',
    category: 'structure',
    displayName: 'Cooking Hearth Ready',
    description: 'The completed-cooking visual with a gentle gold readiness sparkle.',
    generatorKind: 'station',
    generatorVariant: 'hearth_ready',
    palette: 'hearth',
    width: 288,
    height: 288,
    footprint: { width: 2, height: 1.5 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -0.75,
      offsetY: -0.45,
      width: 1.5,
      height: 0.9,
    },
    renderLayer: 'structure',
    tags: ['station', 'cooking', 'ready'],
    criticalGroups: ['personal_home', 'game_test'],
    usageLocations: ['Cooking job ready state', 'Game Test'],
  }),
  entry('phase7-crafting-workbench-marker', {
    assetType: 'crafting_station',
    category: 'structure',
    displayName: 'Crafting Workbench',
    description: 'A sturdy willow workbench with visible vice, tools, shelf, and timber grain.',
    generatorKind: 'station',
    generatorVariant: 'workbench_idle',
    palette: 'amber',
    width: 304,
    height: 256,
    footprint: { width: 2, height: 1.5 },
    collision: {
      shape: 'rectangle',
      blocking: true,
      offsetX: -0.8,
      offsetY: -0.45,
      width: 1.6,
      height: 0.9,
    },
    interactionAnchor: { x: 0.5, y: 0.9 },
    interactionRadius: 1.5,
    renderLayer: 'structure',
    tags: ['station', 'crafting', 'workbench'],
    criticalGroups: ['lantern_square', 'personal_home'],
    usageLocations: ['Lantern Square', 'Personal home workstation'],
  }),
  ...[
    ['world.station.crafting-workbench.active', 'Crafting Workbench Active', 'workbench_active'],
    ['world.station.crafting-workbench.ready', 'Crafting Workbench Ready', 'workbench_ready'],
  ].map(([key, displayName, variant]) =>
    entry(key!, {
      assetType: 'crafting_station',
      category: 'structure',
      displayName: displayName!,
      description: `${displayName!} with a bounded visual state cue and unchanged collision base.`,
      generatorKind: 'station',
      generatorVariant: variant!,
      palette: 'amber',
      width: 304,
      height: 256,
      footprint: { width: 2, height: 1.5 },
      collision: {
        shape: 'rectangle',
        blocking: true,
        offsetX: -0.8,
        offsetY: -0.45,
        width: 1.6,
        height: 0.9,
      },
      renderLayer: 'structure',
      tags: ['station', 'crafting', variant!.endsWith('ready') ? 'ready' : 'active'],
      criticalGroups: ['personal_home', 'game_test'],
      usageLocations: ['Crafting job state', 'Game Test'],
    }),
  ),
  entry('phase7-home-entrance-marker', {
    assetType: 'home_entrance',
    category: 'structure',
    displayName: 'Personal Home Entrance',
    description: 'A flower-framed cottage doorway marker with a clear walk-up interaction point.',
    generatorKind: 'entrance',
    generatorVariant: 'home',
    palette: 'sage',
    width: 224,
    height: 256,
    footprint: { width: 1, height: 0.5 },
    collision: { shape: 'none', blocking: false },
    interactionAnchor: { x: 0.5, y: 0.9 },
    interactionRadius: 1.5,
    renderLayer: 'structure',
    tags: ['home', 'entrance', 'interaction'],
    criticalGroups: ['lantern_square', 'personal_home'],
    usageLocations: ['Lantern Square', 'Guided onboarding'],
  }),
  ...[
    ['phase10b-wardrobe-mirror-marker', 'Wardrobe Mirror', 'mirror'],
    ['phase10b-wardrobe-furniture-marker', 'Wardrobe Cabinet', 'wardrobe'],
  ].map(([key, displayName, variant]) =>
    entry(key!, {
      assetType: 'home_interior_object',
      category: 'interior',
      displayName: displayName!,
      description: `${displayName!} for the existing non-economic wardrobe interaction boundary.`,
      generatorKind: 'furniture',
      generatorVariant: variant!,
      palette: 'sage',
      width: 224,
      height: 272,
      collision: {
        shape: 'rectangle',
        blocking: true,
        offsetX: -0.45,
        offsetY: -0.25,
        width: 0.9,
        height: 0.5,
      },
      renderLayer: 'structure',
      tags: ['interior', 'wardrobe'],
      criticalGroups: ['personal_home'],
      usageLocations: ['Wardrobe workspace'],
    }),
  ),
] as const;

const farmPlotAssets = [
  ['farming.plot.empty', 'Empty Farm Plot', 'empty'],
  ['farming.plot.prepared', 'Prepared Farm Plot', 'prepared'],
  ['farming.plot.dry', 'Dry Planted Plot', 'dry'],
  ['farming.plot.watered', 'Watered Farm Plot', 'watered'],
  ['farming.plot.planted', 'Planted Farm Plot', 'planted'],
  ['farming.plot.selected', 'Selected Farm Plot', 'selected'],
  ['farming.plot.invalid', 'Invalid Farm Placement', 'invalid'],
].map(([key, displayName, variant]) =>
  entry(key!, {
    assetType: 'farm_plot',
    category: 'farming',
    displayName: displayName!,
    description: `${displayName!} on the canonical isometric home-garden footprint.`,
    generatorKind: 'farm_plot',
    generatorVariant: variant!,
    palette: variant === 'invalid' ? 'system' : 'meadow',
    width: 192,
    height: 128,
    anchor: { x: 0.5, y: 0.7 },
    footAnchor: { x: 0.5, y: 0.7 },
    depthAnchor: { x: 0.5, y: 0.7 },
    footprint: { width: 1, height: 1 },
    renderLayer: 'ground_detail',
    tags: ['farming', 'plot', variant!],
    criticalGroups: ['farming', 'personal_home'],
    usageLocations: ['Personal home farm', 'Game Test farming sequence'],
  }),
);

const farmPlotAlias = entry('phase7-farm-plot-marker', {
  assetType: 'farm_plot',
  category: 'farming',
  displayName: 'Farm Plot',
  description: 'Stable Phase 7 farm-plot identity resolved to the bundled empty plot baseline.',
  generatorKind: 'farm_plot',
  generatorVariant: 'empty',
  palette: 'meadow',
  width: 192,
  height: 128,
  anchor: { x: 0.5, y: 0.7 },
  footAnchor: { x: 0.5, y: 0.7 },
  depthAnchor: { x: 0.5, y: 0.7 },
  renderLayer: 'ground_detail',
  tags: ['farming', 'plot', 'stable-key'],
  criticalGroups: ['farming', 'personal_home'],
  usageLocations: ['World manifests', 'Personal home farm'],
  aliasOf: 'farming.plot.empty',
});

const cropDefinitions = [
  { slug: 'moonbean', name: 'Moonbean', stages: 4, palette: 'moon' as const },
  { slug: 'sunroot', name: 'Sunroot', stages: 4, palette: 'hearth' as const },
  { slug: 'cloudberry', name: 'Cloudberry', stages: 5, palette: 'moon' as const },
] as const;

const cropAssets = cropDefinitions.flatMap((crop) => {
  const stages = Array.from({ length: crop.stages }, (_, stage) =>
    entry(`farming.crop.${crop.slug}.stage-${String(stage)}`, {
      assetType: 'crop_stage',
      category: 'crop',
      displayName: `${crop.name} Stage ${String(stage + 1)}`,
      description: `${crop.name} growth stage ${String(stage + 1)} of ${String(crop.stages)} with a stable soil contact point.`,
      generatorKind: 'crop',
      generatorVariant: crop.slug,
      palette: crop.palette,
      stage,
      width: 160,
      height: 192,
      anchor: { x: 0.5, y: 0.88 },
      footAnchor: { x: 0.5, y: 0.88 },
      depthAnchor: { x: 0.5, y: 0.88 },
      renderLayer: 'object',
      tags: ['farming', 'crop', crop.slug, `stage-${String(stage)}`],
      criticalGroups: ['farming', 'personal_home'],
      usageLocations: ['Personal home farm', 'Game Test crop progression'],
    }),
  );
  const readyKey = `farming.crop.${crop.slug}.ready`;
  const ready = entry(readyKey, {
    assetType: 'crop_stage',
    category: 'crop',
    displayName: `${crop.name} Harvest Ready`,
    description: `${crop.name} harvest-ready visual alias with the canonical final growth silhouette.`,
    generatorKind: 'crop',
    generatorVariant: crop.slug,
    palette: crop.palette,
    stage: crop.stages - 1,
    width: 160,
    height: 192,
    anchor: { x: 0.5, y: 0.88 },
    footAnchor: { x: 0.5, y: 0.88 },
    depthAnchor: { x: 0.5, y: 0.88 },
    renderLayer: 'object',
    tags: ['farming', 'crop', crop.slug, 'ready'],
    criticalGroups: ['farming', 'personal_home'],
    usageLocations: ['Personal home farm', 'Harvest interaction'],
    aliasOf: `farming.crop.${crop.slug}.stage-${String(crop.stages - 1)}`,
  });
  const base = entry(`phase7-dev-${crop.slug}-crop`, {
    assetType: 'crop_stage',
    category: 'crop',
    displayName: `${crop.name} Crop Sequence`,
    description: `Stable existing ${crop.name} crop identity backed by the bundled growth sequence.`,
    generatorKind: 'crop',
    generatorVariant: crop.slug,
    palette: crop.palette,
    stage: crop.stages - 1,
    width: 160,
    height: 192,
    anchor: { x: 0.5, y: 0.88 },
    footAnchor: { x: 0.5, y: 0.88 },
    depthAnchor: { x: 0.5, y: 0.88 },
    renderLayer: 'object',
    tags: ['farming', 'crop', crop.slug, 'stable-key'],
    criticalGroups: ['farming', 'personal_home'],
    usageLocations: ['Crop definition registry'],
    aliasOf: `farming.crop.${crop.slug}.stage-${String(crop.stages - 1)}`,
  });
  return [...stages, ready, base];
});

const furnitureDefinitions = [
  ['phase7-dev-willow-chair', 'Willow Chair', 'chair', 'seating'],
  ['phase7-dev-hearth-table', 'Hearth Table', 'table', 'table'],
  ['phase7-dev-moonwoven-rug', 'Moonwoven Rug', 'rug', 'decoration'],
  ['phase7-dev-lantern-floor-lamp', 'Lantern Floor Lamp', 'floor_lamp', 'lighting'],
  ['phase7-dev-meadow-shelf', 'Meadow Shelf', 'shelf', 'storage'],
  ['phase7-dev-round-leaf-planter', 'Round-leaf Planter', 'planter', 'plant'],
] as const;

const furnitureAssets = furnitureDefinitions.map(([key, displayName, variant, tag]) =>
  entry(key, {
    assetType: 'furniture',
    category: 'furniture',
    displayName,
    description: `${displayName} with four authored isometric directions and a stable placement base.`,
    generatorKind: 'furniture',
    generatorVariant: variant,
    palette: variant === 'rug' ? 'moon' : variant === 'planter' ? 'sage' : 'amber',
    width: 192,
    height: 208,
    footprint:
      variant === 'table' || variant === 'rug' ? { width: 2, height: 1 } : { width: 1, height: 1 },
    collision:
      variant === 'rug'
        ? { shape: 'none', blocking: false }
        : {
            shape: 'rectangle',
            blocking: true,
            offsetX: -0.4,
            offsetY: -0.3,
            width: 0.8,
            height: 0.6,
          },
    supportedRotations: [0, 90, 180, 270],
    variants: [
      { id: 'rotation-90', rotation: 90 },
      { id: 'rotation-180', rotation: 180 },
      { id: 'rotation-270', rotation: 270 },
    ],
    renderLayer: variant === 'rug' ? 'ground_detail' : 'object',
    tags: ['furniture', tag, 'rotatable'],
    criticalGroups: ['housing', 'personal_home'],
    usageLocations: ['Decoration Mode', 'Furniture palette', 'Housing Game Test'],
  }),
);

const itemDefinitions = [
  ['phase7-dev-moonbean-seed', 'Moonbean Seed', 'seed', 'moonbean_seed', 'moon'],
  ['phase7-dev-sunroot-seed', 'Sunroot Seed', 'seed', 'sunroot_seed', 'hearth'],
  ['phase7-dev-cloudberry-seed', 'Cloudberry Seed', 'seed', 'cloudberry_seed', 'moon'],
  ['phase7-dev-moonbean', 'Moonbean', 'crop_icon', 'moonbean', 'moon'],
  ['phase7-dev-sunroot', 'Sunroot', 'crop_icon', 'sunroot', 'hearth'],
  ['phase7-dev-cloudberry', 'Cloudberry', 'crop_icon', 'cloudberry', 'moon'],
  ['phase7-dev-meadow-flour', 'Meadow Flour', 'item_icon', 'flour', 'amber'],
  ['phase7-dev-willow-timber', 'Willow Timber', 'item_icon', 'timber', 'amber'],
  ['phase7-dev-moonbean-salad', 'Moonbean Salad', 'recipe_icon', 'salad', 'meadow'],
  ['phase7-dev-sunroot-soup', 'Sunroot Soup', 'recipe_icon', 'soup', 'hearth'],
  ['phase7-dev-cloudberry-tart', 'Cloudberry Tart', 'recipe_icon', 'tart', 'moon'],
  ['phase7-dev-meadow-biscuit', 'Meadow Biscuit', 'recipe_icon', 'biscuit', 'amber'],
  ['phase7-dev-garden-twine', 'Garden Twine', 'item_icon', 'twine', 'sage'],
  ['phase7-dev-willow-planks', 'Willow Planks', 'item_icon', 'planks', 'amber'],
  ['phase7-dev-starter-watering-can', 'Starter Watering Can', 'item_icon', 'watering_can', 'moon'],
  ['phase11a-dev-starter-hoe', 'Willow Starter Hoe', 'item_icon', 'hoe', 'amber'],
] as const;

const itemAssets = itemDefinitions.map(([key, displayName, assetType, variant, palette]) =>
  entry(key, {
    assetType: assetType === 'seed' ? 'seed_icon' : assetType,
    category: assetType === 'recipe_icon' ? 'recipe' : 'inventory',
    displayName,
    description: `${displayName} inventory artwork designed to remain readable at quickbar size.`,
    generatorKind: 'item_icon',
    generatorVariant: variant,
    palette,
    width: 160,
    height: 160,
    anchor: { x: 0.5, y: 0.5 },
    footAnchor: { x: 0.5, y: 0.5 },
    depthAnchor: { x: 0.5, y: 0.5 },
    renderLayer: 'interface',
    tags: ['inventory', assetType.replaceAll('_', '-'), variant.replaceAll('_', '-')],
    criticalGroups: ['interface'],
    usageLocations: ['Inventory', 'Quickbar', 'Shop and recipe panels'],
  }),
);

const interfaceDefinitions = [
  ['ui.currency.dust', 'DUST', 'dust', 'inventory'],
  ['ui.category.inventory', 'Inventory Category', 'satchel', 'inventory'],
  ['ui.category.farming', 'Farming Category', 'sprout', 'farming'],
  ['ui.category.cooking', 'Cooking Category', 'cooking', 'recipe'],
  ['ui.category.crafting', 'Crafting Category', 'crafting', 'inventory'],
  ['ui.category.shop', 'Shop Category', 'shop', 'shop'],
  ['ui.category.housing', 'Housing Category', 'housing', 'furniture'],
  ['ui.category.social', 'Social Category', 'social', 'interaction'],
  ['ui.quest.active', 'Active Quest', 'quest', 'interaction'],
  ['ui.objective.active', 'Active Objective', 'objective', 'interaction'],
  ['ui.direction', 'Direction Indicator', 'direction', 'interaction'],
  ['ui.interaction', 'Interaction Marker', 'interaction', 'interaction'],
  ['ui.spawn', 'Spawn Marker', 'spawn', 'interaction'],
  ['ui.exit', 'World Exit', 'exit', 'interaction'],
  ['ui.warning', 'Warning', 'warning', 'interaction'],
  ['ui.validation.success', 'Validation Passed', 'success', 'interaction'],
  ['ui.validation.error', 'Validation Error', 'error', 'interaction'],
  ['ui.social.home-visit', 'Home Visit', 'home_visit', 'interaction'],
  ['ui.social.photo-area', 'Photo Area', 'photo', 'interaction'],
  ['ui.social.guestbook', 'Guestbook', 'guestbook', 'interaction'],
  ['ui.social.appreciation', 'Appreciation', 'appreciation', 'interaction'],
] as const;

const interfaceAssets = interfaceDefinitions.map(([key, displayName, variant, category]) =>
  entry(key, {
    assetType: key.includes('shop') ? 'shop_icon' : 'interaction_marker',
    category,
    displayName,
    description: `${displayName} icon using Starville's warm outline, moon-gold accent, and text-free silhouette.`,
    generatorKind: 'ui_icon',
    generatorVariant: variant,
    palette: ['warning', 'error'].includes(variant) ? 'system' : 'moon',
    width: 128,
    height: 128,
    anchor: { x: 0.5, y: 0.5 },
    footAnchor: { x: 0.5, y: 0.5 },
    depthAnchor: { x: 0.5, y: 0.5 },
    renderLayer: 'interface',
    tags: ['interface', variant.replaceAll('_', '-')],
    criticalGroups: ['interface'],
    usageLocations: ['Game interface', 'Guidance', 'Admin diagnostics'],
  }),
);

const missingAsset = entry('system.missing-asset', {
  assetType: 'interaction_marker',
  category: 'interaction',
  displayName: 'Missing Asset',
  description: 'A safe Starville diagnostic crate used when no eligible visual source can load.',
  generatorKind: 'missing_asset',
  generatorVariant: 'crate',
  palette: 'system',
  width: 192,
  height: 192,
  footprint: { width: 1, height: 1 },
  collision: { shape: 'none', blocking: false },
  renderLayer: 'object',
  tags: ['system', 'missing', 'diagnostic'],
  criticalGroups: [
    'lantern_square',
    'personal_home',
    'farming',
    'housing',
    'interface',
    'game_test',
  ],
  usageLocations: ['Game Client fallback', 'World Composer diagnostics', 'Admin Portal'],
  safeFallbackKey: 'system.missing-asset',
  replacementAllowed: false,
});

export const STARVILLE_BUNDLED_ASSET_MANIFEST = bundledAssetManifestSchema.parse({
  schemaVersion: 1,
  game: 'starville',
  manifestVersion: STARVILLE_BUNDLED_MANIFEST_VERSION,
  projection: {
    tileWidth: 96,
    tileHeight: 48,
    lightDirection: 'upper_left',
    shadowDirection: 'lower_right',
    objectBase: 'bottom_center',
  },
  assets: [
    missingAsset,
    ...terrainAssets,
    ...worldAssets,
    farmPlotAlias,
    ...farmPlotAssets,
    ...cropAssets,
    ...furnitureAssets,
    ...itemAssets,
    ...interfaceAssets,
  ],
});

export const STARVILLE_BUNDLED_ASSETS: readonly BundledAssetEntry[] =
  STARVILLE_BUNDLED_ASSET_MANIFEST.assets;

export const STARVILLE_BUNDLED_ASSET_CATALOG: ReadonlyMap<string, BundledAssetEntry> = new Map(
  STARVILLE_BUNDLED_ASSETS.map((asset) => [asset.key, asset]),
);

export function getBundledAsset(key: string): BundledAssetEntry | undefined {
  return STARVILLE_BUNDLED_ASSET_CATALOG.get(key);
}

export function bundledAssetVariant(
  asset: BundledAssetEntry,
  input: Readonly<{ rotation?: Rotation; state?: string }> = {},
): BundledAssetVariant | undefined {
  return asset.variants.find(
    (variant) =>
      (input.rotation === undefined || variant.rotation === input.rotation) &&
      (input.state === undefined || variant.state === input.state),
  );
}

export function bundledAssetRuntimePath(
  asset: BundledAssetEntry,
  input: Readonly<{ rotation?: Rotation; state?: string }> = {},
): string {
  return bundledAssetVariant(asset, input)?.runtimePath ?? asset.runtimePath;
}

export function bundledAssetAdminMediaPath(
  key: string,
  variant: 'source' | 'thumbnail' = 'source',
): string {
  return `/api/bundled-assets/${encodeURIComponent(key)}/${variant}`;
}

export function cropStageAssetKey(
  cropSlug: string,
  growthStage: number,
  growthStageCount: number,
  ready: boolean,
): string {
  if (ready) return `farming.crop.${cropSlug}.ready`;
  const boundedStage = Math.max(0, Math.min(growthStageCount - 1, growthStage - 1));
  const key = `farming.crop.${cropSlug}.stage-${String(boundedStage)}`;
  return getBundledAsset(key) === undefined ? 'system.missing-asset' : key;
}

export function farmPlotAssetKey(
  input: Readonly<{
    state: string;
    watered?: boolean;
    selected?: boolean;
    invalid?: boolean;
  }>,
): string {
  if (input.invalid === true) return 'farming.plot.invalid';
  if (input.selected === true) return 'farming.plot.selected';
  if (input.watered === true) return 'farming.plot.watered';
  if (['prepared', 'empty', 'planted'].includes(input.state)) return `farming.plot.${input.state}`;
  if (input.state === 'mature' || input.state === 'growing') return 'farming.plot.planted';
  return 'farming.plot.dry';
}
