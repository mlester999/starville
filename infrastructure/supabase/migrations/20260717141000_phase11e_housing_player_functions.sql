-- Starville Phase 11E: owner-authorized housing reads and atomic mutations.
-- All public functions are service-role-only; browser roles retain no direct
-- table access. Game Test uses separate in-memory fixtures and never calls
-- these persistence functions.

-- Keep the procedural allowlist aligned with the scope constraint extended by
-- the Phase 11E schema migration. The helper rejects unknown scopes before it
-- touches the table, so changing only the table constraint is insufficient.
create or replace function private.claim_cozy_gameplay_rate_limit(
  p_player_profile_id uuid,p_scope text,p_limit integer
)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare claimed boolean;
begin
  if p_player_profile_id is null
     or p_scope not in (
       'bootstrap','dust_read','inventory_read','history_read','quickbar_write',
       'farm_read','farm_write','recipe_read','recipe_write','shop_read','shop_write',
       'home_read','home_write','vertical_slice_read','plot_provision','home_farm_write',
       'starter_quest_write','workstation_read','workstation_write','workstation_collect',
       'workstation_tutorial_write','shop_workspace_read','shop_transaction_write',
       'shop_receipt_read','shop_tutorial_write','shop_event_read',
       'progression_read','progression_write','quest_read','achievement_read',
       'title_write','progression_event_read','housing_read','decoration_session_write',
       'layout_validate','layout_save','layout_history_read','storage_read','storage_write',
       'home_upgrade_read','home_upgrade_write','housing_event_read'
     ) or p_limit not between 1 and 600 then
    raise exception using errcode='22023',message='INVALID_COZY_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-rate:'||p_player_profile_id::text||':'||p_scope,0));
  insert into public.cozy_gameplay_rate_limits(
    player_profile_id,scope,attempt_count,window_started_at,window_expires_at,updated_at
  ) values(p_player_profile_id,p_scope,1,now(),now()+interval '1 minute',now())
  on conflict(player_profile_id,scope) do update set
    attempt_count=case when public.cozy_gameplay_rate_limits.window_expires_at<=now()
      then 1 else public.cozy_gameplay_rate_limits.attempt_count+1 end,
    window_started_at=case when public.cozy_gameplay_rate_limits.window_expires_at<=now()
      then now() else public.cozy_gameplay_rate_limits.window_started_at end,
    window_expires_at=case when public.cozy_gameplay_rate_limits.window_expires_at<=now()
      then now()+interval '1 minute' else public.cozy_gameplay_rate_limits.window_expires_at end,
    updated_at=now()
  where public.cozy_gameplay_rate_limits.window_expires_at<=now()
     or public.cozy_gameplay_rate_limits.attempt_count<p_limit
  returning true into claimed;
  return coalesce(claimed,false);
end;
$$;

create or replace function private.ensure_player_housing(
  p_player_profile_id uuid,
  p_request_id text
)
returns void
language plpgsql
volatile
security definer
set search_path=''
as $$
declare home public.player_homes%rowtype; template public.cozy_home_templates%rowtype;
  storage public.home_storage_containers%rowtype; revision_id uuid; placement_count integer;
  capacity_used integer; snapshot jsonb; snapshot_hash text;
begin
  if p_player_profile_id is null or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOUSING_BOOTSTRAP_REQUEST';
  end if;
  perform private.ensure_player_home(p_player_profile_id);
  select * into strict home from public.player_homes
  where player_profile_id=p_player_profile_id for update;
  select * into strict template from public.cozy_home_templates where id=home.template_id;

  insert into public.home_storage_containers(
    player_home_id,owner_player_profile_id,capacity,configuration_revision,safe_metadata
  ) values(home.id,home.player_profile_id,home.storage_capacity,home.configuration_revision,
    '{"phase11eStarter":true}'::jsonb)
  on conflict(player_home_id) do nothing;
  select * into strict storage from public.home_storage_containers
  where player_home_id=home.id for update;

  if not exists(select 1 from public.home_layout_heads head where head.player_home_id=home.id) then
    select count(*),coalesce(sum(definition.capacity_weight),0)::integer,
      coalesce(jsonb_agg(jsonb_build_object(
        'instanceId',placement.id,'furnitureDefinitionId',placement.furniture_definition_id,
        'itemDefinitionId',placement.item_definition_id,'zoneId',placement.zone_id,
        'x',placement.grid_x,'y',placement.grid_y,'layer',placement.logical_layer,
        'rotation',placement.rotation,'scale',placement.effective_scale
      ) order by placement.id),'[]'::jsonb)
    into placement_count,capacity_used,snapshot
    from public.player_home_furniture placement
    join public.cozy_furniture_definitions definition on definition.id=placement.furniture_definition_id
    where placement.player_home_id=home.id and placement.removed_at is null;
    snapshot_hash:=encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex');
    insert into public.home_layout_revisions(
      player_home_id,owner_player_profile_id,revision_number,parent_revision_id,
      restoration_source_revision_id,home_template_id,template_version,home_tier,
      furniture_count,furniture_capacity_used,snapshot_hash,change_summary,
      validation_result,validation_summary,created_by_type,request_id,safe_metadata
    ) values(
      home.id,home.player_profile_id,1,null,null,home.template_id,template.template_version,
      home.home_tier,placement_count,capacity_used,snapshot_hash,
      jsonb_build_array(case when placement_count=0 then 'Starter layout initialized'
        else 'Existing furniture preserved as a grandfathered starter layout' end),
      case when placement_count=0 then 'valid' else 'grandfathered' end,
      jsonb_build_object('valid',true,'bootstrap',true,'placementCount',placement_count),
      'system_bootstrap',p_request_id,'{"phase11eBootstrap":true}'::jsonb
    ) returning id into revision_id;
    insert into public.home_layout_placement_snapshots(
      layout_revision_id,furniture_instance_id,furniture_definition_id,item_definition_id,
      zone_id,logical_x,logical_y,logical_layer,rotation,effective_scale,placement_state,
      source_inventory_history_id,safe_metadata
    )
    select revision_id,placement.id,placement.furniture_definition_id,placement.item_definition_id,
      placement.zone_id,placement.grid_x,placement.grid_y,placement.logical_layer,placement.rotation,
      placement.effective_scale,placement.placement_state,placement.source_inventory_history_id,
      placement.safe_metadata
    from public.player_home_furniture placement
    where placement.player_home_id=home.id and placement.removed_at is null;
    insert into public.home_layout_heads(player_home_id,active_revision_id,revision_number)
    values(home.id,revision_id,1);
    insert into public.housing_audit_events(
      player_profile_id,player_home_id,actor_type,event_key,related_entity_id,result_category,
      safe_payload,request_id
    ) values(home.player_profile_id,home.id,'system','housing_initialized',revision_id,'success',
      jsonb_build_object('revisionNumber',1,'storageId',storage.id,'placementCount',placement_count),p_request_id);
  end if;
  update public.player_homes set housing_initialized_at=coalesce(housing_initialized_at,now())
  where id=home.id and housing_initialized_at is null;
end;
$$;

create or replace function private.housing_zone_json(zone public.housing_decoration_zones)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',zone.id,'key',zone.zone_key,'type',zone.zone_type,'label',zone.label,
    'bounds',jsonb_build_object('minX',zone.min_x,'minY',zone.min_y,'maxX',zone.max_x,'maxY',zone.max_y),
    'allowedCategories',to_jsonb(zone.allowed_categories),'capacity',zone.placement_capacity,
    'requiredTier',zone.required_home_tier,'collisionPolicy',zone.collision_policy,
    'snapPolicy',zone.snap_policy,'rotations',to_jsonb(zone.rotation_policy),
    'enabled',zone.enabled,'indoorFoundationOnly',zone.indoor_foundation_only,
    'configurationRevision',zone.configuration_revision
  );
$$;

create or replace function private.housing_furniture_definition_json(
  furniture public.cozy_furniture_definitions
)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',furniture.id,'key',furniture.slug,'itemDefinitionId',item.id,'itemSlug',item.slug,
    'displayName',furniture.name,'description',furniture.description,'category',furniture.category,
    'worldAssetRef',furniture.asset_ref,'assetReadiness',furniture.asset_readiness,
    'footprint',jsonb_build_object('width',furniture.footprint_width,'height',furniture.footprint_height),
    'footAnchor',jsonb_build_object('x',furniture.foot_anchor_x,'y',furniture.foot_anchor_y),
    'depthAnchor',jsonb_build_object('x',furniture.depth_anchor_x,'y',furniture.depth_anchor_y),
    'rotations',to_jsonb(furniture.supported_rotations),'allowedZones',to_jsonb(furniture.allowed_zone_types),
    'blocksMovement',furniture.blocks_movement,'capacityWeight',furniture.capacity_weight,
    'indoorEligible',furniture.indoor_eligible,'outdoorEligible',furniture.outdoor_eligible,
    'wallMounted',furniture.wall_mounted,'interactionType',furniture.interaction_type,
    'storageSlots',furniture.storage_slots,'enabled',furniture.active,'released',furniture.released,
    'configurationRevision',furniture.content_version
  ) from public.cozy_item_definitions item where item.id=furniture.item_definition_id;
$$;

create or replace function private.housing_placement_json(
  placement public.player_home_furniture
)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'instanceId',placement.id,'furnitureDefinitionId',definition.id,'furnitureKey',definition.slug,
    'itemDefinitionId',placement.item_definition_id,'zoneId',zone.id,'zoneKey',zone.zone_key,
    'x',placement.grid_x,'y',placement.grid_y,'layer',placement.logical_layer,
    'rotation',placement.rotation,'effectiveScale',placement.effective_scale,
    'stateVersion',placement.state_version,'placementState',placement.placement_state,
    'createdAt',placement.placed_at,'updatedAt',placement.updated_at
  ) from public.cozy_furniture_definitions definition
  join public.housing_decoration_zones zone on zone.id=placement.zone_id
  where definition.id=placement.furniture_definition_id;
$$;

create or replace function private.housing_revision_summary_json(
  revision public.home_layout_revisions,
  p_current boolean
)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',revision.id,'revisionNumber',revision.revision_number,
    'parentRevisionId',revision.parent_revision_id,
    'restorationSourceRevisionId',revision.restoration_source_revision_id,
    'templateVersion',revision.template_version,'homeTier',revision.home_tier,
    'furnitureCount',revision.furniture_count,'changeSummary',revision.change_summary,
    'validationResult',revision.validation_result,'current',p_current,'createdAt',revision.created_at
  );
