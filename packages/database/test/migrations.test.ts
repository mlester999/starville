import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_ROLE_KEYS,
  INITIAL_ROLE_PERMISSIONS,
} from '@starville/admin-auth';
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
  const phase5Sql = readFileSync(
    new URL('20260711110000_secure_player_operations.sql', migrationDirectory),
    'utf8',
  );
  const phase6Sql = readFileSync(
    new URL('20260712100000_world_management_schema.sql', migrationDirectory),
    'utf8',
  );
  const consolidationSql = readFileSync(
    new URL('20260712105000_player_rename_access_pagination.sql', migrationDirectory),
    'utf8',
  );
  const liveOperationsCatalogSql = readFileSync(
    new URL('20260712106000_live_operations.sql', migrationDirectory),
    'utf8',
  );
  const cozyHousingSql = readFileSync(
    new URL('20260713102000_cozy_gameplay_housing_admin.sql', migrationDirectory),
    'utf8',
  );
  const assetManagerSchemaSql = readFileSync(
    new URL('20260713110000_world_asset_manager_schema.sql', migrationDirectory),
    'utf8',
  );
  const platformConfigurationSchemaSql = readFileSync(
    new URL('20260714100000_platform_configuration_schema.sql', migrationDirectory),
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
    const phase5MappingStart = phase5Sql.indexOf('with mapping(role_key, permission_key)');
    const phase5MappingBlock = phase5Sql.slice(
      phase5MappingStart,
      phase5Sql.indexOf('alter table public.player_profiles', phase5MappingStart),
    );
    const phase6MappingStart = phase6Sql.indexOf('with mapping(role_key, permission_key)');
    const phase6MappingBlock = phase6Sql.slice(
      phase6MappingStart,
      phase6Sql.indexOf('create table public.world_maps', phase6MappingStart),
    );
    const consolidationMappingStart = consolidationSql.indexOf(
      'with mapping(role_key, permission_key)',
    );
    const consolidationMappingBlock = consolidationSql.slice(
      consolidationMappingStart,
      consolidationSql.indexOf(
        'alter table public.admin_player_operation_rate_limits',
        consolidationMappingStart,
      ),
    );
    const liveOperationsMappingStart = liveOperationsCatalogSql.indexOf(
      'with mapping(role_key, permission_key)',
    );
    const liveOperationsMappingBlock = liveOperationsCatalogSql.slice(
      liveOperationsMappingStart,
      liveOperationsCatalogSql.indexOf(
        'create table public.live_operations_maintenance',
        liveOperationsMappingStart,
      ),
    );
    const assetManagerMappingStart = assetManagerSchemaSql.indexOf(
      'with mapping(role_key, permission_key)',
    );
    const assetManagerMappingBlock = assetManagerSchemaSql.slice(
      assetManagerMappingStart,
      assetManagerSchemaSql.indexOf(
        'create or replace function private.valid_world_asset_collision_profile',
        assetManagerMappingStart,
      ),
    );
    const platformMappingStart = platformConfigurationSchemaSql.indexOf(
      'with mapping(role_key, permission_key)',
    );
    const platformMappingBlock = platformConfigurationSchemaSql.slice(
      platformMappingStart,
      platformConfigurationSchemaSql.indexOf(
        'insert into public.admin_role_permissions (role_id, permission_id)\nselect role.id, permission.id\nfrom public.admin_roles as role\ncross join',
        platformMappingStart,
      ),
    );
    const mappingBlock = `${catalogSql.slice(
      catalogSql.indexOf('with mapping(role_key, permission_key)'),
    )}\n${phase5MappingBlock}\n${phase6MappingBlock}\n${consolidationMappingBlock}\n${liveOperationsMappingBlock}\n${cozyHousingSql.slice(
      cozyHousingSql.indexOf('with mapping(role_key, permission_key)'),
      cozyHousingSql.indexOf('alter table public.cozy_gameplay_idempotency'),
    )}\n${assetManagerMappingBlock}\n${platformMappingBlock}`;
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

describe('Phase 3 token-access migrations', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const schemaSql = readFileSync(
    new URL('20260710100000_token_access_schema.sql', migrationDirectory),
    'utf8',
  );
  const functionsSql = readFileSync(
    new URL('20260710101000_token_access_functions_rls.sql', migrationDirectory),
    'utf8',
  );
  const allSql = `${schemaSql}\n${functionsSql}`;

  it('parses every Phase 3 migration with the hosted PostgreSQL major version grammar', async () => {
    const parser = new Parser({ version: 17 });

    for (const sql of [schemaSql, functionsSql]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('creates the minimum authority tables plus one durable abuse-control table', () => {
    expect(
      [...allSql.matchAll(/create table public\.([a-z_]+)/gi)].map((match) => match[1]),
    ).toEqual([
      'token_gate_configs',
      'wallet_auth_challenges',
      'wallet_auth_rate_limits',
      'wallet_access_sessions',
      'wallet_access_events',
    ]);
  });

  it('enables RLS and revokes direct service and browser privileges on every table', () => {
    for (const table of [
      'token_gate_configs',
      'wallet_auth_challenges',
      'wallet_auth_rate_limits',
      'wallet_access_sessions',
      'wallet_access_events',
    ]) {
      expect(allSql).toContain(`alter table public.${table} enable row level security`);
      expect(allSql).toContain(
        `revoke all on table public.${table} from anon, authenticated, service_role`,
      );
    }

    expect(allSql).not.toMatch(/create policy/iu);
  });

  it('stores only fixed-length challenge and session hashes and uses exact numeric amounts', () => {
    expect(schemaSql).toContain("nonce_hash ~ '^[0-9a-f]{64}$'");
    expect(schemaSql).toContain("message_hash ~ '^[0-9a-f]{64}$'");
    expect(schemaSql).toContain("session_token_hash ~ '^[0-9a-f]{64}$'");
    expect(schemaSql).toContain('required_amount_raw numeric(78, 0)');
    expect(schemaSql).toContain('observed_balance_raw numeric(78, 0)');
    expect(allSql).not.toMatch(/double precision|real\b/iu);
  });

  it('contains one-time challenge, versioned config, durable rate limit, and session invalidation safeguards', () => {
    expect(functionsSql).toContain('and consumed_at is null');
    expect(functionsSql).toContain('set consumed_at = now()');
    expect(functionsSql).toContain('and expired_at is null');
    expect(functionsSql).toContain('private.claim_wallet_rate_limit');
    expect(functionsSql).toContain('public.claim_wallet_access_recheck');
    expect(functionsSql).toContain("revoke_reason = 'stale_balance_slot'");
    expect(functionsSql).toContain('config.config_version <> challenge.config_version_snapshot');
    expect(functionsSql).toContain('config_version = config_version + 1');
    expect(functionsSql).toContain('pg_advisory_xact_lock');
    expect(functionsSql).toContain("status = 'configuration_changed'");
    expect(functionsSql).toContain('private.assert_verified_admin_permission');
  });

  it('grants only narrow trusted functions to service_role and no direct table access', () => {
    expect(functionsSql).toContain('grant execute on function public.create_wallet_auth_challenge');
    expect(functionsSql).toContain(
      'grant execute on function public.get_wallet_access_session(text) to service_role',
    );
    expect(functionsSql).toContain(
      'grant execute on function public.update_admin_token_gate_config',
    );
    expect(allSql).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+table/iu);
  });

  it('never includes destructive hosted-database operations or Phase 4 tables', () => {
    expect(allSql).not.toMatch(/drop\s+schema|truncate\s+|alter\s+table\s+auth\./iu);
    expect(allSql).not.toMatch(
      /create table public\.(?:players|inventories|items|crops|recipes|houses|marketplace|rewards)/iu,
    );
  });
});

describe('Phase 4 player vertical-slice migration', () => {
  const migrationSql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260711100000_player_vertical_slice.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses with the hosted PostgreSQL major version grammar', async () => {
    const result = await new Parser({ version: 17 }).parse(migrationSql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
  });

  it('creates only the profile and durable player rate-limit tables', () => {
    expect(
      [...migrationSql.matchAll(/create table public\.([a-z_]+)/giu)].map((match) => match[1]),
    ).toEqual(['player_profiles', 'player_api_rate_limits']);
  });

  it('enables RLS and denies every direct browser and service-role table privilege', () => {
    for (const table of ['player_profiles', 'player_api_rate_limits']) {
      expect(migrationSql).toContain(`alter table public.${table} enable row level security`);
      expect(migrationSql).toContain(
        `revoke all on table public.${table} from anon, authenticated, service_role`,
      );
    }
    expect(migrationSql).not.toMatch(/create policy/iu);
  });

  it('keeps player identity server-derived and grants only narrow trusted functions', () => {
    expect(migrationSql).toContain('wallet_address text not null unique');
    expect(migrationSql).toContain('grant execute on function public.load_player_profile');
    expect(migrationSql).toContain('grant execute on function public.create_player_profile');
    expect(migrationSql).toContain('grant execute on function public.save_player_game_state');
    expect(migrationSql).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+table/iu);
  });

  it('bounds maps, positions, directions, appearances, names, and write rates', () => {
    expect(migrationSql).toContain("current_map_id = 'lantern-square'");
    expect(migrationSql).toContain('safe_position_x between 0.75 and 23.25');
    expect(migrationSql).toContain('safe_position_y between 0.75 and 19.25');
    expect(migrationSql).toContain(
      "appearance_preset in ('moss', 'marigold', 'moonberry', 'river')",
    );
    expect(migrationSql).toContain("'north', 'northeast', 'east', 'southeast'");
    expect(migrationSql).toContain('private.claim_player_rate_limit');
  });

  it('contains no destructive operations or later-phase systems', () => {
    expect(migrationSql).not.toMatch(/drop\s+schema|truncate\s+|alter\s+table\s+auth\./iu);
    expect(migrationSql).not.toMatch(
      /create table public\.(?:inventories|items|crops|recipes|houses|marketplace|rewards|stardust)/iu,
    );
  });
});

