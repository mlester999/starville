-- Starville Phase 8D-A: durable friends, parties, party chat, ready checks, and social persistence.
-- The authenticated realtime session and PostgreSQL are authoritative. Browser table access is denied.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('social_graph.read', 'Read social graph operations', 'View safe friendship and party operational summaries.', 'moderation', false, true),
  ('social_graph.audit.read', 'Read social graph audit', 'View bounded friendship and party audit history.', 'moderation', true, true),
  ('social_graph.settings.read', 'Read social graph settings', 'View bounded friendship and party settings.', 'moderation', false, true),
  ('social_graph.settings.edit', 'Edit social graph settings', 'Change reviewed friendship and party limits and privacy defaults.', 'moderation', true, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

with mapping(role_key, permission_key) as (
  values
    ('game_administrator', 'social_graph.read'),
    ('game_administrator', 'social_graph.audit.read'),
    ('game_administrator', 'social_graph.settings.read'),
    ('game_administrator', 'social_graph.settings.edit'),
    ('moderator', 'social_graph.read'),
    ('live_operations_manager', 'social_graph.read'),
    ('customer_support', 'social_graph.read'),
    ('read_only_analyst', 'social_graph.read')
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
where role.key = 'super_admin' and permission.key like 'social_graph.%'
on conflict (role_id, permission_id) do nothing;

create table public.social_graph_settings (
  singleton_key boolean primary key default true check (singleton_key),
  version integer not null default 1 check (version > 0),
  maximum_friends integer not null default 100 check (maximum_friends between 1 and 500),
  maximum_incoming_requests integer not null default 50 check (maximum_incoming_requests between 1 and 200),
  maximum_outgoing_requests integer not null default 25 check (maximum_outgoing_requests between 1 and 100),
  party_capacity integer not null default 4 check (party_capacity between 2 and 8),
  friend_request_expiry_seconds integer not null default 604800 check (friend_request_expiry_seconds between 3600 and 2592000),
  party_invitation_expiry_seconds integer not null default 120 check (party_invitation_expiry_seconds between 30 and 3600),
  ready_check_expiry_seconds integer not null default 30 check (ready_check_expiry_seconds between 10 and 120),
  leader_reconnect_grace_seconds integer not null default 60 check (leader_reconnect_grace_seconds between 15 and 600),
  party_dormant_timeout_seconds integer not null default 86400 check (party_dormant_timeout_seconds between 300 and 604800),
  notification_retention_hours integer not null default 24 check (notification_retention_hours between 1 and 168),
  idempotency_retention_hours integer not null default 24 check (idempotency_retention_hours between 1 and 168),
  audit_retention_days integer not null default 365 check (audit_retention_days between 30 and 730),
  nearby_invitations_enabled boolean not null default true,
  party_chat_enabled boolean not null default true,
  friend_location_visibility_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.social_graph_settings (singleton_key) values (true);

create table public.player_friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  target_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  status text not null default 'pending' check (status in (
    'pending', 'accepted', 'declined', 'cancelled', 'expired', 'invalidated'
  )),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (requester_profile_id <> target_profile_id),
  check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  check ((status = 'pending' and resolved_at is null) or (status <> 'pending' and resolved_at is not null))
);

create unique index player_friend_requests_one_pending_pair_idx
  on public.player_friend_requests(
    least(requester_profile_id, target_profile_id), greatest(requester_profile_id, target_profile_id)
  ) where status = 'pending';
create index player_friend_requests_requester_idx
  on public.player_friend_requests(requester_profile_id, status, created_at desc);
create index player_friend_requests_target_idx
  on public.player_friend_requests(target_profile_id, status, created_at desc);
create index player_friend_requests_expiry_idx
  on public.player_friend_requests(expires_at, id) where status = 'pending';

create table public.player_friendships (
  id uuid primary key default gen_random_uuid(),
  player_one_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_two_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  status text not null default 'accepted' check (status in ('accepted', 'removed', 'invalidated')),
  accepted_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  check (player_one_profile_id < player_two_profile_id),
  check ((status = 'accepted' and ended_at is null) or (status <> 'accepted' and ended_at is not null)),
  unique (player_one_profile_id, player_two_profile_id)
);

create index player_friendships_one_idx
  on public.player_friendships(player_one_profile_id, updated_at desc) where status = 'accepted';
create index player_friendships_two_idx
  on public.player_friendships(player_two_profile_id, updated_at desc) where status = 'accepted';

create table public.player_parties (
  id uuid primary key default gen_random_uuid(),
  public_party_id uuid not null default gen_random_uuid() unique,
  leader_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'disbanded', 'expired')),
  capacity integer not null check (capacity between 2 and 8),
  revision integer not null default 1 check (revision > 0),
  leader_reconnect_deadline timestamptz,
  dormant_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status = 'active' and closed_at is null) or (status <> 'active' and closed_at is not null)),
  check (leader_reconnect_deadline is null or status = 'active'),
  check (dormant_deadline is null or status = 'active')
);

create table public.player_party_members (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.player_parties(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  role text not null check (role in ('leader', 'member')),
  status text not null default 'active' check (status in ('active', 'left', 'kicked', 'removed')),
  connection_status text not null default 'online' check (connection_status in ('online', 'reconnecting', 'offline')),
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  last_world_map_id uuid references public.world_maps(id) on delete restrict,
  last_channel_id uuid references public.realtime_channels(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check ((status = 'active' and ended_at is null) or (status <> 'active' and ended_at is not null)),
  unique (party_id, player_profile_id)
);

create unique index player_party_members_one_active_party_idx
  on public.player_party_members(player_profile_id) where status = 'active';
create unique index player_party_members_one_active_leader_idx
  on public.player_party_members(party_id) where status = 'active' and role = 'leader';
create index player_party_members_party_idx
  on public.player_party_members(party_id, status, joined_at, id);

create table public.player_party_invitations (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.player_parties(id) on delete restrict,
  inviter_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  target_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  party_revision integer not null check (party_revision > 0),
  status text not null default 'pending' check (status in (
    'pending', 'accepted', 'declined', 'cancelled', 'expired', 'invalidated'
  )),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (inviter_profile_id <> target_profile_id),
  check (expires_at > created_at and expires_at <= created_at + interval '1 hour'),
  check ((status = 'pending' and resolved_at is null) or (status <> 'pending' and resolved_at is not null))
);

create unique index player_party_invitations_one_pending_target_idx
  on public.player_party_invitations(party_id, target_profile_id) where status = 'pending';
create index player_party_invitations_target_idx
  on public.player_party_invitations(target_profile_id, status, created_at desc);
create index player_party_invitations_expiry_idx
  on public.player_party_invitations(expires_at, id) where status = 'pending';

create table public.player_party_ready_checks (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.player_parties(id) on delete restrict,
  public_ready_check_id uuid not null default gen_random_uuid() unique,
  party_revision integer not null check (party_revision > 0),
  status text not null default 'active' check (status in ('active', 'completed', 'expired', 'invalidated')),
  created_by_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '2 minutes'),
  check ((status = 'active' and completed_at is null) or (status <> 'active' and completed_at is not null))
);

create unique index player_party_ready_checks_one_active_idx
  on public.player_party_ready_checks(party_id) where status = 'active';
create index player_party_ready_checks_expiry_idx
  on public.player_party_ready_checks(expires_at, id) where status = 'active';

create table public.player_party_ready_responses (
  ready_check_id uuid not null references public.player_party_ready_checks(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  state text not null default 'waiting' check (state in (
    'waiting', 'ready', 'not_ready', 'disconnected', 'expired'
  )),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (ready_check_id, player_profile_id),
  check ((state in ('ready', 'not_ready') and responded_at is not null) or (state not in ('ready', 'not_ready') and responded_at is null))
);

create table public.player_social_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  actor_profile_id uuid references public.player_profiles(id) on delete restrict,
  party_id uuid references public.player_parties(id) on delete restrict,
  notification_type text not null check (notification_type in (
    'friend_request', 'friend_accepted', 'party_invitation', 'invitation_accepted',
    'invitation_declined', 'member_joined', 'member_left', 'member_kicked',
    'leader_changed', 'ready_check', 'party_disbanded'
  )),
  message_text text not null check (
    char_length(message_text) between 1 and 160
    and message_text = btrim(message_text)
    and message_text !~ '[[:cntrl:]<>]'
  ),
  deduplication_key text not null check (char_length(deduplication_key) between 8 and 160),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at and expires_at <= created_at + interval '7 days'),
  unique (recipient_profile_id, deduplication_key)
);

create index player_social_notifications_recipient_idx
  on public.player_social_notifications(recipient_profile_id, created_at desc);
create index player_social_notifications_expiry_idx
  on public.player_social_notifications(expires_at, id);

create table public.player_social_audit (
  id uuid primary key default gen_random_uuid(),
  entry_number bigint generated always as identity unique,
  actor_profile_id uuid references public.player_profiles(id) on delete restrict,
  entity_type text not null check (entity_type in (
    'friend_request', 'friendship', 'party', 'party_invitation', 'ready_check', 'settings'
  )),
  entity_id uuid,
  party_id uuid references public.player_parties(id) on delete restrict,
  action text not null check (char_length(action) between 1 and 80 and action ~ '^[a-z0-9_]+$'),
  result text not null check (char_length(result) between 1 and 80 and result ~ '^[a-z0-9_]+$'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  party_revision integer check (party_revision is null or party_revision > 0),
  details jsonb not null default '{}'::jsonb check (
    jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4096
  ),
  moderation_protected boolean not null default false,
  created_at timestamptz not null default now()
);

create index player_social_audit_party_idx
  on public.player_social_audit(party_id, entry_number desc);
create index player_social_audit_created_idx
  on public.player_social_audit(created_at, id);

create table public.player_social_idempotency (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  operation text not null check (char_length(operation) between 1 and 80 and operation ~ '^[a-z0-9_]+$'),
  client_request_id text not null check (client_request_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  request_hash text not null check (char_length(request_hash) between 1 and 512),
  response jsonb not null check (jsonb_typeof(response) = 'object' and pg_column_size(response) <= 16384),
  created_at timestamptz not null default now(),
  primary key (player_profile_id, client_request_id)
);

create index player_social_idempotency_expiry_idx
  on public.player_social_idempotency(created_at, player_profile_id, client_request_id);

create trigger social_graph_settings_updated_at before update on public.social_graph_settings
for each row execute function private.set_updated_at();
create trigger player_friend_requests_updated_at before update on public.player_friend_requests
for each row execute function private.set_updated_at();
create trigger player_friendships_updated_at before update on public.player_friendships
for each row execute function private.set_updated_at();
create trigger player_parties_updated_at before update on public.player_parties
for each row execute function private.set_updated_at();
create trigger player_party_members_updated_at before update on public.player_party_members
for each row execute function private.set_updated_at();
create trigger player_party_invitations_updated_at before update on public.player_party_invitations
for each row execute function private.set_updated_at();
create trigger player_party_ready_responses_updated_at before update on public.player_party_ready_responses
for each row execute function private.set_updated_at();

create or replace function private.reject_player_social_immutable_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('starville.social_cleanup', true) = 'enabled' and tg_op = 'DELETE' then
    return old;
  end if;
  raise exception using errcode = '42501', message = 'PLAYER_SOCIAL_RECORD_APPEND_ONLY';
end;
$$;

create trigger player_social_audit_immutable before update or delete on public.player_social_audit
for each row execute function private.reject_player_social_immutable_mutation();
create trigger player_social_idempotency_immutable before update or delete on public.player_social_idempotency
for each row execute function private.reject_player_social_immutable_mutation();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'social_graph_settings', 'player_friend_requests', 'player_friendships', 'player_parties',
    'player_party_members', 'player_party_invitations', 'player_party_ready_checks',
    'player_party_ready_responses', 'player_social_notifications', 'player_social_audit',
    'player_social_idempotency'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
  end loop;
end;
$$;

revoke all on sequence public.player_social_audit_entry_number_seq from public, anon, authenticated, service_role;

create or replace function private.social_graph_active_session(p_session_id uuid)
returns public.realtime_sessions language plpgsql volatile security definer set search_path = '' as $$
begin
  return private.social_active_session(p_session_id);
exception
  when sqlstate '28000' then
    if sqlerrm = 'SOCIAL_MAINTENANCE' then
      raise exception using errcode = '28000', message = 'SOCIAL_GRAPH_MAINTENANCE';
    end if;
    raise exception using errcode = '28000', message = 'SOCIAL_GRAPH_ACCESS_CHANGED';
end;
$$;

create or replace function private.social_graph_player_json(profile public.player_profiles)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'presenceId', profile.public_presence_id,
    'displayName', profile.display_name,
    'level', profile.public_level,
    'appearancePreset', profile.appearance_preset
  );
$$;

create or replace function private.social_graph_pair_blocked(p_left uuid, p_right uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.multiplayer_chat_player_preferences preference
    where preference.blocked and (
      (preference.player_profile_id = p_left and preference.target_player_profile_id = p_right)
      or (preference.player_profile_id = p_right and preference.target_player_profile_id = p_left)
    )
  );
$$;

create or replace function private.social_graph_friendship_exists(p_left uuid, p_right uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.player_friendships friendship
    where friendship.player_one_profile_id = least(p_left, p_right)
      and friendship.player_two_profile_id = greatest(p_left, p_right)
      and friendship.status = 'accepted'
  );
$$;

create or replace function private.social_graph_active_party_id(p_player_profile_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select member.party_id
  from public.player_party_members member
  join public.player_parties party on party.id = member.party_id and party.status = 'active'
  where member.player_profile_id = p_player_profile_id and member.status = 'active'
  limit 1;
$$;

create or replace function private.social_graph_settings_json(settings public.social_graph_settings)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'maximumFriends', settings.maximum_friends,
    'maximumIncomingRequests', settings.maximum_incoming_requests,
    'maximumOutgoingRequests', settings.maximum_outgoing_requests,
    'partyCapacity', settings.party_capacity,
    'friendRequestExpirySeconds', settings.friend_request_expiry_seconds,
    'partyInvitationExpirySeconds', settings.party_invitation_expiry_seconds,
    'readyCheckExpirySeconds', settings.ready_check_expiry_seconds,
    'leaderReconnectGraceSeconds', settings.leader_reconnect_grace_seconds,
    'partyDormantTimeoutSeconds', settings.party_dormant_timeout_seconds,
    'nearbyInvitationsEnabled', settings.nearby_invitations_enabled,
    'partyChatEnabled', settings.party_chat_enabled,
    'friendLocationVisibilityEnabled', settings.friend_location_visibility_enabled,
    'version', settings.version
  );
$$;

create or replace function private.social_graph_friend_request_json(request public.player_friend_requests)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', request.id,
    'status', request.status,
    'sender', private.social_graph_player_json(sender),
    'target', private.social_graph_player_json(target),
    'createdAt', request.created_at,
    'expiresAt', request.expires_at
  )
  from public.player_profiles sender, public.player_profiles target
  where sender.id = request.requester_profile_id and target.id = request.target_profile_id;
