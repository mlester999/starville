import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  validateDeploymentEnvironment,
  validateEvidenceManifest,
  validateMigrationManifest,
  validatePhase13CRepository,
  validateSeedManifest,
} from './phase13c-release-readiness';

const root = resolve(import.meta.dirname, '..');

const productionEnvironment = (): NodeJS.ProcessEnv => ({
  STARVILLE_DEPLOYMENT_TARGET: 'starville-prod',
  NODE_ENV: 'production',
  NEXT_PUBLIC_APP_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  SUPABASE_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
  STARVILLE_PRODUCTION_SUPABASE_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
  STARVILLE_DEVELOPMENT_SUPABASE_PROJECT_REF: 'bbbbbbbbbbbbbbbbbbbb',
  NEXT_PUBLIC_LANDING_URL: 'https://www.starville.example',
  NEXT_PUBLIC_GAME_URL: 'https://play.starville.example',
  NEXT_PUBLIC_ADMIN_URL: 'https://admin.starville.example',
  NEXT_PUBLIC_API_URL: 'https://api.starville.example',
  NEXT_PUBLIC_REALTIME_URL: 'wss://realtime.starville.example',
  NEXT_PUBLIC_REALTIME_PROVIDER: 'custom',
  STARVILLE_BACKGROUND_JOBS_PROVIDER: 'custom',
  NEXT_PUBLIC_REOWN_PROJECT_ID: 'production-project',
  SOLANA_NETWORK: 'mainnet-beta',
  SOLANA_RPC_URL: 'https://rpc.starville.example',
  GAME_TOKEN_MINT_ADDRESS: '11111111111111111111111111111111',
  CORS_ALLOWED_ORIGINS:
    'https://www.starville.example,https://play.starville.example,https://admin.starville.example',
  REALTIME_ALLOWED_ORIGINS: 'https://play.starville.example',
  SOURCE_MAPS: 'false',
  PUBLIC_SOURCE_MAPS: 'false',
  SUPABASE_ALLOW_REMOTE_DB_WRITES: 'false',
  SUPABASE_TARGET_CONFIRMED: 'false',
  SUPABASE_REMOTE_WRITES_APPROVED: 'false',
  SUPABASE_HOSTED_TESTS_APPROVED: 'false',
  SUPABASE_ADMIN_BOOTSTRAP_ENABLED: 'false',
});

describe('Phase 13C environment separation', () => {
  it('accepts local validation with every remote safety gate disabled', () => {
    expect(
      validateDeploymentEnvironment({
        STARVILLE_DEPLOYMENT_TARGET: 'local',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ALLOW_REMOTE_DB_WRITES: 'false',
        SUPABASE_TARGET_CONFIRMED: 'false',
        SUPABASE_REMOTE_WRITES_APPROVED: 'false',
      }),
    ).toEqual({ ok: true, errors: [] });
  });

  it('accepts a complete synthetic production configuration', () => {
    expect(validateDeploymentEnvironment(productionEnvironment())).toEqual({
      ok: true,
      errors: [],
    });
  });

  it.each([
    ['localhost Supabase', { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }],
    ['wildcard CORS', { CORS_ALLOWED_ORIGINS: '*' }],
    ['development network', { SOLANA_NETWORK: 'devnet' }],
    ['unsafe remote-write gate', { SUPABASE_REMOTE_WRITES_APPROVED: 'true' }],
    ['mixed project reference', { SUPABASE_PROJECT_REF: 'bbbbbbbbbbbbbbbbbbbb' }],
    ['public source maps', { PUBLIC_SOURCE_MAPS: 'true' }],
  ])('rejects %s', (_label, override) => {
    expect(validateDeploymentEnvironment({ ...productionEnvironment(), ...override }).ok).toBe(
      false,
    );
  });

  it('never includes a supplied secret value in an error', () => {
    const secret = 'do-not-print-this-production-secret';
    const result = validateDeploymentEnvironment({
      ...productionEnvironment(),
      SUPABASE_SERVICE_ROLE_KEY: secret,
      CORS_ALLOWED_ORIGINS: '*',
    });
    expect(result.errors.join('\n')).not.toContain(secret);
  });
});

