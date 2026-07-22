import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {
    public constructor(_config?: unknown) {}
  }

  return {
    default: {
      Scene,
      Loader: {
        Events: {
          COMPLETE: 'complete',
          FILE_LOAD_ERROR: 'loaderror',
        },
      },
    },
  };
});

import type { WorldAssetDelivery } from '@starville/asset-management';
import { lanternSquareManifest } from '@starville/game-core';

import type { GameRuntimeOptions } from '../contracts';
import { worldAssetTextureKey } from '../rendering/world-asset-textures';
import { sessionAssetFailureRegistry } from '../../app/asset-failure-registry';
import { WorldScene } from './WorldScene';

const production: WorldAssetDelivery = {
  assetKey: 'cottage-amber',
  versionId: '11111111-1111-4111-8111-111111111111',
  checksum: 'a'.repeat(64),
  bundledManifestVersion: null,
  url: 'https://assets.example.test/game-assets/starville/cottage-amber/v1/source.webp',
  mediaType: 'image/webp',
  width: 512,
  height: 512,
  renderWidth: 256,
  renderHeight: 256,
  scale: 1,
  anchorX: 0.5,
  anchorY: 0.5,
  footAnchorX: 0.5,
  footAnchorY: 0.9,
  depthAnchorX: 0.5,
  depthAnchorY: 0.95,
  collision: { shape: 'none', blocking: false },
  supportedRotations: [0],
  defaultRotation: 0,
  developmentMarker: false,
};

beforeEach(() => sessionAssetFailureRegistry.clear());

