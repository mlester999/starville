import { describe, expect, it } from 'vitest';

import { runRuntimeBetaSoakFixture } from './runtime-beta-soak';

describe('bounded runtime beta load and soak fixture', () => {
  it('cleans remote players/listeners and suppresses repeated failed asset requests', () => {
    const report = runRuntimeBetaSoakFixture(10_000);
    expect(report).toEqual(
      expect.objectContaining({
        cycles: 10_000,
        playerLoads: [1, 5, 10, 20, 40],
        maximumRemotePlayers: 40,
        duplicateRemotePlayers: 0,
        remainingRemotePlayers: 0,
        remainingListeners: 0,
      }),
    );
    expect(report.assetFetchAttempts).toBeLessThanOrEqual(3);
    expect(report.retryScheduleMs).toEqual([500, 1_000, 2_000, 4_000, 8_000, 10_000]);
  });

  it('rejects unbounded fixture requests', () => {
    expect(() => runRuntimeBetaSoakFixture(100_001)).toThrow(/between 1 and 100000/u);
  });
});
