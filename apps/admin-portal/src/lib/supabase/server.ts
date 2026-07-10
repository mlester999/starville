import 'server-only';

import { createSupabaseSsrServerClient } from '@starville/supabase/ssr';
import { cookies } from 'next/headers';

import { parseAdminPublicConfig } from '../public-config';
import { adminAuthCookieOptions } from './cookie-options';

/** Creates one request-scoped Supabase client backed by Next's cookie store. */
export async function createAdminServerClient() {
  const cookieStore = await cookies();
  const config = parseAdminPublicConfig(process.env);

  return createSupabaseSsrServerClient(
    config.supabase,
    {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot mutate cookies. Proxy refreshes them before rendering.
        }
      },
    },
    {
      cookieOptions: adminAuthCookieOptions(config.appUrl),
    },
  );
}
