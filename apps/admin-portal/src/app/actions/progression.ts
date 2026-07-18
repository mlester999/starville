'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  activateProgressionCurve,
  applyProgressionCorrection,
  createProgressionCurveSuccessor,
  createProgressionSuccessor,
  requestProgressionCorrection,
  requestProgressionReconciliation,
  simulateProgression,
  transitionProgressionVersion,
  updateProgressionLiveOps,
  updateProgressionPresentation,
  validateProgressionCurve,
} from '../../lib/progression-api';

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
function checked(data: FormData, key: string): boolean {
  return data.get(key) === 'on';
}
function complete(notice: string): never {
  revalidatePath('/game-content/progression');
  redirect(`/game-content/progression?notice=${encodeURIComponent(notice)}`);
}

export async function progressionSimulationAction(data: FormData): Promise<void> {
  await requireAuthorizedAdmin('progression.curves.manage');
  const thresholds = field(data, 'thresholds')
    .split(',')
    .map((value) => Number(value.trim()));
  await simulateProgression(
    {
      thresholds,
      eventsPerDay: z.coerce.number().int().min(1).max(10_000).parse(field(data, 'eventsPerDay')),
      xpPerEvent: z.coerce.number().int().min(1).max(10_000).parse(field(data, 'xpPerEvent')),
      multiplier: z.coerce.number().min(0.5).max(2).parse(field(data, 'multiplier')),
      playerCount: z.coerce.number().int().min(1).max(1_000_000).parse(field(data, 'playerCount')),
    },
    randomUUID(),
  );
  complete('simulation-complete-no-player-migration');
}

export async function progressionCurveSuccessorAction(data: FormData): Promise<void> {
  await requireAuthorizedAdmin('progression.curves.manage');
  const values = field(data, 'thresholds')
    .split(',')
    .map((value) => Number(value.trim()));
  await createProgressionCurveSuccessor(
    {
      expectedVersionId: z.uuid().parse(field(data, 'expectedVersionId')),
      publicName: z.string().min(3).max(80).parse(field(data, 'publicName')),
      thresholds: values.map((cumulativeXp, index) => ({ level: index + 1, cumulativeXp })),
      reason: z.string().min(12).max(500).parse(field(data, 'reason')),
    },
    randomUUID(),
  );
  complete('curve-successor-created-as-draft');
}

export async function progressionCurveValidateAction(data: FormData): Promise<void> {
  await requireAuthorizedAdmin('progression.curves.manage');
  await validateProgressionCurve(
    z.uuid().parse(field(data, 'versionId')),
    z.coerce.number().int().positive().parse(field(data, 'expectedRevision')),
    z.string().min(12).max(500).parse(field(data, 'reason')),
    randomUUID(),
  );
  complete('curve-validation-recorded');
}

export async function progressionCurveActivateAction(data: FormData): Promise<void> {
  await requireAuthorizedAdmin('progression.curves.manage');
  await activateProgressionCurve(
    z.uuid().parse(field(data, 'versionId')),
    z.coerce.number().int().positive().parse(field(data, 'expectedRevision')),
    z.string().min(12).max(500).parse(field(data, 'reason')),
    randomUUID(),
  );
  complete('curve-activated-without-player-migration');
}

export async function progressionSuccessorAction(data: FormData): Promise<void> {
  const kind = z
    .enum(['skill', 'xp_rule', 'unlock', 'quest_chain', 'achievement'])
    .parse(field(data, 'kind'));
  const permission = {
    skill: 'progression.skills.manage',
    xp_rule: 'progression.xp_rules.manage',
    unlock: 'progression.unlocks.manage',
    quest_chain: 'progression.quests.manage',
    achievement: 'progression.achievements.manage',
  } as const;
  await requireAuthorizedAdmin(permission[kind]);
  await createProgressionSuccessor(
    kind,
    z.uuid().parse(field(data, 'definitionId')),
    {
      expectedVersionId: z.uuid().parse(field(data, 'expectedVersionId')),
      definition: JSON.parse(field(data, 'definition')) as Record<string, unknown>,
      reason: z.string().min(12).max(500).parse(field(data, 'reason')),
    },
    randomUUID(),
  );
  complete(`${kind}-successor-created`);
}

export async function progressionTransitionAction(data: FormData): Promise<void> {
  const kind = z
    .enum(['skill', 'xp_rule', 'unlock', 'quest_chain', 'achievement'])
    .parse(field(data, 'kind'));
  const permission = {
    skill: 'progression.skills.manage',
    xp_rule: 'progression.xp_rules.manage',
    unlock: 'progression.unlocks.manage',
    quest_chain: 'progression.quests.manage',
    achievement: 'progression.achievements.manage',
  } as const;
  await requireAuthorizedAdmin(permission[kind]);
  await transitionProgressionVersion(
    kind,
    z.uuid().parse(field(data, 'versionId')),
    {
      expectedRevision: z.coerce.number().int().positive().parse(field(data, 'expectedRevision')),
      action: z.enum(['validate', 'activate']).parse(field(data, 'transition')),
      reason: z.string().min(12).max(500).parse(field(data, 'reason')),
    },
    randomUUID(),
  );
  complete(`${kind}-version-transition-recorded`);
}

