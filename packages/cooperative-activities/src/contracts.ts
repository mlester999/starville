import { z } from 'zod';

import { dustAmountSchema, slugSchema } from '@starville/cozy-gameplay';
import { mapIdSchema } from '@starville/game-core';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const moduleKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/u);
const safeText = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => !/[<>\p{Cc}]/u.test(value));

export const ACTIVITY_PROTOCOL_VERSION = 1 as const;
export const ACTIVITY_CATALOG_LIMIT = 50 as const;
export const ACTIVITY_PARTICIPANT_LIMIT = 4 as const;
export const ACTIVITY_OBJECT_LIMIT = 40 as const;
export const ACTIVITY_OBJECTIVE_LIMIT = 16 as const;

export const cooperativeActivityLifecycleSchema = z.enum([
  'draft',
  'validated',
  'in_review',
  'published',
  'superseded',
  'disabled',
]);
export type CooperativeActivityLifecycle = z.infer<typeof cooperativeActivityLifecycleSchema>;

export const cooperativeObjectiveTypeSchema = z.enum([
  'shared_interact_count',
  'shared_collect_count',
  'shared_plant_count',
  'shared_water_count',
  'timed_wait',
  'shared_harvest_count',
  'shared_deliver_count',
  'all_members_present',
  'all_members_interact',
  'sequence_complete',
]);
export type CooperativeObjectiveType = z.infer<typeof cooperativeObjectiveTypeSchema>;

export const cooperativeObjectiveDefinitionSchema = z
  .object({
    key: slugSchema,
    label: safeText(3, 80),
    description: safeText(3, 240),
    type: cooperativeObjectiveTypeSchema,
    target: z.number().int().min(1).max(100),
    timeLimitSeconds: z.number().int().min(5).max(900).nullable(),
    allowedInteractionKey: slugSchema.nullable(),
    nextObjectiveKey: slugSchema.nullable(),
    contributionPolicy: z.literal('shared_equal'),
    completionPolicy: z.enum(['party_total', 'server_timer']),
  })
  .strict()
  .superRefine((objective, context) => {
    const timed = objective.type === 'timed_wait';
    if (timed !== (objective.completionPolicy === 'server_timer')) {
      context.addIssue({
        code: 'custom',
        path: ['completionPolicy'],
        message: 'Only timed waits use server timer completion',
      });
    }
    if (timed !== (objective.timeLimitSeconds !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['timeLimitSeconds'],
        message: 'Timed waits require one bounded server duration',
      });
    }
    if (timed === (objective.allowedInteractionKey !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['allowedInteractionKey'],
        message: 'Interactive objectives require one closed interaction key',
      });
    }
  });

export const cooperativeRewardItemSchema = z
  .object({ itemSlug: slugSchema, quantity: z.number().int().min(1).max(20) })
  .strict();

export const cooperativeRewardDefinitionSchema = z
  .object({
    dust: dustAmountSchema.max(1_000),
    items: z.array(cooperativeRewardItemSchema).max(4),
    minimumContribution: z.number().int().min(0).max(100),
  })
  .strict();

const cooperativeActivityVersionBaseSchema = z
  .object({
    versionId: uuidSchema,
    activityKey: slugSchema,
    name: safeText(3, 80),
    shortDescription: safeText(3, 180),
    longDescription: safeText(3, 1_000),
    category: z.literal('cozy_cooperative'),
    status: cooperativeActivityLifecycleSchema,
    minimumPartySize: z.number().int().min(2).max(ACTIVITY_PARTICIPANT_LIMIT),
    maximumPartySize: z.number().int().min(2).max(ACTIVITY_PARTICIPANT_LIMIT),
    recommendedLevel: z.number().int().min(1).max(999),
    durationSeconds: z.number().int().min(60).max(3_600),
    reconnectGraceSeconds: z.number().int().min(15).max(600),
    waitingForPlayersSeconds: z.number().int().min(15).max(600),
    entryWorldId: mapIdSchema,
    entryWorldName: safeText(3, 120),
    entryInteractionKey: slugSchema,
    sceneRef: slugSchema,
    objectives: z.array(cooperativeObjectiveDefinitionSchema).min(2).max(ACTIVITY_OBJECTIVE_LIMIT),
    reward: cooperativeRewardDefinitionSchema,
    entryCooldownSeconds: z.number().int().min(0).max(86_400),
    rewardCooldownSeconds: z.number().int().min(0).max(604_800),
    dailyRewardLimit: z.number().int().min(0).max(20),
    requiredModules: z.array(moduleKeySchema).min(1).max(12),
    requiredAssets: z.array(slugSchema).max(40),
    contentVersion: z.number().int().positive(),
    revision: z.number().int().positive(),
    publishedAt: timestampSchema.nullable(),
  })
  .strict();

