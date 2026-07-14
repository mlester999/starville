import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminPermissionKey } from '@starville/admin-auth';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import type { AdminAssetService } from './contracts.js';

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
const assetId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';

function authGateway(permissionKeys: readonly AdminPermissionKey[]): AdminAuthGateway {
  return {
    verifyBearer: vi.fn(async () => identity),
    loadAuthorization: vi.fn(async () => ({
      outcome: 'authorized' as const,
      context: {
        userId: identity.userId,
        displayName: 'Asset Test',
        adminStatus: 'active' as const,
        roleKey: 'world_designer' as const,
        roleName: 'World Designer',
        permissionKeys: [...permissionKeys],
        adminSessionId: identity.authSessionId,
        sessionExpiresAt: '2026-07-13T06:00:00.000Z',
        mfaRequired: true,
        assuranceLevel: 'aal2' as const,
        lastLoginAt: '2026-07-13T03:00:00.000Z',
      },
    })),
    createSession: vi.fn(async () => ({ outcome: 'unauthorized' as const })),
    revokeCurrentSession: vi.fn(async () => true),
    recordDenial: vi.fn(async () => undefined),
  };
}

function assetService(): AdminAssetService {
  return {
    listAssets: vi.fn(async () => ({ status: 'loaded', items: [] })),
    getAsset: vi.fn(async () => ({ status: 'loaded' })),
    getVersion: vi.fn(async () => ({ status: 'loaded' })),
    readMedia: vi.fn(async () => ({
      bytes: Buffer.from('safe-webp-bytes'),
      checksum: 'a'.repeat(64),
      mediaType: 'image/webp' as const,
    })),
    upload: vi.fn(async () => ({ status: 'validated' })),
    updateDraft: vi.fn(async () => ({ status: 'updated' })),
    validateVersion: vi.fn(async () => ({ status: 'validated' })),
    submitReview: vi.fn(async () => ({ status: 'submitted' })),
    reviewVersion: vi.fn(async () => ({ status: 'approved' })),
    activateVersion: vi.fn(async () => ({ status: 'activated' })),
    deprecateAsset: vi.fn(async () => ({ status: 'deprecated' })),
    archiveAsset: vi.fn(async () => ({ status: 'archived' })),
    createVersion: vi.fn(async () => ({ status: 'validated' })),
    listReviewQueue: vi.fn(async () => ({ status: 'loaded', items: [] })),
    listAudit: vi.fn(async () => ({ status: 'loaded', items: [] })),
    listReferences: vi.fn(async () => ({ status: 'loaded', items: [] })),
    listEditorCandidates: vi.fn(async () => ({ status: 'loaded', items: [] })),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function app(permissions: readonly AdminPermissionKey[], service = assetService()) {
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
    adminAssets: { service },
  });
  apps.push(value);
  return value;
}

function multipartBody(metadata: unknown, file = Buffer.from('image-bytes')) {
  const boundary = 'StarvilleAssetBoundary';
  return {
    boundary,
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="willow-tree.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (value) => value.close()));
});

