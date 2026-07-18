begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(88);

select has_table('public', 'cozy_item_definitions', 'strict item catalog exists');
select has_table('public', 'cozy_gameplay_config', 'cozy configuration singleton exists');
select has_table('public', 'player_dust_accounts', 'one-account DUST storage exists');
select has_table('public', 'player_dust_ledger', 'append-only DUST ledger exists');
select has_table('public', 'player_inventory_state', 'inventory capacity state exists');
select has_table('public', 'player_inventory_stacks', 'inventory stacks exist');
select has_table('public', 'player_inventory_history', 'inventory movement history exists');
select has_table('public', 'player_quickbar_assignments', 'persistent quickbar assignments exist');
select has_table('public', 'cozy_gameplay_idempotency', 'mutation receipts exist');
select has_table('public', 'cozy_gameplay_rate_limits', 'durable gameplay rate limits exist');

select is(
  (select count(*)::integer from public.cozy_item_definitions),
  23,
  'the canonical item catalog includes the additive Phase 11A hoe and Phase 11B Garden Soup'
);
select ok(
  exists (
    select 1 from public.cozy_gameplay_config
    where id = 1 and content_version = 1 and starter_dust = 250
      and inventory_capacity = 24 and quickbar_slot_count = 8
      and starter_tool_item_definition_id = '71000000-0000-4000-8000-000000000021'
  ),
  'starter values and tool exist in one validated configuration source'
);
select ok(
  exists (
    select 1 from public.cozy_item_definitions
    where slug = 'starter-watering-can' and category = 'permanent_tool'
      and metadata = '{"kind":"permanent_tool","toolType":"watering_can"}'::jsonb
      and not stackable and max_stack_size = 1
      and not buy_eligible and not sell_eligible
  ),
  'starter tool has strict permanent-tool metadata and protections'
);

select ok(
  (select relrowsecurity from pg_class where oid = ('public.' || table_name)::regclass),
  table_name || ' enables RLS'
)
from unnest(array[
  'cozy_item_definitions', 'cozy_gameplay_config', 'player_dust_accounts',
  'player_dust_ledger', 'player_inventory_state', 'player_inventory_stacks',
  'player_inventory_history', 'player_quickbar_assignments',
  'cozy_gameplay_idempotency', 'cozy_gameplay_rate_limits'
]) as table_name;

select ok(
  (select relforcerowsecurity from pg_class where oid = ('public.' || table_name)::regclass),
  table_name || ' forces RLS'
)
from unnest(array[
  'cozy_item_definitions', 'cozy_gameplay_config', 'player_dust_accounts',
  'player_dust_ledger', 'player_inventory_state', 'player_inventory_stacks',
  'player_inventory_history', 'player_quickbar_assignments',
  'cozy_gameplay_idempotency', 'cozy_gameplay_rate_limits'
]) as table_name;

select ok(
  not has_table_privilege('anon', 'public.cozy_item_definitions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.player_inventory_stacks', 'SELECT'),
  'browser roles have no direct catalog or inventory reads'
);
select ok(
  not has_table_privilege('service_role', 'public.player_dust_accounts', 'SELECT')
  and not has_table_privilege('service_role', 'public.player_dust_ledger', 'INSERT'),
  'service role cannot bypass trusted DUST RPCs'
);
select ok(
  not has_table_privilege('service_role', 'public.player_inventory_stacks', 'UPDATE')
  and not has_table_privilege('service_role', 'public.player_quickbar_assignments', 'INSERT'),
  'service role cannot directly mutate inventory or quickbar state'
);

