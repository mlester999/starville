import { z } from 'zod';

import {
  generateAccessSessionToken,
  hashAccessSessionToken,
} from '@starville/wallet-access/server';

import { PublicApiError } from '../errors.js';
import type { RealtimeTicketGateway, RealtimeTicketService } from './contracts.js';

export function createRealtimeTicketService(options: {
  readonly gateway: RealtimeTicketGateway;
  readonly accessTokenSecret: string;
  readonly ticketSecret: string;
  readonly createTicket?: () => string;
}): RealtimeTicketService {
  const createTicket = options.createTicket ?? generateAccessSessionToken;

  return {
    async issue(input) {
      if (
        input.rawAccessToken === undefined ||
        !/^[A-Za-z0-9_-]{43}$/u.test(input.rawAccessToken)
      ) {
        throw new PublicApiError(401, 'TOKEN_ACCESS_REQUIRED');
      }
      const requested = z.uuid().optional().safeParse(input.requestedChannelId);
      if (!requested.success) throw new PublicApiError(400, 'INVALID_REQUEST');

      const ticket = createTicket();
      const result = await options.gateway.issue({
        accessSessionTokenHash: hashAccessSessionToken(
          input.rawAccessToken,
          options.accessTokenSecret,
        ),
        ticketHash: hashAccessSessionToken(ticket, options.ticketSecret),
        ...(requested.data === undefined ? {} : { requestedChannelId: requested.data }),
        requestId: input.requestId,
      });

      if (result.status === 'issued') return { ticket, expiresAt: result.expiresAt };
      if (result.status === 'player_suspended') throw new PublicApiError(403, 'PLAYER_SUSPENDED');
      if (result.status === 'rename_required') {
        throw new PublicApiError(409, 'PLAYER_RENAME_REQUIRED');
      }
      if (result.status === 'maintenance') throw new PublicApiError(503, 'GAME_MAINTENANCE');
      if (result.status === 'channel_unavailable') {
        throw new PublicApiError(409, 'REALTIME_CHANNEL_UNAVAILABLE');
      }
      if (result.status === 'world_unavailable') {
        throw new PublicApiError(503, 'WORLD_UNAVAILABLE');
      }
      if (result.status === 'profile_required') {
        throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
      }
      throw new PublicApiError(401, 'TOKEN_ACCESS_REVOKED');
    },
    async issuePrivateHome(input) {
      if (
        input.rawAccessToken === undefined ||
        !/^[A-Za-z0-9_-]{43}$/u.test(input.rawAccessToken)
      ) {
        throw new PublicApiError(401, 'TOKEN_ACCESS_REQUIRED');
      }
      const homeId = z.uuid().safeParse(input.homeId);
      if (!homeId.success) throw new PublicApiError(400, 'INVALID_REQUEST');

      const ticket = createTicket();
      const result = await options.gateway.issuePrivateHome({
        accessSessionTokenHash: hashAccessSessionToken(
          input.rawAccessToken,
          options.accessTokenSecret,
        ),
        ticketHash: hashAccessSessionToken(ticket, options.ticketSecret),
        homeId: homeId.data,
        requestId: input.requestId,
      });

      if (result.status === 'issued') {
        return { ticket, homeId: result.homeId, expiresAt: result.expiresAt };
      }
      if (result.status === 'player_suspended') throw new PublicApiError(403, 'PLAYER_SUSPENDED');
      if (result.status === 'rename_required') {
        throw new PublicApiError(409, 'PLAYER_RENAME_REQUIRED');
      }
      if (result.status === 'maintenance') throw new PublicApiError(503, 'GAME_MAINTENANCE');
      if (result.status === 'plot_unavailable') throw new PublicApiError(404, 'PLOT_NOT_FOUND');
      if (result.status === 'plot_world_mismatch') {
        throw new PublicApiError(409, 'PLOT_WORLD_MISMATCH');
      }
      if (result.status === 'profile_required') {
        throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
      }
      if (result.status === 'world_unavailable' || result.status === 'world_changed') {
        throw new PublicApiError(503, 'WORLD_UNAVAILABLE');
      }
      throw new PublicApiError(401, 'TOKEN_ACCESS_REVOKED');
    },
  };
}
