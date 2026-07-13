import { z } from 'zod';

import {
  contentVersionSchema,
  dustAmountSchema,
  identifierSchema,
  idempotencyKeySchema,
  safeTextSchema,
  slugSchema,
  stateVersionSchema,
  timestampSchema,
} from './common';

export const shopDefinitionSchema = z
  .object({
    id: identifierSchema,
    slug: slugSchema,
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    active: z.boolean(),
    contentVersion: contentVersionSchema,
  })
  .strict();

export const shopOfferSchema = z
  .object({
    id: identifierSchema,
    shopSlug: slugSchema,
    itemSlug: slugSchema,
    buyPrice: dustAmountSchema.nullable(),
    sellPrice: dustAmountSchema.nullable(),
    minimumQuantity: z.number().int().positive().max(99),
    maximumQuantity: z.number().int().positive().max(99),
    active: z.boolean(),
    availableFrom: timestampSchema.nullable(),
    availableUntil: timestampSchema.nullable(),
    contentVersion: contentVersionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.buyPrice === null && value.sellPrice === null) {
      context.addIssue({
        code: 'custom',
        path: ['buyPrice'],
        message: 'Offer must support buying or selling',
      });
    }
    if (value.buyPrice === 0 || value.sellPrice === 0) {
      context.addIssue({
        code: 'custom',
        path: ['buyPrice'],
        message: 'Offer prices must be positive',
      });
    }
    if (value.minimumQuantity > value.maximumQuantity) {
      context.addIssue({
        code: 'custom',
        path: ['maximumQuantity'],
        message: 'Maximum quantity must include the minimum',
      });
    }
    if (
      value.availableFrom !== null &&
      value.availableUntil !== null &&
      value.availableFrom >= value.availableUntil
    ) {
      context.addIssue({
        code: 'custom',
        path: ['availableUntil'],
        message: 'Offer end must follow its start',
      });
    }
  });

export const shopCatalogSchema = z
  .object({
    shop: shopDefinitionSchema,
    offers: z.array(shopOfferSchema).max(100),
    generatedAt: timestampSchema,
  })
  .strict();
export const shopTransactionRequestSchema = z
  .object({
    offerId: identifierSchema,
    operation: z.enum(['buy', 'sell']),
    quantity: z.number().int().positive().max(99),
    expectedDustStateVersion: stateVersionSchema,
    expectedInventoryStateVersion: stateVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();
export const shopTransactionResponseSchema = z
  .object({
    transactionId: identifierSchema,
    operation: z.enum(['buy', 'sell']),
    itemSlug: slugSchema,
    quantity: z.number().int().positive().max(99),
    dustDelta: z.number().int(),
    dustBalance: dustAmountSchema,
    dustStateVersion: stateVersionSchema,
    inventoryStateVersion: stateVersionSchema,
    replayed: z.boolean(),
  })
  .strict();

export type ShopDefinition = z.infer<typeof shopDefinitionSchema>;
export type ShopOffer = z.infer<typeof shopOfferSchema>;
