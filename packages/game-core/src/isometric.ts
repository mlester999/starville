import type { Point } from './contracts';

export interface IsometricProjection {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly originX: number;
  readonly originY: number;
}

export function tileToWorld(tile: Point): Point {
  return { x: tile.x, y: tile.y };
}

export function worldToTile(world: Point): Point {
  return { x: Math.floor(world.x), y: Math.floor(world.y) };
}

export function projectWorld(world: Point, projection: IsometricProjection): Point {
  return {
    x: projection.originX + (world.x - world.y) * (projection.tileWidth / 2),
    y: projection.originY + (world.x + world.y) * (projection.tileHeight / 2),
  };
}

export function unprojectScreen(screen: Point, projection: IsometricProjection): Point {
  const horizontal = (screen.x - projection.originX) / (projection.tileWidth / 2);
  const vertical = (screen.y - projection.originY) / (projection.tileHeight / 2);

  return {
    x: (horizontal + vertical) / 2,
    y: (vertical - horizontal) / 2,
  };
}
