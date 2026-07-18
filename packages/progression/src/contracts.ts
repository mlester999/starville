import { z } from 'zod';

const timestamp = z.iso.datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();
const safeKey = z.string().regex(/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u);

export const progressionSkillKeySchema = z.enum([
  'farming',
  'cooking',
  'crafting',
  'foraging',
  'fishing',
  'animal_care',
  'social',
  'exploration',
]);

export const progressionLevelSchema = z
  .object({
    level: z.number().int().min(1).max(50),
    totalXp: z.number().int().nonnegative(),
    xpInLevel: z.number().int().nonnegative(),
    xpForNextLevel: z.number().int().positive().nullable(),
    maximumLevel: z.number().int().min(2).max(50),
    revision: z.number().int().positive(),
  })
  .strict();

const nextUnlockSchema = z
  .object({
    unlockKey: safeKey,
    displayName: z.string().min(2).max(80),
    requiredLevel: z.number().int().min(1).max(50),
    visible: z.boolean(),
  })
  .strict();

export const progressionSkillSchema = z
  .object({
    skillId: z.uuid(),
    skillKey: progressionSkillKeySchema,
    displayName: z.string().min(2).max(40),
    description: z.string().min(8).max(280),
    iconRef: safeKey,
    category: z.enum(['gathering', 'production', 'social', 'exploration']),
    released: z.boolean(),
    enabled: z.boolean(),
    level: z.number().int().min(1).max(50),
    totalXp: z.number().int().nonnegative(),
    xpInLevel: z.number().int().nonnegative(),
    xpForNextLevel: z.number().int().positive().nullable(),
    maximumLevel: z.number().int().min(2).max(50),
    revision: z.number().int().positive(),
    recentUnlocks: z.array(z.string().min(2).max(80)).max(3),
    nextUnlocks: z.array(nextUnlockSchema).max(50),
  })
  .strict();

export const progressionUnlockSchema = z
  .object({
    unlockId: z.uuid(),
    unlockKey: safeKey,
    displayName: z.string().min(2).max(80),
    description: z.string().min(8).max(280),
    unlockType: z.enum([
      'recipe',
      'crop',
      'seed',
      'shop_catalog_entry',
      'quest',
      'achievement',
      'title',
      'badge',
      'cosmetic',
      'area_access',
      'home_upgrade_foundation',
      'feature',
      'inventory_capacity_foundation',
    ]),
    targetKey: safeKey.nullable(),
    owned: z.boolean(),
    grantedAt: nullableTimestamp,
    visibleBeforeUnlock: z.boolean(),
    requirementMet: z.boolean(),
    requiredSkillKey: progressionSkillKeySchema.nullable(),
    requiredSkillLevel: z.number().int().min(1).max(50).nullable(),
    requiredPlayerLevel: z.number().int().min(1).max(50).nullable(),
  })
  .strict();

const questObjectiveSchema = z
  .object({
    objectiveId: z.uuid(),
    objectiveKey: safeKey,
    label: z.string().min(2).max(160),
    currentCount: z.number().int().nonnegative(),
    requiredCount: z.number().int().positive(),
    completedAt: nullableTimestamp,
    targetKey: safeKey.nullable(),
  })
  .strict();

const questRewardSchema = z
  .object({
    rewardType: z.enum(['dust', 'item', 'unlock', 'title', 'badge', 'cosmetic_foundation']),
    displayLabel: z.string().min(2).max(100),
    amount: z.number().int().positive(),
  })
  .strict();

export const progressionQuestSchema = z
  .object({
    questDefinitionId: z.uuid(),
    questVersionId: z.uuid(),
    questInstanceId: z.uuid().nullable(),
    configurationRevision: z.number().int().positive(),
    questKind: z.enum([
      'farming_tutorial',
      'workstation_tutorial',
      'shop_tutorial',
      'progression_chapter',
    ]),
    questSlug: safeKey,
    name: z.string().min(2).max(100),
    description: z.string().min(8).max(500),
    status: z.enum(['available', 'active', 'reward_claimed']),
    stateVersion: z.number().int().positive(),
    tracked: z.boolean(),
    rewardState: z.enum(['not_ready', 'ready', 'pending', 'settled']),
    acceptedAt: nullableTimestamp,
    completedAt: nullableTimestamp,
    chain: z
      .object({ chainKey: safeKey, name: z.string().min(2).max(80), sequence: z.number().int() })
      .strict(),
    prerequisites: z
      .object({
        questDefinitionId: z.uuid().nullable(),
        playerLevel: z.number().int().min(1).max(50).nullable(),
        skillKey: progressionSkillKeySchema.nullable(),
        skillLevel: z.number().int().min(1).max(50).nullable(),
        met: z.boolean(),
      })
      .strict(),
    objectives: z.array(questObjectiveSchema).max(32),
    rewards: z.array(questRewardSchema).max(16),
  })
  .strict();

