import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminAuthorizationResult, AdminPermissionKey } from '@starville/admin-auth';
import { MOONPETAL_HARVEST_HELP } from '@starville/cooperative-activities';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, ServiceLogger, VerifiedSupabaseIdentity } from '../contracts.js';
import type { AdminCooperativeActivityGateway } from './cooperative-activity-admin-gateway.js';

const identity: VerifiedSupabaseIdentity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal1',
  authenticationMethods: ['password'],
};

function authorization(permissionKeys: readonly AdminPermissionKey[]): AdminAuthorizationResult {
  return {
    outcome: 'authorized',
    context: {
      userId: identity.userId,
      displayName: 'Activity Steward',
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

const settings = {
  moduleEnabled: true,
  publicQueueEnabled: false as const,
  allowExistingInstancesToFinish: true,
  maximumActiveInstances: 100,
  maximumFailedAttemptsPerHour: 6,
  maximumPartyCreationsPerHour: 6,
  version: 1,
  updatedAt: '2026-07-15T00:00:00.000Z',
};

function gateway(): AdminCooperativeActivityGateway {
  return {
    list: vi.fn(async (_identity, query) => ({
      view: query.view as 'instances',
      rows: [],
      page: query.page,
      pageSize: query.pageSize,
      total: 0,
    })),
    instance: vi.fn(async () => undefined),
    settings: vi.fn(async () => settings),
    updateSettings: vi.fn(async (_identity, input) => ({
      ...settings,
      ...input,
      publicQueueEnabled: false as const,
      version: settings.version + 1,
    })),
    preview: vi.fn(async (_identity, _versionId, simulationStep) => ({
      status: 'preview' as const,
      previewMode: true as const,
      persistent: false as const,
      rewardsSettled: false as const,
      activity: MOONPETAL_HARVEST_HELP,
      simulationStep,
      currentObjectiveKey:
        MOONPETAL_HARVEST_HELP.objectives[simulationStep]?.key ?? 'community-harvest-complete',
    })),
    createDraft: vi.fn(async () => MOONPETAL_HARVEST_HELP),
    updateDraft: vi.fn(async () => MOONPETAL_HARVEST_HELP),
    transition: vi.fn(async () => MOONPETAL_HARVEST_HELP),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function appWith(permissions: readonly AdminPermissionKey[], activityGateway = gateway()) {
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
    adminCooperativeActivities: { gateway: activityGateway },
  });
  apps.push(app);
  return { app, activityGateway };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('administrator cooperative activity operations', () => {
  it('returns bounded activity rows without private identity or reward mutation fields', async () => {
    const { app, activityGateway } = appWith(['cooperative_activities.read']);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/cooperative-activities?view=instances&page=1&pageSize=10',
      headers: { authorization: 'Bearer activity-reader' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { view: 'instances', rows: [] } });
    expect(response.body).not.toMatch(/wallet|email|serviceRole|grantReward/iu);
    expect(activityGateway.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: identity.userId }),
      expect.objectContaining({ view: 'instances', pageSize: 10 }),
    );
  });

  it('keeps append-only audit behind its independent read permission', async () => {
    const response = await appWith(['cooperative_activities.read']).app.inject({
      method: 'GET',
      url: '/api/v1/admin/cooperative-activities?view=audit&pageSize=10',
      headers: { authorization: 'Bearer activity-reader' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'ADMIN_ACCESS_DENIED' } });
  });

  it('origin-protects settings and cannot enable the disabled public queue', async () => {
    const { app, activityGateway } = appWith(['cooperative_activities.settings.edit']);
    const input = {
      expectedVersion: 1,
      moduleEnabled: true,
      allowExistingInstancesToFinish: true,
      maximumActiveInstances: 120,
      maximumFailedAttemptsPerHour: 6,
      maximumPartyCreationsPerHour: 6,
    };
    const forbidden = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/cooperative-activities/settings',
      headers: { authorization: 'Bearer activity-editor', origin: 'https://untrusted.example' },
      payload: input,
    });
    expect(forbidden.statusCode).toBe(403);
    const invalid = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/cooperative-activities/settings',
      headers: { authorization: 'Bearer activity-editor', origin: 'http://localhost:3002' },
      payload: { ...input, publicQueueEnabled: true },
    });
    expect(invalid.statusCode).toBe(400);
    expect(activityGateway.updateSettings).not.toHaveBeenCalled();
  });

  it('separates preview, review, and publish authority without settling rewards', async () => {
    const previewGateway = gateway();
    const preview = await appWith(['cooperative_activities.preview'], previewGateway).app.inject({
      method: 'POST',
      url: '/api/v1/admin/cooperative-activities/preview',
      headers: { authorization: 'Bearer activity-preview', origin: 'http://localhost:3002' },
      payload: { versionId: MOONPETAL_HARVEST_HELP.versionId, simulationStep: 2 },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      data: { previewMode: true, persistent: false, rewardsSettled: false },
    });

    const reviewDenied = await appWith(['cooperative_activities.validate']).app.inject({
      method: 'POST',
      url: `/api/v1/admin/cooperative-activities/versions/${MOONPETAL_HARVEST_HELP.versionId}/lifecycle`,
      headers: { authorization: 'Bearer activity-validator', origin: 'http://localhost:3002' },
      payload: { action: 'submit_review', expectedRevision: 1 },
    });
    expect(reviewDenied.statusCode).toBe(403);
  });
});
