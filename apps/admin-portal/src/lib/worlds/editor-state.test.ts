import { mapManifestSchema } from '@starville/game-core';
import { describe, expect, it } from 'vitest';

import {
  browserManifestIssues,
  commitWorldEditorManifest,
  createWorldEditorHistory,
  manifestHasUnsavedChanges,
  nextEditorIdentifier,
  redoWorldEditorManifest,
  removeWorldEditorSelection,
  undoWorldEditorManifest,
} from './editor-state';
import type { AdminWorldManifest } from './contracts';

function manifest(): AdminWorldManifest {
  return mapManifestSchema.parse({
    schemaVersion: 1,
    id: 'lantern-square',
    slug: 'lantern-square',
    name: 'Lantern Square',
    description: 'A protected test map.',
    version: 1,
    developmentArt: { temporary: true, label: 'Test development art' },
    background: { palette: 'village' },
    width: 20,
    height: 18,
    tileWidth: 96,
    tileHeight: 48,
    projectionOrigin: { x: 960, y: 96 },
    cameraBounds: { minX: 0, minY: 0, maxX: 1920, maxY: 1056 },
    safeSaveBounds: { minX: 1, minY: 1, maxX: 19, maxY: 17 },
    defaultSpawnId: 'default',
    spawns: [
      {
        id: 'default',
        x: 10,
        y: 9,
        facingDirection: 'south',
        purpose: 'default',
        enabled: true,
      },
    ],
    assets: ['lamp-star'],
    terrain: [{ id: 'ground', terrain: 'grass', x: 0, y: 0, width: 20, height: 18, order: 0 }],
    collisions: [],
    objects: [],
    interactions: [],
    exits: ['north', 'east', 'south', 'west'].map((direction, index) => ({
      id: `exit-${direction}`,
      direction,
      trigger:
        index === 0
          ? { x: 9, y: 0, width: 2, height: 1 }
          : index === 1
            ? { x: 19, y: 8, width: 1, height: 2 }
            : index === 2
              ? { x: 9, y: 17, width: 2, height: 1 }
              : { x: 0, y: 8, width: 1, height: 2 },
      destinationMapId: null,
      destinationSpawnId: null,
      enabled: false,
      transitionLabel: null,
    })),
  });
}

describe('world editor state', () => {
  it('keeps a bounded undo and redo chain for structured edits', () => {
    const initial = manifest();
    const changed = { ...initial, name: 'Lantern Square Draft' };
    const committed = commitWorldEditorManifest(createWorldEditorHistory(initial), changed);

    expect(committed.present.name).toBe('Lantern Square Draft');
    expect(undoWorldEditorManifest(committed).present.name).toBe('Lantern Square');
    expect(redoWorldEditorManifest(undoWorldEditorManifest(committed)).present.name).toBe(
      'Lantern Square Draft',
    );
    expect(manifestHasUnsavedChanges(changed, initial)).toBe(true);
  });

  it('allocates unique safe IDs and protects the default spawn from deletion', () => {
    const initial = manifest();
    expect(nextEditorIdentifier(initial, 'object')).toBe('object-1');
    expect(removeWorldEditorSelection(initial, { layer: 'spawns', id: 'default' })).toBe(initial);
  });

  it('reports browser schema issues without treating them as server publication approval', () => {
    const initial = manifest();
    const malformed = { ...initial, name: '' };
    const issues = browserManifestIssues(malformed);

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'name' })]));
  });
});
