-- Starville Phase 11B administration and bounded reconciliation.

create table public.cozy_crafting_admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  administrator_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  action_key text not null check (action_key in (
    'crafting.liveops_updated','crafting.workstation_updated',
    'crafting.recipe_successor_created','crafting.job_reconciliation_requested'
  )),
  target_id uuid,
  before_state jsonb not null check (
    jsonb_typeof(before_state)='object' and pg_column_size(before_state)<=16384
  ),
  after_state jsonb not null check (
    jsonb_typeof(after_state)='object' and pg_column_size(after_state)<=16384
  ),
  reason text not null check (
    char_length(reason) between 12 and 500 and reason=btrim(reason)
    and reason !~ '[[:cntrl:]<>]'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  unique (administrator_user_id,request_id)
);

create trigger cozy_crafting_admin_audit_events_append_only
before update or delete on public.cozy_crafting_admin_audit_events
for each row execute function private.reject_cozy_append_only_mutation();

alter table public.cozy_crafting_admin_audit_events enable row level security;
alter table public.cozy_crafting_admin_audit_events force row level security;
revoke all on table public.cozy_crafting_admin_audit_events
  from public,anon,authenticated,service_role;

create or replace function private.cozy_admin_recipe_version_json(
  version public.cozy_recipe_versions
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'definitionId',definition.id,'versionId',version.id,
    'key',definition.slug,'versionNumber',version.version_number,
    'lifecycleStatus',version.lifecycle_status,'name',version.public_name,
    'description',version.public_description,'category',version.recipe_category,
    'workstationType',version.workstation_type,
    'ingredients',coalesce((select jsonb_agg(jsonb_build_object(
      'itemId',item.id,'itemSlug',item.slug,'itemName',item.name,
      'quantity',ingredient.quantity,'displayOrder',ingredient.display_order,
      'active',item.active
    ) order by ingredient.display_order)
      from public.cozy_recipe_version_ingredients ingredient
      join public.cozy_item_definitions item on item.id=ingredient.item_definition_id
      where ingredient.recipe_version_id=version.id),'[]'::jsonb),
    'output',jsonb_build_object(
      'itemId',output_item.id,'itemSlug',output_item.slug,
      'itemName',output_item.name,'quantity',version.output_quantity,
      'active',output_item.active,'maxStackSize',output_item.max_stack_size
    ),
    'productionDurationSeconds',version.production_duration_seconds,
    'localDurationSeconds',version.local_duration_seconds,
    'dustFee',version.dust_fee,'unlockRule',version.unlock_rule,
    'discoveryPolicy',version.discovery_policy,
    'tutorialEligible',version.tutorial_eligible,'repeatable',version.repeatable,
    'maximumBatchQuantity',version.maximum_batch_quantity,'enabled',version.enabled,
    'configurationRevision',version.configuration_revision,
    'activeForNewJobs',exists(select 1 from public.cozy_active_recipe_versions active
      where active.recipe_version_id=version.id),
    'activeJobCount',(select count(*) from public.player_crafting_jobs job
      where job.recipe_version_id=version.id and job.status in ('pending','running','ready','blocked')),
    'historicalJobCount',(select count(*) from public.player_crafting_jobs job
      where job.recipe_version_id=version.id),
    'validation',jsonb_build_object(
      'valid',output_item.active and version.output_quantity>0
        and exists(select 1 from public.cozy_recipe_version_ingredients ingredient
          join public.cozy_item_definitions item on item.id=ingredient.item_definition_id
          where ingredient.recipe_version_id=version.id and item.active)
        and not exists(select 1 from public.cozy_recipe_version_ingredients ingredient
          join public.cozy_item_definitions item on item.id=ingredient.item_definition_id
          where ingredient.recipe_version_id=version.id and not item.active),
      'warnings',(select coalesce(jsonb_agg(warning),'[]'::jsonb)
        from (values
          (case when version.production_duration_seconds>86400
            then 'Duration exceeds 24 hours.' end),
          (case when version.output_quantity*version.maximum_batch_quantity>output_item.max_stack_size
            then 'A maximum batch can exceed one output stack.' end),
          (case when version.dust_fee>10000 then 'The optional DUST fee is unusually high.' end),
          (case when output_item.asset_readiness<>'approved'
            then 'Development artwork fallback is active.' end),
          (case when not exists(select 1 from public.player_home_workstations station
            join public.cozy_workstation_definitions workstation
              on workstation.id=station.workstation_definition_id
            where workstation.workstation_type=version.workstation_type)
            then 'No linked workstation placement exists.' end),
          (case when exists(select 1 from public.player_crafting_jobs job
            where job.recipe_definition_id=version.recipe_definition_id
              and job.recipe_version_id<>version.id
              and job.status in ('pending','running','ready','blocked'))
            then 'Active jobs remain pinned to an older version.' end)
        ) warning_list(warning) where warning is not null)
    ),
    'createdAt',version.created_at,'activatedAt',version.activated_at
  )
  from public.cozy_recipe_definitions definition
  join public.cozy_item_definitions output_item on output_item.id=version.output_item_definition_id
  where definition.id=version.recipe_definition_id;
