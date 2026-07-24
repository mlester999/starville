import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

import type postgres from 'postgres';

import type { RemoteMigrationState } from '../phase13d-production-readiness';
import {
  PHASE13B_APPLIED_MIGRATION_TIMESTAMP,
  PHASE13E_CLEANUP_CORRECTION_MIGRATION,
  PHASE13E_HOSTED_PENDING_MIGRATIONS,
  reviewPhase13eCleanupCorrectionMigrationState,
  reviewPhase13ePendingMigrationState,
} from './phase13e-pending-migration-review';

export const PHASE13E_REVIEWED_HASHES = {
  realtimeAuthorization: '20532eb6c659da4d3d93a6f3183ed4a8719921e26efb0822049fae065bb51b84',
  permissionRepair: '4fd80b511879c62c70a5fe9e89c452bd025ca1ac9bcc9da6011131d493e16723',
  cleanupFoundation: '147cccccf7930dab7d17557746b28422059ace1550f23d2ddd626fe2865dae97',
  cleanupAmbiguityFix: 'e31e1872fe444c879195ef98bdfd283e261c371817600f87f0db8e39e75a9fa9',
  migrationManifest: '358133036e451608a5e99eeb20f8680d7d8945787abb12f88cb72eb13dea9304',
} as const;

export const PHASE13E_HOSTED_VALIDATION_WORKTREE_PATHS = [
  'apps/api/src/realtime/supabase-contracts.ts',
  'apps/api/src/realtime/supabase-gateway.test.ts',
  'apps/api/src/realtime/supabase-gateway.ts',
  'apps/game-client/src/app/supabase-realtime-client.test.ts',
  'apps/game-client/src/app/supabase-realtime-client.ts',
  'docs/deployment/phase-13e-a-hosted-behavioral-validation.md',
  'infrastructure/deployment/manifests/migrations.v1.json',
  'infrastructure/deployment/manifests/production-commissioning.v1.json',
  'infrastructure/supabase/migrations/20260724101500_phase13e_cleanup_started_at_ambiguity_fix.sql',
  'infrastructure/supabase/tests/phase13e_supabase_first_foundation.test.sql',
  'packages/database/test/migrations.test.ts',
  'scripts/supabase/phase13e-hosted-cleanup-validation.test.ts',
  'scripts/supabase/phase13e-hosted-cleanup-validation.ts',
  'scripts/supabase/phase13e-hosted-harness-diagnostics.test.ts',
  'scripts/supabase/phase13e-hosted-harness-diagnostics.ts',
  'scripts/supabase/phase13e-hosted-realtime-validation.test.ts',
  'scripts/supabase/phase13e-hosted-realtime-validation.ts',
  'scripts/supabase/phase13e-hosted-retry-safety.test.ts',
  'scripts/supabase/phase13e-hosted-retry-safety.ts',
  'scripts/supabase/phase13e-pending-migration-review.test.ts',
  'scripts/supabase/phase13e-pending-migration-review.ts',
] as const;

const REVIEWED_FILES = [
  {
    key: 'realtimeAuthorization',
    url: new URL(
      '../../infrastructure/supabase/migrations/20260724100000_phase13e_supabase_realtime_authorization.sql',
      import.meta.url,
    ),
  },
  {
    key: 'permissionRepair',
    url: new URL(
      '../../infrastructure/supabase/migrations/20260724100500_phase13e_realtime_authorization_permission_fix.sql',
      import.meta.url,
    ),
  },
  {
    key: 'cleanupFoundation',
    url: new URL(
      '../../infrastructure/supabase/migrations/20260724101000_phase13e_social_cleanup_cron_foundation.sql',
      import.meta.url,
    ),
  },
  {
    key: 'cleanupAmbiguityFix',
    url: new URL(
      '../../infrastructure/supabase/migrations/20260724101500_phase13e_cleanup_started_at_ambiguity_fix.sql',
      import.meta.url,
    ),
  },
  {
    key: 'migrationManifest',
    url: new URL('../../infrastructure/deployment/manifests/migrations.v1.json', import.meta.url),
  },
] as const;

export interface Phase13eRepositorySnapshot {
  readonly branch: string;
  readonly worktreeStatus: string;
  readonly hashes: Readonly<Record<keyof typeof PHASE13E_REVIEWED_HASHES, string>>;
}

export interface Phase13eRepositoryBaselineOptions {
  readonly allowedWorktreePaths?: readonly string[];
}

