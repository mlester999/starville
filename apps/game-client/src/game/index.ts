import Phaser from 'phaser';

import { createGameConfig } from './config/create-game-config';
import type { GameRuntimeHandle, GameRuntimeOptions } from './contracts';
import { WorldScene } from './scenes/WorldScene';

const activeRuntimes = new WeakMap<HTMLElement, GameRuntimeHandle>();

export function startGame(parent: HTMLElement, options: GameRuntimeOptions): GameRuntimeHandle {
  activeRuntimes.get(parent)?.destroy();
  parent.replaceChildren();

  const scene = new WorldScene(options);
  const game = new Phaser.Game(createGameConfig(parent, options, scene));
  game.sound.setVolume(options.audioSettings.masterVolume);
  game.sound.setMute(options.audioSettings.muted);
  let destroyed = false;

  const handle: GameRuntimeHandle = {
    setInputBlocked(blocked) {
      if (!destroyed) scene.setInputBlocked(blocked);
    },
    setAudioSettings(settings) {
      if (destroyed) return;
      game.sound.setVolume(settings.masterVolume);
      game.sound.setMute(settings.muted);
    },
    interact() {
      if (!destroyed) scene.interact();
    },
    getState() {
      return scene.getState();
    },
    loadWorld(world, state) {
      if (!destroyed) scene.loadWorld(world, state);
    },
    cancelTransition() {
      if (!destroyed) scene.cancelTransition();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      game.destroy(true);
      parent.replaceChildren();
      if (activeRuntimes.get(parent) === handle) activeRuntimes.delete(parent);
    },
  };

  activeRuntimes.set(parent, handle);
  return handle;
}

export type { GameRuntimeHandle, GameRuntimeOptions } from './contracts';
