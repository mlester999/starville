import { describe, expect, it } from 'vitest';
import {
  buildCollisionSpatialIndex,
  isPositionWalkable,
  MAP_IDS,
  moveWithCollisionIndex,
  PLAYER_FOOT_RADIUS,
  terrainAt,
  type MapManifest,
} from '@starville/game-core';

import { V3_OUTDOOR_LOCATION_SIZE_PROFILES } from '../src/location-size-profile';
import { WORLD_MANIFEST_BY_ID } from '../src/manifests';
import {
  PRODUCTION_SLICE_V3,
  PRODUCTION_SLICE_V3_EXTERIOR_ID,
  PRODUCTION_SLICE_V3_INTERIOR_ID,
  V3_OUTDOOR_LOCATION_MANIFEST_CATALOG,
  V3_OUTDOOR_LOCATION_MANIFESTS,
} from '../src/production-slice-v3';

type BlockingShape = MapManifest['collisions'][number];

function collisionCenter(shape: BlockingShape): Readonly<{ x: number; y: number; extent: number }> {
  if (shape.shape === 'rectangle') {
    return {
      x: shape.x + shape.width / 2,
      y: shape.y + shape.height / 2,
      extent: Math.hypot(shape.width, shape.height) / 2,
    };
  }
  if (shape.shape === 'circle') return { x: shape.x, y: shape.y, extent: shape.radius };
  return {
    x: (shape.startX + shape.endX) / 2,
    y: (shape.startY + shape.endY) / 2,
    extent: Math.hypot(shape.endX - shape.startX, shape.endY - shape.startY) / 2 + shape.radius,
  };
}

function expectBlockedFromEightDirections(collision: BlockingShape): void {
  const center = collisionCenter(collision);
  const testBounds = {
    minX: center.x - 20,
    minY: center.y - 20,
    maxX: center.x + 20,
    maxY: center.y + 20,
  };
  const directions = [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ] as const;
  const index = buildCollisionSpatialIndex([collision], 4);
  for (const [rawX, rawY] of directions) {
    const length = Math.hypot(rawX, rawY);
    const direction = { x: rawX / length, y: rawY / length };
    const startDistance = center.extent + PLAYER_FOOT_RADIUS + 0.45;
    const start = {
      x: center.x + direction.x * startDistance,
      y: center.y + direction.y * startDistance,
    };
    for (const travelDistance of [startDistance + 0.8, startDistance * 2 + 1.5]) {
      const next = moveWithCollisionIndex(
        start,
        { x: -direction.x * travelDistance, y: -direction.y * travelDistance },
        PLAYER_FOOT_RADIUS,
        testBounds,
        index,
      );
      expect(
        isPositionWalkable(next, PLAYER_FOOT_RADIUS, testBounds, [collision]),
        `${collision.id}:${String(rawX)},${String(rawY)}:${String(travelDistance)}`,
      ).toBe(true);
      const sameSideDistance =
        (next.x - center.x) * direction.x + (next.y - center.y) * direction.y;
      const lateralDistance = Math.abs(
        (next.x - center.x) * -direction.y + (next.y - center.y) * direction.x,
      );
      if (rawX === 0 || rawY === 0) {
        expect(sameSideDistance).toBeGreaterThan(-0.05);
      } else if (sameSideDistance < -0.05) {
        // Diagonal resolution may intentionally slide around a corner, but it
        // must move laterally around the footprint rather than tunnel through it.
        expect(lateralDistance).toBeGreaterThan(PLAYER_FOOT_RADIUS);
      }
    }
  }
}

