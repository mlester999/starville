\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.phase11_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'PHASE11A_ASSERTION_FAILED: %', message;
  end if;
end;
$$;

select pg_temp.phase11_assert(
  exists (
    select 1 from public.cozy_item_definitions
    where slug='starter-hoe' and category='permanent_tool'
      and metadata='{"kind":"permanent_tool","toolType":"hoe"}'::jsonb
      and account_bound and permanent_tool and not stackable
  ),
  'the starter hoe is a protected permanent tool'
);

select pg_temp.phase11_assert(
  exists (
    select 1 from public.economy_source_versions source
    join public.economy_active_source_versions active
      on active.source_key=source.source_key and active.source_version_id=source.id
    where source.source_key='starter-farming-tutorial'
      and source.operation_key='starter_farming_quest_reward'
      and source.minimum_amount=25 and source.maximum_amount=25
      and not source.repeatable
  ),
  'the tutorial reward uses one bounded canonical DUST source'
);

do $$
declare
  owner_wallet constant text := '11111111111111111111111111111145';
  other_wallet constant text := '11111111111111111111111111111146';
  owner_id uuid;
  other_id uuid;
  owner_home_id uuid;
  other_home_id uuid;
  tile_one uuid;
  tile_two uuid;
  crop_one uuid;
  crop_two uuid;
  home_version integer;
  tile_version integer;
  crop_version integer;
  quest_version integer;
  result jsonb;
  replay jsonb;
  projected jsonb;
  blocked boolean := false;
