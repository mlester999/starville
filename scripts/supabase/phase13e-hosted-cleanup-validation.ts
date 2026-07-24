import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  assertDatabaseUrlMatchesProjectRef,
  loadPrivateSupabaseConfig,
} from '@starville/config/server';
import postgres from 'postgres';

import {
  createFixtureTag,
  fixtureWallet,
  parseHostedHarnessMode,
} from './phase13e-hosted-realtime-validation';
import {
  assertPhase13eBehavioralExecutionReady,
  assertPhase13eRepositoryBaseline,
} from './phase13e-hosted-retry-safety';
import {
  assertHostedDevelopmentFixtureWritesApproved,
  safeHostedTargetSummary,
  verifyCanonicalHostedTarget,
} from './safety';

export const PHASE13E_CLEANUP_HOSTED_PLAN = {
  target: 'exact starville-dev project ref and URL; production rejected',
  migrationState: {
    preApplication: '85 applied, exactly three reviewed pending, zero remote-only',
    behavioralExecution: '88 applied, zero pending, zero remote-only',
  },
  companionRealtimeCoverage: [
    'public-channel-rejection',
    'authorized-private-channel',
    'Auth-negative-cases',
    'fixture-cleanup',
    'Presence',
    'Broadcast',
  ],
  fixtures: [
    'expired-eligible',
    'non-expired',
    'already-completed',
    'unrelated',
    'exact-boundary',
    'multiple-in-one-batch',
  ],
  isolation: 'abort if any pre-existing eligible interaction exists; all fixtures are rolled back',
  assertions: [
    'eligible-only',
    '1000-input-cap',
    'run-evidence',
    'idempotent-replay',
    'advisory-lock-skip',
    'transaction-rollback',
    'no-other-worker-job',
    'no-cron-schedule',
  ],
  cleanup: 'finally rollback every fixture and run-evidence transaction',
} as const;

interface CleanupFixtureContext {
  readonly playerIds: readonly [string, string];
  readonly worldMapId: string;
  readonly worldMapVersionId: string;
  readonly channelId: string;
  readonly interactionIds: Readonly<Record<string, string>>;
}

function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertNoPreexistingEligibleInteractions(sql: postgres.Sql): Promise<void> {
  const rows = await sql<{ count: number }[]>`
    select count(*)::integer as count
    from public.social_interaction_requests request
    where request.status in ('pending', 'negotiating')
      and (
        request.expires_at <= now()
        or (
          request.reconnect_deadline is not null
          and request.reconnect_deadline <= now()
        )
      )
  `;
  if (rows[0]?.count !== 0) {
    throw new Error(
      'Hosted cleanup harness refuses to run while non-fixture eligible interactions exist',
    );
  }
}

async function createCleanupFixtures(
  sql: postgres.Sql,
  tag: string,
): Promise<CleanupFixtureContext> {
  const worldRows = await sql<
    { world_map_id: string; world_map_version_id: string; channel_id: string }[]
  >`
    select map.id::text as world_map_id,
           map.active_published_version_id::text as world_map_version_id,
           channel.id::text as channel_id
    from public.world_maps map
    join public.realtime_channels channel
      on channel.world_map_id = map.id and channel.enabled
    where map.slug = 'lantern-square'
      and map.status = 'active'
      and map.active_published_version_id is not null
    order by channel.channel_number
    limit 1
  `;
  const world = worldRows[0];
  if (world === undefined) throw new Error('Cleanup fixture world is unavailable');

  const playerIds: string[] = [];
  for (const player of ['a', 'b'] as const) {
    const inserted = await sql<{ id: string }[]>`
      insert into public.player_profiles(
        wallet_address, display_name, appearance_preset, current_map_id,
        current_map_version_id, safe_position_x, safe_position_y, facing_direction
      ) values(
        ${fixtureWallet(`${tag}:cleanup`, player)},
        ${`P13E C${tag.slice(-5)} ${player.toUpperCase()}`},
        ${player === 'a' ? 'marigold' : 'river'}, 'lantern-square',
        ${world.world_map_version_id}::uuid, 12, 7.5, 'south'
      )
      returning id::text
    `;
    const row = inserted[0];
    if (row === undefined) throw new Error('Cleanup player fixture insert failed');
    playerIds.push(row.id);
  }
  const [senderId, targetId] = playerIds;
  if (senderId === undefined || targetId === undefined)
    throw new Error('Cleanup players unavailable');

  const fixtureDefinitions = [
    ['expired-one', 'pending', '-20 minutes', '-10 minutes', null],
    ['expired-two', 'negotiating', '-19 minutes', '-9 minutes', null],
    ['expired-three', 'pending', '-18 minutes', '-8 minutes', null],
    ['boundary', 'pending', '-5 minutes', '0 seconds', null],
    ['non-expired', 'pending', '-1 minute', '5 minutes', null],
    ['completed', 'completed', '-10 minutes', '-5 minutes', '0 seconds'],
    ['unrelated', 'declined', '-10 minutes', '-5 minutes', '0 seconds'],
  ] as const;
  const interactionIds: Record<string, string> = {};
  for (const [name, status, createdOffset, expiryOffset, completedOffset] of fixtureDefinitions) {
    const id = randomUUID();
    interactionIds[name] = id;
    await sql`
      insert into public.social_interaction_requests(
        id, interaction_type, sender_profile_id, target_profile_id, world_map_id,
        world_map_version_id, channel_id, client_request_id, request_hash, status,
        expires_at, completed_at, created_at, updated_at
      ) values(
        ${id}::uuid, 'gift', ${senderId}::uuid, ${targetId}::uuid,
        ${world.world_map_id}::uuid, ${world.world_map_version_id}::uuid,
        ${world.channel_id}::uuid, ${`${tag}:${name}`}, ${'a'.repeat(64)}, ${status},
        now() + ${expiryOffset}::interval,
        ${completedOffset === null ? sql`null` : sql`now() + ${completedOffset}::interval`},
        now() + ${createdOffset}::interval, now() + ${createdOffset}::interval
      )
    `;
  }
  return {
    playerIds: [senderId, targetId],
    worldMapId: world.world_map_id,
    worldMapVersionId: world.world_map_version_id,
    channelId: world.channel_id,
    interactionIds,
  };
}

