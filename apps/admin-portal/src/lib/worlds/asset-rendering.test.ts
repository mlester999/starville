import type { WorldEditorAssetCandidate } from '../world-assets/contracts';
import { describe, expect, it } from 'vitest';

import { resolveWorldObjectRendering, worldAssetCanvasMetrics } from './asset-rendering';
import type { WorldDraftAssetPin } from './contracts';

const ASSET_ID = '36f4dc81-50f0-4ebd-81f0-f014b27217a5';
const VERSION_ID = 'ee26ba4b-d21c-4b35-9fd4-c7c565f30f4e';
const VERSION_TWO_ID = '9a03dc7d-1039-4841-8680-40775c9b08de';
const timestamp = '2026-07-16T00:00:00.000Z';

function candidate(overrides: Partial<WorldEditorAssetCandidate> = {}): WorldEditorAssetCandidate {
  const base: WorldEditorAssetCandidate = {
    assetKey: 'tree-pine',
    versionId: VERSION_ID,
    asset: {
      id: ASSET_ID,
      gameId: 'starville',
      slug: 'tree-pine',
      friendlyName: 'Tree Pine',
      assetType: 'tree',
      category: 'nature',
      lifecycleStatus: 'active',
      productionStatus: 'approved_production',
      activeVersionId: VERSION_ID,
      developmentMarkerReplacementKey: null,
      versionCount: 2,
      referenceCount: 4,
      revision: 3,
      thumbnailUrl: `/api/v1/admin/world-assets/${ASSET_ID}/versions/${VERSION_ID}/thumbnail`,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    activeVersion: {
      id: VERSION_ID,
      assetId: ASSET_ID,
      versionNumber: 1,
      lifecycleStatus: 'active',
      processingStatus: 'completed',
      validationStatus: 'valid',
      detectedMediaType: 'image/webp',
      width: 512,
      height: 640,
      sourceSizeBytes: 4096,
      checksumPrefix: '0123456789ab',
      sourceUrl: `/api/v1/admin/world-assets/${ASSET_ID}/versions/${VERSION_ID}/source`,
      previewUrl: `/api/v1/admin/world-assets/${ASSET_ID}/versions/${VERSION_ID}/preview`,
      thumbnailUrl: `/api/v1/admin/world-assets/${ASSET_ID}/versions/${VERSION_ID}/thumbnail`,
      render: {
        renderWidth: 256,
        renderHeight: 320,
        scale: 1,
        anchor: { x: 0.5, y: 0.5 },
        footAnchor: { x: 0.5, y: 0.9 },
        depthAnchor: { x: 0.5, y: 0.88 },
        supportedRotations: [0],
        defaultRotation: 0,
      },
      collision: {
        shape: 'rectangle',
        blocking: true,
        offsetX: -0.35,
        offsetY: -0.2,
        width: 0.7,
        height: 0.4,
      },
      interactionCompatibility: ['decorative'],
      tags: ['tree'],
      internalNotes: '',
      validationResult: null,
      editVersion: 3,
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
    },
    supportedInteractions: ['decorative'],
    supportedRotations: [0],
  };
  return { ...base, ...overrides };
}

function pin(overrides: Partial<WorldDraftAssetPin> = {}): WorldDraftAssetPin {
  return {
    assetId: ASSET_ID,
    assetKey: 'tree-pine',
    friendlyName: 'Tree Pine',
    assetType: 'tree',
    productionStatus: 'approved_production',
    activeVersionId: VERSION_ID,
    referenceCount: 4,
    pinnedVersion: {
      id: VERSION_ID,
      versionNumber: 1,
      lifecycleStatus: 'active',
      processingStatus: 'completed',
      validationStatus: 'valid',
      sourceWidth: 512,
      sourceHeight: 640,
      sourceKind: 'storage_raster',
      processedSourceAvailable: true,
      processedWidth: 512,
      processedHeight: 640,
      render: candidate().activeVersion.render,
      collision: candidate().activeVersion.collision,
    },
    latestVersion: {
      id: VERSION_TWO_ID,
      versionNumber: 2,
      lifecycleStatus: 'validated',
      processingStatus: 'completed',
      validationStatus: 'valid',
      sourceWidth: 480,
      sourceHeight: 600,
    },
    ...overrides,
  };
}

const object = {
  id: 'tree-ne',
  assetId: 'tree-pine',
  kind: 'tree' as const,
  x: 20.8,
  y: 9.1,
  scale: 1.05,
};

function resolve(
  assets: readonly WorldEditorAssetCandidate[],
  overrides: Partial<Parameters<typeof resolveWorldObjectRendering>[0]> = {},
) {
  return resolveWorldObjectRendering({
    manifestAssetKeys: new Set(['tree-pine']),
    object,
    candidates: assets,
    mode: 'mixed',
    allowUnpinnedActive: true,
    ...overrides,
  });
}

describe('world object asset rendering', () => {
  it('uses only the canonical active UUID and the protected processed source route', () => {
    const result = resolve([candidate()]);
    expect(result.status).toBe('asset');
    expect(result.candidate?.versionId).toBe(VERSION_ID);
    expect(result.mediaUrl).toBe(`/api/world-assets/${ASSET_ID}/versions/${VERSION_ID}/source`);
    expect(result.mediaUrl).not.toContain('/original');
    expect(result.explanation).toContain('current active immutable Version 1');
  });

  it('renders the retained pin even when a different immutable version is active', () => {
    const versionTwoCandidate = candidate({
      versionId: VERSION_TWO_ID,
      asset: { ...candidate().asset, activeVersionId: VERSION_TWO_ID },
      activeVersion: {
        ...candidate().activeVersion,
        id: VERSION_TWO_ID,
        versionNumber: 2,
      },
    });
    const result = resolve([versionTwoCandidate], { pins: [pin()] });
    expect(result.status).toBe('asset');
    expect(result.reason).toBe('pinned_asset');
    expect(result.renderedVersionId).toBe(VERSION_ID);
    expect(result.mediaUrl).toContain(`/versions/${VERSION_ID}/source`);
    expect(result.mediaUrl).not.toContain(VERSION_TWO_ID);
    expect(result.explanation).toContain('exact version pinned by this world draft');
    expect(pin().latestVersion).toMatchObject({
      versionNumber: 2,
      lifecycleStatus: 'validated',
      validationStatus: 'valid',
      sourceWidth: 480,
      sourceHeight: 600,
    });
  });

  it('does not guess an active version when a stable view has no retained pin', () => {
    const result = resolve([candidate()], { allowUnpinnedActive: false });
    expect(result.status).toBe('marker');
    expect(result.reason).toBe('pinned_version_unavailable');
  });

  it('does not auto-render a production replacement for a development marker reference', () => {
    const replacement = candidate({
      assetKey: 'tree-pine-production',
      asset: {
        ...candidate().asset,
        slug: 'tree-pine-production',
        developmentMarkerReplacementKey: 'tree-pine',
      },
    });
    const result = resolve([replacement]);
    expect(result.status).toBe('marker');
    expect(result.reason).toBe('explicit_replacement_required');
    expect(result.replacementCandidate?.asset.id).toBe(ASSET_ID);
  });

  it('keeps repository development markers as explicit fallbacks', () => {
    const marker = candidate({
      asset: {
        ...candidate().asset,
        productionStatus: 'development_marker',
      },
      activeVersion: {
        ...candidate().activeVersion,
        detectedMediaType: null,
        sourceUrl: null,
        previewUrl: null,
        thumbnailUrl: null,
      },
    });
    const result = resolve([marker]);
    expect(result.status).toBe('marker');
    expect(result.reason).toBe('development_marker');
  });

  it('falls back for missing media, failed loading, unsafe lifecycle, and unlisted keys', () => {
    expect(
      resolve([
        candidate({
          activeVersion: { ...candidate().activeVersion, sourceUrl: null },
        }),
      ]).reason,
    ).toBe('processed_media_unavailable');
    expect(resolve([candidate()], { failedVersionIds: new Set([VERSION_ID]) }).reason).toBe(
      'media_load_failed',
    );
    expect(
      resolve([
        candidate({
          activeVersion: {
            ...candidate().activeVersion,
            validationStatus: 'pending',
          },
        }),
      ]).reason,
    ).toBe('unsafe_version_state');
    expect(resolve([candidate()], { manifestAssetKeys: new Set() }).reason).toBe(
      'unlisted_asset_key',
    );
  });

  it('supports explicit marker and collision-debug modes without changing resolution data', () => {
    expect(resolve([candidate()], { mode: 'markers' }).reason).toBe('marker_mode');
    expect(resolve([candidate()], { mode: 'collision' }).reason).toBe('collision_debug_mode');
    expect(resolve([candidate()], { mode: 'assets' }).status).toBe('asset');
  });

  it('uses configured render dimensions, scale, and foot anchor for placement', () => {
    const metrics = worldAssetCanvasMetrics(candidate());
    expect(metrics).toEqual({ width: 64, height: 80, x: -32, y: -72 });
  });
});