begin
  insert into public.player_profiles (
    wallet_address,display_name,appearance_preset,current_map_id,
    current_map_version_id,safe_position_x,safe_position_y,facing_direction
  ) values
    (owner_wallet,'Phase Eleven Owner','moss','lantern-square',
      '79000000-0000-4000-8000-000000000001',12,10.5,'north'),
    (other_wallet,'Phase Eleven Other','moonberry','lantern-square',
      '79000000-0000-4000-8000-000000000001',12,10.5,'north');

  select id into strict owner_id from public.player_profiles where wallet_address=owner_wallet;
  select id into strict other_id from public.player_profiles where wallet_address=other_wallet;

  perform public.bootstrap_player_cozy_gameplay(
    owner_wallet,'phase11-owner-bootstrap-0001','phase11:owner:bootstrap'
  );
  perform public.bootstrap_player_cozy_gameplay(
    other_wallet,'phase11-other-bootstrap-0001','phase11:other:bootstrap'
  );

  result:=public.accept_player_starter_farming_quest(
    owner_wallet,'phase11-owner-quest-accept-0001','phase11:owner:accept'
  );
  replay:=public.accept_player_starter_farming_quest(
    owner_wallet,'phase11-owner-quest-accept-0001','phase11:owner:accept:replay'
  );
  perform pg_temp.phase11_assert(
    result->>'status'='updated' and replay->>'status'='replayed',
    'starter quest acceptance is retry safe'
  );
  select id,state_version into strict owner_home_id,home_version
  from public.player_homes where player_profile_id=owner_id;
  perform pg_temp.phase11_assert(
    (select count(*)=1 from public.player_homes where player_profile_id=owner_id)
      and (select lifecycle_status='active' from public.player_homes where id=owner_home_id)
      and (select count(*)=8 from public.player_home_farming_tiles where player_home_id=owner_home_id)
      and private.cozy_owned_quantity(owner_id,'a1100000-0000-4000-8000-000000000001')=1
      and private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000021')=1
      and private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000001')=4,
    'acceptance provisions one plot and grants one exact starter kit'
  );

  update public.player_profiles set safe_position_x=19,safe_position_y=8
  where id=owner_id;
  result:=public.enter_player_home(
    owner_wallet,home_version,'phase11-owner-home-enter-0001','phase11:owner:enter'
  );
  perform pg_temp.phase11_assert(
    result->>'status'='updated'
      and (select inside_home from public.player_homes where id=owner_home_id),
    'the owner enters the exact private home instance'
  );

  select id,state_version into strict tile_one,tile_version
  from public.player_home_farming_tiles where player_home_id=owner_home_id and slot=1;
  result:=public.prepare_player_home_soil(
    owner_wallet,tile_one,tile_version,'phase11-owner-prepare-one-0001','phase11:prepare:one'
  );
  replay:=public.prepare_player_home_soil(
    owner_wallet,tile_one,tile_version,'phase11-owner-prepare-one-0001','phase11:prepare:one:replay'
  );
  perform pg_temp.phase11_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and (select state='prepared' from public.player_home_farming_tiles where id=tile_one),
    'soil preparation is owner-bound and idempotent'
  );

  update public.cozy_farming_action_cooldowns
  set last_action_at=clock_timestamp()-interval '1 second' where player_profile_id=owner_id;
  select id,state_version into strict tile_two,tile_version
  from public.player_home_farming_tiles where player_home_id=owner_home_id and slot=2;
  result:=public.prepare_player_home_soil(
    owner_wallet,tile_two,tile_version,'phase11-owner-prepare-two-0001','phase11:prepare:two'
  );
  perform pg_temp.phase11_assert(result->>'status'='updated','the second tutorial tile is prepared');

  update public.cozy_farming_action_cooldowns
  set last_action_at=clock_timestamp()-interval '1 second' where player_profile_id=owner_id;
  select state_version into strict tile_version from public.player_home_farming_tiles where id=tile_one;
  result:=public.plant_player_home_crop(
    owner_wallet,tile_one,'moonbean-seed',tile_version,
    'phase11-owner-plant-one-0001','phase11:plant:one'
  );
  select crop_instance_id,state_version into strict crop_one,tile_version
  from public.player_home_farming_tiles where id=tile_one;
  perform pg_temp.phase11_assert(
    result->>'status'='updated'
      and private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000001')=3,
    'planting atomically consumes one server-selected seed'
  );
  perform pg_temp.phase11_assert(
    public.plant_player_home_crop(
      owner_wallet,tile_one,'moonbean-seed',tile_version,
      'phase11-owner-plant-conflict-0001','phase11:plant:conflict'
    )->>'status'='farming_tile_not_eligible',
    'an occupied tile rejects another planting intent'
  );

  update public.cozy_farming_action_cooldowns
  set last_action_at=clock_timestamp()-interval '1 second' where player_profile_id=owner_id;
  select state_version into strict tile_version from public.player_home_farming_tiles where id=tile_two;
  result:=public.plant_player_home_crop(
    owner_wallet,tile_two,'moonbean-seed',tile_version,
    'phase11-owner-plant-two-0001','phase11:plant:two'
  );
  select crop_instance_id into strict crop_two
  from public.player_home_farming_tiles where id=tile_two;
  perform pg_temp.phase11_assert(
    result->>'status'='updated'
      and private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000001')=2,
    'the second plant consumes exactly one additional seed'
  );

  update public.cozy_crop_definitions set growth_duration_seconds=999
  where slug='moonbean';
  perform pg_temp.phase11_assert(
    (select growth_duration_seconds=300 and configuration_revision=2
      from public.player_home_crop_instances where id=crop_one),
    'existing crops retain their pinned production snapshot after definition edits'
  );

  select state_version into strict tile_version from public.player_home_farming_tiles where id=tile_one;
  select state_version into strict crop_version from public.player_home_crop_instances where id=crop_one;
  result:=public.water_player_home_crop(
    owner_wallet,tile_one,crop_one,tile_version,crop_version,
    'phase11-owner-water-one-0001','phase11:water:one'
  );
  perform pg_temp.phase11_assert(
    result->>'status'='updated'
      and (result#>>'{view,plot,tiles,0,crop,maturesAt}')::timestamptz
        >(result#>>'{view,plot,tiles,0,crop,growthStartedAt}')::timestamptz,
    'watering starts timestamp-derived growth using server time'
  );
  select state_version into strict tile_version from public.player_home_farming_tiles where id=tile_one;
  select state_version into strict crop_version from public.player_home_crop_instances where id=crop_one;
  perform pg_temp.phase11_assert(
    public.harvest_player_home_crop(
      owner_wallet,tile_one,crop_one,tile_version,crop_version,
      'phase11-owner-harvest-early-0001','phase11:harvest:early'
    )->>'status'='crop_not_mature',
    'early harvest is denied without client-selected maturity'
  );

  update public.cozy_farming_action_cooldowns
  set last_action_at=clock_timestamp()-interval '1 second' where player_profile_id=owner_id;
  select state_version into strict tile_version from public.player_home_farming_tiles where id=tile_two;
  select state_version into strict crop_version from public.player_home_crop_instances where id=crop_two;
  result:=public.water_player_home_crop(
    owner_wallet,tile_two,crop_two,tile_version,crop_version,
    'phase11-owner-water-two-0001','phase11:water:two'
  );
  perform pg_temp.phase11_assert(result->>'status'='updated','the second crop starts growth');

  update public.player_home_crop_instances set
    watered_at=now()-interval '12 seconds',growth_started_at=now()-interval '11 seconds',
    matures_at=now()-interval '1 second'
  where id in (crop_one,crop_two);
  projected:=public.get_player_playable_vertical_slice(owner_wallet,'phase11:offline:rehydrate');
  perform pg_temp.phase11_assert(
    projected->>'status'='loaded'
      and projected#>>'{plot,tiles,0,state}'='mature'
      and (projected#>>'{plot,tiles,0,crop,growthProgress}')::numeric=1,
    'offline maturity is derived from authoritative timestamps on reconnect'
  );

  update public.cozy_farming_action_cooldowns
  set last_action_at=clock_timestamp()-interval '1 second' where player_profile_id=owner_id;
  select state_version into strict tile_version from public.player_home_farming_tiles where id=tile_one;
  select state_version into strict crop_version from public.player_home_crop_instances where id=crop_one;
  result:=public.harvest_player_home_crop(
    owner_wallet,tile_one,crop_one,tile_version,crop_version,
    'phase11-owner-harvest-one-0001','phase11:harvest:one'
  );
  replay:=public.harvest_player_home_crop(
    owner_wallet,tile_one,crop_one,tile_version,crop_version,
    'phase11-owner-harvest-one-0001','phase11:harvest:one:replay'
  );
  perform pg_temp.phase11_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000004')=3
      and (select state='prepared' and crop_instance_id is null
        from public.player_home_farming_tiles where id=tile_one),
    'mature harvest grants deterministic produce once and resets soil to prepared'
  );

  update public.player_profiles set safe_position_x=12,safe_position_y=10.5
  where id=owner_id;
  select state_version into strict quest_version
  from public.player_quest_instances where player_profile_id=owner_id;
  result:=public.deliver_player_starter_farming_quest(
    owner_wallet,quest_version,'phase11-owner-delivery-0001','phase11:delivery:first'
  );
  replay:=public.deliver_player_starter_farming_quest(
    owner_wallet,quest_version,'phase11-owner-delivery-0001','phase11:delivery:replay'
  );
  perform pg_temp.phase11_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000004')=1
      and (select balance=275 from public.player_dust_accounts where player_profile_id=owner_id)
      and (select count(*)=1 from public.player_dust_ledger
        where player_profile_id=owner_id and reason='starter_farming_quest_reward')
      and (select status='reward_claimed' and reward_ledger_entry_id is not null
        from public.player_quest_instances where player_profile_id=owner_id),
    'tutorial delivery removes produce and settles canonical DUST exactly once'
  );

  select id,state_version into strict other_home_id,home_version
  from public.player_homes where player_profile_id=other_id;
  update public.player_profiles set safe_position_x=19,safe_position_y=8
  where id=other_id;
  result:=public.enter_player_home(
    other_wallet,home_version,'phase11-other-home-enter-0001','phase11:other:enter'
  );
  perform pg_temp.phase11_assert(result->>'status'='updated','the second owner enters only their plot');
  perform pg_temp.phase11_assert(
    public.prepare_player_home_soil(
      other_wallet,tile_two,1,'phase11-other-cross-plot-0001','phase11:other:cross'
    )->>'status'='farming_tile_not_found',
    'another player cannot target the owner farming tile by UUID'
  );
  perform pg_temp.phase11_assert(
    (select count(*)=1 from public.player_homes where player_profile_id=other_id)
      and other_home_id<>owner_home_id,
    'each player has one distinct private starter plot'
  );

  begin
    update public.cozy_private_plot_events set payload='{}'::jsonb where player_home_id=owner_home_id;
  exception when insufficient_privilege then
    blocked:=true;
  end;
  perform pg_temp.phase11_assert(blocked,'private plot event history is append-only');
end;
$$;

do $$
declare
  admin_user_id constant uuid := 'e1100000-0000-4000-8000-000000000001';
  admin_auth_session_id constant uuid := 'e1100000-0000-4000-8000-000000000002';
  admin_session_id constant uuid := 'e1100000-0000-4000-8000-000000000003';
  content_user_id constant uuid := 'e1100000-0000-4000-8000-000000000004';
  content_auth_session_id constant uuid := 'e1100000-0000-4000-8000-000000000005';
  content_session_id constant uuid := 'e1100000-0000-4000-8000-000000000006';
  future_wallet constant text := '11111111111111111111111111111147';
  super_role_id uuid;
  content_role_id uuid;
  permission_version integer;
  session_version integer;
  seed public.cozy_item_definitions%rowtype;
  crop public.cozy_crop_definitions%rowtype;
  active_template public.cozy_home_templates%rowtype;
  successor_template_id uuid;
  owner_id uuid;
  other_id uuid;
  future_id uuid;
  owner_template_id uuid;
  map_version_id uuid;
  current_quest public.cozy_quest_versions%rowtype;
  second_quest_id uuid;
  third_quest_id uuid;
  definition jsonb;
  result jsonb;
  replay jsonb;
  content jsonb;
  blocked boolean := false;
begin
  select id into strict super_role_id from public.admin_roles where key = 'super_admin';
  select id into strict content_role_id from public.admin_roles where key = 'content_manager';
  insert into auth.users(id, email) values
    (admin_user_id, 'phase11a-admin@example.invalid'),
    (content_user_id, 'phase11a-content@example.invalid');
  insert into auth.sessions(id, user_id) values
    (admin_auth_session_id, admin_user_id),
    (content_auth_session_id, content_user_id);

  insert into public.admin_users(user_id, role_id, status, display_name, mfa_required)
  values(admin_user_id, super_role_id, 'active', 'Phase 11A Admin', false)
  returning admin_users.permission_version, admin_users.session_version
    into permission_version, session_version;
  insert into public.admin_sessions(
    id, user_id, auth_session_id, status, expires_at,
    permission_version_snapshot, session_version_snapshot
  ) values (
    admin_session_id, admin_user_id, admin_auth_session_id, 'active', now() + interval '1 hour',
    permission_version, session_version
  );

  insert into public.admin_users(user_id, role_id, status, display_name, mfa_required)
  values(content_user_id, content_role_id, 'active', 'Phase 11A Content', false)
  returning admin_users.permission_version, admin_users.session_version
    into permission_version, session_version;
  insert into public.admin_sessions(
    id, user_id, auth_session_id, status, expires_at,
    permission_version_snapshot, session_version_snapshot
  ) values (
    content_session_id, content_user_id, content_auth_session_id, 'active',
    now() + interval '1 hour', permission_version, session_version
  );

  content := public.get_admin_farming_content(
    admin_user_id, admin_auth_session_id, 'aal2'
  );
  perform pg_temp.phase11_assert(
    content ->> 'status' = 'loaded'
      and jsonb_array_length(content -> 'items') >= 4
      and jsonb_array_length(content -> 'crops') >= 1
      and jsonb_array_length(content -> 'plotTemplateVersions') = 1
      and jsonb_array_length(content -> 'questVersions') = 1
      and (content #>> '{plotTemplate,validation,valid}')::boolean,
    'the farming administrator projection exposes validated reference and version history'
  );

  select * into strict seed
  from public.cozy_item_definitions where slug = 'moonbean-seed';
  definition := jsonb_build_object(
    'name', 'Moonbean Starter Seeds',
    'description', seed.description,
    'category', seed.category,
    'stackable', seed.stackable,
    'maxStackSize', seed.max_stack_size,
    'buyEligible', seed.buy_eligible,
    'sellEligible', seed.sell_eligible,
    'giftable', seed.giftable,
    'tradable', seed.tradable,
    'accountBound', seed.account_bound,
    'permanentTool', seed.permanent_tool,
    'minimumTransferQuantity', seed.minimum_transfer_quantity,
    'maximumTransferQuantity', seed.maximum_transfer_quantity,
    'defaultBuyPrice', seed.default_buy_price,
    'defaultSellPrice', seed.default_sell_price,
    'assetRef', seed.asset_ref,
    'assetReadiness', seed.asset_readiness,
    'active', seed.active,
    'metadata', seed.metadata
  );
  result := public.update_admin_farming_item(
    admin_user_id, admin_auth_session_id, 'aal2', seed.id, seed.content_version,
    definition, 'Clarify the canonical starter seed label without changing its identity.',
    'phase11-admin-item-update'
  );
  replay := public.update_admin_farming_item(
    admin_user_id, admin_auth_session_id, 'aal2', seed.id, seed.content_version,
    definition, 'Clarify the canonical starter seed label without changing its identity.',
    'phase11-admin-item-update'
  );
  perform pg_temp.phase11_assert(
    result ->> 'status' = 'updated'
      and result #>> '{item,definition,name}' = 'Moonbean Starter Seeds'
      and (result #>> '{item,definition,contentVersion}')::integer = seed.content_version + 1
      and replay ->> 'status' = 'replayed',
    'item edits preserve UUID and slug identity, increment content version, audit, and replay safely'
  );
  perform pg_temp.phase11_assert(
    public.update_admin_farming_item(
      admin_user_id, admin_auth_session_id, 'aal2', seed.id, seed.content_version,
      definition, 'Reject a stale item update against the previous content version.',
      'phase11-admin-item-stale'
    ) ->> 'status' = 'state_conflict',
    'stale item content versions are rejected'
  );
  definition := jsonb_set(definition, '{active}', 'false'::jsonb);
  perform pg_temp.phase11_assert(
    public.update_admin_farming_item(
      admin_user_id, admin_auth_session_id, 'aal2', seed.id, seed.content_version + 1,
      definition, 'Reject disabling a seed referenced by the active crop and starter quest.',
      'phase11-admin-item-reference'
    ) ->> 'status' = 'reference_conflict',
    'referenced starter items cannot be disabled out from under active content'
  );

  select * into strict crop from public.cozy_crop_definitions where slug = 'moonbean';
  definition := jsonb_build_object(
    'name', crop.name,
    'description', 'A compact tutorial crop with an audited production duration.',
    'seedItemId', crop.seed_item_definition_id,
    'produceItemId', crop.harvest_item_definition_id,
    'productionGrowthDurationSeconds', 420,
    'localGrowthDurationSeconds', crop.local_growth_duration_seconds,
    'growthStageCount', crop.growth_stage_count,
    'deterministicYield', crop.deterministic_yield,
    'wateringPolicy', crop.watering_policy,
    'tutorialEligible', crop.tutorial_eligible,
    'assetRef', crop.asset_ref,
    'assetReadiness', crop.asset_readiness,
    'active', crop.active
  );
  result := public.update_admin_farming_crop(
    admin_user_id, admin_auth_session_id, 'aal2', crop.id, crop.configuration_revision,
    definition, 'Publish a bounded crop configuration revision for future plantings only.',
    'phase11-admin-crop-update'
  );
  perform pg_temp.phase11_assert(
    result ->> 'status' = 'updated'
      and (result #>> '{crop,configurationRevision}')::integer = crop.configuration_revision + 1
      and (select growth_duration_seconds = 420
        from public.cozy_crop_definitions where id = crop.id)
      and (select bool_and(growth_duration_seconds = 300 and configuration_revision = 2)
        from public.player_home_crop_instances where crop_definition_id = crop.id),
    'crop definition revisions affect future plantings while planted instances retain snapshots'
  );

  select template.* into strict active_template
  from public.cozy_active_home_templates active
  join public.cozy_home_templates template on template.id = active.home_template_id
  where active.logical_slug = 'starter-cottage-interior';
  select profile.id, home.template_id into strict owner_id, owner_template_id
  from public.player_profiles profile
  join public.player_homes home on home.player_profile_id = profile.id
  where profile.wallet_address = '11111111111111111111111111111145';
  select id into strict other_id
  from public.player_profiles where wallet_address = '11111111111111111111111111111146';
  definition := jsonb_build_object(
    'name', 'Starter Cottage Interior v2',
    'bounds', jsonb_build_object(
      'minX', active_template.min_x, 'minY', active_template.min_y,
      'maxX', active_template.max_x, 'maxY', active_template.max_y
    ),
    'spawn', jsonb_build_object('x', active_template.spawn_x, 'y', active_template.spawn_y),
    'exit', jsonb_build_object('x', active_template.exit_x, 'y', active_template.exit_y),
    'blockedCells', active_template.blocked_cells,
    'developmentArt', active_template.development_art,
    'tiles', (
      select jsonb_agg(jsonb_build_object(
        'tileKey', tile.tile_key, 'slot', tile.slot, 'x', tile.grid_x, 'y', tile.grid_y
      ) order by tile.slot)
      from public.cozy_home_farm_tile_templates tile
      where tile.home_template_id = active_template.id
        and tile.template_version = active_template.template_version
        and tile.active
    )
  );
  result := public.create_admin_farming_plot_template_successor(
    admin_user_id, admin_auth_session_id, 'aal2', active_template.id,
    active_template.template_version, definition,
    'Create a validated successor for future plots without rewriting current homes.',
    'phase11-admin-template-successor'
  );
  replay := public.create_admin_farming_plot_template_successor(
    admin_user_id, admin_auth_session_id, 'aal2', active_template.id,
    active_template.template_version, definition,
    'Create a validated successor for future plots without rewriting current homes.',
    'phase11-admin-template-successor'
  );
  successor_template_id := (result #>> '{plotTemplate,template,id}')::uuid;
  perform pg_temp.phase11_assert(
    result ->> 'status' = 'updated'
      and (result #>> '{plotTemplate,validation,valid}')::boolean
      and (result #>> '{plotTemplate,template,templateVersion}')::integer
        = active_template.template_version + 1
      and replay ->> 'status' = 'replayed'
      and (select template_id = owner_template_id from public.player_homes
        where player_profile_id = owner_id)
      and (select template_id = owner_template_id from public.player_homes
        where player_profile_id = other_id),
    'template successors are validated and activated only for future provisioning'
  );

  select active_published_version_id into strict map_version_id
  from public.world_maps where slug = 'lantern-square';
  insert into public.player_profiles(
    wallet_address, display_name, appearance_preset, current_map_id,
    current_map_version_id, safe_position_x, safe_position_y, facing_direction
  ) values (
    future_wallet, 'Phase Eleven Future', 'moss', 'lantern-square',
    map_version_id, 12, 10.5, 'north'
  );
  select id into strict future_id from public.player_profiles where wallet_address = future_wallet;
  perform public.bootstrap_player_cozy_gameplay(
    future_wallet, 'phase11-future-bootstrap-0001', 'phase11:future:bootstrap'
  );
  perform pg_temp.phase11_assert(
    private.ensure_player_home_plot(future_id, 'phase11-future-plot-provision'),
    'the active successor provisions a complete future home plot'
  );
  perform pg_temp.phase11_assert(
    (select template_id = successor_template_id and provisioned_template_version = 2
      from public.player_homes where player_profile_id = future_id),
    'new players provision from the active successor while existing homes remain pinned'
  );

  select * into strict current_quest
  from public.cozy_quest_versions
  where lifecycle_status = 'published' and active
  order by version_number desc limit 1;
  definition := jsonb_build_object(
    'name', 'Your First Moonbean Harvest v2',
    'description', current_quest.description,
    'starterSeedQuantity', current_quest.starter_seed_quantity,
    'deliveryQuantity', current_quest.delivery_quantity,
    'rewardDust', current_quest.reward_dust,
    'starterHoeItemId', current_quest.starter_hoe_item_definition_id,
    'starterWateringCanItemId', current_quest.starter_watering_can_item_definition_id,
    'starterSeedItemId', current_quest.starter_seed_item_definition_id,
    'deliveryItemId', current_quest.delivery_item_definition_id,
    'objectives', (
      select jsonb_agg(jsonb_build_object(
        'key', objective.objective_key,
        'label', objective.label,
        'required', objective.required_count
      ) order by objective.sequence_number)
      from public.cozy_quest_objectives objective
      where objective.quest_version_id = current_quest.id
    )
  );
  result := public.create_admin_starter_quest_successor(
    admin_user_id, admin_auth_session_id, 'aal2', current_quest.id,
    current_quest.version_number, definition,
    'Publish an immutable quest successor while accepted players remain version pinned.',
    'phase11-admin-quest-successor-v2'
  );
  second_quest_id := (result #>> '{quest,versionId}')::uuid;
  perform pg_temp.phase11_assert(
    result ->> 'status' = 'updated'
      and (result #>> '{quest,versionNumber}')::integer = 2
      and (private.cozy_starter_quest_json(owner_id) ->> 'versionId')::uuid = current_quest.id
      and (private.cozy_starter_quest_json(other_id) ->> 'versionId')::uuid = second_quest_id,
    'quest successors preserve accepted-player pins and become available to unaccepted players'
  );
  update public.player_profiles set safe_position_x = 12, safe_position_y = 10.5
  where id = other_id;
  result := public.accept_player_starter_farming_quest(
    '11111111111111111111111111111146',
    'phase11-other-quest-accept-v2', 'phase11:other:accept:v2'
  );
  perform pg_temp.phase11_assert(
    result ->> 'status' = 'updated'
      and (select quest_version_id = second_quest_id
        from public.player_quest_instances where player_profile_id = other_id),
    'quest acceptance pins the active immutable version at acceptance time'
  );

  definition := jsonb_set(definition, '{name}', '"Your First Moonbean Harvest v3"'::jsonb);
  definition := jsonb_set(definition, '{rewardDust}', '30'::jsonb);
  blocked := false;
  begin
    perform public.create_admin_starter_quest_successor(
      content_user_id, content_auth_session_id, 'aal2', second_quest_id, 2, definition,
      'Attempt a reward change without the separate economy-sensitive permission.',
      'phase11-content-quest-reward-denied'
    );
  exception when insufficient_privilege then
    blocked := true;
  end;
  perform pg_temp.phase11_assert(
    blocked,
    'content managers cannot change DUST rewards without farming.reward_manage'
  );
  result := public.create_admin_starter_quest_successor(
    admin_user_id, admin_auth_session_id, 'aal2', second_quest_id, 2, definition,
    'Publish a separately authorized reward successor with compatibility for pinned quests.',
    'phase11-admin-quest-successor-v3'
  );
  third_quest_id := (result #>> '{quest,versionId}')::uuid;
  perform pg_temp.phase11_assert(
    result ->> 'status' = 'updated'
      and (result #>> '{quest,rewardDust}')::integer = 30
      and (private.cozy_starter_quest_json(owner_id) ->> 'versionId')::uuid = current_quest.id
      and (private.cozy_starter_quest_json(other_id) ->> 'versionId')::uuid = second_quest_id
      and (private.cozy_starter_quest_json(future_id) ->> 'versionId')::uuid = third_quest_id
      and exists(
        select 1
        from public.economy_active_source_versions active
        join public.economy_source_versions source on source.id = active.source_version_id
        where active.source_key = 'starter-farming-tutorial'
          and source.minimum_amount = 25 and source.maximum_amount = 30
      ),
    'reward successors retain compatibility across immutable accepted quest versions'
  );

  blocked := false;
  begin
    update public.cozy_quest_versions set name = 'Forbidden rewrite'
    where id = current_quest.id;
  exception when others then
    blocked := true;
  end;
  perform pg_temp.phase11_assert(blocked, 'published quest versions remain immutable');

  blocked := false;
  begin
    update public.cozy_farming_admin_audit_events set reason = 'Forbidden audit rewrite'
    where administrator_user_id = admin_user_id;
  exception when others then
    blocked := true;
  end;
  perform pg_temp.phase11_assert(blocked, 'farming configuration audit history is append-only');

  content := public.get_admin_farming_content(
    admin_user_id, admin_auth_session_id, 'aal2'
  );
  perform pg_temp.phase11_assert(
    jsonb_array_length(content -> 'plotTemplateVersions') = 2
      and jsonb_array_length(content -> 'questVersions') = 3
      and jsonb_array_length(content -> 'audit') = 5,
    'administrator history exposes the exact item, crop, template, and quest successor audit trail'
  );
end;
$$;

do $$
declare
  owner_wallet constant text := '11111111111111111111111111111145';
  config public.token_gate_configs%rowtype;
  owner_id uuid;
  owner_home_id uuid;
  challenge_id constant uuid := 'a1110000-0000-4000-8000-000000000001';
  access_id constant uuid := 'a1110000-0000-4000-8000-000000000002';
  result jsonb;
  admission jsonb;
  session_id uuid;
begin
  select * into strict config
  from public.token_gate_configs
  where enabled
  order by updated_at desc
  limit 1;
  select id into strict owner_id from public.player_profiles where wallet_address=owner_wallet;
  select id into strict owner_home_id from public.player_homes where player_profile_id=owner_id;
  update public.player_profiles profile
  set current_map_version_id=map.active_published_version_id
  from public.world_maps map
  where profile.id=owner_id and map.slug=profile.current_map_id;

  insert into public.wallet_auth_challenges (
    id,wallet_address,network,token_gate_config_id,config_version_snapshot,
    nonce_hash,message_hash,domain,uri,issued_at,expires_at,consumed_at,request_id,ip_hash
  ) values (
    challenge_id,owner_wallet,config.network,config.id,config.config_version,
    repeat('1',64),repeat('2',64),'localhost','http://localhost:3000',
    now()-interval '1 minute',now()+interval '4 minutes',now(),
    'phase11-private-realtime-challenge',repeat('3',64)
  );
  insert into public.wallet_access_sessions (
    id,challenge_id,wallet_address,network,token_gate_config_id,config_version_snapshot,
    session_token_hash,observed_balance_raw,required_balance_raw,checked_slot,
    last_balance_check_at,expires_at
  ) values (
    access_id,challenge_id,owner_wallet,config.network,config.id,config.config_version,
    repeat('a',64),coalesce(config.required_amount_raw,1000),
    coalesce(config.required_amount_raw,1000),1,
    now(),now()+interval '30 minutes'
  );

  result:=public.issue_player_private_home_realtime_ticket(
    repeat('a',64),repeat('b',64),owner_home_id,'phase11-private-ticket-owner'
  );
  perform pg_temp.phase11_assert(
    result->>'status'='issued' and (result->>'homeId')::uuid=owner_home_id,
    'the trusted API can issue a one-use ticket only for the authenticated owner home: '
      ||result::text
  );
  perform pg_temp.phase11_assert(
    public.issue_player_private_home_realtime_ticket(
      repeat('a',64),repeat('c',64),
      (select id from public.player_homes where player_profile_id<>owner_id limit 1),
      'phase11-private-ticket-cross-owner'
    )->>'status'='plot_unavailable',
    'a captured home UUID cannot be used to issue another owner private ticket'
  );

  admission:=public.admit_player_private_home_realtime_ticket(
    repeat('b',64),'phase11-private-owner-connection','phase11-private-owner-admit'
  );
  perform pg_temp.phase11_assert(
    admission->>'status'='admitted' and (admission->>'homeId')::uuid=owner_home_id,
    'the private channel admits only the ticket-pinned owner home'
  );
  session_id:=(admission->>'sessionId')::uuid;
  perform pg_temp.phase11_assert(
    public.admit_player_private_home_realtime_ticket(
      repeat('b',64),'phase11-private-replay','phase11-private-replay'
    )->>'status'='invalid_ticket',
    'a consumed private-home ticket cannot be replayed'
  );

  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(owner_id,owner_home_id,'crop_stage_changed',owner_home_id,
    jsonb_build_object('source','phase11-local-fixture'));
  result:=public.get_player_private_home_realtime_events(
    session_id,(admission->>'lastEventNumber')::bigint,false
  );
  perform pg_temp.phase11_assert(
    result->>'status'='loaded'
      and jsonb_array_length(result->'events')=1
      and result->'events'->0->>'eventKey'='crop_stage_changed'
      and result->'view'->'plot'->>'ownerPlayerId'=owner_id::text,
    'private realtime reads only new server-authored events and the owner projection'
  );
  perform pg_temp.phase11_assert(
    public.close_player_private_home_realtime_session(
      session_id,'client_exit','phase11-private-close'
    ),
    'the private session closes explicitly on plot exit'
  );
  perform pg_temp.phase11_assert(
    public.revalidate_player_private_home_realtime_session(session_id)->>'status'='closed',
    'a closed private session cannot reconnect without a new owner ticket'
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
    ,'cozy_private_realtime_tickets','cozy_private_realtime_sessions',
    'cozy_active_home_templates'
  ] loop
    perform pg_temp.phase11_assert(
      not has_table_privilege('anon','public.'||table_name,'SELECT')
        and not has_table_privilege('authenticated','public.'||table_name,'SELECT')
        and not has_table_privilege('service_role','public.'||table_name,'SELECT')
        and not has_table_privilege('service_role','public.'||table_name,'INSERT')
        and not has_table_privilege('service_role','public.'||table_name,'UPDATE')
        and not has_table_privilege('service_role','public.'||table_name,'DELETE'),
      table_name||' is accessible only through reviewed trusted RPCs'
    );
  end loop;
end;
$$;

select pg_temp.phase11_assert(
  has_function_privilege('service_role','public.get_player_playable_vertical_slice(text,text)','EXECUTE')
    and has_function_privilege('service_role','public.accept_player_starter_farming_quest(text,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.prepare_player_home_soil(text,uuid,integer,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.plant_player_home_crop(text,uuid,text,integer,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.water_player_home_crop(text,uuid,uuid,integer,integer,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.harvest_player_home_crop(text,uuid,uuid,integer,integer,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.deliver_player_starter_farming_quest(text,integer,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.harvest_player_home_crop(text,uuid,uuid,integer,integer,text,text)','EXECUTE'),
  'only the trusted server role receives the Phase 11A player mutation surface'
);

select pg_temp.phase11_assert(
  has_function_privilege('service_role','public.issue_player_private_home_realtime_ticket(text,text,uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.admit_player_private_home_realtime_ticket(text,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.get_player_private_home_realtime_events(uuid,bigint,boolean)','EXECUTE')
    and has_function_privilege('service_role','public.revalidate_player_private_home_realtime_session(uuid)','EXECUTE')
    and has_function_privilege('service_role','public.close_player_private_home_realtime_session(uuid,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.admit_player_private_home_realtime_ticket(text,text,text)','EXECUTE'),
  'only trusted services can issue, admit, read, revalidate, or close private-home realtime sessions'
);

select pg_temp.phase11_assert(
  has_function_privilege('service_role','public.get_admin_farming_content(uuid,uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.update_admin_farming_item(uuid,uuid,text,uuid,integer,jsonb,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.update_admin_farming_crop(uuid,uuid,text,uuid,integer,jsonb,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.create_admin_farming_plot_template_successor(uuid,uuid,text,uuid,integer,jsonb,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.create_admin_starter_quest_successor(uuid,uuid,text,uuid,integer,jsonb,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.update_admin_farming_item(uuid,uuid,text,uuid,integer,jsonb,text,text)','EXECUTE'),
  'only the trusted service role can execute farming content management RPCs'
);

select pg_temp.phase11_assert(
  (select provolatile='s' from pg_proc
    where oid='private.cozy_playable_vertical_slice_json(uuid)'::regprocedure)
    and (select provolatile='i' from pg_proc
      where oid='private.cozy_home_tile_in_range(public.player_homes,public.player_home_farming_tiles,numeric)'::regprocedure)
    and (select provolatile='s' from pg_proc
      where oid='private.cozy_admin_item_json(public.cozy_item_definitions)'::regprocedure)
    and (select provolatile='s' from pg_proc
      where oid='public.get_admin_farming_content(uuid,uuid,text)'::regprocedure)
    and (select provolatile='v' from pg_proc
      where oid='public.harvest_player_home_crop(text,uuid,uuid,integer,integer,text,text)'::regprocedure)
    and (select provolatile='v' from pg_proc
      where oid='public.create_admin_starter_quest_successor(uuid,uuid,text,uuid,integer,jsonb,text,text)'::regprocedure),
  'function volatility matches table reads, pure checks, and farming mutations'
);

select 'Phase 11A postgres execution assertions passed' as result;

rollback;
