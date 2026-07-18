import type { AdminRoleKey } from '@starville/admin-auth';
import type { AssetType } from '@starville/asset-management';

import { assetDraftConfigurationSchema } from './contracts';
import type {
  AssetDraftConfiguration,
  AssetManagerCapabilities,
  AssetVersionLifecycleStatus,
  WorldAssetVersionDetail,
} from './contracts';

const EDITABLE_LIFECYCLES = ['draft', 'validation_failed', 'changes_requested'] as const;

export type AssetSaveState =
  | 'EDITABLE_READY'
  | 'EDITABLE_NO_CHANGES'
  | 'EDITABLE_INVALID'
  | 'LIFECYCLE_LOCKED'
  | 'PERMISSION_LOCKED'
  | 'SAVING'
  | 'SAVE_FAILED'
  | 'SAVE_SUCCEEDED'
  | 'REVISION_CONFLICT';

export interface AssetVersionEditabilityModel {
  readonly lifecycleState: AssetVersionLifecycleStatus;
  readonly versionNumber: number;
  readonly isDraft: boolean;
  readonly isValidated: boolean;
  readonly isInReview: boolean;
  readonly isApproved: boolean;
  readonly isActive: boolean;
  readonly isRejected: boolean;
  readonly isRetired: boolean;
  readonly isArchived: boolean;
  readonly isImmutable: boolean;
  readonly hasEditPermission: boolean;
  readonly hasReviewPermission: boolean;
  readonly hasApprovalPermission: boolean;
  readonly hasActivationPermission: boolean;
  readonly canEditMetadata: boolean;
  readonly canEditRendering: boolean;
  readonly canSaveDraft: boolean;
  readonly canValidate: boolean;
  readonly canSubmitReview: boolean;
  readonly canApprove: boolean;
  readonly canActivate: boolean;
  readonly canCreateNextVersion: boolean;
  readonly lockReasons: readonly string[];
  readonly lifecycleMessage: string;
  readonly nextRecommendedAction: string;
  readonly administratorRole: AdminRoleKey;
  readonly administratorRoleName: string;
}

export interface AssetDraftIssue {
  readonly fieldId: string;
  readonly path: string;
  readonly message: string;
}

export interface AssetDraftRequirement {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly state: 'complete' | 'warning' | 'required' | 'invalid' | 'not_applicable';
  readonly blocking: boolean;
}

export interface AssetDraftAssessment {
  readonly valid: boolean;
  readonly issues: readonly AssetDraftIssue[];
  readonly requirements: readonly AssetDraftRequirement[];
}

export interface AssetSaveStateModel {
  readonly state: AssetSaveState;
  readonly canSubmit: boolean;
  readonly explanation: string;
  readonly changedSections: readonly string[];
  readonly issues: readonly AssetDraftIssue[];
}

const LIFECYCLE_MESSAGES: Readonly<Record<AssetVersionLifecycleStatus, string>> = {
  draft:
    'This draft can be edited. Complete the required configuration and save before validation.',
  processing:
    'The trusted service is processing this candidate. Configuration remains locked until processing completes.',
  validation_failed:
    'Validation found blocking issues. This candidate can be corrected and saved as a draft.',
  validated:
    'This version passed validation and is now immutable. Continue to human review, or create a new draft version to make changes.',
  in_review: 'This version is under human review and cannot be edited.',
  changes_requested:
    'A reviewer requested changes. Correct this candidate, save it as a draft, and validate again.',
  rejected:
    'This candidate cannot be edited. Create a new version that addresses the review feedback.',
  approved: 'This version is approved and immutable. Activate it only after owner acceptance.',
  active:
    'This is the currently active pinned version. Create a new draft version to make changes.',
  deprecated: 'This retired version is retained as historical evidence and cannot be edited.',
  archived: 'This version is archived and read-only.',
};

const NEXT_ACTIONS: Readonly<Record<AssetVersionLifecycleStatus, string>> = {
  draft: 'Finish required configuration, save the draft, then run validation.',
  processing: 'Wait for trusted image processing to finish, then inspect the resulting candidate.',
  validation_failed: 'Resolve the blocking validation findings, save, and validate again.',
  validated: 'Review the candidate and continue to human review.',
  in_review: 'Wait for or complete the assigned review.',
  changes_requested: 'Address the review feedback, save the draft, and validate again.',
  rejected: 'Create a new version that addresses the review feedback.',
  approved: 'Activate only after owner acceptance.',
  active: 'Use this version in a world draft and test before publishing.',
  deprecated: 'Open the current active version or create a new draft when authorized.',
  archived: 'Open the current active version or create a new draft when authorized.',
};

