import {
  createBrowserClient,
  createServerClient,
  type CookieMethodsServer,
  type CookieOptionsWithName,
} from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { parseAnonymousSupabaseConfig } from './browser';

export interface SupabaseSsrOptions {
  readonly cookieOptions?: CookieOptionsWithName;
  readonly fetch?: typeof globalThis.fetch;
}

export function createSupabaseSsrBrowserClient(
  input: unknown,
  options: SupabaseSsrOptions = {},
): SupabaseClient {
  const config = parseAnonymousSupabaseConfig(input);

  return createBrowserClient(config.url, config.anonKey, {
    ...(options.cookieOptions === undefined ? {} : { cookieOptions: options.cookieOptions }),
    ...(options.fetch === undefined ? {} : { global: { fetch: options.fetch } }),
  });
}

export function createSupabaseSsrServerClient(
  input: unknown,
  cookies: CookieMethodsServer,
  options: SupabaseSsrOptions = {},
): SupabaseClient {
  const config = parseAnonymousSupabaseConfig(input);

  return createServerClient(config.url, config.anonKey, {
    cookies,
    ...(options.cookieOptions === undefined ? {} : { cookieOptions: options.cookieOptions }),
    ...(options.fetch === undefined ? {} : { global: { fetch: options.fetch } }),
  });
}

export type { CookieMethodsServer, CookieOptionsWithName } from '@supabase/ssr';
