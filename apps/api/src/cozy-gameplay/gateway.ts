import type { SupabaseClient } from '@supabase/supabase-js';

import {
  cozyPersistenceStatusSchema,
  loadedCozyBootstrapSchema,
  loadedDustLedgerSchema,
  loadedInventoryHistorySchema,
  loadedInventorySchema,
  loadedHomeViewSchema,
  loadedItemCatalogSchema,
  loadedFarmPlotListSchema,
  loadedRecipeCatalogSchema,
  loadedShopCatalogSchema,
  persistedFarmMutationSchema,
  persistedFurnitureMutationSchema,
  persistedHomeAccessSchema,
  persistedQuickbarMutationSchema,
  persistedRecipeActionSchema,
  persistedShopTransactionSchema,
  type CozyGameplayGateway,
  type CozyPersistenceStatus,
} from './contracts.js';

export class CozyGameplayPersistenceError extends Error {
  public constructor() {
    super('Trusted cozy gameplay persistence failed.');
    this.name = 'CozyGameplayPersistenceError';
  }
}

async function executeRpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) throw new CozyGameplayPersistenceError();
  return data;
}

function persistenceStatus(value: unknown): CozyPersistenceStatus | undefined {
  const parsed = cozyPersistenceStatusSchema.safeParse(value);
  return parsed.success ? parsed.data.status : undefined;
}

