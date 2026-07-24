import { readFile } from 'node:fs/promises';

import {
  assertHostedTestsApproved,
  assertRemoteMigrationWriteApproved,
  loadHostedSupabaseSafetyConfig,
  type EnvironmentVariables,
  type HostedSupabaseSafetyConfig,
} from '@starville/config/server';

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;

export function assertExactDevelopmentHostedTarget(
  config: HostedSupabaseSafetyConfig,
  environment: EnvironmentVariables,
): void {
  if (
    config.environment !== 'development' ||
    environment['STARVILLE_DEPLOYMENT_TARGET'] !== 'starville-dev'
  ) {
    throw new Error('Hosted validation is restricted to the exact starville-dev target');
  }

  const approvedDevelopmentRef = environment['STARVILLE_DEVELOPMENT_SUPABASE_PROJECT_REF']?.trim();
  if (
    approvedDevelopmentRef === undefined ||
    !PROJECT_REF_PATTERN.test(approvedDevelopmentRef) ||
    config.projectRef !== approvedDevelopmentRef
  ) {
    throw new Error('Hosted validation target is not the approved starville-dev project reference');
  }

  const productionRef = environment['STARVILLE_PRODUCTION_SUPABASE_PROJECT_REF']?.trim();
  if (productionRef !== undefined && PROJECT_REF_PATTERN.test(productionRef)) {
    if (productionRef === approvedDevelopmentRef || config.projectRef === productionRef) {
      throw new Error('Production and development Supabase project references must differ');
    }
  }
}

export function assertHostedDevelopmentTestsApproved(
  config: HostedSupabaseSafetyConfig,
  environment: EnvironmentVariables,
): void {
  assertExactDevelopmentHostedTarget(config, environment);
  assertHostedTestsApproved(config);
}

export function assertHostedDevelopmentFixtureWritesApproved(
  config: HostedSupabaseSafetyConfig,
  environment: EnvironmentVariables,
): void {
  assertHostedDevelopmentTestsApproved(config, environment);
  assertRemoteMigrationWriteApproved(config);
}

export async function verifyCanonicalHostedTarget(
  environment: EnvironmentVariables,
): Promise<HostedSupabaseSafetyConfig> {
  const config = loadHostedSupabaseSafetyConfig(environment);
  const linkedRefPath = new URL('../../infrastructure/supabase/.temp/project-ref', import.meta.url);

  let linkedRef: string;

  try {
    linkedRef = (await readFile(linkedRefPath, 'utf8')).trim();
  } catch {
    throw new Error(
      'Canonical Supabase workdir is not linked. Run the documented link command for the verified hosted project.',
    );
  }

  if (linkedRef !== config.projectRef) {
    throw new Error('Canonical Supabase link does not match SUPABASE_PROJECT_REF');
  }

  return config;
}

function maskedIdentifier(value: string): string {
  if (value.length <= 8) return '<masked>';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function safeHostedTargetSummary(config: HostedSupabaseSafetyConfig) {
  return {
    environment: config.environment,
    projectRef: maskedIdentifier(config.projectRef),
    projectHostname: `${maskedIdentifier(config.projectRef)}.supabase.co`,
    linked: true,
    remoteWritesApproved: config.remoteWritesApproved,
    hostedTestsApproved: config.hostedTestsApproved,
    bootstrapEnabled: config.bootstrapEnabled,
  } as const;
}
