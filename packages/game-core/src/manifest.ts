import { z } from 'zod';

import {
  MAP_DIRECTIONS,
  mapDirectionSchema,
  mapIdSchema,
  type Bounds,
  type FacingDirection,
  type MapDirection,
  type MapId,
  type Point,
} from './contracts';
import { isPositionWalkable, PLAYER_FOOT_RADIUS, type CollisionShape } from './collision';
import { worldInteractionSchema } from './interactions';

export const MAP_MANIFEST_SCHEMA_VERSION = 1 as const;
export const MAX_MAP_MANIFEST_BYTES = 256 * 1024;

const identifierSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);
const safeTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .regex(/^[^<>\p{Cc}]+$/u)
    .refine(
      (value) => !/(?:javascript\s*:|data\s*:\s*text\/html|on[a-z]+\s*=)/iu.test(value),
      'Map text must remain non-executable data',
    );
const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const boundsSchema = z
  .object({
    minX: z.number().finite(),
    minY: z.number().finite(),
    maxX: z.number().finite(),
    maxY: z.number().finite(),
  })
  .strict();
const triggerRectangleSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive().max(128),
    height: z.number().positive().max(128),
  })
  .strict();
const rectangleSchema = z
  .object({
    id: identifierSchema,
    shape: z.literal('rectangle'),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive().max(100),
    height: z.number().positive().max(100),
    blocking: z.boolean(),
  })
  .strict();
const circleSchema = z
  .object({
    id: identifierSchema,
    shape: z.literal('circle'),
    x: z.number().finite(),
    y: z.number().finite(),
    radius: z.number().positive().max(50),
    blocking: z.boolean(),
  })
  .strict();
const capsuleSchema = z
  .object({
    id: identifierSchema,
    shape: z.literal('capsule'),
    startX: z.number().finite(),
    startY: z.number().finite(),
    endX: z.number().finite(),
    endY: z.number().finite(),
    radius: z.number().positive().max(50),
    blocking: z.boolean(),
  })
  .strict()
  .refine(
    ({ startX, startY, endX, endY }) => Math.hypot(endX - startX, endY - startY) > 0,
    'Capsule endpoints must be distinct',
  );

export const mapObjectKinds = [
  'building',
  'tree',
  'rock',
  'fence',
  'lamp',
  'sign',
  'flowers',
  'bush',
  'farm_plot',
  'shop',
  'cooking_station',
  'crafting_station',
  'home_entrance',
  'furniture',
] as const;
const mapObjectSchema = z
  .object({
    id: identifierSchema,
    assetId: identifierSchema,
    kind: z.enum(mapObjectKinds),
    x: z.number().finite(),
    y: z.number().finite(),
    scale: z.number().positive().max(4).default(1),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  })
  .strict();
const terrainAreaSchema = z
  .object({
    id: identifierSchema,
    terrain: z.enum(['grass', 'plaza', 'path', 'water', 'bridge']),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    order: z.number().int(),
  })
  .strict();
export const spawnPurposeSchema = z.enum(['default', 'transition-entry']);
export type SpawnPurpose = z.infer<typeof spawnPurposeSchema>;

export const mapSpawnSchema = z
  .object({
    id: identifierSchema,
    x: z.number().finite(),
    y: z.number().finite(),
    facingDirection: z.enum([
      'north',
      'northeast',
      'east',
      'southeast',
      'south',
      'southwest',
      'west',
      'northwest',
    ]),
    purpose: spawnPurposeSchema,
    enabled: z.boolean(),
  })
  .strict();

export const mapExitSchema = z
  .object({
    id: identifierSchema,
    direction: mapDirectionSchema,
    trigger: triggerRectangleSchema,
    destinationMapId: mapIdSchema.nullable(),
    destinationSpawnId: identifierSchema.nullable(),
    enabled: z.boolean(),
    transitionLabel: safeTextSchema(80).nullable(),
  })
  .strict();

