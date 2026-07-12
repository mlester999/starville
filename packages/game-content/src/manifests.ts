import {
  MAP_IDS,
  rawLanternSquareManifest,
  validateWorldManifestGraph,
  type MapDirection,
  type MapId,
  type MapManifest,
} from '@starville/game-core';

import { WORLD_ASSET_CATALOG } from './assets';

const COMMON_MAP_FIELDS = {
  schemaVersion: 1,
  version: 1,
  developmentArt: {
    temporary: true,
    label: 'Phase 6 procedural development art',
  },
  width: 20,
  height: 18,
  tileWidth: 96,
  tileHeight: 48,
  projectionOrigin: { x: 960, y: 96 },
  cameraBounds: { minX: 0, minY: 0, maxX: 1920, maxY: 1056 },
  safeSaveBounds: { minX: 0.75, minY: 0.75, maxX: 19.25, maxY: 17.25 },
  defaultSpawnId: 'default',
} as const;

const EDGE_TRIGGERS = {
  north: { x: 8.5, y: 0.75, width: 3, height: 1 },
  east: { x: 18.25, y: 7.75, width: 1, height: 2.5 },
  south: { x: 8.5, y: 16.25, width: 3, height: 1 },
  west: { x: 0.75, y: 7.75, width: 1, height: 2.5 },
} as const;

function disabledExit(direction: MapDirection) {
  return {
    id: `exit-${direction}`,
    direction,
    trigger: EDGE_TRIGGERS[direction],
    destinationMapId: null,
    destinationSpawnId: null,
    enabled: false,
    transitionLabel: null,
  } as const;
}

function activeReturnExit(
  direction: MapDirection,
  destinationSpawnId: 'from-north' | 'from-east' | 'from-south' | 'from-west',
) {
  return {
    id: `exit-${direction}`,
    direction,
    trigger: EDGE_TRIGGERS[direction],
    destinationMapId: 'lantern-square',
    destinationSpawnId,
    enabled: true,
    transitionLabel: 'Lantern Square',
  } as const;
}

export const rawMoonpetalMeadowManifest = {
  ...COMMON_MAP_FIELDS,
  id: 'moonpetal-meadow',
  slug: 'moonpetal-meadow',
  name: 'Moonpetal Meadow',
  description: 'A moonlit flower meadow gathered around a quiet stone marker and pond.',
  background: { palette: 'meadow' },
  spawns: [
    {
      id: 'default',
      x: 10,
      y: 10,
      facingDirection: 'south',
      purpose: 'default',
      enabled: true,
    },
    {
      id: 'from-south',
      x: 10,
      y: 14.5,
      facingDirection: 'north',
      purpose: 'transition-entry',
      enabled: true,
    },
  ],
  assets: ['flowers-moon', 'moonstone-marker', 'tree-maple', 'bush-round', 'closed-route-marker'],
  terrain: [
    { id: 'terrain-grass', terrain: 'grass', x: 0, y: 0, width: 20, height: 18, order: 0 },
    { id: 'south-meadow-path', terrain: 'path', x: 9, y: 7, width: 3, height: 11, order: 2 },
    { id: 'moonstone-clearing', terrain: 'plaza', x: 11, y: 6, width: 5, height: 5, order: 1 },
    { id: 'meadow-pond', terrain: 'water', x: 2, y: 3, width: 4, height: 3, order: 3 },
  ],
  collisions: [
    { id: 'pond-block', shape: 'rectangle', x: 2, y: 3, width: 4, height: 3, blocking: true },
    { id: 'moonstone-base', shape: 'circle', x: 13.5, y: 8, radius: 0.5, blocking: true },
    {
      id: 'north-route-block',
      shape: 'rectangle',
      x: 8.7,
      y: 1,
      width: 2.6,
      height: 0.5,
      blocking: true,
    },
    {
      id: 'east-route-block',
      shape: 'rectangle',
      x: 18,
      y: 7.8,
      width: 0.5,
      height: 2.4,
      blocking: true,
    },
    {
      id: 'west-route-block',
      shape: 'rectangle',
      x: 1.5,
      y: 7.8,
      width: 0.5,
      height: 2.4,
      blocking: true,
    },
    { id: 'maple-base', shape: 'circle', x: 6.5, y: 12.5, radius: 0.34, blocking: true },
  ],
  objects: [
    { id: 'moonstone', assetId: 'moonstone-marker', kind: 'rock', x: 13.5, y: 8, scale: 1 },
    { id: 'meadow-flowers-a', assetId: 'flowers-moon', kind: 'flowers', x: 7, y: 5, scale: 1 },
    {
      id: 'meadow-flowers-b',
      assetId: 'flowers-moon',
      kind: 'flowers',
      x: 15.5,
      y: 12,
      scale: 0.9,
    },
    { id: 'meadow-maple', assetId: 'tree-maple', kind: 'tree', x: 6.5, y: 12.5, scale: 0.95 },
    { id: 'meadow-bush', assetId: 'bush-round', kind: 'bush', x: 16.5, y: 5.5, scale: 1 },
    {
      id: 'north-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 10,
      y: 1.5,
      scale: 0.8,
    },
    {
      id: 'east-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 18,
      y: 9,
      scale: 0.7,
    },
    {
      id: 'west-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 2,
      y: 9,
      scale: 0.7,
    },
  ],
  interactions: [
    {
      id: 'moonstone-notice',
      type: 'notice',
      x: 13.5,
      y: 8.9,
      range: 1.65,
      title: 'Moonstone Marker',
      content: 'Moonpetals gather here whenever the meadow catches the evening light.',
    },
  ],
  exits: [
    disabledExit('north'),
    disabledExit('east'),
    activeReturnExit('south', 'from-north'),
    disabledExit('west'),
  ],
} as const;

