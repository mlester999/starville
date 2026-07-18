import { describe, expect, it, vi } from 'vitest';

import { getWorldManifest } from '@starville/game-content';

import type { LogContext, ServiceLogger } from '../contracts.js';
import type { AdminWorldGateway } from './admin-contracts.js';
import { createAdminWorldService } from './admin-service.js';

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
const mapId = '11111111-1111-4111-8111-111111111111';
const publishedVersionId = '22222222-2222-4222-8222-222222222222';
const draftVersionId = '33333333-3333-4333-8333-333333333333';
const publicationReviewId = '44444444-4444-4444-8444-444444444444';
const timestamp = '2026-07-12T04:00:00.000Z';
const checksum = 'a'.repeat(64);
const manifest = getWorldManifest('lantern-square');

const map = {
  id: mapId,
  slug: 'lantern-square',
  displayName: 'Lantern Square',
  description: 'The lantern-lit village center where four roads meet beside the stream.',
  status: 'active',
  recordVersion: 2,
  activePublishedVersionId: publishedVersionId,
  createdAt: timestamp,
  updatedAt: timestamp,
} as const;

const draftVersion = {
  id: draftVersionId,
  worldMapId: mapId,
  versionNumber: 2,
  lifecycleStatus: 'draft',
  editVersion: 1,
  checksum,
  validationStatus: 'pending',
  validationResult: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  validatedAt: null,
  publishedAt: null,
  publicationReason: null,
  supersedesVersionId: null,
  derivedFromVersionId: publishedVersionId,
} as const;

const changeSummary = {
  objectsAdded: 0,
  objectsRemoved: 0,
  objectsMoved: 0,
  objectsModified: 0,
  assetBindingsChanged: 0,
  collisionsChanged: 0,
  interactionsChanged: 0,
  exitsChanged: 0,
  spawnsChanged: 0,
  terrainChanged: false,
} as const;

const validationResult = {
  valid: true,
  checkedAt: timestamp,
  errors: [],
  warnings: [],
} as const;

