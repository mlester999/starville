import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fromPersistedAvatarSelection } from '@starville/avatar';
import { cosmeticWardrobeSchema } from '@starville/cosmetics';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationDirectory = join(repositoryRoot, 'infrastructure/supabase/migrations');
const fixtureDirectory = join(repositoryRoot, 'packages/database/test/fixtures');

const migrationFiles = [
  '20260710090000_admin_authorization_schema.sql',
  '20260710091000_admin_authorization_catalog.sql',
  '20260710092000_admin_authorization_functions_rls.sql',
  '20260710100000_token_access_schema.sql',
  '20260710101000_token_access_functions_rls.sql',
  '20260711100000_player_vertical_slice.sql',
  '20260711110000_secure_player_operations.sql',
  '20260712100000_world_management_schema.sql',
  '20260712101000_world_management_functions.sql',
  '20260712102000_world_management_seed.sql',
  '20260712103000_world_management_admin.sql',
  '20260712104000_world_management_player_admin.sql',
  '20260712105000_player_rename_access_pagination.sql',
  '20260712106000_live_operations.sql',
  '20260713100000_cozy_gameplay_foundation.sql',
  '20260713101000_cozy_gameplay_actions.sql',
  '20260713101500_cozy_world_interactions.sql',
  '20260713102000_cozy_gameplay_housing_admin.sql',
  '20260713110000_world_asset_manager_schema.sql',
  '20260713111000_world_asset_manager_functions.sql',
  '20260713111500_world_asset_manager_world_integration.sql',
  '20260713112000_world_asset_manager_storage.sql',
  '20260713113000_fix_asset_audit_read_permission.sql',
  '20260713114000_fix_database_lint_warnings.sql',
  '20260713115000_fix_final_hosted_validation.sql',
  '20260714100000_platform_configuration_schema.sql',
  '20260714101000_platform_configuration_functions.sql',
  '20260715100000_realtime_presence_foundation.sql',
  '20260715110000_multiplayer_chat_moderation.sql',
  '20260715120000_nearby_social_interactions.sql',
  '20260715130000_friends_parties_social_graph.sql',
  '20260715131000_fix_phase8_hosted_database_lint.sql',
  '20260715140000_cooperative_activities_schema.sql',
  '20260715141000_cooperative_activities_functions.sql',
  '20260715142000_cooperative_activity_operations.sql',
  '20260715143000_cooperative_activity_platform_module.sql',
  '20260715144000_fix_phase8db_hosted_database_lint.sql',
  '20260716090000_phase9a_economy_schema.sql',
  '20260716091000_phase9a_economy_functions.sql',
  '20260716092000_phase9a1_economy_admin_readiness.sql',
  '20260716100000_phase10a_avatar_schema.sql',
  '20260716101000_phase10a_avatar_functions.sql',
  '20260716102000_phase10a_avatar_platform_module.sql',
  '20260716103000_fix_economy_avatar_function_lint.sql',
  '20260716110000_phase10b_cosmetic_schema.sql',
  '20260716110500_phase10b_avatar_contract_reconciliation.sql',
  '20260716110700_phase10b_avatar_outfit_mutation_repair.sql',
  '20260716111000_phase10b_cosmetic_functions.sql',
  '20260716112000_phase10b_cosmetic_platform_modules.sql',
  '20260716113000_world_asset_version_upload_recovery.sql',
  '20260716114000_fix_cosmetic_selection_shape_volatility.sql',
  '20260716115000_enforce_validated_world_asset_immutability.sql',
  '20260716116000_add_world_asset_successor_draft_creation.sql',
  '20260716117000_expose_world_draft_asset_pins.sql',
  '20260716118000_harden_world_asset_review_intent_idempotency.sql',
  '20260716120000_open_in_game_test_sessions.sql',
  '20260716121000_phase10c_world_composer_lifecycle.sql',
  '20260717100000_phase11a_playable_vertical_slice.sql',
  '20260717101000_phase11a_private_home_realtime.sql',
  '20260717102000_phase11a_farming_content_management.sql',
  '20260717110000_phase11b_workstation_recipe_job_schema.sql',
  '20260717111000_phase11b_workstation_job_functions.sql',
  '20260717112000_phase11b_crafting_admin_reconciliation.sql',
  '20260717113000_phase11b_quest_compatibility.sql',
  '20260717120000_phase11c_shop_catalog_transaction_schema.sql',
  '20260717121000_phase11c_shop_player_functions.sql',
  '20260717122000_phase11c_shop_admin_worker_functions.sql',
  '20260717130000_phase11d_progression_schema.sql',
  '20260717131000_phase11d_progression_player_functions.sql',
  '20260717132000_phase11d_progression_admin_worker_functions.sql',
  '20260717140000_phase11e_housing_schema.sql',
  '20260717141000_phase11e_housing_player_functions.sql',
  '20260717142000_phase11e_housing_admin_worker_functions.sql',
  '20260717143000_fix_phase11_hosted_database_lint.sql',
  '20260718100000_phase11f_home_visits_schema.sql',
  '20260718101000_phase11f_home_visit_player_functions.sql',
  '20260718102000_phase11f_home_visit_admin_worker.sql',
  '20260718110000_phase12a_player_experience_schema.sql',
  '20260718111000_phase12a_player_experience_functions.sql',
  '20260718112000_phase12a_player_experience_admin_worker.sql',
  '20260718120000_phase12b_world_asset_bundled_lifecycle.sql',
  '20260718121000_fix_phase12_hosted_validation.sql',
  '20260718122000_phase12c_world_manifest_object_contract.sql',
  '20260718123000_phase12d_repository_authored_bundled_registry.sql',
  '20260722130000_phase13b_closed_beta_security_hardening.sql',
] as const;

interface CommandResult {
  stderr: string;
  stdout: string;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function locatePostgresBin(): Promise<string> {
  const configured = [process.env['STARVILLE_POSTGRES_BIN'], process.env['POSTGRES_BIN']].filter(
    (value): value is string => Boolean(value),
  );
  const pathCandidates = (process.env['PATH'] ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((pathEntry) => resolve(pathEntry));
  const candidates = [
    ...configured,
    ...pathCandidates,
    '/Library/PostgreSQL/18/bin',
    '/opt/homebrew/opt/postgresql@18/bin',
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/local/pgsql/bin',
  ];

  for (const candidate of candidates) {
    if (
      (await isExecutable(join(candidate, 'initdb'))) &&
      (await isExecutable(join(candidate, 'pg_ctl'))) &&
      (await isExecutable(join(candidate, 'psql'))) &&
      (await isExecutable(join(candidate, 'postgres')))
    ) {
      return candidate;
    }
  }

  throw new Error(
    'Local PostgreSQL binaries were not found. Set STARVILLE_POSTGRES_BIN to a directory containing postgres, initdb, pg_ctl, and psql.',
  );
}

function runCommand(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', rejectCommand);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolveCommand({ stderr, stdout });
        return;
      }

      rejectCommand(
        new Error(
          [
            `${basename(command)} failed${signal ? ` with signal ${signal}` : ` with exit code ${String(code)}`}.`,
            stdout.trim(),
            stderr.trim(),
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      );
    });
  });
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Could not reserve an isolated PostgreSQL port.');
  }
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  return address.port;
}

