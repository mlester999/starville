import { z } from 'zod';

import {
  contentVersionSchema,
  dustAmountSchema,
  idempotencyKeySchema,
  identifierSchema,
  safeTextSchema,
  slugSchema,
  stateVersionSchema,
  timestampSchema,
} from './common';
import { inventorySchema } from './inventory';
import { dustAccountSchema } from './dust';

export const workstationTypeSchema = z.enum(['cooking_hearth', 'crafting_workbench']);
export const recipeJobCategorySchema = z.enum(['cooking', 'crafting']);

export const workstationDefinitionSchema = z
  .object({
    id: identifierSchema,
    key: slugSchema,
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    type: workstationTypeSchema,
    allowedRecipeCategories: z.array(recipeJobCategorySchema).min(1).max(2),
    queueCapacity: z.number().int().min(1).max(8),
    simultaneousJobPolicy: z.literal('bounded_owner_queue'),
    interactionRadius: z.number().positive().max(4),
    enabled: z.boolean(),
    assetRef: slugSchema.nullable(),
    assetReadiness: z.enum(['approved', 'development_marker', 'missing']),
    pinnedAssetVersionId: identifierSchema.nullable(),
    fallbackMarker: safeTextSchema(1, 8),
    animationConfig: z.record(z.string(), z.unknown()),
    soundConfig: z.record(z.string(), z.unknown()),
    configurationRevision: stateVersionSchema,
  })
  .strict();

export const workstationQueueSchema = z
  .object({
    capacity: z.number().int().min(1).max(8),
    occupied: z.number().int().nonnegative().max(8),
    running: z.number().int().nonnegative().max(8),
    ready: z.number().int().nonnegative().max(8),
    remainingSlots: z.number().int().nonnegative().max(8),
  })
  .strict();

export const playerWorkstationSchema = z
  .object({
    id: identifierSchema,
    homeId: identifierSchema,
    worldObjectId: slugSchema,
    definition: workstationDefinitionSchema,
    position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    interactionPoint: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    enabled: z.boolean(),
    stateVersion: stateVersionSchema,
    queue: workstationQueueSchema,
  })
  .strict();

export const recipeVersionIngredientProjectionSchema = z
  .object({
    itemId: identifierSchema,
    itemSlug: slugSchema,
    itemName: safeTextSchema(1, 80),
    quantityPerBatch: z.number().int().min(1).max(10_000),
    ownedQuantity: z.number().int().nonnegative().max(199_800),
  })
  .strict();

export const recipeVersionProjectionSchema = z
  .object({
    definitionId: identifierSchema,
    versionId: identifierSchema,
    versionNumber: z.number().int().positive(),
    key: slugSchema,
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    category: recipeJobCategorySchema,
    workstationType: workstationTypeSchema,
    ingredients: z.array(recipeVersionIngredientProjectionSchema).min(1).max(12),
    output: z
      .object({
        itemId: identifierSchema,
        itemSlug: slugSchema,
        itemName: safeTextSchema(1, 80),
        quantityPerBatch: z.number().int().min(1).max(10_000),
        assetRef: slugSchema.nullable(),
        assetReadiness: z.enum(['approved', 'development_marker', 'missing']),
      })
      .strict(),
    productionDurationSeconds: z.number().int().min(1).max(2_592_000),
    localDurationSeconds: z.number().int().min(1).max(3_600),
    dustFee: dustAmountSchema,
    unlockRule: z.enum([
      'starter',
      'phase11a_complete',
      'phase11b_tutorial_accepted',
      'phase11b_cooking_collected',
      'admin_grant_foundation',
      'seasonal_foundation',
      'level_foundation',
      'skill_foundation',
    ]),
    discoveryPolicy: z.enum(['hidden', 'visible_locked', 'visible_requirement']),
    unlocked: z.boolean(),
    lockedReason: safeTextSchema(1, 180).nullable(),
    tutorialEligible: z.boolean(),
    repeatable: z.boolean(),
    maximumBatchQuantity: z.number().int().min(1).max(99),
    maximumStartable: z.number().int().nonnegative().max(99),
    enabled: z.boolean(),
    configurationRevision: stateVersionSchema,
  })
  .strict();

export const craftingJobStatusSchema = z.enum([
  'pending',
  'running',
  'ready',
  'collecting',
  'collected',
  'canceled',
  'failed',
  'blocked',
]);

