import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlayerProfile, PlayerStateUpdate, WorldInteraction } from '@starville/game-core';
import type { PlayableVerticalSlice } from '@starville/cozy-gameplay';
import { socialDistance } from '@starville/realtime';

import { loadGameSettings, saveGameSettings, type GameSettings } from '../app/game-settings';
import { PlayerRequestError } from '../app/player-client';
import { loadProgression } from '../app/progression-client';
import type { TrustedTokenAccess } from '../app/token-access-client';
import { usePlayerPersistence } from '../app/use-player-persistence';
import { transitionPublishedWorld, type PublishedWorld } from '../app/world-client';
import type {
  ExitTransitionRequest,
  GameRuntimeHandle,
  InteractionDialogue,
  InteractionPrompt,
  LocalMovementPhase,
  RuntimeWorld,
} from '../game/contracts';
import { personalHomeRuntimeWorld } from '../game/personal-home-world';
import { CozyGameplay } from './CozyGameplay';
import { ChatPanel } from './ChatPanel';
import { GameCanvas } from './GameCanvas';
import { GameSettingsDialog } from './GameSettingsDialog';
import { useRealtimePresence } from '../app/use-realtime-presence';
import { useAvatarProfiles } from '../app/use-avatar-profiles';
import { SocialInteractionPanel } from './SocialInteractionPanel';
import { CompactPartyHud, SocialGraphPanel } from './SocialGraphPanel';
import { CooperativeActivityPanel } from './CooperativeActivityPanel';
import { PlayerStatusDock } from './PlayerStatusDock';
import { PremiumWardrobe, QuickEmoteWheel } from './PremiumWardrobe';
import {
  trackedProgressionQuest,
  type TrackedProgressionQuest,
} from '../app/progression-projection';
import { ProgressionPanel } from './ProgressionPanel';
import { GuidedPlayerExperience } from './GuidedPlayerExperience';
import { GameplayAssetOverrideProvider } from './GameplayAssetOverrides';
import type { GameplayAssetOverride } from '@starville/asset-management';
import { beginGameWorldReads } from '../app/game-world-bootstrap';

