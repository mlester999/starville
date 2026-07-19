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

describe('secure World Game Test migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260716120000_open_in_game_test_sessions.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses with the hosted PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    const result = await parser.parse(sql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
  });

  it('stores only token hashes in forced-RLS tables and exposes no browser grants', () => {
    expect(sql).toContain('create table public.world_game_test_sessions');
    expect(sql).toContain('grant_token_hash text unique');
    expect(sql).toContain('session_token_hash text unique');
    expect(sql).not.toMatch(/\b(?:grant_token|session_token)\s+text\b/iu);
    for (const table of ['world_game_test_sessions', 'world_game_test_evidence']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toContain(`revoke all on table public.${table}`);
    }
    expect(sql).not.toMatch(/create policy/iu);
  });

  it('binds issuance to maps.preview, AAL2, one exact validated revision, and a 15–30 minute TTL', () => {
    expect(sql).toContain("p_user_id, p_auth_session_id, p_assurance_level, 'maps.preview'");
    expect(sql).toContain("if p_assurance_level <> 'aal2'");
    expect(sql).toContain("lifecycle_status = 'validated'");
    expect(sql).toContain('selected_version.edit_version <> p_expected_edit_version');
    expect(sql).toContain('selected_version.checksum <> p_expected_checksum');
    expect(sql).toContain("expires_at >= created_at + interval '15 minutes'");
    expect(sql).toContain("expires_at <= created_at + interval '30 minutes'");
    expect(sql).toContain('private.world_game_test_maintenance_blocked()');
    expect(sql).toContain('private.world_game_test_revision_available(selected)');
  });

  it('atomically consumes grants, checks revocation on reload, and isolates realtime', () => {
    expect(sql).toContain('for update;');
    expect(sql).toContain('grant_token_hash = null');
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain('private.evaluate_admin_authorization');
    expect(sql).toContain("'mode', 'disabled_private_solo'");
    expect(sql).toContain("'publicChannelJoined', false");
    expect(sql).toContain('private.world_asset_deliveries_for_version(version.id)');
    expect(sql).toContain("'newerDraftAvailable', exists");
  });

  it('keeps evidence append-only, revision-bound, explicit, and separate from publication', () => {
    expect(sql).toContain('WORLD_GAME_TEST_EVIDENCE_APPEND_ONLY');
    expect(sql).toContain("result in ('passed', 'failed', 'blocked', 'needs_changes')");
    expect(sql).toContain('world_map_version_id');
    expect(sql).toContain("'publicationReadiness'");
    expect(sql).not.toContain('publish_admin_world_version(');
    expect(sql).toContain('create or replace function public.get_admin_world_game_test_status');
    expect(sql).toContain("when prior_pass_exists then 'test_outdated'");
  });
});

describe('Phase 10C immutable World Composer lifecycle migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260716121000_phase10c_world_composer_lifecycle.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses with the hosted PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    const result = await parser.parse(sql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
  });

  it('uses an additive head pointer and append-only review/publication ledgers', () => {
    expect(sql).toContain('create table public.world_draft_heads');
    expect(sql).toContain('create table public.world_revision_metadata');
    expect(sql).toContain('create table public.world_publication_reviews');
    expect(sql).toContain('create table public.world_publication_records');
    expect(sql).toContain('WORLD_REVISION_EVIDENCE_APPEND_ONLY');
    expect(sql).not.toMatch(/drop\s+table/iu);
  });

  it('keeps server-derived helpers volatility-compatible and search-path safe', () => {
    expect(sql).toMatch(
      /function private\.world_manifest_change_summary[\s\S]*?language sql\s+immutable\s+security definer\s+set search_path = ''/u,
    );
    expect(sql).toMatch(
      /function private\.world_manifest_rotations_compatible[\s\S]*?language plpgsql\s+stable\s+security definer\s+set search_path = ''/u,
    );
    expect(sql).toMatch(
      /function private\.world_revision_assets_runtime_ready[\s\S]*?language sql\s+stable\s+security definer\s+set search_path = ''/u,
    );
    expect(sql).toMatch(
      /function public\.publish_admin_world_revision[\s\S]*?language plpgsql\s+volatile\s+security definer\s+set search_path = ''/u,
    );
  });

  it('requires exact evidence and review before copy-on-publish, and preserves rollback history', () => {
    expect(sql).toContain("and result = 'passed'");
    expect(sql).toContain("and operation = 'publish'");
    expect(sql).toContain("and operation = 'rollback'");
    expect(sql).toContain("'review_required'");
    expect(sql).toContain('insert into public.world_map_versions');
    expect(sql).toContain('source_revision_id');
    expect(sql).toContain("'world.version_rolled_back'");
    expect(sql).toContain('PUBLISHED_WORLD_VERSION_IMMUTABLE');
  });

  it('forces RLS, exposes only narrow service RPCs, and revokes the legacy publisher', () => {
    for (const table of [
      'world_draft_heads',
      'world_revision_metadata',
      'world_publication_reviews',
      'world_publication_records',
    ]) {
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toContain(`revoke all on table public.${table}`);
    }
    expect(sql).toContain('revoke all on function public.publish_admin_world_version(');
    expect(sql).toContain('grant execute on function public.publish_admin_world_revision(');
    expect(sql).toContain('grant execute on function public.rollback_admin_world_revision(');
  });
});

describe('Phase 11A playable vertical slice migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260717100000_phase11a_playable_vertical_slice.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses with the hosted PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    const result = await parser.parse(sql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
  });

  it('keeps persistence owner-scoped and the tutorial reward server-authoritative', () => {
    expect(sql).toContain('force row level security');
    expect(sql).toContain('private.cozy_apply_dust_delta');
    expect(sql).toContain("'starter_farming_quest_reward'");
    expect(sql).toContain('create or replace function public.deliver_player_starter_farming_quest');
    expect(sql).not.toMatch(/drop\s+table/iu);
  });
});

describe('Phase 11A private-home realtime migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260717101000_phase11a_private_home_realtime.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses with the hosted PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    const result = await parser.parse(sql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
  });

  it('uses one-use owner tickets, event-log cursors, forced RLS, and narrow service grants', () => {
    expect(sql).toContain('consumed_at');
    expect(sql).toContain('player_profile_id = profile.id');
    expect(sql).toContain('event_number > p_after_event_number');
    expect(sql).toContain('limit 100');
    expect(sql).toContain('force row level security');
    expect(sql).toContain(
      'grant execute on function public.admit_player_private_home_realtime_ticket',
    );
    expect(sql).not.toContain('grant select on');
  });
});

describe('Phase 11A farming content-management migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260717102000_phase11a_farming_content_management.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses with the hosted PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    const result = await parser.parse(sql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
  });

  it('uses audited optimistic updates and immutable successors without rewriting player state', () => {
    expect(sql).toContain("'farming.content_manage'");
    expect(sql).toContain("'farming.reward_manage'");
    expect(sql).toContain('p_expected_content_version integer');
    expect(sql).toContain('p_expected_configuration_revision integer');
    expect(sql).toContain('create_admin_farming_plot_template_successor');
    expect(sql).toContain('create_admin_starter_quest_successor');
    expect(sql).toContain('cozy_active_home_templates');
    expect(sql).toContain('instance.quest_version_id');
    expect(sql).not.toMatch(
      /delete from public\.player_|update public\.player_home_crop_instances/iu,
    );
  });

  it('forces the active-template pointer behind RLS and exposes only narrow service RPCs', () => {
    expect(sql).toContain('alter table public.cozy_active_home_templates force row level security');
    expect(sql).toContain('revoke all on table public.cozy_active_home_templates');
    expect(sql).toContain('grant execute on function public.update_admin_farming_item');
    expect(sql).toContain('grant execute on function public.create_admin_starter_quest_successor');
    expect(sql).not.toContain('grant select on');
  });
});

