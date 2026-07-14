import {
  EMPTY_PLATFORM_ASSET_URLS,
  STARVILLE_DEFAULT_CONFIGURATION,
  type PlatformVersion,
} from '@starville/platform-configuration';
import { describe, expect, it, vi } from 'vitest';

import type { LogContext, ServiceLogger } from '../contracts.js';
import type { PlatformConfigurationGateway } from './contracts.js';
import { createPlatformConfigurationService } from './service.js';

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
const version: PlatformVersion = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  platformKey: 'starville',
  versionNumber: 2,
  lifecycleStatus: 'draft',
  configuration: STARVILLE_DEFAULT_CONFIGURATION,
  assetUrls: EMPTY_PLATFORM_ASSET_URLS,
  validationResults: null,
  revision: 1,
  createdAt: '2026-07-14T00:00:00.000Z',
  reviewedAt: null,
  publishedAt: null,
};

function gateway(
  overrides: Partial<PlatformConfigurationGateway> = {},
): PlatformConfigurationGateway {
  return {
    getActive: vi.fn(async () => ({
      platformKey: 'starville',
      versionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      versionNumber: 1,
      revision: 1,
      configuration: STARVILLE_DEFAULT_CONFIGURATION,
      fallback: false,
      etag: 'platform-1-v1',
    })),
    getAdmin: vi.fn(async () => ({
      active: {
        platformKey: 'starville',
        versionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        versionNumber: 1,
        revision: 1,
        configuration: STARVILLE_DEFAULT_CONFIGURATION,
        fallback: false,
        etag: 'platform-1-v1',
      },
      draft: version,
      versions: [version],
      audit: [],
    })),
    preview: vi.fn(async () => version),
    createDraft: vi.fn(async () => ({ status: 'created', version })),
    updateDraft: vi.fn(async () => ({ status: 'updated', version })),
    validate: vi.fn(async () => ({ status: 'validated', version })),
    submitReview: vi.fn(async () => ({ status: 'submitted', version })),
    review: vi.fn(async () => ({ status: 'reviewed', version })),
    publish: vi.fn(async () => ({ status: 'published', version })),
    rollback: vi.fn(async () => ({ status: 'rolled_back', version })),
    ...overrides,
  };
}

describe('platform configuration service', () => {
  it('serves a compiled safe fallback when runtime persistence is unavailable', async () => {
    const service = createPlatformConfigurationService({
      gateway: gateway({ getActive: vi.fn(async () => Promise.reject(new Error('offline'))) }),
      logger: new SilentLogger(),
    });
    await expect(service.getActive('starville', 'request-1')).resolves.toMatchObject({
      fallback: true,
      configuration: { branding: { fullGameName: 'Starville' } },
    });
  });

  it('caches the exact active revision and invalidates after publication', async () => {
    const persistence = gateway();
    const service = createPlatformConfigurationService({
      gateway: persistence,
      logger: new SilentLogger(),
      cacheTtlMs: 60_000,
    });
    await service.getActive('starville', 'request-1');
    await service.getActive('starville', 'request-2');
    expect(persistence.getActive).toHaveBeenCalledTimes(1);
    await service.publish(
      identity,
      version.id,
      { expectedRevision: 1, expectedActiveRevision: 1, reason: 'Publish reviewed draft.' },
      'request-3',
    );
    await service.getActive('starville', 'request-4');
    expect(persistence.getActive).toHaveBeenCalledTimes(2);
  });

  it('converts approved delivery paths to public URLs without exposing storage paths', async () => {
    const persistence = gateway({
      getActive: vi.fn(async () => ({
        platformKey: 'starville',
        versionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        versionNumber: 1,
        revision: 1,
        configuration: STARVILLE_DEFAULT_CONFIGURATION,
        assetDeliveryPaths: {
          branding: { brand_logo: 'starville/brand/v1/preview.webp' },
          landing: { hero: 'starville/hero/v2/preview.webp' },
        },
        fallback: false,
        etag: 'platform-1-v1',
      })),
    });
    const service = createPlatformConfigurationService({
      gateway: persistence,
      logger: new SilentLogger(),
      publicAssetUrl: (path) => `https://assets.example/${path}`,
    });
    const result = await service.getActive('starville', 'request-assets');
    expect(result.assetUrls).toMatchObject({
      branding: { brand_logo: 'https://assets.example/starville/brand/v1/preview.webp' },
      landing: { hero: 'https://assets.example/starville/hero/v2/preview.webp' },
    });
    expect(JSON.stringify(result)).not.toContain('assetDeliveryPaths');
  });

  it('validates structured configuration before the trusted validation RPC', async () => {
    const persistence = gateway();
    const service = createPlatformConfigurationService({
      gateway: persistence,
      logger: new SilentLogger(),
    });
    await service.validate(
      identity,
      version.id,
      { expectedRevision: 1, reason: 'Validate presentation draft.' },
      'request-5',
    );
    expect(persistence.validate).toHaveBeenCalledWith(
      identity,
      version.id,
      1,
      expect.objectContaining({ valid: true }),
      'Validate presentation draft.',
      'request-5',
    );
  });

  it('rejects malformed mutation input before persistence', async () => {
    const persistence = gateway();
    const service = createPlatformConfigurationService({
      gateway: persistence,
      logger: new SilentLogger(),
    });
    await expect(
      service.createDraft(identity, { platformKey: '../other' }, 'request-6'),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_PLATFORM_CONFIGURATION_REQUEST',
    });
    expect(persistence.createDraft).not.toHaveBeenCalled();
  });

  it('maps trusted database rate limits to the existing safe API boundary', async () => {
    const service = createPlatformConfigurationService({
      gateway: gateway({ createDraft: vi.fn(async () => ({ status: 'rate_limited' })) }),
      logger: new SilentLogger(),
    });
    await expect(
      service.createDraft(
        identity,
        { platformKey: 'starville', reason: 'Create a bounded presentation draft.' },
        'request-7',
      ),
    ).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
  });
});
