import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminAuthorizationResult, AdminPermissionKey } from '@starville/admin-auth';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, ServiceLogger, VerifiedSupabaseIdentity } from '../contracts.js';
import type { AdminChatGateway } from './chat-admin-gateway.js';

const identity: VerifiedSupabaseIdentity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal1',
  authenticationMethods: ['password'],
};

const authorized = (permissionKeys: readonly AdminPermissionKey[]): AdminAuthorizationResult => ({
  outcome: 'authorized',
  context: {
    userId: identity.userId,
    displayName: 'Chat Moderator',
    adminStatus: 'active',
    roleKey: 'moderator',
    roleName: 'Moderator',
    permissionKeys: [...permissionKeys],
    adminSessionId: '33333333-3333-4333-8333-333333333333',
    sessionExpiresAt: '2026-07-15T01:00:00.000Z',
    mfaRequired: false,
    assuranceLevel: 'aal1',
    lastLoginAt: null,
  },
});

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

function reportList() {
  return {
    items: [
      {
        id: '40000000-0000-4000-8000-000000000001',
        messageId: '50000000-0000-4000-8000-000000000001',
        status: 'open' as const,
        category: 'spam' as const,
        reportedPresenceId: '60000000-0000-4000-8000-000000000001',
        reportedDisplayName: 'Reported Player',
        reporterPresenceId: '70000000-0000-4000-8000-000000000001',
        reporterDisplayName: 'Safe Reporter',
        worldId: 'lantern-square',
        channelId: '80000000-0000-4000-8000-000000000001',
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:00:00.000Z',
        revision: 1,
      },
    ],
    page: 1,
    pageSize: 10 as const,
    total: 1,
    totalPages: 1,
    openCount: 1,
  };
}

function chatGateway(): AdminChatGateway {
  return {
    list: vi.fn(async () => reportList()),
    detail: vi.fn(async () => undefined),
    act: vi.fn<AdminChatGateway['act']>(async (_identity, reportId) => ({
      status: 'applied',
      reportId,
      revision: 2,
      muteExpiresAt: '2026-07-14T01:00:00.000Z',
    })),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function appWith(result: AdminAuthorizationResult, gateway = chatGateway()) {
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
    adminChat: { gateway },
  });
  apps.push(app);
  return { app, gateway };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('administrator chat moderation API', () => {
  it('returns bounded report summaries only with the protected reports permission', async () => {
    const { app } = appWith(authorized(['multiplayer_chat.reports.read']));
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/multiplayer-chat/reports?page=1&pageSize=10',
      headers: { authorization: 'Bearer moderator' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { openCount: 1, total: 1 } });
    expect(response.body).not.toContain('wallet');
    expect(response.body).not.toContain('evidence');
  });

  it('denies read-only overview access to protected report evidence', async () => {
    const { app } = appWith(authorized(['multiplayer_chat.read']));
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/multiplayer-chat/reports',
      headers: { authorization: 'Bearer analyst' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'ADMIN_ACCESS_DENIED' } });
  });

  it('requires narrow mutation permission, trusted origin, strict revision, and reason', async () => {
    const gateway = chatGateway();
    const { app } = appWith(authorized(['multiplayer_chat.moderate']), gateway);
    const url =
      '/api/v1/admin/multiplayer-chat/reports/40000000-0000-4000-8000-000000000001/actions';
    const untrusted = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: 'Bearer moderator', 'content-type': 'application/json' },
      payload: {},
    });
    expect(untrusted.statusCode).toBe(403);
    const accepted = await app.inject({
      method: 'POST',
      url,
      headers: {
        authorization: 'Bearer moderator',
        origin: 'http://localhost:3002',
        'content-type': 'application/json',
      },
      payload: {
        action: 'chat_mute',
        reason: 'Repeated abusive messages after a clear warning.',
        expectedRevision: 1,
        requestId: 'moderation-request-1',
        muteDurationMinutes: 60,
      },
    });
    expect(accepted.statusCode).toBe(200);
    expect(gateway.act).toHaveBeenCalledWith(
      expect.objectContaining({ userId: identity.userId }),
      '40000000-0000-4000-8000-000000000001',
      expect.objectContaining({ action: 'chat_mute', expectedRevision: 1 }),
    );
  });
});
