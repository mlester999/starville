-- Starville Phase 8A: durable channel definitions and bounded realtime lifecycle state.
-- Movement remains an in-memory realtime-server concern; PostgreSQL is not a frame bus.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('realtime.read', 'Read realtime operations', 'Read bounded channel population, session health, and safe disconnect summaries.', 'operations', false, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

with mapping(role_key) as (
  values ('game_administrator'), ('live_operations_manager'), ('read_only_analyst')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles role on role.key = mapping.role_key
join public.admin_permissions permission on permission.key = 'realtime.read'
on conflict (role_id, permission_id) do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.admin_roles role
cross join public.admin_permissions permission
where role.key = 'super_admin' and permission.key = 'realtime.read'
on conflict (role_id, permission_id) do nothing;

alter table public.player_profiles
  add column public_presence_id uuid not null default gen_random_uuid(),
  add column public_level integer not null default 1 check (public_level between 1 and 999),
  add constraint player_profiles_public_presence_id_key unique (public_presence_id);

comment on column public.player_profiles.public_presence_id is
  'Opaque public identity for same-channel presence. It is not an authorization or wallet identifier.';
comment on column public.player_profiles.public_level is
  'Safe public progression label. Phase 8A does not implement level progression.';

create table public.realtime_channels (
  id uuid primary key default gen_random_uuid(),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  channel_number integer not null check (channel_number between 1 and 99),
  capacity integer not null default 40 check (capacity between 1 and 200),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (world_map_id, channel_number),
  unique (world_map_id, id)
);

insert into public.realtime_channels (world_map_id, channel_number, capacity)
select map.id, channel_number, 40
from public.world_maps map
cross join generate_series(1, 3) channel_number
where map.status = 'active'
on conflict (world_map_id, channel_number) do nothing;

create table public.realtime_connection_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_hash text not null unique check (ticket_hash ~ '^[0-9a-f]{64}$'),
  wallet_access_session_id uuid not null references public.wallet_access_sessions(id) on delete cascade,
  player_profile_id uuid not null references public.player_profiles(id) on delete cascade,
  requested_channel_id uuid references public.realtime_channels(id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint realtime_ticket_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '1 minute'
  )
);

create table public.realtime_sessions (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete cascade,
  wallet_access_session_id uuid not null references public.wallet_access_sessions(id) on delete cascade,
  world_map_id uuid not null,
  world_map_version_id uuid not null,
  channel_id uuid not null,
  connection_id text not null unique check (char_length(connection_id) between 1 and 128),
  status text not null default 'active' check (status in ('active', 'stale', 'closed')),
  close_reason text check (
    close_reason is null or close_reason in (
      'clean_disconnect', 'connection_lost', 'replaced', 'channel_switch', 'world_transition',
      'access_revoked', 'player_suspended', 'rename_required', 'maintenance', 'server_shutdown',
      'authorization_failed', 'idle_timeout'
    )
  ),
  last_position_x numeric(8, 4) not null check (last_position_x between 0 and 128),
  last_position_y numeric(8, 4) not null check (last_position_y between 0 and 128),
  last_facing_direction text not null check (
    last_facing_direction in (
      'north', 'northeast', 'east', 'southeast',
      'south', 'southwest', 'west', 'northwest'
    )
  ),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  connected_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  checkpointed_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint realtime_session_world_version_fk
    foreign key (world_map_id, world_map_version_id)
    references public.world_map_versions(world_map_id, id) on delete restrict,
  constraint realtime_session_channel_fk
    foreign key (world_map_id, channel_id)
    references public.realtime_channels(world_map_id, id) on delete restrict,
  constraint realtime_session_close_state_check check (
    (status in ('active', 'stale') and close_reason is null and closed_at is null)
    or (status = 'closed' and close_reason is not null and closed_at is not null)
  )
);

create table public.realtime_connection_audit (
  id uuid primary key default gen_random_uuid(),
  public_presence_id uuid not null,
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  channel_id uuid not null references public.realtime_channels(id) on delete restrict,
  event text not null check (event in ('admitted', 'channel_switched', 'disconnected', 'rejected')),
  reason text not null check (char_length(reason) between 1 and 64 and reason ~ '^[a-z0-9_]+$'),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now()
);

create index realtime_tickets_expiry_idx on public.realtime_connection_tickets(expires_at);
create index realtime_sessions_active_channel_idx
  on public.realtime_sessions(world_map_id, channel_id, last_heartbeat_at desc)
  where status in ('active', 'stale');
create index realtime_sessions_profile_idx
  on public.realtime_sessions(player_profile_id, connected_at desc);
create index realtime_audit_recent_idx on public.realtime_connection_audit(created_at desc);

create trigger realtime_channels_set_updated_at
before update on public.realtime_channels
for each row execute function private.set_updated_at();

alter table public.realtime_channels enable row level security;
alter table public.realtime_channels force row level security;
alter table public.realtime_connection_tickets enable row level security;
alter table public.realtime_connection_tickets force row level security;
alter table public.realtime_sessions enable row level security;
alter table public.realtime_sessions force row level security;
alter table public.realtime_connection_audit enable row level security;
alter table public.realtime_connection_audit force row level security;

revoke all on table public.realtime_channels from public, anon, authenticated, service_role;
revoke all on table public.realtime_connection_tickets from public, anon, authenticated, service_role;
revoke all on table public.realtime_sessions from public, anon, authenticated, service_role;
revoke all on table public.realtime_connection_audit from public, anon, authenticated, service_role;

create or replace function private.realtime_access_denial(
  p_access_session public.wallet_access_sessions,
  p_profile public.player_profiles
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare moderation public.player_moderation_states%rowtype;
declare maintenance public.live_operations_maintenance%rowtype;
begin
  if p_access_session.status <> 'active' or p_access_session.expires_at <= now() then
    return 'access_revoked';
  end if;
  select * into moderation from public.player_moderation_states
  where player_profile_id = p_profile.id;
  if moderation.status = 'suspended' then return 'player_suspended'; end if;
  if moderation.rename_required then return 'rename_required'; end if;
  select * into maintenance from public.live_operations_maintenance where singleton_key;
  if private.live_operations_maintenance_state(maintenance) in ('active', 'expired') then
    return 'maintenance';
  end if;
  if p_profile.current_map_version_id is null or not exists (
    select 1
    from public.world_maps map
    join public.world_map_versions version on version.id = p_profile.current_map_version_id
      and version.world_map_id = map.id
    where map.slug = p_profile.current_map_id
      and map.status = 'active'
      and map.active_published_version_id = version.id
      and version.lifecycle_status = 'published'
  ) then return 'world_unavailable'; end if;
  return null;
end;
$$;

create or replace function public.issue_player_realtime_ticket(
  p_access_session_token_hash text,
  p_ticket_hash text,
  p_requested_channel_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare access_session public.wallet_access_sessions%rowtype;
declare profile public.player_profiles%rowtype;
declare denial text;
declare expiration timestamptz := now() + interval '30 seconds';
begin
  if p_access_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_ticket_hash !~ '^[0-9a-f]{64}$'
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_REALTIME_TICKET_REQUEST';
  end if;
  select * into access_session from public.wallet_access_sessions
  where session_token_hash = p_access_session_token_hash;
  if not found then return jsonb_build_object('status', 'access_revoked'); end if;
  select * into profile from public.player_profiles
  where wallet_address = access_session.wallet_address;
  if not found then return jsonb_build_object('status', 'profile_required'); end if;
  denial := private.realtime_access_denial(access_session, profile);
  if denial is not null then return jsonb_build_object('status', denial); end if;
  if p_requested_channel_id is not null and not exists (
    select 1 from public.realtime_channels channel
    join public.world_maps map on map.id = channel.world_map_id
    where channel.id = p_requested_channel_id
      and channel.enabled and map.slug = profile.current_map_id
  ) then return jsonb_build_object('status', 'channel_unavailable'); end if;

  delete from public.realtime_connection_tickets
  where player_profile_id = profile.id and consumed_at is null;
  insert into public.realtime_connection_tickets (
    ticket_hash, wallet_access_session_id, player_profile_id,
    requested_channel_id, request_id, expires_at
  ) values (
    p_ticket_hash, access_session.id, profile.id,
    p_requested_channel_id, p_request_id, expiration
  );
  return jsonb_build_object('status', 'issued', 'expiresAt', expiration);
end;
$$;

create or replace function public.admit_player_realtime_ticket(
  p_ticket_hash text,
  p_connection_id text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare ticket public.realtime_connection_tickets%rowtype;
declare access_session public.wallet_access_sessions%rowtype;
declare profile public.player_profiles%rowtype;
declare map public.world_maps%rowtype;
declare version public.world_map_versions%rowtype;
declare selected_channel public.realtime_channels%rowtype;
declare created_session public.realtime_sessions%rowtype;
declare denial text;
declare candidate_channel_id uuid;
declare channel_population integer;
begin
  if p_ticket_hash !~ '^[0-9a-f]{64}$'
     or char_length(p_connection_id) not between 1 and 128
     or char_length(p_request_id) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_ticket');
  end if;
  select * into ticket from public.realtime_connection_tickets
  where ticket_hash = p_ticket_hash for update;
  if not found or ticket.consumed_at is not null or ticket.expires_at <= now() then
    return jsonb_build_object('status', 'invalid_ticket');
  end if;
  select * into strict access_session from public.wallet_access_sessions
  where id = ticket.wallet_access_session_id;
  select * into strict profile from public.player_profiles where id = ticket.player_profile_id;
  denial := private.realtime_access_denial(access_session, profile);
  if denial is not null then return jsonb_build_object('status', denial); end if;
  select * into strict map from public.world_maps where slug = profile.current_map_id;
  select * into strict version from public.world_map_versions
  where id = profile.current_map_version_id and world_map_id = map.id;

  if ticket.requested_channel_id is not null then
    select * into selected_channel from public.realtime_channels channel
    where channel.id = ticket.requested_channel_id and channel.world_map_id = map.id
      and channel.enabled
    for update;
    if not found then return jsonb_build_object('status', 'channel_unavailable'); end if;
    select count(*)::integer into channel_population
    from public.realtime_sessions session
    where session.channel_id = selected_channel.id and session.status = 'active'
      and session.last_heartbeat_at > now() - interval '30 seconds';
    if channel_population >= selected_channel.capacity then
      return jsonb_build_object('status', 'channel_full');
    end if;
  else
    if not exists (
      select 1 from public.realtime_channels channel
      where channel.world_map_id = map.id and channel.enabled
    ) then return jsonb_build_object('status', 'channel_unavailable'); end if;
    selected_channel := null;
    for candidate_channel_id in
      select channel.id
      from public.realtime_channels channel
      where channel.world_map_id = map.id and channel.enabled
      order by (select count(*) from public.realtime_sessions session
                where session.channel_id = channel.id and session.status = 'active'
                  and session.last_heartbeat_at > now() - interval '30 seconds'),
               channel.channel_number
    loop
      select * into selected_channel from public.realtime_channels channel
      where channel.id = candidate_channel_id and channel.enabled
      for update;
      select count(*)::integer into channel_population
      from public.realtime_sessions session
      where session.channel_id = selected_channel.id and session.status = 'active'
        and session.last_heartbeat_at > now() - interval '30 seconds';
      exit when channel_population < selected_channel.capacity;
      selected_channel := null;
    end loop;
    if selected_channel.id is null then return jsonb_build_object('status', 'channel_full'); end if;
  end if;

  insert into public.realtime_connection_audit (
    public_presence_id, world_map_id, channel_id, event, reason, duration_seconds, request_id
  )
  select
    profile.public_presence_id, replaced.world_map_id, replaced.channel_id,
    'disconnected', 'replaced',
    least(86400, greatest(0, extract(epoch from now() - replaced.connected_at)::integer)),
    p_request_id
  from public.realtime_sessions replaced
  where replaced.player_profile_id = profile.id and replaced.status in ('active', 'stale');
  update public.realtime_sessions
  set status = 'closed', close_reason = 'replaced', closed_at = now()
  where player_profile_id = profile.id and status in ('active', 'stale');

  insert into public.realtime_sessions (
    player_profile_id, wallet_access_session_id, world_map_id, world_map_version_id,
    channel_id, connection_id, last_position_x, last_position_y, last_facing_direction
  ) values (
    profile.id, access_session.id, map.id, version.id, selected_channel.id,
    p_connection_id, profile.safe_position_x, profile.safe_position_y, profile.facing_direction
  ) returning * into created_session;
  update public.realtime_connection_tickets set consumed_at = now() where id = ticket.id;
  insert into public.realtime_connection_audit (
    public_presence_id, world_map_id, channel_id, event, reason, request_id
  ) values (profile.public_presence_id, map.id, selected_channel.id, 'admitted', 'authorized', p_request_id);

  return jsonb_build_object(
    'status', 'admitted',
    'sessionId', created_session.id,
    'presenceId', profile.public_presence_id,
    'displayName', profile.display_name,
    'level', profile.public_level,
    'appearancePreset', profile.appearance_preset,
    'worldId', map.slug,
    'worldVersionId', version.id,
    'manifest', version.manifest,
    'channelId', selected_channel.id,
    'channelNumber', selected_channel.channel_number,
    'x', profile.safe_position_x,
    'y', profile.safe_position_y,
    'facingDirection', profile.facing_direction,
    'channels', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', channel.id, 'worldId', map.slug, 'number', channel.channel_number,
      'capacity', channel.capacity, 'population', (
        select count(*) from public.realtime_sessions member
        where member.channel_id = channel.id and member.status = 'active'
          and member.last_heartbeat_at > now() - interval '30 seconds'
      ), 'available', (
        select count(*) from public.realtime_sessions member
        where member.channel_id = channel.id and member.status = 'active'
          and member.last_heartbeat_at > now() - interval '30 seconds'
      ) < channel.capacity
    ) order by channel.channel_number), '[]'::jsonb)
    from public.realtime_channels channel where channel.world_map_id = map.id and channel.enabled)
  );
