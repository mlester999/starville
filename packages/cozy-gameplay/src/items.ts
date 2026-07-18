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
  .object({
    kind: z.literal('permanent_tool'),
    toolType: z.enum(['hoe', 'watering_can']),
  })
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

const editableItemDefinitionBaseSchema = z
  .object({
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    category: itemCategorySchema,
    stackable: z.boolean(),
    maxStackSize: z.number().int().positive().max(999),
    buyEligible: z.boolean(),
    sellEligible: z.boolean(),
    giftable: z.boolean(),
    tradable: z.boolean(),
    accountBound: z.boolean(),
    permanentTool: z.boolean(),
    minimumTransferQuantity: z.number().int().min(1).max(999),
    maximumTransferQuantity: z.number().int().min(1).max(999),
    defaultBuyPrice: dustAmountSchema.nullable(),
    defaultSellPrice: dustAmountSchema.nullable(),
    assetRef: slugSchema.nullable(),
    assetReadiness: assetReadinessSchema,
    active: z.boolean(),
    metadata: itemMetadataSchema,
  })
  .strict();

type EditableItemDefinitionPolicyInput = z.infer<typeof editableItemDefinitionBaseSchema>;

function validateItemDefinitionPolicy(
  value: EditableItemDefinitionPolicyInput,
  context: z.RefinementCtx,
): void {
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
    (value.stackable ||
      value.buyEligible ||
      value.sellEligible ||
      value.giftable ||
      value.tradable ||
      !value.accountBound ||
      !value.permanentTool)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['category'],
      message: 'Permanent tools cannot be stacked, bought, or sold',
    });
  }
  if (value.category !== 'permanent_tool' && value.permanentTool) {
    context.addIssue({
      code: 'custom',
      path: ['permanentTool'],
      message: 'Only permanent-tool items may use the permanent-tool policy',
    });
  }
  if (value.minimumTransferQuantity > value.maximumTransferQuantity) {
    context.addIssue({
      code: 'custom',
      path: ['maximumTransferQuantity'],
      message: 'Maximum transfer quantity must meet the minimum',
    });
  }
  if (!value.giftable && !value.tradable && value.maximumTransferQuantity !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['maximumTransferQuantity'],
      message: 'Non-transferable items keep a conservative transfer bound',
    });
  }
}

export const editableItemDefinitionSchema = editableItemDefinitionBaseSchema.superRefine(
  validateItemDefinitionPolicy,
);

export const itemDefinitionSchema = z
  .object({
    id: identifierSchema,
    slug: slugSchema,
    ...editableItemDefinitionBaseSchema.shape,
    contentVersion: contentVersionSchema,
  })
  .strict()
  .superRefine(validateItemDefinitionPolicy);

export function itemMayTransfer(
  item: ItemDefinition,
  kind: 'gift' | 'trade',
  quantity: number,
): boolean {
  return (
    item.active &&
    !item.accountBound &&
    !item.permanentTool &&
    (kind === 'gift' ? item.giftable : item.tradable) &&
    Number.isInteger(quantity) &&
    quantity >= item.minimumTransferQuantity &&
    quantity <= item.maximumTransferQuantity
  );
}

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
export type EditableItemDefinition = z.infer<typeof editableItemDefinitionSchema>;
export type ItemDefinition = z.infer<typeof itemDefinitionSchema>;
export type ItemCatalog = z.infer<typeof itemCatalogSchema>;
