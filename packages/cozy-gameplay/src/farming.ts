import { z } from 'zod';

import {
  contentVersionSchema,
  identifierSchema,
  idempotencyKeySchema,
  quantitySchema,
  safeTextSchema,
  slugSchema,
  stateVersionSchema,
  timestampSchema,
} from './common';
import { assetReadinessSchema } from './items';

export const cropDefinitionSchema = z
  .object({
    id: identifierSchema,
    slug: slugSchema,
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    seedItemSlug: slugSchema,
    harvestItemSlug: slugSchema,
    growthDurationSeconds: z.number().int().min(10).max(2_592_000),
    growthStageCount: z.number().int().min(2).max(8),
    deterministicYield: quantitySchema,
    assetRef: slugSchema.nullable(),
    assetReadiness: assetReadinessSchema,
    active: z.boolean(),
    contentVersion: contentVersionSchema,
  })
  .strict();

export const FARM_PLOT_STATES = [
  'empty',
  'planted',
  'needs_water',
  'growing',
  'ready_to_harvest',
] as const;
export const farmPlotStateSchema = z.enum(FARM_PLOT_STATES);

export const farmPlotSchema = z
  .object({
    id: identifierSchema,
    anchorId: slugSchema,
    mapVersionId: identifierSchema,
    slot: z.number().int().min(1).max(64),
    state: farmPlotStateSchema,
    cropSlug: slugSchema.nullable(),
    plantedAt: timestampSchema.nullable(),
    wateredAt: timestampSchema.nullable(),
    growthStartedAt: timestampSchema.nullable(),
    readyAt: timestampSchema.nullable(),
    growthProgress: z.number().min(0).max(1),
    stateVersion: stateVersionSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const hasCrop = value.cropSlug !== null && value.plantedAt !== null;
    if (
      value.state === 'empty' &&
      (hasCrop || value.wateredAt !== null || value.readyAt !== null || value.growthProgress !== 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['state'],
        message: 'Empty plots cannot contain crop state',
      });
    }
    if (value.state !== 'empty' && !hasCrop) {
      context.addIssue({
        code: 'custom',
        path: ['cropSlug'],
        message: 'Occupied plots require a crop and planted timestamp',
      });
    }
    if (
      (value.state === 'growing' || value.state === 'ready_to_harvest') &&
      (value.wateredAt === null || value.growthStartedAt === null || value.readyAt === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['wateredAt'],
        message: 'Growing plots require authoritative growth timestamps',
      });
    }
    if (value.state === 'ready_to_harvest' && value.growthProgress !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['growthProgress'],
        message: 'Ready crops must report complete visual progress',
      });
    }
  });

const farmMutationBase = {
  plotId: identifierSchema,
  expectedStateVersion: stateVersionSchema,
  idempotencyKey: idempotencyKeySchema,
} as const;
export const plantRequestSchema = z
  .object({ ...farmMutationBase, seedItemSlug: slugSchema })
  .strict();
export const waterRequestSchema = z.object(farmMutationBase).strict();
export const harvestRequestSchema = z.object(farmMutationBase).strict();
export const farmMutationResponseSchema = z
  .object({
    plot: farmPlotSchema,
    inventoryStateVersion: stateVersionSchema,
    replayed: z.boolean(),
  })
  .strict();

export type CropDefinition = z.infer<typeof cropDefinitionSchema>;
export type FarmPlotState = z.infer<typeof farmPlotStateSchema>;
export type FarmPlot = z.infer<typeof farmPlotSchema>;
