import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  parseRemoteMigrationState,
  type RemoteMigrationState,
} from '../phase13d-production-readiness';

export const PHASE13E_HOSTED_PENDING_MIGRATIONS = [
  {
    timestamp: '20260724100000',
    filename: '20260724100000_phase13e_supabase_realtime_authorization.sql',
  },
  {
    timestamp: '20260724100500',
    filename: '20260724100500_phase13e_realtime_authorization_permission_fix.sql',
  },
  {
    timestamp: '20260724101000',
    filename: '20260724101000_phase13e_social_cleanup_cron_foundation.sql',
  },
] as const;

export const PHASE13E_CLEANUP_CORRECTION_MIGRATION = {
  timestamp: '20260724101500',
  filename: '20260724101500_phase13e_cleanup_started_at_ambiguity_fix.sql',
} as const;

export const PHASE13B_APPLIED_MIGRATION_TIMESTAMP = '20260722130000';

export interface Phase13ePendingMigrationReview {
  readonly matched: number;
  readonly pending: readonly string[];
  readonly remoteOnly: number;
}

export interface Phase13eAppliedMigrationReview {
  readonly matched: 89;
  readonly pending: readonly [];
  readonly remoteOnly: 0;
}

export function reviewPhase13ePendingMigrationState(
  state: RemoteMigrationState,
): Phase13ePendingMigrationReview {
  const local = new Set(state.local);
  const remote = new Set(state.remote);
  const matched = state.local.filter((timestamp) => remote.has(timestamp));
  const pending = state.local.filter((timestamp) => !remote.has(timestamp));
  const remoteOnly = state.remote.filter((timestamp) => !local.has(timestamp));
  const expected = PHASE13E_HOSTED_PENDING_MIGRATIONS.map((migration) => migration.timestamp);

  if (remoteOnly.length > 0) throw new Error('Remote-only migration history requires a stop');
  if (
    matched.length !== 85 ||
    remote.size !== 85 ||
    !local.has(PHASE13B_APPLIED_MIGRATION_TIMESTAMP) ||
    !remote.has(PHASE13B_APPLIED_MIGRATION_TIMESTAMP)
  ) {
    throw new Error('Expected exactly 85 matching migrations with Phase 13B already applied');
  }
  if (
    pending.length !== expected.length ||
    pending.some((value, index) => value !== expected[index])
  ) {
    throw new Error('Hosted pending migration order does not match the reviewed Phase 13E retry');
  }
  return {
    matched: matched.length,
    pending: PHASE13E_HOSTED_PENDING_MIGRATIONS.map((migration) => migration.filename),
    remoteOnly: 0,
  };
}

export function reviewPhase13eCleanupCorrectionMigrationState(
  state: RemoteMigrationState,
): Phase13ePendingMigrationReview {
  const local = new Set(state.local);
  const remote = new Set(state.remote);
  const matched = state.local.filter((timestamp) => remote.has(timestamp));
  const pending = state.local.filter((timestamp) => !remote.has(timestamp));
  const remoteOnly = state.remote.filter((timestamp) => !local.has(timestamp));
  const requiredApplied = PHASE13E_HOSTED_PENDING_MIGRATIONS.map(
    (migration) => migration.timestamp,
  );

  if (remoteOnly.length > 0) throw new Error('Remote-only migration history requires a stop');
  if (
    matched.length !== 88 ||
    remote.size !== 88 ||
    !local.has(PHASE13E_CLEANUP_CORRECTION_MIGRATION.timestamp) ||
    requiredApplied.some((timestamp) => !remote.has(timestamp))
  ) {
    throw new Error('Expected exactly 88 matching migrations with Phase 13E-A already applied');
  }
  if (pending.length !== 1 || pending[0] !== PHASE13E_CLEANUP_CORRECTION_MIGRATION.timestamp) {
    throw new Error('Hosted pending migration is not the reviewed Phase 13E cleanup correction');
  }
  return {
    matched: matched.length,
    pending: [PHASE13E_CLEANUP_CORRECTION_MIGRATION.filename],
    remoteOnly: 0,
  };
}

export function reviewPhase13eCleanupCorrectionAppliedState(
  state: RemoteMigrationState,
): Phase13eAppliedMigrationReview {
  const local = new Set(state.local);
  const remote = new Set(state.remote);
  const pending = state.local.filter((timestamp) => !remote.has(timestamp));
  const remoteOnly = state.remote.filter((timestamp) => !local.has(timestamp));
  const required = [
    ...PHASE13E_HOSTED_PENDING_MIGRATIONS.map((migration) => migration.timestamp),
    PHASE13E_CLEANUP_CORRECTION_MIGRATION.timestamp,
  ];
  if (
    local.size !== 89 ||
    remote.size !== 89 ||
    pending.length !== 0 ||
    remoteOnly.length !== 0 ||
    required.some((timestamp) => !remote.has(timestamp))
  ) {
    throw new Error(
      'Expected exactly 89 matching migrations after the Phase 13E cleanup correction',
    );
  }
  return { matched: 89, pending: [], remoteOnly: 0 };
}

function main(): void {
  const inputIndex = process.argv.indexOf('--input');
  const input = inputIndex < 0 ? undefined : process.argv[inputIndex + 1];
  if (input === undefined) {
    throw new Error('Expected --input <captured-supabase-migration-list>');
  }
  const state = parseRemoteMigrationState(readFileSync(resolve(input), 'utf8'));
  const review =
    state.remote.length === 89
      ? reviewPhase13eCleanupCorrectionAppliedState(state)
      : state.remote.length === 88
        ? reviewPhase13eCleanupCorrectionMigrationState(state)
        : reviewPhase13ePendingMigrationState(state);
  const status =
    review.pending.length === 0 ? 'applied-state-verified' : 'review-required-before-push';
  process.stdout.write(`${JSON.stringify({ status, ...review })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pending migration review failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
