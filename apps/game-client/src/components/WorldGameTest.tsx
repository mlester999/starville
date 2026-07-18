import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerStateUpdate, WorldInteraction } from '@starville/game-core';

import {
  bootstrapWorldGameTest,
  exitWorldGameTest,
  gameTestAdminReturnUrl,
  loadWorldGameTestSession,
  type WorldGameTestProjection,
} from '../app/game-test-client';
import type {
  GameRuntimeHandle,
  InteractionDialogue,
  InteractionPrompt,
  RuntimeWorld,
  WorldAssetFallbackEvent,
} from '../game/contracts';
import { WORLD_ASSET_FALLBACK_EVENT_NAME } from '../game/contracts';
import { GameCanvas } from './GameCanvas';
import { GeneralStoreGameTest } from './GeneralStoreGameTest';
import { ProgressionGameTest } from './ProgressionGameTest';
import { PlayerExperienceGameTest } from './PlayerExperienceGameTest';
import { AssetCoverageGameTest } from './AssetCoverageGameTest';

interface WorldGameTestProps {
  readonly apiUrl: string;
  readonly adminUrl: string;
  readonly gameClientBuild: string;
}

function runtimeWorld(projection: WorldGameTestProjection): RuntimeWorld {
  return {
    manifest: projection.manifest,
    versionId: projection.version.id,
    checksum: projection.version.checksum,
    assetDeliveries: projection.assetDeliveries,
  };
}

function previewMeta(): () => void {
  const existingRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  const existingReferrer = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
  const existingCache = document.querySelector<HTMLMetaElement>('meta[http-equiv="Cache-Control"]');
  const robots = existingRobots ?? document.createElement('meta');
  const referrer = existingReferrer ?? document.createElement('meta');
  const cacheControl = existingCache ?? document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow, noarchive';
  referrer.name = 'referrer';
  referrer.content = 'no-referrer';
  cacheControl.httpEquiv = 'Cache-Control';
  cacheControl.content = 'no-store';
  if (existingRobots === null) document.head.append(robots);
  if (existingReferrer === null) document.head.append(referrer);
  if (existingCache === null) document.head.append(cacheControl);
  return () => {
    if (existingRobots === null) robots.remove();
    if (existingReferrer === null) referrer.remove();
    if (existingCache === null) cacheControl.remove();
  };
}

