import {
  resolveAssetSource,
  resolveWorldAssetDelivery,
  STARVILLE_BUNDLED_MANIFEST_VERSION,
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  STARVILLE_PRODUCTION_SLICE_MANIFEST_VERSION,
  type BundledManifestVersion,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import {
  defaultMapSpawn,
  worldAssetDependencyKeys,
  type PlayerStateUpdate,
} from '@starville/game-core';
import {
  PRODUCTION_SLICE_V3_INTERIOR_MANIFEST,
  PRODUCTION_SLICE_V3_MANIFEST,
} from '@starville/game-content';

import type { AvatarRendererMode, RuntimeWorld } from '../game/contracts';

export const PRODUCTION_SLICE_REVIEW_QUERY = 'visual-candidate' as const;
export const PRODUCTION_SLICE_REVIEW_VALUE = 'production-slice-v3' as const;
export const PRODUCTION_SLICE_REVIEW_LABEL = 'PRODUCTION ART RESCUE · LOCAL · UNPUBLISHED' as const;

export type ProductionSliceReviewVersion = 'v1' | 'v2' | 'v3';
export type ProductionSliceReviewLocation = 'exterior' | 'interior';

export const PRODUCTION_SLICE_REVIEW_CORE_OFFSET = Object.freeze({ x: 0, y: 0 });

function centeredCoreCheckpoint(
  x: number,
  y: number,
  facingDirection: PlayerStateUpdate['facingDirection'],
): Omit<PlayerStateUpdate, 'mapId'> {
  return Object.freeze({
    x: x + PRODUCTION_SLICE_REVIEW_CORE_OFFSET.x,
    y: y + PRODUCTION_SLICE_REVIEW_CORE_OFFSET.y,
    facingDirection,
  });
}

const REVIEW_CHECKPOINTS = {
  'behind-pine': centeredCoreCheckpoint(5.8, 5.9, 'southeast'),
  'front-pine': centeredCoreCheckpoint(7.5, 8.9, 'northwest'),
  'cottage-entry': centeredCoreCheckpoint(22.8, 12.7, 'northwest'),
  water: centeredCoreCheckpoint(34, 26.7, 'south'),
  bench: centeredCoreCheckpoint(23.4, 24.1, 'north'),
  workbench: centeredCoreCheckpoint(31.5, 24, 'north'),
  fence: centeredCoreCheckpoint(15.5, 15.1, 'north'),
  notice: centeredCoreCheckpoint(26, 19.6, 'north'),
  'tree-trunk': centeredCoreCheckpoint(6.5, 8.7, 'north'),
  'east-movement': centeredCoreCheckpoint(28, 20, 'east'),
  'west-movement': centeredCoreCheckpoint(28, 20, 'west'),
  overview: centeredCoreCheckpoint(23.33, 18, 'south'),
  'far-east': { x: 43, y: 20, facingDirection: 'east' },
} as const satisfies Readonly<Record<string, Omit<PlayerStateUpdate, 'mapId'>>>;

export function productionSliceReviewCheckpoint(
  checkpoint: keyof typeof REVIEW_CHECKPOINTS,
): Omit<PlayerStateUpdate, 'mapId'> {
  return { ...REVIEW_CHECKPOINTS[checkpoint] };
}

const VERSION_CONFIG: Readonly<
  Record<
    ProductionSliceReviewVersion,
    Readonly<{
      manifestVersion: BundledManifestVersion;
      rendererMode: AvatarRendererMode;
      versionId: string;
      checksum: string;
      label: string;
    }>
  >
> = {
  v1: {
    manifestVersion: STARVILLE_BUNDLED_MANIFEST_VERSION,
    rendererMode: 'published_v1',
    versionId: '120f0000-0000-4000-8000-000000000001',
    checksum: '1111111111111111111111111111111111111111111111111111111111111111',
    label: 'V1 · CURRENT PUBLISHED DEFAULT',
  },
  v2: {
    manifestVersion: STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
    rendererMode: 'phase12d_candidate',
    versionId: '120f0000-0000-4000-8000-000000000002',
    checksum: '2222222222222222222222222222222222222222222222222222222222222222',
    label: 'V2 · REJECTED COMPARISON',
  },
  v3: {
    manifestVersion: STARVILLE_PRODUCTION_SLICE_MANIFEST_VERSION,
    rendererMode: 'production_slice_v3',
    versionId: '120f0000-0000-4000-8000-000000000003',
    checksum: '3333333333333333333333333333333333333333333333333333333333333333',
    label: 'V3 · PRODUCTION SLICE CANDIDATE',
  },
};

export function isLoopbackReviewHost(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase('en-US');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]';
}

