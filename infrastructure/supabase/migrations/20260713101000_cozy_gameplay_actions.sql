-- Starville Phase 7B: private farming, recipes, crafting, and system shops.
-- Extends the Phase 7A authority boundary without adding housing, social play,
-- player trading, blockchain rewards, or client-authoritative outcomes.

alter table public.cozy_gameplay_idempotency
  drop constraint cozy_gameplay_idempotency_operation_check;
alter table public.cozy_gameplay_idempotency
  add constraint cozy_gameplay_idempotency_operation_check check (operation in (
    'bootstrap', 'quickbar_update', 'farm_plant', 'farm_water', 'farm_harvest',
    'recipe_cook', 'recipe_craft', 'shop_buy', 'shop_sell'
  ));

alter table public.cozy_gameplay_rate_limits
  drop constraint cozy_gameplay_rate_limits_scope_check;
alter table public.cozy_gameplay_rate_limits
  add constraint cozy_gameplay_rate_limits_scope_check check (scope in (
    'bootstrap', 'dust_read', 'inventory_read', 'history_read', 'quickbar_write',
    'farm_read', 'farm_write', 'recipe_read', 'recipe_write', 'shop_read', 'shop_write'
  ));

alter table public.player_inventory_history
  drop constraint player_inventory_history_resulting_quantity_check;
alter table public.player_inventory_history
  add constraint player_inventory_history_resulting_quantity_check
  check (resulting_quantity between 0 and 199800);

create table public.cozy_crop_definitions (
  id uuid primary key,
  slug text not null unique check (char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name) and name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 1 and 280 and description = btrim(description) and description !~ '[[:cntrl:]<>]'),
  seed_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  harvest_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  growth_duration_seconds integer not null check (growth_duration_seconds between 10 and 2592000),
  growth_stage_count integer not null check (growth_stage_count between 2 and 8),
  deterministic_yield integer not null check (deterministic_yield between 1 and 10000),
  asset_ref text check (asset_ref is null or (char_length(asset_ref) between 1 and 80 and asset_ref ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')),
  asset_readiness text not null check (asset_readiness in ('approved', 'development_marker', 'missing')),
  active boolean not null default true,
  content_version integer not null check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (asset_readiness <> 'approved' or asset_ref is not null)
);

create table public.cozy_recipe_definitions (
  id uuid primary key,
  slug text not null unique check (char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name) and name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 1 and 280 and description = btrim(description) and description !~ '[[:cntrl:]<>]'),
  kind text not null check (kind in ('cooking', 'crafting')),
  station_type text not null check (station_type in ('cooking_hearth', 'crafting_workbench')),
  output_item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  output_quantity integer not null check (output_quantity between 1 and 10000),
  dust_fee bigint not null default 0 check (dust_fee between 0 and 9000000000000000),
  active boolean not null default true,
  content_version integer not null check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'cooking' and station_type = 'cooking_hearth')
    or (kind = 'crafting' and station_type = 'crafting_workbench')
  )
);

create table public.cozy_recipe_ingredients (
  recipe_definition_id uuid not null references public.cozy_recipe_definitions(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 10000),
  primary key (recipe_definition_id, item_definition_id)
);

create table public.cozy_shop_definitions (
  id uuid primary key,
  slug text not null unique check (char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name) and name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 1 and 280 and description = btrim(description) and description !~ '[[:cntrl:]<>]'),
  active boolean not null default true,
  content_version integer not null check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cozy_shop_offers (
  id uuid primary key,
  shop_definition_id uuid not null references public.cozy_shop_definitions(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  buy_price bigint check (buy_price between 1 and 9000000000000000),
  sell_price bigint check (sell_price between 1 and 9000000000000000),
  minimum_quantity integer not null check (minimum_quantity between 1 and 99),
  maximum_quantity integer not null check (maximum_quantity between 1 and 99),
  active boolean not null default true,
  available_from timestamptz,
  available_until timestamptz,
  content_version integer not null check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_definition_id, item_definition_id),
  check (buy_price is not null or sell_price is not null),
  check (minimum_quantity <= maximum_quantity),
  check (buy_price is null or buy_price::numeric * maximum_quantity <= 9000000000000000),
  check (sell_price is null or sell_price::numeric * maximum_quantity <= 9000000000000000),
  check (available_from is null or available_until is null or available_from < available_until)
);