describe('Phase 5 secure player-operations migration', () => {
  const migrationSql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260711110000_secure_player_operations.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses with the hosted PostgreSQL major version grammar', async () => {
    const result = await new Parser({ version: 17 }).parse(migrationSql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
  });

  it('loads joined composite rows through one record target for PostgreSQL compatibility', () => {
    expect(migrationSql).not.toMatch(
      /select\s+p,\s*m\s+into\s+(?:strict\s+)?profile,\s*moderation/iu,
    );
    expect(
      migrationSql.match(/select p as profile_row, m as moderation_row\s+into/gu),
    ).toHaveLength(12);
  });

  it('adds only current moderation, append-only audit, and operation-rate storage', () => {
    expect(
      [...migrationSql.matchAll(/create table public\.([a-z_]+)/giu)].map((match) => match[1]),
    ).toEqual([
      'player_moderation_states',
      'player_operation_audit_logs',
      'admin_player_operation_rate_limits',
    ]);
    expect(migrationSql).toContain('player_operation_audit_logs_append_only');
  });

  it('default-denies direct browser and service-role table access', () => {
    for (const table of [
      'player_moderation_states',
      'player_operation_audit_logs',
      'admin_player_operation_rate_limits',
    ]) {
      expect(migrationSql).toContain(`alter table public.${table} enable row level security`);
      expect(migrationSql).toContain(
        `revoke all on table public.${table} from anon, authenticated, service_role`,
      );
    }
    expect(migrationSql).not.toMatch(/create policy/iu);
  });

  it('uses narrow database permissions and accepts no reset coordinates', () => {
    expect(migrationSql).toContain("'players.reset_position'");
    expect(migrationSql).toContain("'players.require_rename'");
    expect(migrationSql).toContain("'players.manage_sessions'");
    expect(migrationSql).toContain("'player_audit.read'");
    expect(migrationSql).toContain("set current_map_id = 'lantern-square'");
    expect(migrationSql).toContain('safe_position_x = 12');
    expect(migrationSql).toContain('safe_position_y = 7.5');
    expect(migrationSql).not.toMatch(
      /admin_reset_player_position\([\s\S]{0,400}p_(?:position_)?[xy]/iu,
    );
  });

  it('enforces moderation at every player entry and write boundary', () => {
    expect(migrationSql).toContain('public.load_player_entry_state');
    expect(migrationSql).toContain('public.complete_required_player_rename');
    expect(migrationSql).toContain('p_expected_game_state_version integer');
    expect(migrationSql).toContain(
      "return jsonb_build_object('status', 'game_state_version_conflict')",
    );
    expect(migrationSql).toContain("return jsonb_build_object('status', 'suspended')");
    expect(migrationSql).toContain("return jsonb_build_object('status', 'rename_required')");
    expect(migrationSql).toContain("'player.rename_completed'");
  });

  it('rejects NULL bounds below the API so trusted RPCs cannot become unbounded or skip versions', () => {
    expect(migrationSql.match(/p_expected_version is null/gu)).toHaveLength(5);
    expect(migrationSql).toContain('p_page_size is null');
    expect(migrationSql).toContain('p_limit is null');
    expect(migrationSql).toContain('p_request_id is null');
    expect(migrationSql).toContain('p_rate_limit is null');
    expect(migrationSql).toContain('p_limit is null\n     or p_limit not between 1 and 60');
  });

  it('counts access sessions only against the requested validated token configuration', () => {
    expect(migrationSql).toContain('and config.environment_key = p_environment_key');
    expect(migrationSql).toContain('and config.network = p_network');
    expect(migrationSql).toContain('and session.token_gate_config_id = config.id');
    expect(migrationSql).toContain('and config.enabled');
    expect(migrationSql).toContain("and config.validation_state = 'validated'");
  });

  it('uses literal name-prefix search and gates exact-wallet lookup behind wallet permission', () => {
    expect(migrationSql).toContain('starts_with(lower(profile.display_name), normalized_search)');
    expect(migrationSql).toContain('or (can_read_wallet and profile.wallet_address = p_search)');
    expect(migrationSql).not.toContain("like normalized_search || '%'");
  });

  it('touches last-entered separately from real profile state updates', () => {
    expect(migrationSql).toContain('private.set_player_profile_updated_at');
    expect(migrationSql).toContain('new.updated_at := old.updated_at');
    expect(migrationSql).toContain('if p_touch_entry then');
  });

  it('rate-limits authorized mutation targets before their existence is disclosed', () => {
    const suspension = migrationSql.slice(
      migrationSql.indexOf('create or replace function public.admin_suspend_player'),
      migrationSql.indexOf('create or replace function public.admin_restore_player'),
    );
    expect(suspension.indexOf('private.claim_admin_player_operation_rate_limit')).toBeLessThan(
      suspension.indexOf('select p as profile_row, m as moderation_row into selected_rows'),
    );
  });

  it('contains no destructive operations, blockchain mutation, or later-phase storage', () => {
    expect(migrationSql).not.toMatch(/drop\s+schema|truncate\s+|alter\s+table\s+auth\./iu);
    expect(migrationSql).not.toMatch(
      /create table public\.(?:inventories|items|crops|recipes|houses|marketplace|rewards|stardust|chat|guilds)/iu,
    );
    expect(migrationSql).not.toMatch(/transfer|burn|mint_to|freeze_account|set_authority/iu);
  });
});

