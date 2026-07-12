import { createServer } from 'node:http';

import { describe, expect, it } from 'vitest';

import {
  decodeHostedJson,
  hostedFetch,
  hostedResponseFailure,
  safeHostedEndpoint,
  safeHostedTransportCode,
  withHostedCleanupTimeout,
} from './hosted-rls-diagnostics';

describe('hosted RLS HTTP diagnostics', () => {
  it('reports a safe operation and redacted endpoint without origin or query data', () => {
    const url = new URL(
      'https://private.example/players/10000000-0000-4000-8000-000000000001?token=secret',
    );
    expect(safeHostedEndpoint(url)).toBe('/players/:id');

    const diagnostic = hostedResponseFailure(
      'player-detail',
      url,
      new Response('', { status: 503 }),
      'phase6-test:request',
    );
    expect(diagnostic).toContain('"operation":"player-detail"');
    expect(diagnostic).toContain('"endpoint":"/players/:id"');
    expect(diagnostic).toContain('"status":503');
    expect(diagnostic).toContain('"code":"HOSTED_HTTP_STATUS"');
    expect(diagnostic).toContain('"requestId":"phase6-test:request"');
    expect(diagnostic).not.toContain('private.example');
    expect(diagnostic).not.toContain('secret');
  });

  it('distinguishes a timeout from a connection failure', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(503, { 'content-type': 'text/plain' });
      response.flushHeaders();
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Test server did not expose an isolated port');
    }

    try {
      const timeoutUrl = new URL(
        `http://127.0.0.1:${String(address.port)}/worlds/10000000-0000-4000-8000-000000000001?credential=secret`,
      );
      const timeoutFailure = await hostedFetch(
        'timeout-check',
        timeoutUrl,
        'phase6-test:timeout',
        {},
        25,
      ).catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
      expect(timeoutFailure).toMatch(
        /"endpoint":"\/worlds\/:id".*"status":503.*"code":"HOSTED_HTTP_TIMEOUT".*"failureKind":"timeout"/u,
      );
      expect(timeoutFailure).not.toContain('127.0.0.1');
      expect(timeoutFailure).not.toContain('credential=secret');
      expect(timeoutFailure).not.toContain('10000000-0000-4000-8000-000000000001');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }

    const connectionFailure = await hostedFetch(
      'connection-check',
      new URL('http://127.0.0.1:1/worlds?credential=secret'),
      'phase6-test:connection',
      {},
      100,
    ).catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    expect(connectionFailure).toMatch(
      /"status":null.*"code":"HOSTED_HTTP_CONNECTION_FAILURE".*"failureKind":"connection"/u,
    );
    expect(connectionFailure).not.toContain('127.0.0.1');
    expect(connectionFailure).not.toContain('credential=secret');
  });

  it('accepts only bounded transport error codes', () => {
    expect(safeHostedTransportCode({ code: 'ECONNREFUSED' })).toBe('ECONNREFUSED');
    expect(safeHostedTransportCode({ code: 'unsafe message with spaces' })).toBeNull();
  });

  it('reports malformed hosted JSON without exposing response content', async () => {
    const url = new URL(
      'https://private.example/token-gate/10000000-0000-4000-8000-000000000001?token=secret',
    );
    const failure = await decodeHostedJson(
      'token-gate-decode',
      url,
      new Response('<html>private response body</html>', { status: 502 }),
      'phase6-test:decode',
    ).catch((error: unknown) => (error instanceof Error ? error.message : String(error)));

    expect(failure).toContain('"endpoint":"/token-gate/:id"');
    expect(failure).toContain('"status":502');
    expect(failure).toContain('"code":"HOSTED_RESPONSE_DECODE"');
    expect(failure).toContain('"requestId":"phase6-test:decode"');
    expect(failure).not.toContain('private.example');
    expect(failure).not.toContain('private response body');
    expect(failure).not.toContain('token=secret');
    expect(failure).not.toContain('10000000-0000-4000-8000-000000000001');
  });

  it('bounds cleanup steps and allows later exact cleanup to continue', async () => {
    const failures: string[] = [];
    let laterStepRan = false;

    for (const task of [
      () => new Promise<void>(() => undefined),
      async () => {
        laterStepRan = true;
      },
    ]) {
      try {
        await withHostedCleanupTimeout(task, 10);
      } catch (error) {
        failures.push(safeHostedTransportCode(error) ?? 'HOSTED_CLEANUP_FAILURE');
      }
    }

    expect(failures).toEqual(['HOSTED_CLEANUP_TIMEOUT']);
    expect(laterStepRan).toBe(true);
  });
});
