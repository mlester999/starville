import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const component = readFileSync(
  new URL('./world-asset-bundled-restore.tsx', import.meta.url),
  'utf8',
);
const actions = readFileSync(new URL('../app/actions/world-assets.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/world-assets/api.ts', import.meta.url), 'utf8');
const detailPage = readFileSync(
  new URL('../app/(protected)/world-assets/[assetId]/page.tsx', import.meta.url),
  'utf8',
);

describe('World Asset bundled-default restore control', () => {
  it('is visible only for a restorable asset and both lifecycle capabilities', () => {
    expect(detailPage).toContain('asset.canRestoreBundledDefault &&');
    expect(detailPage).toContain('capabilities.canActivate &&');
    expect(detailPage).toContain('capabilities.canDeprecate ?');
    expect(detailPage).toContain('<WorldAssetBundledRestore');
  });

  it('requires exact revision, bounded reason, typed confirmation, and stable idempotency', () => {
    expect(component).toContain('name="expectedAssetRevision"');
    expect(component).toContain('minLength={12}');
    expect(component).toContain('maxLength={500}');
    expect(component).toContain('BUNDLED_DEFAULT_RESTORE_CONFIRMATION');
    expect(component).toContain('name="requestId"');
    expect(actions).toContain("await requireAssetManagerPermission('assets.activate')");
    expect(actions).toContain("await requireAssetManagerPermission('assets.deprecate')");
  });

  it('posts the trusted action to the dedicated protected endpoint', () => {
    expect(api).toContain('/restore-bundled-default`');
    expect(api).toContain('requestId: input.idempotencyKey');
    expect(actions).toContain('restoreAssetBundledDefault(assetId, action)');
    expect(actions).toContain("error.code === 'MFA_REQUIRED'");
  });

  it('warns that restore does not rewrite pins, maps, or immutable history', () => {
    expect(component).toContain('Existing published world pins changed: No');
    expect(component).toContain('Existing draft pins changed: No');
    expect(component).toContain('Uploaded files or immutable version history deleted: No');
    expect(component).toContain('published maps, audit history');
    expect(component).toContain('AAL2 required');
  });
});