$$;

create or replace function private.housing_storage_json(
  storage public.home_storage_containers
)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',storage.id,'type',storage.storage_type,'lifecycle',storage.lifecycle_status,
    'capacity',storage.capacity,
    'usedSlots',(select count(*) from public.home_storage_stacks stack where stack.storage_container_id=storage.id),
    'stateVersion',storage.state_version,'configurationRevision',storage.configuration_revision,
    'stacks',coalesce((select jsonb_agg(jsonb_build_object(
      'id',stack.id,'itemDefinitionId',item.id,'itemSlug',item.slug,'itemName',item.name,
      'category',item.category,'quantity',stack.quantity,'maxStackSize',item.max_stack_size,
      'stateVersion',stack.state_version
    ) order by stack.slot_index)
      from public.home_storage_stacks stack
      join public.cozy_item_definitions item on item.id=stack.item_definition_id
      where stack.storage_container_id=storage.id),'[]'::jsonb)
  );
$$;

create or replace function private.housing_tutorial_json(p_player_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare definition public.cozy_quest_definitions%rowtype; version public.cozy_quest_versions%rowtype;
  instance public.player_quest_instances%rowtype;
begin
  select * into strict definition from public.cozy_quest_definitions where slug='home-sweet-home';
  select * into strict version from public.cozy_quest_versions
  where quest_definition_id=definition.id and lifecycle_status in ('active','published') and active
  order by version_number desc limit 1;
  select * into instance from public.player_quest_instances
  where player_profile_id=p_player_profile_id and quest_definition_id=definition.id;
  return jsonb_build_object(
    'questDefinitionId',definition.id,'questInstanceId',instance.id,
    'status',case when instance.id is null then 'available' else instance.status end,
    'objectives',coalesce((select jsonb_agg(jsonb_build_object(
      'key',objective.objective_key,'label',objective.label,
      'current',coalesce(progress.current_count,0),'required',objective.required_count,
      'complete',coalesce(progress.current_count,0)>=objective.required_count
    ) order by objective.sequence_number)
      from public.cozy_quest_objectives objective
      left join public.player_quest_objective_progress progress
        on progress.quest_objective_id=objective.id and progress.player_quest_instance_id=instance.id
      where objective.quest_version_id=version.id),'[]'::jsonb)
  );
end;
$$;

create or replace function private.housing_upgrade_json(
  p_player_profile_id uuid,
  home public.player_homes,
  version public.housing_upgrade_versions
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare definition public.housing_upgrade_definitions%rowtype; player_level integer;
  skill_key text; eligible boolean; owned boolean; reasons jsonb:='[]'::jsonb;
begin
  select * into strict definition from public.housing_upgrade_definitions
  where id=version.upgrade_definition_id;
  select current_level into player_level from public.player_level_progress
  where player_profile_id=p_player_profile_id;
  if version.required_skill_definition_id is not null then
    select skill.skill_key into skill_key from public.progression_skill_definitions skill
    where skill.id=version.required_skill_definition_id;
  end if;
  owned:=home.home_tier>=version.target_tier or exists(
    select 1 from public.player_home_upgrade_transactions transaction
    where transaction.player_home_id=home.id and transaction.upgrade_definition_id=definition.id
  );
  if home.home_tier<>version.current_tier and not owned then reasons:=reasons||'"wrong_current_tier"'::jsonb; end if;
  if coalesce(player_level,1)<version.required_player_level then reasons:=reasons||'"player_level"'::jsonb; end if;
  if version.required_skill_definition_id is not null and coalesce((
    select progress.current_level from public.player_skill_progress progress
    where progress.player_profile_id=p_player_profile_id
      and progress.skill_definition_id=version.required_skill_definition_id
  ),0)<version.required_skill_level then reasons:=reasons||'"skill_level"'::jsonb; end if;
  if version.required_quest_definition_id is not null and not exists(
    select 1 from public.player_quest_instances quest where quest.player_profile_id=p_player_profile_id
      and quest.quest_definition_id=version.required_quest_definition_id and quest.status='reward_claimed'
  ) then reasons:=reasons||'"quest"'::jsonb; end if;
  if version.required_achievement_definition_id is not null and not exists(
    select 1 from public.player_achievement_progress achievement
    where achievement.player_profile_id=p_player_profile_id
      and achievement.achievement_definition_id=version.required_achievement_definition_id
      and achievement.status in ('completed','rewarded')
  ) then reasons:=reasons||'"achievement"'::jsonb; end if;
  eligible:=not owned and definition.enabled and version.lifecycle_status='active'
    and jsonb_array_length(reasons)=0;
  return jsonb_build_object(
    'definitionId',definition.id,'versionId',version.id,'key',definition.upgrade_key,
    'displayName',definition.display_name,'description',definition.description,
    'currentTier',version.current_tier,'targetTier',version.target_tier,'dustCost',version.dust_cost,
    'requiredPlayerLevel',version.required_player_level,'requiredSkillKey',skill_key,
    'requiredSkillLevel',version.required_skill_level,
    'requiredQuestDefinitionId',version.required_quest_definition_id,
    'requiredAchievementDefinitionId',version.required_achievement_definition_id,
    'storageCapacity',version.storage_capacity,'furnitureCapacity',version.furniture_capacity,
    'unlockedZoneKeys',to_jsonb(version.unlocked_zone_keys),'roomUnlock',version.room_unlock,
    'eligible',eligible,'owned',owned,'unavailableReasons',reasons,
    'configurationRevision',version.configuration_revision
  );
end;
$$;

create or replace function private.housing_workspace_json(p_player_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare home public.player_homes%rowtype; template public.cozy_home_templates%rowtype;
  head public.home_layout_heads%rowtype; revision public.home_layout_revisions%rowtype;
  storage public.home_storage_containers%rowtype; live_ops public.housing_live_ops%rowtype;
  dust public.player_dust_accounts%rowtype; inventory public.player_inventory_state%rowtype;
begin
  select * into strict home from public.player_homes where player_profile_id=p_player_profile_id;
  select * into strict template from public.cozy_home_templates where id=home.template_id;
  select * into strict head from public.home_layout_heads where player_home_id=home.id;
  select * into strict revision from public.home_layout_revisions where id=head.active_revision_id;
  select * into strict storage from public.home_storage_containers where player_home_id=home.id;
  select * into strict live_ops from public.housing_live_ops where singleton_key;
  select * into strict dust from public.player_dust_accounts where player_profile_id=p_player_profile_id;
  select * into strict inventory from public.player_inventory_state where player_profile_id=p_player_profile_id;
  return jsonb_build_object(
    'home',jsonb_build_object(
      'id',home.id,'ownerPlayerId',home.player_profile_id,'templateId',template.id,
      'templateSlug',template.slug,'templateVersion',template.template_version,
      'lifecycle',home.lifecycle_status,
      'location',case when home.inside_home then 'personal_home' else 'public_world' end,
      'homeTier',home.home_tier,'furnitureCapacity',home.furniture_capacity,
      'storageCapacity',home.storage_capacity,'indoorFoundationEnabled',home.indoor_foundation_enabled,
      'configurationRevision',home.configuration_revision,'stateVersion',home.state_version
    ),
    'layout',jsonb_build_object(
      'headStateVersion',head.state_version,
      'activeRevision',private.housing_revision_summary_json(revision,true),
      'placements',coalesce((select jsonb_agg(private.housing_placement_json(placement)
        order by placement.grid_y,placement.grid_x,placement.id)
        from public.player_home_furniture placement
        where placement.player_home_id=home.id and placement.removed_at is null),'[]'::jsonb),
      'history',coalesce((select jsonb_agg(private.housing_revision_summary_json(history,history.id=head.active_revision_id)
        order by history.revision_number desc)
        from (select history_row.* from public.home_layout_revisions history_row
          where history_row.player_home_id=home.id order by history_row.revision_number desc limit 20) history),'[]'::jsonb)
    ),
    'zones',coalesce((select jsonb_agg(private.housing_zone_json(zone) order by zone.zone_key)
      from public.housing_decoration_zones zone
      where zone.home_template_id=template.id and zone.template_version=template.template_version),'[]'::jsonb),
    'ownedPlaceables',coalesce((select jsonb_agg(jsonb_build_object(
      'inventoryStackId',stack.id,'furniture',private.housing_furniture_definition_json(furniture),
      'ownedQuantity',stack.quantity+(select count(*) from public.player_home_furniture placed
        where placed.player_home_id=home.id and placed.furniture_definition_id=furniture.id and placed.removed_at is null),
      'placedQuantity',(select count(*) from public.player_home_furniture placed
        where placed.player_home_id=home.id and placed.furniture_definition_id=furniture.id and placed.removed_at is null),
      'availableQuantity',stack.quantity,'recentlyAcquired',stack.updated_at>=now()-interval '7 days',
      'unavailableReason',case when not furniture.active then 'Furniture is disabled for new placement.'
        when not furniture.released then 'Furniture is not released.' else null end
    ) order by furniture.name)
      from public.player_inventory_stacks stack
      join public.cozy_furniture_definitions furniture on furniture.item_definition_id=stack.item_definition_id
      where stack.player_profile_id=p_player_profile_id),'[]'::jsonb),
    'storage',private.housing_storage_json(storage),
    'upgrades',coalesce((select jsonb_agg(private.housing_upgrade_json(p_player_profile_id,home,version)
      order by version.target_tier)
      from public.housing_active_upgrade_versions active
      join public.housing_upgrade_versions version on version.id=active.upgrade_version_id),'[]'::jsonb),
    'tutorial',private.housing_tutorial_json(p_player_profile_id),
    'liveOps',jsonb_build_object(
      'decorationStartsEnabled',live_ops.decoration_starts_enabled,
      'layoutSavesEnabled',live_ops.layout_saves_enabled,
      'storageDepositsEnabled',live_ops.storage_deposits_enabled,
      'storageWithdrawalsEnabled',live_ops.storage_withdrawals_enabled,
      'upgradesEnabled',live_ops.upgrades_enabled,
      'tutorialGrantsEnabled',live_ops.tutorial_grants_enabled,
      'tutorialRewardsEnabled',live_ops.tutorial_rewards_enabled,
      'maintenanceMessage',live_ops.maintenance_message,
      'configurationRevision',live_ops.configuration_revision
    ),
    'dust',jsonb_build_object('balance',dust.balance,'stateVersion',dust.state_version),
    'inventoryStateVersion',inventory.state_version,'gameTest',false,'serverTime',now()
  );
end;
$$;

create or replace function private.housing_progress_event(
  p_player_profile_id uuid,
  p_event_key text,
  p_source_entity_id uuid,
  p_target_key text,
  p_request_id text
)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare objective record; updated_count integer:=0; progress public.player_quest_objective_progress%rowtype;
begin
  for objective in
    select instance.id as instance_id,definition.slug,objective_row.id as objective_id,
      objective_row.objective_key,objective_row.required_count
    from public.player_quest_instances instance
    join public.cozy_quest_definitions definition on definition.id=instance.quest_definition_id
    join public.cozy_quest_objectives objective_row on objective_row.quest_version_id=instance.quest_version_id
    where instance.player_profile_id=p_player_profile_id and instance.status='active'
      and definition.slug='home-sweet-home'
      and (
        (p_event_key='personal_home_entered' and objective_row.objective_key='enter_personal_home') or
        (p_event_key='decoration_mode_opened' and objective_row.objective_key='open_decoration_mode') or
        (p_event_key='home_furniture_placed' and objective_row.objective_key='place_home_furniture') or
        (p_event_key='home_layout_saved' and objective_row.objective_key='save_home_layout') or
        (p_event_key='home_storage_opened' and objective_row.objective_key='open_home_storage') or
        (p_event_key='home_storage_deposit' and objective_row.objective_key='deposit_home_storage') or
        (p_event_key='home_storage_withdrawal' and objective_row.objective_key='withdraw_home_storage') or
        (p_event_key='home_layout_revision_inspected' and objective_row.objective_key='inspect_home_layout_revision') or
        (p_event_key='home_interaction_completed' and objective_row.objective_key='complete_home_interaction')
      )
      and (objective_row.target_reference_key is null or objective_row.target_reference_key=p_target_key)
  loop
    update public.player_quest_objective_progress set
      current_count=least(objective.required_count,current_count+1),
      completed_at=case when current_count+1>=objective.required_count then coalesce(completed_at,now()) else completed_at end,
      state_version=state_version+1
    where player_quest_instance_id=objective.instance_id and quest_objective_id=objective.objective_id
      and current_count<objective.required_count returning * into progress;
    if found then
      updated_count:=updated_count+1;
      update public.player_quest_instances set state_version=state_version+1 where id=objective.instance_id;
      insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
      values(p_player_profile_id,'quest_progressed',objective.instance_id,jsonb_build_object(
        'questSlug',objective.slug,'objectiveKey',objective.objective_key,
        'currentProgress',progress.current_count,'requiredCount',objective.required_count,
        'sourceEntityId',p_source_entity_id
      ));
    end if;
  end loop;
  return updated_count;
end;
$$;

create or replace function public.get_player_housing_workspace(
  p_wallet_address text,
  p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected record;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOUSING_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  profile:=selected.profile_row;moderation:=selected.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','home_suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'housing_read',120)
    then return jsonb_build_object('status','rate_limited'); end if;
  perform private.ensure_player_housing(profile.id,p_request_id);
  return jsonb_build_object('status','loaded','workspace',private.housing_workspace_json(profile.id));
end;
$$;

create or replace function public.open_player_decoration_session(
  p_wallet_address text,
  p_home_id uuid,
  p_expected_layout_revision integer,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected record; home public.player_homes%rowtype; head public.home_layout_heads%rowtype;
  live_ops public.housing_live_ops%rowtype; session public.housing_decoration_sessions%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; request_hash text; response jsonb;
begin
  if p_home_id is null or p_expected_layout_revision<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_DECORATION_SESSION_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  profile:=selected.profile_row;moderation:=selected.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','home_suspended'); end if;
  perform private.ensure_player_housing(profile.id,p_request_id);
  select * into home from public.player_homes where id=p_home_id and player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','home_permission_denied'); end if;
  if not home.inside_home then return jsonb_build_object('status','home_world_mismatch'); end if;
  select * into strict live_ops from public.housing_live_ops where singleton_key;
  if not live_ops.decoration_starts_enabled then return jsonb_build_object('status','decoration_disabled'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'decoration_session_write',20)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict head from public.home_layout_heads where player_home_id=home.id for update;
  if head.revision_number<>p_expected_layout_revision then return jsonb_build_object('status','layout_conflict'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws(':',p_home_id,p_expected_layout_revision),'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':decoration_session_open:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency where player_profile_id=profile.id
    and operation='decoration_session_open' and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'),'{replayed}','true');
  end if;
  update public.housing_decoration_sessions set status='expired',closed_at=now()
  where player_home_id=home.id and player_profile_id=profile.id and status='active';
  insert into public.housing_decoration_sessions(
    player_home_id,player_profile_id,base_layout_revision_id,base_revision_number,
    request_id,expires_at
  ) values(home.id,profile.id,head.active_revision_id,head.revision_number,p_request_id,now()+interval '30 minutes')
  returning * into session;
  perform private.housing_progress_event(profile.id,'decoration_mode_opened',session.id,'decoration-mode',p_request_id);
  response:=jsonb_build_object('status','opened','sessionId',session.id,'expiresAt',session.expires_at,
    'workspace',private.housing_workspace_json(profile.id),'replayed',false);
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'decoration_session_open',p_idempotency_key,request_hash,response,p_request_id);
  insert into public.housing_audit_events(
    player_profile_id,player_home_id,actor_type,event_key,related_entity_id,result_category,safe_payload,request_id
  ) values(profile.id,home.id,'player','decoration_session_opened',session.id,'success',
    jsonb_build_object('baseRevision',head.revision_number,'expiresAt',session.expires_at),p_request_id);
  return response;
end;
$$;

create or replace function private.housing_validate_layout_draft(
  p_home_id uuid,
  p_placements jsonb
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare home public.player_homes%rowtype; template public.cozy_home_templates%rowtype;
  entry jsonb; other_entry jsonb; definition public.cozy_furniture_definitions%rowtype;
  other_definition public.cozy_furniture_definitions%rowtype;
  zone public.housing_decoration_zones%rowtype; placement public.player_home_furniture%rowtype;
  stack public.player_inventory_stacks%rowtype; issues jsonb:='[]'::jsonb;
  placement_index integer:=0; other_index integer; width integer; height integer;
  other_width integer; other_height integer; x integer; y integer; other_x integer; other_y integer;
  rotation_value integer; capacity_used integer:=0; zone_count integer; duplicate_count integer;
  instance_text text; stack_text text; furniture_text text; zone_text text;
begin
  select * into strict home from public.player_homes where id=p_home_id;
  select * into strict template from public.cozy_home_templates where id=home.template_id;
  if p_placements is null or jsonb_typeof(p_placements)<>'array'
     or jsonb_array_length(p_placements)>200 or pg_column_size(p_placements)>262144 then
    return jsonb_build_object(
      'valid',false,'issues',jsonb_build_array(jsonb_build_object(
        'severity','error','code','out_of_bounds','placementIndex',null,
        'message','The layout draft is malformed or exceeds the bounded payload.'
      )),'furnitureCapacity',jsonb_build_object('used',0,'maximum',home.furniture_capacity),
      'configurationRevision',home.configuration_revision,'validatedAt',now()
    );
  end if;

  for entry in select value from jsonb_array_elements(p_placements) loop
    instance_text:=entry->>'instanceId'; stack_text:=entry->>'inventoryStackId';
    furniture_text:=entry->>'furnitureDefinitionId'; zone_text:=entry->>'zoneId';
    if furniture_text is null or furniture_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or zone_text is null or zone_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or (instance_text is null)=(stack_text is null) then
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'severity','error','code','furniture_not_owned','placementIndex',placement_index,
        'message','The draft placement identity is invalid.'
      ));
      placement_index:=placement_index+1; continue;
    end if;
    select * into definition from public.cozy_furniture_definitions
    where id=furniture_text::uuid;
    if not found then
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'severity','error','code','furniture_not_owned','placementIndex',placement_index,
        'message','The furniture definition does not exist.'
      ));
      placement_index:=placement_index+1; continue;
    end if;
    if not definition.active or not definition.released then
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'severity','error','code','furniture_disabled','placementIndex',placement_index,
        'message','This furniture is unavailable for a new saved placement.'
      ));
    end if;
    if definition.asset_readiness='missing' then
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'severity','error','code','asset_unresolved','placementIndex',placement_index,
        'message','The furniture has no safe managed artwork or development marker.'
      ));
    end if;
    select * into zone from public.housing_decoration_zones
    where id=zone_text::uuid and home_template_id=home.template_id
      and template_version=template.template_version;
    if not found or not zone.enabled or zone.indoor_foundation_only then
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'severity','error','code','zone_locked','placementIndex',placement_index,
        'message','The selected decoration zone is locked or renderer-incompatible.'
      ));
    else
      if zone.required_home_tier>home.home_tier then
        issues:=issues||jsonb_build_array(jsonb_build_object(
          'severity','error','code','zone_locked','placementIndex',placement_index,
          'message','The selected decoration zone requires a higher home tier.'
        ));
      end if;
      if not (definition.category=any(zone.allowed_categories))
         or not (zone.zone_type=any(definition.allowed_zone_types)) then
        issues:=issues||jsonb_build_array(jsonb_build_object(
          'severity','error','code','zone_incompatible','placementIndex',placement_index,
          'message','This furniture category is not compatible with the selected zone.'
        ));
      end if;
    end if;
    rotation_value:=(entry->>'rotation')::integer;
    if rotation_value not in (0,90,180,270)
       or not (rotation_value=any(definition.supported_rotations))
       or (zone.id is not null and not (rotation_value=any(zone.rotation_policy))) then
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'severity','error','code','rotation_unsupported','placementIndex',placement_index,
        'message','The selected rotation is not supported by the furniture and zone.'
      ));
    end if;
    x:=(entry->>'x')::integer; y:=(entry->>'y')::integer;
    width:=case when rotation_value in (90,270) then definition.footprint_height else definition.footprint_width end;
    height:=case when rotation_value in (90,270) then definition.footprint_width else definition.footprint_height end;
    if zone.id is null or x<zone.min_x or y<zone.min_y or x+width>zone.max_x or y+height>zone.max_y
       or x<template.min_x or y<template.min_y or x+width>template.max_x or y+height>template.max_y then
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'severity','error','code','out_of_bounds','placementIndex',placement_index,
        'message','The furniture footprint is outside the authoritative placement bounds.'
      ));
    end if;
    if (template.spawn_x>=x and template.spawn_x<x+width and template.spawn_y>=y and template.spawn_y<y+height)
       or (template.exit_x>=x and template.exit_x<x+width and template.exit_y>=y and template.exit_y<y+height)
       or (template.exit_x>=x and template.exit_x<x+width and template.exit_y-2>=y and template.exit_y-2<y+height) then
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'severity','error','code','entrance_blocked','placementIndex',placement_index,
        'message','The placement blocks the home spawn, entrance, or exit clearance.'
      ));
    end if;
    if exists(select 1 from public.player_home_farming_tiles tile
      where tile.player_home_id=home.id and tile.grid_x>=x and tile.grid_x<x+width
        and tile.grid_y>=y and tile.grid_y<y+height) then
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'severity','error','code','farm_tile_blocked','placementIndex',placement_index,
        'message','The placement overlaps an authoritative farming tile.'
      ));
    end if;
    if exists(select 1 from public.player_home_workstations workstation
      where workstation.player_home_id=home.id and workstation.enabled and (
        (floor(workstation.position_x)::integer>=x and floor(workstation.position_x)::integer<x+width
          and floor(workstation.position_y)::integer>=y and floor(workstation.position_y)::integer<y+height)
        or (floor(workstation.interaction_x)::integer>=x and floor(workstation.interaction_x)::integer<x+width
          and floor(workstation.interaction_y)::integer>=y and floor(workstation.interaction_y)::integer<y+height)
      )) then
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'severity','error','code','workstation_blocked','placementIndex',placement_index,
        'message','The placement blocks a workstation or its interaction point.'
      ));
    end if;
    if instance_text is not null then
      if instance_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        issues:=issues||jsonb_build_array(jsonb_build_object(
          'severity','error','code','furniture_not_owned','placementIndex',placement_index,
          'message','The saved furniture instance identity is invalid.'
        ));
      else
        select * into placement from public.player_home_furniture
        where id=instance_text::uuid and player_home_id=home.id
          and owner_player_profile_id=home.player_profile_id and removed_at is null;
        if not found or placement.furniture_definition_id<>definition.id then
          issues:=issues||jsonb_build_array(jsonb_build_object(
            'severity','error','code','furniture_not_owned','placementIndex',placement_index,
            'message','The saved furniture instance does not belong to this home.'
          ));
        end if;
      end if;
      select count(*) into duplicate_count from jsonb_array_elements(p_placements) candidate
      where candidate->>'instanceId'=instance_text;
      if duplicate_count<>1 then
        issues:=issues||jsonb_build_array(jsonb_build_object(
          'severity','error','code','collision','placementIndex',placement_index,
          'message','A saved furniture instance appears more than once in the draft.'
        ));
      end if;
    else
      if stack_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        issues:=issues||jsonb_build_array(jsonb_build_object(
          'severity','error','code','furniture_not_owned','placementIndex',placement_index,
          'message','The inventory source identity is invalid.'
        ));
      else
        select * into stack from public.player_inventory_stacks
        where id=stack_text::uuid and player_profile_id=home.player_profile_id
          and item_definition_id=definition.item_definition_id;
        select count(*) into duplicate_count from jsonb_array_elements(p_placements) candidate
        where candidate->>'inventoryStackId'=stack_text;
        if stack.id is null or stack.quantity<duplicate_count then
          issues:=issues||jsonb_build_array(jsonb_build_object(
            'severity','error','code','furniture_not_owned','placementIndex',placement_index,
            'message','The player does not own enough inventory-backed furniture for this draft.'
          ));
        end if;
      end if;
    end if;
    capacity_used:=capacity_used+definition.capacity_weight;
    if zone.id is not null then
      select count(*) into zone_count from jsonb_array_elements(p_placements) candidate
      where candidate->>'zoneId'=zone.id::text;
      if zone_count>zone.placement_capacity then
        issues:=issues||jsonb_build_array(jsonb_build_object(
          'severity','error','code','zone_capacity_reached','placementIndex',placement_index,
          'message','The selected decoration zone has reached its placement capacity.'
        ));
      end if;
    end if;

    other_index:=0;
    for other_entry in select value from jsonb_array_elements(p_placements) loop
      if other_index>placement_index then
        select * into other_definition from public.cozy_furniture_definitions
        where id=(other_entry->>'furnitureDefinitionId')::uuid;
        if other_definition.id is not null and definition.blocks_movement and other_definition.blocks_movement then
          other_x:=(other_entry->>'x')::integer; other_y:=(other_entry->>'y')::integer;
          other_width:=case when (other_entry->>'rotation')::integer in (90,270)
            then other_definition.footprint_height else other_definition.footprint_width end;
          other_height:=case when (other_entry->>'rotation')::integer in (90,270)
            then other_definition.footprint_width else other_definition.footprint_height end;
          if x<other_x+other_width and x+width>other_x and y<other_y+other_height and y+height>other_y then
            issues:=issues||jsonb_build_array(jsonb_build_object(
              'severity','error','code','collision','placementIndex',placement_index,
              'message','Two blocking furniture footprints overlap.'
            ));
          end if;
        end if;
      end if;
      other_index:=other_index+1;
    end loop;
    placement_index:=placement_index+1;
  end loop;
  if capacity_used>home.furniture_capacity then
    issues:=issues||jsonb_build_array(jsonb_build_object(
      'severity','error','code','capacity_reached','placementIndex',null,
      'message','The layout exceeds this home tier furniture capacity.'
    ));
  end if;
  return jsonb_build_object(
    'valid',not exists(select 1 from jsonb_array_elements(issues) issue where issue->>'severity'='error'),
    'issues',issues,'furnitureCapacity',jsonb_build_object('used',capacity_used,'maximum',home.furniture_capacity),
    'configurationRevision',home.configuration_revision,'validatedAt',now()
  );
