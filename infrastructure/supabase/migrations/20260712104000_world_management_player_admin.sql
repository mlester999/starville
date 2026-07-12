-- Starville Phase 6: align existing player administration with versioned multi-map state.
-- This forward-only migration preserves the Phase 5 signatures and permission grants.

create or replace function public.list_admin_players(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_environment_key text,
  p_network text,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_status text,
  p_rename_filter text,
  p_map_id text,
  p_recent_days integer,
  p_sort text,
  p_direction text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text;
  result jsonb;
  authorization_result jsonb;
  can_read_wallet boolean;
begin
  normalized_search := lower(btrim(coalesce(p_search, '')));
  if p_page is null
     or p_page_size is null
     or p_search is null
     or p_environment_key is null
     or char_length(p_environment_key) not between 1 and 32
     or p_network is null
     or p_network not in ('solana:devnet', 'solana:mainnet-beta')
     or p_status is null
     or p_rename_filter is null
     or p_map_id is null
     or p_sort is null
     or p_direction is null
     or p_page not between 1 and 10000
     or p_page_size not between 1 and 100
     or char_length(normalized_search) > 128
     or p_status not in ('all', 'active', 'suspended')
     or p_rename_filter not in ('all', 'required', 'clear')
     or p_map_id !~ '^(all|[a-z0-9]+(?:-[a-z0-9]+)*)$'
     or (
       p_map_id <> 'all'
       and not exists (select 1 from public.world_maps as map where map.slug = p_map_id)
     )
     or (p_recent_days is not null and p_recent_days not between 1 and 365)
     or p_sort not in ('last_entered_at', 'display_name', 'created_at', 'moderation_status')
     or p_direction not in ('asc', 'desc') then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_DIRECTORY_QUERY';
  end if;

  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'players.read'
  );
  authorization_result := private.evaluate_admin_authorization(
    p_user_id, p_auth_session_id, p_assurance_level
  );
  can_read_wallet :=
    (authorization_result -> 'context' -> 'permissionKeys') ? 'wallets.read';

  with active_sessions as (
    select session.wallet_address, count(*)::integer as active_count
    from public.wallet_access_sessions as session
    join public.token_gate_configs as config on config.id = session.token_gate_config_id
    where session.status = 'active'
      and session.expires_at > now()
      and config.enabled
      and config.validation_state = 'validated'
      and config.environment_key = p_environment_key
      and config.network = p_network
      and session.config_version_snapshot = config.config_version
    group by session.wallet_address
  ), filtered as (
    select
      profile.*,
      moderation.status as moderation_status,
      moderation.rename_required,
      moderation.version as moderation_version,
      coalesce(active_sessions.active_count, 0) as active_access_sessions
    from public.player_profiles as profile
    join public.player_moderation_states as moderation
      on moderation.player_profile_id = profile.id
    left join active_sessions on active_sessions.wallet_address = profile.wallet_address
    where (
      normalized_search = ''
      or starts_with(lower(profile.display_name), normalized_search)
      or (can_read_wallet and profile.wallet_address = p_search)
    )
      and (p_status = 'all' or moderation.status = p_status)
      and (
        p_rename_filter = 'all'
        or (p_rename_filter = 'required' and moderation.rename_required)
        or (p_rename_filter = 'clear' and not moderation.rename_required)
      )
      and (p_map_id = 'all' or profile.current_map_id = p_map_id)
      and (
        p_recent_days is null
        or profile.last_entered_at >= now() - make_interval(days => p_recent_days)
      )
  ), ordered as (
    select filtered.*, count(*) over ()::integer as total_count
    from filtered
    order by
      case when p_sort = 'last_entered_at' and p_direction = 'asc' then last_entered_at end asc,
      case when p_sort = 'last_entered_at' and p_direction = 'desc' then last_entered_at end desc,
      case when p_sort = 'display_name' and p_direction = 'asc' then lower(display_name) end asc,
      case when p_sort = 'display_name' and p_direction = 'desc' then lower(display_name) end desc,
      case when p_sort = 'created_at' and p_direction = 'asc' then created_at end asc,
      case when p_sort = 'created_at' and p_direction = 'desc' then created_at end desc,
      case when p_sort = 'moderation_status' and p_direction = 'asc' then moderation_status end asc,
      case when p_sort = 'moderation_status' and p_direction = 'desc' then moderation_status end desc,
      id asc
    limit p_page_size
    offset (p_page - 1) * p_page_size
  ), summary as (
    select
      coalesce(max(total_count), (select count(*)::integer from filtered), 0) as total_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'displayName', display_name,
            'walletAddress', case when can_read_wallet then wallet_address else null end,
            'appearancePreset', appearance_preset,
            'mapId', current_map_id,
            'moderationStatus', moderation_status,
            'renameRequired', rename_required,
            'moderationVersion', moderation_version,
            'activeAccessSessions', active_access_sessions,
            'lastEnteredAt', last_entered_at,
            'createdAt', created_at,
            'updatedAt', updated_at
          ) order by
            case when p_sort = 'last_entered_at' and p_direction = 'asc' then last_entered_at end asc,
            case when p_sort = 'last_entered_at' and p_direction = 'desc' then last_entered_at end desc,
            case when p_sort = 'display_name' and p_direction = 'asc' then lower(display_name) end asc,
            case when p_sort = 'display_name' and p_direction = 'desc' then lower(display_name) end desc,
            case when p_sort = 'created_at' and p_direction = 'asc' then created_at end asc,
            case when p_sort = 'created_at' and p_direction = 'desc' then created_at end desc,
            case when p_sort = 'moderation_status' and p_direction = 'asc' then moderation_status end asc,
            case when p_sort = 'moderation_status' and p_direction = 'desc' then moderation_status end desc,
            id asc
        ),
        '[]'::jsonb
      ) as items
    from ordered
  )
  select jsonb_build_object(
    'items', summary.items,
    'page', p_page,
    'pageSize', p_page_size,
    'total', summary.total_count,
    'totalPages', case
      when summary.total_count = 0 then 0
      else ceil(summary.total_count::numeric / p_page_size)::integer
    end
  ) into result
  from summary;

  return result;
