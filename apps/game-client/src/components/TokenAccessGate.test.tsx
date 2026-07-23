import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TokenAccessGate } from './TokenAccessGate';

const runtimeLifecycle = vi.hoisted(() => ({ destroyed: 0 }));

vi.mock('./PlayerExperience', async () => {
  const { useEffect } = await import('react');
  return {
    PlayerExperience: ({
      access,
      onLeaveVillage,
    }: {
      readonly access: { readonly walletAddress?: string };
      readonly onLeaveVillage: () => Promise<void>;
    }) => {
      useEffect(
        () => () => {
          runtimeLifecycle.destroyed += 1;
        },
        [],
      );
      return (
        <div data-testid="protected-player-experience" data-wallet={access.walletAddress}>
          Private player runtime
          <button type="button" onClick={() => void onLeaveVillage()}>
            End test session
          </button>
        </div>
      );
    },
  };
});

vi.mock('./LiveOperationsBoundary', () => ({
  LiveOperationsBoundary: ({ children }: { readonly children: ReactNode }) => children,
}));

let container: HTMLDivElement;
let root: Root;
const originalFetch = globalThis.fetch;

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
  runtimeLifecycle.destroyed = 0;
  vi.useRealTimers();
});

async function renderGate() {
  await act(async () => {
    root.render(
      <TokenAccessGate apiUrl="http://localhost:4000" landingUrl="http://localhost:3000" />,
    );
    await Promise.resolve();
  });
}

describe('TokenAccessGate bootstrap boundary', () => {
  it.each(['none', 'expired', 'revoked'] as const)(
    'keeps the player experience absent for %s access',
    async (access) => {
      globalThis.fetch = vi.fn(async () =>
        Response.json({
          success: true,
          data: {
            access,
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '10000',
          },
        }),
      );

      await renderGate();
      expect(container.querySelector('[data-testid="protected-player-experience"]')).toBeNull();
      expect(container.querySelector('canvas')).toBeNull();
    },
  );

  it('allows the protected profile flow only after a trusted grant', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          access: 'granted',
          walletAddress: '11111111111111111111111111111111',
          network: 'solana:mainnet-beta',
          symbol: 'STAR',
          requiredAmount: '10000',
          observedAmount: '10000',
          expiresAt: '2026-07-11T05:00:00.000Z',
          recheckAfter: '2099-07-11T04:05:00.000Z',
        },
      }),
    );

    await renderGate();
    expect(container.querySelector('[data-testid="protected-player-experience"]')).not.toBeNull();
  });

  it('revokes an active session before keeping the private runtime unmounted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            access: 'granted',
            walletAddress: '11111111111111111111111111111111',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '10000',
            observedAmount: '10000',
            expiresAt: '2099-07-11T05:00:00.000Z',
            recheckAfter: '2099-07-11T04:05:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;
    await renderGate();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      new URL('http://localhost:4000/api/v1/token-access/session'),
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
    expect(container.querySelector('[data-testid="protected-player-experience"]')).toBeNull();
    expect(runtimeLifecycle.destroyed).toBe(1);
  });

  it('unmounts the protected runtime when a focused-window session check reports revocation', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            access: 'granted',
            walletAddress: '11111111111111111111111111111111',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '10000',
            observedAmount: '10000',
            expiresAt: '2099-07-11T05:00:00.000Z',
            recheckAfter: '2099-07-11T04:05:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            access: 'revoked',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '10000',
          },
        }),
      );

    await renderGate();
    expect(container.querySelector('[data-testid="protected-player-experience"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="protected-player-experience"]')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(runtimeLifecycle.destroyed).toBe(1);
    expect(container.textContent).not.toContain('Private player runtime');
  });

  it('keeps the protected runtime mounted when a background focus recheck fails temporarily', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            access: 'granted',
            walletAddress: '11111111111111111111111111111111',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '10000',
            observedAmount: '10000',
            expiresAt: '2099-07-11T05:00:00.000Z',
            recheckAfter: '2099-07-11T04:05:00.000Z',
          },
        }),
      )
      .mockRejectedValueOnce(new TypeError('network interrupted'));

    await renderGate();
    expect(container.querySelector('[data-testid="protected-player-experience"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="protected-player-experience"]')).not.toBeNull();
    expect(runtimeLifecycle.destroyed).toBe(0);
    expect(container.textContent).toContain('Private player runtime');
  });

  it('replaces the player experience when the trusted session changes wallet accounts', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            access: 'granted',
            walletAddress: '11111111111111111111111111111111',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '10000',
            observedAmount: '10000',
            expiresAt: '2099-07-11T05:00:00.000Z',
            recheckAfter: '2099-07-11T04:05:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            access: 'granted',
            walletAddress: '22222222222222222222222222222222',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '10000',
            observedAmount: '10000',
            expiresAt: '2099-07-11T05:00:00.000Z',
            recheckAfter: '2099-07-11T04:05:00.000Z',
          },
        }),
      );

    await renderGate();
    expect(
      container
        .querySelector('[data-testid="protected-player-experience"]')
        ?.getAttribute('data-wallet'),
    ).toBe('11111111111111111111111111111111');

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      container
        .querySelector('[data-testid="protected-player-experience"]')
        ?.getAttribute('data-wallet'),
    ).toBe('22222222222222222222222222222222');
  });

  it('stops an idle runtime on the bounded session reconciliation interval', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            access: 'granted',
            walletAddress: '11111111111111111111111111111111',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '10000',
            observedAmount: '1000',
            expiresAt: '2099-07-11T05:00:00.000Z',
            recheckAfter: '2099-07-11T04:05:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            access: 'revoked',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '10000',
          },
        }),
      );

    await renderGate();
    expect(container.querySelector('[data-testid="protected-player-experience"]')).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(container.querySelector('[data-testid="protected-player-experience"]')).toBeNull();
  });
});
