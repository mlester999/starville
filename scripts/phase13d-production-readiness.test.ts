import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  compareRemoteMigrationState,
  maskIdentifier,
  parseRemoteMigrationState,
  validatePhase13DRepository,
  validateProductionCommissioningTarget,
  verifyProductionTokenConfiguration,
} from './phase13d-production-readiness';

const root = resolve(import.meta.dirname, '..');

const production = (): NodeJS.ProcessEnv => ({
  STARVILLE_DEPLOYMENT_TARGET: 'starville-prod',
  NODE_ENV: 'production',
  NEXT_PUBLIC_APP_ENV: 'production',
  SUPABASE_ENVIRONMENT: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  SUPABASE_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
  STARVILLE_PRODUCTION_SUPABASE_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
  STARVILLE_DEVELOPMENT_SUPABASE_PROJECT_REF: 'bbbbbbbbbbbbbbbbbbbb',
  SUPABASE_DATABASE_URL:
    'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:placeholder@pooler.supabase.com:5432/postgres',
  NEXT_PUBLIC_LANDING_URL: 'https://www.starville.example',
  NEXT_PUBLIC_GAME_URL: 'https://play.starville.example',
  NEXT_PUBLIC_ADMIN_URL: 'https://admin.starville.example',
  NEXT_PUBLIC_API_URL: 'https://api.starville.example',
  NEXT_PUBLIC_REALTIME_URL: 'wss://realtime.starville.example',
  NEXT_PUBLIC_REALTIME_PROVIDER: 'custom',
  STARVILLE_BACKGROUND_JOBS_PROVIDER: 'custom',
  STARVILLE_PRODUCTION_LANDING_URL: 'https://www.starville.example',
  STARVILLE_PRODUCTION_GAME_URL: 'https://play.starville.example',
  STARVILLE_PRODUCTION_ADMIN_URL: 'https://admin.starville.example',
  STARVILLE_PRODUCTION_API_URL: 'https://api.starville.example',
  STARVILLE_PRODUCTION_REALTIME_URL: 'wss://realtime.starville.example',
  NEXT_PUBLIC_REOWN_PROJECT_ID: 'production-reown-project',
  STARVILLE_PRODUCTION_REOWN_PROJECT_ID: 'production-reown-project',
  STARVILLE_DEVELOPMENT_REOWN_PROJECT_ID: 'development-reown-project',
  SOLANA_NETWORK: 'mainnet-beta',
  SOLANA_RPC_URL: 'https://rpc.starville.example',
  GAME_TOKEN_MINT_ADDRESS: 'So11111111111111111111111111111111111111112',
  GAME_TOKEN_GATE_AMOUNT: '10000',
  STARVILLE_PRODUCTION_ENVIRONMENT_MANIFEST_VERSION: '1',
  CORS_ALLOWED_ORIGINS:
    'https://www.starville.example,https://play.starville.example,https://admin.starville.example',
  REALTIME_ALLOWED_ORIGINS: 'https://play.starville.example',
  SUPABASE_REMOTE_WRITES_APPROVED: 'false',
  RUN_HOSTED_SUPABASE_TESTS: 'false',
  ADMIN_BOOTSTRAP_ENABLED: 'false',
});

