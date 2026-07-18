import { z } from 'zod';

import { STARVILLE_BUNDLED_ASSETS } from './bundled-assets';
import {
  assetAnchorSchema,
  assetChecksumSchema,
  assetCollisionProfileSchema,
  assetIdentifierSchema,
  assetRotationSchema,
  assetUuidSchema,
} from './contracts';
import type { ManagedAssetCandidate } from './resolver';

export const GAMEPLAY_ASSET_OVERRIDE_MAX_KEYS = 96 as const;

const gameplayAssetTypes = new Set([
  'cooking_station',
  'crafting_station',
  'farm_plot',
  'crop_stage',
  'furniture',
  'home_interior_object',
  'interaction_marker',
  'item_icon',
  'seed_icon',
  'crop_icon',
  'recipe_icon',
  'furniture_icon',
  'shop_icon',
]);
const gameplayAssetCategories = new Set([
  'farming',
  'crop',
  'furniture',
  'interior',
  'interaction',
  'inventory',
  'recipe',
  'shop',
  'structure',
]);

/**
 * Bounded stable keys used by React gameplay surfaces. Phaser's immutable
 * world-revision pins deliberately stay on the separate published-world path.
 */
export const STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS: readonly string[] = Object.freeze(
  STARVILLE_BUNDLED_ASSETS.filter(
    (asset) =>
      asset.replacementAllowed &&
      gameplayAssetTypes.has(asset.assetType) &&
      gameplayAssetCategories.has(asset.category),
  ).map(({ key }) => key),
);

export const STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEY_SET: ReadonlySet<string> = new Set(
  STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS,
);

const immutablePublicDerivativeUrlSchema = z.url().superRefine((value, context) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Override delivery URL is invalid' });
    return;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.search !== '' || url.hash !== '') {
    context.addIssue({
      code: 'custom',
      message: 'Override delivery URL must be an immutable HTTP(S) object URL',
    });
  }
});

export const gameplayAssetOverrideSchema = z
  .object({
    assetKey: assetIdentifierSchema,
    versionId: assetUuidSchema,
    checksum: assetChecksumSchema,
    source: z.literal('active_uploaded'),
    bundledManifestVersion: z.null(),
    url: immutablePublicDerivativeUrlSchema,
    mediaType: z.literal('image/webp'),
    width: z.number().int().positive().max(8192),
    height: z.number().int().positive().max(8192),
    renderWidth: z.number().int().positive().max(4096),
    renderHeight: z.number().int().positive().max(4096),
    scale: z.number().finite().min(0.05).max(8),
    anchor: assetAnchorSchema,
    footAnchor: assetAnchorSchema,
    depthAnchor: assetAnchorSchema,
    collision: assetCollisionProfileSchema,
    supportedRotations: z.array(assetRotationSchema).min(1).max(4),
    defaultRotation: assetRotationSchema,
    replacementAllowed: z.literal(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (!STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEY_SET.has(value.assetKey)) {
      context.addIssue({
        code: 'custom',
        path: ['assetKey'],
        message: 'Override key is outside the Starville gameplay allowlist',
      });
    }
    if (new Set(value.supportedRotations).size !== value.supportedRotations.length) {
      context.addIssue({
        code: 'custom',
        path: ['supportedRotations'],
        message: 'Rotations differ',
      });
    }
    if (!value.supportedRotations.includes(value.defaultRotation)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultRotation'],
        message: 'Default rotation must be supported',
      });
    }
  });
export type GameplayAssetOverride = z.infer<typeof gameplayAssetOverrideSchema>;

export const gameplayAssetOverridesSchema = z
  .array(gameplayAssetOverrideSchema)
  .max(GAMEPLAY_ASSET_OVERRIDE_MAX_KEYS)
  .superRefine((items, context) => {
    const keys = items.map(({ assetKey }) => assetKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Override keys must be unique' });
    }
  });

export function gameplayAssetOverrideCandidate(
  override: GameplayAssetOverride,
): ManagedAssetCandidate {
  return {
    sourceKind: 'uploaded',
    identity: `upload:${override.assetKey}:${override.versionId}`,
    versionId: override.versionId,
    eligible: true,
    url: override.url,
    thumbnailUrl: override.url,
    checksum: override.checksum,
    render: {
      width: override.width,
      height: override.height,
      renderWidth: override.renderWidth,
      renderHeight: override.renderHeight,
      scale: override.scale,
      anchor: override.anchor,
      footAnchor: override.footAnchor,
      depthAnchor: override.depthAnchor,
      collision: override.collision,
      supportedRotations: override.supportedRotations,
      defaultRotation: override.defaultRotation,
    },
  };
}
