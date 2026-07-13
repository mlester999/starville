import { z } from 'zod';

import {
  worldAssetDirectorySchema,
  worldAuditDirectorySchema,
  worldDetailSchema,
  worldDirectorySchema,
  worldDraftLoadSchema,
  worldDraftSchema,
  worldPreviewSchema,
  publishedWorldTopologySchema,
  worldPublishResponseSchema,
  worldValidationResponseSchema,
} from '@starville/game-content';
import { mapManifestSchema } from '@starville/game-core';

import type { ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type { AdminWorldGateway, AdminWorldService } from './admin-contracts.js';

const uuidSchema = z.uuid();
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const safeReasonSchema = z
  .string()
  .trim()
  .min(12)
  .max(500)
  .refine((value) => !/[<>\p{Cc}]/u.test(value));
const boundedInteger = (minimum: number, maximum: number, fallback: number) =>
  z.preprocess(
    (value) => (value === undefined ? fallback : value),
    z.coerce.number().int().min(minimum).max(maximum),
  );
const directoryQuerySchema = z
  .object({
    search: z.string().max(100).default(''),
    status: z.enum(['all', 'active', 'archived']).default('all'),
    sort: z.enum(['updated_at', 'display_name', 'slug', 'status']).default('updated_at'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    limit: boundedInteger(1, 100, 25),
    offset: boundedInteger(0, 999_900, 0),
  })
  .strict();
const catalogQuerySchema = z
  .object({
    search: z.string().max(100).default(''),
    limit: boundedInteger(1, 100, 25),
    offset: boundedInteger(0, 999_900, 0),
  })
  .strict();
const createDraftSchema = z.object({ expectedRecordVersion: z.number().int().positive() }).strict();
const saveDraftSchema = z
  .object({
    expectedEditVersion: z.number().int().positive(),
    expectedChecksum: checksumSchema.nullable(),
    manifest: z.unknown(),
    confirmed: z.literal(true),
  })
  .strict();
const validateDraftSchema = z
  .object({
    expectedEditVersion: z.number().int().positive(),
    expectedChecksum: checksumSchema.nullable(),
  })
  .strict();
const publishSchema = z
  .object({
    expectedEditVersion: z.number().int().positive(),
    expectedActiveVersionId: uuidSchema.nullable(),
    expectedChecksum: checksumSchema,
    reason: safeReasonSchema,
    requestId: uuidSchema.optional(),
    confirmed: z.literal(true),
  })
  .strict();
const deriveSchema = z
  .object({
    expectedRecordVersion: z.number().int().positive(),
    reason: safeReasonSchema,
    confirmed: z.literal(true),
  })
  .strict();
const failureSchema = z.object({
  status: z.enum([
    'not_found',
    'rate_limited',
    'version_conflict',
    'state_conflict',
    'validation_failed',
  ]),
});

function page(limit: number, offset: number): number {
  if (offset % limit !== 0) throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
  return offset / limit + 1;
}

function mapFailure(
  value: unknown,
  conflictCode: 'WORLD_DRAFT_CONFLICT' | 'WORLD_PUBLISH_CONFLICT',
  allowValidationFailure: boolean,
): void {
  const parsed = failureSchema.safeParse(value);
  if (!parsed.success) return;
  if (parsed.data.status === 'not_found') throw new PublicApiError(404, 'WORLD_DRAFT_NOT_FOUND');
  if (parsed.data.status === 'rate_limited') throw new PublicApiError(429, 'RATE_LIMITED');
  if (parsed.data.status === 'validation_failed' && !allowValidationFailure) {
    throw new PublicApiError(422, 'WORLD_VALIDATION_FAILED');
  }
  if (parsed.data.status === 'validation_failed') return;
  throw new PublicApiError(409, conflictCode);
}

interface SafeParser<T> {
  safeParse(
    value: unknown,
  ): { readonly success: true; readonly data: T } | { readonly success: false };
}

function parseResponse<T>(
  schema: SafeParser<T>,
  value: unknown,
  conflictCode: 'WORLD_DRAFT_CONFLICT' | 'WORLD_PUBLISH_CONFLICT' = 'WORLD_DRAFT_CONFLICT',
  allowValidationFailure = false,
): T {
  mapFailure(value, conflictCode, allowValidationFailure);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(503, 'WORLD_MANAGEMENT_UNAVAILABLE');
  return parsed.data;
}

function validId(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
  return parsed.data;
}

function normalizedSearch(value: string): string {
  return value.normalize('NFKC').trim();
}

export function createAdminWorldService(options: {
  readonly gateway: AdminWorldGateway;
  readonly logger: ServiceLogger;
  readonly manifestMaximumBytes: number;
  readonly readRateLimit: number;
  readonly draftWriteRateLimit: number;
  readonly validationRateLimit: number;
  readonly publishRateLimit: number;
  readonly deriveRateLimit: number;
}): AdminWorldService {
  const { gateway, logger } = options;
  const guarded = async <T>(requestId: string, operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PublicApiError) throw error;
      logger.child({ requestId }).error('admin.world.failed', { error });
      throw new PublicApiError(503, 'WORLD_MANAGEMENT_UNAVAILABLE');
    }
  };

  return {
    async listWorlds(identity, query, requestId) {
      const parsed = directoryQuerySchema.safeParse(query);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
      return guarded(requestId, async () =>
        parseResponse(
          worldDirectorySchema,
          await gateway.listWorlds(identity, {
            p_page: page(parsed.data.limit, parsed.data.offset),
            p_page_size: parsed.data.limit,
            p_search: normalizedSearch(parsed.data.search),
            p_status: parsed.data.status,
            p_sort: parsed.data.sort,
            p_direction: parsed.data.direction,
            p_request_id: requestId,
            p_rate_limit: options.readRateLimit,
          }),
        ),
      );
    },
    async getPublishedTopology(identity, requestId) {
      return guarded(requestId, async () =>
        parseResponse(publishedWorldTopologySchema, await gateway.getPublishedTopology(identity)),
      );
    },
    async getWorld(identity, mapId, requestId) {
      return guarded(requestId, async () =>
        parseResponse(
          worldDetailSchema,
          await gateway.getWorld(identity, {
            p_world_map_id: validId(mapId),
            p_request_id: requestId,
            p_rate_limit: options.readRateLimit,
          }),
        ),
      );
    },
    async getDraft(identity, mapId, versionId, requestId) {
      return guarded(requestId, async () =>
        parseResponse(
          worldDraftLoadSchema,
          await gateway.getDraft(identity, {
            p_world_map_id: validId(mapId),
            p_version_id: validId(versionId),
            p_request_id: requestId,
            p_rate_limit: options.readRateLimit,
          }),
        ),
      );
    },
    async createDraft(identity, mapId, body, requestId) {
      const parsed = createDraftSchema.safeParse(body);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
      return guarded(requestId, async () =>
        parseResponse(
          worldDraftSchema,
          await gateway.createDraft(identity, {
            p_world_map_id: validId(mapId),
            p_expected_record_version: parsed.data.expectedRecordVersion,
            p_request_id: requestId,
            p_rate_limit: options.draftWriteRateLimit,
          }),
        ),
      );
    },
    async saveDraft(identity, mapId, versionId, body, requestId) {
      const parsed = saveDraftSchema.safeParse(body);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
      const serialized = JSON.stringify(parsed.data.manifest);
      if (Buffer.byteLength(serialized) > options.manifestMaximumBytes) {
        throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
      }
      let manifest;
      try {
        manifest = mapManifestSchema.parse(parsed.data.manifest);
      } catch {
        throw new PublicApiError(422, 'WORLD_VALIDATION_FAILED');
      }
      return guarded(requestId, async () =>
        parseResponse(
          worldDraftSchema,
          await gateway.saveDraft(identity, {
            p_world_map_id: validId(mapId),
            p_version_id: validId(versionId),
            p_expected_edit_version: parsed.data.expectedEditVersion,
            p_expected_checksum: parsed.data.expectedChecksum,
            p_manifest: manifest,
            p_request_id: requestId,
            p_rate_limit: options.draftWriteRateLimit,
          }),
        ),
      );
    },
    async validateDraft(identity, mapId, versionId, body, requestId) {
      const parsed = validateDraftSchema.safeParse(body);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
      return guarded(requestId, async () =>
        parseResponse(
          worldValidationResponseSchema,
          await gateway.validateDraft(identity, {
            p_world_map_id: validId(mapId),
            p_version_id: validId(versionId),
            p_expected_edit_version: parsed.data.expectedEditVersion,
            p_expected_checksum: parsed.data.expectedChecksum,
            p_request_id: requestId,
            p_rate_limit: options.validationRateLimit,
          }),
          'WORLD_DRAFT_CONFLICT',
          true,
        ),
      );
    },
    async publishVersion(identity, mapId, versionId, body, requestId) {
      const parsed = publishSchema.safeParse(body);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
      return guarded(requestId, async () =>
        parseResponse(
          worldPublishResponseSchema,
          await gateway.publishVersion(identity, {
            p_world_map_id: validId(mapId),
            p_version_id: validId(versionId),
            p_expected_edit_version: parsed.data.expectedEditVersion,
            p_expected_active_version_id: parsed.data.expectedActiveVersionId,
            p_expected_checksum: parsed.data.expectedChecksum,
            p_reason: parsed.data.reason,
            p_request_id: requestId,
            p_rate_limit: options.publishRateLimit,
          }),
          'WORLD_PUBLISH_CONFLICT',
        ),
      );
    },
    async deriveVersion(identity, mapId, versionId, body, requestId) {
      const parsed = deriveSchema.safeParse(body);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
      return guarded(requestId, async () =>
        parseResponse(
          worldDraftSchema,
          await gateway.deriveVersion(identity, {
            p_world_map_id: validId(mapId),
            p_source_version_id: validId(versionId),
            p_expected_record_version: parsed.data.expectedRecordVersion,
            p_reason: parsed.data.reason,
            p_request_id: requestId,
            p_rate_limit: options.deriveRateLimit,
          }),
        ),
      );
    },
    async previewVersion(identity, mapId, versionId, requestId) {
      return guarded(requestId, async () =>
        parseResponse(
          worldPreviewSchema,
          await gateway.previewVersion(identity, {
            p_world_map_id: validId(mapId),
            p_version_id: validId(versionId),
            p_request_id: requestId,
            p_rate_limit: options.readRateLimit,
          }),
        ),
      );
    },
    async listAudit(identity, mapId, query, requestId) {
      const parsed = catalogQuerySchema.safeParse(query);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
      return guarded(requestId, async () =>
        parseResponse(
          worldAuditDirectorySchema,
          await gateway.listAudit(identity, {
            p_world_map_id: mapId === null ? null : validId(mapId),
            p_page: page(parsed.data.limit, parsed.data.offset),
            p_page_size: parsed.data.limit,
            p_search: normalizedSearch(parsed.data.search),
            p_request_id: requestId,
            p_rate_limit: options.readRateLimit,
          }),
        ),
      );
    },
    async listAssets(identity, query, requestId) {
      const parsed = catalogQuerySchema.safeParse(query);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_ADMIN_REQUEST');
      return guarded(requestId, async () =>
        parseResponse(
          worldAssetDirectorySchema,
          await gateway.listAssets(identity, {
            p_page: page(parsed.data.limit, parsed.data.offset),
            p_page_size: parsed.data.limit,
            p_search: normalizedSearch(parsed.data.search),
            p_request_id: requestId,
            p_rate_limit: options.readRateLimit,
          }),
        ),
      );
    },
  };
}
