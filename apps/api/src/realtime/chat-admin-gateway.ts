import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  adminChatReportActionSchema,
  adminChatReportDetailSchema,
  adminChatReportListSchema,
  chatReportCategorySchema,
  chatReportStatusSchema,
  type AdminChatReportAction,
  type AdminChatReportDetail,
  type AdminChatReportList,
} from '@starville/realtime';

import type { AdminDatabaseIdentity } from '../contracts.js';

export const adminChatReportQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.preprocess(
      (value) => value ?? 10,
      z.coerce.number().pipe(z.union([z.literal(10), z.literal(50), z.literal(100)])),
    ),
    status: z.union([z.literal('all'), chatReportStatusSchema]).default('all'),
    category: z.union([z.literal('all'), chatReportCategorySchema]).default('all'),
    worldId: z.string().trim().min(1).max(64).default('all'),
    channelId: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.uuid().nullable(),
    ),
    search: z.string().trim().max(128).default(''),
    dateFrom: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.iso.date().nullable(),
    ),
    dateTo: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.iso.date().nullable(),
    ),
  })
  .strict()
  .refine(
    (value) => value.dateFrom === null || value.dateTo === null || value.dateFrom <= value.dateTo,
    { message: 'The report date range is invalid.' },
  );
export type AdminChatReportQuery = z.infer<typeof adminChatReportQuerySchema>;

const mutationResultSchema = z
  .object({
    status: z.enum(['applied', 'replayed']),
    reportId: z.uuid(),
    revision: z.number().int().positive().optional(),
    muteExpiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export interface AdminChatGateway {
  list(identity: AdminDatabaseIdentity, query: AdminChatReportQuery): Promise<AdminChatReportList>;
  detail(
    identity: AdminDatabaseIdentity,
    reportId: string,
  ): Promise<AdminChatReportDetail | undefined>;
  act(
    identity: AdminDatabaseIdentity,
    reportId: string,
    action: AdminChatReportAction,
  ): Promise<z.infer<typeof mutationResultSchema>>;
}

export class AdminChatPersistenceError extends Error {
  public constructor(readonly operation: string) {
    super('Chat moderation persistence is unavailable.');
    this.name = 'AdminChatPersistenceError';
  }
}

async function rpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) throw new AdminChatPersistenceError(operation);
  return data;
}

function identityParameters(identity: AdminDatabaseIdentity) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  };
}

export function createSupabaseAdminChatGateway(client: SupabaseClient): AdminChatGateway {
  return {
    async list(identity, query) {
      return adminChatReportListSchema.parse(
        await rpc(client, 'list_admin_multiplayer_chat_reports', {
          ...identityParameters(identity),
          p_page: query.page,
          p_page_size: query.pageSize,
          p_status: query.status,
          p_category: query.category,
          p_world_id: query.worldId,
          p_channel_id: query.channelId,
          p_search: query.search,
          p_date_from: query.dateFrom,
          p_date_to: query.dateTo,
        }),
      );
    },
    async detail(identity, reportId) {
      const value = await rpc(client, 'get_admin_multiplayer_chat_report', {
        ...identityParameters(identity),
        p_report_id: reportId,
      });
      if (
        z
          .object({ status: z.literal('not_found') })
          .strict()
          .safeParse(value).success
      ) {
        return undefined;
      }
      return adminChatReportDetailSchema.parse(value);
    },
    async act(identity, reportId, action) {
      const parsed = adminChatReportActionSchema.parse(action);
      const value = await rpc(client, 'admin_act_on_multiplayer_chat_report', {
        ...identityParameters(identity),
        p_report_id: reportId,
        p_action: parsed.action,
        p_reason: parsed.reason,
        p_expected_revision: parsed.expectedRevision,
        p_request_id: parsed.requestId,
        p_mute_duration_minutes: parsed.muteDurationMinutes ?? null,
      });
      const conflict = z
        .object({ status: z.enum(['not_found', 'revision_conflict', 'already_resolved']) })
        .strict()
        .safeParse(value);
      if (conflict.success) {
        const error = new Error(conflict.data.status);
        Object.assign(error, {
          statusCode: conflict.data.status === 'not_found' ? 404 : 409,
          code:
            conflict.data.status === 'not_found'
              ? 'CHAT_REPORT_NOT_FOUND'
              : 'CHAT_REPORT_VERSION_CONFLICT',
        });
        throw error;
      }
      return mutationResultSchema.parse(value);
    },
  };
}
