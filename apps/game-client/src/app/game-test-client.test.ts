import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  consumeGameTestGrant,
  exitWorldGameTest,
  gameTestAdminReturnUrl,
} from './game-test-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('World Game Test browser grant handling', () => {
  it('returns only to the configured Admin origin with a non-secret active-session receipt', () => {
    const sessionId = '20000000-0000-4000-8000-000000000003';
    const returned = new URL(
      gameTestAdminReturnUrl(
        'https://admin.starville.test',
        '/worlds/20000000-0000-4000-8000-000000000001/editor?version=20000000-0000-4000-8000-000000000002',
        sessionId,
      ),
    );

    expect(returned.origin).toBe('https://admin.starville.test');
    expect(returned.searchParams.get('gameTest')).toBe('returned');
    expect(returned.searchParams.get('gameTestSessionId')).toBe(sessionId);
    expect(returned.toString()).not.toContain('grant=');
    expect(
      gameTestAdminReturnUrl(
        'https://admin.starville.test',
        'https://untrusted.invalid/steal',
        sessionId,
      ),
    ).toBe('https://admin.starville.test/');
  });

  it('reads the one-time fragment grant and removes it before network exchange', () => {
    const replaceState = vi.fn();
    const grant = consumeGameTestGrant(
      {
        hash: `#grant=${'g'.repeat(43)}`,
        pathname: '/preview/world',
        search: '?safe=1',
      } as Location,
      { replaceState } as unknown as History,
    );

    expect(grant).toBe('g'.repeat(43));
    expect(replaceState).toHaveBeenCalledWith(null, '', '/preview/world?safe=1');
    expect(replaceState.mock.calls[0]?.join(' ')).not.toContain('grant=');
  });

  it('removes malformed fragments and strips rather than trusting a query grant', () => {
    const replaceState = vi.fn();
    const grant = consumeGameTestGrant(
      {
        hash: '',
        pathname: '/preview/world',
        search: `?grant=${'g'.repeat(43)}`,
      } as Location,
      { replaceState } as unknown as History,
    );

    expect(grant).toBeUndefined();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/preview/world');
  });

  it('exits only through the scoped Game Test endpoint with credentials and no referrer', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ success: true, data: { status: 'exited' }, requestId: 'request-exit' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await exitWorldGameTest('http://localhost:4000');

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://localhost:4000/api/v1/game-test/exit'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      }),
    );
  });
});
