import {
  progressionEventPageSchema,
  progressionQuestCompleteSchema,
  progressionQuestMutationSchema,
  progressionQuestTrackSchema,
  progressionWorkspaceSchema,
  type ProgressionWorkspace,
} from '@starville/progression';
import { PlayerRequestError, requestPlayerApi } from './player-client';

function parseWorkspace(value: unknown): ProgressionWorkspace {
  const parsed = progressionWorkspaceSchema.safeParse(value);
  if (!parsed.success) throw new PlayerRequestError(502, 'INVALID_PROGRESSION_RESPONSE');
  return parsed.data;
}

export function createProgressionIdempotencyKey(): string {
  return `progression-${crypto.randomUUID()}`;
}

export async function loadProgression(apiUrl: string): Promise<ProgressionWorkspace> {
  return parseWorkspace(await requestPlayerApi(apiUrl, '/progression', { method: 'GET' }));
}

export async function loadProgressionEvents(apiUrl: string, afterEventNumber: number) {
  const value = await requestPlayerApi(
    apiUrl,
    `/progression/events?after=${String(afterEventNumber)}&limit=50`,
    { method: 'GET' },
  );
  const parsed = progressionEventPageSchema.safeParse(value);
  if (!parsed.success) throw new PlayerRequestError(502, 'INVALID_PROGRESSION_RESPONSE');
  return parsed.data;
}

export async function acceptProgressionQuest(
  apiUrl: string,
  questDefinitionId: string,
  expectedConfigurationRevision: number,
): Promise<ProgressionWorkspace> {
  const input = progressionQuestMutationSchema.parse({
    questDefinitionId,
    expectedConfigurationRevision,
    idempotencyKey: createProgressionIdempotencyKey(),
  });
  await requestPlayerApi(apiUrl, `/progression/quests/${questDefinitionId}/accept`, {
    method: 'POST',
    body: input,
  });
  return loadProgression(apiUrl);
}

export async function trackProgressionQuest(
  apiUrl: string,
  questInstanceId: string,
  tracked: boolean,
  expectedStateVersion: number,
): Promise<ProgressionWorkspace> {
  await requestPlayerApi(apiUrl, `/progression/quests/${questInstanceId}/tracking`, {
    method: 'PATCH',
    body: progressionQuestTrackSchema.parse({ tracked, expectedStateVersion }),
  });
  return loadProgression(apiUrl);
}

export async function completeProgressionQuest(
  apiUrl: string,
  questInstanceId: string,
  expectedStateVersion: number,
): Promise<ProgressionWorkspace> {
  await requestPlayerApi(apiUrl, `/progression/quests/${questInstanceId}/complete`, {
    method: 'POST',
    body: progressionQuestCompleteSchema.parse({
      expectedStateVersion,
      idempotencyKey: createProgressionIdempotencyKey(),
    }),
  });
  return loadProgression(apiUrl);
}

export async function updateProgressionIdentity(
  apiUrl: string,
  titleId: string | null,
  badgeId: string | null,
  expectedRevision: number,
): Promise<ProgressionWorkspace> {
  return parseWorkspace(
    await requestPlayerApi(apiUrl, '/progression/identity', {
      method: 'PATCH',
      body: { titleId, badgeId, expectedRevision },
    }),
  );
}

export async function retryProgressionReward(
  apiUrl: string,
  rewardId: string,
  expectedRevision: number,
): Promise<ProgressionWorkspace> {
  await requestPlayerApi(apiUrl, `/progression/rewards/${rewardId}/retry`, {
    method: 'POST',
    body: { expectedRevision },
  });
  return loadProgression(apiUrl);
}