export function deriveAssetVersionEditability(input: {
  readonly detail: WorldAssetVersionDetail;
  readonly capabilities: AssetManagerCapabilities;
  readonly administratorRole: AdminRoleKey;
  readonly administratorRoleName: string;
}): AssetVersionEditabilityModel {
  const lifecycleState = input.detail.version.lifecycleStatus;
  const lifecycleEditable = (EDITABLE_LIFECYCLES as readonly string[]).includes(lifecycleState);
  const hasEditPermission = input.capabilities.canEdit;
  const lockReasons: string[] = [];
  if (!lifecycleEditable) {
    lockReasons.push(
      `Version ${String(input.detail.version.versionNumber)} is ${lifecycleState.replaceAll('_', ' ')} and immutable.`,
    );
  }
  if (lifecycleEditable && !hasEditPermission) {
    lockReasons.push(
      'This version is editable by lifecycle, but your current role does not have permission to change it.',
    );
  }
  const canEdit = lifecycleEditable && hasEditPermission;

  return {
    lifecycleState,
    versionNumber: input.detail.version.versionNumber,
    isDraft: lifecycleState === 'draft',
    isValidated: lifecycleState === 'validated',
    isInReview: lifecycleState === 'in_review',
    isApproved: lifecycleState === 'approved',
    isActive: lifecycleState === 'active',
    isRejected: lifecycleState === 'rejected',
    isRetired: lifecycleState === 'deprecated',
    isArchived: lifecycleState === 'archived',
    isImmutable: !lifecycleEditable,
    hasEditPermission,
    hasReviewPermission: input.capabilities.canReview,
    hasApprovalPermission: input.capabilities.canApprove,
    hasActivationPermission: input.capabilities.canActivate,
    canEditMetadata: canEdit,
    canEditRendering: canEdit,
    canSaveDraft: canEdit,
    canValidate: canEdit && input.capabilities.canValidate,
    canSubmitReview: lifecycleState === 'validated' && input.capabilities.canEdit,
    canApprove: lifecycleState === 'in_review' && input.capabilities.canApprove,
    canActivate: lifecycleState === 'approved' && input.capabilities.canActivate,
    canCreateNextVersion:
      input.capabilities.canUpload &&
      (lifecycleState === 'validated' ||
        lifecycleState === 'approved' ||
        lifecycleState === 'rejected' ||
        lifecycleState === 'active' ||
        lifecycleState === 'deprecated' ||
        lifecycleState === 'archived'),
    lockReasons,
    lifecycleMessage: LIFECYCLE_MESSAGES[lifecycleState],
    nextRecommendedAction: NEXT_ACTIONS[lifecycleState],
    administratorRole: input.administratorRole,
    administratorRoleName: input.administratorRoleName,
  };
}

function fieldId(path: string): string {
  if (path.startsWith('render.footAnchor')) return 'asset-foot-anchor-x';
  if (path.startsWith('render.depthAnchor')) return 'asset-depth-anchor-x';
  if (path.startsWith('render')) return 'asset-render-width';
  if (path.startsWith('collision')) return 'asset-collision-shape';
  if (path.startsWith('interactionCompatibility')) return 'asset-interactions';
  if (path.startsWith('tags')) return 'asset-tags';
  if (path.startsWith('internalNotes')) return 'asset-internal-notes';
  if (path.startsWith('category')) return 'asset-category';
  return 'asset-friendly-name';
}

