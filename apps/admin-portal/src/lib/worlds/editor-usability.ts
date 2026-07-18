import type { WorldValidationResult } from './contracts';

export const WORLD_EDITOR_STORAGE_KEYS = {
  layersCollapsed: 'starville.world-editor.layers-collapsed',
  inspectorCollapsed: 'starville.world-editor.inspector-collapsed',
  validationExpanded: 'starville.world-editor.validation-expanded',
  /** Device-local only: first-time Editor Guide completion (no secrets / identities). */
  guideCompleted: 'starville.worldEditorGuide.v1.completed',
} as const;

export const WORLD_EDITOR_GUIDE_TITLE = 'How to use the World Editor';

export const WORLD_EDITOR_GUIDE_WARNING =
  'Editing or saving a draft does not affect normal players. The live world changes only after a validated version is explicitly published.';

export const WORLD_EDITOR_GUIDE_STEPS = [
  {
    title: 'Choose a layer',
    body: 'Objects: Place and edit buildings, decorations, shops, stations, and interaction objects. Collisions: Review blocking and walkable regions. Spawns: Manage safe player spawn locations. Exits: Configure transitions and destination spawns. Bounds: Review the playable map boundary.',
  },
  {
    title: 'Find an approved asset',
    body: 'Use Search Assets and Category to find an approved object. A Development Marker means the object works but still needs final production artwork.',
  },
  {
    title: 'Place or select an object',
    body: 'Select an approved asset and use Place at center. Click an existing map object to select it. Turn on Move tool before pointer or touch dragging an existing object. Pan: hold the left mouse button on empty map space and drag (or Space+drag / middle mouse). Zoom with + and −. Fit shows the complete map; Reset returns to the default fitted view.',
  },
  {
    title: 'Edit in Inspector',
    body: 'Use Inspector to modify position, type, interaction, collision, layer, and destination settings.',
  },
  {
    title: 'Save Draft',
    body: 'Save Draft stores your edits but does not change the live world.',
  },
  {
    title: 'Validate Draft',
    body: 'Validate the current saved revision. Any edits made after validation require another save and validation.',
  },
  {
    title: 'Draft Preview',
    body: 'Draft Preview opens an isolated staff-only version after trusted validation passes.',
  },
  {
    title: 'Publish',
    body: 'Publishing happens through the world version workflow. Only an explicitly published version becomes available to normal players.',
  },
] as const;

export const CANVAS_ZOOM_MIN = 0.5;
export const CANVAS_ZOOM_MAX = 3;
export const CANVAS_ZOOM_STEP = 0.15;
/** Arbitrary base CSS scale before fit; Fit Map replaces this with content-aware scale. */
export const CANVAS_ZOOM_DEFAULT = 1;
/** Pointer movement (px) before a press becomes a pan instead of a click/select. */
export const CANVAS_PAN_DRAG_THRESHOLD_PX = 5;
/** Keep at least this many pixels of map content inside the host while panning. */
export const CANVAS_PAN_EDGE_MARGIN_PX = 72;

/** Matches world-manifest-canvas viewBox and projection constants. */
export const WORLD_CANVAS_VIEW_WIDTH = 1000;
export const WORLD_CANVAS_VIEW_HEIGHT = 660;
/** Horizontal fill target (remaining space is edge padding). */
export const FIT_MAP_WIDTH_RATIO = 0.8;
/** Vertical fill target when padding is symmetric (prefer pad helpers below). */
export const FIT_MAP_HEIGHT_RATIO = 0.76;
/** Horizontal safe padding on each side (fraction of host). */
export const FIT_PAD_X = 0.1;
/** Top safe padding (fraction of host). */
export const FIT_PAD_TOP = 0.1;
/** Bottom safe padding — slightly larger for south corner / labels. */
export const FIT_PAD_BOTTOM = 0.14;

export type DraftPreviewDisabledReason =
  | 'unsaved-changes'
  | 'local-issues'
  | 'not-validated'
  | 'validation-failed'
  | 'stale-validation'
  | 'busy'
  | null;

export interface DraftPreviewAvailability {
  readonly canPreview: boolean;
  readonly reason: DraftPreviewDisabledReason;
  readonly message: string | null;
}

