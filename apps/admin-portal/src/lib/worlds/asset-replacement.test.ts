import { mapManifestSchema } from '@starville/game-core';
import { describe, expect, it } from 'vitest';

import type { WorldEditorAssetCandidate } from '../world-assets/contracts';
import type { AdminWorldManifest } from './contracts';
import {
  isCompatibleEditorAsset,
  objectInteractionRequirements,
  replaceWorldObjectAssets,
} from './asset-replacement';

const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

function activeCandidate(
  interactionCompatibility: WorldEditorAssetCandidate['supportedInteractions'],
): WorldEditorAssetCandidate {
  const timestamp = '2026-07-13T00:00:00.000Z';
  return {
    assetKey: 'willow-cottage',
    versionId: VERSION_ID,
    asset: {
      id: ASSET_ID,
      gameId: 'starville',
      slug: 'willow-cottage',
      friendlyName: 'Willow Cottage',
      assetType: 'home_entrance',
      category: 'structure',
      lifecycleStatus: 'active',
      productionStatus: 'approved_production',
      activeVersionId: VERSION_ID,
      bundledDefaultVersionId: null,
      bundledManifestVersion: null,
      activeSourceState: 'uploaded_override',
      canRestoreBundledDefault: false,
      developmentMarkerReplacementKey: null,
      versionCount: 1,
      uploadedVersionCount: 1,
      invalidVersionCount: 0,
      referenceCount: 0,
      referenceBreakdown: { world: 0, furniture: 0, farming: 0 },
      revision: 1,
      thumbnailUrl: null,
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
      height: 512,
      sourceSizeBytes: 1024,
      checksumPrefix: '0123456789ab',
      sourceUrl: null,
      previewUrl: null,
      thumbnailUrl: null,
      render: {
        renderWidth: 256,
        renderHeight: 256,
        scale: 1,
        anchor: { x: 0.5, y: 0.5 },
        footAnchor: { x: 0.5, y: 0.9 },
        depthAnchor: { x: 0.5, y: 0.9 },
        supportedRotations: [0],
        defaultRotation: 0,
      },
      collision: { shape: 'none', blocking: false },
      interactionCompatibility,
      tags: [],
      internalNotes: '',
      validationResult: null,
      editVersion: 1,
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
    supportedInteractions: interactionCompatibility,
    supportedRotations: [0],
  };
}

function fixture(): AdminWorldManifest {
  return mapManifestSchema.parse({
    schemaVersion: 1,
    id: 'lantern-square',
    slug: 'lantern-square',
    name: 'Asset replacement fixture',
    description: 'A bounded editor transaction fixture.',
    version: 1,
    developmentArt: { temporary: true, label: 'Development markers' },
    background: { palette: 'village' },
    width: 12,
    height: 12,
    tileWidth: 128,
    tileHeight: 64,
    projectionOrigin: { x: 0, y: 0 },
    cameraBounds: { minX: 0, minY: 0, maxX: 12, maxY: 12 },
    safeSaveBounds: { minX: 0, minY: 0, maxX: 12, maxY: 12 },
    defaultSpawnId: 'spawn-default',
    spawns: [
      {
        id: 'spawn-default',
        x: 2,
        y: 2,
        facingDirection: 'south',
        purpose: 'default',
        enabled: true,
      },
    ],
    assets: ['marker-cottage', 'oak-tree'],
    terrain: [{ id: 'ground', terrain: 'grass', x: 0, y: 0, width: 12, height: 12, order: 0 }],
    collisions: [
      { id: 'cottage-base', shape: 'rectangle', x: 3, y: 3, width: 2, height: 1, blocking: true },
    ],
    objects: [
      { id: 'cottage-one', assetId: 'marker-cottage', kind: 'building', x: 4, y: 4, scale: 1 },
      { id: 'cottage-two', assetId: 'marker-cottage', kind: 'building', x: 8, y: 4, scale: 0.9 },
      { id: 'tree-one', assetId: 'oak-tree', kind: 'tree', x: 2, y: 8, scale: 1 },
    ],
    interactions: [
      {
        id: 'cottage-door',
        type: 'home_entrance',
        x: 4,
        y: 4,
        range: 1,
        title: 'Enter cottage',
        content: 'Open the private home interior.',
        homeTemplateSlug: 'starter-home',
      },
    ],
    exits: [
      ...(['north', 'east', 'south', 'west'] as const).map((direction) => ({
        id: `exit-${direction}`,
        direction,
        trigger: { x: 0, y: 0, width: 1, height: 1 },
        destinationMapId: null,
        destinationSpawnId: null,
        enabled: false,
        transitionLabel: null,
      })),
    ],
  });
}

describe('world asset replacement transaction', () => {
  it('replaces one visual while preserving identity, transform, interactions, and collision', () => {
    const manifest = fixture();
    const next = replaceWorldObjectAssets({
      manifest,
      lifecycleStatus: 'draft',
      objectIds: ['cottage-one'],
      nextAssetKey: 'willow-cottage',
      collisionImpactAccepted: true,
    });

    expect(next.objects[0]).toEqual({ ...manifest.objects[0], assetId: 'willow-cottage' });
    expect(next.objects[1]).toEqual(manifest.objects[1]);
    expect(next.interactions).toEqual(manifest.interactions);
    expect(next.collisions).toEqual(manifest.collisions);
    expect(next.assets).toEqual(['marker-cottage', 'oak-tree', 'willow-cottage']);
  });

  it('batch-replaces matching objects and removes an unused marker asset', () => {
    const manifest = fixture();
    const next = replaceWorldObjectAssets({
      manifest,
      lifecycleStatus: 'draft',
      objectIds: ['cottage-one', 'cottage-two'],
      nextAssetKey: 'willow-cottage',
      collisionImpactAccepted: true,
    });

    expect(next.objects.slice(0, 2).map(({ assetId }) => assetId)).toEqual([
      'willow-cottage',
      'willow-cottage',
    ]);
    expect(next.assets).toEqual(['oak-tree', 'willow-cottage']);
  });

  it('rejects published changes and unacknowledged collision impact', () => {
    const manifest = fixture();
    expect(() =>
      replaceWorldObjectAssets({
        manifest,
        lifecycleStatus: 'validated',
        objectIds: ['cottage-one'],
        nextAssetKey: 'willow-cottage',
        collisionImpactAccepted: true,
      }),
    ).toThrow(/unpublished world draft/u);
    expect(() =>
      replaceWorldObjectAssets({
        manifest,
        lifecycleStatus: 'published',
        objectIds: ['cottage-one'],
        nextAssetKey: 'willow-cottage',
        collisionImpactAccepted: true,
      }),
    ).toThrow(/unpublished world draft/u);
    expect(() =>
      replaceWorldObjectAssets({
        manifest,
        lifecycleStatus: 'draft',
        objectIds: ['cottage-one'],
        nextAssetKey: 'willow-cottage',
        collisionImpactAccepted: false,
      }),
    ).toThrow(/Collision impact/u);
  });

  it('requires the interaction compatibility owned by the nearest matching map object', () => {
    const base = fixture();
    const target = { ...base.objects[0]!, kind: 'home_entrance' as const };
    const manifest = { ...base, objects: [target, ...base.objects.slice(1)] };
    const required = objectInteractionRequirements(manifest, target);

    expect(required).toEqual(['home_entrance']);
    expect(isCompatibleEditorAsset(activeCandidate([]), target, false, required)).toBe(false);
    expect(
      isCompatibleEditorAsset(activeCandidate(['home_entrance']), target, false, required),
    ).toBe(true);
  });

  it('maps an offset notice to only the nearest sign inside its interaction range', () => {
    const base = fixture();
    const nearSign = {
      id: 'notice-sign-near',
      assetId: 'notice-sign',
      kind: 'sign' as const,
      x: 9.75,
      y: 9.75,
      scale: 1,
    };
    const farSign = { ...nearSign, id: 'notice-sign-far', x: 10.8 };
    const manifest: AdminWorldManifest = {
      ...base,
      assets: [...base.assets, 'notice-sign'],
      objects: [...base.objects, nearSign, farSign],
      interactions: [
        ...base.interactions,
        {
          id: 'village-notice',
          type: 'notice',
          x: 9.75,
          y: 10.25,
          range: 1.65,
          title: 'Village notice',
          content: 'Read the village notice.',
        },
      ],
    };

    expect(objectInteractionRequirements(manifest, nearSign)).toEqual(['sign']);
    expect(objectInteractionRequirements(manifest, farSign)).toEqual([]);
  });
});
