import { z } from 'zod';

import {
  assetAuditDirectorySchema,
  assetCategoryContractSchema,
  assetCollisionProfileSchema,
  assetDetailSchema,
  assetDirectorySchema,
  assetLifecycleStatusSchema,
  assetMutationResponseSchema,
  assetProductionStatusSchema,
  assetReferenceDirectorySchema,
  assetReviewQueueDirectorySchema,
  assetSummarySchema,
  assetTypeContractSchema,
  assetUuidSchema,
  assetValidationResultSchema,
  assetVersionDetailSchema,
  assetVersionSchema,
  getAssetTypeProfile,
  worldEditorAssetCandidateDirectorySchema,
  type AssetSummary,
  type AssetType,
  type AssetVersion,
} from '@starville/asset-management';

const timestampSchema = z.iso.datetime({ offset: true });
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const pageShape = {
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
} as const;

const rawReferenceSummarySchema = z
  .object({
    published: z.number().int().nonnegative(),
    draft: z.number().int().nonnegative(),
    activeConfiguration: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();

const rawAssetSchema = z
  .object({
    id: assetUuidSchema,
    gameKey: z.string(),
    assetKey: z.string(),
    slug: z.string(),
    friendlyName: z.string(),
    assetType: assetTypeContractSchema,
    category: assetCategoryContractSchema,
    lifecycleStatus: z.enum(['draft', 'active', 'deprecated', 'archived']),
    productionStatus: assetProductionStatusSchema,
    activeVersionId: assetUuidSchema.nullable(),
    activeVersionNumber: z.number().int().positive().nullable(),
    thumbnailUrl: z.string().nullable(),
    developmentMarkerReplacementKey: z.string().nullable(),
    recordVersion: z.number().int().positive(),
    versionCount: z.number().int().nonnegative(),
    referenceSummary: rawReferenceSummarySchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

const rawVersionSchema = z
  .object({
    id: assetUuidSchema,
    assetId: assetUuidSchema,
    versionNumber: z.number().int().positive(),
    lifecycleStatus: assetLifecycleStatusSchema,
    sourceKind: z.enum(['repository_procedural', 'legacy_storage_raster', 'storage_raster']),
    checksumSha256: checksumSchema.nullable(),
    sourceMimeType: z
      .enum(['application/x-starville-procedural', 'image/png', 'image/webp', 'image/avif'])
      .nullable(),
    sourceWidth: z.number().int().positive().max(8192).nullable(),
    sourceHeight: z.number().int().positive().max(8192).nullable(),
    sourceSizeBytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024)
      .nullable(),
    processedSourceWidth: z.number().int().positive().max(8192).nullable(),
    processedSourceHeight: z.number().int().positive().max(8192).nullable(),
    processedSourceSizeBytes: z
      .number()
      .int()
      .positive()
      .max(8 * 1024 * 1024)
      .nullable(),
    processedPreviewWidth: z.number().int().positive().max(2048).nullable(),
    processedPreviewHeight: z.number().int().positive().max(2048).nullable(),
    processedPreviewSizeBytes: z
      .number()
      .int()
      .positive()
      .max(8 * 1024 * 1024)
      .nullable(),
    processedThumbnailWidth: z.number().int().positive().max(512).nullable(),
    processedThumbnailHeight: z.number().int().positive().max(512).nullable(),
    processedThumbnailSizeBytes: z
      .number()
      .int()
      .positive()
      .max(8 * 1024 * 1024)
      .nullable(),
    renderWidth: z.coerce.number().positive().max(4096).nullable(),
    renderHeight: z.coerce.number().positive().max(4096).nullable(),
    scale: z.coerce.number().min(0.05).max(8),
    anchor: z.object({ x: z.coerce.number(), y: z.coerce.number() }).strict(),
    footAnchor: z.object({ x: z.coerce.number(), y: z.coerce.number() }).strict().optional(),
    depthAnchor: z.object({ x: z.coerce.number(), y: z.coerce.number() }).strict(),
    collisionProfile: assetCollisionProfileSchema,
    supportedRotations: z.array(
      z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    ),
    defaultRotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    interactionCompatibility: z.array(z.string()),
    transparentBackgroundExpected: z.boolean(),
    transparencyResult: z.enum(['unknown', 'opaque', 'transparent', 'partial']),
    validationStatus: z.enum(['pending', 'valid', 'invalid']),
    validationResults: assetValidationResultSchema.nullable(),
    internalNotes: z.string().nullable(),
    editVersion: z.number().int().positive(),
    sourcePreviewUrl: z.string().nullable(),
    previewUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    createdByAdminId: assetUuidSchema.nullable(),
    submittedByAdminId: assetUuidSchema.nullable(),
    reviewedByAdminId: assetUuidSchema.nullable(),
    approvedByAdminId: assetUuidSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    submittedAt: timestampSchema.nullable(),
    reviewedAt: timestampSchema.nullable(),
    approvedAt: timestampSchema.nullable(),
    activatedAt: timestampSchema.nullable().optional(),
    tags: z.array(z.string()).max(24),
  })
  .strict();

const rawReviewSchema = z
  .object({
    id: assetUuidSchema,
    assetId: assetUuidSchema,
    versionId: assetUuidSchema,
    action: z.enum(['submitted', 'changes_requested', 'rejected', 'approved']),
    administratorUserId: assetUuidSchema,
    reason: z.string(),
    requestId: z.string(),
    createdAt: timestampSchema,
  })
  .strict();
const rawValidationCheckSchema = z
  .object({
    id: assetUuidSchema,
    runId: assetUuidSchema,
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/u),
    level: z.enum(['blocking_error', 'warning', 'recommendation', 'passed']),
    message: z.string().min(1).max(500),
    createdAt: timestampSchema,
  })
  .strict();

export const assetUploadReservationSchema = z
  .object({
    status: z.enum(['created', 'replayed']),
    assetId: assetUuidSchema,
    assetRevision: z.number().int().positive(),
    versionId: assetUuidSchema,
    versionNumber: z.number().int().positive(),
    versionEditVersion: z.number().int().positive(),
    uploadId: assetUuidSchema,
    uploadRevision: z.number().int().positive(),
    intakePath: z.string(),
  })
  .strict();

export const assetPreviewMaterialSchema = z
  .object({
    status: z.literal('loaded'),
    assetId: assetUuidSchema,
    versionId: assetUuidSchema,
    lifecycleStatus: assetLifecycleStatusSchema,
    originalPath: z.string().nullable(),
    processedSourcePath: z.string(),
    processedPreviewPath: z.string(),
    processedThumbnailPath: z.string(),
  })
  .strict();

export const assetActivationMaterialSchema = assetPreviewMaterialSchema
  .omit({ lifecycleStatus: true, originalPath: true })
  .extend({
    slug: z.string(),
    versionNumber: z.number().int().positive(),
    checksumSha256: checksumSchema,
  })
  .strict();

function processingStatus(
  value: z.infer<typeof rawVersionSchema>,
): AssetVersion['processingStatus'] {
  if (value.lifecycleStatus === 'processing') return 'processing';
  if (value.lifecycleStatus === 'validation_failed') return 'failed';
  if (value.checksumSha256 !== null || value.sourceKind !== 'storage_raster') return 'completed';
  return 'pending';
}

function referenceSummary(value: z.infer<typeof rawReferenceSummarySchema>) {
  return {
    published: value.published,
    drafts: value.draft,
    activeConfiguration: value.activeConfiguration,
    mayArchive: value.total === 0,
  } as const;
}

function projectAsset(value: unknown): AssetSummary {
  const raw = rawAssetSchema.parse(value);
  if (raw.assetKey !== raw.slug) throw new Error('Asset persistence identity mismatch');
  return assetSummarySchema.parse({
    id: raw.id,
    gameId: raw.gameKey,
    slug: raw.assetKey,
    friendlyName: raw.friendlyName,
    assetType: raw.assetType,
    category: raw.category,
    lifecycleStatus: raw.lifecycleStatus,
    productionStatus: raw.productionStatus,
    activeVersionId: raw.activeVersionId,
    developmentMarkerReplacementKey: raw.developmentMarkerReplacementKey,
    versionCount: raw.versionCount,
    referenceCount: raw.referenceSummary.total,
    revision: raw.recordVersion,
    thumbnailUrl: raw.thumbnailUrl,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  });
}

function projectVersion(value: unknown, assetType: AssetType): AssetVersion {
  const raw = rawVersionSchema.parse(value);
  const profile = getAssetTypeProfile(assetType);
  const footAnchor = raw.footAnchor ?? raw.anchor;
  return assetVersionSchema.parse({
    id: raw.id,
    assetId: raw.assetId,
    versionNumber: raw.versionNumber,
    lifecycleStatus: raw.lifecycleStatus,
    processingStatus: processingStatus(raw),
    validationStatus: raw.validationStatus,
    detectedMediaType:
      raw.sourceMimeType === 'image/png' || raw.sourceMimeType === 'image/webp'
        ? raw.sourceMimeType
        : null,
    width: raw.sourceWidth,
    height: raw.sourceHeight,
    sourceSizeBytes: raw.sourceSizeBytes,
    checksumPrefix: raw.checksumSha256?.slice(0, 16) ?? null,
    sourceUrl: raw.sourcePreviewUrl,
    previewUrl: raw.previewUrl,
    thumbnailUrl: raw.thumbnailUrl,
    render: {
      renderWidth: Math.round(raw.renderWidth ?? profile.recommendedWidth),
      renderHeight: Math.round(raw.renderHeight ?? profile.recommendedHeight),
      scale: raw.scale,
      anchor: raw.anchor,
      footAnchor,
      depthAnchor: raw.depthAnchor,
      supportedRotations: raw.supportedRotations,
      defaultRotation: raw.defaultRotation,
    },
    collision: raw.collisionProfile,
    interactionCompatibility: raw.interactionCompatibility,
    tags: raw.tags,
    internalNotes: raw.internalNotes ?? '',
    validationResult: raw.validationResults,
    editVersion: raw.editVersion,
    createdByAdminId: raw.createdByAdminId,
    submittedByAdminId: raw.submittedByAdminId,
    reviewedByAdminId: raw.reviewedByAdminId,
    approvedByAdminId: raw.approvedByAdminId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    submittedAt: raw.submittedAt,
    reviewedAt: raw.reviewedAt,
    approvedAt: raw.approvedAt,
    activatedAt: raw.activatedAt ?? null,
  });
}

function projectMutation(value: unknown) {
  const raw = z
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
      asset: rawAssetSchema,
      version: rawVersionSchema.nullable(),
      validationResults: assetValidationResultSchema.nullable().optional(),
      uploadRevision: z.number().int().positive().optional(),
    })
    .strict()
    .parse(value);
  const asset = projectAsset(raw.asset);
  return assetMutationResponseSchema.parse({
    status: raw.status,
    asset,
    version: raw.version === null ? null : projectVersion(raw.version, asset.assetType),
    ...(raw.validationResults === undefined ? {} : { validationResults: raw.validationResults }),
  });
}

