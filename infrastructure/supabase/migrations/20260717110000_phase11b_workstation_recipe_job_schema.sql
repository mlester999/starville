-- Starville Phase 11B: immutable recipe versions, owner-home workstations,
-- offline cooking/crafting jobs, collection, and tutorial continuation schema.
-- Forward-only. Applying this migration is intentionally an owner-controlled step.

alter table public.cozy_gameplay_idempotency
  drop constraint cozy_gameplay_idempotency_operation_check;
alter table public.cozy_gameplay_idempotency
  add constraint cozy_gameplay_idempotency_operation_check check (operation in (
    'bootstrap', 'quickbar_update', 'farm_plant', 'farm_water', 'farm_harvest',
    'recipe_cook', 'recipe_craft', 'shop_buy', 'shop_sell',
    'home_enter', 'home_exit', 'furniture_place', 'furniture_move',
    'furniture_rotate', 'furniture_remove',
    'starter_quest_accept', 'home_soil_prepare', 'home_crop_plant',
    'home_crop_water', 'home_crop_harvest', 'starter_quest_delivery',
    'workstation_job_start', 'workstation_job_collect',
    'workstation_tutorial_accept', 'workstation_tutorial_turn_in'
  ));

alter table public.cozy_gameplay_rate_limits
  drop constraint cozy_gameplay_rate_limits_scope_check;
alter table public.cozy_gameplay_rate_limits
  add constraint cozy_gameplay_rate_limits_scope_check check (scope in (
    'bootstrap', 'dust_read', 'inventory_read', 'history_read', 'quickbar_write',
    'farm_read', 'farm_write', 'recipe_read', 'recipe_write', 'shop_read', 'shop_write',
    'home_read', 'home_write', 'vertical_slice_read', 'plot_provision',
    'home_farm_write', 'starter_quest_write',
    'workstation_read', 'workstation_write', 'workstation_collect',
    'workstation_tutorial_write'
  ));

alter table public.player_inventory_history
  drop constraint player_inventory_history_reason_check;
alter table public.player_inventory_history
  add constraint player_inventory_history_reason_check check (reason in (
    'starter_grant', 'shop_purchase', 'shop_sale', 'planting', 'harvest',
    'cooking', 'crafting', 'furniture_placement', 'furniture_removal',
    'social_gift', 'social_trade', 'system_refund',
    'cooperative_activity_reward', 'tutorial_delivery',
    'cooking_ingredient_consumed', 'crafting_ingredient_consumed',
    'cooking_output_collected', 'crafting_output_collected',
    'crafting_refund', 'crafting_compensation', 'tutorial_output_delivered'
  ));

alter table public.player_dust_ledger
  drop constraint player_dust_ledger_reason_check;
alter table public.player_dust_ledger
  add constraint player_dust_ledger_reason_check check (reason in (
    'starter_grant','shop_purchase','shop_sale','crafting_fee','system_refund',
    'migration_adjustment','cooperative_activity_reward','administrative_correction',
    'starter_farming_quest_reward','starter_workstation_quest_reward'
  ));
alter table public.player_dust_ledger
  drop constraint player_dust_ledger_reference_type_check;
alter table public.player_dust_ledger
  add constraint player_dust_ledger_reference_type_check check (reference_type in (
    'player_bootstrap', 'shop_transaction', 'recipe_action', 'system_operation', 'migration',
    'cooperative_activity', 'starter_farming_quest', 'crafting_job',
    'starter_workstation_quest'
  ));

alter table public.cozy_private_plot_events
  drop constraint cozy_private_plot_events_event_key_check;
alter table public.cozy_private_plot_events
  add constraint cozy_private_plot_events_event_key_check check (event_key in (
    'plot_provisioned', 'soil_prepared', 'crop_planted', 'crop_watered',
    'crop_stage_changed', 'crop_harvested', 'inventory_changed', 'quest_progressed',
    'crafting_job_started', 'crafting_job_ready', 'crafting_job_collected',
    'crafting_job_failed', 'workstation_queue_changed'
  ));

insert into public.cozy_item_definitions (
  id, slug, name, description, category, stackable, max_stack_size,
  buy_eligible, sell_eligible, default_buy_price, default_sell_price,
  asset_ref, asset_readiness, active, content_version, metadata,
  giftable, tradable, account_bound, permanent_tool,
  minimum_transfer_quantity, maximum_transfer_quantity
) values (
  'b1100000-0000-4000-8000-000000000001',
  'garden-soup', 'Garden Soup',
  'A gentle tutorial soup made from freshly harvested Moonbeans.',
  'cooked_food', true, 20, false, false, null, null,
  'phase11b-dev-garden-soup', 'development_marker', true, 1,
  '{"kind":"cooked_food"}'::jsonb,
  true, true, false, false, 1, 20
)
on conflict (id) do nothing;

