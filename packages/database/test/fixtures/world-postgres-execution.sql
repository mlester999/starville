-- Executes the complete Phase 6 world authority against stock PostgreSQL.
-- The harness creates an isolated cluster, applies every migration in order,
-- runs this transaction, and removes the cluster even when an assertion fails.

begin;

create temporary table starville_world_test_context (
  key text primary key,
  value text not null
) on commit drop;

create or replace function pg_temp.assert_true(
  condition boolean,
  assertion_message text
)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception using
      errcode = 'P0001',
      message = 'WORLD_POSTGRES_ASSERTION_FAILED: ' || assertion_message;
  end if;
end;
$$;

create or replace function pg_temp.assert_status(
  result jsonb,
  expected_status text,
  assertion_message text
)
returns void
language plpgsql
as $$
begin
  perform pg_temp.assert_true(
    result ->> 'status' = expected_status,
    assertion_message || ' (expected ' || expected_status || ', received '
      || coalesce(result ->> 'status', 'null') || ')'
  );
end;
$$;

do $$
declare
  admin_user_id constant uuid := '10000000-0000-4000-8000-000000000001';
  auth_session_id constant uuid := '10000000-0000-4000-8000-000000000002';
  trusted_admin_session_id constant uuid := '10000000-0000-4000-8000-000000000003';
  super_admin_role_id uuid;
  permission_version integer;
  session_version integer;
