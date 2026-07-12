import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlayerStateUpdate } from '@starville/game-core';

import { PlayerRequestError, savePlayerState } from './player-client';

export type SaveStatus = 'ready' | 'saving' | 'saved' | 'unavailable';

interface UsePlayerPersistenceOptions {
  readonly apiUrl: string;
  readonly initialState: PlayerStateUpdate;
  readonly initialGameStateVersion: number;
  readonly onAccessInvalid: () => void;
}

export function usePlayerPersistence({
  apiUrl,
  initialState,
  initialGameStateVersion,
  onAccessInvalid,
}: UsePlayerPersistenceOptions) {
  const latestState = useRef<PlayerStateUpdate>({ ...initialState });
  const gameStateVersion = useRef(initialGameStateVersion);
  const queuedState = useRef<PlayerStateUpdate | undefined>(undefined);
  const activeFlush = useRef<Promise<void> | undefined>(undefined);
  const transitionInProgress = useRef(false);
  const mounted = useRef(true);
  const [status, setStatus] = useState<SaveStatus>('ready');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const flushQueued = useCallback((): Promise<void> => {
    if (activeFlush.current !== undefined) return activeFlush.current;

    const flush = (async () => {
      while (queuedState.current !== undefined) {
        const state = queuedState.current;
        queuedState.current = undefined;
        if (mounted.current) setStatus('saving');
        try {
          const saved = await savePlayerState(apiUrl, state, gameStateVersion.current);
          gameStateVersion.current = saved.gameStateVersion;
          if (mounted.current) setStatus('saved');
        } catch (error) {
          if (
            error instanceof PlayerRequestError &&
            (error.status === 401 ||
              error.code === 'PLAYER_SUSPENDED' ||
              error.code === 'PLAYER_RENAME_REQUIRED' ||
              error.code === 'PLAYER_STATE_VERSION_CONFLICT')
          ) {
            onAccessInvalid();
          } else if (mounted.current) {
            setStatus('unavailable');
          }
          queuedState.current = undefined;
          break;
        }
      }
    })().finally(() => {
      activeFlush.current = undefined;
      if (queuedState.current !== undefined) void flushQueued();
    });

    activeFlush.current = flush;
    return flush;
  }, [apiUrl, onAccessInvalid]);

  const noteState = useCallback((state: PlayerStateUpdate) => {
    latestState.current = { ...state };
  }, []);

  const checkpoint = useCallback(
    (state: PlayerStateUpdate) => {
      noteState(state);
      if (transitionInProgress.current) return;
      queuedState.current = { ...state };
      void flushQueued();
    },
    [flushQueued, noteState],
  );

  const flushBeforeLeave = useCallback(async () => {
    queuedState.current = { ...latestState.current };
    await flushQueued();
  }, [flushQueued]);

  const beginTransition = useCallback(async () => {
    transitionInProgress.current = true;
    queuedState.current = undefined;
    if (activeFlush.current !== undefined) await activeFlush.current;
    return gameStateVersion.current;
  }, []);

  const acceptAuthoritativeTransition = useCallback(
    (state: PlayerStateUpdate & { readonly gameStateVersion: number }) => {
      latestState.current = {
        mapId: state.mapId,
        x: state.x,
        y: state.y,
        facingDirection: state.facingDirection,
      };
      gameStateVersion.current = state.gameStateVersion;
      queuedState.current = undefined;
      transitionInProgress.current = false;
      if (mounted.current) setStatus('saved');
    },
    [],
  );

  const cancelTransition = useCallback(() => {
    transitionInProgress.current = false;
    queuedState.current = undefined;
  }, []);

  useEffect(() => {
    function preserveState() {
      if (transitionInProgress.current) return;
      void savePlayerState(apiUrl, latestState.current, gameStateVersion.current, {
        keepalive: true,
      }).catch(() => undefined);
    }
    function preserveHiddenState() {
      if (document.visibilityState === 'hidden') preserveState();
    }

    window.addEventListener('pagehide', preserveState);
    document.addEventListener('visibilitychange', preserveHiddenState);
    return () => {
      window.removeEventListener('pagehide', preserveState);
      document.removeEventListener('visibilitychange', preserveHiddenState);
    };
  }, [apiUrl]);

  return {
    status,
    noteState,
    checkpoint,
    flushBeforeLeave,
    beginTransition,
    acceptAuthoritativeTransition,
    cancelTransition,
  } as const;
}