insert into public.cozy_recipe_definitions (
  id, slug, name, description, kind, station_type, output_item_definition_id,
  output_quantity, dust_fee, active, content_version
) values (
  'b1100000-0000-4000-8000-000000000011',
  'garden-soup', 'Garden Soup',
  'Cook two harvested Moonbeans into a warm starter soup.',
  'cooking', 'cooking_hearth',
  'b1100000-0000-4000-8000-000000000001', 1, 0, true, 1
)
on conflict (id) do nothing;

insert into public.cozy_recipe_ingredients (
  recipe_definition_id, item_definition_id, quantity
) values (
  'b1100000-0000-4000-8000-000000000011',
  '71000000-0000-4000-8000-000000000004', 2
)
on conflict do nothing;

create table public.cozy_workstation_definitions (
  id uuid primary key,
  workstation_key text not null unique check (
    char_length(workstation_key) between 1 and 80
    and workstation_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  display_name text not null check (
    char_length(display_name) between 1 and 80
    and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  ),
  description text not null check (
    char_length(description) between 1 and 280
    and description = btrim(description)
    and description !~ '[[:cntrl:]<>]'
  ),
  workstation_type text not null unique
    check (workstation_type in ('cooking_hearth','crafting_workbench')),
  allowed_recipe_categories text[] not null check (
    cardinality(allowed_recipe_categories) between 1 and 8
    and allowed_recipe_categories <@ array['cooking','crafting']::text[]
  ),
  queue_capacity integer not null check (queue_capacity between 1 and 8),
  simultaneous_job_policy text not null default 'bounded_owner_queue'
    check (simultaneous_job_policy = 'bounded_owner_queue'),
  interaction_radius numeric(5,2) not null check (interaction_radius between 1 and 4),
  enabled boolean not null default true,
  asset_ref text check (
    asset_ref is null or (
      char_length(asset_ref) between 1 and 80
      and asset_ref ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  ),
  asset_readiness text not null
    check (asset_readiness in ('approved','development_marker','missing')),
  pinned_asset_version_id uuid references public.world_asset_versions(id) on delete restrict,
  fallback_marker text not null check (
    char_length(fallback_marker) between 1 and 8
    and fallback_marker !~ '[[:cntrl:]<>]'
  ),
  animation_config jsonb not null default '{}'::jsonb check (
    jsonb_typeof(animation_config) = 'object' and pg_column_size(animation_config) <= 4096
  ),
  sound_config jsonb not null default '{}'::jsonb check (
    jsonb_typeof(sound_config) = 'object' and pg_column_size(sound_config) <= 4096
  ),
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata) = 'object' and pg_column_size(safe_metadata) <= 4096
  ),
  configuration_revision integer not null default 1 check (configuration_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (asset_readiness <> 'approved' or (asset_ref is not null and pinned_asset_version_id is not null)),
  check (
    (workstation_type = 'cooking_hearth' and allowed_recipe_categories = array['cooking']::text[])
    or (workstation_type = 'crafting_workbench' and allowed_recipe_categories = array['crafting']::text[])
  )
);

create table public.cozy_home_workstation_templates (
  id uuid primary key,
  home_template_id uuid not null references public.cozy_home_templates(id) on delete restrict,
  template_version integer not null check (template_version > 0),
  world_object_id text not null check (
    char_length(world_object_id) between 1 and 80
    and world_object_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  workstation_definition_id uuid not null
    references public.cozy_workstation_definitions(id) on delete restrict,
  position_x numeric(8,4) not null,
  position_y numeric(8,4) not null,
  interaction_x numeric(8,4) not null,
  interaction_y numeric(8,4) not null,
  collision_width numeric(5,2) not null check (collision_width between 0.25 and 8),
  collision_height numeric(5,2) not null check (collision_height between 0.25 and 8),
  enabled boolean not null default true,
  access_policy text not null default 'owner_only' check (access_policy = 'owner_only'),
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata) = 'object' and pg_column_size(safe_metadata) <= 4096
  ),
  created_at timestamptz not null default now(),
  unique (home_template_id, template_version, world_object_id),
  unique (home_template_id, template_version, workstation_definition_id)
);

create table public.player_home_workstations (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  workstation_template_id uuid not null
    references public.cozy_home_workstation_templates(id) on delete restrict,
  workstation_definition_id uuid not null
    references public.cozy_workstation_definitions(id) on delete restrict,
  world_object_id text not null,
  position_x numeric(8,4) not null,
  position_y numeric(8,4) not null,
  interaction_x numeric(8,4) not null,
  interaction_y numeric(8,4) not null,
  enabled boolean not null default true,
  state_version integer not null default 1 check (state_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_home_id, world_object_id),
  unique (player_home_id, workstation_definition_id),
  unique (player_profile_id, id),
  unique (player_home_id, id)
);