async function queryStatuses(
  sql: postgres.Sql,
  fixture: CleanupFixtureContext,
): Promise<Record<string, string>> {
  const byId = new Map(Object.entries(fixture.interactionIds).map(([name, id]) => [id, name]));
  const rows = await sql<{ id: string; status: string }[]>`
    select id::text, status
    from public.social_interaction_requests
    where id = any(${Object.values(fixture.interactionIds)}::uuid[])
  `;
  return Object.fromEntries(
    rows.map((row) => {
      const name = byId.get(row.id);
      if (name === undefined) throw new Error('Unexpected cleanup fixture id');
      return [name, row.status];
    }),
  );
}

async function validateCleanupBehavior(sql: postgres.Sql, tag: string): Promise<void> {
  const connection = await sql.reserve();
  try {
    await connection`begin`;
    const fixture = await createCleanupFixtures(connection, tag);
    const otherRunsBefore = await connection<{ count: number }[]>`
      select count(*)::integer as count from public.scheduled_job_runs
      where job_key <> 'social-interaction-expiry-cleanup'
    `;

    const firstRequest = `${tag}:cleanup:first`;
    const firstRows = await connection<{ result: Record<string, unknown> }[]>`
      select public.run_scheduled_social_interaction_cleanup(2, ${firstRequest}) as result
    `;
    const first = firstRows[0]?.result;
    assertCondition(first?.['status'] === 'succeeded', 'First cleanup execution did not succeed');
    const firstSummary = first['summary'] as Record<string, unknown>;
    assertCondition(firstSummary['processed'] === 2, 'First cleanup batch was not bounded to two');

    const afterFirst = await queryStatuses(connection, fixture);
    assertCondition(
      afterFirst['expired-one'] === 'expired' &&
        afterFirst['expired-two'] === 'expired' &&
        afterFirst['expired-three'] === 'pending' &&
        afterFirst['boundary'] === 'pending' &&
        afterFirst['non-expired'] === 'pending' &&
        afterFirst['completed'] === 'completed' &&
        afterFirst['unrelated'] === 'declined',
      'Cleanup changed an ineligible or out-of-batch fixture',
    );

    const replayRows = await connection<{ result: Record<string, unknown> }[]>`
      select public.run_scheduled_social_interaction_cleanup(2, ${firstRequest}) as result
    `;
    const replay = replayRows[0]?.result;
    assertCondition(
      replay?.['replayed'] === true && replay['runId'] === first['runId'],
      'Repeated cleanup request was not idempotent',
    );
    const evidenceRows = await connection<{ count: number }[]>`
      select count(*)::integer as count from public.scheduled_job_runs
      where request_id = ${firstRequest}
    `;
    assertCondition(evidenceRows[0]?.count === 1, 'Idempotent replay duplicated run evidence');

    const secondRows = await connection<{ result: Record<string, unknown> }[]>`
      select public.run_scheduled_social_interaction_cleanup(
        1000, ${`${tag}:cleanup:remainder`}
      ) as result
    `;
    const secondSummary = secondRows[0]?.result['summary'] as Record<string, unknown>;
    assertCondition(
      secondSummary['processed'] === 2,
      'Cleanup remainder did not include the exact timestamp boundary',
    );
    const finalStatuses = await queryStatuses(connection, fixture);
    assertCondition(
      finalStatuses['expired-three'] === 'expired' &&
        finalStatuses['boundary'] === 'expired' &&
        finalStatuses['non-expired'] === 'pending' &&
        finalStatuses['completed'] === 'completed' &&
        finalStatuses['unrelated'] === 'declined',
      'Boundary or ineligible cleanup behavior was incorrect',
    );

    await connection`
      do $$
      begin
        perform public.run_scheduled_social_interaction_cleanup(
          1001, 'phase13e-invalid-over-1000'
        );
        raise exception 'EXPECTED_BATCH_CAP_REJECTION';
      exception when sqlstate '22023' then
        null;
      end;
      $$
    `;
    const otherRunsAfter = await connection<{ count: number }[]>`
      select count(*)::integer as count from public.scheduled_job_runs
      where job_key <> 'social-interaction-expiry-cleanup'
    `;
    assertCondition(
      otherRunsAfter[0]?.count === otherRunsBefore[0]?.count,
      'Another Worker job unexpectedly ran',
    );

    const cronTable = await connection<{ present: boolean }[]>`
      select to_regclass('cron.job') is not null as present
    `;
    if (cronTable[0]?.present === true) {
      const schedules = await connection.unsafe<{ count: number }[]>(
        "select count(*)::integer as count from cron.job where command ilike '%run_scheduled_social_interaction_cleanup%'",
      );
      assertCondition(schedules[0]?.count === 0, 'Hosted Cron schedule was unexpectedly created');
    }
  } finally {
    await connection`rollback`.catch(() => undefined);
    connection.release();
  }
}