function projectPage<T>(
  value: unknown,
  itemSchema: z.ZodType<T>,
): { readonly raw: z.infer<z.ZodObject<typeof pageShape>>; readonly items: readonly T[] } {
  const parsed = z
    .object({ status: z.literal('loaded'), items: z.array(itemSchema), ...pageShape })
    .strict()
    .parse(value);
  return { raw: parsed, items: parsed.items };
}

export function projectAssetDirectory(value: unknown) {
  const page = projectPage(value, rawAssetSchema);
  return assetDirectorySchema.parse({
    ...page.raw,
    items: page.items.map(projectAsset),
  });
}

export function projectAssetDetail(value: unknown) {
  const raw = z
    .object({
      status: z.literal('loaded'),
      asset: rawAssetSchema,
      versions: z.array(rawVersionSchema).max(100),
      referenceSummary: rawReferenceSummarySchema,
    })
    .strict()
    .parse(value);
  const asset = projectAsset(raw.asset);
  return assetDetailSchema.parse({
    status: raw.status,
    asset,
    versions: raw.versions.map((version) => projectVersion(version, asset.assetType)),
    referenceSummary: referenceSummary(raw.referenceSummary),
  });
}

export function projectAssetVersionDetail(value: unknown) {
  const raw = z
    .object({
      status: z.literal('loaded'),
      asset: rawAssetSchema,
      version: rawVersionSchema,
      validationResults: z.array(rawValidationCheckSchema).max(100),
      reviews: z.array(rawReviewSchema).max(100),
      referenceSummary: rawReferenceSummarySchema,
    })
    .strict()
    .parse(value);
  const asset = projectAsset(raw.asset);
  const version = projectVersion(raw.version, asset.assetType);
  return assetVersionDetailSchema.parse({
    status: raw.status,
    asset,
    version,
    validationResults: version.validationResult,
    reviews: raw.reviews.map((review) => ({
      id: review.id,
      action: review.action,
      administratorUserId: review.administratorUserId,
      reason: review.reason,
      createdAt: review.createdAt,
    })),
    referenceSummary: referenceSummary(raw.referenceSummary),
  });
}

