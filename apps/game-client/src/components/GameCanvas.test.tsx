import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameRuntimeHandle, GameRuntimeOptions } from '../game/contracts';
import { WORLD_ASSET_FALLBACK_EVENT_NAME } from '../game/contracts';
import { lanternSquareManifest } from '@starville/game-core';
import { GameCanvas } from './GameCanvas';
import { fallbackResolvedAvatar } from '../app/avatar-client';

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
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
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
      setTouchMovementInput: vi.fn(),
      setAudioSettings: vi.fn(),
      setRemotePresences: vi.fn(),
      setLocalAvatarProfile: vi.fn(),
      setRemoteAvatarProfiles: vi.fn(),
      setRemotePlayerNamesVisible: vi.fn(),
      setVisualSettings: vi.fn(),
      setChatBubbleMessages: vi.fn(),
      setReducedMotion: vi.fn(),
      setSelectedRemotePresence: vi.fn(),
      setActivityInstance: vi.fn(),
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
    const clock = { now: () => Date.parse('2026-07-18T04:00:00.000Z') };
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
      clock,
    };

    await act(async () => {
      root.render(<GameCanvas {...common} inputBlocked={false} />);
      await Promise.resolve();
    });

    const moveUp = container.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');
    expect(moveUp).not.toBeNull();
    const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, 'pointerId', { value: 7 });
    await act(async () => moveUp!.dispatchEvent(pointerDown));
    expect(handle.setTouchMovementInput).toHaveBeenLastCalledWith({
      up: true,
      down: false,
      left: false,
      right: false,
    });
    const pointerUp = new Event('pointerup', { bubbles: true, cancelable: true });
    Object.defineProperty(pointerUp, 'pointerId', { value: 7 });
    await act(async () => moveUp!.dispatchEvent(pointerUp));
    expect(handle.setTouchMovementInput).toHaveBeenLastCalledWith({
      up: false,
      down: false,
      left: false,
      right: false,
    });
    const heldPointer = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(heldPointer, 'pointerId', { value: 8 });
    await act(async () => moveUp!.dispatchEvent(heldPointer));
    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(handle.setTouchMovementInput).toHaveBeenLastCalledWith({
      up: false,
      down: false,
      left: false,
      right: false,
    });
    await act(async () =>
      moveUp!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' })),
    );
    expect(handle.setTouchMovementInput).toHaveBeenLastCalledWith({
      up: true,
      down: false,
      left: false,
      right: false,
    });
    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(handle.setTouchMovementInput).toHaveBeenLastCalledWith({
      up: false,
      down: false,
      left: false,
      right: false,
    });

    await act(async () => {
      root.render(
        <GameCanvas
          {...common}
          avatarProfile={fallbackResolvedAvatar('river', '22222222-2222-4222-8222-222222222222')}
          inputBlocked
          reducedMotion
          remoteAvatarProfiles={{
            remote: fallbackResolvedAvatar('moonberry', '33333333-3333-4333-8333-333333333333'),
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(startGame).toHaveBeenCalledTimes(1);
    expect(handle.setInputBlocked).toHaveBeenCalledWith(true);
    expect(handle.setTouchMovementInput).toHaveBeenLastCalledWith({
      up: false,
      down: false,
      left: false,
      right: false,
    });
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('.game-touch-movement button')].every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    expect(handle.setLocalAvatarProfile).toHaveBeenCalledTimes(1);
    expect(handle.setRemoteAvatarProfiles).toHaveBeenLastCalledWith(
      expect.objectContaining({
        remote: expect.objectContaining({ legacyFallbackPreset: 'moonberry' }),
      }),
    );
    expect(handle.setVisualSettings).toHaveBeenCalled();
    expect(handle.setChatBubbleMessages).toHaveBeenCalledWith([]);
    expect(handle.setReducedMotion).toHaveBeenCalledWith(true);

    const observedFallback = vi.fn();
    window.addEventListener(WORLD_ASSET_FALLBACK_EVENT_NAME, observedFallback);
    const runtimeOptions = startGame.mock.calls[0]![1] as GameRuntimeOptions;
    expect(runtimeOptions.clock).toBe(clock);
    expect(runtimeOptions.avatarRendererMode).toBe('published_v1');
    runtimeOptions.callbacks.onStateChanged(common.initialState, 'stopped');
    expect(common.onStateChanged).toHaveBeenCalledWith(common.initialState, 'stopped');
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
