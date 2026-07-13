-- Phase 5/6 consolidation: narrowly authorized direct rename and server-paginated
-- safe wallet-access history. This migration is additive and forward-only.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values (
  'players.rename',
  'Rename player',
  'Directly replace a player display name through an audited operation.',
  'players',
  true,
  true
)
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    is_sensitive = excluded.is_sensitive,
    is_system = true;

with mapping(role_key, permission_key) as (
  values ('super_admin', 'players.rename'), ('game_administrator', 'players.rename')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles as role on role.key = mapping.role_key
join public.admin_permissions as permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

alter table public.admin_player_operation_rate_limits
  drop constraint admin_player_operation_rate_limits_scope_check;
alter table public.admin_player_operation_rate_limits
  add constraint admin_player_operation_rate_limits_scope_check check (
    scope in ('suspend', 'restore', 'reset_position', 'require_rename', 'rename', 'revoke_sessions')
  );

create or replace function private.claim_admin_player_operation_rate_limit(
  p_admin_user_id uuid, p_scope text, p_limit integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare claimed boolean;
begin
  if p_admin_user_id is null or p_scope is null
     or p_scope not in ('suspend', 'restore', 'reset_position', 'require_rename', 'rename', 'revoke_sessions')
     or p_limit is null or p_limit not between 1 and 60 then
    raise exception using errcode = '22023', message = 'INVALID_ADMIN_PLAYER_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-player-rate:' || p_admin_user_id::text || ':' || p_scope, 0)
  );
  insert into public.admin_player_operation_rate_limits (
    admin_user_id, scope, attempt_count, window_started_at, window_expires_at, updated_at
  ) values (p_admin_user_id, p_scope, 1, now(), now() + interval '1 minute', now())
  on conflict (admin_user_id, scope) do update
  set attempt_count = case when admin_player_operation_rate_limits.window_expires_at <= now()
        then 1 else admin_player_operation_rate_limits.attempt_count + 1 end,
      window_started_at = case when admin_player_operation_rate_limits.window_expires_at <= now()
        then now() else admin_player_operation_rate_limits.window_started_at end,
      window_expires_at = case when admin_player_operation_rate_limits.window_expires_at <= now()
        then now() + interval '1 minute' else admin_player_operation_rate_limits.window_expires_at end,
      updated_at = now()
  where admin_player_operation_rate_limits.window_expires_at <= now()
     or admin_player_operation_rate_limits.attempt_count < p_limit
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function private.claim_admin_player_operation_rate_limit(uuid, text, integer)
  from public, anon, authenticated, service_role;

create unique index player_profiles_display_name_canonical_unique_idx
  on public.player_profiles (lower(display_name));

create or replace function public.get_admin_player_activity_page(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_environment_key text,
  p_network text,
  p_player_profile_id uuid,
  p_audit_limit integer,
  p_access_page integer,
  p_access_page_size integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  player_wallet_address text;
  access_total integer;
  normalized_page integer;
  total_pages integer;
begin
  if p_player_profile_id is null
     or p_environment_key is null
     or char_length(p_environment_key) not between 1 and 32
     or p_network not in ('solana:devnet', 'solana:mainnet-beta')
     or p_audit_limit not between 1 and 100
     or p_access_page is null or p_access_page < 1
     or p_access_page_size not in (10, 50, 100) then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_ACTIVITY_QUERY';
  end if;

  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'players.read'
  );
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'player_audit.read'
  );

  select profile.wallet_address into player_wallet_address
  from public.player_profiles as profile
  where profile.id = p_player_profile_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  select count(*)::integer into access_total
  from public.wallet_access_events as event
  join public.token_gate_configs as config on config.id = event.token_gate_config_id
  where event.wallet_address = player_wallet_address
    and config.environment_key = p_environment_key
    and config.network = p_network;

  total_pages := case when access_total = 0 then 0
    else ceil(access_total::numeric / p_access_page_size)::integer end;
  normalized_page := case when total_pages = 0 then 1 else least(p_access_page, total_pages) end;

  with visible as (
    select audit.* from public.player_operation_audit_logs as audit
    where audit.player_profile_id = p_player_profile_id
    order by audit.created_at desc, audit.id desc
    limit p_audit_limit
  )
  select jsonb_build_object(
    'status', 'loaded',
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'event', event_key, 'actorType', actor_type,
      'actorAdminUserId', actor_admin_user_id, 'requestId', request_id,
      'outcome', outcome, 'reasonCode', reason_code, 'reason', reason,
      'beforeState', before_state, 'afterState', after_state,
      'metadata', metadata, 'createdAt', created_at
    ) order by created_at desc, id desc), '[]'::jsonb),
    'nextCursor', null
  ) into result from visible;

  return result || jsonb_build_object(
    'accessEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id, 'event', page.event, 'result', page.result,
        'reasonCode', page.reason_code, 'createdAt', page.created_at
      ) order by page.created_at desc, page.id desc)
      from (
        select event.id, event.event, event.result, event.reason_code, event.created_at
        from public.wallet_access_events as event
        join public.token_gate_configs as config on config.id = event.token_gate_config_id
        where event.wallet_address = player_wallet_address
          and config.environment_key = p_environment_key
          and config.network = p_network
        order by event.created_at desc, event.id desc
        limit p_access_page_size
        offset ((normalized_page - 1) * p_access_page_size)
      ) as page
    ), '[]'::jsonb),
    'accessPage', normalized_page,
    'accessPageSize', p_access_page_size,
    'accessTotal', access_total,
    'accessTotalPages', total_pages
  );
