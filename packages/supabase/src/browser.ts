import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { httpUrlSchema } from '@starville/shared-validation';

import type { AnonymousSupabaseConfig } from './types';

const anonymousConfigSchema = z
  .object({
    url: httpUrlSchema,
    anonKey: z.string().trim().min(1, 'Supabase anonymous key is required'),
  })
  .strict();

function jwtRole(key: string): string | undefined {
  const payload = key.split('.')[1];

  if (payload === undefined) {
    return undefined;
  }

  try {
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    const parsed: unknown = JSON.parse(atob(`${normalized}${padding}`));

    if (typeof parsed !== 'object' || parsed === null || !('role' in parsed)) {
      return undefined;
    }

    return typeof parsed.role === 'string' ? parsed.role : undefined;
  } catch {
    return undefined;
  }
}

function assertAnonymousKey(key: string): void {
  const normalized = key.toLowerCase();

  if (
    normalized.startsWith('sb_secret_') ||
    normalized.includes('service_role') ||
    normalized.includes('service-role') ||
    jwtRole(key) === 'service_role'
  ) {
    throw new Error('A Supabase service-role key cannot be used by a browser client');
  }
}

export function parseAnonymousSupabaseConfig(input: unknown): AnonymousSupabaseConfig {
  const config = anonymousConfigSchema.parse(input);
  assertAnonymousKey(config.anonKey);
  return config;
}

export function createSupabaseBrowserClient(input: unknown): SupabaseClient {
  const config = parseAnonymousSupabaseConfig(input);
  return createClient(config.url, config.anonKey);
}

export type { AnonymousSupabaseConfig } from './types';
