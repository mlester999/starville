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
import { inventorySchema, quickbarSchema } from './inventory';
import { cropDefinitionSchema } from './farming';
import { homeTemplateSchema } from './housing';
import { editableItemDefinitionSchema, itemDefinitionSchema } from './items';
import { playerWorkstationSchema, workstationTutorialSchema } from './workstations';

export const HOME_PLOT_LIFECYCLES = [
  'not_provisioned',
  'provisioning',
  'active',
  'suspended',
  'provisioning_failed',
  'archived',
] as const;
export const homePlotLifecycleSchema = z.enum(HOME_PLOT_LIFECYCLES);

export const HOME_FARM_TILE_STATES = ['empty', 'prepared', 'planted', 'growing', 'mature'] as const;
export const homeFarmTileStateSchema = z.enum(HOME_FARM_TILE_STATES);

export const HOME_CROP_STATES = ['planted', 'growing', 'mature'] as const;
export const homeCropStateSchema = z.enum(HOME_CROP_STATES);

export const starterCropSnapshotSchema = z
  .object({
    definitionId: identifierSchema,
    cropSlug: slugSchema,
    cropName: safeTextSchema(1, 80),
    seedItemSlug: slugSchema,
    produceItemSlug: slugSchema,
    configurationRevision: z.number().int().positive(),
    growthDurationSeconds: z.number().int().min(1).max(2_592_000),
    growthStageCount: z.number().int().min(2).max(8),
    deterministicYield: z.number().int().min(1).max(10_000),
    wateringPolicy: z.literal('water_once_to_start'),
  })
  .strict();

export const homeCropInstanceSchema = z
  .object({
    id: identifierSchema,
    tileId: identifierSchema,
    state: homeCropStateSchema,
    snapshot: starterCropSnapshotSchema,
    plantedAt: timestampSchema,
    wateredAt: timestampSchema.nullable(),
    growthStartedAt: timestampSchema.nullable(),
    maturesAt: timestampSchema.nullable(),
    growthProgress: z.number().min(0).max(1),
    growthStage: z.number().int().min(1).max(8),
    stateVersion: stateVersionSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.state === 'planted' && value.wateredAt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['wateredAt'],
        message: 'Planted crops wait for water',
      });
    }
    if (
      value.state !== 'planted' &&
      (value.wateredAt === null || value.growthStartedAt === null || value.maturesAt === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['growthStartedAt'],
        message: 'Growing crops require authoritative timestamps',
      });
    }
    if (value.state === 'mature' && value.growthProgress !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['growthProgress'],
        message: 'Mature crops are complete',
      });
    }
  });

export const homeFarmTileSchema = z
  .object({
    id: identifierSchema,
    tileKey: slugSchema,
    slot: z.number().int().min(1).max(64),
    x: z.number().int().min(-128).max(128),
    y: z.number().int().min(-128).max(128),
    state: homeFarmTileStateSchema,
    preparedAt: timestampSchema.nullable(),
    crop: homeCropInstanceSchema.nullable(),
    stateVersion: stateVersionSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.state === 'empty' || value.state === 'prepared') && value.crop !== null) {
      context.addIssue({
        code: 'custom',
        path: ['crop'],
        message: 'Unplanted tiles cannot contain a crop',
      });
    }
    if (value.state === 'empty' && value.preparedAt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['preparedAt'],
        message: 'Empty soil is not prepared',
      });
    }
    if (value.state !== 'empty' && value.preparedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['preparedAt'],
        message: 'Farmed soil must be prepared',
      });
    }
  });

export const starterQuestObjectiveKeySchema = z.enum([
  'meet_guide',
  'receive_starter_kit',
  'enter_home_plot',
  'prepare_soil',
  'plant_crops',
  'water_crops',
  'harvest_crop',
  'deliver_produce',
  'receive_reward',
]);

export const starterQuestObjectiveSchema = z
  .object({
    key: starterQuestObjectiveKeySchema,
    label: safeTextSchema(1, 120),
    current: z.number().int().nonnegative().max(10_000),
    required: z.number().int().positive().max(10_000),
    completed: z.boolean(),
  })
  .strict();

