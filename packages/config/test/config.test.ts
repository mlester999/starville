import { describe, expect, it } from 'vitest';

import { parsePublicBrowserConfig } from '../src/browser';
import {
  assertAdminBootstrapWriteApproved,
  assertDatabaseUrlMatchesProjectRef,
  assertHostedTestsApproved,
  assertRemoteMigrationWriteApproved,
  loadAdminSecurityConfig,
  loadAdminRecoveryConfig,
  loadApiConfig,
  loadHostedSupabaseSafetyConfig,
  loadPrivateSupabaseConfig,
  loadRealtimeConfig,
  loadWorkerConfig,
} from '../src/server';

const validBrowserInput = {
  application: 'game-client',
  environment: 'development',
  appUrl: 'http://localhost:3001',
  apiUrl: 'http://localhost:4000',
  realtimeUrl: 'ws://localhost:4001',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'public-anonymous-placeholder',
} as const;

describe('public browser configuration', () => {
  it('returns only browser-safe normalized fields', () => {
    expect(parsePublicBrowserConfig(validBrowserInput)).toEqual({
      application: 'game-client',
      environment: 'development',
      appUrl: 'http://localhost:3001',
      apiUrl: 'http://localhost:4000',
      realtimeUrl: 'ws://localhost:4001',
      supabase: {
        url: 'https://example.supabase.co',
        anonKey: 'public-anonymous-placeholder',
      },
    });
  });

  it('rejects unknown fields so server secrets cannot leak into the public object', () => {
    expect(() =>
      parsePublicBrowserConfig({
        ...validBrowserInput,
        serviceRoleKey: 'must-not-be-public',
      } as typeof validBrowserInput),
    ).toThrow();
  });

  it('rejects invalid required public URLs', () => {
    expect(() => parsePublicBrowserConfig({ ...validBrowserInput, apiUrl: 'not-a-url' })).toThrow();
  });
});

