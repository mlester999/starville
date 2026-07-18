import 'server-only';

import {
  adminCooperativeActivityInstanceDetailSchema,
  adminCooperativeActivityListSchema,
  cooperativeActivityPreviewSchema,
  cooperativeActivitySettingsSchema,
  cooperativeActivityVersionSchema,
  type AdminCooperativeActivityInstanceDetail,
  type AdminCooperativeActivityList,
  type CooperativeActivityEditorInput,
  type CooperativeActivityPreview,
  type CooperativeActivitySettings,
  type CooperativeActivityVersion,
  type UpdateCooperativeActivitySettings,
} from '@starville/cooperative-activities';

import { callTrustedAdminApi } from '../admin-api';

export function loadCooperativeActivities(input: {
  readonly view: 'catalog' | 'instances' | 'rewards' | 'audit';
  readonly page: number;
  readonly pageSize: 10 | 50 | 100;
  readonly status: string;
  readonly search: string;
}): Promise<AdminCooperativeActivityList> {
  const query = new URLSearchParams({
    view: input.view,
    page: String(input.page),
    pageSize: String(input.pageSize),
    status: input.status,
    search: input.search,
  });
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/cooperative-activities?${query.toString()}`,
    parser: (value) => adminCooperativeActivityListSchema.parse(value),
  });
}

export function loadCooperativeActivityInstance(
  instanceId: string,
): Promise<AdminCooperativeActivityInstanceDetail> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/cooperative-activities/instances/${encodeURIComponent(instanceId)}`,
    parser: (value) => adminCooperativeActivityInstanceDetailSchema.parse(value),
  });
}

export function loadCooperativeActivitySettings(): Promise<CooperativeActivitySettings> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/cooperative-activities/settings',
    parser: (value) => cooperativeActivitySettingsSchema.parse(value),
  });
}

export function updateCooperativeActivitySettings(
  input: UpdateCooperativeActivitySettings,
  requestId: string,
): Promise<CooperativeActivitySettings> {
  return callTrustedAdminApi({
    method: 'PATCH',
    pathname: '/api/v1/admin/cooperative-activities/settings',
    body: input,
    requestId,
    parser: (value) => cooperativeActivitySettingsSchema.parse(value),
  });
}

export function previewCooperativeActivity(
  versionId: string,
  simulationStep: number,
  requestId: string,
): Promise<CooperativeActivityPreview> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/cooperative-activities/preview',
    body: { versionId, simulationStep },
    requestId,
    parser: (value) => cooperativeActivityPreviewSchema.parse(value),
  });
}

export function createCooperativeActivityDraft(
  activity: CooperativeActivityEditorInput,
  requestId: string,
): Promise<CooperativeActivityVersion> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/cooperative-activities/drafts',
    body: { activity },
    requestId,
    parser: (value) => cooperativeActivityVersionSchema.parse(value),
  });
}

export function updateCooperativeActivityDraft(
  versionId: string,
  expectedRevision: number,
  activity: CooperativeActivityEditorInput,
  requestId: string,
): Promise<CooperativeActivityVersion> {
  return callTrustedAdminApi({
    method: 'PUT',
    pathname: `/api/v1/admin/cooperative-activities/versions/${encodeURIComponent(versionId)}`,
    body: { expectedRevision, activity },
    requestId,
    parser: (value) => cooperativeActivityVersionSchema.parse(value),
  });
}

export function transitionCooperativeActivity(
  versionId: string,
  expectedRevision: number,
  action: 'validate' | 'submit_review' | 'publish' | 'disable',
  requestId: string,
): Promise<CooperativeActivityVersion> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/cooperative-activities/versions/${encodeURIComponent(versionId)}/lifecycle`,
    body: { action, expectedRevision },
    requestId,
    parser: (value) => cooperativeActivityVersionSchema.parse(value),
  });
}
