import { getBundledAsset } from '@starville/asset-management';
import { describe, expect, it } from 'vitest';

import type { WorldAssetSummary } from './contracts';
import { buildBundledAssetCoverageReport } from './bundled-coverage';

const timestamp = '2026-07-18T00:00:00.000Z';

function directoryAsset(overrides: Partial<WorldAssetSummary> = {}): WorldAssetSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    gameId: 'starville',
    slug: 'tree-pine',
    friendlyName: 'Tree Pine',
    assetType: 'tree',
    category: 'nature',
    lifecycleStatus: 'active',
    productionStatus: 'approved_production',
    activeVersionId: '22222222-2222-4222-8222-222222222222',
    bundledDefaultVersionId: '33333333-3333-4333-8333-333333333333',
    bundledManifestVersion: '1.0.0',
    activeSourceState: 'uploaded_override',
    canRestoreBundledDefault: true,
    developmentMarkerReplacementKey: null,
    versionCount: 2,
    uploadedVersionCount: 1,
    invalidVersionCount: 0,
    referenceCount: 4,
    referenceBreakdown: { world: 2, furniture: 1, farming: 1 },
    revision: 2,
    thumbnailUrl: '/thumbnail',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('bundled asset coverage report', () => {
  it('separates bundled file readiness from uploaded and active override state', () => {
    const tree = getBundledAsset('tree-pine');
    const fence = getBundledAsset('fence-willow');
    if (tree === undefined || fence === undefined) throw new Error('fixture assets missing');
    const report = buildBundledAssetCoverageReport({
      manifestAssets: [tree, fence],
      directoryAssets: [directoryAsset()],
      mediaEvidence: [
        {
          key: tree.key,
          sourceAvailable: true,
          thumbnailAvailable: true,
          sourceBytes: 2_048,
          thumbnailBytes: 512,
          sourceValidWebp: true,
          thumbnailValidWebp: true,
        },
        {
          key: fence.key,
          sourceAvailable: false,
          thumbnailAvailable: false,
          sourceBytes: null,
          thumbnailBytes: null,
          sourceValidWebp: false,
          thumbnailValidWebp: false,
        },
      ],
    });

    expect(report.totals).toMatchObject({
      stableKeys: 2,
      bundledAvailable: 1,
      registeredKeys: 1,
      uploadedOverrides: 1,
      activeOverrides: 1,
      validationFailures: 0,
      unusedAssets: 0,
      missingSources: 1,
      missingThumbnails: 1,
      referencedByWorlds: 1,
      referencedByFurniture: 1,
      referencedByFarming: 1,
      usingPlaceholders: 0,
    });
    expect(report.rows.find(({ asset }) => asset.key === fence.key)?.status).toBe('missing_source');
  });

  it('reports inactive uploads, validation failures, unused records, and placeholders separately', () => {
    const tree = getBundledAsset('tree-pine');
    if (tree === undefined) throw new Error('fixture asset missing');
    const report = buildBundledAssetCoverageReport({
      manifestAssets: [tree],
      directoryAssets: [
        directoryAsset({
          activeSourceState: 'bundled_default',
          lifecycleStatus: 'active',
          productionStatus: 'development_marker',
          uploadedVersionCount: 2,
          invalidVersionCount: 1,
          referenceCount: 0,
          referenceBreakdown: { world: 0, furniture: 0, farming: 0 },
        }),
      ],
      mediaEvidence: [
        {
          key: tree.key,
          sourceAvailable: true,
          thumbnailAvailable: true,
          sourceBytes: 2_048,
          thumbnailBytes: 512,
          sourceValidWebp: true,
          thumbnailValidWebp: true,
        },
      ],
    });

    expect(report.totals).toMatchObject({
      uploadedOverrides: 1,
      activeOverrides: 0,
      validationFailures: 1,
      unusedAssets: 1,
      usingPlaceholders: 1,
    });
  });
});
