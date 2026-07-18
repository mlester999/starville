import { z } from 'zod';

import { appearancePresetSchema, facingDirectionSchema } from '@starville/game-core';

export const AVATAR_KEY_MIN_LENGTH = 3 as const;
export const AVATAR_KEY_MAX_LENGTH = 80 as const;
export const AVATAR_MAX_ACCESSORIES = 4 as const;

export const avatarStableKeySchema = z
  .string()
  .min(AVATAR_KEY_MIN_LENGTH)
  .max(AVATAR_KEY_MAX_LENGTH)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);
export type AvatarStableKey = z.infer<typeof avatarStableKeySchema>;

const safeText = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => !/[<>\p{Cc}]/u.test(value));

export const AVATAR_SELECTION_LAYERS = [
  'body',
  'skinTone',
  'face',
  'eyes',
  'eyebrows',
  'hair',
  'hairColor',
  'top',
  'bottom',
  'footwear',
  'accessories',
] as const;
export const avatarSelectionLayerSchema = z.enum(AVATAR_SELECTION_LAYERS);
export type AvatarSelectionLayer = z.infer<typeof avatarSelectionLayerSchema>;

export const AVATAR_CONTENT_LAYERS = [
  'base_body',
  'skin_tone',
  'face',
  'eyes',
  'eyebrows',
  'hair_back',
  'hair_front',
  'top',
  'bottom',
  'footwear',
  'head_accessory',
  'face_accessory',
  'back_accessory',
  'handheld_visual',
  'activity_override',
  'shadow',
] as const;
export const avatarContentLayerSchema = z.enum(AVATAR_CONTENT_LAYERS);
export type AvatarContentLayer = z.infer<typeof avatarContentLayerSchema>;

export const AVATAR_ANIMATION_STATES = ['idle', 'walk', 'jog'] as const;
export const avatarAnimationStateSchema = z.enum(AVATAR_ANIMATION_STATES);
export type AvatarAnimationState = z.infer<typeof avatarAnimationStateSchema>;

export const avatarSelectionSchema = z
  .object({
    body: avatarStableKeySchema,
    skinTone: avatarStableKeySchema,
    face: avatarStableKeySchema,
    eyes: avatarStableKeySchema,
    eyebrows: avatarStableKeySchema,
    hair: avatarStableKeySchema,
    hairColor: avatarStableKeySchema,
    top: avatarStableKeySchema,
    bottom: avatarStableKeySchema,
    footwear: avatarStableKeySchema,
    accessories: z.array(avatarStableKeySchema).max(AVATAR_MAX_ACCESSORIES),
  })
  .strict()
  .superRefine((selection, context) => {
    if (new Set(selection.accessories).size !== selection.accessories.length) {
      context.addIssue({
        code: 'custom',
        path: ['accessories'],
        message: 'Avatar accessory keys must be unique',
      });
    }
  });
export type AvatarSelection = z.infer<typeof avatarSelectionSchema>;

