import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveOperationsBoundary } from './LiveOperationsBoundary';

const timestamp = '2026-07-13T00:00:00.000Z';
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.useRealTimers();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  localStorage.clear();
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});
function payload(active: boolean) {
  return {
    success: true,
    data: {
      maintenance: {
        state: active ? 'active' : 'disabled',
        active,
        revision: 1,
        title: 'SERVER PAUSED',
        message: 'A safe maintenance message.',
        updateDetails: [],
        expectedEndAt: null,
        expectedReturnMessage: null,
        showReturnToLanding: true,
        ctaLabel: null,
        ctaUrl: null,
        updatedAt: timestamp,
      },
      announcements: [],
      generatedAt: timestamp,
    },
  };
}

describe('LiveOperationsBoundary', () => {
  it('shows full-screen Preparing Starville only before the first trusted snapshot', async () => {
    let resolve!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await act(async () => {
      root.render(
        <LiveOperationsBoundary apiUrl="http://localhost:4000" landingUrl="http://localhost:3000">
          <div id="world">world</div>
        </LiveOperationsBoundary>,
      );
    });
    expect(container.querySelector('#world')).toBeNull();
    expect(container.textContent).toContain('Preparing Starville');
    expect(container.textContent).toContain('Checking village availability');
    await act(async () => {
      resolve(
        new Response(JSON.stringify(payload(false)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    expect(container.querySelector('#world')).not.toBeNull();
    expect(container.textContent).not.toContain('Preparing Starville');
  });

  it('does not show full-screen Preparing Starville during focus reconciliation', async () => {
    let call = 0;
    let secondResolve!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(payload(false)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return new Promise((done) => {
        secondResolve = done;
      });
    });
    await act(async () => {
      root.render(
        <LiveOperationsBoundary apiUrl="http://localhost:4000" landingUrl="http://localhost:3000">
          <div id="world" data-testid="playable-world">
            world
          </div>
        </LiveOperationsBoundary>,
      );
      await Promise.resolve();
    });
    expect(container.querySelector('#world')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(container.querySelector('#world')).not.toBeNull();
    expect(container.textContent).not.toContain('Preparing Starville');
    expect(container.textContent).not.toContain('Checking village availability');

    await act(async () => {
      secondResolve(
        new Response(JSON.stringify(payload(false)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    expect(container.querySelector('#world')).not.toBeNull();
  });

  it('does not flash the soft sync indicator for a fast background refresh', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload(false)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await act(async () => {
      root.render(
        <LiveOperationsBoundary apiUrl="http://localhost:4000" landingUrl="http://localhost:3000">
          <div id="world">world</div>
        </LiveOperationsBoundary>,
      );
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain('Syncing village status');

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    // Faster than the 400ms delay — no flash.
    expect(container.textContent).not.toContain('Syncing village status');
    expect(container.querySelector('#world')).not.toBeNull();
  });

  it('shows a delayed non-blocking sync indicator for a slow background refresh', async () => {
    vi.useFakeTimers();
    let call = 0;
    let slowResolve!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(payload(false)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return new Promise((done) => {
        slowResolve = done;
      });
    });
    await act(async () => {
      root.render(
        <LiveOperationsBoundary apiUrl="http://localhost:4000" landingUrl="http://localhost:3000">
          <div id="world">world</div>
        </LiveOperationsBoundary>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(container.textContent).not.toContain('Syncing village status');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(container.textContent).toContain('Syncing village status');
    expect(container.querySelector('#world')).not.toBeNull();
    expect(container.textContent).not.toContain('Preparing Starville');

    await act(async () => {
      slowResolve(
        new Response(JSON.stringify(payload(false)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain('Syncing village status');
  });

  it('keeps gameplay mounted when a background refresh fails temporarily', async () => {
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(payload(false)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Promise.reject(new TypeError('network down'));
    });
    await act(async () => {
      root.render(
        <LiveOperationsBoundary apiUrl="http://localhost:4000" landingUrl="http://localhost:3000">
          <div id="world">world</div>
        </LiveOperationsBoundary>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(container.querySelector('#world')).not.toBeNull();
    expect(container.textContent).toContain('Connection interrupted');
    expect(container.textContent).not.toContain('Preparing Starville');
  });

  it('replaces gameplay with the maintenance screen', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload(true)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await act(async () => {
      root.render(
        <LiveOperationsBoundary apiUrl="http://localhost:4000" landingUrl="http://localhost:3000">
          <div id="world">world</div>
        </LiveOperationsBoundary>,
      );
    });
    expect(container.querySelector('#world')).toBeNull();
    expect(container.textContent).toContain('SERVER PAUSED');
    expect(container.textContent).toContain('Check Again');
    const returnLink = container.querySelector('a[data-game-action-link="secondary"]');
    expect(returnLink).not.toBeNull();
    expect(returnLink?.getAttribute('href')).toBe('http://localhost:3000');
    expect(returnLink?.className).toContain('gate-secondary');
    expect(returnLink?.className).toContain('game-action-link');
    expect(returnLink?.textContent).toContain('Return to Starville');
    const checkButton = container.querySelector('button.gate-primary');
    expect(checkButton?.textContent).toContain('Check Again');
    expect(checkButton?.hasAttribute('disabled')).toBe(false);
  });

  it('prevents duplicate Check Again clicks while a recheck is in flight', async () => {
    let resolve!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await act(async () => {
      root.render(
        <LiveOperationsBoundary apiUrl="http://localhost:4000" landingUrl="http://localhost:3000">
          <div id="world">world</div>
        </LiveOperationsBoundary>,
      );
    });
    await act(async () => {
      resolve(
        new Response(JSON.stringify(payload(true)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    const button = container.querySelector('button.gate-primary') as HTMLButtonElement;
    expect(button).not.toBeNull();
    let pendingResolve!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((done) => {
          pendingResolve = done;
        }),
    );
    await act(async () => {
      button.click();
      button.click();
    });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    expect(container.textContent).toContain('Checking…');
    await act(async () => {
      pendingResolve(
        new Response(JSON.stringify(payload(true)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    expect(container.querySelector('#world')).toBeNull();
  });

  it('flushes the latest player state before removing an active world', async () => {
    const beforeMaintenance = vi.fn(async () => undefined);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload(false)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify(payload(true)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    await act(async () => {
      root.render(
        <LiveOperationsBoundary
          apiUrl="http://localhost:4000"
          beforeMaintenance={beforeMaintenance}
          landingUrl="http://localhost:3000"
        >
          <div id="world">world</div>
        </LiveOperationsBoundary>,
      );
    });
    expect(container.querySelector('#world')).not.toBeNull();
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(beforeMaintenance).toHaveBeenCalledTimes(1);
    expect(container.querySelector('#world')).toBeNull();
  });
});