export function assessAssetDraft(input: {
  readonly configuration: AssetDraftConfiguration;
  readonly detail: WorldAssetVersionDetail;
  readonly collisionSupported: boolean;
  readonly transparencyRequired: boolean;
  readonly recommendedWidth: number;
  readonly recommendedHeight: number;
}): AssetDraftAssessment {
  const parsed = assetDraftConfigurationSchema.safeParse(input.configuration);
  const issues: AssetDraftIssue[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return { path, fieldId: fieldId(path), message: issue.message };
      });
  const { version } = input.detail;
  const dimensionsKnown = version.width !== null && version.height !== null;
  const dimensionsRecommended =
    dimensionsKnown &&
    version.width === input.recommendedWidth &&
    version.height === input.recommendedHeight;
  const sourceAvailable = version.sourceUrl !== null || version.previewUrl !== null;
  const collisionApplicable = input.collisionSupported;
  const collisionConfigured = input.configuration.collision.shape !== 'none';
  const transparencyFailed =
    input.transparencyRequired &&
    version.validationResult?.issues.some((issue) => issue.code === 'TRANSPARENCY_REQUIRED');

  const requirements: AssetDraftRequirement[] = [
    {
      key: 'source',
      label: 'Source artwork available',
      detail: sourceAvailable
        ? 'A protected source or derivative is available.'
        : 'Processing must finish.',
      state: sourceAvailable ? 'complete' : 'required',
      blocking: !sourceAvailable,
    },
    {
      key: 'format',
      label: 'Supported image format',
      detail: version.detectedMediaType?.toUpperCase() ?? 'Format is pending.',
      state: version.detectedMediaType === null ? 'required' : 'complete',
      blocking: version.detectedMediaType === null,
    },
    {
      key: 'dimensions',
      label: 'Dimensions accepted',
      detail: dimensionsKnown
        ? `${String(version.width)} × ${String(version.height)}; recommended ${String(input.recommendedWidth)} × ${String(input.recommendedHeight)}.`
        : 'Dimensions are pending.',
      state: !dimensionsKnown ? 'required' : dimensionsRecommended ? 'complete' : 'warning',
      blocking: !dimensionsKnown,
    },
    {
      key: 'transparency',
      label: 'Transparency requirement',
      detail: input.transparencyRequired
        ? transparencyFailed
          ? 'Trusted validation reports an opaque background.'
          : 'Transparency is required and no blocking finding is present.'
        : 'Transparency is optional for this asset type.',
      state: input.transparencyRequired
        ? transparencyFailed
          ? 'invalid'
          : 'complete'
        : 'not_applicable',
      blocking: Boolean(transparencyFailed),
    },
    {
      key: 'anchors',
      label: 'Foot and depth anchors configured',
      detail: 'Both normalized anchors are inside the saved asset bounds.',
      state: issues.some((issue) => issue.path.includes('Anchor')) ? 'invalid' : 'complete',
      blocking: issues.some((issue) => issue.path.includes('Anchor')),
    },
    {
      key: 'collision',
      label: 'Collision or passability selected',
      detail: collisionApplicable
        ? collisionConfigured
          ? 'A bounded collision shape is configured.'
          : 'No collision means this asset is explicitly passable.'
        : 'Collision is not supported for this asset type.',
      state: collisionApplicable ? 'complete' : 'not_applicable',
      blocking: false,
    },
    {
      key: 'interaction',
      label: 'Interaction point',
      detail:
        'The current repository contract stores interaction compatibility, not a separate interaction point.',
      state: 'not_applicable',
      blocking: false,
    },
    {
      key: 'metadata',
      label: 'Required metadata complete',
      detail: issues.some((issue) => ['friendlyName', 'category'].includes(issue.path))
        ? 'Fix the identified metadata fields.'
        : 'Required identity and classification fields are complete.',
      state: issues.some((issue) => ['friendlyName', 'category'].includes(issue.path))
        ? 'invalid'
        : 'complete',
      blocking: issues.some((issue) => ['friendlyName', 'category'].includes(issue.path)),
    },
  ];

  for (const requirement of requirements) {
    if (requirement.blocking && !issues.some((issue) => issue.path === requirement.key)) {
      issues.push({
        path: requirement.key,
        fieldId: requirement.key === 'source' ? 'asset-source-summary' : 'asset-friendly-name',
        message: requirement.detail,
      });
    }
  }
  return { valid: issues.length === 0, issues, requirements };
}

export function changedAssetSections(
  initial: AssetDraftConfiguration,
  current: AssetDraftConfiguration,
): readonly string[] {
  const changed: string[] = [];
  if (
    initial.friendlyName !== current.friendlyName ||
    initial.category !== current.category ||
    JSON.stringify(initial.tags) !== JSON.stringify(current.tags) ||
    initial.internalNotes !== current.internalNotes
  ) {
    changed.push('Identity and metadata');
  }
  if (JSON.stringify(initial.render) !== JSON.stringify(current.render)) {
    changed.push('Rendering and anchors');
  }
  if (JSON.stringify(initial.collision) !== JSON.stringify(current.collision)) {
    changed.push('Collision');
  }
  if (
    JSON.stringify(initial.interactionCompatibility) !==
    JSON.stringify(current.interactionCompatibility)
  ) {
    changed.push('Rotations and interactions');
  }
  return changed;
}

