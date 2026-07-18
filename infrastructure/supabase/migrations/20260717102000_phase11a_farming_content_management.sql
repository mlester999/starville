-- Starville Phase 11A: bounded farming content management.
-- Existing player plots, planted crops, accepted quests, inventory quantities,
-- and DUST balances are never rewritten by these administrator operations.

insert into public.admin_permissions (key, name, description, category, is_sensitive, is_system)
values
  (
    'farming.content_manage',
    'Manage farming content',
    'Create audited successor plot and quest versions and safely revise item and crop definitions.',
    'gameplay',
    true,
    true
  ),
  (
    'farming.reward_manage',
    'Manage farming rewards',
    'Change the starter quest DUST reward with paired economy-source versioning and audit evidence.',
    'economy',
    true,
    true
  )
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

with mapping(role_key, permission_key) as (
  values
    ('super_admin', 'farming.content_manage'),
    ('super_admin', 'farming.reward_manage'),
    ('game_administrator', 'farming.content_manage'),
    ('economy_manager', 'farming.read'),
    ('economy_manager', 'farming.liveops'),
    ('content_manager', 'farming.content_manage'),
    ('content_manager', 'farming.read'),
    ('economy_manager', 'farming.reward_manage')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles role on role.key = mapping.role_key
join public.admin_permissions permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

alter table public.cozy_farming_admin_audit_events
  drop constraint cozy_farming_admin_audit_events_action_key_check,
  add constraint cozy_farming_admin_audit_events_action_key_check check (
    action_key in (
      'farming.liveops_updated',
      'farming.item_updated',
      'farming.crop_updated',
      'farming.plot_template_successor_created',
      'farming.quest_successor_created'
    )
  );

create table public.cozy_active_home_templates (
  logical_slug text primary key check (
    char_length(logical_slug) between 1 and 80
    and logical_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  home_template_id uuid not null unique
    references public.cozy_home_templates(id) on delete restrict,
  activated_at timestamptz not null default now()
);

insert into public.cozy_active_home_templates (logical_slug, home_template_id)
select 'starter-cottage-interior', template.id
from public.cozy_home_templates template
where template.slug = 'starter-cottage-interior'
on conflict (logical_slug) do nothing;

alter table public.cozy_active_home_templates enable row level security;
alter table public.cozy_active_home_templates force row level security;
revoke all on table public.cozy_active_home_templates from public, anon, authenticated, service_role;

drop index if exists public.cozy_quest_versions_one_published_idx;

create or replace function private.cozy_admin_item_json(item public.cozy_item_definitions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'definition', private.cozy_item_json(item),
    'referenceImpact', jsonb_build_object(
      'inventoryStackCount', (
        select count(*) from public.player_inventory_stacks stack
        where stack.item_definition_id = item.id
      ),
      'cropDefinitionCount', (
        select count(*) from public.cozy_crop_definitions crop
        where crop.seed_item_definition_id = item.id
           or crop.harvest_item_definition_id = item.id
      ),
      'questVersionCount', (
        select count(*) from public.cozy_quest_versions version
        where version.starter_hoe_item_definition_id = item.id
           or version.starter_watering_can_item_definition_id = item.id
           or version.starter_seed_item_definition_id = item.id
           or version.delivery_item_definition_id = item.id
      ),
      'recipeCount', (
        select count(distinct referenced.recipe_id)
        from (
          select recipe.id as recipe_id
          from public.cozy_recipe_definitions recipe
          where recipe.output_item_definition_id = item.id
          union all
          select ingredient.recipe_definition_id
          from public.cozy_recipe_ingredients ingredient
          where ingredient.item_definition_id = item.id
        ) referenced
      ),
      'shopOfferCount', (
        select count(*) from public.cozy_shop_offers offer
        where offer.item_definition_id = item.id
      ),
      'furnitureDefinitionCount', (
        select count(*) from public.cozy_furniture_definitions furniture
        where furniture.item_definition_id = item.id
      )
    )
  );
$$;

create or replace function private.cozy_admin_crop_json(crop public.cozy_crop_definitions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'definition', private.cozy_crop_json(crop),
    'wateringPolicy', crop.watering_policy,
    'tutorialEligible', crop.tutorial_eligible,
    'localGrowthDurationSeconds', crop.local_growth_duration_seconds,
    'productionGrowthDurationSeconds', crop.growth_duration_seconds,
    'configurationRevision', crop.configuration_revision,
    'activeInstanceCount', (
      select count(*) from public.player_home_crop_instances instance
      where instance.crop_definition_id = crop.id and instance.status <> 'harvested'
    ),
    'referenceImpact', jsonb_build_object(
      'activeInstanceCount', (
        select count(*) from public.player_home_crop_instances instance
        where instance.crop_definition_id = crop.id and instance.status <> 'harvested'
      ),
      'questVersionCount', (
        select count(*)
        from public.cozy_quest_versions version
        where version.starter_seed_item_definition_id = crop.seed_item_definition_id
           or version.delivery_item_definition_id = crop.harvest_item_definition_id
      )
    )
  );
$$;

create or replace function private.cozy_admin_plot_template_json(
  template public.cozy_home_templates
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tile_count integer;
  invalid_tile_count integer;
  duplicate_count integer;
  errors text[] := array[]::text[];
begin
  select count(*) into tile_count
  from public.cozy_home_farm_tile_templates tile
  where tile.home_template_id = template.id
    and tile.template_version = template.template_version
    and tile.active;

  select count(*) into invalid_tile_count
  from public.cozy_home_farm_tile_templates tile
  where tile.home_template_id = template.id
    and tile.template_version = template.template_version
    and tile.active
    and (
      tile.grid_x < template.min_x or tile.grid_x >= template.max_x
      or tile.grid_y < template.min_y or tile.grid_y >= template.max_y
      or template.blocked_cells @> jsonb_build_array(
        jsonb_build_object('x', tile.grid_x, 'y', tile.grid_y)
      )
    );

  select count(*) - count(distinct (tile.grid_x, tile.grid_y)) into duplicate_count
  from public.cozy_home_farm_tile_templates tile
  where tile.home_template_id = template.id
    and tile.template_version = template.template_version
    and tile.active;

  if tile_count <> 8 then errors := array_append(errors, 'Starter templates require eight active farming tiles.'); end if;
  if invalid_tile_count > 0 then errors := array_append(errors, 'Farming tiles must be in bounds and outside blocked cells.'); end if;
  if duplicate_count > 0 then errors := array_append(errors, 'Farming tile positions must be unique.'); end if;

  return jsonb_build_object(
    'template', private.cozy_home_template_json(template),
    'tiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tile.id,
        'tileKey', tile.tile_key,
        'slot', tile.slot,
        'x', tile.grid_x,
        'y', tile.grid_y
      ) order by tile.slot)
      from public.cozy_home_farm_tile_templates tile
      where tile.home_template_id = template.id
        and tile.template_version = template.template_version
        and tile.active
    ), '[]'::jsonb),
    'activePlotCount', (
      select count(*) from public.player_homes home
      where home.template_id = template.id and home.lifecycle_status = 'active'
    ),
    'activeForProvisioning', exists(
      select 1 from public.cozy_active_home_templates active
      where active.logical_slug = 'starter-cottage-interior'
        and active.home_template_id = template.id
    ),
    'worldAssetRefs', '[]'::jsonb,
    'validation', jsonb_build_object(
      'valid', cardinality(errors) = 0,
      'errors', to_jsonb(errors)
    )
  );
