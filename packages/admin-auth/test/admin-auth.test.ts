import { describe, expect, it } from 'vitest';

import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_ROLE_KEYS,
  INITIAL_ROLE_PERMISSIONS,
  adminAuthorizationResultSchema,
  hasAdminPermission,
  hasAuthenticationMethod,
  readAuthenticationMethods,
} from '../src/index';
import {
  AdminAuthorizationError,
  requireAdminPermission,
  requireAuthorizedAdmin,
} from '../src/server';

const authorized = {
  outcome: 'authorized',
  context: {
    userId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Foundation Administrator',
    adminStatus: 'active',
    roleKey: 'read_only_analyst',
    roleName: 'Read-only Analyst',
    permissionKeys: ['overview.read', 'players.read'],
    adminSessionId: '22222222-2222-4222-8222-222222222222',
    sessionExpiresAt: '2026-01-01T01:00:00.000Z',
    mfaRequired: false,
    assuranceLevel: 'aal1',
    lastLoginAt: null,
  },
} as const;

describe('admin authorization catalog', () => {
  it('contains the required stable roles and permission catalog', () => {
    expect(ADMIN_ROLE_KEYS).toHaveLength(12);
    expect(ADMIN_PERMISSION_KEYS).toHaveLength(40);
    expect(INITIAL_ROLE_PERMISSIONS.super_admin).toEqual(ADMIN_PERMISSION_KEYS);
  });

  it('keeps sensitive permissions out of the read-only role', () => {
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('players.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('roles.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('audit_logs.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('economy.adjust_stardust');
  });
});

describe('admin authorization results', () => {
  it('validates an authorized context and checks permissions', () => {
    const result = adminAuthorizationResultSchema.parse(authorized);

    expect(result.outcome).toBe('authorized');
    if (result.outcome !== 'authorized') {
      throw new Error('Expected an authorized result');
    }
    expect(hasAdminPermission(result.context, 'overview.read')).toBe(true);
    expect(hasAdminPermission(result.context, 'roles.manage')).toBe(false);
  });

  it('rejects unknown permissions and excessive fields', () => {
    expect(() =>
      adminAuthorizationResultSchema.parse({
        ...authorized,
        context: { ...authorized.context, permissionKeys: ['admin.everything'] },
      }),
    ).toThrow();
    expect(() =>
      adminAuthorizationResultSchema.parse({ outcome: 'unauthorized', reason: 'x' }),
    ).toThrow();
  });

  it('maps authentication and authorization failures without leaking detail', () => {
    expect(() => requireAuthorizedAdmin({ outcome: 'unauthenticated' })).toThrowError(
      expect.objectContaining({ statusCode: 401, code: 'AUTHENTICATION_REQUIRED' }),
    );
    expect(() => requireAuthorizedAdmin({ outcome: 'session_invalid' })).toThrowError(
      expect.objectContaining({ statusCode: 403, code: 'ADMIN_ACCESS_DENIED' }),
    );
  });

  it('throws a typed error for a missing permission', () => {
    const context = requireAuthorizedAdmin(adminAuthorizationResultSchema.parse(authorized));

    expect(() => requireAdminPermission(context, 'roles.manage')).toThrow(AdminAuthorizationError);
  });
});

describe('verified Auth authentication methods', () => {
  it('supports both RFC string and Supabase object AMR representations', () => {
    expect(readAuthenticationMethods(['password', { method: 'totp', timestamp: 123 }])).toEqual([
      'password',
      'totp',
    ]);
    expect(hasAuthenticationMethod([{ method: 'recovery' }], 'recovery')).toBe(true);
  });

  it('ignores malformed and duplicate AMR entries', () => {
    expect(readAuthenticationMethods(['password', 'password', null, { method: 7 }])).toEqual([
      'password',
    ]);
  });
});
