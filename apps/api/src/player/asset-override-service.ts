import {
  STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEY_SET,
  gameplayAssetOverrideSchema,
} from '@starville/asset-management';

import { assertInternalStoragePath } from '../asset-management/storage.js';
import { PublicApiError } from '../errors.js';
import {
  gameplayAssetOverrideRequestSchema,
  type CreateGameplayAssetOverrideServiceOptions,
  type GameplayAssetOverrideService,
  type PersistedGameplayAssetOverride,
} from './asset-override-contracts.js';

const DEFAULT_READ_RATE_LIMIT = 120;

function exactImmutableSourcePath(material: PersistedGameplayAssetOverride): string {
  const path = assertInternalStoragePath(material.deliverySourcePath);
  const expected = `starville/${material.assetKey}/v${String(material.versionNumber)}/source.webp`;
  if (path !== expected) throw new Error('Gameplay asset derivative identity differs from its key');
  return path;
}

export function createGameplayAssetOverrideService({
  gateway,
  logger,
  publicAssetUrl,
  readRateLimit = DEFAULT_READ_RATE_LIMIT,
}: CreateGameplayAssetOverrideServiceOptions): GameplayAssetOverrideService {
  return {
    async load(walletAddress, input, requestId) {
      const parsed = gameplayAssetOverrideRequestSchema.safeParse(input);
      if (
        !parsed.success ||
        parsed.data.assetKeys.some(
          (assetKey) => !STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEY_SET.has(assetKey),
        )
      ) {
        throw new PublicApiError(400, 'INVALID_ASSET_OVERRIDE_REQUEST');
      }

      try {
        const result = await gateway.loadActive(
          walletAddress,
          parsed.data.assetKeys,
          requestId,
          readRateLimit,
        );
        if (result === 'not_found') throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
        if (result === 'suspended') throw new PublicApiError(403, 'PLAYER_SUSPENDED');
        if (result === 'rename_required') {
          throw new PublicApiError(409, 'PLAYER_RENAME_REQUIRED');
        }
        if (result === 'rate_limited') throw new PublicApiError(429, 'RATE_LIMITED');

        const requested = new Set(parsed.data.assetKeys);
        const items = result.items.map((material) => {
          if (!requested.has(material.assetKey)) {
            throw new Error('Persistence returned an unrequested gameplay asset key');
          }
          return gameplayAssetOverrideSchema.parse({
            assetKey: material.assetKey,
            versionId: material.versionId,
            checksum: material.checksumSha256,
            source: 'active_uploaded',
            bundledManifestVersion: material.bundledManifestVersion,
            url: publicAssetUrl(exactImmutableSourcePath(material)),
            mediaType: material.mediaType,
            width: material.width,
            height: material.height,
            renderWidth: Math.round(material.renderWidth),
            renderHeight: Math.round(material.renderHeight),
            scale: material.scale,
            anchor: material.anchor,
            footAnchor: material.footAnchor,
            depthAnchor: material.depthAnchor,
            collision: material.collision,
            supportedRotations: material.supportedRotations,
            defaultRotation: material.defaultRotation,
            replacementAllowed: material.replacementAllowed,
          });
        });
        return { status: 'loaded', requestedKeyCount: result.requestedKeyCount, items };
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        logger.child({ requestId }).error('asset.gameplay_overrides.failed', {
          error,
          requestedKeyCount: parsed.data.assetKeys.length,
        });
        throw new PublicApiError(503, 'ASSET_OVERRIDE_UNAVAILABLE');
      }
    },
  };
}
