-- Starville Phase 11A: owner-only home plots, authoritative starter farming,
-- a versioned starter quest, and canonical Phase 9 DUST settlement.
-- This migration is forward-only and does not modify any hosted player state
-- until it is explicitly applied by the owner.

create or replace function private.valid_cozy_item_metadata(
  p_category text,
  p_metadata jsonb
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select jsonb_typeof(p_metadata) = 'object'
    and case p_category
      when 'seed' then
        (select array_agg(key order by key) from jsonb_object_keys(p_metadata) as key)
          = array['cropSlug', 'kind']::text[]
        and p_metadata ->> 'kind' = 'seed'
        and p_metadata ->> 'cropSlug' ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        and char_length(p_metadata ->> 'cropSlug') between 1 and 80
      when 'crop' then
        (select array_agg(key order by key) from jsonb_object_keys(p_metadata) as key)
          = array['cropSlug', 'kind']::text[]
        and p_metadata ->> 'kind' = 'crop'
        and p_metadata ->> 'cropSlug' ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        and char_length(p_metadata ->> 'cropSlug') between 1 and 80
      when 'ingredient' then p_metadata = '{"kind":"ingredient"}'::jsonb
      when 'cooked_food' then p_metadata = '{"kind":"cooked_food"}'::jsonb
      when 'crafted_material' then p_metadata = '{"kind":"crafted_material"}'::jsonb
      when 'furniture' then
        (select array_agg(key order by key) from jsonb_object_keys(p_metadata) as key)
          = array['furnitureSlug', 'kind']::text[]
        and p_metadata ->> 'kind' = 'furniture'
        and p_metadata ->> 'furnitureSlug' ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        and char_length(p_metadata ->> 'furnitureSlug') between 1 and 80
      when 'permanent_tool' then
        (select array_agg(key order by key) from jsonb_object_keys(p_metadata) as key)
          = array['kind', 'toolType']::text[]
        and p_metadata ->> 'kind' = 'permanent_tool'
        and p_metadata ->> 'toolType' in ('hoe', 'watering_can')
      when 'special' then
        (select array_agg(key order by key) from jsonb_object_keys(p_metadata) as key)
          = array['kind', 'purpose']::text[]
        and p_metadata ->> 'kind' = 'special'
        and char_length(p_metadata ->> 'purpose') between 1 and 80
        and p_metadata ->> 'purpose' !~ '[[:cntrl:]<>]'
      else false
    end;
$$;

insert into public.cozy_item_definitions (
  id, slug, name, description, category, stackable, max_stack_size,
  buy_eligible, sell_eligible, default_buy_price, default_sell_price,
  asset_ref, asset_readiness, active, content_version, metadata,
  giftable, tradable, account_bound, permanent_tool,
  minimum_transfer_quantity, maximum_transfer_quantity
) values (
  'a1100000-0000-4000-8000-000000000001',
  'starter-hoe',
  'Willow Starter Hoe',
  'A light account-bound hoe for preparing soil on a private home plot.',
  'permanent_tool', false, 1, false, false, null, null,
  'phase11a-dev-starter-hoe', 'development_marker', true, 2,
  '{"kind":"permanent_tool","toolType":"hoe"}'::jsonb,
  false, false, true, true, 1, 1
)
on conflict (id) do nothing;

alter table public.cozy_crop_definitions
  add column watering_policy text not null default 'water_once_to_start'
    check (watering_policy in ('water_once_to_start')),
  add column tutorial_eligible boolean not null default false,
  add column local_growth_duration_seconds integer not null default 10
    check (local_growth_duration_seconds between 1 and 3600),
  add column configuration_revision integer not null default 1
    check (configuration_revision > 0);

update public.cozy_crop_definitions
set tutorial_eligible = slug = 'moonbean',
    local_growth_duration_seconds = case when slug = 'moonbean' then 10 else 30 end,
    configuration_revision = 2
where slug in ('moonbean', 'sunroot', 'cloudberry');

create table public.cozy_farming_settings (
  singleton_key boolean primary key default true check (singleton_key),
  planting_enabled boolean not null default true,
  harvesting_enabled boolean not null default true,
  plot_provisioning_enabled boolean not null default true,
  starter_quest_enabled boolean not null default true,
  tutorial_rewards_enabled boolean not null default true,
  use_local_growth_duration boolean not null default false,
  interaction_distance numeric(5,2) not null default 4
    check (interaction_distance between 1 and 4),
  prepare_cooldown_ms integer not null default 350 check (prepare_cooldown_ms between 100 and 5000),
  plant_cooldown_ms integer not null default 350 check (plant_cooldown_ms between 100 and 5000),
  water_cooldown_ms integer not null default 350 check (water_cooldown_ms between 100 and 5000),
  harvest_cooldown_ms integer not null default 500 check (harvest_cooldown_ms between 100 and 5000),
  delivery_cooldown_ms integer not null default 1000 check (delivery_cooldown_ms between 250 and 10000),
  maintenance_message text check (
    maintenance_message is null or (
      char_length(maintenance_message) between 1 and 280
      and maintenance_message = btrim(maintenance_message)
      and maintenance_message !~ '[[:cntrl:]<>]'
    )
  ),
  configuration_revision integer not null default 1 check (configuration_revision > 0),
  updated_at timestamptz not null default now()
);

insert into public.cozy_farming_settings (singleton_key) values (true);

alter table public.player_homes
  add column lifecycle_status text not null default 'not_provisioned'
    check (lifecycle_status in (
      'not_provisioned', 'provisioning', 'active', 'suspended',
      'provisioning_failed', 'archived'
    )),
  add column provisioned_template_version integer check (provisioned_template_version > 0),
  add column provisioning_error_code text check (
    provisioning_error_code is null or provisioning_error_code ~ '^[A-Z][A-Z0-9_]{2,79}$'
  ),
  add column farming_state_version integer not null default 1 check (farming_state_version > 0),
  add column current_position_x numeric(8,4),
  add column current_position_y numeric(8,4),
  add column last_farming_action_at timestamptz;

update public.player_homes home
set current_position_x = template.spawn_x,
    current_position_y = template.spawn_y
from public.cozy_home_templates template
where template.id = home.template_id
  and (home.current_position_x is null or home.current_position_y is null);

alter table public.player_homes
  alter column current_position_x set not null,
  alter column current_position_y set not null,
  add constraint player_homes_current_position_check check (
    current_position_x::text <> 'NaN' and current_position_y::text <> 'NaN'
    and current_position_x between -128 and 128
    and current_position_y between -128 and 128
  );

create table public.cozy_home_farm_tile_templates (
  id uuid primary key,
  home_template_id uuid not null references public.cozy_home_templates(id) on delete restrict,
  template_version integer not null check (template_version > 0),
  tile_key text not null check (
    char_length(tile_key) between 1 and 80
    and tile_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  slot integer not null check (slot between 1 and 64),
  grid_x integer not null,
  grid_y integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (home_template_id, template_version, tile_key),
  unique (home_template_id, template_version, slot),
  unique (home_template_id, template_version, grid_x, grid_y)
);

insert into public.cozy_home_farm_tile_templates (
  id, home_template_id, template_version, tile_key, slot, grid_x, grid_y
) values
  ('a1100000-0000-4000-8000-000000000011','76000000-0000-4000-8000-000000000001',1,'garden-one',1,3,3),
  ('a1100000-0000-4000-8000-000000000012','76000000-0000-4000-8000-000000000001',1,'garden-two',2,4,3),
  ('a1100000-0000-4000-8000-000000000013','76000000-0000-4000-8000-000000000001',1,'garden-three',3,5,3),
  ('a1100000-0000-4000-8000-000000000014','76000000-0000-4000-8000-000000000001',1,'garden-four',4,6,3),
  ('a1100000-0000-4000-8000-000000000015','76000000-0000-4000-8000-000000000001',1,'garden-five',5,3,4),
  ('a1100000-0000-4000-8000-000000000016','76000000-0000-4000-8000-000000000001',1,'garden-six',6,4,4),
  ('a1100000-0000-4000-8000-000000000017','76000000-0000-4000-8000-000000000001',1,'garden-seven',7,5,4),
  ('a1100000-0000-4000-8000-000000000018','76000000-0000-4000-8000-000000000001',1,'garden-eight',8,6,4)
on conflict (id) do nothing;

create table public.player_home_farming_tiles (
  id uuid primary key default gen_random_uuid(),
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  template_tile_id uuid not null references public.cozy_home_farm_tile_templates(id) on delete restrict,
  tile_key text not null,
  slot integer not null check (slot between 1 and 64),
  grid_x integer not null,
  grid_y integer not null,
  state text not null default 'empty'
    check (state in ('empty', 'prepared', 'planted', 'growing', 'mature')),
  prepared_at timestamptz,
  crop_instance_id uuid,
  state_version integer not null default 1 check (state_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_home_id, tile_key),
  unique (player_home_id, slot),
  unique (player_home_id, grid_x, grid_y),
  constraint player_home_farming_tile_state_check check (
    (state = 'empty' and prepared_at is null and crop_instance_id is null)
    or (state = 'prepared' and prepared_at is not null and crop_instance_id is null)
    or (state in ('planted', 'growing', 'mature') and prepared_at is not null and crop_instance_id is not null)
  )
);

create table public.player_home_crop_instances (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  farming_tile_id uuid not null references public.player_home_farming_tiles(id) on delete restrict,
  crop_definition_id uuid not null references public.cozy_crop_definitions(id) on delete restrict,
  seed_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  produce_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  crop_slug text not null,
  crop_name text not null,
  configuration_revision integer not null check (configuration_revision > 0),
  growth_duration_seconds integer not null check (growth_duration_seconds between 1 and 2592000),
  growth_stage_count integer not null check (growth_stage_count between 2 and 8),
  deterministic_yield integer not null check (deterministic_yield between 1 and 10000),
  watering_policy text not null check (watering_policy = 'water_once_to_start'),
  status text not null default 'planted'
    check (status in ('planted', 'growing', 'harvested')),
  planted_at timestamptz not null default now(),
  watered_at timestamptz,
  growth_started_at timestamptz,
  matures_at timestamptz,
  harvested_at timestamptz,
  state_version integer not null default 1 check (state_version > 0),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_home_id, farming_tile_id, id),
  constraint player_home_crop_state_check check (
    (status = 'planted' and watered_at is null and growth_started_at is null and matures_at is null and harvested_at is null)
    or (status = 'growing' and watered_at is not null and growth_started_at is not null and matures_at is not null and matures_at > growth_started_at and harvested_at is null)
    or (status = 'harvested' and watered_at is not null and growth_started_at is not null and matures_at is not null and harvested_at is not null)
  )
);

alter table public.player_home_farming_tiles
  add constraint player_home_farming_tiles_crop_fk
  foreign key (player_home_id, id, crop_instance_id)
  references public.player_home_crop_instances(player_home_id, farming_tile_id, id)
  deferrable initially deferred;

create unique index player_home_crop_instances_one_active_tile_idx
  on public.player_home_crop_instances(farming_tile_id)
  where status <> 'harvested';
create index player_home_crop_instances_maturity_idx
  on public.player_home_crop_instances(matures_at, player_profile_id)
  where status = 'growing';

create table public.cozy_starter_npcs (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 80 and name !~ '[[:cntrl:]<>]'),
  introduction text not null check (char_length(introduction) between 1 and 280 and introduction !~ '[[:cntrl:]<>]'),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  position_x numeric(8,4) not null,
  position_y numeric(8,4) not null,
  interaction_range numeric(5,2) not null check (interaction_range between 1 and 4),
  active boolean not null default true,
  content_version integer not null check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.cozy_starter_npcs (
  id, slug, name, introduction, world_map_id,
  position_x, position_y, interaction_range, active, content_version
)
select 'a1100000-0000-4000-8000-000000000021', 'willow-guide', 'Willow Guide',
  'Welcome home, neighbor. I can help you prepare soil, grow Moonbeans, and make your first village delivery.',
  map.id, 12, 10.5, 2.5, true, 2
from public.world_maps map where map.slug = 'lantern-square'
on conflict (id) do nothing;

create table public.cozy_quest_definitions (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.cozy_quest_versions (
  id uuid primary key,
  quest_definition_id uuid not null references public.cozy_quest_definitions(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null check (lifecycle_status in ('published', 'retired')),
  name text not null check (char_length(name) between 1 and 80 and name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 1 and 280 and description !~ '[[:cntrl:]<>]'),
  starter_seed_quantity integer not null check (starter_seed_quantity between 2 and 99),
  delivery_quantity integer not null check (delivery_quantity between 1 and 99),
  reward_dust bigint not null check (reward_dust between 1 and 10000),
  starter_hoe_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  starter_watering_can_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  starter_seed_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  delivery_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  active boolean not null default true,
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (quest_definition_id, version_number)
);

create unique index cozy_quest_versions_one_published_idx
  on public.cozy_quest_versions(quest_definition_id)
  where lifecycle_status = 'published' and active;

create table public.cozy_quest_objectives (
  id uuid primary key,
  quest_version_id uuid not null references public.cozy_quest_versions(id) on delete restrict,
  objective_key text not null check (objective_key in (
    'meet_guide', 'receive_starter_kit', 'enter_home_plot', 'prepare_soil',
    'plant_crops', 'water_crops', 'harvest_crop', 'deliver_produce', 'receive_reward'
  )),
  sequence_number integer not null check (sequence_number between 1 and 32),
  label text not null check (char_length(label) between 1 and 120 and label !~ '[[:cntrl:]<>]'),
  required_count integer not null check (required_count between 1 and 10000),
  unique (quest_version_id, objective_key),
  unique (quest_version_id, sequence_number)
);

insert into public.cozy_quest_definitions (id, slug)
values ('a1100000-0000-4000-8000-000000000031', 'first-moonbean-harvest')
on conflict (id) do nothing;

insert into public.cozy_quest_versions (
  id, quest_definition_id, version_number, lifecycle_status, name, description,
  starter_seed_quantity, delivery_quantity, reward_dust,
  starter_hoe_item_definition_id, starter_watering_can_item_definition_id,
  starter_seed_item_definition_id, delivery_item_definition_id,
  active, published_at
) values (
  'a1100000-0000-4000-8000-000000000032',
  'a1100000-0000-4000-8000-000000000031', 1, 'published',
  'Your First Moonbean Harvest',
  'Prepare two garden tiles, grow Moonbeans, and bring a small delivery back to Willow Guide.',
  4, 2, 25,
  'a1100000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000021',
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000004',
  true, now()
)
on conflict (id) do nothing;

insert into public.cozy_quest_objectives (
  id, quest_version_id, objective_key, sequence_number, label, required_count
) values
  ('a1100000-0000-4000-8000-000000000041','a1100000-0000-4000-8000-000000000032','meet_guide',1,'Speak with Willow Guide',1),
  ('a1100000-0000-4000-8000-000000000042','a1100000-0000-4000-8000-000000000032','receive_starter_kit',2,'Receive the starter farming kit',1),
  ('a1100000-0000-4000-8000-000000000043','a1100000-0000-4000-8000-000000000032','enter_home_plot',3,'Enter your private home plot',1),
  ('a1100000-0000-4000-8000-000000000044','a1100000-0000-4000-8000-000000000032','prepare_soil',4,'Prepare two garden tiles',2),
  ('a1100000-0000-4000-8000-000000000045','a1100000-0000-4000-8000-000000000032','plant_crops',5,'Plant two Moonbean seeds',2),
  ('a1100000-0000-4000-8000-000000000046','a1100000-0000-4000-8000-000000000032','water_crops',6,'Water both crops',2),
  ('a1100000-0000-4000-8000-000000000047','a1100000-0000-4000-8000-000000000032','harvest_crop',7,'Harvest one mature Moonbean crop',1),
  ('a1100000-0000-4000-8000-000000000048','a1100000-0000-4000-8000-000000000032','deliver_produce',8,'Deliver two Moonbeans',1),
  ('a1100000-0000-4000-8000-000000000049','a1100000-0000-4000-8000-000000000032','receive_reward',9,'Receive the tutorial DUST reward',1)
on conflict (id) do nothing;

create table public.player_quest_instances (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  quest_definition_id uuid not null references public.cozy_quest_definitions(id) on delete restrict,
  quest_version_id uuid not null references public.cozy_quest_versions(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'reward_claimed', 'archived')),
  state_version integer not null default 1 check (state_version > 0),
  accepted_at timestamptz not null default now(),
  completed_at timestamptz,
  reward_settled_at timestamptz,
  reward_ledger_entry_id uuid references public.player_dust_ledger(id) on delete restrict,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_profile_id, quest_definition_id),
  constraint player_quest_completion_check check (
    (status = 'active' and completed_at is null and reward_settled_at is null and reward_ledger_entry_id is null)
    or (status = 'reward_claimed' and completed_at is not null and reward_settled_at is not null and reward_ledger_entry_id is not null)
    or status = 'archived'
  )
);

create table public.player_quest_objective_progress (
  player_quest_instance_id uuid not null references public.player_quest_instances(id) on delete restrict,
  quest_objective_id uuid not null references public.cozy_quest_objectives(id) on delete restrict,
  current_count integer not null default 0 check (current_count between 0 and 10000),
  completed_at timestamptz,
  state_version integer not null default 1 check (state_version > 0),
  updated_at timestamptz not null default now(),
  primary key (player_quest_instance_id, quest_objective_id)
);

create table public.player_quest_events (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_quest_instance_id uuid not null references public.player_quest_instances(id) on delete restrict,
  event_key text not null check (event_key in (
    'quest_accepted', 'starter_kit_granted', 'plot_entered', 'soil_prepared',
    'crop_planted', 'crop_watered', 'crop_harvested',
    'tutorial_produce_delivered', 'tutorial_reward_settled'
  )),
  related_entity_id uuid,
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  event_summary jsonb not null default '{}'::jsonb check (
    jsonb_typeof(event_summary) = 'object' and pg_column_size(event_summary) <= 4096
  ),
  created_at timestamptz not null default now(),
  unique (player_quest_instance_id, event_key, related_entity_id),
  unique (player_profile_id, event_key, idempotency_key)
);

create table public.cozy_plot_provisioning_events (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  status text not null check (status in ('started', 'completed', 'failed', 'reconciled')),
  request_id text not null check (char_length(request_id) between 1 and 128),
  detail jsonb not null default '{}'::jsonb check (
    jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096
  ),
  created_at timestamptz not null default now()
);

create table public.cozy_farming_action_cooldowns (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  action_key text not null check (action_key in ('prepare', 'plant', 'water', 'harvest', 'delivery')),
  last_action_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (player_profile_id, action_key)
);

create table public.cozy_private_plot_events (
  id uuid primary key default gen_random_uuid(),
  event_number bigint generated always as identity unique,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  event_key text not null check (event_key in (
    'plot_provisioned', 'soil_prepared', 'crop_planted', 'crop_watered',
    'crop_stage_changed', 'crop_harvested', 'inventory_changed', 'quest_progressed'
  )),
  target_id uuid,
  payload jsonb not null default '{}'::jsonb check (
    jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 8192
  ),
  created_at timestamptz not null default now()
);

create table public.cozy_farming_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid references public.player_profiles(id) on delete restrict,
  player_home_id uuid references public.player_homes(id) on delete restrict,
  reconciliation_type text not null check (reconciliation_type in (
    'stuck_provisioning', 'impossible_crop_state', 'quest_reward_settlement'
  )),
  status text not null default 'pending' check (status in ('pending', 'processing', 'resolved', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  available_at timestamptz not null default now(),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index player_quest_instances_player_idx
  on public.player_quest_instances(player_profile_id, updated_at desc);
create index player_quest_events_player_idx
  on public.player_quest_events(player_profile_id, created_at desc, id);
create index cozy_private_plot_events_home_idx
  on public.cozy_private_plot_events(player_home_id, event_number desc);
create index cozy_farming_reconciliation_pending_idx
  on public.cozy_farming_reconciliation_queue(status, available_at)
  where status in ('pending', 'failed');

create trigger cozy_farming_settings_set_updated_at
before update on public.cozy_farming_settings
for each row execute function private.set_updated_at();
create trigger player_home_farming_tiles_set_updated_at
before update on public.player_home_farming_tiles
for each row execute function private.set_updated_at();
create trigger player_home_crop_instances_set_updated_at
before update on public.player_home_crop_instances
for each row execute function private.set_updated_at();
create trigger cozy_starter_npcs_set_updated_at
before update on public.cozy_starter_npcs
for each row execute function private.set_updated_at();
create trigger player_quest_instances_set_updated_at
before update on public.player_quest_instances
for each row execute function private.set_updated_at();
create trigger player_quest_objective_progress_set_updated_at
before update on public.player_quest_objective_progress
for each row execute function private.set_updated_at();
create trigger cozy_farming_reconciliation_queue_set_updated_at
before update on public.cozy_farming_reconciliation_queue
for each row execute function private.set_updated_at();

create trigger cozy_quest_versions_immutable
before update or delete on public.cozy_quest_versions
for each row execute function private.reject_cozy_append_only_mutation();
create trigger cozy_quest_objectives_immutable
before update or delete on public.cozy_quest_objectives
for each row execute function private.reject_cozy_append_only_mutation();
create trigger player_quest_events_append_only
before update or delete on public.player_quest_events
for each row execute function private.reject_cozy_append_only_mutation();
create trigger cozy_plot_provisioning_events_append_only
before update or delete on public.cozy_plot_provisioning_events
for each row execute function private.reject_cozy_append_only_mutation();
create trigger cozy_private_plot_events_append_only
before update or delete on public.cozy_private_plot_events
for each row execute function private.reject_cozy_append_only_mutation();

alter table public.cozy_gameplay_idempotency
  drop constraint cozy_gameplay_idempotency_operation_check;
alter table public.cozy_gameplay_idempotency
  add constraint cozy_gameplay_idempotency_operation_check check (operation in (
    'bootstrap', 'quickbar_update', 'farm_plant', 'farm_water', 'farm_harvest',
    'recipe_cook', 'recipe_craft', 'shop_buy', 'shop_sell',
    'home_enter', 'home_exit', 'furniture_place', 'furniture_move',
    'furniture_rotate', 'furniture_remove',
    'starter_quest_accept', 'home_soil_prepare', 'home_crop_plant',
    'home_crop_water', 'home_crop_harvest', 'starter_quest_delivery'
  ));

alter table public.cozy_gameplay_rate_limits
  drop constraint cozy_gameplay_rate_limits_scope_check;
alter table public.cozy_gameplay_rate_limits
  add constraint cozy_gameplay_rate_limits_scope_check check (scope in (
    'bootstrap', 'dust_read', 'inventory_read', 'history_read', 'quickbar_write',
    'farm_read', 'farm_write', 'recipe_read', 'recipe_write', 'shop_read', 'shop_write',
    'home_read', 'home_write', 'vertical_slice_read', 'plot_provision',
    'home_farm_write', 'starter_quest_write'
  ));

alter table public.player_inventory_history
  drop constraint player_inventory_history_reason_check;
alter table public.player_inventory_history
  add constraint player_inventory_history_reason_check check (reason in (
    'starter_grant', 'shop_purchase', 'shop_sale', 'planting', 'harvest',
    'cooking', 'crafting', 'furniture_placement', 'furniture_removal',
    'social_gift', 'social_trade', 'system_refund',
    'cooperative_activity_reward', 'tutorial_delivery'
  ));

alter table public.player_dust_ledger
  drop constraint player_dust_ledger_reason_check;
alter table public.player_dust_ledger
  add constraint player_dust_ledger_reason_check check (reason in (
    'starter_grant','shop_purchase','shop_sale','crafting_fee','system_refund',
    'migration_adjustment','cooperative_activity_reward','administrative_correction',
    'starter_farming_quest_reward'
  ));
alter table public.player_dust_ledger
  drop constraint player_dust_ledger_reference_type_check;
alter table public.player_dust_ledger
  add constraint player_dust_ledger_reference_type_check check (reference_type in (
    'player_bootstrap', 'shop_transaction', 'recipe_action', 'system_operation', 'migration',
    'cooperative_activity', 'starter_farming_quest'
  ));

insert into public.economy_source_versions (
  id, source_key, version_number, lifecycle_status, operation_key, category,
  label, description, minimum_amount, maximum_amount, repeatable,
  daily_limit, weekly_limit, account_lifetime_limit, wallet_daily_limit,
  cooldown_seconds, beginner_protected, risk_weight, published_at
) values (
  'a1100000-0000-4000-8000-000000000051',
  'starter-farming-tutorial', 1, 'published', 'starter_farming_quest_reward',
  'gameplay_reward', 'Starter farming tutorial',
  'One bounded server-authoritative reward for completing the starter farming quest.',
  25, 25, false, 1, 1, 1, 1, 0, true, 2, now()
)
on conflict (id) do nothing;

insert into public.economy_active_source_versions (source_key, source_version_id)
values ('starter-farming-tutorial', 'a1100000-0000-4000-8000-000000000051')
on conflict (source_key) do update set
  source_version_id = excluded.source_version_id,
  activated_at = now();

insert into public.admin_permissions (key, name, description, category, is_sensitive, is_system)
values
  ('farming.read', 'Read farming configuration', 'Inspect versioned crops, starter plot templates, quest configuration, and bounded telemetry.', 'gameplay', false, true),
  ('farming.liveops', 'Manage farming live operations', 'Change bounded farming maintenance flags with AAL2 authorization and audit evidence.', 'gameplay', true, true),
  ('farming.player_read', 'Read player farming state', 'Inspect one player private plot, crops, quest progress, and settlement references.', 'gameplay', true, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

with mapping(role_key, permission_key) as (values
  ('super_admin', 'farming.read'),
  ('super_admin', 'farming.liveops'),
  ('super_admin', 'farming.player_read'),
  ('game_administrator', 'farming.read'),
  ('game_administrator', 'farming.player_read'),
  ('live_operations_manager', 'farming.read'),
  ('live_operations_manager', 'farming.liveops'),
  ('read_only_analyst', 'farming.read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles role on role.key = mapping.role_key
join public.admin_permissions permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

create or replace function private.claim_cozy_gameplay_rate_limit(
  p_player_profile_id uuid,
  p_scope text,
  p_limit integer
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare claimed boolean;
begin
  if p_player_profile_id is null
     or p_scope not in (
       'bootstrap','dust_read','inventory_read','history_read','quickbar_write',
       'farm_read','farm_write','recipe_read','recipe_write','shop_read','shop_write',
       'home_read','home_write','vertical_slice_read','plot_provision',
       'home_farm_write','starter_quest_write'
     )
     or p_limit not between 1 and 600 then
    raise exception using errcode='22023',message='INVALID_COZY_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-rate:'||p_player_profile_id::text||':'||p_scope,0));
  insert into public.cozy_gameplay_rate_limits(
    player_profile_id,scope,attempt_count,window_started_at,window_expires_at,updated_at
  ) values(p_player_profile_id,p_scope,1,now(),now()+interval '1 minute',now())
  on conflict(player_profile_id,scope) do update
  set attempt_count=case when cozy_gameplay_rate_limits.window_expires_at<=now()
        then 1 else cozy_gameplay_rate_limits.attempt_count+1 end,
      window_started_at=case when cozy_gameplay_rate_limits.window_expires_at<=now()
        then now() else cozy_gameplay_rate_limits.window_started_at end,
      window_expires_at=case when cozy_gameplay_rate_limits.window_expires_at<=now()
        then now()+interval '1 minute' else cozy_gameplay_rate_limits.window_expires_at end,
      updated_at=now()
  where cozy_gameplay_rate_limits.window_expires_at<=now()
     or cozy_gameplay_rate_limits.attempt_count<p_limit
  returning true into claimed;
  return coalesce(claimed,false);
end;
$$;

create or replace function private.cozy_apply_dust_delta(
  p_player_profile_id uuid, p_delta bigint, p_reason text, p_reference_type text,
  p_reference_id text, p_idempotency_key text, p_request_id text
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare account public.player_dust_accounts%rowtype; policy public.economy_policy_versions%rowtype;
begin
  select version.* into strict policy
  from public.economy_active_policy active
  join public.economy_policy_versions version on version.id = active.policy_version_id
  where active.singleton_key;
  if not policy.economy_enabled and p_reason not in ('system_refund','migration_adjustment') then return false; end if;
  if p_reason in ('shop_purchase','shop_sale') and not policy.purchases_enabled then return false; end if;
  if p_reason in ('cooperative_activity_reward','starter_farming_quest_reward')
     and not policy.rewards_enabled then return false; end if;
  if p_reason = 'administrative_correction' and not policy.corrections_enabled then return false; end if;
  if p_delta > 0 and not exists(
    select 1 from public.economy_active_source_versions active
    join public.economy_source_versions source on source.id=active.source_version_id
    where source.operation_key=p_reason and source.lifecycle_status='published' and source.effective_at<=now()
      and p_delta between source.minimum_amount and source.maximum_amount
  ) then return false; end if;
  if p_delta < 0 and not exists(
    select 1 from public.economy_active_sink_versions active
    join public.economy_sink_versions sink on sink.id=active.sink_version_id
    where sink.operation_key=p_reason and sink.lifecycle_status='published' and sink.effective_at<=now()
      and abs(p_delta) between sink.minimum_amount and sink.maximum_amount
  ) then return false; end if;
  select * into strict account from public.player_dust_accounts
  where player_profile_id = p_player_profile_id for update;
  if p_delta = 0 then return true; end if;
  if account.balance + p_delta < 0 or account.balance + p_delta > 9000000000000000 then return false; end if;
  update public.player_dust_accounts set
    balance = balance + p_delta, state_version = state_version + 1, updated_at = now()
  where player_profile_id = p_player_profile_id returning * into account;
  insert into public.player_dust_ledger (
    player_profile_id, delta, resulting_balance, reason, reference_type,
    reference_id, idempotency_key, request_id
  ) values (
    p_player_profile_id, p_delta, account.balance, p_reason, p_reference_type,
    p_reference_id,
    encode(extensions.digest(convert_to(p_reason || ':' || p_idempotency_key, 'UTF8'), 'sha256'), 'hex'),
    p_request_id
  );
  return true;
end;
$$;

create or replace function private.cozy_farming_live_ops_json()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plantingEnabled', settings.planting_enabled,
    'harvestingEnabled', settings.harvesting_enabled,
    'plotProvisioningEnabled', settings.plot_provisioning_enabled,
    'starterQuestEnabled', settings.starter_quest_enabled,
    'tutorialRewardsEnabled', settings.tutorial_rewards_enabled,
    'maintenanceMessage', settings.maintenance_message,
    'configurationRevision', settings.configuration_revision
  )
  from public.cozy_farming_settings settings where settings.singleton_key;
$$;

create or replace function private.cozy_starter_npc_json()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', npc.id, 'slug', npc.slug, 'name', npc.name,
    'introduction', npc.introduction, 'worldId', map.slug,
    'x', npc.position_x, 'y', npc.position_y,
    'interactionRange', npc.interaction_range, 'active', npc.active
  )
  from public.cozy_starter_npcs npc
  join public.world_maps map on map.id = npc.world_map_id
  where npc.slug = 'willow-guide';
$$;

create or replace function private.cozy_home_crop_json(crop public.player_home_crop_instances)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare progress numeric; derived_state text; stage integer; seed_slug text; produce_slug text;
begin
  if crop.status = 'planted' then
    progress := 0; derived_state := 'planted'; stage := 1;
  elsif crop.matures_at <= now() then
    progress := 1; derived_state := 'mature'; stage := crop.growth_stage_count;
  else
    progress := greatest(0, least(1,
      extract(epoch from (now() - crop.growth_started_at))
      / nullif(extract(epoch from (crop.matures_at - crop.growth_started_at)), 0)
    ));
    derived_state := 'growing';
    stage := least(crop.growth_stage_count,
      greatest(1, floor(progress * crop.growth_stage_count)::integer + 1));
  end if;
  select slug into strict seed_slug from public.cozy_item_definitions where id=crop.seed_item_definition_id;
  select slug into strict produce_slug from public.cozy_item_definitions where id=crop.produce_item_definition_id;
  return jsonb_build_object(
    'id',crop.id,'tileId',crop.farming_tile_id,'state',derived_state,
    'snapshot',jsonb_build_object(
      'definitionId',crop.crop_definition_id,'cropSlug',crop.crop_slug,'cropName',crop.crop_name,
      'seedItemSlug',seed_slug,'produceItemSlug',produce_slug,
      'configurationRevision',crop.configuration_revision,
      'growthDurationSeconds',crop.growth_duration_seconds,
      'growthStageCount',crop.growth_stage_count,
      'deterministicYield',crop.deterministic_yield,
      'wateringPolicy',crop.watering_policy
    ),
    'plantedAt',crop.planted_at,'wateredAt',crop.watered_at,
    'growthStartedAt',crop.growth_started_at,'maturesAt',crop.matures_at,
    'growthProgress',progress,'growthStage',stage,
    'stateVersion',crop.state_version,'updatedAt',crop.updated_at
  );
end;
$$;

create or replace function private.cozy_home_farm_tile_json(tile public.player_home_farming_tiles)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare crop public.player_home_crop_instances%rowtype; derived_state text; crop_json jsonb;
begin
  derived_state := tile.state;
  crop_json := null;
  if tile.crop_instance_id is not null then
    select * into strict crop from public.player_home_crop_instances where id=tile.crop_instance_id;
    crop_json := private.cozy_home_crop_json(crop);
    if crop.status='growing' and crop.matures_at<=now() then derived_state:='mature'; end if;
  end if;
  return jsonb_build_object(
    'id',tile.id,'tileKey',tile.tile_key,'slot',tile.slot,'x',tile.grid_x,'y',tile.grid_y,
    'state',derived_state,'preparedAt',tile.prepared_at,'crop',crop_json,
    'stateVersion',tile.state_version,'updatedAt',tile.updated_at
  );
end;
$$;

create or replace function private.cozy_home_plot_json(home public.player_homes)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',home.id,'ownerPlayerId',home.player_profile_id,
    'lifecycle',home.lifecycle_status,'templateId',template.id,
    'templateSlug',template.slug,
    'templateVersion',coalesce(home.provisioned_template_version,template.template_version),
    'instanceKey','personal-home:'||home.id::text,
    'bounds',jsonb_build_object(
      'minX',template.min_x,'minY',template.min_y,'maxX',template.max_x,'maxY',template.max_y
    ),
    'spawn',jsonb_build_object('x',template.spawn_x,'y',template.spawn_y),
    'exit',jsonb_build_object('x',template.exit_x,'y',template.exit_y),
    'currentPosition',jsonb_build_object('x',home.current_position_x,'y',home.current_position_y),
    'location',case when home.inside_home then 'personal_home' else 'lantern_square' end,
    'tiles',coalesce((
      select jsonb_agg(private.cozy_home_farm_tile_json(tile) order by tile.slot)
      from public.player_home_farming_tiles tile where tile.player_home_id=home.id
    ),'[]'::jsonb),
    'farmingStateVersion',home.farming_state_version,
    'stateVersion',home.state_version,'createdAt',home.created_at,'updatedAt',home.updated_at
  )
  from public.cozy_home_templates template where template.id=home.template_id;
$$;

create or replace function private.cozy_starter_quest_json(p_player_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare version public.cozy_quest_versions%rowtype; definition public.cozy_quest_definitions%rowtype;
  instance public.player_quest_instances%rowtype; receipt text;
begin
  select * into strict version from public.cozy_quest_versions
  where lifecycle_status='published' and active order by version_number desc limit 1;
  select * into strict definition from public.cozy_quest_definitions where id=version.quest_definition_id;
  select * into instance from public.player_quest_instances
  where player_profile_id=p_player_profile_id and quest_definition_id=definition.id;
  if found and instance.reward_ledger_entry_id is not null then
    select public_receipt_id into receipt from public.player_dust_ledger where id=instance.reward_ledger_entry_id;
  end if;
  return jsonb_build_object(
    'definitionId',definition.id,'versionId',version.id,
    'instanceId',case when instance.id is null then null else instance.id end,
    'slug',definition.slug,'name',version.name,'description',version.description,
    'status',case when instance.id is null then 'available' else instance.status end,
    'objectives',(
      select jsonb_agg(jsonb_build_object(
        'key',objective.objective_key,'label',objective.label,
        'current',coalesce(progress.current_count,0),'required',objective.required_count,
        'completed',coalesce(progress.current_count,0)>=objective.required_count
      ) order by objective.sequence_number)
      from public.cozy_quest_objectives objective
      left join public.player_quest_objective_progress progress
        on progress.quest_objective_id=objective.id
       and progress.player_quest_instance_id=instance.id
      where objective.quest_version_id=version.id
    ),
    'starterSeedQuantity',version.starter_seed_quantity,
    'deliveryQuantity',version.delivery_quantity,'rewardDust',version.reward_dust,
    'stateVersion',coalesce(instance.state_version,0),
    'acceptedAt',instance.accepted_at,'completedAt',instance.completed_at,
    'rewardReceiptId',receipt
  );
end;
$$;

create or replace function private.cozy_playable_vertical_slice_json(p_player_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare home public.player_homes%rowtype;
begin
  select * into strict home from public.player_homes where player_profile_id=p_player_profile_id;
  return jsonb_build_object(
    'contentVersion',2,'plot',private.cozy_home_plot_json(home),
    'inventory',private.cozy_inventory_json(p_player_profile_id),
    'quickbar',private.cozy_quickbar_json(p_player_profile_id),
    'quest',private.cozy_starter_quest_json(p_player_profile_id),
    'npc',private.cozy_starter_npc_json(),'liveOps',private.cozy_farming_live_ops_json(),
    'realtimeChannel','private-home:'||home.id::text,'serverTime',now()
  );
end;
$$;

create or replace function private.ensure_player_home(p_player_profile_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  profile public.player_profiles%rowtype;
  home public.player_homes%rowtype;
  starter_furniture public.cozy_furniture_definitions%rowtype;
  grant_key text;
begin
  select * into strict profile
  from public.player_profiles where id = p_player_profile_id for update;
  insert into public.player_homes (
    player_profile_id, template_id, return_world_map_id, return_map_version_id,
    return_position_x, return_position_y, return_facing_direction,
    current_position_x, current_position_y
  )
  select profile.id, template.id, map.id,
    coalesce(profile.current_map_version_id, map.active_published_version_id),
    profile.safe_position_x, profile.safe_position_y, profile.facing_direction,
    template.spawn_x, template.spawn_y
  from public.cozy_home_templates template
  join public.world_maps map on map.slug = profile.current_map_id
  where template.slug = 'starter-cottage-interior' and template.active
  on conflict (player_profile_id) do nothing;

  select * into strict home
  from public.player_homes where player_profile_id = profile.id for update;
  if home.starter_furniture_granted_at is null then
    select * into strict starter_furniture
    from public.cozy_furniture_definitions where slug = 'willow-chair';
    grant_key := 'phase7-starter-furniture:' || profile.id::text;
    if not private.cozy_add_item(
      profile.id, starter_furniture.item_definition_id, 1,
      'starter_grant', home.id::text, grant_key, grant_key
    ) then
      raise exception using errcode = '23514', message = 'STARTER_FURNITURE_GRANT_FAILED';
    end if;
    update public.player_homes
    set starter_furniture_granted_at = now(), state_version = state_version + 1
    where id = home.id;
  end if;
end;
$$;

create or replace function private.ensure_player_home_plot(
  p_player_profile_id uuid,
  p_request_id text
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare home public.player_homes%rowtype; template public.cozy_home_templates%rowtype;
  settings public.cozy_farming_settings%rowtype; tile_count integer;
begin
  select * into strict settings from public.cozy_farming_settings where singleton_key;
  if not settings.plot_provisioning_enabled then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'phase11-home-plot:'||p_player_profile_id::text,0));
  perform private.ensure_player_home(p_player_profile_id);
  select * into strict home from public.player_homes
  where player_profile_id=p_player_profile_id for update;
  select * into strict template from public.cozy_home_templates where id=home.template_id;
  select count(*) into tile_count from public.player_home_farming_tiles
  where player_home_id=home.id;
  if home.lifecycle_status='active' and tile_count=8 then return true; end if;
  insert into public.cozy_plot_provisioning_events(
    player_profile_id,player_home_id,status,request_id,detail
  ) values(p_player_profile_id,home.id,'started',p_request_id,
    jsonb_build_object('templateVersion',template.template_version));
  update public.player_homes set
    lifecycle_status='provisioning',provisioning_error_code=null
  where id=home.id;
  insert into public.player_home_farming_tiles(
    player_home_id,template_tile_id,tile_key,slot,grid_x,grid_y
  )
  select home.id,tile.id,tile.tile_key,tile.slot,tile.grid_x,tile.grid_y
  from public.cozy_home_farm_tile_templates tile
  where tile.home_template_id=home.template_id
    and tile.template_version=template.template_version and tile.active
  order by tile.slot
  on conflict (player_home_id,slot) do nothing;
  select count(*) into tile_count from public.player_home_farming_tiles
  where player_home_id=home.id;
  if tile_count<>8 then
    update public.player_homes set lifecycle_status='provisioning_failed',
      provisioning_error_code='INVALID_STARTER_PLOT_TILE_SET'
    where id=home.id;
    insert into public.cozy_plot_provisioning_events(
      player_profile_id,player_home_id,status,request_id,detail
    ) values(p_player_profile_id,home.id,'failed',p_request_id,
      jsonb_build_object('errorCode','INVALID_STARTER_PLOT_TILE_SET','tileCount',tile_count));
    insert into public.cozy_farming_reconciliation_queue(
      player_profile_id,player_home_id,reconciliation_type
    ) values(p_player_profile_id,home.id,'stuck_provisioning');
    return false;
  end if;
  update public.player_homes set
    lifecycle_status='active',provisioned_template_version=template.template_version,
    provisioning_error_code=null,farming_state_version=farming_state_version+1,
    current_position_x=template.spawn_x,current_position_y=template.spawn_y
  where id=home.id returning * into home;
  insert into public.cozy_plot_provisioning_events(
    player_profile_id,player_home_id,status,request_id,detail
  ) values(p_player_profile_id,home.id,'completed',p_request_id,
    jsonb_build_object('tileCount',tile_count,'templateVersion',template.template_version));
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(p_player_profile_id,home.id,'plot_provisioned',home.id,
    jsonb_build_object('templateVersion',template.template_version,'tileCount',tile_count));
  return true;
end;
$$;

create or replace function private.cozy_advance_starter_quest(
  p_player_profile_id uuid,
  p_event_key text,
  p_related_entity_id uuid,
  p_idempotency_key text,
  p_request_id text
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare instance public.player_quest_instances%rowtype; selected_objective_key text;
  objective public.cozy_quest_objectives%rowtype; inserted_count integer; home_id uuid;
begin
  select * into instance from public.player_quest_instances
  where player_profile_id=p_player_profile_id and status='active' for update;
  if not found then return false; end if;
  selected_objective_key := case p_event_key
    when 'quest_accepted' then 'meet_guide'
    when 'starter_kit_granted' then 'receive_starter_kit'
    when 'plot_entered' then 'enter_home_plot'
    when 'soil_prepared' then 'prepare_soil'
    when 'crop_planted' then 'plant_crops'
    when 'crop_watered' then 'water_crops'
    when 'crop_harvested' then 'harvest_crop'
    when 'tutorial_produce_delivered' then 'deliver_produce'
    when 'tutorial_reward_settled' then 'receive_reward'
    else null end;
  if selected_objective_key is null then
    raise exception using errcode='22023',message='INVALID_STARTER_QUEST_EVENT';
  end if;
  insert into public.player_quest_events(
    player_profile_id,player_quest_instance_id,event_key,related_entity_id,
    idempotency_key,request_id,event_summary
  ) values(
    p_player_profile_id,instance.id,p_event_key,p_related_entity_id,
    p_idempotency_key,p_request_id,jsonb_build_object('objectiveKey',selected_objective_key)
  ) on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count=0 then return false; end if;
  select * into strict objective from public.cozy_quest_objectives
  where quest_version_id=instance.quest_version_id
    and cozy_quest_objectives.objective_key=selected_objective_key;
  update public.player_quest_objective_progress progress set
    current_count=least(objective.required_count,progress.current_count+1),
    completed_at=case when progress.current_count+1>=objective.required_count
      then coalesce(progress.completed_at,now()) else progress.completed_at end,
    state_version=progress.state_version+1
  where progress.player_quest_instance_id=instance.id
    and progress.quest_objective_id=objective.id;
  update public.player_quest_instances set state_version=state_version+1
  where id=instance.id;
  select id into home_id from public.player_homes where player_profile_id=p_player_profile_id;
  if home_id is not null then
    insert into public.cozy_private_plot_events(
      player_profile_id,player_home_id,event_key,target_id,payload
    ) values(p_player_profile_id,home_id,'quest_progressed',p_related_entity_id,
      jsonb_build_object('objectiveKey',selected_objective_key));
  end if;
  return true;
end;
$$;

create or replace function private.cozy_claim_farming_cooldown(
  p_player_profile_id uuid,
  p_action_key text,
  p_cooldown_ms integer
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare claimed boolean;
begin
  if p_action_key not in ('prepare','plant','water','harvest','delivery')
     or p_cooldown_ms not between 100 and 10000 then
    raise exception using errcode='22023',message='INVALID_FARMING_COOLDOWN';
  end if;
  insert into public.cozy_farming_action_cooldowns(
    player_profile_id,action_key,last_action_at,updated_at
  ) values(p_player_profile_id,p_action_key,clock_timestamp(),clock_timestamp())
  on conflict(player_profile_id,action_key) do update set
    last_action_at=clock_timestamp(),updated_at=clock_timestamp()
  where cozy_farming_action_cooldowns.last_action_at
    <= clock_timestamp() - make_interval(secs=>p_cooldown_ms::numeric/1000)
  returning true into claimed;
  return coalesce(claimed,false);
end;
$$;

create or replace function private.cozy_home_tile_in_range(
  p_home public.player_homes,
  p_tile public.player_home_farming_tiles,
  p_distance numeric
)
returns boolean language sql immutable security definer set search_path = '' as $$
  select sqrt(power(p_home.current_position_x-p_tile.grid_x,2)
    + power(p_home.current_position_y-p_tile.grid_y,2))<=p_distance;
$$;

create or replace function public.get_player_playable_vertical_slice(
  p_wallet_address text,
  p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; config public.cozy_gameplay_config%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_VERTICAL_SLICE_READ_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  if not exists(select 1 from public.player_homes where player_profile_id=profile.id) then
    return jsonb_build_object('status','bootstrap_required');
  end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'vertical_slice_read',config.read_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  return jsonb_build_object('status','loaded')||private.cozy_playable_vertical_slice_json(profile.id);
end;
$$;

create or replace function public.accept_player_starter_farming_quest(
  p_wallet_address text,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; settings public.cozy_farming_settings%rowtype;
  config public.cozy_gameplay_config%rowtype; npc public.cozy_starter_npcs%rowtype;
  version public.cozy_quest_versions%rowtype; instance public.player_quest_instances%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; request_hash text; response jsonb;
  grant_quantity integer; existing_quantity integer;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_STARTER_QUEST_ACCEPT_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict settings from public.cozy_farming_settings where singleton_key;
  if not settings.starter_quest_enabled then return jsonb_build_object('status','quest_not_available'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'starter_quest_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict npc from public.cozy_starter_npcs where slug='willow-guide' and active;
  if profile.current_map_id<>(select slug from public.world_maps where id=npc.world_map_id)
     or sqrt(power(profile.safe_position_x-npc.position_x,2)+power(profile.safe_position_y-npc.position_y,2))>npc.interaction_range
    then return jsonb_build_object('status','tool_action_too_far'); end if;
  request_hash:=encode(extensions.digest(convert_to('starter_quest_accept','UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':starter_quest_accept:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='starter_quest_accept'
    and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  if exists(select 1 from public.player_quest_instances
    where player_profile_id=profile.id) then return jsonb_build_object('status','quest_already_accepted'); end if;
  if not private.ensure_player_home_plot(profile.id,p_request_id) then
    return jsonb_build_object('status','plot_provisioning_failed');
  end if;
  select * into strict version from public.cozy_quest_versions
  where lifecycle_status='published' and active order by version_number desc limit 1;
  begin
    insert into public.player_quest_instances(
      player_profile_id,quest_definition_id,quest_version_id
    ) values(profile.id,version.quest_definition_id,version.id)
    returning * into instance;
    insert into public.player_quest_objective_progress(
      player_quest_instance_id,quest_objective_id
    ) select instance.id,objective.id from public.cozy_quest_objectives objective
      where objective.quest_version_id=version.id;
    if private.cozy_owned_quantity(profile.id,version.starter_hoe_item_definition_id)=0
       and not private.cozy_add_item(profile.id,version.starter_hoe_item_definition_id,1,
         'starter_grant',instance.id::text,'phase11-hoe:'||instance.id::text,p_request_id) then
      raise exception using errcode='P0001',message='STARTER_KIT_INVENTORY_FULL';
    end if;
    if private.cozy_owned_quantity(profile.id,version.starter_watering_can_item_definition_id)=0
       and not private.cozy_add_item(profile.id,version.starter_watering_can_item_definition_id,1,
         'starter_grant',instance.id::text,'phase11-can:'||instance.id::text,p_request_id) then
      raise exception using errcode='P0001',message='STARTER_KIT_INVENTORY_FULL';
    end if;
    existing_quantity:=private.cozy_owned_quantity(profile.id,version.starter_seed_item_definition_id);
    grant_quantity:=greatest(0,version.starter_seed_quantity-existing_quantity);
    if grant_quantity>0 and not private.cozy_add_item(
      profile.id,version.starter_seed_item_definition_id,grant_quantity,
      'starter_grant',instance.id::text,'phase11-seed:'||instance.id::text,p_request_id
    ) then raise exception using errcode='P0001',message='STARTER_KIT_INVENTORY_FULL'; end if;
    perform private.cozy_advance_starter_quest(profile.id,'quest_accepted',instance.id,
      'phase11-accept:'||instance.id::text,p_request_id);
    perform private.cozy_advance_starter_quest(profile.id,'starter_kit_granted',instance.id,
      'phase11-kit:'||instance.id::text,p_request_id);
  exception when raise_exception then
    return jsonb_build_object('status','inventory_full');
  end;
  response:=jsonb_build_object(
    'status','updated','view',private.cozy_playable_vertical_slice_json(profile.id),
    'replayed',false,'announcement','Starter farming kit received. Your private home plot is ready.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'starter_quest_accept',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.enter_player_home(
  p_wallet_address text,p_expected_home_state_version integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb; player_id uuid; home_id uuid;
begin
  result:=private.cozy_home_access(
    p_wallet_address,'home_enter',p_expected_home_state_version,p_idempotency_key,p_request_id
  );
  if result->>'status' in ('updated','replayed') then
    select profile.id,home.id into strict player_id,home_id
    from public.player_profiles profile
    join public.player_homes home on home.player_profile_id=profile.id
    where profile.wallet_address=p_wallet_address;
    if not private.ensure_player_home_plot(player_id,p_request_id) then
      return jsonb_build_object('status','plot_provisioning_failed');
    end if;
    perform private.cozy_advance_starter_quest(
      player_id,'plot_entered',home_id,'phase11-enter:'||home_id::text,p_request_id
    );
  end if;
  return result;
end;
$$;

create or replace function public.prepare_player_home_soil(
  p_wallet_address text,p_tile_id uuid,p_expected_tile_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; home public.player_homes%rowtype; tile public.player_home_farming_tiles%rowtype;
  settings public.cozy_farming_settings%rowtype; config public.cozy_gameplay_config%rowtype;
  hoe_id uuid; receipt public.cozy_gameplay_idempotency%rowtype; request_hash text; response jsonb;
begin
  if p_tile_id is null or p_expected_tile_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PREPARE_SOIL_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into strict settings from public.cozy_farming_settings where singleton_key;
  if not settings.planting_enabled then return jsonb_build_object('status','farming_system_disabled'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'home_farm_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_tile_id::text||':'||p_expected_tile_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':home_soil_prepare:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='home_soil_prepare' and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into home from public.player_homes where player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','plot_not_found'); end if;
  if not home.inside_home or home.lifecycle_status<>'active' then return jsonb_build_object('status','plot_world_mismatch'); end if;
  select * into tile from public.player_home_farming_tiles
  where id=p_tile_id and player_home_id=home.id for update;
  if not found then return jsonb_build_object('status','farming_tile_not_found'); end if;
  if tile.state_version<>p_expected_tile_state_version then return jsonb_build_object('status','farming_tile_conflict'); end if;
  if tile.state<>'empty' then return jsonb_build_object('status','farming_tile_not_eligible'); end if;
  select id into strict hoe_id from public.cozy_item_definitions where slug='starter-hoe' and active;
  if private.cozy_owned_quantity(profile.id,hoe_id)<1 then return jsonb_build_object('status','tool_not_owned'); end if;
  if not private.cozy_home_tile_in_range(home,tile,settings.interaction_distance)
    then return jsonb_build_object('status','tool_action_too_far'); end if;
  if not private.cozy_claim_farming_cooldown(profile.id,'prepare',settings.prepare_cooldown_ms)
    then return jsonb_build_object('status','tool_action_cooldown'); end if;
  update public.player_home_farming_tiles set
    state='prepared',prepared_at=now(),state_version=state_version+1
  where id=tile.id returning * into tile;
  update public.player_homes set farming_state_version=farming_state_version+1,
    last_farming_action_at=now() where id=home.id;
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'soil_prepared',tile.id,jsonb_build_object('tileKey',tile.tile_key));
  perform private.cozy_advance_starter_quest(
    profile.id,'soil_prepared',tile.id,'phase11-prepare:'||tile.id::text,p_request_id
  );
  response:=jsonb_build_object(
    'status','updated','view',private.cozy_playable_vertical_slice_json(profile.id),
    'replayed',false,'announcement','Soil prepared.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'home_soil_prepare',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.plant_player_home_crop(
  p_wallet_address text,p_tile_id uuid,p_seed_item_slug text,
  p_expected_tile_state_version integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; home public.player_homes%rowtype; tile public.player_home_farming_tiles%rowtype;
  settings public.cozy_farming_settings%rowtype; config public.cozy_gameplay_config%rowtype;
  crop public.cozy_crop_definitions%rowtype; seed public.cozy_item_definitions%rowtype;
  produce public.cozy_item_definitions%rowtype; planted public.player_home_crop_instances%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; request_hash text; response jsonb; duration integer;
begin
  if p_tile_id is null or p_seed_item_slug is null
     or p_seed_item_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_expected_tile_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_CROP_PLANT_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into strict settings from public.cozy_farming_settings where singleton_key;
  if not settings.planting_enabled then return jsonb_build_object('status','farming_system_disabled'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'home_farm_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_tile_id::text||':'||p_seed_item_slug||':'||p_expected_tile_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':home_crop_plant:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='home_crop_plant' and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into home from public.player_homes where player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','plot_not_found'); end if;
  if not home.inside_home or home.lifecycle_status<>'active' then return jsonb_build_object('status','plot_world_mismatch'); end if;
  select * into tile from public.player_home_farming_tiles
  where id=p_tile_id and player_home_id=home.id for update;
  if not found then return jsonb_build_object('status','farming_tile_not_found'); end if;
  if tile.state_version<>p_expected_tile_state_version then return jsonb_build_object('status','farming_tile_conflict'); end if;
  if tile.state<>'prepared' then return jsonb_build_object('status','farming_tile_not_eligible'); end if;
  select * into seed from public.cozy_item_definitions where slug=p_seed_item_slug;
  if not found or not seed.active or seed.category<>'seed' then return jsonb_build_object('status','seed_not_enabled'); end if;
  select * into crop from public.cozy_crop_definitions
  where seed_item_definition_id=seed.id and active;
  if not found then return jsonb_build_object('status','seed_not_enabled'); end if;
  select * into strict produce from public.cozy_item_definitions where id=crop.harvest_item_definition_id and active;
  if private.cozy_owned_quantity(profile.id,seed.id)<1 then return jsonb_build_object('status','seed_not_owned'); end if;
  if not private.cozy_home_tile_in_range(home,tile,settings.interaction_distance)
    then return jsonb_build_object('status','tool_action_too_far'); end if;
  if not private.cozy_claim_farming_cooldown(profile.id,'plant',settings.plant_cooldown_ms)
    then return jsonb_build_object('status','tool_action_cooldown'); end if;
  if not private.cozy_remove_item(profile.id,seed.id,1,'planting',tile.id::text,
    p_idempotency_key,p_request_id) then return jsonb_build_object('status','seed_not_owned'); end if;
  duration:=case when settings.use_local_growth_duration
    then crop.local_growth_duration_seconds else crop.growth_duration_seconds end;
  insert into public.player_home_crop_instances(
    player_profile_id,player_home_id,farming_tile_id,crop_definition_id,
    seed_item_definition_id,produce_item_definition_id,crop_slug,crop_name,
    configuration_revision,growth_duration_seconds,growth_stage_count,
    deterministic_yield,watering_policy
  ) values(
    profile.id,home.id,tile.id,crop.id,seed.id,produce.id,crop.slug,crop.name,
    crop.configuration_revision,duration,crop.growth_stage_count,
    crop.deterministic_yield,crop.watering_policy
  ) returning * into planted;
  update public.player_home_farming_tiles set
    state='planted',crop_instance_id=planted.id,state_version=state_version+1
  where id=tile.id returning * into tile;
  update public.player_homes set farming_state_version=farming_state_version+1,
    last_farming_action_at=now() where id=home.id;
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'crop_planted',planted.id,
    jsonb_build_object('tileId',tile.id,'cropSlug',crop.slug));
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'inventory_changed',seed.id,
    jsonb_build_object('reason','planting','delta',-1));
  perform private.cozy_advance_starter_quest(
    profile.id,'crop_planted',planted.id,'phase11-plant:'||planted.id::text,p_request_id
  );
  response:=jsonb_build_object(
    'status','updated','view',private.cozy_playable_vertical_slice_json(profile.id),
    'replayed',false,'announcement',crop.name||' planted. Water it to begin growth.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'home_crop_plant',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.water_player_home_crop(
  p_wallet_address text,p_tile_id uuid,p_crop_instance_id uuid,
  p_expected_tile_state_version integer,p_expected_crop_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; home public.player_homes%rowtype; tile public.player_home_farming_tiles%rowtype;
  crop public.player_home_crop_instances%rowtype; settings public.cozy_farming_settings%rowtype;
  config public.cozy_gameplay_config%rowtype; watering_can_id uuid;
  receipt public.cozy_gameplay_idempotency%rowtype; request_hash text; response jsonb;
begin
  if p_tile_id is null or p_crop_instance_id is null
     or p_expected_tile_state_version<1 or p_expected_crop_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_CROP_WATER_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into strict settings from public.cozy_farming_settings where singleton_key;
  if not settings.planting_enabled then return jsonb_build_object('status','farming_system_disabled'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'home_farm_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_tile_id::text||':'||p_crop_instance_id::text||':'||p_expected_tile_state_version::text
      ||':'||p_expected_crop_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':home_crop_water:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='home_crop_water' and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into home from public.player_homes where player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','plot_not_found'); end if;
  if not home.inside_home or home.lifecycle_status<>'active' then return jsonb_build_object('status','plot_world_mismatch'); end if;
  select * into tile from public.player_home_farming_tiles
  where id=p_tile_id and player_home_id=home.id for update;
  if not found then return jsonb_build_object('status','farming_tile_not_found'); end if;
  if tile.state_version<>p_expected_tile_state_version then return jsonb_build_object('status','farming_tile_conflict'); end if;
  if tile.crop_instance_id is distinct from p_crop_instance_id then return jsonb_build_object('status','crop_not_found'); end if;
  select * into crop from public.player_home_crop_instances
  where id=p_crop_instance_id and player_profile_id=profile.id and farming_tile_id=tile.id for update;
  if not found then return jsonb_build_object('status','crop_not_found'); end if;
  if crop.state_version<>p_expected_crop_state_version then return jsonb_build_object('status','crop_state_conflict'); end if;
  if crop.status<>'planted' or crop.watered_at is not null then return jsonb_build_object('status','crop_not_waterable'); end if;
  select id into strict watering_can_id from public.cozy_item_definitions
  where slug='starter-watering-can' and active;
  if private.cozy_owned_quantity(profile.id,watering_can_id)<1 then return jsonb_build_object('status','tool_not_owned'); end if;
  if not private.cozy_home_tile_in_range(home,tile,settings.interaction_distance)
    then return jsonb_build_object('status','tool_action_too_far'); end if;
  if not private.cozy_claim_farming_cooldown(profile.id,'water',settings.water_cooldown_ms)
    then return jsonb_build_object('status','tool_action_cooldown'); end if;
  update public.player_home_crop_instances set
    status='growing',watered_at=now(),growth_started_at=now(),
    matures_at=now()+make_interval(secs=>growth_duration_seconds),
    state_version=state_version+1
  where id=crop.id returning * into crop;
  update public.player_home_farming_tiles set state='growing',state_version=state_version+1
  where id=tile.id returning * into tile;
  update public.player_homes set farming_state_version=farming_state_version+1,
    last_farming_action_at=now() where id=home.id;
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'crop_watered',crop.id,
    jsonb_build_object('tileId',tile.id,'maturesAt',crop.matures_at));
  perform private.cozy_advance_starter_quest(
    profile.id,'crop_watered',crop.id,'phase11-water:'||crop.id::text,p_request_id
  );
  response:=jsonb_build_object(
    'status','updated','view',private.cozy_playable_vertical_slice_json(profile.id),
    'replayed',false,'announcement','Crop watered. Growth now continues using server time.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'home_crop_water',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.harvest_player_home_crop(
  p_wallet_address text,p_tile_id uuid,p_crop_instance_id uuid,
  p_expected_tile_state_version integer,p_expected_crop_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; home public.player_homes%rowtype; tile public.player_home_farming_tiles%rowtype;
  crop public.player_home_crop_instances%rowtype; settings public.cozy_farming_settings%rowtype;
  config public.cozy_gameplay_config%rowtype; receipt public.cozy_gameplay_idempotency%rowtype;
  request_hash text; response jsonb;
begin
  if p_tile_id is null or p_crop_instance_id is null
     or p_expected_tile_state_version<1 or p_expected_crop_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_CROP_HARVEST_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into strict settings from public.cozy_farming_settings where singleton_key;
  if not settings.harvesting_enabled then return jsonb_build_object('status','farming_system_disabled'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'home_farm_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_tile_id::text||':'||p_crop_instance_id::text||':'||p_expected_tile_state_version::text
      ||':'||p_expected_crop_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':home_crop_harvest:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='home_crop_harvest' and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into home from public.player_homes where player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','plot_not_found'); end if;
  if not home.inside_home or home.lifecycle_status<>'active' then return jsonb_build_object('status','plot_world_mismatch'); end if;
  select * into tile from public.player_home_farming_tiles
  where id=p_tile_id and player_home_id=home.id for update;
  if not found then return jsonb_build_object('status','farming_tile_not_found'); end if;
  if tile.state_version<>p_expected_tile_state_version then return jsonb_build_object('status','farming_tile_conflict'); end if;
  if tile.crop_instance_id is distinct from p_crop_instance_id then return jsonb_build_object('status','crop_not_found'); end if;
  select * into crop from public.player_home_crop_instances
  where id=p_crop_instance_id and player_profile_id=profile.id and farming_tile_id=tile.id for update;
  if not found then return jsonb_build_object('status','crop_not_found'); end if;
  if crop.state_version<>p_expected_crop_state_version then return jsonb_build_object('status','crop_state_conflict'); end if;
  if crop.status='harvested' then return jsonb_build_object('status','crop_already_harvested'); end if;
  if crop.status<>'growing' or crop.matures_at>now() then return jsonb_build_object('status','crop_not_mature'); end if;
  if not private.cozy_home_tile_in_range(home,tile,settings.interaction_distance)
    then return jsonb_build_object('status','tool_action_too_far'); end if;
  if not private.cozy_can_add_item(profile.id,crop.produce_item_definition_id,crop.deterministic_yield)
    then return jsonb_build_object('status','inventory_full'); end if;
  if not private.cozy_claim_farming_cooldown(profile.id,'harvest',settings.harvest_cooldown_ms)
    then return jsonb_build_object('status','tool_action_cooldown'); end if;
  if not private.cozy_add_item(
    profile.id,crop.produce_item_definition_id,crop.deterministic_yield,
    'harvest',crop.id::text,p_idempotency_key,p_request_id
  ) then return jsonb_build_object('status','inventory_full'); end if;
  update public.player_home_crop_instances set status='harvested',harvested_at=now(),
    state_version=state_version+1 where id=crop.id returning * into crop;
  update public.player_home_farming_tiles set state='prepared',crop_instance_id=null,
    state_version=state_version+1 where id=tile.id returning * into tile;
  update public.player_homes set farming_state_version=farming_state_version+1,
    last_farming_action_at=now() where id=home.id;
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'crop_harvested',crop.id,
    jsonb_build_object('tileId',tile.id,'yield',crop.deterministic_yield));
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'inventory_changed',crop.produce_item_definition_id,
    jsonb_build_object('reason','harvest','delta',crop.deterministic_yield));
  perform private.cozy_advance_starter_quest(
    profile.id,'crop_harvested',crop.id,'phase11-harvest:'||crop.id::text,p_request_id
  );
  response:=jsonb_build_object(
    'status','updated','view',private.cozy_playable_vertical_slice_json(profile.id),
    'replayed',false,'announcement',crop.deterministic_yield::text||' '||crop.crop_name||' added to inventory.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'home_crop_harvest',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.deliver_player_starter_farming_quest(
  p_wallet_address text,p_expected_quest_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; instance public.player_quest_instances%rowtype;
  version public.cozy_quest_versions%rowtype; settings public.cozy_farming_settings%rowtype;
  config public.cozy_gameplay_config%rowtype; npc public.cozy_starter_npcs%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; ledger public.player_dust_ledger%rowtype;
  request_hash text; response jsonb; incomplete_count integer;
begin
  if p_expected_quest_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_STARTER_QUEST_DELIVERY_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into strict settings from public.cozy_farming_settings where singleton_key;
  if not settings.starter_quest_enabled then return jsonb_build_object('status','quest_not_available'); end if;
  if not settings.tutorial_rewards_enabled then return jsonb_build_object('status','economy_settlement_failed'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'starter_quest_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict npc from public.cozy_starter_npcs where slug='willow-guide' and active;
  if profile.current_map_id<>(select slug from public.world_maps where id=npc.world_map_id)
     or sqrt(power(profile.safe_position_x-npc.position_x,2)+power(profile.safe_position_y-npc.position_y,2))>npc.interaction_range
    then return jsonb_build_object('status','tool_action_too_far'); end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_expected_quest_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':starter_quest_delivery:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='starter_quest_delivery' and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into instance from public.player_quest_instances
  where player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','quest_not_available'); end if;
  if instance.status='reward_claimed' then return jsonb_build_object('status','quest_reward_already_settled'); end if;
  if instance.state_version<>p_expected_quest_state_version then return jsonb_build_object('status','state_conflict'); end if;
  select * into strict version from public.cozy_quest_versions where id=instance.quest_version_id;
  select count(*) into incomplete_count
  from public.cozy_quest_objectives objective
  join public.player_quest_objective_progress progress
    on progress.quest_objective_id=objective.id and progress.player_quest_instance_id=instance.id
  where objective.objective_key not in ('deliver_produce','receive_reward')
    and progress.current_count<objective.required_count;
  if incomplete_count>0 then return jsonb_build_object('status','quest_objective_incomplete'); end if;
  if private.cozy_owned_quantity(profile.id,version.delivery_item_definition_id)<version.delivery_quantity
    then return jsonb_build_object('status','tutorial_delivery_insufficient'); end if;
  if not private.cozy_claim_farming_cooldown(profile.id,'delivery',settings.delivery_cooldown_ms)
    then return jsonb_build_object('status','tool_action_cooldown'); end if;
  begin
    if not private.cozy_remove_item(
      profile.id,version.delivery_item_definition_id,version.delivery_quantity,
      'tutorial_delivery',instance.id::text,p_idempotency_key,p_request_id
    ) then raise exception using errcode='P0001',message='TUTORIAL_DELIVERY_FAILED'; end if;
    perform private.cozy_advance_starter_quest(
      profile.id,'tutorial_produce_delivered',instance.id,
      'phase11-delivery:'||instance.id::text,p_request_id
    );
    if not private.cozy_apply_dust_delta(
      profile.id,version.reward_dust,'starter_farming_quest_reward','starter_farming_quest',
      instance.id::text,p_idempotency_key,p_request_id
    ) then raise exception using errcode='P0001',message='TUTORIAL_DUST_SETTLEMENT_FAILED'; end if;
    select * into strict ledger from public.player_dust_ledger
    where player_profile_id=profile.id and reason='starter_farming_quest_reward'
      and reference_id=instance.id::text;
    perform private.cozy_advance_starter_quest(
      profile.id,'tutorial_reward_settled',ledger.id,
      'phase11-reward:'||instance.id::text,p_request_id
    );
    update public.player_quest_instances set
      status='reward_claimed',completed_at=now(),reward_settled_at=now(),
      reward_ledger_entry_id=ledger.id,state_version=state_version+1,last_error_code=null
    where id=instance.id returning * into instance;
  exception when raise_exception then
    update public.player_quest_instances set last_error_code='ECONOMY_SETTLEMENT_FAILED'
    where id=instance.id;
    insert into public.cozy_farming_reconciliation_queue(
      player_profile_id,player_home_id,reconciliation_type,last_error_code
    ) select profile.id,home.id,'quest_reward_settlement','ECONOMY_SETTLEMENT_FAILED'
      from public.player_homes home where home.player_profile_id=profile.id;
    return jsonb_build_object('status','economy_settlement_failed');
  end;
  response:=jsonb_build_object(
    'status','updated','view',private.cozy_playable_vertical_slice_json(profile.id),
    'replayed',false,'announcement',version.reward_dust::text||' DUST received. Tutorial complete.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'starter_quest_delivery',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create table public.cozy_farming_admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  administrator_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  action_key text not null check (action_key = 'farming.liveops_updated'),
  before_state jsonb not null check (jsonb_typeof(before_state)='object'),
  after_state jsonb not null check (jsonb_typeof(after_state)='object'),
  reason text not null check (
    char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  unique (administrator_user_id, request_id)
);

create trigger cozy_farming_admin_audit_events_append_only
before update or delete on public.cozy_farming_admin_audit_events
for each row execute function private.reject_cozy_append_only_mutation();

create or replace function public.get_admin_farming_content(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'farming.read');
  return jsonb_build_object(
    'status','loaded','settings',private.cozy_farming_live_ops_json(),
    'items',coalesce((select jsonb_agg(private.cozy_item_json(item) order by item.category,item.name)
      from public.cozy_item_definitions item
      where item.category in ('permanent_tool','seed','crop')),'[]'::jsonb),
    'crops',coalesce((select jsonb_agg(jsonb_build_object(
      'definition',private.cozy_crop_json(crop),
      'wateringPolicy',crop.watering_policy,'tutorialEligible',crop.tutorial_eligible,
      'localGrowthDurationSeconds',crop.local_growth_duration_seconds,
      'productionGrowthDurationSeconds',crop.growth_duration_seconds,
      'configurationRevision',crop.configuration_revision,
      'activeInstanceCount',(select count(*) from public.player_home_crop_instances instance
        where instance.crop_definition_id=crop.id and instance.status<>'harvested')
    ) order by crop.name) from public.cozy_crop_definitions crop),'[]'::jsonb),
    'plotTemplate',(
      select jsonb_build_object(
        'template',private.cozy_home_template_json(template),
        'tiles',coalesce((select jsonb_agg(jsonb_build_object(
          'id',tile.id,'tileKey',tile.tile_key,'slot',tile.slot,'x',tile.grid_x,'y',tile.grid_y
        ) order by tile.slot) from public.cozy_home_farm_tile_templates tile
          where tile.home_template_id=template.id and tile.template_version=template.template_version),'[]'::jsonb),
        'activePlotCount',(select count(*) from public.player_homes home
          where home.template_id=template.id and home.lifecycle_status='active')
      ) from public.cozy_home_templates template where template.slug='starter-cottage-interior'
    ),
    'quest',(
      select jsonb_build_object(
        'definitionId',definition.id,'versionId',version.id,'slug',definition.slug,
        'name',version.name,'description',version.description,
        'versionNumber',version.version_number,'starterSeedQuantity',version.starter_seed_quantity,
        'deliveryQuantity',version.delivery_quantity,'rewardDust',version.reward_dust,
        'active',version.active,
        'objectives',(select jsonb_agg(jsonb_build_object(
          'key',objective.objective_key,'label',objective.label,'required',objective.required_count
        ) order by objective.sequence_number) from public.cozy_quest_objectives objective
          where objective.quest_version_id=version.id),
        'acceptedCount',(select count(*) from public.player_quest_instances instance
          where instance.quest_version_id=version.id),
        'completionCount',(select count(*) from public.player_quest_instances instance
          where instance.quest_version_id=version.id and instance.status='reward_claimed'),
        'settlementFailureCount',(select count(*) from public.player_quest_instances instance
          where instance.quest_version_id=version.id and instance.last_error_code is not null)
      ) from public.cozy_quest_versions version
        join public.cozy_quest_definitions definition on definition.id=version.quest_definition_id
      where version.lifecycle_status='published' and version.active
    ),
    'audit',coalesce((select jsonb_agg(jsonb_build_object(
      'id',event.id,'actionKey',event.action_key,'reason',event.reason,
      'requestId',event.request_id,'createdAt',event.created_at
    ) order by event.created_at desc) from (
      select * from public.cozy_farming_admin_audit_events order by created_at desc limit 50
    ) event),'[]'::jsonb)
  );
end;
$$;

create or replace function public.get_admin_player_farming(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_player_profile_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'players.read');
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'farming.player_read');
  if not exists(select 1 from public.player_profiles where id=p_player_profile_id)
    then return jsonb_build_object('status','not_found'); end if;
  if not exists(select 1 from public.player_homes where player_profile_id=p_player_profile_id)
    then return jsonb_build_object('status','loaded','initialized',false,'view',null); end if;
  return jsonb_build_object(
    'status','loaded','initialized',true,
    'view',private.cozy_playable_vertical_slice_json(p_player_profile_id),
    'lastFarmingAction',(select max(event.created_at) from public.cozy_private_plot_events event
      where event.player_profile_id=p_player_profile_id),
    'pendingReconciliationCount',(select count(*) from public.cozy_farming_reconciliation_queue queue
      where queue.player_profile_id=p_player_profile_id and queue.status in ('pending','failed'))
  );
end;
$$;

create or replace function public.update_admin_farming_live_ops(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_expected_revision integer,p_planting_enabled boolean,p_harvesting_enabled boolean,
  p_plot_provisioning_enabled boolean,p_starter_quest_enabled boolean,
  p_tutorial_rewards_enabled boolean,p_maintenance_message text,
  p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare settings public.cozy_farming_settings%rowtype; before_state jsonb; after_state jsonb;
  prior public.cozy_farming_admin_audit_events%rowtype;
begin
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'farming.liveops');
  if p_expected_revision<1 or p_planting_enabled is null or p_harvesting_enabled is null
     or p_plot_provisioning_enabled is null or p_starter_quest_enabled is null
     or p_tutorial_rewards_enabled is null
     or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
     or (p_maintenance_message is not null and (
       char_length(p_maintenance_message) not between 1 and 280
       or p_maintenance_message<>btrim(p_maintenance_message)
       or p_maintenance_message ~ '[[:cntrl:]<>]'
     )) then raise exception using errcode='22023',message='INVALID_FARMING_LIVE_OPS_REQUEST'; end if;
  select * into prior from public.cozy_farming_admin_audit_events
  where administrator_user_id=p_user_id and request_id=p_request_id;
  if found then return jsonb_build_object('status','replayed','settings',prior.after_state,'replayed',true); end if;
  select * into strict settings from public.cozy_farming_settings where singleton_key for update;
  if settings.configuration_revision<>p_expected_revision then
    return jsonb_build_object('status','state_conflict'); end if;
  before_state:=private.cozy_farming_live_ops_json();
  update public.cozy_farming_settings set
    planting_enabled=p_planting_enabled,harvesting_enabled=p_harvesting_enabled,
    plot_provisioning_enabled=p_plot_provisioning_enabled,
    starter_quest_enabled=p_starter_quest_enabled,
    tutorial_rewards_enabled=p_tutorial_rewards_enabled,
    maintenance_message=p_maintenance_message,
    configuration_revision=configuration_revision+1
  where singleton_key returning * into settings;
  after_state:=private.cozy_farming_live_ops_json();
  insert into public.cozy_farming_admin_audit_events(
    administrator_user_id,admin_session_id,action_key,before_state,after_state,
    reason,request_id
  ) values(p_user_id,p_auth_session_id,'farming.liveops_updated',before_state,after_state,
    p_reason,p_request_id);
  return jsonb_build_object('status','updated','settings',after_state,'replayed',false);
end;
$$;

create or replace function public.reconcile_phase11_farming(p_limit integer,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare queue public.cozy_farming_reconciliation_queue%rowtype;
  processed integer:=0; resolved integer:=0; failed integer:=0;
begin
  if p_limit not between 1 and 100 or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_FARMING_RECONCILIATION_REQUEST';
  end if;
  for queue in select * from public.cozy_farming_reconciliation_queue
    where status in ('pending','failed') and available_at<=now()
    order by available_at,id limit p_limit for update skip locked
  loop
    processed:=processed+1;
    update public.cozy_farming_reconciliation_queue set status='processing',
      attempt_count=attempt_count+1 where id=queue.id;
    if queue.reconciliation_type='stuck_provisioning'
       and queue.player_profile_id is not null
       and private.ensure_player_home_plot(queue.player_profile_id,p_request_id||':'||queue.id::text) then
      update public.cozy_farming_reconciliation_queue set status='resolved',last_error_code=null
      where id=queue.id;
      resolved:=resolved+1;
    elsif queue.reconciliation_type='quest_reward_settlement'
       and exists(select 1 from public.player_quest_instances instance
         where instance.player_profile_id=queue.player_profile_id and instance.status='reward_claimed') then
      update public.cozy_farming_reconciliation_queue set status='resolved',last_error_code=null
      where id=queue.id;
      resolved:=resolved+1;
    else
      update public.cozy_farming_reconciliation_queue set status='failed',
        last_error_code=coalesce(last_error_code,'MANUAL_REVIEW_REQUIRED'),
        available_at=now()+interval '15 minutes' where id=queue.id;
      failed:=failed+1;
    end if;
  end loop;
  return jsonb_build_object(
    'status','completed','processed',processed,'resolved',resolved,'failed',failed,
    'perCropTimersScheduled',false
  );
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'cozy_farming_settings','cozy_home_farm_tile_templates','player_home_farming_tiles',
    'player_home_crop_instances','cozy_starter_npcs','cozy_quest_definitions',
    'cozy_quest_versions','cozy_quest_objectives','player_quest_instances',
    'player_quest_objective_progress','player_quest_events','cozy_plot_provisioning_events',
    'cozy_farming_action_cooldowns','cozy_private_plot_events',
    'cozy_farming_reconciliation_queue','cozy_farming_admin_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',table_name);
  end loop;
end;
$$;

revoke all on function private.valid_cozy_item_metadata(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.cozy_farming_live_ops_json() from public,anon,authenticated,service_role;
revoke all on function private.cozy_starter_npc_json() from public,anon,authenticated,service_role;
revoke all on function private.cozy_home_crop_json(public.player_home_crop_instances) from public,anon,authenticated,service_role;
revoke all on function private.cozy_home_farm_tile_json(public.player_home_farming_tiles) from public,anon,authenticated,service_role;
revoke all on function private.cozy_home_plot_json(public.player_homes) from public,anon,authenticated,service_role;
revoke all on function private.cozy_starter_quest_json(uuid) from public,anon,authenticated,service_role;
revoke all on function private.cozy_playable_vertical_slice_json(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ensure_player_home_plot(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.cozy_advance_starter_quest(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function private.cozy_claim_farming_cooldown(uuid,text,integer) from public,anon,authenticated,service_role;
revoke all on function private.cozy_home_tile_in_range(public.player_homes,public.player_home_farming_tiles,numeric) from public,anon,authenticated,service_role;
revoke all on function private.cozy_apply_dust_delta(uuid,bigint,text,text,text,text,text) from public,anon,authenticated,service_role;

revoke all on function public.get_player_playable_vertical_slice(text,text) from public,anon,authenticated,service_role;
revoke all on function public.accept_player_starter_farming_quest(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.prepare_player_home_soil(text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.plant_player_home_crop(text,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.water_player_home_crop(text,uuid,uuid,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.harvest_player_home_crop(text,uuid,uuid,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.deliver_player_starter_farming_quest(text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_farming_content(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_player_farming(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.update_admin_farming_live_ops(uuid,uuid,text,integer,boolean,boolean,boolean,boolean,boolean,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.reconcile_phase11_farming(integer,text) from public,anon,authenticated,service_role;

grant execute on function public.get_player_playable_vertical_slice(text,text) to service_role;
grant execute on function public.accept_player_starter_farming_quest(text,text,text) to service_role;
grant execute on function public.prepare_player_home_soil(text,uuid,integer,text,text) to service_role;
grant execute on function public.plant_player_home_crop(text,uuid,text,integer,text,text) to service_role;
grant execute on function public.water_player_home_crop(text,uuid,uuid,integer,integer,text,text) to service_role;
grant execute on function public.harvest_player_home_crop(text,uuid,uuid,integer,integer,text,text) to service_role;
grant execute on function public.deliver_player_starter_farming_quest(text,integer,text,text) to service_role;
grant execute on function public.get_admin_farming_content(uuid,uuid,text) to service_role;
grant execute on function public.get_admin_player_farming(uuid,uuid,text,uuid) to service_role;
grant execute on function public.update_admin_farming_live_ops(uuid,uuid,text,integer,boolean,boolean,boolean,boolean,boolean,text,text,text) to service_role;
grant execute on function public.reconcile_phase11_farming(integer,text) to service_role;
