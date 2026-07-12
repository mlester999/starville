import type { FastifyReply, FastifyRequest } from 'fastify';

import { PublicApiError } from '../errors.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  clearTokenAccessCookie,
  readTokenAccessCookie,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';
import type { PlayerService } from './contracts.js';

export async function authorizePlayerRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  tokenAccessService: TokenAccessService,
  cookie: TokenAccessCookieOptions,
): Promise<string> {
  const result = await tokenAccessService.getCurrentSession(
    readTokenAccessCookie(request),
    request.id,
  );

  if (result.clearCookie) clearTokenAccessCookie(reply, cookie);

  if (result.view.access !== 'granted' || result.view.walletAddress === undefined) {
    const code =
      result.view.access === 'expired'
        ? 'TOKEN_ACCESS_EXPIRED'
        : result.view.access === 'revoked' || result.view.access === 'configuration_changed'
          ? 'TOKEN_ACCESS_REVOKED'
          : 'TOKEN_ACCESS_REQUIRED';
    throw new PublicApiError(401, code);
  }

  return result.view.walletAddress;
}

export async function requirePlayerEntry(
  playerService: PlayerService,
  walletAddress: string,
  requestId: string,
  allowRenameRequired: boolean,
  touchEntry: boolean,
) {
  const entry = await playerService.loadEntry(walletAddress, requestId, touchEntry);
  if (entry === undefined) return undefined;
  if (entry.entryState === 'suspended') throw new PublicApiError(403, 'PLAYER_SUSPENDED');
  if (entry.entryState === 'rename_required' && !allowRenameRequired) {
    throw new PublicApiError(409, 'PLAYER_RENAME_REQUIRED');
  }
  return entry;
}
