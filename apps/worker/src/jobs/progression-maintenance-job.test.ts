import { describe, expect, it, vi } from 'vitest';
import { ProgressionMaintenanceJob } from './progression-maintenance-job';

describe('ProgressionMaintenanceJob', () => {
  it('runs one bounded maintenance pass without automatic XP corrections', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'processed',
      rewardsProcessed: 2,
      reconciliationResolved: 3,
      manualReview: 1,
      automaticXpCorrections: 0,
      requestId: 'worker-progression:test',
    });
    const result = await new ProgressionMaintenanceJob({ execute }, 75).execute();
    expect(execute).toHaveBeenCalledWith(75);
    expect(result.automaticXpCorrections).toBe(0);
  });

  it('rejects an unbounded batch', () => {
    expect(() => new ProgressionMaintenanceJob({ execute: vi.fn() }, 501)).toThrow(RangeError);
  });
});
