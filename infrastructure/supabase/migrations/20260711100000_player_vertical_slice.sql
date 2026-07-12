-- Starville Phase 4: minimal wallet-owned profile and safe resume state.

create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique check (
    char_length(wallet_address) between 32 and 44
    and wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]+$'
  ),
  display_name text not null check (
    char_length(display_name) between 3 and 20
    and display_name = btrim(display_name)
    and display_name ~ '^[[:alnum:] _-]+$'
  ),
  appearance_preset text not null check (
    appearance_preset in ('moss', 'marigold', 'moonberry', 'river')
  ),
  current_map_id text not null default 'lantern-square' check (
    current_map_id = 'lantern-square'
  ),
  safe_position_x numeric(8, 4) not null default 12 check (
    safe_position_x::text <> 'NaN' and safe_position_x between 0.75 and 23.25
  ),
  safe_position_y numeric(8, 4) not null default 7.5 check (
    safe_position_y::text <> 'NaN' and safe_position_y between 0.75 and 19.25
  ),
  facing_direction text not null default 'south' check (
    facing_direction in (
      'north', 'northeast', 'east', 'southeast',
      'south', 'southwest', 'west', 'northwest'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_entered_at timestamptz not null default now()
);

comment on table public.player_profiles is
  'Minimal wallet-owned Phase 4 profile and resume convenience state. Position is not gameplay authority.';
comment on column public.player_profiles.wallet_address is
  'Derived by the API from a valid wallet-access session; never accepted as browser authorization.';
comment on column public.player_profiles.safe_position_x is
  'Resume convenience only; never proof for rewards, anti-cheat, achievements, or multiplayer.';
comment on column public.player_profiles.safe_position_y is
  'Resume convenience only; never proof for rewards, anti-cheat, achievements, or multiplayer.';

create table public.player_api_rate_limits (
  scope text not null check (scope in ('profile_write', 'state_write')),
  subject_key text not null check (
    char_length(subject_key) between 32 and 44
    and subject_key ~ '^[1-9A-HJ-NP-Za-km-z]+$'
  ),
  attempt_count integer not null check (attempt_count between 1 and 1000000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_key),
  constraint player_api_rate_limit_window_check check (
    window_expires_at > window_started_at
    and window_expires_at <= window_started_at + interval '10 minutes'
  )
);

comment on table public.player_api_rate_limits is
  'Durable per-wallet fixed-window limits for protected profile and resume-state writes.';

create index player_profiles_updated_at_idx on public.player_profiles(updated_at desc);
create index player_api_rate_limits_expiry_idx on public.player_api_rate_limits(window_expires_at);

create trigger player_profiles_set_updated_at
before update on public.player_profiles
for each row execute function private.set_updated_at();

alter table public.player_profiles enable row level security;
alter table public.player_api_rate_limits enable row level security;

revoke all on table public.player_profiles from anon, authenticated, service_role;
revoke all on table public.player_api_rate_limits from anon, authenticated, service_role;

create or replace function private.claim_player_rate_limit(
  p_scope text,
  p_subject_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  if p_scope not in ('profile_write', 'state_write')
     or p_subject_key !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_limit not between 1 and 120
     or p_window_seconds not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_RATE_LIMIT_INPUT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('player-rate:' || p_scope || ':' || p_subject_key, 0)
  );

  insert into public.player_api_rate_limits (
    scope, subject_key, attempt_count, window_started_at, window_expires_at, updated_at
  ) values (
    p_scope, p_subject_key, 1, now(), now() + make_interval(secs => p_window_seconds), now()
  )
  on conflict (scope, subject_key) do update
  set attempt_count = case
        when player_api_rate_limits.window_expires_at <= now() then 1
        else player_api_rate_limits.attempt_count + 1
      end,
      window_started_at = case
        when player_api_rate_limits.window_expires_at <= now() then now()
        else player_api_rate_limits.window_started_at
      end,
      window_expires_at = case
        when player_api_rate_limits.window_expires_at <= now()
          then now() + make_interval(secs => p_window_seconds)
        else player_api_rate_limits.window_expires_at
      end,
      updated_at = now()
  where player_api_rate_limits.window_expires_at <= now()
     or player_api_rate_limits.attempt_count < p_limit
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function private.player_profile_json(profile public.player_profiles)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'loaded',
    'id', profile.id,
    'displayName', profile.display_name,
    'appearancePreset', profile.appearance_preset,
    'mapId', profile.current_map_id,
    'x', profile.safe_position_x,
    'y', profile.safe_position_y,
    'facingDirection', profile.facing_direction,
    'createdAt', profile.created_at,
    'updatedAt', profile.updated_at,
    'lastEnteredAt', profile.last_entered_at
  );