async function validateTransactionRollback(sql: postgres.Sql, tag: string): Promise<void> {
  const connection = await sql.reserve();
  const requestId = `${tag}:cleanup:forced-rollback`;
  let fixture: CleanupFixtureContext | undefined;
  try {
    await connection`begin`;
    fixture = await createCleanupFixtures(connection, `${tag.slice(0, -1)}f`);
    await connection`
      select public.run_scheduled_social_interaction_cleanup(1, ${requestId})
    `;
    await connection`select 1 / 0`;
  } catch {
    // The deliberate database error leaves the transaction aborted; rollback below is required.
  } finally {
    await connection`rollback`;
    connection.release();
  }
  const evidence = await sql<{ count: number }[]>`
    select count(*)::integer as count from public.scheduled_job_runs
    where request_id = ${requestId}
  `;
  assertCondition(evidence[0]?.count === 0, 'Failed transaction retained partial run evidence');
  if (fixture !== undefined) {
    const remaining = await sql<{ count: number }[]>`
      select (
        (select count(*) from public.player_profiles
         where id = any(${fixture.playerIds}::uuid[]))
        + (select count(*) from public.social_interaction_requests
           where id = any(${Object.values(fixture.interactionIds)}::uuid[]))
      )::integer as count
    `;
    assertCondition(
      remaining[0]?.count === 0,
      'Failed transaction retained partial player or interaction fixtures',
    );
  }
}

async function validateAdvisoryLock(sql: postgres.Sql, tag: string): Promise<void> {
  const lockHolder = await sql.reserve();
  const contender = await sql.reserve();
  const requestId = `${tag}:cleanup:locked`;
  try {
    await lockHolder`begin`;
    await lockHolder`
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('scheduled-job:social-interaction-expiry-cleanup', 0)
      )
    `;
    await contender`begin`;
    const rows = await contender<{ result: Record<string, unknown> }[]>`
      select public.run_scheduled_social_interaction_cleanup(1, ${requestId}) as result
    `;
    assertCondition(
      rows[0]?.result['status'] === 'skipped_locked' &&
        (rows[0]?.result['summary'] as Record<string, unknown>)['outcome'] === 'already_running',
      'Advisory-lock contention did not skip safely',
    );
  } finally {
    await contender`rollback`.catch(() => undefined);
    await lockHolder`rollback`.catch(() => undefined);
    contender.release();
    lockHolder.release();
  }
}

async function executeHostedValidation(): Promise<void> {
  const target = await verifyCanonicalHostedTarget(process.env);
  assertHostedDevelopmentFixtureWritesApproved(target, process.env);
  await assertPhase13eRepositoryBaseline();
  process.stdout.write(`${JSON.stringify(safeHostedTargetSummary(target))}\n`);
  const privateConfig = loadPrivateSupabaseConfig(process.env);
  if (privateConfig.databaseUrl === undefined) {
    throw new Error('SUPABASE_DATABASE_URL is required for the hosted cleanup harness');
  }
  assertDatabaseUrlMatchesProjectRef(privateConfig.databaseUrl, target.projectRef);
  const sql = postgres(privateConfig.databaseUrl, { max: 4, ssl: 'require' });
  const tag = createFixtureTag(randomUUID());
  try {
    await assertPhase13eBehavioralExecutionReady(sql);
    await assertNoPreexistingEligibleInteractions(sql);
    await validateCleanupBehavior(sql, tag);
    await assertNoPreexistingEligibleInteractions(sql);
    await validateTransactionRollback(sql, tag);
    await validateAdvisoryLock(sql, tag);
    process.stdout.write(
      `${JSON.stringify({ status: 'ok', harness: 'phase13e-cleanup', fixtureTag: tag })}\n`,
    );
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const mode = parseHostedHarnessMode(process.argv.slice(2));
  if (mode === 'dry-run') {
    process.stdout.write(
      `${JSON.stringify({ status: 'dry-run', remoteCalls: 0, remoteWrites: 0, plan: PHASE13E_CLEANUP_HOSTED_PLAN })}\n`,
    );
    return;
  }
  await executeHostedValidation();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Hosted cleanup validation failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
