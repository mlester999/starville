-- Starville Phase 11C: versioned General Store catalogs, stock, receipts,
-- bounded DUST settlement, and tutorial continuation.
--
-- This is a forward-only extension of the Phase 7 and Phase 9A economy
-- authority. It does not create a second DUST ledger, inventory system,
-- correction workflow, shop settlement engine, or policy framework.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('economy.stock.read', 'Read shop stock', 'Inspect authoritative shop stock and restock state.', 'economy', false, true),
  ('economy.stock.manage', 'Manage shop stock', 'Perform bounded, explained shop restocks and stock freezes.', 'economy', true, true),
  ('economy.transactions.read', 'Read shop transactions', 'Inspect bounded shop transaction and settlement evidence.', 'economy', true, true),
  ('economy.receipts.read', 'Read shop receipts', 'Inspect immutable player-facing shop receipts.', 'economy', true, true),
  ('economy.reconciliation.manage', 'Manage shop reconciliation', 'Request bounded shop reconciliation without direct balance editing.', 'economy', true, true),
  ('economy.live_ops.manage', 'Manage shop live ops', 'Pause shop access, buying, selling, restock, or tutorial settlement.', 'economy', true, true)
on conflict (key) do update set
  name=excluded.name, description=excluded.description, category=excluded.category,
  is_sensitive=excluded.is_sensitive, is_system=true;

with mapping(role_key, permission_key) as (
  values
    ('game_administrator','economy.stock.read'),
    ('game_administrator','economy.stock.manage'),
    ('game_administrator','economy.transactions.read'),
    ('game_administrator','economy.receipts.read'),
    ('game_administrator','economy.reconciliation.manage'),
    ('game_administrator','economy.live_ops.manage'),
    ('economy_manager','economy.stock.read'),
    ('economy_manager','economy.stock.manage'),
    ('economy_manager','economy.transactions.read'),
    ('economy_manager','economy.receipts.read'),
    ('economy_manager','economy.reconciliation.manage'),
    ('economy_manager','economy.live_ops.manage'),
    ('live_operations_manager','economy.stock.read'),
    ('live_operations_manager','economy.stock.manage'),
    ('live_operations_manager','economy.transactions.read'),
    ('live_operations_manager','economy.receipts.read'),
    ('live_operations_manager','economy.reconciliation.manage'),
    ('live_operations_manager','economy.live_ops.manage'),
    ('customer_support','economy.transactions.read'),
    ('customer_support','economy.receipts.read'),
    ('financial_reviewer','economy.transactions.read'),
    ('financial_reviewer','economy.receipts.read'),
    ('financial_reviewer','economy.stock.read'),
    ('read_only_analyst','economy.stock.read'),
    ('read_only_analyst','economy.transactions.read')
)
insert into public.admin_role_permissions(role_id,permission_id)
select role.id,permission.id from mapping
join public.admin_roles role on role.key=mapping.role_key
join public.admin_permissions permission on permission.key=mapping.permission_key
on conflict do nothing;

insert into public.admin_role_permissions(role_id,permission_id)
select role.id,permission.id from public.admin_roles role
cross join public.admin_permissions permission
where role.key='super_admin' and permission.key like 'economy.%'
on conflict do nothing;

alter table public.cozy_gameplay_idempotency
  drop constraint cozy_gameplay_idempotency_operation_check;
alter table public.cozy_gameplay_idempotency
  add constraint cozy_gameplay_idempotency_operation_check check (operation in (
    'bootstrap','quickbar_update','farm_plant','farm_water','farm_harvest',
    'recipe_cook','recipe_craft','shop_buy','shop_sell',
    'home_enter','home_exit','furniture_place','furniture_move','furniture_rotate','furniture_remove',
    'starter_quest_accept','starter_quest_delivery','home_soil_prepare','home_crop_plant',
    'home_crop_water','home_crop_harvest',
    'workstation_job_start','workstation_job_collect',
    'workstation_tutorial_accept','workstation_tutorial_turn_in',
    'shop_transaction','shop_tutorial_accept','shop_tutorial_turn_in'
  ));

alter table public.cozy_gameplay_rate_limits
  drop constraint cozy_gameplay_rate_limits_scope_check;
alter table public.cozy_gameplay_rate_limits
  add constraint cozy_gameplay_rate_limits_scope_check check (scope in (
    'bootstrap','dust_read','inventory_read','history_read','quickbar_write',
    'farm_read','farm_write','recipe_read','recipe_write','shop_read','shop_write',
    'home_read','home_write','vertical_slice_read','plot_provision','home_farm_write',
    'starter_quest_write','workstation_read','workstation_write','workstation_collect',
    'workstation_tutorial_write',
    'shop_workspace_read','shop_transaction_write','shop_receipt_read','shop_tutorial_write',
    'shop_event_read'
  ));

alter table public.player_inventory_history
  drop constraint player_inventory_history_reason_check;
alter table public.player_inventory_history
  add constraint player_inventory_history_reason_check check (reason in (
    'starter_grant','shop_purchase','shop_sale','planting','harvest',
    'cooking','crafting','furniture_placement','furniture_removal',
    'social_gift','social_trade','system_refund','cooperative_activity_reward',
    'tutorial_delivery','cooking_ingredient_consumed','crafting_ingredient_consumed',
    'cooking_output_collected','crafting_output_collected','crafting_refund',
    'crafting_compensation','tutorial_output_delivered'
  ));