create table public.cozy_farm_plot_anchors (
  id uuid primary key,
  anchor_id text not null unique check (char_length(anchor_id) between 1 and 80 and anchor_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  interaction_id text not null unique check (char_length(interaction_id) between 1 and 80 and interaction_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  map_version_id uuid not null references public.world_map_versions(id) on delete restrict,
  slot integer not null check (slot between 1 and 64),
  position_x numeric(8,4) not null,
  position_y numeric(8,4) not null,
  interaction_range numeric(5,2) not null check (interaction_range > 0 and interaction_range <= 4),
  active boolean not null default true,
  content_version integer not null check (content_version > 0),
  unique (world_map_id, slot)
);

create table public.cozy_gameplay_stations (
  id uuid primary key,
  interaction_id text not null unique check (char_length(interaction_id) between 1 and 80 and interaction_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  station_type text not null check (station_type in ('cooking_hearth', 'crafting_workbench')),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  map_version_id uuid not null references public.world_map_versions(id) on delete restrict,
  position_x numeric(8,4) not null,
  position_y numeric(8,4) not null,
  interaction_range numeric(5,2) not null check (interaction_range > 0 and interaction_range <= 4),
  active boolean not null default true,
  content_version integer not null check (content_version > 0)
);

create table public.cozy_shop_interactions (
  id uuid primary key,
  shop_definition_id uuid not null unique references public.cozy_shop_definitions(id) on delete restrict,
  interaction_id text not null unique check (char_length(interaction_id) between 1 and 80 and interaction_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  map_version_id uuid not null references public.world_map_versions(id) on delete restrict,
  position_x numeric(8,4) not null,
  position_y numeric(8,4) not null,
  interaction_range numeric(5,2) not null check (interaction_range > 0 and interaction_range <= 4),
  active boolean not null default true,
  content_version integer not null check (content_version > 0)
);

create table public.player_farm_plots (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  anchor_id uuid not null references public.cozy_farm_plot_anchors(id) on delete restrict,
  slot integer not null check (slot between 1 and 64),
  state text not null default 'empty' check (state in ('empty', 'planted', 'needs_water', 'growing', 'ready_to_harvest')),
  crop_definition_id uuid references public.cozy_crop_definitions(id) on delete restrict,
  planted_at timestamptz,
  watered_at timestamptz,
  growth_started_at timestamptz,
  ready_at timestamptz,
  state_version integer not null default 1 check (state_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_profile_id, slot),
  unique (player_profile_id, anchor_id),
  constraint player_farm_plot_state_check check (
    (state = 'empty' and crop_definition_id is null and planted_at is null and watered_at is null and growth_started_at is null and ready_at is null)
    or (state in ('planted', 'needs_water') and crop_definition_id is not null and planted_at is not null and watered_at is null and growth_started_at is null and ready_at is null)
    or (state in ('growing', 'ready_to_harvest') and crop_definition_id is not null and planted_at is not null and watered_at is not null and growth_started_at is not null and ready_at is not null and ready_at > growth_started_at)
  )
);

create table public.cozy_gameplay_action_events (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  operation text not null check (operation in ('farm_plant', 'farm_water', 'farm_harvest', 'recipe_cook', 'recipe_craft', 'shop_buy', 'shop_sell')),
  target_type text not null check (target_type in ('farm_plot', 'recipe', 'shop_offer')),
  target_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  result_summary jsonb not null check (jsonb_typeof(result_summary) = 'object'),
  created_at timestamptz not null default now(),
  unique (player_profile_id, operation, idempotency_key)
);

create index cozy_crop_definitions_active_idx on public.cozy_crop_definitions (active, slug);
create index cozy_recipe_definitions_active_kind_idx on public.cozy_recipe_definitions (active, kind, slug);
create index cozy_recipe_ingredients_recipe_idx on public.cozy_recipe_ingredients (recipe_definition_id, item_definition_id);
create index cozy_shop_offers_active_idx on public.cozy_shop_offers (shop_definition_id, active, available_from, available_until);
create index player_farm_plots_player_idx on public.player_farm_plots (player_profile_id, slot);
create index player_farm_plots_ready_idx on public.player_farm_plots (ready_at, player_profile_id) where state = 'growing';
create index cozy_gameplay_action_events_player_idx on public.cozy_gameplay_action_events (player_profile_id, created_at desc, id desc);

create trigger cozy_crop_definitions_set_updated_at before update on public.cozy_crop_definitions for each row execute function private.set_updated_at();
create trigger cozy_recipe_definitions_set_updated_at before update on public.cozy_recipe_definitions for each row execute function private.set_updated_at();
create trigger cozy_shop_definitions_set_updated_at before update on public.cozy_shop_definitions for each row execute function private.set_updated_at();
create trigger cozy_shop_offers_set_updated_at before update on public.cozy_shop_offers for each row execute function private.set_updated_at();
create trigger player_farm_plots_set_updated_at before update on public.player_farm_plots for each row execute function private.set_updated_at();
create trigger cozy_gameplay_action_events_append_only before update or delete on public.cozy_gameplay_action_events for each row execute function private.reject_cozy_append_only_mutation();

-- Canonical crops.
insert into public.cozy_crop_definitions (
  id, slug, name, description, seed_item_definition_id, harvest_item_definition_id,
  growth_duration_seconds, growth_stage_count, deterministic_yield,
  asset_ref, asset_readiness, active, content_version
) values
  ('72000000-0000-4000-8000-000000000001', 'moonbean', 'Moonbean', 'A quick-growing starter bean.', '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', 300, 4, 3, 'phase7-dev-moonbean-crop', 'development_marker', true, 1),
  ('72000000-0000-4000-8000-000000000002', 'sunroot', 'Sunroot', 'A sturdy golden starter root.', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000005', 420, 4, 3, 'phase7-dev-sunroot-crop', 'development_marker', true, 1),
  ('72000000-0000-4000-8000-000000000003', 'cloudberry', 'Cloudberry', 'A patient meadow berry crop.', '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000006', 600, 5, 4, 'phase7-dev-cloudberry-crop', 'development_marker', true, 1)
on conflict (id) do nothing;

create or replace function private.claim_cozy_gameplay_rate_limit(
  p_player_profile_id uuid,
  p_scope text,
  p_limit integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare claimed boolean;
begin
  if p_player_profile_id is null
     or p_scope not in (
       'bootstrap', 'dust_read', 'inventory_read', 'history_read', 'quickbar_write',
       'farm_read', 'farm_write', 'recipe_read', 'recipe_write', 'shop_read', 'shop_write'
     )
     or p_limit not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_COZY_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-rate:' || p_player_profile_id::text || ':' || p_scope, 0
  ));
  insert into public.cozy_gameplay_rate_limits (
    player_profile_id, scope, attempt_count, window_started_at, window_expires_at, updated_at
  ) values (p_player_profile_id, p_scope, 1, now(), now() + interval '1 minute', now())
  on conflict (player_profile_id, scope) do update
  set attempt_count = case when cozy_gameplay_rate_limits.window_expires_at <= now() then 1 else cozy_gameplay_rate_limits.attempt_count + 1 end,
      window_started_at = case when cozy_gameplay_rate_limits.window_expires_at <= now() then now() else cozy_gameplay_rate_limits.window_started_at end,
      window_expires_at = case when cozy_gameplay_rate_limits.window_expires_at <= now() then now() + interval '1 minute' else cozy_gameplay_rate_limits.window_expires_at end,
      updated_at = now()
  where cozy_gameplay_rate_limits.window_expires_at <= now()
     or cozy_gameplay_rate_limits.attempt_count < p_limit
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create or replace function private.ensure_player_farm_plots(p_player_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_player_profile_id is null then
    raise exception using errcode = '22023', message = 'INVALID_FARM_PLAYER';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cozy-farm-bootstrap:' || p_player_profile_id::text, 0)
  );
  if (select count(*) from public.cozy_farm_plot_anchors where active) <> 6 then
    raise exception using errcode = '23514', message = 'INVALID_STARTER_FARM_ANCHOR_SET';
  end if;
  insert into public.player_farm_plots (player_profile_id, anchor_id, slot)
  select p_player_profile_id, anchor.id, anchor.slot
  from public.cozy_farm_plot_anchors anchor
  where anchor.active
  order by anchor.slot
  limit 6
  on conflict (player_profile_id, slot) do nothing;
  if (select count(*) from public.player_farm_plots where player_profile_id=p_player_profile_id) <> 6 then
    raise exception using errcode = '23514', message = 'INVALID_PLAYER_FARM_PLOT_SET';
  end if;
end;
$$;

create or replace function private.cozy_player_bootstrapped(p_player_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.player_dust_accounts where player_profile_id=p_player_profile_id)
    and exists(select 1 from public.player_inventory_state where player_profile_id=p_player_profile_id);
$$;

create or replace function private.cozy_crop_json(crop public.cozy_crop_definitions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', crop.id, 'slug', crop.slug, 'name', crop.name, 'description', crop.description,
    'seedItemSlug', seed.slug, 'harvestItemSlug', harvest.slug,
    'growthDurationSeconds', crop.growth_duration_seconds,
    'growthStageCount', crop.growth_stage_count,
    'deterministicYield', crop.deterministic_yield,
    'assetRef', crop.asset_ref, 'assetReadiness', crop.asset_readiness,
    'active', crop.active, 'contentVersion', crop.content_version
  )
  from public.cozy_item_definitions seed, public.cozy_item_definitions harvest
  where seed.id = crop.seed_item_definition_id and harvest.id = crop.harvest_item_definition_id;
$$;

create or replace function private.cozy_farm_plot_json(plot public.player_farm_plots)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  anchor public.cozy_farm_plot_anchors%rowtype;
  crop public.cozy_crop_definitions%rowtype;
  derived_state text;
  progress numeric;
begin
  select * into strict anchor from public.cozy_farm_plot_anchors where id = plot.anchor_id;
  if plot.crop_definition_id is not null then
    select * into strict crop from public.cozy_crop_definitions where id = plot.crop_definition_id;
  end if;
  derived_state := case
    when plot.state = 'growing' and plot.ready_at <= now() then 'ready_to_harvest'
    else plot.state
  end;
  progress := case
    when derived_state = 'empty' or derived_state in ('planted', 'needs_water') then 0
    when derived_state = 'ready_to_harvest' then 1
    else greatest(0, least(1,
      extract(epoch from (now() - plot.growth_started_at))
      / nullif(extract(epoch from (plot.ready_at - plot.growth_started_at)), 0)
    ))
  end;
  return jsonb_build_object(
    'id', plot.id, 'anchorId', anchor.interaction_id, 'mapVersionId', anchor.map_version_id,
    'slot', plot.slot, 'state', derived_state,
    'cropSlug', case when plot.crop_definition_id is null then null else crop.slug end,
    'plantedAt', plot.planted_at, 'wateredAt', plot.watered_at,
    'growthStartedAt', plot.growth_started_at, 'readyAt', plot.ready_at,
    'growthProgress', progress, 'stateVersion', plot.state_version, 'updatedAt', plot.updated_at
  );
end;
$$;

create or replace function private.cozy_recipe_json(recipe public.cozy_recipe_definitions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', recipe.id, 'slug', recipe.slug, 'name', recipe.name,
    'description', recipe.description, 'kind', recipe.kind, 'stationType', recipe.station_type,
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object('itemSlug', item.slug, 'quantity', ingredient.quantity) order by item.slug)
      from public.cozy_recipe_ingredients ingredient
      join public.cozy_item_definitions item on item.id = ingredient.item_definition_id
      where ingredient.recipe_definition_id = recipe.id
    ), '[]'::jsonb),
    'outputItemSlug', output.slug, 'outputQuantity', recipe.output_quantity,
    'dustFee', recipe.dust_fee, 'active', recipe.active, 'contentVersion', recipe.content_version
  ) from public.cozy_item_definitions output where output.id = recipe.output_item_definition_id;
$$;

create or replace function private.cozy_shop_json(shop public.cozy_shop_definitions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', shop.id, 'slug', shop.slug, 'name', shop.name, 'description', shop.description,
    'active', shop.active, 'contentVersion', shop.content_version
  );
$$;

create or replace function private.cozy_shop_offer_json(offer public.cozy_shop_offers)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', offer.id, 'shopSlug', shop.slug, 'itemSlug', item.slug,
    'buyPrice', offer.buy_price, 'sellPrice', offer.sell_price,
    'minimumQuantity', offer.minimum_quantity, 'maximumQuantity', offer.maximum_quantity,
    'active', offer.active, 'availableFrom', offer.available_from,
    'availableUntil', offer.available_until, 'contentVersion', offer.content_version
  )
  from public.cozy_shop_definitions shop, public.cozy_item_definitions item
  where shop.id = offer.shop_definition_id and item.id = offer.item_definition_id;
