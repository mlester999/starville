import { describe, expect, it } from 'vitest';

import {
  PHASE13E_HOSTED_PENDING_MIGRATIONS,
  reviewPhase13ePendingMigrationState,
} from './phase13e-pending-migration-review';

const matched = Array.from({ length: 84 }, (_, index) =>
  String(20260710000000 + index).padStart(14, '0'),
);
const pending = PHASE13E_HOSTED_PENDING_MIGRATIONS.map((migration) => migration.timestamp);

describe('Phase 13E pending migration review', () => {
  it('requires 84 matches and the explicit four-file retry order', () => {
    expect(
      reviewPhase13ePendingMigrationState({
        local: [...matched, ...pending],
        remote: matched,
      }),
    ).toEqual({
      matched: 84,
      pending: PHASE13E_HOSTED_PENDING_MIGRATIONS.map((migration) => migration.filename),
      remoteOnly: 0,
    });
  });

  it('rejects the old three-pending assumption after the forward repair', () => {
    expect(() =>
      reviewPhase13ePendingMigrationState({
        local: [...matched, ...pending.filter((timestamp) => timestamp !== '20260724100500')],
        remote: matched,
      }),
    ).toThrow('order');
  });

  it('rejects reordered, missing, applied, or remote-only migration histories', () => {
    expect(() =>
      reviewPhase13ePendingMigrationState({
        local: [...matched, ...[...pending].reverse()],
        remote: matched,
      }),
    ).toThrow('order');
    expect(() =>
      reviewPhase13ePendingMigrationState({
        local: [...matched, ...pending],
        remote: [...matched, pending[0]!],
      }),
    ).toThrow('84');
    expect(() =>
      reviewPhase13ePendingMigrationState({
        local: [...matched, ...pending],
        remote: [...matched, '20990101000000'],
      }),
    ).toThrow('Remote-only');
  });
});
