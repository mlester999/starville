import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  ASSET_CATEGORIES,
  ASSET_TYPES,
  GLOBAL_ASSET_DERIVATIVE_MAX_BYTES,
  GLOBAL_ASSET_INTAKE_MAX_BYTES,
  assetActivationActionSchema,
  assetCreateVersionActionSchema,
  assetCreateVersionUploadMetadataSchema,
  assetDeprecationActionSchema,
  assetDraftUpdateSchema,
  assetReviewActionSchema,
  assetRestoreBundledDefaultActionSchema,
  assetUploadMetadataSchema,
  assetUuidSchema,
  assetValidationResultSchema,
  assetVersionActionSchema,
  getAssetTypeProfile,
  type AssetType,
  type AssetValidationIssue,
} from '@starville/asset-management';

import { PublicApiError } from '../errors.js';
import type { AdminDatabaseIdentity } from '../contracts.js';
import type {
  AdminAssetService,
  AdminAssetServiceOptions,
  AssetUploadInput,
  AssetVersionUploadInput,
} from './contracts.js';
import { AdminAssetPersistenceError } from './gateway.js';
import {
  AssetProcessingError,
  detectRasterMediaType,
  processAssetImage,
  type ProcessedAssetImage,
} from './image-processor.js';
import {
  assetActivationMaterialSchema,
  assetPreviewMaterialSchema,
  assetUploadReservationSchema,
  parsePersistenceFailure,
  projectAssetDetail,
  projectAssetDirectory,
  projectAssetMutation,
  projectAssetVersionDetail,
  projectAuditDirectory,
  projectEditorCandidateDirectory,
  projectReferenceDirectory,
  projectReviewQueue,
} from './persistence.js';
import {
  AssetStorageError,
  assertInternalStoragePath,
  privateDerivativePaths,
  publicDerivativePaths,
} from './storage.js';

const pageSizeSchema = z.preprocess(
  (value) => (value === undefined ? 10 : value),
  z.coerce
    .number()
    .int()
    .refine((value) => [10, 50, 100].includes(value)),
);
const offsetSchema = z.preprocess(
  (value) => (value === undefined ? 0 : value),
  z.coerce.number().int().min(0).max(999_900),
);
const normalizedSearchSchema = z
  .string()
  .max(100)
  .default('')
  .transform((value) => value.normalize('NFKC').trim());
const directoryQuerySchema = z
  .object({
    search: normalizedSearchSchema,
    assetType: z.enum(['all', ...ASSET_TYPES]).default('all'),
    category: z.enum(['', 'all', ...ASSET_CATEGORIES]).default('all'),
    lifecycleStatus: z.enum(['all', 'draft', 'active', 'deprecated', 'archived']).default('all'),
    productionStatus: z
      .enum([
        'all',
        'development_marker',
        'production_candidate',
        'approved_production',
        'deprecated',
      ])
      .default('all'),
    sort: z
      .enum([
        'friendly_name',
        'updated_at',
        'asset_type',
        'lifecycle_status',
        'version_count',
        'reference_count',
      ])
      .default('updated_at'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    limit: pageSizeSchema,
    offset: offsetSchema,
  })
  .strict();
const simpleDirectoryQuerySchema = z
  .object({
    search: normalizedSearchSchema,
    limit: pageSizeSchema,
    offset: offsetSchema,
  })
  .strict();
const auditQuerySchema = simpleDirectoryQuerySchema
  .extend({
    assetId: assetUuidSchema.optional(),
    outcome: z.enum(['all', 'success', 'denied', 'error']).default('all'),
  })
  .strict();
const referenceQuerySchema = z.object({ limit: pageSizeSchema, offset: offsetSchema }).strict();
const editorCandidateQuerySchema = directoryQuerySchema
  .pick({
    search: true,
    assetType: true,
    category: true,
    lifecycleStatus: true,
    productionStatus: true,
    sort: true,
    direction: true,
    limit: true,
    offset: true,
  })
  .extend({
    interaction: z
      .enum([
        'all',
        'decorative',
        'shop',
        'cooking_station',
        'crafting_station',
        'home_entrance',
        'farm_plot',
        'sign',
      ])
      .default('all'),
  })
  .strict();
const mutationValidationSchema = z
  .object({
    expectedEditVersion: z.number().int().positive(),
    idempotencyKey: assetUuidSchema,
  })
  .strict();
const mediaVariantSchema = z.enum(['original', 'source', 'preview', 'thumbnail']);

function page(limit: number, offset: number): number {
  if (offset % limit !== 0) throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
  return offset / limit + 1;
}

function validId(value: unknown): string {
  const parsed = assetUuidSchema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
  return parsed.data;
}

function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
  return parsed.data;
}

function assertIdempotency(bodyKey: string, requestId: string): void {
  if (bodyKey !== requestId) throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
}

