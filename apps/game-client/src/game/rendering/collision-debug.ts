import type Phaser from 'phaser';

import {
  projectWorld,
  type CollisionShape,
  type IsometricProjection,
  type Point,
} from '@starville/game-core';

export interface CollisionDebugOverlay {
  updatePlayer(position: Point): void;
  destroy(): void;
}

function projectedCircle(center: Point, radius: number, projection: IsometricProjection): Point[] {
  return Array.from({ length: 33 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    return projectWorld(
      { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius },
      projection,
    );
  });
}

function projectedShape(shape: CollisionShape, projection: IsometricProjection): Point[] {
  if (shape.shape === 'circle') {
    return projectedCircle(shape, shape.radius, projection);
  }
  if (shape.shape === 'capsule') {
    const angle = Math.atan2(shape.endY - shape.startY, shape.endX - shape.startX);
    const worldPoints: Point[] = [];
    for (let index = 0; index <= 16; index += 1) {
      const capAngle = angle + Math.PI / 2 + (index / 16) * Math.PI;
      worldPoints.push({
        x: shape.startX + Math.cos(capAngle) * shape.radius,
        y: shape.startY + Math.sin(capAngle) * shape.radius,
      });
    }
    for (let index = 0; index <= 16; index += 1) {
      const capAngle = angle - Math.PI / 2 + (index / 16) * Math.PI;
      worldPoints.push({
        x: shape.endX + Math.cos(capAngle) * shape.radius,
        y: shape.endY + Math.sin(capAngle) * shape.radius,
      });
    }
    return worldPoints.map((point) => projectWorld(point, projection));
  }
  return [
    projectWorld({ x: shape.x, y: shape.y }, projection),
    projectWorld({ x: shape.x + shape.width, y: shape.y }, projection),
    projectWorld({ x: shape.x + shape.width, y: shape.y + shape.height }, projection),
    projectWorld({ x: shape.x, y: shape.y + shape.height }, projection),
    projectWorld({ x: shape.x, y: shape.y }, projection),
  ];
}

export function renderCollisionDebug(
  scene: Phaser.Scene,
  collisions: readonly CollisionShape[],
  projection: IsometricProjection,
  playerRadius: number,
): CollisionDebugOverlay {
  const collisionGraphics = scene.add.graphics().setDepth(999_999_800);
  collisionGraphics.lineStyle(2, 0xff5d73, 0.95);
  collisionGraphics.fillStyle(0xff3154, 0.18);
  for (const collision of collisions.filter(({ blocking }) => blocking)) {
    const points = projectedShape(collision, projection);
    collisionGraphics.fillPoints(points, true);
    collisionGraphics.strokePoints(points, true);
  }

  const playerGraphics = scene.add.graphics().setDepth(999_999_900);
  return {
    updatePlayer(position) {
      const points = projectedCircle(position, playerRadius, projection);
      playerGraphics.clear();
      playerGraphics.lineStyle(2, 0x78f5ff, 1);
      playerGraphics.fillStyle(0x46dce7, 0.22);
      playerGraphics.fillPoints(points, true);
      playerGraphics.strokePoints(points, true);
    },
    destroy() {
      collisionGraphics.destroy();
      playerGraphics.destroy();
    },
  };
}
