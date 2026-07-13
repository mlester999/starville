import { describe, expect, it, vi } from 'vitest';

import type { LogContext, ServiceLogger } from '../contracts.js';
import type { LiveOperationsGateway } from './contracts.js';
import { createLiveOperationsService } from './service.js';

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
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  authSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  assuranceLevel: 'aal2',
  authenticationMethods: ['password', 'totp'],
} as const;
function gateway(): LiveOperationsGateway {
  return {
    getPublic: vi.fn(async () => {
      throw new Error('offline');
    }),
    getAdmin: vi.fn(),
    updateMaintenance: vi.fn(),
    saveAnnouncement: vi.fn(),
    setAnnouncementStatus: vi.fn(),
  };
}

describe('live operations service', () => {
  it('fails closed with the fixed nonblank maintenance fallback', async () => {
    const service = createLiveOperationsService({
      gateway: gateway(),
      logger: new SilentLogger(),
      clock: () => new Date('2026-07-13T00:00:00.000Z'),
    });
    await expect(service.getPublic('request-1')).resolves.toMatchObject({
      maintenance: { state: 'configuration_error', active: true, title: 'SERVER PAUSED' },
      announcements: [],
    });
  });

  it('rejects malformed maintenance before persistence', async () => {
    const persistence = gateway();
    const service = createLiveOperationsService({
      gateway: persistence,
      logger: new SilentLogger(),
    });
    await expect(
      service.updateMaintenance(identity, { enabled: true }, 'request-2'),
    ).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_LIVE_OPERATIONS_REQUEST' });
    expect(persistence.updateMaintenance).not.toHaveBeenCalled();
  });
});
