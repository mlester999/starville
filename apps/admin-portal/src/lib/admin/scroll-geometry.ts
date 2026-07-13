export interface ScrollGeometryInput {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly scrollTop: number;
  readonly trackHeight: number;
  readonly minThumbHeight?: number;
}

export interface ScrollGeometry {
  readonly overflows: boolean;
  readonly maxScroll: number;
  readonly thumbHeight: number;
  readonly thumbOffset: number;
  readonly thumbSizeRatio: number;
  readonly scrollRatio: number;
}

/**
 * Pure geometry for a custom vertical scrollbar synchronized to a real scroll viewport.
 * Used by AdminScrollArea / EditorScrollRegion (no decorative overlays).
 */
export function computeVerticalScrollGeometry(input: ScrollGeometryInput): ScrollGeometry {
  const minThumb = input.minThumbHeight ?? 28;
  const maxScroll = Math.max(0, input.scrollHeight - input.clientHeight);
  const overflows = maxScroll > 1 && input.clientHeight > 0 && input.trackHeight > 0;

  if (!overflows) {
    return {
      overflows: false,
      maxScroll: 0,
      thumbHeight: input.trackHeight,
      thumbOffset: 0,
      thumbSizeRatio: 1,
      scrollRatio: 0,
    };
  }

  const thumbSizeRatio = Math.min(1, input.clientHeight / input.scrollHeight);
  const thumbHeight = Math.max(minThumb, thumbSizeRatio * input.trackHeight);
  const travel = Math.max(0, input.trackHeight - thumbHeight);
  const scrollRatio = maxScroll === 0 ? 0 : Math.min(1, Math.max(0, input.scrollTop / maxScroll));
  const thumbOffset = travel * scrollRatio;

  return {
    overflows: true,
    maxScroll,
    thumbHeight,
    thumbOffset,
    thumbSizeRatio,
    scrollRatio,
  };
}

/** Convert a track click Y (relative to track top) into a target scrollTop. */
export function scrollTopFromTrackClick(input: {
  readonly clickY: number;
  readonly trackHeight: number;
  readonly thumbHeight: number;
  readonly maxScroll: number;
}): number {
  if (input.trackHeight <= 0 || input.maxScroll <= 0) return 0;
  const travel = Math.max(1, input.trackHeight - input.thumbHeight);
  const center = input.clickY - input.thumbHeight / 2;
  const ratio = Math.min(1, Math.max(0, center / travel));
  return ratio * input.maxScroll;
}

/** Convert thumb drag delta into scrollTop delta. */
export function scrollTopFromThumbDelta(input: {
  readonly startScrollTop: number;
  readonly pointerDeltaY: number;
  readonly trackHeight: number;
  readonly thumbHeight: number;
  readonly maxScroll: number;
}): number {
  const travel = Math.max(1, input.trackHeight - input.thumbHeight);
  const next = input.startScrollTop + (input.pointerDeltaY / travel) * input.maxScroll;
  return Math.min(input.maxScroll, Math.max(0, next));
}