describe('Phase 13D production target validation', () => {
  it('accepts a complete synthetic, separated, gate-closed target', () => {
    expect(validateProductionCommissioningTarget(production())).toEqual({ ok: true, errors: [] });
  });

  it.each([
    ['development project', { SUPABASE_PROJECT_REF: 'bbbbbbbbbbbbbbbbbbbb' }],
    ['development Reown project', { NEXT_PUBLIC_REOWN_PROJECT_ID: 'development-reown-project' }],
    ['invalid mint', { GAME_TOKEN_MINT_ADDRESS: 'not-a-solana-public-key' }],
    ['placeholder mint', { GAME_TOKEN_MINT_ADDRESS: '11111111111111111111111111111111' }],
    ['wrong gate', { GAME_TOKEN_GATE_AMOUNT: '1000' }],
    ['wrong game domain', { NEXT_PUBLIC_GAME_URL: 'https://wrong.starville.example' }],
    ['premature realtime cutover', { NEXT_PUBLIC_REALTIME_PROVIDER: 'supabase' }],
    ['premature worker cutover', { STARVILLE_BACKGROUND_JOBS_PROVIDER: 'supabase' }],
    [
      'wrong database',
      {
        SUPABASE_DATABASE_URL:
          'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:placeholder@pooler.supabase.com:5432/template1',
      },
    ],
    ['write gate', { SUPABASE_REMOTE_WRITES_APPROVED: 'true' }],
    ['bootstrap gate', { ADMIN_BOOTSTRAP_ENABLED: 'true' }],
  ])('rejects %s', (_label, override) => {
    expect(validateProductionCommissioningTarget({ ...production(), ...override }).ok).toBe(false);
  });

  it('never includes supplied secret values in validation errors', () => {
    const secret = 'do-not-print-production-password';
    const result = validateProductionCommissioningTarget({
      ...production(),
      SUPABASE_DATABASE_URL: `postgresql://postgres.wrongprojectrefxxxx:placeholder@pooler.supabase.com:5432/${secret}`,
    });
    expect(result.errors.join('\n')).not.toContain(secret);
  });

  it('rejects obsolete manual mint metadata without requiring it', () => {
    expect(validateProductionCommissioningTarget(production())).toEqual({ ok: true, errors: [] });
    const stale = validateProductionCommissioningTarget({
      ...production(),
      STARVILLE_PRODUCTION_TOKEN_PROGRAM: 'spl-token',
      STARVILLE_PRODUCTION_TOKEN_DECIMALS: '6',
    });

    expect(stale.ok).toBe(false);
    expect(stale.errors.join('\n')).toContain('is obsolete and must be removed');
  });

  it('derives program, decimals, and 10,000-token base units using read-only Mainnet RPC calls', async () => {
    const mintData = Buffer.alloc(82);
    mintData.writeUInt8(6, 44);
    mintData.writeUInt8(1, 45);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: {
              context: { slot: 123 },
              value: {
                executable: false,
                lamports: 1_461_600,
                owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
                rentEpoch: 100,
                data: [mintData.toString('base64'), 'base64'],
              },
            },
          }),
        ),
      );

    await expect(verifyProductionTokenConfiguration(production(), fetch)).resolves.toEqual({
      mintAddress: production()['GAME_TOKEN_MINT_ADDRESS'],
      tokenProgram: 'spl-token-2022',
      decimals: 6,
      requiredDisplayAmount: '10000',
      requiredBaseUnits: '10000000000',
      slot: 123,
    });
    const methods = fetch.mock.calls.map(([, request]) => {
      const body = JSON.parse(String(request?.body)) as { method: string };
      return body.method;
    });
    expect(methods).toEqual(['getGenesisHash', 'getAccountInfo']);
    expect(methods).not.toContain('sendTransaction');
  });

  it('masks release identifiers', () => {
    expect(maskIdentifier('abcdefghijklmnopqrst')).toBe('abcd...qrst');
  });
});

