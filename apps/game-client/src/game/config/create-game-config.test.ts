import Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {
    public constructor(_config?: unknown) {}
  }

  return {
    default: {
      AUTO: 0,
      Scale: {
        CENTER_BOTH: 1,
        RESIZE: 5,
      },
      Scene,
    },
  };
});

import type { GameRuntimeOptions } from '../contracts';
import { lanternSquareManifest } from '@starville/game-core';

import { WorldScene } from '../scenes/WorldScene';
import { createGameConfig } from './create-game-config';

const options: GameRuntimeOptions = {
  initialState: { mapId: 'lantern-square', x: 12, y: 7.5, facingDirection: 'south' },
  initialWorld: {
    manifest: lanternSquareManifest(),
    versionId: '11111111-1111-4111-8111-111111111111',
    checksum: 'a'.repeat(64),
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
  },
};

describe('createGameConfig', () => {
  it('creates an antialiased Lantern Square runtime without client-authoritative physics', () => {
    const config = createGameConfig('game-host', options);

    expect(config.parent).toBe('game-host');
    expect(config.render).toMatchObject({
      antialias: true,
      pixelArt: false,
      roundPixels: false,
    });
    expect(config.scene).toEqual([expect.any(WorldScene)]);
    expect(config.physics).toBeUndefined();
    expect(config.type).toBe(Phaser.AUTO);
  });
});
