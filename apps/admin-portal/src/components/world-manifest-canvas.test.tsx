import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getPhase7LocalDraft } from '@starville/game-content';
import { mapManifestSchema } from '@starville/game-core';

import type { WorldEditorAssetCandidate } from '../lib/world-assets/contracts';
import type { AssetSceneRenderOverride } from '../lib/world-assets/scene-preview-model';
import {
  WORLD_CANVAS_VIEW_HEIGHT,
  WORLD_CANVAS_VIEW_WIDTH,
  WorldManifestCanvas,
} from './world-manifest-canvas';
import type { AdminWorldManifest, WorldDraftAssetPin } from '../lib/worlds/contracts';

const TREE_ASSET_ID = '36f4dc81-50f0-4ebd-81f0-f014b27217a5';
const TREE_VERSION_ID = 'ee26ba4b-d21c-4b35-9fd4-c7c565f30f4e';

function baseManifest(overrides: Partial<AdminWorldManifest> = {}): AdminWorldManifest {
  return mapManifestSchema.parse({
    schemaVersion: 1,
    id: 'lantern-square',
    slug: 'lantern-square',
    name: 'Lantern Square',
    description: 'Canvas render test map.',
    version: 2,
    developmentArt: { temporary: true, label: 'Test development art' },
    background: { palette: 'village' },
    width: 24,
    height: 20,
    tileWidth: 96,
    tileHeight: 48,
    projectionOrigin: { x: 1152, y: 96 },
    cameraBounds: { minX: 0, minY: 0, maxX: 2304, maxY: 1200 },
    safeSaveBounds: { minX: 0.75, minY: 0.75, maxX: 23.25, maxY: 19.25 },
    defaultSpawnId: 'default',
    spawns: [
      {
        id: 'default',
        x: 12,
        y: 7.5,
        facingDirection: 'south',
        purpose: 'default',
        enabled: true,
      },
    ],
    assets: ['cottage-amber', 'phase7-general-store-marker'],
    terrain: [
      { id: 'terrain-grass', terrain: 'grass', x: 0, y: 0, width: 24, height: 20, order: 0 },
      { id: 'plaza-center', terrain: 'plaza', x: 8, y: 4, width: 9, height: 7, order: 2 },
    ],
    collisions: [
      { id: 'water-west', shape: 'rectangle', x: 0, y: 13, width: 11, height: 3, blocking: true },
    ],
    objects: [
      { id: 'cottage-amber', assetId: 'cottage-amber', kind: 'building', x: 5, y: 4.25, scale: 1 },
      {
        id: 'phase7-general-store-object',
        assetId: 'phase7-general-store-marker',
        kind: 'shop',
        x: 5,
        y: 5.7,
        scale: 1,
      },
      {
        id: 'phase7-cooking-hearth-object',
        assetId: 'phase7-cooking-hearth-marker',
        kind: 'cooking_station',
        x: 14.8,
        y: 6.1,
        scale: 1,
      },
      {
        id: 'phase7-crafting-workbench-object',
        assetId: 'phase7-crafting-workbench-marker',
        kind: 'crafting_station',
        x: 14.8,
        y: 7.8,
        scale: 1,
      },
      {
        id: 'phase7-home-entrance-object',
        assetId: 'phase7-home-entrance-marker',
        kind: 'home_entrance',
        x: 19,
        y: 8,
        scale: 1,
      },
    ],
    interactions: [
      {
        id: 'phase7-general-store',
        type: 'shop',
        x: 5,
        y: 5.7,
        range: 1.5,
        title: 'Lantern General Store',
        content: 'Browse goods.',
        shopSlug: 'lantern-general-store',
      },
    ],
    exits: ['north', 'east', 'south', 'west'].map((direction, index) => ({
      id: `exit-${direction}`,
      direction,
      trigger:
        index === 0
          ? { x: 10.5, y: 0.75, width: 3, height: 1 }
          : index === 1
            ? { x: 22.25, y: 6.25, width: 1, height: 2.5 }
            : index === 2
              ? { x: 10.5, y: 18.25, width: 3, height: 1 }
              : { x: 0.75, y: 6.25, width: 1, height: 2.5 },
      destinationMapId: null,
      destinationSpawnId: null,
      enabled: true,
      transitionLabel: null,
    })),
    ...overrides,
  });
}

