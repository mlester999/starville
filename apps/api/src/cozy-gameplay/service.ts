import type { ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
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
  recipeActionRequestSchema,
  recipeActionResponseSchema,
  recipeCatalogSchema,
  shopCatalogSchema,
  shopTransactionResponseSchema,
  moveFurnitureRequestSchema,
  removeFurnitureRequestSchema,
  rotateFurnitureRequestSchema,
  waterRequestSchema,
} from '@starville/cozy-gameplay';
import {
  cozyBootstrapInputSchema,
  cozyBootstrapSchema,
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
    typeof value === 'string' &&
    [
      'not_found',
      'suspended',
      'rename_required',
      'rate_limited',
      'state_conflict',
      'item_unavailable',
      'request_already_processed',
      'plot_occupied',
      'seed_unavailable',
      'plot_not_ready',
      'plot_does_not_need_water',
      'inventory_full',
      'recipe_unavailable',
      'missing_ingredients',
      'shop_offer_unavailable',
      'insufficient_dust',
      'invalid_quantity',
      'invalid_station',
      'bootstrap_required',
      'home_access_denied',
      'invalid_placement',
    ].includes(value)
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
  };
}
