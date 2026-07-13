import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminPermissionKey } from '@starville/admin-auth';
import type { OperationsSummary, PlayerActivity, PlayerDetail } from '@starville/player-operations';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type { AdminOperationsService } from './contracts.js';

class SilentLogger implements ServiceLogger {
  constructor(
    readonly entries: Array<{ readonly context: LogContext; readonly message: string }> = [],
    private readonly bindings: LogContext = {},
  ) {}

  child(bindings: LogContext): ServiceLogger {
    return new SilentLogger(this.entries, { ...this.bindings, ...bindings });
  }
  trace(_message: string): void {}
  debug(_message: string): void {}
  info(_message: string): void {}
  warn(_message: string): void {}
  error(message: string, context?: LogContext): void {
    this.entries.push({ message, context: { ...this.bindings, ...context } });
  }
  fatal(_message: string): void {}
}

const identity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal2' as const,
  authenticationMethods: ['password', 'totp'],
};

const playerDetail: PlayerDetail = {
  profile: {
    id: '44444444-4444-4444-8444-444444444444',
    displayName: 'Luna Vale',
    walletAddress: '11111111111111111111111111111111',
    appearancePreset: 'moonberry',
    mapId: 'lantern-square',
    mapVersionId: '55555555-5555-4555-8555-555555555555',
    x: 12,
    y: 7.5,
    facingDirection: 'south',
    gameStateVersion: 1,
    stateVersion: 1,
    lastTransitionAt: null,
    createdAt: '2026-07-11T09:00:00.000Z',
    updatedAt: '2026-07-11T09:00:00.000Z',
    lastEnteredAt: '2026-07-11T09:00:00.000Z',
  },
  moderation: {
    status: 'active',
    suspensionReason: null,
    suspendedAt: null,
    suspendedByAdminId: null,
    restoredAt: null,
    restoredByAdminId: null,
    restorationReason: null,
    renameRequired: false,
    renameReason: null,
    renameRequiredAt: null,
    renameRequiredByAdminId: null,
    version: 1,
    updatedAt: '2026-07-11T09:00:00.000Z',
  },
  access: { activeSessions: 0, latestSessionStatus: null, latestSessionAt: null },
};

const playerActivity: PlayerActivity = {
  items: [],
  accessEvents: [],
  accessPage: 1,
  accessPageSize: 10,
  accessTotal: 0,
  accessTotalPages: 0,
  nextCursor: null,
};

const operationsSummary: OperationsSummary = {
  generatedAt: '2026-07-11T10:00:00.000Z',
  players: {
    total: 1,
    active: 1,
    suspended: 0,
    renameRequired: 0,
    createdLast24Hours: 1,
    enteredLast24Hours: 1,
  },
  access: {
    activeSessions: 0,
    definition: 'Unexpired, unrevoked sessions valid for the current token config',
  },
  tokenAccess: {
    enabled: true,
    network: 'solana:mainnet-beta',
    symbol: 'STAR',
    requiredAmount: '1000',
    configVersion: 1,
    validationState: 'validated',
  },
  services: [
    {
      service: 'api',
      status: 'healthy',
      checkedAt: '2026-07-11T10:00:00.000Z',
      responseTimeMs: null,
    },
    {
      service: 'realtime-server',
      status: 'healthy',
      checkedAt: '2026-07-11T10:00:00.000Z',
      responseTimeMs: 2,
    },
    {
      service: 'worker',
      status: 'healthy',
      checkedAt: '2026-07-11T10:00:00.000Z',
      responseTimeMs: 2,
    },
  ],
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
        sessionExpiresAt: '2026-07-11T11:00:00.000Z',
        mfaRequired: true,
        assuranceLevel: 'aal2' as const,
        lastLoginAt: '2026-07-11T09:00:00.000Z',
      },
    })),
    createSession: vi.fn(async () => ({ outcome: 'unauthorized' as const })),
    revokeCurrentSession: vi.fn(async () => true),
    recordDenial: vi.fn(async () => undefined),
  };
}

