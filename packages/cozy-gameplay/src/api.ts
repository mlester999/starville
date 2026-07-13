import { z } from 'zod';

import { dustAccountSchema, dustLedgerEntrySchema, dustLedgerPageSchema } from './dust';
import { cropDefinitionSchema, farmPlotSchema } from './farming';
import { furnitureDefinitionSchema, homeTemplateSchema, playerHomeSchema } from './housing';
import {
  inventoryMovementPageSchema,
  inventoryMovementSchema,
  inventorySchema,
  quickbarSchema,
} from './inventory';
import { itemDefinitionSchema } from './items';
import {
  contentVersionSchema,
  paginationMetaSchema,
  safeTextSchema,
  timestampSchema,
} from './common';
import { recipeDefinitionSchema } from './recipes';
import { shopDefinitionSchema, shopOfferSchema } from './shops';

export const GAMEPLAY_ERROR_CODES = [
  'INSUFFICIENT_DUST',
  'INVENTORY_FULL',
  'ITEM_UNAVAILABLE',
  'INVALID_QUANTITY',
  'PLOT_OCCUPIED',
  'PLOT_NOT_READY',
  'PLOT_DOES_NOT_NEED_WATER',
  'RECIPE_UNAVAILABLE',
  'MISSING_INGREDIENTS',
  'SHOP_OFFER_UNAVAILABLE',
  'HOME_ACCESS_DENIED',
  'INVALID_FURNITURE_PLACEMENT',
  'GAMEPLAY_STATE_CONFLICT',
  'REQUEST_ALREADY_PROCESSED',
] as const;
export const gameplayErrorCodeSchema = z.enum(GAMEPLAY_ERROR_CODES);
export const gameplayErrorSchema = z
  .object({
    code: gameplayErrorCodeSchema,
    message: safeTextSchema(1, 240),
    requestId: z.string().min(1).max(128),
  })
  .strict();

export const cozyGameplayBootstrapSchema = z
  .object({
    contentVersion: contentVersionSchema,
    dust: dustAccountSchema,
    inventory: inventorySchema,
    quickbar: quickbarSchema,
    farmPlots: z.array(farmPlotSchema).max(64),
    home: playerHomeSchema,
    generatedAt: timestampSchema,
  })
  .strict();

export const phase7ABootstrapSchema = z
  .object({
    contentVersion: contentVersionSchema,
    dust: dustAccountSchema,
    inventory: inventorySchema,
    quickbar: quickbarSchema,
    generatedAt: timestampSchema,
  })
  .strict();

export const gameplayContentInspectionSchema = z
  .object({
    contentVersion: contentVersionSchema,
    items: z.array(itemDefinitionSchema).max(250),
    crops: z.array(cropDefinitionSchema).max(100),
    recipes: z.array(recipeDefinitionSchema).max(100),
    shops: z.array(shopDefinitionSchema).max(50),
    offers: z.array(shopOfferSchema).max(250),
    furniture: z.array(furnitureDefinitionSchema).max(100),
    homeTemplates: z.array(homeTemplateSchema).max(20),
  })
  .strict();

export const adminPlayerGameplaySummarySchema = z
  .object({
    dust: dustAccountSchema,
    ledger: dustLedgerPageSchema,
    inventoryStackCount: z.number().int().nonnegative().max(200),
    inventoryCapacity: z.number().int().positive().max(200),
    inventoryHistory: inventoryMovementPageSchema,
    farm: z
      .object({
        total: z.number().int().nonnegative(),
        ready: z.number().int().nonnegative(),
        occupied: z.number().int().nonnegative(),
      })
      .strict(),
    home: z
      .object({
        templateName: safeTextSchema(1, 80),
        templateVersion: contentVersionSchema,
        placedFurnitureCount: z.number().int().nonnegative().max(200),
      })
      .strict(),
    lastGameplayUpdate: timestampSchema,
  })
  .strict();

export const adminPlayerEconomyViewSchema = z
  .object({
    initialized: z.boolean(),
    account: dustAccountSchema.nullable(),
    items: z.array(dustLedgerEntrySchema.omit({ requestId: true })).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
export const adminPlayerInventoryViewSchema = z
  .object({
    initialized: z.boolean(),
    inventory: inventorySchema.nullable(),
    items: z.array(inventoryMovementSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
export const adminPlayerCozyViewSchema = z
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
        templateName: safeTextSchema(1, 80),
        templateVersion: contentVersionSchema,
        placedFurnitureCount: z.number().int().nonnegative().max(200),
        insideHome: z.boolean(),
      })
      .strict()
      .nullable(),
    lastGameplayUpdate: timestampSchema.nullable(),
  })
  .strict();

export const boundedCatalogPageSchema = z
  .object({ items: z.array(itemDefinitionSchema).max(100), pagination: paginationMetaSchema })
  .strict();

export type GameplayErrorCode = z.infer<typeof gameplayErrorCodeSchema>;
export type CozyGameplayBootstrap = z.infer<typeof cozyGameplayBootstrapSchema>;
export type Phase7ABootstrap = z.infer<typeof phase7ABootstrapSchema>;
export type GameplayContentInspection = z.infer<typeof gameplayContentInspectionSchema>;
export type AdminPlayerGameplaySummary = z.infer<typeof adminPlayerGameplaySummarySchema>;
export type AdminPlayerEconomyView = z.infer<typeof adminPlayerEconomyViewSchema>;
export type AdminPlayerInventoryView = z.infer<typeof adminPlayerInventoryViewSchema>;
export type AdminPlayerCozyView = z.infer<typeof adminPlayerCozyViewSchema>;
