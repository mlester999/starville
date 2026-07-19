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

import { resolveWorldAssetDelivery, type WorldAssetDelivery } from '@starville/asset-management';
import { lanternSquareManifest } from '@starville/game-core';

import { resolvedWorldAssetTextureKey, worldAssetTextureKey } from './world-asset-textures';
import { renderWorldObjects } from './world-objects';

function delivery(
  assetKey: string,
  versionId: string,
  overrides: Partial<WorldAssetDelivery> = {},
): WorldAssetDelivery {
  return {
    assetKey,
    versionId,
    checksum: 'a'.repeat(64),
    bundledManifestVersion: null,
    url: `https://assets.example.test/game-assets/starville/${assetKey}/${versionId}/source.webp`,
    mediaType: 'image/webp',
    width: 512,
    height: 512,
    renderWidth: 256,
    renderHeight: 256,
    scale: 1,
    anchorX: 0.1,
    anchorY: 0.2,
    footAnchorX: 0.46,
    footAnchorY: 0.88,
    depthAnchorX: 0.5,
    depthAnchorY: 0.93,
    collision: { shape: 'none', blocking: false },
    supportedRotations: [0],
    defaultRotation: 0,
    developmentMarker: false,
    ...overrides,
  };
}

function chainableGameObject(kind: 'graphics' | 'image') {
  const target = { kind };
  return new Proxy(target, {
    get(value, property, receiver) {
      if (Reflect.has(value, property)) return Reflect.get(value, property, receiver);
      const method = vi.fn(() => receiver);
      Reflect.set(value, property, method);
      return method;
    },
  });
}