$$;

create or replace function private.cozy_owned_quantity(p_player_profile_id uuid, p_item_definition_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(quantity), 0)::integer from public.player_inventory_stacks
  where player_profile_id = p_player_profile_id and item_definition_id = p_item_definition_id;
$$;

create or replace function private.cozy_can_add_item(
  p_player_profile_id uuid, p_item_definition_id uuid, p_quantity integer
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare item public.cozy_item_definitions%rowtype; state public.player_inventory_state%rowtype;
  used_slots integer; existing_space integer;
begin
  if p_quantity is null or p_quantity < 1 then return false; end if;
  select * into strict item from public.cozy_item_definitions where id = p_item_definition_id;
  select * into strict state from public.player_inventory_state where player_profile_id = p_player_profile_id;
  select count(*) into used_slots from public.player_inventory_stacks where player_profile_id = p_player_profile_id;
  select coalesce(sum(item.max_stack_size - quantity), 0)::integer into existing_space
  from public.player_inventory_stacks
  where player_profile_id = p_player_profile_id and item_definition_id = item.id and item.stackable;
  return p_quantity <= existing_space + (state.capacity - used_slots) * item.max_stack_size;
end;
$$;

create or replace function private.cozy_add_item(
  p_player_profile_id uuid, p_item_definition_id uuid, p_quantity integer,
  p_reason text, p_reference_id text, p_idempotency_key text, p_request_id text
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare item public.cozy_item_definitions%rowtype; state public.player_inventory_state%rowtype;
  stack public.player_inventory_stacks%rowtype; remaining integer := p_quantity;
  added integer; free_slot integer; recorded_stack_id uuid; resulting integer;
begin
  if not private.cozy_can_add_item(p_player_profile_id, p_item_definition_id, p_quantity) then return false; end if;
  select * into strict item from public.cozy_item_definitions where id = p_item_definition_id;
  select * into strict state from public.player_inventory_state where player_profile_id = p_player_profile_id for update;
  if item.stackable then
    for stack in select * from public.player_inventory_stacks
      where player_profile_id = p_player_profile_id and item_definition_id = item.id
        and quantity < item.max_stack_size order by slot_index for update
    loop
      added := least(remaining, item.max_stack_size - stack.quantity);
      update public.player_inventory_stacks set quantity = quantity + added, state_version = state_version + 1
      where id = stack.id returning id into recorded_stack_id;
      remaining := remaining - added; exit when remaining = 0;
    end loop;
  end if;
  while remaining > 0 loop
    select candidate into free_slot from generate_series(1, state.capacity) candidate
    where not exists (select 1 from public.player_inventory_stacks occupied
      where occupied.player_profile_id = p_player_profile_id and occupied.slot_index = candidate)
    order by candidate limit 1;
    if free_slot is null then raise exception using errcode = '23514', message = 'INVENTORY_CAPACITY_CHANGED'; end if;
    added := least(remaining, item.max_stack_size);
    insert into public.player_inventory_stacks (player_profile_id, item_definition_id, slot_index, quantity)
    values (p_player_profile_id, item.id, free_slot, added) returning id into recorded_stack_id;
    remaining := remaining - added;
  end loop;
  update public.player_inventory_state set state_version = state_version + 1
  where player_profile_id = p_player_profile_id returning * into state;
  resulting := private.cozy_owned_quantity(p_player_profile_id, item.id);
  insert into public.player_inventory_history (
    player_profile_id, inventory_stack_id, item_definition_id, delta, resulting_quantity,
    reason, reference_id, idempotency_key, request_id
  ) values (p_player_profile_id, recorded_stack_id, item.id, p_quantity, resulting,
    p_reason, p_reference_id, p_idempotency_key, p_request_id);
  return true;
end;
$$;

create or replace function private.cozy_remove_item(
  p_player_profile_id uuid, p_item_definition_id uuid, p_quantity integer,
  p_reason text, p_reference_id text, p_idempotency_key text, p_request_id text
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare item public.cozy_item_definitions%rowtype; state public.player_inventory_state%rowtype;
  stack public.player_inventory_stacks%rowtype; remaining integer := p_quantity;
  removed integer; recorded_stack_id uuid; resulting integer; quickbar_affected boolean := false;
begin
  if p_quantity is null or p_quantity < 1
     or private.cozy_owned_quantity(p_player_profile_id, p_item_definition_id) < p_quantity then return false; end if;
  select * into strict item from public.cozy_item_definitions where id = p_item_definition_id;
  if item.category = 'permanent_tool' then return false; end if;
  select * into strict state from public.player_inventory_state where player_profile_id = p_player_profile_id for update;
  if private.cozy_owned_quantity(p_player_profile_id, p_item_definition_id) < p_quantity then return false; end if;
  for stack in select * from public.player_inventory_stacks
    where player_profile_id = p_player_profile_id and item_definition_id = item.id
    order by slot_index desc for update
  loop
    removed := least(remaining, stack.quantity); recorded_stack_id := stack.id;
    if removed = stack.quantity then
      if exists (select 1 from public.player_quickbar_assignments where player_profile_id = p_player_profile_id and inventory_stack_id = stack.id) then quickbar_affected := true; end if;
      delete from public.player_inventory_stacks where id = stack.id;
    else
      update public.player_inventory_stacks set quantity = quantity - removed, state_version = state_version + 1 where id = stack.id;
    end if;
    remaining := remaining - removed; exit when remaining = 0;
  end loop;
  if remaining <> 0 then
    raise exception using errcode = '40001', message = 'INVENTORY_CONCURRENT_CONSUMPTION';
  end if;
  update public.player_inventory_state
  set state_version = state_version + 1,
      quickbar_state_version = quickbar_state_version + case when quickbar_affected then 1 else 0 end
  where player_profile_id = p_player_profile_id returning * into state;
  resulting := private.cozy_owned_quantity(p_player_profile_id, item.id);
  insert into public.player_inventory_history (
    player_profile_id, inventory_stack_id, item_definition_id, delta, resulting_quantity,
    reason, reference_id, idempotency_key, request_id
  ) values (p_player_profile_id, recorded_stack_id, item.id, -p_quantity, resulting,
    p_reason, p_reference_id, p_idempotency_key, p_request_id);
  return true;
end;
$$;

create or replace function private.cozy_apply_dust_delta(
  p_player_profile_id uuid, p_delta bigint, p_reason text, p_reference_type text,
  p_reference_id text, p_idempotency_key text, p_request_id text
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare account public.player_dust_accounts%rowtype;
begin
  select * into strict account from public.player_dust_accounts
  where player_profile_id = p_player_profile_id for update;
  if p_delta = 0 then return true; end if;
  if account.balance + p_delta < 0 or account.balance + p_delta > 9000000000000000 then return false; end if;
  update public.player_dust_accounts set balance = balance + p_delta, state_version = state_version + 1
  where player_profile_id = p_player_profile_id returning * into account;
  insert into public.player_dust_ledger (
    player_profile_id, delta, resulting_balance, reason, reference_type,
    reference_id, idempotency_key, request_id
  ) values (p_player_profile_id, p_delta, account.balance, p_reason, p_reference_type,
    p_reference_id,
    encode(extensions.digest(convert_to(p_reason||':'||p_idempotency_key,'UTF8'),'sha256'),'hex'),
    p_request_id);
  return true;
end;
$$;

alter function public.bootstrap_player_cozy_gameplay(text, text, text)
  rename to bootstrap_player_cozy_gameplay_phase7a;
revoke all on function public.bootstrap_player_cozy_gameplay_phase7a(text, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.bootstrap_player_cozy_gameplay(
  p_wallet_address text, p_idempotency_key text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb; player_id uuid;
begin
  result := public.bootstrap_player_cozy_gameplay_phase7a(p_wallet_address, p_idempotency_key, p_request_id);
  if result ->> 'status' = 'loaded' then
    select id into strict player_id from public.player_profiles where wallet_address = p_wallet_address;
    perform private.ensure_player_farm_plots(player_id);
  end if;
  return result;
end;
$$;

create or replace function public.get_player_farm_plots(p_wallet_address text, p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; config public.cozy_gameplay_config%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_FARM_READ_REQUEST';
  end if;
  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile := selected_rows.profile_row; moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id = 1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'farm_read',config.read_rate_limit) then return jsonb_build_object('status','rate_limited'); end if;
  perform private.ensure_player_farm_plots(profile.id);
  return jsonb_build_object(
    'status','loaded','contentVersion',config.content_version,
    'plots',coalesce((select jsonb_agg(private.cozy_farm_plot_json(plot) order by plot.slot)
      from public.player_farm_plots plot where plot.player_profile_id = profile.id),'[]'::jsonb),
    'generatedAt',now()
  );
end;
$$;

create or replace function public.plant_player_farm_plot(
  p_wallet_address text, p_plot_id uuid, p_seed_item_slug text,
  p_expected_state_version integer, p_idempotency_key text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; config public.cozy_gameplay_config%rowtype;
  plot public.player_farm_plots%rowtype; crop public.cozy_crop_definitions%rowtype;
  anchor public.cozy_farm_plot_anchors%rowtype;
  seed public.cozy_item_definitions%rowtype; receipt public.cozy_gameplay_idempotency%rowtype;
  request_hash text; response jsonb; inventory_version integer;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_plot_id is null or p_seed_item_slug is null
     or p_seed_item_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(p_seed_item_slug) not between 1 and 80
     or p_expected_state_version < 1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_FARM_PLANT_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row; moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'farm_write',config.mutation_rate_limit) then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(p_plot_id::text||':'||p_seed_item_slug||':'||p_expected_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cozy-idem:'||profile.id::text||':farm_plant:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency where player_profile_id=profile.id and operation='farm_plant' and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  perform private.ensure_player_farm_plots(profile.id);
  select * into plot from public.player_farm_plots where id=p_plot_id and player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into strict anchor from public.cozy_farm_plot_anchors where id=plot.anchor_id and active;
  if profile.current_map_id<>(select slug from public.world_maps where id=anchor.world_map_id)
     or profile.current_map_version_id is distinct from anchor.map_version_id
     or sqrt(power(profile.safe_position_x-anchor.position_x,2)+power(profile.safe_position_y-anchor.position_y,2))>anchor.interaction_range then
    return jsonb_build_object('status','not_found');
  end if;
  if plot.state_version<>p_expected_state_version then return jsonb_build_object('status','state_conflict'); end if;
  if plot.state<>'empty' then return jsonb_build_object('status','plot_occupied'); end if;
  select item.* into seed from public.cozy_item_definitions item
  where item.slug=p_seed_item_slug and item.category='seed' and item.active;
  if not found then return jsonb_build_object('status','item_unavailable'); end if;
  select crop_row.* into crop from public.cozy_crop_definitions crop_row
  where crop_row.seed_item_definition_id=seed.id and crop_row.active;
  if not found then return jsonb_build_object('status','item_unavailable'); end if;
  if not private.cozy_remove_item(profile.id,seed.id,1,'planting',plot.id::text,p_idempotency_key,p_request_id) then
    return jsonb_build_object('status','seed_unavailable');
  end if;
  update public.player_farm_plots set state='needs_water',crop_definition_id=crop.id,
    planted_at=now(),watered_at=null,growth_started_at=null,ready_at=null,state_version=state_version+1
  where id=plot.id returning * into plot;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=profile.id;
  response:=jsonb_build_object('status','updated','plot',private.cozy_farm_plot_json(plot),
    'inventoryStateVersion',inventory_version,'replayed',false);
  insert into public.cozy_gameplay_idempotency(player_profile_id,operation,idempotency_key,request_hash,response,request_id)
  values(profile.id,'farm_plant',p_idempotency_key,request_hash,response,p_request_id);
  insert into public.cozy_gameplay_action_events(player_profile_id,operation,target_type,target_id,idempotency_key,request_id,result_summary)
  values(profile.id,'farm_plant','farm_plot',plot.id,p_idempotency_key,p_request_id,
    jsonb_build_object('cropSlug',crop.slug,'plotStateVersion',plot.state_version));
  return response;
end;
$$;

create or replace function public.water_player_farm_plot(
  p_wallet_address text, p_plot_id uuid, p_expected_state_version integer,
  p_idempotency_key text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; config public.cozy_gameplay_config%rowtype;
  plot public.player_farm_plots%rowtype; crop public.cozy_crop_definitions%rowtype;
  anchor public.cozy_farm_plot_anchors%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; request_hash text; response jsonb;
  inventory_version integer;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_plot_id is null or p_expected_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_FARM_WATER_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows from public.player_profiles p
  join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'farm_write',config.mutation_rate_limit) then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(p_plot_id::text||':'||p_expected_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cozy-idem:'||profile.id::text||':farm_water:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency where player_profile_id=profile.id and operation='farm_water' and idempotency_key=p_idempotency_key;
  if found then if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb); end if;
  select * into plot from public.player_farm_plots where id=p_plot_id and player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into strict anchor from public.cozy_farm_plot_anchors where id=plot.anchor_id and active;
  if profile.current_map_id<>(select slug from public.world_maps where id=anchor.world_map_id)
     or profile.current_map_version_id is distinct from anchor.map_version_id
     or sqrt(power(profile.safe_position_x-anchor.position_x,2)+power(profile.safe_position_y-anchor.position_y,2))>anchor.interaction_range then
    return jsonb_build_object('status','not_found');
  end if;
  if plot.state_version<>p_expected_state_version then return jsonb_build_object('status','state_conflict'); end if;
  if plot.state<>'needs_water' then return jsonb_build_object('status','plot_does_not_need_water'); end if;
  if private.cozy_owned_quantity(profile.id,config.starter_tool_item_definition_id)<1 then return jsonb_build_object('status','item_unavailable'); end if;
  select * into strict crop from public.cozy_crop_definitions where id=plot.crop_definition_id;
  update public.player_farm_plots set state='growing',watered_at=now(),growth_started_at=now(),
    ready_at=now()+make_interval(secs=>crop.growth_duration_seconds),state_version=state_version+1
  where id=plot.id returning * into plot;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=profile.id;
  response:=jsonb_build_object('status','updated','plot',private.cozy_farm_plot_json(plot),
    'inventoryStateVersion',inventory_version,'replayed',false);
  insert into public.cozy_gameplay_idempotency(player_profile_id,operation,idempotency_key,request_hash,response,request_id)
  values(profile.id,'farm_water',p_idempotency_key,request_hash,response,p_request_id);
  insert into public.cozy_gameplay_action_events(player_profile_id,operation,target_type,target_id,idempotency_key,request_id,result_summary)
  values(profile.id,'farm_water','farm_plot',plot.id,p_idempotency_key,p_request_id,jsonb_build_object('readyAt',plot.ready_at,'plotStateVersion',plot.state_version));
  return response;
end;
$$;

create or replace function public.harvest_player_farm_plot(
  p_wallet_address text, p_plot_id uuid, p_expected_state_version integer,
  p_idempotency_key text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype;moderation public.player_moderation_states%rowtype;
  selected_rows record;config public.cozy_gameplay_config%rowtype;plot public.player_farm_plots%rowtype;
  crop public.cozy_crop_definitions%rowtype;receipt public.cozy_gameplay_idempotency%rowtype;
  anchor public.cozy_farm_plot_anchors%rowtype;
  request_hash text;response jsonb;inventory_version integer;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_plot_id is null or p_expected_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_FARM_HARVEST_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows from public.player_profiles p
  join public.player_moderation_states m on m.player_profile_id=p.id where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'farm_write',config.mutation_rate_limit) then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(p_plot_id::text||':'||p_expected_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cozy-idem:'||profile.id::text||':farm_harvest:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency where player_profile_id=profile.id and operation='farm_harvest' and idempotency_key=p_idempotency_key;
  if found then if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb); end if;
  select * into plot from public.player_farm_plots where id=p_plot_id and player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into strict anchor from public.cozy_farm_plot_anchors where id=plot.anchor_id and active;
  if profile.current_map_id<>(select slug from public.world_maps where id=anchor.world_map_id)
     or profile.current_map_version_id is distinct from anchor.map_version_id
     or sqrt(power(profile.safe_position_x-anchor.position_x,2)+power(profile.safe_position_y-anchor.position_y,2))>anchor.interaction_range then
    return jsonb_build_object('status','not_found');
  end if;
  if plot.state_version<>p_expected_state_version then return jsonb_build_object('status','state_conflict'); end if;
  if plot.state not in ('growing','ready_to_harvest') or plot.ready_at is null or plot.ready_at>now() then return jsonb_build_object('status','plot_not_ready'); end if;
  select * into strict crop from public.cozy_crop_definitions where id=plot.crop_definition_id;
  if not private.cozy_add_item(profile.id,crop.harvest_item_definition_id,crop.deterministic_yield,
    'harvest',plot.id::text,p_idempotency_key,p_request_id) then return jsonb_build_object('status','inventory_full'); end if;
  update public.player_farm_plots set state='empty',crop_definition_id=null,planted_at=null,
    watered_at=null,growth_started_at=null,ready_at=null,state_version=state_version+1
  where id=plot.id returning * into plot;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=profile.id;
  response:=jsonb_build_object('status','updated','plot',private.cozy_farm_plot_json(plot),
    'inventoryStateVersion',inventory_version,'replayed',false);
  insert into public.cozy_gameplay_idempotency(player_profile_id,operation,idempotency_key,request_hash,response,request_id)
  values(profile.id,'farm_harvest',p_idempotency_key,request_hash,response,p_request_id);
  insert into public.cozy_gameplay_action_events(player_profile_id,operation,target_type,target_id,idempotency_key,request_id,result_summary)
  values(profile.id,'farm_harvest','farm_plot',plot.id,p_idempotency_key,p_request_id,
    jsonb_build_object('cropSlug',crop.slug,'yield',crop.deterministic_yield,'plotStateVersion',plot.state_version));
  return response;
end;
$$;

create or replace function private.cozy_recipe_capacity_fits(
  p_player_profile_id uuid, p_recipe_definition_id uuid, p_quantity integer
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare recipe public.cozy_recipe_definitions%rowtype; capacity integer; required_slots integer;
begin
  if p_quantity not between 1 and 99 then return false; end if;
  select * into strict recipe from public.cozy_recipe_definitions where id=p_recipe_definition_id;
  select state.capacity into strict capacity from public.player_inventory_state state
  where state.player_profile_id=p_player_profile_id;
  select coalesce(sum(ceil(adjusted.quantity::numeric/item.max_stack_size)),0)::integer
  into required_slots
  from public.cozy_item_definitions item
  join lateral (
    select greatest(0,
      private.cozy_owned_quantity(p_player_profile_id,item.id)
      - coalesce((select ingredient.quantity*p_quantity from public.cozy_recipe_ingredients ingredient
          where ingredient.recipe_definition_id=recipe.id and ingredient.item_definition_id=item.id),0)
      + case when item.id=recipe.output_item_definition_id then recipe.output_quantity*p_quantity else 0 end
    ) as quantity
  ) adjusted on adjusted.quantity>0
  where private.cozy_owned_quantity(p_player_profile_id,item.id)>0
     or item.id=recipe.output_item_definition_id
     or exists(select 1 from public.cozy_recipe_ingredients ingredient
       where ingredient.recipe_definition_id=recipe.id and ingredient.item_definition_id=item.id);
  return required_slots<=capacity;
end;
$$;

create or replace function private.cozy_recipe_maximum(
  p_player_profile_id uuid, p_recipe_definition_id uuid
)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare recipe public.cozy_recipe_definitions%rowtype; ingredient record;
  account public.player_dust_accounts%rowtype; maximum integer := 99;
begin
  select * into strict recipe from public.cozy_recipe_definitions where id=p_recipe_definition_id;
  for ingredient in select * from public.cozy_recipe_ingredients where recipe_definition_id=recipe.id loop
    maximum:=least(maximum,private.cozy_owned_quantity(p_player_profile_id,ingredient.item_definition_id)/ingredient.quantity);
  end loop;
  select * into strict account from public.player_dust_accounts where player_profile_id=p_player_profile_id;
  if recipe.dust_fee>0 then maximum:=least(maximum,least(account.balance/recipe.dust_fee,99)::integer); end if;
  while maximum>0 and (recipe.output_quantity*maximum>10000
    or not private.cozy_recipe_capacity_fits(p_player_profile_id,recipe.id,maximum)) loop
    maximum:=maximum-1;
  end loop;
  return greatest(maximum,0);
end;
$$;

create or replace function public.get_player_item_catalog(p_wallet_address text,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype;moderation public.player_moderation_states%rowtype;
  selected_rows record;config public.cozy_gameplay_config%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ITEM_CATALOG_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows from public.player_profiles p
  join public.player_moderation_states m on m.player_profile_id=p.id where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'inventory_read',config.read_rate_limit) then return jsonb_build_object('status','rate_limited'); end if;
  return jsonb_build_object('status','loaded','contentVersion',config.content_version,'generatedAt',now(),
    'items',coalesce((select jsonb_agg(private.cozy_item_json(item) order by item.category,item.slug)
      from public.cozy_item_definitions item where item.active or exists(
        select 1 from public.player_inventory_stacks stack where stack.player_profile_id=profile.id and stack.item_definition_id=item.id
      )),'[]'::jsonb));
end;
$$;

create or replace function public.get_player_recipe_catalog(
  p_wallet_address text,p_kind text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype;moderation public.player_moderation_states%rowtype;
  selected_rows record;config public.cozy_gameplay_config%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_kind not in ('all','cooking','crafting')
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_RECIPE_CATALOG_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows from public.player_profiles p
  join public.player_moderation_states m on m.player_profile_id=p.id where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'recipe_read',config.read_rate_limit) then return jsonb_build_object('status','rate_limited'); end if;
  return jsonb_build_object('status','loaded','contentVersion',config.content_version,
    'recipes',coalesce((select jsonb_agg(jsonb_build_object(
      'recipe',private.cozy_recipe_json(recipe),
      'maximumCraftable',case when recipe.active then private.cozy_recipe_maximum(profile.id,recipe.id) else 0 end,
      'disabledReason',case when not recipe.active then 'This recipe is currently unavailable.'
        when private.cozy_recipe_maximum(profile.id,recipe.id)=0 then 'Required ingredients, DUST, or inventory space are unavailable.' else null end
    ) order by recipe.kind,recipe.slug) from public.cozy_recipe_definitions recipe
      where p_kind='all' or recipe.kind=p_kind),'[]'::jsonb));
end;
$$;

create or replace function public.perform_player_recipe_action(
  p_wallet_address text,p_kind text,p_recipe_slug text,p_station_interaction_id text,
  p_quantity integer,p_expected_inventory_state_version integer,p_expected_dust_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype;moderation public.player_moderation_states%rowtype;
  selected_rows record;config public.cozy_gameplay_config%rowtype;recipe public.cozy_recipe_definitions%rowtype;
  station public.cozy_gameplay_stations%rowtype;inventory_state public.player_inventory_state%rowtype;
  account public.player_dust_accounts%rowtype;ingredient record;receipt public.cozy_gameplay_idempotency%rowtype;
  operation_key text;inventory_reason text;request_hash text;response jsonb;output_item public.cozy_item_definitions%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_kind not in ('cooking','crafting') or p_recipe_slug is null or p_recipe_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_station_interaction_id is null or p_station_interaction_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_quantity not between 1 and 99 or p_expected_inventory_state_version<1 or p_expected_dust_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_RECIPE_ACTION_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows from public.player_profiles p
  join public.player_moderation_states m on m.player_profile_id=p.id where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'recipe_write',config.mutation_rate_limit) then return jsonb_build_object('status','rate_limited'); end if;
  operation_key:=case when p_kind='cooking' then 'recipe_cook' else 'recipe_craft' end;
  inventory_reason:=case when p_kind='cooking' then 'cooking' else 'crafting' end;
  request_hash:=encode(extensions.digest(convert_to(p_kind||':'||p_recipe_slug||':'||p_station_interaction_id||':'||p_quantity::text||':'||p_expected_inventory_state_version::text||':'||p_expected_dust_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cozy-idem:'||profile.id::text||':'||operation_key||':'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency where player_profile_id=profile.id and operation=operation_key and idempotency_key=p_idempotency_key;
  if found then if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb); end if;
  select * into recipe from public.cozy_recipe_definitions where slug=p_recipe_slug and kind=p_kind and active;
  if not found then return jsonb_build_object('status','recipe_unavailable'); end if;
  select * into station from public.cozy_gameplay_stations where interaction_id=p_station_interaction_id and station_type=recipe.station_type and active;
  if not found or profile.current_map_id<>(select slug from public.world_maps where id=station.world_map_id)
     or profile.current_map_version_id is distinct from station.map_version_id
     or sqrt(power(profile.safe_position_x-station.position_x,2)+power(profile.safe_position_y-station.position_y,2))>station.interaction_range then
    return jsonb_build_object('status','invalid_station'); end if;
  select * into strict inventory_state from public.player_inventory_state where player_profile_id=profile.id for update;
  select * into strict account from public.player_dust_accounts where player_profile_id=profile.id for update;
  if inventory_state.state_version<>p_expected_inventory_state_version or account.state_version<>p_expected_dust_state_version then return jsonb_build_object('status','state_conflict'); end if;
  for ingredient in select * from public.cozy_recipe_ingredients where recipe_definition_id=recipe.id loop
    if private.cozy_owned_quantity(profile.id,ingredient.item_definition_id)<ingredient.quantity*p_quantity then return jsonb_build_object('status','missing_ingredients'); end if;
  end loop;
  if account.balance<recipe.dust_fee*p_quantity then return jsonb_build_object('status','insufficient_dust'); end if;
  if recipe.output_quantity*p_quantity>10000 then return jsonb_build_object('status','invalid_quantity'); end if;
  if not private.cozy_recipe_capacity_fits(profile.id,recipe.id,p_quantity) then return jsonb_build_object('status','inventory_full'); end if;
  for ingredient in select * from public.cozy_recipe_ingredients where recipe_definition_id=recipe.id order by item_definition_id loop
    if not private.cozy_remove_item(profile.id,ingredient.item_definition_id,ingredient.quantity*p_quantity,
      inventory_reason,recipe.id::text,p_idempotency_key,p_request_id) then raise exception 'RECIPE_INGREDIENT_LOCK_FAILED'; end if;
  end loop;
  if not private.cozy_add_item(profile.id,recipe.output_item_definition_id,recipe.output_quantity*p_quantity,
    inventory_reason,recipe.id::text,p_idempotency_key,p_request_id) then raise exception 'RECIPE_OUTPUT_LOCK_FAILED'; end if;
  if recipe.dust_fee>0 and not private.cozy_apply_dust_delta(profile.id,-recipe.dust_fee*p_quantity,
    'crafting_fee','recipe_action',recipe.id::text,
    encode(extensions.digest(convert_to(operation_key||':'||p_idempotency_key,'UTF8'),'sha256'),'hex'),
    p_request_id) then raise exception 'RECIPE_DUST_LOCK_FAILED'; end if;
  select * into strict inventory_state from public.player_inventory_state where player_profile_id=profile.id;
  select * into strict account from public.player_dust_accounts where player_profile_id=profile.id;
  select * into strict output_item from public.cozy_item_definitions where id=recipe.output_item_definition_id;
  response:=jsonb_build_object('status','updated','recipeSlug',recipe.slug,'quantity',p_quantity,
    'outputItemSlug',output_item.slug,'outputQuantity',recipe.output_quantity*p_quantity,
    'dustBalance',account.balance,'inventoryStateVersion',inventory_state.state_version,'replayed',false);
  insert into public.cozy_gameplay_idempotency(player_profile_id,operation,idempotency_key,request_hash,response,request_id)
  values(profile.id,operation_key,p_idempotency_key,request_hash,response,p_request_id);
  insert into public.cozy_gameplay_action_events(player_profile_id,operation,target_type,target_id,idempotency_key,request_id,result_summary)
  values(profile.id,operation_key,'recipe',recipe.id,p_idempotency_key,p_request_id,
    jsonb_build_object('recipeSlug',recipe.slug,'quantity',p_quantity,'outputItemSlug',output_item.slug,'outputQuantity',recipe.output_quantity*p_quantity));
  return response;
end;
$$;

create or replace function public.get_player_shop_catalog(
  p_wallet_address text,p_shop_slug text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype;moderation public.player_moderation_states%rowtype;
  selected_rows record;config public.cozy_gameplay_config%rowtype;shop public.cozy_shop_definitions%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_slug is null or p_shop_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_SHOP_CATALOG_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows from public.player_profiles p
  join public.player_moderation_states m on m.player_profile_id=p.id where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'shop_read',config.read_rate_limit) then return jsonb_build_object('status','rate_limited'); end if;
  select * into shop from public.cozy_shop_definitions where slug=p_shop_slug and active;
  if not found then return jsonb_build_object('status','shop_offer_unavailable'); end if;
  return jsonb_build_object('status','loaded','shop',private.cozy_shop_json(shop),
    'offers',coalesce((select jsonb_agg(private.cozy_shop_offer_json(offer) order by item.category,item.slug)
      from public.cozy_shop_offers offer join public.cozy_item_definitions item on item.id=offer.item_definition_id
      where offer.shop_definition_id=shop.id and offer.active
        and (offer.available_from is null or offer.available_from<=now())
        and (offer.available_until is null or offer.available_until>now())
        and item.active),'[]'::jsonb),'generatedAt',now());
end;
$$;

create or replace function public.transact_player_shop(
  p_wallet_address text,p_shop_slug text,p_offer_id uuid,p_operation text,p_quantity integer,
  p_expected_dust_state_version integer,p_expected_inventory_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype;moderation public.player_moderation_states%rowtype;
  selected_rows record;config public.cozy_gameplay_config%rowtype;shop public.cozy_shop_definitions%rowtype;
  shop_anchor public.cozy_shop_interactions%rowtype;offer public.cozy_shop_offers%rowtype;
  item public.cozy_item_definitions%rowtype;account public.player_dust_accounts%rowtype;
  inventory_state public.player_inventory_state%rowtype;receipt public.cozy_gameplay_idempotency%rowtype;
  operation_key text;request_hash text;response jsonb;transaction_id uuid:=gen_random_uuid();
  total bigint;total_numeric numeric;dust_delta bigint;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_slug is null or p_shop_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_offer_id is null or p_operation not in ('buy','sell') or p_quantity not between 1 and 99
     or p_expected_dust_state_version<1 or p_expected_inventory_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_SHOP_TRANSACTION_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows from public.player_profiles p
  join public.player_moderation_states m on m.player_profile_id=p.id where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'shop_write',config.mutation_rate_limit) then return jsonb_build_object('status','rate_limited'); end if;
  operation_key:=case when p_operation='buy' then 'shop_buy' else 'shop_sell' end;
  request_hash:=encode(extensions.digest(convert_to(p_shop_slug||':'||p_offer_id::text||':'||p_operation||':'||p_quantity::text||':'||p_expected_dust_state_version::text||':'||p_expected_inventory_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cozy-idem:'||profile.id::text||':'||operation_key||':'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency where player_profile_id=profile.id and operation=operation_key and idempotency_key=p_idempotency_key;
  if found then if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb); end if;
  select * into shop from public.cozy_shop_definitions where slug=p_shop_slug and active;
  if not found then return jsonb_build_object('status','shop_offer_unavailable'); end if;
  select * into shop_anchor from public.cozy_shop_interactions where shop_definition_id=shop.id and active;
  if not found or profile.current_map_id<>(select slug from public.world_maps where id=shop_anchor.world_map_id)
     or profile.current_map_version_id is distinct from shop_anchor.map_version_id
     or sqrt(power(profile.safe_position_x-shop_anchor.position_x,2)+power(profile.safe_position_y-shop_anchor.position_y,2))>shop_anchor.interaction_range then
    return jsonb_build_object('status','shop_offer_unavailable'); end if;
  select * into offer from public.cozy_shop_offers where id=p_offer_id and shop_definition_id=shop.id and active
    and (available_from is null or available_from<=now()) and (available_until is null or available_until>now());
  if not found then return jsonb_build_object('status','shop_offer_unavailable'); end if;
  if p_quantity<offer.minimum_quantity or p_quantity>offer.maximum_quantity then return jsonb_build_object('status','invalid_quantity'); end if;
  select * into strict item from public.cozy_item_definitions where id=offer.item_definition_id and active;
  select * into strict account from public.player_dust_accounts where player_profile_id=profile.id for update;
  select * into strict inventory_state from public.player_inventory_state where player_profile_id=profile.id for update;
  if account.state_version<>p_expected_dust_state_version or inventory_state.state_version<>p_expected_inventory_state_version then return jsonb_build_object('status','state_conflict'); end if;
  if p_operation='buy' then
    if offer.buy_price is null or not item.buy_eligible then return jsonb_build_object('status','shop_offer_unavailable'); end if;
    total_numeric:=offer.buy_price::numeric*p_quantity;
    if total_numeric>9000000000000000 then return jsonb_build_object('status','invalid_quantity'); end if;
    total:=total_numeric::bigint;dust_delta:=-total;
    if account.balance<total then return jsonb_build_object('status','insufficient_dust'); end if;
    if not private.cozy_can_add_item(profile.id,item.id,p_quantity) then return jsonb_build_object('status','inventory_full'); end if;
    if not private.cozy_apply_dust_delta(profile.id,dust_delta,'shop_purchase','shop_transaction',transaction_id::text,
      encode(extensions.digest(convert_to(operation_key||':'||p_idempotency_key,'UTF8'),'sha256'),'hex'),p_request_id) then raise exception 'SHOP_DUST_LOCK_FAILED'; end if;
    if not private.cozy_add_item(profile.id,item.id,p_quantity,'shop_purchase',transaction_id::text,p_idempotency_key,p_request_id) then raise exception 'SHOP_INVENTORY_LOCK_FAILED'; end if;
  else
    if offer.sell_price is null or not item.sell_eligible or item.category in ('permanent_tool','special') then return jsonb_build_object('status','shop_offer_unavailable'); end if;
    total_numeric:=offer.sell_price::numeric*p_quantity;
    if total_numeric>9000000000000000 then return jsonb_build_object('status','invalid_quantity'); end if;
    total:=total_numeric::bigint;dust_delta:=total;
    if private.cozy_owned_quantity(profile.id,item.id)<p_quantity then return jsonb_build_object('status','item_unavailable'); end if;
    if not private.cozy_remove_item(profile.id,item.id,p_quantity,'shop_sale',transaction_id::text,p_idempotency_key,p_request_id) then raise exception 'SHOP_INVENTORY_LOCK_FAILED'; end if;
    if not private.cozy_apply_dust_delta(profile.id,dust_delta,'shop_sale','shop_transaction',transaction_id::text,
      encode(extensions.digest(convert_to(operation_key||':'||p_idempotency_key,'UTF8'),'sha256'),'hex'),p_request_id) then raise exception 'SHOP_DUST_LOCK_FAILED'; end if;
  end if;
  select * into strict account from public.player_dust_accounts where player_profile_id=profile.id;
  select * into strict inventory_state from public.player_inventory_state where player_profile_id=profile.id;
  response:=jsonb_build_object('status','updated','transactionId',transaction_id,'operation',p_operation,
    'itemSlug',item.slug,'quantity',p_quantity,'dustDelta',dust_delta,'dustBalance',account.balance,
    'dustStateVersion',account.state_version,'inventoryStateVersion',inventory_state.state_version,'replayed',false);
  insert into public.cozy_gameplay_idempotency(player_profile_id,operation,idempotency_key,request_hash,response,request_id)
  values(profile.id,operation_key,p_idempotency_key,request_hash,response,p_request_id);
  insert into public.cozy_gameplay_action_events(player_profile_id,operation,target_type,target_id,idempotency_key,request_id,result_summary)
  values(profile.id,operation_key,'shop_offer',offer.id,p_idempotency_key,p_request_id,
    jsonb_build_object('transactionId',transaction_id,'operation',p_operation,'itemSlug',item.slug,'quantity',p_quantity,'dustDelta',dust_delta));
  return response;
end;
$$;

-- Canonical recipes and ingredients.
insert into public.cozy_recipe_definitions (
  id, slug, name, description, kind, station_type, output_item_definition_id,
  output_quantity, dust_fee, active, content_version
) values
  ('73000000-0000-4000-8000-000000000001', 'moonbean-salad', 'Moonbean Salad', 'A crisp farm-to-table salad.', 'cooking', 'cooking_hearth', '71000000-0000-4000-8000-000000000009', 1, 0, true, 1),
  ('73000000-0000-4000-8000-000000000002', 'sunroot-soup', 'Sunroot Soup', 'A warm and simple village soup.', 'cooking', 'cooking_hearth', '71000000-0000-4000-8000-000000000010', 1, 0, true, 1),
  ('73000000-0000-4000-8000-000000000003', 'cloudberry-tart', 'Cloudberry Tart', 'A bright tart for a quiet evening.', 'cooking', 'cooking_hearth', '71000000-0000-4000-8000-000000000011', 1, 0, true, 1),
  ('73000000-0000-4000-8000-000000000004', 'meadow-biscuit', 'Meadow Biscuit', 'A soft biscuit made from simple harvests.', 'cooking', 'cooking_hearth', '71000000-0000-4000-8000-000000000012', 2, 0, true, 1),
  ('73000000-0000-4000-8000-000000000005', 'garden-twine', 'Garden Twine', 'Twist Moonbean fibers into useful twine.', 'crafting', 'crafting_workbench', '71000000-0000-4000-8000-000000000013', 1, 0, true, 1),
  ('73000000-0000-4000-8000-000000000006', 'willow-chair', 'Willow Chair', 'Build a simple chair for the starter home.', 'crafting', 'crafting_workbench', '71000000-0000-4000-8000-000000000015', 1, 0, true, 1)
on conflict (id) do nothing;

insert into public.cozy_recipe_ingredients (recipe_definition_id, item_definition_id, quantity) values
  ('73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', 2),
  ('73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000006', 1),
  ('73000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000005', 2),
  ('73000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000007', 1),
  ('73000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000006', 2),
  ('73000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000007', 1),
  ('73000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000004', 1),
  ('73000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000007', 1),
  ('73000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000004', 2),
  ('73000000-0000-4000-8000-000000000006', '71000000-0000-4000-8000-000000000008', 2),
  ('73000000-0000-4000-8000-000000000006', '71000000-0000-4000-8000-000000000013', 1)
on conflict do nothing;

insert into public.cozy_shop_definitions (id, slug, name, description, active, content_version)
values ('74000000-0000-4000-8000-000000000001', 'lantern-general-store', 'Lantern General Store', 'Seeds, pantry goods, materials, and starter furnishings.', true, 1)
on conflict (id) do nothing;

insert into public.cozy_shop_offers (
  id, shop_definition_id, item_definition_id, buy_price, sell_price,
  minimum_quantity, maximum_quantity, active, available_from, available_until, content_version
) values
  ('74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 8, null, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000012', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 10, null, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000013', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000003', 12, null, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000014', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000007', 6, 2, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000015', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000008', 9, 4, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000016', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', null, 7, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000017', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000005', null, 9, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000018', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000006', null, 11, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000019', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000015', 48, null, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000020', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000016', 70, null, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000021', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000017', 55, null, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000022', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000018', 60, null, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000023', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000019', 65, null, 1, 20, true, null, null, 1),
  ('74000000-0000-4000-8000-000000000024', '74000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000020', 38, null, 1, 20, true, null, null, 1)
on conflict (id) do nothing;

-- Private personal overlays are pinned to the currently published meadow version.
with meadow as (
  select map.id as map_id, map.active_published_version_id as version_id
  from public.world_maps map where map.slug = 'moonpetal-meadow'
)
insert into public.cozy_farm_plot_anchors (
  id, anchor_id, interaction_id, world_map_id, map_version_id, slot,
  position_x, position_y, interaction_range, active, content_version
)
select seed.id, seed.anchor_id, seed.interaction_id, meadow.map_id, meadow.version_id,
  seed.slot, seed.x, seed.y, 1.10, true, 1
from meadow
cross join (values
  ('77000000-0000-4000-8000-000000000001'::uuid, 'moonpetal-starter-1', 'phase7-farm-plot-1', 1, 12.25::numeric, 11.75::numeric),
  ('77000000-0000-4000-8000-000000000002'::uuid, 'moonpetal-starter-2', 'phase7-farm-plot-2', 2, 13.50::numeric, 11.75::numeric),
  ('77000000-0000-4000-8000-000000000003'::uuid, 'moonpetal-starter-3', 'phase7-farm-plot-3', 3, 14.75::numeric, 11.75::numeric),
  ('77000000-0000-4000-8000-000000000004'::uuid, 'moonpetal-starter-4', 'phase7-farm-plot-4', 4, 12.25::numeric, 13.25::numeric),
  ('77000000-0000-4000-8000-000000000005'::uuid, 'moonpetal-starter-5', 'phase7-farm-plot-5', 5, 13.50::numeric, 13.25::numeric),
  ('77000000-0000-4000-8000-000000000006'::uuid, 'moonpetal-starter-6', 'phase7-farm-plot-6', 6, 14.75::numeric, 13.25::numeric)
) seed(id, anchor_id, interaction_id, slot, x, y)
where meadow.version_id is not null
on conflict (id) do nothing;

with square as (
  select map.id as map_id, map.active_published_version_id as version_id
  from public.world_maps map where map.slug = 'lantern-square'
)
insert into public.cozy_gameplay_stations (
  id, interaction_id, station_type, world_map_id, map_version_id,
  position_x, position_y, interaction_range, active, content_version
)
select seed.id, seed.interaction_id, seed.station_type, square.map_id, square.version_id,
  seed.x, seed.y, seed.range, true, 1
from square
cross join (values
  ('78000000-0000-4000-8000-000000000001'::uuid, 'phase7-cooking-hearth', 'cooking_hearth', 14.8::numeric, 6.1::numeric, 1.35::numeric),
  ('78000000-0000-4000-8000-000000000002'::uuid, 'phase7-crafting-workbench', 'crafting_workbench', 14.8::numeric, 7.8::numeric, 1.35::numeric)
) seed(id, interaction_id, station_type, x, y, range)
where square.version_id is not null
on conflict (id) do nothing;

with square as (
  select map.id as map_id, map.active_published_version_id as version_id
  from public.world_maps map where map.slug = 'lantern-square'
)
insert into public.cozy_shop_interactions (
  id, shop_definition_id, interaction_id, world_map_id, map_version_id,
  position_x, position_y, interaction_range, active, content_version
)
select '78000000-0000-4000-8000-000000000003',
  '74000000-0000-4000-8000-000000000001', 'phase7-general-store',
  square.map_id, square.version_id, 5, 5.7, 1.5, true, 1
from square where square.version_id is not null
on conflict (id) do nothing;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'cozy_crop_definitions','cozy_recipe_definitions','cozy_recipe_ingredients',
    'cozy_shop_definitions','cozy_shop_offers','cozy_farm_plot_anchors',
    'cozy_gameplay_stations','cozy_shop_interactions','player_farm_plots',
    'cozy_gameplay_action_events'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role',table_name);
  end loop;
end;
$$;

revoke all on function private.claim_cozy_gameplay_rate_limit(uuid,text,integer) from public,anon,authenticated,service_role;
revoke all on function private.ensure_player_farm_plots(uuid) from public,anon,authenticated,service_role;
revoke all on function private.cozy_player_bootstrapped(uuid) from public,anon,authenticated,service_role;
revoke all on function private.cozy_crop_json(public.cozy_crop_definitions) from public,anon,authenticated,service_role;
revoke all on function private.cozy_farm_plot_json(public.player_farm_plots) from public,anon,authenticated,service_role;
revoke all on function private.cozy_recipe_json(public.cozy_recipe_definitions) from public,anon,authenticated,service_role;
revoke all on function private.cozy_shop_json(public.cozy_shop_definitions) from public,anon,authenticated,service_role;
revoke all on function private.cozy_shop_offer_json(public.cozy_shop_offers) from public,anon,authenticated,service_role;
revoke all on function private.cozy_owned_quantity(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.cozy_can_add_item(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function private.cozy_add_item(uuid,uuid,integer,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.cozy_remove_item(uuid,uuid,integer,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.cozy_apply_dust_delta(uuid,bigint,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.cozy_recipe_capacity_fits(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function private.cozy_recipe_maximum(uuid,uuid) from public,anon,authenticated,service_role;

revoke all on function public.bootstrap_player_cozy_gameplay(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_player_farm_plots(text,text) from public,anon,authenticated,service_role;
revoke all on function public.plant_player_farm_plot(text,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.water_player_farm_plot(text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.harvest_player_farm_plot(text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_player_item_catalog(text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_player_recipe_catalog(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.perform_player_recipe_action(text,text,text,text,integer,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_player_shop_catalog(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.transact_player_shop(text,text,uuid,text,integer,integer,integer,text,text) from public,anon,authenticated,service_role;

grant execute on function public.bootstrap_player_cozy_gameplay(text,text,text) to service_role;
grant execute on function public.get_player_farm_plots(text,text) to service_role;
grant execute on function public.plant_player_farm_plot(text,uuid,text,integer,text,text) to service_role;
grant execute on function public.water_player_farm_plot(text,uuid,integer,text,text) to service_role;
grant execute on function public.harvest_player_farm_plot(text,uuid,integer,text,text) to service_role;
grant execute on function public.get_player_item_catalog(text,text) to service_role;
grant execute on function public.get_player_recipe_catalog(text,text,text) to service_role;
grant execute on function public.perform_player_recipe_action(text,text,text,text,integer,integer,integer,text,text) to service_role;
grant execute on function public.get_player_shop_catalog(text,text,text) to service_role;
grant execute on function public.transact_player_shop(text,text,uuid,text,integer,integer,integer,text,text) to service_role;
