import { useEffect, useRef } from 'react';

import type { AppearancePreset, PlayerStateUpdate } from '@starville/game-core';

import type {
  GameRuntimeCallbacks,
  GameRuntimeHandle,
  ExitTransitionRequest,
  InteractionPrompt,
  LocalMovementPhase,
  MasterAudioSettings,
  RuntimeWorld,
} from '../game/contracts';
import { WORLD_ASSET_FALLBACK_EVENT_NAME } from '../game/contracts';
import type { WorldInteraction } from '@starville/game-core';
import type { PublicPresence } from '@starville/realtime';
import type { CooperativeActivityInstanceSnapshot } from '@starville/cooperative-activities';
import type { ResolvedAvatarProfile } from '../app/avatar-client';

interface GameCanvasProps {
  readonly initialState: PlayerStateUpdate;
  readonly initialWorld: RuntimeWorld;
  readonly appearancePreset: AppearancePreset;
  readonly avatarProfile?: ResolvedAvatarProfile;
  readonly inputBlocked: boolean;
  readonly audioSettings: MasterAudioSettings;
  readonly showRemotePlayerNames?: boolean;
  readonly onReady: () => void;
  readonly onError: (message: string) => void;
  readonly onStateChanged: (state: PlayerStateUpdate, phase: LocalMovementPhase) => void;
  readonly onCheckpoint: (state: PlayerStateUpdate) => void;
  readonly onFinalState: (state: PlayerStateUpdate) => void;
  readonly onInteractionTarget: (prompt: InteractionPrompt | null) => void;
  readonly onInteractionOpen: (interaction: WorldInteraction) => void;
  readonly onSettingsRequested: () => void;
  readonly onExitRequested: (request: ExitTransitionRequest) => void;
  readonly onMapChanged: (world: RuntimeWorld) => void;
  readonly onRuntimeCreated: (runtime: GameRuntimeHandle | null) => void;
  readonly remotePresences?: readonly PublicPresence[];
  readonly remoteAvatarProfiles?: Readonly<Record<string, ResolvedAvatarProfile>>;
  readonly selectedRemotePresenceId?: string | null;
  readonly onRemotePlayerSelected?: (presenceId: string | null) => void;
  readonly activityInstance?: CooperativeActivityInstanceSnapshot | null;
  readonly onActivityInteraction?: GameRuntimeCallbacks['onActivityInteraction'];
}

