import { z } from 'zod';

import {
  contentVersionSchema,
  dustAmountSchema,
  identifierSchema,
  idempotencyKeySchema,
  quantitySchema,
  safeTextSchema,
  slugSchema,
  stateVersionSchema,
} from './common';

export const recipeIngredientSchema = z
  .object({ itemSlug: slugSchema, quantity: quantitySchema })
  .strict();
const recipeCommon = {
  id: identifierSchema,
  slug: slugSchema,
  name: safeTextSchema(1, 80),
  description: safeTextSchema(1, 280),
  ingredients: z.array(recipeIngredientSchema).min(1).max(12),
  outputItemSlug: slugSchema,
  outputQuantity: quantitySchema,
  dustFee: dustAmountSchema,
  active: z.boolean(),
  contentVersion: contentVersionSchema,
} as const;
export const cookingRecipeSchema = z
  .object({ ...recipeCommon, kind: z.literal('cooking'), stationType: z.literal('cooking_hearth') })
  .strict();
export const craftingRecipeSchema = z
  .object({
    ...recipeCommon,
    kind: z.literal('crafting'),
    stationType: z.literal('crafting_workbench'),
  })
  .strict();
export const recipeDefinitionSchema = z
  .discriminatedUnion('kind', [cookingRecipeSchema, craftingRecipeSchema])
  .superRefine((value, context) => {
    const slugs = value.ingredients.map((ingredient) => ingredient.itemSlug);
    if (new Set(slugs).size !== slugs.length) {
      context.addIssue({
        code: 'custom',
        path: ['ingredients'],
        message: 'Recipe ingredients must be unique',
      });
    }
  });

export const recipeAvailabilitySchema = z
  .object({
    recipe: recipeDefinitionSchema,
    maximumCraftable: z.number().int().nonnegative().max(10_000),
    disabledReason: safeTextSchema(1, 160).nullable(),
  })
  .strict();
export const recipeCatalogSchema = z
  .object({
    contentVersion: contentVersionSchema,
    recipes: z.array(recipeAvailabilitySchema).max(100),
  })
  .strict();
export const recipeActionRequestSchema = z
  .object({
    recipeSlug: slugSchema,
    stationInteractionId: slugSchema,
    quantity: z.number().int().positive().max(99),
    expectedInventoryStateVersion: stateVersionSchema,
    expectedDustStateVersion: stateVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();
export const recipeActionResponseSchema = z
  .object({
    recipeSlug: slugSchema,
    quantity: z.number().int().positive().max(99),
    outputItemSlug: slugSchema,
    outputQuantity: quantitySchema,
    dustBalance: dustAmountSchema,
    inventoryStateVersion: stateVersionSchema,
    replayed: z.boolean(),
  })
  .strict();

export type CookingRecipe = z.infer<typeof cookingRecipeSchema>;
export type CraftingRecipe = z.infer<typeof craftingRecipeSchema>;
export type RecipeDefinition = z.infer<typeof recipeDefinitionSchema>;
