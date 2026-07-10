import { z } from 'zod';

import { ADMIN_PERMISSION_KEYS, ADMIN_ROLE_KEYS } from './catalog';

export { ADMIN_PERMISSION_KEYS, ADMIN_ROLE_KEYS, INITIAL_ROLE_PERMISSIONS } from './catalog';
export type { AdminPermissionKey, AdminRoleKey } from './catalog';

export const ADMIN_STATUSES = ['invited', 'active', 'suspended', 'disabled'] as const;
export const ADMIN_SESSION_STATUSES = ['pending_mfa', 'active', 'revoked', 'expired'] as const;
export const ADMIN_ASSURANCE_LEVELS = ['aal1', 'aal2'] as const;
export const ADMIN_AUTHORIZATION_OUTCOMES = [
  'authorized',
  'unauthenticated',
  'unauthorized',
  'mfa_required',
  'session_invalid',
] as const;

export const adminRoleKeySchema = z.enum(ADMIN_ROLE_KEYS);
export const adminPermissionKeySchema = z.enum(ADMIN_PERMISSION_KEYS);
export const adminStatusSchema = z.enum(ADMIN_STATUSES);
export const adminSessionStatusSchema = z.enum(ADMIN_SESSION_STATUSES);
export const adminAssuranceLevelSchema = z.enum(ADMIN_ASSURANCE_LEVELS);
export const adminAuthorizationOutcomeSchema = z.enum(ADMIN_AUTHORIZATION_OUTCOMES);

export type AdminStatus = z.infer<typeof adminStatusSchema>;
export type AdminSessionStatus = z.infer<typeof adminSessionStatusSchema>;
export type AdminAssuranceLevel = z.infer<typeof adminAssuranceLevelSchema>;
export type AdminAuthorizationOutcome = z.infer<typeof adminAuthorizationOutcomeSchema>;

export const adminAuthorizationContextSchema = z
  .object({
    userId: z.uuid(),
    displayName: z.string().trim().min(1).max(100),
    adminStatus: adminStatusSchema,
    roleKey: adminRoleKeySchema,
    roleName: z.string().trim().min(1).max(100),
    permissionKeys: z.array(adminPermissionKeySchema),
    adminSessionId: z.uuid(),
    sessionExpiresAt: z.iso.datetime({ offset: true }),
    mfaRequired: z.boolean(),
    assuranceLevel: adminAssuranceLevelSchema,
    lastLoginAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

const authorizedResultSchema = z
  .object({
    outcome: z.literal('authorized'),
    context: adminAuthorizationContextSchema,
  })
  .strict();

const deniedResultSchema = z
  .object({
    outcome: z.enum(['unauthenticated', 'unauthorized', 'mfa_required', 'session_invalid']),
  })
  .strict();

export const adminAuthorizationResultSchema = z.discriminatedUnion('outcome', [
  authorizedResultSchema,
  deniedResultSchema,
]);

export type AdminAuthorizationContext = z.infer<typeof adminAuthorizationContextSchema>;
export type AdminAuthorizationResult = z.infer<typeof adminAuthorizationResultSchema>;

export function isAuthorizedAdmin(
  result: AdminAuthorizationResult,
): result is z.infer<typeof authorizedResultSchema> {
  return result.outcome === 'authorized';
}

export function hasAdminPermission(
  context: AdminAuthorizationContext,
  permission: z.infer<typeof adminPermissionKeySchema>,
): boolean {
  return context.permissionKeys.includes(permission);
}

export function readAuthenticationMethods(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.flatMap((entry) => {
        if (typeof entry === 'string') {
          return [entry];
        }

        if (typeof entry !== 'object' || entry === null) {
          return [];
        }

        const method = Reflect.get(entry, 'method');
        return typeof method === 'string' ? [method] : [];
      }),
    ),
  ];
}

export function hasAuthenticationMethod(value: unknown, expectedMethod: string): boolean {
  return readAuthenticationMethods(value).includes(expectedMethod);
}
