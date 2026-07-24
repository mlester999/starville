import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertDatabaseUrlMatchesProjectRef,
  loadHostedSupabaseSafetyConfig,
  validateConfiguredTokenMintAddress,
} from '@starville/config/server';
import { createSolanaTokenVerifier, type SupportedTokenProgram } from '@starville/solana';
import { decimalAmountToRaw } from '@starville/wallet-access';

import {
  validateDeploymentEnvironment,
  validatePhase13CRepository,
  type ValidationResult,
} from './phase13c-release-readiness';
import { verifyCanonicalHostedTarget } from './supabase/safety';

interface MigrationManifest {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly entries: readonly { readonly timestamp: string; readonly filename: string }[];
}

interface CommissioningManifest {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly status: string;
  readonly productionMutationAuthorized: boolean;
  readonly sourceCommit: { readonly approved: boolean; readonly sha: string | null };
  readonly environmentManifest: { readonly path: string; readonly sha256: string };
  readonly migrations: { readonly path: string; readonly sha256: string };
  readonly referenceData: {
    readonly seedManifest: string;
    readonly seedSha256: string;
    readonly catalogManifest: string;
    readonly catalogSha256: string;
  };
  readonly world: { readonly approvalState: string; readonly revisionId: string | null };
  readonly assets: {
    readonly approvalState: string;
    readonly manifestPath: string;
    readonly sha256: string;
  };
  readonly audio: { readonly manifestPath: string; readonly manifestSha256: string };
  readonly backup: { readonly status: string };
  readonly publicAccess: { readonly status: string };
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function value(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const candidate = environment[name]?.trim();
  return candidate === '' ? undefined : candidate;
}

function enabled(environment: NodeJS.ProcessEnv, name: string): boolean {
  return value(environment, name)?.toLowerCase() === 'true';
}

export function maskIdentifier(candidate: string | undefined): string {
  if (candidate === undefined || candidate.length < 9) return '<masked-or-missing>';
  return `${candidate.slice(0, 4)}...${candidate.slice(-4)}`;
}

function safeDatabaseHost(databaseUrl: string): string {
  const hostname = new URL(databaseUrl).hostname;
  const labels = hostname.split('.');
  if (labels.length < 2) return '<masked-host>';
  return `${maskIdentifier(labels[0])}.${labels.slice(1).join('.')}`;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function validateProductionCommissioningTarget(
  environment: NodeJS.ProcessEnv,
): ValidationResult {
  const errors = [...validateDeploymentEnvironment(environment).errors];
  const required = [
    'SUPABASE_DATABASE_URL',
    'STARVILLE_PRODUCTION_REOWN_PROJECT_ID',
    'STARVILLE_DEVELOPMENT_REOWN_PROJECT_ID',
    'GAME_TOKEN_GATE_AMOUNT',
    'STARVILLE_PRODUCTION_ENVIRONMENT_MANIFEST_VERSION',
    'STARVILLE_PRODUCTION_LANDING_URL',
    'STARVILLE_PRODUCTION_GAME_URL',
    'STARVILLE_PRODUCTION_ADMIN_URL',
    'STARVILLE_PRODUCTION_API_URL',
    'STARVILLE_PRODUCTION_REALTIME_URL',
  ] as const;

  if (value(environment, 'SUPABASE_ENVIRONMENT') !== 'production') {
    errors.push('SUPABASE_ENVIRONMENT must be production');
  }
  if (value(environment, 'NEXT_PUBLIC_REALTIME_PROVIDER') !== 'custom') {
    errors.push(
      'NEXT_PUBLIC_REALTIME_PROVIDER must remain custom until Supabase Realtime parity is approved',
    );
  }
  if (value(environment, 'STARVILLE_BACKGROUND_JOBS_PROVIDER') !== 'custom') {
    errors.push(
      'STARVILLE_BACKGROUND_JOBS_PROVIDER must remain custom until SQL/Cron parity is approved',
    );
  }
  for (const name of required) {
    const candidate = value(environment, name);
    if (candidate === undefined || candidate.includes('OWNER_REQUIRED')) {
      errors.push(`${name} requires an owner-approved production value`);
    }
  }
  if (
    value(environment, 'NEXT_PUBLIC_REOWN_PROJECT_ID') !==
    value(environment, 'STARVILLE_PRODUCTION_REOWN_PROJECT_ID')
  ) {
    errors.push('Configured Reown project is not the approved production project');
  }
  if (
    value(environment, 'NEXT_PUBLIC_REOWN_PROJECT_ID') ===
    value(environment, 'STARVILLE_DEVELOPMENT_REOWN_PROJECT_ID')
  ) {
    errors.push('Production and development Reown project identifiers must differ');
  }
  const configuredMint = value(environment, 'GAME_TOKEN_MINT_ADDRESS');
  if (configuredMint !== undefined) {
    try {
      validateConfiguredTokenMintAddress(configuredMint);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Production token mint is invalid');
    }
  }
  if (value(environment, 'GAME_TOKEN_GATE_AMOUNT') !== '10000') {
    errors.push('GAME_TOKEN_GATE_AMOUNT must be exactly 10000 display tokens');
  }
  for (const obsolete of [
    'STARVILLE_PRODUCTION_TOKEN_MINT_ADDRESS',
    'STARVILLE_PRODUCTION_TOKEN_PROGRAM',
    'STARVILLE_PRODUCTION_TOKEN_DECIMALS',
  ]) {
    if (value(environment, obsolete) !== undefined) {
      errors.push(`${obsolete} is obsolete and must be removed`);
    }
  }
  if (value(environment, 'STARVILLE_PRODUCTION_ENVIRONMENT_MANIFEST_VERSION') !== '1') {
    errors.push('Production environment manifest version must be 1');
  }
  for (const [configured, approved] of [
    ['NEXT_PUBLIC_LANDING_URL', 'STARVILLE_PRODUCTION_LANDING_URL'],
    ['NEXT_PUBLIC_GAME_URL', 'STARVILLE_PRODUCTION_GAME_URL'],
    ['NEXT_PUBLIC_ADMIN_URL', 'STARVILLE_PRODUCTION_ADMIN_URL'],
    ['NEXT_PUBLIC_API_URL', 'STARVILLE_PRODUCTION_API_URL'],
    ['NEXT_PUBLIC_REALTIME_URL', 'STARVILLE_PRODUCTION_REALTIME_URL'],
  ] as const) {
    if (value(environment, configured) !== value(environment, approved)) {
      errors.push(`${configured} does not match ${approved}`);
    }
  }
  for (const name of [
    'SUPABASE_REMOTE_WRITES_APPROVED',
    'RUN_HOSTED_SUPABASE_TESTS',
    'ADMIN_BOOTSTRAP_ENABLED',
  ]) {
    if (enabled(environment, name)) errors.push(`${name} must be false during target verification`);
  }

  try {
    const config = loadHostedSupabaseSafetyConfig(environment);
    const databaseUrl = value(environment, 'SUPABASE_DATABASE_URL');
    if (databaseUrl !== undefined) {
      assertDatabaseUrlMatchesProjectRef(databaseUrl, config.projectRef);
      if (decodeURIComponent(new URL(databaseUrl).pathname) !== '/postgres') {
        errors.push('Production database name must be postgres');
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Hosted target validation failed');
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export interface VerifiedProductionTokenConfiguration {
  readonly mintAddress: string;
  readonly tokenProgram: SupportedTokenProgram;
  readonly decimals: number;
  readonly requiredDisplayAmount: '10000';
  readonly requiredBaseUnits: string;
  readonly slot: number;
}

export async function verifyProductionTokenConfiguration(
  environment: NodeJS.ProcessEnv,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<VerifiedProductionTokenConfiguration> {
  const validation = validateProductionCommissioningTarget(environment);
  if (!validation.ok) {
    throw new Error('Production token configuration failed static validation');
  }

  const rpcUrl = value(environment, 'SOLANA_RPC_URL');
  const mintAddress = value(environment, 'GAME_TOKEN_MINT_ADDRESS');
  if (rpcUrl === undefined || mintAddress === undefined) {
    throw new Error('Production token configuration is incomplete');
  }

  const verifier = createSolanaTokenVerifier({
    rpcUrl,
    network: 'solana:mainnet-beta',
    commitment: 'finalized',
    fetch,
  });
  const mint = await verifier.refreshMint(mintAddress, 'finalized');

  return {
    mintAddress: mint.mintAddress,
    tokenProgram: mint.tokenProgram,
    decimals: mint.decimals,
    requiredDisplayAmount: '10000',
    requiredBaseUnits: decimalAmountToRaw('10000', mint.decimals).toString(),
    slot: mint.slot,
  };
}

export interface RemoteMigrationState {
  readonly local: readonly string[];
  readonly remote: readonly string[];
}

export function parseRemoteMigrationState(output: string): RemoteMigrationState {
  for (const line of output.split(/\r?\n/u)) {
    const candidate = line.trim();
    if (!candidate.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(candidate) as {
        readonly migrations?: readonly {
          readonly local?: unknown;
          readonly remote?: unknown;
        }[];
      };
      if (!Array.isArray(parsed.migrations)) continue;
      const local: string[] = [];
      const remote: string[] = [];
      for (const migration of parsed.migrations) {
        if (typeof migration.local === 'string' && /^\d{14}$/u.test(migration.local)) {
          local.push(migration.local);
        }
        if (typeof migration.remote === 'string' && /^\d{14}$/u.test(migration.remote)) {
          remote.push(migration.remote);
        }
      }
      return { local, remote };
    } catch {
      // Non-migration output can precede the CLI table. Fall through to the text parser.
    }
  }

  const local: string[] = [];
  const remote: string[] = [];
  for (const line of output.split(/\r?\n/u)) {
    const match = /^\s*`?(\d{14})?`?\s*\|\s*`?(\d{14})?`?\s*\|/u.exec(line);
    if (match === null) continue;
    if (match[1] !== undefined) local.push(match[1]);
    if (match[2] !== undefined) remote.push(match[2]);
  }
  return { local, remote };
}

export function compareRemoteMigrationState(
  manifestTimestamps: readonly string[],
  state: RemoteMigrationState,
  expectation: 'empty' | 'exact',
): ValidationResult {
  const errors: string[] = [];
  if (state.local.length === 0 && state.remote.length === 0) {
    errors.push('No migration rows were parsed from the Supabase CLI output');
  }
  if (
    state.local.length !== manifestTimestamps.length ||
    state.local.some((timestamp, index) => timestamp !== manifestTimestamps[index])
  ) {
    errors.push('Supabase CLI local migration state does not match the frozen manifest');
  }
  const expected = new Set(manifestTimestamps);
  const unknownRemote = state.remote.filter((timestamp) => !expected.has(timestamp));
  if (unknownRemote.length > 0) {
    errors.push(`Remote migration state contains ${unknownRemote.length} unknown migration(s)`);
  }
  if (expectation === 'empty' && state.remote.length > 0) {
    errors.push('Initial production migration state is not empty');
  }
  if (
    expectation === 'exact' &&
    (state.remote.length !== manifestTimestamps.length ||
      state.remote.some((timestamp, index) => timestamp !== manifestTimestamps[index]))
  ) {
    errors.push('Remote migration state does not exactly match the frozen manifest');
  }
  return { ok: errors.length === 0, errors };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function validatePhase13DRepository(root = repositoryRoot): ValidationResult {
  const errors = [...validatePhase13CRepository(root).errors];
  const commissioningPath = join(
    root,
    'infrastructure/deployment/manifests/production-commissioning.v1.json',
  );
  const commissioning = readJson<CommissioningManifest>(commissioningPath);
  if (
    commissioning.schemaVersion !== 1 ||
    commissioning.kind !== 'starville-production-commissioning-manifest'
  ) {
    errors.push('Production commissioning manifest identity is invalid');
  }
  if (commissioning.productionMutationAuthorized) {
    errors.push('Repository manifest must not authorize a production mutation');
  }
  if (commissioning.sourceCommit.approved || commissioning.sourceCommit.sha !== null) {
    errors.push('Unapproved source commit must remain visibly unresolved');
  }
  if (commissioning.world.approvalState !== 'missing' || commissioning.world.revisionId !== null) {
    errors.push('Production world must remain blocked until an exact revision is approved');
  }
  if (commissioning.assets.approvalState !== 'pending-owner-selection') {
    errors.push('Production asset selection must remain owner-pending');
  }
  if (commissioning.backup.status !== 'missing-provider-evidence') {
    errors.push('Backup state must not claim unavailable provider evidence');
  }
  if (commissioning.publicAccess.status !== 'closed-owner-verification-pending') {
    errors.push('Public access must remain closed and owner-verification pending');
  }
  for (const [label, path, expected] of [
    [
      'Production environment manifest',
      commissioning.environmentManifest.path,
      commissioning.environmentManifest.sha256,
    ],
    ['Migration manifest', commissioning.migrations.path, commissioning.migrations.sha256],
    [
      'Reference seed manifest',
      commissioning.referenceData.seedManifest,
      commissioning.referenceData.seedSha256,
    ],
    [
      'Reference catalog manifest',
      commissioning.referenceData.catalogManifest,
      commissioning.referenceData.catalogSha256,
    ],
    ['Asset manifest', commissioning.assets.manifestPath, commissioning.assets.sha256],
    ['Audio manifest', commissioning.audio.manifestPath, commissioning.audio.manifestSha256],
  ] as const) {
    if (sha256File(join(root, path)) !== expected) {
      errors.push(`${label} SHA-256 does not match the commissioning manifest`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function printErrors(errors: readonly string[]): void {
  for (const error of errors) process.stderr.write(`${error}\n`);
}

async function verifyTarget(): Promise<void> {
  const validation = validateProductionCommissioningTarget(process.env);
  if (!validation.ok) {
    printErrors(validation.errors);
    process.exitCode = 1;
    return;
  }
  const config = await verifyCanonicalHostedTarget(process.env);
  const databaseUrl = value(process.env, 'SUPABASE_DATABASE_URL');
  if (databaseUrl === undefined) throw new Error('SUPABASE_DATABASE_URL is required');
  process.stdout.write(
    [
      'environment=production',
      `supabase_project_ref=${maskIdentifier(config.projectRef)}`,
      `supabase_host=${maskIdentifier(config.projectRef)}.supabase.co`,
      `database_host=${safeDatabaseHost(databaseUrl)}`,
      'database_name=postgres',
      `landing_host=${new URL(value(process.env, 'NEXT_PUBLIC_LANDING_URL')!).hostname}`,
      `game_host=${new URL(value(process.env, 'NEXT_PUBLIC_GAME_URL')!).hostname}`,
      `admin_host=${new URL(value(process.env, 'NEXT_PUBLIC_ADMIN_URL')!).hostname}`,
      `api_host=${new URL(value(process.env, 'NEXT_PUBLIC_API_URL')!).hostname}`,
      `realtime_host=${new URL(value(process.env, 'NEXT_PUBLIC_REALTIME_URL')!).hostname}`,
      'reown_project_classification=production',
      'solana_network=mainnet-beta',
      `token_mint=${maskIdentifier(value(process.env, 'GAME_TOKEN_MINT_ADDRESS'))}`,
      'token_metadata=derived-on-chain',
      'token_gate_display_amount=10000',
      'environment_manifest_version=1',
      'remote_write_gate=false',
      'admin_bootstrap_gate=false',
      'hosted_test_gate=false',
      'PRODUCTION TARGET VERIFIED',
    ].join('\n') + '\n',
  );
}

async function verifyToken(): Promise<void> {
  const token = await verifyProductionTokenConfiguration(process.env);
  process.stdout.write(
    [
      `token_mint=${maskIdentifier(token.mintAddress)}`,
      `token_program=${token.tokenProgram}`,
      `token_decimals=${token.decimals}`,
      `token_gate_display_amount=${token.requiredDisplayAmount}`,
      `token_gate_base_units=${token.requiredBaseUnits}`,
      `validated_slot=${token.slot}`,
      'verification_mode=read-only',
      'PRODUCTION TOKEN VERIFIED',
    ].join('\n') + '\n',
  );
}

function auditRepository(): void {
  const result = validatePhase13DRepository();
  if (!result.ok) {
    printErrors(result.errors);
    process.exitCode = 1;
    return;
  }
  const migrationManifest = readJson<MigrationManifest>(
    join(repositoryRoot, 'infrastructure/deployment/manifests/migrations.v1.json'),
  );
  process.stdout.write(
    `${JSON.stringify({
      status: 'STAGE A BLOCKED',
      sourceCommitApproved: false,
      productionTargetVerified: false,
      migrationCount: migrationManifest.entries.length,
      productionMutationAuthorized: false,
      phase14Recommendation: 'NO-GO',
    })}\n`,
  );
}

function compareMigrations(): void {
  const inputIndex = process.argv.indexOf('--input');
  const expectationIndex = process.argv.indexOf('--expect');
  const input = inputIndex < 0 ? undefined : process.argv[inputIndex + 1];
  const expectation = expectationIndex < 0 ? undefined : process.argv[expectationIndex + 1];
  if (input === undefined || (expectation !== 'empty' && expectation !== 'exact')) {
    throw new Error('Expected --input <safe-output-file> --expect empty|exact');
  }
  const manifest = readJson<MigrationManifest>(
    join(repositoryRoot, 'infrastructure/deployment/manifests/migrations.v1.json'),
  );
  const state = parseRemoteMigrationState(readFileSync(resolve(input), 'utf8'));
  const result = compareRemoteMigrationState(
    manifest.entries.map((entry) => entry.timestamp),
    state,
    expectation,
  );
  if (!result.ok) {
    printErrors(result.errors);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${JSON.stringify({ status: 'ok', expectation, local: state.local.length, remote: state.remote.length })}\n`,
  );
}

async function main(): Promise<void> {
  const operation = process.argv[2] ?? 'audit';
  if (operation === 'audit') return auditRepository();
  if (operation === 'verify-target') return verifyTarget();
  if (operation === 'verify-token') return verifyToken();
  if (operation === 'compare-migrations') return compareMigrations();
  throw new Error('Expected audit, verify-target, verify-token, or compare-migrations');
}

const entryPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (entryPath === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Phase 13D validation failed'}\n`,
    );
    process.exitCode = 1;
  });
}
