import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { WorldAssetReconciliationGateway } from './world-asset-reconciliation-job.js';

const issueSchema = z
  .object({
    code: z.enum([
      'BUNDLED_ASSET_IDENTITY_MISSING',
      'BUNDLED_CATALOG_MEDIA_METADATA_INVALID',
      'BUNDLED_POINTER_MISMATCH',
      'BUNDLED_VERSION_INVALID',
      'ACTIVE_ASSET_SOURCE_MISSING',
      'ACTIVE_OVERRIDE_INVALID',
      'ACTIVE_OVERRIDE_VALIDATION_INVALID',
      'ACTIVE_OVERRIDE_THUMBNAIL_MISSING',
      'ACTIVE_OVERRIDE_DERIVATIVES_INCOMPLETE',
      'APPROVED_OVERRIDE_VALIDATION_INVALID',
      'DEPRECATED_OVERRIDE_ROLLBACK_INVALID',
      'MUTABLE_REFERENCE_STALE',
    ]),
    assetKey: z.string().min(3).max(96),
    assetId: z.uuid().nullable(),
    activeVersionId: z.uuid().nullable(),
    bundledDefaultVersionId: z.uuid().nullable(),
    severity: z.enum(['error', 'warning']),
    recommendation: z.string().min(1).max(160),
    automaticActionTaken: z.literal(false),
    publishedPinsChanged: z.literal(false),
  })
  .strict();

const resultSchema = z
  .object({
    status: z.enum(['reconciled', 'already_running']),
    requestId: z.string().min(1).max(128),
    scannedAssetCount: z.number().int().nonnegative().max(500),
    issueCount: z.number().int().nonnegative().max(500),
    issues: z.array(issueSchema).max(500),
    hasMore: z.boolean(),
    nextCursor: z.string().min(3).max(96).nullable(),
    automaticActionCount: z.literal(0),
    publishedPinMutationCount: z.literal(0),
    recommendationsOnly: z.literal(true),
  })
  .strict();

export function createWorldAssetReconciliationGateway(
  client: SupabaseClient,
): WorldAssetReconciliationGateway {
  return {
    async execute(limit, afterAssetKey) {
      const requestId = `worker-world-assets:${randomUUID()}`;
      const { data, error } = await client.rpc('reconcile_world_asset_bundled_lifecycle', {
        p_limit: limit,
        p_after_asset_key: afterAssetKey,
        p_request_id: requestId,
      });
      if (error !== null) throw new Error('World asset reconciliation persistence failed.');
      const result = resultSchema.parse(data);
      if (result.issueCount !== result.issues.length) {
        throw new Error('World asset reconciliation issue count is inconsistent.');
      }
      return result;
    },
  };
}