alter table public.player_dust_ledger
  drop constraint player_dust_ledger_reason_check;
alter table public.player_dust_ledger
  add constraint player_dust_ledger_reason_check check (reason in (
    'starter_grant','shop_purchase','shop_sale','crafting_fee','system_refund',
    'migration_adjustment','cooperative_activity_reward','administrative_correction',
    'starter_farming_quest_reward','starter_workstation_quest_reward',
    'starter_shop_quest_reward'
  ));

alter table public.player_dust_ledger
  drop constraint player_dust_ledger_reference_type_check;
alter table public.player_dust_ledger
  add constraint player_dust_ledger_reference_type_check check (reference_type in (
    'player_bootstrap','shop_transaction','recipe_action','system_operation','migration',
    'cooperative_activity','starter_farming_quest','crafting_job','starter_workstation_quest',
    'starter_shop_quest'
  ));

create table public.economy_shop_catalogs (
  id uuid primary key,
  catalog_key text not null unique check (catalog_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  shop_definition_id uuid not null unique references public.cozy_shop_definitions(id) on delete restrict,
  public_name text not null check (char_length(public_name) between 3 and 80 and public_name=btrim(public_name) and public_name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 3 and 280 and description=btrim(description) and description !~ '[[:cntrl:]<>]'),
  lifecycle_status text not null check (lifecycle_status in ('active','disabled','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.economy_shop_catalogs(
  id,catalog_key,shop_definition_id,public_name,description,lifecycle_status
) values (
  'c1100000-0000-4000-8000-000000000001','general-store-catalog',
  '74000000-0000-4000-8000-000000000001','General Store Catalog',
  'Versioned buy and sell policies for the Lantern Square General Store.','active'
);

alter table public.economy_shop_versions
  add column catalog_id uuid references public.economy_shop_catalogs(id) on delete restrict,
  add column reason text,
  add column superseded_at timestamptz,
  add column safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  );

-- This one-time compatibility backfill adds Phase 11C catalog identity to the
-- already immutable Phase 9A version without changing any economic fields.
alter table public.economy_shop_versions
  disable trigger economy_shop_versions_published_immutable;

update public.economy_shop_versions
set catalog_id='c1100000-0000-4000-8000-000000000001',
    reason=coalesce(reason,'Phase 9A published baseline.'),
    safe_metadata=jsonb_build_object('catalogCompatibility','phase9a')
where shop_definition_id='74000000-0000-4000-8000-000000000001';

alter table public.economy_shop_versions
  enable trigger economy_shop_versions_published_immutable;

alter table public.economy_shop_versions
  alter column catalog_id set not null,
  alter column reason set not null,
  add constraint economy_shop_versions_reason_check check (
    char_length(reason) between 3 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'
  );

alter table public.economy_shop_version_offers
  add column entry_id uuid default gen_random_uuid(),
  add column buy_enabled boolean not null default true,
  add column sell_enabled boolean not null default false,
  add column buy_price bigint,
  add column sell_price bigint,
  add column currency_key text not null default 'DUST',
  add column stock_mode text not null default 'unlimited',
  add column restock_mode text not null default 'none',
  add column maximum_stock integer,
  add column restock_amount integer,
  add column restock_interval_seconds integer,
  add column player_buy_daily_limit integer not null default 40,
  add column player_sell_daily_limit integer not null default 20,
  add column availability_from timestamptz,
  add column availability_until timestamptz,
  add column eligibility_rule text not null default 'ordinary_gameplay',
  add column display_order integer not null default 1,
  add column safe_metadata jsonb not null default '{}'::jsonb;

-- As above, only newly introduced compatibility columns are populated. The
-- published offer's original price, limits, and identity remain unchanged.
alter table public.economy_shop_version_offers
  disable trigger economy_shop_version_offers_published_immutable;

update public.economy_shop_version_offers version_offer
set buy_enabled=base.buy_price is not null,
    sell_enabled=base.sell_price is not null,
    buy_price=base.buy_price,
    sell_price=base.sell_price,
    player_buy_daily_limit=version_offer.daily_limit,
    player_sell_daily_limit=20,
    display_order=ordered.display_order,
    safe_metadata=jsonb_build_object('catalogCompatibility','phase9a')
from public.cozy_shop_offers base
join (
  select offer.id,row_number() over(order by item.category,item.slug)::integer as display_order
  from public.cozy_shop_offers offer
  join public.cozy_item_definitions item on item.id=offer.item_definition_id
) ordered on ordered.id=base.id
where base.id=version_offer.offer_id;

alter table public.economy_shop_version_offers
  enable trigger economy_shop_version_offers_published_immutable;

alter table public.economy_shop_version_offers
  alter column entry_id set not null,
  add constraint economy_shop_version_offers_entry_unique unique (shop_version_id,entry_id),
  add constraint economy_shop_version_offers_direction_check check (buy_enabled or sell_enabled),
  add constraint economy_shop_version_offers_buy_price_check check (
    (buy_enabled and buy_price between 1 and 1000000) or (not buy_enabled and buy_price is null)
  ),
  add constraint economy_shop_version_offers_sell_price_check check (
    (sell_enabled and sell_price between 1 and 1000000) or (not sell_enabled and sell_price is null)
  ),
  add constraint economy_shop_version_offers_currency_check check (currency_key='DUST'),
  add constraint economy_shop_version_offers_stock_mode_check check (
    stock_mode in ('unlimited','global_limited','per_player_limited','hybrid')
  ),
  add constraint economy_shop_version_offers_restock_mode_check check (
    restock_mode in ('none','fixed_interval','daily_utc','manual')
  ),
  add constraint economy_shop_version_offers_stock_payload_check check (
    (stock_mode in ('unlimited','per_player_limited') and maximum_stock is null)
    or (stock_mode in ('global_limited','hybrid') and maximum_stock between 1 and 1000000)
  ),
  add constraint economy_shop_version_offers_restock_payload_check check (
    (restock_mode in ('none','manual') and restock_amount is null and restock_interval_seconds is null)
    or (restock_mode='fixed_interval' and restock_amount between 1 and maximum_stock and restock_interval_seconds between 60 and 2592000)
    or (restock_mode='daily_utc' and restock_amount between 1 and maximum_stock and restock_interval_seconds=86400)
  ),
  add constraint economy_shop_version_offers_limits_check check (
    player_buy_daily_limit between 1 and 9999 and player_sell_daily_limit between 1 and 9999
  ),
  add constraint economy_shop_version_offers_availability_check check (
    availability_from is null or availability_until is null or availability_from<availability_until
  ),
  add constraint economy_shop_version_offers_eligibility_check check (
    eligibility_rule in ('ordinary_gameplay','phase11a_complete','phase11b_complete','tutorial_only')
  ),
  add constraint economy_shop_version_offers_display_order_check check (display_order between 1 and 1000),
  add constraint economy_shop_version_offers_metadata_check check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  );

alter table public.cozy_shop_definitions
  add column shop_type text not null default 'npc_general_store' check (shop_type in ('npc_general_store')),
  add column accepted_currency text not null default 'DUST' check (accepted_currency='DUST'),
  add column buy_enabled boolean not null default true,
  add column sell_enabled boolean not null default true,
  add column interaction_radius numeric(5,2) not null default 1.5 check (interaction_radius between 1 and 4),
  add column maintenance_message text check (
    maintenance_message is null or (char_length(maintenance_message) between 1 and 280 and maintenance_message=btrim(maintenance_message) and maintenance_message !~ '[[:cntrl:]<>]')
  ),
  add column configuration_revision integer not null default 1 check (configuration_revision>0),
  add column safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  );