describe('Phase 6 world-management migrations', () => {
  const directory = new URL('../../../infrastructure/supabase/migrations/', import.meta.url);
  const testDirectory = new URL('../../../infrastructure/supabase/tests/', import.meta.url);
  const schemaSql = readFileSync(
    new URL('20260712100000_world_management_schema.sql', directory),
    'utf8',
  );
  const functionsSql = readFileSync(
    new URL('20260712101000_world_management_functions.sql', directory),
    'utf8',
  );
  const seedSql = readFileSync(
    new URL('20260712102000_world_management_seed.sql', directory),
    'utf8',
  );
  const adminSql = readFileSync(
    new URL('20260712103000_world_management_admin.sql', directory),
    'utf8',
  );
  const playerAdminSql = readFileSync(
    new URL('20260712104000_world_management_player_admin.sql', directory),
    'utf8',
  );
  const consolidationSql = readFileSync(
    new URL('20260712105000_player_rename_access_pagination.sql', directory),
    'utf8',
  );
  const liveOperationsSql = readFileSync(
    new URL('20260712106000_live_operations.sql', directory),
    'utf8',
  );
  const adminAuthorizationTestSql = readFileSync(
    new URL('admin_authorization.test.sql', testDirectory),
    'utf8',
  );
  const worldManagementTestSql = readFileSync(
    new URL('world_management.test.sql', testDirectory),
    'utf8',
  );
  const allSql = `${schemaSql}\n${functionsSql}\n${seedSql}\n${adminSql}\n${playerAdminSql}\n${consolidationSql}\n${liveOperationsSql}`;

  it('parses every forward-only Phase 6 migration with PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [
      schemaSql,
      functionsSql,
      seedSql,
      adminSql,
      playerAdminSql,
      consolidationSql,
      liveOperationsSql,
    ]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('default-denies live operations and exposes only narrow service-role RPCs', () => {
    for (const table of [
      'live_operations_maintenance',
      'game_announcements',
      'live_operations_audit_logs',
    ]) {
      expect(liveOperationsSql).toContain(`alter table public.${table} enable row level security`);
      expect(liveOperationsSql).toContain(`alter table public.${table} force row level security`);
      expect(liveOperationsSql).toContain(`revoke all on table public.${table}`);
    }
    expect(liveOperationsSql).toContain('LIVE_OPERATIONS_AUDIT_IMMUTABLE');
    expect(liveOperationsSql).not.toMatch(/create policy/iu);
    expect(liveOperationsSql).not.toMatch(/drop\s+schema|truncate\s+|alter\s+table\s+auth\./iu);
  });

  it('keeps the already-applied Phase 6 schema migration byte-for-byte immutable', () => {
    expect(createHash('sha256').update(schemaSql).digest('hex')).toBe(
      'dea85de062aaa494cda38e7f1c893606ab77e2b9500c1ecf9dd5c621798987df',
    );
  });

  it('ties hosted authorization assertions to the exact current permission catalog', () => {
    const expectedCatalogFixture = adminAuthorizationTestSql.slice(
      adminAuthorizationTestSql.indexOf('insert into expected_phase6_admin_permissions'),
      adminAuthorizationTestSql.indexOf("select has_table('public', 'admin_roles'"),
    );
    const assertedKeys = [...expectedCatalogFixture.matchAll(/\('([^']+)'\)/gu)]
      .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
      .sort();
    expect(assertedKeys).toEqual([...ADMIN_PERMISSION_KEYS].sort());
    expect(new Set(assertedKeys).size).toBe(ADMIN_PERMISSION_KEYS.length);
    expect(assertedKeys).toContain('maps.preview');
    expect(assertedKeys).toContain('maps.audit_read');
  });

  it('creates only the narrow world authority, catalog, audit, and rate-limit tables', () => {
    expect(
      [...schemaSql.matchAll(/create table public\.([a-z_]+)/giu)].map((match) => match[1]),
    ).toEqual([
      'world_maps',
      'world_map_versions',
      'world_assets',
      'world_map_version_assets',
      'world_audit_events',
      'world_operation_rate_limits',
    ]);
  });

  it('default-denies every world table and protects immutable history and append-only audit', () => {
    for (const table of [
      'world_maps',
      'world_map_versions',
      'world_assets',
      'world_map_version_assets',
      'world_audit_events',
      'world_operation_rate_limits',
    ]) {
      expect(schemaSql).toContain(`alter table public.${table} enable row level security`);
      expect(schemaSql).toContain(
        `revoke all on table public.${table} from anon, authenticated, service_role`,
      );
    }
    expect(schemaSql).toContain('PUBLISHED_WORLD_VERSION_IMMUTABLE');
    expect(schemaSql).toContain('WORLD_AUDIT_APPEND_ONLY');
    expect(allSql).not.toMatch(/create policy/iu);
  });

  it('closes every Phase 6 SECURITY DEFINER helper before later RPC grants', () => {
    for (const signature of [
      'private.world_manifest_checksum(jsonb)',
      'private.valid_world_reason(text)',
      'private.claim_world_rate_limit(text, text, integer, integer)',
      'private.world_map_json(public.world_maps)',
      'private.world_version_json(public.world_map_versions)',
      'private.world_player_state_json(public.player_profiles)',
      'private.point_inside_world_bounds(jsonb, numeric, numeric)',
      'private.point_blocked_by_world_manifest(jsonb, numeric, numeric, numeric)',
      'private.world_validation_issue(text, text, text)',
      'private.validate_world_manifest(uuid, jsonb)',
      'private.sync_world_version_assets(uuid, jsonb)',
      'private.player_profile_json(public.player_profiles)',
      'private.set_player_profile_updated_at()',
    ]) {
      expect(functionsSql).toContain(
        `revoke all on function ${signature}\n  from public, anon, authenticated, service_role`,
      );
    }

    for (const signature of [
      'public.get_current_published_world(text, text, integer)',
      'public.get_published_world_manifest(text, text, text, integer)',
      'public.transition_player_world(text, text, integer, uuid, text, integer)',
      'public.save_player_game_state(text, text, numeric, numeric, text, integer, text, integer)',
    ]) {
      expect(functionsSql).toContain(
        `revoke all on function ${signature}\n  from public, anon, authenticated`,
      );
    }
  });

  it('seeds exactly the five approved graph maps and truthful procedural assets', () => {
    for (const slug of [
      'lantern-square',
      'moonpetal-meadow',
      'brooklight-crossing',
      'hearthfield-road',
      'whisperpine-gate',
    ]) {
      expect(seedSql).toContain(`'${slug}'`);
    }
    expect(seedSql).toContain("'repository_procedural'");
    expect(seedSql).toContain("'application/x-starville-procedural'");
    expect(seedSql).not.toMatch(/https?:\/\//iu);
  });

  it('pins hosted catalog validation to the exact Phase 6 and Phase 7 marker set', async () => {
    const parser = new Parser({ version: 17 });
    const result = await parser.parse(worldManagementTestSql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);

    for (const assetKey of [
      'brooklight-sign',
      'bush-round',
      'closed-route-marker',
      'cottage-amber',
      'cottage-sage',
      'fence-willow',
      'flowers-moon',
      'lamp-star',
      'moonstone-marker',
      'notice-board',
      'orchard-road-sign',
      'phase7-cooking-hearth-marker',
      'phase7-crafting-workbench-marker',
      'phase7-farm-plot-marker',
      'phase7-general-store-marker',
      'phase7-home-entrance-marker',
      'rock-moss',
      'tree-maple',
      'tree-pine',
      'whisperpine-gate',
    ]) {
      expect(worldManagementTestSql).toContain(`'${assetKey}'`);
    }

    expect(worldManagementTestSql).toContain('count(*) = count(distinct asset.asset_key)');
    expect(worldManagementTestSql).toContain("asset.approval_status = 'approved'");
    expect(worldManagementTestSql).toContain("asset.production_status = 'development_marker'");
    expect(worldManagementTestSql).not.toContain(
      'the reviewed procedural catalog contains fifteen stable assets',
    );
  });

  it('keeps the safe Phase 6 seed replay idempotent', () => {
    for (const conflictTarget of [
      'on conflict (asset_key) do nothing',
      'on conflict (slug) do nothing',
      'on conflict (world_map_id, version_number) do nothing',
      'on conflict (world_map_version_id, world_asset_id) do nothing',
    ]) {
      expect(seedSql).toContain(conflictTarget);
    }
    expect(seedSql).toContain('map.active_published_version_id is distinct from version.id');
    expect(seedSql).toContain("existing.metadata ->> 'seeded' = 'true'");
    expect(seedSql).toContain("existing.metadata ->> 'assetKey' = asset.asset_key");
  });

  it('keeps map loading and transitions server-authoritative and stale-save safe', () => {
    expect(functionsSql).toContain('public.get_current_published_world');
    expect(functionsSql).toContain('public.get_published_world_manifest');
    expect(functionsSql).toContain('public.transition_player_world');
    expect(functionsSql).toContain('p_expected_game_state_version');
    expect(functionsSql).toContain('p_expected_map_version_id');
    expect(functionsSql).not.toMatch(/p_destination_(?:map|spawn|x|y)/iu);
    expect(functionsSql).toContain('game_state_version = game_state_version + 1');
    expect(functionsSql).toContain("lifecycle_status in ('published', 'superseded')");
  });

  it('loads paired map and version composites through one record target', () => {
    for (const sql of [functionsSql, playerAdminSql]) {
      expect(sql).not.toMatch(
        /select\s+map\.\*,\s*version\.\*\s+into\s+[a-z_][a-z0-9_]*\s*,\s*[a-z_][a-z0-9_]*/iu,
      );
    }

    expect(
      functionsSql.match(/select map as map_row, version as version_row\s+into selected_world/gu),
    ).toHaveLength(6);
    expect(
      playerAdminSql.match(/select map as map_row, version as version_row\s+into selected_world/gu),
    ).toHaveLength(1);

    const replayBranch = functionsSql.slice(
      functionsSql.indexOf('if profile.last_transition_request_id = p_request_id then'),
      functionsSql.indexOf('if profile.game_state_version <> p_expected_game_state_version'),
    );
    expect(replayBranch.indexOf('if not found then')).toBeGreaterThanOrEqual(0);
    expect(replayBranch.indexOf('if not found then')).toBeLessThan(
      replayBranch.indexOf('destination_map := selected_world.map_row'),
    );
  });

  it('keeps manifest validation free of ambiguous variables and operator precedence traps', () => {
    expect(functionsSql).not.toContain('where asset.asset_key = asset_key');
    expect(functionsSql).toContain('where asset.asset_key = requested_asset_key');
    expect(functionsSql).toContain(
      "or not ((p_manifest -> 'assets') ? (map_object ->> 'assetId')) then",
    );
  });

  it('aligns Phase 5 player administration with published multi-map state', () => {
    expect(playerAdminSql).toContain('create or replace function public.list_admin_players');
    expect(playerAdminSql).toContain('profile.current_map_id = p_map_id');
    expect(playerAdminSql).toContain(
      'create or replace function public.admin_reset_player_position',
    );
    expect(playerAdminSql).toContain('current_map_version_id = default_version.id');
    expect(playerAdminSql).toContain("value ->> 'id' = default_map.default_spawn_id");
    expect(playerAdminSql).not.toMatch(/safe_position_[xy]\s*=\s*(?:12|7\.5)/u);
  });

  it('requires exact administrator permissions and atomic publication safeguards', () => {
    for (const permission of [
      'maps.read',
      'maps.edit',
      'maps.preview',
      'maps.publish',
      'maps.audit_read',
      'assets.read',
    ]) {
      expect(adminSql).toContain(`'${permission}'`);
    }
    expect(adminSql).toContain("set_config('starville.world_publication_transition', 'true'");
    expect(adminSql).toContain('private.world_manifest_checksum(selected_version.manifest)');
    expect(adminSql).toContain("lifecycle_status = 'superseded'");
    expect(adminSql).toContain("'world.version_published'");
    expect(adminSql).toContain("case when p_direction = 'desc' then ordering end desc");
  });

  it('contains no destructive reset, blockchain mutation, or Phase 7–9 storage', () => {
    expect(allSql).not.toMatch(/drop\s+schema|truncate\s+|alter\s+table\s+auth\./iu);
    expect(allSql).not.toMatch(/transfer|mint_to|burn|set_authority|seed phrase|private key/iu);
    expect(allSql).not.toMatch(
      /create table public\.(?:inventories|crops|recipes|chat|friends|guilds|rewards|claims|stardust)/iu,
    );
  });
});

describe('Phase 7 cozy-gameplay migrations', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const migrationNames = [
    '20260713100000_cozy_gameplay_foundation.sql',
    '20260713101000_cozy_gameplay_actions.sql',
    '20260713101500_cozy_world_interactions.sql',
    '20260713102000_cozy_gameplay_housing_admin.sql',
  ] as const;
  const migrations = migrationNames.map((name) =>
    readFileSync(new URL(name, migrationDirectory), 'utf8'),
  );
  const allSql = migrations.join('\n');

  it('parses every Phase 7 migration with the hosted PostgreSQL grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of migrations) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('keeps every cozy table default-deny behind forced RLS', () => {
    const tables = [...allSql.matchAll(/create table public\.([a-z_]+)/giu)].map(
      (match) => match[1],
    );
    expect(tables.length).toBeGreaterThanOrEqual(20);
    for (const table of tables.filter((name): name is string => name !== undefined)) {
      expect(allSql).toContain(`'${table}'`);
    }
    expect(allSql).toContain(`alter table public.%I force row level security`);
    expect(allSql).toContain(`revoke all on table public.%I from public`);
    expect(allSql).not.toMatch(/create policy[\s\S]{0,160}for (?:insert|update|delete)/iu);
  });

  it('grants only reviewed player RPC execution to the service role', () => {
    for (const rpc of [
      'bootstrap_player_cozy_gameplay',
      'plant_player_farm_plot',
      'water_player_farm_plot',
      'harvest_player_farm_plot',
      'perform_player_recipe_action',
      'transact_player_shop',
      'enter_player_home',
      'exit_player_home',
      'place_player_home_furniture',
      'move_player_home_furniture',
      'rotate_player_home_furniture',
      'remove_player_home_furniture',
    ]) {
      expect(allSql).toMatch(new RegExp(`grant execute on function public\\.${rpc}`, 'u'));
      expect(allSql).toMatch(new RegExp(`revoke all on function public\\.${rpc}`, 'u'));
    }
  });

  it('contains the required authority, concurrency, and privacy safeguards', () => {
    expect(allSql).toContain('player_dust_ledger');
    expect(allSql).toContain('private.reject_cozy_append_only_mutation');
    expect(allSql).toContain('cozy_gameplay_idempotency');
    expect(allSql).toContain('for update');
    expect(allSql).toContain('starter_grant_applied_at');
    expect(allSql).toContain('private.cozy_furniture_placement_valid');
    expect(allSql).toContain('home_access_denied');
    expect(allSql).not.toMatch(
      /create table public\.(?:player_trades|marketplace|rewards|claims)/iu,
    );
    expect(allSql).not.toMatch(/\$DUST|mint_to|burn|set_authority/iu);
  });
});

