import {
  dustAccountSchema,
  dustLedgerEntrySchema,
  farmMutationResponseSchema,
  farmPlotSchema,
  furnitureMutationResponseSchema,
  homeAccessResponseSchema,
  homeViewSchema,
  idempotencyKeySchema,
  inventoryMovementSchema,
  inventorySchema,
  itemCatalogSchema,
  paginationMetaSchema,
  quickbarSchema,
  recipeActionResponseSchema,
  recipeCatalogSchema,
  shopCatalogSchema,
  shopTransactionRequestSchema,
  shopTransactionResponseSchema,
  slugSchema,
  stateVersionSchema,
  timestampSchema,
  type DustAccount,
  type DustLedgerEntry,
  type Inventory,
  type InventoryMovement,
  type Quickbar,
} from '@starville/cozy-gameplay';
import type {
  harvestRequestSchema,
  homeAccessRequestSchema,
  moveFurnitureRequestSchema,
  plantRequestSchema,
  placeFurnitureRequestSchema,
  recipeActionRequestSchema,
  removeFurnitureRequestSchema,
  rotateFurnitureRequestSchema,
  waterRequestSchema,
} from '@starville/cozy-gameplay';
import { z } from 'zod';

export const cozyBootstrapInputSchema = z.object({ idempotencyKey: idempotencyKeySchema }).strict();

export const cozyCursorQuerySchema = z
  .object({
    cursor: z.preprocess(
      (value) => (value === undefined ? 1 : Number(value)),
      z.number().int().positive().max(10_000),
    ),
    limit: z.preprocess(
      (value) => (value === undefined ? 20 : Number(value)),
      z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]),
    ),
  })
  .strict();

