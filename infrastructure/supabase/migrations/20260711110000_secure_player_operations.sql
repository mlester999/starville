-- Starville Phase 5: secure player operations and truthful operational reporting.
-- Depends on the Phase 4 player_vertical_slice migration. No Phase 6+ data is introduced.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  (
    'operations.read',
    'Read operations overview',
    'View bounded, defined platform health and operational counts.',
    'operations',
    false,
    true
  ),
  (
    'players.reset_position',
    'Reset player position',
    'Reset a player only to the server-approved map spawn.',
    'players',
    true,
    true
  ),
  (
    'players.require_rename',
    'Require player rename',
    'Require a player to complete the protected display-name replacement flow.',
    'players',
    true,
    true
  ),
  (
    'player_audit.read',
    'Read player audit history',
    'View bounded player-specific operational audit events.',
    'player_audit',
    true,
    true
  )
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    is_sensitive = excluded.is_sensitive,
    is_system = true;

-- Super Admin deliberately receives the complete system catalog.
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.admin_roles as role
cross join public.admin_permissions as permission
where role.key = 'super_admin'
on conflict (role_id, permission_id) do nothing;

-- Other roles receive only reviewed Phase 5 additions. Existing Phase 2 mappings remain intact.
with mapping(role_key, permission_key) as (
  values
    ('game_administrator', 'operations.read'),
    ('game_administrator', 'players.reset_position'),
    ('game_administrator', 'players.require_rename'),
    ('game_administrator', 'player_audit.read'),
    ('live_operations_manager', 'operations.read'),
    ('live_operations_manager', 'players.reset_position'),
    ('live_operations_manager', 'players.manage_sessions'),
    ('live_operations_manager', 'player_audit.read'),
    ('moderator', 'players.require_rename'),
    ('moderator', 'player_audit.read'),
    ('customer_support', 'player_audit.read'),
    ('blockchain_operator', 'operations.read'),
    ('read_only_analyst', 'operations.read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles as role on role.key = mapping.role_key
join public.admin_permissions as permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

alter table public.player_profiles
  add column game_state_version integer not null default 1
  check (game_state_version > 0);

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
    'gameStateVersion', profile.game_state_version,
    'createdAt', profile.created_at,
    'updatedAt', profile.updated_at,
    'lastEnteredAt', profile.last_entered_at
  );
$$;

create or replace function private.set_player_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.wallet_address is distinct from old.wallet_address
     or new.display_name is distinct from old.display_name
     or new.appearance_preset is distinct from old.appearance_preset
     or new.current_map_id is distinct from old.current_map_id
     or new.safe_position_x is distinct from old.safe_position_x
     or new.safe_position_y is distinct from old.safe_position_y
     or new.facing_direction is distinct from old.facing_direction
     or new.game_state_version is distinct from old.game_state_version then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger player_profiles_set_updated_at on public.player_profiles;
create trigger player_profiles_set_updated_at
before update on public.player_profiles
for each row execute function private.set_player_profile_updated_at();

create table public.player_moderation_states (
  player_profile_id uuid primary key references public.player_profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  suspension_reason text check (
    suspension_reason is null or (
      char_length(suspension_reason) between 12 and 500
      and suspension_reason = btrim(suspension_reason)
      and suspension_reason !~ '[[:cntrl:]<>]'
    )
  ),
  suspended_at timestamptz,
  suspended_by_admin_id uuid,
  restored_at timestamptz,
  restored_by_admin_id uuid,
  restoration_reason text check (
    restoration_reason is null or (
      char_length(restoration_reason) between 12 and 500
      and restoration_reason = btrim(restoration_reason)
      and restoration_reason !~ '[[:cntrl:]<>]'
    )
  ),
  rename_required boolean not null default false,
  rename_reason text check (
    rename_reason is null or (
      char_length(rename_reason) between 12 and 500
      and rename_reason = btrim(rename_reason)
      and rename_reason !~ '[[:cntrl:]<>]'
    )
  ),
  rename_required_at timestamptz,
  rename_required_by_admin_id uuid,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_moderation_suspension_state_check check (
    (
      status = 'suspended'
      and suspension_reason is not null
      and suspended_at is not null
      and suspended_by_admin_id is not null
    )
    or (
      status = 'active'
      and suspension_reason is null
      and suspended_at is null
      and suspended_by_admin_id is null
    )
  ),
  constraint player_moderation_restore_state_check check (
    (restored_at is null and restored_by_admin_id is null and restoration_reason is null)
    or (
      restored_at is not null
      and restored_by_admin_id is not null
      and restoration_reason is not null
    )
  ),
  constraint player_moderation_rename_state_check check (
    (
      rename_required
      and rename_reason is not null
      and rename_required_at is not null
      and rename_required_by_admin_id is not null
    )
    or (
      not rename_required
      and rename_reason is null
      and rename_required_at is null
      and rename_required_by_admin_id is null
    )
  )
);

comment on table public.player_moderation_states is
  'One server-authoritative application moderation state per player. It has no wallet or blockchain authority.';

create table public.player_operation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  wallet_address_snapshot text not null check (
    char_length(wallet_address_snapshot) between 32 and 44
    and wallet_address_snapshot ~ '^[1-9A-HJ-NP-Za-km-z]+$'
  ),
  event_key text not null check (event_key in (
    'player.suspended',
    'player.restored',
    'player.position_reset',
    'player.rename_required',
    'player.rename_completed',
    'player.sessions_revoked',
    'player.access_denied.suspended',
    'player.access_denied.rename_required'
  )),
  actor_type text not null check (actor_type in ('admin', 'player', 'system')),
  actor_admin_user_id uuid,
  admin_session_id uuid,
  request_id text check (request_id is null or char_length(request_id) between 1 and 128),
  outcome text not null check (outcome in ('success', 'denied', 'error')),
  reason_code text check (reason_code is null or reason_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  reason text check (
    reason is null or (
      char_length(reason) between 12 and 500
      and reason = btrim(reason)
      and reason !~ '[[:cntrl:]<>]'
    )
  ),
  before_state jsonb not null default '{}'::jsonb check (jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null default '{}'::jsonb check (jsonb_typeof(after_state) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint player_operation_audit_actor_check check (
    (actor_type = 'admin' and actor_admin_user_id is not null and admin_session_id is not null)
    or (actor_type <> 'admin' and actor_admin_user_id is null and admin_session_id is null)
  )
);

comment on table public.player_operation_audit_logs is
  'Append-only Phase 5 player operations. It excludes credentials, tokens, signatures, RPC URLs, IP addresses, and user agents.';

create table public.admin_player_operation_rate_limits (
  admin_user_id uuid not null,
  scope text not null check (scope in (
    'suspend', 'restore', 'reset_position', 'require_rename', 'revoke_sessions'
  )),
  attempt_count integer not null check (attempt_count between 1 and 1000000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (admin_user_id, scope),
  constraint admin_player_operation_rate_limit_window_check check (
    window_expires_at > window_started_at
    and window_expires_at <= window_started_at + interval '10 minutes'
  )
);

create index player_profiles_display_name_search_idx
  on public.player_profiles (lower(display_name) text_pattern_ops);
create index player_profiles_last_entered_idx
  on public.player_profiles (last_entered_at desc, id);
create index player_moderation_status_idx
  on public.player_moderation_states (status, updated_at desc, player_profile_id);
create index player_moderation_rename_idx
  on public.player_moderation_states (updated_at desc, player_profile_id)
  where rename_required;
create index player_operation_audit_player_idx
  on public.player_operation_audit_logs (player_profile_id, created_at desc, id desc);
create index player_operation_audit_actor_idx
  on public.player_operation_audit_logs (actor_admin_user_id, created_at desc)
  where actor_admin_user_id is not null;
create unique index player_operation_audit_idempotency_idx
  on public.player_operation_audit_logs (actor_admin_user_id, request_id, event_key)
  where actor_admin_user_id is not null and request_id is not null and outcome = 'success';
create index admin_player_operation_rate_limits_expiry_idx
  on public.admin_player_operation_rate_limits (window_expires_at);

create trigger player_moderation_states_set_updated_at
before update on public.player_moderation_states
for each row execute function private.set_updated_at();

create or replace function private.protect_player_operation_audit_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_user in ('postgres', 'supabase_admin')
     and current_setting('starville.phase5_test_cleanup_profile_id', true) is not null
     and old.player_profile_id::text =
       current_setting('starville.phase5_test_cleanup_profile_id', true) then
    return old;
  end if;

  raise exception using errcode = '42501', message = 'PLAYER_OPERATION_AUDIT_APPEND_ONLY';
end;
$$;

-- Preserve the Phase 2 append-only rule while allowing the PostgreSQL-only cleanup
-- function below to remove only an exact, owner-approved hosted test run.
create or replace function private.protect_admin_audit_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_user in ('postgres', 'supabase_admin')
     and current_setting('starville.test_cleanup_run_id', true) is not null
     and (
       old.metadata ->> 'testRunId' = current_setting('starville.test_cleanup_run_id', true)
       or old.request_id = 'phase2-test:' || current_setting('starville.test_cleanup_run_id', true)
     ) then
    return old;
  end if;

  if tg_op = 'DELETE'
     and current_user in ('postgres', 'supabase_admin')
     and current_setting('starville.phase5_test_cleanup_run_id', true) is not null
     and current_setting('starville.phase5_test_cleanup_profile_id', true) is not null
     and (
       old.request_id like
         'phase5-test:' || current_setting('starville.phase5_test_cleanup_run_id', true) || ':%'
       or old.metadata ->> 'playerProfileId' =
         current_setting('starville.phase5_test_cleanup_profile_id', true)
     ) then
    return old;
  end if;

  raise exception 'Administrator audit logs are append-only';
end;
$$;

-- Preserve the Phase 3 wallet-event append-only rule while allowing deletion of
-- only the exact wallet owned by the private hosted-test cleanup transaction.
create or replace function private.protect_wallet_access_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_user in ('postgres', 'supabase_admin')
     and current_setting('starville.phase5_test_cleanup_wallet_address', true) is not null
     and old.wallet_address =
       current_setting('starville.phase5_test_cleanup_wallet_address', true) then
    return old;
  end if;

  raise exception 'Wallet access events are append-only';
end;
$$;

create trigger player_operation_audit_logs_append_only
before update or delete on public.player_operation_audit_logs
for each row execute function private.protect_player_operation_audit_log();

create or replace function private.create_player_moderation_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_moderation_states (player_profile_id)
  values (new.id)
  on conflict (player_profile_id) do nothing;
  return new;
end;
$$;

create trigger player_profiles_create_moderation_state
after insert on public.player_profiles
for each row execute function private.create_player_moderation_state();

insert into public.player_moderation_states (player_profile_id)
select profile.id
from public.player_profiles as profile
on conflict (player_profile_id) do nothing;

alter table public.player_moderation_states enable row level security;
alter table public.player_operation_audit_logs enable row level security;
alter table public.admin_player_operation_rate_limits enable row level security;

revoke all on table public.player_moderation_states from anon, authenticated, service_role;
revoke all on table public.player_operation_audit_logs from anon, authenticated, service_role;
revoke all on table public.admin_player_operation_rate_limits from anon, authenticated, service_role;

create or replace function private.claim_admin_player_operation_rate_limit(
  p_admin_user_id uuid,
  p_scope text,
  p_limit integer
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
  if p_admin_user_id is null
     or p_scope is null
     or p_scope not in ('suspend', 'restore', 'reset_position', 'require_rename', 'revoke_sessions')
     or p_limit is null
     or p_limit not between 1 and 60 then
    raise exception using errcode = '22023', message = 'INVALID_ADMIN_PLAYER_RATE_LIMIT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'admin-player-rate:' || p_admin_user_id::text || ':' || p_scope,
      0
    )
  );

  insert into public.admin_player_operation_rate_limits (
    admin_user_id, scope, attempt_count, window_started_at, window_expires_at, updated_at
  ) values (
    p_admin_user_id, p_scope, 1, now(), now() + interval '1 minute', now()
  )
  on conflict (admin_user_id, scope) do update
  set attempt_count = case
        when admin_player_operation_rate_limits.window_expires_at <= now() then 1
        else admin_player_operation_rate_limits.attempt_count + 1
      end,
      window_started_at = case
        when admin_player_operation_rate_limits.window_expires_at <= now() then now()
        else admin_player_operation_rate_limits.window_started_at
      end,
      window_expires_at = case
        when admin_player_operation_rate_limits.window_expires_at <= now()
          then now() + interval '1 minute'
        else admin_player_operation_rate_limits.window_expires_at
      end,
      updated_at = now()
  where admin_player_operation_rate_limits.window_expires_at <= now()
     or admin_player_operation_rate_limits.attempt_count < p_limit
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function private.player_entry_json(
  profile public.player_profiles,
  moderation public.player_moderation_states
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'loaded',
    'entryState', case
      when moderation.status = 'suspended' then 'suspended'
      when moderation.rename_required then 'rename_required'
      else 'active'
    end,
    'profile', private.player_profile_json(profile) - 'status'
  );
$$;

create or replace function private.player_action_result(
  profile public.player_profiles,
  moderation public.player_moderation_states,
  p_revoked_session_count integer,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'updated',
    'playerId', profile.id,
    'moderationStatus', moderation.status,
    'renameRequired', moderation.rename_required,
    'moderationVersion', moderation.version,
    'gameStateVersion', profile.game_state_version,
    'revokedSessionCount', p_revoked_session_count,
    'replayed', p_replayed
  );
$$;

create or replace function private.revoke_player_access_sessions(
  p_profile public.player_profiles,
  p_request_id text,
  p_reason_code text
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  revoked_count integer;
begin
  with revoked as (
    update public.wallet_access_sessions
    set status = 'revoked',
        revoked_at = now(),
        revoke_reason = 'administrative',
        recheck_claim_id = null,
        recheck_claimed_at = null
    where wallet_address = p_profile.wallet_address
      and status = 'active'
      and expires_at > now()
    returning *
  )
  insert into public.wallet_access_events (
    wallet_address,
    event,
    result,
    reason_code,
    token_gate_config_id,
    config_version,
    observed_balance_raw,
    required_balance_raw,
    checked_slot,
    session_id,
    request_id,
    metadata
  )
  select
    revoked.wallet_address,
    'wallet.access.revoked',
    'success',
    p_reason_code,
    revoked.token_gate_config_id,
    revoked.config_version_snapshot,
    revoked.observed_balance_raw,
    revoked.required_balance_raw,
    revoked.checked_slot,
    revoked.id,
    p_request_id,
    jsonb_build_object('playerProfileId', p_profile.id)
  from revoked;

  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$$;

create or replace function public.load_player_entry_state(
  p_wallet_address text,
  p_request_id text default null,
  p_touch_entry boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  denied_event text;
begin
  if p_wallet_address is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or (p_request_id is not null and char_length(p_request_id) not between 1 and 128)
     or p_touch_entry is null then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_IDENTITY';
  end if;

  select p as profile_row, m as moderation_row
  into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address
  for update of p, m;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;

  if moderation.status = 'active' and not moderation.rename_required then
    if p_touch_entry then
      update public.player_profiles
      set last_entered_at = now()
      where id = profile.id
      returning * into profile;
    end if;
  else
    if moderation.status = 'suspended' then
      perform private.revoke_player_access_sessions(
        profile,
        coalesce(p_request_id, 'player-entry-enforcement'),
        'PLAYER_SUSPENDED'
      );
    end if;

    denied_event := case
      when moderation.status = 'suspended' then 'player.access_denied.suspended'
      else 'player.access_denied.rename_required'
    end;

    if not exists (
      select 1
      from public.player_operation_audit_logs as audit
      where audit.player_profile_id = profile.id
        and audit.event_key = denied_event
        and audit.created_at > now() - interval '5 minutes'
    ) then
      insert into public.player_operation_audit_logs (
        player_profile_id,
        wallet_address_snapshot,
        event_key,
        actor_type,
        request_id,
        outcome,
        reason_code,
        metadata
      ) values (
        profile.id,
        profile.wallet_address,
        denied_event,
        'system',
        p_request_id,
        'denied',
        case
          when moderation.status = 'suspended' then 'PLAYER_SUSPENDED'
          else 'PLAYER_RENAME_REQUIRED'
        end,
        jsonb_build_object('moderationVersion', moderation.version)
      );
    end if;
  end if;

  return private.player_entry_json(profile, moderation);
end;
$$;

-- Keep the Phase 4 function name safe for any trusted caller while returning the
-- Phase 5 entry state. The API uses load_player_entry_state directly.
create or replace function public.load_player_profile(p_wallet_address text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  entry jsonb;
begin
  entry := public.load_player_entry_state(p_wallet_address, null, true);
  if entry ->> 'status' <> 'loaded' then
    return entry;
  end if;
  if entry ->> 'entryState' <> 'active' then
    return jsonb_build_object('status', entry ->> 'entryState');
  end if;
  return (entry -> 'profile') || jsonb_build_object('status', 'loaded');
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
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
begin
  if p_wallet_address is null
     or p_display_name is null
     or p_appearance_preset is null
     or p_request_id is null
     or p_rate_limit is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or char_length(p_display_name) not between 3 and 20
     or p_display_name <> btrim(p_display_name)
     or p_display_name !~ '^[[:alnum:] _-]+$'
     or p_appearance_preset not in ('moss', 'marigold', 'moonberry', 'river')
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 30 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_PROFILE_INPUT';
  end if;

  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address
  for update of p, m;

  if found then
    profile := selected_rows.profile_row;
    moderation := selected_rows.moderation_row;
    if moderation.status = 'suspended' then
      return jsonb_build_object('status', 'suspended');
    end if;
    if moderation.rename_required then
      return jsonb_build_object('status', 'rename_required');
    end if;
    return private.player_profile_json(profile);
  end if;

  if not private.claim_player_rate_limit(
    'profile_write', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.player_profiles (wallet_address, display_name, appearance_preset)
  values (p_wallet_address, p_display_name, p_appearance_preset)
  on conflict (wallet_address) do nothing;

  select p as profile_row, m as moderation_row into strict selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address;

  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;

  if moderation.status = 'suspended' then
    return jsonb_build_object('status', 'suspended');
  end if;
  if moderation.rename_required then
    return jsonb_build_object('status', 'rename_required');
  end if;
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
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
begin
  if p_wallet_address is null
     or p_request_id is null
     or p_rate_limit is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
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

  select p as profile_row, m as moderation_row
  into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address
  for update of p, m;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;

  if moderation.status = 'suspended' then
    return jsonb_build_object('status', 'suspended');
  end if;

  if moderation.rename_required then
    return jsonb_build_object('status', 'rename_required');
  end if;

  update public.player_profiles
  set display_name = coalesce(p_display_name, display_name),
      appearance_preset = coalesce(p_appearance_preset, appearance_preset)
  where id = profile.id
  returning * into profile;

  return private.player_profile_json(profile);
end;
$$;

create or replace function public.complete_required_player_rename(
  p_wallet_address text,
  p_display_name text,
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
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  previous_name text;
begin
  if p_wallet_address is null
     or p_display_name is null
     or p_request_id is null
     or p_rate_limit is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or char_length(p_display_name) not between 3 and 20
     or p_display_name <> btrim(p_display_name)
     or p_display_name !~ '^[[:alnum:] _-]+$'
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 30 then
    raise exception using errcode = '22023', message = 'INVALID_REQUIRED_PLAYER_RENAME';
  end if;

  if not private.claim_player_rate_limit(
    'profile_write', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address
  for update of p, m;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;

  if moderation.status = 'suspended' then
    return jsonb_build_object('status', 'suspended');
  end if;

  if not moderation.rename_required then
    return jsonb_build_object('status', 'rename_not_required');
  end if;

  if p_display_name = profile.display_name then
    return jsonb_build_object('status', 'name_unchanged');
  end if;

  previous_name := profile.display_name;
  update public.player_profiles
  set display_name = p_display_name
  where id = profile.id
  returning * into profile;

  update public.player_moderation_states
  set rename_required = false,
      rename_reason = null,
      rename_required_at = null,
      rename_required_by_admin_id = null,
      version = version + 1
  where player_profile_id = profile.id
  returning * into moderation;

  insert into public.player_operation_audit_logs (
    player_profile_id,
    wallet_address_snapshot,
    event_key,
    actor_type,
    request_id,
    outcome,
    before_state,
    after_state
  ) values (
    profile.id,
    profile.wallet_address,
    'player.rename_completed',
    'player',
    p_request_id,
    'success',
    jsonb_build_object('displayName', previous_name, 'renameRequired', true),
    jsonb_build_object('displayName', profile.display_name, 'renameRequired', false)
  );

  return private.player_profile_json(profile);
end;
$$;

create or replace function public.save_player_game_state(
  p_wallet_address text,
  p_map_id text,
  p_position_x numeric,
  p_position_y numeric,
  p_facing_direction text,
  p_expected_game_state_version integer,
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
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
begin
  if p_wallet_address is null
     or p_map_id is null
     or p_facing_direction is null
     or p_expected_game_state_version is null
     or p_expected_game_state_version < 1
     or p_request_id is null
     or p_rate_limit is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
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

  select p as profile_row, m as moderation_row
  into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address
  for update of p, m;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;

  if moderation.status = 'suspended' then
    return jsonb_build_object('status', 'suspended');
  end if;

  if moderation.rename_required then
    return jsonb_build_object('status', 'rename_required');
  end if;

  if profile.game_state_version <> p_expected_game_state_version then
    return jsonb_build_object('status', 'game_state_version_conflict');
  end if;

  update public.player_profiles
  set current_map_id = p_map_id,
      safe_position_x = round(p_position_x, 4),
      safe_position_y = round(p_position_y, 4),
      facing_direction = p_facing_direction,
      game_state_version = game_state_version + 1
  where id = profile.id
  returning * into profile;

  return private.player_profile_json(profile);
end;
$$;

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
     or p_map_id not in ('all', 'lantern-square')
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

create or replace function public.get_admin_player_detail(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_environment_key text,
  p_network text,
  p_player_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  active_sessions integer;
  latest_session_status text;
  latest_session_at timestamptz;
  authorization_result jsonb;
  can_read_player_audit boolean;
  can_read_wallet boolean;
begin
  if p_player_profile_id is null
     or p_environment_key is null
     or char_length(p_environment_key) not between 1 and 32
     or p_network is null
     or p_network not in ('solana:devnet', 'solana:mainnet-beta') then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_DETAIL_QUERY';
  end if;

  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'players.read'
  );
  authorization_result := private.evaluate_admin_authorization(
    p_user_id, p_auth_session_id, p_assurance_level
  );
  can_read_player_audit :=
    (authorization_result -> 'context' -> 'permissionKeys') ? 'player_audit.read';
  can_read_wallet :=
    (authorization_result -> 'context' -> 'permissionKeys') ? 'wallets.read';

  select p as profile_row, m as moderation_row
  into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.id = p_player_profile_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;

  select count(*)::integer
  into active_sessions
  from public.wallet_access_sessions as session
  join public.token_gate_configs as config on config.id = session.token_gate_config_id
  where session.wallet_address = profile.wallet_address
    and session.status = 'active'
    and session.expires_at > now()
    and config.enabled
    and config.validation_state = 'validated'
    and config.environment_key = p_environment_key
    and config.network = p_network
    and session.config_version_snapshot = config.config_version;

  select
    case
      when session.status = 'active' and session.expires_at <= now() then 'expired'
      when session.status = 'active' and (
        not config.enabled
        or config.validation_state <> 'validated'
        or session.config_version_snapshot <> config.config_version
      ) then 'configuration_changed'
      else session.status
    end,
    session.created_at
  into latest_session_status, latest_session_at
  from public.wallet_access_sessions as session
  join public.token_gate_configs as config on config.id = session.token_gate_config_id
  where session.wallet_address = profile.wallet_address
    and config.environment_key = p_environment_key
    and config.network = p_network
  order by session.created_at desc, session.id desc
  limit 1;

  return jsonb_build_object(
    'status', 'loaded',
    'profile', (private.player_profile_json(profile) - 'status') || jsonb_build_object(
      'walletAddress', case when can_read_wallet then profile.wallet_address else null end,
      'gameStateVersion', profile.game_state_version
    ),
    'moderation', jsonb_build_object(
      'status', moderation.status,
      'suspensionReason', case when can_read_player_audit then moderation.suspension_reason else null end,
      'suspendedAt', moderation.suspended_at,
      'suspendedByAdminId', case when can_read_player_audit then moderation.suspended_by_admin_id else null end,
      'restoredAt', moderation.restored_at,
      'restoredByAdminId', case when can_read_player_audit then moderation.restored_by_admin_id else null end,
      'restorationReason', case when can_read_player_audit then moderation.restoration_reason else null end,
      'renameRequired', moderation.rename_required,
      'renameReason', case when can_read_player_audit then moderation.rename_reason else null end,
      'renameRequiredAt', moderation.rename_required_at,
      'renameRequiredByAdminId', case when can_read_player_audit then moderation.rename_required_by_admin_id else null end,
      'version', moderation.version,
      'updatedAt', moderation.updated_at
    ),
    'access', jsonb_build_object(
      'activeSessions', active_sessions,
      'latestSessionStatus', latest_session_status,
      'latestSessionAt', latest_session_at
    )
  );
end;
$$;

create or replace function public.get_admin_player_activity(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_environment_key text,
  p_network text,
  p_player_profile_id uuid,
  p_limit integer
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
begin
  if p_player_profile_id is null
     or p_environment_key is null
     or char_length(p_environment_key) not between 1 and 32
     or p_network is null
     or p_network not in ('solana:devnet', 'solana:mainnet-beta')
     or p_limit is null
     or p_limit not between 1 and 100 then
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

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  with visible as (
    select audit.*
    from public.player_operation_audit_logs as audit
    where audit.player_profile_id = p_player_profile_id
    order by audit.created_at desc, audit.id desc
    limit p_limit
  )
  select jsonb_build_object(
    'status', 'loaded',
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'event', event_key,
          'actorType', actor_type,
          'actorAdminUserId', actor_admin_user_id,
          'requestId', request_id,
          'outcome', outcome,
          'reasonCode', reason_code,
          'reason', reason,
          'beforeState', before_state,
          'afterState', after_state,
          'metadata', metadata,
          'createdAt', created_at
        ) order by created_at desc, id desc
      ),
      '[]'::jsonb
    ),
    'nextCursor', null
  ) into result
  from visible;

  select result || jsonb_build_object(
    'accessEvents',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', access_event.id,
          'event', access_event.event,
          'result', access_event.event_result,
          'reasonCode', access_event.reason_code,
          'createdAt', access_event.created_at
        ) order by access_event.created_at desc, access_event.id desc
      ),
      '[]'::jsonb
    )
  ) into result
  from (
    select
      event.id,
      event.event,
      event.result as event_result,
      event.reason_code,
      event.created_at
    from public.wallet_access_events as event
    join public.token_gate_configs as config on config.id = event.token_gate_config_id
    where event.wallet_address = player_wallet_address
      and config.environment_key = p_environment_key
      and config.network = p_network
    order by event.created_at desc, event.id desc
    limit least(p_limit, 25)
  ) as access_event;

  return result;
end;
$$;

create or replace function public.get_admin_operations_summary(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_environment_key text,
  p_network text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config public.token_gate_configs%rowtype;
begin
  if p_environment_key is null
     or char_length(p_environment_key) not between 1 and 32
     or p_network is null
     or p_network not in ('solana:devnet', 'solana:mainnet-beta') then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS_SUMMARY_QUERY';
  end if;

  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'operations.read'
  );

  select * into config
  from public.token_gate_configs
  where environment_key = p_environment_key and network = p_network;

  if not found then
    raise exception using errcode = 'P0002', message = 'TOKEN_GATE_CONFIG_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'players', jsonb_build_object(
      'total', (select count(*)::integer from public.player_profiles),
      'active', (
        select count(*)::integer from public.player_moderation_states where status = 'active'
      ),
      'suspended', (
        select count(*)::integer from public.player_moderation_states where status = 'suspended'
      ),
      'renameRequired', (
        select count(*)::integer from public.player_moderation_states where rename_required
      ),
      'createdLast24Hours', (
        select count(*)::integer
        from public.player_profiles
        where created_at >= now() - interval '24 hours'
      ),
      'enteredLast24Hours', (
        select count(*)::integer
        from public.player_profiles
        where last_entered_at >= now() - interval '24 hours'
      )
    ),
    'access', jsonb_build_object(
      'activeSessions', (
        select count(*)::integer
        from public.wallet_access_sessions as session
        where session.status = 'active'
          and session.expires_at > now()
          and session.token_gate_config_id = config.id
          and config.enabled
          and config.validation_state = 'validated'
          and session.config_version_snapshot = config.config_version
      ),
      'definition', 'Unexpired, unrevoked sessions valid for the current token config'
    ),
    'tokenAccess', jsonb_build_object(
      'enabled', config.enabled,
      'network', config.network,
      'symbol', config.symbol,
      'requiredAmount', config.required_display_amount,
      'configVersion', config.config_version,
      'validationState', config.validation_state
    )
  );
end;
$$;

create or replace function private.valid_player_operation_reason(p_reason text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_reason is not null
    and char_length(p_reason) between 12 and 500
    and p_reason = btrim(p_reason)
    and p_reason !~ '[[:cntrl:]<>]';
$$;

create or replace function private.record_player_admin_operation(
  p_profile public.player_profiles,
  p_event_key text,
  p_actor_user_id uuid,
  p_admin_session_id uuid,
  p_request_id text,
  p_outcome text,
  p_reason_code text,
  p_reason text,
  p_before_state jsonb,
  p_after_state jsonb,
  p_metadata jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.player_operation_audit_logs (
    player_profile_id,
    wallet_address_snapshot,
    event_key,
    actor_type,
    actor_admin_user_id,
    admin_session_id,
    request_id,
    outcome,
    reason_code,
    reason,
    before_state,
    after_state,
    metadata
  ) values (
    p_profile.id,
    p_profile.wallet_address,
    p_event_key,
    'admin',
    p_actor_user_id,
    p_admin_session_id,
    p_request_id,
    p_outcome,
    p_reason_code,
    p_reason,
    p_before_state,
    p_after_state,
    p_metadata
  );

  insert into public.admin_audit_logs (
    event_key,
    actor_user_id,
    admin_session_id,
    request_id,
    outcome,
    reason_code,
    metadata
  ) values (
    p_event_key,
    p_actor_user_id,
    p_admin_session_id,
    p_request_id,
    p_outcome,
    p_reason_code,
    jsonb_build_object(
      'playerProfileId', p_profile.id,
      'reason', p_reason,
      'before', p_before_state,
      'after', p_after_state
    ) || p_metadata
  );
end;
$$;

create or replace function private.replayed_player_action(
  p_actor_user_id uuid,
  p_player_profile_id uuid,
  p_request_id text,
  p_event_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  existing_target uuid;
begin
  select audit.player_profile_id into existing_target
  from public.player_operation_audit_logs as audit
  where audit.actor_admin_user_id = p_actor_user_id
    and audit.request_id = p_request_id
    and audit.event_key = p_event_key
    and audit.outcome = 'success'
  limit 1;

  if not found then
    return false;
  end if;

  if existing_target <> p_player_profile_id then
    raise exception using errcode = '23505', message = 'PLAYER_ACTION_IDEMPOTENCY_CONFLICT';
  end if;

  return true;
end;
$$;

create or replace function public.admin_suspend_player(
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
  previous jsonb;
  current_state jsonb;
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
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_SUSPENSION';
  end if;

  trusted_admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'players.suspend'
  );

  if not private.claim_admin_player_operation_rate_limit(
    p_user_id, 'suspend', p_rate_limit
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
    p_user_id, p_player_profile_id, p_request_id, 'player.suspended'
  ) then
    return private.player_action_result(profile, moderation, 0, true);
  end if;

  if moderation.version <> p_expected_version then
    perform private.record_player_admin_operation(
      profile, 'player.suspended', p_user_id, trusted_admin_session_id, p_request_id,
      'denied', 'PLAYER_VERSION_CONFLICT', p_reason,
      jsonb_build_object('status', moderation.status, 'version', moderation.version),
      jsonb_build_object('status', moderation.status, 'version', moderation.version),
      jsonb_build_object('expectedVersion', p_expected_version)
    );
    return jsonb_build_object('status', 'version_conflict');
  end if;

  if moderation.status = 'suspended' then
    perform private.record_player_admin_operation(
      profile,
      'player.suspended',
      p_user_id,
      trusted_admin_session_id,
      p_request_id,
      'denied',
      'PLAYER_ALREADY_SUSPENDED',
      p_reason,
      jsonb_build_object('status', moderation.status, 'version', moderation.version),
      jsonb_build_object('status', moderation.status, 'version', moderation.version),
      '{}'::jsonb
    );
    return jsonb_build_object('status', 'state_conflict', 'code', 'PLAYER_ALREADY_SUSPENDED');
  end if;

  previous := jsonb_build_object(
    'status', moderation.status,
    'renameRequired', moderation.rename_required,
    'version', moderation.version
  );

  update public.player_moderation_states
  set status = 'suspended',
      suspension_reason = p_reason,
      suspended_at = now(),
      suspended_by_admin_id = p_user_id,
      restored_at = null,
      restored_by_admin_id = null,
      restoration_reason = null,
      version = version + 1
  where player_profile_id = profile.id
  returning * into moderation;

  revoked_count := private.revoke_player_access_sessions(
    profile, p_request_id, 'PLAYER_SUSPENDED'
  );
  current_state := jsonb_build_object(
    'status', moderation.status,
    'renameRequired', moderation.rename_required,
    'version', moderation.version
  );

  perform private.record_player_admin_operation(
    profile,
    'player.suspended',
    p_user_id,
    trusted_admin_session_id,
    p_request_id,
    'success',
    null,
    p_reason,
    previous,
    current_state,
    jsonb_build_object('revokedSessionCount', revoked_count)
  );

  return private.player_action_result(profile, moderation, revoked_count, false);
end;
$$;

create or replace function public.admin_restore_player(
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
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_RESTORATION';
  end if;

  trusted_admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'players.suspend'
  );

  if not private.claim_admin_player_operation_rate_limit(
    p_user_id, 'restore', p_rate_limit
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
    p_user_id, p_player_profile_id, p_request_id, 'player.restored'
  ) then
    return private.player_action_result(profile, moderation, 0, true);
  end if;

  if moderation.version <> p_expected_version then
    perform private.record_player_admin_operation(
      profile, 'player.restored', p_user_id, trusted_admin_session_id, p_request_id,
      'denied', 'PLAYER_VERSION_CONFLICT', p_reason,
      jsonb_build_object('status', moderation.status, 'version', moderation.version),
      jsonb_build_object('status', moderation.status, 'version', moderation.version),
      jsonb_build_object('expectedVersion', p_expected_version)
    );
    return jsonb_build_object('status', 'version_conflict');
  end if;

  if moderation.status <> 'suspended' then
    perform private.record_player_admin_operation(
      profile, 'player.restored', p_user_id, trusted_admin_session_id, p_request_id,
      'denied', 'PLAYER_NOT_SUSPENDED', p_reason,
      jsonb_build_object('status', moderation.status, 'version', moderation.version),
      jsonb_build_object('status', moderation.status, 'version', moderation.version),
      '{}'::jsonb
    );
    return jsonb_build_object('status', 'state_conflict', 'code', 'PLAYER_NOT_SUSPENDED');
  end if;

  previous := jsonb_build_object(
    'status', moderation.status,
    'renameRequired', moderation.rename_required,
    'version', moderation.version
  );

  update public.player_moderation_states
  set status = 'active',
      suspension_reason = null,
      suspended_at = null,
      suspended_by_admin_id = null,
      restored_at = now(),
      restored_by_admin_id = p_user_id,
      restoration_reason = p_reason,
      version = version + 1
  where player_profile_id = profile.id
  returning * into moderation;

  revoked_count := private.revoke_player_access_sessions(
    profile, p_request_id, 'PLAYER_RESTORED_REAUTH_REQUIRED'
  );

  perform private.record_player_admin_operation(
    profile, 'player.restored', p_user_id, trusted_admin_session_id, p_request_id,
    'success', null, p_reason, previous,
    jsonb_build_object(
      'status', moderation.status,
      'renameRequired', moderation.rename_required,
      'version', moderation.version
    ),
    jsonb_build_object(
      'sessionCreated', false,
      'revokedSessionCount', revoked_count
    )
  );

  return private.player_action_result(profile, moderation, revoked_count, false);
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

  previous := jsonb_build_object(
    'mapId', profile.current_map_id,
    'x', profile.safe_position_x,
    'y', profile.safe_position_y,
    'facingDirection', profile.facing_direction,
    'gameStateVersion', profile.game_state_version
  );

  update public.player_profiles
  set current_map_id = 'lantern-square',
      safe_position_x = 12,
      safe_position_y = 7.5,
      facing_direction = 'south',
      game_state_version = game_state_version + 1
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
      'x', profile.safe_position_x,
      'y', profile.safe_position_y,
      'facingDirection', profile.facing_direction,
      'gameStateVersion', profile.game_state_version
    ),
    jsonb_build_object(
      'spawnId', 'lantern-square.default',
      'revokedSessionCount', revoked_count
    )
  );

  return private.player_action_result(profile, moderation, revoked_count, false);
end;
$$;

create or replace function public.admin_require_player_rename(
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
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_RENAME_REQUIREMENT';
  end if;

  trusted_admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'players.require_rename'
  );

  if not private.claim_admin_player_operation_rate_limit(
    p_user_id, 'require_rename', p_rate_limit
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
    p_user_id, p_player_profile_id, p_request_id, 'player.rename_required'
  ) then
    return private.player_action_result(profile, moderation, 0, true);
  end if;

  if moderation.version <> p_expected_version then
    perform private.record_player_admin_operation(
      profile, 'player.rename_required', p_user_id, trusted_admin_session_id, p_request_id,
      'denied', 'PLAYER_VERSION_CONFLICT', p_reason,
      jsonb_build_object('renameRequired', moderation.rename_required, 'version', moderation.version),
      jsonb_build_object('renameRequired', moderation.rename_required, 'version', moderation.version),
      jsonb_build_object('expectedVersion', p_expected_version)
    );
    return jsonb_build_object('status', 'version_conflict');
  end if;

  if moderation.rename_required then
    perform private.record_player_admin_operation(
      profile, 'player.rename_required', p_user_id, trusted_admin_session_id, p_request_id,
      'denied', 'PLAYER_RENAME_ALREADY_REQUIRED', p_reason,
      jsonb_build_object('renameRequired', true, 'version', moderation.version),
      jsonb_build_object('renameRequired', true, 'version', moderation.version),
      '{}'::jsonb
    );
    return jsonb_build_object(
      'status', 'state_conflict', 'code', 'PLAYER_RENAME_ALREADY_REQUIRED'
    );
  end if;

  previous := jsonb_build_object(
    'status', moderation.status,
    'displayName', profile.display_name,
    'renameRequired', moderation.rename_required,
    'version', moderation.version
  );

  update public.player_moderation_states
  set rename_required = true,
      rename_reason = p_reason,
      rename_required_at = now(),
      rename_required_by_admin_id = p_user_id,
      version = version + 1
  where player_profile_id = profile.id
  returning * into moderation;

  revoked_count := private.revoke_player_access_sessions(
    profile, p_request_id, 'PLAYER_RENAME_REQUIRED'
  );

  perform private.record_player_admin_operation(
    profile, 'player.rename_required', p_user_id, trusted_admin_session_id, p_request_id,
    'success', null, p_reason, previous,
    jsonb_build_object(
      'status', moderation.status,
      'displayName', profile.display_name,
      'renameRequired', moderation.rename_required,
      'version', moderation.version
    ),
    jsonb_build_object('revokedSessionCount', revoked_count)
  );

  return private.player_action_result(profile, moderation, revoked_count, false);
end;
$$;

create or replace function public.admin_revoke_player_sessions(
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
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_SESSION_REVOCATION';
  end if;

  trusted_admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'players.manage_sessions'
  );

  if not private.claim_admin_player_operation_rate_limit(
    p_user_id, 'revoke_sessions', p_rate_limit
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
    p_user_id, p_player_profile_id, p_request_id, 'player.sessions_revoked'
  ) then
    return private.player_action_result(profile, moderation, 0, true);
  end if;

  if moderation.version <> p_expected_version then
    perform private.record_player_admin_operation(
      profile, 'player.sessions_revoked', p_user_id, trusted_admin_session_id, p_request_id,
      'denied', 'PLAYER_VERSION_CONFLICT', p_reason,
      jsonb_build_object('version', moderation.version),
      jsonb_build_object('version', moderation.version),
      jsonb_build_object('expectedVersion', p_expected_version)
    );
    return jsonb_build_object('status', 'version_conflict');
  end if;

  previous := jsonb_build_object(
    'status', moderation.status,
    'renameRequired', moderation.rename_required,
    'version', moderation.version
  );

  revoked_count := private.revoke_player_access_sessions(
    profile, p_request_id, 'ADMINISTRATIVE_REVOCATION'
  );

  update public.player_moderation_states
  set version = version + 1
  where player_profile_id = profile.id
  returning * into moderation;

  perform private.record_player_admin_operation(
    profile, 'player.sessions_revoked', p_user_id, trusted_admin_session_id, p_request_id,
    'success', null, p_reason, previous,
    jsonb_build_object(
      'status', moderation.status,
      'renameRequired', moderation.rename_required,
      'version', moderation.version
    ),
    jsonb_build_object('revokedSessionCount', revoked_count)
  );

  return private.player_action_result(profile, moderation, revoked_count, false);
end;
$$;

-- Maintenance-only cleanup for the exact temporary Phase 5 hosted fixture. It has
-- no API/service-role grant and validates the profile/wallet pair before deleting.
create or replace function private.cleanup_phase5_test_player(
  p_test_run_id uuid,
  p_player_profile_id uuid,
  p_wallet_address text,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  deleted_player_audits integer;
  deleted_admin_audits integer;
begin
  if p_test_run_id is null
     or p_player_profile_id is null
     or p_wallet_address is null
     or p_admin_user_id is null
     or not exists (
       select 1
       from public.player_profiles as profile
       where profile.id = p_player_profile_id
         and profile.wallet_address = p_wallet_address
         and profile.display_name like 'P5Test%'
     ) then
    raise exception using errcode = '22023', message = 'INVALID_PHASE5_TEST_CLEANUP_TARGET';
  end if;

  perform set_config('starville.phase5_test_cleanup_run_id', p_test_run_id::text, true);
  perform set_config(
    'starville.phase5_test_cleanup_profile_id', p_player_profile_id::text, true
  );
  perform set_config(
    'starville.phase5_test_cleanup_wallet_address', p_wallet_address, true
  );

  delete from public.admin_audit_logs
  where request_id like 'phase5-test:' || p_test_run_id::text || ':%'
     or metadata ->> 'playerProfileId' = p_player_profile_id::text;
  get diagnostics deleted_admin_audits = row_count;

  delete from public.player_operation_audit_logs
  where player_profile_id = p_player_profile_id;
  get diagnostics deleted_player_audits = row_count;

  delete from public.wallet_access_events where wallet_address = p_wallet_address;
  delete from public.wallet_access_sessions where wallet_address = p_wallet_address;
  delete from public.wallet_auth_challenges where wallet_address = p_wallet_address;
  delete from public.wallet_auth_rate_limits where subject_key = p_wallet_address;
  delete from public.player_api_rate_limits where subject_key = p_wallet_address;
  delete from public.player_moderation_states where player_profile_id = p_player_profile_id;
  delete from public.player_profiles where id = p_player_profile_id;
  delete from public.admin_player_operation_rate_limits where admin_user_id = p_admin_user_id;

  return jsonb_build_object(
    'playerAuditRows', deleted_player_audits,
    'adminAuditRows', deleted_admin_audits
  );
end;
$$;

revoke all on function private.protect_player_operation_audit_log()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_admin_audit_log()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_wallet_access_event()
  from public, anon, authenticated, service_role;
revoke all on function private.create_player_moderation_state()
  from public, anon, authenticated, service_role;
revoke all on function private.set_player_profile_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function private.claim_admin_player_operation_rate_limit(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.player_entry_json(
  public.player_profiles, public.player_moderation_states
) from public, anon, authenticated, service_role;
revoke all on function private.player_action_result(
  public.player_profiles, public.player_moderation_states, integer, boolean
) from public, anon, authenticated, service_role;
revoke all on function private.revoke_player_access_sessions(
  public.player_profiles, text, text
) from public, anon, authenticated, service_role;
revoke all on function private.valid_player_operation_reason(text)
  from public, anon, authenticated, service_role;
revoke all on function private.record_player_admin_operation(
  public.player_profiles, text, uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.replayed_player_action(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_phase5_test_player(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.load_player_entry_state(text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.load_player_profile(text)
  from public, anon, authenticated, service_role;
revoke all on function public.update_player_profile(text, text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_required_player_rename(text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.save_player_game_state(
  text, text, numeric, numeric, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.save_player_game_state(
  text, text, numeric, numeric, text, integer, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.list_admin_players(
  uuid, uuid, text, text, text, integer, integer, text, text, text, text, integer, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_player_detail(uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_player_activity(
  uuid, uuid, text, text, text, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_operations_summary(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_suspend_player(
  uuid, uuid, text, uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.admin_restore_player(
  uuid, uuid, text, uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.admin_reset_player_position(
  uuid, uuid, text, uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.admin_require_player_rename(
  uuid, uuid, text, uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.admin_revoke_player_sessions(
  uuid, uuid, text, uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;

grant execute on function public.load_player_entry_state(text, text, boolean) to service_role;
grant execute on function public.load_player_profile(text) to service_role;
grant execute on function public.update_player_profile(text, text, text, text, integer)
  to service_role;
grant execute on function public.complete_required_player_rename(text, text, text, integer)
  to service_role;
grant execute on function public.save_player_game_state(
  text, text, numeric, numeric, text, integer, text, integer
) to service_role;
grant execute on function public.list_admin_players(
  uuid, uuid, text, text, text, integer, integer, text, text, text, text, integer, text, text
) to service_role;
grant execute on function public.get_admin_player_detail(uuid, uuid, text, text, text, uuid)
  to service_role;
grant execute on function public.get_admin_player_activity(
  uuid, uuid, text, text, text, uuid, integer
) to service_role;
grant execute on function public.get_admin_operations_summary(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.admin_suspend_player(
  uuid, uuid, text, uuid, integer, text, text, integer
) to service_role;
grant execute on function public.admin_restore_player(
  uuid, uuid, text, uuid, integer, text, text, integer
) to service_role;
grant execute on function public.admin_reset_player_position(
  uuid, uuid, text, uuid, integer, text, text, integer
) to service_role;
grant execute on function public.admin_require_player_rename(
  uuid, uuid, text, uuid, integer, text, text, integer
) to service_role;
grant execute on function public.admin_revoke_player_sessions(
  uuid, uuid, text, uuid, integer, text, text, integer
) to service_role;
