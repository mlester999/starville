import type { Bounds, Point } from './contracts';

export const PLAYER_FOOT_RADIUS = 0.24;

export interface RectangleCollision {
  readonly id: string;
  readonly shape: 'rectangle';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly blocking: boolean;
}

export interface CircleCollision {
  readonly id: string;
  readonly shape: 'circle';
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly blocking: boolean;
}

export interface CapsuleCollision {
  readonly id: string;
  readonly shape: 'capsule';
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly radius: number;
  readonly blocking: boolean;
}

export type CollisionShape = RectangleCollision | CircleCollision | CapsuleCollision;

function circleIntersectsRectangle(
  point: Point,
  radius: number,
  rectangle: RectangleCollision,
): boolean {
  const closestX = Math.max(rectangle.x, Math.min(point.x, rectangle.x + rectangle.width));
  const closestY = Math.max(rectangle.y, Math.min(point.y, rectangle.y + rectangle.height));
  return Math.hypot(point.x - closestX, point.y - closestY) < radius;
}

function circleIntersectsCircle(point: Point, radius: number, circle: CircleCollision): boolean {
  return Math.hypot(point.x - circle.x, point.y - circle.y) < radius + circle.radius;
}

function closestPointOnSegment(point: Point, start: Point, end: Point): Point {
  const segment = { x: end.x - start.x, y: end.y - start.y };
  const lengthSquared = segment.x * segment.x + segment.y * segment.y;
  if (lengthSquared <= Number.EPSILON) return start;
  const amount = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * segment.x + (point.y - start.y) * segment.y) / lengthSquared,
    ),
  );
  return { x: start.x + segment.x * amount, y: start.y + segment.y * amount };
}

function circleIntersectsCapsule(point: Point, radius: number, capsule: CapsuleCollision): boolean {
  const closest = closestPointOnSegment(
    point,
    { x: capsule.startX, y: capsule.startY },
    { x: capsule.endX, y: capsule.endY },
  );
  return Math.hypot(point.x - closest.x, point.y - closest.y) < radius + capsule.radius;
}

function normalize(x: number, y: number): Point | undefined {
  const length = Math.hypot(x, y);
  if (length <= Number.EPSILON) return undefined;
  return { x: x / length, y: y / length };
}

function rectangleContactNormal(point: Point, rectangle: RectangleCollision): Point | undefined {
  const closestX = Math.max(rectangle.x, Math.min(point.x, rectangle.x + rectangle.width));
  const closestY = Math.max(rectangle.y, Math.min(point.y, rectangle.y + rectangle.height));
  const outsideNormal = normalize(point.x - closestX, point.y - closestY);
  if (outsideNormal !== undefined) return outsideNormal;

  const sides = [
    { distance: Math.abs(point.x - rectangle.x), normal: { x: -1, y: 0 } },
    {
      distance: Math.abs(rectangle.x + rectangle.width - point.x),
      normal: { x: 1, y: 0 },
    },
    { distance: Math.abs(point.y - rectangle.y), normal: { x: 0, y: -1 } },
    {
      distance: Math.abs(rectangle.y + rectangle.height - point.y),
      normal: { x: 0, y: 1 },
    },
  ];
  return sides.sort((left, right) => left.distance - right.distance)[0]?.normal;
}

function collisionContactNormal(
  point: Point,
  radius: number,
  collision: CollisionShape,
): Point | undefined {
  if (!collision.blocking) return undefined;
  if (collision.shape === 'rectangle') {
    return circleIntersectsRectangle(point, radius, collision)
      ? rectangleContactNormal(point, collision)
      : undefined;
  }
  if (collision.shape === 'circle') {
    return circleIntersectsCircle(point, radius, collision)
      ? normalize(point.x - collision.x, point.y - collision.y)
      : undefined;
  }
  if (!circleIntersectsCapsule(point, radius, collision)) return undefined;
  const closest = closestPointOnSegment(
    point,
    { x: collision.startX, y: collision.startY },
    { x: collision.endX, y: collision.endY },
  );
  return normalize(point.x - closest.x, point.y - closest.y);
}

function boundaryContactNormals(point: Point, radius: number, bounds: Bounds): Point[] {
  const normals: Point[] = [];
  if (point.x - radius < bounds.minX) normals.push({ x: 1, y: 0 });
  if (point.x + radius > bounds.maxX) normals.push({ x: -1, y: 0 });
  if (point.y - radius < bounds.minY) normals.push({ x: 0, y: 1 });
  if (point.y + radius > bounds.maxY) normals.push({ x: 0, y: -1 });
  return normals;
}

function slideAlongContact(
  current: Point,
  step: Point,
  radius: number,
  bounds: Bounds,
  collisions: readonly CollisionShape[],
): Point {
  const attempted = { x: current.x + step.x, y: current.y + step.y };
  const normals = [
    ...boundaryContactNormals(attempted, radius, bounds),
    ...collisions
      .map((collision) => collisionContactNormal(attempted, radius, collision))
      .filter((normal): normal is Point => normal !== undefined),
  ];
  const contact = normals.sort(
    (left, right) => step.x * left.x + step.y * left.y - (step.x * right.x + step.y * right.y),
  )[0];
  if (contact === undefined) return current;

  const inwardAmount = step.x * contact.x + step.y * contact.y;
  if (inwardAmount >= 0) return current;
  const tangent = {
    x: step.x - contact.x * inwardAmount,
    y: step.y - contact.y * inwardAmount,
  };
  const candidate = { x: current.x + tangent.x, y: current.y + tangent.y };
  return isPositionWalkable(candidate, radius, bounds, collisions) ? candidate : current;
}

export function isPositionWalkable(
  point: Point,
  radius: number,
  bounds: Bounds,
  collisions: readonly CollisionShape[],
): boolean {
  if (
    point.x - radius < bounds.minX ||
    point.y - radius < bounds.minY ||
    point.x + radius > bounds.maxX ||
    point.y + radius > bounds.maxY
  ) {
    return false;
  }

  return !collisions.some(
    (collision) =>
      collision.blocking &&
      (collision.shape === 'rectangle'
        ? circleIntersectsRectangle(point, radius, collision)
        : collision.shape === 'circle'
          ? circleIntersectsCircle(point, radius, collision)
          : circleIntersectsCapsule(point, radius, collision)),
  );
}

export function moveWithCollisions(
  position: Point,
  delta: Point,
  radius: number,
  bounds: Bounds,
  collisions: readonly CollisionShape[],
): Point {
  const stepLength = Math.max(radius * 0.45, 0.04);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / stepLength));
  const step = { x: delta.x / steps, y: delta.y / steps };
  let current = { ...position };

  for (let index = 0; index < steps; index += 1) {
    const combined = { x: current.x + step.x, y: current.y + step.y };
    if (isPositionWalkable(combined, radius, bounds, collisions)) {
      current = combined;
      continue;
    }

    current = slideAlongContact(current, step, radius, bounds, collisions);
  }

  return current;
}