begin
  perform pg_temp.assert_true(
    (select count(*) = 5 from public.world_maps),
    'the seed creates exactly five maps'
  );
  perform pg_temp.assert_true(
    (select count(*) = 5 from public.world_map_versions where lifecycle_status = 'published'),
    'the seed creates one published version per map'
  );
  perform pg_temp.assert_true(
    (select count(*) = 15 from public.world_assets where approval_status = 'approved'),
    'the seed creates exactly fifteen approved assets'
  );
  perform pg_temp.assert_true(
    (select count(*) = 5 and bool_and(record_version = 2) from public.world_maps),
    'replaying the idempotent seed does not duplicate maps or increment their record versions'
  );
  perform pg_temp.assert_true(
    (select count(*) = 5 from public.world_audit_events where event_key = 'world.version_published')
      and (select count(*) = 15 from public.world_audit_events where event_key = 'world.asset_registered'),
    'replaying the idempotent seed does not duplicate initial audit events'
  );
  perform pg_temp.assert_true(
    (
      select count(*) = (
        select sum(jsonb_array_length(version.manifest -> 'assets'))
        from public.world_map_versions as version
        where version.version_number = 1
      )
      from public.world_map_version_assets
    ),
    'replaying the idempotent seed preserves one asset mapping per manifest reference'
  );
  perform pg_temp.assert_true(
    (
      select count(*) = 4
      from public.world_maps as map
      join public.world_map_versions as version on version.id = map.active_published_version_id,
        lateral jsonb_array_elements(version.manifest -> 'exits') as exit_definition
      where map.slug = 'lantern-square'
        and (exit_definition ->> 'enabled')::boolean
    ),
    'Lantern Square exposes four enabled cardinal exits'
  );
  perform pg_temp.assert_true(
    (
      select count(*) = 4
      from public.world_maps as map
      join public.world_map_versions as version on version.id = map.active_published_version_id
      where map.slug <> 'lantern-square'
        and (
          select count(*)
          from jsonb_array_elements(version.manifest -> 'exits') as exit_definition
          where (exit_definition ->> 'enabled')::boolean
            and exit_definition ->> 'destinationMapId' = 'lantern-square'
        ) = 1
        and (
          select count(*)
          from jsonb_array_elements(version.manifest -> 'exits') as exit_definition
          where not (exit_definition ->> 'enabled')::boolean
        ) = 3
    ),
    'every outer map has one Lantern Square return and three disabled exits'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.world_map_versions as version,
        lateral jsonb_array_elements_text(version.manifest -> 'assets') as requested(asset_key)
      left join public.world_assets as asset
        on asset.asset_key = requested.asset_key and asset.approval_status = 'approved'
      where version.lifecycle_status = 'published'
        and asset.id is null
    ),
    'every published manifest references only approved assets'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.world_map_versions
      where lifecycle_status = 'published'
        and (
          pg_column_size(manifest) > 262144
          or manifest::text ~* '(<script|javascript:|data:text/html|on[a-z]+[[:space:]]*=)'
        )
    ),
    'published manifests are bounded data without executable content'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.world_maps as source_map
      join public.world_map_versions as source_version
        on source_version.id = source_map.active_published_version_id,
        lateral jsonb_array_elements(source_version.manifest -> 'exits') as exit_definition
      join public.world_maps as destination_map
        on destination_map.slug = exit_definition ->> 'destinationMapId'
      join public.world_map_versions as destination_version
        on destination_version.id = destination_map.active_published_version_id,
        lateral jsonb_array_elements(destination_version.manifest -> 'spawns') as destination_spawn,
        lateral jsonb_array_elements(destination_version.manifest -> 'exits') as destination_exit
      where (exit_definition ->> 'enabled')::boolean
        and destination_spawn ->> 'id' = exit_definition ->> 'destinationSpawnId'
        and (destination_spawn ->> 'x')::numeric >=
          (destination_exit -> 'trigger' ->> 'x')::numeric
        and (destination_spawn ->> 'x')::numeric <=
          (destination_exit -> 'trigger' ->> 'x')::numeric
            + (destination_exit -> 'trigger' ->> 'width')::numeric
        and (destination_spawn ->> 'y')::numeric >=
          (destination_exit -> 'trigger' ->> 'y')::numeric
        and (destination_spawn ->> 'y')::numeric <=
          (destination_exit -> 'trigger' ->> 'y')::numeric
            + (destination_exit -> 'trigger' ->> 'height')::numeric
    ),
    'destination spawns are outside every enabled exit trigger'
  );
  perform pg_temp.assert_true(
    (select count(*) = 46 and count(distinct key) = 46 from public.admin_permissions where is_system),
    'the current system permission catalog has forty-six unique keys'
  );
  perform pg_temp.assert_true(
    not has_function_privilege(
      'authenticated',
      'private.claim_world_rate_limit(text,text,integer,integer)',
      'EXECUTE'
    ),
    'authenticated cannot invoke the private world rate limiter'
  );
  perform pg_temp.assert_true(
    not has_function_privilege(
      'service_role',
      'private.sync_world_version_assets(uuid,jsonb)',
      'EXECUTE'
    ),
    'service_role cannot invoke private asset synchronization directly'
  );
  perform pg_temp.assert_true(
    not has_function_privilege(
      'authenticated',
      'public.get_current_published_world(text,text,integer)',
      'EXECUTE'
    )
    and has_function_privilege(
      'service_role',
      'public.get_current_published_world(text,text,integer)',
      'EXECUTE'
    ),
    'only the trusted server role can invoke the published-world loader'
  );

  insert into auth.users (id, email)
  values (admin_user_id, 'world-postgres-admin@example.invalid');
  insert into auth.sessions (id, user_id)
  values (auth_session_id, admin_user_id);

  select id into strict super_admin_role_id
  from public.admin_roles
  where key = 'super_admin';

  insert into public.admin_users (
    user_id,
    role_id,
    status,
    display_name,
    mfa_required
  ) values (
    admin_user_id,
    super_admin_role_id,
    'active',
    'World PostgreSQL Admin',
    false
  )
  returning admin_users.permission_version, admin_users.session_version
  into permission_version, session_version;

  insert into public.admin_sessions (
    id,
    user_id,
    auth_session_id,
    status,
    expires_at,
    permission_version_snapshot,
    session_version_snapshot
  ) values (
    trusted_admin_session_id,
    admin_user_id,
    auth_session_id,
    'active',
    now() + interval '1 hour',
    permission_version,
    session_version
  );

  insert into starville_world_test_context (key, value)
  values
    ('admin_user_id', admin_user_id::text),
    ('auth_session_id', auth_session_id::text);

  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.admin_permissions as permission
      where permission.is_system
        and not exists (
          select 1
          from public.admin_role_permissions as mapping
          where mapping.role_id = super_admin_role_id
            and mapping.permission_id = permission.id
        )
    ),
    'Super Admin receives every seeded system permission'
  );
  perform pg_temp.assert_true(
    (
      select coalesce(array_agg(permission.key order by permission.key), array[]::text[])
      from public.admin_role_permissions as mapping
      join public.admin_roles as role on role.id = mapping.role_id
      join public.admin_permissions as permission on permission.id = mapping.permission_id
      where role.key = 'world_designer'
        and permission.key in (
          'maps.read', 'maps.edit', 'maps.preview', 'maps.publish', 'maps.audit_read', 'assets.read'
        )
    ) = array[
      'assets.read', 'maps.audit_read', 'maps.edit', 'maps.preview', 'maps.publish', 'maps.read'
    ]::text[],
    'World Designer receives the complete reviewed world workflow'
  );
  perform pg_temp.assert_true(
    (
      select coalesce(array_agg(permission.key order by permission.key), array[]::text[])
      from public.admin_role_permissions as mapping
      join public.admin_roles as role on role.id = mapping.role_id
      join public.admin_permissions as permission on permission.id = mapping.permission_id
      where role.key = 'game_administrator'
        and permission.key in (
          'maps.read', 'maps.edit', 'maps.preview', 'maps.publish', 'maps.audit_read', 'assets.read'
        )
    ) = array[
      'assets.read', 'maps.audit_read', 'maps.edit', 'maps.preview', 'maps.read'
    ]::text[],
    'Game Administrator can edit, preview, and audit but cannot publish'
  );
  perform pg_temp.assert_true(
    (
      select coalesce(array_agg(permission.key order by permission.key), array[]::text[])
      from public.admin_role_permissions as mapping
      join public.admin_roles as role on role.id = mapping.role_id
      join public.admin_permissions as permission on permission.id = mapping.permission_id
      where role.key = 'live_operations_manager'
        and permission.key in (
          'maps.read', 'maps.edit', 'maps.preview', 'maps.publish', 'maps.audit_read', 'assets.read'
        )
    ) = array['assets.read', 'maps.audit_read', 'maps.read']::text[],
    'Live Operations retains read and audit visibility without world mutation'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.admin_role_permissions as mapping
      join public.admin_roles as role on role.id = mapping.role_id
      join public.admin_permissions as permission on permission.id = mapping.permission_id
      where role.key in ('blockchain_operator', 'read_only_analyst')
        and permission.key in ('maps.edit', 'maps.preview', 'maps.publish')
    ),
    'Blockchain Operator and Read-only Analyst receive no world mutation authority'
  );