export function productionSliceReviewRequested(input: {
  readonly development: boolean;
  readonly hostname: string;
  readonly search: string;
}): boolean {
  return (
    input.development &&
    isLoopbackReviewHost(input.hostname) &&
    new URLSearchParams(input.search).get(PRODUCTION_SLICE_REVIEW_QUERY) ===
      PRODUCTION_SLICE_REVIEW_VALUE
  );
}

export function parseProductionSliceReviewVersion(search: string): ProductionSliceReviewVersion {
  const value = new URLSearchParams(search).get('visual-version');
  return value === 'v1' || value === 'v2' ? value : 'v3';
}

export function productionSliceReviewInitialState(search: string): PlayerStateUpdate {
  const parameters = new URLSearchParams(search);
  if (parameters.get('review-location') === 'interior') {
    return {
      mapId: PRODUCTION_SLICE_V3_INTERIOR_MANIFEST.id,
      ...defaultMapSpawn(PRODUCTION_SLICE_V3_INTERIOR_MANIFEST),
    };
  }
  const checkpoint = parameters.get('review-position');
  const position =
    checkpoint !== null && checkpoint in REVIEW_CHECKPOINTS
      ? REVIEW_CHECKPOINTS[checkpoint as keyof typeof REVIEW_CHECKPOINTS]
      : defaultMapSpawn(PRODUCTION_SLICE_V3_MANIFEST);
  return { mapId: PRODUCTION_SLICE_V3_MANIFEST.id, ...position };
}

function deliveryFor(assetKey: string, version: ProductionSliceReviewVersion): WorldAssetDelivery {
  let sourceVersion = version;
  let config = VERSION_CONFIG[version];
  let resolved = resolveAssetSource({
    assetKey,
    context: 'game_test',
    allowActiveOverride: false,
    preferredBundledManifestVersion: config.manifestVersion,
  });
  if (
    (resolved.source !== 'bundled_default' || resolved.visualKey !== assetKey) &&
    version !== 'v3'
  ) {
    sourceVersion = 'v3';
    config = VERSION_CONFIG.v3;
    resolved = resolveAssetSource({
      assetKey,
      context: 'game_test',
      allowActiveOverride: false,
      preferredBundledManifestVersion: config.manifestVersion,
    });
  }
  if (resolved.source !== 'bundled_default' || resolved.visualKey !== assetKey) {
    throw new Error(`Review asset is unavailable in ${version}: ${assetKey}`);
  }
  const delivery: WorldAssetDelivery = {
    assetKey,
    versionId: config.versionId,
    checksum: config.checksum,
    ...(sourceVersion === 'v2' ? { materialClass: 'bundled_candidate' as const } : {}),
    bundledManifestVersion: config.manifestVersion,
    url: null,
    mediaType: null,
    width: null,
    height: null,
    renderWidth: null,
    renderHeight: null,
    scale: resolved.render.scale,
    anchorX: resolved.render.anchor.x,
    anchorY: resolved.render.anchor.y,
    footAnchorX: resolved.render.footAnchor.x,
    footAnchorY: resolved.render.footAnchor.y,
    depthAnchorX: resolved.render.depthAnchor.x,
    depthAnchorY: resolved.render.depthAnchor.y,
    collision: resolved.render.collision,
    supportedRotations: [...resolved.render.supportedRotations],
    defaultRotation: resolved.render.defaultRotation,
    developmentMarker: true,
  };
  const verified = resolveWorldAssetDelivery({
    assetKey,
    context: 'game_test',
    delivery,
  });
  if (verified.reason !== 'exact_pinned_bundled_version') {
    throw new Error(`Review asset pin could not be verified in ${version}: ${assetKey}`);
  }
  return Object.freeze(delivery);
}

export function productionSliceRuntimeWorld(
  version: ProductionSliceReviewVersion,
  location: ProductionSliceReviewLocation = 'exterior',
): RuntimeWorld {
  const config = VERSION_CONFIG[version];
  const manifest =
    location === 'interior' ? PRODUCTION_SLICE_V3_INTERIOR_MANIFEST : PRODUCTION_SLICE_V3_MANIFEST;
  return Object.freeze({
    manifest,
    versionId: config.versionId,
    checksum: config.checksum,
    assetDeliveries: Object.freeze(
      worldAssetDependencyKeys(manifest).map((key) => deliveryFor(key, version)),
    ),
    assetResolutionContext: 'game_test' as const,
  });
}

export function productionSliceReviewConfig(version: ProductionSliceReviewVersion) {
  return VERSION_CONFIG[version];
}
