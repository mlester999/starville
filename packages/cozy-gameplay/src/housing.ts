import { z } from 'zod';

import {
  contentVersionSchema,
  identifierSchema,
  idempotencyKeySchema,
  safeTextSchema,
  slugSchema,
  stateVersionSchema,
  timestampSchema,
} from './common';
import { assetReadinessSchema } from './items';

export const furnitureRotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);
const gridPointSchema = z.object({ x: z.number().int(), y: z.number().int() }).strict();
const gridBoundsSchema = z
  .object({
    minX: z.number().int(),
    minY: z.number().int(),
    maxX: z.number().int(),
    maxY: z.number().int(),
  })
  .strict()
  .refine((value) => value.minX < value.maxX && value.minY < value.maxY);

export const furnitureDefinitionSchema = z
  .object({
    id: identifierSchema,
    slug: slugSchema,
    itemSlug: slugSchema,
    name: safeTextSchema(1, 80),
    footprintWidth: z.number().int().positive().max(8),
    footprintHeight: z.number().int().positive().max(8),
    supportedRotations: z.array(furnitureRotationSchema).min(1).max(4),
    blocksMovement: z.boolean(),
    assetRef: slugSchema.nullable(),
    assetReadiness: assetReadinessSchema,
    active: z.boolean(),
    contentVersion: contentVersionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.supportedRotations).size !== value.supportedRotations.length) {
      context.addIssue({
        code: 'custom',
        path: ['supportedRotations'],
        message: 'Furniture rotations must be unique',
      });
    }
  });

export const homeTemplateSchema = z
  .object({
    id: identifierSchema,
    slug: slugSchema,
    name: safeTextSchema(1, 80),
    templateVersion: contentVersionSchema,
    bounds: gridBoundsSchema,
    spawn: gridPointSchema,
    exit: gridPointSchema,
    blockedCells: z.array(gridPointSchema).max(256),
    developmentArt: z.boolean(),
    active: z.boolean(),
  })
  .strict();

export const placedFurnitureSchema = z
  .object({
    id: identifierSchema,
    furnitureSlug: slugSchema,
    x: z.number().int(),
    y: z.number().int(),
    rotation: furnitureRotationSchema,
    stateVersion: stateVersionSchema,
    placedAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const publicReturnDestinationSchema = z
  .object({
    mapId: slugSchema,
    mapVersionId: identifierSchema,
    x: z.number().finite(),
    y: z.number().finite(),
    facingDirection: z.enum([
      'north',
      'northeast',
      'east',
      'southeast',
      'south',
      'southwest',
      'west',
      'northwest',
    ]),
  })
  .strict();
export const playerHomeSchema = z
  .object({
    id: identifierSchema,
    ownerPlayerId: identifierSchema,
    template: homeTemplateSchema,
    placements: z.array(placedFurnitureSchema).max(200),
    returnDestination: publicReturnDestinationSchema,
    stateVersion: stateVersionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const homeLocationSchema = z.enum(['public_world', 'personal_home']);
export const homeAccessRequestSchema = z
  .object({
    expectedHomeStateVersion: stateVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();
export const homeViewSchema = z
  .object({ home: playerHomeSchema, location: homeLocationSchema })
  .strict();
export const homeAccessResponseSchema = homeViewSchema.extend({ replayed: z.boolean() }).strict();

const furnitureMutationCommon = {
  homeId: identifierSchema,
  expectedHomeStateVersion: stateVersionSchema,
  idempotencyKey: idempotencyKeySchema,
} as const;
export const placeFurnitureRequestSchema = z
  .object({
    ...furnitureMutationCommon,
    inventoryStackId: identifierSchema,
    furnitureSlug: slugSchema,
    x: z.number().int(),
    y: z.number().int(),
    rotation: furnitureRotationSchema,
  })
  .strict();
export const moveFurnitureRequestSchema = z
  .object({
    ...furnitureMutationCommon,
    placementId: identifierSchema,
    expectedPlacementStateVersion: stateVersionSchema,
    x: z.number().int(),
    y: z.number().int(),
  })
  .strict();
export const rotateFurnitureRequestSchema = z
  .object({
    ...furnitureMutationCommon,
    placementId: identifierSchema,
    expectedPlacementStateVersion: stateVersionSchema,
    rotation: furnitureRotationSchema,
  })
  .strict();
export const removeFurnitureRequestSchema = z
  .object({
    ...furnitureMutationCommon,
    placementId: identifierSchema,
    expectedPlacementStateVersion: stateVersionSchema,
  })
  .strict();
export const furnitureMutationResponseSchema = z
  .object({
    home: playerHomeSchema,
    inventoryStateVersion: stateVersionSchema,
    replayed: z.boolean(),
  })
  .strict();

export type FurnitureDefinition = z.infer<typeof furnitureDefinitionSchema>;
export type HomeTemplate = z.infer<typeof homeTemplateSchema>;
export type PlacedFurniture = z.infer<typeof placedFurnitureSchema>;
export type PlayerHome = z.infer<typeof playerHomeSchema>;
export type HomeView = z.infer<typeof homeViewSchema>;
export type HomeAccessResponse = z.infer<typeof homeAccessResponseSchema>;