end;
$$;

do $$
declare
  wallet constant text := '77777777777777777777777777777777';
  suspended_wallet constant text := '88888888888888888888888888888888';
  rename_wallet constant text := '99999999999999999999999999999999';
  admin_user_id uuid := (
    select value::uuid from starville_world_test_context where key = 'admin_user_id'
  );
  result jsonb;
  invalid_wallet_rejected boolean := false;
  invalid_request_rejected boolean := false;
begin
  result := public.create_player_profile(
    wallet, 'Postgres World', 'moss', 'postgres:create-main', 30
  );
  perform pg_temp.assert_status(result, 'loaded', 'the main player fixture is created');

  result := public.get_current_published_world(wallet, 'postgres:current-initial', 600);
  perform pg_temp.assert_status(result, 'loaded', 'the current published world loads');
  perform pg_temp.assert_true(
    result -> 'map' ->> 'slug' = 'lantern-square'
      and result -> 'version' ->> 'lifecycleStatus' = 'published'
      and result -> 'playerState' ->> 'mapVersionId' is not null,
    'the loader resolves only the active Lantern Square publication and reconciles the version'
  );

  update public.player_profiles
  set current_map_id = 'missing-map', current_map_version_id = null
  where wallet_address = wallet;
  result := public.get_current_published_world(wallet, 'postgres:current-reconcile', 600);
  perform pg_temp.assert_status(result, 'loaded', 'a missing current map reconciles safely');
  perform pg_temp.assert_true(
    result -> 'map' ->> 'slug' = 'lantern-square',
    'missing current-map state falls back to the reviewed default publication'
  );

  result := public.get_published_world_manifest(
    wallet, 'moonpetal-meadow', 'postgres:manifest', 600
  );
  perform pg_temp.assert_status(result, 'loaded', 'a published adjacent manifest resolves');
  perform pg_temp.assert_true(
    result -> 'map' ->> 'slug' = 'moonpetal-meadow'
      and result -> 'version' ->> 'lifecycleStatus' = 'published',
    'published-manifest resolution returns the requested active publication'
  );

  begin
    perform public.get_current_published_world(
      '00000000000000000000000000000000', 'postgres:invalid-wallet', 600
    );
  exception when sqlstate '22023' then
    invalid_wallet_rejected := true;
  end;
  perform pg_temp.assert_true(invalid_wallet_rejected, 'an invalid wallet is rejected');

  begin
    perform public.get_current_published_world(wallet, '', 600);
  exception when sqlstate '22023' then
    invalid_request_rejected := true;
  end;
  perform pg_temp.assert_true(invalid_request_rejected, 'an invalid request ID is rejected');

  result := public.create_player_profile(
    suspended_wallet, 'Suspended Test', 'river', 'postgres:create-suspended', 30
  );
  perform pg_temp.assert_status(result, 'loaded', 'the suspended fixture starts active');
  update public.player_moderation_states
  set status = 'suspended',
      suspension_reason = 'PostgreSQL execution suspension',
      suspended_at = now(),
      suspended_by_admin_id = admin_user_id,
      version = version + 1
  where player_profile_id = (
    select id from public.player_profiles where wallet_address = suspended_wallet
  );
  result := public.get_current_published_world(
    suspended_wallet, 'postgres:current-suspended', 600
  );
  perform pg_temp.assert_status(result, 'suspended', 'a suspended player cannot load a world');

  result := public.create_player_profile(
    rename_wallet, 'Rename Test', 'marigold', 'postgres:create-rename', 30
  );
  perform pg_temp.assert_status(result, 'loaded', 'the rename fixture starts active');
  update public.player_moderation_states
  set rename_required = true,
      rename_reason = 'PostgreSQL execution rename requirement',
      rename_required_at = now(),
      rename_required_by_admin_id = admin_user_id,
      version = version + 1
  where player_profile_id = (
    select id from public.player_profiles where wallet_address = rename_wallet
  );
  result := public.get_current_published_world(rename_wallet, 'postgres:current-rename', 600);
  perform pg_temp.assert_status(result, 'rename_required', 'rename-required players cannot load worlds');

  insert into starville_world_test_context (key, value)
  values ('player_wallet', wallet);
