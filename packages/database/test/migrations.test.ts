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
  const phase5Sql = readFileSync(
    new URL('20260711110000_secure_player_operations.sql', migrationDirectory),
    'utf8',
  );
  const phase6Sql = readFileSync(
    new URL('20260712100000_world_management_schema.sql', migrationDirectory),
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
    const mappingBlock = `${catalogSql.slice(
      catalogSql.indexOf('with mapping(role_key, permission_key)'),
    )}\n${phase5MappingBlock}\n${phase6MappingBlock}`;
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
  const allSql = `${schemaSql}\n${functionsSql}\n${seedSql}\n${adminSql}\n${playerAdminSql}`;

  it('parses every forward-only Phase 6 migration with PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [schemaSql, functionsSql, seedSql, adminSql, playerAdminSql]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
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
