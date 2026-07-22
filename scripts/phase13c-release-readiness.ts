import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEPLOYMENT_TARGETS = ['local', 'test', 'starville-dev', 'starville-prod'] as const;
export type DeploymentTarget = (typeof DEPLOYMENT_TARGETS)[number];

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

interface MigrationManifestEntry {
  readonly sequence: number;
  readonly filename: string;
  readonly timestamp: string;
  readonly sha256: string;
  readonly dependsOn: string | null;
}

interface MigrationManifest {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly entries: readonly MigrationManifestEntry[];
}

interface SeedSource {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly classification: string;
  readonly selection: string;
  readonly activation: string;
}

interface SeedManifest {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly status: string;
  readonly policy: {
    readonly playerDataAllowed: boolean;
    readonly syntheticAccountsAllowed: boolean;
    readonly developmentUrlsAllowed: boolean;
    readonly secretsAllowed: boolean;
    readonly productionExecutionAuthorized: boolean;
  };
  readonly sources: readonly SeedSource[];
}

interface EvidenceItem {
  readonly id: string;
  readonly status: string;
  readonly evidence: string | null;
  readonly blocker: string | null;
}

interface EvidenceManifest {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly productionReady: boolean;
  readonly items: readonly EvidenceItem[];
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function present(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value === '' ? undefined : value;
}

function isEnabled(environment: NodeJS.ProcessEnv, name: string): boolean {
  return present(environment, name)?.toLowerCase() === 'true';
}

function projectRefFromSupabaseUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const hostname = new URL(value).hostname;
    const match = /^([a-z0-9]{20})\.supabase\.co$/u.exec(hostname);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function hasLocalHostname(value: string | undefined): boolean {
  if (value === undefined) return false;
  try {
    const hostname = new URL(value).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function isSecureUrl(value: string | undefined, websocket = false): boolean {
  if (value === undefined) return false;
  try {
    const protocol = new URL(value).protocol;
    return websocket ? protocol === 'wss:' : protocol === 'https:';
  } catch {
    return false;
  }
}

function exactOrigins(value: string | undefined): boolean {
  if (value === undefined || value.includes('*')) return false;
  const origins = value.split(',').map((origin) => origin.trim());
  return (
    origins.length > 0 &&
    origins.every((origin) => isSecureUrl(origin) && new URL(origin).origin === origin)
  );
}

/** Validates separation controls without returning or logging environment values. */
export function validateDeploymentEnvironment(environment: NodeJS.ProcessEnv): ValidationResult {
  const errors: string[] = [];
  const requestedTarget = present(environment, 'STARVILLE_DEPLOYMENT_TARGET') ?? 'local';
  if (!DEPLOYMENT_TARGETS.includes(requestedTarget as DeploymentTarget)) {
    return { ok: false, errors: ['STARVILLE_DEPLOYMENT_TARGET is invalid'] };
  }
  const target = requestedTarget as DeploymentTarget;
  const production = target === 'starville-prod';
  const hosted = target === 'starville-dev' || production;

  const safetyGates = [
    'SUPABASE_ALLOW_REMOTE_DB_WRITES',
    'SUPABASE_TARGET_CONFIRMED',
    'SUPABASE_REMOTE_WRITES_APPROVED',
    'SUPABASE_HOSTED_TESTS_APPROVED',
    'SUPABASE_ADMIN_BOOTSTRAP_ENABLED',
    'RUN_HOSTED_SUPABASE_TESTS',
    'ADMIN_BOOTSTRAP_ENABLED',
  ];
  for (const name of safetyGates) {
    if (isEnabled(environment, name)) errors.push(`${name} must be false during validation`);
  }

  const supabaseUrl = present(environment, 'NEXT_PUBLIC_SUPABASE_URL');
  const configuredRef = present(environment, 'SUPABASE_PROJECT_REF');
  const urlRef = projectRefFromSupabaseUrl(supabaseUrl);
  if (configuredRef !== undefined && urlRef !== undefined && configuredRef !== urlRef) {
    errors.push('Supabase URL and project reference do not match');
  }

  if (hosted && hasLocalHostname(supabaseUrl))
    errors.push('Hosted target cannot use localhost Supabase');
  if (hosted && !isSecureUrl(supabaseUrl)) errors.push('Hosted Supabase URL must use HTTPS');

  if (production) {
    const required = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_PROJECT_REF',
      'STARVILLE_PRODUCTION_SUPABASE_PROJECT_REF',
      'STARVILLE_DEVELOPMENT_SUPABASE_PROJECT_REF',
      'NEXT_PUBLIC_LANDING_URL',
      'NEXT_PUBLIC_GAME_URL',
      'NEXT_PUBLIC_ADMIN_URL',
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_REALTIME_URL',
      'NEXT_PUBLIC_REOWN_PROJECT_ID',
      'SOLANA_RPC_URL',
      'GAME_TOKEN_MINT_ADDRESS',
      'CORS_ALLOWED_ORIGINS',
      'REALTIME_ALLOWED_ORIGINS',
    ] as const;
    for (const name of required) {
      const value = present(environment, name);
      if (value === undefined || value.includes('OWNER_REQUIRED')) {
        errors.push(`${name} requires an owner-approved production value`);
      }
    }
    if (present(environment, 'NODE_ENV') !== 'production') {
      errors.push('NODE_ENV must be production for starville-prod');
    }
    if (present(environment, 'NEXT_PUBLIC_APP_ENV') !== 'production') {
      errors.push('NEXT_PUBLIC_APP_ENV must be production for starville-prod');
    }
    if (present(environment, 'SOLANA_NETWORK') !== 'mainnet-beta') {
      errors.push('SOLANA_NETWORK must be mainnet-beta for starville-prod');
    }
    if (
      present(environment, 'SUPABASE_PROJECT_REF') !==
      present(environment, 'STARVILLE_PRODUCTION_SUPABASE_PROJECT_REF')
    ) {
      errors.push('Configured Supabase project is not the approved production project');
    }
    if (
      present(environment, 'SUPABASE_PROJECT_REF') ===
      present(environment, 'STARVILLE_DEVELOPMENT_SUPABASE_PROJECT_REF')
    ) {
      errors.push('Production and development Supabase project references must differ');
    }
    for (const name of [
      'NEXT_PUBLIC_LANDING_URL',
      'NEXT_PUBLIC_GAME_URL',
      'NEXT_PUBLIC_ADMIN_URL',
      'NEXT_PUBLIC_API_URL',
      'SOLANA_RPC_URL',
    ]) {
      const value = present(environment, name);
      if (hasLocalHostname(value) || !isSecureUrl(value))
        errors.push(`${name} must be an exact HTTPS production URL`);
    }
    const realtimeUrl = present(environment, 'NEXT_PUBLIC_REALTIME_URL');
    if (hasLocalHostname(realtimeUrl) || !isSecureUrl(realtimeUrl, true)) {
      errors.push('NEXT_PUBLIC_REALTIME_URL must be an exact WSS production URL');
    }
    if (!exactOrigins(present(environment, 'CORS_ALLOWED_ORIGINS'))) {
      errors.push('CORS_ALLOWED_ORIGINS must contain exact HTTPS origins without wildcards');
    }
    if (!exactOrigins(present(environment, 'REALTIME_ALLOWED_ORIGINS'))) {
      errors.push('REALTIME_ALLOWED_ORIGINS must contain exact HTTPS origins without wildcards');
    }
    if (isEnabled(environment, 'SOURCE_MAPS') || isEnabled(environment, 'PUBLIC_SOURCE_MAPS')) {
      errors.push('Public production source maps must be disabled');
    }
    if (present(environment, 'DEBUG') !== undefined)
      errors.push('DEBUG must be unset in production');
  }

  return { ok: errors.length === 0, errors };
}

export function assertDeploymentEnvironment(environment: NodeJS.ProcessEnv): void {
  const result = validateDeploymentEnvironment(environment);
  if (!result.ok) throw new Error(result.errors.join('; '));
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function validateMigrationManifest(root = repositoryRoot): ValidationResult {
  const errors: string[] = [];
  const migrationDirectory = join(root, 'infrastructure/supabase/migrations');
  const manifestPath = join(root, 'infrastructure/deployment/manifests/migrations.v1.json');
  const files = readdirSync(migrationDirectory)
    .filter((name) => /^\d{14}_.+\.sql$/u.test(name))
    .sort();
  const manifest = readJson<MigrationManifest>(manifestPath);

  if (manifest.schemaVersion !== 1 || manifest.kind !== 'starville-postgres-migration-manifest') {
    errors.push('Migration manifest identity is invalid');
  }
  if (manifest.entries.length !== files.length)
    errors.push('Migration manifest file count has drifted');
  const timestamps = new Set<string>();
  for (const [index, filename] of files.entries()) {
    const entry = manifest.entries[index];
    if (entry === undefined) continue;
    if (entry.sequence !== index + 1) errors.push(`Migration sequence is invalid at ${index + 1}`);
    if (entry.filename !== filename) errors.push(`Migration order has drifted at ${index + 1}`);
    if (entry.timestamp !== filename.slice(0, 14))
      errors.push(`Migration timestamp is invalid at ${index + 1}`);
    if (timestamps.has(entry.timestamp))
      errors.push(`Migration timestamp collision at ${index + 1}`);
    timestamps.add(entry.timestamp);
    const expectedParent = index === 0 ? null : files[index - 1];
    if (entry.dependsOn !== expectedParent)
      errors.push(`Migration dependency is invalid at ${index + 1}`);
    if (entry.sha256 !== sha256(join(migrationDirectory, filename))) {
      errors.push(`Migration content hash has drifted at ${index + 1}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateSeedManifest(root = repositoryRoot): ValidationResult {
  const errors: string[] = [];
  const manifestPath = join(
    root,
    'infrastructure/deployment/manifests/production-reference-seeds.v1.json',
  );
  const manifest = readJson<SeedManifest>(manifestPath);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== 'starville-production-reference-seed-manifest'
  ) {
    errors.push('Reference seed manifest identity is invalid');
  }
  if (
    manifest.policy.playerDataAllowed ||
    manifest.policy.syntheticAccountsAllowed ||
    manifest.policy.developmentUrlsAllowed ||
    manifest.policy.secretsAllowed ||
    manifest.policy.productionExecutionAuthorized
  ) {
    errors.push('Reference seed policy authorizes prohibited production data or execution');
  }
  const identifiers = new Set<string>();
  for (const source of manifest.sources) {
    if (identifiers.has(source.id)) errors.push('Reference seed identifiers must be unique');
    identifiers.add(source.id);
    if (source.path.includes('..') || source.path.startsWith('/')) {
      errors.push(`Reference seed path is unsafe for ${source.id}`);
      continue;
    }
    const absolutePath = join(root, source.path);
    if (!existsSync(absolutePath)) {
      errors.push(`Reference seed source is missing for ${source.id}`);
      continue;
    }
    if (
      source.sha256 !== 'DERIVED_AND_VALIDATED_FROM_EACH_ORDERED_ENTRY' &&
      source.sha256 !== sha256(absolutePath)
    ) {
      errors.push(`Reference seed content hash has drifted for ${source.id}`);
    }
    const serialized = JSON.stringify(source).toLowerCase();
    if (
      serialized.includes('player@example') ||
      serialized.includes('localhost') ||
      serialized.includes('service_role')
    ) {
      errors.push(`Reference seed source contains a prohibited data marker for ${source.id}`);
    }
    if (source.classification.includes('candidate') && source.activation !== 'not-authorized') {
      errors.push(`Unaccepted candidate activation is not fail-closed for ${source.id}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateEvidenceManifest(root = repositoryRoot): ValidationResult {
  const errors: string[] = [];
  const manifest = readJson<EvidenceManifest>(
    join(root, 'infrastructure/deployment/manifests/release-evidence.v1.json'),
  );
  const allowed = new Set(['present', 'accepted', 'missing', 'pending-owner']);
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'starville-release-evidence-bundle') {
    errors.push('Release evidence manifest identity is invalid');
  }
  for (const item of manifest.items) {
    if (!allowed.has(item.status)) errors.push(`Evidence status is invalid for ${item.id}`);
    if ((item.status === 'missing' || item.status === 'pending-owner') && item.blocker === null) {
      errors.push(`Pending evidence must name its blocker for ${item.id}`);
    }
    if ((item.status === 'present' || item.status === 'accepted') && item.evidence === null) {
      errors.push(`Completed evidence must name its source for ${item.id}`);
    }
    if (item.evidence !== null && !existsSync(join(root, item.evidence))) {
      errors.push(`Evidence source is missing for ${item.id}`);
    }
  }
  const incomplete = manifest.items.some(
    (item) => item.status !== 'present' && item.status !== 'accepted',
  );
  if (manifest.productionReady && incomplete)
    errors.push('Evidence manifest claims readiness while gates are incomplete');
  return { ok: errors.length === 0, errors };
}

export function validateProductionEnvironmentManifest(root = repositoryRoot): ValidationResult {
  const errors: string[] = [];
  const path = join(root, 'infrastructure/deployment/manifests/production-environment.v1.json');
  const content = readFileSync(path, 'utf8');
  const manifest = readJson<{
    schemaVersion: number;
    kind: string;
    environment: string;
    variables: readonly { name: string; classification: string; exposure: string; owner: string }[];
    prohibitedVariables: readonly string[];
  }>(path);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== 'starville-production-environment-contract'
  ) {
    errors.push('Production environment manifest identity is invalid');
  }
  if (manifest.environment !== 'starville-prod')
    errors.push('Production environment manifest targets the wrong environment');
  for (const name of [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DATABASE_URL',
    'NEXT_PUBLIC_REOWN_PROJECT_ID',
    'CORS_ALLOWED_ORIGINS',
  ]) {
    if (
      !manifest.variables.some(
        (item) => item.name === name && item.owner !== '' && item.exposure !== '',
      )
    ) {
      errors.push(`Production environment manifest does not classify ${name}`);
    }
  }
  if (!manifest.prohibitedVariables.includes('VITE_SUPABASE_SERVICE_ROLE_KEY')) {
    errors.push('Production environment manifest does not prohibit browser service-role exposure');
  }
  if (/eyJ[a-zA-Z0-9_-]{20,}\.|postgres(?:ql)?:\/\/[^\s"]+:[^\s"@]+@/u.test(content)) {
    errors.push('Production environment manifest appears to contain credential material');
  }
  return { ok: errors.length === 0, errors };
}

export function validatePhase13CRepository(root = repositoryRoot): ValidationResult {
  const results = [
    validateProductionEnvironmentManifest(root),
    validateMigrationManifest(root),
    validateSeedManifest(root),
    validateEvidenceManifest(root),
  ];
  const errors = results.flatMap((result) => result.errors);
  return { ok: errors.length === 0, errors };
}

function main(): void {
  const repository = validatePhase13CRepository();
  const environment = validateDeploymentEnvironment(process.env);
  const errors = [...repository.errors, ...environment.errors];
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
    return;
  }
  const migrationManifest = readJson<MigrationManifest>(
    join(repositoryRoot, 'infrastructure/deployment/manifests/migrations.v1.json'),
  );
  const seedManifest = readJson<SeedManifest>(
    join(repositoryRoot, 'infrastructure/deployment/manifests/production-reference-seeds.v1.json'),
  );
  process.stdout.write(
    `${JSON.stringify({
      status: 'ok',
      deploymentTarget: present(process.env, 'STARVILLE_DEPLOYMENT_TARGET') ?? 'local',
      migrationCount: migrationManifest.entries.length,
      seedSourceCount: seedManifest.sources.length,
      productionConnectionAttempted: false,
      productionWriteAttempted: false,
    })}\n`,
  );
}

const entryPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (entryPath === import.meta.url) main();

export function relativeToRepository(path: string): string {
  return relative(repositoryRoot, path);
}