function operationsService(): AdminOperationsService {
  return {
    listPlayers: vi.fn(async () => ({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 })),
    getPlayer: vi.fn(async () => playerDetail),
    getPlayerActivity: vi.fn(async () => playerActivity),
    getOperationsSummary: vi.fn(async () => operationsSummary),
    performPlayerAction: vi.fn(async () => ({
      playerId: '44444444-4444-4444-8444-444444444444',
      moderationStatus: 'suspended' as const,
      renameRequired: false,
      moderationVersion: 2,
      gameStateVersion: 1,
      revokedSessionCount: 1,
      replayed: false,
    })),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function createApp(
  permissions: readonly AdminPermissionKey[],
  service = operationsService(),
  logger = new SilentLogger(),
) {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3002'],
      trustedProxyCidrs: [],
    },
    logger,
    adminAuthGateway: adminGateway(permissions),
    adminSessionTtlMinutes: 60,
    adminOperations: { service },
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('administrator player routes', () => {
  it('returns only the bounded service result for an authorized directory request', async () => {
    const service = operationsService();
    const response = await createApp(['players.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/players?page=1',
      headers: { authorization: 'Bearer verified' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(service.listPlayers).toHaveBeenCalled();
  });

  it('requires authentication for the protected player directory', async () => {
    const response = await createApp(['players.read']).inject({
      method: 'GET',
      url: '/api/v1/admin/players',
    });
    expect(response.statusCode).toBe(401);
  });

  it('serves player detail only with player-read permission', async () => {
    const service = operationsService();
    const denied = await createApp([], service).inject({
      method: 'GET',
      url: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444',
      headers: { authorization: 'Bearer verified' },
    });
    const allowed = await createApp(['players.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444',
      headers: { authorization: 'Bearer verified' },
    });

    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ error: { code: 'ADMIN_ACCESS_DENIED' } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({
      data: {
        profile: {
          mapId: 'lantern-square',
          mapVersionId: '55555555-5555-4555-8555-555555555555',
          stateVersion: 1,
        },
        moderation: { status: 'active' },
        access: { activeSessions: 0 },
      },
    });
  });

  it('returns and logs a safe correlated player-detail service failure', async () => {
    const service = operationsService();
    const logger = new SilentLogger();
    vi.mocked(service.getPlayer).mockRejectedValue(
      new PublicApiError(503, 'OPERATIONS_UNAVAILABLE'),
    );
    const response = await createApp(['players.read'], service, logger).inject({
      method: 'GET',
      url: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444',
      headers: {
        authorization: 'Bearer verified',
        'x-request-id': 'phase5-test:local:detail',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'OPERATIONS_UNAVAILABLE' },
      requestId: 'phase5-test:local:detail',
    });
    expect(logger.entries).toContainEqual({
      message: 'api.request.failed',
      context: expect.objectContaining({
        requestId: 'phase5-test:local:detail',
        method: 'GET',
        path: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444',
        statusCode: 503,
        error: expect.objectContaining({ code: 'OPERATIONS_UNAVAILABLE' }),
      }),
    });
  });

  it('requires both player-read and player-audit permissions for activity', async () => {
    const service = operationsService();
    const auditOnly = await createApp(['player_audit.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444/activity',
      headers: { authorization: 'Bearer verified' },
    });
    const allowed = await createApp(['players.read', 'player_audit.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444/activity',
      headers: { authorization: 'Bearer verified' },
    });

    expect(auditOnly.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
  });

  it('enforces the operations permission on the truthful summary', async () => {
    const denied = await createApp([]).inject({
      method: 'GET',
      url: '/api/v1/admin/operations/summary',
      headers: { authorization: 'Bearer verified' },
    });
    const allowed = await createApp(['operations.read']).inject({
      method: 'GET',
      url: '/api/v1/admin/operations/summary',
      headers: { authorization: 'Bearer verified' },
    });

    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).not.toContain('online');
  });

  it('rejects a direct mutation when the exact permission is missing', async () => {
    const service = operationsService();
    const response = await createApp(['players.read'], service).inject({
      method: 'POST',
      url: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444/suspend',
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: { expectedVersion: 1, reason: 'Reviewed suspension reason' },
    });
    expect(response.statusCode).toBe(403);
    expect(service.performPlayerAction).not.toHaveBeenCalled();
  });

  it('requires the trusted admin origin before a permitted mutation', async () => {
    const service = operationsService();
    const response = await createApp(['players.suspend'], service).inject({
      method: 'POST',
      url: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444/suspend',
      headers: { authorization: 'Bearer verified', origin: 'https://untrusted.example' },
      payload: { expectedVersion: 1, reason: 'Reviewed suspension reason' },
    });
    expect(response.statusCode).toBe(403);
    expect(service.performPlayerAction).not.toHaveBeenCalled();
  });

  it('permits the exact action with JSON, origin, reason, and version', async () => {
    const service = operationsService();
    const response = await createApp(['players.suspend'], service).inject({
      method: 'POST',
      url: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444/suspend',
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: { expectedVersion: 1, reason: 'Reviewed suspension reason' },
    });
    expect(response.statusCode).toBe(200);
    expect(service.performPlayerAction).toHaveBeenCalledWith(
      identity,
      '44444444-4444-4444-8444-444444444444',
      'suspend',
      { expectedVersion: 1, reason: 'Reviewed suspension reason' },
      expect.any(String),
    );
  });

  it.each([
    ['restore', 'players.suspend'],
    ['reset-position', 'players.reset_position'],
    ['require-rename', 'players.require_rename'],
    ['revoke-sessions', 'players.manage_sessions'],
  ] as const)('maps %s to only its exact mutation permission', async (action, permission) => {
    const deniedService = operationsService();
    const denied = await createApp(['players.read'], deniedService).inject({
      method: 'POST',
      url: `/api/v1/admin/players/44444444-4444-4444-8444-444444444444/${action}`,
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: { expectedVersion: 1, reason: 'Reviewed operation reason' },
    });
    const allowedService = operationsService();
    const allowed = await createApp([permission], allowedService).inject({
      method: 'POST',
      url: `/api/v1/admin/players/44444444-4444-4444-8444-444444444444/${action}`,
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: { expectedVersion: 1, reason: 'Reviewed operation reason' },
    });

    expect(denied.statusCode).toBe(403);
    expect(deniedService.performPlayerAction).not.toHaveBeenCalled();
    expect(allowed.statusCode).toBe(200);
    expect(allowedService.performPlayerAction).toHaveBeenCalledWith(
      identity,
      '44444444-4444-4444-8444-444444444444',
      action,
      { expectedVersion: 1, reason: 'Reviewed operation reason' },
      expect.any(String),
    );
  });

  it('requires players.rename for a direct administrator rename', async () => {
    const deniedService = operationsService();
    const denied = await createApp(['players.require_rename'], deniedService).inject({
      method: 'POST',
      url: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444/rename',
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: {
        expectedVersion: 1,
        reason: 'Reviewed direct rename reason',
        displayName: 'Willow Vale',
      },
    });
    const allowedService = operationsService();
    const allowed = await createApp(['players.rename'], allowedService).inject({
      method: 'POST',
      url: '/api/v1/admin/players/44444444-4444-4444-8444-444444444444/rename',
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: {
        expectedVersion: 1,
        reason: 'Reviewed direct rename reason',
        displayName: 'Willow Vale',
      },
    });
    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowedService.performPlayerAction).toHaveBeenCalledWith(
      identity,
      '44444444-4444-4444-8444-444444444444',
      'rename',
      { expectedVersion: 1, reason: 'Reviewed direct rename reason', displayName: 'Willow Vale' },
      expect.any(String),
    );
  });
});
