-- Phase 13E-A: private Supabase Realtime authorization foundation.
-- This migration does not retire the custom realtime service or make movement authoritative.

create table public.supabase_realtime_settings (
  singleton_key boolean primary key default true check (singleton_key),
  environment_key text not null default 'development'
    check (environment_key in ('development', 'test', 'production')),
  authorization_ttl_seconds integer not null default 300
    check (authorization_ttl_seconds between 60 and 600),
  updated_at timestamptz not null default now()
);

insert into public.supabase_realtime_settings (singleton_key)
values (true)
on conflict (singleton_key) do nothing;

create table public.supabase_realtime_player_identities (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  player_profile_id uuid not null unique references public.player_profiles(id) on delete cascade,
  bound_request_id text not null check (char_length(bound_request_id) between 1 and 128),
  bound_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now()
);

create table public.supabase_realtime_memberships (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  player_profile_id uuid not null references public.player_profiles(id) on delete cascade,
  wallet_access_session_id uuid not null references public.wallet_access_sessions(id) on delete cascade,
  environment_key text not null check (environment_key in ('development', 'test', 'production')),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  world_map_version_id uuid not null references public.world_map_versions(id) on delete restrict,
  channel_id uuid not null references public.realtime_channels(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'closed', 'expired')),
  request_id text not null check (char_length(request_id) between 1 and 128),
  authorized_at timestamptz not null default now(),
  authorization_expires_at timestamptz not null,
  last_authorized_at timestamptz not null default now(),
  closed_at timestamptz,
  close_reason text check (
    close_reason is null or close_reason in (
      'client_closed', 'replaced', 'channel_switch', 'authorization_expired', 'access_revoked'
    )
  ),
  constraint supabase_realtime_membership_expiry_check check (
    authorization_expires_at > authorized_at
    and authorization_expires_at <= authorized_at + interval '10 minutes'
  ),
  constraint supabase_realtime_membership_state_check check (
    (status = 'active' and closed_at is null and close_reason is null)
    or (status <> 'active' and closed_at is not null and close_reason is not null)
  )
);

create unique index supabase_realtime_one_active_auth_user_idx
  on public.supabase_realtime_memberships(auth_user_id)
  where status = 'active';
create index supabase_realtime_active_channel_idx
  on public.supabase_realtime_memberships(channel_id, authorization_expires_at)
  where status = 'active';
create index supabase_realtime_expiry_idx
  on public.supabase_realtime_memberships(authorization_expires_at, id)
  where status = 'active';

