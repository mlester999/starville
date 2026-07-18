import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  createPlayerExperienceGameTestFixture,
  playerExperienceWorkspaceSchema,
  type PlayerExperienceWorkspace,
} from '@starville/player-experience';

import type { AdminDatabaseIdentity } from '../contracts.js';

export const playerExperiencePersistenceStatusSchema = z.enum([
  'onboarding_not_available',
  'onboarding_already_completed',
  'expected_revision_conflict',
  'onboarding_recovery_not_allowed',
  'rate_limited',
  'bootstrap_required',
  'rename_required',
  'suspended',
  'request_already_processed',
]);
export type PlayerExperiencePersistenceStatus = z.infer<
  typeof playerExperiencePersistenceStatusSchema
>;

export const adminPlayerExperienceQuerySchema = z
  .object({
    search: z.string().trim().max(128).default(''),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export const adminPlayerExperienceCorrectionSchema = z
  .object({
    action: z.enum(['resume_blocked', 'retry_recovery', 'reset_guide_preferences']),
    recoveryId: z.uuid().nullable(),
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(20).max(1_000),
  })
  .strict();

export const adminDailyPolicySuccessorSchema = z
  .object({
    basePolicyVersionId: z.uuid(),
    expectedRevision: z.number().int().positive(),
    effectiveAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();

export class PlayerExperiencePersistenceError extends Error {
  public constructor(readonly operation: string) {
    super('Player experience persistence is unavailable.');
    this.name = 'PlayerExperiencePersistenceError';
  }
}

function identityParameters(identity: AdminDatabaseIdentity) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  };
}

function failure(value: unknown): PlayerExperiencePersistenceStatus | undefined {
  if (typeof value !== 'object' || value === null || !('status' in value)) return undefined;
  const parsed = playerExperiencePersistenceStatusSchema.safeParse(value.status);
  return parsed.success ? parsed.data : undefined;
}

function experience(value: unknown): PlayerExperienceWorkspace | PlayerExperiencePersistenceStatus {
  const failed = failure(value);
  if (failed !== undefined) return failed;
  return z.object({ experience: playerExperienceWorkspaceSchema }).passthrough().parse(value)
    .experience;
}

export interface PlayerExperienceGateway {
  workspace(
    wallet: string,
    feedbackAfter: number,
    feedbackLimit: number,
    requestId: string,
  ): Promise<PlayerExperienceWorkspace | PlayerExperiencePersistenceStatus>;
  start(
    wallet: string,
    expectedRevision: number,
    idempotencyKey: string,
    requestId: string,
  ): Promise<PlayerExperienceWorkspace | PlayerExperiencePersistenceStatus>;
  activity(
    wallet: string,
    action: 'pause' | 'resume',
    expectedRevision: number,
    requestId: string,
  ): Promise<PlayerExperienceWorkspace | PlayerExperiencePersistenceStatus>;
  preferences(
    wallet: string,
    minimized: boolean,
    reducedGuidance: boolean,
    expectedRevision: number,
    requestId: string,
  ): Promise<PlayerExperienceWorkspace | PlayerExperiencePersistenceStatus>;
  acknowledge(
    wallet: string,
    stepKey: 'inspect_inventory' | 'review_progression' | 'review_home_visits',
    expectedRevision: number,
    idempotencyKey: string,
    requestId: string,
  ): Promise<PlayerExperienceWorkspace | PlayerExperiencePersistenceStatus>;
  skipOptional(
    wallet: string,
    expectedRevision: number,
    reason: string,
    requestId: string,
  ): Promise<PlayerExperienceWorkspace | PlayerExperiencePersistenceStatus>;
  recover(
    wallet: string,
    reasonCode: string,
    expectedRevision: number,
    idempotencyKey: string,
    requestId: string,
  ): Promise<PlayerExperienceWorkspace | PlayerExperiencePersistenceStatus>;
  refreshDaily(
    wallet: string,
    expectedAssignmentRevision: number,
    idempotencyKey: string,
    requestId: string,
  ): Promise<PlayerExperienceWorkspace | PlayerExperiencePersistenceStatus>;
  gameTest(): PlayerExperienceWorkspace;
  adminWorkspace(
    identity: AdminDatabaseIdentity,
    query: z.infer<typeof adminPlayerExperienceQuerySchema>,
    requestId: string,
  ): Promise<unknown>;
  adminCorrect(
    identity: AdminDatabaseIdentity,
    playerId: string,
    input: z.infer<typeof adminPlayerExperienceCorrectionSchema>,
    requestId: string,
  ): Promise<unknown>;
  adminCreateDailyPolicySuccessor(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof adminDailyPolicySuccessorSchema>,
    requestId: string,
  ): Promise<unknown>;
}

export function createSupabasePlayerExperienceGateway(
  client: SupabaseClient,
): PlayerExperienceGateway {
  async function rpc(operation: string, parameters: Record<string, unknown>) {
    const { data, error } = await client.rpc(operation, parameters);
    if (error !== null) throw new PlayerExperiencePersistenceError(operation);
    return data;
  }
  return {
    async workspace(wallet, feedbackAfter, feedbackLimit, requestId) {
      return experience(
        await rpc('get_player_experience_workspace', {
          p_wallet_address: wallet,
          p_feedback_after: feedbackAfter,
          p_feedback_limit: feedbackLimit,
          p_request_id: requestId,
        }),
      );
    },
    async start(wallet, expectedRevision, idempotencyKey, requestId) {
      return experience(
        await rpc('start_player_onboarding', {
          p_wallet_address: wallet,
          p_expected_revision: expectedRevision,
          p_idempotency_key: idempotencyKey,
          p_request_id: requestId,
        }),
      );
    },
    async activity(wallet, action, expectedRevision, requestId) {
      return experience(
        await rpc('set_player_onboarding_activity', {
          p_wallet_address: wallet,
          p_action: action,
          p_expected_revision: expectedRevision,
          p_request_id: requestId,
        }),
      );
    },
    async preferences(wallet, minimized, reducedGuidance, expectedRevision, requestId) {
      return experience(
        await rpc('update_player_guide_preferences', {
          p_wallet_address: wallet,
          p_minimized: minimized,
          p_reduced_guidance: reducedGuidance,
          p_expected_revision: expectedRevision,
          p_request_id: requestId,
        }),
      );
    },
    async acknowledge(wallet, stepKey, expectedRevision, idempotencyKey, requestId) {
      return experience(
        await rpc('acknowledge_player_experience_step', {
          p_wallet_address: wallet,
          p_step_key: stepKey,
          p_expected_revision: expectedRevision,
          p_idempotency_key: idempotencyKey,
          p_request_id: requestId,
        }),
      );
    },
    async skipOptional(wallet, expectedRevision, reason, requestId) {
      return experience(
        await rpc('skip_player_optional_onboarding', {
          p_wallet_address: wallet,
          p_expected_revision: expectedRevision,
          p_reason: reason,
          p_request_id: requestId,
        }),
      );
    },
    async recover(wallet, reasonCode, expectedRevision, idempotencyKey, requestId) {
      return experience(
        await rpc('request_player_experience_recovery', {
          p_wallet_address: wallet,
          p_reason_code: reasonCode,
          p_expected_revision: expectedRevision,
          p_idempotency_key: idempotencyKey,
          p_request_id: requestId,
        }),
      );
    },
    async refreshDaily(wallet, expectedAssignmentRevision, idempotencyKey, requestId) {
      return experience(
        await rpc('refresh_player_daily_objectives', {
          p_wallet_address: wallet,
          p_expected_assignment_revision: expectedAssignmentRevision,
          p_idempotency_key: idempotencyKey,
          p_request_id: requestId,
        }),
      );
    },
    gameTest: () => createPlayerExperienceGameTestFixture(),
    adminWorkspace: (identity, query, requestId) =>
      rpc('get_admin_player_experience_workspace', {
        ...identityParameters(identity),
        p_search: query.search,
        p_limit: query.limit,
        p_offset: query.offset,
        p_request_id: requestId,
      }),
    adminCorrect: (identity, playerId, input, requestId) =>
      rpc('correct_admin_player_onboarding', {
        ...identityParameters(identity),
        p_player_profile_id: playerId,
        p_action: input.action,
        p_recovery_id: input.recoveryId,
        p_expected_revision: input.expectedRevision,
        p_reason: input.reason,
        p_request_id: requestId,
      }),
    adminCreateDailyPolicySuccessor: (identity, input, requestId) =>
      rpc('create_admin_player_experience_daily_policy_successor', {
        ...identityParameters(identity),
        p_base_policy_version_id: input.basePolicyVersionId,
        p_expected_configuration_revision: input.expectedRevision,
        p_effective_at: input.effectiveAt,
        p_reason: input.reason,
        p_request_id: requestId,
      }),
  };
}
