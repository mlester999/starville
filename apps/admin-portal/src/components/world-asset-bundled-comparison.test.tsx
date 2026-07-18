import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorldAssetBundledComparison } from './world-asset-bundled-comparison';

describe('WorldAssetBundledComparison', () => {
  it('shows four safe bundled-default comparison contexts and byte evidence without mutation', () => {
    const markup = renderToStaticMarkup(
      <WorldAssetBundledComparison
        assetKey="tree-pine"
        bundledSizeBytes={9_288}
        uploadedLabel="No active upload"
        uploadedMediaUrl={null}
        uploadedVersion={null}
      />,
    );

    expect(markup).toContain('Compare with Bundled Default');
    expect(markup).toContain('Transparent background');
    expect(markup).toContain('Light background');
    expect(markup).toContain('Dark background');
    expect(markup).toContain('Isometric context');
    expect(markup.match(/\/api\/bundled-assets\/tree-pine\/source/gu)).toHaveLength(4);
    expect(markup).toContain('9.1 KB');
    expect(markup).toContain('File size');
    expect(markup).toContain('No eligible processed uploaded media');
    expect(markup).not.toContain('Activate');
    expect(markup).not.toContain('Restore Bundled Default');
  });
});
