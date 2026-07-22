import { describe, expect, it } from 'vitest';

import {
  FACING_DIRECTIONS,
  buildCollisionSpatialIndex,
  facingDirectionForWorldVelocity,
  isPositionWalkable,
  moveWithCollisions,
  moveWithCollisionIndex,
  movementDelta,
  movementIntent,
  movementSpeed,
  JOG_SPEED_MULTIPLIER,
  PLAYER_FOOT_RADIUS,
  WALK_SPEED_TILES_PER_SECOND,
  nextFacingDirection,
  nextFacingDirectionFromVelocity,
  projectWorld,
  type CollisionShape,
  type Point,
} from '../src/index';

const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
const obstacles: CollisionShape[] = [
  { id: 'building', shape: 'rectangle', x: 4, y: 3, width: 2, height: 3, blocking: true },
  { id: 'tree', shape: 'circle', x: 7, y: 7, radius: 0.7, blocking: true },
  { id: 'decoration', shape: 'circle', x: 2, y: 2, radius: 0.7, blocking: false },
];

describe('movement', () => {
  it('normalizes diagonal movement to cardinal speed', () => {
    const east = movementDelta({ up: false, down: false, left: false, right: true }, 4, 0.1);
    const northeast = movementDelta({ up: true, down: false, left: false, right: true }, 4, 0.1);
    expect(Math.hypot(east.x, east.y)).toBeCloseTo(0.4);
    expect(Math.hypot(northeast.x, northeast.y)).toBeCloseTo(0.4);
  });

  it('maps all eight inputs and preserves the last idle direction', () => {
    const inputs = [
      { up: true, down: false, left: false, right: false },
      { up: true, down: false, left: false, right: true },
      { up: false, down: false, left: false, right: true },
      { up: false, down: true, left: false, right: true },
      { up: false, down: true, left: false, right: false },
      { up: false, down: true, left: true, right: false },
      { up: false, down: false, left: true, right: false },
      { up: true, down: false, left: true, right: false },
    ];
    expect(inputs.map((input) => movementIntent(input).direction)).toEqual(FACING_DIRECTIONS);
    expect(
      nextFacingDirection({ up: false, down: false, left: false, right: false }, 'southwest'),
    ).toBe('southwest');
  });

  it('resolves facing from actual projected world velocity', () => {
    const inputs = [
      { up: true, down: false, left: false, right: false },
      { up: true, down: false, left: false, right: true },
      { up: false, down: false, left: false, right: true },
      { up: false, down: true, left: false, right: true },
      { up: false, down: true, left: false, right: false },
      { up: false, down: true, left: true, right: false },
      { up: false, down: false, left: true, right: false },
      { up: true, down: false, left: true, right: false },
    ];
    expect(
      inputs.map((input) => facingDirectionForWorldVelocity(movementIntent(input).unit)),
    ).toEqual(FACING_DIRECTIONS);
    expect(facingDirectionForWorldVelocity({ x: -0.5, y: 0.5 })).toBe('west');
    expect(facingDirectionForWorldVelocity({ x: 0.5, y: -0.5 })).toBe('east');
  });

  it('holds the prior octant across noisy boundary and collision-slide vectors', () => {
    const worldVelocityAtScreenAngle = (degrees: number): Point => {
      const radians = (degrees * Math.PI) / 180;
      const screenX = Math.cos(radians);
      const screenY = Math.sin(radians);
      return {
        x: (screenX + screenY) / 2,
        y: (screenY - screenX) / 2,
      };
    };

    let facing: Parameters<typeof nextFacingDirectionFromVelocity>[1] = 'east';
    for (const noisyAngle of [21, 23, 20, 24, 22.6, 18]) {
      facing = nextFacingDirectionFromVelocity(worldVelocityAtScreenAngle(noisyAngle), facing);
      expect(facing).toBe('east');
    }

    expect(nextFacingDirectionFromVelocity(worldVelocityAtScreenAngle(31), facing)).toBe(
      'southeast',
    );
    expect(nextFacingDirectionFromVelocity({ x: 1e-10, y: -1e-10 }, 'northwest')).toBe('northwest');
  });

  it('is frame-rate independent over equivalent bounded frame time', () => {
    const input = { up: false, down: true, left: false, right: true };
    const oneFrame = movementDelta(input, 3.2, 1 / 30);
    const twoFrames = movementDelta(input, 3.2, 1 / 60);
    expect(oneFrame.x).toBeCloseTo(twoFrames.x * 2, 8);
    expect(oneFrame.y).toBeCloseTo(twoFrames.y * 2, 8);
  });

  it('uses a calm walk and a bounded normalized jog', () => {
    expect(WALK_SPEED_TILES_PER_SECOND).toBe(2.5);
    expect(JOG_SPEED_MULTIPLIER).toBe(1.35);
    expect(movementSpeed(false)).toBe(2.5);
    expect(movementSpeed(true)).toBeCloseTo(3.375);

    const walk = movementDelta(
      { up: true, down: false, left: false, right: true },
      movementSpeed(false),
      0.1,
    );
    const jog = movementDelta(
      { up: true, down: false, left: false, right: true },
      movementSpeed(true),
      0.1,
    );
    expect(Math.hypot(walk.x, walk.y)).toBeCloseTo(0.25);
    expect(Math.hypot(jog.x, jog.y)).toBeCloseTo(0.3375);
  });
});

