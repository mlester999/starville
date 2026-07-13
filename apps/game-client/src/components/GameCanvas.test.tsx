import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameRuntimeHandle, GameRuntimeOptions } from '../game/contracts';
import { WORLD_ASSET_FALLBACK_EVENT_NAME } from '../game/contracts';
import { lanternSquareManifest } from '@starville/game-core';
import { GameCanvas } from './GameCanvas';

const startGame = vi.fn();

vi.mock('../game', () => ({ startGame }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  vi.clearAllMocks();
});

describe('GameCanvas lifecycle', () => {
  it('mounts Phaser once, forwards blocking, and destroys it with a final checkpoint', async () => {
    const handle: GameRuntimeHandle = {
      setInputBlocked: vi.fn(),
      setAudioSettings: vi.fn(),
      interact: vi.fn(),
      getState: vi.fn(() => ({
        mapId: 'lantern-square' as const,
        x: 12.5,
        y: 8,
        facingDirection: 'east' as const,
      })),
      loadWorld: vi.fn(),
      cancelTransition: vi.fn(),
      destroy: vi.fn(),
    };
    startGame.mockReturnValue(handle);
    const onFinalState = vi.fn();
    const common = {
      initialState: {
        mapId: 'lantern-square' as const,
        x: 12,
        y: 7.5,
        facingDirection: 'south' as const,
      },
      initialWorld: {
        manifest: lanternSquareManifest(),
        versionId: '11111111-1111-4111-8111-111111111111',
        checksum: 'a'.repeat(64),
        assetDeliveries: [],
      },
      appearancePreset: 'moss' as const,
      onReady: vi.fn(),
      onError: vi.fn(),
      onStateChanged: vi.fn(),
      onCheckpoint: vi.fn(),
      onFinalState,
      onInteractionTarget: vi.fn(),
      onInteractionOpen: vi.fn(),
      onSettingsRequested: vi.fn(),
      onExitRequested: vi.fn(),
      onMapChanged: vi.fn(),
      onRuntimeCreated: vi.fn(),
      audioSettings: { masterVolume: 0.8, muted: false },
    };

    await act(async () => {
      root.render(<GameCanvas {...common} inputBlocked={false} />);
      await Promise.resolve();
    });
    await act(async () => {
      root.render(<GameCanvas {...common} inputBlocked />);
      await Promise.resolve();
    });

    expect(startGame).toHaveBeenCalledTimes(1);
    expect(handle.setInputBlocked).toHaveBeenCalledWith(true);

    const observedFallback = vi.fn();
    window.addEventListener(WORLD_ASSET_FALLBACK_EVENT_NAME, observedFallback);
    const runtimeOptions = startGame.mock.calls[0]![1] as GameRuntimeOptions;
    runtimeOptions.callbacks.onWorldAssetFallback({
      code: 'WORLD_ASSET_LOAD_FAILED',
      assetKey: 'cottage-amber',
      versionId: '11111111-1111-4111-8111-111111111111',
    });
    expect(observedFallback).toHaveBeenCalledTimes(1);
    expect((observedFallback.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      code: 'WORLD_ASSET_LOAD_FAILED',
      assetKey: 'cottage-amber',
      versionId: '11111111-1111-4111-8111-111111111111',
    });
    window.removeEventListener(WORLD_ASSET_FALLBACK_EVENT_NAME, observedFallback);

    await act(async () => root.unmount());
    expect(onFinalState).toHaveBeenCalledWith({
      mapId: 'lantern-square',
      x: 12.5,
      y: 8,
      facingDirection: 'east',
    });
    expect(handle.destroy).toHaveBeenCalledTimes(1);
    root = createRoot(container);
  });
});
