-- Starville Phase 7A: server-authoritative DUST, inventory, quickbar, and item catalog.
-- DUST is an off-chain, non-transferable gameplay currency. This migration adds no
-- blockchain rewards, trading, farming, cooking, shops, or housing behavior.

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
      when 'ingredient' then
        p_metadata = '{"kind":"ingredient"}'::jsonb
      when 'cooked_food' then
        p_metadata = '{"kind":"cooked_food"}'::jsonb
      when 'crafted_material' then
        p_metadata = '{"kind":"crafted_material"}'::jsonb
      when 'furniture' then
        (select array_agg(key order by key) from jsonb_object_keys(p_metadata) as key)
          = array['furnitureSlug', 'kind']::text[]
        and p_metadata ->> 'kind' = 'furniture'
        and p_metadata ->> 'furnitureSlug' ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        and char_length(p_metadata ->> 'furnitureSlug') between 1 and 80
      when 'permanent_tool' then
        p_metadata = '{"kind":"permanent_tool","toolType":"watering_can"}'::jsonb
      when 'special' then
        (select array_agg(key order by key) from jsonb_object_keys(p_metadata) as key)
          = array['kind', 'purpose']::text[]
        and p_metadata ->> 'kind' = 'special'
        and char_length(p_metadata ->> 'purpose') between 1 and 80
        and p_metadata ->> 'purpose' !~ '[[:cntrl:]<>]'
      else false
    end;
$$;