async function main(): Promise<void> {
  const postgresBin = await locatePostgresBin();
  const repositoryMigrations = (await readdir(migrationDirectory))
    .filter((fileName) => /^\d{14}_[a-z0-9_]+\.sql$/u.test(fileName))
    .sort();
  if (
    repositoryMigrations.length !== migrationFiles.length ||
    repositoryMigrations.some((fileName, index) => fileName !== migrationFiles[index])
  ) {
    throw new Error(
      'The isolated PostgreSQL migration allowlist is out of sync with the repository migration directory.',
    );
  }

  const workspace = await mkdtemp(join(tmpdir(), 'starville-world-postgres-'));
  const dataDirectory = join(workspace, 'data');
  const socketDirectory = join(workspace, 'socket');
  const logFile = join(workspace, 'postgres.log');
  const port = await reservePort();
  const initdb = join(postgresBin, 'initdb');
  const pgCtl = join(postgresBin, 'pg_ctl');
  const psql = join(postgresBin, 'psql');
  const extensionControlPath = process.env['STARVILLE_POSTGRES_EXTENSION_CONTROL_PATH'];
  const systemExtensionControlPath = join(dirname(postgresBin), 'share/postgresql');
  let started = false;

  const psqlBaseArguments = [
    '--no-psqlrc',
    '--set',
    'ON_ERROR_STOP=1',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--username',
    'postgres',
    '--dbname',
    'postgres',
  ] as const;
  let executionError: unknown;

  try {
    const version = await runCommand(join(postgresBin, 'postgres'), ['--version']);
    console.log(`[world-postgres] ${version.stdout.trim()}`);

    await runCommand(initdb, [
      '--pgdata',
      dataDirectory,
      '--username',
      'postgres',
      '--auth-local=trust',
      '--auth-host=trust',
      '--encoding=UTF8',
      '--no-locale',
      '--no-instructions',
    ]);
    await runCommand('mkdir', ['-p', socketDirectory]);
    const postgresOptions = [
      `-F -p ${String(port)} -h 127.0.0.1 -k ${socketDirectory}`,
      '-c fsync=off -c synchronous_commit=off -c full_page_writes=off',
      extensionControlPath === undefined
        ? ''
        : `-c extension_control_path=${extensionControlPath}:${systemExtensionControlPath}`,
    ]
      .filter(Boolean)
      .join(' ');
    await runCommand(pgCtl, [
      '--pgdata',
      dataDirectory,
      '--log',
      logFile,
      '--options',
      postgresOptions,
      '--wait',
      '--timeout',
      '30',
      'start',
    ]);
    started = true;

    const prelude = join(fixtureDirectory, 'supabase-postgres-prelude.sql');
    await runCommand(psql, [...psqlBaseArguments, '--file', prelude]);
    console.log(`[world-postgres] applied ${basename(prelude)}`);

    for (const migrationFile of migrationFiles) {
      if (migrationFile === '20260718120000_phase12b_world_asset_bundled_lifecycle.sql') {
        const collisionFixture = join(
          fixtureDirectory,
          'phase12b-pre-migration-asset-collision.sql',
        );
        await runCommand(psql, [...psqlBaseArguments, '--file', collisionFixture]);
        console.log('[world-postgres] applied Phase 12B pre-migration collision fixture');
      }
      const migrationPath = join(migrationDirectory, migrationFile);
      await readFile(migrationPath, 'utf8');
      await runCommand(psql, [
        ...psqlBaseArguments,
        '--single-transaction',
        '--file',
        migrationPath,
      ]);
      console.log(`[world-postgres] applied ${migrationFile}`);
    }

    const phase13bSecurityAssertions = join(
      fixtureDirectory,
      'phase13b-security-postgres-execution.sql',
    );
    const phase13bSecurityResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      phase13bSecurityAssertions,
    ]);
    if (phase13bSecurityResult.stdout.trim()) {
      console.log(phase13bSecurityResult.stdout.trim());
    }
    console.log('[world-postgres] Phase 13B applied-catalog security assertions passed');

    if (extensionControlPath !== undefined) {
      const lintResult = await runCommand('pnpm', [
        'exec',
        'supabase',
        '--workdir',
        'infrastructure',
        'db',
        'lint',
        '--db-url',
        `postgresql://postgres:postgres@127.0.0.1:${String(port)}/postgres?sslmode=disable`,
        '--schema',
        'public,private',
        '--level',
        'warning',
        '--fail-on',
        'warning',
      ]);
      if (lintResult.stdout.trim()) {
        console.log(lintResult.stdout.trim());
      }
      console.log('[world-postgres] Supabase function lint passed at warning severity');
    } else {
      console.log(
        '[world-postgres] Supabase function lint skipped (local plpgsql_check extension unavailable)',
      );
    }

    const seedMigration = join(migrationDirectory, '20260712102000_world_management_seed.sql');
    await runCommand(psql, [...psqlBaseArguments, '--single-transaction', '--file', seedMigration]);
    console.log('[world-postgres] verified idempotent Phase 6 seed replay');

    const cozyAssertions = join(fixtureDirectory, 'cozy-gameplay-postgres-execution.sql');
    const cozyResult = await runCommand(psql, [...psqlBaseArguments, '--file', cozyAssertions]);
    if (cozyResult.stdout.trim()) {
      console.log(cozyResult.stdout.trim());
    }
    console.log('[world-postgres] cozy-gameplay execution assertions passed');

    const phase11Assertions = join(fixtureDirectory, 'phase11a-postgres-execution.sql');
    const phase11Result = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      phase11Assertions,
    ]);
    if (phase11Result.stdout.trim()) {
      console.log(phase11Result.stdout.trim());
    }
    console.log('[world-postgres] Phase 11A playable-loop assertions passed');

    const phase11bAssertions = join(fixtureDirectory, 'phase11b-postgres-execution.sql');
    const phase11bResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      phase11bAssertions,
    ]);
    if (phase11bResult.stdout.trim()) {
      console.log(phase11bResult.stdout.trim());
    }
    console.log('[world-postgres] Phase 11B workstation-job assertions passed');

    const phase11cAssertions = join(fixtureDirectory, 'phase11c-postgres-execution.sql');
    const phase11cResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      phase11cAssertions,
    ]);
    if (phase11cResult.stdout.trim()) {
      console.log(phase11cResult.stdout.trim());
    }
    console.log('[world-postgres] Phase 11C General Store assertions passed');

    const phase11dAssertions = join(fixtureDirectory, 'phase11d-postgres-execution.sql');
    const phase11dResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      phase11dAssertions,
    ]);
    if (phase11dResult.stdout.trim()) {
      console.log(phase11dResult.stdout.trim());
    }
    console.log('[world-postgres] Phase 11D progression assertions passed');

    const phase11eAssertions = join(fixtureDirectory, 'phase11e-postgres-execution.sql');
    const phase11eResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      phase11eAssertions,
    ]);
    if (phase11eResult.stdout.trim()) {
      console.log(phase11eResult.stdout.trim());
    }
    console.log('[world-postgres] Phase 11E housing assertions passed');

    const phase11fAssertions = join(fixtureDirectory, 'phase11f-postgres-execution.sql');
    const phase11fResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      phase11fAssertions,
    ]);
    if (phase11fResult.stdout.trim()) {
      console.log(phase11fResult.stdout.trim());
    }
    console.log('[world-postgres] Phase 11F home-visit assertions passed');

    const phase12aAssertions = join(fixtureDirectory, 'phase12a-postgres-execution.sql');
    const phase12aResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      phase12aAssertions,
    ]);
    if (phase12aResult.stdout.trim()) {
      console.log(phase12aResult.stdout.trim());
    }
    console.log('[world-postgres] Phase 12A player-experience assertions passed');

    const phase11fConcurrencySetup = join(fixtureDirectory, 'phase11f-postgres-concurrency.sql');
    await runCommand(psql, [...psqlBaseArguments, '--file', phase11fConcurrencySetup]);
    const phase11fSession = await runCommand(psql, [
      ...psqlBaseArguments,
      '--tuples-only',
      '--no-align',
      '--command',
      "select id::text||'|'||configuration_revision::text from public.home_visit_sessions where status='open' and safe_metadata ? 'layoutRevisionId' order by started_at desc limit 1;",
    ]);
    const [phase11fSessionId, phase11fSessionRevision] = phase11fSession.stdout.trim().split('|');
    if (phase11fSessionId === undefined || phase11fSessionRevision === undefined) {
      throw new Error('The Phase 11F final-slot concurrency fixture is incomplete.');
    }
    const phase11fFinalSlotResults = await Promise.all([
      runCommand(psql, [
        ...psqlBaseArguments,
        '--tuples-only',
        '--no-align',
        '--command',
        `select public.join_player_home_visit('${'2'.repeat(30)}41','${phase11fSessionId}',null,${phase11fSessionRevision},'phase11f-race-final-slot-a','phase11f:race:final:a')->>'status';`,
      ]),
      runCommand(psql, [
        ...psqlBaseArguments,
        '--tuples-only',
        '--no-align',
        '--command',
        `select public.join_player_home_visit('${'2'.repeat(30)}42','${phase11fSessionId}',null,${phase11fSessionRevision},'phase11f-race-final-slot-b','phase11f:race:final:b')->>'status';`,
      ]),
    ]);
    const phase11fFinalSlotStatuses = phase11fFinalSlotResults
      .map((result) => result.stdout.trim())
      .sort();
    if (
      phase11fFinalSlotStatuses.filter((status) => status === 'joined').length !== 1 ||
      !phase11fFinalSlotStatuses.some((status) =>
        ['home_visit_conflict', 'home_visit_full'].includes(status),
      )
    ) {
      throw new Error(
        `Concurrent Phase 11F final-slot admission returned unexpected statuses: ${phase11fFinalSlotStatuses.join(', ')}`,
      );
    }
    const phase11fFinalSlotVerification = await runCommand(psql, [
      ...psqlBaseArguments,
      '--tuples-only',
      '--no-align',
      '--command',
      `select case when
        (select current_visitor_count=10 from public.home_visit_sessions where id='${phase11fSessionId}')
        and (select count(*)=10 from public.home_visit_participants where visit_session_id='${phase11fSessionId}' and role='visitor' and status='active')
        and (select count(*)=1 from public.home_visit_participants where visit_session_id='${phase11fSessionId}' and player_profile_id in (select id from public.player_profiles where wallet_address in ('${'2'.repeat(30)}41','${'2'.repeat(30)}42')) and status='active')
      then 'passed' else 'failed' end;`,
    ]);
    if (phase11fFinalSlotVerification.stdout.trim() !== 'passed') {
      throw new Error('Concurrent Phase 11F final-slot admission violated capacity invariants.');
    }
    console.log('[world-postgres] concurrent Phase 11F final-slot admission assertions passed');

    const phase11LintRepairAssertions = join(
      fixtureDirectory,
      'phase11-hosted-lint-repair-postgres-execution.sql',
    );
    const phase11LintRepairResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      phase11LintRepairAssertions,
    ]);
    if (phase11LintRepairResult.stdout.trim()) {
      console.log(phase11LintRepairResult.stdout.trim());
    }
    console.log('[world-postgres] Phase 11 hosted-lint repair assertions passed');

    const assetAssertions = join(fixtureDirectory, 'world-asset-manager-postgres-execution.sql');
    const assetResult = await runCommand(psql, [...psqlBaseArguments, '--file', assetAssertions]);
    if (assetResult.stdout.trim()) {
      console.log(assetResult.stdout.trim());
    }
    console.log('[world-postgres] world-asset-manager execution assertions passed');

    const platformAssertions = join(
      fixtureDirectory,
      'platform-configuration-postgres-execution.sql',
    );
    const platformResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      platformAssertions,
    ]);
    if (platformResult.stdout.trim()) {
      console.log(platformResult.stdout.trim());
    }
    console.log('[world-postgres] platform-configuration execution assertions passed');

    const realtimeAssertions = join(fixtureDirectory, 'realtime-presence-postgres-execution.sql');
    const realtimeResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      realtimeAssertions,
    ]);
    if (realtimeResult.stdout.trim()) {
      console.log(realtimeResult.stdout.trim());
    }
    console.log('[world-postgres] realtime-presence execution assertions passed');

    const chatAssertions = join(fixtureDirectory, 'multiplayer-chat-postgres-execution.sql');
    const chatResult = await runCommand(psql, [...psqlBaseArguments, '--file', chatAssertions]);
    if (chatResult.stdout.trim()) {
      console.log(chatResult.stdout.trim());
    }
    console.log('[world-postgres] multiplayer-chat execution assertions passed');

    const assertions = join(fixtureDirectory, 'world-postgres-execution.sql');
    const result = await runCommand(psql, [...psqlBaseArguments, '--file', assertions]);
    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    console.log('[world-postgres] execution assertions passed');

    const socialAssertions = join(fixtureDirectory, 'social-interactions-postgres-execution.sql');
    const socialResult = await runCommand(psql, [...psqlBaseArguments, '--file', socialAssertions]);
    if (socialResult.stdout.trim()) console.log(socialResult.stdout.trim());
    console.log('[world-postgres] social-interaction setup assertions passed');

    const lookup = await runCommand(psql, [
      ...psqlBaseArguments,
      '--tuples-only',
      '--no-align',
      '--command',
      "select id::text || '|' || revision::text from public.social_interaction_requests where client_request_id = 'phase8c-concurrency-final';",
    ]);
    const [tradeId, revision] = lookup.stdout.trim().split('|');
    if (tradeId === undefined || revision === undefined) {
      throw new Error('The social concurrency fixture did not expose its prepared trade.');
    }
    const confirmations = await Promise.all([
      runCommand(psql, [
        ...psqlBaseArguments,
        '--tuples-only',
        '--no-align',
        '--command',
        `select public.confirm_realtime_social_trade('82000000-0000-4000-8000-000000000007','${tradeId}',${revision},'phase8c-concurrent-confirm-a')->>'status';`,
      ]),
      runCommand(psql, [
        ...psqlBaseArguments,
        '--tuples-only',
        '--no-align',
        '--command',
        `select public.confirm_realtime_social_trade('82000000-0000-4000-8000-000000000008','${tradeId}',${revision},'phase8c-concurrent-confirm-b')->>'status';`,
      ]),
    ]);
    const statuses = confirmations.map((confirmation) => confirmation.stdout.trim()).sort();
    if (statuses.join(',') !== 'completed,confirmed') {
      throw new Error(
        `Concurrent confirmation returned unexpected statuses: ${statuses.join(', ')}`,
      );
    }
    const concurrencyVerification = await runCommand(psql, [
      ...psqlBaseArguments,
      '--tuples-only',
      '--no-align',
      '--command',
      `select case when
        (select status = 'completed' from public.social_interaction_requests where id = '${tradeId}')
        and (select count(*) = 1 from public.social_interaction_receipts where interaction_id = '${tradeId}')
        and not exists(select 1 from public.player_inventory_reservations where interaction_id = '${tradeId}')
        and private.cozy_owned_quantity('82000000-0000-4000-8000-000000000001',
          (select id from public.cozy_item_definitions where slug = 'moonbean-seed')) = 7
        and private.cozy_owned_quantity('82000000-0000-4000-8000-000000000002',
          (select id from public.cozy_item_definitions where slug = 'moonbean-seed')) = 5
        and private.cozy_owned_quantity('82000000-0000-4000-8000-000000000001',
          (select id from public.cozy_item_definitions where slug = 'sunroot-seed')) = 4
        and private.cozy_owned_quantity('82000000-0000-4000-8000-000000000002',
          (select id from public.cozy_item_definitions where slug = 'sunroot-seed')) = 8
      then 'passed' else 'failed' end;`,
    ]);
    if (concurrencyVerification.stdout.trim() !== 'passed') {
      throw new Error('Concurrent trade settlement did not preserve exact inventory invariants.');
    }
    console.log('[world-postgres] concurrent trade settlement assertions passed');

    const socialGraphAssertions = join(fixtureDirectory, 'social-graph-postgres-execution.sql');
    const socialGraphResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      socialGraphAssertions,
    ]);
    if (socialGraphResult.stdout.trim()) console.log(socialGraphResult.stdout.trim());
    console.log(
      '[world-postgres] friendship, party, party-chat, and ready-check assertions passed',
    );

    const partyFixture = await runCommand(psql, [
      ...psqlBaseArguments,
      '--tuples-only',
      '--no-align',
      '--command',
      `select party.public_party_id::text || '|' || party.revision::text || '|' ||
        max(invitation.id::text) filter (where target.display_name='Party Player C') || '|' ||
        max(invitation.id::text) filter (where target.display_name='Party Player D')
      from public.player_parties party
      join public.player_party_invitations invitation on invitation.party_id=party.id and invitation.status='pending'
      join public.player_profiles target on target.id=invitation.target_profile_id
      where party.status='active'
      group by party.public_party_id, party.revision;`,
    ]);
    const [partyId, partyRevision, invitationC, invitationD] = partyFixture.stdout
      .trim()
      .split('|');
    if ([partyId, partyRevision, invitationC, invitationD].some((value) => !value)) {
      throw new Error('The social graph concurrency fixture is incomplete.');
    }
    const finalSlotResults = await Promise.all([
      runCommand(psql, [
        ...psqlBaseArguments,
        '--tuples-only',
        '--no-align',
        '--command',
        `select public.respond_realtime_party_invitation('83000000-0000-4000-8000-000000000031','${invitationC}',${partyRevision},'accept','phase8d-concurrent-accept-c')->>'status';`,
      ]),
      runCommand(psql, [
        ...psqlBaseArguments,
        '--tuples-only',
        '--no-align',
        '--command',
        `select public.respond_realtime_party_invitation('83000000-0000-4000-8000-000000000032','${invitationD}',${partyRevision},'accept','phase8d-concurrent-accept-d')->>'status';`,
      ]),
    ]);
    const finalSlotStatuses = finalSlotResults.map((result) => result.stdout.trim()).sort();
    if (finalSlotStatuses.join(',') !== 'accepted,party_changed') {
      throw new Error(
        `Concurrent final-slot acceptance returned unexpected statuses: ${finalSlotStatuses.join(', ')}`,
      );
    }
    const finalSlotVerification = await runCommand(psql, [
      ...psqlBaseArguments,
      '--tuples-only',
      '--no-align',
      '--command',
      `select case when
        (select count(*)=4 from public.player_party_members member join public.player_parties party on party.id=member.party_id where party.public_party_id='${partyId}' and member.status='active')
        and (select count(*)=1 from public.player_party_members member join public.player_parties party on party.id=member.party_id where party.public_party_id='${partyId}' and member.status='active' and member.role='leader')
        and (select count(*)=1 from public.player_party_members where player_profile_id in ('83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002') and status='active')
      then 'passed' else 'failed' end;`,
    ]);
    if (finalSlotVerification.stdout.trim() !== 'passed') {
      throw new Error(
        'Concurrent party final-slot acceptance violated capacity or leader invariants.',
      );
    }
    console.log('[world-postgres] concurrent party final-slot acceptance assertions passed');

    const concurrencySetup = join(fixtureDirectory, 'social-graph-postgres-concurrency.sql');
    await runCommand(psql, [...psqlBaseArguments, '--file', concurrencySetup]);
    const executeRaceSql = (command: string) =>
      runCommand(psql, [...psqlBaseArguments, '--tuples-only', '--no-align', '--command', command]);
    const phase11cConcurrencySetup = join(fixtureDirectory, 'phase11c-postgres-concurrency.sql');
    await runCommand(psql, [...psqlBaseArguments, '--file', phase11cConcurrencySetup]);
    const phase11cFinalStockResults = await Promise.all([
      executeRaceSql(
        "select phase11c_test.buy_final_unit('11111111111111111111111111111187','phase11c-race-final-stock-a')->>'status';",
      ),
      executeRaceSql(
        "select phase11c_test.buy_final_unit('11111111111111111111111111111188','phase11c-race-final-stock-b')->>'status';",
      ),
    ]);
    const phase11cFinalStockStatuses = phase11cFinalStockResults
      .map((result) => result.stdout.trim())
      .sort();
    if (
      phase11cFinalStockStatuses[0] !== 'completed' ||
      !['out_of_stock', 'stock_conflict'].includes(phase11cFinalStockStatuses[1] ?? '')
    ) {
      throw new Error(
        `Concurrent Phase 11C final-stock purchase returned unexpected statuses: ${phase11cFinalStockStatuses.join(', ')}`,
      );
    }
    const phase11cFinalStockVerification = await executeRaceSql(
      `select case when
        (select current_stock=0 from public.economy_shop_stock where catalog_version_id=(select shop_version_id from public.economy_active_shop_versions where shop_definition_id='74000000-0000-4000-8000-000000000001') and catalog_entry_id='c1100000-0000-4000-8000-000000000105')
        and (select count(*)=1 from public.economy_shop_transactions where idempotency_key in ('phase11c-race-final-stock-a','phase11c-race-final-stock-b') and status='completed')
        and (select count(*)=1 from public.player_dust_ledger where request_id in ('phase11c-race-final-stock-a','phase11c-race-final-stock-b') and delta=-9)
      then 'passed' else 'failed' end;`,
    );
    if (phase11cFinalStockVerification.stdout.trim() !== 'passed') {
      throw new Error(
        'Concurrent Phase 11C final-stock purchase violated atomic stock invariants.',
      );
    }
    console.log('[world-postgres] concurrent Phase 11C final-stock purchase assertions passed');
    await executeRaceSql('drop schema phase11c_test cascade;');
    const prepareRace = async (scenario: string) => {
      await executeRaceSql(`select phase8d_test.prepare('${scenario}');`);
    };
    const invitationId = async (partyId: string) =>
      (
        await executeRaceSql(
          `select id from public.player_party_invitations where party_id='${partyId}' and status='pending';`,
        )
      ).stdout.trim();
    const verifyRace = async (label: string, assertion: string) => {
      const result = await executeRaceSql(
        `select case when ${assertion} then 'passed' else 'failed' end;`,
      );
      if (result.stdout.trim() !== 'passed') {
        throw new Error(`Concurrent ${label} violated social graph invariants.`);
      }
      console.log(`[world-postgres] concurrent ${label} assertions passed`);
    };

    await prepareRace('same_target');
    const firstTargetInvitation = await invitationId('86000000-0000-4000-8000-000000000001');
    const secondTargetInvitation = await invitationId('86000000-0000-4000-8000-000000000002');
    await Promise.all([
      executeRaceSql(
        `select public.respond_realtime_party_invitation('83000000-0000-4000-8000-000000000032','${firstTargetInvitation}',1,'accept','phase8d-race-same-target-a')->>'status';`,
      ),
      executeRaceSql(
        `select public.respond_realtime_party_invitation('83000000-0000-4000-8000-000000000032','${secondTargetInvitation}',1,'accept','phase8d-race-same-target-b')->>'status';`,
      ),
    ]);
    await verifyRace(
      'same-target invitation acceptance',
      `(select count(*)=1 from public.player_party_members where player_profile_id='83000000-0000-4000-8000-000000000002' and status='active')
        and (select count(*)=1 from public.player_party_invitations where party_id in ('86000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002') and target_profile_id='83000000-0000-4000-8000-000000000002' and status='accepted')
        and not exists (select 1 from public.player_party_invitations where party_id in ('86000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002') and target_profile_id='83000000-0000-4000-8000-000000000002' and status='pending')
        and not exists (select 1 from public.player_parties party where party.status='active' and (select count(*) from public.player_party_members member where member.party_id=party.id and member.status='active' and member.role='leader')<>1)`,
    );

    await prepareRace('promotion_leave');
    await Promise.all([
      executeRaceSql(
        `select public.promote_realtime_party_leader('82000000-0000-4000-8000-000000000007',(select public_presence_id from public.player_profiles where id='82000000-0000-4000-8000-000000000002'),1,'phase8d-race-promote')->>'status';`,
      ),
      executeRaceSql(
        `select public.leave_realtime_party('82000000-0000-4000-8000-000000000007',1,'phase8d-race-leader-leave')->>'status';`,
      ),
    ]);
    await verifyRace(
      'promotion versus leader leave',
      `(select count(*)=1 from public.player_parties where id='86000000-0000-4000-8000-000000000003' and status='active')
        and (select count(*)=1 from public.player_party_members where party_id='86000000-0000-4000-8000-000000000003' and status='active' and role='leader')`,
    );

    await prepareRace('kick_leave');
    await Promise.all([
      executeRaceSql(
        `select public.kick_realtime_party_member('82000000-0000-4000-8000-000000000007',(select public_presence_id from public.player_profiles where id='82000000-0000-4000-8000-000000000002'),1,'phase8d-race-kick')->>'status';`,
      ),
      executeRaceSql(
        `select public.leave_realtime_party('82000000-0000-4000-8000-000000000008',1,'phase8d-race-member-leave')->>'status';`,
      ),
    ]);
    await verifyRace(
      'kick versus leave',
      `not exists (select 1 from public.player_party_members where player_profile_id='82000000-0000-4000-8000-000000000002' and status='active')
        and (select count(*)=1 from public.player_party_members where party_id='86000000-0000-4000-8000-000000000008' and status='active' and role='leader')`,
    );

    await prepareRace('disband_accept');
    const disbandInvitation = await invitationId('86000000-0000-4000-8000-000000000004');
    await Promise.all([
      executeRaceSql(
        `select public.disband_realtime_party('82000000-0000-4000-8000-000000000007',1,'phase8d-race-disband')->>'status';`,
      ),
      executeRaceSql(
        `select public.respond_realtime_party_invitation('83000000-0000-4000-8000-000000000031','${disbandInvitation}',1,'accept','phase8d-race-disband-accept')->>'status';`,
      ),
    ]);
    await verifyRace(
      'disband versus invitation acceptance',
      `not exists (select 1 from public.player_party_invitations where party_id='86000000-0000-4000-8000-000000000004' and status='pending')
        and not exists (select 1 from public.player_parties party where party.id='86000000-0000-4000-8000-000000000004' and party.status='active' and (select count(*) from public.player_party_members member where member.party_id=party.id and member.status='active' and member.role='leader')<>1)
        and not exists (select 1 from public.player_party_members member join public.player_parties party on party.id=member.party_id where party.id='86000000-0000-4000-8000-000000000004' and party.status<>'active' and member.status='active')`,
    );

    await prepareRace('block_join');
    const blockInvitation = await invitationId('86000000-0000-4000-8000-000000000005');
    await Promise.all([
      executeRaceSql(
        `select public.respond_realtime_party_invitation('83000000-0000-4000-8000-000000000032','${blockInvitation}',1,'accept','phase8d-race-block-join')->>'status';`,
      ),
      executeRaceSql(
        `begin; select public.update_realtime_chat_preference('82000000-0000-4000-8000-000000000007',(select public_presence_id from public.player_profiles where id='83000000-0000-4000-8000-000000000002'),'block'); select public.invalidate_realtime_social_graph_pair('82000000-0000-4000-8000-000000000007',(select public_presence_id from public.player_profiles where id='83000000-0000-4000-8000-000000000002'),'phase8d-race-block'); commit;`,
      ),
    ]);
    await verifyRace(
      'block versus party join',
      `exists (select 1 from public.multiplayer_chat_player_preferences where player_profile_id='82000000-0000-4000-8000-000000000001' and target_player_profile_id='83000000-0000-4000-8000-000000000002' and blocked)
        and not exists (select 1 from public.player_party_members left_member join public.player_party_members right_member on right_member.party_id=left_member.party_id where left_member.player_profile_id='82000000-0000-4000-8000-000000000001' and right_member.player_profile_id='83000000-0000-4000-8000-000000000002' and left_member.status='active' and right_member.status='active')
        and not exists (select 1 from public.player_party_invitations where target_profile_id='83000000-0000-4000-8000-000000000002' and status='pending')`,
    );

    await prepareRace('suspension_join');
    const suspensionInvitation = await invitationId('86000000-0000-4000-8000-000000000009');
    await Promise.all([
      executeRaceSql(
        `do $$ begin perform public.respond_realtime_party_invitation('83000000-0000-4000-8000-000000000032','${suspensionInvitation}',1,'accept','phase8d-race-suspension-join'); exception when sqlstate '28000' then null; end $$;`,
      ),
      executeRaceSql(
        `begin; update public.player_moderation_states set status='suspended', suspension_reason='Concurrent safety suspension.', suspended_at=now(), suspended_by_admin_id='11111111-1111-4111-8111-111111111111', version=version+1 where player_profile_id='83000000-0000-4000-8000-000000000002'; select public.handle_realtime_social_graph_disconnect('83000000-0000-4000-8000-000000000032','player_suspended','phase8d-race-suspension'); commit;`,
      ),
    ]);
    await verifyRace(
      'suspension versus party join',
      `exists (select 1 from public.player_moderation_states where player_profile_id='83000000-0000-4000-8000-000000000002' and status='suspended')
        and not exists (select 1 from public.player_party_members where player_profile_id='83000000-0000-4000-8000-000000000002' and status='active')
        and not exists (select 1 from public.player_party_invitations where target_profile_id='83000000-0000-4000-8000-000000000002' and status='pending')`,
    );

    await prepareRace('cleanup_reconnect');
    await Promise.all([
      executeRaceSql(`select public.cleanup_social_graph(100,'phase8d-race-cleanup');`),
      executeRaceSql(
        `select public.get_realtime_social_graph_bootstrap('82000000-0000-4000-8000-000000000007');`,
      ),
    ]);
    await verifyRace(
      'leader cleanup versus reconnect',
      `(select count(*)=1 from public.player_parties where id='86000000-0000-4000-8000-000000000006' and status='active' and leader_reconnect_deadline is null)
        and (select count(*)=1 from public.player_party_members where party_id='86000000-0000-4000-8000-000000000006' and status='active' and role='leader')`,
    );

    await prepareRace('ready_response');
    const readyCheckId = (
      await executeRaceSql(
        `select public_ready_check_id from public.player_party_ready_checks where party_id='86000000-0000-4000-8000-000000000007' and status='active';`,
      )
    ).stdout.trim();
    await Promise.all([
      executeRaceSql(
        `select public.respond_realtime_party_ready_check('82000000-0000-4000-8000-000000000008','${readyCheckId}',1,'ready','phase8d-race-ready-a')->>'status';`,
      ),
      executeRaceSql(
        `select public.respond_realtime_party_ready_check('82000000-0000-4000-8000-000000000008','${readyCheckId}',1,'ready','phase8d-race-ready-b')->>'status';`,
      ),
    ]);
    await verifyRace(
      'duplicate ready response',
      `(select count(*)=1 from public.player_party_ready_responses response join public.player_party_ready_checks ready on ready.id=response.ready_check_id where ready.public_ready_check_id='${readyCheckId}' and response.player_profile_id='82000000-0000-4000-8000-000000000002' and response.state='ready')
        and (select count(*)=1 from public.player_social_audit where actor_profile_id='82000000-0000-4000-8000-000000000002' and action='ready_check_responded' and request_id like 'phase8d-race-ready-%')`,
    );

    await prepareRace('ready_expired');
    await executeRaceSql(
      `update public.player_party_ready_checks set created_at=now()-interval '1 minute', expires_at=now()-interval '1 second' where party_id='86000000-0000-4000-8000-00000000000a' and status='active';`,
    );
    const expiredReadyCheckId = (
      await executeRaceSql(
        `select public_ready_check_id from public.player_party_ready_checks where party_id='86000000-0000-4000-8000-00000000000a' and status='active';`,
      )
    ).stdout.trim();
    const expiredReadyResult = await executeRaceSql(
      `select public.respond_realtime_party_ready_check('82000000-0000-4000-8000-000000000008','${expiredReadyCheckId}',1,'ready','phase8d-expired-ready')->>'status';`,
    );
    if (expiredReadyResult.stdout.trim() !== 'party_changed') {
      throw new Error('Expired ready check accepted a response.');
    }
    await verifyRace(
      'expired ready response',
      `(select count(*)=1 from public.player_party_ready_checks where public_ready_check_id='${expiredReadyCheckId}' and status='expired')
        and not exists (select 1 from public.player_social_audit where action='ready_check_responded' and request_id='phase8d-expired-ready')`,
    );

    await prepareRace('ready_membership_changed');
    const membershipReadyCheckId = (
      await executeRaceSql(
        `select public_ready_check_id from public.player_party_ready_checks where party_id='86000000-0000-4000-8000-00000000000b' and status='active';`,
      )
    ).stdout.trim();
    const leaveResult = await executeRaceSql(
      `select public.leave_realtime_party('82000000-0000-4000-8000-000000000008',1,'phase8d-ready-member-left')->>'status';`,
    );
    if (leaveResult.stdout.trim() !== 'left') {
      throw new Error('Ready-check membership-change fixture could not remove the member.');
    }
    const membershipReadyResult = await executeRaceSql(
      `select public.respond_realtime_party_ready_check('82000000-0000-4000-8000-000000000008','${membershipReadyCheckId}',1,'ready','phase8d-ready-after-leave')->>'status';`,
    );
    if (membershipReadyResult.stdout.trim() !== 'party_changed') {
      throw new Error('A former party member changed a ready response.');
    }
    await verifyRace(
      'membership-changed ready response',
      `(select count(*)=1 from public.player_party_ready_checks where public_ready_check_id='${membershipReadyCheckId}' and status='invalidated')
        and not exists (select 1 from public.player_social_audit where action='ready_check_responded' and request_id='phase8d-ready-after-leave')`,
    );

    await executeRaceSql('drop schema phase8d_test cascade;');

    const cooperativeActivityAssertions = join(
      fixtureDirectory,
      'cooperative-activities-postgres-execution.sql',
    );
    const cooperativeActivityResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      cooperativeActivityAssertions,
    ]);
    if (cooperativeActivityResult.stdout.trim()) {
      console.log(cooperativeActivityResult.stdout.trim());
    }
    console.log('[world-postgres] cooperative activity execution assertions passed');

    const economyAssertions = join(fixtureDirectory, 'economy-postgres-execution.sql');
    const economyResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      economyAssertions,
    ]);
    if (economyResult.stdout.trim()) {
      console.log(economyResult.stdout.trim());
    }
    console.log('[world-postgres] Phase 9A economy execution assertions passed');

    const avatarAssertions = join(fixtureDirectory, 'avatar-customization-postgres-execution.sql');
    const avatarResult = await runCommand(psql, [...psqlBaseArguments, '--file', avatarAssertions]);
    if (avatarResult.stdout.trim()) {
      console.log(avatarResult.stdout.trim());
    }
    console.log('[world-postgres] Phase 10A avatar execution assertions passed');

    const cosmeticAssertions = join(fixtureDirectory, 'cosmetics-postgres-execution.sql');
    const cosmeticResult = await runCommand(psql, [
      ...psqlBaseArguments,
      '--file',
      cosmeticAssertions,
    ]);
    if (cosmeticResult.stdout.trim()) console.log(cosmeticResult.stdout.trim());
    const contractLine = cosmeticResult.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('PHASE10B_CONTRACT_SAMPLE|'));
    if (contractLine === undefined) {
      throw new Error('The Phase 10B SQL fixture did not emit its API contract sample.');
    }
    const sqlWardrobe = JSON.parse(contractLine.slice('PHASE10B_CONTRACT_SAMPLE|'.length)) as {
      readonly loadouts?: readonly unknown[];
    } & Record<string, unknown>;
    const normalizedWardrobe = {
      ...sqlWardrobe,
      loadouts: (sqlWardrobe.loadouts ?? []).map((loadout) => {
        if (typeof loadout !== 'object' || loadout === null || Array.isArray(loadout)) {
          return loadout;
        }
        const record = loadout as Record<string, unknown>;
        return {
          ...record,
          selection: fromPersistedAvatarSelection(record['selection']),
        };
      }),
    };
    cosmeticWardrobeSchema.parse(normalizedWardrobe);
    console.log('[world-postgres] Phase 10B SQL wardrobe accepted by the shared API contract');
    console.log('[world-postgres] Phase 10B cosmetic execution assertions passed');

    const cosmeticConcurrencySetup = join(fixtureDirectory, 'cosmetics-postgres-concurrency.sql');
    await runCommand(psql, [...psqlBaseArguments, '--file', cosmeticConcurrencySetup]);
    const verifyCosmeticRace = async (label: string, assertion: string) => {
      const verification = await executeRaceSql(
        `select case when ${assertion} then 'passed' else 'failed' end;`,
      );
      if (verification.stdout.trim() !== 'passed') {
        throw new Error(`Concurrent ${label} violated Phase 10B cosmetic invariants.`);
      }
      console.log(`[world-postgres] concurrent ${label} assertions passed`);
    };
    const cosmeticAdminId = '10b10000-0000-4000-8000-000000000001';
    const cosmeticAdminAuthId = '10b10000-0000-4000-8000-000000000002';
    const cosmeticPlayerId = '10b10000-0000-4000-8000-000000000004';
    const cosmeticWallet = '11111111111111111111111111111133';
    const cosmeticSessionHash = 'e'.repeat(64);
    const grantResults = await Promise.all([
      executeRaceSql(
        `select public.grant_admin_player_cosmetic('${cosmeticAdminId}','${cosmeticAdminAuthId}','aal2','${cosmeticPlayerId}','phase10b-race-grant','development_test','First concurrent one-player grant.','not_owned','phase10b-race-grant-a')->>'status';`,
      ),
      executeRaceSql(
        `select public.grant_admin_player_cosmetic('${cosmeticAdminId}','${cosmeticAdminAuthId}','aal2','${cosmeticPlayerId}','phase10b-race-grant','development_test','Second concurrent one-player grant.','not_owned','phase10b-race-grant-b')->>'status';`,
      ),
    ]);
    const grantStatuses = grantResults.map((result) => result.stdout.trim()).sort();
    if (grantStatuses.join(',') !== 'granted,state_conflict') {
      throw new Error(`Concurrent cosmetic grants returned ${grantStatuses.join(', ')}.`);
    }
    await verifyCosmeticRace(
      'two grants of one cosmetic',
      `(select count(*) = 1 from public.player_cosmetic_ownership
        where player_profile_id = '${cosmeticPlayerId}'
          and avatar_content_definition_id = '10b10000-0000-4000-8000-000000000020'
          and ownership_state = 'owned')
       and (select count(*) = 1 from public.cosmetic_ownership_receipts
        where request_id in ('phase10b-race-grant-a','phase10b-race-grant-b'))`,
    );

    const cosmeticLoadoutId = (
      await executeRaceSql(
        `select id from public.player_cosmetic_loadouts where player_profile_id='${cosmeticPlayerId}' and slot_number=1;`,
      )
    ).stdout.trim();
    if (cosmeticLoadoutId === '') throw new Error('Cosmetic loadout race fixture is incomplete.');
    const loadoutResults = await Promise.all([
      executeRaceSql(
        `select public.save_player_cosmetic_loadout('${cosmeticWallet}','${cosmeticSessionHash}',1,'Race outfit A','{"bodyPresetKey":"meadow-frame","accessoryKeys":[]}'::jsonb,1,'phase10b-race-loadout-a')->>'status';`,
      ),
      executeRaceSql(
        `select public.save_player_cosmetic_loadout('${cosmeticWallet}','${cosmeticSessionHash}',1,'Race outfit B','{"bodyPresetKey":"willow-frame","accessoryKeys":[]}'::jsonb,1,'phase10b-race-loadout-b')->>'status';`,
      ),
    ]);
    const loadoutStatuses = loadoutResults.map((result) => result.stdout.trim()).sort();
    if (loadoutStatuses.join(',') !== 'loadout_changed,saved') {
      throw new Error(`Concurrent cosmetic loadout saves returned ${loadoutStatuses.join(', ')}.`);
    }
    await verifyCosmeticRace(
      'two outfit updates with one revision',
      `(select count(*) = 1 from public.player_cosmetic_loadouts
        where id = '${cosmeticLoadoutId}' and revision = 2
          and display_name in ('Race outfit A','Race outfit B')
          and selection ->> 'bodyPresetKey' in ('meadow-frame','willow-frame'))`,
    );

    const collectionResults = await Promise.all([
      executeRaceSql(
        `select public.claim_player_cosmetic_collection_reward('${cosmeticWallet}','${cosmeticSessionHash}','phase10b-race-collection','phase10b-race-collection-a')->>'status';`,
      ),
      executeRaceSql(
        `select public.claim_player_cosmetic_collection_reward('${cosmeticWallet}','${cosmeticSessionHash}','phase10b-race-collection','phase10b-race-collection-b')->>'status';`,
      ),
    ]);
    const collectionStatuses = collectionResults.map((result) => result.stdout.trim()).sort();
    if (collectionStatuses.join(',') !== 'already_claimed,claimed') {
      throw new Error(
        `Concurrent cosmetic collection claims returned ${collectionStatuses.join(', ')}.`,
      );
    }
    await verifyCosmeticRace(
      'two collection reward settlements',
      `(select count(*) = 1 from public.cosmetic_collection_reward_receipts
        where player_profile_id = '${cosmeticPlayerId}'
          and cosmetic_collection_id = '10b10000-0000-4000-8000-000000000040')
       and (select count(*) = 1 from public.cosmetic_ownership_receipts
        where player_profile_id = '${cosmeticPlayerId}' and operation_key = 'reward')`,
    );

    const wheelResults = await Promise.all([
      executeRaceSql(
        `select public.update_player_emote_wheel('${cosmeticWallet}','${cosmeticSessionHash}',array['wave','cheer'],0,'phase10b-race-wheel-a')->>'status';`,
      ),
      executeRaceSql(
        `select public.update_player_emote_wheel('${cosmeticWallet}','${cosmeticSessionHash}',array['nod','laugh'],0,'phase10b-race-wheel-b')->>'status';`,
      ),
    ]);
    const wheelStatuses = wheelResults.map((result) => result.stdout.trim()).sort();
    if (wheelStatuses.join(',') !== 'updated,wheel_changed') {
      throw new Error(`Concurrent emote-wheel updates returned ${wheelStatuses.join(', ')}.`);
    }
    await verifyCosmeticRace(
      'emote loadout update race',
      `(select revision = 1 and emote_keys in (array['wave','cheer'],array['nod','laugh'])
        from public.player_emote_wheels where player_profile_id = '${cosmeticPlayerId}')`,
    );

    const cooperativeConcurrencySetup = join(
      fixtureDirectory,
      'cooperative-activities-postgres-concurrency.sql',
    );
    await runCommand(psql, [...psqlBaseArguments, '--file', cooperativeConcurrencySetup]);
    const prepareActivityRace = async (scenario: string) => {
      const prepared = await executeRaceSql(`select phase8db_test.prepare('${scenario}')::text;`);
      return JSON.parse(prepared.stdout.trim()) as {
        readonly partyId: string;
        readonly preparationId?: string;
        readonly instanceId?: string;
        readonly internalInstanceId?: string;
        readonly revision?: number;
      };
    };
    const verifyActivityRace = async (label: string, assertion: string, diagnostic?: string) => {
      const result = await executeRaceSql(
        `select case when ${assertion} then 'passed' else 'failed' end;`,
      );
      if (result.stdout.trim() !== 'passed') {
        const evidence = diagnostic === undefined ? undefined : await executeRaceSql(diagnostic);
        throw new Error(
          `Concurrent ${label} violated cooperative activity invariants.${
            evidence === undefined ? '' : ` State: ${evidence.stdout.trim()}`
          }`,
        );
      }
      console.log(`[world-postgres] concurrent ${label} assertions passed`);
    };

    const entryRace = await prepareActivityRace('entry');
    if (entryRace.preparationId === undefined)
      throw new Error('Activity entry race is incomplete.');
    await Promise.all([
      executeRaceSql(
        `select public.enter_realtime_cooperative_activity('82000000-0000-4000-8000-000000000007','${entryRace.preparationId}','phase8db-race-enter-a')->>'status';`,
      ),
      executeRaceSql(
        `select public.enter_realtime_cooperative_activity('82000000-0000-4000-8000-000000000007','${entryRace.preparationId}','phase8db-race-enter-b')->>'status';`,
      ),
    ]);
    await verifyActivityRace(
      'two instance creation calls for one party',
      `(select count(*)=1 from public.cooperative_activity_instances where party_id='${entryRace.partyId}' and status in ('waiting_for_players','active','paused'))
       and (select count(*)=2 from public.cooperative_activity_participants participant join public.cooperative_activity_instances instance on instance.id=participant.instance_id where instance.party_id='${entryRace.partyId}')`,
    );

    const finalRace = await prepareActivityRace('final');
    if (finalRace.instanceId === undefined || finalRace.revision === undefined) {
      throw new Error('Activity final-objective race is incomplete.');
    }
    await Promise.all([
      executeRaceSql(
        `select public.interact_realtime_cooperative_activity('82000000-0000-4000-8000-000000000007','${finalRace.instanceId}',${finalRace.revision},'community-harvest-complete','community-bell',14,9,'phase8db-race-final-a')->>'status';`,
      ),
      executeRaceSql(
        `select public.interact_realtime_cooperative_activity('82000000-0000-4000-8000-000000000008','${finalRace.instanceId}',${finalRace.revision},'community-harvest-complete','community-bell',14,9,'phase8db-race-final-b')->>'status';`,
      ),
    ]);
    await verifyActivityRace(
      'two-player final objective completion',
      `(select count(*)=1 from public.cooperative_activity_completions completion join public.cooperative_activity_instances instance on instance.id=completion.instance_id where instance.public_instance_id='${finalRace.instanceId}')
       and (select count(*)=2 from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id join public.cooperative_activity_instances instance on instance.id=completion.instance_id where instance.public_instance_id='${finalRace.instanceId}')`,
    );

    const expiryRace = await prepareActivityRace('expiry');
    if (expiryRace.instanceId === undefined || expiryRace.internalInstanceId === undefined) {
      throw new Error('Activity expiry race is incomplete.');
    }
    await executeRaceSql(
      `update public.cooperative_activity_instances set expires_at=now()+interval '80 milliseconds' where id='${expiryRace.internalInstanceId}';`,
    );
    await Promise.all([
      executeRaceSql(
        `select pg_sleep(0.09); select public.interact_realtime_cooperative_activity('82000000-0000-4000-8000-000000000007','${expiryRace.instanceId}',1,'community-harvest-complete','community-bell',14,9,'phase8db-race-expiry-final')->>'status';`,
      ),
      executeRaceSql(
        `select pg_sleep(0.08); select public.cleanup_cooperative_activities(100,'phase8db-race-expiry-cleanup');`,
      ),
    ]);
    await verifyActivityRace(
      'objective completion versus activity expiry',
      `(select status in ('completed','expired') from public.cooperative_activity_instances where id='${expiryRace.internalInstanceId}')
       and ((select status='completed' from public.cooperative_activity_instances where id='${expiryRace.internalInstanceId}') = exists(select 1 from public.cooperative_activity_completions where instance_id='${expiryRace.internalInstanceId}'))
       and ((select status='expired' and result_code='activity_expired' from public.cooperative_activity_instances where id='${expiryRace.internalInstanceId}') = not exists(select 1 from public.cooperative_activity_completions where instance_id='${expiryRace.internalInstanceId}'))
       and (select count(*) in (0,2) from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where completion.instance_id='${expiryRace.internalInstanceId}')
       and ((select status='completed' from public.cooperative_activity_instances where id='${expiryRace.internalInstanceId}') = ((select count(*) from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where completion.instance_id='${expiryRace.internalInstanceId}')=2))`,
      `select jsonb_build_object('status',status,'resultCode',result_code,'completionCount',(select count(*) from public.cooperative_activity_completions where instance_id=instance.id),'receiptCount',(select count(*) from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where completion.instance_id=instance.id)) from public.cooperative_activity_instances instance where id='${expiryRace.internalInstanceId}';`,
    );

    const settlementRace = await prepareActivityRace('settlement');
    if (settlementRace.internalInstanceId === undefined) {
      throw new Error('Activity settlement race is incomplete.');
    }
    await Promise.all([
      executeRaceSql(
        `select (private.cooperative_activity_settle('${settlementRace.internalInstanceId}','phase8db-race-settle-a')).status;`,
      ),
      executeRaceSql(
        `select (private.cooperative_activity_settle('${settlementRace.internalInstanceId}','phase8db-race-settle-b')).status;`,
      ),
    ]);
    await verifyActivityRace(
      'duplicate reward settlement',
      `(select count(*)=1 from public.cooperative_activity_completions where instance_id='${settlementRace.internalInstanceId}')
       and (select count(*)=2 from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where completion.instance_id='${settlementRace.internalInstanceId}')
       and (select reward_settlement_status='settled' from public.cooperative_activity_instances where id='${settlementRace.internalInstanceId}')`,
    );

    const suspensionRace = await prepareActivityRace('suspension');
    if (
      suspensionRace.instanceId === undefined ||
      suspensionRace.internalInstanceId === undefined
    ) {
      throw new Error('Activity suspension race is incomplete.');
    }
    await Promise.all([
      executeRaceSql(
        `begin; update public.player_moderation_states set status='suspended', suspension_reason='Concurrent activity safety suspension.', suspended_at=now(), suspended_by_admin_id='11111111-1111-4111-8111-111111111111', version=version+1 where player_profile_id='82000000-0000-4000-8000-000000000002'; select public.handle_realtime_cooperative_activity_disconnect('82000000-0000-4000-8000-000000000008','player_suspended','phase8db-race-suspension'); select pg_sleep(0.1); commit;`,
      ),
      executeRaceSql(
        `select pg_sleep(0.04); do $$ begin perform public.interact_realtime_cooperative_activity('82000000-0000-4000-8000-000000000007','${suspensionRace.instanceId}',1,'community-harvest-complete','community-bell',14,9,'phase8db-race-suspension-final'); exception when sqlstate '28000' then null; end $$;`,
      ),
    ]);
    await verifyActivityRace(
      'completion versus suspension',
      `(select status='failed' from public.cooperative_activity_instances where id='${suspensionRace.internalInstanceId}')
       and not exists(select 1 from public.cooperative_activity_completions where instance_id='${suspensionRace.internalInstanceId}')
       and not exists(select 1 from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where completion.instance_id='${suspensionRace.internalInstanceId}')`,
    );

    const inventoryRace = await prepareActivityRace('inventory');
    if (inventoryRace.internalInstanceId === undefined) {
      throw new Error('Activity inventory race is incomplete.');
    }
    await executeRaceSql(
      `delete from public.player_inventory_stacks where player_profile_id='82000000-0000-4000-8000-000000000001'; update public.player_inventory_state set capacity=8 where player_profile_id='82000000-0000-4000-8000-000000000001'; insert into public.player_inventory_stacks(player_profile_id,item_definition_id,slot_index,quantity) select '82000000-0000-4000-8000-000000000001',(select id from public.cozy_item_definitions where slug='sunroot-seed'),slot,1 from generate_series(1,8) slot;`,
    );
    await Promise.all([
      executeRaceSql(
        `select (private.cooperative_activity_settle('${inventoryRace.internalInstanceId}','phase8db-race-inventory-settle')).status;`,
      ),
      executeRaceSql(
        `begin; select 1 from public.player_inventory_state where player_profile_id='82000000-0000-4000-8000-000000000001' for update; update public.player_inventory_state set capacity=9 where player_profile_id='82000000-0000-4000-8000-000000000001'; commit;`,
      ),
    ]);
    await verifyActivityRace(
      'inventory capacity change versus settlement',
      `(select count(*)=1 from public.cooperative_activity_reward_items reward_item join public.cooperative_activity_reward_receipts receipt on receipt.id=reward_item.reward_receipt_id join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where completion.instance_id='${inventoryRace.internalInstanceId}' and receipt.player_profile_id='82000000-0000-4000-8000-000000000001')
       and (select count(*)<=1 from public.cooperative_activity_pending_rewards pending join public.cooperative_activity_reward_receipts receipt on receipt.id=pending.reward_receipt_id join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where completion.instance_id='${inventoryRace.internalInstanceId}' and receipt.player_profile_id='82000000-0000-4000-8000-000000000001')`,
    );

    const dustRace = await prepareActivityRace('dust');
    if (dustRace.internalInstanceId === undefined)
      throw new Error('Activity DUST race is incomplete.');
    const beforeDust = Number(
      (
        await executeRaceSql(
          "select balance from public.player_dust_accounts where player_profile_id='82000000-0000-4000-8000-000000000001';",
        )
      ).stdout.trim(),
    );
    await Promise.all([
      executeRaceSql(
        `select (private.cooperative_activity_settle('${dustRace.internalInstanceId}','phase8db-race-dust-settle')).status;`,
      ),
      executeRaceSql(
        `select private.cozy_apply_dust_delta('82000000-0000-4000-8000-000000000001',1,'system_refund','system_operation','phase8db-race-dust','phase8db-race-dust-delta','phase8db-race-dust');`,
      ),
    ]);
    await verifyActivityRace(
      'DUST balance mutation versus settlement',
      `(select balance=${String(beforeDust + 16)} from public.player_dust_accounts where player_profile_id='82000000-0000-4000-8000-000000000001')
       and (select count(*)=1 from public.player_dust_ledger where player_profile_id='82000000-0000-4000-8000-000000000001' and reason='cooperative_activity_reward' and reference_id in (select public_completion_id::text from public.cooperative_activity_completions where instance_id='${dustRace.internalInstanceId}'))`,
    );

    const reconciliationRace = await prepareActivityRace('reconciliation');
    if (reconciliationRace.internalInstanceId === undefined) {
      throw new Error('Activity reconciliation race is incomplete.');
    }
    await Promise.all([
      executeRaceSql(
        `select (private.cooperative_activity_settle('${reconciliationRace.internalInstanceId}','phase9a-race-reconciliation-settle')).status;`,
      ),
      executeRaceSql(
        `select public.run_economy_reconciliation_worker(100,'phase9a-race-reconciliation-worker');`,
      ),
    ]);
    await verifyActivityRace(
      'reward settlement versus economy reconciliation',
      `(select count(*)=1 from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where completion.instance_id='${reconciliationRace.internalInstanceId}' and receipt.player_profile_id='82000000-0000-4000-8000-000000000001' and receipt.status='settled')
       and exists(select 1 from public.economy_reconciliation_runs run join public.economy_reconciliation_results result on result.run_id=run.id where run.request_id='phase9a-race-reconciliation-worker' and result.player_profile_id='82000000-0000-4000-8000-000000000001' and result.status='balanced' and result.stored_balance=result.ledger_balance and not result.auto_corrected)
       and not exists(select 1 from public.economy_reconciliation_runs run join public.economy_reconciliation_results result on result.run_id=run.id where run.request_id='phase9a-race-reconciliation-worker' and result.status='mismatch')`,
      `select jsonb_build_object('run',run.id,'checked',run.checked_count,'mismatches',run.mismatch_count,'playerResult',jsonb_build_object('status',result.status,'stored',result.stored_balance,'ledger',result.ledger_balance)) from public.economy_reconciliation_runs run left join public.economy_reconciliation_results result on result.run_id=run.id and result.player_profile_id='82000000-0000-4000-8000-000000000001' where run.request_id='phase9a-race-reconciliation-worker';`,
    );

    const reconnectRace = await prepareActivityRace('reconnect');
    if (reconnectRace.internalInstanceId === undefined) {
      throw new Error('Activity reconnect race is incomplete.');
    }
    await executeRaceSql(
      `update public.cooperative_activity_participants set connection_status='reconnecting', reconnect_deadline=now()-interval '1 second' where instance_id='${reconnectRace.internalInstanceId}' and player_profile_id='82000000-0000-4000-8000-000000000002';`,
    );
    await Promise.all([
      executeRaceSql(
        `select public.cleanup_cooperative_activities(100,'phase8db-race-reconnect-cleanup');`,
      ),
      executeRaceSql(
        `select public.get_realtime_cooperative_activity_bootstrap('82000000-0000-4000-8000-000000000008');`,
      ),
    ]);
    await verifyActivityRace(
      'worker cleanup versus reconnect',
      `(select count(*)=1 from public.cooperative_activity_instances where id='${reconnectRace.internalInstanceId}')
       and (select status in ('active','failed') from public.cooperative_activity_instances where id='${reconnectRace.internalInstanceId}')
       and (select count(*)=2 from public.cooperative_activity_participants where instance_id='${reconnectRace.internalInstanceId}')`,
    );

    const leaveRace = await prepareActivityRace('leave');
    if (leaveRace.instanceId === undefined || leaveRace.internalInstanceId === undefined) {
      throw new Error('Activity leave race is incomplete.');
    }
    await Promise.all([
      executeRaceSql(
        `select public.leave_realtime_cooperative_activity('82000000-0000-4000-8000-000000000008','${leaveRace.instanceId}','phase8db-race-leave')->>'status';`,
      ),
      executeRaceSql(
        `select public.interact_realtime_cooperative_activity('82000000-0000-4000-8000-000000000007','${leaveRace.instanceId}',1,'community-harvest-complete','community-bell',14,9,'phase8db-race-leave-final')->>'status';`,
      ),
    ]);
    await verifyActivityRace(
      'participant leave versus final completion',
      `(select status in ('completed','failed') from public.cooperative_activity_instances where id='${leaveRace.internalInstanceId}')
       and ((select status='completed' from public.cooperative_activity_instances where id='${leaveRace.internalInstanceId}') = exists(select 1 from public.cooperative_activity_completions where instance_id='${leaveRace.internalInstanceId}'))
       and not exists(select 1 from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where completion.instance_id='${leaveRace.internalInstanceId}' group by receipt.player_profile_id having count(*)>1)`,
    );

    const dailyRace = await prepareActivityRace('daily');
    if (dailyRace.internalInstanceId === undefined)
      throw new Error('Activity daily race is incomplete.');
    const secondDailyInstance = (
      await executeRaceSql('select phase8db_test.clone_for_daily_limit();')
    ).stdout.trim();
    const beforeDailyDust = Number(
      (
        await executeRaceSql(
          "select balance from public.player_dust_accounts where player_profile_id='82000000-0000-4000-8000-000000000001';",
        )
      ).stdout.trim(),
    );
    await executeRaceSql(
      `insert into public.cooperative_activity_cooldowns(player_profile_id,activity_definition_id,entry_available_at,reward_available_at,reward_day,rewarded_completions) values ('82000000-0000-4000-8000-000000000001','8d0b0000-0000-4000-8000-000000000000',now(),now(),(now() at time zone 'utc')::date,1) on conflict (player_profile_id,activity_definition_id) do update set reward_available_at=now(),reward_day=(now() at time zone 'utc')::date,rewarded_completions=1;`,
    );
    await Promise.all([
      executeRaceSql(
        `select (private.cooperative_activity_settle('${dailyRace.internalInstanceId}','phase8db-race-daily-a')).status;`,
      ),
      executeRaceSql(
        `select (private.cooperative_activity_settle('${secondDailyInstance}','phase8db-race-daily-b')).status;`,
      ),
    ]);
    await verifyActivityRace(
      'daily reward limit across two instances',
      `(select count(*)=2 from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where receipt.player_profile_id='82000000-0000-4000-8000-000000000001' and completion.instance_id in ('${dailyRace.internalInstanceId}','${secondDailyInstance}'))
       and (select count(*)=1 from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where receipt.player_profile_id='82000000-0000-4000-8000-000000000001' and receipt.status in ('settled','pending_inventory') and completion.instance_id in ('${dailyRace.internalInstanceId}','${secondDailyInstance}'))
       and (select count(*)=1 from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where receipt.player_profile_id='82000000-0000-4000-8000-000000000001' and receipt.status='ineligible' and completion.instance_id in ('${dailyRace.internalInstanceId}','${secondDailyInstance}'))
       and (select balance=${String(beforeDailyDust + 15)} from public.player_dust_accounts where player_profile_id='82000000-0000-4000-8000-000000000001')
       and (select rewarded_completions=2 from public.cooperative_activity_cooldowns where player_profile_id='82000000-0000-4000-8000-000000000001' and activity_definition_id='8d0b0000-0000-4000-8000-000000000000')`,
      `select jsonb_build_object('receipts',(select jsonb_agg(jsonb_build_object('instanceId',completion.instance_id,'status',receipt.status,'dust',receipt.dust_amount)) from public.cooperative_activity_reward_receipts receipt join public.cooperative_activity_completions completion on completion.id=receipt.completion_id where receipt.player_profile_id='82000000-0000-4000-8000-000000000001' and completion.instance_id in ('${dailyRace.internalInstanceId}','${secondDailyInstance}')),'dust',(select balance from public.player_dust_accounts where player_profile_id='82000000-0000-4000-8000-000000000001'),'rewardedCompletions',(select rewarded_completions from public.cooperative_activity_cooldowns where player_profile_id='82000000-0000-4000-8000-000000000001' and activity_definition_id='8d0b0000-0000-4000-8000-000000000000'));`,
    );

    await executeRaceSql('drop schema phase8db_test cascade;');

    const economyConcurrencySetup = join(fixtureDirectory, 'economy-postgres-concurrency.sql');
    await runCommand(psql, [...psqlBaseArguments, '--file', economyConcurrencySetup]);
    interface EconomyPurchaseState {
      readonly shopVersionId: string;
      readonly shopRevision: number;
      readonly priceA: number;
      readonly priceB: number | null;
      readonly dustVersion: number;
      readonly inventoryVersion: number;
    }
    interface EconomyVersionState {
      readonly versionId: string;
      readonly revision: number;
    }
    const playerId = '82000000-0000-4000-8000-000000000001';
    const playerWallet = '11111111111111111111111111111114';
    const shopDefinitionId = '74000000-0000-4000-8000-000000000001';
    const offerSeed = '74000000-0000-4000-8000-000000000011';
    const offerChair = '74000000-0000-4000-8000-000000000019';
    const offerTable = '74000000-0000-4000-8000-000000000020';
    const itemSeed = '71000000-0000-4000-8000-000000000001';
    const itemChair = '71000000-0000-4000-8000-000000000015';
    const itemTable = '71000000-0000-4000-8000-000000000016';
    const reviewerOne = '9a200000-0000-4000-8000-000000000002';
    const reviewerOneSession = '9a200000-0000-4000-8000-000000000012';
    const reviewerTwo = '9a200000-0000-4000-8000-000000000003';
    const reviewerTwoSession = '9a200000-0000-4000-8000-000000000013';
    const preparePurchase = async (
      targetBalance: number,
      capacity: number,
      filledSlots: number,
      offerA: string,
      offerB?: string,
    ): Promise<EconomyPurchaseState> => {
      const result = await executeRaceSql(
        `select phase9a_test.prepare_purchase(${targetBalance},${capacity},${filledSlots},'${offerA}',${offerB === undefined ? 'null' : `'${offerB}'`})::text;`,
      );
      return JSON.parse(result.stdout.trim()) as EconomyPurchaseState;
    };
    const prepareShopVersion = async (tag: string): Promise<EconomyVersionState> => {
      const result = await executeRaceSql(
        `select phase9a_test.approved_shop_version('${tag}')::text;`,
      );
      return JSON.parse(result.stdout.trim()) as EconomyVersionState;
    };
    const preparePolicyVersion = async (
      rewardsEnabled: boolean,
      tag: string,
    ): Promise<EconomyVersionState> => {
      const result = await executeRaceSql(
        `select phase9a_test.approved_policy_version(${rewardsEnabled ? 'true' : 'false'},'${tag}')::text;`,
      );
      return JSON.parse(result.stdout.trim()) as EconomyVersionState;
    };
    const purchaseSql = (
      state: EconomyPurchaseState,
      offerId: string,
      price: number,
      idempotencyKey: string,
      requestId: string,
    ) =>
      `select public.purchase_player_economy_shop('${playerWallet}','lantern-general-store','${offerId}',1,${price},'${state.shopVersionId}',${state.shopRevision},${state.dustVersion},${state.inventoryVersion},'${idempotencyKey}','${requestId}')->>'status';`;
    const verifyEconomyRace = async (label: string, assertion: string, diagnostic?: string) => {
      const result = await executeRaceSql(
        `select case when ${assertion} then 'passed' else 'failed' end;`,
      );
      if (result.stdout.trim() !== 'passed') {
        const evidence = diagnostic === undefined ? undefined : await executeRaceSql(diagnostic);
        throw new Error(
          `Concurrent ${label} violated Phase 9A.1 economy invariants.${
            evidence === undefined ? '' : ` State: ${evidence.stdout.trim()}`
          }`,
        );
      }
      console.log(`[world-postgres] concurrent ${label} assertions passed`);
    };
    const balancedPlayer = `(select account.balance>=0 and account.balance=(select coalesce(sum(ledger.delta),0)::bigint from public.player_dust_ledger ledger where ledger.player_profile_id=account.player_profile_id) from public.player_dust_accounts account where account.player_profile_id='${playerId}')`;

    const finalBalance = await preparePurchase(8, 24, 0, offerSeed);
    await Promise.all([
      executeRaceSql(
        purchaseSql(
          finalBalance,
          offerSeed,
          finalBalance.priceA,
          'phase9a-race-final-balance-a',
          'phase9a-race-final-balance-a',
        ),
      ),
      executeRaceSql(
        purchaseSql(
          finalBalance,
          offerSeed,
          finalBalance.priceA,
          'phase9a-race-final-balance-b',
          'phase9a-race-final-balance-b',
        ),
      ),
    ]);
    await verifyEconomyRace(
      'two purchases for the final affordable balance',
      `(select balance=0 from public.player_dust_accounts where player_profile_id='${playerId}')
       and (select count(*)=1 from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key in ('phase9a-race-final-balance-a','phase9a-race-final-balance-b'))
       and (select count(*)=1 from public.player_dust_ledger where player_profile_id='${playerId}' and request_id in ('phase9a-race-final-balance-a','phase9a-race-final-balance-b') and delta=-8)
       and private.cozy_owned_quantity('${playerId}','${itemSeed}')=1
       and ${balancedPlayer}`,
    );

    const finalSlot = await preparePurchase(200, 8, 7, offerChair, offerTable);
    if (finalSlot.priceB === null) throw new Error('Final-slot race is missing its second price.');
    await Promise.all([
      executeRaceSql(
        purchaseSql(
          finalSlot,
          offerChair,
          finalSlot.priceA,
          'phase9a-race-final-slot-a',
          'phase9a-race-final-slot-a',
        ),
      ),
      executeRaceSql(
        purchaseSql(
          finalSlot,
          offerTable,
          finalSlot.priceB,
          'phase9a-race-final-slot-b',
          'phase9a-race-final-slot-b',
        ),
      ),
    ]);
    await verifyEconomyRace(
      'two purchases for the final inventory slot',
      `(select count(*)=1 from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key in ('phase9a-race-final-slot-a','phase9a-race-final-slot-b'))
       and (select count(*)=8 from public.player_inventory_stacks where player_profile_id='${playerId}')
       and private.cozy_owned_quantity('${playerId}','${itemChair}')+private.cozy_owned_quantity('${playerId}','${itemTable}')=1
       and (select count(*)=1 from public.player_dust_ledger where player_profile_id='${playerId}' and request_id in ('phase9a-race-final-slot-a','phase9a-race-final-slot-b'))
       and ${balancedPlayer}`,
    );

    const rewardPurchase = await preparePurchase(20, 24, 0, offerSeed);
    await Promise.all([
      executeRaceSql(
        purchaseSql(
          rewardPurchase,
          offerSeed,
          rewardPurchase.priceA,
          'phase9a-race-reward-purchase',
          'phase9a-race-reward-purchase',
        ),
      ),
      executeRaceSql(
        `select private.cozy_apply_dust_delta('${playerId}',15,'cooperative_activity_reward','cooperative_activity','phase9a-race-reward-settlement','phase9a-race-reward-settlement','phase9a-race-reward-settlement');`,
      ),
    ]);
    await verifyEconomyRace(
      'purchase versus activity reward',
      `(select count(*)=1 from public.player_dust_ledger where player_profile_id='${playerId}' and request_id='phase9a-race-reward-settlement' and delta=15)
       and (select count(*) in (0,1) from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key='phase9a-race-reward-purchase')
       and private.cozy_owned_quantity('${playerId}','${itemSeed}')=(select count(*)::integer from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key='phase9a-race-reward-purchase')
       and (select count(*) from public.player_dust_ledger where player_profile_id='${playerId}' and request_id='phase9a-race-reward-purchase')=(select count(*) from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key='phase9a-race-reward-purchase')
       and ${balancedPlayer}`,
    );

    const correctionPurchase = await preparePurchase(20, 24, 0, offerSeed);
    const purchaseCorrectionId = (
      await executeRaceSql(
        "select phase9a_test.create_correction(10,'phase9a-race-purchase-correction')::text;",
      )
    ).stdout.trim();
    await Promise.all([
      executeRaceSql(
        purchaseSql(
          correctionPurchase,
          offerSeed,
          correctionPurchase.priceA,
          'phase9a-race-correction-purchase',
          'phase9a-race-correction-purchase',
        ),
      ),
      executeRaceSql(
        `select public.review_admin_economy_correction('${reviewerOne}','${reviewerOneSession}','aal2','${purchaseCorrectionId}','approve','phase9a-race-correction-review')->>'status';`,
      ),
    ]);
    await verifyEconomyRace(
      'purchase versus correction',
      `(select status in ('pending_review','settled') from public.economy_correction_requests where id='${purchaseCorrectionId}')
       and ((select case when status='settled' then 1 else 0 end from public.economy_correction_requests where id='${purchaseCorrectionId}')+(select count(*) from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key='phase9a-race-correction-purchase')=1)
       and (select count(*) from public.player_dust_ledger where player_profile_id='${playerId}' and reference_id='${purchaseCorrectionId}')=(select case when status='settled' then 1 else 0 end from public.economy_correction_requests where id='${purchaseCorrectionId}')
       and private.cozy_owned_quantity('${playerId}','${itemSeed}')=(select count(*)::integer from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key='phase9a-race-correction-purchase')
       and ${balancedPlayer}`,
    );

    const disablePurchase = await preparePurchase(50, 24, 0, offerSeed);
    const disableVersion = await prepareShopVersion('phase9a-race-disable');
    await Promise.all([
      executeRaceSql(
        purchaseSql(
          disablePurchase,
          offerSeed,
          disablePurchase.priceA,
          'phase9a-race-disable-purchase',
          'phase9a-race-disable-purchase',
        ),
      ),
      executeRaceSql(
        `select public.operate_admin_economy_shop_version('${reviewerOne}','${reviewerOneSession}','aal2','${disableVersion.versionId}',${disableVersion.revision},'disable',null,'phase9a-race-disable-transition')->>'status';`,
      ),
    ]);
    await verifyEconomyRace(
      'shop disable versus purchase',
      `not (select active from public.cozy_shop_definitions where id='${shopDefinitionId}')
       and (public.get_player_economy_shop('${playerWallet}','lantern-general-store','phase9a-race-disable-read')->>'availability')='closed'
       and (select lifecycle_status='disabled' from public.economy_shop_versions where id='${disableVersion.versionId}')
       and (select count(*)=1 from public.economy_active_shop_versions where shop_definition_id='${shopDefinitionId}')
       and (select count(*) in (0,1) from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key='phase9a-race-disable-purchase')
       and private.cozy_owned_quantity('${playerId}','${itemSeed}')=(select count(*)::integer from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key='phase9a-race-disable-purchase')
       and (select count(*) from public.player_dust_ledger where player_profile_id='${playerId}' and request_id='phase9a-race-disable-purchase')=(select count(*) from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key='phase9a-race-disable-purchase')
       and ${balancedPlayer}`,
    );

    await executeRaceSql('select phase9a_test.reset_player(100,24,0);');
    const pausedPolicy = await preparePolicyVersion(false, 'phase9a-race-reward-pause');
    await Promise.all([
      executeRaceSql(
        `select public.operate_admin_economy_policy_version('${reviewerOne}','${reviewerOneSession}','aal2','${pausedPolicy.versionId}',${pausedPolicy.revision},'publish',null,'phase9a-race-reward-pause-publish')->>'status';`,
      ),
      executeRaceSql(
        `select private.cozy_apply_dust_delta('${playerId}',15,'cooperative_activity_reward','cooperative_activity','phase9a-race-paused-reward','phase9a-race-paused-reward','phase9a-race-paused-reward');`,
      ),
    ]);
    await verifyEconomyRace(
      'reward pause versus settlement',
      `(select policy_version_id='${pausedPolicy.versionId}' from public.economy_active_policy where singleton_key)
       and (select not rewards_enabled from public.economy_policy_versions where id='${pausedPolicy.versionId}')
       and (select count(*) in (0,1) from public.player_dust_ledger where player_profile_id='${playerId}' and request_id='phase9a-race-paused-reward')
       and (select balance=100+15*(select count(*) from public.player_dust_ledger where player_profile_id='${playerId}' and request_id='phase9a-race-paused-reward') from public.player_dust_accounts where player_profile_id='${playerId}')
       and ${balancedPlayer}`,
    );

    await executeRaceSql('select phase9a_test.reset_player(100,24,0);');
    const twoReviewerCorrection = (
      await executeRaceSql(
        "select phase9a_test.create_correction(600,'phase9a-race-two-reviewers')::text;",
      )
    ).stdout.trim();
    await Promise.all([
      executeRaceSql(
        `select public.review_admin_economy_correction('${reviewerOne}','${reviewerOneSession}','aal2','${twoReviewerCorrection}','approve','phase9a-race-two-reviewers-a')->>'status';`,
      ),
      executeRaceSql(
        `select public.review_admin_economy_correction('${reviewerTwo}','${reviewerTwoSession}','aal2','${twoReviewerCorrection}','approve','phase9a-race-two-reviewers-b')->>'status';`,
      ),
    ]);
    await verifyEconomyRace(
      'two correction reviewers',
      `(select status='settled' and first_approved_by_admin_id is not null and second_approved_by_admin_id is not null and first_approved_by_admin_id<>second_approved_by_admin_id from public.economy_correction_requests where id='${twoReviewerCorrection}')
       and (select count(*)=1 from public.player_dust_ledger where player_profile_id='${playerId}' and reference_id='${twoReviewerCorrection}')
       and (select balance=700 from public.player_dust_accounts where player_profile_id='${playerId}')
       and ${balancedPlayer}`,
    );

    await executeRaceSql('select phase9a_test.reset_player(100,24,0);');
    const approvalRejectionCorrection = (
      await executeRaceSql(
        "select phase9a_test.create_correction(10,'phase9a-race-approve-reject')::text;",
      )
    ).stdout.trim();
    await Promise.all([
      executeRaceSql(
        `select public.review_admin_economy_correction('${reviewerOne}','${reviewerOneSession}','aal2','${approvalRejectionCorrection}','approve','phase9a-race-approve')->>'status';`,
      ),
      executeRaceSql(
        `select public.review_admin_economy_correction('${reviewerTwo}','${reviewerTwoSession}','aal2','${approvalRejectionCorrection}','reject','phase9a-race-reject')->>'status';`,
      ),
    ]);
    await verifyEconomyRace(
      'correction approval versus rejection',
      `(select status in ('settled','rejected') from public.economy_correction_requests where id='${approvalRejectionCorrection}')
       and (select count(*) from public.player_dust_ledger where player_profile_id='${playerId}' and reference_id='${approvalRejectionCorrection}')=(select case when status='settled' then 1 else 0 end from public.economy_correction_requests where id='${approvalRejectionCorrection}')
       and (select balance=case when (select status from public.economy_correction_requests where id='${approvalRejectionCorrection}')='settled' then 110 else 100 end from public.player_dust_accounts where player_profile_id='${playerId}')
       and ${balancedPlayer}`,
    );

    await executeRaceSql('select phase9a_test.reset_player(100,24,0);');
    const scheduledShop = await prepareShopVersion('phase9a-race-scheduled');
    const manualShop = await prepareShopVersion('phase9a-race-manual');
    const scheduledRevision = Number(
      (
        await executeRaceSql(
          `select public.operate_admin_economy_shop_version('${reviewerOne}','${reviewerOneSession}','aal2','${scheduledShop.versionId}',${scheduledShop.revision},'schedule',now()+interval '150 milliseconds','phase9a-race-schedule')->>'revision';`,
        )
      ).stdout.trim(),
    );
    if (!Number.isInteger(scheduledRevision)) {
      throw new Error('The scheduled activation race did not return a revision.');
    }
    await executeRaceSql('select pg_sleep(0.2);');
    await Promise.all([
      executeRaceSql(
        "select public.activate_approved_economy_versions(10,'phase9a-race-scheduled-worker');",
      ),
      executeRaceSql(
        `select public.operate_admin_economy_shop_version('${reviewerOne}','${reviewerOneSession}','aal2','${manualShop.versionId}',${manualShop.revision},'publish',null,'phase9a-race-manual-publish')->>'status';`,
      ),
    ]);
    await verifyEconomyRace(
      'scheduled activation versus manual publication',
      `(select count(*)=1 from public.economy_active_shop_versions where shop_definition_id='${shopDefinitionId}')
       and (select shop_version_id in ('${scheduledShop.versionId}','${manualShop.versionId}') from public.economy_active_shop_versions where shop_definition_id='${shopDefinitionId}')
       and (select lifecycle_status='published' and approved_at is not null from public.economy_shop_versions where id='${scheduledShop.versionId}')
       and (select lifecycle_status='published' and approved_at is not null from public.economy_shop_versions where id='${manualShop.versionId}')
       and (select active from public.cozy_shop_definitions where id='${shopDefinitionId}')`,
    );

    await executeRaceSql('select phase9a_test.reset_player(100,24,0);');
    const publishShopA = await prepareShopVersion('phase9a-race-publish-a');
    const publishShopB = await prepareShopVersion('phase9a-race-publish-b');
    await Promise.all([
      executeRaceSql(
        `select public.operate_admin_economy_shop_version('${reviewerOne}','${reviewerOneSession}','aal2','${publishShopA.versionId}',${publishShopA.revision},'publish',null,'phase9a-race-publish-a')->>'status';`,
      ),
      executeRaceSql(
        `select public.operate_admin_economy_shop_version('${reviewerTwo}','${reviewerTwoSession}','aal2','${publishShopB.versionId}',${publishShopB.revision},'publish',null,'phase9a-race-publish-b')->>'status';`,
      ),
    ]);
    await verifyEconomyRace(
      'two shop publications',
      `(select count(*)=1 from public.economy_active_shop_versions where shop_definition_id='${shopDefinitionId}')
       and (select shop_version_id in ('${publishShopA.versionId}','${publishShopB.versionId}') from public.economy_active_shop_versions where shop_definition_id='${shopDefinitionId}')
       and (select count(*)=2 from public.economy_shop_versions where id in ('${publishShopA.versionId}','${publishShopB.versionId}') and lifecycle_status='published' and approved_at is not null)
       and (select active from public.cozy_shop_definitions where id='${shopDefinitionId}')`,
    );

    const reconciliationPurchase = await preparePurchase(50, 24, 0, offerSeed);
    await Promise.all([
      executeRaceSql(
        purchaseSql(
          reconciliationPurchase,
          offerSeed,
          reconciliationPurchase.priceA,
          'phase9a-race-reconciliation-purchase',
          'phase9a-race-reconciliation-purchase',
        ),
      ),
      executeRaceSql(
        "select public.run_economy_reconciliation_worker(100,'phase9a-race-purchase-reconciliation');",
      ),
    ]);
    await verifyEconomyRace(
      'reconciliation versus purchase',
      `(select count(*)=1 from public.economy_purchase_receipts where player_profile_id='${playerId}' and idempotency_key='phase9a-race-reconciliation-purchase')
       and exists(select 1 from public.economy_reconciliation_runs run join public.economy_reconciliation_results result on result.run_id=run.id where run.request_id='phase9a-race-purchase-reconciliation' and result.player_profile_id='${playerId}' and result.status='balanced' and result.stored_balance=result.ledger_balance and not result.auto_corrected)
       and not exists(select 1 from public.economy_reconciliation_runs run join public.economy_reconciliation_results result on result.run_id=run.id where run.request_id='phase9a-race-purchase-reconciliation' and result.status='mismatch')
       and private.cozy_owned_quantity('${playerId}','${itemSeed}')=1
       and ${balancedPlayer}`,
    );

    await executeRaceSql('drop schema phase9a_test cascade;');
  } catch (error) {
    executionError = error;
  } finally {
    if (started) {
      try {
        await runCommand(pgCtl, [
          '--pgdata',
          dataDirectory,
          '--mode',
          'fast',
          '--wait',
          '--timeout',
          '30',
          'stop',
        ]);
      } catch (fastStopError) {
        try {
          await runCommand(pgCtl, [
            '--pgdata',
            dataDirectory,
            '--mode',
            'immediate',
            '--wait',
            '--timeout',
            '30',
            'stop',
          ]);
        } catch (immediateStopError) {
          const cleanupError = new AggregateError(
            [fastStopError, immediateStopError],
            'The isolated PostgreSQL cluster could not be stopped.',
          );
          console.error(`[world-postgres] cleanup failed: ${String(cleanupError)}`);
          executionError ??= cleanupError;
        }
      }
    }
    try {
      await rm(workspace, { force: true, recursive: true });
    } catch (error) {
      executionError ??= error;
    }
  }

  if (executionError !== undefined) {
    throw executionError;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