function gateway(): AdminWorldGateway {
  return {
    listWorlds: vi.fn(async () => ({
      status: 'loaded',
      items: [
        {
          ...map,
          activeVersionNumber: 1,
          activeChecksum: checksum,
          draftVersionId,
          draftValidationStatus: 'pending',
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    })),
    getPublishedTopology: vi.fn(async () => ({ status: 'loaded', maps: [] })),
    getWorld: vi.fn(async () => ({
      status: 'loaded',
      map,
      versions: [draftVersion],
      draftHeadVersionId: draftVersionId,
      revisionMetadata: [],
      publicationHistory: [],
    })),
    getDraft: vi.fn(async () => ({
      status: 'loaded',
      map,
      version: draftVersion,
      manifest,
      assetPins: [],
    })),
    getRevision: vi.fn(async () => ({
      status: 'loaded',
      map,
      version: draftVersion,
      manifest,
      isDraftHead: true,
      revisionMetadata: {
        parentRevisionId: publishedVersionId,
        revisionKind: 'draft_created',
        changeSummary,
        createdAt: timestamp,
      },
    })),
    compareRevisions: vi.fn(async () => ({
      status: 'loaded',
      fromVersion: draftVersion,
      toVersion: draftVersion,
      changeSummary,
    })),
    createDraft: vi.fn(async () => ({ status: 'created', map, version: draftVersion, manifest })),
    saveDraft: vi.fn(async () => ({
      status: 'updated',
      map,
      version: { ...draftVersion, editVersion: 2 },
      manifest,
    })),
    validateDraft: vi.fn(async () => ({
      status: 'validated',
      map,
      version: {
        ...draftVersion,
        lifecycleStatus: 'validated',
        validationStatus: 'valid',
        validationResult,
        validatedAt: timestamp,
      },
      validationResult,
    })),
    publishVersion: vi.fn(async () => ({
      status: 'published',
      map: { ...map, activePublishedVersionId: draftVersionId, recordVersion: 3 },
      version: {
        ...draftVersion,
        lifecycleStatus: 'published',
        validationStatus: 'valid',
        validationResult,
        validatedAt: timestamp,
        publishedAt: timestamp,
        publicationReason: 'Publish reviewed world draft.',
        supersedesVersionId: publishedVersionId,
      },
      previousVersionId: publishedVersionId,
      sourceRevisionId: draftVersionId,
      publicationId: '55555555-5555-4555-8555-555555555555',
      operation: 'publish',
    })),
    reviewPublication: vi.fn(async () => ({
      status: 'reviewed',
      reviewId: '66666666-6666-4666-8666-666666666666',
      operation: 'publish',
      targetRevisionId: draftVersionId,
      expectedActiveVersionId: publishedVersionId,
      changeSummary,
      gameTestEvidenceId: '77777777-7777-4777-8777-777777777777',
      expiresAt: timestamp,
    })),
    rollbackVersion: vi.fn(async () => ({
      status: 'rolled_back',
      map,
      version: draftVersion,
      sourceRevisionId: publishedVersionId,
      previousVersionId: draftVersionId,
      publicationId: '88888888-8888-4888-8888-888888888888',
      operation: 'rollback',
    })),
    deriveVersion: vi.fn(async () => ({ status: 'created', map, version: draftVersion, manifest })),
    previewVersion: vi.fn(async () => ({
      status: 'loaded',
      map,
      version: {
        ...draftVersion,
        lifecycleStatus: 'validated',
        validationStatus: 'valid',
        validationResult,
        validatedAt: timestamp,
      },
      manifest,
      draftPreview: true,
    })),
    listAudit: vi.fn(async () => ({
      status: 'loaded',
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    })),
    listAssets: vi.fn(async () => ({
      status: 'loaded',
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    })),
  };
}

function service(target = gateway()) {
  return {
    target,
    value: createAdminWorldService({
      gateway: target,
      logger: new SilentLogger(),
      manifestMaximumBytes: 262_144,
      readRateLimit: 120,
      draftWriteRateLimit: 30,
      validationRateLimit: 20,
      publishRateLimit: 5,
      deriveRateLimit: 10,
    }),
  };
}

describe('administrator world service', () => {
  it('normalizes bounded server pagination, search, sorting, and rate limits', async () => {
    const { target, value } = service();
    await value.listWorlds(
      identity,
      {
        search: '  Lantern  ',
        status: 'active',
        sort: 'display_name',
        direction: 'asc',
        limit: '25',
        offset: '0',
      },
      'world-directory',
    );
    expect(target.listWorlds).toHaveBeenCalledWith(identity, {
      p_page: 1,
      p_page_size: 25,
      p_search: 'Lantern',
      p_status: 'active',
      p_sort: 'display_name',
      p_direction: 'asc',
      p_request_id: 'world-directory',
      p_rate_limit: 120,
    });
  });

  it('creates a draft only with an optimistic map record version', async () => {
    const { target, value } = service();
    await value.createDraft(identity, mapId, { expectedRecordVersion: 2 }, 'create-draft');
    expect(target.createDraft).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_world_map_id: mapId,
        p_expected_record_version: 2,
        p_rate_limit: 30,
      }),
    );
    await expect(
      value.createDraft(identity, mapId, { expectedRecordVersion: 2, force: true }, 'unsafe'),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_WORLD_ADMIN_REQUEST' }));
  });

  it('validates and canonicalizes structured manifests before saving', async () => {
    const { target, value } = service();
    await value.saveDraft(
      identity,
      mapId,
      draftVersionId,
      { expectedEditVersion: 1, expectedChecksum: checksum, manifest, confirmed: true },
      'save-draft',
    );
    expect(target.saveDraft).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_world_map_id: mapId,
        p_version_id: draftVersionId,
        p_expected_edit_version: 1,
        p_expected_checksum: checksum,
        p_rate_limit: 30,
      }),
    );

    const firstExit = manifest.exits[0];
    if (firstExit === undefined) throw new Error('Lantern Square north exit is missing');
    const semanticDraft = {
      ...manifest,
      exits: [{ ...firstExit, enabled: false }, ...manifest.exits.slice(1)],
    };
    await value.saveDraft(
      identity,
      mapId,
      draftVersionId,
      {
        expectedEditVersion: 1,
        expectedChecksum: checksum,
        manifest: semanticDraft,
        confirmed: true,
      },
      'save-invalid-draft',
    );
    expect(target.saveDraft).toHaveBeenLastCalledWith(
      identity,
      expect.objectContaining({
        p_manifest: expect.objectContaining({
          exits: expect.arrayContaining([
            expect.objectContaining({ id: 'exit-north', enabled: false }),
          ]),
        }),
      }),
    );
  });

  it('rejects executable, arbitrary, and oversized map content before persistence', async () => {
    const { target, value } = service();
    const unsafeManifest = {
      ...manifest,
      description: '<script>alert(1)</script>',
      remoteScriptUrl: 'https://attacker.invalid/world.js',
    };
    await expect(
      value.saveDraft(
        identity,
        mapId,
        draftVersionId,
        {
          expectedEditVersion: 1,
          expectedChecksum: checksum,
          manifest: unsafeManifest,
          confirmed: true,
        },
        'unsafe-manifest',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'WORLD_VALIDATION_FAILED' }));
    expect(target.saveDraft).not.toHaveBeenCalled();
  });

  it('requires explicit publication confirmation, reason, checksum, and active-version guard', async () => {
    const { target, value } = service();
    await expect(
      value.publishVersion(
        identity,
        mapId,
        draftVersionId,
        {
          expectedEditVersion: 1,
          expectedActiveVersionId: publishedVersionId,
          expectedChecksum: checksum,
          reviewId: publicationReviewId,
          reason: 'short',
          confirmed: true,
        },
        'invalid-publish',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_WORLD_ADMIN_REQUEST' }));
    expect(target.publishVersion).not.toHaveBeenCalled();

    await value.publishVersion(
      identity,
      mapId,
      draftVersionId,
      {
        expectedEditVersion: 1,
        expectedActiveVersionId: publishedVersionId,
        expectedChecksum: checksum,
        reviewId: publicationReviewId,
        reason: 'Publish reviewed world draft.',
        confirmed: true,
      },
      'publish-draft',
    );
    expect(target.publishVersion).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_expected_active_version_id: publishedVersionId,
        p_expected_checksum: checksum,
        p_review_id: publicationReviewId,
        p_reason: 'Publish reviewed world draft.',
        p_rate_limit: 5,
      }),
    );
  });

  it('binds revision inspection, comparison, impact review, and rollback to exact UUIDs', async () => {
    const { target, value } = service();
    const reviewId = '66666666-6666-4666-8666-666666666666';

    await value.getRevision(identity, mapId, draftVersionId, 'inspect-revision');
    await value.compareRevisions(
      identity,
      mapId,
      publishedVersionId,
      draftVersionId,
      'compare-revisions',
    );
    await value.reviewPublication(
      identity,
      mapId,
      draftVersionId,
      {
        expectedActiveVersionId: publishedVersionId,
        operation: 'publish',
        acknowledged: true,
      },
      'review-publication',
    );
    await value.rollbackVersion(
      identity,
      mapId,
      publishedVersionId,
      {
        expectedActiveVersionId: draftVersionId,
        reviewId,
        reason: 'Restore the reviewed historical publication.',
        confirmed: true,
      },
      'rollback-publication',
    );

    expect(target.getRevision).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({ p_world_map_id: mapId, p_version_id: draftVersionId }),
    );
    expect(target.compareRevisions).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_from_version_id: publishedVersionId,
        p_to_version_id: draftVersionId,
      }),
    );
    expect(target.reviewPublication).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_target_version_id: draftVersionId,
        p_operation: 'publish',
        p_acknowledged: true,
      }),
    );
    expect(target.rollbackVersion).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_target_version_id: publishedVersionId,
        p_review_id: reviewId,
      }),
    );

    await expect(
      value.reviewPublication(
        identity,
        mapId,
        draftVersionId,
        {
          expectedActiveVersionId: publishedVersionId,
          operation: 'publish',
          acknowledged: false,
        },
        'unacknowledged-review',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_WORLD_ADMIN_REQUEST' }));
  });

  it('maps database lifecycle conflicts and validation failures to safe public errors', async () => {
    const target = gateway();
    vi.mocked(target.createDraft)
      .mockResolvedValueOnce({ status: 'version_conflict' })
      .mockResolvedValueOnce({ status: 'state_conflict' });
    vi.mocked(target.validateDraft).mockResolvedValueOnce({
      status: 'validation_failed',
      map,
      version: {
        ...draftVersion,
        validationStatus: 'invalid',
        validationResult: {
          ...validationResult,
          valid: false,
          errors: [
            {
              code: 'INVALID_EXIT',
              path: '$.exits',
              message: 'An exit destination is invalid.',
              severity: 'error',
            },
          ],
        },
      },
      validationResult: {
        ...validationResult,
        valid: false,
        errors: [
          {
            code: 'INVALID_EXIT',
            path: '$.exits',
            message: 'An exit destination is invalid.',
            severity: 'error',
          },
        ],
      },
    });
    const { value } = service(target);

    await expect(
      value.createDraft(identity, mapId, { expectedRecordVersion: 2 }, 'conflict-one'),
    ).rejects.toEqual(expect.objectContaining({ code: 'WORLD_DRAFT_CONFLICT', statusCode: 409 }));
    await expect(
      value.createDraft(identity, mapId, { expectedRecordVersion: 2 }, 'conflict-two'),
    ).rejects.toEqual(expect.objectContaining({ code: 'WORLD_DRAFT_CONFLICT', statusCode: 409 }));
    await expect(
      value.validateDraft(
        identity,
        mapId,
        draftVersionId,
        { expectedEditVersion: 1, expectedChecksum: checksum },
        'validation-failed',
      ),
    ).resolves.toMatchObject({
      status: 'validation_failed',
      validationResult: {
        valid: false,
        errors: [expect.objectContaining({ code: 'INVALID_EXIT' })],
      },
    });

    vi.mocked(target.publishVersion).mockResolvedValueOnce({ status: 'version_conflict' });
    await expect(
      value.publishVersion(
        identity,
        mapId,
        draftVersionId,
        {
          expectedEditVersion: 1,
          expectedActiveVersionId: publishedVersionId,
          expectedChecksum: checksum,
          reviewId: publicationReviewId,
          reason: 'Publish reviewed world draft.',
          confirmed: true,
        },
        'publication-conflict',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'WORLD_PUBLISH_CONFLICT', statusCode: 409 }));
  });

  it('returns a protected validated preview without publication or player persistence', async () => {
    const { target, value } = service();
    await expect(
      value.previewVersion(identity, mapId, draftVersionId, 'draft-preview'),
    ).resolves.toMatchObject({ draftPreview: true, manifest: { id: 'lantern-square' } });
    expect(target.previewVersion).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        p_world_map_id: mapId,
        p_version_id: draftVersionId,
        p_rate_limit: 120,
      }),
    );
  });
});