export const craftingJobSchema = z
  .object({
    id: identifierSchema,
    workstationInstanceId: identifierSchema,
    workstationDefinitionId: identifierSchema,
    recipeDefinitionId: identifierSchema,
    recipeVersionId: identifierSchema,
    recipeKey: slugSchema,
    recipeName: safeTextSchema(1, 80),
    recipeCategory: recipeJobCategorySchema,
    workstationType: workstationTypeSchema,
    quantity: z.number().int().min(1).max(99),
    status: craftingJobStatusSchema,
    startedAt: timestampSchema,
    completesAt: timestampSchema,
    collectedAt: timestampSchema.nullable(),
    ingredients: z
      .array(
        z
          .object({
            itemId: identifierSchema,
            itemSlug: slugSchema,
            itemName: safeTextSchema(1, 80),
            quantity: z.number().int().min(1).max(10_000),
            consumed: z.literal(true),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    output: z
      .object({
        itemSlug: slugSchema,
        itemName: safeTextSchema(1, 80),
        quantity: z.number().int().min(1).max(10_000),
      })
      .strict(),
    durationSeconds: z.number().int().min(1).max(2_592_000),
    remainingSeconds: z.number().int().nonnegative().max(2_592_000),
    progress: z.number().min(0).max(1),
    dustFee: dustAmountSchema,
    stateVersion: stateVersionSchema,
    failureCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{2,79}$/u)
      .nullable(),
    updatedAt: timestampSchema,
  })
  .strict();

export const workstationTutorialObjectiveKeySchema = z.enum([
  'speak_with_guide',
  'unlock_cooking_recipe',
  'collect_cooked_item',
  'unlock_crafting_recipe',
  'collect_crafted_item',
  'return_to_guide',
  'receive_reward',
]);

export const workstationTutorialSchema = z
  .object({
    definitionId: identifierSchema,
    versionId: identifierSchema,
    instanceId: identifierSchema.nullable(),
    key: slugSchema,
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    eligible: z.boolean(),
    status: z.enum(['locked', 'available', 'active', 'reward_claimed']),
    objectives: z
      .array(
        z
          .object({
            key: workstationTutorialObjectiveKeySchema,
            label: safeTextSchema(1, 120),
            current: z.number().int().nonnegative().max(10_000),
            required: z.number().int().positive().max(10_000),
            completed: z.boolean(),
          })
          .strict(),
      )
      .length(7),
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

export const workstationLiveOpsSchema = z
  .object({
    cookingStartsEnabled: z.boolean(),
    craftingStartsEnabled: z.boolean(),
    collectionEnabled: z.boolean(),
    tutorialUnlocksEnabled: z.boolean(),
    tutorialRewardsEnabled: z.boolean(),
    dustFeesEnabled: z.boolean(),
    useLocalDurations: z.boolean(),
    maintenanceMessage: safeTextSchema(0, 280).nullable(),
    configurationRevision: stateVersionSchema,
  })
  .strict();

export const workstationWorkspaceSchema = z
  .object({
    workstation: playerWorkstationSchema,
    recipes: z.array(recipeVersionProjectionSchema).max(100),
    jobs: z.array(craftingJobSchema).max(25),
    inventory: inventorySchema,
    dust: dustAccountSchema,
    tutorial: workstationTutorialSchema,
    liveOps: workstationLiveOpsSchema,
    serverTime: timestampSchema,
  })
  .strict();

export const startCraftingJobRequestSchema = z
  .object({
    workstationInstanceId: identifierSchema,
    recipeVersionId: identifierSchema,
    quantity: z.number().int().min(1).max(99),
    expectedInventoryStateVersion: stateVersionSchema,
    expectedDustStateVersion: stateVersionSchema,
    expectedWorkstationStateVersion: stateVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const collectCraftingJobRequestSchema = z
  .object({
    workstationInstanceId: identifierSchema,
    craftingJobId: identifierSchema,
    expectedJobStateVersion: stateVersionSchema,
    expectedInventoryStateVersion: stateVersionSchema,
    expectedWorkstationStateVersion: stateVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const workstationJobMutationResponseSchema = z
  .object({
    job: craftingJobSchema,
    workspace: workstationWorkspaceSchema,
    replayed: z.boolean(),
    announcement: safeTextSchema(1, 180),
  })
  .strict();

export const workstationTutorialMutationResponseSchema = z
  .object({
    view: workstationTutorialSchema,
    replayed: z.boolean(),
    announcement: safeTextSchema(1, 180),
  })
  .strict();

export const workstationAdminSummarySchema = z
  .object({
    contentVersion: contentVersionSchema.optional(),
    settings: workstationLiveOpsSchema,
    workstations: z.array(z.record(z.string(), z.unknown())).max(20),
    recipes: z.array(z.record(z.string(), z.unknown())).max(250),
    jobs: z.array(z.record(z.string(), z.unknown())).max(100),
    telemetry: z.record(z.string(), z.unknown()),
    audit: z.array(z.record(z.string(), z.unknown())).max(50),
  })
  .strict();

export const adminPlayerCraftingSchema = z
  .object({
    tutorial: workstationTutorialSchema,
    workstations: z.array(playerWorkstationSchema).max(8),
    jobs: z.array(craftingJobSchema).max(50),
    pendingReconciliationCount: z.number().int().nonnegative(),
  })
  .strict();

export const updateWorkstationLiveOpsInputSchema = workstationLiveOpsSchema
  .omit({ configurationRevision: true })
  .extend({
    expectedRevision: stateVersionSchema,
    reason: safeTextSchema(12, 500),
  })
  .strict();
export const updateWorkstationLiveOpsResultSchema = z
  .object({ settings: workstationLiveOpsSchema, replayed: z.boolean() })
  .strict();

export const updateWorkstationDefinitionInputSchema = z
  .object({
    expectedConfigurationRevision: stateVersionSchema,
    displayName: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    queueCapacity: z.number().int().min(1).max(8),
    interactionRadius: z.number().min(1).max(4),
    enabled: z.boolean(),
    reason: safeTextSchema(12, 500),
  })
  .strict();
export const updateWorkstationDefinitionResultSchema = z
  .object({ workstation: z.record(z.string(), z.unknown()), replayed: z.boolean() })
  .strict();

export const createRecipeSuccessorInputSchema = z
  .object({
    recipeDefinitionId: identifierSchema,
    expectedVersionId: identifierSchema,
    expectedConfigurationRevision: stateVersionSchema,
    name: safeTextSchema(1, 80),
    description: safeTextSchema(1, 280),
    workstationType: workstationTypeSchema,
    outputItemId: identifierSchema,
    outputQuantity: z.number().int().min(1).max(10_000),
    productionDurationSeconds: z.number().int().min(1).max(2_592_000),
    localDurationSeconds: z.number().int().min(1).max(3_600),
    dustFee: dustAmountSchema,
    unlockRule: recipeVersionProjectionSchema.shape.unlockRule,
    discoveryPolicy: recipeVersionProjectionSchema.shape.discoveryPolicy,
    tutorialEligible: z.boolean(),
    repeatable: z.boolean(),
    maximumBatchQuantity: z.number().int().min(1).max(99),
    enabled: z.boolean(),
    ingredients: z
      .array(
        z
          .object({ itemId: identifierSchema, quantity: z.number().int().min(1).max(10_000) })
          .strict(),
      )
      .min(1)
      .max(12),
    reason: safeTextSchema(12, 500),
  })
  .strict();
export const createRecipeSuccessorResultSchema = z
  .object({ recipe: z.record(z.string(), z.unknown()), replayed: z.boolean() })
  .strict();

export const requestCraftingReconciliationInputSchema = z
  .object({ reason: safeTextSchema(12, 500) })
  .strict();
export const requestCraftingReconciliationResultSchema = z
  .object({ request: z.record(z.string(), z.unknown()), replayed: z.boolean() })
  .strict();

export type PlayerWorkstation = z.infer<typeof playerWorkstationSchema>;
export type RecipeVersionProjection = z.infer<typeof recipeVersionProjectionSchema>;
export type CraftingJob = z.infer<typeof craftingJobSchema>;
export type WorkstationWorkspace = z.infer<typeof workstationWorkspaceSchema>;
export type WorkstationTutorial = z.infer<typeof workstationTutorialSchema>;
export type StartCraftingJobRequest = z.infer<typeof startCraftingJobRequestSchema>;
export type CollectCraftingJobRequest = z.infer<typeof collectCraftingJobRequestSchema>;
export type WorkstationJobMutationResponse = z.infer<typeof workstationJobMutationResponseSchema>;
export type WorkstationTutorialMutationResponse = z.infer<
  typeof workstationTutorialMutationResponseSchema
>;
export type WorkstationAdminSummary = z.infer<typeof workstationAdminSummarySchema>;
export type AdminPlayerCrafting = z.infer<typeof adminPlayerCraftingSchema>;
export type UpdateWorkstationLiveOpsInput = z.infer<typeof updateWorkstationLiveOpsInputSchema>;
export type UpdateWorkstationLiveOpsResult = z.infer<typeof updateWorkstationLiveOpsResultSchema>;
export type UpdateWorkstationDefinitionInput = z.infer<
  typeof updateWorkstationDefinitionInputSchema
>;
export type UpdateWorkstationDefinitionResult = z.infer<
  typeof updateWorkstationDefinitionResultSchema
>;
export type CreateRecipeSuccessorInput = z.infer<typeof createRecipeSuccessorInputSchema>;
export type CreateRecipeSuccessorResult = z.infer<typeof createRecipeSuccessorResultSchema>;
export type RequestCraftingReconciliationInput = z.infer<
  typeof requestCraftingReconciliationInputSchema
>;
export type RequestCraftingReconciliationResult = z.infer<
  typeof requestCraftingReconciliationResultSchema
>;
