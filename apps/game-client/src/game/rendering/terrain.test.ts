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

import { resolveWorldAssetDelivery } from '@starville/asset-management';
import { lanternSquareManifest } from '@starville/game-core';

import {
  bundledTerrainAssetKey,
  bundledTerrainAssetKeysForManifest,
  renderTerrain,
} from './terrain';
import { resolvedWorldAssetTextureKey } from './world-asset-textures';

function chainable() {
  const target = {};
  return new Proxy(target, {
    get(value, property, receiver) {
      if (Reflect.has(value, property)) return Reflect.get(value, property, receiver);
      const method = vi.fn(() => receiver);
      Reflect.set(value, property, method);
      return method;
    },
  });
}

describe('bundled isometric terrain rendering', () => {
  it('maps every world terrain kind to a canonical bundled tile', () => {
    expect(bundledTerrainAssetKey('grass', false)).toBe('world.terrain.grass.base');
    expect(bundledTerrainAssetKey('grass', true)).toBe('world.terrain.grass.clover');
    expect(bundledTerrainAssetKey('plaza', false)).toBe('world.terrain.plaza');
    expect(bundledTerrainAssetKey('path', false)).toBe('world.terrain.path.stone');
    expect(bundledTerrainAssetKey('water', false)).toBe('world.terrain.water');
    expect(bundledTerrainAssetKey('bridge', false)).toBe('world.terrain.bridge');
  });

  it('uses loaded 96 by 48 bundled tiles while retaining a procedural safe fallback', () => {
    const manifest = { ...lanternSquareManifest(), width: 2, height: 2 };
    const grassKey = resolvedWorldAssetTextureKey(
      resolveWorldAssetDelivery({
        assetKey: 'world.terrain.grass.base',
        context: 'published_world',
      }),
    );
    const images: object[] = [];
    const layer = chainable();
    const fallback = chainable();
    const scene = {
      textures: { exists: vi.fn((key: string) => key === grassKey) },
      add: {
        image: vi.fn(() => {
          const image = chainable();
          images.push(image);
          return image;
        }),
        graphics: vi.fn(() => fallback),
        container: vi.fn(() => layer),
      },
    };

    const rendered = renderTerrain(scene as never, manifest);

    expect(rendered).toBe(layer);
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(Reflect.get(image, 'setOrigin')).toHaveBeenCalledWith(0.5, 0.5);
      expect(Reflect.get(image, 'setDisplaySize')).toHaveBeenCalledWith(96, 48);
    }
    expect(Reflect.get(layer, 'setDepth')).toHaveBeenCalledWith(-1_000_000_000);
    expect(Reflect.get(fallback, 'fillPoints')).toHaveBeenCalled();
  });

  it('derives a bounded preload set from terrain actually present in the current map', () => {
    const keys = bundledTerrainAssetKeysForManifest(lanternSquareManifest());
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.length).toBeLessThanOrEqual(6);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key.startsWith('world.terrain.'))).toBe(true);
  });

  it('uses the stable missing tile before procedural terrain when a material fails', () => {
    const manifest = { ...lanternSquareManifest(), width: 1, height: 1 };
    const missing = resolveWorldAssetDelivery({
      assetKey: 'system.missing-asset',
      context: 'published_world',
    });
    const missingKey = resolvedWorldAssetTextureKey(missing);
    const fallback = chainable();
    const fillPoints = vi.fn(() => fallback);
    Reflect.set(fallback, 'fillPoints', fillPoints);
    const scene = {
      textures: { exists: vi.fn((key: string) => key === missingKey) },
      add: {
        image: vi.fn(() => chainable()),
        graphics: vi.fn(() => fallback),
        container: vi.fn(() => chainable()),
      },
    };

    renderTerrain(scene as never, manifest);

    expect(scene.add.image).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      missingKey,
    );
    expect(fillPoints).not.toHaveBeenCalled();
    expect(Reflect.get(fallback, 'destroy')).toHaveBeenCalledTimes(1);
  });
});
