import { createHash } from 'node:crypto';

import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import type { LogContext, ServiceLogger } from '../contracts.js';
import type { AdminAssetGateway } from './contracts.js';
import { AdminAssetPersistenceError } from './gateway.js';
import { createAdminAssetService } from './service.js';
import { AssetStorageError, type AssetStorage } from './storage.js';

class SilentLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }
  trace(_message: string): void {}
  debug(_message: string): void {}
  info(_message: string): void {}
  warn(_message: string): void {}
  error(_message: string): void {}
  fatal(_message: string): void {}
}

const identity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal2' as const,
  authenticationMethods: ['password', 'totp'],
};
const requestId = '33333333-3333-4333-8333-333333333333';
const assetId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const uploadId = '66666666-6666-4666-8666-666666666666';
const sourceVersionId = '77777777-7777-4777-8777-777777777777';
const timestamp = '2026-07-13T04:00:00.000Z';

function rawAsset(id = assetId) {
  return {
    id,
    gameKey: 'starville',
    assetKey: 'willow-tree',
    slug: 'willow-tree',
    friendlyName: 'Willow Tree',
    assetType: 'tree',
    category: 'nature',
    lifecycleStatus: 'active',
    productionStatus: 'approved_production',
    activeVersionId: versionId,
    activeVersionNumber: 1,
    thumbnailUrl: 'https://assets.example.test/starville/willow-tree/v1/thumbnail.webp',
    developmentMarkerReplacementKey: null,
    recordVersion: 3,
    versionCount: 1,
    referenceSummary: { published: 0, draft: 0, activeConfiguration: 0, total: 0 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function rawVersion(id = versionId, targetAssetId = assetId) {
  return {
    id,
    assetId: targetAssetId,
    versionNumber: 1,
    lifecycleStatus: 'active',
    sourceKind: 'storage_raster',
    checksumSha256: 'a'.repeat(64),
    sourceMimeType: 'image/webp',
    sourceWidth: 16,
    sourceHeight: 16,
    sourceSizeBytes: 256,
    processedSourceWidth: 16,
    processedSourceHeight: 16,
    processedSourceSizeBytes: 256,
    processedPreviewWidth: 16,
    processedPreviewHeight: 16,
    processedPreviewSizeBytes: 256,
    processedThumbnailWidth: 16,
    processedThumbnailHeight: 16,
    processedThumbnailSizeBytes: 256,
    renderWidth: 16,
    renderHeight: 16,
    scale: 1,
    anchor: { x: 0.5, y: 1 },
    footAnchor: { x: 0.5, y: 0.95 },
    depthAnchor: { x: 0.5, y: 1 },
    collisionProfile: { shape: 'none', blocking: false },
    supportedRotations: [0],
    defaultRotation: 0,
    interactionCompatibility: ['decorative'],
    transparentBackgroundExpected: true,
    transparencyResult: 'partial',
    validationStatus: 'valid',
    validationResults: { valid: true, checkedAt: timestamp, issues: [] },
    internalNotes: null,
    editVersion: 4,
    sourcePreviewUrl: null,
    previewUrl: 'https://assets.example.test/starville/willow-tree/v1/preview.webp',
    thumbnailUrl: 'https://assets.example.test/starville/willow-tree/v1/thumbnail.webp',
    createdByAdminId: null,
    submittedByAdminId: null,
    reviewedByAdminId: null,
    approvedByAdminId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    submittedAt: timestamp,
    reviewedAt: timestamp,
    approvedAt: timestamp,
    activatedAt: timestamp,
    tags: [],
  };
}

function gateway(): AdminAssetGateway {
  return {
    listAssets: vi.fn(),
    getAsset: vi.fn(),
    getVersion: vi.fn(),
    createUpload: vi.fn(async () => ({
      status: 'created',
      assetId,
      assetRevision: 1,
      versionId,
      versionNumber: 1,
      versionEditVersion: 1,
      uploadId,
      uploadRevision: 1,
      intakePath: `starville/${assetId}/${uploadId}/original.png`,
    })),
    completeProcessing: vi.fn(),
    failProcessing: vi.fn(async () => ({ status: 'validation_failed' })),
    updateDraft: vi.fn(),
    validateVersion: vi.fn(),
    claimOperationIntent: vi.fn(async () => ({ status: 'claimed' })),
    submitReview: vi.fn(),
    reviewVersion: vi.fn(),
    previewMaterial: vi.fn(),
    activationMaterial: vi.fn(),
    activateVersion: vi.fn(),
    deprecateAsset: vi.fn(),
    archiveAsset: vi.fn(),
    createVersion: vi.fn(),
    createVersionFromExisting: vi.fn(),
    listReviewQueue: vi.fn(),
    listAudit: vi.fn(),
    listReferences: vi.fn(),
    listEditorCandidates: vi.fn(),
  };
}

function storage(): AssetStorage {
  return {
    storePrivateImmutable: vi.fn(async () => 'stored' as const),
    readPrivate: vi.fn(async () => Buffer.from('stored-private-bytes')),
    removePrivate: vi.fn(async () => undefined),
    storePublicImmutable: vi.fn(async () => 'stored' as const),
    publicUrl: vi.fn((path) => `https://assets.example.test/${path}`),
  };
}

function service(target = gateway(), files = storage()) {
  return {
    target,
    files,
    value: createAdminAssetService({
      gateway: target,
      storage: files,
      logger: new SilentLogger(),
      readRateLimit: 120,
      mutationRateLimit: 30,
      now: () => new Date('2026-07-13T04:00:00.000Z'),
    }),
  };
}

function metadata() {
  return {
    friendlyName: 'Willow Tree',
    slug: 'willow-tree',
    assetType: 'tree' as const,
    category: 'nature' as const,
    developmentMarkerReplacementKey: null,
    idempotencyKey: requestId,
  };
}

function versionMetadata() {
  return {
    sourceVersionId,
    configurationMode: 'copy' as const,
    expectedAssetRevision: 3,
    reason: 'Replace the procedural pine tree with reviewed transparent artwork.',
    idempotencyKey: requestId,
  };
}

function versionReservation() {
  return {
    status: 'created',
    assetId,
    assetRevision: 4,
    versionId,
    versionNumber: 2,
    versionEditVersion: 1,
    uploadId,
    uploadRevision: 1,
    intakePath: `starville/${assetId}/${uploadId}/original.png`,
  };
}

describe('administrator asset service', () => {
  it('rejects a version detail response that does not belong to the requested asset', async () => {
    const target = gateway();
    const otherAssetId = '88888888-8888-4888-8888-888888888888';
    vi.mocked(target.getVersion).mockResolvedValueOnce({
      status: 'loaded',
      asset: rawAsset(otherAssetId),
      version: rawVersion(versionId, otherAssetId),
      validationResults: [],
      reviews: [],
      referenceSummary: rawAsset(otherAssetId).referenceSummary,
    });
    const { value } = service(target);

    await expect(value.getVersion(identity, assetId, versionId, requestId)).rejects.toEqual(
      expect.objectContaining({ code: 'ASSET_STATE_CONFLICT', statusCode: 409 }),
    );
  });

  it('maps a direct validated-version draft mutation to a safe lifecycle conflict', async () => {
    const target = gateway();
    vi.mocked(target.updateDraft).mockRejectedValueOnce(
      new AdminAssetPersistenceError('validated_version_immutable'),
    );
    const { value } = service(target);

    await expect(
      value.updateDraft(
        identity,
        assetId,
        versionId,
        {
          expectedEditVersion: 3,
          friendlyName: 'Willow Tree',
          category: 'nature',
          tags: [],
          internalNotes: '',
          render: {
            renderWidth: 512,
            renderHeight: 512,
            scale: 1,
            anchor: { x: 0.5, y: 1 },
            footAnchor: { x: 0.5, y: 1 },
            depthAnchor: { x: 0.5, y: 1 },
            supportedRotations: [0],
            defaultRotation: 0,
          },
          collision: { shape: 'none', blocking: false },
          interactionCompatibility: ['decorative'],
          idempotencyKey: requestId,
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_STATE_CONFLICT', statusCode: 409 }));
  });

  it('reserves first, stores private intake, records safe validation failure, and rejects disguised files', async () => {
    const { target, files, value } = service();

    await expect(
      value.upload(
        identity,
        {
          metadata: metadata(),
          originalFileName: 'willow-tree.png',
          declaredMediaType: 'image/png',
          bytes: Buffer.from('this is not really a png image'),
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_FILE_UNSUPPORTED', statusCode: 422 }));

    expect(target.createUpload).toHaveBeenCalledTimes(1);
    expect(files.storePrivateImmutable).toHaveBeenCalledWith(
      `starville/${assetId}/${uploadId}/original.png`,
      expect.any(Buffer),
      'image/png',
    );
    expect(target.failProcessing).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_error_code: 'UNSUPPORTED_IMAGE',
        p_asset_id: assetId,
        p_version_id: versionId,
      }),
    );
    expect(files.removePrivate).toHaveBeenCalledTimes(1);
  });

  it('creates only a new validated draft candidate with local image and persistence mocks', async () => {
    const activeVersionId = '77777777-7777-4777-8777-777777777777';
    const target = gateway();
    vi.mocked(target.getAsset).mockResolvedValueOnce({
      status: 'loaded',
      asset: { ...rawAsset(), activeVersionId },
      versions: [rawVersion(activeVersionId)],
      referenceSummary: rawAsset().referenceSummary,
    });
    vi.mocked(target.createVersion).mockResolvedValueOnce(versionReservation());
    vi.mocked(target.completeProcessing).mockResolvedValueOnce({
      status: 'validated',
      asset: { ...rawAsset(), activeVersionId, recordVersion: 4, versionCount: 2 },
      version: {
        ...rawVersion(),
        versionNumber: 2,
        lifecycleStatus: 'validated',
        editVersion: 2,
      },
    });
    const files = storage();
    const { value } = service(target, files);
    const bytes = await sharp({
      create: {
        width: 480,
        height: 600,
        channels: 4,
        background: { r: 30, g: 120, b: 60, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const result = await value.createVersion(
      identity,
      assetId,
      {
        metadata: versionMetadata(),
        originalFileName: 'tree-pine.png',
        declaredMediaType: 'image/png',
        bytes,
      },
      requestId,
    );

    expect(result).toMatchObject({
      status: 'validated',
      asset: { id: assetId, activeVersionId },
      version: { id: versionId, versionNumber: 2, lifecycleStatus: 'validated' },
    });
    expect(files.storePrivateImmutable).toHaveBeenCalledTimes(4);
    expect(files.removePrivate).not.toHaveBeenCalled();
    expect(target.activateVersion).not.toHaveBeenCalled();
    expect(target.createVersion).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_asset_id: assetId,
        p_expected_asset_revision: 3,
        p_reason: versionMetadata().reason,
      }),
    );
  });

  it('creates a draft successor from immutable artwork without storage or activation', async () => {
    const target = gateway();
    vi.mocked(target.createVersionFromExisting).mockResolvedValueOnce({
      status: 'created',
      asset: { ...rawAsset(), activeVersionId: sourceVersionId, recordVersion: 4, versionCount: 2 },
      version: {
        ...rawVersion(versionId),
        versionNumber: 2,
        lifecycleStatus: 'draft',
        validationStatus: 'pending',
        validationResults: null,
        editVersion: 1,
      },
    });
    const files = storage();
    const { value } = service(target, files);

    const result = await value.createVersionFromExisting(
      identity,
      assetId,
      {
        sourceVersionId,
        configurationMode: 'copy',
        expectedAssetRevision: 3,
        reason: 'Create an editable successor for corrected anchor configuration.',
        idempotencyKey: requestId,
        confirmed: true,
      },
      requestId,
    );

    expect(result).toMatchObject({
      status: 'created',
      asset: { id: assetId, activeVersionId: sourceVersionId },
      version: { id: versionId, lifecycleStatus: 'draft', validationStatus: 'pending' },
    });
    expect(target.createVersionFromExisting).toHaveBeenCalledWith(identity, {
      p_asset_id: assetId,
      p_source_version_id: sourceVersionId,
      p_configuration_mode: 'copy',
      p_expected_asset_revision: 3,
      p_reason: 'Create an editable successor for corrected anchor configuration.',
      p_request_id: requestId,
      p_rate_limit: 30,
    });
    expect(files.storePrivateImmutable).not.toHaveBeenCalled();
    expect(target.activateVersion).not.toHaveBeenCalled();
  });

  it('maps a bucket failure safely and cleans any partial private objects', async () => {
    const target = gateway();
    vi.mocked(target.getAsset).mockResolvedValueOnce({
      status: 'loaded',
      asset: rawAsset(),
      versions: [rawVersion()],
      referenceSummary: rawAsset().referenceSummary,
    });
    vi.mocked(target.createVersion).mockResolvedValueOnce(versionReservation());
    const files = storage();
    vi.mocked(files.storePrivateImmutable).mockRejectedValueOnce(
      new AssetStorageError('PRIVATE_STORAGE_UNAVAILABLE'),
    );
    const { value } = service(target, files);

    await expect(
      value.createVersion(
        identity,
        assetId,
        {
          metadata: versionMetadata(),
          originalFileName: 'tree-pine.png',
          declaredMediaType: 'image/png',
          bytes: Buffer.alloc(32),
        },
        requestId,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'ASSET_STORAGE_UNAVAILABLE', statusCode: 503 }),
    );
    expect(target.failProcessing).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({ p_error_code: 'STORAGE_FAILED' }),
    );
    expect(files.removePrivate).not.toHaveBeenCalled();
    expect(target.completeProcessing).not.toHaveBeenCalled();
  });

  it('waits for derivative writes and cleans only newly stored objects after a partial bucket failure', async () => {
    const target = gateway();
    vi.mocked(target.getAsset).mockResolvedValueOnce({
      status: 'loaded',
      asset: rawAsset(),
      versions: [rawVersion()],
      referenceSummary: rawAsset().referenceSummary,
    });
    vi.mocked(target.createVersion).mockResolvedValueOnce(versionReservation());
    const files = storage();
    vi.mocked(files.storePrivateImmutable)
      .mockResolvedValueOnce('stored')
      .mockResolvedValueOnce('stored')
      .mockRejectedValueOnce(new AssetStorageError('PRIVATE_STORAGE_UNAVAILABLE'))
      .mockResolvedValueOnce('replayed');
    const { value } = service(target, files);
    const bytes = await sharp({
      create: {
        width: 480,
        height: 600,
        channels: 4,
        background: { r: 30, g: 120, b: 60, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    await expect(
      value.createVersion(
        identity,
        assetId,
        {
          metadata: versionMetadata(),
          originalFileName: 'tree-pine.png',
          declaredMediaType: 'image/png',
          bytes,
        },
        requestId,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'ASSET_STORAGE_UNAVAILABLE', statusCode: 503 }),
    );
    expect(files.storePrivateImmutable).toHaveBeenCalledTimes(4);
    expect(files.removePrivate).toHaveBeenCalledWith([
      `starville/${assetId}/${uploadId}/original.png`,
      `starville/${assetId}/${versionId}/processed/source.webp`,
    ]);
    expect(target.completeProcessing).not.toHaveBeenCalled();
  });

  it('does not delete replayed immutable objects when processing a retry fails', async () => {
    const target = gateway();
    vi.mocked(target.getAsset).mockResolvedValueOnce({
      status: 'loaded',
      asset: rawAsset(),
      versions: [rawVersion()],
      referenceSummary: rawAsset().referenceSummary,
    });
    vi.mocked(target.createVersion).mockResolvedValueOnce({
      ...versionReservation(),
      status: 'replayed',
    });
    const files = storage();
    vi.mocked(files.storePrivateImmutable).mockResolvedValueOnce('replayed');
    const { value } = service(target, files);

    await expect(
      value.createVersion(
        identity,
        assetId,
        {
          metadata: versionMetadata(),
          originalFileName: 'tree-pine.png',
          declaredMediaType: 'image/png',
          bytes: Buffer.from('not an image'),
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_FILE_UNSUPPORTED' }));
    expect(files.removePrivate).not.toHaveBeenCalled();
  });

  it('fails safely before storage when the database asset lookup is unavailable', async () => {
    const target = gateway();
    vi.mocked(target.getAsset).mockRejectedValueOnce(new Error('database unavailable'));
    const files = storage();
    const { value } = service(target, files);

    await expect(
      value.createVersion(
        identity,
        assetId,
        {
          metadata: versionMetadata(),
          originalFileName: 'tree-pine.png',
          declaredMediaType: 'image/png',
          bytes: Buffer.alloc(32),
        },
        requestId,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'ASSET_MANAGEMENT_UNAVAILABLE', statusCode: 503 }),
    );
    expect(target.createVersion).not.toHaveBeenCalled();
    expect(files.storePrivateImmutable).not.toHaveBeenCalled();
    expect(files.removePrivate).not.toHaveBeenCalled();
  });

  it('preserves immutable objects for an idempotent retry when database completion is uncertain', async () => {
    const target = gateway();
    vi.mocked(target.getAsset).mockResolvedValueOnce({
      status: 'loaded',
      asset: rawAsset(),
      versions: [rawVersion()],
      referenceSummary: rawAsset().referenceSummary,
    });
    vi.mocked(target.createVersion).mockResolvedValueOnce(versionReservation());
    vi.mocked(target.completeProcessing).mockRejectedValueOnce(new Error('database unavailable'));
    const files = storage();
    const { value } = service(target, files);
    const bytes = await sharp({
      create: {
        width: 480,
        height: 600,
        channels: 4,
        background: { r: 30, g: 120, b: 60, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    await expect(
      value.createVersion(
        identity,
        assetId,
        {
          metadata: versionMetadata(),
          originalFileName: 'tree-pine.png',
          declaredMediaType: 'image/png',
          bytes,
        },
        requestId,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'ASSET_MANAGEMENT_UNAVAILABLE', statusCode: 503 }),
    );
    expect(files.storePrivateImmutable).toHaveBeenCalledTimes(4);
    expect(files.removePrivate).not.toHaveBeenCalled();
    expect(target.failProcessing).not.toHaveBeenCalled();
    expect(target.activateVersion).not.toHaveBeenCalled();
  });

  it('does not turn persistence rate limits into processing failures', async () => {
    const target = gateway();
    vi.mocked(target.completeProcessing).mockResolvedValueOnce({ status: 'rate_limited' });
    const { value } = service(target);
    const bytes = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 30, g: 120, b: 60, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    await expect(
      value.upload(
        identity,
        {
          metadata: metadata(),
          originalFileName: 'willow-tree.png',
          declaredMediaType: 'image/png',
          bytes,
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'RATE_LIMITED', statusCode: 429 }));
    expect(target.failProcessing).not.toHaveBeenCalled();
  });

  it('requires the idempotency key to equal the trusted request ID before persistence', async () => {
    const { target, value } = service();
    await expect(
      value.upload(
        identity,
        {
          metadata: {
            ...metadata(),
            idempotencyKey: '77777777-7777-4777-8777-777777777777',
          },
          originalFileName: 'willow-tree.png',
          declaredMediaType: 'image/png',
          bytes: Buffer.alloc(32),
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_ASSET_REQUEST', statusCode: 400 }));
    expect(target.createUpload).not.toHaveBeenCalled();
  });

  it('rejects a replayed create-version reservation for a different route target', async () => {
    const target = gateway();
    vi.mocked(target.getAsset).mockResolvedValueOnce({
      status: 'loaded',
      asset: rawAsset(),
      versions: [rawVersion()],
      referenceSummary: rawAsset().referenceSummary,
    });
    vi.mocked(target.createVersion).mockResolvedValueOnce({
      status: 'replayed',
      assetId: '77777777-7777-4777-8777-777777777777',
      assetRevision: 3,
      versionId,
      versionNumber: 1,
      versionEditVersion: 1,
      uploadId,
      uploadRevision: 1,
      intakePath: `starville/77777777-7777-4777-8777-777777777777/${uploadId}/original.png`,
    });
    const files = storage();
    const { value } = service(target, files);

    await expect(
      value.createVersion(
        identity,
        assetId,
        {
          metadata: {
            sourceVersionId,
            configurationMode: 'copy',
            expectedAssetRevision: 3,
            reason: 'Create the next reviewed version for this exact asset.',
            idempotencyKey: requestId,
          },
          originalFileName: 'willow-tree.png',
          declaredMediaType: 'image/png',
          bytes: Buffer.alloc(32),
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_STATE_CONFLICT', statusCode: 409 }));
    expect(files.storePrivateImmutable).not.toHaveBeenCalled();
    expect(target.completeProcessing).not.toHaveBeenCalled();
  });

  it('rejects unsupported declared media types before reserving persistence state', async () => {
    const { target, files, value } = service();

    await expect(
      value.upload(
        identity,
        {
          metadata: metadata(),
          originalFileName: 'willow-tree.avif',
          declaredMediaType: 'image/avif',
          bytes: Buffer.alloc(32),
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_FILE_UNSUPPORTED', statusCode: 422 }));

    expect(target.createUpload).not.toHaveBeenCalled();
    expect(files.storePrivateImmutable).not.toHaveBeenCalled();
    expect(target.failProcessing).not.toHaveBeenCalled();
  });

  it('fails activation closed before public writes when private source integrity differs', async () => {
    const target = gateway();
    vi.mocked(target.activationMaterial).mockResolvedValueOnce({
      status: 'loaded',
      assetId,
      versionId,
      slug: 'willow-tree',
      versionNumber: 1,
      checksumSha256: 'a'.repeat(64),
      processedSourcePath: `starville/${assetId}/${versionId}/processed/source.webp`,
      processedPreviewPath: `starville/${assetId}/${versionId}/processed/preview.webp`,
      processedThumbnailPath: `starville/${assetId}/${versionId}/processed/thumbnail.webp`,
    });
    const files = storage();
    const { value } = service(target, files);

    await expect(
      value.activateVersion(
        identity,
        assetId,
        versionId,
        {
          expectedEditVersion: 3,
          expectedAssetRevision: 2,
          reason: 'Activate the reviewed production artwork.',
          idempotencyKey: requestId,
          confirmed: true,
          typedConfirmation: 'ACTIVATE ASSET',
        },
        requestId,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'ASSET_STORAGE_UNAVAILABLE', statusCode: 503 }),
    );
    expect(files.storePublicImmutable).not.toHaveBeenCalled();
    expect(target.activateVersion).not.toHaveBeenCalled();
    expect(target.activationMaterial).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_asset_id: assetId,
        p_version_id: versionId,
        p_expected_asset_revision: 2,
        p_expected_edit_version: 3,
        p_request_id: requestId,
      }),
    );
  });

  it('fails a stale activation preflight before reading or copying any object', async () => {
    const target = gateway();
    vi.mocked(target.activationMaterial).mockResolvedValueOnce({
      status: 'asset_version_conflict',
      assetRevision: 4,
      versionEditVersion: 7,
    });
    const files = storage();
    const { value } = service(target, files);

    await expect(
      value.activateVersion(
        identity,
        assetId,
        versionId,
        {
          expectedEditVersion: 3,
          expectedAssetRevision: 2,
          reason: 'Activate the reviewed production artwork.',
          idempotencyKey: requestId,
          confirmed: true,
          typedConfirmation: 'ACTIVATE ASSET',
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_VERSION_CONFLICT', statusCode: 409 }));
    expect(files.readPrivate).not.toHaveBeenCalled();
    expect(files.storePublicImmutable).not.toHaveBeenCalled();
    expect(target.activateVersion).not.toHaveBeenCalled();
  });

  it('rejects a reused review request identifier with changed intent before lifecycle mutation', async () => {
    const target = gateway();
    vi.mocked(target.claimOperationIntent).mockResolvedValueOnce({ status: 'request_conflict' });
    const { value } = service(target);

    await expect(
      value.reviewVersion(
        identity,
        assetId,
        versionId,
        {
          expectedEditVersion: 4,
          action: 'approve',
          reason: 'Reviewed artwork, anchors, collision, and validation evidence.',
          idempotencyKey: requestId,
          confirmed: true,
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_REQUEST_CONFLICT', statusCode: 409 }));
    expect(target.reviewVersion).not.toHaveBeenCalled();
  });

  it('binds review idempotency to action, reason, target, and expected revision', async () => {
    const target = gateway();
    vi.mocked(target.reviewVersion)
      .mockResolvedValueOnce({ status: 'approved', asset: rawAsset(), version: rawVersion() })
      .mockResolvedValueOnce({ status: 'rejected', asset: rawAsset(), version: rawVersion() });
    const { value } = service(target);
    const base = {
      expectedEditVersion: 4,
      reason: 'Reviewed artwork, anchors, collision, and validation evidence.',
      idempotencyKey: requestId,
      confirmed: true as const,
    };

    await value.reviewVersion(
      identity,
      assetId,
      versionId,
      { ...base, action: 'approve' },
      requestId,
    );
    await value.reviewVersion(
      identity,
      assetId,
      versionId,
      { ...base, action: 'reject' },
      requestId,
    );

    const claims = vi.mocked(target.claimOperationIntent).mock.calls;
    expect(claims[0]?.[1]).toMatchObject({ p_operation: 'review_asset_version' });
    expect(claims[0]?.[1]['p_intent_fingerprint']).not.toBe(claims[1]?.[1]['p_intent_fingerprint']);
  });

  it('rejects a mismatched activation target before private reads or public copies', async () => {
    const target = gateway();
    vi.mocked(target.activationMaterial).mockResolvedValueOnce({
      status: 'loaded',
      assetId: '77777777-7777-4777-8777-777777777777',
      versionId,
      slug: 'willow-tree',
      versionNumber: 1,
      checksumSha256: 'a'.repeat(64),
      processedSourcePath: `starville/${assetId}/${versionId}/processed/source.webp`,
      processedPreviewPath: `starville/${assetId}/${versionId}/processed/preview.webp`,
      processedThumbnailPath: `starville/${assetId}/${versionId}/processed/thumbnail.webp`,
    });
    const files = storage();
    const { value } = service(target, files);

    await expect(
      value.activateVersion(
        identity,
        assetId,
        versionId,
        {
          expectedEditVersion: 3,
          expectedAssetRevision: 2,
          reason: 'Activate the reviewed production artwork.',
          idempotencyKey: requestId,
          confirmed: true,
          typedConfirmation: 'ACTIVATE ASSET',
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_STATE_CONFLICT', statusCode: 409 }));
    expect(files.readPrivate).not.toHaveBeenCalled();
    expect(files.storePublicImmutable).not.toHaveBeenCalled();
  });

  it('preserves an exact same-request activation replay through immutable delivery', async () => {
    const webp = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 30, g: 120, b: 60, alpha: 0.5 },
      },
    })
      .webp()
      .toBuffer();
    const target = gateway();
    vi.mocked(target.activationMaterial).mockResolvedValueOnce({
      status: 'loaded',
      assetId,
      versionId,
      slug: 'willow-tree',
      versionNumber: 1,
      checksumSha256: createHash('sha256').update(webp).digest('hex'),
      processedSourcePath: `starville/${assetId}/${versionId}/processed/source.webp`,
      processedPreviewPath: `starville/${assetId}/${versionId}/processed/preview.webp`,
      processedThumbnailPath: `starville/${assetId}/${versionId}/processed/thumbnail.webp`,
    });
    vi.mocked(target.activateVersion).mockResolvedValueOnce({
      status: 'replayed',
      asset: rawAsset(),
      version: rawVersion(),
    });
    const files = storage();
    vi.mocked(files.readPrivate).mockResolvedValue(webp);
    vi.mocked(files.storePublicImmutable).mockResolvedValue('replayed');
    const { value } = service(target, files);

    await expect(
      value.activateVersion(
        identity,
        assetId,
        versionId,
        {
          expectedEditVersion: 3,
          expectedAssetRevision: 2,
          reason: 'Activate the reviewed production artwork.',
          idempotencyKey: requestId,
          confirmed: true,
          typedConfirmation: 'ACTIVATE ASSET',
        },
        requestId,
      ),
    ).resolves.toMatchObject({
      status: 'replayed',
      asset: { id: assetId },
      version: { id: versionId },
    });
    expect(files.storePublicImmutable).toHaveBeenCalledTimes(3);
    expect(target.activateVersion).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_asset_id: assetId,
        p_version_id: versionId,
        p_expected_asset_revision: 2,
        p_expected_edit_version: 3,
        p_request_id: requestId,
      }),
    );
  });

  it('maps reference-protected archival to a safe conflict and keeps the target exact', async () => {
    const target = gateway();
    vi.mocked(target.archiveAsset).mockResolvedValueOnce({ status: 'referenced' });
    const { value } = service(target);

    await expect(
      value.archiveAsset(
        identity,
        assetId,
        {
          expectedAssetRevision: 3,
          reason: 'Archive this retired unreferenced production asset.',
          idempotencyKey: requestId,
          confirmed: true,
        },
        requestId,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_REFERENCED', statusCode: 409 }));
    expect(target.archiveAsset).toHaveBeenCalledWith(identity, {
      p_asset_id: assetId,
      p_expected_asset_revision: 3,
      p_reason: 'Archive this retired unreferenced production asset.',
      p_request_id: requestId,
      p_rate_limit: 30,
    });
  });

  it('maps private-preview storage failures to the dedicated safe storage response', async () => {
    const target = gateway();
    vi.mocked(target.previewMaterial).mockResolvedValueOnce({
      status: 'loaded',
      assetId,
      versionId,
      lifecycleStatus: 'in_review',
      originalPath: null,
      processedSourcePath: `starville/${assetId}/${versionId}/processed/source.webp`,
      processedPreviewPath: `starville/${assetId}/${versionId}/processed/preview.webp`,
      processedThumbnailPath: `starville/${assetId}/${versionId}/processed/thumbnail.webp`,
    });
    const files = storage();
    vi.mocked(files.readPrivate).mockRejectedValueOnce(
      new AssetStorageError('PRIVATE_STORAGE_UNAVAILABLE'),
    );
    const { value } = service(target, files);

    await expect(
      value.readMedia(identity, assetId, versionId, 'preview', requestId),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'ASSET_STORAGE_UNAVAILABLE', statusCode: 503 }),
    );
  });

  it('serves an exact target-bound original with its canonical decoded media type', async () => {
    const png = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 30, g: 120, b: 60, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const target = gateway();
    const originalPath = `starville/${assetId}/${uploadId}/original.png`;
    vi.mocked(target.previewMaterial).mockResolvedValueOnce({
      status: 'loaded',
      assetId,
      versionId,
      lifecycleStatus: 'in_review',
      originalPath,
      processedSourcePath: `starville/${assetId}/${versionId}/processed/source.webp`,
      processedPreviewPath: `starville/${assetId}/${versionId}/processed/preview.webp`,
      processedThumbnailPath: `starville/${assetId}/${versionId}/processed/thumbnail.webp`,
    });
    const files = storage();
    vi.mocked(files.readPrivate).mockResolvedValueOnce(png);
    const { value } = service(target, files);

    await expect(
      value.readMedia(identity, assetId, versionId, 'original', requestId),
    ).resolves.toMatchObject({
      bytes: png,
      mediaType: 'image/png',
      checksum: createHash('sha256').update(png).digest('hex'),
    });
    expect(files.readPrivate).toHaveBeenCalledWith(originalPath);
  });

  it('reports an unavailable original without hiding the sanitized derivative material', async () => {
    const target = gateway();
    vi.mocked(target.previewMaterial).mockResolvedValueOnce({
      status: 'loaded',
      assetId,
      versionId,
      lifecycleStatus: 'in_review',
      originalPath: null,
      processedSourcePath: `starville/${assetId}/${versionId}/processed/source.webp`,
      processedPreviewPath: `starville/${assetId}/${versionId}/processed/preview.webp`,
      processedThumbnailPath: `starville/${assetId}/${versionId}/processed/thumbnail.webp`,
    });
    const files = storage();
    const { value } = service(target, files);

    await expect(
      value.readMedia(identity, assetId, versionId, 'original', requestId),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_NOT_FOUND', statusCode: 404 }));
    expect(files.readPrivate).not.toHaveBeenCalled();
  });

  it('rejects an original intake path that is not owned by the requested asset', async () => {
    const target = gateway();
    vi.mocked(target.previewMaterial).mockResolvedValueOnce({
      status: 'loaded',
      assetId,
      versionId,
      lifecycleStatus: 'in_review',
      originalPath: `starville/77777777-7777-4777-8777-777777777777/${uploadId}/original.png`,
      processedSourcePath: `starville/${assetId}/${versionId}/processed/source.webp`,
      processedPreviewPath: `starville/${assetId}/${versionId}/processed/preview.webp`,
      processedThumbnailPath: `starville/${assetId}/${versionId}/processed/thumbnail.webp`,
    });
    const files = storage();
    const { value } = service(target, files);

    await expect(
      value.readMedia(identity, assetId, versionId, 'original', requestId),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'ASSET_STORAGE_UNAVAILABLE', statusCode: 503 }),
    );
    expect(files.readPrivate).not.toHaveBeenCalled();
  });
});
