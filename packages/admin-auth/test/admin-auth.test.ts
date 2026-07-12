import { describe, expect, it } from 'vitest';

import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_PLAYER_ACTION_PERMISSIONS,
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
    expect(ADMIN_PERMISSION_KEYS).toHaveLength(46);
    expect(INITIAL_ROLE_PERMISSIONS.super_admin).toEqual(ADMIN_PERMISSION_KEYS);
  });

  it('keeps sensitive permissions out of the read-only role', () => {
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('players.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('roles.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('audit_logs.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('player_audit.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('operations.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('economy.adjust_stardust');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('maps.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('maps.preview');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('maps.audit_read');
  });

  it('keeps Phase 6 world permissions narrow and role-specific', () => {
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toEqual(
      expect.arrayContaining(['maps.read', 'maps.edit', 'maps.preview', 'maps.audit_read']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).not.toContain('maps.publish');
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).toEqual(
      expect.arrayContaining(['maps.read', 'maps.audit_read']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).not.toContain('maps.edit');
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).not.toContain('maps.publish');
    expect(INITIAL_ROLE_PERMISSIONS.world_designer).toEqual(
      expect.arrayContaining([
        'maps.read',
        'maps.edit',
        'maps.preview',
        'maps.publish',
        'maps.audit_read',
      ]),
    );
  });

  it('maps every Phase 5 player action to one exact server permission', () => {
    expect(ADMIN_PLAYER_ACTION_PERMISSIONS).toEqual({
      suspend: 'players.suspend',
      restore: 'players.suspend',
      'reset-position': 'players.reset_position',
      'require-rename': 'players.require_rename',
      'revoke-sessions': 'players.manage_sessions',
    });
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
