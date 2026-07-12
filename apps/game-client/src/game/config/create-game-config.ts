import Phaser from 'phaser';

import type { GameRuntimeOptions } from '../contracts';
import { WorldScene } from '../scenes/WorldScene';

export function createGameConfig(
  parent: HTMLElement | string,
  options: GameRuntimeOptions,
  scene: WorldScene = new WorldScene(options),
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 540,
    backgroundColor: '#17382b',
    banner: false,
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    fps: {
      target: 60,
      smoothStep: true,
    },
    scene: [scene],
  };
}
