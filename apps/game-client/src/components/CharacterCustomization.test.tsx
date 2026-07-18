import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPILED_AVATAR_STARTER_CATALOG, defaultAvatarSelection } from '../app/avatar-client';
import { CharacterCustomization } from './CharacterCustomization';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
  });
  if (globalThis.CSS === undefined) Reflect.set(globalThis, 'CSS', {});
  if (globalThis.CSS.escape === undefined)
    Reflect.set(globalThis.CSS, 'escape', (value: string) => value);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  vi.restoreAllMocks();
});

async function renderCustomizer(
  overrides: Partial<Parameters<typeof CharacterCustomization>[0]> = {},
) {
  const props: Parameters<typeof CharacterCustomization>[0] = {
    mode: 'create',
    catalog: COMPILED_AVATAR_STARTER_CATALOG,
    savedSelection: defaultAvatarSelection('moss'),
    busy: false,
    onSave: vi.fn(async () => undefined),
    ...overrides,
  };
  await act(async () => root.render(<CharacterCustomization {...props} />));
  return props;
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

describe('CharacterCustomization', () => {
  it('provides staged creator progress and all eight direction plus idle/walk/jog previews', async () => {
    await renderCustomizer();
    expect(container.textContent).toContain('Choose a comfortable base');
    expect(container.querySelectorAll('.avatar-direction-ring button')).toHaveLength(8);
    expect(container.querySelectorAll('.avatar-animation-controls button')).toHaveLength(4);

    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[title="North east"]')?.click(),
    );
    await act(async () => button('Jog')?.click());
    expect(container.querySelector('.avatar-preview')?.getAttribute('data-direction')).toBe(
      'northeast',
    );
    expect(container.querySelector('.avatar-preview')?.getAttribute('data-animation')).toBe('jog');

    await act(async () => button('Next')?.click());
    expect(container.textContent).toContain('Shape a friendly expression');
  });

  it('keeps edits local until review confirmation and submits the complete selection once', async () => {
    const onSave = vi.fn(async () => undefined);
    await renderCustomizer({ onSave });
    const willow = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (candidate) => candidate.getAttribute('aria-label')?.startsWith('Willow frame.'),
    );
    await act(async () => willow?.click());
    expect(onSave).not.toHaveBeenCalled();

    for (let index = 0; index < 5; index += 1) await act(async () => button('Next')?.click());
    expect(container.textContent).toContain('Ready for Lantern Square?');
    await act(async () => button('Confirm and enter Starville')?.click());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ body: 'willow-frame' }));
  });

  it('supports arrow-key option selection with visible radio state', async () => {
    await renderCustomizer();
    const selected = container.querySelector<HTMLButtonElement>(
      '[data-avatar-layer="body"][aria-checked="true"]',
    );
    expect(selected).not.toBeNull();
    await act(async () =>
      selected?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(
      container
        .querySelector('[data-avatar-layer="body"][aria-checked="true"]')
        ?.getAttribute('aria-label'),
    ).not.toBe(selected?.getAttribute('aria-label'));
  });

  it('prompts before closing a dirty Wardrobe and lets Escape return to editing', async () => {
    const onClose = vi.fn();
    await renderCustomizer({ mode: 'edit', onClose });
    const option = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (candidate) => candidate.getAttribute('aria-label')?.startsWith('Willow frame.'),
    );
    await act(async () => option?.click());
    await act(async () => button('Cancel')?.click());
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => button('Cancel')?.click());
    await act(async () => button('Discard changes')?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps visual-acceptance fixtures interactive but makes persistence impossible', async () => {
    const onSave = vi.fn(async () => undefined);
    await renderCustomizer({ mode: 'edit', onSave, previewOnly: true });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.avatar-stepper li:last-child button')?.click(),
    );

    const save = button('Visual preview only');
    expect(save?.disabled).toBe(true);
    expect(container.textContent).toContain('Changes stay local and cannot be saved');
    await act(async () => save?.click());
    expect(onSave).not.toHaveBeenCalled();
  });
});
