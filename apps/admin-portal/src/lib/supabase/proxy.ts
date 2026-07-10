import { createSupabaseSsrServerClient } from '@starville/supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { parseAdminPublicConfig } from '../public-config';
import { adminAuthCookieOptions } from './cookie-options';

/** Refreshes verified Auth cookies only; authorization stays in route loaders and PostgreSQL. */
export async function refreshAdminAuthCookies(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const config = parseAdminPublicConfig(process.env);
  const supabase = createSupabaseSsrServerClient(
    config.supabase,
    {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
    {
      cookieOptions: adminAuthCookieOptions(config.appUrl),
    },
  );

  await supabase.auth.getClaims();
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
