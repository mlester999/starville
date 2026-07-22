import {
  MAP_IDS,
  validateMapManifest,
  type MapDirection,
  type MapId,
  type MapManifest,
  type MapManifestInput,
} from '@starville/game-core';

import { WORLD_ASSET_CATALOG } from './assets';
import {
  V3_OUTDOOR_LOCATION_SIZE_PROFILES,
  type V3LocationSizeProfile,
} from './location-size-profile';
import { WORLD_MANIFEST_BY_ID } from './manifests';

export const PRODUCTION_SLICE_V3_ID = 'starville-production-slice-v3' as const;
export const PRODUCTION_SLICE_V3_LIFECYCLE = 'local_unpublished' as const;
export const PRODUCTION_SLICE_V3_EXTERIOR_ID =
  'starville-production-slice-v3.exterior.lantern-square' as const;
export const PRODUCTION_SLICE_V3_INTERIOR_ID = 'amber-cottage-interior-v3' as const;

export const PRODUCTION_SLICE_V3_TERRAIN_VARIATION_KEYS = Object.freeze([
  'world.terrain.grass.light',
  'world.terrain.grass.dark',
  'world.terrain.grass.worn',
  'world.terrain.grass.flowers',
  'world.terrain.grass.path-edge',
  'world.terrain.grass.shore',
  'world.terrain.water.deep',
  'world.terrain.water.shallow',
  'world.terrain.water.shore',
  'world.terrain.water.disturbance',
]);

export const PRODUCTION_SLICE_V3_INTERIOR_ASSET_KEYS = Object.freeze([
  'v3.interior.floor',
  'v3.interior.wall',
  'v3.interior.door',
  'v3.interior.bed',
  'v3.interior.bedside-table',
  'v3.interior.dining-table',
  'v3.interior.dining-chair',
  'v3.interior.chest',
  'v3.interior.wardrobe',
  'v3.interior.rug',
  'v3.interior.window',
  'v3.interior.fireplace',
  'v3.interior.cooking-counter',
  'v3.interior.wall-art',
  'v3.interior.floor-lamp',
  'v3.interior.houseplant',
]);

const productionSliceAssetCatalog = new Map<
  string,
  { readonly key: string; readonly status: 'approved' }
>([...WORLD_ASSET_CATALOG].map(([key]) => [key, { key, status: 'approved' as const }]));
for (const key of [
  ...PRODUCTION_SLICE_V3_TERRAIN_VARIATION_KEYS,
  ...PRODUCTION_SLICE_V3_INTERIOR_ASSET_KEYS,
]) {
  productionSliceAssetCatalog.set(key, { key, status: 'approved' });
}

function disabledExits(width: number, height: number, prefix: string): MapManifestInput['exits'] {
  return [
    {
      id: `${prefix}-north`,
      direction: 'north' as const,
      trigger: { x: width / 2 - 2, y: 0.4, width: 4, height: 0.8 },
    },
    {
      id: `${prefix}-east`,
      direction: 'east' as const,
      trigger: { x: width - 1.2, y: height / 2 - 2, width: 0.8, height: 4 },
    },
    {
      id: `${prefix}-south`,
      direction: 'south' as const,
      trigger: { x: width / 2 - 2, y: height - 1.2, width: 4, height: 0.8 },
    },
    {
      id: `${prefix}-west`,
      direction: 'west' as const,
      trigger: { x: 0.4, y: height / 2 - 2, width: 0.8, height: 4 },
    },
  ].map((exit) => ({
    ...exit,
    destinationMapId: null,
    destinationSpawnId: null,
    enabled: false,
    transitionLabel: null,
  }));
}

type InputCollision = MapManifestInput['collisions'][number];

function translateCollision(collision: InputCollision, offsetX: number, offsetY: number) {
  if (collision.shape === 'rectangle' || collision.shape === 'circle') {
    return { ...collision, x: collision.x + offsetX, y: collision.y + offsetY };
  }
  return {
    ...collision,
    startX: collision.startX + offsetX,
    startY: collision.startY + offsetY,
    endX: collision.endX + offsetX,
    endY: collision.endY + offsetY,
  };
}

function canonicalManifest(mapId: MapId): MapManifest {
  const manifest = WORLD_MANIFEST_BY_ID.get(mapId);
  if (manifest === undefined) throw new Error(`Missing canonical map '${mapId}' for V3 expansion`);
  return manifest;
}

function approachTerrain(
  source: MapManifest,
  profile: V3LocationSizeProfile,
  direction: MapDirection,
): MapManifestInput['terrain'][number] {
  const sourceExit = source.exits.find((exit) => exit.direction === direction);
  if (sourceExit === undefined) throw new Error(`Missing ${direction} exit on '${source.id}'`);

  const offset = {
    x: (profile.logical.width - source.width) / 2,
    y: (profile.logical.height - source.height) / 2,
  } as const;
  const trigger = sourceExit.trigger;
  if (direction === 'north' || direction === 'south') {
    const width = Math.max(3, Math.round(trigger.width));
    const x = Math.floor(offset.x + trigger.x + trigger.width / 2 - width / 2);
    if (direction === 'north') {
      return {
        id: `v3-approach-${direction}`,
        terrain: 'path',
        x,
        y: 0,
        width,
        height: Math.ceil(offset.y + trigger.y + trigger.height),
        order: 2,
      };
    }
    const y = Math.floor(offset.y + trigger.y);
    return {
      id: `v3-approach-${direction}`,
      terrain: 'path',
      x,
      y,
      width,
      height: profile.logical.height - y,
      order: 2,
    };
  }

  const height = Math.max(3, Math.round(trigger.height));
  const y = Math.floor(offset.y + trigger.y + trigger.height / 2 - height / 2);
  if (direction === 'west') {
    return {
      id: `v3-approach-${direction}`,
      terrain: 'path',
      x: 0,
      y,
      width: Math.ceil(offset.x + trigger.x + trigger.width),
      height,
      order: 2,
    };
  }
  const x = Math.floor(offset.x + trigger.x);
  return {
    id: `v3-approach-${direction}`,
    terrain: 'path',
    x,
    y,
    width: profile.logical.width - x,
    height,
    order: 2,
  };
}