export function clampCanvasZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return CANVAS_ZOOM_DEFAULT;
  return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, Number(zoom.toFixed(3))));
}

export function zoomPercentage(zoom: number): number {
  return Math.round(clampCanvasZoom(zoom) * 100);
}

export function draftPreviewAvailability(input: {
  readonly dirty: boolean;
  readonly pending: boolean;
  readonly localIssueCount: number;
  readonly serverValidation: WorldValidationResult | null;
  /** Checksum of the revision that last received trusted validation success. */
  readonly validatedChecksum: string | null;
  /** Current saved revision checksum. */
  readonly currentChecksum: string | null;
}): DraftPreviewAvailability {
  if (input.pending) {
    return {
      canPreview: false,
      reason: 'busy',
      message: 'Wait for the current save or validation to finish.',
    };
  }
  if (input.dirty) {
    return {
      canPreview: false,
      reason: 'unsaved-changes',
      message: 'Save the draft before previewing. Unsaved edits invalidate the preview.',
    };
  }
  if (input.localIssueCount > 0) {
    return {
      canPreview: false,
      reason: 'local-issues',
      message: 'Fix local schema issues, then save and validate the draft.',
    };
  }
  if (input.serverValidation === null) {
    return {
      canPreview: false,
      reason: 'not-validated',
      message: 'Validate the current saved revision first.',
    };
  }
  if (input.serverValidation.valid !== true) {
    return {
      canPreview: false,
      reason: 'validation-failed',
      message: 'Trusted validation found blockers. Resolve them, then validate again.',
    };
  }
  if (
    input.validatedChecksum === null ||
    input.currentChecksum === null ||
    input.validatedChecksum !== input.currentChecksum
  ) {
    return {
      canPreview: false,
      reason: 'stale-validation',
      message: 'Changes were made after validation. Validate the current saved revision again.',
    };
  }
  return { canPreview: true, reason: null, message: null };
}

export function readLocalBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalBoolean(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    // Ignore quota / privacy mode failures.
  }
}

export function isWorldEditorGuideCompleted(): boolean {
  return readLocalBoolean(WORLD_EDITOR_STORAGE_KEYS.guideCompleted, false);
}

export function setWorldEditorGuideCompleted(completed: boolean): void {
  writeLocalBoolean(WORLD_EDITOR_STORAGE_KEYS.guideCompleted, completed);
}

export function resetWorldEditorGuidePreference(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WORLD_EDITOR_STORAGE_KEYS.guideCompleted);
  } catch {
    // Ignore storage failures; guide button remains available.
  }
}

export function shouldShowObjectLabel(input: {
  readonly isSelected: boolean;
  readonly isHovered: boolean;
  readonly isPhase7: boolean;
  readonly zoom: number;
  readonly layerActive: boolean;
}): boolean {
  if (input.isSelected || input.isHovered) return true;
  if (input.isPhase7 && input.zoom >= 1.15) return true;
  if (input.layerActive && input.zoom >= 1.45) return true;
  return false;
}

export function shouldShowInteractionLabel(input: {
  readonly isSelectedNearby: boolean;
  readonly isHovered: boolean;
  readonly zoom: number;
}): boolean {
  if (input.isSelectedNearby || input.isHovered) return true;
  return input.zoom >= 1.35;
}

export interface MapContentBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

/** Projected isometric map bounds in canvas viewBox coordinates. */
export function projectMapContentBounds(input: {
  readonly width: number;
  readonly height: number;
}): MapContentBounds {
  const scaleX = Math.min(24, 420 / Math.max(input.width, input.height, 1));
  const scaleY = scaleX * 0.5;
  const originX = WORLD_CANVAS_VIEW_WIDTH / 2;
  const originY = 42;
  const corners = [
    { x: 0, y: 0 },
    { x: input.width, y: 0 },
    { x: input.width, y: input.height },
    { x: 0, y: input.height },
  ].map(({ x, y }) => ({
    x: originX + (x - y) * scaleX,
    y: originY + (x + y) * scaleY,
  }));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

export interface FitCanvasView {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  /** How much of host width the fitted map occupies (0–1). */
  readonly occupancyWidth: number;
  /** How much of host height the fitted map occupies (0–1). */
  readonly occupancyHeight: number;
  /** Screen-space axis-aligned bounds of map content after fit (host pixels). */
  readonly fittedBounds: Readonly<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }>;
}

