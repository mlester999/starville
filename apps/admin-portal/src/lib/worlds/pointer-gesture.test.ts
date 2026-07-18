import { describe, expect, it } from 'vitest';

import {
  beginCanvasPointerGesture,
  finishCanvasPointerGesture,
  moveCanvasPointerGesture,
} from './pointer-gesture';

function begin(overrides: Partial<Parameters<typeof beginCanvasPointerGesture>[0]> = {}) {
  return beginCanvasPointerGesture({
    pointerId: 7,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    clientX: 100,
    clientY: 80,
    panX: 12,
    panY: -4,
    startedOnInteractiveTarget: true,
    forcePan: false,
    ...overrides,
  });
}

describe('world canvas pointer gesture', () => {
  it('keeps a small object press as a selection gesture', () => {
    const gesture = begin();
    expect(gesture).not.toBeNull();
    const movement = moveCanvasPointerGesture(gesture!, 103, 83);
    expect(movement.shouldPan).toBe(false);
    expect(finishCanvasPointerGesture(movement.gesture)).toBe('select');
  });

  it('converts object movement at the shared threshold into a pan', () => {
    const gesture = begin();
    const movement = moveCanvasPointerGesture(gesture!, 105, 80);
    expect(movement.startedPan).toBe(true);
    expect(movement.gesture.moved).toBe(true);
    expect(finishCanvasPointerGesture(movement.gesture)).toBe('pan');
  });

  it.each(['mouse', 'pen', 'touch'] as const)(
    'uses the same selection boundary for %s input',
    (pointerType) => {
      const gesture = begin({ pointerType });
      expect(gesture?.pointerType).toBe(pointerType);
      expect(finishCanvasPointerGesture(gesture!)).toBe('select');
    },
  );

  it('starts an explicit Space or middle-button pan without waiting for distance', () => {
    const gesture = begin({ forcePan: true, button: 1 });
    const movement = moveCanvasPointerGesture(gesture!, 100, 80);
    expect(movement.shouldPan).toBe(true);
    expect(movement.startedPan).toBe(true);
  });

  it('ignores secondary contacts and reports cancellation without selection', () => {
    expect(begin({ isPrimary: false, pointerType: 'touch' })).toBeNull();
    expect(finishCanvasPointerGesture(begin()!, true)).toBe('cancel');
  });
});