select ok(
  has_function_privilege(
    'service_role', 'public.bootstrap_player_cozy_gameplay(text,text,text)', 'EXECUTE'
  ),
  'service role can invoke the bootstrap RPC'
);
select ok(
  has_function_privilege(
    'service_role', 'public.get_player_dust_ledger(text,integer,integer,text)', 'EXECUTE'
  ),
  'service role can invoke the bounded DUST read RPC'
);
select ok(
  has_function_privilege('service_role', 'public.get_player_inventory(text,text)', 'EXECUTE'),
  'service role can invoke the inventory read RPC'
);
select ok(
  has_function_privilege(
    'service_role', 'public.get_player_inventory_history(text,integer,integer,text)', 'EXECUTE'
  ),
  'service role can invoke the bounded inventory-history RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.update_player_quickbar(text,integer,uuid,integer,text,text)',
    'EXECUTE'
  ),
  'service role can invoke the optimistic quickbar RPC'
);
select ok(
  not has_function_privilege(
    'anon', 'public.bootstrap_player_cozy_gameplay(text,text,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.bootstrap_player_cozy_gameplay(text,text,text)', 'EXECUTE'
  ),
  'browser roles cannot bootstrap or grant starter state'
);
select ok(
  not has_function_privilege(
    'service_role', 'private.claim_cozy_gameplay_rate_limit(uuid,text,integer)', 'EXECUTE'
  ),
  'private rate-limit authority is not callable by the service role'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.player_dust_ledger'::regclass
      and tgname = 'player_dust_ledger_append_only' and not tgisinternal
  ),
  'DUST ledger has an immutability trigger'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.player_inventory_history'::regclass
      and tgname = 'player_inventory_history_append_only' and not tgisinternal
  ),
  'inventory history has an immutability trigger'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.player_inventory_stacks'::regclass
      and tgname = 'player_inventory_stacks_validate' and not tgisinternal
  ),
  'inventory stacks enforce catalog stack and capacity constraints'
);

select has_index(
  'public', 'player_dust_ledger', 'player_dust_ledger_page_idx',
  'DUST pagination has a stable player-order index'
);
select has_index(
  'public', 'player_inventory_stacks', 'player_inventory_stacks_player_item_idx',
  'inventory reads have a player-item index'
);
select has_index(
  'public', 'player_inventory_history', 'player_inventory_history_page_idx',
  'inventory history pagination has a stable player-order index'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in (
    'cozy_item_definitions', 'cozy_gameplay_config', 'player_dust_accounts',
    'player_dust_ledger', 'player_inventory_state', 'player_inventory_stacks',
    'player_inventory_history', 'player_quickbar_assignments',
    'cozy_gameplay_idempotency', 'cozy_gameplay_rate_limits'
  )),
  0,
  'Phase 7A tables default-deny direct RLS access without browser policies'
);

select has_table('public', 'cozy_crop_definitions', 'canonical crop definitions exist');
select has_table('public', 'cozy_recipe_definitions', 'canonical recipe definitions exist');
select has_table('public', 'cozy_recipe_ingredients', 'normalized recipe ingredients exist');
select has_table('public', 'cozy_shop_definitions', 'system shop definitions exist');
select has_table('public', 'cozy_shop_offers', 'server-priced shop offers exist');
select has_table('public', 'cozy_farm_plot_anchors', 'trusted farm anchors exist');
select has_table('public', 'cozy_gameplay_stations', 'trusted recipe stations exist');
select has_table('public', 'cozy_shop_interactions', 'trusted shop interaction exists');
select has_table('public', 'player_farm_plots', 'private per-player farm plots exist');
select has_table('public', 'cozy_gameplay_action_events', 'append-only gameplay events exist');

select is((select count(*)::integer from public.cozy_crop_definitions), 3, 'three canonical crops are seeded');
select is((select count(*)::integer from public.cozy_recipe_definitions), 6, 'six canonical recipes are seeded');
select is((select count(*)::integer from public.cozy_recipe_ingredients), 11, 'recipe ingredients are normalized exactly');
select is((select count(*)::integer from public.cozy_shop_definitions), 1, 'one system shop is seeded');
select is((select count(*)::integer from public.cozy_shop_offers), 14, 'fourteen fixed-price offers are seeded');
select is((select count(*)::integer from public.cozy_farm_plot_anchors), 6, 'six farm anchors are seeded');
select is((select count(*)::integer from public.cozy_gameplay_stations), 2, 'cooking and crafting stations are seeded');
select is((select count(*)::integer from public.cozy_shop_interactions), 1, 'one shop interaction is seeded');

select ok(
  (select count(*) = 6 from public.cozy_farm_plot_anchors
    where interaction_id like 'phase7-farm-plot-%'
      and anchor_id like 'moonpetal-starter-%'
      and map_version_id = '79000000-0000-4000-8000-000000000002'
      and interaction_range = 1.10),
  'farm authority matches the exact local draft keys, version, and range'
);
select ok(
  (select count(*) = 2 from public.cozy_gameplay_stations
    where interaction_id in ('phase7-cooking-hearth', 'phase7-crafting-workbench')
      and map_version_id = '79000000-0000-4000-8000-000000000001'),
  'recipe stations match the exact local draft interaction IDs and version'
);
select ok(
  exists(select 1 from public.cozy_shop_interactions
    where interaction_id = 'phase7-general-store'
      and map_version_id = '79000000-0000-4000-8000-000000000001'
      and interaction_range = 1.50),
  'shop authority matches the exact local draft interaction and range'
);

