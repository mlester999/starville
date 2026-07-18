import 'server-only';

import {
  adminSocialInteractionDetailSchema,
  adminSocialInteractionListSchema,
  type AdminSocialInteractionDetail,
  type AdminSocialInteractionList,
} from '@starville/realtime';

import { callTrustedAdminApi } from '../admin-api';

export interface SocialInteractionFilters {
  readonly page: number;
  readonly pageSize: 10 | 50 | 100;
  readonly type: 'all' | 'gift' | 'trade';
  readonly status: string;
  readonly search: string;
}

export function loadSocialInteractions(
  filters: SocialInteractionFilters,
): Promise<AdminSocialInteractionList> {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    type: filters.type,
    status: filters.status,
    search: filters.search,
  });
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/social-interactions?${query.toString()}`,
    parser: (value) => adminSocialInteractionListSchema.parse(value),
  });
}

export function loadSocialInteraction(
  interactionId: string,
): Promise<AdminSocialInteractionDetail> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/social-interactions/${encodeURIComponent(interactionId)}`,
    parser: (value) => adminSocialInteractionDetailSchema.parse(value),
  });
}
