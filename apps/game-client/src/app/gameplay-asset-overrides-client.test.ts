import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS,
  type GameplayAssetOverride,
} from '@starville/asset-management';

import { loadGameplayAssetOverrides } from './gameplay-asset-overrides-client';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function override(): GameplayAssetOverride {
  return {
    assetKey: 'phase7-dev-moonbean',
    versionId: '22222222-2222-4222-8222-222222222222',
    checksum: 'a'.repeat(64),
    source: 'active_uploaded',
    bundledManifestVersion: null,
    url: 'https://assets.example.test/game-assets/starville/phase7-dev-moonbean/v2/source.webp',
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
  };
}

describe('gameplay asset override client', () => {
  it('requests one bounded protected batch and parses only active public candidates', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          status: 'loaded',
          requestedKeyCount: STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS.length,
          items: [override()],
        },
      }),
    );

    await expect(loadGameplayAssetOverrides('http://localhost:4000')).resolves.toEqual([
      override(),
    ]);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(String(url)).toBe('http://localhost:4000/api/v1/token-access/player/asset-overrides');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    const body = JSON.parse(String(init?.body)) as { assetKeys: string[] };
    expect(body.assetKeys).toHaveLength(STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS.length);
    expect(body.assetKeys).toContain('phase7-dev-moonbean');
    expect(body.assetKeys).not.toContain('tree-pine');
  });

  it('fails closed on a mismatched batch count or a foreign response key', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: { status: 'loaded', requestedKeyCount: 1, items: [] },
      }),
    );
    await expect(loadGameplayAssetOverrides('http://localhost:4000')).rejects.toEqual(
      expect.objectContaining({ code: 'INVALID_PLAYER_RESPONSE' }),
    );

    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          status: 'loaded',
          requestedKeyCount: STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS.length,
          items: [{ ...override(), assetKey: 'tree-pine' }],
        },
      }),
    );
    await expect(loadGameplayAssetOverrides('http://localhost:4000')).rejects.toEqual(
      expect.objectContaining({ code: 'INVALID_PLAYER_RESPONSE' }),
    );
  });
});
