import { describe, expect, it, vi } from 'vitest';

import { PlayerExperienceReconciliationJob } from './player-experience-reconciliation-job';

describe('PlayerExperienceReconciliationJob', () => {
  it('runs one bounded evidence-preserving batch', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'completed',
      processed: 4,
      resolved: 3,
      investigationRequired: 1,
      reconciledStates: 4,
      driftRepaired: 1,
      lockedObjectives: 0,
      missingGuidanceTargets: 0,
      requestId: 'worker-player-experience:test',
    });
    await expect(
      new PlayerExperienceReconciliationJob({ execute }, 50).execute(),
    ).resolves.toMatchObject({ processed: 4, resolved: 3, investigationRequired: 1 });
    expect(execute).toHaveBeenCalledWith(50);
  });

  it('rejects unbounded repair batches', () => {
    expect(() => new PlayerExperienceReconciliationJob({ execute: vi.fn() }, 101)).toThrow(
      RangeError,
    );
  });
});
