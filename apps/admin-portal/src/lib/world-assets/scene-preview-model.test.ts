import { getPhase7LocalDraft } from '@starville/game-content';
import { PLAYER_FOOT_RADIUS, isPositionWalkable, moveWithCollisions } from '@starville/game-core';
import { describe, expect, it } from 'vitest';

import type { AssetDraftConfiguration, WorldAssetVersion } from './contracts';
import {
  candidateCollisionAtTarget,
  compatibleSceneTargets,
  createSceneTestPad,
  previewDepthRelationship,
  previewScaleGuidance,
  referencePlayerPositions,
  referenceWalkPath,
  scenePreviewCollisions,
  scenePreviewNextAction,
  sceneWorldOptionsFromDirectory,
  sceneWorldContextPath,
  visualReviewChecklist,
} from './scene-preview-model';

const assetId = '36f4dc81-50f0-4ebd-81f0-f014b27217a5';
const versionId = '9a03dc7d-1039-4841-8680-40775c9b08de';

const configuration: AssetDraftConfiguration = {
  friendlyName: 'Tree Pine',
  category: 'nature',
  tags: ['tree'],
  internalNotes: '',
  render: {
    renderWidth: 256,
    renderHeight: 320,
    scale: 1,
    anchor: { x: 0.5, y: 0.5 },
    footAnchor: { x: 0.5, y: 0.9 },
    depthAnchor: { x: 0.5, y: 0.86 },
    supportedRotations: [0],
    defaultRotation: 0,
  },
  collision: {
    shape: 'rectangle',
    blocking: true,
    offsetX: 0,
    offsetY: 0,
    width: 0.64,
    height: 0.54,
  },
  interactionCompatibility: ['decorative'],
};

function candidate(lifecycleStatus: WorldAssetVersion['lifecycleStatus']): WorldAssetVersion {
  return {
    id: versionId,
    assetId,
    versionNumber: 2,
    lifecycleStatus,
    processingStatus: 'completed',
    validationStatus: 'valid',
    detectedMediaType: 'image/png',
    width: 480,
    height: 600,
    sourceSizeBytes: 4096,
    checksumPrefix: 'a'.repeat(16),
    sourceUrl: '/protected/source',
    previewUrl: '/protected/preview',
    thumbnailUrl: '/protected/thumbnail',
    render: configuration.render,
    collision: configuration.collision,
    interactionCompatibility: ['decorative'],
    tags: ['tree'],
    internalNotes: '',
    validationResult: null,
    editVersion: 4,
    createdByAdminId: null,
    submittedByAdminId: null,
    reviewedByAdminId: null,
    approvedByAdminId: null,
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    submittedAt: '2026-07-16T00:00:00.000Z',
    reviewedAt: null,
    approvedAt: null,
    activatedAt: null,
  };
}

