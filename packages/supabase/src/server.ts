import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { httpUrlSchema } from '@starville/shared-validation';

import type { AnonymousSupabaseConfig, ServiceRoleSupabaseConfig } from './types';

const anonymousServerConfigSchema = z
  .object({
    url: httpUrlSchema,
    anonKey: z.string().trim().min(1, 'Supabase anonymous key is required'),
  })
  .strict();

const serviceRoleConfigSchema = z
  .object({
    url: httpUrlSchema,
    serviceRoleKey: z.string().trim().min(1, 'Supabase service-role key is required'),
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

export function parseServiceRoleSupabaseConfig(input: unknown): ServiceRoleSupabaseConfig {
  const config = serviceRoleConfigSchema.parse(input);
  const normalized = config.serviceRoleKey.toLowerCase();

  if (normalized.startsWith('sb_publishable_') || jwtRole(config.serviceRoleKey) === 'anon') {
    throw new Error('A Supabase anonymous key cannot be used as a service-role key');
  }

  return config;
}

export function createSupabaseServerClient(input: unknown): SupabaseClient {
  const config: AnonymousSupabaseConfig = anonymousServerConfigSchema.parse(input);

  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function createSupabaseServiceRoleClient(input: unknown): SupabaseClient {
  const config = parseServiceRoleSupabaseConfig(input);

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export type { AnonymousSupabaseConfig, ServiceRoleSupabaseConfig } from './types';