$$;

create or replace function private.cozy_admin_workstation_json(
  definition public.cozy_workstation_definitions
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.cozy_workstation_definition_json(definition)||jsonb_build_object(
    'placementCount',(select count(*) from public.cozy_home_workstation_templates placement
      where placement.workstation_definition_id=definition.id),
    'instanceCount',(select count(*) from public.player_home_workstations station
      where station.workstation_definition_id=definition.id),
    'activeJobCount',(select count(*) from public.player_crafting_jobs job
      where job.workstation_definition_id=definition.id
        and job.status in ('pending','running','ready','blocked')),
    'failedJobCount',(select count(*) from public.player_crafting_jobs job
      where job.workstation_definition_id=definition.id and job.status='failed'),
    'linkedRecipeCount',(select count(*) from public.cozy_active_recipe_versions active
      join public.cozy_recipe_versions version on version.id=active.recipe_version_id
      where version.workstation_type=definition.workstation_type),
    'developmentMarker',definition.asset_readiness<>'approved'
  );
$$;

create or replace function public.get_admin_crafting_content(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'crafting.read');
  return jsonb_build_object(
    'status','loaded','settings',private.cozy_workstation_live_ops_json(),
    'workstations',coalesce((select jsonb_agg(private.cozy_admin_workstation_json(definition)
      order by definition.display_name) from public.cozy_workstation_definitions definition),'[]'::jsonb),
    'recipes',coalesce((select jsonb_agg(private.cozy_admin_recipe_version_json(version)
      order by definition.slug,version.version_number desc)
      from public.cozy_recipe_versions version
      join public.cozy_recipe_definitions definition on definition.id=version.recipe_definition_id),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',job.id,'playerId',job.player_profile_id,'homeId',job.player_home_id,
      'workstationInstanceId',job.workstation_instance_id,
      'recipeVersionId',job.recipe_version_id,'recipeKey',job.recipe_key,
      'recipeName',job.recipe_name,'quantity',job.quantity,
      'status',case when job.status='running' and job.completes_at<=now() then 'ready' else job.status end,
      'startedAt',job.started_at,'completesAt',job.completes_at,'collectedAt',job.collected_at,
      'ingredients',job.ingredient_snapshot,
      'output',jsonb_build_object('itemSlug',job.output_item_slug,'quantity',job.output_quantity),
      'dustFee',job.dust_fee,'ingredientSettlementReference',job.ingredient_settlement_reference,
      'outputSettlementReference',job.output_settlement_reference,
      'dustSettlementReference',job.dust_settlement_reference,
      'failureCode',job.safe_failure_code,'stateVersion',job.state_version
    ) order by job.created_at desc) from (
      select * from public.player_crafting_jobs order by created_at desc limit 100
    ) job),'[]'::jsonb),
    'telemetry',jsonb_build_object(
      'runningJobs',(select count(*) from public.player_crafting_jobs
        where status='running' and completes_at>now()),
      'readyJobs',(select count(*) from public.player_crafting_jobs
        where status='ready' or (status='running' and completes_at<=now())),
      'collectedJobs',(select count(*) from public.player_crafting_jobs where status='collected'),
      'failedJobs',(select count(*) from public.player_crafting_jobs where status='failed'),
      'inventoryFullCollectionFailures',(select count(*) from public.cozy_crafting_job_events
        where event_key='collection_blocked'),
      'abandonedReadyJobs',(select count(*) from public.player_crafting_jobs
        where status in ('ready','running') and completes_at<now()-interval '7 days'),
      'averageConfiguredDurationSeconds',(select coalesce(avg(production_duration_seconds),0)
        from public.cozy_recipe_versions where lifecycle_status='active')
    ),
    'audit',coalesce((select jsonb_agg(jsonb_build_object(
      'id',event.id,'actionKey',event.action_key,'targetId',event.target_id,
      'reason',event.reason,'requestId',event.request_id,'createdAt',event.created_at
    ) order by event.created_at desc) from (
      select * from public.cozy_crafting_admin_audit_events
      order by created_at desc limit 50
    ) event),'[]'::jsonb)
  );