end;
$$;

create or replace function private.cozy_admin_quest_json(version public.cozy_quest_versions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'definitionId', definition.id,
    'versionId', version.id,
    'slug', definition.slug,
    'name', version.name,
    'description', version.description,
    'versionNumber', version.version_number,
    'starterSeedQuantity', version.starter_seed_quantity,
    'deliveryQuantity', version.delivery_quantity,
    'rewardDust', version.reward_dust,
    'starterHoeItemId', version.starter_hoe_item_definition_id,
    'starterWateringCanItemId', version.starter_watering_can_item_definition_id,
    'starterSeedItemId', version.starter_seed_item_definition_id,
    'deliveryItemId', version.delivery_item_definition_id,
    'active', version.active,
    'objectives', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', objective.objective_key,
        'label', objective.label,
        'required', objective.required_count
      ) order by objective.sequence_number)
      from public.cozy_quest_objectives objective
      where objective.quest_version_id = version.id
    ), '[]'::jsonb),
    'acceptedCount', (
      select count(*) from public.player_quest_instances instance
      where instance.quest_version_id = version.id
    ),
    'completionCount', (
      select count(*) from public.player_quest_instances instance
      where instance.quest_version_id = version.id and instance.status = 'reward_claimed'
    ),
    'settlementFailureCount', (
      select count(*) from public.player_quest_instances instance
      where instance.quest_version_id = version.id and instance.last_error_code is not null
    ),
    'activeForNewPlayers', version.id = (
      select current.id
      from public.cozy_quest_versions current
      where current.quest_definition_id = version.quest_definition_id
        and current.lifecycle_status = 'published'
        and current.active
      order by current.version_number desc
      limit 1
    )
  )
  from public.cozy_quest_definitions definition
  where definition.id = version.quest_definition_id;
$$;