interface GameWorldProps {
  readonly apiUrl: string;
  readonly landingUrl: string;
  readonly profile: PlayerProfile;
  readonly access: TrustedTokenAccess;
  readonly rechecking: boolean;
  readonly onRecheck: () => Promise<void>;
  readonly onAccessInvalid: () => void;
  readonly onLeaveVillage: () => Promise<void>;
  readonly onRegisterMaintenanceFlush?: (handler: (() => Promise<void>) | undefined) => void;
  readonly realtimeUrl?: string | undefined;
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
    assetDeliveries: world.assetDeliveries,
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
  onRegisterMaintenanceFlush,
  initialWorld,
  realtimeUrl,
}: LoadedGameWorldProps) {
  const runtime = useRef<GameRuntimeHandle | null>(null);
  const transitionRequest = useRef<AbortController | null>(null);
  const [world, setWorld] = useState(initialWorld);
  const [ready, setReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [emoteWheelOpen, setEmoteWheelOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() =>
    loadGameSettings(window.localStorage),
  );
  const [leaving, setLeaving] = useState(false);
  const [interaction, setInteraction] = useState<InteractionPrompt | null>(null);
  const [dialogue, setDialogue] = useState<InteractionDialogue | null>(null);
  const [cozyInteraction, setCozyInteraction] = useState<Exclude<
    WorldInteraction,
    { readonly type: 'notice' }
  > | null>(null);
  const [cozyOpen, setCozyOpen] = useState(false);
  const [chatInputActive, setChatInputActive] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialGraphOpen, setSocialGraphOpen] = useState(false);
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [progressionOpen, setProgressionOpen] = useState(false);
  const [playerGuideOpen, setPlayerGuideOpen] = useState(false);
  const [guidedObjectiveActive, setGuidedObjectiveActive] = useState(false);
  const [playerExperienceRefresh, setPlayerExperienceRefresh] = useState(0);
  const cozyPanelWasOpen = useRef(false);
  const [playerLevel, setPlayerLevel] = useState<number>();
  const [trackedQuest, setTrackedQuest] = useState<TrackedProgressionQuest | null>(null);
  const [channelPopoverOpen, setChannelPopoverOpen] = useState(false);
  const [dustBalance, setDustBalance] = useState<number>();
  const [inventoryRequest, setInventoryRequest] = useState(0);
  const [dustHistoryRequest, setDustHistoryRequest] = useState(0);
  const [nearbyRequest, setNearbyRequest] = useState(0);
  const [socialGraphRequest, setSocialGraphRequest] = useState(0);
  const [socialGraphRequestedTab, setSocialGraphRequestedTab] = useState<
    'friends' | 'requests' | 'party'
  >('friends');
  const [activityRequest, setActivityRequest] = useState(0);
  const [selectedRemotePresenceId, setSelectedRemotePresenceId] = useState<string | null>(null);
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const initialState = stateFromWorld(initialWorld);
  const [insidePersonalHome, setInsidePersonalHome] = useState(false);
  const publicStateBeforeHome = useRef(initialState);
  const personalHomeViewRef = useRef<PlayableVerticalSlice | undefined>(undefined);
  const realtime = useRealtimePresence({
    apiUrl,
    realtimeUrl,
    worldId: world.manifest.id,
    worldVersionId: world.version.id,
    onAccessInvalid,
    enabled: !insidePersonalHome,
  });

  const updateProgressionHud = useCallback(
    (progression: Awaited<ReturnType<typeof loadProgression>>) => {
      setPlayerLevel(progression.playerLevel.level);
      setTrackedQuest(trackedProgressionQuest(progression));
    },
    [],
  );
  const handleCozyOpenChange = useCallback((open: boolean) => {
    const wasOpen = cozyPanelWasOpen.current;
    cozyPanelWasOpen.current = open;
    setCozyOpen(open);
    if (wasOpen && !open) setPlayerExperienceRefresh((value) => value + 1);
  }, []);
  const handleProgressionWorkspaceChange = useCallback(
    (next: Awaited<ReturnType<typeof loadProgression>>) => {
      updateProgressionHud(next);
      setPlayerExperienceRefresh((value) => value + 1);
    },
    [updateProgressionHud],
  );

  useEffect(() => {
    let active = true;
    void loadProgression(apiUrl)
      .then((progression) => {
        if (active) updateProgressionHud(progression);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [apiUrl, updateProgressionHud]);
  const avatars = useAvatarProfiles(apiUrl, profile.appearancePreset, realtime.state.remotes);
  const activityInstanceRef = useRef(realtime.state.activity.instance);
  activityInstanceRef.current = realtime.state.activity.instance;
  const [localPlayerState, setLocalPlayerState] = useState(initialState);
  const persistence = usePlayerPersistence({
    apiUrl,
    initialState,
    initialGameStateVersion: initialWorld.playerState.gameStateVersion,
    onAccessInvalid,
  });
  useEffect(() => {
    onRegisterMaintenanceFlush?.(persistence.flushBeforeLeave);
    return () => onRegisterMaintenanceFlush?.(undefined);
  }, [onRegisterMaintenanceFlush, persistence.flushBeforeLeave]);
  const traveling = transition?.phase === 'traveling';
  const blockingModalOpen =
    settingsOpen ||
    avatarEditorOpen ||
    emoteWheelOpen ||
    dialogue !== null ||
    cozyOpen ||
    socialOpen ||
    socialGraphOpen ||
    activityPanelOpen ||
    progressionOpen ||
    playerGuideOpen ||
    leaving ||
    traveling;
  const inputBlocked = blockingModalOpen || chatInputActive || channelPopoverOpen;

  useEffect(
    () => () => {
      transitionRequest.current?.abort();
    },
    [],
  );

  const setRuntime = useCallback(
    (nextRuntime: GameRuntimeHandle | null) => {
      runtime.current = nextRuntime;
      const homeView = personalHomeViewRef.current;
      if (nextRuntime !== null && insidePersonalHome && homeView !== undefined) {
        nextRuntime.loadWorld(personalHomeRuntimeWorld(runtimeWorld(world), homeView), {
          ...publicStateBeforeHome.current,
          x: homeView.plot.spawn.x,
          y: homeView.plot.spawn.y,
          facingDirection: 'north',
        });
      }
    },
    [insidePersonalHome, world],
  );

  const toggleSettings = useCallback(() => {
    if (dialogue === null && !leaving && !traveling) setSettingsOpen((value) => !value);
  }, [dialogue, leaving, traveling]);

  const closeDialogue = useCallback(() => setDialogue(null), []);

  const openInteraction = useCallback((nextInteraction: WorldInteraction) => {
    if (
      nextInteraction.id === 'phase10b-wardrobe-mirror' ||
      nextInteraction.id === 'phase10b-wardrobe-furniture'
    ) {
      setAvatarEditorOpen(true);
    } else if (nextInteraction.type === 'notice') {
      setDialogue({
        id: nextInteraction.id,
        title: nextInteraction.title,
        content: nextInteraction.content,
      });
    } else {
      setCozyInteraction(nextInteraction);
    }
  }, []);

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

  useEffect(() => {
    function handleEmoteShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'q' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(?:INPUT|SELECT|TEXTAREA|BUTTON)$/u.test(target.tagName))
      ) {
        return;
      }
      if (blockingModalOpen || chatInputActive || channelPopoverOpen) return;
      event.preventDefault();
      setEmoteWheelOpen(true);
    }

    window.addEventListener('keydown', handleEmoteShortcut);
    return () => window.removeEventListener('keydown', handleEmoteShortcut);
  }, [blockingModalOpen, channelPopoverOpen, chatInputActive]);

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
          assetDeliveries: destination.assetDeliveries,
          playerState: destination.playerState,
        };
        runtime.current?.loadWorld(runtimeWorld(nextWorld), stateFromWorld(nextWorld));
        setLocalPlayerState(stateFromWorld(nextWorld));
        setSelectedRemotePresenceId(null);
        setWorld(nextWorld);
        setInteraction(null);
        setDialogue(null);
        setCozyInteraction(null);
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
  const reportLocalState = useCallback(
    (state: PlayerStateUpdate, phase: LocalMovementPhase) => {
      setLocalPlayerState(state);
      if (insidePersonalHome) return;
      if (activityInstanceRef.current === null) persistence.noteState(state);
      if (phase === 'stopped') realtime.stopMovement(state);
      else realtime.sendMovement(state);
    },
    [insidePersonalHome, persistence, realtime],
  );
  const nearbyPlayers = realtime.state.remotes.filter(
    (presence) =>
      presence.worldId === world.manifest.id &&
      presence.channelId === realtime.state.self?.channelId &&
      socialDistance(localPlayerState, presence) <= realtime.state.social.interactionDistance,
  );

  const socialNoticeCount =
    realtime.state.socialGraph.incomingRequests.length +
    realtime.state.socialGraph.invitations.length;
  const partyInvitationCount = realtime.state.socialGraph.invitations.length;
  const previousPartyInvitationCount = useRef(partyInvitationCount);

  useEffect(() => {
    const previous = previousPartyInvitationCount.current;
    previousPartyInvitationCount.current = partyInvitationCount;
    if (
      partyInvitationCount > previous &&
      settings.autoOpenPartyNotifications &&
      !blockingModalOpen &&
      realtime.state.status === 'connected'
    ) {
      setSocialGraphRequestedTab('party');
      setSocialGraphRequest((value) => value + 1);
    }
  }, [
    blockingModalOpen,
    partyInvitationCount,
    realtime.state.status,
    settings.autoOpenPartyNotifications,
  ]);

  function openSocialGraph(tab: 'friends' | 'requests' | 'party' = 'friends') {
    setSocialGraphRequestedTab(tab);
    setSocialGraphRequest((value) => value + 1);
  }

  const shellClasses = [
    'world-shell',
    `game-ui-scale--${String(Math.round(settings.uiScale * 100))}`,
    settings.compactHud ? 'world-shell--compact-hud' : '',
    settings.simplifiedHud ? 'world-shell--simplified-hud' : '',
    settings.increasedTextContrast ? 'world-shell--increased-contrast' : '',
    settings.largerChatText ? 'world-shell--larger-chat' : '',
    settings.reducedMotion ? 'world-shell--reduced-motion' : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (
      selectedRemotePresenceId !== null &&
      !nearbyPlayers.some((presence) => presence.presenceId === selectedRemotePresenceId)
    ) {
      setSelectedRemotePresenceId(null);
    }
  }, [nearbyPlayers, selectedRemotePresenceId]);

  return (
    <main className={shellClasses}>
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

      <section
        className={`world-frame${blockingModalOpen ? ' world-frame--modal-open' : ''}${
          realtime.state.activity.instance === null ? '' : ' world-frame--activity-active'
        }`}
        aria-labelledby="world-map-name"
      >
        <div className="world-hud world-hud--identity">
          <p className="world-hud__eyebrow">Villager</p>
          <strong>{profile.displayName}</strong>
          <span>{saveLabel}</span>
        </div>
        {!settings.showLocationBanner ? null : (
          <div className="world-hud world-hud--location">
            <p className="world-hud__eyebrow">Current location</p>
            <strong id="world-map-name">
              {insidePersonalHome ? 'Private Home Plot' : world.map.displayName}
            </strong>
            <span>
              {insidePersonalHome ? 'Owner-only starter cottage garden' : world.map.description}
            </span>
          </div>
        )}
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
            className="world-emote-button"
            disabled={blockingModalOpen || realtime.state.status !== 'connected'}
            type="button"
            onClick={() => setEmoteWheelOpen(true)}
          >
            <kbd>Q</kbd> Emote
          </button>
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

        <GameCanvas
          appearancePreset={profile.appearancePreset}
          avatarProfile={avatars.localProfile}
          audioSettings={settings}
          showRemotePlayerNames={settings.showNearbyPlayerNames}
          initialState={initialState}
          initialWorld={runtimeWorld(initialWorld)}
          inputBlocked={inputBlocked}
          onCheckpoint={persistence.checkpoint}
          onError={setRuntimeError}
          onExitRequested={(request) => void handleExit(request)}
          onFinalState={persistence.checkpoint}
          onInteractionOpen={openInteraction}
          onInteractionTarget={setInteraction}
          onMapChanged={() => undefined}
          onSettingsRequested={toggleSettings}
          onReady={() => setReady(true)}
          onRuntimeCreated={setRuntime}
          onRemotePlayerSelected={(presenceId) => {
            setSelectedRemotePresenceId(presenceId);
            if (presenceId !== null) setNearbyRequest((value) => value + 1);
          }}
          onStateChanged={reportLocalState}
          activityInstance={realtime.state.activity.instance}
          onActivityInteraction={realtime.interactWithActivity}
          remotePresences={realtime.state.remotes}
          remoteAvatarProfiles={avatars.remoteProfiles}
          selectedRemotePresenceId={selectedRemotePresenceId}
        />

        {!ready && runtimeError === undefined ? (
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

        {interaction === null || inputBlocked || !settings.showInteractionHints ? null : (
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

        <CozyGameplay
          apiUrl={apiUrl}
          realtimeUrl={realtimeUrl}
          interaction={cozyInteraction}
          onAccessInvalid={onAccessInvalid}
          onInteractionClose={() => setCozyInteraction(null)}
          onOpenChange={handleCozyOpenChange}
          externalInventoryRequest={inventoryRequest}
          externalDustRequest={dustHistoryRequest}
          onDustBalanceChange={setDustBalance}
          showStandaloneHud={false}
          onHomeAccessChange={(location, view) => {
            if (location === 'personal_home') {
              personalHomeViewRef.current = view;
              const currentPublicState = runtime.current?.getState() ?? stateFromWorld(world);
              publicStateBeforeHome.current = currentPublicState;
              const privateWorld = personalHomeRuntimeWorld(runtimeWorld(world), view);
              const privateState = {
                ...currentPublicState,
                x: view.plot.spawn.x,
                y: view.plot.spawn.y,
                facingDirection: 'north' as const,
              };
              runtime.current?.loadWorld(privateWorld, privateState);
              setLocalPlayerState(privateState);
              setSelectedRemotePresenceId(null);
              setInsidePersonalHome(true);
              setPlayerExperienceRefresh((value) => value + 1);
            } else {
              personalHomeViewRef.current = undefined;
              const publicState = publicStateBeforeHome.current;
              runtime.current?.loadWorld(runtimeWorld(world), publicState);
              setLocalPlayerState(publicState);
              setInsidePersonalHome(false);
              setPlayerExperienceRefresh((value) => value + 1);
            }
          }}
        />

        <ChatPanel
          chat={realtime.state.chat}
          connectionStatus={realtime.state.status}
          disabled={blockingModalOpen}
          partyEnabled={realtime.state.socialGraph.party !== null}
          showTimestamps={settings.chatTimestamps}
          onInputActiveChange={setChatInputActive}
          onMarkRead={realtime.markChatRead}
          onPreference={realtime.setChatPreference}
          onReport={(messageId, category, reason) => {
            realtime.reportChat(messageId, category, reason);
          }}
          onSend={(scope, text) => {
            realtime.sendChat(scope, text);
          }}
          selfPresenceId={realtime.state.self?.presenceId}
        />

        {realtime.state.activity.instance === null ? (
          <SocialInteractionPanel
            connectionStatus={realtime.state.status}
            onGift={realtime.createGift}
            onFriendRequest={realtime.sendFriendRequest}
            onGiftResponse={realtime.respondGift}
            onInspect={realtime.inspectPlayer}
            onOpenChange={setSocialOpen}
            externalOpenRequest={nearbyRequest}
            showLauncher={false}
            onPartyInvite={realtime.inviteToParty}
            onPreference={realtime.setChatPreference}
            onSelect={setSelectedRemotePresenceId}
            onTradeCancel={realtime.cancelTrade}
            onTradeConfirm={realtime.confirmTrade}
            onTradeOffer={realtime.updateTradeOffer}
            onTradeRequest={realtime.requestTrade}
            onTradeResponse={realtime.respondTrade}
            onTradeResume={realtime.resumeTrade}
            preferences={realtime.state.chat.preferences}
            remotes={nearbyPlayers}
            selectedPresenceId={selectedRemotePresenceId}
            selfPresenceId={realtime.state.self?.presenceId}
            social={realtime.state.social}
            socialGraph={realtime.state.socialGraph}
          />
        ) : null}

        <SocialGraphPanel
          connectionStatus={realtime.state.status}
          nearbyPlayers={nearbyPlayers}
          onFriendRemove={realtime.removeFriend}
          onFriendRequest={realtime.sendFriendRequest}
          onFriendResponse={realtime.respondFriendRequest}
          onOpenChange={setSocialGraphOpen}
          externalOpenRequest={socialGraphRequest}
          requestedTab={socialGraphRequestedTab}
          showLauncher={false}
          showNotifications={!blockingModalOpen}
          onFindNearby={() => setNearbyRequest((value) => value + 1)}
          onPartyCreate={realtime.createParty}
          onPartyDisband={realtime.disbandParty}
          onPartyInvitationResponse={realtime.respondPartyInvitation}
          onPartyInvite={realtime.inviteToParty}
          onJoinLeaderChannel={(channelNumber) => {
            const channel = realtime.state.channels.find(
              (candidate) => candidate.number === channelNumber && candidate.available,
            );
            if (channel !== undefined) realtime.switchChannel(channel.id);
          }}
          onPartyKick={realtime.kickPartyMember}
          onPartyLeave={realtime.leaveParty}
          onPartyPromote={realtime.promotePartyLeader}
          onReadyCheckRespond={realtime.respondPartyReadyCheck}
          onReadyCheckStart={realtime.startPartyReadyCheck}
          selfPresenceId={realtime.state.self?.presenceId}
          socialGraph={realtime.state.socialGraph}
        />
        {realtime.state.activity.instance === null ? (
          <CompactPartyHud socialGraph={realtime.state.socialGraph} />
        ) : null}
        <CooperativeActivityPanel
          activity={realtime.state.activity}
          disabled={realtime.state.status !== 'connected' || blockingModalOpen}
          onCatalogRequest={realtime.requestActivityCatalog}
          onEnter={realtime.enterActivity}
          onLeave={realtime.leaveActivity}
          onOpenChange={setActivityPanelOpen}
          externalOpenRequest={activityRequest}
          showLauncher={false}
          confirmBeforeLeaving={settings.confirmBeforeLeavingActivities}
          onOpenFriends={openSocialGraph}
          onPrepare={realtime.prepareActivityEntry}
          onReady={realtime.respondActivityReady}
          onSnapshotRequest={realtime.requestActivitySnapshot}
          party={realtime.state.socialGraph.party}
          {...(realtime.state.self === undefined
            ? {}
            : { selfPresenceId: realtime.state.self.presenceId })}
        />

        <GuidedPlayerExperience
          apiUrl={apiUrl}
          disabled={blockingModalOpen || chatInputActive || traveling}
          onObjectiveChange={setGuidedObjectiveActive}
          onOpenChange={setPlayerGuideOpen}
          onOpenInventory={() => setInventoryRequest((value) => value + 1)}
          onOpenProgression={() => setProgressionOpen(true)}
          refreshSignal={playerExperienceRefresh}
        />

        {trackedQuest === null || guidedObjectiveActive ? null : (
          <button
            className="progression-tracked-hud"
            disabled={blockingModalOpen || chatInputActive || traveling}
            type="button"
            onClick={() => setProgressionOpen(true)}
          >
            <span>{trackedQuest.questName}</span>
            <strong>{trackedQuest.objectiveLabel}</strong>
            <small>
              {trackedQuest.currentCount}/{trackedQuest.requiredCount}
            </small>
          </button>
        )}

        <PlayerStatusDock
          activityActive={realtime.state.activity.instance !== null}
          channels={realtime.state.channels}
          connectionStatus={realtime.state.status}
          currentChannelId={realtime.state.self?.channelId}
          disabled={blockingModalOpen || chatInputActive || traveling}
          dustBalance={dustBalance}
          nearbyCount={nearbyPlayers.length}
          {...(playerLevel === undefined ? {} : { playerLevel })}
          socialNoticeCount={socialNoticeCount}
          onActivities={() => setActivityRequest((value) => value + 1)}
          onProgression={() => setProgressionOpen(true)}
          onChannelSwitch={realtime.switchChannel}
          onFriends={() => openSocialGraph('friends')}
          onInventory={() => setInventoryRequest((value) => value + 1)}
          onDustHistory={() => setDustHistoryRequest((value) => value + 1)}
          onNearby={() => setNearbyRequest((value) => value + 1)}
          onPopoverOpenChange={setChannelPopoverOpen}
        />

        <ProgressionPanel
          apiUrl={apiUrl}
          open={progressionOpen}
          onClose={() => {
            setProgressionOpen(false);
            setPlayerExperienceRefresh((value) => value + 1);
          }}
          onLevelChange={setPlayerLevel}
          onWorkspaceChange={handleProgressionWorkspaceChange}
        />

        {realtime.state.emotes.activations.length === 0 ? null : (
          <div className="world-emote-status" aria-live="polite" role="status">
            {realtime.state.emotes.activations
              .slice(-2)
              .map(
                (activation) =>
                  `${activation.presenceId === realtime.state.self?.presenceId ? 'You' : 'A nearby villager'}: ${activation.emoteKey}`,
              )
              .join(' · ')}
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
            appearanceEditingAvailable={avatars.localAuthoritative}
            onEditAppearance={() => {
              setSettingsOpen(false);
              setAvatarEditorOpen(true);
            }}
            onEndSession={leaveVillage}
            onResume={() => setSettingsOpen(false)}
            onReturnLanding={returnToLanding}
            onSettingsChange={updateSettings}
            pendingAction={leaving}
            settings={settings}
          />
        )}

        {!avatarEditorOpen ? null : (
          <PremiumWardrobe
            apiUrl={apiUrl}
            current={avatars.localProfile}
            onActivateEmote={realtime.activateEmote}
            onClose={() => setAvatarEditorOpen(false)}
            onSaved={(saved) => {
              avatars.setLocalProfile(saved);
              realtime.refreshAppearance();
            }}
          />
        )}

        {!emoteWheelOpen ? null : (
          <QuickEmoteWheel
            apiUrl={apiUrl}
            onActivate={realtime.activateEmote}
            onClose={() => setEmoteWheelOpen(false)}
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
  const [assetOverrides, setAssetOverrides] = useState<readonly GameplayAssetOverride[]>([]);
  const worldRef = useRef<PublishedWorld | undefined>(undefined);
  const onAccessInvalidRef = useRef(onAccessInvalid);
  worldRef.current = world;
  onAccessInvalidRef.current = onAccessInvalid;

  useEffect(() => {
    const controller = new AbortController();
    const reads = beginGameWorldReads(apiUrl, controller.signal);
    setLoadError(undefined);
    void reads.assetOverrides.then(setAssetOverrides).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setAssetOverrides([]);
      if (accessInvalid(error)) onAccessInvalidRef.current();
    });
    void reads.world
      .then((nextWorld) => {
        setWorld(nextWorld);
        setLoadError(undefined);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (accessInvalid(error)) onAccessInvalidRef.current();
        else if (worldRef.current === undefined) {
          setLoadError(
            error instanceof PlayerRequestError && error.requestId !== undefined
              ? { requestId: error.requestId }
              : {},
          );
        }
      });
    return () => controller.abort();
  }, [apiUrl, retryVersion]);

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

  return (
    <GameplayAssetOverrideProvider overrides={assetOverrides}>
      <LoadedGameWorld {...props} initialWorld={world} />
    </GameplayAssetOverrideProvider>
  );
}
