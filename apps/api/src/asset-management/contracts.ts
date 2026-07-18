import type {
  AssetCreateVersionAction,
  AssetCreateVersionUploadMetadata,
  AssetDraftUpdate,
  AssetUploadMetadata,
  AssetVersionAction,
} from '@starville/asset-management';

import type { AdminDatabaseIdentity, ServiceLogger } from '../contracts.js';
import type { AssetStorage } from './storage.js';

export interface AssetUploadInput {
  readonly metadata: AssetUploadMetadata;
  readonly originalFileName: string;
  readonly declaredMediaType: string;
  readonly bytes: Buffer;
}

export interface AssetVersionUploadInput {
  readonly metadata: AssetCreateVersionUploadMetadata;
  readonly originalFileName: string;
  readonly declaredMediaType: string;
  readonly bytes: Buffer;
}

export interface AdminAssetGateway {
  listAssets(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  getAsset(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  getVersion(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  createUpload(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  completeProcessing(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  failProcessing(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  updateDraft(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  validateVersion(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  claimOperationIntent(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  submitReview(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  reviewVersion(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  previewMaterial(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  activationMaterial(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  activateVersion(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  deprecateAsset(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  archiveAsset(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  createVersion(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  createVersionFromExisting(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  listReviewQueue(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  listAudit(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  listReferences(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  listEditorCandidates(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}

export interface AdminAssetService {
  listAssets(identity: AdminDatabaseIdentity, query: unknown, requestId: string): Promise<unknown>;
  getAsset(identity: AdminDatabaseIdentity, assetId: unknown, requestId: string): Promise<unknown>;
  getVersion(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    versionId: unknown,
    requestId: string,
  ): Promise<unknown>;
  readMedia(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    versionId: unknown,
    variant: unknown,
    requestId: string,
  ): Promise<
    Readonly<{
      bytes: Buffer;
      checksum: string;
      mediaType: 'image/png' | 'image/webp';
    }>
  >;
  upload(
    identity: AdminDatabaseIdentity,
    input: AssetUploadInput,
    requestId: string,
  ): Promise<unknown>;
  updateDraft(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    versionId: unknown,
    body: AssetDraftUpdate,
    requestId: string,
  ): Promise<unknown>;
  validateVersion(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    versionId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<unknown>;
  submitReview(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    versionId: unknown,
    body: AssetVersionAction,
    requestId: string,
  ): Promise<unknown>;
  reviewVersion(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    versionId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<unknown>;
  activateVersion(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    versionId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<unknown>;
  deprecateAsset(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<unknown>;
  archiveAsset(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<unknown>;
  createVersion(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    input: AssetVersionUploadInput,
    requestId: string,
  ): Promise<unknown>;
  createVersionFromExisting(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    body: AssetCreateVersionAction,
    requestId: string,
  ): Promise<unknown>;
  listReviewQueue(
    identity: AdminDatabaseIdentity,
    query: unknown,
    requestId: string,
  ): Promise<unknown>;
  listAudit(identity: AdminDatabaseIdentity, query: unknown, requestId: string): Promise<unknown>;
  listReferences(
    identity: AdminDatabaseIdentity,
    assetId: unknown,
    query: unknown,
    requestId: string,
  ): Promise<unknown>;
  listEditorCandidates(
    identity: AdminDatabaseIdentity,
    query: unknown,
    requestId: string,
  ): Promise<unknown>;
}

export interface AdminAssetServiceOptions {
  readonly gateway: AdminAssetGateway;
  readonly storage: AssetStorage;
  readonly logger: ServiceLogger;
  readonly readRateLimit: number;
  readonly mutationRateLimit: number;
}