function validateActivityVersion(
  activity: z.infer<typeof cooperativeActivityVersionBaseSchema>,
  context: z.RefinementCtx,
): void {
  if (activity.minimumPartySize > activity.maximumPartySize) {
    context.addIssue({
      code: 'custom',
      path: ['minimumPartySize'],
      message: 'Minimum party size cannot exceed maximum party size',
    });
  }
  const keys = activity.objectives.map((objective) => objective.key);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: 'custom',
      path: ['objectives'],
      message: 'Objective keys must be unique',
    });
  }
  activity.objectives.forEach((objective, index) => {
    const expectedNext = activity.objectives[index + 1]?.key ?? null;
    if (objective.nextObjectiveKey !== expectedNext) {
      context.addIssue({
        code: 'custom',
        path: ['objectives', index, 'nextObjectiveKey'],
        message: 'Objective sequence must be contiguous and closed',
      });
    }
  });
}

export const cooperativeActivityVersionSchema =
  cooperativeActivityVersionBaseSchema.superRefine(validateActivityVersion);
export type CooperativeActivityVersion = z.infer<typeof cooperativeActivityVersionSchema>;

export const cooperativeActivityAvailabilitySchema = z.enum([
  'available',
  'module_disabled',
  'maintenance',
  'party_required',
  'leader_required',
  'party_size',
  'not_ready',
  'cooldown',
  'daily_limit',
  'already_active',
  'unavailable',
]);

export const cooperativeActivityCatalogEntrySchema = z
  .object({
    activity: cooperativeActivityVersionSchema,
    availability: cooperativeActivityAvailabilitySchema,
    availableAt: timestampSchema.nullable(),
    rewardedCompletionsToday: z.number().int().nonnegative().max(100),
    partyEligible: z.boolean(),
    leader: z.boolean(),
  })
  .strict();
export type CooperativeActivityCatalogEntry = z.infer<typeof cooperativeActivityCatalogEntrySchema>;

export const cooperativeActivityCatalogSchema = z
  .object({
    generatedAt: timestampSchema,
    activities: z.array(cooperativeActivityCatalogEntrySchema).max(ACTIVITY_CATALOG_LIMIT),
  })
  .strict();
export type CooperativeActivityCatalog = z.infer<typeof cooperativeActivityCatalogSchema>;

export const cooperativeActivityObjectSchema = z
  .object({
    key: slugSchema,
    interactionKey: slugSchema,
    label: safeText(3, 80),
    objectType: z.enum(['supply', 'plot', 'crop', 'delivery']),
    x: z.number().finite().min(0).max(128),
    y: z.number().finite().min(0).max(128),
    interactionRange: z.number().positive().max(4),
    active: z.boolean(),
  })
  .strict();
export type CooperativeActivityObject = z.infer<typeof cooperativeActivityObjectSchema>;

export const cooperativeActivityParticipantSchema = z
  .object({
    presenceId: uuidSchema,
    displayName: safeText(3, 20),
    level: z.number().int().min(1).max(999),
    connectionStatus: z.enum(['online', 'reconnecting', 'offline', 'removed']),
    contribution: z.number().int().nonnegative().max(10_000),
    rewardEligible: z.boolean(),
    reconnectDeadline: timestampSchema.nullable(),
  })
  .strict();

export const cooperativeActivityObjectiveProgressSchema = z
  .object({
    key: slugSchema,
    label: safeText(3, 80),
    type: cooperativeObjectiveTypeSchema,
    current: z.number().int().nonnegative().max(10_000),
    target: z.number().int().positive().max(10_000),
    status: z.enum(['pending', 'active', 'completed', 'expired']),
    startedAt: timestampSchema.nullable(),
    completedAt: timestampSchema.nullable(),
    timerEndsAt: timestampSchema.nullable(),
  })
  .strict();

export const cooperativeRewardReceiptSchema = z
  .object({
    receiptId: uuidSchema,
    status: z.enum(['settled', 'pending_inventory', 'ineligible']),
    dust: dustAmountSchema,
    items: z.array(cooperativeRewardItemSchema).max(4),
    settledAt: timestampSchema,
    dailyRewardNumber: z.number().int().nonnegative().max(100),
  })
  .strict();
export type CooperativeRewardReceipt = z.infer<typeof cooperativeRewardReceiptSchema>;

export const cooperativeActivityInstanceStatusSchema = z.enum([
  'preparing',
  'waiting_for_players',
  'active',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'expired',
  'abandoned',
]);