export const avatarProfileSchema = z
  .object({
    appearanceId: z.uuid(),
    revision: z.number().int().nonnegative(),
    creatorCompleted: z.boolean(),
    legacyFallbackPreset: appearancePresetSchema,
    selection: avatarSelectionSchema,
    presetKey: avatarStableKeySchema.nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type AvatarProfile = z.infer<typeof avatarProfileSchema>;

export const resolvedPublicAvatarSchema = avatarProfileSchema
  .omit({ creatorCompleted: true, updatedAt: true })
  .strict();
export type ResolvedPublicAvatar = z.infer<typeof resolvedPublicAvatarSchema>;

export const compactAppearanceReferenceSchema = z
  .object({
    appearanceId: z.uuid(),
    appearanceRevision: z.number().int().nonnegative(),
  })
  .strict();
export type CompactAppearanceReference = z.infer<typeof compactAppearanceReferenceSchema>;

export const avatarCatalogOptionSchema = z
  .object({
    key: avatarStableKeySchema,
    label: safeText(1, 80),
    description: safeText(0, 240),
    swatch: z
      .string()
      .regex(/^#[0-9a-f]{6}$/iu)
      .optional(),
    developmentFallback: z.boolean(),
    enabled: z.boolean(),
    available: z.boolean(),
  })
  .strict();
export type AvatarCatalogOption = z.infer<typeof avatarCatalogOptionSchema>;

export const avatarCatalogPresetSchema = z
  .object({
    key: avatarStableKeySchema,
    label: safeText(1, 80),
    description: safeText(0, 240),
    selection: avatarSelectionSchema,
  })
  .strict();
export type AvatarCatalogPreset = z.infer<typeof avatarCatalogPresetSchema>;

const avatarCatalogOptionsSchema = z.object({
  body: z.array(avatarCatalogOptionSchema).max(100),
  skinTone: z.array(avatarCatalogOptionSchema).max(100),
  face: z.array(avatarCatalogOptionSchema).max(100),
  eyes: z.array(avatarCatalogOptionSchema).max(100),
  eyebrows: z.array(avatarCatalogOptionSchema).max(100),
  hair: z.array(avatarCatalogOptionSchema).max(100),
  hairColor: z.array(avatarCatalogOptionSchema).max(100),
  top: z.array(avatarCatalogOptionSchema).max(100),
  bottom: z.array(avatarCatalogOptionSchema).max(100),
  footwear: z.array(avatarCatalogOptionSchema).max(100),
  accessories: z.array(avatarCatalogOptionSchema).max(100),
});

export const avatarStarterCatalogSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    options: avatarCatalogOptionsSchema.strict(),
    presets: z.array(avatarCatalogPresetSchema).max(40),
    settings: z
      .object({
        maximumAccessories: z.number().int().min(0).max(AVATAR_MAX_ACCESSORIES),
        customizationEnabled: z.boolean(),
        developmentFallback: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type AvatarStarterCatalog = z.infer<typeof avatarStarterCatalogSchema>;

export const avatarCreateRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    selection: avatarSelectionSchema,
  })
  .strict();
export type AvatarCreateRequest = z.infer<typeof avatarCreateRequestSchema>;

export const avatarUpdateRequestSchema = avatarCreateRequestSchema
  .extend({ expectedRevision: z.number().int().positive() })
  .strict();
export type AvatarUpdateRequest = z.infer<typeof avatarUpdateRequestSchema>;

export const avatarPreviewRequestSchema = z.object({ selection: avatarSelectionSchema }).strict();
export type AvatarPreviewRequest = z.infer<typeof avatarPreviewRequestSchema>;

export const avatarAssetTypeSchema = z.enum([
  'avatar_sprite_sheet',
  'avatar_layer_sheet',
  'avatar_preview',
  'avatar_thumbnail',
  'avatar_palette',
  'avatar_accessory_sheet',
]);
export type AvatarAssetType = z.infer<typeof avatarAssetTypeSchema>;

export const avatarAnimationFrameMappingSchema = z
  .object({
    direction: facingDirectionSchema,
    state: avatarAnimationStateSchema,
    row: z.number().int().min(0).max(63),
    startColumn: z.number().int().min(0).max(63),
    frameCount: z.number().int().min(1).max(24),
    frameDurationMs: z.number().int().min(40).max(2_000),
    loop: z.boolean(),
    anchorX: z.number().min(0).max(1),
    anchorY: z.number().min(0).max(1),
  })
  .strict();
export type AvatarAnimationFrameMapping = z.infer<typeof avatarAnimationFrameMappingSchema>;

export const avatarAnimationSetSchema = z
  .array(avatarAnimationFrameMappingSchema)
  .length(24)
  .superRefine((mappings, context) => {
    const identities = mappings.map((mapping) => `${mapping.state}:${mapping.direction}`);
    if (new Set(identities).size !== identities.length) {
      context.addIssue({ code: 'custom', message: 'Animation mappings must be unique' });
    }
    for (const state of AVATAR_ANIMATION_STATES) {
      for (const direction of facingDirectionSchema.options) {
        if (!identities.includes(`${state}:${direction}`)) {
          context.addIssue({
            code: 'custom',
            message: `Missing ${state} ${direction} avatar animation`,
          });
        }
      }
    }
  });

export const avatarLayerAnimationSetSchema = z
  .object({
    layer: avatarContentLayerSchema,
    frameWidth: z.number().int().min(1).max(2_048),
    frameHeight: z.number().int().min(1).max(2_048),
    mappings: avatarAnimationSetSchema,
  })
  .strict();

export const avatarAlignedLayerCollectionSchema = z
  .array(avatarLayerAnimationSetSchema)
  .min(1)
  .max(17)
  .superRefine((layers, context) => {
    if (new Set(layers.map((layer) => layer.layer)).size !== layers.length) {
      context.addIssue({ code: 'custom', message: 'Avatar animation layers must be unique' });
    }
    const [reference] = layers;
    if (reference === undefined) return;
    for (const [layerIndex, layer] of layers.entries()) {
      if (
        layer.frameWidth !== reference.frameWidth ||
        layer.frameHeight !== reference.frameHeight
      ) {
        context.addIssue({
          code: 'custom',
          path: [layerIndex],
          message: 'Avatar layer frame dimensions must align',
        });
      }
      layer.mappings.forEach((mapping, mappingIndex) => {
        const expected = reference.mappings.find(
          (candidate) =>
            candidate.direction === mapping.direction && candidate.state === mapping.state,
        );
        if (expected !== undefined && expected.frameCount !== mapping.frameCount) {
          context.addIssue({
            code: 'custom',
            path: [layerIndex, 'mappings', mappingIndex, 'frameCount'],
            message: 'Avatar layer frame counts must align',
          });
        }
      });
    }
  });
