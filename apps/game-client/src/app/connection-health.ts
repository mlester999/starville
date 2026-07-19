import type { RealtimeConnectionStatus } from './realtime-client';
import type { SaveStatus } from './use-player-persistence';

export type CoordinatedConnectionState =
  | 'connected'
  | 'reconnecting'
  | 'api_unavailable'
  | 'realtime_unavailable'
  | 'player_persistence_unavailable'
  | 'access_verification_required'
  | 'degraded_cached_view'
  | 'channels_full';

export interface CoordinatedConnectionHealth {
  readonly state: CoordinatedConnectionState;
  readonly label: string;
  readonly tone: 'success' | 'warning' | 'danger' | 'muted';
  readonly retryable: boolean;
  readonly services: readonly Readonly<{
    label: string;
    status: 'available' | 'checking' | 'unavailable';
  }>[];
}

export function coordinateConnectionHealth(input: {
  readonly realtime: RealtimeConnectionStatus;
  readonly persistence: SaveStatus;
  readonly profileConnectionWarning: boolean;
  readonly accessRechecking: boolean;
}): CoordinatedConnectionHealth {
  const realtimeAvailable = input.realtime === 'connected';
  const services = [
    {
      label: 'Player API',
      status: input.profileConnectionWarning ? 'unavailable' : 'available',
    },
    {
      label: 'Realtime',
      status:
        input.realtime === 'connecting' || input.realtime === 'reconnecting'
          ? 'checking'
          : realtimeAvailable
            ? 'available'
            : 'unavailable',
    },
    {
      label: 'Safe-position saves',
      status:
        input.persistence === 'saving'
          ? 'checking'
          : input.persistence === 'unavailable'
            ? 'unavailable'
            : 'available',
    },
    {
      label: 'Access',
      status: input.accessRechecking ? 'checking' : 'available',
    },
  ] as const;

  if (input.realtime === 'blocked') {
    return {
      state: 'access_verification_required',
      label: 'Access Interrupted',
      tone: 'danger',
      retryable: true,
      services,
    };
  }
  if (input.profileConnectionWarning && !realtimeAvailable) {
    return {
      state: 'degraded_cached_view',
      label: 'Cached View · Reconnecting',
      tone: 'danger',
      retryable: true,
      services,
    };
  }
  if (input.profileConnectionWarning) {
    return {
      state: 'api_unavailable',
      label: 'Player Service Unavailable',
      tone: 'warning',
      retryable: true,
      services,
    };
  }
  if (input.persistence === 'unavailable') {
    return {
      state: 'player_persistence_unavailable',
      label: 'Save Service Unavailable',
      tone: 'danger',
      retryable: true,
      services,
    };
  }
  if (
    input.accessRechecking ||
    input.realtime === 'connecting' ||
    input.realtime === 'reconnecting'
  ) {
    return {
      state: 'reconnecting',
      label: input.accessRechecking ? 'Verifying Access' : 'Reconnecting',
      tone: 'warning',
      retryable: false,
      services,
    };
  }
  if (input.realtime === 'full') {
    return {
      state: 'channels_full',
      label: 'Channels Full',
      tone: 'warning',
      retryable: true,
      services,
    };
  }
  if (input.realtime === 'unavailable' || input.realtime === 'disconnected') {
    return {
      state: 'realtime_unavailable',
      label: 'Realtime Unavailable',
      tone: 'danger',
      retryable: true,
      services,
    };
  }
  return {
    state: 'connected',
    label: input.persistence === 'saving' ? 'Connected · Saving' : 'Connected',
    tone: 'success',
    retryable: false,
    services,
  };
}
