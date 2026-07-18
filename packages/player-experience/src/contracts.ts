import { z } from 'zod';

const timestamp = z.iso.datetime({ offset: true });
const safeKey = z.string().regex(/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u);

export const STARVILLE_CORE_ONBOARDING_VERSION = 'starville_core_onboarding_v1' as const;
export const STARVILLE_DAILY_POLICY_VERSION = 'starville_daily_rhythm_v1' as const;

export const onboardingStatusSchema = z.enum([
  'not_started',
  'active',
  'paused',
  'completed',
  'skipped',
  'migrated',
  'blocked',
]);

export const onboardingChapterKeySchema = z.enum([
  'welcome',
  'your_home',
  'first_harvest',
  'make_something',
  'general_store',
  'grow_your_starvillian',
  'make_it_home',
  'starville_together',
  'daily_rhythm',
]);

export const onboardingStepKeySchema = z.enum([
  'enter_lantern_square',
  'practice_movement',
  'interact_with_guide',
  'enter_personal_home',
  'inspect_inventory',
  'plant_first_crop',
  'water_first_crop',
  'harvest_first_crop',
  'collect_first_recipe',
  'complete_store_transaction',
  'review_progression',
  'save_first_layout',
  'review_home_visits',
  'complete_daily_objective',
]);

export const guidanceTargetKeySchema = z.enum([
  'location.lantern_square_spawn',
  'interactable.willow_guide',
  'interactable.home_entrance',
  'interactable.farm_plot',
  'interactable.cooking_hearth',
  'interactable.crafting_workbench',
  'interactable.general_store',
  'control.progression',
  'control.decoration_mode',
  'control.home_visits',
  'control.daily_rhythm',
]);

export const feedbackPrioritySchema = z.enum([
  'critical',
  'action_required',
  'progress',
  'social',
  'informational',
]);

export const feedbackEventSchema = z
  .object({
    eventNumber: z.number().int().positive(),
    eventKey: safeKey,
    priority: feedbackPrioritySchema,
    title: z.string().min(2).max(100),
    message: z.string().min(2).max(280),
    relatedEntityId: z.uuid().nullable(),
    createdAt: timestamp,
  })
  .strict();

export const guidanceTargetSchema = z
  .object({
    key: guidanceTargetKeySchema,
    label: z.string().min(2).max(80),
    semanticObjectKey: z.string().min(2).max(120),
    worldKey: z.string().min(2).max(120),
    status: z.enum(['ready', 'fallback', 'missing', 'unavailable']),
    severity: z.enum(['blocking', 'warning', 'optional']),
    distance: z.number().nonnegative().max(10_000).nullable(),
    routeHint: z.string().min(2).max(180),
    accessibleHint: z.string().min(2).max(240),
  })
  .strict();

export const onboardingStepSchema = z
  .object({
    key: onboardingStepKeySchema,
    chapter: onboardingChapterKeySchema,
    title: z.string().min(2).max(100),
    instruction: z.string().min(2).max(240),
    progress: z.number().int().nonnegative(),
    required: z.number().int().positive(),
    status: z.enum(['locked', 'available', 'active', 'completed', 'skipped', 'blocked']),
    optional: z.boolean(),
    completedAt: timestamp.nullable(),
    evidenceEventKey: safeKey.nullable(),
    guidanceTarget: guidanceTargetKeySchema.nullable(),
    recoveryHint: z.string().min(2).max(240),
  })
  .strict();

export const activeObjectiveSchema = z
  .object({
    source: z.enum(['onboarding', 'daily']),
    key: safeKey,
    title: z.string().min(2).max(100),
    instruction: z.string().min(2).max(240),
    progress: z.number().int().nonnegative(),
    required: z.number().int().positive(),
    guidanceTarget: guidanceTargetKeySchema.nullable(),
    routeHint: z.string().min(2).max(180),
  })
  .strict();

export const dailyObjectiveCategorySchema = z.enum([
  'farming',
  'production',
  'general_store',
  'progression',
  'housing',
  'social',
]);

export const dailyObjectiveSchema = z
  .object({
    assignmentId: z.uuid(),
    objectiveKey: safeKey,
    category: dailyObjectiveCategorySchema,
    title: z.string().min(2).max(100),
    description: z.string().min(2).max(240),
    progress: z.number().int().nonnegative(),
    required: z.number().int().positive(),
    status: z.enum(['active', 'completed', 'settled', 'blocked']),
    soloSafe: z.boolean(),
    rewardLabel: z.string().min(2).max(100),
    completedAt: timestamp.nullable(),
    settledAt: timestamp.nullable(),
    guidanceTarget: guidanceTargetKeySchema.nullable(),
  })
  .strict();

