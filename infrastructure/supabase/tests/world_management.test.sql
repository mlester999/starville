begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(70);

select has_table('public', 'world_maps', 'world map identities exist');
select has_table('public', 'world_map_versions', 'immutable world versions exist');
select has_table('public', 'world_assets', 'world asset catalog exists');
select has_table('public', 'world_map_version_assets', 'version asset references exist');
select has_table('public', 'world_audit_events', 'world audit exists');
select has_table('public', 'world_operation_rate_limits', 'durable world limits exist');
select has_column('public', 'player_profiles', 'current_map_version_id', 'player state records a map version');
select has_column('public', 'player_profiles', 'last_successful_transition_at', 'player state records successful travel');

select ok((select relrowsecurity from pg_class where oid = 'public.world_maps'::regclass), 'world maps have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.world_map_versions'::regclass), 'world versions have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.world_assets'::regclass), 'world assets have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.world_map_version_assets'::regclass), 'asset references have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.world_audit_events'::regclass), 'world audit has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.world_operation_rate_limits'::regclass), 'world limits have RLS');

select ok(not has_table_privilege('anon', 'public.world_maps', 'SELECT'), 'anon cannot enumerate world maps');
select ok(not has_table_privilege('authenticated', 'public.world_maps', 'SELECT'), 'authenticated cannot enumerate world maps');
select ok(not has_table_privilege('service_role', 'public.world_maps', 'SELECT'), 'service role cannot directly read world maps');
select ok(not has_table_privilege('anon', 'public.world_audit_events', 'INSERT'), 'anon cannot forge world audit');
select ok(not has_table_privilege('authenticated', 'public.world_audit_events', 'DELETE'), 'authenticated cannot delete world audit');
select ok(not has_table_privilege('service_role', 'public.world_audit_events', 'SELECT'), 'service role cannot directly read world audit');

select ok(
  has_function_privilege('service_role', 'public.get_current_published_world(text,text,integer)', 'EXECUTE'),
  'service role can call the narrow current-world RPC'
);
select ok(
  not has_function_privilege('anon', 'public.get_current_published_world(text,text,integer)', 'EXECUTE'),
  'anon cannot call the player world RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.get_current_published_world(text,text,integer)', 'EXECUTE'),
  'general authenticated users cannot call the player world RPC'
);
select ok(
  has_function_privilege('service_role', 'public.transition_player_world(text,text,integer,uuid,text,integer)', 'EXECUTE'),
  'service role can call the narrow transition RPC'
);
select ok(
  not has_function_privilege('anon', 'public.transition_player_world(text,text,integer,uuid,text,integer)', 'EXECUTE'),
  'anon cannot request world transitions'
);
select ok(
  has_function_privilege('service_role', 'public.list_admin_world_maps(uuid,uuid,text,integer,integer,text,text,text,text,text,integer)', 'EXECUTE'),
  'service role can call the protected world directory RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.list_admin_world_maps(uuid,uuid,text,integer,integer,text,text,text,text,text,integer)', 'EXECUTE'),
  'general authenticated users cannot enumerate administrator world content'
);
select ok(
  has_function_privilege('service_role', 'public.publish_admin_world_version(uuid,uuid,text,uuid,uuid,integer,uuid,text,text,text,integer)', 'EXECUTE'),
  'service role can call the protected publication RPC'
);
select ok(
  not has_function_privilege('anon', 'public.publish_admin_world_version(uuid,uuid,text,uuid,uuid,integer,uuid,text,text,text,integer)', 'EXECUTE'),
  'anon cannot publish world content'
);
select ok(
  not has_function_privilege('service_role', 'private.validate_world_manifest(uuid,jsonb)', 'EXECUTE'),
  'service role cannot bypass the public validation boundary'
);