insert into public.cozy_workstation_definitions (
  id, workstation_key, display_name, description, workstation_type,
  allowed_recipe_categories, queue_capacity, interaction_radius, enabled,
  asset_ref, asset_readiness, fallback_marker, animation_config, sound_config,
  safe_metadata, configuration_revision
) values
  (
    'b1100000-0000-4000-8000-000000000021', 'home-cooking-hearth',
    'Cooking Hearth', 'A warm owner-only hearth for preparing Starville recipes.',
    'cooking_hearth', array['cooking'], 2, 2.25, true,
    'phase7-cooking-hearth-marker', 'development_marker', '♨',
    '{"idle":"hearth_idle","active":"hearth_cooking","ready":"hearth_ready","fallback":true}'::jsonb,
    '{"start":"cooking_start","ready":"cooking_ready","fallback":true}'::jsonb,
    '{"phase":"11B","placement":"personal_home"}'::jsonb, 1
  ),
  (
    'b1100000-0000-4000-8000-000000000022', 'home-crafting-workbench',
    'Crafting Workbench', 'An owner-only bench for useful materials and future home projects.',
    'crafting_workbench', array['crafting'], 2, 2.25, true,
    'phase7-crafting-workbench-marker', 'development_marker', '⚒',
    '{"idle":"bench_idle","active":"bench_crafting","ready":"bench_ready","fallback":true}'::jsonb,
    '{"start":"crafting_start","ready":"crafting_ready","fallback":true}'::jsonb,
    '{"phase":"11B","placement":"personal_home"}'::jsonb, 1
  )
on conflict (id) do nothing;

insert into public.cozy_home_workstation_templates (
  id, home_template_id, template_version, world_object_id,
  workstation_definition_id, position_x, position_y, interaction_x, interaction_y,
  collision_width, collision_height, enabled, access_policy, safe_metadata
) values
  (
    'b1100000-0000-4000-8000-000000000031',
    '76000000-0000-4000-8000-000000000001', 1, 'home-cooking-hearth',
    'b1100000-0000-4000-8000-000000000021', 2, 6, 3, 6,
    1.25, 1.00, true, 'owner_only', '{"reachable":true}'::jsonb
  ),
  (
    'b1100000-0000-4000-8000-000000000032',
    '76000000-0000-4000-8000-000000000001', 1, 'home-crafting-workbench',
    'b1100000-0000-4000-8000-000000000022', 8, 6, 7, 6,
    1.25, 1.00, true, 'owner_only', '{"reachable":true}'::jsonb
  )
on conflict (id) do nothing;

create or replace function private.provision_home_template_workstations()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.cozy_home_workstation_templates (
    id, home_template_id, template_version, world_object_id,
    workstation_definition_id, position_x, position_y, interaction_x, interaction_y,
    collision_width, collision_height, enabled, access_policy, safe_metadata
  )
  select gen_random_uuid(), new.id, new.template_version,
    case definition.workstation_type
      when 'cooking_hearth' then 'home-cooking-hearth'
      else 'home-crafting-workbench'
    end,
    definition.id,
    case definition.workstation_type
      when 'cooking_hearth' then new.min_x + 2
      else new.max_x - 2
    end,
    new.max_y - 2,
    case definition.workstation_type
      when 'cooking_hearth' then new.min_x + 3
      else new.max_x - 3
    end,
    new.max_y - 2,
    1.25, 1.00, true, 'owner_only',
    jsonb_build_object('reachable', true, 'generatedForTemplateSuccessor', true)
  from public.cozy_workstation_definitions definition
  where definition.workstation_type in ('cooking_hearth','crafting_workbench')
  on conflict (home_template_id, template_version, workstation_definition_id) do nothing;
  return new;
end;
$$;

create trigger cozy_home_templates_provision_workstations
after insert on public.cozy_home_templates
for each row execute function private.provision_home_template_workstations();

insert into public.cozy_home_workstation_templates (
  id, home_template_id, template_version, world_object_id,
  workstation_definition_id, position_x, position_y, interaction_x, interaction_y,
  collision_width, collision_height, enabled, access_policy, safe_metadata
)
select gen_random_uuid(), template.id, template.template_version,
  case definition.workstation_type
    when 'cooking_hearth' then 'home-cooking-hearth'
    else 'home-crafting-workbench'
  end,
  definition.id,
  case definition.workstation_type
    when 'cooking_hearth' then template.min_x + 2
    else template.max_x - 2
  end,
  template.max_y - 2,
  case definition.workstation_type
    when 'cooking_hearth' then template.min_x + 3
    else template.max_x - 3
  end,
  template.max_y - 2,
  1.25, 1.00, true, 'owner_only',
  jsonb_build_object('reachable', true, 'migrationBackfill', true)
from public.cozy_home_templates template
cross join public.cozy_workstation_definitions definition
where definition.workstation_type in ('cooking_hearth','crafting_workbench')
on conflict (home_template_id, template_version, workstation_definition_id) do nothing;