export const cooperativeActivityInstanceSnapshotSchema = z
  .object({
    instanceId: uuidSchema,
    activity: cooperativeActivityVersionSchema,
    status: cooperativeActivityInstanceStatusSchema,
    revision: z.number().int().positive(),
    currentObjectiveKey: slugSchema.nullable(),
    objectives: z.array(cooperativeActivityObjectiveProgressSchema).max(ACTIVITY_OBJECTIVE_LIMIT),
    participants: z
      .array(cooperativeActivityParticipantSchema)
      .min(1)
      .max(ACTIVITY_PARTICIPANT_LIMIT),
    objects: z.array(cooperativeActivityObjectSchema).max(ACTIVITY_OBJECT_LIMIT),
    personalContribution: z.number().int().nonnegative().max(10_000),
    temporaryItemCount: z.number().int().nonnegative().max(1_000),
    startedAt: timestampSchema.nullable(),
    expiresAt: timestampSchema,
    pausedAt: timestampSchema.nullable(),
    completedAt: timestampSchema.nullable(),
    resultCode: safeText(1, 64).nullable(),
    receipts: z.array(cooperativeRewardReceiptSchema).max(ACTIVITY_PARTICIPANT_LIMIT),
    spawn: z.object({ x: z.number().min(0).max(128), y: z.number().min(0).max(128) }).strict(),
  })
  .strict();
export type CooperativeActivityInstanceSnapshot = z.infer<
  typeof cooperativeActivityInstanceSnapshotSchema
>;

export const cooperativeActivityPreparationSchema = z
  .object({
    preparationId: uuidSchema,
    activity: cooperativeActivityVersionSchema,
    partyRevision: z.number().int().positive(),
    readyCheckId: uuidSchema,
    status: z.enum(['ready_check', 'ready', 'entered', 'cancelled', 'expired', 'invalidated']),
    expiresAt: timestampSchema,
    responses: z
      .array(
        z
          .object({
            presenceId: uuidSchema,
            displayName: safeText(3, 20),
            state: z.enum(['waiting', 'ready', 'not_ready', 'disconnected']),
          })
          .strict(),
      )
      .max(ACTIVITY_PARTICIPANT_LIMIT),
  })
  .strict();

export const cooperativeActivityBootstrapSchema = z
  .object({
    catalog: cooperativeActivityCatalogSchema,
    preparation: cooperativeActivityPreparationSchema.nullable(),
    instance: cooperativeActivityInstanceSnapshotSchema.nullable(),
  })
  .strict();
export type CooperativeActivityBootstrap = z.infer<typeof cooperativeActivityBootstrapSchema>;

export const cooperativeActivityErrorCodeSchema = z.enum([
  'activity_unavailable',
  'party_required',
  'leader_required',
  'party_changed',
  'party_size',
  'not_ready',
  'already_active',
  'entry_conflict',
  'objective_changed',
  'invalid_object',
  'out_of_range',
  'not_participant',
  'activity_expired',
  'cooldown',
  'daily_limit',
  'rate_limited',
  'maintenance',
  'access_changed',
  'persistence_unavailable',
]);
export type CooperativeActivityErrorCode = z.infer<typeof cooperativeActivityErrorCodeSchema>;

export const cooperativeActivityOperationResultSchema = z
  .object({
    status: safeText(1, 64),
    bootstrap: cooperativeActivityBootstrapSchema.optional(),
    snapshot: cooperativeActivityInstanceSnapshotSchema.optional(),
    preparation: cooperativeActivityPreparationSchema.optional(),
    affectedPresenceIds: z.array(uuidSchema).max(ACTIVITY_PARTICIPANT_LIMIT).optional(),
  })
  .strict();
export type CooperativeActivityOperationResult = z.infer<
  typeof cooperativeActivityOperationResultSchema
>;

export const cooperativeActivityInteractionIntentSchema = z
  .object({
    instanceId: uuidSchema,
    expectedRevision: z.number().int().positive(),
    objectiveKey: slugSchema,
    objectKey: slugSchema,
  })
  .strict();

export const cooperativeActivityEditorInputSchema = cooperativeActivityVersionBaseSchema
  .omit({ versionId: true, status: true, revision: true, publishedAt: true })
  .strict()
  .superRefine((activity, context) =>
    validateActivityVersion(
      {
        ...activity,
        versionId: '00000000-0000-4000-8000-000000000000',
        status: 'draft',
        revision: 1,
        publishedAt: null,
      },
      context,
    ),
  );
export type CooperativeActivityEditorInput = z.infer<typeof cooperativeActivityEditorInputSchema>;

const adminPageFields = {
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.union([z.literal(10), z.literal(50), z.literal(100)]),
} as const;