export function deriveAssetSaveState(input: {
  readonly editability: AssetVersionEditabilityModel;
  readonly assessment: AssetDraftAssessment;
  readonly changedSections: readonly string[];
  readonly pending: boolean;
  readonly outcome: 'idle' | 'success' | 'error';
  readonly errorKind?:
    | 'validation'
    | 'revision_conflict'
    | 'actual_concurrent_change'
    | 'same_session_stale'
    | 'stale_revision'
    | 'already_approved'
    | 'request_conflict'
    | 'permission'
    | 'temporary'
    | 'incomplete';
}): AssetSaveStateModel {
  if (input.pending) {
    return {
      state: 'SAVING',
      canSubmit: false,
      explanation: 'Saving this draft through the trusted service…',
      changedSections: input.changedSections,
      issues: input.assessment.issues,
    };
  }
  if (!input.editability.canSaveDraft) {
    const permissionLocked = !input.editability.isImmutable && !input.editability.hasEditPermission;
    return {
      state: permissionLocked ? 'PERMISSION_LOCKED' : 'LIFECYCLE_LOCKED',
      canSubmit: false,
      explanation: permissionLocked
        ? 'This version is editable by lifecycle, but your current role does not have permission to change it.'
        : `Save draft is unavailable because Version ${String(input.editability.versionNumber)} is ${input.editability.lifecycleState.replaceAll('_', ' ')} and immutable.`,
      changedSections: [],
      issues: [],
    };
  }
  if (!input.assessment.valid) {
    return {
      state: 'EDITABLE_INVALID',
      canSubmit: false,
      explanation: `Save is blocked by ${String(input.assessment.issues.length)} issue${input.assessment.issues.length === 1 ? '' : 's'}.`,
      changedSections: input.changedSections,
      issues: input.assessment.issues,
    };
  }
  if (input.outcome === 'success' && input.changedSections.length === 0) {
    return {
      state: 'SAVE_SUCCEEDED',
      canSubmit: false,
      explanation: 'Draft saved. No unsaved changes remain.',
      changedSections: [],
      issues: [],
    };
  }
  if (input.changedSections.length === 0) {
    return {
      state: 'EDITABLE_NO_CHANGES',
      canSubmit: false,
      explanation: 'No unsaved changes.',
      changedSections: [],
      issues: [],
    };
  }
  if (input.outcome === 'error') {
    return {
      state: [
        'revision_conflict',
        'actual_concurrent_change',
        'same_session_stale',
        'stale_revision',
      ].includes(input.errorKind ?? '')
        ? 'REVISION_CONFLICT'
        : 'SAVE_FAILED',
      canSubmit: ![
        'revision_conflict',
        'actual_concurrent_change',
        'same_session_stale',
        'stale_revision',
      ].includes(input.errorKind ?? ''),
      explanation: [
        'revision_conflict',
        'actual_concurrent_change',
        'same_session_stale',
        'stale_revision',
      ].includes(input.errorKind ?? '')
        ? 'This version changed in another session. Reload before retrying.'
        : 'The save did not complete. Your entered values are preserved and can be retried safely.',
      changedSections: input.changedSections,
      issues: [],
    };
  }
  return {
    state: 'EDITABLE_READY',
    canSubmit: true,
    explanation: 'Valid unsaved changes are ready to save.',
    changedSections: input.changedSections,
    issues: [],
  };
}

export type AssetGuidanceType =
  | 'Tree'
  | 'Bush'
  | 'Cottage'
  | 'Large Building'
  | 'Small Prop'
  | 'Workstation'
  | 'Crop'
  | 'Flower'
  | 'Ground Decoration'
  | 'Interactive Entrance'
  | 'Custom';

export function defaultAssetGuidanceType(assetType: AssetType): AssetGuidanceType {
  if (assetType === 'tree') return 'Tree';
  if (assetType === 'building' || assetType === 'shop') return 'Cottage';
  if (assetType === 'cooking_station' || assetType === 'crafting_station') return 'Workstation';
  if (assetType === 'crop_stage') return 'Crop';
  if (assetType === 'home_entrance') return 'Interactive Entrance';
  if (assetType === 'decoration' || assetType === 'rock') return 'Small Prop';
  return 'Custom';
}