function mapCornersInHostPixels(input: {
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
}): ReadonlyArray<Readonly<{ x: number; y: number }>> {
  const hostW = Math.max(1, input.hostWidth);
  const hostH = Math.max(1, input.hostHeight);
  const displayScale = Math.min(hostW / WORLD_CANVAS_VIEW_WIDTH, hostH / WORLD_CANVAS_VIEW_HEIGHT);
  const offsetX = (hostW - WORLD_CANVAS_VIEW_WIDTH * displayScale) / 2;
  const offsetY = (hostH - WORLD_CANVAS_VIEW_HEIGHT * displayScale) / 2;
  const content = projectMapContentBounds({
    width: input.mapWidth,
    height: input.mapHeight,
  });
  return [
    { x: content.minX, y: content.minY },
    { x: content.maxX, y: content.minY },
    { x: content.maxX, y: content.maxY },
    { x: content.minX, y: content.maxY },
  ].map((point) => ({
    x: offsetX + point.x * displayScale,
    y: offsetY + point.y * displayScale,
  }));
}

/**
 * Project a host-pixel point through CSS `translate(pan) scale(zoom)` with center origin.
 */
export function transformHostPoint(
  point: Readonly<{ x: number; y: number }>,
  host: Readonly<{ width: number; height: number }>,
  view: Readonly<{ zoom: number; panX: number; panY: number }>,
): Readonly<{ x: number; y: number }> {
  const centerX = host.width / 2;
  const centerY = host.height / 2;
  return {
    x: centerX + (point.x - centerX) * view.zoom + view.panX,
    y: centerY + (point.y - centerY) * view.zoom + view.panY,
  };
}

/**
 * Clamp pan so a practical portion of the projected map remains visible in the host.
 * Viewport-only — does not mutate draft coordinates.
 */
export function clampCanvasPan(input: {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly marginPx?: number;
}): Readonly<{ x: number; y: number }> {
  const hostW = Math.max(1, input.hostWidth);
  const hostH = Math.max(1, input.hostHeight);
  const zoom = clampCanvasZoom(input.zoom);
  const margin = input.marginPx ?? CANVAS_PAN_EDGE_MARGIN_PX;
  const corners = mapCornersInHostPixels({
    hostWidth: hostW,
    hostHeight: hostH,
    mapWidth: input.mapWidth,
    mapHeight: input.mapHeight,
  });
  const host = { width: hostW, height: hostH };
  const base = corners.map((corner) =>
    transformHostPoint(corner, host, { zoom, panX: 0, panY: 0 }),
  );
  const baseMinX = Math.min(...base.map((point) => point.x));
  const baseMaxX = Math.max(...base.map((point) => point.x));
  const baseMinY = Math.min(...base.map((point) => point.y));
  const baseMaxY = Math.max(...base.map((point) => point.y));

  // After pan: mapped = base + pan. Keep AABB intersecting host with margin.
  const minPanX = margin - baseMaxX;
  const maxPanX = hostW - margin - baseMinX;
  const minPanY = margin - baseMaxY;
  const maxPanY = hostH - margin - baseMinY;

  const clampAxis = (value: number, min: number, max: number): number => {
    if (min > max) return (min + max) / 2;
    return Math.min(max, Math.max(min, value));
  };

  return {
    x: clampAxis(input.panX, minPanX, maxPanX),
    y: clampAxis(input.panY, minPanY, maxPanY),
  };
}

export function exceedsPanDragThreshold(
  dx: number,
  dy: number,
  thresholdPx: number = CANVAS_PAN_DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(dx, dy) >= thresholdPx;
}

/**
 * True when every map-bound corner lies inside the host with the requested padding.
 */
