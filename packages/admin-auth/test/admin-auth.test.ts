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
    expect(ADMIN_PERMISSION_KEYS).toHaveLength(186);
    expect(INITIAL_ROLE_PERMISSIONS.super_admin).toEqual(ADMIN_PERMISSION_KEYS);
  });

  it('keeps live-operations mutation authority narrow', () => {
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).toEqual(
      expect.arrayContaining([
        'live_operations.read',
        'live_operations.manage',
        'announcements.read',
        'announcements.manage',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toEqual(
      expect.arrayContaining(['live_operations.read', 'announcements.read']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('live_operations.manage');
    expect(INITIAL_ROLE_PERMISSIONS.moderator).not.toContain('announcements.manage');
  });

  it('keeps Phase 11F home-visit operations role-scoped', () => {
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toEqual(
      expect.arrayContaining([
        'home_visits.manage',
        'home_visits.policies.manage',
        'home_visits.guestbooks.moderate',
        'home_visits.reconciliation.manage',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).toEqual(
      expect.arrayContaining([
        'home_visits.inspect',
        'home_visits.manage',
        'home_visits.live_ops.manage',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).not.toContain(
      'home_visits.guestbooks.moderate',
    );
    expect(INITIAL_ROLE_PERMISSIONS.moderator).toEqual(
      expect.arrayContaining([
        'home_visits.inspect',
        'home_visits.guestbooks.moderate',
        'home_visits.reports.inspect',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.customer_support).toEqual(
      expect.arrayContaining([
        'home_visits.inspect',
        'home_visits.policies.inspect',
        'home_visits.reports.inspect',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.content_manager).not.toContain('home_visits.inspect');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('home_visits.telemetry.inspect');
  });

  it('keeps Phase 12A inspection, support, policy, and reconciliation authority narrow', () => {
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toEqual(
      expect.arrayContaining([
        'player_experience.inspect',
        'player_experience.support',
        'player_experience.policy.manage',
        'player_experience.reconciliation.manage',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).toEqual(
      expect.arrayContaining([
        'player_experience.inspect',
        'player_experience.policy.manage',
        'player_experience.reconciliation.manage',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).not.toContain(
      'player_experience.support',
    );
    expect(INITIAL_ROLE_PERMISSIONS.customer_support).toEqual(
      expect.arrayContaining(['player_experience.inspect', 'player_experience.support']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('player_experience.inspect');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('player_experience.support');
    expect(INITIAL_ROLE_PERMISSIONS.moderator).not.toContain('player_experience.inspect');
  });

  it('keeps farming inspection, content, reward, and live-operations authority narrow', () => {
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toEqual(
      expect.arrayContaining(['farming.read', 'farming.player_read', 'farming.content_manage']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).not.toContain('farming.reward_manage');
    expect(INITIAL_ROLE_PERMISSIONS.content_manager).toEqual(
      expect.arrayContaining(['farming.read', 'farming.content_manage']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.content_manager).not.toContain('farming.reward_manage');
    expect(INITIAL_ROLE_PERMISSIONS.economy_manager).toEqual(
      expect.arrayContaining(['farming.read', 'farming.liveops', 'farming.reward_manage']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.economy_manager).not.toContain('farming.content_manage');
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).toEqual(
      expect.arrayContaining(['farming.read', 'farming.liveops']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).not.toContain(
      'farming.content_manage',
    );
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).not.toContain('farming.reward_manage');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('farming.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('farming.liveops');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('farming.player_read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('farming.content_manage');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('farming.reward_manage');
  });

  it('keeps platform configuration lifecycle authority narrow', () => {
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toEqual(
      expect.arrayContaining([
        'platform_configuration.read',
        'platform_configuration.edit',
        'platform_configuration.validate',
        'platform_configuration.review',
        'platform_configuration.publish',
        'platform_configuration.rollback',
        'platform_configuration.audit.read',
        'platform_configuration.preview',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.content_manager).toEqual(
      expect.arrayContaining([
        'platform_configuration.read',
        'platform_configuration.edit',
        'platform_configuration.validate',
        'platform_configuration.preview',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.content_manager).not.toContain(
      'platform_configuration.publish',
    );
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).toEqual(
      expect.arrayContaining(['platform_configuration.read', 'platform_configuration.preview']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).not.toContain(
      'platform_configuration.edit',
    );
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('platform_configuration.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain(
      'platform_configuration.preview',
    );
  });

  it('keeps avatar content review, activation, settings, and support authority narrow', () => {
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toEqual(
      expect.arrayContaining([
        'avatar_content.read',
        'avatar_content.audit.read',
        'avatar_content.edit',
        'avatar_content.review',
        'avatar_content.approve',
        'avatar_content.activate',
        'avatar_content.settings.read',
        'avatar_profile.support.read',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).not.toContain(
      'avatar_content.settings.edit',
    );
    expect(INITIAL_ROLE_PERMISSIONS.content_manager).toEqual(
      expect.arrayContaining([
        'avatar_content.read',
        'avatar_content.edit',
        'avatar_content.review',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.content_manager).not.toContain('avatar_content.activate');
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).toEqual(
      expect.arrayContaining([
        'avatar_content.read',
        'avatar_content.audit.read',
        'avatar_content.review',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.customer_support).toContain('avatar_profile.support.read');
    expect(INITIAL_ROLE_PERMISSIONS.customer_support).not.toContain('avatar_content.edit');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toEqual(
      expect.arrayContaining(['avatar_content.read', 'avatar_content.audit.read']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain(
      'avatar_content.settings.read',
    );
    expect(INITIAL_ROLE_PERMISSIONS.moderator).not.toContain('avatar_content.read');
    expect(INITIAL_ROLE_PERMISSIONS.blockchain_operator).not.toContain('avatar_content.read');
  });

  it('keeps sensitive permissions out of the read-only role', () => {
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('players.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('roles.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('audit_logs.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('player_audit.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('operations.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('realtime.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('economy.adjust_stardust');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('maps.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('maps.preview');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('maps.audit_read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('assets.audit.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('multiplayer_chat.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain(
      'multiplayer_chat.reports.read',
    );
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('multiplayer_chat.audit.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain(
      'multiplayer_chat.settings.read',
    );
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain('multiplayer_chat.moderate');
    expect(
      INITIAL_ROLE_PERMISSIONS.read_only_analyst.every(
        (permission) => permission.endsWith('.read') || permission.endsWith('.inspect'),
      ),
    ).toBe(true);
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst as readonly string[]).not.toContain(
      'assets.audit_read',
    );
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toEqual(
      expect.arrayContaining([
        'assets.upload',
        'assets.edit',
        'assets.validate',
        'assets.review',
        'assets.approve',
        'assets.activate',
        'assets.deprecate',
        'assets.publish',
      ]),
    );
  });

  it('keeps multiplayer chat evidence and mutation permissions narrow', () => {
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toEqual(
      expect.arrayContaining([
        'multiplayer_chat.read',
        'multiplayer_chat.moderate',
        'multiplayer_chat.reports.read',
        'multiplayer_chat.audit.read',
        'multiplayer_chat.settings.read',
        'multiplayer_chat.settings.edit',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.moderator).toEqual(
      expect.arrayContaining([
        'multiplayer_chat.read',
        'multiplayer_chat.moderate',
        'multiplayer_chat.reports.read',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.customer_support).not.toContain('multiplayer_chat.moderate');
    expect(INITIAL_ROLE_PERMISSIONS.world_designer).not.toContain('multiplayer_chat.moderate');
    expect(INITIAL_ROLE_PERMISSIONS.blockchain_operator).not.toContain('multiplayer_chat.moderate');
  });

  it('keeps social settlement visibility read-only and role-specific', () => {
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toEqual(
      expect.arrayContaining([
        'social_interactions.read',
        'social_interactions.audit.read',
        'social_interactions.settings.read',
        'social_interactions.settings.edit',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.moderator).toContain('social_interactions.read');
    expect(INITIAL_ROLE_PERMISSIONS.moderator).not.toContain('social_interactions.audit.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('social_interactions.read');
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain(
      'social_interactions.audit.read',
    );
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).not.toContain(
      'social_interactions.settings.read',
    );
    expect(INITIAL_ROLE_PERMISSIONS.blockchain_operator).not.toContain('social_interactions.read');
  });

  it('separates asset upload, review, approval, and activation authority', () => {
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toEqual(
      expect.arrayContaining([
        'assets.upload',
        'assets.edit',
        'assets.validate',
        'assets.review',
        'assets.approve',
        'assets.activate',
        'assets.deprecate',
        'assets.audit.read',
      ]),
    );
    expect(INITIAL_ROLE_PERMISSIONS.asset_manager).toEqual(
      expect.arrayContaining(['assets.upload', 'assets.approve', 'assets.activate']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).toContain('assets.read');
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).not.toContain('assets.upload');
    expect(INITIAL_ROLE_PERMISSIONS.moderator).not.toContain('assets.approve');
    expect(INITIAL_ROLE_PERMISSIONS.customer_support).not.toContain('assets.edit');
    expect(ADMIN_PERMISSION_KEYS as readonly string[]).not.toContain('assets.audit_read');
    expect(INITIAL_ROLE_PERMISSIONS.super_admin).toContain('assets.audit.read');
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toContain('assets.audit.read');
  });

  it('keeps Phase 6 world permissions narrow and role-specific', () => {
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).toEqual(
      expect.arrayContaining(['maps.read', 'maps.edit', 'maps.preview', 'maps.audit_read']),
    );
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).not.toContain('maps.publish');
    expect(INITIAL_ROLE_PERMISSIONS.game_administrator).not.toContain('maps.rollback');
    expect(INITIAL_ROLE_PERMISSIONS.live_operations_manager).toEqual(
      expect.arrayContaining(['maps.read', 'maps.audit_read', 'maps.rollback']),
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
    expect(INITIAL_ROLE_PERMISSIONS.world_designer).not.toContain('maps.rollback');
  });

  it('maps every Phase 5 player action to one exact server permission', () => {
    expect(ADMIN_PLAYER_ACTION_PERMISSIONS).toEqual({
      suspend: 'players.suspend',
      restore: 'players.suspend',
      'reset-position': 'players.reset_position',
      'require-rename': 'players.require_rename',
      rename: 'players.rename',
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
