import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  progressionEventPageSchema,
  progressionQuestSchema,
  progressionWorkspaceSchema,
  type ProgressionWorkspace,
} from '@starville/progression';
import {
  progressionSimulationInputSchema,
  runProgressionSimulation,
  type ProgressionSimulationInput,
} from '@starville/progression-simulation';
import type { AdminDatabaseIdentity } from '../contracts.js';

const playerStatusSchema = z.enum([
  'progression_not_found',
  'suspended',
  'rename_required',
  'bootstrap_required',
  'rate_limited',
  'progression_disabled',
  'progression_conflict',
  'quest_not_found',
  'quest_not_available',
  'quest_prerequisite_not_met',
  'quest_objective_incomplete',
  'title_not_owned',
  'title_disabled',
  'badge_not_owned',
  'badge_disabled',
  'reward_not_found',
  'reward_already_settled',
  'inventory_full',
  'reward_settlement_failed',
  'service_unavailable',
]);
export type ProgressionPersistenceStatus = z.infer<typeof playerStatusSchema>;

const loadedWorkspaceSchema = z
  .object({ status: z.literal('loaded'), progression: progressionWorkspaceSchema })
  .strict();
const loadedEventPageSchema = progressionEventPageSchema
  .extend({ status: z.literal('loaded') })
  .strict();
const questMutationResultSchema = z
  .object({
    status: z.enum(['accepted', 'updated', 'completed', 'reward_pending', 'replayed']),
    quest: progressionQuestSchema,
    progression: progressionWorkspaceSchema.optional(),
  })
  .strict();
const identityMutationResultSchema = z
  .object({ status: z.literal('updated'), progression: progressionWorkspaceSchema })
  .strict();

export const adminProgressionWorkspaceSchema = z
  .object({
    status: z.literal('loaded'),
    requestId: z.string().min(1).max(128),
    adminSessionId: z.uuid(),
    skills: z.array(z.record(z.string(), z.unknown())).max(100),
    curves: z.array(z.record(z.string(), z.unknown())).max(500),
    xpRules: z.array(z.record(z.string(), z.unknown())).max(500),
    unlocks: z.array(z.record(z.string(), z.unknown())).max(1_000),
    questChains: z.array(z.record(z.string(), z.unknown())).max(100),
    achievements: z.array(z.record(z.string(), z.unknown())).max(1_000),
    titles: z.array(z.record(z.string(), z.unknown())).max(1_000),
    badges: z.array(z.record(z.string(), z.unknown())).max(1_000),
    liveOps: z.record(z.string(), z.unknown()),
    telemetry: z.record(z.string(), z.unknown()),
    audit: z.array(z.record(z.string(), z.unknown())).max(100),
    player: z.record(z.string(), z.unknown()).nullable(),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type AdminProgressionWorkspace = z.infer<typeof adminProgressionWorkspaceSchema>;

export const adminProgressionQuerySchema = z
  .object({
    wallet: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.string().min(32).max(44).nullable(),
    ),
    search: z.string().trim().max(128).default(''),
  })
  .strict();
export const progressionCurveSuccessorSchema = z
  .object({
    expectedVersionId: z.uuid(),
    publicName: z.string().trim().min(3).max(80),
    thresholds: z
      .array(
        z
          .object({
            level: z.number().int().min(1).max(50),
            cumulativeXp: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(2)
      .max(50),
    reason: z.string().trim().min(12).max(500),
  })
  .strict();
export const progressionVersionTransitionSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    action: z.enum(['validate', 'activate']),
    reason: z.string().trim().min(12).max(500),
  })
  .strict();
export const progressionSuccessorSchema = z
  .object({
    expectedVersionId: z.uuid(),
    definition: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(12).max(500),
  })
  .strict();
export const progressionLiveOpsSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    settings: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(12).max(500),
  })
  .strict();
export const progressionReconciliationSchema = z
  .object({
    wallet: z.string().min(32).max(44),
    type: z.enum([
      'full_player',
      'skill_totals',
      'levels',
      'unlocks',
      'quests',
      'achievements',
      'titles',
      'pending_rewards',
      'velocity',
    ]),
    priority: z.number().int().min(1).max(100),
    reason: z.string().trim().min(20).max(1_000),
  })
  .strict();
export const progressionCorrectionSchema = z
  .object({
    wallet: z.string().min(32).max(44),
    skillDefinitionId: z.uuid().nullable(),
    delta: z
      .number()
      .int()
      .min(-10_000)
      .max(10_000)
      .refine((value) => value !== 0),
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(20).max(1_000),
  })
  .strict();
export const progressionCorrectionApplySchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(20).max(1_000),
  })
  .strict();
export const progressionPresentationUpdateSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    definition: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(12).max(500),
  })
  .strict();