function composeExpandedOutdoorManifest(
  source: MapManifest,
  profile: V3LocationSizeProfile,
  options: Readonly<{
    version: number;
    name: string;
    description: string;
    approachDirections: readonly MapDirection[];
    exitPrefix: string;
  }>,
): MapManifestInput {
  const offsetX = (profile.logical.width - source.width) / 2;
  const offsetY = (profile.logical.height - source.height) / 2;
  if (offsetX < 0 || offsetY < 0 || !Number.isInteger(offsetX) || !Number.isInteger(offsetY)) {
    throw new Error(`V3 map '${source.id}' cannot center its canonical composition exactly`);
  }

  const fullCanvasTerrain = source.terrain.find(
    (area) =>
      area.x === 0 && area.y === 0 && area.width === source.width && area.height === source.height,
  );
  if (fullCanvasTerrain === undefined) {
    throw new Error(`V3 map '${source.id}' requires a full-canvas canonical terrain area`);
  }

  return {
    schemaVersion: source.schemaVersion,
    id: source.id,
    slug: source.slug,
    name: options.name,
    description: options.description,
    version: options.version,
    developmentArt: {
      temporary: true,
      label: 'Phase 12F-A.1 local V3 expansion · unpublished · owner review required',
    },
    background: source.background,
    width: profile.logical.width,
    height: profile.logical.height,
    tileWidth: source.tileWidth,
    tileHeight: source.tileHeight,
    projectionOrigin: { x: (profile.logical.width * source.tileWidth) / 2, y: 96 },
    cameraBounds: profile.cameraBounds,
    safeSaveBounds: profile.playableBounds,
    defaultSpawnId: source.defaultSpawnId,
    spawns: source.spawns.map((spawn) => ({
      ...spawn,
      x: spawn.x + offsetX,
      y: spawn.y + offsetY,
    })),
    assets: [...source.assets],
    terrain: [
      {
        ...fullCanvasTerrain,
        x: 0,
        y: 0,
        width: profile.logical.width,
        height: profile.logical.height,
      },
      ...source.terrain
        .filter((area) => area.id !== fullCanvasTerrain.id)
        .map((area) => ({ ...area, x: area.x + offsetX, y: area.y + offsetY })),
      ...options.approachDirections.map((direction) => approachTerrain(source, profile, direction)),
    ],
    collisions: source.collisions.map((collision) =>
      translateCollision(collision, offsetX, offsetY),
    ),
    objects: source.objects.map((object) => ({
      ...object,
      x: object.x + offsetX,
      y: object.y + offsetY,
    })),
    interactions: source.interactions.map((interaction) => ({
      ...interaction,
      x: interaction.x + offsetX,
      y: interaction.y + offsetY,
    })),
    exits: disabledExits(profile.logical.width, profile.logical.height, options.exitPrefix),
  };
}

interface ScenicAssetSpec {
  readonly assetId: string;
  readonly kind: MapManifestInput['objects'][number]['kind'];
  readonly scale: number;
}

interface ScenicPalette {
  readonly primary: ScenicAssetSpec;
  readonly secondary: ScenicAssetSpec;
  readonly accent: ScenicAssetSpec;
  readonly primaryCollisionRadius: number;
  readonly secondaryCollisionRadius?: number;
  readonly accentCollisionRadius?: number;
  readonly clearingTerrain: 'path' | 'plaza';
}

const V3_SCENIC_PALETTES: Readonly<Record<MapId, ScenicPalette>> = Object.freeze({
  'lantern-square': {
    primary: { assetId: 'tree-maple', kind: 'tree', scale: 1.35 },
    secondary: { assetId: 'bush-round', kind: 'bush', scale: 0.85 },
    accent: { assetId: 'lamp-star', kind: 'lamp', scale: 0.75 },
    primaryCollisionRadius: 0.42,
    accentCollisionRadius: 0.2,
    clearingTerrain: 'plaza',
  },
  'moonpetal-meadow': {
    primary: { assetId: 'tree-maple', kind: 'tree', scale: 1.2 },
    secondary: { assetId: 'bush-round', kind: 'bush', scale: 0.82 },
    accent: { assetId: 'flowers-moon', kind: 'flowers', scale: 0.74 },
    primaryCollisionRadius: 0.38,
    clearingTerrain: 'plaza',
  },
  'brooklight-crossing': {
    primary: { assetId: 'rock-moss', kind: 'rock', scale: 0.9 },
    secondary: { assetId: 'bush-round', kind: 'bush', scale: 0.84 },
    accent: { assetId: 'lamp-star', kind: 'lamp', scale: 0.76 },
    primaryCollisionRadius: 0.48,
    accentCollisionRadius: 0.2,
    clearingTerrain: 'path',
  },
  'hearthfield-road': {
    primary: { assetId: 'tree-maple', kind: 'tree', scale: 1.25 },
    secondary: { assetId: 'fence-willow', kind: 'fence', scale: 0.8 },
    accent: { assetId: 'lamp-star', kind: 'lamp', scale: 0.78 },
    primaryCollisionRadius: 0.4,
    secondaryCollisionRadius: 0.3,
    accentCollisionRadius: 0.2,
    clearingTerrain: 'path',
  },
  'whisperpine-gate': {
    primary: { assetId: 'tree-pine', kind: 'tree', scale: 1.35 },
    secondary: { assetId: 'rock-moss', kind: 'rock', scale: 0.76 },
    accent: { assetId: 'lamp-star', kind: 'lamp', scale: 0.75 },
    primaryCollisionRadius: 0.42,
    secondaryCollisionRadius: 0.4,
    accentCollisionRadius: 0.2,
    clearingTerrain: 'path',
  },
});

