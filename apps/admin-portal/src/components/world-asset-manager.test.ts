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
    expect(versionWorkspace).toContain(
      "props.capabilities.canEdit && version.lifecycleStatus === 'validated'",
    );
  });

  it('guides draft configuration with the selected asset-type profile', () => {
    expect(versionWorkspace).toContain('profile.allowedCategories.map');
    expect(versionWorkspace).toContain('profile.allowedInteractions.map');
    expect(versionWorkspace).not.toContain('ASSET_CATEGORIES.map');
    expect(versionWorkspace).not.toContain('ASSET_INTERACTION_COMPATIBILITIES.map');
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
    expect(styles).toContain('@media (max-width: 820px)');
    expect(styles).toContain('@media (max-width: 520px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
