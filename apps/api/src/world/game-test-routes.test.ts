import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminPermissionKey } from '@starville/admin-auth';

import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import { buildApiApp } from '../app.js';
import type { WorldGameTestProjection, WorldGameTestService } from './game-test-contracts.js';

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

const identity = {
  userId: '10000000-0000-4000-8000-000000000001',
  authSessionId: '10000000-0000-4000-8000-000000000002',
  assuranceLevel: 'aal2' as const,
  authenticationMethods: ['password', 'totp'],
};
const mapId = '20000000-0000-4000-8000-000000000001';
const versionId = '20000000-0000-4000-8000-000000000002';
const sessionId = '20000000-0000-4000-8000-000000000003';
const now = '2026-07-16T05:00:00.000Z';
const projection = {
  session: {
    id: sessionId,
    worldMapId: mapId,
    worldMapVersionId: versionId,
    environment: 'test',
    status: 'active',
    returnPath: `/worlds/${mapId}/editor?version=${versionId}`,
    createdAt: now,
    expiresAt: '2026-07-16T05:20:00.000Z',
    gameClientBuild: 'game-client:test',
  },
} as unknown as WorldGameTestProjection;

function authGateway(allowed: boolean): AdminAuthGateway {
  const permissionKeys: AdminPermissionKey[] = allowed ? ['maps.preview'] : [];
  return {
    verifyBearer: vi.fn(async () => identity),
    loadAuthorization: vi.fn(async () => ({
      outcome: 'authorized' as const,
      context: {
        userId: identity.userId,
        displayName: 'World Tester',
        adminStatus: 'active' as const,
        roleKey: 'world_designer' as const,
        roleName: 'World Designer',
        permissionKeys,
        adminSessionId: identity.authSessionId,
        sessionExpiresAt: '2026-07-16T06:00:00.000Z',
        mfaRequired: true,
        assuranceLevel: 'aal2' as const,
        lastLoginAt: now,
      },
    })),
    createSession: vi.fn(async () => ({ outcome: 'unauthorized' as const })),
    revokeCurrentSession: vi.fn(async () => true),
    recordDenial: vi.fn(async () => undefined),
  };
}

function service(): WorldGameTestService {
  return {
    createAdmin: vi.fn(async () => ({
      grantToken: 'g'.repeat(43),
      sessionId,
      worldMapId: mapId,
      worldMapVersionId: versionId,
      environment: 'test' as const,
      expiresAt: '2026-07-16T05:20:00.000Z',
      returnPath: `/worlds/${mapId}/editor?version=${versionId}`,
    })),
    exchange: vi.fn(async () => ({ sessionToken: 's'.repeat(43), projection })),
    load: vi.fn(async () => projection),
    statusAdmin: vi.fn(async () => ({
      worldMapId: mapId,
      worldMapVersionId: versionId,
      gameTestStatus: 'not_tested' as const,
      latestEvidence: null,
      activeSessions: [],
    })),
    exit: vi.fn(async () => undefined),
    revokeAdmin: vi.fn(async () => ({ sessionId })),
    recordEvidence: vi.fn(async () => ({
      evidenceId: '20000000-0000-4000-8000-000000000004',
      sessionId,
      worldMapVersionId: versionId,
      result: 'passed' as const,
      gameClientBuild: 'game-client:test',
      environment: 'test' as const,
      recordedAt: now,
      publicationReadiness: 'recommended' as const,
    })),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function app(allowed = true, target = service()) {
  const value = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3001', 'http://localhost:3002'],
      trustedProxyCidrs: [],
    },
    logger: new SilentLogger(),
    adminAuthGateway: authGateway(allowed),
    adminSessionTtlMinutes: 60,
    worldGameTest: {
      service: target,
      cookieSecure: true,
      cookieMaxAgeSeconds: 1_200,
    },
  });
  apps.push(value);
  return { app: value, service: target };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (value) => value.close()));
});

