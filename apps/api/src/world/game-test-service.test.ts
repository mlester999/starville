import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';
import { getWorldManifest } from '@starville/game-content';

import type { LogContext, ServiceLogger } from '../contracts.js';
import type { WorldGameTestGateway } from './game-test-contracts.js';
import { createWorldGameTestService } from './game-test-service.js';

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
  userId: '10000000-0000-4000-8000-000000000001',
  authSessionId: '10000000-0000-4000-8000-000000000002',
  assuranceLevel: 'aal2' as const,
  authenticationMethods: ['password', 'totp'],
};
const mapId = '20000000-0000-4000-8000-000000000001';
const versionId = '20000000-0000-4000-8000-000000000002';
const sessionId = '20000000-0000-4000-8000-000000000003';
const evidenceId = '20000000-0000-4000-8000-000000000004';
const checkedAt = '2026-07-16T05:00:00.000Z';
const manifest = getWorldManifest('lantern-square');

function materials() {
  return manifest.assets.map((assetKey, index) => ({
    assetKey,
    versionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    checksumSha256: 'c'.repeat(64),
    mediaType: null,
    width: null,
    height: null,
    renderWidth: null,
    renderHeight: null,
    scale: 1,
    anchorX: 0.5,
    anchorY: 1,
    footAnchorX: 0.5,
    footAnchorY: 1,
    depthAnchorX: 0.5,
    depthAnchorY: 1,
    collisionProfile: { shape: 'none', blocking: false },
    supportedRotations: [0],
    defaultRotation: 0,
    developmentMarker: true,
    delivery: null,
    fallback: 'repository_procedural',
  }));
}

function projection() {
  const storedManifest = structuredClone(manifest) as unknown as Record<string, unknown>;
  delete storedManifest['spawn'];
  return {
    status: 'loaded',
    session: {
      id: sessionId,
      worldMapId: mapId,
      worldMapVersionId: versionId,
      environment: 'test',
      status: 'active',
      returnPath: `/worlds/${mapId}/editor?version=${versionId}`,
      createdAt: checkedAt,
      expiresAt: '2026-07-16T05:20:00.000Z',
      gameClientBuild: 'game-client:test',
    },
    map: {
      id: mapId,
      slug: manifest.slug,
      displayName: manifest.name,
      description: manifest.description,
      defaultSpawnId: manifest.defaultSpawnId,
    },
    version: {
      id: versionId,
      versionNumber: manifest.version,
      editVersion: 3,
      checksum: 'a'.repeat(64),
      lifecycleStatus: 'validated',
    },
    manifest: storedManifest,
    assetDeliveries: materials(),
    previewIdentity: { displayName: 'Game Test Administrator', appearancePreset: 'moss' },
    realtime: { mode: 'disabled_private_solo', publicChannelJoined: false },
    latestEvidence: null,
    newerDraftAvailable: false,
  };
}

function gateway(): WorldGameTestGateway {
  return {
    create: vi.fn(async () => ({
      status: 'issued',
      sessionId,
      worldMapId: mapId,
      worldMapVersionId: versionId,
      environment: 'test',
      expiresAt: '2026-07-16T05:20:00.000Z',
      returnPath: `/worlds/${mapId}/editor?version=${versionId}`,
    })),
    exchange: vi.fn(async () => projection()),
    load: vi.fn(async () => projection()),
    statusAdmin: vi.fn(async () => ({
      status: 'loaded',
      worldMapId: mapId,
      worldMapVersionId: versionId,
      gameTestStatus: 'passed',
      latestEvidence: {
        id: evidenceId,
        result: 'passed',
        testerAdministratorId: identity.userId,
        testerDisplayName: 'World Tester',
        gameClientBuild: 'game-client:test',
        environment: 'test',
        recordedAt: checkedAt,
      },
      activeSessions: [],
    })),
    exit: vi.fn(async () => ({ status: 'exited' })),
    revoke: vi.fn(async () => ({ status: 'revoked', sessionId })),
    recordEvidence: vi.fn(async () => ({
      status: 'recorded',
      evidenceId,
      sessionId,
      worldMapVersionId: versionId,
      result: 'passed',
      gameClientBuild: 'game-client:test',
      environment: 'test',
      recordedAt: checkedAt,
      publicationReadiness: 'recommended',
    })),
  };
}