function safeFileName(value: string): string {
  const normalized = value.normalize('NFKC').trim();
  if (
    normalized.length < 1 ||
    normalized.length > 160 ||
    /[\\/\p{Cc}]/u.test(normalized) ||
    normalized === '.' ||
    normalized === '..'
  ) {
    throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
  }
  return normalized;
}

function declaredMediaType(value: string): 'image/png' | 'image/webp' {
  if (value !== 'image/png' && value !== 'image/webp') {
    throw new PublicApiError(422, 'ASSET_FILE_UNSUPPORTED');
  }
  return value;
}

function assertProfileInput(
  assetType: AssetType,
  category: string,
  byteLength: number,
): ReturnType<typeof getAssetTypeProfile> {
  const profile = getAssetTypeProfile(assetType);
  if (!profile.allowedCategories.includes(category as never)) {
    throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
  }
  if (byteLength > profile.maximumSourceBytes) {
    throw new PublicApiError(413, 'ASSET_FILE_TOO_LARGE');
  }
  return profile;
}

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertOriginalIntakePath(path: string, assetId: string): string {
  const safePath = assertInternalStoragePath(path);
  const uploadId = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  if (
    !new RegExp(`^starville/${assetId}/${uploadId}/original\\.(?:png|webp)$`, 'u').test(safePath)
  ) {
    throw new AssetStorageError('INVALID_STORAGE_PATH');
  }
  return safePath;
}

function processingFailureStatus(error: AssetProcessingError): PublicApiError {
  if (error.code === 'IMAGE_TOO_LARGE') {
    return new PublicApiError(413, 'ASSET_FILE_TOO_LARGE');
  }
  if (error.code === 'UNSUPPORTED_IMAGE' || error.code === 'MIME_MISMATCH') {
    return new PublicApiError(422, 'ASSET_FILE_UNSUPPORTED');
  }
  return new PublicApiError(422, 'ASSET_FILE_INVALID');
}

function safeFailureValidation(
  code: string,
  issues: readonly AssetValidationIssue[],
  now: () => Date,
) {
  return assetValidationResultSchema.parse({
    valid: false,
    checkedAt: now().toISOString(),
    issues:
      issues.length === 0
        ? [
            {
              code,
              level: 'blocking_error',
              path: 'file',
              message: 'The image could not be processed safely.',
            },
          ]
        : issues,
  });
}

function mapFailure(value: unknown): void {
  const status = parsePersistenceFailure(value);
  if (status === undefined || status === 'loaded') return;
  if (status === 'not_found') throw new PublicApiError(404, 'ASSET_NOT_FOUND');
  if (status === 'rate_limited') throw new PublicApiError(429, 'RATE_LIMITED');
  if (status === 'duplicate_content') throw new PublicApiError(409, 'ASSET_DUPLICATE');
  if (status === 'request_conflict') throw new PublicApiError(409, 'ASSET_REQUEST_CONFLICT');
  if (
    status === 'asset_version_conflict' ||
    status === 'upload_version_conflict' ||
    status === 'version_conflict'
  ) {
    throw new PublicApiError(409, 'ASSET_VERSION_CONFLICT');
  }
  if (status === 'referenced') throw new PublicApiError(409, 'ASSET_REFERENCED');
  if (status === 'bundled_default_missing') {
    throw new PublicApiError(409, 'ASSET_BUNDLED_DEFAULT_MISSING');
  }
  if (status === 'override_not_available') {
    throw new PublicApiError(409, 'ASSET_OVERRIDE_NOT_AVAILABLE');
  }
  if (status === 'already_bundled_default' || status === 'restore_not_allowed') {
    throw new PublicApiError(409, 'ASSET_RESTORE_DEFAULT_NOT_ALLOWED');
  }
  if (
    status === 'slug_conflict' ||
    status === 'state_conflict' ||
    status === 'processing_not_available' ||
    status === 'asset_archived' ||
    status === 'open_version_exists' ||
    status === 'version_not_copyable' ||
    status === 'version_source_not_copyable' ||
    status === 'version_not_editable' ||
    status === 'version_not_validatable' ||
    status === 'version_not_submittable' ||
    status === 'version_not_reviewable' ||
    status === 'version_not_approvable' ||
    status === 'version_not_activatable'
  ) {
    throw new PublicApiError(409, 'ASSET_STATE_CONFLICT');
  }
}

function requireSensitiveAssetAal2(identity: AdminDatabaseIdentity): void {
  if (identity.assuranceLevel !== 'aal2') {
    throw new PublicApiError(403, 'MFA_REQUIRED');
  }
}

function reviewIntentFingerprint(values: readonly (string | number)[]): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function parseResult<T>(value: unknown, project: (input: unknown) => T): T {
  mapFailure(value);
  try {
    return project(value);
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError(503, 'ASSET_MANAGEMENT_UNAVAILABLE');
  }
}