describe('production slice v3', () => {
  it('is a bounded unpublished local composition', () => {
    expect(PRODUCTION_SLICE_V3.lifecycle).toBe('local_unpublished');
    expect(PRODUCTION_SLICE_V3.published).toBe(false);
    expect(PRODUCTION_SLICE_V3.activated).toBe(false);
    expect(PRODUCTION_SLICE_V3.manifest.width).toBe(48);
    expect(PRODUCTION_SLICE_V3.manifest.height).toBe(40);
    expect(PRODUCTION_SLICE_V3.manifest.width * PRODUCTION_SLICE_V3.manifest.height).toBe(1_920);
    expect(PRODUCTION_SLICE_V3.manifest.exits.every(({ enabled }) => !enabled)).toBe(true);
    expect(PRODUCTION_SLICE_V3.manifest.objects.length).toBeGreaterThanOrEqual(50);
    expect(
      PRODUCTION_SLICE_V3.manifest.objects.filter(({ id }) => id.startsWith('v3-scenic-')),
    ).toHaveLength(0);
    expect(PRODUCTION_SLICE_V3.manifest.objects.some(({ id }) => id.startsWith('outer-'))).toBe(
      false,
    );
    expect(PRODUCTION_SLICE_V3.manifest.developmentArt.label).toContain('12F-A.1R RESCUE');
  });

  it('keeps exterior and private-interior instance identities logically distinct', () => {
    expect(PRODUCTION_SLICE_V3.exterior.id).toBe(PRODUCTION_SLICE_V3_EXTERIOR_ID);
    expect(PRODUCTION_SLICE_V3.interior.id).toBe(PRODUCTION_SLICE_V3_INTERIOR_ID);
    expect(PRODUCTION_SLICE_V3.exterior.identity.instanceId).not.toBe(
      PRODUCTION_SLICE_V3.interior.identity.instanceId,
    );
    expect(PRODUCTION_SLICE_V3.exterior.identity.instanceKind).toBe('shared_outdoor');
    expect(PRODUCTION_SLICE_V3.interior.identity.instanceKind).toBe('private_interior');
    expect(PRODUCTION_SLICE_V3.interior.identity.canonicalMapId).toBe('lantern-square');
  });

  it('provides a local-only centered V3 manifest composition for all five outdoor maps', () => {
    expect(V3_OUTDOOR_LOCATION_MANIFESTS.map(({ id }) => id)).toEqual(MAP_IDS);

    for (const mapId of MAP_IDS) {
      const canonical = WORLD_MANIFEST_BY_ID.get(mapId);
      const profile = V3_OUTDOOR_LOCATION_SIZE_PROFILES[mapId];
      const candidate = V3_OUTDOOR_LOCATION_MANIFEST_CATALOG[mapId];
      if (canonical === undefined) throw new Error(`Missing canonical map '${mapId}'`);

      expect(candidate.identity.canonicalMapId).toBe(mapId);
      expect(candidate.identity.persistence).toBe('local_unpublished');
      expect(candidate.manifest).not.toBe(canonical);
      expect(candidate.manifest.width).toBe(canonical.width * 3);
      expect(candidate.manifest.height).toBe(canonical.height * 3);
      expect(candidate.manifest.exits.every(({ enabled }) => !enabled)).toBe(true);
      expect(candidate.zones.map(({ purpose }) => purpose)).toEqual(
        expect.arrayContaining(['canonical_landmarks', 'approach', 'scenic_expansion']),
      );

      for (const landmark of canonical.objects) {
        const remapped = candidate.manifest.objects.find(({ id }) => id === landmark.id);
        expect(remapped).toMatchObject({
          assetId: landmark.assetId,
          x: landmark.x + profile.centeredContentOffset.x,
          y: landmark.y + profile.centeredContentOffset.y,
        });
      }
      for (const spawn of canonical.spawns) {
        const remapped = candidate.manifest.spawns.find(({ id }) => id === spawn.id);
        expect(remapped).toMatchObject({
          x: spawn.x + profile.centeredContentOffset.x,
          y: spawn.y + profile.centeredContentOffset.y,
        });
      }

      const approachPaths = candidate.manifest.terrain.filter(({ id }) =>
        id.startsWith('v3-approach-'),
      );
      const scenicTerrain = candidate.manifest.terrain.filter(({ id }) =>
        id.startsWith('v3-scenic-'),
      );
      const scenicObjects = candidate.manifest.objects.filter(({ id }) =>
        id.startsWith('v3-scenic-'),
      );
      expect(approachPaths).toHaveLength(canonical.exits.filter(({ enabled }) => enabled).length);
      expect(scenicTerrain).toHaveLength(4);
      expect(scenicObjects).toHaveLength(12);
      expect(candidate.manifest.objects.length).toBeGreaterThan(canonical.objects.length);
      const collisionIds = new Set(candidate.manifest.collisions.map(({ id }) => id));
      for (const object of scenicObjects.filter(({ kind }) =>
        ['tree', 'rock', 'fence', 'lamp'].includes(kind),
      )) {
        expect(collisionIds.has(`${object.id}-base`)).toBe(true);
      }
      expect(
        scenicTerrain.every(
          (area) =>
            area.x + area.width <= profile.contentBounds.minX ||
            area.x >= profile.contentBounds.maxX ||
            area.y + area.height <= profile.contentBounds.minY ||
            area.y >= profile.contentBounds.maxY,
        ),
      ).toBe(true);
      expect(
        scenicObjects.every(
          (object) =>
            object.x < profile.contentBounds.minX ||
            object.x > profile.contentBounds.maxX ||
            object.y < profile.contentBounds.minY ||
            object.y > profile.contentBounds.maxY,
        ),
      ).toBe(true);

      for (const approach of approachPaths) {
        const direction = approach.id.replace('v3-approach-', '');
        const point =
          direction === 'north'
            ? { x: approach.x + approach.width / 2, y: profile.safeMargin + 0.5 }
            : direction === 'south'
              ? {
                  x: approach.x + approach.width / 2,
                  y: profile.logical.height - profile.safeMargin - 0.5,
                }
              : direction === 'east'
                ? {
                    x: profile.logical.width - profile.safeMargin - 0.5,
                    y: approach.y + approach.height / 2,
                  }
                : { x: profile.safeMargin + 0.5, y: approach.y + approach.height / 2 };
        expect(
          isPositionWalkable(
            point,
            PLAYER_FOOT_RADIUS,
            candidate.manifest.safeSaveBounds,
            candidate.manifest.collisions,
          ),
        ).toBe(true);
      }
    }
  });

  it('includes a separate furnished, collision-safe local interior', () => {
    const interior = PRODUCTION_SLICE_V3.interior.manifest;
    expect(interior).not.toBe(PRODUCTION_SLICE_V3.manifest);
    expect(interior.version).toBe(1215);
    expect(interior.name).toBe('Amber Cottage Interior');
    expect(interior.width).toBe(16);
    expect(interior.height).toBe(12);
    expect(interior.objects.map(({ assetId }) => assetId)).toEqual(
      expect.arrayContaining([
        'v3.interior.bed',
        'v3.interior.dining-table',
        'v3.interior.wardrobe',
        'v3.interior.fireplace',
      ]),
    );
    expect(interior.collisions.length).toBeGreaterThanOrEqual(12);
    expect(interior.interactions.some(({ id }) => id === 'interior-exit')).toBe(true);
    expect(interior.objects.some(({ id }) => id === 'reading-chair')).toBe(true);
    expect(interior.objects.some(({ id }) => id === 'entry-rug')).toBe(true);
  });

  it('frames the interior as two connected cutaway walls with correct billboard orientation', () => {
    const interior = PRODUCTION_SLICE_V3.interior.manifest;
    const walls = interior.objects.filter(({ assetId }) => assetId === 'v3.interior.wall');
    const north = walls.filter(({ id }) => id.startsWith('wall-north-'));
    const west = walls.filter(({ id }) => id.startsWith('wall-west-'));

    // Every wall panel belongs to exactly one of the two shown runs: there are no
    // floating, decorative, or orphaned wall panels in open floor space.
    expect(north.length + west.length).toBe(walls.length);
    expect(north.length).toBeGreaterThanOrEqual(4);
    expect(west.length).toBeGreaterThanOrEqual(3);

    // North panels hug the north edge; west panels hug the west edge. Both runs
    // meet at the shared top corner, so the perimeter is continuous, not a maze.
    expect(north.every(({ y }) => y < 1.5)).toBe(true);
    expect(west.every(({ x }) => x < 1.5)).toBe(true);

    // The wall raster is authored on the west ("/") axis. North panels are the
    // perpendicular axis and must be mirrored via rotation 90; west panels stay
    // native. This is the corrected orientation for a readable back-corner cutaway.
    expect(north.every(({ rotation }) => rotation === 90)).toBe(true);
    expect(west.every(({ rotation }) => rotation === undefined || rotation === 0)).toBe(true);

    // No east or south wall art: those front walls are cut away for legibility,
    // so the player is never boxed in on all four sides.
    expect(walls.some(({ id }) => id.startsWith('wall-east-'))).toBe(false);
    expect(walls.some(({ id }) => id.startsWith('wall-south-'))).toBe(false);
  });

  it('places windows and the door on believable exterior walls', () => {
    const interior = PRODUCTION_SLICE_V3.interior.manifest;
    const windows = interior.objects.filter(({ assetId }) => assetId === 'v3.interior.window');
    expect(windows.length).toBeGreaterThanOrEqual(2);
    // Windows sit only on the shown north exterior wall.
    expect(windows.every(({ y }) => y < 1.5)).toBe(true);

    // The door sits on the front (south) wall, centred in the doorway gap of the
    // south collision run, aligned with the indoor spawn directly north of it.
    const door = interior.objects.find(({ id }) => id === 'interior-door');
    const spawn = interior.spawns.find(({ id }) => id === interior.defaultSpawnId);
    expect(door).toBeDefined();
    expect(spawn).toBeDefined();
    expect(door?.y).toBeGreaterThan(interior.height - 1.5);
    expect(spawn?.y).toBeLessThan(door?.y ?? 0);
    expect(Math.abs((spawn?.x ?? 0) - (door?.x ?? 0))).toBeLessThan(0.5);
    const southWest = interior.collisions.find(({ id }) => id === 'wall-south-west');
    const southEast = interior.collisions.find(({ id }) => id === 'wall-south-east');
    const gapMinX =
      (southWest as { x: number; width: number }).x + (southWest as { width: number }).width;
    const gapMaxX = (southEast as { x: number }).x;
    expect(door?.x).toBeGreaterThan(gapMinX);
    expect(door?.x).toBeLessThan(gapMaxX);
  });

  it('keeps interior furniture footprints from overlapping each other', () => {
    const interior = PRODUCTION_SLICE_V3.interior.manifest;
    const aabb = (shape: BlockingShape): Readonly<[number, number, number, number]> => {
      if (shape.shape === 'rectangle') {
        return [shape.x, shape.y, shape.x + shape.width, shape.y + shape.height];
      }
      if (shape.shape === 'circle') {
        return [
          shape.x - shape.radius,
          shape.y - shape.radius,
          shape.x + shape.radius,
          shape.y + shape.radius,
        ];
      }
      throw new Error(`Unexpected footprint shape ${shape.shape}`);
    };
    const furniture = interior.collisions.filter(({ id }) => id.endsWith('-footprint'));
    for (let left = 0; left < furniture.length; left += 1) {
      for (let right = left + 1; right < furniture.length; right += 1) {
        const [aMinX, aMinY, aMaxX, aMaxY] = aabb(furniture[left]!);
        const [bMinX, bMinY, bMaxX, bMaxY] = aabb(furniture[right]!);
        const overlaps = aMinX < bMaxX && aMaxX > bMinX && aMinY < bMaxY && aMaxY > bMinY;
        expect(overlaps, `${furniture[left]!.id} vs ${furniture[right]!.id}`).toBe(false);
      }
    }
    // Nothing blocks the door → dining circulation spine (x ≈ 8).
    for (const y of [10.7, 9.5, 8.2]) {
      expect(
        isPositionWalkable(
          { x: 8, y },
          PLAYER_FOOT_RADIUS,
          interior.safeSaveBounds,
          interior.collisions,
        ),
        `entry-spine:${String(y)}`,
      ).toBe(true);
    }
  });

  it('keeps every exterior land object off authored water', () => {
    const manifest = PRODUCTION_SLICE_V3.manifest;
    for (const object of manifest.objects) {
      expect(terrainAt(manifest, object.x, object.y), object.id).not.toBe('water');
      if (object.kind !== 'tree') continue;
      for (const [offsetX, offsetY] of [
        [0.75, 0],
        [-0.75, 0],
        [0, 0.75],
        [0, -0.75],
      ] as const) {
        expect(
          terrainAt(manifest, object.x + offsetX, object.y + offsetY),
          `${object.id}:${String(offsetX)},${String(offsetY)}`,
        ).not.toBe('water');
      }
    }
  });

  it('contains the required vertical-slice composition vocabulary', () => {
    const keys = new Set(PRODUCTION_SLICE_V3.manifest.objects.map(({ assetId }) => assetId));
    for (const key of [
      'cottage-amber',
      'notice-board',
      'lamp-star',
      'fence-willow',
      'tree-pine',
      'tree-maple',
      'bush-round',
      'flowers-moon',
      'rock-moss',
      'phase7-dev-willow-chair',
      'phase7-crafting-workbench-marker',
    ]) {
      expect(keys.has(key)).toBe(true);
    }
    expect(PRODUCTION_SLICE_V3.manifest.terrain.some(({ terrain }) => terrain === 'water')).toBe(
      true,
    );
  });

  it('faces the cottage door into a connected public forecourt and square', () => {
    const manifest = PRODUCTION_SLICE_V3.manifest;
    const cottage = manifest.objects.find(({ id }) => id === 'slice-cottage');
    const entrance = manifest.interactions.find(({ id }) => id === 'slice-cottage-entrance');
    const frontWalk = manifest.terrain.filter(({ id }) => id.startsWith('front-walk-'));
    expect(cottage).toBeDefined();
    expect(entrance).toBeDefined();
    expect(frontWalk).toHaveLength(4);
    expect(entrance?.x).toBeGreaterThan(cottage?.x ?? Number.POSITIVE_INFINITY);
    expect(terrainAt(manifest, entrance?.x ?? 0, entrance?.y ?? 0)).toBe('path');
    expect(
      frontWalk.every(
        (area, index) =>
          index === 0 ||
          (area.x >= (frontWalk[index - 1]?.x ?? 0) && area.y >= (frontWalk[index - 1]?.y ?? 0)),
      ),
    ).toBe(true);
    expect(
      manifest.terrain.some(
        ({ id, terrain, x, y, width, height }) =>
          id === 'lantern-square' &&
          terrain === 'plaza' &&
          x <= 28 &&
          y <= 20 &&
          x + width > 28 &&
          y + height > 20,
      ),
    ).toBe(true);
  });

  it('uses deliberate edge clusters and a slowly meandering variable-width stream', () => {
    const manifest = PRODUCTION_SLICE_V3.manifest;
    const edgeTrees = manifest.objects.filter(
      ({ id, kind }) =>
        kind === 'tree' &&
        ['maple-north', 'pine-northeast', 'pine-east', 'maple-southwest'].includes(id),
    );
    expect(edgeTrees).toHaveLength(4);
    for (const tree of edgeTrees) {
      expect(manifest.collisions.some(({ id }) => id === `${tree.id}-trunk`)).toBe(true);
    }

    const river = manifest.terrain
      .filter(({ id }) => id.startsWith('river-column-'))
      .sort((left, right) => left.x - right.x);
    expect(river).toHaveLength(48);
    expect(new Set(river.map(({ height }) => height)).size).toBeGreaterThanOrEqual(3);
    expect(
      river
        .slice(1)
        .every((column, index) => Math.abs(column.y - (river[index]?.y ?? column.y)) <= 2),
    ).toBe(true);
  });

  it('blocks every required solid category while preserving both bridge corridors', () => {
    const manifest = PRODUCTION_SLICE_V3.manifest;
    const ids = new Set(manifest.collisions.map(({ id }) => id));
    for (const id of [
      'cottage-wall',
      'pine-west-trunk',
      'bench-base',
      'workbench-base',
      'collision-fence-west',
      'notice-base',
      'rock-west-base',
      'planter-base',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    for (const bridgeId of ['west-footbridge', 'main-bridge']) {
      const bridge = manifest.terrain.find(({ id }) => id === bridgeId);
      expect(bridge).toBeDefined();
      expect(
        isPositionWalkable(
          {
            x: (bridge?.x ?? 0) + (bridge?.width ?? 0) / 2,
            y: (bridge?.y ?? 0) + (bridge?.height ?? 0) / 2,
          },
          PLAYER_FOOT_RADIUS,
          manifest.safeSaveBounds,
          manifest.collisions,
        ),
      ).toBe(true);
    }
    expect(
      isPositionWalkable(
        { x: 5, y: 31 },
        PLAYER_FOOT_RADIUS,
        manifest.safeSaveBounds,
        manifest.collisions,
      ),
    ).toBe(false);
  });

  it('rejects cottage penetration from all eight approach directions', () => {
    const manifest = PRODUCTION_SLICE_V3.manifest;
    const cottageCollision = manifest.collisions.filter(({ id }) => id === 'cottage-wall');
    expect(cottageCollision).toHaveLength(1);
    const target = { x: 20, y: 10.78 };
    const directions = [
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
    ] as const;
    for (const [dx, dy] of directions) {
      const start = { x: target.x + dx * 4, y: target.y + dy * 4 };
      const next = moveWithCollisionIndex(
        start,
        { x: -dx * 5, y: -dy * 5 },
        PLAYER_FOOT_RADIUS,
        manifest.safeSaveBounds,
        buildCollisionSpatialIndex(cottageCollision, 4),
      );
      expect(
        isPositionWalkable(next, PLAYER_FOOT_RADIUS, manifest.safeSaveBounds, cottageCollision),
      ).toBe(true);
    }
  });

  it('blocks every exterior solid category from eight walk and jog approaches', () => {
    const manifest = PRODUCTION_SLICE_V3.manifest;
    for (const collisionId of [
      'cottage-wall',
      'pine-west-trunk',
      'bench-base',
      'workbench-base',
      'collision-fence-west',
      'notice-base',
      'lamp-base',
      'rock-west-base',
      'planter-base',
      manifest.collisions.find(({ id }) => id.startsWith('river-solid-'))?.id ??
        'missing-river-collision',
    ]) {
      const collision = manifest.collisions.find(({ id }) => id === collisionId);
      expect(collision, collisionId).toBeDefined();
      expectBlockedFromEightDirections(collision!);
    }
  });

  it('blocks all required interior furniture footprints from eight directions', () => {
    const manifest = PRODUCTION_SLICE_V3.interior.manifest;
    for (const collisionId of [
      'bed-footprint',
      'bedside-footprint',
      'table-footprint',
      'chair-west-footprint',
      'chair-east-footprint',
      'reading-chair-footprint',
      'chest-footprint',
      'wardrobe-footprint',
      'fireplace-footprint',
      'cooking-footprint',
      'lamp-footprint',
      'plant-footprint',
    ]) {
      const collision = manifest.collisions.find(({ id }) => id === collisionId);
      expect(collision, collisionId).toBeDefined();
      expectBlockedFromEightDirections(collision!);
    }
    for (const y of [10.7, 9.5, 8]) {
      expect(
        isPositionWalkable(
          { x: 8, y },
          PLAYER_FOOT_RADIUS,
          manifest.safeSaveBounds,
          manifest.collisions,
        ),
        `entry-corridor:${String(y)}`,
      ).toBe(true);
    }
  });

  it('places the cottage entrance inside the initial review radius', () => {
    const entrance = PRODUCTION_SLICE_V3.manifest.interactions.find(
      ({ id }) => id === 'slice-cottage-entrance',
    );
    const spawn = PRODUCTION_SLICE_V3.manifest.spawn;
    expect(entrance).toBeDefined();
    expect(
      Math.hypot((entrance?.x ?? 0) - spawn.x, (entrance?.y ?? 0) - spawn.y),
    ).toBeLessThanOrEqual(entrance?.range ?? 0);
  });
});
