import 'server-only';

import { hasAuthenticationMethod } from '@starville/admin-auth';
import { loadAdminRecoveryConfig } from '@starville/config/server';
import { cookies } from 'next/headers';
import { type NextResponse } from 'next/server';

import { parseAdminPublicConfig } from '../public-config';
import { createAdminServerClient } from '../supabase/server';
import { createRecoveryMarker, verifyRecoveryMarker } from './recovery-marker';

const RECOVERY_COOKIE_NAME = 'starville-admin-password-recovery';
const RECOVERY_TTL_SECONDS = 10 * 60;

function recoveryCookieOptions() {
  return {
    httpOnly: true,
    maxAge: RECOVERY_TTL_SECONDS,
    path: '/',
    sameSite: 'lax' as const,
    secure: parseAdminPublicConfig(process.env).appUrl.startsWith('https://'),
  };
}

export function markRecoverySession(
  response: NextResponse,
  userId: string,
  authSessionId: string,
): void {
  const { cookieSigningSecret } = loadAdminRecoveryConfig(process.env);
  response.cookies.set(
    RECOVERY_COOKIE_NAME,
    createRecoveryMarker(cookieSigningSecret, userId, authSessionId),
    recoveryCookieOptions(),
  );
}

export async function clearRecoverySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE_NAME, '', {
    ...recoveryCookieOptions(),
    maxAge: 0,
  });
}

export async function hasVerifiedRecoverySession(): Promise<boolean> {
  const cookieStore = await cookies();

  const supabase = await createAdminServerClient();
  const claimsResult = await supabase.auth.getClaims();

  if (
    claimsResult.error ||
    !claimsResult.data?.claims.sub ||
    typeof claimsResult.data.claims.session_id !== 'string' ||
    !hasAuthenticationMethod(claimsResult.data.claims.amr, 'recovery')
  ) {
    return false;
  }

  const userResult = await supabase.auth.getUser();
  const verifiedUserId = claimsResult.data.claims.sub;
  const verifiedAuthSessionId = claimsResult.data.claims.session_id;
  const { cookieSigningSecret } = loadAdminRecoveryConfig(process.env);

  return (
    !userResult.error &&
    userResult.data.user.id === verifiedUserId &&
    verifyRecoveryMarker(
      cookieStore.get(RECOVERY_COOKIE_NAME)?.value,
      cookieSigningSecret,
      verifiedUserId,
      verifiedAuthSessionId,
    )
  );
}