function assertTarget(
  actualAssetId: string,
  expectedAssetId: string,
  actualVersionId?: string | null,
  expectedVersionId?: string,
): void {
  if (
    actualAssetId !== expectedAssetId ||
    (expectedVersionId !== undefined && actualVersionId !== expectedVersionId)
  ) {
    throw new PublicApiError(409, 'ASSET_STATE_CONFLICT');
  }
}

function parseTargetedMutation(value: unknown, assetId: string, versionId?: string) {
  const result = parseResult(value, projectAssetMutation);
  assertTarget(result.asset.id, assetId, result.version?.id, versionId);
  return result;
}

function transparencyResult(image: ProcessedAssetImage): 'opaque' | 'partial' {
  return image.hasTransparency ? 'partial' : 'opaque';
}

export function createAdminAssetService(
  options: AdminAssetServiceOptions & { readonly now?: () => Date },
): AdminAssetService {
  const { gateway, storage, logger } = options;
  const now = options.now ?? (() => new Date());

  const guarded = async <T>(
    requestId: string,
    operation: () => Promise<T>,
    logContext: Readonly<Record<string, unknown>> = {},
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PublicApiError) throw error;
      const processingStage =
        typeof logContext['processingStage'] === 'string'
          ? logContext['processingStage']
          : 'service_operation';
      const operationLogger = logger.child({ requestId, ...logContext });
      if (error instanceof AssetStorageError) {
        operationLogger.error('admin.asset.storage_failed', {
          processingStage,
          errorCategory: 'storage_unavailable',
        });
        throw new PublicApiError(503, 'ASSET_STORAGE_UNAVAILABLE');
      }
      if (
        error instanceof AdminAssetPersistenceError &&
        error.safeReason === 'validated_version_immutable'
      ) {
        operationLogger.warn('admin.asset.lifecycle_conflict', {
          processingStage,
          errorCategory: 'validated_version_immutable',
        });
        throw new PublicApiError(409, 'ASSET_STATE_CONFLICT');
      }
      operationLogger.error('admin.asset.failed', {
        processingStage,
        errorCategory: 'database_or_service_unavailable',
      });
      throw new PublicApiError(503, 'ASSET_MANAGEMENT_UNAVAILABLE');
    }
  };

  async function recordProcessingFailure(
    identity: Parameters<AdminAssetService['upload']>[0],
    reservation: z.infer<typeof assetUploadReservationSchema>,
    requestId: string,
    errorCode: string,
    validationResult: ReturnType<typeof assetValidationResultSchema.parse>,
  ): Promise<void> {
    try {
      await gateway.failProcessing(identity, {
        p_asset_id: reservation.assetId,
        p_version_id: reservation.versionId,
        p_upload_id: reservation.uploadId,
        p_expected_revision: reservation.uploadRevision,
        p_error_code: errorCode,
        p_validation_results: validationResult,
        p_request_id: requestId,
        p_rate_limit: options.mutationRateLimit,
      });
    } catch {
      logger
        .child({ requestId, assetId: reservation.assetId })
        .error('admin.asset.failure_record_failed', {
          processingStage: 'failure_record',
          errorCategory: 'database_unavailable',
        });
    }
  }

  async function cleanupPrivatePaths(
    assetId: string,
    paths: readonly string[],
    requestId: string,
  ): Promise<void> {
    if (paths.length === 0) return;
    try {
      await storage.removePrivate(paths);
    } catch {
      logger.child({ requestId, assetId }).error('admin.asset.partial_upload_cleanup_failed', {
        processingStage: 'cleanup',
        errorCategory: 'private_storage_unavailable',
      });
    }
  }

  async function processReservation(
    identity: Parameters<AdminAssetService['upload']>[0],
    reservation: z.infer<typeof assetUploadReservationSchema>,
    input: AssetUploadInput | AssetVersionUploadInput,
    profile: ReturnType<typeof getAssetTypeProfile>,
    mediaType: 'image/png' | 'image/webp',
    requestId: string,
  ) {
    const originalFileName = safeFileName(input.originalFileName);
    const log = logger.child({ requestId, assetId: reservation.assetId });
    const newlyStoredPaths: string[] = [];
    let processingStage = 'intake_storage';
    try {
      const intakePath = assertInternalStoragePath(reservation.intakePath);
      const intakeResult = await storage.storePrivateImmutable(intakePath, input.bytes, mediaType);
      if (intakeResult === 'stored') newlyStoredPaths.push(intakePath);
      processingStage = 'image_processing';
      const processed = await processAssetImage(
        {
          bytes: input.bytes,
          declaredMediaType: mediaType,
          originalFileName,
          profile,
        },
        now,
      );
      const paths = privateDerivativePaths(reservation.assetId, reservation.versionId);
      processingStage = 'derivative_storage';
      const derivativeWrites = await Promise.allSettled([
        storage.storePrivateImmutable(paths.source, processed.normalizedSource, 'image/webp'),
        storage.storePrivateImmutable(paths.preview, processed.preview, 'image/webp'),
        storage.storePrivateImmutable(paths.thumbnail, processed.thumbnail, 'image/webp'),
      ]);
      const derivativePaths = [paths.source, paths.preview, paths.thumbnail] as const;
      derivativeWrites.forEach((result, index) => {
        const derivativePath = derivativePaths[index];
        if (
          derivativePath !== undefined &&
          result.status === 'fulfilled' &&
          result.value === 'stored'
        ) {
          newlyStoredPaths.push(derivativePath);
        }
      });
      const derivativeFailure = derivativeWrites.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (derivativeFailure !== undefined) throw derivativeFailure.reason;
      processingStage = 'database_completion';
      const result = await gateway.completeProcessing(identity, {
        p_asset_id: reservation.assetId,
        p_version_id: reservation.versionId,
        p_upload_id: reservation.uploadId,
        p_expected_revision: reservation.uploadRevision,
        p_original_checksum_sha256: processed.originalChecksumSha256,
        p_processed_source_checksum_sha256: processed.processedSourceChecksumSha256,
        p_detected_mime_type: processed.detectedMediaType,
        p_source_width: processed.sourceWidth,
        p_source_height: processed.sourceHeight,
        p_source_size_bytes: processed.sourceSizeBytes,
        p_processed_source_path: paths.source,
        p_processed_source_width: processed.normalizedSourceWidth,
        p_processed_source_height: processed.normalizedSourceHeight,
        p_processed_source_size_bytes: processed.normalizedSourceSizeBytes,
        p_processed_preview_path: paths.preview,
        p_processed_preview_width: processed.previewWidth,
        p_processed_preview_height: processed.previewHeight,
        p_processed_preview_size_bytes: processed.previewSizeBytes,
        p_processed_thumbnail_path: paths.thumbnail,
        p_processed_thumbnail_width: processed.thumbnailWidth,
        p_processed_thumbnail_height: processed.thumbnailHeight,
        p_processed_thumbnail_size_bytes: processed.thumbnailSizeBytes,
        p_transparency_result: transparencyResult(processed),
        p_validation_results: processed.validationResult,
        p_request_id: requestId,
        p_rate_limit: options.mutationRateLimit,
      });
      return parseTargetedMutation(result, reservation.assetId, reservation.versionId);
    } catch (error) {
      const storageFailure = error instanceof AssetStorageError;
      const processingError = error instanceof AssetProcessingError ? error : null;
      const publicFailure = error instanceof PublicApiError ? error : null;
      const completionOutcomeUnknown =
        processingStage === 'database_completion' && publicFailure === null;
      const errorCode = storageFailure ? 'STORAGE_FAILED' : processingError?.code;
      const errorCategory = storageFailure
        ? 'private_storage_unavailable'
        : processingError !== null
          ? 'image_processing_rejected'
          : completionOutcomeUnknown
            ? 'database_completion_outcome_unknown'
            : publicFailure !== null
              ? publicFailure.code.toLowerCase()
              : 'database_unavailable';
      log.error('admin.asset.version_upload_failed', { processingStage, errorCategory });
      if (errorCode !== undefined) {
        await recordProcessingFailure(
          identity,
          reservation,
          requestId,
          errorCode,
          safeFailureValidation(errorCode, processingError?.validationIssues ?? [], now),
        );
      }
      if (!completionOutcomeUnknown) {
        await cleanupPrivatePaths(reservation.assetId, newlyStoredPaths, requestId);
      }
      if (storageFailure) throw new PublicApiError(503, 'ASSET_STORAGE_UNAVAILABLE');
      if (processingError !== null) throw processingFailureStatus(processingError);
      throw error;
    }
  }

  return {
    async listAssets(identity, query, requestId) {
      const parsed = directoryQuerySchema.safeParse(query);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
      return guarded(requestId, async () => {
        const value = await gateway.listAssets(identity, {
          p_page: page(parsed.data.limit, parsed.data.offset),
          p_page_size: parsed.data.limit,
          p_search: parsed.data.search,
          p_asset_type: parsed.data.assetType,
          p_category: parsed.data.category === '' ? 'all' : parsed.data.category,
          p_lifecycle_status: parsed.data.lifecycleStatus,
          p_production_status: parsed.data.productionStatus,
          p_sort: parsed.data.sort,
          p_direction: parsed.data.direction,
          p_request_id: requestId,
          p_rate_limit: options.readRateLimit,
        });
        return parseResult(value, projectAssetDirectory);
      });
    },
    async getAsset(identity, assetId, requestId) {
      const safeAssetId = validId(assetId);
      return guarded(requestId, async () => {
        const value = await gateway.getAsset(identity, {
          p_asset_id: safeAssetId,
          p_request_id: requestId,
          p_rate_limit: options.readRateLimit,
        });
        const result = parseResult(value, projectAssetDetail);
        assertTarget(result.asset.id, safeAssetId);
        return result;
      });
    },
    async getVersion(identity, assetId, versionId, requestId) {
      const safeAssetId = validId(assetId);
      const safeVersionId = validId(versionId);
      return guarded(requestId, async () => {
        const value = await gateway.getVersion(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_request_id: requestId,
          p_rate_limit: options.readRateLimit,
        });
        const result = parseResult(value, projectAssetVersionDetail);
        assertTarget(result.asset.id, safeAssetId, result.version.id, safeVersionId);
        return result;
      });
    },
    async readMedia(identity, assetId, versionId, variant, requestId) {
      const safeAssetId = validId(assetId);
      const safeVersionId = validId(versionId);
      const parsedVariant = mediaVariantSchema.safeParse(variant);
      if (!parsedVariant.success) throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
      return guarded(requestId, async () => {
        const raw = await gateway.previewMaterial(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_request_id: requestId,
          p_rate_limit: options.readRateLimit,
        });
        mapFailure(raw);
        const material = assetPreviewMaterialSchema.parse(raw);
        assertTarget(material.assetId, safeAssetId, material.versionId, safeVersionId);
        if (parsedVariant.data === 'original' && material.originalPath === null) {
          throw new PublicApiError(404, 'ASSET_NOT_FOUND');
        }
        const path = {
          original:
            material.originalPath === null
              ? material.processedSourcePath
              : assertOriginalIntakePath(material.originalPath, safeAssetId),
          source: material.processedSourcePath,
          preview: material.processedPreviewPath,
          thumbnail: material.processedThumbnailPath,
        }[parsedVariant.data];
        const bytes = await storage.readPrivate(assertInternalStoragePath(path));
        const mediaType = detectRasterMediaType(bytes);
        const maximumBytes =
          parsedVariant.data === 'original'
            ? GLOBAL_ASSET_INTAKE_MAX_BYTES
            : GLOBAL_ASSET_DERIVATIVE_MAX_BYTES;
        if (
          bytes.length < 12 ||
          bytes.length > maximumBytes ||
          mediaType === undefined ||
          (parsedVariant.data !== 'original' && mediaType !== 'image/webp')
        ) {
          throw new PublicApiError(503, 'ASSET_STORAGE_UNAVAILABLE');
        }
        return { bytes, checksum: checksum(bytes), mediaType };
      });
    },
    async upload(identity, input, requestId) {
      const metadata = parseRequest(assetUploadMetadataSchema, input.metadata);
      assertIdempotency(metadata.idempotencyKey, requestId);
      const originalFileName = safeFileName(input.originalFileName);
      const mediaType = declaredMediaType(input.declaredMediaType);
      const profile = assertProfileInput(metadata.assetType, metadata.category, input.bytes.length);
      return guarded(requestId, async () => {
        const raw = await gateway.createUpload(identity, {
          p_friendly_name: metadata.friendlyName,
          p_slug: metadata.slug,
          p_asset_type: metadata.assetType,
          p_category: metadata.category,
          p_development_marker_replacement_key: metadata.developmentMarkerReplacementKey,
          p_original_file_name: originalFileName,
          p_declared_mime_type: mediaType,
          p_declared_size_bytes: input.bytes.length,
          p_request_id: requestId,
          p_rate_limit: options.mutationRateLimit,
        });
        mapFailure(raw);
        const reservation = assetUploadReservationSchema.parse(raw);
        return processReservation(identity, reservation, input, profile, mediaType, requestId);
      });
    },
    async updateDraft(identity, assetId, versionId, body, requestId) {
      const parsed = parseRequest(assetDraftUpdateSchema, body);
      assertIdempotency(parsed.idempotencyKey, requestId);
      const safeAssetId = validId(assetId);
      const safeVersionId = validId(versionId);
      return guarded(requestId, async () => {
        const value = await gateway.updateDraft(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_expected_edit_version: parsed.expectedEditVersion,
          p_friendly_name: parsed.friendlyName,
          p_category: parsed.category,
          p_tags: parsed.tags,
          p_internal_notes: parsed.internalNotes,
          p_render_width: parsed.render.renderWidth,
          p_render_height: parsed.render.renderHeight,
          p_render_scale: parsed.render.scale,
          p_anchor_x: parsed.render.anchor.x,
          p_anchor_y: parsed.render.anchor.y,
          p_foot_anchor_x: parsed.render.footAnchor.x,
          p_foot_anchor_y: parsed.render.footAnchor.y,
          p_depth_anchor_x: parsed.render.depthAnchor.x,
          p_depth_anchor_y: parsed.render.depthAnchor.y,
          p_collision_profile: parsed.collision,
          p_supported_rotations: parsed.render.supportedRotations,
          p_default_rotation: parsed.render.defaultRotation,
          p_interaction_compatibility: parsed.interactionCompatibility,
          p_request_id: requestId,
          p_rate_limit: options.mutationRateLimit,
        });
        return parseTargetedMutation(value, safeAssetId, safeVersionId);
      });
    },
    async validateVersion(identity, assetId, versionId, body, requestId) {
      const parsed = parseRequest(mutationValidationSchema, body);
      assertIdempotency(parsed.idempotencyKey, requestId);
      const safeAssetId = validId(assetId);
      const safeVersionId = validId(versionId);
      return guarded(requestId, async () => {
        const value = await gateway.validateVersion(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_expected_edit_version: parsed.expectedEditVersion,
          p_request_id: requestId,
          p_rate_limit: options.mutationRateLimit,
        });
        return parseTargetedMutation(value, safeAssetId, safeVersionId);
      });
    },
    async submitReview(identity, assetId, versionId, body, requestId) {
      const parsed = parseRequest(assetVersionActionSchema, body);
      assertIdempotency(parsed.idempotencyKey, requestId);
      const safeAssetId = validId(assetId);
      const safeVersionId = validId(versionId);
      return guarded(requestId, async () => {
        const intent = await gateway.claimOperationIntent(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_operation: 'submit_asset_review',
          p_request_id: requestId,
          p_reason: parsed.reason,
          p_intent_fingerprint: reviewIntentFingerprint([
            'submit_asset_review',
            safeAssetId,
            safeVersionId,
            parsed.expectedEditVersion,
            parsed.reason,
          ]),
        });
        mapFailure(intent);
        const value = await gateway.submitReview(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_expected_edit_version: parsed.expectedEditVersion,
          p_reason: parsed.reason,
          p_request_id: requestId,
          p_rate_limit: options.mutationRateLimit,
        });
        return parseTargetedMutation(value, safeAssetId, safeVersionId);
      });
    },
    async reviewVersion(identity, assetId, versionId, body, requestId) {
      const parsed = parseRequest(assetReviewActionSchema, body);
      if (parsed.action === 'approve') requireSensitiveAssetAal2(identity);
      assertIdempotency(parsed.idempotencyKey, requestId);
      const safeAssetId = validId(assetId);
      const safeVersionId = validId(versionId);
      return guarded(requestId, async () => {
        const intent = await gateway.claimOperationIntent(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_operation: 'review_asset_version',
          p_request_id: requestId,
          p_reason: parsed.reason,
          p_intent_fingerprint: reviewIntentFingerprint([
            'review_asset_version',
            safeAssetId,
            safeVersionId,
            parsed.expectedEditVersion,
            parsed.action,
            parsed.reason,
          ]),
        });
        mapFailure(intent);
        const value = await gateway.reviewVersion(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_expected_edit_version: parsed.expectedEditVersion,
          p_action: parsed.action,
          p_reason: parsed.reason,
          p_request_id: requestId,
          p_rate_limit: options.mutationRateLimit,
        });
        return parseTargetedMutation(value, safeAssetId, safeVersionId);
      });
    },
    async activateVersion(identity, assetId, versionId, body, requestId) {
      const parsed = parseRequest(assetActivationActionSchema, body);
      requireSensitiveAssetAal2(identity);
      assertIdempotency(parsed.idempotencyKey, requestId);
      const safeAssetId = validId(assetId);
      const safeVersionId = validId(versionId);
      return guarded(requestId, async () => {
        const intent = await gateway.claimOperationIntent(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_operation: 'activate_asset_version',
          p_request_id: requestId,
          p_reason: parsed.reason,
          p_intent_fingerprint: reviewIntentFingerprint([
            'activate_asset_version',
            safeAssetId,
            safeVersionId,
            parsed.expectedAssetRevision,
            parsed.expectedEditVersion,
            parsed.reason,
          ]),
        });
        mapFailure(intent);
        const rawMaterial = await gateway.activationMaterial(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_expected_asset_revision: parsed.expectedAssetRevision,
          p_expected_edit_version: parsed.expectedEditVersion,
          p_request_id: requestId,
          p_rate_limit: options.readRateLimit,
        });
        mapFailure(rawMaterial);
        const material = assetActivationMaterialSchema.parse(rawMaterial);
        assertTarget(material.assetId, safeAssetId, material.versionId, safeVersionId);
        const [source, preview, thumbnail] = await Promise.all([
          storage.readPrivate(assertInternalStoragePath(material.processedSourcePath)),
          storage.readPrivate(assertInternalStoragePath(material.processedPreviewPath)),
          storage.readPrivate(assertInternalStoragePath(material.processedThumbnailPath)),
        ] as const);
        if (
          [source, preview, thumbnail].some(
            (bytes) =>
              bytes.length < 12 ||
              bytes.length > GLOBAL_ASSET_DERIVATIVE_MAX_BYTES ||
              detectRasterMediaType(bytes) !== 'image/webp',
          ) ||
          checksum(source) !== material.checksumSha256
        ) {
          throw new PublicApiError(503, 'ASSET_STORAGE_UNAVAILABLE');
        }
        const delivery = publicDerivativePaths(material.slug, material.versionNumber);
        await Promise.all([
          storage.storePublicImmutable(delivery.source, source),
          storage.storePublicImmutable(delivery.preview, preview),
          storage.storePublicImmutable(delivery.thumbnail, thumbnail),
        ]);
        const result = await gateway.activateVersion(identity, {
          p_asset_id: safeAssetId,
          p_version_id: safeVersionId,
          p_expected_asset_revision: parsed.expectedAssetRevision,
          p_expected_edit_version: parsed.expectedEditVersion,
          p_delivery_source_path: delivery.source,
          p_delivery_preview_path: delivery.preview,
          p_delivery_thumbnail_path: delivery.thumbnail,
          p_reason: parsed.reason,
          p_request_id: requestId,
          p_rate_limit: options.mutationRateLimit,
        });
        return parseTargetedMutation(result, safeAssetId, safeVersionId);
      });
    },
    async deprecateAsset(identity, assetId, body, requestId) {
      const parsed = parseRequest(assetDeprecationActionSchema, body);
      requireSensitiveAssetAal2(identity);
      assertIdempotency(parsed.idempotencyKey, requestId);
      const safeAssetId = validId(assetId);
      return guarded(requestId, async () => {
        const result = await gateway.deprecateAsset(identity, {
          p_asset_id: safeAssetId,
          p_expected_asset_revision: parsed.expectedAssetRevision,
          p_reason: parsed.reason,
          p_request_id: requestId,
          p_rate_limit: options.mutationRateLimit,
        });
        return parseTargetedMutation(result, safeAssetId);
      });
    },
    async restoreBundledDefault(identity, assetId, body, requestId) {
      const parsed = parseRequest(assetRestoreBundledDefaultActionSchema, body);
      requireSensitiveAssetAal2(identity);
      assertIdempotency(parsed.idempotencyKey, requestId);
      const safeAssetId = validId(assetId);
      return guarded(requestId, async () => {
        const detailValue = await gateway.getAsset(identity, {
          p_asset_id: safeAssetId,
          p_request_id: requestId,
          p_rate_limit: options.readRateLimit,
        });
        const detail = parseResult(detailValue, projectAssetDetail);
        assertTarget(detail.asset.id, safeAssetId);
        const bundledDefaultVersionId = detail.asset.bundledDefaultVersionId;
        if (bundledDefaultVersionId === null) {
          throw new PublicApiError(409, 'ASSET_BUNDLED_DEFAULT_MISSING');
        }
        const intent = await gateway.claimOperationIntent(identity, {
          p_asset_id: safeAssetId,
          p_version_id: bundledDefaultVersionId,
          p_operation: 'restore_bundled_default',
          p_request_id: requestId,
          p_reason: parsed.reason,
          p_intent_fingerprint: reviewIntentFingerprint([
            'restore_bundled_default',
            safeAssetId,
            bundledDefaultVersionId,
            parsed.expectedAssetRevision,
            parsed.reason,
          ]),
        });
        mapFailure(intent);
        const result = await gateway.restoreBundledDefault(identity, {
          p_asset_id: safeAssetId,
          p_expected_asset_revision: parsed.expectedAssetRevision,
          p_reason: parsed.reason,
          p_request_id: requestId,
          p_rate_limit: options.mutationRateLimit,
        });
        return parseTargetedMutation(result, safeAssetId);
      });
    },
    async archiveAsset(identity, assetId, body, requestId) {
      const parsed = parseRequest(assetDeprecationActionSchema, body);
      requireSensitiveAssetAal2(identity);
      assertIdempotency(parsed.idempotencyKey, requestId);
      const safeAssetId = validId(assetId);
      return guarded(requestId, async () => {
        const result = await gateway.archiveAsset(identity, {
          p_asset_id: safeAssetId,
          p_expected_asset_revision: parsed.expectedAssetRevision,
          p_reason: parsed.reason,
          p_request_id: requestId,
          p_rate_limit: options.mutationRateLimit,
        });
        return parseTargetedMutation(result, safeAssetId);
      });
    },
    async createVersion(identity, assetId, input, requestId) {
      const metadata = parseRequest(assetCreateVersionUploadMetadataSchema, input.metadata);
      assertIdempotency(metadata.idempotencyKey, requestId);
      const safeAssetId = validId(assetId);
      const originalFileName = safeFileName(input.originalFileName);
      const mediaType = declaredMediaType(input.declaredMediaType);
      return guarded(
        requestId,
        async () => {
          const detailValue = await gateway.getAsset(identity, {
            p_asset_id: safeAssetId,
            p_request_id: requestId,
            p_rate_limit: options.readRateLimit,
          });
          const detail = parseResult(detailValue, projectAssetDetail);
          assertTarget(detail.asset.id, safeAssetId);
          const profile = assertProfileInput(
            detail.asset.assetType,
            detail.asset.category,
            input.bytes.length,
          );
          const raw = await gateway.createVersion(identity, {
            p_asset_id: safeAssetId,
            p_source_version_id: metadata.sourceVersionId,
            p_configuration_mode: metadata.configurationMode,
            p_expected_asset_revision: metadata.expectedAssetRevision,
            p_reason: metadata.reason,
            p_original_file_name: originalFileName,
            p_declared_mime_type: mediaType,
            p_declared_size_bytes: input.bytes.length,
            p_request_id: requestId,
            p_rate_limit: options.mutationRateLimit,
          });
          mapFailure(raw);
          const reservation = assetUploadReservationSchema.parse(raw);
          assertTarget(reservation.assetId, safeAssetId);
          return processReservation(identity, reservation, input, profile, mediaType, requestId);
        },
        {
          assetId: safeAssetId,
          processingStage: 'database_reservation',
        },
      );
    },
    async createVersionFromExisting(identity, assetId, body, requestId) {
      const parsed = parseRequest(assetCreateVersionActionSchema, body);
      assertIdempotency(parsed.idempotencyKey, requestId);
      const safeAssetId = validId(assetId);
      return guarded(
        requestId,
        async () => {
          const value = await gateway.createVersionFromExisting(identity, {
            p_asset_id: safeAssetId,
            p_source_version_id: parsed.sourceVersionId,
            p_configuration_mode: parsed.configurationMode,
            p_expected_asset_revision: parsed.expectedAssetRevision,
            p_reason: parsed.reason,
            p_request_id: requestId,
            p_rate_limit: options.mutationRateLimit,
          });
          return parseTargetedMutation(value, safeAssetId);
        },
        {
          assetId: safeAssetId,
          processingStage: 'database_successor_creation',
        },
      );
    },
    async listReviewQueue(identity, query, requestId) {
      const parsed = directoryQuerySchema.safeParse(query);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
      return guarded(requestId, async () => {
        const value = await gateway.listReviewQueue(identity, {
          p_page: page(parsed.data.limit, parsed.data.offset),
          p_page_size: parsed.data.limit,
          p_search: parsed.data.search,
          p_asset_type: parsed.data.assetType,
          p_category: parsed.data.category === '' ? 'all' : parsed.data.category,
          p_production_status: parsed.data.productionStatus,
          p_sort: parsed.data.sort,
          p_direction: parsed.data.direction,
          p_request_id: requestId,
          p_rate_limit: options.readRateLimit,
        });
        return parseResult(value, projectReviewQueue);
      });
    },
    async listAudit(identity, query, requestId) {
      const parsed = auditQuerySchema.safeParse(query);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
      return guarded(requestId, async () => {
        const value = await gateway.listAudit(identity, {
          p_asset_id: parsed.data.assetId ?? null,
          p_page: page(parsed.data.limit, parsed.data.offset),
          p_page_size: parsed.data.limit,
          p_search: parsed.data.search,
          p_outcome: parsed.data.outcome,
          p_request_id: requestId,
          p_rate_limit: options.readRateLimit,
        });
        return parseResult(value, projectAuditDirectory);
      });
    },
    async listReferences(identity, assetId, query, requestId) {
      const parsed = referenceQuerySchema.safeParse(query);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
      return guarded(requestId, async () => {
        const value = await gateway.listReferences(identity, {
          p_asset_id: validId(assetId),
          p_page: page(parsed.data.limit, parsed.data.offset),
          p_page_size: parsed.data.limit,
          p_request_id: requestId,
          p_rate_limit: options.readRateLimit,
        });
        return parseResult(value, projectReferenceDirectory);
      });
    },
    async listEditorCandidates(identity, query, requestId) {
      const parsed = editorCandidateQuerySchema.safeParse(query);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
      return guarded(requestId, async () => {
        const value = await gateway.listEditorCandidates(identity, {
          p_page: page(parsed.data.limit, parsed.data.offset),
          p_page_size: parsed.data.limit,
          p_search: parsed.data.search,
          p_asset_type: parsed.data.assetType,
          p_category: parsed.data.category === '' ? 'all' : parsed.data.category,
          p_interaction: parsed.data.interaction,
          p_request_id: requestId,
          p_rate_limit: options.readRateLimit,
        });
        return parseResult(value, projectEditorCandidateDirectory);
      });
    },
  };
}