create table public.cozy_recipe_versions (
  id uuid primary key,
  recipe_definition_id uuid not null references public.cozy_recipe_definitions(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null check (
    lifecycle_status in ('draft','validated','active','superseded','archived')
  ),
  public_name text not null check (
    char_length(public_name) between 1 and 80
    and public_name = btrim(public_name)
    and public_name !~ '[[:cntrl:]<>]'
  ),
  public_description text not null check (
    char_length(public_description) between 1 and 280
    and public_description = btrim(public_description)
    and public_description !~ '[[:cntrl:]<>]'
  ),
  recipe_category text not null check (recipe_category in ('cooking','crafting')),
  workstation_type text not null check (workstation_type in ('cooking_hearth','crafting_workbench')),
  output_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  output_quantity integer not null check (output_quantity between 1 and 10000),
  production_duration_seconds integer not null check (production_duration_seconds between 1 and 2592000),
  local_duration_seconds integer not null check (local_duration_seconds between 1 and 3600),
  dust_fee bigint not null default 0 check (dust_fee between 0 and 9000000000000000),
  unlock_rule text not null check (unlock_rule in (
    'starter','phase11a_complete','phase11b_tutorial_accepted','phase11b_cooking_collected',
    'admin_grant_foundation','seasonal_foundation','level_foundation','skill_foundation'
  )),
  required_quest_definition_id uuid references public.cozy_quest_definitions(id) on delete restrict,
  discovery_policy text not null default 'visible_locked'
    check (discovery_policy in ('hidden','visible_locked','visible_requirement')),
  tutorial_eligible boolean not null default false,
  repeatable boolean not null default true,
  maximum_batch_quantity integer not null default 1 check (maximum_batch_quantity between 1 and 99),
  enabled boolean not null default true,
  cancellation_policy text not null default 'disabled' check (cancellation_policy = 'disabled'),
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata) = 'object' and pg_column_size(safe_metadata) <= 4096
  ),
  configuration_revision integer not null check (configuration_revision > 0),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (recipe_definition_id, version_number),
  check (
    (recipe_category = 'cooking' and workstation_type = 'cooking_hearth')
    or (recipe_category = 'crafting' and workstation_type = 'crafting_workbench')
  ),
  check ((lifecycle_status = 'active' and activated_at is not null) or lifecycle_status <> 'active')
);

create table public.cozy_recipe_version_ingredients (
  recipe_version_id uuid not null references public.cozy_recipe_versions(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 10000),
  display_order integer not null check (display_order between 1 and 32),
  consumed_on_start boolean not null default true check (consumed_on_start),
  accepted_item_tag text,
  quality_minimum integer,
  safe_replacement_policy text not null default 'exact_item_only'
    check (safe_replacement_policy = 'exact_item_only'),
  primary key (recipe_version_id, item_definition_id),
  unique (recipe_version_id, display_order),
  check (accepted_item_tag is null and quality_minimum is null)
);