export const adminCooperativeActivityInstanceRowSchema = z
  .object({
    instanceId: uuidSchema,
    activityKey: slugSchema,
    activityName: safeText(3, 80),
    partyId: uuidSchema,
    status: cooperativeActivityInstanceStatusSchema,
    revision: z.number().int().positive(),
    participantCount: z.number().int().min(1).max(ACTIVITY_PARTICIPANT_LIMIT),
    currentObjectiveKey: slugSchema.nullable(),
    startedAt: timestampSchema.nullable(),
    expiresAt: timestampSchema,
    completedAt: timestampSchema.nullable(),
    resultCode: safeText(1, 64).nullable(),
  })
  .strict();

export const adminCooperativeActivityRewardRowSchema = z
  .object({
    receiptId: uuidSchema,
    completionId: uuidSchema,
    instanceId: uuidSchema,
    presenceId: uuidSchema,
    displayName: safeText(3, 20),
    status: z.enum(['settled', 'pending_inventory', 'ineligible']),
    dust: dustAmountSchema,
    settledAt: timestampSchema,
    dailyRewardNumber: z.number().int().nonnegative().max(100),
  })
  .strict();

export const adminCooperativeActivityAuditRowSchema = z
  .object({
    entryNumber: z.number().int().positive(),
    instanceId: uuidSchema.nullable(),
    versionId: uuidSchema.nullable(),
    action: safeText(1, 80),
    result: safeText(1, 64),
    revision: z.number().int().positive().nullable(),
    createdAt: timestampSchema,
    details: z.record(z.string(), z.unknown()),
  })
  .strict();

export const adminCooperativeActivityListSchema = z.discriminatedUnion('view', [
  z
    .object({
      view: z.literal('catalog'),
      rows: z.array(cooperativeActivityVersionSchema).max(100),
      ...adminPageFields,
    })
    .strict(),
  z
    .object({
      view: z.literal('instances'),
      rows: z.array(adminCooperativeActivityInstanceRowSchema).max(100),
      ...adminPageFields,
    })
    .strict(),
  z
    .object({
      view: z.literal('rewards'),
      rows: z.array(adminCooperativeActivityRewardRowSchema).max(100),
      ...adminPageFields,
    })
    .strict(),
  z
    .object({
      view: z.literal('audit'),
      rows: z.array(adminCooperativeActivityAuditRowSchema).max(100),
      ...adminPageFields,
    })
    .strict(),
]);
export type AdminCooperativeActivityList = z.infer<typeof adminCooperativeActivityListSchema>;

export const adminCooperativeActivityInstanceDetailSchema = z
  .object({
    status: z.literal('loaded'),
    instance: cooperativeActivityInstanceSnapshotSchema,
    audit: z
      .array(adminCooperativeActivityAuditRowSchema.omit({ instanceId: true, versionId: true }))
      .max(100),
  })
  .strict();
export type AdminCooperativeActivityInstanceDetail = z.infer<
  typeof adminCooperativeActivityInstanceDetailSchema
>;

export const cooperativeActivitySettingsSchema = z
  .object({
    moduleEnabled: z.boolean(),
    publicQueueEnabled: z.literal(false),
    allowExistingInstancesToFinish: z.boolean(),
    maximumActiveInstances: z.number().int().min(1).max(1_000),
    maximumFailedAttemptsPerHour: z.number().int().min(1).max(60),
    maximumPartyCreationsPerHour: z.number().int().min(1).max(60),
    version: z.number().int().positive(),
    updatedAt: timestampSchema,
  })
  .strict();
export type CooperativeActivitySettings = z.infer<typeof cooperativeActivitySettingsSchema>;

export const updateCooperativeActivitySettingsSchema = cooperativeActivitySettingsSchema
  .pick({
    moduleEnabled: true,
    allowExistingInstancesToFinish: true,
    maximumActiveInstances: true,
    maximumFailedAttemptsPerHour: true,
    maximumPartyCreationsPerHour: true,
  })
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
export type UpdateCooperativeActivitySettings = z.infer<
  typeof updateCooperativeActivitySettingsSchema
>;

export const cooperativeActivityPreviewSchema = z
  .object({
    status: z.literal('preview'),
    previewMode: z.literal(true),
    persistent: z.literal(false),
    rewardsSettled: z.literal(false),
    activity: cooperativeActivityVersionSchema,
    simulationStep: z.number().int().min(0).max(ACTIVITY_OBJECTIVE_LIMIT),
    currentObjectiveKey: slugSchema,
  })
  .strict();
export type CooperativeActivityPreview = z.infer<typeof cooperativeActivityPreviewSchema>;

export const cooperativeActivityLifecycleActionSchema = z.enum([
  'validate',
  'submit_review',
  'publish',
  'disable',
]);