export const worldAssetStatuses = ['approved', 'deprecated', 'draft'] as const;
export const worldAssetStatusSchema = z.enum(worldAssetStatuses);
export type WorldAssetStatus = z.infer<typeof worldAssetStatusSchema>;

export interface WorldAssetValidationRecord {
  readonly key: string;
  readonly status: WorldAssetStatus;
}

export type WorldAssetValidationSource =
  ReadonlySet<string> | ReadonlyMap<string, WorldAssetValidationRecord>;

export const mapManifestSchema = z
  .object({
    schemaVersion: z.literal(MAP_MANIFEST_SCHEMA_VERSION),
    id: mapIdSchema,
    slug: mapIdSchema,
    name: safeTextSchema(80),
    description: safeTextSchema(240),
    version: z.number().int().positive(),
    developmentArt: z
      .object({
        temporary: z.boolean(),
        label: safeTextSchema(120),
      })
      .strict(),
    background: z
      .object({
        palette: z.enum(['village', 'meadow', 'brook', 'hearth', 'forest']),
      })
      .strict(),
    width: z.number().int().min(8).max(128),
    height: z.number().int().min(8).max(128),
    tileWidth: z.number().int().min(32).max(256),
    tileHeight: z.number().int().min(16).max(128),
    projectionOrigin: pointSchema,
    cameraBounds: boundsSchema,
    safeSaveBounds: boundsSchema,
    defaultSpawnId: identifierSchema,
    spawns: z.array(mapSpawnSchema).min(1).max(32),
    assets: z.array(identifierSchema).min(1).max(128),
    terrain: z.array(terrainAreaSchema).min(1).max(512),
    collisions: z
      .array(z.discriminatedUnion('shape', [rectangleSchema, circleSchema, capsuleSchema]))
      .max(512),
    objects: z.array(mapObjectSchema).max(512),
    interactions: z.array(worldInteractionSchema).max(64),
    exits: z.array(mapExitSchema).length(MAP_DIRECTIONS.length),
  })
  .strict();

export interface MapObject {
  readonly id: string;
  readonly assetId: string;
  readonly kind: (typeof mapObjectKinds)[number];
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation?: 0 | 90 | 180 | 270;
}

export interface TerrainArea {
  readonly id: string;
  readonly terrain: 'grass' | 'plaza' | 'path' | 'water' | 'bridge';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly order: number;
}

export interface MapSpawn {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly facingDirection: FacingDirection;
  readonly purpose: SpawnPurpose;
  readonly enabled: boolean;
}

export interface MapExit {
  readonly id: string;
  readonly direction: MapDirection;
  readonly trigger: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly destinationMapId: MapId | null;
  readonly destinationSpawnId: string | null;
  readonly enabled: boolean;
  readonly transitionLabel: string | null;
}

type ParsedMapManifest = z.infer<typeof mapManifestSchema>;
export type MapManifestInput = z.input<typeof mapManifestSchema>;

export type MapManifest = Readonly<ParsedMapManifest> & {
  /** Phase 4 compatibility projection. New code should resolve `defaultSpawnId` in `spawns`. */
  readonly spawn: Point;
};

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function assertPayloadSize(value: unknown): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('Map manifest must be serializable data');
  }
  if (serialized === undefined || utf8ByteLength(serialized) > MAX_MAP_MANIFEST_BYTES) {
    throw new Error('Map manifest exceeds the maximum payload size');
  }
}

function hasAsset(source: WorldAssetValidationSource, key: string): boolean {
  if ('get' in source) return source.get(key)?.status === 'approved';
  return source.has(key);
}

function validBounds(bounds: Bounds): boolean {
  return bounds.minX < bounds.maxX && bounds.minY < bounds.maxY;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value) as T;
}

function pointInsideBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

function rectangleInsideMap(
  rectangle: Readonly<{ x: number; y: number; width: number; height: number }>,
  width: number,
  height: number,
): boolean {
  return (
    rectangle.x >= 0 &&
    rectangle.y >= 0 &&
    rectangle.x + rectangle.width <= width &&
    rectangle.y + rectangle.height <= height
  );
}

