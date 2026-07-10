import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { ADMIN_ROLE_KEYS, INITIAL_ROLE_PERMISSIONS } from '@starville/admin-auth';
import Parser from '@pgsql/parser';

import {
  assertValidMigrationFilename,
  createMigrationFilename,
  isValidMigrationFilename,
} from '../src/index';

describe('Supabase migration naming', () => {
  it('accepts a valid UTC timestamp and snake-case description', () => {
    expect(isValidMigrationFilename('20260710143005_initialize_extensions.sql')).toBe(true);
  });

  it.each([
    '001_initialize.sql',
    '20260710143005-unsafe-name.sql',
    '20261310143005_invalid_month.sql',
    '20260230143005_invalid_day.sql',
    '20260710143005_Admin_Users.sql',
  ])('rejects invalid migration filename %s', (filename) => {
    expect(isValidMigrationFilename(filename)).toBe(false);
    expect(() => assertValidMigrationFilename(filename)).toThrow();
  });

  it('creates deterministic UTC filenames', () => {
    expect(
      createMigrationFilename('enable_required_extensions', new Date('2026-07-10T14:30:05Z')),
    ).toBe('20260710143005_enable_required_extensions.sql');
  });

  it('refuses ambiguous descriptions', () => {
    expect(() => createMigrationFilename('CreateAdminUsers')).toThrow('lowercase snake_case');
  });
});

describe('Phase 2 administrator migrations', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const schemaSql = readFileSync(
    new URL('20260710090000_admin_authorization_schema.sql', migrationDirectory),
    'utf8',
  );
  const catalogSql = readFileSync(
    new URL('20260710091000_admin_authorization_catalog.sql', migrationDirectory),
    'utf8',
  );
  const authorizationSql = readFileSync(
    new URL('20260710092000_admin_authorization_functions_rls.sql', migrationDirectory),
    'utf8',
  );
  const allSql = `${schemaSql}\n${catalogSql}\n${authorizationSql}`;

  it('parses every migration with the hosted PostgreSQL major version grammar', async () => {
    const parser = new Parser({ version: 17 });

    for (const sql of [schemaSql, catalogSql, authorizationSql]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('does not use PostgreSQL reserved authorization as an unquoted relation alias', () => {
    expect(authorizationSql).not.toMatch(/\)\s+as\s+authorization\s*;/iu);
  });

  it('creates only the six required administrator tables', () => {
    const tables = [...allSql.matchAll(/create table public\.([a-z_]+)/gi)].map(
      (match) => match[1],
    );

    expect(tables).toEqual([
      'admin_roles',
      'admin_permissions',
      'admin_role_permissions',
      'admin_users',
      'admin_sessions',
      'admin_audit_logs',
    ]);
  });

  it('enables RLS and default-denies direct browser mutations on every table', () => {
    for (const table of [
      'admin_roles',
      'admin_permissions',
      'admin_role_permissions',
      'admin_users',
      'admin_sessions',
      'admin_audit_logs',
    ]) {
      expect(allSql).toContain(`alter table public.${table} enable row level security`);
      expect(allSql).toContain(
        `revoke all on table public.${table} from anon, authenticated, service_role`,
      );
    }

    expect(allSql).not.toMatch(/create policy[\s\S]{0,200}for (?:insert|update|delete)/i);
  });

  it('indexes every non-primary foreign-key column used by administrator tables', () => {
    for (const indexDefinition of [
      'admin_role_permissions_permission_id_idx',
      'admin_role_permissions_created_by_idx',
      'admin_users_role_id_idx',
      'admin_users_created_by_idx',
      'admin_users_suspended_by_idx',
      'admin_users_disabled_by_idx',
      'admin_sessions_user_id_idx',
      'admin_sessions_revoked_by_idx',
    ]) {
      expect(schemaSql).toContain(`create index ${indexDefinition}`);
    }
  });

  it('contains the required session, audit, bootstrap, and final-Super-Admin safeguards', () => {
    expect(allSql).toContain('private.protect_last_active_super_admin');
    expect(allSql).toContain(
      "pg_advisory_xact_lock(hashtext('starville.last_active_super_admin'))",
    );
    expect(allSql).toContain('private.protect_admin_audit_log');
    expect(allSql).toContain('public.create_admin_session');
    expect(allSql).toContain("p_expires_at > now() + interval '60 minutes'");
    expect(allSql).toContain('public.revoke_current_admin_session');
    expect(allSql).toContain('private.invalidate_admin_sessions_after_auth_password_change');
    expect(allSql).toContain('public.bootstrap_first_super_admin');
    expect(allSql).toContain("factor.status = 'verified'");
    expect(allSql).toContain("factor.factor_type = 'totp'");
    expect(allSql).toContain(
      'Invited-administrator activation preserves the existing display name',
    );
    expect(allSql).toContain("auth_session.created_at >= now() - interval '5 minutes'");
  });

  it('keeps the SQL seed exactly aligned with the typed role-permission matrix', () => {
    const mappingBlock = catalogSql.slice(
      catalogSql.indexOf('with mapping(role_key, permission_key)'),
    );
    const seeded = new Map<string, string[]>();

    for (const match of mappingBlock.matchAll(/\('([^']+)', '([^']+)'\)/g)) {
      const role = match[1];
      const permission = match[2];

      if (role !== undefined && permission !== undefined) {
        seeded.set(role, [...(seeded.get(role) ?? []), permission]);
      }
    }

    for (const role of ADMIN_ROLE_KEYS) {
      if (role === 'super_admin') {
        expect(catalogSql).toContain('Super Admin intentionally receives the entire catalog');
      } else {
        expect([...(seeded.get(role) ?? [])].sort()).toEqual(
          [...INITIAL_ROLE_PERMISSIONS[role]].sort(),
        );
      }
    }
  });

  it('never includes destructive hosted-database operations', () => {
    expect(allSql).not.toMatch(/drop\s+schema/i);
    expect(allSql).not.toMatch(/truncate\s+/i);
    expect(allSql).not.toMatch(/alter\s+table\s+auth\./i);
  });
});
