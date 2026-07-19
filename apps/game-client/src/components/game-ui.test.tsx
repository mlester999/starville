import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameModalPortal, GameModalShell } from './game-ui';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.getElementById('starville-modal-root')?.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('GameModalShell', () => {
  it('portals a sharp modal above its owned backdrop and restores focus', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    await act(async () => {
      root.render(
        <GameModalShell portal onClose={vi.fn()} title="Lantern Square notice">
          <p>Welcome to the village.</p>
          <button type="button">First action</button>
        </GameModalShell>,
      );
    });
    const modalRoot = document.getElementById('starville-modal-root');
    const dialog = modalRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(dialog?.textContent).toContain('Welcome to the village.');
    expect(dialog?.parentElement?.classList.contains('game-modal-backdrop')).toBe(true);
    expect(document.activeElement).toBe(dialog);

    await act(async () => root.unmount());
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    root = createRoot(host);
  });

  it('closes with Escape and an allowed backdrop click while trapping Tab', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <GameModalShell closeOnBackdrop portal onClose={onClose} title="Notice">
          <button type="button">First</button>
          <button type="button">Last</button>
        </GameModalShell>,
      );
    });
    const modalRoot = document.getElementById('starville-modal-root')!;
    const dialog = modalRoot.querySelector<HTMLElement>('[role="dialog"]')!;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
    buttons.at(-1)?.focus();
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })),
    );
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    const backdrop = modalRoot.querySelector<HTMLElement>('.game-modal-backdrop')!;
    await act(async () => backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('gives legacy world panels the same portal, focus, Escape, and body-lock boundary', async () => {
    const onClose = vi.fn();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    await act(async () => {
      root.render(
        <GameModalPortal portal onClose={onClose}>
          <div className="world-overlay" role="presentation">
            <section aria-modal="true" role="dialog">
              <button type="button">Panel action</button>
            </section>
          </div>
        </GameModalPortal>,
      );
    });
    const dialog = document.querySelector<HTMLElement>('#starville-modal-root [role="dialog"]');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');

    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    root = createRoot(host);
  });
});
