-- Starville Phase 11E: canonical personal-housing schema, immutable layout
-- history, storage, upgrade policy, progression content, and fail-closed RLS.
--
-- This forward-only migration extends player_homes, player_home_furniture,
-- canonical inventory/DUST, Phase 11D progression, and private-home realtime.
-- It does not create a second ownership, inventory, currency, or quest system.

insert into public.admin_permissions
  (key,name,description,category,is_sensitive,is_system)
values
  ('housing.furniture.inspect','Inspect housing furniture','Inspect canonical furniture, item, World Asset, placement, and reference policy.','gameplay',false,true),
  ('housing.furniture.manage','Manage housing furniture','Create and validate bounded successor furniture configurations.','gameplay',true,true),
  ('housing.templates.inspect','Inspect home templates','Inspect home template versions, zones, spawns, capacity, farming, and workstation compatibility.','gameplay',false,true),
  ('housing.templates.manage','Manage home templates','Create and validate bounded home-template successors without rewriting player homes.','gameplay',true,true),
  ('housing.upgrades.inspect','Inspect housing upgrades','Inspect immutable home-upgrade versions, eligibility, ownership, and DUST settlement.','gameplay',false,true),
  ('housing.upgrades.manage','Manage housing upgrades','Create and activate reviewed upgrade-path successors.','gameplay',true,true),
  ('housing.storage.inspect','Inspect home storage','Inspect bounded private storage capacity and reconciliation evidence.','players',true,true),
  ('housing.storage.manage','Manage storage policy','Manage versioned storage policy without moving player items directly.','gameplay',true,true),
  ('housing.player_homes.inspect','Inspect player homes','Inspect bounded player home, active layout, capacity, tutorial, and settlement state.','players',true,true),
  ('housing.layout_revisions.inspect','Inspect layout revisions','Inspect immutable home-layout revisions and settlement evidence.','players',true,true),
  ('housing.corrections.manage','Manage housing corrections','Request and apply AAL2 housing corrections with impact evidence.','gameplay',true,true),
  ('housing.reconciliation.manage','Manage housing reconciliation','Request and process bounded housing reconciliation.','gameplay',true,true),
  ('housing.live_ops.manage','Manage housing live ops','Pause housing mutations independently while preserving reads and item safety.','live_operations',true,true),
  ('housing.telemetry.inspect','Inspect housing telemetry','Inspect aggregate bounded housing telemetry without broad private layouts.','analytics',false,true)
on conflict (key) do update set
  name=excluded.name,description=excluded.description,category=excluded.category,
  is_sensitive=excluded.is_sensitive,is_system=true;

with mapping(role_key,permission_key) as (
  values
    ('game_administrator','housing.furniture.inspect'),('game_administrator','housing.furniture.manage'),
    ('game_administrator','housing.templates.inspect'),('game_administrator','housing.templates.manage'),
    ('game_administrator','housing.upgrades.inspect'),('game_administrator','housing.upgrades.manage'),
    ('game_administrator','housing.storage.inspect'),('game_administrator','housing.storage.manage'),
    ('game_administrator','housing.player_homes.inspect'),('game_administrator','housing.layout_revisions.inspect'),
    ('game_administrator','housing.corrections.manage'),('game_administrator','housing.reconciliation.manage'),
    ('game_administrator','housing.live_ops.manage'),('game_administrator','housing.telemetry.inspect'),
    ('content_manager','housing.furniture.inspect'),('content_manager','housing.furniture.manage'),
    ('content_manager','housing.templates.inspect'),('content_manager','housing.templates.manage'),
    ('content_manager','housing.upgrades.inspect'),('content_manager','housing.upgrades.manage'),
    ('content_manager','housing.storage.inspect'),('content_manager','housing.storage.manage'),
    ('live_operations_manager','housing.furniture.inspect'),('live_operations_manager','housing.templates.inspect'),
    ('live_operations_manager','housing.upgrades.inspect'),('live_operations_manager','housing.live_ops.manage'),
    ('live_operations_manager','housing.telemetry.inspect'),
    ('customer_support','housing.player_homes.inspect'),('customer_support','housing.layout_revisions.inspect'),
    ('customer_support','housing.storage.inspect'),
    ('read_only_analyst','housing.telemetry.inspect')
)
insert into public.admin_role_permissions(role_id,permission_id)
select role.id,permission.id from mapping
join public.admin_roles role on role.key=mapping.role_key
join public.admin_permissions permission on permission.key=mapping.permission_key
on conflict do nothing;

insert into public.admin_role_permissions(role_id,permission_id)
select role.id,permission.id from public.admin_roles role
cross join public.admin_permissions permission
where role.key='super_admin' and permission.key like 'housing.%'
on conflict do nothing;

alter table public.cozy_gameplay_idempotency
  drop constraint cozy_gameplay_idempotency_operation_check;
alter table public.cozy_gameplay_idempotency
  add constraint cozy_gameplay_idempotency_operation_check check (operation in (
    'bootstrap','quickbar_update','farm_plant','farm_water','farm_harvest',
    'recipe_cook','recipe_craft','shop_buy','shop_sell',
    'home_enter','home_exit','furniture_place','furniture_move','furniture_rotate','furniture_remove',
    'starter_quest_accept','starter_quest_delivery','home_soil_prepare','home_crop_plant',
    'home_crop_water','home_crop_harvest','workstation_job_start','workstation_job_collect',
    'workstation_tutorial_accept','workstation_tutorial_turn_in','shop_transaction',
    'shop_tutorial_accept','shop_tutorial_turn_in','decoration_session_open','home_layout_save',
    'home_storage_deposit','home_storage_withdrawal','home_upgrade_purchase',
    'home_tutorial_grant','housing_correction','housing_reconciliation'
  ));

