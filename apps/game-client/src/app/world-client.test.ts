import { afterEach, describe, expect, it, vi } from 'vitest';

import { getWorldManifest } from '@starville/game-content';

import { PlayerRequestError } from './player-client';
import {
  loadCurrentPublishedWorld,
  loadPublishedWorldManifest,
  transitionPublishedWorld,
} from './world-client';

const originalFetch = globalThis.fetch;
const publishedAt = '2026-07-12T04:00:00.000Z';
const lanternVersionId = '11111111-1111-4111-8111-111111111111';
const meadowVersionId = '22222222-2222-4222-8222-222222222222';

const lanternWorld = {
  map: {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'lantern-square',
    displayName: 'Lantern Square',
    description: 'The lantern-lit village center where four roads meet beside the stream.',
  },
  version: {
    id: lanternVersionId,
    versionNumber: 1,
    checksum: 'a'.repeat(64),
    publishedAt,
  },
  manifest: getWorldManifest('lantern-square'),
  playerState: {
    mapId: 'lantern-square',
    mapVersionId: lanternVersionId,
    x: 12,
    y: 7.5,
    facingDirection: 'south',
    gameStateVersion: 2,
    updatedAt: publishedAt,
    lastTransitionAt: null,
  },
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function success(data: unknown): Response {
  return Response.json({ success: true, data, requestId: 'phase6-client-test' });
}

describe('published world client boundary', () => {
  it('loads current world through the credentialed protected player route', async () => {
    globalThis.fetch = vi.fn(async () => success(lanternWorld));
    await expect(loadCurrentPublishedWorld('http://localhost:4000')).resolves.toMatchObject({
      map: { slug: 'lantern-square' },
      assetDeliveries: [],
      playerState: { mapVersionId: lanternVersionId },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL('http://localhost:4000/api/v1/token-access/player/world/current'),
      expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store' }),
    );
  });

  it('loads an allowlisted published manifest without accepting a draft version', async () => {
    globalThis.fetch = vi.fn(async () =>
      success({
        map: lanternWorld.map,
        version: lanternWorld.version,
        manifest: lanternWorld.manifest,
      }),
    );
    await expect(
      loadPublishedWorldManifest('http://localhost:4000', 'lantern-square'),
    ).resolves.toMatchObject({ manifest: { id: 'lantern-square' } });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL(
        'http://localhost:4000/api/v1/token-access/player/world/maps/lantern-square/manifest',
      ),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('accepts only version-pinned production deliveries declared by the manifest', async () => {
    const manifest = {
      ...lanternWorld.manifest,
      assets: [...lanternWorld.manifest.assets, 'moonpetal-cottage'],
      objects: [
        { ...lanternWorld.manifest.objects[0]!, assetId: 'moonpetal-cottage' },
        ...lanternWorld.manifest.objects.slice(1),
      ],
    };
    const delivery = {
      assetKey: 'moonpetal-cottage',
      versionId: '55555555-5555-4555-8555-555555555555',
      checksum: 'c'.repeat(64),
      bundledManifestVersion: null,
      url: 'https://assets.example.test/storage/v1/object/public/game-assets/starville/moonpetal-cottage/v1/source.webp',
      mediaType: 'image/webp',
      width: 1024,
      height: 1024,
      renderWidth: 256,
      renderHeight: 256,
      scale: 1,
      anchorX: 0.5,
      anchorY: 1,
      footAnchorX: 0.5,
      footAnchorY: 1,
      depthAnchorX: 0.5,
      depthAnchorY: 1,
      collision: { shape: 'none', blocking: false },
      supportedRotations: [0],
      defaultRotation: 0,
      developmentMarker: false,
    } as const;

    globalThis.fetch = vi.fn(async () =>
      success({ ...lanternWorld, manifest, assetDeliveries: [delivery] }),
    );
    await expect(loadCurrentPublishedWorld('http://localhost:4000')).resolves.toMatchObject({
      assetDeliveries: [{ assetKey: 'moonpetal-cottage', versionId: delivery.versionId }],
    });

    globalThis.fetch = vi.fn(async () =>
      success({
        ...lanternWorld,
        assetDeliveries: [{ ...delivery, assetKey: 'undeclared-production-asset' }],
      }),
    );
    await expect(loadCurrentPublishedWorld('http://localhost:4000')).rejects.toEqual(
      expect.objectContaining({ code: 'INVALID_WORLD_RESPONSE', status: 502 }),
    );
  });

  it('sends only exit identity and optimistic versions during travel', async () => {
    globalThis.fetch = vi.fn(async () =>
      success({
        map: {
          id: '44444444-4444-4444-8444-444444444444',
          slug: 'moonpetal-meadow',
          displayName: 'Moonpetal Meadow',
          description: 'A moonlit flower meadow gathered around a quiet stone marker and pond.',
        },
        version: {
          id: meadowVersionId,
          versionNumber: 1,
          checksum: 'b'.repeat(64),
          publishedAt,
        },
        manifest: getWorldManifest('moonpetal-meadow'),
        playerState: {
          mapId: 'moonpetal-meadow',
          mapVersionId: meadowVersionId,
          x: 10,
          y: 14.5,
          facingDirection: 'north',
          gameStateVersion: 3,
          updatedAt: publishedAt,
          lastTransitionAt: publishedAt,
        },
        transition: {
          exitId: 'exit-north',
          fromMapId: 'lantern-square',
          toMapId: 'moonpetal-meadow',
          destinationSpawnId: 'from-south',
          completedAt: publishedAt,
        },
      }),
    );

    await expect(
      transitionPublishedWorld('http://localhost:4000', {
        exitId: 'exit-north',
        expectedGameStateVersion: 2,
        expectedMapVersionId: lanternVersionId,
      }),
    ).resolves.toMatchObject({
      map: { slug: 'moonpetal-meadow' },
      transition: { destinationSpawnId: 'from-south' },
    });

    const request = vi.mocked(globalThis.fetch).mock.calls[0]?.[1];
    expect(request?.body).toBe(
      JSON.stringify({
        exitId: 'exit-north',
        expectedGameStateVersion: 2,
        expectedMapVersionId: lanternVersionId,
      }),
    );
    expect(String(request?.body)).not.toMatch(/destinationMapId|destinationSpawnId|"x"|"y"/u);
  });

  it('fails closed on mismatched, draft-like, or unapproved manifest responses', async () => {
    globalThis.fetch = vi.fn(async () =>
      success({
        ...lanternWorld,
        playerState: { ...lanternWorld.playerState, mapVersionId: meadowVersionId },
        validationResult: { valid: true },
      }),
    );
    await expect(loadCurrentPublishedWorld('http://localhost:4000')).rejects.toEqual(
      expect.objectContaining({ code: 'INVALID_WORLD_RESPONSE', status: 502 }),
    );

    globalThis.fetch = vi.fn(async () =>
      success({
        ...lanternWorld,
        manifest: {
          ...lanternWorld.manifest,
          assets: [...lanternWorld.manifest.assets, 'unknown'],
        },
      }),
    );
    await expect(loadCurrentPublishedWorld('http://localhost:4000')).rejects.toBeInstanceOf(
      PlayerRequestError,
    );
  });
});