create table public.supabase_realtime_authorization_audit (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  player_profile_id uuid references public.player_profiles(id) on delete set null,
  membership_id uuid,
  event text not null check (event in ('authorized', 'refreshed', 'closed', 'rejected')),
  reason text not null check (
    char_length(reason) between 1 and 64 and reason ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now()
);

alter table public.supabase_realtime_settings enable row level security;
alter table public.supabase_realtime_settings force row level security;
alter table public.supabase_realtime_player_identities enable row level security;
alter table public.supabase_realtime_player_identities force row level security;
alter table public.supabase_realtime_memberships enable row level security;
alter table public.supabase_realtime_memberships force row level security;
alter table public.supabase_realtime_authorization_audit enable row level security;
alter table public.supabase_realtime_authorization_audit force row level security;

revoke all on table public.supabase_realtime_settings
  from public, anon, authenticated, service_role;
revoke all on table public.supabase_realtime_player_identities
  from public, anon, authenticated, service_role;
revoke all on table public.supabase_realtime_memberships
  from public, anon, authenticated, service_role;
revoke all on table public.supabase_realtime_authorization_audit
  from public, anon, authenticated, service_role;

create or replace function private.supabase_realtime_membership_is_valid(
  p_membership public.supabase_realtime_memberships
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_membership.status = 'active'
    and p_membership.authorization_expires_at > now()
    and exists (
      select 1
      from public.wallet_access_sessions access_session
      join public.player_profiles profile
        on profile.id = p_membership.player_profile_id
       and profile.wallet_address = access_session.wallet_address
      join public.supabase_realtime_player_identities identity
        on identity.auth_user_id = p_membership.auth_user_id
       and identity.player_profile_id = profile.id
      where access_session.id = p_membership.wallet_access_session_id
        and private.realtime_access_denial(access_session, profile) is null
        and profile.current_map_version_id = p_membership.world_map_version_id
    ),
    false
  );
$$;

create or replace function private.supabase_realtime_topic_authorized(
  p_auth_user_id uuid,
  p_topic text,
  p_extension text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare membership public.supabase_realtime_memberships%rowtype;
declare map_slug text;
declare topic_parts text[];
declare topic_scope text;
declare topic_identifier text;
declare topic_channel_id uuid;
begin
  if p_auth_user_id is null
     or p_extension not in ('broadcast', 'presence')
     or char_length(p_topic) not between 1 and 256 then
    return false;
  end if;

  select * into membership
  from public.supabase_realtime_memberships candidate
  where candidate.auth_user_id = p_auth_user_id
    and candidate.status = 'active'
    and candidate.authorization_expires_at > now();
  if not found or not private.supabase_realtime_membership_is_valid(membership) then
    return false;
  end if;

  topic_parts := string_to_array(p_topic, ':');
  if cardinality(topic_parts) not in (4, 6)
     or topic_parts[1] <> 'starville'
     or topic_parts[2] <> membership.environment_key then
    return false;
  end if;
  topic_scope := topic_parts[3];
  topic_identifier := topic_parts[4];

  if topic_scope = 'world' then
    if cardinality(topic_parts) <> 6 or topic_parts[5] <> 'channel' then return false; end if;
    begin
      topic_channel_id := topic_parts[6]::uuid;
    exception when invalid_text_representation then
      return false;
    end;
    select slug into map_slug from public.world_maps where id = membership.world_map_id;
    return topic_identifier = map_slug and topic_channel_id = membership.channel_id;
  end if;

  if cardinality(topic_parts) <> 4 or topic_identifier !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  if topic_scope = 'player' then
    return exists (
      select 1 from public.player_profiles profile
      where profile.id = membership.player_profile_id
        and profile.public_presence_id = topic_identifier::uuid
    );
  elsif topic_scope = 'party' then
    return exists (
      select 1
      from public.player_parties party
      join public.player_party_members party_member on party_member.party_id = party.id
      where party.public_party_id = topic_identifier::uuid
        and party.status = 'active'
        and party_member.player_profile_id = membership.player_profile_id
        and party_member.status = 'active'
    );
  elsif topic_scope = 'home' then
    return exists (
      select 1
      from public.player_homes home
      left join public.home_social_settings settings on settings.player_home_id = home.id
      where home.id = topic_identifier::uuid
        and (
          home.player_profile_id = membership.player_profile_id
          or (
            settings.admissions_open
            and (
              exists (
                select 1
                from public.home_visit_participants participant
                join public.home_visit_sessions visit on visit.id = participant.visit_session_id
                where participant.player_home_id = home.id
                  and participant.player_profile_id = membership.player_profile_id
                  and participant.status in ('active', 'reconnecting')
                  and visit.status in ('starting', 'open')
                  and visit.admissions_open
              )
              or exists (
                select 1
                from public.home_visit_invitations invitation
                where invitation.player_home_id = home.id
                  and invitation.invitee_player_profile_id = membership.player_profile_id
                  and invitation.status in ('pending', 'accepted')
                  and invitation.expires_at > now()
              )
            )
          )
        )
    );
  end if;
  return false;
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function public.prepare_supabase_realtime_player_identity(
  p_access_session_token_hash text,
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
begin
  if p_access_session_token_hash !~ '^[0-9a-f]{64}$'
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023',
      message = 'INVALID_SUPABASE_REALTIME_PLAYER_IDENTITY_REQUEST';
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
  return jsonb_build_object(
    'status', 'eligible',
    'email', 'player-' || profile.public_presence_id::text || '@auth.starville.game'
  );
end;
$$;

create or replace function public.bind_supabase_realtime_player_identity(
  p_auth_user_id uuid,
  p_access_session_token_hash text,
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
declare auth_email text;
declare existing_identity public.supabase_realtime_player_identities%rowtype;
declare denial text;
begin
  if p_auth_user_id is null
     or p_access_session_token_hash !~ '^[0-9a-f]{64}$'
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023',
      message = 'INVALID_SUPABASE_REALTIME_PLAYER_IDENTITY_BINDING';
  end if;
  select email into auth_email
  from auth.users
  where id = p_auth_user_id and not coalesce(is_anonymous, false);
  if not found then return jsonb_build_object('status', 'auth_identity_invalid'); end if;
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
  if auth_email is distinct from
    'player-' || profile.public_presence_id::text || '@auth.starville.game' then
    return jsonb_build_object('status', 'auth_identity_invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supabase-realtime-player-auth:' || profile.id::text, 0)
  );
  select * into existing_identity
  from public.supabase_realtime_player_identities
  where auth_user_id = p_auth_user_id or player_profile_id = profile.id
  for update;
  if found and (
    existing_identity.auth_user_id <> p_auth_user_id
    or existing_identity.player_profile_id <> profile.id
  ) then
    return jsonb_build_object('status', 'auth_identity_conflict');
  end if;
  insert into public.supabase_realtime_player_identities(
    auth_user_id, player_profile_id, bound_request_id
  )
  values(p_auth_user_id, profile.id, p_request_id)
  on conflict(auth_user_id) do update
  set bound_request_id = excluded.bound_request_id, last_verified_at = now();
  return jsonb_build_object('status', 'bound');
end;
$$;

create or replace function public.authorize_supabase_realtime_player(
  p_auth_user_id uuid,
  p_access_session_token_hash text,
  p_environment_key text,
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
declare world_map public.world_maps%rowtype;
declare selected_channel public.realtime_channels%rowtype;
declare membership public.supabase_realtime_memberships%rowtype;
declare settings public.supabase_realtime_settings%rowtype;
declare denial text;
declare expiration timestamptz;
declare was_refresh boolean := false;
begin
  if p_auth_user_id is null
     or p_access_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_environment_key not in ('development', 'test', 'production')
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_SUPABASE_REALTIME_AUTHORIZATION';
  end if;
  if not exists (
    select 1 from auth.users
    where id = p_auth_user_id and not coalesce(is_anonymous, false)
  ) then
    return jsonb_build_object('status', 'auth_identity_invalid');
  end if;
  select * into strict settings from public.supabase_realtime_settings where singleton_key;
  if settings.environment_key <> p_environment_key then
    return jsonb_build_object('status', 'environment_mismatch');
  end if;
  select * into access_session
  from public.wallet_access_sessions
  where session_token_hash = p_access_session_token_hash;
  if not found then return jsonb_build_object('status', 'access_revoked'); end if;
  select * into profile
  from public.player_profiles
  where wallet_address = access_session.wallet_address;
  if not found then return jsonb_build_object('status', 'profile_required'); end if;
  if not exists (
    select 1
    from public.supabase_realtime_player_identities identity
    where identity.auth_user_id = p_auth_user_id
      and identity.player_profile_id = profile.id
  ) then
    return jsonb_build_object('status', 'auth_identity_invalid');
  end if;
  denial := private.realtime_access_denial(access_session, profile);
  if denial is not null then return jsonb_build_object('status', denial); end if;
  select * into strict world_map
  from public.world_maps
  where slug = profile.current_map_id and status = 'active';

  select * into selected_channel
  from public.realtime_channels channel
  where channel.world_map_id = world_map.id
    and channel.enabled
    and (p_requested_channel_id is null or channel.id = p_requested_channel_id)
  order by
    case when channel.id = p_requested_channel_id then 0 else 1 end,
    (
      select count(*)
      from public.supabase_realtime_memberships active_member
      where active_member.channel_id = channel.id
        and active_member.status = 'active'
        and active_member.authorization_expires_at > now()
    ),
    channel.channel_number
  limit 1
  for update;
  if not found then return jsonb_build_object('status', 'channel_unavailable'); end if;
  if (
    select count(*)
    from public.supabase_realtime_memberships active_member
    where active_member.channel_id = selected_channel.id
      and active_member.status = 'active'
      and active_member.authorization_expires_at > now()
      and active_member.auth_user_id <> p_auth_user_id
  ) >= selected_channel.capacity then
    return jsonb_build_object('status', 'channel_full');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supabase-realtime-auth:' || p_auth_user_id::text, 0)
  );
  expiration := least(
    access_session.expires_at,
    now() + make_interval(secs => settings.authorization_ttl_seconds)
  );
  if expiration <= now() + interval '15 seconds' then
    return jsonb_build_object('status', 'access_revoked');
  end if;

  select * into membership
  from public.supabase_realtime_memberships current_membership
  where current_membership.auth_user_id = p_auth_user_id
    and current_membership.status = 'active'
  for update;
  if found
     and membership.player_profile_id = profile.id
     and membership.channel_id = selected_channel.id then
    was_refresh := true;
    update public.supabase_realtime_memberships
    set wallet_access_session_id = access_session.id,
        world_map_version_id = profile.current_map_version_id,
        request_id = p_request_id,
        authorized_at = now(),
        authorization_expires_at = expiration,
        last_authorized_at = now()
    where id = membership.id
    returning * into membership;
  else
    if found then
      update public.supabase_realtime_memberships
      set status = 'closed', closed_at = now(),
          close_reason = case
            when channel_id <> selected_channel.id then 'channel_switch'
            else 'replaced'
          end
      where id = membership.id;
    end if;
    insert into public.supabase_realtime_memberships (
      auth_user_id, player_profile_id, wallet_access_session_id, environment_key,
      world_map_id, world_map_version_id, channel_id, request_id,
      authorization_expires_at
    ) values (
      p_auth_user_id, profile.id, access_session.id, p_environment_key,
      world_map.id, profile.current_map_version_id, selected_channel.id, p_request_id,
      expiration
    )
    returning * into membership;
  end if;

  insert into public.supabase_realtime_authorization_audit (
    auth_user_id, player_profile_id, membership_id, event, reason, request_id
  ) values (
    p_auth_user_id, profile.id, membership.id,
    case when was_refresh then 'refreshed' else 'authorized' end,
    case when was_refresh then 'authorization_refreshed' else 'authorization_granted' end,
    p_request_id
  );

  return jsonb_build_object(
    'status', 'authorized',
    'membershipId', membership.id,
    'topic', 'starville:' || p_environment_key || ':world:' || world_map.slug
      || ':channel:' || selected_channel.id,
    'authorizationExpiresAt', expiration,
    'self', jsonb_build_object(
      'presenceId', profile.public_presence_id,
      'displayName', profile.display_name,
      'level', profile.public_level,
      'worldId', world_map.slug,
      'worldVersionId', profile.current_map_version_id,
      'channelId', selected_channel.id,
      'channelNumber', selected_channel.channel_number,
      'x', profile.safe_position_x,
      'y', profile.safe_position_y,
      'facingDirection', profile.facing_direction,
      'movementState', 'idle',
      'appearancePreset', profile.appearance_preset,
      'sequence', 0,
      'connected', true
    ),
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', channel.id,
        'worldId', world_map.slug,
        'number', channel.channel_number,
        'capacity', channel.capacity,
        'population', (
          select count(*)
          from public.supabase_realtime_memberships active_member
          where active_member.channel_id = channel.id
            and active_member.status = 'active'
            and active_member.authorization_expires_at > now()
        ),
        'available', (
          select count(*)
          from public.supabase_realtime_memberships active_member
          where active_member.channel_id = channel.id
            and active_member.status = 'active'
            and active_member.authorization_expires_at > now()
        ) < channel.capacity
      ) order by channel.channel_number), '[]'::jsonb)
      from public.realtime_channels channel
      where channel.world_map_id = world_map.id and channel.enabled
    )
  );
