import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  cosmeticEmoteActivationSchema,
  cosmeticEmoteWheelSchema,
  mutateCosmeticLoadoutSchema,
  renameCosmeticLoadoutSchema,
  saveCosmeticLoadoutSchema,
} from '@starville/cosmetics';
import { avatarStableKeySchema } from '@starville/avatar';
import { hashAccessSessionToken } from '@starville/wallet-access/server';

import type {
  CosmeticPlayerContext,
  CosmeticService,
  CosmeticGateway,
} from '../cosmetics/contracts.js';
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

const PREFIX = '/api/v1/token-access/player/cosmetics';
const BODY_LIMIT = 32_768;
const loadoutParamsSchema = z.object({ loadoutId: z.uuid() }).strict();
const collectionParamsSchema = z.object({ collectionKey: avatarStableKeySchema }).strict();
const applyLoadoutSchema = z
  .object({
    expectedLoadoutRevision: z.number().int().positive(),
    expectedAvatarRevision: z.number().int().nonnegative(),
    requestId: z.uuid(),
  })
  .strict();
const claimSchema = z.object({ requestId: z.uuid() }).strict();

export interface RegisterCosmeticRoutesOptions {
  readonly service: CosmeticService;
  readonly gateway: CosmeticGateway;
  readonly playerService: PlayerService;
  readonly tokenAccessService: TokenAccessService;
  readonly cookie: TokenAccessCookieOptions;
  readonly cookieHashSecret: string;
  readonly allowedOrigins: ReadonlySet<string>;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_COSMETIC_REQUEST');
  return parsed.data;
}

async function authorize(
  request: FastifyRequest,
  reply: FastifyReply,
  options: RegisterCosmeticRoutesOptions,
): Promise<CosmeticPlayerContext> {
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

export function registerCosmeticRoutes(
  app: FastifyInstance,
  options: RegisterCosmeticRoutesOptions,
): void {
  app.get(PREFIX, async (request, reply) => {
    disableResponseCaching(reply);
    const context = await authorize(request, reply, options);
    return { success: true, data: await options.service.wardrobe(context), requestId: request.id };
  });

  app.post(`${PREFIX}/loadouts`, { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const context = await authorize(request, reply, options);
    const input = parse(saveCosmeticLoadoutSchema, request.body);
    return {
      success: true,
      data: await options.service.mutate(() => options.gateway.saveLoadout(context, input)),
      requestId: request.id,
    };
  });

  app.patch(`${PREFIX}/loadouts/:loadoutId/name`, { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const context = await authorize(request, reply, options);
    const { loadoutId } = parse(loadoutParamsSchema, request.params);
    const input = parse(renameCosmeticLoadoutSchema, request.body);
    return {
      success: true,
      data: await options.service.mutate(() =>
        options.gateway.renameLoadout(context, loadoutId, input),
      ),
      requestId: request.id,
    };
  });

  app.delete(`${PREFIX}/loadouts/:loadoutId`, { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const context = await authorize(request, reply, options);
    const { loadoutId } = parse(loadoutParamsSchema, request.params);
    const input = parse(mutateCosmeticLoadoutSchema, request.body);
    return {
      success: true,
      data: await options.service.mutate(() =>
        options.gateway.deleteLoadout(context, loadoutId, input),
      ),
      requestId: request.id,
    };
  });

  app.post(`${PREFIX}/loadouts/:loadoutId/apply`, { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const context = await authorize(request, reply, options);
    const { loadoutId } = parse(loadoutParamsSchema, request.params);
    const input = parse(applyLoadoutSchema, request.body);
    return {
      success: true,
      data: await options.service.mutate(() =>
        options.gateway.applyLoadout(context, loadoutId, input),
      ),
      requestId: request.id,
    };
  });

  app.put(`${PREFIX}/emote-wheel`, { bodyLimit: 8_192 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const context = await authorize(request, reply, options);
    const input = parse(cosmeticEmoteWheelSchema, request.body);
    return {
      success: true,
      data: await options.service.mutate(() => options.gateway.updateEmoteWheel(context, input)),
      requestId: request.id,
    };
  });

  app.post(`${PREFIX}/emotes/activate`, { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const baseContext = await authorize(request, reply, options);
    const input = parse(cosmeticEmoteActivationSchema, request.body);
    const context = { ...baseContext, requestId: input.requestId };
    return {
      success: true,
      data: await options.service.mutate(() =>
        options.gateway.activateEmote(context, input.emoteKey),
      ),
      requestId: request.id,
    };
  });

  app.post(
    `${PREFIX}/collections/:collectionKey/claim`,
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const baseContext = await authorize(request, reply, options);
      const { collectionKey } = parse(collectionParamsSchema, request.params);
      const input = parse(claimSchema, request.body);
      const context = { ...baseContext, requestId: input.requestId };
      return {
        success: true,
        data: await options.service.mutate(() =>
          options.gateway.claimCollection(context, collectionKey),
        ),
        requestId: request.id,
      };
    },
  );

  // Intentionally no purchase route. cosmetic_shop is a disabled preview in Phase 10B.
}
