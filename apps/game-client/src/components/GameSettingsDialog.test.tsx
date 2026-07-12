import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameSettingsDialog } from './GameSettingsDialog';

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
          settings={{ masterVolume: 0.8, muted: false }}
          pendingAction={false}
          onSettingsChange={onSettingsChange}
          onResume={vi.fn()}
          onReturnLanding={vi.fn(async () => undefined)}
          onEndSession={onEndSession}
        />,
      );
    });

    expect(container.textContent).toContain('Master volume');
    expect(container.textContent).not.toContain('Music volume');
    expect(container.textContent).not.toContain('Ambience volume');
    expect(container.textContent).not.toContain('Sound-effects volume');

    const end = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('End Starville session'),
    );
    await act(async () => end?.click());
    expect(onEndSession).not.toHaveBeenCalled();
    const confirm = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Confirm end session'),
    );
    await act(async () => confirm?.click());
    expect(onEndSession).toHaveBeenCalledTimes(1);
  });

  it('closes safely on Escape and keeps Tab focus within the semantic dialog', async () => {
    const onResume = vi.fn();
    await act(async () => {
      root.render(
        <GameSettingsDialog
          settings={{ masterVolume: 0.8, muted: false }}
          pendingAction={false}
          onSettingsChange={vi.fn()}
          onResume={onResume}
          onReturnLanding={vi.fn(async () => undefined)}
          onEndSession={vi.fn(async () => undefined)}
        />,
      );
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
