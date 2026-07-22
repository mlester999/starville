import { defaultMapSpawn, type WorldInteraction } from '@starville/game-core';
import { PRODUCTION_SLICE_V3_MANIFEST } from '@starville/game-content';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productionSliceRuntimeWorld } from '../app/production-slice-review';
import type { GameRuntimeHandle, GameRuntimeDiagnostics } from '../game/contracts';
import type { GameCanvas } from './GameCanvas';
import { ProductionSliceReview } from './ProductionSliceReview';

let gameCanvasProps: ComponentProps<typeof GameCanvas> | null = null;

vi.mock('./GameCanvas', () => ({
  GameCanvas: (props: ComponentProps<typeof GameCanvas>) => {
    gameCanvasProps = props;
    return <div aria-label="Fixture game canvas" className="game-canvas" tabIndex={0} />;
  },
}));

vi.mock('./WorldNoticeModal', () => ({
  WorldNoticeModal: () => <div>Fixture notice</div>,
}));

const entrance: WorldInteraction = {
  id: 'slice-cottage-entrance',
  type: 'home_entrance',
  x: 22.8,
  y: 12.7,
  range: 2,
  title: 'Amber Cottage',
  content: 'Enter the local cottage fixture.',
  homeTemplateSlug: 'amber-cottage',
};

function diagnostics(): GameRuntimeDiagnostics {
  return {
    location: 'Lantern Square Production Slice',
    mapVersion: 1214,
    position: {
      mapId: 'lantern-square',
      x: 22.8,
      y: 12.7,
      facingDirection: 'south',
    },
    input: { up: false, down: false, left: false, right: false },
    worldVelocity: { x: 0, y: 0 },
    jogging: false,
    animation: {
      state: 'idle',
      direction: 'south',
      frame: 0,
      frameInState: 0,
      elapsedMs: 0,
      distanceTiles: 0,
    },
    camera: {
      worldView: { x: 640, y: 420, width: 1_440, height: 900 },
      bounds: { minX: 0, minY: 0, maxX: 3_840, maxY: 1_920 },
    },
    culling: {
      activeTerrainChunks: 12,
      totalTerrainChunks: 30,
      visibleTerrainNodes: 240,
      totalTerrainNodes: 1_920,
      visibleTerrainAuxiliaryNodes: 26,
      totalTerrainAuxiliaryNodes: 147,
      visibleObjects: 18,
      totalObjects: 30,
    },
    collision: { nearbyShapes: 3, totalShapes: 70, playerFootRadius: 0.24 },
    transitionPending: false,
  };
}

function runtime(overrides: Partial<GameRuntimeHandle> = {}): GameRuntimeHandle {
  return {
    setInputBlocked: vi.fn(),
    setTouchMovementInput: vi.fn(),
    setTouchJogging: vi.fn(),
    setCollisionDebug: vi.fn(),
    setAudioSettings: vi.fn(),
    setRemotePresences: vi.fn(),
    setLocalAvatarProfile: vi.fn(),
    setRemoteAvatarProfiles: vi.fn(),
    setRemotePlayerNamesVisible: vi.fn(),
    setVisualSettings: vi.fn(),
    setChatBubbleMessages: vi.fn(),
    setReducedMotion: vi.fn(),
    setSelectedRemotePresence: vi.fn(),
    setActivityInstance: vi.fn(),
    interact: vi.fn(),
    getState: vi.fn(() => ({
      mapId: 'lantern-square' as const,
      x: 22.8,
      y: 12.7,
      facingDirection: 'south' as const,
    })),
    getDiagnostics: vi.fn(diagnostics),
    loadWorld: vi.fn(),
    cancelTransition: vi.fn(),
    destroy: vi.fn(),
    ...overrides,
  };
}