exception when others then
  return jsonb_build_object(
    'valid',false,'issues',jsonb_build_array(jsonb_build_object(
      'severity','error','code','out_of_bounds','placementIndex',null,
      'message','The layout draft contains malformed bounded placement data.'
    )),'furnitureCapacity',jsonb_build_object('used',0,'maximum',coalesce(home.furniture_capacity,1)),
    'configurationRevision',coalesce(home.configuration_revision,1),'validatedAt',now()
  );
end;
$$;

create or replace function private.housing_storage_can_add(
  p_storage_id uuid,
  p_item_definition_id uuid,
  p_quantity integer
)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare storage public.home_storage_containers%rowtype; item public.cozy_item_definitions%rowtype;
  stack public.home_storage_stacks%rowtype; used_slots integer;
begin
  if p_storage_id is null or p_item_definition_id is null or p_quantity is null or p_quantity<1 then return false; end if;
  select * into storage from public.home_storage_containers where id=p_storage_id and lifecycle_status='active';
  if not found then return false; end if;
  select * into item from public.cozy_item_definitions where id=p_item_definition_id;
  if not found or item.category in ('permanent_tool','special') then return false; end if;
  select * into stack from public.home_storage_stacks
  where storage_container_id=storage.id and item_definition_id=item.id;
  if found then return stack.quantity+p_quantity<=item.max_stack_size; end if;
  select count(*) into used_slots from public.home_storage_stacks where storage_container_id=storage.id;
  return used_slots<storage.capacity and p_quantity<=item.max_stack_size;
