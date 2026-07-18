import { CANVAS_PAN_DRAG_THRESHOLD_PX, exceedsPanDragThreshold } from './editor-usability';

export type CanvasPointerType = 'mouse' | 'pen' | 'touch';

export interface CanvasPointerGesture {
  readonly pointerId: number;
  readonly pointerType: CanvasPointerType;
  readonly originX: number;
  readonly originY: number;
  readonly startPanX: number;
  readonly startPanY: number;
  readonly startedOnInteractiveTarget: boolean;
  readonly forcePan: boolean;
  readonly moved: boolean;
}

export interface CanvasPointerMovement {
  readonly gesture: CanvasPointerGesture;
  readonly dx: number;
  readonly dy: number;
  readonly shouldPan: boolean;
  readonly startedPan: boolean;
}

/**
 * Central click-versus-pan gesture model. Secondary/non-primary contacts are ignored so a
 * multi-touch contact cannot select or move a world object accidentally.
 */
export function beginCanvasPointerGesture(input: {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly panX: number;
  readonly panY: number;
  readonly startedOnInteractiveTarget: boolean;
  readonly forcePan: boolean;
}): CanvasPointerGesture | null {
  if (!input.isPrimary || (input.button !== 0 && input.button !== 1)) return null;
  const pointerType: CanvasPointerType =
    input.pointerType === 'touch' || input.pointerType === 'pen' ? input.pointerType : 'mouse';
  return {
    pointerId: input.pointerId,
    pointerType,
    originX: input.clientX,
    originY: input.clientY,
    startPanX: input.panX,
    startPanY: input.panY,
    startedOnInteractiveTarget: input.startedOnInteractiveTarget,
    forcePan: input.forcePan,
    moved: false,
  };
}

export function moveCanvasPointerGesture(
  current: CanvasPointerGesture,
  clientX: number,
  clientY: number,
  thresholdPx: number = CANVAS_PAN_DRAG_THRESHOLD_PX,
): CanvasPointerMovement {
  const dx = clientX - current.originX;
  const dy = clientY - current.originY;
  const shouldPan =
    current.moved || current.forcePan || exceedsPanDragThreshold(dx, dy, thresholdPx);
  const gesture = shouldPan && !current.moved ? { ...current, moved: true } : current;
  return {
    gesture,
    dx,
    dy,
    shouldPan,
    startedPan: shouldPan && !current.moved,
  };
}

export function finishCanvasPointerGesture(
  current: CanvasPointerGesture,
  cancelled = false,
): 'select' | 'pan' | 'cancel' {
  if (cancelled) return 'cancel';
  return current.moved ? 'pan' : 'select';
}