exception when no_data_found then
  return jsonb_build_object('status', 'invalid_ticket');
end;
$$;

create or replace function public.checkpoint_realtime_session(
  p_session_id uuid,
  p_position_x numeric,
  p_position_y numeric,
  p_facing_direction text,
  p_sequence bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare updated_id uuid;
begin
  if p_position_x not between 0 and 128 or p_position_y not between 0 and 128
     or p_facing_direction not in (
       'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'
     ) or p_sequence < 0 then
    return jsonb_build_object('status', 'invalid_position');
  end if;
  update public.realtime_sessions set
    last_position_x = p_position_x,
    last_position_y = p_position_y,
    last_facing_direction = p_facing_direction,
    last_sequence = greatest(last_sequence, p_sequence),
    last_heartbeat_at = now(),
    checkpointed_at = now(),
    status = 'active'
  where id = p_session_id and status in ('active', 'stale') and p_sequence >= last_sequence
  returning id into updated_id;
  return jsonb_build_object('status', case when updated_id is null then 'closed' else 'checkpointed' end);
end;
$$;

create or replace function public.switch_realtime_channel(
  p_session_id uuid,
  p_channel_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare session public.realtime_sessions%rowtype;
declare channel public.realtime_channels%rowtype;
declare profile public.player_profiles%rowtype;
declare map public.world_maps%rowtype;
begin
  if char_length(p_request_id) not between 1 and 128 then
    return jsonb_build_object('status', 'channel_unavailable');
  end if;
  select * into session from public.realtime_sessions
  where id = p_session_id and status = 'active' for update;
  if not found then return jsonb_build_object('status', 'closed'); end if;
  select * into channel from public.realtime_channels destination
  where destination.id = p_channel_id
    and destination.world_map_id = session.world_map_id
    and destination.enabled
  for update;
  if not found then return jsonb_build_object('status', 'channel_unavailable'); end if;
  if channel.id = session.channel_id then return jsonb_build_object('status', 'unchanged'); end if;
  if (select count(*) from public.realtime_sessions member
      where member.channel_id = channel.id and member.status = 'active'
        and member.last_heartbeat_at > now() - interval '30 seconds'
        and member.id <> session.id) >= channel.capacity then
    return jsonb_build_object('status', 'channel_full');
  end if;
  update public.realtime_sessions
  set channel_id = channel.id, last_heartbeat_at = now(), checkpointed_at = now()
  where id = session.id;
  select * into strict profile from public.player_profiles where id = session.player_profile_id;
  select * into strict map from public.world_maps where id = session.world_map_id;
  insert into public.realtime_connection_audit (
    public_presence_id, world_map_id, channel_id, event, reason, request_id
  ) values (
    profile.public_presence_id, map.id, channel.id, 'channel_switched', 'player_requested', p_request_id
  );
  return jsonb_build_object(
    'status', 'switched', 'channelId', channel.id, 'channelNumber', channel.channel_number,
    'channels', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', listed.id, 'worldId', map.slug, 'number', listed.channel_number,
      'capacity', listed.capacity, 'population', (
        select count(*) from public.realtime_sessions member
        where member.channel_id = listed.id and member.status = 'active'
          and member.last_heartbeat_at > now() - interval '30 seconds'
      ), 'available', (
        select count(*) from public.realtime_sessions member
        where member.channel_id = listed.id and member.status = 'active'
          and member.last_heartbeat_at > now() - interval '30 seconds'
      ) < listed.capacity
    ) order by listed.channel_number), '[]'::jsonb)
    from public.realtime_channels listed where listed.world_map_id = map.id and listed.enabled)
  );