alter table public.cozy_gameplay_rate_limits
  drop constraint cozy_gameplay_rate_limits_scope_check;
alter table public.cozy_gameplay_rate_limits
  add constraint cozy_gameplay_rate_limits_scope_check check (scope in (
    'bootstrap','dust_read','inventory_read','history_read','quickbar_write',
    'farm_read','farm_write','recipe_read','recipe_write','shop_read','shop_write',
    'home_read','home_write','vertical_slice_read','plot_provision','home_farm_write',
    'starter_quest_write','workstation_read','workstation_write','workstation_collect',
    'workstation_tutorial_write','shop_workspace_read','shop_transaction_write',
    'shop_receipt_read','shop_tutorial_write','shop_event_read','progression_read',
    'progression_write','quest_read','achievement_read','title_write','progression_event_read',
    'housing_read','decoration_session_write','layout_validate','layout_save','layout_history_read',
    'storage_read','storage_write','home_upgrade_read','home_upgrade_write','housing_event_read'
  ));

alter table public.player_inventory_history
  drop constraint player_inventory_history_reason_check;
alter table public.player_inventory_history
  add constraint player_inventory_history_reason_check check (reason in (
    'starter_grant','shop_purchase','shop_sale','planting','harvest','cooking','crafting',
    'furniture_placement','furniture_removal','social_gift','social_trade','system_refund',
    'cooperative_activity_reward','tutorial_delivery','cooking_ingredient_consumed',
    'crafting_ingredient_consumed','cooking_output_collected','crafting_output_collected',
    'crafting_refund','crafting_compensation','tutorial_output_delivered',
    'progression_quest_reward','progression_achievement_reward','home_storage_deposit',
    'home_storage_withdrawal','home_tutorial_furniture_grant'
  ));

alter table public.player_dust_ledger drop constraint player_dust_ledger_reason_check;
alter table public.player_dust_ledger add constraint player_dust_ledger_reason_check check (reason in (
  'starter_grant','shop_purchase','shop_sale','crafting_fee','system_refund','migration_adjustment',
  'cooperative_activity_reward','administrative_correction','starter_farming_quest_reward',
  'starter_workstation_quest_reward','starter_shop_quest_reward','progression_quest_reward',
  'progression_achievement_reward','home_upgrade'
));
alter table public.player_dust_ledger drop constraint player_dust_ledger_reference_type_check;
alter table public.player_dust_ledger add constraint player_dust_ledger_reference_type_check check (reference_type in (
  'player_bootstrap','shop_transaction','recipe_action','system_operation','migration',
  'cooperative_activity','starter_farming_quest','crafting_job','starter_workstation_quest',
  'starter_shop_quest','progression_quest','progression_achievement','home_upgrade_transaction'
));

alter table public.economy_sink_versions drop constraint economy_sink_versions_category_check;
alter table public.economy_sink_versions add constraint economy_sink_versions_category_check check (
  category in ('shop_purchase','crafting_cost','administrative_correction','migration_adjustment','home_upgrade')
);

insert into public.economy_sink_versions(
  id,sink_key,version_number,lifecycle_status,operation_key,category,label,description,
  minimum_amount,maximum_amount,reversible_by_refund,beginner_protected,published_at
) values(
  'e1100000-0000-4000-8000-000000000001','home-upgrade',1,'published','home_upgrade','home_upgrade',
  'Home upgrade','Server-selected DUST cost for an atomic permanent personal-home tier upgrade.',
  1,1000000,true,true,now()
);
insert into public.economy_active_sink_versions(sink_key,sink_version_id)
values('home-upgrade','e1100000-0000-4000-8000-000000000001');

alter table public.cozy_furniture_definitions
  add column description text not null default 'Canonical Starville placeable furniture.' check (
    char_length(description) between 8 and 280 and description=btrim(description) and description !~ '[[:cntrl:]<>]'
  ),
  add column category text not null default 'decoration' check (category in (
    'seating','table','storage','decoration','plant','lighting','wall_decoration','outdoor_decoration','utility'
  )),
  add column allowed_zone_types text[] not null default array['outdoor_ground']::text[] check (
    cardinality(allowed_zone_types) between 1 and 9 and allowed_zone_types <@ array[
      'indoor_floor','indoor_wall','outdoor_ground','outdoor_path_edge','outdoor_garden',
      'workstation_zone','storage_zone','entrance_clearance','restricted'
    ]::text[]
  ),
  add column foot_anchor_x numeric(4,3) not null default 0.5 check (foot_anchor_x between 0 and 1),
  add column foot_anchor_y numeric(4,3) not null default 1 check (foot_anchor_y between 0 and 1),
  add column depth_anchor_x numeric(4,3) not null default 0.5 check (depth_anchor_x between 0 and 1),
  add column depth_anchor_y numeric(4,3) not null default 1 check (depth_anchor_y between 0 and 1),
  add column capacity_weight integer not null default 1 check (capacity_weight between 1 and 20),
  add column indoor_eligible boolean not null default false,
  add column outdoor_eligible boolean not null default true,
  add column wall_mounted boolean not null default false,
  add column interaction_type text check (
    interaction_type is null or interaction_type ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'
  ),
  add column storage_slots integer not null default 0 check (storage_slots between 0 and 200),
  add column released boolean not null default true,
  add column safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  ),
  add constraint cozy_furniture_space_policy_check check (indoor_eligible or outdoor_eligible),
  add constraint cozy_furniture_wall_policy_check check (not wall_mounted or indoor_eligible),
  add constraint cozy_furniture_release_policy_check check (released or not active);

