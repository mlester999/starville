import type { ServiceLogger } from '../contracts.js';
import { z } from 'zod';
import { PublicApiError, type SafeApiErrorCode } from '../errors.js';
import {
  farmMutationResponseSchema,
  furnitureMutationResponseSchema,
  harvestRequestSchema,
  homeAccessRequestSchema,
  homeAccessResponseSchema,
  homeViewSchema,
  itemCatalogSchema,
  plantRequestSchema,
  placeFurnitureRequestSchema,
  plantHomeCropRequestSchema,
  recipeActionRequestSchema,
  recipeActionResponseSchema,
  recipeCatalogSchema,
  shopCatalogSchema,
  shopTransactionResponseSchema,
  moveFurnitureRequestSchema,
  removeFurnitureRequestSchema,
  rotateFurnitureRequestSchema,
  starterQuestAcceptRequestSchema,
  starterQuestDeliveryRequestSchema,
  prepareHomeSoilRequestSchema,
  harvestHomeCropRequestSchema,
  playableVerticalSliceSchema,
  verticalSliceMutationResponseSchema,
  waterHomeCropRequestSchema,
  waterRequestSchema,
  collectCraftingJobRequestSchema,
  startCraftingJobRequestSchema,
  workstationJobMutationResponseSchema,
  workstationTutorialMutationResponseSchema,
  workstationWorkspaceSchema,
} from '@starville/cozy-gameplay';
import {
  cozyBootstrapInputSchema,
  cozyBootstrapSchema,
  cozyPersistenceStatusSchema,
  cozyCursorQuerySchema,
  dustLedgerViewSchema,
  farmPlotListSchema,
  inventoryHistoryViewSchema,
  inventoryViewSchema,
  quickbarMutationResultSchema,
  quickbarSlotMutationSchema,
  quickbarSlotSchema,
  recipeCatalogKindSchema,
  recipeKindSchema,
  shopSlugSchema,
  shopTransactionBodySchema,
  type CozyGameplayGateway,
  type CozyGameplayService,
  type CozyPersistenceStatus,
} from './contracts.js';

function invalidRequest(): never {
  throw new PublicApiError(400, 'INVALID_REQUEST');
}

