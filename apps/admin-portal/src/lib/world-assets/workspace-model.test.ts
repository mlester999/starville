import { describe, expect, it } from 'vitest';

import type {
  AssetDraftConfiguration,
  AssetManagerCapabilities,
  AssetVersionLifecycleStatus,
  WorldAssetVersionDetail,
} from './contracts';
import {
  assessAssetDraft,
  changedAssetSections,
  deriveAssetSaveState,
  deriveAssetVersionEditability,
} from './workspace-model';

const timestamp = '2026-07-16T00:00:00.000Z';
const capabilities: AssetManagerCapabilities = {
  canUpload: true,
  canEdit: true,
  canValidate: true,
  canReview: true,
  canApprove: true,
  canActivate: true,
  canDeprecate: true,
  canReadAudit: true,
};

const configuration: AssetDraftConfiguration = {
  friendlyName: 'Willow Tree',
  category: 'nature',
  tags: [],
  internalNotes: '',
  render: {
    renderWidth: 512,
    renderHeight: 512,
    scale: 1,
    anchor: { x: 0.5, y: 1 },
    footAnchor: { x: 0.5, y: 1 },
    depthAnchor: { x: 0.5, y: 1 },
    supportedRotations: [0],
    defaultRotation: 0,
  },
  collision: { shape: 'none', blocking: false },
  interactionCompatibility: ['decorative'],
};

