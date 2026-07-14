import {
  EMPTY_PLATFORM_ASSET_URLS,
  STARVILLE_DEFAULT_CONFIGURATION,
} from '@starville/platform-configuration';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import type { PlatformConfigurationService } from './contracts.js';

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
const authGateway: AdminAuthGateway = {
  verifyBearer: async (token) => (token === 'valid' ? identity : undefined),
  loadAuthorization: async () => ({
    outcome: 'authorized',
    context: {
      userId: identity.userId,
      displayName: 'Administrator',
      adminStatus: 'active',
      roleKey: 'game_administrator',
      roleName: 'Game Administrator',
      permissionKeys: ['platform_configuration.read', 'platform_configuration.preview'],
      adminSessionId: identity.authSessionId,
      sessionExpiresAt: '2026-07-15T00:00:00.000Z',
      mfaRequired: true,
      assuranceLevel: 'aal2',
      lastLoginAt: null,
    },
  }),
  createSession: async () => ({ outcome: 'unauthorized' }),
  revokeCurrentSession: async () => false,
  recordDenial: async () => undefined,
};

const active = {
  platformKey: 'starville',
  versionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  versionNumber: 1,
  revision: 1,
  configuration: STARVILLE_DEFAULT_CONFIGURATION,
  assetUrls: EMPTY_PLATFORM_ASSET_URLS,
  fallback: false,
  etag: 'platform-1-v1',
} as const;
const service: PlatformConfigurationService = {
  getActive: vi.fn(async () => active),
  getAdmin: vi.fn(),
  preview: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  validate: vi.fn(),
  submitReview: vi.fn(),
  review: vi.fn(),
  publish: vi.fn(),
  rollback: vi.fn(),
  invalidate: vi.fn(),
};
const apps: ReturnType<typeof buildApiApp>[] = [];
function app(platformService: PlatformConfigurationService = service) {
  const instance = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3002'],
      trustedProxyCidrs: [],
    },
    logger: new SilentLogger(),
    adminAuthGateway: authGateway,
    adminSessionTtlMinutes: 60,
    platformConfiguration: { service: platformService },
  });
  apps.push(instance);
  return instance;
}
afterEach(async () => Promise.all(apps.splice(0).map(async (instance) => instance.close())));

describe('platform configuration routes', () => {
  it('delivers a revision ETag and honors conditional public reads', async () => {
    const first = await app().inject({
      method: 'GET',
      url: '/api/v1/platform-configuration/starville',
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers.etag).toBe('"platform-1-v1"');
    const second = await app().inject({
      method: 'GET',
      url: '/api/v1/platform-configuration/starville',
      headers: { 'if-none-match': '"platform-1-v1"' },
    });
    expect(second.statusCode).toBe(304);
  });

  it('denies public draft preview and marks authorized previews noindex', async () => {
    const publicResult = await app().inject({
      method: 'GET',
      url: '/api/v1/admin/platform-configuration/starville/preview/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(publicResult.statusCode).toBe(401);
    const authorized = await app().inject({
      method: 'GET',
      url: '/api/v1/admin/platform-configuration/starville/preview/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      headers: { authorization: 'Bearer valid' },
    });
    expect(authorized.headers['x-robots-tag']).toContain('noindex');
  });

  it('returns a safe disabled response for direct module access', async () => {
    const disabledConfiguration = structuredClone(STARVILLE_DEFAULT_CONFIGURATION);
    disabledConfiguration.modules.find(({ key }) => key === 'platform_configuration')!.enabled =
      false;
    const disabledService = {
      ...service,
      getActive: vi.fn(async () => ({ ...active, configuration: disabledConfiguration })),
    };
    const result = await app(disabledService).inject({
      method: 'GET',
      url: '/api/v1/admin/platform-configuration/starville',
      headers: { authorization: 'Bearer valid' },
    });
    expect(result.statusCode).toBe(404);
    expect(result.json()).toMatchObject({ error: { code: 'MODULE_DISABLED' } });
  });
});
