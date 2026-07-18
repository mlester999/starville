'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  MOONPETAL_HARVEST_HELP,
  cooperativeActivityEditorInputSchema,
  cooperativeActivityLifecycleActionSchema,
  updateCooperativeActivitySettingsSchema,
} from '@starville/cooperative-activities';

import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  createCooperativeActivityDraft,
  transitionCooperativeActivity,
  updateCooperativeActivityDraft,
  updateCooperativeActivitySettings,
} from '../../lib/realtime/cooperative-activity-api';

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(formData: FormData, name: string): number {
  return Number(field(formData, name));
}

export async function cooperativeActivitySettingsAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('cooperative_activities.settings.edit');
  const input = updateCooperativeActivitySettingsSchema.safeParse({
    expectedVersion: numberField(formData, 'expectedVersion'),
    moduleEnabled: field(formData, 'moduleEnabled') === 'true',
    allowExistingInstancesToFinish: field(formData, 'allowExistingInstancesToFinish') === 'true',
    maximumActiveInstances: numberField(formData, 'maximumActiveInstances'),
    maximumFailedAttemptsPerHour: numberField(formData, 'maximumFailedAttemptsPerHour'),
    maximumPartyCreationsPerHour: numberField(formData, 'maximumPartyCreationsPerHour'),
  });
  if (!input.success) redirect('/operations/activities/settings?notice=invalid-settings');
  try {
    await updateCooperativeActivitySettings(input.data, randomUUID());
  } catch {
    redirect('/operations/activities/settings?notice=update-failed');
  }
  revalidatePath('/operations/activities');
  revalidatePath('/operations/activities/settings');
  redirect('/operations/activities/settings?notice=updated');
}

export async function cooperativeActivityEditorAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('cooperative_activities.edit');
  const objectives = MOONPETAL_HARVEST_HELP.objectives.map((objective, index) => ({
    ...objective,
    target:
      objective.type === 'timed_wait'
        ? 1
        : numberField(formData, `objectiveTarget${String(index)}`),
    timeLimitSeconds:
      objective.type === 'timed_wait'
        ? numberField(formData, `objectiveTimer${String(index)}`)
        : null,
  }));
  const activity = cooperativeActivityEditorInputSchema.safeParse({
    activityKey: field(formData, 'activityKey'),
    name: field(formData, 'name'),
    shortDescription: field(formData, 'shortDescription'),
    longDescription: field(formData, 'longDescription'),
    category: 'cozy_cooperative',
    minimumPartySize: numberField(formData, 'minimumPartySize'),
    maximumPartySize: numberField(formData, 'maximumPartySize'),
    recommendedLevel: numberField(formData, 'recommendedLevel'),
    durationSeconds: numberField(formData, 'durationSeconds'),
    reconnectGraceSeconds: numberField(formData, 'reconnectGraceSeconds'),
    waitingForPlayersSeconds: numberField(formData, 'waitingForPlayersSeconds'),
    entryWorldId: field(formData, 'entryWorldId'),
    entryWorldName: field(formData, 'entryWorldName'),
    entryInteractionKey: field(formData, 'entryInteractionKey'),
    sceneRef: field(formData, 'sceneRef'),
    objectives,
    reward: {
      dust: numberField(formData, 'rewardDust'),
      items: [{ itemSlug: 'moonbean', quantity: numberField(formData, 'rewardItemQuantity') }],
      minimumContribution: numberField(formData, 'minimumContribution'),
    },
    entryCooldownSeconds: numberField(formData, 'entryCooldownSeconds'),
    rewardCooldownSeconds: numberField(formData, 'rewardCooldownSeconds'),
    dailyRewardLimit: numberField(formData, 'dailyRewardLimit'),
    requiredModules: [...MOONPETAL_HARVEST_HELP.requiredModules],
    requiredAssets: [...MOONPETAL_HARVEST_HELP.requiredAssets],
    contentVersion: numberField(formData, 'contentVersion'),
  });
  if (!activity.success) redirect('/operations/activities/editor?notice=invalid-draft');
  const versionId = field(formData, 'versionId');
  try {
    const result =
      versionId === ''
        ? await createCooperativeActivityDraft(activity.data, randomUUID())
        : await updateCooperativeActivityDraft(
            versionId,
            numberField(formData, 'expectedRevision'),
            activity.data,
            randomUUID(),
          );
    revalidatePath('/operations/activities');
    redirect(`/operations/activities/editor?version=${result.versionId}&notice=saved`);
  } catch {
    redirect('/operations/activities/editor?notice=save-failed');
  }
}

export async function cooperativeActivityLifecycleAction(formData: FormData): Promise<void> {
  const action = cooperativeActivityLifecycleActionSchema.safeParse(field(formData, 'action'));
  if (!action.success) redirect('/operations/activities/editor?notice=invalid-lifecycle');
  await requireAuthorizedAdmin(
    action.data === 'validate'
      ? 'cooperative_activities.validate'
      : action.data === 'submit_review'
        ? 'cooperative_activities.review'
        : 'cooperative_activities.publish',
  );
  const versionId = field(formData, 'versionId');
  try {
    const result = await transitionCooperativeActivity(
      versionId,
      numberField(formData, 'expectedRevision'),
      action.data,
      randomUUID(),
    );
    revalidatePath('/operations/activities');
    redirect(`/operations/activities/editor?version=${result.versionId}&notice=${action.data}`);
  } catch {
    redirect(`/operations/activities/editor?version=${versionId}&notice=lifecycle-failed`);
  }
}
