import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashAccessSessionToken } from '@starville/wallet-access/server';

import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import { buildApiApp } from '../app.js';
import { PublicApiError } from '../errors.js';
import type { TokenAccessService } from './contracts.js';

class SilentLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }
  trace(_message: string): void {}
  debug(_message: string): void {}
  info(_message: string): void {}
  warn(_message: string): void {}
  error(_message: string): void {}
  fatal(_message: string): void {}
}

const adminGateway: AdminAuthGateway = {
  verifyBearer: async () => undefined,
  loadAuthorization: async () => ({ outcome: 'unauthenticated' }),
  createSession: async () => ({ outcome: 'unauthenticated' }),
  revokeCurrentSession: async () => false,
  recordDenial: async () => undefined,
};
const cookieHashSecret = 'test-cookie-hash-secret-at-least-32-characters';

function createTokenService(): TokenAccessService {
  const publicConfig = {
    enabled: true,
    availability: 'available',
    network: 'solana:devnet',
    symbol: 'STAR',
    mintAddress: 'So11111111111111111111111111111111111111112',
    requiredAmount: '1000',
    recheckIntervalSeconds: 300,
  } as const;
  const view = {
    access: 'granted',
    walletAddress: '11111111111111111111111111111111',
    network: 'solana:devnet',
    symbol: 'STAR',
    requiredAmount: '1000',
    observedAmount: '1000',
    expiresAt: '2026-07-10T12:15:00.000Z',
    recheckAfter: '2026-07-10T12:05:00.000Z',
  } as const;

  return {
    getPublicConfig: vi.fn(async () => publicConfig),
    createChallenge: vi.fn(async () => ({
      challengeId: '11111111-1111-4111-8111-111111111111',
      message: 'canonical-message',
      expiresAt: '2026-07-10T12:05:00.000Z',
    })),
    verify: vi.fn(async () => ({ view, sessionToken: 'a'.repeat(43) })),
    getCurrentSession: vi.fn(async () => ({ view })),
    recheck: vi.fn(async () => ({ view })),
    revoke: vi.fn(async () => true),
    getAdminConfig: vi.fn(
      async () =>
        ({
          id: '11111111-1111-4111-8111-111111111111',
          environmentKey: 'test',
          network: 'solana:devnet',
          mintAddress: publicConfig.mintAddress,
          tokenProgram: 'spl-token',
          symbol: 'STAR',
          decimals: 6,
          requiredAmountRaw: '1000000000',
          requiredAmount: '1000',
          enabled: true,
          availability: 'available',
          commitment: 'confirmed',
          sessionTtlSeconds: 900,
          recheckIntervalSeconds: 300,
          configVersion: 1,
          lastValidatedAt: null,
          lastValidatedSlot: null,
        }) as const,
    ),
    validateAdminMint: vi.fn(
      async () =>
        ({
          network: 'solana:devnet',
          mintAddress: publicConfig.mintAddress,
          tokenProgram: 'spl-token',
          decimals: 6,
          slot: '100',
          commitment: 'confirmed',
        }) as const,
    ),
    updateAdminConfig: vi.fn(async () => {
      throw new Error('not used');
    }),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function createApp(
  service = createTokenService(),
  secure = false,
  gateway: AdminAuthGateway = adminGateway,
  trustedProxyCidrs: readonly string[] = [],
) {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3000', 'http://localhost:3001'],
      trustedProxyCidrs,
    },
    logger: new SilentLogger(),
    adminAuthGateway: gateway,
    adminSessionTtlMinutes: 60,
    tokenAccess: {
      service,
      cookieHashSecret,
      cookieSecure: secure,
      cookieMaxAgeSeconds: 900,
    },
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('token-access HTTP boundary', () => {
  it('returns public configuration without caching', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/api/v1/token-access/config',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      success: true,
      data: { availability: 'available', requiredAmount: '1000' },
    });
  });

  it('fails readiness safely when the authoritative configuration store is unavailable', async () => {
    const service = createTokenService();
    vi.mocked(service.getPublicConfig).mockRejectedValueOnce(new Error('private database detail'));

    const response = await createApp(service).inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'degraded',
      readiness: 'not-ready',
      dependencies: 'unavailable',
    });
    expect(response.body).not.toContain('private database detail');
  });

  it('exposes only the closed safe configuration-unavailable error', async () => {
    const service = createTokenService();
    vi.mocked(service.getPublicConfig).mockRejectedValueOnce(
      new PublicApiError(503, 'TOKEN_GATE_UNAVAILABLE'),
    );
    const response = await createApp(service).inject({
      method: 'GET',
      url: '/api/v1/token-access/config',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: {
        code: 'TOKEN_GATE_UNAVAILABLE',
        message: 'Token access is not configured yet.',
      },
    });
  });

  it('rejects missing and untrusted mutation origins before service work', async () => {
    const service = createTokenService();
    const app = createApp(service);
    const payload = { walletAddress: '11111111111111111111111111111111', network: 'solana:devnet' };

    for (const origin of [undefined, 'https://untrusted.example']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/token-access/challenge',
        headers: origin === undefined ? {} : { origin },
        payload,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } });
    }
    expect(service.createChallenge).not.toHaveBeenCalled();
  });

  it('sets an opaque host-only HttpOnly cookie only after trusted server confirmation', async () => {
    const service = createTokenService();
    const response = await createApp(service, true).inject({
      method: 'POST',
      url: '/api/v1/token-access/verify',
      headers: { origin: 'http://localhost:3000' },
      payload: {
        challengeId: '11111111-1111-4111-8111-111111111111',
        walletAddress: '11111111111111111111111111111111',
        network: 'solana:devnet',
        message: 'canonical-message',
        signature: Buffer.alloc(64).toString('base64'),
      },
    });

    const cookie = response.headers['set-cookie'];
    expect(response.statusCode).toBe(200);
    expect(cookie).toContain('starville-token-access=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1/token-access');
    expect(cookie).not.toContain('Domain=');
    expect(response.body).not.toContain('a'.repeat(43));
    expect(service.verify).toHaveBeenCalledWith(
      expect.objectContaining({ ipHash: expect.stringMatching(/^[0-9a-f]{64}$/u) }),
    );
  });

  it('supports credentialed allowlisted CORS and PATCH preflight without wildcards', async () => {
    const response = await createApp().inject({
      method: 'OPTIONS',
      url: '/api/v1/admin/token-gate',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PATCH',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toContain('PATCH');
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('uses forwarded client IPs only from an explicitly trusted immediate proxy', async () => {
    const payload = {
      challengeId: '11111111-1111-4111-8111-111111111111',
      walletAddress: '11111111111111111111111111111111',
      network: 'solana:devnet',
      message: 'canonical-message',
      signature: Buffer.alloc(64).toString('base64'),
    };
    const headers = {
      origin: 'http://localhost:3000',
      'x-forwarded-for': '203.0.113.9',
    };
    const untrustedService = createTokenService();
    await createApp(untrustedService).inject({
      method: 'POST',
      url: '/api/v1/token-access/verify',
      headers,
      payload,
    });
    expect(untrustedService.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        ipHash: hashAccessSessionToken('127.0.0.1', cookieHashSecret),
      }),
    );

    const trustedService = createTokenService();
    await createApp(trustedService, false, adminGateway, ['127.0.0.1']).inject({
      method: 'POST',
      url: '/api/v1/token-access/verify',
      headers,
      payload,
    });
    expect(trustedService.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        ipHash: hashAccessSessionToken('203.0.113.9', cookieHashSecret),
      }),
    );
  });

  it('does not reflect arbitrary downstream 4xx messages', async () => {
    const app = createApp();
    app.get('/test-only/downstream-error', async () => {
      throw Object.assign(new Error('private SQL and RPC provider detail'), { statusCode: 400 });
    });
    const response = await app.inject({ method: 'GET', url: '/test-only/downstream-error' });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('private SQL');
    expect(response.json()).toMatchObject({
      error: { code: 'REQUEST_ERROR', message: 'The request could not be completed.' },
    });
  });
});

