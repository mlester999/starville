import {
  isPositionWalkable,
  PLAYER_FOOT_RADIUS,
  playerProfileCreateSchema,
  playerProfileUpdateSchema,
  playerStateWriteSchema,
  type PlayerProfile,
  type MapId,
  type MapManifest,
} from '@starville/game-core';
import { getWorldManifest } from '@starville/game-content';
import type { PlayerEntryProfile } from '@starville/player-operations';
import { z } from 'zod';

import type { ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type { PlayerGateway, PlayerService } from './contracts.js';
import { PlayerPersistenceError } from './gateway.js';

const PROFILE_WRITE_RATE_LIMIT = 6;
const STATE_WRITE_RATE_LIMIT = 30;

export interface CreatePlayerServiceOptions {
  readonly gateway: PlayerGateway;
  readonly logger: ServiceLogger;
  readonly worldManifestLoader?: (
    walletAddress: string,
    mapId: MapId,
    requestId: string,
  ) => Promise<MapManifest | undefined>;
}

async function safeResumeProfile(
  profile: PlayerProfile,
  walletAddress: string,
  logger: ServiceLogger,
  requestId: string,
  loadManifest: NonNullable<CreatePlayerServiceOptions['worldManifestLoader']>,
) {
  const manifest = await loadManifest(walletAddress, profile.mapId, requestId);
  if (manifest === undefined) return profile;
  const valid =
    profile.mapId === manifest.id &&
    isPositionWalkable(
      { x: profile.x, y: profile.y },
      PLAYER_FOOT_RADIUS,
      manifest.safeSaveBounds,
      manifest.collisions,
    );

  if (valid) {
    return profile;
  }

  logger.child({ requestId }).warn('player.resume.fallback', {
    profileId: profile.id,
    reason: 'invalid_or_blocked_position',
  });

  const fallback = await loadManifest(walletAddress, 'lantern-square', requestId);
  if (fallback === undefined) return profile;
  return {
    ...profile,
    mapId: fallback.id,
    x: fallback.spawn.x,
    y: fallback.spawn.y,
    facingDirection: 'south' as const,
  };
}

function persistenceFailure(
  logger: ServiceLogger,
  requestId: string,
  operation: string,
  error: unknown,
): never {
  const details =
    error instanceof PlayerPersistenceError
      ? {
          operation,
          stage: error.stage,
          rpcName: error.details.rpcName,
          postgresCode: error.details.postgresCode,
          parseIssues: error.details.parseIssues,
          status: error.details.status,
          failureName: error.name,
        }
      : {
          operation,
          stage: 'unknown',
          failureName: error instanceof Error ? error.name : 'unknown',
        };

  logger.child({ requestId }).error('player.persistence.unavailable', details);
  throw new PublicApiError(503, 'PLAYER_PERSISTENCE_UNAVAILABLE');
}

function expectProfile(
  result:
    | PlayerProfile
    | PlayerEntryProfile
    | 'not_found'
    | 'rate_limited'
    | 'suspended'
    | 'rename_required'
    | 'rename_not_required'
    | 'name_unchanged'
    | 'game_state_version_conflict',
  missingCode: 'PLAYER_PROFILE_REQUIRED' | 'PLAYER_PROFILE_NOT_FOUND',
): PlayerProfile {
  if (result === 'rate_limited') {
    throw new PublicApiError(429, 'RATE_LIMITED');
  }
  if (result === 'not_found') {
    throw new PublicApiError(404, missingCode);
  }
  if (result === 'suspended') throw new PublicApiError(403, 'PLAYER_SUSPENDED');
  if (result === 'rename_required') {
    throw new PublicApiError(409, 'PLAYER_RENAME_REQUIRED');
  }
  if (result === 'rename_not_required') {
    throw new PublicApiError(409, 'PLAYER_OPERATION_CONFLICT');
  }
  if (result === 'name_unchanged') throw new PublicApiError(400, 'PLAYER_NAME_UNCHANGED');
  if (result === 'game_state_version_conflict') {
    throw new PublicApiError(409, 'PLAYER_STATE_VERSION_CONFLICT');
  }
  return 'entryState' in result ? result.profile : result;
}

export function createPlayerService({
  gateway,
  logger,
  worldManifestLoader = async (_walletAddress, mapId) => getWorldManifest(mapId),
}: CreatePlayerServiceOptions): PlayerService {
  return {
    async loadEntry(walletAddress, requestId, touchEntry) {
      try {
        const entry = await gateway.loadEntry(walletAddress, requestId, touchEntry);
        return entry === 'not_found'
          ? undefined
          : {
              ...entry,
              profile: await safeResumeProfile(
                entry.profile,
                walletAddress,
                logger,
                requestId,
                worldManifestLoader,
              ),
            };
      } catch (error) {
        return persistenceFailure(logger, requestId, 'loadEntry', error);
      }
    },

    async createProfile(walletAddress, input, requestId) {
      const parsed = playerProfileCreateSchema.safeParse(input);
      if (!parsed.success) {
        throw new PublicApiError(400, 'INVALID_PLAYER_PROFILE');
      }

      try {
        const profile = expectProfile(
          await gateway.createProfile(
            walletAddress,
            parsed.data,
            requestId,
            PROFILE_WRITE_RATE_LIMIT,
          ),
          'PLAYER_PROFILE_NOT_FOUND',
        );
        logger.child({ requestId }).info('player.profile.ready', { profileId: profile.id });
        return safeResumeProfile(profile, walletAddress, logger, requestId, worldManifestLoader);
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        return persistenceFailure(logger, requestId, 'createProfile', error);
      }
    },

    async updateProfile(walletAddress, input, requestId) {
      const parsed = playerProfileUpdateSchema.safeParse(input);
      if (!parsed.success) {
        throw new PublicApiError(400, 'INVALID_PLAYER_PROFILE');
      }

      try {
        return expectProfile(
          await gateway.updateProfile(
            walletAddress,
            parsed.data,
            requestId,
            PROFILE_WRITE_RATE_LIMIT,
          ),
          'PLAYER_PROFILE_NOT_FOUND',
        );
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        return persistenceFailure(logger, requestId, 'updateProfile', error);
      }
    },

    async completeRename(walletAddress, input, requestId) {
      const parsed = z
        .object({ displayName: playerProfileCreateSchema.shape.displayName })
        .strict()
        .safeParse(input);
      if (!parsed.success) throw new PublicApiError(400, 'INVALID_PLAYER_PROFILE');

      try {
        return expectProfile(
          await gateway.completeRename(
            walletAddress,
            parsed.data.displayName,
            requestId,
            PROFILE_WRITE_RATE_LIMIT,
          ),
          'PLAYER_PROFILE_NOT_FOUND',
        );
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        return persistenceFailure(logger, requestId, 'completeRename', error);
      }
    },

    async saveState(walletAddress, input, requestId) {
      const parsed = playerStateWriteSchema.safeParse(input);
      if (!parsed.success) {
        throw new PublicApiError(400, 'INVALID_PLAYER_STATE');
      }

      const manifest = await worldManifestLoader(walletAddress, parsed.data.mapId, requestId);
      if (
        manifest === undefined ||
        parsed.data.mapId !== manifest.id ||
        !isPositionWalkable(
          parsed.data,
          PLAYER_FOOT_RADIUS,
          manifest.safeSaveBounds,
          manifest.collisions,
        )
      ) {
        throw new PublicApiError(422, 'UNSAFE_PLAYER_POSITION');
      }

      try {
        return expectProfile(
          await gateway.saveState(walletAddress, parsed.data, requestId, STATE_WRITE_RATE_LIMIT),
          'PLAYER_PROFILE_REQUIRED',
        );
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        return persistenceFailure(logger, requestId, 'saveState', error);
      }
    },
  };
}
