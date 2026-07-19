import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(new URL('./world-draft-preview.tsx', import.meta.url), 'utf8');
const route = readFileSync(
  new URL('../app/(protected)/worlds/[mapId]/preview/page.tsx', import.meta.url),
  'utf8',
);

describe('exact-pinned Draft Preview', () => {
  it('gates the validated preview and exact draft-pin read behind their existing permissions', () => {
    expect(route).toContain("requireAuthorizedAdmin('maps.preview')");
    expect(route).toContain("requireAuthorizedAdmin('maps.edit')");
    expect(route).toContain("requireAuthorizedAdmin('assets.read')");
    expect(route).toContain('loadWorldPreview(mapId, version.data)');
    expect(route).toContain('loadWorldDraft(mapId, version.data)');
    expect(route).toContain('exactDraftPreviewAssetPins(preview, draft, preview.manifest.assets)');
  });

  it('passes exact pins to the shared canvas and withholds fallback rendering when absent', () => {
    expect(route).toContain('<WorldDraftPreview assetPins={assetPins} preview={preview} />');
    expect(component).toContain('assetPins={assetPins}');
    expect(component).toContain('data-preview-pin-status="unavailable"');
    expect(component).toContain('withheld instead of substituting current or bundled artwork');
  });
});
