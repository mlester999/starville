import { describe, expect, it, vi } from 'vitest';

import type { LogContext, ServiceLogger } from '../contracts.js';
import type {
  AdminOperationsGateway,
  OperationsHealthReader,
  OperationsServiceStatus,
} from './contracts.js';
import { createAdminOperationsService } from './service.js';

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
  assuranceLevel: 'aal2',
  authenticationMethods: ['password', 'totp'],
} as const;

const actionResult = {
  playerId: '33333333-3333-4333-8333-333333333333',
  moderationStatus: 'active' as const,
  renameRequired: false,
  moderationVersion: 2,
  gameStateVersion: 2,
  revokedSessionCount: 0,
  replayed: false,
};

function gateway(): AdminOperationsGateway {
  return {
    listPlayers: vi.fn(async () => ({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 })),
    getPlayer: vi.fn(async (): Promise<'not_found'> => 'not_found'),
    getPlayerActivity: vi.fn(async (): Promise<'not_found'> => 'not_found'),
    getSummary: vi.fn(
      async () =>
        ({
          generatedAt: '2026-07-11T10:00:00.000Z',
          players: {
            total: 0,
            active: 0,
            suspended: 0,
            renameRequired: 0,
            createdLast24Hours: 0,
            enteredLast24Hours: 0,
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
        }) as const,
    ),
    performPlayerAction: vi.fn(async () => actionResult),
  };
}

const serviceStatuses: readonly OperationsServiceStatus[] = [
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
    responseTimeMs: 3,
  },
];

function createService(target = gateway()) {
  const healthReader: OperationsHealthReader = { read: vi.fn(async () => serviceStatuses) };
  return {
    target,
    service: createAdminOperationsService({
      gateway: target,
      healthReader,
      logger: new SilentLogger(),
      actionRateLimit: 20,
    }),
  };
}

describe('admin operations service', () => {
  it('normalizes bounded directory queries before persistence', async () => {
    const { target, service } = createService();
    await service.listPlayers(identity, { search: '  Luna  ', page: '2', status: 'active' });
    expect(target.listPlayers).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({ search: 'Luna', page: 2, pageSize: 25, status: 'active' }),
    );
  });

  it('rejects coordinates and missing reasons from reset requests', async () => {
    const { target, service } = createService();
    await expect(
      service.performPlayerAction(
        identity,
        actionResult.playerId,
        'reset-position',
        { expectedVersion: 1, reason: 'Reset stuck player safely', x: 1, y: 2 },
        'request-reset',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_PLAYER_OPERATION' }));
    expect(target.performPlayerAction).not.toHaveBeenCalled();
  });

  it('normalizes server-side access pagination and accepts only reviewed page sizes', async () => {
    const { target, service } = createService();
    vi.mocked(target.getPlayerActivity).mockResolvedValue({
      items: [],
      accessEvents: [],
      accessPage: 3,
      accessPageSize: 50,
      accessTotal: 0,
      accessTotalPages: 0,
      nextCursor: null,
    });
    await service.getPlayerActivity(identity, actionResult.playerId, {
      limit: '25',
      accessPage: '3',
      accessPageSize: '50',
    });
    expect(target.getPlayerActivity).toHaveBeenCalledWith(identity, actionResult.playerId, {
      limit: 25,
      accessPage: 3,
      accessPageSize: 50,
    });
    await expect(
      service.getPlayerActivity(identity, actionResult.playerId, { accessPageSize: '20' }),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_PLAYER_OPERATION' }));
  });

  it('requires a display name only for the narrowly scoped rename action', async () => {
    const { target, service } = createService();
    await service.performPlayerAction(
      identity,
      actionResult.playerId,
      'rename',
      { expectedVersion: 1, reason: 'Reviewed direct rename reason', displayName: 'Willow Vale' },
      'rename-request',
    );
    expect(target.performPlayerAction).toHaveBeenCalledWith(
      identity,
      actionResult.playerId,
      'rename',
      { expectedVersion: 1, reason: 'Reviewed direct rename reason', displayName: 'Willow Vale' },
      'rename-request',
      20,
    );
  });

  it('maps optimistic concurrency and rate limits to safe errors', async () => {
    const target = gateway();
    vi.mocked(target.performPlayerAction)
      .mockResolvedValueOnce('version_conflict')
      .mockResolvedValueOnce('rate_limited');
    const { service } = createService(target);
    const body = { expectedVersion: 1, reason: 'Reviewed operational reason' };
    await expect(
      service.performPlayerAction(identity, actionResult.playerId, 'suspend', body, 'one'),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'PLAYER_VERSION_CONFLICT', statusCode: 409 }),
    );
    await expect(
      service.performPlayerAction(identity, actionResult.playerId, 'suspend', body, 'two'),
    ).rejects.toEqual(expect.objectContaining({ code: 'RATE_LIMITED', statusCode: 429 }));
  });
});