update public.cozy_furniture_definitions set
  description=case slug
    when 'willow-chair' then 'A crafted Willow Chair eligible for safe home decoration.'
    when 'hearth-table' then 'A sturdy Hearth Table for bounded home placement.'
    when 'moonwoven-rug' then 'A decorative Moonwoven Rug that does not block movement.'
    when 'lantern-floor-lamp' then 'A development-marker floor lamp with bounded placement.'
    when 'meadow-shelf' then 'A compact Meadow Shelf for future approved home artwork.'
    when 'round-leaf-planter' then 'A Round-leaf Planter eligible for outdoor decoration.'
    else description end,
  category=case slug
    when 'willow-chair' then 'seating'
    when 'hearth-table' then 'table'
    when 'moonwoven-rug' then 'decoration'
    when 'lantern-floor-lamp' then 'lighting'
    when 'meadow-shelf' then 'utility'
    when 'round-leaf-planter' then 'plant'
    else category end,
  allowed_zone_types=case when slug='round-leaf-planter'
    then array['outdoor_ground','outdoor_path_edge']::text[]
    else array['outdoor_ground']::text[] end,
  outdoor_eligible=true,
  safe_metadata=jsonb_build_object('phase11e','canonical_extension','arbitraryScale',false);

create table public.housing_decoration_zones (
  id uuid primary key,
  home_template_id uuid not null references public.cozy_home_templates(id) on delete restrict,
  template_version integer not null check (template_version>0),
  zone_key text not null check (zone_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  zone_type text not null check (zone_type in (
    'indoor_floor','indoor_wall','outdoor_ground','outdoor_path_edge','outdoor_garden',
    'workstation_zone','storage_zone','entrance_clearance','restricted'
  )),
  label text not null check (char_length(label) between 2 and 80 and label=btrim(label) and label !~ '[[:cntrl:]<>]'),
  min_x integer not null check (min_x between -128 and 128),
  min_y integer not null check (min_y between -128 and 128),
  max_x integer not null check (max_x between -128 and 128),
  max_y integer not null check (max_y between -128 and 128),
  allowed_categories text[] not null check (
    cardinality(allowed_categories) between 0 and 9 and allowed_categories <@ array[
      'seating','table','storage','decoration','plant','lighting','wall_decoration','outdoor_decoration','utility'
    ]::text[]
  ),
  placement_capacity integer not null check (placement_capacity between 0 and 200),
  collision_policy text not null check (collision_policy in ('blocking','decorative_overlap','restricted')),
  rotation_policy integer[] not null check (
    cardinality(rotation_policy) between 1 and 4 and rotation_policy <@ array[0,90,180,270]
  ),
  snap_policy text not null check (snap_policy in ('grid','half_grid','fixed_anchor')),
  required_home_tier integer not null default 1 check (required_home_tier between 1 and 20),
  enabled boolean not null default true,
  indoor_foundation_only boolean not null default false,
  configuration_revision integer not null default 1 check (configuration_revision>0),
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(home_template_id,template_version,zone_key),
  check(min_x<max_x and min_y<max_y),
  check((zone_type<>'restricted' and collision_policy<>'restricted') or placement_capacity=0),
  check(not indoor_foundation_only or zone_type in ('indoor_floor','indoor_wall'))
);

insert into public.housing_decoration_zones(
  id,home_template_id,template_version,zone_key,zone_type,label,min_x,min_y,max_x,max_y,
  allowed_categories,placement_capacity,collision_policy,rotation_policy,snap_policy,
  required_home_tier,enabled,indoor_foundation_only,safe_metadata
) values
  ('e1100000-0000-4000-8000-000000000010','76000000-0000-4000-8000-000000000001',1,
   'starter-outdoor-ground','outdoor_ground','Outdoor decoration lawn',1,1,9,7,
   array['seating','table','decoration','plant','lighting','outdoor_decoration','utility'],8,
   'blocking',array[0,90,180,270],'grid',1,true,false,
   '{"renderer":"personal_home_world","farmingAndWorkstationExclusionsRequired":true}'),
  ('e1100000-0000-4000-8000-000000000011','76000000-0000-4000-8000-000000000001',1,
   'cozy-outdoor-edge','outdoor_path_edge','Cozy outdoor edge',1,0,9,1,
   array['seating','decoration','plant','lighting','outdoor_decoration'],4,
   'blocking',array[0,90,180,270],'grid',2,true,false,'{"unpublishedTier2":true}'),
  ('e1100000-0000-4000-8000-000000000012','76000000-0000-4000-8000-000000000001',1,
   'starter-entrance-clearance','entrance_clearance','Home entrance clearance',4,5,7,8,
   array[]::text[],0,'restricted',array[0],'fixed_anchor',1,true,false,
   '{"requiredClearance":true}'),
  ('e1100000-0000-4000-8000-000000000013','76000000-0000-4000-8000-000000000001',1,
   'starter-indoor-floor-foundation','indoor_floor','Indoor floor foundation',1,1,9,7,
   array['seating','table','storage','decoration','plant','lighting','utility'],0,
   'restricted',array[0,90,180,270],'grid',2,false,true,
   '{"rendererAvailable":false,"placementDisabled":true}'),
  ('e1100000-0000-4000-8000-000000000014','76000000-0000-4000-8000-000000000001',1,
   'starter-indoor-wall-foundation','indoor_wall','Indoor wall foundation',1,1,9,2,
   array['wall_decoration','lighting'],0,'restricted',array[0],'fixed_anchor',2,false,true,
   '{"rendererAvailable":false,"wallPlacementDisabled":true}');

alter table public.player_homes
  add column home_tier integer not null default 1 check (home_tier between 1 and 20),
  add column furniture_capacity integer not null default 8 check (furniture_capacity between 1 and 200),
  add column storage_capacity integer not null default 16 check (storage_capacity between 1 and 500),
  add column configuration_revision integer not null default 1 check (configuration_revision>0),
  add column indoor_foundation_enabled boolean not null default false,
  add column housing_initialized_at timestamptz,
  add column safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  );