export interface ProgressionGateway {
  workspace(
    walletAddress: string,
    requestId: string,
  ): Promise<ProgressionWorkspace | ProgressionPersistenceStatus>;
  events(
    walletAddress: string,
    after: number,
    limit: number,
    requestId: string,
  ): Promise<z.infer<typeof progressionEventPageSchema> | ProgressionPersistenceStatus>;
  acceptQuest(
    walletAddress: string,
    questDefinitionId: string,
    expectedRevision: number,
    idempotencyKey: string,
    requestId: string,
  ): Promise<unknown | ProgressionPersistenceStatus>;
  trackQuest(
    walletAddress: string,
    questInstanceId: string,
    tracked: boolean,
    expectedRevision: number,
    requestId: string,
  ): Promise<unknown | ProgressionPersistenceStatus>;
  completeQuest(
    walletAddress: string,
    questInstanceId: string,
    expectedRevision: number,
    idempotencyKey: string,
    requestId: string,
  ): Promise<unknown | ProgressionPersistenceStatus>;
  updateIdentity(
    walletAddress: string,
    titleId: string | null,
    badgeId: string | null,
    expectedRevision: number,
    requestId: string,
  ): Promise<ProgressionWorkspace | ProgressionPersistenceStatus>;
  retryReward(
    walletAddress: string,
    rewardId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<unknown | ProgressionPersistenceStatus>;
  adminWorkspace(
    identity: AdminDatabaseIdentity,
    wallet: string | null,
    search: string,
    requestId: string,
  ): Promise<AdminProgressionWorkspace>;
  simulate(
    identity: AdminDatabaseIdentity,
    input: ProgressionSimulationInput,
  ): ReturnType<typeof runProgressionSimulation> & { runId: string };
  curveSuccessor(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof progressionCurveSuccessorSchema>,
    requestId: string,
  ): Promise<unknown>;
  validateCurve(
    identity: AdminDatabaseIdentity,
    versionId: string,
    input: Omit<z.infer<typeof progressionVersionTransitionSchema>, 'action'>,
    requestId: string,
  ): Promise<unknown>;
  activateCurve(
    identity: AdminDatabaseIdentity,
    versionId: string,
    input: Omit<z.infer<typeof progressionVersionTransitionSchema>, 'action'>,
    requestId: string,
  ): Promise<unknown>;
  successor(
    identity: AdminDatabaseIdentity,
    kind: string,
    definitionId: string,
    input: z.infer<typeof progressionSuccessorSchema>,
    requestId: string,
  ): Promise<unknown>;
  transition(
    identity: AdminDatabaseIdentity,
    kind: string,
    versionId: string,
    input: z.infer<typeof progressionVersionTransitionSchema>,
    requestId: string,
  ): Promise<unknown>;
  liveOps(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof progressionLiveOpsSchema>,
    requestId: string,
  ): Promise<unknown>;
  reconcile(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof progressionReconciliationSchema>,
    requestId: string,
  ): Promise<unknown>;
  correction(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof progressionCorrectionSchema>,
    requestId: string,
  ): Promise<unknown>;
  applyCorrection(
    identity: AdminDatabaseIdentity,
    correctionId: string,
    input: z.infer<typeof progressionCorrectionApplySchema>,
    requestId: string,
  ): Promise<unknown>;
  updatePresentation(
    identity: AdminDatabaseIdentity,
    kind: 'title' | 'badge',
    definitionId: string,
    input: z.infer<typeof progressionPresentationUpdateSchema>,
    requestId: string,
  ): Promise<unknown>;
}

export class ProgressionPersistenceError extends Error {
  constructor(readonly operation: string) {
    super('Progression persistence is unavailable.');
    this.name = 'ProgressionPersistenceError';
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
  if (error !== null) throw new ProgressionPersistenceError(operation);
  return data;
}
function status(value: unknown): ProgressionPersistenceStatus | undefined {
  if (typeof value !== 'object' || value === null || !('status' in value)) return undefined;
  const parsed = playerStatusSchema.safeParse(value.status);
  return parsed.success ? parsed.data : undefined;
}

export function createSupabaseProgressionGateway(client: SupabaseClient): ProgressionGateway {
  return {
    async workspace(walletAddress, requestId) {
      const value = await rpc(client, 'get_player_progression_workspace', {
        p_wallet_address: walletAddress,
        p_recent_xp_limit: 20,
        p_request_id: requestId,
      });
      const failure = status(value);
      if (failure !== undefined) return failure;
      return loadedWorkspaceSchema.parse(value).progression;
    },
    async events(walletAddress, after, limit, requestId) {
      const value = await rpc(client, 'get_player_progression_events', {
        p_wallet_address: walletAddress,
        p_after_event_number: after,
        p_limit: limit,
        p_request_id: requestId,
      });
      const failure = status(value);
      if (failure !== undefined) return failure;
      const parsed = loadedEventPageSchema.parse(value);
      return { events: parsed.events, lastEventNumber: parsed.lastEventNumber };
    },
    async acceptQuest(
      walletAddress,
      questDefinitionId,
      expectedRevision,
      idempotencyKey,
      requestId,
    ) {
      const value = await rpc(client, 'accept_player_progression_quest', {
        p_wallet_address: walletAddress,
        p_quest_definition_id: questDefinitionId,
        p_expected_configuration_revision: expectedRevision,
        p_idempotency_key: idempotencyKey,
        p_request_id: requestId,
      });
      const failure = status(value);
      return failure ?? questMutationResultSchema.parse(value);
    },
    async trackQuest(walletAddress, questInstanceId, tracked, expectedRevision, requestId) {
      const value = await rpc(client, 'track_player_progression_quest', {
        p_wallet_address: walletAddress,
        p_quest_instance_id: questInstanceId,
        p_track: tracked,
        p_expected_state_version: expectedRevision,
        p_request_id: requestId,
      });
      const failure = status(value);
      return failure ?? questMutationResultSchema.parse(value);
    },
    async completeQuest(
      walletAddress,
      questInstanceId,
      expectedRevision,
      idempotencyKey,
      requestId,
    ) {
      const value = await rpc(client, 'complete_player_progression_quest', {
        p_wallet_address: walletAddress,
        p_quest_instance_id: questInstanceId,
        p_expected_state_version: expectedRevision,
        p_idempotency_key: idempotencyKey,
        p_request_id: requestId,
      });
      const failure = status(value);
      return failure ?? questMutationResultSchema.parse(value);
    },
    async updateIdentity(walletAddress, titleId, badgeId, expectedRevision, requestId) {
      const value = await rpc(client, 'update_player_progression_identity', {
        p_wallet_address: walletAddress,
        p_title_id: titleId,
        p_badge_id: badgeId,
        p_expected_revision: expectedRevision,
        p_request_id: requestId,
      });
      const failure = status(value);
      if (failure !== undefined) return failure;
      return identityMutationResultSchema.parse(value).progression;
    },
    async retryReward(walletAddress, rewardId, expectedRevision, requestId) {
      const value = await rpc(client, 'retry_player_progression_reward', {
        p_wallet_address: walletAddress,
        p_reward_id: rewardId,
        p_expected_revision: expectedRevision,
        p_request_id: requestId,
      });
      const failure = status(value);
      return failure ?? value;
    },
    async adminWorkspace(identity, wallet, search, requestId) {
      return adminProgressionWorkspaceSchema.parse(
        await rpc(client, 'get_admin_progression_workspace', {
          ...identityParameters(identity),
          p_player_wallet: wallet,
          p_search: search,
          p_request_id: requestId,
        }),
      );
    },
    simulate(_identity, input) {
      return {
        runId: randomUUID(),
        ...runProgressionSimulation(progressionSimulationInputSchema.parse(input)),
      };
    },
    curveSuccessor(identity, input, requestId) {
      return rpc(client, 'create_admin_progression_curve_successor', {
        ...identityParameters(identity),
        p_expected_version_id: input.expectedVersionId,
        p_public_name: input.publicName,
        p_thresholds: input.thresholds,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    validateCurve(identity, versionId, input, requestId) {
      return rpc(client, 'validate_admin_progression_curve', {
        ...identityParameters(identity),
        p_curve_version_id: versionId,
        p_expected_revision: input.expectedRevision,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    activateCurve(identity, versionId, input, requestId) {
      return rpc(client, 'activate_admin_progression_curve', {
        ...identityParameters(identity),
        p_curve_version_id: versionId,
        p_expected_revision: input.expectedRevision,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    successor(identity, kind, definitionId, input, requestId) {
      return rpc(client, 'create_admin_progression_successor', {
        ...identityParameters(identity),
        p_kind: kind,
        p_definition_id: definitionId,
        p_expected_version_id: input.expectedVersionId,
        p_definition: input.definition,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    transition(identity, kind, versionId, input, requestId) {
      return rpc(client, 'transition_admin_progression_version', {
        ...identityParameters(identity),
        p_kind: kind,
        p_version_id: versionId,
        p_expected_revision: input.expectedRevision,
        p_action: input.action,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    liveOps(identity, input, requestId) {
      return rpc(client, 'update_admin_progression_live_ops', {
        ...identityParameters(identity),
        p_expected_revision: input.expectedRevision,
        p_settings: input.settings,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    reconcile(identity, input, requestId) {
      return rpc(client, 'request_admin_progression_reconciliation', {
        ...identityParameters(identity),
        p_player_wallet: input.wallet,
        p_reconciliation_type: input.type,
        p_priority: input.priority,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    correction(identity, input, requestId) {
      return rpc(client, 'request_admin_progression_correction', {
        ...identityParameters(identity),
        p_player_wallet: input.wallet,
        p_skill_definition_id: input.skillDefinitionId,
        p_delta: input.delta,
        p_expected_revision: input.expectedRevision,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    applyCorrection(identity, correctionId, input, requestId) {
      return rpc(client, 'apply_admin_progression_correction', {
        ...identityParameters(identity),
        p_correction_id: correctionId,
        p_expected_revision: input.expectedRevision,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    updatePresentation(identity, kind, definitionId, input, requestId) {
      return rpc(client, 'update_admin_progression_presentation', {
        ...identityParameters(identity),
        p_kind: kind,
        p_definition_id: definitionId,
        p_expected_revision: input.expectedRevision,
        p_definition: input.definition,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
  };
}
