import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorldNoticeModal, type WorldNoticeModalState } from './WorldNoticeModal';

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

async function renderState(state: WorldNoticeModalState, onRetry?: () => void) {
  await act(async () =>
    root.render(
      <WorldNoticeModal
        state={state}
        onClose={vi.fn()}
        {...(onRetry === undefined ? {} : { onRetry })}
      />,
    ),
  );
  return document.querySelector<HTMLElement>('#starville-modal-root [role="dialog"]')!;
}

describe('WorldNoticeModal', () => {
  it('shows published content on a visible sharp modal surface', async () => {
    const dialog = await renderState({
      status: 'ready',
      title: 'Lantern Square Notice',
      content: 'Market day begins at first light.',
    });
    expect(dialog.textContent).toContain('Market day begins at first light.');
    expect(dialog.classList.contains('world-notice-modal')).toBe(true);
  });

  it('renders explicit loading, empty, and retryable error states', async () => {
    expect(
      (
        await renderState({
          status: 'loading',
          title: 'Lantern Square Notice',
        })
      ).textContent,
    ).toContain('Opening the published notice');

    expect(
      (
        await renderState({
          status: 'empty',
          title: 'Lantern Square Notice',
        })
      ).textContent,
    ).toContain('no notice content');

    const retry = vi.fn();
    const error = await renderState(
      {
        status: 'error',
        title: 'Lantern Square Notice',
        message: 'The published notice could not be opened.',
      },
      retry,
    );
    await act(async () =>
      [...error.querySelectorAll<HTMLButtonElement>('button')]
        .find(({ textContent }) => textContent?.includes('Try notice again'))
        ?.click(),
    );
    expect(retry).toHaveBeenCalledOnce();
  });
});
