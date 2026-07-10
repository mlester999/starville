import type { AdminAuthorizationResult } from '@starville/admin-auth';

export const ADMIN_ROUTES = {
  login: '/login',
  overview: '/overview',
  unauthorized: '/unauthorized',
  sessionExpired: '/session-expired',
  mfaRequired: '/mfa-required',
} as const;

export function destinationForAuthorization(
  result: AdminAuthorizationResult,
): (typeof ADMIN_ROUTES)[keyof typeof ADMIN_ROUTES] {
  switch (result.outcome) {
    case 'authorized':
      return ADMIN_ROUTES.overview;
    case 'unauthenticated':
      return ADMIN_ROUTES.login;
    case 'mfa_required':
      return ADMIN_ROUTES.mfaRequired;
    case 'session_invalid':
      return ADMIN_ROUTES.sessionExpired;
    case 'unauthorized':
      return ADMIN_ROUTES.unauthorized;
  }
}
