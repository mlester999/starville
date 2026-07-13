import { z } from 'zod';

import {
  contentVersionSchema,
  dustAmountSchema,
  identifierSchema,
  safeTextSchema,
  slugSchema,
  timestampSchema,
} from './common';

export const ITEM_CATEGORIES = [
  'seed',
  'crop',
  'ingredient',
  'cooked_food',
  'crafted_material',
  'furniture',
  'permanent_tool',
  'special',
] as const;
export const itemCategorySchema = z.enum(ITEM_CATEGORIES);
export const assetReadinessSchema = z.enum(['approved', 'development_marker', 'missing']);

const seedMetadataSchema = z.object({ kind: z.literal('seed'), cropSlug: slugSchema }).strict();
const cropMetadataSchema = z.object({ kind: z.literal('crop'), cropSlug: slugSchema }).strict();
const ingredientMetadataSchema = z.object({ kind: z.literal('ingredient') }).strict();
const cookedFoodMetadataSchema = z.object({ kind: z.literal('cooked_food') }).strict();
const craftedMaterialMetadataSchema = z.object({ kind: z.literal('crafted_material') }).strict();
const furnitureMetadataSchema = z
  .object({ kind: z.literal('furniture'), furnitureSlug: slugSchema })
  .strict();
const permanentToolMetadataSchema = z
  .object({ kind: z.literal('permanent_tool'), toolType: z.literal('watering_can') })
  .strict();
const specialMetadataSchema = z
  .object({ kind: z.literal('special'), purpose: safeTextSchema(1, 80) })
  .strict();

export const itemMetadataSchema = z.discriminatedUnion('kind', [
  seedMetadataSchema,
  cropMetadataSchema,
  ingredientMetadataSchema,
  cookedFoodMetadataSchema,
  craftedMaterialMetadataSchema,
  furnitureMetadataSchema,
  permanentToolMetadataSchema,
  specialMetadataSchema,
]);

export const itemDefinitionSchema = z
  .object({
    id: identifierSchema,
    slug: slugSchema,
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    category: itemCategorySchema,
    stackable: z.boolean(),
    maxStackSize: z.number().int().positive().max(999),
    buyEligible: z.boolean(),
    sellEligible: z.boolean(),
    defaultBuyPrice: dustAmountSchema.nullable(),
    defaultSellPrice: dustAmountSchema.nullable(),
    assetRef: slugSchema.nullable(),
    assetReadiness: assetReadinessSchema,
    active: z.boolean(),
    contentVersion: contentVersionSchema,
    metadata: itemMetadataSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.category !== value.metadata.kind) {
      context.addIssue({
        code: 'custom',
        path: ['metadata'],
        message: 'Metadata category mismatch',
      });
    }
    if (!value.stackable && value.maxStackSize !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['maxStackSize'],
        message: 'Non-stackable items have a stack size of one',
      });
    }
    if ((value.defaultBuyPrice !== null) !== value.buyEligible || value.defaultBuyPrice === 0) {
      context.addIssue({
        code: 'custom',
        path: ['defaultBuyPrice'],
        message: 'Buy price and eligibility mismatch',
      });
    }
    if ((value.defaultSellPrice !== null) !== value.sellEligible || value.defaultSellPrice === 0) {
      context.addIssue({
        code: 'custom',
        path: ['defaultSellPrice'],
        message: 'Sell price and eligibility mismatch',
      });
    }
    if (value.assetReadiness === 'approved' && value.assetRef === null) {
      context.addIssue({
        code: 'custom',
        path: ['assetRef'],
        message: 'Approved assets require a reference',
      });
    }
    if (
      value.category === 'permanent_tool' &&
      (value.stackable || value.buyEligible || value.sellEligible)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['category'],
        message: 'Permanent tools cannot be stacked, bought, or sold',
      });
    }
  });

export const itemCatalogSchema = z
  .object({
    contentVersion: contentVersionSchema,
    generatedAt: timestampSchema,
    items: z.array(itemDefinitionSchema).max(250),
  })
  .strict()
  .superRefine((value, context) => {
    const slugs = value.items.map((item) => item.slug);
    if (new Set(slugs).size !== slugs.length) {
      context.addIssue({ code: 'custom', path: ['items'], message: 'Item slugs must be unique' });
    }
  });

export type ItemCategory = z.infer<typeof itemCategorySchema>;
export type ItemDefinition = z.infer<typeof itemDefinitionSchema>;
export type ItemCatalog = z.infer<typeof itemCatalogSchema>;
