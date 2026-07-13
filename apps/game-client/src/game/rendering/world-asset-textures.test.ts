import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Loader: {
      Events: {
        COMPLETE: 'complete',
        FILE_LOAD_ERROR: 'loaderror',
      },
    },
  },
}));

import type { WorldAssetDelivery } from '@starville/asset-management';

import {
  isProductionWorldAssetDelivery,
  queueWorldAssetTextures,
  worldAssetDepthOffset,
  worldAssetRenderPlacement,
  worldAssetTextureKey,
} from './world-asset-textures';

const production: WorldAssetDelivery = {
  assetKey: 'moonpetal-cottage',
  versionId: '11111111-1111-4111-8111-111111111111',
  checksum: 'a'.repeat(64),
  url: 'https://assets.example.test/game-assets/starville/moonpetal-cottage/v1/source.webp',
  mediaType: 'image/webp',
  width: 1024,
  height: 1024,
  renderWidth: 256,
  renderHeight: 256,
  scale: 1,
  anchorX: 0.5,
  anchorY: 0.9,
  footAnchorX: 0.5,
  footAnchorY: 0.9,
  depthAnchorX: 0.5,
  depthAnchorY: 0.95,
  collision: { shape: 'none', blocking: false },
  supportedRotations: [0],
  defaultRotation: 0,
  developmentMarker: false,
};

describe('world asset texture boundary', () => {
  it('uses pinned identity and checksum without exposing the delivery URL in texture keys', () => {
    expect(worldAssetTextureKey(production)).toBe(
      'starville-asset:moonpetal-cottage:11111111-1111-4111-8111-111111111111:aaaaaaaaaaaaaaaa',
    );
    expect(worldAssetTextureKey(production)).not.toContain('assets.example.test');
  });

  it('distinguishes production delivery from repository fallback descriptors', () => {
    expect(isProductionWorldAssetDelivery(production)).toBe(true);
    expect(
      isProductionWorldAssetDelivery({
        ...production,
        developmentMarker: true,
        url: null,
        mediaType: null,
        width: null,
        height: null,
        renderWidth: null,
        renderHeight: null,
      }),
    ).toBe(false);
  });

  it('keeps depth-anchor influence bounded below a logical world-depth step', () => {
    expect(worldAssetDepthOffset(production)).toBe(20);
    expect(Math.abs(worldAssetDepthOffset({ ...production, depthAnchorY: 0 }))).toBeLessThan(1_000);
  });

  it('uses the foot anchor as the map world-position origin and keeps render/depth anchors distinct', () => {
    expect(
      worldAssetRenderPlacement({
        ...production,
        anchorX: 0.1,
        anchorY: 0.2,
        footAnchorX: 0.42,
        footAnchorY: 0.84,
        depthAnchorX: 0.73,
        depthAnchorY: 0.94,
      }),
    ).toEqual({ originX: 0.42, originY: 0.84, depthOffset: 40 });
  });

  it('reports Phaser file-load errors with only safe pinned identity metadata', () => {
    const handlers = new Map<string, Set<(value?: unknown) => void>>();
    const on = vi.fn((event: string, handler: (value?: unknown) => void) => {
      const eventHandlers = handlers.get(event) ?? new Set();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
    });
    const off = vi.fn((event: string, handler: (value?: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    });
    const once = vi.fn((event: string, handler: (value?: unknown) => void) => {
      const wrapper = (value?: unknown): void => {
        handlers.get(event)?.delete(wrapper);
        handler(value);
      };
      const eventHandlers = handlers.get(event) ?? new Set();
      eventHandlers.add(wrapper);
      handlers.set(event, eventHandlers);
    });
    const scene = {
      load: {
        setCORS: vi.fn(),
        image: vi.fn(),
        on,
        off,
        once,
      },
      textures: { exists: vi.fn(() => false) },
    };
    const failures: unknown[] = [];

    expect(
      queueWorldAssetTextures(scene as never, [production], (failure) => failures.push(failure)),
    ).toBe(1);
    expect(scene.load.image).toHaveBeenCalledWith(worldAssetTextureKey(production), production.url);

    const unsafeLoaderFile = {
      key: worldAssetTextureKey(production),
      url: production.url,
      src: `${production.url}?service_role=do-not-expose`,
      error: new Error('RPC URL and bearer token must remain private'),
    };
    for (const handler of handlers.get('loaderror') ?? []) handler(unsafeLoaderFile);

    expect(failures).toEqual([
      {
        code: 'WORLD_ASSET_LOAD_FAILED',
        assetKey: production.assetKey,
        versionId: production.versionId,
      },
    ]);
    expect(JSON.stringify(failures)).not.toContain('assets.example.test');
    expect(JSON.stringify(failures)).not.toContain('service_role');
    expect(JSON.stringify(failures)).not.toContain('bearer token');

    for (const handler of handlers.get('loaderror') ?? []) handler(unsafeLoaderFile);
    expect(failures).toHaveLength(1);
    for (const handler of handlers.get('complete') ?? []) handler();
    expect(off).toHaveBeenCalledWith('loaderror', expect.any(Function));
  });

  it('does not promote an observability callback failure into a loader failure', () => {
    let loadErrorHandler: ((file: { readonly key: string }) => void) | undefined;
    const scene = {
      load: {
        setCORS: vi.fn(),
        image: vi.fn(),
        on: vi.fn((_event: string, handler: typeof loadErrorHandler) => {
          loadErrorHandler = handler;
        }),
        off: vi.fn(),
        once: vi.fn(),
      },
      textures: { exists: vi.fn(() => false) },
    };
    queueWorldAssetTextures(scene as never, [production], () => {
      throw new Error('telemetry is unavailable');
    });

    expect(() => loadErrorHandler?.({ key: worldAssetTextureKey(production) })).not.toThrow();
  });
});
