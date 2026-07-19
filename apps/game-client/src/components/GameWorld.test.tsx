import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameWorld } from './GameWorld';
import { lanternSquareManifest } from '@starville/game-core';
import { getWorldManifest } from '@starville/game-content';

const persistenceMocks = vi.hoisted(() => ({
  checkpoint: vi.fn(),
  noteState: vi.fn(),
  flushBeforeLeave: vi.fn(async () => undefined),
  beginTransition: vi.fn(async () => 1),
  acceptAuthoritativeTransition: vi.fn(),
  cancelTransition: vi.fn(),
}));
const canvasCapture = vi.hoisted(() => ({ props: undefined as unknown }));
const avatarProfileMocks = vi.hoisted(() => ({
  localAuthoritative: true,
  localProfile: {
    appearanceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    revision: 2,
    presetKey: 'moss-starter',
    legacyFallbackPreset: 'moss' as const,
    selection: {
      body: 'meadow-frame',
      skinTone: 'peach-warm',
      face: 'soft-smile',
      eyes: 'round-eyes',
      eyebrows: 'gentle-brows',
      hair: 'short-waves',
      hairColor: 'espresso',
      top: 'moss-tunic',
      bottom: 'meadow-trousers',
      footwear: 'trail-boots',
      accessories: ['leaf-clip'],
    },
  },
  remoteProfiles: {},
  setLocalProfile: vi.fn(),
}));

