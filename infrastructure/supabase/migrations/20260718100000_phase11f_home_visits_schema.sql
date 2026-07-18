-- Starville Phase 11F: owner-present live home visits, social permissions,
-- bounded guest interactions, moderation evidence, and fail-closed storage.

insert into public.admin_permissions
  (key,name,description,category,is_sensitive,is_system)
values
  ('home_visits.inspect','Inspect live home visits','Inspect bounded session, participant, invitation, guestbook, appreciation, helper, and report projections.','moderation',false,true),
  ('home_visits.manage','Manage live home visits','Close selected live sessions and apply narrow audited visit corrections.','moderation',true,true),
  ('home_visits.policies.inspect','Inspect home visit policy','Inspect versioned capacity, grace, invitation, guestbook, appreciation, helper, and live-ops policy.','live_operations',false,true),
  ('home_visits.policies.manage','Manage home visit policy','Create, validate, and activate bounded home-visit policy successors.','live_operations',true,true),
  ('home_visits.guestbooks.inspect','Inspect home guestbooks','Inspect bounded guestbook entries and moderation evidence.','moderation',true,true),
  ('home_visits.guestbooks.moderate','Moderate home guestbooks','Hide or restore guestbook entries through audited moderation.','moderation',true,true),
  ('home_visits.helper_activity.inspect','Inspect home helper activity','Inspect bounded crop-watering helper attempts without granting rewards.','moderation',false,true),
  ('home_visits.reports.inspect','Inspect home visit reports','Inspect home-visit report evidence through the existing moderation authority.','moderation',true,true),
  ('home_visits.reconciliation.manage','Manage home visit reconciliation','Run bounded visit reconciliation and evidence-preserving repair.','live_operations',true,true),
  ('home_visits.live_ops.manage','Manage home visit live ops','Pause admissions or social capabilities and close sessions during maintenance.','live_operations',true,true),
  ('home_visits.telemetry.inspect','Inspect home visit telemetry','Inspect aggregate home-visit telemetry without private message or location data.','analytics',false,true)
on conflict (key) do update set
  name=excluded.name,description=excluded.description,category=excluded.category,
  is_sensitive=excluded.is_sensitive,is_system=true;

with mapping(role_key,permission_key) as (values
  ('game_administrator','home_visits.inspect'),('game_administrator','home_visits.manage'),
  ('game_administrator','home_visits.policies.inspect'),('game_administrator','home_visits.policies.manage'),
  ('game_administrator','home_visits.guestbooks.inspect'),('game_administrator','home_visits.guestbooks.moderate'),
  ('game_administrator','home_visits.helper_activity.inspect'),('game_administrator','home_visits.reports.inspect'),
  ('game_administrator','home_visits.reconciliation.manage'),('game_administrator','home_visits.live_ops.manage'),
  ('game_administrator','home_visits.telemetry.inspect'),
  ('live_operations_manager','home_visits.inspect'),('live_operations_manager','home_visits.manage'),
  ('live_operations_manager','home_visits.policies.inspect'),('live_operations_manager','home_visits.policies.manage'),
  ('live_operations_manager','home_visits.reconciliation.manage'),('live_operations_manager','home_visits.live_ops.manage'),
  ('live_operations_manager','home_visits.telemetry.inspect'),
  ('moderator','home_visits.inspect'),('moderator','home_visits.guestbooks.inspect'),
  ('moderator','home_visits.guestbooks.moderate'),('moderator','home_visits.reports.inspect'),
  ('customer_support','home_visits.inspect'),('customer_support','home_visits.policies.inspect'),
  ('customer_support','home_visits.guestbooks.inspect'),('customer_support','home_visits.reports.inspect'),
  ('read_only_analyst','home_visits.telemetry.inspect')
)
insert into public.admin_role_permissions(role_id,permission_id)
select role.id,permission.id from mapping
join public.admin_roles role on role.key=mapping.role_key
join public.admin_permissions permission on permission.key=mapping.permission_key
on conflict (role_id,permission_id) do nothing;

