import type { FastifyInstance } from 'fastify';

import { PublicApiError } from '../errors.js';
import type { PlayerService } from '../player/contracts.js';
import { authorizePlayerRequest, requirePlayerEntry } from '../player/http-authorization.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';
import type { LiveOperationsService } from '../live-operations/contracts.js';

const PLAYER_API_PREFIX = '/api/v1/token-access/player';
const BODY_LIMIT_BYTES = 4_096;

export interface RegisterPlayerRoutesOptions {
  readonly playerService: PlayerService;
  readonly tokenAccessService: TokenAccessService;
  readonly cookie: TokenAccessCookieOptions;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly liveOperationsService?: LiveOperationsService;
}

function stateView(profile: Awaited<ReturnType<PlayerService['saveState']>>) {
  return {
    mapId: profile.mapId,
    x: profile.x,
    y: profile.y,
    facingDirection: profile.facingDirection,
    gameStateVersion: profile.gameStateVersion,
    updatedAt: profile.updatedAt,
  } as const;
}

export function registerPlayerRoutes(
  app: FastifyInstance,
  options: RegisterPlayerRoutesOptions,
): void {
  const { playerService, tokenAccessService, cookie, allowedOrigins } = options;

  app.get(`${PLAYER_API_PREFIX}/profile`, async (request, reply) => {
    if ((await options.liveOperationsService?.getPublic(request.id))?.maintenance.active === true) {
      throw new PublicApiError(503, 'GAME_MAINTENANCE');
    }
    const walletAddress = await authorizePlayerRequest(request, reply, tokenAccessService, cookie);
    const entry = await requirePlayerEntry(playerService, walletAddress, request.id, true, true);
    return {
      success: true,
      data: {
        profile: entry?.profile ?? null,
        entryState: entry?.entryState ?? 'active',
      },
      requestId: request.id,
    };
  });

  app.post(
    `${PLAYER_API_PREFIX}/profile`,
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, allowedOrigins);
      const walletAddress = await authorizePlayerRequest(
        request,
        reply,
        tokenAccessService,
        cookie,
      );
      await requirePlayerEntry(playerService, walletAddress, request.id, false, false);
      const profile = await playerService.createProfile(walletAddress, request.body, request.id);
      return {
        success: true,
        data: { profile, entryState: 'active' },
        requestId: request.id,
      };
    },
  );

  app.patch(
    `${PLAYER_API_PREFIX}/profile`,
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, allowedOrigins);
      const walletAddress = await authorizePlayerRequest(
        request,
        reply,
        tokenAccessService,
        cookie,
      );
      const profile = await playerService.updateProfile(walletAddress, request.body, request.id);
      return {
        success: true,
        data: { profile, entryState: 'active' },
        requestId: request.id,
      };
    },
  );

  app.post(
    `${PLAYER_API_PREFIX}/rename`,
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, allowedOrigins);
      const walletAddress = await authorizePlayerRequest(
        request,
        reply,
        tokenAccessService,
        cookie,
      );
      const entry = await requirePlayerEntry(playerService, walletAddress, request.id, true, false);
      if (entry === undefined) throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
      if (entry.entryState !== 'rename_required') {
        throw new PublicApiError(409, 'PLAYER_OPERATION_CONFLICT');
      }
      const profile = await playerService.completeRename(walletAddress, request.body, request.id);
      return {
        success: true,
        data: { profile, entryState: 'active' },
        requestId: request.id,
      };
    },
  );

  app.get(`${PLAYER_API_PREFIX}/state`, async (request, reply) => {
    const walletAddress = await authorizePlayerRequest(request, reply, tokenAccessService, cookie);
    const entry = await requirePlayerEntry(playerService, walletAddress, request.id, false, false);
    if (entry === undefined) {
      throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
    }
    return { success: true, data: stateView(entry.profile), requestId: request.id };
  });

  app.put(`${PLAYER_API_PREFIX}/state`, { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    assertTrustedBrowserMutation(request, allowedOrigins);
    const walletAddress = await authorizePlayerRequest(request, reply, tokenAccessService, cookie);
    const profile = await playerService.saveState(walletAddress, request.body, request.id);
    return { success: true, data: stateView(profile), requestId: request.id };
  });
}