create table public.cozy_active_recipe_versions (
  recipe_definition_id uuid primary key references public.cozy_recipe_definitions(id) on delete restrict,
  recipe_version_id uuid not null unique references public.cozy_recipe_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

with recipe_source as (
  select recipe.*,
    case recipe.slug
      when 'garden-soup' then 30
      when 'moonbean-salad' then 45
      when 'sunroot-soup' then 60
      when 'cloudberry-tart' then 75
      when 'meadow-biscuit' then 40
      when 'garden-twine' then 35
      else 90
    end as duration_seconds,
    case recipe.slug
      when 'garden-soup' then 'phase11b_tutorial_accepted'
      when 'garden-twine' then 'phase11b_cooking_collected'
      else 'starter'
    end as unlock_rule,
    recipe.slug in ('garden-soup','garden-twine') as tutorial_eligible
  from public.cozy_recipe_definitions recipe
)
insert into public.cozy_recipe_versions (
  id, recipe_definition_id, version_number, lifecycle_status,
  public_name, public_description, recipe_category, workstation_type,
  output_item_definition_id, output_quantity, production_duration_seconds,
  local_duration_seconds, dust_fee, unlock_rule, discovery_policy,
  tutorial_eligible, repeatable, maximum_batch_quantity, enabled,
  cancellation_policy, safe_metadata, configuration_revision, activated_at
)
select
  case recipe.slug
    when 'moonbean-salad' then 'b1100000-0000-4000-8000-000000000101'::uuid
    when 'sunroot-soup' then 'b1100000-0000-4000-8000-000000000102'::uuid
    when 'cloudberry-tart' then 'b1100000-0000-4000-8000-000000000103'::uuid
    when 'meadow-biscuit' then 'b1100000-0000-4000-8000-000000000104'::uuid
    when 'garden-twine' then 'b1100000-0000-4000-8000-000000000105'::uuid
    when 'willow-chair' then 'b1100000-0000-4000-8000-000000000106'::uuid
    when 'garden-soup' then 'b1100000-0000-4000-8000-000000000107'::uuid
  end,
  recipe.id, 1, 'active', recipe.name, recipe.description, recipe.kind,
  recipe.station_type, recipe.output_item_definition_id, recipe.output_quantity,
  recipe.duration_seconds, least(recipe.duration_seconds, 8), recipe.dust_fee,
  recipe.unlock_rule, 'visible_locked', recipe.tutorial_eligible, true,
  case when recipe.tutorial_eligible then 4 else 10 end,
  recipe.active, 'disabled',
  jsonb_build_object('migratedFromPhase7', recipe.slug <> 'garden-soup'),
  1, now()
from recipe_source recipe
where recipe.slug in (
  'moonbean-salad','sunroot-soup','cloudberry-tart','meadow-biscuit',
  'garden-twine','willow-chair','garden-soup'
)
on conflict (id) do nothing;

insert into public.cozy_recipe_version_ingredients (
  recipe_version_id, item_definition_id, quantity, display_order
)
select version.id, ingredient.item_definition_id, ingredient.quantity,
  row_number() over (partition by version.id order by item.slug, item.id)::integer
from public.cozy_recipe_versions version
join public.cozy_recipe_ingredients ingredient
  on ingredient.recipe_definition_id = version.recipe_definition_id
join public.cozy_item_definitions item on item.id = ingredient.item_definition_id
where version.version_number = 1
on conflict do nothing;

insert into public.cozy_active_recipe_versions (recipe_definition_id, recipe_version_id)
select version.recipe_definition_id, version.id
from public.cozy_recipe_versions version
where version.lifecycle_status = 'active'
on conflict (recipe_definition_id) do nothing;

create table public.player_recipe_unlocks (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  recipe_definition_id uuid not null references public.cozy_recipe_definitions(id) on delete restrict,
  unlock_source text not null check (unlock_source in (
    'starter','phase11b_tutorial','quest_completion','admin_grant_foundation',
    'seasonal_foundation','level_foundation','skill_foundation'
  )),
  source_reference_id uuid,
  unlocked_at timestamptz not null default now(),
  primary key (player_profile_id, recipe_definition_id)
);

create table public.cozy_crafting_settings (
  singleton_key boolean primary key default true check (singleton_key),
  cooking_starts_enabled boolean not null default true,
  crafting_starts_enabled boolean not null default true,
  collection_enabled boolean not null default true,
  tutorial_unlocks_enabled boolean not null default true,
  tutorial_rewards_enabled boolean not null default true,
  dust_fees_enabled boolean not null default true,
  use_local_durations boolean not null default false,
  start_cooldown_ms integer not null default 500 check (start_cooldown_ms between 100 and 10000),
  collect_cooldown_ms integer not null default 350 check (collect_cooldown_ms between 100 and 10000),
  turn_in_cooldown_ms integer not null default 1000 check (turn_in_cooldown_ms between 250 and 10000),
  interaction_distance_tolerance numeric(4,2) not null default 0.35
    check (interaction_distance_tolerance between 0 and 1),
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
insert into public.cozy_crafting_settings (singleton_key) values (true);

create table public.player_crafting_jobs (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  workstation_instance_id uuid not null,
  workstation_definition_id uuid not null references public.cozy_workstation_definitions(id) on delete restrict,
  recipe_definition_id uuid not null references public.cozy_recipe_definitions(id) on delete restrict,
  recipe_version_id uuid not null references public.cozy_recipe_versions(id) on delete restrict,
  recipe_key text not null,
  recipe_name text not null,
  recipe_category text not null check (recipe_category in ('cooking','crafting')),
  workstation_type text not null check (workstation_type in ('cooking_hearth','crafting_workbench')),
  quantity integer not null check (quantity between 1 and 99),
  status text not null default 'running' check (
    status in ('pending','running','ready','collecting','collected','canceled','failed','blocked')
  ),
  started_at timestamptz not null,
  completes_at timestamptz not null,
  collected_at timestamptz,
  canceled_at timestamptz,
  failed_at timestamptz,
  ingredient_snapshot jsonb not null check (
    jsonb_typeof(ingredient_snapshot) = 'array'
    and jsonb_array_length(ingredient_snapshot) between 1 and 12
    and pg_column_size(ingredient_snapshot) <= 8192
  ),
  output_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  output_item_slug text not null,
  output_item_name text not null,
  output_quantity integer not null check (output_quantity between 1 and 10000),
  duration_seconds integer not null check (duration_seconds between 1 and 2592000),
  dust_fee bigint not null default 0 check (dust_fee between 0 and 9000000000000000),
  ingredient_settlement_reference text not null,
  output_settlement_reference text,
  dust_settlement_reference text,
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  ),
  state_version integer not null default 1 check (state_version > 0),
  safe_failure_code text check (
    safe_failure_code is null or safe_failure_code ~ '^[A-Z][A-Z0-9_]{2,79}$'
  ),
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata) = 'object' and pg_column_size(safe_metadata) <= 4096
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_profile_id, id),
  unique (player_profile_id, idempotency_key),
  foreign key (player_profile_id, workstation_instance_id)
    references public.player_home_workstations(player_profile_id, id) on delete restrict,
  foreign key (player_home_id, workstation_instance_id)
    references public.player_home_workstations(player_home_id, id) on delete restrict,
  check (completes_at > started_at),
  check (
    (status in ('pending','running','ready','blocked') and collected_at is null and canceled_at is null)
    or (status = 'collecting' and collected_at is null and canceled_at is null)
    or (status = 'collected' and collected_at is not null and output_settlement_reference is not null and canceled_at is null)
    or (status = 'canceled' and canceled_at is not null and collected_at is null)
    or (status = 'failed' and failed_at is not null and collected_at is null)
  )
);

