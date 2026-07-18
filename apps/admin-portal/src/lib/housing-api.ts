import 'server-only';
import { z } from 'zod';
import type { HousingSimulationInput } from '@starville/housing-simulation';
import { callTrustedAdminApi } from './admin-api';

const record = z.record(z.string(), z.unknown());
export const adminHousingWorkspaceSchema = z
  .object({
    status: z.literal('loaded'),
    requestId: z.string().min(1).max(128),
    adminSessionId: z.uuid(),
    furniture: z.array(record).max(500),
    templates: z.array(record).max(100),
    upgrades: z.array(record).max(500),
    storagePolicy: record,
    playerHomes: z.array(record).max(100),
    playerHome: record.nullable(),
    reconciliation: z.array(record).max(100),
    liveOps: record,
    telemetry: record,
    audit: z.array(record).max(100),
  })
  .strict();
export type AdminHousingWorkspace = z.infer<typeof adminHousingWorkspaceSchema>;
const mutationResult = record;
export function loadAdminHousing(
  wallet: string | null = null,
  search = '',
  limit = 50,
  offset = 0,
) {
  const query = new URLSearchParams({ search, limit: String(limit), offset: String(offset) });
  if (wallet !== null) query.set('wallet', wallet);
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/housing?${query.toString()}`,
    parser: (value) => adminHousingWorkspaceSchema.parse(value),
  });
}
export function simulateHousing(input: HousingSimulationInput, requestId: string) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/housing/simulations',
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}
export function createHousingUpgradeSuccessor(
  versionId: string,
  input: {
    expectedConfigurationRevision: number;
    configuration: Record<string, unknown>;
    reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/housing/upgrades/${versionId}/successors`,
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}
export function transitionHousingUpgrade(
  versionId: string,
  input: {
    expectedConfigurationRevision: number;
    transition: 'validate' | 'activate' | 'archive';
    reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/housing/upgrades/${versionId}/transition`,
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}
export function updateHousingLiveOps(
  input: {
    expectedConfigurationRevision: number;
    settings: Record<string, unknown>;
    reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'PATCH',
    pathname: '/api/v1/admin/housing/live-ops',
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}
export function requestHousingReconciliation(
  input: { wallet: string; type: string; priority: number; reason: string },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/housing/reconciliation',
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}
export function requestHousingCorrection(
  input: {
    wallet: string;
    type: string;
    expectedHomeStateVersion: number;
    impactPreview: Record<string, unknown>;
    reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/housing/corrections',
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}
export function applyHousingCorrection(
  correctionId: string,
  input: { expectedCorrectionStateVersion: number; reason: string },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/housing/corrections/${correctionId}/apply`,
    body: input,
    requestId,
    parser: (value) => mutationResult.parse(value),
  });
}