end;
$$;

savepoint unpublished_destination;
do $$
declare
  wallet text := (select value from starville_world_test_context where key = 'player_wallet');
  profile public.player_profiles%rowtype;
  source_version public.world_map_versions%rowtype;
  north_exit jsonb;
  result jsonb;
begin
  select * into strict profile from public.player_profiles where wallet_address = wallet;
  select * into strict source_version
  from public.world_map_versions where id = profile.current_map_version_id;
  select value into strict north_exit
  from jsonb_array_elements(source_version.manifest -> 'exits')
  where value ->> 'direction' = 'north' and (value ->> 'enabled')::boolean;

  perform set_config('starville.world_publication_transition', 'true', true);
  update public.world_maps
  set active_published_version_id = null
  where slug = north_exit ->> 'destinationMapId';

  result := public.transition_player_world(
    wallet,
    north_exit ->> 'id',
    profile.game_state_version,
    profile.current_map_version_id,
    'postgres:transition-unpublished',
    120
  );
  perform pg_temp.assert_status(
    result, 'destination_unavailable', 'an unpublished destination cannot be entered'
  );
end;
$$;
rollback to savepoint unpublished_destination;

savepoint missing_destination_spawn;
do $$
declare
  wallet text := (select value from starville_world_test_context where key = 'player_wallet');
  admin_user_id uuid := (
    select value::uuid from starville_world_test_context where key = 'admin_user_id'
  );
  profile public.player_profiles%rowtype;
  source_version public.world_map_versions%rowtype;
  destination_map public.world_maps%rowtype;
  destination_version public.world_map_versions%rowtype;
  north_exit jsonb;
  invalid_manifest jsonb;
  invalid_version_id uuid;
  result jsonb;