function rectanglesOverlap(
  left: Readonly<{ x: number; y: number; width: number; height: number }>,
  right: Readonly<{ x: number; y: number; width: number; height: number }>,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function collisionInsideMap(collision: CollisionShape, width: number, height: number): boolean {
  if (collision.shape === 'rectangle') {
    return rectangleInsideMap(collision, width, height);
  }
  if (collision.shape === 'circle') {
    return (
      collision.x - collision.radius >= 0 &&
      collision.y - collision.radius >= 0 &&
      collision.x + collision.radius <= width &&
      collision.y + collision.radius <= height
    );
  }
  return (
    Math.min(collision.startX, collision.endX) - collision.radius >= 0 &&
    Math.min(collision.startY, collision.endY) - collision.radius >= 0 &&
    Math.max(collision.startX, collision.endX) + collision.radius <= width &&
    Math.max(collision.startY, collision.endY) + collision.radius <= height
  );
}

function attachDefaultSpawn(manifest: ParsedMapManifest): MapManifest {
  const defaultSpawn = manifest.spawns.find(({ id }) => id === manifest.defaultSpawnId);
  if (defaultSpawn === undefined) throw new Error('Map default spawn is missing');
  const result = manifest as MapManifest;
  Object.defineProperty(result, 'spawn', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ x: defaultSpawn.x, y: defaultSpawn.y }),
  });
  return deepFreeze(result);
}

function exitMatchesDirectionalEdge(exit: MapExit, width: number, height: number): boolean {
  const edgeTolerance = 1;
  if (exit.direction === 'north') return exit.trigger.y <= edgeTolerance;
  if (exit.direction === 'east') {
    return exit.trigger.x + exit.trigger.width >= width - edgeTolerance;
  }
  if (exit.direction === 'south') {
    return exit.trigger.y + exit.trigger.height >= height - edgeTolerance;
  }
  return exit.trigger.x <= edgeTolerance;
}