export const rawBrooklightCrossingManifest = {
  ...COMMON_MAP_FIELDS,
  id: 'brooklight-crossing',
  slug: 'brooklight-crossing',
  name: 'Brooklight Crossing',
  description: 'A bright riverside crossing joined by a broad bridge and a single western road.',
  background: { palette: 'brook' },
  spawns: [
    {
      id: 'default',
      x: 5,
      y: 9.5,
      facingDirection: 'east',
      purpose: 'default',
      enabled: true,
    },
    {
      id: 'from-west',
      x: 3,
      y: 9.5,
      facingDirection: 'east',
      purpose: 'transition-entry',
      enabled: true,
    },
  ],
  assets: ['brooklight-sign', 'lamp-star', 'rock-moss', 'bush-round', 'closed-route-marker'],
  terrain: [
    { id: 'terrain-grass', terrain: 'grass', x: 0, y: 0, width: 20, height: 18, order: 0 },
    { id: 'river', terrain: 'water', x: 8, y: 0, width: 4, height: 18, order: 2 },
    { id: 'crossing-bridge', terrain: 'bridge', x: 8, y: 8, width: 4, height: 3, order: 4 },
    { id: 'west-crossing-path', terrain: 'path', x: 0, y: 8, width: 8, height: 3, order: 3 },
  ],
  collisions: [
    {
      id: 'river-north-block',
      shape: 'rectangle',
      x: 8,
      y: 0,
      width: 4,
      height: 8,
      blocking: true,
    },
    {
      id: 'river-south-block',
      shape: 'rectangle',
      x: 8,
      y: 11,
      width: 4,
      height: 7,
      blocking: true,
    },
    { id: 'bridge-lamp-base', shape: 'circle', x: 10.8, y: 9.5, radius: 0.23, blocking: true },
    {
      id: 'east-route-block',
      shape: 'rectangle',
      x: 17.8,
      y: 7.8,
      width: 0.5,
      height: 2.4,
      blocking: true,
    },
    { id: 'crossing-rock-base', shape: 'circle', x: 5.5, y: 13.5, radius: 0.5, blocking: true },
  ],
  objects: [
    { id: 'crossing-sign', assetId: 'brooklight-sign', kind: 'sign', x: 6, y: 7.2, scale: 1 },
    { id: 'bridge-lamp', assetId: 'lamp-star', kind: 'lamp', x: 10.8, y: 9.5, scale: 1 },
    { id: 'crossing-rock', assetId: 'rock-moss', kind: 'rock', x: 5.5, y: 13.5, scale: 0.9 },
    { id: 'crossing-bush', assetId: 'bush-round', kind: 'bush', x: 3.5, y: 5, scale: 1 },
    {
      id: 'east-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 17.8,
      y: 9,
      scale: 0.75,
    },
    {
      id: 'north-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 10,
      y: 1.4,
      scale: 0.75,
    },
    {
      id: 'south-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 10,
      y: 16.6,
      scale: 0.75,
    },
  ],
  interactions: [
    {
      id: 'crossing-notice',
      type: 'notice',
      x: 6,
      y: 7.8,
      range: 1.6,
      title: 'Brooklight Crossing',
      content: 'The western road returns to Lantern Square across the waterlit bridge.',
    },
  ],
  exits: [
    disabledExit('north'),
    disabledExit('east'),
    disabledExit('south'),
    activeReturnExit('west', 'from-east'),
  ],
} as const;

