import type { WorldValidationResult } from './contracts';

export const WORLD_EDITOR_STORAGE_KEYS = {
  layersCollapsed: 'starville.world-editor.layers-collapsed',
  inspectorCollapsed: 'starville.world-editor.inspector-collapsed',
  validationExpanded: 'starville.world-editor.validation-expanded',
  /** Device-local UI preference only — never sent to the API or database. */
  layersWidth: 'starville.world-editor.layers-width',
  /** Device-local UI preference only — never sent to the API or database. */
  inspectorWidth: 'starville.world-editor.inspector-width',
  /** Device-local only: first-time Editor Guide completion (no secrets / identities). */
  guideCompleted: 'starville.worldEditorGuide.v1.completed',
} as const;

/** Desktop sidebar width tokens (px). Local UI only. */
export const WORLD_EDITOR_PANEL_WIDTHS = {
  layersDefault: 320,
  layersMin: 260,
  layersMax: 440,
  inspectorDefault: 348,
  inspectorMin: 280,
  inspectorMax: 460,
} as const;

export const WORLD_EDITOR_GUIDE_TITLE = 'How to use the World Editor';

export const WORLD_EDITOR_GUIDE_WARNING =
  'Editing or saving a draft does not affect normal players. The live world changes only after a validated version is explicitly published.';

/** Interactive first-use walkthrough steps (highlight targets are data-tour-id values). */
export const WORLD_EDITOR_WALKTHROUGH_STEPS = [
  {
    id: 'understand',
    title: 'Understand the editor',
    body: 'This is the active world draft. Changes here are private until separately published.',
    target: 'map',
    openLayers: false,
    openInspector: false,
  },
  {
    id: 'select',
    title: 'Select an object',
    body: 'Choose an object in Layers or click its marker on the map.',
    target: 'layers',
    openLayers: true,
    openInspector: false,
  },
  {
    id: 'inspect',
    title: 'Inspect the object',
    body: 'Review its position, asset, collision, interactions, and validation details in the Inspector.',
    target: 'inspector',
    openLayers: false,
    openInspector: true,
  },
  {
    id: 'move',
    title: 'Move an object',
    body: 'Select Move, then drag or reposition the selected object using the supported controls.',
    target: 'move-tool',
    openLayers: false,
    openInspector: false,
  },
  {
    id: 'overlays',
    title: 'Use view overlays',
    body: 'Grid shows coordinates. Collision shows blocked movement. Spawns mark player entry points. Exits mark world transitions.',
    target: 'view-overlays',
    openLayers: false,
    openInspector: false,
  },
  {
    id: 'save',
    title: 'Save the draft',
    body: 'Saving stores your draft changes. It does not make them public.',
    target: 'save-draft',
    openLayers: false,
    openInspector: false,
  },
  {
    id: 'validate',
    title: 'Validate',
    body: 'Validation checks spawns, exits, collisions, references, and other blocking issues on the saved revision.',
    target: 'validate-draft',
    openLayers: false,
    openInspector: false,
  },
  {
    id: 'test',
    title: 'Preview and Game Test',
    body: 'Draft Preview inspects the saved draft. Game Test launches the real Game Client in a private test session. Neither publishes the world.',
    target: 'test-actions',
    openLayers: false,
    openInspector: false,
  },
  {
    id: 'publish-boundary',
    title: 'Publishing boundary',
    body: 'Saving, validating, previewing, and Game Testing do not publish the world. Publication is a separate protected workflow.',
    target: 'map',
    openLayers: false,
    openInspector: false,
  },
] as const;

/** Compact checklist always available from Help. */
export const WORLD_EDITOR_QUICK_START = [
  'Select an object from Layers or the map.',
  'Use Select to inspect it.',
  'Use Move to reposition it.',
  'Use Grid and Collision to verify placement.',
  'Save Draft.',
  'Validate Draft.',
  'Open Draft Preview when validation passes.',
  'Complete authenticator verification when Game Test requires it.',
  'Open in Game Test.',
  'Publish later through the separate publication workflow.',
] as const;

/** Kept for existing imports/tests; mirrors walkthrough titles and bodies. */
export const WORLD_EDITOR_GUIDE_STEPS = WORLD_EDITOR_WALKTHROUGH_STEPS.map((step) => ({
  title: step.title,
  body: step.body,
}));

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

export type DraftEditorStatusTone = 'neutral' | 'success' | 'pending' | 'error' | 'warning';

export type DraftEditorStatusKind =
  | 'saved'
  | 'unsaved'
  | 'saving'
  | 'save-failed'
  | 'validating'
  | 'validation-required'
  | 'valid'
  | 'validation-failed'
  | 'preview-unavailable'
  | 'stale-validation';

