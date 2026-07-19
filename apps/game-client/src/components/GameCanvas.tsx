import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type {
  AppearancePreset,
  PlayerStateUpdate,
  WorldVisualSettings,
} from '@starville/game-core';

import type {
  GameRuntimeCallbacks,
  GameRuntimeClock,
  GameRuntimeHandle,
  ExitTransitionRequest,
  AvatarRendererMode,
  InteractionPrompt,
  LocalMovementPhase,
  MasterAudioSettings,
  RuntimeWorld,
  WorldChatBubbleMessage,
} from '../game/contracts';
import { WORLD_ASSET_FALLBACK_EVENT_NAME } from '../game/contracts';
import type { WorldInteraction } from '@starville/game-core';
import type { PublicPresence } from '@starville/realtime';
import type { CooperativeActivityInstanceSnapshot } from '@starville/cooperative-activities';
import type { ResolvedAvatarProfile } from '../app/avatar-client';
import {
  IDLE_TOUCH_MOVEMENT,
  touchMovementForDirections,
  type TouchMovementDirection,
} from '../game/input/touch-movement';

const TOUCH_MOVEMENT_BUTTONS: readonly Readonly<{
  direction: TouchMovementDirection;
  label: string;
  symbol: string;
}>[] = [
  { direction: 'up', label: 'Move up', symbol: '▲' },
  { direction: 'left', label: 'Move left', symbol: '◀' },
  { direction: 'down', label: 'Move down', symbol: '▼' },
  { direction: 'right', label: 'Move right', symbol: '▶' },
];

interface GameCanvasProps {
  readonly initialState: PlayerStateUpdate;
  readonly initialWorld: RuntimeWorld;
  readonly appearancePreset: AppearancePreset;
  readonly avatarProfile?: ResolvedAvatarProfile;
  readonly avatarRendererMode?: AvatarRendererMode;
  readonly inputBlocked: boolean;
  readonly audioSettings: MasterAudioSettings;
  readonly showRemotePlayerNames?: boolean;
  readonly visualSettings?: Partial<WorldVisualSettings>;
  readonly chatBubbleMessages?: readonly WorldChatBubbleMessage[];
  readonly reducedMotion?: boolean;
  readonly clock?: GameRuntimeClock;
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
  const touchPointersRef = useRef(new Map<number, TouchMovementDirection>());
  const touchKeysRef = useRef(new Set<TouchMovementDirection>());
  const inputBlockedRef = useRef(props.inputBlocked);
  const initialStateRef = useRef(props.initialState);
  const initialWorldRef = useRef(props.initialWorld);
  const appearancePresetRef = useRef(props.appearancePreset);
  const avatarProfileRef = useRef(props.avatarProfile);
  const avatarRendererModeRef = useRef(props.avatarRendererMode ?? 'published_v1');
  const initialAudioSettingsRef = useRef(props.audioSettings);
  const initialReducedMotionRef = useRef(props.reducedMotion ?? false);
  const initialRemoteNamesVisibleRef = useRef(props.showRemotePlayerNames ?? true);
  const initialVisualSettingsRef = useRef(props.visualSettings ?? {});
  const initialChatBubbleMessagesRef = useRef(props.chatBubbleMessages ?? []);
  const initialClockRef = useRef(props.clock);
  const remotePresencesRef = useRef(props.remotePresences ?? []);
  const remoteAvatarProfilesRef = useRef(props.remoteAvatarProfiles ?? {});
  const activityInstanceRef = useRef(props.activityInstance ?? null);
  remotePresencesRef.current = props.remotePresences ?? [];
  remoteAvatarProfilesRef.current = props.remoteAvatarProfiles ?? {};
  activityInstanceRef.current = props.activityInstance ?? null;
  inputBlockedRef.current = props.inputBlocked;
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

  function publishTouchMovement(): void {
    const directions = [...touchPointersRef.current.values(), ...touchKeysRef.current.values()];
    runtimeRef.current?.setTouchMovementInput(touchMovementForDirections(directions));
  }

  function startPointerMovement(
    direction: TouchMovementDirection,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    if (props.inputBlocked) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    touchPointersRef.current.set(event.pointerId, direction);
    publishTouchMovement();
  }

