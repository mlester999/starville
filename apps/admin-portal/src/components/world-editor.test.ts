import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editor = readFileSync(new URL('./world-editor.tsx', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('./world-manifest-canvas.tsx', import.meta.url), 'utf8');
const scroll = readFileSync(new URL('./editor-scroll-region.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('world editor shell and presentation', () => {
  it('implements a three-panel viewport shell with docked validation', () => {
    expect(editor).toContain('data-world-editor-shell="true"');
    expect(editor).toContain('world-editor-toolbar');
    expect(editor).toContain('world-editor-layout');
    expect(editor).toContain('world-editor-layers');
    expect(editor).toContain('world-editor-stage');
    expect(editor).toContain('world-editor-inspector');
    expect(editor).toContain('data-validation-panel="true"');
    expect(editor).toContain('data-canvas-host="true"');
    expect(editor).toContain('world-editor-drawer');
    expect(editor).toContain("mobilePanel === 'assets'");
    expect(editor).toContain("mobilePanel === 'inspector'");
  });

  it('keeps toolbar actions and view toggles without raw checkbox-only controls', () => {
    expect(editor).toContain('Save draft');
    expect(editor).toContain('Validate draft');
    expect(editor).toContain('Draft preview');
    expect(editor).toContain('Undo');
    expect(editor).toContain('Redo');
    expect(editor).toContain('world-editor-toggle');
    expect(editor).toContain('label="Grid"');
    expect(editor).toContain('label="Collision"');
    expect(editor).toContain('label="Spawns"');
    expect(editor).toContain('label="Exits"');
    expect(editor).toContain('Editor Guide');
    expect(editor).toContain('data-editor-guide-trigger="true"');
    expect(editor).toContain('WorldEditorGuide');
  });

  it('provides a searchable asset palette with cards and development badges', () => {
    expect(editor).toContain('asset-palette');
    expect(editor).toContain('asset-card');
    expect(editor).toContain('Search approved assets');
    expect(editor).toContain('Asset category');
    expect(editor).toContain('Dev marker');
    expect(editor).toContain('humanizeKey');
    expect(editor).toContain('filteredAssets');
    expect(editor).toContain('Clear filters');
    expect(editor).toContain('Asset production status');
    expect(editor).toContain('Asset interaction compatibility');
    expect(editor).toContain('asset.supportedInteractions');
    expect(editor).toContain('asset.supportedRotations');
  });

  it('keeps property inspector empty state and structured fields', () => {
    expect(editor).toContain('Nothing selected');
    expect(editor).toContain('World Y / depth base');
    expect(editor).toContain('Facing direction');
    expect(editor).toContain('Destination map ID');
    expect(editor).toContain('editor-empty-inspector');
    expect(editor).toContain('InspectorSection');
    expect(editor).toContain('title="Identity"');
    expect(editor).toContain('title="Position"');
    expect(editor).not.toMatch(/<textarea[^>]+name=["'](?:json|manifest)/u);
  });

  it('preserves save and validate action wiring', () => {
    expect(editor).toContain('saveWorldDraftAction');
    expect(editor).toContain('validateWorldDraftAction');
    expect(editor).toContain("formData.set('manifest', JSON.stringify(manifest))");
    expect(editor).toContain("formData.set('confirmed', 'yes')");
    expect(editor).toContain('unsaved world changes');
  });

  it('docks collapsible validation with error/warning counts and focus actions', () => {
    expect(editor).toContain('world-validation-panel');
    expect(editor).toContain('Local schema clear');
    expect(editor).toContain('No trusted result yet');
    expect(editor).toContain('Trusted validation passed');
    expect(editor).toContain('focusValidationTarget');
    expect(editor).toContain('validation-focus');
    expect(editor).toContain('setValidationExpandedPersist');
    expect(editor).toContain('data-validation-expanded');
  });

  it('makes Layers and Inspector independently scrollable with always-visible custom scrollbars', () => {
    expect(editor).toContain('EditorScrollRegion');
    expect(editor).toContain('data-scrollable-panel="layers"');
    expect(editor).toContain('data-scrollable-panel="inspector"');
    expect(editor).toContain('world-editor-panel__end-spacer');
    expect(scroll).toContain('AdminScrollArea');
    expect(styles).toContain('.admin-scroll-area__track');
    expect(styles).toContain('.admin-scroll-area__thumb');
    expect(styles).toContain('overflow-y: auto');
    expect(styles).not.toContain('.editor-scroll-region__edge-btn');
    expect(styles).not.toContain('.editor-scroll-region__status');
    expect(styles).not.toContain('.editor-scroll-region__fade');
  });

  it('supports panel collapse, content-aware fit, canvas zoom/pan, and preview reasons', () => {
    expect(editor).toContain('setLayersCollapsedPersist');
    expect(editor).toContain('setInspectorCollapsedPersist');
    expect(editor).toContain('world-canvas-controls');
    expect(editor).toContain('aria-label="Zoom in"');
    expect(editor).toContain('aria-label="Zoom out"');
    expect(editor).toContain('aria-label="Fit map in view"');
    expect(editor).toContain('aria-label="Reset canvas view"');
    expect(editor).toContain('data-canvas-transform');
    expect(editor).toContain('computeFitCanvasView');
    expect(editor).toContain('applyFitCanvas');
    expect(editor).toContain('scheduleFitCanvas');
    expect(editor).toContain('host.clientWidth');
    expect(editor).toContain('host.clientHeight');
    expect(editor).toContain('userAdjustedView');
    expect(editor).toContain('draftPreviewAvailability');
    expect(editor).toContain('world-editor-preview-reason');
    expect(editor).toContain('validatedChecksum');
    expect(editor).toContain('canvasZoom');
    expect(editor).toContain('canvasPan');
    expect(editor).toContain('useState(false)'); // validation starts collapsed by default
  });

  it('enables left-drag map panning with threshold, limits, and selection suppression', () => {
    expect(editor).toContain('CANVAS_PAN_DRAG_THRESHOLD_PX');
    expect(editor).toContain('exceedsPanDragThreshold');
    expect(editor).toContain('clampCanvasPan');
    expect(editor).toContain('scheduleLivePan');
    expect(editor).toContain('suppressNextSelectRef');
    expect(editor).toContain('setPointerCapture');
    expect(editor).toContain('onLostPointerCapture');
    expect(editor).toContain('is-panning');
    expect(editor).toContain('event.button === 0');
    expect(editor).toContain('event.button === 1');
    expect(editor).toContain('spaceHeldRef');
    expect(editor).toContain('hold left mouse on empty map space and drag');
    expect(editor).toContain('ArrowLeft');
    // Must not create history from pan — only commitWorldEditorManifest mutates history.
    expect(editor).toContain('commitWorldEditorManifest');
    expect(editor).not.toContain('commitWorldEditorManifest(current, canvasPan');
  });

  it('keeps the validation dock as a layout sibling so Fit uses the unobstructed canvas host', () => {
    expect(editor).toContain('world-validation-panel');
    expect(editor).toContain('data-validation-panel="true"');
    expect(editor).toContain('world-editor-layout');
    expect(editor).toContain('data-canvas-host="true"');
    // Dock expand/collapse and panel collapse both re-run scheduleFitCanvas.
    expect(editor).toContain('validationExpanded');
    expect(editor).toContain('layersCollapsed');
    expect(editor).toContain('inspectorCollapsed');
    expect(styles).toContain('flex-shrink: 0');
    expect(styles).toContain('/* Must share remaining layout height with the validation dock');
  });

  it('styles the editor shell and canvas so the workspace is not a blank black void', () => {
    expect(styles).toContain('.world-editor-page');
    expect(styles).toContain('.world-editor-layout');
    expect(styles).toContain('.world-editor-stage__canvas-wrap');
    expect(styles).toContain('.world-canvas');
    expect(styles).toContain('height: calc(100dvh - 8.4rem)');
    expect(styles).toContain('.asset-palette');
    expect(styles).toContain('.world-validation-panel');
    expect(styles).toContain('.world-canvas-controls');
    expect(styles).toContain('@media (max-width: 1100px)');
    expect(styles).toContain('@media (max-width: 820px)');
    expect(styles).toContain('overflow: hidden');
  });

  it('gives the canvas presentation fills, label declutter, and a rendering error fallback', () => {
    expect(canvas).toContain('fill={skyFill}');
    expect(canvas).toContain('fill={TERRAIN_FILLS[area.terrain]}');
    expect(canvas).toContain('stroke="rgba(247, 239, 217, 0.22)"');
    expect(canvas).toContain('world-canvas__bounds');
    expect(canvas).toContain('data-canvas-error');
    expect(canvas).toContain('Map canvas could not render');
    expect(canvas).toContain('is-phase7');
    expect(canvas).toContain('shouldShowObjectLabel');
    expect(canvas).toContain('world-canvas__selection-glow');
    expect(canvas).toContain('width="100%"');
    expect(canvas).toContain('height="100%"');
  });
});