export const rawHearthfieldRoadManifest = {
  ...COMMON_MAP_FIELDS,
  id: 'hearthfield-road',
  slug: 'hearthfield-road',
  name: 'Hearthfield Road',
  description: 'A warm village-edge road bordered by quiet orchard trees, fences, and lanterns.',
  background: { palette: 'hearth' },
  spawns: [
    {
      id: 'default',
      x: 10.5,
      y: 7,
      facingDirection: 'north',
      purpose: 'default',
      enabled: true,
    },
    {
      id: 'from-north',
      x: 10.5,
      y: 3.5,
      facingDirection: 'south',
      purpose: 'transition-entry',
      enabled: true,
    },
  ],
  assets: ['orchard-road-sign', 'tree-maple', 'fence-willow', 'lamp-star', 'closed-route-marker'],
  terrain: [
    { id: 'terrain-grass', terrain: 'grass', x: 0, y: 0, width: 20, height: 18, order: 0 },
    { id: 'hearthfield-road', terrain: 'path', x: 9, y: 0, width: 3, height: 18, order: 2 },
    { id: 'roadside-clearing', terrain: 'plaza', x: 12, y: 5, width: 5, height: 5, order: 1 },
  ],
  collisions: [
    { id: 'orchard-tree-a-base', shape: 'circle', x: 5, y: 6, radius: 0.34, blocking: true },
    { id: 'orchard-tree-b-base', shape: 'circle', x: 15.5, y: 12, radius: 0.34, blocking: true },
    { id: 'road-lamp-base', shape: 'circle', x: 12.8, y: 5.5, radius: 0.23, blocking: true },
    {
      id: 'east-route-block',
      shape: 'rectangle',
      x: 18,
      y: 7.8,
      width: 0.5,
      height: 2.4,
      blocking: true,
    },
    {
      id: 'south-route-block',
      shape: 'rectangle',
      x: 8.7,
      y: 16.5,
      width: 2.6,
      height: 0.5,
      blocking: true,
    },
    {
      id: 'west-route-block',
      shape: 'rectangle',
      x: 1.5,
      y: 7.8,
      width: 0.5,
      height: 2.4,
      blocking: true,
    },
  ],
  objects: [
    { id: 'orchard-sign', assetId: 'orchard-road-sign', kind: 'sign', x: 13.5, y: 7, scale: 1 },
    { id: 'orchard-tree-a', assetId: 'tree-maple', kind: 'tree', x: 5, y: 6, scale: 1 },
    { id: 'orchard-tree-b', assetId: 'tree-maple', kind: 'tree', x: 15.5, y: 12, scale: 0.95 },
    { id: 'road-lamp', assetId: 'lamp-star', kind: 'lamp', x: 12.8, y: 5.5, scale: 1 },
    { id: 'orchard-fence', assetId: 'fence-willow', kind: 'fence', x: 5.5, y: 11.5, scale: 0.9 },
    {
      id: 'east-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 18,
      y: 9,
      scale: 0.75,
    },
    {
      id: 'south-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 10,
      y: 16.5,
      scale: 0.75,
    },
    {
      id: 'west-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 2,
      y: 9,
      scale: 0.75,
    },
  ],
  interactions: [
    {
      id: 'orchard-road-notice',
      type: 'notice',
      x: 13.5,
      y: 7.7,
      range: 1.6,
      title: 'Hearthfield Road',
      content: 'This northern road leads back toward the lanterns at the village center.',
    },
  ],
  exits: [
    activeReturnExit('north', 'from-south'),
    disabledExit('east'),
    disabledExit('south'),
    disabledExit('west'),
  ],
} as const;