function currentCanvasProps(): ComponentProps<typeof GameCanvas> {
  if (gameCanvasProps === null) throw new Error('GameCanvas fixture was not rendered.');
  return gameCanvasProps;
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

let container: HTMLDivElement;
let root: Root;
let reducedMotionPreference = false;
let reducedMotionListener: ((event: MediaQueryListEvent) => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState(null, '', '/?visual-candidate=production-slice-v3');
  reducedMotionPreference = false;
  reducedMotionListener = null;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(
      () =>
        ({
          matches: reducedMotionPreference,
          media: '(prefers-reduced-motion: reduce)',
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(
            (_type: string, listener: (event: MediaQueryListEvent) => void) => {
              reducedMotionListener = listener;
            },
          ),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => true),
        }) as unknown as MediaQueryList,
    ),
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  gameCanvasProps = null;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

async function renderReview(): Promise<void> {
  await act(async () => root.render(<ProductionSliceReview initialVersion="v3" />));
}

describe('ProductionSliceReview local fixture surface', () => {
  it('labels review-only identity, currency, hotbar, and touch interaction data explicitly', async () => {
    window.history.replaceState(null, '', '/?visual-candidate=production-slice-v3&review-mobile=1');
    await renderReview();
    const handle = runtime();
    await act(async () => {
      currentCanvasProps().onRuntimeCreated(handle);
      currentCanvasProps().onReady();
      currentCanvasProps().onInteractionTarget({
        id: entrance.id,
        label: 'Enter Amber Cottage',
      });
    });

    expect(container.textContent).toContain('Local fixture profile · Marlowe · Lv 12');
    expect(container.textContent).toContain('2,480 DUST · fixture');
    expect(container.textContent).toContain('Fixture hotbar');
    const touchAction = container.querySelector<HTMLButtonElement>(
      '.production-slice-mobile-interaction',
    );
    expect(touchAction?.textContent).toContain('Enter Amber Cottage');
    await act(async () => touchAction?.click());
    expect(handle.interact).toHaveBeenCalledTimes(1);
  });

  it('tracks the system reduced-motion preference and its live changes', async () => {
    reducedMotionPreference = true;
    await renderReview();

    expect(container.querySelector('main')?.classList).toContain(
      'production-slice-review--reduced-motion',
    );
    expect(currentCanvasProps().reducedMotion).toBe(true);
    await act(async () => reducedMotionListener?.({ matches: false } as MediaQueryListEvent));
    expect(container.querySelector('main')?.classList).not.toContain(
      'production-slice-review--reduced-motion',
    );
    expect(currentCanvasProps().reducedMotion).toBe(false);
  });

  it('loads one destination request and only completes for the exact requested world', async () => {
    await renderReview();
    const loadWorld = vi.fn<GameRuntimeHandle['loadWorld']>();
    const handle = runtime({ loadWorld });
    await act(async () => {
      currentCanvasProps().onRuntimeCreated(handle);
      currentCanvasProps().onReady();
      currentCanvasProps().onInteractionOpen(entrance);
      currentCanvasProps().onInteractionOpen(entrance);
    });

    expect(
      container.querySelector('.production-slice-transition')?.getAttribute('data-state'),
    ).toBe('fading-out');
    await act(async () => vi.advanceTimersByTime(240));
    expect(loadWorld).toHaveBeenCalledTimes(1);
    const requestedWorld = loadWorld.mock.calls[0]?.[0];
    expect(requestedWorld?.manifest.name).toBe('Amber Cottage Interior');

    await act(async () =>
      currentCanvasProps().onMapChanged(productionSliceRuntimeWorld('v3', 'interior')),
    );
    expect(
      container.querySelector('.production-slice-transition')?.getAttribute('data-state'),
    ).toBe('loading');
    if (requestedWorld === undefined) throw new Error('Destination world was not captured.');
    await act(async () => currentCanvasProps().onMapChanged(requestedWorld));
    expect(
      container.querySelector('.production-slice-transition')?.getAttribute('data-state'),
    ).toBe('fading-in');
    await act(async () => vi.advanceTimersByTime(260));
    expect(container.querySelector('main')?.getAttribute('aria-busy')).toBe('false');
    expect(document.activeElement).toBe(container.querySelector('.game-canvas'));
    expect(container.textContent).toContain('Local fixture profile · Marlowe · Lv 12');
    expect(container.textContent).toContain('2,480 DUST · fixture');
    expect(container.textContent).toContain('Fixture hotbar');
  });

  it('cancels a pending transition and recovers from a synchronous load failure', async () => {
    await renderReview();
    const loadWorld = vi.fn<GameRuntimeHandle['loadWorld']>(() => {
      throw new Error('fixture load failure');
    });
    const handle = runtime({ loadWorld });
    await act(async () => {
      currentCanvasProps().onRuntimeCreated(handle);
      currentCanvasProps().onInteractionOpen(entrance);
    });
    await act(async () => button('Cancel transition')?.click());
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(loadWorld).not.toHaveBeenCalled();
    expect(handle.cancelTransition).toHaveBeenCalled();
    expect(container.querySelector('main')?.getAttribute('aria-busy')).toBe('false');

    await act(async () => currentCanvasProps().onInteractionOpen(entrance));
    await act(async () => vi.advanceTimersByTime(240));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'transition was cancelled',
    );
    expect(container.querySelector('main')?.getAttribute('aria-busy')).toBe('false');
  });

  it('uses an explicit exterior spawn when changing version from an interior URL', async () => {
    window.history.replaceState(
      null,
      '',
      '/?visual-candidate=production-slice-v3&review-location=interior',
    );
    await renderReview();
    expect(currentCanvasProps().initialWorld.manifest.name).toBe('Amber Cottage Interior');

    await act(async () => button('V1')?.click());
    expect(currentCanvasProps().initialWorld.manifest).toBe(PRODUCTION_SLICE_V3_MANIFEST);
    expect(currentCanvasProps().initialState).toMatchObject({
      mapId: 'lantern-square',
      ...defaultMapSpawn(PRODUCTION_SLICE_V3_MANIFEST),
    });
  });

  it('shows map, foot-anchor, camera, culling, and transition diagnostics', async () => {
    window.history.replaceState(null, '', '/?visual-candidate=production-slice-v3&diagnostics=1');
    await renderReview();
    const handle = runtime();
    await act(async () => {
      currentCanvasProps().onRuntimeCreated(handle);
      vi.advanceTimersByTime(100);
    });

    const panel = container.querySelector('.production-slice-diagnostics');
    expect(panel?.textContent).toContain('Location Lantern Square Production Slice');
    expect(panel?.textContent).toContain('Player position 22.800, 12.700');
    expect(panel?.textContent).toContain('Foot anchor 22.800, 12.700');
    expect(panel?.textContent).toContain(
      `World ${PRODUCTION_SLICE_V3_MANIFEST.width}×${PRODUCTION_SLICE_V3_MANIFEST.height} tiles`,
    );
    expect(panel?.textContent).toContain('Camera bounds');
    expect(panel?.textContent).toContain('Terrain 240/1920 visible');
    expect(panel?.textContent).toContain('Terrain auxiliary 26/147 visible');
    expect(panel?.textContent).toContain('Transition idle');
  });
});
