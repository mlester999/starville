import { describe, expect, it } from 'vitest';

import { PHASE13E_CLEANUP_HOSTED_PLAN } from './phase13e-hosted-cleanup-validation';
import { parseHostedHarnessMode } from './phase13e-hosted-realtime-validation';

describe('Phase 13E hosted cleanup-function harness', () => {
  it('is dry-run-only by default and does not silently execute', () => {
    expect(parseHostedHarnessMode([])).toBe('dry-run');
    expect(parseHostedHarnessMode(['--dry-run'])).toBe('dry-run');
    expect(() => parseHostedHarnessMode(['execute'])).toThrow();
  });

  it('covers isolated eligibility, boundary, replay, locking, and rollback cases', () => {
    expect(PHASE13E_CLEANUP_HOSTED_PLAN.fixtures).toEqual(
      expect.arrayContaining([
        'expired-eligible',
        'non-expired',
        'already-completed',
        'unrelated',
        'exact-boundary',
        'multiple-in-one-batch',
      ]),
    );
    expect(PHASE13E_CLEANUP_HOSTED_PLAN.assertions).toEqual(
      expect.arrayContaining([
        '1000-input-cap',
        'idempotent-replay',
        'advisory-lock-skip',
        'transaction-rollback',
        'no-other-worker-job',
        'no-cron-schedule',
      ]),
    );
  });

  it('refuses real eligible interactions and rolls back every fixture transaction', () => {
    expect(PHASE13E_CLEANUP_HOSTED_PLAN.isolation).toContain('abort');
    expect(PHASE13E_CLEANUP_HOSTED_PLAN.isolation).toContain('pre-existing');
    expect(PHASE13E_CLEANUP_HOSTED_PLAN.cleanup).toContain('finally rollback');
  });
});
