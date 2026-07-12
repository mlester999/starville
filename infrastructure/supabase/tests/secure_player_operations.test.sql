begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(53);

select has_table('public', 'player_moderation_states', 'player moderation state exists');
select has_table('public', 'player_operation_audit_logs', 'player operation audit exists');
select has_table('public', 'admin_player_operation_rate_limits', 'admin operation rate limit exists');
select has_column('public', 'player_profiles', 'game_state_version', 'game state has a version');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.player_moderation_states'::regclass),
  'moderation states have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.player_operation_audit_logs'::regclass),
  'player audit has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_player_operation_rate_limits'::regclass),
  'admin operation rate limits have RLS enabled'
);

select ok(not has_table_privilege('anon', 'public.player_moderation_states', 'SELECT'), 'anon cannot read moderation state');
select ok(not has_table_privilege('authenticated', 'public.player_moderation_states', 'SELECT'), 'authenticated cannot read moderation state');
select ok(not has_table_privilege('service_role', 'public.player_moderation_states', 'SELECT'), 'service role cannot read moderation state directly');
select ok(not has_table_privilege('anon', 'public.player_operation_audit_logs', 'INSERT'), 'anon cannot forge player audits');
select ok(not has_table_privilege('authenticated', 'public.player_operation_audit_logs', 'DELETE'), 'authenticated cannot delete player audits');
select ok(not has_table_privilege('service_role', 'public.player_operation_audit_logs', 'SELECT'), 'service role cannot read player audits directly');

