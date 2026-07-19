import Phaser from 'phaser';

import {
  getBundledAsset,
  resolveWorldAssetDelivery,
  STARVILLE_BUNDLED_MANIFEST_VERSION,
  type AssetResolutionContext,
  type AssetRotation,
  type ResolvedAsset,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import { depthOffsetForAnchors } from '@starville/game-core';

import {
  sessionAssetFailureRegistry,
  type AssetFailureRegistry,
} from '../../app/asset-failure-registry';
import { runtimeDevelopmentMetrics } from '../../app/development-performance';
import type { WorldAssetFallbackEvent } from '../contracts';
import { BUNDLED_TERRAIN_ASSET_KEYS } from './world-asset-keys';

export { BUNDLED_TERRAIN_ASSET_KEYS } from './world-asset-keys';

export type ProductionWorldAssetDelivery = WorldAssetDelivery & {
  readonly developmentMarker: false;
  readonly url: string;
  readonly mediaType: 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
};

export function isProductionWorldAssetDelivery(
  delivery: WorldAssetDelivery,
): delivery is ProductionWorldAssetDelivery {
  return (
    !delivery.developmentMarker &&
    delivery.url !== null &&
    delivery.mediaType === 'image/webp' &&
    delivery.width !== null &&
    delivery.height !== null &&
    delivery.renderWidth !== null &&
    delivery.renderHeight !== null
  );
}

export function worldAssetTextureKey(delivery: WorldAssetDelivery): string {
  return resolveWorldAssetDelivery({
    assetKey: delivery.assetKey,
    context: 'published_world',
    delivery,
  }).cacheIdentity;
}

/**
 * Resolver cache identities contain only stable logical/version metadata. They
 * deliberately exclude signed delivery URLs so Phaser keys are safe to expose
 * in diagnostics and remain stable when a URL is refreshed.
 */
export function resolvedWorldAssetTextureKey(asset: ResolvedAsset): string {
  return asset.cacheIdentity;
}

export interface QueueWorldAssetTextureOptions {
  /** Protected previews use the resolver's explicit game_test trust context. */
  readonly assetResolutionContext?: AssetResolutionContext;
  /** Stable keys referenced by the immutable world manifest. */
  readonly assetKeys: readonly string[];
  /** Authored rotations currently visible in the map; unopened variants remain lazy. */
  readonly assetRotations?: readonly Readonly<{
    assetKey: string;
    rotation: AssetRotation;
  }>[];
  /** Exact terrain materials present in the current map. */
  readonly terrainAssetKeys?: readonly string[];
  /** Compatibility option for focused fixtures that intentionally need every terrain kind. */
  readonly includeTerrain?: boolean;
  /** Deterministic fixture override; normal runtime uses one bounded session registry. */
  readonly failureRegistry?: AssetFailureRegistry;
}

export function worldAssetDepthOffset(delivery: WorldAssetDelivery): number {
  return depthOffsetForAnchors(delivery.footAnchorY, delivery.depthAnchorY);
}

export interface WorldAssetRenderPlacement {
  readonly originX: number;
  readonly originY: number;
  readonly depthOffset: number;
}

/**
 * A map object's logical position is its ground-contact point. Phaser must
 * therefore place the immutable image with the foot anchor at that position.
 * The generic render anchor remains preview/composition metadata, while the
 * depth anchor only makes a bounded adjustment to ordering at the same logical
 * foot position.
 */
export function worldAssetRenderPlacement(delivery: WorldAssetDelivery): WorldAssetRenderPlacement {
  return {
    originX: delivery.footAnchorX,
    originY: delivery.footAnchorY,
    depthOffset: worldAssetDepthOffset(delivery),
  };
}

export function resolvedWorldAssetRenderPlacement(asset: ResolvedAsset): WorldAssetRenderPlacement {
  return {
    originX: asset.render.footAnchor.x,
    originY: asset.render.footAnchor.y,
    depthOffset: depthOffsetForAnchors(asset.render.footAnchor.y, asset.render.depthAnchor.y),
  };
}

function assetFailureIdentity(
  resolved: ResolvedAsset,
  delivery?: WorldAssetDelivery,
): Readonly<{ assetKey: string; versionId: string }> {
  return {
    assetKey: resolved.requestedKey,
    versionId:
      resolved.versionId ??
      delivery?.versionId ??
      `bundled-manifest:${STARVILLE_BUNDLED_MANIFEST_VERSION}`,
  };
}

function reportFallbackSafely(
  event: WorldAssetFallbackEvent,
  onLoadFailure: (event: WorldAssetFallbackEvent) => void,
): void {
  try {
    onLoadFailure(event);
  } catch {
    // Observability must never turn a visual fallback into a fatal game error.
  }
}

/**
 * Adds trusted immutable delivery URLs to Phaser's loader. The loader is started
 * by Phaser during scene preload and explicitly by WorldScene during map travel.
 */
export function queueWorldAssetTextures(
  scene: Phaser.Scene,
  deliveries: readonly WorldAssetDelivery[],
  onLoadFailure?: (event: WorldAssetFallbackEvent) => void,
  options?: QueueWorldAssetTextureOptions,
): number {
  const resolutionContext = options?.assetResolutionContext ?? 'published_world';
  const failureRegistry = options?.failureRegistry ?? sessionAssetFailureRegistry;
  scene.load.setCORS('anonymous');
  let queued = 0;
  const queuedResolutions = new Map<
    string,
    Readonly<{ resolved: ResolvedAsset; delivery?: WorldAssetDelivery }>
  >();
  const queuedKeys = new Set<string>();

  const queueResolved = (resolved: ResolvedAsset, delivery?: WorldAssetDelivery): void => {
    const key = resolvedWorldAssetTextureKey(resolved);
    if (queuedKeys.has(key)) return;
    if (scene.textures.exists(key)) {
      failureRegistry.succeed(key);
      runtimeDevelopmentMetrics.recordAssetRequest(true);
      return;
    }
    if (!failureRegistry.begin(key)) return;
    runtimeDevelopmentMetrics.recordAssetRequest(false);
    try {
      scene.load.image(key, resolved.url);
      queuedKeys.add(key);
      queuedResolutions.set(key, delivery === undefined ? { resolved } : { resolved, delivery });
      queued += 1;
    } catch {
      const identity = assetFailureIdentity(resolved, delivery);
      const failure = failureRegistry.fail(key, identity.assetKey, identity.versionId);
      if (failure.shouldReport && onLoadFailure !== undefined) {
        reportFallbackSafely(failure.event, onLoadFailure);
      }
    }
  };

  /* This diagnostic material is the final stable visual before procedural drawing. */
  queueResolved(
    resolveWorldAssetDelivery({
      assetKey: 'system.missing-asset',
      context: resolutionContext,
    }),
  );

  /* Focused callers still receive upload selection plus its bundled safe fallback. */
  if (options === undefined) {
    for (const delivery of deliveries) {
      if (!isProductionWorldAssetDelivery(delivery)) continue;
      const resolved = resolveWorldAssetDelivery({
        assetKey: delivery.assetKey,
        context: resolutionContext,
        delivery,
      });
      queueResolved(resolved, delivery);
      queueResolved(
        resolveWorldAssetDelivery({
          assetKey: delivery.assetKey,
          context: resolutionContext,
          rotation: delivery.defaultRotation,
        }),
      );
    }
  } else {
    const deliveriesByKey = new Map(deliveries.map((delivery) => [delivery.assetKey, delivery]));
    const stableKeys = new Set(options.assetKeys);
    for (const key of options.terrainAssetKeys ?? []) stableKeys.add(key);
    if (options.includeTerrain === true) {
      for (const key of BUNDLED_TERRAIN_ASSET_KEYS) stableKeys.add(key);
    }

    const rotationsByKey = new Map<string, Set<AssetRotation>>();
    for (const request of options.assetRotations ?? []) {
      const rotations = rotationsByKey.get(request.assetKey) ?? new Set<AssetRotation>();
      rotations.add(request.rotation);
      rotationsByKey.set(request.assetKey, rotations);
    }

    for (const assetKey of stableKeys) {
      const delivery = deliveriesByKey.get(assetKey);
      const bundled = getBundledAsset(assetKey) ?? getBundledAsset('system.missing-asset');
      const requestedRotations = rotationsByKey.get(assetKey);
      const rotations: readonly AssetRotation[] =
        requestedRotations === undefined || requestedRotations.size === 0
          ? [delivery?.defaultRotation ?? bundled?.defaultRotation ?? 0]
          : [...requestedRotations];
      for (const rotation of rotations) {
        const selected = resolveWorldAssetDelivery({
          assetKey,
          context: resolutionContext,
          ...(delivery === undefined ? {} : { delivery }),
          rotation,
        });

        /* Uploaded v1 exposes one authored direction; never load it as a fake quarter-turn. */
        const uploadCanRepresentRotation =
          selected.source !== 'pinned_uploaded' || delivery?.defaultRotation === rotation;
        if (uploadCanRepresentRotation) queueResolved(selected, delivery);

        if (selected.source === 'pinned_uploaded' || !uploadCanRepresentRotation) {
          queueResolved(
            resolveWorldAssetDelivery({
              assetKey,
              context: resolutionContext,
              rotation,
            }),
          );
        }
      }
    }
  }

  if (queuedResolutions.size > 0) {
    const handleLoadError = (file: Phaser.Loader.File): void => {
      const queuedResolution = queuedResolutions.get(file.key);
      if (queuedResolution === undefined) return;
      queuedResolutions.delete(file.key);
      const identity = assetFailureIdentity(queuedResolution.resolved, queuedResolution.delivery);
      const failure = failureRegistry.fail(file.key, identity.assetKey, identity.versionId);
      if (failure.shouldReport && onLoadFailure !== undefined) {
        reportFallbackSafely(failure.event, onLoadFailure);
      }
    };
    const stopObserving = (): void => {
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, handleLoadError);
      for (const [key] of queuedResolutions) {
        if (scene.textures.exists(key)) failureRegistry.succeed(key);
        else failureRegistry.cancel(key);
      }
      queuedResolutions.clear();
    };
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, handleLoadError);
    scene.load.once(Phaser.Loader.Events.COMPLETE, stopObserving);
  }
  return queued;
}
