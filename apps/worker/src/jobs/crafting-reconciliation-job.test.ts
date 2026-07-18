import { describe, expect, it, vi } from 'vitest';

import { CraftingReconciliationJob } from './crafting-reconciliation-job.js';

describe('Phase 11B crafting reconciliation job', () => {
  it('runs one bounded repair batch without scheduling per-job timers', async () => {
    const reconcile = vi.fn(async () => ({
      status: 'completed' as const,
      processed: 4,
      readied: 2,
      resolved: 1,
      failed: 0,
      manualReview: 1,
      perJobTimersScheduled: false as const,
    }));
    await expect(new CraftingReconciliationJob({ reconcile }, 50).execute()).resolves.toMatchObject(
      {
        processed: 4,
        readied: 2,
        perJobTimersScheduled: false,
      },
    );
    expect(reconcile).toHaveBeenCalledWith(50);
  });

  it('rejects unbounded batch sizes', () => {
    expect(() => new CraftingReconciliationJob({ reconcile: vi.fn() }, 101)).toThrow(RangeError);
  });
});