select is((select count(*)::integer from public.world_maps where status = 'active'), 5, 'five active development maps are seeded');
select is((select count(*)::integer from public.world_map_versions where lifecycle_status = 'published'), 5, 'five immutable publications are seeded');
select ok(
  not exists (
    select 1 from public.world_maps as map
    left join public.world_map_versions as version on version.id = map.active_published_version_id
    where map.status = 'active' and (version.id is null or version.lifecycle_status <> 'published')
  ),
  'each active map resolves atomically to one published version'
);
select is(
  (select array_agg(slug order by slug) from public.world_maps),
  array['brooklight-crossing', 'hearthfield-road', 'lantern-square', 'moonpetal-meadow', 'whisperpine-gate']::text[],
  'only the approved Phase 6 world graph is seeded'
);
select is((select count(*)::integer from public.world_assets), 15, 'the reviewed procedural catalog contains fifteen stable assets');
select ok(
  not exists (
    select 1 from public.world_assets
    where source_type = 'repository_procedural'
      and (media_type <> 'application/x-starville-procedural' or width is not null or height is not null or file_size_bytes is not null)
  ),
  'procedural assets carry truthful non-file metadata'
);
select ok(
  not exists (select 1 from public.world_assets where storage_path ~* '^(https?|data|javascript):'),
  'world assets contain no arbitrary external URL'
);
select ok(
  not exists (
    select 1
    from public.world_maps as map
    join public.world_map_versions as version on version.id = map.active_published_version_id
    where not coalesce((private.validate_world_manifest(map.id, version.manifest) ->> 'valid')::boolean, false)
  ),
  'all seeded publications pass the trusted database validator'
);
select is(
  (
    select count(*)::integer
    from public.world_maps as map
    join public.world_map_versions as version on version.id = map.active_published_version_id,
      lateral jsonb_array_elements(version.manifest -> 'exits') as exit_definition
    where map.slug = 'lantern-square' and (exit_definition ->> 'enabled')::boolean
  ),
  4,
  'Lantern Square exposes all four approved directional exits'
);
select is(
  (
    select count(*)::integer
    from public.world_maps as map
    join public.world_map_versions as version on version.id = map.active_published_version_id,
      lateral jsonb_array_elements(version.manifest -> 'exits') as exit_definition
    where map.slug <> 'lantern-square' and (exit_definition ->> 'enabled')::boolean
  ),
  4,
  'each outer development map exposes only its one return route'
);
select ok(
  not exists (
    select 1
    from public.world_maps as source_map
    join public.world_map_versions as source_version on source_version.id = source_map.active_published_version_id,
      lateral jsonb_array_elements(source_version.manifest -> 'exits') as exit_definition
    where (exit_definition ->> 'enabled')::boolean
      and not exists (
        select 1
        from public.world_maps as destination_map
        join public.world_map_versions as destination_version on destination_version.id = destination_map.active_published_version_id,
          lateral jsonb_array_elements(destination_version.manifest -> 'spawns') as destination_spawn
        where destination_map.slug = exit_definition ->> 'destinationMapId'
          and destination_spawn ->> 'id' = exit_definition ->> 'destinationSpawnId'
          and (destination_spawn ->> 'enabled')::boolean
      )
  ),
  'every enabled exit resolves to a published approved destination spawn'
);
select ok(
  not exists (
    select 1
    from public.world_maps as source_map
    join public.world_map_versions as source_version on source_version.id = source_map.active_published_version_id,
      lateral jsonb_array_elements(source_version.manifest -> 'exits') as exit_definition
    join public.world_maps as destination_map on destination_map.slug = exit_definition ->> 'destinationMapId'
    join public.world_map_versions as destination_version on destination_version.id = destination_map.active_published_version_id,
      lateral jsonb_array_elements(destination_version.manifest -> 'spawns') as destination_spawn,
      lateral jsonb_array_elements(destination_version.manifest -> 'exits') as destination_exit
    where (exit_definition ->> 'enabled')::boolean
      and destination_spawn ->> 'id' = exit_definition ->> 'destinationSpawnId'
      and (destination_spawn ->> 'x')::numeric >= (destination_exit -> 'trigger' ->> 'x')::numeric
      and (destination_spawn ->> 'x')::numeric <= (destination_exit -> 'trigger' ->> 'x')::numeric + (destination_exit -> 'trigger' ->> 'width')::numeric
      and (destination_spawn ->> 'y')::numeric >= (destination_exit -> 'trigger' ->> 'y')::numeric
      and (destination_spawn ->> 'y')::numeric <= (destination_exit -> 'trigger' ->> 'y')::numeric + (destination_exit -> 'trigger' ->> 'height')::numeric
  ),
  'destination spawns cannot immediately retrigger an exit'
);

