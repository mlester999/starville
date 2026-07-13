import { z } from 'zod';

import { worldAssetDeliveriesSchema, type WorldAssetDelivery } from '@starville/asset-management';
import { mapIdSchema, validateMapManifest } from '@starville/game-core';
import { WORLD_ASSET_CATALOG } from '@starville/game-content';

import { assertInternalStoragePath } from '../asset-management/storage.js';
import type { ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type {
  PlayerWorldFailure,
  PlayerWorldGateway,
  PlayerWorldService,
  PinnedPublishedManifestView,
  PinnedPublishedWorldView,
  PinnedWorldAssetMaterial,
  PinnedWorldTransitionView,
  PublishedManifestView,
  PublishedWorldView,
  WorldTransitionView,
} from './player-contracts.js';

const transitionInputSchema = z
  .object({
    exitId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u),
    expectedGameStateVersion: z.number().int().positive(),
    expectedMapVersionId: z.uuid(),
  })
  .strict();

function mapFailure(status: PlayerWorldFailure): never {
  if (status === 'not_found') throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
  if (status === 'suspended') throw new PublicApiError(403, 'PLAYER_SUSPENDED');
  if (status === 'rename_required') throw new PublicApiError(409, 'PLAYER_RENAME_REQUIRED');
  if (status === 'rate_limited') throw new PublicApiError(429, 'RATE_LIMITED');
  if (status === 'map_not_found') throw new PublicApiError(404, 'WORLD_NOT_FOUND');
  if (status === 'version_conflict') throw new PublicApiError(409, 'WORLD_VERSION_CONFLICT');
  if (status === 'invalid_exit') throw new PublicApiError(422, 'INVALID_WORLD_TRANSITION');
  throw new PublicApiError(503, 'WORLD_UNAVAILABLE');
}

function exactPublicSourcePath(assetKey: string, value: string): string {
  const safe = assertInternalStoragePath(value);
  const escapedKey = assetKey.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  if (!new RegExp(`^starville/${escapedKey}/v[1-9][0-9]*/source\\.webp$`, 'u').test(safe)) {
    throw new Error('Asset delivery path does not match its stable key');
  }
  return safe;
}

function projectDeliveries(
  manifestAssets: readonly string[],
  materials: readonly PinnedWorldAssetMaterial[],
  publicAssetUrl: (path: string) => string,
): readonly WorldAssetDelivery[] {
  const byKey = new Map<string, WorldAssetDelivery>();
  for (const material of materials) {
    if (byKey.has(material.assetKey)) throw new Error('Duplicate pinned asset material');
    if (material.developmentMarker) {
      if (WORLD_ASSET_CATALOG.get(material.assetKey)?.status !== 'approved') {
        throw new Error('Unknown repository development marker');
      }
    }
    const url =
      material.delivery === null
        ? null
        : publicAssetUrl(exactPublicSourcePath(material.assetKey, material.delivery.objectPath));
    const delivery = worldAssetDeliveriesSchema.element.parse({
      assetKey: material.assetKey,
      versionId: material.versionId,
      checksum: material.checksumSha256,
      url,
      mediaType: material.mediaType,
      width: material.width,
      height: material.height,
      renderWidth: material.renderWidth,
      renderHeight: material.renderHeight,
      scale: material.scale,
      anchorX: material.anchorX,
      anchorY: material.anchorY,
      footAnchorX: material.footAnchorX,
      footAnchorY: material.footAnchorY,
      depthAnchorX: material.depthAnchorX,
      depthAnchorY: material.depthAnchorY,
      collision: material.collisionProfile,
      supportedRotations: material.supportedRotations,
      defaultRotation: material.defaultRotation,
      developmentMarker: material.developmentMarker,
    });
    byKey.set(delivery.assetKey, delivery);
  }
  if (
    byKey.size !== manifestAssets.length ||
    manifestAssets.some((assetKey) => !byKey.has(assetKey))
  ) {
    throw new Error('Published manifest and pinned asset delivery set differ');
  }
  return worldAssetDeliveriesSchema.parse(manifestAssets.map((assetKey) => byKey.get(assetKey)));
}

