-- Starville Phase 11B player authority: owner-home workstation bootstrap,
-- consume-on-start jobs, offline readiness, safe collection, and quest continuation.

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
       'bootstrap','dust_read','inventory_read','history_read','quickbar_write',
       'farm_read','farm_write','recipe_read','recipe_write','shop_read','shop_write',
       'home_read','home_write','vertical_slice_read','plot_provision',
       'home_farm_write','starter_quest_write',
       'workstation_read','workstation_write','workstation_collect',
       'workstation_tutorial_write'
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
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare account public.player_dust_accounts%rowtype;
  policy public.economy_policy_versions%rowtype;
begin
  select version.* into strict policy
  from public.economy_active_policy active
  join public.economy_policy_versions version on version.id=active.policy_version_id
  where active.singleton_key;
  if not policy.economy_enabled and p_reason not in ('system_refund','migration_adjustment')
    then return false; end if;
  if p_reason in ('shop_purchase','shop_sale') and not policy.purchases_enabled
    then return false; end if;
  if p_reason in (
      'cooperative_activity_reward','starter_farming_quest_reward',
      'starter_workstation_quest_reward'
    ) and not policy.rewards_enabled then return false; end if;
  if p_reason='administrative_correction' and not policy.corrections_enabled
    then return false; end if;
  if p_delta>0 and not exists(
    select 1 from public.economy_active_source_versions active
    join public.economy_source_versions source on source.id=active.source_version_id
    where source.operation_key=p_reason and source.lifecycle_status='published'
      and source.effective_at<=now()
      and p_delta between source.minimum_amount and source.maximum_amount
  ) then return false; end if;
  if p_delta<0 and not exists(
    select 1 from public.economy_active_sink_versions active
    join public.economy_sink_versions sink on sink.id=active.sink_version_id
    where sink.operation_key=p_reason and sink.lifecycle_status='published'
      and sink.effective_at<=now()
      and abs(p_delta) between sink.minimum_amount and sink.maximum_amount
  ) then return false; end if;
  select * into strict account from public.player_dust_accounts
  where player_profile_id=p_player_profile_id for update;
  if p_delta=0 then return true; end if;
  if account.balance+p_delta<0 or account.balance+p_delta>9000000000000000
    then return false; end if;
  update public.player_dust_accounts set
    balance=balance+p_delta,state_version=state_version+1,updated_at=now()
  where player_profile_id=p_player_profile_id returning * into account;
  insert into public.player_dust_ledger(
    player_profile_id,delta,resulting_balance,reason,reference_type,
    reference_id,idempotency_key,request_id
  ) values(
    p_player_profile_id,p_delta,account.balance,p_reason,p_reference_type,
    p_reference_id,
    encode(extensions.digest(convert_to(p_reason||':'||p_idempotency_key,'UTF8'),'sha256'),'hex'),
    p_request_id
  );
  return true;
end;
$$;