begin
  select * into strict profile from public.player_profiles where wallet_address = wallet;
  select * into strict source_version
  from public.world_map_versions where id = profile.current_map_version_id;
  select value into strict north_exit
  from jsonb_array_elements(source_version.manifest -> 'exits')
  where value ->> 'direction' = 'north' and (value ->> 'enabled')::boolean;
  select * into strict destination_map
  from public.world_maps where slug = north_exit ->> 'destinationMapId';
  select * into strict destination_version
  from public.world_map_versions where id = destination_map.active_published_version_id;

  invalid_manifest := jsonb_set(
    destination_version.manifest,
    '{spawns}',
    coalesce(
      (
        select jsonb_agg(value order by ordinal)
        from jsonb_array_elements(destination_version.manifest -> 'spawns')
          with ordinality as spawn(value, ordinal)
        where value ->> 'id' <> north_exit ->> 'destinationSpawnId'
      ),
      '[]'::jsonb
    )
  );

  perform set_config('starville.world_publication_transition', 'true', true);
  update public.world_map_versions
  set lifecycle_status = 'superseded'
  where id = destination_version.id;
  insert into public.world_map_versions (
    world_map_id,
    version_number,
    lifecycle_status,
    manifest,
    checksum,
    validation_status,
    validation_result,
    created_by_admin_id,
    validated_at,
    validated_by_admin_id,
    published_at,
    published_by_admin_id,
    publication_reason,
    supersedes_version_id
  ) values (
    destination_map.id,
    destination_version.version_number + 1,
    'published',
    invalid_manifest,
    private.world_manifest_checksum(invalid_manifest),
    'valid',
    jsonb_build_object('valid', true, 'errors', '[]'::jsonb, 'warnings', '[]'::jsonb),
    admin_user_id,
    now(),
    admin_user_id,
    now(),
    admin_user_id,
    'PostgreSQL missing spawn fixture',
    destination_version.id
  )
  returning id into invalid_version_id;
  update public.world_maps
  set active_published_version_id = invalid_version_id
  where id = destination_map.id;

  result := public.transition_player_world(
    wallet,
    north_exit ->> 'id',
    profile.game_state_version,
    profile.current_map_version_id,
    'postgres:transition-missing-spawn',
    120
  );
  perform pg_temp.assert_status(
    result, 'destination_unavailable', 'a destination with a missing spawn cannot be entered'
  );
end;
$$;
rollback to savepoint missing_destination_spawn;

do $$
declare
  wallet text := (select value from starville_world_test_context where key = 'player_wallet');
  profile public.player_profiles%rowtype;
  source_version public.world_map_versions%rowtype;
  north_exit jsonb;
  disabled_exit jsonb;
  result jsonb;
  destination_spawn jsonb;
  transitioned_state_version integer;