end;
$$;

create or replace function public.get_admin_player_crafting(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_player_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'players.read');
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'crafting.player_read');
  if not exists(select 1 from public.player_profiles where id=p_player_profile_id)
    then return jsonb_build_object('status','not_found'); end if;
  return jsonb_build_object(
    'status','loaded','tutorial',private.cozy_workstation_tutorial_json(p_player_profile_id),
    'workstations',coalesce((select jsonb_agg(private.cozy_workstation_instance_json(station)
      order by station.world_object_id) from public.player_home_workstations station
      where station.player_profile_id=p_player_profile_id),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(private.cozy_crafting_job_json(job)
      order by job.created_at desc) from (
        select * from public.player_crafting_jobs
        where player_profile_id=p_player_profile_id order by created_at desc limit 50
      ) job),'[]'::jsonb),
    'pendingReconciliationCount',(select count(*)
      from public.cozy_crafting_reconciliation_queue queue
      join public.player_crafting_jobs job on job.id=queue.crafting_job_id
      where job.player_profile_id=p_player_profile_id
        and queue.status in ('pending','failed','manual_review'))
  );
end;
$$;

create or replace function public.update_admin_crafting_live_ops(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_expected_revision integer,p_cooking_starts_enabled boolean,
  p_crafting_starts_enabled boolean,p_collection_enabled boolean,
  p_tutorial_unlocks_enabled boolean,p_tutorial_rewards_enabled boolean,
  p_dust_fees_enabled boolean,p_use_local_durations boolean,
  p_maintenance_message text,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare trusted_session_id uuid; settings public.cozy_crafting_settings%rowtype;
  prior public.cozy_crafting_admin_audit_events%rowtype;
  before_state jsonb; after_state jsonb;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'crafting.liveops');
  if p_expected_revision<1 or p_cooking_starts_enabled is null
     or p_crafting_starts_enabled is null or p_collection_enabled is null
     or p_tutorial_unlocks_enabled is null or p_tutorial_rewards_enabled is null
     or p_dust_fees_enabled is null or p_use_local_durations is null
     or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
     or (p_maintenance_message is not null and (
       char_length(p_maintenance_message) not between 1 and 280
       or p_maintenance_message<>btrim(p_maintenance_message)
       or p_maintenance_message ~ '[[:cntrl:]<>]'
     )) then raise exception using errcode='22023',message='INVALID_CRAFTING_LIVE_OPS_REQUEST'; end if;
  select * into prior from public.cozy_crafting_admin_audit_events
  where administrator_user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.action_key<>'crafting.liveops_updated'
      then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_build_object('status','replayed','settings',prior.after_state,'replayed',true);
  end if;
  select * into strict settings from public.cozy_crafting_settings where singleton_key for update;
  if settings.configuration_revision<>p_expected_revision
    then return jsonb_build_object('status','state_conflict'); end if;
  before_state:=private.cozy_workstation_live_ops_json();
  update public.cozy_crafting_settings set
    cooking_starts_enabled=p_cooking_starts_enabled,
    crafting_starts_enabled=p_crafting_starts_enabled,
    collection_enabled=p_collection_enabled,
    tutorial_unlocks_enabled=p_tutorial_unlocks_enabled,
    tutorial_rewards_enabled=p_tutorial_rewards_enabled,
    dust_fees_enabled=p_dust_fees_enabled,
    use_local_durations=p_use_local_durations,
    maintenance_message=p_maintenance_message,
    configuration_revision=configuration_revision+1
  where singleton_key;
  after_state:=private.cozy_workstation_live_ops_json();
  insert into public.cozy_crafting_admin_audit_events(
    administrator_user_id,admin_session_id,action_key,before_state,after_state,reason,request_id
  ) values(p_user_id,trusted_session_id,'crafting.liveops_updated',
    before_state,after_state,p_reason,p_request_id);
  return jsonb_build_object('status','updated','settings',after_state,'replayed',false);
