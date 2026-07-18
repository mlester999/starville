-- Starville Phase 8B: server-authoritative chat, player safety, and protected moderation evidence.
-- No direct browser table access is granted. The existing authenticated realtime session is authority.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('multiplayer_chat.read', 'Read multiplayer chat operations', 'View safe chat health and bounded non-evidence summaries.', 'moderation', false, true),
  ('multiplayer_chat.moderate', 'Moderate multiplayer chat', 'Perform audited chat warnings, mutes, dismissals, and escalations.', 'moderation', true, true),
  ('multiplayer_chat.reports.read', 'Read multiplayer chat reports', 'View protected player reports and exact message evidence.', 'moderation', true, true),
  ('multiplayer_chat.audit.read', 'Read multiplayer chat audit', 'View protected append-only chat moderation history.', 'moderation', true, true),
  ('multiplayer_chat.settings.read', 'Read multiplayer chat settings', 'View chat safety, distance, and retention settings.', 'moderation', true, true),
  ('multiplayer_chat.settings.edit', 'Edit multiplayer chat settings', 'Change reviewed chat safety and retention settings.', 'moderation', true, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

with mapping(role_key, permission_key) as (
  values
    ('game_administrator', 'multiplayer_chat.read'),
    ('game_administrator', 'multiplayer_chat.moderate'),
    ('game_administrator', 'multiplayer_chat.reports.read'),
    ('game_administrator', 'multiplayer_chat.audit.read'),
    ('game_administrator', 'multiplayer_chat.settings.read'),
    ('game_administrator', 'multiplayer_chat.settings.edit'),
    ('live_operations_manager', 'multiplayer_chat.read'),
    ('live_operations_manager', 'multiplayer_chat.reports.read'),
    ('moderator', 'multiplayer_chat.read'),
    ('moderator', 'multiplayer_chat.moderate'),
    ('moderator', 'multiplayer_chat.reports.read'),
    ('customer_support', 'multiplayer_chat.read'),
    ('customer_support', 'multiplayer_chat.reports.read'),
    ('read_only_analyst', 'multiplayer_chat.read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles role on role.key = mapping.role_key
join public.admin_permissions permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.admin_roles role
cross join public.admin_permissions permission
where role.key = 'super_admin' and permission.key like 'multiplayer_chat.%'
on conflict (role_id, permission_id) do nothing;

create table public.multiplayer_chat_settings (
  singleton_key boolean primary key default true check (singleton_key),
  nearby_distance numeric(5, 2) not null default 8 check (nearby_distance between 2 and 20),
  visible_history_limit integer not null default 50 check (visible_history_limit between 10 and 100),
  player_history_hours integer not null default 24 check (player_history_hours between 1 and 168),
  moderation_retention_days integer not null default 180 check (moderation_retention_days between 30 and 730),
  message_max_characters integer not null default 400 check (message_max_characters between 50 and 400),
  updated_at timestamptz not null default now()
);

insert into public.multiplayer_chat_settings (singleton_key) values (true);

create table public.multiplayer_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  client_request_id text,
  sender_profile_id uuid references public.player_profiles(id) on delete restrict,
  sender_presence_id uuid,
  sender_display_name text not null check (char_length(sender_display_name) between 3 and 20),
  sender_level integer check (sender_level is null or sender_level between 1 and 999),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  channel_id uuid not null references public.realtime_channels(id) on delete restrict,
  scope text not null check (scope in ('nearby', 'channel', 'system')),
  message_text text not null check (
    char_length(message_text) between 1 and 400
    and octet_length(message_text) <= 800
    and message_text = btrim(message_text)
    and message_text !~ '[[:cntrl:]<>]'
  ),
  source_category text not null default 'player' check (
    source_category in ('player', 'connection', 'channel', 'maintenance', 'moderation', 'live_operations')
  ),
  sender_position_x numeric(8, 4),
  sender_position_y numeric(8, 4),
  created_at timestamptz not null default now(),
  visible_until timestamptz not null default (now() + interval '24 hours'),
  constraint multiplayer_chat_message_actor_check check (
    (scope = 'system' and sender_profile_id is null and sender_presence_id is null and sender_level is null and source_category <> 'player')
    or (scope <> 'system' and sender_profile_id is not null and sender_presence_id is not null and sender_level is not null and source_category = 'player')
  ),
  constraint multiplayer_chat_message_position_check check (
    (scope = 'system' and sender_position_x is null and sender_position_y is null)
    or (scope <> 'system' and sender_position_x between 0 and 128 and sender_position_y between 0 and 128)
  ),
  constraint multiplayer_chat_message_visibility_check check (
    visible_until > created_at and visible_until <= created_at + interval '7 days'
  ),
  constraint multiplayer_chat_message_request_check check (
    (sender_profile_id is null and client_request_id is null)
    or (sender_profile_id is not null and client_request_id ~ '^[A-Za-z0-9._:-]{1,64}$')
  ),
  unique (sender_profile_id, client_request_id)
);

create table public.multiplayer_chat_player_preferences (
  player_profile_id uuid not null references public.player_profiles(id) on delete cascade,
  target_player_profile_id uuid not null references public.player_profiles(id) on delete cascade,
  muted boolean not null default false,
  blocked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (player_profile_id, target_player_profile_id),
  check (player_profile_id <> target_player_profile_id),
  check (muted or blocked)
);

create table public.multiplayer_chat_reports (
  id uuid primary key default gen_random_uuid(),
  request_id text not null check (request_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  reporter_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  reported_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  message_id uuid not null references public.multiplayer_chat_messages(id) on delete restrict,
  evidence_text text not null check (char_length(evidence_text) between 1 and 400 and octet_length(evidence_text) <= 800),
  evidence_scope text not null check (evidence_scope in ('nearby', 'channel')),
  evidence_world_map_id uuid not null references public.world_maps(id) on delete restrict,
  evidence_channel_id uuid not null references public.realtime_channels(id) on delete restrict,
  evidence_sent_at timestamptz not null,
  category text not null check (category in (
    'harassment', 'hate_or_abuse', 'spam', 'scam_or_suspicious_link',
    'impersonation', 'sexual_content', 'other'
  )),
  reason text not null check (
    char_length(reason) between 3 and 500 and reason = btrim(reason) and reason !~ '[[:cntrl:]<>]'
  ),
  status text not null default 'open' check (status in ('open', 'under_review', 'actioned', 'dismissed')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reporter_profile_id <> reported_profile_id),
  unique (reporter_profile_id, message_id),
  unique (reporter_profile_id, request_id)
);

create table public.multiplayer_chat_mutes (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reason text not null check (
    char_length(reason) between 12 and 500 and reason = btrim(reason) and reason !~ '[[:cntrl:]<>]'
  ),
  created_by_admin_user_id uuid not null,
  revoked_at timestamptz,
  revoked_by_admin_user_id uuid,
  revoke_reason text check (
    revoke_reason is null or (char_length(revoke_reason) between 12 and 500 and revoke_reason = btrim(revoke_reason) and revoke_reason !~ '[[:cntrl:]<>]')
  ),
  created_at timestamptz not null default now(),
  constraint multiplayer_chat_mute_time_check check (
    expires_at > starts_at and expires_at <= starts_at + interval '7 days'
  ),
  constraint multiplayer_chat_mute_revoke_check check (
    (status = 'revoked' and revoked_at is not null and revoked_by_admin_user_id is not null and revoke_reason is not null)
    or (status <> 'revoked' and revoked_at is null and revoked_by_admin_user_id is null and revoke_reason is null)
  )
);

create unique index multiplayer_chat_mutes_one_active_idx
  on public.multiplayer_chat_mutes(player_profile_id) where status = 'active';

create table public.multiplayer_chat_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.multiplayer_chat_reports(id) on delete restrict,
  reported_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  action text not null check (action in ('under_review', 'dismiss', 'warn', 'chat_mute', 'chat_unmute', 'escalate')),
  reason text not null check (
    char_length(reason) between 12 and 500 and reason = btrim(reason) and reason !~ '[[:cntrl:]<>]'
  ),
  actor_admin_user_id uuid not null,
  admin_session_id uuid not null,
  request_id text not null check (char_length(request_id) between 1 and 128),
  before_state jsonb not null check (jsonb_typeof(before_state) = 'object' and pg_column_size(before_state) <= 4096),
  after_state jsonb not null check (jsonb_typeof(after_state) = 'object' and pg_column_size(after_state) <= 4096),
  mute_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (actor_admin_user_id, request_id)
);

create index multiplayer_chat_messages_channel_idx
  on public.multiplayer_chat_messages(world_map_id, channel_id, scope, sequence desc);
create index multiplayer_chat_messages_retention_idx
  on public.multiplayer_chat_messages(visible_until, id);
create index multiplayer_chat_reports_queue_idx
  on public.multiplayer_chat_reports(status, created_at desc, id);
create index multiplayer_chat_reports_reported_idx
  on public.multiplayer_chat_reports(reported_profile_id, created_at desc);
create index multiplayer_chat_mutes_player_idx
  on public.multiplayer_chat_mutes(player_profile_id, created_at desc);
create index multiplayer_chat_mutes_expiry_idx
  on public.multiplayer_chat_mutes(expires_at) where status = 'active';
create index multiplayer_chat_actions_report_idx
  on public.multiplayer_chat_moderation_actions(report_id, created_at desc, id);

create trigger multiplayer_chat_settings_updated_at
before update on public.multiplayer_chat_settings
for each row execute function private.set_updated_at();
create trigger multiplayer_chat_preferences_updated_at
before update on public.multiplayer_chat_player_preferences
for each row execute function private.set_updated_at();
create trigger multiplayer_chat_reports_updated_at
before update on public.multiplayer_chat_reports
for each row execute function private.set_updated_at();

create or replace function private.protect_multiplayer_chat_moderation_actions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'MULTIPLAYER_CHAT_AUDIT_APPEND_ONLY';
end;
$$;

create trigger multiplayer_chat_actions_append_only
before update or delete on public.multiplayer_chat_moderation_actions
for each row execute function private.protect_multiplayer_chat_moderation_actions();

create or replace function private.protect_multiplayer_chat_report_evidence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     or new.request_id is distinct from old.request_id
     or new.reporter_profile_id is distinct from old.reporter_profile_id
     or new.reported_profile_id is distinct from old.reported_profile_id
     or new.message_id is distinct from old.message_id
     or new.evidence_text is distinct from old.evidence_text
     or new.evidence_scope is distinct from old.evidence_scope
     or new.evidence_world_map_id is distinct from old.evidence_world_map_id
     or new.evidence_channel_id is distinct from old.evidence_channel_id
     or new.evidence_sent_at is distinct from old.evidence_sent_at
     or new.category is distinct from old.category
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = '42501', message = 'MULTIPLAYER_CHAT_REPORT_EVIDENCE_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger multiplayer_chat_reports_protect_evidence
before update or delete on public.multiplayer_chat_reports
for each row execute function private.protect_multiplayer_chat_report_evidence();

alter table public.multiplayer_chat_settings enable row level security;
alter table public.multiplayer_chat_settings force row level security;
alter table public.multiplayer_chat_messages enable row level security;
alter table public.multiplayer_chat_messages force row level security;
alter table public.multiplayer_chat_player_preferences enable row level security;
alter table public.multiplayer_chat_player_preferences force row level security;
alter table public.multiplayer_chat_reports enable row level security;
alter table public.multiplayer_chat_reports force row level security;
alter table public.multiplayer_chat_mutes enable row level security;
alter table public.multiplayer_chat_mutes force row level security;
alter table public.multiplayer_chat_moderation_actions enable row level security;
alter table public.multiplayer_chat_moderation_actions force row level security;

revoke all on table public.multiplayer_chat_settings from public, anon, authenticated, service_role;
revoke all on table public.multiplayer_chat_messages from public, anon, authenticated, service_role;
revoke all on table public.multiplayer_chat_player_preferences from public, anon, authenticated, service_role;
revoke all on table public.multiplayer_chat_reports from public, anon, authenticated, service_role;
revoke all on table public.multiplayer_chat_mutes from public, anon, authenticated, service_role;
revoke all on table public.multiplayer_chat_moderation_actions from public, anon, authenticated, service_role;
revoke all on sequence public.multiplayer_chat_messages_sequence_seq from public, anon, authenticated, service_role;

create or replace function private.multiplayer_chat_message_json(message public.multiplayer_chat_messages)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', message.id,
    'sequence', message.sequence,
    'scope', message.scope,
    'senderPresenceId', message.sender_presence_id,
    'senderDisplayName', message.sender_display_name,
    'senderLevel', message.sender_level,
    'worldId', map.slug,
    'channelId', message.channel_id,
    'sentAt', message.created_at,
    'text', message.message_text,
    'sourceCategory', message.source_category
  )
  from public.world_maps map where map.id = message.world_map_id;
$$;

create or replace function private.multiplayer_chat_active_mute(p_player_profile_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare mute_row public.multiplayer_chat_mutes%rowtype;
begin
  update public.multiplayer_chat_mutes
  set status = 'expired'
  where player_profile_id = p_player_profile_id and status = 'active' and expires_at <= now();
  select * into mute_row from public.multiplayer_chat_mutes
  where player_profile_id = p_player_profile_id and status = 'active' and expires_at > now()
  order by expires_at desc limit 1;
  return mute_row.expires_at;
end;
$$;

create or replace function public.accept_realtime_chat_message(
  p_session_id uuid,
  p_client_request_id text,
  p_scope text,
  p_message_text text,
  p_sender_position_x numeric,
  p_sender_position_y numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare session public.realtime_sessions%rowtype;
declare profile public.player_profiles%rowtype;
declare access_session public.wallet_access_sessions%rowtype;
declare settings public.multiplayer_chat_settings%rowtype;
declare existing public.multiplayer_chat_messages%rowtype;
declare created public.multiplayer_chat_messages%rowtype;
declare muted_until timestamptz;
declare denial text;
begin
  select * into settings from public.multiplayer_chat_settings where singleton_key;
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$'
     or p_scope not in ('nearby', 'channel')
     or char_length(p_message_text) not between 1 and settings.message_max_characters
     or octet_length(p_message_text) > 800
     or p_message_text <> btrim(p_message_text)
     or p_message_text ~ '[[:cntrl:]<>]'
     or p_sender_position_x::text = 'NaN'
     or p_sender_position_y::text = 'NaN'
     or p_sender_position_x not between 0 and 128
     or p_sender_position_y not between 0 and 128 then
    return jsonb_build_object('status', 'invalid_content');
  end if;
  select * into session from public.realtime_sessions where id = p_session_id and status = 'active';
  if not found then return jsonb_build_object('status', 'access_changed'); end if;
  select * into profile from public.player_profiles where id = session.player_profile_id;
  select * into access_session from public.wallet_access_sessions where id = session.wallet_access_session_id;
  denial := private.realtime_access_denial(access_session, profile);
  if denial is not null then return jsonb_build_object('status', 'access_changed'); end if;
  if profile.current_map_version_id <> session.world_map_version_id then
    return jsonb_build_object('status', 'access_changed');
  end if;
  muted_until := private.multiplayer_chat_active_mute(profile.id);
  if muted_until is not null then
    return jsonb_build_object('status', 'chat_muted', 'mutedUntil', muted_until);
  end if;
  select * into existing from public.multiplayer_chat_messages
  where sender_profile_id = profile.id and client_request_id = p_client_request_id;
  if found then return jsonb_build_object('status', 'replayed', 'message', private.multiplayer_chat_message_json(existing)); end if;
  insert into public.multiplayer_chat_messages (
    client_request_id, sender_profile_id, sender_presence_id, sender_display_name, sender_level,
    world_map_id, channel_id, scope, message_text, source_category,
    sender_position_x, sender_position_y, visible_until
  ) values (
    p_client_request_id, profile.id, profile.public_presence_id, profile.display_name, profile.public_level,
    session.world_map_id, session.channel_id, p_scope, p_message_text, 'player',
    p_sender_position_x, p_sender_position_y,
    now() + make_interval(hours => settings.player_history_hours)
  ) returning * into created;
  return jsonb_build_object('status', 'accepted', 'message', private.multiplayer_chat_message_json(created));
exception when unique_violation then
  select * into existing from public.multiplayer_chat_messages
  where sender_profile_id = profile.id and client_request_id = p_client_request_id;
  if found then return jsonb_build_object('status', 'replayed', 'message', private.multiplayer_chat_message_json(existing)); end if;
  raise;
end;
$$;

create or replace function public.get_realtime_chat_bootstrap(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare session public.realtime_sessions%rowtype;
declare settings public.multiplayer_chat_settings%rowtype;
declare scope_name text;
declare histories jsonb := '[]'::jsonb;
declare messages jsonb;
declare preferences jsonb;
declare muted_until timestamptz;
begin
  select * into session from public.realtime_sessions where id = p_session_id and status = 'active';
  if not found then raise exception using errcode = '42501', message = 'CHAT_SESSION_CLOSED'; end if;
  select * into settings from public.multiplayer_chat_settings where singleton_key;
  foreach scope_name in array array['nearby', 'channel', 'system'] loop
    select coalesce(jsonb_agg(entry.message order by entry.sequence), '[]'::jsonb)
    into messages from (
      select private.multiplayer_chat_message_json(message) as message, message.sequence
      from public.multiplayer_chat_messages message
      where message.world_map_id = session.world_map_id
        and message.channel_id = session.channel_id
        and message.scope = scope_name
        and message.visible_until > now()
        and (
          message.scope <> 'nearby'
          or sqrt(power(message.sender_position_x - session.last_position_x, 2) + power(message.sender_position_y - session.last_position_y, 2)) <= settings.nearby_distance
        )
        and not exists (
          select 1 from public.multiplayer_chat_player_preferences preference
          where preference.player_profile_id = session.player_profile_id
            and preference.target_player_profile_id = message.sender_profile_id
            and (preference.muted or preference.blocked)
        )
      order by message.sequence desc limit settings.visible_history_limit
    ) entry;
    histories := histories || jsonb_build_array(jsonb_build_object(
      'scope', scope_name, 'messages', messages, 'hasMore', false
    ));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'targetPresenceId', target.public_presence_id,
    'muted', preference.muted,
    'blocked', preference.blocked
  )), '[]'::jsonb) into preferences
  from public.multiplayer_chat_player_preferences preference
  join public.player_profiles target on target.id = preference.target_player_profile_id
  where preference.player_profile_id = session.player_profile_id;
  muted_until := private.multiplayer_chat_active_mute(session.player_profile_id);
  return jsonb_build_object('histories', histories, 'preferences', preferences, 'mutedUntil', muted_until);
end;
$$;

create or replace function public.get_realtime_chat_history(
  p_session_id uuid,
  p_scope text,
  p_after_sequence bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare session public.realtime_sessions%rowtype;
declare settings public.multiplayer_chat_settings%rowtype;
declare messages jsonb;
begin
  if p_scope not in ('nearby', 'channel', 'system') or p_after_sequence < 0 then
    raise exception using errcode = '22023', message = 'INVALID_CHAT_HISTORY_REQUEST';
  end if;
  select * into session from public.realtime_sessions where id = p_session_id and status = 'active';
  if not found then raise exception using errcode = '42501', message = 'CHAT_SESSION_CLOSED'; end if;
  select * into settings from public.multiplayer_chat_settings where singleton_key;
  select coalesce(jsonb_agg(entry.message order by entry.sequence), '[]'::jsonb)
  into messages from (
    select private.multiplayer_chat_message_json(message) message, message.sequence
    from public.multiplayer_chat_messages message
    where message.world_map_id = session.world_map_id and message.channel_id = session.channel_id
      and message.scope = p_scope and message.sequence > p_after_sequence and message.visible_until > now()
      and (message.scope <> 'nearby' or sqrt(power(message.sender_position_x - session.last_position_x, 2) + power(message.sender_position_y - session.last_position_y, 2)) <= settings.nearby_distance)
      and not exists (
        select 1 from public.multiplayer_chat_player_preferences preference
        where preference.player_profile_id = session.player_profile_id
          and preference.target_player_profile_id = message.sender_profile_id
          and (preference.muted or preference.blocked)
      )
    order by message.sequence desc limit settings.visible_history_limit
  ) entry;
  return jsonb_build_object('scope', p_scope, 'messages', messages, 'hasMore', false);
end;
$$;

create or replace function public.update_realtime_chat_preference(
  p_session_id uuid,
  p_target_presence_id uuid,
  p_action text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare session public.realtime_sessions%rowtype;
declare target public.player_profiles%rowtype;
declare current_preference public.multiplayer_chat_player_preferences%rowtype;
declare next_muted boolean;
declare next_blocked boolean;
begin
  if p_action not in ('mute', 'unmute', 'block', 'unblock') then
    raise exception using errcode = '22023', message = 'INVALID_CHAT_PREFERENCE_ACTION';
  end if;
  select * into session from public.realtime_sessions where id = p_session_id and status = 'active';
  if not found then raise exception using errcode = '42501', message = 'CHAT_SESSION_CLOSED'; end if;
  select * into target from public.player_profiles where public_presence_id = p_target_presence_id;
  if not found or target.id = session.player_profile_id then
    raise exception using errcode = '22023', message = 'INVALID_CHAT_PREFERENCE_TARGET';
  end if;
  select * into current_preference from public.multiplayer_chat_player_preferences
  where player_profile_id = session.player_profile_id and target_player_profile_id = target.id;
  next_muted := case when p_action = 'mute' then true when p_action = 'unmute' then false else coalesce(current_preference.muted, false) end;
  next_blocked := case when p_action = 'block' then true when p_action = 'unblock' then false else coalesce(current_preference.blocked, false) end;
  if next_muted or next_blocked then
    insert into public.multiplayer_chat_player_preferences (
      player_profile_id, target_player_profile_id, muted, blocked
    ) values (session.player_profile_id, target.id, next_muted, next_blocked)
    on conflict (player_profile_id, target_player_profile_id) do update
    set muted = excluded.muted, blocked = excluded.blocked;
  else
    delete from public.multiplayer_chat_player_preferences
    where player_profile_id = session.player_profile_id and target_player_profile_id = target.id;
  end if;
  return jsonb_build_object('targetPresenceId', target.public_presence_id, 'muted', next_muted, 'blocked', next_blocked);
end;
$$;

create or replace function public.report_realtime_chat_message(
  p_session_id uuid,
  p_message_id uuid,
  p_category text,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare session public.realtime_sessions%rowtype;
declare message public.multiplayer_chat_messages%rowtype;
declare existing public.multiplayer_chat_reports%rowtype;
declare created public.multiplayer_chat_reports%rowtype;
begin
  if p_category not in ('harassment', 'hate_or_abuse', 'spam', 'scam_or_suspicious_link', 'impersonation', 'sexual_content', 'other')
     or p_request_id !~ '^[A-Za-z0-9._:-]{1,64}$'
     or char_length(p_reason) not between 3 and 500 or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]' then
    raise exception using errcode = '22023', message = 'INVALID_CHAT_REPORT';
  end if;
  select * into session from public.realtime_sessions where id = p_session_id and status = 'active';
  if not found then raise exception using errcode = '42501', message = 'CHAT_SESSION_CLOSED'; end if;
  select * into message from public.multiplayer_chat_messages
  where id = p_message_id and world_map_id = session.world_map_id and channel_id = session.channel_id
    and sender_profile_id is not null and sender_profile_id <> session.player_profile_id;
  if not found then raise exception using errcode = '22023', message = 'CHAT_MESSAGE_NOT_REPORTABLE'; end if;
  select * into existing from public.multiplayer_chat_reports
  where reporter_profile_id = session.player_profile_id and (message_id = message.id or request_id = p_request_id);
  if found then return jsonb_build_object('status', 'accepted', 'reportId', existing.id); end if;
  insert into public.multiplayer_chat_reports (
    request_id, reporter_profile_id, reported_profile_id, message_id, evidence_text,
    evidence_scope, evidence_world_map_id, evidence_channel_id, evidence_sent_at, category, reason
  ) values (
    p_request_id, session.player_profile_id, message.sender_profile_id, message.id, message.message_text,
    message.scope, message.world_map_id, message.channel_id, message.created_at, p_category, p_reason
  ) returning * into created;
  return jsonb_build_object('status', 'accepted', 'reportId', created.id);
end;
$$;

create or replace function public.list_admin_multiplayer_chat_reports(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_page integer, p_page_size integer, p_status text, p_category text,
  p_world_id text, p_channel_id uuid, p_search text, p_date_from date, p_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_page not between 1 and 10000 or p_page_size not in (10, 50, 100)
     or p_status not in ('all', 'open', 'under_review', 'actioned', 'dismissed')
     or p_category not in ('all', 'harassment', 'hate_or_abuse', 'spam', 'scam_or_suspicious_link', 'impersonation', 'sexual_content', 'other')
     or char_length(p_world_id) > 64 or char_length(p_search) > 128
     or (p_date_from is not null and p_date_to is not null and p_date_from > p_date_to)
     or (p_date_from is not null and p_date_to is not null and p_date_to - p_date_from > 366) then
    raise exception using errcode = '22023', message = 'INVALID_CHAT_REPORT_QUERY';
  end if;
  perform private.assert_verified_admin_permission(p_user_id, p_auth_session_id, p_assurance_level, 'multiplayer_chat.reports.read');
  with filtered as (
    select report.*, map.slug world_slug,
      reported.public_presence_id reported_presence_id, reported.display_name reported_name,
      reporter.public_presence_id reporter_presence_id, reporter.display_name reporter_name
    from public.multiplayer_chat_reports report
    join public.world_maps map on map.id = report.evidence_world_map_id
    join public.player_profiles reported on reported.id = report.reported_profile_id
    join public.player_profiles reporter on reporter.id = report.reporter_profile_id
    where (p_status = 'all' or report.status = p_status)
      and (p_category = 'all' or report.category = p_category)
      and (p_world_id = 'all' or map.slug = p_world_id)
      and (p_channel_id is null or report.evidence_channel_id = p_channel_id)
      and (p_search = '' or starts_with(lower(reported.display_name), lower(p_search)) or starts_with(lower(reporter.display_name), lower(p_search)) or report.message_id::text = p_search)
      and (p_date_from is null or report.created_at >= p_date_from::timestamptz)
      and (p_date_to is null or report.created_at < (p_date_to + 1)::timestamptz)
  ), paged as (
    select filtered.*, count(*) over() total_count from filtered
    order by created_at desc, id desc limit p_page_size offset (p_page - 1) * p_page_size
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'messageId', message_id, 'status', status, 'category', category,
      'reportedPresenceId', reported_presence_id, 'reportedDisplayName', reported_name,
      'reporterPresenceId', reporter_presence_id, 'reporterDisplayName', reporter_name,
      'worldId', world_slug, 'channelId', evidence_channel_id,
      'createdAt', created_at, 'updatedAt', updated_at, 'revision', revision
    ) order by created_at desc, id desc), '[]'::jsonb),
    'page', p_page, 'pageSize', p_page_size,
    'total', coalesce(max(total_count), 0),
    'totalPages', case when coalesce(max(total_count), 0) = 0 then 0 else ceil(max(total_count)::numeric / p_page_size)::integer end,
    'openCount', (select count(*)::integer from public.multiplayer_chat_reports where status = 'open')
  ) into result from paged;
  return result;
end;
$$;

create or replace function public.get_admin_multiplayer_chat_report(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text, p_report_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare report public.multiplayer_chat_reports%rowtype;
declare message public.multiplayer_chat_messages%rowtype;
declare reported public.player_profiles%rowtype;
declare reporter public.player_profiles%rowtype;
declare world_slug text;
begin
  perform private.assert_verified_admin_permission(p_user_id, p_auth_session_id, p_assurance_level, 'multiplayer_chat.reports.read');
  select * into report from public.multiplayer_chat_reports where id = p_report_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into message from public.multiplayer_chat_messages where id = report.message_id;
  select * into reported from public.player_profiles where id = report.reported_profile_id;
  select * into reporter from public.player_profiles where id = report.reporter_profile_id;
  select slug into world_slug from public.world_maps where id = report.evidence_world_map_id;
  return jsonb_build_object(
    'report', jsonb_build_object(
      'id', report.id, 'messageId', report.message_id, 'status', report.status, 'category', report.category,
      'reason', report.reason, 'reportedPresenceId', reported.public_presence_id, 'reportedDisplayName', reported.display_name,
      'reporterPresenceId', reporter.public_presence_id, 'reporterDisplayName', reporter.display_name,
      'worldId', world_slug, 'channelId', report.evidence_channel_id,
      'createdAt', report.created_at, 'updatedAt', report.updated_at, 'revision', report.revision,
      'evidence', coalesce(private.multiplayer_chat_message_json(message), jsonb_build_object(
        'id', report.message_id, 'sequence', 0, 'scope', report.evidence_scope,
        'senderPresenceId', reported.public_presence_id, 'senderDisplayName', reported.display_name,
        'senderLevel', reported.public_level, 'worldId', world_slug, 'channelId', report.evidence_channel_id,
        'sentAt', report.evidence_sent_at, 'text', report.evidence_text, 'sourceCategory', 'player'
      ))
    ),
    'moderationHistory', coalesce((select jsonb_agg(jsonb_build_object(
      'id', action.id, 'action', action.action, 'reason', action.reason,
      'createdAt', action.created_at, 'muteExpiresAt', action.mute_expires_at
    ) order by action.created_at desc, action.id desc) from public.multiplayer_chat_moderation_actions action where action.report_id = report.id), '[]'::jsonb),
    'relatedReports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', related.id, 'messageId', related.message_id, 'status', related.status,
        'category', related.category,
        'reportedPresenceId', reported.public_presence_id,
        'reportedDisplayName', reported.display_name,
        'reporterPresenceId', related.reporter_presence_id,
        'reporterDisplayName', related.reporter_display_name,
        'worldId', related.world_slug, 'channelId', related.evidence_channel_id,
        'createdAt', related.created_at, 'updatedAt', related.updated_at,
        'revision', related.revision
      ) order by related.created_at desc, related.id desc)
      from (
        select candidate.*, other_reporter.public_presence_id as reporter_presence_id,
          other_reporter.display_name as reporter_display_name, related_map.slug as world_slug
        from public.multiplayer_chat_reports candidate
        join public.player_profiles other_reporter
          on other_reporter.id = candidate.reporter_profile_id
        join public.world_maps related_map on related_map.id = candidate.evidence_world_map_id
        where candidate.reported_profile_id = report.reported_profile_id
          and candidate.id <> report.id
        order by candidate.created_at desc, candidate.id desc
        limit 20
      ) related
    ), '[]'::jsonb),
    'activeMuteUntil', (select expires_at from public.multiplayer_chat_mutes mute where mute.player_profile_id = report.reported_profile_id and mute.status = 'active' and mute.expires_at > now() order by expires_at desc limit 1)
  );