describe('service configuration', () => {
  it('loads deterministic development defaults', () => {
    expect(loadApiConfig({})).toEqual({
      application: 'api',
      environment: 'development',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
      ],
      logLevel: 'debug',
    });

    expect(loadRealtimeConfig({}).connectionLimit).toBe(100);
    expect(loadWorkerConfig({}).retry).toEqual({ maxAttempts: 3, baseDelayMs: 1000 });
  });

  it('rejects invalid application ports', () => {
    expect(() => loadApiConfig({ API_PORT: '0' })).toThrow();
    expect(() => loadRealtimeConfig({ REALTIME_PORT: '65536' })).toThrow();
    expect(() => loadWorkerConfig({ WORKER_HEALTH_PORT: 'not-a-port' })).toThrow();
  });

  it('requires an explicit production origin allowlist', () => {
    expect(() => loadApiConfig({ NODE_ENV: 'production' })).toThrow(
      'CORS_ALLOWED_ORIGINS is required in production',
    );
  });

  it('rejects invalid real-time and worker limits', () => {
    expect(() => loadRealtimeConfig({ REALTIME_MAX_CONNECTIONS: '0' })).toThrow();
    expect(() => loadWorkerConfig({ WORKER_CONCURRENCY: '-1' })).toThrow();
  });

  it('validates bind hosts and accepts explicit deployment hosts', () => {
    expect(loadApiConfig({ API_HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
    expect(() => loadRealtimeConfig({ REALTIME_HOST: 'http://localhost' })).toThrow();
  });
});

describe('private server configuration', () => {
  it('loads privileged Supabase fields only through the server entry', () => {
    expect(
      loadPrivateSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-placeholder',
        SUPABASE_DATABASE_URL: 'postgresql://localhost/starville',
      }),
    ).toEqual({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'server-only-placeholder',
      databaseUrl: 'postgresql://localhost/starville',
    });
  });

  it('fails clearly when required API Supabase variables are genuinely absent', () => {
    expect(() => loadPrivateSupabaseConfig({})).toThrow(
      'NEXT_PUBLIC_SUPABASE_URL is required by the API',
    );
    expect(() =>
      loadPrivateSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      }),
    ).toThrow('SUPABASE_SERVICE_ROLE_KEY is required by the API');
  });

  it('loads bounded administrator security controls', () => {
    expect(loadAdminSecurityConfig({})).toEqual({
      sessionTtlMinutes: 60,
      requireMfaByDefault: false,
    });
    expect(() => loadAdminSecurityConfig({ ADMIN_SESSION_TTL_MINUTES: '0' })).toThrow();
    expect(() => loadAdminSecurityConfig({ ADMIN_SESSION_TTL_MINUTES: '61' })).toThrow();
    expect(() => loadAdminSecurityConfig({ ADMIN_REQUIRE_MFA_BY_DEFAULT: 'yes' })).toThrow(
      'ADMIN_REQUIRE_MFA_BY_DEFAULT must be either true or false',
    );
  });

  it('requires a high-entropy-length server-only recovery-cookie secret', () => {
    expect(
      loadAdminRecoveryConfig({
        ADMIN_RECOVERY_COOKIE_SECRET: 'a-development-secret-with-32-characters',
      }),
    ).toEqual({ cookieSigningSecret: 'a-development-secret-with-32-characters' });
    expect(() => loadAdminRecoveryConfig({ ADMIN_RECOVERY_COOKIE_SECRET: 'too-short' })).toThrow(
      'at least 32 characters',
    );
  });

  it('verifies the hosted development project without disclosing secrets', () => {
    expect(
      loadHostedSupabaseSafetyConfig({
        SUPABASE_ENVIRONMENT: 'development',
        SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
        NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_REMOTE_WRITES_APPROVED: 'true',
        RUN_HOSTED_SUPABASE_TESTS: 'false',
      }),
    ).toEqual({
      environment: 'development',
      projectRef: 'abcdefghijklmnopqrst',
      projectHostname: 'abcdefghijklmnopqrst.supabase.co',
      remoteWritesApproved: true,
      hostedTestsApproved: false,
      bootstrapEnabled: false,
    });
  });

  it('rejects production, target mismatch, and ambiguous approval values', () => {
    const valid = {
      SUPABASE_ENVIRONMENT: 'development',
      SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
      NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    };

    expect(() =>
      loadHostedSupabaseSafetyConfig({ ...valid, SUPABASE_ENVIRONMENT: 'production' }),
    ).toThrow();
    expect(() =>
      loadHostedSupabaseSafetyConfig({
        ...valid,
        NEXT_PUBLIC_SUPABASE_URL: 'https://differentprojectref.supabase.co',
      }),
    ).toThrow('does not match');
    expect(() =>
      loadHostedSupabaseSafetyConfig({ ...valid, SUPABASE_REMOTE_WRITES_APPROVED: '1' }),
    ).toThrow('must be either true or false');
  });

  it('requires independent explicit approvals for writes, tests, and bootstrap', () => {
    const base = {
      environment: 'development',
      projectRef: 'abcdefghijklmnopqrst',
      projectHostname: 'abcdefghijklmnopqrst.supabase.co',
      remoteWritesApproved: false,
      hostedTestsApproved: false,
      bootstrapEnabled: false,
    } as const;

    expect(() => assertRemoteMigrationWriteApproved(base)).toThrow(
      'SUPABASE_REMOTE_WRITES_APPROVED is not true',
    );
    expect(() => assertHostedTestsApproved(base)).toThrow('RUN_HOSTED_SUPABASE_TESTS is not true');
    expect(() =>
      assertAdminBootstrapWriteApproved({ ...base, remoteWritesApproved: true }),
    ).toThrow('ADMIN_BOOTSTRAP_ENABLED is not true');
    expect(() =>
      assertAdminBootstrapWriteApproved({
        ...base,
        remoteWritesApproved: true,
        bootstrapEnabled: true,
      }),
    ).not.toThrow();
  });

  it('binds direct and pooled database URLs to the verified project reference', () => {
    const projectRef = 'abcdefghijklmnopqrst';

    expect(() =>
      assertDatabaseUrlMatchesProjectRef(
        `postgresql://postgres:placeholder@db.${projectRef}.supabase.co:5432/postgres`,
        projectRef,
      ),
    ).not.toThrow();
    expect(() =>
      assertDatabaseUrlMatchesProjectRef(
        `postgresql://postgres.${projectRef}:placeholder@aws-0-region.pooler.supabase.com:5432/postgres`,
        projectRef,
      ),
    ).not.toThrow();
    expect(() =>
      assertDatabaseUrlMatchesProjectRef(
        'postgresql://postgres.differentprojectref:placeholder@aws-0-region.pooler.supabase.com:5432/postgres',
        projectRef,
      ),
    ).toThrow('does not match');
  });
});
