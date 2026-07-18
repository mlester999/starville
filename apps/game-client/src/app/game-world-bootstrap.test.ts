import { afterEach, describe, expect, it, vi } from 'vitest';

import { STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS } from '@starville/asset-management';
import { lanternSquareManifest } from '@starville/game-core';

import { beginGameWorldReads } from './game-world-bootstrap';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('game world protected bootstrap reads', () => {
  it('starts world and override reads in parallel without making optional art block the world', async () => {
    let releaseWorld: (() => void) | undefined;
    const worldGate = new Promise<void>((resolve) => {
      releaseWorld = resolve;
    });
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/asset-overrides')) {
        return Response.json({
          success: true,
          data: {
            status: 'loaded',
            requestedKeyCount: STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS.length,
            items: [],
          },
        });
      }
      await worldGate;
      return Response.json({
        success: true,
        data: {
          map: {
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'lantern-square',
            displayName: 'Lantern Square',
            description: 'The lantern-lit village center.',
          },
          version: {
            id: '22222222-2222-4222-8222-222222222222',
            versionNumber: 1,
            checksum: 'a'.repeat(64),
            publishedAt: '2026-07-18T08:00:00.000Z',
          },
          manifest: lanternSquareManifest(),
          assetDeliveries: [],
          playerState: {
            mapId: 'lantern-square',
            mapVersionId: '22222222-2222-4222-8222-222222222222',
            x: 12,
            y: 7.5,
            facingDirection: 'south',
            gameStateVersion: 1,
            updatedAt: '2026-07-18T08:00:00.000Z',
          },
        },
      });
    });

    const reads = beginGameWorldReads('http://localhost:4000', new AbortController().signal);
    await expect(reads.assetOverrides).resolves.toEqual([]);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
    const urls = vi.mocked(globalThis.fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toContain('http://localhost:4000/api/v1/token-access/player/world/current');
    expect(urls).toContain('http://localhost:4000/api/v1/token-access/player/asset-overrides');
    releaseWorld?.();
    await expect(reads.world).resolves.toMatchObject({ map: { slug: 'lantern-square' } });
  });
});
