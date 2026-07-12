import { describe, expect, it } from 'vitest';

import { focusTrapTarget } from './dialog-focus';

describe('sensitive-operation dialog focus trap', () => {
  const controls = [{ id: 'reason' }, { id: 'cancel' }, { id: 'confirm' }] as const;

  it('wraps forward Tab from the final control to the first', () => {
    expect(focusTrapTarget(controls, controls[2], false)).toBe(controls[0]);
  });

  it('wraps Shift+Tab from the first control to the final control', () => {
    expect(focusTrapTarget(controls, controls[0], true)).toBe(controls[2]);
  });

  it('leaves focus alone between the dialog boundaries', () => {
    expect(focusTrapTarget(controls, controls[1], false)).toBeUndefined();
  });
});