describe('World Game Test HTTP boundary', () => {
  it('returns only the authorized administrator status for the exact revision', async () => {
    const target = service();
    const loaded = await app(true, target).app.inject({
      method: 'GET',
      url: `/api/v1/admin/worlds/${mapId}/versions/${versionId}/game-test-status`,
      headers: { authorization: 'Bearer verified' },
    });

    expect(loaded.statusCode).toBe(200);
    expect(target.statusAdmin).toHaveBeenCalledWith(identity, mapId, versionId, expect.any(String));
    expect(loaded.body).not.toContain('token');
  });

  it('requires maps.preview and the trusted administrator origin for grant creation', async () => {
    const denied = await app(false).app.inject({
      method: 'POST',
      url: `/api/v1/admin/worlds/${mapId}/versions/${versionId}/game-tests`,
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: {},
    });
    const untrusted = await app().app.inject({
      method: 'POST',
      url: `/api/v1/admin/worlds/${mapId}/versions/${versionId}/game-tests`,
      headers: { authorization: 'Bearer verified', origin: 'https://untrusted.invalid' },
      payload: {},
    });
    const target = service();
    const allowed = await app(true, target).app.inject({
      method: 'POST',
      url: `/api/v1/admin/worlds/${mapId}/versions/${versionId}/game-tests`,
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: { expectedEditVersion: 2 },
    });

    expect(denied.statusCode).toBe(403);
    expect(untrusted.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(target.createAdmin).toHaveBeenCalledWith(
      identity,
      mapId,
      versionId,
      { expectedEditVersion: 2 },
      expect.any(String),
    );
  });

  it('exchanges the one-time grant for a host-only secure HttpOnly cookie', async () => {
    const target = service();
    const response = await app(true, target).app.inject({
      method: 'POST',
      url: '/api/v1/game-test/exchange',
      headers: { origin: 'http://localhost:3001' },
      payload: { grantToken: 'g'.repeat(43), gameClientBuild: 'game-client:test' },
    });
    const cookie = response.headers['set-cookie'];

    expect(response.statusCode).toBe(200);
    expect(cookie).toContain('starville-world-game-test=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1/game-test');
    expect(cookie).not.toContain('Domain=');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-robots-tag']).toContain('noindex');
    expect(response.body).not.toContain('s'.repeat(43));
  });

  it('supports cookie-backed reloads and clears the cookie on explicit exit', async () => {
    const target = service();
    const cookie = `starville-world-game-test=${'s'.repeat(43)}`;
    const resumed = await app(true, target).app.inject({
      method: 'GET',
      url: '/api/v1/game-test/session',
      headers: { cookie },
    });
    const exited = await app(true, target).app.inject({
      method: 'POST',
      url: '/api/v1/game-test/exit',
      headers: { cookie, origin: 'http://localhost:3001' },
      payload: {},
    });

    expect(resumed.statusCode).toBe(200);
    expect(target.load).toHaveBeenCalledWith('s'.repeat(43), expect.any(String));
    expect(exited.statusCode).toBe(200);
    expect(target.exit).toHaveBeenCalledWith('s'.repeat(43), expect.any(String));
    expect(exited.headers['set-cookie']).toContain('Max-Age=0');
  });

  it('rate-limits repeated grant exchanges before they can become a persistence abuse vector', async () => {
    const target = service();
    const value = app(true, target).app;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const accepted = await value.inject({
        method: 'POST',
        url: '/api/v1/game-test/exchange',
        headers: { origin: 'http://localhost:3001' },
        payload: { grantToken: 'g'.repeat(43), gameClientBuild: 'game-client:test' },
      });
      expect(accepted.statusCode).toBe(200);
    }

    const limited = await value.inject({
      method: 'POST',
      url: '/api/v1/game-test/exchange',
      headers: { origin: 'http://localhost:3001' },
      payload: { grantToken: 'g'.repeat(43), gameClientBuild: 'game-client:test' },
    });
    expect(limited.statusCode).toBe(429);
    expect(target.exchange).toHaveBeenCalledTimes(30);
  });
});
