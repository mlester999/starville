import { describe, expect, it } from 'vitest';

import { coordinateConnectionHealth } from './connection-health';

describe('coordinated connection health', () => {
  it('reports one connected state when every service is available', () => {
    expect(
      coordinateConnectionHealth({
        realtime: 'connected',
        persistence: 'saved',
        profileConnectionWarning: false,
        accessRechecking: false,
      }),
    ).toMatchObject({ state: 'connected', label: 'Connected', retryable: false });
  });

  it('prioritizes a cached degraded view over duplicate independent warnings', () => {
    const health = coordinateConnectionHealth({
      realtime: 'unavailable',
      persistence: 'unavailable',
      profileConnectionWarning: true,
      accessRechecking: false,
    });
    expect(health).toMatchObject({
      state: 'degraded_cached_view',
      label: 'Cached View · Reconnecting',
      retryable: true,
    });
    expect(health.services.filter(({ status }) => status === 'unavailable')).toHaveLength(3);
  });

  it('distinguishes access, persistence, and transient reconnect states', () => {
    expect(
      coordinateConnectionHealth({
        realtime: 'blocked',
        persistence: 'ready',
        profileConnectionWarning: false,
        accessRechecking: false,
      }).state,
    ).toBe('access_verification_required');
    expect(
      coordinateConnectionHealth({
        realtime: 'connected',
        persistence: 'unavailable',
        profileConnectionWarning: false,
        accessRechecking: false,
      }).state,
    ).toBe('player_persistence_unavailable');
    expect(
      coordinateConnectionHealth({
        realtime: 'connected',
        persistence: 'ready',
        profileConnectionWarning: false,
        accessRechecking: true,
      }).state,
    ).toBe('reconnecting');
  });
});