select ok(
  not exists(
    select 1 from unnest(array[
      'cozy_crop_definitions','cozy_recipe_definitions','cozy_recipe_ingredients',
      'cozy_shop_definitions','cozy_shop_offers','cozy_farm_plot_anchors',
      'cozy_gameplay_stations','cozy_shop_interactions','player_farm_plots',
      'cozy_gameplay_action_events'
    ]) table_name
    where not (select relrowsecurity from pg_class where oid=('public.'||table_name)::regclass)
  ),
  'every Phase 7B table enables RLS'
);
select ok(
  not exists(
    select 1 from unnest(array[
      'cozy_crop_definitions','cozy_recipe_definitions','cozy_recipe_ingredients',
      'cozy_shop_definitions','cozy_shop_offers','cozy_farm_plot_anchors',
      'cozy_gameplay_stations','cozy_shop_interactions','player_farm_plots',
      'cozy_gameplay_action_events'
    ]) table_name
    where not (select relforcerowsecurity from pg_class where oid=('public.'||table_name)::regclass)
  ),
  'every Phase 7B table forces RLS'
);
select ok(
  not has_table_privilege('service_role','public.player_farm_plots','SELECT')
  and not has_table_privilege('authenticated','public.cozy_shop_offers','SELECT')
  and not has_table_privilege('anon','public.cozy_recipe_definitions','SELECT'),
  'browser and service roles receive no direct Phase 7B table access'
);

select ok(has_function_privilege('service_role','public.get_player_farm_plots(text,text)','EXECUTE'),'service role can read private farm state');
select ok(has_function_privilege('service_role','public.plant_player_farm_plot(text,uuid,text,integer,text,text)','EXECUTE'),'service role can invoke planting');
select ok(has_function_privilege('service_role','public.water_player_farm_plot(text,uuid,integer,text,text)','EXECUTE'),'service role can invoke watering');
select ok(has_function_privilege('service_role','public.harvest_player_farm_plot(text,uuid,integer,text,text)','EXECUTE'),'service role can invoke harvesting');
select ok(has_function_privilege('service_role','public.get_player_item_catalog(text,text)','EXECUTE'),'service role can read safe item content');
select ok(has_function_privilege('service_role','public.get_player_recipe_catalog(text,text,text)','EXECUTE'),'service role can read recipe availability');
select ok(has_function_privilege('service_role','public.perform_player_recipe_action(text,text,text,text,integer,integer,integer,text,text)','EXECUTE'),'service role can invoke recipe actions');
select ok(has_function_privilege('service_role','public.get_player_shop_catalog(text,text,text)','EXECUTE'),'service role can read system shop content');
select ok(has_function_privilege('service_role','public.transact_player_shop(text,text,uuid,text,integer,integer,integer,text,text)','EXECUTE'),'service role can invoke server-priced shop transactions');

select ok(
  not has_function_privilege('authenticated','public.plant_player_farm_plot(text,uuid,text,integer,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.transact_player_shop(text,text,uuid,text,integer,integer,integer,text,text)','EXECUTE'),
  'browser roles cannot invoke Phase 7B mutations directly'
);
select ok(
  not has_function_privilege('service_role','private.cozy_add_item(uuid,uuid,integer,text,text,text,text)','EXECUTE')
  and not has_function_privilege('service_role','private.cozy_apply_dust_delta(uuid,bigint,text,text,text,text,text)','EXECUTE'),
  'service role cannot bypass public transaction RPCs through private helpers'
);
select ok(
  exists(select 1 from pg_trigger where tgrelid='public.cozy_gameplay_action_events'::regclass
    and tgname='cozy_gameplay_action_events_append_only' and not tgisinternal),
  'gameplay action events are append-only'
);
select ok(
  exists(select 1 from pg_indexes where schemaname='public' and indexname='player_farm_plots_ready_idx')
  and exists(select 1 from pg_indexes where schemaname='public' and indexname='cozy_shop_offers_active_idx'),
  'ready crops and active shop offers have bounded read indexes'
);
select ok(
  pg_get_constraintdef((select oid from pg_constraint where conname='cozy_gameplay_idempotency_operation_check'))
    like '%farm_harvest%shop_sell%'
  and pg_get_constraintdef((select oid from pg_constraint where conname='cozy_gameplay_rate_limits_scope_check'))
    like '%farm_write%shop_write%',
  'idempotency and durable rate limits cover every Phase 7B value mutation'
);

