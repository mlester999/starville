import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

import type postgres from 'postgres';

import type { RemoteMigrationState } from '../phase13d-production-readiness';
import {
  PHASE13B_APPLIED_MIGRATION_TIMESTAMP,
  PHASE13E_HOSTED_PENDING_MIGRATIONS,
  reviewPhase13ePendingMigrationState,
} from './phase13e-pending-migration-review';

export const PHASE13E_REVIEWED_HASHES = {
  realtimeAuthorization: '20532eb6c659da4d3d93a6f3183ed4a8719921e26efb0822049fae065bb51b84',
  permissionRepair: '4fd80b511879c62c70a5fe9e89c452bd025ca1ac9bcc9da6011131d493e16723',
  cleanupFoundation: '147cccccf7930dab7d17557746b28422059ace1550f23d2ddd626fe2865dae97',
  migrationManifest: '54b2136ea9e06755a7452e308611d283bb9b32429142c77ffb8a2dd487322bce',
} as const;

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
    key: 'migrationManifest',
    url: new URL('../../infrastructure/deployment/manifests/migrations.v1.json', import.meta.url),
  },
] as const;

export interface Phase13eRepositorySnapshot {
  readonly branch: string;
  readonly worktreeStatus: string;
  readonly hashes: Readonly<Record<keyof typeof PHASE13E_REVIEWED_HASHES, string>>;
}

export function assertPhase13eRepositorySnapshot(snapshot: Phase13eRepositorySnapshot): void {
  if (snapshot.branch !== 'phase-13e-supabase-first') {
    throw new Error('Phase 13E hosted execution requires branch phase-13e-supabase-first');
  }
  if (snapshot.worktreeStatus !== '') {
    throw new Error('Phase 13E hosted execution requires a clean worktree');
  }
  for (const [key, expected] of Object.entries(PHASE13E_REVIEWED_HASHES)) {
    if (snapshot.hashes[key as keyof typeof PHASE13E_REVIEWED_HASHES] !== expected) {
      throw new Error(`Phase 13E reviewed checksum is stale for ${key}`);
    }
  }
}

export async function assertPhase13eRepositoryBaseline(): Promise<void> {
  const hashes = {} as Record<keyof typeof PHASE13E_REVIEWED_HASHES, string>;
  for (const reviewed of REVIEWED_FILES) {
    hashes[reviewed.key] = createHash('sha256')
      .update(await readFile(reviewed.url))
      .digest('hex');
  }
  assertPhase13eRepositorySnapshot({
    branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
    worktreeStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
    hashes,
  });
}

export function reviewPhase13ePreApplicationState(state: RemoteMigrationState) {
  return reviewPhase13ePendingMigrationState(state);
}

export function reviewPhase13eBehavioralExecutionState(state: RemoteMigrationState): {
  readonly applied: 88;
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
    local.size !== 88 ||
    remote.size !== 88 ||
    pending.length !== 0 ||
    remoteOnly.length !== 0 ||
    !remote.has(PHASE13B_APPLIED_MIGRATION_TIMESTAMP) ||
    requiredPhase13e.some((timestamp) => !remote.has(timestamp))
  ) {
    throw new Error(
      'Behavioral execution requires exactly 88 matching migrations after the reviewed Phase 13E application',
    );
  }
  return { applied: 88, pending: 0, remoteOnly: 0 };
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
