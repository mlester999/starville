import { describe, expect, it } from 'vitest';

import { isPositionWalkable, PLAYER_FOOT_RADIUS } from '@starville/game-core';

import { getPhase7LocalDraft } from '../src/phase7-local-content';
import {
  getPhase12ELanternSquareCandidate,
  PHASE_12E_INTERACTION_ASSET_KEYS,
  PHASE_12E_LANTERN_SQUARE_ROUTE_FIXTURES,
} from '../src/phase12e-lantern-square';

function samplesBetween(
  start: Readonly<{ x: number; y: number }>,
  end: Readonly<{ x: number; y: number }>,
): readonly Readonly<{ x: number; y: number }>[] {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const steps = Math.max(1, Math.ceil(distance / 0.08));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const amount = index / steps;
    return {
      x: start.x + (end.x - start.x) * amount,
      y: start.y + (end.y - start.y) * amount,
    };
  });
}

describe('Phase 12E Lantern Square local candidate', () => {
  it('creates one immutable unpublished revision without replacing Phase 12C identities', () => {
    const source = getPhase7LocalDraft('lantern-square');
    const candidate = getPhase12ELanternSquareCandidate();

    expect(candidate.lifecycle).toBe('local_draft');
    expect(candidate.manifest.version).toBe(source.manifest.version + 1);
    expect(candidate.sourceManifestVersion).toBe(source.manifest.version);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.manifest)).toBe(true);
    expect(candidate.manifest.objects).toEqual(source.manifest.objects);
    expect(candidate.manifest.collisions).toEqual(source.manifest.collisions);
    expect(candidate.manifest.spawns).toEqual(source.manifest.spawns);
    expect(candidate.manifest.exits).toEqual(source.manifest.exits);
  });

  it('adds stable semantic marker dependencies and a nonblocking social-photo anchor', () => {
    const candidate = getPhase12ELanternSquareCandidate();
    const photoArea = candidate.manifest.interactions.find(
      ({ id }) => id === 'phase12e-social-photo-area',
    );

    expect(candidate.visualAssetKeys).toEqual(
      expect.arrayContaining([...PHASE_12E_INTERACTION_ASSET_KEYS]),
    );
    expect(new Set(candidate.visualAssetKeys).size).toBe(candidate.visualAssetKeys.length);
    expect(photoArea).toMatchObject({ type: 'notice', x: 15.9, y: 11, range: 1.45 });
    expect(
      isPositionWalkable(
        photoArea!,
        PLAYER_FOOT_RADIUS,
        candidate.manifest.safeSaveBounds,
        candidate.manifest.collisions,
      ),
    ).toBe(true);
  });

  it('keeps every review route continuously walkable under authoritative collision', () => {
    const { manifest } = getPhase12ELanternSquareCandidate();

    for (const route of PHASE_12E_LANTERN_SQUARE_ROUTE_FIXTURES) {
      const samples = route.points.flatMap((point, index) => {
        const next = route.points[index + 1];
        return next === undefined ? [point] : samplesBetween(point, next);
      });
      const blocked = samples.find(
        (point) =>
          !isPositionWalkable(
            point,
            PLAYER_FOOT_RADIUS,
            manifest.safeSaveBounds,
            manifest.collisions,
          ),
      );
      expect(blocked, `${route.id}: ${route.label}`).toBeUndefined();
    }
  });

  it('keeps existing stable interaction identities and adds only the Phase 12E anchor', () => {
    const source = getPhase7LocalDraft('lantern-square').manifest;
    const candidate = getPhase12ELanternSquareCandidate().manifest;
    const sourceIds = source.interactions.map(({ id }) => id);

    expect(candidate.interactions.slice(0, source.interactions.length).map(({ id }) => id)).toEqual(
      sourceIds,
    );
    expect(candidate.interactions.at(-1)?.id).toBe('phase12e-social-photo-area');
  });
});