function scenicExpansionComposition(
  mapId: MapId,
  profile: V3LocationSizeProfile,
): Readonly<{
  terrain: MapManifestInput['terrain'];
  collisions: MapManifestInput['collisions'];
  objects: MapManifestInput['objects'];
}> {
  const palette = V3_SCENIC_PALETTES[mapId];
  const insetX = Math.floor(profile.contentBounds.minX / 2);
  const insetY = Math.floor(profile.contentBounds.minY / 2);
  const anchors = [
    { id: 'northwest', x: insetX, y: insetY, inwardX: 1, inwardY: 1 },
    {
      id: 'northeast',
      x: profile.logical.width - insetX,
      y: insetY,
      inwardX: -1,
      inwardY: 1,
    },
    {
      id: 'southwest',
      x: insetX,
      y: profile.logical.height - insetY,
      inwardX: 1,
      inwardY: -1,
    },
    {
      id: 'southeast',
      x: profile.logical.width - insetX,
      y: profile.logical.height - insetY,
      inwardX: -1,
      inwardY: -1,
    },
  ] as const;

  const terrain: MapManifestInput['terrain'] = [];
  const collisions: MapManifestInput['collisions'] = [];
  const objects: MapManifestInput['objects'] = [];
  for (const anchor of anchors) {
    const prefix = `v3-scenic-${anchor.id}`;
    const secondaryPosition = {
      x: anchor.x + anchor.inwardX * 2.1,
      y: anchor.y + anchor.inwardY * 0.8,
    } as const;
    const accentPosition = {
      x: anchor.x + anchor.inwardX * 0.8,
      y: anchor.y + anchor.inwardY * 2.1,
    } as const;
    terrain.push({
      id: `${prefix}-clearing`,
      terrain: palette.clearingTerrain,
      x: Math.floor(anchor.x - 3),
      y: Math.floor(anchor.y - 2),
      width: 7,
      height: 5,
      order: 1,
    });
    collisions.push({
      id: `${prefix}-primary-base`,
      shape: 'circle',
      x: anchor.x,
      y: anchor.y,
      radius: palette.primaryCollisionRadius,
      blocking: true,
    });
    if (palette.secondaryCollisionRadius !== undefined) {
      collisions.push({
        id: `${prefix}-secondary-base`,
        shape: 'circle',
        ...secondaryPosition,
        radius: palette.secondaryCollisionRadius,
        blocking: true,
      });
    }
    if (palette.accentCollisionRadius !== undefined) {
      collisions.push({
        id: `${prefix}-accent-base`,
        shape: 'circle',
        ...accentPosition,
        radius: palette.accentCollisionRadius,
        blocking: true,
      });
    }
    objects.push(
      {
        id: `${prefix}-primary`,
        ...palette.primary,
        x: anchor.x,
        y: anchor.y,
      },
      {
        id: `${prefix}-secondary`,
        ...palette.secondary,
        ...secondaryPosition,
      },
      {
        id: `${prefix}-accent`,
        ...palette.accent,
        ...accentPosition,
      },
    );
  }

  return Object.freeze({
    terrain,
    collisions,
    objects,
  });
}

const exteriorAssetKeys = [
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
  'phase7-dev-round-leaf-planter',
  ...PRODUCTION_SLICE_V3_TERRAIN_VARIATION_KEYS,
] as const;

interface RiverColumnProfile {
  readonly y: number;
  readonly height: number;
}

function waveRiverColumns(
  length: number,
  baseY: number,
  phaseStart: number,
): readonly RiverColumnProfile[] {
  return Array.from({ length }, (_unused, index) => {
    const phase = phaseStart + index;
    // Long, overlapping waves create authored-looking meanders without the
    // one-column jitter that made the earlier tile-safe stream look serrated.
    const bankWave = Math.sin(phase * 0.22) * 1.25 + Math.sin(phase * 0.08 + 0.8) * 0.7;
    const depthWave = Math.sin(phase * 0.31 + 1.4) * 1.05;
    return Object.freeze({
      y: baseY + Math.round(bankWave),
      height: Math.max(4, Math.min(7, 5 + Math.round(depthWave))),
    });
  });
}

function riverTerrainColumns(
  prefix: string,
  startX: number,
  columns: readonly RiverColumnProfile[],
): MapManifestInput['terrain'] {
  return columns.map((column, index) => ({
    id: `${prefix}-${String(index).padStart(2, '0')}`,
    terrain: 'water',
    x: startX + index,
    y: column.y,
    width: 1,
    height: column.height,
    order: 5,
  }));
}

function riverCollisionRuns(
  prefix: string,
  startX: number,
  columns: readonly RiverColumnProfile[],
  passableColumns: ReadonlySet<number> = new Set(),
): InputCollision[] {
  const collisions: InputCollision[] = [];
  let run: { x: number; y: number; width: number; height: number } | undefined;
  const flush = (): void => {
    if (run === undefined) return;
    collisions.push({
      id: `${prefix}-${String(collisions.length).padStart(2, '0')}`,
      shape: 'rectangle',
      ...run,
      blocking: true,
    });
    run = undefined;
  };

  for (const [index, column] of columns.entries()) {
    const x = startX + index;
    if (passableColumns.has(x)) {
      flush();
      continue;
    }
    if (
      run !== undefined &&
      run.x + run.width === x &&
      run.y === column.y &&
      run.height === column.height
    ) {
      run.width += 1;
      continue;
    }
    flush();
    run = { x, y: column.y, width: 1, height: column.height };
  }
  flush();
  return collisions;
}

const PRODUCTION_SLICE_CORE_RIVER = waveRiverColumns(48, 28, 0).map((column, index) =>
  index >= 8 && index <= 10
    ? Object.freeze({ y: 29, height: 5 })
    : index >= 28 && index <= 31
      ? Object.freeze({ y: 28, height: 6 })
      : column,
);

