import { describe, expect, it } from 'vitest';

import {
  LANTERN_SQUARE_ASSET_IDS,
  closestInteraction,
  depthForFootPosition,
  lanternSquareManifest,
  rawLanternSquareManifest,
  sanitizeInteractionText,
  validateMapManifest,
} from '../src/index';

describe('Lantern Square manifest', () => {
  it('validates its assets, spawn, collisions, objects, and interaction data', () => {
    const manifest = lanternSquareManifest();
    expect(manifest.id).toBe('lantern-square');
    expect(manifest.objects.length).toBeGreaterThanOrEqual(10);
    expect(manifest.collisions.some(({ id }) => id.startsWith('water-'))).toBe(true);
    expect(manifest.interactions.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: 'phase11-willow-guide', type: 'starter_npc' },
      { id: 'welcome-notice', type: 'notice' },
    ]);
  });

  it('rejects missing assets, duplicate IDs, invalid spawn, and malformed collision data', () => {
    expect(() => validateMapManifest(rawLanternSquareManifest, new Set())).toThrow(
      /missing asset/u,
    );
    expect(() =>
      validateMapManifest(
        {
          ...rawLanternSquareManifest,
          objects: [rawLanternSquareManifest.objects[0], rawLanternSquareManifest.objects[0]],
        },
        LANTERN_SQUARE_ASSET_IDS,
      ),
    ).toThrow(/duplicate/u);
    expect(() =>
      validateMapManifest(
        { ...rawLanternSquareManifest, spawn: { x: -1, y: -1 } },
        LANTERN_SQUARE_ASSET_IDS,
      ),
    ).toThrow(/spawn/u);
    expect(() =>
      validateMapManifest(
        {
          ...rawLanternSquareManifest,
          collisions: [{ id: 'bad', shape: 'circle', x: 2, y: 2, radius: -1, blocking: true }],
        },
        LANTERN_SQUARE_ASSET_IDS,
      ),
    ).toThrow();
    expect(() =>
      validateMapManifest(
        {
          ...rawLanternSquareManifest,
          collisions: [
            { id: 'outside-map', shape: 'circle', x: 24, y: 10, radius: 1, blocking: true },
          ],
        },
        LANTERN_SQUARE_ASSET_IDS,
      ),
    ).toThrow(/outside map bounds/u);
    expect(() =>
      validateMapManifest(
        {
          ...rawLanternSquareManifest,
          collisions: [
            {
              id: 'invalid-capsule',
              shape: 'capsule',
              startX: 5,
              startY: 5,
              endX: 5,
              endY: 5,
              radius: 0.5,
              blocking: true,
            },
          ],
        },
        LANTERN_SQUARE_ASSET_IDS,
      ),
    ).toThrow(/endpoints must be distinct/u);
    expect(() =>
      validateMapManifest(
        {
          ...rawLanternSquareManifest,
          interactions: [
            {
              ...rawLanternSquareManifest.interactions[0],
              type: 'merchant',
            },
          ],
        },
        LANTERN_SQUARE_ASSET_IDS,
      ),
    ).toThrow();
  });
});

describe('depth sorting and interaction', () => {
  it('orders north/south bases and resolves equal positions deterministically', () => {
    expect(depthForFootPosition(5, 5, 'player')).toBeLessThan(depthForFootPosition(5, 6, 'tree'));
    expect(depthForFootPosition(5, 5, 'a')).not.toBe(depthForFootPosition(5, 5, 'b'));
    expect(depthForFootPosition(5, 5, 'a')).toBe(depthForFootPosition(5, 5, 'a'));
  });

  it('selects only the closest in-range interaction and sanitizes displayed text', () => {
    const interactions = [
      { id: 'far', type: 'notice' as const, x: 5, y: 5, range: 1, title: 'Far', content: 'Far' },
      { id: 'near', type: 'notice' as const, x: 1, y: 1, range: 2, title: 'Near', content: 'Near' },
    ];
    expect(closestInteraction({ x: 1.2, y: 1.2 }, interactions)?.id).toBe('near');
    expect(closestInteraction({ x: 8, y: 8 }, interactions)).toBeUndefined();
    expect(sanitizeInteractionText('<b>Hello</b>\u0000 village')).toBe('bHello/b village');
  });
});
