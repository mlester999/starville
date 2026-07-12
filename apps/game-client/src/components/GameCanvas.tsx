import { useEffect, useRef } from 'react';

import type { AppearancePreset, PlayerStateUpdate } from '@starville/game-core';

import type {
  GameRuntimeCallbacks,
  GameRuntimeHandle,
  ExitTransitionRequest,
  InteractionDialogue,
  InteractionPrompt,
  RuntimeWorld,
} from '../game/contracts';
import type { GameSettings } from '../app/game-settings';

interface GameCanvasProps {
  readonly initialState: PlayerStateUpdate;
  readonly initialWorld: RuntimeWorld;
  readonly appearancePreset: AppearancePreset;
  readonly inputBlocked: boolean;
  readonly audioSettings: GameSettings;
  readonly onReady: () => void;
  readonly onError: (message: string) => void;
  readonly onStateChanged: (state: PlayerStateUpdate) => void;
  readonly onCheckpoint: (state: PlayerStateUpdate) => void;
  readonly onFinalState: (state: PlayerStateUpdate) => void;
  readonly onInteractionTarget: (prompt: InteractionPrompt | null) => void;
  readonly onInteractionOpen: (dialogue: InteractionDialogue) => void;
  readonly onSettingsRequested: () => void;
  readonly onExitRequested: (request: ExitTransitionRequest) => void;
  readonly onMapChanged: (world: RuntimeWorld) => void;
  readonly onRuntimeCreated: (runtime: GameRuntimeHandle | null) => void;
}

export function GameCanvas(props: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GameRuntimeHandle | undefined>(undefined);
  const initialStateRef = useRef(props.initialState);
  const initialWorldRef = useRef(props.initialWorld);
  const appearancePresetRef = useRef(props.appearancePreset);
  const initialAudioSettingsRef = useRef(props.audioSettings);
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
          onStateChanged: (state) => callbacksRef.current.onStateChanged(state),
          onCheckpoint: (state) => callbacksRef.current.onCheckpoint(state),
          onInteractionTarget: (prompt) => callbacksRef.current.onInteractionTarget(prompt),
          onInteractionOpen: (dialogue) => callbacksRef.current.onInteractionOpen(dialogue),
          onSettingsRequested: () => callbacksRef.current.onSettingsRequested(),
          onExitRequested: (request) => callbacksRef.current.onExitRequested(request),
          onMapChanged: (world) => callbacksRef.current.onMapChanged(world),
        };
        runtimeRef.current = startGame(host, {
          initialState: initialStateRef.current,
          initialWorld: initialWorldRef.current,
          appearancePreset: appearancePresetRef.current,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          collisionDebug: import.meta.env['NEXT_PUBLIC_GAME_COLLISION_DEBUG'] === 'true',
          audioSettings: initialAudioSettingsRef.current,
          callbacks: callbackProxy,
        });
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

  return (
    <div
      ref={hostRef}
      className="game-canvas"
      role="img"
      aria-label={`${props.initialWorld.manifest.name} isometric game world`}
    />
  );
}
