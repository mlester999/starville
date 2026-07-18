import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  decorationSessionResponseSchema,
  housingGameTestFixture,
  housingLayoutHistoryPageSchema,
  housingLayoutValidationSchema,
  housingMutationResponseSchema,
  housingStorageSchema,
  housingWorkspaceSchema,
  type HousingGameTestWorkspace,
  type HousingWorkspace,
  type layoutDraftRequestSchema,
  type saveLayoutRequestSchema,
  type storageTransferRequestSchema,
  type purchaseHomeUpgradeRequestSchema,
} from '@starville/housing';
import {
  housingSimulationInputSchema,
  runHousingSimulation,
  type HousingSimulationInput,
} from '@starville/housing-simulation';
import type { AdminDatabaseIdentity } from '../contracts.js';

const failureStatusSchema = z.enum([
  'home_not_found',
  'home_permission_denied',
  'home_suspended',
  'home_world_mismatch',
  'bootstrap_required',
  'rename_required',
  'rate_limited',
  'decoration_disabled',
  'layout_save_disabled',
  'layout_conflict',
  'home_conflict',
  'inventory_conflict',
  'storage_conflict',
  'layout_invalid',
  'layout_not_found',
  'furniture_not_owned',
  'furniture_return_blocked',
  'request_already_processed',
  'storage_permission_denied',
  'storage_unavailable',
  'storage_deposit_disabled',
  'storage_withdrawal_disabled',
  'storage_capacity_reached',
  'storage_item_not_owned',
  'inventory_capacity_reached',
  'item_not_owned',
  'item_not_storage_eligible',
  'upgrade_not_available',
  'upgrade_disabled',
  'upgrade_already_owned',
  'upgrade_not_eligible',
  'insufficient_dust',
  'dust_conflict',
  'upgrade_settlement_failed',
  'furniture_not_found',
  'furniture_not_interactive',
]);
export type HousingPersistenceStatus = z.infer<typeof failureStatusSchema>;

const loadedWorkspaceSchema = z
  .object({ status: z.literal('loaded'), workspace: housingWorkspaceSchema })
  .strict();
const openedSchema = decorationSessionResponseSchema
  .extend({ status: z.enum(['opened', 'replayed']) })
  .strict();
const validationSchema = z
  .object({ status: z.literal('validated'), validation: housingLayoutValidationSchema })
  .strict();
const mutationSchema = housingMutationResponseSchema
  .extend({ status: z.enum(['saved', 'updated', 'replayed']) })
  .strict();
const storageOpenSchema = z
  .object({
    status: z.literal('loaded'),
    storage: housingStorageSchema,
    workspace: housingWorkspaceSchema,
  })
  .strict();
const historySchema = z
  .object({ status: z.literal('loaded'), history: housingLayoutHistoryPageSchema })
  .strict();
const revisionSchema = z
  .object({
    status: z.literal('loaded'),
    revision: z.record(z.string(), z.unknown()),
    placements: z.array(z.record(z.string(), z.unknown())).max(200),
  })
  .strict();
const interactionSchema = z
  .object({
    status: z.literal('completed'),
    interactionType: z.string().min(1).max(80),
    workspace: housingWorkspaceSchema,
  })
  .strict();

export const adminHousingWorkspaceSchema = z
  .object({
    status: z.literal('loaded'),
    requestId: z.string().min(1).max(128),
    adminSessionId: z.uuid(),
    furniture: z.array(z.record(z.string(), z.unknown())).max(500),
    templates: z.array(z.record(z.string(), z.unknown())).max(100),
    upgrades: z.array(z.record(z.string(), z.unknown())).max(500),
    storagePolicy: z.record(z.string(), z.unknown()),
    playerHomes: z.array(z.record(z.string(), z.unknown())).max(100),
    playerHome: z.record(z.string(), z.unknown()).nullable(),
    reconciliation: z.array(z.record(z.string(), z.unknown())).max(100),
    liveOps: z.record(z.string(), z.unknown()),
    telemetry: z.record(z.string(), z.unknown()),
    audit: z.array(z.record(z.string(), z.unknown())).max(100),
  })
  .strict();
