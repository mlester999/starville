import { readFile } from 'node:fs/promises';

import {
  loadHostedSupabaseSafetyConfig,
  type EnvironmentVariables,
  type HostedSupabaseSafetyConfig,
} from '@starville/config/server';

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
      'Canonical Supabase workdir is not linked. Run the documented link command for the verified development project.',
    );
  }

  if (linkedRef !== config.projectRef) {
    throw new Error('Canonical Supabase link does not match SUPABASE_PROJECT_REF');
  }

  return config;
}

export function safeHostedTargetSummary(config: HostedSupabaseSafetyConfig) {
  return {
    environment: config.environment,
    projectRef: config.projectRef,
    projectHostname: config.projectHostname,
    linked: true,
    remoteWritesApproved: config.remoteWritesApproved,
    hostedTestsApproved: config.hostedTestsApproved,
    bootstrapEnabled: config.bootstrapEnabled,
  } as const;
}
