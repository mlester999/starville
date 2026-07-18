-- Starville Phase 11A: owner-authorized private-home realtime projection.
-- Tickets are short lived, single use, and issued only through the trusted API.

create table public.cozy_private_realtime_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_hash text not null unique check (ticket_hash ~ '^[0-9a-f]{64}$'),
  wallet_access_session_id uuid not null
    references public.wallet_access_sessions(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (player_profile_id, request_id)
);

create table public.cozy_private_realtime_sessions (
  id uuid primary key default gen_random_uuid(),
  wallet_access_session_id uuid not null
    references public.wallet_access_sessions(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  connection_id text not null unique check (char_length(connection_id) between 1 and 128),
  status text not null default 'active' check (status in ('active', 'closed')),
  last_event_number bigint not null default 0 check (last_event_number >= 0),
  last_heartbeat_at timestamptz not null default now(),
  connected_at timestamptz not null default now(),
  closed_at timestamptz,
  close_reason text check (
    close_reason is null or (
      char_length(close_reason) between 1 and 80
      and close_reason ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
    )
  ),
  constraint cozy_private_realtime_session_close_check check (
    (status = 'active' and closed_at is null and close_reason is null)
    or (status = 'closed' and closed_at is not null and close_reason is not null)
  )
);

create index cozy_private_realtime_tickets_expiry_idx
  on public.cozy_private_realtime_tickets(expires_at)
  where consumed_at is null;
create index cozy_private_realtime_sessions_active_idx
  on public.cozy_private_realtime_sessions(player_home_id, last_heartbeat_at desc)
  where status = 'active';

create or replace function public.issue_player_private_home_realtime_ticket(
  p_access_session_token_hash text,
  p_ticket_hash text,
  p_home_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  access_session public.wallet_access_sessions%rowtype;
  profile public.player_profiles%rowtype;
  home public.player_homes%rowtype;
  denial text;
  expiration timestamptz := now() + interval '30 seconds';
begin
  if p_access_session_token_hash is null
     or p_access_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_ticket_hash is null
     or p_ticket_hash !~ '^[0-9a-f]{64}$'
     or p_home_id is null
     or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_PRIVATE_HOME_REALTIME_TICKET_REQUEST';
  end if;

  select * into access_session
  from public.wallet_access_sessions
  where session_token_hash = p_access_session_token_hash;
  if not found then return jsonb_build_object('status', 'access_revoked'); end if;

  select * into profile
  from public.player_profiles
  where wallet_address = access_session.wallet_address;
  if not found then return jsonb_build_object('status', 'profile_required'); end if;

  denial := private.realtime_access_denial(access_session, profile);
  if denial is not null then return jsonb_build_object('status', denial); end if;

  select * into home
  from public.player_homes
  where id = p_home_id and player_profile_id = profile.id;
  if not found then return jsonb_build_object('status', 'plot_unavailable'); end if;
  if home.lifecycle_status <> 'active' then
    return jsonb_build_object('status', 'plot_unavailable');
  end if;
  if not home.inside_home then
    return jsonb_build_object('status', 'plot_world_mismatch');
  end if;

  delete from public.cozy_private_realtime_tickets
  where player_profile_id = profile.id and consumed_at is null;

  insert into public.cozy_private_realtime_tickets (
    ticket_hash, wallet_access_session_id, player_profile_id,
    player_home_id, request_id, expires_at
  ) values (
    p_ticket_hash, access_session.id, profile.id,
    home.id, p_request_id, expiration
  );

  return jsonb_build_object(
    'status', 'issued',
    'homeId', home.id,
    'expiresAt', expiration
  );
end;
$$;

create or replace function public.admit_player_private_home_realtime_ticket(
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
declare
  ticket public.cozy_private_realtime_tickets%rowtype;
  access_session public.wallet_access_sessions%rowtype;
  profile public.player_profiles%rowtype;
  home public.player_homes%rowtype;
  created_session public.cozy_private_realtime_sessions%rowtype;
  denial text;
  latest_event_number bigint;
begin
  if p_ticket_hash is null or p_ticket_hash !~ '^[0-9a-f]{64}$'
     or p_connection_id is null or char_length(p_connection_id) not between 1 and 128
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_ticket');
  end if;

  select * into ticket
  from public.cozy_private_realtime_tickets
  where ticket_hash = p_ticket_hash
  for update;
  if not found or ticket.consumed_at is not null or ticket.expires_at <= now() then
    return jsonb_build_object('status', 'invalid_ticket');
  end if;

  select * into strict access_session
  from public.wallet_access_sessions
  where id = ticket.wallet_access_session_id;
  select * into strict profile
  from public.player_profiles
  where id = ticket.player_profile_id;

  denial := private.realtime_access_denial(access_session, profile);
  if denial is not null then return jsonb_build_object('status', denial); end if;

  select * into home
  from public.player_homes
  where id = ticket.player_home_id and player_profile_id = profile.id;
  if not found or home.lifecycle_status <> 'active' then
    return jsonb_build_object('status', 'plot_unavailable');
  end if;
  if not home.inside_home then
    return jsonb_build_object('status', 'plot_world_mismatch');
  end if;

  select coalesce(max(event.event_number), 0)
  into latest_event_number
  from public.cozy_private_plot_events event
  where event.player_home_id = home.id;

  insert into public.cozy_private_realtime_sessions (
    wallet_access_session_id, player_profile_id, player_home_id,
    connection_id, last_event_number
  ) values (
    access_session.id, profile.id, home.id, p_connection_id, latest_event_number
  ) returning * into created_session;

  update public.cozy_private_realtime_tickets
  set consumed_at = now()
  where id = ticket.id;

  return jsonb_build_object(
    'status', 'admitted',
    'sessionId', created_session.id,
    'homeId', home.id,
    'lastEventNumber', latest_event_number::text,
    'view', private.cozy_playable_vertical_slice_json(profile.id)
  );
end;
$$;

create or replace function public.get_player_private_home_realtime_events(
  p_session_id uuid,
  p_after_event_number bigint,
  p_force_snapshot boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session public.cozy_private_realtime_sessions%rowtype;
  access_session public.wallet_access_sessions%rowtype;
  profile public.player_profiles%rowtype;
  home public.player_homes%rowtype;
  denial text;
  events jsonb;
  latest_event_number bigint;
begin
  if p_session_id is null or p_after_event_number is null or p_after_event_number < 0
     or p_force_snapshot is null then
    return jsonb_build_object('status', 'invalid_session');
  end if;

  select * into session
  from public.cozy_private_realtime_sessions
  where id = p_session_id and status = 'active'
  for update;
  if not found then return jsonb_build_object('status', 'closed'); end if;

  select * into strict access_session
  from public.wallet_access_sessions
  where id = session.wallet_access_session_id;
  select * into strict profile
  from public.player_profiles
  where id = session.player_profile_id;
  denial := private.realtime_access_denial(access_session, profile);
  if denial is not null then
    update public.cozy_private_realtime_sessions
    set status = 'closed', closed_at = now(), close_reason = 'access_changed'
    where id = session.id;
    return jsonb_build_object('status', denial);
  end if;

  select * into home
  from public.player_homes
  where id = session.player_home_id and player_profile_id = profile.id;
  if not found or home.lifecycle_status <> 'active' then
    update public.cozy_private_realtime_sessions
    set status = 'closed', closed_at = now(), close_reason = 'plot_unavailable'
    where id = session.id;
    return jsonb_build_object('status', 'plot_unavailable');
  end if;
  if not home.inside_home then
    update public.cozy_private_realtime_sessions
    set status = 'closed', closed_at = now(), close_reason = 'world_transition'
    where id = session.id;
    return jsonb_build_object('status', 'plot_world_mismatch');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id,
    'eventNumber', event.event_number::text,
    'eventKey', event.event_key,
    'targetId', event.target_id,
    'payload', event.payload,
    'createdAt', event.created_at
  ) order by event.event_number), '[]'::jsonb)
  into events
  from (
    select *
    from public.cozy_private_plot_events
    where player_home_id = home.id and event_number > p_after_event_number
    order by event_number
    limit 100
  ) event;

  select coalesce(max((entry ->> 'eventNumber')::bigint), p_after_event_number)
  into latest_event_number
  from jsonb_array_elements(events) entry;

  update public.cozy_private_realtime_sessions
  set last_event_number = greatest(last_event_number, latest_event_number),
      last_heartbeat_at = now()
  where id = session.id;

  if jsonb_array_length(events) = 0 and not p_force_snapshot then
    return jsonb_build_object(
      'status', 'no_changes',
      'lastEventNumber', latest_event_number::text
    );
  end if;

  return jsonb_build_object(
    'status', 'loaded',
    'lastEventNumber', latest_event_number::text,
    'events', events,
    'view', private.cozy_playable_vertical_slice_json(profile.id)
  );
end;
$$;

create or replace function public.revalidate_player_private_home_realtime_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  result := public.get_player_private_home_realtime_events(p_session_id, 0, false);
  if result ->> 'status' in ('loaded', 'no_changes') then
    return jsonb_build_object('status', 'active');
  end if;
  return jsonb_build_object('status', result ->> 'status');
end;
$$;

create or replace function public.close_player_private_home_realtime_session(
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
begin
  if p_session_id is null
     or p_reason is null or p_reason !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
     or char_length(p_reason) not between 1 and 80
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    return false;
  end if;
  update public.cozy_private_realtime_sessions
  set status = 'closed', closed_at = now(), close_reason = p_reason
  where id = p_session_id and status = 'active';
  return found;
end;
$$;

alter table public.cozy_private_realtime_tickets enable row level security;
alter table public.cozy_private_realtime_tickets force row level security;
alter table public.cozy_private_realtime_sessions enable row level security;
alter table public.cozy_private_realtime_sessions force row level security;

revoke all on table public.cozy_private_realtime_tickets
  from public, anon, authenticated, service_role;
revoke all on table public.cozy_private_realtime_sessions
  from public, anon, authenticated, service_role;

revoke all on function public.issue_player_private_home_realtime_ticket(text,text,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.admit_player_private_home_realtime_ticket(text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_player_private_home_realtime_events(uuid,bigint,boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.revalidate_player_private_home_realtime_session(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.close_player_private_home_realtime_session(uuid,text,text)
  from public, anon, authenticated, service_role;

grant execute on function public.issue_player_private_home_realtime_ticket(text,text,uuid,text)
  to service_role;
grant execute on function public.admit_player_private_home_realtime_ticket(text,text,text)
  to service_role;
grant execute on function public.get_player_private_home_realtime_events(uuid,bigint,boolean)
  to service_role;
grant execute on function public.revalidate_player_private_home_realtime_session(uuid)
  to service_role;
grant execute on function public.close_player_private_home_realtime_session(uuid,text,text)
  to service_role;
