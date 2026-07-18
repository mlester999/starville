import { z } from 'zod';

import { mapManifestSchema } from '@starville/game-core';

export const WORLD_LIFECYCLE_STATUSES = [
  'draft',
  'validated',
  'published',
  'superseded',
  'archived',
] as const;
export const WORLD_VALIDATION_STATUSES = ['pending', 'valid', 'invalid'] as const;
export const WORLD_ASSET_APPROVAL_STATUSES = ['draft', 'approved', 'deprecated'] as const;

const timestampSchema = z.iso.datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const positiveVersionSchema = z.number().int().positive();

export const worldLifecycleStatusSchema = z.enum(WORLD_LIFECYCLE_STATUSES);
export const worldValidationStatusSchema = z.enum(WORLD_VALIDATION_STATUSES);

export const worldValidationIssueSchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    path: z.string().trim().max(240),
    message: z.string().trim().min(1).max(500),
    severity: z.enum(['error', 'warning']),
  })
  .strict();

export const worldValidationResultSchema = z
  .object({
    valid: z.boolean(),
    checkedAt: timestampSchema,
    errors: z.array(worldValidationIssueSchema).max(250),
    warnings: z.array(worldValidationIssueSchema).max(250),
  })
  .strict();

export const worldMapSchema = z
  .object({
    id: z.uuid(),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    displayName: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500),
    status: z.enum(['active', 'archived']),
    recordVersion: positiveVersionSchema,
    activePublishedVersionId: z.uuid().nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const worldVersionSummarySchema = z
  .object({
    id: z.uuid(),
    worldMapId: z.uuid(),
    versionNumber: positiveVersionSchema,
    lifecycleStatus: worldLifecycleStatusSchema,
    editVersion: positiveVersionSchema,
    checksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    validationStatus: worldValidationStatusSchema,
    validationResult: worldValidationResultSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    validatedAt: nullableTimestampSchema,
    publishedAt: nullableTimestampSchema,
    publicationReason: z.string().trim().max(500).nullable(),
    supersedesVersionId: z.uuid().nullable(),
    derivedFromVersionId: z.uuid().nullable(),
  })
  .strict();

export const worldRevisionChangeSummarySchema = z
  .object({
    objectsAdded: z.number().int().nonnegative(),
    objectsRemoved: z.number().int().nonnegative(),
    objectsMoved: z.number().int().nonnegative(),
    objectsModified: z.number().int().nonnegative(),
    assetBindingsChanged: z.number().int().nonnegative(),
    collisionsChanged: z.number().int().nonnegative(),
    interactionsChanged: z.number().int().nonnegative(),
    exitsChanged: z.number().int().nonnegative(),
    spawnsChanged: z.number().int().nonnegative(),
    terrainChanged: z.boolean(),
    metadataChanged: z
      .object({ name: z.boolean(), description: z.boolean(), bounds: z.boolean() })
      .strict()
      .optional(),
    legacyBackfill: z.boolean().optional(),
  })
  .strict();

export const worldRevisionMetadataSchema = z
  .object({
    versionId: z.uuid(),
    parentRevisionId: z.uuid().nullable(),
    revisionKind: z.enum([
      'legacy',
      'draft_created',
      'draft_saved',
      'restored',
      'published',
      'rollback',
    ]),
    changeSummary: worldRevisionChangeSummarySchema,
    createdAt: timestampSchema,
  })
  .strict();

export const worldPublicationHistorySchema = z
  .object({
    id: z.uuid(),
    operation: z.enum(['publish', 'rollback']),
    sourceRevisionId: z.uuid(),
    publishedVersionId: z.uuid(),
    previousPublishedVersionId: z.uuid().nullable(),
    reason: z.string().trim().min(12).max(500),
    createdAt: timestampSchema,
  })
  .strict();

export const worldDirectoryItemSchema = worldMapSchema
  .extend({
    activeVersionNumber: positiveVersionSchema.nullable(),
    activeChecksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    draftVersionId: z.uuid().nullable(),
    draftValidationStatus: worldValidationStatusSchema.nullable(),
  })
  .strict();

export const worldDirectorySchema = z
  .object({
    status: z.literal('loaded'),
    items: z.array(worldDirectoryItemSchema).max(100),
    page: positiveVersionSchema,
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const worldDetailSchema = z
  .object({
    status: z.literal('loaded'),
    map: worldMapSchema,
    versions: z.array(worldVersionSummarySchema).max(250),
    draftHeadVersionId: z.uuid().nullable(),
    revisionMetadata: z.array(worldRevisionMetadataSchema).max(500),
    publicationHistory: z.array(worldPublicationHistorySchema).max(500),
  })
  .strict();

export const publishedWorldTopologySchema = z
  .object({
    status: z.literal('loaded'),
    maps: z
      .array(
        z
          .object({
            id: z.uuid(),
            slug: z.string().min(1).max(80),
            displayName: z.string().min(1).max(100),
            mapStatus: z.literal('active'),
            versionId: z.uuid(),
            versionNumber: positiveVersionSchema,
            manifest: mapManifestSchema,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export const worldDraftSchema = z
  .object({
    status: z.enum(['created', 'updated', 'unchanged']),
    map: worldMapSchema,
    version: worldVersionSummarySchema,
    manifest: mapManifestSchema,
    changeSummary: worldRevisionChangeSummarySchema.optional(),
    idempotentReplay: z.boolean().optional(),
  })
  .strict();

const worldDraftAssetRotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);
const worldDraftAssetAnchorSchema = z
  .object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) })
  .strict();
const worldDraftAssetCollisionSchema = z.discriminatedUnion('shape', [
  z.object({ shape: z.literal('none'), blocking: z.literal(false) }).strict(),
  z
    .object({
      shape: z.literal('rectangle'),
      blocking: z.boolean(),
      offsetX: z.number().finite(),
      offsetY: z.number().finite(),
      width: z.number().finite().positive(),
      height: z.number().finite().positive(),
    })
    .strict(),
  z
    .object({
      shape: z.literal('capsule'),
      blocking: z.boolean(),
      startX: z.number().finite(),
      startY: z.number().finite(),
      endX: z.number().finite(),
      endY: z.number().finite(),
      radius: z.number().finite().positive(),
    })
    .strict(),
]);
const worldDraftAssetVersionStateSchema = z
  .object({
    id: z.uuid(),
    versionNumber: positiveVersionSchema,
    lifecycleStatus: z.enum([
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
    ]),
    processingStatus: z.enum(['pending', 'completed']),
    validationStatus: z.enum(['pending', 'valid', 'invalid']),
    sourceWidth: z.number().int().positive().nullable(),
    sourceHeight: z.number().int().positive().nullable(),
  })
  .strict();

/** Exact immutable asset-version material retained by a draft world version. */
export const worldDraftAssetPinSchema = z
  .object({
    assetId: z.uuid(),
    assetKey: z.string().trim().min(1).max(96),
    friendlyName: z.string().trim().min(1).max(100),
    assetType: z.string().trim().min(1).max(64),
    productionStatus: z.enum([
      'development_marker',
      'production_candidate',
      'approved_production',
      'deprecated',
    ]),
    activeVersionId: z.uuid().nullable(),
    referenceCount: z.number().int().nonnegative(),
    pinnedVersion: worldDraftAssetVersionStateSchema.extend({
      sourceKind: z.enum(['repository_procedural', 'legacy_storage_raster', 'storage_raster']),
      processedSourceAvailable: z.boolean(),
      processedWidth: z.number().int().positive().nullable(),
      processedHeight: z.number().int().positive().nullable(),
      render: z
        .object({
          renderWidth: z.number().int().positive(),
          renderHeight: z.number().int().positive(),
          scale: z.number().finite().positive(),
          anchor: worldDraftAssetAnchorSchema,
          footAnchor: worldDraftAssetAnchorSchema,
          depthAnchor: worldDraftAssetAnchorSchema,
          supportedRotations: z.array(worldDraftAssetRotationSchema).min(1).max(4),
          defaultRotation: worldDraftAssetRotationSchema,
        })
        .strict(),
      collision: worldDraftAssetCollisionSchema,
    }),
    latestVersion: worldDraftAssetVersionStateSchema.nullable(),
  })
  .strict();

export const worldDraftLoadSchema = worldDraftSchema
  .extend({
    status: z.literal('loaded'),
    assetPins: z.array(worldDraftAssetPinSchema).max(128),
  })
  .strict();

export const worldValidationResponseSchema = z
  .object({
    status: z.enum(['validated', 'validation_failed']),
    map: worldMapSchema,
    version: worldVersionSummarySchema,
    validationResult: worldValidationResultSchema,
  })
  .strict();

export const worldPublishResponseSchema = z
  .object({
    status: z.literal('published'),
    map: worldMapSchema,
    version: worldVersionSummarySchema,
    sourceRevisionId: z.uuid(),
    previousVersionId: z.uuid().nullable(),
    publicationId: z.uuid(),
    operation: z.literal('publish'),
  })
  .strict();

export const worldRollbackResponseSchema = worldPublishResponseSchema
  .omit({ status: true, operation: true })
  .extend({ status: z.literal('rolled_back'), operation: z.literal('rollback') })
  .strict();

export const worldRevisionSchema = z
  .object({
    status: z.literal('loaded'),
    map: worldMapSchema,
    version: worldVersionSummarySchema,
    manifest: mapManifestSchema,
    isDraftHead: z.boolean(),
    revisionMetadata: worldRevisionMetadataSchema.omit({ versionId: true }).strict(),
  })
  .strict();

export const worldRevisionComparisonSchema = z
  .object({
    status: z.literal('loaded'),
    fromVersion: worldVersionSummarySchema,
    toVersion: worldVersionSummarySchema,
    changeSummary: worldRevisionChangeSummarySchema,
  })
  .strict();

export const worldPublicationReviewSchema = z
  .object({
    status: z.literal('reviewed'),
    reviewId: z.uuid(),
    operation: z.enum(['publish', 'rollback']),
    targetRevisionId: z.uuid(),
    expectedActiveVersionId: z.uuid().nullable(),
    changeSummary: worldRevisionChangeSummarySchema,
    gameTestEvidenceId: z.uuid().nullable().optional(),
    expiresAt: timestampSchema,
    idempotentReplay: z.boolean().optional(),
  })
  .strict();

export const worldPreviewSchema = z
  .object({
    status: z.literal('loaded'),
    map: worldMapSchema,
    version: worldVersionSummarySchema,
    manifest: mapManifestSchema,
    draftPreview: z.literal(true),
  })
  .strict();

export const worldAssetSchema = z
  .object({
    id: z.uuid(),
    assetKey: z.string().trim().min(1).max(128),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    storagePath: z.string().trim().min(1).max(500),
    sourceType: z.enum(['repository_procedural', 'storage_raster']),
    mediaType: z.enum([
      'application/x-starville-procedural',
      'image/png',
      'image/webp',
      'image/avif',
    ]),
    width: z.number().int().positive().max(4096).nullable(),
    height: z.number().int().positive().max(4096).nullable(),
    fileSizeBytes: z.number().int().positive().max(5_242_880).nullable(),
    approvalStatus: z.enum(WORLD_ASSET_APPROVAL_STATUSES),
    repositoryOwned: z.boolean(),
    createdAt: timestampSchema,
    deprecatedAt: nullableTimestampSchema,
  })
  .strict();

export const worldAssetDirectorySchema = z
  .object({
    status: z.literal('loaded'),
    items: z.array(worldAssetSchema).max(100),
    page: positiveVersionSchema,
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const worldAuditEventSchema = z
  .object({
    id: z.uuid(),
    eventKey: z.string().trim().min(1).max(100),
    actorType: z.enum(['admin', 'system']),
    actorAdminUserId: z.uuid().nullable(),
    targetMapId: z.uuid().nullable(),
    targetVersionId: z.uuid().nullable(),
    targetAssetId: z.uuid().nullable(),
    requestId: z.string().trim().min(1).max(128).nullable(),
    outcome: z.enum(['success', 'denied', 'error']),
    reason: z.string().trim().max(500).nullable(),
    beforeState: z.record(z.string(), z.unknown()),
    afterState: z.record(z.string(), z.unknown()),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: timestampSchema,
  })
  .strict();

export const worldAuditDirectorySchema = z
  .object({
    status: z.literal('loaded'),
    items: z.array(worldAuditEventSchema).max(100),
    page: positiveVersionSchema,
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export type WorldMapRecord = z.infer<typeof worldMapSchema>;
export type WorldVersionSummary = z.infer<typeof worldVersionSummarySchema>;
export type WorldDirectory = z.infer<typeof worldDirectorySchema>;
export type WorldDetail = z.infer<typeof worldDetailSchema>;
export type PublishedWorldTopology = z.infer<typeof publishedWorldTopologySchema>;
export type WorldDraft = z.infer<typeof worldDraftSchema>;
export type WorldDraftLoad = z.infer<typeof worldDraftLoadSchema>;
export type WorldDraftAssetPin = z.infer<typeof worldDraftAssetPinSchema>;
export type WorldPreview = z.infer<typeof worldPreviewSchema>;
export type WorldAsset = z.infer<typeof worldAssetSchema>;
export type WorldAssetDirectory = z.infer<typeof worldAssetDirectorySchema>;
export type WorldAuditEvent = z.infer<typeof worldAuditEventSchema>;
export type WorldAuditDirectory = z.infer<typeof worldAuditDirectorySchema>;
export type WorldValidationResult = z.infer<typeof worldValidationResultSchema>;
export type WorldRevisionChangeSummary = z.infer<typeof worldRevisionChangeSummarySchema>;
export type WorldRevision = z.infer<typeof worldRevisionSchema>;
export type WorldRevisionComparison = z.infer<typeof worldRevisionComparisonSchema>;
export type WorldPublicationReview = z.infer<typeof worldPublicationReviewSchema>;
export type AdminWorldManifest = z.infer<typeof mapManifestSchema>;