create table public.cozy_item_definitions (
  id uuid primary key,
  slug text not null unique check (
    char_length(slug) between 1 and 80
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  name text not null check (
    char_length(name) between 1 and 80
    and name = btrim(name)
    and name !~ '[[:cntrl:]<>]'
  ),
  description text not null check (
    char_length(description) between 1 and 280
    and description = btrim(description)
    and description !~ '[[:cntrl:]<>]'
  ),
  category text not null check (category in (
    'seed', 'crop', 'ingredient', 'cooked_food', 'crafted_material',
    'furniture', 'permanent_tool', 'special'
  )),
  stackable boolean not null,
  max_stack_size integer not null check (max_stack_size between 1 and 999),
  buy_eligible boolean not null,
  sell_eligible boolean not null,
  default_buy_price bigint check (default_buy_price between 1 and 9000000000000000),
  default_sell_price bigint check (default_sell_price between 1 and 9000000000000000),
  asset_ref text check (
    asset_ref is null or (
      char_length(asset_ref) between 1 and 80
      and asset_ref ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  ),
  asset_readiness text not null check (
    asset_readiness in ('approved', 'development_marker', 'missing')
  ),
  active boolean not null default true,
  content_version integer not null check (content_version > 0),
  metadata jsonb not null check (private.valid_cozy_item_metadata(category, metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cozy_item_stackability_check check (
    (stackable and max_stack_size >= 1) or (not stackable and max_stack_size = 1)
  ),
  constraint cozy_item_buy_price_check check (
    (buy_eligible and default_buy_price is not null)
    or (not buy_eligible and default_buy_price is null)
  ),
  constraint cozy_item_sell_price_check check (
    (sell_eligible and default_sell_price is not null)
    or (not sell_eligible and default_sell_price is null)
  ),
  constraint cozy_item_asset_check check (
    asset_readiness <> 'approved' or asset_ref is not null
  ),
  constraint cozy_permanent_tool_check check (
    category <> 'permanent_tool'
    or (not stackable and max_stack_size = 1 and not buy_eligible and not sell_eligible)
  )
);

create table public.cozy_gameplay_config (
  id smallint primary key default 1 check (id = 1),
  content_version integer not null check (content_version > 0),
  starter_dust bigint not null check (starter_dust between 1 and 9000000000000000),
  inventory_capacity integer not null check (inventory_capacity between 8 and 200),
  quickbar_slot_count integer not null check (quickbar_slot_count = 8),
  starter_tool_item_definition_id uuid not null
    references public.cozy_item_definitions(id) on delete restrict,
  bootstrap_rate_limit integer not null check (bootstrap_rate_limit between 1 and 120),
  read_rate_limit integer not null check (read_rate_limit between 1 and 600),
  mutation_rate_limit integer not null check (mutation_rate_limit between 1 and 120),
  config_version integer not null default 1 check (config_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_dust_accounts (
  player_profile_id uuid primary key references public.player_profiles(id) on delete restrict,
  balance bigint not null default 0 check (balance between 0 and 9000000000000000),
  state_version integer not null default 1 check (state_version > 0),
  starter_grant_applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_dust_ledger (
  id uuid primary key default gen_random_uuid(),
  entry_number bigint generated always as identity unique,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  delta bigint not null check (delta between -9000000000000000 and 9000000000000000 and delta <> 0),
  resulting_balance bigint not null check (resulting_balance between 0 and 9000000000000000),
  reason text not null check (reason in (
    'starter_grant', 'shop_purchase', 'shop_sale', 'crafting_fee',
    'system_refund', 'migration_adjustment'
  )),
  reference_type text not null check (reference_type in (
    'player_bootstrap', 'shop_transaction', 'recipe_action', 'system_operation', 'migration'
  )),
  reference_id text check (
    reference_id is null or (
      char_length(reference_id) between 1 and 128
      and reference_id = btrim(reference_id)
      and reference_id !~ '[[:cntrl:]<>]'
    )
  ),
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  unique (player_profile_id, idempotency_key)
);

create table public.player_inventory_state (
  player_profile_id uuid primary key references public.player_profiles(id) on delete restrict,
  capacity integer not null check (capacity between 8 and 200),
  state_version integer not null default 1 check (state_version > 0),
  quickbar_state_version integer not null default 1 check (quickbar_state_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_inventory_stacks (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  slot_index integer not null check (slot_index between 1 and 200),
  quantity integer not null check (quantity between 1 and 10000),
  state_version integer not null default 1 check (state_version > 0),
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_profile_id, slot_index),
  unique (player_profile_id, id)
);

create table public.player_inventory_history (
  id uuid primary key default gen_random_uuid(),
  entry_number bigint generated always as identity unique,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  inventory_stack_id uuid,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  delta integer not null check (delta between -10000 and 10000 and delta <> 0),
  resulting_quantity integer not null check (resulting_quantity between 0 and 10000),
  reason text not null check (reason in (
    'starter_grant', 'shop_purchase', 'shop_sale', 'planting', 'harvest',
    'cooking', 'crafting', 'furniture_placement', 'furniture_removal', 'system_refund'
  )),
  reference_id text check (
    reference_id is null or (
      char_length(reference_id) between 1 and 128
      and reference_id = btrim(reference_id)
      and reference_id !~ '[[:cntrl:]<>]'
    )
  ),
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  unique (player_profile_id, item_definition_id, reason, idempotency_key)
);

create table public.player_quickbar_assignments (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  slot_index integer not null check (slot_index between 1 and 8),
  inventory_stack_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_profile_id, slot_index),
  unique (player_profile_id, inventory_stack_id),
  foreign key (player_profile_id, inventory_stack_id)
    references public.player_inventory_stacks(player_profile_id, id) on delete cascade
);

create table public.cozy_gameplay_idempotency (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  operation text not null check (operation in ('bootstrap', 'quickbar_update')),
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  ),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  primary key (player_profile_id, operation, idempotency_key)
);

create table public.cozy_gameplay_rate_limits (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  scope text not null check (scope in (
    'bootstrap', 'dust_read', 'inventory_read', 'history_read', 'quickbar_write'
  )),
  attempt_count integer not null check (attempt_count between 1 and 1000000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (player_profile_id, scope),
  check (
    window_expires_at > window_started_at
    and window_expires_at <= window_started_at + interval '10 minutes'
  )
);

create index cozy_item_definitions_active_category_idx
  on public.cozy_item_definitions (active, category, slug);
create index player_dust_ledger_page_idx
  on public.player_dust_ledger (player_profile_id, entry_number desc);
create index player_inventory_stacks_player_item_idx
  on public.player_inventory_stacks (player_profile_id, item_definition_id, slot_index);
create index player_inventory_history_page_idx
  on public.player_inventory_history (player_profile_id, entry_number desc);
create index cozy_gameplay_idempotency_created_idx
  on public.cozy_gameplay_idempotency (created_at);
create index cozy_gameplay_rate_limits_expiry_idx
  on public.cozy_gameplay_rate_limits (window_expires_at);

create trigger cozy_item_definitions_set_updated_at
before update on public.cozy_item_definitions
for each row execute function private.set_updated_at();
create trigger cozy_gameplay_config_set_updated_at
before update on public.cozy_gameplay_config
for each row execute function private.set_updated_at();
create trigger player_dust_accounts_set_updated_at
before update on public.player_dust_accounts
for each row execute function private.set_updated_at();
create trigger player_inventory_state_set_updated_at
before update on public.player_inventory_state
for each row execute function private.set_updated_at();
create trigger player_inventory_stacks_set_updated_at
before update on public.player_inventory_stacks
for each row execute function private.set_updated_at();
create trigger player_quickbar_assignments_set_updated_at
before update on public.player_quickbar_assignments
for each row execute function private.set_updated_at();

create or replace function private.reject_cozy_append_only_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'COZY_GAMEPLAY_HISTORY_APPEND_ONLY';
end;
$$;

create or replace function private.validate_cozy_inventory_stack()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.cozy_item_definitions%rowtype;
  state public.player_inventory_state%rowtype;
begin
  select * into strict item from public.cozy_item_definitions where id = new.item_definition_id;
  select * into strict state from public.player_inventory_state
  where player_profile_id = new.player_profile_id;
  if new.quantity > item.max_stack_size
     or (not item.stackable and new.quantity <> 1)
     or new.slot_index > state.capacity then
    raise exception using errcode = '23514', message = 'INVALID_INVENTORY_STACK';
  end if;
  return new;
end;
$$;

create trigger player_inventory_stacks_validate
before insert or update on public.player_inventory_stacks
for each row execute function private.validate_cozy_inventory_stack();

create trigger player_dust_ledger_append_only
before update or delete on public.player_dust_ledger
for each row execute function private.reject_cozy_append_only_mutation();
create trigger player_inventory_history_append_only
before update or delete on public.player_inventory_history
for each row execute function private.reject_cozy_append_only_mutation();
create trigger cozy_gameplay_idempotency_append_only
before update or delete on public.cozy_gameplay_idempotency
for each row execute function private.reject_cozy_append_only_mutation();

-- Canonical Phase 7 content. UUIDs and slugs match @starville/cozy-gameplay.
insert into public.cozy_item_definitions (
  id, slug, name, description, category, stackable, max_stack_size,
  buy_eligible, sell_eligible, default_buy_price, default_sell_price,
  asset_ref, asset_readiness, active, content_version, metadata
) values
  ('71000000-0000-4000-8000-000000000001', 'moonbean-seed', 'Moonbean Seed', 'A gentle meadow seed for Moonbeans.', 'seed', true, 99, true, false, 8, null, 'phase7-dev-moonbean-seed', 'development_marker', true, 1, '{"kind":"seed","cropSlug":"moonbean"}'),
  ('71000000-0000-4000-8000-000000000002', 'sunroot-seed', 'Sunroot Seed', 'A warm seed that grows into a golden Sunroot.', 'seed', true, 99, true, false, 10, null, 'phase7-dev-sunroot-seed', 'development_marker', true, 1, '{"kind":"seed","cropSlug":"sunroot"}'),
  ('71000000-0000-4000-8000-000000000003', 'cloudberry-seed', 'Cloudberry Seed', 'A pale berry seed suited to Moonpetal Meadow.', 'seed', true, 99, true, false, 12, null, 'phase7-dev-cloudberry-seed', 'development_marker', true, 1, '{"kind":"seed","cropSlug":"cloudberry"}'),
  ('71000000-0000-4000-8000-000000000004', 'moonbean', 'Moonbean', 'A crisp bean gathered under soft evening light.', 'crop', true, 99, false, true, null, 7, 'phase7-dev-moonbean', 'development_marker', true, 1, '{"kind":"crop","cropSlug":"moonbean"}'),
  ('71000000-0000-4000-8000-000000000005', 'sunroot', 'Sunroot', 'A mellow root with a naturally golden center.', 'crop', true, 99, false, true, null, 9, 'phase7-dev-sunroot', 'development_marker', true, 1, '{"kind":"crop","cropSlug":"sunroot"}'),
  ('71000000-0000-4000-8000-000000000006', 'cloudberry', 'Cloudberry', 'A softly sweet berry with a misty bloom.', 'crop', true, 99, false, true, null, 11, 'phase7-dev-cloudberry', 'development_marker', true, 1, '{"kind":"crop","cropSlug":"cloudberry"}'),
  ('71000000-0000-4000-8000-000000000007', 'meadow-flour', 'Meadow Flour', 'Stone-milled flour supplied by the village shop.', 'ingredient', true, 99, true, true, 6, 2, 'phase7-dev-meadow-flour', 'development_marker', true, 1, '{"kind":"ingredient"}'),
  ('71000000-0000-4000-8000-000000000008', 'willow-timber', 'Willow Timber', 'Smooth local timber for simple home projects.', 'ingredient', true, 99, true, true, 9, 4, 'phase7-dev-willow-timber', 'development_marker', true, 1, '{"kind":"ingredient"}'),
  ('71000000-0000-4000-8000-000000000009', 'moonbean-salad', 'Moonbean Salad', 'A fresh bowl of Moonbeans and Cloudberries.', 'cooked_food', true, 20, false, true, null, 22, 'phase7-dev-moonbean-salad', 'development_marker', true, 1, '{"kind":"cooked_food"}'),
  ('71000000-0000-4000-8000-000000000010', 'sunroot-soup', 'Sunroot Soup', 'A cozy bowl of smooth Sunroot soup.', 'cooked_food', true, 20, false, true, null, 24, 'phase7-dev-sunroot-soup', 'development_marker', true, 1, '{"kind":"cooked_food"}'),
  ('71000000-0000-4000-8000-000000000011', 'cloudberry-tart', 'Cloudberry Tart', 'A small tart filled with bright Cloudberries.', 'cooked_food', true, 20, false, true, null, 28, 'phase7-dev-cloudberry-tart', 'development_marker', true, 1, '{"kind":"cooked_food"}'),
  ('71000000-0000-4000-8000-000000000012', 'meadow-biscuit', 'Meadow Biscuit', 'A tender biscuit dotted with Moonbeans.', 'cooked_food', true, 20, false, true, null, 20, 'phase7-dev-meadow-biscuit', 'development_marker', true, 1, '{"kind":"cooked_food"}'),
  ('71000000-0000-4000-8000-000000000013', 'garden-twine', 'Garden Twine', 'Strong plant fiber prepared for crafting.', 'crafted_material', true, 99, false, true, null, 8, 'phase7-dev-garden-twine', 'development_marker', true, 1, '{"kind":"crafted_material"}'),
  ('71000000-0000-4000-8000-000000000014', 'willow-planks', 'Willow Planks', 'Evenly cut planks for future home projects.', 'crafted_material', true, 99, false, true, null, 12, 'phase7-dev-willow-planks', 'development_marker', true, 1, '{"kind":"crafted_material"}'),
  ('71000000-0000-4000-8000-000000000015', 'willow-chair', 'Willow Chair', 'Willow Chair for a private starter home.', 'furniture', false, 1, true, false, 48, null, 'phase7-dev-willow-chair', 'development_marker', true, 1, '{"kind":"furniture","furnitureSlug":"willow-chair"}'),
  ('71000000-0000-4000-8000-000000000016', 'hearth-table', 'Hearth Table', 'Hearth Table for a private starter home.', 'furniture', false, 1, true, false, 70, null, 'phase7-dev-hearth-table', 'development_marker', true, 1, '{"kind":"furniture","furnitureSlug":"hearth-table"}'),
  ('71000000-0000-4000-8000-000000000017', 'moonwoven-rug', 'Moonwoven Rug', 'Moonwoven Rug for a private starter home.', 'furniture', false, 1, true, false, 55, null, 'phase7-dev-moonwoven-rug', 'development_marker', true, 1, '{"kind":"furniture","furnitureSlug":"moonwoven-rug"}'),
  ('71000000-0000-4000-8000-000000000018', 'lantern-floor-lamp', 'Lantern Floor Lamp', 'Lantern Floor Lamp for a private starter home.', 'furniture', false, 1, true, false, 60, null, 'phase7-dev-lantern-floor-lamp', 'development_marker', true, 1, '{"kind":"furniture","furnitureSlug":"lantern-floor-lamp"}'),
  ('71000000-0000-4000-8000-000000000019', 'meadow-shelf', 'Meadow Shelf', 'Meadow Shelf for a private starter home.', 'furniture', false, 1, true, false, 65, null, 'phase7-dev-meadow-shelf', 'development_marker', true, 1, '{"kind":"furniture","furnitureSlug":"meadow-shelf"}'),
  ('71000000-0000-4000-8000-000000000020', 'round-leaf-planter', 'Round-leaf Planter', 'Round-leaf Planter for a private starter home.', 'furniture', false, 1, true, false, 38, null, 'phase7-dev-round-leaf-planter', 'development_marker', true, 1, '{"kind":"furniture","furnitureSlug":"round-leaf-planter"}'),
  ('71000000-0000-4000-8000-000000000021', 'starter-watering-can', 'Starter Watering Can', 'A permanent village tool that starts crop growth.', 'permanent_tool', false, 1, false, false, null, null, 'phase7-dev-starter-watering-can', 'development_marker', true, 1, '{"kind":"permanent_tool","toolType":"watering_can"}')
on conflict (id) do nothing;

insert into public.cozy_gameplay_config (
  id, content_version, starter_dust, inventory_capacity, quickbar_slot_count,
  starter_tool_item_definition_id, bootstrap_rate_limit, read_rate_limit, mutation_rate_limit
) values (
  1, 1, 250, 24, 8, '71000000-0000-4000-8000-000000000021', 30, 120, 30
)
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
declare
  claimed boolean;
begin
  if p_player_profile_id is null
     or p_scope not in ('bootstrap', 'dust_read', 'inventory_read', 'history_read', 'quickbar_write')
     or p_limit not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_COZY_RATE_LIMIT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cozy-rate:' || p_player_profile_id::text || ':' || p_scope,
      0
    )
  );
  insert into public.cozy_gameplay_rate_limits (
    player_profile_id, scope, attempt_count, window_started_at, window_expires_at, updated_at
  ) values (
    p_player_profile_id, p_scope, 1, now(), now() + interval '1 minute', now()
  )
  on conflict (player_profile_id, scope) do update
  set attempt_count = case
        when cozy_gameplay_rate_limits.window_expires_at <= now() then 1
        else cozy_gameplay_rate_limits.attempt_count + 1
      end,
      window_started_at = case
        when cozy_gameplay_rate_limits.window_expires_at <= now() then now()
        else cozy_gameplay_rate_limits.window_started_at
      end,
      window_expires_at = case
        when cozy_gameplay_rate_limits.window_expires_at <= now()
          then now() + interval '1 minute'
        else cozy_gameplay_rate_limits.window_expires_at
      end,
      updated_at = now()
  where cozy_gameplay_rate_limits.window_expires_at <= now()
     or cozy_gameplay_rate_limits.attempt_count < p_limit
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create or replace function private.cozy_item_json(item public.cozy_item_definitions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', item.id,
    'slug', item.slug,
    'name', item.name,
    'description', item.description,
    'category', item.category,
    'stackable', item.stackable,
    'maxStackSize', item.max_stack_size,
    'buyEligible', item.buy_eligible,
    'sellEligible', item.sell_eligible,
    'defaultBuyPrice', item.default_buy_price,
    'defaultSellPrice', item.default_sell_price,
    'assetRef', item.asset_ref,
    'assetReadiness', item.asset_readiness,
    'active', item.active,
    'contentVersion', item.content_version,
    'metadata', item.metadata
  );
$$;

create or replace function private.cozy_dust_account_json(
  account public.player_dust_accounts
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'playerId', account.player_profile_id,
    'balance', account.balance,
    'stateVersion', account.state_version,
    'starterGrantAppliedAt', account.starter_grant_applied_at,
    'updatedAt', account.updated_at
  );
$$;

create or replace function private.cozy_inventory_json(p_player_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'capacity', jsonb_build_object(
      'capacity', state.capacity,
      'usedSlots', (
        select count(*) from public.player_inventory_stacks as stack
        where stack.player_profile_id = state.player_profile_id
      ),
      'stateVersion', state.state_version
    ),
    'stacks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', stack.id,
          'item', private.cozy_item_json(item),
          'quantity', stack.quantity,
          'acquiredAt', stack.acquired_at,
          'updatedAt', stack.updated_at,
          'stateVersion', stack.state_version
        ) order by stack.slot_index, stack.id
      )
      from public.player_inventory_stacks as stack
      join public.cozy_item_definitions as item on item.id = stack.item_definition_id
      where stack.player_profile_id = state.player_profile_id
    ), '[]'::jsonb)
  )
  from public.player_inventory_state as state
  where state.player_profile_id = p_player_profile_id;
$$;

create or replace function private.cozy_quickbar_json(p_player_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'assignments', (
      select jsonb_agg(
        jsonb_build_object(
          'slot', slot.slot_index,
          'inventoryStackId', assignment.inventory_stack_id,
          'assignedItemSlug', item.slug
        ) order by slot.slot_index
      )
      from generate_series(1, 8) as slot(slot_index)
      left join public.player_quickbar_assignments as assignment
        on assignment.player_profile_id = state.player_profile_id
       and assignment.slot_index = slot.slot_index
      left join public.player_inventory_stacks as stack
        on stack.id = assignment.inventory_stack_id
       and stack.player_profile_id = state.player_profile_id
      left join public.cozy_item_definitions as item on item.id = stack.item_definition_id
    ),
    'stateVersion', state.quickbar_state_version
  )
  from public.player_inventory_state as state
  where state.player_profile_id = p_player_profile_id;
$$;

create or replace function public.bootstrap_player_cozy_gameplay(
  p_wallet_address text,
  p_idempotency_key text,
  p_request_id text
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
  config public.cozy_gameplay_config%rowtype;
  account public.player_dust_accounts%rowtype;
  inventory_state public.player_inventory_state%rowtype;
  tool public.cozy_item_definitions%rowtype;
  tool_stack public.player_inventory_stacks%rowtype;
  first_free_slot integer;
  request_hash text;
  existing_receipt public.cozy_gameplay_idempotency%rowtype;
  response jsonb;
begin
  if p_wallet_address is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_COZY_BOOTSTRAP_REQUEST';
  end if;

  select p as profile_row, m as moderation_row
  into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address
  for update of p, m;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then return jsonb_build_object('status', 'suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status', 'rename_required'); end if;

  select * into strict config from public.cozy_gameplay_config where id = 1;
  if not private.claim_cozy_gameplay_rate_limit(
    profile.id, 'bootstrap', config.bootstrap_rate_limit
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  request_hash := encode(extensions.digest(
    convert_to('bootstrap:v1:' || profile.id::text, 'UTF8'), 'sha256'
  ), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cozy-idem:' || profile.id::text || ':bootstrap:' || p_idempotency_key,
      0
    )
  );
  select * into existing_receipt
  from public.cozy_gameplay_idempotency
  where player_profile_id = profile.id
    and operation = 'bootstrap'
    and idempotency_key = p_idempotency_key;
  if found and existing_receipt.request_hash <> request_hash then
    return jsonb_build_object('status', 'request_already_processed');
  end if;

  insert into public.player_dust_accounts (player_profile_id)
  values (profile.id)
  on conflict (player_profile_id) do nothing;
  select * into strict account from public.player_dust_accounts
  where player_profile_id = profile.id for update;

  if account.starter_grant_applied_at is null then
    update public.player_dust_accounts
    set balance = balance + config.starter_dust,
        state_version = state_version + 1,
        starter_grant_applied_at = now()
    where player_profile_id = profile.id
    returning * into account;
    insert into public.player_dust_ledger (
      player_profile_id, delta, resulting_balance, reason, reference_type,
      reference_id, idempotency_key, request_id
    ) values (
      profile.id, config.starter_dust, account.balance, 'starter_grant',
      'player_bootstrap', 'phase7-starter-v1', 'phase7-starter-dust-v1', p_request_id
    );
  end if;

  insert into public.player_inventory_state (player_profile_id, capacity)
  values (profile.id, config.inventory_capacity)
  on conflict (player_profile_id) do nothing;
  select * into strict inventory_state from public.player_inventory_state
  where player_profile_id = profile.id for update;
  select * into strict tool from public.cozy_item_definitions
  where id = config.starter_tool_item_definition_id
    and category = 'permanent_tool' and active;

  select * into tool_stack from public.player_inventory_stacks
  where player_profile_id = profile.id and item_definition_id = tool.id
  order by slot_index limit 1;
  if not found then
    select candidate into first_free_slot
    from generate_series(1, inventory_state.capacity) as candidate
    where not exists (
      select 1 from public.player_inventory_stacks as occupied
      where occupied.player_profile_id = profile.id and occupied.slot_index = candidate
    )
    order by candidate limit 1;
    if first_free_slot is null then
      raise exception using errcode = '23514', message = 'COZY_BOOTSTRAP_INVENTORY_FULL';
    end if;
    insert into public.player_inventory_stacks (
      player_profile_id, item_definition_id, slot_index, quantity
    ) values (profile.id, tool.id, first_free_slot, 1)
    returning * into tool_stack;
    update public.player_inventory_state
    set state_version = state_version + 1
    where player_profile_id = profile.id
    returning * into inventory_state;
    insert into public.player_inventory_history (
      player_profile_id, inventory_stack_id, item_definition_id, delta,
      resulting_quantity, reason, reference_id, idempotency_key, request_id
    ) values (
      profile.id, tool_stack.id, tool.id, 1, 1, 'starter_grant',
      'phase7-starter-v1', 'phase7-starter-tool-v1', p_request_id
    );
  end if;

  if not exists (
    select 1 from public.player_quickbar_assignments
    where player_profile_id = profile.id and inventory_stack_id = tool_stack.id
  ) and not exists (
    select 1 from public.player_quickbar_assignments
    where player_profile_id = profile.id and slot_index = 1
  ) then
    insert into public.player_quickbar_assignments (
      player_profile_id, slot_index, inventory_stack_id
    ) values (profile.id, 1, tool_stack.id);
    update public.player_inventory_state
    set quickbar_state_version = quickbar_state_version + 1
    where player_profile_id = profile.id
    returning * into inventory_state;
  end if;

  response := jsonb_build_object(
    'status', 'loaded',
    'contentVersion', config.content_version,
    'dust', private.cozy_dust_account_json(account),
    'inventory', private.cozy_inventory_json(profile.id),
    'quickbar', private.cozy_quickbar_json(profile.id),
    'generatedAt', now()
  );
  if existing_receipt.player_profile_id is null then
    insert into public.cozy_gameplay_idempotency (
      player_profile_id, operation, idempotency_key, request_hash, response, request_id
    ) values (
      profile.id, 'bootstrap', p_idempotency_key, request_hash, response, p_request_id
    ) on conflict do nothing;
  end if;
  return response;
end;
$$;

create or replace function public.get_player_dust_ledger(
  p_wallet_address text,
  p_page integer,
  p_page_size integer,
  p_request_id text
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
  config public.cozy_gameplay_config%rowtype;
  account public.player_dust_accounts%rowtype;
  total_count integer;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_page < 1 or p_page_size not in (10, 20, 50, 100)
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_DUST_LEDGER_REQUEST';
  end if;
  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  profile := selected_rows.profile_row; moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then return jsonb_build_object('status', 'suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status', 'rename_required'); end if;
  select * into account from public.player_dust_accounts where player_profile_id = profile.id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into strict config from public.cozy_gameplay_config where id = 1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id, 'dust_read', config.read_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*) into total_count from public.player_dust_ledger
  where player_profile_id = profile.id;
  return jsonb_build_object(
    'status', 'loaded',
    'account', private.cozy_dust_account_json(account),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'delta', item.delta, 'resultingBalance', item.resulting_balance,
        'reason', item.reason, 'referenceType', item.reference_type,
        'referenceId', item.reference_id, 'requestId', item.request_id,
        'createdAt', item.created_at
      ) order by item.entry_number desc)
      from (
        select * from public.player_dust_ledger
        where player_profile_id = profile.id
        order by entry_number desc
        offset (p_page - 1) * p_page_size limit p_page_size
      ) item
    ), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', p_page, 'pageSize', p_page_size, 'total', total_count,
      'totalPages', case when total_count = 0 then 0 else ceil(total_count::numeric / p_page_size)::integer end
    )
  );
