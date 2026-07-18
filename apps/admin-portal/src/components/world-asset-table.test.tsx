import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorldAssetTable } from './world-asset-table';

const assetId = '36f4dc81-50f0-4ebd-81f0-f014b27217a5';
const activeVersionId = 'ee26ba4b-d21c-4b35-9fd4-c7c565f30f4e';

describe('world asset Manage links', () => {
  it('opens Tree Pine by its canonical asset ID rather than an active, draft, or intake ID', () => {
    const markup = renderToStaticMarkup(
      createElement(WorldAssetTable, {
        assets: [
          {
            id: assetId,
            gameId: 'starville',
            slug: 'tree-pine',
            friendlyName: 'Tree Pine',
            assetType: 'tree',
            category: 'nature',
            lifecycleStatus: 'active',
            productionStatus: 'approved_production',
            activeVersionId,
            bundledDefaultVersionId: null,
            bundledManifestVersion: null,
            activeSourceState: 'uploaded_override',
            canRestoreBundledDefault: false,
            developmentMarkerReplacementKey: null,
            versionCount: 2,
            uploadedVersionCount: 2,
            invalidVersionCount: 0,
            referenceCount: 0,
            referenceBreakdown: { world: 0, furniture: 0, farming: 0 },
            revision: 2,
            thumbnailUrl: null,
            createdAt: '2026-07-13T04:00:00.000Z',
            updatedAt: '2026-07-16T03:00:00.000Z',
          },
        ],
      }),
    );

    expect(markup).toContain(`href="/world-assets/${assetId}"`);
    expect(markup).not.toContain(`href="/world-assets/${activeVersionId}"`);
    expect(markup).toContain('Manage<span class="sr-only"> Tree Pine</span>');
  });
});
