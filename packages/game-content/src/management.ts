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
    status: z.enum(['created', 'updated']),
    map: worldMapSchema,
    version: worldVersionSummarySchema,
    manifest: mapManifestSchema,
  })
  .strict();

export const worldDraftLoadSchema = worldDraftSchema.extend({ status: z.literal('loaded') });

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
    previousVersionId: z.uuid().nullable(),
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
export type WorldPreview = z.infer<typeof worldPreviewSchema>;
export type WorldAsset = z.infer<typeof worldAssetSchema>;
export type WorldAssetDirectory = z.infer<typeof worldAssetDirectorySchema>;
export type WorldAuditEvent = z.infer<typeof worldAuditEventSchema>;
export type WorldAuditDirectory = z.infer<typeof worldAuditDirectorySchema>;
export type WorldValidationResult = z.infer<typeof worldValidationResultSchema>;
export type AdminWorldManifest = z.infer<typeof mapManifestSchema>;
