import { z } from 'zod';

import {
  ASSET_CATEGORIES,
  ASSET_INTERACTION_COMPATIBILITIES,
  ASSET_SOURCE_MEDIA_TYPES,
  ASSET_TYPES,
  GLOBAL_ASSET_INTAKE_MAX_BYTES,
  GLOBAL_ASSET_MAX_DIMENSION,
} from './profiles';

export const assetIdentifierSchema = z
  .string()
  .trim()
  .min(3)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);
export const assetSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
export const assetTagSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
export const assetSafeTextSchema = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => !/[<>\p{Cc}]/u.test(value), 'Text contains unsupported characters');
export const assetUuidSchema = z.uuid();
export const assetTimestampSchema = z.iso.datetime({ offset: true });
export const assetChecksumSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const assetChecksumPrefixSchema = z.string().regex(/^[a-f0-9]{12,16}$/u);
export const assetTypeContractSchema = z.enum(ASSET_TYPES);
export const assetCategoryContractSchema = z.enum(ASSET_CATEGORIES);
export const assetMediaTypeContractSchema = z.enum(ASSET_SOURCE_MEDIA_TYPES);
export const assetInteractionContractSchema = z.enum(ASSET_INTERACTION_COMPATIBILITIES);

const assetInteractionListSchema = z
  .array(assetInteractionContractSchema)
  .min(1)
  .max(7)
  .refine((value) => new Set(value).size === value.length, 'Interactions must be unique');
const assetTagListSchema = z
  .array(assetTagSchema)
  .max(24)
  .refine((value) => new Set(value).size === value.length, 'Tags must be unique');

export const ASSET_LIFECYCLE_STATUSES = [
  'draft',
  'processing',
  'validation_failed',
  'validated',
  'in_review',
  'changes_requested',
  'rejected',
  'approved',
  'active',
  'deprecated',
  'archived',
] as const;
export const assetLifecycleStatusSchema = z.enum(ASSET_LIFECYCLE_STATUSES);
export const ASSET_RECORD_LIFECYCLE_STATUSES = [
  'draft',
  'active',
  'deprecated',
  'archived',
] as const;
export const assetRecordLifecycleStatusSchema = z.enum(ASSET_RECORD_LIFECYCLE_STATUSES);

export const ASSET_PRODUCTION_STATUSES = [
  'development_marker',
  'production_candidate',
  'approved_production',
  'deprecated',
] as const;
export const assetProductionStatusSchema = z.enum(ASSET_PRODUCTION_STATUSES);

export const ASSET_VALIDATION_LEVELS = [
  'blocking_error',
  'warning',
  'recommendation',
  'passed',
] as const;
export const assetValidationLevelSchema = z.enum(ASSET_VALIDATION_LEVELS);

export const assetValidationIssueSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9_]+$/u),
    level: assetValidationLevelSchema,
    path: z.string().trim().max(160),
    message: assetSafeTextSchema(1, 300),
  })
  .strict();
export type AssetValidationIssue = z.infer<typeof assetValidationIssueSchema>;

export const assetValidationResultSchema = z
  .object({
    valid: z.boolean(),
    checkedAt: assetTimestampSchema,
    issues: z.array(assetValidationIssueSchema).max(100),
  })
  .strict();
export type AssetValidationResult = z.infer<typeof assetValidationResultSchema>;

export const assetAnchorSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();

const collisionCoordinateSchema = z.number().finite().min(-128).max(128);
const collisionDimensionSchema = z.number().finite().positive().max(128);
export const assetCollisionProfileSchema = z.discriminatedUnion('shape', [
  z.object({ shape: z.literal('none'), blocking: z.literal(false) }).strict(),
  z
    .object({
      shape: z.literal('rectangle'),
      blocking: z.boolean(),
      offsetX: collisionCoordinateSchema,
      offsetY: collisionCoordinateSchema,
      width: collisionDimensionSchema,
      height: collisionDimensionSchema,
    })
    .strict(),
  z
    .object({
      shape: z.literal('capsule'),
      blocking: z.boolean(),
      startX: collisionCoordinateSchema,
      startY: collisionCoordinateSchema,
      endX: collisionCoordinateSchema,
      endY: collisionCoordinateSchema,
      radius: z.number().finite().positive().max(64),
    })
    .strict()
    .refine(
      ({ startX, startY, endX, endY }) => Math.hypot(endX - startX, endY - startY) > 0,
      'Capsule endpoints must be distinct',
    ),
]);
export type AssetCollisionProfile = z.infer<typeof assetCollisionProfileSchema>;

