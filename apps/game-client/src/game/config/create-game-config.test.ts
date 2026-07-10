import Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {}

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

import { FoundationScene } from '../scenes/FoundationScene';
import { createGameConfig } from './create-game-config';

describe('createGameConfig', () => {
  it('creates a non-pixel-art foundation scene without gameplay systems', () => {
    const config = createGameConfig('game-host');

    expect(config.parent).toBe('game-host');
    expect(config.render).toMatchObject({
      antialias: true,
      pixelArt: false,
      roundPixels: false,
    });
    expect(config.scene).toEqual([FoundationScene]);
    expect(config.physics).toBeUndefined();
    expect(config.type).toBe(Phaser.AUTO);
  });
});
