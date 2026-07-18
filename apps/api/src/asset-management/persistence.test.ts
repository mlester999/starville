import { describe, expect, it } from 'vitest';

import { projectAssetDetail, projectAssetMutation, projectReviewQueue } from './persistence.js';

const assetId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-07-13T04:00:00.000Z';

function rawAsset() {
  return {
    id: assetId,
    gameKey: 'starville',
    assetKey: 'willow-tree',
    slug: 'willow-tree',
    friendlyName: 'Willow Tree',
    assetType: 'tree',
    category: 'nature',
    lifecycleStatus: 'draft',
    productionStatus: 'production_candidate',
    activeVersionId: null,
    activeVersionNumber: null,
    thumbnailUrl: null,
    developmentMarkerReplacementKey: null,
    recordVersion: 2,
    versionCount: 1,
    referenceSummary: { published: 0, draft: 0, activeConfiguration: 0, total: 0 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function rawVersion() {
  return {
    id: versionId,
    assetId,
    versionNumber: 1,
    lifecycleStatus: 'draft',
    sourceKind: 'storage_raster',
    checksumSha256: null,
    sourceMimeType: null,
    sourceWidth: null,
    sourceHeight: null,
    sourceSizeBytes: null,
    processedSourceWidth: null,
    processedSourceHeight: null,
    processedSourceSizeBytes: null,
    processedPreviewWidth: null,
    processedPreviewHeight: null,
    processedPreviewSizeBytes: null,
    processedThumbnailWidth: null,
    processedThumbnailHeight: null,
    processedThumbnailSizeBytes: null,
    renderWidth: null,
    renderHeight: null,
    scale: 1,
    anchor: { x: 0.5, y: 1 },
    footAnchor: { x: 0.5, y: 0.95 },
    depthAnchor: { x: 0.5, y: 1 },
    collisionProfile: { shape: 'none', blocking: false },
    supportedRotations: [0],
    defaultRotation: 0,
    interactionCompatibility: ['decorative'],
    transparentBackgroundExpected: true,
    transparencyResult: 'unknown',
    validationStatus: 'pending',
    validationResults: null,
    internalNotes: null,
    editVersion: 1,
    sourcePreviewUrl: null,
    previewUrl: null,
    thumbnailUrl: null,
    createdByAdminId: null,
    submittedByAdminId: null,
    reviewedByAdminId: null,
    approvedByAdminId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    submittedAt: null,
    reviewedAt: null,
    approvedAt: null,
    activatedAt: null,
    tags: [],
  };
}

describe('asset persistence projection', () => {
  it('maps dedicated raw SQL vocabulary to the strict safe administrator DTO', () => {
    const detail = projectAssetDetail({
      status: 'loaded',
      asset: rawAsset(),
      versions: [rawVersion()],
      referenceSummary: rawAsset().referenceSummary,
    });

    expect(detail.asset).toMatchObject({
      gameId: 'starville',
      slug: 'willow-tree',
      revision: 2,
      referenceCount: 0,
    });
    expect(detail.versions[0]).toMatchObject({
      processingStatus: 'pending',
      checksumPrefix: null,
      render: {
        renderWidth: 1536,
        renderHeight: 1536,
        footAnchor: { x: 0.5, y: 0.95 },
      },
      internalNotes: '',
    });
    expect(detail.referenceSummary.mayArchive).toBe(true);
  });

  it('fails closed if persistence unexpectedly includes a private object key', () => {
    expect(() =>
      projectAssetDetail({
        status: 'loaded',
        asset: rawAsset(),
        versions: [
          {
            ...rawVersion(),
            processedSourcePath: `starville/${assetId}/${versionId}/processed/source.webp`,
          },
        ],
        referenceSummary: rawAsset().referenceSummary,
      }),
    ).toThrow();
  });

  it('accepts only the bounded authenticated media routes returned for a processed draft', () => {
    const mediaPrefix = `/api/v1/admin/world-assets/${assetId}/versions/${versionId}`;
    const detail = projectAssetDetail({
      status: 'loaded',
      asset: rawAsset(),
      versions: [
        {
          ...rawVersion(),
          sourcePreviewUrl: `${mediaPrefix}/source`,
          previewUrl: `${mediaPrefix}/preview`,
          thumbnailUrl: `${mediaPrefix}/thumbnail`,
        },
      ],
      referenceSummary: rawAsset().referenceSummary,
    });

    expect(detail.versions[0]).toMatchObject({
      sourceUrl: `${mediaPrefix}/source`,
      previewUrl: `${mediaPrefix}/preview`,
      thumbnailUrl: `${mediaPrefix}/thumbnail`,
    });
  });

  it('projects a successful processed-version mutation with relative private media routes', () => {
    const mediaPrefix = `/api/v1/admin/world-assets/${assetId}/versions/${versionId}`;
    expect(
      projectAssetMutation({
        status: 'validated',
        asset: { ...rawAsset(), activeVersionId: versionId },
        version: {
          ...rawVersion(),
          lifecycleStatus: 'validated',
          sourcePreviewUrl: `${mediaPrefix}/source`,
          previewUrl: `${mediaPrefix}/preview`,
          thumbnailUrl: `${mediaPrefix}/thumbnail`,
        },
      }),
    ).toMatchObject({
      status: 'validated',
      asset: { id: assetId, activeVersionId: versionId },
      version: { id: versionId, lifecycleStatus: 'validated' },
    });
  });

  it('keeps the exact sanitized candidate version and reference impact in review rows', () => {
    const queue = projectReviewQueue({
      status: 'loaded',
      items: [
        {
          asset: rawAsset(),
          version: { ...rawVersion(), lifecycleStatus: 'in_review' },
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });

    expect(queue.items[0]).toMatchObject({
      asset: { id: assetId },
      version: { id: versionId, assetId },
      referenceSummary: { published: 0, drafts: 0, activeConfiguration: 0 },
    });
  });

  it('projects the terminal archived lifecycle response without widening its safe DTO', () => {
    const result = projectAssetMutation({
      status: 'archived',
      asset: {
        ...rawAsset(),
        lifecycleStatus: 'archived',
        productionStatus: 'deprecated',
      },
      version: { ...rawVersion(), lifecycleStatus: 'archived' },
    });

    expect(result).toMatchObject({
      status: 'archived',
      asset: { id: assetId, lifecycleStatus: 'archived' },
      version: { id: versionId, lifecycleStatus: 'archived' },
    });
  });
});