alter table public.player_home_furniture
  add column owner_player_profile_id uuid references public.player_profiles(id) on delete restrict,
  add column item_definition_id uuid references public.cozy_item_definitions(id) on delete restrict,
  add column zone_id uuid references public.housing_decoration_zones(id) on delete restrict,
  add column logical_layer integer not null default 0 check (logical_layer between 0 and 20),
  add column effective_scale numeric(5,3) not null default 1 check (effective_scale between 0.1 and 4),
  add column placement_state text not null default 'grandfathered' check (placement_state in ('placed','grandfathered')),
  add column source_inventory_history_id uuid unique references public.player_inventory_history(id) on delete restrict,
  add column removed_at timestamptz,
  add column safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  );

update public.player_home_furniture placement set
  owner_player_profile_id=home.player_profile_id,
  item_definition_id=definition.item_definition_id,
  zone_id='e1100000-0000-4000-8000-000000000010',
  safe_metadata='{"phase11eBackfill":true}'::jsonb
from public.player_homes home,public.cozy_furniture_definitions definition
where home.id=placement.player_home_id and definition.id=placement.furniture_definition_id;

alter table public.player_home_furniture
  alter column owner_player_profile_id set not null,
  alter column item_definition_id set not null,
  alter column zone_id set not null;
alter table public.player_home_furniture
  add constraint player_home_furniture_owner_home_unique unique(id,player_home_id,owner_player_profile_id),
  add constraint player_home_furniture_active_state_check check (
    (removed_at is null and placement_state in ('placed','grandfathered')) or removed_at is not null
  );

-- Populate canonical ownership columns for the narrow legacy service RPCs
-- while clients migrate to atomic Decoration Mode layout saves.
create or replace function private.prepare_housing_furniture_compatibility()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  if new.owner_player_profile_id is null then
    select home.player_profile_id into strict new.owner_player_profile_id
    from public.player_homes home where home.id=new.player_home_id;
  end if;
  if new.item_definition_id is null then
    select definition.item_definition_id into strict new.item_definition_id
    from public.cozy_furniture_definitions definition where definition.id=new.furniture_definition_id;
  end if;
  if new.zone_id is null then new.zone_id:='e1100000-0000-4000-8000-000000000010'; end if;
  return new;
end;
$$;
create trigger player_home_furniture_phase11e_compat
before insert or update of player_home_id,furniture_definition_id on public.player_home_furniture
for each row execute function private.prepare_housing_furniture_compatibility();
revoke all on function private.prepare_housing_furniture_compatibility() from public,anon,authenticated,service_role;

create table public.home_layout_revisions (
  id uuid primary key default gen_random_uuid(),
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  owner_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  revision_number integer not null check (revision_number>0),
  parent_revision_id uuid references public.home_layout_revisions(id) on delete restrict,
  restoration_source_revision_id uuid references public.home_layout_revisions(id) on delete restrict,
  home_template_id uuid not null references public.cozy_home_templates(id) on delete restrict,
  template_version integer not null check (template_version>0),
  home_tier integer not null check (home_tier between 1 and 20),
  furniture_count integer not null check (furniture_count between 0 and 200),
  furniture_capacity_used integer not null check (furniture_capacity_used between 0 and 4000),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  change_summary jsonb not null check (jsonb_typeof(change_summary)='array' and pg_column_size(change_summary)<=8192),
  validation_result text not null check (validation_result in ('valid','grandfathered')),
  validation_summary jsonb not null check (jsonb_typeof(validation_summary)='object' and pg_column_size(validation_summary)<=16384),
  created_by_type text not null check (created_by_type in ('player','system_bootstrap','admin_correction')),
  created_by_player_profile_id uuid references public.player_profiles(id) on delete restrict,
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  ),
  created_at timestamptz not null default now(),
  unique(player_home_id,revision_number),
  unique(id,player_home_id),
  check(parent_revision_id is distinct from id and restoration_source_revision_id is distinct from id),
  check((created_by_type='player')=(created_by_player_profile_id is not null)),
  check((created_by_type='admin_correction')=(created_by_admin_id is not null))
);

create table public.home_layout_placement_snapshots (
  layout_revision_id uuid not null references public.home_layout_revisions(id) on delete restrict,
  furniture_instance_id uuid not null,
  furniture_definition_id uuid not null references public.cozy_furniture_definitions(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  zone_id uuid not null references public.housing_decoration_zones(id) on delete restrict,
  logical_x integer not null check (logical_x between -128 and 128),
  logical_y integer not null check (logical_y between -128 and 128),
  logical_layer integer not null check (logical_layer between 0 and 20),
  rotation integer not null check (rotation in (0,90,180,270)),
  effective_scale numeric(5,3) not null check (effective_scale between 0.1 and 4),
  placement_state text not null check (placement_state in ('placed','grandfathered')),
  source_inventory_history_id uuid references public.player_inventory_history(id) on delete restrict,
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  ),
  primary key(layout_revision_id,furniture_instance_id)
);

create table public.home_layout_heads (
  player_home_id uuid primary key references public.player_homes(id) on delete restrict,
  active_revision_id uuid not null unique,
  revision_number integer not null check (revision_number>0),
  state_version integer not null default 1 check (state_version>0),
  updated_at timestamptz not null default now(),
  foreign key(active_revision_id,player_home_id)
    references public.home_layout_revisions(id,player_home_id) on delete restrict
);

create table public.housing_decoration_sessions (
  id uuid primary key default gen_random_uuid(),
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  base_layout_revision_id uuid not null references public.home_layout_revisions(id) on delete restrict,
  base_revision_number integer not null check (base_revision_number>0),
  status text not null default 'active' check (status in ('active','saved','discarded','expired')),
  request_id text not null check (char_length(request_id) between 1 and 128),
  expires_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(player_profile_id,request_id),
  check((status='active')=(closed_at is null))
);
create unique index housing_decoration_sessions_one_active_idx
  on public.housing_decoration_sessions(player_home_id,player_profile_id) where status='active';