export function GameCanvas(props: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GameRuntimeHandle | undefined>(undefined);
  const initialStateRef = useRef(props.initialState);
  const initialWorldRef = useRef(props.initialWorld);
  const appearancePresetRef = useRef(props.appearancePreset);
  const avatarProfileRef = useRef(props.avatarProfile);
  const initialAudioSettingsRef = useRef(props.audioSettings);
  const initialRemoteNamesVisibleRef = useRef(props.showRemotePlayerNames ?? true);
  const remotePresencesRef = useRef(props.remotePresences ?? []);
  const remoteAvatarProfilesRef = useRef(props.remoteAvatarProfiles ?? {});
  const activityInstanceRef = useRef(props.activityInstance ?? null);
  remotePresencesRef.current = props.remotePresences ?? [];
  remoteAvatarProfilesRef.current = props.remoteAvatarProfiles ?? {};
  activityInstanceRef.current = props.activityInstance ?? null;
  const callbacksRef = useRef<GameRuntimeCallbacks>({
    onReady: props.onReady,
    onError: props.onError,
    onStateChanged: props.onStateChanged,
    onCheckpoint: props.onCheckpoint,
    onInteractionTarget: props.onInteractionTarget,
    onInteractionOpen: props.onInteractionOpen,
    onSettingsRequested: props.onSettingsRequested,
    onExitRequested: props.onExitRequested,
    onMapChanged: props.onMapChanged,
    onRemotePlayerSelected: props.onRemotePlayerSelected ?? (() => undefined),
    onWorldAssetFallback: (event) =>
      window.dispatchEvent(
        new CustomEvent(WORLD_ASSET_FALLBACK_EVENT_NAME, {
          detail: event,
        }),
      ),
    onActivityInteraction: props.onActivityInteraction ?? (() => undefined),
  });
  callbacksRef.current = {
    onReady: props.onReady,
    onError: props.onError,
    onStateChanged: props.onStateChanged,
    onCheckpoint: props.onCheckpoint,
    onInteractionTarget: props.onInteractionTarget,
    onInteractionOpen: props.onInteractionOpen,
    onSettingsRequested: props.onSettingsRequested,
    onExitRequested: props.onExitRequested,
    onMapChanged: props.onMapChanged,
    onRemotePlayerSelected: props.onRemotePlayerSelected ?? (() => undefined),
    onWorldAssetFallback: (event) =>
      window.dispatchEvent(
        new CustomEvent(WORLD_ASSET_FALLBACK_EVENT_NAME, {
          detail: event,
        }),
      ),
    onActivityInteraction: props.onActivityInteraction ?? (() => undefined),
  };
  const lifecycleRef = useRef({
    onFinalState: props.onFinalState,
    onRuntimeCreated: props.onRuntimeCreated,
  });
  lifecycleRef.current = {
    onFinalState: props.onFinalState,
    onRuntimeCreated: props.onRuntimeCreated,
  };

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      return;
    }

    let disposed = false;

    void import('../game')
      .then(({ startGame }) => {
        if (disposed) return;
        const callbackProxy: GameRuntimeCallbacks = {
          onReady: () => callbacksRef.current.onReady(),
          onError: (message) => callbacksRef.current.onError(message),
          onStateChanged: (state, phase) => callbacksRef.current.onStateChanged(state, phase),
          onCheckpoint: (state) => callbacksRef.current.onCheckpoint(state),
          onInteractionTarget: (prompt) => callbacksRef.current.onInteractionTarget(prompt),
          onInteractionOpen: (interaction) => callbacksRef.current.onInteractionOpen(interaction),
          onSettingsRequested: () => callbacksRef.current.onSettingsRequested(),
          onExitRequested: (request) => callbacksRef.current.onExitRequested(request),
          onMapChanged: (world) => callbacksRef.current.onMapChanged(world),
          onRemotePlayerSelected: (presenceId) =>
            callbacksRef.current.onRemotePlayerSelected(presenceId),
          onWorldAssetFallback: (event) => callbacksRef.current.onWorldAssetFallback(event),
          onActivityInteraction: (interaction) =>
            callbacksRef.current.onActivityInteraction(interaction),
        };
        runtimeRef.current = startGame(host, {
          initialState: initialStateRef.current,
          initialWorld: initialWorldRef.current,
          appearancePreset: appearancePresetRef.current,
          ...(avatarProfileRef.current === undefined
            ? {}
            : { avatarProfile: avatarProfileRef.current }),
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          collisionDebug: import.meta.env['NEXT_PUBLIC_GAME_COLLISION_DEBUG'] === 'true',
          audioSettings: initialAudioSettingsRef.current,
          callbacks: callbackProxy,
        });
        runtimeRef.current.setRemotePresences(remotePresencesRef.current);
        runtimeRef.current.setRemoteAvatarProfiles(remoteAvatarProfilesRef.current);
        runtimeRef.current.setRemotePlayerNamesVisible(initialRemoteNamesVisibleRef.current);
        runtimeRef.current.setActivityInstance(activityInstanceRef.current);
        lifecycleRef.current.onRuntimeCreated(runtimeRef.current);
      })
      .catch(() => callbacksRef.current.onError('The Starville renderer could not be started.'));

    return () => {
      disposed = true;
      const runtime = runtimeRef.current;
      if (runtime !== undefined) {
        try {
          lifecycleRef.current.onFinalState(runtime.getState());
        } finally {
          runtime.destroy();
          runtimeRef.current = undefined;
        }
      }
      lifecycleRef.current.onRuntimeCreated(null);
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.setInputBlocked(props.inputBlocked);
  }, [props.inputBlocked]);

  useEffect(() => {
    runtimeRef.current?.setAudioSettings(props.audioSettings);
  }, [props.audioSettings]);

  useEffect(() => {
    runtimeRef.current?.setRemotePresences(props.remotePresences ?? []);
  }, [props.remotePresences]);

  useEffect(() => {
    if (props.avatarProfile !== undefined)
      runtimeRef.current?.setLocalAvatarProfile(props.avatarProfile);
  }, [props.avatarProfile]);

  useEffect(() => {
    runtimeRef.current?.setRemoteAvatarProfiles(props.remoteAvatarProfiles ?? {});
  }, [props.remoteAvatarProfiles]);

  useEffect(() => {
    runtimeRef.current?.setRemotePlayerNamesVisible(props.showRemotePlayerNames ?? true);
  }, [props.showRemotePlayerNames]);

  useEffect(() => {
    runtimeRef.current?.setSelectedRemotePresence(props.selectedRemotePresenceId ?? null);
  }, [props.selectedRemotePresenceId]);

  useEffect(() => {
    runtimeRef.current?.setActivityInstance(props.activityInstance ?? null);
  }, [props.activityInstance]);

  return (
    <div
      ref={hostRef}
      className="game-canvas"
      role="img"
      aria-label={`${props.initialWorld.manifest.name} isometric game world`}
    />
  );
}
