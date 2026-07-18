import 'server-only';

import { callTrustedAdminApi } from '../admin-api';
import {
  worldAssetDirectorySchema,
  worldAuditDirectorySchema,
  worldDetailSchema,
  worldDirectorySchema,
  worldDraftLoadSchema,
  worldDraftSchema,
  worldPreviewSchema,
  worldPublicationReviewSchema,
  worldPublishResponseSchema,
  worldRevisionComparisonSchema,
  worldRevisionSchema,
  worldRollbackResponseSchema,
  publishedWorldTopologySchema,
  worldValidationResponseSchema,
  type WorldAssetDirectory,
  type WorldAuditDirectory,
  type WorldDetail,
  type WorldDirectory,
  type WorldDraft,
  type WorldDraftLoad,
  type WorldPreview,
  type WorldPublicationReview,
  type WorldRevision,
  type WorldRevisionComparison,
  type AdminWorldManifest,
  type PublishedWorldTopology,
} from './contracts';
import type { WorldCatalogQuery, WorldDirectoryQuery } from './query';

function directoryParameters(query: WorldDirectoryQuery): string {
  const limit = query.pageSize;
  const offset = (query.page - 1) * query.pageSize;
  return new URLSearchParams({
    search: query.search,
    status: query.status,
    sort: query.sort,
    direction: query.direction,
    limit: String(limit),
    offset: String(offset),
  }).toString();
}

function catalogParameters(query: WorldCatalogQuery): string {
  const limit = query.pageSize;
  const offset = (query.page - 1) * query.pageSize;
  return new URLSearchParams({
    search: query.search,
    limit: String(limit),
    offset: String(offset),
  }).toString();
}

export function loadWorldDirectory(query: WorldDirectoryQuery): Promise<WorldDirectory> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/worlds?${directoryParameters(query)}`,
    parser: (value) => worldDirectorySchema.parse(value),
  });
}

export function loadPublishedWorldTopology(): Promise<PublishedWorldTopology> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/world-topology',
    parser: (value) => publishedWorldTopologySchema.parse(value),
  });
}

export function loadWorldDetail(mapId: string): Promise<WorldDetail> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}`,
    parser: (value) => worldDetailSchema.parse(value),
  });
}

export function loadWorldDraft(mapId: string, versionId: string): Promise<WorldDraftLoad> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/drafts/${encodeURIComponent(versionId)}`,
    parser: (value) => worldDraftLoadSchema.parse(value),
  });
}

export function loadWorldRevision(mapId: string, versionId: string): Promise<WorldRevision> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/revisions/${encodeURIComponent(versionId)}`,
    parser: (value) => worldRevisionSchema.parse(value),
  });
}

export function compareWorldRevisions(
  mapId: string,
  fromVersionId: string,
  toVersionId: string,
): Promise<WorldRevisionComparison> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/revisions/${encodeURIComponent(toVersionId)}/comparison?fromVersionId=${encodeURIComponent(fromVersionId)}`,
    parser: (value) => worldRevisionComparisonSchema.parse(value),
  });
}

export function createWorldDraft(
  mapId: string,
  input: { readonly expectedRecordVersion: number },
  requestId: string,
): Promise<WorldDraft> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/drafts`,
    body: input,
    requestId,
    parser: (value) => worldDraftSchema.parse(value),
  });
}

export function saveWorldDraft(
  mapId: string,
  versionId: string,
  input: {
    readonly expectedEditVersion: number;
    readonly expectedChecksum: string | null;
    readonly manifest: AdminWorldManifest;
    readonly confirmed: true;
  },
  requestId: string,
): Promise<WorldDraft> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/drafts/${encodeURIComponent(versionId)}/save`,
    body: input,
    requestId,
    parser: (value) => worldDraftSchema.parse(value),
  });
}

export function validateWorldDraft(
  mapId: string,
  versionId: string,
  input: {
    readonly expectedEditVersion: number;
    readonly expectedChecksum: string | null;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/drafts/${encodeURIComponent(versionId)}/validate`,
    body: input,
    requestId,
    parser: (value) => worldValidationResponseSchema.parse(value),
  });
}

export function publishWorldDraft(
  mapId: string,
  versionId: string,
  input: {
    readonly expectedEditVersion: number;
    readonly expectedActiveVersionId: string | null;
    readonly expectedChecksum: string;
    readonly reviewId: string;
    readonly reason: string;
    readonly requestId: string;
    readonly confirmed: true;
  },
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/drafts/${encodeURIComponent(versionId)}/publish`,
    body: input,
    requestId: input.requestId,
    parser: (value) => worldPublishResponseSchema.parse(value),
  });
}

export function reviewWorldPublication(
  mapId: string,
  versionId: string,
  input: {
    readonly expectedActiveVersionId: string | null;
    readonly operation: 'publish' | 'rollback';
    readonly acknowledged: true;
  },
  requestId: string,
): Promise<WorldPublicationReview> {
  const reviewSegment = input.operation === 'publish' ? 'publication-review' : 'rollback-review';
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/versions/${encodeURIComponent(versionId)}/${reviewSegment}`,
    body: input,
    requestId,
    parser: (value) => worldPublicationReviewSchema.parse(value),
  });
}

export function rollbackWorldRevision(
  mapId: string,
  versionId: string,
  input: {
    readonly expectedActiveVersionId: string;
    readonly reviewId: string;
    readonly reason: string;
    readonly confirmed: true;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/versions/${encodeURIComponent(versionId)}/rollback`,
    body: input,
    requestId,
    parser: (value) => worldRollbackResponseSchema.parse(value),
  });
}

export function deriveWorldVersion(
  mapId: string,
  versionId: string,
  input: {
    readonly expectedRecordVersion: number;
    readonly reason: string;
    readonly confirmed: true;
  },
  requestId: string,
): Promise<WorldDraft> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/versions/${encodeURIComponent(versionId)}/derive`,
    body: input,
    requestId,
    parser: (value) => worldDraftSchema.parse(value),
  });
}

export function loadWorldPreview(mapId: string, versionId: string): Promise<WorldPreview> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/versions/${encodeURIComponent(versionId)}/preview`,
    parser: (value) => worldPreviewSchema.parse(value),
  });
}

export function loadWorldMapAudit(
  mapId: string,
  query: WorldCatalogQuery,
): Promise<WorldAuditDirectory> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/audit?${catalogParameters(query)}`,
    parser: (value) => worldAuditDirectorySchema.parse(value),
  });
}

export function loadWorldAssets(query: WorldCatalogQuery): Promise<WorldAssetDirectory> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/world-assets?${catalogParameters(query)}`,
    parser: (value) => worldAssetDirectorySchema.parse(value),
  });
}

export function loadWorldAudit(query: WorldCatalogQuery): Promise<WorldAuditDirectory> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/world-audit?${catalogParameters(query)}`,
    parser: (value) => worldAuditDirectorySchema.parse(value),
  });
}
