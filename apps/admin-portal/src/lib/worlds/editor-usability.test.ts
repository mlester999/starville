import { describe, expect, it } from 'vitest';

import type { WorldValidationResult } from './contracts';
import {
  CANVAS_PAN_DRAG_THRESHOLD_PX,
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  clampCanvasPan,
  clampCanvasZoom,
  clampInspectorWidth,
  clampLayersWidth,
  computeFitCanvasView,
  draftPreviewAvailability,
  exceedsPanDragThreshold,
  FIT_PAD_BOTTOM,
  FIT_PAD_TOP,
  FIT_PAD_X,
  mapCornersFitInHost,
  projectMapContentBounds,
  buildGameTestReadiness,
  resolveDraftEditorStatus,
  shouldShowInteractionLabel,
  shouldShowObjectLabel,
  WORLD_EDITOR_GUIDE_STEPS,
  WORLD_EDITOR_PANEL_WIDTHS,
  WORLD_EDITOR_QUICK_START,
  WORLD_EDITOR_STORAGE_KEYS,
  WORLD_EDITOR_WALKTHROUGH_STEPS,
  zoomPercentage,
} from './editor-usability';

function validation(valid: boolean): WorldValidationResult {
  return {
    valid,
    checkedAt: '2026-01-01T00:00:00.000Z',
    errors: [],
    warnings: [],
  };
}

