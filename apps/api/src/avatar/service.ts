import { z } from 'zod';

import {
  AVATAR_SELECTION_LAYERS,
  avatarCreateRequestSchema,
  avatarMutationPersistenceResultSchema,
  avatarPreviewRequestSchema,
  avatarReadPersistenceResultSchema,
  avatarStableKeySchema,
  avatarStarterCatalogSchema,
  avatarUpdateRequestSchema,
  fromPersistedAvatarProfile,
  fromPersistedAvatarSelection,
  persistedAvatarAssetDescriptorSchema,
  persistedAvatarSelectionSchema,
  persistedResolvedAvatarSchema,
  toPersistedAvatarSelection,
  toResolvedPublicAvatar,
  type AvatarCatalogOption,
  type AvatarPersistenceStatus,
  type AvatarStarterCatalog,
} from '@starville/avatar';
import { facingDirectionSchema } from '@starville/game-core';

import type { ServiceLogger } from '../contracts.js';
import { PublicApiError, type SafeApiErrorCode } from '../errors.js';
import type { AvatarGateway, AvatarPlayerContext, AvatarService } from './contracts.js';
import { AvatarPersistenceError } from './gateway.js';

const bodyPresetSchema = z
  .object({
    key: avatarStableKeySchema,
    label: z.string().trim().min(1).max(80),
    frameWidth: z.number().int().min(16).max(512),
    frameHeight: z.number().int().min(16).max(512),
    anchorX: z.number().min(0).max(1),
    anchorY: z.number().min(0).max(1),
  })
  .strict();

const catalogAnimationSchema = z
  .object({
    direction: facingDirectionSchema,
    state: z.enum(['idle', 'walking', 'jogging']),
    frames: z.array(z.number().int().min(0).max(16_383)).min(1).max(64),
    frameDurationMs: z.number().int().min(40).max(2_000),
    loop: z.boolean(),
    offsetX: z.number().int().min(-512).max(512),
    offsetY: z.number().int().min(-512).max(512),
  })
  .strict();

const catalogItemSchema = z
  .object({
    key: avatarStableKeySchema,
    type: z.enum(['face', 'eyes', 'eyebrows', 'hair', 'top', 'bottom', 'footwear', 'accessory']),
    label: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500),
    accessLevel: z.literal('starter'),
    versionId: z.uuid(),
    versionNumber: z.number().int().positive(),
    renderOrder: z.number().int().min(-1_000).max(1_000),
    frameWidth: z.number().int().min(1).max(2_048),
    frameHeight: z.number().int().min(1).max(2_048),
    sheetRows: z.number().int().min(1).max(128),
    sheetColumns: z.number().int().min(1).max(128),
    padding: z.number().int().min(0).max(128),
    previewScale: z.number().min(0.05).max(8),
    castsShadow: z.boolean(),
    assets: z.array(persistedAvatarAssetDescriptorSchema).max(8),
    animations: z.array(catalogAnimationSchema).max(24),
    compatibleBodyPresetKeys: z.array(avatarStableKeySchema).max(20),
  })
  .strict();

