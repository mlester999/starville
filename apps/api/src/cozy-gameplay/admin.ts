import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  dustAccountSchema,
  dustLedgerEntrySchema,
  gameplayContentInspectionSchema,
  adminFarmingContentSchema,
  adminPlayerFarmingSchema,
  createFarmingPlotTemplateSuccessorInputSchema,
  createFarmingPlotTemplateSuccessorResultSchema,
  createStarterQuestSuccessorInputSchema,
  createStarterQuestSuccessorResultSchema,
  inventoryMovementSchema,
  inventorySchema,
  paginationMetaSchema,
  timestampSchema,
  updateFarmingLiveOpsInputSchema,
  updateFarmingLiveOpsResultSchema,
  updateFarmingCropInputSchema,
  updateFarmingCropResultSchema,
  updateFarmingItemInputSchema,
  updateFarmingItemResultSchema,
  adminPlayerCraftingSchema,
  createRecipeSuccessorInputSchema,
  createRecipeSuccessorResultSchema,
  requestCraftingReconciliationInputSchema,
  requestCraftingReconciliationResultSchema,
  updateWorkstationDefinitionInputSchema,
  updateWorkstationDefinitionResultSchema,
  updateWorkstationLiveOpsInputSchema,
  updateWorkstationLiveOpsResultSchema,
  workstationAdminSummarySchema,
} from '@starville/cozy-gameplay';

import type { AdminDatabaseIdentity } from '../contracts.js';
import { PublicApiError } from '../errors.js';

const playerIdSchema = z.uuid();
export const adminCozyPageQuerySchema = z
  .object({
    page: z.preprocess(
      (value) => (value === undefined ? 1 : Number(value)),
      z.number().int().positive(),
    ),
    pageSize: z.preprocess(
      (value) => (value === undefined ? 10 : Number(value)),
      z.union([z.literal(10), z.literal(50), z.literal(100)]),
    ),
  })
  .strict();