describe('collision', () => {
  it('uses deterministic nearby buckets without changing collision response', () => {
    const index = buildCollisionSpatialIndex(obstacles, 2);
    expect(index.totalShapes).toBe(obstacles.length);
    expect(index.query({ minX: 3, minY: 2, maxX: 7, maxY: 7 }).map(({ id }) => id)).toEqual(
      expect.arrayContaining(['building', 'tree']),
    );
    const start = { x: 3, y: 4 };
    const jogDelta = { x: 2.5, y: 0.2 };
    expect(moveWithCollisionIndex(start, jogDelta, PLAYER_FOOT_RADIUS, bounds, index)).toEqual(
      moveWithCollisions(start, jogDelta, PLAYER_FOOT_RADIUS, bounds, obstacles),
    );
  });
  it('blocks boundaries, buildings, and trees but not nonblocking decoration', () => {
    expect(isPositionWalkable({ x: 0.1, y: 5 }, 0.3, bounds, obstacles)).toBe(false);
    expect(isPositionWalkable({ x: 4.5, y: 4 }, 0.3, bounds, obstacles)).toBe(false);
    expect(isPositionWalkable({ x: 7, y: 7 }, 0.3, bounds, obstacles)).toBe(false);
    expect(isPositionWalkable({ x: 2, y: 2 }, 0.3, bounds, obstacles)).toBe(true);
  });

  it('uses the validated Lantern Square bases for every required obstacle class', async () => {
    const { lanternSquareManifest } = await import('../src/index');
    const manifest = lanternSquareManifest();

    expect(
      isPositionWalkable(
        { x: 5, y: 4.25 },
        PLAYER_FOOT_RADIUS,
        manifest.safeSaveBounds,
        manifest.collisions,
      ),
    ).toBe(false);
    expect(
      isPositionWalkable(
        { x: 2.4, y: 8.6 },
        PLAYER_FOOT_RADIUS,
        manifest.safeSaveBounds,
        manifest.collisions,
      ),
    ).toBe(false);
    expect(
      isPositionWalkable(
        { x: 4, y: 14 },
        PLAYER_FOOT_RADIUS,
        manifest.safeSaveBounds,
        manifest.collisions,
      ),
    ).toBe(false);
    expect(
      isPositionWalkable(
        { x: 3.8, y: 11.5 },
        PLAYER_FOOT_RADIUS,
        manifest.safeSaveBounds,
        manifest.collisions,
      ),
    ).toBe(false);
    expect(
      isPositionWalkable(
        { x: 12, y: 14 },
        PLAYER_FOOT_RADIUS,
        manifest.safeSaveBounds,
        manifest.collisions,
      ),
    ).toBe(true);
    for (const point of [
      { x: 1.5, y: 11.5 },
      { x: 6.1, y: 11.5 },
      { x: 18, y: 11.6 },
      { x: 22.2, y: 11.6 },
      { x: 8.8, y: 5.2 },
      { x: 16.2, y: 9.7 },
    ]) {
      expect(isPositionWalkable(point, 0.24, manifest.safeSaveBounds, manifest.collisions)).toBe(
        false,
      );
    }
    expect(
      isPositionWalkable({ x: 7.2, y: 5.4 }, 0.24, manifest.safeSaveBounds, manifest.collisions),
    ).toBe(true);
    expect(
      isPositionWalkable(
        { x: 0.8, y: 5 },
        PLAYER_FOOT_RADIUS,
        manifest.safeSaveBounds,
        manifest.collisions,
      ),
    ).toBe(false);
  });

  it('centers each cottage footprint on its visible foot anchor with balanced clearance', async () => {
    const { lanternSquareManifest } = await import('../src/index');
    const manifest = lanternSquareManifest();
    const projection = {
      tileWidth: manifest.tileWidth,
      tileHeight: manifest.tileHeight,
      originX: manifest.projectionOrigin.x,
      originY: manifest.projectionOrigin.y,
    };

    for (const [objectId, collisionId] of [
      ['cottage-amber', 'cottage-amber-base'],
      ['cottage-sage', 'cottage-sage-base'],
    ] as const) {
      const object = manifest.objects.find(({ id }) => id === objectId);
      const collision = manifest.collisions.find(({ id }) => id === collisionId);
      expect(object).toBeDefined();
      expect(collision?.shape).toBe('capsule');
      if (object === undefined || collision?.shape !== 'capsule')
        throw new Error('missing cottage');

      const center = {
        x: (collision.startX + collision.endX) / 2,
        y: (collision.startY + collision.endY) / 2,
      };
      expect(center).toEqual({ x: object.x, y: object.y });
      expect(projectWorld(center, projection)).toEqual(projectWorld(object, projection));
      expect(projectWorld({ x: collision.startX, y: collision.startY }, projection).y).toBeCloseTo(
        projectWorld({ x: collision.endX, y: collision.endY }, projection).y,
      );
      expect(collision.radius).toBe(0.35);

      const diagonal = Math.SQRT1_2;
      const blockedOffsets = [
        { x: -diagonal * 1.2, y: diagonal * 1.2 },
        { x: diagonal * 1.2, y: -diagonal * 1.2 },
        { x: diagonal * 0.5, y: diagonal * 0.5 },
        { x: -diagonal * 0.5, y: -diagonal * 0.5 },
      ];
      const walkableOffsets = [
        { x: -diagonal * 1.65, y: diagonal * 1.65 },
        { x: diagonal * 1.65, y: -diagonal * 1.65 },
        { x: diagonal * 0.7, y: diagonal * 0.7 },
        { x: -diagonal * 0.7, y: -diagonal * 0.7 },
      ];

      for (const offset of blockedOffsets) {
        expect(
          isPositionWalkable(
            { x: center.x + offset.x, y: center.y + offset.y },
            PLAYER_FOOT_RADIUS,
            manifest.safeSaveBounds,
            manifest.collisions,
          ),
        ).toBe(false);
      }
      for (const offset of walkableOffsets) {
        expect(
          isPositionWalkable(
            { x: center.x + offset.x, y: center.y + offset.y },
            PLAYER_FOOT_RADIUS,
            manifest.safeSaveBounds,
            manifest.collisions,
          ),
        ).toBe(true);
      }
    }
  });

  it('keeps continuous walk and jog approaches on their original cottage side', async () => {
    const { lanternSquareManifest } = await import('../src/index');
    const manifest = lanternSquareManifest();
    const collisionIndex = buildCollisionSpatialIndex(manifest.collisions);
    const diagonal = Math.SQRT1_2;
    const inputs = {
      right: { up: false, down: false, left: false, right: true },
      left: { up: false, down: false, left: true, right: false },
      up: { up: true, down: false, left: false, right: false },
      down: { up: false, down: true, left: false, right: false },
      northeast: { up: true, down: false, left: false, right: true },
      southeast: { up: false, down: true, left: false, right: true },
      northwest: { up: true, down: false, left: true, right: false },
      southwest: { up: false, down: true, left: true, right: false },
    } as const;

    for (const center of [
      { x: 5, y: 4.25 },
      { x: 19, y: 6.45 },
    ]) {
      const approaches = [
        {
          name: 'left',
          start: { x: center.x - diagonal * 1.65, y: center.y + diagonal * 1.65 },
          input: inputs.right,
          remains: (point: Point) => point.x - point.y < center.x - center.y,
        },
        {
          name: 'right',
          start: { x: center.x + diagonal * 1.65, y: center.y - diagonal * 1.65 },
          input: inputs.left,
          remains: (point: Point) => point.x - point.y > center.x - center.y,
        },
        {
          name: 'front',
          start: { x: center.x + diagonal * 0.9, y: center.y + diagonal * 0.9 },
          input: inputs.up,
          remains: (point: Point) => point.x + point.y > center.x + center.y,
        },
        {
          name: 'back',
          start: { x: center.x - diagonal * 0.9, y: center.y - diagonal * 0.9 },
          input: inputs.down,
          remains: (point: Point) => point.x + point.y < center.x + center.y,
        },
        {
          name: 'left-front corner',
          start: {
            x: center.x - diagonal,
            y: center.y + diagonal + 1,
          },
          input: inputs.northeast,
          remains: (point: Point) =>
            point.x - point.y < center.x - center.y && point.x + point.y > center.x + center.y,
        },
        {
          name: 'left-back corner',
          start: {
            x: center.x - diagonal - 1,
            y: center.y + diagonal,
          },
          input: inputs.southeast,
          remains: (point: Point) =>
            point.x - point.y < center.x - center.y && point.x + point.y < center.x + center.y,
        },
        {
          name: 'right-front corner',
          start: {
            x: center.x + diagonal + 1,
            y: center.y - diagonal,
          },
          input: inputs.northwest,
          remains: (point: Point) =>
            point.x - point.y > center.x - center.y && point.x + point.y > center.x + center.y,
        },
        {
          name: 'right-back corner',
          start: {
            x: center.x + diagonal,
            y: center.y - diagonal - 1,
          },
          input: inputs.southwest,
          remains: (point: Point) =>
            point.x - point.y > center.x - center.y && point.x + point.y < center.x + center.y,
        },
      ];

      for (const jogging of [false, true]) {
        for (const deltaSeconds of [1 / 60, 1 / 20, 0.1]) {
          for (const approach of approaches) {
            let position = { ...approach.start };
            let stayedOnApproachSide = true;
            let stayedWalkable = true;
            for (let frame = 0; frame < 120; frame += 1) {
              position = moveWithCollisionIndex(
                position,
                movementDelta(approach.input, movementSpeed(jogging), deltaSeconds),
                PLAYER_FOOT_RADIUS,
                manifest.safeSaveBounds,
                collisionIndex,
              );
              stayedOnApproachSide &&= approach.remains(position);
              stayedWalkable &&= isPositionWalkable(
                position,
                PLAYER_FOOT_RADIUS,
                manifest.safeSaveBounds,
                collisionIndex.query({
                  minX: position.x - PLAYER_FOOT_RADIUS,
                  minY: position.y - PLAYER_FOOT_RADIUS,
                  maxX: position.x + PLAYER_FOOT_RADIUS,
                  maxY: position.y + PLAYER_FOOT_RADIUS,
                }),
              );
            }
            expect(
              stayedOnApproachSide,
              `${approach.name} crossed at ${jogging ? 'jog' : 'walk'} ${deltaSeconds}s`,
            ).toBe(true);
            expect(
              stayedWalkable,
              `${approach.name} entered collision at ${jogging ? 'jog' : 'walk'} ${deltaSeconds}s`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('prevents tunneling and slides along obstacle edges', () => {
    const result = moveWithCollisions(
      { x: 3.4, y: 2.5 },
      { x: 2.5, y: 2.5 },
      0.3,
      bounds,
      obstacles,
    );
    expect(result.x).toBeLessThan(4);
    expect(result.y).toBeGreaterThan(3.5);
    expect(isPositionWalkable(result, 0.3, bounds, obstacles)).toBe(true);
  });

  it('preserves fence, lamp, tree, water, and bridge behavior with swept substeps', async () => {
    const { lanternSquareManifest } = await import('../src/index');
    const manifest = lanternSquareManifest();
    const move = (position: Point, delta: Point) =>
      moveWithCollisions(
        position,
        delta,
        PLAYER_FOOT_RADIUS,
        manifest.safeSaveBounds,
        manifest.collisions,
      );

    const fence = move({ x: 3.8, y: 12.4 }, { x: 0, y: -2 });
    expect(fence.y).toBeGreaterThan(11.72);
    const lamp = move({ x: 8.8, y: 6 }, { x: 0, y: -2 });
    expect(lamp.y).toBeGreaterThan(5.2);
    const tree = move({ x: 2.4, y: 9.4 }, { x: 0, y: -2 });
    expect(tree.y).toBeGreaterThan(8.6);
    const water = move({ x: 4, y: 12 }, { x: 0, y: 3 });
    expect(water.y).toBeLessThan(13);
    const bridge = move({ x: 12, y: 12 }, { x: 0, y: 3 });
    expect(bridge.y).toBeCloseTo(15);
  });
});
