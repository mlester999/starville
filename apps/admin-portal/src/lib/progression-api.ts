import 'server-only';
import { z } from 'zod';
import type { progressionSimulationInputSchema } from '@starville/progression-simulation';
import { callTrustedAdminApi } from './admin-api';

const record = z.record(z.string(), z.unknown());
export const adminProgressionWorkspaceSchema = z
  .object({
    status: z.literal('loaded'),
    requestId: z.string().min(1).max(128),
    adminSessionId: z.uuid(),
    skills: z.array(record).max(100),
    curves: z.array(record).max(500),
    xpRules: z.array(record).max(500),
    unlocks: z.array(record).max(1_000),
    questChains: z.array(record).max(100),
    achievements: z.array(record).max(1_000),
    titles: z.array(record).max(1_000),
    badges: z.array(record).max(1_000),
    liveOps: record,
    telemetry: record,
    audit: z.array(record).max(100),
    player: record.nullable(),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type AdminProgressionWorkspace = z.infer<typeof adminProgressionWorkspaceSchema>;

const mutationResult = record;

export function loadAdminProgression(wallet: string | null = null, search = '') {
  const query = new URLSearchParams({ search });
  if (wallet !== null) query.set('wallet', wallet);
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/progression?${query.toString()}`,
    parser: (value) => adminProgressionWorkspaceSchema.parse(value),
  });
}

export function simulateProgression(
  input: z.infer<typeof progressionSimulationInputSchema>,
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/progression/simulations',
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}

export function createProgressionCurveSuccessor(
  input: {
    expectedVersionId: string;
    publicName: string;
    thresholds: readonly { level: number; cumulativeXp: number }[];
    reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/progression/curves/successors',
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}

export function validateProgressionCurve(
  versionId: string,
  expectedRevision: number,
  reason: string,
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/progression/curves/${versionId}/validate`,
    body: { expectedRevision, action: 'validate', reason },
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}

export function activateProgressionCurve(
  versionId: string,
  expectedRevision: number,
  reason: string,
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/progression/curves/${versionId}/activate`,
    body: { expectedRevision, action: 'activate', reason },
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}

export function createProgressionSuccessor(
  kind: string,
  definitionId: string,
  input: { expectedVersionId: string; definition: Record<string, unknown>; reason: string },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/progression/${kind}/${definitionId}/successors`,
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}

export function transitionProgressionVersion(
  kind: string,
  versionId: string,
  input: { expectedRevision: number; action: 'validate' | 'activate'; reason: string },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/progression/${kind}/versions/${versionId}/transition`,
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}

export function updateProgressionLiveOps(
  input: { expectedRevision: number; settings: Record<string, unknown>; reason: string },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'PATCH',
    pathname: '/api/v1/admin/progression/live-ops',
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}

export function requestProgressionReconciliation(
  input: { wallet: string; type: string; priority: number; reason: string },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/progression/reconciliation',
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}

export function requestProgressionCorrection(
  input: {
    wallet: string;
    skillDefinitionId: string | null;
    delta: number;
    expectedRevision: number;
    reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/progression/corrections',
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}

export function applyProgressionCorrection(
  correctionId: string,
  expectedRevision: number,
  reason: string,
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/progression/corrections/${correctionId}/apply`,
    body: { expectedRevision, reason },
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}

export function updateProgressionPresentation(
  kind: 'title' | 'badge',
  definitionId: string,
  input: { expectedRevision: number; definition: Record<string, unknown>; reason: string },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'PATCH',
    pathname: `/api/v1/admin/progression/presentation/${kind}/${definitionId}`,
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}