begin
  select * into strict profile from public.player_profiles where wallet_address = wallet;

  result := public.transition_player_world(
    wallet,
    'missing-exit',
    profile.game_state_version,
    profile.current_map_version_id,
    'postgres:transition-invalid-exit',
    120
  );
  perform pg_temp.assert_status(result, 'invalid_exit', 'an unknown exit is rejected');

  result := public.transition_player_world(
    wallet,
    'missing-exit',
    profile.game_state_version + 1,
    profile.current_map_version_id,
    'postgres:transition-stale',
    120
  );
  perform pg_temp.assert_status(result, 'version_conflict', 'a stale state version is rejected');

  select * into strict source_version
  from public.world_map_versions where id = profile.current_map_version_id;
  select value into strict north_exit
  from jsonb_array_elements(source_version.manifest -> 'exits')
  where value ->> 'direction' = 'north' and (value ->> 'enabled')::boolean;

  result := public.transition_player_world(
    wallet,
    north_exit ->> 'id',
    profile.game_state_version,
    profile.current_map_version_id,
    'postgres:transition-valid',
    120
  );
  perform pg_temp.assert_status(result, 'transitioned', 'a valid north transition succeeds');
  transitioned_state_version := (result -> 'playerState' ->> 'gameStateVersion')::integer;
  perform pg_temp.assert_true(
    result -> 'map' ->> 'slug' = 'moonpetal-meadow'
      and result -> 'transition' ->> 'destinationSpawnId' = north_exit ->> 'destinationSpawnId',
    'the server resolves the approved destination map and spawn'
  );
  destination_spawn := (
    select value
    from jsonb_array_elements(result -> 'manifest' -> 'spawns')
    where value ->> 'id' = result -> 'transition' ->> 'destinationSpawnId'
  );
  perform pg_temp.assert_true(
    destination_spawn is not null
      and not exists (
        select 1
        from jsonb_array_elements(result -> 'manifest' -> 'exits') as destination_exit
        where (destination_exit ->> 'enabled')::boolean
          and (destination_spawn ->> 'x')::numeric >=
            (destination_exit -> 'trigger' ->> 'x')::numeric
          and (destination_spawn ->> 'x')::numeric <=
            (destination_exit -> 'trigger' ->> 'x')::numeric
              + (destination_exit -> 'trigger' ->> 'width')::numeric
          and (destination_spawn ->> 'y')::numeric >=
            (destination_exit -> 'trigger' ->> 'y')::numeric
          and (destination_spawn ->> 'y')::numeric <=
            (destination_exit -> 'trigger' ->> 'y')::numeric
              + (destination_exit -> 'trigger' ->> 'height')::numeric
      ),
    'the resolved destination spawn cannot immediately retrigger an exit'
  );

  result := public.transition_player_world(
    wallet,
    north_exit ->> 'id',
    profile.game_state_version,
    profile.current_map_version_id,
    'postgres:transition-valid',
    120
  );
  perform pg_temp.assert_status(result, 'replayed', 'an identical transition request replays safely');
  perform pg_temp.assert_true(
    result -> 'map' ->> 'slug' = 'moonpetal-meadow'
      and (result -> 'playerState' ->> 'gameStateVersion')::integer = transitioned_state_version,
    'transition replay resolves the retained destination without mutating player state again'
  );

  select * into strict profile from public.player_profiles where wallet_address = wallet;
  update public.player_profiles
  set last_successful_transition_at = null
  where id = profile.id
  returning * into profile;
  select * into strict source_version
  from public.world_map_versions where id = profile.current_map_version_id;
  select value into strict disabled_exit
  from jsonb_array_elements(source_version.manifest -> 'exits')
  where not (value ->> 'enabled')::boolean
  limit 1;
  result := public.transition_player_world(
    wallet,
    disabled_exit ->> 'id',
    profile.game_state_version,
    profile.current_map_version_id,
    'postgres:transition-disabled',
    120
  );
  perform pg_temp.assert_status(result, 'invalid_exit', 'a disabled exit is rejected');
end;
$$;

do $$
declare
  admin_user_id uuid := (
    select value::uuid from starville_world_test_context where key = 'admin_user_id'
  );
  auth_session_id uuid := (
    select value::uuid from starville_world_test_context where key = 'auth_session_id'
  );
  map_record public.world_maps%rowtype;
  active_version public.world_map_versions%rowtype;
  player_id uuid;
  moderation_version integer;
  draft_id uuid;
  draft_edit_version integer;
  draft_checksum text;
  draft_manifest jsonb;
  result jsonb;
