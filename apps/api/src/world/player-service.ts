import { z } from 'zod';

import { mapIdSchema, validateMapManifest } from '@starville/game-core';
import { WORLD_ASSET_CATALOG } from '@starville/game-content';

import type { ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type {
  PlayerWorldFailure,
  PlayerWorldGateway,
  PlayerWorldService,
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

function validatePublishedManifest<View extends PublishedManifestView>(view: View): View {
  try {
    const manifest = validateMapManifest(view.manifest, WORLD_ASSET_CATALOG);
    if (manifest.id !== view.map.slug || manifest.version !== view.version.versionNumber) {
      throw new Error('Published manifest identity mismatch');
    }
    return { ...view, manifest };
  } catch {
    throw new PublicApiError(503, 'WORLD_CONTENT_INVALID');
  }
}

function validateWorld(view: PublishedWorldView): PublishedWorldView {
  const validated = validatePublishedManifest(view);
  if (
    validated.playerState.mapId !== validated.map.slug ||
    validated.playerState.mapVersionId !== validated.version.id
  ) {
    throw new PublicApiError(503, 'WORLD_CONTENT_INVALID');
  }
  return validated;
}

function validateTransition(view: WorldTransitionView): WorldTransitionView {
  const validated = validateWorld(view) as WorldTransitionView;
  if (validated.transition.toMapId !== validated.map.slug) {
    throw new PublicApiError(503, 'WORLD_CONTENT_INVALID');
  }
  return validated;
}

export function createPlayerWorldService(options: {
  readonly gateway: PlayerWorldGateway;
  readonly logger: ServiceLogger;
  readonly manifestReadRateLimit: number;
  readonly transitionRateLimit: number;
}): PlayerWorldService {
  const { gateway, logger, manifestReadRateLimit, transitionRateLimit } = options;

  return {
    async loadCurrent(walletAddress, requestId) {
      try {
        const result = await gateway.loadCurrent(walletAddress, requestId, manifestReadRateLimit);
        if (typeof result === 'string') return mapFailure(result);
        return validateWorld(result);
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
        return validatePublishedManifest(result);
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
        const validated = validateTransition(result);
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