describe('non-mutating World Asset scene preview model', () => {
  const manifest = getPhase7LocalDraft('lantern-square').manifest;

  it('prefers the exact Tree Pine placement and filters incompatible objects', () => {
    const targets = compatibleSceneTargets(manifest, 'tree', 'tree-pine');
    expect(targets[0]).toMatchObject({ assetId: 'tree-pine', kind: 'tree' });
    expect(targets.every(({ kind }) => kind === 'tree')).toBe(true);
    expect(targets.some(({ kind }) => kind === 'shop')).toBe(false);
  });

  it('creates a bounded temporary test pad without mutating the world manifest', () => {
    const before = JSON.stringify(manifest);
    const testPad = createSceneTestPad(manifest, 'tree', 'tree-pine');
    expect(testPad?.target).toMatchObject({ id: 'asset-preview-test-pad', kind: 'tree' });
    expect(testPad?.manifest.objects).toHaveLength(manifest.objects.length + 1);
    expect(JSON.stringify(manifest)).toBe(before);
    expect(createSceneTestPad(manifest, 'item_icon', 'tree-pine')).toBeNull();
  });

  it('projects saved candidate collision at the target and preserves source map collision', () => {
    const target = compatibleSceneTargets(manifest, 'tree', 'tree-pine')[0]!;
    const before = JSON.stringify(manifest.collisions);
    expect(candidateCollisionAtTarget(configuration, target)).toMatchObject({
      id: 'asset-preview-candidate-collision',
      shape: 'rectangle',
      blocking: true,
      width: 0.64,
      height: 0.54,
    });
    const collisions = scenePreviewCollisions(manifest, target, configuration);
    expect(collisions.some(({ id }) => id === 'asset-preview-candidate-collision')).toBe(true);
    expect(JSON.stringify(manifest.collisions)).toBe(before);
  });

  it('uses game collision movement and reports front versus behind depth correctly', () => {
    const target = compatibleSceneTargets(manifest, 'tree', 'tree-pine')[0]!;
    const positions = referencePlayerPositions(manifest, target);
    expect(previewDepthRelationship({ target, player: positions.front, configuration })).toBe(
      'front',
    );
    expect(previewDepthRelationship({ target, player: positions.behind, configuration })).toBe(
      'behind',
    );
    const collisions = scenePreviewCollisions(manifest, target, configuration);
    const blocked = candidateCollisionAtTarget(configuration, target)!;
    expect(isPositionWalkable(target, PLAYER_FOOT_RADIUS, manifest.safeSaveBounds, [blocked])).toBe(
      false,
    );
    const start = referenceWalkPath(manifest, target, 'tree')[0]!;
    const moved = moveWithCollisions(
      start,
      { x: 0.1, y: -0.1 },
      PLAYER_FOOT_RADIUS,
      manifest.safeSaveBounds,
      collisions,
    );
    expect(moved).not.toEqual(start);
  });

  it('keeps guidance, checklist state, lifecycle action, and endpoint read-only and explicit', () => {
    expect(previewScaleGuidance(configuration)).toBe('Looks balanced');
    expect(visualReviewChecklist('tree')).toContain('Branches do not block movement');
    expect(scenePreviewNextAction(candidate('in_review'))).toEqual({
      label: 'Return to review workflow',
      explanation: 'Visual preview does not approve or reject this candidate.',
    });
    const path = sceneWorldContextPath({
      mapId: '11111111-1111-4111-8111-111111111111',
      versionId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Lantern Square',
      slug: 'lantern-square',
      source: 'published',
      recordVersion: 2,
      versionNumber: 1,
      validationStatus: 'valid',
    });
    expect(path).toContain('/api/world-assets/scene-preview/worlds/');
    expect(path).toContain('source=published');
    expect(path).not.toContain('/save');
    expect(path).not.toContain('/publish');
  });

  it('lists authorized published snapshots and only validated drafts, with Lantern Square first', () => {
    const timestamp = '2026-07-16T00:00:00.000Z';
    const options = sceneWorldOptionsFromDirectory(
      {
        status: 'loaded',
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'moonpetal-meadow',
            displayName: 'Moonpetal Meadow',
            description: '',
            status: 'active',
            recordVersion: 2,
            activePublishedVersionId: '22222222-2222-4222-8222-222222222222',
            activeVersionNumber: 1,
            activeChecksum: 'a'.repeat(64),
            draftVersionId: null,
            draftValidationStatus: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: '33333333-3333-4333-8333-333333333333',
            slug: 'lantern-square',
            displayName: 'Lantern Square',
            description: '',
            status: 'active',
            recordVersion: 4,
            activePublishedVersionId: '44444444-4444-4444-8444-444444444444',
            activeVersionNumber: 1,
            activeChecksum: 'b'.repeat(64),
            draftVersionId: '55555555-5555-4555-8555-555555555555',
            draftValidationStatus: 'valid',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        page: 1,
        pageSize: 100,
        total: 2,
        totalPages: 1,
      },
      true,
    );
    expect(options.map(({ slug, source }) => `${slug}:${source}`)).toEqual([
      'lantern-square:draft',
      'lantern-square:published',
      'moonpetal-meadow:published',
    ]);
    expect(
      sceneWorldOptionsFromDirectory(
        {
          status: 'loaded',
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
          totalPages: 0,
        },
        false,
      ),
    ).toEqual([]);
  });
});