const adminLedgerEntrySchema = dustLedgerEntrySchema.omit({ requestId: true });
export const adminPlayerEconomySchema = z
  .object({
    initialized: z.boolean(),
    account: dustAccountSchema.nullable(),
    items: z.array(adminLedgerEntrySchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
export const adminPlayerInventorySchema = z
  .object({
    initialized: z.boolean(),
    inventory: inventorySchema.nullable(),
    items: z.array(inventoryMovementSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
export const adminPlayerCozySchema = z
  .object({
    initialized: z.boolean(),
    farm: z
      .object({
        total: z.number().int().nonnegative(),
        ready: z.number().int().nonnegative(),
        occupied: z.number().int().nonnegative(),
      })
      .strict(),
    home: z
      .object({
        templateName: z.string().min(1).max(80),
        templateVersion: z.number().int().positive(),
        placedFurnitureCount: z.number().int().nonnegative().max(200),
        insideHome: z.boolean(),
      })
      .strict()
      .nullable(),
    lastGameplayUpdate: timestampSchema.nullable(),
  })
  .strict();

type AdminPlayerEconomy = z.infer<typeof adminPlayerEconomySchema>;
type AdminPlayerInventory = z.infer<typeof adminPlayerInventorySchema>;
type AdminPlayerCozy = z.infer<typeof adminPlayerCozySchema>;
type GameplayContentInspection = z.infer<typeof gameplayContentInspectionSchema>;
type AdminFarmingContent = z.infer<typeof adminFarmingContentSchema>;
type AdminPlayerFarming = z.infer<typeof adminPlayerFarmingSchema>;
type AdminFarmingLiveOpsResult = z.infer<typeof updateFarmingLiveOpsResultSchema>;
type AdminFarmingItemResult = z.infer<typeof updateFarmingItemResultSchema>;
type AdminFarmingCropResult = z.infer<typeof updateFarmingCropResultSchema>;
type AdminFarmingPlotTemplateResult = z.infer<
  typeof createFarmingPlotTemplateSuccessorResultSchema
>;
type AdminStarterQuestResult = z.infer<typeof createStarterQuestSuccessorResultSchema>;
type AdminCraftingContent = z.infer<typeof workstationAdminSummarySchema>;
type AdminPlayerCrafting = z.infer<typeof adminPlayerCraftingSchema>;
type AdminCraftingLiveOpsResult = z.infer<typeof updateWorkstationLiveOpsResultSchema>;
type AdminWorkstationResult = z.infer<typeof updateWorkstationDefinitionResultSchema>;
type AdminRecipeSuccessorResult = z.infer<typeof createRecipeSuccessorResultSchema>;
type AdminCraftingReconciliationResult = z.infer<typeof requestCraftingReconciliationResultSchema>;

const notFoundSchema = z.object({ status: z.literal('not_found') }).strict();
const loadedEconomySchema = adminPlayerEconomySchema.extend({ status: z.literal('loaded') });
const loadedInventorySchema = adminPlayerInventorySchema.extend({ status: z.literal('loaded') });
const loadedCozySchema = adminPlayerCozySchema.extend({ status: z.literal('loaded') });
const loadedContentSchema = gameplayContentInspectionSchema.extend({ status: z.literal('loaded') });
const loadedFarmingContentSchema = adminFarmingContentSchema.extend({
  status: z.literal('loaded'),
});
const loadedPlayerFarmingSchema = adminPlayerFarmingSchema.extend({ status: z.literal('loaded') });
const persistedFarmingLiveOpsSchema = updateFarmingLiveOpsResultSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
const conflictSchema = z.object({ status: z.literal('state_conflict') }).strict();
const referenceConflictSchema = z.object({ status: z.literal('reference_conflict') }).strict();
const stackLimitConflictSchema = z.object({ status: z.literal('stack_limit_conflict') }).strict();
const requestProcessedSchema = z
  .object({ status: z.literal('request_already_processed') })
  .strict();
const persistedFarmingItemSchema = updateFarmingItemResultSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
const persistedFarmingCropSchema = updateFarmingCropResultSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
const persistedFarmingPlotTemplateSchema = createFarmingPlotTemplateSuccessorResultSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
const persistedStarterQuestSchema = createStarterQuestSuccessorResultSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
const loadedCraftingContentSchema = workstationAdminSummarySchema.extend({
  status: z.literal('loaded'),
});
const loadedPlayerCraftingSchema = adminPlayerCraftingSchema.extend({
  status: z.literal('loaded'),
});
const persistedCraftingLiveOpsSchema = updateWorkstationLiveOpsResultSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
const persistedWorkstationSchema = updateWorkstationDefinitionResultSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
const persistedRecipeSuccessorSchema = createRecipeSuccessorResultSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
const persistedCraftingReconciliationSchema = requestCraftingReconciliationResultSchema.extend({
  status: z.enum(['updated', 'replayed']),
});

function identityParameters(identity: AdminDatabaseIdentity) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  } as const;
}

async function rpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const result = await client.rpc(operation, parameters);
  if (result.error !== null) {
    if (result.error.code === '42501') throw new PublicApiError(403, 'ADMIN_ACCESS_DENIED');
    throw new PublicApiError(503, 'OPERATIONS_UNAVAILABLE');
  }
  return result.data;
}

function loaded<Value>(
  value: unknown,
  schema: { parse(input: unknown): Value & { status: 'loaded' } },
): Value {
  if (notFoundSchema.safeParse(value).success) throw new PublicApiError(404, 'PLAYER_NOT_FOUND');
  const { status: _status, ...result } = schema.parse(value);
  void _status;
  return result as Value;
}

export interface AdminCozyService {
  getEconomy(
    identity: AdminDatabaseIdentity,
    playerId: unknown,
    query: unknown,
  ): Promise<AdminPlayerEconomy>;
  getInventory(
    identity: AdminDatabaseIdentity,
    playerId: unknown,
    query: unknown,
  ): Promise<AdminPlayerInventory>;
  getCozy(identity: AdminDatabaseIdentity, playerId: unknown): Promise<AdminPlayerCozy>;
  getContent(identity: AdminDatabaseIdentity): Promise<GameplayContentInspection>;
  getFarmingContent(identity: AdminDatabaseIdentity): Promise<AdminFarmingContent>;
  getPlayerFarming(identity: AdminDatabaseIdentity, playerId: unknown): Promise<AdminPlayerFarming>;
  updateFarmingLiveOps(
    identity: AdminDatabaseIdentity,
    body: unknown,
    requestId: string,
  ): Promise<AdminFarmingLiveOpsResult>;
  updateFarmingItem(
    identity: AdminDatabaseIdentity,
    itemId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<AdminFarmingItemResult>;
  updateFarmingCrop(
    identity: AdminDatabaseIdentity,
    cropId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<AdminFarmingCropResult>;
  createFarmingPlotTemplateSuccessor(
    identity: AdminDatabaseIdentity,
    body: unknown,
    requestId: string,
  ): Promise<AdminFarmingPlotTemplateResult>;
  createStarterQuestSuccessor(
    identity: AdminDatabaseIdentity,
    body: unknown,
    requestId: string,
  ): Promise<AdminStarterQuestResult>;
  getCraftingContent(identity: AdminDatabaseIdentity): Promise<AdminCraftingContent>;
  getPlayerCrafting(
    identity: AdminDatabaseIdentity,
    playerId: unknown,
  ): Promise<AdminPlayerCrafting>;
  updateCraftingLiveOps(
    identity: AdminDatabaseIdentity,
    body: unknown,
    requestId: string,
  ): Promise<AdminCraftingLiveOpsResult>;
  updateWorkstation(
    identity: AdminDatabaseIdentity,
    workstationId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<AdminWorkstationResult>;
  createRecipeSuccessor(
    identity: AdminDatabaseIdentity,
    body: unknown,
    requestId: string,
  ): Promise<AdminRecipeSuccessorResult>;
  requestCraftingReconciliation(
    identity: AdminDatabaseIdentity,
    jobId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<AdminCraftingReconciliationResult>;
}

export function createAdminCozyService(client: SupabaseClient): AdminCozyService {
  return {
    async getEconomy(identity, rawPlayerId, rawQuery) {
      const playerId = playerIdSchema.safeParse(rawPlayerId);
      const query = adminCozyPageQuerySchema.safeParse(rawQuery);
      if (!playerId.success || !query.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      return loaded(
        await rpc(client, 'get_admin_player_economy', {
          ...identityParameters(identity),
          p_player_profile_id: playerId.data,
          p_page: query.data.page,
          p_page_size: query.data.pageSize,
        }),
        loadedEconomySchema,
      );
    },

    async getInventory(identity, rawPlayerId, rawQuery) {
      const playerId = playerIdSchema.safeParse(rawPlayerId);
      const query = adminCozyPageQuerySchema.safeParse(rawQuery);
      if (!playerId.success || !query.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      return loaded(
        await rpc(client, 'get_admin_player_inventory', {
          ...identityParameters(identity),
          p_player_profile_id: playerId.data,
          p_page: query.data.page,
          p_page_size: query.data.pageSize,
        }),
        loadedInventorySchema,
      );
    },

    async getCozy(identity, rawPlayerId) {
      const playerId = playerIdSchema.safeParse(rawPlayerId);
      if (!playerId.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      return loaded(
        await rpc(client, 'get_admin_player_cozy_gameplay', {
          ...identityParameters(identity),
          p_player_profile_id: playerId.data,
        }),
        loadedCozySchema,
      );
    },

    async getContent(identity) {
      return loaded(
        await rpc(client, 'get_admin_gameplay_content', identityParameters(identity)),
        loadedContentSchema,
      );
    },

    async getFarmingContent(identity) {
      return loaded(
        await rpc(client, 'get_admin_farming_content', identityParameters(identity)),
        loadedFarmingContentSchema,
      );
    },

    async getPlayerFarming(identity, rawPlayerId) {
      const playerId = playerIdSchema.safeParse(rawPlayerId);
      if (!playerId.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      return loaded(
        await rpc(client, 'get_admin_player_farming', {
          ...identityParameters(identity),
          p_player_profile_id: playerId.data,
        }),
        loadedPlayerFarmingSchema,
      );
    },

    async updateFarmingLiveOps(identity, rawBody, requestId) {
      const body = updateFarmingLiveOpsInputSchema.safeParse(rawBody);
      if (!body.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      const value = await rpc(client, 'update_admin_farming_live_ops', {
        ...identityParameters(identity),
        p_expected_revision: body.data.expectedRevision,
        p_planting_enabled: body.data.plantingEnabled,
        p_harvesting_enabled: body.data.harvestingEnabled,
        p_plot_provisioning_enabled: body.data.plotProvisioningEnabled,
        p_starter_quest_enabled: body.data.starterQuestEnabled,
        p_tutorial_rewards_enabled: body.data.tutorialRewardsEnabled,
        p_maintenance_message: body.data.maintenanceMessage,
        p_reason: body.data.reason,
        p_request_id: requestId,
      });
      if (conflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_CONFIGURATION_CONFLICT');
      }
      const parsed = persistedFarmingLiveOpsSchema.parse(value);
      return { settings: parsed.settings, replayed: parsed.replayed };
    },

    async updateFarmingItem(identity, rawItemId, rawBody, requestId) {
      const itemId = playerIdSchema.safeParse(rawItemId);
      const body = updateFarmingItemInputSchema.safeParse(rawBody);
      if (!itemId.success || !body.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      const value = await rpc(client, 'update_admin_farming_item', {
        ...identityParameters(identity),
        p_item_id: itemId.data,
        p_expected_content_version: body.data.expectedContentVersion,
        p_definition: body.data.definition,
        p_reason: body.data.reason,
        p_request_id: requestId,
      });
      if (notFoundSchema.safeParse(value).success) {
        throw new PublicApiError(404, 'FARMING_CONTENT_NOT_FOUND');
      }
      if (conflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_CONFIGURATION_CONFLICT');
      }
      if (referenceConflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_REFERENCE_CONFLICT');
      }
      if (stackLimitConflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_STACK_LIMIT_CONFLICT');
      }
      if (requestProcessedSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'REQUEST_ALREADY_PROCESSED');
      }
      const parsed = persistedFarmingItemSchema.parse(value);
      return { item: parsed.item, replayed: parsed.replayed };
    },

    async updateFarmingCrop(identity, rawCropId, rawBody, requestId) {
      const cropId = playerIdSchema.safeParse(rawCropId);
      const body = updateFarmingCropInputSchema.safeParse(rawBody);
      if (!cropId.success || !body.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      const value = await rpc(client, 'update_admin_farming_crop', {
        ...identityParameters(identity),
        p_crop_id: cropId.data,
        p_expected_configuration_revision: body.data.expectedConfigurationRevision,
        p_definition: body.data.definition,
        p_reason: body.data.reason,
        p_request_id: requestId,
      });
      if (notFoundSchema.safeParse(value).success) {
        throw new PublicApiError(404, 'FARMING_CONTENT_NOT_FOUND');
      }
      if (conflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_CONFIGURATION_CONFLICT');
      }
      if (referenceConflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_REFERENCE_CONFLICT');
      }
      if (requestProcessedSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'REQUEST_ALREADY_PROCESSED');
      }
      const parsed = persistedFarmingCropSchema.parse(value);
      return { crop: parsed.crop, replayed: parsed.replayed };
    },

    async createFarmingPlotTemplateSuccessor(identity, rawBody, requestId) {
      const body = createFarmingPlotTemplateSuccessorInputSchema.safeParse(rawBody);
      if (!body.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      const { expectedTemplateId, expectedTemplateVersion, reason, ...definition } = body.data;
      const value = await rpc(client, 'create_admin_farming_plot_template_successor', {
        ...identityParameters(identity),
        p_expected_template_id: expectedTemplateId,
        p_expected_template_version: expectedTemplateVersion,
        p_definition: definition,
        p_reason: reason,
        p_request_id: requestId,
      });
      if (conflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_CONFIGURATION_CONFLICT');
      }
      if (requestProcessedSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'REQUEST_ALREADY_PROCESSED');
      }
      const parsed = persistedFarmingPlotTemplateSchema.parse(value);
      return { plotTemplate: parsed.plotTemplate, replayed: parsed.replayed };
    },

    async createStarterQuestSuccessor(identity, rawBody, requestId) {
      const body = createStarterQuestSuccessorInputSchema.safeParse(rawBody);
      if (!body.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      const { expectedVersionId, expectedVersionNumber, reason, ...definition } = body.data;
      const value = await rpc(client, 'create_admin_starter_quest_successor', {
        ...identityParameters(identity),
        p_expected_version_id: expectedVersionId,
        p_expected_version_number: expectedVersionNumber,
        p_definition: definition,
        p_reason: reason,
        p_request_id: requestId,
      });
      if (conflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_CONFIGURATION_CONFLICT');
      }
      if (referenceConflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_REFERENCE_CONFLICT');
      }
      if (requestProcessedSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'REQUEST_ALREADY_PROCESSED');
      }
      const parsed = persistedStarterQuestSchema.parse(value);
      return { quest: parsed.quest, replayed: parsed.replayed };
    },

    async getCraftingContent(identity) {
      return loaded(
        await rpc(client, 'get_admin_crafting_content', identityParameters(identity)),
        loadedCraftingContentSchema,
      );
    },

    async getPlayerCrafting(identity, rawPlayerId) {
      const playerId = playerIdSchema.safeParse(rawPlayerId);
      if (!playerId.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      return loaded(
        await rpc(client, 'get_admin_player_crafting', {
          ...identityParameters(identity),
          p_player_profile_id: playerId.data,
        }),
        loadedPlayerCraftingSchema,
      );
    },

    async updateCraftingLiveOps(identity, rawBody, requestId) {
      const body = updateWorkstationLiveOpsInputSchema.safeParse(rawBody);
      if (!body.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      const value = await rpc(client, 'update_admin_crafting_live_ops', {
        ...identityParameters(identity),
        p_expected_revision: body.data.expectedRevision,
        p_cooking_starts_enabled: body.data.cookingStartsEnabled,
        p_crafting_starts_enabled: body.data.craftingStartsEnabled,
        p_collection_enabled: body.data.collectionEnabled,
        p_tutorial_unlocks_enabled: body.data.tutorialUnlocksEnabled,
        p_tutorial_rewards_enabled: body.data.tutorialRewardsEnabled,
        p_dust_fees_enabled: body.data.dustFeesEnabled,
        p_use_local_durations: body.data.useLocalDurations,
        p_maintenance_message: body.data.maintenanceMessage,
        p_reason: body.data.reason,
        p_request_id: requestId,
      });
      if (conflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_CONFIGURATION_CONFLICT');
      }
      if (requestProcessedSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'REQUEST_ALREADY_PROCESSED');
      }
      const parsed = persistedCraftingLiveOpsSchema.parse(value);
      return { settings: parsed.settings, replayed: parsed.replayed };
    },

    async updateWorkstation(identity, rawWorkstationId, rawBody, requestId) {
      const workstationId = playerIdSchema.safeParse(rawWorkstationId);
      const body = updateWorkstationDefinitionInputSchema.safeParse(rawBody);
      if (!workstationId.success || !body.success) {
        throw new PublicApiError(400, 'INVALID_REQUEST');
      }
      const value = await rpc(client, 'update_admin_workstation_definition', {
        ...identityParameters(identity),
        p_workstation_definition_id: workstationId.data,
        p_expected_configuration_revision: body.data.expectedConfigurationRevision,
        p_display_name: body.data.displayName,
        p_description: body.data.description,
        p_queue_capacity: body.data.queueCapacity,
        p_interaction_radius: body.data.interactionRadius,
        p_enabled: body.data.enabled,
        p_reason: body.data.reason,
        p_request_id: requestId,
      });
      if (notFoundSchema.safeParse(value).success) {
        throw new PublicApiError(404, 'FARMING_CONTENT_NOT_FOUND');
      }
      if (conflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_CONFIGURATION_CONFLICT');
      }
      if (requestProcessedSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'REQUEST_ALREADY_PROCESSED');
      }
      const parsed = persistedWorkstationSchema.parse(value);
      return { workstation: parsed.workstation, replayed: parsed.replayed };
    },

    async createRecipeSuccessor(identity, rawBody, requestId) {
      const body = createRecipeSuccessorInputSchema.safeParse(rawBody);
      if (!body.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      const {
        recipeDefinitionId,
        expectedVersionId,
        expectedConfigurationRevision,
        reason,
        ...definition
      } = body.data;
      const value = await rpc(client, 'create_admin_recipe_successor', {
        ...identityParameters(identity),
        p_recipe_definition_id: recipeDefinitionId,
        p_expected_version_id: expectedVersionId,
        p_expected_configuration_revision: expectedConfigurationRevision,
        p_definition: definition,
        p_reason: reason,
        p_request_id: requestId,
      });
      if (conflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_CONFIGURATION_CONFLICT');
      }
      if (referenceConflictSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'FARMING_REFERENCE_CONFLICT');
      }
      if (requestProcessedSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'REQUEST_ALREADY_PROCESSED');
      }
      const parsed = persistedRecipeSuccessorSchema.parse(value);
      return { recipe: parsed.recipe, replayed: parsed.replayed };
    },

    async requestCraftingReconciliation(identity, rawJobId, rawBody, requestId) {
      const jobId = playerIdSchema.safeParse(rawJobId);
      const body = requestCraftingReconciliationInputSchema.safeParse(rawBody);
      if (!jobId.success || !body.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      const value = await rpc(client, 'request_admin_crafting_job_reconciliation', {
        ...identityParameters(identity),
        p_crafting_job_id: jobId.data,
        p_reason: body.data.reason,
        p_request_id: requestId,
      });
      if (notFoundSchema.safeParse(value).success) {
        throw new PublicApiError(404, 'CRAFTING_JOB_NOT_FOUND');
      }
      if (requestProcessedSchema.safeParse(value).success) {
        throw new PublicApiError(409, 'REQUEST_ALREADY_PROCESSED');
      }
      const parsed = persistedCraftingReconciliationSchema.parse(value);
      return { request: parsed.request, replayed: parsed.replayed };
    },
  };
}