end;
$$;

create or replace function public.get_player_inventory(
  p_wallet_address text,
  p_request_id text
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
  config public.cozy_gameplay_config%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_INVENTORY_REQUEST';
  end if;
  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  profile := selected_rows.profile_row; moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then return jsonb_build_object('status', 'suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status', 'rename_required'); end if;
  if not exists (select 1 from public.player_inventory_state where player_profile_id = profile.id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into strict config from public.cozy_gameplay_config where id = 1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id, 'inventory_read', config.read_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  return jsonb_build_object(
    'status', 'loaded',
    'inventory', private.cozy_inventory_json(profile.id),
    'quickbar', private.cozy_quickbar_json(profile.id)
  );
end;
$$;

create or replace function public.get_player_inventory_history(
  p_wallet_address text,
  p_page integer,
  p_page_size integer,
  p_request_id text
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
  config public.cozy_gameplay_config%rowtype;
  total_count integer;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_page < 1 or p_page_size not in (10, 20, 50, 100)
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_INVENTORY_HISTORY_REQUEST';
  end if;
  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  profile := selected_rows.profile_row; moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then return jsonb_build_object('status', 'suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status', 'rename_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id = 1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id, 'history_read', config.read_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*) into total_count from public.player_inventory_history
  where player_profile_id = profile.id;
  return jsonb_build_object(
    'status', 'loaded',
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'itemSlug', item.item_slug, 'delta', item.delta,
        'resultingQuantity', item.resulting_quantity, 'reason', item.reason,
        'referenceId', item.reference_id, 'createdAt', item.created_at
      ) order by item.entry_number desc)
      from (
        select history.*, definition.slug as item_slug
        from public.player_inventory_history history
        join public.cozy_item_definitions definition on definition.id = history.item_definition_id
        where history.player_profile_id = profile.id
        order by history.entry_number desc
        offset (p_page - 1) * p_page_size limit p_page_size
      ) item
    ), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', p_page, 'pageSize', p_page_size, 'total', total_count,
      'totalPages', case when total_count = 0 then 0 else ceil(total_count::numeric / p_page_size)::integer end
    )
  );