const rawProductionSliceV3Composition = {
  schemaVersion: 1,
  id: 'lantern-square',
  slug: 'lantern-square',
  name: 'Lantern Square Garden Quarter',
  description: 'A handcrafted cottage green, village square, and meandering river garden.',
  version: 1215,
  developmentArt: {
    temporary: true,
    label: 'Phase 12F-A.1R RESCUE POLISH · local · unpublished · owner review required',
  },
  background: { palette: 'village' },
  width: 48,
  height: 40,
  tileWidth: 96,
  tileHeight: 48,
  projectionOrigin: { x: 1_920, y: 256 },
  cameraBounds: { minX: 0, minY: 0, maxX: 4_352, maxY: 2_496 },
  safeSaveBounds: { minX: 1.2, minY: 1.2, maxX: 46.8, maxY: 38.8 },
  defaultSpawnId: 'slice-default',
  spawns: [
    {
      id: 'slice-default',
      x: 22.8,
      y: 12.7,
      facingDirection: 'north',
      purpose: 'default',
      enabled: true,
    },
  ],
  assets: [...exteriorAssetKeys],
  terrain: [
    { id: 'rescue-meadow', terrain: 'grass', x: 0, y: 0, width: 48, height: 40, order: 0 },
    { id: 'cottage-terrace', terrain: 'plaza', x: 14, y: 7, width: 13, height: 8, order: 2 },
    { id: 'lantern-square', terrain: 'plaza', x: 22, y: 16, width: 13, height: 9, order: 2 },
    { id: 'square-west-bay', terrain: 'plaza', x: 19, y: 18, width: 4, height: 5, order: 2 },
    { id: 'square-south-bay', terrain: 'plaza', x: 25, y: 24, width: 6, height: 2, order: 2 },
    { id: 'cottage-forecourt', terrain: 'plaza', x: 21, y: 12, width: 7, height: 5, order: 2 },
    { id: 'north-arrival-path', terrain: 'path', x: 27, y: 0, width: 3, height: 17, order: 3 },
    { id: 'front-walk-threshold', terrain: 'path', x: 22, y: 12, width: 2, height: 2, order: 4 },
    { id: 'front-walk-upper', terrain: 'path', x: 23, y: 13, width: 2, height: 2, order: 4 },
    { id: 'front-walk-middle', terrain: 'path', x: 24, y: 14, width: 2, height: 2, order: 4 },
    { id: 'front-walk-square', terrain: 'path', x: 25, y: 15, width: 3, height: 3, order: 4 },
    { id: 'west-village-path', terrain: 'path', x: 3, y: 18, width: 17, height: 3, order: 3 },
    { id: 'east-village-path', terrain: 'path', x: 34, y: 18, width: 11, height: 3, order: 3 },
    { id: 'south-river-path', terrain: 'path', x: 28, y: 24, width: 4, height: 16, order: 3 },
    { id: 'orchard-path', terrain: 'path', x: 7, y: 23, width: 13, height: 3, order: 3 },
    { id: 'orchard-bridge-path', terrain: 'path', x: 8, y: 24, width: 3, height: 9, order: 3 },
    ...riverTerrainColumns('river-column', 0, PRODUCTION_SLICE_CORE_RIVER),
    { id: 'west-footbridge', terrain: 'bridge', x: 8, y: 29, width: 3, height: 5, order: 7 },
    { id: 'main-bridge', terrain: 'bridge', x: 28, y: 28, width: 4, height: 6, order: 7 },
  ],
  collisions: [
    ...riverCollisionRuns(
      'river-solid',
      0,
      PRODUCTION_SLICE_CORE_RIVER,
      new Set([8, 9, 10, 28, 29, 30, 31]),
    ),
    {
      id: 'cottage-wall',
      shape: 'rectangle',
      x: 17.1,
      y: 9.1,
      width: 5.8,
      height: 3.35,
      blocking: true,
    },
    { id: 'pine-west-trunk', shape: 'circle', x: 6.5, y: 7.5, radius: 0.7, blocking: true },
    { id: 'maple-west-trunk', shape: 'circle', x: 10.5, y: 14, radius: 0.64, blocking: true },
    { id: 'pine-north-trunk', shape: 'circle', x: 36, y: 6.5, radius: 0.68, blocking: true },
    { id: 'maple-east-trunk', shape: 'circle', x: 41.5, y: 16, radius: 0.66, blocking: true },
    { id: 'pine-south-trunk', shape: 'circle', x: 13, y: 36, radius: 0.72, blocking: true },
    { id: 'maple-south-trunk', shape: 'circle', x: 36, y: 36, radius: 0.7, blocking: true },
    { id: 'maple-north-trunk', shape: 'circle', x: 15, y: 4.2, radius: 0.58, blocking: true },
    { id: 'pine-northeast-trunk', shape: 'circle', x: 43, y: 8, radius: 0.62, blocking: true },
    { id: 'pine-east-trunk', shape: 'circle', x: 43.5, y: 25, radius: 0.62, blocking: true },
    { id: 'maple-southwest-trunk', shape: 'circle', x: 5.2, y: 37, radius: 0.62, blocking: true },
    {
      id: 'notice-base',
      shape: 'rectangle',
      x: 25.4,
      y: 18.4,
      width: 0.8,
      height: 0.45,
      blocking: true,
    },
    { id: 'lamp-base', shape: 'circle', x: 33, y: 18.4, radius: 0.24, blocking: true },
    {
      id: 'bench-base',
      shape: 'rectangle',
      x: 22.4,
      y: 22.1,
      width: 2,
      height: 0.8,
      blocking: true,
    },
    {
      id: 'workbench-base',
      shape: 'rectangle',
      x: 30.4,
      y: 22.1,
      width: 2.2,
      height: 0.9,
      blocking: true,
    },
    { id: 'planter-base', shape: 'circle', x: 26.6, y: 15.2, radius: 0.4, blocking: true },
    { id: 'square-planter-base', shape: 'circle', x: 34, y: 22.2, radius: 0.4, blocking: true },
    { id: 'rock-west-base', shape: 'circle', x: 12, y: 17, radius: 0.5, blocking: true },
    { id: 'rock-river-base', shape: 'circle', x: 34, y: 27.2, radius: 0.46, blocking: true },
    { id: 'rock-northwest-base', shape: 'circle', x: 4.5, y: 11, radius: 0.44, blocking: true },
    { id: 'rock-east-base', shape: 'circle', x: 43, y: 12, radius: 0.44, blocking: true },
    { id: 'rock-southwest-base', shape: 'circle', x: 3.5, y: 27.2, radius: 0.46, blocking: true },
    {
      id: 'collision-fence-west',
      shape: 'rectangle',
      x: 13.6,
      y: 13.65,
      width: 3.8,
      height: 0.55,
      blocking: true,
    },
    {
      id: 'collision-fence-east',
      shape: 'rectangle',
      x: 28.6,
      y: 13.25,
      width: 4,
      height: 0.55,
      blocking: true,
    },
    {
      id: 'collision-fence-garden',
      shape: 'rectangle',
      x: 11,
      y: 25,
      width: 4,
      height: 0.55,
      blocking: true,
    },
    {
      id: 'collision-fence-east-road',
      shape: 'rectangle',
      x: 36.5,
      y: 21.65,
      width: 4,
      height: 0.55,
      blocking: true,
    },
  ],
  objects: [
    {
      id: 'slice-cottage',
      assetId: 'cottage-amber',
      kind: 'building',
      x: 20,
      y: 12.75,
      scale: 1.24,
    },
    { id: 'pine-west', assetId: 'tree-pine', kind: 'tree', x: 6.5, y: 7.5, scale: 1.7 },
    { id: 'maple-west', assetId: 'tree-maple', kind: 'tree', x: 10.5, y: 14, scale: 1.55 },
    { id: 'pine-north', assetId: 'tree-pine', kind: 'tree', x: 36, y: 6.5, scale: 1.62 },
    { id: 'maple-east', assetId: 'tree-maple', kind: 'tree', x: 41.5, y: 16, scale: 1.55 },
    { id: 'pine-south', assetId: 'tree-pine', kind: 'tree', x: 13, y: 36, scale: 1.68 },
    { id: 'maple-south', assetId: 'tree-maple', kind: 'tree', x: 36, y: 36, scale: 1.62 },
    { id: 'maple-north', assetId: 'tree-maple', kind: 'tree', x: 15, y: 4.2, scale: 1.45 },
    { id: 'pine-northeast', assetId: 'tree-pine', kind: 'tree', x: 43, y: 8, scale: 1.48 },
    { id: 'pine-east', assetId: 'tree-pine', kind: 'tree', x: 43.5, y: 25, scale: 1.5 },
    {
      id: 'maple-southwest',
      assetId: 'tree-maple',
      kind: 'tree',
      x: 5.2,
      y: 37,
      scale: 1.52,
    },
    { id: 'notice', assetId: 'notice-board', kind: 'sign', x: 25.8, y: 19, scale: 0.9 },
    { id: 'lamp', assetId: 'lamp-star', kind: 'lamp', x: 33, y: 18.4, scale: 0.88 },
    { id: 'fence-west', assetId: 'fence-willow', kind: 'fence', x: 15.5, y: 14.2, scale: 1 },
    { id: 'fence-east', assetId: 'fence-willow', kind: 'fence', x: 30.6, y: 13.8, scale: 1.04 },
    { id: 'fence-garden', assetId: 'fence-willow', kind: 'fence', x: 13, y: 25.5, scale: 1.04 },
    {
      id: 'fence-east-road',
      assetId: 'fence-willow',
      kind: 'fence',
      x: 38.5,
      y: 22.2,
      scale: 1.02,
    },
    {
      id: 'bench',
      assetId: 'phase7-dev-willow-chair',
      kind: 'furniture',
      x: 23.4,
      y: 22.95,
      scale: 0.88,
    },
    {
      id: 'workbench',
      assetId: 'phase7-crafting-workbench-marker',
      kind: 'crafting_station',
      x: 31.5,
      y: 23.05,
      scale: 0.86,
    },
    {
      id: 'planter',
      assetId: 'phase7-dev-round-leaf-planter',
      kind: 'furniture',
      x: 26.6,
      y: 15.2,
      scale: 0.72,
    },
    {
      id: 'square-planter',
      assetId: 'phase7-dev-round-leaf-planter',
      kind: 'furniture',
      x: 34,
      y: 22.2,
      scale: 0.68,
    },
    { id: 'rock-west', assetId: 'rock-moss', kind: 'rock', x: 12, y: 17, scale: 0.74 },
    { id: 'rock-river', assetId: 'rock-moss', kind: 'rock', x: 34, y: 27.2, scale: 0.7 },
    { id: 'rock-northwest', assetId: 'rock-moss', kind: 'rock', x: 4.5, y: 11, scale: 0.66 },
    { id: 'rock-east', assetId: 'rock-moss', kind: 'rock', x: 43, y: 12, scale: 0.64 },
    {
      id: 'rock-southwest',
      assetId: 'rock-moss',
      kind: 'rock',
      x: 3.5,
      y: 27.2,
      scale: 0.68,
    },
    { id: 'bush-cottage-a', assetId: 'bush-round', kind: 'bush', x: 24.7, y: 13.8, scale: 0.7 },
    { id: 'bush-cottage-b', assetId: 'bush-round', kind: 'bush', x: 16.6, y: 13.4, scale: 0.72 },
    { id: 'bush-west-grove', assetId: 'bush-round', kind: 'bush', x: 8.2, y: 9.5, scale: 0.74 },
    { id: 'bush-west-gate', assetId: 'bush-round', kind: 'bush', x: 5.2, y: 16.4, scale: 0.68 },
    { id: 'bush-west-orchard', assetId: 'bush-round', kind: 'bush', x: 6.3, y: 23, scale: 0.7 },
    { id: 'bush-north-grove', assetId: 'bush-round', kind: 'bush', x: 16.8, y: 5.4, scale: 0.7 },
    { id: 'bush-east-grove', assetId: 'bush-round', kind: 'bush', x: 40.2, y: 8.8, scale: 0.72 },
    { id: 'bush-east-edge', assetId: 'bush-round', kind: 'bush', x: 44, y: 11, scale: 0.66 },
    { id: 'bush-east-road', assetId: 'bush-round', kind: 'bush', x: 41.5, y: 22.6, scale: 0.7 },
    { id: 'bush-river-west', assetId: 'bush-round', kind: 'bush', x: 6.4, y: 27.2, scale: 0.7 },
    { id: 'bush-river-east', assetId: 'bush-round', kind: 'bush', x: 41, y: 27.6, scale: 0.7 },
    { id: 'bush-southwest', assetId: 'bush-round', kind: 'bush', x: 8.2, y: 33.3, scale: 0.7 },
    { id: 'bush-south', assetId: 'bush-round', kind: 'bush', x: 32, y: 35, scale: 0.7 },
    { id: 'bush-southeast', assetId: 'bush-round', kind: 'bush', x: 40, y: 34, scale: 0.7 },
    {
      id: 'flowers-cottage',
      assetId: 'flowers-moon',
      kind: 'flowers',
      x: 23.8,
      y: 14.4,
      scale: 0.72,
    },
    {
      id: 'flowers-square-west',
      assetId: 'flowers-moon',
      kind: 'flowers',
      x: 22.8,
      y: 17.2,
      scale: 0.64,
    },
    {
      id: 'flowers-square-east',
      assetId: 'flowers-moon',
      kind: 'flowers',
      x: 34.2,
      y: 20.5,
      scale: 0.64,
    },
    { id: 'flowers-west', assetId: 'flowers-moon', kind: 'flowers', x: 16.2, y: 22.2, scale: 0.62 },
    {
      id: 'flowers-west-gate',
      assetId: 'flowers-moon',
      kind: 'flowers',
      x: 6.2,
      y: 20.8,
      scale: 0.58,
    },
    { id: 'flowers-east', assetId: 'flowers-moon', kind: 'flowers', x: 38, y: 21.4, scale: 0.62 },
    {
      id: 'flowers-east-gate',
      assetId: 'flowers-moon',
      kind: 'flowers',
      x: 43,
      y: 18,
      scale: 0.58,
    },
    {
      id: 'flowers-river',
      assetId: 'flowers-moon',
      kind: 'flowers',
      x: 33,
      y: 27.2,
      scale: 0.64,
    },
    {
      id: 'flowers-river-east',
      assetId: 'flowers-moon',
      kind: 'flowers',
      x: 38,
      y: 27.8,
      scale: 0.6,
    },
    {
      id: 'flowers-orchard',
      assetId: 'flowers-moon',
      kind: 'flowers',
      x: 10.2,
      y: 24.8,
      scale: 0.6,
    },
    { id: 'flowers-north', assetId: 'flowers-moon', kind: 'flowers', x: 20, y: 6, scale: 0.56 },
    { id: 'flowers-south', assetId: 'flowers-moon', kind: 'flowers', x: 25, y: 35.2, scale: 0.58 },
    {
      id: 'flowers-southeast',
      assetId: 'flowers-moon',
      kind: 'flowers',
      x: 42,
      y: 34.5,
      scale: 0.56,
    },
  ],
  interactions: [
    {
      id: 'slice-notice-interaction',
      type: 'notice',
      x: 26,
      y: 19.6,
      range: 2.2,
      title: 'Lantern Square Welcome Board',
      content:
        'The garden quarter gathers the cottage green, workshop, orchard, and river bridges into one handcrafted village square.',
    },
    {
      id: 'slice-cottage-entrance',
      type: 'home_entrance',
      x: 22.8,
      y: 12.7,
      range: 1.35,
      title: 'Enter Amber Cottage',
      content: 'Enter the separate local V3 cottage interior without leaving the game.',
      homeTemplateSlug: 'amber-cottage-interior',
    },
    {
      id: 'slice-workbench-interaction',
      type: 'crafting_station',
      x: 31.5,
      y: 23.9,
      range: 1.25,
      title: 'Artisan Workbench',
      content: 'A collision-safe local workstation fixture.',
      stationType: 'crafting_workbench',
    },
  ],
  exits: disabledExits(48, 40, 'slice-exit'),
} as const satisfies MapManifestInput;