insert into public.admin_role_permissions(role_id,permission_id)
select role.id,permission.id from public.admin_roles role cross join public.admin_permissions permission
where role.key='super_admin' and permission.key like 'home_visits.%'
on conflict (role_id,permission_id) do nothing;

create table public.home_visit_policy_versions (
  id uuid primary key,
  version_number integer not null unique check(version_number>0),
  status text not null check(status in ('draft','validated','active','archived')),
  maximum_visitors integer not null default 10 check(maximum_visitors between 1 and 10),
  owner_disconnect_grace_seconds integer not null default 60 check(owner_disconnect_grace_seconds between 15 and 300),
  visitor_reconnect_grace_seconds integer not null default 30 check(visitor_reconnect_grace_seconds between 10 and 120),
  invitation_expiry_seconds integer not null default 86400 check(invitation_expiry_seconds between 300 and 86400),
  guestbook_cooldown_seconds integer not null default 600 check(guestbook_cooldown_seconds between 60 and 86400),
  guestbook_daily_limit integer not null default 5 check(guestbook_daily_limit between 1 and 20),
  appreciation_policy text not null default 'persistent_selection' check(appreciation_policy='persistent_selection'),
  helper_waterings_per_visitor_day integer not null default 1 check(helper_waterings_per_visitor_day=1),
  visits_enabled boolean not null default true,
  public_discovery_enabled boolean not null default true,
  invitations_enabled boolean not null default true,
  admissions_enabled boolean not null default true,
  social_interactions_enabled boolean not null default true,
  guestbook_writes_enabled boolean not null default true,
  appreciation_enabled boolean not null default true,
  helper_actions_enabled boolean not null default true,
  maintenance_message text check(maintenance_message is null or (
    char_length(maintenance_message) between 1 and 280 and maintenance_message=btrim(maintenance_message)
    and maintenance_message !~ '[[:cntrl:]<>]')),
  configuration_revision integer not null default 1 check(configuration_revision>0),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  validated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  activated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reason text not null check(char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  activated_at timestamptz,
  archived_at timestamptz,
  check(status not in ('validated','active') or validated_at is not null),
  check(status<>'active' or activated_at is not null),
  check((status='archived')=(archived_at is not null))
);

create table public.home_visit_active_policy (
  singleton_key boolean primary key default true check(singleton_key),
  policy_version_id uuid not null references public.home_visit_policy_versions(id) on delete restrict,
  updated_at timestamptz not null default now()
);

insert into public.home_visit_policy_versions(
  id,version_number,status,reason,validated_at,activated_at
) values(
  'f1100000-0000-4000-8000-000000000001',1,'active',
  'Initial bounded Phase 11F owner-present home visit policy.',now(),now()
);
insert into public.home_visit_active_policy(singleton_key,policy_version_id)
values(true,'f1100000-0000-4000-8000-000000000001');

create table public.home_social_settings (
  player_home_id uuid primary key references public.player_homes(id) on delete restrict,
  owner_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  visibility text not null default 'private' check(visibility in ('public','friends_only','invite_only','private')),
  interaction_mode text not null default 'view_only' check(interaction_mode in ('view_only','social_interactions','allow_helpers')),
  public_discovery_enabled boolean not null default false,
  friend_invitations_enabled boolean not null default true,
  party_invitations_enabled boolean not null default true,
  guestbook_enabled boolean not null default true,
  appreciation_enabled boolean not null default true,
  helper_actions_enabled boolean not null default false,
  join_notifications_enabled boolean not null default true,
  leave_notifications_enabled boolean not null default true,
  default_visitor_muted boolean not null default false,
  maximum_visitors integer not null default 10 check(maximum_visitors between 1 and 10),
  admissions_open boolean not null default true,
  configuration_revision integer not null default 1 check(configuration_revision>0),
  updated_at timestamptz not null default now(),
  unique(player_home_id,owner_player_profile_id),
  check(visibility='public' or not public_discovery_enabled),
  check(interaction_mode='allow_helpers' or not helper_actions_enabled)
);

insert into public.home_social_settings(player_home_id,owner_player_profile_id)
select home.id,home.player_profile_id from public.player_homes home
on conflict(player_home_id) do nothing;

create table public.home_visit_sessions (
  id uuid primary key default gen_random_uuid(),
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  owner_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  world_instance_id uuid not null default gen_random_uuid() unique,
  status text not null default 'starting' check(status in ('starting','open','closing','closed','failed')),
  visibility_snapshot text not null check(visibility_snapshot in ('public','friends_only','invite_only','private')),
  interaction_mode_snapshot text not null check(interaction_mode_snapshot in ('view_only','social_interactions','allow_helpers')),
  maximum_visitors integer not null check(maximum_visitors between 1 and 10),
  current_visitor_count integer not null default 0 check(current_visitor_count between 0 and 10),
  admissions_open boolean not null default true,
  owner_presence_state text not null default 'connected' check(owner_presence_state in ('connected','reconnecting','absent')),
  started_at timestamptz not null default now(),
  last_owner_heartbeat_at timestamptz not null default now(),
  owner_reconnect_deadline timestamptz,
  closing_at timestamptz,
  closed_at timestamptz,
  close_reason text check(close_reason is null or (char_length(close_reason) between 1 and 80 and close_reason ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')),
  configuration_revision integer not null default 1 check(configuration_revision>0),
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  check((status in ('starting','open') and closing_at is null and closed_at is null and close_reason is null)
    or (status='closing' and closing_at is not null and closed_at is null and close_reason is not null)
    or (status in ('closed','failed') and closing_at is not null and closed_at is not null and close_reason is not null))
);
create unique index home_visit_sessions_one_active_home_idx on public.home_visit_sessions(player_home_id)
where status in ('starting','open','closing');
create index home_visit_sessions_discovery_idx on public.home_visit_sessions(status,visibility_snapshot,current_visitor_count,started_at desc)
where status='open' and admissions_open;
create index home_visit_sessions_owner_grace_idx on public.home_visit_sessions(owner_reconnect_deadline,id)
where status in ('open','closing') and owner_presence_state<>'connected';

create table public.home_visit_participants (
  id uuid primary key default gen_random_uuid(),
  visit_session_id uuid not null references public.home_visit_sessions(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  role text not null check(role in ('owner','visitor')),
  interaction_mode_snapshot text not null check(interaction_mode_snapshot in ('view_only','social_interactions','allow_helpers')),
  capability_snapshot text[] not null check(capability_snapshot <@ array[
    'home.enter','home.walk','home.inspect','home.emote','home.sit','home.photo_area',
    'home.guestbook.write','home.appreciate','home.helper.water_crop'
  ]::text[] and cardinality(capability_snapshot) between 3 and 9),
  status text not null default 'active' check(status in ('active','reconnecting','left','removed','expired','returned')),
  presence_state text not null default 'connected' check(presence_state in ('connected','reconnecting','offline','returned')),
  position_x numeric(8,4) not null default 2 check(position_x between 0 and 128),
  position_y numeric(8,4) not null default 2 check(position_y between 0 and 128),
  facing_direction text not null default 'south' check(facing_direction in ('north','northeast','east','southeast','south','southwest','west','northwest')),
  movement_sequence bigint not null default 0 check(movement_sequence>=0),
  social_state text not null default 'idle' check(social_state in ('idle','moving','emoting','seated','photo_area','helping')),
  return_destination jsonb not null check(jsonb_typeof(return_destination)='object' and pg_column_size(return_destination)<=2048),
  joined_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  disconnected_at timestamptz,
  reconnect_deadline timestamptz,
  left_at timestamptz,
  removed_at timestamptz,
  removal_reason text check(removal_reason is null or (char_length(removal_reason) between 1 and 160 and removal_reason=btrim(removal_reason) and removal_reason !~ '[[:cntrl:]<>]')),
  state_version integer not null default 1 check(state_version>0),
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  unique(visit_session_id,player_profile_id),
  unique(id,visit_session_id,player_home_id),
  check((status in ('active','reconnecting'))=(left_at is null and removed_at is null)),
  check((status='reconnecting')=(reconnect_deadline is not null)),
  check((status='removed')=(removed_at is not null))
);
create unique index home_visit_participants_one_live_instance_idx on public.home_visit_participants(player_profile_id)
where status in ('active','reconnecting');
create unique index home_visit_participants_one_owner_idx on public.home_visit_participants(visit_session_id)
where role='owner';
create index home_visit_participants_session_idx on public.home_visit_participants(visit_session_id,status,joined_at,id);
create index home_visit_participants_reconnect_idx on public.home_visit_participants(reconnect_deadline,id)
where status='reconnecting';

create table public.home_visit_invitations (
  id uuid primary key default gen_random_uuid(),
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  owner_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  invitee_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  visit_session_id uuid references public.home_visit_sessions(id) on delete restrict,
  invitation_type text not null check(invitation_type in ('direct_player','friend','party_snapshot')),
  status text not null default 'pending' check(status in ('pending','accepted','consumed','revoked','expired','declined')),
  configuration_revision integer not null default 1 check(configuration_revision>0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  consumed_at timestamptz,
  resolved_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  check(owner_player_profile_id<>invitee_player_profile_id),
  check(expires_at>created_at and expires_at<=created_at+interval '24 hours'),
  check((status='pending' and resolved_at is null) or (status<>'pending' and resolved_at is not null))
);
create unique index home_visit_invitations_one_pending_idx on public.home_visit_invitations(player_home_id,invitee_player_profile_id)
where status='pending';
create index home_visit_invitations_invitee_idx on public.home_visit_invitations(invitee_player_profile_id,status,created_at desc);
create index home_visit_invitations_expiry_idx on public.home_visit_invitations(expires_at,id) where status='pending';

create table public.home_visit_events (
  id uuid primary key default gen_random_uuid(),
  event_number bigint generated always as identity unique,
  visit_session_id uuid not null references public.home_visit_sessions(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  actor_participant_id uuid references public.home_visit_participants(id) on delete restrict,
  event_key text not null check(event_key ~ '^home_[a-z0-9]+(?:_[a-z0-9]+)*$'),
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=8192),
  created_at timestamptz not null default now()
);
create index home_visit_events_session_idx on public.home_visit_events(visit_session_id,event_number);

create table public.home_visit_seats (
  id uuid primary key default gen_random_uuid(),
  visit_session_id uuid not null references public.home_visit_sessions(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  furniture_instance_id uuid not null references public.player_home_furniture(id) on delete restrict,
  seat_index integer not null check(seat_index between 1 and 8),
  participant_id uuid not null references public.home_visit_participants(id) on delete restrict,
  facing_direction text not null check(facing_direction in ('north','northeast','east','southeast','south','southwest','west','northwest')),
  status text not null default 'occupied' check(status in ('occupied','released')),
  occupied_at timestamptz not null default now(),
  released_at timestamptz,
  state_version integer not null default 1 check(state_version>0),
  unique(visit_session_id,furniture_instance_id,seat_index),
  check((status='occupied')=(released_at is null))
);
create unique index home_visit_seats_one_active_participant_idx on public.home_visit_seats(participant_id)
where status='occupied';

create table public.home_visit_photo_participants (
  id uuid primary key default gen_random_uuid(),
  visit_session_id uuid not null references public.home_visit_sessions(id) on delete restrict,
  photo_area_key text not null check(photo_area_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  participant_id uuid not null references public.home_visit_participants(id) on delete restrict,
  pose_slot integer not null check(pose_slot between 1 and 10),
  status text not null default 'active' check(status in ('active','left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique(visit_session_id,photo_area_key,pose_slot),
  check((status='active')=(left_at is null))
);
create unique index home_visit_photo_one_active_participant_idx on public.home_visit_photo_participants(participant_id)
where status='active';

create table public.home_guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  author_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  visit_session_id uuid not null references public.home_visit_sessions(id) on delete restrict,
  message_text text not null check(char_length(message_text) between 1 and 300 and octet_length(message_text)<=600
    and message_text=btrim(message_text) and message_text !~ '[[:cntrl:]<>]' and message_text !~* '(https?://|www\.)'),
  moderation_status text not null default 'visible' check(moderation_status in ('visible','owner_hidden','moderator_hidden','removed','author_deleted')),
  report_count integer not null default 0 check(report_count between 0 and 1000000),
  state_version integer not null default 1 check(state_version>0),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  deleted_at timestamptz,
  owner_moderation_reference uuid,
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  check((moderation_status in ('owner_hidden','moderator_hidden','removed'))=(hidden_at is not null)),
  check((moderation_status='author_deleted')=(deleted_at is not null))
);
create index home_guestbook_entries_home_idx on public.home_guestbook_entries(player_home_id,created_at desc,id);
create index home_guestbook_entries_author_rate_idx on public.home_guestbook_entries(author_player_profile_id,player_home_id,created_at desc);

create table public.home_appreciations (
  id uuid primary key default gen_random_uuid(),
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  reacting_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  visit_session_id uuid not null references public.home_visit_sessions(id) on delete restrict,
  reaction_key text not null check(reaction_key in ('cozy','beautiful','creative','welcoming')),
  state_version integer not null default 1 check(state_version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(player_home_id,reacting_player_profile_id)
);
create index home_appreciations_home_idx on public.home_appreciations(player_home_id,reaction_key);

create table public.home_helper_actions (
  id uuid primary key default gen_random_uuid(),
  visit_session_id uuid not null references public.home_visit_sessions(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  owner_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  helper_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  participant_id uuid not null references public.home_visit_participants(id) on delete restrict,
  action_type text not null check(action_type in ('water_crop','daily_task_foundation')),
  crop_instance_id uuid references public.player_home_crop_instances(id) on delete restrict,
  game_day date not null default current_date,
  status text not null default 'completed' check(status in ('started','completed','replayed','rejected')),
  crop_state_version_before integer check(crop_state_version_before>0),
  crop_state_version_after integer check(crop_state_version_after>0),
  idempotency_key text not null check(char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'),
  request_id text not null check(char_length(request_id) between 1 and 128),
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(helper_player_profile_id,player_home_id,game_day,action_type),
  unique(helper_player_profile_id,idempotency_key),
  check(action_type<>'water_crop' or crop_instance_id is not null),
  check(status not in ('completed','replayed') or completed_at is not null)
);
create unique index home_helper_actions_one_crop_watering_idx on public.home_helper_actions(crop_instance_id)
where action_type='water_crop' and status in ('completed','replayed');

create table public.home_visit_reports (
  id uuid primary key default gen_random_uuid(),
  visit_session_id uuid not null references public.home_visit_sessions(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  reporter_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  reported_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  guestbook_entry_id uuid references public.home_guestbook_entries(id) on delete restrict,
  category text not null check(category in ('harassment','hate_or_abuse','spam','inappropriate_home','unsafe_behavior','other')),
  reason text not null check(char_length(reason) between 3 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  status text not null default 'open' check(status in ('open','under_review','actioned','dismissed')),
  state_version integer not null default 1 check(state_version>0),
  request_id text not null check(char_length(request_id) between 1 and 128),
  safe_evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_evidence)='object' and pg_column_size(safe_evidence)<=8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(reporter_player_profile_id<>reported_player_profile_id),
  unique(reporter_player_profile_id,request_id)
);

create table public.home_visit_realtime_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_hash text not null unique check(ticket_hash ~ '^[0-9a-f]{64}$'),
  wallet_access_session_id uuid not null references public.wallet_access_sessions(id) on delete restrict,
  participant_id uuid not null references public.home_visit_participants(id) on delete restrict,
  visit_session_id uuid not null references public.home_visit_sessions(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  request_id text not null check(char_length(request_id) between 1 and 128),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(player_profile_id,request_id),
  check(expires_at>created_at and expires_at<=created_at+interval '1 minute')
);

create table public.home_visit_realtime_sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.home_visit_participants(id) on delete restrict,
  visit_session_id uuid not null references public.home_visit_sessions(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  connection_id text not null unique check(char_length(connection_id) between 1 and 128),
  status text not null default 'active' check(status in ('active','closed')),
  last_event_number bigint not null default 0 check(last_event_number>=0),
  last_heartbeat_at timestamptz not null default now(),
  connected_at timestamptz not null default now(),
  closed_at timestamptz,
  close_reason text check(close_reason is null or (char_length(close_reason) between 1 and 80 and close_reason ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')),
  check((status='active' and closed_at is null and close_reason is null) or (status='closed' and closed_at is not null and close_reason is not null))
);
create index home_visit_realtime_tickets_expiry_idx on public.home_visit_realtime_tickets(expires_at,id) where consumed_at is null;
create index home_visit_realtime_sessions_active_idx on public.home_visit_realtime_sessions(visit_session_id,last_heartbeat_at desc) where status='active';

create table public.home_visit_idempotency (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  operation text not null check(operation ~ '^[a-z][a-z0-9_]{2,79}$'),
  idempotency_key text not null check(char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'),
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb not null check(jsonb_typeof(response)='object' and pg_column_size(response)<=32768),
  created_at timestamptz not null default now(),
  primary key(player_profile_id,idempotency_key)
);

create table public.home_visit_rate_limits (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  scope text not null check(scope ~ '^[a-z][a-z0-9_]{2,79}$'),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  attempt_count integer not null check(attempt_count between 1 and 1000000),
  primary key(player_profile_id,scope),
  check(window_expires_at>window_started_at and window_expires_at<=window_started_at+interval '1 day')
);

create table public.home_visit_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_number bigint generated always as identity unique,
  visit_session_id uuid references public.home_visit_sessions(id) on delete restrict,
  player_home_id uuid references public.player_homes(id) on delete restrict,
  actor_player_profile_id uuid references public.player_profiles(id) on delete restrict,
  actor_admin_id uuid references public.admin_users(user_id) on delete restrict,
  actor_type text not null check(actor_type in ('player','owner','visitor','system','worker','admin')),
  event_key text not null check(event_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  result_category text not null check(result_category in ('success','replayed','rejected','manual_review','repaired')),
  request_id text not null check(char_length(request_id) between 1 and 128),
  safe_payload jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_payload)='object' and pg_column_size(safe_payload)<=8192),
  created_at timestamptz not null default now(),
  check((actor_type='admin')=(actor_admin_id is not null))
);

create table public.home_visit_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  visit_session_id uuid references public.home_visit_sessions(id) on delete restrict,
  player_home_id uuid references public.player_homes(id) on delete restrict,
  reconciliation_type text not null check(reconciliation_type in (
    'active_session_owner_presence','visitor_count','duplicate_participant','stale_seat','stale_invitation',
    'blocked_participant','helper_evidence','appreciation_uniqueness','guestbook_eligibility','preview_exclusion'
  )),
  status text not null default 'pending' check(status in ('pending','processing','resolved','manual_review','failed')),
  priority integer not null default 50 check(priority between 1 and 100),
  attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence)='object' and pg_column_size(evidence)<=16384),
  resolution_summary jsonb check(resolution_summary is null or (jsonb_typeof(resolution_summary)='object' and pg_column_size(resolution_summary)<=16384)),
  requested_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  request_id text not null check(char_length(request_id) between 1 and 128),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(reconciliation_type,visit_session_id,request_id)
);
create index home_visit_reconciliation_pending_idx on public.home_visit_reconciliation_queue(status,priority desc,available_at,id)
where status in ('pending','failed');

create table public.home_visit_telemetry_daily (
  metric_date date not null,
  metric_key text not null check(metric_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  metric_dimension text not null default 'all' check(char_length(metric_dimension) between 1 and 80),
  metric_value bigint not null default 0 check(metric_value>=0),
  updated_at timestamptz not null default now(),
  primary key(metric_date,metric_key,metric_dimension)
);

alter table public.cozy_furniture_definitions
  add column guest_enabled boolean not null default false,
  add column seat_count integer not null default 0 check(seat_count between 0 and 8),
  add column photo_area_capacity integer not null default 0 check(photo_area_capacity between 0 and 10),
  add column guest_interaction_metadata jsonb not null default '{}'::jsonb check(
    jsonb_typeof(guest_interaction_metadata)='object' and pg_column_size(guest_interaction_metadata)<=4096
  ),
  add constraint cozy_furniture_guest_interaction_check check(
    (not guest_enabled and seat_count=0 and photo_area_capacity=0)
    or (guest_enabled and (seat_count>0 or photo_area_capacity>0 or interaction_type is not null))
  );

update public.cozy_furniture_definitions set
  guest_enabled=true,seat_count=1,interaction_type='sit',
  guest_interaction_metadata=jsonb_build_object('seatAnchor',jsonb_build_object('x',0.5,'y',0.5),'allowedFacing','south','interactionRadius',2)
where slug='willow-chair';
update public.cozy_furniture_definitions set
  guest_enabled=true,photo_area_capacity=4,interaction_type='photo_area',
  guest_interaction_metadata=jsonb_build_object('photoAreaKey','hearth-table-photo','poseSlots',4,'interactionRadius',3)
where slug='hearth-table';

alter table public.player_social_notifications drop constraint if exists player_social_notifications_notification_type_check;
alter table public.player_social_notifications add constraint player_social_notifications_notification_type_check
check(notification_type in (
  'friend_request','friend_accepted','party_invitation','invitation_accepted','invitation_declined',
  'member_joined','member_left','member_kicked','leader_changed','ready_check','party_disbanded',
  'home_visit_invitation','home_visit_invitation_revoked','home_visit_joined','home_visit_left',
  'home_guestbook_entry','home_appreciation','home_helper_completed','home_visit_closing','home_visit_removed'
));

create trigger home_social_settings_updated_at before update on public.home_social_settings
for each row execute function private.set_updated_at();
create trigger home_appreciations_updated_at before update on public.home_appreciations
for each row execute function private.set_updated_at();
create trigger home_visit_reports_updated_at before update on public.home_visit_reports
for each row execute function private.set_updated_at();

create or replace function private.protect_home_visit_immutable_record()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('starville.home_visit_cleanup',true)='enabled' and tg_op='DELETE' then return old; end if;
  raise exception using errcode='42501',message='HOME_VISIT_RECORD_APPEND_ONLY';
end;
$$;
create trigger home_visit_audit_immutable before update or delete on public.home_visit_audit_events
for each row execute function private.protect_home_visit_immutable_record();
create trigger home_visit_events_immutable before update or delete on public.home_visit_events
for each row execute function private.protect_home_visit_immutable_record();
create trigger home_helper_actions_immutable before update or delete on public.home_helper_actions
for each row execute function private.protect_home_visit_immutable_record();
create trigger home_visit_idempotency_immutable before update or delete on public.home_visit_idempotency
for each row execute function private.protect_home_visit_immutable_record();

do $$ declare table_name text; begin
  foreach table_name in array array[
    'home_visit_policy_versions','home_visit_active_policy','home_social_settings','home_visit_sessions',
    'home_visit_participants','home_visit_invitations','home_visit_events','home_visit_seats',
    'home_visit_photo_participants','home_guestbook_entries','home_appreciations','home_helper_actions',
    'home_visit_reports','home_visit_realtime_tickets','home_visit_realtime_sessions','home_visit_idempotency',
    'home_visit_rate_limits','home_visit_audit_events','home_visit_reconciliation_queue','home_visit_telemetry_daily'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',table_name);
  end loop;
end $$;

revoke all on sequence public.home_visit_events_event_number_seq from public,anon,authenticated,service_role;
revoke all on sequence public.home_visit_audit_events_event_number_seq from public,anon,authenticated,service_role;
revoke all on function private.protect_home_visit_immutable_record() from public,anon,authenticated,service_role;

comment on table public.home_visit_sessions is 'Owner-present live hosted home instances. One active session per home; never an offline tour.';
comment on table public.home_helper_actions is 'Append-only evidence for bounded helper actions. It grants no DUST, crop output, repeatable XP, or visitor ownership.';
comment on table public.home_visit_realtime_tickets is 'Short-lived single-use owner-bound participant grants. Raw tickets are never stored.';
