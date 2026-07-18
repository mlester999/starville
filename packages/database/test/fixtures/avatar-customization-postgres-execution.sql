-- Executes Phase 10A avatar authority against the isolated local PostgreSQL cluster.
begin;

create or replace function pg_temp.avatar_assert(condition boolean, assertion_message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception using errcode = 'P0001',
      message = 'AVATAR_CUSTOMIZATION_ASSERTION_FAILED: ' || assertion_message;
  end if;
end;
$$;

do $$
declare
  player_id constant uuid := '10a00000-0000-4000-8000-000000000001';
  challenge_id constant uuid := '10a00000-0000-4000-8000-000000000002';
  access_id constant uuid := '10a00000-0000-4000-8000-000000000003';
  platform_version_id constant uuid := '10a00000-0000-4000-8000-000000000004';
  disabled_platform_version_id constant uuid := '10a00000-0000-4000-8000-000000000005';
  content_admin_id constant uuid := '10a00000-0000-4000-8000-000000000006';
  config_id uuid;
  map_version_id uuid;
  platform_id uuid;
  super_role_id uuid;
  active_platform_version_id uuid;
  platform_configuration jsonb;
  accessory_definition_id uuid;
  accessory_version_id uuid;
  accessory_index integer;
  configured_accessory_limit integer;
  result jsonb;
  replay jsonb;
  player_appearance_id uuid;
  oversized_rejected boolean := false;
begin
  perform pg_temp.avatar_assert(
    (select count(*) = 1
     from pg_proc routine
     join pg_namespace namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'private'
       and routine.proname = 'resolve_avatar_selection')
      and (select routine.provolatile = 's'
            and routine.prosecdef
            and routine.pronargdefaults = 1
            and routine.proconfig @> array['search_path=""']
            and pg_get_userbyid(routine.proowner) = 'postgres'
           from pg_proc routine
           where routine.oid = 'private.resolve_avatar_selection(jsonb,boolean)'::regprocedure)
      and not has_function_privilege(
        'service_role', 'private.resolve_avatar_selection(jsonb,boolean)', 'execute'
      )
      and not has_function_privilege(
        'authenticated', 'private.resolve_avatar_selection(jsonb,boolean)', 'execute'
      ),
    'the repaired avatar resolver keeps one stable SECURITY DEFINER signature, default, owner, empty search path, and private grant boundary'
  );
  perform pg_temp.avatar_assert(
    position('configured_max_accessories' in lower(pg_get_functiondef(
      'private.resolve_avatar_selection(jsonb,boolean)'::regprocedure
    ))) > 0
      and position('settings.max_accessories' in lower(pg_get_functiondef(
        'private.resolve_avatar_selection(jsonb,boolean)'::regprocedure
      ))) > 0
      and position('select max_accessories into max_accessories' in lower(pg_get_functiondef(
        'private.resolve_avatar_selection(jsonb,boolean)'::regprocedure
      ))) = 0,
    'the deployed avatar resolver has no ambiguous accessory-limit column reference'
  );
  perform pg_temp.avatar_assert(
    not private.avatar_module_enabled(),
    'the additive migration does not publish or mutate the active platform configuration'
  );
  select platform.id, active.configuration_version_id, version.configuration
  into strict platform_id, active_platform_version_id, platform_configuration
  from public.game_platforms platform
  join public.game_platform_active_configuration active
    on active.game_platform_id = platform.id
  join public.game_platform_configuration_versions version
    on version.id = active.configuration_version_id
  where platform.key = 'starville';
  platform_configuration := private.upgrade_phase10a_platform_configuration(platform_configuration);
  perform pg_temp.avatar_assert(
    private.valid_platform_configuration(platform_configuration)
      and (select count(*) = 1 from jsonb_array_elements(platform_configuration -> 'modules') module
           where module ->> 'key' = 'avatar_customization')
      and (select count(*) = 1 from jsonb_array_elements(platform_configuration -> 'navigation' -> 'items') navigation
           where navigation ->> 'routeKey' = 'avatar_content'
             and navigation ->> 'moduleKey' = 'avatar_customization'
             and navigation ->> 'icon' = 'players'
             and navigation ->> 'group' = 'World Management'),
    'future drafts receive one valid module and one bounded Avatar Content navigation item'
  );
  insert into public.game_platform_configuration_versions (
    id, game_platform_id, version_number, lifecycle_status, configuration,
    validation_results, published_at, revision
  ) select
    platform_version_id, platform_id, max(version_number) + 1, 'published',
    platform_configuration,
    '{"valid":true,"findings":[]}'::jsonb, now(), 1
  from public.game_platform_configuration_versions where game_platform_id = platform_id;
  update public.game_platform_active_configuration set
    configuration_version_id = platform_version_id, revision = revision + 1,
    activated_at = now()
  where game_platform_id = platform_id;
  perform pg_temp.avatar_assert(private.avatar_module_enabled(), 'an explicitly published test module becomes active');

  select id into strict config_id from public.token_gate_configs
  where environment_key = 'development' and network = 'solana:devnet';
  select active_published_version_id into strict map_version_id
  from public.world_maps where slug = 'lantern-square';
  insert into public.wallet_auth_challenges (
    id, wallet_address, network, token_gate_config_id, config_version_snapshot,
    nonce_hash, message_hash, domain, uri, issued_at, expires_at, consumed_at,
    request_id, ip_hash
  ) values (
    challenge_id, '11111111111111111111111111111131', 'solana:devnet', config_id, 1,
    repeat('a',64), repeat('b',64), 'localhost', 'http://localhost:3000',
    now()-interval '1 minute', now()+interval '4 minutes', now(),
    'phase10a-challenge', repeat('c',64)
  );
  insert into public.wallet_access_sessions (
    id, challenge_id, wallet_address, network, token_gate_config_id,
    config_version_snapshot, session_token_hash, observed_balance_raw,
    required_balance_raw, checked_slot, last_balance_check_at, expires_at
  ) values (
    access_id, challenge_id, '11111111111111111111111111111131', 'solana:devnet',
    config_id, 1, repeat('d',64), 1000, 1000, 1, now(), now()+interval '30 minutes'
  );
  insert into public.player_profiles (
    id, wallet_address, display_name, appearance_preset, current_map_id,
    current_map_version_id, safe_position_x, safe_position_y, facing_direction
  ) values (
    player_id, '11111111111111111111111111111131', 'Avatar Player', 'moss',
    'lantern-square', map_version_id, 12, 8, 'south'
  );
  select avatar_profile.appearance_id into strict player_appearance_id
  from public.player_avatar_profiles as avatar_profile
  where avatar_profile.player_profile_id = player_id;
  perform pg_temp.avatar_assert(
    (select revision = 0 and creator_completed_at is null
     from public.player_avatar_profiles where player_profile_id = player_id),
    'canonical player creation produces exactly one incomplete legacy-compatible avatar shell'
  );

  result := public.get_player_avatar_catalog(
    '11111111111111111111111111111131', repeat('d',64), 'phase10a-catalog'
  );
  perform pg_temp.avatar_assert(
    result ->> 'status' = 'loaded'
      and jsonb_array_length(result #> '{catalog,bodyPresets}') = 3
      and jsonb_array_length(result #> '{catalog,items}') = 0,
    'catalog exposes structural legacy bodies without inventing published modular cosmetics'
  );

  select role.id into strict super_role_id from public.admin_roles role where role.key = 'super_admin';
  insert into auth.users(id, email)
  values (content_admin_id, 'avatar-lint-content@example.invalid');
  insert into public.admin_users(user_id, role_id, status, display_name, mfa_required)
  values (content_admin_id, super_role_id, 'active', 'Avatar Lint Content', false);
  select settings.max_accessories into strict configured_accessory_limit
  from public.avatar_settings as settings
  where settings.game_key = 'starville';
  perform pg_temp.avatar_assert(
    configured_accessory_limit = 3,
    'the default configured maximum remains three accessories'
  );
  for accessory_index in 1..4 loop
    accessory_definition_id := gen_random_uuid();
    accessory_version_id := gen_random_uuid();
    insert into public.avatar_content_definitions (
      id, content_key, content_type, category, content_layer, display_name,
      description, access_level, created_by_admin_id
    ) values (
      accessory_definition_id, 'lint-accessory-' || accessory_index::text,
      'accessory', 'accessory', 'head_accessory',
      'Lint accessory ' || accessory_index::text,
      'Local accessory-limit execution fixture.', 'starter', content_admin_id
    );
    insert into public.avatar_content_versions (
      id, avatar_content_definition_id, version_number, lifecycle_status,
      public_name, description, render_order, frame_width, frame_height,
      sheet_rows, sheet_columns, created_by_admin_id, submitted_by_admin_id,
      reviewed_by_admin_id, approved_by_admin_id, activated_by_admin_id,
      submitted_at, reviewed_at, approved_at, activated_at
    ) values (
      accessory_version_id, accessory_definition_id, 1, 'active',
      'Lint accessory ' || accessory_index::text,
      'Local accessory-limit execution fixture.', 70 + accessory_index,
      32, 48, 1, 1, content_admin_id, content_admin_id, content_admin_id,
      content_admin_id, content_admin_id, now(), now(), now(), now()
    );
    update public.avatar_content_definitions
    set active_version_id = accessory_version_id
    where id = accessory_definition_id;
  end loop;
  result := private.resolve_avatar_selection(
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":["lint-accessory-1","lint-accessory-2"]}'::jsonb
  );
  perform pg_temp.avatar_assert(
    result ->> 'status' = 'resolved'
      and jsonb_array_length(result -> 'accessoryVersionIds') = 2,
    'avatar selection below the configured accessory limit resolves deterministically'
  );
  result := private.resolve_avatar_selection(
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":["lint-accessory-1","lint-accessory-2","lint-accessory-3"]}'::jsonb
  );
  perform pg_temp.avatar_assert(
    result ->> 'status' = 'resolved'
      and jsonb_array_length(result -> 'accessoryVersionIds') = configured_accessory_limit,
    'avatar selection exactly at the configured accessory limit resolves'
  );
  result := private.resolve_avatar_selection(
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":["lint-accessory-1","lint-accessory-2","lint-accessory-3","lint-accessory-4"]}'::jsonb
  );
  perform pg_temp.avatar_assert(
    result ->> 'status' = 'invalid_selection',
    'avatar selection above the configured accessory limit is rejected'
  );
  result := private.resolve_avatar_selection(
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":["lint-accessory-missing"]}'::jsonb
  );
  perform pg_temp.avatar_assert(
    result ->> 'status' = 'content_unavailable',
    'avatar selection retains the closed active-content ownership boundary'
  );
  result := public.create_player_avatar_profile(
    '11111111111111111111111111111131', repeat('d',64), 0,
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":[]}'::jsonb,
    'phase10a-create'
  );
  replay := public.create_player_avatar_profile(
    '11111111111111111111111111111131', repeat('d',64), 0,
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":[]}'::jsonb,
    'phase10a-create'
  );
  perform pg_temp.avatar_assert(
    result = replay and result ->> 'status' = 'created'
      and result #>> '{profile,revision}' = '1',
    'first appearance creation is authoritative, atomic, and exactly replayable'
  );
  result := public.update_player_avatar_profile(
    '11111111111111111111111111111131', repeat('d',64), 1,
    '{"bodyPresetKey":"willow-frame","accessoryKeys":[]}'::jsonb,
    'phase10a-update'
  );
  perform pg_temp.avatar_assert(
    result ->> 'status' = 'updated'
      and result #>> '{profile,revision}' = '2'
      and result #>> '{profile,bodyPresetKey}' = 'willow-frame',
    'profile update replaces the complete pinned selection under one revision'
  );
  perform pg_temp.avatar_assert(
    (select safe_position_x = 12 and safe_position_y = 8 and facing_direction = 'south'
     from public.player_profiles where id = player_id),
    'appearance creation and update never reset the authoritative player position or facing'
  );
  result := public.update_player_avatar_profile(
    '11111111111111111111111111111131', repeat('d',64), 1,
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":[]}'::jsonb,
    'phase10a-stale'
  );
  perform pg_temp.avatar_assert(
    result ->> 'status' = 'profile_changed' and result #>> '{profile,revision}' = '2',
    'stale expected revisions cannot overwrite the authoritative profile'
  );
  result := public.get_resolved_public_avatar(player_appearance_id, 'phase10a-public');
  perform pg_temp.avatar_assert(
    result ->> 'status' = 'loaded'
      and result #>> '{appearance,appearanceId}' = player_appearance_id::text
      and not (result -> 'appearance' ? 'playerProfileId'),
    'public resolution returns only privacy-safe appearance data'
  );

  begin
    insert into public.avatar_content_definitions (
      content_key, content_type, category, content_layer, display_name
    ) values (repeat('a',81), 'face', 'face', 'face', 'Oversized');
  exception when check_violation then oversized_rejected := true;
  end;
  perform pg_temp.avatar_assert(oversized_rejected, '81-character public avatar keys are rejected');

  platform_configuration := jsonb_set(
    platform_configuration,
    '{modules}',
    (select jsonb_agg(case when module ->> 'key' = 'avatar_customization'
                           then jsonb_set(module, '{enabled}', 'false'::jsonb)
                           else module end order by ordinality)
     from jsonb_array_elements(platform_configuration -> 'modules')
       with ordinality entries(module, ordinality))
  );
  insert into public.game_platform_configuration_versions (
    id, game_platform_id, version_number, lifecycle_status, configuration,
    validation_results, published_at, revision
  ) select
    disabled_platform_version_id, platform_id, max(version_number) + 1, 'published',
    platform_configuration, '{"valid":true,"findings":[]}'::jsonb, now(), 1
  from public.game_platform_configuration_versions where game_platform_id = platform_id;
  update public.game_platform_active_configuration set
    configuration_version_id = disabled_platform_version_id, revision = revision + 1
  where game_platform_id = platform_id;
  result := public.update_player_avatar_profile(
    '11111111111111111111111111111131', repeat('d',64), 2,
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":[]}'::jsonb,
    'phase10a-disabled'
  );
  perform pg_temp.avatar_assert(
    result ->> 'status' = 'module_disabled'
      and (public.get_resolved_public_avatar(player_appearance_id, 'phase10a-fallback')
           #>> '{appearance,renderMode}') = 'legacy_fallback',
    'module disable preserves the profile while writes stop and public rendering falls back safely'
  );

  perform pg_temp.avatar_assert(
    not has_table_privilege('service_role', 'public.player_avatar_profiles', 'select')
      and not has_table_privilege('authenticated', 'public.avatar_content_versions', 'select')
      and has_function_privilege(
        'service_role', 'public.update_player_avatar_profile(text,text,integer,jsonb,text)', 'execute'
      )
      and not has_function_privilege(
        'authenticated', 'public.update_player_avatar_profile(text,text,integer,jsonb,text)', 'execute'
      ),
    'forced-RLS tables remain closed while only the trusted server receives narrow RPC execution'
  );
end;
$$;

select 'avatar-customization postgres execution assertions passed' as result;
rollback;