export interface DraftEditorStatus {
  readonly kind: DraftEditorStatusKind;
  readonly label: string;
  readonly message: string | null;
  readonly tone: DraftEditorStatusTone;
}

/**
 * Compact draft status for the command bar. Presentation only — does not change
 * save/validation business rules.
 */
export function resolveDraftEditorStatus(input: {
  readonly dirty: boolean;
  readonly pending: boolean;
  readonly operation: 'save' | 'validate' | null;
  readonly actionOutcome: 'idle' | 'success' | 'error';
  readonly actionMessage: string | null;
  readonly localIssueCount: number;
  readonly serverValidation: WorldValidationResult | null;
  readonly preview: DraftPreviewAvailability;
}): DraftEditorStatus {
  if (input.pending && input.operation === 'save') {
    return { kind: 'saving', label: 'Saving', message: null, tone: 'pending' };
  }
  if (input.pending && input.operation === 'validate') {
    return { kind: 'validating', label: 'Validating', message: null, tone: 'pending' };
  }
  if (input.actionOutcome === 'error' && input.operation === 'save') {
    return {
      kind: 'save-failed',
      label: 'Save failed',
      message: input.actionMessage,
      tone: 'error',
    };
  }
  if (input.dirty) {
    return {
      kind: 'unsaved',
      label: 'Unsaved changes',
      message: 'Save Draft stores edits without changing the live world.',
      tone: 'pending',
    };
  }
  if (input.localIssueCount > 0) {
    return {
      kind: 'validation-required',
      label: 'Validation required',
      message: `Fix ${input.localIssueCount} local schema issue${input.localIssueCount === 1 ? '' : 's'} before saving.`,
      tone: 'error',
    };
  }
  if (input.serverValidation === null) {
    return {
      kind: 'validation-required',
      label: 'Validation required',
      message: 'Validate the current saved revision before preview or Game Test.',
      tone: 'warning',
    };
  }
  if (input.serverValidation.valid !== true) {
    return {
      kind: 'validation-failed',
      label: 'Validation failed',
      message: 'Trusted validation found blockers. Resolve them, then validate again.',
      tone: 'error',
    };
  }
  if (input.preview.reason === 'stale-validation') {
    return {
      kind: 'stale-validation',
      label: 'Validation required',
      message:
        input.preview.message ??
        'Changes were made after validation. Validate the current saved revision again.',
      tone: 'warning',
    };
  }
  if (input.preview.canPreview) {
    return {
      kind: 'valid',
      label: 'Valid',
      message: 'Trusted validation passed for this saved revision.',
      tone: 'success',
    };
  }
  if (input.preview.message !== null) {
    return {
      kind: 'preview-unavailable',
      label: 'Preview unavailable',
      message: input.preview.message,
      tone: 'warning',
    };
  }
  return { kind: 'saved', label: 'Saved', message: null, tone: 'success' };
}

export function clampLayersWidth(px: number): number {
  if (!Number.isFinite(px)) return WORLD_EDITOR_PANEL_WIDTHS.layersDefault;
  return Math.min(
    WORLD_EDITOR_PANEL_WIDTHS.layersMax,
    Math.max(WORLD_EDITOR_PANEL_WIDTHS.layersMin, Math.round(px)),
  );
}

export function clampInspectorWidth(px: number): number {
  if (!Number.isFinite(px)) return WORLD_EDITOR_PANEL_WIDTHS.inspectorDefault;
  return Math.min(
    WORLD_EDITOR_PANEL_WIDTHS.inspectorMax,
    Math.max(WORLD_EDITOR_PANEL_WIDTHS.inspectorMin, Math.round(px)),
  );
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

export function readLocalNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalNumber(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore quota / privacy mode failures.
  }
}

export function clearLocalPanelWidths(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WORLD_EDITOR_STORAGE_KEYS.layersWidth);
    window.localStorage.removeItem(WORLD_EDITOR_STORAGE_KEYS.inspectorWidth);
  } catch {
    // Ignore storage failures.
  }
}

export type GameTestReadinessId =
  | 'draft-saved'
  | 'draft-validated'
  | 'permission'
  | 'authenticator'
  | 'service-status'
  | 'revision';

export type GameTestReadinessAction =
  | { readonly kind: 'save' }
  | { readonly kind: 'validate' }
  | { readonly kind: 'verify-authenticator' }
  | { readonly kind: 'setup-authenticator' }
  | { readonly kind: 'refresh-status' }
  | { readonly kind: 'none' };

export interface GameTestReadinessItem {
  readonly id: GameTestReadinessId;
  readonly ready: boolean;
  readonly label: string;
  readonly detail: string;
  readonly technicalDetail: string | null;
  readonly action: GameTestReadinessAction;
  readonly actionLabel: string | null;
}

