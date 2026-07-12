import {
  AdminAuthorizationError,
  requireAdminPermission as assertAdminPermission,
} from '@starville/admin-auth/server';
import type {
  AdminAuthorizationContext,
  AdminAuthorizationResult,
  AdminPermissionKey,
} from '@starville/admin-auth';
import type { FastifyRequest } from 'fastify';

import type {
  AdminAuthGateway,
  AdminAuthorizationDenialReason,
  AdminDatabaseIdentity,
  ServiceLogger,
  VerifiedSupabaseIdentity,
} from './contracts.js';

export function parseBearerAuthorization(value: string | undefined): string | undefined {
  if (value === undefined || value.length > 8_192) {
    return undefined;
  }

  const match = /^Bearer ([^\s]+)$/.exec(value);
  return match?.[1];
}

export async function authenticateSupabaseUser(
  request: FastifyRequest,
  gateway: AdminAuthGateway,
): Promise<VerifiedSupabaseIdentity> {
  const token = parseBearerAuthorization(request.headers.authorization);

  if (token === undefined) {
    throw new AdminAuthorizationError('AUTHENTICATION_REQUIRED');
  }

  const identity = await gateway.verifyBearer(token);

  if (identity === undefined) {
    throw new AdminAuthorizationError('AUTHENTICATION_REQUIRED');
  }

  return identity;
}

export function denialReason(result: AdminAuthorizationResult): AdminAuthorizationDenialReason {
  switch (result.outcome) {
    case 'mfa_required':
      return 'MFA_REQUIRED';
    case 'session_invalid':
      return 'ADMIN_SESSION_INVALID';
    case 'unauthenticated':
    case 'unauthorized':
      return 'ADMIN_ACCESS_DENIED';
    case 'authorized':
      return 'MISSING_PERMISSION';
  }
}

export function requireActiveAdmin(result: AdminAuthorizationResult): AdminAuthorizationContext {
  if (result.outcome === 'unauthenticated') {
    throw new AdminAuthorizationError('AUTHENTICATION_REQUIRED');
  }

  if (result.outcome !== 'authorized') {
    throw new AdminAuthorizationError('ADMIN_ACCESS_DENIED');
  }

  return result.context;
}

export const requireAdminSession = requireActiveAdmin;

export function requirePermission(
  context: AdminAuthorizationContext,
  permission: AdminPermissionKey,
): void {
  assertAdminPermission(context, permission);
}

export async function authorizeAdminRequest(
  request: FastifyRequest,
  gateway: AdminAuthGateway,
  logger: ServiceLogger,
  permission: AdminPermissionKey | readonly AdminPermissionKey[],
): Promise<AdminDatabaseIdentity> {
  const identity = await authenticateSupabaseUser(request, gateway);
  const result = await gateway.loadAuthorization(identity);

  if (result.outcome !== 'authorized') {
    await gateway.recordDenial(identity, request.id, denialReason(result)).catch((error) => {
      logger.child({ requestId: request.id }).warn('admin.authorization.audit_failed', { error });
    });
  }

  const context = requireActiveAdmin(result);
  const permissions = typeof permission === 'string' ? [permission] : permission;
  const missingPermission = permissions.find((key) => !context.permissionKeys.includes(key));
  if (missingPermission !== undefined) {
    await gateway.recordDenial(identity, request.id, 'MISSING_PERMISSION').catch((error) => {
      logger.child({ requestId: request.id }).warn('admin.authorization.audit_failed', { error });
    });
  }

  for (const requiredPermission of permissions) {
    requirePermission(context, requiredPermission);
  }
  return identity;
}