const rawProductionSliceV3 = rawProductionSliceV3Composition;

const rawAmberCottageInteriorV3 = {
  schemaVersion: 1,
  id: 'lantern-square',
  slug: 'lantern-square',
  name: 'Amber Cottage Interior',
  description:
    'A handcrafted one-room starter cottage: sleeping nook, hearth kitchen, dining table, and a front door, framed as a two-wall isometric cutaway.',
  version: 1215,
  developmentArt: {
    temporary: true,
    label: 'Phase 12F-A.1R RESCUE interior · local · unpublished',
  },
  background: { palette: 'hearth' },
  width: 16,
  height: 12,
  tileWidth: 96,
  tileHeight: 48,
  projectionOrigin: { x: 768, y: 240 },
  cameraBounds: { minX: 0, minY: 0, maxX: 1_600, maxY: 1_000 },
  safeSaveBounds: { minX: 0.5, minY: 0.5, maxX: 15.5, maxY: 11.5 },
  defaultSpawnId: 'interior-door-spawn',
  spawns: [
    {
      id: 'interior-door-spawn',
      x: 8,
      y: 10,
      facingDirection: 'north',
      purpose: 'default',
      enabled: true,
    },
  ],
  assets: [...PRODUCTION_SLICE_V3_INTERIOR_ASSET_KEYS],
  terrain: [
    { id: 'interior-floor', terrain: 'plaza', x: 0, y: 0, width: 16, height: 12, order: 0 },
  ],
  collisions: [
    // One continuous exterior perimeter. North and west are the two shown
    // cutaway walls; east and south are hidden but still block. The south wall
    // leaves a single doorway gap (x 6.8 → 9.2) aligned with the front door.
    { id: 'wall-north', shape: 'rectangle', x: 0, y: 0, width: 16, height: 0.7, blocking: true },
    { id: 'wall-west', shape: 'rectangle', x: 0, y: 0, width: 0.7, height: 12, blocking: true },
    { id: 'wall-east', shape: 'rectangle', x: 15.3, y: 0, width: 0.7, height: 12, blocking: true },
    {
      id: 'wall-south-west',
      shape: 'rectangle',
      x: 0,
      y: 11.3,
      width: 6.8,
      height: 0.7,
      blocking: true,
    },
    {
      id: 'wall-south-east',
      shape: 'rectangle',
      x: 9.2,
      y: 11.3,
      width: 6.8,
      height: 0.7,
      blocking: true,
    },
    // Sleeping nook (back-left): bed head against the north wall.
    {
      id: 'bed-footprint',
      shape: 'rectangle',
      x: 1.6,
      y: 1.3,
      width: 3.25,
      height: 2,
      blocking: true,
    },
    {
      id: 'bedside-footprint',
      shape: 'rectangle',
      x: 4.95,
      y: 1.35,
      width: 1,
      height: 0.9,
      blocking: true,
    },
    // Storage against the west wall.
    {
      id: 'wardrobe-footprint',
      shape: 'rectangle',
      x: 0.55,
      y: 4.6,
      width: 1.4,
      height: 1.2,
      blocking: true,
    },
    {
      id: 'chest-footprint',
      shape: 'rectangle',
      x: 0.55,
      y: 7.8,
      width: 1.5,
      height: 1,
      blocking: true,
    },
    // Hearth kitchen (back-right) against the north wall.
    {
      id: 'fireplace-footprint',
      shape: 'rectangle',
      x: 10.7,
      y: 0.55,
      width: 2.2,
      height: 1.2,
      blocking: true,
    },
    {
      id: 'cooking-footprint',
      shape: 'rectangle',
      x: 13,
      y: 1.05,
      width: 2.1,
      height: 1.3,
      blocking: true,
    },
    // Dining and living (centre).
    {
      id: 'table-footprint',
      shape: 'rectangle',
      x: 6.6,
      y: 5.35,
      width: 2.6,
      height: 1.7,
      blocking: true,
    },
    { id: 'chair-west-footprint', shape: 'circle', x: 6.1, y: 6.2, radius: 0.42, blocking: true },
    { id: 'chair-east-footprint', shape: 'circle', x: 9.7, y: 6.2, radius: 0.42, blocking: true },
    {
      id: 'reading-chair-footprint',
      shape: 'circle',
      x: 3.6,
      y: 8.8,
      radius: 0.43,
      blocking: true,
    },
    { id: 'lamp-footprint', shape: 'circle', x: 11.2, y: 5.6, radius: 0.24, blocking: true },
    { id: 'plant-footprint', shape: 'circle', x: 11.5, y: 9.2, radius: 0.44, blocking: true },
  ],
  objects: [
    // Two-wall cutaway. The wall raster is authored on the west ("/") axis, so
    // north-wall panels carry rotation 90 (mirrored to "\") and west-wall panels
    // stay native. Panels overlap into two continuous, connected back walls that
    // meet at the top corner; the east and south walls are cut away for legibility.
    {
      id: 'wall-north-a',
      assetId: 'v3.interior.wall',
      kind: 'building',
      x: 2,
      y: 0.75,
      scale: 1,
      rotation: 90,
    },
    {
      id: 'wall-north-b',
      assetId: 'v3.interior.wall',
      kind: 'building',
      x: 5,
      y: 0.75,
      scale: 1,
      rotation: 90,
    },
    {
      id: 'wall-north-c',
      assetId: 'v3.interior.wall',
      kind: 'building',
      x: 8,
      y: 0.75,
      scale: 1,
      rotation: 90,
    },
    {
      id: 'wall-north-d',
      assetId: 'v3.interior.wall',
      kind: 'building',
      x: 11,
      y: 0.75,
      scale: 1,
      rotation: 90,
    },
    {
      id: 'wall-north-e',
      assetId: 'v3.interior.wall',
      kind: 'building',
      x: 14,
      y: 0.75,
      scale: 1,
      rotation: 90,
    },
    {
      id: 'wall-west-a',
      assetId: 'v3.interior.wall',
      kind: 'building',
      x: 0.75,
      y: 2.5,
      scale: 1,
    },
    {
      id: 'wall-west-b',
      assetId: 'v3.interior.wall',
      kind: 'building',
      x: 0.75,
      y: 5.5,
      scale: 1,
    },
    {
      id: 'wall-west-c',
      assetId: 'v3.interior.wall',
      kind: 'building',
      x: 0.75,
      y: 8.5,
      scale: 1,
    },
    {
      id: 'wall-west-d',
      assetId: 'v3.interior.wall',
      kind: 'building',
      x: 0.75,
      y: 10.8,
      scale: 1,
    },
    // Sleeping nook (back-left).
    { id: 'bed', assetId: 'v3.interior.bed', kind: 'furniture', x: 3.15, y: 2.6, scale: 1 },
    {
      id: 'bedside',
      assetId: 'v3.interior.bedside-table',
      kind: 'furniture',
      x: 5.45,
      y: 1.9,
      scale: 0.8,
    },
    {
      id: 'window-west',
      assetId: 'v3.interior.window',
      kind: 'furniture',
      x: 6,
      y: 0.9,
      scale: 0.6,
    },
    // Storage against the west wall.
    {
      id: 'wardrobe',
      assetId: 'v3.interior.wardrobe',
      kind: 'furniture',
      x: 1.05,
      y: 5.2,
      scale: 0.92,
    },
    {
      id: 'storage-chest',
      assetId: 'v3.interior.chest',
      kind: 'furniture',
      x: 1.1,
      y: 8.3,
      scale: 0.86,
    },
    // Hearth kitchen (back-right) against the north wall.
    {
      id: 'fireplace',
      assetId: 'v3.interior.fireplace',
      kind: 'cooking_station',
      x: 11.8,
      y: 1,
      scale: 0.92,
    },
    {
      id: 'cooking-counter',
      assetId: 'v3.interior.cooking-counter',
      kind: 'cooking_station',
      x: 14,
      y: 1.7,
      scale: 0.9,
    },
    {
      id: 'window-east',
      assetId: 'v3.interior.window',
      kind: 'furniture',
      x: 9.5,
      y: 0.9,
      scale: 0.6,
    },
    {
      id: 'wall-art',
      assetId: 'v3.interior.wall-art',
      kind: 'sign',
      x: 7.75,
      y: 0.85,
      scale: 0.54,
    },
    // Dining and living (centre) with the rug grounding the table.
    { id: 'rug', assetId: 'v3.interior.rug', kind: 'flowers', x: 7.9, y: 6.4, scale: 1.2 },
    {
      id: 'dining-table',
      assetId: 'v3.interior.dining-table',
      kind: 'furniture',
      x: 7.9,
      y: 6.2,
      scale: 0.94,
    },
    {
      id: 'chair-west',
      assetId: 'v3.interior.dining-chair',
      kind: 'furniture',
      x: 6.1,
      y: 6.2,
      scale: 0.82,
    },
    {
      id: 'chair-east',
      assetId: 'v3.interior.dining-chair',
      kind: 'furniture',
      x: 9.7,
      y: 6.2,
      scale: 0.82,
    },
    {
      id: 'floor-lamp',
      assetId: 'v3.interior.floor-lamp',
      kind: 'lamp',
      x: 11.2,
      y: 5.6,
      scale: 0.76,
    },
    // Reading nook (front-left).
    {
      id: 'reading-chair',
      assetId: 'v3.interior.dining-chair',
      kind: 'furniture',
      x: 3.6,
      y: 8.8,
      scale: 0.84,
    },
    // Entry (front-centre) with the door on the front wall and a decorative plant.
    {
      id: 'houseplant',
      assetId: 'v3.interior.houseplant',
      kind: 'furniture',
      x: 11.5,
      y: 9.2,
      scale: 0.82,
    },
    {
      id: 'entry-rug',
      assetId: 'v3.interior.rug',
      kind: 'flowers',
      x: 8,
      y: 10.3,
      scale: 0.8,
    },
    {
      id: 'interior-door',
      assetId: 'v3.interior.door',
      kind: 'home_entrance',
      x: 8,
      y: 11.3,
      scale: 0.82,
    },
  ],
  interactions: [
    {
      id: 'interior-exit',
      type: 'home_entrance',
      x: 8,
      y: 10.7,
      range: 1.4,
      title: 'Exit Amber Cottage',
      content: 'Return outside to the preserved cottage-door position.',
      homeTemplateSlug: 'amber-cottage-interior',
    },
  ],
  exits: disabledExits(16, 12, 'interior-exit'),
} as const satisfies MapManifestInput;

