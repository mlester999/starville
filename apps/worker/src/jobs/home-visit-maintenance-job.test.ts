import { describe, expect, it, vi } from 'vitest';
import { HomeVisitMaintenanceJob } from './home-visit-maintenance-job';

describe('HomeVisitMaintenanceJob', () => {
  it('runs one bounded shared pass instead of one job per home', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'completed',
      expiredInvitations: 3,
      closedSessions: 1,
      releasedParticipants: 2,
      reconciledCounts: 1,
    });
    await expect(new HomeVisitMaintenanceJob({ execute }, 75).execute()).resolves.toMatchObject({
      expiredInvitations: 3,
      closedSessions: 1,
      releasedParticipants: 2,
    });
    expect(execute).toHaveBeenCalledWith(75);
  });
  it('rejects unbounded batches', () => {
    expect(() => new HomeVisitMaintenanceJob({ execute: vi.fn() }, 501)).toThrow(RangeError);
  });
});
