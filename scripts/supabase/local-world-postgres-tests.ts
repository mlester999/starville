import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    await runCommand(pgCtl, [
      '--pgdata',
      dataDirectory,
      '--log',
      logFile,
      '--options',
      `-F -p ${String(port)} -h 127.0.0.1 -k ${socketDirectory} -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
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

    const seedMigration = join(migrationDirectory, '20260712102000_world_management_seed.sql');
    await runCommand(psql, [...psqlBaseArguments, '--single-transaction', '--file', seedMigration]);
    console.log('[world-postgres] verified idempotent Phase 6 seed replay');

    const cozyAssertions = join(fixtureDirectory, 'cozy-gameplay-postgres-execution.sql');
    const cozyResult = await runCommand(psql, [...psqlBaseArguments, '--file', cozyAssertions]);
    if (cozyResult.stdout.trim()) {
      console.log(cozyResult.stdout.trim());
    }
    console.log('[world-postgres] cozy-gameplay execution assertions passed');

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

    const assertions = join(fixtureDirectory, 'world-postgres-execution.sql');
    const result = await runCommand(psql, [...psqlBaseArguments, '--file', assertions]);
    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    console.log('[world-postgres] execution assertions passed');
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
