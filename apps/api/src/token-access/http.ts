import type { FastifyReply, FastifyRequest } from 'fastify';

import { PublicApiError } from '../errors.js';

export const TOKEN_ACCESS_COOKIE_NAME = 'starville-token-access';
export const TOKEN_ACCESS_COOKIE_PATH = '/api/v1/token-access';

export interface TokenAccessCookieOptions {
  readonly secure: boolean;
  readonly maxAgeSeconds: number;
}

function commonCookieOptions(options: TokenAccessCookieOptions) {
  return {
    path: TOKEN_ACCESS_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: options.secure,
  };
}

export function setTokenAccessCookie(
  reply: FastifyReply,
  token: string,
  options: TokenAccessCookieOptions,
): void {
  void reply.setCookie(TOKEN_ACCESS_COOKIE_NAME, token, {
    ...commonCookieOptions(options),
    maxAge: options.maxAgeSeconds,
  });
}

export function clearTokenAccessCookie(
  reply: FastifyReply,
  options: TokenAccessCookieOptions,
): void {
  void reply.clearCookie(TOKEN_ACCESS_COOKIE_NAME, commonCookieOptions(options));
}

export function readTokenAccessCookie(request: FastifyRequest): string | undefined {
  return request.cookies[TOKEN_ACCESS_COOKIE_NAME];
}

export function assertTrustedBrowserMutation(
  request: FastifyRequest,
  allowedOrigins: ReadonlySet<string>,
): void {
  const origin = request.headers.origin;

  if (origin === undefined || !allowedOrigins.has(origin)) {
    throw new PublicApiError(403, 'ORIGIN_NOT_ALLOWED');
  }

  if (request.method === 'POST') {
    const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();

    if (contentType !== 'application/json') {
      throw new PublicApiError(400, 'INVALID_REQUEST');
    }
  }
}

export function disableResponseCaching(reply: FastifyReply): void {
  void reply.header('cache-control', 'no-store');
  void reply.header('pragma', 'no-cache');
}