describe('world editor usability helpers', () => {
  it('clamps canvas zoom and reports percentages', () => {
    expect(clampCanvasZoom(0.1)).toBe(CANVAS_ZOOM_MIN);
    expect(clampCanvasZoom(9)).toBe(CANVAS_ZOOM_MAX);
    expect(clampCanvasZoom(1.2)).toBe(1.2);
    expect(zoomPercentage(1)).toBe(100);
    expect(zoomPercentage(1.5)).toBe(150);
  });

  it('enables draft preview only for current saved trusted validation', () => {
    const valid = validation(true);
    expect(
      draftPreviewAvailability({
        dirty: false,
        pending: false,
        localIssueCount: 0,
        serverValidation: valid,
        validatedChecksum: 'abc',
        currentChecksum: 'abc',
      }).canPreview,
    ).toBe(true);

    expect(
      draftPreviewAvailability({
        dirty: true,
        pending: false,
        localIssueCount: 0,
        serverValidation: valid,
        validatedChecksum: 'abc',
        currentChecksum: 'abc',
      }).reason,
    ).toBe('unsaved-changes');

    expect(
      draftPreviewAvailability({
        dirty: false,
        pending: false,
        localIssueCount: 0,
        serverValidation: valid,
        validatedChecksum: 'old',
        currentChecksum: 'new',
      }).reason,
    ).toBe('stale-validation');

    expect(
      draftPreviewAvailability({
        dirty: false,
        pending: false,
        localIssueCount: 0,
        serverValidation: null,
        validatedChecksum: null,
        currentChecksum: 'abc',
      }).reason,
    ).toBe('not-validated');

    expect(
      draftPreviewAvailability({
        dirty: false,
        pending: false,
        localIssueCount: 0,
        serverValidation: validation(false),
        validatedChecksum: null,
        currentChecksum: 'abc',
      }).reason,
    ).toBe('validation-failed');
  });

  it('clamps resizable panel widths to safe local UI bounds', () => {
    expect(clampLayersWidth(100)).toBe(WORLD_EDITOR_PANEL_WIDTHS.layersMin);
    expect(clampLayersWidth(900)).toBe(WORLD_EDITOR_PANEL_WIDTHS.layersMax);
    expect(clampLayersWidth(320)).toBe(320);
    expect(clampInspectorWidth(100)).toBe(WORLD_EDITOR_PANEL_WIDTHS.inspectorMin);
    expect(clampInspectorWidth(900)).toBe(WORLD_EDITOR_PANEL_WIDTHS.inspectorMax);
    expect(clampInspectorWidth(348)).toBe(348);
    expect(WORLD_EDITOR_STORAGE_KEYS.layersWidth).toContain('layers-width');
    expect(WORLD_EDITOR_STORAGE_KEYS.inspectorWidth).toContain('inspector-width');
  });

  it('resolves compact draft status labels for command-bar presentation', () => {
    const previewReady = draftPreviewAvailability({
      dirty: false,
      pending: false,
      localIssueCount: 0,
      serverValidation: validation(true),
      validatedChecksum: 'abc',
      currentChecksum: 'abc',
    });

    expect(
      resolveDraftEditorStatus({
        dirty: true,
        pending: false,
        operation: null,
        actionOutcome: 'idle',
        actionMessage: null,
        localIssueCount: 0,
        serverValidation: null,
        preview: previewReady,
      }).kind,
    ).toBe('unsaved');

    expect(
      resolveDraftEditorStatus({
        dirty: false,
        pending: true,
        operation: 'save',
        actionOutcome: 'idle',
        actionMessage: null,
        localIssueCount: 0,
        serverValidation: null,
        preview: previewReady,
      }).kind,
    ).toBe('saving');

    expect(
      resolveDraftEditorStatus({
        dirty: false,
        pending: false,
        operation: null,
        actionOutcome: 'idle',
        actionMessage: null,
        localIssueCount: 0,
        serverValidation: validation(true),
        preview: previewReady,
      }).kind,
    ).toBe('valid');

    const stalePreview = draftPreviewAvailability({
      dirty: false,
      pending: false,
      localIssueCount: 0,
      serverValidation: validation(true),
      validatedChecksum: 'old',
      currentChecksum: 'new',
    });
    expect(
      resolveDraftEditorStatus({
        dirty: false,
        pending: false,
        operation: null,
        actionOutcome: 'idle',
        actionMessage: null,
        localIssueCount: 0,
        serverValidation: validation(true),
        preview: stalePreview,
      }).message,
    ).toContain('Changes were made after validation');
  });

  it('builds an actionable Game Test readiness checklist without bypassing AAL2', () => {
    const blocked = buildGameTestReadiness({
      dirty: true,
      validated: false,
      canPreview: false,
      assuranceLevel: 'aal1',
      authenticatorEnrolled: true,
      checksum: null,
      statusLoaded: false,
    });
    expect(blocked.canOpen).toBe(false);
    expect(blocked.items.find((item) => item.id === 'draft-saved')?.ready).toBe(false);
    expect(blocked.items.find((item) => item.id === 'permission')?.technicalDetail).toContain(
      'maps.preview',
    );
    expect(blocked.items.find((item) => item.id === 'authenticator')?.action.kind).toBe(
      'verify-authenticator',
    );
    expect(blocked.items.find((item) => item.id === 'authenticator')?.detail).toContain(
      'multi-factor authentication',
    );
    expect(blocked.items.find((item) => item.id === 'authenticator')?.technicalDetail).toContain(
      'AAL2',
    );

    const ready = buildGameTestReadiness({
      dirty: false,
      validated: true,
      canPreview: true,
      assuranceLevel: 'aal2',
      authenticatorEnrolled: true,
      checksum: 'a'.repeat(64),
      statusLoaded: true,
    });
    expect(ready.canOpen).toBe(true);
    expect(ready.primaryBlocker).toBeNull();
    expect(WORLD_EDITOR_WALKTHROUGH_STEPS).toHaveLength(9);
    expect(WORLD_EDITOR_QUICK_START.length).toBeGreaterThanOrEqual(8);
  });

  it('fits map content so all projected corners stay inside the host with safe padding', () => {
    const bounds = projectMapContentBounds({ width: 24, height: 20 });
    expect(bounds.width).toBeGreaterThan(100);
    expect(bounds.height).toBeGreaterThan(100);

    const hosts = [
      { hostWidth: 900, hostHeight: 600 },
      { hostWidth: 720, hostHeight: 420 },
      { hostWidth: 1100, hostHeight: 500 },
      { hostWidth: 1280, hostHeight: 700 },
    ] as const;

    for (const host of hosts) {
      const fitted = computeFitCanvasView({
        ...host,
        mapWidth: 24,
        mapHeight: 20,
      });
      expect(fitted.zoom).toBeGreaterThan(0);
      expect(fitted.zoom).toBeLessThanOrEqual(CANVAS_ZOOM_MAX);
      expect(fitted.occupancyWidth).toBeLessThanOrEqual(1 - FIT_PAD_X * 2 + 0.02);
      expect(fitted.occupancyHeight).toBeLessThanOrEqual(1 - FIT_PAD_TOP - FIT_PAD_BOTTOM + 0.02);
      expect(
        mapCornersFitInHost({
          ...host,
          mapWidth: 24,
          mapHeight: 20,
          zoom: fitted.zoom,
          panX: fitted.panX,
          panY: fitted.panY,
        }),
      ).toBe(true);
      // South corner (maxY) stays above the bottom padding band.
      expect(fitted.fittedBounds.maxY).toBeLessThanOrEqual(
        host.hostHeight * (1 - FIT_PAD_BOTTOM) + 1,
      );
      expect(fitted.fittedBounds.minY).toBeGreaterThanOrEqual(host.hostHeight * FIT_PAD_TOP - 1);
    }

    const tinyHost = computeFitCanvasView({
      hostWidth: 320,
      hostHeight: 240,
      mapWidth: 24,
      mapHeight: 20,
    });
    expect(tinyHost.zoom).toBeGreaterThanOrEqual(CANVAS_ZOOM_MIN);
    expect(
      mapCornersFitInHost({
        hostWidth: 320,
        hostHeight: 240,
        mapWidth: 24,
        mapHeight: 20,
        zoom: tinyHost.zoom,
        panX: tinyHost.panX,
        panY: tinyHost.panY,
      }),
    ).toBe(true);
  });

  it('clamps pan so the map cannot be dragged completely off-screen', () => {
    const far = clampCanvasPan({
      panX: 50_000,
      panY: -50_000,
      zoom: 2.05,
      hostWidth: 900,
      hostHeight: 560,
      mapWidth: 24,
      mapHeight: 20,
    });
    expect(Math.abs(far.x)).toBeLessThan(20_000);
    expect(Math.abs(far.y)).toBeLessThan(20_000);
    expect(exceedsPanDragThreshold(CANVAS_PAN_DRAG_THRESHOLD_PX, 0)).toBe(true);
    expect(exceedsPanDragThreshold(CANVAS_PAN_DRAG_THRESHOLD_PX - 1, 0)).toBe(false);
  });

  it('exposes nine walkthrough steps and a versioned device-local guide preference key', () => {
    expect(WORLD_EDITOR_GUIDE_STEPS).toHaveLength(9);
    expect(WORLD_EDITOR_GUIDE_STEPS[0]?.title).toBe('Understand the editor');
    expect(WORLD_EDITOR_GUIDE_STEPS[8]?.title).toBe('Publishing boundary');
    expect(WORLD_EDITOR_STORAGE_KEYS.guideCompleted).toBe(
      'starville.worldEditorGuide.v1.completed',
    );
  });

  it('limits object and interaction labels to selection, hover, or zoom thresholds', () => {
    expect(
      shouldShowObjectLabel({
        isSelected: false,
        isHovered: false,
        isPhase7: true,
        zoom: 1,
        layerActive: true,
      }),
    ).toBe(false);
    expect(
      shouldShowObjectLabel({
        isSelected: true,
        isHovered: false,
        isPhase7: false,
        zoom: 1,
        layerActive: false,
      }),
    ).toBe(true);
    expect(
      shouldShowObjectLabel({
        isSelected: false,
        isHovered: false,
        isPhase7: true,
        zoom: 1.2,
        layerActive: false,
      }),
    ).toBe(true);
    expect(
      shouldShowInteractionLabel({
        isSelectedNearby: false,
        isHovered: false,
        zoom: 1,
      }),
    ).toBe(false);
    expect(
      shouldShowInteractionLabel({
        isSelectedNearby: true,
        isHovered: false,
        zoom: 1,
      }),
    ).toBe(true);
  });
});
