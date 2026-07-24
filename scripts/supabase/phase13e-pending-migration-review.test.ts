import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  PHASE13B_APPLIED_MIGRATION_TIMESTAMP,
  PHASE13E_HOSTED_PENDING_MIGRATIONS,
  reviewPhase13ePendingMigrationState,
} from './phase13e-pending-migration-review';

const prePhase13b = Array.from({ length: 84 }, (_, index) =>
  String(20260710000000 + index).padStart(14, '0'),
);
const matched = [...prePhase13b, PHASE13B_APPLIED_MIGRATION_TIMESTAMP];
const pending = PHASE13E_HOSTED_PENDING_MIGRATIONS.map((migration) => migration.timestamp);

describe('Phase 13E pending migration review', () => {
  it('requires 85 matches including applied Phase 13B and the explicit three-file retry order', () => {
    expect(
      reviewPhase13ePendingMigrationState({
        local: [...matched, ...pending],
        remote: matched,
      }),
    ).toEqual({
      matched: 85,
      pending: PHASE13E_HOSTED_PENDING_MIGRATIONS.map((migration) => migration.filename),
      remoteOnly: 0,
    });
  });

  it('rejects the old four-pending assumption where Phase 13B is not applied', () => {
    expect(() =>
      reviewPhase13ePendingMigrationState({
        local: [...prePhase13b, PHASE13B_APPLIED_MIGRATION_TIMESTAMP, ...pending],
        remote: prePhase13b,
      }),
    ).toThrow('85');
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
    ).toThrow('85');
    expect(() =>
      reviewPhase13ePendingMigrationState({
        local: [...matched, ...pending.slice(1)],
        remote: matched,
      }),
    ).toThrow('order');
    expect(() =>
      reviewPhase13ePendingMigrationState({
        local: [...matched, ...pending],
        remote: [...matched, '20990101000000'],
      }),
    ).toThrow('Remote-only');
  });

  it('keeps migration repair outside the guarded remote command surface', () => {
    const remoteCommand = readFileSync(new URL('./remote-command.ts', import.meta.url), 'utf8');
    expect(remoteCommand).toContain(
      "const supportedOperations: readonly Operation[] = ['verify', 'list', 'dry-run', 'push', 'lint']",
    );
    expect(remoteCommand).not.toMatch(/\bmigration\s+repair\b/iu);
  });
});
