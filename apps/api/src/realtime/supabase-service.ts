import { z } from 'zod';

import type { SupabaseRealtimeEnvironment } from '@starville/realtime';
import { hashAccessSessionToken } from '@starville/wallet-access/server';

import { PublicApiError } from '../errors.js';
import type {
  SupabaseRealtimeAuthorizationService,
  SupabaseRealtimeGateway,
} from './supabase-contracts.js';

const bearerTokenSchema = z
  .string()
  .trim()
  .min(32)
  .max(8192)
  .regex(/^[A-Za-z0-9._~-]+$/u);

export function createSupabaseRealtimeAuthorizationService(options: {
  readonly gateway: SupabaseRealtimeGateway;
  readonly environment: SupabaseRealtimeEnvironment;
  readonly accessTokenSecret: string;
}): SupabaseRealtimeAuthorizationService {
  async function identity(bearerToken: string | undefined): Promise<string> {
    const token = bearerTokenSchema.safeParse(bearerToken);
    if (!token.success) throw new PublicApiError(401, 'AUTHENTICATION_REQUIRED');
    const authUserId = await options.gateway.verifyPlayerIdentity(token.data);
    if (authUserId === undefined) throw new PublicApiError(401, 'AUTHENTICATION_REQUIRED');
    return authUserId;
  }

  function accessTokenHash(rawAccessToken: string | undefined): string {
    if (rawAccessToken === undefined || !/^[A-Za-z0-9_-]{43}$/u.test(rawAccessToken)) {
      throw new PublicApiError(401, 'TOKEN_ACCESS_REQUIRED');
    }
    return hashAccessSessionToken(rawAccessToken, options.accessTokenSecret);
  }

  function mapPlayerStatus(status: string): never {
    if (status === 'player_suspended') throw new PublicApiError(403, 'PLAYER_SUSPENDED');
    if (status === 'rename_required') throw new PublicApiError(409, 'PLAYER_RENAME_REQUIRED');
    if (status === 'maintenance') throw new PublicApiError(503, 'GAME_MAINTENANCE');
    if (status === 'profile_required') throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
    if (status === 'world_unavailable') throw new PublicApiError(503, 'WORLD_UNAVAILABLE');
    if (status === 'auth_identity_conflict') {
      throw new PublicApiError(409, 'PLAYER_AUTH_IDENTITY_CONFLICT');
    }
    if (status === 'auth_identity_invalid') {
      throw new PublicApiError(401, 'AUTHENTICATION_REQUIRED');
    }
    throw new PublicApiError(401, 'TOKEN_ACCESS_REQUIRED');
  }

  return {
    async issuePlayerSession(input) {
      const result = await options.gateway.issuePlayerSession({
        accessSessionTokenHash: accessTokenHash(input.rawAccessToken),
        requestId: input.requestId,
      });
      if (result.status !== 'issued') return mapPlayerStatus(result.status);
      return { tokenHash: result.tokenHash, tokenType: result.tokenType };
    },
    async authorize(input) {
      const requested = z.uuid().optional().safeParse(input.requestedChannelId);
      if (!requested.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      const result = await options.gateway.authorize({
        authUserId: await identity(input.bearerToken),
        accessSessionTokenHash: accessTokenHash(input.rawAccessToken),
        environment: options.environment,
        ...(requested.data === undefined ? {} : { requestedChannelId: requested.data }),
        requestId: input.requestId,
      });
      if (result.status === 'authorized') {
        if (
          result.self.worldId !== input.expectedWorldId ||
          result.self.worldVersionId !== input.expectedWorldVersionId
        ) {
          throw new PublicApiError(409, 'WORLD_VERSION_CONFLICT');
        }
        return {
          membershipId: result.membershipId,
          topic: result.topic,
          authorizationExpiresAt: result.authorizationExpiresAt,
          self: result.self,
          channels: result.channels,
        };
      }
      if (result.status === 'channel_unavailable' || result.status === 'channel_full') {
        throw new PublicApiError(409, 'REALTIME_CHANNEL_UNAVAILABLE');
      }
      if (result.status === 'environment_mismatch') {
        throw new PublicApiError(503, 'REALTIME_UNAVAILABLE');
      }
      return mapPlayerStatus(result.status);
    },
    async close(input) {
      const membership = z.uuid().safeParse(input.membershipId);
      if (!membership.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      await options.gateway.close({
        authUserId: await identity(input.bearerToken),
        membershipId: membership.data,
        requestId: input.requestId,
      });
    },
  };
}
