import type { MovementInput } from '@starville/game-core';

export type TouchMovementDirection = keyof MovementInput;

export const IDLE_TOUCH_MOVEMENT: MovementInput = {
  up: false,
  down: false,
  left: false,
  right: false,
};

export function touchMovementForDirections(
  directions: Iterable<TouchMovementDirection>,
): MovementInput {
  const active = new Set(directions);
  return {
    up: active.has('up'),
    down: active.has('down'),
    left: active.has('left'),
    right: active.has('right'),
  };
}

/** Keyboard and touch share the same collision-safe movement pipeline. */
export function mergeMovementInput(keyboard: MovementInput, touch: MovementInput): MovementInput {
  return {
    up: keyboard.up || touch.up,
    down: keyboard.down || touch.down,
    left: keyboard.left || touch.left,
    right: keyboard.right || touch.right,
  };
}
