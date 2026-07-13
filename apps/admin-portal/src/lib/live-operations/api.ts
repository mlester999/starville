import 'server-only';

import {
  adminLiveOperationsSchema,
  type AdminLiveOperations,
  type AnnouncementMutation,
  type MaintenanceMutation,
} from '@starville/live-operations';
import { z } from 'zod';

import { callTrustedAdminApi } from '../admin-api';

const resultSchema = z
  .object({
    status: z.enum(['updated', 'saved']),
    id: z.uuid().optional(),
    revision: z.number().int().positive(),
  })
  .strict();
export function loadLiveOperations(
  query: Readonly<Record<string, string>> = {},
): Promise<AdminLiveOperations> {
  const parameters = new URLSearchParams(query);
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/live-operations?${parameters.toString()}`,
    parser: (value) => adminLiveOperationsSchema.parse(value),
  });
}
export function updateMaintenance(input: MaintenanceMutation, requestId: string) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/live-operations/maintenance',
    body: input,
    requestId,
    parser: (value) => resultSchema.parse(value),
  });
}
export function saveAnnouncement(input: AnnouncementMutation, requestId: string) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/live-operations/announcements',
    body: input,
    requestId,
    parser: (value) => resultSchema.parse(value),
  });
}
export function changeAnnouncementStatus(
  id: string,
  action: 'publish' | 'deactivate' | 'archive',
  input: { readonly expectedRevision: number; readonly reason: string },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/live-operations/announcements/${encodeURIComponent(id)}/${action}`,
    body: input,
    requestId,
    parser: (value) => resultSchema.parse(value),
  });
}
