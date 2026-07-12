import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlayerProfile, PlayerStateUpdate } from '@starville/game-core';

import { loadGameSettings, saveGameSettings, type GameSettings } from '../app/game-settings';
import { PlayerRequestError } from '../app/player-client';
import type { TrustedTokenAccess } from '../app/token-access-client';
import { useNarrowGameViewport } from '../app/use-narrow-game-viewport';
import { usePlayerPersistence } from '../app/use-player-persistence';
import {
  loadCurrentPublishedWorld,
  transitionPublishedWorld,
  type PublishedWorld,
} from '../app/world-client';
import type {
  ExitTransitionRequest,
  GameRuntimeHandle,
  InteractionDialogue,
  InteractionPrompt,
  RuntimeWorld,
} from '../game/contracts';
import { GameCanvas } from './GameCanvas';
import { GameSettingsDialog } from './GameSettingsDialog';

interface GameWorldProps {
  readonly apiUrl: string;
  readonly landingUrl: string;
  readonly profile: PlayerProfile;
  readonly access: TrustedTokenAccess;
  readonly rechecking: boolean;
  readonly onRecheck: () => Promise<void>;
  readonly onAccessInvalid: () => void;
  readonly onLeaveVillage: () => Promise<void>;
}

interface LoadedGameWorldProps extends GameWorldProps {
  readonly initialWorld: PublishedWorld;
}

interface TransitionState {
  readonly phase: 'traveling' | 'failed';
  readonly label: string;
  readonly requestId?: string;
}

const TRANSITION_TIMEOUT_MS = 15_000;
const TRANSITION_MINIMUM_MS = 950;

function networkLabel(network: TrustedTokenAccess['network']): string {
  return network === 'solana:mainnet-beta' ? 'Solana Mainnet' : 'Solana Devnet';
}

function runtimeWorld(world: PublishedWorld): RuntimeWorld {
  return {
    manifest: world.manifest,
    versionId: world.version.id,
    checksum: world.version.checksum,
  };
}

function stateFromWorld(world: PublishedWorld): PlayerStateUpdate {
  return {
    mapId: world.playerState.mapId,
    x: world.playerState.x,
    y: world.playerState.y,
    facingDirection: world.playerState.facingDirection,
  };
}

function accessInvalid(error: unknown): boolean {
  return (
    error instanceof PlayerRequestError &&
    (error.status === 401 ||
      error.code === 'PLAYER_SUSPENDED' ||
      error.code === 'PLAYER_RENAME_REQUIRED' ||
      error.code === 'PLAYER_STATE_VERSION_CONFLICT')
  );
}