end;
$$;

create or replace function public.admin_reset_player_position(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_player_profile_id uuid,
  p_expected_version integer,
  p_reason text,
  p_request_id text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  trusted_admin_session_id uuid;
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  selected_world record;
  default_map public.world_maps%rowtype;
  default_version public.world_map_versions%rowtype;
  default_spawn jsonb;
  previous jsonb;
  revoked_count integer;
begin
  if p_player_profile_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or not private.valid_player_operation_reason(p_reason)
     or p_request_id is null
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit is null
     or p_rate_limit not between 1 and 60 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_POSITION_RESET';
  end if;

  trusted_admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'players.reset_position'
  );

  if not private.claim_admin_player_operation_rate_limit(
    p_user_id, 'reset_position', p_rate_limit
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.id = p_player_profile_id
  for update of p, m;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;

  if private.replayed_player_action(
    p_user_id, p_player_profile_id, p_request_id, 'player.position_reset'
  ) then
    return private.player_action_result(profile, moderation, 0, true);
  end if;

  if moderation.version <> p_expected_version then
    perform private.record_player_admin_operation(
      profile, 'player.position_reset', p_user_id, trusted_admin_session_id, p_request_id,
      'denied', 'PLAYER_VERSION_CONFLICT', p_reason,
      jsonb_build_object('version', moderation.version),
      jsonb_build_object('version', moderation.version),
      jsonb_build_object('expectedVersion', p_expected_version)
    );
    return jsonb_build_object('status', 'version_conflict');
  end if;

  select map as map_row, version as version_row
  into selected_world
  from public.world_maps as map
  join public.world_map_versions as version on version.id = map.active_published_version_id
  where map.slug = 'lantern-square'
    and map.status = 'active'
    and version.lifecycle_status = 'published'
  for share of map, version;

  if not found then
    return jsonb_build_object('status', 'state_conflict', 'code', 'WORLD_DEFAULT_UNAVAILABLE');
  end if;

  default_map := selected_world.map_row;
  default_version := selected_world.version_row;

  select value into default_spawn
  from jsonb_array_elements(default_version.manifest -> 'spawns')
  where value ->> 'id' = default_map.default_spawn_id
    and value ->> 'purpose' = 'default'
    and coalesce((value ->> 'enabled')::boolean, false)
  limit 1;

  if default_spawn is null
     or not private.point_inside_world_bounds(
       default_version.manifest -> 'safeSaveBounds',
       (default_spawn ->> 'x')::numeric,
       (default_spawn ->> 'y')::numeric
     )
     or private.point_blocked_by_world_manifest(
       default_version.manifest,
       (default_spawn ->> 'x')::numeric,
       (default_spawn ->> 'y')::numeric,
       0.24
     ) then
    return jsonb_build_object('status', 'state_conflict', 'code', 'WORLD_DEFAULT_UNAVAILABLE');
  end if;

  previous := jsonb_build_object(
    'mapId', profile.current_map_id,
    'mapVersionId', profile.current_map_version_id,
    'x', profile.safe_position_x,
    'y', profile.safe_position_y,
    'facingDirection', profile.facing_direction,
    'gameStateVersion', profile.game_state_version
  );

  update public.player_profiles
  set current_map_id = default_map.slug,
      current_map_version_id = default_version.id,
      safe_position_x = round((default_spawn ->> 'x')::numeric, 4),
      safe_position_y = round((default_spawn ->> 'y')::numeric, 4),
      facing_direction = default_spawn ->> 'facingDirection',
      game_state_version = game_state_version + 1,
      last_transition_exit_id = null,
      last_transition_request_id = null
  where id = profile.id
  returning * into profile;

  update public.player_moderation_states
  set version = version + 1
  where player_profile_id = profile.id
  returning * into moderation;

  revoked_count := private.revoke_player_access_sessions(
    profile, p_request_id, 'PLAYER_POSITION_RESET'
  );

  perform private.record_player_admin_operation(
    profile, 'player.position_reset', p_user_id, trusted_admin_session_id, p_request_id,
    'success', null, p_reason, previous,
    jsonb_build_object(
      'mapId', profile.current_map_id,
      'mapVersionId', profile.current_map_version_id,
      'x', profile.safe_position_x,
      'y', profile.safe_position_y,
      'facingDirection', profile.facing_direction,
      'gameStateVersion', profile.game_state_version
    ),
    jsonb_build_object(
      'spawnId', default_spawn ->> 'id',
      'revokedSessionCount', revoked_count
    )
  );

  return private.player_action_result(profile, moderation, revoked_count, false);
end;
$$;

revoke all on function public.list_admin_players(
  uuid, uuid, text, text, text, integer, integer, text, text, text, text, integer, text, text
) from public, anon, authenticated;
revoke all on function public.admin_reset_player_position(
  uuid, uuid, text, uuid, integer, text, text, integer
) from public, anon, authenticated;
grant execute on function public.list_admin_players(
  uuid, uuid, text, text, text, integer, integer, text, text, text, text, integer, text, text
) to service_role;
grant execute on function public.admin_reset_player_position(
  uuid, uuid, text, uuid, integer, text, text, integer
) to service_role;
