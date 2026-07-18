-- Starville Phase 11E: authorized Housing administration and bounded worker maintenance.

create table public.housing_admin_rate_limits (
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  scope text not null check (scope in ('read','configuration_write','player_write','maintenance')),
  attempt_count integer not null check (attempt_count between 1 and 100000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(admin_user_id,scope),
  check(window_expires_at>window_started_at)
);
alter table public.housing_admin_rate_limits enable row level security;
alter table public.housing_admin_rate_limits force row level security;
revoke all on table public.housing_admin_rate_limits from public,anon,authenticated,service_role;

create or replace function private.claim_housing_admin_rate_limit(
  p_admin_user_id uuid,p_scope text,p_limit integer
)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare claimed boolean;
begin
  if p_admin_user_id is null or p_scope not in ('read','configuration_write','player_write','maintenance')
     or p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='INVALID_HOUSING_ADMIN_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('housing-admin:'||p_admin_user_id::text||':'||p_scope,0));
  insert into public.housing_admin_rate_limits(
    admin_user_id,scope,attempt_count,window_started_at,window_expires_at
  ) values(p_admin_user_id,p_scope,1,now(),now()+interval '1 minute')
  on conflict(admin_user_id,scope) do update set
    attempt_count=case when housing_admin_rate_limits.window_expires_at<=now()
      then 1 else housing_admin_rate_limits.attempt_count+1 end,
    window_started_at=case when housing_admin_rate_limits.window_expires_at<=now()
      then now() else housing_admin_rate_limits.window_started_at end,
    window_expires_at=case when housing_admin_rate_limits.window_expires_at<=now()
      then now()+interval '1 minute' else housing_admin_rate_limits.window_expires_at end,
    updated_at=now()
  returning attempt_count<=p_limit into claimed;
  return claimed;
end;
$$;

create or replace function public.get_admin_housing_workspace(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_player_wallet text,p_search text,p_limit integer,p_offset integer,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; player_id uuid; player_home_json jsonb;
  bounded_limit integer; bounded_offset integer; authorization_result jsonb;
  can_reconcile boolean; can_telemetry boolean; can_audit boolean;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,case when p_player_wallet is null
      then 'housing.furniture.inspect' else 'housing.player_homes.inspect' end);
  authorization_result:=private.evaluate_admin_authorization(
    p_user_id,p_auth_session_id,p_assurance_level);
  can_reconcile:=(authorization_result#>'{context,permissionKeys}') ? 'housing.reconciliation.manage';
  can_telemetry:=(authorization_result#>'{context,permissionKeys}') ? 'housing.telemetry.inspect';
  can_audit:=can_reconcile
    or (authorization_result#>'{context,permissionKeys}') ? 'housing.corrections.manage';
  if p_search is null or char_length(p_search)>128 or p_search<>btrim(p_search)
     or p_limit not between 1 and 100 or p_offset<0 or p_offset>10000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOUSING_ADMIN_QUERY';
  end if;
  if not private.claim_housing_admin_rate_limit(p_user_id,'read',120)
    then return jsonb_build_object('status','rate_limited'); end if;
  bounded_limit:=least(p_limit,100);bounded_offset:=least(p_offset,10000);
  if p_player_wallet is not null then
    perform private.assert_verified_admin_permission(
      p_user_id,p_auth_session_id,p_assurance_level,'housing.player_homes.inspect');
    if p_player_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
      raise exception using errcode='22023',message='INVALID_HOUSING_ADMIN_QUERY'; end if;
    select id into player_id from public.player_profiles where wallet_address=p_player_wallet;
    if player_id is not null then
      perform private.ensure_player_housing(player_id,p_request_id);
      player_home_json:=private.housing_workspace_json(player_id)||jsonb_build_object(
        'walletAddress',p_player_wallet,
        'recentSaves',coalesce((select jsonb_agg(jsonb_build_object(
          'id',revision.id,'revisionNumber',revision.revision_number,
          'validationResult',revision.validation_result,'changeSummary',revision.change_summary,
          'createdAt',revision.created_at) order by revision.revision_number desc)
          from (select revision_row.* from public.home_layout_revisions revision_row
            where revision_row.owner_player_profile_id=player_id
            order by revision_row.revision_number desc limit 50) revision),'[]'::jsonb),
        'upgradeTransactions',coalesce((select jsonb_agg(jsonb_build_object(
          'id',transaction.id,'upgradeVersionId',transaction.upgrade_version_id,
          'fromTier',transaction.from_tier,'toTier',transaction.to_tier,
          'dustCost',transaction.dust_cost,'dustLedgerEntryId',transaction.dust_ledger_entry_id,
          'createdAt',transaction.created_at) order by transaction.created_at desc)
          from public.player_home_upgrade_transactions transaction
          where transaction.player_profile_id=player_id),'[]'::jsonb),
        'reconciliation',coalesce((select jsonb_agg(to_jsonb(queue) order by queue.created_at desc)
          from (select queue_row.* from public.housing_reconciliation_queue queue_row
            where queue_row.player_profile_id=player_id order by queue_row.created_at desc limit 50) queue),'[]'::jsonb),
        'corrections',coalesce((select jsonb_agg(to_jsonb(correction) order by correction.created_at desc)
          from (select correction_row.* from public.housing_corrections correction_row
            where correction_row.player_profile_id=player_id order by correction_row.created_at desc limit 50) correction),'[]'::jsonb)
      );
    end if;
  end if;
  return jsonb_build_object(
    'status','loaded','requestId',p_request_id,'adminSessionId',trusted_session_id,
    'furniture',coalesce((select jsonb_agg(jsonb_build_object(
      'id',furniture.id,'key',furniture.slug,'name',furniture.name,'description',furniture.description,
      'category',furniture.category,'itemDefinitionId',item.id,'itemKey',item.slug,
      'worldAssetRef',furniture.asset_ref,'worldAssetId',asset.id,
      'activeAssetVersionId',asset.active_version_id,'assetReadiness',furniture.asset_readiness,
      'footprint',jsonb_build_object('width',furniture.footprint_width,'height',furniture.footprint_height),
      'footAnchor',jsonb_build_object('x',furniture.foot_anchor_x,'y',furniture.foot_anchor_y),
      'depthAnchor',jsonb_build_object('x',furniture.depth_anchor_x,'y',furniture.depth_anchor_y),
      'rotations',to_jsonb(furniture.supported_rotations),'allowedZones',to_jsonb(furniture.allowed_zone_types),
      'blocksMovement',furniture.blocks_movement,'enabled',furniture.active,'released',furniture.released,
      'configurationRevision',furniture.content_version,
      'inventoryOwnerCount',(select count(distinct stack.player_profile_id)
        from public.player_inventory_stacks stack where stack.item_definition_id=item.id),
      'placedCount',(select count(*) from public.player_home_furniture placement
        where placement.furniture_definition_id=furniture.id and placement.removed_at is null)
    ) order by furniture.name)
      from public.cozy_furniture_definitions furniture
      join public.cozy_item_definitions item on item.id=furniture.item_definition_id
      left join public.world_assets asset on asset.game_key='starville' and asset.asset_key=furniture.asset_ref
      where p_search='' or furniture.name ilike '%'||p_search||'%'
        or furniture.slug ilike '%'||p_search||'%'),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(jsonb_build_object(
      'id',template.id,'key',template.slug,'name',template.name,'version',template.template_version,
      'bounds',jsonb_build_object('minX',template.min_x,'minY',template.min_y,'maxX',template.max_x,'maxY',template.max_y),
      'spawn',jsonb_build_object('x',template.spawn_x,'y',template.spawn_y),
      'exit',jsonb_build_object('x',template.exit_x,'y',template.exit_y),
      'developmentArt',template.development_art,'active',template.active,
      'homeCount',(select count(*) from public.player_homes home where home.template_id=template.id),
      'zones',coalesce((select jsonb_agg(private.housing_zone_json(zone) order by zone.zone_key)
        from public.housing_decoration_zones zone where zone.home_template_id=template.id),'[]'::jsonb),
      'farmingTileCount',(select count(*) from public.player_home_farming_tiles tile
        join public.player_homes home on home.id=tile.player_home_id where home.template_id=template.id),
      'workstationCount',(select count(*) from public.cozy_home_workstation_templates anchor
        where anchor.home_template_id=template.id)
    ) order by template.name) from public.cozy_home_templates template),'[]'::jsonb),
    'upgrades',coalesce((select jsonb_agg(jsonb_build_object(
      'definitionId',definition.id,'key',definition.upgrade_key,'name',definition.display_name,
      'enabled',definition.enabled,'versionId',version.id,'version',version.version_number,
      'status',version.lifecycle_status,'currentTier',version.current_tier,'targetTier',version.target_tier,
      'dustCost',version.dust_cost,'requiredPlayerLevel',version.required_player_level,
      'storageCapacity',version.storage_capacity,'furnitureCapacity',version.furniture_capacity,
      'unlockedZoneKeys',to_jsonb(version.unlocked_zone_keys),'roomUnlock',version.room_unlock,
      'configurationRevision',version.configuration_revision,
      'ownerCount',(select count(*) from public.player_home_upgrade_transactions owned
        where owned.upgrade_definition_id=definition.id)
    ) order by definition.upgrade_key,version.version_number desc)
      from public.housing_upgrade_definitions definition
      join public.housing_upgrade_versions version on version.upgrade_definition_id=definition.id),'[]'::jsonb),
    'storagePolicy',jsonb_build_object(
      'starterCapacity',16,'restrictedCategories',jsonb_build_array('permanent_tool','special'),
      'maximumCapacity',500,'depositRateLimitPerMinute',30,
      'capacityViolationCount',(select count(*) from public.home_storage_containers storage
        where (select count(*) from public.home_storage_stacks stack
          where stack.storage_container_id=storage.id)>storage.capacity)
    ),
    'playerHomes',coalesce((select jsonb_agg(jsonb_build_object(
      'homeId',page.home_id,'walletAddress',page.wallet_address,'homeTier',page.home_tier,
      'layoutRevision',page.revision_number,'furnitureCount',page.furniture_count,
      'furnitureCapacity',page.furniture_capacity,'storageUsed',page.storage_used,
      'storageCapacity',page.storage_capacity,'updatedAt',page.updated_at
    ) order by page.updated_at desc,page.home_id)
      from (select home.id home_id,profile.wallet_address,home.home_tier,head.revision_number,
        (select count(*) from public.player_home_furniture placement
          where placement.player_home_id=home.id and placement.removed_at is null) furniture_count,
        home.furniture_capacity,(select count(*) from public.home_storage_stacks stack
          where stack.storage_container_id=storage.id) storage_used,storage.capacity storage_capacity,home.updated_at
        from public.player_homes home join public.player_profiles profile on profile.id=home.player_profile_id
        left join public.home_layout_heads head on head.player_home_id=home.id
        left join public.home_storage_containers storage on storage.player_home_id=home.id
        where p_search='' or profile.wallet_address ilike '%'||p_search||'%'
        order by home.updated_at desc,home.id limit bounded_limit offset bounded_offset) page),'[]'::jsonb),
    'playerHome',player_home_json,
    'reconciliation',case when can_reconcile then coalesce((select jsonb_agg(to_jsonb(queue) order by queue.priority desc,queue.created_at)
      from (select queue_row.* from public.housing_reconciliation_queue queue_row
        where queue_row.status in ('pending','processing','manual_review','failed')
        order by queue_row.priority desc,queue_row.created_at limit 100) queue),'[]'::jsonb)
      else '[]'::jsonb end,
    'liveOps',(select to_jsonb(live_ops)-'singleton_key' from public.housing_live_ops live_ops where singleton_key),
    'telemetry',case when can_telemetry then jsonb_build_object(
      'homes',(select count(*) from public.player_homes),
      'layoutSaves7d',(select count(*) from public.home_layout_revisions where created_at>=now()-interval '7 days'),
      'storageTransfers7d',(select count(*) from public.home_storage_transactions where created_at>=now()-interval '7 days'),
      'upgrades7d',(select count(*) from public.player_home_upgrade_transactions where created_at>=now()-interval '7 days'),
      'openReconciliation',(select count(*) from public.housing_reconciliation_queue
        where status in ('pending','processing','manual_review','failed')),
      'daily',coalesce((select jsonb_agg(to_jsonb(metric) order by metric.event_date desc,metric.metric_key)
        from (select metric_row.* from public.housing_telemetry_daily metric_row
          order by metric_row.event_date desc,metric_row.metric_key limit 100) metric),'[]'::jsonb)
    ) else '{}'::jsonb end,
    'audit',case when can_audit then coalesce((select jsonb_agg(to_jsonb(event) order by event.event_number desc)
      from (select event_row.* from public.housing_audit_events event_row
        order by event_row.event_number desc limit 100) event),'[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;

create or replace function public.create_admin_housing_upgrade_successor(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_base_version_id uuid,
  p_expected_configuration_revision integer,p_configuration jsonb,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; base public.housing_upgrade_versions%rowtype;
  successor public.housing_upgrade_versions%rowtype; next_version integer;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'housing.upgrades.manage');
  if p_base_version_id is null or p_expected_configuration_revision<1
     or jsonb_typeof(p_configuration)<>'object' or pg_column_size(p_configuration)>8192
     or exists(select 1 from jsonb_object_keys(p_configuration) field where field not in (
       'dustCost','requiredPlayerLevel','requiredSkillDefinitionId','requiredSkillLevel',
       'requiredQuestDefinitionId','requiredAchievementDefinitionId','storageCapacity',
       'furnitureCapacity','unlockedZoneKeys','roomUnlock','farmingTileIncrease'
     )) or p_reason is null or char_length(p_reason) not between 20 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOUSING_UPGRADE_SUCCESSOR';
  end if;
  if not private.claim_housing_admin_rate_limit(p_user_id,'configuration_write',30)
    then return jsonb_build_object('status','rate_limited'); end if;
  if exists(select 1 from public.housing_audit_events
    where actor_admin_id=p_user_id and request_id=p_request_id) then
    return jsonb_build_object('status','replayed'); end if;
  select * into base from public.housing_upgrade_versions
  where id=p_base_version_id and configuration_revision=p_expected_configuration_revision;
  if not found then return jsonb_build_object('status','housing_conflict'); end if;
  select coalesce(max(version_number),0)+1 into next_version from public.housing_upgrade_versions
  where upgrade_definition_id=base.upgrade_definition_id;
  insert into public.housing_upgrade_versions(
    id,upgrade_definition_id,version_number,lifecycle_status,current_tier,target_tier,dust_cost,
    economy_sink_version_id,required_player_level,required_skill_definition_id,required_skill_level,
    required_quest_definition_id,required_achievement_definition_id,storage_capacity,
    furniture_capacity,unlocked_zone_keys,room_unlock,farming_tile_increase,
    configuration_revision,effective_at,created_by,reason,safe_metadata
  ) values(
    gen_random_uuid(),base.upgrade_definition_id,next_version,'draft',base.current_tier,base.target_tier,
    coalesce((p_configuration->>'dustCost')::bigint,base.dust_cost),base.economy_sink_version_id,
    coalesce((p_configuration->>'requiredPlayerLevel')::integer,base.required_player_level),
    coalesce((p_configuration->>'requiredSkillDefinitionId')::uuid,base.required_skill_definition_id),
    coalesce((p_configuration->>'requiredSkillLevel')::integer,base.required_skill_level),
    coalesce((p_configuration->>'requiredQuestDefinitionId')::uuid,base.required_quest_definition_id),
    coalesce((p_configuration->>'requiredAchievementDefinitionId')::uuid,base.required_achievement_definition_id),
    coalesce((p_configuration->>'storageCapacity')::integer,base.storage_capacity),
    coalesce((p_configuration->>'furnitureCapacity')::integer,base.furniture_capacity),
    case when p_configuration ? 'unlockedZoneKeys'
      then array(select jsonb_array_elements_text(p_configuration->'unlockedZoneKeys'))
      else base.unlocked_zone_keys end,
    coalesce(p_configuration->>'roomUnlock',base.room_unlock),
    coalesce((p_configuration->>'farmingTileIncrease')::integer,base.farming_tile_increase),
    1,now(),p_user_id,p_reason,jsonb_build_object('successorOf',base.id,'adminSessionId',trusted_session_id)
  ) returning * into successor;
  insert into public.housing_audit_events(
    actor_type,actor_admin_id,event_key,related_entity_id,result_category,safe_payload,request_id
  ) values('admin',p_user_id,'upgrade_successor_created',successor.id,'success',jsonb_build_object(
    'baseVersionId',base.id,'versionNumber',successor.version_number,'reason',p_reason
  ),p_request_id);
  return jsonb_build_object('status','created','version',to_jsonb(successor),'activeVersionUnchanged',true);
end;
$$;

create or replace function public.transition_admin_housing_upgrade(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_version_id uuid,
  p_expected_configuration_revision integer,p_transition text,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; version public.housing_upgrade_versions%rowtype;
  prior_active public.housing_upgrade_versions%rowtype; issues jsonb:='[]'::jsonb;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'housing.upgrades.manage');
  if p_version_id is null or p_expected_configuration_revision<1
     or p_transition not in ('validate','activate','archive')
     or p_reason is null or char_length(p_reason) not between 20 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOUSING_UPGRADE_TRANSITION'; end if;
  if not private.claim_housing_admin_rate_limit(p_user_id,'configuration_write',30)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into version from public.housing_upgrade_versions
  where id=p_version_id and configuration_revision=p_expected_configuration_revision for update;
  if not found then return jsonb_build_object('status','housing_conflict'); end if;
  if version.storage_capacity<=0 or version.furniture_capacity<=0
     or version.target_tier<>version.current_tier+1 then
    issues:=issues||jsonb_build_array(jsonb_build_object('code','INVALID_CAPACITY_OR_TIER'));
  end if;
  if exists(select 1 from unnest(version.unlocked_zone_keys) zone_key
    where not exists(select 1 from public.housing_decoration_zones zone where zone.zone_key=zone_key)) then
    issues:=issues||jsonb_build_array(jsonb_build_object('code','UNKNOWN_ZONE'));
  end if;
  if not exists(select 1 from public.economy_sink_versions sink
    where sink.id=version.economy_sink_version_id and sink.lifecycle_status='published') then
    issues:=issues||jsonb_build_array(jsonb_build_object('code','DUST_SINK_NOT_PUBLISHED'));
  end if;
  if p_transition='validate' then
    if version.lifecycle_status<>'draft' then return jsonb_build_object('status','invalid_transition'); end if;
    if jsonb_array_length(issues)>0 then return jsonb_build_object('status','validation_failed','issues',issues); end if;
    update public.housing_upgrade_versions set lifecycle_status='validated',
      configuration_revision=configuration_revision+1 where id=version.id returning * into version;
  elsif p_transition='activate' then
    if version.lifecycle_status<>'validated' then return jsonb_build_object('status','invalid_transition'); end if;
    if jsonb_array_length(issues)>0 then return jsonb_build_object('status','validation_failed','issues',issues); end if;
    select active_version.* into prior_active from public.housing_active_upgrade_versions active
    join public.housing_upgrade_versions active_version on active_version.id=active.upgrade_version_id
    where active.upgrade_definition_id=version.upgrade_definition_id for update;
    if prior_active.id is not null then
      update public.housing_upgrade_versions set lifecycle_status='superseded'
      where id=prior_active.id;
    end if;
    update public.housing_upgrade_versions set lifecycle_status='active',activated_at=now(),
      effective_at=now(),configuration_revision=configuration_revision+1
      where id=version.id returning * into version;
    insert into public.housing_active_upgrade_versions(upgrade_definition_id,upgrade_version_id)
    values(version.upgrade_definition_id,version.id)
    on conflict(upgrade_definition_id) do update set upgrade_version_id=excluded.upgrade_version_id,activated_at=now();
  else
    if version.lifecycle_status not in ('draft','validated') then return jsonb_build_object('status','invalid_transition'); end if;
    update public.housing_upgrade_versions set lifecycle_status='archived',
      configuration_revision=configuration_revision+1 where id=version.id returning * into version;
  end if;
  insert into public.housing_audit_events(
    actor_type,actor_admin_id,event_key,related_entity_id,result_category,safe_payload,request_id
  ) values('admin',p_user_id,'upgrade_'||p_transition||'d',version.id,'success',jsonb_build_object(
    'transition',p_transition,'reason',p_reason,'adminSessionId',trusted_session_id,
    'priorActiveVersionId',prior_active.id,'issues',issues
  ),p_request_id);
  return jsonb_build_object('status',case when p_transition='validate' then 'validated'
    when p_transition='activate' then 'activated' else 'archived' end,
    'version',to_jsonb(version),'priorActiveVersionId',prior_active.id,'issues',issues);
end;
$$;

create or replace function public.update_admin_housing_live_ops(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_expected_configuration_revision integer,p_configuration jsonb,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; previous public.housing_live_ops%rowtype;
  updated public.housing_live_ops%rowtype;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'housing.live_ops.manage');
  if p_expected_configuration_revision<1 or jsonb_typeof(p_configuration)<>'object'
     or exists(select 1 from jsonb_object_keys(p_configuration) field where field not in (
       'decorationStartsEnabled','layoutSavesEnabled','storageDepositsEnabled',
       'storageWithdrawalsEnabled','upgradesEnabled','tutorialGrantsEnabled',
       'tutorialRewardsEnabled','maintenanceMessage'
     )) or p_reason is null or char_length(p_reason) not between 20 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOUSING_LIVE_OPS'; end if;
  if not private.claim_housing_admin_rate_limit(p_user_id,'configuration_write',30)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into previous from public.housing_live_ops
  where singleton_key and configuration_revision=p_expected_configuration_revision for update;
  if not found then return jsonb_build_object('status','housing_conflict'); end if;
  update public.housing_live_ops set
    decoration_starts_enabled=coalesce((p_configuration->>'decorationStartsEnabled')::boolean,decoration_starts_enabled),
    layout_saves_enabled=coalesce((p_configuration->>'layoutSavesEnabled')::boolean,layout_saves_enabled),
    storage_deposits_enabled=coalesce((p_configuration->>'storageDepositsEnabled')::boolean,storage_deposits_enabled),
    storage_withdrawals_enabled=coalesce((p_configuration->>'storageWithdrawalsEnabled')::boolean,storage_withdrawals_enabled),
    upgrades_enabled=coalesce((p_configuration->>'upgradesEnabled')::boolean,upgrades_enabled),
    tutorial_grants_enabled=coalesce((p_configuration->>'tutorialGrantsEnabled')::boolean,tutorial_grants_enabled),
    tutorial_rewards_enabled=coalesce((p_configuration->>'tutorialRewardsEnabled')::boolean,tutorial_rewards_enabled),
    maintenance_message=case when p_configuration ? 'maintenanceMessage'
      then nullif(p_configuration->>'maintenanceMessage','') else maintenance_message end,
    configuration_revision=configuration_revision+1
  where singleton_key returning * into updated;
  insert into public.housing_audit_events(
    actor_type,actor_admin_id,event_key,result_category,safe_payload,request_id
  ) values('admin',p_user_id,'live_ops_updated','success',jsonb_build_object(
    'previous',to_jsonb(previous)-'singleton_key','updated',to_jsonb(updated)-'singleton_key',
    'reason',p_reason,'adminSessionId',trusted_session_id
  ),p_request_id);
  return jsonb_build_object('status','updated','liveOps',to_jsonb(updated)-'singleton_key');
end;
$$;

create or replace function public.request_admin_housing_reconciliation(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_player_wallet text,
  p_reconciliation_type text,p_priority integer,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; profile public.player_profiles%rowtype;
  home public.player_homes%rowtype; queue public.housing_reconciliation_queue%rowtype;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'housing.reconciliation.manage');
  if p_player_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_reconciliation_type not in ('full_home','layout_head','furniture_settlement',
       'storage_quantity','storage_capacity','layout_validity','upgrade_settlement',
       'quest_authority','preview_exclusion','configuration_compatibility')
     or p_priority not between 1 and 100 or p_reason is null
     or char_length(p_reason) not between 20 and 500 or p_reason<>btrim(p_reason)
     or p_reason ~ '[[:cntrl:]<>]' or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOUSING_RECONCILIATION'; end if;
  if not private.claim_housing_admin_rate_limit(p_user_id,'player_write',30)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into profile from public.player_profiles where wallet_address=p_player_wallet;
  if not found then return jsonb_build_object('status','player_not_found'); end if;
  perform private.ensure_player_housing(profile.id,p_request_id);
  select * into strict home from public.player_homes where player_profile_id=profile.id;
  insert into public.housing_reconciliation_queue(
    player_profile_id,player_home_id,reconciliation_type,priority,
    expected_home_state_version,evidence,requested_by_admin_id,request_id
  ) values(profile.id,home.id,p_reconciliation_type,p_priority,home.state_version,
    jsonb_build_object('reason',p_reason,'adminSessionId',trusted_session_id),p_user_id,p_request_id)
  returning * into queue;
  insert into public.housing_audit_events(
    player_profile_id,player_home_id,actor_type,actor_admin_id,event_key,
    related_entity_id,result_category,safe_payload,request_id
  ) values(profile.id,home.id,'admin',p_user_id,'reconciliation_requested',queue.id,'success',
    jsonb_build_object('type',p_reconciliation_type,'reason',p_reason),p_request_id);
  return jsonb_build_object('status','requested','reconciliation',to_jsonb(queue));
end;
$$;

create or replace function public.request_admin_housing_correction(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_player_wallet text,
  p_correction_type text,p_expected_home_state_version integer,p_impact_preview jsonb,
  p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; profile public.player_profiles%rowtype;
  home public.player_homes%rowtype; correction public.housing_corrections%rowtype;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'housing.corrections.manage');
  if p_player_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_correction_type not in ('retry_layout_settlement','recover_stranded_furniture',
       'repair_storage_mismatch','restore_safe_layout','compensating_item_foundation')
     or p_expected_home_state_version<1 or jsonb_typeof(p_impact_preview)<>'object'
     or pg_column_size(p_impact_preview)>16384 or p_reason is null
     or char_length(p_reason) not between 20 and 1000 or p_reason<>btrim(p_reason)
     or p_reason ~ '[[:cntrl:]<>]' or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOUSING_CORRECTION'; end if;
  if not private.claim_housing_admin_rate_limit(p_user_id,'player_write',20)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into profile from public.player_profiles where wallet_address=p_player_wallet;
  if not found then return jsonb_build_object('status','player_not_found'); end if;
  select * into home from public.player_homes where player_profile_id=profile.id;
  if not found then return jsonb_build_object('status','home_not_found'); end if;
  if home.state_version<>p_expected_home_state_version
    then return jsonb_build_object('status','housing_conflict'); end if;
  insert into public.housing_corrections(
    player_profile_id,player_home_id,correction_type,expected_home_state_version,
    impact_preview,reason,requested_by_admin_id
  ) values(profile.id,home.id,p_correction_type,p_expected_home_state_version,
    p_impact_preview,p_reason,p_user_id) returning * into correction;
  insert into public.housing_audit_events(
    player_profile_id,player_home_id,actor_type,actor_admin_id,event_key,
    related_entity_id,result_category,safe_payload,request_id
  ) values(profile.id,home.id,'admin',p_user_id,'correction_requested',correction.id,'manual_review',
    jsonb_build_object('type',p_correction_type,'impactPreview',p_impact_preview,
      'reason',p_reason,'adminSessionId',trusted_session_id),p_request_id);
  return jsonb_build_object('status','requested','correction',to_jsonb(correction),
    'requiresIndependentAal2Review',true);
end;
$$;

create or replace function public.apply_admin_housing_correction(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_correction_id uuid,
  p_expected_correction_state_version integer,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; correction public.housing_corrections%rowtype;
  home public.player_homes%rowtype; storage public.home_storage_containers%rowtype;
  used_slots integer; queue_id uuid;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'housing.corrections.manage');
  if p_correction_id is null or p_expected_correction_state_version<1
     or p_reason is null or char_length(p_reason) not between 20 and 1000
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOUSING_CORRECTION_APPLY'; end if;
  if not private.claim_housing_admin_rate_limit(p_user_id,'player_write',20)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into correction from public.housing_corrections
  where id=p_correction_id and state_version=p_expected_correction_state_version for update;
  if not found then return jsonb_build_object('status','housing_conflict'); end if;
  if correction.status<>'pending_review' then return jsonb_build_object('status','invalid_transition'); end if;
  if correction.requested_by_admin_id=p_user_id then
    return jsonb_build_object('status','independent_review_required'); end if;
  select * into strict home from public.player_homes where id=correction.player_home_id for update;
  if home.state_version<>correction.expected_home_state_version
    then return jsonb_build_object('status','housing_conflict'); end if;
  if correction.correction_type='repair_storage_mismatch' then
    select * into strict storage from public.home_storage_containers
    where player_home_id=home.id for update;
    select count(*) into used_slots from public.home_storage_stacks
    where storage_container_id=storage.id;
    if used_slots>home.storage_capacity then
      update public.housing_corrections set status='approved',reviewed_by_admin_id=p_user_id,
        reviewed_at=now(),state_version=state_version+1 where id=correction.id;
      insert into public.housing_reconciliation_queue(
        player_profile_id,player_home_id,reconciliation_type,status,priority,
        expected_home_state_version,evidence,requested_by_admin_id,request_id
      ) values(correction.player_profile_id,home.id,'storage_capacity','manual_review',100,
        home.state_version,jsonb_build_object('correctionId',correction.id,
          'usedSlots',used_slots,'homeCapacity',home.storage_capacity,'reviewReason',p_reason),
        p_user_id,p_request_id) returning id into queue_id;
      return jsonb_build_object('status','manual_review','correctionId',correction.id,
        'reconciliationId',queue_id,'itemsMoved',0);
    end if;
    update public.home_storage_containers set capacity=home.storage_capacity,
      configuration_revision=configuration_revision+1,state_version=state_version+1
    where id=storage.id;
    update public.housing_corrections set status='applied',reviewed_by_admin_id=p_user_id,
      applied_by_admin_id=p_user_id,reviewed_at=now(),applied_at=now(),state_version=state_version+1
    where id=correction.id;
  else
    update public.housing_corrections set status='approved',reviewed_by_admin_id=p_user_id,
      reviewed_at=now(),state_version=state_version+1 where id=correction.id;
    insert into public.housing_reconciliation_queue(
      player_profile_id,player_home_id,reconciliation_type,status,priority,
      expected_home_state_version,evidence,requested_by_admin_id,request_id
    ) values(correction.player_profile_id,home.id,
      case correction.correction_type
        when 'retry_layout_settlement' then 'furniture_settlement'
        when 'recover_stranded_furniture' then 'furniture_settlement'
        when 'restore_safe_layout' then 'layout_validity'
        else 'full_home' end,
      'manual_review',100,home.state_version,jsonb_build_object(
        'correctionId',correction.id,'correctionType',correction.correction_type,
        'impactPreview',correction.impact_preview,'reviewReason',p_reason
      ),p_user_id,p_request_id) returning id into queue_id;
    insert into public.housing_audit_events(
      player_profile_id,player_home_id,actor_type,actor_admin_id,event_key,
      related_entity_id,result_category,safe_payload,request_id
    ) values(correction.player_profile_id,home.id,'admin',p_user_id,'correction_reviewed',
      correction.id,'manual_review',jsonb_build_object('reason',p_reason,
        'adminSessionId',trusted_session_id,'reconciliationId',queue_id,'automaticMutation',false),p_request_id);
    return jsonb_build_object('status','manual_review','correctionId',correction.id,
      'reconciliationId',queue_id,'originalHistoryPreserved',true,'itemsMoved',0);
  end if;
  insert into public.housing_audit_events(
    player_profile_id,player_home_id,actor_type,actor_admin_id,event_key,
    related_entity_id,result_category,safe_payload,request_id
  ) values(correction.player_profile_id,home.id,'admin',p_user_id,'correction_applied',
    correction.id,'repaired',jsonb_build_object('type',correction.correction_type,
      'reason',p_reason,'adminSessionId',trusted_session_id,'itemsMoved',0),p_request_id);
  return jsonb_build_object('status','applied','correctionId',correction.id,
    'originalHistoryPreserved',true,'itemsMoved',0);
end;
$$;

create or replace function public.run_housing_maintenance(p_limit integer,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare queue public.housing_reconciliation_queue%rowtype; home public.player_homes%rowtype;
  storage public.home_storage_containers%rowtype; used_slots integer;
  expired_sessions integer:=0; resolved_count integer:=0; manual_count integer:=0;
  failed_count integer:=0; capacity_repaired integer:=0;
begin
  if p_limit not between 1 and 500 or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOUSING_MAINTENANCE'; end if;
  update public.housing_decoration_sessions set status='expired',closed_at=now()
  where status='active' and expires_at<=now();
  get diagnostics expired_sessions=row_count;
  for queue in select * from public.housing_reconciliation_queue
    where status in ('pending','failed') and available_at<=now() and attempt_count<20
    order by priority desc,created_at for update skip locked limit p_limit
  loop
    update public.housing_reconciliation_queue set status='processing',
      attempt_count=attempt_count+1 where id=queue.id;
    begin
      if queue.player_home_id is null then
        update public.housing_reconciliation_queue set status='manual_review',
          resolution_summary=jsonb_build_object('checkedAt',now(),'reason','home_identity_required')
        where id=queue.id;manual_count:=manual_count+1;continue;
      end if;
      select * into home from public.player_homes where id=queue.player_home_id for update;
      if not found then
        update public.housing_reconciliation_queue set status='manual_review',
          resolution_summary=jsonb_build_object('checkedAt',now(),'reason','home_missing')
        where id=queue.id;manual_count:=manual_count+1;continue;
      end if;
      if queue.reconciliation_type='storage_capacity' then
        select * into strict storage from public.home_storage_containers
        where player_home_id=home.id for update;
        select count(*) into used_slots from public.home_storage_stacks
        where storage_container_id=storage.id;
        if used_slots<=home.storage_capacity then
          if storage.capacity<>home.storage_capacity then
            update public.home_storage_containers set capacity=home.storage_capacity,
              configuration_revision=configuration_revision+1,state_version=state_version+1
            where id=storage.id;capacity_repaired:=capacity_repaired+1;
          end if;
          update public.housing_reconciliation_queue set status='resolved',last_error_code=null,
            resolution_summary=jsonb_build_object('checkedAt',now(),'repair','capacity_projection',
              'usedSlots',used_slots,'capacity',home.storage_capacity)
          where id=queue.id;resolved_count:=resolved_count+1;
        else
          update public.housing_reconciliation_queue set status='manual_review',
            resolution_summary=jsonb_build_object('checkedAt',now(),'reason','capacity_below_usage',
              'usedSlots',used_slots,'capacity',home.storage_capacity)
          where id=queue.id;manual_count:=manual_count+1;
        end if;
      elsif queue.reconciliation_type='layout_head' and exists(
        select 1 from public.home_layout_heads head join public.home_layout_revisions revision
          on revision.id=head.active_revision_id and revision.player_home_id=head.player_home_id
        where head.player_home_id=home.id
      ) then
        update public.housing_reconciliation_queue set status='resolved',last_error_code=null,
          resolution_summary=jsonb_build_object('checkedAt',now(),'finding','layout_head_valid')
        where id=queue.id;resolved_count:=resolved_count+1;
      elsif queue.reconciliation_type='preview_exclusion' and not exists(
        select 1 from public.housing_audit_events event
        where event.player_home_id=home.id and event.safe_payload @> '{"gameTest":true}'::jsonb
      ) then
        update public.housing_reconciliation_queue set status='resolved',last_error_code=null,
          resolution_summary=jsonb_build_object('checkedAt',now(),'finding','no_persistent_preview_activity')
        where id=queue.id;resolved_count:=resolved_count+1;
      else
        update public.housing_reconciliation_queue set status='manual_review',
          resolution_summary=jsonb_build_object('checkedAt',now(),'reason','evidence_review_required',
            'automaticItemOrCurrencyMutation',false)
        where id=queue.id;manual_count:=manual_count+1;
      end if;
    exception when others then
      update public.housing_reconciliation_queue set status='failed',
        last_error_code='HOUSING_RECONCILIATION_FAILED',available_at=now()+interval '5 minutes',
        resolution_summary=jsonb_build_object('checkedAt',now(),'safeError','bounded_check_failed')
      where id=queue.id;failed_count:=failed_count+1;
    end;
  end loop;
  insert into public.housing_telemetry_daily(event_date,metric_key,dimension_key,event_count,quantity_total)
  values
    (current_date,'layout_saves','all',(select count(*) from public.home_layout_revisions
      where created_at>=current_date and created_at<current_date+1),0),
    (current_date,'storage_transfers','all',(select count(*) from public.home_storage_transactions
      where created_at>=current_date and created_at<current_date+1),
      (select coalesce(sum(quantity),0) from public.home_storage_transactions
        where created_at>=current_date and created_at<current_date+1)),
    (current_date,'home_upgrades','all',(select count(*) from public.player_home_upgrade_transactions
      where created_at>=current_date and created_at<current_date+1),
      (select coalesce(sum(dust_cost),0) from public.player_home_upgrade_transactions
        where created_at>=current_date and created_at<current_date+1))
  on conflict(event_date,metric_key,dimension_key) do update set
    event_count=excluded.event_count,quantity_total=excluded.quantity_total,updated_at=now();
  insert into public.housing_audit_events(
    actor_type,event_key,result_category,safe_payload,request_id
  ) values('worker','housing_maintenance_processed','success',jsonb_build_object(
    'expiredSessions',expired_sessions,'resolved',resolved_count,'manualReview',manual_count,
    'failed',failed_count,'capacityRepaired',capacity_repaired,'limit',p_limit
  ),p_request_id);
  return jsonb_build_object('status','processed','expiredSessions',expired_sessions,
    'reconciliationResolved',resolved_count,'manualReview',manual_count,'failed',failed_count,
    'capacityRepaired',capacity_repaired,'automaticItemCorrections',0,
    'automaticDustCorrections',0,'requestId',p_request_id);
end;
$$;

revoke all on function private.claim_housing_admin_rate_limit(uuid,text,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.get_admin_housing_workspace(uuid,uuid,text,text,text,integer,integer,text)
  from public,anon,authenticated;
revoke all on function public.create_admin_housing_upgrade_successor(uuid,uuid,text,uuid,integer,jsonb,text,text)
  from public,anon,authenticated;
revoke all on function public.transition_admin_housing_upgrade(uuid,uuid,text,uuid,integer,text,text,text)
  from public,anon,authenticated;
revoke all on function public.update_admin_housing_live_ops(uuid,uuid,text,integer,jsonb,text,text)
  from public,anon,authenticated;
revoke all on function public.request_admin_housing_reconciliation(uuid,uuid,text,text,text,integer,text,text)
  from public,anon,authenticated;
revoke all on function public.request_admin_housing_correction(uuid,uuid,text,text,text,integer,jsonb,text,text)
  from public,anon,authenticated;
revoke all on function public.apply_admin_housing_correction(uuid,uuid,text,uuid,integer,text,text)
  from public,anon,authenticated;
revoke all on function public.run_housing_maintenance(integer,text)
  from public,anon,authenticated;

grant execute on function public.get_admin_housing_workspace(uuid,uuid,text,text,text,integer,integer,text)
  to service_role;
grant execute on function public.create_admin_housing_upgrade_successor(uuid,uuid,text,uuid,integer,jsonb,text,text)
  to service_role;
grant execute on function public.transition_admin_housing_upgrade(uuid,uuid,text,uuid,integer,text,text,text)
  to service_role;
grant execute on function public.update_admin_housing_live_ops(uuid,uuid,text,integer,jsonb,text,text)
  to service_role;
grant execute on function public.request_admin_housing_reconciliation(uuid,uuid,text,text,text,integer,text,text)
  to service_role;
grant execute on function public.request_admin_housing_correction(uuid,uuid,text,text,text,integer,jsonb,text,text)
  to service_role;
grant execute on function public.apply_admin_housing_correction(uuid,uuid,text,uuid,integer,text,text)
  to service_role;
grant execute on function public.run_housing_maintenance(integer,text)
  to service_role;