export function validateMapManifest(
  value: unknown,
  availableAssets: WorldAssetValidationSource,
): MapManifest {
  assertPayloadSize(value);
  const manifest = mapManifestSchema.parse(value);

  if (manifest.id !== manifest.slug) {
    throw new Error('Map manifest id and slug must match');
  }
  if (!validBounds(manifest.cameraBounds)) {
    throw new Error('Map camera bounds are invalid');
  }
  if (manifest.cameraBounds.minX < 0 || manifest.cameraBounds.minY < 0) {
    throw new Error('Map camera bounds must use non-negative screen coordinates');
  }
  if (
    !validBounds(manifest.safeSaveBounds) ||
    manifest.safeSaveBounds.minX < 0 ||
    manifest.safeSaveBounds.minY < 0 ||
    manifest.safeSaveBounds.maxX > manifest.width ||
    manifest.safeSaveBounds.maxY > manifest.height
  ) {
    throw new Error('Map safe save bounds are invalid');
  }

  const identifiers = [
    ...manifest.terrain.map(({ id }) => id),
    ...manifest.collisions.map(({ id }) => id),
    ...manifest.objects.map(({ id }) => id),
    ...manifest.interactions.map(({ id }) => id),
    ...manifest.spawns.map(({ id }) => id),
    ...manifest.exits.map(({ id }) => id),
  ];
  if (new Set(identifiers).size !== identifiers.length) {
    throw new Error('Map manifest contains duplicate object identifiers');
  }
  if (new Set(manifest.assets).size !== manifest.assets.length) {
    throw new Error('Map manifest contains duplicate asset references');
  }

  for (const assetId of manifest.assets) {
    if (!hasAsset(availableAssets, assetId)) {
      throw new Error(`Map manifest references missing asset or unapproved asset '${assetId}'`);
    }
  }
  const declaredAssets = new Set(manifest.assets);
  for (const object of manifest.objects) {
    if (!declaredAssets.has(object.assetId)) {
      throw new Error(`Map object '${object.id}' references undeclared asset '${object.assetId}'`);
    }
  }

  for (const terrain of manifest.terrain) {
    if (!rectangleInsideMap(terrain, manifest.width, manifest.height)) {
      throw new Error(`Map terrain '${terrain.id}' lies outside map bounds`);
    }
  }
  for (const collision of manifest.collisions) {
    if (!collisionInsideMap(collision, manifest.width, manifest.height)) {
      throw new Error(`Map collision '${collision.id}' lies outside map bounds`);
    }
  }
  const waterAreas = manifest.terrain.filter(({ terrain }) => terrain === 'water');
  for (const bridge of manifest.terrain.filter(({ terrain }) => terrain === 'bridge')) {
    if (!waterAreas.some((water) => rectanglesOverlap(bridge, water))) {
      throw new Error(`Map bridge '${bridge.id}' does not cross a water region`);
    }
    const center = { x: bridge.x + bridge.width / 2, y: bridge.y + bridge.height / 2 };
    if (
      !isPositionWalkable(center, PLAYER_FOOT_RADIUS, manifest.safeSaveBounds, manifest.collisions)
    ) {
      throw new Error(`Map bridge '${bridge.id}' has blocking collision across its center`);
    }
  }
  for (const object of [...manifest.objects, ...manifest.interactions]) {
    if (!pointInsideBounds(object, manifest.safeSaveBounds)) {
      throw new Error(`Map object '${object.id}' lies outside safe bounds`);
    }
  }
  for (const interaction of manifest.interactions) {
    if (
      !isPositionWalkable(
        interaction,
        PLAYER_FOOT_RADIUS,
        manifest.safeSaveBounds,
        manifest.collisions,
      )
    ) {
      throw new Error(`Map interaction '${interaction.id}' is not safely reachable`);
    }
  }

  const defaultSpawn = manifest.spawns.find(({ id }) => id === manifest.defaultSpawnId);
  if (defaultSpawn === undefined || !defaultSpawn.enabled || defaultSpawn.purpose !== 'default') {
    throw new Error('Map default spawn is missing, disabled, or has the wrong purpose');
  }
  if (manifest.spawns.filter(({ purpose }) => purpose === 'default').length !== 1) {
    throw new Error('Map manifest must contain exactly one default spawn');
  }
  for (const spawn of manifest.spawns) {
    if (!pointInsideBounds(spawn, manifest.safeSaveBounds)) {
      throw new Error(`Map spawn '${spawn.id}' lies outside safe save bounds`);
    }
    if (
      spawn.enabled &&
      !isPositionWalkable(spawn, PLAYER_FOOT_RADIUS, manifest.safeSaveBounds, manifest.collisions)
    ) {
      throw new Error(`Map spawn '${spawn.id}' overlaps blocking collision`);
    }
  }

  const exitDirections = new Set(manifest.exits.map(({ direction }) => direction));
  if (
    exitDirections.size !== MAP_DIRECTIONS.length ||
    !MAP_DIRECTIONS.every((direction) => exitDirections.has(direction))
  ) {
    throw new Error('Map manifest must define exactly one exit for every direction');
  }
  for (const exit of manifest.exits) {
    if (!rectangleInsideMap(exit.trigger, manifest.width, manifest.height)) {
      throw new Error(`Map exit '${exit.id}' lies outside map bounds`);
    }
    if (!exitMatchesDirectionalEdge(exit, manifest.width, manifest.height)) {
      throw new Error(`Map exit '${exit.id}' does not match its directional edge`);
    }
    const hasMap = exit.destinationMapId !== null;
    const hasSpawn = exit.destinationSpawnId !== null;
    if (exit.enabled !== (hasMap && hasSpawn)) {
      throw new Error(`Map exit '${exit.id}' has inconsistent enabled destination data`);
    }
    if (exit.enabled && exit.transitionLabel === null) {
      throw new Error(`Map exit '${exit.id}' requires a transition label`);
    }
    const center = {
      x: exit.trigger.x + exit.trigger.width / 2,
      y: exit.trigger.y + exit.trigger.height / 2,
    };
    if (
      exit.enabled &&
      !isPositionWalkable(center, PLAYER_FOOT_RADIUS, manifest.safeSaveBounds, manifest.collisions)
    ) {
      throw new Error(`Map exit '${exit.id}' has no safe walkable trigger center`);
    }
  }
  for (let leftIndex = 0; leftIndex < manifest.exits.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < manifest.exits.length; rightIndex += 1) {
      const left = manifest.exits[leftIndex];
      const right = manifest.exits[rightIndex];
      if (
        left !== undefined &&
        right !== undefined &&
        rectanglesOverlap(left.trigger, right.trigger)
      ) {
        throw new Error(`Map exits '${left.id}' and '${right.id}' overlap`);
      }
    }
  }

  return attachDefaultSpawn(manifest);
}

