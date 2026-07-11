import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPublicTokenAccessConfig,
  fetchTokenAccessSession,
  recheckTokenAccess,
  shortenWalletAddress,
  TokenAccessClientError,
} from './client';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('landing token-access API client', () => {
  it('accepts only the safe public configuration envelope', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        success: true,
        requestId: 'request-1',
        data: {
          enabled: true,
          availability: 'available',
          network: 'solana:devnet',
          symbol: 'STAR',
          mintAddress: '11111111111111111111111111111111',
          requiredAmount: '1000',
          recheckIntervalSeconds: 300,
        },
      }),
    );

    await expect(fetchPublicTokenAccessConfig('http://localhost:4000')).resolves.toMatchObject({
      availability: 'available',
      requiredAmount: '1000',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL('http://localhost:4000/api/v1/token-access/config'),
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
  });

  it('fails closed when a session response tries to omit its authority status', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        success: true,
        requestId: 'request-2',
        data: {
          network: 'solana:devnet',
          symbol: 'STAR',
          requiredAmount: '1000',
        },
      }),
    );

    await expect(fetchTokenAccessSession('http://localhost:4000')).rejects.toBeInstanceOf(
      TokenAccessClientError,
    );
  });

  it('never converts an RPC failure into an insufficient balance', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        {
          success: false,
          requestId: 'request-3',
          error: { code: 'TOKEN_ACCESS_RPC_UNAVAILABLE', message: 'Please retry.' },
        },
        503,
      ),
    );

    await expect(fetchTokenAccessSession('http://localhost:4000')).rejects.toMatchObject({
      code: 'TOKEN_ACCESS_RPC_UNAVAILABLE',
      status: 503,
    });
  });

  it('uses a JSON body for the origin-protected balance recheck', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        success: true,
        requestId: 'request-4',
        data: {
          access: 'none',
          network: 'solana:devnet',
          symbol: 'STAR',
          requiredAmount: '1000',
        },
      }),
    );

    await recheckTokenAccess('http://localhost:4000');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL('http://localhost:4000/api/v1/token-access/recheck'),
      expect.objectContaining({
        body: '{}',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
  });

  it('shows only a shortened wallet address in the interface', () => {
    expect(shortenWalletAddress('7YxSktJKnGfdwLFnsoXaQrXvZ5dCAW14o1by8s32VTgP')).toBe(
      '7YxSk…2VTgP',
    );
  });
});