select ok(
  has_function_privilege('service_role', 'public.list_admin_players(uuid,uuid,text,text,text,integer,integer,text,text,text,text,integer,text,text)', 'EXECUTE'),
  'service role can call the narrow directory RPC'
);
select ok(
  has_function_privilege('service_role', 'public.admin_suspend_player(uuid,uuid,text,uuid,integer,text,text,integer)', 'EXECUTE'),
  'service role can call the narrow suspension RPC'
);
select ok(
  has_function_privilege('service_role', 'public.complete_required_player_rename(text,text,text,integer)', 'EXECUTE'),
  'service role can call the protected rename RPC'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.save_player_game_state(text,text,numeric,numeric,text,text,integer)',
    'EXECUTE'
  ) and has_function_privilege(
    'service_role',
    'public.save_player_game_state(text,text,numeric,numeric,text,integer,text,integer)',
    'EXECUTE'
  ),
  'service role can save state only through the optimistic-version signature'
);
select ok(
  not has_function_privilege('anon', 'public.list_admin_players(uuid,uuid,text,text,text,integer,integer,text,text,text,text,integer,text,text)', 'EXECUTE'),
  'anon cannot enumerate players'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_suspend_player(uuid,uuid,text,uuid,integer,text,text,integer)', 'EXECUTE'),
  'authenticated users cannot suspend players'
);
select ok(
  not has_function_privilege(
    'service_role',
    'private.cleanup_phase5_test_player(uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  'service role cannot execute maintenance-only Phase 5 fixture cleanup'
);
select ok(
  pg_get_functiondef('private.protect_wallet_access_event()'::regprocedure)
    like '%phase5_test_cleanup_wallet_address%'
  and pg_get_functiondef('private.protect_wallet_access_event()'::regprocedure)
    like '%current_user in (''postgres'', ''supabase_admin'')%',
  'wallet-event cleanup exception is limited to the exact PostgreSQL-owned test wallet'
);

select throws_ok(
  $$select private.claim_admin_player_operation_rate_limit(
    '11111111-1111-4111-8111-111111111111', 'suspend', null::integer
  )$$,
  '22023',
  'INVALID_ADMIN_PLAYER_RATE_LIMIT',
  'a NULL database mutation limit is rejected'
);
select throws_ok(
  $$select public.list_admin_players(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aal2', 'development', 'solana:mainnet-beta', 1, null::integer,
    '', 'all', 'all', 'all', null, 'last_entered_at', 'desc'
  )$$,
  '22023',
  'INVALID_PLAYER_DIRECTORY_QUERY',
  'a NULL page size cannot create an unbounded player directory query'
);
select throws_ok(
  $$select public.get_admin_player_activity(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aal2', 'development', 'solana:mainnet-beta',
    '33333333-3333-4333-8333-333333333333', null::integer
  )$$,
  '22023',
  'INVALID_PLAYER_ACTIVITY_QUERY',
  'a NULL activity limit cannot create an unbounded audit query'
);
select throws_ok(
  $$select public.admin_suspend_player(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aal2', '33333333-3333-4333-8333-333333333333', null::integer,
    'Reviewed test reason', 'phase5-null-version-suspend', 10
  )$$,
  '22023',
  'INVALID_PLAYER_SUSPENSION',
  'suspension rejects a NULL expected version before authorization'
);
select throws_ok(
  $$select public.admin_restore_player(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aal2', '33333333-3333-4333-8333-333333333333', null::integer,
    'Reviewed test reason', 'phase5-null-version-restore', 10
  )$$,
  '22023',
  'INVALID_PLAYER_RESTORATION',
  'restoration rejects a NULL expected version before authorization'
);
select throws_ok(
  $$select public.admin_reset_player_position(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aal2', '33333333-3333-4333-8333-333333333333', null::integer,
    'Reviewed test reason', 'phase5-null-version-reset', 10
  )$$,
  '22023',
  'INVALID_PLAYER_POSITION_RESET',
  'position reset rejects a NULL expected version before authorization'
);
select throws_ok(
  $$select public.admin_require_player_rename(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aal2', '33333333-3333-4333-8333-333333333333', null::integer,
    'Reviewed test reason', 'phase5-null-version-rename', 10
  )$$,
  '22023',
  'INVALID_PLAYER_RENAME_REQUIREMENT',
  'rename requirement rejects a NULL expected version before authorization'
);
select throws_ok(
  $$select public.admin_revoke_player_sessions(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aal2', '33333333-3333-4333-8333-333333333333', null::integer,
    'Reviewed test reason', 'phase5-null-version-revoke', 10
  )$$,
  '22023',
  'INVALID_PLAYER_SESSION_REVOCATION',
  'session revocation rejects a NULL expected version before authorization'
);
select throws_ok(
  $$select public.admin_suspend_player(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aal2', '33333333-3333-4333-8333-333333333333', 1,
    'Reviewed test reason', null::text, 10
  )$$,
  '22023',
  'INVALID_PLAYER_SUSPENSION',
  'suspension rejects a NULL request identifier before authorization'
);
select throws_ok(
  $$select public.admin_suspend_player(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aal2', '33333333-3333-4333-8333-333333333333', 1,
    'Reviewed test reason', 'phase5-null-rate-limit', null::integer
  )$$,
  '22023',
  'INVALID_PLAYER_SUSPENSION',
  'suspension rejects a NULL rate limit before authorization'
);

select has_trigger(
  'public',
  'player_profiles',
  'player_profiles_create_moderation_state',
  'new profiles receive a moderation row'
);

select is(
  (public.create_player_profile(
    '44444444444444444444444444444444', 'Phase Five', 'river', 'phase5-create', 10
  ) ->> 'status'),
  'loaded',
  'a profile is created through the existing boundary'
);
select is(
  (
    select moderation.status
    from public.player_moderation_states as moderation
    join public.player_profiles as profile on profile.id = moderation.player_profile_id
    where profile.wallet_address = '44444444444444444444444444444444'
  ),
  'active',
  'the profile trigger creates active moderation state'
);
select is(
  (public.load_player_profile('44444444444444444444444444444444') ->> 'appearancePreset'),
  'river',
  'the Phase 4 load contract remains compatible for an active player'
);
select is(
  (public.load_player_entry_state('44444444444444444444444444444444') ->> 'entryState'),
  'active',
  'the protected entry state is active initially'
);

create temporary table phase5_entry_timestamps as
select id, updated_at, last_entered_at
from public.player_profiles
where wallet_address = '44444444444444444444444444444444';

select ok(
  (public.load_player_entry_state(
    '44444444444444444444444444444444', 'phase5-entry-timestamp', true
  ) ->> 'entryState') = 'active'
  and (
    select profile.updated_at = snapshot.updated_at
      and profile.last_entered_at >= snapshot.last_entered_at
    from public.player_profiles as profile
    join phase5_entry_timestamps as snapshot on snapshot.id = profile.id
  ),
  'entry touch updates last-entered without pretending the saved profile state changed'
);

update public.player_moderation_states
set status = 'suspended',
    suspension_reason = 'Phase Five suspension fixture',
    suspended_at = now(),
    suspended_by_admin_id = '55555555-5555-4555-8555-555555555555',
    version = version + 1
where player_profile_id = (
  select id from public.player_profiles where wallet_address = '44444444444444444444444444444444'
);

select is(
  (public.load_player_entry_state('44444444444444444444444444444444') ->> 'entryState'),
  'suspended',
  'suspension blocks protected entry'
);
select is(
  (public.save_player_game_state(
    '44444444444444444444444444444444', 'lantern-square', 12, 7.5, 'south', 1,
    'phase5-suspended-save', 60
  ) ->> 'status'),
  'suspended',
  'suspension blocks state writes in the database'
);

update public.player_moderation_states
set status = 'active',
    suspension_reason = null,
    suspended_at = null,
    suspended_by_admin_id = null,
    rename_required = true,
    rename_reason = 'Phase Five rename fixture',
    rename_required_at = now(),
    rename_required_by_admin_id = '55555555-5555-4555-8555-555555555555',
    version = version + 1
where player_profile_id = (
  select id from public.player_profiles where wallet_address = '44444444444444444444444444444444'
);

select is(
  (public.load_player_entry_state('44444444444444444444444444444444') ->> 'entryState'),
  'rename_required',
  'rename-required state routes away from the map'
);
select is(
  (public.save_player_game_state(
    '44444444444444444444444444444444', 'lantern-square', 12, 7.5, 'south', 1,
    'phase5-rename-save', 60
  ) ->> 'status'),
  'rename_required',
  'rename-required state blocks game-state writes'
);
select is(
  (public.complete_required_player_rename(
    '44444444444444444444444444444444', 'Phase Harbor', 'phase5-complete-rename', 20
  ) ->> 'status'),
  'loaded',
  'a valid protected replacement name is accepted'
);
select is(
  (public.save_player_game_state(
    '44444444444444444444444444444444', 'lantern-square', 13, 8, 'east', 999,
    'phase5-stale-state-save', 60
  ) ->> 'status'),
  'game_state_version_conflict',
  'a stale in-flight save cannot overwrite an administrative reset or newer checkpoint'
);
select ok(
  not (
    select moderation.rename_required
    from public.player_moderation_states as moderation
    join public.player_profiles as profile on profile.id = moderation.player_profile_id
    where profile.wallet_address = '44444444444444444444444444444444'
  ),
  'rename-required state clears atomically'
);
select is(
  (
    select count(*)::integer
    from public.player_operation_audit_logs
    where wallet_address_snapshot = '44444444444444444444444444444444'
      and event_key = 'player.rename_completed'
      and outcome = 'success'
  ),
  1,
  'rename completion appends one player audit event'
);

select throws_ok(
  $$update public.player_operation_audit_logs
    set outcome = 'error'
    where wallet_address_snapshot = '44444444444444444444444444444444'$$,
  '42501',
  'PLAYER_OPERATION_AUDIT_APPEND_ONLY',
  'player audit rejects UPDATE below the API layer'
);
select throws_ok(
  $$delete from public.player_operation_audit_logs
    where wallet_address_snapshot = '44444444444444444444444444444444'$$,
  '42501',
  'PLAYER_OPERATION_AUDIT_APPEND_ONLY',
  'player audit rejects DELETE below the API layer'
);

select ok(
  pg_get_function_arguments(
    'public.admin_reset_player_position(uuid,uuid,text,uuid,integer,text,text,integer)'::regprocedure
  ) not like '%position%'
  and pg_get_functiondef(
    'public.admin_reset_player_position(uuid,uuid,text,uuid,integer,text,text,integer)'::regprocedure
  ) like '%current_map_version_id = default_version.id%'
  and pg_get_functiondef(
    'public.admin_reset_player_position(uuid,uuid,text,uuid,integer,text,text,integer)'::regprocedure
  ) like '%default_map.default_spawn_id%',
  'spawn reset accepts no coordinates and resolves the reviewed published default spawn'
);

select is(
  (select count(*)::integer from public.admin_permissions where is_system),
  46,
  'the catalog retains Phase 5 permissions and adds only the reviewed Phase 6 permissions'
);
select is(
  (
    select count(*)::integer
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    where role.key = 'super_admin'
  ),
  46,
  'Super Admin receives the complete reviewed permission catalog'
);
select is(
  (
    select count(*)::integer
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'blockchain_operator'
      and permission.key in (
        'players.suspend', 'players.reset_position', 'players.require_rename', 'players.manage_sessions'
      )
  ),
  0,
  'Blockchain Operator receives no player mutation permission'
);
select ok(
  exists (
    select 1
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'read_only_analyst' and permission.key = 'operations.read'
  ) and not exists (
    select 1
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'read_only_analyst' and permission.key = 'player_audit.read'
  ),
  'Read-only Analyst receives operations access but not player audit reasons'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'player_moderation_states',
        'player_operation_audit_logs',
        'admin_player_operation_rate_limits'
      )
  ),
  0,
  'Phase 5 tables expose no direct browser RLS policies'
);

select * from finish();
rollback;