export const ASSET_ROTATIONS = [0, 90, 180, 270] as const;
export const assetRotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);
export type AssetRotation = z.infer<typeof assetRotationSchema>;

export const assetRenderConfigurationSchema = z
  .object({
    renderWidth: z.number().int().positive().max(GLOBAL_ASSET_MAX_DIMENSION),
    renderHeight: z.number().int().positive().max(GLOBAL_ASSET_MAX_DIMENSION),
    scale: z.number().finite().min(0.05).max(8),
    anchor: assetAnchorSchema,
    footAnchor: assetAnchorSchema,
    depthAnchor: assetAnchorSchema,
    supportedRotations: z.array(assetRotationSchema).min(1).max(4),
    defaultRotation: assetRotationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.supportedRotations).size !== value.supportedRotations.length) {
      context.addIssue({
        code: 'custom',
        path: ['supportedRotations'],
        message: 'Rotations must be unique',
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

const absoluteAssetUrlSchema = z.url().refine((value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
});
const nullableDeliveryUrlSchema = absoluteAssetUrlSchema.nullable();
const adminAssetMediaUrlSchema = z.union([
  absoluteAssetUrlSchema,
  z
    .string()
    .regex(
      /^\/api\/v1\/admin\/world-assets\/[0-9a-f-]{36}\/versions\/[0-9a-f-]{36}\/(?:source|preview|thumbnail)$/u,
    ),
]);
const nullableAdminAssetMediaUrlSchema = adminAssetMediaUrlSchema.nullable();

/** Safe, immutable descriptor delivered beside a published world manifest. */
export const worldAssetDeliverySchema = z
  .object({
    assetKey: assetIdentifierSchema,
    versionId: assetUuidSchema,
    checksum: assetChecksumSchema,
    url: nullableDeliveryUrlSchema,
    mediaType: z.literal('image/webp').nullable(),
    width: z.number().int().positive().max(GLOBAL_ASSET_MAX_DIMENSION).nullable(),
    height: z.number().int().positive().max(GLOBAL_ASSET_MAX_DIMENSION).nullable(),
    renderWidth: z.number().int().positive().max(GLOBAL_ASSET_MAX_DIMENSION).nullable(),
    renderHeight: z.number().int().positive().max(GLOBAL_ASSET_MAX_DIMENSION).nullable(),
    scale: z.number().finite().min(0.05).max(8),
    anchorX: z.number().finite().min(0).max(1),
    anchorY: z.number().finite().min(0).max(1),
    footAnchorX: z.number().finite().min(0).max(1),
    footAnchorY: z.number().finite().min(0).max(1),
    depthAnchorX: z.number().finite().min(0).max(1),
    depthAnchorY: z.number().finite().min(0).max(1),
    collision: assetCollisionProfileSchema,
    supportedRotations: z.array(assetRotationSchema).min(1).max(4),
    defaultRotation: assetRotationSchema,
    developmentMarker: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const productionFields = [
      value.url,
      value.mediaType,
      value.width,
      value.height,
      value.renderWidth,
      value.renderHeight,
    ];
    if (value.developmentMarker && productionFields.some((field) => field !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Development markers cannot expose delivery files',
      });
    }
    if (!value.developmentMarker && productionFields.some((field) => field === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Production assets require complete delivery metadata',
      });
    }
    if (new Set(value.supportedRotations).size !== value.supportedRotations.length) {
      context.addIssue({
        code: 'custom',
        path: ['supportedRotations'],
        message: 'Rotations must be unique',
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
export type WorldAssetDelivery = z.infer<typeof worldAssetDeliverySchema>;

export const worldAssetDeliveriesSchema = z
  .array(worldAssetDeliverySchema)
  .max(128)
  .superRefine((value, context) => {
    const keys = value.map(({ assetKey }) => assetKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Asset delivery keys must be unique' });
    }
  });

export const assetSummarySchema = z
  .object({
    id: assetUuidSchema,
    gameId: assetSlugSchema,
    slug: assetSlugSchema,
    friendlyName: assetSafeTextSchema(1, 100),
    assetType: assetTypeContractSchema,
    category: assetCategoryContractSchema,
    lifecycleStatus: assetRecordLifecycleStatusSchema,
    productionStatus: assetProductionStatusSchema,
    activeVersionId: assetUuidSchema.nullable(),
    developmentMarkerReplacementKey: assetIdentifierSchema.nullable(),
    versionCount: z.number().int().nonnegative(),
    referenceCount: z.number().int().nonnegative(),
    revision: z.number().int().positive(),
    thumbnailUrl: nullableAdminAssetMediaUrlSchema,
    createdAt: assetTimestampSchema,
    updatedAt: assetTimestampSchema,
  })
  .strict();
export type AssetSummary = z.infer<typeof assetSummarySchema>;

export const assetVersionSchema = z
  .object({
    id: assetUuidSchema,
    assetId: assetUuidSchema,
    versionNumber: z.number().int().positive(),
    lifecycleStatus: assetLifecycleStatusSchema,
    processingStatus: z.enum(['pending', 'processing', 'completed', 'failed']),
    validationStatus: z.enum(['pending', 'valid', 'invalid']),
    detectedMediaType: assetMediaTypeContractSchema.nullable(),
    width: z.number().int().positive().max(GLOBAL_ASSET_MAX_DIMENSION).nullable(),
    height: z.number().int().positive().max(GLOBAL_ASSET_MAX_DIMENSION).nullable(),
    sourceSizeBytes: z.number().int().positive().max(GLOBAL_ASSET_INTAKE_MAX_BYTES).nullable(),
    checksumPrefix: assetChecksumPrefixSchema.nullable(),
    sourceUrl: nullableAdminAssetMediaUrlSchema,
    previewUrl: nullableAdminAssetMediaUrlSchema,
    thumbnailUrl: nullableAdminAssetMediaUrlSchema,
    render: assetRenderConfigurationSchema,
    collision: assetCollisionProfileSchema,
    interactionCompatibility: assetInteractionListSchema,
    tags: assetTagListSchema,
    internalNotes: assetSafeTextSchema(0, 2000),
    validationResult: assetValidationResultSchema.nullable(),
    editVersion: z.number().int().positive(),
    createdByAdminId: assetUuidSchema.nullable(),
    submittedByAdminId: assetUuidSchema.nullable(),
    reviewedByAdminId: assetUuidSchema.nullable(),
    approvedByAdminId: assetUuidSchema.nullable(),
    createdAt: assetTimestampSchema,
    updatedAt: assetTimestampSchema,
    submittedAt: assetTimestampSchema.nullable(),
    reviewedAt: assetTimestampSchema.nullable(),
    approvedAt: assetTimestampSchema.nullable(),
    activatedAt: assetTimestampSchema.nullable(),
  })
  .strict();
export type AssetVersion = z.infer<typeof assetVersionSchema>;

export const assetReferenceSummarySchema = z
  .object({
    published: z.number().int().nonnegative(),
    drafts: z.number().int().nonnegative(),
    activeConfiguration: z.number().int().nonnegative(),
    mayArchive: z.boolean(),
  })
  .strict();

export const assetDirectorySchema = z
  .object({
    status: z.literal('loaded'),
    items: z.array(assetSummarySchema).max(100),
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();
export type AssetDirectory = z.infer<typeof assetDirectorySchema>;

export const assetReviewQueueItemSchema = z
  .object({
    asset: assetSummarySchema,
    /** The exact private, sanitized candidate version awaiting human review. */
    version: assetVersionSchema,
    referenceSummary: assetReferenceSummarySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.version.assetId !== value.asset.id) {
      context.addIssue({
        code: 'custom',
        path: ['version', 'assetId'],
        message: 'Review version must belong to the asset',
      });
    }
    if (value.version.lifecycleStatus !== 'in_review') {
      context.addIssue({
        code: 'custom',
        path: ['version', 'lifecycleStatus'],
        message: 'Review queue versions must be in review',
      });
    }
  });
export type AssetReviewQueueItem = z.infer<typeof assetReviewQueueItemSchema>;

export const assetReviewQueueDirectorySchema = assetDirectorySchema
  .omit({ items: true })
  .extend({ items: z.array(assetReviewQueueItemSchema).max(100) })
  .strict();
export type AssetReviewQueueDirectory = z.infer<typeof assetReviewQueueDirectorySchema>;

export const assetDetailSchema = z
  .object({
    status: z.literal('loaded'),
    asset: assetSummarySchema,
    versions: z.array(assetVersionSchema).max(100),
    referenceSummary: assetReferenceSummarySchema,
  })
  .strict();
export type AssetDetail = z.infer<typeof assetDetailSchema>;

export const assetVersionDetailSchema = z
  .object({
    status: z.literal('loaded'),
    asset: assetSummarySchema,
    version: assetVersionSchema,
    validationResults: assetValidationResultSchema.nullable(),
    reviews: z
      .array(
        z
          .object({
            id: assetUuidSchema,
            action: z.enum(['submitted', 'changes_requested', 'rejected', 'approved']),
            administratorUserId: assetUuidSchema,
            reason: assetSafeTextSchema(1, 500),
            createdAt: assetTimestampSchema,
          })
          .strict(),
      )
      .max(100),
    referenceSummary: assetReferenceSummarySchema,
  })
  .strict();
export type AssetVersionDetail = z.infer<typeof assetVersionDetailSchema>;

export const assetUploadMetadataSchema = z
  .object({
    friendlyName: assetSafeTextSchema(1, 100),
    slug: assetSlugSchema,
    assetType: assetTypeContractSchema,
    category: assetCategoryContractSchema,
    developmentMarkerReplacementKey: assetIdentifierSchema.nullable().default(null),
    idempotencyKey: assetUuidSchema,
  })
  .strict();
export type AssetUploadMetadata = z.infer<typeof assetUploadMetadataSchema>;

export const assetDraftUpdateSchema = z
  .object({
    expectedEditVersion: z.number().int().positive(),
    friendlyName: assetSafeTextSchema(1, 100),
    category: assetCategoryContractSchema,
    tags: assetTagListSchema,
    internalNotes: assetSafeTextSchema(0, 2000),
    render: assetRenderConfigurationSchema,
    collision: assetCollisionProfileSchema,
    interactionCompatibility: assetInteractionListSchema,
    idempotencyKey: assetUuidSchema,
  })
  .strict();
export type AssetDraftUpdate = z.infer<typeof assetDraftUpdateSchema>;

export const assetVersionActionSchema = z
  .object({
    expectedEditVersion: z.number().int().positive(),
    reason: assetSafeTextSchema(12, 500),
    idempotencyKey: assetUuidSchema,
    confirmed: z.literal(true),
  })
  .strict();
export type AssetVersionAction = z.infer<typeof assetVersionActionSchema>;

export const assetReviewActionSchema = assetVersionActionSchema
  .extend({ action: z.enum(['request_changes', 'reject', 'approve']) })
  .strict();
export type AssetReviewAction = z.infer<typeof assetReviewActionSchema>;

export const assetActivationActionSchema = assetVersionActionSchema
  .extend({
    expectedAssetRevision: z.number().int().positive(),
    typedConfirmation: z.literal('ACTIVATE ASSET'),
  })
  .strict();
export type AssetActivationAction = z.infer<typeof assetActivationActionSchema>;

export const assetDeprecationActionSchema = z
  .object({
    expectedAssetRevision: z.number().int().positive(),
    reason: assetSafeTextSchema(12, 500),
    idempotencyKey: assetUuidSchema,
    confirmed: z.literal(true),
  })
  .strict();
export type AssetDeprecationAction = z.infer<typeof assetDeprecationActionSchema>;

export const assetCreateVersionActionSchema = assetDeprecationActionSchema
  .extend({
    sourceVersionId: assetUuidSchema,
    configurationMode: z.enum(['copy', 'defaults']),
  })
  .strict();
export type AssetCreateVersionAction = z.infer<typeof assetCreateVersionActionSchema>;

export const assetCreateVersionUploadMetadataSchema = z
  .object({
    sourceVersionId: assetUuidSchema,
    configurationMode: z.enum(['copy', 'defaults']),
    expectedAssetRevision: z.number().int().positive(),
    reason: assetSafeTextSchema(12, 500),
    idempotencyKey: assetUuidSchema,
  })
  .strict();
export type AssetCreateVersionUploadMetadata = z.infer<
  typeof assetCreateVersionUploadMetadataSchema
>;

export const assetMutationResponseSchema = z
  .object({
    status: z.enum([
      'created',
      'processing',
      'validated',
      'validation_failed',
      'updated',
      'submitted',
      'changes_requested',
      'rejected',
      'approved',
      'activated',
      'deprecated',
      'archived',
      'replayed',
    ]),
    asset: assetSummarySchema,
    version: assetVersionSchema.nullable(),
    validationResults: assetValidationResultSchema.nullable().optional(),
  })
  .strict();
export type AssetMutationResponse = z.infer<typeof assetMutationResponseSchema>;

export const assetAuditEventSchema = z
  .object({
    id: assetUuidSchema,
    action: assetSafeTextSchema(1, 80),
    assetId: assetUuidSchema,
    versionId: assetUuidSchema.nullable(),
    actorAdminUserId: assetUuidSchema.nullable(),
    permission: assetSafeTextSchema(1, 80),
    reason: assetSafeTextSchema(1, 500).nullable(),
    requestId: z.string().trim().min(1).max(128).nullable(),
    result: z.enum(['success', 'denied', 'error']),
    createdAt: assetTimestampSchema,
  })
  .strict();

export const assetAuditDirectorySchema = assetDirectorySchema
  .omit({ items: true })
  .extend({ items: z.array(assetAuditEventSchema).max(100) })
  .strict();

export const assetReferenceSchema = z
  .object({
    versionId: assetUuidSchema,
    referenceType: z.enum([
      'world_map',
      'item_definition',
      'crop_definition',
      'recipe',
      'shop_offer',
      'furniture_definition',
      'home_template',
      'game_content_definition',
    ]),
    referenceKey: assetSafeTextSchema(1, 128),
    lifecycle: z.enum(['draft', 'active', 'published']),
  })
  .strict();

export const assetReferenceDirectorySchema = assetDirectorySchema
  .omit({ items: true })
  .extend({
    items: z.array(assetReferenceSchema).max(100),
    summary: assetReferenceSummarySchema,
  })
  .strict();

export const worldEditorAssetCandidateSchema = z
  .object({
    /** Stable key stored in `manifest.assets` and `object.assetId`. */
    assetKey: assetIdentifierSchema,
    /** Immutable active version pinned by publication. */
    versionId: assetUuidSchema,
    asset: assetSummarySchema,
    activeVersion: assetVersionSchema,
    supportedInteractions: assetInteractionListSchema,
    supportedRotations: z.array(assetRotationSchema).min(1).max(4),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.assetKey !== value.asset.slug) {
      context.addIssue({
        code: 'custom',
        path: ['assetKey'],
        message: 'Asset key must match asset slug',
      });
    }
    if (value.versionId !== value.activeVersion.id) {
      context.addIssue({
        code: 'custom',
        path: ['versionId'],
        message: 'Version must match active version',
      });
    }
    if (
      value.asset.lifecycleStatus !== 'active' ||
      value.asset.activeVersionId !== value.versionId ||
      value.activeVersion.lifecycleStatus !== 'active'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'World Editor candidates must be the active asset version',
      });
    }
    if (
      value.asset.productionStatus !== 'approved_production' &&
      value.asset.productionStatus !== 'development_marker'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['asset', 'productionStatus'],
        message: 'World Editor candidates must be approved or explicit development markers',
      });
    }
  });

export const worldEditorAssetCandidateDirectorySchema = assetDirectorySchema
  .omit({ items: true })
  .extend({ items: z.array(worldEditorAssetCandidateSchema).max(100) })
  .strict();

export function normalizeAssetSlug(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96);
}