function LoadedGameWorld({
  apiUrl,
  landingUrl,
  profile,
  access,
  rechecking,
  onRecheck,
  onAccessInvalid,
  onLeaveVillage,
  initialWorld,
}: LoadedGameWorldProps) {
  const runtime = useRef<GameRuntimeHandle | null>(null);
  const transitionRequest = useRef<AbortController | null>(null);
  const narrow = useNarrowGameViewport();
  const [world, setWorld] = useState(initialWorld);
  const [ready, setReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() =>
    loadGameSettings(window.localStorage),
  );
  const [leaving, setLeaving] = useState(false);
  const [interaction, setInteraction] = useState<InteractionPrompt | null>(null);
  const [dialogue, setDialogue] = useState<InteractionDialogue | null>(null);
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const initialState = stateFromWorld(initialWorld);
  const persistence = usePlayerPersistence({
    apiUrl,
    initialState,
    initialGameStateVersion: initialWorld.playerState.gameStateVersion,
    onAccessInvalid,
  });
  const traveling = transition?.phase === 'traveling';
  const inputBlocked = settingsOpen || dialogue !== null || leaving || traveling;

  useEffect(
    () => () => {
      transitionRequest.current?.abort();
    },
    [],
  );

  const setRuntime = useCallback((nextRuntime: GameRuntimeHandle | null) => {
    runtime.current = nextRuntime;
  }, []);

  const toggleSettings = useCallback(() => {
    if (dialogue === null && !leaving && !traveling) setSettingsOpen((value) => !value);
  }, [dialogue, leaving, traveling]);

  const closeDialogue = useCallback(() => setDialogue(null), []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (dialogue !== null) closeDialogue();
      else if (settingsOpen) setSettingsOpen(false);
      else if (transition?.phase === 'failed') setTransition(null);
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeDialogue, dialogue, settingsOpen, transition?.phase]);

  const updateSettings = useCallback((nextSettings: GameSettings) => {
    setSettings(nextSettings);
    try {
      saveGameSettings(window.localStorage, nextSettings);
    } catch {
      // Runtime settings still apply when storage is unavailable.
    }
  }, []);

  const handleExit = useCallback(
    async (request: ExitTransitionRequest) => {
      if (transitionRequest.current !== null) return;
      if (request.mapId !== world.manifest.id || request.mapVersionId !== world.version.id) {
        runtime.current?.cancelTransition();
        setTransition({ phase: 'failed', label: 'The route changed. Please step away and retry.' });
        return;
      }

      const controller = new AbortController();
      transitionRequest.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), TRANSITION_TIMEOUT_MS);
      const startedAt = performance.now();
      setTransition({
        phase: 'traveling',
        label: request.destinationLabel ?? 'Traveling through Starville…',
      });

      try {
        const expectedGameStateVersion = await persistence.beginTransition();
        const destination = await transitionPublishedWorld(
          apiUrl,
          {
            exitId: request.exitId,
            expectedGameStateVersion,
            expectedMapVersionId: request.mapVersionId,
          },
          controller.signal,
        );

        if (
          destination.transition.fromMapId !== null &&
          destination.transition.fromMapId !== request.mapId
        ) {
          throw new PlayerRequestError(502, 'INVALID_WORLD_RESPONSE');
        }

        const minimumDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 120
          : TRANSITION_MINIMUM_MS;
        const remaining = minimumDuration - (performance.now() - startedAt);
        if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));

        persistence.acceptAuthoritativeTransition(destination.playerState);
        const nextWorld: PublishedWorld = {
          map: destination.map,
          version: destination.version,
          manifest: destination.manifest,
          playerState: destination.playerState,
        };
        runtime.current?.loadWorld(runtimeWorld(nextWorld), stateFromWorld(nextWorld));
        setWorld(nextWorld);
        setInteraction(null);
        setDialogue(null);
        setTransition(null);
      } catch (error) {
        persistence.cancelTransition();
        runtime.current?.cancelTransition();
        if (accessInvalid(error)) {
          onAccessInvalid();
        } else {
          setTransition({
            phase: 'failed',
            label: 'That route could not be opened. You are back at your last safe position.',
            ...(error instanceof PlayerRequestError && error.requestId !== undefined
              ? { requestId: error.requestId }
              : {}),
          });
        }
      } finally {
        window.clearTimeout(timeout);
        if (transitionRequest.current === controller) transitionRequest.current = null;
      }
    },
    [apiUrl, onAccessInvalid, persistence, world.manifest.id, world.version.id],
  );

  async function leaveVillage() {
    if (leaving || traveling) return;
    setLeaving(true);
    await persistence.flushBeforeLeave();
    await onLeaveVillage();
    window.location.assign(landingUrl);
  }

  async function returnToLanding() {
    if (leaving || traveling) return;
    setLeaving(true);
    await persistence.flushBeforeLeave();
    window.location.assign(landingUrl);
  }

  const saveLabel = {
    ready: 'Safe position ready',
    saving: 'Saving safe position…',
    saved: 'Safe position saved',
    unavailable: 'Save unavailable',
  }[persistence.status];

  return (
    <main className="world-shell">
      <header className="world-topbar">
        <div className="world-brand" aria-label="Starville">
          <span aria-hidden="true">✦</span>
          <strong>STARVILLE</strong>
        </div>
        <div className="world-session">
          <span className="world-session__dot" aria-hidden="true" />
          <span>{networkLabel(access.network)}</span>
          <button disabled={rechecking || traveling} type="button" onClick={() => void onRecheck()}>
            {rechecking ? 'Checking…' : 'Verify access'}
          </button>
        </div>
      </header>

      <section className="world-frame" aria-labelledby="world-map-name">
        <div className="world-hud world-hud--identity">
          <p className="world-hud__eyebrow">Villager</p>
          <strong>{profile.displayName}</strong>
          <span>{saveLabel}</span>
        </div>
        <div className="world-hud world-hud--location">
          <p className="world-hud__eyebrow">Current location</p>
          <strong id="world-map-name">{world.map.displayName}</strong>
          <span>{world.map.description}</span>
        </div>
        <div className="world-hud world-hud--controls">
          <span>
            <kbd>WASD</kbd> Move
          </span>
          <span>
            <kbd>Shift</kbd> Jog
          </span>
          <span>
            <kbd>E</kbd> Interact
          </span>
          <button
            className="world-settings-button"
            type="button"
            aria-expanded={settingsOpen}
            onClick={toggleSettings}
          >
            Settings
          </button>
        </div>

        {import.meta.env.MODE === 'production' ? null : (
          <span className="world-development-badge">Phase 6 development art</span>
        )}

        {narrow ? (
          <div className="narrow-game-state" role="status">
            <span aria-hidden="true">⌨</span>
            <h1>{world.map.displayName} needs a keyboard</h1>
            <p>Continue on a wider desktop or laptop window to explore this development map.</p>
            <button disabled={leaving} type="button" onClick={() => void leaveVillage()}>
              {leaving ? 'Saving and leaving…' : 'Leave village'}
            </button>
          </div>
        ) : (
          <GameCanvas
            appearancePreset={profile.appearancePreset}
            audioSettings={settings}
            initialState={initialState}
            initialWorld={runtimeWorld(initialWorld)}
            inputBlocked={inputBlocked}
            onCheckpoint={persistence.checkpoint}
            onError={setRuntimeError}
            onExitRequested={(request) => void handleExit(request)}
            onFinalState={persistence.checkpoint}
            onInteractionOpen={setDialogue}
            onInteractionTarget={setInteraction}
            onMapChanged={() => undefined}
            onSettingsRequested={toggleSettings}
            onReady={() => setReady(true)}
            onRuntimeCreated={setRuntime}
            onStateChanged={persistence.noteState}
          />
        )}

        {!narrow && !ready && runtimeError === undefined ? (
          <div className="world-loading" role="status">
            <span className="game-loader" />
            <p>Lighting the paths of {world.map.displayName}…</p>
          </div>
        ) : null}

        {runtimeError === undefined ? null : (
          <div className="world-runtime-error" role="alert">
            <h2>The world could not be rendered.</h2>
            <p>{runtimeError}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload safely
            </button>
          </div>
        )}

        {interaction === null || inputBlocked ? null : (
          <button
            className="interaction-prompt"
            type="button"
            onClick={() => runtime.current?.interact()}
          >
            <kbd>E</kbd>
            <span>{interaction.label}</span>
          </button>
        )}

        {dialogue === null ? null : (
          <div className="world-overlay" role="presentation">
            <section
              className="dialogue-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="world-dialogue-title"
            >
              <p className="game-kicker">World landmark</p>
              <h2 id="world-dialogue-title">{dialogue.title}</h2>
              <p>{dialogue.content}</p>
              <button autoFocus type="button" onClick={closeDialogue}>
                Continue exploring
              </button>
            </section>
          </div>
        )}

        {transition === null ? null : (
          <div
            className="world-transition"
            role={transition.phase === 'failed' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <div className="world-transition__mark" aria-hidden="true">
              ✦
            </div>
            <p className="game-kicker">
              {transition.phase === 'traveling' ? 'Traveling to…' : 'Route unavailable'}
            </p>
            <h2>{transition.label}</h2>
            {transition.requestId === undefined ? null : (
              <p>
                Request ID: <code>{transition.requestId}</code>
              </p>
            )}
            {transition.phase === 'failed' ? (
              <button autoFocus type="button" onClick={() => setTransition(null)}>
                Continue exploring
              </button>
            ) : (
              <span className="game-loader" aria-label="Loading destination map" />
            )}
          </div>
        )}

        {!settingsOpen ? null : (
          <GameSettingsDialog
            onEndSession={leaveVillage}
            onResume={() => setSettingsOpen(false)}
            onReturnLanding={returnToLanding}
            onSettingsChange={updateSettings}
            pendingAction={leaving}
            settings={settings}
          />
        )}
      </section>
    </main>
  );
}

