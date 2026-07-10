'use server';

import { isAuthorizedAdmin } from '@starville/admin-auth';
import { redirect } from 'next/navigation';

import { getCurrentAdminAuthorization } from '../../lib/auth/authorization';
import { getVerifiedAccessToken, mutateTrustedAdminSession } from '../../lib/auth/api-session';
import { loadVerifiedTotpFactors } from '../../lib/auth/mfa';
import { normalizeTotpCode } from '../../lib/auth/mfa-code';
import { validateNewPassword } from '../../lib/auth/password';
import { ADMIN_ROUTES, destinationForAuthorization } from '../../lib/auth/redirects';
import { clearRecoverySession, hasVerifiedRecoverySession } from '../../lib/auth/recovery';
import { parseAdminPublicConfig } from '../../lib/public-config';
import { createAdminServerClient } from '../../lib/supabase/server';

function readFormString(
  formData: FormData,
  field: string,
  maximumLength: number,
): string | undefined {
  const value = formData.get(field);

  if (typeof value !== 'string' || value.length > maximumLength) {
    return undefined;
  }

  return value;
}

async function routeAfterSessionMutation(): Promise<never> {
  const authorization = await getCurrentAdminAuthorization();
  return redirect(destinationForAuthorization(authorization));
}

export async function loginAction(formData: FormData): Promise<never> {
  const email = readFormString(formData, 'email', 254)?.trim();
  const password = readFormString(formData, 'password', 1024);

  if (!email || !password) {
    redirect('/login?notice=invalid');
  }

  const supabase = await createAdminServerClient();
  const signInResult = await supabase.auth.signInWithPassword({ email, password });

  if (signInResult.error) {
    redirect('/login?notice=invalid');
  }

  const accessToken = await getVerifiedAccessToken(supabase);

  if (accessToken === undefined) {
    await supabase.auth.signOut({ scope: 'local' });
    redirect('/login?notice=invalid');
  }

  const status = await mutateTrustedAdminSession('POST', accessToken);

  if (status === 401) {
    await supabase.auth.signOut({ scope: 'local' });
    redirect('/login?notice=invalid');
  }

  if (status !== 403 && (status < 200 || status >= 300)) {
    await supabase.auth.signOut({ scope: 'local' });
    redirect('/login?notice=service-unavailable');
  }

  return routeAfterSessionMutation();
}

export async function forgotPasswordAction(formData: FormData): Promise<never> {
  const email = readFormString(formData, 'email', 254)?.trim();

  if (email && email.includes('@')) {
    const supabase = await createAdminServerClient();
    const callbackUrl = new URL('/auth/callback', parseAdminPublicConfig(process.env).appUrl);
    callbackUrl.searchParams.set('flow', 'recovery');

    // The outcome is intentionally ignored so this response cannot enumerate accounts.
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });
  }

  redirect('/forgot-password?sent=1');
}

export async function resetPasswordAction(formData: FormData): Promise<never> {
  if (!(await hasVerifiedRecoverySession())) {
    await clearRecoverySession();
    redirect(ADMIN_ROUTES.sessionExpired);
  }

  const password = readFormString(formData, 'password', 128) ?? '';
  const confirmation = readFormString(formData, 'passwordConfirmation', 128) ?? '';
  const validation = validateNewPassword(password, confirmation);

  if (!validation.valid) {
    redirect(`/reset-password?notice=${validation.reason}`);
  }

  const supabase = await createAdminServerClient();
  const updateResult = await supabase.auth.updateUser({ password });

  if (updateResult.error) {
    redirect('/reset-password?notice=invalid');
  }

  await supabase.auth.signOut({ scope: 'local' });
  await clearRecoverySession();

  redirect('/login?notice=password-updated');
}

export async function logoutAction(): Promise<never> {
  const supabase = await createAdminServerClient();
  const accessToken = await getVerifiedAccessToken(supabase);

  if (accessToken !== undefined) {
    await mutateTrustedAdminSession('DELETE', accessToken);
  }

  await supabase.auth.signOut({ scope: 'local' });
  await clearRecoverySession();
  redirect(ADMIN_ROUTES.login);
}

export async function verifyMfaAction(formData: FormData): Promise<never> {
  const factorId = readFormString(formData, 'factorId', 64);
  const code = normalizeTotpCode(readFormString(formData, 'code', 16) ?? '');

  if (factorId === undefined || code === undefined) {
    redirect('/mfa-required?notice=verification-failed');
  }

  const supabase = await createAdminServerClient();
  const verifiedFactors = await loadVerifiedTotpFactors(supabase);

  if (!verifiedFactors.some((factor) => factor.id === factorId)) {
    redirect('/mfa-required?notice=verification-failed');
  }

  const verification = await supabase.auth.mfa.challengeAndVerify({ factorId, code });

  if (verification.error) {
    redirect('/mfa-required?notice=verification-failed');
  }

  const accessToken = await getVerifiedAccessToken(supabase);

  if (accessToken === undefined) {
    redirect(ADMIN_ROUTES.login);
  }

  const status = await mutateTrustedAdminSession('POST', accessToken);

  if (status !== 403 && (status < 200 || status >= 300)) {
    redirect('/mfa-required?notice=unavailable');
  }

  const authorization = await getCurrentAdminAuthorization();

  if (isAuthorizedAdmin(authorization)) {
    redirect(ADMIN_ROUTES.overview);
  }

  if (authorization.outcome === 'mfa_required') {
    redirect('/mfa-required?notice=verification-required');
  }

  redirect(destinationForAuthorization(authorization));
}
