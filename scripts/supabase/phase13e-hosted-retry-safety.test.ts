import { describe, expect, it } from 'vitest';

import {
  PHASE13E_REVIEWED_HASHES,
  assertPhase13eRepositorySnapshot,
  reviewPhase13eBehavioralExecutionState,
  reviewPhase13ePreApplicationState,
} from './phase13e-hosted-retry-safety';
import {
  PHASE13B_APPLIED_MIGRATION_TIMESTAMP,
  PHASE13E_HOSTED_PENDING_MIGRATIONS,
} from './phase13e-pending-migration-review';

const previouslyApplied = [
  ...Array.from({ length: 84 }, (_, index) => `previous-${String(index).padStart(3, '0')}`),
  PHASE13B_APPLIED_MIGRATION_TIMESTAMP,
];
const phase13e = PHASE13E_HOSTED_PENDING_MIGRATIONS.map((migration) => migration.timestamp);

describe('Phase 13E hosted retry safety', () => {
  it('pins the exact 85-applied and three-pending pre-application state', () => {
    expect(
      reviewPhase13ePreApplicationState({
        local: [...previouslyApplied, ...phase13e],
        remote: previouslyApplied,
      }),
    ).toMatchObject({ matched: 85, remoteOnly: 0 });
    expect(() =>
      reviewPhase13ePreApplicationState({
        local: [...previouslyApplied, ...phase13e],
        remote: [...previouslyApplied, 'remote-only'],
      }),
    ).toThrow('Remote-only');
  });

  it('permits behavioral execution only after all 88 reviewed migrations match', () => {
    const all = [...previouslyApplied, ...phase13e];
    expect(reviewPhase13eBehavioralExecutionState({ local: all, remote: all })).toEqual({
      applied: 88,
      pending: 0,
      remoteOnly: 0,
    });
    expect(() =>
      reviewPhase13eBehavioralExecutionState({
        local: all,
        remote: previouslyApplied,
      }),
    ).toThrow('88 matching migrations');
  });

  it('requires the reviewed branch, clean worktree, and exact immutable hashes', () => {
    const snapshot = {
      branch: 'phase-13e-supabase-first',
      worktreeStatus: '',
      hashes: { ...PHASE13E_REVIEWED_HASHES },
    };
    expect(() => assertPhase13eRepositorySnapshot(snapshot)).not.toThrow();
    expect(() => assertPhase13eRepositorySnapshot({ ...snapshot, branch: 'master' })).toThrow(
      'phase-13e-supabase-first',
    );
    expect(() =>
      assertPhase13eRepositorySnapshot({ ...snapshot, worktreeStatus: 'M unsafe.sql' }),
    ).toThrow('clean worktree');
    expect(() =>
      assertPhase13eRepositorySnapshot({
        ...snapshot,
        hashes: { ...snapshot.hashes, cleanupFoundation: 'stale' },
      }),
    ).toThrow('checksum');
  });
});
