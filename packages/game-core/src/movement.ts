import type { FacingDirection, Point } from './contracts';

export interface MovementInput {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export interface MovementIntent {
  readonly moving: boolean;
  readonly direction?: FacingDirection;
  readonly unit: Point;
}

export const WALK_SPEED_TILES_PER_SECOND = 2.5;
export const JOG_SPEED_MULTIPLIER = 1.35;

export function movementSpeed(jogging: boolean): number {
  return WALK_SPEED_TILES_PER_SECOND * (jogging ? JOG_SPEED_MULTIPLIER : 1);
}

function directionFor(x: number, y: number): FacingDirection | undefined {
  if (x === 0 && y < 0) return 'north';
  if (x > 0 && y < 0) return 'northeast';
  if (x > 0 && y === 0) return 'east';
  if (x > 0 && y > 0) return 'southeast';
  if (x === 0 && y > 0) return 'south';
  if (x < 0 && y > 0) return 'southwest';
  if (x < 0 && y === 0) return 'west';
  if (x < 0 && y < 0) return 'northwest';
  return undefined;
}

export function movementIntent(input: MovementInput): MovementIntent {
  const screenX = Number(input.right) - Number(input.left);
  const screenY = Number(input.down) - Number(input.up);
  const direction = directionFor(screenX, screenY);

  if (direction === undefined) {
    return { moving: false, unit: { x: 0, y: 0 } };
  }

  // Convert screen-relative controls into the logical isometric plane. The renderer projects
  // these axes back to the expected compass direction, while collision and persistence stay in
  // stable map coordinates.
  const worldX = (screenX + screenY) / 2;
  const worldY = (screenY - screenX) / 2;
  const length = Math.hypot(worldX, worldY);
  return {
    moving: true,
    direction,
    unit: { x: worldX / length, y: worldY / length },
  };
}

export function movementDelta(
  input: MovementInput,
  speedTilesPerSecond: number,
  deltaSeconds: number,
): Point {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return { x: 0, y: 0 };
  }

  const intent = movementIntent(input);
  const distance = speedTilesPerSecond * Math.min(deltaSeconds, 0.1);
  return { x: intent.unit.x * distance, y: intent.unit.y * distance };
}

export function nextFacingDirection(
  input: MovementInput,
  previous: FacingDirection,
): FacingDirection {
  return movementIntent(input).direction ?? previous;
}
