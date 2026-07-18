import { describe, expect, it, vi } from 'vitest';

import { EconomyMaintenanceJob } from './economy-maintenance-job.js';

describe('economy maintenance job', () => {
  it('runs bounded reconciliation, risk scanning, and metrics without automatic correction', async () => {
    const execute = vi.fn(async () => ({
      reconciliation: { checkedCount: 20, mismatchCount: 0, autoCorrected: false as const },
      risk: { signalsCreated: 0, automaticPlayerActions: 0 as const },
      metrics: { metricDate: '2026-07-14' },
      activation: { policiesActivated: 0, shopsActivated: 0, publishedOnly: true as const },
      shop: {
        restocked: 3,
        reconciled: 2,
        manualReview: 1,
        automaticBalanceCorrections: 0 as const,
      },
    }));
    const job = new EconomyMaintenanceJob({ execute }, 500, 100);
    const result = await job.execute();
    expect(execute).toHaveBeenCalledWith(500, 100);
    expect(result.reconciliation.autoCorrected).toBe(false);
    expect(result.risk.automaticPlayerActions).toBe(0);
    expect(result.activation.publishedOnly).toBe(true);
    expect(result.shop).toEqual({
      restocked: 3,
      reconciled: 2,
      manualReview: 1,
      automaticBalanceCorrections: 0,
    });
  });

  it('rejects unbounded batches', () => {
    expect(() => new EconomyMaintenanceJob({ execute: vi.fn() }, 10_001, 100)).toThrow(RangeError);
    expect(() => new EconomyMaintenanceJob({ execute: vi.fn() }, 100, 1_001)).toThrow(RangeError);
  });
});