export const rawWhisperpineGateManifest = {
  ...COMMON_MAP_FIELDS,
  id: 'whisperpine-gate',
  slug: 'whisperpine-gate',
  name: 'Whisperpine Gate',
  description: 'A shaded woodland gate where an eastern stone path slips between tall pines.',
  background: { palette: 'forest' },
  spawns: [
    {
      id: 'default',
      x: 13,
      y: 9.5,
      facingDirection: 'east',
      purpose: 'default',
      enabled: true,
    },
    {
      id: 'from-east',
      x: 16.5,
      y: 9.5,
      facingDirection: 'west',
      purpose: 'transition-entry',
      enabled: true,
    },
  ],
  assets: ['whisperpine-gate', 'tree-pine', 'rock-moss', 'lamp-star', 'closed-route-marker'],
  terrain: [
    { id: 'terrain-grass', terrain: 'grass', x: 0, y: 0, width: 20, height: 18, order: 0 },
    { id: 'east-forest-path', terrain: 'path', x: 8, y: 8, width: 12, height: 3, order: 2 },
    { id: 'gate-clearing', terrain: 'plaza', x: 8, y: 6, width: 5, height: 7, order: 1 },
  ],
  collisions: [
    { id: 'pine-a-base', shape: 'circle', x: 5, y: 5.5, radius: 0.34, blocking: true },
    { id: 'pine-b-base', shape: 'circle', x: 6.5, y: 13, radius: 0.34, blocking: true },
    { id: 'pine-c-base', shape: 'circle', x: 14.5, y: 5, radius: 0.34, blocking: true },
    { id: 'gate-lamp-base', shape: 'circle', x: 12.5, y: 8.5, radius: 0.23, blocking: true },
    {
      id: 'north-route-block',
      shape: 'rectangle',
      x: 8.7,
      y: 1,
      width: 2.6,
      height: 0.5,
      blocking: true,
    },
    {
      id: 'south-route-block',
      shape: 'rectangle',
      x: 8.7,
      y: 16.5,
      width: 2.6,
      height: 0.5,
      blocking: true,
    },
    {
      id: 'west-route-block',
      shape: 'rectangle',
      x: 1.5,
      y: 7.8,
      width: 0.5,
      height: 2.4,
      blocking: true,
    },
  ],
  objects: [
    { id: 'forest-gate', assetId: 'whisperpine-gate', kind: 'fence', x: 11, y: 7.2, scale: 0.9 },
    { id: 'pine-a', assetId: 'tree-pine', kind: 'tree', x: 5, y: 5.5, scale: 1.05 },
    { id: 'pine-b', assetId: 'tree-pine', kind: 'tree', x: 6.5, y: 13, scale: 1 },
    { id: 'pine-c', assetId: 'tree-pine', kind: 'tree', x: 14.5, y: 5, scale: 0.95 },
    { id: 'forest-rock', assetId: 'rock-moss', kind: 'rock', x: 4, y: 10.5, scale: 0.8 },
    { id: 'gate-lamp', assetId: 'lamp-star', kind: 'lamp', x: 12.5, y: 8.5, scale: 1 },
    {
      id: 'north-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 10,
      y: 1.5,
      scale: 0.75,
    },
    {
      id: 'south-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 10,
      y: 16.5,
      scale: 0.75,
    },
    {
      id: 'west-closed-marker',
      assetId: 'closed-route-marker',
      kind: 'fence',
      x: 2,
      y: 9,
      scale: 0.75,
    },
  ],
  interactions: [
    {
      id: 'forest-gate-notice',
      type: 'notice',
      x: 11,
      y: 7.8,
      range: 1.6,
      title: 'Whisperpine Gate',
      content: 'The eastern path returns to Lantern Square. The deeper forest remains closed.',
    },
  ],
  exits: [
    disabledExit('north'),
    activeReturnExit('east', 'from-west'),
    disabledExit('south'),
    disabledExit('west'),
  ],
} as const;

export const WORLD_MANIFEST_SEEDS = [
  rawLanternSquareManifest,
  rawMoonpetalMeadowManifest,
  rawBrooklightCrossingManifest,
  rawHearthfieldRoadManifest,
  rawWhisperpineGateManifest,
] as const;

export function validateDevelopmentWorldGraph(): readonly MapManifest[] {
  const manifests = validateWorldManifestGraph(WORLD_MANIFEST_SEEDS, WORLD_ASSET_CATALOG);
  const manifestIds = new Set(manifests.map(({ id }) => id));
  if (!MAP_IDS.every((mapId) => manifestIds.has(mapId)) || manifests.length !== MAP_IDS.length) {
    throw new Error('Development world graph must contain every approved Phase 6 map exactly once');
  }
  return manifests;
}

export const WORLD_MANIFESTS = validateDevelopmentWorldGraph();
export const WORLD_MANIFEST_BY_ID: ReadonlyMap<MapId, MapManifest> = new Map(
  WORLD_MANIFESTS.map((manifest) => [manifest.id, manifest]),
);

export function getWorldManifest(mapId: MapId): MapManifest {
  const manifest = WORLD_MANIFEST_BY_ID.get(mapId);
  if (manifest === undefined)
    throw new Error(`Published development map '${mapId}' is unavailable`);
  return manifest;
}