  function stopPointerMovement(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!touchPointersRef.current.delete(event.pointerId)) return;
    publishTouchMovement();
  }

  function startKeyMovement(
    direction: TouchMovementDirection,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    if (props.inputBlocked || event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
    event.preventDefault();
    touchKeysRef.current.add(direction);
    publishTouchMovement();
  }

  function stopKeyMovement(
    direction: TouchMovementDirection,
    event?: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event !== undefined && event.key !== ' ' && event.key !== 'Enter') return;
    if (!touchKeysRef.current.delete(direction)) return;
    event?.preventDefault();
    publishTouchMovement();
  }

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
          avatarRendererMode: avatarRendererModeRef.current,
          reducedMotion:
            initialReducedMotionRef.current ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          visualSettings: initialVisualSettingsRef.current,
          ...(initialClockRef.current === undefined ? {} : { clock: initialClockRef.current }),
          collisionDebug: import.meta.env['NEXT_PUBLIC_GAME_COLLISION_DEBUG'] === 'true',
          audioSettings: initialAudioSettingsRef.current,
          callbacks: callbackProxy,
        });
        runtimeRef.current.setInputBlocked(inputBlockedRef.current);
        runtimeRef.current.setTouchMovementInput(IDLE_TOUCH_MOVEMENT);
        runtimeRef.current.setRemotePresences(remotePresencesRef.current);
        runtimeRef.current.setRemoteAvatarProfiles(remoteAvatarProfilesRef.current);
        runtimeRef.current.setRemotePlayerNamesVisible(initialRemoteNamesVisibleRef.current);
        runtimeRef.current.setVisualSettings(initialVisualSettingsRef.current);
        runtimeRef.current.setChatBubbleMessages(initialChatBubbleMessagesRef.current);
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
    if (props.inputBlocked) {
      touchPointersRef.current.clear();
      touchKeysRef.current.clear();
      runtimeRef.current?.setTouchMovementInput(IDLE_TOUCH_MOVEMENT);
    }
  }, [props.inputBlocked]);

  useEffect(() => {
    const releaseTouchMovement = () => {
      touchPointersRef.current.clear();
      touchKeysRef.current.clear();
      runtimeRef.current?.setTouchMovementInput(IDLE_TOUCH_MOVEMENT);
    };
    const releaseWhenHidden = () => {
      if (document.visibilityState === 'hidden') releaseTouchMovement();
    };
    window.addEventListener('blur', releaseTouchMovement);
    document.addEventListener('visibilitychange', releaseWhenHidden);
    return () => {
      window.removeEventListener('blur', releaseTouchMovement);
      document.removeEventListener('visibilitychange', releaseWhenHidden);
    };
  }, []);

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
    runtimeRef.current?.setVisualSettings(props.visualSettings ?? {});
  }, [props.visualSettings]);

  useEffect(() => {
    runtimeRef.current?.setChatBubbleMessages(props.chatBubbleMessages ?? []);
  }, [props.chatBubbleMessages]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () =>
      runtimeRef.current?.setReducedMotion((props.reducedMotion ?? false) || preference.matches);
    apply();
    preference.addEventListener?.('change', apply);
    return () => preference.removeEventListener?.('change', apply);
  }, [props.reducedMotion]);

  useEffect(() => {
    runtimeRef.current?.setSelectedRemotePresence(props.selectedRemotePresenceId ?? null);
  }, [props.selectedRemotePresenceId]);

  useEffect(() => {
    runtimeRef.current?.setActivityInstance(props.activityInstance ?? null);
  }, [props.activityInstance]);

  return (
    <>
      <div
        ref={hostRef}
        className="game-canvas"
        role="img"
        aria-label={`${props.initialWorld.manifest.name} isometric game world`}
      />
      <div className="game-touch-movement" role="group" aria-label="Touch movement controls">
        {TOUCH_MOVEMENT_BUTTONS.map(({ direction, label, symbol }) => (
          <button
            aria-label={label}
            className={`game-touch-movement__${direction}`}
            disabled={props.inputBlocked}
            key={direction}
            type="button"
            onBlur={() => stopKeyMovement(direction)}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => startKeyMovement(direction, event)}
            onKeyUp={(event) => stopKeyMovement(direction, event)}
            onLostPointerCapture={stopPointerMovement}
            onPointerCancel={stopPointerMovement}
            onPointerDown={(event) => startPointerMovement(direction, event)}
            onPointerUp={stopPointerMovement}
          >
            <span aria-hidden="true">{symbol}</span>
          </button>
        ))}
      </div>
    </>
  );
}
