import 'server-only';

import type { createAdminServerClient } from '../supabase/server';

type AdminServerClient = Awaited<ReturnType<typeof createAdminServerClient>>;

export interface VerifiedTotpFactor {
  readonly id: string;
  readonly label: string;
}

export async function loadVerifiedTotpFactors(
  supabase: AdminServerClient,
): Promise<readonly VerifiedTotpFactor[]> {
  const claimsResult = await supabase.auth.getClaims();

  if (claimsResult.error || !claimsResult.data?.claims.sub) {
    return [];
  }

  const userResult = await supabase.auth.getUser();

  if (userResult.error || userResult.data.user.id !== claimsResult.data.claims.sub) {
    return [];
  }

  const factorsResult = await supabase.auth.mfa.listFactors();

  if (factorsResult.error) {
    return [];
  }

  return factorsResult.data.totp
    .filter((factor) => factor.status === 'verified')
    .map((factor, index) => ({
      id: factor.id,
      label: factor.friendly_name?.trim() || `Authenticator ${String(index + 1).padStart(2, '0')}`,
    }));
}
