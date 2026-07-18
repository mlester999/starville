import {
  dailyRefreshSchema,
  onboardingAcknowledgeSchema,
  onboardingPreferenceSchema,
  onboardingRecoverySchema,
  onboardingSkipSchema,
  onboardingStartSchema,
  playerExperienceWorkspaceSchema,
  type PlayerExperienceWorkspace,
} from '@starville/player-experience';

import { PlayerRequestError, requestPlayerApi } from './player-client';

function parseWorkspace(value: unknown): PlayerExperienceWorkspace {
  const parsed = playerExperienceWorkspaceSchema.safeParse(value);
  if (!parsed.success) throw new PlayerRequestError(502, 'INVALID_PLAYER_EXPERIENCE_RESPONSE');
  return parsed.data;
}

export function createPlayerExperienceIdempotencyKey(): string {
  return `player-experience-${crypto.randomUUID()}`;
}

export async function loadPlayerExperience(
  apiUrl: string,
  feedbackAfter = 0,
): Promise<PlayerExperienceWorkspace> {
  return parseWorkspace(
    await requestPlayerApi(apiUrl, `/experience?after=${String(feedbackAfter)}&limit=20`, {
      method: 'GET',
    }),
  );
}

export async function startPlayerOnboarding(
  apiUrl: string,
  expectedRevision: number,
): Promise<PlayerExperienceWorkspace> {
  return parseWorkspace(
    await requestPlayerApi(apiUrl, '/experience/start', {
      method: 'POST',
      body: onboardingStartSchema.parse({
        expectedRevision,
        idempotencyKey: createPlayerExperienceIdempotencyKey(),
      }),
    }),
  );
}

export async function setPlayerOnboardingActivity(
  apiUrl: string,
  action: 'pause' | 'resume',
  expectedRevision: number,
): Promise<PlayerExperienceWorkspace> {
  return parseWorkspace(
    await requestPlayerApi(apiUrl, '/experience/activity', {
      method: 'PATCH',
      body: { action, expectedRevision },
    }),
  );
}

export async function updatePlayerGuidePreferences(
  apiUrl: string,
  input: { minimized: boolean; reducedGuidance: boolean; expectedRevision: number },
): Promise<PlayerExperienceWorkspace> {
  return parseWorkspace(
    await requestPlayerApi(apiUrl, '/experience/preferences', {
      method: 'PATCH',
      body: onboardingPreferenceSchema.parse(input),
    }),
  );
}

export async function acknowledgePlayerExperienceStep(
  apiUrl: string,
  stepKey: 'inspect_inventory' | 'review_progression' | 'review_home_visits',
  expectedRevision: number,
): Promise<PlayerExperienceWorkspace> {
  return parseWorkspace(
    await requestPlayerApi(apiUrl, '/experience/acknowledgements', {
      method: 'POST',
      body: onboardingAcknowledgeSchema.parse({
        stepKey,
        expectedRevision,
        idempotencyKey: createPlayerExperienceIdempotencyKey(),
      }),
    }),
  );
}

export async function skipOptionalPlayerOnboarding(
  apiUrl: string,
  expectedRevision: number,
): Promise<PlayerExperienceWorkspace> {
  return parseWorkspace(
    await requestPlayerApi(apiUrl, '/experience/skip-optional', {
      method: 'POST',
      body: onboardingSkipSchema.parse({
        expectedRevision,
        optionalOnly: true,
        reason: 'Player chose to continue with solo-safe guidance.',
      }),
    }),
  );
}

export async function requestPlayerExperienceRecovery(
  apiUrl: string,
  reasonCode: 'starter_seed_missing' | 'guidance_target_missing' | 'state_out_of_sync',
  expectedRevision: number,
): Promise<PlayerExperienceWorkspace> {
  return parseWorkspace(
    await requestPlayerApi(apiUrl, '/experience/recovery', {
      method: 'POST',
      body: onboardingRecoverySchema.parse({
        reasonCode,
        expectedRevision,
        idempotencyKey: createPlayerExperienceIdempotencyKey(),
      }),
    }),
  );
}

export async function refreshPlayerDailyObjectives(
  apiUrl: string,
  expectedAssignmentRevision: number,
): Promise<PlayerExperienceWorkspace> {
  return parseWorkspace(
    await requestPlayerApi(apiUrl, '/experience/daily-refresh', {
      method: 'POST',
      body: dailyRefreshSchema.parse({
        expectedAssignmentRevision,
        idempotencyKey: createPlayerExperienceIdempotencyKey(),
      }),
    }),
  );
}
