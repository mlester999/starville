import { FACING_DIRECTIONS, type FacingDirection, type Point } from '@starville/game-core';

import { AVATAR_ANIMATION_STATES, type AvatarAnimationState } from './contracts';

export type RealtimeAvatarMovementState = 'idle' | 'walking' | 'jogging';

export type AvatarVectorRigFaceMode =
  | 'back'
  | 'back-three-quarter-right'
  | 'profile-right'
  | 'three-quarter-right'
  | 'front'
  | 'three-quarter-left'
  | 'profile-left'
  | 'back-three-quarter-left';

export type AvatarVectorRigSide = 'left' | 'right';

export interface AvatarVectorRigDirectionalPose {
  readonly key: `pose-${FacingDirection}`;
  readonly direction: FacingDirection;
  readonly orientationIndex: number;
  readonly facingVector: Point;
  readonly faceMode: AvatarVectorRigFaceMode;
  readonly backFacing: boolean;
  readonly nearSide: AvatarVectorRigSide;
  readonly torsoYaw: number;
  readonly torsoWidthScale: number;
  readonly shoulderSlope: number;
  readonly headOffsetX: number;
  readonly headWidthScale: number;
  readonly limbDepthOffset: number;
  readonly gaitAxis: Point;
}

export interface AvatarVectorRigAnimationMapping {
  readonly key: `${AvatarAnimationState}:${FacingDirection}`;
  readonly state: AvatarAnimationState;
  readonly direction: FacingDirection;
  readonly frameCount: number;
  readonly frameDurationMs: number;
  readonly loop: true;
  readonly anchorX: 0.5;
  readonly anchorY: 1;
}

export interface AvatarVectorRigMotion {
  readonly bob: number;
  readonly torsoLean: number;
  readonly nearLegStride: number;
  readonly farLegStride: number;
  readonly nearArmSwing: number;
  readonly farArmSwing: number;
}

export interface AvatarVectorRigFrame {
  readonly key: `${AvatarAnimationState}:${FacingDirection}:${number}`;
  readonly mappingKey: `${AvatarAnimationState}:${FacingDirection}`;
  readonly state: AvatarAnimationState;
  readonly direction: FacingDirection;
  readonly frameIndex: number;
  readonly frameCount: number;
  readonly frameDurationMs: number;
  readonly reducedMotion: boolean;
  readonly footAnchor: Point;
  readonly pose: AvatarVectorRigDirectionalPose;
  readonly motion: AvatarVectorRigMotion;
}

export const AVATAR_VECTOR_RIG_FOOT_ANCHOR = Object.freeze({ x: 0, y: 0 });

const DIRECTIONAL_POSES: Readonly<Record<FacingDirection, AvatarVectorRigDirectionalPose>> =
  Object.freeze({
    north: Object.freeze({
      key: 'pose-north',
      direction: 'north',
      orientationIndex: 0,
      facingVector: Object.freeze({ x: 0, y: -1 }),
      faceMode: 'back',
      backFacing: true,
      nearSide: 'right',
      torsoYaw: 0,
      torsoWidthScale: 1,
      shoulderSlope: -1.5,
      headOffsetX: 0,
      headWidthScale: 0.98,
      limbDepthOffset: -1.5,
      gaitAxis: Object.freeze({ x: 0.28, y: -0.96 }),
    }),
    northeast: Object.freeze({
      key: 'pose-northeast',
      direction: 'northeast',
      orientationIndex: 1,
      facingVector: Object.freeze({ x: 0.72, y: -0.72 }),
      faceMode: 'back-three-quarter-right',
      backFacing: true,
      nearSide: 'left',
      torsoYaw: 0.58,
      torsoWidthScale: 0.84,
      shoulderSlope: -2.25,
      headOffsetX: 3.5,
      headWidthScale: 0.9,
      limbDepthOffset: -0.75,
      gaitAxis: Object.freeze({ x: 0.78, y: -0.62 }),
    }),
    east: Object.freeze({
      key: 'pose-east',
      direction: 'east',
      orientationIndex: 2,
      facingVector: Object.freeze({ x: 1, y: 0 }),
      faceMode: 'profile-right',
      backFacing: false,
      nearSide: 'left',
      torsoYaw: 1,
      torsoWidthScale: 0.64,
      shoulderSlope: -0.75,
      headOffsetX: 5,
      headWidthScale: 0.78,
      limbDepthOffset: 0,
      gaitAxis: Object.freeze({ x: 1, y: 0.12 }),
    }),
    southeast: Object.freeze({
      key: 'pose-southeast',
      direction: 'southeast',
      orientationIndex: 3,
      facingVector: Object.freeze({ x: 0.72, y: 0.72 }),
      faceMode: 'three-quarter-right',
      backFacing: false,
      nearSide: 'right',
      torsoYaw: 0.58,
      torsoWidthScale: 0.84,
      shoulderSlope: 1.75,
      headOffsetX: 3.5,
      headWidthScale: 0.9,
      limbDepthOffset: 0.75,
      gaitAxis: Object.freeze({ x: 0.78, y: 0.62 }),
    }),
    south: Object.freeze({
      key: 'pose-south',
      direction: 'south',
      orientationIndex: 4,
      facingVector: Object.freeze({ x: 0, y: 1 }),
      faceMode: 'front',
      backFacing: false,
      nearSide: 'left',
      torsoYaw: 0,
      torsoWidthScale: 1,
      shoulderSlope: 1.25,
      headOffsetX: 0,
      headWidthScale: 1,
      limbDepthOffset: 1.5,
      gaitAxis: Object.freeze({ x: -0.28, y: 0.96 }),
    }),
    southwest: Object.freeze({
      key: 'pose-southwest',
      direction: 'southwest',
      orientationIndex: 5,
      facingVector: Object.freeze({ x: -0.72, y: 0.72 }),
      faceMode: 'three-quarter-left',
      backFacing: false,
      nearSide: 'left',
      torsoYaw: -0.58,
      torsoWidthScale: 0.84,
      shoulderSlope: 2.25,
      headOffsetX: -3.5,
      headWidthScale: 0.9,
      limbDepthOffset: 0.75,
      gaitAxis: Object.freeze({ x: -0.78, y: 0.62 }),
    }),
    west: Object.freeze({
      key: 'pose-west',
      direction: 'west',
      orientationIndex: 6,
      facingVector: Object.freeze({ x: -1, y: 0 }),
      faceMode: 'profile-left',
      backFacing: false,
      nearSide: 'right',
      torsoYaw: -1,
      torsoWidthScale: 0.64,
      shoulderSlope: 0.75,
      headOffsetX: -5,
      headWidthScale: 0.78,
      limbDepthOffset: 0,
      gaitAxis: Object.freeze({ x: -1, y: -0.12 }),
    }),
    northwest: Object.freeze({
      key: 'pose-northwest',
      direction: 'northwest',
      orientationIndex: 7,
      facingVector: Object.freeze({ x: -0.72, y: -0.72 }),
      faceMode: 'back-three-quarter-left',
      backFacing: true,
      nearSide: 'right',
      torsoYaw: -0.58,
      torsoWidthScale: 0.84,
      shoulderSlope: -1.75,
      headOffsetX: -3.5,
      headWidthScale: 0.9,
      limbDepthOffset: -0.75,
      gaitAxis: Object.freeze({ x: -0.78, y: -0.62 }),
    }),
  });