describe('administrator asset routes', () => {
  it('requires authentication and the exact asset-read permission', async () => {
    const service = assetService();
    const missing = await app(['assets.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/world-assets',
    });
    const denied = await app([], service).inject({
      method: 'GET',
      url: '/api/v1/admin/world-assets',
      headers: { authorization: 'Bearer verified' },
    });
    const allowed = await app(['assets.read'], service).inject({
      method: 'GET',
      url: '/api/v1/admin/world-assets?limit=10&offset=0',
      headers: { authorization: 'Bearer verified' },
    });

    expect(missing.statusCode).toBe(401);
    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['cache-control']).toBe('no-store');
    expect(service.listAssets).toHaveBeenCalledWith(
      identity,
      { limit: '10', offset: '0' },
      expect.any(String),
    );
  });

  it('uses the corrected read-only permission for asset audit access only', async () => {
    const deniedService = assetService();
    const denied = await app(['assets.read'], deniedService).inject({
      method: 'GET',
      url: '/api/v1/admin/world-assets/audit',
      headers: { authorization: 'Bearer verified' },
    });
    expect(denied.statusCode).toBe(403);
    expect(deniedService.listAudit).not.toHaveBeenCalled();

    const allowedService = assetService();
    const allowed = await app(['assets.audit.read'], allowedService).inject({
      method: 'GET',
      url: '/api/v1/admin/world-assets/audit?limit=10&offset=0',
      headers: { authorization: 'Bearer verified' },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowedService.listAudit).toHaveBeenCalledWith(
      identity,
      { limit: '10', offset: '0' },
      expect.any(String),
    );

    const uploadService = assetService();
    const body = multipartBody({
      friendlyName: 'Willow Tree',
      slug: 'willow-tree',
      assetType: 'tree',
      category: 'nature',
      developmentMarkerReplacementKey: null,
      idempotencyKey: requestId,
    });
    const upload = await app(['assets.audit.read'], uploadService).inject({
      method: 'POST',
      url: '/api/v1/admin/world-assets',
      headers: {
        authorization: 'Bearer verified',
        origin: 'http://localhost:3002',
        'content-type': `multipart/form-data; boundary=${body.boundary}`,
      },
      payload: body.payload,
    });
    expect(upload.statusCode).toBe(403);
    expect(uploadService.upload).not.toHaveBeenCalled();
  });

  it('proxies private variants only through an authenticated no-store byte response', async () => {
    const denied = await app([]).inject({
      method: 'GET',
      url: `/api/v1/admin/world-assets/${assetId}/versions/${versionId}/preview`,
      headers: { authorization: 'Bearer verified' },
    });
    const allowed = await app(['assets.read']).inject({
      method: 'GET',
      url: `/api/v1/admin/world-assets/${assetId}/versions/${versionId}/preview`,
      headers: { authorization: 'Bearer verified' },
    });

    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['content-type']).toBe('image/webp');
    expect(allowed.headers['cache-control']).toBe('no-store');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers.etag).toBe(`"sha256-${'a'.repeat(64)}"`);
  });

  it('returns the private original with its canonical sniffed media type only to asset readers', async () => {
    const deniedService = assetService();
    const denied = await app([], deniedService).inject({
      method: 'GET',
      url: `/api/v1/admin/world-assets/${assetId}/versions/${versionId}/original`,
      headers: { authorization: 'Bearer verified' },
    });
    expect(denied.statusCode).toBe(403);
    expect(deniedService.readMedia).not.toHaveBeenCalled();

    const allowedService = assetService();
    vi.mocked(allowedService.readMedia).mockResolvedValueOnce({
      bytes: Buffer.from('safe-png-bytes'),
      checksum: 'b'.repeat(64),
      mediaType: 'image/png',
    });
    const allowed = await app(['assets.read'], allowedService).inject({
      method: 'GET',
      url: `/api/v1/admin/world-assets/${assetId}/versions/${versionId}/original`,
      headers: { authorization: 'Bearer verified' },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['content-type']).toBe('image/png');
    expect(allowed.headers['cache-control']).toBe('no-store');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowedService.readMedia).toHaveBeenCalledWith(
      identity,
      assetId,
      versionId,
      'original',
      expect.any(String),
    );
  });

  it('accepts exactly one bounded file and one metadata field with upload permission', async () => {
    const service = assetService();
    const metadata = {
      friendlyName: 'Willow Tree',
      slug: 'willow-tree',
      assetType: 'tree',
      category: 'nature',
      developmentMarkerReplacementKey: null,
      idempotencyKey: requestId,
    };
    const body = multipartBody(metadata);
    const result = await app(['assets.upload'], service).inject({
      method: 'POST',
      url: '/api/v1/admin/world-assets',
      headers: {
        authorization: 'Bearer verified',
        origin: 'http://localhost:3002',
        'x-request-id': requestId,
        'content-type': `multipart/form-data; boundary=${body.boundary}`,
      },
      payload: body.payload,
    });

    expect(result.statusCode, result.body).toBe(200);
    expect(service.upload).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        metadata,
        originalFileName: 'willow-tree.png',
        declaredMediaType: 'image/png',
        bytes: Buffer.from('image-bytes'),
      }),
      requestId,
    );
  });

  it('rejects a valid upload from staff lacking assets.upload before invoking upload processing', async () => {
    const service = assetService();
    const body = multipartBody({
      friendlyName: 'Willow Tree',
      slug: 'willow-tree',
      assetType: 'tree',
      category: 'nature',
      developmentMarkerReplacementKey: null,
      idempotencyKey: requestId,
    });
    const result = await app(['assets.read'], service).inject({
      method: 'POST',
      url: '/api/v1/admin/world-assets',
      headers: {
        authorization: 'Bearer verified',
        origin: 'http://localhost:3002',
        'x-request-id': requestId,
        'content-type': `multipart/form-data; boundary=${body.boundary}`,
      },
      payload: body.payload,
    });

    expect(result.statusCode).toBe(403);
    expect(service.upload).not.toHaveBeenCalled();
  });

  it('rejects upload mutations from untrusted origins before reading multipart bytes', async () => {
    const service = assetService();
    const body = multipartBody({});
    const result = await app(['assets.upload'], service).inject({
      method: 'POST',
      url: '/api/v1/admin/world-assets',
      headers: {
        authorization: 'Bearer verified',
        origin: 'https://untrusted.invalid',
        'content-type': `multipart/form-data; boundary=${body.boundary}`,
      },
      payload: body.payload,
    });

    expect(result.statusCode).toBe(403);
    expect(service.upload).not.toHaveBeenCalled();
  });

  it('keeps approval and activation behind their own narrow permissions', async () => {
    const reviewOnlyService = assetService();
    const approveDenied = await app(['assets.review'], reviewOnlyService).inject({
      method: 'POST',
      url: `/api/v1/admin/world-assets/${assetId}/versions/${versionId}/review`,
      headers: {
        authorization: 'Bearer verified',
        origin: 'http://localhost:3002',
        'x-request-id': requestId,
      },
      payload: {
        action: 'approve',
        expectedEditVersion: 2,
        reason: 'Approve the reviewed production candidate.',
        idempotencyKey: requestId,
        confirmed: true,
      },
    });
    expect(approveDenied.statusCode).toBe(403);
    expect(reviewOnlyService.reviewVersion).not.toHaveBeenCalled();

    const approveOnlyService = assetService();
    const reviewDenied = await app(['assets.approve'], approveOnlyService).inject({
      method: 'POST',
      url: `/api/v1/admin/world-assets/${assetId}/versions/${versionId}/review`,
      headers: {
        authorization: 'Bearer verified',
        origin: 'http://localhost:3002',
        'x-request-id': requestId,
      },
      payload: {
        action: 'approve',
        expectedEditVersion: 2,
        reason: 'Approve the reviewed production candidate.',
        idempotencyKey: requestId,
        confirmed: true,
      },
    });
    expect(reviewDenied.statusCode).toBe(403);
    expect(approveOnlyService.reviewVersion).not.toHaveBeenCalled();

    const approvalService = assetService();
    const approveAllowed = await app(['assets.review', 'assets.approve'], approvalService).inject({
      method: 'POST',
      url: `/api/v1/admin/world-assets/${assetId}/versions/${versionId}/review`,
      headers: {
        authorization: 'Bearer verified',
        origin: 'http://localhost:3002',
        'x-request-id': requestId,
      },
      payload: {
        action: 'approve',
        expectedEditVersion: 2,
        reason: 'Approve the reviewed production candidate.',
        idempotencyKey: requestId,
        confirmed: true,
      },
    });
    expect(approveAllowed.statusCode).toBe(200);
    expect(approvalService.reviewVersion).toHaveBeenCalledTimes(1);

    const uploadOnlyService = assetService();
    const activateDenied = await app(['assets.upload'], uploadOnlyService).inject({
      method: 'POST',
      url: `/api/v1/admin/world-assets/${assetId}/versions/${versionId}/activate`,
      headers: {
        authorization: 'Bearer verified',
        origin: 'http://localhost:3002',
        'x-request-id': requestId,
      },
      payload: {
        expectedEditVersion: 3,
        expectedAssetRevision: 2,
        reason: 'Activate the approved production candidate.',
        idempotencyKey: requestId,
        confirmed: true,
        typedConfirmation: 'ACTIVATE ASSET',
      },
    });
    expect(activateDenied.statusCode).toBe(403);
    expect(uploadOnlyService.activateVersion).not.toHaveBeenCalled();
  });

  it('keeps archival behind deprecation permission and the trusted mutation origin', async () => {
    const payload = {
      expectedAssetRevision: 4,
      reason: 'Archive the retired asset after confirming it has no unsafe references.',
      idempotencyKey: requestId,
      confirmed: true,
    };
    const deniedService = assetService();
    const denied = await app(['assets.read'], deniedService).inject({
      method: 'POST',
      url: `/api/v1/admin/world-assets/${assetId}/archive`,
      headers: {
        authorization: 'Bearer verified',
        origin: 'http://localhost:3002',
        'x-request-id': requestId,
      },
      payload,
    });
    expect(denied.statusCode).toBe(403);
    expect(deniedService.archiveAsset).not.toHaveBeenCalled();

    const originDeniedService = assetService();
    const originDenied = await app(['assets.deprecate'], originDeniedService).inject({
      method: 'POST',
      url: `/api/v1/admin/world-assets/${assetId}/archive`,
      headers: { authorization: 'Bearer verified', 'x-request-id': requestId },
      payload,
    });
    expect(originDenied.statusCode).toBe(403);
    expect(originDeniedService.archiveAsset).not.toHaveBeenCalled();

    const allowedService = assetService();
    const allowed = await app(['assets.deprecate'], allowedService).inject({
      method: 'POST',
      url: `/api/v1/admin/world-assets/${assetId}/archive`,
      headers: {
        authorization: 'Bearer verified',
        origin: 'http://localhost:3002',
        'x-request-id': requestId,
      },
      payload,
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowedService.archiveAsset).toHaveBeenCalledWith(identity, assetId, payload, requestId);
  });
});