create or replace function private.ensure_player_home_workstations(
  p_player_profile_id uuid,
  p_request_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare home public.player_homes%rowtype; template public.cozy_home_templates%rowtype;
  workstation_count integer; template_count integer;
begin
  if p_player_profile_id is null or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_WORKSTATION_PROVISION_REQUEST';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'phase11b-workstations:'||p_player_profile_id::text,0));
  select * into home from public.player_homes
  where player_profile_id=p_player_profile_id for update;
  if not found or home.lifecycle_status<>'active' then return false; end if;
  select * into strict template from public.cozy_home_templates where id=home.template_id;
  select count(*) into template_count
  from public.cozy_home_workstation_templates station_template
  where station_template.home_template_id=home.template_id
    and station_template.template_version=coalesce(
      home.provisioned_template_version,template.template_version
    ) and station_template.enabled;
  if template_count<>2 then return false; end if;
  insert into public.player_home_workstations(
    player_profile_id,player_home_id,workstation_template_id,
    workstation_definition_id,world_object_id,position_x,position_y,
    interaction_x,interaction_y,enabled
  )
  select p_player_profile_id,home.id,station_template.id,
    station_template.workstation_definition_id,station_template.world_object_id,
    station_template.position_x,station_template.position_y,
    station_template.interaction_x,station_template.interaction_y,
    station_template.enabled
  from public.cozy_home_workstation_templates station_template
  where station_template.home_template_id=home.template_id
    and station_template.template_version=coalesce(
      home.provisioned_template_version,template.template_version
    ) and station_template.enabled
  on conflict (player_home_id,workstation_definition_id) do nothing;
  select count(*) into workstation_count from public.player_home_workstations
  where player_home_id=home.id;
  return workstation_count=2;
end;
$$;

create or replace function private.cozy_recipe_is_unlocked(
  p_player_profile_id uuid,
  p_version public.cozy_recipe_versions
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_version.unlock_rule
    when 'starter' then true
    when 'phase11a_complete' then exists(
      select 1 from public.player_quest_instances instance
      join public.cozy_quest_versions quest_version on quest_version.id=instance.quest_version_id
      where instance.player_profile_id=p_player_profile_id
        and quest_version.quest_kind='farming_tutorial'
        and instance.status='reward_claimed'
    )
    when 'phase11b_tutorial_accepted' then exists(
      select 1 from public.player_recipe_unlocks unlock
      where unlock.player_profile_id=p_player_profile_id
        and unlock.recipe_definition_id=p_version.recipe_definition_id
    )
    when 'phase11b_cooking_collected' then exists(
      select 1 from public.player_recipe_unlocks unlock
      where unlock.player_profile_id=p_player_profile_id
        and unlock.recipe_definition_id=p_version.recipe_definition_id
    )
    else exists(
      select 1 from public.player_recipe_unlocks unlock
      where unlock.player_profile_id=p_player_profile_id
        and unlock.recipe_definition_id=p_version.recipe_definition_id
    )
  end;
$$;

create or replace function private.cozy_workstation_live_ops_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cookingStartsEnabled',settings.cooking_starts_enabled,
    'craftingStartsEnabled',settings.crafting_starts_enabled,
    'collectionEnabled',settings.collection_enabled,
    'tutorialUnlocksEnabled',settings.tutorial_unlocks_enabled,
    'tutorialRewardsEnabled',settings.tutorial_rewards_enabled,
    'dustFeesEnabled',settings.dust_fees_enabled,
    'useLocalDurations',settings.use_local_durations,
    'maintenanceMessage',settings.maintenance_message,
    'configurationRevision',settings.configuration_revision
  )
  from public.cozy_crafting_settings settings where settings.singleton_key;
$$;

create or replace function private.cozy_workstation_definition_json(
  definition public.cozy_workstation_definitions
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',definition.id,'key',definition.workstation_key,
    'name',definition.display_name,'description',definition.description,
    'type',definition.workstation_type,
    'allowedRecipeCategories',to_jsonb(definition.allowed_recipe_categories),
    'queueCapacity',definition.queue_capacity,
    'simultaneousJobPolicy',definition.simultaneous_job_policy,
    'interactionRadius',definition.interaction_radius,
    'enabled',definition.enabled,'assetRef',definition.asset_ref,
    'assetReadiness',definition.asset_readiness,
    'pinnedAssetVersionId',definition.pinned_asset_version_id,
    'fallbackMarker',definition.fallback_marker,
    'animationConfig',definition.animation_config,
    'soundConfig',definition.sound_config,
    'configurationRevision',definition.configuration_revision
  );
$$;

create or replace function private.cozy_crafting_job_json(
  job public.player_crafting_jobs
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare derived_status text; remaining_seconds integer; progress numeric;
begin
  derived_status:=case
    when job.status='running' and job.completes_at<=now() then 'ready'
    else job.status
  end;
  remaining_seconds:=case when derived_status='running' then
    greatest(0,ceil(extract(epoch from (job.completes_at-now())))::integer) else 0 end;
  progress:=case
    when derived_status in ('ready','collecting','collected') then 1
    when derived_status<>'running' then 0
    else greatest(0,least(1,
      extract(epoch from (now()-job.started_at))
      / nullif(extract(epoch from (job.completes_at-job.started_at)),0)
    ))
  end;
  return jsonb_build_object(
    'id',job.id,'workstationInstanceId',job.workstation_instance_id,
    'workstationDefinitionId',job.workstation_definition_id,
    'recipeDefinitionId',job.recipe_definition_id,
    'recipeVersionId',job.recipe_version_id,
    'recipeKey',job.recipe_key,'recipeName',job.recipe_name,
    'recipeCategory',job.recipe_category,'workstationType',job.workstation_type,
    'quantity',job.quantity,'status',derived_status,
    'startedAt',job.started_at,'completesAt',job.completes_at,
    'collectedAt',job.collected_at,'ingredients',job.ingredient_snapshot,
    'output',jsonb_build_object(
      'itemSlug',job.output_item_slug,'itemName',job.output_item_name,
      'quantity',job.output_quantity
    ),
    'durationSeconds',job.duration_seconds,'remainingSeconds',remaining_seconds,
    'progress',progress,'dustFee',job.dust_fee,
    'stateVersion',job.state_version,'failureCode',job.safe_failure_code,
    'updatedAt',job.updated_at
  );
end;
$$;

create or replace function private.cozy_workstation_instance_json(
  station public.player_home_workstations
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',station.id,'homeId',station.player_home_id,
    'worldObjectId',station.world_object_id,
    'definition',private.cozy_workstation_definition_json(definition),
    'position',jsonb_build_object('x',station.position_x,'y',station.position_y),
    'interactionPoint',jsonb_build_object('x',station.interaction_x,'y',station.interaction_y),
    'enabled',station.enabled,'stateVersion',station.state_version,
    'queue',jsonb_build_object(
      'capacity',definition.queue_capacity,
      'occupied',(select count(*) from public.player_crafting_jobs job
        where job.workstation_instance_id=station.id
          and job.status in ('pending','running','ready','blocked')),
      'running',(select count(*) from public.player_crafting_jobs job
        where job.workstation_instance_id=station.id and job.status='running'
          and job.completes_at>now()),
      'ready',(select count(*) from public.player_crafting_jobs job
        where job.workstation_instance_id=station.id
          and (job.status='ready' or (job.status='running' and job.completes_at<=now()))),
      'remainingSlots',greatest(0,definition.queue_capacity-(select count(*)
        from public.player_crafting_jobs job where job.workstation_instance_id=station.id
          and job.status in ('pending','running','ready','blocked')))
    )
  )
  from public.cozy_workstation_definitions definition
  where definition.id=station.workstation_definition_id;
$$;

create or replace function private.cozy_recipe_version_json(
  p_player_profile_id uuid,
  version public.cozy_recipe_versions
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare output_item public.cozy_item_definitions%rowtype; unlocked boolean;
  max_quantity integer:=version.maximum_batch_quantity; ingredient_row record;
  account public.player_dust_accounts%rowtype;
begin
  select * into strict output_item from public.cozy_item_definitions
  where id=version.output_item_definition_id;
  unlocked:=private.cozy_recipe_is_unlocked(p_player_profile_id,version);
  for ingredient_row in
    select version_ingredient.quantity, item.slug
    from public.cozy_recipe_version_ingredients version_ingredient
    join public.cozy_item_definitions item on item.id=version_ingredient.item_definition_id
    where version_ingredient.recipe_version_id=version.id
  loop
    max_quantity:=least(max_quantity,
      private.cozy_owned_quantity(p_player_profile_id,(
        select id from public.cozy_item_definitions where slug=ingredient_row.slug
      ))/ingredient_row.quantity);
  end loop;
  select * into strict account from public.player_dust_accounts
  where player_profile_id=p_player_profile_id;
  if version.dust_fee>0 then
    max_quantity:=least(max_quantity,least(account.balance/version.dust_fee,99)::integer);
  end if;
  return jsonb_build_object(
    'definitionId',version.recipe_definition_id,'versionId',version.id,
    'versionNumber',version.version_number,'key',(select slug from public.cozy_recipe_definitions where id=version.recipe_definition_id),
    'name',version.public_name,'description',version.public_description,
    'category',version.recipe_category,'workstationType',version.workstation_type,
    'ingredients',coalesce((select jsonb_agg(jsonb_build_object(
      'itemId',item.id,'itemSlug',item.slug,'itemName',item.name,
      'quantityPerBatch',ingredient.quantity,
      'ownedQuantity',private.cozy_owned_quantity(p_player_profile_id,item.id)
    ) order by ingredient.display_order)
      from public.cozy_recipe_version_ingredients ingredient
      join public.cozy_item_definitions item on item.id=ingredient.item_definition_id
      where ingredient.recipe_version_id=version.id),'[]'::jsonb),
    'output',jsonb_build_object('itemId',output_item.id,'itemSlug',output_item.slug,
      'itemName',output_item.name,'quantityPerBatch',version.output_quantity,
      'assetRef',output_item.asset_ref,'assetReadiness',output_item.asset_readiness),
    'productionDurationSeconds',version.production_duration_seconds,
    'localDurationSeconds',version.local_duration_seconds,
    'dustFee',version.dust_fee,'unlockRule',version.unlock_rule,
    'discoveryPolicy',version.discovery_policy,'unlocked',unlocked,
    'lockedReason',case when unlocked then null
      when version.unlock_rule='phase11b_tutorial_accepted' then 'Continue the tutorial with Willow Guide.'
      when version.unlock_rule='phase11b_cooking_collected' then 'Collect Garden Soup to unlock this recipe.'
      else 'Complete the required progression to unlock this recipe.' end,
    'tutorialEligible',version.tutorial_eligible,'repeatable',version.repeatable,
    'maximumBatchQuantity',version.maximum_batch_quantity,
    'maximumStartable',case when unlocked and version.enabled then greatest(0,max_quantity) else 0 end,
    'enabled',version.enabled,'configurationRevision',version.configuration_revision
  );
end;
$$;

create or replace function private.cozy_workstation_tutorial_json(
  p_player_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare version public.cozy_quest_versions%rowtype;
  definition public.cozy_quest_definitions%rowtype;
  instance public.player_quest_instances%rowtype; prerequisite_complete boolean;
  receipt text;
begin
  select * into instance from public.player_quest_instances
  where player_profile_id=p_player_profile_id
    and quest_definition_id=(
      select id from public.cozy_quest_definitions where slug='hearth-and-hands'
    );
  if found then
    select * into strict version from public.cozy_quest_versions
    where id=instance.quest_version_id;
  else
    select version_row.* into strict version
    from public.cozy_active_workstation_tutorial_versions active
    join public.cozy_quest_versions version_row on version_row.id=active.quest_version_id;
  end if;
  select * into strict definition from public.cozy_quest_definitions
  where id=version.quest_definition_id;
  select exists(
    select 1 from public.player_quest_instances farming_instance
    where farming_instance.player_profile_id=p_player_profile_id
      and farming_instance.quest_definition_id=version.required_quest_definition_id
      and farming_instance.status='reward_claimed'
  ) into prerequisite_complete;
  if found and instance.reward_ledger_entry_id is not null then
    select public_receipt_id into receipt from public.player_dust_ledger
    where id=instance.reward_ledger_entry_id;
  end if;
  return jsonb_build_object(
    'definitionId',definition.id,'versionId',version.id,
    'instanceId',instance.id,'key',definition.slug,'name',version.name,
    'description',version.description,'eligible',prerequisite_complete,
    'status',case when instance.id is null then
      case when prerequisite_complete then 'available' else 'locked' end
      else instance.status end,
    'objectives',(select jsonb_agg(jsonb_build_object(
      'key',objective.objective_key,'label',objective.label,
      'current',coalesce(progress.current_count,0),'required',objective.required_count,
      'completed',coalesce(progress.current_count,0)>=objective.required_count
    ) order by objective.sequence_number)
      from public.cozy_quest_objectives objective
      left join public.player_quest_objective_progress progress
        on progress.quest_objective_id=objective.id
       and progress.player_quest_instance_id=instance.id
      where objective.quest_version_id=version.id),
    'rewardDust',version.reward_dust,'stateVersion',coalesce(instance.state_version,0),
    'acceptedAt',instance.accepted_at,'completedAt',instance.completed_at,
    'rewardReceiptId',receipt
  );
end;
$$;

create or replace function private.cozy_workstation_workspace_json(
  p_player_profile_id uuid,
  p_station public.player_home_workstations
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'workstation',private.cozy_workstation_instance_json(p_station),
    'recipes',coalesce((select jsonb_agg(private.cozy_recipe_version_json(
      p_player_profile_id,version
    ) order by version.tutorial_eligible desc,version.public_name)
      from public.cozy_active_recipe_versions active
      join public.cozy_recipe_versions version on version.id=active.recipe_version_id
      where version.workstation_type=definition.workstation_type
        and version.lifecycle_status='active'
        and (version.discovery_policy<>'hidden'
          or private.cozy_recipe_is_unlocked(p_player_profile_id,version))),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(private.cozy_crafting_job_json(job)
      order by job.created_at desc)
      from (select queued.* from public.player_crafting_jobs queued
        where queued.player_profile_id=p_player_profile_id
          and queued.workstation_instance_id=p_station.id
        order by queued.created_at desc limit 25) job),'[]'::jsonb),
    'inventory',private.cozy_inventory_json(p_player_profile_id),
    'dust',(select private.cozy_dust_account_json(account)
      from public.player_dust_accounts account
      where account.player_profile_id=p_player_profile_id),
    'tutorial',private.cozy_workstation_tutorial_json(p_player_profile_id),
    'liveOps',private.cozy_workstation_live_ops_json(),
    'serverTime',now()
  )
  from public.cozy_workstation_definitions definition
  where definition.id=p_station.workstation_definition_id;
$$;

create or replace function private.cozy_home_plot_json(home public.player_homes)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
    'tiles',coalesce((select jsonb_agg(private.cozy_home_farm_tile_json(tile) order by tile.slot)
      from public.player_home_farming_tiles tile where tile.player_home_id=home.id),'[]'::jsonb),
    'workstations',coalesce((select jsonb_agg(private.cozy_workstation_instance_json(station)
      order by station.world_object_id) from public.player_home_workstations station
      where station.player_home_id=home.id),'[]'::jsonb),
    'farmingStateVersion',home.farming_state_version,
    'stateVersion',home.state_version,'createdAt',home.created_at,'updatedAt',home.updated_at
  )
  from public.cozy_home_templates template where template.id=home.template_id;
$$;

create or replace function private.cozy_starter_quest_json(p_player_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare version public.cozy_quest_versions%rowtype;
  definition public.cozy_quest_definitions%rowtype;
  instance public.player_quest_instances%rowtype; receipt text;
begin
  select * into instance from public.player_quest_instances
  where player_profile_id=p_player_profile_id
    and quest_definition_id=(
      select id from public.cozy_quest_definitions where slug='first-moonbean-harvest'
    );
  if found then
    select * into strict version from public.cozy_quest_versions
    where id=instance.quest_version_id;
  else
    select * into strict version from public.cozy_quest_versions
    where quest_kind='farming_tutorial' and lifecycle_status='published' and active
    order by version_number desc limit 1;
  end if;
  select * into strict definition from public.cozy_quest_definitions
  where id=version.quest_definition_id;
  if found and instance.reward_ledger_entry_id is not null then
    select public_receipt_id into receipt from public.player_dust_ledger
    where id=instance.reward_ledger_entry_id;
  end if;
  return jsonb_build_object(
    'definitionId',definition.id,'versionId',version.id,
    'instanceId',instance.id,'slug',definition.slug,'name',version.name,
    'description',version.description,
    'status',case when instance.id is null then 'available' else instance.status end,
    'objectives',(select jsonb_agg(jsonb_build_object(
      'key',objective.objective_key,'label',objective.label,
      'current',coalesce(progress.current_count,0),'required',objective.required_count,
      'completed',coalesce(progress.current_count,0)>=objective.required_count
    ) order by objective.sequence_number)
      from public.cozy_quest_objectives objective
      left join public.player_quest_objective_progress progress
        on progress.quest_objective_id=objective.id
       and progress.player_quest_instance_id=instance.id
      where objective.quest_version_id=version.id),
    'starterSeedQuantity',version.starter_seed_quantity,
    'deliveryQuantity',version.delivery_quantity,'rewardDust',version.reward_dust,
    'stateVersion',coalesce(instance.state_version,0),
    'acceptedAt',instance.accepted_at,'completedAt',instance.completed_at,
    'rewardReceiptId',receipt
  );
end;
$$;

create or replace function private.cozy_playable_vertical_slice_json(p_player_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare home public.player_homes%rowtype;
begin
  select * into strict home from public.player_homes
  where player_profile_id=p_player_profile_id;
  return jsonb_build_object(
    'contentVersion',3,'plot',private.cozy_home_plot_json(home),
    'inventory',private.cozy_inventory_json(p_player_profile_id),
    'quickbar',private.cozy_quickbar_json(p_player_profile_id),
    'quest',private.cozy_starter_quest_json(p_player_profile_id),
    'workstationTutorial',private.cozy_workstation_tutorial_json(p_player_profile_id),
    'npc',private.cozy_starter_npc_json(),'liveOps',private.cozy_farming_live_ops_json(),
    'realtimeChannel','private-home:'||home.id::text,'serverTime',now()
  );
end;
$$;

create or replace function private.cozy_advance_starter_quest(
  p_player_profile_id uuid,p_event_key text,p_related_entity_id uuid,
  p_idempotency_key text,p_request_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare instance public.player_quest_instances%rowtype; selected_objective_key text;
  objective public.cozy_quest_objectives%rowtype; inserted_count integer; home_id uuid;
begin
  select instance_row.* into instance
  from public.player_quest_instances instance_row
  join public.cozy_quest_versions version on version.id=instance_row.quest_version_id
  where instance_row.player_profile_id=p_player_profile_id
    and instance_row.status='active' and version.quest_kind='farming_tutorial'
  for update of instance_row;
  if not found then return false; end if;
  selected_objective_key:=case p_event_key
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
    raise exception using errcode='22023',message='INVALID_STARTER_QUEST_EVENT'; end if;
  insert into public.player_quest_events(
    player_profile_id,player_quest_instance_id,event_key,related_entity_id,
    idempotency_key,request_id,event_summary
  ) values(p_player_profile_id,instance.id,p_event_key,p_related_entity_id,
    p_idempotency_key,p_request_id,jsonb_build_object('objectiveKey',selected_objective_key))
  on conflict do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count=0 then return false; end if;
  select * into strict objective from public.cozy_quest_objectives
  where quest_version_id=instance.quest_version_id and objective_key=selected_objective_key;
  update public.player_quest_objective_progress progress set
    current_count=least(objective.required_count,progress.current_count+1),
    completed_at=case when progress.current_count+1>=objective.required_count
      then coalesce(progress.completed_at,now()) else progress.completed_at end,
    state_version=progress.state_version+1
  where progress.player_quest_instance_id=instance.id
    and progress.quest_objective_id=objective.id;
  update public.player_quest_instances set state_version=state_version+1 where id=instance.id;
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

create or replace function private.cozy_advance_workstation_tutorial(
  p_player_profile_id uuid,p_event_key text,p_related_entity_id uuid,
  p_idempotency_key text,p_request_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare instance public.player_quest_instances%rowtype; selected_objective_key text;
  objective public.cozy_quest_objectives%rowtype; inserted_count integer; home_id uuid;
begin
  select instance_row.* into instance
  from public.player_quest_instances instance_row
  join public.cozy_quest_versions version on version.id=instance_row.quest_version_id
  where instance_row.player_profile_id=p_player_profile_id
    and instance_row.status='active' and version.quest_kind='workstation_tutorial'
  for update of instance_row;
  if not found then return false; end if;
  selected_objective_key:=case p_event_key
    when 'workstation_tutorial_accepted' then 'speak_with_guide'
    when 'cooking_recipe_unlocked' then 'unlock_cooking_recipe'
    when 'cooked_output_collected' then 'collect_cooked_item'
    when 'crafting_recipe_unlocked' then 'unlock_crafting_recipe'
    when 'crafted_output_collected' then 'collect_crafted_item'
    when 'workstation_tutorial_returned' then 'return_to_guide'
    when 'workstation_tutorial_reward_settled' then 'receive_reward'
    else null end;
  if selected_objective_key is null then
    raise exception using errcode='22023',message='INVALID_WORKSTATION_TUTORIAL_EVENT'; end if;
  insert into public.player_quest_events(
    player_profile_id,player_quest_instance_id,event_key,related_entity_id,
    idempotency_key,request_id,event_summary
  ) values(p_player_profile_id,instance.id,p_event_key,p_related_entity_id,
    p_idempotency_key,p_request_id,jsonb_build_object('objectiveKey',selected_objective_key))
  on conflict do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count=0 then return false; end if;
  select * into strict objective from public.cozy_quest_objectives
  where quest_version_id=instance.quest_version_id and objective_key=selected_objective_key;
  update public.player_quest_objective_progress progress set
    current_count=objective.required_count,completed_at=coalesce(progress.completed_at,now()),
    state_version=progress.state_version+1
  where progress.player_quest_instance_id=instance.id
    and progress.quest_objective_id=objective.id;
  update public.player_quest_instances set state_version=state_version+1 where id=instance.id;
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

create or replace function private.cozy_claim_crafting_cooldown(
  p_player_profile_id uuid,p_action_key text,p_cooldown_ms integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare claimed boolean;
begin
  if p_action_key not in ('start','collect','tutorial_turn_in')
     or p_cooldown_ms not between 100 and 10000 then
    raise exception using errcode='22023',message='INVALID_CRAFTING_COOLDOWN'; end if;
  insert into public.cozy_crafting_action_cooldowns(
    player_profile_id,action_key,last_action_at,updated_at
  ) values(p_player_profile_id,p_action_key,clock_timestamp(),clock_timestamp())
  on conflict(player_profile_id,action_key) do update set
    last_action_at=clock_timestamp(),updated_at=clock_timestamp()
  where cozy_crafting_action_cooldowns.last_action_at
    <=clock_timestamp()-make_interval(secs=>p_cooldown_ms::numeric/1000)
  returning true into claimed;
  return coalesce(claimed,false);
end;
$$;

create or replace function private.cozy_workstation_in_range(
  p_home public.player_homes,
  p_station public.player_home_workstations,
  p_radius numeric,
  p_tolerance numeric
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select sqrt(power(p_home.current_position_x-p_station.interaction_x,2)
    +power(p_home.current_position_y-p_station.interaction_y,2))<=p_radius+p_tolerance;
$$;

create or replace function public.get_player_playable_vertical_slice(
  p_wallet_address text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; config public.cozy_gameplay_config%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_VERTICAL_SLICE_READ_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  if not exists(select 1 from public.player_homes where player_profile_id=profile.id)
    then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'vertical_slice_read',config.read_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  if not private.ensure_player_home_workstations(profile.id,p_request_id)
    then return jsonb_build_object('status','workstation_unavailable'); end if;
  return jsonb_build_object('status','loaded')||private.cozy_playable_vertical_slice_json(profile.id);
end;
$$;

create or replace function public.get_player_workstation_workspace(
  p_wallet_address text,p_workstation_instance_id uuid,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; config public.cozy_gameplay_config%rowtype;
  home public.player_homes%rowtype; station public.player_home_workstations%rowtype;
  definition public.cozy_workstation_definitions%rowtype; settings public.cozy_crafting_settings%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_workstation_instance_id is null or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_WORKSTATION_READ_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into home from public.player_homes where player_profile_id=profile.id;
  if not found or home.lifecycle_status<>'active' or not home.inside_home
    then return jsonb_build_object('status','workstation_world_mismatch'); end if;
  if not private.ensure_player_home_workstations(profile.id,p_request_id)
    then return jsonb_build_object('status','workstation_unavailable'); end if;
  select * into station from public.player_home_workstations
  where id=p_workstation_instance_id and player_profile_id=profile.id and player_home_id=home.id;
  if not found then return jsonb_build_object('status','workstation_not_found'); end if;
  select * into strict definition from public.cozy_workstation_definitions
  where id=station.workstation_definition_id;
  select * into strict settings from public.cozy_crafting_settings where singleton_key;
  if not private.cozy_workstation_in_range(home,station,definition.interaction_radius,
      settings.interaction_distance_tolerance)
    then return jsonb_build_object('status','workstation_too_far'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'workstation_read',config.read_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  return jsonb_build_object('status','loaded','workspace',
    private.cozy_workstation_workspace_json(profile.id,station));
end;
$$;

create or replace function public.start_player_workstation_job(
  p_wallet_address text,p_workstation_instance_id uuid,p_recipe_version_id uuid,
  p_quantity integer,p_expected_inventory_state_version integer,
  p_expected_dust_state_version integer,p_expected_workstation_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; config public.cozy_gameplay_config%rowtype;
  home public.player_homes%rowtype; station public.player_home_workstations%rowtype;
  definition public.cozy_workstation_definitions%rowtype; settings public.cozy_crafting_settings%rowtype;
  version public.cozy_recipe_versions%rowtype; active_version public.cozy_active_recipe_versions%rowtype;
  inventory_state public.player_inventory_state%rowtype; account public.player_dust_accounts%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; ingredient_row record;
  job public.player_crafting_jobs%rowtype; output_item public.cozy_item_definitions%rowtype;
  request_hash text; response jsonb; duration integer; fee_total bigint;
  ingredient_snapshot jsonb; occupied integer; job_id uuid:=gen_random_uuid();
  history_reason text; event_key text;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_workstation_instance_id is null or p_recipe_version_id is null
     or p_quantity not between 1 and 99
     or p_expected_inventory_state_version<1 or p_expected_dust_state_version<1
     or p_expected_workstation_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_WORKSTATION_JOB_START_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'workstation_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_workstation_instance_id::text||':'||p_recipe_version_id::text||':'||p_quantity::text||':'||
    p_expected_inventory_state_version::text||':'||p_expected_dust_state_version::text||':'||
    p_expected_workstation_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':workstation_job_start:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='workstation_job_start'
    and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into home from public.player_homes where player_profile_id=profile.id for update;
  if not found or home.lifecycle_status<>'active' or not home.inside_home
    then return jsonb_build_object('status','workstation_world_mismatch'); end if;
  select * into station from public.player_home_workstations
  where id=p_workstation_instance_id and player_profile_id=profile.id and player_home_id=home.id
  for update;
  if not found then return jsonb_build_object('status','workstation_not_found'); end if;
  select * into strict definition from public.cozy_workstation_definitions
  where id=station.workstation_definition_id;
  select * into strict settings from public.cozy_crafting_settings where singleton_key for update;
  if not station.enabled or not definition.enabled
    then return jsonb_build_object('status','workstation_disabled'); end if;
  if station.state_version<>p_expected_workstation_state_version
    then return jsonb_build_object('status','crafting_job_conflict'); end if;
  if not private.cozy_workstation_in_range(home,station,definition.interaction_radius,
      settings.interaction_distance_tolerance)
    then return jsonb_build_object('status','workstation_too_far'); end if;
  select * into version from public.cozy_recipe_versions where id=p_recipe_version_id;
  if not found then return jsonb_build_object('status','recipe_not_found'); end if;
  select * into active_version from public.cozy_active_recipe_versions
  where recipe_definition_id=version.recipe_definition_id;
  if not found or active_version.recipe_version_id<>version.id or version.lifecycle_status<>'active'
    then return jsonb_build_object('status','recipe_configuration_invalid'); end if;
  if not version.enabled then return jsonb_build_object('status','recipe_disabled'); end if;
  if version.workstation_type<>definition.workstation_type
    then return jsonb_build_object('status','recipe_wrong_workstation'); end if;
  if not private.cozy_recipe_is_unlocked(profile.id,version)
    then return jsonb_build_object('status','recipe_not_unlocked'); end if;
  if p_quantity>version.maximum_batch_quantity
    then return jsonb_build_object('status','recipe_batch_invalid'); end if;
  if version.recipe_category='cooking' and not settings.cooking_starts_enabled
    then return jsonb_build_object('status','cooking_system_disabled'); end if;
  if version.recipe_category='crafting' and not settings.crafting_starts_enabled
    then return jsonb_build_object('status','crafting_system_disabled'); end if;
  select count(*) into occupied from public.player_crafting_jobs queue_job
  where queue_job.workstation_instance_id=station.id
    and queue_job.status in ('pending','running','ready','blocked');
  if occupied>=definition.queue_capacity
    then return jsonb_build_object('status','crafting_queue_full'); end if;
  select * into strict inventory_state from public.player_inventory_state
  where player_profile_id=profile.id for update;
  select * into strict account from public.player_dust_accounts
  where player_profile_id=profile.id for update;
  if inventory_state.state_version<>p_expected_inventory_state_version
     or account.state_version<>p_expected_dust_state_version
    then return jsonb_build_object('status','inventory_conflict'); end if;
  for ingredient_row in
    select version_ingredient.*,item.slug,item.name
    from public.cozy_recipe_version_ingredients version_ingredient
    join public.cozy_item_definitions item on item.id=version_ingredient.item_definition_id
    where version_ingredient.recipe_version_id=version.id
    order by version_ingredient.display_order
  loop
    if private.cozy_owned_quantity(profile.id,ingredient_row.item_definition_id)
       < ingredient_row.quantity*p_quantity then
      return jsonb_build_object('status','ingredient_quantity_insufficient');
    end if;
  end loop;
  fee_total:=case when settings.dust_fees_enabled then version.dust_fee*p_quantity else 0 end;
  if fee_total<0 or fee_total>9000000000000000
    then return jsonb_build_object('status','recipe_batch_invalid'); end if;
  if account.balance<fee_total then return jsonb_build_object('status','dust_balance_insufficient'); end if;
  if not private.cozy_claim_crafting_cooldown(profile.id,'start',settings.start_cooldown_ms)
    then return jsonb_build_object('status','rate_limited'); end if;
  duration:=case when settings.use_local_durations
    then version.local_duration_seconds else version.production_duration_seconds end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'itemId',item.id,'itemSlug',item.slug,'itemName',item.name,
    'quantity',ingredient.quantity*p_quantity,'consumed',true
  ) order by ingredient.display_order),'[]'::jsonb) into ingredient_snapshot
  from public.cozy_recipe_version_ingredients ingredient
  join public.cozy_item_definitions item on item.id=ingredient.item_definition_id
  where ingredient.recipe_version_id=version.id;
  select * into strict output_item from public.cozy_item_definitions
  where id=version.output_item_definition_id;
  history_reason:=case when version.recipe_category='cooking'
    then 'cooking_ingredient_consumed' else 'crafting_ingredient_consumed' end;
  for ingredient_row in
    select * from public.cozy_recipe_version_ingredients
    where recipe_version_id=version.id order by display_order
  loop
    if not private.cozy_remove_item(
      profile.id,ingredient_row.item_definition_id,ingredient_row.quantity*p_quantity,
      history_reason,job_id::text,p_idempotency_key,p_request_id
    ) then raise exception using errcode='40001',message='CRAFTING_INGREDIENT_SETTLEMENT_FAILED'; end if;
  end loop;
  if fee_total>0 and not private.cozy_apply_dust_delta(
    profile.id,-fee_total,'crafting_fee','crafting_job',job_id::text,
    p_idempotency_key,p_request_id
  ) then raise exception using errcode='P0001',message='CRAFTING_DUST_SETTLEMENT_FAILED'; end if;
  insert into public.player_crafting_jobs(
    id,player_profile_id,player_home_id,workstation_instance_id,
    workstation_definition_id,recipe_definition_id,recipe_version_id,
    recipe_key,recipe_name,recipe_category,workstation_type,quantity,status,
    started_at,completes_at,ingredient_snapshot,output_item_definition_id,
    output_item_slug,output_item_name,output_quantity,duration_seconds,dust_fee,
    ingredient_settlement_reference,dust_settlement_reference,idempotency_key,safe_metadata
  ) values(
    job_id,profile.id,home.id,station.id,definition.id,version.recipe_definition_id,version.id,
    (select slug from public.cozy_recipe_definitions where id=version.recipe_definition_id),
    version.public_name,version.recipe_category,version.workstation_type,p_quantity,'running',
    now(),now()+make_interval(secs=>duration),ingredient_snapshot,output_item.id,
    output_item.slug,output_item.name,version.output_quantity*p_quantity,duration,fee_total,
    'inventory-history:'||job_id::text,
    case when fee_total>0 then 'dust-ledger:'||job_id::text else null end,
    p_idempotency_key,jsonb_build_object('recipeConfigurationRevision',version.configuration_revision)
  ) returning * into job;
  insert into public.cozy_crafting_job_events(
    player_profile_id,player_home_id,crafting_job_id,event_key,request_id,safe_payload
  ) values(profile.id,home.id,job.id,'job_started',p_request_id,
    jsonb_build_object('recipeKey',job.recipe_key,'quantity',job.quantity));
  event_key:='crafting_job_started';
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,event_key,job.id,
    jsonb_build_object('recipeKey',job.recipe_key,'workstationInstanceId',station.id));
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'inventory_changed',job.id,
    jsonb_build_object('reason',history_reason));
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'workstation_queue_changed',station.id,
    jsonb_build_object('jobId',job.id));
  response:=jsonb_build_object(
    'status','updated','job',private.cozy_crafting_job_json(job),
    'workspace',private.cozy_workstation_workspace_json(profile.id,station),
    'replayed',false,'announcement',version.public_name||' started.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'workstation_job_start',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.collect_player_workstation_job(
  p_wallet_address text,p_workstation_instance_id uuid,p_crafting_job_id uuid,
  p_expected_job_state_version integer,p_expected_inventory_state_version integer,
  p_expected_workstation_state_version integer,p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; config public.cozy_gameplay_config%rowtype;
  home public.player_homes%rowtype; station public.player_home_workstations%rowtype;
  definition public.cozy_workstation_definitions%rowtype; settings public.cozy_crafting_settings%rowtype;
  job public.player_crafting_jobs%rowtype; inventory_state public.player_inventory_state%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; request_hash text; response jsonb;
  history_reason text; tutorial_version public.cozy_quest_versions%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_workstation_instance_id is null or p_crafting_job_id is null
     or p_expected_job_state_version<1 or p_expected_inventory_state_version<1
     or p_expected_workstation_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_WORKSTATION_JOB_COLLECTION_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'workstation_collect',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_workstation_instance_id::text||':'||p_crafting_job_id::text||':'||
    p_expected_job_state_version::text||':'||p_expected_inventory_state_version::text||':'||
    p_expected_workstation_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':workstation_job_collect:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='workstation_job_collect'
    and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into home from public.player_homes where player_profile_id=profile.id for update;
  if not found or home.lifecycle_status<>'active' or not home.inside_home
    then return jsonb_build_object('status','workstation_world_mismatch'); end if;
  select * into station from public.player_home_workstations
  where id=p_workstation_instance_id and player_profile_id=profile.id and player_home_id=home.id
  for update;
  if not found then return jsonb_build_object('status','workstation_not_found'); end if;
  select * into strict definition from public.cozy_workstation_definitions
  where id=station.workstation_definition_id;
  select * into strict settings from public.cozy_crafting_settings where singleton_key;
  if station.state_version<>p_expected_workstation_state_version
    then return jsonb_build_object('status','crafting_job_conflict'); end if;
  if not private.cozy_workstation_in_range(home,station,definition.interaction_radius,
      settings.interaction_distance_tolerance)
    then return jsonb_build_object('status','workstation_too_far'); end if;
  if not settings.collection_enabled
    then return jsonb_build_object('status','collection_temporarily_disabled'); end if;
  select * into job from public.player_crafting_jobs
  where id=p_crafting_job_id and player_profile_id=profile.id
    and workstation_instance_id=station.id for update;
  if not found then return jsonb_build_object('status','crafting_job_not_found'); end if;
  if job.status='collected' then return jsonb_build_object('status','crafting_job_already_collected'); end if;
  if job.status='canceled' then return jsonb_build_object('status','crafting_job_canceled'); end if;
  if job.status='failed' then return jsonb_build_object('status','crafting_job_failed'); end if;
  if job.state_version<>p_expected_job_state_version
    then return jsonb_build_object('status','crafting_job_conflict'); end if;
  if job.completes_at>now() then return jsonb_build_object('status','crafting_job_not_ready'); end if;
  select * into strict inventory_state from public.player_inventory_state
  where player_profile_id=profile.id for update;
  if inventory_state.state_version<>p_expected_inventory_state_version
    then return jsonb_build_object('status','inventory_conflict'); end if;
  if not private.cozy_can_add_item(profile.id,job.output_item_definition_id,job.output_quantity) then
    update public.player_crafting_jobs set status='ready',state_version=state_version+1
    where id=job.id returning * into job;
    insert into public.cozy_crafting_job_events(
      player_profile_id,player_home_id,crafting_job_id,event_key,request_id,safe_payload
    ) values(profile.id,home.id,job.id,'collection_blocked',p_request_id,
      jsonb_build_object('errorCode','INVENTORY_FULL'));
    return jsonb_build_object('status','inventory_full','job',private.cozy_crafting_job_json(job));
  end if;
  if not private.cozy_claim_crafting_cooldown(profile.id,'collect',settings.collect_cooldown_ms)
    then return jsonb_build_object('status','rate_limited'); end if;
  update public.player_crafting_jobs set status='collecting',state_version=state_version+1
  where id=job.id returning * into job;
  history_reason:=case when job.recipe_category='cooking'
    then 'cooking_output_collected' else 'crafting_output_collected' end;
  if not private.cozy_add_item(
    profile.id,job.output_item_definition_id,job.output_quantity,history_reason,
    job.id::text,p_idempotency_key,p_request_id
  ) then raise exception using errcode='40001',message='CRAFTING_OUTPUT_SETTLEMENT_FAILED'; end if;
  update public.player_crafting_jobs set
    status='collected',collected_at=now(),
    output_settlement_reference='inventory-history:'||job.id::text,
    state_version=state_version+1,safe_failure_code=null
  where id=job.id returning * into job;
  select version_row.* into strict tutorial_version
  from public.cozy_active_workstation_tutorial_versions active
  join public.cozy_quest_versions version_row on version_row.id=active.quest_version_id;
  if job.recipe_definition_id=tutorial_version.tutorial_cooking_recipe_definition_id then
    perform private.cozy_advance_workstation_tutorial(
      profile.id,'cooked_output_collected',job.id,
      'phase11b-cooked:'||job.id::text,p_request_id
    );
    insert into public.player_recipe_unlocks(
      player_profile_id,recipe_definition_id,unlock_source,source_reference_id
    ) values(profile.id,tutorial_version.tutorial_crafting_recipe_definition_id,
      'phase11b_tutorial',job.id)
    on conflict do nothing;
    perform private.cozy_advance_workstation_tutorial(
      profile.id,'crafting_recipe_unlocked',job.id,
      'phase11b-crafting-unlock:'||job.id::text,p_request_id
    );
  elsif job.recipe_definition_id=tutorial_version.tutorial_crafting_recipe_definition_id then
    perform private.cozy_advance_workstation_tutorial(
      profile.id,'crafted_output_collected',job.id,
      'phase11b-crafted:'||job.id::text,p_request_id
    );
  end if;
  insert into public.cozy_crafting_job_events(
    player_profile_id,player_home_id,crafting_job_id,event_key,request_id,safe_payload
  ) values(profile.id,home.id,job.id,'job_collected',p_request_id,
    jsonb_build_object('outputItemSlug',job.output_item_slug,'outputQuantity',job.output_quantity));
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'crafting_job_collected',job.id,
    jsonb_build_object('outputItemSlug',job.output_item_slug));
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'inventory_changed',job.id,
    jsonb_build_object('reason',history_reason));
  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'workstation_queue_changed',station.id,
    jsonb_build_object('jobId',job.id));
  response:=jsonb_build_object(
    'status','updated','job',private.cozy_crafting_job_json(job),
    'workspace',private.cozy_workstation_workspace_json(profile.id,station),
    'replayed',false,
    'announcement',job.output_item_name||' was added to your inventory.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'workstation_job_collect',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.accept_player_workstation_tutorial(
  p_wallet_address text,p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; config public.cozy_gameplay_config%rowtype;
  settings public.cozy_crafting_settings%rowtype; version public.cozy_quest_versions%rowtype;
  instance public.player_quest_instances%rowtype; npc public.cozy_starter_npcs%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; request_hash text; response jsonb;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_WORKSTATION_TUTORIAL_ACCEPT_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'workstation_tutorial_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to('workstation_tutorial_accept','UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':workstation_tutorial_accept:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='workstation_tutorial_accept'
    and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into strict settings from public.cozy_crafting_settings where singleton_key;
  if not settings.tutorial_unlocks_enabled then return jsonb_build_object('status','quest_not_available'); end if;
  select version_row.* into strict version
  from public.cozy_active_workstation_tutorial_versions active
  join public.cozy_quest_versions version_row on version_row.id=active.quest_version_id;
  if not exists(select 1 from public.player_quest_instances farming_instance
    where farming_instance.player_profile_id=profile.id
      and farming_instance.quest_definition_id=version.required_quest_definition_id
      and farming_instance.status='reward_claimed')
    then return jsonb_build_object('status','quest_not_available'); end if;
  if exists(select 1 from public.player_quest_instances existing
    where existing.player_profile_id=profile.id
      and existing.quest_definition_id=version.quest_definition_id)
    then return jsonb_build_object('status','quest_already_accepted'); end if;
  select * into strict npc from public.cozy_starter_npcs where slug='willow-guide' and active;
  if profile.current_map_id<>(select slug from public.world_maps where id=npc.world_map_id)
     or exists(select 1 from public.player_homes home
       where home.player_profile_id=profile.id and home.inside_home)
     or sqrt(power(profile.safe_position_x-npc.position_x,2)
       +power(profile.safe_position_y-npc.position_y,2))>npc.interaction_range then
    return jsonb_build_object('status','quest_not_available'); end if;
  insert into public.player_quest_instances(
    player_profile_id,quest_definition_id,quest_version_id
  ) values(profile.id,version.quest_definition_id,version.id) returning * into instance;
  insert into public.player_quest_objective_progress(
    player_quest_instance_id,quest_objective_id
  ) select instance.id,objective.id from public.cozy_quest_objectives objective
    where objective.quest_version_id=version.id;
  insert into public.player_recipe_unlocks(
    player_profile_id,recipe_definition_id,unlock_source,source_reference_id
  ) values(profile.id,version.tutorial_cooking_recipe_definition_id,
    'phase11b_tutorial',instance.id)
  on conflict do nothing;
  perform private.cozy_advance_workstation_tutorial(
    profile.id,'workstation_tutorial_accepted',instance.id,
    'phase11b-accepted:'||instance.id::text,p_request_id
  );
  perform private.cozy_advance_workstation_tutorial(
    profile.id,'cooking_recipe_unlocked',version.tutorial_cooking_recipe_definition_id,
    'phase11b-cooking-unlock:'||instance.id::text,p_request_id
  );
  response:=jsonb_build_object(
    'status','updated','view',private.cozy_workstation_tutorial_json(profile.id),
    'replayed',false,'announcement','Garden Soup unlocked. Visit your Cooking Hearth.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'workstation_tutorial_accept',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.turn_in_player_workstation_tutorial(
  p_wallet_address text,p_expected_quest_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; config public.cozy_gameplay_config%rowtype;
  settings public.cozy_crafting_settings%rowtype; version public.cozy_quest_versions%rowtype;
  instance public.player_quest_instances%rowtype; npc public.cozy_starter_npcs%rowtype;
  ledger public.player_dust_ledger%rowtype; receipt public.cozy_gameplay_idempotency%rowtype;
  request_hash text; response jsonb; incomplete_count integer;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_expected_quest_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_WORKSTATION_TUTORIAL_TURN_IN_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'workstation_tutorial_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_expected_quest_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':workstation_tutorial_turn_in:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='workstation_tutorial_turn_in'
    and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into strict settings from public.cozy_crafting_settings where singleton_key;
  if not settings.tutorial_rewards_enabled then return jsonb_build_object('status','quest_not_available'); end if;
  select version_row.* into strict version
  from public.cozy_active_workstation_tutorial_versions active
  join public.cozy_quest_versions version_row on version_row.id=active.quest_version_id;
  select * into instance from public.player_quest_instances
  where player_profile_id=profile.id and quest_definition_id=version.quest_definition_id for update;
  if not found then return jsonb_build_object('status','quest_not_available'); end if;
  if instance.status='reward_claimed' then return jsonb_build_object('status','quest_reward_already_settled'); end if;
  if instance.state_version<>p_expected_quest_state_version
    then return jsonb_build_object('status','crafting_job_conflict'); end if;
  select count(*) into incomplete_count
  from public.cozy_quest_objectives objective
  join public.player_quest_objective_progress progress
    on progress.quest_objective_id=objective.id
   and progress.player_quest_instance_id=instance.id
  where objective.objective_key not in ('return_to_guide','receive_reward')
    and progress.current_count<objective.required_count;
  if incomplete_count>0 then return jsonb_build_object('status','quest_objective_incomplete'); end if;
  select * into strict npc from public.cozy_starter_npcs where slug='willow-guide' and active;
  if profile.current_map_id<>(select slug from public.world_maps where id=npc.world_map_id)
     or exists(select 1 from public.player_homes home
       where home.player_profile_id=profile.id and home.inside_home)
     or sqrt(power(profile.safe_position_x-npc.position_x,2)
       +power(profile.safe_position_y-npc.position_y,2))>npc.interaction_range then
    return jsonb_build_object('status','quest_objective_incomplete'); end if;
  if not private.cozy_claim_crafting_cooldown(
      profile.id,'tutorial_turn_in',settings.turn_in_cooldown_ms)
    then return jsonb_build_object('status','rate_limited'); end if;
  perform private.cozy_advance_workstation_tutorial(
    profile.id,'workstation_tutorial_returned',instance.id,
    'phase11b-returned:'||instance.id::text,p_request_id
  );
  if not private.cozy_apply_dust_delta(
    profile.id,version.reward_dust,'starter_workstation_quest_reward',
    'starter_workstation_quest',instance.id::text,p_idempotency_key,p_request_id
  ) then raise exception using errcode='P0001',message='WORKSTATION_TUTORIAL_DUST_SETTLEMENT_FAILED'; end if;
  select * into strict ledger from public.player_dust_ledger
  where player_profile_id=profile.id and reason='starter_workstation_quest_reward'
    and reference_id=instance.id::text;
  perform private.cozy_advance_workstation_tutorial(
    profile.id,'workstation_tutorial_reward_settled',ledger.id,
    'phase11b-reward:'||instance.id::text,p_request_id
  );
  update public.player_quest_instances set
    status='reward_claimed',completed_at=now(),reward_settled_at=now(),
    reward_ledger_entry_id=ledger.id,state_version=state_version+1,last_error_code=null
  where id=instance.id;
  response:=jsonb_build_object(
    'status','updated','view',private.cozy_workstation_tutorial_json(profile.id),
    'replayed',false,
    'announcement',version.reward_dust::text||' DUST received. Hearth and Hands complete.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'workstation_tutorial_turn_in',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.perform_player_recipe_action(
  p_wallet_address text,p_kind text,p_recipe_slug text,p_station_interaction_id text,
  p_quantity integer,p_expected_inventory_state_version integer,
  p_expected_dust_state_version integer,p_idempotency_key text,p_request_id text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select jsonb_build_object('status','recipe_job_required');
$$;

revoke all on function private.ensure_player_home_workstations(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.cozy_recipe_is_unlocked(uuid,public.cozy_recipe_versions) from public,anon,authenticated,service_role;
revoke all on function private.cozy_workstation_live_ops_json() from public,anon,authenticated,service_role;
revoke all on function private.cozy_workstation_definition_json(public.cozy_workstation_definitions) from public,anon,authenticated,service_role;
revoke all on function private.cozy_crafting_job_json(public.player_crafting_jobs) from public,anon,authenticated,service_role;
revoke all on function private.cozy_workstation_instance_json(public.player_home_workstations) from public,anon,authenticated,service_role;
revoke all on function private.cozy_recipe_version_json(uuid,public.cozy_recipe_versions) from public,anon,authenticated,service_role;
revoke all on function private.cozy_workstation_tutorial_json(uuid) from public,anon,authenticated,service_role;
revoke all on function private.cozy_workstation_workspace_json(uuid,public.player_home_workstations) from public,anon,authenticated,service_role;
revoke all on function private.cozy_advance_workstation_tutorial(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function private.cozy_claim_crafting_cooldown(uuid,text,integer) from public,anon,authenticated,service_role;
revoke all on function private.cozy_workstation_in_range(public.player_homes,public.player_home_workstations,numeric,numeric) from public,anon,authenticated,service_role;
revoke all on function private.provision_home_template_workstations() from public,anon,authenticated,service_role;

revoke all on function public.get_player_workstation_workspace(text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.start_player_workstation_job(text,uuid,uuid,integer,integer,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.collect_player_workstation_job(text,uuid,uuid,integer,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.accept_player_workstation_tutorial(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.turn_in_player_workstation_tutorial(text,integer,text,text) from public,anon,authenticated,service_role;

grant execute on function public.get_player_workstation_workspace(text,uuid,text) to service_role;
grant execute on function public.start_player_workstation_job(text,uuid,uuid,integer,integer,integer,integer,text,text) to service_role;
grant execute on function public.collect_player_workstation_job(text,uuid,uuid,integer,integer,integer,text,text) to service_role;
grant execute on function public.accept_player_workstation_tutorial(text,text,text) to service_role;
grant execute on function public.turn_in_player_workstation_tutorial(text,integer,text,text) to service_role;