export function projectAssetMutation(value: unknown) {
  return projectMutation(value);
}

export function projectReviewQueue(value: unknown) {
  const rawItem = z.object({ asset: rawAssetSchema, version: rawVersionSchema }).strict();
  const page = projectPage(value, rawItem);
  return assetReviewQueueDirectorySchema.parse({
    ...page.raw,
    items: page.items.map(({ asset: rawAsset, version: rawVersion }) => {
      const asset = projectAsset(rawAsset);
      return {
        asset,
        version: projectVersion(rawVersion, asset.assetType),
        referenceSummary: referenceSummary(rawAsset.referenceSummary),
      };
    }),
  });
}

export function projectAuditDirectory(value: unknown) {
  const rawEvent = z
    .object({
      id: assetUuidSchema,
      eventKey: z.string(),
      action: z.string(),
      permissionKey: z.string(),
      actorAdminUserId: assetUuidSchema,
      targetAssetId: assetUuidSchema,
      targetVersionId: assetUuidSchema.nullable(),
      targetMapId: assetUuidSchema.nullable(),
      targetMapVersionId: assetUuidSchema.nullable(),
      requestId: z.string(),
      outcome: z.enum(['success', 'denied', 'error']),
      reason: z.string().nullable(),
      beforeState: z.record(z.string(), z.unknown()),
      afterState: z.record(z.string(), z.unknown()),
      metadata: z.record(z.string(), z.unknown()),
      createdAt: timestampSchema,
    })
    .strict();
  const page = projectPage(value, rawEvent);
  return assetAuditDirectorySchema.parse({
    ...page.raw,
    items: page.items.map((event) => ({
      id: event.id,
      action: event.action,
      assetId: event.targetAssetId,
      versionId: event.targetVersionId,
      actorAdminUserId: event.actorAdminUserId,
      permission: event.permissionKey,
      reason: event.reason,
      requestId: event.requestId,
      result: event.outcome,
      createdAt: event.createdAt,
    })),
  });
}

