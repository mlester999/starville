import {
  MAINTENANCE_FALLBACK_MESSAGE,
  MAINTENANCE_FALLBACK_TITLE,
  adminLiveOperationsSchema,
  announcementMutationSchema,
  maintenanceMutationSchema,
  publicLiveOperationsSchema,
} from '@starville/live-operations';
import { z } from 'zod';

import type { ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type {
  LiveOperationsGateway,
  LiveOperationsQuery,
  LiveOperationsService,
} from './contracts.js';

const querySchema = z
  .object({
    search: z.string().trim().max(100).default(''),
    status: z
      .enum(['all', 'draft', 'scheduled', 'active', 'expired', 'deactivated', 'archived'])
      .default('all'),
    severity: z.enum(['all', 'information', 'success', 'warning', 'critical']).default('all'),
    presentation: z.enum(['all', 'ticker', 'banner']).default('all'),
    sort: z.enum(['updated_at', 'priority', 'starts_at', 'internal_title']).default('updated_at'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    auditPage: z.coerce.number().int().positive().default(1),
    auditPageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
const mutationResultSchema = z.union([
  z.object({ status: z.literal('version_conflict') }).strict(),
  z
    .object({
      status: z.enum(['updated', 'saved']),
      id: z.uuid().optional(),
      revision: z.number().int().positive(),
    })
    .strict(),
]);
const statusInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(12).max(500),
  })
  .strict();
const idSchema = z.uuid();
const actionSchema = z.enum(['publish', 'deactivate', 'archive']);

function unavailable(): never {
  throw new PublicApiError(503, 'LIVE_OPERATIONS_UNAVAILABLE');
}
function checkedMutation(value: unknown) {
  const result = mutationResultSchema.parse(value);
  if (result.status === 'version_conflict')
    throw new PublicApiError(409, 'LIVE_OPERATIONS_VERSION_CONFLICT');
  return result;
}

export function createLiveOperationsService(options: {
  readonly gateway: LiveOperationsGateway;
  readonly logger: ServiceLogger;
  readonly clock?: () => Date;
}): LiveOperationsService {
  const clock = options.clock ?? (() => new Date());
  return {
    async getPublic(requestId) {
      try {
        return publicLiveOperationsSchema.parse(await options.gateway.getPublic());
      } catch (error) {
        options.logger.warn('live_operations.public.fallback', { requestId, error });
        const now = clock().toISOString();
        return publicLiveOperationsSchema.parse({
          maintenance: {
            state: 'configuration_error',
            active: true,
            revision: 0,
            title: MAINTENANCE_FALLBACK_TITLE,
            message: MAINTENANCE_FALLBACK_MESSAGE,
            updateDetails: [],
            expectedEndAt: null,
            expectedReturnMessage: null,
            showReturnToLanding: true,
            ctaLabel: null,
            ctaUrl: null,
            updatedAt: now,
          },
          announcements: [],
          generatedAt: now,
        });
      }
    },
    async getAdmin(identity, input) {
      const query = querySchema.safeParse(input);
      if (!query.success) throw new PublicApiError(422, 'INVALID_LIVE_OPERATIONS_REQUEST');
      try {
        return adminLiveOperationsSchema.parse(
          await options.gateway.getAdmin(identity, query.data as LiveOperationsQuery),
        );
      } catch {
        unavailable();
      }
    },
    async updateMaintenance(identity, body, requestId) {
      const input = maintenanceMutationSchema.safeParse(body);
      if (!input.success) throw new PublicApiError(422, 'INVALID_LIVE_OPERATIONS_REQUEST');
      try {
        return checkedMutation(
          await options.gateway.updateMaintenance(identity, input.data, requestId),
        );
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        unavailable();
      }
    },
    async saveAnnouncement(identity, body, requestId) {
      const input = announcementMutationSchema.safeParse(body);
      if (!input.success) throw new PublicApiError(422, 'INVALID_ANNOUNCEMENT_REQUEST');
      try {
        return checkedMutation(
          await options.gateway.saveAnnouncement(identity, input.data, requestId),
        );
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        unavailable();
      }
    },
    async setAnnouncementStatus(identity, rawId, rawAction, body, requestId) {
      const id = idSchema.safeParse(rawId);
      const action = actionSchema.safeParse(rawAction);
      const input = statusInputSchema.safeParse(body);
      if (!id.success || !action.success || !input.success)
        throw new PublicApiError(422, 'INVALID_ANNOUNCEMENT_REQUEST');
      try {
        return checkedMutation(
          await options.gateway.setAnnouncementStatus(
            identity,
            id.data,
            input.data.expectedRevision,
            action.data,
            input.data.reason,
            requestId,
          ),
        );
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        unavailable();
      }
    },
  };
}
