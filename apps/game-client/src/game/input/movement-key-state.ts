import type { MovementInput } from '@starville/game-core';

export interface MovementKeyState {
  readonly up: { readonly isDown: boolean };
  readonly down: { readonly isDown: boolean };
  readonly left: { readonly isDown: boolean };
  readonly right: { readonly isDown: boolean };
  readonly jog: { readonly isDown: boolean };
}

export function readMovementInput(keys: MovementKeyState): MovementInput {
  return {
    up: keys.up.isDown,
    down: keys.down.isDown,
    left: keys.left.isDown,
    right: keys.right.isDown,
  };
}

export function isJogging(keys: MovementKeyState): boolean {
  return keys.jog.isDown;
}