end;
$$;

create or replace function private.housing_storage_add_item(
  p_storage_id uuid,
  p_item_definition_id uuid,
  p_quantity integer
)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare storage public.home_storage_containers%rowtype; item public.cozy_item_definitions%rowtype;
  stack public.home_storage_stacks%rowtype; free_slot integer;
begin
  if not private.housing_storage_can_add(p_storage_id,p_item_definition_id,p_quantity) then return false; end if;
  select * into strict storage from public.home_storage_containers where id=p_storage_id for update;
  select * into strict item from public.cozy_item_definitions where id=p_item_definition_id;
  select * into stack from public.home_storage_stacks
  where storage_container_id=storage.id and item_definition_id=item.id for update;
  if found then
    update public.home_storage_stacks set quantity=quantity+p_quantity,state_version=state_version+1
    where id=stack.id;
  else
    select candidate into strict free_slot from generate_series(1,storage.capacity) candidate
    where not exists(select 1 from public.home_storage_stacks occupied
      where occupied.storage_container_id=storage.id and occupied.slot_index=candidate)
    order by candidate limit 1;
    insert into public.home_storage_stacks(storage_container_id,item_definition_id,slot_index,quantity)
    values(storage.id,item.id,free_slot,p_quantity);
  end if;
  update public.home_storage_containers set state_version=state_version+1 where id=storage.id;
  return true;
end;
$$;

create or replace function private.housing_storage_remove_item(
  p_storage_id uuid,
  p_item_definition_id uuid,
  p_quantity integer
)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare storage public.home_storage_containers%rowtype; stack public.home_storage_stacks%rowtype;
begin
  if p_quantity is null or p_quantity<1 then return false; end if;
  select * into strict storage from public.home_storage_containers where id=p_storage_id for update;
  select * into stack from public.home_storage_stacks where storage_container_id=storage.id
    and item_definition_id=p_item_definition_id for update;
  if not found or stack.quantity<p_quantity then return false; end if;
  if stack.quantity=p_quantity then delete from public.home_storage_stacks where id=stack.id;
  else update public.home_storage_stacks set quantity=quantity-p_quantity,state_version=state_version+1 where id=stack.id;
  end if;
  update public.home_storage_containers set state_version=state_version+1 where id=storage.id;
  return true;
end;
$$;