end;
$$;

create or replace function public.update_admin_workstation_definition(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_workstation_definition_id uuid,p_expected_configuration_revision integer,
  p_display_name text,p_description text,p_queue_capacity integer,
  p_interaction_radius numeric,p_enabled boolean,
  p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare trusted_session_id uuid; definition public.cozy_workstation_definitions%rowtype;
  prior public.cozy_crafting_admin_audit_events%rowtype;
  before_state jsonb; after_state jsonb;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'crafting.content_manage');
  if p_workstation_definition_id is null or p_expected_configuration_revision<1
     or p_display_name is null or char_length(p_display_name) not between 1 and 80
     or p_display_name<>btrim(p_display_name) or p_display_name ~ '[[:cntrl:]<>]'
     or p_description is null or char_length(p_description) not between 1 and 280
     or p_description<>btrim(p_description) or p_description ~ '[[:cntrl:]<>]'
     or p_queue_capacity not between 1 and 8 or p_interaction_radius not between 1 and 4
     or p_enabled is null or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_WORKSTATION_UPDATE_REQUEST'; end if;
  select * into prior from public.cozy_crafting_admin_audit_events
  where administrator_user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.action_key<>'crafting.workstation_updated'
      then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_build_object('status','replayed','workstation',prior.after_state,'replayed',true);
  end if;
  select * into definition from public.cozy_workstation_definitions
  where id=p_workstation_definition_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if definition.configuration_revision<>p_expected_configuration_revision
    then return jsonb_build_object('status','state_conflict'); end if;
  before_state:=private.cozy_admin_workstation_json(definition);
  update public.cozy_workstation_definitions set
    display_name=p_display_name,description=p_description,
    queue_capacity=p_queue_capacity,interaction_radius=p_interaction_radius,
    enabled=p_enabled,configuration_revision=configuration_revision+1
  where id=definition.id returning * into definition;
  after_state:=private.cozy_admin_workstation_json(definition);
  insert into public.cozy_crafting_admin_audit_events(
    administrator_user_id,admin_session_id,action_key,target_id,
    before_state,after_state,reason,request_id
  ) values(p_user_id,trusted_session_id,'crafting.workstation_updated',definition.id,
    before_state,after_state,p_reason,p_request_id);
  return jsonb_build_object('status','updated','workstation',after_state,'replayed',false);
end;
$$;

