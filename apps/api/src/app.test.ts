import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from './app.js';
import type { AdminAuthGateway, LogContext, ServiceLogger } from './contracts.js';
import type { LiveOperationsService } from './live-operations/contracts.js';

class SilentLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }

  debug(_message: string, _context?: LogContext): void {}

  trace(_message: string, _context?: LogContext): void {}

  info(_message: string, _context?: LogContext): void {}

  warn(_message: string, _context?: LogContext): void {}

  error(_message: string, _context?: LogContext): void {}

  fatal(_message: string, _context?: LogContext): void {}
}

const apps: ReturnType<typeof buildApiApp>[] = [];

const testIdentity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal1',
  authenticationMethods: ['password'],
} as const;

const inactiveAdminGateway: AdminAuthGateway = {
  verifyBearer: async () => testIdentity,
  loadAuthorization: async () => ({ outcome: 'unauthorized' }),
  createSession: async () => ({ outcome: 'unauthorized' }),
  revokeCurrentSession: async () => false,
  recordDenial: async () => undefined,
};

function createApp() {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3000'],
      trustedProxyCidrs: [],
    },
    logger: new SilentLogger(),
    adminAuthGateway: inactiveAdminGateway,
    adminSessionTtlMinutes: 60,
  });
  apps.push(app);
  return app;
}

const liveOperations: LiveOperationsService = {
  getPublic: async () => ({
    maintenance: {
      state: 'active',
      active: true,
      revision: 2,
      title: 'SERVER PAUSED',
      message: 'A safe player message.',
      updateDetails: [],
      expectedEndAt: null,
      expectedReturnMessage: null,
      showReturnToLanding: true,
      ctaLabel: null,
      ctaUrl: null,
      updatedAt: '2026-07-13T00:00:00.000Z',
    },
    announcements: [],
    generatedAt: '2026-07-13T00:00:00.000Z',
  }),
  getAdmin: async () => {
    throw new Error('not used');
  },
  updateMaintenance: async () => {
    throw new Error('not used');
  },
  saveAnnouncement: async () => {
    throw new Error('not used');
  },
  setAnnouncementStatus: async () => {
    throw new Error('not used');
  },
};

function createLiveOperationsApp() {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3000'],
      trustedProxyCidrs: [],
    },
    logger: new SilentLogger(),
    adminAuthGateway: inactiveAdminGateway,
    adminSessionTtlMinutes: 60,
    liveOperations: { service: liveOperations },
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('API foundation', () => {
  it('returns a no-store server-authoritative maintenance snapshot', async () => {
    const response = await createLiveOperationsApp().inject({
      method: 'GET',
      url: '/api/v1/live-operations',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.json()).toMatchObject({
      success: true,
      data: { maintenance: { active: true, state: 'active' }, announcements: [] },
    });
  });
  it('returns a healthy response without exposing configuration', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: 'api',
      environment: 'test',
      status: 'ok',
    });
    expect(response.body).not.toContain('SUPABASE');
    expect(response.headers).toMatchObject({
      'cache-control': 'no-store',
      'content-security-policy': expect.stringContaining("default-src 'none'"),
      'permissions-policy': expect.stringContaining('camera=()'),
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    });
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('reports process readiness when no external dependency is configured', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: 'api',
      status: 'ok',
      readiness: 'ready',
      dependencies: 'available',
    });
  });

  it('keeps Supabase-provider readiness blocked while Phase 13E parity is incomplete', async () => {
    const app = buildApiApp({
      config: {
        environment: 'test',
        host: '127.0.0.1',
        port: 4000,
        corsAllowedOrigins: ['http://localhost:3000'],
        trustedProxyCidrs: [],
      },
      logger: new SilentLogger(),
      adminAuthGateway: inactiveAdminGateway,
      adminSessionTtlMinutes: 60,
      readiness: {
        architecture: {
          realtimeProvider: 'supabase',
          backgroundJobsProvider: 'supabase',
          migrationState: 'foundation-incomplete',
        },
      },
    });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      readiness: 'not-ready',
      reason: 'SUPABASE_MIGRATION_PARITY_INCOMPLETE',
      architecture: {
        realtimeProvider: 'supabase',
        backgroundJobsProvider: 'supabase',
      },
    });
  });

  it('propagates a safe request ID through the versioned status response', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/api/v1/status',
      headers: { 'x-request-id': 'phase-1-request' },
    });

    expect(response.headers['x-request-id']).toBe('phase-1-request');
    expect(response.json()).toMatchObject({
      success: true,
      requestId: 'phase-1-request',
      data: { apiVersion: 'v1', status: 'operational' },
    });
  });

  it('formats uncaught route failures without leaking the original error', async () => {
    const app = createApp();
    app.get('/test-only/error', async () => {
      throw new Error('sensitive implementation detail');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-only/error',
      headers: { 'x-request-id': 'error-request' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
      requestId: 'error-request',
    });
    expect(response.body).not.toContain('sensitive implementation detail');
  });

  it('uses the shared error envelope for unknown routes', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/missing' });
    const body = response.json<{ requestId: string }>();

    expect(response.statusCode).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(body.requestId).toEqual(expect.any(String));
  });

  it('only reflects configured CORS origins', async () => {
    const app = createApp();
    const allowed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:3000' },
    });
    const denied = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://untrusted.example' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
