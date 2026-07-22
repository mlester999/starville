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

const OCTANT_DIRECTIONS: readonly FacingDirection[] = [
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
  'north',
  'northeast',
];
const OCTANT_ANGLE_RADIANS = Math.PI / 4;
const OCTANT_HALF_ANGLE_RADIANS = OCTANT_ANGLE_RADIANS / 2;

/**
 * A small dead band around each octant boundary prevents alternating collision
 * slide vectors from flipping the visible pose every frame. It only applies
 * when a prior direction exists; first-frame/input resolution stays exact.
 */
export const FACING_DIRECTION_HYSTERESIS_RADIANS = Math.PI / 24;

function screenAngleForWorldVelocity(velocity: Point): number | undefined {
  const screenX = velocity.x - velocity.y;
  const screenY = velocity.x + velocity.y;
  if (
    !Number.isFinite(screenX) ||
    !Number.isFinite(screenY) ||
    Math.hypot(screenX, screenY) <= 1e-6
  ) {
    return undefined;
  }
  return Math.atan2(screenY, screenX);
}

function directionForScreenVector(x: number, y: number): FacingDirection | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) <= 1e-6) return undefined;
  const octant = Math.round(Math.atan2(y, x) / OCTANT_ANGLE_RADIANS);
  return OCTANT_DIRECTIONS[(octant + 8) % 8];
}

function angularDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

/**
 * Canonical eight-way direction resolver. World movement is authoritative;
 * the velocity is projected into screen space once before selecting the atlas
 * direction, preventing keyboard order, collision sliding, and double mirroring
 * from reversing east and west.
 */
export function facingDirectionForWorldVelocity(velocity: Point): FacingDirection | undefined {
  return directionForScreenVector(velocity.x - velocity.y, velocity.x + velocity.y);
}

export function movementIntent(input: MovementInput): MovementIntent {
  const screenX = Number(input.right) - Number(input.left);
  const screenY = Number(input.down) - Number(input.up);
  if (screenX === 0 && screenY === 0) {
    return { moving: false, unit: { x: 0, y: 0 } };
  }

  // Convert screen-relative controls into the logical isometric plane. The renderer projects
  // these axes back to the expected compass direction, while collision and persistence stay in
  // stable map coordinates.
  const worldX = (screenX + screenY) / 2;
  const worldY = (screenY - screenX) / 2;
  const length = Math.hypot(worldX, worldY);
  const unit = { x: worldX / length, y: worldY / length };
  return {
    moving: true,
    direction: facingDirectionForWorldVelocity(unit)!,
    unit,
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

export function nextFacingDirectionFromVelocity(
  velocity: Point,
  previous: FacingDirection,
): FacingDirection {
  const angle = screenAngleForWorldVelocity(velocity);
  if (angle === undefined) return previous;

  const previousIndex = OCTANT_DIRECTIONS.indexOf(previous);
  const previousAngle = previousIndex * OCTANT_ANGLE_RADIANS;
  if (
    angularDistance(angle, previousAngle) <=
    OCTANT_HALF_ANGLE_RADIANS + FACING_DIRECTION_HYSTERESIS_RADIANS
  ) {
    return previous;
  }

  return facingDirectionForWorldVelocity(velocity) ?? previous;
}
