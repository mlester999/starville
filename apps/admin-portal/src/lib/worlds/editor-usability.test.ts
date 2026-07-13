import { describe, expect, it } from 'vitest';

import type { WorldValidationResult } from './contracts';
import {
  CANVAS_PAN_DRAG_THRESHOLD_PX,
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  clampCanvasPan,
  clampCanvasZoom,
  computeFitCanvasView,
  draftPreviewAvailability,
  exceedsPanDragThreshold,
  FIT_PAD_BOTTOM,
  FIT_PAD_TOP,
  FIT_PAD_X,
  mapCornersFitInHost,
  projectMapContentBounds,
  shouldShowInteractionLabel,
  shouldShowObjectLabel,
  WORLD_EDITOR_GUIDE_STEPS,
  WORLD_EDITOR_STORAGE_KEYS,
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

  it('exposes eight guide steps and a versioned device-local guide preference key', () => {
    expect(WORLD_EDITOR_GUIDE_STEPS).toHaveLength(8);
    expect(WORLD_EDITOR_GUIDE_STEPS[0]?.title).toBe('Choose a layer');
    expect(WORLD_EDITOR_GUIDE_STEPS[7]?.title).toBe('Publish');
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
