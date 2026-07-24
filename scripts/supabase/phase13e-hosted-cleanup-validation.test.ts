import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PHASE13E_CLEANUP_HOSTED_PLAN } from './phase13e-hosted-cleanup-validation';
import { parseHostedHarnessMode } from './phase13e-hosted-realtime-validation';

const harnessSource = readFileSync(
  new URL('./phase13e-hosted-cleanup-validation.ts', import.meta.url),
  'utf8',
);

describe('Phase 13E hosted cleanup-function harness', () => {
  it('is dry-run-only by default and does not silently execute', () => {
    expect(parseHostedHarnessMode([])).toBe('dry-run');
    expect(parseHostedHarnessMode(['--dry-run'])).toBe('dry-run');
    expect(() => parseHostedHarnessMode(['execute'])).toThrow();
  });

  it('covers isolated eligibility, boundary, replay, locking, and rollback cases', () => {
    expect(PHASE13E_CLEANUP_HOSTED_PLAN.companionRealtimeCoverage).toEqual(
      expect.arrayContaining([
        'public-channel-rejection',
        'authorized-private-channel',
        'Auth-negative-cases',
        'fixture-cleanup',
        'Presence',
        'Broadcast',
      ]),
    );
    expect(PHASE13E_CLEANUP_HOSTED_PLAN.migrationState.preApplication).toContain('85 applied');
    expect(PHASE13E_CLEANUP_HOSTED_PLAN.migrationState.behavioralExecution).toContain('89 applied');
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
    expect(harnessSource).toContain("process.stdout.write('cleanup-behavior-ok");
    expect(harnessSource).toContain("process.stdout.write('cleanup-fixture-cleanup-ok");
    expect(harnessSource).toContain("fixtureTag: 'masked'");
  });
});