export const progressionAchievementSchema = z
  .object({
    achievementId: z.uuid(),
    achievementKey: safeKey,
    displayName: z.string().min(3).max(80),
    description: z.string().min(8).max(280),
    category: z.enum(['farming', 'cooking', 'crafting', 'economy', 'home', 'progression']),
    hidden: z.boolean(),
    progressVisible: z.boolean(),
    currentProgress: z.number().int().nonnegative().nullable(),
    target: z.number().int().positive().nullable(),
    status: z.enum(['locked', 'in_progress', 'completed', 'rewarded']),
    completedAt: nullableTimestamp,
    iconRef: safeKey,
  })
  .strict();

export const progressionTitleSchema = z
  .object({
    titleId: z.uuid(),
    titleKey: safeKey,
    displayName: z.string().min(2).max(40),
    description: z.string().min(8).max(200),
    rarity: z.enum(['common', 'uncommon', 'rare']),
    source: z.enum(['quest', 'achievement', 'unlock', 'admin_grant_foundation']),
    equipped: z.boolean(),
    grantedAt: timestamp,
  })
  .strict();

export const progressionBadgeSchema = z
  .object({
    badgeId: z.uuid(),
    badgeKey: safeKey,
    displayName: z.string().min(2).max(40),
    description: z.string().min(8).max(200),
    iconRef: safeKey,
    selected: z.boolean(),
    grantedAt: timestamp,
  })
  .strict();

export const progressionPendingRewardSchema = z
  .object({
    rewardId: z.uuid(),
    rewardType: z.enum(['dust', 'item', 'unlock', 'title', 'badge', 'cosmetic_foundation']),
    displayLabel: z.string().min(2).max(100),
    status: z.enum(['pending', 'settling', 'blocked']),
    failureCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{2,79}$/u)
      .nullable(),
    revision: z.number().int().positive(),
    createdAt: timestamp,
  })
  .strict();

export const progressionXpEventSchema = z
  .object({
    eventId: z.uuid(),
    skillKey: progressionSkillKeySchema.nullable(),
    xp: z.number().int().min(-10_000).max(10_000),
    playerXp: z.number().int().min(-10_000).max(10_000),
    sourceEvent: safeKey,
    previousLevel: z.number().int().min(1).max(50),
    resultingLevel: z.number().int().min(1).max(50),
    createdAt: timestamp,
  })
  .strict();

export const progressionWorkspaceSchema = z
  .object({
    playerLevel: progressionLevelSchema,
    skills: z.array(progressionSkillSchema).max(8),
    futureSkills: z
      .array(
        z
          .object({
            skillKey: progressionSkillKeySchema,
            displayName: z.string(),
            description: z.string(),
            released: z.literal(false),
            hidden: z.boolean(),
          })
          .strict(),
      )
      .max(8),
    unlocks: z.array(progressionUnlockSchema).max(500),
    quests: z
      .object({
        available: z.array(progressionQuestSchema).max(32),
        active: z.array(progressionQuestSchema).max(32),
        completed: z.array(progressionQuestSchema).max(50),
      })
      .strict(),
    achievements: z.array(progressionAchievementSchema).max(500),
    titles: z.array(progressionTitleSchema).max(500),
    badges: z.array(progressionBadgeSchema).max(500),
    preferencesRevision: z.number().int().positive(),
    pendingRewards: z.array(progressionPendingRewardSchema).max(100),
    recentXp: z.array(progressionXpEventSchema).max(50),
    lastEventNumber: z.number().int().nonnegative(),
    configurationVersion: z
      .object({
        schema: z.literal('phase11d'),
        skillCurve: z.number().int(),
        playerCurve: z.number().int(),
      })
      .strict(),
    serverTime: timestamp,
  })
  .strict();
export type ProgressionWorkspace = z.infer<typeof progressionWorkspaceSchema>;

export const progressionEventSchema = z
  .object({
    eventNumber: z.number().int().positive(),
    eventKey: z.enum([
      'skill_xp_gained',
      'skill_level_up',
      'player_level_up',
      'unlock_granted',
      'quest_progressed',
      'quest_completed',
      'achievement_progressed',
      'achievement_completed',
      'title_granted',
      'badge_granted',
      'reward_pending',
      'reward_settled',
      'progression_corrected',
    ]),
    relatedEntityId: z.uuid().nullable(),
    payload: z.record(z.string(), z.unknown()),
    createdAt: timestamp,
  })
  .strict();

export const progressionEventPageSchema = z
  .object({
    events: z.array(progressionEventSchema).max(50),
    lastEventNumber: z.number().int().nonnegative(),
  })
  .strict();

export const progressionQuestMutationSchema = z
  .object({
    questDefinitionId: z.uuid(),
    expectedConfigurationRevision: z.number().int().positive(),
    idempotencyKey: z
      .string()
      .min(16)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u),
  })
  .strict();

export const progressionQuestTrackSchema = z
  .object({
    tracked: z.boolean(),
    expectedStateVersion: z.number().int().positive(),
  })
  .strict();

export const progressionQuestCompleteSchema = z
  .object({
    expectedStateVersion: z.number().int().positive(),
    idempotencyKey: z
      .string()
      .min(16)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u),
  })
  .strict();

export const progressionIdentityMutationSchema = z
  .object({
    titleId: z.uuid().nullable(),
    badgeId: z.uuid().nullable(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const progressionRewardRetrySchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