describe('Phase 13D repository commissioning package', () => {
  it('validates without authorizing production', () => {
    expect(validatePhase13DRepository(root)).toEqual({ ok: true, errors: [] });
  });

  it('ships separate fail-closed templates for all six applications', () => {
    for (const name of [
      'landing',
      'game-client',
      'admin-portal',
      'api',
      'realtime-server',
      'worker',
    ]) {
      const template = readFileSync(
        join(root, `infrastructure/deployment/templates/${name}.production.env.example`),
        'utf8',
      );
      expect(template).toContain('STARVILLE_DEPLOYMENT_TARGET=starville-prod');
      expect(template).toContain('NODE_ENV=production');
      expect(template).not.toContain('localhost');
      expect(template).not.toMatch(/(?:CORS|ORIGINS)[^\n]*=\*/u);
      for (const gate of [
        'SUPABASE_REMOTE_WRITES_APPROVED',
        'RUN_HOSTED_SUPABASE_TESTS',
        'ADMIN_BOOTSTRAP_ENABLED',
      ]) {
        expect(template).toContain(`${gate}=false`);
        expect(template).not.toContain(`${gate}=true`);
      }
    }
  });

  it('ships a CA-only API template and no obsolete token metadata placeholders', () => {
    const apiTemplate = readFileSync(
      join(root, 'infrastructure/deployment/templates/api.production.env.example'),
      'utf8',
    );
    const environmentManifest = readFileSync(
      join(root, 'infrastructure/deployment/manifests/production-environment.v1.json'),
      'utf8',
    );

    expect(apiTemplate).toContain('GAME_TOKEN_MINT_ADDRESS=OWNER_REQUIRED_PUMP_FUN_CA');
    expect(apiTemplate).toContain('GAME_TOKEN_GATE_AMOUNT=10000');
    expect(`${apiTemplate}\n${environmentManifest}`).not.toMatch(
      /STARVILLE_PRODUCTION_TOKEN_(?:MINT_ADDRESS|PROGRAM|DECIMALS)|OWNER_REQUIRED_(?:SPL_TOKEN_PROGRAM|TOKEN_DECIMALS)/u,
    );
  });

  it('keeps the world, release freeze, production mutation, and public launch blocked', () => {
    const manifest = readFileSync(
      join(root, 'infrastructure/deployment/manifests/production-commissioning.v1.json'),
      'utf8',
    );
    expect(manifest).toContain('"status": "stage-a-blocked"');
    expect(manifest).toContain('"productionMutationAuthorized": false');
    expect(manifest).toContain('"revisionId": null');
    expect(manifest).toContain('"openingAuthorized": false');
  });

  it('documents 21 separate owner command checkpoints without claiming execution', () => {
    const commands = readFileSync(
      join(root, 'docs/deployment/phase-13d-owner-commands.md'),
      'utf8',
    );
    const headings = [...commands.matchAll(/^## (\d+)\. /gmu)].map((match) => Number(match[1]));
    expect(headings).toEqual(Array.from({ length: 21 }, (_, index) => index + 1));
    expect(commands).toContain('Codex did not run them');
    for (const block of commands.split(/^## \d+\. /gmu).slice(1)) {
      expect(block).toMatch(
        /```sh\ncd -- '\/Users\/marklesteracak\/Documents\/Marky Files\/Programming\/starville'/u,
      );
      expect(block).toContain('Expected');
      expect(block).toContain('Stop');
      expect(block).toContain('Rollback');
      expect(block).toContain('Evidence');
    }
  });

  it('keeps the required 119-section final report complete and contiguous', () => {
    const report = readFileSync(join(root, 'docs/deployment/phase-13d-final-report.md'), 'utf8');
    const headings = [...report.matchAll(/^## (\d+)\. /gmu)].map((match) => Number(match[1]));
    expect(headings).toEqual(Array.from({ length: 119 }, (_, index) => index + 1));
    expect(report).toContain('PHASE 13D BLOCKED');
    expect(report).toContain('NO-GO FOR PHASE 14');
  });
});

describe('Phase 13D migration-state parser', () => {
  const manifest = ['20260710090000', '20260710091000'];

  it('parses clean initial and exact post-push Supabase CLI tables', () => {
    const empty = parseRemoteMigrationState(
      `\n Local | Remote | Time\n 20260710090000 | | x\n 20260710091000 | | y\n`,
    );
    expect(compareRemoteMigrationState(manifest, empty, 'empty')).toEqual({ ok: true, errors: [] });

    const exact = parseRemoteMigrationState(
      `\n 20260710090000 | 20260710090000 | x\n 20260710091000 | 20260710091000 | y\n`,
    );
    expect(compareRemoteMigrationState(manifest, exact, 'exact')).toEqual({ ok: true, errors: [] });
  });

  it('blocks unknown remote, missing local, and incomplete post-push states', () => {
    const state = parseRemoteMigrationState(
      `\n 20260710090000 | 20260710090000 | x\n | 20260710199999 | y\n`,
    );
    const result = compareRemoteMigrationState(manifest, state, 'exact');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('unknown migration');
  });
});
