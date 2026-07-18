'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';

import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  correctAdminPlayerExperience,
  createAdminDailyPolicySuccessor,
} from '../../lib/player-experience-api';

function text(data: FormData, key: string): string {
  const value = data.get(key);
  if (typeof value !== 'string') throw new Error('Invalid player-experience support form.');
  return value;
}

export async function playerExperienceCorrectionAction(data: FormData) {
  await requireAuthorizedAdmin('player_experience.support');
  const revision = Number(text(data, 'expectedRevision'));
  if (!Number.isInteger(revision) || revision < 1) throw new Error('Invalid onboarding revision.');
  const recoveryId = text(data, 'recoveryId');
  await correctAdminPlayerExperience(
    text(data, 'playerId'),
    {
      action: text(data, 'action'),
      recoveryId: recoveryId === '' ? null : recoveryId,
      expectedRevision: revision,
      reason: text(data, 'reason'),
    },
    randomUUID(),
  );
  redirect('/operations/player-experience?notice=support-action-recorded');
}

export async function playerExperienceDailyPolicySuccessorAction(data: FormData) {
  await requireAuthorizedAdmin('player_experience.policy.manage');
  const revision = Number(text(data, 'expectedRevision'));
  if (!Number.isInteger(revision) || revision < 1) throw new Error('Invalid policy revision.');
  await createAdminDailyPolicySuccessor(
    {
      basePolicyVersionId: text(data, 'basePolicyVersionId'),
      expectedRevision: revision,
      effectiveAt: text(data, 'effectiveAt'),
      reason: text(data, 'reason'),
    },
    randomUUID(),
  );
  redirect('/operations/player-experience?notice=daily-policy-successor-created');
}