create or replace function public.save_player_home_layout(
  p_wallet_address text,
  p_home_id uuid,
  p_expected_layout_revision integer,
  p_expected_layout_head_state_version integer,
  p_expected_home_state_version integer,
  p_expected_inventory_state_version integer,
  p_expected_storage_state_version integer,
  p_placements jsonb,
  p_restoration_source_revision_id uuid,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected record; home public.player_homes%rowtype; template public.cozy_home_templates%rowtype;
  head public.home_layout_heads%rowtype; inventory public.player_inventory_state%rowtype;
  storage public.home_storage_containers%rowtype; live_ops public.housing_live_ops%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; validation jsonb; entry jsonb;
  definition public.cozy_furniture_definitions%rowtype; placement public.player_home_furniture%rowtype;
  removed public.player_home_furniture%rowtype; new_revision public.home_layout_revisions%rowtype;
  request_hash text; settlement_key text; snapshot jsonb; snapshot_hash text; response jsonb;
  change_summary jsonb:='[]'::jsonb; add_count integer; remove_count integer; move_count integer;
  rotate_count integer; capacity_used integer; placement_count integer; resulting_quantity integer;
  used_slots integer; inventory_history_id uuid; failure_message text;
begin
  if p_home_id is null or p_expected_layout_revision<1 or p_expected_layout_head_state_version<1
     or p_expected_home_state_version<1 or p_expected_inventory_state_version<1
     or p_expected_storage_state_version<1 or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_LAYOUT_SAVE_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  profile:=selected.profile_row;moderation:=selected.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','home_suspended'); end if;
  perform private.ensure_player_housing(profile.id,p_request_id);
  select * into home from public.player_homes where id=p_home_id and player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','home_permission_denied'); end if;
  if home.lifecycle_status<>'active' then return jsonb_build_object('status','home_suspended'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws(':',p_home_id,p_expected_layout_revision,
    p_expected_layout_head_state_version,p_expected_home_state_version,p_expected_inventory_state_version,
    p_expected_storage_state_version,p_placements::text,p_restoration_source_revision_id),'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':home_layout_save:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency where player_profile_id=profile.id
    and operation='home_layout_save' and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  if not home.inside_home then return jsonb_build_object('status','home_world_mismatch'); end if;
  select * into strict live_ops from public.housing_live_ops where singleton_key;
  if not live_ops.layout_saves_enabled then return jsonb_build_object('status','layout_save_disabled'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'layout_save',10)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict head from public.home_layout_heads where player_home_id=home.id for update;
  select * into strict inventory from public.player_inventory_state where player_profile_id=profile.id for update;
  select * into strict storage from public.home_storage_containers where player_home_id=home.id for update;
  if head.revision_number<>p_expected_layout_revision
     or head.state_version<>p_expected_layout_head_state_version then
    return jsonb_build_object('status','layout_conflict');
  end if;
  if home.state_version<>p_expected_home_state_version then return jsonb_build_object('status','home_conflict'); end if;
  if inventory.state_version<>p_expected_inventory_state_version then return jsonb_build_object('status','inventory_conflict'); end if;
  if storage.state_version<>p_expected_storage_state_version then return jsonb_build_object('status','storage_conflict'); end if;
  if p_restoration_source_revision_id is not null and not exists(
    select 1 from public.home_layout_revisions history
    where history.id=p_restoration_source_revision_id and history.player_home_id=home.id
  ) then return jsonb_build_object('status','layout_not_found'); end if;
  if not exists(select 1 from public.housing_decoration_sessions session
    where session.player_home_id=home.id and session.player_profile_id=profile.id
      and session.status='active' and session.expires_at>now()
      and session.base_revision_number=p_expected_layout_revision) then
    return jsonb_build_object('status','layout_invalid');
  end if;

  validation:=private.housing_validate_layout_draft(home.id,p_placements);
  if not coalesce((validation->>'valid')::boolean,false) then
    return jsonb_build_object('status','layout_invalid','validation',validation);
  end if;

  select count(*) into add_count from jsonb_array_elements(p_placements) candidate
  where candidate->>'instanceId' is null;
  select count(*) into remove_count from public.player_home_furniture current_placement
  where current_placement.player_home_id=home.id and current_placement.removed_at is null
    and not exists(select 1 from jsonb_array_elements(p_placements) candidate
      where candidate->>'instanceId'=current_placement.id::text);
  select count(*) into move_count from jsonb_array_elements(p_placements) candidate
  join public.player_home_furniture current_placement
    on current_placement.id=(candidate->>'instanceId')::uuid
  where current_placement.player_home_id=home.id and (
    current_placement.grid_x<>(candidate->>'x')::integer
    or current_placement.grid_y<>(candidate->>'y')::integer
    or current_placement.zone_id<>(candidate->>'zoneId')::uuid
  );
  select count(*) into rotate_count from jsonb_array_elements(p_placements) candidate
  join public.player_home_furniture current_placement
    on current_placement.id=(candidate->>'instanceId')::uuid
  where current_placement.player_home_id=home.id
    and current_placement.rotation<>(candidate->>'rotation')::integer;
  if add_count>0 then change_summary:=change_summary||to_jsonb(format('%s furniture item%s placed',add_count,case when add_count=1 then '' else 's' end)); end if;
  if move_count>0 then change_summary:=change_summary||to_jsonb(format('%s furniture item%s moved',move_count,case when move_count=1 then '' else 's' end)); end if;
  if rotate_count>0 then change_summary:=change_summary||to_jsonb(format('%s furniture item%s rotated',rotate_count,case when rotate_count=1 then '' else 's' end)); end if;
  if remove_count>0 then change_summary:=change_summary||to_jsonb(format('%s furniture item%s removed',remove_count,case when remove_count=1 then '' else 's' end)); end if;
  if jsonb_array_length(change_summary)=0 then change_summary:=jsonb_build_array('Layout saved without placement changes'); end if;
  change_summary:=change_summary||to_jsonb(format('Home tier %s; storage capacity %s',home.home_tier,home.storage_capacity));

  begin
    for removed in select * from public.player_home_furniture current_placement
      where current_placement.player_home_id=home.id and current_placement.removed_at is null
        and not exists(select 1 from jsonb_array_elements(p_placements) candidate
          where candidate->>'instanceId'=current_placement.id::text)
      for update
    loop
      settlement_key:=encode(extensions.digest(convert_to('layout-return:'||p_idempotency_key||':'||removed.id::text,'UTF8'),'sha256'),'hex');
      if private.cozy_can_add_item(profile.id,removed.item_definition_id,1) then
        if not private.cozy_add_item(profile.id,removed.item_definition_id,1,'furniture_removal',
          home.id::text,settlement_key,p_request_id) then
          raise exception using errcode='P0001',message='FURNITURE_RETURN_BLOCKED';
        end if;
      elsif private.housing_storage_add_item(storage.id,removed.item_definition_id,1) then
        select quantity into resulting_quantity from public.home_storage_stacks
        where storage_container_id=storage.id and item_definition_id=removed.item_definition_id;
        select count(*) into used_slots from public.home_storage_stacks where storage_container_id=storage.id;
        insert into public.home_storage_transactions(
          player_profile_id,player_home_id,storage_container_id,operation,item_definition_id,
          quantity,resulting_storage_quantity,resulting_used_slots,idempotency_key,request_hash,request_id
        ) values(profile.id,home.id,storage.id,'furniture_return',removed.item_definition_id,1,
          resulting_quantity,used_slots,settlement_key,request_hash,p_request_id);
      else
        raise exception using errcode='P0001',message='FURNITURE_RETURN_BLOCKED';
      end if;
      update public.player_home_furniture set removed_at=now(),state_version=state_version+1,
        placement_state='placed' where id=removed.id;
    end loop;

    for entry in select value from jsonb_array_elements(p_placements) loop
      select * into strict definition from public.cozy_furniture_definitions
      where id=(entry->>'furnitureDefinitionId')::uuid;
      if entry->>'instanceId' is null then
        settlement_key:=encode(extensions.digest(convert_to('layout-place:'||p_idempotency_key||':'||
          coalesce(entry->>'inventoryStackId','')||':'||entry::text,'UTF8'),'sha256'),'hex');
        if not private.cozy_remove_item(profile.id,definition.item_definition_id,1,'furniture_placement',
          home.id::text,settlement_key,p_request_id) then
          raise exception using errcode='P0001',message='FURNITURE_NOT_OWNED';
        end if;
        select history.id into inventory_history_id from public.player_inventory_history history
        where history.player_profile_id=profile.id and history.idempotency_key=settlement_key
        order by history.created_at desc limit 1;
        insert into public.player_home_furniture(
          player_home_id,owner_player_profile_id,furniture_definition_id,item_definition_id,zone_id,
          grid_x,grid_y,logical_layer,rotation,effective_scale,placement_state,
          source_inventory_history_id,safe_metadata
        ) values(
          home.id,profile.id,definition.id,definition.item_definition_id,(entry->>'zoneId')::uuid,
          (entry->>'x')::integer,(entry->>'y')::integer,(entry->>'layer')::integer,
          (entry->>'rotation')::integer,1,'placed',inventory_history_id,
          jsonb_build_object('layoutSaveRequestId',p_request_id)
        );
      else
        update public.player_home_furniture set
          zone_id=(entry->>'zoneId')::uuid,grid_x=(entry->>'x')::integer,
          grid_y=(entry->>'y')::integer,logical_layer=(entry->>'layer')::integer,
          rotation=(entry->>'rotation')::integer,state_version=state_version+1,
          placement_state='placed',safe_metadata=safe_metadata||jsonb_build_object('lastLayoutSaveRequestId',p_request_id)
        where id=(entry->>'instanceId')::uuid and player_home_id=home.id and removed_at is null;
        if not found then raise exception using errcode='P0001',message='FURNITURE_NOT_OWNED'; end if;
      end if;
    end loop;

    select count(*),coalesce(sum(furniture_definition.capacity_weight),0)::integer,
      coalesce(jsonb_agg(jsonb_build_object(
        'instanceId',placement_row.id,'furnitureDefinitionId',placement_row.furniture_definition_id,
        'itemDefinitionId',placement_row.item_definition_id,'zoneId',placement_row.zone_id,
        'x',placement_row.grid_x,'y',placement_row.grid_y,'layer',placement_row.logical_layer,
        'rotation',placement_row.rotation,'scale',placement_row.effective_scale
      ) order by placement_row.id),'[]'::jsonb)
    into placement_count,capacity_used,snapshot
    from public.player_home_furniture placement_row
    join public.cozy_furniture_definitions furniture_definition
      on furniture_definition.id=placement_row.furniture_definition_id
    where placement_row.player_home_id=home.id and placement_row.removed_at is null;
    snapshot_hash:=encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex');
    insert into public.home_layout_revisions(
      player_home_id,owner_player_profile_id,revision_number,parent_revision_id,
      restoration_source_revision_id,home_template_id,template_version,home_tier,
      furniture_count,furniture_capacity_used,snapshot_hash,change_summary,validation_result,
      validation_summary,created_by_type,created_by_player_profile_id,request_id,safe_metadata
    ) values(
      home.id,profile.id,head.revision_number+1,head.active_revision_id,p_restoration_source_revision_id,
      home.template_id,(select template_version from public.cozy_home_templates where id=home.template_id),
      home.home_tier,placement_count,capacity_used,snapshot_hash,change_summary,'valid',validation,
      'player',profile.id,p_request_id,jsonb_build_object('idempotencyHash',request_hash)
    ) returning * into new_revision;
    insert into public.home_layout_placement_snapshots(
      layout_revision_id,furniture_instance_id,furniture_definition_id,item_definition_id,zone_id,
      logical_x,logical_y,logical_layer,rotation,effective_scale,placement_state,
      source_inventory_history_id,safe_metadata
    ) select new_revision.id,placement_row.id,placement_row.furniture_definition_id,
      placement_row.item_definition_id,placement_row.zone_id,placement_row.grid_x,placement_row.grid_y,
      placement_row.logical_layer,placement_row.rotation,placement_row.effective_scale,
      placement_row.placement_state,placement_row.source_inventory_history_id,placement_row.safe_metadata
    from public.player_home_furniture placement_row
    where placement_row.player_home_id=home.id and placement_row.removed_at is null;
    update public.home_layout_heads set active_revision_id=new_revision.id,
      revision_number=new_revision.revision_number,state_version=state_version+1
    where player_home_id=home.id returning * into head;
    update public.player_homes set state_version=state_version+1 where id=home.id returning * into home;
    update public.housing_decoration_sessions set status='saved',closed_at=now()
    where player_home_id=home.id and player_profile_id=profile.id and status='active';
  exception when sqlstate 'P0001' then
    get stacked diagnostics failure_message=message_text;
    if failure_message='FURNITURE_RETURN_BLOCKED' then
      return jsonb_build_object('status','furniture_return_blocked');
    elsif failure_message='FURNITURE_NOT_OWNED' then
      return jsonb_build_object('status','furniture_not_owned');
    end if;
    raise;
  end;

  insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'home_layout_saved',new_revision.id,jsonb_build_object(
    'revisionNumber',new_revision.revision_number,'placed',add_count,'moved',move_count,
    'rotated',rotate_count,'removed',remove_count
  ));
  if add_count>0 then insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'furniture_placed',new_revision.id,jsonb_build_object('count',add_count)); end if;
  if move_count>0 then insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'furniture_moved',new_revision.id,jsonb_build_object('count',move_count)); end if;
  if remove_count>0 then insert into public.cozy_private_plot_events(
    player_profile_id,player_home_id,event_key,target_id,payload
  ) values(profile.id,home.id,'furniture_removed',new_revision.id,jsonb_build_object('count',remove_count)); end if;
  perform private.housing_progress_event(profile.id,'home_layout_saved',new_revision.id,'home-layout',p_request_id);
  if add_count>0 and exists(select 1 from public.home_layout_placement_snapshots snapshot_row
    join public.cozy_furniture_definitions furniture on furniture.id=snapshot_row.furniture_definition_id
    where snapshot_row.layout_revision_id=new_revision.id and furniture.slug='willow-chair') then
    perform private.housing_progress_event(profile.id,'home_furniture_placed',new_revision.id,'willow-chair',p_request_id);
  end if;
  perform private.progression_evaluate_achievements(
    profile.id,'home_layout_saved',new_revision.id,null,null,1,0,p_request_id
  );
  insert into public.housing_audit_events(
    player_profile_id,player_home_id,actor_type,event_key,related_entity_id,result_category,safe_payload,request_id
  ) values(profile.id,home.id,'player','home_layout_saved',new_revision.id,'success',jsonb_build_object(
    'revisionNumber',new_revision.revision_number,'placed',add_count,'moved',move_count,
    'rotated',rotate_count,'removed',remove_count,'snapshotHash',snapshot_hash
  ),p_request_id);
  response:=jsonb_build_object('status','saved','workspace',private.housing_workspace_json(profile.id),
    'replayed',false,'announcement',format('Home layout revision %s saved.',new_revision.revision_number));
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'home_layout_save',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.validate_player_home_layout(
  p_wallet_address text,
  p_home_id uuid,
  p_expected_layout_revision integer,
  p_expected_layout_head_state_version integer,
  p_placements jsonb,
  p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; home public.player_homes%rowtype;
  head public.home_layout_heads%rowtype; validation jsonb;
begin
  if p_home_id is null or p_expected_layout_revision<1 or p_expected_layout_head_state_version<1
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_LAYOUT_VALIDATION_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  select * into home from public.player_homes where id=p_home_id and player_profile_id=profile.id;
  if not found then return jsonb_build_object('status','home_permission_denied'); end if;
  if not home.inside_home then return jsonb_build_object('status','home_world_mismatch'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'layout_validate',60)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict head from public.home_layout_heads where player_home_id=home.id;
  if head.revision_number<>p_expected_layout_revision
     or head.state_version<>p_expected_layout_head_state_version then
    return jsonb_build_object('status','layout_conflict');
  end if;
  validation:=private.housing_validate_layout_draft(home.id,p_placements);
  return jsonb_build_object('status','validated','validation',validation);
end;
$$;

-- Phase 7 compatibility reads must ignore the soft-removed instances retained
-- for immutable Phase 11E settlement evidence.
create or replace function private.cozy_player_home_json(home public.player_homes)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',home.id,'ownerPlayerId',home.player_profile_id,
    'template',private.cozy_home_template_json(template),
    'placements',coalesce((select jsonb_agg(private.cozy_placed_furniture_json(placement)
      order by placement.updated_at,placement.id)
      from public.player_home_furniture placement
      where placement.player_home_id=home.id and placement.removed_at is null),'[]'::jsonb),
    'returnDestination',jsonb_build_object(
      'mapId',return_map.slug,'mapVersionId',home.return_map_version_id,
      'x',home.return_position_x,'y',home.return_position_y,
      'facingDirection',home.return_facing_direction
    ),
    'stateVersion',home.state_version,'createdAt',home.created_at,'updatedAt',home.updated_at
  ) from public.cozy_home_templates template,public.world_maps return_map
  where template.id=home.template_id and return_map.id=home.return_world_map_id;
