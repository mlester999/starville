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
import { lanternSquareManifest } from '@starville/game-core';

import { worldAssetTextureKey } from './world-asset-textures';
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
    const images: object[] = [];
    const graphics: object[] = [];
    const children: object[] = [];
    const containers: object[] = [];
    const scene = {
      textures: {
        exists: vi.fn((key: string) => key === successfulKey),
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
      'graphics',
      'graphics',
    ]);
    expect(scene.textures.exists).toHaveBeenCalledWith(successfulKey);
    expect(scene.textures.exists).toHaveBeenCalledWith(failedKey);
    expect(images).toHaveLength(1);
    expect(graphics).toHaveLength(2);
    expect(Reflect.get(images[0]!, 'setOrigin')).toHaveBeenCalledWith(
      successful.footAnchorX,
      successful.footAnchorY,
    );
    expect(Reflect.get(images[0]!, 'setOrigin')).not.toHaveBeenCalledWith(
      successful.anchorX,
      successful.anchorY,
    );
  });
});
