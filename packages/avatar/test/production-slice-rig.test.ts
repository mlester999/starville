import { describe, expect, it } from 'vitest';

import { FACING_DIRECTIONS } from '@starville/game-core';

import {
  PRODUCTION_SLICE_AVATAR_COLUMNS,
  PRODUCTION_SLICE_AVATAR_MANIFEST,
  PRODUCTION_SLICE_AVATAR_MAPPINGS,
  PRODUCTION_SLICE_LOCOMOTION_FRAME_DISTANCE,
  PRODUCTION_SLICE_PLAYER_DISPLAY_SCALE,
  ProductionSliceAnimationClock,
  productionSliceAvatarFrame,
} from '../src/production-slice-rig';

describe('production-slice avatar rig', () => {
  it('declares every idle, walk, and jog direction exactly once', () => {
    expect(PRODUCTION_SLICE_AVATAR_MAPPINGS).toHaveLength(24);
    expect(
      new Set(
        PRODUCTION_SLICE_AVATAR_MAPPINGS.map(({ state, direction }) => `${state}:${direction}`),
      ).size,
    ).toBe(24);
    expect(PRODUCTION_SLICE_AVATAR_MANIFEST.status).toBe('local_unpublished_owner_review_required');
  });

  it('maps eight genuine directional rows and stronger jog timing', () => {
    for (const [row, direction] of FACING_DIRECTIONS.entries()) {
      expect(productionSliceAvatarFrame('idle', direction, 0, false)).toBe(
        row * PRODUCTION_SLICE_AVATAR_COLUMNS,
      );
      expect(productionSliceAvatarFrame('walk', direction, 0, false)).toBe(
        row * PRODUCTION_SLICE_AVATAR_COLUMNS + 4,
      );
      expect(productionSliceAvatarFrame('jog', direction, 0, false)).toBe(
        row * PRODUCTION_SLICE_AVATAR_COLUMNS + 8,
      );
    }
    const walk = PRODUCTION_SLICE_AVATAR_MAPPINGS.find(({ state }) => state === 'walk');
    const jog = PRODUCTION_SLICE_AVATAR_MAPPINGS.find(({ state }) => state === 'jog');
    expect(jog?.frameDurationMs).toBeLessThan(walk?.frameDurationMs ?? 0);
    expect(productionSliceAvatarFrame('jog', 'south', 999, true)).toBe(
      productionSliceAvatarFrame('jog', 'south', 0, false),
    );
  });

  it('advances all four frames on a capped game-loop clock and resets cleanly', () => {
    const clock = new ProductionSliceAnimationClock();
    expect(PRODUCTION_SLICE_PLAYER_DISPLAY_SCALE).toBeCloseTo(0.336);
    const samples = [0, 100, 200, 300, 400].map((now) =>
      clock.advance({ state: 'walk', direction: 'west', now, reducedMotion: false }),
    );
    const frames = [samples[0]!, samples[2]!, samples[3]!, samples[4]!];
    expect(frames.map(({ frameInState }) => frameInState)).toEqual([0, 1, 2, 3]);
    expect(new Set(frames.map(({ frame }) => frame)).size).toBe(4);
    expect(
      clock.advance({ state: 'jog', direction: 'west', now: 410, reducedMotion: false }),
    ).toMatchObject({ state: 'jog', direction: 'west', frameInState: 0, elapsedMs: 0 });
    expect(
      clock.advance({ state: 'jog', direction: 'west', now: 10_000, reducedMotion: false }),
    ).toMatchObject({ frameInState: 1, elapsedMs: 100 });
    expect(
      clock.advance({ state: 'jog', direction: 'west', now: 10_085, reducedMotion: true }),
    ).toMatchObject({ frameInState: 0 });
  });

  it('advances walk and jog from real root travel when runtime distance is supplied', () => {
    const clock = new ProductionSliceAnimationClock();
    const sample = (now: number, distance: number) =>
      clock.advance({
        state: 'walk',
        direction: 'east',
        now,
        reducedMotion: false,
        travelDistanceTiles: distance,
      });

    expect(sample(0, 0)).toMatchObject({ frameInState: 0, distanceTiles: 0 });
    expect(sample(500, PRODUCTION_SLICE_LOCOMOTION_FRAME_DISTANCE.walk * 0.9)).toMatchObject({
      frameInState: 0,
    });
    expect(sample(1_000, PRODUCTION_SLICE_LOCOMOTION_FRAME_DISTANCE.walk * 0.2)).toMatchObject({
      frameInState: 1,
    });
    expect(sample(2_000, 0)).toMatchObject({ frameInState: 1 });
  });
});
