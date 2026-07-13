\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'ASSERTION_FAILED: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  (select count(*) = 21 from public.cozy_item_definitions),
  'canonical Phase 7 item catalog is complete'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.cozy_item_definitions
    where id = '71000000-0000-4000-8000-000000000021'
      and slug = 'starter-watering-can'
      and category = 'permanent_tool'
      and not stackable and max_stack_size = 1
      and not buy_eligible and not sell_eligible
  ),
  'starter watering tool matches the canonical content contract'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.cozy_gameplay_config
    where id = 1 and starter_dust = 250 and inventory_capacity = 24
      and quickbar_slot_count = 8
      and starter_tool_item_definition_id = '71000000-0000-4000-8000-000000000021'
  ),
  'Phase 7A starter configuration has one validated source'
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cozy_item_definitions', 'cozy_gameplay_config', 'player_dust_accounts',
    'player_dust_ledger', 'player_inventory_state', 'player_inventory_stacks',
    'player_inventory_history', 'player_quickbar_assignments',
    'cozy_gameplay_idempotency', 'cozy_gameplay_rate_limits',
    'cozy_crop_definitions', 'cozy_recipe_definitions', 'cozy_recipe_ingredients',
    'cozy_shop_definitions', 'cozy_shop_offers', 'cozy_farm_plot_anchors',
    'cozy_gameplay_stations', 'cozy_shop_interactions', 'player_farm_plots',
    'cozy_gameplay_action_events', 'cozy_furniture_definitions', 'cozy_home_templates',
    'cozy_home_entrances', 'player_homes', 'player_home_furniture'
  ] loop
    perform pg_temp.assert_true(
      not has_table_privilege('anon', 'public.' || table_name, 'SELECT')
      and not has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
      and not has_table_privilege('service_role', 'public.' || table_name, 'SELECT')
      and not has_table_privilege('service_role', 'public.' || table_name, 'INSERT')
      and not has_table_privilege('service_role', 'public.' || table_name, 'UPDATE')
      and not has_table_privilege('service_role', 'public.' || table_name, 'DELETE'),
      table_name || ' has no direct browser or service-role data access'
    );
  end loop;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege(
    'service_role', 'public.bootstrap_player_cozy_gameplay(text,text,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.get_player_dust_ledger(text,integer,integer,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.get_player_inventory(text,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.get_player_inventory_history(text,integer,integer,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.update_player_quickbar(text,integer,uuid,integer,text,text)',
    'EXECUTE'
  ),
  'service role receives only the reviewed Phase 7A RPC surface'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'service_role', 'private.claim_cozy_gameplay_rate_limit(uuid,text,integer)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.bootstrap_player_cozy_gameplay(text,text,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.bootstrap_player_cozy_gameplay(text,text,text)', 'EXECUTE'
  ),
  'private helpers and player bootstrap are not browser callable'
);

insert into public.player_profiles (
  wallet_address, display_name, appearance_preset,
  current_map_id, safe_position_x, safe_position_y, facing_direction
) values (
  '11111111111111111111111111111112', 'Cozy Fixture', 'moss',
  'moonpetal-meadow', 10, 10, 'south'
);

do $$
declare
  wallet constant text := '11111111111111111111111111111112';
  player_id uuid;
  first_result jsonb;
  replay_result jsonb;
  second_key_result jsonb;
  inventory_result jsonb;
  ledger_result jsonb;
  history_result jsonb;
  quickbar_result jsonb;
  quickbar_replay jsonb;
  tool_stack_id uuid;
  initial_quickbar_version integer;
  blocked boolean := false;
