import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GameAccessRequestError,
  loadTrustedTokenAccess,
  parseTrustedTokenAccess,
  recheckTrustedTokenAccess,
  screenForAccess,
} from './token-access-client';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('game-client trusted token access', () => {
  it('accepts a complete server-confirmed grant', () => {
    expect(
      parseTrustedTokenAccess({
        access: 'granted',
        walletAddress: '11111111111111111111111111111111',
        network: 'solana:devnet',
        symbol: 'STAR',
        requiredAmount: '10000',
        observedAmount: '1250',
        expiresAt: '2026-07-10T12:30:00.000Z',
        recheckAfter: '2026-07-10T12:20:00.000Z',
      }),
    ).toMatchObject({ access: 'granted', observedAmount: '1250' });
  });

  it('rejects client-shaped booleans as access authority', () => {
    expect(() =>
      parseTrustedTokenAccess({
        isTokenHolder: true,
        network: 'solana:devnet',
        symbol: 'STAR',
        requiredAmount: '10000',
      }),
    ).toThrow(GameAccessRequestError);
  });

  it('allows only a trusted granted state to reach the runtime screen', () => {
    const baseAccess = {
      network: 'solana:devnet',
      symbol: 'STAR',
      requiredAmount: '10000',
    } as const;

    expect(screenForAccess({ ...baseAccess, access: 'granted' })).toBe('granted');
    expect(screenForAccess({ ...baseAccess, access: 'none' })).toBe('required');
    expect(screenForAccess({ ...baseAccess, access: 'expired' })).toBe('expired');
    expect(screenForAccess({ ...baseAccess, access: 'configuration_changed' })).toBe('revoked');
  });

  it('requests the trusted session with credentials and no cache', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            requestId: 'request-1',
            data: {
              access: 'none',
              network: 'solana:devnet',
              symbol: 'STAR',
              requiredAmount: '10000',
            },
          }),
        ),
    );

    await expect(loadTrustedTokenAccess('http://localhost:4000')).resolves.toMatchObject({
      access: 'none',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL('http://localhost:4000/api/v1/token-access/me'),
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
  });

  it('sends an explicit JSON recheck request for the origin guard', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            requestId: 'request-2',
            data: {
              access: 'revoked',
              network: 'solana:devnet',
              symbol: 'STAR',
              requiredAmount: '10000',
            },
          }),
        ),
    );

    await recheckTrustedTokenAccess('http://localhost:4000');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL('http://localhost:4000/api/v1/token-access/recheck'),
      expect.objectContaining({
        body: '{}',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
  });
});
