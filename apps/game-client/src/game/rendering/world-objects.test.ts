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

import {
  getBundledAsset,
  resolveWorldAssetDelivery,
  STARVILLE_PRODUCTION_SLICE_MANIFEST_VERSION,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import {
  getPhase12ELanternSquareCandidate,
  PRODUCTION_SLICE_V3_INTERIOR_MANIFEST,
} from '@starville/game-content';
import { depthForFootPosition, lanternSquareManifest } from '@starville/game-core';

import { resolvedWorldAssetTextureKey, worldAssetTextureKey } from './world-asset-textures';
import {
  renderWorldObjects,
  resolveWorldObjectLayerPolicy,
  usesProductionSliceObjectProfile,
  updateWorldObjectOcclusion,
} from './world-objects';

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

function productionSliceDelivery(assetKey: string): WorldAssetDelivery {
  const asset = getBundledAsset(assetKey, STARVILLE_PRODUCTION_SLICE_MANIFEST_VERSION);
  if (asset === undefined) throw new Error(`Missing production-slice fixture asset: ${assetKey}`);
  return {
    assetKey,
    versionId: '33333333-3333-4333-8333-333333333333',
    checksum: 'b'.repeat(64),
    bundledManifestVersion: STARVILLE_PRODUCTION_SLICE_MANIFEST_VERSION,
    url: null,
    mediaType: null,
    width: null,
    height: null,
    renderWidth: null,
    renderHeight: null,
    scale: asset.recommendedScale,
    anchorX: asset.anchor.x,
    anchorY: asset.anchor.y,
    footAnchorX: asset.footAnchor.x,
    footAnchorY: asset.footAnchor.y,
    depthAnchorX: asset.depthAnchor.x,
    depthAnchorY: asset.depthAnchor.y,
    collision: asset.collision,
    supportedRotations: [...asset.supportedRotations],
    defaultRotation: asset.defaultRotation,
    developmentMarker: true,
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
  it('splits tall V3 assets into base and foreground depth layers', () => {
    const baseManifest = lanternSquareManifest();
    const object = baseManifest.objects.find(({ kind }) => kind === 'tree')!;
    const manifest = {
      ...baseManifest,
      version: 1204,
      developmentArt: { temporary: true, label: 'Phase 12F-A.1 test profile' },
      objects: [object],
    };
    const bundled = resolveWorldAssetDelivery({
      assetKey: object.assetId,
      context: 'published_world',
    });
    const textureKey = resolvedWorldAssetTextureKey(bundled);
    const images: object[] = [];
    const scene = {
      textures: { exists: vi.fn((key: string) => key === textureKey) },
      add: {
        image: vi.fn(() => {
          const image = chainableGameObject('image');
          images.push(image);
          return image;
        }),
        graphics: vi.fn(() => chainableGameObject('graphics')),
        container: vi.fn(() => chainableGameObject('graphics')),
      },
    };

    const rendered = renderWorldObjects(scene as never, manifest, [], { shadows: false });

    expect(rendered[0]?.foreground).toBeDefined();
    expect(images).toHaveLength(2);
    expect(Reflect.get(images[0]!, 'setCrop')).toHaveBeenCalled();
    expect(Reflect.get(images[1]!, 'setCrop')).toHaveBeenCalled();
  });

  it('fades a nearby tree or cottage only while the player is geometrically behind it', () => {
    const baseManifest = lanternSquareManifest();
    for (const object of [
      baseManifest.objects.find(({ kind }) => kind === 'tree')!,
      baseManifest.objects.find(({ kind }) => kind === 'building')!,
    ]) {
      const manifest = {
        ...baseManifest,
        version: 1204,
        developmentArt: { temporary: true, label: 'Phase 12F-A.1 test profile' },
        objects: [object],
      };
      const bundled = resolveWorldAssetDelivery({
        assetKey: object.assetId,
        context: 'published_world',
      });
      const textureKey = resolvedWorldAssetTextureKey(bundled);
      const scene = {
        textures: { exists: vi.fn((key: string) => key === textureKey) },
        add: {
          image: vi.fn(() => chainableGameObject('image')),
          graphics: vi.fn(() => chainableGameObject('graphics')),
          container: vi.fn(() => chainableGameObject('graphics')),
        },
      };
      const rendered = renderWorldObjects(scene as never, manifest, [], { shadows: false })[0]!;
      const policy = rendered.layerPolicy.occlusion!;

      updateWorldObjectOcclusion([rendered], { x: object.x - 0.5, y: object.y - 0.5 });
      expect(Reflect.get(rendered.container, 'setAlpha')).toHaveBeenLastCalledWith(
        policy.baseAlpha,
      );
      expect(Reflect.get(rendered.foreground!, 'setAlpha')).toHaveBeenLastCalledWith(
        policy.foregroundAlpha,
      );

      updateWorldObjectOcclusion([rendered], { x: object.x + 0.5, y: object.y + 0.5 });
      expect(Reflect.get(rendered.container, 'setAlpha')).toHaveBeenLastCalledWith(1);
      expect(Reflect.get(rendered.foreground!, 'setAlpha')).toHaveBeenLastCalledWith(1);

      updateWorldObjectOcclusion([rendered], { x: object.x + 4, y: object.y - 4 });
      expect(Reflect.get(rendered.container, 'setAlpha')).toHaveBeenLastCalledWith(1);
      expect(Reflect.get(rendered.foreground!, 'setAlpha')).toHaveBeenLastCalledWith(1);
    }
  });

  it('uses per-asset interior depth bands for behind, overlap, and cleared-front ordering', () => {
    const object = {
      assetId: 'v3.interior.dining-table',
      kind: 'furniture' as const,
      scale: 1,
      x: 8,
      y: 8,
    };
    const policy = resolveWorldObjectLayerPolicy(object);
    expect(policy).toMatchObject({ foregroundSplit: 0.53, foregroundDepthOffset: 0.48 });
    expect(resolveWorldObjectLayerPolicy({ ...object, assetId: 'v3.interior.wall' })).toMatchObject(
      {
        foregroundSplit: undefined,
        foregroundDepthOffset: 0,
      },
    );

    const baseDepth = depthForFootPosition(object.x, object.y, 'table');
    const foregroundDepth = depthForFootPosition(
      object.x + policy.foregroundDepthOffset,
      object.y + policy.foregroundDepthOffset,
      'table-foreground',
    );
    const behindPlayerDepth = depthForFootPosition(object.x - 0.5, object.y - 0.5, 'player');
    const overlappingPlayerDepth = depthForFootPosition(object.x + 0.2, object.y + 0.2, 'player');
    const clearedPlayerDepth = depthForFootPosition(object.x + 0.6, object.y + 0.6, 'player');

    expect(behindPlayerDepth).toBeLessThan(baseDepth);
    expect(overlappingPlayerDepth).toBeGreaterThan(baseDepth);
    expect(overlappingPlayerDepth).toBeLessThan(foregroundDepth);
    expect(clearedPlayerDepth).toBeGreaterThan(foregroundDepth);
  });

  it('fades an enclosing interior wall or door without requiring a split foreground layer', () => {
    for (const object of [
      { assetId: 'v3.interior.wall', kind: 'building' as const, scale: 1.05, x: 11.75, y: 13 },
      { assetId: 'v3.interior.door', kind: 'home_entrance' as const, scale: 0.9, x: 9, y: 13 },
    ]) {
      const policy = resolveWorldObjectLayerPolicy(object);
      expect(policy.occlusion).toBeDefined();
      const container = chainableGameObject('graphics');
      const rendered = {
        id: object.assetId,
        assetId: object.assetId,
        kind: object.kind,
        world: { x: object.x, y: object.y },
        scale: object.scale,
        container,
        screen: { x: 0, y: 0 },
        layerPolicy: policy,
      };

      updateWorldObjectOcclusion([rendered as never], { x: 9, y: 11.2 });
      expect(Reflect.get(container, 'setAlpha')).toHaveBeenLastCalledWith(
        policy.occlusion?.baseAlpha,
      );
    }
  });

  it('does not enable production layering for an unrelated future numeric map version', () => {
    const canonical = lanternSquareManifest();
    expect(usesProductionSliceObjectProfile({ ...canonical, version: 99_999 })).toBe(false);
    expect(
      usesProductionSliceObjectProfile({
        ...canonical,
        developmentArt: { temporary: true, label: 'Phase 12F-A.1 test profile' },
      }),
    ).toBe(true);
  });

  it('keeps V1 and V2 objects unsplit and fully opaque when A.1 occlusion updates run', () => {
    for (const manifest of [
      lanternSquareManifest(),
      getPhase12ELanternSquareCandidate().manifest,
    ]) {
      const objects = manifest.objects
        .filter(({ kind }) => ['tree', 'building', 'shop', 'home_entrance'].includes(kind))
        .slice(0, 2);
      expect(objects.length).toBeGreaterThan(0);
      const scene = {
        textures: { exists: vi.fn(() => true) },
        add: {
          image: vi.fn(() => chainableGameObject('image')),
          graphics: vi.fn(() => chainableGameObject('graphics')),
          container: vi.fn(() => chainableGameObject('graphics')),
        },
      };
      const rendered = renderWorldObjects(scene as never, { ...manifest, objects }, [], {
        shadows: false,
      });

      expect(rendered.every(({ foreground }) => foreground === undefined)).toBe(true);
      expect(rendered.every(({ layerPolicy }) => layerPolicy.occlusion === undefined)).toBe(true);
      expect(updateWorldObjectOcclusion(rendered, { x: objects[0]!.x, y: objects[0]!.y })).toEqual({
        occludedObjects: 0,
      });
      for (const { container } of rendered) {
        expect(Reflect.get(container, 'setAlpha')).not.toHaveBeenCalled();
      }
    }
  });

  it('mirrors an unsupported perpendicular V3 interior wall axis without screen-rotating art', () => {
    const northWall = PRODUCTION_SLICE_V3_INTERIOR_MANIFEST.objects.find(
      ({ id }) => id === 'wall-north-a',
    )!;
    const westWall = PRODUCTION_SLICE_V3_INTERIOR_MANIFEST.objects.find(
      ({ id }) => id === 'wall-west-a',
    )!;
    // The raster is authored on the native west ("/") axis, so the west run stays
    // native and the perpendicular north run is mirrored (never screen-rotated).
    expect(westWall.rotation ?? 0).toBe(0);
    expect(northWall.rotation).toBe(90);
    const wallDelivery = productionSliceDelivery(northWall.assetId);
    const images: object[] = [];
    const scene = {
      textures: { exists: vi.fn(() => true) },
      add: {
        image: vi.fn(() => {
          const image = chainableGameObject('image');
          images.push(image);
          return image;
        }),
        graphics: vi.fn(() => chainableGameObject('graphics')),
        container: vi.fn(() => chainableGameObject('graphics')),
      },
    };

    renderWorldObjects(
      scene as never,
      { ...PRODUCTION_SLICE_V3_INTERIOR_MANIFEST, objects: [northWall, westWall] },
      [wallDelivery],
      { shadows: false, assetResolutionContext: 'game_test' },
    );

    expect(images).toHaveLength(2);
    // images[0] is the north (rotation 90) panel → mirrored; images[1] is west → native.
    expect(Reflect.get(images[0]!, 'setFlipX')).toHaveBeenCalledWith(true);
    expect(Reflect.get(images[1]!, 'setFlipX')).not.toHaveBeenCalled();
    expect(Reflect.get(images[0]!, 'setAngle')).not.toHaveBeenCalled();
    expect(Reflect.get(images[1]!, 'setAngle')).not.toHaveBeenCalled();
  });

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