describe('WorldScene production-asset fallback', () => {
  it('observes a sanitized visual fallback without changing player, persistence, or travel state', () => {
    let loadErrorHandler: ((file: { readonly key: string }) => void) | undefined;
    const callbacks: GameRuntimeOptions['callbacks'] = {
      onReady: vi.fn(),
      onError: vi.fn(),
      onStateChanged: vi.fn(),
      onCheckpoint: vi.fn(),
      onInteractionTarget: vi.fn(),
      onInteractionOpen: vi.fn(),
      onSettingsRequested: vi.fn(),
      onExitRequested: vi.fn(),
      onMapChanged: vi.fn(),
      onWorldAssetFallback: vi.fn(),
      onRemotePlayerSelected: vi.fn(),
      onActivityInteraction: vi.fn(),
    };
    const initialState = {
      mapId: 'lantern-square' as const,
      x: 12,
      y: 7.5,
      facingDirection: 'south' as const,
    };
    const options: GameRuntimeOptions = {
      initialState,
      initialWorld: {
        manifest: lanternSquareManifest(),
        versionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        checksum: 'b'.repeat(64),
        assetDeliveries: [production],
      },
      appearancePreset: 'moss',
      reducedMotion: false,
      collisionDebug: false,
      audioSettings: { masterVolume: 0.8, muted: false },
      callbacks,
    };
    const scene = new WorldScene(options);
    Object.assign(scene, {
      load: {
        setCORS: vi.fn(),
        image: vi.fn(),
        on: vi.fn((_event: string, handler: (file: { readonly key: string }) => void): void => {
          loadErrorHandler = handler;
        }),
        off: vi.fn(),
        once: vi.fn(),
      },
      textures: { exists: vi.fn(() => false) },
    });

    scene.preload();
    const unsafeLoaderFile = {
      key: worldAssetTextureKey(production),
      url: `${production.url}?token=private`,
      src: production.url,
      error: new Error('secret RPC URL'),
    };
    expect(() => loadErrorHandler?.(unsafeLoaderFile)).not.toThrow();

    expect(callbacks.onWorldAssetFallback).toHaveBeenCalledWith({
      code: 'WORLD_ASSET_LOAD_FAILED',
      assetKey: production.assetKey,
      versionId: production.versionId,
      requestId: expect.any(String),
    });
    expect(JSON.stringify(vi.mocked(callbacks.onWorldAssetFallback).mock.calls)).not.toContain(
      'assets.example.test',
    );
    expect(scene.getState()).toEqual(initialState);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onStateChanged).not.toHaveBeenCalled();
    expect(callbacks.onCheckpoint).not.toHaveBeenCalled();
    expect(callbacks.onExitRequested).not.toHaveBeenCalled();
    expect(callbacks.onMapChanged).not.toHaveBeenCalled();
  });

  it('reports one stopped phase from the Phaser scene and preserves the last facing', () => {
    const onStateChanged = vi.fn();
    const initialState = {
      mapId: 'lantern-square' as const,
      x: 12.2,
      y: 7.4,
      facingDirection: 'northeast' as const,
    };
    const scene = new WorldScene({
      initialState,
      initialWorld: {
        manifest: lanternSquareManifest(),
        versionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        checksum: 'b'.repeat(64),
        assetDeliveries: [],
      },
      appearancePreset: 'moss',
      reducedMotion: false,
      collisionDebug: false,
      audioSettings: { masterVolume: 0.8, muted: false },
      callbacks: {
        onReady: vi.fn(),
        onError: vi.fn(),
        onStateChanged,
        onCheckpoint: vi.fn(),
        onInteractionTarget: vi.fn(),
        onInteractionOpen: vi.fn(),
        onSettingsRequested: vi.fn(),
        onExitRequested: vi.fn(),
        onMapChanged: vi.fn(),
        onWorldAssetFallback: vi.fn(),
        onRemotePlayerSelected: vi.fn(),
        onActivityInteraction: vi.fn(),
      },
    });
    const updatePlayer = vi.fn();
    Object.assign(scene, {
      wasMoving: true,
      time: { now: 250 },
      player: { update: updatePlayer },
    });
    const reportStoppedMovement = (
      scene as unknown as { readonly reportStoppedMovement: () => void }
    ).reportStoppedMovement.bind(scene);

    reportStoppedMovement();
    reportStoppedMovement();

    expect(onStateChanged).toHaveBeenCalledTimes(1);
    expect(onStateChanged).toHaveBeenCalledWith(initialState, 'stopped');
    expect(updatePlayer).toHaveBeenCalledWith(
      { x: initialState.x, y: initialState.y },
      'northeast',
      'idle',
      250,
    );
  });

  it('keeps the complete source map until destination critical textures settle, then swaps once', () => {
    const onMapChanged = vi.fn();
    const callbacks: GameRuntimeOptions['callbacks'] = {
      onReady: vi.fn(),
      onError: vi.fn(),
      onStateChanged: vi.fn(),
      onCheckpoint: vi.fn(),
      onInteractionTarget: vi.fn(),
      onInteractionOpen: vi.fn(),
      onSettingsRequested: vi.fn(),
      onExitRequested: vi.fn(),
      onMapChanged,
      onWorldAssetFallback: vi.fn(),
      onRemotePlayerSelected: vi.fn(),
      onActivityInteraction: vi.fn(),
    };
    const initialState = {
      mapId: 'lantern-square' as const,
      x: 12,
      y: 7.5,
      facingDirection: 'south' as const,
    };
    const scene = new WorldScene({
      initialState,
      initialWorld: {
        manifest: lanternSquareManifest(),
        versionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        checksum: 'b'.repeat(64),
        assetDeliveries: [],
      },
      appearancePreset: 'moss',
      reducedMotion: false,
      collisionDebug: false,
      audioSettings: { masterVolume: 0.8, muted: false },
      callbacks,
    });
    const completeHandlers: Array<() => void> = [];
    const clearMap = vi.fn();
    const renderMap = vi.fn();
    const destinationManifest = {
      ...lanternSquareManifest(),
      id: 'moonpetal-meadow' as const,
      slug: 'moonpetal-meadow' as const,
    };
    const destination = {
      manifest: destinationManifest,
      versionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      checksum: 'd'.repeat(64),
      assetDeliveries: [],
    };
    const destinationState = {
      mapId: 'moonpetal-meadow' as const,
      x: 3,
      y: 4,
      facingDirection: 'east' as const,
    };
    Object.assign(scene, {
      clearMap,
      renderMap,
      configureCamera: vi.fn(),
      refreshInteractionTarget: vi.fn(),
      updatePlayer: vi.fn(),
      time: { now: 500 },
      textures: { exists: vi.fn(() => false) },
      load: {
        setCORS: vi.fn(),
        image: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn((event: string, handler: () => void) => {
          if (event === 'complete') completeHandlers.push(handler);
        }),
        isLoading: vi.fn(() => false),
        start: vi.fn(),
      },
    });

    scene.loadWorld(destination, destinationState);

    expect(clearMap).not.toHaveBeenCalled();
    expect(renderMap).not.toHaveBeenCalled();
    expect(scene.getState()).toEqual(initialState);
    expect(onMapChanged).not.toHaveBeenCalled();

    for (const handler of completeHandlers) handler();

    expect(clearMap).toHaveBeenCalledTimes(1);
    expect(renderMap).toHaveBeenCalledTimes(1);
    expect(scene.getState()).toEqual(destinationState);
    expect(onMapChanged).toHaveBeenCalledWith(destination);
  });

  it('restores the source world atomically when destination rendering fails', () => {
    const onMapChanged = vi.fn();
    const onError = vi.fn();
    const initialManifest = lanternSquareManifest();
    const initialState = {
      mapId: 'lantern-square' as const,
      x: 12,
      y: 7.5,
      facingDirection: 'south' as const,
    };
    const scene = new WorldScene({
      initialState,
      initialWorld: {
        manifest: initialManifest,
        versionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        checksum: 'b'.repeat(64),
        assetDeliveries: [],
      },
      appearancePreset: 'moss',
      reducedMotion: false,
      collisionDebug: false,
      audioSettings: { masterVolume: 0.8, muted: false },
      callbacks: {
        onReady: vi.fn(),
        onError,
        onStateChanged: vi.fn(),
        onCheckpoint: vi.fn(),
        onInteractionTarget: vi.fn(),
        onInteractionOpen: vi.fn(),
        onSettingsRequested: vi.fn(),
        onExitRequested: vi.fn(),
        onMapChanged,
        onWorldAssetFallback: vi.fn(),
        onRemotePlayerSelected: vi.fn(),
        onActivityInteraction: vi.fn(),
      },
    });
    const destinationManifest = {
      ...initialManifest,
      id: 'moonpetal-meadow' as const,
      slug: 'moonpetal-meadow' as const,
      name: 'Destination That Fails',
    };
    const destination = {
      manifest: destinationManifest,
      versionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      checksum: 'd'.repeat(64),
      assetDeliveries: [],
    };
    const renderMap = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('destination render failed');
      })
      .mockImplementationOnce(() => undefined);
    Object.assign(scene, {
      clearMap: vi.fn(),
      renderMap,
      configureCamera: vi.fn(),
      updateCulling: vi.fn(),
      refreshChatBubbles: vi.fn(),
      refreshInteractionTarget: vi.fn(),
      updatePlayer: vi.fn(),
      time: { now: 500 },
      textures: { exists: vi.fn(() => true) },
      load: {
        setCORS: vi.fn(),
        image: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        isLoading: vi.fn(() => false),
        start: vi.fn(),
      },
    });

    expect(() =>
      scene.loadWorld(destination, {
        mapId: 'moonpetal-meadow',
        x: 3,
        y: 4,
        facingDirection: 'east',
      }),
    ).toThrow('destination render failed');

    expect(renderMap).toHaveBeenCalledTimes(2);
    expect(scene.getState()).toEqual(initialState);
    expect(scene.getDiagnostics()).toMatchObject({
      location: initialManifest.name,
      mapVersion: initialManifest.version,
      transitionPending: false,
    });
    expect(onMapChanged).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