select has_table('public','cozy_furniture_definitions','strict furniture definitions exist');
select has_table('public','cozy_home_templates','private home templates exist');
select has_table('public','cozy_home_entrances','trusted home entrances exist');
select has_table('public','player_homes','one private home per player is persisted');
select has_table('public','player_home_furniture','owned placed furniture is persisted');
select is((select count(*)::integer from public.cozy_furniture_definitions),6,'six canonical furniture definitions are seeded');
select is((select count(*)::integer from public.cozy_home_templates),1,'one starter-home template is seeded');
select ok(
  exists(select 1 from public.cozy_home_entrances
    where interaction_id='phase7-home-entrance'
      and map_version_id='79000000-0000-4000-8000-000000000001'
      and interaction_range=1.50),
  'home authority matches the local Lantern Square draft'
);
select ok(
  not exists(select 1 from unnest(array[
    'cozy_furniture_definitions','cozy_home_templates','cozy_home_entrances',
    'player_homes','player_home_furniture'
  ]) table_name where not (select relrowsecurity from pg_class where oid=('public.'||table_name)::regclass)),
  'every Phase 7C home table enables RLS'
);
select ok(
  not exists(select 1 from unnest(array[
    'cozy_furniture_definitions','cozy_home_templates','cozy_home_entrances',
    'player_homes','player_home_furniture'
  ]) table_name where not (select relforcerowsecurity from pg_class where oid=('public.'||table_name)::regclass)),
  'every Phase 7C home table forces RLS'
);
select ok(
  not has_table_privilege('service_role','public.player_homes','SELECT')
    and not has_table_privilege('authenticated','public.player_home_furniture','SELECT')
    and not has_table_privilege('anon','public.cozy_furniture_definitions','SELECT'),
  'browser and service roles receive no direct home access'
);
select ok(has_function_privilege('service_role','public.get_player_home(text,text)','EXECUTE'),'service role can load an owner-scoped home');
select ok(
  has_function_privilege('service_role','public.enter_player_home(text,integer,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.exit_player_home(text,integer,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.place_player_home_furniture(text,uuid,uuid,text,integer,integer,integer,integer,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.move_player_home_furniture(text,uuid,uuid,integer,integer,integer,integer,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.rotate_player_home_furniture(text,uuid,uuid,integer,integer,integer,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.remove_player_home_furniture(text,uuid,uuid,integer,integer,text,text)','EXECUTE'),
  'service role receives only the reviewed home mutation RPCs'
);
select ok(
  not has_function_privilege('authenticated','public.enter_player_home(text,integer,text,text)','EXECUTE')
    and not has_function_privilege('anon','public.place_player_home_furniture(text,uuid,uuid,text,integer,integer,integer,integer,text,text)','EXECUTE'),
  'browser roles cannot invoke home mutations directly'
);
select ok(
  not has_function_privilege('service_role','private.cozy_furniture_placement_valid(uuid,uuid,uuid,integer,integer,integer)','EXECUTE'),
  'service role cannot bypass furniture placement validation'
);
select ok(exists(select 1 from public.admin_permissions where key='cozy_gameplay.read' and is_system),'cozy gameplay read permission is seeded');
select is(
  (select count(*)::integer from public.admin_role_permissions mapping
   join public.admin_roles role on role.id=mapping.role_id
   join public.admin_permissions permission on permission.id=mapping.permission_id
   where permission.key='cozy_gameplay.read'),
  3,
  'only three reviewed administrator roles receive cozy gameplay visibility'
);
select ok(
  not exists(select 1 from public.admin_role_permissions mapping
    join public.admin_roles role on role.id=mapping.role_id
    join public.admin_permissions permission on permission.id=mapping.permission_id
    where permission.key='cozy_gameplay.read'
      and role.key not in ('super_admin','game_administrator','read_only_analyst')),
  'moderation, support, economy, and blockchain roles do not inherit cozy home visibility'
);

select * from finish();
rollback;
