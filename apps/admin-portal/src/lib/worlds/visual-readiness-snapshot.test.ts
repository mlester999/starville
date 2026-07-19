import { lanternSquareManifest } from '@starville/game-core';
import { describe, expect, it } from 'vitest';

import type { WorldRevision } from './contracts';
import { createAdminWorldVisualReadinessSnapshot } from './visual-readiness-snapshot';
import { WORLD_VISUAL_REVIEW_VIEWPORTS } from './visual-readiness-review';

const timestamp = '2026-07-18T00:00:00.000Z';

function revision(): WorldRevision {
  const manifest = lanternSquareManifest();
  return {
    status: 'loaded',
    map: {
      id: '3e067bf0-a684-4ed6-96dc-0c5b7fc15d66',
      slug: 'lantern-square',
      displayName: 'Lantern Square',
      description: 'Village hub',
      status: 'active',
      recordVersion: 1,
      activePublishedVersionId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    version: {
      id: '4f2b0e0e-0607-4d65-bd33-f3d50bdaff45',
      worldMapId: '3e067bf0-a684-4ed6-96dc-0c5b7fc15d66',
      versionNumber: 7,
      lifecycleStatus: 'validated',
      editVersion: 3,
      checksum: 'a'.repeat(64),
      validationStatus: 'valid',
      validationResult: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      validatedAt: timestamp,
      publishedAt: null,
      publicationReason: null,
      supersedesVersionId: null,
      derivedFromVersionId: null,
    },
    manifest,
    isDraftHead: true,
    revisionMetadata: {
      parentRevisionId: null,
      revisionKind: 'draft_saved',
      changeSummary: {
        objectsAdded: 0,
        objectsRemoved: 0,
        objectsMoved: 0,
        objectsModified: 0,
        assetBindingsChanged: 0,
        collisionsChanged: 0,
        interactionsChanged: 0,
        exitsChanged: 0,
        spawnsChanged: 0,
        terrainChanged: false,
      },
      createdAt: timestamp,
    },
  };
}

describe('revision-backed visual-readiness snapshot', () => {
  it('identifies the exact revision and derives every camera matrix frame without mutation', () => {
    const source = revision();
    const before = JSON.stringify(source);
    const snapshot = createAdminWorldVisualReadinessSnapshot(source);

    expect(snapshot).toMatchObject({
      mapName: 'Lantern Square',
      versionNumber: 7,
      versionId: source.version.id,
      checksum: source.version.checksum,
      validationStatus: 'valid',
    });
    expect(snapshot.cameraFrames).toHaveLength(WORLD_VISUAL_REVIEW_VIEWPORTS.length);
    expect(snapshot.cameraFrames.every(({ zoom }) => zoom > 0)).toBe(true);
    expect(snapshot.readiness.counts.warning).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(source)).toBe(before);
  });
});
