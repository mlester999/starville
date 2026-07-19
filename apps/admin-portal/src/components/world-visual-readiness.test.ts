import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AdminWorldVisualReadinessSnapshot } from '../lib/worlds/visual-readiness-snapshot';
import { WorldVisualReadiness } from './world-visual-readiness';

const component = readFileSync(new URL('./world-visual-readiness.tsx', import.meta.url), 'utf8');
const route = readFileSync(
  new URL('../app/(protected)/worlds/visual-readiness/page.tsx', import.meta.url),
  'utf8',
);
const worldsPage = readFileSync(
  new URL('../app/(protected)/worlds/page.tsx', import.meta.url),
  'utf8',
);

describe('authorized Worlds visual-readiness workspace', () => {
  it('is linked from Worlds and enforces read permission on the server route', () => {
    expect(worldsPage).toContain('href="/worlds/visual-readiness"');
    expect(worldsPage).toContain('Visual Readiness');
    expect(route).toContain("requireAuthorizedAdmin('maps.read')");
    expect(route).toContain('loadWorldRevision');
    expect(route).toContain('createAdminWorldVisualReadinessSnapshot');
  });

  it('keeps review controls browser-local and contains no mutation or publication action', () => {
    expect(component).toContain('Selections clear on reload.');
    expect(component).toContain('not a second Composer');
    expect(component).toContain('setCompletedChecks');
    expect(component).toContain('setCapturedViewports');
    expect(component).not.toContain('fetch(');
    expect(component).not.toContain('localStorage');
    expect(component).not.toContain('sessionStorage');
    expect(component).not.toContain('saveWorldDraftAction');
    expect(component).not.toContain('publishWorldDraft');
  });

  it('surfaces deterministic modes, all visual dimensions, and manual screenshots', () => {
    expect(component).toContain('Deterministic review modes');
    expect(component).toContain('Composition and usability checks');
    expect(component).toContain('Manual screenshot matrix');
    expect(component).toContain('WORLD_VISUAL_REVIEW_VIEWPORTS');
    expect(component).toContain('role="group"');
    expect(component).not.toContain('role="listitem"');
  });

  it('renders exact revision identity, textual severities, and computed camera status', () => {
    const revision = {
      mapId: '3e067bf0-a684-4ed6-96dc-0c5b7fc15d66',
      mapName: 'Lantern Square',
      mapSlug: 'lantern-square',
      versionId: '4f2b0e0e-0607-4d65-bd33-f3d50bdaff45',
      versionNumber: 7,
      lifecycleStatus: 'validated',
      validationStatus: 'valid',
      checksum: 'a'.repeat(64),
      manifestName: 'Lantern Square',
      readiness: {
        ready: false,
        counts: { error: 0, warning: 1, recommendation: 0 },
        findings: [
          {
            code: 'sparse-composition',
            severity: 'warning',
            message: 'Composition density is sparse.',
            path: null,
          },
        ],
      },
      cameraFrames: [
        {
          viewportId: 'desktop-wide',
          label: 'Desktop wide',
          width: 1440,
          height: 900,
          zoom: 1.1,
          apronTiles: 2,
          projectedWidth: 960,
          projectedHeight: 640,
        },
      ],
    } as const satisfies AdminWorldVisualReadinessSnapshot;
    const markup = renderToStaticMarkup(createElement(WorldVisualReadiness, { revision }));

    expect(markup).toContain('Lantern Square · Version 7');
    expect(markup).toContain(revision.versionId);
    expect(markup).toContain('Trusted validation');
    expect(markup).toContain('Warning');
    expect(markup).toContain('sparse-composition');
    expect(markup).toContain('Computed camera coverage for the exact revision');
  });
});
