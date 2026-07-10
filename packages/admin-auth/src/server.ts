import {
  adminAuthorizationResultSchema,
  hasAdminPermission,
  type AdminAuthorizationContext,
  type AdminAuthorizationResult,
  type AdminPermissionKey,
} from './index';

export class AdminAuthorizationError extends Error {
  readonly code: 'AUTHENTICATION_REQUIRED' | 'ADMIN_ACCESS_DENIED';
  readonly statusCode: 401 | 403;

  constructor(code: 'AUTHENTICATION_REQUIRED' | 'ADMIN_ACCESS_DENIED') {
    super(code === 'AUTHENTICATION_REQUIRED' ? 'Authentication is required.' : 'Access is denied.');
    this.name = 'AdminAuthorizationError';
    this.code = code;
    this.statusCode = code === 'AUTHENTICATION_REQUIRED' ? 401 : 403;
  }
}

export function parseAdminAuthorizationResult(input: unknown): AdminAuthorizationResult {
  return adminAuthorizationResultSchema.parse(input);
}

export function requireAuthorizedAdmin(
  result: AdminAuthorizationResult,
): AdminAuthorizationContext {
  if (result.outcome === 'unauthenticated') {
    throw new AdminAuthorizationError('AUTHENTICATION_REQUIRED');
  }

  if (result.outcome !== 'authorized') {
    throw new AdminAuthorizationError('ADMIN_ACCESS_DENIED');
  }

  return result.context;
}

export function requireAdminPermission(
  context: AdminAuthorizationContext,
  permission: AdminPermissionKey,
): void {
  if (!hasAdminPermission(context, permission)) {
    throw new AdminAuthorizationError('ADMIN_ACCESS_DENIED');
  }
}