$$;

create or replace function private.social_graph_invitation_json(invitation public.player_party_invitations)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', invitation.id,
    'partyId', party.public_party_id,
    'partyRevision', invitation.party_revision,
    'status', invitation.status,
    'inviter', private.social_graph_player_json(inviter),
    'target', private.social_graph_player_json(target),
    'createdAt', invitation.created_at,
    'expiresAt', invitation.expires_at
  )
  from public.player_parties party, public.player_profiles inviter, public.player_profiles target
  where party.id = invitation.party_id
    and inviter.id = invitation.inviter_profile_id
    and target.id = invitation.target_profile_id;
$$;

create or replace function private.social_graph_ready_check_json(check_row public.player_party_ready_checks)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', check_row.public_ready_check_id,
    'status', check_row.status,
    'partyRevision', check_row.party_revision,
    'createdAt', check_row.created_at,
    'expiresAt', check_row.expires_at,
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'presenceId', profile.public_presence_id,
        'state', response.state,
        'respondedAt', response.responded_at
      ) order by profile.public_presence_id)
      from public.player_party_ready_responses response
      join public.player_profiles profile on profile.id = response.player_profile_id
      where response.ready_check_id = check_row.id
    ), '[]'::jsonb)
  );
$$;

create or replace function private.social_graph_party_json(party public.player_parties)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare member_rows jsonb; active_check public.player_party_ready_checks%rowtype; leader_presence_id uuid;
begin
  select public_presence_id into strict leader_presence_id
  from public.player_profiles where id = party.leader_profile_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'presenceId', profile.public_presence_id,
    'displayName', profile.display_name,
    'level', profile.public_level,
    'appearancePreset', profile.appearance_preset,
    'role', member.role,
    'connectionStatus', member.connection_status,
    'worldId', map.slug,
    'worldName', map.display_name,
    'channelNumber', channel.channel_number,
    'readyState', coalesce(response.state, 'waiting'),
    'joinedAt', member.joined_at
  ) order by case member.role when 'leader' then 0 else 1 end, member.joined_at, member.id), '[]'::jsonb)
  into member_rows
  from public.player_party_members member
  join public.player_profiles profile on profile.id = member.player_profile_id
  left join public.world_maps map on map.id = member.last_world_map_id
  left join public.realtime_channels channel on channel.id = member.last_channel_id
  left join public.player_party_ready_checks ready
    on ready.party_id = party.id and ready.status = 'active'
  left join public.player_party_ready_responses response
    on response.ready_check_id = ready.id and response.player_profile_id = member.player_profile_id
  where member.party_id = party.id
    and (member.status = 'active' or party.status <> 'active');

  select * into active_check from public.player_party_ready_checks ready
  where ready.party_id = party.id and ready.status in ('active', 'completed', 'expired')
  order by ready.created_at desc limit 1;

  return jsonb_build_object(
    'partyId', party.public_party_id,
    'revision', party.revision,
    'status', party.status,
    'capacity', party.capacity,
    'leaderPresenceId', leader_presence_id,
    'members', member_rows,
    'pendingInvitationCount', (
      select count(*)::integer from public.player_party_invitations invitation
      where invitation.party_id = party.id and invitation.status = 'pending' and invitation.expires_at > now()
    ),
    'readyCheck', case when active_check.id is null then null else private.social_graph_ready_check_json(active_check) end,
    'leaderReconnectDeadline', party.leader_reconnect_deadline
  );
end;
$$;

create or replace function private.social_graph_friend_json(
  p_actor_profile_id uuid,
  p_friend_profile_id uuid,
  friendship public.player_friendships,
  p_friend_location_visibility_enabled boolean
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; session public.realtime_sessions%rowtype;
  actor_party_id uuid; friend_party_id uuid; connection_state text := 'offline';
  world_slug text; world_name text; channel_number integer; last_seen text;
begin
  select * into strict profile from public.player_profiles where id = p_friend_profile_id;
  select realtime.* into session from public.realtime_sessions realtime
  where realtime.player_profile_id = p_friend_profile_id and realtime.status = 'active'
    and realtime.last_heartbeat_at > now() - interval '30 seconds'
  order by realtime.connected_at desc limit 1;
  if found then
    connection_state := 'online';
    if p_friend_location_visibility_enabled then
      select map.slug, map.display_name, channel.channel_number
      into world_slug, world_name, channel_number
      from public.world_maps map
      join public.realtime_channels channel on channel.id = session.channel_id
      where map.id = session.world_map_id;
    end if;
    last_seen := null;
  else
    if exists (
      select 1 from public.player_party_members member
      where member.player_profile_id = p_friend_profile_id and member.status = 'active'
        and member.connection_status = 'reconnecting'
    ) then connection_state := 'reconnecting'; end if;
    last_seen := case
      when profile.last_entered_at > now() - interval '1 hour' then 'recently'
      when profile.last_entered_at::date = current_date then 'today'
      else 'earlier'
    end;
  end if;
  actor_party_id := private.social_graph_active_party_id(p_actor_profile_id);
  friend_party_id := private.social_graph_active_party_id(p_friend_profile_id);
  return private.social_graph_player_json(profile) || jsonb_build_object(
    'friendshipId', friendship.id,
    'connectionStatus', connection_state,
    'worldId', world_slug,
    'worldName', world_name,
    'channelNumber', channel_number,
    'partyState', case
      when actor_party_id is not null and actor_party_id = friend_party_id then 'same_party'
      when friend_party_id is not null then 'in_party'
      else 'none'
    end,
    'lastSeenCategory', last_seen
  );
end;
$$;

create or replace function private.social_graph_notification_json(notification public.player_social_notifications)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', notification.id,
    'type', notification.notification_type,
    'message', notification.message_text,
    'actorPresenceId', actor.public_presence_id,
    'partyId', party.public_party_id,
    'createdAt', notification.created_at,
    'expiresAt', notification.expires_at
  )
  from (select 1) singleton
  left join public.player_profiles actor on actor.id = notification.actor_profile_id
  left join public.player_parties party on party.id = notification.party_id;
$$;

create or replace function private.social_graph_notify(
  p_recipient_profile_id uuid,
  p_actor_profile_id uuid,
  p_party_id uuid,
  p_type text,
  p_message text,
  p_deduplication_key text
)
returns public.player_social_notifications language plpgsql volatile security definer set search_path = '' as $$
declare settings public.social_graph_settings%rowtype; notification public.player_social_notifications%rowtype;
begin
  select * into strict settings from public.social_graph_settings where singleton_key;
  insert into public.player_social_notifications (
    recipient_profile_id, actor_profile_id, party_id, notification_type, message_text,
    deduplication_key, expires_at
  ) values (
    p_recipient_profile_id, p_actor_profile_id, p_party_id, p_type, p_message,
    p_deduplication_key, now() + make_interval(hours => settings.notification_retention_hours)
  ) on conflict (recipient_profile_id, deduplication_key) do update
    set expires_at = greatest(public.player_social_notifications.expires_at, excluded.expires_at)
  returning * into notification;
  return notification;
end;
$$;

create or replace function private.social_graph_replay(
  p_player_profile_id uuid, p_operation text, p_client_request_id text, p_request_hash text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare replay public.player_social_idempotency%rowtype;
begin
  select * into replay from public.player_social_idempotency
  where player_profile_id = p_player_profile_id and client_request_id = p_client_request_id;
  if not found then return null; end if;
  if replay.operation <> p_operation or replay.request_hash <> p_request_hash then
    raise exception using errcode = '22023', message = 'SOCIAL_GRAPH_IDEMPOTENCY_CONFLICT';
  end if;
  return replay.response;
end;
$$;

create or replace function private.social_graph_store_replay(
  p_player_profile_id uuid, p_operation text, p_client_request_id text,
  p_request_hash text, p_response jsonb
)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.player_social_idempotency
    (player_profile_id, operation, client_request_id, request_hash, response)
  values (p_player_profile_id, p_operation, p_client_request_id, p_request_hash, p_response);
end;
$$;

create or replace function private.social_graph_result(
  p_status text,
  p_friend_request jsonb default null,
  p_party jsonb default null,
  p_invitation jsonb default null,
  p_notification jsonb default null,
  p_affected_presence_ids jsonb default '[]'::jsonb
)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'status', p_status,
    'friendRequest', p_friend_request,
    'party', p_party,
    'invitation', p_invitation,
    'notification', p_notification,
    'affectedPresenceIds', p_affected_presence_ids
  ));
$$;

create or replace function private.social_graph_sync_pending_invitation_revisions(p_party_id uuid, p_revision integer)
returns void language sql volatile security definer set search_path = '' as $$
  update public.player_party_invitations
  set party_revision = p_revision
  where party_id = p_party_id and status = 'pending';
$$;

create or replace function private.social_graph_invalidate_ready_check(
  p_party_id uuid, p_actor_profile_id uuid, p_request_id text, p_revision integer
)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare check_row public.player_party_ready_checks%rowtype;
begin
  update public.player_party_ready_checks
  set status = 'invalidated', completed_at = now(), party_revision = p_revision
  where party_id = p_party_id and status = 'active'
  returning * into check_row;
  if found then
    insert into public.player_social_audit (
      actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
    ) values (
      p_actor_profile_id, 'ready_check', check_row.public_ready_check_id, p_party_id,
      'ready_check_invalidated', 'invalidated', p_request_id, p_revision
    );
  end if;
end;
$$;