export function GameWorld(props: GameWorldProps) {
  const { apiUrl, onAccessInvalid } = props;
  const [world, setWorld] = useState<PublishedWorld>();
  const [loadError, setLoadError] = useState<{ readonly requestId?: string }>();
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setWorld(undefined);
    setLoadError(undefined);
    void loadCurrentPublishedWorld(apiUrl, controller.signal)
      .then(setWorld)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (accessInvalid(error)) onAccessInvalid();
        else {
          setLoadError(
            error instanceof PlayerRequestError && error.requestId !== undefined
              ? { requestId: error.requestId }
              : {},
          );
        }
      });
    return () => controller.abort();
  }, [apiUrl, onAccessInvalid, retryVersion]);

  if (loadError !== undefined) {
    return (
      <main className="gate-shell">
        <section className="gate-card" role="alert" aria-labelledby="world-load-error">
          <div className="gate-mark" aria-hidden="true">
            ✦
          </div>
          <p className="game-kicker">Published world unavailable</p>
          <h1 id="world-load-error">Your last safe map could not be opened.</h1>
          <p>No partial map was started. Retry after the Starville world service is available.</p>
          {loadError.requestId === undefined ? null : (
            <p>
              Request ID: <code>{loadError.requestId}</code>
            </p>
          )}
          <div className="gate-actions">
            <button type="button" onClick={() => setRetryVersion((value) => value + 1)}>
              Try again
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (world === undefined) {
    return (
      <main className="gate-shell">
        <section className="gate-card" role="status" aria-live="polite">
          <div className="gate-mark" aria-hidden="true">
            ✦
          </div>
          <p className="game-kicker">Published world</p>
          <h1>Preparing your safe arrival…</h1>
          <p>The server is resolving the active map version and approved spawn.</p>
          <span className="game-loader" aria-label="Loading published world" />
        </section>
      </main>
    );
  }

  return <LoadedGameWorld {...props} initialWorld={world} />;
}