function detail(lifecycleStatus: AssetVersionLifecycleStatus): WorldAssetVersionDetail {
  return {
    status: 'loaded',
    asset: {
      id: '11111111-1111-4111-8111-111111111111',
      gameId: 'starville',
      slug: 'willow-tree',
      friendlyName: configuration.friendlyName,
      assetType: 'tree',
      category: configuration.category,
      lifecycleStatus: lifecycleStatus === 'deprecated' ? 'deprecated' : 'draft',
      productionStatus: 'production_candidate',
      activeVersionId: null,
      developmentMarkerReplacementKey: null,
      versionCount: 2,
      referenceCount: 0,
      revision: 1,
      thumbnailUrl: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    version: {
      id: '22222222-2222-4222-8222-222222222222',
      assetId: '11111111-1111-4111-8111-111111111111',
      versionNumber: 2,
      lifecycleStatus,
      processingStatus: 'completed',
      validationStatus: lifecycleStatus === 'validated' ? 'valid' : 'pending',
      detectedMediaType: 'image/webp',
      width: 512,
      height: 512,
      sourceSizeBytes: 1024,
      checksumPrefix: '0123456789ab',
      sourceUrl: '/api/admin-assets/source',
      previewUrl: '/api/admin-assets/preview',
      thumbnailUrl: null,
      render: configuration.render,
      collision: configuration.collision,
      interactionCompatibility: configuration.interactionCompatibility,
      tags: configuration.tags,
      internalNotes: configuration.internalNotes,
      validationResult: null,
      editVersion: 3,
      createdByAdminId: null,
      submittedByAdminId: null,
      reviewedByAdminId: null,
      approvedByAdminId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      submittedAt: null,
      reviewedAt: null,
      approvedAt: null,
      activatedAt: null,
    },
    validationResults: null,
    reviews: [],
    referenceSummary: {
      published: 0,
      drafts: 0,
      activeConfiguration: 0,
      mayArchive: true,
    },
  };
}

function editability(
  lifecycleStatus: AssetVersionLifecycleStatus,
  overrides: Partial<AssetManagerCapabilities> = {},
) {
  return deriveAssetVersionEditability({
    detail: detail(lifecycleStatus),
    capabilities: { ...capabilities, ...overrides },
    administratorRole: 'super_admin',
    administratorRoleName: 'Super administrator',
  });
}

function assessment(next: AssetDraftConfiguration = configuration) {
  return assessAssetDraft({
    configuration: next,
    detail: detail('draft'),
    collisionSupported: true,
    transparencyRequired: true,
    recommendedWidth: 512,
    recommendedHeight: 512,
  });
}

describe('world asset workspace authority model', () => {
  it.each<AssetVersionLifecycleStatus>([
    'draft',
    'processing',
    'validation_failed',
    'validated',
    'in_review',
    'changes_requested',
    'rejected',
    'approved',
    'active',
    'deprecated',
    'archived',
  ])('derives a specific, non-empty lifecycle explanation for %s', (lifecycleStatus) => {
    const model = editability(lifecycleStatus);
    expect(model.lifecycleState).toBe(lifecycleStatus);
    expect(model.lifecycleMessage.length).toBeGreaterThan(20);
    expect(model.nextRecommendedAction.length).toBeGreaterThan(10);
  });

  it('keeps validated configuration immutable even for a super administrator', () => {
    const model = editability('validated');
    expect(model.isValidated).toBe(true);
    expect(model.isImmutable).toBe(true);
    expect(model.canEditMetadata).toBe(false);
    expect(model.canEditRendering).toBe(false);
    expect(model.canSaveDraft).toBe(false);
    expect(model.canSubmitReview).toBe(true);
    expect(model.canCreateNextVersion).toBe(true);
  });

  it.each<AssetVersionLifecycleStatus>([
    'validated',
    'approved',
    'active',
    'rejected',
    'deprecated',
    'archived',
  ])('offers successor creation for immutable %s versions only with upload authority', (status) => {
    expect(editability(status).canCreateNextVersion).toBe(true);
    expect(editability(status, { canUpload: false }).canCreateNextVersion).toBe(false);
  });

  it('separates permission locking from lifecycle locking', () => {
    const model = editability('draft', { canEdit: false });
    expect(model.isImmutable).toBe(false);
    expect(model.hasEditPermission).toBe(false);
    expect(model.canSaveDraft).toBe(false);
    expect(
      deriveAssetSaveState({
        editability: model,
        assessment: assessment(),
        changedSections: ['Identity and metadata'],
        pending: false,
        outcome: 'idle',
      }).state,
    ).toBe('PERMISSION_LOCKED');
  });

  it('accepts valid input, blank optional metadata, and an explicit passable collision choice', () => {
    const result = assessment();
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.requirements.find((item) => item.key === 'collision')).toMatchObject({
      state: 'complete',
      blocking: false,
    });
  });

  it('safely rejects malformed required metadata and out-of-bounds anchors', () => {
    const malformed = {
      ...configuration,
      friendlyName: '',
      render: {
        ...configuration.render,
        footAnchor: { x: 2, y: 1 },
      },
    } as AssetDraftConfiguration;
    const result = assessment(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'friendlyName')).toBe(true);
    expect(result.issues.some((issue) => issue.path.startsWith('render.footAnchor'))).toBe(true);
  });

  it('tracks only changed saved sections and exposes every save-state transition', () => {
    const changed = { ...configuration, friendlyName: 'Willow Tree Large' };
    const sections = changedAssetSections(configuration, changed);
    const editable = editability('draft');
    const valid = assessment(changed);

    expect(sections).toEqual(['Identity and metadata']);
    expect(
      deriveAssetSaveState({
        editability: editable,
        assessment: valid,
        changedSections: sections,
        pending: false,
        outcome: 'idle',
      }).state,
    ).toBe('EDITABLE_READY');
    expect(
      deriveAssetSaveState({
        editability: editable,
        assessment: valid,
        changedSections: [],
        pending: false,
        outcome: 'idle',
      }).state,
    ).toBe('EDITABLE_NO_CHANGES');
    expect(
      deriveAssetSaveState({
        editability: editable,
        assessment: assessment({ ...configuration, friendlyName: '' }),
        changedSections: sections,
        pending: false,
        outcome: 'idle',
      }).state,
    ).toBe('EDITABLE_INVALID');
    expect(
      deriveAssetSaveState({
        editability: editability('validated'),
        assessment: valid,
        changedSections: [],
        pending: false,
        outcome: 'idle',
      }).state,
    ).toBe('LIFECYCLE_LOCKED');
    const approvedLocked = deriveAssetSaveState({
      editability: editability('approved'),
      assessment: valid,
      changedSections: [],
      pending: false,
      outcome: 'idle',
    });
    expect(approvedLocked).toMatchObject({
      state: 'LIFECYCLE_LOCKED',
      canSubmit: false,
    });
    expect(approvedLocked.explanation).toContain('approved and immutable');
    expect(approvedLocked.explanation).toContain('Save draft is unavailable');
    expect(
      deriveAssetSaveState({
        editability: editable,
        assessment: valid,
        changedSections: sections,
        pending: true,
        outcome: 'idle',
      }).state,
    ).toBe('SAVING');
    expect(
      deriveAssetSaveState({
        editability: editable,
        assessment: valid,
        changedSections: sections,
        pending: false,
        outcome: 'error',
        errorKind: 'temporary',
      }).state,
    ).toBe('SAVE_FAILED');
    expect(
      deriveAssetSaveState({
        editability: editable,
        assessment: valid,
        changedSections: sections,
        pending: false,
        outcome: 'error',
        errorKind: 'revision_conflict',
      }),
    ).toMatchObject({ state: 'REVISION_CONFLICT', canSubmit: false });
    expect(
      deriveAssetSaveState({
        editability: editable,
        assessment: valid,
        changedSections: [],
        pending: false,
        outcome: 'success',
      }).state,
    ).toBe('SAVE_SUCCEEDED');
  });
});
