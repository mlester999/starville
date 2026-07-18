import 'server-only';
import { z } from 'zod';

import { callTrustedAdminApi } from './admin-api';

const record = z.record(z.string(), z.unknown());
export const adminPlayerExperienceWorkspaceSchema = z
  .object({
    status: z.literal('loaded'),
    requestId: z.string().min(1).max(128),
    adminSessionId: z.uuid(),
    generatedAt: z.iso.datetime({ offset: true }),
    onboardingVersion: record,
    dailyPolicy: record,
    dailyPolicyVersions: z.array(record).max(100),
    starterQuestline: record,
    gameTest: record,
    funnel: record,
    dropOff: z.array(record).max(100),
    players: z.array(record).max(100),
    dailyObjectives: z.array(record).max(100),
    guidanceReadiness: z.array(record).max(100),
    recovery: z.array(record).max(100),
    telemetry: record,
    audit: z.array(record).max(100),
  })
  .strict();
export type AdminPlayerExperienceWorkspace = z.infer<typeof adminPlayerExperienceWorkspaceSchema>;

export function loadAdminPlayerExperience(search = '', limit = 50, offset = 0) {
  const query = new URLSearchParams({ search, limit: String(limit), offset: String(offset) });
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/player-experience?${query.toString()}`,
    parser: (value) => adminPlayerExperienceWorkspaceSchema.parse(value),
  });
}

export function correctAdminPlayerExperience(
  playerId: string,
  input: Record<string, unknown>,
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/player-experience/players/${encodeURIComponent(playerId)}/corrections`,
    body: input,
    requestId,
    parser: (value) => record.parse(value),
  });
}

export function createAdminDailyPolicySuccessor(input: Record<string, unknown>, requestId: string) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/player-experience/daily-policy-successors',
    body: input,
    requestId,
    parser: (value) => record.parse(value),
  });
}
