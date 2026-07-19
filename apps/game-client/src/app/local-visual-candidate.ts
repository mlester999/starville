import {
  resolveAssetSource,
  resolveWorldAssetDelivery,
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import { worldAssetDependencyKeys } from '@starville/game-core';

import type { AvatarRendererMode, RuntimeWorld } from '../game/contracts';

const LOCAL_CANDIDATE_VERSION_ID = '120d0000-0000-4000-8000-000000000002';
const LOCAL_CANDIDATE_CHECKSUM = '361421e0660e2af2cdc3fbd2324946a9b0d3d22801f68a929ea65d415867624f';
export const LOCAL_VISUAL_CANDIDATE_QUERY = 'visual-candidate';
export const LOCAL_VISUAL_CANDIDATE_VALUE = 'v2';

export interface LocalVisualCandidateReview {
  readonly enabled: boolean;
  readonly requested: boolean;
  readonly avatarRendererMode: AvatarRendererMode;
  readonly label: string | null;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase('en-US');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]';
}

/**
 * This switch is deliberately nonpersistent: a development build, loopback
 * hostname, and explicit query value are all required on every page load.
 */
export function resolveLocalVisualCandidateReview(input: {
  readonly development: boolean;
  readonly hostname: string;
  readonly search: string;
}): LocalVisualCandidateReview {
  const requested =
    new URLSearchParams(input.search).get(LOCAL_VISUAL_CANDIDATE_QUERY) ===
    LOCAL_VISUAL_CANDIDATE_VALUE;
  const enabled = input.development && isLoopbackHost(input.hostname) && requested;
  return {
    enabled,
    requested,
    avatarRendererMode: enabled ? 'phase12d_candidate' : 'published_v1',
    label: enabled ? 'LOCAL V2 CANDIDATE REVIEW · UNPUBLISHED · IN MEMORY' : null,
  };
}

function phase12DDelivery(assetKey: string): WorldAssetDelivery | undefined {
  try {
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
      return undefined;
    }
    const delivery: WorldAssetDelivery = {
      assetKey,
      versionId: LOCAL_CANDIDATE_VERSION_ID,
      checksum: LOCAL_CANDIDATE_CHECKSUM,
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
    return verified.reason === 'exact_pinned_bundled_version' ? Object.freeze(delivery) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Rebinds only resolvable stable keys to exact bundled V2 deliveries. Missing
 * keys retain their exact published delivery (or normal V1 fallback), while
 * world identity, object positions, collisions, and interactions stay intact.
 */
export function applyLocalVisualCandidateReview(
  world: RuntimeWorld,
  review: LocalVisualCandidateReview,
): RuntimeWorld {
  if (!review.enabled) return world;
  const publishedByKey = new Map(
    world.assetDeliveries.map((delivery) => [delivery.assetKey, delivery] as const),
  );
  const deliveries = worldAssetDependencyKeys(world.manifest).flatMap((assetKey) => {
    const candidate = phase12DDelivery(assetKey);
    if (candidate !== undefined) return [candidate];
    const published = publishedByKey.get(assetKey);
    return published === undefined ? [] : [published];
  });
  return {
    ...world,
    assetDeliveries: Object.freeze(deliveries),
    assetResolutionContext: 'game_test',
  };
}
