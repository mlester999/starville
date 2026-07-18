import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  AVATAR_CONTENT_LAYERS,
  avatarStableKeySchema,
  fromPersistedAvatarSelection,
  persistedAvatarSelectionSchema,
} from '@starville/avatar';

import type { AdminDatabaseIdentity } from '../contracts.js';

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
const validationFindingSchema = z
  .object({
    level: z.enum(['passed', 'warning', 'blocking_error']),
    code: z.string().min(1).max(80),
    path: z.string().max(160),
    message: z.string().min(1).max(240),
  })
  .strict();
const validationSchema = z
  .object({
    valid: z.boolean().nullable(),
    findings: z.array(validationFindingSchema).max(100),
  })
  .strict();

const contentSummarySchema = z
  .object({
    definitionId: z.uuid(),
    stableKey: avatarStableKeySchema,
    publicName: z.string().min(1).max(100),
    description: z.string().max(500),
    category: avatarStableKeySchema,
    layer: z.enum(AVATAR_CONTENT_LAYERS),
    enabled: z.boolean(),
    publicationState: lifecycleSchema,
    activeVersionId: z.uuid().nullable(),
    activeVersionNumber: z.number().int().positive().nullable(),
    compatibleBodyKeys: z.array(avatarStableKeySchema).max(20),
    directions: z.array(directionSchema).max(8),
    animationStates: z.array(animationStateSchema).max(3),
    assetStatus: z.enum(['missing', 'draft', 'approved', 'active', 'development_fallback']),
    usageCount: z.number().int().nonnegative(),
    validationState: z.enum(['not_run', 'valid', 'warning', 'invalid']),
    reviewerDisplayName: z.string().min(1).max(100).nullable(),
    updatedAt: dateTimeSchema,
  })
  .strict();

const catalogResultSchema = z
  .object({
    status: z.literal('loaded'),
    items: z.array(contentSummarySchema).max(100),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

const assetReferenceSchema = z
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
    assetKey: avatarStableKeySchema,
    assetState: z.enum(['approved', 'active', 'deprecated']),
    mediaType: z.enum(['image/png', 'image/webp']),
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
  })
  .strict();

const rawAnimationSchema = z
  .object({
    direction: directionSchema,
    state: animationStateSchema,
    frames: z.array(z.number().int().min(0).max(16_383)).min(1).max(24),
    frameDurationMs: z.number().int().min(40).max(2_000),
    loop: z.boolean(),
    offsetX: z.number().int().min(-512).max(512),
    offsetY: z.number().int().min(-512).max(512),
  })
  .strict();

