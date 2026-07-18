import { z } from 'zod';

import { appearancePresetSchema, type AppearancePreset } from '@starville/game-core';

import {
  AVATAR_MAX_ACCESSORIES,
  avatarProfileSchema,
  avatarSelectionSchema,
  avatarStableKeySchema,
  resolvedPublicAvatarSchema,
  type AvatarProfile,
  type AvatarSelection,
  type ResolvedPublicAvatar,
} from './contracts';

export const persistedAvatarSelectionSchema = z
  .object({
    bodyPresetKey: avatarStableKeySchema.nullable(),
    skinPaletteKey: avatarStableKeySchema.nullable(),
    faceKey: avatarStableKeySchema.nullable(),
    eyesKey: avatarStableKeySchema.nullable(),
    eyebrowsKey: avatarStableKeySchema.nullable(),
    hairKey: avatarStableKeySchema.nullable(),
    hairPaletteKey: avatarStableKeySchema.nullable(),
    topKey: avatarStableKeySchema.nullable(),
    bottomKey: avatarStableKeySchema.nullable(),
    footwearKey: avatarStableKeySchema.nullable(),
    accessoryKeys: z.array(avatarStableKeySchema).max(AVATAR_MAX_ACCESSORIES),
    presetKey: avatarStableKeySchema.nullable(),
  })
  .strict();
export type PersistedAvatarSelection = z.infer<typeof persistedAvatarSelectionSchema>;

const storageObjectPathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine(
    (value) =>
      !/^[a-z][a-z0-9+.-]*:/iu.test(value) &&
      !/(?:^|\/)\.\.(?:\/|$)/u.test(value) &&
      !/[<>\p{Cc}\\]/u.test(value),
  );

export const persistedAvatarAssetDescriptorSchema = z
  .object({
    role: z.enum([
      'sprite_sheet',
      'layer_sheet',
      'preview',
      'thumbnail',
      'palette',
      'accessory_sheet',
    ]),
    assetId: z.uuid(),
    assetVersionId: z.uuid(),
    bucket: z.literal('game-assets'),
    objectPath: storageObjectPathSchema,
    previewObjectPath: storageObjectPathSchema.nullable(),
    thumbnailObjectPath: storageObjectPathSchema.nullable(),
    width: z.number().int().positive().max(8_192).nullable(),
    height: z.number().int().positive().max(8_192).nullable(),
  })
  .strict();

export const persistedAvatarContentSelectionSchema = z
  .object({
    key: avatarStableKeySchema.nullable(),
    type: z.enum(['face', 'eyes', 'eyebrows', 'hair', 'top', 'bottom', 'footwear', 'accessory']),
    versionId: z.uuid(),
    versionNumber: z.number().int().positive(),
    renderOrder: z.number().int().min(-1_000).max(1_000),
    assets: z.array(persistedAvatarAssetDescriptorSchema).max(8),
  })
  .strict();

const persistedProfileFields = {
  appearanceId: z.uuid(),
  revision: z.number().int().nonnegative(),
  creatorCompleted: z.boolean(),
  moduleEnabled: z.boolean(),
  renderMode: z.enum(['modular', 'legacy_fallback']).optional(),
  legacyFallbackPreset: appearancePresetSchema,
  bodyPresetKey: avatarStableKeySchema,
  skinPaletteKey: avatarStableKeySchema.nullable(),
  selections: z
    .object({
      face: persistedAvatarContentSelectionSchema.nullable(),
      eyes: persistedAvatarContentSelectionSchema.nullable(),
      eyebrows: persistedAvatarContentSelectionSchema.nullable(),
      hair: persistedAvatarContentSelectionSchema.nullable(),
      top: persistedAvatarContentSelectionSchema.nullable(),
      bottom: persistedAvatarContentSelectionSchema.nullable(),
      footwear: persistedAvatarContentSelectionSchema.nullable(),
    })
    .strict(),
  hairPaletteKey: avatarStableKeySchema.nullable(),
  accessories: z.array(persistedAvatarContentSelectionSchema).max(AVATAR_MAX_ACCESSORIES),
  presetKey: avatarStableKeySchema.nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
} as const;

