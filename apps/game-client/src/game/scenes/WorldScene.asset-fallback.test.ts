import { describe, expect, it, vi } from 'vitest';

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
import { WorldScene } from './WorldScene';

const production: WorldAssetDelivery = {
  assetKey: 'cottage-amber',
  versionId: '11111111-1111-4111-8111-111111111111',
  checksum: 'a'.repeat(64),
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
      false,
      250,
      false,
    );
  });
});