function pointInsideExitTrigger(point: Point, exit: MapExit): boolean {
  return (
    point.x + PLAYER_FOOT_RADIUS >= exit.trigger.x &&
    point.x - PLAYER_FOOT_RADIUS <= exit.trigger.x + exit.trigger.width &&
    point.y + PLAYER_FOOT_RADIUS >= exit.trigger.y &&
    point.y - PLAYER_FOOT_RADIUS <= exit.trigger.y + exit.trigger.height
  );
}

export function validateWorldManifestGraph(
  values: readonly unknown[],
  availableAssets: WorldAssetValidationSource,
): readonly MapManifest[] {
  const manifests = values.map((value) => validateMapManifest(value, availableAssets));
  const byId = new Map<MapId, MapManifest>();
  for (const manifest of manifests) {
    if (byId.has(manifest.id))
      throw new Error(`World graph contains duplicate map '${manifest.id}'`);
    byId.set(manifest.id, manifest);
  }

  for (const manifest of manifests) {
    for (const exit of manifest.exits) {
      if (!exit.enabled) continue;
      if (exit.destinationMapId === null || exit.destinationSpawnId === null) {
        throw new Error(`Map '${manifest.id}' exit '${exit.id}' has no complete destination`);
      }
      const destination = byId.get(exit.destinationMapId);
      if (destination === undefined) {
        throw new Error(
          `Map '${manifest.id}' exit '${exit.id}' references a missing destination map`,
        );
      }
      const spawn = destination.spawns.find(({ id }) => id === exit.destinationSpawnId);
      if (spawn === undefined || !spawn.enabled || spawn.purpose !== 'transition-entry') {
        throw new Error(
          `Map '${manifest.id}' exit '${exit.id}' references a missing, disabled, or non-transition destination spawn`,
        );
      }
      if (spawn.facingDirection !== exit.direction) {
        throw new Error(
          `Map '${manifest.id}' exit '${exit.id}' destination spawn does not face inward`,
        );
      }
      if (
        destination.exits.some(
          (candidate) => candidate.enabled && pointInsideExitTrigger(spawn, candidate),
        )
      ) {
        throw new Error(
          `Map '${manifest.id}' exit '${exit.id}' would spawn inside an active exit trigger`,
        );
      }
      if (
        !destination.exits.some(
          (candidate) => candidate.enabled && candidate.destinationMapId === manifest.id,
        )
      ) {
        throw new Error(
          `Map '${manifest.id}' exit '${exit.id}' destination has no enabled return route`,
        );
      }
    }
  }
  return Object.freeze(manifests);
}

export function defaultMapSpawn(manifest: MapManifest): MapSpawn {
  const spawn = manifest.spawns.find(({ id }) => id === manifest.defaultSpawnId);
  if (spawn === undefined) throw new Error('Validated map default spawn is unavailable');
  return spawn;
}

export function terrainAt(manifest: MapManifest, x: number, y: number): TerrainArea['terrain'] {
  return (
    [...manifest.terrain]
      .filter(
        (area) => x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height,
      )
      .sort((left, right) => right.order - left.order)[0]?.terrain ?? 'grass'
  );
}