export function createSupabaseCozyGameplayGateway(client: SupabaseClient): CozyGameplayGateway {
  return {
    async bootstrap(walletAddress, idempotencyKey, requestId) {
      const value = await executeRpc(client, 'bootstrap_player_cozy_gameplay', {
        p_wallet_address: walletAddress,
        p_idempotency_key: idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = loadedCozyBootstrapSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async getDustLedger(walletAddress, query, requestId) {
      const value = await executeRpc(client, 'get_player_dust_ledger', {
        p_wallet_address: walletAddress,
        p_page: query.cursor,
        p_page_size: query.limit,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = loadedDustLedgerSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async getInventory(walletAddress, requestId) {
      const value = await executeRpc(client, 'get_player_inventory', {
        p_wallet_address: walletAddress,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = loadedInventorySchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async getInventoryHistory(walletAddress, query, requestId) {
      const value = await executeRpc(client, 'get_player_inventory_history', {
        p_wallet_address: walletAddress,
        p_page: query.cursor,
        p_page_size: query.limit,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = loadedInventoryHistorySchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async updateQuickbar(walletAddress, input, requestId) {
      const value = await executeRpc(client, 'update_player_quickbar', {
        p_wallet_address: walletAddress,
        p_slot: input.slot,
        p_inventory_stack_id: input.inventoryStackId,
        p_expected_state_version: input.expectedStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedQuickbarMutationSchema.parse(value);
      return { quickbar: parsed.quickbar, replayed: parsed.status === 'replayed' };
    },

    async getFarmPlots(walletAddress, requestId) {
      const value = await executeRpc(client, 'get_player_farm_plots', {
        p_wallet_address: walletAddress,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = loadedFarmPlotListSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async getItemCatalog(walletAddress, requestId) {
      const value = await executeRpc(client, 'get_player_item_catalog', {
        p_wallet_address: walletAddress,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = loadedItemCatalogSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async plant(walletAddress, input, requestId) {
      const value = await executeRpc(client, 'plant_player_farm_plot', {
        p_wallet_address: walletAddress,
        p_plot_id: input.plotId,
        p_seed_item_slug: input.seedItemSlug,
        p_expected_state_version: input.expectedStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedFarmMutationSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async water(walletAddress, input, requestId) {
      const value = await executeRpc(client, 'water_player_farm_plot', {
        p_wallet_address: walletAddress,
        p_plot_id: input.plotId,
        p_expected_state_version: input.expectedStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedFarmMutationSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async harvest(walletAddress, input, requestId) {
      const value = await executeRpc(client, 'harvest_player_farm_plot', {
        p_wallet_address: walletAddress,
        p_plot_id: input.plotId,
        p_expected_state_version: input.expectedStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedFarmMutationSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async getRecipeCatalog(walletAddress, kind, requestId) {
      const value = await executeRpc(client, 'get_player_recipe_catalog', {
        p_wallet_address: walletAddress,
        p_kind: kind,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = loadedRecipeCatalogSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async executeRecipe(walletAddress, kind, input, requestId) {
      const value = await executeRpc(client, 'perform_player_recipe_action', {
        p_wallet_address: walletAddress,
        p_kind: kind,
        p_recipe_slug: input.recipeSlug,
        p_station_interaction_id: input.stationInteractionId,
        p_quantity: input.quantity,
        p_expected_inventory_state_version: input.expectedInventoryStateVersion,
        p_expected_dust_state_version: input.expectedDustStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedRecipeActionSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async getShopCatalog(walletAddress, shopSlug, requestId) {
      const value = await executeRpc(client, 'get_player_shop_catalog', {
        p_wallet_address: walletAddress,
        p_shop_slug: shopSlug,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = loadedShopCatalogSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async executeShopTransaction(walletAddress, shopSlug, input, requestId) {
      const value = await executeRpc(client, 'transact_player_shop', {
        p_wallet_address: walletAddress,
        p_shop_slug: shopSlug,
        p_offer_id: input.offerId,
        p_operation: input.operation,
        p_quantity: input.quantity,
        p_expected_dust_state_version: input.expectedDustStateVersion,
        p_expected_inventory_state_version: input.expectedInventoryStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedShopTransactionSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async getHome(walletAddress, requestId) {
      const value = await executeRpc(client, 'get_player_home', {
        p_wallet_address: walletAddress,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = loadedHomeViewSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async enterHome(walletAddress, input, requestId) {
      const value = await executeRpc(client, 'enter_player_home', {
        p_wallet_address: walletAddress,
        p_expected_home_state_version: input.expectedHomeStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedHomeAccessSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async exitHome(walletAddress, input, requestId) {
      const value = await executeRpc(client, 'exit_player_home', {
        p_wallet_address: walletAddress,
        p_expected_home_state_version: input.expectedHomeStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedHomeAccessSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async placeFurniture(walletAddress, input, requestId) {
      const value = await executeRpc(client, 'place_player_home_furniture', {
        p_wallet_address: walletAddress,
        p_home_id: input.homeId,
        p_inventory_stack_id: input.inventoryStackId,
        p_furniture_slug: input.furnitureSlug,
        p_x: input.x,
        p_y: input.y,
        p_rotation: input.rotation,
        p_expected_home_state_version: input.expectedHomeStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedFurnitureMutationSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async moveFurniture(walletAddress, input, requestId) {
      const value = await executeRpc(client, 'move_player_home_furniture', {
        p_wallet_address: walletAddress,
        p_home_id: input.homeId,
        p_placement_id: input.placementId,
        p_x: input.x,
        p_y: input.y,
        p_expected_home_state_version: input.expectedHomeStateVersion,
        p_expected_placement_state_version: input.expectedPlacementStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedFurnitureMutationSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async rotateFurniture(walletAddress, input, requestId) {
      const value = await executeRpc(client, 'rotate_player_home_furniture', {
        p_wallet_address: walletAddress,
        p_home_id: input.homeId,
        p_placement_id: input.placementId,
        p_rotation: input.rotation,
        p_expected_home_state_version: input.expectedHomeStateVersion,
        p_expected_placement_state_version: input.expectedPlacementStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedFurnitureMutationSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },

    async removeFurniture(walletAddress, input, requestId) {
      const value = await executeRpc(client, 'remove_player_home_furniture', {
        p_wallet_address: walletAddress,
        p_home_id: input.homeId,
        p_placement_id: input.placementId,
        p_expected_home_state_version: input.expectedHomeStateVersion,
        p_expected_placement_state_version: input.expectedPlacementStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const status = persistenceStatus(value);
      if (status !== undefined) return status;
      const parsed = persistedFurnitureMutationSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },
  };
}