export const persistedAvatarProfileSchema = z.object(persistedProfileFields).strict();
export type PersistedAvatarProfile = z.infer<typeof persistedAvatarProfileSchema>;

export const persistedResolvedAvatarSchema = z
  .object({
    status: z.literal('loaded'),
    appearance: z.object(persistedProfileFields).strict(),
  })
  .strict();

export const avatarPersistenceStatusSchema = z.enum([
  'created',
  'updated',
  'replayed',
  'profile_changed',
  'request_already_processed',
  'invalid_selection',
  'incompatible_selection',
  'content_unavailable',
  'protected_content',
  'module_disabled',
  'maintenance',
  'suspended',
  'rename_required',
  'access_revoked',
  'not_found',
  'rate_limited',
]);
export type AvatarPersistenceStatus = z.infer<typeof avatarPersistenceStatusSchema>;

export const avatarMutationPersistenceResultSchema = z.union([
  z
    .object({
      status: z.enum(['created', 'updated', 'replayed']),
      replayed: z.boolean().optional().default(false),
      profile: persistedAvatarProfileSchema,
    })
    .strict(),
  z
    .object({ status: z.literal('profile_changed'), profile: persistedAvatarProfileSchema })
    .strict(),
  z
    .object({
      status: avatarPersistenceStatusSchema.exclude([
        'created',
        'updated',
        'replayed',
        'profile_changed',
      ]),
    })
    .strict(),
]);
export type AvatarMutationPersistenceResult = z.infer<typeof avatarMutationPersistenceResultSchema>;

export const avatarReadPersistenceResultSchema = z.union([
  z.object({ status: z.literal('loaded'), profile: persistedAvatarProfileSchema }).strict(),
  z
    .object({
      status: z.enum([
        'not_found',
        'module_disabled',
        'maintenance',
        'suspended',
        'rename_required',
        'access_revoked',
        'rate_limited',
      ]),
    })
    .strict(),
]);
export type AvatarReadPersistenceResult = z.infer<typeof avatarReadPersistenceResultSchema>;

function requireSelectionKey(value: string | null, field: string): string {
  if (value === null) throw new Error(`Resolved avatar profile is missing ${field}.`);
  return value;
}

export function legacyFallbackAvatarSelection(preset: AppearancePreset): AvatarSelection {
  const selections: Readonly<Record<AppearancePreset, AvatarSelection>> = {
    moss: {
      body: 'meadow-frame',
      skinTone: 'peach-warm',
      face: 'soft-smile',
      eyes: 'round-eyes',
      eyebrows: 'gentle-brows',
      hair: 'short-waves',
      hairColor: 'espresso',
      top: 'moss-tunic',
      bottom: 'meadow-trousers',
      footwear: 'trail-boots',
      accessories: ['leaf-clip'],
    },
    marigold: {
      body: 'willow-frame',
      skinTone: 'rose-light',
      face: 'bright-smile',
      eyes: 'bright-eyes',
      eyebrows: 'arched-brows',
      hair: 'cozy-bob',
      hairColor: 'chestnut',
      top: 'marigold-jacket',
      bottom: 'umber-trousers',
      footwear: 'festival-shoes',
      accessories: ['star-hairpin'],
    },
    moonberry: {
      body: 'brook-frame',
      skinTone: 'honey-gold',
      face: 'thoughtful-face',
      eyes: 'spark-eyes',
      eyebrows: 'straight-brows',
      hair: 'long-waves',
      hairColor: 'moonberry',
      top: 'moonberry-cardigan',
      bottom: 'moonberry-skirt',
      footwear: 'garden-shoes',
      accessories: ['round-glasses'],
    },
    river: {
      body: 'meadow-frame',
      skinTone: 'umber-warm',
      face: 'sunny-face',
      eyes: 'calm-eyes',
      eyebrows: 'short-brows',
      hair: 'cloud-curls',
      hairColor: 'midnight',
      top: 'river-vest',
      bottom: 'river-shorts',
      footwear: 'river-boots',
      accessories: ['cozy-scarf'],
    },
  };
  return structuredClone(selections[preset]);
}

