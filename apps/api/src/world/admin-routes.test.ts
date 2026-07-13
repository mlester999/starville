import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminPermissionKey } from '@starville/admin-auth';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import type { AdminWorldService } from './admin-contracts.js';

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
const mapId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';

function authGateway(permissionKeys: readonly AdminPermissionKey[]): AdminAuthGateway {
  return {
    verifyBearer: vi.fn(async () => identity),
    loadAuthorization: vi.fn(async () => ({
      outcome: 'authorized' as const,
      context: {
        userId: identity.userId,
        displayName: 'World Test',
        adminStatus: 'active' as const,
        roleKey: 'world_designer' as const,
        roleName: 'World Designer',
        permissionKeys: [...permissionKeys],
        adminSessionId: identity.authSessionId,
        sessionExpiresAt: '2026-07-12T05:00:00.000Z',
        mfaRequired: true,
        assuranceLevel: 'aal2' as const,
        lastLoginAt: '2026-07-12T03:00:00.000Z',
      },
    })),
    createSession: vi.fn(async () => ({ outcome: 'unauthorized' as const })),
    revokeCurrentSession: vi.fn(async () => true),
    recordDenial: vi.fn(async () => undefined),
  };
}

function worldService(): AdminWorldService {
  return {
    listWorlds: vi.fn(async () => ({ items: [] })),
    getPublishedTopology: vi.fn(async () => ({ status: 'loaded', maps: [] })),
    getWorld: vi.fn(async () => ({ map: {} })),
    getDraft: vi.fn(async () => ({ manifest: {} })),
    createDraft: vi.fn(async () => ({ version: {} })),
    saveDraft: vi.fn(async () => ({ version: {} })),
    validateDraft: vi.fn(async () => ({ validationResult: {} })),
    publishVersion: vi.fn(async () => ({ version: {} })),
    deriveVersion: vi.fn(async () => ({ version: {} })),
    previewVersion: vi.fn(async () => ({ draftPreview: true })),
    listAudit: vi.fn(async () => ({ items: [] })),
    listAssets: vi.fn(async () => ({ items: [] })),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function app(permissions: readonly AdminPermissionKey[], service = worldService()) {
  const value = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3002'],
      trustedProxyCidrs: [],
    },
    logger: new SilentLogger(),
    adminAuthGateway: authGateway(permissions),
    adminSessionTtlMinutes: 60,
    adminWorld: { service, manifestMaximumBytes: 262_144 },
  });
  apps.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (value) => value.close()));
});

describe('administrator world routes', () => {
  it('requires authentication and exact map-read permission for the directory', async () => {
    const service = worldService();
    const missing = await app(['maps.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/worlds',
    });
    const denied = await app([], service).inject({
      method: 'GET',
      url: '/api/v1/admin/worlds',
      headers: { authorization: 'Bearer verified' },
    });
    const allowed = await app(['maps.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/worlds?limit=25&offset=0',
      headers: { authorization: 'Bearer verified' },
    });

    expect(missing.statusCode).toBe(401);
    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['cache-control']).toBe('no-store');
    expect(service.listWorlds).toHaveBeenCalledWith(
      identity,
      { limit: '25', offset: '0' },
      expect.any(String),
    );
  });

  it('keeps the stored published topology behind maps.read', async () => {
    const service = worldService();
    const denied = await app([], service).inject({
      method: 'GET',
      url: '/api/v1/admin/world-topology',
      headers: { authorization: 'Bearer verified' },
    });
    const allowed = await app(['maps.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/world-topology',
      headers: { authorization: 'Bearer verified' },
    });

    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(service.getPublishedTopology).toHaveBeenCalledWith(identity, expect.any(String));
  });

  it('keeps draft preview behind its independent permission', async () => {
    const service = worldService();
    const readOnly = await app(['maps.read'], service).inject({
      method: 'GET',
      url: `/api/v1/admin/worlds/${mapId}/versions/${versionId}/preview`,
      headers: { authorization: 'Bearer verified' },
    });
    const preview = await app(['maps.preview'], service).inject({
      method: 'GET',
      url: `/api/v1/admin/worlds/${mapId}/versions/${versionId}/preview`,
      headers: { authorization: 'Bearer verified' },
    });

    expect(readOnly.statusCode).toBe(403);
    expect(preview.statusCode).toBe(200);
    expect(service.previewVersion).toHaveBeenCalledWith(
      identity,
      mapId,
      versionId,
      expect.any(String),
    );
  });

  it('requires exact edit permission and trusted origin before draft mutation', async () => {
    const service = worldService();
    const untrusted = await app(['maps.edit'], service).inject({
      method: 'POST',
      url: `/api/v1/admin/worlds/${mapId}/drafts`,
      headers: { authorization: 'Bearer verified', origin: 'https://untrusted.invalid' },
      payload: { expectedRecordVersion: 1 },
    });
    const readOnly = await app(['maps.read'], service).inject({
      method: 'POST',
      url: `/api/v1/admin/worlds/${mapId}/drafts`,
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: { expectedRecordVersion: 1 },
    });
    const allowed = await app(['maps.edit'], service).inject({
      method: 'POST',
      url: `/api/v1/admin/worlds/${mapId}/drafts`,
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: { expectedRecordVersion: 1 },
    });

    expect(untrusted.statusCode).toBe(403);
    expect(readOnly.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(service.createDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps publication behind maps.publish even for editors', async () => {
    const service = worldService();
    const editor = await app(['maps.edit'], service).inject({
      method: 'POST',
      url: `/api/v1/admin/worlds/${mapId}/drafts/${versionId}/publish`,
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: { confirmed: true },
    });
    const publisher = await app(['maps.publish'], service).inject({
      method: 'POST',
      url: `/api/v1/admin/worlds/${mapId}/drafts/${versionId}/publish`,
      headers: { authorization: 'Bearer verified', origin: 'http://localhost:3002' },
      payload: { confirmed: true },
    });

    expect(editor.statusCode).toBe(403);
    expect(publisher.statusCode).toBe(200);
    expect(service.publishVersion).toHaveBeenCalledTimes(1);
  });

  it('uses independent audit and asset read permissions', async () => {
    const service = worldService();
    const worldReader = await app(['maps.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/world-audit',
      headers: { authorization: 'Bearer verified' },
    });
    const auditReader = await app(['maps.audit_read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/world-audit',
      headers: { authorization: 'Bearer verified' },
    });
    const assetReader = await app(['assets.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/world-assets',
      headers: { authorization: 'Bearer verified' },
    });

    expect(worldReader.statusCode).toBe(403);
    expect(auditReader.statusCode).toBe(200);
    expect(assetReader.statusCode).toBe(200);
  });
});