function managedTreeCandidate(): WorldEditorAssetCandidate {
  const timestamp = '2026-07-16T00:00:00.000Z';
  return {
    assetKey: 'tree-pine',
    versionId: TREE_VERSION_ID,
    asset: {
      id: TREE_ASSET_ID,
      gameId: 'starville',
      slug: 'tree-pine',
      friendlyName: 'Tree Pine',
      assetType: 'tree',
      category: 'nature',
      lifecycleStatus: 'active',
      productionStatus: 'approved_production',
      activeVersionId: TREE_VERSION_ID,
      bundledDefaultVersionId: '77777777-7777-4777-8777-777777777777',
      bundledManifestVersion: '1.0.0',
      activeSourceState: 'uploaded_override',
      canRestoreBundledDefault: true,
      developmentMarkerReplacementKey: null,
      versionCount: 2,
      uploadedVersionCount: 1,
      invalidVersionCount: 0,
      referenceCount: 4,
      referenceBreakdown: { world: 4, furniture: 0, farming: 0 },
      revision: 2,
      thumbnailUrl: `/api/v1/admin/world-assets/${TREE_ASSET_ID}/versions/${TREE_VERSION_ID}/thumbnail`,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    activeVersion: {
      id: TREE_VERSION_ID,
      assetId: TREE_ASSET_ID,
      versionNumber: 1,
      lifecycleStatus: 'active',
      processingStatus: 'completed',
      validationStatus: 'valid',
      detectedMediaType: 'image/webp',
      width: 512,
      height: 640,
      sourceSizeBytes: 4096,
      checksumPrefix: '0123456789ab',
      sourceUrl: `/api/v1/admin/world-assets/${TREE_ASSET_ID}/versions/${TREE_VERSION_ID}/source`,
      previewUrl: `/api/v1/admin/world-assets/${TREE_ASSET_ID}/versions/${TREE_VERSION_ID}/preview`,
      thumbnailUrl: `/api/v1/admin/world-assets/${TREE_ASSET_ID}/versions/${TREE_VERSION_ID}/thumbnail`,
      render: {
        renderWidth: 256,
        renderHeight: 320,
        scale: 1,
        anchor: { x: 0.5, y: 0.5 },
        footAnchor: { x: 0.5, y: 0.9 },
        depthAnchor: { x: 0.5, y: 0.88 },
        supportedRotations: [0],
        defaultRotation: 0,
      },
      collision: { shape: 'none', blocking: false },
      interactionCompatibility: ['decorative'],
      tags: ['tree'],
      internalNotes: '',
      validationResult: null,
      editVersion: 1,
      createdByAdminId: null,
      submittedByAdminId: null,
      reviewedByAdminId: null,
      approvedByAdminId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      submittedAt: timestamp,
      reviewedAt: timestamp,
      approvedAt: timestamp,
      activatedAt: timestamp,
    },
    supportedInteractions: ['decorative'],
    supportedRotations: [0],
  };
}

function managedTreePin(): WorldDraftAssetPin {
  const candidate = managedTreeCandidate();
  return {
    assetId: TREE_ASSET_ID,
    assetKey: 'tree-pine',
    friendlyName: 'Tree Pine',
    assetType: 'tree',
    productionStatus: 'approved_production',
    activeVersionId: TREE_VERSION_ID,
    referenceCount: 4,
    pinnedVersion: {
      id: TREE_VERSION_ID,
      versionNumber: 1,
      lifecycleStatus: 'active',
      processingStatus: 'completed',
      validationStatus: 'valid',
      sourceWidth: 512,
      sourceHeight: 640,
      sourceKind: 'storage_raster',
      processedSourceAvailable: true,
      processedWidth: 512,
      processedHeight: 640,
      render: candidate.activeVersion.render,
      collision: candidate.activeVersion.collision,
    },
    latestVersion: {
      id: '9a03dc7d-1039-4841-8680-40775c9b08de',
      versionNumber: 2,
      lifecycleStatus: 'validated',
      processingStatus: 'completed',
      validationStatus: 'valid',
      sourceWidth: 480,
      sourceHeight: 600,
    },
  };
}

describe('WorldManifestCanvas', () => {
  it('does not distort bundled art when a manifest carries an unsupported rotation', () => {
    const initial = baseManifest();
    const first = initial.objects[0];
    if (first === undefined) throw new Error('Canvas fixture object is missing');
    const rotated = baseManifest({
      objects: [{ ...first, rotation: 90 }, ...initial.objects.slice(1)],
    });
    const before = JSON.stringify(rotated);
    const markup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest: rotated,
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
      }),
    );

    expect(markup).toContain('data-render-source="bundled_default"');
    expect(markup).toContain('data-authored-rotation="true"');
    expect(markup).toContain('rotate(0)');
    expect(JSON.stringify(rotated)).toBe(before);
  });

  it('paints a structured isometric workspace with valid dimensions and grid', () => {
    const markup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest: baseManifest(),
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
      }),
    );

    expect(markup).toContain('world-canvas');
    expect(markup).toContain('data-canvas-ready="true"');
    expect(markup).toContain(
      `viewBox="0 0 ${WORLD_CANVAS_VIEW_WIDTH} ${WORLD_CANVAS_VIEW_HEIGHT}"`,
    );
    expect(markup).toContain('width="100%"');
    expect(markup).toContain('height="100%"');
    expect(markup).toContain('world-canvas__sky');
    expect(markup).toContain('world-canvas__terrain--grass');
    expect(markup).toContain('world-canvas__terrain--plaza');
    expect(markup).toContain('world-canvas__grid');
    expect(markup).toContain('world-canvas__bounds');
    expect(markup).toContain('fill="#1d4638"');
    expect(markup).toContain('fill="#3f8f63"');
    expect(markup).not.toContain('data-canvas-error');
  });

  it('renders Phase 7 interaction markers and object kinds', () => {
    const markup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest: baseManifest(),
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
        zoom: 1.5,
      }),
    );

    expect(markup).toContain('data-object-kind="shop"');
    expect(markup).toContain('data-object-kind="cooking_station"');
    expect(markup).toContain('data-object-kind="crafting_station"');
    expect(markup).toContain('data-object-kind="home_entrance"');
    expect(markup).toContain('phase7-general-store-object');
    expect(markup).toContain('is-phase7');
    expect(markup).toContain('Lantern General Store');
    expect(markup).toContain('data-interaction-id="phase7-general-store"');
    expect(markup).toContain('data-interaction-type="shop"');
    expect(markup).toContain('DEV');
  });

  it('renders the Phase 7 local Lantern Square draft without mutating it', () => {
    const draft = getPhase7LocalDraft('lantern-square');
    const before = JSON.stringify(draft.manifest);
    const markup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest: draft.manifest,
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
        zoom: 1.5,
      }),
    );
    const after = JSON.stringify(draft.manifest);

    expect(before).toBe(after);
    expect(markup).toContain('data-canvas-ready="true"');
    expect(markup).toContain('world-canvas__grid');
    expect(markup).toContain('data-object-kind="shop"');
    expect(markup).toContain('data-interaction-id="phase7-general-store"');
    expect(markup).toContain('data-interaction-id="phase7-cooking-hearth"');
    expect(markup).toContain('data-interaction-id="phase7-crafting-workbench"');
    expect(markup).toContain('data-interaction-id="phase7-home-entrance"');
    expect(markup).toContain('Cooking Hearth');
    expect(markup).toContain('Crafting Workbench');
    expect(markup).toContain('Starter Cottage');
    expect(markup).toContain('Lantern General Store');
  });

  it('hides crowded labels at default zoom and keeps selection labels', () => {
    const quiet = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest: baseManifest(),
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
        zoom: 1,
      }),
    );
    const selected = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest: baseManifest(),
        selection: { layer: 'objects', id: 'cottage-amber' },
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
        zoom: 1,
      }),
    );

    expect(quiet).toContain('data-show-label="false"');
    expect(selected).toContain('data-show-label="true"');
    expect(selected).toContain('world-canvas__selection-glow');
    expect(selected).toContain('Amber Cottage');
  });

  it('honors collision, spawn, exit, and grid toggles', () => {
    const hidden = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest: baseManifest(),
        showGrid: false,
        showCollisions: false,
        showSpawns: false,
        showExits: false,
      }),
    );
    const shown = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest: baseManifest(),
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
      }),
    );

    expect(hidden).not.toContain('world-canvas__grid');
    expect(hidden).not.toContain('world-canvas__collisions');
    expect(hidden).not.toContain('world-canvas__spawns');
    expect(hidden).not.toContain('world-canvas__exits');
    expect(shown).toContain('world-canvas__grid');
    expect(shown).toContain('world-canvas__collisions');
    expect(shown).toContain('world-canvas__spawns');
    expect(shown).toContain('world-canvas__exits');
  });

  it('marks selected objects and keeps terrain paints non-black', () => {
    const markup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest: baseManifest(),
        selection: { layer: 'objects', id: 'cottage-amber' },
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
      }),
    );

    expect(markup).toContain('is-selected');
    expect(markup).toContain('world-canvas__selection-ring');
    expect(markup).toContain('world-canvas__selection-glow');
    expect(markup).toContain('fill="#c9894a"');
    expect(markup).not.toMatch(/class="world-canvas__sky[^"]*"\s+height=/u);
  });

  it('renders eligible active processed media with anchors and canonical UUIDs', () => {
    const manifest = baseManifest({
      assets: ['tree-pine'],
      objects: [
        { id: 'tree-ne', assetId: 'tree-pine', kind: 'tree', x: 20.8, y: 9.1, scale: 1.05 },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest,
        assetCandidates: [managedTreeCandidate()],
        assetPins: [managedTreePin()],
        onSelect: () => undefined,
        renderMode: 'mixed',
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
        zoom: 1.5,
      }),
    );

    expect(markup).toContain('world-canvas__managed-asset');
    expect(markup).toContain('world-canvas__asset-loading');
    expect(markup).toContain('data-media-state="loading"');
    expect(markup).toContain(`data-rendered-version-id="${TREE_VERSION_ID}"`);
    expect(markup).toContain(
      `href="/api/world-assets/${TREE_ASSET_ID}/versions/${TREE_VERSION_ID}/source"`,
    );
    expect(markup).not.toContain('/original');
    expect(markup).toContain('data-render-status="asset"');
    expect(markup).toContain('data-render-reason="pinned_asset"');
    expect(markup).toContain('aria-label="Tree Pine, tree, Exact uploaded pin"');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('data-world-canvas-label="true"');
    expect(markup).toContain('data-shadow-object-id="tree-ne"');
    expect(markup.match(/data-shadow-layer=/gu)).toHaveLength(3);
  });

  it('keeps runtime contact shadows independent from uploaded render scale and object transforms', () => {
    const scaledPin = managedTreePin();
    const manifest = baseManifest({
      assets: ['tree-pine'],
      objects: [{ id: 'tree-ne', assetId: 'tree-pine', kind: 'tree', x: 10, y: 10, scale: 1.5 }],
    });
    function renderWithAssetScale(scale: number): string {
      return renderToStaticMarkup(
        createElement(WorldManifestCanvas, {
          manifest,
          assetPins: [
            {
              ...scaledPin,
              pinnedVersion: {
                ...scaledPin.pinnedVersion,
                render: { ...scaledPin.pinnedVersion.render, scale },
              },
            },
          ],
          showGrid: false,
          showCollisions: false,
          showSpawns: false,
          showExits: false,
        }),
      );
    }
    const compactAsset = renderWithAssetScale(0.35);
    const largeAsset = renderWithAssetScale(2);
    const shadowPattern =
      /<ellipse class="world-canvas__contact-shadow"[^>]*data-shadow-object-id="tree-ne"[^>]*><\/ellipse>/u;

    expect(compactAsset.match(shadowPattern)?.[0]).toBe(largeAsset.match(shadowPattern)?.[0]);
    expect(compactAsset).toContain('transform="translate(');
    expect(compactAsset).toContain('scale(1.5) rotate(0)');
  });

  it('exposes bundled source indicators and authored directional media without moving the object', () => {
    const manifest = baseManifest({
      assets: ['fence-willow'],
      objects: [
        {
          id: 'fence-east',
          assetId: 'fence-willow',
          kind: 'fence',
          x: 8,
          y: 7,
          scale: 1,
          rotation: 90,
        },
      ],
    });
    const before = JSON.stringify(manifest.objects[0]);
    const markup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest,
        allowUnpinnedActive: true,
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
      }),
    );

    expect(markup).toContain('data-render-reason="bundled_default"');
    expect(markup).toContain('data-render-source="bundled_default"');
    expect(markup).toContain('data-bundled-asset="true"');
    expect(markup).toContain('data-authored-rotation="true"');
    expect(markup).toContain('href="/api/bundled-assets/fence-willow/source?rotation=90"');
    expect(markup).toContain('BUNDLED');
    expect(markup).toContain('rotate(0)');
    expect(JSON.stringify(manifest.objects[0])).toBe(before);
  });

  it('keeps explicit marker and collision-debug fallbacks deterministic', () => {
    const manifest = baseManifest({
      assets: ['tree-pine'],
      objects: [
        { id: 'tree-ne', assetId: 'tree-pine', kind: 'tree', x: 20.8, y: 9.1, scale: 1.05 },
      ],
    });
    const markerMarkup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest,
        assetCandidates: [managedTreeCandidate()],
        renderMode: 'markers',
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
      }),
    );
    const collisionMarkup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest,
        assetCandidates: [managedTreeCandidate()],
        renderMode: 'collision',
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
      }),
    );

    expect(markerMarkup).not.toContain('world-canvas__managed-asset');
    expect(markerMarkup).toContain('data-render-reason="marker_mode"');
    expect(collisionMarkup).toContain('data-render-reason="collision_debug_mode"');
  });

  it('renders a non-active candidate through the protected derivative and orders the reference player around its saved depth anchor', () => {
    const candidate = managedTreeCandidate().activeVersion;
    const previewVersion = {
      ...candidate,
      id: '9a03dc7d-1039-4841-8680-40775c9b08de',
      versionNumber: 2,
      lifecycleStatus: 'in_review' as const,
      sourceUrl: '/private-upstream-source',
      activatedAt: null,
    };
    const manifest = baseManifest({
      assets: ['tree-pine'],
      objects: [{ id: 'tree-ne', assetId: 'tree-pine', kind: 'tree', x: 10, y: 10, scale: 1 }],
    });
    const scenePreviewOverride: AssetSceneRenderOverride = {
      targetObjectId: 'tree-ne',
      assetId: TREE_ASSET_ID,
      assetKey: 'tree-pine',
      friendlyName: 'Tree Pine',
      version: previewVersion,
      configuration: {
        friendlyName: 'Tree Pine',
        category: 'nature',
        tags: previewVersion.tags,
        internalNotes: '',
        render: previewVersion.render,
        collision: previewVersion.collision,
        interactionCompatibility: previewVersion.interactionCompatibility,
      },
      mediaUrl: `/api/world-assets/${TREE_ASSET_ID}/versions/${previewVersion.id}/source`,
      presentation: 'candidate',
    };
    const behind = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest,
        scenePreviewOverride,
        sceneCamera: { center: { x: 10, y: 10 }, zoom: 1.25, panX: 0, panY: 0 },
        playerPosition: { x: 9, y: 9 },
        showSceneAnchors: true,
        showGrid: false,
        showCollisions: true,
        showSpawns: false,
        showExits: false,
      }),
    );
    const front = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest,
        scenePreviewOverride,
        sceneCamera: { center: { x: 10, y: 10 }, zoom: 1.25, panX: 0, panY: 0 },
        playerPosition: { x: 11, y: 11 },
        showSceneAnchors: true,
        showGrid: false,
        showCollisions: true,
        showSpawns: false,
        showExits: false,
      }),
    );

    expect(behind).toContain('data-render-reason="scene_preview_candidate"');
    expect(behind).toContain('CANDIDATE');
    expect(behind).toContain('world-canvas__asset-anchors');
    expect(behind).toContain(
      `href="/api/world-assets/${TREE_ASSET_ID}/versions/${previewVersion.id}/source"`,
    );
    expect(behind).not.toContain('/private-upstream-source');
    expect(behind.indexOf('data-world-canvas-reference-player')).toBeLessThan(
      behind.indexOf('data-render-reason="scene_preview_candidate"'),
    );
    expect(front.indexOf('data-world-canvas-reference-player')).toBeGreaterThan(
      front.indexOf('data-render-reason="scene_preview_candidate"'),
    );
  });

  it('depth-sorts the reference player against every object without a scene-preview override', () => {
    const manifest = baseManifest({
      assets: ['tree-pine'],
      objects: [{ id: 'tree-ne', assetId: 'tree-pine', kind: 'tree', x: 10, y: 10, scale: 1 }],
    });
    const behind = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest,
        playerPosition: { x: 9, y: 9 },
        showGrid: false,
        showCollisions: false,
        showSpawns: false,
        showExits: false,
      }),
    );
    const front = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest,
        playerPosition: { x: 11, y: 11 },
        showGrid: false,
        showCollisions: false,
        showSpawns: false,
        showExits: false,
      }),
    );

    expect(behind.indexOf('data-world-canvas-reference-player')).toBeLessThan(
      behind.indexOf('data-object-id="tree-ne"'),
    );
    expect(front.indexOf('data-world-canvas-reference-player')).toBeGreaterThan(
      front.indexOf('data-object-id="tree-ne"'),
    );
    expect(front).toContain('data-reference-player-height=');
    expect(front).toContain('data-reference-player-width=');
    expect(front.match(/data-reference-player-shadow-layer=/gu)).toHaveLength(3);
    expect(front).toContain('world-canvas__contact-shadow');
  });

  it('sorts equal-foot-depth shadows independently from their objects like the runtime', () => {
    const manifest = baseManifest({
      assets: ['tree-pine'],
      objects: [
        { id: 'pine-b', assetId: 'tree-pine', kind: 'tree', x: 6.5, y: 13, scale: 1 },
        { id: 'pine-c', assetId: 'tree-pine', kind: 'tree', x: 14.5, y: 5, scale: 1 },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest,
        showGrid: false,
        showCollisions: false,
        showSpawns: false,
        showExits: false,
      }),
    );
    const shadowB = markup.indexOf('data-shadow-object-id="pine-b"');
    const shadowC = markup.indexOf('data-shadow-object-id="pine-c"');
    const objectB = markup.indexOf('data-object-id="pine-b"');
    const objectC = markup.indexOf('data-object-id="pine-c"');

    expect([shadowB, shadowC, objectB, objectC].every((index) => index >= 0)).toBe(true);
    expect(shadowB).toBeLessThan(shadowC);
    expect(shadowC).toBeLessThan(objectB);
    expect(objectB).toBeLessThan(objectC);
  });

  it('surfaces a safe error panel when rendering fails', () => {
    const broken = {
      ...baseManifest(),
      width: Number.NaN,
      height: Number.NaN,
      terrain: null,
    } as unknown as AdminWorldManifest;

    const markup = renderToStaticMarkup(
      createElement(WorldManifestCanvas, {
        manifest: broken,
        showGrid: true,
        showCollisions: true,
        showSpawns: true,
        showExits: true,
      }),
    );

    expect(markup).toContain('data-canvas-error="true"');
    expect(markup).toContain('Map canvas could not render');
    expect(markup).toContain('Draft data was not modified');
  });
});
