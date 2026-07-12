import { describe, expect, it } from 'vitest';

import { isGameplayInputAllowed, isTextEntryElement } from './focus';
import { isJogging, readMovementInput, type MovementKeyState } from './movement-key-state';

function key(isDown: boolean) {
  return { isDown };
}

describe('gameplay keyboard focus boundary', () => {
  it('blocks movement while overlays or text-entry controls own input', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const contentEditable = document.createElement('div');
    contentEditable.setAttribute('contenteditable', 'true');

    expect(isGameplayInputAllowed(true, document.body)).toBe(false);
    expect(isGameplayInputAllowed(false, input)).toBe(false);
    expect(isGameplayInputAllowed(false, textarea)).toBe(false);
    expect(isTextEntryElement(contentEditable)).toBe(true);
    expect(isGameplayInputAllowed(false, document.body)).toBe(true);
  });
});

describe('gameplay key mapping', () => {
  it('reads only WASD for movement and ignores arrow-like extra state', () => {
    const keys = {
      up: key(true),
      down: key(false),
      left: key(false),
      right: key(true),
      interact: key(false),
      settings: key(false),
      jog: key(false),
      cursors: { up: key(false), down: key(true), left: key(true), right: key(false) },
    } as unknown as MovementKeyState;
    expect(readMovementInput(keys)).toEqual({ up: true, down: false, left: false, right: true });
  });

  it('enables jogging only while either physical Shift key reports key code 16 down', () => {
    const keys = {
      up: key(false),
      down: key(false),
      left: key(false),
      right: key(false),
      interact: key(false),
      settings: key(false),
      jog: key(true),
    } as unknown as MovementKeyState;
    expect(isJogging(keys)).toBe(true);
    (keys.jog as { isDown: boolean }).isDown = false;
    expect(isJogging(keys)).toBe(false);
  });
});
