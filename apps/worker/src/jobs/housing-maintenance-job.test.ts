import { describe, expect, it, vi } from 'vitest';
import { HousingMaintenanceJob } from './housing-maintenance-job';

describe('HousingMaintenanceJob', () => {
  it('runs a bounded pass without automatic item or DUST correction', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'processed',
      expiredSessions: 2,
      reconciliationResolved: 3,
      manualReview: 1,
      failed: 0,
      capacityRepaired: 1,
      automaticItemCorrections: 0,
      automaticDustCorrections: 0,
      requestId: 'worker-housing:test',
    });
    const result = await new HousingMaintenanceJob({ execute }, 75).execute();
    expect(execute).toHaveBeenCalledWith(75);
    expect(result.automaticItemCorrections).toBe(0);
    expect(result.automaticDustCorrections).toBe(0);
  });
  it('rejects an unbounded batch', () => {
    expect(() => new HousingMaintenanceJob({ execute: vi.fn() }, 501)).toThrow(RangeError);
  });
});