export async function progressionLiveOpsAction(data: FormData): Promise<void> {
  await requireAuthorizedAdmin('progression.live_ops.manage');
  const multiplier = z.coerce.number().min(0.5).max(2).parse(field(data, 'multiplier'));
  const startsAt = field(data, 'multiplierStartsAt');
  const endsAt = field(data, 'multiplierEndsAt');
  await updateProgressionLiveOps(
    {
      expectedRevision: z.coerce.number().int().positive().parse(field(data, 'expectedRevision')),
      settings: {
        xpGrantsEnabled: checked(data, 'xpGrantsEnabled'),
        farmingXpEnabled: checked(data, 'farmingXpEnabled'),
        cookingXpEnabled: checked(data, 'cookingXpEnabled'),
        craftingXpEnabled: checked(data, 'craftingXpEnabled'),
        levelRewardsEnabled: checked(data, 'levelRewardsEnabled'),
        questRewardsEnabled: checked(data, 'questRewardsEnabled'),
        achievementRewardsEnabled: checked(data, 'achievementRewardsEnabled'),
        unlockGrantsEnabled: checked(data, 'unlockGrantsEnabled'),
        multiplier,
        multiplierStartsAt: multiplier === 1 ? null : z.coerce.date().parse(startsAt).toISOString(),
        multiplierEndsAt: multiplier === 1 ? null : z.coerce.date().parse(endsAt).toISOString(),
        maintenanceMessage: z.string().min(3).max(280).parse(field(data, 'maintenanceMessage')),
      },
      reason: z.string().min(12).max(500).parse(field(data, 'reason')),
    },
    randomUUID(),
  );
  complete('progression-live-ops-updated');
}

export async function progressionReconciliationAction(data: FormData): Promise<void> {
  await requireAuthorizedAdmin('progression.reconciliation.manage');
  await requestProgressionReconciliation(
    {
      wallet: z.string().min(32).max(44).parse(field(data, 'wallet')),
      type: z
        .enum([
          'full_player',
          'skill_totals',
          'levels',
          'unlocks',
          'quests',
          'achievements',
          'titles',
          'pending_rewards',
          'velocity',
        ])
        .parse(field(data, 'type')),
      priority: z.coerce.number().int().min(1).max(100).parse(field(data, 'priority')),
      reason: z.string().min(20).max(1_000).parse(field(data, 'reason')),
    },
    randomUUID(),
  );
  complete('progression-reconciliation-queued');
}

export async function progressionCorrectionAction(data: FormData): Promise<void> {
  await requireAuthorizedAdmin('progression.corrections.manage');
  const skill = field(data, 'skillDefinitionId');
  await requestProgressionCorrection(
    {
      wallet: z.string().min(32).max(44).parse(field(data, 'wallet')),
      skillDefinitionId: skill === '' ? null : z.uuid().parse(skill),
      delta: z.coerce
        .number()
        .int()
        .min(-10_000)
        .max(10_000)
        .refine((value) => value !== 0)
        .parse(field(data, 'delta')),
      expectedRevision: z.coerce.number().int().positive().parse(field(data, 'expectedRevision')),
      reason: z.string().min(20).max(1_000).parse(field(data, 'reason')),
    },
    randomUUID(),
  );
  complete('correction-impact-preview-created');
}

export async function progressionCorrectionApplyAction(data: FormData): Promise<void> {
  await requireAuthorizedAdmin('progression.corrections.manage');
  await applyProgressionCorrection(
    z.uuid().parse(field(data, 'correctionId')),
    z.coerce.number().int().positive().parse(field(data, 'expectedRevision')),
    z.string().min(20).max(1_000).parse(field(data, 'reason')),
    randomUUID(),
  );
  complete('compensating-progression-event-applied');
}

export async function progressionPresentationAction(data: FormData): Promise<void> {
  await requireAuthorizedAdmin('progression.titles.manage');
  const kind = z.enum(['title', 'badge']).parse(field(data, 'kind'));
  await updateProgressionPresentation(
    kind,
    z.uuid().parse(field(data, 'definitionId')),
    {
      expectedRevision: z.coerce.number().int().positive().parse(field(data, 'expectedRevision')),
      definition: {
        displayName: z.string().min(2).max(40).parse(field(data, 'displayName')),
        description: z.string().min(8).max(200).parse(field(data, 'description')),
        ...(kind === 'title'
          ? { rarity: z.enum(['common', 'uncommon', 'rare']).parse(field(data, 'rarity')) }
          : {
              iconRef: z
                .string()
                .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
                .parse(field(data, 'iconRef')),
            }),
        enabled: checked(data, 'enabled'),
        visible: checked(data, 'visible'),
      },
      reason: z.string().min(12).max(500).parse(field(data, 'reason')),
    },
    randomUUID(),
  );
  complete(`${kind}-presentation-updated-ownership-preserved`);
}