export function toPersistedAvatarSelection(
  selection: AvatarSelection,
  presetKey: string | null = null,
): PersistedAvatarSelection {
  const parsed = avatarSelectionSchema.parse(selection);
  return persistedAvatarSelectionSchema.parse({
    bodyPresetKey: parsed.body,
    skinPaletteKey: parsed.skinTone,
    faceKey: parsed.face,
    eyesKey: parsed.eyes,
    eyebrowsKey: parsed.eyebrows,
    hairKey: parsed.hair,
    hairPaletteKey: parsed.hairColor,
    topKey: parsed.top,
    bottomKey: parsed.bottom,
    footwearKey: parsed.footwear,
    accessoryKeys: parsed.accessories,
    presetKey,
  });
}

export function fromPersistedAvatarSelection(value: unknown): AvatarSelection {
  const selection = persistedAvatarSelectionSchema.parse(value);
  return avatarSelectionSchema.parse({
    body: requireSelectionKey(selection.bodyPresetKey, 'bodyPresetKey'),
    skinTone: requireSelectionKey(selection.skinPaletteKey, 'skinPaletteKey'),
    face: requireSelectionKey(selection.faceKey, 'faceKey'),
    eyes: requireSelectionKey(selection.eyesKey, 'eyesKey'),
    eyebrows: requireSelectionKey(selection.eyebrowsKey, 'eyebrowsKey'),
    hair: requireSelectionKey(selection.hairKey, 'hairKey'),
    hairColor: requireSelectionKey(selection.hairPaletteKey, 'hairPaletteKey'),
    top: requireSelectionKey(selection.topKey, 'topKey'),
    bottom: requireSelectionKey(selection.bottomKey, 'bottomKey'),
    footwear: requireSelectionKey(selection.footwearKey, 'footwearKey'),
    accessories: selection.accessoryKeys,
  });
}

export function fromPersistedAvatarProfile(value: unknown): AvatarProfile {
  const profile = persistedAvatarProfileSchema.parse(value);
  const contentKeys = {
    face: profile.selections.face?.key ?? null,
    eyes: profile.selections.eyes?.key ?? null,
    eyebrows: profile.selections.eyebrows?.key ?? null,
    hair: profile.selections.hair?.key ?? null,
    top: profile.selections.top?.key ?? null,
    bottom: profile.selections.bottom?.key ?? null,
    footwear: profile.selections.footwear?.key ?? null,
  };
  const complete =
    profile.creatorCompleted &&
    profile.moduleEnabled &&
    profile.skinPaletteKey !== null &&
    profile.hairPaletteKey !== null &&
    Object.values(contentKeys).every((key) => key !== null) &&
    profile.accessories.every((accessory) => accessory.key !== null);
  const selection = complete
    ? avatarSelectionSchema.parse({
        body: profile.bodyPresetKey,
        skinTone: profile.skinPaletteKey,
        face: contentKeys.face,
        eyes: contentKeys.eyes,
        eyebrows: contentKeys.eyebrows,
        hair: contentKeys.hair,
        hairColor: profile.hairPaletteKey,
        top: contentKeys.top,
        bottom: contentKeys.bottom,
        footwear: contentKeys.footwear,
        accessories: profile.accessories.map((accessory) => accessory.key),
      })
    : legacyFallbackAvatarSelection(profile.legacyFallbackPreset);
  return avatarProfileSchema.parse({
    appearanceId: profile.appearanceId,
    revision: profile.revision,
    creatorCompleted: profile.creatorCompleted,
    legacyFallbackPreset: profile.legacyFallbackPreset,
    selection,
    presetKey: profile.presetKey,
    updatedAt: profile.updatedAt,
  });
}

export function toResolvedPublicAvatar(value: unknown): ResolvedPublicAvatar {
  const profile = fromPersistedAvatarProfile(value);
  return resolvedPublicAvatarSchema.parse({
    appearanceId: profile.appearanceId,
    revision: profile.revision,
    legacyFallbackPreset: profile.legacyFallbackPreset,
    selection: profile.selection,
    presetKey: profile.presetKey,
  });
}