export function projectReferenceDirectory(value: unknown) {
  const rawReference = z
    .object({
      versionId: assetUuidSchema,
      referenceType: z.string(),
      referenceKey: z.string(),
      lifecycle: z.enum(['draft', 'active', 'published']),
    })
    .strict();
  const raw = z
    .object({
      status: z.literal('loaded'),
      items: z.array(rawReference).max(100),
      summary: rawReferenceSummarySchema,
      ...pageShape,
    })
    .strict()
    .parse(value);
  return assetReferenceDirectorySchema.parse({
    ...raw,
    summary: referenceSummary(raw.summary),
  });
}

export function projectEditorCandidateDirectory(value: unknown) {
  const rawItem = z.object({ asset: rawAssetSchema, version: rawVersionSchema }).strict();
  const page = projectPage(value, rawItem);
  return worldEditorAssetCandidateDirectorySchema.parse({
    ...page.raw,
    items: page.items.map(({ asset: rawAsset, version: rawVersion }) => {
      const asset = projectAsset(rawAsset);
      const activeVersion = projectVersion(rawVersion, asset.assetType);
      return {
        assetKey: asset.slug,
        versionId: activeVersion.id,
        asset,
        activeVersion,
        supportedInteractions: activeVersion.interactionCompatibility,
        supportedRotations: activeVersion.render.supportedRotations,
      };
    }),
  });
}

export function parsePersistenceFailure(value: unknown): string | undefined {
  return z.object({ status: z.string() }).passthrough().safeParse(value).data?.status;
}