function validatePublishedManifest(
  view: PinnedPublishedManifestView,
  publicAssetUrl: (path: string) => string,
): PublishedManifestView {
  try {
    const assetDeliveries = projectDeliveries(
      view.manifest.assets,
      view.assetDeliveries,
      publicAssetUrl,
    );
    const deliveryCatalog = new Map(
      assetDeliveries.map(({ assetKey }) => [
        assetKey,
        { key: assetKey, status: 'approved' as const },
      ]),
    );
    const manifest = validateMapManifest(view.manifest, deliveryCatalog);
    if (manifest.id !== view.map.slug || manifest.version !== view.version.versionNumber) {
      throw new Error('Published manifest identity mismatch');
    }
    return { map: view.map, version: view.version, manifest, assetDeliveries };
  } catch {
    throw new PublicApiError(503, 'WORLD_CONTENT_INVALID');
  }
}

function validateWorld(
  view: PinnedPublishedWorldView,
  publicAssetUrl: (path: string) => string,
): PublishedWorldView {
  const validated = validatePublishedManifest(view, publicAssetUrl);
  if (
    view.playerState.mapId !== validated.map.slug ||
    view.playerState.mapVersionId !== validated.version.id
  ) {
    throw new PublicApiError(503, 'WORLD_CONTENT_INVALID');
  }
  return { ...validated, playerState: view.playerState };
}

function validateTransition(
  view: PinnedWorldTransitionView,
  publicAssetUrl: (path: string) => string,
): WorldTransitionView {
  const validated = validateWorld(view, publicAssetUrl);
  if (view.transition.toMapId !== validated.map.slug) {
    throw new PublicApiError(503, 'WORLD_CONTENT_INVALID');
  }
  return { ...validated, transition: view.transition };
}

export function createPlayerWorldService(options: {
  readonly gateway: PlayerWorldGateway;
  readonly logger: ServiceLogger;
  readonly manifestReadRateLimit: number;
  readonly transitionRateLimit: number;
  readonly publicAssetUrl: (path: string) => string;
}): PlayerWorldService {
  const { gateway, logger, manifestReadRateLimit, transitionRateLimit, publicAssetUrl } = options;

  return {
    async loadCurrent(walletAddress, requestId) {
      try {
        const result = await gateway.loadCurrent(walletAddress, requestId, manifestReadRateLimit);
        if (typeof result === 'string') return mapFailure(result);
        return validateWorld(result, publicAssetUrl);
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        logger.child({ requestId }).error('world.current.failed', { error });
        throw new PublicApiError(503, 'WORLD_UNAVAILABLE');
      }
    },
    async loadPublishedManifest(walletAddress, mapId, requestId) {
      const parsed = mapIdSchema.safeParse(mapId);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_REQUEST');
      try {
        const result = await gateway.loadPublishedManifest(
          walletAddress,
          parsed.data,
          requestId,
          manifestReadRateLimit,
        );
        if (typeof result === 'string') return mapFailure(result);
        return validatePublishedManifest(result, publicAssetUrl);
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        logger.child({ requestId }).error('world.manifest.failed', { error });
        throw new PublicApiError(503, 'WORLD_UNAVAILABLE');
      }
    },
    async transition(walletAddress, body, requestId) {
      const parsed = transitionInputSchema.safeParse(body);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_WORLD_TRANSITION');
      try {
        const result = await gateway.transition(
          walletAddress,
          parsed.data,
          requestId,
          transitionRateLimit,
        );
        if (typeof result === 'string') return mapFailure(result);
        const validated = validateTransition(result, publicAssetUrl);
        logger.child({ requestId }).info('world.transition.completed', {
          exitId: validated.transition.exitId,
          fromMapId: validated.transition.fromMapId,
          toMapId: validated.transition.toMapId,
          mapVersionId: validated.version.id,
        });
        return validated;
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        logger.child({ requestId }).error('world.transition.failed', { error });
        throw new PublicApiError(503, 'WORLD_UNAVAILABLE');
      }
    },
  };
}