function persistenceFailure(status: CozyPersistenceStatus): never {
  if (status === 'not_found' || status === 'bootstrap_required') {
    throw new PublicApiError(409, 'COZY_GAMEPLAY_BOOTSTRAP_REQUIRED');
  }
  if (status === 'suspended') throw new PublicApiError(403, 'PLAYER_SUSPENDED');
  if (status === 'rename_required') throw new PublicApiError(409, 'PLAYER_RENAME_REQUIRED');
  if (status === 'rate_limited') throw new PublicApiError(429, 'RATE_LIMITED');
  if (status === 'state_conflict') throw new PublicApiError(409, 'GAMEPLAY_STATE_CONFLICT');
  if (status === 'item_unavailable') throw new PublicApiError(409, 'ITEM_UNAVAILABLE');
  if (status === 'seed_unavailable') throw new PublicApiError(409, 'ITEM_UNAVAILABLE');
  if (status === 'inventory_full') throw new PublicApiError(409, 'INVENTORY_FULL');
  if (status === 'plot_occupied') throw new PublicApiError(409, 'PLOT_OCCUPIED');
  if (status === 'plot_not_ready') throw new PublicApiError(409, 'PLOT_NOT_READY');
  if (status === 'plot_does_not_need_water') {
    throw new PublicApiError(409, 'PLOT_DOES_NOT_NEED_WATER');
  }
  if (status === 'recipe_unavailable' || status === 'invalid_station') {
    throw new PublicApiError(409, 'RECIPE_UNAVAILABLE');
  }
  if (status === 'missing_ingredients') {
    throw new PublicApiError(409, 'MISSING_INGREDIENTS');
  }
  if (status === 'shop_offer_unavailable') {
    throw new PublicApiError(409, 'SHOP_OFFER_UNAVAILABLE');
  }
  if (status === 'insufficient_dust') throw new PublicApiError(409, 'INSUFFICIENT_DUST');
  if (status === 'invalid_quantity') throw new PublicApiError(400, 'INVALID_QUANTITY');
  if (status === 'home_access_denied') throw new PublicApiError(403, 'HOME_ACCESS_DENIED');
  if (status === 'invalid_placement') {
    throw new PublicApiError(409, 'INVALID_FURNITURE_PLACEMENT');
  }
  const phase11Errors: Partial<
    Record<CozyPersistenceStatus, readonly [PublicApiError['statusCode'], SafeApiErrorCode]>
  > = {
    plot_not_found: [404, 'PLOT_NOT_FOUND'],
    plot_provisioning_failed: [503, 'PLOT_PROVISIONING_FAILED'],
    plot_permission_denied: [403, 'PLOT_PERMISSION_DENIED'],
    plot_world_mismatch: [409, 'PLOT_WORLD_MISMATCH'],
    farming_system_disabled: [503, 'FARMING_SYSTEM_DISABLED'],
    farming_tile_not_found: [404, 'FARMING_TILE_NOT_FOUND'],
    farming_tile_not_eligible: [409, 'FARMING_TILE_NOT_ELIGIBLE'],
    farming_tile_conflict: [409, 'FARMING_TILE_CONFLICT'],
    tool_not_owned: [409, 'TOOL_NOT_OWNED'],
    tool_action_too_far: [409, 'TOOL_ACTION_TOO_FAR'],
    tool_action_cooldown: [429, 'TOOL_ACTION_COOLDOWN'],
    seed_not_owned: [409, 'SEED_NOT_OWNED'],
    seed_not_enabled: [409, 'SEED_NOT_ENABLED'],
    crop_not_found: [404, 'CROP_NOT_FOUND'],
    crop_not_waterable: [409, 'CROP_NOT_WATERABLE'],
    crop_not_mature: [409, 'CROP_NOT_MATURE'],
    crop_already_harvested: [409, 'CROP_ALREADY_HARVESTED'],
    crop_state_conflict: [409, 'CROP_STATE_CONFLICT'],
    quest_not_available: [409, 'QUEST_NOT_AVAILABLE'],
    quest_already_accepted: [409, 'QUEST_ALREADY_ACCEPTED'],
    quest_objective_incomplete: [409, 'QUEST_OBJECTIVE_INCOMPLETE'],
    quest_already_completed: [409, 'QUEST_ALREADY_COMPLETED'],
    quest_reward_already_settled: [409, 'QUEST_REWARD_ALREADY_SETTLED'],
    tutorial_delivery_insufficient: [409, 'TUTORIAL_DELIVERY_INSUFFICIENT'],
    economy_settlement_failed: [503, 'ECONOMY_SETTLEMENT_FAILED'],
    preview_persistence_disabled: [409, 'PREVIEW_PERSISTENCE_DISABLED'],
    recipe_job_required: [409, 'RECIPE_UNAVAILABLE'],
    workstation_unavailable: [503, 'WORKSTATION_UNAVAILABLE'],
    workstation_not_found: [404, 'WORKSTATION_NOT_FOUND'],
    workstation_disabled: [409, 'WORKSTATION_DISABLED'],
    workstation_world_mismatch: [409, 'WORKSTATION_WORLD_MISMATCH'],
    workstation_too_far: [409, 'WORKSTATION_TOO_FAR'],
    recipe_not_found: [409, 'RECIPE_UNAVAILABLE'],
    recipe_disabled: [409, 'RECIPE_UNAVAILABLE'],
    recipe_wrong_workstation: [409, 'RECIPE_UNAVAILABLE'],
    recipe_not_unlocked: [409, 'RECIPE_NOT_UNLOCKED'],
    recipe_batch_invalid: [400, 'RECIPE_BATCH_INVALID'],
    recipe_configuration_invalid: [503, 'WORKSTATION_UNAVAILABLE'],
    cooking_system_disabled: [503, 'WORKSTATION_UNAVAILABLE'],
    crafting_system_disabled: [503, 'WORKSTATION_UNAVAILABLE'],
    crafting_queue_full: [409, 'CRAFTING_QUEUE_FULL'],
    inventory_conflict: [409, 'INVENTORY_STATE_CONFLICT'],
    ingredient_quantity_insufficient: [409, 'MISSING_INGREDIENTS'],
    dust_balance_insufficient: [409, 'INSUFFICIENT_DUST'],
    collection_temporarily_disabled: [503, 'COLLECTION_DISABLED'],
    crafting_job_not_found: [404, 'CRAFTING_JOB_NOT_FOUND'],
    crafting_job_not_ready: [409, 'CRAFTING_JOB_NOT_READY'],
    crafting_job_conflict: [409, 'CRAFTING_JOB_CONFLICT'],
    crafting_job_already_collected: [409, 'CRAFTING_JOB_ALREADY_COLLECTED'],
    crafting_job_canceled: [409, 'CRAFTING_JOB_FAILED'],
    crafting_job_failed: [409, 'CRAFTING_JOB_FAILED'],
  };
  const phase11Error = phase11Errors[status];
  if (phase11Error !== undefined) throw new PublicApiError(phase11Error[0], phase11Error[1]);
  throw new PublicApiError(409, 'REQUEST_ALREADY_PROCESSED');
}