vi.mock('../app/use-player-persistence', () => ({
  usePlayerPersistence: () => ({
    status: 'ready',
    ...persistenceMocks,
  }),
}));
vi.mock('../app/use-narrow-game-viewport', () => ({ useNarrowGameViewport: () => false }));
vi.mock('../app/use-avatar-profiles', () => ({
  useAvatarProfiles: () => avatarProfileMocks,
}));
vi.mock('./GameCanvas', () => ({
  GameCanvas: (props: { readonly inputBlocked: boolean }) => {
    canvasCapture.props = props;
    return (
      <div data-testid="game-canvas-boundary" data-input-blocked={String(props.inputBlocked)} />
    );
  },
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  Reflect.set(window, 'matchMedia', () => ({
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  for (const mock of Object.values(persistenceMocks)) mock.mockClear();
  persistenceMocks.beginTransition.mockResolvedValue(1);
  canvasCapture.props = undefined;
  globalThis.fetch = vi.fn(async () =>
    Response.json({
      success: true,
      data: {
        map: {
          id: '11111111-1111-4111-8111-111111111111',
          slug: 'lantern-square',
          displayName: 'Lantern Square',
          description: 'The lantern-lit village center.',
        },
        version: {
          id: '22222222-2222-4222-8222-222222222222',
          versionNumber: 1,
          checksum: 'a'.repeat(64),
          publishedAt: '2026-07-12T04:00:00.000Z',
        },
        manifest: lanternSquareManifest(),
        playerState: {
          mapId: 'lantern-square',
          mapVersionId: '22222222-2222-4222-8222-222222222222',
          x: 12,
          y: 7.5,
          facingDirection: 'south',
          gameStateVersion: 1,
          updatedAt: '2026-07-12T04:00:00.000Z',
          lastTransitionAt: null,
        },
      },
    }),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('GameWorld controls and settings boundary', () => {
  it('shows WASD, Shift, E and Settings without arrows and blocks runtime input when open', async () => {
    await act(async () => {
      root.render(
        <GameWorld
          apiUrl="http://localhost:4000"
          landingUrl="http://localhost:3000"
          profile={{
            id: '11111111-1111-4111-8111-111111111111',
            displayName: 'Luna Vale',
            appearancePreset: 'moss',
            mapId: 'lantern-square',
            mapVersionId: null,
            x: 12,
            y: 7.5,
            facingDirection: 'south',
            gameStateVersion: 1,
            stateVersion: 1,
            lastTransitionAt: null,
            createdAt: '2026-07-11T04:00:00.000Z',
            updatedAt: '2026-07-11T04:00:00.000Z',
            lastEnteredAt: '2026-07-11T04:00:00.000Z',
          }}
          access={{
            access: 'granted',
            walletAddress: '11111111111111111111111111111111',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '1000',
            observedAmount: '1000',
            expiresAt: '2099-07-11T05:00:00.000Z',
          }}
          rechecking={false}
          onRecheck={vi.fn(async () => undefined)}
          onAccessInvalid={vi.fn()}
          onLeaveVillage={vi.fn(async () => undefined)}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('WASD');
    expect(container.textContent).toContain('Shift');
    expect(container.textContent).toContain('Interact');
    expect(container.textContent).not.toMatch(/[↑↓←→]/u);
    expect(container.querySelector('.game-hud-region--top-left')).not.toBeNull();
    expect(container.querySelector('[data-hud-region="bottom-left"]')).not.toBeNull();
    expect(container.querySelector('[data-hud-region="bottom-center"]')).not.toBeNull();
    expect(container.querySelector('[data-hud-region="bottom-right"]')).not.toBeNull();
    expect(
      (canvasCapture.props as { readonly avatarRendererMode?: string }).avatarRendererMode,
    ).toBe('published_v1');
    expect(
      container
        .querySelector('[data-testid="game-canvas-boundary"]')
        ?.getAttribute('data-input-blocked'),
    ).toBe('false');

    const settings = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Settings',
    );
    expect(settings?.classList.contains('world-settings-button')).toBe(true);
    expect(settings?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('.player-status-dock')).toHaveLength(1);
    expect(container.querySelector('.player-status-dock')?.textContent).toContain('Inventory');
    expect(container.querySelector('.player-status-dock')?.textContent).toContain('Nearby');
    expect(container.querySelector('.player-status-dock')?.textContent).toContain('Friends');
    expect(container.querySelector('.player-status-dock select')).toBeNull();
    expect(container.querySelectorAll('.social-launcher')).toHaveLength(0);
    expect(container.querySelectorAll('.social-graph-launcher')).toHaveLength(0);
    expect(container.querySelectorAll('.activity-launcher')).toHaveLength(0);
    await act(async () => settings?.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('#starville-modal-root [role="dialog"]')?.textContent).toContain(
      'Settings',
    );
    expect(
      container
        .querySelector('[data-testid="game-canvas-boundary"]')
        ?.getAttribute('data-input-blocked'),
    ).toBe('true');
  });

  it('opens notice-board content in the portalled modal layer above the blurred world', async () => {
    await act(async () => {
      root.render(
        <GameWorld
          access={{
            access: 'granted',
            walletAddress: '11111111111111111111111111111111',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '1000',
            observedAmount: '1000',
            expiresAt: '2099-07-11T05:00:00.000Z',
          }}
          apiUrl="http://localhost:4000"
          landingUrl="http://localhost:3000"
          onAccessInvalid={vi.fn()}
          onLeaveVillage={vi.fn(async () => undefined)}
          onRecheck={vi.fn(async () => undefined)}
          profile={{
            id: '11111111-1111-4111-8111-111111111111',
            displayName: 'Luna Vale',
            appearancePreset: 'moss',
            mapId: 'lantern-square',
            mapVersionId: null,
            x: 12,
            y: 7.5,
            facingDirection: 'south',
            gameStateVersion: 1,
            stateVersion: 1,
            lastTransitionAt: null,
            createdAt: '2026-07-11T04:00:00.000Z',
            updatedAt: '2026-07-11T04:00:00.000Z',
            lastEnteredAt: '2026-07-11T04:00:00.000Z',
          }}
          rechecking={false}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const canvasProps = canvasCapture.props as {
      readonly inputBlocked: boolean;
      readonly onInteractionOpen: (interaction: {
        readonly id: string;
        readonly type: 'notice';
        readonly title: string;
        readonly content: string;
        readonly x: number;
        readonly y: number;
        readonly range: number;
      }) => void;
    };
    await act(async () =>
      canvasProps.onInteractionOpen({
        id: 'lantern-board',
        type: 'notice',
        title: 'Lantern Square Notice',
        content: 'Market day begins at first light.',
        x: 12,
        y: 8,
        range: 2,
      }),
    );
    const modalRoot = document.getElementById('starville-modal-root');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(modalRoot?.querySelector('[role="dialog"]')?.textContent).toContain(
      'Market day begins at first light.',
    );
    expect(
      container.querySelector('.world-frame')?.classList.contains('world-frame--modal-open'),
    ).toBe(true);
    expect(
      container
        .querySelector('[data-testid="game-canvas-boundary"]')
        ?.getAttribute('data-input-blocked'),
    ).toBe('true');
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })),
    );
    expect(modalRoot?.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the trusted world visible when a focus-driven parent refresh changes callbacks', async () => {
    const initialWorldFetch = globalThis.fetch;
    let requestCount = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      if (!requestUrl.endsWith('/world/current')) return initialWorldFetch(input, init);
      requestCount += 1;
      if (requestCount === 1) return initialWorldFetch(input, init);
      return new Promise<Response>(() => undefined);
    });
    const profile = {
      id: '11111111-1111-4111-8111-111111111111',
      displayName: 'Luna Vale',
      appearancePreset: 'moss' as const,
      mapId: 'lantern-square' as const,
      mapVersionId: null,
      x: 12,
      y: 7.5,
      facingDirection: 'south' as const,
      gameStateVersion: 1,
      stateVersion: 1,
      lastTransitionAt: null,
      createdAt: '2026-07-11T04:00:00.000Z',
      updatedAt: '2026-07-11T04:00:00.000Z',
      lastEnteredAt: '2026-07-11T04:00:00.000Z',
    };
    const access = {
      access: 'granted' as const,
      walletAddress: '11111111111111111111111111111111',
      network: 'solana:mainnet-beta' as const,
      symbol: 'STAR',
      requiredAmount: '1000',
      observedAmount: '1000',
      expiresAt: '2099-07-11T05:00:00.000Z',
    };

    await act(async () => {
      root.render(
        <GameWorld
          access={access}
          apiUrl="http://localhost:4000"
          landingUrl="http://localhost:3000"
          onAccessInvalid={vi.fn()}
          onLeaveVillage={vi.fn(async () => undefined)}
          onRecheck={vi.fn(async () => undefined)}
          profile={profile}
          rechecking={false}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('Lantern Square');
    expect(requestCount).toBe(1);

    await act(async () => {
      root.render(
        <GameWorld
          access={{ ...access }}
          apiUrl="http://localhost:4000"
          landingUrl="http://localhost:3000"
          onAccessInvalid={vi.fn()}
          onLeaveVillage={vi.fn(async () => undefined)}
          onRecheck={vi.fn(async () => undefined)}
          profile={{ ...profile }}
          rechecking
        />,
      );
    });

    expect(container.textContent).toContain('Lantern Square');
    expect(container.textContent).not.toContain('Preparing your safe arrival');
    expect(requestCount).toBe(1);
  });

  it('keeps one runtime, applies only the server-authoritative destination, and updates the HUD', async () => {
    await act(async () => {
      root.render(
        <GameWorld
          apiUrl="http://localhost:4000"
          landingUrl="http://localhost:3000"
          profile={{
            id: '11111111-1111-4111-8111-111111111111',
            displayName: 'Luna Vale',
            appearancePreset: 'moss',
            mapId: 'lantern-square',
            mapVersionId: null,
            x: 12,
            y: 7.5,
            facingDirection: 'south',
            gameStateVersion: 1,
            stateVersion: 1,
            lastTransitionAt: null,
            createdAt: '2026-07-11T04:00:00.000Z',
            updatedAt: '2026-07-11T04:00:00.000Z',
            lastEnteredAt: '2026-07-11T04:00:00.000Z',
          }}
          access={{
            access: 'granted',
            walletAddress: '11111111111111111111111111111111',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '1000',
            observedAmount: '1000',
            expiresAt: '2099-07-11T05:00:00.000Z',
          }}
          rechecking={false}
          onRecheck={vi.fn(async () => undefined)}
          onAccessInvalid={vi.fn()}
          onLeaveVillage={vi.fn(async () => undefined)}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const runtime = {
      interact: vi.fn(),
      loadWorld: vi.fn(),
      cancelTransition: vi.fn(),
      destroy: vi.fn(),
    };
    const props = canvasCapture.props as {
      readonly onRuntimeCreated: (value: typeof runtime) => void;
      readonly onExitRequested: (request: {
        readonly exitId: string;
        readonly mapId: 'lantern-square';
        readonly mapVersionId: string;
        readonly destinationLabel: string;
      }) => void;
    };
    props.onRuntimeCreated(runtime);
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          map: {
            id: '33333333-3333-4333-8333-333333333333',
            slug: 'moonpetal-meadow',
            displayName: 'Moonpetal Meadow',
            description: 'A moonlit flower meadow gathered around a quiet stone marker and pond.',
          },
          version: {
            id: '44444444-4444-4444-8444-444444444444',
            versionNumber: 1,
            checksum: 'b'.repeat(64),
            publishedAt: '2026-07-12T04:01:00.000Z',
          },
          manifest: getWorldManifest('moonpetal-meadow'),
          playerState: {
            mapId: 'moonpetal-meadow',
            mapVersionId: '44444444-4444-4444-8444-444444444444',
            x: 10,
            y: 14.5,
            facingDirection: 'north',
            gameStateVersion: 2,
            updatedAt: '2026-07-12T04:01:00.000Z',
            lastTransitionAt: '2026-07-12T04:01:00.000Z',
          },
          transition: {
            exitId: 'exit-north',
            fromMapId: 'lantern-square',
            toMapId: 'moonpetal-meadow',
            destinationSpawnId: 'from-south',
            completedAt: '2026-07-12T04:01:00.000Z',
          },
        },
      }),
    );
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(2_000);

    await act(async () => {
      props.onExitRequested({
        exitId: 'exit-north',
        mapId: 'lantern-square',
        mapVersionId: '22222222-2222-4222-8222-222222222222',
        destinationLabel: 'Moonpetal Meadow',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(persistenceMocks.beginTransition).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.acceptAuthoritativeTransition).toHaveBeenCalledWith(
      expect.objectContaining({ mapId: 'moonpetal-meadow', gameStateVersion: 2 }),
    );
    expect(runtime.loadWorld).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({ id: 'moonpetal-meadow' }),
        versionId: '44444444-4444-4444-8444-444444444444',
      }),
      expect.objectContaining({ mapId: 'moonpetal-meadow', x: 10, y: 14.5 }),
    );
    expect(container.textContent).toContain('Moonpetal Meadow');
  });

  it('routes a typed shop interaction to the React cozy panel and blocks Phaser input', async () => {
    await act(async () => {
      root.render(
        <GameWorld
          apiUrl="http://localhost:4000"
          landingUrl="http://localhost:3000"
          profile={{
            id: '11111111-1111-4111-8111-111111111111',
            displayName: 'Luna Vale',
            appearancePreset: 'moss',
            mapId: 'lantern-square',
            mapVersionId: null,
            x: 12,
            y: 7.5,
            facingDirection: 'south',
            gameStateVersion: 1,
            stateVersion: 1,
            lastTransitionAt: null,
            createdAt: '2026-07-11T04:00:00.000Z',
            updatedAt: '2026-07-11T04:00:00.000Z',
            lastEnteredAt: '2026-07-11T04:00:00.000Z',
          }}
          access={{
            access: 'granted',
            walletAddress: '11111111111111111111111111111111',
            network: 'solana:mainnet-beta',
            symbol: 'STAR',
            requiredAmount: '1000',
            observedAmount: '1000',
            expiresAt: '2099-07-11T05:00:00.000Z',
          }}
          rechecking={false}
          onRecheck={vi.fn(async () => undefined)}
          onAccessInvalid={vi.fn()}
          onLeaveVillage={vi.fn(async () => undefined)}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const props = canvasCapture.props as {
      readonly onInteractionOpen: (interaction: {
        readonly id: string;
        readonly type: 'shop';
        readonly title: string;
        readonly content: string;
        readonly x: number;
        readonly y: number;
        readonly range: number;
        readonly shopSlug: string;
      }) => void;
    };
    await act(async () => {
      props.onInteractionOpen({
        id: 'lantern-general-store',
        type: 'shop',
        title: 'Lantern General Store',
        content: 'A trusted village shop.',
        x: 10,
        y: 8,
        range: 1.5,
        shopSlug: 'lantern-general-store',
      });
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('#starville-modal-root [role="dialog"]')?.textContent).toContain(
      'Lantern General Store',
    );
    expect(
      container
        .querySelector('[data-testid="game-canvas-boundary"]')
        ?.getAttribute('data-input-blocked'),
    ).toBe('true');
  });
});