create or replace function public.get_realtime_social_graph_bootstrap(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; settings public.social_graph_settings%rowtype;
  member public.player_party_members%rowtype; party public.player_parties%rowtype;
  friends_json jsonb; incoming_json jsonb; outgoing_json jsonb; invitations_json jsonb;
  notifications_json jsonb;
begin
  session := private.social_graph_active_session(p_session_id);
  select * into strict settings from public.social_graph_settings where singleton_key;

  update public.player_friend_requests set status = 'expired', resolved_at = now()
  where status = 'pending' and expires_at <= now()
    and (requester_profile_id = session.player_profile_id or target_profile_id = session.player_profile_id);
  update public.player_party_invitations set status = 'expired', resolved_at = now()
  where status = 'pending' and expires_at <= now() and target_profile_id = session.player_profile_id;
  update public.player_party_ready_checks set status = 'expired', completed_at = now()
  where status = 'active' and expires_at <= now()
    and party_id = private.social_graph_active_party_id(session.player_profile_id);

  select * into member from public.player_party_members
  where player_profile_id = session.player_profile_id and status = 'active';
  if found then
    select * into party from public.player_parties
    where id = member.party_id and status = 'active' for update;
    select * into member from public.player_party_members
    where id = member.id and party_id = party.id and status = 'active' for update;
  end if;
  if found and party.id is not null then
    if member.connection_status <> 'online'
       or member.last_world_map_id is distinct from session.world_map_id
       or member.last_channel_id is distinct from session.channel_id then
      update public.player_party_members
      set connection_status = 'online', last_world_map_id = session.world_map_id,
        last_channel_id = session.channel_id
      where id = member.id;
      update public.player_parties
      set revision = revision + 1,
        leader_reconnect_deadline = case when leader_profile_id = session.player_profile_id then null else leader_reconnect_deadline end,
        dormant_deadline = null
      where id = member.party_id and status = 'active'
      returning * into party;
      perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
    end if;
  end if;

  select coalesce(jsonb_agg(private.social_graph_friend_json(
    session.player_profile_id,
    case when friendship.player_one_profile_id = session.player_profile_id
      then friendship.player_two_profile_id else friendship.player_one_profile_id end,
    friendship,
    settings.friend_location_visibility_enabled
  ) order by lower(friend_profile.display_name), friend_profile.public_presence_id), '[]'::jsonb)
  into friends_json
  from public.player_friendships friendship
  join public.player_profiles friend_profile on friend_profile.id = case
    when friendship.player_one_profile_id = session.player_profile_id
      then friendship.player_two_profile_id else friendship.player_one_profile_id end
  where friendship.status = 'accepted'
    and session.player_profile_id in (friendship.player_one_profile_id, friendship.player_two_profile_id)
    and not private.social_graph_pair_blocked(session.player_profile_id, friend_profile.id);

  select coalesce(jsonb_agg(private.social_graph_friend_request_json(request)
    order by request.created_at desc), '[]'::jsonb)
  into incoming_json from (
    select * from public.player_friend_requests source
    where source.target_profile_id = session.player_profile_id and source.status = 'pending'
      and source.expires_at > now() order by source.created_at desc
    limit settings.maximum_incoming_requests
  ) request;

  select coalesce(jsonb_agg(private.social_graph_friend_request_json(request)
    order by request.created_at desc), '[]'::jsonb)
  into outgoing_json from (
    select * from public.player_friend_requests source
    where source.requester_profile_id = session.player_profile_id and source.status = 'pending'
      and source.expires_at > now() order by source.created_at desc
    limit settings.maximum_outgoing_requests
  ) request;

  select coalesce(jsonb_agg(private.social_graph_invitation_json(invitation)
    order by invitation.created_at desc), '[]'::jsonb)
  into invitations_json from (
    select * from public.player_party_invitations source
    where source.target_profile_id = session.player_profile_id and source.status = 'pending'
      and source.expires_at > now() order by source.created_at desc limit 50
  ) invitation;

  select coalesce(jsonb_agg(private.social_graph_notification_json(notification)
    order by notification.created_at desc), '[]'::jsonb)
  into notifications_json from (
    select * from public.player_social_notifications source
    where source.recipient_profile_id = session.player_profile_id and source.expires_at > now()
    order by source.created_at desc limit 20
  ) notification;

  return jsonb_build_object(
    'friends', friends_json,
    'incomingRequests', incoming_json,
    'outgoingRequests', outgoing_json,
    'party', case when party.id is null then null else private.social_graph_party_json(party) end,
    'invitations', invitations_json,
    'notifications', notifications_json,
    'settings', private.social_graph_settings_json(settings)
  );
end;
$$;

create or replace function public.send_realtime_friend_request(
  p_session_id uuid, p_target_presence_id uuid, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  target public.player_profiles%rowtype; settings public.social_graph_settings%rowtype;
  request public.player_friend_requests%rowtype; notification public.player_social_notifications%rowtype;
  replay jsonb; response jsonb; request_hash text; actor_count integer; target_count integer;
begin
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_FRIEND_REQUEST';
  end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_target_presence_id::text;
  replay := private.social_graph_replay(actor.id, 'friend_request_send', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into target from public.player_profiles where public_presence_id = p_target_presence_id;
  if not found or target.id = actor.id
     or private.social_graph_pair_blocked(actor.id, target.id)
     or exists (select 1 from public.player_moderation_states state
       where state.player_profile_id in (actor.id, target.id) and state.status = 'suspended') then
    response := private.social_graph_result('player_unavailable');
    perform private.social_graph_store_replay(actor.id, 'friend_request_send', p_client_request_id, request_hash, response);
    return response;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(least(actor.id, target.id)::text || greatest(actor.id, target.id)::text, 0));
  select * into strict settings from public.social_graph_settings where singleton_key;
  if private.social_graph_friendship_exists(actor.id, target.id) then
    response := private.social_graph_result('already_friends');
  else
    select count(*)::integer into actor_count from public.player_friend_requests
    where requester_profile_id = actor.id and status = 'pending' and expires_at > now();
    select count(*)::integer into target_count from public.player_friend_requests
    where target_profile_id = target.id and status = 'pending' and expires_at > now();
    if actor_count >= settings.maximum_outgoing_requests or target_count >= settings.maximum_incoming_requests then
      response := private.social_graph_result('friend_limit_reached');
    else
      select * into request from public.player_friend_requests
      where status = 'pending'
        and requester_profile_id = target.id and target_profile_id = actor.id
        and expires_at > now() for update;
      if found then
        response := private.social_graph_result(
          'reverse_pending', private.social_graph_friend_request_json(request), null, null, null,
          jsonb_build_array(actor.public_presence_id, target.public_presence_id)
        );
      else
        select * into request from public.player_friend_requests
        where status = 'pending'
          and requester_profile_id = actor.id and target_profile_id = target.id
          and expires_at > now() for update;
        if found then
          response := private.social_graph_result(
            'replayed', private.social_graph_friend_request_json(request), null, null, null,
            jsonb_build_array(actor.public_presence_id, target.public_presence_id)
          );
        else
          insert into public.player_friend_requests (
            requester_profile_id, target_profile_id, expires_at
          ) values (
            actor.id, target.id, now() + make_interval(secs => settings.friend_request_expiry_seconds)
          ) returning * into request;
          notification := private.social_graph_notify(
            target.id, actor.id, null, 'friend_request',
            actor.display_name || ' sent you a friend request.', 'friend-request:' || request.id::text
          );
          insert into public.player_social_audit (
            actor_profile_id, entity_type, entity_id, action, result, request_id
          ) values (actor.id, 'friend_request', request.id, 'friend_request_sent', 'pending', p_client_request_id);
          response := private.social_graph_result(
            'created', private.social_graph_friend_request_json(request), null, null,
            private.social_graph_notification_json(notification),
            jsonb_build_array(actor.public_presence_id, target.public_presence_id)
          );
        end if;
      end if;
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'friend_request_send', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.respond_realtime_friend_request(
  p_session_id uuid, p_friend_request_id uuid, p_action text, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  requester public.player_profiles%rowtype; request public.player_friend_requests%rowtype;
  friendship public.player_friendships%rowtype; settings public.social_graph_settings%rowtype;
  replay jsonb; response jsonb; request_hash text; actor_count integer; requester_count integer;
  notification public.player_social_notifications%rowtype;
begin
  if p_action not in ('accept', 'decline') or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_FRIEND_RESPONSE';
  end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_friend_request_id::text || ':' || p_action;
  replay := private.social_graph_replay(actor.id, 'friend_request_respond', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into request from public.player_friend_requests where id = p_friend_request_id for update;
  if not found or request.target_profile_id <> actor.id or request.status <> 'pending' then
    response := private.social_graph_result('request_changed');
  elsif request.expires_at <= now() then
    update public.player_friend_requests set status = 'expired', resolved_at = now() where id = request.id;
    response := private.social_graph_result('request_expired');
  else
    select * into strict requester from public.player_profiles where id = request.requester_profile_id;
    perform pg_advisory_xact_lock(hashtextextended(least(actor.id, requester.id)::text || greatest(actor.id, requester.id)::text, 0));
    if private.social_graph_pair_blocked(actor.id, requester.id) then
      update public.player_friend_requests set status = 'invalidated', resolved_at = now() where id = request.id returning * into request;
      response := private.social_graph_result('player_unavailable');
    elsif p_action = 'decline' then
      update public.player_friend_requests set status = 'declined', resolved_at = now() where id = request.id returning * into request;
      insert into public.player_social_audit (
        actor_profile_id, entity_type, entity_id, action, result, request_id
      ) values (actor.id, 'friend_request', request.id, 'friend_request_declined', 'declined', p_client_request_id);
      response := private.social_graph_result(
        'declined', private.social_graph_friend_request_json(request), null, null, null,
        jsonb_build_array(actor.public_presence_id, requester.public_presence_id)
      );
    else
      select * into strict settings from public.social_graph_settings where singleton_key;
      select count(*)::integer into actor_count from public.player_friendships
      where status = 'accepted' and actor.id in (player_one_profile_id, player_two_profile_id);
      select count(*)::integer into requester_count from public.player_friendships
      where status = 'accepted' and requester.id in (player_one_profile_id, player_two_profile_id);
      if actor_count >= settings.maximum_friends or requester_count >= settings.maximum_friends then
        response := private.social_graph_result('friend_limit_reached');
      else
        insert into public.player_friendships (
          player_one_profile_id, player_two_profile_id, status, accepted_at, ended_at
        ) values (least(actor.id, requester.id), greatest(actor.id, requester.id), 'accepted', now(), null)
        on conflict (player_one_profile_id, player_two_profile_id) do update
          set status = 'accepted', accepted_at = now(), ended_at = null
        returning * into friendship;
        update public.player_friend_requests set status = 'accepted', resolved_at = now()
        where id = request.id returning * into request;
        notification := private.social_graph_notify(
          requester.id, actor.id, null, 'friend_accepted',
          'You are now friends with ' || actor.display_name || '.',
          'friend-accepted:' || friendship.id::text || ':' || extract(epoch from friendship.accepted_at)::bigint::text
        );
        insert into public.player_social_audit (
          actor_profile_id, entity_type, entity_id, action, result, request_id,
          details
        ) values (
          actor.id, 'friendship', friendship.id, 'friend_request_accepted', 'accepted', p_client_request_id,
          jsonb_build_object('friendRequestId', request.id)
        );
        response := private.social_graph_result(
          'accepted', private.social_graph_friend_request_json(request), null, null,
          private.social_graph_notification_json(notification),
          jsonb_build_array(actor.public_presence_id, requester.public_presence_id)
        );
      end if;
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'friend_request_respond', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.cancel_realtime_friend_request(
  p_session_id uuid, p_friend_request_id uuid, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  target public.player_profiles%rowtype; request public.player_friend_requests%rowtype;
  replay jsonb; response jsonb; request_hash text;
begin
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then raise exception using errcode = '22023', message = 'INVALID_FRIEND_CANCEL'; end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_friend_request_id::text;
  replay := private.social_graph_replay(actor.id, 'friend_request_cancel', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into request from public.player_friend_requests where id = p_friend_request_id for update;
  if not found or request.requester_profile_id <> actor.id or request.status <> 'pending' then
    response := private.social_graph_result('request_changed');
  else
    select * into strict target from public.player_profiles where id = request.target_profile_id;
    update public.player_friend_requests set status = 'cancelled', resolved_at = now()
    where id = request.id returning * into request;
    insert into public.player_social_audit (actor_profile_id, entity_type, entity_id, action, result, request_id)
    values (actor.id, 'friend_request', request.id, 'friend_request_cancelled', 'cancelled', p_client_request_id);
    response := private.social_graph_result(
      'cancelled', private.social_graph_friend_request_json(request), null, null, null,
      jsonb_build_array(actor.public_presence_id, target.public_presence_id)
    );
  end if;
  perform private.social_graph_store_replay(actor.id, 'friend_request_cancel', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.remove_realtime_friend(
  p_session_id uuid, p_target_presence_id uuid, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  target public.player_profiles%rowtype; friendship public.player_friendships%rowtype;
  replay jsonb; response jsonb; request_hash text;
begin
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then raise exception using errcode = '22023', message = 'INVALID_FRIEND_REMOVE'; end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_target_presence_id::text;
  replay := private.social_graph_replay(actor.id, 'friend_remove', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into target from public.player_profiles where public_presence_id = p_target_presence_id;
  if not found or target.id = actor.id then
    response := private.social_graph_result('player_unavailable');
  else
    perform pg_advisory_xact_lock(hashtextextended(least(actor.id, target.id)::text || greatest(actor.id, target.id)::text, 0));
    update public.player_friendships set status = 'removed', ended_at = now()
    where player_one_profile_id = least(actor.id, target.id)
      and player_two_profile_id = greatest(actor.id, target.id) and status = 'accepted'
    returning * into friendship;
    if not found then response := private.social_graph_result('request_changed');
    else
      insert into public.player_social_audit (actor_profile_id, entity_type, entity_id, action, result, request_id)
      values (actor.id, 'friendship', friendship.id, 'friend_removed', 'removed', p_client_request_id);
      response := private.social_graph_result(
        'removed', null, null, null, null,
        jsonb_build_array(actor.public_presence_id, target.public_presence_id)
      );
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'friend_remove', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function private.social_graph_party_presence_ids(p_party_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select coalesce(jsonb_agg(profile.public_presence_id order by member.joined_at, member.id), '[]'::jsonb)
  from public.player_party_members member
  join public.player_profiles profile on profile.id = member.player_profile_id
  where member.party_id = p_party_id and member.status = 'active';
$$;

create or replace function private.social_graph_remove_party_member(
  p_party_id uuid, p_player_profile_id uuid, p_member_status text,
  p_actor_profile_id uuid, p_request_id text
)
returns public.player_parties language plpgsql volatile security definer set search_path = '' as $$
declare party public.player_parties%rowtype; member public.player_party_members%rowtype;
  next_leader public.player_party_members%rowtype; action_name text;
begin
  if p_member_status not in ('left', 'kicked', 'removed') then
    raise exception using errcode = '22023', message = 'INVALID_PARTY_MEMBER_STATUS';
  end if;
  select * into party from public.player_parties where id = p_party_id and status = 'active' for update;
  if not found then raise exception using errcode = 'P0002', message = 'PARTY_CHANGED'; end if;
  select * into member from public.player_party_members
  where party_id = party.id and player_profile_id = p_player_profile_id and status = 'active' for update;
  if not found then raise exception using errcode = 'P0002', message = 'PARTY_MEMBER_CHANGED'; end if;

  update public.player_party_members
  set status = p_member_status, ended_at = now(), connection_status = 'offline'
  where id = member.id;

  if member.role = 'leader' then
    select * into next_leader from public.player_party_members candidate
    where candidate.party_id = party.id and candidate.status = 'active'
    order by
      case candidate.connection_status when 'online' then 0 when 'reconnecting' then 1 else 2 end,
      candidate.joined_at, candidate.id
    limit 1 for update;
    if found then
      update public.player_party_members set role = 'leader' where id = next_leader.id;
      update public.player_parties
      set leader_profile_id = next_leader.player_profile_id, revision = revision + 1,
        leader_reconnect_deadline = null, dormant_deadline = null
      where id = party.id returning * into party;
      insert into public.player_social_audit (
        actor_profile_id, entity_type, entity_id, party_id, action, result, request_id,
        party_revision, details
      ) values (
        p_actor_profile_id, 'party', party.public_party_id, party.id,
        'party_leader_transferred', 'transferred', p_request_id, party.revision,
        jsonb_build_object('newLeaderProfileId', next_leader.player_profile_id)
      );
    else
      update public.player_parties
      set status = 'disbanded', revision = revision + 1, closed_at = now(),
        leader_reconnect_deadline = null, dormant_deadline = null
      where id = party.id returning * into party;
      update public.player_party_invitations set status = 'invalidated', resolved_at = now()
      where party_id = party.id and status = 'pending';
    end if;
  else
    update public.player_parties set revision = revision + 1
    where id = party.id returning * into party;
  end if;
  perform private.social_graph_invalidate_ready_check(party.id, p_actor_profile_id, p_request_id, party.revision);
  perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
  action_name := case p_member_status when 'left' then 'party_member_left'
    when 'kicked' then 'party_member_kicked' else 'party_member_removed' end;
  insert into public.player_social_audit (
    actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision,
    details
  ) values (
    p_actor_profile_id, 'party', party.public_party_id, party.id, action_name,
    p_member_status, p_request_id, party.revision,
    jsonb_build_object('memberProfileId', p_player_profile_id)
  );
  return party;
end;
$$;

create or replace function public.create_realtime_party(
  p_session_id uuid, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  settings public.social_graph_settings%rowtype; party public.player_parties%rowtype;
  replay jsonb; response jsonb;
begin
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then raise exception using errcode = '22023', message = 'INVALID_PARTY_CREATE'; end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id for update;
  replay := private.social_graph_replay(actor.id, 'party_create', p_client_request_id, 'create');
  if replay is not null then return replay; end if;
  if private.social_graph_active_party_id(actor.id) is not null then
    response := private.social_graph_result('already_in_party');
  else
    select * into strict settings from public.social_graph_settings where singleton_key;
    insert into public.player_parties (leader_profile_id, capacity)
    values (actor.id, settings.party_capacity) returning * into party;
    insert into public.player_party_members (
      party_id, player_profile_id, role, connection_status, last_world_map_id, last_channel_id
    ) values (party.id, actor.id, 'leader', 'online', session.world_map_id, session.channel_id);
    insert into public.player_social_audit (
      actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
    ) values (
      actor.id, 'party', party.public_party_id, party.id, 'party_created', 'active',
      p_client_request_id, party.revision
    );
    response := private.social_graph_result(
      'created', null, private.social_graph_party_json(party), null, null,
      jsonb_build_array(actor.public_presence_id)
    );
  end if;
  perform private.social_graph_store_replay(actor.id, 'party_create', p_client_request_id, 'create', response);
  return response;
end;
$$;

create or replace function public.send_realtime_party_invitation(
  p_session_id uuid, p_target_presence_id uuid, p_expected_revision integer,
  p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  target public.player_profiles%rowtype; member public.player_party_members%rowtype;
  party public.player_parties%rowtype; target_session public.realtime_sessions%rowtype;
  invitation public.player_party_invitations%rowtype; settings public.social_graph_settings%rowtype;
  social_settings public.social_interaction_settings%rowtype; notification public.player_social_notifications%rowtype;
  replay jsonb; response jsonb; request_hash text; eligible boolean := false;
begin
  if p_expected_revision < 1 or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_PARTY_INVITATION';
  end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_target_presence_id::text || ':' || p_expected_revision::text;
  replay := private.social_graph_replay(actor.id, 'party_invite_send', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into member from public.player_party_members
  where player_profile_id = actor.id and status = 'active';
  if not found or member.role <> 'leader' then response := private.social_graph_result('not_party_leader');
  else
    select * into party from public.player_parties where id = member.party_id and status = 'active' for update;
    select * into target from public.player_profiles where public_presence_id = p_target_presence_id;
    if party.revision <> p_expected_revision then response := private.social_graph_result('party_changed');
    elsif not found or target.id = actor.id or private.social_graph_pair_blocked(actor.id, target.id) then
      response := private.social_graph_result('player_unavailable');
    elsif private.social_graph_active_party_id(target.id) is not null then response := private.social_graph_result('already_in_party');
    else
      select * into strict settings from public.social_graph_settings where singleton_key;
      eligible := private.social_graph_friendship_exists(actor.id, target.id);
      if not eligible and settings.nearby_invitations_enabled then
        select realtime.* into target_session from public.realtime_sessions realtime
        where realtime.player_profile_id = target.id and realtime.status = 'active'
          and realtime.last_heartbeat_at > now() - interval '30 seconds'
        order by realtime.connected_at desc limit 1;
        if found then
          select * into strict social_settings from public.social_interaction_settings where singleton_key;
          eligible := target_session.world_map_id = session.world_map_id
            and target_session.world_map_version_id = session.world_map_version_id
            and target_session.channel_id = session.channel_id
            and sqrt(power(target_session.last_position_x - session.last_position_x, 2)
              + power(target_session.last_position_y - session.last_position_y, 2)) <= social_settings.interaction_distance;
        end if;
      end if;
      if not eligible then response := private.social_graph_result('player_unavailable');
      else
        select * into invitation from public.player_party_invitations
        where party_id = party.id and target_profile_id = target.id and status = 'pending'
          and expires_at > now() for update;
        if found then
          response := private.social_graph_result(
            'replayed', null, private.social_graph_party_json(party),
            private.social_graph_invitation_json(invitation), null,
            private.social_graph_party_presence_ids(party.id) || jsonb_build_array(target.public_presence_id)
          );
        else
          update public.player_parties set revision = revision + 1 where id = party.id returning * into party;
          perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
          insert into public.player_party_invitations (
            party_id, inviter_profile_id, target_profile_id, party_revision, expires_at
          ) values (
            party.id, actor.id, target.id, party.revision,
            now() + make_interval(secs => settings.party_invitation_expiry_seconds)
          ) returning * into invitation;
          notification := private.social_graph_notify(
            target.id, actor.id, party.id, 'party_invitation',
            actor.display_name || ' invited you to a party.', 'party-invitation:' || invitation.id::text
          );
          insert into public.player_social_audit (
            actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
          ) values (
            actor.id, 'party_invitation', invitation.id, party.id, 'party_invitation_sent',
            'pending', p_client_request_id, party.revision
          );
          response := private.social_graph_result(
            'created', null, private.social_graph_party_json(party),
            private.social_graph_invitation_json(invitation),
            private.social_graph_notification_json(notification),
            private.social_graph_party_presence_ids(party.id) || jsonb_build_array(target.public_presence_id)
          );
        end if;
      end if;
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'party_invite_send', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.respond_realtime_party_invitation(
  p_session_id uuid, p_invitation_id uuid, p_expected_revision integer,
  p_action text, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  invitation public.player_party_invitations%rowtype; party public.player_parties%rowtype;
  moderation public.player_moderation_states%rowtype;
  member_count integer; replay jsonb; response jsonb; request_hash text;
  inviter public.player_profiles%rowtype; notification public.player_social_notifications%rowtype;
begin
  if p_action not in ('accept', 'decline') or p_expected_revision < 1
     or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_PARTY_INVITATION_RESPONSE';
  end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id for update;
  -- Share-lock moderation before the party. A concurrent suspension owns this row
  -- before reconciling membership, so either the join commits first and is removed
  -- by suspension, or the join observes the suspension and is denied.
  select * into strict moderation from public.player_moderation_states
  where player_profile_id = actor.id for share;
  request_hash := p_invitation_id::text || ':' || p_expected_revision::text || ':' || p_action;
  replay := private.social_graph_replay(actor.id, 'party_invite_respond', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  -- Discover the shared party first, then lock the party before the invitation. This
  -- gives every acceptance path the same lock order and prevents a winner that is
  -- invalidating sibling invitations from deadlocking with another accepter.
  select * into invitation from public.player_party_invitations where id = p_invitation_id;
  if not found then
    response := private.social_graph_result('invitation_changed');
  else
    select * into party from public.player_parties where id = invitation.party_id and status = 'active' for update;
    select * into invitation from public.player_party_invitations where id = p_invitation_id for update;
    if moderation.status = 'suspended' then
      response := private.social_graph_result('player_unavailable');
    elsif not found or invitation.target_profile_id <> actor.id or invitation.status <> 'pending' then
      response := private.social_graph_result('invitation_changed');
    elsif invitation.expires_at <= now() then
      update public.player_party_invitations set status = 'expired', resolved_at = now() where id = invitation.id;
      response := private.social_graph_result('invitation_changed');
    else
      select * into strict inviter from public.player_profiles where id = invitation.inviter_profile_id;
      if party.id is null or party.revision <> p_expected_revision or invitation.party_revision <> party.revision then
        response := private.social_graph_result('party_changed');
      elsif p_action = 'decline' then
        update public.player_party_invitations set status = 'declined', resolved_at = now()
        where id = invitation.id returning * into invitation;
        notification := private.social_graph_notify(
          inviter.id, actor.id, party.id, 'invitation_declined',
          actor.display_name || ' declined the party invitation.',
          'party-invitation-declined:' || invitation.id::text
        );
        insert into public.player_social_audit (
          actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
        ) values (
          actor.id, 'party_invitation', invitation.id, party.id, 'party_invitation_declined',
          'declined', p_client_request_id, party.revision
        );
        response := private.social_graph_result(
          'declined', null, private.social_graph_party_json(party),
          private.social_graph_invitation_json(invitation), private.social_graph_notification_json(notification),
          private.social_graph_party_presence_ids(party.id) || jsonb_build_array(actor.public_presence_id)
        );
      elsif private.social_graph_active_party_id(actor.id) is not null then response := private.social_graph_result('already_in_party');
      elsif exists (
        select 1 from public.player_party_members current_member
        where current_member.party_id = party.id and current_member.status = 'active'
          and private.social_graph_pair_blocked(actor.id, current_member.player_profile_id)
      ) then response := private.social_graph_result('player_unavailable');
      else
        select count(*)::integer into member_count from public.player_party_members
        where party_id = party.id and status = 'active';
        if member_count >= party.capacity then response := private.social_graph_result('party_full');
        else
          insert into public.player_party_members (
            party_id, player_profile_id, role, connection_status, last_world_map_id, last_channel_id
          ) values (
            party.id, actor.id, 'member', 'online', session.world_map_id, session.channel_id
          );
          update public.player_party_invitations set status = 'accepted', resolved_at = now()
          where id = invitation.id returning * into invitation;
          update public.player_party_invitations set status = 'invalidated', resolved_at = now()
          where target_profile_id = actor.id and status = 'pending' and id <> invitation.id;
          update public.player_parties set revision = revision + 1, dormant_deadline = null
          where id = party.id returning * into party;
          perform private.social_graph_invalidate_ready_check(party.id, actor.id, p_client_request_id, party.revision);
          perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
          notification := private.social_graph_notify(
            inviter.id, actor.id, party.id, 'invitation_accepted',
            actor.display_name || ' joined the party.', 'party-joined:' || invitation.id::text
          );
          insert into public.player_social_audit (
            actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
          ) values (
            actor.id, 'party', party.public_party_id, party.id, 'party_invitation_accepted',
            'joined', p_client_request_id, party.revision
          );
          response := private.social_graph_result(
            'accepted', null, private.social_graph_party_json(party),
            private.social_graph_invitation_json(invitation), private.social_graph_notification_json(notification),
            private.social_graph_party_presence_ids(party.id)
          );
        end if;
      end if;
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'party_invite_respond', p_client_request_id, request_hash, response);
  return response;
exception when unique_violation then
  response := private.social_graph_result('already_in_party');
  perform private.social_graph_store_replay(actor.id, 'party_invite_respond', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.cancel_realtime_party_invitation(
  p_session_id uuid, p_invitation_id uuid, p_expected_revision integer, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  invitation public.player_party_invitations%rowtype; party public.player_parties%rowtype;
  target public.player_profiles%rowtype; replay jsonb; response jsonb; request_hash text;
begin
  if p_expected_revision < 1 or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_PARTY_INVITATION_CANCEL';
  end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_invitation_id::text || ':' || p_expected_revision::text;
  replay := private.social_graph_replay(actor.id, 'party_invite_cancel', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into invitation from public.player_party_invitations where id = p_invitation_id for update;
  if not found or invitation.inviter_profile_id <> actor.id or invitation.status <> 'pending' then
    response := private.social_graph_result('invitation_changed');
  else
    select * into party from public.player_parties where id = invitation.party_id and status = 'active' for update;
    select * into strict target from public.player_profiles where id = invitation.target_profile_id;
    if not found or party.leader_profile_id <> actor.id then response := private.social_graph_result('not_party_leader');
    elsif party.revision <> p_expected_revision then response := private.social_graph_result('party_changed');
    else
      update public.player_party_invitations set status = 'cancelled', resolved_at = now()
      where id = invitation.id returning * into invitation;
      update public.player_parties set revision = revision + 1 where id = party.id returning * into party;
      perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
      insert into public.player_social_audit (
        actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
      ) values (
        actor.id, 'party_invitation', invitation.id, party.id, 'party_invitation_cancelled',
        'cancelled', p_client_request_id, party.revision
      );
      response := private.social_graph_result(
        'cancelled', null, private.social_graph_party_json(party),
        private.social_graph_invitation_json(invitation), null,
        private.social_graph_party_presence_ids(party.id) || jsonb_build_array(target.public_presence_id)
      );
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'party_invite_cancel', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.leave_realtime_party(
  p_session_id uuid, p_expected_revision integer, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  member public.player_party_members%rowtype; party public.player_parties%rowtype;
  affected jsonb; replay jsonb; response jsonb; request_hash text;
begin
  if p_expected_revision < 1 or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then raise exception using errcode = '22023', message = 'INVALID_PARTY_LEAVE'; end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_expected_revision::text;
  replay := private.social_graph_replay(actor.id, 'party_leave', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into member from public.player_party_members where player_profile_id = actor.id and status = 'active';
  if not found then response := private.social_graph_result('party_changed');
  else
    select * into party from public.player_parties where id = member.party_id and status = 'active' for update;
    if not found or party.revision <> p_expected_revision then response := private.social_graph_result('party_changed');
    else
      affected := private.social_graph_party_presence_ids(party.id);
      party := private.social_graph_remove_party_member(party.id, actor.id, 'left', actor.id, p_client_request_id);
      response := private.social_graph_result(
        'left', null, case when party.status = 'active' then private.social_graph_party_json(party) else null end,
        null, null, affected
      );
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'party_leave', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.kick_realtime_party_member(
  p_session_id uuid, p_target_presence_id uuid, p_expected_revision integer,
  p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  target public.player_profiles%rowtype; actor_member public.player_party_members%rowtype;
  target_member public.player_party_members%rowtype; party public.player_parties%rowtype;
  affected jsonb; replay jsonb; response jsonb; request_hash text;
begin
  if p_expected_revision < 1 or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then raise exception using errcode = '22023', message = 'INVALID_PARTY_KICK'; end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_target_presence_id::text || ':' || p_expected_revision::text;
  replay := private.social_graph_replay(actor.id, 'party_kick', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into target from public.player_profiles where public_presence_id = p_target_presence_id;
  select * into actor_member from public.player_party_members where player_profile_id = actor.id and status = 'active';
  if not found or target.id is null or target.id = actor.id or actor_member.role <> 'leader' then
    response := private.social_graph_result('not_party_leader');
  else
    select * into party from public.player_parties where id = actor_member.party_id and status = 'active' for update;
    select * into target_member from public.player_party_members
    where party_id = party.id and player_profile_id = target.id and status = 'active';
    if party.revision <> p_expected_revision then response := private.social_graph_result('party_changed');
    elsif not found or target_member.role = 'leader' then response := private.social_graph_result('party_changed');
    else
      affected := private.social_graph_party_presence_ids(party.id);
      party := private.social_graph_remove_party_member(party.id, target.id, 'kicked', actor.id, p_client_request_id);
      perform private.social_graph_notify(
        target.id, actor.id, party.id, 'member_kicked', 'You were removed from the party.',
        'party-kicked:' || party.id::text || ':' || party.revision::text
      );
      response := private.social_graph_result(
        'kicked', null, private.social_graph_party_json(party), null, null,
        affected || jsonb_build_array(target.public_presence_id)
      );
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'party_kick', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.promote_realtime_party_leader(
  p_session_id uuid, p_target_presence_id uuid, p_expected_revision integer,
  p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  target public.player_profiles%rowtype; actor_member public.player_party_members%rowtype;
  target_member public.player_party_members%rowtype; party public.player_parties%rowtype;
  replay jsonb; response jsonb; request_hash text;
begin
  if p_expected_revision < 1 or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then raise exception using errcode = '22023', message = 'INVALID_PARTY_PROMOTION'; end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_target_presence_id::text || ':' || p_expected_revision::text;
  replay := private.social_graph_replay(actor.id, 'party_promote', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into target from public.player_profiles where public_presence_id = p_target_presence_id;
  select * into actor_member from public.player_party_members where player_profile_id = actor.id and status = 'active';
  if not found or target.id is null or target.id = actor.id or actor_member.role <> 'leader' then
    response := private.social_graph_result('not_party_leader');
  else
    select * into party from public.player_parties where id = actor_member.party_id and status = 'active' for update;
    select * into target_member from public.player_party_members
    where party_id = party.id and player_profile_id = target.id and status = 'active' for update;
    if party.revision <> p_expected_revision then response := private.social_graph_result('party_changed');
    elsif not found then response := private.social_graph_result('party_changed');
    else
      update public.player_party_members set role = 'member' where id = actor_member.id;
      update public.player_party_members set role = 'leader' where id = target_member.id;
      update public.player_parties
      set leader_profile_id = target.id, revision = revision + 1,
        leader_reconnect_deadline = null, dormant_deadline = null
      where id = party.id returning * into party;
      perform private.social_graph_invalidate_ready_check(party.id, actor.id, p_client_request_id, party.revision);
      perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
      perform private.social_graph_notify(
        target.id, actor.id, party.id, 'leader_changed', 'You are now the party leader.',
        'party-promoted:' || party.id::text || ':' || party.revision::text
      );
      insert into public.player_social_audit (
        actor_profile_id, entity_type, entity_id, party_id, action, result, request_id,
        party_revision, details
      ) values (
        actor.id, 'party', party.public_party_id, party.id, 'party_leader_promoted',
        'transferred', p_client_request_id, party.revision,
        jsonb_build_object('newLeaderProfileId', target.id)
      );
      response := private.social_graph_result(
        'promoted', null, private.social_graph_party_json(party), null, null,
        private.social_graph_party_presence_ids(party.id)
      );
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'party_promote', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.disband_realtime_party(
  p_session_id uuid, p_expected_revision integer, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  member public.player_party_members%rowtype; party public.player_parties%rowtype;
  affected jsonb; replay jsonb; response jsonb; request_hash text;
begin
  if p_expected_revision < 1 or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then raise exception using errcode = '22023', message = 'INVALID_PARTY_DISBAND'; end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_expected_revision::text;
  replay := private.social_graph_replay(actor.id, 'party_disband', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into member from public.player_party_members where player_profile_id = actor.id and status = 'active';
  if not found or member.role <> 'leader' then response := private.social_graph_result('not_party_leader');
  else
    select * into party from public.player_parties where id = member.party_id and status = 'active' for update;
    if not found or party.revision <> p_expected_revision then response := private.social_graph_result('party_changed');
    else
      affected := private.social_graph_party_presence_ids(party.id);
      update public.player_parties set status = 'disbanded', revision = revision + 1,
        closed_at = now(), leader_reconnect_deadline = null, dormant_deadline = null
      where id = party.id returning * into party;
      update public.player_party_members set status = 'left', ended_at = now(), connection_status = 'offline'
      where party_id = party.id and status = 'active';
      update public.player_party_invitations set status = 'invalidated', resolved_at = now()
      where party_id = party.id and status = 'pending';
      perform private.social_graph_invalidate_ready_check(party.id, actor.id, p_client_request_id, party.revision);
      insert into public.player_social_audit (
        actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
      ) values (
        actor.id, 'party', party.public_party_id, party.id, 'party_disbanded',
        'disbanded', p_client_request_id, party.revision
      );
      response := private.social_graph_result('disbanded', null, null, null, null, affected);
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'party_disband', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.start_realtime_party_ready_check(
  p_session_id uuid, p_expected_revision integer, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  member public.player_party_members%rowtype; party public.player_parties%rowtype;
  check_row public.player_party_ready_checks%rowtype; settings public.social_graph_settings%rowtype;
  replay jsonb; response jsonb; request_hash text;
begin
  if p_expected_revision < 1 or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then raise exception using errcode = '22023', message = 'INVALID_READY_CHECK'; end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_expected_revision::text;
  replay := private.social_graph_replay(actor.id, 'ready_check_start', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into member from public.player_party_members where player_profile_id = actor.id and status = 'active';
  if not found or member.role <> 'leader' then response := private.social_graph_result('not_party_leader');
  else
    select * into party from public.player_parties where id = member.party_id and status = 'active' for update;
    if not found or party.revision <> p_expected_revision then response := private.social_graph_result('party_changed');
    elsif exists (select 1 from public.player_party_ready_checks where party_id = party.id and status = 'active') then
      response := private.social_graph_result('party_changed');
    else
      select * into strict settings from public.social_graph_settings where singleton_key;
      update public.player_parties set revision = revision + 1 where id = party.id returning * into party;
      insert into public.player_party_ready_checks (
        party_id, party_revision, created_by_profile_id, expires_at
      ) values (
        party.id, party.revision, actor.id,
        now() + make_interval(secs => settings.ready_check_expiry_seconds)
      ) returning * into check_row;
      insert into public.player_party_ready_responses (ready_check_id, player_profile_id, state)
      select check_row.id, party_member.player_profile_id,
        case when party_member.connection_status = 'online' then 'waiting' else 'disconnected' end
      from public.player_party_members party_member
      where party_member.party_id = party.id and party_member.status = 'active';
      perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
      insert into public.player_social_audit (
        actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
      ) values (
        actor.id, 'ready_check', check_row.public_ready_check_id, party.id, 'ready_check_started',
        'active', p_client_request_id, party.revision
      );
      response := private.social_graph_result(
        'started', null, private.social_graph_party_json(party), null, null,
        private.social_graph_party_presence_ids(party.id)
      );
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'ready_check_start', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.respond_realtime_party_ready_check(
  p_session_id uuid, p_ready_check_id uuid, p_expected_revision integer,
  p_response text, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  member public.player_party_members%rowtype; party public.player_parties%rowtype;
  check_row public.player_party_ready_checks%rowtype; ready_response public.player_party_ready_responses%rowtype;
  replay jsonb; response jsonb; request_hash text; waiting_count integer;
begin
  if p_response not in ('ready', 'not_ready') or p_expected_revision < 1
     or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_READY_RESPONSE';
  end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_ready_check_id::text || ':' || p_expected_revision::text || ':' || p_response;
  replay := private.social_graph_replay(actor.id, 'ready_check_respond', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into member from public.player_party_members where player_profile_id = actor.id and status = 'active';
  if not found then response := private.social_graph_result('party_changed');
  else
    select * into party from public.player_parties where id = member.party_id and status = 'active' for update;
    select * into check_row from public.player_party_ready_checks
    where public_ready_check_id = p_ready_check_id and party_id = party.id and status = 'active' for update;
    if party.revision <> p_expected_revision or not found then response := private.social_graph_result('party_changed');
    elsif check_row.expires_at <= now() then
      update public.player_party_ready_checks set status = 'expired', completed_at = now()
      where id = check_row.id;
      response := private.social_graph_result('party_changed');
    else
      select * into ready_response from public.player_party_ready_responses
      where ready_check_id = check_row.id and player_profile_id = actor.id for update;
      if not found then response := private.social_graph_result('party_changed');
      else
        update public.player_party_ready_responses
        set state = p_response, responded_at = now() where ready_check_id = check_row.id and player_profile_id = actor.id;
        update public.player_parties set revision = revision + 1 where id = party.id returning * into party;
        update public.player_party_ready_checks set party_revision = party.revision where id = check_row.id returning * into check_row;
        select count(*)::integer into waiting_count from public.player_party_ready_responses
        where ready_check_id = check_row.id and state in ('waiting', 'disconnected');
        if waiting_count = 0 then
          update public.player_party_ready_checks set status = 'completed', completed_at = now()
          where id = check_row.id returning * into check_row;
        end if;
        perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
        insert into public.player_social_audit (
          actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
        ) values (
          actor.id, 'ready_check', check_row.public_ready_check_id, party.id, 'ready_check_responded',
          p_response, p_client_request_id, party.revision
        );
        response := private.social_graph_result(
          'updated', null, private.social_graph_party_json(party), null, null,
          private.social_graph_party_presence_ids(party.id)
        );
      end if;
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'ready_check_respond', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.handle_realtime_social_graph_disconnect(
  p_session_id uuid, p_reason text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  member public.player_party_members%rowtype; party public.player_parties%rowtype;
  settings public.social_graph_settings%rowtype; affected jsonb := '[]'::jsonb;
begin
  if char_length(p_reason) not between 1 and 64 or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_SOCIAL_GRAPH_DISCONNECT';
  end if;
  select * into session from public.realtime_sessions where id = p_session_id;
  if not found then return private.social_graph_result('unchanged'); end if;
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  if p_reason in ('player_suspended', 'access_revoked', 'authorization_failed') then
    update public.player_friend_requests set status = 'invalidated', resolved_at = now()
    where status = 'pending' and (requester_profile_id = actor.id or target_profile_id = actor.id);
    update public.player_party_invitations set status = 'invalidated', resolved_at = now()
    where status = 'pending' and target_profile_id = actor.id;
  end if;
  select * into member from public.player_party_members
  where player_profile_id = actor.id and status = 'active';
  if not found then
    return private.social_graph_result(
      case when p_reason in ('player_suspended', 'access_revoked', 'authorization_failed')
        then 'removed' else 'unchanged' end,
      null, null, null, null, jsonb_build_array(actor.public_presence_id)
    );
  end if;
  select * into party from public.player_parties where id = member.party_id and status = 'active' for update;
  if not found then return private.social_graph_result('unchanged'); end if;
  affected := private.social_graph_party_presence_ids(party.id);
  if p_reason in ('player_suspended', 'access_revoked', 'authorization_failed') then
    party := private.social_graph_remove_party_member(party.id, actor.id, 'removed', actor.id, p_request_id);
    return private.social_graph_result(
      'removed', null, case when party.status = 'active' then private.social_graph_party_json(party) else null end,
      null, null, affected
    );
  end if;
  select * into strict settings from public.social_graph_settings where singleton_key;
  update public.player_party_members set connection_status = 'reconnecting'
  where id = member.id;
  update public.player_party_ready_responses response set state = 'disconnected', responded_at = null
  from public.player_party_ready_checks ready
  where ready.party_id = party.id and ready.status = 'active'
    and response.ready_check_id = ready.id and response.player_profile_id = actor.id;
  update public.player_parties
  set revision = revision + 1,
    leader_reconnect_deadline = case when leader_profile_id = actor.id
      then now() + make_interval(secs => settings.leader_reconnect_grace_seconds)
      else leader_reconnect_deadline end
  where id = party.id returning * into party;
  perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
  insert into public.player_social_audit (
    actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision,
    details
  ) values (
    actor.id, 'party', party.public_party_id, party.id, 'party_member_disconnected',
    'reconnecting', p_request_id, party.revision, jsonb_build_object('reason', p_reason)
  );
  return private.social_graph_result(
    'reconnecting', null, private.social_graph_party_json(party), null, null, affected
  );
end;
$$;

create or replace function public.invalidate_realtime_social_graph_pair(
  p_session_id uuid, p_target_presence_id uuid, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  target public.player_profiles%rowtype; actor_party_id uuid; target_party_id uuid;
  party public.player_parties%rowtype; affected jsonb;
begin
  if char_length(p_request_id) not between 1 and 128 then raise exception using errcode = '22023', message = 'INVALID_SOCIAL_GRAPH_INVALIDATION'; end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  select * into target from public.player_profiles where public_presence_id = p_target_presence_id;
  if not found or target.id = actor.id then return private.social_graph_result('player_unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended(least(actor.id, target.id)::text || greatest(actor.id, target.id)::text, 0));
  update public.player_friend_requests set status = 'invalidated', resolved_at = now()
  where status = 'pending' and (
    (requester_profile_id = actor.id and target_profile_id = target.id)
    or (requester_profile_id = target.id and target_profile_id = actor.id)
  );
  update public.player_friendships set status = 'invalidated', ended_at = now()
  where player_one_profile_id = least(actor.id, target.id)
    and player_two_profile_id = greatest(actor.id, target.id) and status = 'accepted';
  update public.player_party_invitations set status = 'invalidated', resolved_at = now()
  where status = 'pending' and (
    (inviter_profile_id = actor.id and target_profile_id = target.id)
    or (inviter_profile_id = target.id and target_profile_id = actor.id)
  );
  actor_party_id := private.social_graph_active_party_id(actor.id);
  target_party_id := private.social_graph_active_party_id(target.id);
  affected := jsonb_build_array(actor.public_presence_id, target.public_presence_id);
  if actor_party_id is not null and actor_party_id = target_party_id then
    affected := private.social_graph_party_presence_ids(actor_party_id);
    party := private.social_graph_remove_party_member(
      actor_party_id, actor.id, 'removed', actor.id, p_request_id
    );
  end if;
  insert into public.player_social_audit (
    actor_profile_id, entity_type, entity_id, party_id, action, result, request_id,
    party_revision, details, moderation_protected
  ) values (
    actor.id, 'friendship', null, actor_party_id, 'social_pair_blocked', 'invalidated',
    p_request_id, party.revision,
    jsonb_build_object('targetProfileId', target.id), true
  );
  return private.social_graph_result(
    'invalidated', null,
    case when party.id is not null and party.status = 'active' then private.social_graph_party_json(party) else null end,
    null, null, affected
  );
end;
$$;

create or replace function public.cleanup_social_graph(p_batch_size integer, p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare settings public.social_graph_settings%rowtype; party public.player_parties%rowtype;
  next_leader public.player_party_members%rowtype; expired_friend_requests integer := 0;
  expired_invitations integer := 0; expired_ready_checks integer := 0;
  leaders_transferred integer := 0; parties_expired integer := 0;
  notifications_removed integer := 0; idempotency_removed integer := 0; audit_removed integer := 0;
begin
  if p_batch_size not between 1 and 10000 or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_SOCIAL_GRAPH_CLEANUP';
  end if;
  select * into strict settings from public.social_graph_settings where singleton_key;
  with candidates as (
    select id from public.player_friend_requests where status = 'pending' and expires_at <= now()
    order by expires_at, id limit p_batch_size for update skip locked
  ) update public.player_friend_requests request set status = 'expired', resolved_at = now()
    from candidates where request.id = candidates.id;
  get diagnostics expired_friend_requests = row_count;
  with candidates as (
    select id from public.player_party_invitations where status = 'pending' and expires_at <= now()
    order by expires_at, id limit p_batch_size for update skip locked
  ) update public.player_party_invitations invitation set status = 'expired', resolved_at = now()
    from candidates where invitation.id = candidates.id;
  get diagnostics expired_invitations = row_count;
  with candidates as (
    select id from public.player_party_ready_checks where status = 'active' and expires_at <= now()
    order by expires_at, id limit p_batch_size for update skip locked
  ) update public.player_party_ready_checks ready set status = 'expired', completed_at = now()
    from candidates where ready.id = candidates.id;
  get diagnostics expired_ready_checks = row_count;

  for party in
    select * from public.player_parties candidate
    where candidate.status = 'active' and candidate.leader_reconnect_deadline <= now()
    order by candidate.leader_reconnect_deadline, candidate.id
    limit p_batch_size for update skip locked
  loop
    select * into next_leader from public.player_party_members member
    where member.party_id = party.id and member.status = 'active'
      and member.player_profile_id <> party.leader_profile_id and member.connection_status = 'online'
    order by member.joined_at, member.id limit 1 for update;
    if found then
      update public.player_party_members set role = 'member'
      where party_id = party.id and player_profile_id = party.leader_profile_id and status = 'active';
      update public.player_party_members set role = 'leader' where id = next_leader.id;
      update public.player_parties set leader_profile_id = next_leader.player_profile_id,
        revision = revision + 1, leader_reconnect_deadline = null, dormant_deadline = null
      where id = party.id returning * into party;
      perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
      insert into public.player_social_audit (
        actor_profile_id, entity_type, entity_id, party_id, action, result, request_id,
        party_revision, details
      ) values (
        null, 'party', party.public_party_id, party.id, 'leader_grace_expired',
        'transferred', p_request_id, party.revision,
        jsonb_build_object('newLeaderProfileId', next_leader.player_profile_id)
      );
      leaders_transferred := leaders_transferred + 1;
    else
      update public.player_parties set leader_reconnect_deadline = null,
        dormant_deadline = coalesce(dormant_deadline, now() + make_interval(secs => settings.party_dormant_timeout_seconds)),
        revision = revision + 1
      where id = party.id;
    end if;
  end loop;

  for party in
    select * from public.player_parties candidate
    where candidate.status = 'active' and candidate.dormant_deadline <= now()
    order by candidate.dormant_deadline, candidate.id
    limit p_batch_size for update skip locked
  loop
    update public.player_parties set status = 'expired', revision = revision + 1,
      closed_at = now(), dormant_deadline = null, leader_reconnect_deadline = null
    where id = party.id returning * into party;
    update public.player_party_members set status = 'left', ended_at = now(), connection_status = 'offline'
    where party_id = party.id and status = 'active';
    update public.player_party_invitations set status = 'invalidated', resolved_at = now()
    where party_id = party.id and status = 'pending';
    perform private.social_graph_invalidate_ready_check(party.id, null, p_request_id, party.revision);
    insert into public.player_social_audit (
      actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
    ) values (
      null, 'party', party.public_party_id, party.id, 'dormant_party_expired',
      'expired', p_request_id, party.revision
    );
    parties_expired := parties_expired + 1;
  end loop;

  with candidates as (
    select id from public.player_social_notifications where expires_at <= now()
    order by expires_at, id limit p_batch_size
  ) delete from public.player_social_notifications notification using candidates
    where notification.id = candidates.id;
  get diagnostics notifications_removed = row_count;
  perform set_config('starville.social_cleanup', 'enabled', true);
  with candidates as (
    select player_profile_id, client_request_id from public.player_social_idempotency
    where created_at <= now() - make_interval(hours => settings.idempotency_retention_hours)
    order by created_at, player_profile_id, client_request_id limit p_batch_size
  ) delete from public.player_social_idempotency idempotency using candidates
    where idempotency.player_profile_id = candidates.player_profile_id
      and idempotency.client_request_id = candidates.client_request_id;
  get diagnostics idempotency_removed = row_count;
  with candidates as (
    select id from public.player_social_audit
    where created_at <= now() - make_interval(days => settings.audit_retention_days)
      and not moderation_protected order by created_at, id limit p_batch_size
  ) delete from public.player_social_audit audit using candidates where audit.id = candidates.id;
  get diagnostics audit_removed = row_count;
  perform set_config('starville.social_cleanup', 'disabled', true);
  return jsonb_build_object(
    'expiredFriendRequests', expired_friend_requests,
    'expiredInvitations', expired_invitations,
    'expiredReadyChecks', expired_ready_checks,
    'leadersTransferred', leaders_transferred,
    'partiesExpired', parties_expired,
    'notificationsRemoved', notifications_removed,
    'idempotencyRemoved', idempotency_removed,
    'auditRemoved', audit_removed
  );
end;
$$;

create or replace function public.get_admin_social_graph(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_status text, p_search text, p_page integer, p_page_size integer
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare total integer; friendship_request_count integer; accepted_friendship_count integer;
  recent_disband_count integer;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'social_graph.read') then
    raise exception using errcode = '42501', message = 'SOCIAL_GRAPH_ACCESS_DENIED';
  end if;
  if p_status not in ('all', 'active', 'disbanded', 'expired') or p_page < 1
     or p_page_size not in (10, 50, 100) or char_length(coalesce(p_search, '')) > 80 then
    raise exception using errcode = '22023', message = 'INVALID_SOCIAL_GRAPH_QUERY';
  end if;
  select count(*)::integer into total from public.player_parties party
  join public.player_profiles leader on leader.id = party.leader_profile_id
  where (p_status = 'all' or party.status = p_status)
    and (coalesce(p_search, '') = '' or party.public_party_id::text = p_search
      or leader.display_name ilike '%' || p_search || '%');
  select count(*)::integer into friendship_request_count from public.player_friend_requests
  where created_at > now() - interval '24 hours';
  select count(*)::integer into accepted_friendship_count from public.player_friendships
  where status = 'accepted';
  select count(*)::integer into recent_disband_count from public.player_parties
  where status in ('disbanded', 'expired') and closed_at > now() - interval '24 hours';
  return jsonb_build_object(
    'parties', coalesce((select jsonb_agg(jsonb_build_object(
      'partyId', page.public_party_id,
      'status', page.status,
      'revision', page.revision,
      'capacity', page.capacity,
      'leaderDisplayName', leader.display_name,
      'memberCount', (select count(*)::integer from public.player_party_members member
        where member.party_id = page.id and member.status = 'active'),
      'reconnectingCount', (select count(*)::integer from public.player_party_members member
        where member.party_id = page.id and member.status = 'active'
          and member.connection_status = 'reconnecting'),
      'pendingInvitationCount', (select count(*)::integer from public.player_party_invitations invitation
        where invitation.party_id = page.id and invitation.status = 'pending' and invitation.expires_at > now()),
      'createdAt', page.created_at,
      'updatedAt', page.updated_at
    ) order by page.updated_at desc, page.id desc)
    from (
      select * from public.player_parties party
      where (p_status = 'all' or party.status = p_status)
        and (coalesce(p_search, '') = '' or party.public_party_id::text = p_search
          or exists (select 1 from public.player_profiles profile
            where profile.id = party.leader_profile_id and profile.display_name ilike '%' || p_search || '%'))
      order by party.updated_at desc, party.id desc
      limit p_page_size offset (p_page - 1) * p_page_size
    ) page
    join public.player_profiles leader on leader.id = page.leader_profile_id), '[]'::jsonb),
    'friendshipRequestCount', friendship_request_count,
    'acceptedFriendshipCount', accepted_friendship_count,
    'recentDisbandCount', recent_disband_count,
    'page', p_page,
    'pageSize', p_page_size,
    'total', total,
    'totalPages', ceil(total::numeric / p_page_size)::integer
  );
end;
$$;

create or replace function public.get_admin_social_graph_party(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text, p_public_party_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare party public.player_parties%rowtype;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'social_graph.audit.read') then
    raise exception using errcode = '42501', message = 'SOCIAL_GRAPH_AUDIT_DENIED';
  end if;
  select * into party from public.player_parties where public_party_id = p_public_party_id;
  if not found then raise exception using errcode = 'P0002', message = 'SOCIAL_GRAPH_PARTY_NOT_FOUND'; end if;
  return jsonb_build_object(
    'party', private.social_graph_party_json(party),
    'invitations', coalesce((select jsonb_agg(private.social_graph_invitation_json(invitation)
      order by invitation.created_at desc) from (
        select * from public.player_party_invitations source where source.party_id = party.id
        order by source.created_at desc limit 50
      ) invitation), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object(
      'id', audit.id,
      'action', audit.action,
      'result', audit.result,
      'partyRevision', audit.party_revision,
      'createdAt', audit.created_at
    ) order by audit.entry_number desc) from (
      select * from public.player_social_audit source where source.party_id = party.id
      order by source.entry_number desc limit 100
    ) audit), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_admin_social_graph_settings(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare settings public.social_graph_settings%rowtype;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'social_graph.settings.read') then
    raise exception using errcode = '42501', message = 'SOCIAL_GRAPH_SETTINGS_DENIED';
  end if;
  select * into strict settings from public.social_graph_settings where singleton_key;
  return private.social_graph_settings_json(settings);
end;
$$;

create or replace function public.get_admin_social_graph_audit(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_search text, p_page integer, p_page_size integer
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare total integer;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'social_graph.audit.read') then
    raise exception using errcode = '42501', message = 'SOCIAL_GRAPH_AUDIT_DENIED';
  end if;
  if p_page < 1 or p_page_size not in (10, 50, 100)
     or char_length(coalesce(p_search, '')) > 80 then
    raise exception using errcode = '22023', message = 'INVALID_SOCIAL_GRAPH_AUDIT_QUERY';
  end if;
  select count(*)::integer into total
  from public.player_social_audit audit
  left join public.player_parties party on party.id = audit.party_id
  where coalesce(p_search, '') = ''
    or audit.action ilike '%' || p_search || '%'
    or audit.result ilike '%' || p_search || '%'
    or party.public_party_id::text = p_search;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', page.id,
      'entityType', page.entity_type,
      'entityId', page.entity_id,
      'partyId', party.public_party_id,
      'actorPresenceId', actor.public_presence_id,
      'action', page.action,
      'result', page.result,
      'requestId', page.request_id,
      'partyRevision', page.party_revision,
      'moderationProtected', page.moderation_protected,
      'createdAt', page.created_at
    ) order by page.entry_number desc)
    from (
      select audit.* from public.player_social_audit audit
      left join public.player_parties filter_party on filter_party.id = audit.party_id
      where coalesce(p_search, '') = ''
        or audit.action ilike '%' || p_search || '%'
        or audit.result ilike '%' || p_search || '%'
        or filter_party.public_party_id::text = p_search
      order by audit.entry_number desc
      limit p_page_size offset (p_page - 1) * p_page_size
    ) page
    left join public.player_parties party on party.id = page.party_id
    left join public.player_profiles actor on actor.id = page.actor_profile_id), '[]'::jsonb),
    'page', p_page,
    'pageSize', p_page_size,
    'total', total,
    'totalPages', ceil(total::numeric / p_page_size)::integer
  );
end;
$$;

create or replace function public.update_admin_social_graph_settings(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_expected_version integer, p_maximum_friends integer, p_party_capacity integer,
  p_friend_request_expiry_seconds integer, p_party_invitation_expiry_seconds integer,
  p_ready_check_expiry_seconds integer, p_leader_reconnect_grace_seconds integer,
  p_party_dormant_timeout_seconds integer,
  p_nearby_invitations_enabled boolean, p_party_chat_enabled boolean,
  p_friend_location_visibility_enabled boolean, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare settings public.social_graph_settings%rowtype; previous jsonb;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'social_graph.settings.edit') then
    raise exception using errcode = '42501', message = 'SOCIAL_GRAPH_SETTINGS_EDIT_DENIED';
  end if;
  if p_expected_version < 1 or p_maximum_friends not between 1 and 500
     or p_party_capacity not between 2 and 8
     or p_friend_request_expiry_seconds not between 3600 and 2592000
     or p_party_invitation_expiry_seconds not between 30 and 3600
     or p_ready_check_expiry_seconds not between 10 and 120
     or p_leader_reconnect_grace_seconds not between 15 and 600
     or p_party_dormant_timeout_seconds not between 300 and 604800
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_SOCIAL_GRAPH_SETTINGS';
  end if;
  select * into strict settings from public.social_graph_settings where singleton_key for update;
  if settings.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'SOCIAL_GRAPH_SETTINGS_CHANGED';
  end if;
  previous := private.social_graph_settings_json(settings);
  update public.social_graph_settings set
    version = version + 1,
    maximum_friends = p_maximum_friends,
    party_capacity = p_party_capacity,
    friend_request_expiry_seconds = p_friend_request_expiry_seconds,
    party_invitation_expiry_seconds = p_party_invitation_expiry_seconds,
    ready_check_expiry_seconds = p_ready_check_expiry_seconds,
    leader_reconnect_grace_seconds = p_leader_reconnect_grace_seconds,
    party_dormant_timeout_seconds = p_party_dormant_timeout_seconds,
    nearby_invitations_enabled = p_nearby_invitations_enabled,
    party_chat_enabled = p_party_chat_enabled,
    friend_location_visibility_enabled = p_friend_location_visibility_enabled
  where singleton_key returning * into settings;
  insert into public.player_social_audit (
    actor_profile_id, entity_type, entity_id, action, result, request_id, details
  ) values (
    null, 'settings', null, 'social_graph_settings_updated', 'updated', p_request_id,
    jsonb_build_object('adminUserId', p_user_id, 'before', previous,
      'after', private.social_graph_settings_json(settings))
  );
  return private.social_graph_settings_json(settings);
end;
$$;

alter table public.multiplayer_chat_messages
  add column party_id uuid references public.player_parties(id) on delete restrict;
alter table public.multiplayer_chat_messages
  drop constraint multiplayer_chat_messages_scope_check;
alter table public.multiplayer_chat_messages
  add constraint multiplayer_chat_messages_scope_check
  check (scope in ('nearby', 'channel', 'party', 'system'));
alter table public.multiplayer_chat_messages
  add constraint multiplayer_chat_messages_party_scope_check
  check ((scope = 'party' and party_id is not null) or (scope <> 'party' and party_id is null));
create index multiplayer_chat_messages_party_idx
  on public.multiplayer_chat_messages(party_id, sequence desc) where scope = 'party';

alter table public.multiplayer_chat_reports
  drop constraint multiplayer_chat_reports_evidence_scope_check;
alter table public.multiplayer_chat_reports
  add constraint multiplayer_chat_reports_evidence_scope_check
  check (evidence_scope in ('nearby', 'channel', 'party'));

create or replace function private.multiplayer_chat_message_json(message public.multiplayer_chat_messages)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', message.id,
    'sequence', message.sequence,
    'scope', message.scope,
    'senderPresenceId', message.sender_presence_id,
    'senderDisplayName', message.sender_display_name,
    'senderLevel', message.sender_level,
    'worldId', map.slug,
    'channelId', message.channel_id,
    'partyId', party.public_party_id,
    'sentAt', message.created_at,
    'text', message.message_text,
    'sourceCategory', message.source_category
  )
  from public.world_maps map
  left join public.player_parties party on party.id = message.party_id
  where map.id = message.world_map_id;
$$;

create or replace function public.accept_realtime_chat_message(
  p_session_id uuid,
  p_client_request_id text,
  p_scope text,
  p_message_text text,
  p_sender_position_x numeric,
  p_sender_position_y numeric
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; profile public.player_profiles%rowtype;
  settings public.multiplayer_chat_settings%rowtype; graph_settings public.social_graph_settings%rowtype;
  existing public.multiplayer_chat_messages%rowtype; created public.multiplayer_chat_messages%rowtype;
  muted_until timestamptz; active_party_id uuid;
begin
  select * into settings from public.multiplayer_chat_settings where singleton_key;
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$'
     or p_scope not in ('nearby', 'channel', 'party')
     or char_length(p_message_text) not between 1 and settings.message_max_characters
     or octet_length(p_message_text) > 800 or p_message_text <> btrim(p_message_text)
     or p_message_text ~ '[[:cntrl:]<>]'
     or p_sender_position_x::text = 'NaN' or p_sender_position_y::text = 'NaN'
     or p_sender_position_x not between 0 and 128 or p_sender_position_y not between 0 and 128 then
    return jsonb_build_object('status', 'invalid_content');
  end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict profile from public.player_profiles where id = session.player_profile_id;
  muted_until := private.multiplayer_chat_active_mute(profile.id);
  if muted_until is not null then return jsonb_build_object('status', 'chat_muted', 'mutedUntil', muted_until); end if;
  if p_scope = 'party' then
    select * into strict graph_settings from public.social_graph_settings where singleton_key;
    if not graph_settings.party_chat_enabled then return jsonb_build_object('status', 'access_changed'); end if;
    active_party_id := private.social_graph_active_party_id(profile.id);
    if active_party_id is null then return jsonb_build_object('status', 'access_changed'); end if;
  end if;
  select * into existing from public.multiplayer_chat_messages
  where sender_profile_id = profile.id and client_request_id = p_client_request_id;
  if found then return jsonb_build_object('status', 'replayed', 'message', private.multiplayer_chat_message_json(existing)); end if;
  insert into public.multiplayer_chat_messages (
    client_request_id, sender_profile_id, sender_presence_id, sender_display_name, sender_level,
    world_map_id, channel_id, party_id, scope, message_text, source_category,
    sender_position_x, sender_position_y, visible_until
  ) values (
    p_client_request_id, profile.id, profile.public_presence_id, profile.display_name, profile.public_level,
    session.world_map_id, session.channel_id, active_party_id, p_scope, p_message_text, 'player',
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
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; settings public.multiplayer_chat_settings%rowtype;
  scope_name text; histories jsonb := '[]'::jsonb; messages jsonb; preferences jsonb;
  muted_until timestamptz; active_party_id uuid;
begin
  session := private.social_graph_active_session(p_session_id);
  select * into strict settings from public.multiplayer_chat_settings where singleton_key;
  active_party_id := private.social_graph_active_party_id(session.player_profile_id);
  foreach scope_name in array array['nearby', 'channel', 'party', 'system'] loop
    select coalesce(jsonb_agg(entry.message order by entry.sequence), '[]'::jsonb)
    into messages from (
      select private.multiplayer_chat_message_json(message) as message, message.sequence
      from public.multiplayer_chat_messages message
      where message.visible_until > now() and message.scope = scope_name
        and (
          (scope_name = 'party' and active_party_id is not null and message.party_id = active_party_id)
          or (scope_name <> 'party' and message.world_map_id = session.world_map_id
            and message.channel_id = session.channel_id)
        )
        and (message.scope <> 'nearby'
          or sqrt(power(message.sender_position_x - session.last_position_x, 2)
            + power(message.sender_position_y - session.last_position_y, 2)) <= settings.nearby_distance)
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
  p_session_id uuid, p_scope text, p_after_sequence bigint
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; settings public.multiplayer_chat_settings%rowtype;
  messages jsonb; active_party_id uuid;
begin
  if p_scope not in ('nearby', 'channel', 'party', 'system') or p_after_sequence < 0 then
    raise exception using errcode = '22023', message = 'INVALID_CHAT_HISTORY_REQUEST';
  end if;
  select * into session from public.realtime_sessions where id = p_session_id and status = 'active';
  if not found then raise exception using errcode = '42501', message = 'CHAT_SESSION_CLOSED'; end if;
  select * into strict settings from public.multiplayer_chat_settings where singleton_key;
  active_party_id := private.social_graph_active_party_id(session.player_profile_id);
  if p_scope = 'party' and active_party_id is null then
    raise exception using errcode = '42501', message = 'PARTY_CHAT_DENIED';
  end if;
  select coalesce(jsonb_agg(entry.message order by entry.sequence), '[]'::jsonb)
  into messages from (
    select private.multiplayer_chat_message_json(message) message, message.sequence
    from public.multiplayer_chat_messages message
    where message.scope = p_scope and message.sequence > p_after_sequence and message.visible_until > now()
      and ((p_scope = 'party' and message.party_id = active_party_id)
        or (p_scope <> 'party' and message.world_map_id = session.world_map_id and message.channel_id = session.channel_id))
      and (message.scope <> 'nearby' or sqrt(power(message.sender_position_x - session.last_position_x, 2)
        + power(message.sender_position_y - session.last_position_y, 2)) <= settings.nearby_distance)
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

create or replace function public.report_realtime_chat_message(
  p_session_id uuid, p_message_id uuid, p_category text, p_reason text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; message public.multiplayer_chat_messages%rowtype;
  existing public.multiplayer_chat_reports%rowtype; created public.multiplayer_chat_reports%rowtype;
  active_party_id uuid;
begin
  if p_category not in ('harassment', 'hate_or_abuse', 'spam', 'scam_or_suspicious_link', 'impersonation', 'sexual_content', 'other')
     or p_request_id !~ '^[A-Za-z0-9._:-]{1,64}$'
     or char_length(p_reason) not between 3 and 500 or p_reason <> btrim(p_reason)
     or p_reason ~ '[[:cntrl:]<>]' then
    raise exception using errcode = '22023', message = 'INVALID_CHAT_REPORT';
  end if;
  session := private.social_graph_active_session(p_session_id);
  active_party_id := private.social_graph_active_party_id(session.player_profile_id);
  select * into message from public.multiplayer_chat_messages candidate
  where candidate.id = p_message_id and candidate.sender_profile_id is not null
    and candidate.sender_profile_id <> session.player_profile_id
    and ((candidate.scope = 'party' and active_party_id is not null and candidate.party_id = active_party_id)
      or (candidate.scope <> 'party' and candidate.world_map_id = session.world_map_id
        and candidate.channel_id = session.channel_id));
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

do $$
declare signature text;
begin
  foreach signature in array array[
    'private.reject_player_social_immutable_mutation()',
    'private.social_graph_active_session(uuid)',
    'private.social_graph_player_json(public.player_profiles)',
    'private.social_graph_pair_blocked(uuid,uuid)',
    'private.social_graph_friendship_exists(uuid,uuid)',
    'private.social_graph_active_party_id(uuid)',
    'private.social_graph_settings_json(public.social_graph_settings)',
    'private.social_graph_friend_request_json(public.player_friend_requests)',
    'private.social_graph_invitation_json(public.player_party_invitations)',
    'private.social_graph_ready_check_json(public.player_party_ready_checks)',
    'private.social_graph_party_json(public.player_parties)',
    'private.social_graph_friend_json(uuid,uuid,public.player_friendships,boolean)',
    'private.social_graph_notification_json(public.player_social_notifications)',
    'private.social_graph_notify(uuid,uuid,uuid,text,text,text)',
    'private.social_graph_replay(uuid,text,text,text)',
    'private.social_graph_store_replay(uuid,text,text,text,jsonb)',
    'private.social_graph_result(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'private.social_graph_sync_pending_invitation_revisions(uuid,integer)',
    'private.social_graph_invalidate_ready_check(uuid,uuid,text,integer)',
    'private.social_graph_party_presence_ids(uuid)',
    'private.social_graph_remove_party_member(uuid,uuid,text,uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', signature);
  end loop;
end;
$$;

revoke all on function public.get_realtime_social_graph_bootstrap(uuid) from public,anon,authenticated,service_role;
revoke all on function public.send_realtime_friend_request(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.respond_realtime_friend_request(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.cancel_realtime_friend_request(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.remove_realtime_friend(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.create_realtime_party(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.send_realtime_party_invitation(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.respond_realtime_party_invitation(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.cancel_realtime_party_invitation(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.leave_realtime_party(uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.kick_realtime_party_member(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.promote_realtime_party_leader(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.disband_realtime_party(uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.start_realtime_party_ready_check(uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.respond_realtime_party_ready_check(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.handle_realtime_social_graph_disconnect(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.invalidate_realtime_social_graph_pair(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.cleanup_social_graph(integer,text) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_social_graph(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_social_graph_party(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_social_graph_settings(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_social_graph_audit(uuid,uuid,text,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.update_admin_social_graph_settings(uuid,uuid,text,integer,integer,integer,integer,integer,integer,integer,integer,boolean,boolean,boolean,text) from public,anon,authenticated,service_role;

revoke all on function public.accept_realtime_chat_message(uuid,text,text,text,numeric,numeric) from public,anon,authenticated,service_role;
revoke all on function public.get_realtime_chat_bootstrap(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_realtime_chat_history(uuid,text,bigint) from public,anon,authenticated,service_role;
revoke all on function public.report_realtime_chat_message(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

grant execute on function public.get_realtime_social_graph_bootstrap(uuid) to service_role;
grant execute on function public.send_realtime_friend_request(uuid,uuid,text) to service_role;
grant execute on function public.respond_realtime_friend_request(uuid,uuid,text,text) to service_role;
grant execute on function public.cancel_realtime_friend_request(uuid,uuid,text) to service_role;
grant execute on function public.remove_realtime_friend(uuid,uuid,text) to service_role;
grant execute on function public.create_realtime_party(uuid,text) to service_role;
grant execute on function public.send_realtime_party_invitation(uuid,uuid,integer,text) to service_role;
grant execute on function public.respond_realtime_party_invitation(uuid,uuid,integer,text,text) to service_role;
grant execute on function public.cancel_realtime_party_invitation(uuid,uuid,integer,text) to service_role;
grant execute on function public.leave_realtime_party(uuid,integer,text) to service_role;
grant execute on function public.kick_realtime_party_member(uuid,uuid,integer,text) to service_role;
grant execute on function public.promote_realtime_party_leader(uuid,uuid,integer,text) to service_role;
grant execute on function public.disband_realtime_party(uuid,integer,text) to service_role;
grant execute on function public.start_realtime_party_ready_check(uuid,integer,text) to service_role;
grant execute on function public.respond_realtime_party_ready_check(uuid,uuid,integer,text,text) to service_role;
grant execute on function public.handle_realtime_social_graph_disconnect(uuid,text,text) to service_role;
grant execute on function public.invalidate_realtime_social_graph_pair(uuid,uuid,text) to service_role;
grant execute on function public.cleanup_social_graph(integer,text) to service_role;
grant execute on function public.get_admin_social_graph(uuid,uuid,text,text,text,integer,integer) to service_role;
grant execute on function public.get_admin_social_graph_party(uuid,uuid,text,uuid) to service_role;
grant execute on function public.get_admin_social_graph_settings(uuid,uuid,text) to service_role;
grant execute on function public.get_admin_social_graph_audit(uuid,uuid,text,text,integer,integer) to service_role;
grant execute on function public.update_admin_social_graph_settings(uuid,uuid,text,integer,integer,integer,integer,integer,integer,integer,integer,boolean,boolean,boolean,text) to service_role;

grant execute on function public.accept_realtime_chat_message(uuid,text,text,text,numeric,numeric) to service_role;
grant execute on function public.get_realtime_chat_bootstrap(uuid) to service_role;
grant execute on function public.get_realtime_chat_history(uuid,text,bigint) to service_role;
grant execute on function public.report_realtime_chat_message(uuid,uuid,text,text,text) to service_role;