describe('production world-object rendering', () => {
  it('renders every object when one production texture succeeds and another falls back', () => {
    const baseManifest = lanternSquareManifest();
    const objects = baseManifest.objects.slice(0, 3);
    const manifest = { ...baseManifest, objects };
    const successful = delivery(objects[0]!.assetId, '11111111-1111-4111-8111-111111111111');
    const failed = delivery(objects[1]!.assetId, '22222222-2222-4222-8222-222222222222');
    const successfulKey = worldAssetTextureKey(successful);
    const failedKey = worldAssetTextureKey(failed);
    const failedFallbackKey = resolvedWorldAssetTextureKey(
      resolveWorldAssetDelivery({
        assetKey: failed.assetKey,
        context: 'published_world',
      }),
    );
    const images: object[] = [];
    const graphics: object[] = [];
    const children: object[] = [];
    const containers: object[] = [];
    const scene = {
      textures: {
        exists: vi.fn((key: string) => [successfulKey, failedFallbackKey].includes(key)),
      },
      add: {
        image: vi.fn(() => {
          const image = chainableGameObject('image');
          images.push(image);
          return image;
        }),
        graphics: vi.fn(() => {
          const graphic = chainableGameObject('graphics');
          graphics.push(graphic);
          return graphic;
        }),
        container: vi.fn((_x: number, _y: number, nextChildren: object[]) => {
          children.push(...nextChildren);
          const container = chainableGameObject('graphics');
          containers.push(container);
          return container;
        }),
      },
    };

    const rendered = renderWorldObjects(scene as never, manifest, [successful, failed]);

    expect(rendered).toHaveLength(objects.length);
    expect(containers).toHaveLength(objects.length);
    expect(children.map((child) => Reflect.get(child, 'kind'))).toEqual([
      'image',
      'image',
      'graphics',
    ]);
    expect(scene.textures.exists).toHaveBeenCalledWith(successfulKey);
    expect(scene.textures.exists).toHaveBeenCalledWith(failedKey);
    expect(images).toHaveLength(2);
    expect(graphics).toHaveLength(1 + objects.length);
    expect(rendered.every(({ shadow }) => shadow !== undefined)).toBe(true);
    for (const { shadow } of rendered) {
      expect(Reflect.get(shadow!, 'fillEllipse')).toHaveBeenCalledTimes(3);
    }
    expect(Reflect.get(images[0]!, 'setOrigin')).toHaveBeenCalledWith(
      successful.footAnchorX,
      successful.footAnchorY,
    );
    expect(Reflect.get(images[0]!, 'setOrigin')).not.toHaveBeenCalledWith(
      successful.anchorX,
      successful.anchorY,
    );
    expect(Reflect.get(images[0]!, 'setAngle')).not.toHaveBeenCalled();
    expect(Reflect.get(images[1]!, 'setAngle')).not.toHaveBeenCalled();
  });

  it('selects an authored bundled quarter-turn instead of rotating an uploaded flat image', () => {
    const baseManifest = lanternSquareManifest();
    const baseFence = baseManifest.objects.find((object) => object.assetId === 'fence-willow');
    expect(baseFence).toBeDefined();
    const fence = { ...baseFence!, rotation: 90 as const };
    const manifest = { ...baseManifest, objects: [fence] };
    const uploaded = delivery(fence.assetId, '33333333-3333-4333-8333-333333333333', {
      supportedRotations: [0, 90],
    });
    const authored = resolveWorldAssetDelivery({
      assetKey: fence.assetId,
      context: 'published_world',
      rotation: 90,
    });
    const authoredKey = resolvedWorldAssetTextureKey(authored);
    const image = chainableGameObject('image');
    const scene = {
      textures: { exists: vi.fn((key: string) => key === authoredKey) },
      add: {
        image: vi.fn(() => image),
        graphics: vi.fn(() => chainableGameObject('graphics')),
        container: vi.fn(() => chainableGameObject('graphics')),
      },
    };

    renderWorldObjects(scene as never, manifest, [uploaded]);

    expect(scene.add.image).toHaveBeenCalledWith(0, 0, authoredKey);
    expect(authored.url).toContain('fence-willow--rotation-90.webp');
    expect(Reflect.get(image, 'setAngle')).not.toHaveBeenCalled();
  });

  it('renders the stable missing material before using procedural drawing', () => {
    const baseManifest = lanternSquareManifest();
    const object = baseManifest.objects[0]!;
    const manifest = { ...baseManifest, objects: [object] };
    const missing = resolveWorldAssetDelivery({
      assetKey: 'system.missing-asset',
      context: 'published_world',
    });
    const missingKey = resolvedWorldAssetTextureKey(missing);
    const scene = {
      textures: { exists: vi.fn((key: string) => key === missingKey) },
      add: {
        image: vi.fn(() => chainableGameObject('image')),
        graphics: vi.fn(() => chainableGameObject('graphics')),
        container: vi.fn(() => chainableGameObject('graphics')),
      },
    };

    renderWorldObjects(scene as never, manifest, [], { shadows: false });

    expect(scene.add.image).toHaveBeenCalledWith(0, 0, missingKey);
    expect(scene.add.graphics).not.toHaveBeenCalled();
  });

  it('ignores exact terrain deliveries when resolving unrelated world objects', () => {
    const baseManifest = lanternSquareManifest();
    const object = baseManifest.objects[0]!;
    const manifest = { ...baseManifest, objects: [object] };
    const objectTexture = resolveWorldAssetDelivery({
      assetKey: object.assetId,
      context: 'published_world',
    });
    const objectTextureKey = resolvedWorldAssetTextureKey(objectTexture);
    const terrain = delivery('world.terrain.grass.base', '99999999-9999-4999-8999-999999999999', {
      renderWidth: 96,
      renderHeight: 48,
      width: 96,
      height: 48,
    });
    const scene = {
      textures: { exists: vi.fn((key: string) => key === objectTextureKey) },
      add: {
        image: vi.fn(() => chainableGameObject('image')),
        graphics: vi.fn(() => chainableGameObject('graphics')),
        container: vi.fn(() => chainableGameObject('graphics')),
      },
    };

    renderWorldObjects(scene as never, manifest, [terrain], { shadows: false });

    expect(scene.add.image).toHaveBeenCalledWith(0, 0, objectTextureKey);
    expect(scene.textures.exists).not.toHaveBeenCalledWith(worldAssetTextureKey(terrain));
  });
});
