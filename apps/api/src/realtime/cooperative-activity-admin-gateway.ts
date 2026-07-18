import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  adminCooperativeActivityInstanceDetailSchema,
  adminCooperativeActivityListSchema,
  cooperativeActivityEditorInputSchema,
  cooperativeActivityLifecycleActionSchema,
  cooperativeActivityPreviewSchema,
  cooperativeActivitySettingsSchema,
  cooperativeActivityVersionSchema,
  type AdminCooperativeActivityInstanceDetail,
  type AdminCooperativeActivityList,
  type CooperativeActivityEditorInput,
  type CooperativeActivityPreview,
  type CooperativeActivitySettings,
  type CooperativeActivityVersion,
  type UpdateCooperativeActivitySettings,
} from '@starville/cooperative-activities';

import type { AdminDatabaseIdentity } from '../contracts.js';

export const adminCooperativeActivityQuerySchema = z
  .object({
    view: z.enum(['catalog', 'instances', 'rewards', 'audit']).default('instances'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.preprocess(
      (value) => value ?? 10,
      z.coerce.number().pipe(z.union([z.literal(10), z.literal(50), z.literal(100)])),
    ),
    status: z.string().trim().min(1).max(40).default('all'),
    search: z.string().trim().max(80).default(''),
  })
  .strict();
export type AdminCooperativeActivityQuery = z.infer<typeof adminCooperativeActivityQuerySchema>;

export const cooperativeActivityDraftCreateSchema = z
  .object({ activity: cooperativeActivityEditorInputSchema })
  .strict();
export const cooperativeActivityDraftUpdateSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    activity: cooperativeActivityEditorInputSchema,
  })
  .strict();
export const cooperativeActivityLifecycleRequestSchema = z
  .object({
    action: cooperativeActivityLifecycleActionSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export const cooperativeActivityPreviewRequestSchema = z
  .object({ versionId: z.uuid(), simulationStep: z.number().int().min(0).max(16) })
  .strict();

export interface AdminCooperativeActivityGateway {
  list(
    identity: AdminDatabaseIdentity,
    query: AdminCooperativeActivityQuery,
  ): Promise<AdminCooperativeActivityList>;
  instance(
    identity: AdminDatabaseIdentity,
    instanceId: string,
  ): Promise<AdminCooperativeActivityInstanceDetail | undefined>;
  settings(identity: AdminDatabaseIdentity): Promise<CooperativeActivitySettings>;
  updateSettings(
    identity: AdminDatabaseIdentity,
    input: UpdateCooperativeActivitySettings,
    requestId: string,
  ): Promise<CooperativeActivitySettings>;
  preview(
    identity: AdminDatabaseIdentity,
    versionId: string,
    simulationStep: number,
  ): Promise<CooperativeActivityPreview | undefined>;
  createDraft(
    identity: AdminDatabaseIdentity,
    input: CooperativeActivityEditorInput,
    requestId: string,
  ): Promise<CooperativeActivityVersion>;
  updateDraft(
    identity: AdminDatabaseIdentity,
    versionId: string,
    expectedRevision: number,
    input: CooperativeActivityEditorInput,
    requestId: string,
  ): Promise<CooperativeActivityVersion>;
  transition(
    identity: AdminDatabaseIdentity,
    versionId: string,
    expectedRevision: number,
    action: z.infer<typeof cooperativeActivityLifecycleActionSchema>,
    requestId: string,
  ): Promise<CooperativeActivityVersion>;
}

export class AdminCooperativeActivityPersistenceError extends Error {
  public constructor(readonly operation: string) {
    super('Cooperative activity persistence is unavailable.');
    this.name = 'AdminCooperativeActivityPersistenceError';
  }
}

function identityParameters(identity: AdminDatabaseIdentity) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  };
}

async function rpc(client: SupabaseClient, operation: string, parameters: Record<string, unknown>) {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) {
    if (error.code === 'P0002') return undefined;
    throw new AdminCooperativeActivityPersistenceError(operation);
  }
  return data;
}

export function createSupabaseAdminCooperativeActivityGateway(
  client: SupabaseClient,
): AdminCooperativeActivityGateway {
  return {
    async list(identity, query) {
      return adminCooperativeActivityListSchema.parse(
        await rpc(client, 'get_admin_cooperative_activities', {
          ...identityParameters(identity),
          p_view: query.view,
          p_search: query.search,
          p_status: query.status,
          p_page: query.page,
          p_page_size: query.pageSize,
        }),
      );
    },
    async instance(identity, instanceId) {
      const data = await rpc(client, 'get_admin_cooperative_activity_instance', {
        ...identityParameters(identity),
        p_instance_id: instanceId,
      });
      if (
        data === undefined ||
        (typeof data === 'object' &&
          data !== null &&
          'status' in data &&
          data.status === 'not_found')
      )
        return undefined;
      return adminCooperativeActivityInstanceDetailSchema.parse(data);
    },
    async settings(identity) {
      return cooperativeActivitySettingsSchema.parse(
        await rpc(client, 'get_admin_cooperative_activity_settings', identityParameters(identity)),
      );
    },
    async updateSettings(identity, input, requestId) {
      return cooperativeActivitySettingsSchema.parse(
        await rpc(client, 'update_admin_cooperative_activity_settings', {
          ...identityParameters(identity),
          p_expected_version: input.expectedVersion,
          p_module_enabled: input.moduleEnabled,
          p_allow_existing_instances_to_finish: input.allowExistingInstancesToFinish,
          p_maximum_active_instances: input.maximumActiveInstances,
          p_maximum_failed_attempts_per_hour: input.maximumFailedAttemptsPerHour,
          p_maximum_party_creations_per_hour: input.maximumPartyCreationsPerHour,
          p_request_id: requestId,
        }),
      );
    },
    async preview(identity, versionId, simulationStep) {
      const data = await rpc(client, 'preview_admin_cooperative_activity', {
        ...identityParameters(identity),
        p_version_id: versionId,
        p_simulation_step: simulationStep,
      });
      if (
        typeof data === 'object' &&
        data !== null &&
        'status' in data &&
        data.status === 'not_found'
      )
        return undefined;
      return cooperativeActivityPreviewSchema.parse(data);
    },
    async createDraft(identity, input, requestId) {
      return cooperativeActivityVersionSchema.parse(
        await rpc(client, 'create_admin_cooperative_activity_draft', {
          ...identityParameters(identity),
          p_activity: input,
          p_request_id: requestId,
        }),
      );
    },
    async updateDraft(identity, versionId, expectedRevision, input, requestId) {
      return cooperativeActivityVersionSchema.parse(
        await rpc(client, 'update_admin_cooperative_activity_draft', {
          ...identityParameters(identity),
          p_version_id: versionId,
          p_expected_revision: expectedRevision,
          p_activity: input,
          p_request_id: requestId,
        }),
      );
    },
    async transition(identity, versionId, expectedRevision, action, requestId) {
      return cooperativeActivityVersionSchema.parse(
        await rpc(client, 'transition_admin_cooperative_activity_version', {
          ...identityParameters(identity),
          p_version_id: versionId,
          p_expected_revision: expectedRevision,
          p_action: action,
          p_request_id: requestId,
        }),
      );
    },
  };
}
