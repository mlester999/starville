import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameSettingsDialog } from './GameSettingsDialog';
import { DEFAULT_GAME_SETTINGS } from '../app/game-settings';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('GameSettingsDialog', () => {
  it('shows only supported audio controls and requires confirmation before ending', async () => {
    const onSettingsChange = vi.fn();
    const onEndSession = vi.fn(async () => undefined);
    await act(async () => {
      root.render(
        <GameSettingsDialog
          settings={DEFAULT_GAME_SETTINGS}
          pendingAction={false}
          onSettingsChange={onSettingsChange}
          onResume={vi.fn()}
          onReturnLanding={vi.fn(async () => undefined)}
          onEndSession={onEndSession}
        />,
      );
    });

    expect(container.textContent).toContain('Master Volume');
    expect(container.textContent).not.toContain('Music volume');
    expect(container.textContent).not.toContain('Ambience volume');
    expect(container.textContent).not.toContain('Sound-effects volume');

    const end = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('End Starville Session'),
    );
    await act(async () => end?.click());
    expect(onEndSession).not.toHaveBeenCalled();
    const confirm = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Confirm End Session'),
    );
    await act(async () => confirm?.click());
    expect(onEndSession).toHaveBeenCalledTimes(1);
  });

  it('closes safely on Escape and keeps Tab focus within the semantic dialog', async () => {
    const onResume = vi.fn();
    await act(async () => {
      root.render(
        <GameSettingsDialog
          settings={DEFAULT_GAME_SETTINGS}
          pendingAction={false}
          onSettingsChange={vi.fn()}
          onResume={onResume}
          onReturnLanding={vi.fn(async () => undefined)}
          onEndSession={vi.fn(async () => undefined)}
        />,
      );
    });
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(dialog);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect((document.activeElement as HTMLElement | null)?.getAttribute('aria-label')).toBe(
      'Close Settings',
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('exposes functional gameplay and accessibility preferences plus the accurate play guide', async () => {
    const onSettingsChange = vi.fn();
    await act(async () => {
      root.render(
        <GameSettingsDialog
          settings={DEFAULT_GAME_SETTINGS}
          pendingAction={false}
          onSettingsChange={onSettingsChange}
          onResume={vi.fn()}
          onReturnLanding={vi.fn(async () => undefined)}
          onEndSession={vi.fn(async () => undefined)}
        />,
      );
    });
    const click = async (label: string) => {
      await act(async () =>
        [...container.querySelectorAll<HTMLButtonElement>('button')]
          .find((button) => button.textContent?.trim() === label)
          ?.click(),
      );
    };
    await click('Gameplay');
    const compact = [...container.querySelectorAll<HTMLInputElement>('input')].find((input) =>
      input.closest('label')?.textContent?.includes('Compact HUD Mode'),
    );
    await act(async () => compact?.click());
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ compactHud: true, version: 2 }),
    );

    await click('Accessibility');
    await click('120%');
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ uiScale: 1.2 }));

    await click('How to Play');
    expect(container.textContent).toContain('Explore Starville');
    expect(container.textContent).toContain('Changing an offer clears both confirmations');
    expect(container.textContent).not.toContain('RPC');
  });

  it('supports roving keyboard navigation between settings sections', async () => {
    await act(async () => {
      root.render(
        <GameSettingsDialog
          settings={DEFAULT_GAME_SETTINGS}
          pendingAction={false}
          onSettingsChange={vi.fn()}
          onResume={vi.fn()}
          onReturnLanding={vi.fn(async () => undefined)}
          onEndSession={vi.fn(async () => undefined)}
        />,
      );
    });
    const audio = container.querySelector<HTMLButtonElement>('#settings-tab-audio');
    audio?.focus();
    await act(async () =>
      audio?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    const gameplay = container.querySelector<HTMLButtonElement>('#settings-tab-gameplay');
    expect(gameplay?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(gameplay);
    await act(async () =>
      gameplay?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })),
    );
    expect(container.textContent).toContain('Explore Starville');
    expect(document.activeElement?.id).toBe('settings-tab-how-to-play');
  });

  it('exposes one authoritative Wardrobe entry without adding a second editor', async () => {
    const onEditAppearance = vi.fn();
    await act(async () => {
      root.render(
        <GameSettingsDialog
          appearanceEditingAvailable
          onEditAppearance={onEditAppearance}
          settings={DEFAULT_GAME_SETTINGS}
          pendingAction={false}
          onSettingsChange={vi.fn()}
          onResume={vi.fn()}
          onReturnLanding={vi.fn(async () => undefined)}
          onEndSession={vi.fn(async () => undefined)}
        />,
      );
    });
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((candidate) => candidate.textContent?.trim() === 'Wardrobe')
        ?.click(),
    );
    expect(container.textContent).toContain('Your Wardrobe Mirror');
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((candidate) => candidate.textContent?.trim() === 'Open Wardrobe')
        ?.click(),
    );
    expect(onEditAppearance).toHaveBeenCalledTimes(1);
  });
});
