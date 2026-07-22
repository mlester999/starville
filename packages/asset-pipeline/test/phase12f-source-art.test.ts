import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
  PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
  PRODUCTION_SLICE_JOG_SOURCE_BY_DIRECTION,
  PRODUCTION_SLICE_WALK_SOURCE_BY_DIRECTION,
  type Phase12FDecodedAvatarFrame,
  validatePhase12FDecodedCycle,
} from '../src/phase12f-source-art';

const CHANNELS = 4;

describe('Phase 12F avatar directional source mapping', () => {
  it('keeps east-facing walk and jog art unmirrored and west-facing art mirrored correctly', () => {
    expect(PRODUCTION_SLICE_WALK_SOURCE_BY_DIRECTION.east).toEqual({ column: 2 });
    expect(PRODUCTION_SLICE_WALK_SOURCE_BY_DIRECTION.west).toEqual({ column: 6 });
    expect(PRODUCTION_SLICE_JOG_SOURCE_BY_DIRECTION.east).toEqual({ row: 2 });
    expect(PRODUCTION_SLICE_JOG_SOURCE_BY_DIRECTION.west).toEqual({ row: 2, flip: true });
  });

  it('uses the intended diagonal source art and only mirrors southwest jog/walk frames', () => {
    expect(PRODUCTION_SLICE_WALK_SOURCE_BY_DIRECTION).toMatchObject({
      northeast: { column: 3 },
      southeast: { column: 1 },
      southwest: { column: 1, flip: true },
      northwest: { column: 5 },
    });
    expect(PRODUCTION_SLICE_JOG_SOURCE_BY_DIRECTION).toMatchObject({
      northeast: { row: 3 },
      southeast: { row: 1 },
      southwest: { row: 1, flip: true },
      northwest: { row: 3, flip: true },
    });
  });
});

function pixelOffset(x: number, y: number): number {
  return (y * PRODUCTION_SLICE_AVATAR_FRAME_WIDTH + x) * CHANNELS;
}

function setOpaquePixel(data: Uint8Array, x: number, y: number, color: number): void {
  const offset = pixelOffset(x, y);
  data[offset] = color;
  data[offset + 1] = 96;
  data[offset + 2] = 48;
  data[offset + 3] = 255;
}

function idleFixture(phase: number): Phase12FDecodedAvatarFrame {
  const data = new Uint8Array(
    PRODUCTION_SLICE_AVATAR_FRAME_WIDTH * PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT * CHANNELS,
  );
  for (let y = 232; y <= 248; y += 1) {
    for (let x = 86; x <= 105; x += 1) setOpaquePixel(data, x, y, 128);
  }
  setOpaquePixel(data, 95, 80 + phase, 160 + phase);
  return {
    data,
    width: PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
    height: PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
    channels: CHANNELS,
  };
}

function translateFrame(
  frame: Phase12FDecodedAvatarFrame,
  horizontal: number,
  vertical: number,
): Phase12FDecodedAvatarFrame {
  const data = new Uint8Array(frame.data.length);
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const targetX = x + horizontal;
      const targetY = y + vertical;
      if (targetX < 0 || targetX >= frame.width || targetY < 0 || targetY >= frame.height) {
        continue;
      }
      const sourceOffset = (y * frame.width + x) * frame.channels;
      const targetOffset = (targetY * frame.width + targetX) * frame.channels;
      data.set(frame.data.subarray(sourceOffset, sourceOffset + frame.channels), targetOffset);
    }
  }
  return { ...frame, data };
}

describe('Phase 12F avatar idle integrity', () => {
  it('accepts four unique upper-body frames with an identical lower-body root', () => {
    const frames = [0, 1, 2, 3].map(idleFixture);

    expect(validatePhase12FDecodedCycle('idle', 'south', frames)).toEqual([]);
  });

  it('rejects horizontal whole-character jitter even when every frame remains unique', () => {
    const frames = [0, 1, 2, 3].map(idleFixture);
    frames[2] = translateFrame(frames[2]!, 1, 0);

    expect(validatePhase12FDecodedCycle('idle', 'south', frames)).toEqual(
      expect.arrayContaining([
        'idle:south lower-body root pixels drift across its cycle',
        'idle:south foot anchor drifts horizontally across its cycle',
      ]),
    );
  });

  it('rejects vertical whole-character jitter at the foot anchor', () => {
    const frames = [0, 1, 2, 3].map(idleFixture);
    frames[2] = translateFrame(frames[2]!, 0, -1);

    expect(validatePhase12FDecodedCycle('idle', 'south', frames)).toEqual(
      expect.arrayContaining([
        'idle:south foot anchor drifts vertically across its cycle',
        'idle:south lower-body root pixels drift across its cycle',
      ]),
    );
  });
});