create table public.home_storage_containers (
  id uuid primary key default gen_random_uuid(),
  player_home_id uuid not null unique references public.player_homes(id) on delete restrict,
  owner_player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  storage_type text not null default 'starter_private' check (storage_type='starter_private'),
  capacity integer not null check (capacity between 1 and 500),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','suspended','archived')),
  state_version integer not null default 1 check (state_version>0),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.home_storage_stacks (
  id uuid primary key default gen_random_uuid(),
  storage_container_id uuid not null references public.home_storage_containers(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  slot_index integer not null check (slot_index between 1 and 500),
  quantity integer not null check (quantity between 1 and 999999),
  state_version integer not null default 1 check (state_version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(storage_container_id,slot_index),
  unique(storage_container_id,item_definition_id)
);

create table public.home_storage_transactions (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  storage_container_id uuid not null references public.home_storage_containers(id) on delete restrict,
  operation text not null check (operation in ('deposit','withdrawal','furniture_return')),
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 99999),
  inventory_history_id uuid references public.player_inventory_history(id) on delete restrict,
  resulting_storage_quantity integer not null check (resulting_storage_quantity between 0 and 999999),
  resulting_used_slots integer not null check (resulting_used_slots between 0 and 500),
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  ),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  unique(player_profile_id,operation,idempotency_key)
);

create table public.housing_upgrade_definitions (
  id uuid primary key,
  upgrade_key text not null unique check (upgrade_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 2 and 80 and display_name=btrim(display_name) and display_name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 8 and 280 and description=btrim(description) and description !~ '[[:cntrl:]<>]'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.housing_upgrade_versions (
  id uuid primary key,
  upgrade_definition_id uuid not null references public.housing_upgrade_definitions(id) on delete restrict,
  version_number integer not null check (version_number between 1 and 10000),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','active','superseded','archived')),
  current_tier integer not null check (current_tier between 1 and 19),
  target_tier integer not null check (target_tier between 2 and 20),
  dust_cost bigint not null check (dust_cost between 1 and 1000000),
  economy_sink_version_id uuid not null references public.economy_sink_versions(id) on delete restrict,
  required_player_level integer not null check (required_player_level between 1 and 50),
  required_skill_definition_id uuid references public.progression_skill_definitions(id) on delete restrict,
  required_skill_level integer check (required_skill_level between 1 and 50),
  required_quest_definition_id uuid references public.cozy_quest_definitions(id) on delete restrict,
  required_achievement_definition_id uuid references public.progression_achievement_definitions(id) on delete restrict,
  storage_capacity integer not null check (storage_capacity between 1 and 500),
  furniture_capacity integer not null check (furniture_capacity between 1 and 200),
  unlocked_zone_keys text[] not null default '{}'::text[] check (cardinality(unlocked_zone_keys)<=32),
  room_unlock text not null default 'none' check (room_unlock in ('none','indoor_foundation')),
  farming_tile_increase integer not null default 0 check (farming_tile_increase between 0 and 64),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  effective_at timestamptz not null,
  activated_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  ),
  created_at timestamptz not null default now(),
  unique(upgrade_definition_id,version_number),
  check(target_tier=current_tier+1),
  check((required_skill_definition_id is null)=(required_skill_level is null)),
  check((lifecycle_status in ('active','superseded'))=(activated_at is not null))
);

create table public.housing_active_upgrade_versions (
  upgrade_definition_id uuid primary key references public.housing_upgrade_definitions(id) on delete restrict,
  upgrade_version_id uuid not null unique references public.housing_upgrade_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

create table public.player_home_upgrade_transactions (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  upgrade_definition_id uuid not null references public.housing_upgrade_definitions(id) on delete restrict,
  upgrade_version_id uuid not null references public.housing_upgrade_versions(id) on delete restrict,
  from_tier integer not null check (from_tier between 1 and 19),
  to_tier integer not null check (to_tier between 2 and 20),
  dust_cost bigint not null check (dust_cost between 1 and 1000000),
  dust_ledger_entry_id uuid not null unique references public.player_dust_ledger(id) on delete restrict,
  resulting_furniture_capacity integer not null check (resulting_furniture_capacity between 1 and 200),
  resulting_storage_capacity integer not null check (resulting_storage_capacity between 1 and 500),
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  ),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  unique(player_home_id,upgrade_definition_id),
  unique(player_profile_id,idempotency_key),
  check(to_tier=from_tier+1)
);

create table public.housing_live_ops (
  singleton_key boolean primary key default true check (singleton_key),
  decoration_starts_enabled boolean not null default true,
  layout_saves_enabled boolean not null default true,
  storage_deposits_enabled boolean not null default true,
  storage_withdrawals_enabled boolean not null default true,
  upgrades_enabled boolean not null default true,
  tutorial_grants_enabled boolean not null default true,
  tutorial_rewards_enabled boolean not null default true,
  maintenance_message text check (
    maintenance_message is null or (char_length(maintenance_message) between 1 and 280 and maintenance_message=btrim(maintenance_message) and maintenance_message !~ '[[:cntrl:]<>]')
  ),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  updated_at timestamptz not null default now()
);
insert into public.housing_live_ops(singleton_key) values(true);

create table public.housing_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_number bigint generated always as identity unique,
  player_profile_id uuid references public.player_profiles(id) on delete restrict,
  player_home_id uuid references public.player_homes(id) on delete restrict,
  actor_type text not null check (actor_type in ('player','system','worker','admin')),
  actor_admin_id uuid references public.admin_users(user_id) on delete restrict,
  event_key text not null check (event_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  related_entity_id uuid,
  result_category text not null check (result_category in ('success','replayed','rejected','manual_review','repaired')),
  safe_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_payload)='object' and pg_column_size(safe_payload)<=8192),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  check((actor_type='admin')=(actor_admin_id is not null))
);

