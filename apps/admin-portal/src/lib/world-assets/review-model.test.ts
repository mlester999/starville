import { describe, expect, it } from 'vitest';

import {
  activeAssetVersion,
  assetArtworkLabel,
  candidateNextAction,
  latestAssetCandidate,
  safeAdministratorLabel,
  shouldAcceptAuthoritativeVersionRevision,
  versionUsage,
} from './review-model';

const activeId = 'ee26ba4b-d21c-4b35-9fd4-c7c565f30f4e';
const candidateId = '9a03dc7d-1039-4841-8680-40775c9b08de';
const assetId = '36f4dc81-50f0-4ebd-81f0-f014b27217a5';
const timestamp = '2026-07-16T02:00:00.000Z';

function version(id: string, versionNumber: number, lifecycleStatus: 'active' | 'in_review') {
  return {
    id,
    assetId,
    versionNumber,
    lifecycleStatus,
    processingStatus: 'completed' as const,
    validationStatus: 'valid' as const,
    detectedMediaType: versionNumber === 2 ? ('image/png' as const) : null,
    width: versionNumber === 2 ? 480 : null,
    height: versionNumber === 2 ? 600 : null,
    sourceSizeBytes: versionNumber === 2 ? 4096 : null,
    checksumPrefix: versionNumber === 2 ? 'a'.repeat(16) : null,
    sourceUrl: versionNumber === 2 ? '/source' : null,
    previewUrl: versionNumber === 2 ? '/preview' : null,
    thumbnailUrl: versionNumber === 2 ? '/thumbnail' : null,
    render: {
      renderWidth: 480,
      renderHeight: 600,
      scale: 1,
      anchor: { x: 0.5, y: 1 },
      footAnchor: { x: 0.5, y: 1 },
      depthAnchor: { x: 0.5, y: 1 },
      supportedRotations: [0] as [0],
      defaultRotation: 0 as const,
    },
    collision: { shape: 'none' as const, blocking: false as const },
    interactionCompatibility: ['decorative'] as ['decorative'],
    tags: [],
    internalNotes: '',
    validationResult: { valid: true, checkedAt: timestamp, issues: [] },
    editVersion: versionNumber,
    createdByAdminId: null,
    submittedByAdminId: null,
    reviewedByAdminId: null,
    approvedByAdminId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    submittedAt: versionNumber === 2 ? timestamp : null,
    reviewedAt: null,
    approvedAt: null,
    activatedAt: versionNumber === 1 ? timestamp : null,
  };
}

const active = version(activeId, 1, 'active');
const candidate = version(candidateId, 2, 'in_review');
const detail = {
  status: 'loaded' as const,
  asset: {
    id: assetId,
    gameId: 'starville',
    slug: 'tree-pine',
    friendlyName: 'Tree Pine',
    assetType: 'tree' as const,
    category: 'nature' as const,
    lifecycleStatus: 'active' as const,
    productionStatus: 'development_marker' as const,
    activeVersionId: activeId,
    developmentMarkerReplacementKey: null,
    versionCount: 2,
    referenceCount: 3,
    revision: 2,
    thumbnailUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  versions: [candidate, active],
  referenceSummary: { published: 2, drafts: 1, activeConfiguration: 0, mayArchive: false },
};

describe('world asset review model', () => {
  it('identifies Tree Pine Version 1 as active and Version 2 as the non-active latest candidate', () => {
    expect(activeAssetVersion(detail)?.id).toBe(activeId);
    expect(latestAssetCandidate(detail)?.id).toBe(candidateId);
    expect(latestAssetCandidate(detail)?.lifecycleStatus).toBe('in_review');
  });

  it('distinguishes development-marker and managed PNG artwork without relying on lifecycle color', () => {
    expect(assetArtworkLabel(active)).toBe('Development Marker');
    expect(assetArtworkLabel(candidate)).toBe('Managed PNG');
  });

  it('counts immutable version pins and reports whether the bounded directory is complete', () => {
    expect(
      versionUsage(activeId, {
        status: 'loaded',
        items: [
          {
            versionId: activeId,
            referenceType: 'world_map',
            referenceKey: 'one',
            lifecycle: 'published',
          },
          {
            versionId: activeId,
            referenceType: 'world_map',
            referenceKey: 'two',
            lifecycle: 'published',
          },
          {
            versionId: activeId,
            referenceType: 'world_map',
            referenceKey: 'draft',
            lifecycle: 'draft',
          },
        ],
        summary: detail.referenceSummary,
        page: 1,
        pageSize: 100,
        total: 3,
        totalPages: 1,
      }),
    ).toEqual({ published: 2, drafts: 1, activeConfiguration: 0, complete: true });
  });

  it('describes in-review and approved next actions without implying activation or publication', () => {
    expect(candidateNextAction(candidate)).toContain('approval or rejection');
    expect(candidateNextAction({ ...candidate, lifecycleStatus: 'approved' })).toContain(
      'Approval alone does not change the active version',
    );
  });

  it('uses safe administrator labels and accepts refreshed authoritative revisions', () => {
    expect(
      safeAdministratorLabel({
        actorId: '11111111-1111-4111-8111-111111111111',
        currentAdministratorId: '11111111-1111-4111-8111-111111111111',
        currentAdministratorName: 'Owner',
        emptyLabel: 'Unassigned',
      }),
    ).toBe('Owner (you)');
    expect(
      shouldAcceptAuthoritativeVersionRevision({
        currentVersionId: candidateId,
        incomingVersionId: candidateId,
        currentRevision: 2,
        incomingRevision: 3,
      }),
    ).toBe(true);
  });
});