export function mapCornersFitInHost(input: {
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly padX?: number;
  readonly padTop?: number;
  readonly padBottom?: number;
  readonly epsilon?: number;
}): boolean {
  const padX = input.padX ?? FIT_PAD_X;
  const padTop = input.padTop ?? FIT_PAD_TOP;
  const padBottom = input.padBottom ?? FIT_PAD_BOTTOM;
  const epsilon = input.epsilon ?? 0.75;
  const host = { width: input.hostWidth, height: input.hostHeight };
  const corners = mapCornersInHostPixels(input);
  const minX = host.width * padX - epsilon;
  const maxX = host.width * (1 - padX) + epsilon;
  const minY = host.height * padTop - epsilon;
  const maxY = host.height * (1 - padBottom) + epsilon;
  return corners.every((corner) => {
    const mapped = transformHostPoint(corner, host, input);
    return mapped.x >= minX && mapped.x <= maxX && mapped.y >= minY && mapped.y <= maxY;
  });
}

/**
 * Scale and pan so all projected map-bound corners fit inside the host with safe padding.
 * Uses the same viewBox projection as WorldManifestCanvas; does not mutate draft data.
 *
 * Padding is slightly larger on the bottom so the south isometric corner stays clear of
 * labels and the validation dock layout edge.
 */
export function computeFitCanvasView(input: {
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly padX?: number;
  readonly padTop?: number;
  readonly padBottom?: number;
  /** @deprecated Prefer padX — kept for older call sites/tests. */
  readonly targetWidthRatio?: number;
  /** @deprecated Prefer padTop/padBottom — kept for older call sites/tests. */
  readonly targetHeightRatio?: number;
}): FitCanvasView {
  const hostW = Math.max(120, input.hostWidth);
  const hostH = Math.max(120, input.hostHeight);
  const content = projectMapContentBounds({
    width: input.mapWidth,
    height: input.mapHeight,
  });
  const displayScale = Math.min(hostW / WORLD_CANVAS_VIEW_WIDTH, hostH / WORLD_CANVAS_VIEW_HEIGHT);
  const contentDisplayW = Math.max(1, content.width * displayScale);
  const contentDisplayH = Math.max(1, content.height * displayScale);

  const padX =
    input.padX ??
    (input.targetWidthRatio === undefined ? FIT_PAD_X : (1 - input.targetWidthRatio) / 2);
  const padTop =
    input.padTop ??
    (input.targetHeightRatio === undefined ? FIT_PAD_TOP : (1 - input.targetHeightRatio) / 2);
  const padBottom =
    input.padBottom ??
    (input.targetHeightRatio === undefined ? FIT_PAD_BOTTOM : (1 - input.targetHeightRatio) / 2);

  const availW = hostW * Math.max(0.4, 1 - padX * 2);
  const availH = hostH * Math.max(0.4, 1 - padTop - padBottom);
  const rawZoom = Math.min(availW / contentDisplayW, availH / contentDisplayH);
  const zoom = clampCanvasZoom(rawZoom);

  const offsetX = (hostW - WORLD_CANVAS_VIEW_WIDTH * displayScale) / 2;
  const offsetY = (hostH - WORLD_CANVAS_VIEW_HEIGHT * displayScale) / 2;
  const contentScreenX = offsetX + content.centerX * displayScale;
  const contentScreenY = offsetY + content.centerY * displayScale;
  const hostCenterX = hostW / 2;
  const hostCenterY = hostH / 2;
  // Asymmetric vertical padding: pin content center in the padded visual box, not raw host center.
  const visualCenterX = hostW / 2;
  const visualCenterY = hostH * padTop + availH / 2;
  const panX = visualCenterX - hostCenterX - (contentScreenX - hostCenterX) * zoom;
  const panY = visualCenterY - hostCenterY - (contentScreenY - hostCenterY) * zoom;

  const corners = mapCornersInHostPixels({
    hostWidth: hostW,
    hostHeight: hostH,
    mapWidth: input.mapWidth,
    mapHeight: input.mapHeight,
  }).map((corner) =>
    transformHostPoint(corner, { width: hostW, height: hostH }, { zoom, panX, panY }),
  );
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);

  return {
    zoom,
    panX,
    panY,
    occupancyWidth: (contentDisplayW * zoom) / hostW,
    occupancyHeight: (contentDisplayH * zoom) / hostH,
    fittedBounds: {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    },
  };
}