end;
$$;

create or replace function public.admin_act_on_multiplayer_chat_report(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_report_id uuid, p_action text, p_reason text, p_expected_revision integer,
  p_request_id text, p_mute_duration_minutes integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare report public.multiplayer_chat_reports%rowtype;
declare trusted_session uuid;
declare next_status text;
declare previous_status text;
declare previous_revision integer;
declare mute_expiration timestamptz;
declare existing_action public.multiplayer_chat_moderation_actions%rowtype;
begin
  if p_action not in ('under_review', 'dismiss', 'warn', 'chat_mute', 'chat_unmute', 'escalate')
     or char_length(p_reason) not between 12 and 500 or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_expected_revision < 1 or char_length(p_request_id) not between 1 and 128
     or (p_action = 'chat_mute' and p_mute_duration_minutes not in (15, 60, 1440, 10080))
     or (p_action <> 'chat_mute' and p_mute_duration_minutes is not null) then
    raise exception using errcode = '22023', message = 'INVALID_CHAT_MODERATION_ACTION';
  end if;
  trusted_session := private.assert_verified_admin_permission(p_user_id, p_auth_session_id, p_assurance_level, 'multiplayer_chat.moderate');
  select * into existing_action from public.multiplayer_chat_moderation_actions
  where actor_admin_user_id = p_user_id and request_id = p_request_id;
  if found then
    if existing_action.report_id <> p_report_id or existing_action.action <> p_action then
      raise exception using errcode = '23505', message = 'CHAT_MODERATION_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('status', 'replayed', 'reportId', p_report_id);
  end if;
  select * into report from public.multiplayer_chat_reports where id = p_report_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if report.revision <> p_expected_revision then return jsonb_build_object('status', 'revision_conflict'); end if;
  if report.status = 'dismissed'
     or (report.status = 'actioned' and p_action <> 'chat_unmute') then
    return jsonb_build_object('status', 'already_resolved');
  end if;
  previous_status := report.status;
  previous_revision := report.revision;
  next_status := case
    when p_action = 'under_review' then 'under_review'
    when p_action = 'dismiss' then 'dismissed'
    else 'actioned'
  end;
  if p_action = 'chat_mute' then
    update public.multiplayer_chat_mutes set status = 'expired'
    where player_profile_id = report.reported_profile_id and status = 'active' and expires_at <= now();
    if exists (select 1 from public.multiplayer_chat_mutes where player_profile_id = report.reported_profile_id and status = 'active') then
      raise exception using errcode = '23505', message = 'CHAT_MUTE_ALREADY_ACTIVE';
    end if;
    mute_expiration := now() + make_interval(mins => p_mute_duration_minutes);
    insert into public.multiplayer_chat_mutes (
      player_profile_id, expires_at, reason, created_by_admin_user_id
    ) values (report.reported_profile_id, mute_expiration, p_reason, p_user_id);
  elsif p_action = 'chat_unmute' then
    update public.multiplayer_chat_mutes
    set status = 'revoked', revoked_at = now(), revoked_by_admin_user_id = p_user_id, revoke_reason = p_reason
    where player_profile_id = report.reported_profile_id and status = 'active';
  end if;
  update public.multiplayer_chat_reports
  set status = next_status, revision = revision + 1
  where id = report.id returning * into report;
  insert into public.multiplayer_chat_moderation_actions (
    report_id, reported_profile_id, action, reason, actor_admin_user_id, admin_session_id,
    request_id, before_state, after_state, mute_expires_at
  ) values (
    report.id, report.reported_profile_id, p_action, p_reason, p_user_id, trusted_session,
    p_request_id,
    jsonb_build_object('status', previous_status, 'revision', previous_revision),
    jsonb_build_object('status', report.status, 'revision', report.revision),
    mute_expiration
  );
  insert into public.admin_audit_logs (
    event_key, actor_user_id, admin_session_id, request_id, outcome, metadata
  ) values (
    'multiplayer_chat.report.' || p_action, p_user_id, trusted_session, p_request_id, 'success',
    jsonb_build_object('reportId', report.id, 'messageId', report.message_id, 'action', p_action, 'muteExpiresAt', mute_expiration)
  );
  return jsonb_build_object('status', 'applied', 'reportId', report.id, 'revision', report.revision, 'muteExpiresAt', mute_expiration);
end;
$$;

create or replace function public.cleanup_multiplayer_chat_retention(p_limit integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare removed_messages integer;
declare expired_mutes integer;
begin
  if p_limit not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'INVALID_CHAT_CLEANUP_LIMIT';
  end if;
  with targets as (
    select message.id from public.multiplayer_chat_messages message
    where message.visible_until <= now()
      and not exists (
        select 1 from public.multiplayer_chat_reports report
        where report.message_id = message.id and report.status in ('open', 'under_review')
      )
    order by message.visible_until, message.id limit p_limit
  )
  delete from public.multiplayer_chat_messages message using targets
  where message.id = targets.id;
  get diagnostics removed_messages = row_count;
  update public.multiplayer_chat_mutes set status = 'expired'
  where status = 'active' and expires_at <= now();
  get diagnostics expired_mutes = row_count;
  return jsonb_build_object('removedMessages', removed_messages, 'expiredMutes', expired_mutes);
end;
$$;

revoke all on function private.protect_multiplayer_chat_moderation_actions() from public, anon, authenticated, service_role;
revoke all on function private.protect_multiplayer_chat_report_evidence() from public, anon, authenticated, service_role;
revoke all on function private.multiplayer_chat_message_json(public.multiplayer_chat_messages) from public, anon, authenticated, service_role;
revoke all on function private.multiplayer_chat_active_mute(uuid) from public, anon, authenticated, service_role;
revoke all on function public.accept_realtime_chat_message(uuid, text, text, text, numeric, numeric) from public, anon, authenticated, service_role;
revoke all on function public.get_realtime_chat_bootstrap(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_realtime_chat_history(uuid, text, bigint) from public, anon, authenticated, service_role;
revoke all on function public.update_realtime_chat_preference(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.report_realtime_chat_message(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.list_admin_multiplayer_chat_reports(uuid, uuid, text, integer, integer, text, text, text, uuid, text, date, date) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_multiplayer_chat_report(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_act_on_multiplayer_chat_report(uuid, uuid, text, uuid, text, text, integer, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.cleanup_multiplayer_chat_retention(integer) from public, anon, authenticated, service_role;

grant execute on function public.accept_realtime_chat_message(uuid, text, text, text, numeric, numeric) to service_role;
grant execute on function public.get_realtime_chat_bootstrap(uuid) to service_role;
grant execute on function public.get_realtime_chat_history(uuid, text, bigint) to service_role;
grant execute on function public.update_realtime_chat_preference(uuid, uuid, text) to service_role;
grant execute on function public.report_realtime_chat_message(uuid, uuid, text, text, text) to service_role;
grant execute on function public.list_admin_multiplayer_chat_reports(uuid, uuid, text, integer, integer, text, text, text, uuid, text, date, date) to service_role;
grant execute on function public.get_admin_multiplayer_chat_report(uuid, uuid, text, uuid) to service_role;
grant execute on function public.admin_act_on_multiplayer_chat_report(uuid, uuid, text, uuid, text, text, integer, text, integer) to service_role;
grant execute on function public.cleanup_multiplayer_chat_retention(integer) to service_role;