begin
  select id into strict player_id from public.player_profiles where wallet_address = wallet;

  first_result := public.bootstrap_player_cozy_gameplay(
    wallet, 'phase7-fixture-bootstrap-0001', 'phase7-fixture:bootstrap:first'
  );
  perform pg_temp.assert_true(first_result ->> 'status' = 'loaded', 'bootstrap loads');
  perform pg_temp.assert_true(
    (first_result #>> '{dust,balance}')::bigint = 250,
    'bootstrap grants exactly 250 DUST'
  );
  perform pg_temp.assert_true(
    (first_result #>> '{inventory,capacity,capacity}')::integer = 24
    and (first_result #>> '{inventory,capacity,usedSlots}')::integer = 2,
    'bootstrap creates capacity, the permanent tool, and starter furniture'
  );
  perform pg_temp.assert_true(
    jsonb_array_length(first_result #> '{quickbar,assignments}') = 8
    and first_result #>> '{quickbar,assignments,0,assignedItemSlug}' = 'starter-watering-can',
    'bootstrap assigns the permanent starter tool to quickbar slot one'
  );

  replay_result := public.bootstrap_player_cozy_gameplay(
    wallet, 'phase7-fixture-bootstrap-0001', 'phase7-fixture:bootstrap:replay'
  );
  second_key_result := public.bootstrap_player_cozy_gameplay(
    wallet, 'phase7-fixture-bootstrap-0002', 'phase7-fixture:bootstrap:second-key'
  );
  perform pg_temp.assert_true(
    (replay_result #>> '{dust,balance}')::bigint = 250
    and (second_key_result #>> '{dust,balance}')::bigint = 250,
    'same-key and different-key bootstrap retries never duplicate DUST'
  );
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.player_dust_accounts where player_profile_id = player_id)
    and (select count(*) = 1 from public.player_dust_ledger
         where player_profile_id = player_id and reason = 'starter_grant')
    and (select count(*) = 1 from public.player_inventory_stacks
         where player_profile_id = player_id
           and item_definition_id = '71000000-0000-4000-8000-000000000021')
    and (select count(*) = 1 from public.player_inventory_stacks
         where player_profile_id = player_id
           and item_definition_id = '71000000-0000-4000-8000-000000000015')
    and (select count(*) = 2 from public.player_inventory_history
         where player_profile_id = player_id and reason = 'starter_grant'),
    'bootstrap creates one account, one DUST grant, one tool, and one starter chair exactly once'
  );
  perform pg_temp.assert_true(
    exists (
      select 1 from public.player_profiles
      where id = player_id and current_map_id = 'moonpetal-meadow'
        and safe_position_x = 10 and safe_position_y = 10
    ),
    'existing map and position survive the Phase 7 upgrade'
  );

  inventory_result := public.get_player_inventory(wallet, 'phase7-fixture:inventory');
  ledger_result := public.get_player_dust_ledger(wallet, 1, 10, 'phase7-fixture:ledger');
  history_result := public.get_player_inventory_history(wallet, 1, 10, 'phase7-fixture:history');
  perform pg_temp.assert_true(
    inventory_result ->> 'status' = 'loaded'
    and jsonb_array_length(inventory_result #> '{inventory,stacks}') = 2,
    'bounded inventory read returns strict owned state'
  );
  perform pg_temp.assert_true(
    ledger_result ->> 'status' = 'loaded'
    and (ledger_result #>> '{account,balance}')::bigint = 250
    and jsonb_array_length(ledger_result -> 'items') = 1
    and (ledger_result #>> '{pagination,total}')::integer = 1,
    'DUST read includes the protected account and bounded stable ledger'
  );
  perform pg_temp.assert_true(
    history_result ->> 'status' = 'loaded'
    and jsonb_array_length(history_result -> 'items') = 2
    and history_result -> 'items' @> '[{"itemSlug":"starter-watering-can"}]'::jsonb
    and history_result -> 'items' @> '[{"itemSlug":"willow-chair"}]'::jsonb,
    'inventory history is bounded and exposes only safe item fields'
  );

  select id into strict tool_stack_id from public.player_inventory_stacks
  where player_profile_id = player_id
    and item_definition_id = '71000000-0000-4000-8000-000000000021';
  initial_quickbar_version := (inventory_result #>> '{quickbar,stateVersion}')::integer;
  quickbar_result := public.update_player_quickbar(
    wallet, 1, null, initial_quickbar_version,
    'phase7-fixture-quickbar-0001', 'phase7-fixture:quickbar:first'
  );
  quickbar_replay := public.update_player_quickbar(
    wallet, 1, null, initial_quickbar_version,
    'phase7-fixture-quickbar-0001', 'phase7-fixture:quickbar:replay'
  );
  perform pg_temp.assert_true(
    quickbar_result ->> 'status' = 'updated'
    and quickbar_replay ->> 'status' = 'replayed'
    and quickbar_result #>> '{quickbar,assignments,0,inventoryStackId}' is null
    and quickbar_result #>> '{quickbar,stateVersion}' = quickbar_replay #>> '{quickbar,stateVersion}',
    'quickbar clear is optimistic, persistent, and replay safe'
  );
  perform pg_temp.assert_true(
    public.update_player_quickbar(
      wallet, 2, tool_stack_id, initial_quickbar_version,
      'phase7-fixture-quickbar-0001', 'phase7-fixture:quickbar:mismatch'
    ) ->> 'status' = 'request_already_processed',
    'an idempotency key cannot be reused with another quickbar payload'
  );

  begin
    update public.player_dust_ledger set resulting_balance = 999
    where player_profile_id = player_id;
  exception when insufficient_privilege then
    blocked := true;
  end;
  perform pg_temp.assert_true(blocked, 'DUST ledger is append-only');
  blocked := false;
  begin
    update public.player_inventory_history set resulting_quantity = 999
    where player_profile_id = player_id;
  exception when insufficient_privilege then
    blocked := true;
  end;
  perform pg_temp.assert_true(blocked, 'inventory history is append-only');

  begin
    update public.player_inventory_stacks set quantity = 2 where id = tool_stack_id;
  exception when check_violation then
    blocked := true;
  end;
  perform pg_temp.assert_true(blocked, 'permanent tool stack cannot exceed its definition');
end;
$$;

do $$
declare
  wallet constant text := '11111111111111111111111111111112';
  player_id uuid;
  plot_one uuid;
  plot_two uuid;
  result jsonb;
  replay jsonb;
  dust_version integer;
  inventory_version integer;
  plot_version integer;
  balance_before bigint;
begin
  select id into strict player_id from public.player_profiles where wallet_address=wallet;
  perform pg_temp.assert_true(
    (select count(*)=6 from public.player_farm_plots where player_profile_id=player_id),
    'Phase 7 bootstrap creates exactly six personal plots'
  );
  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=player_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=player_id;

  update public.player_profiles set current_map_id='lantern-square',
    current_map_version_id='79000000-0000-4000-8000-000000000001',
    safe_position_x=5,safe_position_y=5.7 where id=player_id;
  result:=public.transact_player_shop(
    wallet,'lantern-general-store','74000000-0000-4000-8000-000000000011','buy',2,
    dust_version,inventory_version,'phase7-fixture-shop-buy-0001','phase7-fixture:shop:buy'
  );
  perform pg_temp.assert_true(result->>'status'='updated' and (result->>'dustBalance')::bigint=234,
    'server-priced seed purchase atomically charges 16 DUST');
  replay:=public.transact_player_shop(
    wallet,'lantern-general-store','74000000-0000-4000-8000-000000000011','buy',2,
    dust_version,inventory_version,'phase7-fixture-shop-buy-0001','phase7-fixture:shop:buy-replay'
  );
  perform pg_temp.assert_true(replay->>'status'='replayed'
    and private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000001')=2
    and (select balance=234 from public.player_dust_accounts where player_profile_id=player_id),
    'shop purchase replay cannot duplicate seeds or DUST spending');

  update public.player_profiles set current_map_id='moonpetal-meadow',
    current_map_version_id='79000000-0000-4000-8000-000000000002',
    safe_position_x=12.25,safe_position_y=11.75 where id=player_id;
  select id,state_version into strict plot_one,plot_version from public.player_farm_plots
  where player_profile_id=player_id and slot=1;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=player_id;
  result:=public.plant_player_farm_plot(wallet,plot_one,'moonbean-seed',plot_version,
    'phase7-fixture-plant-0001','phase7-fixture:farm:plant');
  perform pg_temp.assert_true(result->>'status'='updated' and result#>>'{plot,state}'='needs_water'
    and private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000001')=1,
    'planting consumes exactly one owned seed');
  replay:=public.plant_player_farm_plot(wallet,plot_one,'moonbean-seed',plot_version,
    'phase7-fixture-plant-0001','phase7-fixture:farm:plant-replay');
  perform pg_temp.assert_true(replay->>'status'='replayed'
    and private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000001')=1,
    'plant replay cannot consume another seed');
  plot_version:=(result#>>'{plot,stateVersion}')::integer;
  result:=public.water_player_farm_plot(wallet,plot_one,plot_version,
    'phase7-fixture-water-0001','phase7-fixture:farm:water');
  perform pg_temp.assert_true(result->>'status'='updated' and result#>>'{plot,state}'='growing'
    and (result#>>'{plot,readyAt}')::timestamptz>(result#>>'{plot,growthStartedAt}')::timestamptz,
    'watering starts server-timed growth once');
  perform pg_temp.assert_true(
    public.harvest_player_farm_plot(wallet,plot_one,(result#>>'{plot,stateVersion}')::integer,
      'phase7-fixture-harvest-early','phase7-fixture:farm:early')->>'status'='plot_not_ready',
    'early harvest is denied without changing the crop'
  );
  update public.player_farm_plots set growth_started_at=now()-interval '301 seconds',ready_at=now()-interval '1 second'
  where id=plot_one;
  select state_version into strict plot_version from public.player_farm_plots where id=plot_one;
  result:=public.harvest_player_farm_plot(wallet,plot_one,plot_version,
    'phase7-fixture-harvest-0001','phase7-fixture:farm:harvest');
  perform pg_temp.assert_true(result->>'status'='updated' and result#>>'{plot,state}'='empty'
    and private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000004')=3,
    'ready harvest grants deterministic yield and clears the plot atomically');
  replay:=public.harvest_player_farm_plot(wallet,plot_one,plot_version,
    'phase7-fixture-harvest-0001','phase7-fixture:farm:harvest-replay');
  perform pg_temp.assert_true(replay->>'status'='replayed'
    and private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000004')=3,
    'harvest replay cannot duplicate yield');

  update public.player_profiles set current_map_id='lantern-square',
    current_map_version_id='79000000-0000-4000-8000-000000000001',
    safe_position_x=5,safe_position_y=5.7 where id=player_id;
  select state_version,balance into strict dust_version,balance_before from public.player_dust_accounts where player_profile_id=player_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=player_id;
  result:=public.transact_player_shop(wallet,'lantern-general-store',
    '74000000-0000-4000-8000-000000000014','buy',1,dust_version,inventory_version,
    'phase7-fixture-shop-flour','phase7-fixture:shop:flour');
  perform pg_temp.assert_true(result->>'status'='updated' and (result->>'dustBalance')::bigint=balance_before-6,
    'general store supplies a server-priced recipe ingredient');

  update public.player_profiles set safe_position_x=14.8,safe_position_y=6.1 where id=player_id;
  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=player_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=player_id;
  result:=public.perform_player_recipe_action(wallet,'cooking','meadow-biscuit','phase7-cooking-hearth',
    1,inventory_version,dust_version,'phase7-fixture-cook-0001','phase7-fixture:recipe:cook');
  perform pg_temp.assert_true(result->>'status'='updated' and result->>'outputItemSlug'='meadow-biscuit'
    and (result->>'outputQuantity')::integer=2
    and private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000012')=2,
    'cooking atomically consumes ingredients and produces deterministic output');
  replay:=public.perform_player_recipe_action(wallet,'cooking','meadow-biscuit','phase7-cooking-hearth',
    1,inventory_version,dust_version,'phase7-fixture-cook-0001','phase7-fixture:recipe:cook-replay');
  perform pg_temp.assert_true(replay->>'status'='replayed'
    and private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000012')=2,
    'recipe replay cannot duplicate output');

  update public.player_profiles set safe_position_x=14.8,safe_position_y=7.8 where id=player_id;
  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=player_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=player_id;
  result:=public.perform_player_recipe_action(wallet,'crafting','garden-twine','phase7-crafting-workbench',
    1,inventory_version,dust_version,'phase7-fixture-craft-0001','phase7-fixture:recipe:craft');
  perform pg_temp.assert_true(result->>'status'='updated' and result->>'outputItemSlug'='garden-twine',
    'crafting uses a distinct trusted station and recipe kind');

  update public.player_profiles set safe_position_x=5,safe_position_y=5.7 where id=player_id;
  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=player_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=player_id;
  balance_before:=(select balance from public.player_dust_accounts where player_profile_id=player_id);
  -- Grant one sellable crop through the same protected inventory helper so the public sale path is isolated.
  perform private.cozy_add_item(player_id,'71000000-0000-4000-8000-000000000004',1,
    'system_refund','phase7-fixture-sale-setup','phase7-fixture-sale-setup','phase7-fixture:sale:setup');
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=player_id;
  result:=public.transact_player_shop(wallet,'lantern-general-store',
    '74000000-0000-4000-8000-000000000016','sell',1,dust_version,inventory_version,
    'phase7-fixture-shop-sell-0001','phase7-fixture:shop:sell');
  perform pg_temp.assert_true(result->>'status'='updated' and (result->>'dustBalance')::bigint=balance_before+7,
    'selling atomically removes an eligible item and grants server-priced DUST');
  perform pg_temp.assert_true(
    (select count(*)>=7 from public.cozy_gameplay_action_events where player_profile_id=player_id),
    'value-changing Phase 7B actions append safe operational events'
  );
end;
$$;

do $$
declare
  wallet constant text := '11111111111111111111111111111112';
  player_id uuid;
  home_id uuid;
  home_version integer;
  placement_id uuid;
  placement_version integer;
  chair_stack_id uuid;
  lantern_map_id uuid;
  lantern_draft_id constant uuid := '79000000-0000-4000-8000-000000000001';
  result jsonb;
  replay jsonb;
begin
  select id into strict player_id from public.player_profiles where wallet_address=wallet;
  select id into strict lantern_map_id from public.world_maps where slug='lantern-square';
  perform pg_temp.assert_true(
    (select count(*)=1 from public.player_homes where player_profile_id=player_id)
      and (select count(*)=6 from public.cozy_furniture_definitions where active),
    'bootstrap creates one private starter home and the six-item furniture catalog'
  );

  result:=public.bootstrap_player_cozy_gameplay(
    wallet,'phase7-fixture-bootstrap-home-0001','phase7-fixture:bootstrap:home-replay'
  );
  perform pg_temp.assert_true(
    result->>'status'='loaded'
      and (select count(*)=1 from public.player_homes where player_profile_id=player_id)
      and (select count(*)>=1 from public.player_inventory_stacks stack
           join public.cozy_item_definitions item on item.id=stack.item_definition_id
           where stack.player_profile_id=player_id and item.slug='willow-chair'),
    'home bootstrap and starter-furniture grant are retry safe'
  );

  result:=public.get_player_home(wallet,'phase7-fixture:home:load');
  perform pg_temp.assert_true(
    result->>'status'='loaded'
      and result->>'location'='public_world'
      and result#>>'{home,template,slug}'='starter-cottage-interior'
      and jsonb_array_length(result#>'{home,placements}')=0,
    'private home load is owner-scoped and bounded'
  );
  home_id:=(result#>>'{home,id}')::uuid;
  home_version:=(result#>>'{home,stateVersion}')::integer;

  update public.player_profiles
  set current_map_id='lantern-square',current_map_version_id=lantern_draft_id,
      safe_position_x=19,safe_position_y=8,facing_direction='north'
  where id=player_id;
  result:=public.enter_player_home(
    wallet,home_version,'phase7-fixture-home-enter-0001','phase7-fixture:home:enter'
  );
  perform pg_temp.assert_true(
    result->>'status'='updated' and result->>'location'='personal_home'
      and result#>>'{home,returnDestination,mapId}'='lantern-square',
    'home entry verifies the trusted entrance and preserves the public return destination'
  );
  home_version:=(result#>>'{home,stateVersion}')::integer;

  select stack.id into strict chair_stack_id
  from public.player_inventory_stacks stack
  join public.cozy_item_definitions item on item.id=stack.item_definition_id
  where stack.player_profile_id=player_id and item.slug='willow-chair'
  order by stack.slot_index limit 1;
  result:=public.place_player_home_furniture(
    wallet,home_id,chair_stack_id,'willow-chair',1,1,0,home_version,
    'phase7-fixture-furniture-place-0001','phase7-fixture:furniture:place'
  );
  perform pg_temp.assert_true(
    result->>'status'='updated' and jsonb_array_length(result#>'{home,placements}')=1,
    'placing owned furniture consumes one inventory item and persists one placement'
  );
  home_version:=(result#>>'{home,stateVersion}')::integer;
  placement_id:=(result#>>'{home,placements,0,id}')::uuid;
  placement_version:=(result#>>'{home,placements,0,stateVersion}')::integer;

  perform pg_temp.assert_true(
    public.move_player_home_furniture(
      wallet,home_id,placement_id,0,0,home_version,placement_version,
      'phase7-fixture-furniture-invalid-0001','phase7-fixture:furniture:invalid'
    )->>'status'='invalid_placement',
    'blocked home cells reject furniture without mutating the placement'
  );
  result:=public.move_player_home_furniture(
    wallet,home_id,placement_id,2,1,home_version,placement_version,
    'phase7-fixture-furniture-move-0001','phase7-fixture:furniture:move'
  );
  perform pg_temp.assert_true(
    result->>'status'='updated' and result#>>'{home,placements,0,x}'='2',
    'moving furniture is versioned and does not duplicate inventory'
  );
  home_version:=(result#>>'{home,stateVersion}')::integer;
  placement_version:=(result#>>'{home,placements,0,stateVersion}')::integer;
  result:=public.rotate_player_home_furniture(
    wallet,home_id,placement_id,90,home_version,placement_version,
    'phase7-fixture-furniture-rotate-0001','phase7-fixture:furniture:rotate'
  );
  perform pg_temp.assert_true(
    result->>'status'='updated' and result#>>'{home,placements,0,rotation}'='90',
    'supported furniture rotation persists with optimistic versions'
  );
  home_version:=(result#>>'{home,stateVersion}')::integer;
  placement_version:=(result#>>'{home,placements,0,stateVersion}')::integer;
  result:=public.remove_player_home_furniture(
    wallet,home_id,placement_id,home_version,placement_version,
    'phase7-fixture-furniture-remove-0001','phase7-fixture:furniture:remove'
  );
  replay:=public.remove_player_home_furniture(
    wallet,home_id,placement_id,home_version,placement_version,
    'phase7-fixture-furniture-remove-0001','phase7-fixture:furniture:remove-replay'
  );
  perform pg_temp.assert_true(
    result->>'status'='updated' and replay->>'status'='replayed'
      and jsonb_array_length(result#>'{home,placements}')=0
      and (select count(*)>=1 from public.player_inventory_stacks stack
           join public.cozy_item_definitions item on item.id=stack.item_definition_id
           where stack.player_profile_id=player_id and item.slug='willow-chair'),
    'furniture removal returns ownership exactly once and safely replays'
  );
  home_version:=(result#>>'{home,stateVersion}')::integer;
  result:=public.exit_player_home(
    wallet,home_version,'phase7-fixture-home-exit-0001','phase7-fixture:home:exit'
  );
  perform pg_temp.assert_true(
    result->>'status'='updated' and result->>'location'='public_world',
    'home exit preserves the authoritative public return destination'
  );
end;
$$;

do $$
declare
  admin_user_id constant uuid := '90000000-0000-4000-8000-000000000001';
  auth_session_id constant uuid := '90000000-0000-4000-8000-000000000002';
  trusted_session_id constant uuid := '90000000-0000-4000-8000-000000000003';
  restricted_user_id constant uuid := '90000000-0000-4000-8000-000000000004';
  restricted_auth_session_id constant uuid := '90000000-0000-4000-8000-000000000005';
  restricted_session_id constant uuid := '90000000-0000-4000-8000-000000000006';
  super_admin_role_id uuid;
  support_role_id uuid;
  permission_version integer;
  session_version integer;
  player_id uuid;
  result jsonb;
  denied boolean := false;
begin
  select id into strict player_id
  from public.player_profiles where wallet_address='11111111111111111111111111111112';
  insert into auth.users(id,email) values
    (admin_user_id,'phase7-admin@example.invalid'),
    (restricted_user_id,'phase7-restricted@example.invalid');
  insert into auth.sessions(id,user_id) values
    (auth_session_id,admin_user_id),
    (restricted_auth_session_id,restricted_user_id);
  select id into strict super_admin_role_id from public.admin_roles where key='super_admin';
  select id into strict support_role_id from public.admin_roles where key='customer_support';

  insert into public.admin_users(user_id,role_id,status,display_name,mfa_required)
  values(admin_user_id,super_admin_role_id,'active','Phase 7 Administrator',false)
  returning admin_users.permission_version,admin_users.session_version
  into permission_version,session_version;
  insert into public.admin_sessions(
    id,user_id,auth_session_id,status,expires_at,
    permission_version_snapshot,session_version_snapshot
  ) values(
    trusted_session_id,admin_user_id,auth_session_id,'active',now()+interval '1 hour',
    permission_version,session_version
  );

  insert into public.admin_users(user_id,role_id,status,display_name,mfa_required)
  values(restricted_user_id,support_role_id,'active','Phase 7 Restricted Staff',false)
  returning admin_users.permission_version,admin_users.session_version
  into permission_version,session_version;
  insert into public.admin_sessions(
    id,user_id,auth_session_id,status,expires_at,
    permission_version_snapshot,session_version_snapshot
  ) values(
    restricted_session_id,restricted_user_id,restricted_auth_session_id,'active',
    now()+interval '1 hour',permission_version,session_version
  );

  result:=public.get_admin_player_economy(
    admin_user_id,auth_session_id,'aal2',player_id,1,10
  );
  perform pg_temp.assert_true(
    result->>'status'='loaded' and result->>'initialized'='true'
      and (result#>>'{account,balance}')::bigint>=0
      and jsonb_array_length(result->'items')<=10
      and not (coalesce(result#>'{items,0}','{}'::jsonb) ? 'requestId'),
    'authorized administrator reads bounded DUST state without request identifiers'
  );
  result:=public.get_admin_player_inventory(
    admin_user_id,auth_session_id,'aal2',player_id,1,10
  );
  perform pg_temp.assert_true(
    result->>'status'='loaded' and result->>'initialized'='true'
      and jsonb_array_length(result#>'{inventory,stacks}')>=1
      and jsonb_array_length(result->'items')<=10,
    'authorized administrator reads bounded inventory quantities and history'
  );
  result:=public.get_admin_player_cozy_gameplay(
    admin_user_id,auth_session_id,'aal2',player_id
  );
  perform pg_temp.assert_true(
    result->>'status'='loaded' and result->>'initialized'='true'
      and (result#>>'{farm,total}')::integer=6
      and result#>>'{home,templateName}'='Starter Cottage',
    'authorized administrator reads the bounded farm and private-home summary'
  );
  result:=public.get_admin_gameplay_content(admin_user_id,auth_session_id,'aal2');
  perform pg_temp.assert_true(
    result->>'status'='loaded'
      and jsonb_array_length(result->'items')=21
      and jsonb_array_length(result->'furniture')=6
      and jsonb_array_length(result->'homeTemplates')=1,
    'authorized administrator reads the versioned gameplay content catalog'
  );

  begin
    perform public.get_admin_player_cozy_gameplay(
      restricted_user_id,restricted_auth_session_id,'aal2',player_id
    );
  exception when insufficient_privilege then
    denied:=true;
  end;
  perform pg_temp.assert_true(
    denied,
    'staff without cozy_gameplay.read cannot read another player cozy summary'
  );
end;
$$;

select 'cozy-gameplay postgres execution assertions passed' as result;

rollback;
