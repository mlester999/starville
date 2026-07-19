import { describe, expect, it } from 'vitest';

import { FACING_DIRECTIONS } from '@starville/game-core';

import {
  AVATAR_ANIMATION_STATES,
  AVATAR_VECTOR_RIG_ANIMATION_MAPPINGS,
  AVATAR_VECTOR_RIG_FOOT_ANCHOR,
  avatarAnimationStateForMovement,
  avatarAnimationStateFromRealtime,
  resolveAvatarVectorRigFrame,
  resolveAvatarVectorRigPose,
} from '../src/index.js';

describe('production-candidate avatar vector rig', () => {
  it('provides exactly one stable mapping for every state and direction', () => {
    expect(AVATAR_VECTOR_RIG_ANIMATION_MAPPINGS).toHaveLength(24);
    expect(new Set(AVATAR_VECTOR_RIG_ANIMATION_MAPPINGS.map((mapping) => mapping.key)).size).toBe(
      24,
    );
    expect(AVATAR_VECTOR_RIG_ANIMATION_MAPPINGS.map((mapping) => mapping.key)).toEqual(
      AVATAR_ANIMATION_STATES.flatMap((state) =>
        FACING_DIRECTIONS.map((direction) => `${state}:${direction}`),
      ),
    );
    expect(
      AVATAR_VECTOR_RIG_ANIMATION_MAPPINGS.every(
        (mapping) => mapping.anchorX === 0.5 && mapping.anchorY === 1,
      ),
    ).toBe(true);
  });

  it('keeps every cardinal and diagonal pose structurally distinct', () => {
    const poses = FACING_DIRECTIONS.map(resolveAvatarVectorRigPose);
    expect(new Set(poses.map((pose) => pose.key)).size).toBe(8);
    expect(new Set(poses.map((pose) => pose.orientationIndex)).size).toBe(8);
    expect(new Set(poses.map((pose) => pose.faceMode)).size).toBe(8);

    const northeast = resolveAvatarVectorRigPose('northeast');
    const southeast = resolveAvatarVectorRigPose('southeast');
    const northwest = resolveAvatarVectorRigPose('northwest');
    const southwest = resolveAvatarVectorRigPose('southwest');
    expect(northeast).not.toMatchObject(southeast);
    expect(northwest).not.toMatchObject(southwest);
    expect(northeast.torsoYaw).toBe(-northwest.torsoYaw);
    expect(southeast.gaitAxis.y).toBeGreaterThan(0);
    expect(northeast.gaitAxis.y).toBeLessThan(0);
  });

  it('resolves deterministic frames without moving the foot anchor', () => {
    for (const state of AVATAR_ANIMATION_STATES) {
      for (const direction of FACING_DIRECTIONS) {
        const first = resolveAvatarVectorRigFrame({
          direction,
          state,
          elapsedMs: 480,
        });
        const repeated = resolveAvatarVectorRigFrame({
          direction,
          state,
          elapsedMs: 480,
        });
        expect(repeated).toEqual(first);
        expect(first.footAnchor).toBe(AVATAR_VECTOR_RIG_FOOT_ANCHOR);
        expect(first.footAnchor).toEqual({ x: 0, y: 0 });
        expect(first.frameIndex).toBeGreaterThanOrEqual(0);
        expect(first.frameIndex).toBeLessThan(first.frameCount);
      }
    }
  });

  it('freezes motion deterministically while preserving requested direction and state', () => {
    const reduced = resolveAvatarVectorRigFrame({
      direction: 'southwest',
      state: 'jog',
      elapsedMs: 9_999,
      reducedMotion: true,
    });
    expect(reduced).toMatchObject({
      key: 'jog:southwest:0',
      direction: 'southwest',
      state: 'jog',
      frameIndex: 0,
      reducedMotion: true,
      motion: {
        bob: 0,
        torsoLean: 0,
        nearLegStride: 0,
        farLegStride: 0,
        nearArmSwing: 0,
        farArmSwing: 0,
      },
    });
  });

  it('adapts local and realtime movement names to one canonical animation state', () => {
    expect(avatarAnimationStateForMovement(false, false)).toBe('idle');
    expect(avatarAnimationStateForMovement(false, true)).toBe('idle');
    expect(avatarAnimationStateForMovement(true, false)).toBe('walk');
    expect(avatarAnimationStateForMovement(true, true)).toBe('jog');
    expect(avatarAnimationStateFromRealtime('idle')).toBe('idle');
    expect(avatarAnimationStateFromRealtime('walking')).toBe('walk');
    expect(avatarAnimationStateFromRealtime('jogging')).toBe('jog');
  });
});