$$;

create or replace function public.load_player_profile(p_wallet_address text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
begin
  if p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_IDENTITY';
  end if;

  update public.player_profiles
  set last_entered_at = now()
  where wallet_address = p_wallet_address
  returning * into profile;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return private.player_profile_json(profile);
end;
$$;

create or replace function public.create_player_profile(
  p_wallet_address text,
  p_display_name text,
  p_appearance_preset text,
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
  profile public.player_profiles%rowtype;
begin
  if p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or char_length(p_display_name) not between 3 and 20
     or p_display_name <> btrim(p_display_name)
     or p_display_name !~ '^[[:alnum:] _-]+$'
     or p_appearance_preset not in ('moss', 'marigold', 'moonberry', 'river')
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 30 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_PROFILE_INPUT';
  end if;

  if not private.claim_player_rate_limit(
    'profile_write', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.player_profiles (wallet_address, display_name, appearance_preset)
  values (p_wallet_address, p_display_name, p_appearance_preset)
  on conflict (wallet_address) do nothing;

  select * into strict profile
  from public.player_profiles
  where wallet_address = p_wallet_address;

  return private.player_profile_json(profile);
end;
$$;

create or replace function public.update_player_profile(
  p_wallet_address text,
  p_display_name text,
  p_appearance_preset text,
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
  profile public.player_profiles%rowtype;
begin
  if p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or (p_display_name is not null and (
       char_length(p_display_name) not between 3 and 20
       or p_display_name <> btrim(p_display_name)
       or p_display_name !~ '^[[:alnum:] _-]+$'
     ))
     or (p_appearance_preset is not null and
       p_appearance_preset not in ('moss', 'marigold', 'moonberry', 'river'))
     or (p_display_name is null and p_appearance_preset is null)
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 30 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_PROFILE_INPUT';
  end if;

  if not private.claim_player_rate_limit(
    'profile_write', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  update public.player_profiles
  set display_name = coalesce(p_display_name, display_name),
      appearance_preset = coalesce(p_appearance_preset, appearance_preset)
  where wallet_address = p_wallet_address
  returning * into profile;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return private.player_profile_json(profile);
end;
$$;

create or replace function public.save_player_game_state(
  p_wallet_address text,
  p_map_id text,
  p_position_x numeric,
  p_position_y numeric,
  p_facing_direction text,
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
  profile public.player_profiles%rowtype;
begin
  if p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_map_id <> 'lantern-square'
     or p_position_x is null or p_position_x::text = 'NaN'
     or p_position_y is null or p_position_y::text = 'NaN'
     or p_position_x not between 0.75 and 23.25
     or p_position_y not between 0.75 and 19.25
     or p_facing_direction not in (
       'north', 'northeast', 'east', 'southeast',
       'south', 'southwest', 'west', 'northwest'
     )
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_STATE_INPUT';
  end if;

  if not private.claim_player_rate_limit(
    'state_write', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  update public.player_profiles
  set current_map_id = p_map_id,
      safe_position_x = round(p_position_x, 4),
      safe_position_y = round(p_position_y, 4),
      facing_direction = p_facing_direction
  where wallet_address = p_wallet_address
  returning * into profile;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return private.player_profile_json(profile);
end;
$$;

revoke all on function private.claim_player_rate_limit(text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.player_profile_json(public.player_profiles)
  from public, anon, authenticated, service_role;
revoke all on function public.load_player_profile(text) from public, anon, authenticated;
revoke all on function public.create_player_profile(text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.update_player_profile(text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.save_player_game_state(text, text, numeric, numeric, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.load_player_profile(text) to service_role;
grant execute on function public.create_player_profile(text, text, text, text, integer)
  to service_role;
grant execute on function public.update_player_profile(text, text, text, text, integer)
  to service_role;
grant execute on function public.save_player_game_state(text, text, numeric, numeric, text, text, integer)
  to service_role;
