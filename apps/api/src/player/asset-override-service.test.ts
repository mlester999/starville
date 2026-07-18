import { describe, expect, it, vi } from 'vitest';

import type { LogContext, ServiceLogger } from '../contracts.js';
import type { PublicApiError } from '../errors.js';
import type {
  GameplayAssetOverrideGateway,
  PersistedGameplayAssetOverride,
} from './asset-override-contracts.js';
import { createGameplayAssetOverrideService } from './asset-override-service.js';

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

const walletAddress = '11111111111111111111111111111111';

function material(
  values: Partial<PersistedGameplayAssetOverride> = {},
): PersistedGameplayAssetOverride {
  return {
    assetKey: 'phase7-dev-moonbean',
    versionId: '22222222-2222-4222-8222-222222222222',
    versionNumber: 2,
    checksumSha256: 'a'.repeat(64),
    bundledManifestVersion: null,
    deliverySourcePath: 'starville/phase7-dev-moonbean/v2/source.webp',
    mediaType: 'image/webp',
    width: 256,
    height: 256,
    renderWidth: 128,
    renderHeight: 128,
    scale: 1,
    anchor: { x: 0.5, y: 1 },
    footAnchor: { x: 0.5, y: 0.92 },
    depthAnchor: { x: 0.5, y: 0.92 },
    collision: { shape: 'none', blocking: false },
    supportedRotations: [0],
    defaultRotation: 0,
    replacementAllowed: true,
    ...values,
  };
}

function service(gateway: GameplayAssetOverrideGateway) {
  return createGameplayAssetOverrideService({
    gateway,
    logger: new SilentLogger(),
    publicAssetUrl: (path) => `https://assets.example.test/game-assets/${path}`,
  });
}

describe('gameplay asset override service', () => {
  it.each([
    {},
    { assetKeys: [] },
    { assetKeys: ['../foreign'] },
    { assetKeys: ['tree-pine'] },
    { assetKeys: ['phase7-dev-moonbean', 'phase7-dev-moonbean'] },
  ])('rejects malformed or foreign key batches before persistence', async (input) => {
    const gateway: GameplayAssetOverrideGateway = { loadActive: vi.fn() };
    await expect(service(gateway).load(walletAddress, input, 'request-1')).rejects.toEqual(
      expect.objectContaining<Partial<PublicApiError>>({
        statusCode: 400,
        code: 'INVALID_ASSET_OVERRIDE_REQUEST',
      }),
    );
    expect(gateway.loadActive).not.toHaveBeenCalled();
  });

  it('projects only requested immutable public derivatives without raw paths', async () => {
    const gateway: GameplayAssetOverrideGateway = {
      loadActive: vi.fn(async () => ({
        status: 'loaded' as const,
        requestedKeyCount: 1,
        overrideCount: 1,
        items: [material()],
      })),
    };
    const result = await service(gateway).load(
      walletAddress,
      { assetKeys: ['phase7-dev-moonbean'] },
      'request-2',
    );

    expect(result.items[0]).toMatchObject({
      assetKey: 'phase7-dev-moonbean',
      source: 'active_uploaded',
      versionId: '22222222-2222-4222-8222-222222222222',
      checksum: 'a'.repeat(64),
      url: 'https://assets.example.test/game-assets/starville/phase7-dev-moonbean/v2/source.webp',
    });
    expect(JSON.stringify(result)).not.toContain('deliverySourcePath');
  });

  it('fails closed on mismatched immutable paths or unrequested persistence rows', async () => {
    const mismatched: GameplayAssetOverrideGateway = {
      loadActive: vi.fn(async () => ({
        status: 'loaded' as const,
        requestedKeyCount: 1,
        overrideCount: 1,
        items: [material({ deliverySourcePath: 'starville/other-key/v2/source.webp' })],
      })),
    };
    await expect(
      service(mismatched).load(walletAddress, { assetKeys: ['phase7-dev-moonbean'] }, 'request-3'),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_OVERRIDE_UNAVAILABLE' }));

    const foreign: GameplayAssetOverrideGateway = {
      loadActive: vi.fn(async () => ({
        status: 'loaded' as const,
        requestedKeyCount: 1,
        overrideCount: 1,
        items: [material({ assetKey: 'phase7-dev-sunroot' })],
      })),
    };
    await expect(
      service(foreign).load(walletAddress, { assetKeys: ['phase7-dev-moonbean'] }, 'request-4'),
    ).rejects.toEqual(expect.objectContaining({ code: 'ASSET_OVERRIDE_UNAVAILABLE' }));
  });

  it('treats an empty active set as a valid bundled-default fallback response', async () => {
    const gateway: GameplayAssetOverrideGateway = {
      loadActive: vi.fn(async () => ({
        status: 'loaded' as const,
        requestedKeyCount: 1,
        overrideCount: 0,
        items: [],
      })),
    };
    await expect(
      service(gateway).load(walletAddress, { assetKeys: ['phase7-dev-moonbean'] }, 'request-5'),
    ).resolves.toEqual({ status: 'loaded', requestedKeyCount: 1, items: [] });
  });
});
