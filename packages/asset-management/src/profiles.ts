import { z } from 'zod';

export const ASSET_SOURCE_MEDIA_TYPES = ['image/png', 'image/webp'] as const;
export const assetSourceMediaTypeSchema = z.enum(ASSET_SOURCE_MEDIA_TYPES);
export type AssetSourceMediaType = z.infer<typeof assetSourceMediaTypeSchema>;

export const ASSET_TYPES = [
  'building',
  'shop',
  'cooking_station',
  'crafting_station',
  'home_entrance',
  'decoration',
  'tree',
  'rock',
  'fence',
  'lamp',
  'sign',
  'terrain_tile',
  'bridge',
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
] as const;
export const assetTypeSchema = z.enum(ASSET_TYPES);
export type AssetType = z.infer<typeof assetTypeSchema>;

export const ASSET_CATEGORIES = [
  'terrain',
  'structure',
  'nature',
  'boundary',
  'lighting',
  'signage',
  'farming',
  'crop',
  'furniture',
  'interior',
  'interaction',
  'inventory',
  'recipe',
  'shop',
] as const;
export const assetCategorySchema = z.enum(ASSET_CATEGORIES);
export type AssetCategory = z.infer<typeof assetCategorySchema>;

export const ASSET_INTERACTION_COMPATIBILITIES = [
  'decorative',
  'shop',
  'cooking_station',
  'crafting_station',
  'home_entrance',
  'farm_plot',
  'sign',
] as const;
export const assetInteractionCompatibilitySchema = z.enum(ASSET_INTERACTION_COMPATIBILITIES);
export type AssetInteractionCompatibility = z.infer<typeof assetInteractionCompatibilitySchema>;

export const GLOBAL_ASSET_SOURCE_MAX_BYTES = 5 * 1024 * 1024;
/** Defensive intake/parser ceiling; type profiles apply stricter upload limits. */
export const GLOBAL_ASSET_INTAKE_MAX_BYTES = 10 * 1024 * 1024;
/** Maximum persisted size of each sanitized source, preview, or thumbnail derivative. */
export const GLOBAL_ASSET_DERIVATIVE_MAX_BYTES = 8 * 1024 * 1024;
export const GLOBAL_ASSET_MAX_DIMENSION = 4096;
export const GLOBAL_ASSET_MAX_PIXELS = 16_777_216;

export interface AssetTypeProfile {
  readonly type: AssetType;
  readonly label: string;
  readonly description: string;
  readonly acceptedMediaTypes: readonly AssetSourceMediaType[];
  readonly maximumSourceBytes: number;
  readonly recommendedWidth: number;
  readonly recommendedHeight: number;
  readonly requiredTransparency: boolean;
  readonly allowedCategories: readonly AssetCategory[];
  readonly allowedInteractions: readonly AssetInteractionCompatibility[];
  readonly previewMode: 'isometric' | 'tile' | 'icon';
  readonly anchorRequired: boolean;
  readonly collisionSupport: 'none' | 'rectangle_capsule';
  readonly helperText: readonly string[];
}

const WORLD_MAX_BYTES = GLOBAL_ASSET_SOURCE_MAX_BYTES;
const ICON_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ASSET_SOURCE_MEDIA_TYPES;

function profile(input: Omit<AssetTypeProfile, 'acceptedMediaTypes'>): Readonly<AssetTypeProfile> {
  return Object.freeze({ ...input, acceptedMediaTypes: IMAGE_TYPES });
}

const structureHelper = [
  'Transparent background is required.',
  'Use the approved isometric camera angle and do not include a full-map background.',
  'Upload at approximately twice the intended render resolution when possible.',
] as const;
const objectHelper = [
  'Transparent background is required.',
  'Keep the object centered with predictable empty padding.',
  'Do not bake terrain, a room, or unrelated objects into the image.',
] as const;
const iconHelper = [
  'Recommended ratio: 1:1 and recommended size: 512 × 512 px.',
  'PNG or WebP only, up to 2 MB. Transparent background is recommended.',
  'Avoid embedded text unless it is part of the approved design.',
] as const;

const STRUCTURE_CATEGORIES = ['structure', 'shop'] as const;
const NATURE_CATEGORIES = ['nature'] as const;
const OBJECT_CATEGORIES = ['structure', 'nature', 'boundary', 'lighting', 'signage'] as const;
const INVENTORY_CATEGORIES = ['inventory'] as const;

