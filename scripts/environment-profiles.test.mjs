import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  loadAdminSecurityConfig,
  loadApiConfig,
  loadPrivateSupabaseConfig,
} from '../packages/config/src/server.ts';
import { ENVIRONMENT_PROFILES, selectEnvironmentProfile } from './environment-profiles.mjs';

const root = resolve(import.meta.dirname, '..');
const fixtureEnvironment = {
  PATH: process.env.PATH,
  NODE_ENV: 'development',
  LOG_LEVEL: 'debug',
  NEXT_PUBLIC_APP_ENV: 'development',
  NEXT_PUBLIC_LANDING_URL: 'http://localhost:3000',
  NEXT_PUBLIC_GAME_URL: 'http://localhost:3001',
  NEXT_PUBLIC_ADMIN_URL: 'http://localhost:3002',
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  NEXT_PUBLIC_REALTIME_URL: 'ws://localhost:4001',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anonymous-placeholder',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-placeholder',
  SUPABASE_DATABASE_URL: 'postgresql://user:password@example.invalid/starville',
  ADMIN_RECOVERY_COOKIE_SECRET: 'server-only-recovery-secret-at-least-32-characters',
  SUPABASE_REMOTE_WRITES_APPROVED: 'false',
  RUN_HOSTED_SUPABASE_TESTS: 'false',
  ADMIN_BOOTSTRAP_ENABLED: 'false',
  ADMIN_SESSION_TTL_MINUTES: '60',
};

function packageJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

describe('development environment profiles', () => {
  it('wires standard root and filtered development commands through package profiles', () => {
    expect(packageJson('package.json').scripts.dev).toBe('turbo run dev');

    const packageProfiles = {
      'apps/landing/package.json': 'landing',
      'apps/game-client/package.json': 'game-client',
      'apps/admin-portal/package.json': 'admin-portal',
      'apps/api/package.json': 'api',
      'apps/realtime-server/package.json': 'realtime-server',
      'apps/worker/package.json': 'worker',
    };

    for (const [path, profile] of Object.entries(packageProfiles)) {
      expect(packageJson(path).scripts.dev).toContain(`--profile ${profile}`);
    }
  });

  it('supplies exactly the API runtime configuration required for normal login', () => {
    const environment = selectEnvironmentProfile('api', fixtureEnvironment);

    expect(() => loadApiConfig(environment)).not.toThrow();
    expect(() => loadAdminSecurityConfig(environment)).not.toThrow();
    expect(() => loadPrivateSupabaseConfig(environment)).not.toThrow();
    expect(environment).not.toHaveProperty('SUPABASE_DATABASE_URL');
    expect(environment).not.toHaveProperty('ADMIN_RECOVERY_COOKIE_SECRET');
  });

  it('does not require or propagate maintenance gates during application runtime', () => {
    for (const profile of Object.keys(ENVIRONMENT_PROFILES)) {
      const environment = selectEnvironmentProfile(profile, fixtureEnvironment);
      expect(environment).not.toHaveProperty('SUPABASE_REMOTE_WRITES_APPROVED');
      expect(environment).not.toHaveProperty('RUN_HOSTED_SUPABASE_TESTS');
      expect(environment).not.toHaveProperty('ADMIN_BOOTSTRAP_ENABLED');
    }
  });

  it('keeps privileged Supabase values out of every browser application process', () => {
    for (const profile of ['landing', 'game-client', 'admin-portal']) {
      const environment = selectEnvironmentProfile(profile, fixtureEnvironment);
      expect(environment).not.toHaveProperty('SUPABASE_SERVICE_ROLE_KEY');
      expect(environment).not.toHaveProperty('SUPABASE_DATABASE_URL');
    }
  });

  it('limits the recovery secret to the admin portal server runtime', () => {
    expect(selectEnvironmentProfile('admin-portal', fixtureEnvironment)).toHaveProperty(
      'ADMIN_RECOVERY_COOKIE_SECRET',
    );

    for (const profile of ['landing', 'game-client', 'api', 'realtime-server', 'worker']) {
      expect(selectEnvironmentProfile(profile, fixtureEnvironment)).not.toHaveProperty(
        'ADMIN_RECOVERY_COOKIE_SECRET',
      );
    }
  });
});