function service(target = gateway()) {
  return {
    target,
    value: createWorldGameTestService({
      gateway: target,
      logger: new SilentLogger(),
      environment: 'test',
      publicAssetUrl: (path) => `https://assets.example.test/${path}`,
    }),
  };
}

describe('World Game Test service', () => {
  it('requires AAL2 before generating or persisting any grant material', async () => {
    const { target, value } = service();
    await expect(
      value.createAdmin(
        { ...identity, assuranceLevel: 'aal1' },
        mapId,
        versionId,
        {
          expectedEditVersion: 3,
          expectedChecksum: 'a'.repeat(64),
          returnPath: `/worlds/${mapId}/editor?version=${versionId}`,
          clientRequestId: '30000000-0000-4000-8000-000000000001',
        },
        'request-aal1',
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MFA_REQUIRED' });
    expect(target.create).not.toHaveBeenCalled();
  });

  it('returns a one-time opaque token while sending only its SHA-256 hash to persistence', async () => {
    const { target, value } = service();
    const result = await value.createAdmin(
      identity,
      mapId,
      versionId,
      {
        expectedEditVersion: 3,
        expectedChecksum: 'a'.repeat(64),
        returnPath: `/worlds/${mapId}/editor?version=${versionId}`,
        clientRequestId: '30000000-0000-4000-8000-000000000001',
      },
      'request-create',
    );
    const input = vi.mocked(target.create).mock.calls[0]?.[1];

    expect(result.grantToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(input?.['p_grant_token_hash']).toBe(
      createHash('sha256').update(result.grantToken).digest('hex'),
    );
    expect(JSON.stringify(input)).not.toContain(result.grantToken);
    expect(input).toMatchObject({
      p_world_map_id: mapId,
      p_version_id: versionId,
      p_expected_edit_version: 3,
      p_environment: 'test',
      p_ttl_minutes: 20,
    });
  });

  it('projects the exact validated revision with pinned assets and no durable gameplay systems', async () => {
    const { target, value } = service();
    const result = await value.exchange(
      { grantToken: 'g'.repeat(43), gameClientBuild: 'game-client:test' },
      'request-exchange',
    );
    const input = vi.mocked(target.exchange).mock.calls[0]?.[0];

    expect(input?.['p_grant_token_hash']).toBe(
      createHash('sha256').update('g'.repeat(43)).digest('hex'),
    );
    expect(input?.['p_session_token_hash']).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(result.projection.version.id).toBe(versionId);
    expect(result.projection.manifest.id).toBe('lantern-square');
    expect(result.projection.assetDeliveries).toHaveLength(manifest.assets.length);
    expect(result.projection.realtime).toEqual({
      mode: 'disabled_private_solo',
      publicChannelJoined: false,
    });
    expect(result.projection.restrictions).toContain('no_player_persistence');
    expect(result.projection.restrictions).toContain('no_rewards');
    expect(result.projection.restrictions).toContain('no_public_realtime');
  });

  it('binds explicit evidence to the exchanged session build and exact revision', async () => {
    const { target, value } = service();
    const result = await value.recordEvidence(
      identity,
      sessionId,
      {
        result: 'passed',
        checklist: { movement_camera: true, no_progression: true },
        notes: 'Movement, collision, assets, and the no-progression boundary passed.',
      },
      'request-evidence',
    );

    expect(result).toMatchObject({
      evidenceId,
      sessionId,
      worldMapVersionId: versionId,
      result: 'passed',
      publicationReadiness: 'recommended',
    });
    expect(target.recordEvidence).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_game_test_session_id: sessionId,
        p_result: 'passed',
      }),
    );
  });

  it('loads revision-specific evidence status without exposing session token hashes', async () => {
    const { target, value } = service();
    const result = await value.statusAdmin(identity, mapId, versionId, 'request-status');

    expect(result).toMatchObject({
      worldMapId: mapId,
      worldMapVersionId: versionId,
      gameTestStatus: 'passed',
      latestEvidence: { testerDisplayName: 'World Tester' },
    });
    expect(target.statusAdmin).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({ p_world_map_id: mapId, p_version_id: versionId }),
    );
    expect(JSON.stringify(result)).not.toContain('token');
  });
});