select ok(
  exists (select 1 from public.admin_permissions where key = 'maps.preview' and is_system)
  and exists (select 1 from public.admin_permissions where key = 'maps.audit_read' and is_system),
  'both reviewed Phase 6 world permissions are seeded as system metadata'
);
select is(
  (select count(*)::integer from public.admin_permissions where key in ('maps.read','maps.edit','maps.preview','maps.publish','maps.audit_read','assets.read')),
  6,
  'the Phase 6 world boundary uses six narrow permissions'
);
select is(
  (
    select coalesce(array_agg(permission.key order by permission.key), array[]::text[])
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'super_admin' and permission.key in ('maps.read','maps.edit','maps.preview','maps.publish','maps.audit_read','assets.read')
  ),
  array['assets.read','maps.audit_read','maps.edit','maps.preview','maps.publish','maps.read']::text[],
  'Super Admin receives the full Phase 6 permission set'
);
select is(
  (
    select coalesce(array_agg(permission.key order by permission.key), array[]::text[])
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'game_administrator' and permission.key in ('maps.read','maps.edit','maps.preview','maps.publish','maps.audit_read','assets.read')
  ),
  array['assets.read','maps.audit_read','maps.edit','maps.preview','maps.read']::text[],
  'Game Administrator can read, edit, preview, audit, and read assets but cannot publish'
);
select is(
  (
    select coalesce(array_agg(permission.key order by permission.key), array[]::text[])
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'live_operations_manager' and permission.key in ('maps.read','maps.edit','maps.preview','maps.publish','maps.audit_read','assets.read')
  ),
  array['assets.read','maps.audit_read','maps.read']::text[],
  'Live Operations has read, audit, and asset visibility without world mutation'
);
select is(
  (
    select coalesce(array_agg(permission.key order by permission.key), array[]::text[])
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'world_designer' and permission.key in ('maps.read','maps.edit','maps.preview','maps.publish','maps.audit_read','assets.read')
  ),
  array['assets.read','maps.audit_read','maps.edit','maps.preview','maps.publish','maps.read']::text[],
  'World Designer receives the explicitly approved complete world workflow'
);
select is(
  (
    select coalesce(array_agg(permission.key order by permission.key), array[]::text[])
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'moderator' and permission.key in ('maps.read','maps.edit','maps.preview','maps.publish','maps.audit_read','assets.read')
  ),
  array[]::text[],
  'Moderator receives no world-management permission by default'
);
select is(
  (
    select coalesce(array_agg(permission.key order by permission.key), array[]::text[])
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'blockchain_operator' and permission.key in ('maps.read','maps.edit','maps.preview','maps.publish','maps.audit_read','assets.read')
  ),
  array[]::text[],
  'Blockchain Operator receives no world-management permission'
);
select is(
  (
    select coalesce(array_agg(permission.key order by permission.key), array[]::text[])
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'read_only_analyst'
      and permission.key in ('maps.read','maps.edit','maps.preview','maps.publish','maps.audit_read','assets.read')
  ),
  array['assets.read','maps.read']::text[],
  'Read-only Analyst receives world and asset visibility without preview, audit, or mutation authority'
);
select is(
  (
    select count(*)::integer
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key not in ('super_admin','game_administrator','world_designer')
      and permission.key in ('maps.edit','maps.preview','maps.publish')
  ),
  0,
  'roles without an explicit world workflow mapping cannot edit, preview, or publish maps'
);

select is(
  (public.create_player_profile('66666666666666666666666666666666', 'Phase Six', 'moss', 'phase6-create', 20) ->> 'status'),
  'loaded',
  'a deterministic Phase 6 travel fixture is created through the trusted player boundary'
);

create temporary table phase6_current_world as
select public.get_current_published_world(
  '66666666666666666666666666666666', 'phase6-current', 100
) as value;

select is((select value ->> 'status' from phase6_current_world), 'loaded', 'current published world loads');
select is((select value -> 'map' ->> 'slug' from phase6_current_world), 'lantern-square', 'legacy player state reconciles to published Lantern Square');

create temporary table phase6_transition as
select public.transition_player_world(
  '66666666666666666666666666666666',
  'exit-north',
  (select (value -> 'playerState' ->> 'gameStateVersion')::integer from phase6_current_world),
  (select (value -> 'version' ->> 'id')::uuid from phase6_current_world),
  'phase6-transition-north',
  60
) as value;

