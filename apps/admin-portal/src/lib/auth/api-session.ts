import 'server-only';

import { parseAdminPublicConfig } from '../public-config';
import type { createAdminServerClient } from '../supabase/server';

type AdminServerClient = Awaited<ReturnType<typeof createAdminServerClient>>;
type AdminSessionMethod = 'POST' | 'DELETE';

/**
 * Returns a bearer token only after Supabase has verified both claims and the current user.
 * The raw session is never used as authorization evidence.
 */
export async function getVerifiedAccessToken(
  supabase: AdminServerClient,
): Promise<string | undefined> {
  const claimsResult = await supabase.auth.getClaims();

  if (claimsResult.error || !claimsResult.data?.claims.sub) {
    return undefined;
  }

  const userResult = await supabase.auth.getUser();

  if (userResult.error || userResult.data.user.id !== claimsResult.data.claims.sub) {
    return undefined;
  }

  const sessionResult = await supabase.auth.getSession();

  if (sessionResult.error || !sessionResult.data.session?.access_token) {
    return undefined;
  }

  return sessionResult.data.session.access_token;
}

async function callTrustedAdminEndpoint(
  pathname: '/api/v1/admin/session',
  method: AdminSessionMethod,
  accessToken: string,
): Promise<number> {
  const config = parseAdminPublicConfig(process.env);
  const endpoint = new URL(pathname, config.apiUrl);

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });

    return response.status;
  } catch {
    return 503;
  }
}

export function mutateTrustedAdminSession(
  method: AdminSessionMethod,
  accessToken: string,
): Promise<number> {
  return callTrustedAdminEndpoint('/api/v1/admin/session', method, accessToken);
}