const paletteSchema = z
  .object({
    key: avatarStableKeySchema,
    type: z.enum(['skin', 'hair']),
    label: z.string().trim().min(1).max(80),
    colors: z
      .array(z.string().regex(/^#[0-9a-f]{6}$/iu))
      .min(1)
      .max(16),
    versionId: z.uuid(),
    versionNumber: z.number().int().positive(),
  })
  .strict();

const catalogPresetSchema = z
  .object({
    key: avatarStableKeySchema,
    label: z.string().trim().min(1).max(80),
    versionId: z.uuid(),
    versionNumber: z.number().int().positive(),
    selection: persistedAvatarSelectionSchema,
  })
  .strict();

const persistedCatalogResultSchema = z
  .object({
    status: z.literal('loaded'),
    catalog: z
      .object({
        bodyPresets: z.array(bodyPresetSchema).max(20),
        items: z.array(catalogItemSchema).max(800),
        palettes: z.array(paletteSchema).max(100),
        presets: z.array(catalogPresetSchema).max(40),
        limits: z.object({ maxAccessories: z.number().int().min(0).max(4) }).strict(),
      })
      .strict(),
  })
  .strict();

const previewResultSchema = z
  .object({
    status: z.literal('previewed'),
    preview: z
      .object({
        selection: persistedAvatarSelectionSchema,
        resolvedVersionIds: z.record(z.string(), z.unknown()),
        items: z.array(z.record(z.string(), z.unknown())).max(11),
      })
      .strict(),
  })
  .strict();

const failureStatusSchema = z
  .object({
    status: z.enum([
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
    ]),
  })
  .passthrough();

function persistenceStatusFailure(status: AvatarPersistenceStatus): never {
  const mapping: Readonly<
    Record<
      Exclude<AvatarPersistenceStatus, 'created' | 'updated' | 'replayed'>,
      readonly [PublicApiError['statusCode'], SafeApiErrorCode]
    >
  > = {
    profile_changed: [409, 'AVATAR_PROFILE_CHANGED'],
    request_already_processed: [409, 'REQUEST_ALREADY_PROCESSED'],
    invalid_selection: [400, 'INVALID_AVATAR_SELECTION'],
    incompatible_selection: [422, 'AVATAR_SELECTION_INCOMPATIBLE'],
    content_unavailable: [404, 'AVATAR_CONTENT_UNAVAILABLE'],
    protected_content: [403, 'AVATAR_CONTENT_PROTECTED'],
    module_disabled: [404, 'MODULE_DISABLED'],
    maintenance: [503, 'AVATAR_MAINTENANCE'],
    suspended: [403, 'PLAYER_SUSPENDED'],
    rename_required: [409, 'PLAYER_RENAME_REQUIRED'],
    access_revoked: [401, 'TOKEN_ACCESS_REVOKED'],
    not_found: [404, 'AVATAR_PROFILE_NOT_FOUND'],
    rate_limited: [429, 'RATE_LIMITED'],
  };
  if (status === 'created' || status === 'updated' || status === 'replayed') {
    throw new PublicApiError(503, 'AVATAR_UNAVAILABLE');
  }
  const [statusCode, code] = mapping[status];
  throw new PublicApiError(statusCode, code);
}

function option(
  key: string,
  label: string,
  description: string,
  developmentFallback: boolean,
  swatch?: string,
): AvatarCatalogOption {
  return {
    key,
    label,
    description,
    ...(swatch === undefined ? {} : { swatch }),
    developmentFallback,
    enabled: true,
    available: true,
  };
}

function normalizeCatalog(
  result: z.infer<typeof persistedCatalogResultSchema>,
): AvatarStarterCatalog {
  const { catalog } = result;
  const byType = (type: z.infer<typeof catalogItemSchema>['type']) =>
    catalog.items
      .filter((item) => item.type === type)
      .map((item) => option(item.key, item.label, item.description, item.assets.length === 0));
  const options: AvatarStarterCatalog['options'] = {
    body: catalog.bodyPresets.map((body) =>
      option(body.key, body.label, 'A cosmetic Starville body preset.', true),
    ),
    skinTone: catalog.palettes
      .filter((palette) => palette.type === 'skin')
      .map((palette) =>
        option(
          palette.key,
          palette.label,
          'An approved Starville skin-tone palette.',
          false,
          palette.colors[0],
        ),
      ),
    face: byType('face'),
    eyes: byType('eyes'),
    eyebrows: byType('eyebrows'),
    hair: byType('hair'),
    hairColor: catalog.palettes
      .filter((palette) => palette.type === 'hair')
      .map((palette) =>
        option(
          palette.key,
          palette.label,
          'An approved Starville hair-color palette.',
          false,
          palette.colors[0],
        ),
      ),
    top: byType('top'),
    bottom: byType('bottom'),
    footwear: byType('footwear'),
    accessories: byType('accessory'),
  };
  const complete = AVATAR_SELECTION_LAYERS.every((layer) => options[layer].length > 0);
  const revision = Math.max(
    0,
    ...catalog.items.map((item) => item.versionNumber),
    ...catalog.palettes.map((palette) => palette.versionNumber),
    ...catalog.presets.map((preset) => preset.versionNumber),
  );
  return avatarStarterCatalogSchema.parse({
    revision,
    options,
    presets: catalog.presets.map((preset) => ({
      key: preset.key,
      label: preset.label,
      description: 'A curated Starville starter appearance.',
      selection: fromPersistedAvatarSelection(preset.selection),
    })),
    settings: {
      maximumAccessories: catalog.limits.maxAccessories,
      customizationEnabled: complete,
      developmentFallback: catalog.items.some((item) => item.assets.length === 0),
    },
  });
}

export function createAvatarService(options: {
  readonly gateway: AvatarGateway;
  readonly logger: ServiceLogger;
}): AvatarService {
  async function invoke<T>(
    context: AvatarPlayerContext | { readonly requestId: string },
    operation: string,
    callback: () => Promise<unknown>,
    parser: (value: unknown) => T,
  ): Promise<T> {
    try {
      return parser(await callback());
    } catch (error) {
      if (error instanceof PublicApiError) throw error;
      options.logger
        .child({ requestId: context.requestId })
        .error('avatar.persistence.unavailable', {
          operation,
          failureName: error instanceof Error ? error.name : 'unknown',
          ...(error instanceof AvatarPersistenceError
            ? { rpcName: error.operation, postgresCode: error.postgresCode }
            : {}),
        });
      throw new PublicApiError(503, 'AVATAR_UNAVAILABLE');
    }
  }

  function parseFailure(value: unknown): never {
    const failure = failureStatusSchema.parse(value);
    return persistenceStatusFailure(failure.status);
  }

  return {
    async getCatalog(context) {
      return invoke(
        context,
        'catalog',
        () => options.gateway.getCatalog(context),
        (value) => {
          const loaded = persistedCatalogResultSchema.safeParse(value);
          return loaded.success ? normalizeCatalog(loaded.data) : parseFailure(value);
        },
      );
    },
    async getProfile(context) {
      return invoke(
        context,
        'profile',
        () => options.gateway.getProfile(context),
        (value) => {
          const loaded = avatarReadPersistenceResultSchema.safeParse(value);
          if (!loaded.success) return parseFailure(value);
          if (loaded.data.status !== 'loaded') return parseFailure(loaded.data);
          const profile = fromPersistedAvatarProfile(loaded.data.profile);
          return profile.creatorCompleted ? toResolvedPublicAvatar(loaded.data.profile) : null;
        },
      );
    },
    async preview(context, input) {
      const parsed = avatarPreviewRequestSchema.safeParse(input);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_AVATAR_SELECTION');
      const selection = toPersistedAvatarSelection(parsed.data.selection);
      return invoke(
        context,
        'preview',
        () => options.gateway.preview(context, selection),
        (value) => {
          const previewed = previewResultSchema.safeParse(value);
          return previewed.success
            ? fromPersistedAvatarSelection(previewed.data.preview.selection)
            : parseFailure(value);
        },
      );
    },
    async create(context, input) {
      const parsed = avatarCreateRequestSchema.safeParse(input);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_AVATAR_SELECTION');
      const mutationContext = { ...context, requestId: parsed.data.requestId };
      return invoke(
        mutationContext,
        'create',
        () =>
          options.gateway.create(
            mutationContext,
            0,
            toPersistedAvatarSelection(parsed.data.selection),
          ),
        (value) => {
          const result = avatarMutationPersistenceResultSchema.safeParse(value);
          if (!result.success) return parseFailure(value);
          if ('profile' in result.data && result.data.status !== 'profile_changed') {
            return fromPersistedAvatarProfile(result.data.profile);
          }
          return persistenceStatusFailure(result.data.status);
        },
      );
    },
    async update(context, input) {
      const parsed = avatarUpdateRequestSchema.safeParse(input);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_AVATAR_SELECTION');
      const mutationContext = { ...context, requestId: parsed.data.requestId };
      return invoke(
        mutationContext,
        'update',
        () =>
          options.gateway.update(
            mutationContext,
            parsed.data.expectedRevision,
            toPersistedAvatarSelection(parsed.data.selection),
          ),
        (value) => {
          const result = avatarMutationPersistenceResultSchema.safeParse(value);
          if (!result.success) return parseFailure(value);
          if ('profile' in result.data && result.data.status !== 'profile_changed') {
            return fromPersistedAvatarProfile(result.data.profile);
          }
          return persistenceStatusFailure(result.data.status);
        },
      );
    },
    async resolvePublic(appearanceId, requestId) {
      const parsedId = z.uuid().safeParse(appearanceId);
      if (!parsedId.success) throw new PublicApiError(400, 'INVALID_AVATAR_REQUEST');
      return invoke(
        { requestId },
        'resolve_public',
        () => options.gateway.resolvePublic(parsedId.data, requestId),
        (value) => {
          const loaded = persistedResolvedAvatarSchema.safeParse(value);
          return loaded.success
            ? toResolvedPublicAvatar(loaded.data.appearance)
            : parseFailure(value);
        },
      );
    },
  };
}