const ANIMATION_DEFINITIONS: Readonly<
  Record<
    AvatarAnimationState,
    Readonly<{
      frameCount: number;
      frameDurationMs: number;
      bob: number;
      stride: number;
      armSwing: number;
      lean: number;
    }>
  >
> = Object.freeze({
  idle: Object.freeze({
    frameCount: 4,
    frameDurationMs: 360,
    bob: 0.7,
    stride: 0,
    armSwing: 0,
    lean: 0,
  }),
  walk: Object.freeze({
    frameCount: 8,
    frameDurationMs: 120,
    bob: 2.3,
    stride: 5,
    armSwing: 4.5,
    lean: 0.7,
  }),
  jog: Object.freeze({
    frameCount: 8,
    frameDurationMs: 80,
    bob: 3.5,
    stride: 8,
    armSwing: 7,
    lean: 1.4,
  }),
});

export const AVATAR_VECTOR_RIG_ANIMATION_MAPPINGS: readonly AvatarVectorRigAnimationMapping[] =
  Object.freeze(
    AVATAR_ANIMATION_STATES.flatMap((state) => {
      const definition = ANIMATION_DEFINITIONS[state];
      return FACING_DIRECTIONS.map((direction) =>
        Object.freeze({
          key: `${state}:${direction}` as const,
          state,
          direction,
          frameCount: definition.frameCount,
          frameDurationMs: definition.frameDurationMs,
          loop: true as const,
          anchorX: 0.5 as const,
          anchorY: 1 as const,
        }),
      );
    }),
  );

export function avatarAnimationStateForMovement(
  moving: boolean,
  jogging: boolean,
): AvatarAnimationState {
  if (!moving) return 'idle';
  return jogging ? 'jog' : 'walk';
}

export function avatarAnimationStateFromRealtime(
  state: RealtimeAvatarMovementState,
): AvatarAnimationState {
  switch (state) {
    case 'idle':
      return 'idle';
    case 'walking':
      return 'walk';
    case 'jogging':
      return 'jog';
  }
}

export function resolveAvatarVectorRigPose(
  direction: FacingDirection,
): AvatarVectorRigDirectionalPose {
  return DIRECTIONAL_POSES[direction];
}

export function resolveAvatarVectorRigFrame(input: {
  readonly direction: FacingDirection;
  readonly state: AvatarAnimationState;
  readonly elapsedMs: number;
  readonly reducedMotion?: boolean;
}): AvatarVectorRigFrame {
  const definition = ANIMATION_DEFINITIONS[input.state];
  const reducedMotion = input.reducedMotion ?? false;
  const elapsedMs = Number.isFinite(input.elapsedMs) ? Math.max(0, input.elapsedMs) : 0;
  const frameIndex = reducedMotion
    ? 0
    : Math.floor(elapsedMs / definition.frameDurationMs) % definition.frameCount;
  const phase = (frameIndex / definition.frameCount) * Math.PI * 2;
  const phaseWave = reducedMotion ? 0 : Math.sin(phase);
  const bobWave = reducedMotion
    ? 0
    : input.state === 'idle'
      ? Math.sin(phase) * definition.bob
      : Math.abs(phaseWave) * definition.bob;
  const pose = resolveAvatarVectorRigPose(input.direction);

  return Object.freeze({
    key: `${input.state}:${input.direction}:${frameIndex}`,
    mappingKey: `${input.state}:${input.direction}`,
    state: input.state,
    direction: input.direction,
    frameIndex,
    frameCount: definition.frameCount,
    frameDurationMs: definition.frameDurationMs,
    reducedMotion,
    footAnchor: AVATAR_VECTOR_RIG_FOOT_ANCHOR,
    pose,
    motion: Object.freeze({
      bob: bobWave,
      torsoLean: phaseWave * definition.lean,
      nearLegStride: phaseWave * definition.stride,
      farLegStride: reducedMotion ? 0 : -phaseWave * definition.stride,
      nearArmSwing: reducedMotion ? 0 : -phaseWave * definition.armSwing,
      farArmSwing: phaseWave * definition.armSwing,
    }),
  });
}