/**
 * Presentation-only readiness checklist. Does not replace server-side Game Test authorization.
 */
export function buildGameTestReadiness(input: {
  readonly dirty: boolean;
  readonly validated: boolean;
  readonly canPreview: boolean;
  readonly assuranceLevel: 'aal1' | 'aal2';
  readonly authenticatorEnrolled: boolean;
  readonly checksum: string | null;
  readonly statusLoaded: boolean;
}): {
  readonly items: readonly GameTestReadinessItem[];
  readonly canOpen: boolean;
  readonly primaryBlocker: GameTestReadinessItem | null;
} {
  const items: GameTestReadinessItem[] = [
    {
      id: 'draft-saved',
      ready: !input.dirty,
      label: 'Draft saved',
      detail: input.dirty
        ? 'Save your latest changes first.'
        : 'The current editor state matches the last saved revision.',
      technicalDetail: null,
      action: input.dirty ? { kind: 'save' } : { kind: 'none' },
      actionLabel: input.dirty ? 'Save Draft' : null,
    },
    {
      id: 'draft-validated',
      ready: input.validated && !input.dirty,
      label: 'Draft validated',
      detail: input.dirty
        ? 'Save, then validate the current revision.'
        : input.validated
          ? 'Trusted validation passed for this saved revision.'
          : 'Validate the current saved revision.',
      technicalDetail: null,
      action: !input.dirty && !input.validated ? { kind: 'validate' } : { kind: 'none' },
      actionLabel: !input.dirty && !input.validated ? 'Validate Draft' : null,
    },
    {
      id: 'permission',
      ready: input.canPreview,
      label: 'Preview permission',
      detail: input.canPreview
        ? 'Your role can open private map previews.'
        : 'Your admin role does not have permission to preview maps.',
      technicalDetail: 'Requires maps.preview',
      action: { kind: 'none' },
      actionLabel: null,
    },
    {
      id: 'authenticator',
      ready: input.assuranceLevel === 'aal2',
      label: 'Authenticator verification',
      detail:
        input.assuranceLevel === 'aal2'
          ? 'Authenticator verified for this session.'
          : input.authenticatorEnrolled
            ? 'Verify with your authenticator to open Game Test. Your current admin session has not completed multi-factor authentication. This extra security step protects private world testing.'
            : 'Set up an authenticator app to continue. Multi-factor authentication is required before private Game Test sessions can open.',
      technicalDetail: 'Security level required: AAL2',
      action:
        input.assuranceLevel === 'aal2'
          ? { kind: 'none' }
          : input.authenticatorEnrolled
            ? { kind: 'verify-authenticator' }
            : { kind: 'setup-authenticator' },
      actionLabel:
        input.assuranceLevel === 'aal2'
          ? null
          : input.authenticatorEnrolled
            ? 'Verify with Authenticator'
            : 'Set Up Authenticator',
    },
    {
      id: 'service-status',
      ready: input.statusLoaded || input.assuranceLevel !== 'aal2' || !input.canPreview,
      label: 'Game Test service status',
      detail: input.statusLoaded
        ? 'Game Test status is available for this revision.'
        : input.assuranceLevel !== 'aal2' || !input.canPreview
          ? 'Status loads after permission and authenticator requirements are met.'
          : 'Game Test status could not be loaded. You can refresh after verification.',
      technicalDetail: null,
      action:
        !input.statusLoaded && input.assuranceLevel === 'aal2' && input.canPreview
          ? { kind: 'refresh-status' }
          : { kind: 'none' },
      actionLabel:
        !input.statusLoaded && input.assuranceLevel === 'aal2' && input.canPreview
          ? 'Refresh Status'
          : null,
    },
    {
      id: 'revision',
      ready:
        input.checksum !== null &&
        /^[0-9a-f]{64}$/u.test(input.checksum) &&
        input.validated &&
        !input.dirty,
      label: 'Current revision eligible',
      detail:
        input.checksum !== null && /^[0-9a-f]{64}$/u.test(input.checksum)
          ? input.validated && !input.dirty
            ? 'Exact validated revision checksum is ready.'
            : 'Revision identity exists, but save and validation must still pass.'
          : 'Reload to recover the trusted revision checksum after save and validation.',
      technicalDetail: null,
      action: { kind: 'none' },
      actionLabel: null,
    },
  ];

  // Status load failure must not block launch when other requirements pass (server rechecks).
  const blocking = items.filter((item) => item.id !== 'service-status' && !item.ready);
  const canOpen = blocking.length === 0;
  return {
    items,
    canOpen,
    primaryBlocker: blocking[0] ?? null,
  };
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
