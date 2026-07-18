import { describe, expect, it } from 'vitest';

import { worldDraftAssetPinSchema } from '../src/management';

const ASSET_ID = '36f4dc81-50f0-4ebd-81f0-f014b27217a5';
const VERSION_ONE_ID = 'ee26ba4b-d21c-4b35-9fd4-c7c565f30f4e';
const VERSION_TWO_ID = '9a03dc7d-1039-4841-8680-40775c9b08de';

function treePinePin() {
  return {
    assetId: ASSET_ID,
    assetKey: 'tree-pine',
    friendlyName: 'Tree Pine',
    assetType: 'tree',
    productionStatus: 'development_marker',
    activeVersionId: VERSION_ONE_ID,
    referenceCount: 4,
    pinnedVersion: {
      id: VERSION_ONE_ID,
      versionNumber: 1,
      lifecycleStatus: 'active',
      processingStatus: 'completed',
      validationStatus: 'valid',
      sourceWidth: null,
      sourceHeight: null,
      sourceKind: 'repository_procedural',
      processedSourceAvailable: false,
      processedWidth: null,
      processedHeight: null,
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
      collision: { shape: 'none', blocking: false },
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
  };
}

describe('world draft asset pin contract', () => {
  it('distinguishes the retained active Version 1 pin from validated non-active Version 2', () => {
    const pin = worldDraftAssetPinSchema.parse(treePinePin());
    expect(pin.pinnedVersion).toMatchObject({
      id: VERSION_ONE_ID,
      versionNumber: 1,
      lifecycleStatus: 'active',
    });
    expect(pin.latestVersion).toMatchObject({
      id: VERSION_TWO_ID,
      versionNumber: 2,
      lifecycleStatus: 'validated',
      validationStatus: 'valid',
      sourceWidth: 480,
      sourceHeight: 600,
    });
  });

  it('rejects private storage and intake fields from the editor pin contract', () => {
    expect(
      worldDraftAssetPinSchema.safeParse({
        ...treePinePin(),
        privateIntakePath: 'private/intake/tree-pine.png',
      }).success,
    ).toBe(false);
    expect(JSON.stringify(worldDraftAssetPinSchema.parse(treePinePin()))).not.toContain('Path');
  });
});
