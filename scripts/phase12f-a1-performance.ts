import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import {
  PLAYER_FOOT_RADIUS,
  buildCollisionSpatialIndex,
  moveWithCollisionIndex,
} from '../packages/game-core/src/index';
import { PRODUCTION_SLICE_V3_LOCATION_PROFILE } from '../packages/game-content/src/location-size-profile';
import { PRODUCTION_SLICE_V3_MANIFEST } from '../packages/game-content/src/production-slice-v3';

const SAMPLE_COUNT = 8_000;
const WARMUP_COUNT = 1_000;
const COLLISION_BUCKET_SIZE = 4;

interface TimingSummary {
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maximumMs: number;
}

function percentile(values: readonly number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(Math.floor(ordered.length * fraction), ordered.length - 1)] ?? 0;
}

function summarizeTimings(values: readonly number[]): TimingSummary {
  return {
    medianMs: Number(percentile(values, 0.5).toFixed(5)),
    p95Ms: Number(percentile(values, 0.95).toFixed(5)),
    maximumMs: Number(percentile(values, 1).toFixed(5)),
  };
}

function movementDelta(sample: number): Readonly<{ x: number; y: number }> {
  const angle = (sample * 0.618_033_988_75 * Math.PI * 2) % (Math.PI * 2);
  return { x: Math.cos(angle) * 0.34, y: Math.sin(angle) * 0.34 };
}

/** Deterministic low-discrepancy samples cover the full expanded map, not only the spawn area. */
function radicalInverse(value: number, base: number): number {
  let result = 0;
  let denominator = 1;
  let remaining = value;
  while (remaining > 0) {
    denominator *= base;
    result += (remaining % base) / denominator;
    remaining = Math.floor(remaining / base);
  }
  return result;
}

async function main(): Promise<void> {
  const manifest = PRODUCTION_SLICE_V3_MANIFEST;
  const profile = PRODUCTION_SLICE_V3_LOCATION_PROFILE;
  const index = buildCollisionSpatialIndex(manifest.collisions, COLLISION_BUCKET_SIZE);
  const queryTimes: number[] = [];
  const movementResolutionTimes: number[] = [];
  let candidateTotal = 0;
  let position = { x: manifest.spawn.x, y: manifest.spawn.y };

  for (let sample = 0; sample < WARMUP_COUNT; sample += 1) {
    const delta = movementDelta(sample);
    index.query({
      minX: position.x - 0.7,
      minY: position.y - 0.7,
      maxX: position.x + 0.7,
      maxY: position.y + 0.7,
    });
    position = moveWithCollisionIndex(
      position,
      delta,
      PLAYER_FOOT_RADIUS,
      manifest.safeSaveBounds,
      index,
    );
  }

  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const queryPosition = {
      x:
        manifest.safeSaveBounds.minX +
        radicalInverse(sample + 1, 2) *
          (manifest.safeSaveBounds.maxX - manifest.safeSaveBounds.minX),
      y:
        manifest.safeSaveBounds.minY +
        radicalInverse(sample + 1, 3) *
          (manifest.safeSaveBounds.maxY - manifest.safeSaveBounds.minY),
    };
    const queryStarted = performance.now();
    candidateTotal += index.query({
      minX: queryPosition.x - 0.7,
      minY: queryPosition.y - 0.7,
      maxX: queryPosition.x + 0.7,
      maxY: queryPosition.y + 0.7,
    }).length;
    queryTimes.push(performance.now() - queryStarted);

    const movementStarted = performance.now();
    position = moveWithCollisionIndex(
      position,
      movementDelta(sample + WARMUP_COUNT),
      PLAYER_FOOT_RADIUS,
      manifest.safeSaveBounds,
      index,
    );
    movementResolutionTimes.push(performance.now() - movementStarted);
  }

  const sizeReport = JSON.parse(
    await readFile('assets/reports/starville-production-slice-v3-sizes.json', 'utf8'),
  ) as {
    readonly bytesByRole: Readonly<
      Record<string, Readonly<{ bytes: number; files: number; missing: number }>>
    >;
  };

  const output = {
    status: 'local_measurement_only',
    map: {
      baselineWidth: profile.baseline.width,
      baselineHeight: profile.baseline.height,
      width: manifest.width,
      height: manifest.height,
      playableTiles: manifest.width * manifest.height,
      widthMultiplier: manifest.width / profile.baseline.width,
      heightMultiplier: manifest.height / profile.baseline.height,
      areaMultiplier:
        (manifest.width * manifest.height) / (profile.baseline.width * profile.baseline.height),
      terrainChunks: Math.ceil(manifest.width / 8) * Math.ceil(manifest.height / 8),
      objects: manifest.objects.length,
      collisionShapes: manifest.collisions.length,
    },
    collision: {
      samples: SAMPLE_COUNT,
      warmupSamples: WARMUP_COUNT,
      bucketSize: COLLISION_BUCKET_SIZE,
      spatialQuery: summarizeTimings(queryTimes),
      movementResolution: summarizeTimings(movementResolutionTimes),
      averageNearbyShapes: Number((candidateTotal / SAMPLE_COUNT).toFixed(3)),
      fullMapScanAvoided: true,
    },
    encodedTextureDelivery: sizeReport.bytesByRole['runtime'],
    qualification:
      'CPU-only Node.js microbenchmark; excludes Phaser/WebGL rendering, transition timing, GPU texture memory, network/realtime work, and physical mobile-device performance.',
  };

  if (
    output.map.widthMultiplier < 2 ||
    output.map.heightMultiplier < 2 ||
    output.map.areaMultiplier !== 4 ||
    output.map.objects === 0 ||
    output.map.collisionShapes === 0 ||
    sizeReport.bytesByRole['runtime']?.missing !== 0 ||
    [...queryTimes, ...movementResolutionTimes].some((duration) => !Number.isFinite(duration))
  ) {
    throw new Error(`Phase 12F-A.1 performance fixture is invalid: ${JSON.stringify(output)}`);
  }

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

void main();
