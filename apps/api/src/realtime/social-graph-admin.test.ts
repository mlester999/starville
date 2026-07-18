import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminAuthorizationResult, AdminPermissionKey } from '@starville/admin-auth';
import type { AdminSocialGraphPartyDetail } from '@starville/realtime';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, ServiceLogger, VerifiedSupabaseIdentity } from '../contracts.js';
import {
  AdminSocialGraphPersistenceError,
  type AdminSocialGraphGateway,
} from './social-graph-admin-gateway.js';

const identity: VerifiedSupabaseIdentity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal1',
  authenticationMethods: ['password'],
};

const settings = {
  maximumFriends: 100,
  maximumIncomingRequests: 50,
  maximumOutgoingRequests: 25,
  partyCapacity: 4,
  friendRequestExpirySeconds: 604_800,
  partyInvitationExpirySeconds: 120,
  readyCheckExpirySeconds: 30,
  leaderReconnectGraceSeconds: 60,
  partyDormantTimeoutSeconds: 86_400,
  nearbyInvitationsEnabled: true,
  partyChatEnabled: true,
  friendLocationVisibilityEnabled: true,
  version: 1,
} as const;

const partyDetail: AdminSocialGraphPartyDetail = {
  party: {
    partyId: '44444444-4444-4444-8444-444444444444',
    revision: 3,
    status: 'active',
    capacity: 4,
    leaderPresenceId: '55555555-5555-4555-8555-555555555555',
    members: [
      {
        presenceId: '55555555-5555-4555-8555-555555555555',
        displayName: 'Safe Leader',
        level: 12,
        appearancePreset: 'moss',
        role: 'leader',
        connectionStatus: 'online',
        worldId: 'lantern-square',
        worldName: 'Lantern Square',
        channelNumber: 1,
        readyState: 'waiting',
        joinedAt: '2026-07-15T00:00:00.000Z',
      },
    ],
    pendingInvitationCount: 0,
    readyCheck: null,
    leaderReconnectDeadline: null,
  },
  invitations: [],
  audit: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      action: 'party_created',
      result: 'created',
      partyRevision: 1,
      createdAt: '2026-07-15T00:00:00.000Z',
    },
  ],
};

function authorization(permissionKeys: readonly AdminPermissionKey[]): AdminAuthorizationResult {
  return {
    outcome: 'authorized',
    context: {
      userId: identity.userId,
      displayName: 'Graph Operator',
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

function gateway(): AdminSocialGraphGateway {
  return {
    list: vi.fn(async () => ({
      parties: [],
      friendshipRequestCount: 3,
      acceptedFriendshipCount: 2,
      recentDisbandCount: 1,
      page: 1,
      pageSize: 10 as const,
      total: 0,
      totalPages: 0,
    })),
    party: vi.fn(async () => partyDetail),
    audit: vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 10 as const,
      total: 0,
      totalPages: 0,
    })),
    settings: vi.fn(async () => settings),
    updateSettings: vi.fn(async (_identity, input) => ({
      ...settings,
      ...input,
      version: settings.version + 1,
    })),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function appWith(permissions: readonly AdminPermissionKey[], socialGraphGateway = gateway()) {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 0,
      corsAllowedOrigins: ['http://localhost:3002'],
      trustedProxyCidrs: [],
    },
    logger,
    adminAuthGateway: authGateway(authorization(permissions)),
    adminSessionTtlMinutes: 60,
    adminSocialGraph: { gateway: socialGraphGateway },
  });
  apps.push(app);
  return { app, socialGraphGateway };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('administrator social graph visibility', () => {
  it('returns bounded operational summaries without private friendship or wallet data', async () => {
    const { app, socialGraphGateway } = appWith(['social_graph.read']);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/social-graph?page=1&pageSize=10&status=active',
      headers: { authorization: 'Bearer graph-reader' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: { friendshipRequestCount: 3, acceptedFriendshipCount: 2 },
    });
    expect(response.body).not.toMatch(/wallet|friendList|messageText/iu);
    expect(socialGraphGateway.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: identity.userId }),
      expect.objectContaining({ status: 'active', pageSize: 10 }),
    );
  });

  it('keeps audit and settings behind their independent narrow permissions', async () => {
    const { app } = appWith(['social_graph.read']);
    for (const url of ['/api/v1/admin/social-graph/audit', '/api/v1/admin/social-graph/settings']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: 'Bearer graph-reader' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: 'ADMIN_ACCESS_DENIED' } });
    }
  });

  it('returns bounded party detail to an audit reader without private fields', async () => {
    const { app, socialGraphGateway } = appWith(['social_graph.audit.read']);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/social-graph/parties/${partyDetail.party.partyId}`,
      headers: { authorization: 'Bearer graph-auditor' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        party: { partyId: partyDetail.party.partyId },
        invitations: [],
        audit: [{ action: 'party_created', result: 'created' }],
      },
    });
    expect(response.body).not.toMatch(/wallet|email|sessionToken|friendList|messageText/iu);
    expect(socialGraphGateway.party).toHaveBeenCalledWith(
      expect.objectContaining({ userId: identity.userId }),
      partyDetail.party.partyId,
    );
  });

  it('denies party detail to an administrator without the audit permission', async () => {
    const { app, socialGraphGateway } = appWith(['social_graph.read']);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/social-graph/parties/${partyDetail.party.partyId}`,
      headers: { authorization: 'Bearer graph-reader' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'ADMIN_ACCESS_DENIED' } });
    expect(socialGraphGateway.party).not.toHaveBeenCalled();
  });

  it('validates, origin-protects, versions, and audits controlled settings updates', async () => {
    const { app, socialGraphGateway } = appWith(['social_graph.settings.edit']);
    const input = {
      expectedVersion: 1,
      maximumFriends: 120,
      partyCapacity: 4,
      friendRequestExpirySeconds: 604_800,
      partyInvitationExpirySeconds: 120,
      readyCheckExpirySeconds: 30,
      leaderReconnectGraceSeconds: 60,
      partyDormantTimeoutSeconds: 86_400,
      nearbyInvitationsEnabled: true,
      partyChatEnabled: true,
      friendLocationVisibilityEnabled: true,
    };
    const forbidden = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/social-graph/settings',
      headers: { authorization: 'Bearer graph-editor', origin: 'https://untrusted.example' },
      payload: input,
    });
    expect(forbidden.statusCode).toBe(403);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/social-graph/settings',
      headers: { authorization: 'Bearer graph-editor', origin: 'http://localhost:3002' },
      payload: input,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { maximumFriends: 120, version: 2 } });
    expect(socialGraphGateway.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ userId: identity.userId }),
      input,
      expect.any(String),
    );
  });

  it('maps persistence failures to a safe unavailable response', async () => {
    const socialGraphGateway = gateway();
    vi.mocked(socialGraphGateway.list).mockRejectedValueOnce(
      new AdminSocialGraphPersistenceError('list'),
    );
    const response = await appWith(['social_graph.read'], socialGraphGateway).app.inject({
      method: 'GET',
      url: '/api/v1/admin/social-graph',
      headers: { authorization: 'Bearer graph-reader' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: 'SOCIAL_GRAPH_UNAVAILABLE' } });
  });
});