function assertExpectedWorktreeStatus(
  worktreeStatus: string,
  allowedWorktreePaths: readonly string[] | undefined,
): void {
  if (worktreeStatus === '') return;
  if (allowedWorktreePaths === undefined || allowedWorktreePaths.length === 0) {
    throw new Error('Phase 13E hosted execution requires a clean worktree');
  }
  const allowed = new Set(allowedWorktreePaths);
  const paths = worktreeStatus.split('\n').map((line) => {
    if (line.length < 4 || line.includes(' -> ')) {
      throw new Error('Phase 13E hosted execution found an unsupported worktree status');
    }
    return line.slice(3).trim();
  });
  if (paths.some((path) => path === '' || !allowed.has(path))) {
    throw new Error('Phase 13E hosted execution found an unrelated worktree change');
  }
}

export function assertPhase13eRepositorySnapshot(
  snapshot: Phase13eRepositorySnapshot,
  options: Phase13eRepositoryBaselineOptions = {},
): void {
  if (snapshot.branch !== 'phase-13e-supabase-first') {
    throw new Error('Phase 13E hosted execution requires branch phase-13e-supabase-first');
  }
  assertExpectedWorktreeStatus(snapshot.worktreeStatus, options.allowedWorktreePaths);
  for (const [key, expected] of Object.entries(PHASE13E_REVIEWED_HASHES)) {
    if (snapshot.hashes[key as keyof typeof PHASE13E_REVIEWED_HASHES] !== expected) {
      throw new Error(`Phase 13E reviewed checksum is stale for ${key}`);
    }
  }
}

export async function assertPhase13eRepositoryBaseline(
  options: Phase13eRepositoryBaselineOptions = {},
): Promise<void> {
  const hashes = {} as Record<keyof typeof PHASE13E_REVIEWED_HASHES, string>;
  for (const reviewed of REVIEWED_FILES) {
    hashes[reviewed.key] = createHash('sha256')
      .update(await readFile(reviewed.url))
      .digest('hex');
  }
  assertPhase13eRepositorySnapshot(
    {
      branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
      // Preserve the leading index/worktree status column on the first porcelain line.
      worktreeStatus: execFileSync('git', ['status', '--short'], {
        encoding: 'utf8',
      }).trimEnd(),
      hashes,
    },
    options,
  );
}

export function reviewPhase13ePreApplicationState(state: RemoteMigrationState) {
  return reviewPhase13ePendingMigrationState(state);
}

export function reviewPhase13eCleanupCorrectionPreApplicationState(state: RemoteMigrationState) {
  return reviewPhase13eCleanupCorrectionMigrationState(state);
}

export function reviewPhase13eBehavioralExecutionState(state: RemoteMigrationState): {
  readonly applied: 89;
  readonly pending: 0;
  readonly remoteOnly: 0;
} {
  const local = new Set(state.local);
  const remote = new Set(state.remote);
  const pending = state.local.filter((timestamp) => !remote.has(timestamp));
  const remoteOnly = state.remote.filter((timestamp) => !local.has(timestamp));
  const requiredPhase13e = PHASE13E_HOSTED_PENDING_MIGRATIONS.map(
    (migration) => migration.timestamp,
  );
  if (
    local.size !== 89 ||
    remote.size !== 89 ||
    pending.length !== 0 ||
    remoteOnly.length !== 0 ||
    !remote.has(PHASE13B_APPLIED_MIGRATION_TIMESTAMP) ||
    !remote.has(PHASE13E_CLEANUP_CORRECTION_MIGRATION.timestamp) ||
    requiredPhase13e.some((timestamp) => !remote.has(timestamp))
  ) {
    throw new Error(
      'Behavioral execution requires exactly 89 matching migrations after the reviewed Phase 13E cleanup correction',
    );
  }
  return { applied: 89, pending: 0, remoteOnly: 0 };
}

export async function readHostedMigrationState(sql: postgres.Sql): Promise<RemoteMigrationState> {
  const migrationDirectory = new URL('../../infrastructure/supabase/migrations/', import.meta.url);
  const local = (await readdir(migrationDirectory))
    .map((filename) => /^(\d{14})_.+\.sql$/u.exec(filename)?.[1])
    .filter((timestamp): timestamp is string => timestamp !== undefined)
    .sort();
  const remoteRows = await sql<{ version: string }[]>`
    select version::text
    from supabase_migrations.schema_migrations
    order by version
  `;
  return { local, remote: remoteRows.map((row) => row.version) };
}

export async function assertPhase13eBehavioralExecutionReady(sql: postgres.Sql): Promise<void> {
  reviewPhase13eBehavioralExecutionState(await readHostedMigrationState(sql));
}
