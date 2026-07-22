import {
  PRODUCTION_SLICE_AVATAR_COLUMNS,
  PRODUCTION_SLICE_AVATAR_MAPPINGS,
  PRODUCTION_SLICE_AVATAR_RUNTIME_URL,
} from '@starville/avatar';
import {
  getBundledAsset,
  STARVILLE_BUNDLED_MANIFEST_VERSION,
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  STARVILLE_PRODUCTION_SLICE_MANIFEST_VERSION,
  type BundledManifestVersion,
} from '@starville/asset-management';
import {
  defaultMapSpawn,
  type PlayerStateUpdate,
  type WorldInteraction,
} from '@starville/game-core';
import { PRODUCTION_SLICE_V3_MANIFEST } from '@starville/game-content';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  PRODUCTION_SLICE_REVIEW_LABEL,
  productionSliceReviewInitialState,
  productionSliceReviewCheckpoint,
  productionSliceReviewConfig,
  productionSliceRuntimeWorld,
  type ProductionSliceReviewLocation,
  type ProductionSliceReviewVersion,
} from '../app/production-slice-review';
import { fallbackResolvedAvatar } from '../app/avatar-client';
import type {
  GameRuntimeDiagnostics,
  GameRuntimeHandle,
  InteractionDialogue,
  InteractionPrompt,
  RuntimeWorld,
} from '../game/contracts';
import { interactionDialogue } from '../game/contracts';
import { GameCanvas } from './GameCanvas';
import { WorldNoticeModal } from './WorldNoticeModal';

type ReviewPanel = 'world' | 'characters' | 'comparison';
type LocationTransitionPhase = 'idle' | 'fading-out' | 'loading' | 'fading-in';

interface LocationTransitionState {
  readonly phase: LocationTransitionPhase;
  readonly destination: ProductionSliceReviewLocation | null;
  readonly status: string;
}

interface PendingLocationTransition {
  readonly requestId: number;
  readonly destination: ProductionSliceReviewLocation;
  readonly expectedWorld: RuntimeWorld;
  completed: boolean;
}

const IDLE_LOCATION_TRANSITION: LocationTransitionState = Object.freeze({
  phase: 'idle',
  destination: null,
  status: '',
});

const VERSION_ORDER: readonly ProductionSliceReviewVersion[] = ['v1', 'v2', 'v3'];
const MANIFEST_BY_VERSION: Readonly<Record<ProductionSliceReviewVersion, BundledManifestVersion>> =
  {
    v1: STARVILLE_BUNDLED_MANIFEST_VERSION,
    v2: STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
    v3: STARVILLE_PRODUCTION_SLICE_MANIFEST_VERSION,
  };
const HOTBAR_ITEMS = ['Lantern', 'Journal', 'Map', 'Emote', 'Photo'] as const;
const MOTION_FIXTURES = {
  north: { up: true, down: false, left: false, right: false },
  northeast: { up: true, down: false, left: false, right: true },
  east: { up: false, down: false, left: false, right: true },
  southeast: { up: false, down: true, left: false, right: true },
  south: { up: false, down: true, left: false, right: false },
  southwest: { up: false, down: true, left: true, right: false },
  west: { up: false, down: false, left: true, right: false },
  northwest: { up: true, down: false, left: true, right: false },
} as const;

function initialPlayerState(): PlayerStateUpdate {
  return productionSliceReviewInitialState(window.location.search);
}

function updateReviewQuery(
  version: ProductionSliceReviewVersion,
  panel: ReviewPanel,
  location: ProductionSliceReviewLocation,
): void {
  const next = new URL(window.location.href);
  next.searchParams.set('visual-version', version);
  if (panel === 'world') next.searchParams.delete('review-panel');
  else next.searchParams.set('review-panel', panel);
  if (location === 'interior') next.searchParams.set('review-location', 'interior');
  else next.searchParams.delete('review-location');
  window.history.replaceState(null, '', next);
}