exception when no_data_found then
  return jsonb_build_object('status', 'world_unavailable');
end;
$$;

create or replace function public.close_supabase_realtime_membership(
  p_auth_user_id uuid,
  p_membership_id uuid,
  p_request_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare closed public.supabase_realtime_memberships%rowtype;
begin
  if p_auth_user_id is null or p_membership_id is null
     or char_length(p_request_id) not between 1 and 128 then return false; end if;
  update public.supabase_realtime_memberships
  set status = 'closed', closed_at = now(), close_reason = 'client_closed'
  where id = p_membership_id and auth_user_id = p_auth_user_id and status = 'active'
  returning * into closed;
  if not found then return false; end if;
  insert into public.supabase_realtime_authorization_audit (
    auth_user_id, player_profile_id, membership_id, event, reason, request_id
  ) values (
    p_auth_user_id, closed.player_profile_id, closed.id, 'closed', 'client_closed', p_request_id
  );
  return true;
end;
$$;

drop policy if exists starville_private_broadcast_read on realtime.messages;
create policy starville_private_broadcast_read
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and private.supabase_realtime_topic_authorized(
    auth.uid(), realtime.topic(), realtime.messages.extension
  )
);

drop policy if exists starville_private_broadcast_write on realtime.messages;
create policy starville_private_broadcast_write
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and private.supabase_realtime_topic_authorized(
    auth.uid(), realtime.topic(), realtime.messages.extension
  )
);