describe('Phase 11B workstation and offline-job migration chain', () => {
  const directory = new URL('../../../infrastructure/supabase/migrations/', import.meta.url);
  const schemaSql = readFileSync(
    new URL('20260717110000_phase11b_workstation_recipe_job_schema.sql', directory),
    'utf8',
  );
  const functionsSql = readFileSync(
    new URL('20260717111000_phase11b_workstation_job_functions.sql', directory),
    'utf8',
  );
  const adminSql = readFileSync(
    new URL('20260717112000_phase11b_crafting_admin_reconciliation.sql', directory),
    'utf8',
  );
  const compatibilitySql = readFileSync(
    new URL('20260717113000_phase11b_quest_compatibility.sql', directory),
    'utf8',
  );

  it('parses every forward migration with the hosted PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [schemaSql, functionsSql, adminSql, compatibilitySql]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('uses immutable recipe versions, consume-on-start snapshots, and collect-once outputs', () => {
    expect(schemaSql).toContain('cozy_recipe_versions_immutable');
    expect(schemaSql).toContain(
      "simultaneous_job_policy text not null default 'bounded_owner_queue'",
    );
    expect(schemaSql).toContain("cancellation_policy text not null default 'disabled'");
    expect(functionsSql).toContain("'cooking_ingredient_consumed'");
    expect(functionsSql).toContain("'crafting_output_collected'");
    expect(functionsSql).toContain('ingredient_snapshot');
    expect(functionsSql).toContain('output_settlement_reference');
    expect(functionsSql).toContain("select jsonb_build_object('status','recipe_job_required')");
  });

  it('derives completion from server timestamps and reconciles bounded batches without job timers', () => {
    expect(functionsSql).toContain("job.status='running' and job.completes_at<=now()");
    expect(adminSql).toContain('limit p_limit for update skip locked');
    expect(adminSql).toContain("'perJobTimersScheduled',false");
    expect(adminSql).not.toMatch(/setTimeout|setInterval|pg_cron/iu);
  });

  it('forces RLS, has no browser table grants, and keeps admin changes permissioned and audited', () => {
    for (const table of [
      'player_home_workstations',
      'cozy_recipe_versions',
      'player_recipe_unlocks',
      'player_crafting_jobs',
      'cozy_crafting_job_events',
      'cozy_crafting_reconciliation_queue',
    ]) {
      expect(schemaSql).toContain(`'${table}'`);
    }
    expect(schemaSql).toContain(
      "execute format('alter table public.%I force row level security', table_name)",
    );
    expect(schemaSql).toContain(
      "execute format('revoke all on table public.%I from public,anon,authenticated,service_role', table_name)",
    );
    expect(`${functionsSql}\n${adminSql}`).not.toMatch(
      /grant execute[^;]+to (?:public|anon|authenticated)/iu,
    );
    expect(adminSql).toContain('cozy_crafting_admin_audit_events_append_only');
    expect(adminSql).toContain("'crafting.job_reconcile'");
  });

  it('keeps the Phase 11A farming delivery pinned to the farming quest kind', () => {
    expect(compatibilitySql).toContain("quest_version.quest_kind='farming_tutorial'");
    expect(compatibilitySql).toContain('for update of instance_row');
    expect(compatibilitySql).not.toMatch(/delete from public\.player_quest_instances/iu);
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
  const realtimePresenceSql = readFileSync(
    new URL('20260715100000_realtime_presence_foundation.sql', migrationDirectory),
    'utf8',
  );
  const multiplayerChatSql = readFileSync(
    new URL('20260715110000_multiplayer_chat_moderation.sql', migrationDirectory),
    'utf8',
  );
  const socialInteractionsSql = readFileSync(
    new URL('20260715120000_nearby_social_interactions.sql', migrationDirectory),
    'utf8',
  );
  const socialGraphSql = readFileSync(
    new URL('20260715130000_friends_parties_social_graph.sql', migrationDirectory),
    'utf8',
  );
  const cooperativeActivitiesSql = readFileSync(
    new URL('20260715140000_cooperative_activities_schema.sql', migrationDirectory),
    'utf8',
  );
  const economySchemaSql = readFileSync(
    new URL('20260716090000_phase9a_economy_schema.sql', migrationDirectory),
    'utf8',
  );
  const avatarSchemaSql = readFileSync(
    new URL('20260716100000_phase10a_avatar_schema.sql', migrationDirectory),
    'utf8',
  );
  const cosmeticSchemaSql = readFileSync(
    new URL('20260716110000_phase10b_cosmetic_schema.sql', migrationDirectory),
    'utf8',
  );
  const phase10cWorldComposerSql = readFileSync(
    new URL('20260716121000_phase10c_world_composer_lifecycle.sql', migrationDirectory),
    'utf8',
  );
  const phase11PlayableSql = readFileSync(
    new URL('20260717100000_phase11a_playable_vertical_slice.sql', migrationDirectory),
    'utf8',
  );
  const phase11ContentManagementSql = readFileSync(
    new URL('20260717102000_phase11a_farming_content_management.sql', migrationDirectory),
    'utf8',
  );
  const phase11bSchemaSql = readFileSync(
    new URL('20260717110000_phase11b_workstation_recipe_job_schema.sql', migrationDirectory),
    'utf8',
  );
  const phase11cSchemaSql = readFileSync(
    new URL('20260717120000_phase11c_shop_catalog_transaction_schema.sql', migrationDirectory),
    'utf8',
  );
  const phase11dSchemaSql = readFileSync(
    new URL('20260717130000_phase11d_progression_schema.sql', migrationDirectory),
    'utf8',
  );
  const phase11eSchemaSql = readFileSync(
    new URL('20260717140000_phase11e_housing_schema.sql', migrationDirectory),
    'utf8',
  );
  const phase11fSchemaSql = readFileSync(
    new URL('20260718100000_phase11f_home_visits_schema.sql', migrationDirectory),
    'utf8',
  );
  const phase12aSchemaSql = readFileSync(
    new URL('20260718110000_phase12a_player_experience_schema.sql', migrationDirectory),
    'utf8',
  );
  const phase12aFunctionsSql = readFileSync(
    new URL('20260718111000_phase12a_player_experience_functions.sql', migrationDirectory),
    'utf8',
  );
  const phase12aAdminWorkerSql = readFileSync(
    new URL('20260718112000_phase12a_player_experience_admin_worker.sql', migrationDirectory),
    'utf8',
  );
  const allSql = `${schemaSql}\n${catalogSql}\n${authorizationSql}`;

  it('parses every migration with the hosted PostgreSQL major version grammar', async () => {
    const parser = new Parser({ version: 17 });

    for (const sql of [
      schemaSql,
      catalogSql,
      authorizationSql,
      phase12aSchemaSql,
      phase12aFunctionsSql,
      phase12aAdminWorkerSql,
    ]) {
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
    const phase10cMappingStart = phase10cWorldComposerSql.indexOf(
      'with mapping(role_key, permission_key)',
    );
    const phase10cMappingBlock = phase10cWorldComposerSql.slice(
      phase10cMappingStart,
      phase10cWorldComposerSql.indexOf(
        'alter table public.world_audit_events',
        phase10cMappingStart,
      ),
    );
    const phase11MappingBlock = phase11PlayableSql.slice(
      phase11PlayableSql.indexOf('with mapping(role_key, permission_key)'),
      phase11PlayableSql.indexOf(
        'create or replace function private.claim_cozy_gameplay_rate_limit',
      ),
    );
    const phase11ContentManagementMappingBlock = phase11ContentManagementSql.slice(
      phase11ContentManagementSql.indexOf('with mapping(role_key, permission_key)'),
      phase11ContentManagementSql.indexOf('alter table public.cozy_farming_admin_audit_events'),
    );
    const phase11bMappingBlock = phase11bSchemaSql.slice(
      phase11bSchemaSql.indexOf('with mapping(role_key, permission_key)'),
      phase11bSchemaSql.indexOf('create index player_home_workstations_home_idx'),
    );
    const phase11cMappingBlock = phase11cSchemaSql.slice(
      phase11cSchemaSql.indexOf('with mapping(role_key, permission_key)'),
      phase11cSchemaSql.indexOf(
        'insert into public.admin_role_permissions(role_id,permission_id)\nselect role.id,permission.id from public.admin_roles role\ncross join',
      ),
    );
    const phase11dMappingBlock = phase11dSchemaSql.slice(
      phase11dSchemaSql.indexOf('with mapping(role_key,permission_key)'),
      phase11dSchemaSql.indexOf('alter table public.cozy_gameplay_rate_limits'),
    );
    const phase11eMappingBlock = phase11eSchemaSql.slice(
      phase11eSchemaSql.indexOf('with mapping(role_key,permission_key)'),
      phase11eSchemaSql.indexOf('alter table public.cozy_gameplay_rate_limits'),
    );
    const phase11fMappingBlock = phase11fSchemaSql.slice(
      phase11fSchemaSql.indexOf('with mapping(role_key,permission_key)'),
      phase11fSchemaSql.indexOf(
        'insert into public.admin_role_permissions(role_id,permission_id)\nselect role.id,permission.id from public.admin_roles role cross join',
      ),
    );
    const phase12aMappingBlock = phase12aSchemaSql.slice(
      phase12aSchemaSql.indexOf('with mapping(role_key,permission_key)'),
      phase12aSchemaSql.indexOf(
        'insert into public.admin_role_permissions(role_id,permission_id)\nselect role.id,permission.id from public.admin_roles role cross join',
      ),
    );
    const mappingBlock = `${catalogSql.slice(
      catalogSql.indexOf('with mapping(role_key, permission_key)'),
    )}\n${phase5MappingBlock}\n${phase6MappingBlock}\n${consolidationMappingBlock}\n${liveOperationsMappingBlock}\n${cozyHousingSql.slice(
      cozyHousingSql.indexOf('with mapping(role_key, permission_key)'),
      cozyHousingSql.indexOf('alter table public.cozy_gameplay_idempotency'),
    )}\n${assetManagerMappingBlock}\n${platformMappingBlock}\n${realtimePresenceSql
      .slice(
        realtimePresenceSql.indexOf('with mapping(role_key)'),
        realtimePresenceSql.indexOf(
          'insert into public.admin_role_permissions (role_id, permission_id)\nselect role.id, permission.id\nfrom public.admin_roles role\ncross join',
          realtimePresenceSql.indexOf('with mapping(role_key)'),
        ),
      )
      .replace(/\('([^']+)'\)/gu, "('$1', 'realtime.read')")}\n${multiplayerChatSql.slice(
      multiplayerChatSql.indexOf('with mapping(role_key, permission_key)'),
      multiplayerChatSql.indexOf(
        'insert into public.admin_role_permissions (role_id, permission_id)\nselect role.id, permission.id\nfrom public.admin_roles role\ncross join',
      ),
    )}\n${socialInteractionsSql.slice(
      socialInteractionsSql.indexOf('with mapping(role_key, permission_key)'),
      socialInteractionsSql.indexOf(
        'insert into public.admin_role_permissions (role_id, permission_id)\nselect role.id, permission.id\nfrom public.admin_roles role\ncross join',
      ),
    )}\n${socialGraphSql.slice(
      socialGraphSql.indexOf('with mapping(role_key, permission_key)'),
      socialGraphSql.indexOf(
        'insert into public.admin_role_permissions (role_id, permission_id)\nselect role.id, permission.id\nfrom public.admin_roles role\ncross join',
      ),
    )}\n${cooperativeActivitiesSql.slice(
      cooperativeActivitiesSql.indexOf('with mapping(role_key, permission_key)'),
      cooperativeActivitiesSql.indexOf(
        'insert into public.admin_role_permissions (role_id, permission_id)\nselect role.id, permission.id\nfrom public.admin_roles role\ncross join',
      ),
    )}\n${economySchemaSql.slice(
      economySchemaSql.indexOf('with mapping(role_key, permission_key)'),
      economySchemaSql.indexOf(
        'insert into public.admin_role_permissions (role_id, permission_id)\nselect role.id, permission.id\nfrom public.admin_roles role\ncross join',
      ),
    )}\n${avatarSchemaSql.slice(
      avatarSchemaSql.indexOf('with mapping(role_key, permission_key)'),
      avatarSchemaSql.indexOf('-- Extend the existing reviewed World Asset Manager registry.'),
    )}\n${cosmeticSchemaSql.slice(
      cosmeticSchemaSql.indexOf('with mapping(role_key, permission_key)'),
      cosmeticSchemaSql.indexOf('create table public.cosmetic_acquisition_sources'),
    )}\n${phase10cMappingBlock}\n${phase11MappingBlock}\n${phase11ContentManagementMappingBlock}\n${phase11bMappingBlock}\n${phase11cMappingBlock}\n${phase11dMappingBlock}\n${phase11eMappingBlock}\n${phase11fMappingBlock}\n${phase12aMappingBlock}`;
    const seeded = new Map<string, string[]>();

    for (const match of mappingBlock.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)) {
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

  it('builds a forced-RLS Phase 8B chat boundary with narrow grants and protected evidence', () => {
    for (const table of [
      'multiplayer_chat_settings',
      'multiplayer_chat_messages',
      'multiplayer_chat_player_preferences',
      'multiplayer_chat_reports',
      'multiplayer_chat_mutes',
      'multiplayer_chat_moderation_actions',
    ]) {
      expect(multiplayerChatSql).toContain(`alter table public.${table} enable row level security`);
      expect(multiplayerChatSql).toContain(`alter table public.${table} force row level security`);
      expect(multiplayerChatSql).toContain(
        `revoke all on table public.${table} from public, anon, authenticated, service_role`,
      );
    }
    expect(multiplayerChatSql).toContain('MULTIPLAYER_CHAT_AUDIT_APPEND_ONLY');
    expect(multiplayerChatSql).toContain("report.status in ('open', 'under_review')");
    expect(multiplayerChatSql).toContain('unique (sender_profile_id, client_request_id)');
    expect(multiplayerChatSql).toContain("permission.key like 'multiplayer_chat.%'");
    expect(multiplayerChatSql).not.toMatch(
      /grant (?:select|insert|update|delete|all) on table public\.multiplayer_chat/iu,
    );
  });

  it('parses the forward-only Phase 8B migration with PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    const result = await parser.parse(multiplayerChatSql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
  });

  it('keeps read-only analysts away from protected reports, audit, settings, and mutations', () => {
    const analystMappings = [
      ...multiplayerChatSql.matchAll(/\('read_only_analyst', '([^']+)'\)/gu),
    ].map((match) => match[1]);
    expect(analystMappings).toEqual(['multiplayer_chat.read']);
    expect(INITIAL_ROLE_PERMISSIONS.read_only_analyst).toContain('multiplayer_chat.read');
    expect(
      INITIAL_ROLE_PERMISSIONS.read_only_analyst.filter((permission) =>
        permission.startsWith('multiplayer_chat.'),
      ),
    ).toEqual(['multiplayer_chat.read']);
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

    expect(worldManagementTestSql).toContain('count(*) = count(distinct catalog.asset_key)');
    expect(worldManagementTestSql).toContain("asset.approval_status = 'approved'");
    expect(worldManagementTestSql).toContain("asset.production_status = 'development_marker'");
    expect(worldManagementTestSql).toContain("'starville-procedural:v1:' || catalog.asset_key");
    expect(worldManagementTestSql).toContain(
      'no procedural asset exists outside the reviewed bundled catalog',
    );
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
  const worldAssetUploadRecoverySql = readFileSync(
    new URL('20260716113000_world_asset_version_upload_recovery.sql', migrationDirectory),
    'utf8',
  );
  const validatedAssetImmutabilitySql = readFileSync(
    new URL('20260716115000_enforce_validated_world_asset_immutability.sql', migrationDirectory),
    'utf8',
  );
  const successorDraftSql = readFileSync(
    new URL('20260716116000_add_world_asset_successor_draft_creation.sql', migrationDirectory),
    'utf8',
  );
  const worldDraftAssetPinsSql = readFileSync(
    new URL('20260716117000_expose_world_draft_asset_pins.sql', migrationDirectory),
    'utf8',
  );
  const reviewIntentIdempotencySql = readFileSync(
    new URL('20260716118000_harden_world_asset_review_intent_idempotency.sql', migrationDirectory),
    'utf8',
  );
  const allSql = [
    schemaSql,
    functionsSql,
    integrationSql,
    storageSql,
    permissionCorrectionSql,
    lintCorrectionSql,
    finalValidationSql,
    worldDraftAssetPinsSql,
    reviewIntentIdempotencySql,
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
      worldDraftAssetPinsSql,
      reviewIntentIdempotencySql,
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

  it('binds review and activation request IDs to one server-derived intent', () => {
    expect(reviewIntentIdempotencySql).toContain('public.world_asset_operation_intents');
    expect(reviewIntentIdempotencySql).toContain('p_intent_fingerprint');
    expect(reviewIntentIdempotencySql).toContain("'exact_replay'");
    expect(reviewIntentIdempotencySql).toContain("'request_conflict'");
    expect(reviewIntentIdempotencySql).toContain("'mutationPerformed', false");
    expect(reviewIntentIdempotencySql).toContain("'worldPublicationPerformed', false");
    expect(reviewIntentIdempotencySql).toContain('force row level security');
    expect(reviewIntentIdempotencySql).toContain('to service_role');
    expect(reviewIntentIdempotencySql).not.toContain('update public.world_map_version_assets');
  });

  it('keeps validated asset configuration immutable without blocking review submission', async () => {
    const parser = new Parser({ version: 17 });
    expect((await parser.parse(validatedAssetImmutabilitySql)).stmts?.length ?? 0).toBeGreaterThan(
      0,
    );
    expect(validatedAssetImmutabilitySql).toContain('ASSET_VALIDATED_VERSION_IMMUTABLE');
    expect(validatedAssetImmutabilitySql).toContain("new.lifecycle_status = 'in_review'");
    expect(validatedAssetImmutabilitySql).toContain("'submitted_by_admin_id'");
    expect(validatedAssetImmutabilitySql).toContain("set search_path = ''");
    expect(validatedAssetImmutabilitySql).toContain(
      'revoke all on function private.protect_validated_world_asset_version() from public',
    );
  });

  it('creates explicit successor drafts without mutating source versions or pinned references', async () => {
    const parser = new Parser({ version: 17 });
    expect((await parser.parse(successorDraftSql)).stmts?.length ?? 0).toBeGreaterThan(0);
    expect(successorDraftSql).toContain('public.create_admin_game_asset_version_from_existing');
    expect(successorDraftSql).toContain('public.create_admin_game_asset_version_upload_v2');
    expect(successorDraftSql).toContain("p_configuration_mode not in ('copy', 'defaults')");
    expect(successorDraftSql).toContain(
      "lifecycle_status in ('draft', 'processing', 'validation_failed', 'changes_requested')",
    );
    expect(successorDraftSql).toContain("'activeVersionUnchanged', true");
    expect(successorDraftSql).toContain("'publishedReferencesUnchanged', true");
    expect(successorDraftSql).toContain("set search_path = ''");
    expect(successorDraftSql).toContain('from public, anon, authenticated, service_role');
    expect(successorDraftSql).toContain('to service_role');
    expect(successorDraftSql).not.toContain('update public.world_map_version_assets');
    expect(successorDraftSql).not.toContain('delivery_source_path');
  });

  it('terminally archives only an unreferenced failed candidate behind an active canonical asset', async () => {
    const parser = new Parser({ version: 17 });
    expect((await parser.parse(worldAssetUploadRecoverySql)).stmts?.length ?? 0).toBeGreaterThan(0);
    expect(worldAssetUploadRecoverySql).toContain("then 'archived'");
    expect(worldAssetUploadRecoverySql).toContain('asset.active_version_id <> version.id');
    expect(worldAssetUploadRecoverySql).toContain('public.world_map_version_assets');
    expect(worldAssetUploadRecoverySql).toContain('public.world_asset_references');
    expect(worldAssetUploadRecoverySql).toContain("'asset.processing.failed'");
    expect(worldAssetUploadRecoverySql).not.toContain('delete from public.world_asset_versions');
    expect(worldAssetUploadRecoverySql).not.toContain('update public.world_assets');
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
    expect(worldDraftAssetPinsSql).toContain('private.world_editor_asset_pins_for_version');
    expect(worldDraftAssetPinsSql).toContain("'assetPins'");
    expect(worldDraftAssetPinsSql).toContain("'assets.read'");
    expect(worldDraftAssetPinsSql).toContain('reference.world_asset_version_id');
    expect(worldDraftAssetPinsSql).not.toContain('update public.world_map_version_assets');
    expect(worldDraftAssetPinsSql).not.toContain('delete from public.world_map_version_assets');
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

describe('Phase 8A realtime-presence migration', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const realtimeSql = readFileSync(
    new URL('20260715100000_realtime_presence_foundation.sql', migrationDirectory),
    'utf8',
  );

  it('parses with the hosted PostgreSQL grammar', async () => {
    const parser = new Parser({ version: 17 });
    const result = await parser.parse(realtimeSql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
  });

  it('creates only bounded channel, ticket, session, and lifecycle audit tables', () => {
    expect(
      [...realtimeSql.matchAll(/create table public\.([a-z_]+)/giu)].map((match) => match[1]),
    ).toEqual([
      'realtime_channels',
      'realtime_connection_tickets',
      'realtime_sessions',
      'realtime_connection_audit',
    ]);
    expect(realtimeSql).not.toContain('wallet_address uuid');
  });

  it('forces RLS and exposes lifecycle operations only to the service role', () => {
    for (const table of [
      'realtime_channels',
      'realtime_connection_tickets',
      'realtime_sessions',
      'realtime_connection_audit',
    ]) {
      expect(realtimeSql).toContain(`alter table public.${table} force row level security`);
      expect(realtimeSql).toContain(`revoke all on table public.${table}`);
    }
    expect(realtimeSql).not.toMatch(
      /grant\s+(?:select|insert|update|delete|all)\s+on\s+table\s+public\./iu,
    );
    expect(realtimeSql).not.toMatch(/grant execute[^;]+to (?:anon|authenticated)/iu);
  });

  it('locks before capacity checks and reports truthful channel availability', () => {
    expect(realtimeSql).toContain('select count(*)::integer into channel_population');
    expect(realtimeSql).toContain('for update;');
    expect(realtimeSql).toContain('exit when channel_population < selected_channel.capacity');
    expect(realtimeSql).not.toContain("'available', true");
    expect(realtimeSql).toContain(') < channel.capacity');
    expect(realtimeSql).toContain(') < listed.capacity');
  });

  it('stores one-use ticket hashes and audits replaced sessions exactly as disconnects', () => {
    expect(realtimeSql).toContain(
      "ticket_hash text not null unique check (ticket_hash ~ '^[0-9a-f]{64}$')",
    );
    expect(realtimeSql).toContain('ticket.consumed_at is not null');
    expect(realtimeSql).toContain("'disconnected', 'replaced',");
    expect(realtimeSql).toContain("set status = 'closed', close_reason = 'replaced'");
  });
});

describe('Phase 8B multiplayer-chat migration', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const chatSql = readFileSync(
    new URL('20260715110000_multiplayer_chat_moderation.sql', migrationDirectory),
    'utf8',
  );
  const chatTestSql = readFileSync(
    new URL('../../../infrastructure/supabase/tests/multiplayer_chat.test.sql', import.meta.url),
    'utf8',
  );

  it('parses the migration and reviewed pgTAP suite with PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [chatSql, chatTestSql]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('creates only bounded chat, safety, report, mute, and action storage', () => {
    expect(
      [...chatSql.matchAll(/create table public\.([a-z_]+)/giu)].map((match) => match[1]),
    ).toEqual([
      'multiplayer_chat_settings',
      'multiplayer_chat_messages',
      'multiplayer_chat_player_preferences',
      'multiplayer_chat_reports',
      'multiplayer_chat_mutes',
      'multiplayer_chat_moderation_actions',
    ]);
    expect(chatSql).not.toMatch(/wallet_address|email|ip_address|authorization_header/iu);
  });

  it('forces RLS and exposes no direct table mutation path', () => {
    for (const table of [
      'multiplayer_chat_settings',
      'multiplayer_chat_messages',
      'multiplayer_chat_player_preferences',
      'multiplayer_chat_reports',
      'multiplayer_chat_mutes',
      'multiplayer_chat_moderation_actions',
    ]) {
      expect(chatSql).toContain(`alter table public.${table} force row level security`);
      expect(chatSql).toContain(`revoke all on table public.${table}`);
    }
    expect(chatSql).not.toMatch(/create policy/iu);
    expect(chatSql).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+table/iu);
  });

  it('keeps evidence and moderation history immutable while preserving active reports', () => {
    expect(chatSql).toContain('private.protect_multiplayer_chat_report_evidence');
    expect(chatSql).toContain('private.protect_multiplayer_chat_moderation_actions');
    expect(chatSql).toContain("report.status in ('open', 'under_review')");
    expect(chatSql).toContain('limit 20');
    expect(chatSql).toContain("jsonb_build_object('status', previous_status");
  });

  it('uses one service-authoritative socket path with exact scoped RPC grants', () => {
    expect(chatSql).toContain(
      'public.accept_realtime_chat_message(uuid, text, text, text, numeric, numeric)',
    );
    expect(chatSql).not.toMatch(/grant execute[^;]+to (?:anon|authenticated)/iu);
    expect(chatSql).toContain(
      'grant execute on function public.cleanup_multiplayer_chat_retention(integer) to service_role',
    );
  });
});

describe('Phase 8C nearby social interaction migration', () => {
  const socialSql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260715120000_nearby_social_interactions.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const socialTestSql = readFileSync(
    new URL('../../../infrastructure/supabase/tests/social_interactions.test.sql', import.meta.url),
    'utf8',
  );

  it('parses the migration and reviewed pgTAP suite with the hosted PostgreSQL grammar', async () => {
    for (const sql of [socialSql, socialTestSql]) {
      const result = await new Parser({ version: 17 }).parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('uses explicit item transfer policy and atomic settlement helpers', () => {
    expect(socialSql).toContain('add column giftable boolean not null default false');
    expect(socialSql).toContain('add column tradable boolean not null default false');
    expect(socialSql).toContain('private.social_trade_inventory_fits');
    expect(socialSql).toContain('public.confirm_realtime_social_trade');
    expect(socialSql).toContain('order by state.player_profile_id for update');
    expect(socialSql).toContain("category <> 'permanent_tool'");
    expect(socialSql).toContain("'dustTransferEnabled', false");
  });

  it('forces RLS, revokes tables, and preserves immutable receipts and audit', () => {
    for (const table of [
      'social_interaction_settings',
      'social_interaction_requests',
      'player_gift_items',
      'player_trade_offer_items',
      'player_inventory_reservations',
      'social_interaction_receipts',
      'social_interaction_receipt_items',
      'social_interaction_audit',
      'social_interaction_idempotency',
    ]) {
      expect(socialSql).toContain(`'${table}'`);
    }
    expect(socialSql).toContain('alter table public.%I force row level security');
    expect(socialSql).toContain('revoke all on table public.%I');
    expect(socialSql).toContain('social_receipts_immutable');
    expect(socialSql).toContain('social_audit_immutable');
    expect(socialSql).not.toMatch(/grant execute[^;]+to (?:anon|authenticated)/iu);
  });

  it('keeps read-only role mappings narrow and provides bounded cleanup', () => {
    expect(socialSql).toContain("('read_only_analyst', 'social_interactions.read')");
    expect(socialSql).not.toContain("('read_only_analyst', 'social_interactions.audit.read')");
    expect(socialSql).toContain('limit p_batch_size for update skip locked');
    expect(socialSql).toContain('perform private.social_release_reservations');
  });
});

describe('Phase 8D-A friends and parties migration', () => {
  const socialGraphSql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260715130000_friends_parties_social_graph.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const socialGraphTestSql = readFileSync(
    new URL('../../../infrastructure/supabase/tests/social_graph.test.sql', import.meta.url),
    'utf8',
  );

  it('parses the migration and reviewed pgTAP suite with PostgreSQL 17 grammar', async () => {
    for (const sql of [socialGraphSql, socialGraphTestSql]) {
      const result = await new Parser({ version: 17 }).parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('creates bounded friendship, party, ready, notification, replay, and audit storage', () => {
    for (const table of [
      'social_graph_settings',
      'player_friend_requests',
      'player_friendships',
      'player_parties',
      'player_party_members',
      'player_party_invitations',
      'player_party_ready_checks',
      'player_party_ready_responses',
      'player_social_notifications',
      'player_social_audit',
      'player_social_idempotency',
    ]) {
      expect(socialGraphSql).toContain(`create table public.${table}`);
      expect(socialGraphSql).toContain(`'${table}'`);
    }
    expect(socialGraphSql).toContain(
      "execute format('alter table public.%I force row level security', table_name)",
    );
    expect(socialGraphSql).toContain(
      "execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name)",
    );
    expect(socialGraphSql).not.toMatch(/grant execute[^;]+to (?:anon|authenticated)/iu);
  });

  it('enforces canonical friendships, one active party, one leader, capacity, and replay', () => {
    expect(socialGraphSql).toContain('player_friend_requests_one_pending_pair_idx');
    expect(socialGraphSql).toContain('player_party_members_one_active_party_idx');
    expect(socialGraphSql).toContain('player_party_members_one_active_leader_idx');
    expect(socialGraphSql).toContain('player_party_ready_checks_one_active_idx');
    expect(socialGraphSql).toContain('private.social_graph_replay');
    expect(socialGraphSql).toContain('for update skip locked');
    expect(socialGraphSql).toContain(
      'private.social_graph_party_json(party public.player_parties)\nreturns jsonb language plpgsql volatile',
    );
    expect(socialGraphSql).toContain(
      'private.social_graph_party_presence_ids(p_party_id uuid)\nreturns jsonb language sql volatile',
    );
  });

  it('keeps role mappings narrow and binds private party chat server-side', () => {
    expect(socialGraphSql).toContain("('read_only_analyst', 'social_graph.read')");
    expect(socialGraphSql).not.toContain("('read_only_analyst', 'social_graph.audit.read')");
    expect(socialGraphSql).toContain("if p_scope = 'party' then");
    expect(socialGraphSql).toContain('active_party_id := private.social_graph_active_party_id');
    expect(socialGraphSql).toContain('party_dormant_timeout_seconds');
  });
});

describe('Phase 8 hosted database lint repair migration', () => {
  const lintRepairSql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260715131000_fix_phase8_hosted_database_lint.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses as one additive forward-only migration with PostgreSQL 17 grammar', async () => {
    const result = await new Parser({ version: 17 }).parse(lintRepairSql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
  });

  it('removes only the obsolete cleanup settings fetch and preserves bounded cleanup', () => {
    const cleanup = lintRepairSql.slice(
      lintRepairSql.indexOf('create or replace function public.cleanup_social_interactions'),
      lintRepairSql.indexOf('create or replace function public.respond_realtime_party_ready_check'),
    );
    expect(cleanup).not.toMatch(/settings\s+public\.social_interaction_settings/iu);
    expect(cleanup).not.toContain('select * into strict settings');
    expect(cleanup).toContain('limit p_batch_size for update skip locked');
    expect(cleanup).toContain('perform private.social_release_reservations');
    expect(cleanup).toContain("now() - interval '24 hours'");
  });

  it('locks only the actor ready-response row without retaining an unused record', () => {
    const readyResponse = lintRepairSql.slice(
      lintRepairSql.indexOf('create or replace function public.respond_realtime_party_ready_check'),
      lintRepairSql.indexOf('create or replace function private.social_graph_ready_check_json'),
    );
    expect(readyResponse).not.toMatch(/ready_response\s+public\.player_party_ready_responses/iu);
    expect(readyResponse).toContain('perform 1 from public.player_party_ready_responses');
    expect(readyResponse).toContain(
      'where ready_check_id = check_row.id and player_profile_id = actor.id for update',
    );
    expect(readyResponse).toContain("private.social_graph_replay(actor.id, 'ready_check_respond'");
    expect(readyResponse).toContain('party.revision <> p_expected_revision');
  });

  it('uses truthful stable volatility through the complete admin party read chain', () => {
    expect(lintRepairSql).toMatch(
      /private\.social_graph_ready_check_json\([\s\S]*?returns jsonb language sql stable security definer/iu,
    );
    expect(lintRepairSql).toMatch(
      /private\.social_graph_party_json\([\s\S]*?returns jsonb language plpgsql stable security definer/iu,
    );
    expect(lintRepairSql).toMatch(
      /public\.get_admin_social_graph_party\([\s\S]*?returns jsonb language plpgsql stable security definer/iu,
    );
    expect(lintRepairSql).toContain(
      "private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'social_graph.audit.read')",
    );
  });

  it('reasserts narrow service-role execution without creating an obsolete overload', () => {
    for (const signature of [
      'public.cleanup_social_interactions(integer, text)',
      'public.respond_realtime_party_ready_check(uuid, uuid, integer, text, text)',
      'public.get_admin_social_graph_party(uuid, uuid, text, uuid)',
    ]) {
      expect(lintRepairSql).toContain(`revoke all on function ${signature}`);
      expect(lintRepairSql).toContain(`grant execute on function ${signature}`);
    }
    expect(lintRepairSql).not.toMatch(/grant execute[^;]+to (?:public|anon|authenticated)/iu);
  });
});

describe('Phase 8D-B cooperative activity migrations', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const schemaSql = readFileSync(
    new URL('20260715140000_cooperative_activities_schema.sql', migrationDirectory),
    'utf8',
  );
  const functionsSql = readFileSync(
    new URL('20260715141000_cooperative_activities_functions.sql', migrationDirectory),
    'utf8',
  );
  const operationsSql = readFileSync(
    new URL('20260715142000_cooperative_activity_operations.sql', migrationDirectory),
    'utf8',
  );
  const platformSql = readFileSync(
    new URL('20260715143000_cooperative_activity_platform_module.sql', migrationDirectory),
    'utf8',
  );
  const lintRepairSql = readFileSync(
    new URL('20260715144000_fix_phase8db_hosted_database_lint.sql', migrationDirectory),
    'utf8',
  );
  const platformLintRepairSql = lintRepairSql.slice(
    lintRepairSql.indexOf(
      'create or replace function private.valid_platform_configuration(p_value jsonb)',
    ),
  );
  const activityTestSql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/tests/cooperative_activities.test.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const platformTestSql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/tests/platform_configuration.test.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses every migration and the reviewed pgTAP suite with PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [
      schemaSql,
      functionsSql,
      operationsSql,
      platformSql,
      lintRepairSql,
      activityTestSql,
      platformTestSql,
    ]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('creates bounded definition, instance, contribution, receipt, cooldown, and replay storage', () => {
    expect(
      [...schemaSql.matchAll(/create table public\.([a-z_]+)/giu)].map((match) => match[1]),
    ).toEqual([
      'cooperative_activity_settings',
      'cooperative_activity_definitions',
      'cooperative_activity_versions',
      'cooperative_activity_active_versions',
      'cooperative_activity_objects',
      'cooperative_activity_entry_preparations',
      'cooperative_activity_instances',
      'cooperative_activity_participants',
      'cooperative_activity_objectives',
      'cooperative_activity_progress_events',
      'cooperative_activity_temporary_items',
      'cooperative_activity_completions',
      'cooperative_activity_reward_receipts',
      'cooperative_activity_reward_items',
      'cooperative_activity_pending_rewards',
      'cooperative_activity_cooldowns',
      'cooperative_activity_audit',
      'cooperative_activity_idempotency',
      'cooperative_activity_rate_limits',
    ]);
    expect(schemaSql).not.toMatch(/wallet_address|token_mint|solana|blockchain|nft/iu);
  });

  it('forces RLS, revokes every activity table, and exposes only narrow service RPCs', () => {
    expect(schemaSql).toContain("execute format('alter table public.%I force row level security'");
    expect(schemaSql).toContain("execute format('revoke all on table public.%I");
    expect(`${functionsSql}\n${operationsSql}`).not.toMatch(
      /grant execute[^;]+to (?:public|anon|authenticated)/iu,
    );
    expect(functionsSql).toContain(
      'grant execute on function public.interact_realtime_cooperative_activity',
    );
    expect(operationsSql).toContain(
      'grant execute on function public.transition_admin_cooperative_activity_version',
    );
  });

  it('locks roster and progress while settling canonical DUST and inventory exactly once', () => {
    expect(schemaSql).toContain('cooperative_activity_one_active_party_idx');
    expect(schemaSql).toContain('cooperative_activity_one_active_participation_idx');
    expect(functionsSql).toContain('for update;');
    expect(functionsSql).toContain('private.cooperative_activity_settle');
    expect(functionsSql).toContain("'cooperative_activity_reward'");
    expect(functionsSql).toContain('private.cozy_apply_dust_delta');
    expect(functionsSql).toContain('public.player_inventory_state');
    expect(functionsSql).toContain('cooperative_activity_reward_receipts');
    expect(functionsSql).not.toMatch(/\$STAR|SOL reward|token transfer/iu);
  });

  it('preserves legacy published platform configuration and upgrades only inserted drafts', () => {
    expect(platformSql).toContain('rename to valid_platform_configuration_phase75');
    expect(platformSql).toContain('if module_count = 15 then');
    expect(platformSql).toContain('if module_count <> 17');
    expect(platformSql).toContain('platform_configuration_phase8db_draft_upgrade');
    expect(platformSql).toContain("if new.lifecycle_status = 'draft' then");
    expect(platformSql).not.toMatch(/update public\.game_platform_(?:active|configuration)/iu);
    expect(platformSql).not.toContain('publish_admin_platform_configuration');
  });

  it('keeps the queue closed and verifies immutable receipts, permissions, and concurrency coverage', () => {
    expect(schemaSql).toContain('public_queue_enabled boolean not null default false');
    expect(schemaSql).toContain('cooperative_activity_receipt_immutable');
    expect(schemaSql).toContain("('read_only_analyst', 'cooperative_activities.read')");
    expect(schemaSql).not.toContain("('read_only_analyst', 'cooperative_activities.audit.read')");
    expect(activityTestSql).toContain('public queue is disabled by default');
    expect(activityTestSql).toContain('reward receipts are immutable');
  });

  it('repairs the hosted lint findings without changing activity entry authority', () => {
    expect(lintRepairSql).toContain(
      'create or replace function public.enter_realtime_cooperative_activity(',
    );
    expect(lintRepairSql).not.toMatch(/\bmember\s+record\b/iu);
    expect(lintRepairSql).toContain(
      "where party_member.party_id = party.id and party_member.status = 'active'",
    );
    expect(lintRepairSql).toContain('party.revision <> ready.party_revision');
    expect(lintRepairSql).toContain('exception when unique_violation then');
    expect(lintRepairSql).toContain('cooperative_activity_store_replay');
  });

  it('uses the automatic objective loop variable without a shadow declaration', () => {
    expect(lintRepairSql).toContain(
      'create or replace function private.valid_cooperative_activity_objectives(p_value jsonb)',
    );
    expect(lintRepairSql).toContain('for objective_index in 0..objective_count - 1 loop');
    expect(lintRepairSql).not.toMatch(/\bindex_number\b/iu);
  });

  it('keeps input-only platform transforms immutable without stable JSON constructors', () => {
    expect(lintRepairSql).toContain(
      'create or replace function private.valid_platform_configuration(p_value jsonb)',
    );
    expect(lintRepairSql).toContain(
      'create or replace function private.upgrade_phase8db_platform_configuration(p_value jsonb)',
    );
    expect(platformLintRepairSql).not.toMatch(/jsonb_agg\s*\(/iu);
    expect(platformLintRepairSql).not.toMatch(/jsonb_build_(?:array|object)\s*\(/iu);
    expect(lintRepairSql).toContain("(normalized -> 'modules') - element_index");
    expect(lintRepairSql).toContain("upgraded -> 'modules' ||");
  });

  it('reasserts the exact Phase 8D-B execution boundary after replacement', () => {
    for (const signature of [
      'public.enter_realtime_cooperative_activity(uuid,uuid,text)',
      'private.valid_cooperative_activity_objectives(jsonb)',
      'private.valid_platform_configuration(jsonb)',
      'private.upgrade_phase8db_platform_configuration(jsonb)',
    ]) {
      expect(lintRepairSql).toContain(`revoke all on function ${signature}`);
    }
    expect(lintRepairSql).toContain(
      'grant execute on function public.enter_realtime_cooperative_activity(uuid,uuid,text)',
    );
    expect(lintRepairSql).not.toMatch(/grant execute[^;]+to (?:public|anon|authenticated)/iu);
  });

  it('keeps the expanded platform pgTAP plan synchronized', () => {
    expect(platformTestSql).toContain('select plan(48);');
    expect(platformTestSql.match(/select (?:has_[a-z_]+|ok|is)\(/giu)).toHaveLength(48);
  });
});

describe('Phase 9A off-chain economy migrations', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const schemaSql = readFileSync(
    new URL('20260716090000_phase9a_economy_schema.sql', migrationDirectory),
    'utf8',
  );
  const functionsSql = readFileSync(
    new URL('20260716091000_phase9a_economy_functions.sql', migrationDirectory),
    'utf8',
  );
  const readinessSql = readFileSync(
    new URL('20260716092000_phase9a1_economy_admin_readiness.sql', migrationDirectory),
    'utf8',
  );
  const economyTestSql = readFileSync(
    new URL('../../../infrastructure/supabase/tests/economy.test.sql', import.meta.url),
    'utf8',
  );

  it('parses all forward-only migrations with PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [schemaSql, functionsSql, readinessSql]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('adds explicit 3-80 boundaries only to canonical source, sink, and operation keys', () => {
    for (const constraintName of [
      'economy_source_versions_source_key_length_check',
      'economy_source_versions_operation_key_length_check',
      'economy_active_source_versions_source_key_length_check',
      'economy_sink_versions_sink_key_length_check',
      'economy_sink_versions_operation_key_length_check',
      'economy_active_sink_versions_sink_key_length_check',
      'player_dust_ledger_operation_key_length_check',
    ]) {
      expect(readinessSql).toContain(`add constraint ${constraintName}`);
    }

    expect(
      readinessSql.match(
        /char_length\((?:source_key|sink_key|operation_key)\) between 3 and 80/giu,
      ),
    ).toHaveLength(7);
    expect(readinessSql).not.toMatch(
      /char_length\((?:reason|reference_id|public_receipt_id|request_id|correlation_id|idempotency_key|deduplication_key)\)/iu,
    );
    expect(readinessSql).not.toMatch(/drop constraint|drop column|alter column/iu);
  });

  it('adds permission-scoped admin reads and an explicit reviewed lifecycle without broad grants', () => {
    expect(readinessSql).toContain(
      'create or replace function public.get_admin_economy_workspace(',
    );
    expect(readinessSql).toContain(
      'create or replace function public.get_admin_economy_ledger_filtered(',
    );
    expect(readinessSql).toContain(
      'create or replace function public.operate_admin_economy_policy_version(',
    );
    expect(readinessSql).toContain(
      'create or replace function public.operate_admin_economy_shop_version(',
    );
    expect(readinessSql).toContain(
      "p_action not in ('validate','submit_review','approve','schedule','publish','rollback')",
    );
    expect(readinessSql).toContain(
      "p_action not in ('validate','submit_review','approve','schedule','publish','disable','rollback')",
    );
    expect(readinessSql).toContain("presentation_status := 'rolled_back'");
    expect(readinessSql).toContain("return jsonb_build_object('status','separation_of_duty')");
    expect(readinessSql).toContain("'playerBalancesMutated',false");
    expect(readinessSql).not.toMatch(/grant execute[^;]+to (?:public|anon|authenticated)/iu);
  });

  it('aligns reward and purchase lock order before account mutation', () => {
    const settlementRepair = readinessSql.slice(
      readinessSql.indexOf('create or replace function private.cozy_apply_dust_delta('),
      readinessSql.indexOf(
        'create or replace function public.operate_admin_economy_policy_version(',
      ),
    );
    const shopSettlement = settlementRepair.slice(
      settlementRepair.indexOf('create or replace function public.transact_player_shop('),
      settlementRepair.indexOf('create or replace function public.purchase_player_economy_shop('),
    );
    const economyPurchase = settlementRepair.slice(
      settlementRepair.indexOf('create or replace function public.purchase_player_economy_shop('),
    );
    expect(settlementRepair).toContain('from public.player_profiles');
    expect(settlementRepair).toContain('for key share');
    expect(settlementRepair.indexOf('for key share')).toBeLessThan(
      settlementRepair.indexOf('from public.player_dust_accounts'),
    );
    expect(settlementRepair).toContain('for update');
    expect(shopSettlement).toContain('for share of p,m');
    expect(economyPurchase).toContain('for share of p,m');
    expect(shopSettlement).toContain("'cozy-shop-player:'||profile.id::text");
    expect(economyPurchase).toContain("'cozy-shop-player:' || profile.id::text");
    expect(shopSettlement.indexOf("'cozy-shop-player:'")).toBeLessThan(
      shopSettlement.indexOf('from public.player_dust_accounts'),
    );
  });

  it('extends rather than replaces the canonical single-entry DUST authority', () => {
    expect(schemaSql).toContain('alter table public.player_dust_ledger');
    expect(schemaSql).not.toContain('create table public.player_dust_accounts');
    expect(schemaSql).not.toContain('create table public.player_dust_ledger');
    expect(functionsSql).toContain('create or replace function private.cozy_apply_dust_delta(');
    expect(functionsSql).toContain('private.economy_assert_account_balanced');
    expect(functionsSql).not.toMatch(/set_player_dust_balance|update_player_dust_balance/iu);
  });

  it('creates only the bounded Phase 9A catalog, receipt, review, and planning entities', () => {
    expect(
      [...schemaSql.matchAll(/create table public\.([a-z_]+)/giu)].map((match) => match[1]),
    ).toEqual([
      'economy_source_versions',
      'economy_active_source_versions',
      'economy_sink_versions',
      'economy_active_sink_versions',
      'economy_policy_versions',
      'economy_active_policy',
      'economy_shop_versions',
      'economy_shop_version_offers',
      'economy_active_shop_versions',
      'economy_purchase_receipts',
      'economy_reconciliation_runs',
      'economy_reconciliation_results',
      'economy_risk_signals',
      'economy_reward_quarantine',
      'economy_correction_requests',
      'economy_daily_metrics',
      'economy_admin_rate_limits',
      'economy_simulation_runs',
      'star_utility_versions',
      'star_utility_active_version',
    ]);
  });

  it('forces RLS, revokes direct access, and exposes only narrow service-role RPCs', () => {
    for (const table of [
      'economy_policy_versions',
      'economy_shop_versions',
      'economy_purchase_receipts',
      'economy_reconciliation_results',
      'economy_risk_signals',
      'economy_reward_quarantine',
      'economy_correction_requests',
      'economy_admin_rate_limits',
      'economy_simulation_runs',
      'star_utility_versions',
    ]) {
      expect(schemaSql).toContain(`'${table}'`);
    }
    expect(schemaSql).toContain("execute format('alter table public.%I enable row level security'");
    expect(schemaSql).toContain("execute format('alter table public.%I force row level security'");
    expect(schemaSql).toContain(
      "execute format('revoke all on table public.%I from public, anon, authenticated, service_role'",
    );
    expect(schemaSql).not.toMatch(/create policy/iu);
    expect(functionsSql).not.toMatch(/grant execute[^;]+to (?:public|anon|authenticated)/iu);
    expect(functionsSql).toContain('grant execute on function public.purchase_player_economy_shop');
  });

  it('keeps published policy, shop, utility, ledger, and receipts immutable', () => {
    expect(schemaSql).toContain('player_dust_ledger_prepare_economy');
    expect(schemaSql).toContain('player_dust_ledger_arithmetic_check');
    expect(schemaSql).toContain('player_dust_ledger_direction_check');
    expect(schemaSql).toContain('economy_purchase_receipts_immutable');
    expect(schemaSql).toContain('economy_policy_versions_published_immutable');
    expect(schemaSql).toContain('economy_shop_versions_published_immutable');
    expect(schemaSql).toContain('star_utility_versions_published_immutable');
  });

  it('contains atomic purchase, exact reconciliation, and separated correction controls', () => {
    expect(functionsSql).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(functionsSql).toContain("return jsonb_build_object('status','shop_changed')");
    expect(functionsSql).toContain('public.transact_player_shop(');
    expect(functionsSql).toContain('public.economy_purchase_receipts');
    expect(functionsSql.match(/for share of dust/giu)).toHaveLength(2);
    expect(functionsSql).toContain('private.economy_claim_admin_rate_limit');
    expect(functionsSql).toContain("'correction_review',30,60");
    expect(functionsSql).toContain("'simulation_run',10,60");
    expect(functionsSql).toContain("'autoCorrected',false");
    expect(functionsSql).toContain("return jsonb_build_object('status','separation_of_duty')");
    expect(functionsSql).toContain('requires_second_approval');
    expect(functionsSql).toContain("'automaticPlayerActions',0");
  });

  it('preserves read-only STAR access and explicitly rejects economic or custodial utility', () => {
    expect(schemaSql).toContain('"key":"verified-village-access"');
    expect(schemaSql).toContain('"key":"dust-reward-multipliers","status":"rejected"');
    expect(schemaSql).toContain('"requiresTransaction":false');
    expect(schemaSql).toContain('"transfersValue":false');
    expect(schemaSql).toContain('"custodyRequired":false');
    expect(schemaSql).not.toMatch(
      /create (?:table|function)[\s\S]{0,100}(?:claim|withdraw|deposit|staking|treasury)/iu,
    );
  });

  it('keeps pgTAP coverage aligned to forced RLS, narrow grants, metadata, and active catalogs', () => {
    expect(economyTestSql).toContain('all Phase 9A authority tables force RLS');
    expect(economyTestSql).toContain(
      'only the trusted server may call authoritative shop settlement',
    );
    expect(economyTestSql).toContain('truthfully volatile, SECURITY DEFINER');
    expect(economyTestSql).toContain('no on-chain transfer or conversion authority');
  });
});

describe('economy and avatar hosted database lint repair migration', () => {
  const repairSql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260716103000_fix_economy_avatar_function_lint.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses as one additive forward-only migration with PostgreSQL 17 grammar', async () => {
    const result = await new Parser({ version: 17 }).parse(repairSql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    expect(repairSql.match(/create or replace function/giu)).toHaveLength(2);
    expect(repairSql).not.toMatch(/drop\s+(?:function|table|schema)|alter\s+table|truncate/iu);
  });

  it('replaces only the exact deployed signatures and preserves their authority metadata', () => {
    expect(repairSql).toContain(
      'create or replace function public.update_admin_economy_shop_offer(',
    );
    expect(repairSql).toContain('create or replace function private.resolve_avatar_selection(');
    expect(repairSql).toContain('p_allow_protected boolean default false');
    expect(repairSql).toContain(
      "returns jsonb language plpgsql volatile security definer set search_path = '' as $$",
    );
    expect(repairSql).toMatch(
      /returns jsonb\s+language plpgsql\s+stable\s+security definer\s+set search_path = ''/iu,
    );
    expect(repairSql).toContain('revoke all on function public.update_admin_economy_shop_offer(');
    expect(repairSql).toContain(') from public, anon, authenticated, service_role;');
    expect(repairSql).toContain(') to service_role;');
    expect(repairSql).toContain(
      'revoke all on function private.resolve_avatar_selection(jsonb,boolean)',
    );
    expect(repairSql).not.toMatch(/grant execute[^;]+to (?:public|anon|authenticated)/iu);
  });

  it('removes the unused shop item row variable while preserving the actual item eligibility check', () => {
    const economyFunction = repairSql.slice(
      repairSql.indexOf('create or replace function public.update_admin_economy_shop_offer('),
      repairSql.indexOf('create or replace function private.resolve_avatar_selection('),
    );
    expect(economyFunction).not.toMatch(/\bselected_item\b/iu);
    expect(economyFunction).toContain('perform 1 from public.cozy_shop_offers offer');
    expect(economyFunction).toContain(
      "offer.active and item.active and item.buy_eligible and item.category not in ('permanent_tool','special')",
    );
    expect(economyFunction).toContain(
      "if not found then return jsonb_build_object('status','protected_or_unknown_item'); end if;",
    );
    expect(economyFunction).not.toMatch(/perform\s+p_offer_id|:=\s*p_offer_id\s*;/iu);
  });

  it('loads the configured accessory limit through an unambiguous qualified reference', () => {
    const avatarFunction = repairSql.slice(
      repairSql.indexOf('create or replace function private.resolve_avatar_selection('),
      repairSql.indexOf('-- CREATE OR REPLACE preserves ownership'),
    );
    expect(avatarFunction).toContain('configured_max_accessories integer;');
    expect(avatarFunction).toContain(
      'select settings.max_accessories into configured_max_accessories',
    );
    expect(avatarFunction).toContain('from public.avatar_settings as settings');
    expect(avatarFunction).toContain("where settings.game_key = 'starville';");
    expect(avatarFunction).toContain(
      'cardinality(accessory_ids) > coalesce(configured_max_accessories, 0)',
    );
    expect(avatarFunction).not.toMatch(/\bmax_accessories integer\b/iu);
    expect(avatarFunction).not.toMatch(/select\s+max_accessories\s+into\s+max_accessories/iu);
  });
});

describe('Phase 10B cosmetic migration chain', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const schemaSql = readFileSync(
    new URL('20260716110000_phase10b_cosmetic_schema.sql', migrationDirectory),
    'utf8',
  );
  const reconciliationSql = readFileSync(
    new URL('20260716110500_phase10b_avatar_contract_reconciliation.sql', migrationDirectory),
    'utf8',
  );
  const avatarMutationRepairSql = readFileSync(
    new URL('20260716110700_phase10b_avatar_outfit_mutation_repair.sql', migrationDirectory),
    'utf8',
  );
  const functionsSql = readFileSync(
    new URL('20260716111000_phase10b_cosmetic_functions.sql', migrationDirectory),
    'utf8',
  );
  const platformSql = readFileSync(
    new URL('20260716112000_phase10b_cosmetic_platform_modules.sql', migrationDirectory),
    'utf8',
  );
  const laterWorldRepairSql = readFileSync(
    new URL('20260716113000_world_asset_version_upload_recovery.sql', migrationDirectory),
    'utf8',
  );
  const volatilityRepairSql = readFileSync(
    new URL('20260716114000_fix_cosmetic_selection_shape_volatility.sql', migrationDirectory),
    'utf8',
  );

  it('parses the complete unapplied forward chain with PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [
      reconciliationSql,
      avatarMutationRepairSql,
      functionsSql,
      platformSql,
      laterWorldRepairSql,
      volatilityRepairSql,
    ]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('repairs cosmetic selection volatility additively without changing its contract', () => {
    expect(volatilityRepairSql).toMatch(
      /alter function private\.valid_cosmetic_selection_shape\(jsonb\) stable;/iu,
    );
    expect(volatilityRepairSql).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function|drop\s+function|grant|revoke/iu,
    );
  });

  it('reconciles hosted Phase 10A columns additively without inventing version-owned names', () => {
    expect(reconciliationSql).toMatch(
      /alter table public\.avatar_content_definitions\s+add column if not exists category text,\s+add column if not exists content_layer text/iu,
    );
    expect(reconciliationSql).toContain('add column if not exists customization_enabled boolean');
    expect(reconciliationSql).not.toMatch(/drop\s+(?:table|column|schema)|truncate/iu);
    expect(reconciliationSql).not.toContain('avatar_content_versions add column public_name');
    expect(functionsSql).not.toContain('version.public_name');
    expect(functionsSql).toContain("'name', definition.display_name");
  });

  it('repairs avatar outfit mutation UUID parsing before cosmetic loadouts can call it', () => {
    expect(avatarMutationRepairSql).toContain(
      'create or replace function private.mutate_player_avatar_profile(',
    );
    expect(avatarMutationRepairSql).toContain('jsonb_array_elements_text(');
    expect(avatarMutationRepairSql).toContain("(value #>> '{}')::uuid");
    expect(avatarMutationRepairSql).not.toContain('value::text::uuid');
    expect(avatarMutationRepairSql).toMatch(/security definer\s+set search_path = ''/iu);
    expect(avatarMutationRepairSql).not.toMatch(
      /grant execute[^;]+to (?:public|anon|authenticated)/iu,
    );
  });

  it('keeps cosmetic authority forced-RLS, receipt-led, and unavailable to browsers', () => {
    for (const table of [
      'player_cosmetic_ownership',
      'cosmetic_ownership_receipts',
      'player_cosmetic_loadouts',
      'player_emote_entitlements',
      'player_emote_wheels',
      'player_emote_activations',
      'cosmetic_collection_reward_receipts',
    ]) {
      expect(schemaSql).toContain(`'${table}'`);
    }
    expect(schemaSql).toContain(
      "execute format('alter table public.%I force row level security', relation_name)",
    );
    expect(schemaSql).toContain(
      "'revoke all on table public.%I from public, anon, authenticated, service_role'",
    );
    expect(functionsSql).toContain('private.store_cosmetic_replay');
    expect(functionsSql).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(functionsSql).toContain('request_already_processed');
  });

  it('keeps the cosmetic shop structurally disabled and publishes no content or configuration', () => {
    expect(schemaSql).toContain("lifecycle_status text not null default 'disabled_preview'");
    expect(schemaSql).toContain('purchase_available boolean not null default false');
    expect(schemaSql).toContain('check (not purchase_available)');
    expect(`${schemaSql}\n${functionsSql}\n${platformSql}`).not.toMatch(
      /create or replace function public\.(?:purchase|buy)_player_cosmetic/iu,
    );
    expect(platformSql).not.toMatch(
      /insert\s+into\s+public\.game_platform_active_configuration|update\s+public\.game_platform_active_configuration/iu,
    );
    expect(laterWorldRepairSql).toContain(
      'create or replace function public.fail_admin_game_asset_processing(',
    );
    expect(laterWorldRepairSql).not.toMatch(/create\s+table|alter\s+table|create\s+trigger/iu);
  });
});

describe('Phase 11C General Store migration chain', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const schemaSql = readFileSync(
    new URL('20260717120000_phase11c_shop_catalog_transaction_schema.sql', migrationDirectory),
    'utf8',
  );
  const playerSql = readFileSync(
    new URL('20260717121000_phase11c_shop_player_functions.sql', migrationDirectory),
    'utf8',
  );
  const operationsSql = readFileSync(
    new URL('20260717122000_phase11c_shop_admin_worker_functions.sql', migrationDirectory),
    'utf8',
  );

  it('parses every additive migration with the hosted PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [schemaSql, playerSql, operationsSql]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
      expect(sql).not.toMatch(/drop\s+(?:table|schema)|truncate/iu);
    }
  });

  it('extends the canonical Phase 7 and Phase 9A shop and DUST authorities', () => {
    expect(schemaSql).toContain('alter table public.economy_shop_versions');
    expect(schemaSql).toContain('alter table public.economy_shop_version_offers');
    expect(schemaSql).toContain('alter table public.cozy_shop_definitions');
    expect(schemaSql).toContain("where id='74000000-0000-4000-8000-000000000001'");
    expect(playerSql).toContain('private.cozy_apply_dust_delta');
    expect(schemaSql).not.toContain('create table public.player_dust_accounts');
    expect(schemaSql).not.toContain('create table public.player_inventory_stacks');
  });

  it('forces RLS, revokes direct writes, and grants only narrow server RPCs', () => {
    for (const table of [
      'economy_shop_catalogs',
      'economy_shop_stock',
      'economy_shop_transactions',
      'economy_shop_receipts',
      'economy_shop_events',
      'economy_shop_reconciliation_queue',
    ]) {
      expect(schemaSql).toContain(`'${table}'`);
    }
    expect(schemaSql).toContain("execute format('alter table public.%I force row level security'");
    expect(schemaSql).toContain(
      "execute format('revoke all on table public.%I from public,anon,authenticated,service_role'",
    );
    expect(`${playerSql}\n${operationsSql}`).not.toMatch(
      /grant execute[^;]+to (?:public|anon|authenticated)/iu,
    );
    expect(playerSql).toContain('grant execute on function public.execute_player_shop_transaction');
  });

  it('serializes stock, balance, inventory, limits, and idempotency before atomic settlement', () => {
    expect(playerSql.match(/pg_catalog\.pg_advisory_xact_lock/gu)?.length ?? 0).toBeGreaterThan(2);
    expect(playerSql).toContain('where player_profile_id=profile.id for update');
    expect(playerSql).toContain(
      'where catalog_version_id=version.id and catalog_entry_id=entry.entry_id for update',
    );
    expect(playerSql).toContain("return jsonb_build_object('status','out_of_stock')");
    expect(playerSql).toContain("then 'purchase_limit' else 'sale_limit'");
    expect(playerSql).toContain("return jsonb_build_object('status','global_limit')");
    expect(playerSql).toContain("return jsonb_build_object('status','price_changed')");
    expect(playerSql).toContain("'status','request_already_processed'");
  });

  it('preserves immutable catalog history, transaction evidence, receipts, events, and snapshots', () => {
    expect(schemaSql).toContain('economy_shop_versions_published_immutable');
    expect(schemaSql).toContain('economy_shop_version_offers_published_immutable');
    expect(schemaSql).toContain('economy_shop_transactions_immutable');
    expect(schemaSql).toContain('economy_shop_receipts_immutable');
    expect(schemaSql).toContain('economy_shop_events_immutable');
    expect(schemaSql).toContain('unit_price bigint not null');
    expect(schemaSql).toContain('catalog_revision integer not null');
    expect(schemaSql).toContain('stock_policy_snapshot jsonb not null');
    expect(schemaSql).toContain('limit_policy_snapshot jsonb not null');
    expect(schemaSql).toContain('correction_request_id uuid');
  });

  it('keeps catalog publication reviewed, successor-based, and arbitrage checked', () => {
    expect(operationsSql).toContain('create_admin_shop_catalog_successor');
    expect(operationsSql).toContain(
      'create or replace function public.add_admin_shop_catalog_entry',
    );
    expect(operationsSql).toContain(
      'create or replace function public.remove_admin_shop_catalog_entry',
    );
    expect(operationsSql).toContain("version.lifecycle_status<>'draft'");
    expect(operationsSql).toContain("selected_version.lifecycle_status<>'draft'");
    expect(operationsSql).toContain("return jsonb_build_object('status','entry_referenced')");
    expect(schemaSql).toContain("'catalog_entry_added','catalog_entry_removed'");
    expect(operationsSql).toContain("return jsonb_build_object('status','separation_of_duty')");
    expect(operationsSql).toContain('sell_entry.sell_price>=buy_entry.buy_price');
    expect(operationsSql).toContain("'direct-arbitrage-blocked'");
    expect(operationsSql).toContain('stock_revision=stock_revision+1');
    expect(operationsSql).toContain('for update of stock skip locked');
  });
});

describe('hosted cozy-gameplay canonical seed contract', () => {
  const testSql = readFileSync(
    new URL('../../../infrastructure/supabase/tests/cozy_gameplay.test.sql', import.meta.url),
    'utf8',
  );

  it('parses with PostgreSQL 17 grammar and accounts for the strengthened pgTAP plan', async () => {
    const result = await new Parser({ version: 17 }).parse(testSql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    expect(testSql).toContain('select plan(94);');
    expect(testSql.match(/select set_eq\(/gu)).toHaveLength(5);
    expect(testSql).toContain('select * from finish();');
  });

  it('pins all seven canonical recipes and their exact active versions without a global total', () => {
    for (const identity of [
      "'73000000-0000-4000-8000-000000000001'::uuid, 'moonbean-salad'",
      "'73000000-0000-4000-8000-000000000002', 'sunroot-soup'",
      "'73000000-0000-4000-8000-000000000003', 'cloudberry-tart'",
      "'73000000-0000-4000-8000-000000000004', 'meadow-biscuit'",
      "'73000000-0000-4000-8000-000000000005', 'garden-twine'",
      "'73000000-0000-4000-8000-000000000006', 'willow-chair'",
      "'b1100000-0000-4000-8000-000000000011', 'garden-soup'",
      "'b1100000-0000-4000-8000-000000000107'",
    ]) {
      expect(testSql).toContain(identity);
    }
    expect(testSql).toContain('every approved canonical recipe key exists exactly once');
    expect(testSql).toContain(
      'all approved canonical recipes point to the exact enabled active version',
    );
    expect(testSql).not.toContain('six canonical recipes are seeded');
    expect(testSql).not.toMatch(/count\(\*\)::integer from public\.cozy_recipe_definitions/iu);
  });

  it('pins all twelve base and active-version ingredient mappings and rejects duplicates or orphans', () => {
    expect(testSql).toContain(
      'all twelve approved canonical recipe ingredient mappings retain exact item identities and quantities',
    );
    expect(testSql).toContain(
      "'b1100000-0000-4000-8000-000000000011', '71000000-0000-4000-8000-000000000004', 2",
    );
    expect(testSql).toContain('recipe ingredient recipe-item identities are unique');
    expect(testSql).toContain('recipe ingredients contain no orphan recipe or item references');
    expect(testSql).toContain(
      'active recipe-version ingredients exactly match the approved canonical mappings',
    );
    expect(testSql).not.toContain('recipe ingredients are normalized exactly');
    expect(testSql).not.toMatch(/count\(\*\)::integer from public\.cozy_recipe_ingredients/iu);
  });

  it('pins all seventeen offer identities and exact fixed-price contracts while allowing unrelated additions', () => {
    for (let suffix = 11; suffix <= 24; suffix += 1) {
      expect(testSql).toContain(`'74000000-0000-4000-8000-${String(suffix).padStart(12, '0')}'`);
    }
    for (const suffix of [20, 21, 22]) {
      expect(testSql).toContain(`'c1100000-0000-4000-8000-${String(suffix).padStart(12, '0')}'`);
    }
    expect(testSql).toContain(
      'all seventeen approved canonical General Store offers retain exact identities, prices, quantities, active state, and content versions',
    );
    expect(testSql).toContain('shop offer IDs and equivalent shop-item identities are unique');
    expect(testSql).toContain('where offer.id in (');
    expect(testSql).not.toContain('fourteen fixed-price offers are seeded');
    expect(testSql).not.toMatch(/count\(\*\)::integer from public\.cozy_shop_offers/iu);
  });
});

describe('Phase 11E housing migration chain', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const schemaSql = readFileSync(
    new URL('20260717140000_phase11e_housing_schema.sql', migrationDirectory),
    'utf8',
  );
  const playerSql = readFileSync(
    new URL('20260717141000_phase11e_housing_player_functions.sql', migrationDirectory),
    'utf8',
  );
  const operationsSql = readFileSync(
    new URL('20260717142000_phase11e_housing_admin_worker_functions.sql', migrationDirectory),
    'utf8',
  );

  it('parses every forward-only migration with PostgreSQL 17 grammar', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [schemaSql, playerSql, operationsSql]) {
      const result = await parser.parse(sql);
      expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
      expect(sql).not.toMatch(/drop\s+(?:table|schema)|truncate/iu);
    }
  });

  it('extends canonical homes, inventory, DUST, and progression instead of duplicating them', () => {
    expect(schemaSql).toContain('alter table public.player_homes');
    expect(schemaSql).toContain('alter table public.cozy_furniture_definitions');
    expect(schemaSql).toContain("'home-upgrade'");
    expect(playerSql).toContain('private.cozy_apply_dust_delta');
    expect(schemaSql).not.toContain('create table public.player_inventory_stacks');
    expect(schemaSql).not.toContain('create table public.player_dust_accounts');
    expect(schemaSql).not.toContain('create table public.player_quest_instances');
  });

  it('uses a stable database-reading validator and volatile mutation routines', () => {
    expect(playerSql).toMatch(
      /create or replace function private\.housing_validate_layout_draft[\s\S]+?returns jsonb language plpgsql stable security definer set search_path=''/iu,
    );
    expect(playerSql).toMatch(
      /create or replace function public\.save_player_home_layout[\s\S]+?returns jsonb language plpgsql volatile security definer set search_path=''/iu,
    );
    expect(playerSql).toContain('from public.housing_decoration_zones');
    expect(playerSql).toContain('from public.player_home_farming_tiles');
    expect(playerSql).toContain('from public.player_home_workstations');
  });

  it('protects immutable history, append-only evidence, RLS, and narrow RPC execution', () => {
    for (const table of [
      'home_layout_revisions',
      'home_layout_placement_snapshots',
      'home_storage_transactions',
      'player_home_upgrade_transactions',
      'housing_audit_events',
    ]) {
      expect(schemaSql).toContain(`'${table}'`);
    }
    expect(schemaSql).toContain(
      "execute format('alter table public.%I enable row level security',table_name)",
    );
    expect(schemaSql).toContain(
      "execute format('alter table public.%I force row level security',table_name)",
    );
    expect(schemaSql).toContain('home_layout_revisions_immutable');
    expect(schemaSql).toContain('home_layout_snapshots_immutable');
    expect(schemaSql).toContain('home_storage_transactions_immutable');
    expect(schemaSql).toContain('player_home_upgrade_transactions_immutable');
    expect(`${playerSql}\n${operationsSql}`).not.toMatch(
      /grant execute[^;]+to (?:public|anon|authenticated)/iu,
    );
  });

  it('keeps exact replays, Game Test, upgrades, and corrections fail closed', () => {
    expect(playerSql).toContain('cozy_gameplay_idempotency');
    expect(playerSql).toContain("'{status}','\"replayed\"'");
    expect(playerSql).toContain("'gameTest',false");
    expect(playerSql).not.toContain('game_test_housing_save');
    expect(playerSql).toContain("'home_upgrade'");
    expect(operationsSql).toContain('requiresIndependentAal2Review');
    expect(operationsSql).toContain('independent_review_required');
    expect(operationsSql).toContain("'automaticItemCorrections',0");
    expect(operationsSql).toContain("'automaticDustCorrections',0");
  });
});

describe('Phase 11 hosted database lint repair migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260717143000_fix_phase11_hosted_database_lint.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('is one additive forward-only PostgreSQL 17 migration', async () => {
    const result = await new Parser({ version: 17 }).parse(sql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    expect(sql).not.toMatch(/drop\s+(?:function|table|schema)|truncate|alter\s+table/iu);
  });

  it('marks the checklist stable while preserving its security-relevant size guard', () => {
    expect(sql).toMatch(
      /create or replace function private\.world_game_test_checklist_valid\(p_checklist jsonb\)[\s\S]*?language plpgsql\s+stable\s+security invoker\s+set search_path = ''/iu,
    );
    expect(sql).toContain('pg_column_size(p_checklist) > 4096');
    expect(sql).toContain('jsonb_object_keys(p_checklist)');
    expect(sql).toContain('jsonb_each(p_checklist)');
  });

  it('qualifies ambiguous recipe and progression identifiers', () => {
    expect(sql).toContain('and item_definition.active;');
    expect(sql).toContain('active_recipe.recipe_version_id');
    expect(sql).toContain('selected_revision<>p_expected_revision');
    expect(sql).toContain('target_definition_id');
    expect(sql).toContain('into current_xp,prior_level,curve_id');
    expect(sql).not.toContain('and active;');
  });

  it('removes dead declarations and uses request IDs for safe event correlation', () => {
    expect(sql).toContain('perform private.progression_settle_reward(');
    expect(sql).not.toContain('result text;');
    expect(sql).not.toContain('level_cursor integer;');
    expect(sql).toContain('direct_player_level_cursor');
    expect(sql).toContain('skill_level_cursor');
    expect(sql).toContain('contribution_player_level_cursor');
    expect(sql.match(/'requestId',p_request_id/gu)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(sql).not.toContain('template public.cozy_home_templates%rowtype');
    expect(sql).not.toContain('placement public.player_home_furniture%rowtype');
  });

  it('preserves exact signatures, search paths, security modes, and grants', () => {
    expect(sql.match(/create or replace function/gu)).toHaveLength(9);
    expect(sql.match(/set search_path\s*=\s*''/gu)).toHaveLength(9);
    expect(sql.match(/security definer/gu)).toHaveLength(8);
    expect(sql.match(/security invoker/gu)).toHaveLength(1);
    expect(sql).not.toMatch(/grant execute[^;]+to (?:public|anon|authenticated)/iu);
    expect(sql).toContain(
      'grant execute on function public.save_player_home_layout(text,uuid,integer,integer,integer,integer,integer,jsonb,uuid,text,text)',
    );
  });
});

describe('Phase 12A player-experience migration chain', () => {
  const migrationDirectory = new URL(
    '../../../infrastructure/supabase/migrations/',
    import.meta.url,
  );
  const schemaSql = readFileSync(
    new URL('20260718110000_phase12a_player_experience_schema.sql', migrationDirectory),
    'utf8',
  );
  const playerSql = readFileSync(
    new URL('20260718111000_phase12a_player_experience_functions.sql', migrationDirectory),
    'utf8',
  );
  const operationsSql = readFileSync(
    new URL('20260718112000_phase12a_player_experience_admin_worker.sql', migrationDirectory),
    'utf8',
  );

  it('uses forward-only PostgreSQL 17 migrations and no duplicate gameplay authority', async () => {
    const parser = new Parser({ version: 17 });
    for (const sql of [schemaSql, playerSql, operationsSql]) {
      expect((await parser.parse(sql)).stmts?.length ?? 0).toBeGreaterThan(0);
      expect(sql).not.toMatch(/drop\s+(?:table|schema)|truncate/iu);
    }
    expect(schemaSql).not.toContain('create table public.player_dust_accounts');
    expect(schemaSql).not.toContain('create table public.player_inventory_stacks');
    expect(schemaSql).not.toContain('create table public.player_quest_instances');
  });

  it('pins immutable onboarding and daily definitions to version authority', () => {
    expect(schemaSql).toContain(
      'policy_version_id uuid not null references public.player_experience_daily_policy_versions',
    );
    expect(schemaSql).toContain('player_experience_onboarding_steps_immutable');
    expect(schemaSql).toContain('player_experience_daily_objectives_immutable');
    expect(schemaSql).toContain('PLAYER_EXPERIENCE_VERSION_CHILD_IMMUTABLE');
    expect(playerSql).toContain('definition.policy_version_id=policy.id');
  });

  it('keeps daily refresh server-time-only and management successor-only', () => {
    expect(playerSql).toContain('public.refresh_player_daily_objectives');
    expect(playerSql).not.toMatch(/refresh_player_daily_objectives[\s\S]+p_game_day/iu);
    expect(operationsSql).toContain('public.create_admin_player_experience_daily_policy_successor');
    expect(operationsSql).toContain("p_assurance_level<>'aal2'");
    expect(operationsSql).toContain("'activePolicyUnchanged',true");
    expect(operationsSql).not.toContain('complete_everything');
  });

  it('forces RLS and exposes no browser-executable Phase 12A RPC', () => {
    expect(schemaSql).toContain("execute format('alter table public.%I force row level security'");
    expect(`${playerSql}\n${operationsSql}`).not.toMatch(
      /grant execute[^;]+to (?:public|anon|authenticated)/iu,
    );
    expect(playerSql).toContain(
      'grant execute on function public.refresh_player_daily_objectives(text,integer,text,text) to service_role',
    );
  });
});

describe('Phase 12B bundled world-asset lifecycle migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260718120000_phase12b_world_asset_bundled_lifecycle.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const collisionFixture = readFileSync(
    new URL('./fixtures/phase12b-pre-migration-asset-collision.sql', import.meta.url),
    'utf8',
  );

  it('parses with PostgreSQL 17 and seeds the complete bounded bundled catalog', async () => {
    const result = await new Parser({ version: 17 }).parse(sql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    expect(sql.match(/"key":"[a-z0-9._-]+"/gu)).toHaveLength(106);
    expect(sql).toContain("'PHASE12B_BUNDLED_VERSION_CONFLICT'");
    expect(sql).not.toMatch(/drop\s+(?:table|schema)|truncate/iu);
  });

  it('reuses exact repository identities but appends after colliding storage history', async () => {
    const result = await new Parser({ version: 17 }).parse(collisionFixture);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    expect(sql).toContain("candidate.source_kind = 'repository_procedural'");
    expect(sql).toContain("candidate.detected_mime_type = 'application/x-starville-procedural'");
    expect(sql).toContain('select coalesce(max(existing.version_number), 0) + 1');
    expect(sql).toContain('where catalog.world_asset_version_id is null');
    expect(collisionFixture).toContain("'ui.warning'");
    expect(collisionFixture).toContain("'legacy_storage_raster'");
  });

  it('keeps bundled metadata immutable behind forced RLS and narrow service RPC grants', () => {
    expect(sql).toContain('create table public.world_asset_bundled_catalog');
    expect(sql).toContain(
      'alter table public.world_asset_bundled_catalog force row level security',
    );
    expect(sql).toContain('revoke all on table public.world_asset_bundled_catalog');
    expect(sql).toContain('ASSET_BUNDLED_CATALOG_IMMUTABLE');
    expect(sql).toContain('ASSET_BUNDLED_DEFAULT_PROTECTED');
    expect(sql).not.toMatch(/grant execute[^;]+to (?:public|anon|authenticated)/iu);
  });

  it('protects restore with AAL2, both permissions, locking, revision, rate, replay, and audit', () => {
    expect(sql).toContain(
      'create or replace function public.restore_admin_game_asset_bundled_default',
    );
    expect(sql).toContain("if p_assurance_level <> 'aal2'");
    expect(sql).toContain("p_assurance_level, 'assets.activate'");
    expect(sql).toContain("p_assurance_level, 'assets.deprecate'");
    expect(sql).toContain("'asset-activation:' || p_asset_id::text");
    expect(sql).toContain('asset.record_version <> p_expected_asset_revision');
    expect(sql).toContain("'deprecation_write', p_user_id::text");
    expect(sql).toContain("private.world_asset_replay(p_user_id, 'restore_bundled_default'");
    expect(sql).toContain("'asset.bundled_default.restored'");
    expect(sql).toContain("'worldMapVersionAssetRowsUpdated', 0");
  });

  it('never rewrites immutable world asset pins and explicitly hardens sensitive AAL2 permissions', () => {
    expect(sql).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.world_map_version_assets/iu,
    );
    expect(sql).toContain(
      "p_permission_key in ('assets.approve', 'assets.activate', 'assets.deprecate')",
    );
    expect(sql).toContain("'override_not_available'");
    expect(sql).toContain("'bundled_default_missing'");
  });

  it('exposes bounded recommendation-only reconciliation for the worker', () => {
    expect(sql).toContain(
      'create or replace function public.reconcile_world_asset_bundled_lifecycle',
    );
    expect(sql).toContain('pg_try_advisory_xact_lock(');
    expect(sql).toContain("'world-asset-bundled-reconciliation'");
    expect(sql).toContain('p_limit not between 1 and 500');
    expect(sql).toContain("'automaticActionCount', 0");
    expect(sql).toContain("'publishedPinMutationCount', 0");
    expect(sql).toContain("'recommendationsOnly', true");
    expect(sql).toContain(
      'grant execute on function public.reconcile_world_asset_bundled_lifecycle(integer, text, text)',
    );
    expect(sql).toContain("'ACTIVE_OVERRIDE_DERIVATIVES_INCOMPLETE'");
    expect(sql).toContain("'ACTIVE_OVERRIDE_THUMBNAIL_MISSING'");
    expect(sql).toContain("'ACTIVE_OVERRIDE_VALIDATION_INVALID'");
    expect(sql).toContain("'APPROVED_OVERRIDE_VALIDATION_INVALID'");
    expect(sql).toContain("'DEPRECATED_OVERRIDE_ROLLBACK_INVALID'");
    expect(sql).toContain("'BUNDLED_CATALOG_MEDIA_METADATA_INVALID'");
  });

  it('projects one bounded player batch of eligible Starville overrides without browser grants', () => {
    expect(sql).toContain('create or replace function public.get_player_gameplay_asset_overrides');
    expect(sql).toContain('cardinality(p_asset_keys) not between 1 and 96');
    expect(sql).toContain("asset.game_key = 'starville'");
    expect(sql).toContain("asset.asset_source_state = 'uploaded_override'");
    expect(sql).toContain("version.lifecycle_status = 'active'");
    expect(sql).toContain("version.automated_validation_status = 'valid'");
    expect(sql).toContain('catalog.replacement_allowed');
    expect(sql).toContain("'bundledManifestVersion', null");
    expect(sql).toContain(
      'grant execute on function public.get_player_gameplay_asset_overrides(text, text[], text, integer)',
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.get_player_gameplay_asset_overrides[^;]+to (?:public|anon|authenticated)/iu,
    );
  });

  it('adds manifest-bound repository pins and one-query coverage summary evidence', () => {
    expect(sql).toContain('create or replace function private.world_asset_deliveries_for_version');
    expect(sql).toContain("'bundledManifestVersion'");
    expect(sql).toContain("'uploadedVersionCount'");
    expect(sql).toContain("'invalidVersionCount'");
    expect(sql).toContain("'referenceBreakdown'");
    expect(sql).toContain("'world'");
    expect(sql).toContain("'furniture'");
    expect(sql).toContain("'farming'");
  });
});

describe('Phase 12 hosted-validation repair migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260718121000_fix_phase12_hosted_validation.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const executionSql = readFileSync(
    new URL('./fixtures/phase12a-postgres-execution.sql', import.meta.url),
    'utf8',
  );

  it('adds one narrow private recovery overload without replacing inventory authority', async () => {
    const result = await new Parser({ version: 17 }).parse(sql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    expect(sql.match(/create function private\.cozy_add_item/gu)).toHaveLength(1);
    expect(sql).not.toContain('create or replace function private.cozy_add_item');
    expect(sql).toContain("p_reason <> 'starter_grant'");
    expect(sql).toContain("p_reference_id <> 'onboarding_recovery'");
    expect(sql).toContain('char_length(p_recovery_reference_id) not between 1 and 108');
    expect(sql).toContain('char_length(p_idempotency_key) not between 16 and 128');
    expect(sql).toContain("request_suffix := ':recovery:' || p_recovery_reference_id");
    expect(sql).toContain('char_length(request_suffix) + 128');
    expect(sql).toContain('right(p_request_id, char_length(request_suffix)) <> request_suffix');
    expect(sql).toContain("'phase12a-recovery:' || encode(");
    expect(sql).toContain("extensions.digest(convert_to(p_request_id, 'UTF8'), 'sha256')");
    expect(sql).toContain('ledger_request_id');
    expect(sql).toContain('return private.cozy_add_item(');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('from public, anon, authenticated, service_role');
    expect(sql).not.toMatch(/grant execute/iu);
  });

  it('pins the maximum 128-character caller request to a bounded deterministic ledger id', () => {
    expect(sql).toContain('when char_length(p_request_id) <= 128 then p_request_id');
    expect(executionSql).toContain(
      "public.reconcile_phase12a_player_experience(10,repeat('r',128))",
    );
    expect(executionSql).toContain("repeat('r',128)||':recovery:'||recovery_grant_id::text");
    expect(executionSql).toContain('and char_length(request_id)<=128');

    const composedRequestId = `${'r'.repeat(128)}:recovery:00000000-0000-4000-8000-000000000000`;
    const boundedRequestId = `phase12a-recovery:${createHash('sha256').update(composedRequestId).digest('hex')}`;
    expect(composedRequestId).toHaveLength(174);
    expect(boundedRequestId).toHaveLength(82);
  });
});

describe('Phase 12C world-manifest object contract migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260718122000_phase12c_world_manifest_object_contract.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const executionSql = readFileSync(
    new URL('./fixtures/world-postgres-execution.sql', import.meta.url),
    'utf8',
  );

  it('parses and layers the canonical object contract over the prior validator', async () => {
    const result = await new Parser({ version: 17 }).parse(sql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    expect(sql).toContain('rename to validate_world_manifest_phase12b');
    expect(sql).toContain('private.validate_world_manifest_phase12b(');
    expect(sql).toContain("object.value - 'rotation'");
    expect(sql).toContain("object.value ->> 'kind' = 'furniture'");
    expect(sql).toContain("jsonb_set(object.value - 'rotation', '{kind}', '\"sign\"'::jsonb");
  });

  it('accepts only the exact optional rotation shape and quarter turns', () => {
    expect(sql).toContain("array['assetId', 'id', 'kind', 'scale', 'x', 'y']::text[]");
    expect(sql).toContain("array['assetId', 'id', 'kind', 'rotation', 'scale', 'x', 'y']::text[]");
    expect(sql).toContain("jsonb_typeof(map_object -> 'rotation') <> 'number'");
    expect(sql).toContain('rotation_value not in (0, 90, 180, 270)');
    expect(sql).toContain("'INVALID_PHASE12C_MAP_OBJECT_ROTATION'");
    expect(sql).toContain("'INVALID_PHASE12C_MAP_OBJECT'");
    expect(executionSql).toContain('the canonical furniture object and rotation validate');
    expect(executionSql).toContain('an unsupported furniture rotation is rejected');
    expect(executionSql).toContain('a nonnumeric furniture rotation is rejected');
    expect(executionSql).toContain('an extra map-object field is rejected');
  });

  it('adds only exact furniture asset compatibility and preserves private authority', () => {
    expect(sql).toContain("when 'furniture' then p_object_kind = 'furniture'");
    expect(executionSql).toContain('canonical furniture asset/object compatibility is allowed');
    expect(executionSql).toContain(
      'furniture assets remain incompatible with non-furniture map objects',
    );
    expect(executionSql).toContain(
      'the Phase 12C validator and compatibility helper remain private',
    );
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('revoke all on function private.validate_world_manifest(uuid, jsonb)');
    expect(sql).toContain(
      'revoke all on function private.world_asset_object_kind_allowed(text, text)',
    );
    expect(sql).not.toMatch(/grant execute|create policy|alter table/iu);
  });
});

describe('Phase 12D repository-authored bundled registry migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../infrastructure/supabase/migrations/20260718123000_phase12d_repository_authored_bundled_registry.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('parses and creates an immutable stable-key plus manifest-version registry', async () => {
    const result = await new Parser({ version: 17 }).parse(sql);
    expect(result.stmts?.length ?? 0).toBeGreaterThan(0);
    expect(sql).toContain('create table public.world_asset_bundled_manifests');
    expect(sql).toContain('create table public.world_asset_bundled_manifest_registry');
    expect(sql).toContain('primary key (asset_key, manifest_version)');
    expect(sql).toContain('world_asset_bundled_manifest_registry_immutable');
    expect(sql).toContain('ASSET_BUNDLED_MANIFEST_REGISTRY_IMMUTABLE');
    expect(sql).toContain('force row level security');
    expect(sql).not.toMatch(/create policy|grant (?:select|insert|update|delete)/iu);
  });

  it('adds an evidence-gated repository-authored candidate path without fake final approval', () => {
    expect(sql).toContain("'repository_procedural', 'repository_authored'");
    expect(sql).toContain(
      "readiness_status in ('technical_baseline', 'production_candidate', 'final')",
    );
    expect(sql).toContain("readiness_status = 'final'");
    expect(sql).toContain('owner_accepted_by_admin_id is not null');
    expect(sql).toContain("registry.quality_status = 'final'");
    expect(sql).toContain("manifest.readiness_status = 'final'");
    expect(sql).toContain('REPOSITORY_AUTHORED_ASSET_NOT_OWNER_ACCEPTED');
    expect(sql).not.toMatch(
      /values\s*\(\s*'2\.0\.0'|set\s+(?:active_version_id|bundled_default_version_id)/iu,
    );
  });

  it('seeds only truthful v1 identities and never rewrites assets, overrides, or world pins', () => {
    expect(sql).toContain("'e86663780a9f890f97bcb436d1c7bfab5ab84b742b022f62757e357291c395df'");
    expect(sql).toContain('catalog.manifest_version');
    expect(sql).toContain("'repository_procedural'");
    expect(sql).toContain("'technical_baseline'");
    expect(sql).not.toMatch(/update\s+public\.world_assets\b/iu);
    expect(sql).not.toMatch(/update\s+public\.world_asset_versions\b/iu);
    expect(sql).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.world_map_version_assets\b/iu,
    );
  });

  it('keeps v1 projection shape compatible while classifying exact authored candidates', () => {
    expect(sql).toContain('create or replace function private.world_asset_deliveries_for_version');
    expect(sql).toContain("when registry.source_kind = 'repository_authored' then");
    expect(sql).toContain("jsonb_build_object('materialClass', 'bundled_candidate')");
    expect(sql).toContain("when 'repository_procedural' then 'repository_procedural'");
    expect(sql).toContain("when 'repository_authored' then 'repository_authored'");
  });
});
