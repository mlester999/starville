-- Starville Phase 8D-B: versioned cooperative activities and isolated durable run state.
-- PostgreSQL owns lifecycle, progress, eligibility, and off-chain reward receipts.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('cooperative_activities.read', 'Read cooperative activities', 'Read safe activity catalog and instance operations.', 'operations', false, true),
  ('cooperative_activities.edit', 'Edit cooperative activities', 'Create and edit structured activity drafts.', 'operations', true, true),
  ('cooperative_activities.validate', 'Validate cooperative activities', 'Validate closed objective and reward definitions.', 'operations', true, true),
  ('cooperative_activities.review', 'Review cooperative activities', 'Submit and approve validated activity versions.', 'operations', true, true),
  ('cooperative_activities.publish', 'Publish cooperative activities', 'Publish an exact reviewed activity version.', 'operations', true, true),
  ('cooperative_activities.preview', 'Preview cooperative activities', 'Run non-persistent staff activity previews without rewards.', 'operations', false, true),
  ('cooperative_activities.audit.read', 'Read cooperative activity audit', 'Read bounded append-only activity audit history.', 'operations', true, true),
  ('cooperative_activities.settings.read', 'Read cooperative activity settings', 'Read activity limits and maintenance policy.', 'operations', false, true),
  ('cooperative_activities.settings.edit', 'Edit cooperative activity settings', 'Edit reviewed activity limits and shutdown policy.', 'operations', true, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

with mapping(role_key, permission_key) as (
  values
    ('game_administrator', 'cooperative_activities.read'),
    ('game_administrator', 'cooperative_activities.edit'),
    ('game_administrator', 'cooperative_activities.validate'),
    ('game_administrator', 'cooperative_activities.review'),
    ('game_administrator', 'cooperative_activities.publish'),
    ('game_administrator', 'cooperative_activities.preview'),
    ('game_administrator', 'cooperative_activities.audit.read'),
    ('game_administrator', 'cooperative_activities.settings.read'),
    ('game_administrator', 'cooperative_activities.settings.edit'),
    ('content_manager', 'cooperative_activities.read'),
    ('content_manager', 'cooperative_activities.edit'),
    ('content_manager', 'cooperative_activities.validate'),
    ('content_manager', 'cooperative_activities.preview'),
    ('live_operations_manager', 'cooperative_activities.read'),
    ('live_operations_manager', 'cooperative_activities.settings.read'),
    ('moderator', 'cooperative_activities.read'),
    ('customer_support', 'cooperative_activities.read'),
    ('read_only_analyst', 'cooperative_activities.read')
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
where role.key = 'super_admin' and permission.key like 'cooperative_activities.%'
on conflict (role_id, permission_id) do nothing;

alter table public.player_dust_ledger drop constraint player_dust_ledger_reason_check;
alter table public.player_dust_ledger add constraint player_dust_ledger_reason_check check (reason in (
  'starter_grant', 'shop_purchase', 'shop_sale', 'crafting_fee',
  'system_refund', 'migration_adjustment', 'cooperative_activity_reward'
));
alter table public.player_dust_ledger drop constraint player_dust_ledger_reference_type_check;
alter table public.player_dust_ledger add constraint player_dust_ledger_reference_type_check check (reference_type in (
  'player_bootstrap', 'shop_transaction', 'recipe_action', 'system_operation', 'migration',
  'cooperative_activity'
));
alter table public.player_inventory_history drop constraint player_inventory_history_reason_check;
alter table public.player_inventory_history add constraint player_inventory_history_reason_check check (reason in (
  'starter_grant', 'shop_purchase', 'shop_sale', 'planting', 'harvest',
  'cooking', 'crafting', 'furniture_placement', 'furniture_removal',
  'social_gift', 'social_trade', 'system_refund',
  'cooperative_activity_reward'
));

create or replace function private.valid_cooperative_activity_objectives(p_value jsonb)
returns boolean language plpgsql immutable strict security definer set search_path = '' as $$
declare objective jsonb; objective_keys text[] := array[]::text[]; objective_key text;
  next_key text; index_number integer := 0; objective_count integer;
begin
  if jsonb_typeof(p_value) is distinct from 'array'
     or octet_length(p_value::text) > 32768 then return false; end if;
  objective_count := jsonb_array_length(p_value);
  if objective_count not between 2 and 16 then return false; end if;
  for objective in select value from jsonb_array_elements(p_value) loop
    objective_key := objective ->> 'key';
    if jsonb_typeof(objective) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(objective)) <> 10
       or objective_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
       or objective_key = any(objective_keys)
       or objective ->> 'type' not in (
         'shared_interact_count', 'shared_collect_count', 'shared_plant_count',
         'shared_water_count', 'timed_wait', 'shared_harvest_count',
         'shared_deliver_count', 'all_members_present', 'all_members_interact',
         'sequence_complete'
       )
       or coalesce((objective ->> 'target')::integer, 0) not between 1 and 100
       or char_length(coalesce(objective ->> 'label', '')) not between 3 and 80
       or char_length(coalesce(objective ->> 'description', '')) not between 3 and 240
       or objective ->> 'contributionPolicy' <> 'shared_equal'
       or objective ->> 'completionPolicy' not in ('party_total', 'server_timer')
       or objective::text ~* '(javascript:|<script|<iframe|onerror[[:space:]]*=)'
    then return false; end if;
    if objective ->> 'type' = 'timed_wait' then
      if objective ->> 'completionPolicy' <> 'server_timer'
         or coalesce((objective ->> 'timeLimitSeconds')::integer, 0) not between 5 and 900
         or jsonb_typeof(objective -> 'allowedInteractionKey') is distinct from 'null'
      then return false; end if;
    elsif objective ->> 'completionPolicy' <> 'party_total'
       or jsonb_typeof(objective -> 'timeLimitSeconds') is distinct from 'null'
       or coalesce(objective ->> 'allowedInteractionKey', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    then return false; end if;
    objective_keys := array_append(objective_keys, objective_key);
  end loop;
  for index_number in 0..objective_count - 1 loop
    next_key := p_value -> index_number ->> 'nextObjectiveKey';
    if index_number = objective_count - 1 then
      if jsonb_typeof(p_value -> index_number -> 'nextObjectiveKey') is distinct from 'null'
      then return false; end if;
    elsif next_key is distinct from (p_value -> (index_number + 1) ->> 'key') then
      return false;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function private.valid_cooperative_activity_reward(p_value jsonb)
returns boolean language plpgsql immutable strict security definer set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_value)) <> 3
     or coalesce((p_value ->> 'dust')::bigint, -1) not between 0 and 1000
     or coalesce((p_value ->> 'minimumContribution')::integer, -1) not between 0 and 100
     or jsonb_typeof(p_value -> 'items') is distinct from 'array'
     or jsonb_array_length(p_value -> 'items') > 4
     or octet_length(p_value::text) > 4096 then return false; end if;
  for item in select value from jsonb_array_elements(p_value -> 'items') loop
    if jsonb_typeof(item) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(item)) <> 2
       or coalesce(item ->> 'itemSlug', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
       or coalesce((item ->> 'quantity')::integer, 0) not between 1 and 20
    then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create table public.cooperative_activity_settings (
  singleton_key boolean primary key default true check (singleton_key),
  module_enabled boolean not null default true,
  public_queue_enabled boolean not null default false,
  allow_existing_instances_to_finish boolean not null default true,
  maximum_active_instances integer not null default 100 check (maximum_active_instances between 1 and 1000),
  maximum_failed_attempts_per_hour integer not null default 6 check (maximum_failed_attempts_per_hour between 1 and 60),
  maximum_party_creations_per_hour integer not null default 6 check (maximum_party_creations_per_hour between 1 and 60),
  idempotency_retention_hours integer not null default 24 check (idempotency_retention_hours between 1 and 168),
  audit_retention_days integer not null default 365 check (audit_retention_days between 30 and 730),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
insert into public.cooperative_activity_settings (singleton_key) values (true);

create table public.cooperative_activity_definitions (
  id uuid primary key default gen_random_uuid(),
  activity_key text not null unique check (
    char_length(activity_key) between 2 and 80 and activity_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  created_at timestamptz not null default now()
);

create table public.cooperative_activity_versions (
  id uuid primary key,
  activity_definition_id uuid not null references public.cooperative_activity_definitions(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null check (lifecycle_status in (
    'draft', 'validated', 'in_review', 'published', 'superseded', 'disabled'
  )),
  name text not null check (char_length(name) between 3 and 80 and name = btrim(name) and name !~ '[[:cntrl:]<>]'),
  short_description text not null check (char_length(short_description) between 3 and 180 and short_description = btrim(short_description) and short_description !~ '[[:cntrl:]<>]'),
  long_description text not null check (char_length(long_description) between 3 and 1000 and long_description = btrim(long_description) and long_description !~ '[[:cntrl:]<>]'),
  category text not null check (category = 'cozy_cooperative'),
  minimum_party_size integer not null check (minimum_party_size between 2 and 4),
  maximum_party_size integer not null check (maximum_party_size between 2 and 4 and maximum_party_size >= minimum_party_size),
  recommended_level integer not null check (recommended_level between 1 and 999),
  duration_seconds integer not null check (duration_seconds between 60 and 3600),
  reconnect_grace_seconds integer not null check (reconnect_grace_seconds between 15 and 600),
  waiting_for_players_seconds integer not null check (waiting_for_players_seconds between 15 and 600),
  entry_world_map_id uuid not null references public.world_maps(id) on delete restrict,
  entry_interaction_key text not null check (entry_interaction_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  scene_ref text not null check (scene_ref ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  objective_definitions jsonb not null check (private.valid_cooperative_activity_objectives(objective_definitions)),
  reward_definition jsonb not null check (private.valid_cooperative_activity_reward(reward_definition)),
  entry_cooldown_seconds integer not null check (entry_cooldown_seconds between 0 and 86400),
  reward_cooldown_seconds integer not null check (reward_cooldown_seconds between 0 and 604800),
  daily_reward_limit integer not null check (daily_reward_limit between 0 and 20),
  required_modules text[] not null check (cardinality(required_modules) between 1 and 12),
  required_assets text[] not null check (cardinality(required_assets) <= 40),
  content_version integer not null check (content_version > 0),
  revision integer not null default 1 check (revision > 0),
  validation_results jsonb check (validation_results is null or (
    jsonb_typeof(validation_results) = 'object' and octet_length(validation_results::text) <= 32768
  )),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  published_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  unique (activity_definition_id, version_number),
  unique (activity_definition_id, id)
);

create table public.cooperative_activity_active_versions (
  activity_definition_id uuid primary key references public.cooperative_activity_definitions(id) on delete restrict,
  activity_version_id uuid not null,
  enabled boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  activated_at timestamptz not null default now(),
  activated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  foreign key (activity_definition_id, activity_version_id)
    references public.cooperative_activity_versions(activity_definition_id, id) on delete restrict
);

create table public.cooperative_activity_objects (
  activity_version_id uuid not null references public.cooperative_activity_versions(id) on delete restrict,
  object_key text not null check (object_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  interaction_key text not null check (interaction_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (char_length(label) between 3 and 80 and label !~ '[[:cntrl:]<>]'),
  object_type text not null check (object_type in ('supply', 'plot', 'crop', 'delivery')),
  position_x numeric(7,3) not null check (position_x between 0 and 128),
  position_y numeric(7,3) not null check (position_y between 0 and 128),
  interaction_range numeric(5,3) not null check (interaction_range > 0 and interaction_range <= 4),
  active boolean not null default true,
  primary key (activity_version_id, object_key)
);

create table public.cooperative_activity_entry_preparations (
  id uuid primary key default gen_random_uuid(),
  public_preparation_id uuid not null default gen_random_uuid() unique,
  activity_version_id uuid not null references public.cooperative_activity_versions(id) on delete restrict,
  party_id uuid not null references public.player_parties(id) on delete restrict,
  party_revision integer not null check (party_revision > 0),
  ready_check_id uuid not null references public.player_party_ready_checks(id) on delete restrict,
  leader_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  status text not null default 'ready_check' check (status in (
    'ready_check', 'ready', 'entered', 'cancelled', 'expired', 'invalidated'
  )),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  check ((status = 'ready_check' and resolved_at is null) or (status <> 'ready_check' and resolved_at is not null))
);
create unique index cooperative_activity_one_open_preparation_idx
  on public.cooperative_activity_entry_preparations(party_id)
  where status in ('ready_check', 'ready');

create table public.cooperative_activity_instances (
  id uuid primary key default gen_random_uuid(),
  public_instance_id uuid not null default gen_random_uuid() unique,
  activity_version_id uuid not null references public.cooperative_activity_versions(id) on delete restrict,
  party_id uuid not null references public.player_parties(id) on delete restrict,
  party_public_id uuid not null,
  locked_party_revision integer not null check (locked_party_revision > 0),
  leader_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  status text not null default 'waiting_for_players' check (status in (
    'preparing', 'waiting_for_players', 'active', 'paused', 'completed', 'failed',
    'cancelled', 'expired', 'abandoned'
  )),
  current_objective_key text check (current_objective_key is null or current_objective_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  revision integer not null default 1 check (revision > 0),
  checkpoint_version integer not null default 1 check (checkpoint_version > 0),
  minimum_active_participants integer not null check (minimum_active_participants between 2 and 4),
  created_at timestamptz not null default now(),
  waiting_expires_at timestamptz not null,
  started_at timestamptz,
  expires_at timestamptz not null,
  paused_at timestamptz,
  completed_at timestamptz,
  result_code text check (result_code is null or result_code ~ '^[a-z0-9_]{1,64}$'),
  reward_settlement_status text not null default 'not_started' check (reward_settlement_status in (
    'not_started', 'settling', 'settled', 'not_applicable'
  )),
  return_world_map_id uuid not null references public.world_maps(id) on delete restrict,
  check (waiting_expires_at > created_at and expires_at > created_at)
);
create unique index cooperative_activity_one_active_party_idx
  on public.cooperative_activity_instances(party_id)
  where status in ('preparing', 'waiting_for_players', 'active', 'paused');

create table public.cooperative_activity_participants (
  instance_id uuid not null references public.cooperative_activity_instances(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  public_presence_id uuid not null,
  connection_status text not null default 'online' check (connection_status in (
    'online', 'reconnecting', 'offline', 'removed'
  )),
  reward_eligible boolean not null default true,
  contribution integer not null default 0 check (contribution between 0 and 10000),
  temporary_item_count integer not null default 0 check (temporary_item_count between 0 and 100),
  joined_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  reconnect_deadline timestamptz,
  removed_at timestamptz,
  removal_reason text check (removal_reason is null or removal_reason ~ '^[a-z0-9_]{1,64}$'),
  primary key (instance_id, player_profile_id)
);
create unique index cooperative_activity_one_active_participation_idx
  on public.cooperative_activity_participants(player_profile_id)
  where connection_status in ('online', 'reconnecting');

create table public.cooperative_activity_objectives (
  instance_id uuid not null references public.cooperative_activity_instances(id) on delete restrict,
  objective_key text not null,
  sequence_number integer not null check (sequence_number between 1 and 16),
  objective_type text not null check (objective_type in (
    'shared_interact_count', 'shared_collect_count', 'shared_plant_count',
    'shared_water_count', 'timed_wait', 'shared_harvest_count',
    'shared_deliver_count', 'all_members_present', 'all_members_interact', 'sequence_complete'
  )),
  label text not null check (char_length(label) between 3 and 80),
  target integer not null check (target between 1 and 100),
  current_progress integer not null default 0 check (current_progress between 0 and 100),
  status text not null default 'pending' check (status in ('pending', 'active', 'completed', 'expired')),
  started_at timestamptz,
  completed_at timestamptz,
  timer_ends_at timestamptz,
  primary key (instance_id, objective_key),
  unique (instance_id, sequence_number)
);

create table public.cooperative_activity_progress_events (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.cooperative_activity_instances(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  objective_key text not null,
  object_key text not null,
  interaction_key text not null,
  client_request_id text not null check (client_request_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  contribution integer not null default 1 check (contribution between 1 and 10),
  instance_revision integer not null check (instance_revision > 0),
  created_at timestamptz not null default now(),
  unique (instance_id, objective_key, object_key),
  unique (instance_id, player_profile_id, client_request_id)
);

create table public.cooperative_activity_temporary_items (
  instance_id uuid not null references public.cooperative_activity_instances(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  item_key text not null check (item_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  quantity integer not null check (quantity between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (instance_id, player_profile_id, item_key)
);

create table public.cooperative_activity_completions (
  id uuid primary key default gen_random_uuid(),
  public_completion_id uuid not null default gen_random_uuid() unique,
  instance_id uuid not null unique references public.cooperative_activity_instances(id) on delete restrict,
  activity_version_id uuid not null references public.cooperative_activity_versions(id) on delete restrict,
  party_public_id uuid not null,
  duration_seconds integer not null check (duration_seconds between 0 and 3600),
  completed_at timestamptz not null default now(),
  result text not null check (result = 'completed')
);

create table public.cooperative_activity_reward_receipts (
  id uuid primary key default gen_random_uuid(),
  public_receipt_id uuid not null default gen_random_uuid() unique,
  completion_id uuid not null references public.cooperative_activity_completions(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  status text not null check (status in ('settled', 'pending_inventory', 'ineligible')),
  dust_amount bigint not null check (dust_amount between 0 and 1000),
  daily_reward_number integer not null check (daily_reward_number between 0 and 100),
  ineligibility_reason text check (ineligibility_reason is null or ineligibility_reason ~ '^[a-z0-9_]{1,64}$'),
  settled_at timestamptz not null default now(),
  unique (completion_id, player_profile_id)
);

create table public.cooperative_activity_reward_items (
  reward_receipt_id uuid not null references public.cooperative_activity_reward_receipts(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 20),
  status text not null check (status in ('settled', 'pending_inventory')),
  primary key (reward_receipt_id, item_definition_id)
);

create table public.cooperative_activity_pending_rewards (
  id uuid primary key default gen_random_uuid(),
  reward_receipt_id uuid not null references public.cooperative_activity_reward_receipts(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 20),
  status text not null default 'pending' check (status in ('pending', 'claimed')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  unique (reward_receipt_id, item_definition_id)
);

create table public.cooperative_activity_cooldowns (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  activity_definition_id uuid not null references public.cooperative_activity_definitions(id) on delete restrict,
  entry_available_at timestamptz not null default now(),
  reward_available_at timestamptz not null default now(),
  reward_day date not null default (now() at time zone 'utc')::date,
  rewarded_completions integer not null default 0 check (rewarded_completions between 0 and 100),
  failed_window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (player_profile_id, activity_definition_id)
);

create table public.cooperative_activity_audit (
  id uuid primary key default gen_random_uuid(),
  entry_number bigint generated always as identity unique,
  instance_id uuid references public.cooperative_activity_instances(id) on delete restrict,
  activity_version_id uuid references public.cooperative_activity_versions(id) on delete restrict,
  actor_profile_id uuid references public.player_profiles(id) on delete restrict,
  actor_admin_id uuid references public.admin_users(user_id) on delete restrict,
  action text not null check (action ~ '^[a-z0-9_]{1,80}$'),
  result text not null check (result ~ '^[a-z0-9_]{1,64}$'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  revision integer check (revision is null or revision > 0),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 8192),
  created_at timestamptz not null default now()
);

create table public.cooperative_activity_idempotency (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  operation text not null check (operation ~ '^[a-z0-9_]{1,64}$'),
  client_request_id text not null check (client_request_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  request_hash text not null check (char_length(request_hash) between 1 and 512),
  response jsonb not null check (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536),
  created_at timestamptz not null default now(),
  primary key (player_profile_id, operation, client_request_id)
);

create table public.cooperative_activity_rate_limits (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  operation text not null check (operation ~ '^[a-z0-9_]{1,64}$'),
  attempt_count integer not null check (attempt_count between 1 and 10000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (player_profile_id, operation),
  check (window_expires_at > window_started_at)
);

create index cooperative_activity_instances_status_idx on public.cooperative_activity_instances(status, expires_at, id);
create index cooperative_activity_participants_reconnect_idx on public.cooperative_activity_participants(reconnect_deadline, instance_id) where connection_status = 'reconnecting';
create index cooperative_activity_audit_instance_idx on public.cooperative_activity_audit(instance_id, entry_number desc);
create index cooperative_activity_receipts_player_idx on public.cooperative_activity_reward_receipts(player_profile_id, settled_at desc);
create index cooperative_activity_pending_idx on public.cooperative_activity_pending_rewards(status, created_at, id);
create index cooperative_activity_idempotency_expiry_idx on public.cooperative_activity_idempotency(created_at, player_profile_id);

create trigger cooperative_activity_settings_updated_at before update on public.cooperative_activity_settings
for each row execute function private.set_updated_at();
create trigger cooperative_activity_temporary_items_updated_at before update on public.cooperative_activity_temporary_items
for each row execute function private.set_updated_at();
create trigger cooperative_activity_cooldowns_updated_at before update on public.cooperative_activity_cooldowns
for each row execute function private.set_updated_at();
create trigger cooperative_activity_rate_limits_updated_at before update on public.cooperative_activity_rate_limits
for each row execute function private.set_updated_at();

create or replace function private.protect_cooperative_activity_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITY_VERSION_IMMUTABLE';
  end if;
  if old.lifecycle_status in ('published', 'superseded', 'disabled')
     and (to_jsonb(new) - 'lifecycle_status') is distinct from (to_jsonb(old) - 'lifecycle_status') then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITY_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger cooperative_activity_version_immutable before update or delete on public.cooperative_activity_versions
for each row execute function private.protect_cooperative_activity_version();

create or replace function private.reject_cooperative_activity_immutable_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITY_RECORD_IMMUTABLE';
end;
$$;
create trigger cooperative_activity_completion_immutable before update or delete on public.cooperative_activity_completions
for each row execute function private.reject_cooperative_activity_immutable_mutation();
create trigger cooperative_activity_receipt_immutable before update or delete on public.cooperative_activity_reward_receipts
for each row execute function private.reject_cooperative_activity_immutable_mutation();
create trigger cooperative_activity_reward_item_immutable before update or delete on public.cooperative_activity_reward_items
for each row execute function private.reject_cooperative_activity_immutable_mutation();
create trigger cooperative_activity_audit_immutable before update or delete on public.cooperative_activity_audit
for each row execute function private.reject_cooperative_activity_immutable_mutation();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'cooperative_activity_settings', 'cooperative_activity_definitions',
    'cooperative_activity_versions', 'cooperative_activity_active_versions',
    'cooperative_activity_objects', 'cooperative_activity_entry_preparations',
    'cooperative_activity_instances', 'cooperative_activity_participants',
    'cooperative_activity_objectives', 'cooperative_activity_progress_events',
    'cooperative_activity_temporary_items', 'cooperative_activity_completions',
    'cooperative_activity_reward_receipts', 'cooperative_activity_reward_items',
    'cooperative_activity_pending_rewards', 'cooperative_activity_cooldowns',
    'cooperative_activity_audit', 'cooperative_activity_idempotency',
    'cooperative_activity_rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
  end loop;
end;
$$;
revoke all on sequence public.cooperative_activity_audit_entry_number_seq from public, anon, authenticated, service_role;

insert into public.cooperative_activity_definitions (id, activity_key)
values ('8d0b0000-0000-4000-8000-000000000000', 'moonpetal-harvest-help');

insert into public.cooperative_activity_versions (
  id, activity_definition_id, version_number, lifecycle_status, name,
  short_description, long_description, category, minimum_party_size, maximum_party_size,
  recommended_level, duration_seconds, reconnect_grace_seconds, waiting_for_players_seconds,
  entry_world_map_id, entry_interaction_key, scene_ref, objective_definitions,
  reward_definition, entry_cooldown_seconds, reward_cooldown_seconds, daily_reward_limit,
  required_modules, required_assets, content_version, revision, validation_results, published_at
)
select
  '8d0b0000-0000-4000-8000-000000000001', '8d0b0000-0000-4000-8000-000000000000',
  1, 'published', 'Moonpetal Harvest Help',
  'Prepare and deliver a shared Moonpetal harvest with your party.',
  'Gather temporary seed bundles, tend six shared activity plots, and deliver the harvest before the village timer expires.',
  'cozy_cooperative', 2, 4, 1, 480, 60, 120, map.id,
  'moonpetal-community-board', 'moonpetal-harvest-instance-v1',
  '[{"key":"gather-seed-bundles","label":"Gather Seed Bundles","description":"Collect six temporary Moonpetal seed bundles for the shared plots.","type":"shared_collect_count","target":6,"timeLimitSeconds":null,"allowedInteractionKey":"activity-seed-bundle","nextObjectiveKey":"plant-shared-plots","contributionPolicy":"shared_equal","completionPolicy":"party_total"},{"key":"plant-shared-plots","label":"Plant the Seeds","description":"Plant each activity-owned plot once.","type":"shared_plant_count","target":6,"timeLimitSeconds":null,"allowedInteractionKey":"activity-plant-plot","nextObjectiveKey":"water-shared-crops","contributionPolicy":"shared_equal","completionPolicy":"party_total"},{"key":"water-shared-crops","label":"Water the Crops","description":"Water every shared Moonpetal crop.","type":"shared_water_count","target":6,"timeLimitSeconds":null,"allowedInteractionKey":"activity-water-crop","nextObjectiveKey":"let-crops-grow","contributionPolicy":"shared_equal","completionPolicy":"party_total"},{"key":"let-crops-grow","label":"Let Them Grow","description":"Stay together while server time advances the accelerated crop growth.","type":"timed_wait","target":1,"timeLimitSeconds":30,"allowedInteractionKey":null,"nextObjectiveKey":"harvest-together","contributionPolicy":"shared_equal","completionPolicy":"server_timer"},{"key":"harvest-together","label":"Harvest Together","description":"Harvest all six activity-owned crops.","type":"shared_harvest_count","target":6,"timeLimitSeconds":null,"allowedInteractionKey":"activity-harvest-crop","nextObjectiveKey":"deliver-community-harvest","contributionPolicy":"shared_equal","completionPolicy":"party_total"},{"key":"deliver-community-harvest","label":"Deliver the Harvest","description":"Place all six temporary harvest bundles at the community station.","type":"shared_deliver_count","target":6,"timeLimitSeconds":null,"allowedInteractionKey":"activity-deliver-bundle","nextObjectiveKey":"community-harvest-complete","contributionPolicy":"shared_equal","completionPolicy":"party_total"},{"key":"community-harvest-complete","label":"Community Harvest Complete","description":"The shared harvest is ready for the village.","type":"sequence_complete","target":1,"timeLimitSeconds":null,"allowedInteractionKey":"activity-complete-harvest","nextObjectiveKey":null,"contributionPolicy":"shared_equal","completionPolicy":"party_total"}]'::jsonb,
  '{"dust":15,"items":[{"itemSlug":"moonbean","quantity":2}],"minimumContribution":2}'::jsonb,
  60, 300, 2,
  array['realtime_multiplayer','social_graph','cozy_gameplay','world_management'],
  array['activity-plot-marker','activity-seed-marker','activity-delivery-marker'],
  1, 1, '{"valid":true,"findings":[{"level":"passed","code":"ACTIVITY_VALID"}]}'::jsonb,
  timestamptz '2026-07-15 00:00:00+00'
from public.world_maps map where map.slug = 'moonpetal-meadow';

insert into public.cooperative_activity_active_versions (
  activity_definition_id, activity_version_id, enabled
) values (
  '8d0b0000-0000-4000-8000-000000000000',
  '8d0b0000-0000-4000-8000-000000000001', true
);

insert into public.cooperative_activity_objects (
  activity_version_id, object_key, interaction_key, label, object_type,
  position_x, position_y, interaction_range
)
select '8d0b0000-0000-4000-8000-000000000001', object_key, interaction_key, label, object_type, x, y, 1.65
from (values
  ('seed-bundle-1','activity-seed-bundle','Seed bundle 1','supply',7.0,5.0),
  ('seed-bundle-2','activity-seed-bundle','Seed bundle 2','supply',8.0,5.0),
  ('seed-bundle-3','activity-seed-bundle','Seed bundle 3','supply',9.0,5.0),
  ('seed-bundle-4','activity-seed-bundle','Seed bundle 4','supply',10.0,5.0),
  ('seed-bundle-5','activity-seed-bundle','Seed bundle 5','supply',11.0,5.0),
  ('seed-bundle-6','activity-seed-bundle','Seed bundle 6','supply',12.0,5.0),
  ('shared-plot-1','activity-plant-plot','Shared plot 1','plot',7.5,8.0),
  ('shared-plot-2','activity-plant-plot','Shared plot 2','plot',9.0,8.0),
  ('shared-plot-3','activity-plant-plot','Shared plot 3','plot',10.5,8.0),
  ('shared-plot-4','activity-plant-plot','Shared plot 4','plot',7.5,9.5),
  ('shared-plot-5','activity-plant-plot','Shared plot 5','plot',9.0,9.5),
  ('shared-plot-6','activity-plant-plot','Shared plot 6','plot',10.5,9.5),
  ('shared-crop-1','activity-water-crop','Shared crop 1','crop',7.5,8.0),
  ('shared-crop-2','activity-water-crop','Shared crop 2','crop',9.0,8.0),
  ('shared-crop-3','activity-water-crop','Shared crop 3','crop',10.5,8.0),
  ('shared-crop-4','activity-water-crop','Shared crop 4','crop',7.5,9.5),
  ('shared-crop-5','activity-water-crop','Shared crop 5','crop',9.0,9.5),
  ('shared-crop-6','activity-water-crop','Shared crop 6','crop',10.5,9.5),
  ('ripe-crop-1','activity-harvest-crop','Ripe crop 1','crop',7.5,8.0),
  ('ripe-crop-2','activity-harvest-crop','Ripe crop 2','crop',9.0,8.0),
  ('ripe-crop-3','activity-harvest-crop','Ripe crop 3','crop',10.5,8.0),
  ('ripe-crop-4','activity-harvest-crop','Ripe crop 4','crop',7.5,9.5),
  ('ripe-crop-5','activity-harvest-crop','Ripe crop 5','crop',9.0,9.5),
  ('ripe-crop-6','activity-harvest-crop','Ripe crop 6','crop',10.5,9.5),
  ('delivery-1','activity-deliver-bundle','Delivery basket 1','delivery',14.0,10.0),
  ('delivery-2','activity-deliver-bundle','Delivery basket 2','delivery',14.0,10.0),
  ('delivery-3','activity-deliver-bundle','Delivery basket 3','delivery',14.0,10.0),
  ('delivery-4','activity-deliver-bundle','Delivery basket 4','delivery',14.0,10.0),
  ('delivery-5','activity-deliver-bundle','Delivery basket 5','delivery',14.0,10.0),
  ('delivery-6','activity-deliver-bundle','Delivery basket 6','delivery',14.0,10.0),
  ('community-bell','activity-complete-harvest','Community harvest bell','delivery',14.0,9.0)
) object_rows(object_key,interaction_key,label,object_type,x,y);

revoke all on function private.valid_cooperative_activity_objectives(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.valid_cooperative_activity_reward(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.protect_cooperative_activity_version() from public, anon, authenticated, service_role;
revoke all on function private.reject_cooperative_activity_immutable_mutation() from public, anon, authenticated, service_role;