drop policy if exists starville_private_presence_read on realtime.messages;
create policy starville_private_presence_read
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'presence'
  and private.supabase_realtime_topic_authorized(
    auth.uid(), realtime.topic(), realtime.messages.extension
  )
);

drop policy if exists starville_private_presence_write on realtime.messages;
create policy starville_private_presence_write
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'presence'
  and private.supabase_realtime_topic_authorized(
    auth.uid(), realtime.topic(), realtime.messages.extension
  )
);

revoke all on function private.supabase_realtime_membership_is_valid(
  public.supabase_realtime_memberships
) from public, anon, authenticated, service_role;
revoke all on function private.supabase_realtime_topic_authorized(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_supabase_realtime_player_identity(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.bind_supabase_realtime_player_identity(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_supabase_realtime_player(uuid,text,text,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.close_supabase_realtime_membership(uuid,uuid,text)
  from public, anon, authenticated, service_role;

grant execute on function public.prepare_supabase_realtime_player_identity(text,text)
  to service_role;
grant execute on function public.bind_supabase_realtime_player_identity(uuid,text,text)
  to service_role;
grant execute on function public.authorize_supabase_realtime_player(uuid,text,text,uuid,text)
  to service_role;
grant execute on function public.close_supabase_realtime_membership(uuid,uuid,text)
  to service_role;
