import { hasAdminPermission, type AdminAuthorizationResult } from '@starville/admin-auth';
import type { FastifyInstance } from 'fastify';

import {
  authenticateSupabaseUser,
  denialReason,
  requireActiveAdmin,
  requireAdminSession,
  requirePermission,
} from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger, VerifiedSupabaseIdentity } from '../contracts.js';

interface RegisterAdminRoutesOptions {
  readonly gateway: AdminAuthGateway;
  readonly logger: ServiceLogger;
  readonly sessionTtlMinutes: number;
}

async function auditDeniedResult(
  gateway: AdminAuthGateway,
  logger: ServiceLogger,
  identity: VerifiedSupabaseIdentity,
  requestId: string,
  result: AdminAuthorizationResult,
): Promise<void> {
  if (result.outcome === 'authorized') {
    return;
  }

  try {
    await gateway.recordDenial(identity, requestId, denialReason(result));
  } catch (error) {
    logger.child({ requestId }).warn('admin.authorization.audit_failed', { error });
  }
}

export function registerAdminRoutes(
  app: FastifyInstance,
  { gateway, logger, sessionTtlMinutes }: RegisterAdminRoutesOptions,
): void {
  app.get('/api/v1/admin/me', async (request) => {
    const identity = await authenticateSupabaseUser(request, gateway);
    const result = await gateway.loadAuthorization(identity);
    await auditDeniedResult(gateway, logger, identity, request.id, result);
    const context = requireActiveAdmin(result);

    if (!hasAdminPermission(context, 'overview.read')) {
      await gateway.recordDenial(identity, request.id, 'MISSING_PERMISSION').catch((error) => {
        logger.child({ requestId: request.id }).warn('admin.authorization.audit_failed', { error });
      });
    }

    requirePermission(context, 'overview.read');

    const apiContext = {
      userId: context.userId,
      displayName: context.displayName,
      roleKey: context.roleKey,
      roleName: context.roleName,
      permissionKeys: context.permissionKeys,
      adminStatus: context.adminStatus,
      adminSessionId: context.adminSessionId,
      sessionExpiresAt: context.sessionExpiresAt,
      mfaRequired: context.mfaRequired,
      assuranceLevel: context.assuranceLevel,
    };

    return { success: true, data: apiContext, requestId: request.id };
  });

  app.post('/api/v1/admin/session', async (request) => {
    const identity = await authenticateSupabaseUser(request, gateway);

    if (!identity.authenticationMethods.includes('password')) {
      await gateway.recordDenial(identity, request.id, 'ADMIN_ACCESS_DENIED').catch((error) => {
        logger.child({ requestId: request.id }).warn('admin.authorization.audit_failed', { error });
      });
      const denied: AdminAuthorizationResult = { outcome: 'unauthorized' };
      requireActiveAdmin(denied);
    }

    const expiresAt = new Date(Date.now() + sessionTtlMinutes * 60_000);
    const result = await gateway.createSession(identity, expiresAt, request.id);
    await auditDeniedResult(gateway, logger, identity, request.id, result);
    const context = requireAdminSession(result);

    return { success: true, data: context, requestId: request.id };
  });

  app.delete('/api/v1/admin/session', async (request) => {
    const identity = await authenticateSupabaseUser(request, gateway);
    const revoked = await gateway.revokeCurrentSession(identity, request.id);

    if (!revoked) {
      const result = await gateway.loadAuthorization(identity);
      await auditDeniedResult(gateway, logger, identity, request.id, result);
      requireAdminSession(result);
      throw new Error('Trusted administrator session revocation failed');
    }

    return { success: true, data: { revoked: true }, requestId: request.id };
  });
}
