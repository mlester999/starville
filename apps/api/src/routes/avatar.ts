import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { resolvedPublicAvatarSchema, type AvatarProfile } from '@starville/avatar';
import { hashAccessSessionToken } from '@starville/wallet-access/server';

import type { AvatarPlayerContext, AvatarService } from '../avatar/contracts.js';
import { PublicApiError } from '../errors.js';
import type { PlayerService } from '../player/contracts.js';
import { authorizePlayerRequest, requirePlayerEntry } from '../player/http-authorization.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  disableResponseCaching,
  readTokenAccessCookie,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';

const AVATAR_PREFIX = '/api/v1/token-access/player/avatar';
const AVATAR_BODY_LIMIT = 8_192;

export interface RegisterAvatarRoutesOptions {
  readonly service: AvatarService;
  readonly playerService: PlayerService;
  readonly tokenAccessService: TokenAccessService;
  readonly cookie: TokenAccessCookieOptions;
  readonly cookieHashSecret: string;
  readonly allowedOrigins: ReadonlySet<string>;
}

async function authorizeAvatarPlayer(
  request: FastifyRequest,
  reply: FastifyReply,
  options: RegisterAvatarRoutesOptions,
): Promise<AvatarPlayerContext> {
  const walletAddress = await authorizePlayerRequest(
    request,
    reply,
    options.tokenAccessService,
    options.cookie,
  );
  const entry = await requirePlayerEntry(
    options.playerService,
    walletAddress,
    request.id,
    false,
    false,
  );
  if (entry === undefined) throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
  const token = readTokenAccessCookie(request);
  if (token === undefined || !/^[A-Za-z0-9_-]{43}$/u.test(token)) {
    throw new PublicApiError(401, 'TOKEN_ACCESS_REQUIRED');
  }
  return {
    walletAddress,
    accessSessionTokenHash: hashAccessSessionToken(token, options.cookieHashSecret),
    requestId: request.id,
  };
}

function resolvedProfile(profile: AvatarProfile) {
  return resolvedPublicAvatarSchema.parse({
    appearanceId: profile.appearanceId,
    revision: profile.revision,
    legacyFallbackPreset: profile.legacyFallbackPreset,
    selection: profile.selection,
    presetKey: profile.presetKey,
  });
}

export function registerAvatarRoutes(
  app: FastifyInstance,
  options: RegisterAvatarRoutesOptions,
): void {
  app.get(AVATAR_PREFIX, async (request, reply) => {
    disableResponseCaching(reply);
    const context = await authorizeAvatarPlayer(request, reply, options);
    const profile = await options.service.getProfile(context);
    return { success: true, data: { profile }, requestId: request.id };
  });

  app.get(`${AVATAR_PREFIX}/catalog`, async (request, reply) => {
    disableResponseCaching(reply);
    const context = await authorizeAvatarPlayer(request, reply, options);
    return {
      success: true,
      data: await options.service.getCatalog(context),
      requestId: request.id,
    };
  });

  app.post(`${AVATAR_PREFIX}/preview`, { bodyLimit: AVATAR_BODY_LIMIT }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const context = await authorizeAvatarPlayer(request, reply, options);
    const selection = await options.service.preview(context, request.body);
    return { success: true, data: { selection }, requestId: request.id };
  });

  app.post(AVATAR_PREFIX, { bodyLimit: AVATAR_BODY_LIMIT }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const context = await authorizeAvatarPlayer(request, reply, options);
    const profile = await options.service.create(context, request.body);
    return {
      success: true,
      data: { profile: resolvedProfile(profile) },
      requestId: request.id,
    };
  });

  app.patch(AVATAR_PREFIX, { bodyLimit: AVATAR_BODY_LIMIT }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const context = await authorizeAvatarPlayer(request, reply, options);
    const profile = await options.service.update(context, request.body);
    return {
      success: true,
      data: { profile: resolvedProfile(profile) },
      requestId: request.id,
    };
  });

  app.get(`${AVATAR_PREFIX}/public/:appearanceId`, async (request, reply) => {
    disableResponseCaching(reply);
    const params = z.object({ appearanceId: z.uuid() }).strict().safeParse(request.params);
    const query = z
      .object({ revision: z.coerce.number().int().nonnegative().optional() })
      .strict()
      .safeParse(request.query);
    if (!params.success || !query.success) {
      throw new PublicApiError(400, 'INVALID_AVATAR_REQUEST');
    }
    const appearance = await options.service.resolvePublic(params.data.appearanceId, request.id);
    return { success: true, data: { appearance }, requestId: request.id };
  });
}