export const starterQuestViewSchema = z
  .object({
    definitionId: identifierSchema,
    versionId: identifierSchema,
    instanceId: identifierSchema.nullable(),
    slug: slugSchema,
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    status: z.enum(['available', 'active', 'reward_claimed']),
    objectives: z.array(starterQuestObjectiveSchema).length(9),
    starterSeedQuantity: z.number().int().min(2).max(99),
    deliveryQuantity: z.number().int().min(1).max(99),
    rewardDust: z.number().int().min(1).max(10_000),
    stateVersion: z.number().int().nonnegative(),
    acceptedAt: timestampSchema.nullable(),
    completedAt: timestampSchema.nullable(),
    rewardReceiptId: z
      .string()
      .regex(/^DUST-[A-F0-9]{20}$/u)
      .nullable(),
  })
  .strict();

export const starterNpcSchema = z
  .object({
    id: identifierSchema,
    slug: slugSchema,
    name: safeTextSchema(1, 80),
    introduction: safeTextSchema(1, 280),
    worldId: slugSchema,
    x: z.number().finite(),
    y: z.number().finite(),
    interactionRange: z.number().positive().max(4),
    active: z.boolean(),
  })
  .strict();

export const homePlotSchema = z
  .object({
    id: identifierSchema,
    ownerPlayerId: identifierSchema,
    lifecycle: homePlotLifecycleSchema,
    templateId: identifierSchema,
    templateSlug: slugSchema,
    templateVersion: z.number().int().positive(),
    instanceKey: z.string().regex(/^personal-home:[0-9a-f-]{36}$/u),
    bounds: z
      .object({
        minX: z.number().int(),
        minY: z.number().int(),
        maxX: z.number().int(),
        maxY: z.number().int(),
      })
      .strict(),
    spawn: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
    exit: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
    currentPosition: z.object({ x: z.number(), y: z.number() }).strict(),
    location: z.enum(['lantern_square', 'personal_home']),
    tiles: z.array(homeFarmTileSchema).max(12),
    workstations: z.array(playerWorkstationSchema).max(8).default([]),
    farmingStateVersion: stateVersionSchema,
    stateVersion: stateVersionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const farmingLiveOpsSchema = z
  .object({
    plantingEnabled: z.boolean(),
    harvestingEnabled: z.boolean(),
    plotProvisioningEnabled: z.boolean(),
    starterQuestEnabled: z.boolean(),
    tutorialRewardsEnabled: z.boolean(),
    maintenanceMessage: safeTextSchema(0, 280).nullable(),
    configurationRevision: stateVersionSchema,
  })
  .strict();

export const playableVerticalSliceSchema = z
  .object({
    contentVersion: contentVersionSchema,
    plot: homePlotSchema,
    inventory: inventorySchema,
    quickbar: quickbarSchema,
    quest: starterQuestViewSchema,
    workstationTutorial: workstationTutorialSchema.optional(),
    npc: starterNpcSchema,
    liveOps: farmingLiveOpsSchema,
    realtimeChannel: z.string().regex(/^private-home:[0-9a-f-]{36}$/u),
    serverTime: timestampSchema,
  })
  .strict();

const tileActionBase = {
  tileId: identifierSchema,
  expectedTileStateVersion: stateVersionSchema,
  idempotencyKey: idempotencyKeySchema,
} as const;

export const prepareHomeSoilRequestSchema = z.object(tileActionBase).strict();
export const plantHomeCropRequestSchema = z
  .object({ ...tileActionBase, seedItemSlug: slugSchema })
  .strict();
export const waterHomeCropRequestSchema = z
  .object({
    ...tileActionBase,
    cropInstanceId: identifierSchema,
    expectedCropStateVersion: stateVersionSchema,
  })
  .strict();
export const harvestHomeCropRequestSchema = waterHomeCropRequestSchema;

export const starterQuestAcceptRequestSchema = z
  .object({ idempotencyKey: idempotencyKeySchema })
  .strict();
export const starterQuestDeliveryRequestSchema = z
  .object({
    expectedQuestStateVersion: stateVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const verticalSliceMutationResponseSchema = z
  .object({
    view: playableVerticalSliceSchema,
    replayed: z.boolean(),
    announcement: safeTextSchema(1, 180),
  })
  .strict();

export const privateHomeRealtimeEventKeySchema = z.enum([
  'plot_provisioned',
  'soil_prepared',
  'crop_planted',
  'crop_watered',
  'crop_stage_changed',
  'crop_harvested',
  'inventory_changed',
  'quest_progressed',
  'crafting_job_started',
  'crafting_job_ready',
  'crafting_job_collected',
  'crafting_job_failed',
  'workstation_queue_changed',
  'home_layout_saved',
  'furniture_placed',
  'furniture_moved',
  'furniture_removed',
  'storage_changed',
  'home_upgraded',
  'home_interaction_completed',
]);

export const privateHomeRealtimeEventSchema = z
  .object({
    id: identifierSchema,
    eventNumber: z.string().regex(/^\d+$/u),
    eventKey: privateHomeRealtimeEventKeySchema,
    targetId: identifierSchema.nullable(),
    payload: z.record(z.string(), z.unknown()),
    createdAt: timestampSchema,
  })
  .strict();

export const privateHomeRealtimeTicketSchema = z
  .object({
    ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    homeId: identifierSchema,
    expiresAt: timestampSchema,
  })
  .strict();

export const privateHomeRealtimeClientMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      version: z.literal(1),
      type: z.literal('authenticate'),
      ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      type: z.literal('snapshot.request'),
      afterEventNumber: z.string().regex(/^\d+$/u),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      type: z.literal('ping'),
      nonce: z.string().min(1).max(64),
    })
    .strict(),
]);

export const privateHomeRealtimeServerMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      version: z.literal(1),
      type: z.literal('admitted'),
      serverTime: z.number().int().nonnegative(),
      sessionId: identifierSchema,
      homeId: identifierSchema,
      lastEventNumber: z.string().regex(/^\d+$/u),
      view: playableVerticalSliceSchema,
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      type: z.literal('events'),
      serverTime: z.number().int().nonnegative(),
      lastEventNumber: z.string().regex(/^\d+$/u),
      events: z.array(privateHomeRealtimeEventSchema).max(100),
      view: playableVerticalSliceSchema,
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      type: z.literal('error'),
      serverTime: z.number().int().nonnegative(),
      code: z.enum([
        'AUTHENTICATION_REQUIRED',
        'AUTHENTICATION_TIMEOUT',
        'INVALID_TICKET',
        'ACCESS_REVOKED',
        'PLAYER_SUSPENDED',
        'PLOT_UNAVAILABLE',
        'PLOT_WORLD_MISMATCH',
        'INVALID_MESSAGE',
        'RATE_LIMITED',
        'SERVER_UNAVAILABLE',
      ]),
      retryable: z.boolean(),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      type: z.literal('pong'),
      serverTime: z.number().int().nonnegative(),
      nonce: z.string().min(1).max(64),
    })
    .strict(),
]);

