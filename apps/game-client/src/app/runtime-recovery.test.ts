import { describe, expect, it } from 'vitest';

import { automaticRetryAvailable, runtimeFailure, runtimeRetryDelay } from './runtime-recovery';

describe('runtime recovery policy', () => {
  it('keeps automatic retries bounded with capped exponential jitter', () => {
    expect(automaticRetryAvailable('world_manifest', 0)).toBe(true);
    expect(automaticRetryAvailable('world_manifest', 2)).toBe(true);
    expect(automaticRetryAvailable('world_manifest', 3)).toBe(false);
    expect(runtimeRetryDelay('world_manifest', 0, () => 0.5)).toBe(500);
    expect(runtimeRetryDelay('world_manifest', 20, () => 0.5)).toBe(4_000);
  });

  it('blocks mutations while persistence is unavailable but permits cached visuals', () => {
    expect(
      runtimeFailure('player_persistence', {
        status: 503,
        code: 'PLAYER_PERSISTENCE_UNAVAILABLE',
        requestId: 'request-safe-123',
      }),
    ).toEqual({
      dependency: 'player_persistence',
      code: 'PLAYER_PERSISTENCE_UNAVAILABLE',
      requestId: 'request-safe-123',
      retryable: true,
      cachedVisualsAllowed: true,
      mutationsAllowed: false,
    });
  });

  it('does not retry revoked access or expose an unbounded request identifier', () => {
    expect(
      runtimeFailure('player_api', {
        status: 401,
        code: 'ACCESS_REVOKED',
        requestId: 'x'.repeat(200),
      }),
    ).toEqual({
      dependency: 'player_api',
      code: 'ACCESS_REVOKED',
      retryable: false,
      cachedVisualsAllowed: false,
      mutationsAllowed: false,
    });
  });
});