function LoadedWorldGameTest(props: {
  readonly apiUrl: string;
  readonly adminUrl: string;
  readonly projection: WorldGameTestProjection;
  readonly onSessionInvalid: (message: string) => void;
}) {
  const runtime = useRef<GameRuntimeHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string>();
  const [interaction, setInteraction] = useState<InteractionPrompt | null>(null);
  const [dialogue, setDialogue] = useState<InteractionDialogue | null>(null);
  const [generalStoreOpen, setGeneralStoreOpen] = useState(false);
  const [progressionOpen, setProgressionOpen] = useState(false);
  const [playerExperienceOpen, setPlayerExperienceOpen] = useState(false);
  const [assetCoverageOpen, setAssetCoverageOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [fallbacks, setFallbacks] = useState<readonly WorldAssetFallbackEvent[]>([]);
  const [localState, setLocalState] = useState<PlayerStateUpdate>(props.projection.playerState);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((Date.parse(props.projection.session.expiresAt) - Date.now()) / 1000)),
  );
  const returnUrl = useMemo(
    () =>
      gameTestAdminReturnUrl(
        props.adminUrl,
        props.projection.session.returnPath,
        props.projection.session.id,
      ),
    [props.adminUrl, props.projection.session.id, props.projection.session.returnPath],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((Date.parse(props.projection.session.expiresAt) - Date.now()) / 1000),
      );
      setRemainingSeconds(remaining);
      if (remaining === 0) props.onSessionInvalid('This Game Test session expired safely.');
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [props]);

  useEffect(() => {
    const onFallback = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      setFallbacks((current) => [...current, event.detail as WorldAssetFallbackEvent]);
    };
    window.addEventListener(WORLD_ASSET_FALLBACK_EVENT_NAME, onFallback);
    return () => window.removeEventListener(WORLD_ASSET_FALLBACK_EVENT_NAME, onFallback);
  }, []);

  const openInteraction = useCallback((worldInteraction: WorldInteraction) => {
    if (worldInteraction.id === 'phase7-general-store') {
      setGeneralStoreOpen(true);
      return;
    }
    setDialogue({
      id: worldInteraction.id,
      title: worldInteraction.title,
      content:
        worldInteraction.type === 'notice'
          ? worldInteraction.content
          : `${worldInteraction.content} This ${worldInteraction.type.replaceAll('_', ' ')} action is inspection-only in Game Test.`,
    });
  }, []);

  async function exit() {
    try {
      await exitWorldGameTest(props.apiUrl);
    } finally {
      window.location.assign(returnUrl);
    }
  }

  return (
    <main className="world-shell world-game-test-shell" data-private-realtime="disabled">
      <header aria-live="polite" className="world-game-test-banner" role="status">
        <div>
          <strong>GAME TEST · NO PROGRESSION</strong>
          <span>
            {props.projection.map.displayName} · version {props.projection.version.versionNumber} ·
            revision {props.projection.version.editVersion}
          </span>
          {props.projection.newerDraftAvailable ? (
            <span className="world-game-test-banner__stale">
              A newer draft exists. This session remains pinned to the revision shown.
            </span>
          ) : null}
        </div>
        <div>
          <span>Expires in {Math.ceil(remainingSeconds / 60)} min</span>
          <a href={returnUrl}>Return to Admin</a>
          <button type="button" onClick={() => void exit()}>
            Exit Game Test
          </button>
        </div>
      </header>
      <section className="world-frame world-game-test-frame" aria-labelledby="game-test-world-name">
        <div className="world-hud world-hud--identity">
          <p className="world-hud__eyebrow">Temporary preview identity</p>
          <strong>{props.projection.previewIdentity.displayName}</strong>
          <span>In-memory movement only</span>
        </div>
        <div className="world-hud world-hud--location">
          <p className="world-hud__eyebrow">Exact draft revision</p>
          <strong id="game-test-world-name">{props.projection.map.displayName}</strong>
          <span>{props.projection.version.checksum.slice(0, 12)}…</span>
        </div>
        <div className="world-hud world-hud--controls">
          <span>
            <kbd>WASD</kbd> Move
          </span>
          <span>
            <kbd>E</kbd> Inspect
          </span>
          <button type="button" onClick={() => setDebugOpen((value) => !value)}>
            Debug
          </button>
          <button type="button" onClick={() => setProgressionOpen(true)}>
            Preview progression
          </button>
          <button type="button" onClick={() => setPlayerExperienceOpen(true)}>
            Preview onboarding
          </button>
          <button type="button" onClick={() => setAssetCoverageOpen(true)}>
            Visual asset coverage
          </button>
        </div>
        <GameCanvas
          appearancePreset={props.projection.previewIdentity.appearancePreset}
          audioSettings={{ masterVolume: 0.6, muted: false }}
          initialState={props.projection.playerState}
          initialWorld={runtimeWorld(props.projection)}
          inputBlocked={
            dialogue !== null ||
            generalStoreOpen ||
            progressionOpen ||
            playerExperienceOpen ||
            assetCoverageOpen
          }
          onCheckpoint={() => undefined}
          onError={setRuntimeError}
          onExitRequested={() => {
            runtime.current?.cancelTransition();
            setDialogue({
              id: 'game-test-exit-disabled',
              title: 'World transition disabled',
              content: 'Game Test remains pinned to the exact selected world revision.',
            });
          }}
          onFinalState={() => undefined}
          onInteractionOpen={openInteraction}
          onInteractionTarget={setInteraction}
          onMapChanged={() => undefined}
          onReady={() => setReady(true)}
          onRuntimeCreated={(handle) => {
            runtime.current = handle;
          }}
          onSettingsRequested={() => setDebugOpen((value) => !value)}
          onStateChanged={(state) => setLocalState(state)}
        />
        {!ready && runtimeError === undefined ? (
          <div className="world-loading" role="status">
            <span className="game-loader" />
            <p>Loading exact Game Test revision…</p>
          </div>
        ) : null}
        {runtimeError === undefined ? null : (
          <div className="world-runtime-error" role="alert">
            <h2>The draft could not be rendered.</h2>
            <p>{runtimeError}</p>
          </div>
        )}
        {interaction === null || dialogue !== null ? null : (
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
            <section className="dialogue-card" role="dialog" aria-modal="true">
              <p className="game-kicker">Game Test inspection</p>
              <h2>{dialogue.title}</h2>
              <p>{dialogue.content}</p>
              <button autoFocus type="button" onClick={() => setDialogue(null)}>
                Continue testing
              </button>
            </section>
          </div>
        )}
        {generalStoreOpen ? (
          <GeneralStoreGameTest
            worldRevisionId={props.projection.version.id}
            onClose={() => setGeneralStoreOpen(false)}
          />
        ) : null}
        {progressionOpen ? <ProgressionGameTest onClose={() => setProgressionOpen(false)} /> : null}
        {playerExperienceOpen ? (
          <PlayerExperienceGameTest onClose={() => setPlayerExperienceOpen(false)} />
        ) : null}
        {assetCoverageOpen ? (
          <AssetCoverageGameTest onClose={() => setAssetCoverageOpen(false)} />
        ) : null}
        {debugOpen ? (
          <aside className="world-game-test-debug" aria-label="Game Test debug panel">
            <h2>Revision debug</h2>
            <dl>
              <div>
                <dt>Rendered</dt>
                <dd>{ready ? 'yes' : 'loading'}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{props.projection.version.id}</dd>
              </div>
              <div>
                <dt>Pinned assets</dt>
                <dd>{props.projection.assetDeliveries.length}</dd>
              </div>
              <div>
                <dt>Fallbacks</dt>
                <dd>{fallbacks.length}</dd>
              </div>
              <div>
                <dt>Last evidence</dt>
                <dd>{props.projection.latestEvidence?.result ?? 'not tested'}</dd>
              </div>
              <div>
                <dt>Realtime</dt>
                <dd>private solo · disconnected</dd>
              </div>
              <div>
                <dt>Position</dt>
                <dd>
                  {localState.x.toFixed(2)}, {localState.y.toFixed(2)}
                </dd>
              </div>
            </dl>
            <h3>Immutable asset pins</h3>
            <ul className="world-game-test-debug__assets">
              {props.projection.assetDeliveries.map((delivery) => {
                const fallback = fallbacks.some(
                  (event) =>
                    event.assetKey === delivery.assetKey && event.versionId === delivery.versionId,
                );
                const objectCount = props.projection.manifest.objects.filter(
                  (object) => object.assetId === delivery.assetKey,
                ).length;
                return (
                  <li key={delivery.assetKey}>
                    <strong>{delivery.assetKey}</strong>
                    <span>{objectCount} world object(s)</span>
                    <span>Rendered and pinned: {delivery.versionId}</span>
                    <span>
                      Active lookup: not consulted · fallback:{' '}
                      {fallback
                        ? 'managed media load failed'
                        : delivery.developmentMarker
                          ? 'development marker'
                          : 'none'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </aside>
        ) : null}
      </section>
    </main>
  );
}

export function WorldGameTest({ apiUrl, adminUrl, gameClientBuild }: WorldGameTestProps) {
  const [projection, setProjection] = useState<WorldGameTestProjection>();
  const [error, setError] = useState<string>();

  useEffect(() => previewMeta(), []);

  useEffect(() => {
    void bootstrapWorldGameTest(apiUrl, gameClientBuild, window.location, window.history)
      .then(setProjection)
      .catch(() => setError('This Game Test grant is invalid, expired, revoked, or unavailable.'));
  }, [apiUrl, gameClientBuild]);

  useEffect(() => {
    if (projection === undefined) return;
    const timer = window.setInterval(() => {
      void loadWorldGameTestSession(apiUrl)
        .then(setProjection)
        .catch(() => setError('This Game Test session ended safely.'));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [apiUrl, projection]);

  if (error !== undefined) {
    return (
      <main className="game-test-unavailable" role="alert">
        <p className="game-kicker">Secure Game Test</p>
        <h1>Preview session unavailable</h1>
        <p>{error}</p>
        <a href={adminUrl}>Return to Admin</a>
      </main>
    );
  }
  if (projection === undefined) {
    return (
      <main className="game-test-unavailable" role="status">
        <span className="game-loader" />
        <p>Exchanging one-time Game Test grant…</p>
      </main>
    );
  }
  return (
    <LoadedWorldGameTest
      adminUrl={adminUrl}
      apiUrl={apiUrl}
      onSessionInvalid={setError}
      projection={projection}
    />
  );
}
