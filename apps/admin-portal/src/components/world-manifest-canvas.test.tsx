import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getPhase7LocalDraft } from '@starville/game-content';
import { mapManifestSchema } from '@starville/game-core';

import {
  WORLD_CANVAS_VIEW_HEIGHT,
  WORLD_CANVAS_VIEW_WIDTH,
  WorldManifestCanvas,
} from './world-manifest-canvas';
import type { AdminWorldManifest } from '../lib/worlds/contracts';

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

describe('WorldManifestCanvas', () => {
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
    expect(selected).toContain('Building');
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