const profileEntries: readonly AssetTypeProfile[] = [
  profile({
    type: 'building',
    label: 'Building',
    description: 'Isometric exterior structure.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1536,
    recommendedHeight: 1536,
    requiredTransparency: true,
    allowedCategories: STRUCTURE_CATEGORIES,
    allowedInteractions: ['decorative', 'home_entrance'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: structureHelper,
  }),
  profile({
    type: 'shop',
    label: 'Shop',
    description: 'Isometric shop or storefront.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1536,
    recommendedHeight: 1536,
    requiredTransparency: true,
    allowedCategories: ['shop'],
    allowedInteractions: ['shop'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: structureHelper,
  }),
  profile({
    type: 'cooking_station',
    label: 'Cooking station',
    description: 'Interactive cooking station.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: ['structure', 'interior'],
    allowedInteractions: ['cooking_station'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: objectHelper,
  }),
  profile({
    type: 'crafting_station',
    label: 'Crafting station',
    description: 'Interactive crafting station.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: ['structure', 'interior'],
    allowedInteractions: ['crafting_station'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: objectHelper,
  }),
  profile({
    type: 'home_entrance',
    label: 'Home entrance',
    description: 'Exterior entrance or doorway marker.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: ['structure'],
    allowedInteractions: ['home_entrance'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: structureHelper,
  }),
  profile({
    type: 'decoration',
    label: 'Decoration',
    description: 'Reusable world decoration.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: OBJECT_CATEGORIES,
    allowedInteractions: ['decorative'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: objectHelper,
  }),
  profile({
    type: 'tree',
    label: 'Tree',
    description: 'Isometric tree with a visible ground base.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1536,
    recommendedHeight: 1536,
    requiredTransparency: true,
    allowedCategories: NATURE_CATEGORIES,
    allowedInteractions: ['decorative'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: objectHelper,
  }),
  profile({
    type: 'rock',
    label: 'Rock',
    description: 'Reusable isometric rock.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: NATURE_CATEGORIES,
    allowedInteractions: ['decorative'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: objectHelper,
  }),
  profile({
    type: 'fence',
    label: 'Fence',
    description: 'Modular blocking fence segment.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: ['boundary'],
    allowedInteractions: ['decorative'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: objectHelper,
  }),
  profile({
    type: 'lamp',
    label: 'Lamp',
    description: 'World lighting prop.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: ['lighting'],
    allowedInteractions: ['decorative'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: objectHelper,
  }),
  profile({
    type: 'sign',
    label: 'Sign',
    description: 'Readable world sign or notice object.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: ['signage'],
    allowedInteractions: ['sign'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: objectHelper,
  }),
  profile({
    type: 'terrain_tile',
    label: 'Terrain tile',
    description: 'Modular terrain tile or compact tileset.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 512,
    recommendedHeight: 256,
    requiredTransparency: false,
    allowedCategories: ['terrain'],
    allowedInteractions: ['decorative'],
    previewMode: 'tile',
    anchorRequired: false,
    collisionSupport: 'none',
    helperText: [
      'Upload a modular tile or tileset, never a flattened map screenshot.',
      'Edges must connect cleanly to compatible neighboring terrain.',
      'Document intended tile dimensions before review.',
    ],
  }),
  profile({
    type: 'bridge',
    label: 'Bridge',
    description: 'Modular isometric bridge.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1536,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: ['structure'],
    allowedInteractions: ['decorative'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: structureHelper,
  }),
  profile({
    type: 'farm_plot',
    label: 'Farm plot',
    description: 'Reusable farm-plot visual.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 512,
    requiredTransparency: true,
    allowedCategories: ['farming'],
    allowedInteractions: ['farm_plot'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: objectHelper,
  }),
  profile({
    type: 'crop_stage',
    label: 'Crop stage',
    description: 'One ordered crop-growth stage.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 512,
    recommendedHeight: 512,
    requiredTransparency: true,
    allowedCategories: ['crop'],
    allowedInteractions: ['decorative'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'none',
    helperText: [
      'Keep dimensions, anchor points, and transparent padding consistent across every stage.',
      'Submit stages in their intended order.',
      'Use the approved Starville isometric angle.',
    ],
  }),
  profile({
    type: 'furniture',
    label: 'Furniture',
    description: 'Placeable furniture asset.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: ['furniture', 'interior'],
    allowedInteractions: ['decorative'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: objectHelper,
  }),
  profile({
    type: 'home_interior_object',
    label: 'Home-interior object',
    description: 'Object for private-home interiors.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 1024,
    recommendedHeight: 1024,
    requiredTransparency: true,
    allowedCategories: ['interior', 'furniture'],
    allowedInteractions: ['decorative', 'cooking_station', 'crafting_station'],
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'rectangle_capsule',
    helperText: [
      'Use the approved interior isometric angle.',
      'Document supported rotations.',
      'Do not encode doorway or exit blocking assumptions into the artwork.',
    ],
  }),
  profile({
    type: 'interaction_marker',
    label: 'Interaction marker',
    description: 'Strict non-executable interaction marker.',
    maximumSourceBytes: WORLD_MAX_BYTES,
    recommendedWidth: 512,
    recommendedHeight: 512,
    requiredTransparency: true,
    allowedCategories: ['interaction'],
    allowedInteractions: ASSET_INTERACTION_COMPATIBILITIES,
    previewMode: 'isometric',
    anchorRequired: true,
    collisionSupport: 'none',
    helperText: objectHelper,
  }),
  ...(
    ['item_icon', 'seed_icon', 'crop_icon', 'recipe_icon', 'furniture_icon', 'shop_icon'] as const
  ).map((type) =>
    profile({
      type,
      label: type.replaceAll('_', ' ').replace(/\b\w/gu, (value) => value.toUpperCase()),
      description: 'Square UI and inventory icon.',
      maximumSourceBytes: ICON_MAX_BYTES,
      recommendedWidth: 512,
      recommendedHeight: 512,
      requiredTransparency: false,
      allowedCategories:
        type === 'recipe_icon'
          ? ['recipe']
          : type === 'shop_icon'
            ? ['shop']
            : INVENTORY_CATEGORIES,
      allowedInteractions: ['decorative'],
      previewMode: 'icon',
      anchorRequired: false,
      collisionSupport: 'none',
      helperText: iconHelper,
    }),
  ),
];

export const ASSET_TYPE_PROFILES: ReadonlyMap<AssetType, Readonly<AssetTypeProfile>> = new Map(
  profileEntries.map((entry) => [entry.type, Object.freeze(entry)]),
);

export function getAssetTypeProfile(type: AssetType): Readonly<AssetTypeProfile> {
  const selected = ASSET_TYPE_PROFILES.get(type);
  if (selected === undefined) throw new Error(`Asset type profile '${type}' is unavailable`);
  return selected;
}
