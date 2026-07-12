import Phaser from 'phaser';

export interface GameplayKeys {
  readonly up: Phaser.Input.Keyboard.Key;
  readonly down: Phaser.Input.Keyboard.Key;
  readonly left: Phaser.Input.Keyboard.Key;
  readonly right: Phaser.Input.Keyboard.Key;
  readonly interact: Phaser.Input.Keyboard.Key;
  readonly settings: Phaser.Input.Keyboard.Key;
  readonly jog: Phaser.Input.Keyboard.Key;
}

export function createGameplayKeys(keyboard: Phaser.Input.Keyboard.KeyboardPlugin): GameplayKeys {
  keyboard.addCapture([
    Phaser.Input.Keyboard.KeyCodes.W,
    Phaser.Input.Keyboard.KeyCodes.A,
    Phaser.Input.Keyboard.KeyCodes.S,
    Phaser.Input.Keyboard.KeyCodes.D,
  ]);

  return {
    up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
    left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    interact: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
    settings: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
    // Browser key code 16 represents either physical Shift key.
    jog: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
  };
}
