import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  operationsSummarySchema,
  playerActionResultSchema,
  playerActivitySchema,
  playerDetailSchema,
  playerDirectorySchema,
} from '@starville/player-operations';

import type {
  AdminOperationsGateway,
  OperationsDatabaseSummary,
  PlayerActionKey,
  PlayerActionPersistenceResult,
} from './contracts.js';

const loadedDetailSchema = playerDetailSchema.extend({ status: z.literal('loaded') });
const loadedActivitySchema = playerActivitySchema.extend({ status: z.literal('loaded') });
const updatedActionSchema = playerActionResultSchema.extend({ status: z.literal('updated') });
const databaseSummarySchema = operationsSummarySchema.omit({ services: true });
const statusSchema = z
  .object({
    status: z.enum(['not_found', 'rate_limited', 'version_conflict']),
  })
  .strict();
const stateConflictSchema = z
  .object({
    status: z.literal('state_conflict'),
    code: z.string().min(1).max(80),
  })
  .strict();

const RPC_BY_ACTION = {
  suspend: 'admin_suspend_player',
  restore: 'admin_restore_player',
  'reset-position': 'admin_reset_player_position',
  'require-rename': 'admin_require_player_rename',
  rename: 'admin_rename_player',
  'revoke-sessions': 'admin_revoke_player_sessions',
} as const satisfies Readonly<Record<PlayerActionKey, string>>;

export class AdminOperationsPersistenceError extends Error {
  public constructor() {
    super('Trusted player operations persistence failed.');
    this.name = 'AdminOperationsPersistenceError';
  }
}

async function executeRpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) throw new AdminOperationsPersistenceError();
  return data;
}

function identityParameters(identity: {
  readonly userId: string;
  readonly authSessionId: string;
  readonly assuranceLevel: string;
}) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  } as const;
}

function parseActionResult(value: unknown): PlayerActionPersistenceResult {
  const updated = updatedActionSchema.safeParse(value);
  if (updated.success) {
    const { status, ...result } = updated.data;
    void status;
    return result;
  }

  const stateConflict = stateConflictSchema.safeParse(value);
  if (stateConflict.success) {
    return { stateConflictCode: stateConflict.data.code };
  }

  return statusSchema.parse(value).status;
}

export function createSupabaseAdminOperationsGateway(
  client: SupabaseClient,
  options: { readonly environmentKey: string; readonly network: string },
): AdminOperationsGateway {
  return {
    async listPlayers(identity, query) {
      const value = await executeRpc(client, 'list_admin_players', {
        ...identityParameters(identity),
        p_environment_key: options.environmentKey,
        p_network: options.network,
        p_page: query.page,
        p_page_size: query.pageSize,
        p_search: query.search,
        p_status: query.status,
        p_rename_filter: query.rename,
        p_map_id: query.mapId,
        p_recent_days: query.recentDays ?? null,
        p_sort: query.sort,
        p_direction: query.direction,
      });
      return playerDirectorySchema.parse(value);
    },

    async getPlayer(identity, playerId) {
      const value = await executeRpc(client, 'get_admin_player_detail', {
        ...identityParameters(identity),
        p_environment_key: options.environmentKey,
        p_network: options.network,
        p_player_profile_id: playerId,
      });
      const status = statusSchema.safeParse(value);
      if (status.success && status.data.status === 'not_found') return 'not_found';
      const parsed = loadedDetailSchema.parse(value);
      const { status: _status, ...detail } = parsed;
      void _status;
      return detail;
    },

    async getPlayerActivity(identity, playerId, query) {
      const value = await executeRpc(client, 'get_admin_player_activity_page', {
        ...identityParameters(identity),
        p_environment_key: options.environmentKey,
        p_network: options.network,
        p_player_profile_id: playerId,
        p_audit_limit: query.limit,
        p_access_page: query.accessPage,
        p_access_page_size: query.accessPageSize,
      });
      const status = statusSchema.safeParse(value);
      if (status.success && status.data.status === 'not_found') return 'not_found';
      const parsed = loadedActivitySchema.parse(value);
      const { status: _status, ...activity } = parsed;
      void _status;
      return activity;
    },

    async getSummary(identity): Promise<OperationsDatabaseSummary> {
      return databaseSummarySchema.parse(
        await executeRpc(client, 'get_admin_operations_summary', {
          ...identityParameters(identity),
          p_environment_key: options.environmentKey,
          p_network: options.network,
        }),
      );
    },

    async performPlayerAction(identity, playerId, action, input, requestId, rateLimit) {
      return parseActionResult(
        await executeRpc(client, RPC_BY_ACTION[action], {
          ...identityParameters(identity),
          p_player_profile_id: playerId,
          p_expected_version: input.expectedVersion,
          p_reason: input.reason,
          ...(action === 'rename' ? { p_display_name: input.displayName } : {}),
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
      );
    },
  };
}
