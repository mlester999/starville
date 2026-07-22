import { FACING_DIRECTIONS, type FacingDirection } from '@starville/game-core';

import {
  AVATAR_ANIMATION_STATES,
  avatarAnimationSetSchema,
  type AvatarAnimationFrameMapping,
  type AvatarAnimationState,
} from './contracts';

export const PRODUCTION_SLICE_AVATAR_TEXTURE_KEY =
  'starville-production-slice-v3-adventurer' as const;
export const PRODUCTION_SLICE_AVATAR_RUNTIME_URL =
  '/assets/starville/avatar/production-slice-v3/starville-production-adventurer.webp?manifest=3.1.0' as const;
export const PRODUCTION_SLICE_AVATAR_FRAME_WIDTH = 192 as const;
export const PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT = 256 as const;
export const PRODUCTION_SLICE_AVATAR_COLUMNS = 12 as const;
export const PRODUCTION_SLICE_AVATAR_ROWS = 8 as const;
export const PRODUCTION_SLICE_PLAYER_DISPLAY_SCALE = 0.336 as const;
export const PRODUCTION_SLICE_MAX_ANIMATION_DELTA_MS = 100 as const;

export const PRODUCTION_SLICE_LOCOMOTION_FRAME_DISTANCE = Object.freeze({
  walk: 0.25,
  jog: 0.28,
} as const);

const STATE_COLUMNS: Readonly<Record<AvatarAnimationState, number>> = {
  idle: 0,
  walk: 4,
  jog: 8,
};

const STATE_TIMING: Readonly<Record<AvatarAnimationState, number>> = {
  idle: 360,
  walk: 130,
  jog: 85,
};

export const PRODUCTION_SLICE_AVATAR_MAPPINGS: readonly AvatarAnimationFrameMapping[] =
  avatarAnimationSetSchema.parse(
    AVATAR_ANIMATION_STATES.flatMap((state) =>
      FACING_DIRECTIONS.map((direction, row) => ({
        direction,
        state,
        row,
        startColumn: STATE_COLUMNS[state],
        frameCount: 4,
        frameDurationMs: STATE_TIMING[state],
        loop: true,
        anchorX: 0.5,
        anchorY: 0.97,
      })),
    ),
  );

const MAPPING_BY_KEY = new Map(
  PRODUCTION_SLICE_AVATAR_MAPPINGS.map((mapping) => [
    `${mapping.state}:${mapping.direction}`,
    mapping,
  ]),
);

export function productionSliceAvatarMapping(
  state: AvatarAnimationState,
  direction: FacingDirection,
): AvatarAnimationFrameMapping {
  const mapping = MAPPING_BY_KEY.get(`${state}:${direction}`);
  if (mapping === undefined)
    throw new Error(`Missing production avatar state ${state}:${direction}`);
  return mapping;
}

export function productionSliceAvatarFrame(
  state: AvatarAnimationState,
  direction: FacingDirection,
  elapsedMs: number,
  reducedMotion: boolean,
): number {
  const mapping = productionSliceAvatarMapping(state, direction);
  const phase = reducedMotion
    ? 0
    : Math.floor(Math.max(elapsedMs, 0) / mapping.frameDurationMs) % mapping.frameCount;
  return mapping.row * PRODUCTION_SLICE_AVATAR_COLUMNS + mapping.startColumn + phase;
}

export interface ProductionSliceAnimationSnapshot {
  readonly state: AvatarAnimationState;
  readonly direction: FacingDirection;
  readonly frame: number;
  readonly frameInState: number;
  readonly elapsedMs: number;
  readonly distanceTiles: number;
}

/** Game-loop-owned animation clock; React rendering and key repeat are irrelevant. */
export class ProductionSliceAnimationClock {
  private state: AvatarAnimationState = 'idle';
  private direction: FacingDirection = 'south';
  private elapsedMs = 0;
  private distanceTiles = 0;
  private distanceDriven = false;
  private previousNow: number | undefined;
  private snapshot: ProductionSliceAnimationSnapshot = {
    state: 'idle',
    direction: 'south',
    frame: productionSliceAvatarFrame('idle', 'south', 0, false),
    frameInState: 0,
    elapsedMs: 0,
    distanceTiles: 0,
  };

  public advance(input: {
    readonly state: AvatarAnimationState;
    readonly direction: FacingDirection;
    readonly now: number;
    readonly reducedMotion: boolean;
    readonly travelDistanceTiles?: number;
  }): ProductionSliceAnimationSnapshot {
    const stateChanged = input.state !== this.state || input.direction !== this.direction;
    if (stateChanged) {
      this.state = input.state;
      this.direction = input.direction;
      this.elapsedMs = 0;
      this.distanceTiles = 0;
      this.distanceDriven = false;
    } else if (this.previousNow !== undefined) {
      const delta = Math.min(
        Math.max(Number.isFinite(input.now) ? input.now - this.previousNow : 0, 0),
        PRODUCTION_SLICE_MAX_ANIMATION_DELTA_MS,
      );
      this.elapsedMs += delta;
    }
    if (
      input.state !== 'idle' &&
      input.travelDistanceTiles !== undefined &&
      Number.isFinite(input.travelDistanceTiles)
    ) {
      this.distanceDriven = true;
      this.distanceTiles += Math.min(Math.max(input.travelDistanceTiles, 0), 0.4);
    }
    this.previousNow = input.now;

    const mapping = productionSliceAvatarMapping(this.state, this.direction);
    const frameInState = input.reducedMotion
      ? 0
      : this.state !== 'idle' && this.distanceDriven
        ? Math.floor(this.distanceTiles / PRODUCTION_SLICE_LOCOMOTION_FRAME_DISTANCE[this.state]) %
          mapping.frameCount
        : Math.floor(this.elapsedMs / mapping.frameDurationMs) % mapping.frameCount;
    this.snapshot = {
      state: this.state,
      direction: this.direction,
      frame: mapping.row * PRODUCTION_SLICE_AVATAR_COLUMNS + mapping.startColumn + frameInState,
      frameInState,
      elapsedMs: this.elapsedMs,
      distanceTiles: this.distanceTiles,
    };
    return this.snapshot;
  }

  public current(): ProductionSliceAnimationSnapshot {
    return this.snapshot;
  }
}

export const PRODUCTION_SLICE_AVATAR_MANIFEST = Object.freeze({
  schemaVersion: 1,
  candidate: 'starville-production-slice-v3',
  status: 'local_unpublished_owner_review_required',
  sourcePath: 'assets/source-v3/avatar/starville-production-adventurer.png',
  runtimePath: PRODUCTION_SLICE_AVATAR_RUNTIME_URL.split('?')[0],
  frameWidth: PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
  frameHeight: PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
  columns: PRODUCTION_SLICE_AVATAR_COLUMNS,
  rows: PRODUCTION_SLICE_AVATAR_ROWS,
  frameCount: PRODUCTION_SLICE_AVATAR_COLUMNS * PRODUCTION_SLICE_AVATAR_ROWS,
  mappings: PRODUCTION_SLICE_AVATAR_MAPPINGS,
});
