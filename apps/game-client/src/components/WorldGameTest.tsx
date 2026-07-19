import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerStateUpdate, WorldInteraction } from '@starville/game-core';
import type { GameRuntimeClock } from '../game/contracts';

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
  WorldAssetFallbackEvent,
} from '../game/contracts';
import { WORLD_ASSET_FALLBACK_EVENT_NAME } from '../game/contracts';
import { GameCanvas } from './GameCanvas';
import { GeneralStoreGameTest } from './GeneralStoreGameTest';
import { ProgressionGameTest } from './ProgressionGameTest';
import { PlayerExperienceGameTest } from './PlayerExperienceGameTest';
import { AssetCoverageGameTest } from './AssetCoverageGameTest';
import { PlayerStatusDock } from './PlayerStatusDock';
import {
  createPhase12CWorldGameTestFixture,
  phase12CGameCanvasVisualSettings,
  type Phase12CDepthMode,
  type Phase12CParticipantMode,
  type Phase12CVisualQuality,
} from './phase12c-world-game-test-fixture';
import {
  phase12CLocalCompositionAvailable,
  selectPhase12CWorldGameTestSource,
  type Phase12CWorldGameTestSourceMode,
} from './phase12c-world-game-test-source';
import { Phase12EBetaGameTest } from './Phase12EBetaGameTest';
import type { Phase12EBetaScenarioStep } from './phase12e-beta-game-test';

interface WorldGameTestProps {
  readonly apiUrl: string;
  readonly adminUrl: string;
  readonly gameClientBuild: string;
}