export const dailyRhythmSchema = z
  .object({
    policyVersion: z.literal(STARVILLE_DAILY_POLICY_VERSION),
    gameDayKey: z.iso.date(),
    timezone: z.literal('UTC'),
    resetAt: timestamp,
    assignmentRevision: z.number().int().positive(),
    objectives: z.array(dailyObjectiveSchema).length(3),
    completedCount: z.number().int().min(0).max(3),
    completionBonus: z
      .object({
        status: z.enum(['locked', 'ready', 'settled']),
        rewardLabel: z.string().min(2).max(100),
        settledAt: timestamp.nullable(),
      })
      .strict(),
  })
  .strict();

export const guideEntrySchema = z
  .object({
    key: safeKey,
    title: z.string().min(2).max(80),
    summary: z.string().min(8).max(400),
    unlocked: z.boolean(),
    publicDocumentationPath: z.string().startsWith('/').max(160).nullable(),
  })
  .strict();

export const playerExperienceWorkspaceSchema = z
  .object({
    onboarding: z
      .object({
        version: z.literal(STARVILLE_CORE_ONBOARDING_VERSION),
        status: onboardingStatusSchema,
        currentChapter: onboardingChapterKeySchema,
        currentStep: onboardingStepKeySchema,
        revision: z.number().int().positive(),
        startedAt: timestamp.nullable(),
        lastProgressedAt: timestamp.nullable(),
        completedAt: timestamp.nullable(),
        skippedAt: timestamp.nullable(),
        migratedExistingPlayer: z.boolean(),
        rewardSettlementState: z.enum(['not_ready', 'pending', 'settled', 'blocked']),
        steps: z.array(onboardingStepSchema).length(14),
      })
      .strict(),
    activeObjective: activeObjectiveSchema.nullable(),
    daily: dailyRhythmSchema,
    guidanceTargets: z.array(guidanceTargetSchema).max(20),
    guide: z.array(guideEntrySchema).max(20),
    feedback: z.array(feedbackEventSchema).max(20),
    feedbackCursor: z.number().int().nonnegative(),
    guidePreferences: z
      .object({
        minimized: z.boolean(),
        reducedGuidance: z.boolean(),
        revision: z.number().int().positive(),
      })
      .strict(),
    starterQuestline: z
      .object({
        chainKey: z.literal('starville-beginnings'),
        version: z.number().int().positive(),
        canonicalQuestCount: z.number().int().min(1).max(20),
        completedQuestCount: z.number().int().min(0).max(20),
      })
      .strict(),
    persistence: z.enum(['normal', 'game_test']),
    serverTime: timestamp,
  })
  .strict();
export type PlayerExperienceWorkspace = z.infer<typeof playerExperienceWorkspaceSchema>;

const expectedRevisionSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
export const onboardingStartSchema = expectedRevisionSchema.extend({
  idempotencyKey: z.string().min(16).max(128),
});
export const onboardingPreferenceSchema = expectedRevisionSchema.extend({
  minimized: z.boolean(),
  reducedGuidance: z.boolean(),
});
export const onboardingSkipSchema = expectedRevisionSchema.extend({
  optionalOnly: z.literal(true),
  reason: z.string().trim().min(3).max(160),
});
export const onboardingAcknowledgeSchema = expectedRevisionSchema.extend({
  stepKey: z.enum(['inspect_inventory', 'review_progression', 'review_home_visits']),
  idempotencyKey: z.string().min(16).max(128),
});
export const onboardingRecoverySchema = expectedRevisionSchema.extend({
  reasonCode: z.enum([
    'starter_seed_missing',
    'inventory_full',
    'crop_target_invalid',
    'starter_recipe_unavailable',
    'shop_unavailable',
    'guidance_target_missing',
    'state_out_of_sync',
  ]),
  idempotencyKey: z.string().min(16).max(128),
});
export const dailyRefreshSchema = z
  .object({
    expectedAssignmentRevision: z.number().int().positive(),
    idempotencyKey: z.string().min(16).max(128),
  })
  .strict();
