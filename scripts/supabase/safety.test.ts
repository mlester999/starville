import type { HostedSupabaseSafetyConfig } from '@starville/config/server';
import { describe, expect, it } from 'vitest';

import {
  assertExactDevelopmentHostedTarget,
  assertHostedDevelopmentFixtureWritesApproved,
  assertHostedDevelopmentTestsApproved,
  safeHostedTargetSummary,
} from './safety';

const developmentRef = 'abcdefghijklmnopqrst';
const productionRef = 'zyxwvutsrqponmlkjihg';

function config(overrides: Partial<HostedSupabaseSafetyConfig> = {}): HostedSupabaseSafetyConfig {
  return {
    environment: 'development',
    projectRef: developmentRef,
    projectHostname: `${developmentRef}.supabase.co`,
    remoteWritesApproved: false,
    hostedTestsApproved: true,
    bootstrapEnabled: false,
    ...overrides,
  };
}

const environment = {
  STARVILLE_DEPLOYMENT_TARGET: 'starville-dev',
  STARVILLE_DEVELOPMENT_SUPABASE_PROJECT_REF: developmentRef,
  STARVILLE_PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
} as const;

describe('hosted starville-dev safety', () => {
  it('accepts only the exact development target and explicit hosted-test gate', () => {
    expect(() => assertHostedDevelopmentTestsApproved(config(), environment)).not.toThrow();
    expect(() =>
      assertHostedDevelopmentTestsApproved(config({ hostedTestsApproved: false }), environment),
    ).toThrow('RUN_HOSTED_SUPABASE_TESTS');
  });

  it('requires the separate remote-write gate for isolated fixture execution', () => {
    expect(() => assertHostedDevelopmentFixtureWritesApproved(config(), environment)).toThrow(
      'SUPABASE_REMOTE_WRITES_APPROVED',
    );
    expect(() =>
      assertHostedDevelopmentFixtureWritesApproved(
        config({ remoteWritesApproved: true }),
        environment,
      ),
    ).not.toThrow();
    expect(() =>
      assertHostedDevelopmentFixtureWritesApproved(
        config({ remoteWritesApproved: true, bootstrapEnabled: true }),
        environment,
      ),
    ).toThrow('ADMIN_BOOTSTRAP_ENABLED=false');
  });

  it('rejects production targets, aliases, missing references, and matching references', () => {
    expect(() =>
      assertExactDevelopmentHostedTarget(config(), {
        ...environment,
        STARVILLE_DEPLOYMENT_TARGET: 'starville-prod',
      }),
    ).toThrow('starville-dev');
    expect(() =>
      assertExactDevelopmentHostedTarget(config({ environment: 'production' }), environment),
    ).toThrow('starville-dev');
    expect(() =>
      assertExactDevelopmentHostedTarget(config({ projectRef: productionRef }), environment),
    ).toThrow('approved starville-dev');
    expect(() =>
      assertExactDevelopmentHostedTarget(config(), {
        ...environment,
        STARVILLE_PRODUCTION_SUPABASE_PROJECT_REF: developmentRef,
      }),
    ).toThrow('must differ');
    expect(() =>
      assertExactDevelopmentHostedTarget(config(), {
        ...environment,
        STARVILLE_PRODUCTION_SUPABASE_PROJECT_REF: undefined,
      }),
    ).toThrow('valid distinct production');
    expect(() =>
      assertExactDevelopmentHostedTarget(config(), {
        ...environment,
        STARVILLE_PRODUCTION_SUPABASE_PROJECT_REF: 'OWNER_REQUIRED_PRODUCTION_REF',
      }),
    ).toThrow('valid distinct production');
  });

  it('prints only a masked target summary and no credentials', () => {
    const serialized = JSON.stringify(safeHostedTargetSummary(config()));
    expect(serialized).toContain('abcd...qrst');
    expect(serialized).not.toContain(developmentRef);
    expect(serialized).not.toMatch(/key|token|password/iu);
  });
});
