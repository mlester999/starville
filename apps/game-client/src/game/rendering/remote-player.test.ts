import { describe, expect, it } from 'vitest';

import {
  remotePlayerScreenIsVisible,
  resolveRemoteVisualMotion,
  type RemoteVisualSample,
} from './remote-player';

function worldVelocityAtScreenAngle(
  degrees: number,
  magnitude: number,
): Readonly<{ x: number; y: number }> {
  const radians = (degrees * Math.PI) / 180;
  const screenX = Math.cos(radians) * magnitude;
  const screenY = Math.sin(radians) * magnitude;
  return {
    x: (screenX + screenY) / 2,
    y: (screenY - screenX) / 2,
  };
}

describe('remote-player visual motion', () => {
  it('derives direction and movement state from interpolated displacement', () => {
    const previous: RemoteVisualSample = { x: 4, y: 4, at: 1_000 };
    const walking = resolveRemoteVisualMotion({ x: 4.1, y: 3.9, at: 1_100 }, previous, 'north');
    expect(walking).toMatchObject({ facingDirection: 'east', animationState: 'walk' });

    const jogging = resolveRemoteVisualMotion(
      { x: 4.34, y: 4, at: 1_100 },
      previous,
      walking.facingDirection,
    );
    expect(jogging).toMatchObject({ facingDirection: 'southeast', animationState: 'jog' });
  });

  it('preserves the last facing while visually idle and ignores sub-pixel jitter', () => {
    const previous: RemoteVisualSample = { x: 4, y: 4, at: 1_000 };
    expect(resolveRemoteVisualMotion(previous, undefined, 'west')).toMatchObject({
      facingDirection: 'west',
      animationState: 'idle',
    });
    expect(
      resolveRemoteVisualMotion({ x: 4.000_1, y: 3.999_9, at: 1_100 }, previous, 'northeast'),
    ).toMatchObject({ facingDirection: 'northeast', animationState: 'idle' });
  });

  it('uses canonical octant hysteresis for noisy interpolated velocity', () => {
    const previous: RemoteVisualSample = { x: 0, y: 0, at: 0 };
    const nearBoundary = worldVelocityAtScreenAngle(24, 0.2);
    const held = resolveRemoteVisualMotion(
      { x: nearBoundary.x, y: nearBoundary.y, at: 100 },
      previous,
      'east',
    );
    expect(held.facingDirection).toBe('east');

    const beyondBoundary = worldVelocityAtScreenAngle(31, 0.2);
    const switched = resolveRemoteVisualMotion(
      { x: beyondBoundary.x, y: beyondBoundary.y, at: 100 },
      previous,
      'east',
    );
    expect(switched.facingDirection).toBe('southeast');
  });

  it('classifies padded viewport visibility for update suspension', () => {
    const worldView = { x: 100, y: 200, width: 800, height: 450 };
    expect(remotePlayerScreenIsVisible({ x: 100, y: 200 }, worldView)).toBe(true);
    expect(remotePlayerScreenIsVisible({ x: -91, y: 200 }, worldView)).toBe(true);
    expect(remotePlayerScreenIsVisible({ x: -93, y: 200 }, worldView)).toBe(false);
    expect(remotePlayerScreenIsVisible({ x: 1_093, y: 200 }, worldView)).toBe(false);
  });
});
