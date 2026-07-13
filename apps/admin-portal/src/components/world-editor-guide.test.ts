import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  WORLD_EDITOR_GUIDE_STEPS,
  WORLD_EDITOR_GUIDE_TITLE,
  WORLD_EDITOR_GUIDE_WARNING,
  WORLD_EDITOR_STORAGE_KEYS,
} from '../lib/worlds/editor-usability';

const guide = readFileSync(new URL('./world-editor-guide.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('./world-editor.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('world editor guide visibility', () => {
  it('always renders a permanent Editor Guide entry point in the toolbar and mobile actions', () => {
    expect(editor).toContain('data-editor-guide-trigger="true"');
    expect(editor).toContain('data-editor-guide-trigger-mobile="true"');
    expect(editor).toContain('Editor Guide');
    expect(editor).toContain('WorldEditorGuide');
    expect(editor).toContain('setGuideOpen(true)');
    expect(editor).toContain('isWorldEditorGuideCompleted');
    expect(editor).toContain('if (!isWorldEditorGuideCompleted()) setGuideOpen(true)');
  });

  it('presents the complete eight-step quick start and live-world warning', () => {
    expect(WORLD_EDITOR_GUIDE_STEPS).toHaveLength(8);
    expect(WORLD_EDITOR_GUIDE_TITLE).toBe('How to use the World Editor');
    expect(WORLD_EDITOR_GUIDE_WARNING).toContain('does not affect normal players');
    expect(WORLD_EDITOR_GUIDE_WARNING).toContain('explicitly published');
    expect(WORLD_EDITOR_GUIDE_STEPS.map((step) => step.title)).toEqual([
      'Choose a layer',
      'Find an approved asset',
      'Place or select an object',
      'Edit in Inspector',
      'Save Draft',
      'Validate Draft',
      'Draft Preview',
      'Publish',
    ]);
    expect(guide).toContain('WORLD_EDITOR_GUIDE_STEPS');
    expect(guide).toContain('WORLD_EDITOR_GUIDE_WARNING');
    expect(guide).toContain('Got it');
    expect(guide).toContain('Reset Guide');
    expect(guide).toContain('data-world-editor-guide="true"');
  });

  it('stores only a harmless device-local completion preference', () => {
    expect(WORLD_EDITOR_STORAGE_KEYS.guideCompleted).toBe(
      'starville.worldEditorGuide.v1.completed',
    );
    expect(guide).toContain('setWorldEditorGuideCompleted(true)');
    expect(guide).toContain('resetWorldEditorGuidePreference');
    expect(guide).toContain('triggerRef.current?.focus()');
    expect(guide).toContain("event.key === 'Escape'");
    expect(guide).toContain('focusTrapTarget');
  });

  it('styles a scrollable guide dialog with sticky footer actions', () => {
    expect(styles).toContain('.world-editor-guide');
    expect(styles).toContain('.world-editor-guide-trigger');
    expect(styles).toContain('.world-editor-guide__warning');
    expect(styles).toContain('.world-editor-guide__steps');
    expect(styles).toContain('.world-editor-guide__footer');
  });

  it('documents map panning in the place-or-select guide step', () => {
    const placeStep = WORLD_EDITOR_GUIDE_STEPS.find(
      (step) => step.title === 'Place or select an object',
    );
    expect(placeStep?.body).toContain('hold the left mouse button');
    expect(placeStep?.body).toContain('Space+drag');
    expect(placeStep?.body).toContain('middle mouse');
    expect(placeStep?.body).toContain('Fit shows the complete map');
  });

  it('keeps contextual tooltips on core editor actions', () => {
    expect(editor).toContain('title="Toggle the isometric grid overlay"');
    expect(editor).toContain('title="Toggle collision footprints on the map"');
    expect(editor).toContain('title="Toggle spawn point markers on the map"');
    expect(editor).toContain('title="Toggle exit regions and transitions on the map"');
    expect(editor).toContain('title="Save Draft stores edits without changing the live world"');
    expect(editor).toContain(
      'title="Validate Draft runs trusted checks on the current saved revision"',
    );
    expect(editor).toContain('title="Fit map to the canvas (0)"');
    expect(editor).toContain('title="Reset map view to the fitted default"');
    expect(editor).toContain('title="Open Layers and approved assets"');
    expect(editor).toContain('title="Open the property Inspector"');
  });
});
