import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminAuthorizationResult, AdminPermissionKey } from '@starville/admin-auth';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, ServiceLogger, VerifiedSupabaseIdentity } from '../contracts.js';
import { AdminSocialPersistenceError, type AdminSocialGateway } from './social-admin-gateway.js';

const identity: VerifiedSupabaseIdentity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal1',
  authenticationMethods: ['password'],
};

function authorized(permissionKeys: readonly AdminPermissionKey[]): AdminAuthorizationResult {
  return {
    outcome: 'authorized',
    context: {
      userId: identity.userId,
      displayName: 'Social Auditor',
      adminStatus: 'active',
      roleKey: 'game_administrator',
      roleName: 'Game Administrator',
      permissionKeys: [...permissionKeys],
      adminSessionId: '33333333-3333-4333-8333-333333333333',
      sessionExpiresAt: '2026-07-15T01:00:00.000Z',
      mfaRequired: false,
      assuranceLevel: 'aal1',
      lastLoginAt: null,
    },
  };
}

function authGateway(result: AdminAuthorizationResult): AdminAuthGateway {
  return {
    verifyBearer: vi.fn(async () => identity),
    loadAuthorization: vi.fn(async () => result),
    createSession: vi.fn(async () => result),
    revokeCurrentSession: vi.fn(async () => true),
    recordDenial: vi.fn(async () => undefined),
  };
}

const logger: ServiceLogger = {
  child() {
    return this;
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
};

function socialGateway(): AdminSocialGateway {
  return {
    list: vi.fn<AdminSocialGateway['list']>(async () => ({
      items: [
        {
          id: '40000000-0000-4000-8000-000000000001',
          kind: 'gift',
          status: 'completed',
          sender: {
            presenceId: '50000000-0000-4000-8000-000000000001',
            displayName: 'Moss Friend',
          },
          target: {
            presenceId: '50000000-0000-4000-8000-000000000002',
            displayName: 'Fern Friend',
          },
          revision: 1,
          createdAt: '2026-07-14T00:00:00.000Z',
          expiresAt: '2026-07-14T00:01:30.000Z',
          completedAt: '2026-07-14T00:00:10.000Z',
          failureCode: null,
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    })),
    detail: vi.fn(async () => undefined),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function appWith(result: AdminAuthorizationResult, gateway = socialGateway()) {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 0,
      corsAllowedOrigins: ['http://localhost:3002'],
      trustedProxyCidrs: [],
    },
    logger,
    adminAuthGateway: authGateway(result),
    adminSessionTtlMinutes: 60,
    adminSocial: { gateway },
  });
  apps.push(app);
  return { app, gateway };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('administrator social interaction visibility', () => {
  it('returns bounded summaries with the read permission and no private identity fields', async () => {
    const { app, gateway } = appWith(authorized(['social_interactions.read']));
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/social-interactions?page=1&pageSize=10&type=gift&status=completed',
      headers: { authorization: 'Bearer game-admin' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { total: 1 } });
    expect(response.body).not.toContain('wallet');
    expect(response.body).not.toContain('authSession');
    expect(gateway.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: identity.userId }),
      expect.objectContaining({ type: 'gift', status: 'completed' }),
    );
  });

  it('requires the narrow audit permission for immutable receipt detail', async () => {
    const { app } = appWith(authorized(['social_interactions.read']));
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/social-interactions/40000000-0000-4000-8000-000000000001',
      headers: { authorization: 'Bearer game-admin' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'ADMIN_ACCESS_DENIED' } });
  });

  it('rejects unbounded queries and maps persistence failures to a safe response', async () => {
    const permissions = authorized(['social_interactions.read']);
    const invalid = await appWith(permissions).app.inject({
      method: 'GET',
      url: '/api/v1/admin/social-interactions?pageSize=500',
      headers: { authorization: 'Bearer game-admin' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: 'INVALID_SOCIAL_INTERACTION_REQUEST' } });

    const gateway = socialGateway();
    vi.mocked(gateway.list).mockRejectedValueOnce(new AdminSocialPersistenceError('list'));
    const unavailable = await appWith(permissions, gateway).app.inject({
      method: 'GET',
      url: '/api/v1/admin/social-interactions',
      headers: { authorization: 'Bearer game-admin' },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({
      error: { code: 'SOCIAL_INTERACTIONS_UNAVAILABLE' },
    });
  });
});