alter table public.cozy_shop_interactions
  add column world_object_id text,
  add column shopkeeper_npc_id uuid references public.cozy_starter_npcs(id) on delete restrict,
  add column asset_ref text,
  add column asset_version_id uuid references public.world_asset_versions(id) on delete restrict,
  add column collision_width numeric(6,3) not null default 1.4 check (collision_width between 0.1 and 20),
  add column collision_height numeric(6,3) not null default 1 check (collision_height between 0.1 and 20),
  add column depth_offset numeric(8,4) not null default 0,
  add column enabled boolean not null default true,
  add column safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096
  );

insert into public.cozy_starter_npcs(
  id,slug,name,introduction,world_map_id,position_x,position_y,
  interaction_range,active,content_version
)
select 'c1100000-0000-4000-8000-000000000010','mira-general-store','Mira',
  'Welcome to the General Store. I keep practical village supplies and buy a small, fair selection of local goods.',
  map.id,5.8,5.7,2.5,true,1
from public.world_maps map where map.slug='lantern-square'
on conflict (id) do nothing;

update public.cozy_shop_definitions
set name='Lantern General Store',description='Seeds, simple materials, and a fair counter for selected village goods.',
    buy_enabled=true,sell_enabled=true,interaction_radius=1.5,
    configuration_revision=configuration_revision+1,
    safe_metadata=jsonb_build_object('shopkeeperSlug','mira-general-store','artworkReadiness','development_marker')
where id='74000000-0000-4000-8000-000000000001';

update public.cozy_shop_interactions
set world_object_id='phase7-general-store-object',
    shopkeeper_npc_id='c1100000-0000-4000-8000-000000000010',
    asset_ref='phase7-general-store-marker',enabled=true,
    safe_metadata=jsonb_build_object('interactionPointReachable',true,'artworkReadiness','development_marker')
where id='78000000-0000-4000-8000-000000000003';