create or replace function public.create_admin_recipe_successor(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_recipe_definition_id uuid,p_expected_version_id uuid,
  p_expected_configuration_revision integer,p_definition jsonb,
  p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare trusted_session_id uuid; active public.cozy_active_recipe_versions%rowtype;
  current_version public.cozy_recipe_versions%rowtype; successor public.cozy_recipe_versions%rowtype;
  prior public.cozy_crafting_admin_audit_events%rowtype;
  output_item public.cozy_item_definitions%rowtype; before_state jsonb; after_state jsonb;
  ingredients jsonb; next_version integer; invalid_count integer;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'crafting.content_manage');
  if p_recipe_definition_id is null or p_expected_version_id is null
     or p_expected_configuration_revision<1 or p_definition is null
     or jsonb_typeof(p_definition)<>'object'
     or (select array_agg(key order by key) from jsonb_object_keys(p_definition) key)
       <>array['description','discoveryPolicy','dustFee','enabled','ingredients',
         'localDurationSeconds','maximumBatchQuantity','name','outputItemId',
         'outputQuantity','productionDurationSeconds','repeatable','tutorialEligible',
         'unlockRule','workstationType']::text[]
     or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_RECIPE_SUCCESSOR_REQUEST'; end if;
  select * into prior from public.cozy_crafting_admin_audit_events
  where administrator_user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.action_key<>'crafting.recipe_successor_created'
      then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_build_object('status','replayed','recipe',prior.after_state,'replayed',true);
  end if;
  ingredients:=p_definition->'ingredients';
  if char_length(p_definition->>'name') not between 1 and 80
     or p_definition->>'name'<>btrim(p_definition->>'name')
     or p_definition->>'name' ~ '[[:cntrl:]<>]'
     or char_length(p_definition->>'description') not between 1 and 280
     or p_definition->>'description'<>btrim(p_definition->>'description')
     or p_definition->>'description' ~ '[[:cntrl:]<>]'
     or p_definition->>'workstationType' not in ('cooking_hearth','crafting_workbench')
     or p_definition->>'unlockRule' not in (
       'starter','phase11a_complete','phase11b_tutorial_accepted','phase11b_cooking_collected',
       'admin_grant_foundation','seasonal_foundation','level_foundation','skill_foundation'
     )
     or p_definition->>'discoveryPolicy' not in ('hidden','visible_locked','visible_requirement')
     or (p_definition->>'outputQuantity')::integer not between 1 and 10000
     or (p_definition->>'productionDurationSeconds')::integer not between 1 and 2592000
     or (p_definition->>'localDurationSeconds')::integer not between 1 and 3600
     or (p_definition->>'maximumBatchQuantity')::integer not between 1 and 99
     or (p_definition->>'dustFee')::bigint not between 0 and 9000000000000000
     or jsonb_typeof(ingredients)<>'array' or jsonb_array_length(ingredients) not between 1 and 12 then
    raise exception using errcode='22023',message='INVALID_RECIPE_SUCCESSOR_REQUEST'; end if;
  select count(*) into invalid_count from jsonb_array_elements(ingredients) ingredient
  where jsonb_typeof(ingredient)<>'object'
     or (select array_agg(key order by key) from jsonb_object_keys(ingredient) key)
       <>array['itemId','quantity']::text[];
  if invalid_count>0 then raise exception using errcode='22023',message='INVALID_RECIPE_SUCCESSOR_REQUEST'; end if;
  begin
    select count(*) into invalid_count
    from jsonb_to_recordset(ingredients) ingredient("itemId" uuid,quantity integer)
    left join public.cozy_item_definitions item on item.id=ingredient."itemId"
    where item.id is null or not item.active or ingredient.quantity not between 1 and 10000;
  exception when others then
    raise exception using errcode='22023',message='INVALID_RECIPE_SUCCESSOR_REQUEST';
  end;
  if invalid_count>0
     or (select count(distinct ingredient->>'itemId') from jsonb_array_elements(ingredients) ingredient)
       <>jsonb_array_length(ingredients) then
    raise exception using errcode='22023',message='INVALID_RECIPE_SUCCESSOR_REQUEST'; end if;
  select * into strict active from public.cozy_active_recipe_versions
  where recipe_definition_id=p_recipe_definition_id for update;
  if active.recipe_version_id<>p_expected_version_id
    then return jsonb_build_object('status','state_conflict'); end if;
  select * into strict current_version from public.cozy_recipe_versions
  where id=active.recipe_version_id;
  if current_version.configuration_revision<>p_expected_configuration_revision
    then return jsonb_build_object('status','state_conflict'); end if;
  if current_version.workstation_type<>p_definition->>'workstationType'
    then return jsonb_build_object('status','reference_conflict'); end if;
  select * into output_item from public.cozy_item_definitions
  where id=(p_definition->>'outputItemId')::uuid and active;
  if not found then return jsonb_build_object('status','reference_conflict'); end if;
  if output_item.id in (select (ingredient->>'itemId')::uuid from jsonb_array_elements(ingredients) ingredient)
    then return jsonb_build_object('status','reference_conflict'); end if;
  select coalesce(max(version_number),0)+1 into next_version
  from public.cozy_recipe_versions where recipe_definition_id=p_recipe_definition_id;
  before_state:=private.cozy_admin_recipe_version_json(current_version);
  insert into public.cozy_recipe_versions(
    id,recipe_definition_id,version_number,lifecycle_status,public_name,public_description,
    recipe_category,workstation_type,output_item_definition_id,output_quantity,
    production_duration_seconds,local_duration_seconds,dust_fee,unlock_rule,
    discovery_policy,tutorial_eligible,repeatable,maximum_batch_quantity,
    enabled,cancellation_policy,safe_metadata,configuration_revision,activated_at
  ) values(
    gen_random_uuid(),p_recipe_definition_id,next_version,'active',
    p_definition->>'name',p_definition->>'description',current_version.recipe_category,
    current_version.workstation_type,output_item.id,(p_definition->>'outputQuantity')::integer,
    (p_definition->>'productionDurationSeconds')::integer,
    (p_definition->>'localDurationSeconds')::integer,(p_definition->>'dustFee')::bigint,
    p_definition->>'unlockRule',p_definition->>'discoveryPolicy',
    (p_definition->>'tutorialEligible')::boolean,(p_definition->>'repeatable')::boolean,
    (p_definition->>'maximumBatchQuantity')::integer,(p_definition->>'enabled')::boolean,
    'disabled',jsonb_build_object('successorOf',current_version.id),
    current_version.configuration_revision+1,now()
  ) returning * into successor;
  insert into public.cozy_recipe_version_ingredients(
    recipe_version_id,item_definition_id,quantity,display_order
  ) select successor.id,ingredient."itemId",ingredient.quantity,
    row_number() over()::integer
  from jsonb_to_recordset(ingredients) ingredient("itemId" uuid,quantity integer);
  update public.cozy_active_recipe_versions set
    recipe_version_id=successor.id,activated_at=now()
  where recipe_definition_id=p_recipe_definition_id;
  after_state:=private.cozy_admin_recipe_version_json(successor);
  insert into public.cozy_crafting_admin_audit_events(
    administrator_user_id,admin_session_id,action_key,target_id,
    before_state,after_state,reason,request_id
  ) values(p_user_id,trusted_session_id,'crafting.recipe_successor_created',successor.id,
    before_state,after_state,p_reason,p_request_id);
  return jsonb_build_object('status','updated','recipe',after_state,'replayed',false);
