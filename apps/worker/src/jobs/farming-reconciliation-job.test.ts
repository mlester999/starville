import { describe, expect, it, vi } from 'vitest';

import { FarmingReconciliationJob } from './farming-reconciliation-job.js';

describe('Phase 11 farming reconciliation job', () => {
  it('runs one bounded repair batch without scheduling crop timers', async () => {
    const reconcile = vi.fn(async () => ({
      status: 'completed' as const,
      processed: 3,
      resolved: 2,
      failed: 1,
      perCropTimersScheduled: false as const,
    }));
    await expect(new FarmingReconciliationJob({ reconcile }, 50).execute()).resolves.toMatchObject({
      processed: 3,
      perCropTimersScheduled: false,
    });
    expect(reconcile).toHaveBeenCalledWith(50);
  });

  it('rejects unbounded batch sizes', () => {
    expect(() => new FarmingReconciliationJob({ reconcile: vi.fn() }, 101)).toThrow(RangeError);
  });
});