describe('Phase 7.5A world-asset-manager migrations', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const migrationNames = [
    '20260713110000_world_asset_manager_schema.sql',
    '20260713111000_world_asset_manager_functions.sql',
    '20260713111500_world_asset_manager_world_integration.sql',
    '20260713112000_world_asset_manager_storage.sql',
    '20260713113000_fix_asset_audit_read_permission.sql',
    '20260713114000_fix_database_lint_warnings.sql',
    '20260713115000_fix_final_hosted_validation.sql',
  ] as const;
  const [
    schemaSql = '',
    functionsSql = '',
    integrationSql = '',
    storageSql = '',
    permissionCorrectionSql = '',
    lintCorrectionSql = '',
    finalValidationSql = '',
  ] = migrationNames.map((name) => readFileSync(new URL(name, migrationDirectory), 'utf8'));
  const allSql = [
    schemaSql,
    functionsSql,
    integrationSql,
    storageSql,
    permissionCorrectionSql,
    lintCorrectionSql,
    finalValidationSql,
  ].join('\n');

  it('parses every forward-only migration with the hosted PostgreSQL grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [
      schemaSql,
      functionsSql,
      integrationSql,
      storageSql,
      permissionCorrectionSql,
      lintCorrectionSql,
      finalValidationSql,
    ]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('validates every retained administrator read request ID without changing RPC signatures', () => {
    const requestIdFunctions = [
      'get_admin_game_asset_version',
      'list_admin_game_asset_review_queue',
      'get_admin_world_draft',
      'list_admin_world_audit',
      'list_admin_world_assets',
      'list_admin_game_assets',
      'get_admin_game_asset',
      'list_admin_game_asset_audit',
      'list_admin_game_asset_references',
      'get_admin_game_asset_preview_material',
      'list_admin_world_editor_asset_candidates',
    ];

    expect(lintCorrectionSql).toContain("p_request_id !~ '^[A-Za-z0-9._:-]{1,128}$'");
    expect(
      lintCorrectionSql.match(/private\.assert_valid_request_id\(p_request_id\)/gu),
    ).toHaveLength(requestIdFunctions.length);
    expect(lintCorrectionSql).not.toMatch(/perform\s+p_request_id|:=\s*p_request_id\s*;/iu);

    for (const functionName of requestIdFunctions) {
      expect(
        lintCorrectionSql.match(
          new RegExp(`create or replace function public\\.${functionName}\\(`, 'gu'),
        ),
      ).toHaveLength(1);
    }
  });

  it('keeps asset-validation checks immutable without stable timestamp casts', () => {
    const validationStart = finalValidationSql.indexOf(
      'create or replace function private.valid_world_asset_validation_results',
    );
    const validationEnd = finalValidationSql.indexOf(
      'revoke all on function private.valid_world_asset_validation_results',
      validationStart,
    );
    const validationBlock = finalValidationSql.slice(validationStart, validationEnd);

    expect(validationBlock).toContain('immutable');
    expect(validationBlock).toContain('pg_catalog.make_date');
    expect(validationBlock).toContain('octet_length(p_value::text) > 65536');
    expect(validationBlock).toContain("jsonb_typeof(p_value -> 'issues') is distinct from 'array'");
    expect(validationBlock).not.toContain('pg_column_size');
    expect(validationBlock).not.toMatch(/::\s*timestamptz|to_timestamp\s*\(/iu);
    expect(schemaSql).toContain('private.valid_world_asset_validation_results(validation_results)');
  });

  it('removes only lint-unused row variables while retaining their behavioral checks', () => {
    const cozyRemoveStart = lintCorrectionSql.indexOf(
      'create or replace function private.cozy_remove_item',
    );
    const furnitureStart = lintCorrectionSql.indexOf(
      'create or replace function private.cozy_furniture_mutation',
    );
    const manifestStart = lintCorrectionSql.indexOf(
      'create or replace function private.phase6_get_published_world_manifest',
    );
    const revokeStart = lintCorrectionSql.indexOf(
      'revoke all on function private.assert_valid_request_id',
    );
    const cozyRemoveBlock = lintCorrectionSql.slice(cozyRemoveStart, furnitureStart);
    const furnitureBlock = lintCorrectionSql.slice(furnitureStart, manifestStart);
    const manifestBlock = lintCorrectionSql.slice(manifestStart, revokeStart);

    expect(cozyRemoveBlock).not.toMatch(/state\s+public\.player_inventory_state|into\s+state/iu);
    expect(cozyRemoveBlock).toContain('perform 1 from public.player_inventory_state');
    expect(cozyRemoveBlock.match(/if not found then raise no_data_found/gu)).toHaveLength(2);
    expect(furnitureBlock).not.toMatch(/stack\s+public\.player_inventory_stacks|into\s+stack/iu);
    expect(furnitureBlock).toContain('perform 1 from public.player_inventory_stacks');
    expect(furnitureBlock).toContain("return jsonb_build_object('status','item_unavailable')");
    expect(manifestBlock).not.toMatch(/profile\s+public\.player_profiles|profile\s*:=/iu);
    expect(manifestBlock).toContain('from public.player_profiles as p');
    expect(manifestBlock).toContain("return jsonb_build_object('status', 'not_found')");
  });

  it('renames deployed asset-audit permission metadata in place', () => {
    expect(`${schemaSql}\n${functionsSql}`).toContain("'assets.audit.read'");
    expect(`${schemaSql}\n${functionsSql}`).not.toContain('assets.audit_read');
    expect(permissionCorrectionSql).toContain(
      "update public.admin_permissions\nset key = 'assets.audit.read'\nwhere key = 'assets.audit_read'",
    );
    expect(permissionCorrectionSql).toContain('disable trigger admin_permissions_protect_system');
    expect(permissionCorrectionSql).toContain('enable trigger admin_permissions_protect_system');
    expect(permissionCorrectionSql).not.toMatch(
      /(?:insert\s+into|delete\s+from)\s+public\.admin_permissions/iu,
    );
    expect(permissionCorrectionSql).not.toMatch(
      /(?:insert\s+into|delete\s+from|update)\s+public\.admin_role_permissions/iu,
    );
  });

  it('creates only the bounded version, workflow, reference, audit, and abuse-control tables', () => {
    expect(
      [...schemaSql.matchAll(/create table public\.([a-z_]+)/giu)].map((match) => match[1]),
    ).toEqual([
      'world_asset_versions',
      'world_asset_uploads',
      'world_asset_processing_jobs',
      'world_asset_tags',
      'world_asset_version_tags',
      'world_asset_validation_checks',
      'world_asset_reviews',
      'world_asset_references',
      'world_asset_audit_events',
      'world_asset_operation_idempotency',
      'world_asset_operation_rate_limits',
    ]);
  });

  it('forces RLS and removes direct browser and service-role table access', () => {
    for (const table of [
      'world_asset_versions',
      'world_asset_uploads',
      'world_asset_processing_jobs',
      'world_asset_tags',
      'world_asset_version_tags',
      'world_asset_validation_checks',
      'world_asset_reviews',
      'world_asset_references',
      'world_asset_audit_events',
      'world_asset_operation_idempotency',
      'world_asset_operation_rate_limits',
    ]) {
      expect(schemaSql).toContain(`'${table}'`);
    }
    expect(schemaSql).toContain("execute format('alter table public.%I enable row level security'");
    expect(schemaSql).toContain("execute format('alter table public.%I force row level security'");
    expect(schemaSql).toContain(
      "execute format('revoke all on table public.%I from public, anon, authenticated, service_role'",
    );
  });

  it('keeps approved versions immutable and lifecycle evidence append-only', () => {
    expect(schemaSql).toContain('private.protect_world_asset_version_history');
    expect(schemaSql).toContain('private.reject_world_asset_append_only_mutation');
    expect(schemaSql).toContain('world_asset_validation_checks_append_only');
    expect(schemaSql).toContain('world_asset_reviews_append_only');
    expect(schemaSql).toContain('world_asset_audit_events_append_only');
    expect(schemaSql).toContain('unique (request_id, event_key)');
  });

  it('uses upload authority for automatic processing and separate validation authority', () => {
    const completeStart = functionsSql.indexOf(
      'create or replace function public.complete_admin_game_asset_processing',
    );
    const failStart = functionsSql.indexOf(
      'create or replace function public.fail_admin_game_asset_processing',
    );
    const validateStart = functionsSql.indexOf(
      'create or replace function public.validate_admin_game_asset_version',
    );
    const completeBlock = functionsSql.slice(completeStart, failStart);
    const failBlock = functionsSql.slice(
      failStart,
      functionsSql.indexOf(
        'create or replace function public.get_admin_game_asset_preview_material',
        failStart,
      ),
    );
    const validateBlock = functionsSql.slice(
      validateStart,
      functionsSql.indexOf(
        'create or replace function public.submit_admin_game_asset_review',
        validateStart,
      ),
    );
    expect(completeBlock).toContain("'assets.upload'");
    expect(completeBlock).not.toContain("'assets.validate'");
    expect(failBlock).toContain("'assets.upload'");
    expect(failBlock).not.toContain("'assets.validate'");
    expect(validateBlock).toContain("'assets.validate'");
  });

  it('pins immutable versions and derives map replacement audit from trusted manifests', () => {
    expect(integrationSql).toContain('world_asset_version_id');
    expect(integrationSql).toContain('private.clone_world_version_asset_pins');
    expect(integrationSql).toContain('private.phase6_create_admin_world_draft');
    expect(integrationSql).toContain('private.phase6_derive_admin_world_version');
    expect(integrationSql).toContain('private.phase6_save_admin_world_draft');
    expect(integrationSql).toContain(
      'coalesce(retained.world_asset_version_id, asset.active_version_id)',
    );
    expect(integrationSql).toContain("'asset.world.replacement_performed'");
    expect(integrationSql).toContain("'maps.edit'");
    expect(integrationSql).toContain(
      'before_object.asset_key is distinct from after_object.asset_key',
    );
    expect(integrationSql).toContain("'assetDeliveries'");
    expect(integrationSql).toContain("'repository_procedural'");
  });

  it('keeps seeded categories valid and bounds detail and review aggregates', () => {
    expect(schemaSql).toContain(
      "when asset_key like '%cooking-hearth%' or asset_key like '%crafting-workbench%' or asset_key like '%home-entrance%' then 'structure'",
    );
    expect(functionsSql.match(/limit 100/gu)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(functionsSql).toContain('p_expected_asset_revision integer');
    expect(functionsSql).toContain('p_expected_edit_version integer');
    expect(functionsSql).toContain("'status', 'asset_version_conflict'");
  });

  it('binds reservation replays to their original target and binary metadata', () => {
    expect(functionsSql).toContain('replay_asset.asset_key = p_slug');
    expect(functionsSql).toContain('replay_asset.friendly_name = p_friendly_name');
    expect(functionsSql).toContain('replay_upload.original_file_name = p_original_file_name');
    expect(functionsSql).toContain('replay_upload.declared_mime_type = p_declared_mime_type');
    expect(functionsSql).toContain('replay_upload.declared_size_bytes = p_declared_size_bytes');
    expect(functionsSql).toContain("event.event_key = 'asset.version.created'");
  });

  it('synchronizes only concrete Phase 7 asset refs and gates compatible replacements', () => {
    for (const source of [
      'cozy_item_definitions',
      'cozy_crop_definitions',
      'cozy_furniture_definitions',
    ]) {
      expect(integrationSql).toContain(source);
    }
    expect(integrationSql).toContain('private.sync_world_asset_content_reference');
    expect(integrationSql).toContain('private.world_manifest_assets_compatible');
    expect(integrationSql).toContain("when 'notice' then 'sign'");
    expect(integrationSql).toContain("return jsonb_build_object('status', 'state_conflict')");
  });

  it('keeps original preview intake paths behind one exact administrator material RPC', () => {
    expect(functionsSql).toContain("'originalPath', original_path");
    expect(functionsSql).toContain('upload.world_asset_id = p_asset_id');
    expect(functionsSql).toContain('upload.world_asset_version_id = p_version_id');
    expect(functionsSql).toContain('order by upload.created_at desc, upload.id desc');
  });

  it('protects private intake and managed writes without blocking public delivery GETs', () => {
    expect(storageSql).toContain("'asset-intake', 'asset-intake', false");
    expect(storageSql).toContain("'game-assets', 'game-assets', true");
    expect(storageSql.match(/as restrictive/giu)).toHaveLength(4);
    expect(storageSql).toContain('starville_asset_intake_read_guard');
    expect(storageSql).toContain('starville_asset_bucket_insert_guard');
    expect(storageSql).toContain('starville_asset_bucket_update_guard');
    expect(storageSql).toContain('starville_asset_bucket_delete_guard');
    expect(storageSql).not.toMatch(/for select[\s\S]{0,120}bucket_id[^;]*game-assets/iu);
  });

  it('contains no destructive reset, secret material, or client-side table grant', () => {
    expect(allSql).not.toMatch(/drop\s+schema|truncate\s+|alter\s+table\s+auth\./iu);
    expect(allSql).not.toMatch(/service.role.key|seed phrase|private key|database password/iu);
    expect(allSql).not.toMatch(
      /grant\s+(?:select|insert|update|delete|all)\s+on\s+table\s+public\./iu,
    );
  });
});

describe('Phase 7.5B platform-configuration migrations', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const schemaSql = readFileSync(
    new URL('20260714100000_platform_configuration_schema.sql', migrationDirectory),
    'utf8',
  );
  const functionsSql = readFileSync(
    new URL('20260714101000_platform_configuration_functions.sql', migrationDirectory),
    'utf8',
  );
  const allSql = `${schemaSql}\n${functionsSql}`;

  it('parses both forward-only migrations with the hosted PostgreSQL grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [schemaSql, functionsSql]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('creates only the game, version, active pointer, audit, and rate-limit authority tables', () => {
    expect(
      [...schemaSql.matchAll(/create table public\.([a-z_]+)/giu)].map((match) => match[1]),
    ).toEqual([
      'game_platforms',
      'game_platform_configuration_versions',
      'game_platform_active_configuration',
      'game_platform_configuration_audit',
      'game_platform_configuration_rate_limits',
    ]);
  });

  it('forces RLS, revokes direct access, and exposes only narrow RPC execution', () => {
    for (const table of [
      'game_platforms',
      'game_platform_configuration_versions',
      'game_platform_active_configuration',
      'game_platform_configuration_audit',
      'game_platform_configuration_rate_limits',
    ]) {
      expect(schemaSql).toContain(`alter table public.${table} enable row level security`);
      expect(schemaSql).toContain(`alter table public.${table} force row level security`);
      expect(schemaSql).toContain(`revoke all on table public.${table}`);
    }
    expect(functionsSql).toContain(
      'grant execute on function public.get_active_platform_configuration(text) to service_role',
    );
    expect(functionsSql).toContain('private.claim_platform_configuration_rate_limit');
    expect(functionsSql).not.toContain(
      'grant execute on function public.get_active_platform_configuration(text) to anon',
    );
    expect(functionsSql).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+table/iu);
  });

  it('protects published JSON, append-only audit, optimistic revisions, and idempotency', () => {
    expect(schemaSql).toContain('PLATFORM_CONFIGURATION_VERSION_IMMUTABLE');
    expect(schemaSql).toContain('PLATFORM_CONFIGURATION_AUDIT_IMMUTABLE');
    expect(schemaSql).toContain('unique (game_platform_id, request_id, action)');
    expect(functionsSql).toContain("jsonb_build_object('status', 'version_conflict')");
    expect(functionsSql).toContain("jsonb_build_object('status', 'idempotent'");
    expect(functionsSql).toContain('for update');
  });

  it('pins only active approved profile-compatible asset versions', () => {
    expect(functionsSql).toContain('private.platform_configuration_assets_approved');
    expect(functionsSql).toContain("asset.production_status = 'approved_production'");
    expect(functionsSql).toContain('asset.active_version_id = version.id');
    for (const profile of [
      'brand_logo',
      'brand_mark',
      'favicon',
      'admin_login_background',
      'landing_hero_background',
      'social_share_image',
    ]) {
      expect(schemaSql).toContain(`'${profile}'`);
    }
  });

  it('contains no raw code, secret, infrastructure, or destructive configuration path', () => {
    expect(allSql).toContain("'(javascript:|<script|<style|<iframe|onerror");
    expect(allSql).not.toMatch(/supabase_url|service_role_key|database_url|solana_rpc_url/iu);
    expect(allSql).not.toMatch(/drop\s+schema|truncate\s+|alter\s+table\s+auth\./iu);
  });
});