describe('Phase 13C deterministic manifests', () => {
  it('classifies every deployment-profile variable in the production environment manifest', () => {
    const profileSource = readFileSync(join(root, 'scripts/environment-profiles.mjs'), 'utf8');
    const deploymentProfiles = profileSource.slice(
      profileSource.indexOf('export const ENVIRONMENT_PROFILES'),
    );
    const names = [...deploymentProfiles.matchAll(/'([A-Z][A-Z0-9_]*)'/gu)].map(
      (match) => match[1],
    );
    const environmentManifest = readFileSync(
      join(root, 'infrastructure/deployment/manifests/production-environment.v1.json'),
      'utf8',
    );
    for (const name of new Set(names)) expect(environmentManifest).toContain(`"name": "${name}"`);
  });

  it('disables source maps in production service and browser builds', () => {
    for (const path of [
      'apps/api/tsup.config.ts',
      'apps/realtime-server/tsup.config.ts',
      'apps/worker/tsup.config.ts',
    ]) {
      expect(readFileSync(join(root, path), 'utf8')).toContain(
        "sourcemap: process.env['NODE_ENV'] !== 'production'",
      );
    }
    expect(readFileSync(join(root, 'apps/game-client/vite.config.ts'), 'utf8')).toContain(
      'sourcemap: false',
    );
  });

  it('validates the repository manifests without authorizing production', () => {
    expect(validatePhase13CRepository(root)).toEqual({ ok: true, errors: [] });
  });

  it('detects migration content drift', async () => {
    const candidate = mkdtempSync(join(tmpdir(), 'starville-phase13c-'));
    await mkdir(join(candidate, 'infrastructure/deployment/manifests'), { recursive: true });
    await mkdir(join(candidate, 'infrastructure/supabase'), { recursive: true });
    await cp(
      join(root, 'infrastructure/deployment/manifests/migrations.v1.json'),
      join(candidate, 'infrastructure/deployment/manifests/migrations.v1.json'),
    );
    await cp(
      join(root, 'infrastructure/supabase/migrations'),
      join(candidate, 'infrastructure/supabase/migrations'),
      { recursive: true },
    );
    const first = join(
      candidate,
      'infrastructure/supabase/migrations/20260710090000_admin_authorization_schema.sql',
    );
    writeFileSync(first, `${readFileSync(first, 'utf8')}\n-- drift\n`);
    expect(validateMigrationManifest(candidate).ok).toBe(false);
  });

  it('hard-fails a stale Phase 13E correction checksum', async () => {
    const candidate = mkdtempSync(join(tmpdir(), 'starville-phase13e-hash-'));
    await mkdir(join(candidate, 'infrastructure/deployment/manifests'), { recursive: true });
    await mkdir(join(candidate, 'infrastructure/supabase'), { recursive: true });
    await cp(
      join(root, 'infrastructure/deployment/manifests/migrations.v1.json'),
      join(candidate, 'infrastructure/deployment/manifests/migrations.v1.json'),
    );
    await cp(
      join(root, 'infrastructure/supabase/migrations'),
      join(candidate, 'infrastructure/supabase/migrations'),
      { recursive: true },
    );
    const manifestPath = join(candidate, 'infrastructure/deployment/manifests/migrations.v1.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      entries: { filename: string; sha256: string }[];
    };
    const correction = manifest.entries.find((entry) =>
      entry.filename.includes('phase13e_realtime_authorization_permission_fix'),
    );
    expect(correction).toBeDefined();
    correction!.sha256 = '0'.repeat(64);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    expect(validateMigrationManifest(candidate).errors).toContain(
      'Migration content hash has drifted at 87',
    );
  });

  it('keeps production reference seeds deterministic, data-free, and fail-closed', () => {
    expect(validateSeedManifest(root)).toEqual({ ok: true, errors: [] });
  });

  it('accepts truthful incomplete evidence without calling it production-ready', () => {
    expect(validateEvidenceManifest(root)).toEqual({ ok: true, errors: [] });
    const evidence = JSON.parse(
      readFileSync(
        join(root, 'infrastructure/deployment/manifests/release-evidence.v1.json'),
        'utf8',
      ),
    ) as { productionReady: boolean };
    expect(evidence.productionReady).toBe(false);
  });
});