$$;

create or replace function private.cozy_furniture_placement_valid(
  p_home_id uuid,p_excluded_placement_id uuid,p_furniture_definition_id uuid,
  p_x integer,p_y integer,p_rotation integer
)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare home public.player_homes%rowtype; template public.cozy_home_templates%rowtype;
  furniture public.cozy_furniture_definitions%rowtype; width integer; height integer;
  blocked jsonb; existing record; existing_width integer; existing_height integer;
begin
  select * into strict home from public.player_homes where id=p_home_id;
  select * into strict template from public.cozy_home_templates where id=home.template_id;
  select * into strict furniture from public.cozy_furniture_definitions
  where id=p_furniture_definition_id and active;
  if not (p_rotation=any(furniture.supported_rotations)) then return false; end if;
  width:=case when p_rotation in (90,270) then furniture.footprint_height else furniture.footprint_width end;
  height:=case when p_rotation in (90,270) then furniture.footprint_width else furniture.footprint_height end;
  if p_x<template.min_x or p_y<template.min_y
     or p_x+width>template.max_x or p_y+height>template.max_y then return false; end if;
  for blocked in select value from jsonb_array_elements(template.blocked_cells) loop
    if (blocked->>'x')::integer>=p_x and (blocked->>'x')::integer<p_x+width
       and (blocked->>'y')::integer>=p_y and (blocked->>'y')::integer<p_y+height then return false; end if;
  end loop;
  if template.spawn_x>=p_x and template.spawn_x<p_x+width
     and template.spawn_y>=p_y and template.spawn_y<p_y+height then return false; end if;
  if template.exit_x>=p_x and template.exit_x<p_x+width
     and template.exit_y>=p_y and template.exit_y<p_y+height then return false; end if;
  if template.exit_x>=p_x and template.exit_x<p_x+width
     and template.exit_y-2>=p_y and template.exit_y-2<p_y+height then return false; end if;
  for existing in
    select placement.*,definition.footprint_width,definition.footprint_height
    from public.player_home_furniture placement
    join public.cozy_furniture_definitions definition on definition.id=placement.furniture_definition_id
    where placement.player_home_id=p_home_id and placement.removed_at is null
      and (p_excluded_placement_id is null or placement.id<>p_excluded_placement_id)
  loop
    existing_width:=case when existing.rotation in (90,270)
      then existing.footprint_height else existing.footprint_width end;
    existing_height:=case when existing.rotation in (90,270)
      then existing.footprint_width else existing.footprint_height end;
    if p_x<existing.grid_x+existing_width and p_x+width>existing.grid_x
       and p_y<existing.grid_y+existing_height and p_y+height>existing.grid_y then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.enter_player_home(
  p_wallet_address text,p_expected_home_state_version integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; player_id uuid; home_id uuid;
begin
  result:=private.cozy_home_access(
    p_wallet_address,'home_enter',p_expected_home_state_version,p_idempotency_key,p_request_id
  );
  if result->>'status' in ('updated','replayed') then
    select profile.id,home.id into strict player_id,home_id
    from public.player_profiles profile join public.player_homes home on home.player_profile_id=profile.id
    where profile.wallet_address=p_wallet_address;
    if not private.ensure_player_home_plot(player_id,p_request_id) then
      return jsonb_build_object('status','plot_provisioning_failed');
    end if;
    perform private.ensure_player_housing(player_id,p_request_id);
    perform private.cozy_advance_starter_quest(
      player_id,'plot_entered',home_id,'phase11-enter:'||home_id::text,p_request_id
    );
    if result->>'status'='updated' then
      perform private.housing_progress_event(player_id,'personal_home_entered',home_id,'personal-home',p_request_id);
    end if;
  end if;
  return result;
end;
$$;

create or replace function public.open_player_home_storage(
  p_wallet_address text,p_home_id uuid,p_expected_storage_state_version integer,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; home public.player_homes%rowtype;
  storage public.home_storage_containers%rowtype;
begin
  if p_home_id is null or p_expected_storage_state_version<1
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_STORAGE_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  perform private.ensure_player_housing(profile.id,p_request_id);
  select * into home from public.player_homes where id=p_home_id and player_profile_id=profile.id;
  if not found then return jsonb_build_object('status','home_permission_denied'); end if;
  if not home.inside_home then return jsonb_build_object('status','home_world_mismatch'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'storage_read',120)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict storage from public.home_storage_containers where player_home_id=home.id;
  if storage.state_version<>p_expected_storage_state_version then
    return jsonb_build_object('status','storage_conflict');
  end if;
  perform private.housing_progress_event(profile.id,'home_storage_opened',storage.id,'home-storage',p_request_id);
  return jsonb_build_object('status','loaded','storage',private.housing_storage_json(storage),
    'workspace',private.housing_workspace_json(profile.id));
end;
$$;

create or replace function public.get_player_home_layout_history(
  p_wallet_address text,p_home_id uuid,p_before_revision integer,p_limit integer,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; home public.player_homes%rowtype;
  head public.home_layout_heads%rowtype; bounded_limit integer; revisions jsonb; next_cursor integer;
begin
  if p_home_id is null or p_limit is null or p_limit not between 1 and 50
     or p_before_revision is not null and p_before_revision<1
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_LAYOUT_HISTORY_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  select * into home from public.player_homes where id=p_home_id and player_profile_id=profile.id;
  if not found then return jsonb_build_object('status','home_permission_denied'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'layout_history_read',120)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict head from public.home_layout_heads where player_home_id=home.id;
  bounded_limit:=least(p_limit,50);
  select coalesce(jsonb_agg(private.housing_revision_summary_json(page,page.id=head.active_revision_id)
    order by page.revision_number desc),'[]'::jsonb),min(page.revision_number)
  into revisions,next_cursor from (
    select revision.* from public.home_layout_revisions revision
    where revision.player_home_id=home.id
      and (p_before_revision is null or revision.revision_number<p_before_revision)
    order by revision.revision_number desc limit bounded_limit
  ) page;
  if next_cursor is not null and not exists(select 1 from public.home_layout_revisions earlier
    where earlier.player_home_id=home.id and earlier.revision_number<next_cursor) then next_cursor:=null; end if;
  return jsonb_build_object('status','loaded','history',jsonb_build_object(
    'revisions',revisions,'nextCursor',next_cursor));
end;
$$;

create or replace function public.get_player_home_layout_revision(
  p_wallet_address text,p_home_id uuid,p_layout_revision_id uuid,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; home public.player_homes%rowtype;
  head public.home_layout_heads%rowtype; revision public.home_layout_revisions%rowtype; placements jsonb;
begin
  if p_home_id is null or p_layout_revision_id is null
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_LAYOUT_REVISION_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  select * into home from public.player_homes where id=p_home_id and player_profile_id=profile.id;
  if not found then return jsonb_build_object('status','home_permission_denied'); end if;
  select * into revision from public.home_layout_revisions
  where id=p_layout_revision_id and player_home_id=home.id;
  if not found then return jsonb_build_object('status','layout_not_found'); end if;
  select * into strict head from public.home_layout_heads where player_home_id=home.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'instanceId',snapshot.furniture_instance_id,'furnitureDefinitionId',snapshot.furniture_definition_id,
    'itemDefinitionId',snapshot.item_definition_id,'zoneId',snapshot.zone_id,
    'x',snapshot.logical_x,'y',snapshot.logical_y,'layer',snapshot.logical_layer,
    'rotation',snapshot.rotation,'effectiveScale',snapshot.effective_scale,
    'placementState',snapshot.placement_state
  ) order by snapshot.logical_y,snapshot.logical_x,snapshot.furniture_instance_id),'[]'::jsonb)
  into placements from public.home_layout_placement_snapshots snapshot
  where snapshot.layout_revision_id=revision.id;
  perform private.housing_progress_event(
    profile.id,'home_layout_revision_inspected',revision.id,'layout-revision',p_request_id
  );
  return jsonb_build_object('status','loaded','revision',
    private.housing_revision_summary_json(revision,revision.id=head.active_revision_id),'placements',placements);
end;
$$;

create or replace function public.transfer_player_home_storage(
  p_wallet_address text,p_home_id uuid,p_storage_id uuid,p_operation text,
  p_item_definition_id uuid,p_quantity integer,p_expected_inventory_state_version integer,
  p_expected_storage_state_version integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected record; home public.player_homes%rowtype; storage public.home_storage_containers%rowtype;
  inventory public.player_inventory_state%rowtype; live_ops public.housing_live_ops%rowtype;
  item public.cozy_item_definitions%rowtype; receipt public.cozy_gameplay_idempotency%rowtype;
  request_hash text; settlement_key text; response jsonb; history_id uuid;
  resulting_quantity integer; used_slots integer; failure_message text; operation_key text;
begin
  if p_home_id is null or p_storage_id is null or p_operation not in ('deposit','withdrawal')
     or p_item_definition_id is null or p_quantity is null or p_quantity not between 1 and 99999
     or p_expected_inventory_state_version<1 or p_expected_storage_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_STORAGE_TRANSFER_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected
  from public.player_profiles p
  join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  profile:=selected.profile_row;moderation:=selected.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','home_suspended'); end if;
  perform private.ensure_player_housing(profile.id,p_request_id);
  select * into home from public.player_homes where id=p_home_id and player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','home_permission_denied'); end if;
  operation_key:='home_storage_'||p_operation;
  request_hash:=encode(extensions.digest(convert_to(concat_ws(':',p_home_id,p_storage_id,
    p_operation,p_item_definition_id,p_quantity,p_expected_inventory_state_version,
    p_expected_storage_state_version),'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':'||operation_key||':'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation=operation_key and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'),'{replayed}','true');
  end if;
  if not home.inside_home then return jsonb_build_object('status','home_world_mismatch'); end if;
  select * into strict inventory from public.player_inventory_state
  where player_profile_id=profile.id for update;
  select * into storage from public.home_storage_containers
  where id=p_storage_id and player_home_id=home.id and owner_player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','storage_permission_denied'); end if;
  if storage.lifecycle_status<>'active' then return jsonb_build_object('status','storage_unavailable'); end if;
  select * into strict live_ops from public.housing_live_ops where singleton_key;
  if p_operation='deposit' and not live_ops.storage_deposits_enabled
    then return jsonb_build_object('status','storage_deposit_disabled'); end if;
  if p_operation='withdrawal' and not live_ops.storage_withdrawals_enabled
    then return jsonb_build_object('status','storage_withdrawal_disabled'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'storage_write',30)
    then return jsonb_build_object('status','rate_limited'); end if;
  if inventory.state_version<>p_expected_inventory_state_version
    then return jsonb_build_object('status','inventory_conflict'); end if;
  if storage.state_version<>p_expected_storage_state_version
    then return jsonb_build_object('status','storage_conflict'); end if;
  select * into item from public.cozy_item_definitions where id=p_item_definition_id and active;
  if not found or item.category in ('permanent_tool','special')
    then return jsonb_build_object('status','item_not_storage_eligible'); end if;
  settlement_key:=encode(extensions.digest(convert_to(
    'housing-storage:'||p_operation||':'||p_idempotency_key,'UTF8'),'sha256'),'hex');
  begin
    if p_operation='deposit' then
      if not private.housing_storage_can_add(storage.id,item.id,p_quantity) then
        raise exception using errcode='P0001',message='STORAGE_CAPACITY_REACHED';
      end if;
      if not private.cozy_remove_item(profile.id,item.id,p_quantity,'home_storage_deposit',
        storage.id::text,settlement_key,p_request_id) then
        raise exception using errcode='P0001',message='ITEM_NOT_OWNED';
      end if;
      if not private.housing_storage_add_item(storage.id,item.id,p_quantity) then
        raise exception using errcode='P0001',message='STORAGE_CAPACITY_REACHED';
      end if;
    else
      if not private.cozy_can_add_item(profile.id,item.id,p_quantity) then
        raise exception using errcode='P0001',message='INVENTORY_CAPACITY_REACHED';
      end if;
      if not private.housing_storage_remove_item(storage.id,item.id,p_quantity) then
        raise exception using errcode='P0001',message='STORAGE_ITEM_NOT_OWNED';
      end if;
      if not private.cozy_add_item(profile.id,item.id,p_quantity,'home_storage_withdrawal',
        storage.id::text,settlement_key,p_request_id) then
        raise exception using errcode='P0001',message='INVENTORY_CAPACITY_REACHED';
      end if;
    end if;
    select history.id into history_id from public.player_inventory_history history
    where history.player_profile_id=profile.id and history.idempotency_key=settlement_key
    order by history.created_at desc limit 1;
    select coalesce(stack.quantity,0) into resulting_quantity from (select 1) singleton
    left join public.home_storage_stacks stack on stack.storage_container_id=storage.id
      and stack.item_definition_id=item.id;
    select count(*) into used_slots from public.home_storage_stacks
    where storage_container_id=storage.id;
    insert into public.home_storage_transactions(
      player_profile_id,player_home_id,storage_container_id,operation,item_definition_id,
      quantity,inventory_history_id,resulting_storage_quantity,resulting_used_slots,
      idempotency_key,request_hash,request_id
    ) values(profile.id,home.id,storage.id,p_operation,item.id,p_quantity,history_id,
      resulting_quantity,used_slots,p_idempotency_key,request_hash,p_request_id);
  exception when sqlstate 'P0001' then
    get stacked diagnostics failure_message=message_text;
    if failure_message='STORAGE_CAPACITY_REACHED' then return jsonb_build_object('status','storage_capacity_reached'); end if;
    if failure_message='ITEM_NOT_OWNED' then return jsonb_build_object('status','item_not_owned'); end if;
    if failure_message='INVENTORY_CAPACITY_REACHED' then return jsonb_build_object('status','inventory_capacity_reached'); end if;
    if failure_message='STORAGE_ITEM_NOT_OWNED' then return jsonb_build_object('status','storage_item_not_owned'); end if;
    raise;
  end;
  perform private.housing_progress_event(profile.id,'home_storage_'||p_operation,
    storage.id,'home-storage',p_request_id);
  perform private.progression_evaluate_achievements(
    profile.id,'home_storage_transfer',transaction.id,null,p_operation,p_quantity,0,p_request_id
  ) from public.home_storage_transactions transaction
  where transaction.player_profile_id=profile.id and transaction.operation=p_operation
    and transaction.idempotency_key=p_idempotency_key;
  insert into public.cozy_private_plot_events(player_profile_id,player_home_id,event_key,target_id,payload)
  values(profile.id,home.id,'storage_changed',storage.id,jsonb_build_object(
    'operation',p_operation,'itemDefinitionId',item.id,'quantity',p_quantity
  ));
  insert into public.housing_audit_events(
    player_profile_id,player_home_id,actor_type,event_key,related_entity_id,result_category,safe_payload,request_id
  ) values(profile.id,home.id,'player','home_storage_'||p_operation,storage.id,'success',
    jsonb_build_object('itemDefinitionId',item.id,'quantity',p_quantity,'usedSlots',used_slots),p_request_id);
  response:=jsonb_build_object('status','updated','workspace',private.housing_workspace_json(profile.id),
    'replayed',false,'announcement',case when p_operation='deposit'
      then format('%s moved into home storage.',item.name) else format('%s moved into inventory.',item.name) end);
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,operation_key,p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.purchase_player_home_upgrade(
  p_wallet_address text,p_home_id uuid,p_upgrade_version_id uuid,
  p_expected_home_state_version integer,p_expected_dust_state_version integer,
  p_expected_storage_state_version integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected record; home public.player_homes%rowtype; storage public.home_storage_containers%rowtype;
  account public.player_dust_accounts%rowtype; version public.housing_upgrade_versions%rowtype;
  definition public.housing_upgrade_definitions%rowtype; live_ops public.housing_live_ops%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; ledger public.player_dust_ledger%rowtype;
  eligibility jsonb; request_hash text; response jsonb; transaction_id uuid:=gen_random_uuid();
begin
  if p_home_id is null or p_upgrade_version_id is null or p_expected_home_state_version<1
     or p_expected_dust_state_version<1 or p_expected_storage_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_UPGRADE_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  profile:=selected.profile_row;moderation:=selected.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','home_suspended'); end if;
  perform private.ensure_player_housing(profile.id,p_request_id);
  select * into home from public.player_homes where id=p_home_id and player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','home_permission_denied'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws(':',p_home_id,p_upgrade_version_id,
    p_expected_home_state_version,p_expected_dust_state_version,p_expected_storage_state_version),
    'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':home_upgrade_purchase:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='home_upgrade_purchase'
    and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'),'{replayed}','true');
  end if;
  if not home.inside_home then return jsonb_build_object('status','home_world_mismatch'); end if;
  select * into strict storage from public.home_storage_containers
  where player_home_id=home.id for update;
  select * into strict account from public.player_dust_accounts
  where player_profile_id=profile.id for update;
  select version_row.* into version from public.housing_active_upgrade_versions active
  join public.housing_upgrade_versions version_row on version_row.id=active.upgrade_version_id
  where active.upgrade_version_id=p_upgrade_version_id;
  if not found then return jsonb_build_object('status','upgrade_not_available'); end if;
  select * into strict definition from public.housing_upgrade_definitions
  where id=version.upgrade_definition_id;
  select * into strict live_ops from public.housing_live_ops where singleton_key;
  if not live_ops.upgrades_enabled then return jsonb_build_object('status','upgrade_disabled'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'home_upgrade_write',10)
    then return jsonb_build_object('status','rate_limited'); end if;
  if home.state_version<>p_expected_home_state_version then return jsonb_build_object('status','home_conflict'); end if;
  if account.state_version<>p_expected_dust_state_version then return jsonb_build_object('status','dust_conflict'); end if;
  if storage.state_version<>p_expected_storage_state_version then return jsonb_build_object('status','storage_conflict'); end if;
  eligibility:=private.housing_upgrade_json(profile.id,home,version);
  if coalesce((eligibility->>'owned')::boolean,false) then return jsonb_build_object('status','upgrade_already_owned'); end if;
  if not coalesce((eligibility->>'eligible')::boolean,false) then
    return jsonb_build_object('status','upgrade_not_eligible','upgrade',eligibility);
  end if;
  if account.balance<version.dust_cost then return jsonb_build_object('status','insufficient_dust'); end if;
  if not private.cozy_apply_dust_delta(profile.id,-version.dust_cost,'home_upgrade',
    'home_upgrade_transaction',transaction_id::text,p_idempotency_key,p_request_id) then
    return jsonb_build_object('status','upgrade_settlement_failed');
  end if;
  select * into strict ledger from public.player_dust_ledger
  where player_profile_id=profile.id and reference_id=transaction_id::text and reason='home_upgrade';
  update public.player_homes set
    home_tier=version.target_tier,furniture_capacity=version.furniture_capacity,
    storage_capacity=version.storage_capacity,
    indoor_foundation_enabled=indoor_foundation_enabled or version.room_unlock='indoor_foundation',
    configuration_revision=configuration_revision+1,state_version=state_version+1
  where id=home.id returning * into home;
  update public.home_storage_containers set capacity=version.storage_capacity,
    configuration_revision=configuration_revision+1,state_version=state_version+1
  where id=storage.id returning * into storage;
  insert into public.player_home_upgrade_transactions(
    id,player_profile_id,player_home_id,upgrade_definition_id,upgrade_version_id,
    from_tier,to_tier,dust_cost,dust_ledger_entry_id,resulting_furniture_capacity,
    resulting_storage_capacity,idempotency_key,request_hash,request_id
  ) values(transaction_id,profile.id,home.id,definition.id,version.id,version.current_tier,
    version.target_tier,version.dust_cost,ledger.id,version.furniture_capacity,
    version.storage_capacity,p_idempotency_key,request_hash,p_request_id);
  insert into public.cozy_private_plot_events(player_profile_id,player_home_id,event_key,target_id,payload)
  values(profile.id,home.id,'home_upgraded',transaction_id,jsonb_build_object(
    'upgradeKey',definition.upgrade_key,'targetTier',version.target_tier,
    'furnitureCapacity',version.furniture_capacity,'storageCapacity',version.storage_capacity
  ));
  perform private.progression_evaluate_achievements(
    profile.id,'home_upgraded',transaction_id,null,definition.upgrade_key,1,version.dust_cost,p_request_id
  );
  insert into public.housing_audit_events(
    player_profile_id,player_home_id,actor_type,event_key,related_entity_id,result_category,safe_payload,request_id
  ) values(profile.id,home.id,'player','home_upgrade_purchased',transaction_id,'success',
    jsonb_build_object('upgradeVersionId',version.id,'fromTier',version.current_tier,
      'toTier',version.target_tier,'dustCost',version.dust_cost),p_request_id);
  response:=jsonb_build_object('status','updated','workspace',private.housing_workspace_json(profile.id),
    'replayed',false,'announcement',format('%s unlocked.',definition.display_name));
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'home_upgrade_purchase',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.complete_player_home_interaction(
  p_wallet_address text,p_home_id uuid,p_furniture_instance_id uuid,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; home public.player_homes%rowtype;
  placement public.player_home_furniture%rowtype; definition public.cozy_furniture_definitions%rowtype;
begin
  if p_home_id is null or p_furniture_instance_id is null
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_INTERACTION_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  select * into home from public.player_homes where id=p_home_id and player_profile_id=profile.id;
  if not found then return jsonb_build_object('status','home_permission_denied'); end if;
  if not home.inside_home then return jsonb_build_object('status','home_world_mismatch'); end if;
  select * into placement from public.player_home_furniture
  where id=p_furniture_instance_id and player_home_id=home.id and removed_at is null;
  if not found then return jsonb_build_object('status','furniture_not_found'); end if;
  select * into strict definition from public.cozy_furniture_definitions
  where id=placement.furniture_definition_id;
  if definition.interaction_type is null then return jsonb_build_object('status','furniture_not_interactive'); end if;
  perform private.housing_progress_event(
    profile.id,'home_interaction_completed',placement.id,definition.slug,p_request_id
  );
  insert into public.cozy_private_plot_events(player_profile_id,player_home_id,event_key,target_id,payload)
  values(profile.id,home.id,'home_interaction_completed',placement.id,
    jsonb_build_object('furnitureKey',definition.slug,'interactionType',definition.interaction_type));
  return jsonb_build_object('status','completed','interactionType',definition.interaction_type,
    'workspace',private.housing_workspace_json(profile.id));
end;
$$;

revoke all on function private.ensure_player_housing(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.housing_zone_json(public.housing_decoration_zones) from public,anon,authenticated,service_role;
revoke all on function private.housing_furniture_definition_json(public.cozy_furniture_definitions) from public,anon,authenticated,service_role;
revoke all on function private.housing_placement_json(public.player_home_furniture) from public,anon,authenticated,service_role;
revoke all on function private.housing_revision_summary_json(public.home_layout_revisions,boolean) from public,anon,authenticated,service_role;
revoke all on function private.housing_storage_json(public.home_storage_containers) from public,anon,authenticated,service_role;
revoke all on function private.housing_tutorial_json(uuid) from public,anon,authenticated,service_role;
revoke all on function private.housing_upgrade_json(uuid,public.player_homes,public.housing_upgrade_versions) from public,anon,authenticated,service_role;
revoke all on function private.housing_workspace_json(uuid) from public,anon,authenticated,service_role;
revoke all on function private.housing_progress_event(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function private.housing_validate_layout_draft(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.housing_storage_can_add(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function private.housing_storage_add_item(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function private.housing_storage_remove_item(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function private.cozy_player_home_json(public.player_homes) from public,anon,authenticated,service_role;
revoke all on function private.cozy_furniture_placement_valid(uuid,uuid,uuid,integer,integer,integer) from public,anon,authenticated,service_role;

revoke all on function public.get_player_housing_workspace(text,text) from public,anon,authenticated;
revoke all on function public.open_player_decoration_session(text,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.validate_player_home_layout(text,uuid,integer,integer,jsonb,text) from public,anon,authenticated;
revoke all on function public.save_player_home_layout(text,uuid,integer,integer,integer,integer,integer,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.open_player_home_storage(text,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.get_player_home_layout_history(text,uuid,integer,integer,text) from public,anon,authenticated;
revoke all on function public.get_player_home_layout_revision(text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.transfer_player_home_storage(text,uuid,uuid,text,uuid,integer,integer,integer,text,text) from public,anon,authenticated;
revoke all on function public.purchase_player_home_upgrade(text,uuid,uuid,integer,integer,integer,text,text) from public,anon,authenticated;
revoke all on function public.complete_player_home_interaction(text,uuid,uuid,text) from public,anon,authenticated;

grant execute on function public.get_player_housing_workspace(text,text) to service_role;
grant execute on function public.open_player_decoration_session(text,uuid,integer,text,text) to service_role;
grant execute on function public.validate_player_home_layout(text,uuid,integer,integer,jsonb,text) to service_role;
grant execute on function public.save_player_home_layout(text,uuid,integer,integer,integer,integer,integer,jsonb,uuid,text,text) to service_role;
grant execute on function public.open_player_home_storage(text,uuid,integer,text) to service_role;
grant execute on function public.get_player_home_layout_history(text,uuid,integer,integer,text) to service_role;
grant execute on function public.get_player_home_layout_revision(text,uuid,uuid,text) to service_role;
grant execute on function public.transfer_player_home_storage(text,uuid,uuid,text,uuid,integer,integer,integer,text,text) to service_role;
grant execute on function public.purchase_player_home_upgrade(text,uuid,uuid,integer,integer,integer,text,text) to service_role;
grant execute on function public.complete_player_home_interaction(text,uuid,uuid,text) to service_role;
