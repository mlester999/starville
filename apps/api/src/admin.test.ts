import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminAuthorizationResult } from '@starville/admin-auth';

import { buildApiApp } from './app.js';
import type {
  AdminAuthGateway,
  LogContext,
  ServiceLogger,
  VerifiedSupabaseIdentity,
} from './contracts.js';

const identity: VerifiedSupabaseIdentity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal1',
  authenticationMethods: ['password'],
};

const authorized: AdminAuthorizationResult = {
  outcome: 'authorized',
  context: {
    userId: identity.userId,
    displayName: 'Foundation Administrator',
    adminStatus: 'active',
    roleKey: 'game_administrator',
    roleName: 'Game Administrator',
    permissionKeys: ['overview.read', 'players.read'],
    adminSessionId: '33333333-3333-4333-8333-333333333333',
    sessionExpiresAt: '2026-07-10T12:00:00.000Z',
    mfaRequired: false,
    assuranceLevel: 'aal1',
    lastLoginAt: '2026-07-10T11:00:00.000Z',
  },
};

class CaptureLogger implements ServiceLogger {
  readonly records: string[];

  constructor(records: string[] = []) {
    this.records = records;
  }

  child(_bindings: LogContext): ServiceLogger {
    return new CaptureLogger(this.records);
  }

  trace(message: string): void {
    this.records.push(message);
  }

  debug(message: string): void {
    this.records.push(message);
  }

  info(message: string, context?: LogContext): void {
    this.records.push(JSON.stringify({ message, context }));
  }

  warn(message: string, context?: LogContext): void {
    this.records.push(JSON.stringify({ message, context }));
  }

  error(message: string, context?: LogContext): void {
    this.records.push(JSON.stringify({ message, context }));
  }

  fatal(message: string): void {
    this.records.push(message);
  }
}

function createGateway(result: AdminAuthorizationResult = authorized) {
  return {
    verifyBearer: vi.fn<AdminAuthGateway['verifyBearer']>(async (_accessToken) => identity),
    loadAuthorization: vi.fn<AdminAuthGateway['loadAuthorization']>(async (_identity) => result),
    createSession: vi.fn<AdminAuthGateway['createSession']>(
      async (_identity, _expiresAt, _requestId) => result,
    ),
    revokeCurrentSession: vi.fn<AdminAuthGateway['revokeCurrentSession']>(
      async (_identity, _requestId) => true,
    ),
    recordDenial: vi.fn<AdminAuthGateway['recordDenial']>(
      async (_identity, _requestId, _reason) => undefined,
    ),
  } satisfies AdminAuthGateway;
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function createApp(gateway: AdminAuthGateway, logger: ServiceLogger = new CaptureLogger()) {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3002'],
      trustedProxyCidrs: [],
    },
    logger,
    adminAuthGateway: gateway,
    adminSessionTtlMinutes: 60,
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('administrator API authentication', () => {
  it('returns 401 for a missing bearer credential', async () => {
    const gateway = createGateway();
    const response = await createApp(gateway).inject({ method: 'GET', url: '/api/v1/admin/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'AUTHENTICATION_REQUIRED' },
    });
    expect(gateway.verifyBearer).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid verified credential', async () => {
    const gateway = createGateway();
    gateway.verifyBearer.mockResolvedValueOnce(undefined);
    const response = await createApp(gateway).inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      headers: { authorization: 'Bearer invalid-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('invalid-token');
  });

  it('never writes bearer values to request logs', async () => {
    const gateway = createGateway();
    const logger = new CaptureLogger();
    await createApp(gateway, logger).inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      headers: { authorization: 'Bearer very-sensitive-bearer-value' },
    });

    expect(logger.records.join('\n')).not.toContain('very-sensitive-bearer-value');
  });

  it('strips query strings before request logging', async () => {
    const gateway = createGateway();
    const logger = new CaptureLogger();
    await createApp(gateway, logger).inject({
      method: 'GET',
      url: '/api/v1/admin/me?token=must-never-be-logged',
      headers: { authorization: 'Bearer verified-token' },
    });

    expect(logger.records.join('\n')).not.toContain('must-never-be-logged');
  });
});

describe('administrator API authorization', () => {
  it('returns only the current trusted administrator context', async () => {
    const response = await createApp(createGateway()).inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      headers: { authorization: 'Bearer verified-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        userId: identity.userId,
        roleKey: 'game_administrator',
        permissionKeys: ['overview.read', 'players.read'],
      },
    });
    expect(response.body).not.toContain('serviceRole');
    expect(response.json<{ data: Record<string, unknown> }>().data).not.toHaveProperty(
      'lastLoginAt',
    );
  });

  it.each(['unauthorized', 'mfa_required', 'session_invalid'] as const)(
    'returns 403 and audits an authenticated %s result',
    async (outcome) => {
      const gateway = createGateway({ outcome });
      const response = await createApp(gateway).inject({
        method: 'GET',
        url: '/api/v1/admin/me',
        headers: { authorization: 'Bearer verified-token' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        success: false,
        error: { code: 'ADMIN_ACCESS_DENIED', message: 'Access is denied.' },
      });
      expect(gateway.recordDenial).toHaveBeenCalledOnce();
    },
  );

  it('returns 403 and audits when overview permission is missing', async () => {
    const gateway = createGateway({
      ...authorized,
      context: { ...authorized.context, permissionKeys: ['players.read'] },
    });
    const response = await createApp(gateway).inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      headers: { authorization: 'Bearer verified-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(gateway.recordDenial).toHaveBeenCalledWith(
      identity,
      expect.any(String),
      'MISSING_PERMISSION',
    );
  });
});

describe('administrator API session lifecycle', () => {
  it('creates a bounded trusted session only through explicit POST', async () => {
    const gateway = createGateway();
    const before = Date.now();
    const response = await createApp(gateway).inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      headers: { authorization: 'Bearer verified-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(gateway.createSession).toHaveBeenCalledOnce();
    const expiresAt = gateway.createSession.mock.calls[0]?.[1];
    expect(expiresAt?.getTime()).toBeGreaterThanOrEqual(before + 59 * 60_000);
    expect(expiresAt?.getTime()).toBeLessThanOrEqual(before + 61 * 60_000);
  });

  it('refuses trusted-session creation without a verified password authentication method', async () => {
    const gateway = createGateway();
    gateway.verifyBearer.mockResolvedValueOnce({
      ...identity,
      authenticationMethods: ['otp'],
    });
    const response = await createApp(gateway).inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      headers: { authorization: 'Bearer verified-otp-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(gateway.createSession).not.toHaveBeenCalled();
    expect(gateway.recordDenial).toHaveBeenCalled();
  });

  it('revokes only the current trusted session on logout', async () => {
    const gateway = createGateway();
    const response = await createApp(gateway).inject({
      method: 'DELETE',
      url: '/api/v1/admin/session',
      headers: { authorization: 'Bearer verified-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(gateway.revokeCurrentSession).toHaveBeenCalledWith(identity, expect.any(String));
  });
});