alter table public.cozy_shop_interactions
  alter column world_object_id set not null,
  alter column shopkeeper_npc_id set not null,
  alter column asset_ref set not null,
  add constraint cozy_shop_interactions_world_object_check check (
    char_length(world_object_id) between 1 and 80 and world_object_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  add constraint cozy_shop_interactions_asset_ref_check check (
    char_length(asset_ref) between 1 and 80 and asset_ref ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

create table public.economy_shop_live_ops (
  shop_definition_id uuid primary key references public.cozy_shop_definitions(id) on delete restrict,
  access_enabled boolean not null default true,
  buying_enabled boolean not null default true,
  selling_enabled boolean not null default true,
  stock_decrement_enabled boolean not null default true,
  restock_enabled boolean not null default true,
  tutorial_objectives_enabled boolean not null default true,
  tutorial_rewards_enabled boolean not null default true,
  sale_dust_issuance_enabled boolean not null default true,
  global_daily_sale_dust_cap bigint not null default 100000 check (global_daily_sale_dust_cap between 1 and 1000000),
  maintenance_message text not null default 'The General Store is taking a short pause. Receipts remain available.' check (
    char_length(maintenance_message) between 3 and 280 and maintenance_message=btrim(maintenance_message) and maintenance_message !~ '[[:cntrl:]<>]'
  ),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  updated_at timestamptz not null default now()
);
insert into public.economy_shop_live_ops(shop_definition_id)
values('74000000-0000-4000-8000-000000000001');

create table public.economy_shop_stock (
  catalog_version_id uuid not null references public.economy_shop_versions(id) on delete restrict,
  catalog_entry_id uuid not null,
  current_stock integer,
  maximum_stock integer,
  stock_revision integer not null default 1 check (stock_revision>0),
  next_restock_at timestamptz,
  restock_paused boolean not null default false,
  last_restock_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(catalog_version_id,catalog_entry_id),
  foreign key(catalog_version_id,catalog_entry_id)
    references public.economy_shop_version_offers(shop_version_id,entry_id) on delete restrict,
  check (
    (current_stock is null and maximum_stock is null)
    or (current_stock between 0 and maximum_stock and maximum_stock between 1 and 1000000)
  )
);

create table public.economy_shop_player_limit_usage (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  catalog_version_id uuid not null references public.economy_shop_versions(id) on delete restrict,
  catalog_entry_id uuid not null,
  direction text not null check (direction in ('buy','sell')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  quantity_used integer not null default 0 check (quantity_used between 0 and 1000000),
  dust_total bigint not null default 0 check (dust_total between 0 and 9000000000000000),
  usage_revision integer not null default 1 check (usage_revision>0),
  updated_at timestamptz not null default now(),
  primary key(player_profile_id,catalog_version_id,catalog_entry_id,direction,window_start),
  foreign key(catalog_version_id,catalog_entry_id)
    references public.economy_shop_version_offers(shop_version_id,entry_id) on delete restrict,
  check (window_end>window_start)
);

create table public.economy_shop_global_limit_usage (
  shop_definition_id uuid not null references public.cozy_shop_definitions(id) on delete restrict,
  direction text not null check (direction in ('buy','sell')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  quantity_used integer not null default 0 check (quantity_used between 0 and 1000000000),
  dust_total bigint not null default 0 check (dust_total between 0 and 9000000000000000),
  usage_revision integer not null default 1 check (usage_revision>0),
  updated_at timestamptz not null default now(),
  primary key(shop_definition_id,direction,window_start),
  check (window_end>window_start)
);

create table public.economy_shop_transactions (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  shop_definition_id uuid not null references public.cozy_shop_definitions(id) on delete restrict,
  shop_world_object_id uuid not null references public.cozy_shop_interactions(id) on delete restrict,
  catalog_id uuid not null references public.economy_shop_catalogs(id) on delete restrict,
  catalog_version_id uuid not null references public.economy_shop_versions(id) on delete restrict,
  catalog_entry_id uuid not null,
  offer_id uuid not null references public.cozy_shop_offers(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  direction text not null check (direction in ('buy','sell')),
  quantity integer not null check (quantity between 1 and 99),
  unit_price bigint not null check (unit_price between 1 and 1000000),
  total_dust bigint not null check (total_dust between 1 and 9000000000000000),
  currency_key text not null check (currency_key='DUST'),
  status text not null check (status in ('completed','failed','blocked','reversed')),
  catalog_revision integer not null check (catalog_revision>0),
  entry_revision integer not null check (entry_revision>0),
  stock_revision_before integer,
  stock_revision_after integer,
  stock_policy_snapshot jsonb not null,
  limit_policy_snapshot jsonb not null,
  dust_ledger_entry_id uuid unique references public.player_dust_ledger(id) on delete restrict,
  inventory_history_entry_id uuid unique references public.player_inventory_history(id) on delete restrict,
  correction_request_id uuid references public.economy_correction_requests(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(player_profile_id,idempotency_key),
  foreign key(catalog_version_id,catalog_entry_id)
    references public.economy_shop_version_offers(shop_version_id,entry_id) on delete restrict,
  check (unit_price::numeric*quantity=total_dust),
  check (jsonb_typeof(stock_policy_snapshot)='object' and pg_column_size(stock_policy_snapshot)<=4096),
  check (jsonb_typeof(limit_policy_snapshot)='object' and pg_column_size(limit_policy_snapshot)<=4096),
  check (
    (status='completed' and completed_at is not null and dust_ledger_entry_id is not null and inventory_history_entry_id is not null and failure_code is null)
    or (status in ('failed','blocked') and completed_at is not null and dust_ledger_entry_id is null and inventory_history_entry_id is null and failure_code is not null)
    or (status='reversed' and completed_at is not null and correction_request_id is not null)
  )
);

create table public.economy_shop_receipts (
  id uuid primary key default gen_random_uuid(),
  public_receipt_id text generated always as (
    'STORE-'||upper(substr(encode(extensions.digest(id::text::bytea,'sha256'),'hex'),1,20))
  ) stored unique,
  transaction_id uuid not null unique references public.economy_shop_transactions(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  shop_name text not null check (char_length(shop_name) between 3 and 80 and shop_name !~ '[[:cntrl:]<>]'),
  item_name text not null check (char_length(item_name) between 1 and 80 and item_name !~ '[[:cntrl:]<>]'),
  direction text not null check (direction in ('buy','sell')),
  quantity integer not null check (quantity between 1 and 99),
  unit_price bigint not null check (unit_price between 1 and 1000000),
  total_dust bigint not null check (total_dust between 1 and 9000000000000000),
  currency_key text not null check (currency_key='DUST'),
  transaction_status text not null check (transaction_status in ('completed','failed','blocked','reversed')),
  catalog_version_number integer not null check (catalog_version_number>0),
  resulting_inventory_quantity integer check (resulting_inventory_quantity between 0 and 1000000),
  resulting_dust_balance bigint check (resulting_dust_balance between 0 and 9000000000000000),
  support_reference text not null check (char_length(support_reference) between 8 and 40 and support_reference !~ '[[:cntrl:]<>]'),
  created_at timestamptz not null default now()
);

create table public.economy_shop_events (
  event_number bigint generated always as identity primary key,
  player_profile_id uuid references public.player_profiles(id) on delete restrict,
  shop_definition_id uuid not null references public.cozy_shop_definitions(id) on delete restrict,
  event_key text not null check (event_key in (
    'shop_purchase_completed','shop_sale_completed','shop_stock_changed',
    'shop_catalog_changed','shop_availability_changed','shop_limit_changed','receipt_available'
  )),
  visibility text not null check (visibility in ('owner','public_stock','operations')),
  related_entity_id uuid,
  safe_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_payload)='object' and pg_column_size(safe_payload)<=4096),
  created_at timestamptz not null default now(),
  check ((visibility='owner')=(player_profile_id is not null))
);

create table public.economy_shop_action_cooldowns (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  action_key text not null check (action_key in ('buy','sell','tutorial_turn_in')),
  last_action_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(player_profile_id,action_key)
);

create table public.economy_shop_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.economy_shop_transactions(id) on delete restrict,
  reconciliation_type text not null check (reconciliation_type in (
    'settlement_mismatch','receipt_mismatch','stock_mismatch','limit_mismatch','stuck_transaction','restock_due'
  )),
  status text not null default 'pending' check (status in ('pending','processing','resolved','failed','manual_review')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  available_at timestamptz not null default now(),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and pg_column_size(evidence)<=8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(transaction_id,reconciliation_type)
);

create table public.economy_shop_admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  action_key text not null check (action_key in (
    'catalog_successor_created','catalog_entry_added','catalog_entry_removed',
    'live_ops_updated','manual_restock','reconciliation_requested'
  )),
  shop_definition_id uuid not null references public.cozy_shop_definitions(id) on delete restrict,
  target_id uuid,
  reason text not null check (char_length(reason) between 12 and 1000 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  previous_value jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_value)='object' and pg_column_size(previous_value)<=8192),
  new_value jsonb not null default '{}'::jsonb check (jsonb_typeof(new_value)='object' and pg_column_size(new_value)<=8192),
  created_at timestamptz not null default now()
);

-- Explicitly permit Garden Soup to be selected by an approved catalog. The
-- active Phase 11C catalog remains the actual sell authority.
update public.cozy_item_definitions
set sell_eligible=true,default_sell_price=10,content_version=greatest(content_version,2)
where id='b1100000-0000-4000-8000-000000000001';

insert into public.cozy_shop_offers(
  id,shop_definition_id,item_definition_id,buy_price,sell_price,
  minimum_quantity,maximum_quantity,active,content_version
) values
  ('c1100000-0000-4000-8000-000000000020','74000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000001',null,10,1,10,true,2),
  ('c1100000-0000-4000-8000-000000000021','74000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000009',null,18,1,5,true,2),
  ('c1100000-0000-4000-8000-000000000022','74000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000013',null,8,1,10,true,2)
on conflict (shop_definition_id,item_definition_id) do update set
  sell_price=excluded.sell_price,active=true,content_version=greatest(public.cozy_shop_offers.content_version,2);

insert into public.economy_shop_versions(
  id,shop_definition_id,catalog_id,version_number,lifecycle_status,name,description,
  interaction_key,revision,effective_at,validation_results,published_at,reason,safe_metadata
) values (
  'c1100000-0000-4000-8000-000000000030',
  '74000000-0000-4000-8000-000000000001',
  'c1100000-0000-4000-8000-000000000001',2,'draft','Lantern General Store',
  'A bounded General Store catalog for seeds, practical materials, and selected local goods.',
  'phase7-general-store',1,now(),
  '{"valid":true,"checks":["positive-prices","bounded-quantities","direct-arbitrage-blocked","explicit-sellability","stock-policy-valid","dust-source-and-sink-active"]}'::jsonb,
  null,'Phase 11C initial bounded General Store catalog.',
  '{"artworkReadiness":"development_marker","currency":"DUST"}'::jsonb
);

with entry(entry_id,offer_id,buy_enabled,sell_enabled,buy_price,sell_price,stock_mode,
  restock_mode,maximum_stock,restock_amount,restock_interval_seconds,buy_limit,sell_limit,
  eligibility_rule,display_order) as (
  values
    ('c1100000-0000-4000-8000-000000000101'::uuid,'74000000-0000-4000-8000-000000000011'::uuid,true,false,8::bigint,null::bigint,'unlimited','none',null::integer,null::integer,null::integer,20,1,'ordinary_gameplay',1),
    ('c1100000-0000-4000-8000-000000000102','74000000-0000-4000-8000-000000000012',true,false,10,null,'global_limited','daily_utc',50,20,86400,10,1,'phase11a_complete',2),
    ('c1100000-0000-4000-8000-000000000103','74000000-0000-4000-8000-000000000013',true,false,12,null,'global_limited','manual',20,null,null,5,1,'phase11a_complete',3),
    ('c1100000-0000-4000-8000-000000000104','74000000-0000-4000-8000-000000000014',true,false,6,null,'unlimited','none',null,null,null,20,1,'ordinary_gameplay',4),
    ('c1100000-0000-4000-8000-000000000105','74000000-0000-4000-8000-000000000015',true,false,9,null,'global_limited','fixed_interval',60,15,21600,15,1,'ordinary_gameplay',5),
    ('c1100000-0000-4000-8000-000000000106','74000000-0000-4000-8000-000000000016',false,true,null,7,'per_player_limited','none',null,null,null,1,20,'ordinary_gameplay',10),
    ('c1100000-0000-4000-8000-000000000107','74000000-0000-4000-8000-000000000017',false,true,null,9,'per_player_limited','none',null,null,null,1,15,'phase11a_complete',11),
    ('c1100000-0000-4000-8000-000000000108','74000000-0000-4000-8000-000000000018',false,true,null,11,'per_player_limited','none',null,null,null,1,12,'phase11a_complete',12),
    ('c1100000-0000-4000-8000-000000000110','c1100000-0000-4000-8000-000000000021',false,true,null,18,'per_player_limited','none',null,null,null,1,5,'phase11b_complete',14),
    ('c1100000-0000-4000-8000-000000000111','c1100000-0000-4000-8000-000000000022',false,true,null,8,'per_player_limited','none',null,null,null,1,10,'phase11b_complete',15),
    ('c1100000-0000-4000-8000-000000000112','c1100000-0000-4000-8000-000000000020',false,true,null,10,'per_player_limited','none',null,null,null,1,5,'phase11b_complete',16)
)
insert into public.economy_shop_version_offers(
  shop_version_id,offer_id,entry_id,unit_price,maximum_quantity,daily_limit,cooldown_seconds,
  inventory_capacity_cost,protected_item,enabled,revision,buy_enabled,sell_enabled,buy_price,
  sell_price,currency_key,stock_mode,restock_mode,maximum_stock,restock_amount,
  restock_interval_seconds,player_buy_daily_limit,player_sell_daily_limit,
  eligibility_rule,display_order,safe_metadata
)
select 'c1100000-0000-4000-8000-000000000030',entry.offer_id,entry.entry_id,
  coalesce(entry.buy_price,entry.sell_price),10,
  case when entry.buy_enabled then entry.buy_limit else entry.sell_limit end,
  0,1,false,true,1,entry.buy_enabled,entry.sell_enabled,entry.buy_price,entry.sell_price,
  'DUST',entry.stock_mode,entry.restock_mode,entry.maximum_stock,entry.restock_amount,
  entry.restock_interval_seconds,entry.buy_limit,entry.sell_limit,entry.eligibility_rule,
  entry.display_order,
  jsonb_build_object('initialCatalog',true,'directArbitrageBlocked',true)
from entry;

insert into public.economy_shop_stock(
  catalog_version_id,catalog_entry_id,current_stock,maximum_stock,next_restock_at
)
select offer.shop_version_id,offer.entry_id,
  case when offer.stock_mode in ('global_limited','hybrid') then offer.maximum_stock else null end,
  offer.maximum_stock,
  case
    when offer.restock_mode='fixed_interval' then now()+make_interval(secs=>offer.restock_interval_seconds)
    when offer.restock_mode='daily_utc' then date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day'
    else null
  end
from public.economy_shop_version_offers offer
where offer.shop_version_id='c1100000-0000-4000-8000-000000000030';

update public.economy_shop_versions
set lifecycle_status='published',published_at=now()
where id='c1100000-0000-4000-8000-000000000030';

insert into public.economy_active_shop_versions(shop_definition_id,shop_version_id,activated_at)
values('74000000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000030',now())
on conflict(shop_definition_id) do update set
  shop_version_id=excluded.shop_version_id,activated_at=excluded.activated_at;

insert into public.economy_source_versions(
  id,source_key,version_number,lifecycle_status,operation_key,category,label,description,
  minimum_amount,maximum_amount,repeatable,daily_limit,weekly_limit,account_lifetime_limit,
  wallet_daily_limit,cooldown_seconds,beginner_protected,risk_weight,published_at
) values (
  'c1100000-0000-4000-8000-000000000201','starter-shop-tutorial',1,'published',
  'starter_shop_quest_reward','gameplay_reward','Starter General Store tutorial',
  'One bounded server-authoritative reward for completing the General Store tutorial.',
  15,15,false,1,1,1,1,0,true,2,now()
);
insert into public.economy_active_source_versions(source_key,source_version_id)
values('starter-shop-tutorial','c1100000-0000-4000-8000-000000000201');

alter table public.cozy_quest_versions
  drop constraint cozy_quest_versions_kind_payload_check,
  drop constraint cozy_quest_versions_quest_kind_check;
alter table public.cozy_quest_versions
  add column required_purchase_item_definition_id uuid references public.cozy_item_definitions(id) on delete restrict,
  add column required_sale_item_definition_id uuid references public.cozy_item_definitions(id) on delete restrict,
  add column tutorial_shop_definition_id uuid references public.cozy_shop_definitions(id) on delete restrict,
  add constraint cozy_quest_versions_quest_kind_check check (
    quest_kind in ('farming_tutorial','workstation_tutorial','shop_tutorial')
  ),
  add constraint cozy_quest_versions_kind_payload_check check (
    (quest_kind='farming_tutorial'
      and starter_seed_quantity is not null and delivery_quantity is not null
      and starter_hoe_item_definition_id is not null and starter_watering_can_item_definition_id is not null
      and starter_seed_item_definition_id is not null and delivery_item_definition_id is not null
      and required_quest_definition_id is null and tutorial_cooking_recipe_definition_id is null
      and tutorial_crafting_recipe_definition_id is null
      and required_purchase_item_definition_id is null and required_sale_item_definition_id is null
      and tutorial_shop_definition_id is null)
    or (quest_kind='workstation_tutorial'
      and starter_seed_quantity is null and delivery_quantity is null
      and starter_hoe_item_definition_id is null and starter_watering_can_item_definition_id is null
      and starter_seed_item_definition_id is null and delivery_item_definition_id is null
      and required_quest_definition_id is not null and tutorial_cooking_recipe_definition_id is not null
      and tutorial_crafting_recipe_definition_id is not null
      and required_purchase_item_definition_id is null and required_sale_item_definition_id is null
      and tutorial_shop_definition_id is null)
    or (quest_kind='shop_tutorial'
      and starter_seed_quantity is null and delivery_quantity is null
      and starter_hoe_item_definition_id is null and starter_watering_can_item_definition_id is null
      and starter_seed_item_definition_id is null and delivery_item_definition_id is null
      and required_quest_definition_id is not null and tutorial_cooking_recipe_definition_id is null
      and tutorial_crafting_recipe_definition_id is null
      and required_purchase_item_definition_id is not null and required_sale_item_definition_id is not null
      and tutorial_shop_definition_id is not null)
  );

alter table public.cozy_quest_objectives drop constraint cozy_quest_objectives_objective_key_check;
alter table public.cozy_quest_objectives add constraint cozy_quest_objectives_objective_key_check check (objective_key in (
  'meet_guide','receive_starter_kit','enter_home_plot','prepare_soil','plant_crops','water_crops',
  'harvest_crop','deliver_produce','receive_reward','speak_with_guide','unlock_cooking_recipe',
  'collect_cooked_item','unlock_crafting_recipe','collect_crafted_item','return_to_guide',
  'interact_with_shopkeeper','open_shop','buy_catalog_item','sell_catalog_item',
  'inspect_shop_receipt','return_to_shopkeeper'
));

alter table public.player_quest_events drop constraint player_quest_events_event_key_check;
alter table public.player_quest_events add constraint player_quest_events_event_key_check check (event_key in (
  'quest_accepted','starter_kit_granted','plot_entered','soil_prepared','crop_planted','crop_watered',
  'crop_harvested','tutorial_produce_delivered','tutorial_reward_settled',
  'workstation_tutorial_accepted','cooking_recipe_unlocked','cooked_output_collected',
  'crafting_recipe_unlocked','crafted_output_collected','workstation_tutorial_returned',
  'workstation_tutorial_reward_settled','shop_tutorial_accepted','shopkeeper_interacted',
  'shop_opened','shop_item_purchased','shop_item_sold','shop_receipt_inspected',
  'shopkeeper_returned','shop_tutorial_reward_settled'
));

create table public.cozy_active_shop_tutorial_versions (
  quest_definition_id uuid primary key references public.cozy_quest_definitions(id) on delete restrict,
  quest_version_id uuid not null unique references public.cozy_quest_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

insert into public.cozy_quest_definitions(id,slug)
values('c1100000-0000-4000-8000-000000000210','welcome-to-the-general-store');
insert into public.cozy_quest_versions(
  id,quest_definition_id,version_number,lifecycle_status,name,description,reward_dust,
  active,published_at,quest_kind,required_quest_definition_id,
  required_purchase_item_definition_id,required_sale_item_definition_id,tutorial_shop_definition_id
) values (
  'c1100000-0000-4000-8000-000000000211','c1100000-0000-4000-8000-000000000210',1,
  'published','Welcome to the General Store',
  'Meet Mira, buy one Moonbean Seed, sell one Garden Soup, inspect the receipt, and return.',
  15,false,now(),'shop_tutorial','b1100000-0000-4000-8000-000000000201',
  '71000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001'
);
insert into public.cozy_active_shop_tutorial_versions(quest_definition_id,quest_version_id)
values('c1100000-0000-4000-8000-000000000210','c1100000-0000-4000-8000-000000000211');

insert into public.cozy_quest_objectives(id,quest_version_id,objective_key,sequence_number,label,required_count)
values
  ('c1100000-0000-4000-8000-000000000221','c1100000-0000-4000-8000-000000000211','interact_with_shopkeeper',1,'Meet Mira at the General Store',1),
  ('c1100000-0000-4000-8000-000000000222','c1100000-0000-4000-8000-000000000211','open_shop',2,'Open the General Store',1),
  ('c1100000-0000-4000-8000-000000000223','c1100000-0000-4000-8000-000000000211','buy_catalog_item',3,'Buy one Moonbean Seed',1),
  ('c1100000-0000-4000-8000-000000000224','c1100000-0000-4000-8000-000000000211','sell_catalog_item',4,'Sell one Garden Soup',1),
  ('c1100000-0000-4000-8000-000000000225','c1100000-0000-4000-8000-000000000211','inspect_shop_receipt',5,'Inspect a General Store receipt',1),
  ('c1100000-0000-4000-8000-000000000226','c1100000-0000-4000-8000-000000000211','return_to_shopkeeper',6,'Return to Mira',1),
  ('c1100000-0000-4000-8000-000000000227','c1100000-0000-4000-8000-000000000211','receive_reward',7,'Receive the one-time tutorial reward',1);

create index economy_shop_transactions_player_created_idx
  on public.economy_shop_transactions(player_profile_id,created_at desc,id desc);
create index economy_shop_transactions_status_created_idx
  on public.economy_shop_transactions(status,created_at desc);
create index economy_shop_stock_restock_idx
  on public.economy_shop_stock(next_restock_at,catalog_version_id)
  where next_restock_at is not null and not restock_paused;
create index economy_shop_events_owner_idx
  on public.economy_shop_events(player_profile_id,event_number)
  where visibility='owner';
create index economy_shop_reconciliation_pending_idx
  on public.economy_shop_reconciliation_queue(status,available_at,created_at);

create trigger economy_shop_catalogs_set_updated_at before update on public.economy_shop_catalogs
for each row execute function private.set_updated_at();
create trigger economy_shop_live_ops_set_updated_at before update on public.economy_shop_live_ops
for each row execute function private.set_updated_at();
create trigger economy_shop_stock_set_updated_at before update on public.economy_shop_stock
for each row execute function private.set_updated_at();
create trigger economy_shop_player_limits_set_updated_at before update on public.economy_shop_player_limit_usage
for each row execute function private.set_updated_at();
create trigger economy_shop_global_limits_set_updated_at before update on public.economy_shop_global_limit_usage
for each row execute function private.set_updated_at();
create trigger economy_shop_cooldowns_set_updated_at before update on public.economy_shop_action_cooldowns
for each row execute function private.set_updated_at();
create trigger economy_shop_reconciliation_set_updated_at before update on public.economy_shop_reconciliation_queue
for each row execute function private.set_updated_at();

create trigger economy_shop_transactions_immutable before update or delete on public.economy_shop_transactions
for each row execute function private.economy_protect_immutable_row();
create trigger economy_shop_receipts_immutable before update or delete on public.economy_shop_receipts
for each row execute function private.economy_protect_immutable_row();
create trigger economy_shop_events_immutable before update or delete on public.economy_shop_events
for each row execute function private.economy_protect_immutable_row();
create trigger economy_shop_admin_audit_immutable before update or delete on public.economy_shop_admin_audit_events
for each row execute function private.economy_protect_immutable_row();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'economy_shop_catalogs','economy_shop_live_ops','economy_shop_stock',
    'economy_shop_player_limit_usage','economy_shop_global_limit_usage',
    'economy_shop_transactions','economy_shop_receipts','economy_shop_events',
    'economy_shop_action_cooldowns','economy_shop_reconciliation_queue',
    'economy_shop_admin_audit_events','cozy_active_shop_tutorial_versions'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',table_name);
  end loop;
end;
$$;

comment on table public.economy_shop_catalogs is
  'Canonical catalog definitions that organize existing immutable economy_shop_versions.';
comment on table public.economy_shop_transactions is
  'Unified immutable Phase 11C buy/sell evidence with exact catalog, stock, inventory, and DUST snapshots.';
comment on table public.economy_shop_receipts is
  'Append-only player-facing receipts. Corrections preserve and link the original transaction.';
comment on table public.economy_shop_events is
  'Bounded safe economy events. Owner events contain no wallet, credential, or private profile payload.';