const rawVersionSchema = z
  .object({
    versionId: z.uuid(),
    versionNumber: z.number().int().positive(),
    state: lifecycleSchema,
    revision: z.number().int().positive(),
    renderOrder: z.number().int().min(-1_000).max(1_000),
    frameWidth: z.number().int().min(1).max(2_048),
    frameHeight: z.number().int().min(1).max(2_048),
    sheetRows: z.number().int().min(1).max(128),
    sheetColumns: z.number().int().min(1).max(128),
    padding: z.number().int().min(0).max(128),
    offsetX: z.number().int().min(-512).max(512),
    offsetY: z.number().int().min(-512).max(512),
    anchorX: z.number().min(0).max(1),
    anchorY: z.number().min(0).max(1),
    depthBehavior: z.enum(['foot_anchor', 'fixed', 'activity_override']),
    castsShadow: z.boolean(),
    fallbackVersionId: z.uuid().nullable(),
    fallbackKey: avatarStableKeySchema.nullable(),
    compatibleBodyKeys: z.array(avatarStableKeySchema).max(20),
    directions: z.array(directionSchema).max(8),
    animationStates: z.array(animationStateSchema).max(3),
    assets: z.array(assetReferenceSchema).max(8),
    animations: z.array(rawAnimationSchema).max(72),
    validation: validationSchema,
    submittedBy: z.string().min(1).max(100).nullable(),
    reviewedBy: z.string().min(1).max(100).nullable(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .strict();

const rawDefinitionResultSchema = z
  .object({
    status: z.literal('loaded'),
    definition: z
      .object({
        definitionId: z.uuid(),
        stableKey: avatarStableKeySchema,
        publicName: z.string().min(1).max(100),
        description: z.string().max(500),
        category: avatarStableKeySchema,
        layer: z.enum(AVATAR_CONTENT_LAYERS),
        enabled: z.boolean(),
        activeVersionId: z.uuid().nullable(),
        recordRevision: z.number().int().positive(),
        updatedAt: dateTimeSchema,
      })
      .strict(),
    versions: z.array(rawVersionSchema).max(100),
  })
  .strict();

const rawOverviewResultSchema = z
  .object({
    status: z.literal('loaded'),
    overview: z
      .object({
        definitions: z.number().int().nonnegative(),
        activeDefinitions: z.number().int().nonnegative(),
        reviewQueue: z.number().int().nonnegative(),
        invalidVersions: z.number().int().nonnegative(),
        publishedPresets: z.number().int().nonnegative(),
        playerProfiles: z.number().int().nonnegative(),
        developmentFallbacks: z.number().int().nonnegative(),
        missingDirections: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const rawPresetSchema = z
  .object({
    presetId: z.uuid(),
    stableKey: avatarStableKeySchema,
    publicName: z.string().min(1).max(100),
    description: z.string().max(500),
    state: lifecycleSchema,
    version: z.number().int().positive(),
    revision: z.number().int().positive(),
    selection: persistedAvatarSelectionSchema,
    updatedAt: dateTimeSchema,
  })
  .strict();
const rawPresetsResultSchema = z
  .object({
    status: z.literal('loaded'),
    presets: z.object({ items: z.array(rawPresetSchema).max(100) }).strict(),
  })
  .strict();

const settingsSchema = z
  .object({
    revision: z.number().int().positive(),
    customizationEnabled: z.boolean(),
    creatorRequiredForNewPlayers: z.boolean(),
    maintenanceMode: z.boolean(),
    maximumAccessories: z.number().int().min(0).max(4),
    fallbackPresetKey: avatarStableKeySchema,
    updatedAt: dateTimeSchema,
  })
  .strict();
const rawSettingsResultSchema = z
  .object({ status: z.literal('loaded'), settings: settingsSchema })
  .strict();

const auditEventSchema = z
  .object({
    eventId: z.uuid(),
    action: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[a-z][a-z0-9_.-]*$/u),
    targetType: avatarStableKeySchema,
    targetId: z.uuid().nullable(),
    actorDisplayName: z.string().min(1).max(100),
    summary: z.string().min(1).max(500),
    createdAt: dateTimeSchema,
  })
  .strict();
const rawAuditResultSchema = z
  .object({
    status: z.literal('loaded'),
    items: z.array(auditEventSchema).max(100),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

const mutationResultSchema = z
  .object({
    status: z.enum([
      'created',
      'updated',
      'valid',
      'invalid',
      'submitted',
      'reviewed',
      'changes_requested',
      'rejected',
      'approved',
      'active',
      'superseded',
      'published',
      'not_found',
      'rate_limited',
      'key_conflict',
      'version_changed',
      'settings_changed',
      'immutable_version',
      'invalid_state',
      'validation_required',
      'review_required',
      'approval_required',
      'separation_required',
      'content_unavailable',
      'request_already_processed',
    ]),
    definitionId: z.uuid().optional(),
    versionId: z.uuid().optional(),
    presetId: z.uuid().optional(),
    versionNumber: z.number().int().positive().optional(),
    revision: z.number().int().positive().optional(),
    supersededVersionId: z.uuid().nullable().optional(),
    supersededPresetId: z.uuid().nullable().optional(),
    validation: validationSchema.optional(),
    settings: settingsSchema.optional(),
  })
  .strip();

const persistenceFailureSchema = z
  .object({ status: z.enum(['not_found', 'rate_limited']) })
  .strip();

export const adminAvatarCatalogQuerySchema = z
  .object({
    search: z.string().trim().max(100).default(''),
    category: z.string().trim().max(80).default('all'),
    layer: z.string().trim().max(80).default('all'),
    state: z.string().trim().max(80).default('all'),
    compatibility: z.string().trim().max(80).default('all'),
    missing: z.string().trim().max(80).default('all'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.preprocess(
      (value) => value ?? 50,
      z.coerce.number().pipe(z.union([z.literal(20), z.literal(50), z.literal(100)])),
    ),
  })
  .strict()
  .superRefine((query, context) => {
    if (query.category !== 'all' && !avatarStableKeySchema.safeParse(query.category).success) {
      context.addIssue({ code: 'custom', path: ['category'], message: 'Invalid category.' });
    }
    if (query.layer !== 'all' && !z.enum(AVATAR_CONTENT_LAYERS).safeParse(query.layer).success) {
      context.addIssue({ code: 'custom', path: ['layer'], message: 'Invalid layer.' });
    }
    if (query.state !== 'all' && !lifecycleSchema.safeParse(query.state).success) {
      context.addIssue({ code: 'custom', path: ['state'], message: 'Invalid lifecycle state.' });
    }
    if (
      query.compatibility !== 'all' &&
      !avatarStableKeySchema.safeParse(query.compatibility).success
    ) {
      context.addIssue({
        code: 'custom',
        path: ['compatibility'],
        message: 'Invalid compatibility key.',
      });
    }
    if (
      !['all', 'direction', 'animation_state', 'asset', 'compatibility'].includes(query.missing)
    ) {
      context.addIssue({ code: 'custom', path: ['missing'], message: 'Invalid missing filter.' });
    }
  });

export type AdminAvatarCatalogQuery = z.infer<typeof adminAvatarCatalogQuerySchema>;
export type AdminAvatarMutationResult = z.infer<typeof mutationResultSchema>;

export class AdminAvatarPersistenceError extends Error {
  public constructor(
    public readonly operation: string,
    public readonly postgresCode: string | null = null,
  ) {
    super('Admin avatar persistence operation failed.');
    this.name = 'AdminAvatarPersistenceError';
  }
}

export class AdminAvatarStatusError extends Error {
  public constructor(public readonly status: z.infer<typeof persistenceFailureSchema>['status']) {
    super('Admin avatar persistence request was rejected.');
    this.name = 'AdminAvatarStatusError';
  }
}

function safePostgresCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/u.test(code) ? code : null;
}

function identityParameters(identity: AdminDatabaseIdentity) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  };
}

async function rpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) throw new AdminAvatarPersistenceError(operation, safePostgresCode(error));
  return data;
}

function loaded<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const failure = persistenceFailureSchema.safeParse(value);
  if (failure.success) throw new AdminAvatarStatusError(failure.data.status);
  throw new AdminAvatarPersistenceError('parse_admin_avatar_result');
}

function normalizedContentSummary(summary: z.infer<typeof contentSummarySchema>) {
  return {
    ...summary,
    publicName: summary.publicName.slice(0, 80),
    reviewerDisplayName: summary.reviewerDisplayName?.slice(0, 80) ?? null,
  };
}

function normalizedCatalog(result: z.infer<typeof catalogResultSchema>) {
  return {
    items: result.items.map(normalizedContentSummary),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  };
}

export interface AdminAvatarGateway {
  overview(identity: AdminDatabaseIdentity): Promise<unknown>;
  list(identity: AdminDatabaseIdentity, query: AdminAvatarCatalogQuery): Promise<unknown>;
  definition(
    identity: AdminDatabaseIdentity,
    definitionId: string,
    requestId: string,
  ): Promise<unknown>;
  presets(identity: AdminDatabaseIdentity): Promise<unknown>;
  audit(
    identity: AdminDatabaseIdentity,
    query: { readonly page: number; readonly pageSize: 20 | 50 | 100 },
  ): Promise<unknown>;
  settings(identity: AdminDatabaseIdentity): Promise<unknown>;
  createDraft(
    identity: AdminDatabaseIdentity,
    input: {
      readonly stableKey: string;
      readonly publicName: string;
      readonly description: string;
      readonly category: string;
      readonly layer: string;
    },
    requestId: string,
  ): Promise<AdminAvatarMutationResult>;
  updateDraft(
    identity: AdminDatabaseIdentity,
    versionId: string,
    expectedRevision: number,
    configuration: Readonly<Record<string, unknown>>,
    requestId: string,
  ): Promise<AdminAvatarMutationResult>;
  lifecycle(
    identity: AdminDatabaseIdentity,
    operation: 'validate' | 'submit' | 'review' | 'approve' | 'activate' | 'supersede',
    versionId: string,
    expectedRevision: number,
    reason: string | undefined,
    decision: 'accept' | 'changes_requested' | 'reject' | undefined,
    requestId: string,
  ): Promise<AdminAvatarMutationResult>;
  updateSettings(
    identity: AdminDatabaseIdentity,
    expectedRevision: number,
    settings: Readonly<Record<string, unknown>>,
    requestId: string,
  ): Promise<AdminAvatarMutationResult>;
  publishPreset(
    identity: AdminDatabaseIdentity,
    presetId: string,
    expectedRevision: number,
    reason: string,
    requestId: string,
  ): Promise<AdminAvatarMutationResult>;
}

export function createSupabaseAdminAvatarGateway(client: SupabaseClient): AdminAvatarGateway {
  const list = async (identity: AdminDatabaseIdentity, query: AdminAvatarCatalogQuery) => {
    const result = loaded(
      catalogResultSchema,
      await rpc(client, 'list_admin_avatar_catalog', {
        ...identityParameters(identity),
        p_search: query.search,
        p_category: query.category,
        p_layer: query.layer,
        p_lifecycle_status: query.state,
        p_compatibility: query.compatibility,
        p_missing: query.missing,
        p_page: query.page,
        p_page_size: query.pageSize,
      }),
    );
    return normalizedCatalog(result);
  };

  return {
    async overview(identity) {
      const [overview, recent] = await Promise.all([
        rpc(client, 'get_admin_avatar_overview', identityParameters(identity)),
        list(identity, {
          search: '',
          category: 'all',
          layer: 'all',
          state: 'all',
          compatibility: 'all',
          missing: 'all',
          page: 1,
          pageSize: 20,
        }),
      ]);
      const parsed = loaded(rawOverviewResultSchema, overview);
      const page = z
        .object({
          items: z.array(contentSummarySchema),
          page: z.number(),
          pageSize: z.number(),
          total: z.number(),
          totalPages: z.number(),
        })
        .passthrough()
        .parse(recent);
      return { ...parsed.overview, recent: page.items.slice(0, 8).map(normalizedContentSummary) };
    },
    list,
    async definition(identity, definitionId, requestId) {
      const raw = loaded(
        rawDefinitionResultSchema,
        await rpc(client, 'get_admin_avatar_definition', {
          ...identityParameters(identity),
          p_definition_id: definitionId,
          p_request_id: requestId,
        }),
      );
      const page = await list(identity, {
        search: raw.definition.stableKey,
        category: 'all',
        layer: 'all',
        state: 'all',
        compatibility: 'all',
        missing: 'all',
        page: 1,
        pageSize: 20,
      });
      const summaries = z
        .object({ items: z.array(contentSummarySchema) })
        .passthrough()
        .parse(page);
      const summary = summaries.items.find(
        (candidate) => candidate.definitionId === raw.definition.definitionId,
      );
      if (summary === undefined)
        throw new AdminAvatarPersistenceError('join_admin_avatar_definition');
      return {
        definition: normalizedContentSummary(summary),
        versions: raw.versions.map((version) => ({
          versionId: version.versionId,
          versionNumber: version.versionNumber,
          state: version.state,
          revision: version.revision,
          renderOrder: version.renderOrder,
          offsetX: version.offsetX,
          offsetY: version.offsetY,
          anchorX: version.anchorX,
          anchorY: version.anchorY,
          fallbackKey: version.fallbackKey,
          compatibleBodyKeys: version.compatibleBodyKeys,
          directions: version.directions,
          animationStates: version.animationStates,
          assets: version.assets,
          animations: version.animations.map((animation) => ({
            state: animation.state,
            direction: animation.direction,
            row: Math.floor(animation.frames[0]! / version.sheetColumns),
            startColumn: animation.frames[0]! % version.sheetColumns,
            frameCount: animation.frames.length,
            frameDurationMs: animation.frameDurationMs,
            padding: version.padding,
            loop: animation.loop,
            anchorX: version.anchorX,
            anchorY: version.anchorY,
          })),
          validationState:
            version.validation.valid === null
              ? 'not_run'
              : version.validation.valid
                ? version.validation.findings.some((finding) => finding.level === 'warning')
                  ? 'warning'
                  : 'valid'
                : 'invalid',
          validationMessages: version.validation.findings.map((finding) => finding.message),
          submittedBy: version.submittedBy?.slice(0, 80) ?? null,
          reviewedBy: version.reviewedBy?.slice(0, 80) ?? null,
          createdAt: version.createdAt,
        })),
      };
    },
    async presets(identity) {
      const result = loaded(
        rawPresetsResultSchema,
        await rpc(client, 'list_admin_avatar_presets', identityParameters(identity)),
      );
      return {
        items: result.presets.items.map((preset) => ({
          ...preset,
          publicName: preset.publicName.slice(0, 80),
          description: preset.description.slice(0, 280),
          selection: fromPersistedAvatarSelection(preset.selection),
        })),
      };
    },
    async audit(identity, query) {
      const result = loaded(
        rawAuditResultSchema,
        await rpc(client, 'list_admin_avatar_audit', {
          ...identityParameters(identity),
          p_page: query.page,
          p_page_size: query.pageSize,
        }),
      );
      return {
        items: result.items,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      };
    },
    async settings(identity) {
      return loaded(
        rawSettingsResultSchema,
        await rpc(client, 'get_admin_avatar_settings', identityParameters(identity)),
      ).settings;
    },
    async createDraft(identity, input, requestId) {
      return mutationResultSchema.parse(
        await rpc(client, 'create_admin_avatar_draft', {
          ...identityParameters(identity),
          p_stable_key: input.stableKey,
          p_public_name: input.publicName,
          p_description: input.description,
          p_category: input.category,
          p_layer: input.layer,
          p_request_id: requestId,
        }),
      );
    },
    async updateDraft(identity, versionId, expectedRevision, configuration, requestId) {
      return mutationResultSchema.parse(
        await rpc(client, 'update_admin_avatar_draft', {
          ...identityParameters(identity),
          p_version_id: versionId,
          p_expected_revision: expectedRevision,
          p_configuration: configuration,
          p_request_id: requestId,
        }),
      );
    },
    async lifecycle(identity, operation, versionId, expectedRevision, reason, decision, requestId) {
      const names = {
        validate: 'validate_admin_avatar_version',
        submit: 'submit_admin_avatar_review',
        review: 'review_admin_avatar_version',
        approve: 'approve_admin_avatar_version',
        activate: 'activate_admin_avatar_version',
        supersede: 'supersede_admin_avatar_version',
      } as const;
      return mutationResultSchema.parse(
        await rpc(client, names[operation], {
          ...identityParameters(identity),
          p_version_id: versionId,
          p_expected_revision: expectedRevision,
          ...(operation === 'validate' ? {} : { p_reason: reason }),
          ...(operation === 'review' ? { p_decision: decision } : {}),
          p_request_id: requestId,
        }),
      );
    },
    async updateSettings(identity, expectedRevision, settings, requestId) {
      return mutationResultSchema.parse(
        await rpc(client, 'update_admin_avatar_settings', {
          ...identityParameters(identity),
          p_expected_revision: expectedRevision,
          p_settings: settings,
          p_request_id: requestId,
        }),
      );
    },
    async publishPreset(identity, presetId, expectedRevision, reason, requestId) {
      return mutationResultSchema.parse(
        await rpc(client, 'publish_admin_avatar_preset', {
          ...identityParameters(identity),
          p_preset_id: presetId,
          p_expected_revision: expectedRevision,
          p_reason: reason,
          p_request_id: requestId,
        }),
      );
    },
  };
}