export const PRODUCTION_SLICE_V3_MANIFEST = validateMapManifest(
  rawProductionSliceV3,
  productionSliceAssetCatalog,
);

export const PRODUCTION_SLICE_V3_INTERIOR_MANIFEST = validateMapManifest(
  rawAmberCottageInteriorV3,
  productionSliceAssetCatalog,
);

export interface V3LocationInstanceIdentity {
  readonly locationId: string;
  readonly instanceId: string;
  readonly canonicalMapId: MapId;
  readonly instanceKind: 'shared_outdoor' | 'private_interior';
  readonly persistence: 'local_unpublished';
}

export interface V3OutdoorCompositionZone {
  readonly id: string;
  readonly purpose: 'canonical_landmarks' | 'approach' | 'scenic_expansion';
  readonly bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
}

function outdoorIdentity(
  mapId: MapId,
  instanceId = `phase12f-a1-v3.exterior.${mapId}`,
): V3LocationInstanceIdentity {
  return Object.freeze({
    locationId: mapId,
    instanceId,
    canonicalMapId: mapId,
    instanceKind: 'shared_outdoor',
    persistence: PRODUCTION_SLICE_V3_LIFECYCLE,
  });
}

function compositionZones(profile: V3LocationSizeProfile): readonly V3OutdoorCompositionZone[] {
  const { logical, contentBounds, safeMargin } = profile;
  return Object.freeze([
    Object.freeze({
      id: `${profile.key}-canonical-landmarks`,
      purpose: 'canonical_landmarks' as const,
      bounds: contentBounds,
    }),
    Object.freeze({
      id: `${profile.key}-north-approach`,
      purpose: 'approach' as const,
      bounds: {
        minX: safeMargin,
        minY: safeMargin,
        maxX: logical.width - safeMargin,
        maxY: contentBounds.minY,
      },
    }),
    Object.freeze({
      id: `${profile.key}-east-expansion`,
      purpose: 'scenic_expansion' as const,
      bounds: {
        minX: contentBounds.maxX,
        minY: contentBounds.minY,
        maxX: logical.width - safeMargin,
        maxY: contentBounds.maxY,
      },
    }),
    Object.freeze({
      id: `${profile.key}-south-expansion`,
      purpose: 'scenic_expansion' as const,
      bounds: {
        minX: safeMargin,
        minY: contentBounds.maxY,
        maxX: logical.width - safeMargin,
        maxY: logical.height - safeMargin,
      },
    }),
    Object.freeze({
      id: `${profile.key}-west-expansion`,
      purpose: 'scenic_expansion' as const,
      bounds: {
        minX: safeMargin,
        minY: contentBounds.minY,
        maxX: contentBounds.minX,
        maxY: contentBounds.maxY,
      },
    }),
  ]);
}

