import { describe, expect, it } from 'vitest';

import {
  computeVerticalScrollGeometry,
  scrollTopFromThumbDelta,
  scrollTopFromTrackClick,
} from './scroll-geometry';

describe('admin scroll geometry', () => {
  it('reports non-overflowing geometry when content fits', () => {
    const geometry = computeVerticalScrollGeometry({
      scrollHeight: 400,
      clientHeight: 400,
      scrollTop: 0,
      trackHeight: 380,
    });
    expect(geometry.overflows).toBe(false);
    expect(geometry.thumbOffset).toBe(0);
    expect(geometry.maxScroll).toBe(0);
  });

  it('sizes the thumb from the visible content ratio', () => {
    const geometry = computeVerticalScrollGeometry({
      scrollHeight: 1000,
      clientHeight: 250,
      scrollTop: 0,
      trackHeight: 400,
      minThumbHeight: 28,
    });
    expect(geometry.overflows).toBe(true);
    expect(geometry.thumbSizeRatio).toBeCloseTo(0.25, 5);
    expect(geometry.thumbHeight).toBeCloseTo(100, 5);
    expect(geometry.thumbOffset).toBe(0);
  });

  it('moves the thumb as scrollTop increases', () => {
    const top = computeVerticalScrollGeometry({
      scrollHeight: 1000,
      clientHeight: 250,
      scrollTop: 0,
      trackHeight: 400,
    });
    const mid = computeVerticalScrollGeometry({
      scrollHeight: 1000,
      clientHeight: 250,
      scrollTop: 375,
      trackHeight: 400,
    });
    const bottom = computeVerticalScrollGeometry({
      scrollHeight: 1000,
      clientHeight: 250,
      scrollTop: 750,
      trackHeight: 400,
    });
    expect(mid.thumbOffset).toBeGreaterThan(top.thumbOffset);
    expect(bottom.thumbOffset).toBeGreaterThan(mid.thumbOffset);
    expect(bottom.scrollRatio).toBeCloseTo(1, 5);
  });

  it('converts track clicks and thumb drags into scroll positions', () => {
    const fromClick = scrollTopFromTrackClick({
      clickY: 200,
      trackHeight: 400,
      thumbHeight: 100,
      maxScroll: 750,
    });
    expect(fromClick).toBeGreaterThan(0);
    expect(fromClick).toBeLessThanOrEqual(750);

    const fromDrag = scrollTopFromThumbDelta({
      startScrollTop: 100,
      pointerDeltaY: 150,
      trackHeight: 400,
      thumbHeight: 100,
      maxScroll: 750,
    });
    expect(fromDrag).toBeGreaterThan(100);
    expect(fromDrag).toBeLessThanOrEqual(750);
  });
});
