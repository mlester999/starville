import { describe, expect, it } from 'vitest';

import {
  PHASE13E_HOSTED_VALIDATION_WORKTREE_PATHS,
  PHASE13E_REVIEWED_HASHES,
  assertPhase13eRepositorySnapshot,
  reviewPhase13eBehavioralExecutionState,
  reviewPhase13eCleanupCorrectionPreApplicationState,
  reviewPhase13ePreApplicationState,
} from './phase13e-hosted-retry-safety';
import {
  PHASE13B_APPLIED_MIGRATION_TIMESTAMP,
  PHASE13E_CLEANUP_CORRECTION_MIGRATION,
  PHASE13E_HOSTED_PENDING_MIGRATIONS,
} from './phase13e-pending-migration-review';

const previouslyApplied = [
  ...Array.from({ length: 84 }, (_, index) => `previous-${String(index).padStart(3, '0')}`),
  PHASE13B_APPLIED_MIGRATION_TIMESTAMP,
];
const phase13e = PHASE13E_HOSTED_PENDING_MIGRATIONS.map((migration) => migration.timestamp);

describe('Phase 13E hosted retry safety', () => {
  it('allows only the bounded behavioral-correction worktree paths', () => {
    expect(PHASE13E_HOSTED_VALIDATION_WORKTREE_PATHS).toEqual(
      expect.arrayContaining([
        'apps/api/src/realtime/supabase-gateway.ts',
        'apps/game-client/src/app/supabase-realtime-client.ts',
        'scripts/supabase/phase13e-hosted-realtime-validation.ts',
        'scripts/supabase/phase13e-hosted-cleanup-validation.ts',
      ]),
    );
  });

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

  it('permits behavioral execution only after the 89th forward correction matches', () => {
    const preCorrection = [...previouslyApplied, ...phase13e];
    expect(
      reviewPhase13eCleanupCorrectionPreApplicationState({
        local: [...preCorrection, PHASE13E_CLEANUP_CORRECTION_MIGRATION.timestamp],
        remote: preCorrection,
      }),
    ).toMatchObject({
      matched: 88,
      pending: [PHASE13E_CLEANUP_CORRECTION_MIGRATION.filename],
      remoteOnly: 0,
    });
    const all = [...preCorrection, PHASE13E_CLEANUP_CORRECTION_MIGRATION.timestamp];
    expect(reviewPhase13eBehavioralExecutionState({ local: all, remote: all })).toEqual({
      applied: 89,
      pending: 0,
      remoteOnly: 0,
    });
    expect(() =>
      reviewPhase13eBehavioralExecutionState({
        local: all,
        remote: previouslyApplied,
      }),
    ).toThrow('89 matching migrations');
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
      assertPhase13eRepositorySnapshot(
        {
          ...snapshot,
          worktreeStatus:
            ' M scripts/supabase/phase13e-hosted-realtime-validation.ts\n?? scripts/supabase/phase13e-hosted-harness-diagnostics.ts',
        },
        {
          allowedWorktreePaths: [
            'scripts/supabase/phase13e-hosted-realtime-validation.ts',
            'scripts/supabase/phase13e-hosted-harness-diagnostics.ts',
          ],
        },
      ),
    ).not.toThrow();
    expect(() =>
      assertPhase13eRepositorySnapshot(
        { ...snapshot, worktreeStatus: ' M packages/database/src/unsafe.ts' },
        {
          allowedWorktreePaths: ['scripts/supabase/phase13e-hosted-realtime-validation.ts'],
        },
      ),
    ).toThrow('unrelated worktree change');
    expect(() =>
      assertPhase13eRepositorySnapshot({
        ...snapshot,
        hashes: { ...snapshot.hashes, cleanupFoundation: 'stale' },
      }),
    ).toThrow('checksum');
  });
});