select is((select value ->> 'status' from phase6_transition), 'transitioned', 'north transition succeeds atomically');
select is((select value -> 'map' ->> 'slug' from phase6_transition), 'moonpetal-meadow', 'north transition resolves the approved destination map');
select is((select value -> 'transition' ->> 'destinationSpawnId' from phase6_transition), 'from-south', 'north transition resolves the approved inward spawn');
select is(
  (public.transition_player_world(
    '66666666666666666666666666666666',
    'exit-north',
    (select (value -> 'playerState' ->> 'gameStateVersion')::integer from phase6_current_world),
    (select (value -> 'version' ->> 'id')::uuid from phase6_current_world),
    'phase6-transition-north',
    60
  ) ->> 'status'),
  'replayed',
  'the same transition request is idempotently replayed'
);
select is(
  (public.transition_player_world(
    '66666666666666666666666666666666',
    'exit-north',
    (select (value -> 'playerState' ->> 'gameStateVersion')::integer from phase6_current_world),
    (select (value -> 'version' ->> 'id')::uuid from phase6_current_world),
    'phase6-transition-north',
    60
  ) -> 'transition' ->> 'destinationSpawnId'),
  'from-south',
  'a replay reports the original destination spawn instead of a default-spawn approximation'
);
select is(
  (public.save_player_game_state(
    '66666666666666666666666666666666',
    'moonpetal-meadow', 10, 14.5, 'north',
    (select (value -> 'playerState' ->> 'gameStateVersion')::integer from phase6_current_world),
    'phase6-stale-save', 60
  ) ->> 'status'),
  'game_state_version_conflict',
  'a stale checkpoint cannot overwrite the newer transition'
);

update public.player_profiles
set last_successful_transition_at = now() - interval '2 seconds'
where wallet_address = '66666666666666666666666666666666';

select is(
  (public.transition_player_world(
    '66666666666666666666666666666666',
    'exit-disabled',
    (select (value -> 'playerState' ->> 'gameStateVersion')::integer from phase6_transition),
    (select (value -> 'version' ->> 'id')::uuid from phase6_transition),
    'phase6-invalid-exit', 60
  ) ->> 'status'),
  'invalid_exit',
  'unknown or disabled exits cannot trigger travel'
);

select throws_ok(
  $$update public.world_map_versions set publication_reason = publication_reason where lifecycle_status = 'published'$$,
  '42501', 'PUBLISHED_WORLD_VERSION_IMMUTABLE',
  'published manifests are immutable below the administrator API'
);
select throws_ok(
  $$delete from public.world_map_versions where lifecycle_status = 'published'$$,
  '42501', 'WORLD_VERSION_HISTORY_RETAINED',
  'published version history cannot be deleted'
);
select throws_ok(
  $$update public.world_audit_events set outcome = outcome$$,
  '42501', 'WORLD_AUDIT_APPEND_ONLY',
  'world audit rejects updates'
);
select throws_ok(
  $$delete from public.world_audit_events$$,
  '42501', 'WORLD_AUDIT_APPEND_ONLY',
  'world audit rejects deletes'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in (
    'world_maps', 'world_map_versions', 'world_assets', 'world_map_version_assets',
    'world_audit_events', 'world_operation_rate_limits'
  )),
  0,
  'world tables expose no direct browser policies'
);
select ok(
  pg_get_functiondef('public.list_admin_players(uuid,uuid,text,text,text,integer,integer,text,text,text,text,integer,text,text)'::regprocedure)
    like '%profile.current_map_id = p_map_id%',
  'the existing player directory now filters every registered world map'
);
select ok(
  pg_get_functiondef('public.admin_reset_player_position(uuid,uuid,text,uuid,integer,text,text,integer)'::regprocedure)
    like '%current_map_version_id = default_version.id%'
  and pg_get_functiondef('public.admin_reset_player_position(uuid,uuid,text,uuid,integer,text,text,integer)'::regprocedure)
    like '%default_map.default_spawn_id%',
  'administrator reset resolves an approved default publication and spawn'
);
select is(
  (select count(*)::integer from information_schema.tables where table_schema = 'public' and table_name in (
    'inventories', 'crops', 'recipes', 'chat', 'friends', 'guilds', 'rewards', 'claims', 'stardust'
  )),
  0,
  'Phase 6 introduces no Phase 7 through 9 storage'
);

select * from finish();
rollback;