function CharacterMatrix({ reducedMotion }: { readonly reducedMotion: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (reducedMotion) {
      setElapsed(0);
      return undefined;
    }
    const started = performance.now();
    const interval = window.setInterval(() => setElapsed(performance.now() - started), 60);
    return () => window.clearInterval(interval);
  }, [reducedMotion]);
  return (
    <section className="production-slice-matrix" aria-labelledby="production-character-matrix">
      <div className="production-slice-panel__heading">
        <div>
          <span>Automated checkpoint</span>
          <h2 id="production-character-matrix">
            Eight-direction idle, distance-driven walk, and jog
          </h2>
        </div>
        <p>24 mappings · 96 authored frames · root-synchronized locomotion</p>
      </div>
      <div className="production-slice-matrix__grid">
        {PRODUCTION_SLICE_AVATAR_MAPPINGS.map((mapping) => {
          const frameInState = reducedMotion
            ? 0
            : Math.floor(elapsed / mapping.frameDurationMs) % mapping.frameCount;
          const column = mapping.startColumn + frameInState;
          const style = {
            '--sprite-column': column,
            '--sprite-row': mapping.row,
            '--sprite-columns': PRODUCTION_SLICE_AVATAR_COLUMNS,
            backgroundImage: `url(${PRODUCTION_SLICE_AVATAR_RUNTIME_URL})`,
          } as CSSProperties;
          return (
            <article
              className="production-slice-matrix__cell"
              key={`${mapping.state}:${mapping.direction}`}
            >
              <div className="production-slice-matrix__sprite" style={style} aria-hidden="true" />
              <strong>{mapping.direction}</strong>
              <span>
                {mapping.state} · frame {frameInState + 1}/{mapping.frameCount} ·{' '}
                {Math.round(elapsed)} ms
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ComparisonPanel() {
  const keys = ['cottage-amber', 'tree-maple', 'notice-board'] as const;
  return (
    <section className="production-slice-comparison" aria-labelledby="production-comparison">
      <div className="production-slice-panel__heading">
        <div>
          <span>Same stable keys</span>
          <h2 id="production-comparison">V1 / rejected V2 / V3 art comparison</h2>
        </div>
        <p>No player, world, or hosted configuration mutation</p>
      </div>
      <div className="production-slice-comparison__grid">
        {VERSION_ORDER.map((version) => (
          <article key={version} data-review-version={version}>
            <header>
              <strong>{productionSliceReviewConfig(version).label}</strong>
              <span>Manifest {MANIFEST_BY_VERSION[version]}</span>
            </header>
            <div className="production-slice-comparison__assets">
              {keys.map((key) => {
                const asset = getBundledAsset(key, MANIFEST_BY_VERSION[version]);
                return asset === undefined ? null : (
                  <figure key={key}>
                    <img
                      alt={asset.accessibilityLabel}
                      loading="lazy"
                      src={`${asset.runtimePath}?manifest=${asset.bundledVersion}`}
                    />
                    <figcaption>{asset.displayName}</figcaption>
                  </figure>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ProductionSliceReview({
  initialVersion,
}: {
  readonly initialVersion: ProductionSliceReviewVersion;
}) {
  const [version, setVersion] = useState(initialVersion);
  const [location, setLocation] = useState<ProductionSliceReviewLocation>(() =>
    new URLSearchParams(window.location.search).get('review-location') === 'interior'
      ? 'interior'
      : 'exterior',
  );
  const [panel, setPanel] = useState<ReviewPanel>(() => {
    const requested = new URLSearchParams(window.location.search).get('review-panel');
    return requested === 'characters' || requested === 'comparison' ? requested : 'world';
  });
  const [playerState, setPlayerState] = useState<PlayerStateUpdate>(initialPlayerState);
  const [interaction, setInteraction] = useState<InteractionPrompt | null>(null);
  const [dialogue, setDialogue] = useState<InteractionDialogue | null>(null);
  const [ready, setReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [locationVisible, setLocationVisible] = useState(true);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [reducedMotionOverride, setReducedMotionOverride] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const mobileFixture = new URLSearchParams(window.location.search).get('review-mobile') === '1';
  const desktopFixture = new URLSearchParams(window.location.search).get('review-size');
  const motionFixture = new URLSearchParams(window.location.search).get('review-motion');
  const motionState = new URLSearchParams(window.location.search).get('review-motion-state');
  const overviewCamera =
    new URLSearchParams(window.location.search).get('review-camera') === 'overview';
  const [collisionDebug, setCollisionDebug] = useState(
    () => new URLSearchParams(window.location.search).get('diagnostics') === '1',
  );
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(
    () => new URLSearchParams(window.location.search).get('diagnostics') === '1',
  );
  const [diagnostics, setDiagnostics] = useState<GameRuntimeDiagnostics | null>(null);
  const [transition, setTransition] = useState<LocationTransitionState>(IDLE_LOCATION_TRANSITION);
  const runtimeRef = useRef<GameRuntimeHandle | null>(null);
  const motionTimeoutRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const transitionRequestIdRef = useRef(0);
  const pendingLocationRef = useRef<PendingLocationTransition | null>(null);
  const reviewFrameRef = useRef<HTMLDivElement | null>(null);
  const cottageExteriorCheckpoint = productionSliceReviewCheckpoint('cottage-entry');
  const exteriorReturnRef = useRef<PlayerStateUpdate>({
    mapId: PRODUCTION_SLICE_V3_MANIFEST.id,
    ...cottageExteriorCheckpoint,
    facingDirection: 'south',
  });
  const world = useMemo(() => productionSliceRuntimeWorld(version, location), [location, version]);
  const reviewAvatarProfile = useMemo(() => fallbackResolvedAvatar('marigold'), []);
  const config = productionSliceReviewConfig(version);
  const reducedMotion = systemReducedMotion || reducedMotionOverride;
  const inputBlocked =
    dialogue !== null || settingsOpen || panel !== 'world' || transition.phase !== 'idle';

  useEffect(() => {
    document.body.classList.add('phase12f-review-active');
    document.title = 'Starville · Production Art Vertical Slice · Local';
    return () => document.body.classList.remove('phase12f-review-active');
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyPreference = (event: MediaQueryListEvent): void =>
      setSystemReducedMotion(event.matches);
    setSystemReducedMotion(preference.matches);
    preference.addEventListener?.('change', applyPreference);
    return () => preference.removeEventListener?.('change', applyPreference);
  }, []);

  useEffect(
    () => () => {
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
      pendingLocationRef.current = null;
      runtimeRef.current?.cancelTransition();
    },
    [],
  );

  useEffect(() => {
    updateReviewQuery(version, panel, location);
  }, [location, panel, version]);

  useEffect(() => {
    if (!diagnosticsOpen) return undefined;
    const interval = window.setInterval(() => {
      const runtime = runtimeRef.current;
      if (runtime !== null) setDiagnostics(runtime.getDiagnostics());
    }, 100);
    return () => window.clearInterval(interval);
  }, [diagnosticsOpen]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (
      !ready ||
      runtime === null ||
      motionFixture === null ||
      !(motionFixture in MOTION_FIXTURES)
    ) {
      return undefined;
    }
    runtime.setTouchMovementInput(MOTION_FIXTURES[motionFixture as keyof typeof MOTION_FIXTURES]);
    runtime.setTouchJogging(motionState === 'jog');
    const timeout = window.setTimeout(() => {
      runtime.setTouchMovementInput({ up: false, down: false, left: false, right: false });
      runtime.setTouchJogging(false);
    }, 30_000);
    motionTimeoutRef.current = timeout;
    return () => {
      window.clearTimeout(timeout);
      runtime.setTouchMovementInput({ up: false, down: false, left: false, right: false });
      runtime.setTouchJogging(false);
    };
  }, [motionFixture, motionState, ready]);

  useEffect(() => {
    setLocationVisible(true);
    if (mobileFixture) return undefined;
    const timeout = window.setTimeout(() => setLocationVisible(false), 4_500);
    return () => window.clearTimeout(timeout);
  }, [location, mobileFixture, version]);

  function selectVersion(next: ProductionSliceReviewVersion): void {
    if (next === version) return;
    clearTransitionTimeout();
    pendingLocationRef.current = null;
    runtimeRef.current?.cancelTransition();
    const exteriorManifest = PRODUCTION_SLICE_V3_MANIFEST;
    setVersion(next);
    setLocation('exterior');
    setTransition(IDLE_LOCATION_TRANSITION);
    setReady(false);
    setRuntimeError(null);
    setInteraction(null);
    setDialogue(null);
    setPlayerState({ mapId: exteriorManifest.id, ...defaultMapSpawn(exteriorManifest) });
    setLocationVisible(true);
  }

  function clearTransitionTimeout(): void {
    if (transitionTimeoutRef.current === null) return;
    window.clearTimeout(transitionTimeoutRef.current);
    transitionTimeoutRef.current = null;
  }

  function focusReviewWorld(): void {
    const frame = reviewFrameRef.current;
    const canvas = frame?.querySelector<HTMLElement>('.game-canvas');
    (canvas ?? frame)?.focus({ preventScroll: true });
  }

  function cancelLocationTransition(): void {
    const pending = pendingLocationRef.current;
    if (pending === null || pending.completed) return;
    clearTransitionTimeout();
    pendingLocationRef.current = null;
    runtimeRef.current?.cancelTransition();
    setTransition(IDLE_LOCATION_TRANSITION);
    setInteraction(null);
    focusReviewWorld();
  }

  function failLocationTransition(message: string): void {
    const pending = pendingLocationRef.current;
    clearTransitionTimeout();
    pendingLocationRef.current = null;
    if (pending?.completed !== true) runtimeRef.current?.cancelTransition();
    setTransition(IDLE_LOCATION_TRANSITION);
    setInteraction(null);
    setRuntimeError(
      pending === null || pending.completed
        ? message
        : `${message} The ${pending.destination} fixture transition was cancelled; the source fixture remains selected.`,
    );
    focusReviewWorld();
  }

  function completeWorldLoad(loaded: RuntimeWorld): void {
    const pending = pendingLocationRef.current;
    if (
      pending === null ||
      pending.completed ||
      loaded !== pending.expectedWorld ||
      loaded.versionId !== pending.expectedWorld.versionId ||
      loaded.checksum !== pending.expectedWorld.checksum ||
      loaded.manifest.id !== pending.expectedWorld.manifest.id ||
      loaded.manifest.name !== pending.expectedWorld.manifest.name
    ) {
      return;
    }
    pending.completed = true;
    clearTransitionTimeout();
    setLocation(pending.destination);
    setPlayerState(runtimeRef.current?.getState() ?? playerState);
    setTransition({
      phase: 'fading-in',
      destination: pending.destination,
      status:
        pending.destination === 'interior'
          ? 'Amber Cottage interior loaded.'
          : 'Lantern Square restored.',
    });
    transitionTimeoutRef.current = window.setTimeout(
      () => {
        if (pendingLocationRef.current?.requestId !== pending.requestId) return;
        pendingLocationRef.current = null;
        transitionTimeoutRef.current = null;
        setTransition(IDLE_LOCATION_TRANSITION);
        focusReviewWorld();
      },
      reducedMotion ? 90 : 260,
    );
  }

  function beginLocationTransition(destination: ProductionSliceReviewLocation): void {
    const runtime = runtimeRef.current;
    if (
      runtime === null ||
      destination === location ||
      transition.phase !== 'idle' ||
      pendingLocationRef.current !== null
    ) {
      return;
    }
    if (destination === 'interior') {
      exteriorReturnRef.current = {
        ...runtime.getState(),
        ...cottageExteriorCheckpoint,
        facingDirection: 'south',
      };
    }
    const expectedWorld = productionSliceRuntimeWorld(version, destination);
    const requestId = transitionRequestIdRef.current + 1;
    transitionRequestIdRef.current = requestId;
    pendingLocationRef.current = {
      requestId,
      destination,
      expectedWorld,
      completed: false,
    };
    setRuntimeError(null);
    setInteraction(null);
    setTransition({
      phase: 'fading-out',
      destination,
      status:
        destination === 'interior' ? 'Entering Amber Cottage…' : 'Returning to Lantern Square…',
    });
    transitionTimeoutRef.current = window.setTimeout(
      () => {
        const pending = pendingLocationRef.current;
        if (pending?.requestId !== requestId || pending.completed) return;
        transitionTimeoutRef.current = null;
        const destinationState =
          destination === 'interior'
            ? {
                mapId: pending.expectedWorld.manifest.id,
                ...defaultMapSpawn(pending.expectedWorld.manifest),
              }
            : exteriorReturnRef.current;
        setTransition({
          phase: 'loading',
          destination,
          status:
            destination === 'interior'
              ? 'Loading Amber Cottage interior…'
              : 'Loading Lantern Square…',
        });
        try {
          runtime.loadWorld(pending.expectedWorld, destinationState);
          if (pendingLocationRef.current?.requestId === requestId && !pending.completed) {
            transitionTimeoutRef.current = window.setTimeout(
              () =>
                failLocationTransition(
                  'The local destination fixture did not finish loading in time.',
                ),
              10_000,
            );
          }
        } catch {
          failLocationTransition('The local destination fixture could not be prepared safely.');
        }
      },
      reducedMotion ? 90 : 240,
    );
  }

  function openInteraction(opened: WorldInteraction): void {
    if (version === 'v3' && opened.id === 'slice-cottage-entrance') {
      beginLocationTransition('interior');
      return;
    }
    if (version === 'v3' && opened.id === 'interior-exit') {
      beginLocationTransition('exterior');
      return;
    }
    setDialogue(interactionDialogue(opened));
  }

  return (
    <main
      className={`production-slice-review${highContrast ? ' production-slice-review--contrast' : ''}${reducedMotion ? ' production-slice-review--reduced-motion' : ''}${mobileFixture ? ' production-slice-review--mobile-fixture' : ''}${desktopFixture === '1440x900' ? ' production-slice-review--desktop-1440' : ''}${desktopFixture === '1920x1080' ? ' production-slice-review--desktop-1920' : ''}`}
      data-candidate="starville-production-slice-v3"
      data-published="false"
      aria-busy={transition.phase !== 'idle'}
    >
      <div className="production-slice-review__frame" ref={reviewFrameRef} tabIndex={-1}>
        <GameCanvas
          key={version}
          appearancePreset="marigold"
          audioSettings={{ masterVolume: 0, muted: true }}
          avatarProfile={reviewAvatarProfile}
          avatarRendererMode={config.rendererMode}
          {...(location === 'exterior' && overviewCamera ? { cameraZoomOverride: 0.32 } : {})}
          initialState={playerState}
          initialWorld={world}
          inputBlocked={inputBlocked}
          collisionDebug={collisionDebug || highContrast}
          reducedMotion={reducedMotion}
          visualSettings={{ shadows: true, ambientEffects: true, animatedWater: true }}
          onCheckpoint={() => undefined}
          onError={failLocationTransition}
          onExitRequested={() => undefined}
          onFinalState={() => undefined}
          onInteractionOpen={openInteraction}
          onInteractionTarget={setInteraction}
          onMapChanged={completeWorldLoad}
          onReady={() => setReady(true)}
          onRuntimeCreated={(runtime) => {
            runtimeRef.current = runtime;
            if (motionTimeoutRef.current !== null) {
              window.clearTimeout(motionTimeoutRef.current);
              motionTimeoutRef.current = null;
            }
          }}
          onSettingsRequested={() => setSettingsOpen((open) => !open)}
          onStateChanged={(state) => setPlayerState(state)}
        />
      </div>

      <section
        className="production-slice-hud production-slice-hud--identity"
        aria-label="Local fixture player identity and objective"
      >
        <span className="production-slice-hud__eyebrow">
          Local fixture profile · Marlowe · Lv 12
        </span>
        <strong>Meet the square at dusk</strong>
        <small>Fixture objective · no authenticated persistence</small>
      </section>

      <section
        className="production-slice-hud production-slice-hud--location"
        aria-label="Location and visual candidate"
      >
        <strong data-visible={locationVisible}>
          {location === 'interior'
            ? 'Amber Cottage · Interior Rescue'
            : 'Lantern Square · Garden Quarter Polish'}
        </strong>
        <span>{PRODUCTION_SLICE_REVIEW_LABEL}</span>
        <div className="production-slice-version-tabs" aria-label="Visual comparison version">
          {VERSION_ORDER.map((item) => (
            <button
              aria-pressed={version === item}
              data-version={item}
              disabled={version === item}
              key={item}
              type="button"
              onClick={() => selectVersion(item)}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      <nav
        className="production-slice-hud production-slice-hud--actions"
        aria-label="Review and game controls"
      >
        <span className="production-slice-network" title="Local fixture renderer ready">
          ● Local fixture
        </span>
        <button
          type="button"
          aria-pressed={panel === 'characters'}
          onClick={() => setPanel(panel === 'characters' ? 'world' : 'characters')}
        >
          Character
        </button>
        <button
          type="button"
          aria-pressed={panel === 'comparison'}
          onClick={() => setPanel(panel === 'comparison' ? 'world' : 'comparison')}
        >
          Compare
        </button>
        <button
          type="button"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          Settings
        </button>
        <button
          type="button"
          aria-pressed={diagnosticsOpen}
          onClick={() => setDiagnosticsOpen((open) => !open)}
        >
          Diagnostics
        </button>
        <button type="button" aria-expanded={helpOpen} onClick={() => setHelpOpen((open) => !open)}>
          Help
        </button>
      </nav>

      {settingsOpen ? (
        <section
          className="production-slice-popover production-slice-popover--settings"
          aria-label="Visual review settings"
        >
          <strong>Review settings</strong>
          <label>
            <input
              type="checkbox"
              checked={reducedMotion}
              disabled={systemReducedMotion}
              onChange={(event) => setReducedMotionOverride(event.currentTarget.checked)}
            />
            Reduced motion{systemReducedMotion ? ' (system preference)' : ''}
          </label>
          <label>
            <input
              type="checkbox"
              checked={highContrast}
              onChange={(event) => setHighContrast(event.currentTarget.checked)}
            />
            High contrast
          </label>
          <label>
            <input
              type="checkbox"
              checked={collisionDebug}
              onChange={(event) => setCollisionDebug(event.currentTarget.checked)}
            />
            Collision footprints
          </label>
          <button type="button" onClick={() => setSettingsOpen(false)}>
            Done
          </button>
        </section>
      ) : null}

      {helpOpen ? (
        <section
          className="production-slice-popover production-slice-popover--help"
          aria-label="Controls help"
        >
          <strong>Move with WASD or arrows</strong>
          <span>Hold Shift to jog · press E to interact · press Q for settings</span>
          <button type="button" onClick={() => setHelpOpen(false)}>
            Got it
          </button>
        </section>
      ) : null}

      <button
        className="production-slice-chat"
        type="button"
        aria-label="Open minimized local chat"
      >
        Fixture chat <span>0</span>
      </button>

      <section
        className="production-slice-hotbar"
        aria-label="Fixture quick item hotbar; not authenticated inventory"
      >
        <span className="production-slice-hotbar__fixture-label">Fixture hotbar</span>
        {HOTBAR_ITEMS.map((item, index) => (
          <button key={item} type="button" aria-label={`${item} fixture item`}>
            <kbd>{index + 1}</kbd>
            <span aria-hidden="true">{['✦', '▤', '⌖', '♡', '◫'][index]}</span>
          </button>
        ))}
        {interaction === null || inputBlocked ? null : (
          <button
            className="production-slice-interaction"
            type="button"
            onClick={() => runtimeRef.current?.interact()}
          >
            <kbd>E</kbd>
            {interaction.label}
          </button>
        )}
      </section>

      {interaction === null ? null : (
        <button
          className="production-slice-mobile-interaction"
          type="button"
          aria-label={`Touch interaction: ${interaction.label}`}
          disabled={inputBlocked}
          onClick={() => runtimeRef.current?.interact()}
        >
          <strong>{interaction.label}</strong>
          <span>Touch action · local fixture</span>
        </button>
      )}

      <section className="production-slice-status" aria-label="Player status">
        <button
          type="button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <span>
            <strong>Fixture profile · Lv 12</strong>
            <small>2,480 DUST · fixture</small>
          </span>
          <span>
            <strong>{ready && runtimeError === null ? 'Renderer ready' : 'Loading'}</strong>
            <small>No auth or persistence</small>
          </span>
          <span aria-hidden="true">{detailsOpen ? '▾' : '▴'}</span>
        </button>
        {detailsOpen ? (
          <dl>
            <div>
              <dt>Position</dt>
              <dd>
                {playerState.x.toFixed(1)}, {playerState.y.toFixed(1)}
              </dd>
            </div>
            <div>
              <dt>Facing</dt>
              <dd>{playerState.facingDirection}</dd>
            </div>
            <div>
              <dt>Manifest</dt>
              <dd>{config.manifestVersion}</dd>
            </div>
            <div>
              <dt>Persistence</dt>
              <dd>Disabled</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {!ready && runtimeError === null ? (
        <div className="production-slice-loading" role="status">
          Lighting the garden corner…
        </div>
      ) : null}
      {runtimeError === null ? null : (
        <div className="production-slice-error" role="alert">
          {runtimeError}
        </div>
      )}

      {panel === 'characters' ? (
        <div className="production-slice-panel">
          <CharacterMatrix reducedMotion={reducedMotion} />
        </div>
      ) : null}
      {panel === 'comparison' ? (
        <div className="production-slice-panel">
          <ComparisonPanel />
        </div>
      ) : null}

      {dialogue === null ? null : (
        <WorldNoticeModal
          state={{ status: 'ready', title: dialogue.title, content: dialogue.content }}
          onClose={() => setDialogue(null)}
        />
      )}
      {diagnosticsOpen && diagnostics !== null ? (
        <aside className="production-slice-diagnostics" aria-label="Development diagnostics">
          <strong>V3 runtime diagnostics</strong>
          <span>
            Location {diagnostics.location} · map {diagnostics.position.mapId} · version{' '}
            {diagnostics.mapVersion} · candidate {version.toUpperCase()}
          </span>
          <span>
            Player position {diagnostics.position.x.toFixed(3)}, {diagnostics.position.y.toFixed(3)}
            {' · '}facing {diagnostics.position.facingDirection}
          </span>
          <span>
            Foot anchor {diagnostics.position.x.toFixed(3)}, {diagnostics.position.y.toFixed(3)} ·
            radius {diagnostics.collision.playerFootRadius.toFixed(2)}
          </span>
          <span>
            World {world.manifest.width}×{world.manifest.height} tiles · logical bounds{' '}
            {world.manifest.safeSaveBounds.minX.toFixed(1)},{' '}
            {world.manifest.safeSaveBounds.minY.toFixed(1)} →{' '}
            {world.manifest.safeSaveBounds.maxX.toFixed(1)},{' '}
            {world.manifest.safeSaveBounds.maxY.toFixed(1)}
          </span>
          <span>
            Camera top-left {diagnostics.camera.worldView.x.toFixed(0)},{' '}
            {diagnostics.camera.worldView.y.toFixed(0)} · view{' '}
            {diagnostics.camera.worldView.width.toFixed(0)}×
            {diagnostics.camera.worldView.height.toFixed(0)}
          </span>
          <span>
            Camera bounds {diagnostics.camera.bounds.minX.toFixed(0)},{' '}
            {diagnostics.camera.bounds.minY.toFixed(0)} →{' '}
            {diagnostics.camera.bounds.maxX.toFixed(0)}, {diagnostics.camera.bounds.maxY.toFixed(0)}
          </span>
          <span>
            Input {Number(diagnostics.input.left)}/{Number(diagnostics.input.right)} · velocity{' '}
            {diagnostics.worldVelocity.x.toFixed(3)}, {diagnostics.worldVelocity.y.toFixed(3)}
          </span>
          <span>
            Animation{' '}
            {diagnostics.animation === null
              ? 'legacy renderer'
              : `${diagnostics.animation.state} frame ${diagnostics.animation.frameInState + 1}/4 (${diagnostics.animation.distanceTiles.toFixed(2)} tiles · ${Math.round(diagnostics.animation.elapsedMs)}ms)`}
          </span>
          <span>
            Terrain {diagnostics.culling.visibleTerrainNodes}/
            {diagnostics.culling.totalTerrainNodes} visible · chunks{' '}
            {diagnostics.culling.activeTerrainChunks}/{diagnostics.culling.totalTerrainChunks}{' '}
            active
          </span>
          <span>
            Terrain auxiliary {diagnostics.culling.visibleTerrainAuxiliaryNodes}/
            {diagnostics.culling.totalTerrainAuxiliaryNodes} visible
          </span>
          <span>
            Objects {diagnostics.culling.visibleObjects}/{diagnostics.culling.totalObjects} visible
            · collision {diagnostics.collision.nearbyShapes}/{diagnostics.collision.totalShapes}{' '}
            nearby
          </span>
          <span>
            Transition {transition.phase}
            {transition.destination === null ? '' : ` → ${transition.destination}`} · runtime{' '}
            {diagnostics.transitionPending ? 'load pending' : 'settled'}
          </span>
        </aside>
      ) : null}
      <div
        className="production-slice-transition"
        data-state={transition.phase}
        data-destination={transition.destination ?? 'none'}
        role="status"
        aria-live="polite"
      >
        <span>{transition.status}</span>
        {transition.phase === 'fading-out' || transition.phase === 'loading' ? (
          <button type="button" onClick={cancelLocationTransition}>
            Cancel transition
          </button>
        ) : null}
      </div>
    </main>
  );
}
