import { describe, expect, it } from 'vitest';

import { projectWorld, tileToWorld, unprojectScreen, worldToTile } from '../src/index';

const projection = { tileWidth: 96, tileHeight: 48, originX: 1152, originY: 96 };

describe('isometric coordinates', () => {
  it('converts tile and continuous world coordinates deterministically', () => {
    expect(tileToWorld({ x: 3, y: 5 })).toEqual({ x: 3, y: 5 });
    expect(worldToTile({ x: 3.9999, y: 5.0001 })).toEqual({ x: 3, y: 5 });
  });

  it('projects and inverses representative positions', () => {
    for (const world of [
      { x: 0, y: 0 },
      { x: 12, y: 7.5 },
      { x: 23.25, y: 19.25 },
    ]) {
      const restored = unprojectScreen(projectWorld(world, projection), projection);
      expect(restored.x).toBeCloseTo(world.x, 8);
      expect(restored.y).toBeCloseTo(world.y, 8);
    }
  });
});