end;
$$;

create or replace function public.admin_rename_player(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_player_profile_id uuid,
  p_expected_version integer,
  p_display_name text,
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
  previous_name text;
  normalized_name text;
begin
  normalized_name := regexp_replace(btrim(p_display_name), '[[:space:]]+', ' ', 'g');
  if p_player_profile_id is null or p_expected_version is null or p_expected_version < 1
     or not private.valid_player_operation_reason(p_reason)
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 60
     or normalized_name is null or char_length(normalized_name) not between 3 and 20
     or normalized_name !~ '^[[:alnum:] _-]+$'
     or lower(normalized_name) in ('admin', 'administrator', 'moderator', 'starville', 'support', 'system') then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_RENAME';
  end if;

  trusted_admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'players.rename'
  );
  if not private.claim_admin_player_operation_rate_limit(p_user_id, 'rename', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.id = p_player_profile_id for update of p, m;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;

  if private.replayed_player_action(p_user_id, p_player_profile_id, p_request_id, 'player.rename_completed') then
    return private.player_action_result(profile, moderation, 0, true);
  end if;
  if moderation.version <> p_expected_version then return jsonb_build_object('status', 'version_conflict'); end if;
  if lower(profile.display_name) = lower(normalized_name) then
    return jsonb_build_object('status', 'state_conflict', 'code', 'PLAYER_NAME_UNCHANGED');
  end if;
  if exists (select 1 from public.player_profiles p where lower(p.display_name) = lower(normalized_name)) then
    return jsonb_build_object('status', 'state_conflict', 'code', 'PLAYER_NAME_UNAVAILABLE');
  end if;

  previous_name := profile.display_name;
  begin
    update public.player_profiles set display_name = normalized_name
    where id = profile.id returning * into profile;
  exception when unique_violation then
    return jsonb_build_object('status', 'state_conflict', 'code', 'PLAYER_NAME_UNAVAILABLE');
  end;

  update public.player_moderation_states
  set rename_required = false, rename_reason = null, rename_required_at = null,
      rename_required_by_admin_id = null, version = version + 1
  where player_profile_id = profile.id returning * into moderation;

  perform private.record_player_admin_operation(
    profile, 'player.rename_completed', p_user_id, trusted_admin_session_id, p_request_id,
    'success', null, p_reason,
    jsonb_build_object('displayName', previous_name, 'renameRequired', (selected_rows.moderation_row).rename_required),
    jsonb_build_object('displayName', profile.display_name, 'renameRequired', false),
    '{}'::jsonb
  );
  return private.player_action_result(profile, moderation, 0, false);
end;
$$;

revoke all on function public.get_admin_player_activity_page(
  uuid, uuid, text, text, text, uuid, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.admin_rename_player(
  uuid, uuid, text, uuid, integer, text, text, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_player_activity_page(
  uuid, uuid, text, text, text, uuid, integer, integer, integer
) to service_role;
grant execute on function public.admin_rename_player(
  uuid, uuid, text, uuid, integer, text, text, text, integer
) to service_role;

create or replace function public.get_admin_published_world_topology(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.read'
  );
  return jsonb_build_object(
    'status', 'loaded',
    'maps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', map.id,
        'slug', map.slug,
        'displayName', map.display_name,
        'mapStatus', map.status,
        'versionId', version.id,
        'versionNumber', version.version_number,
        'manifest', version.manifest
      ) order by map.slug)
      from public.world_maps as map
      join public.world_map_versions as version on version.id = map.active_published_version_id
      where map.status = 'active' and version.lifecycle_status = 'published'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_published_world_topology(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_published_world_topology(uuid, uuid, text)
  to service_role;