describe('administrator token-gate authorization', () => {
  const identity = {
    userId: '22222222-2222-4222-8222-222222222222',
    authSessionId: '33333333-3333-4333-8333-333333333333',
    assuranceLevel: 'aal1' as const,
    authenticationMethods: ['password'],
  };

  function gatewayWithPermissions(
    permissionKeys: readonly ('token_gate.read' | 'token_gate.configure')[],
  ) {
    return {
      verifyBearer: vi.fn<AdminAuthGateway['verifyBearer']>(async () => identity),
      loadAuthorization: vi.fn<AdminAuthGateway['loadAuthorization']>(async () => ({
        outcome: 'authorized' as const,
        context: {
          userId: identity.userId,
          displayName: 'Token Operator',
          adminStatus: 'active' as const,
          roleKey: 'blockchain_operator' as const,
          roleName: 'Blockchain Operator',
          permissionKeys: [...permissionKeys],
          adminSessionId: '44444444-4444-4444-8444-444444444444',
          sessionExpiresAt: '2026-07-10T13:00:00.000Z',
          mfaRequired: false,
          assuranceLevel: 'aal1' as const,
          lastLoginAt: null,
        },
      })),
      createSession: vi.fn<AdminAuthGateway['createSession']>(async () => ({
        outcome: 'unauthorized',
      })),
      revokeCurrentSession: vi.fn<AdminAuthGateway['revokeCurrentSession']>(async () => false),
      recordDenial: vi.fn<AdminAuthGateway['recordDenial']>(async () => undefined),
    } satisfies AdminAuthGateway;
  }

  it('allows read-only configuration access but denies validation without configure permission', async () => {
    const gateway = gatewayWithPermissions(['token_gate.read']);
    const app = createApp(createTokenService(), false, gateway);
    const headers = { authorization: 'Bearer verified-admin' };
    const read = await app.inject({ method: 'GET', url: '/api/v1/admin/token-gate', headers });
    const validate = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/token-gate/validate',
      headers,
      payload: {
        network: 'solana:devnet',
        mintAddress: 'So11111111111111111111111111111111111111112',
        commitment: 'confirmed',
      },
    });

    expect(read.statusCode).toBe(200);
    expect(validate.statusCode).toBe(403);
    expect(vi.mocked(gateway.recordDenial)).toHaveBeenCalledWith(
      identity,
      expect.any(String),
      'MISSING_PERMISSION',
    );
  });

  it('allows a configuring administrator to validate through the server RPC boundary', async () => {
    const service = createTokenService();
    const gateway = gatewayWithPermissions(['token_gate.read', 'token_gate.configure']);
    const response = await createApp(service, false, gateway).inject({
      method: 'POST',
      url: '/api/v1/admin/token-gate/validate',
      headers: { authorization: 'Bearer verified-operator' },
      payload: {
        network: 'solana:devnet',
        mintAddress: 'So11111111111111111111111111111111111111112',
        commitment: 'finalized',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(service.validateAdminMint).toHaveBeenCalledWith(
      expect.objectContaining({ userId: identity.userId }),
      'So11111111111111111111111111111111111111112',
      'finalized',
      expect.any(String),
    );
    expect(response.body).not.toContain('rpc.example');
  });
});
