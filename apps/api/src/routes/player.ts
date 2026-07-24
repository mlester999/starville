import type { FastifyInstance } from 'fastify';
import { homeVisitRealtimeTicketRequestSchema } from '@starville/housing';
import { z } from 'zod';

import { PublicApiError } from '../errors.js';
import type { PlayerService } from '../player/contracts.js';
import { authorizePlayerRequest, requirePlayerEntry } from '../player/http-authorization.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';
import type { LiveOperationsService } from '../live-operations/contracts.js';
import type { RealtimeTicketService } from '../realtime/contracts.js';
import { readTokenAccessCookie } from '../token-access/http.js';
import type { GameplayAssetOverrideService } from '../player/asset-override-contracts.js';
import type { SupabaseRealtimeAuthorizationService } from '../realtime/supabase-contracts.js';

const PLAYER_API_PREFIX = '/api/v1/token-access/player';
const BODY_LIMIT_BYTES = 4_096;
const supabaseRealtimeAuthorizationRequestSchema = z
  .object({
    worldId: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    worldVersionId: z.uuid(),
    channelId: z.uuid().optional(),
  })
  .strict();

export interface RegisterPlayerRoutesOptions {
  readonly playerService: PlayerService;
  readonly tokenAccessService: TokenAccessService;
  readonly cookie: TokenAccessCookieOptions;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly liveOperationsService?: LiveOperationsService;
  readonly realtimeTicketService?: RealtimeTicketService;
  readonly supabaseRealtimeService?: SupabaseRealtimeAuthorizationService;
  readonly assetOverrideService?: GameplayAssetOverrideService;
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
  const bearerToken = (authorization: string | undefined): string | undefined => {
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/u.exec(authorization ?? '');
    return match?.[1];
  };

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

  if (options.assetOverrideService !== undefined) {
    const assetOverrideService = options.assetOverrideService;
    app.post(
      `${PLAYER_API_PREFIX}/asset-overrides`,
      { bodyLimit: 8_192 },
      async (request, reply) => {
        assertTrustedBrowserMutation(request, allowedOrigins);
        const walletAddress = await authorizePlayerRequest(
          request,
          reply,
          tokenAccessService,
          cookie,
        );
        await requirePlayerEntry(playerService, walletAddress, request.id, false, false);
        const data = await assetOverrideService.load(walletAddress, request.body, request.id);
        void reply.header('cache-control', 'private, no-store');
        return { success: true, data, requestId: request.id };
      },
    );
  }

  if (options.realtimeTicketService !== undefined) {
    const realtimeTicketService = options.realtimeTicketService;
    app.post(`${PLAYER_API_PREFIX}/realtime-ticket`, async (request, reply) => {
      assertTrustedBrowserMutation(request, allowedOrigins);
      if (
        (await options.liveOperationsService?.getPublic(request.id))?.maintenance.active === true
      ) {
        throw new PublicApiError(503, 'GAME_MAINTENANCE');
      }
      const walletAddress = await authorizePlayerRequest(
        request,
        reply,
        tokenAccessService,
        cookie,
      );
      await requirePlayerEntry(playerService, walletAddress, request.id, false, false);
      const body = request.body as { readonly channelId?: unknown } | undefined;
      const data = await realtimeTicketService.issue({
        rawAccessToken: readTokenAccessCookie(request),
        requestedChannelId: body?.channelId,
        requestId: request.id,
      });
      return { success: true, data, requestId: request.id };
    });

    app.post(`${PLAYER_API_PREFIX}/private-home-realtime-ticket`, async (request, reply) => {
      assertTrustedBrowserMutation(request, allowedOrigins);
      if (
        (await options.liveOperationsService?.getPublic(request.id))?.maintenance.active === true
      ) {
        throw new PublicApiError(503, 'GAME_MAINTENANCE');
      }
      const walletAddress = await authorizePlayerRequest(
        request,
        reply,
        tokenAccessService,
        cookie,
      );
      await requirePlayerEntry(playerService, walletAddress, request.id, false, false);
      const body = request.body as { readonly homeId?: unknown } | undefined;
      const data = await realtimeTicketService.issuePrivateHome({
        rawAccessToken: readTokenAccessCookie(request),
        homeId: body?.homeId,
        requestId: request.id,
      });
      return { success: true, data, requestId: request.id };
    });

    app.post(`${PLAYER_API_PREFIX}/home-visit-realtime-ticket`, async (request, reply) => {
      assertTrustedBrowserMutation(request, allowedOrigins);
      const walletAddress = await authorizePlayerRequest(
        request,
        reply,
        tokenAccessService,
        cookie,
      );
      await requirePlayerEntry(playerService, walletAddress, request.id, false, false);
      const body = homeVisitRealtimeTicketRequestSchema.safeParse(request.body);
      if (!body.success) throw new PublicApiError(400, 'INVALID_HOME_VISIT_REQUEST');
      const data = await realtimeTicketService.issueHomeVisit({
        rawAccessToken: readTokenAccessCookie(request),
        participantId: body.data.participantId,
        requestId: request.id,
      });
      return { success: true, data, requestId: request.id };
    });
  }

  if (options.supabaseRealtimeService !== undefined) {
    const realtimeService = options.supabaseRealtimeService;
    app.post(
      `${PLAYER_API_PREFIX}/supabase-realtime/session`,
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
        const data = await realtimeService.issuePlayerSession({
          rawAccessToken: readTokenAccessCookie(request),
          requestId: request.id,
        });
        void reply.header('cache-control', 'private, no-store');
        return { success: true, data, requestId: request.id };
      },
    );

    app.post(
      `${PLAYER_API_PREFIX}/supabase-realtime/authorize`,
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
        const body = supabaseRealtimeAuthorizationRequestSchema.safeParse(request.body);
        if (!body.success) throw new PublicApiError(400, 'INVALID_REQUEST');
        const data = await realtimeService.authorize({
          bearerToken: bearerToken(request.headers.authorization),
          rawAccessToken: readTokenAccessCookie(request),
          expectedWorldId: body.data.worldId,
          expectedWorldVersionId: body.data.worldVersionId,
          requestedChannelId: body.data.channelId,
          requestId: request.id,
        });
        return { success: true, data, requestId: request.id };
      },
    );

    app.post(
      `${PLAYER_API_PREFIX}/supabase-realtime/close`,
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
        const body = request.body as { readonly membershipId?: unknown } | undefined;
        await realtimeService.close({
          bearerToken: bearerToken(request.headers.authorization),
          membershipId: body?.membershipId,
          requestId: request.id,
        });
        return { success: true, data: { closed: true }, requestId: request.id };
      },
    );
  }

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
