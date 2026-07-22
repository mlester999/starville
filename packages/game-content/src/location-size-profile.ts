import type { Bounds, MapId, Point } from '@starville/game-core';

import { WORLD_MANIFEST_BY_ID } from './manifests';

export interface V3LocationSizeProfile {
  readonly key: MapId;
  readonly baseline: Readonly<{ width: number; height: number }>;
  readonly logical: Readonly<{ width: number; height: number }>;
  readonly playableBounds: Bounds;
  readonly cameraBounds: Bounds;
  readonly safeMargin: number;
  readonly centeredContentOffset: Point;
  readonly spawnPoints: readonly Point[];
  readonly exitPoints: readonly Point[];
  readonly contentBounds: Bounds;
  readonly navigationBounds: Bounds;
  readonly ambienceBounds: Bounds;
  readonly remotePlayerRelevanceBounds: Bounds;
}

function canonicalManifest(mapId: MapId) {
  const manifest = WORLD_MANIFEST_BY_ID.get(mapId);
  if (manifest === undefined) {
    throw new Error(`V3 location-size profile is missing canonical map '${mapId}'`);
  }
  return manifest;
}

function expandedCanonicalProfile(mapId: MapId): V3LocationSizeProfile {
  const baselineManifest = canonicalManifest(mapId);
  const baselineWidth = baselineManifest.width;
  const baselineHeight = baselineManifest.height;
  const width = baselineWidth * 3;
  const height = baselineHeight * 3;
  const safeMargin = 1;
  const centeredContentOffset = {
    x: (width - baselineWidth) / 2,
    y: (height - baselineHeight) / 2,
  } as const;
  const worldBounds = { minX: 0, minY: 0, maxX: width, maxY: height } as const;
  const playableBounds = {
    minX: safeMargin,
    minY: safeMargin,
    maxX: width - safeMargin,
    maxY: height - safeMargin,
  } as const;
  const contentBounds = {
    minX: centeredContentOffset.x,
    minY: centeredContentOffset.y,
    maxX: centeredContentOffset.x + baselineWidth,
    maxY: centeredContentOffset.y + baselineHeight,
  } as const;

  return Object.freeze({
    key: mapId,
    baseline: Object.freeze({ width: baselineWidth, height: baselineHeight }),
    logical: Object.freeze({ width, height }),
    playableBounds: Object.freeze(playableBounds),
    cameraBounds: Object.freeze({
      minX: baselineManifest.cameraBounds.minX,
      minY: baselineManifest.cameraBounds.minY,
      maxX: baselineManifest.cameraBounds.maxX * 3,
      maxY: baselineManifest.cameraBounds.maxY * 3,
    }),
    safeMargin,
    centeredContentOffset: Object.freeze(centeredContentOffset),
    spawnPoints: Object.freeze(
      baselineManifest.spawns.map((spawn) =>
        Object.freeze({
          x: spawn.x + centeredContentOffset.x,
          y: spawn.y + centeredContentOffset.y,
        }),
      ),
    ),
    exitPoints: Object.freeze([
      { x: width / 2, y: safeMargin },
      { x: width - safeMargin, y: height / 2 },
      { x: width / 2, y: height - safeMargin },
      { x: safeMargin, y: height / 2 },
    ]),
    contentBounds: Object.freeze(contentBounds),
    navigationBounds: Object.freeze({ ...playableBounds }),
    ambienceBounds: Object.freeze({ ...worldBounds }),
    remotePlayerRelevanceBounds: Object.freeze({ ...playableBounds }),
  });
}

/**
 * Local V3-only sizing standards derived from the validated canonical outdoor
 * manifests. Published V1/V2 manifests remain unchanged. Every V3 canvas is
 * exactly three times the canonical width and three times the canonical height,
 * while the existing authored composition is centered without coordinate drift.
 */
export const V3_OUTDOOR_LOCATION_SIZE_PROFILES = Object.freeze({
  'lantern-square': expandedCanonicalProfile('lantern-square'),
  'moonpetal-meadow': expandedCanonicalProfile('moonpetal-meadow'),
  'brooklight-crossing': expandedCanonicalProfile('brooklight-crossing'),
  'hearthfield-road': expandedCanonicalProfile('hearthfield-road'),
  'whisperpine-gate': expandedCanonicalProfile('whisperpine-gate'),
} satisfies Readonly<Record<MapId, V3LocationSizeProfile>>);

export const PRODUCTION_SLICE_V3_LOCATION_PROFILE =
  V3_OUTDOOR_LOCATION_SIZE_PROFILES['lantern-square'];
