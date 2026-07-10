'use client';

import { createSupabaseSsrBrowserClient } from '@starville/supabase/ssr';

import { parseAdminPublicConfig } from '../public-config';
import { adminAuthCookieOptions } from './cookie-options';

let browserClient: ReturnType<typeof createSupabaseSsrBrowserClient> | undefined;

/**
 * Returns the browser-safe, cookie-backed Supabase client for interactive auth flows.
 * Privileged credentials are intentionally not accepted by this boundary.
 */
export function createAdminBrowserClient() {
  const config = parseAdminPublicConfig({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_GAME_URL: process.env.NEXT_PUBLIC_GAME_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  browserClient ??= createSupabaseSsrBrowserClient(config.supabase, {
    cookieOptions: adminAuthCookieOptions(config.appUrl),
  });
  return browserClient;
}
