import type { FastifyInstance } from 'fastify';

import type { PlayerService } from '../player/contracts.js';
import { authorizePlayerRequest, requirePlayerEntry } from '../player/http-authorization.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  disableResponseCaching,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';
import type { PlayerWorldService } from '../world/player-contracts.js';

const PREFIX = '/api/v1/token-access/player/world';
const TRANSITION_BODY_LIMIT = 2_048;

function property(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

export function registerPlayerWorldRoutes(
  app: FastifyInstance,
  options: {
    readonly worldService: PlayerWorldService;
    readonly playerService: PlayerService;
    readonly tokenAccessService: TokenAccessService;
    readonly cookie: TokenAccessCookieOptions;
    readonly allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get(`${PREFIX}/current`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizePlayerRequest(
      request,
      reply,
      options.tokenAccessService,
      options.cookie,
    );
    await requirePlayerEntry(options.playerService, walletAddress, request.id, false, false);
    return {
      success: true,
      data: await options.worldService.loadCurrent(walletAddress, request.id),
      requestId: request.id,
    };
  });

  app.get(`${PREFIX}/maps/:mapId/manifest`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizePlayerRequest(
      request,
      reply,
      options.tokenAccessService,
      options.cookie,
    );
    await requirePlayerEntry(options.playerService, walletAddress, request.id, false, false);
    const data = await options.worldService.loadPublishedManifest(
      walletAddress,
      property(request.params, 'mapId'),
      request.id,
    );
    void reply.header('etag', `"${data.version.checksum}"`);
    void reply.header('cache-control', 'private, no-cache, must-revalidate');
    return { success: true, data, requestId: request.id };
  });

  app.post(`${PREFIX}/transition`, { bodyLimit: TRANSITION_BODY_LIMIT }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const walletAddress = await authorizePlayerRequest(
      request,
      reply,
      options.tokenAccessService,
      options.cookie,
    );
    await requirePlayerEntry(options.playerService, walletAddress, request.id, false, false);
    return {
      success: true,
      data: await options.worldService.transition(walletAddress, request.body, request.id),
      requestId: request.id,
    };
  });
}