export const quickbarSlotSchema = z.coerce.number().int().min(1).max(8);
export const quickbarSlotMutationSchema = z
  .object({
    inventoryStackId: z.uuid().nullable(),
    expectedStateVersion: stateVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const farmPlotListSchema = z
  .object({
    contentVersion: z.number().int().positive(),
    plots: z.array(farmPlotSchema).max(64),
    generatedAt: timestampSchema,
  })
  .strict();
export const recipeKindSchema = z.enum(['cooking', 'crafting']);
export const recipeCatalogKindSchema = z.enum(['all', 'cooking', 'crafting']);
export const shopSlugSchema = slugSchema;
export const shopTransactionBodySchema = shopTransactionRequestSchema.omit({ operation: true });

export const cozyBootstrapSchema = z
  .object({
    contentVersion: z.number().int().positive(),
    dust: dustAccountSchema,
    inventory: inventorySchema,
    quickbar: quickbarSchema,
    generatedAt: timestampSchema,
  })
  .strict();

export const dustLedgerViewSchema = z
  .object({
    account: dustAccountSchema,
    items: z.array(dustLedgerEntrySchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();

export const inventoryHistoryViewSchema = z
  .object({
    items: z.array(inventoryMovementSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();

export const inventoryViewSchema = z
  .object({ inventory: inventorySchema, quickbar: quickbarSchema })
  .strict();

export const quickbarMutationResultSchema = z
  .object({ quickbar: quickbarSchema, replayed: z.boolean() })
  .strict();

export const loadedCozyBootstrapSchema = cozyBootstrapSchema.extend({
  status: z.literal('loaded'),
});
export const loadedDustLedgerSchema = dustLedgerViewSchema.extend({ status: z.literal('loaded') });
export const loadedInventorySchema = inventoryViewSchema.extend({ status: z.literal('loaded') });
export const loadedInventoryHistorySchema = inventoryHistoryViewSchema.extend({
  status: z.literal('loaded'),
});
export const persistedQuickbarMutationSchema = z
  .object({ status: z.enum(['updated', 'replayed']), quickbar: quickbarSchema })
  .strict();
export const loadedFarmPlotListSchema = farmPlotListSchema.extend({ status: z.literal('loaded') });
export const loadedItemCatalogSchema = itemCatalogSchema.extend({ status: z.literal('loaded') });
export const persistedFarmMutationSchema = farmMutationResponseSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
export const loadedRecipeCatalogSchema = recipeCatalogSchema.extend({
  status: z.literal('loaded'),
});
export const persistedRecipeActionSchema = recipeActionResponseSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
export const loadedShopCatalogSchema = shopCatalogSchema.extend({ status: z.literal('loaded') });
export const persistedShopTransactionSchema = shopTransactionResponseSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
export const loadedHomeViewSchema = homeViewSchema.extend({ status: z.literal('loaded') });
export const persistedHomeAccessSchema = homeAccessResponseSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
export const persistedFurnitureMutationSchema = furnitureMutationResponseSchema.extend({
  status: z.enum(['updated', 'replayed']),
});
export const cozyPersistenceStatusSchema = z
  .object({
    status: z.enum([
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
    ]),
  })
  .strict();

export type CozyBootstrap = z.infer<typeof cozyBootstrapSchema>;
export type CozyCursorQuery = z.infer<typeof cozyCursorQuerySchema>;
export type DustLedgerView = z.infer<typeof dustLedgerViewSchema>;
export type InventoryHistoryView = z.infer<typeof inventoryHistoryViewSchema>;
export type InventoryView = z.infer<typeof inventoryViewSchema>;
export type QuickbarMutationInput = z.infer<typeof quickbarSlotMutationSchema> & {
  readonly slot: number;
};
export type QuickbarMutationResult = z.infer<typeof quickbarMutationResultSchema>;
export type FarmPlotList = z.infer<typeof farmPlotListSchema>;
export type ItemCatalog = z.infer<typeof itemCatalogSchema>;
export type FarmMutationResult = z.infer<typeof farmMutationResponseSchema>;
export type PlantInput = z.infer<typeof plantRequestSchema>;
export type WaterInput = z.infer<typeof waterRequestSchema>;
export type HarvestInput = z.infer<typeof harvestRequestSchema>;
export type RecipeKind = z.infer<typeof recipeKindSchema>;
export type RecipeCatalogKind = z.infer<typeof recipeCatalogKindSchema>;
export type RecipeCatalog = z.infer<typeof recipeCatalogSchema>;
export type RecipeActionInput = z.infer<typeof recipeActionRequestSchema>;
export type RecipeActionResult = z.infer<typeof recipeActionResponseSchema>;
export type ShopCatalog = z.infer<typeof shopCatalogSchema>;
export type ShopTransactionInput = z.infer<typeof shopTransactionRequestSchema>;
export type ShopTransactionResult = z.infer<typeof shopTransactionResponseSchema>;
export type HomeView = z.infer<typeof homeViewSchema>;
export type HomeAccessInput = z.infer<typeof homeAccessRequestSchema>;
export type HomeAccessResult = z.infer<typeof homeAccessResponseSchema>;
export type PlaceFurnitureInput = z.infer<typeof placeFurnitureRequestSchema>;
export type MoveFurnitureInput = z.infer<typeof moveFurnitureRequestSchema>;
export type RotateFurnitureInput = z.infer<typeof rotateFurnitureRequestSchema>;
export type RemoveFurnitureInput = z.infer<typeof removeFurnitureRequestSchema>;
export type FurnitureMutationResult = z.infer<typeof furnitureMutationResponseSchema>;
export type CozyPersistenceStatus = z.infer<typeof cozyPersistenceStatusSchema>['status'];

export interface CozyGameplayGateway {
  bootstrap(
    walletAddress: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<CozyBootstrap | CozyPersistenceStatus>;
  getDustLedger(
    walletAddress: string,
    query: CozyCursorQuery,
    requestId: string,
  ): Promise<DustLedgerView | CozyPersistenceStatus>;
  getInventory(
    walletAddress: string,
    requestId: string,
  ): Promise<InventoryView | CozyPersistenceStatus>;
  getInventoryHistory(
    walletAddress: string,
    query: CozyCursorQuery,
    requestId: string,
  ): Promise<InventoryHistoryView | CozyPersistenceStatus>;
  updateQuickbar(
    walletAddress: string,
    input: QuickbarMutationInput,
    requestId: string,
  ): Promise<QuickbarMutationResult | CozyPersistenceStatus>;
  getFarmPlots(
    walletAddress: string,
    requestId: string,
  ): Promise<FarmPlotList | CozyPersistenceStatus>;
  getItemCatalog(
    walletAddress: string,
    requestId: string,
  ): Promise<ItemCatalog | CozyPersistenceStatus>;
  plant(
    walletAddress: string,
    input: PlantInput,
    requestId: string,
  ): Promise<FarmMutationResult | CozyPersistenceStatus>;
  water(
    walletAddress: string,
    input: WaterInput,
    requestId: string,
  ): Promise<FarmMutationResult | CozyPersistenceStatus>;
  harvest(
    walletAddress: string,
    input: HarvestInput,
    requestId: string,
  ): Promise<FarmMutationResult | CozyPersistenceStatus>;
  getRecipeCatalog(
    walletAddress: string,
    kind: RecipeCatalogKind,
    requestId: string,
  ): Promise<RecipeCatalog | CozyPersistenceStatus>;
  executeRecipe(
    walletAddress: string,
    kind: RecipeKind,
    input: RecipeActionInput,
    requestId: string,
  ): Promise<RecipeActionResult | CozyPersistenceStatus>;
  getShopCatalog(
    walletAddress: string,
    shopSlug: string,
    requestId: string,
  ): Promise<ShopCatalog | CozyPersistenceStatus>;
  executeShopTransaction(
    walletAddress: string,
    shopSlug: string,
    input: ShopTransactionInput,
    requestId: string,
  ): Promise<ShopTransactionResult | CozyPersistenceStatus>;
  getHome(walletAddress: string, requestId: string): Promise<HomeView | CozyPersistenceStatus>;
  enterHome(
    walletAddress: string,
    input: HomeAccessInput,
    requestId: string,
  ): Promise<HomeAccessResult | CozyPersistenceStatus>;
  exitHome(
    walletAddress: string,
    input: HomeAccessInput,
    requestId: string,
  ): Promise<HomeAccessResult | CozyPersistenceStatus>;
  placeFurniture(
    walletAddress: string,
    input: PlaceFurnitureInput,
    requestId: string,
  ): Promise<FurnitureMutationResult | CozyPersistenceStatus>;
  moveFurniture(
    walletAddress: string,
    input: MoveFurnitureInput,
    requestId: string,
  ): Promise<FurnitureMutationResult | CozyPersistenceStatus>;
  rotateFurniture(
    walletAddress: string,
    input: RotateFurnitureInput,
    requestId: string,
  ): Promise<FurnitureMutationResult | CozyPersistenceStatus>;
  removeFurniture(
    walletAddress: string,
    input: RemoveFurnitureInput,
    requestId: string,
  ): Promise<FurnitureMutationResult | CozyPersistenceStatus>;
}

export interface CozyGameplayService {
  bootstrap(walletAddress: string, body: unknown, requestId: string): Promise<CozyBootstrap>;
  getDustLedger(walletAddress: string, query: unknown, requestId: string): Promise<DustLedgerView>;
  getInventory(walletAddress: string, requestId: string): Promise<InventoryView>;
  getInventoryHistory(
    walletAddress: string,
    query: unknown,
    requestId: string,
  ): Promise<InventoryHistoryView>;
  updateQuickbar(
    walletAddress: string,
    slot: unknown,
    body: unknown,
    requestId: string,
  ): Promise<QuickbarMutationResult>;
  getFarmPlots(walletAddress: string, requestId: string): Promise<FarmPlotList>;
  getItemCatalog(walletAddress: string, requestId: string): Promise<ItemCatalog>;
  plant(walletAddress: string, body: unknown, requestId: string): Promise<FarmMutationResult>;
  water(walletAddress: string, body: unknown, requestId: string): Promise<FarmMutationResult>;
  harvest(walletAddress: string, body: unknown, requestId: string): Promise<FarmMutationResult>;
  getRecipeCatalog(walletAddress: string, kind: unknown, requestId: string): Promise<RecipeCatalog>;
  executeRecipe(
    walletAddress: string,
    kind: unknown,
    body: unknown,
    requestId: string,
  ): Promise<RecipeActionResult>;
  getShopCatalog(walletAddress: string, shopSlug: unknown, requestId: string): Promise<ShopCatalog>;
  executeShopTransaction(
    walletAddress: string,
    shopSlug: unknown,
    operation: unknown,
    body: unknown,
    requestId: string,
  ): Promise<ShopTransactionResult>;
  getHome(walletAddress: string, requestId: string): Promise<HomeView>;
  enterHome(walletAddress: string, body: unknown, requestId: string): Promise<HomeAccessResult>;
  exitHome(walletAddress: string, body: unknown, requestId: string): Promise<HomeAccessResult>;
  placeFurniture(
    walletAddress: string,
    body: unknown,
    requestId: string,
  ): Promise<FurnitureMutationResult>;
  moveFurniture(
    walletAddress: string,
    body: unknown,
    requestId: string,
  ): Promise<FurnitureMutationResult>;
  rotateFurniture(
    walletAddress: string,
    body: unknown,
    requestId: string,
  ): Promise<FurnitureMutationResult>;
  removeFurniture(
    walletAddress: string,
    body: unknown,
    requestId: string,
  ): Promise<FurnitureMutationResult>;
}

export type { DustAccount, DustLedgerEntry, Inventory, InventoryMovement, Quickbar };