end;
$$;

create or replace function public.revalidate_realtime_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare session public.realtime_sessions%rowtype;
declare access_session public.wallet_access_sessions%rowtype;
declare profile public.player_profiles%rowtype;
declare denial text;
begin
  select * into session from public.realtime_sessions where id = p_session_id for update;
  if not found or session.status = 'closed' then return jsonb_build_object('status', 'closed'); end if;
  select * into strict access_session from public.wallet_access_sessions where id = session.wallet_access_session_id;
  select * into strict profile from public.player_profiles where id = session.player_profile_id;
  denial := private.realtime_access_denial(access_session, profile);
  if denial is not null then return jsonb_build_object('status', denial); end if;
  if profile.current_map_version_id <> session.world_map_version_id then
    return jsonb_build_object('status', 'world_changed');
  end if;
  update public.realtime_sessions set last_heartbeat_at = now(), status = 'active' where id = session.id;
  return jsonb_build_object('status', 'active');
exception when no_data_found then
  return jsonb_build_object('status', 'closed');
end;
$$;

create or replace function public.close_realtime_session(
  p_session_id uuid,
  p_reason text,
  p_request_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare closed public.realtime_sessions%rowtype;
declare presence_id uuid;
begin
  if p_reason not in (
    'clean_disconnect', 'connection_lost', 'replaced', 'channel_switch', 'world_transition',
    'access_revoked', 'player_suspended', 'rename_required', 'maintenance', 'server_shutdown',
    'authorization_failed', 'idle_timeout'
  ) or char_length(p_request_id) not between 1 and 128 then return false; end if;
  update public.realtime_sessions set status = 'closed', close_reason = p_reason, closed_at = now()
  where id = p_session_id and status in ('active', 'stale') returning * into closed;
  if not found then return false; end if;
  select public_presence_id into strict presence_id from public.player_profiles where id = closed.player_profile_id;
  insert into public.realtime_connection_audit (
    public_presence_id, world_map_id, channel_id, event, reason, duration_seconds, request_id
  ) values (
    presence_id, closed.world_map_id, closed.channel_id, 'disconnected', p_reason,
    least(86400, greatest(0, extract(epoch from now() - closed.connected_at)::integer)), p_request_id
  );
  return true;
end;
$$;

create or replace function private.realtime_admin_authorized(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    authz.result ->> 'outcome' = 'authorized'
    and (authz.result -> 'context' -> 'permissionKeys') ? 'realtime.read',
    false
  )
  from (
    select private.evaluate_admin_authorization(
      p_user_id, p_auth_session_id, p_assurance_level
    ) as result
  ) authz;
$$;

create or replace function public.get_admin_realtime_overview(
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
  if not private.realtime_admin_authorized(
    p_user_id, p_auth_session_id, p_assurance_level
  ) then raise exception using errcode = '42501', message = 'REALTIME_ACCESS_DENIED'; end if;
  return jsonb_build_object(
    'generatedAt', now(),
    'activeSessions', (select count(*) from public.realtime_sessions where status = 'active' and last_heartbeat_at > now() - interval '30 seconds'),
    'staleSessions', (select count(*) from public.realtime_sessions where status in ('active', 'stale') and last_heartbeat_at <= now() - interval '30 seconds'),
    'reconnectingSessions', (select count(*) from public.realtime_sessions where status = 'closed' and close_reason = 'connection_lost' and closed_at > now() - interval '1 minute'),
    'maintenanceActive', (select private.live_operations_maintenance_state(maintenance) in ('active', 'expired') from public.live_operations_maintenance maintenance where singleton_key),
    'populations', coalesce((select jsonb_agg(jsonb_build_object(
      'worldId', map.slug, 'worldName', map.display_name, 'channelId', channel.id,
      'channelNumber', channel.channel_number, 'capacity', channel.capacity,
      'active', (select count(*) from public.realtime_sessions session where session.channel_id = channel.id and session.status = 'active' and session.last_heartbeat_at > now() - interval '30 seconds'),
      'stale', (select count(*) from public.realtime_sessions session where session.channel_id = channel.id and session.status in ('active', 'stale') and session.last_heartbeat_at <= now() - interval '30 seconds')
    ) order by map.display_name, channel.channel_number)
    from public.realtime_channels channel join public.world_maps map on map.id = channel.world_map_id
    where channel.enabled), '[]'::jsonb),
    'recentDisconnects', coalesce((select jsonb_agg(jsonb_build_object(
      'reason', summary.reason, 'count', summary.total, 'latestAt', summary.latest_at
    ) order by summary.latest_at desc) from (
      select reason, count(*)::integer total, max(created_at) latest_at
      from public.realtime_connection_audit
      where event = 'disconnected' and created_at > now() - interval '24 hours'
      group by reason order by latest_at desc limit 20
    ) summary), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.realtime_access_denial(public.wallet_access_sessions,public.player_profiles) from public,anon,authenticated,service_role;
revoke all on function private.realtime_admin_authorized(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.issue_player_realtime_ticket(text,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.admit_player_realtime_ticket(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.checkpoint_realtime_session(uuid,numeric,numeric,text,bigint) from public,anon,authenticated,service_role;
revoke all on function public.switch_realtime_channel(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.revalidate_realtime_session(uuid) from public,anon,authenticated,service_role;
revoke all on function public.close_realtime_session(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_realtime_overview(uuid,uuid,text) from public,anon,authenticated,service_role;

grant execute on function public.issue_player_realtime_ticket(text,text,uuid,text) to service_role;
grant execute on function public.admit_player_realtime_ticket(text,text,text) to service_role;
grant execute on function public.checkpoint_realtime_session(uuid,numeric,numeric,text,bigint) to service_role;
grant execute on function public.switch_realtime_channel(uuid,uuid,text) to service_role;
grant execute on function public.revalidate_realtime_session(uuid) to service_role;
grant execute on function public.close_realtime_session(uuid,text,text) to service_role;
grant execute on function public.get_admin_realtime_overview(uuid,uuid,text) to service_role;
