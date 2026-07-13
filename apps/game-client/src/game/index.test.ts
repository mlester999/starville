import { describe, expect, it, vi } from 'vitest';

const destroyedGames = vi.hoisted(() => [] as unknown[]);

vi.mock('phaser', () => {
  class Scene {
    public constructor(_config?: unknown) {}
  }
  class Game {
    public readonly sound = { setVolume() {}, setMute() {} };
    public constructor(public readonly config: unknown) {}
    public destroy(removeCanvas: boolean) {
      destroyedGames.push({ game: this, removeCanvas });
    }
  }

  return {
    default: {
      AUTO: 0,
      Game,
      Scale: { CENTER_BOTH: 1, RESIZE: 5 },
      Scene,
    },
  };
});

import type { GameRuntimeOptions } from './contracts';
import { lanternSquareManifest } from '@starville/game-core';
import { startGame } from './index';

const options: GameRuntimeOptions = {
  initialState: { mapId: 'lantern-square', x: 12, y: 7.5, facingDirection: 'south' },
  initialWorld: {
    manifest: lanternSquareManifest(),
    versionId: '11111111-1111-4111-8111-111111111111',
    checksum: 'a'.repeat(64),
    assetDeliveries: [],
  },
  appearancePreset: 'moss',
  reducedMotion: false,
  collisionDebug: false,
  audioSettings: { masterVolume: 0.8, muted: false },
  callbacks: {
    onReady() {},
    onError() {},
    onStateChanged() {},
    onCheckpoint() {},
    onInteractionTarget() {},
    onInteractionOpen() {},
    onSettingsRequested() {},
    onExitRequested() {},
    onMapChanged() {},
    onWorldAssetFallback() {},
  },
};

describe('game runtime handle', () => {
  it('is usable before Phaser scene registration and destroys replacement runtimes exactly once', () => {
    const host = document.createElement('div');
    const first = startGame(host, options);

    expect(first.getState()).toEqual(options.initialState);
    expect(() => first.setInputBlocked(true)).not.toThrow();
    expect(() => first.interact()).not.toThrow();
    expect(() => first.cancelTransition()).not.toThrow();

    const second = startGame(host, options);
    expect(destroyedGames).toHaveLength(1);
    second.destroy();
    second.destroy();
    expect(destroyedGames).toHaveLength(2);
  });
});