export const adminFarmingCropSchema = z
  .object({
    definition: cropDefinitionSchema,
    wateringPolicy: z.literal('water_once_to_start'),
    tutorialEligible: z.boolean(),
    localGrowthDurationSeconds: z.number().int().min(1).max(3_600),
    productionGrowthDurationSeconds: z.number().int().min(1).max(2_592_000),
    configurationRevision: stateVersionSchema,
    activeInstanceCount: z.number().int().nonnegative(),
    referenceImpact: z
      .object({
        activeInstanceCount: z.number().int().nonnegative(),
        questVersionCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const adminFarmingItemSchema = z
  .object({
    definition: itemDefinitionSchema,
    referenceImpact: z
      .object({
        inventoryStackCount: z.number().int().nonnegative(),
        cropDefinitionCount: z.number().int().nonnegative(),
        questVersionCount: z.number().int().nonnegative(),
        recipeCount: z.number().int().nonnegative(),
        shopOfferCount: z.number().int().nonnegative(),
        furnitureDefinitionCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const adminFarmingPlotTemplateSchema = z
  .object({
    template: homeTemplateSchema,
    tiles: z
      .array(
        z
          .object({
            id: identifierSchema,
            tileKey: slugSchema,
            slot: z.number().int().min(1).max(64),
            x: z.number().int().min(-128).max(128),
            y: z.number().int().min(-128).max(128),
          })
          .strict(),
      )
      .max(64),
    activePlotCount: z.number().int().nonnegative(),
    activeForProvisioning: z.boolean(),
    worldAssetRefs: z.array(slugSchema).max(64),
    validation: z
      .object({
        valid: z.boolean(),
        errors: z.array(safeTextSchema(1, 160)).max(32),
      })
      .strict(),
  })
  .strict();

export const adminStarterQuestSchema = z
  .object({
    definitionId: identifierSchema,
    versionId: identifierSchema,
    slug: slugSchema,
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    versionNumber: z.number().int().positive(),
    starterSeedQuantity: z.number().int().min(2).max(99),
    deliveryQuantity: z.number().int().min(1).max(99),
    rewardDust: z.number().int().min(1).max(10_000),
    starterHoeItemId: identifierSchema,
    starterWateringCanItemId: identifierSchema,
    starterSeedItemId: identifierSchema,
    deliveryItemId: identifierSchema,
    active: z.boolean(),
    objectives: z
      .array(
        z
          .object({
            key: starterQuestObjectiveKeySchema,
            label: safeTextSchema(1, 120),
            required: z.number().int().positive().max(10_000),
          })
          .strict(),
      )
      .length(9),
    acceptedCount: z.number().int().nonnegative(),
    completionCount: z.number().int().nonnegative(),
    settlementFailureCount: z.number().int().nonnegative(),
    activeForNewPlayers: z.boolean(),
  })
  .strict();

export const farmingAdminAuditEventSchema = z
  .object({
    id: identifierSchema,
    actionKey: z.enum([
      'farming.liveops_updated',
      'farming.item_updated',
      'farming.crop_updated',
      'farming.plot_template_successor_created',
      'farming.quest_successor_created',
    ]),
    reason: safeTextSchema(12, 500),
    requestId: z.string().trim().min(1).max(128),
    createdAt: timestampSchema,
  })
  .strict();

export const adminFarmingContentSchema = z
  .object({
    settings: farmingLiveOpsSchema,
    items: z.array(adminFarmingItemSchema).max(250),
    crops: z.array(adminFarmingCropSchema).max(100),
    plotTemplate: adminFarmingPlotTemplateSchema,
    plotTemplateVersions: z.array(adminFarmingPlotTemplateSchema).max(50),
    quest: adminStarterQuestSchema,
    questVersions: z.array(adminStarterQuestSchema).max(50),
    audit: z.array(farmingAdminAuditEventSchema).max(50),
  })
  .strict();

export const adminPlayerFarmingSchema = z
  .object({
    initialized: z.boolean(),
    view: playableVerticalSliceSchema.nullable(),
    lastFarmingAction: timestampSchema.nullable().optional(),
    pendingReconciliationCount: z.number().int().nonnegative().optional(),
  })
  .strict();

export const updateFarmingLiveOpsInputSchema = z
  .object({
    expectedRevision: stateVersionSchema,
    plantingEnabled: z.boolean(),
    harvestingEnabled: z.boolean(),
    plotProvisioningEnabled: z.boolean(),
    starterQuestEnabled: z.boolean(),
    tutorialRewardsEnabled: z.boolean(),
    maintenanceMessage: safeTextSchema(1, 280).nullable(),
    reason: safeTextSchema(12, 500),
  })
  .strict();

export const updateFarmingLiveOpsResultSchema = z
  .object({ settings: farmingLiveOpsSchema, replayed: z.boolean() })
  .strict();

export const updateFarmingItemInputSchema = z
  .object({
    expectedContentVersion: contentVersionSchema,
    definition: editableItemDefinitionSchema,
    reason: safeTextSchema(12, 500),
  })
  .strict();

export const updateFarmingItemResultSchema = z
  .object({ item: adminFarmingItemSchema, replayed: z.boolean() })
  .strict();

export const updateFarmingCropInputSchema = z
  .object({
    expectedConfigurationRevision: stateVersionSchema,
    definition: z
      .object({
        name: safeTextSchema(1, 80),
        description: safeTextSchema(1, 280),
        seedItemId: identifierSchema,
        produceItemId: identifierSchema,
        productionGrowthDurationSeconds: z.number().int().min(10).max(2_592_000),
        localGrowthDurationSeconds: z.number().int().min(1).max(3_600),
        growthStageCount: z.number().int().min(2).max(8),
        deterministicYield: z.number().int().min(1).max(10_000),
        wateringPolicy: z.literal('water_once_to_start'),
        tutorialEligible: z.boolean(),
        assetRef: slugSchema.nullable(),
        assetReadiness: z.enum(['approved', 'development_marker', 'missing']),
        active: z.boolean(),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.assetReadiness === 'approved' && value.assetRef === null) {
          context.addIssue({
            code: 'custom',
            path: ['assetRef'],
            message: 'Approved crop assets require a reference',
          });
        }
      }),
    reason: safeTextSchema(12, 500),
  })
  .strict();

export const updateFarmingCropResultSchema = z
  .object({ crop: adminFarmingCropSchema, replayed: z.boolean() })
  .strict();

const farmingTemplateTileInputSchema = z
  .object({
    tileKey: slugSchema,
    slot: z.number().int().min(1).max(64),
    x: z.number().int().min(-128).max(128),
    y: z.number().int().min(-128).max(128),
  })
  .strict();

export const createFarmingPlotTemplateSuccessorInputSchema = z
  .object({
    expectedTemplateId: identifierSchema,
    expectedTemplateVersion: contentVersionSchema,
    name: safeTextSchema(1, 80),
    bounds: z
      .object({
        minX: z.number().int().min(-128).max(128),
        minY: z.number().int().min(-128).max(128),
        maxX: z.number().int().min(-128).max(128),
        maxY: z.number().int().min(-128).max(128),
      })
      .strict(),
    spawn: z
      .object({ x: z.number().int().min(-128).max(128), y: z.number().int().min(-128).max(128) })
      .strict(),
    exit: z
      .object({ x: z.number().int().min(-128).max(128), y: z.number().int().min(-128).max(128) })
      .strict(),
    blockedCells: z
      .array(
        z
          .object({
            x: z.number().int().min(-128).max(128),
            y: z.number().int().min(-128).max(128),
          })
          .strict(),
      )
      .max(256),
    developmentArt: z.boolean(),
    tiles: z.array(farmingTemplateTileInputSchema).length(8),
    reason: safeTextSchema(12, 500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.bounds.minX >= value.bounds.maxX || value.bounds.minY >= value.bounds.maxY) {
      context.addIssue({
        code: 'custom',
        path: ['bounds'],
        message: 'Template bounds are invalid',
      });
    }
    for (const [path, point] of [
      ['spawn', value.spawn],
      ['exit', value.exit],
    ] as const) {
      if (
        point.x < value.bounds.minX ||
        point.x >= value.bounds.maxX ||
        point.y < value.bounds.minY ||
        point.y >= value.bounds.maxY
      ) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: 'Point is outside template bounds',
        });
      }
    }
    const tileKeys = value.tiles.map((tile) => tile.tileKey);
    const slots = value.tiles.map((tile) => tile.slot);
    const coordinates = value.tiles.map((tile) => `${tile.x}:${tile.y}`);
    if (new Set(tileKeys).size !== tileKeys.length) {
      context.addIssue({ code: 'custom', path: ['tiles'], message: 'Tile keys must be unique' });
    }
    if (new Set(slots).size !== slots.length) {
      context.addIssue({ code: 'custom', path: ['tiles'], message: 'Tile slots must be unique' });
    }
    if (new Set(coordinates).size !== coordinates.length) {
      context.addIssue({
        code: 'custom',
        path: ['tiles'],
        message: 'Tile positions must be unique',
      });
    }
  });

export const createFarmingPlotTemplateSuccessorResultSchema = z
  .object({ plotTemplate: adminFarmingPlotTemplateSchema, replayed: z.boolean() })
  .strict();

export const createStarterQuestSuccessorInputSchema = z
  .object({
    expectedVersionId: identifierSchema,
    expectedVersionNumber: contentVersionSchema,
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    starterSeedQuantity: z.number().int().min(2).max(99),
    deliveryQuantity: z.number().int().min(1).max(99),
    rewardDust: z.number().int().min(1).max(10_000),
    starterHoeItemId: identifierSchema,
    starterWateringCanItemId: identifierSchema,
    starterSeedItemId: identifierSchema,
    deliveryItemId: identifierSchema,
    objectives: z
      .array(
        z
          .object({
            key: starterQuestObjectiveKeySchema,
            label: safeTextSchema(1, 120),
            required: z.number().int().min(1).max(10_000),
          })
          .strict(),
      )
      .length(9),
    reason: safeTextSchema(12, 500),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = value.objectives.map((objective) => objective.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['objectives'],
        message: 'Objective keys must be unique',
      });
    }
  });

export const createStarterQuestSuccessorResultSchema = z
  .object({ quest: adminStarterQuestSchema, replayed: z.boolean() })
  .strict();

export type HomeFarmTile = z.infer<typeof homeFarmTileSchema>;
export type HomeCropInstance = z.infer<typeof homeCropInstanceSchema>;
export type StarterQuestView = z.infer<typeof starterQuestViewSchema>;
export type PlayableVerticalSlice = z.infer<typeof playableVerticalSliceSchema>;
export type PrepareHomeSoilRequest = z.infer<typeof prepareHomeSoilRequestSchema>;
export type PlantHomeCropRequest = z.infer<typeof plantHomeCropRequestSchema>;
export type WaterHomeCropRequest = z.infer<typeof waterHomeCropRequestSchema>;
export type HarvestHomeCropRequest = z.infer<typeof harvestHomeCropRequestSchema>;
export type StarterQuestAcceptRequest = z.infer<typeof starterQuestAcceptRequestSchema>;
export type StarterQuestDeliveryRequest = z.infer<typeof starterQuestDeliveryRequestSchema>;
export type VerticalSliceMutationResponse = z.infer<typeof verticalSliceMutationResponseSchema>;
export type PrivateHomeRealtimeEvent = z.infer<typeof privateHomeRealtimeEventSchema>;
export type PrivateHomeRealtimeTicket = z.infer<typeof privateHomeRealtimeTicketSchema>;
export type PrivateHomeRealtimeClientMessage = z.infer<
  typeof privateHomeRealtimeClientMessageSchema
>;
export type PrivateHomeRealtimeServerMessage = z.infer<
  typeof privateHomeRealtimeServerMessageSchema
>;
export type AdminFarmingContent = z.infer<typeof adminFarmingContentSchema>;
export type AdminPlayerFarming = z.infer<typeof adminPlayerFarmingSchema>;
export type UpdateFarmingLiveOpsInput = z.infer<typeof updateFarmingLiveOpsInputSchema>;
export type UpdateFarmingLiveOpsResult = z.infer<typeof updateFarmingLiveOpsResultSchema>;
export type UpdateFarmingItemInput = z.infer<typeof updateFarmingItemInputSchema>;
export type UpdateFarmingItemResult = z.infer<typeof updateFarmingItemResultSchema>;
export type UpdateFarmingCropInput = z.infer<typeof updateFarmingCropInputSchema>;
export type UpdateFarmingCropResult = z.infer<typeof updateFarmingCropResultSchema>;
export type CreateFarmingPlotTemplateSuccessorInput = z.infer<
  typeof createFarmingPlotTemplateSuccessorInputSchema
>;
export type CreateFarmingPlotTemplateSuccessorResult = z.infer<
  typeof createFarmingPlotTemplateSuccessorResultSchema
>;
export type CreateStarterQuestSuccessorInput = z.infer<
  typeof createStarterQuestSuccessorInputSchema
>;
export type CreateStarterQuestSuccessorResult = z.infer<
  typeof createStarterQuestSuccessorResultSchema
>;
