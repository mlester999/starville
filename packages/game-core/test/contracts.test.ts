import { describe, expect, it } from 'vitest';

import {
  displayNameSchema,
  playerProfileCreateSchema,
  playerStateUpdateSchema,
} from '../src/index';

describe('player contracts', () => {
  it('normalizes a valid display name and appearance preset', () => {
    expect(
      playerProfileCreateSchema.parse({ displayName: '  Luna   Vale  ', appearancePreset: 'moss' }),
    ).toEqual({ displayName: 'Luna Vale', appearancePreset: 'moss' });
  });

  it.each(['ab', 'name<script>', '\u0000hidden', '   ', 'a'.repeat(21)])(
    'rejects invalid display name %j',
    (displayName) => {
      expect(() => displayNameSchema.parse(displayName)).toThrow();
    },
  );

  it('rejects unknown appearances, maps, directions, and non-finite coordinates', () => {
    expect(() =>
      playerProfileCreateSchema.parse({ displayName: 'Lantern', appearancePreset: 'paid-gold' }),
    ).toThrow();
    expect(() =>
      playerStateUpdateSchema.parse({
        mapId: 'unknown',
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
        facingDirection: 'up',
      }),
    ).toThrow();
  });
});
