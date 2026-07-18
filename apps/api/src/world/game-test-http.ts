import type { FastifyReply, FastifyRequest } from 'fastify';

export const WORLD_GAME_TEST_COOKIE_NAME = 'starville-world-game-test';
export const WORLD_GAME_TEST_COOKIE_PATH = '/api/v1/game-test';

export interface WorldGameTestCookieOptions {
  readonly secure: boolean;
  readonly maxAgeSeconds: number;
}

function common(options: WorldGameTestCookieOptions) {
  return {
    path: WORLD_GAME_TEST_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: options.secure,
  };
}

export function setWorldGameTestCookie(
  reply: FastifyReply,
  token: string,
  options: WorldGameTestCookieOptions,
): void {
  void reply.setCookie(WORLD_GAME_TEST_COOKIE_NAME, token, {
    ...common(options),
    maxAge: options.maxAgeSeconds,
  });
}

export function clearWorldGameTestCookie(
  reply: FastifyReply,
  options: WorldGameTestCookieOptions,
): void {
  void reply.clearCookie(WORLD_GAME_TEST_COOKIE_NAME, common(options));
}

export function readWorldGameTestCookie(request: FastifyRequest): string | undefined {
  return request.cookies[WORLD_GAME_TEST_COOKIE_NAME];
}

export function secureWorldGameTestResponse(reply: FastifyReply): void {
  void reply.header('cache-control', 'no-store');
  void reply.header('pragma', 'no-cache');
  void reply.header('x-robots-tag', 'noindex, nofollow, noarchive');
  void reply.header('referrer-policy', 'no-referrer');
}
