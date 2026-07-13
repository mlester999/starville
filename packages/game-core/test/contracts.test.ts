import { describe, expect, it } from 'vitest';

import {
  displayNameSchema,
  playerProfileCreateSchema,
  playerProfileSchema,
  playerStateUpdateSchema,
} from '../src/index';

describe('player contracts', () => {
  it('normalizes a valid display name and appearance preset', () => {
    expect(
      playerProfileCreateSchema.parse({ displayName: '  Luna   Vale  ', appearancePreset: 'moss' }),
    ).toEqual({ displayName: 'Luna Vale', appearancePreset: 'moss' });
  });

  it.each(['ab', 'name<script>', '\u0000hidden', '   ', 'a'.repeat(21), 'ADMIN', 'Starville'])(
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

  it('accepts Phase 6 multi-map fields returned by private.player_profile_json', () => {
    const parsed = playerProfileSchema.parse({
      id: '19e72014-a546-4f45-8232-6a286f889453',
      displayName: 'Luna Vale',
      appearancePreset: 'river',
      mapId: 'lantern-square',
      mapVersionId: '29e72014-a546-4f45-8232-6a286f889453',
      x: 12,
      y: 7.5,
      facingDirection: 'south',
      gameStateVersion: 2,
      stateVersion: 2,
      lastTransitionAt: null,
      createdAt: '2026-07-11T10:00:00.000Z',
      updatedAt: '2026-07-12T10:00:00.000Z',
      lastEnteredAt: '2026-07-12T10:00:00.000Z',
    });

    expect(parsed).toMatchObject({
      mapVersionId: '29e72014-a546-4f45-8232-6a286f889453',
      stateVersion: 2,
      lastTransitionAt: null,
    });
  });

  it('rejects pre-Phase-6 profiles missing multi-map fields and mismatched versions', () => {
    expect(
      playerProfileSchema.safeParse({
        id: '19e72014-a546-4f45-8232-6a286f889453',
        displayName: 'Luna Vale',
        appearancePreset: 'river',
        mapId: 'lantern-square',
        x: 12,
        y: 7.5,
        facingDirection: 'south',
        gameStateVersion: 2,
        createdAt: '2026-07-11T10:00:00.000Z',
        updatedAt: '2026-07-12T10:00:00.000Z',
        lastEnteredAt: '2026-07-12T10:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      playerProfileSchema.safeParse({
        id: '19e72014-a546-4f45-8232-6a286f889453',
        displayName: 'Luna Vale',
        appearancePreset: 'river',
        mapId: 'lantern-square',
        mapVersionId: null,
        x: 12,
        y: 7.5,
        facingDirection: 'south',
        gameStateVersion: 2,
        stateVersion: 3,
        lastTransitionAt: null,
        createdAt: '2026-07-11T10:00:00.000Z',
        updatedAt: '2026-07-12T10:00:00.000Z',
        lastEnteredAt: '2026-07-12T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('still rejects unexpected wallet identity fields on the public player profile', () => {
    expect(
      playerProfileSchema.safeParse({
        id: '19e72014-a546-4f45-8232-6a286f889453',
        displayName: 'Luna Vale',
        appearancePreset: 'river',
        mapId: 'lantern-square',
        mapVersionId: null,
        x: 12,
        y: 7.5,
        facingDirection: 'south',
        gameStateVersion: 1,
        stateVersion: 1,
        lastTransitionAt: null,
        createdAt: '2026-07-11T10:00:00.000Z',
        updatedAt: '2026-07-12T10:00:00.000Z',
        lastEnteredAt: '2026-07-12T10:00:00.000Z',
        walletAddress: 'attacker',
      }).success,
    ).toBe(false);
  });
});
