import 'server-only';

import {
  adminAuthorizationResultSchema,
  hasAdminPermission,
  isAuthorizedAdmin,
  type AdminPermissionKey,
  type AdminAuthorizationContext,
  type AdminAuthorizationResult,
} from '@starville/admin-auth';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { createAdminServerClient } from '../supabase/server';
import { destinationForAuthorization } from './redirects';

const UNAUTHENTICATED_RESULT = {
  outcome: 'unauthenticated',
} as const satisfies AdminAuthorizationResult;

export class AdminAuthorizationUnavailableError extends Error {
  public constructor() {
    super('Administrator authorization is temporarily unavailable.');
    this.name = 'AdminAuthorizationUnavailableError';
  }
}

async function loadCurrentAdminAuthorization(): Promise<AdminAuthorizationResult> {
  const supabase = await createAdminServerClient();
  const claimsResult = await supabase.auth.getClaims();

  if (claimsResult.error || !claimsResult.data?.claims.sub) {
    return UNAUTHENTICATED_RESULT;
  }

  const userResult = await supabase.auth.getUser();

  if (userResult.error || userResult.data.user.id !== claimsResult.data.claims.sub) {
    return UNAUTHENTICATED_RESULT;
  }

  const rpcResult = await supabase.rpc('get_current_admin_authorization');

  if (rpcResult.error) {
    throw new AdminAuthorizationUnavailableError();
  }

  const parsed = adminAuthorizationResultSchema.safeParse(rpcResult.data);

  if (!parsed.success) {
    throw new AdminAuthorizationUnavailableError();
  }

  return parsed.data;
}

/** Cached only within a React server render so layouts and pages share one trusted RPC result. */
export const getCurrentAdminAuthorization = cache(loadCurrentAdminAuthorization);

export async function requireAuthorizedAdmin(
  permissionKey?: AdminPermissionKey,
): Promise<AdminAuthorizationContext> {
  const result = await getCurrentAdminAuthorization();

  if (!isAuthorizedAdmin(result)) {
    redirect(destinationForAuthorization(result));
  }

  if (permissionKey !== undefined && !hasAdminPermission(result.context, permissionKey)) {
    redirect('/unauthorized');
  }

  return result.context;
}