create table public.housing_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid references public.player_profiles(id) on delete restrict,
  player_home_id uuid references public.player_homes(id) on delete restrict,
  reconciliation_type text not null check (reconciliation_type in (
    'full_home','layout_head','furniture_settlement','storage_quantity','storage_capacity',
    'layout_validity','upgrade_settlement','quest_authority','preview_exclusion','configuration_compatibility'
  )),
  status text not null default 'pending' check (status in ('pending','processing','resolved','manual_review','failed')),
  priority integer not null default 50 check (priority between 1 and 100),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  expected_home_state_version integer check (expected_home_state_version>0),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and pg_column_size(evidence)<=16384),
  resolution_summary jsonb check (resolution_summary is null or (jsonb_typeof(resolution_summary)='object' and pg_column_size(resolution_summary)<=16384)),
  requested_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  available_at timestamptz not null default now(),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.housing_corrections (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  correction_type text not null check (correction_type in (
    'retry_layout_settlement','recover_stranded_furniture','repair_storage_mismatch',
    'restore_safe_layout','compensating_item_foundation'
  )),
  status text not null default 'pending_review' check (status in ('pending_review','approved','applied','rejected','failed')),
  expected_home_state_version integer not null check (expected_home_state_version>0),
  impact_preview jsonb not null check (jsonb_typeof(impact_preview)='object' and pg_column_size(impact_preview)<=16384),
  reason text not null check (char_length(reason) between 20 and 1000 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  requested_by_admin_id uuid not null references public.admin_users(user_id) on delete restrict,
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  applied_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  state_version integer not null default 1 check (state_version>0),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  applied_at timestamptz,
  check(requested_by_admin_id is distinct from reviewed_by_admin_id),
  check((status='applied')=(applied_at is not null))
);

create table public.housing_telemetry_daily (
  event_date date not null,
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  dimension_key text not null default 'all' check (char_length(dimension_key) between 1 and 80 and dimension_key !~ '[[:cntrl:]<>]'),
  event_count bigint not null default 0 check (event_count between 0 and 9000000000000000),
  quantity_total bigint not null default 0 check (quantity_total between 0 and 9000000000000000),
  updated_at timestamptz not null default now(),
  primary key(event_date,metric_key,dimension_key)
);

insert into public.housing_upgrade_definitions(id,upgrade_key,display_name,description)
values(
  'e1100000-0000-4000-8000-000000000100','cozy-home-tier-2','Cozy Home Tier 2',
  'A bounded unpublished upgrade that increases furniture and private storage capacity.'
);
insert into public.housing_upgrade_versions(
  id,upgrade_definition_id,version_number,lifecycle_status,current_tier,target_tier,dust_cost,
  economy_sink_version_id,required_player_level,storage_capacity,furniture_capacity,
  unlocked_zone_keys,room_unlock,farming_tile_increase,effective_at,activated_at,reason,safe_metadata
) values(
  'e1100000-0000-4000-8000-000000000101','e1100000-0000-4000-8000-000000000100',1,'active',
  1,2,250,'e1100000-0000-4000-8000-000000000001',3,24,12,
  array['cozy-outdoor-edge'],'indoor_foundation',0,now(),now(),
  'Phase 11E development-safe local upgrade path; owner validation is still required.',
  '{"unpublishedTuning":true,"doesNotEnableIndoorRenderer":true}'
);
insert into public.housing_active_upgrade_versions(upgrade_definition_id,upgrade_version_id)
values('e1100000-0000-4000-8000-000000000100','e1100000-0000-4000-8000-000000000101');

-- Phase 11E extends the canonical Phase 11D objective registry and connected
-- Starville Beginnings chain. Housing progress is written only from trusted
-- successful housing transactions in the player-functions migration.
alter table public.cozy_quest_objectives drop constraint cozy_quest_objectives_objective_key_check;
alter table public.cozy_quest_objectives add constraint cozy_quest_objectives_objective_key_check check (objective_key in (
  'meet_guide','receive_starter_kit','enter_home_plot','prepare_soil','plant_crops','water_crops',
  'harvest_crop','deliver_produce','receive_reward','speak_with_guide','unlock_cooking_recipe',
  'collect_cooked_item','unlock_crafting_recipe','collect_crafted_item','return_to_guide',
  'interact_with_shopkeeper','open_shop','buy_catalog_item','sell_catalog_item',
  'inspect_shop_receipt','return_to_shopkeeper','reach_player_level','reach_skill_level',
  'earn_skill_xp','collect_cooking_recipe','collect_crafting_recipe','buy_shop_item',
  'sell_shop_item','earn_dust_from_shop_sales','own_unlock','complete_achievement',
  'interact_with_npc','visit_world','complete_quest','enter_personal_home','open_decoration_mode',
  'place_home_furniture','save_home_layout','open_home_storage','deposit_home_storage',
  'withdraw_home_storage','inspect_home_layout_revision','complete_home_interaction'
));

-- Progression chapters settle their explicit versioned reward definitions;
-- unlike the legacy farming tutorial they do not require an inline DUST reward.
alter table public.cozy_quest_versions alter column reward_dust drop not null;

insert into public.cozy_quest_definitions(id,slug)
values('e1100000-0000-4000-8000-000000000200','home-sweet-home');
insert into public.cozy_quest_versions(
  id,quest_definition_id,version_number,lifecycle_status,name,description,
  starter_seed_quantity,delivery_quantity,reward_dust,starter_hoe_item_definition_id,
  starter_watering_can_item_definition_id,starter_seed_item_definition_id,delivery_item_definition_id,
  active,published_at,quest_kind,required_quest_definition_id,configuration_revision,safe_metadata
) values(
  'e1100000-0000-4000-8000-000000000201','e1100000-0000-4000-8000-000000000200',1,'active',
  'Home Sweet Home','Decorate your personal home, save one layout, and learn safe private storage.',
  null,null,null,null,null,null,null,true,now(),'progression_chapter',
  'd1100000-0000-4000-8000-000000000303',1,
  '{"phase11e":true,"tutorialFurniture":"willow-chair","rewardBounded":true}'
);
insert into public.cozy_quest_objectives(
  id,quest_version_id,objective_key,sequence_number,label,required_count,target_reference_key,safe_metadata
) values
  ('e1100000-0000-4000-8000-000000000211','e1100000-0000-4000-8000-000000000201','enter_personal_home',1,'Enter your personal home',1,'personal-home','{}'),
  ('e1100000-0000-4000-8000-000000000212','e1100000-0000-4000-8000-000000000201','open_decoration_mode',2,'Open Decoration Mode',1,'decoration-mode','{}'),
  ('e1100000-0000-4000-8000-000000000213','e1100000-0000-4000-8000-000000000201','place_home_furniture',3,'Place the Willow Chair in a saved layout',1,'willow-chair','{}'),
  ('e1100000-0000-4000-8000-000000000214','e1100000-0000-4000-8000-000000000201','save_home_layout',4,'Save your home layout',1,'home-layout','{}'),
  ('e1100000-0000-4000-8000-000000000215','e1100000-0000-4000-8000-000000000201','open_home_storage',5,'Open Home Storage',1,'home-storage','{}'),
  ('e1100000-0000-4000-8000-000000000216','e1100000-0000-4000-8000-000000000201','deposit_home_storage',6,'Move one eligible item into storage',1,'home-storage','{}'),
  ('e1100000-0000-4000-8000-000000000217','e1100000-0000-4000-8000-000000000201','withdraw_home_storage',7,'Move one item back to inventory',1,'home-storage','{}'),
  ('e1100000-0000-4000-8000-000000000218','e1100000-0000-4000-8000-000000000201','inspect_home_layout_revision',8,'Inspect a saved layout revision',1,'home-layout-history','{}'),
  ('e1100000-0000-4000-8000-000000000219','e1100000-0000-4000-8000-000000000201','complete_home_interaction',9,'Complete the Home Sweet Home lesson',1,'willow-guide','{}');

insert into public.progression_quest_chain_versions(
  id,quest_chain_id,version_number,lifecycle_status,reward_summary,effective_at,activated_at,reason,safe_metadata
) values(
  'e1100000-0000-4000-8000-000000000220','d1100000-0000-4000-8000-000000000350',2,'active',
  'Adds bounded home tutorial title and badge rewards without changing prior quest snapshots.',
  now(),now(),'Phase 11E successor adds the Home Sweet Home tutorial after Starville Beginnings.',
  '{"ordered":true,"phase11e":true}'
);
insert into public.progression_quest_chain_entries(
  quest_chain_version_id,quest_definition_id,sequence_number,prerequisite_quest_definition_id,
  required_player_level,required_skill_definition_id,required_skill_level,safe_metadata
)
select 'e1100000-0000-4000-8000-000000000220',entry.quest_definition_id,
  entry.sequence_number,entry.prerequisite_quest_definition_id,entry.required_player_level,
  entry.required_skill_definition_id,entry.required_skill_level,entry.safe_metadata
from public.progression_quest_chain_entries entry
where entry.quest_chain_version_id='d1100000-0000-4000-8000-000000000351';
insert into public.progression_quest_chain_entries(
  quest_chain_version_id,quest_definition_id,sequence_number,prerequisite_quest_definition_id,
  required_player_level,safe_metadata
) values(
  'e1100000-0000-4000-8000-000000000220','e1100000-0000-4000-8000-000000000200',7,
  'd1100000-0000-4000-8000-000000000303',3,'{"phase11e":true}'
);
update public.progression_active_quest_chain_versions
set quest_chain_version_id='e1100000-0000-4000-8000-000000000220',activated_at=now()
where quest_chain_id='d1100000-0000-4000-8000-000000000350';

insert into public.progression_achievement_definitions(
  id,achievement_key,display_name,description,category
) values
  ('e1100000-0000-4000-8000-000000000230','first-decoration','First Decoration','Save your first authoritative home layout containing furniture.','home'),
  ('e1100000-0000-4000-8000-000000000231','organized-home','Organized Home','Complete one authoritative deposit and withdrawal through Home Storage.','home'),
  ('e1100000-0000-4000-8000-000000000232','cozy-upgrade','Cozy Upgrade','Purchase the first bounded personal-home upgrade.','home');
insert into public.progression_achievement_versions(
  id,achievement_definition_id,version_number,lifecycle_status,criteria_type,source_event_key,
  target_value,hidden,progress_visible,icon_ref,effective_at,activated_at,reason,safe_metadata
) values
  ('e1100000-0000-4000-8000-000000000240','e1100000-0000-4000-8000-000000000230',1,'active','trusted_event_count','home_layout_saved',1,false,true,'achievement-first-decoration',now(),now(),'Phase 11E exact-once layout achievement.','{}'),
  ('e1100000-0000-4000-8000-000000000241','e1100000-0000-4000-8000-000000000231',1,'active','trusted_event_count','home_storage_transfer',2,false,true,'achievement-organized-home',now(),now(),'Phase 11E bounded storage-loop achievement.','{}'),
  ('e1100000-0000-4000-8000-000000000242','e1100000-0000-4000-8000-000000000232',1,'active','trusted_event_count','home_upgraded',1,false,true,'achievement-cozy-upgrade',now(),now(),'Phase 11E exact-once upgrade achievement.','{}');
insert into public.progression_active_achievement_versions(achievement_definition_id,achievement_version_id)
values
  ('e1100000-0000-4000-8000-000000000230','e1100000-0000-4000-8000-000000000240'),
  ('e1100000-0000-4000-8000-000000000231','e1100000-0000-4000-8000-000000000241'),
  ('e1100000-0000-4000-8000-000000000232','e1100000-0000-4000-8000-000000000242');

insert into public.progression_titles(
  id,title_key,display_name,description,source_category,rarity,safe_metadata
) values(
  'e1100000-0000-4000-8000-000000000250','cozy-decorator','Cozy Decorator',
  'Completed the Home Sweet Home decoration and storage lesson.','quest','uncommon','{"phase11e":true}'
);
insert into public.progression_badges(
  id,badge_key,display_name,description,icon_ref,safe_metadata
) values(
  'e1100000-0000-4000-8000-000000000251','home-sweet-home','Home Sweet Home',
  'A badge earned through authoritative personal-home tutorial progress.',
  'badge-home-sweet-home','{"phase11e":true}'
);
insert into public.progression_reward_definitions(
  id,source_type,source_version_id,reward_type,target_reference_id,amount,display_label,safe_metadata
) values
  ('e1100000-0000-4000-8000-000000000260','quest','e1100000-0000-4000-8000-000000000201','title','e1100000-0000-4000-8000-000000000250',1,'Cozy Decorator title','{}'),
  ('e1100000-0000-4000-8000-000000000261','quest','e1100000-0000-4000-8000-000000000201','badge','e1100000-0000-4000-8000-000000000251',1,'Home Sweet Home badge','{}');

alter table public.cozy_private_plot_events drop constraint cozy_private_plot_events_event_key_check;
alter table public.cozy_private_plot_events add constraint cozy_private_plot_events_event_key_check check (event_key in (
  'plot_provisioned','soil_prepared','crop_planted','crop_watered','crop_stage_changed','crop_harvested',
  'inventory_changed','quest_progressed','crafting_job_started','crafting_job_ready',
  'crafting_job_collected','crafting_job_failed','workstation_queue_changed','home_layout_saved',
  'furniture_placed','furniture_moved','furniture_removed','storage_changed','home_upgraded',
  'home_capacity_changed','home_interaction_completed'
));

create index home_layout_revisions_home_idx
  on public.home_layout_revisions(player_home_id,revision_number desc);
create index home_layout_snapshots_definition_idx
  on public.home_layout_placement_snapshots(furniture_definition_id,layout_revision_id);
create index player_home_furniture_active_home_idx
  on public.player_home_furniture(player_home_id,updated_at desc) where removed_at is null;
create index home_storage_transactions_home_idx
  on public.home_storage_transactions(player_home_id,created_at desc,id);
create index player_home_upgrade_transactions_home_idx
  on public.player_home_upgrade_transactions(player_home_id,created_at desc);
create index housing_reconciliation_pending_idx
  on public.housing_reconciliation_queue(priority desc,available_at,id)
  where status in ('pending','failed');
create index housing_audit_home_idx
  on public.housing_audit_events(player_home_id,event_number desc);

create trigger housing_decoration_zones_updated before update on public.housing_decoration_zones
for each row execute function private.set_updated_at();
create trigger home_storage_containers_updated before update on public.home_storage_containers
for each row execute function private.set_updated_at();
create trigger home_storage_stacks_updated before update on public.home_storage_stacks
for each row execute function private.set_updated_at();
create trigger housing_upgrade_definitions_updated before update on public.housing_upgrade_definitions
for each row execute function private.set_updated_at();
create trigger housing_live_ops_updated before update on public.housing_live_ops
for each row execute function private.set_updated_at();
create trigger housing_reconciliation_updated before update on public.housing_reconciliation_queue
for each row execute function private.set_updated_at();

create or replace function private.protect_housing_immutable_record()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='55000',message='HOUSING_HISTORY_IMMUTABLE';
end;
$$;

create or replace function private.protect_housing_upgrade_version()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.lifecycle_status in ('superseded','archived')
     or old.lifecycle_status='active' and new.lifecycle_status<>'superseded' then
    raise exception using errcode='55000',message='HOUSING_UPGRADE_VERSION_IMMUTABLE';
  end if;
  return coalesce(new,old);
end;
$$;

create trigger home_layout_revisions_immutable before update or delete on public.home_layout_revisions
for each row execute function private.protect_housing_immutable_record();
create trigger home_layout_snapshots_immutable before update or delete on public.home_layout_placement_snapshots
for each row execute function private.protect_housing_immutable_record();
create trigger home_storage_transactions_immutable before update or delete on public.home_storage_transactions
for each row execute function private.protect_housing_immutable_record();
create trigger player_home_upgrade_transactions_immutable before update or delete on public.player_home_upgrade_transactions
for each row execute function private.protect_housing_immutable_record();
create trigger housing_audit_events_immutable before update or delete on public.housing_audit_events
for each row execute function private.protect_housing_immutable_record();
create trigger housing_upgrade_versions_immutable before update or delete on public.housing_upgrade_versions
for each row execute function private.protect_housing_upgrade_version();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'housing_decoration_zones','home_layout_revisions','home_layout_placement_snapshots',
    'home_layout_heads','housing_decoration_sessions','home_storage_containers',
    'home_storage_stacks','home_storage_transactions','housing_upgrade_definitions',
    'housing_upgrade_versions','housing_active_upgrade_versions','player_home_upgrade_transactions',
    'housing_live_ops','housing_audit_events','housing_reconciliation_queue','housing_corrections',
    'housing_telemetry_daily'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',table_name);
  end loop;
end;
$$;

revoke all on function private.protect_housing_immutable_record() from public,anon,authenticated,service_role;
revoke all on function private.protect_housing_upgrade_version() from public,anon,authenticated,service_role;
