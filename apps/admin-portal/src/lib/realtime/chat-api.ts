import 'server-only';

import {
  adminChatReportActionSchema,
  adminChatReportDetailSchema,
  adminChatReportListSchema,
  type AdminChatReportAction,
  type AdminChatReportDetail,
  type AdminChatReportList,
} from '@starville/realtime';

import { callTrustedAdminApi } from '../admin-api';

export interface ChatReportFilters {
  readonly page: number;
  readonly pageSize: 10 | 50 | 100;
  readonly status: string;
  readonly category: string;
  readonly worldId: string;
  readonly channelId?: string | undefined;
  readonly search: string;
  readonly dateFrom?: string | undefined;
  readonly dateTo?: string | undefined;
}

export function loadChatReports(filters: ChatReportFilters): Promise<AdminChatReportList> {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    status: filters.status,
    category: filters.category,
    worldId: filters.worldId,
    search: filters.search,
  });
  if (filters.channelId !== undefined) query.set('channelId', filters.channelId);
  if (filters.dateFrom !== undefined) query.set('dateFrom', filters.dateFrom);
  if (filters.dateTo !== undefined) query.set('dateTo', filters.dateTo);
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/multiplayer-chat/reports?${query.toString()}`,
    parser: (value) => adminChatReportListSchema.parse(value),
  });
}

export function loadChatReport(reportId: string): Promise<AdminChatReportDetail> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/multiplayer-chat/reports/${encodeURIComponent(reportId)}`,
    parser: (value) => adminChatReportDetailSchema.parse(value),
  });
}

export function performChatModerationAction(
  reportId: string,
  action: AdminChatReportAction,
): Promise<unknown> {
  const parsed = adminChatReportActionSchema.parse(action);
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/multiplayer-chat/reports/${encodeURIComponent(reportId)}/actions`,
    body: parsed,
    requestId: parsed.requestId,
    parser: (value) => value,
  });
}
