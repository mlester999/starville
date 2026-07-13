import 'server-only';

import { callTrustedAdminApi } from '../admin-api';
import {
  assetAuditDirectorySchema,
  assetMutationResponseSchema,
  assetReferenceDirectorySchema,
  assetReviewQueueDirectorySchema,
  worldAssetDetailSchema,
  worldAssetDirectorySchema,
  worldAssetVersionDetailSchema,
  worldEditorAssetCandidateDirectorySchema,
  type AssetDraftConfiguration,
  type AssetAuditDirectory,
  type AssetMutationResponse,
  type AssetReferenceDirectory,
  type AssetReviewQueueDirectory,
  type WorldAssetDetail,
  type WorldAssetDirectory,
  type WorldAssetVersionDetail,
  type WorldEditorAssetCandidateDirectory,
} from './contracts';
import {
  assetAuditParameters,
  assetDirectoryParameters,
  assetReviewQueueParameters,
  editorAssetCandidateParameters,
  type AssetAuditQuery,
  type AssetDirectoryQuery,
  type AssetReviewQueueQuery,
  type EditorAssetCandidateQuery,
} from './query';

export function loadAssetDirectory(query: AssetDirectoryQuery): Promise<WorldAssetDirectory> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/world-assets?${assetDirectoryParameters(query)}`,
    parser: (value) => worldAssetDirectorySchema.parse(value),
  });
}

export function loadAssetReviewQueue(
  query: AssetReviewQueueQuery,
): Promise<AssetReviewQueueDirectory> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/world-assets/review?${assetReviewQueueParameters(query)}`,
    parser: (value) => assetReviewQueueDirectorySchema.parse(value),
  });
}

export function loadWorldEditorAssetCandidates(
  query: EditorAssetCandidateQuery,
): Promise<WorldEditorAssetCandidateDirectory> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/world-assets/editor-candidates?${editorAssetCandidateParameters(query)}`,
    parser: (value) => worldEditorAssetCandidateDirectorySchema.parse(value),
  });
}

export function loadAssetDetail(assetId: string): Promise<WorldAssetDetail> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/world-assets/${encodeURIComponent(assetId)}`,
    parser: (value) => worldAssetDetailSchema.parse(value),
  });
}

export function loadAssetReferences(
  assetId: string,
  page = 1,
  pageSize: 10 | 50 | 100 = 10,
): Promise<AssetReferenceDirectory> {
  const query = new URLSearchParams({
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
  });
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/world-assets/${encodeURIComponent(assetId)}/references?${query}`,
    parser: (value) => assetReferenceDirectorySchema.parse(value),
  });
}

export function loadAssetVersionDetail(
  assetId: string,
  versionId: string,
): Promise<WorldAssetVersionDetail> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/world-assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}`,
    parser: (value) => worldAssetVersionDetailSchema.parse(value),
  });
}

export function loadAssetAudit(query: AssetAuditQuery): Promise<AssetAuditDirectory> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/world-assets/audit?${assetAuditParameters(query)}`,
    parser: (value) => assetAuditDirectorySchema.parse(value),
  });
}

export function saveAssetVersionDraft(
  assetId: string,
  versionId: string,
  input: {
    readonly expectedRevision: number;
    readonly configuration: AssetDraftConfiguration;
    readonly requestId: string;
  },
): Promise<AssetMutationResponse> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/world-assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}/draft`,
    body: {
      ...input.configuration,
      expectedEditVersion: input.expectedRevision,
      idempotencyKey: input.requestId,
    },
    requestId: input.requestId,
    parser: (value) => assetMutationResponseSchema.parse(value),
  });
}

export function applyAssetVersionOperation(
  assetId: string,
  versionId: string,
  operation: 'validate' | 'submit-review' | 'review' | 'activate' | 'deprecate' | 'archive',
  input: Readonly<Record<string, unknown>> & { readonly idempotencyKey: string },
): Promise<AssetMutationResponse> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname:
      operation === 'deprecate' || operation === 'archive'
        ? `/api/v1/admin/world-assets/${encodeURIComponent(assetId)}/${operation}`
        : `/api/v1/admin/world-assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}/${operation}`,
    body: input,
    requestId: input.idempotencyKey,
    parser: (value) => assetMutationResponseSchema.parse(value),
  });
}