create or replace function private.ensure_player_home(p_player_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  home public.player_homes%rowtype;
  starter_furniture public.cozy_furniture_definitions%rowtype;
  grant_key text;
begin
  select * into strict profile
  from public.player_profiles where id = p_player_profile_id for update;

  insert into public.player_homes (
    player_profile_id,
    template_id,
    return_world_map_id,
    return_map_version_id,
    return_position_x,
    return_position_y,
    return_facing_direction,
    current_position_x,
    current_position_y
  )
  select
    profile.id,
    template.id,
    map.id,
    coalesce(profile.current_map_version_id, map.active_published_version_id),
    profile.safe_position_x,
    profile.safe_position_y,
    profile.facing_direction,
    template.spawn_x,
    template.spawn_y
  from public.cozy_active_home_templates active
  join public.cozy_home_templates template on template.id = active.home_template_id
  join public.world_maps map on map.slug = profile.current_map_id
  where active.logical_slug = 'starter-cottage-interior' and template.active
  on conflict (player_profile_id) do nothing;

  select * into strict home
  from public.player_homes where player_profile_id = profile.id for update;
  if home.starter_furniture_granted_at is null then
    select * into strict starter_furniture
    from public.cozy_furniture_definitions where slug = 'willow-chair';
    grant_key := 'phase7-starter-furniture:' || profile.id::text;
    if not private.cozy_add_item(
      profile.id,
      starter_furniture.item_definition_id,
      1,
      'starter_grant',
      home.id::text,
      grant_key,
      grant_key
    ) then
      raise exception using errcode = '23514', message = 'STARTER_FURNITURE_GRANT_FAILED';
    end if;
    update public.player_homes
    set starter_furniture_granted_at = now(), state_version = state_version + 1
    where id = home.id;
  end if;
end;
$$;

create or replace function private.cozy_starter_quest_json(p_player_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  version public.cozy_quest_versions%rowtype;
  definition public.cozy_quest_definitions%rowtype;
  instance public.player_quest_instances%rowtype;
  receipt text;
begin
  select * into strict definition
  from public.cozy_quest_definitions
  where slug = 'first-moonbean-harvest';

  select * into instance
  from public.player_quest_instances
  where player_profile_id = p_player_profile_id
    and quest_definition_id = definition.id;

  if found then
    select * into strict version
    from public.cozy_quest_versions
    where id = instance.quest_version_id;
  else
    select * into strict version
    from public.cozy_quest_versions
    where quest_definition_id = definition.id
      and lifecycle_status = 'published'
      and active
    order by version_number desc
    limit 1;
  end if;

  if instance.id is not null and instance.reward_ledger_entry_id is not null then
    select public_receipt_id into receipt
    from public.player_dust_ledger
    where id = instance.reward_ledger_entry_id;
  end if;

  return jsonb_build_object(
    'definitionId', definition.id,
    'versionId', version.id,
    'instanceId', case when instance.id is null then null else instance.id end,
    'slug', definition.slug,
    'name', version.name,
    'description', version.description,
    'status', case when instance.id is null then 'available' else instance.status end,
    'objectives', (
      select jsonb_agg(jsonb_build_object(
        'key', objective.objective_key,
        'label', objective.label,
        'current', coalesce(progress.current_count, 0),
        'required', objective.required_count,
        'completed', coalesce(progress.current_count, 0) >= objective.required_count
      ) order by objective.sequence_number)
      from public.cozy_quest_objectives objective
      left join public.player_quest_objective_progress progress
        on progress.quest_objective_id = objective.id
       and progress.player_quest_instance_id = instance.id
      where objective.quest_version_id = version.id
    ),
    'starterSeedQuantity', version.starter_seed_quantity,
    'deliveryQuantity', version.delivery_quantity,
    'rewardDust', version.reward_dust,
    'stateVersion', coalesce(instance.state_version, 0),
    'acceptedAt', instance.accepted_at,
    'completedAt', instance.completed_at,
    'rewardReceiptId', receipt
  );
end;
$$;

create or replace function public.get_admin_farming_content(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  active_template public.cozy_home_templates%rowtype;
  active_quest public.cozy_quest_versions%rowtype;
begin
  perform private.assert_verified_admin_permission(
    p_user_id,
    p_auth_session_id,
    p_assurance_level,
    'farming.read'
  );

  select template.* into strict active_template
  from public.cozy_active_home_templates active
  join public.cozy_home_templates template on template.id = active.home_template_id
  where active.logical_slug = 'starter-cottage-interior';

  select * into strict active_quest
  from public.cozy_quest_versions version
  where version.lifecycle_status = 'published' and version.active
  order by version.version_number desc
  limit 1;

  return jsonb_build_object(
    'status', 'loaded',
    'settings', private.cozy_farming_live_ops_json(),
    'items', coalesce((
      select jsonb_agg(private.cozy_admin_item_json(item) order by item.category, item.name)
      from public.cozy_item_definitions item
      where item.category in ('permanent_tool', 'seed', 'crop')
    ), '[]'::jsonb),
    'crops', coalesce((
      select jsonb_agg(private.cozy_admin_crop_json(crop) order by crop.name)
      from public.cozy_crop_definitions crop
    ), '[]'::jsonb),
    'plotTemplate', private.cozy_admin_plot_template_json(active_template),
    'plotTemplateVersions', coalesce((
      select jsonb_agg(
        private.cozy_admin_plot_template_json(template)
        order by template.template_version desc
      )
      from public.cozy_home_templates template
      where template.slug = 'starter-cottage-interior'
         or template.slug ~ '^starter-cottage-interior-v[0-9]+$'
    ), '[]'::jsonb),
    'quest', private.cozy_admin_quest_json(active_quest),
    'questVersions', coalesce((
      select jsonb_agg(private.cozy_admin_quest_json(version) order by version.version_number desc)
      from public.cozy_quest_versions version
      where version.quest_definition_id = active_quest.quest_definition_id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'actionKey', event.action_key,
        'reason', event.reason,
        'requestId', event.request_id,
        'createdAt', event.created_at
      ) order by event.created_at desc)
      from (
        select * from public.cozy_farming_admin_audit_events
        order by created_at desc
        limit 50
      ) event
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_admin_farming_item(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_item_id uuid,
  p_expected_content_version integer,
  p_definition jsonb,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  trusted_session_id uuid;
  item public.cozy_item_definitions%rowtype;
  prior public.cozy_farming_admin_audit_events%rowtype;
  before_state jsonb;
  after_state jsonb;
  dependency_count integer;
  maximum_owned_quantity integer;
  next_category text;
  next_metadata jsonb;
  next_stackable boolean;
  next_max_stack_size integer;
  next_buy_eligible boolean;
  next_sell_eligible boolean;
  next_giftable boolean;
  next_tradable boolean;
  next_account_bound boolean;
  next_permanent_tool boolean;
  next_minimum_transfer integer;
  next_maximum_transfer integer;
  next_buy_price bigint;
  next_sell_price bigint;
  next_asset_ref text;
  next_asset_readiness text;
  next_active boolean;
begin
  trusted_session_id := private.assert_verified_admin_permission(
    p_user_id,
    p_auth_session_id,
    p_assurance_level,
    'farming.content_manage'
  );

  if p_item_id is null
     or p_expected_content_version is null or p_expected_content_version < 1
     or p_definition is null or jsonb_typeof(p_definition) <> 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(p_definition) key)
       <> array[
         'accountBound', 'active', 'assetReadiness', 'assetRef', 'buyEligible',
         'category', 'defaultBuyPrice', 'defaultSellPrice', 'description', 'giftable',
         'maxStackSize', 'maximumTransferQuantity', 'metadata', 'minimumTransferQuantity',
         'name', 'permanentTool', 'sellEligible', 'stackable', 'tradable'
       ]::text[]
     or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_ITEM_UPDATE';
  end if;

  select * into prior
  from public.cozy_farming_admin_audit_events
  where administrator_user_id = p_user_id and request_id = p_request_id;
  if found then
    if prior.action_key <> 'farming.item_updated' then
      return jsonb_build_object('status', 'request_already_processed');
    end if;
    return jsonb_build_object(
      'status', 'replayed',
      'item', prior.after_state,
      'replayed', true
    );
  end if;

  begin
    next_category := p_definition ->> 'category';
    next_metadata := p_definition -> 'metadata';
    next_stackable := (p_definition ->> 'stackable')::boolean;
    next_max_stack_size := (p_definition ->> 'maxStackSize')::integer;
    next_buy_eligible := (p_definition ->> 'buyEligible')::boolean;
    next_sell_eligible := (p_definition ->> 'sellEligible')::boolean;
    next_giftable := (p_definition ->> 'giftable')::boolean;
    next_tradable := (p_definition ->> 'tradable')::boolean;
    next_account_bound := (p_definition ->> 'accountBound')::boolean;
    next_permanent_tool := (p_definition ->> 'permanentTool')::boolean;
    next_minimum_transfer := (p_definition ->> 'minimumTransferQuantity')::integer;
    next_maximum_transfer := (p_definition ->> 'maximumTransferQuantity')::integer;
    next_buy_price := case when p_definition -> 'defaultBuyPrice' = 'null'::jsonb
      then null else (p_definition ->> 'defaultBuyPrice')::bigint end;
    next_sell_price := case when p_definition -> 'defaultSellPrice' = 'null'::jsonb
      then null else (p_definition ->> 'defaultSellPrice')::bigint end;
    next_asset_ref := case when p_definition -> 'assetRef' = 'null'::jsonb
      then null else p_definition ->> 'assetRef' end;
    next_asset_readiness := p_definition ->> 'assetReadiness';
    next_active := (p_definition ->> 'active')::boolean;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_ITEM_UPDATE';
  end;

  if char_length(p_definition ->> 'name') not between 1 and 80
     or p_definition ->> 'name' <> btrim(p_definition ->> 'name')
     or p_definition ->> 'name' ~ '[[:cntrl:]<>]'
     or char_length(p_definition ->> 'description') not between 1 and 280
     or p_definition ->> 'description' <> btrim(p_definition ->> 'description')
     or p_definition ->> 'description' ~ '[[:cntrl:]<>]'
     or next_category not in (
       'seed', 'crop', 'ingredient', 'cooked_food', 'crafted_material',
       'furniture', 'permanent_tool', 'special'
     )
     or not private.valid_cozy_item_metadata(next_category, next_metadata)
     or next_max_stack_size not between 1 and 999
     or (not next_stackable and next_max_stack_size <> 1)
     or next_minimum_transfer not between 1 and 999
     or next_maximum_transfer not between next_minimum_transfer and 999
     or ((not next_giftable and not next_tradable) and next_maximum_transfer <> 1)
     or (next_buy_eligible <> (next_buy_price is not null))
     or (next_sell_eligible <> (next_sell_price is not null))
     or next_asset_readiness not in ('approved', 'development_marker', 'missing')
     or (next_asset_readiness = 'approved' and next_asset_ref is null)
     or (next_asset_ref is not null and (
       char_length(next_asset_ref) not between 1 and 80
       or next_asset_ref !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     ))
     or (
       next_category = 'permanent_tool'
       and (
         next_stackable or next_buy_eligible or next_sell_eligible
         or next_giftable or next_tradable or not next_account_bound
         or not next_permanent_tool
       )
     )
     or (next_category <> 'permanent_tool' and next_permanent_tool) then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_ITEM_UPDATE';
  end if;

  select * into item
  from public.cozy_item_definitions
  where id = p_item_id
  for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if item.content_version <> p_expected_content_version then
    return jsonb_build_object('status', 'state_conflict');
  end if;

  select
    (select count(*) from public.player_inventory_stacks stack
      where stack.item_definition_id = item.id)
    + (select count(*) from public.cozy_crop_definitions crop
      where crop.seed_item_definition_id = item.id
         or crop.harvest_item_definition_id = item.id)
    + (select count(*) from public.cozy_quest_versions version
      where version.starter_hoe_item_definition_id = item.id
         or version.starter_watering_can_item_definition_id = item.id
         or version.starter_seed_item_definition_id = item.id
         or version.delivery_item_definition_id = item.id)
    + (select count(*) from public.cozy_recipe_definitions recipe
      where recipe.output_item_definition_id = item.id)
    + (select count(*) from public.cozy_recipe_ingredients ingredient
      where ingredient.item_definition_id = item.id)
    + (select count(*) from public.cozy_shop_offers offer
      where offer.item_definition_id = item.id)
    + (select count(*) from public.cozy_furniture_definitions furniture
      where furniture.item_definition_id = item.id)
    + (select count(*) from public.cozy_gameplay_config config
      where config.starter_tool_item_definition_id = item.id)
  into dependency_count;

  if dependency_count > 0
     and (item.category <> next_category or item.metadata <> next_metadata) then
    return jsonb_build_object('status', 'reference_conflict');
  end if;

  if item.active and not next_active and (
    exists(
      select 1 from public.cozy_crop_definitions crop
      where crop.active and (
        crop.seed_item_definition_id = item.id
        or crop.harvest_item_definition_id = item.id
      )
    )
    or exists(
      select 1
      from public.cozy_quest_versions version
      where version.id = (
        select current.id
        from public.cozy_quest_versions current
        where current.lifecycle_status = 'published' and current.active
        order by current.version_number desc
        limit 1
      )
      and (
        version.starter_hoe_item_definition_id = item.id
        or version.starter_watering_can_item_definition_id = item.id
        or version.starter_seed_item_definition_id = item.id
        or version.delivery_item_definition_id = item.id
      )
    )
  ) then
    return jsonb_build_object('status', 'reference_conflict');
  end if;

  select coalesce(max(stack.quantity), 0) into maximum_owned_quantity
  from public.player_inventory_stacks stack
  where stack.item_definition_id = item.id;
  if maximum_owned_quantity > next_max_stack_size then
    return jsonb_build_object('status', 'stack_limit_conflict');
  end if;

  before_state := private.cozy_admin_item_json(item);
  update public.cozy_item_definitions set
    name = p_definition ->> 'name',
    description = p_definition ->> 'description',
    category = next_category,
    stackable = next_stackable,
    max_stack_size = next_max_stack_size,
    buy_eligible = next_buy_eligible,
    sell_eligible = next_sell_eligible,
    giftable = next_giftable,
    tradable = next_tradable,
    account_bound = next_account_bound,
    permanent_tool = next_permanent_tool,
    minimum_transfer_quantity = next_minimum_transfer,
    maximum_transfer_quantity = next_maximum_transfer,
    default_buy_price = next_buy_price,
    default_sell_price = next_sell_price,
    asset_ref = next_asset_ref,
    asset_readiness = next_asset_readiness,
    active = next_active,
    content_version = content_version + 1,
    metadata = next_metadata,
    updated_at = now()
  where id = item.id
  returning * into item;

  after_state := private.cozy_admin_item_json(item);
  insert into public.cozy_farming_admin_audit_events (
    administrator_user_id,
    admin_session_id,
    action_key,
    before_state,
    after_state,
    reason,
    request_id
  ) values (
    p_user_id,
    trusted_session_id,
    'farming.item_updated',
    before_state,
    after_state,
    p_reason,
    p_request_id
  );

  return jsonb_build_object('status', 'updated', 'item', after_state, 'replayed', false);
end;
$$;

create or replace function public.update_admin_farming_crop(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_crop_id uuid,
  p_expected_configuration_revision integer,
  p_definition jsonb,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  trusted_session_id uuid;
  crop public.cozy_crop_definitions%rowtype;
  seed public.cozy_item_definitions%rowtype;
  produce public.cozy_item_definitions%rowtype;
  prior public.cozy_farming_admin_audit_events%rowtype;
  before_state jsonb;
  after_state jsonb;
  seed_id uuid;
  produce_id uuid;
  next_asset_ref text;
  next_asset_readiness text;
begin
  trusted_session_id := private.assert_verified_admin_permission(
    p_user_id,
    p_auth_session_id,
    p_assurance_level,
    'farming.content_manage'
  );

  if p_crop_id is null
     or p_expected_configuration_revision is null or p_expected_configuration_revision < 1
     or p_definition is null or jsonb_typeof(p_definition) <> 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(p_definition) key)
       <> array[
         'active', 'assetReadiness', 'assetRef', 'description', 'deterministicYield',
         'growthStageCount', 'localGrowthDurationSeconds', 'name', 'produceItemId',
         'productionGrowthDurationSeconds', 'seedItemId', 'tutorialEligible', 'wateringPolicy'
       ]::text[]
     or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_CROP_UPDATE';
  end if;

  select * into prior
  from public.cozy_farming_admin_audit_events
  where administrator_user_id = p_user_id and request_id = p_request_id;
  if found then
    if prior.action_key <> 'farming.crop_updated' then
      return jsonb_build_object('status', 'request_already_processed');
    end if;
    return jsonb_build_object(
      'status', 'replayed',
      'crop', prior.after_state,
      'replayed', true
    );
  end if;

  begin
    seed_id := (p_definition ->> 'seedItemId')::uuid;
    produce_id := (p_definition ->> 'produceItemId')::uuid;
    next_asset_ref := case when p_definition -> 'assetRef' = 'null'::jsonb
      then null else p_definition ->> 'assetRef' end;
    next_asset_readiness := p_definition ->> 'assetReadiness';
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_CROP_UPDATE';
  end;

  if char_length(p_definition ->> 'name') not between 1 and 80
     or p_definition ->> 'name' <> btrim(p_definition ->> 'name')
     or p_definition ->> 'name' ~ '[[:cntrl:]<>]'
     or char_length(p_definition ->> 'description') not between 1 and 280
     or p_definition ->> 'description' <> btrim(p_definition ->> 'description')
     or p_definition ->> 'description' ~ '[[:cntrl:]<>]'
     or (p_definition ->> 'productionGrowthDurationSeconds')::integer not between 10 and 2592000
     or (p_definition ->> 'localGrowthDurationSeconds')::integer not between 1 and 3600
     or (p_definition ->> 'growthStageCount')::integer not between 2 and 8
     or (p_definition ->> 'deterministicYield')::integer not between 1 and 10000
     or p_definition ->> 'wateringPolicy' <> 'water_once_to_start'
     or next_asset_readiness not in ('approved', 'development_marker', 'missing')
     or (next_asset_readiness = 'approved' and next_asset_ref is null)
     or (next_asset_ref is not null and (
       char_length(next_asset_ref) not between 1 and 80
       or next_asset_ref !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     )) then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_CROP_UPDATE';
  end if;

  select * into crop
  from public.cozy_crop_definitions
  where id = p_crop_id
  for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if crop.configuration_revision <> p_expected_configuration_revision then
    return jsonb_build_object('status', 'state_conflict');
  end if;

  select * into seed
  from public.cozy_item_definitions
  where id = seed_id and category = 'seed' and active;
  if not found then return jsonb_build_object('status', 'reference_conflict'); end if;
  select * into produce
  from public.cozy_item_definitions
  where id = produce_id and category = 'crop' and active;
  if not found then return jsonb_build_object('status', 'reference_conflict'); end if;

  before_state := private.cozy_admin_crop_json(crop);
  update public.cozy_crop_definitions set
    name = p_definition ->> 'name',
    description = p_definition ->> 'description',
    seed_item_definition_id = seed.id,
    harvest_item_definition_id = produce.id,
    growth_duration_seconds = (p_definition ->> 'productionGrowthDurationSeconds')::integer,
    local_growth_duration_seconds = (p_definition ->> 'localGrowthDurationSeconds')::integer,
    growth_stage_count = (p_definition ->> 'growthStageCount')::integer,
    deterministic_yield = (p_definition ->> 'deterministicYield')::integer,
    watering_policy = p_definition ->> 'wateringPolicy',
    tutorial_eligible = (p_definition ->> 'tutorialEligible')::boolean,
    asset_ref = next_asset_ref,
    asset_readiness = next_asset_readiness,
    active = (p_definition ->> 'active')::boolean,
    content_version = content_version + 1,
    configuration_revision = configuration_revision + 1,
    updated_at = now()
  where id = crop.id
  returning * into crop;

  after_state := private.cozy_admin_crop_json(crop);
  insert into public.cozy_farming_admin_audit_events (
    administrator_user_id,
    admin_session_id,
    action_key,
    before_state,
    after_state,
    reason,
    request_id
  ) values (
    p_user_id,
    trusted_session_id,
    'farming.crop_updated',
    before_state,
    after_state,
    p_reason,
    p_request_id
  );

  return jsonb_build_object('status', 'updated', 'crop', after_state, 'replayed', false);
end;
$$;

create or replace function public.create_admin_farming_plot_template_successor(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_expected_template_id uuid,
  p_expected_template_version integer,
  p_definition jsonb,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  trusted_session_id uuid;
  active_pointer public.cozy_active_home_templates%rowtype;
  current_template public.cozy_home_templates%rowtype;
  successor public.cozy_home_templates%rowtype;
  prior public.cozy_farming_admin_audit_events%rowtype;
  before_state jsonb;
  after_state jsonb;
  next_version integer;
  blocked_cells jsonb;
  tiles jsonb;
  bounds jsonb;
  spawn jsonb;
  exit_point jsonb;
  invalid_count integer;
begin
  trusted_session_id := private.assert_verified_admin_permission(
    p_user_id,
    p_auth_session_id,
    p_assurance_level,
    'farming.content_manage'
  );

  if p_expected_template_id is null
     or p_expected_template_version is null or p_expected_template_version < 1
     or p_definition is null or jsonb_typeof(p_definition) <> 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(p_definition) key)
       <> array[
         'blockedCells', 'bounds', 'developmentArt', 'exit', 'name', 'spawn', 'tiles'
       ]::text[]
     or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
  end if;

  select * into prior
  from public.cozy_farming_admin_audit_events
  where administrator_user_id = p_user_id and request_id = p_request_id;
  if found then
    if prior.action_key <> 'farming.plot_template_successor_created' then
      return jsonb_build_object('status', 'request_already_processed');
    end if;
    return jsonb_build_object(
      'status', 'replayed',
      'plotTemplate', prior.after_state,
      'replayed', true
    );
  end if;

  blocked_cells := p_definition -> 'blockedCells';
  tiles := p_definition -> 'tiles';
  bounds := p_definition -> 'bounds';
  spawn := p_definition -> 'spawn';
  exit_point := p_definition -> 'exit';
  if char_length(p_definition ->> 'name') not between 1 and 80
     or p_definition ->> 'name' <> btrim(p_definition ->> 'name')
     or p_definition ->> 'name' ~ '[[:cntrl:]<>]'
     or jsonb_typeof(blocked_cells) <> 'array'
     or jsonb_array_length(blocked_cells) > 256
     or jsonb_typeof(tiles) <> 'array'
     or jsonb_array_length(tiles) <> 8
     or jsonb_typeof(bounds) <> 'object'
     or jsonb_typeof(spawn) <> 'object'
     or jsonb_typeof(exit_point) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
  end if;

  begin
    if (bounds ->> 'minX')::integer >= (bounds ->> 'maxX')::integer
       or (bounds ->> 'minY')::integer >= (bounds ->> 'maxY')::integer
       or (spawn ->> 'x')::integer not between (bounds ->> 'minX')::integer and (bounds ->> 'maxX')::integer - 1
       or (spawn ->> 'y')::integer not between (bounds ->> 'minY')::integer and (bounds ->> 'maxY')::integer - 1
       or (exit_point ->> 'x')::integer not between (bounds ->> 'minX')::integer and (bounds ->> 'maxX')::integer - 1
       or (exit_point ->> 'y')::integer not between (bounds ->> 'minY')::integer and (bounds ->> 'maxY')::integer - 1 then
      raise exception using errcode = '22023', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
  end;

  select count(*) into invalid_count
  from jsonb_array_elements(blocked_cells) cell
  where jsonb_typeof(cell) <> 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(cell) key)
       <> array['x', 'y']::text[];
  if invalid_count > 0 then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
  end if;

  begin
    select count(*) into invalid_count
    from jsonb_to_recordset(blocked_cells) as cell(x integer, y integer)
    where cell.x < (bounds ->> 'minX')::integer
       or cell.x >= (bounds ->> 'maxX')::integer
       or cell.y < (bounds ->> 'minY')::integer
       or cell.y >= (bounds ->> 'maxY')::integer;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
  end;
  if invalid_count > 0 then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
  end if;

  select count(*) into invalid_count
  from jsonb_array_elements(tiles) tile
  where jsonb_typeof(tile) <> 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(tile) key)
       <> array['slot', 'tileKey', 'x', 'y']::text[];
  if invalid_count > 0 then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
  end if;

  begin
    select count(*) into invalid_count
    from jsonb_to_recordset(tiles) as tile("tileKey" text, slot integer, x integer, y integer)
    where tile."tileKey" is null
       or char_length(tile."tileKey") not between 1 and 80
       or tile."tileKey" !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
       or tile.slot not between 1 and 64
       or tile.x < (bounds ->> 'minX')::integer
       or tile.x >= (bounds ->> 'maxX')::integer
       or tile.y < (bounds ->> 'minY')::integer
       or tile.y >= (bounds ->> 'maxY')::integer
       or blocked_cells @> jsonb_build_array(jsonb_build_object('x', tile.x, 'y', tile.y));
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
  end;
  if invalid_count > 0
     or (select count(distinct tile ->> 'tileKey') from jsonb_array_elements(tiles) tile) <> 8
     or (select count(distinct (tile ->> 'slot')::integer) from jsonb_array_elements(tiles) tile) <> 8
     or (select count(distinct ((tile ->> 'x')::integer, (tile ->> 'y')::integer))
       from jsonb_array_elements(tiles) tile) <> 8 then
    raise exception using errcode = '22023', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
  end if;

  select * into strict active_pointer
  from public.cozy_active_home_templates
  where logical_slug = 'starter-cottage-interior'
  for update;
  if active_pointer.home_template_id <> p_expected_template_id then
    return jsonb_build_object('status', 'state_conflict');
  end if;
  select * into strict current_template
  from public.cozy_home_templates
  where id = active_pointer.home_template_id
  for update;
  if current_template.template_version <> p_expected_template_version then
    return jsonb_build_object('status', 'state_conflict');
  end if;

  select coalesce(max(template.template_version), 0) + 1 into next_version
  from public.cozy_home_templates template
  where template.slug = 'starter-cottage-interior'
     or template.slug ~ '^starter-cottage-interior-v[0-9]+$';

  before_state := private.cozy_admin_plot_template_json(current_template);
  insert into public.cozy_home_templates (
    id,
    slug,
    name,
    template_version,
    min_x,
    min_y,
    max_x,
    max_y,
    spawn_x,
    spawn_y,
    exit_x,
    exit_y,
    blocked_cells,
    development_art,
    active
  ) values (
    gen_random_uuid(),
    'starter-cottage-interior-v' || next_version::text,
    p_definition ->> 'name',
    next_version,
    (bounds ->> 'minX')::integer,
    (bounds ->> 'minY')::integer,
    (bounds ->> 'maxX')::integer,
    (bounds ->> 'maxY')::integer,
    (spawn ->> 'x')::integer,
    (spawn ->> 'y')::integer,
    (exit_point ->> 'x')::integer,
    (exit_point ->> 'y')::integer,
    blocked_cells,
    (p_definition ->> 'developmentArt')::boolean,
    true
  ) returning * into successor;

  insert into public.cozy_home_farm_tile_templates (
    id,
    home_template_id,
    template_version,
    tile_key,
    slot,
    grid_x,
    grid_y,
    active
  )
  select
    gen_random_uuid(),
    successor.id,
    successor.template_version,
    tile."tileKey",
    tile.slot,
    tile.x,
    tile.y,
    true
  from jsonb_to_recordset(tiles) as tile("tileKey" text, slot integer, x integer, y integer);

  update public.cozy_active_home_templates
  set home_template_id = successor.id, activated_at = now()
  where logical_slug = 'starter-cottage-interior';

  after_state := private.cozy_admin_plot_template_json(successor);
  if not (after_state #>> '{validation,valid}')::boolean then
    raise exception using errcode = '23514', message = 'INVALID_FARMING_TEMPLATE_SUCCESSOR';
  end if;

  insert into public.cozy_farming_admin_audit_events (
    administrator_user_id,
    admin_session_id,
    action_key,
    before_state,
    after_state,
    reason,
    request_id
  ) values (
    p_user_id,
    trusted_session_id,
    'farming.plot_template_successor_created',
    before_state,
    after_state,
    p_reason,
    p_request_id
  );

  return jsonb_build_object(
    'status', 'updated',
    'plotTemplate', after_state,
    'replayed', false
  );
end;
$$;

create or replace function public.create_admin_starter_quest_successor(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_expected_version_id uuid,
  p_expected_version_number integer,
  p_definition jsonb,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  trusted_session_id uuid;
  current_version public.cozy_quest_versions%rowtype;
  successor public.cozy_quest_versions%rowtype;
  prior public.cozy_farming_admin_audit_events%rowtype;
  before_state jsonb;
  after_state jsonb;
  objectives jsonb;
  next_version integer;
  invalid_count integer;
  hoe public.cozy_item_definitions%rowtype;
  watering_can public.cozy_item_definitions%rowtype;
  seed public.cozy_item_definitions%rowtype;
  delivery public.cozy_item_definitions%rowtype;
  source public.economy_source_versions%rowtype;
  next_source_id uuid;
  next_source_version integer;
  minimum_reward bigint;
  maximum_reward bigint;
begin
  trusted_session_id := private.assert_verified_admin_permission(
    p_user_id,
    p_auth_session_id,
    p_assurance_level,
    'farming.content_manage'
  );

  if p_expected_version_id is null
     or p_expected_version_number is null or p_expected_version_number < 1
     or p_definition is null or jsonb_typeof(p_definition) <> 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(p_definition) key)
       <> array[
         'deliveryItemId', 'deliveryQuantity', 'description', 'name', 'objectives',
         'rewardDust', 'starterHoeItemId', 'starterSeedItemId', 'starterSeedQuantity',
         'starterWateringCanItemId'
       ]::text[]
     or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_STARTER_QUEST_SUCCESSOR';
  end if;

  select * into prior
  from public.cozy_farming_admin_audit_events
  where administrator_user_id = p_user_id and request_id = p_request_id;
  if found then
    if prior.action_key <> 'farming.quest_successor_created' then
      return jsonb_build_object('status', 'request_already_processed');
    end if;
    return jsonb_build_object(
      'status', 'replayed',
      'quest', prior.after_state,
      'replayed', true
    );
  end if;

  objectives := p_definition -> 'objectives';
  if char_length(p_definition ->> 'name') not between 1 and 80
     or p_definition ->> 'name' <> btrim(p_definition ->> 'name')
     or p_definition ->> 'name' ~ '[[:cntrl:]<>]'
     or char_length(p_definition ->> 'description') not between 1 and 280
     or p_definition ->> 'description' <> btrim(p_definition ->> 'description')
     or p_definition ->> 'description' ~ '[[:cntrl:]<>]'
     or (p_definition ->> 'starterSeedQuantity')::integer not between 2 and 99
     or (p_definition ->> 'deliveryQuantity')::integer not between 1 and 99
     or (p_definition ->> 'rewardDust')::bigint not between 1 and 10000
     or jsonb_typeof(objectives) <> 'array'
     or jsonb_array_length(objectives) <> 9 then
    raise exception using errcode = '22023', message = 'INVALID_STARTER_QUEST_SUCCESSOR';
  end if;

  select count(*) into invalid_count
  from jsonb_array_elements(objectives) objective
  where jsonb_typeof(objective) <> 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(objective) key)
       <> array['key', 'label', 'required']::text[];
  if invalid_count > 0 then
    raise exception using errcode = '22023', message = 'INVALID_STARTER_QUEST_SUCCESSOR';
  end if;

  begin
    select count(*) into invalid_count
    from jsonb_to_recordset(objectives) as objective(key text, label text, required integer)
    where objective.key not in (
      'meet_guide', 'receive_starter_kit', 'enter_home_plot', 'prepare_soil',
      'plant_crops', 'water_crops', 'harvest_crop', 'deliver_produce', 'receive_reward'
    )
       or char_length(objective.label) not between 1 and 120
       or objective.label <> btrim(objective.label)
       or objective.label ~ '[[:cntrl:]<>]'
       or objective.required not between 1 and 10000;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_STARTER_QUEST_SUCCESSOR';
  end;
  if invalid_count > 0
     or (select count(distinct objective ->> 'key') from jsonb_array_elements(objectives) objective) <> 9 then
    raise exception using errcode = '22023', message = 'INVALID_STARTER_QUEST_SUCCESSOR';
  end if;

  select * into strict current_version
  from public.cozy_quest_versions version
  where version.lifecycle_status = 'published' and version.active
  order by version.version_number desc
  limit 1
  for update;
  if current_version.id <> p_expected_version_id
     or current_version.version_number <> p_expected_version_number then
    return jsonb_build_object('status', 'state_conflict');
  end if;

  begin
    select * into strict hoe
    from public.cozy_item_definitions
    where id = (p_definition ->> 'starterHoeItemId')::uuid
      and category = 'permanent_tool'
      and metadata ->> 'toolType' = 'hoe'
      and active;
    select * into strict watering_can
    from public.cozy_item_definitions
    where id = (p_definition ->> 'starterWateringCanItemId')::uuid
      and category = 'permanent_tool'
      and metadata ->> 'toolType' = 'watering_can'
      and active;
    select * into strict seed
    from public.cozy_item_definitions
    where id = (p_definition ->> 'starterSeedItemId')::uuid
      and category = 'seed'
      and active;
    select * into strict delivery
    from public.cozy_item_definitions
    where id = (p_definition ->> 'deliveryItemId')::uuid
      and category = 'crop'
      and active;
  exception when no_data_found or invalid_text_representation then
    return jsonb_build_object('status', 'reference_conflict');
  end;

  if current_version.reward_dust <> (p_definition ->> 'rewardDust')::bigint then
    perform private.assert_verified_admin_permission(
      p_user_id,
      p_auth_session_id,
      p_assurance_level,
      'farming.reward_manage'
    );
  end if;

  select coalesce(max(version.version_number), 0) + 1 into next_version
  from public.cozy_quest_versions version
  where version.quest_definition_id = current_version.quest_definition_id;

  before_state := private.cozy_admin_quest_json(current_version);
  insert into public.cozy_quest_versions (
    id,
    quest_definition_id,
    version_number,
    lifecycle_status,
    name,
    description,
    starter_seed_quantity,
    delivery_quantity,
    reward_dust,
    starter_hoe_item_definition_id,
    starter_watering_can_item_definition_id,
    starter_seed_item_definition_id,
    delivery_item_definition_id,
    active,
    published_at
  ) values (
    gen_random_uuid(),
    current_version.quest_definition_id,
    next_version,
    'published',
    p_definition ->> 'name',
    p_definition ->> 'description',
    (p_definition ->> 'starterSeedQuantity')::integer,
    (p_definition ->> 'deliveryQuantity')::integer,
    (p_definition ->> 'rewardDust')::bigint,
    hoe.id,
    watering_can.id,
    seed.id,
    delivery.id,
    true,
    now()
  ) returning * into successor;

  insert into public.cozy_quest_objectives (
    id,
    quest_version_id,
    objective_key,
    sequence_number,
    label,
    required_count
  )
  select
    gen_random_uuid(),
    successor.id,
    objective.key,
    raw.ordinality::integer,
    objective.label,
    objective.required
  from jsonb_array_elements(objectives) with ordinality as raw(value, ordinality)
  cross join lateral jsonb_to_record(raw.value)
    as objective(key text, label text, required integer);

  if current_version.reward_dust <> successor.reward_dust then
    select source_version.* into strict source
    from public.economy_active_source_versions active
    join public.economy_source_versions source_version
      on source_version.id = active.source_version_id
    where active.source_key = 'starter-farming-tutorial';

    select max(version.version_number) + 1 into strict next_source_version
    from public.economy_source_versions version
    where version.source_key = 'starter-farming-tutorial';
    select min(version.reward_dust), max(version.reward_dust)
    into strict minimum_reward, maximum_reward
    from public.cozy_quest_versions version
    where version.quest_definition_id = successor.quest_definition_id
      and version.lifecycle_status = 'published'
      and version.active;
    next_source_id := gen_random_uuid();
    insert into public.economy_source_versions (
      id,
      source_key,
      version_number,
      lifecycle_status,
      operation_key,
      category,
      label,
      description,
      minimum_amount,
      maximum_amount,
      repeatable,
      daily_limit,
      weekly_limit,
      account_lifetime_limit,
      wallet_daily_limit,
      cooldown_seconds,
      beginner_protected,
      risk_weight,
      revision,
      effective_at,
      created_by_admin_id,
      reviewed_by_admin_id,
      published_by_admin_id,
      reviewed_at,
      published_at
    ) values (
      next_source_id,
      source.source_key,
      next_source_version,
      'published',
      source.operation_key,
      source.category,
      source.label,
      'Published starter-quest reward compatibility range across immutable quest versions.',
      minimum_reward,
      maximum_reward,
      source.repeatable,
      source.daily_limit,
      source.weekly_limit,
      source.account_lifetime_limit,
      source.wallet_daily_limit,
      source.cooldown_seconds,
      source.beginner_protected,
      source.risk_weight,
      1,
      now(),
      p_user_id,
      p_user_id,
      p_user_id,
      now(),
      now()
    );
    update public.economy_active_source_versions
    set source_version_id = next_source_id, activated_at = now()
    where source_key = 'starter-farming-tutorial';
  end if;

  after_state := private.cozy_admin_quest_json(successor);
  insert into public.cozy_farming_admin_audit_events (
    administrator_user_id,
    admin_session_id,
    action_key,
    before_state,
    after_state,
    reason,
    request_id
  ) values (
    p_user_id,
    trusted_session_id,
    'farming.quest_successor_created',
    before_state,
    after_state,
    p_reason,
    p_request_id
  );

  return jsonb_build_object('status', 'updated', 'quest', after_state, 'replayed', false);
end;
$$;

revoke all on function private.cozy_admin_item_json(public.cozy_item_definitions)
  from public, anon, authenticated, service_role;
revoke all on function private.cozy_admin_crop_json(public.cozy_crop_definitions)
  from public, anon, authenticated, service_role;
revoke all on function private.cozy_admin_plot_template_json(public.cozy_home_templates)
  from public, anon, authenticated, service_role;
revoke all on function private.cozy_admin_quest_json(public.cozy_quest_versions)
  from public, anon, authenticated, service_role;

revoke all on function public.update_admin_farming_item(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.update_admin_farming_crop(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.create_admin_farming_plot_template_successor(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.create_admin_starter_quest_successor(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.update_admin_farming_item(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) to service_role;
grant execute on function public.update_admin_farming_crop(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) to service_role;
grant execute on function public.create_admin_farming_plot_template_successor(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) to service_role;
grant execute on function public.create_admin_starter_quest_successor(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) to service_role;

comment on table public.cozy_active_home_templates is
  'Trusted pointer for the starter template assigned only to newly provisioned homes.';
comment on function public.update_admin_farming_item(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) is 'Audited optimistic item-definition update with dependency and stack-size safety.';
comment on function public.update_admin_farming_crop(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) is 'Audited crop-definition revision; existing planted crops keep immutable snapshots.';
comment on function public.create_admin_farming_plot_template_successor(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) is 'Creates and activates a validated successor template without rewriting existing homes.';
comment on function public.create_admin_starter_quest_successor(
  uuid, uuid, text, uuid, integer, jsonb, text, text
) is 'Creates an immutable starter-quest successor and safely versions its reward policy.';
