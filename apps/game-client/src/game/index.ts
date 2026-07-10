import Phaser from 'phaser';

import { createGameConfig } from './config/create-game-config';

export function startGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game(createGameConfig(parent));
}

export function destroyGame(game: Phaser.Game): void {
  game.destroy(true);
}
