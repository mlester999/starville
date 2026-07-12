import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlayerPersistence } from './use-player-persistence';

let container: HTMLDivElement;
let root: Root;
const originalFetch = globalThis.fetch;

function Harness({ onAccessInvalid }: { readonly onAccessInvalid: () => void }) {
  const persistence = usePlayerPersistence({
    apiUrl: 'http://localhost:4000',
    initialState: {
      mapId: 'lantern-square',
      x: 12,
      y: 7.5,
      facingDirection: 'south',
    },
    initialGameStateVersion: 1,
    onAccessInvalid,
  });

  return (
    <div>
      <span data-testid="save-status">{persistence.status}</span>
      <button
        onClick={() =>
          persistence.checkpoint({
            mapId: 'lantern-square',
            x: 12.5,
            y: 8,
            facingDirection: 'east',
          })
        }
        type="button"
      >
        Save
      </button>
    </div>
  );
}

function TransitionHarness() {
  const persistence = usePlayerPersistence({
    apiUrl: 'http://localhost:4000',
    initialState: {
      mapId: 'lantern-square',
      x: 12,
      y: 7.5,
      facingDirection: 'south',
    },
    initialGameStateVersion: 2,
    onAccessInvalid: vi.fn(),
  });

  return (
    <div>
      <button type="button" onClick={() => void persistence.beginTransition()}>
        Begin transition
      </button>
      <button
        type="button"
        onClick={() =>
          persistence.checkpoint({
            mapId: 'lantern-square',
            x: 11,
            y: 1,
            facingDirection: 'north',
          })
        }
      >
        Stale checkpoint
      </button>
      <button
        type="button"
        onClick={() =>
          persistence.acceptAuthoritativeTransition({
            mapId: 'moonpetal-meadow',
            x: 10,
            y: 14.5,
            facingDirection: 'north',
            gameStateVersion: 3,
          })
        }
      >
        Accept transition
      </button>
      <button
        type="button"
        onClick={() =>
          persistence.checkpoint({
            mapId: 'moonpetal-meadow',
            x: 10.5,
            y: 13.5,
            facingDirection: 'north',
          })
        }
      >
        Destination checkpoint
      </button>
    </div>
  );
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  vi.clearAllMocks();
});

describe('usePlayerPersistence', () => {
  it('continues reporting save state after the StrictMode effect rehearsal', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mapId: 'lantern-square',
          x: 12.5,
          y: 8,
          facingDirection: 'east',
          gameStateVersion: 2,
        },
      }),
    );
    await act(async () =>
      root.render(
        <StrictMode>
          <Harness onAccessInvalid={vi.fn()} />
        </StrictMode>,
      ),
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="save-status"]')?.textContent).toBe('saved');
  });

  it('reboots access when a version conflict reports an administrative state change', async () => {
    const onAccessInvalid = vi.fn();
    globalThis.fetch = vi.fn(async () =>
      Response.json(
        { success: false, error: { code: 'PLAYER_STATE_VERSION_CONFLICT' } },
        { status: 409 },
      ),
    );
    await act(async () => root.render(<Harness onAccessInvalid={onAccessInvalid} />));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onAccessInvalid).toHaveBeenCalledTimes(1);
  });

  it('drops stale checkpoints during travel and resumes from the authoritative destination version', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mapId: 'moonpetal-meadow',
          x: 10.5,
          y: 13.5,
          facingDirection: 'north',
          gameStateVersion: 4,
        },
      }),
    );
    await act(async () => root.render(<TransitionHarness />));

    const button = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (candidate) => candidate.textContent === label,
      );

    await act(async () => {
      button('Begin transition')?.click();
      await Promise.resolve();
      button('Stale checkpoint')?.click();
      await Promise.resolve();
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await act(async () => {
      button('Accept transition')?.click();
      button('Destination checkpoint')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        mapId: 'moonpetal-meadow',
        x: 10.5,
        y: 13.5,
        facingDirection: 'north',
        expectedGameStateVersion: 3,
      }),
    );
  });
});