end;
$$;

create or replace function public.request_admin_crafting_job_reconciliation(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_crafting_job_id uuid,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare trusted_session_id uuid; job public.player_crafting_jobs%rowtype;
  prior public.cozy_crafting_admin_audit_events%rowtype; queue_id uuid;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'crafting.job_reconcile');
  if p_crafting_job_id is null or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_CRAFTING_RECONCILIATION_REQUEST'; end if;
  select * into prior from public.cozy_crafting_admin_audit_events
  where administrator_user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.action_key<>'crafting.job_reconciliation_requested'
      then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_build_object('status','replayed','request',prior.after_state,'replayed',true);
  end if;
  select * into job from public.player_crafting_jobs where id=p_crafting_job_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  insert into public.cozy_crafting_reconciliation_queue(
    crafting_job_id,reconciliation_type
  ) values(job.id,case when job.status='running' and job.completes_at<=now()
      then 'persist_ready' else 'impossible_state' end)
  on conflict (crafting_job_id,reconciliation_type) do update set
    status='pending',available_at=now(),last_error_code=null
  returning id into queue_id;
  insert into public.cozy_crafting_admin_audit_events(
    administrator_user_id,admin_session_id,action_key,target_id,
    before_state,after_state,reason,request_id
  ) values(p_user_id,trusted_session_id,'crafting.job_reconciliation_requested',job.id,
    jsonb_build_object('status',job.status,'stateVersion',job.state_version),
    jsonb_build_object('queueId',queue_id,'status','pending'),p_reason,p_request_id);
  return jsonb_build_object('status','updated','request',
    jsonb_build_object('queueId',queue_id,'jobId',job.id,'status','pending'),'replayed',false);
end;
$$;