begin
  result := public.list_admin_world_maps(
    admin_user_id,
    auth_session_id,
    'aal2',
    1,
    20,
    '',
    'all',
    'display_name',
    'asc',
    'postgres:admin-directory',
    120
  );
  perform pg_temp.assert_status(result, 'loaded', 'the trusted world directory executes');
  perform pg_temp.assert_true(
    (result ->> 'total')::integer = 5 and jsonb_array_length(result -> 'items') = 5,
    'the administrator directory returns all five seeded maps'
  );

  result := public.list_admin_world_assets(
    admin_user_id,
    auth_session_id,
    'aal2',
    1,
    100,
    '',
    'postgres:admin-assets',
    120
  );
  perform pg_temp.assert_status(result, 'loaded', 'the trusted asset catalog executes');
  perform pg_temp.assert_true(
    (result ->> 'total')::integer = 15 and jsonb_array_length(result -> 'items') = 15,
    'the administrator asset catalog returns all reviewed assets'
  );

  select profile.id, moderation.version
  into strict player_id, moderation_version
  from public.player_profiles as profile
  join public.player_moderation_states as moderation
    on moderation.player_profile_id = profile.id
  where profile.wallet_address = (
    select value from starville_world_test_context where key = 'player_wallet'
  );
  result := public.admin_reset_player_position(
    admin_user_id,
    auth_session_id,
    'aal2',
    player_id,
    moderation_version,
    'PostgreSQL execution position reset',
    'postgres:admin-reset-position',
    60
  );
  perform pg_temp.assert_status(result, 'updated', 'the multi-map position reset executes');
  perform pg_temp.assert_true(
    (
      select current_map_id = 'lantern-square'
        and current_map_version_id = (
          select active_published_version_id
          from public.world_maps
          where slug = 'lantern-square'
        )
      from public.player_profiles
      where id = player_id
    ),
    'position reset resolves the reviewed Lantern Square publication instead of hardcoded state'
  );

  select * into strict map_record
  from public.world_maps where slug = 'whisperpine-gate';
  select * into strict active_version
  from public.world_map_versions where id = map_record.active_published_version_id;

  result := public.get_admin_world_map(
    admin_user_id,
    auth_session_id,
    'aal2',
    map_record.id,
    'postgres:admin-detail',
    120
  );
  perform pg_temp.assert_status(result, 'loaded', 'the trusted world detail RPC executes');

  result := public.derive_admin_world_version(
    admin_user_id,
    auth_session_id,
    'aal2',
    map_record.id,
    active_version.id,
    map_record.record_version,
    'PostgreSQL execution derivation',
    'postgres:admin-derive',
    120
  );
  perform pg_temp.assert_status(result, 'created', 'a draft derives from published history');
  draft_id := (result -> 'version' ->> 'id')::uuid;
  draft_edit_version := (result -> 'version' ->> 'editVersion')::integer;
  draft_checksum := result -> 'version' ->> 'checksum';
  draft_manifest := result -> 'manifest';

  result := public.save_admin_world_draft(
    admin_user_id,
    auth_session_id,
    'aal2',
    map_record.id,
    draft_id,
    draft_edit_version,
    draft_checksum,
    draft_manifest,
    'postgres:admin-save',
    120
  );
  perform pg_temp.assert_status(result, 'updated', 'the trusted draft save executes');
  draft_edit_version := (result -> 'version' ->> 'editVersion')::integer;
  draft_checksum := result -> 'version' ->> 'checksum';

  result := public.get_admin_world_draft(
    admin_user_id,
    auth_session_id,
    'aal2',
    map_record.id,
    draft_id,
    'postgres:admin-draft-load',
    120
  );
  perform pg_temp.assert_status(result, 'loaded', 'the saved draft loads through its trusted RPC');

  result := public.validate_admin_world_draft(
    admin_user_id,
    auth_session_id,
    'aal2',
    map_record.id,
    draft_id,
    draft_edit_version,
    draft_checksum,
    'postgres:admin-validate',
    120
  );
  perform pg_temp.assert_status(result, 'validated', 'the derived draft validates in PostgreSQL');

  result := public.preview_admin_world_version(
    admin_user_id,
    auth_session_id,
    'aal2',
    map_record.id,
    draft_id,
    'postgres:admin-preview',
    120
  );
  perform pg_temp.assert_status(result, 'loaded', 'the validated draft preview executes');
  perform pg_temp.assert_true(
    coalesce((result ->> 'draftPreview')::boolean, false),
    'the preview is explicitly identified as a draft preview'
  );

  result := public.publish_admin_world_version(
    admin_user_id,
    auth_session_id,
    'aal2',
    map_record.id,
    draft_id,
    draft_edit_version,
    active_version.id,
    draft_checksum,
    'PostgreSQL execution publication',
    'postgres:admin-publish',
    120
  );
  perform pg_temp.assert_status(result, 'published', 'the validated version publishes atomically');
  perform pg_temp.assert_true(
    (select active_published_version_id = draft_id from public.world_maps where id = map_record.id)
      and (select lifecycle_status = 'superseded' from public.world_map_versions where id = active_version.id)
      and (select lifecycle_status = 'published' from public.world_map_versions where id = draft_id),
    'publication swaps the active version while retaining immutable history'
  );

  result := public.list_admin_world_audit(
    admin_user_id,
    auth_session_id,
    'aal2',
    map_record.id,
    1,
    100,
    '',
    'postgres:admin-audit',
    120
  );
  perform pg_temp.assert_status(result, 'loaded', 'the trusted world audit RPC executes');
  perform pg_temp.assert_true(
    (result ->> 'total')::integer >= 6
      and result -> 'items' @> '[{"eventKey":"world.version_published"}]'::jsonb,
    'the lifecycle appends a bounded publication audit trail'
  );
end;
$$;

select 'world-postgres execution assertions passed' as result;

rollback;
