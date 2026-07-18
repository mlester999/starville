import { describe, expect, it, vi } from 'vitest';

import { getWorldManifest } from '@starville/game-content';
import type { MapManifest } from '@starville/game-core';

import type { LogContext, ServiceLogger } from '../contracts.js';
import type {
  PlayerWorldGateway,
  PinnedPublishedWorldView,
  PinnedWorldAssetMaterial,
  PinnedWorldTransitionView,
  PublishedWorldView,
  WorldTransitionView,
} from './player-contracts.js';
import { pinnedAssetMaterialSchema } from './player-gateway.js';
import { createPlayerWorldService } from './player-service.js';

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

const lanternVersionId = '11111111-1111-4111-8111-111111111111';
const meadowVersionId = '22222222-2222-4222-8222-222222222222';
const checkedAt = '2026-07-12T04:00:00.000Z';

function pinnedAssets(manifest: MapManifest): readonly PinnedWorldAssetMaterial[] {
  return manifest.assets.map((assetKey, index) => ({
    assetKey,
    versionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    checksumSha256: 'c'.repeat(64),
    bundledManifestVersion: '1.0.0',
    mediaType: null,
    width: null,
    height: null,
    renderWidth: null,
    renderHeight: null,
    scale: 1,
    anchorX: 0.5,
    anchorY: 1,
    footAnchorX: 0.5,
    footAnchorY: 1,
    depthAnchorX: 0.5,
    depthAnchorY: 1,
    collisionProfile: { shape: 'none', blocking: false },
    supportedRotations: [0],
    defaultRotation: 0,
    developmentMarker: true,
    delivery: null,
    fallback: 'repository_procedural',
  }));
}

function publicAssets(materials: readonly PinnedWorldAssetMaterial[]) {
  return materials.map((material) => ({
    assetKey: material.assetKey,
    versionId: material.versionId,
    checksum: material.checksumSha256,
    bundledManifestVersion: material.bundledManifestVersion,
    url: null,
    mediaType: null,
    width: null,
    height: null,
    renderWidth: null,
    renderHeight: null,
    scale: material.scale,
    anchorX: material.anchorX,
    anchorY: material.anchorY,
    footAnchorX: material.footAnchorX,
    footAnchorY: material.footAnchorY,
    depthAnchorX: material.depthAnchorX,
    depthAnchorY: material.depthAnchorY,
    collision: material.collisionProfile,
    supportedRotations: [...material.supportedRotations],
    defaultRotation: material.defaultRotation,
    developmentMarker: true,
  }));
}

const lanternManifest = getWorldManifest('lantern-square');
const lanternMaterials = pinnedAssets(lanternManifest);
const lanternWorld: PinnedPublishedWorldView = {
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
    publishedAt: checkedAt,
  },
  manifest: lanternManifest,
  playerState: {
    mapId: 'lantern-square',
    mapVersionId: lanternVersionId,
    x: 12,
    y: 7.5,
    facingDirection: 'south',
    gameStateVersion: 2,
    updatedAt: checkedAt,
    lastTransitionAt: null,
  },
  assetDeliveries: lanternMaterials,
};

const lanternPublicWorld: PublishedWorldView = {
  ...lanternWorld,
  assetDeliveries: publicAssets(lanternMaterials),
};

const meadowManifest = getWorldManifest('moonpetal-meadow');
const meadowMaterials = pinnedAssets(meadowManifest);
const meadowTransition: PinnedWorldTransitionView = {
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
    publishedAt: checkedAt,
  },
  manifest: meadowManifest,
  playerState: {
    mapId: 'moonpetal-meadow',
    mapVersionId: meadowVersionId,
    x: 10,
    y: 14.5,
    facingDirection: 'north',
    gameStateVersion: 3,
    updatedAt: checkedAt,
    lastTransitionAt: checkedAt,
  },
  transition: {
    exitId: 'exit-north',
    fromMapId: 'lantern-square',
    toMapId: 'moonpetal-meadow',
    destinationSpawnId: 'from-south',
    completedAt: checkedAt,
  },
  assetDeliveries: meadowMaterials,
};