export type AdminHousingWorkspace = z.infer<typeof adminHousingWorkspaceSchema>;

export const adminHousingQuerySchema = z
  .object({
    wallet: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.string().min(32).max(44).nullable(),
    ),
    search: z.string().trim().max(128).default(''),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export const housingUpgradeSuccessorSchema = z
  .object({
    expectedConfigurationRevision: z.number().int().positive(),
    configuration: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();
export const housingUpgradeTransitionSchema = z
  .object({
    expectedConfigurationRevision: z.number().int().positive(),
    transition: z.enum(['validate', 'activate', 'archive']),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();
export const housingLiveOpsUpdateSchema = z
  .object({
    expectedConfigurationRevision: z.number().int().positive(),
    settings: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();
export const housingReconciliationRequestSchema = z
  .object({
    wallet: z.string().min(32).max(44),
    type: z.enum([
      'full_home',
      'layout_head',
      'furniture_settlement',
      'storage_quantity',
      'storage_capacity',
      'layout_validity',
      'upgrade_settlement',
      'quest_authority',
      'preview_exclusion',
      'configuration_compatibility',
    ]),
    priority: z.number().int().min(1).max(100),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();
export const housingCorrectionRequestSchema = z
  .object({
    wallet: z.string().min(32).max(44),
    type: z.enum([
      'retry_layout_settlement',
      'recover_stranded_furniture',
      'repair_storage_mismatch',
      'restore_safe_layout',
      'compensating_item_foundation',
    ]),
    expectedHomeStateVersion: z.number().int().positive(),
    impactPreview: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(20).max(1_000),
  })
  .strict();
export const housingCorrectionApplySchema = z
  .object({
    expectedCorrectionStateVersion: z.number().int().positive(),
    reason: z.string().trim().min(20).max(1_000),
  })
  .strict();

export interface HousingGateway {
  workspace(
    wallet: string,
    requestId: string,
  ): Promise<HousingWorkspace | HousingPersistenceStatus>;
  openDecoration(
    wallet: string,
    homeId: string,
    expectedRevision: number,
    idempotencyKey: string,
    requestId: string,
  ): Promise<unknown | HousingPersistenceStatus>;
  validateLayout(
    wallet: string,
    input: z.infer<typeof layoutDraftRequestSchema>,
    requestId: string,
  ): Promise<unknown | HousingPersistenceStatus>;
  saveLayout(
    wallet: string,
    input: z.infer<typeof saveLayoutRequestSchema>,
    requestId: string,
  ): Promise<unknown | HousingPersistenceStatus>;
  openStorage(
    wallet: string,
    homeId: string,
    expectedStorageVersion: number,
    requestId: string,
  ): Promise<HousingWorkspace | HousingPersistenceStatus>;
  transferStorage(
    wallet: string,
    operation: 'deposit' | 'withdrawal',
    input: z.infer<typeof storageTransferRequestSchema>,
    requestId: string,
  ): Promise<unknown | HousingPersistenceStatus>;
  purchaseUpgrade(
    wallet: string,
    input: z.infer<typeof purchaseHomeUpgradeRequestSchema>,
    requestId: string,
  ): Promise<unknown | HousingPersistenceStatus>;
  history(
    wallet: string,
    homeId: string,
    before: number | null,
    limit: number,
    requestId: string,
  ): Promise<unknown | HousingPersistenceStatus>;
  revision(
    wallet: string,
    homeId: string,
    revisionId: string,
    requestId: string,
  ): Promise<unknown | HousingPersistenceStatus>;
  interact(
    wallet: string,
    homeId: string,
    instanceId: string,
    requestId: string,
  ): Promise<unknown | HousingPersistenceStatus>;
  gameTest(): HousingGameTestWorkspace;
  adminWorkspace(
    identity: AdminDatabaseIdentity,
    wallet: string | null,
    search: string,
    limit: number,
    offset: number,
    requestId: string,
  ): Promise<AdminHousingWorkspace>;
  simulate(
    identity: AdminDatabaseIdentity,
    input: HousingSimulationInput,
  ): ReturnType<typeof runHousingSimulation> & { runId: string };
  upgradeSuccessor(
    identity: AdminDatabaseIdentity,
    baseVersionId: string,
    input: z.infer<typeof housingUpgradeSuccessorSchema>,
    requestId: string,
  ): Promise<unknown>;
  transitionUpgrade(
    identity: AdminDatabaseIdentity,
    versionId: string,
    input: z.infer<typeof housingUpgradeTransitionSchema>,
    requestId: string,
  ): Promise<unknown>;
  liveOps(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof housingLiveOpsUpdateSchema>,
    requestId: string,
  ): Promise<unknown>;
  reconcile(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof housingReconciliationRequestSchema>,
    requestId: string,
  ): Promise<unknown>;
  correction(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof housingCorrectionRequestSchema>,
    requestId: string,
  ): Promise<unknown>;
  applyCorrection(
    identity: AdminDatabaseIdentity,
    correctionId: string,
    input: z.infer<typeof housingCorrectionApplySchema>,
    requestId: string,
  ): Promise<unknown>;
}

export class HousingPersistenceError extends Error {
  constructor(readonly operation: string) {
    super('Housing persistence is unavailable.');
    this.name = 'HousingPersistenceError';
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
  if (error !== null) throw new HousingPersistenceError(operation);
  return data;
}
function failure(value: unknown): HousingPersistenceStatus | undefined {
  if (typeof value !== 'object' || value === null || !('status' in value)) return undefined;
  const parsed = failureStatusSchema.safeParse(value.status);
  return parsed.success ? parsed.data : undefined;
}

export function createSupabaseHousingGateway(client: SupabaseClient): HousingGateway {
  return {
    async workspace(wallet, requestId) {
      const value = await rpc(client, 'get_player_housing_workspace', {
        p_wallet_address: wallet,
        p_request_id: requestId,
      });
      const failed = failure(value);
      return failed ?? loadedWorkspaceSchema.parse(value).workspace;
    },
    async openDecoration(wallet, homeId, expectedRevision, idempotencyKey, requestId) {
      const value = await rpc(client, 'open_player_decoration_session', {
        p_wallet_address: wallet,
        p_home_id: homeId,
        p_expected_layout_revision: expectedRevision,
        p_idempotency_key: idempotencyKey,
        p_request_id: requestId,
      });
      return failure(value) ?? openedSchema.parse(value);
    },
    async validateLayout(wallet, input, requestId) {
      const value = await rpc(client, 'validate_player_home_layout', {
        p_wallet_address: wallet,
        p_home_id: input.homeId,
        p_expected_layout_revision: input.expectedLayoutRevision,
        p_expected_layout_head_state_version: input.expectedLayoutHeadStateVersion,
        p_placements: input.placements,
        p_request_id: requestId,
      });
      return failure(value) ?? validationSchema.parse(value);
    },
    async saveLayout(wallet, input, requestId) {
      const value = await rpc(client, 'save_player_home_layout', {
        p_wallet_address: wallet,
        p_home_id: input.homeId,
        p_expected_layout_revision: input.expectedLayoutRevision,
        p_expected_layout_head_state_version: input.expectedLayoutHeadStateVersion,
        p_expected_home_state_version: input.expectedHomeStateVersion,
        p_expected_inventory_state_version: input.expectedInventoryStateVersion,
        p_expected_storage_state_version: input.expectedStorageStateVersion,
        p_placements: input.placements,
        p_restoration_source_revision_id: input.restorationSourceRevisionId,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      return failure(value) ?? mutationSchema.parse(value);
    },
    async openStorage(wallet, homeId, expectedStorageVersion, requestId) {
      const value = await rpc(client, 'open_player_home_storage', {
        p_wallet_address: wallet,
        p_home_id: homeId,
        p_expected_storage_state_version: expectedStorageVersion,
        p_request_id: requestId,
      });
      const failed = failure(value);
      return failed ?? storageOpenSchema.parse(value).workspace;
    },
    async transferStorage(wallet, operation, input, requestId) {
      const value = await rpc(client, 'transfer_player_home_storage', {
        p_wallet_address: wallet,
        p_home_id: input.homeId,
        p_storage_id: input.storageId,
        p_operation: operation,
        p_item_definition_id: input.itemDefinitionId,
        p_quantity: input.quantity,
        p_expected_inventory_state_version: input.expectedInventoryStateVersion,
        p_expected_storage_state_version: input.expectedStorageStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      return failure(value) ?? mutationSchema.parse(value);
    },
    async purchaseUpgrade(wallet, input, requestId) {
      const value = await rpc(client, 'purchase_player_home_upgrade', {
        p_wallet_address: wallet,
        p_home_id: input.homeId,
        p_upgrade_version_id: input.upgradeVersionId,
        p_expected_home_state_version: input.expectedHomeStateVersion,
        p_expected_dust_state_version: input.expectedDustStateVersion,
        p_expected_storage_state_version: input.expectedStorageStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      return failure(value) ?? mutationSchema.parse(value);
    },
    async history(wallet, homeId, before, limit, requestId) {
      const value = await rpc(client, 'get_player_home_layout_history', {
        p_wallet_address: wallet,
        p_home_id: homeId,
        p_before_revision: before,
        p_limit: limit,
        p_request_id: requestId,
      });
      return failure(value) ?? historySchema.parse(value).history;
    },
    async revision(wallet, homeId, revisionId, requestId) {
      const value = await rpc(client, 'get_player_home_layout_revision', {
        p_wallet_address: wallet,
        p_home_id: homeId,
        p_layout_revision_id: revisionId,
        p_request_id: requestId,
      });
      return failure(value) ?? revisionSchema.parse(value);
    },
    async interact(wallet, homeId, instanceId, requestId) {
      const value = await rpc(client, 'complete_player_home_interaction', {
        p_wallet_address: wallet,
        p_home_id: homeId,
        p_furniture_instance_id: instanceId,
        p_request_id: requestId,
      });
      return failure(value) ?? interactionSchema.parse(value);
    },
    gameTest() {
      return housingGameTestFixture;
    },
    async adminWorkspace(identity, wallet, search, limit, offset, requestId) {
      return adminHousingWorkspaceSchema.parse(
        await rpc(client, 'get_admin_housing_workspace', {
          ...identityParameters(identity),
          p_player_wallet: wallet,
          p_search: search,
          p_limit: limit,
          p_offset: offset,
          p_request_id: requestId,
        }),
      );
    },
    simulate(_identity, input) {
      return {
        runId: randomUUID(),
        ...runHousingSimulation(housingSimulationInputSchema.parse(input)),
      };
    },
    upgradeSuccessor(identity, baseVersionId, input, requestId) {
      return rpc(client, 'create_admin_housing_upgrade_successor', {
        ...identityParameters(identity),
        p_base_version_id: baseVersionId,
        p_expected_configuration_revision: input.expectedConfigurationRevision,
        p_configuration: input.configuration,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    transitionUpgrade(identity, versionId, input, requestId) {
      return rpc(client, 'transition_admin_housing_upgrade', {
        ...identityParameters(identity),
        p_version_id: versionId,
        p_expected_configuration_revision: input.expectedConfigurationRevision,
        p_transition: input.transition,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    liveOps(identity, input, requestId) {
      return rpc(client, 'update_admin_housing_live_ops', {
        ...identityParameters(identity),
        p_expected_configuration_revision: input.expectedConfigurationRevision,
        p_configuration: input.settings,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    reconcile(identity, input, requestId) {
      return rpc(client, 'request_admin_housing_reconciliation', {
        ...identityParameters(identity),
        p_player_wallet: input.wallet,
        p_reconciliation_type: input.type,
        p_priority: input.priority,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    correction(identity, input, requestId) {
      return rpc(client, 'request_admin_housing_correction', {
        ...identityParameters(identity),
        p_player_wallet: input.wallet,
        p_correction_type: input.type,
        p_expected_home_state_version: input.expectedHomeStateVersion,
        p_impact_preview: input.impactPreview,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
    applyCorrection(identity, correctionId, input, requestId) {
      return rpc(client, 'apply_admin_housing_correction', {
        ...identityParameters(identity),
        p_correction_id: correctionId,
        p_expected_correction_state_version: input.expectedCorrectionStateVersion,
        p_reason: input.reason,
        p_request_id: requestId,
      });
    },
  };
}