create table public.cozy_crafting_action_cooldowns (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  action_key text not null check (action_key in ('start','collect','tutorial_turn_in')),
  last_action_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (player_profile_id, action_key)
);

create table public.cozy_crafting_job_events (
  id uuid primary key default gen_random_uuid(),
  event_number bigint generated always as identity unique,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  player_home_id uuid not null references public.player_homes(id) on delete restrict,
  crafting_job_id uuid not null references public.player_crafting_jobs(id) on delete restrict,
  event_key text not null check (event_key in (
    'job_started','job_ready','collection_blocked','job_collected','job_failed','job_reconciled'
  )),
  request_id text not null check (char_length(request_id) between 1 and 128),
  safe_payload jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_payload) = 'object' and pg_column_size(safe_payload) <= 4096
  ),
  created_at timestamptz not null default now()
);

create table public.cozy_crafting_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  crafting_job_id uuid not null references public.player_crafting_jobs(id) on delete restrict,
  reconciliation_type text not null check (reconciliation_type in (
    'persist_ready','impossible_state','collection_settlement_review','notification_retry'
  )),
  status text not null default 'pending' check (status in ('pending','processing','resolved','failed','manual_review')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  available_at timestamptz not null default now(),
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{2,79}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crafting_job_id, reconciliation_type)
);

alter table public.cozy_quest_versions
  alter column starter_seed_quantity drop not null,
  alter column delivery_quantity drop not null,
  alter column starter_hoe_item_definition_id drop not null,
  alter column starter_watering_can_item_definition_id drop not null,
  alter column starter_seed_item_definition_id drop not null,
  alter column delivery_item_definition_id drop not null,
  add column quest_kind text not null default 'farming_tutorial'
    check (quest_kind in ('farming_tutorial','workstation_tutorial')),
  add column required_quest_definition_id uuid
    references public.cozy_quest_definitions(id) on delete restrict,
  add column tutorial_cooking_recipe_definition_id uuid
    references public.cozy_recipe_definitions(id) on delete restrict,
  add column tutorial_crafting_recipe_definition_id uuid
    references public.cozy_recipe_definitions(id) on delete restrict;

alter table public.cozy_quest_versions
  add constraint cozy_quest_versions_kind_payload_check check (
    (quest_kind = 'farming_tutorial'
      and starter_seed_quantity is not null and delivery_quantity is not null
      and starter_hoe_item_definition_id is not null
      and starter_watering_can_item_definition_id is not null
      and starter_seed_item_definition_id is not null
      and delivery_item_definition_id is not null
      and required_quest_definition_id is null
      and tutorial_cooking_recipe_definition_id is null
      and tutorial_crafting_recipe_definition_id is null)
    or
    (quest_kind = 'workstation_tutorial'
      and starter_seed_quantity is null and delivery_quantity is null
      and starter_hoe_item_definition_id is null
      and starter_watering_can_item_definition_id is null
      and starter_seed_item_definition_id is null
      and delivery_item_definition_id is null
      and required_quest_definition_id is not null
      and tutorial_cooking_recipe_definition_id is not null
      and tutorial_crafting_recipe_definition_id is not null)
  );

alter table public.cozy_quest_objectives
  drop constraint cozy_quest_objectives_objective_key_check;
alter table public.cozy_quest_objectives
  add constraint cozy_quest_objectives_objective_key_check check (objective_key in (
    'meet_guide', 'receive_starter_kit', 'enter_home_plot', 'prepare_soil',
    'plant_crops', 'water_crops', 'harvest_crop', 'deliver_produce', 'receive_reward',
    'speak_with_guide', 'unlock_cooking_recipe', 'collect_cooked_item',
    'unlock_crafting_recipe', 'collect_crafted_item', 'return_to_guide'
  ));

alter table public.player_quest_events
  drop constraint player_quest_events_event_key_check;
alter table public.player_quest_events
  add constraint player_quest_events_event_key_check check (event_key in (
    'quest_accepted', 'starter_kit_granted', 'plot_entered', 'soil_prepared',
    'crop_planted', 'crop_watered', 'crop_harvested',
    'tutorial_produce_delivered', 'tutorial_reward_settled',
    'workstation_tutorial_accepted', 'cooking_recipe_unlocked',
    'cooked_output_collected', 'crafting_recipe_unlocked',
    'crafted_output_collected', 'workstation_tutorial_returned',
    'workstation_tutorial_reward_settled'
  ));

