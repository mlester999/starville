import 'server-only';
import { z } from 'zod';

import { homeVisitPolicySchema } from '@starville/housing';
import { callTrustedAdminApi } from './admin-api';

const record = z.record(z.string(), z.unknown());
export const adminHomeVisitWorkspaceSchema = z
  .object({
    status: z.literal('loaded'),
    requestId: z.string().min(1).max(128),
    adminSessionId: z.uuid(),
    policy: homeVisitPolicySchema,
    activeSessions: z.array(record).max(100),
    invitations: z.array(record).max(100),
    guestbook: z.array(record).max(100),
    appreciation: z.array(record).max(100),
    helpers: z.array(record).max(100),
    reports: z.array(record).max(100),
    reconciliation: z.array(record).max(100),
    audit: z.array(record).max(100),
    telemetry: record,
  })
  .strict();
export type AdminHomeVisitWorkspace = z.infer<typeof adminHomeVisitWorkspaceSchema>;

const mutation = record;
export function loadAdminHomeVisits(search = '', limit = 50, offset = 0) {
  const query = new URLSearchParams({ search, limit: String(limit), offset: String(offset) });
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/home-visits?${query.toString()}`,
    parser: (value) => adminHomeVisitWorkspaceSchema.parse(value),
  });
}
export function createAdminHomeVisitPolicy(input: Record<string, unknown>, requestId: string) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/home-visits/policies',
    body: input,
    requestId,
    parser: (value) => mutation.parse(value),
  });
}
export function transitionAdminHomeVisitPolicy(
  versionId: string,
  input: Record<string, unknown>,
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/home-visits/policies/${encodeURIComponent(versionId)}/transition`,
    body: input,
    requestId,
    parser: (value) => mutation.parse(value),
  });
}
export function closeAdminHomeVisitSession(
  sessionId: string,
  input: Record<string, unknown>,
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/home-visits/sessions/${encodeURIComponent(sessionId)}/close`,
    body: input,
    requestId,
    parser: (value) => mutation.parse(value),
  });
}
export function moderateAdminHomeGuestbook(
  entryId: string,
  input: Record<string, unknown>,
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/home-visits/guestbook/${encodeURIComponent(entryId)}/moderate`,
    body: input,
    requestId,
    parser: (value) => mutation.parse(value),
  });
}
export function reconcileAdminHomeVisit(input: Record<string, unknown>, requestId: string) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/home-visits/reconciliation',
    body: input,
    requestId,
    parser: (value) => mutation.parse(value),
  });
}
export function transitionAdminHomeVisitReport(
  reportId: string,
  input: Record<string, unknown>,
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/home-visits/reports/${encodeURIComponent(reportId)}/transition`,
    body: input,
    requestId,
    parser: (value) => mutation.parse(value),
  });
}
