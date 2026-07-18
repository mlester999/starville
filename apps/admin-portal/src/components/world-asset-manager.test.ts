import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const replacement = readFileSync(
  new URL('./world-asset-replacement-dialog.tsx', import.meta.url),
  'utf8',
);
const upload = readFileSync(new URL('./world-asset-upload-wizard.tsx', import.meta.url), 'utf8');
const preview = readFileSync(
  new URL('./world-asset-preview-workspace.tsx', import.meta.url),
  'utf8',
);
const previewModes = readFileSync(
  new URL('./world-asset-preview-modes.tsx', import.meta.url),
  'utf8',
);
const scenePreview = readFileSync(
  new URL('./world-asset-scene-preview.tsx', import.meta.url),
  'utf8',
);
const scenePreviewRoute = readFileSync(
  new URL(
    '../app/api/world-assets/scene-preview/worlds/[mapId]/versions/[versionId]/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const review = readFileSync(new URL('./world-asset-review-table.tsx', import.meta.url), 'utf8');
const references = readFileSync(
  new URL('./world-asset-reference-list.tsx', import.meta.url),
  'utf8',
);
const newVersion = readFileSync(
  new URL('./world-asset-new-version-upload.tsx', import.meta.url),
  'utf8',
);
const newVersionRoute = readFileSync(
  new URL('../app/api/world-assets/[assetId]/versions/route.ts', import.meta.url),
  'utf8',
);
const editor = readFileSync(new URL('./world-editor.tsx', import.meta.url), 'utf8');
const versionWorkspace = readFileSync(
  new URL('./world-asset-version-workspace.tsx', import.meta.url),
  'utf8',
);
const operationDialog = readFileSync(
  new URL('./world-asset-operation-dialog.tsx', import.meta.url),
  'utf8',
);
const workspaceGuidance = readFileSync(
  new URL('./world-asset-workspace-guidance.tsx', import.meta.url),
  'utf8',
);
const workspaceModel = readFileSync(
  new URL('../lib/world-assets/workspace-model.ts', import.meta.url),
  'utf8',
);
const versionPage = readFileSync(
  new URL(
    '../app/(protected)/world-assets/[assetId]/versions/[versionId]/page.tsx',
    import.meta.url,
  ),
  'utf8',
);
const actions = readFileSync(new URL('../app/actions/world-assets.ts', import.meta.url), 'utf8');
const authorization = readFileSync(
  new URL('../lib/world-assets/authorization.ts', import.meta.url),
  'utf8',
);
const auditPage = readFileSync(
  new URL('../app/(protected)/world-assets/audit/page.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const uploadRoute = readFileSync(
  new URL('../app/api/world-assets/upload/route.ts', import.meta.url),
  'utf8',
);
const slugAvailabilityRoute = readFileSync(
  new URL('../app/api/world-assets/slug-availability/route.ts', import.meta.url),
  'utf8',
);
const assetDetailPage = readFileSync(
  new URL('../app/(protected)/world-assets/page.tsx', import.meta.url),
  'utf8',
);
const assetDetailRecordPage = readFileSync(
  new URL('../app/(protected)/world-assets/[assetId]/page.tsx', import.meta.url),
  'utf8',
);
const placeholderSelector = readFileSync(
  new URL('./world-asset-placeholder-selector.tsx', import.meta.url),
  'utf8',
);
const uploadLib = readFileSync(new URL('../lib/world-assets/upload.ts', import.meta.url), 'utf8');

describe('world asset manager interface boundaries', () => {
  it('keeps replacement draft-only, explicit, accessible, and development-filtered', () => {
    expect(replacement).toContain('<dialog');
    expect(replacement).toContain('aria-labelledby');
    expect(replacement).toContain('focusTrapTarget');
    expect(replacement).toContain("props.lifecycleStatus === 'draft'");
    expect(replacement).toContain('Show development markers');
    expect(replacement).toContain('collisionImpactAccepted');
    expect(replacement).toContain('map collision remains unchanged');
    expect(editor).toContain('WorldAssetReplacementDialog');
    expect(editor).not.toContain('aria-label="Selected object asset"');
  });

  it('announces real upload phases and preserves retry idempotency', () => {
    expect(upload).toContain('resolveAssetUploadAttempt');
    expect(upload).toContain('xhr.upload.onload');
    expect(upload).toContain("setState('processing')");
    expect(upload).toContain("setState('complete')");
    expect(upload).not.toContain('are queued');
    expect(upload).not.toContain('queueMicrotask(() => setState');
  });

  it('auto-generates a read-only Asset ID and removes technical slug/marker inputs from normal flow', () => {
    expect(upload).toContain('generateAssetSlug');
    expect(upload).toContain('Asset ID');
    expect(upload).toContain('aria-live="polite"');
    expect(upload).toContain('Generated automatically from the friendly name');
    expect(upload).toContain('Will be generated from the friendly name');
    expect(upload).not.toContain('id="upload-slug"');
    expect(upload).not.toContain('Development-marker replacement key');
    expect(upload).not.toContain('phase7-general-store-marker');
    expect(upload).not.toContain('setSlugTouched');
    expect(uploadLib).toContain('suggestAlternateAssetSlug');
    expect(uploadLib).toContain('friendlyNameValidationMessage');
    expect(slugAvailabilityRoute).toContain('ASSET_SLUG_CHECK_FORBIDDEN');
    expect(slugAvailabilityRoute).toContain('suggestAlternateAssetSlug');
    expect(uploadRoute).toContain('developmentMarkerReplacementKey: marker');
    expect(upload).toContain("body.set('developmentMarkerReplacementKey', markerKey)");
    expect(upload).toContain('if (markerKey !== null');
  });

  it('defers friendly-name errors until interaction and keeps layout safe offsets', () => {
    expect(upload).toContain('nameTouched');
    expect(upload).toContain('identityAttempted');
    expect(upload).toContain('showNameValidation');
    expect(upload).toContain('onBlur={() => setNameTouched(true)}');
    expect(upload).toContain('continueFromIdentity');
    expect(upload).toContain('friendlyNameRef.current?.focus()');
    expect(upload).toContain('wizard-actions');
    expect(upload).toContain('Show type guide');
    expect(upload).toContain('is-guide-collapsed');
    expect(styles).toContain('--admin-sticky-top');
    expect(styles).toContain('--admin-sticky-max-height');
    expect(styles).toContain('scroll-padding-top');
    expect(styles).toContain('.wizard-actions');
    expect(styles).toContain('.asset-upload-layout.is-guide-collapsed');
    expect(placeholderSelector).toContain('asset-placeholder-selector__disclosure');
    expect(placeholderSelector).toContain('Optional');
    expect(placeholderSelector).toContain('Replacing a temporary placeholder?');
  });

  it('keeps marker replacement intentional, friendly-labeled, and draft-safe', () => {
    expect(placeholderSelector).toContain('Replace existing placeholder');
    expect(placeholderSelector).toContain('No placeholder selected');
    expect(placeholderSelector).toContain('Not replacing a placeholder');
    expect(placeholderSelector).toContain('Technical details');
    expect(placeholderSelector).toContain('Published worlds remain unchanged');
    expect(placeholderSelector).not.toContain('canonical registry');
    expect(assetDetailRecordPage).toContain('PlaceholderReplacementDisplay');
    expect(assetDetailRecordPage).toContain('developmentMarkerReplacementKey');
    expect(newVersion).not.toContain('developmentMarkerReplacementKey');
    expect(newVersion).not.toContain('Development-marker');
  });

  it('uses the shared content shell so World Assets keep sidebar clearance', () => {
    expect(assetDetailPage).toContain('admin-content-shell');
    expect(styles).toContain('.admin-content-shell');
    expect(styles).toContain('.world-assets-page');
    expect(styles).toContain('100% - clamp(2rem, 4vw, 3rem)');
    expect(styles).toContain('.asset-upload-layout');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) minmax(17.5rem, 22.5rem)');
    expect(styles).toContain('--admin-sticky-top');
  });

  it('exposes Asset Guide & Templates and richer advisory inspection without backend changes', () => {
    const guidePage = readFileSync(
      new URL('../app/(protected)/world-assets/guide/page.tsx', import.meta.url),
      'utf8',
    );
    const guidePanel = readFileSync(
      new URL('./world-asset-guide-panel.tsx', import.meta.url),
      'utf8',
    );
    const requirements = readFileSync(
      new URL('../lib/world-assets/requirements.ts', import.meta.url),
      'utf8',
    );
    const inspection = readFileSync(
      new URL('../lib/world-assets/image-inspection.ts', import.meta.url),
      'utf8',
    );
    expect(guidePage).toContain('Asset Guide');
    expect(guidePage).toContain('requireAssetManagerPermission');
    expect(guidePanel).toContain('downloadTransparentTemplate');
    expect(guidePanel).toContain('Download blank template');
    expect(requirements).toContain('dimensionsExact: false');
    expect(requirements).toContain('Recommended dimensions');
    expect(inspection).toContain('inspectClientImage');
    expect(upload).toContain('inspectClientImage');
    expect(upload).toContain('assetRequirementGuide');
    expect(preview).toContain('Preview room');
    expect(newVersion).not.toContain('developmentMarkerReplacementKey');
  });

  it('uses only the protected same-origin proxy for version preview media', () => {
    expect(preview).toContain('availableAdminAssetMediaPath');
    expect(preview).toContain('previewSource === null');
    expect(preview).toContain("{ value: 'original', label: 'Uploaded original' }");
    expect(preview).toContain("source === 'original'");
    expect(preview).not.toContain('src={props.version.');
  });

  it('renders the exact review candidate and bounded safe references', () => {
    expect(review).toContain('availableAdminAssetMediaPath');
    expect(review).toContain('version.thumbnailUrl');
    expect(review).toContain('/versions/${version.id}');
    expect(references).toContain('reference.referenceKey');
    expect(references).toContain('Showing the first');
  });

  it('creates later versions through a reauthorized same-origin upload boundary', () => {
    expect(newVersion).toContain('resolveAssetUploadAttempt');
    expect(newVersion).toContain('xhr.upload.onload');
    expect(newVersion).toContain('The current active version and every');
    expect(newVersionRoute).toContain("isAssetManagerRequestAuthorized('assets.upload')");
    expect(newVersionRoute).toContain("request.headers.get('origin') !== config.appOrigin");
    expect(newVersionRoute).toContain('assetCreateVersionUploadMetadataSchema.safeParse');
  });

  it('provides bounded accessible preview panning without mutating configuration', () => {
    expect(preview).toContain('aria-label="Pan preview left"');
    expect(preview).toContain('aria-label="Pan preview right"');
    expect(preview).toContain('setPan({ x: 0, y: 0 })');
    expect(preview).toContain('Reference player and foot marker for collision scale');
    expect(styles).toContain('.asset-preview-player-marker__foot');
  });

  it('keeps submit-for-review on the edit permission boundary', () => {
    expect(actions).toContain("'submit-review': 'assets.edit'");
    expect(versionWorkspace).toContain('props.editability.canSubmitReview');
  });

  it('guides draft configuration with the selected asset-type profile', () => {
    expect(versionWorkspace).toContain('profile.allowedCategories.map');
    expect(versionWorkspace).toContain('profile.allowedInteractions.map');
    expect(versionWorkspace).not.toContain('ASSET_CATEGORIES.map');
    expect(versionWorkspace).not.toContain('ASSET_INTERACTION_COMPATIBILITIES.map');
  });

  it('derives one server-authoritative editability model for the complete workspace', () => {
    expect(versionPage).toContain('deriveAssetVersionEditability');
    expect(versionPage).toContain('editability={editability}');
    expect(workspaceModel).toContain(
      "const EDITABLE_LIFECYCLES = ['draft', 'validation_failed', 'changes_requested']",
    );
    expect(workspaceModel).toContain('canEditMetadata: canEdit');
    expect(workspaceModel).toContain('canEditRendering: canEdit');
    expect(workspaceModel).toContain('canSaveDraft: canEdit');
    expect(workspaceModel).toContain("lifecycleState === 'validated'");
    expect(versionWorkspace).not.toContain('This version is immutable or your role is read only.');
  });

  it('keeps version Inspect navigation canonical and owner-safe', () => {
    expect(assetDetailRecordPage).toContain('canonicalWorldAssetVersionPath(asset.id, version.id)');
    expect(assetDetailRecordPage).not.toContain('/version/${version.');
    expect(versionPage).toContain('resolveAssetVersionRead');
    expect(versionPage).toContain("resolution.kind === 'missing_asset'");
    expect(assetDetailRecordPage).not.toContain("'Asset record unavailable'");
  });

  it('makes the exact active version and latest non-active candidate prominent', () => {
    expect(assetDetailRecordPage).toContain('<h2>Active Version</h2>');
    expect(assetDetailRecordPage).toContain('Active Version: V');
    expect(assetDetailRecordPage).toContain('Active Artwork:');
    expect(assetDetailRecordPage).toContain('<h2>Latest Candidate</h2>');
    expect(assetDetailRecordPage).toContain('candidate is not active');
    expect(assetDetailRecordPage).toContain('Current Active');
    expect(assetDetailRecordPage).toContain('Latest Candidate');
    expect(assetDetailRecordPage).toContain('Development Marker');
    expect(assetDetailRecordPage).toContain('assetArtworkLabel(version)');
    expect(assetDetailRecordPage).toContain(
      'canonicalWorldAssetVersionPath(asset.id, activeVersion.id)',
    );
    expect(assetDetailRecordPage).toContain(
      'canonicalWorldAssetVersionPath(asset.id, latestCandidate.id)',
    );
    expect(assetDetailRecordPage).not.toContain('>{humanize(asset.lifecycleStatus)}</span>');
  });

  it('explains approval, activation, pins, and publication as separate authorized workflows', () => {
    expect(operationDialog).toContain('Approval is not activation');
    expect(operationDialog).toContain('Approval does not activate the version');
    expect(operationDialog).toContain('Activate separately');
    expect(operationDialog).toContain('Publish world separately');
    expect(operationDialog).toContain('Active-version impact');
    expect(operationDialog).toContain('World-reference impact');
    expect(operationDialog).toContain('Publication impact');
    expect(operationDialog).toContain('Separate activation review');
    expect(operationDialog).toContain('Activation safety checklist');
    expect(operationDialog).toContain('World references automatically changed: No');
    expect(operationDialog).toContain('Published worlds updated: No');
  });

  it('keeps bounded audit reasons and conflict recovery usable without losing entered text', () => {
    expect(operationDialog).toContain('maxLength={500}');
    expect(operationDialog).toContain('minLength={12}');
    expect(operationDialog).toContain('characters remaining');
    expect(operationDialog).toContain('Refresh latest state');
    expect(operationDialog).toContain('value={reason}');
    expect(operationDialog).toContain('Safe request ID:');
    expect(actions).toContain("errorKind: 'same_session_stale'");
    expect(actions).toContain("errorKind: 'actual_concurrent_change'");
    expect(actions).toContain("errorKind: 'already_approved'");
    expect(actions).toContain("errorKind: 'request_conflict'");
    expect(actions).not.toContain('changed in another session');
  });

  it('refreshes authoritative revisions after a same-page lifecycle mutation', () => {
    expect(versionWorkspace).toContain('shouldAcceptAuthoritativeVersionRevision');
    expect(versionWorkspace).toContain('setRevision(props.detail.version.editVersion)');
    expect(versionWorkspace).toContain('onRevisionConfirmed={setRevision}');
    expect(operationDialog).toContain('onRevisionConfirmedRef.current(state.editVersion)');
    expect(versionWorkspace).toContain('key={operation}');
    expect(operationDialog).toContain('router.refresh()');
    expect(operationDialog).toContain('conflictNeedsRefresh');
    expect(actions).toContain('revalidatePath(`/world-assets/${assetId}`)');
    expect(actions).toContain('revalidatePath(`/world-assets/${assetId}/versions/${versionId}`)');
  });

  it('shows real self-review policy, review evidence, and exact pinned-version usage', () => {
    expect(versionWorkspace).toContain('Human review workspace');
    expect(versionWorkspace).toContain('Self-review is permitted for your current');
    expect(versionWorkspace).toContain(
      'Production teams may assign upload, review, and activation',
    );
    expect(versionWorkspace).toContain('Difference from active Version');
    expect(versionWorkspace).toContain('Activation never rewrites these pins');
    expect(assetDetailRecordPage).toContain('loadAssetReferences(assetId.data, 1, 100');
  });

  it('provides state-aware production guidance without presenting recommendations as policy', () => {
    expect(workspaceGuidance).toContain('Guided production status');
    expect(workspaceGuidance).toContain('Asset Setup Guide');
    expect(workspaceGuidance).toContain('Next Safe Action');
    expect(workspaceGuidance).toContain('Understanding Anchors');
    expect(workspaceGuidance).toContain('Understanding Collision');
    expect(workspaceGuidance).toContain('Player Scale Check');
    expect(workspaceGuidance).toContain('Recommendations only');
    expect(workspaceGuidance).toContain('Selecting guidance never changes saved configuration');
    expect(workspaceGuidance).toContain('Before You Can Save');
    expect(preview).toContain('Preview only controls');
    expect(preview).toContain('Preview control help');
    expect(preview).toContain('Preview legend');
  });

  it('adds lazy real-scene and version-comparison modes behind a read-only safety boundary', () => {
    expect(previewModes).toContain('Technical Preview');
    expect(previewModes).toContain('In-Game Scene Preview');
    expect(previewModes).toContain('Compare Versions');
    expect(previewModes).toContain('ssr: false');
    expect(scenePreview).toContain('No world data will be changed.');
    expect(scenePreview).toContain('Published and draft');
    expect(scenePreview).toContain('Show Active');
    expect(scenePreview).toContain('Show Candidate');
    expect(scenePreview).toContain('A/B Toggle');
    expect(scenePreview).toContain('Reference player simulation');
    expect(scenePreview).toContain('Preview notes');
    expect(scenePreview).toContain('Local preview state only');
    expect(scenePreview).toContain("method: 'GET'");
    expect(scenePreviewRoute).toContain('export async function GET');
    expect(scenePreviewRoute).not.toContain('export async function POST');
    expect(scenePreviewRoute).not.toContain('saveWorldDraft');
    expect(scenePreviewRoute).not.toContain('publishWorldDraft');
    expect(scenePreviewRoute).not.toContain('applyAssetVersionOperation');
  });

  it('offers all explicit successor starting points without activating or publishing', () => {
    expect(workspaceGuidance).toContain('Copy source artwork and configuration');
    expect(workspaceGuidance).toContain('Upload replacement artwork');
    expect(workspaceGuidance).toContain('Start with default configuration');
    expect(workspaceGuidance).toContain('The current version remains unchanged.');
    expect(workspaceGuidance).toContain('The current active version remains active.');
    expect(workspaceGuidance).toContain('Published references remain pinned.');
    expect(workspaceGuidance).toContain('No activation or world publication occurs automatically.');
    expect(actions).toContain('createWorldAssetVersionFromExistingAction');
  });

  it('makes draft persistence explicit, recoverable, and safe to retry', () => {
    expect(versionWorkspace).toContain('Unsaved changes:');
    expect(versionWorkspace).toContain('Discard changes');
    expect(versionWorkspace).toContain('Safe request ID:');
    expect(versionWorkspace).toContain('beforeunload');
    expect(versionWorkspace).toContain('saveState.canSubmit');
    expect(actions).toContain("if (error.status === 409) return 'revision_conflict'");
    expect(actions).toContain('savedAt: new Date().toISOString()');
  });

  it('requires both review and approval permissions at the administrator boundary', () => {
    expect(authorization).toContain(
      "canApprove: canReview && hasAdminPermission(context, 'assets.approve')",
    );
    expect(actions).toContain("operation.data === 'approve'");
    expect(actions).toContain("requireAssetManagerPermission('assets.review')");
  });

  it('uses the corrected read-only permission for asset audit navigation and access', () => {
    expect(authorization).toContain("hasAdminPermission(context, 'assets.audit.read')");
    expect(auditPage).toContain("requireAssetManagerPermission('assets.audit.read')");
    expect(`${authorization}\n${auditPage}`).not.toContain('assets.audit_read');
  });

  it('has bounded responsive layouts and reduced-motion treatment', () => {
    expect(styles).toContain('.world-asset-replacement-dialog');
    expect(styles).toContain('.asset-upload-layout');
    expect(styles).toContain('.asset-scene-frame--mobile');
    expect(styles).toContain('max-width: 390px');
    expect(styles).toContain('touch-action: none');
    expect(styles).toContain('min-height: 44px');
    expect(styles).toContain('@media (max-width: 820px)');
    expect(styles).toContain('@media (max-width: 520px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('reserves sticky action-bar bottom safe space with shared layout tokens', () => {
    expect(styles).toContain('--world-asset-action-bar-height');
    expect(styles).toContain('--world-asset-bottom-safe-space');
    expect(styles).toContain('--world-asset-section-gap');
    expect(styles).toContain('--world-asset-secondary-action-gap');
    expect(styles).toContain('scroll-padding-bottom: var(--world-asset-bottom-safe-space)');
    expect(styles).toContain('scroll-margin-bottom: var(--world-asset-bottom-safe-space)');
    expect(styles).toContain('env(safe-area-inset-bottom, 0px)');
    expect(styles).toContain('.portal-content:has(.world-asset-version-workspace)');
    expect(versionWorkspace).toContain('saveBarRef');
    expect(versionWorkspace).toContain('ResizeObserver');
    expect(versionWorkspace).toContain('--world-asset-action-bar-height');
    expect(versionWorkspace).toContain('asset-configuration-form__sections');
  });

  it('keeps the sticky save bar from dominating immutable approved versions', () => {
    expect(versionWorkspace).toContain('asset-save-bar--locked');
    expect(versionWorkspace).toContain('asset-save-bar__disabled-action');
    expect(versionWorkspace).toContain('asset-save-bar__next-action');
    expect(versionWorkspace).toContain("saveState.state === 'LIFECYCLE_LOCKED'");
    expect(versionWorkspace).toContain('aria-describedby="asset-save-state"');
    expect(versionWorkspace).toContain('aria-label="Draft save actions"');
    expect(styles).toContain('.asset-save-bar__disabled-action');
    expect(styles).toContain('cursor: not-allowed');
    expect(styles).toContain('.asset-save-bar--locked');
  });

  it('separates anchor reset and collision helper spacing from crowded fields', () => {
    expect(versionWorkspace).toContain('asset-form-secondary-actions');
    expect(versionWorkspace).toContain('Reset recommended anchors');
    expect(versionWorkspace).toContain('asset-form-section__footer-hint');
    expect(versionWorkspace).toContain('asset-form-section--final');
    expect(versionWorkspace).toContain('Rotations and interaction compatibility');
    expect(styles).toContain('.asset-form-secondary-actions');
    expect(styles).toContain('.asset-form-section__footer-hint');
    expect(styles).toContain('.asset-form-section__body');
  });

  it('stacks and wraps the sticky action bar across mobile and tablet breakpoints', () => {
    expect(styles).toContain(
      '/* Tablet: allow sticky bar message + actions to wrap without crushing text */',
    );
    expect(styles).toContain('.asset-save-bar__message');
    expect(styles).toMatch(
      /@media \(max-width: 520px\)[\s\S]*\.asset-save-bar[\s\S]*flex-direction: column/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 520px\)[\s\S]*\.asset-save-bar \.button[\s\S]*min-height: 2\.75rem/,
    );
    expect(styles).toContain('min-height: 2.75rem');
  });

  it('keeps go-to-first-issue focus scrolling aware of the sticky offset', () => {
    expect(versionWorkspace).toContain('onGoToFirstIssue={goToFirstIssue}');
    expect(versionWorkspace).toContain("block: 'nearest'");
    expect(versionWorkspace).toContain(
      'scroll-margin-bottom on fields clears the sticky action bar',
    );
    expect(styles).toContain('.world-asset-version-workspace .field');
    expect(styles).toContain('scroll-margin-bottom: var(--world-asset-bottom-safe-space)');
  });
});
