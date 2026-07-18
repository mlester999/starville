import { z } from 'zod';

import {
  identifierSchema,
  idempotencyKeySchema,
  paginationMetaSchema,
  quantitySchema,
  stateVersionSchema,
  timestampSchema,
} from './common';
import { itemDefinitionSchema } from './items';

export const inventoryCapacitySchema = z
  .object({
    capacity: z.number().int().min(8).max(200),
    usedSlots: z.number().int().nonnegative().max(200),
    stateVersion: stateVersionSchema,
  })
  .strict()
  .refine((value) => value.usedSlots <= value.capacity, {
    path: ['usedSlots'],
    message: 'Used slots cannot exceed inventory capacity',
  });

export const inventoryStackSchema = z
  .object({
    id: identifierSchema,
    item: itemDefinitionSchema,
    quantity: quantitySchema,
    acquiredAt: timestampSchema,
    updatedAt: timestampSchema,
    stateVersion: stateVersionSchema,
  })
  .strict()
  .refine((value) => value.quantity <= value.item.maxStackSize, {
    path: ['quantity'],
    message: 'Quantity exceeds item stack limit',
  });

export const inventorySchema = z
  .object({
    capacity: inventoryCapacitySchema,
    stacks: z.array(inventoryStackSchema).max(200),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.stacks.length !== value.capacity.usedSlots) {
      context.addIssue({
        code: 'custom',
        path: ['capacity', 'usedSlots'],
        message: 'Used slot count does not match stacks',
      });
    }
    const ids = value.stacks.map((stack) => stack.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['stacks'],
        message: 'Inventory stack IDs must be unique',
      });
    }
  });

export const QUICKBAR_SLOT_COUNT = 8 as const;
export const quickbarAssignmentSchema = z
  .object({
    slot: z.number().int().min(1).max(QUICKBAR_SLOT_COUNT),
    inventoryStackId: identifierSchema.nullable(),
    assignedItemSlug: z.string().min(1).max(80).nullable(),
  })
  .strict()
  .refine((value) => (value.inventoryStackId === null) === (value.assignedItemSlug === null), {
    message: 'Quickbar stack and item references must be paired',
  });

export const quickbarSchema = z
  .object({
    assignments: z.array(quickbarAssignmentSchema).length(QUICKBAR_SLOT_COUNT),
    stateVersion: stateVersionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const slots = value.assignments.map((entry) => entry.slot);
    if (new Set(slots).size !== QUICKBAR_SLOT_COUNT) {
      context.addIssue({
        code: 'custom',
        path: ['assignments'],
        message: 'Quickbar must define slots one through eight exactly once',
      });
    }
    const stackIds = value.assignments.flatMap((entry) =>
      entry.inventoryStackId === null ? [] : [entry.inventoryStackId],
    );
    if (new Set(stackIds).size !== stackIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['assignments'],
        message: 'A stack may be assigned only once',
      });
    }
  });

export const quickbarMutationSchema = z
  .object({
    slot: z.number().int().min(1).max(QUICKBAR_SLOT_COUNT),
    inventoryStackId: identifierSchema.nullable(),
    expectedStateVersion: stateVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const inventoryMovementReasonSchema = z.enum([
  'starter_grant',
  'shop_purchase',
  'shop_sale',
  'planting',
  'harvest',
  'cooking',
  'crafting',
  'furniture_placement',
  'furniture_removal',
  'social_gift',
  'social_trade',
  'cooperative_activity_reward',
  'tutorial_delivery',
  'system_refund',
]);
export const MAX_INVENTORY_AGGREGATE_QUANTITY = 199_800 as const;
export const inventoryMovementSchema = z
  .object({
    id: identifierSchema,
    itemSlug: z.string().min(1).max(80),
    delta: z
      .number()
      .int()
      .min(-10_000)
      .max(10_000)
      .refine((value) => value !== 0),
    resultingQuantity: z.number().int().nonnegative().max(MAX_INVENTORY_AGGREGATE_QUANTITY),
    reason: inventoryMovementReasonSchema,
    referenceId: z.string().min(1).max(128).nullable(),
    createdAt: timestampSchema,
  })
  .strict();
export const inventoryMovementPageSchema = z
  .object({ items: z.array(inventoryMovementSchema).max(100), pagination: paginationMetaSchema })
  .strict();

export type Inventory = z.infer<typeof inventorySchema>;
export type InventoryStack = z.infer<typeof inventoryStackSchema>;
export type Quickbar = z.infer<typeof quickbarSchema>;
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;
