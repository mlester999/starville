import 'server-only';

import { z } from 'zod';

import { AVATAR_KEY_MAX_LENGTH, AVATAR_KEY_MIN_LENGTH } from '@starville/avatar';

import { callTrustedAdminApi } from './admin-api';

const stableKeySchema = z
  .string()
  .min(AVATAR_KEY_MIN_LENGTH)
  .max(AVATAR_KEY_MAX_LENGTH)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);
const dateTimeSchema = z.iso.datetime({ offset: true });
const lifecycleSchema = z.enum([
  'draft',
  'validating',
  'invalid',
  'in_review',
  'changes_requested',
  'approved',
  'active',
  'superseded',
  'disabled',
  'rejected',
]);
const layerSchema = z.enum([
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
]);
const directionSchema = z.enum([
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
]);
const animationStateSchema = z.enum(['idle', 'walk', 'jog']);

export const avatarContentSummarySchema = z
  .object({
    definitionId: z.uuid(),
    stableKey: stableKeySchema,
    publicName: z.string().min(1).max(80),
    description: z.string().max(500),
    category: stableKeySchema,
    layer: layerSchema,
    enabled: z.boolean(),
    publicationState: lifecycleSchema,
    activeVersionId: z.uuid().nullable(),
    activeVersionNumber: z.number().int().positive().nullable(),
    compatibleBodyKeys: z.array(stableKeySchema).max(20),
    directions: z.array(directionSchema).max(8),
    animationStates: z.array(animationStateSchema).max(3),
    assetStatus: z.enum(['missing', 'draft', 'approved', 'active', 'development_fallback']),
    usageCount: z.number().int().nonnegative(),
    validationState: z.enum(['not_run', 'valid', 'warning', 'invalid']),
    reviewerDisplayName: z.string().min(1).max(80).nullable(),
    updatedAt: dateTimeSchema,
  })
  .strict();
export type AvatarContentSummary = z.infer<typeof avatarContentSummarySchema>;