const meadowPublicTransition: WorldTransitionView = {
  ...meadowTransition,
  assetDeliveries: publicAssets(meadowMaterials),
};

function gateway(): PlayerWorldGateway {
  return {
    loadCurrent: vi.fn(async () => lanternWorld),
    loadPublishedManifest: vi.fn(async () => ({
      map: lanternWorld.map,
      version: lanternWorld.version,
      manifest: lanternWorld.manifest,
      assetDeliveries: lanternWorld.assetDeliveries,
    })),
    transition: vi.fn(async () => meadowTransition),
  };
}

function service(target = gateway()) {
  return {
    target,
    value: createPlayerWorldService({
      gateway: target,
      logger: new SilentLogger(),
      manifestReadRateLimit: 180,
      transitionRateLimit: 30,
      publicAssetUrl: (path) => `https://assets.example.test/${path}`,
    }),
  };
}

describe('player world service', () => {
  it('loads only a structurally valid publication matching authoritative player state', async () => {
    const { target, value } = service();
    await expect(value.loadCurrent('server-derived-wallet', 'world-current')).resolves.toEqual(
      lanternPublicWorld,
    );
    expect(target.loadCurrent).toHaveBeenCalledWith('server-derived-wallet', 'world-current', 180);
  });

  it('preserves unresolved legacy repository pins so the client can render missing safely', async () => {
    const legacy = {
      ...lanternMaterials[0]!,
      bundledManifestVersion: null,
      fallback: null,
    };
    expect(pinnedAssetMaterialSchema.safeParse(legacy).success).toBe(true);

    const target = gateway();
    vi.mocked(target.loadCurrent).mockResolvedValueOnce({
      ...lanternWorld,
      assetDeliveries: [legacy, ...lanternMaterials.slice(1)],
    });
    const loaded = await service(target).value.loadCurrent('wallet', 'legacy-repository-pin');

    expect(loaded.assetDeliveries[0]).toEqual(
      expect.objectContaining({
        assetKey: legacy.assetKey,
        bundledManifestVersion: null,
        developmentMarker: true,
        url: null,
      }),
    );
  });

  it('fails closed when persistence returns a mismatched or malformed publication', async () => {
    const target = gateway();
    vi.mocked(target.loadCurrent).mockResolvedValueOnce({
      ...lanternWorld,
      playerState: { ...lanternWorld.playerState, mapVersionId: meadowVersionId },
    });
    const { value } = service(target);
    await expect(value.loadCurrent('wallet', 'invalid-publication')).rejects.toEqual(
      expect.objectContaining({ code: 'WORLD_CONTENT_INVALID', statusCode: 503 }),
    );
  });

  it('maps only pinned immutable public object keys to safe delivery URLs', async () => {
    const production = {
      ...lanternMaterials[0]!,
      mediaType: 'image/webp' as const,
      width: 1024,
      height: 1024,
      renderWidth: 512,
      renderHeight: 512,
      developmentMarker: false,
      bundledManifestVersion: null,
      delivery: {
        bucket: 'game-assets' as const,
        objectPath: `starville/${lanternMaterials[0]!.assetKey}/v2/source.webp`,
      },
      fallback: null,
    };
    const target = gateway();
    vi.mocked(target.loadCurrent).mockResolvedValueOnce({
      ...lanternWorld,
      assetDeliveries: [production, ...lanternMaterials.slice(1)],
    });
    const { value } = service(target);

    const loaded = await value.loadCurrent('wallet', 'production-delivery');
    expect(loaded.assetDeliveries[0]).toEqual(
      expect.objectContaining({
        assetKey: production.assetKey,
        url: `https://assets.example.test/starville/${production.assetKey}/v2/source.webp`,
        developmentMarker: false,
      }),
    );
    expect(loaded.assetDeliveries[0]).not.toHaveProperty('delivery');
    expect(loaded.assetDeliveries[0]).not.toHaveProperty('objectPath');
  });

  it('rejects missing pins and cross-key public object paths', async () => {
    const missing = gateway();
    vi.mocked(missing.loadCurrent).mockResolvedValueOnce({
      ...lanternWorld,
      assetDeliveries: lanternMaterials.slice(1),
    });
    await expect(service(missing).value.loadCurrent('wallet', 'missing-pin')).rejects.toEqual(
      expect.objectContaining({ code: 'WORLD_CONTENT_INVALID' }),
    );

    const crossKey = gateway();
    vi.mocked(crossKey.loadCurrent).mockResolvedValueOnce({
      ...lanternWorld,
      assetDeliveries: [
        {
          ...lanternMaterials[0]!,
          mediaType: 'image/webp',
          width: 1024,
          height: 1024,
          renderWidth: 512,
          renderHeight: 512,
          developmentMarker: false,
          bundledManifestVersion: null,
          delivery: {
            bucket: 'game-assets',
            objectPath: 'starville/different-asset/v1/source.webp',
          },
          fallback: null,
        },
        ...lanternMaterials.slice(1),
      ],
    });
    await expect(service(crossKey).value.loadCurrent('wallet', 'cross-key')).rejects.toEqual(
      expect.objectContaining({ code: 'WORLD_CONTENT_INVALID' }),
    );
  });

  it.each([
    ['suspended', 'PLAYER_SUSPENDED', 403],
    ['rename_required', 'PLAYER_RENAME_REQUIRED', 409],
    ['world_unavailable', 'WORLD_UNAVAILABLE', 503],
  ] as const)('maps trusted %s state to a safe response', async (status, code, statusCode) => {
    const target = gateway();
    vi.mocked(target.loadCurrent).mockResolvedValueOnce(status);
    const { value } = service(target);
    await expect(value.loadCurrent('wallet', `status-${status}`)).rejects.toEqual(
      expect.objectContaining({ code, statusCode }),
    );
  });

  it('rejects draft IDs, arbitrary destinations, coordinates, and unknown fields before transition persistence', async () => {
    const { target, value } = service();
    await expect(
      value.transition(
        'wallet',
        {
          exitId: 'exit-north',
          expectedGameStateVersion: 2,
          expectedMapVersionId: lanternVersionId,
          destinationMapId: 'moonpetal-meadow',
          destinationSpawnId: 'from-south',
          x: 10,
          y: 14.5,
          draftVersionId: meadowVersionId,
        },
        'arbitrary-transition',
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'INVALID_WORLD_TRANSITION', statusCode: 400 }),
    );
    expect(target.transition).not.toHaveBeenCalled();
  });

  it('passes only the exit and optimistic versions to server-authoritative transition resolution', async () => {
    const { target, value } = service();
    await expect(
      value.transition(
        'wallet',
        {
          exitId: 'exit-north',
          expectedGameStateVersion: 2,
          expectedMapVersionId: lanternVersionId,
        },
        'travel-north',
      ),
    ).resolves.toEqual(meadowPublicTransition);
    expect(target.transition).toHaveBeenCalledWith(
      'wallet',
      {
        exitId: 'exit-north',
        expectedGameStateVersion: 2,
        expectedMapVersionId: lanternVersionId,
      },
      'travel-north',
      30,
    );
  });

  it('rejects a transition response whose destination metadata disagrees with the publication', async () => {
    const target = gateway();
    vi.mocked(target.transition).mockResolvedValueOnce({
      ...meadowTransition,
      transition: { ...meadowTransition.transition, toMapId: 'lantern-square' },
    });
    const { value } = service(target);
    await expect(
      value.transition(
        'wallet',
        {
          exitId: 'exit-north',
          expectedGameStateVersion: 2,
          expectedMapVersionId: lanternVersionId,
        },
        'mismatched-transition',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'WORLD_CONTENT_INVALID' }));
  });
});
