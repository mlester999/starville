import 'server-only';

import {
  adminSocialGraphAuditListSchema,
  adminSocialGraphListSchema,
  adminSocialGraphPartyDetailSchema,
  socialGraphSettingsViewSchema,
  type AdminSocialGraphAuditList,
  type AdminSocialGraphList,
  type AdminSocialGraphPartyDetail,
  type SocialGraphSettingsView,
} from '@starville/realtime';

import { callTrustedAdminApi } from '../admin-api';

export function loadSocialGraph(input: {
  readonly page: number;
  readonly pageSize: 10 | 50 | 100;
  readonly status: 'all' | 'active' | 'disbanded' | 'expired';
  readonly search: string;
}): Promise<AdminSocialGraphList> {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
    status: input.status,
    search: input.search,
  });
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/social-graph?${query.toString()}`,
    parser: (value) => adminSocialGraphListSchema.parse(value),
  });
}

export function loadSocialGraphParty(partyId: string): Promise<AdminSocialGraphPartyDetail> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/social-graph/parties/${encodeURIComponent(partyId)}`,
    parser: (value) => adminSocialGraphPartyDetailSchema.parse(value),
  });
}

export function loadSocialGraphAudit(input: {
  readonly page: number;
  readonly pageSize: 10 | 50 | 100;
  readonly search: string;
}): Promise<AdminSocialGraphAuditList> {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
    search: input.search,
  });
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/social-graph/audit?${query.toString()}`,
    parser: (value) => adminSocialGraphAuditListSchema.parse(value),
  });
}

export function loadSocialGraphSettings(): Promise<SocialGraphSettingsView> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/social-graph/settings',
    parser: (value) => socialGraphSettingsViewSchema.parse(value),
  });
}