const PHASE12C_DEPTH_OPTIONS: readonly Readonly<{
  value: Phase12CDepthMode;
  label: string;
}>[] = [
  { value: 'overview', label: 'Overview spawn' },
  { value: 'tree-behind', label: 'Behind tree' },
  { value: 'tree-front', label: 'In front of tree' },
  { value: 'building-behind', label: 'Behind building' },
  { value: 'building-front', label: 'In front of building' },
];

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
  const [betaScenarioOpen, setBetaScenarioOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [visualReviewOpen, setVisualReviewOpen] = useState(true);
  const [sourceMode, setSourceMode] =
    useState<Phase12CWorldGameTestSourceMode>('authorized_revision');
  const [participantMode, setParticipantMode] = useState<Phase12CParticipantMode>('one-player');
  const [depthMode, setDepthMode] = useState<Phase12CDepthMode>('overview');
  const [visualQuality, setVisualQuality] = useState<Phase12CVisualQuality>('normal');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [shadows, setShadows] = useState(true);
  const [ambientEffects, setAmbientEffects] = useState(true);
  const [animatedWater, setAnimatedWater] = useState(true);
  const [labels, setLabels] = useState(true);
  const [chatBubbles, setChatBubbles] = useState(true);
  const [hudPopoverOpen, setHudPopoverOpen] = useState(false);
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
  const visualSettings = useMemo(
    () =>
      phase12CGameCanvasVisualSettings({
        quality: visualQuality,
        shadows,
        ambientEffects,
        animatedWater,
        labels,
        chatBubbles,
      }),
    [ambientEffects, animatedWater, chatBubbles, labels, shadows, visualQuality],
  );
  const visualClockMs = useMemo(
    () => Date.parse(props.projection.session.createdAt),
    [props.projection.session.createdAt],
  );
  const visualClock = useMemo<GameRuntimeClock>(
    () => ({ now: () => visualClockMs }),
    [visualClockMs],
  );
  const localCompositionAvailable = phase12CLocalCompositionAvailable(props.projection.manifest);
  const reviewSource = useMemo(
    () =>
      selectPhase12CWorldGameTestSource({
        mode: sourceMode,
        authorized: {
          displayName: props.projection.map.displayName,
          manifest: props.projection.manifest,
          assetDeliveries: props.projection.assetDeliveries,
          playerState: props.projection.playerState,
          version: props.projection.version,
        },
      }),
    [props.projection, sourceMode],
  );
  const visualReviewFixture = useMemo(
    () =>
      createPhase12CWorldGameTestFixture({
        manifest: reviewSource.world.manifest,
        baseState: reviewSource.baseState,
        worldVersionId: reviewSource.world.versionId,
        participantMode,
        depthMode,
        bubblesEnabled: chatBubbles,
        visualClockMs,
        sourceIdentity: `${reviewSource.identity}:${reviewSource.world.versionId}:${reviewSource.world.checksum}`,
      }),
    [chatBubbles, depthMode, participantMode, reviewSource, visualClockMs],
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

  const openHudPreviewAction = useCallback((label: string) => {
    setDialogue({
      id: `phase12e-hud-${label.toLocaleLowerCase('en-US').replaceAll(' ', '-')}`,
      title: `${label} HUD preview`,
      content:
        'This Phase 12E control is an in-memory beta-readiness fixture. It does not load or change player data, progression, inventory, DUST, social state, or realtime state.',
    });
  }, []);

  function selectDepthMode(next: Phase12CDepthMode) {
    setReady(false);
    setRuntimeError(undefined);
    setDepthMode(next);
  }

  function selectSourceMode(next: Phase12CWorldGameTestSourceMode) {
    if (next === 'local_lantern_composition' && !localCompositionAvailable) return;
    setReady(false);
    setRuntimeError(undefined);
    setFallbacks([]);
    setInteraction(null);
    setDialogue(null);
    setGeneralStoreOpen(false);
    setLocalState(
      next === 'authorized_revision'
        ? props.projection.playerState
        : selectPhase12CWorldGameTestSource({
            mode: next,
            authorized: {
              displayName: props.projection.map.displayName,
              manifest: props.projection.manifest,
              assetDeliveries: props.projection.assetDeliveries,
              playerState: props.projection.playerState,
              version: props.projection.version,
            },
          }).baseState,
    );
    setSourceMode(next);
  }

  function applyBetaScenarioStep(step: Phase12EBetaScenarioStep) {
    if (step.review?.v2Candidate === true && localCompositionAvailable) {
      selectSourceMode('local_lantern_composition');
    }
    if (step.review?.elevenPlayers === true) setParticipantMode('eleven-players');
    if (step.review?.reducedMotion === true) setReducedMotion(true);
    if (step.review?.highContrast === true) setHighContrast(true);
    if (step.surface === undefined) return;
    setBetaScenarioOpen(false);
    if (step.surface === 'onboarding') setPlayerExperienceOpen(true);
    if (step.surface === 'general_store') setGeneralStoreOpen(true);
    if (step.surface === 'progression') setProgressionOpen(true);
    if (step.surface === 'asset_coverage') setAssetCoverageOpen(true);
  }

  async function exit() {
    try {
      await exitWorldGameTest(props.apiUrl);
    } finally {
      window.location.assign(returnUrl);
    }
  }

  return (
    <main
      className={`world-shell world-game-test-shell world-shell--compact-hud${
        reducedMotion ? ' world-shell--reduced-motion' : ''
      }${highContrast ? ' world-shell--increased-contrast' : ''}`}
      data-ambient-effects={visualSettings.ambientEffects ? 'on' : 'off'}
      data-private-realtime="disabled"
      data-shadows={visualSettings.shadows ? 'on' : 'off'}
      data-visual-quality={visualSettings.quality}
      data-water-animation={visualSettings.animatedWater ? 'on' : 'off'}
    >
      <header aria-live="polite" className="world-game-test-banner" role="status">
        <div>
          <strong>GAME TEST · NO PROGRESSION</strong>
          <span>
            {reviewSource.displayName} · {reviewSource.statusLabel} · {reviewSource.versionLabel}
          </span>
          {sourceMode === 'authorized_revision' && props.projection.newerDraftAvailable ? (
            <span className="world-game-test-banner__stale">
              A newer draft exists. This session remains pinned to the revision shown.
            </span>
          ) : null}
          {sourceMode === 'local_lantern_composition' ? (
            <span className="world-game-test-banner__stale">
              This checked-in composition is unpublished and never replaces the authorized revision.
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
          <p className="world-hud__eyebrow">{reviewSource.statusLabel}</p>
          <strong id="game-test-world-name">{reviewSource.displayName}</strong>
          <span>{reviewSource.versionLabel}</span>
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
          <button type="button" onClick={() => setBetaScenarioOpen(true)}>
            Beta scenario
          </button>
        </div>
        <aside
          className="phase12c-visual-review"
          data-open={visualReviewOpen ? 'true' : 'false'}
          aria-label="Phase 12E deterministic beta-readiness review"
        >
          <div className="phase12c-visual-review__heading">
            <div>
              <p className="game-kicker">Phase 12E · inspection only</p>
              <strong>Deterministic beta-readiness QA</strong>
            </div>
            <button
              aria-expanded={visualReviewOpen}
              type="button"
              onClick={() => setVisualReviewOpen((value) => !value)}
            >
              {visualReviewOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          {!visualReviewOpen ? null : (
            <div className="phase12c-visual-review__body">
              <p className="phase12c-visual-review__notice">
                Generated players, bubbles, HUD state, and graphics switches exist only in memory
                for visual review. Nothing is sent, saved, rewarded, or measured.
              </p>

              <fieldset>
                <legend>World source</legend>
                <div className="phase12c-visual-review__segmented">
                  <button
                    aria-pressed={sourceMode === 'authorized_revision'}
                    type="button"
                    onClick={() => selectSourceMode('authorized_revision')}
                  >
                    Exact authorized revision
                  </button>
                  <button
                    aria-pressed={sourceMode === 'local_lantern_composition'}
                    disabled={!localCompositionAvailable}
                    type="button"
                    onClick={() => selectSourceMode('local_lantern_composition')}
                  >
                    Local Phase 12E beta composition · Phase 12D visuals
                  </button>
                </div>
                <small>
                  {localCompositionAvailable
                    ? 'Local mode explicitly renders the checked-in Phase 12E Lantern Square local_draft with exact, bundled-only Phase 12D candidate deliveries in memory.'
                    : 'Local Phase 12E beta composition is unavailable because this authorized map is not Lantern Square.'}
                </small>
              </fieldset>

              <fieldset>
                <legend>Participants</legend>
                <div className="phase12c-visual-review__segmented">
                  {(
                    [
                      ['one-player', 'One player'],
                      ['eleven-players', 'Eleven players'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      aria-pressed={participantMode === value}
                      key={value}
                      type="button"
                      onClick={() => setParticipantMode(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="phase12c-visual-review__select">
                <span>Depth position</span>
                <select
                  value={depthMode}
                  onChange={(event) =>
                    selectDepthMode(event.currentTarget.value as Phase12CDepthMode)
                  }
                >
                  {PHASE12C_DEPTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="phase12c-visual-review__instruction">
                {visualReviewFixture.depthInstruction}
                <span>
                  Fixture position {visualReviewFixture.localState.x.toFixed(2)},{' '}
                  {visualReviewFixture.localState.y.toFixed(2)}
                  {visualReviewFixture.depthTargetId === null
                    ? ''
                    : ` · anchor ${visualReviewFixture.depthTargetId}`}
                </span>
              </p>

              <fieldset>
                <legend>Visual quality</legend>
                <div className="phase12c-visual-review__segmented">
                  {(
                    [
                      ['normal', 'Normal'],
                      ['low', 'Low performance'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      aria-pressed={visualQuality === value}
                      key={value}
                      type="button"
                      onClick={() => setVisualQuality(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {visualQuality === 'low' ? (
                  <small>Low mode safely suppresses shadows, ambience, and animated water.</small>
                ) : null}
              </fieldset>

              <div className="phase12c-visual-review__toggles">
                {(
                  [
                    ['Shadows', shadows, setShadows, visualQuality === 'low'],
                    ['Ambience', ambientEffects, setAmbientEffects, visualQuality === 'low'],
                    ['Water animation', animatedWater, setAnimatedWater, visualQuality === 'low'],
                    ['Player labels', labels, setLabels, false],
                    ['Safe chat bubbles', chatBubbles, setChatBubbles, false],
                    ['Reduced motion', reducedMotion, setReducedMotion, false],
                  ] as const
                ).map(([label, checked, update, disabled]) => (
                  <label key={label}>
                    <input
                      checked={checked}
                      disabled={disabled}
                      type="checkbox"
                      onChange={(event) => update(event.currentTarget.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <dl className="phase12c-visual-review__summary">
                <div>
                  <dt>Players</dt>
                  <dd>{visualReviewFixture.totalPlayerCount} / 11</dd>
                </div>
                <div>
                  <dt>Bubbles</dt>
                  <dd>{visualReviewFixture.chatBubbleMessages.length} / 6</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{reviewSource.lifecycle}</dd>
                </div>
              </dl>
              <p className="phase12c-visual-review__hud-help">
                HUD preview: use <strong>Details</strong> in the status dock to compare its compact
                and expanded production layouts. Values stay unavailable because this fixture never
                loads player progression or DUST.
              </p>
            </div>
          )}
        </aside>
        <GameCanvas
          avatarRendererMode={
            sourceMode === 'local_lantern_composition' ? 'phase12d_candidate' : 'published_v1'
          }
          key={visualReviewFixture.canvasKey}
          appearancePreset={props.projection.previewIdentity.appearancePreset}
          audioSettings={{ masterVolume: 0.6, muted: false }}
          chatBubbleMessages={visualReviewFixture.chatBubbleMessages}
          clock={visualClock}
          initialState={visualReviewFixture.localState}
          initialWorld={reviewSource.world}
          inputBlocked={
            dialogue !== null ||
            generalStoreOpen ||
            progressionOpen ||
            playerExperienceOpen ||
            assetCoverageOpen ||
            betaScenarioOpen ||
            hudPopoverOpen
          }
          onCheckpoint={() => undefined}
          onError={setRuntimeError}
          onExitRequested={() => {
            runtime.current?.cancelTransition();
            setDialogue({
              id: 'game-test-exit-disabled',
              title: 'World transition disabled',
              content:
                sourceMode === 'authorized_revision'
                  ? 'Game Test remains pinned to the exact selected world revision.'
                  : 'The local Phase 12E beta composition with Phase 12D candidate visuals remains an unpublished in-memory review source.',
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
          reducedMotion={reducedMotion}
          remotePresences={visualReviewFixture.remotePresences}
          showRemotePlayerNames={labels}
          visualSettings={visualSettings}
        />
        <PlayerStatusDock
          activityActive={false}
          channels={[
            {
              id: 'phase12c-local-visual-qa',
              number: 1,
              population: visualReviewFixture.totalPlayerCount,
              capacity: 11,
              available: true,
            },
          ]}
          connectionStatus="disconnected"
          currentChannelId="phase12c-local-visual-qa"
          disabled={
            dialogue !== null ||
            generalStoreOpen ||
            progressionOpen ||
            playerExperienceOpen ||
            assetCoverageOpen ||
            betaScenarioOpen
          }
          dust={{ status: 'unavailable' }}
          level={{ status: 'unavailable' }}
          nearbyCount={visualReviewFixture.remotePresences.length}
          socialNoticeCount={0}
          onActivities={() => openHudPreviewAction('Activities')}
          onChannelSwitch={() => undefined}
          onFriends={() => openHudPreviewAction('Friends')}
          onInventory={() => openHudPreviewAction('Inventory')}
          onNearby={() => openHudPreviewAction('Nearby players')}
          onPopoverOpenChange={setHudPopoverOpen}
          onProgression={() => openHudPreviewAction('My Journey')}
        />
        {!ready && runtimeError === undefined ? (
          <div className="world-loading" role="status">
            <span className="game-loader" />
            <p>Loading {reviewSource.statusLabel.toLocaleLowerCase('en-US')}…</p>
          </div>
        ) : null}
        {runtimeError === undefined ? null : (
          <div className="world-runtime-error" role="alert">
            <h2>The draft could not be rendered.</h2>
            <p>{runtimeError}</p>
          </div>
        )}
        {interaction === null || dialogue !== null || betaScenarioOpen ? null : (
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
            worldRevisionId={reviewSource.world.versionId}
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
        {betaScenarioOpen ? (
          <Phase12EBetaGameTest
            onApplyStep={applyBetaScenarioStep}
            onClose={() => setBetaScenarioOpen(false)}
          />
        ) : null}
        {debugOpen ? (
          <aside className="world-game-test-debug" aria-label="Game Test debug panel">
            <h2>Revision debug · review source</h2>
            <dl>
              <div>
                <dt>Rendered</dt>
                <dd>{ready ? 'yes' : 'loading'}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{reviewSource.identity}</dd>
              </div>
              <div>
                <dt>Lifecycle</dt>
                <dd>{reviewSource.lifecycle}</dd>
              </div>
              <div>
                <dt>
                  {sourceMode === 'authorized_revision' ? 'Pinned assets' : 'Bundled deliveries'}
                </dt>
                <dd>{reviewSource.world.assetDeliveries.length}</dd>
              </div>
              <div>
                <dt>Fallbacks</dt>
                <dd>{fallbacks.length}</dd>
              </div>
              <div>
                <dt>Last evidence</dt>
                <dd>
                  {sourceMode === 'authorized_revision'
                    ? (props.projection.latestEvidence?.result ?? 'not tested')
                    : 'not applicable to unpublished local source'}
                </dd>
              </div>
              <div>
                <dt>Realtime</dt>
                <dd>disabled · local fixtures only</dd>
              </div>
              <div>
                <dt>Visual QA</dt>
                <dd>
                  {visualReviewFixture.totalPlayerCount} player(s) · {visualSettings.quality} · no
                  telemetry
                </dd>
              </div>
              <div>
                <dt>Position</dt>
                <dd>
                  {localState.x.toFixed(2)}, {localState.y.toFixed(2)}
                </dd>
              </div>
            </dl>
            <h3>
              {sourceMode === 'authorized_revision'
                ? 'Immutable asset pins'
                : 'Bundled-only in-memory deliveries'}
            </h3>
            <ul className="world-game-test-debug__assets">
              {reviewSource.world.assetDeliveries.map((delivery) => {
                const fallback = fallbacks.some(
                  (event) =>
                    event.assetKey === delivery.assetKey && event.versionId === delivery.versionId,
                );
                const objectCount = reviewSource.world.manifest.objects.filter(
                  (object) => object.assetId === delivery.assetKey,
                ).length;
                return (
                  <li key={delivery.assetKey}>
                    <strong>{delivery.assetKey}</strong>
                    <span>{objectCount} world object(s)</span>
                    <span>
                      {sourceMode === 'authorized_revision'
                        ? `Rendered exact pin: ${delivery.versionId}`
                        : `In-memory bundled manifest: ${delivery.bundledManifestVersion ?? 'unavailable'}`}
                    </span>
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