function expandedCanonicalManifest(mapId: MapId, version: number) {
  const source = canonicalManifest(mapId);
  const profile = V3_OUTDOOR_LOCATION_SIZE_PROFILES[mapId];
  const centered = composeExpandedOutdoorManifest(source, profile, {
    version,
    name: `${source.name} V3 Expansion`,
    description: `${source.description} Its canonical landmarks are centered inside a local three-by-three V3 canvas.`,
    approachDirections: source.exits.filter((exit) => exit.enabled).map((exit) => exit.direction),
    exitPrefix: `v3-${mapId}-exit`,
  });
  const scenery = scenicExpansionComposition(mapId, profile);
  return validateMapManifest(
    {
      ...centered,
      terrain: [...centered.terrain, ...scenery.terrain],
      collisions: [...centered.collisions, ...scenery.collisions],
      objects: [...centered.objects, ...scenery.objects],
    },
    productionSliceAssetCatalog,
  );
}

const lanternSquareV3Manifest = expandedCanonicalManifest('lantern-square', 1210);
const moonpetalMeadowV3Manifest = expandedCanonicalManifest('moonpetal-meadow', 1206);
const brooklightCrossingV3Manifest = expandedCanonicalManifest('brooklight-crossing', 1207);
const hearthfieldRoadV3Manifest = expandedCanonicalManifest('hearthfield-road', 1208);
const whisperpineGateV3Manifest = expandedCanonicalManifest('whisperpine-gate', 1209);

