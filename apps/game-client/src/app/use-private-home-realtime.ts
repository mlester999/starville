import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlayableVerticalSlice, PrivateHomeRealtimeEvent } from '@starville/cozy-gameplay';

import {
  INITIAL_PRIVATE_HOME_REALTIME_STATE,
  PrivateHomeRealtimeConnection,
  type PrivateHomeRealtimeState,
} from './private-home-realtime-client';

export function usePrivateHomeRealtime(options: {
  readonly apiUrl: string;
  readonly realtimeUrl?: string | undefined;
  readonly homeId?: string | undefined;
  readonly enabled: boolean;
  readonly onSnapshot: (
    view: PlayableVerticalSlice,
    events: readonly PrivateHomeRealtimeEvent[],
  ) => void;
  readonly onAccessInvalid: () => void;
}) {
  const [state, setState] = useState<PrivateHomeRealtimeState>(() =>
    options.realtimeUrl === undefined
      ? { ...INITIAL_PRIVATE_HOME_REALTIME_STATE, status: 'unavailable' }
      : INITIAL_PRIVATE_HOME_REALTIME_STATE,
  );
  const connection = useRef<PrivateHomeRealtimeConnection | undefined>(undefined);

  useEffect(() => {
    if (!options.enabled || options.realtimeUrl === undefined || options.homeId === undefined) {
      setState({ ...INITIAL_PRIVATE_HOME_REALTIME_STATE, status: 'unavailable' });
      return;
    }
    const realtime = new PrivateHomeRealtimeConnection({
      apiUrl: options.apiUrl,
      realtimeUrl: options.realtimeUrl,
      homeId: options.homeId,
      onState: setState,
      onSnapshot: options.onSnapshot,
      onAccessInvalid: options.onAccessInvalid,
    });
    connection.current = realtime;
    realtime.start();
    return () => {
      realtime.dispose();
      if (connection.current === realtime) connection.current = undefined;
    };
  }, [
    options.apiUrl,
    options.enabled,
    options.homeId,
    options.onAccessInvalid,
    options.onSnapshot,
    options.realtimeUrl,
  ]);

  const refresh = useCallback(() => connection.current?.refresh(), []);
  return { state, refresh };
}