create table public.cozy_active_workstation_tutorial_versions (
  quest_definition_id uuid primary key references public.cozy_quest_definitions(id) on delete restrict,
  quest_version_id uuid not null unique references public.cozy_quest_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

insert into public.cozy_quest_definitions (id, slug)
values ('b1100000-0000-4000-8000-000000000201', 'hearth-and-hands')
on conflict (id) do nothing;

insert into public.cozy_quest_versions (
  id, quest_definition_id, version_number, lifecycle_status, name, description,
  starter_seed_quantity, delivery_quantity, reward_dust,
  starter_hoe_item_definition_id, starter_watering_can_item_definition_id,
  starter_seed_item_definition_id, delivery_item_definition_id,
  active, published_at, quest_kind, required_quest_definition_id,
  tutorial_cooking_recipe_definition_id, tutorial_crafting_recipe_definition_id
) values (
  'b1100000-0000-4000-8000-000000000202',
  'b1100000-0000-4000-8000-000000000201', 1, 'published',
  'Hearth and Hands',
  'Cook Garden Soup, craft Garden Twine, and return to Willow Guide.',
  null, null, 20, null, null, null, null, false, now(),
  'workstation_tutorial',
  'a1100000-0000-4000-8000-000000000031',
  'b1100000-0000-4000-8000-000000000011',
  '73000000-0000-4000-8000-000000000005'
)
on conflict (id) do nothing;

insert into public.cozy_active_workstation_tutorial_versions(
  quest_definition_id,quest_version_id
) values(
  'b1100000-0000-4000-8000-000000000201',
  'b1100000-0000-4000-8000-000000000202'
)
on conflict (quest_definition_id) do nothing;

insert into public.cozy_quest_objectives (
  id, quest_version_id, objective_key, sequence_number, label, required_count
) values
  ('b1100000-0000-4000-8000-000000000211','b1100000-0000-4000-8000-000000000202','speak_with_guide',1,'Speak with Willow Guide after the farming tutorial',1),
  ('b1100000-0000-4000-8000-000000000212','b1100000-0000-4000-8000-000000000202','unlock_cooking_recipe',2,'Unlock Garden Soup',1),
  ('b1100000-0000-4000-8000-000000000213','b1100000-0000-4000-8000-000000000202','collect_cooked_item',3,'Cook and collect one Garden Soup',1),
  ('b1100000-0000-4000-8000-000000000214','b1100000-0000-4000-8000-000000000202','unlock_crafting_recipe',4,'Unlock Garden Twine',1),
  ('b1100000-0000-4000-8000-000000000215','b1100000-0000-4000-8000-000000000202','collect_crafted_item',5,'Craft and collect one Garden Twine',1),
  ('b1100000-0000-4000-8000-000000000216','b1100000-0000-4000-8000-000000000202','return_to_guide',6,'Return to Willow Guide',1),
  ('b1100000-0000-4000-8000-000000000217','b1100000-0000-4000-8000-000000000202','receive_reward',7,'Receive the tutorial continuation reward',1)
on conflict (id) do nothing;

insert into public.economy_source_versions (
  id, source_key, version_number, lifecycle_status, operation_key, category,
  label, description, minimum_amount, maximum_amount, repeatable,
  daily_limit, weekly_limit, account_lifetime_limit, wallet_daily_limit,
  cooldown_seconds, beginner_protected, risk_weight, published_at
) values (
  'b1100000-0000-4000-8000-000000000221',
  'starter-workstation-tutorial', 1, 'published',
  'starter_workstation_quest_reward', 'gameplay_reward',
  'Starter workstation tutorial',
  'One bounded server-authoritative DUST reward for completing Hearth and Hands.',
  20, 20, false, 1, 1, 1, 1, 0, true, 2, now()
)
on conflict (id) do nothing;

insert into public.economy_active_source_versions (source_key, source_version_id)
values ('starter-workstation-tutorial', 'b1100000-0000-4000-8000-000000000221')
on conflict (source_key) do update set
  source_version_id = excluded.source_version_id,
  activated_at = now();

insert into public.economy_sink_versions (
  id, sink_key, version_number, lifecycle_status, operation_key, category,
  label, description, minimum_amount, maximum_amount, reversible_by_refund,
  beginner_protected, published_at
) values (
  'b1100000-0000-4000-8000-000000000222',
  'crafting-fee', 2, 'published', 'crafting_fee', 'crafting_cost',
  'Crafting fee',
  'Optional versioned workstation fees consumed atomically when a crafting job starts.',
  1, 1000000, true, true, now()
)
on conflict (id) do nothing;

insert into public.economy_active_sink_versions (sink_key, sink_version_id)
values ('crafting-fee', 'b1100000-0000-4000-8000-000000000222')
on conflict (sink_key) do update set
  sink_version_id = excluded.sink_version_id,
  activated_at = now();

insert into public.admin_permissions (key, name, description, category, is_sensitive, is_system)
values
  ('crafting.read', 'Read recipes and crafting jobs', 'Inspect recipe versions, workstations, queues, jobs, and bounded telemetry.', 'gameplay', false, true),
  ('crafting.player_read', 'Read player crafting state', 'Inspect one player workstation jobs and tutorial continuation.', 'gameplay', true, true),
  ('crafting.content_manage', 'Manage recipes and workstations', 'Create immutable recipe successors and update bounded workstation policy.', 'gameplay', true, true),
  ('crafting.liveops', 'Manage crafting live operations', 'Pause starts, collection, fees, unlocks, or rewards with AAL2 and audit evidence.', 'gameplay', true, true),
  ('crafting.job_reconcile', 'Reconcile crafting jobs', 'Request bounded evidence-preserving job reconciliation.', 'gameplay', true, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

with mapping(role_key, permission_key) as (values
  ('super_admin', 'crafting.read'),
  ('super_admin', 'crafting.player_read'),
  ('super_admin', 'crafting.content_manage'),
  ('super_admin', 'crafting.liveops'),
  ('super_admin', 'crafting.job_reconcile'),
  ('game_administrator', 'crafting.read'),
  ('game_administrator', 'crafting.player_read'),
  ('game_administrator', 'crafting.content_manage'),
  ('game_administrator', 'crafting.liveops'),
  ('game_administrator', 'crafting.job_reconcile'),
  ('live_operations_manager', 'crafting.read'),
  ('live_operations_manager', 'crafting.player_read'),
  ('live_operations_manager', 'crafting.content_manage'),
  ('live_operations_manager', 'crafting.liveops'),
  ('live_operations_manager', 'crafting.job_reconcile'),
  ('content_manager', 'crafting.read'),
  ('content_manager', 'crafting.content_manage'),
  ('customer_support', 'crafting.read'),
  ('customer_support', 'crafting.player_read'),
  ('read_only_analyst', 'crafting.read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles role on role.key=mapping.role_key
join public.admin_permissions permission on permission.key=mapping.permission_key
on conflict do nothing;

create index player_home_workstations_home_idx
  on public.player_home_workstations(player_home_id, enabled, world_object_id);
create index cozy_recipe_versions_definition_idx
  on public.cozy_recipe_versions(recipe_definition_id, version_number desc);
create index player_recipe_unlocks_player_idx
  on public.player_recipe_unlocks(player_profile_id, unlocked_at desc);
create index player_crafting_jobs_queue_idx
  on public.player_crafting_jobs(player_profile_id, workstation_instance_id, status, completes_at);
create index player_crafting_jobs_ready_idx
  on public.player_crafting_jobs(completes_at, id)
  where status = 'running';
create index cozy_crafting_job_events_player_idx
  on public.cozy_crafting_job_events(player_profile_id, event_number desc);
create index cozy_crafting_reconciliation_pending_idx
  on public.cozy_crafting_reconciliation_queue(status, available_at)
  where status in ('pending','failed');

create trigger cozy_workstation_definitions_set_updated_at
before update on public.cozy_workstation_definitions
for each row execute function private.set_updated_at();
create trigger player_home_workstations_set_updated_at
before update on public.player_home_workstations
for each row execute function private.set_updated_at();
create trigger cozy_crafting_settings_set_updated_at
before update on public.cozy_crafting_settings
for each row execute function private.set_updated_at();
create trigger player_crafting_jobs_set_updated_at
before update on public.player_crafting_jobs
for each row execute function private.set_updated_at();
create trigger cozy_crafting_action_cooldowns_set_updated_at
before update on public.cozy_crafting_action_cooldowns
for each row execute function private.set_updated_at();
create trigger cozy_crafting_reconciliation_queue_set_updated_at
before update on public.cozy_crafting_reconciliation_queue
for each row execute function private.set_updated_at();

create trigger cozy_recipe_versions_immutable
before update or delete on public.cozy_recipe_versions
for each row execute function private.reject_cozy_append_only_mutation();
create trigger cozy_recipe_version_ingredients_immutable
before update or delete on public.cozy_recipe_version_ingredients
for each row execute function private.reject_cozy_append_only_mutation();
create trigger player_recipe_unlocks_append_only
before update or delete on public.player_recipe_unlocks
for each row execute function private.reject_cozy_append_only_mutation();
create trigger cozy_crafting_job_events_append_only
before update or delete on public.cozy_crafting_job_events
for each row execute function private.reject_cozy_append_only_mutation();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'cozy_workstation_definitions','cozy_home_workstation_templates',
    'player_home_workstations','cozy_recipe_versions',
    'cozy_recipe_version_ingredients','cozy_active_recipe_versions',
    'player_recipe_unlocks','cozy_crafting_settings','player_crafting_jobs',
    'cozy_active_workstation_tutorial_versions',
    'cozy_crafting_action_cooldowns','cozy_crafting_job_events',
    'cozy_crafting_reconciliation_queue'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role', table_name);
  end loop;
end;
$$;