function farmPersistenceFailure(status: CozyPersistenceStatus): never {
  if (status === 'not_found') throw new PublicApiError(409, 'GAMEPLAY_STATE_CONFLICT');
  return persistenceFailure(status);
}

async function trustedOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError(503, 'COZY_GAMEPLAY_UNAVAILABLE');
  }
}

function isPersistenceStatus(value: unknown): value is CozyPersistenceStatus {
  return (
    typeof value === 'string' && cozyPersistenceStatusSchema.safeParse({ status: value }).success
  );
}

export function createCozyGameplayService(options: {
  readonly gateway: CozyGameplayGateway;
  readonly logger: ServiceLogger;
}): CozyGameplayService {
  const { gateway, logger } = options;

  return {
    async bootstrap(walletAddress, body, requestId) {
      const parsed = cozyBootstrapInputSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.bootstrap(walletAddress, parsed.data.idempotencyKey, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      const response = cozyBootstrapSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.bootstrap.completed');
      return response;
    },

    async getDustLedger(walletAddress, query, requestId) {
      const parsed = cozyCursorQuerySchema.safeParse(query);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.getDustLedger(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return dustLedgerViewSchema.parse(result);
    },

    async getInventory(walletAddress, requestId) {
      const result = await trustedOperation(() => gateway.getInventory(walletAddress, requestId));
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return inventoryViewSchema.parse(result);
    },

    async getInventoryHistory(walletAddress, query, requestId) {
      const parsed = cozyCursorQuerySchema.safeParse(query);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.getInventoryHistory(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return inventoryHistoryViewSchema.parse(result);
    },

    async updateQuickbar(walletAddress, slot, body, requestId) {
      const parsedSlot = quickbarSlotSchema.safeParse(slot);
      const parsedBody = quickbarSlotMutationSchema.safeParse(body);
      if (!parsedSlot.success || !parsedBody.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.updateQuickbar(
          walletAddress,
          { slot: parsedSlot.data, ...parsedBody.data },
          requestId,
        ),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      const response = quickbarMutationResultSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.quickbar.updated', {
        replayed: response.replayed,
        slot: parsedSlot.data,
      });
      return response;
    },

    async getFarmPlots(walletAddress, requestId) {
      const result = await trustedOperation(() => gateway.getFarmPlots(walletAddress, requestId));
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return farmPlotListSchema.parse(result);
    },

    async getItemCatalog(walletAddress, requestId) {
      const result = await trustedOperation(() => gateway.getItemCatalog(walletAddress, requestId));
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return itemCatalogSchema.parse(result);
    },

    async plant(walletAddress, body, requestId) {
      const parsed = plantRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.plant(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return farmPersistenceFailure(result);
      return farmMutationResponseSchema.parse(result);
    },

    async water(walletAddress, body, requestId) {
      const parsed = waterRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.water(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return farmPersistenceFailure(result);
      return farmMutationResponseSchema.parse(result);
    },

    async harvest(walletAddress, body, requestId) {
      const parsed = harvestRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.harvest(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return farmPersistenceFailure(result);
      return farmMutationResponseSchema.parse(result);
    },

    async getRecipeCatalog(walletAddress, kind, requestId) {
      const parsedKind = recipeCatalogKindSchema.safeParse(kind);
      if (!parsedKind.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.getRecipeCatalog(walletAddress, parsedKind.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return recipeCatalogSchema.parse(result);
    },

    async executeRecipe(walletAddress, kind, body, requestId) {
      const parsedKind = recipeKindSchema.safeParse(kind);
      const parsedBody = recipeActionRequestSchema.safeParse(body);
      if (!parsedKind.success || !parsedBody.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.executeRecipe(walletAddress, parsedKind.data, parsedBody.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return recipeActionResponseSchema.parse(result);
    },

    async getShopCatalog(walletAddress, shopSlug, requestId) {
      const parsedShop = shopSlugSchema.safeParse(shopSlug);
      if (!parsedShop.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.getShopCatalog(walletAddress, parsedShop.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return shopCatalogSchema.parse(result);
    },

    async executeShopTransaction(walletAddress, shopSlug, operation, body, requestId) {
      const parsedShop = shopSlugSchema.safeParse(shopSlug);
      const operationValue = operation === 'buy' || operation === 'sell' ? operation : undefined;
      const parsedBody = shopTransactionBodySchema.safeParse(body);
      if (!parsedShop.success || operationValue === undefined || !parsedBody.success) {
        return invalidRequest();
      }
      const result = await trustedOperation(() =>
        gateway.executeShopTransaction(
          walletAddress,
          parsedShop.data,
          { ...parsedBody.data, operation: operationValue },
          requestId,
        ),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return shopTransactionResponseSchema.parse(result);
    },

    async getHome(walletAddress, requestId) {
      const result = await trustedOperation(() => gateway.getHome(walletAddress, requestId));
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return homeViewSchema.parse(result);
    },

    async enterHome(walletAddress, body, requestId) {
      const parsed = homeAccessRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.enterHome(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return homeAccessResponseSchema.parse(result);
    },

    async exitHome(walletAddress, body, requestId) {
      const parsed = homeAccessRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.exitHome(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return homeAccessResponseSchema.parse(result);
    },

    async placeFurniture(walletAddress, body, requestId) {
      const parsed = placeFurnitureRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.placeFurniture(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return furnitureMutationResponseSchema.parse(result);
    },

    async moveFurniture(walletAddress, body, requestId) {
      const parsed = moveFurnitureRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.moveFurniture(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return furnitureMutationResponseSchema.parse(result);
    },

    async rotateFurniture(walletAddress, body, requestId) {
      const parsed = rotateFurnitureRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.rotateFurniture(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return furnitureMutationResponseSchema.parse(result);
    },

    async removeFurniture(walletAddress, body, requestId) {
      const parsed = removeFurnitureRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.removeFurniture(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return furnitureMutationResponseSchema.parse(result);
    },

    async getPlayableVerticalSlice(walletAddress, requestId) {
      const result = await trustedOperation(() =>
        gateway.getPlayableVerticalSlice(walletAddress, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      const response = playableVerticalSliceSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.vertical_slice.loaded');
      return response;
    },

    async acceptStarterQuest(walletAddress, body, requestId) {
      const parsed = starterQuestAcceptRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.acceptStarterQuest(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      const response = verticalSliceMutationResponseSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.starter_quest.accepted', {
        replayed: response.replayed,
      });
      return response;
    },

    async prepareHomeSoil(walletAddress, body, requestId) {
      const parsed = prepareHomeSoilRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.prepareHomeSoil(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      const response = verticalSliceMutationResponseSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.home_soil.prepared', {
        replayed: response.replayed,
      });
      return response;
    },

    async plantHomeCrop(walletAddress, body, requestId) {
      const parsed = plantHomeCropRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.plantHomeCrop(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      const response = verticalSliceMutationResponseSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.home_crop.planted', {
        replayed: response.replayed,
      });
      return response;
    },

    async waterHomeCrop(walletAddress, body, requestId) {
      const parsed = waterHomeCropRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.waterHomeCrop(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      const response = verticalSliceMutationResponseSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.home_crop.watered', {
        replayed: response.replayed,
      });
      return response;
    },

    async harvestHomeCrop(walletAddress, body, requestId) {
      const parsed = harvestHomeCropRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.harvestHomeCrop(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      const response = verticalSliceMutationResponseSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.home_crop.harvested', {
        replayed: response.replayed,
      });
      return response;
    },

    async deliverStarterQuest(walletAddress, body, requestId) {
      const parsed = starterQuestDeliveryRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.deliverStarterQuest(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      const response = verticalSliceMutationResponseSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.starter_quest.delivered', {
        replayed: response.replayed,
      });
      return response;
    },

    async getWorkstationWorkspace(walletAddress, workstationInstanceId, requestId) {
      const parsedId = z.string().uuid().safeParse(workstationInstanceId);
      if (!parsedId.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.getWorkstationWorkspace(walletAddress, parsedId.data, requestId),
      );
      if (isPersistenceStatus(result)) {
        logger.child({ requestId }).warn('cozy_gameplay.workstation.open_failed', {
          resultCategory: result,
        });
        return persistenceFailure(result);
      }
      const workspace = workstationWorkspaceSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.workstation.opened', {
        workstationInstanceId: workspace.workstation.id,
        recipeCount: workspace.recipes.length,
        activeJobCount: workspace.jobs.filter((job) => job.status !== 'collected').length,
      });
      return workspace;
    },

    async startWorkstationJob(walletAddress, body, requestId) {
      const parsed = startCraftingJobRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.startWorkstationJob(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) {
        logger.child({ requestId }).warn('cozy_gameplay.workstation_job.start_failed', {
          resultCategory: result,
        });
        return persistenceFailure(result);
      }
      const response = workstationJobMutationResponseSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.workstation_job.started', {
        jobId: response.job.id,
        replayed: response.replayed,
      });
      return response;
    },

    async collectWorkstationJob(walletAddress, body, requestId) {
      const parsed = collectCraftingJobRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.collectWorkstationJob(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) {
        logger.child({ requestId }).warn('cozy_gameplay.workstation_job.collection_failed', {
          resultCategory: result,
        });
        return persistenceFailure(result);
      }
      const response = workstationJobMutationResponseSchema.parse(result);
      logger.child({ requestId }).info('cozy_gameplay.workstation_job.collected', {
        jobId: response.job.id,
        replayed: response.replayed,
      });
      return response;
    },

    async acceptWorkstationTutorial(walletAddress, body, requestId) {
      const parsed = starterQuestAcceptRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.acceptWorkstationTutorial(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return workstationTutorialMutationResponseSchema.parse(result);
    },

    async turnInWorkstationTutorial(walletAddress, body, requestId) {
      const parsed = starterQuestDeliveryRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();
      const result = await trustedOperation(() =>
        gateway.turnInWorkstationTutorial(walletAddress, parsed.data, requestId),
      );
      if (isPersistenceStatus(result)) return persistenceFailure(result);
      return workstationTutorialMutationResponseSchema.parse(result);
    },
  };
}