export const avatarCatalogPageSchema = z
  .object({
    items: z.array(avatarContentSummarySchema).max(100),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const avatarOverviewSchema = z
  .object({
    definitions: z.number().int().nonnegative(),
    activeDefinitions: z.number().int().nonnegative(),
    reviewQueue: z.number().int().nonnegative(),
    invalidVersions: z.number().int().nonnegative(),
    publishedPresets: z.number().int().nonnegative(),
    playerProfiles: z.number().int().nonnegative(),
    developmentFallbacks: z.number().int().nonnegative(),
    missingDirections: z.number().int().nonnegative(),
    recent: z.array(avatarContentSummarySchema).max(8),
  })
  .strict();

const avatarSelectionSchema = z
  .object({
    body: stableKeySchema,
    skinTone: stableKeySchema,
    face: stableKeySchema,
    eyes: stableKeySchema,
    eyebrows: stableKeySchema,
    hair: stableKeySchema,
    hairColor: stableKeySchema,
    top: stableKeySchema,
    bottom: stableKeySchema,
    footwear: stableKeySchema,
    accessories: z.array(stableKeySchema).max(4),
  })
  .strict();

const avatarPresetSchema = z
  .object({
    presetId: z.uuid(),
    stableKey: stableKeySchema,
    publicName: z.string().min(1).max(80),
    description: z.string().max(280),
    state: lifecycleSchema,
    version: z.number().int().positive(),
    revision: z.number().int().positive(),
    selection: avatarSelectionSchema,
    updatedAt: dateTimeSchema,
  })
  .strict();

export const avatarPresetsSchema = z
  .object({ items: z.array(avatarPresetSchema).max(50) })
  .strict();

const auditEventSchema = z
  .object({
    eventId: z.uuid(),
    action: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[a-z][a-z0-9_.-]*$/u),
    targetType: stableKeySchema,
    targetId: z.uuid().nullable(),
    actorDisplayName: z.string().min(1).max(80),
    summary: z.string().min(1).max(500),
    createdAt: dateTimeSchema,
  })
  .strict();

export const avatarAuditPageSchema = z
  .object({
    items: z.array(auditEventSchema).max(100),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const avatarSettingsSchema = z
  .object({
    revision: z.number().int().positive(),
    customizationEnabled: z.boolean(),
    creatorRequiredForNewPlayers: z.boolean(),
    maintenanceMode: z.boolean(),
    maximumAccessories: z.number().int().min(0).max(4),
    fallbackPresetKey: stableKeySchema,
    updatedAt: dateTimeSchema,
  })
  .strict();

const avatarAssetReferenceSchema = z
  .object({
    role: z.enum([
      'sprite_sheet',
      'layer_sheet',
      'preview',
      'thumbnail',
      'palette',
      'accessory_sheet',
    ]),
    worldAssetId: z.uuid(),
    worldAssetVersionId: z.uuid(),
    assetKey: stableKeySchema,
    assetState: z.enum(['approved', 'active', 'deprecated']),
    mediaType: z.enum(['image/png', 'image/webp']),
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
  })
  .strict();

const avatarAnimationDefinitionSchema = z
  .object({
    state: animationStateSchema,
    direction: directionSchema,
    row: z.number().int().min(0).max(63),
    startColumn: z.number().int().min(0).max(63),
    frameCount: z.number().int().min(1).max(24),
    frameDurationMs: z.number().int().min(40).max(2000),
    padding: z.number().int().min(0).max(32),
    loop: z.boolean(),
    anchorX: z.number().min(0).max(1),
    anchorY: z.number().min(0).max(1),
  })
  .strict();

const avatarVersionDetailSchema = z
  .object({
    versionId: z.uuid(),
    versionNumber: z.number().int().positive(),
    state: lifecycleSchema,
    revision: z.number().int().positive(),
    renderOrder: z.number().int().min(-100).max(100),
    offsetX: z.number().min(-256).max(256),
    offsetY: z.number().min(-256).max(256),
    anchorX: z.number().min(0).max(1),
    anchorY: z.number().min(0).max(1),
    fallbackKey: stableKeySchema.nullable(),
    compatibleBodyKeys: z.array(stableKeySchema).max(20),
    directions: z.array(directionSchema).max(8),
    animationStates: z.array(animationStateSchema).max(3),
    assets: z.array(avatarAssetReferenceSchema).max(8),
    animations: z.array(avatarAnimationDefinitionSchema).max(72),
    validationState: z.enum(['not_run', 'valid', 'warning', 'invalid']),
    validationMessages: z.array(z.string().min(1).max(240)).max(100),
    submittedBy: z.string().min(1).max(80).nullable(),
    reviewedBy: z.string().min(1).max(80).nullable(),
    createdAt: dateTimeSchema,
  })
  .strict();

export const avatarDefinitionDetailSchema = z
  .object({
    definition: avatarContentSummarySchema,
    versions: z.array(avatarVersionDetailSchema).max(100),
  })
  .strict();

export async function loadAvatarOverview() {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/avatar-content/overview',
    parser: (value) => avatarOverviewSchema.parse(value),
  });
}

export async function loadAvatarCatalog(query: {
  readonly page?: number;
  readonly pageSize?: 20 | 50 | 100;
  readonly search?: string;
  readonly category?: string;
  readonly layer?: string;
  readonly state?: string;
  readonly compatibility?: string;
  readonly missing?: string;
}) {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 50));
  for (const key of ['search', 'category', 'layer', 'state', 'compatibility', 'missing'] as const) {
    const value = query[key];
    if (value !== undefined && value !== '') params.set(key, value.slice(0, 80));
  }
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/avatar-content/catalog?${params.toString()}`,
    parser: (value) => avatarCatalogPageSchema.parse(value),
  });
}

export async function loadAvatarReviewQueue(page = 1) {
  return loadAvatarCatalog({ page, pageSize: 50, state: 'in_review' });
}

export async function loadAvatarPresets() {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/avatar-content/presets',
    parser: (value) => avatarPresetsSchema.parse(value),
  });
}

export async function loadAvatarAudit(page = 1) {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/avatar-content/audit?page=${String(page)}&pageSize=50`,
    parser: (value) => avatarAuditPageSchema.parse(value),
  });
}

export async function loadAvatarSettings() {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/avatar-content/settings',
    parser: (value) => avatarSettingsSchema.parse(value),
  });
}

export async function loadAvatarDefinition(definitionId: string) {
  const safeDefinitionId = z.uuid().parse(definitionId);
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/avatar-content/catalog/${safeDefinitionId}`,
    parser: (value) => avatarDefinitionDetailSchema.parse(value),
  });
}
