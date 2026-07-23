import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminPermissionKey } from '@starville/admin-auth';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import type { AdminAvatarGateway } from './admin-gateway.js';

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
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal2' as const,
  authenticationMethods: ['password', 'totp'],
};

function adminGateway(permissionKeys: readonly AdminPermissionKey[]): AdminAuthGateway {
  return {
    verifyBearer: vi.fn(async () => identity),
    loadAuthorization: vi.fn(async () => ({
      outcome: 'authorized' as const,
      context: {
        userId: identity.userId,
        displayName: 'Test Administrator',
        adminStatus: 'active' as const,
        roleKey: 'game_administrator' as const,
        roleName: 'Game Administrator',
        permissionKeys: [...permissionKeys],
        adminSessionId: '33333333-3333-4333-8333-333333333333',
        sessionExpiresAt: '2026-07-23T12:00:00.000Z',
        mfaRequired: true,
        assuranceLevel: 'aal2' as const,
        lastLoginAt: '2026-07-23T10:00:00.000Z',
      },
    })),
    createSession: vi.fn(async () => ({ outcome: 'unauthorized' as const })),
    revokeCurrentSession: vi.fn(async () => true),
    recordDenial: vi.fn(async () => undefined),
  };
}

function avatarGateway(): AdminAvatarGateway {
  return {
    overview: vi.fn(async () => ({})),
    list: vi.fn(async () => ({})),
    definition: vi.fn(async () => ({})),
    presets: vi.fn(async () => ({})),
    audit: vi.fn(async (_identity, query) => ({
      status: 'loaded',
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      total: 0,
      totalPages: 0,
    })),
    settings: vi.fn(async () => ({})),
    createDraft: vi.fn(async () => ({ status: 'created' as const })),
    updateDraft: vi.fn(async () => ({ status: 'updated' as const })),
    lifecycle: vi.fn(async () => ({ status: 'updated' as const })),
    updateSettings: vi.fn(async () => ({ status: 'updated' as const })),
    publishPreset: vi.fn(async () => ({ status: 'published' as const })),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function createApp(gateway: AdminAvatarGateway) {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 0,
      corsAllowedOrigins: ['http://localhost:3002'],
      trustedProxyCidrs: [],
    },
    logger: new SilentLogger(),
    adminAuthGateway: adminGateway(['avatar_content.audit.read']),
    adminSessionTtlMinutes: 60,
    adminAvatar: { gateway },
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('administrator avatar audit pagination', () => {
  it.each([
    { query: '', expectedPageSize: 50 },
    { query: '&pageSize=20', expectedPageSize: 20 },
    { query: '&pageSize=50', expectedPageSize: 50 },
    { query: '&pageSize=100', expectedPageSize: 100 },
  ] as const)(
    'normalizes $query to pageSize $expectedPageSize',
    async ({ query, expectedPageSize }) => {
      const gateway = avatarGateway();
      const response = await createApp(gateway).inject({
        method: 'GET',
        url: `/api/v1/admin/avatar-content/audit?page=2${query}`,
        headers: { authorization: 'Bearer verified' },
      });

      expect(response.statusCode).toBe(200);
      expect(gateway.audit).toHaveBeenCalledWith(expect.any(Object), {
        page: 2,
        pageSize: expectedPageSize,
      });
    },
  );

  it.each(['pageSize=10', 'pageSize=101', 'pageSize=invalid', 'page=0', 'page=invalid'])(
    'rejects unsupported pagination query %s',
    async (query) => {
      const gateway = avatarGateway();
      const response = await createApp(gateway).inject({
        method: 'GET',
        url: `/api/v1/admin/avatar-content/audit?${query}`,
        headers: { authorization: 'Bearer verified' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: 'INVALID_AVATAR_ADMIN_REQUEST' },
      });
      expect(gateway.audit).not.toHaveBeenCalled();
    },
  );
});
