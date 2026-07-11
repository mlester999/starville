import type { FastifyInstance } from 'fastify';

import {
  tokenAccessChallengeRequestSchema,
  tokenAccessVerifyRequestSchema,
} from '@starville/wallet-access';
import { hashAccessSessionToken } from '@starville/wallet-access/server';

import { PublicApiError } from '../errors.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  clearTokenAccessCookie,
  disableResponseCaching,
  readTokenAccessCookie,
  setTokenAccessCookie,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';

export interface RegisterTokenAccessRoutesOptions {
  readonly service: TokenAccessService;
  readonly cookie: TokenAccessCookieOptions;
  readonly cookieHashSecret: string;
  readonly allowedOrigins: ReadonlySet<string>;
}

function parseRequestBody<T>(
  parser: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  body: unknown,
): T {
  const result = parser.safeParse(body);

  if (!result.success) {
    throw new PublicApiError(400, 'INVALID_REQUEST');
  }

  return result.data;
}

export function registerTokenAccessRoutes(
  app: FastifyInstance,
  options: RegisterTokenAccessRoutesOptions,
): void {
  const { service, cookie, cookieHashSecret, allowedOrigins } = options;

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/v1/token-access')) {
      disableResponseCaching(reply);
    }
  });

  app.get('/api/v1/token-access/config', async (request) => ({
    success: true,
    data: await service.getPublicConfig(),
    requestId: request.id,
  }));

  app.post('/api/v1/token-access/challenge', async (request) => {
    assertTrustedBrowserMutation(request, allowedOrigins);
    const input = parseRequestBody(tokenAccessChallengeRequestSchema, request.body);
    const userAgent = request.headers['user-agent'];
    const data = await service.createChallenge({
      ...input,
      requestId: request.id,
      ipHash: hashAccessSessionToken(request.ip, cookieHashSecret),
      ...(userAgent === undefined
        ? {}
        : { userAgentHash: hashAccessSessionToken(userAgent, cookieHashSecret) }),
    });

    return { success: true, data, requestId: request.id };
  });

  app.post('/api/v1/token-access/verify', async (request, reply) => {
    assertTrustedBrowserMutation(request, allowedOrigins);
    const input = parseRequestBody(tokenAccessVerifyRequestSchema, request.body);
    const result = await service.verify({
      ...input,
      requestId: request.id,
      ipHash: hashAccessSessionToken(request.ip, cookieHashSecret),
    });

    if (result.clearCookie) {
      clearTokenAccessCookie(reply, cookie);
    }
    if (result.sessionToken !== undefined) {
      setTokenAccessCookie(reply, result.sessionToken, cookie);
    }

    return { success: true, data: result.view, requestId: request.id };
  });

  app.get('/api/v1/token-access/me', async (request, reply) => {
    try {
      const result = await service.getCurrentSession(readTokenAccessCookie(request), request.id);

      if (result.clearCookie) {
        clearTokenAccessCookie(reply, cookie);
      }

      return { success: true, data: result.view, requestId: request.id };
    } catch (error) {
      clearTokenAccessCookie(reply, cookie);
      throw error;
    }
  });

  app.post('/api/v1/token-access/recheck', async (request, reply) => {
    assertTrustedBrowserMutation(request, allowedOrigins);
    parseRequestBody(
      {
        safeParse: (value: unknown) =>
          value === undefined ||
          (typeof value === 'object' && value !== null && Object.keys(value).length === 0)
            ? ({ success: true, data: {} } as const)
            : ({ success: false } as const),
      },
      request.body,
    );

    try {
      const result = await service.recheck(readTokenAccessCookie(request), request.id);

      if (result.clearCookie) {
        clearTokenAccessCookie(reply, cookie);
      }

      return { success: true, data: result.view, requestId: request.id };
    } catch (error) {
      if (!(error instanceof PublicApiError) || error.code !== 'RATE_LIMITED') {
        clearTokenAccessCookie(reply, cookie);
      }
      throw error;
    }
  });

  app.delete('/api/v1/token-access/session', async (request, reply) => {
    assertTrustedBrowserMutation(request, allowedOrigins);
    const revoked = await service.revoke(readTokenAccessCookie(request), request.id, 'disconnect');
    clearTokenAccessCookie(reply, cookie);
    return { success: true, data: { revoked }, requestId: request.id };
  });
}
