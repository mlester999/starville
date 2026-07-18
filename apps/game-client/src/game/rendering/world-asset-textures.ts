import Phaser from 'phaser';

import type { WorldAssetDelivery } from '@starville/asset-management';
import { depthOffsetForAnchors } from '@starville/game-core';

import type { WorldAssetFallbackEvent } from '../contracts';

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
  return `starville-asset:${delivery.assetKey}:${delivery.versionId}:${delivery.checksum.slice(0, 16)}`;
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

function fallbackEvent(delivery: WorldAssetDelivery): WorldAssetFallbackEvent {
  return {
    code: 'WORLD_ASSET_LOAD_FAILED',
    assetKey: delivery.assetKey,
    versionId: delivery.versionId,
  };
}

function reportFallbackSafely(
  delivery: WorldAssetDelivery,
  onLoadFailure: (event: WorldAssetFallbackEvent) => void,
): void {
  try {
    onLoadFailure(fallbackEvent(delivery));
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
): number {
  scene.load.setCORS('anonymous');
  let queued = 0;
  const queuedDeliveries = new Map<string, WorldAssetDelivery>();
  for (const delivery of deliveries) {
    if (!isProductionWorldAssetDelivery(delivery)) continue;
    const key = worldAssetTextureKey(delivery);
    if (scene.textures.exists(key)) continue;
    try {
      scene.load.image(key, delivery.url);
      queuedDeliveries.set(key, delivery);
      queued += 1;
    } catch {
      if (onLoadFailure !== undefined) reportFallbackSafely(delivery, onLoadFailure);
    }
  }

  if (onLoadFailure !== undefined && queuedDeliveries.size > 0) {
    const handleLoadError = (file: Phaser.Loader.File): void => {
      const delivery = queuedDeliveries.get(file.key);
      if (delivery === undefined) return;
      queuedDeliveries.delete(file.key);
      reportFallbackSafely(delivery, onLoadFailure);
    };
    const stopObserving = (): void => {
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, handleLoadError);
    };
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, handleLoadError);
    scene.load.once(Phaser.Loader.Events.COMPLETE, stopObserving);
  }
  return queued;
}