create or replace function public.reconcile_phase11b_crafting(
  p_limit integer,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare job public.player_crafting_jobs%rowtype; queue public.cozy_crafting_reconciliation_queue%rowtype;
  processed integer:=0; readied integer:=0; resolved integer:=0;
  failed integer:=0; manual_review integer:=0;
begin
  if p_limit not between 1 and 100 or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_CRAFTING_RECONCILIATION_REQUEST'; end if;
  for job in select * from public.player_crafting_jobs
    where status='running' and completes_at<=now()
    order by completes_at,id limit p_limit for update skip locked
  loop
    processed:=processed+1;
    update public.player_crafting_jobs set status='ready',state_version=state_version+1
    where id=job.id returning * into job;
    insert into public.cozy_crafting_job_events(
      player_profile_id,player_home_id,crafting_job_id,event_key,request_id,safe_payload
    ) values(job.player_profile_id,job.player_home_id,job.id,'job_ready',p_request_id,
      jsonb_build_object('recipeKey',job.recipe_key)) ;
    insert into public.cozy_private_plot_events(
      player_profile_id,player_home_id,event_key,target_id,payload
    ) values(job.player_profile_id,job.player_home_id,'crafting_job_ready',job.id,
      jsonb_build_object('recipeKey',job.recipe_key,'workstationInstanceId',job.workstation_instance_id));
    readied:=readied+1;
  end loop;
  for queue in select * from public.cozy_crafting_reconciliation_queue
    where status in ('pending','failed') and available_at<=now()
    order by available_at,id limit greatest(0,p_limit-processed) for update skip locked
  loop
    processed:=processed+1;
    update public.cozy_crafting_reconciliation_queue set
      status='processing',attempt_count=attempt_count+1 where id=queue.id;
    select * into job from public.player_crafting_jobs where id=queue.crafting_job_id for update;
    if queue.reconciliation_type='persist_ready'
       and job.status in ('ready','collected') then
      update public.cozy_crafting_reconciliation_queue set status='resolved',last_error_code=null
      where id=queue.id;
      resolved:=resolved+1;
    elsif queue.reconciliation_type='notification_retry'
       and job.status in ('ready','collected') then
      update public.cozy_crafting_reconciliation_queue set status='resolved',last_error_code=null
      where id=queue.id;
      resolved:=resolved+1;
    elsif queue.reconciliation_type in ('impossible_state','collection_settlement_review') then
      update public.cozy_crafting_reconciliation_queue set
        status='manual_review',last_error_code='MANUAL_REVIEW_REQUIRED'
      where id=queue.id;
      manual_review:=manual_review+1;
    else
      update public.cozy_crafting_reconciliation_queue set
        status='failed',last_error_code='RECONCILIATION_RETRY_REQUIRED',
        available_at=now()+interval '15 minutes' where id=queue.id;
      failed:=failed+1;
    end if;
  end loop;
  return jsonb_build_object(
    'status','completed','processed',processed,'readied',readied,
    'resolved',resolved,'failed',failed,'manualReview',manual_review,
    'perJobTimersScheduled',false
  );
end;
$$;

revoke all on function private.cozy_admin_recipe_version_json(public.cozy_recipe_versions) from public,anon,authenticated,service_role;
revoke all on function private.cozy_admin_workstation_json(public.cozy_workstation_definitions) from public,anon,authenticated,service_role;

revoke all on function public.get_admin_crafting_content(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_player_crafting(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.update_admin_crafting_live_ops(uuid,uuid,text,integer,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.update_admin_workstation_definition(uuid,uuid,text,uuid,integer,text,text,integer,numeric,boolean,text,text) from public,anon,authenticated,service_role;
revoke all on function public.create_admin_recipe_successor(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.request_admin_crafting_job_reconciliation(uuid,uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.reconcile_phase11b_crafting(integer,text) from public,anon,authenticated,service_role;

grant execute on function public.get_admin_crafting_content(uuid,uuid,text) to service_role;
grant execute on function public.get_admin_player_crafting(uuid,uuid,text,uuid) to service_role;
grant execute on function public.update_admin_crafting_live_ops(uuid,uuid,text,integer,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) to service_role;
grant execute on function public.update_admin_workstation_definition(uuid,uuid,text,uuid,integer,text,text,integer,numeric,boolean,text,text) to service_role;
grant execute on function public.create_admin_recipe_successor(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text) to service_role;
grant execute on function public.request_admin_crafting_job_reconciliation(uuid,uuid,text,uuid,text,text) to service_role;
grant execute on function public.reconcile_phase11b_crafting(integer,text) to service_role;
