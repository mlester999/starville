import {
  resolveAssetSource,
  resolveWorldAssetDelivery,
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import {
  isPositionWalkable,
  PLAYER_FOOT_RADIUS,
  type MapManifest,
  type PlayerStateUpdate,
} from '@starville/game-core';
import {
  getPhase12ELanternSquareCandidate,
  PHASE_12E_LANTERN_SQUARE_LIFECYCLE,
} from '@starville/game-content';

import type { RuntimeWorld } from '../game/contracts';
import { BUNDLED_TERRAIN_ASSET_KEYS } from '../game/rendering/world-asset-keys';

export type Phase12CWorldGameTestSourceMode = 'authorized_revision' | 'local_lantern_composition';

export interface Phase12CAuthorizedRevisionSource {
  readonly displayName: string;
  readonly manifest: MapManifest;
  readonly assetDeliveries: readonly WorldAssetDelivery[];
  readonly playerState: PlayerStateUpdate;
  readonly version: Readonly<{
    id: string;
    checksum: string;
    versionNumber: number;
    editVersion: number;
    lifecycleStatus: 'validated' | 'published' | 'superseded';
  }>;
}

export interface Phase12CWorldGameTestSource {
  readonly mode: Phase12CWorldGameTestSourceMode;
  readonly identity: 'exact_authorized_revision' | 'phase12e_local_lantern_square';
  readonly lifecycle: 'validated' | 'published' | 'superseded' | 'local_draft';
  readonly displayName: string;
  readonly statusLabel: string;
  readonly versionLabel: string;
  readonly world: RuntimeWorld;
  readonly baseState: PlayerStateUpdate;
}

const LOCAL_WORLD_VERSION_ID = 'phase12e-local-lantern-square-unpublished';
const LOCAL_WORLD_CHECKSUM = 'local-unpublished-phase12e-world-phase12d-visuals-2.0.0';
const LOCAL_BUNDLED_VERSION_ID = '120d0000-0000-4000-8000-000000000002';
const LOCAL_BUNDLED_IDENTITY_CHECKSUM =
  '361421e0660e2af2cdc3fbd2324946a9b0d3d22801f68a929ea65d415867624f';

/** Production terrain renderer's complete bounded material set, resolved as local bundled pins. */
export const PHASE12C_LOCAL_TERRAIN_ASSET_KEYS = BUNDLED_TERRAIN_ASSET_KEYS;

/** Local review is an additive option only after a secure Lantern Square grant. */
export function phase12CLocalCompositionAvailable(manifest: Pick<MapManifest, 'id' | 'slug'>) {
  return manifest.id === 'lantern-square' && manifest.slug === 'lantern-square';
}

function localBundledDelivery(assetKey: string): WorldAssetDelivery {
  const resolved = resolveAssetSource({
    assetKey,
    context: 'game_test',
    allowActiveOverride: false,
    preferredBundledManifestVersion: STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  });
  if (
    resolved.source !== 'bundled_default' ||
    resolved.visualKey !== assetKey ||
    resolved.bundled.bundledVersion !== STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION ||
    resolved.bundled.qualityStatus !== 'production_candidate'
  ) {
    throw new Error(`Phase 12D local Game Test asset '${assetKey}' is not a bundled candidate`);
  }

  const delivery: WorldAssetDelivery = {
    assetKey,
    versionId: LOCAL_BUNDLED_VERSION_ID,
    checksum: LOCAL_BUNDLED_IDENTITY_CHECKSUM,
    materialClass: 'bundled_candidate',
    bundledManifestVersion: STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
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
  if (
    verified.source !== 'bundled_default' ||
    verified.reason !== 'exact_pinned_bundled_version' ||
    verified.visualKey !== assetKey
  ) {
    throw new Error(`Phase 12D local Game Test asset '${assetKey}' could not be bound safely`);
  }
  return Object.freeze(delivery);
}

export function createPhase12CLocalBundledDeliveries(
  manifest: MapManifest,
  visualAssetKeys: readonly string[] = manifest.assets,
): readonly WorldAssetDelivery[] {
  const neededKeys = new Set([...visualAssetKeys, ...PHASE12C_LOCAL_TERRAIN_ASSET_KEYS]);
  return Object.freeze([...neededKeys].map(localBundledDelivery));
}

export function selectPhase12CWorldGameTestSource(input: {
  readonly mode: Phase12CWorldGameTestSourceMode;
  readonly authorized: Phase12CAuthorizedRevisionSource;
}): Phase12CWorldGameTestSource {
  if (input.mode === 'authorized_revision') {
    return {
      mode: input.mode,
      identity: 'exact_authorized_revision',
      lifecycle: input.authorized.version.lifecycleStatus,
      displayName: input.authorized.displayName,
      statusLabel: 'Exact authorized revision',
      versionLabel: `version ${String(input.authorized.version.versionNumber)} · revision ${String(input.authorized.version.editVersion)}`,
      world: {
        manifest: input.authorized.manifest,
        versionId: input.authorized.version.id,
        checksum: input.authorized.version.checksum,
        assetDeliveries: input.authorized.assetDeliveries,
        assetResolutionContext: 'game_test',
      },
      baseState: input.authorized.playerState,
    };
  }

  if (!phase12CLocalCompositionAvailable(input.authorized.manifest)) {
    throw new Error(
      'Phase 12E local beta composition is available only for authorized Lantern Square',
    );
  }
  const candidate = getPhase12ELanternSquareCandidate();
  if (candidate.lifecycle !== PHASE_12E_LANTERN_SQUARE_LIFECYCLE) {
    throw new Error('Phase 12E Lantern Square candidate is not an unpublished local draft');
  }
  const spawn = candidate.manifest.spawns.find(
    ({ id }) => id === candidate.manifest.defaultSpawnId,
  );
  if (spawn === undefined || !spawn.enabled) {
    throw new Error('Phase 12E Lantern Square candidate has no enabled default spawn');
  }
  if (
    !isPositionWalkable(
      spawn,
      PLAYER_FOOT_RADIUS,
      candidate.manifest.safeSaveBounds,
      candidate.manifest.collisions,
    )
  ) {
    throw new Error('Phase 12E Lantern Square candidate default spawn is not walkable');
  }
  return {
    mode: input.mode,
    identity: 'phase12e_local_lantern_square',
    lifecycle: PHASE_12E_LANTERN_SQUARE_LIFECYCLE,
    displayName: 'Lantern Square · Phase 12E beta composition · Phase 12D candidate visuals',
    statusLabel: 'LOCAL PHASE 12E DRAFT · UNPUBLISHED · IN MEMORY',
    versionLabel: `local manifest v${String(candidate.manifest.version)} · source v${String(candidate.sourceManifestVersion)} · bundled candidate ${STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION}`,
    world: {
      manifest: candidate.manifest,
      versionId: LOCAL_WORLD_VERSION_ID,
      checksum: LOCAL_WORLD_CHECKSUM,
      assetDeliveries: createPhase12CLocalBundledDeliveries(
        candidate.manifest,
        candidate.visualAssetKeys,
      ),
      assetResolutionContext: 'game_test',
    },
    baseState: {
      mapId: candidate.manifest.id,
      x: spawn.x,
      y: spawn.y,
      facingDirection: spawn.facingDirection,
    },
  };
}