end;
$$;

create or replace function public.update_player_quickbar(
  p_wallet_address text,
  p_slot integer,
  p_inventory_stack_id uuid,
  p_expected_state_version integer,
  p_idempotency_key text,
  p_request_id text
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
  config public.cozy_gameplay_config%rowtype;
  inventory_state public.player_inventory_state%rowtype;
  stack public.player_inventory_stacks%rowtype;
  item public.cozy_item_definitions%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype;
  request_hash text;
  response jsonb;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_slot not between 1 and 8 or p_expected_state_version < 1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_QUICKBAR_REQUEST';
  end if;
  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address for update of p, m;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  profile := selected_rows.profile_row; moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then return jsonb_build_object('status', 'suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status', 'rename_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id = 1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id, 'quickbar_write', config.mutation_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  request_hash := encode(extensions.digest(convert_to(
    p_slot::text || ':' || coalesce(p_inventory_stack_id::text, 'clear') || ':' || p_expected_state_version::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:' || profile.id::text || ':quickbar_update:' || p_idempotency_key, 0
  ));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id = profile.id and operation = 'quickbar_update'
    and idempotency_key = p_idempotency_key;
  if found then
    if receipt.request_hash <> request_hash then
      return jsonb_build_object('status', 'request_already_processed');
    end if;
    return jsonb_set(receipt.response, '{status}', '"replayed"'::jsonb);
  end if;

  select * into inventory_state from public.player_inventory_state
  where player_profile_id = profile.id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if inventory_state.quickbar_state_version <> p_expected_state_version then
    return jsonb_build_object('status', 'state_conflict');
  end if;

  if p_inventory_stack_id is null then
    delete from public.player_quickbar_assignments
    where player_profile_id = profile.id and slot_index = p_slot;
  else
    select * into stack from public.player_inventory_stacks
    where id = p_inventory_stack_id and player_profile_id = profile.id for update;
    if not found then return jsonb_build_object('status', 'item_unavailable'); end if;
    select * into strict item from public.cozy_item_definitions where id = stack.item_definition_id;
    if not item.active or item.category not in ('seed', 'permanent_tool') then
      return jsonb_build_object('status', 'item_unavailable');
    end if;
    delete from public.player_quickbar_assignments
    where player_profile_id = profile.id and inventory_stack_id = stack.id;
    insert into public.player_quickbar_assignments (
      player_profile_id, slot_index, inventory_stack_id
    ) values (profile.id, p_slot, stack.id)
    on conflict (player_profile_id, slot_index) do update
    set inventory_stack_id = excluded.inventory_stack_id;
  end if;
  update public.player_inventory_state
  set quickbar_state_version = quickbar_state_version + 1
  where player_profile_id = profile.id
  returning * into inventory_state;
  response := jsonb_build_object(
    'status', 'updated', 'quickbar', private.cozy_quickbar_json(profile.id)
  );
  insert into public.cozy_gameplay_idempotency (
    player_profile_id, operation, idempotency_key, request_hash, response, request_id
  ) values (
    profile.id, 'quickbar_update', p_idempotency_key, request_hash, response, p_request_id
  );
  return response;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cozy_item_definitions', 'cozy_gameplay_config', 'player_dust_accounts',
    'player_dust_ledger', 'player_inventory_state', 'player_inventory_stacks',
    'player_inventory_history', 'player_quickbar_assignments',
    'cozy_gameplay_idempotency', 'cozy_gameplay_rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      table_name
    );
  end loop;
end;
$$;

revoke all on function private.valid_cozy_item_metadata(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.reject_cozy_append_only_mutation()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_cozy_inventory_stack()
  from public, anon, authenticated, service_role;
revoke all on function private.claim_cozy_gameplay_rate_limit(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.cozy_item_json(public.cozy_item_definitions)
  from public, anon, authenticated, service_role;
revoke all on function private.cozy_dust_account_json(public.player_dust_accounts)
  from public, anon, authenticated, service_role;
revoke all on function private.cozy_inventory_json(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cozy_quickbar_json(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.bootstrap_player_cozy_gameplay(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_player_dust_ledger(text, integer, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_player_inventory(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_player_inventory_history(text, integer, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.update_player_quickbar(text, integer, uuid, integer, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.bootstrap_player_cozy_gameplay(text, text, text)
  to service_role;
grant execute on function public.get_player_dust_ledger(text, integer, integer, text)
  to service_role;
grant execute on function public.get_player_inventory(text, text)
  to service_role;
grant execute on function public.get_player_inventory_history(text, integer, integer, text)
  to service_role;
grant execute on function public.update_player_quickbar(text, integer, uuid, integer, text, text)
  to service_role;
