import 'server-only';

import { adminRealtimeOverviewSchema, type AdminRealtimeOverview } from '@starville/realtime';

import { callTrustedAdminApi } from '../admin-api';

export function loadRealtimeOverview(): Promise<AdminRealtimeOverview> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/realtime',
    parser: (value) => adminRealtimeOverviewSchema.parse(value),
  });
}