export const V3_OUTDOOR_LOCATION_MANIFEST_CATALOG = Object.freeze({
  'lantern-square': Object.freeze({
    identity: outdoorIdentity('lantern-square'),
    profile: V3_OUTDOOR_LOCATION_SIZE_PROFILES['lantern-square'],
    manifest: lanternSquareV3Manifest,
    zones: compositionZones(V3_OUTDOOR_LOCATION_SIZE_PROFILES['lantern-square']),
  }),
  'moonpetal-meadow': Object.freeze({
    identity: outdoorIdentity('moonpetal-meadow'),
    profile: V3_OUTDOOR_LOCATION_SIZE_PROFILES['moonpetal-meadow'],
    manifest: moonpetalMeadowV3Manifest,
    zones: compositionZones(V3_OUTDOOR_LOCATION_SIZE_PROFILES['moonpetal-meadow']),
  }),
  'brooklight-crossing': Object.freeze({
    identity: outdoorIdentity('brooklight-crossing'),
    profile: V3_OUTDOOR_LOCATION_SIZE_PROFILES['brooklight-crossing'],
    manifest: brooklightCrossingV3Manifest,
    zones: compositionZones(V3_OUTDOOR_LOCATION_SIZE_PROFILES['brooklight-crossing']),
  }),
  'hearthfield-road': Object.freeze({
    identity: outdoorIdentity('hearthfield-road'),
    profile: V3_OUTDOOR_LOCATION_SIZE_PROFILES['hearthfield-road'],
    manifest: hearthfieldRoadV3Manifest,
    zones: compositionZones(V3_OUTDOOR_LOCATION_SIZE_PROFILES['hearthfield-road']),
  }),
  'whisperpine-gate': Object.freeze({
    identity: outdoorIdentity('whisperpine-gate'),
    profile: V3_OUTDOOR_LOCATION_SIZE_PROFILES['whisperpine-gate'],
    manifest: whisperpineGateV3Manifest,
    zones: compositionZones(V3_OUTDOOR_LOCATION_SIZE_PROFILES['whisperpine-gate']),
  }),
});

export const V3_OUTDOOR_LOCATION_MANIFESTS = Object.freeze(
  MAP_IDS.map((mapId) => V3_OUTDOOR_LOCATION_MANIFEST_CATALOG[mapId].manifest),
);

export const PRODUCTION_SLICE_V3 = Object.freeze({
  id: PRODUCTION_SLICE_V3_ID,
  lifecycle: PRODUCTION_SLICE_V3_LIFECYCLE,
  manifest: PRODUCTION_SLICE_V3_MANIFEST,
  exterior: Object.freeze({
    id: PRODUCTION_SLICE_V3_EXTERIOR_ID,
    identity: outdoorIdentity('lantern-square', PRODUCTION_SLICE_V3_EXTERIOR_ID),
    manifest: PRODUCTION_SLICE_V3_MANIFEST,
  }),
  interior: Object.freeze({
    id: PRODUCTION_SLICE_V3_INTERIOR_ID,
    identity: Object.freeze({
      locationId: PRODUCTION_SLICE_V3_INTERIOR_ID,
      instanceId: 'phase12f-a1-v3.private-interior.amber-cottage',
      canonicalMapId: 'lantern-square',
      instanceKind: 'private_interior',
      persistence: PRODUCTION_SLICE_V3_LIFECYCLE,
    } satisfies V3LocationInstanceIdentity),
    manifest: PRODUCTION_SLICE_V3_INTERIOR_MANIFEST,
  }),
  ownerReviewRequired: true,
  activated: false,
  published: false,
});
