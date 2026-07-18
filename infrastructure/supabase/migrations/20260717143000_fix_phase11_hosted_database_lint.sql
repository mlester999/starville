-- Forward-only repair for hosted PostgreSQL function-lint warnings found after Phase 11E.
-- Existing function signatures, authorization boundaries, and return contracts are preserved.
-- pg_column_size(any) is STABLE in PostgreSQL, so the input-only checklist validator must
-- be STABLE unless its size guard is removed. The guard is security-relevant and remains intact.

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
declare trusted_session_id uuid; active_recipe public.cozy_active_recipe_versions%rowtype;
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
  select active_pointer.* into strict active_recipe
  from public.cozy_active_recipe_versions as active_pointer
  where active_pointer.recipe_definition_id=p_recipe_definition_id for update;
  if active_recipe.recipe_version_id<>p_expected_version_id
    then return jsonb_build_object('status','state_conflict'); end if;
  select * into strict current_version from public.cozy_recipe_versions
  where id=active_recipe.recipe_version_id;
  if current_version.configuration_revision<>p_expected_configuration_revision
    then return jsonb_build_object('status','state_conflict'); end if;
  if current_version.workstation_type<>p_definition->>'workstationType'
    then return jsonb_build_object('status','reference_conflict'); end if;
  select item_definition.* into output_item
  from public.cozy_item_definitions as item_definition
  where item_definition.id=(p_definition->>'outputItemId')::uuid
    and item_definition.active;
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

create or replace function public.transition_admin_progression_version(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_kind text,
  p_version_id uuid,p_expected_revision integer,p_action text,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; permission_key text; current_status text; target_definition_id uuid;
  active_id uuid; selected_revision integer; before_value jsonb;
begin
  permission_key:=case p_kind when 'skill' then 'progression.skills.manage'
    when 'xp_rule' then 'progression.xp_rules.manage' when 'unlock' then 'progression.unlocks.manage'
    when 'quest_chain' then 'progression.quests.manage' when 'achievement' then 'progression.achievements.manage'
    else null end;
  if permission_key is null or p_action not in ('validate','activate') or p_expected_revision<1
     or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='SKILL_CONFIGURATION_INVALID'; end if;
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,permission_key);
  if p_kind='skill' then
    select skill_version.lifecycle_status,skill_version.skill_definition_id,
        skill_version.configuration_revision,to_jsonb(skill_version)
      into current_status,target_definition_id,selected_revision,before_value
      from public.progression_skill_versions as skill_version
      where skill_version.id=p_version_id for update;
  elsif p_kind='xp_rule' then
    select xp_rule_version.lifecycle_status,xp_rule_version.id,
        xp_rule_version.configuration_revision,to_jsonb(xp_rule_version)
      into current_status,target_definition_id,selected_revision,before_value
      from public.progression_xp_rule_versions as xp_rule_version
      where xp_rule_version.id=p_version_id for update;
  elsif p_kind='unlock' then
    select unlock_version.lifecycle_status,unlock_version.unlock_definition_id,
        unlock_version.configuration_revision,to_jsonb(unlock_version)
      into current_status,target_definition_id,selected_revision,before_value
      from public.progression_unlock_versions as unlock_version
      where unlock_version.id=p_version_id for update;
  elsif p_kind='quest_chain' then
    select quest_chain_version.lifecycle_status,quest_chain_version.quest_chain_id,
        quest_chain_version.configuration_revision,to_jsonb(quest_chain_version)
      into current_status,target_definition_id,selected_revision,before_value
      from public.progression_quest_chain_versions as quest_chain_version
      where quest_chain_version.id=p_version_id for update;
  else
    select achievement_version.lifecycle_status,achievement_version.achievement_definition_id,
        achievement_version.configuration_revision,to_jsonb(achievement_version)
      into current_status,target_definition_id,selected_revision,before_value
      from public.progression_achievement_versions as achievement_version
      where achievement_version.id=p_version_id for update;
  end if;
  if current_status is null then return jsonb_build_object('status','not_found'); end if;
  if selected_revision<>p_expected_revision then return jsonb_build_object('status','progression_conflict'); end if;
  if p_action='validate' then
    if current_status='validated' then return jsonb_build_object('status','replayed','versionId',p_version_id); end if;
    if current_status<>'draft' then return jsonb_build_object('status','immutable_version'); end if;
    if p_kind='skill' then update public.progression_skill_versions set lifecycle_status='validated',configuration_revision=configuration_revision+1 where id=p_version_id;
    elsif p_kind='xp_rule' then update public.progression_xp_rule_versions set lifecycle_status='validated',configuration_revision=configuration_revision+1 where id=p_version_id;
    elsif p_kind='unlock' then update public.progression_unlock_versions set lifecycle_status='validated',configuration_revision=configuration_revision+1 where id=p_version_id;
    elsif p_kind='quest_chain' then update public.progression_quest_chain_versions set lifecycle_status='validated',configuration_revision=configuration_revision+1 where id=p_version_id;
    else update public.progression_achievement_versions set lifecycle_status='validated',configuration_revision=configuration_revision+1 where id=p_version_id; end if;
    perform private.progression_admin_audit(p_user_id,trusted_session_id,'version_validated',p_kind,
      p_version_id,p_reason,before_value,jsonb_build_object('status','validated'),p_request_id);
    return jsonb_build_object('status','validated','versionId',p_version_id,'revision',selected_revision+1);
  end if;
  if current_status<>'validated' then return jsonb_build_object('status','validation_required'); end if;
  if p_kind='skill' then
    select skill_version_id into active_id from public.progression_active_skill_versions where skill_definition_id=target_definition_id for update;
    update public.progression_skill_versions set lifecycle_status='superseded' where id=active_id;
    update public.progression_skill_versions set lifecycle_status='active',activated_at=now(),configuration_revision=configuration_revision+1 where id=p_version_id;
    update public.progression_active_skill_versions set skill_version_id=p_version_id,activated_at=now() where skill_definition_id=target_definition_id;
  elsif p_kind='xp_rule' then
    select active.xp_rule_version_id into active_id from public.progression_active_xp_rules active
      join public.progression_xp_rule_versions version on version.id=active.xp_rule_version_id
      where version.rule_key=(select rule_key from public.progression_xp_rule_versions where id=p_version_id) for update of active;
    update public.progression_xp_rule_versions set lifecycle_status='superseded' where id=active_id;
    update public.progression_xp_rule_versions set lifecycle_status='active',activated_at=now(),configuration_revision=configuration_revision+1 where id=p_version_id;
    update public.progression_active_xp_rules set xp_rule_version_id=p_version_id,activated_at=now()
      where xp_rule_version_id=active_id;
  elsif p_kind='unlock' then
    select unlock_version_id into active_id from public.progression_active_unlock_versions where unlock_definition_id=target_definition_id for update;
    update public.progression_unlock_versions set lifecycle_status='superseded' where id=active_id;
    update public.progression_unlock_versions set lifecycle_status='active',activated_at=now(),configuration_revision=configuration_revision+1 where id=p_version_id;
    update public.progression_active_unlock_versions set unlock_version_id=p_version_id,activated_at=now() where unlock_definition_id=target_definition_id;
  elsif p_kind='quest_chain' then
    select quest_chain_version_id into active_id from public.progression_active_quest_chain_versions where quest_chain_id=target_definition_id for update;
    update public.progression_quest_chain_versions set lifecycle_status='superseded' where id=active_id;
    update public.progression_quest_chain_versions set lifecycle_status='active',activated_at=now(),configuration_revision=configuration_revision+1 where id=p_version_id;
    update public.progression_active_quest_chain_versions set quest_chain_version_id=p_version_id,activated_at=now() where quest_chain_id=target_definition_id;
  else
    select achievement_version_id into active_id from public.progression_active_achievement_versions where achievement_definition_id=target_definition_id for update;
    update public.progression_achievement_versions set lifecycle_status='superseded' where id=active_id;
    update public.progression_achievement_versions set lifecycle_status='active',activated_at=now(),configuration_revision=configuration_revision+1 where id=p_version_id;
    update public.progression_active_achievement_versions set achievement_version_id=p_version_id,activated_at=now() where achievement_definition_id=target_definition_id;
  end if;
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'version_activated',p_kind,
    p_version_id,p_reason,before_value,jsonb_build_object('status','active','priorVersionId',active_id),p_request_id);
  return jsonb_build_object('status','activated','versionId',p_version_id,'priorVersionId',active_id,'revision',selected_revision+1);
end;
$$;

create or replace function public.request_admin_progression_correction(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_player_wallet text,
  p_skill_definition_id uuid,p_delta integer,p_expected_revision integer,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; player_id uuid; current_xp bigint; prior_level integer;
  curve_id uuid; projected jsonb; correction_id uuid;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'progression.corrections.manage');
  if p_player_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' or p_delta=0 or p_delta not between -10000 and 10000
     or p_expected_revision<1 or p_reason is null or char_length(p_reason) not between 20 and 1000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_CORRECTION'; end if;
  if not private.claim_progression_admin_rate_limit(p_user_id,'player_write',10) then
    return jsonb_build_object('status','rate_limited'); end if;
  select id into player_id from public.player_profiles where wallet_address=p_player_wallet;
  if player_id is null then return jsonb_build_object('status','progression_not_found'); end if;
  perform private.ensure_player_progression(player_id);
  if p_skill_definition_id is null then
    select level_progress.total_xp,level_progress.current_level,level_progress.curve_version_id
      into current_xp,prior_level,curve_id
      from public.player_level_progress as level_progress
      where level_progress.player_profile_id=player_id;
  else
    select progress.total_xp,progress.current_level,version.curve_version_id
      into current_xp,prior_level,curve_id
      from public.player_skill_progress progress join public.progression_skill_versions version on version.id=progress.skill_version_id
      where progress.player_profile_id=player_id and progress.skill_definition_id=p_skill_definition_id;
  end if;
  if current_xp is null then return jsonb_build_object('status','skill_not_found'); end if;
  if current_xp+p_delta<0 then return jsonb_build_object('status','xp_amount_invalid'); end if;
  projected:=private.progression_level_state(curve_id,current_xp+p_delta);
  insert into public.progression_corrections(
    player_profile_id,skill_definition_id,requested_delta,status,expected_progression_revision,
    reason,requested_by,admin_session_id,impact_preview,request_id
  ) values(player_id,p_skill_definition_id,p_delta,'previewed',p_expected_revision,p_reason,p_user_id,
    trusted_session_id,jsonb_build_object('previousXp',current_xp,'resultingXp',current_xp+p_delta,
      'previousLevel',prior_level,'resultingLevel',(projected->>'level')::integer,
      'unlockImpact','grants_reconciled_no_automatic_revocation','rewardWarning','no_historical_reward_revocation'),p_request_id)
  returning id into correction_id;
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'correction_requested','player',
    player_id,p_reason,'{}',jsonb_build_object('correctionId',correction_id,'delta',p_delta,'impact',projected),p_request_id);
  return jsonb_build_object('status','previewed','correctionId',correction_id,
    'impact',jsonb_build_object('previousXp',current_xp,'resultingXp',current_xp+p_delta,
      'previousLevel',prior_level,'resultingLevel',(projected->>'level')::integer,
      'unlockPolicy','permanent-grandfathering'));
end;
$$;

create or replace function public.run_progression_maintenance(
  p_limit integer,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare reward_row record; queue_row record; reward_count integer:=0; resolved_count integer:=0;
  investigation_count integer:=0;
begin
  if p_limit not between 1 and 500 or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_MAINTENANCE'; end if;
  update public.progression_live_ops set multiplier=1,multiplier_starts_at=null,multiplier_ends_at=null,
    configuration_revision=configuration_revision+1
    where singleton_key and multiplier<>1 and multiplier_ends_at<=now();
  for reward_row in select id from public.player_progression_rewards
    where status in ('pending','blocked') and coalesce(next_attempt_at,created_at)<=now()
    order by created_at for update skip locked limit p_limit
  loop
    perform private.progression_settle_reward(
      reward_row.id,p_request_id||':reward:'||reward_row.id::text
    );
    reward_count:=reward_count+1;
  end loop;
  for queue_row in select * from public.progression_reconciliation_queue
    where status='pending' and available_at<=now() order by priority desc,created_at
    for update skip locked limit p_limit
  loop
    update public.progression_reconciliation_queue set status='processing',locked_at=now(),attempt_count=attempt_count+1
      where id=queue_row.id;
    begin
      if queue_row.player_profile_id is not null then
        perform private.ensure_player_progression(queue_row.player_profile_id);
        perform private.progression_apply_unlocks(queue_row.player_profile_id,'reconciliation',queue_row.id);
      end if;
      update public.progression_reconciliation_queue set status='resolved',resolved_at=now(),
        finding_code=null,evidence=evidence||jsonb_build_object('checkedAt',now(),'automaticCorrections','safe_projection_only')
        where id=queue_row.id;
      resolved_count:=resolved_count+1;
    exception when others then
      update public.progression_reconciliation_queue set status='investigation',finding_code='RECONCILIATION_REQUIRES_REVIEW',
        evidence=evidence||jsonb_build_object('checkedAt',now(),'safeError','projection_check_failed') where id=queue_row.id;
      investigation_count:=investigation_count+1;
    end;
  end loop;
  return jsonb_build_object('status','processed','rewardsProcessed',reward_count,
    'reconciliationResolved',resolved_count,'manualReview',investigation_count,
    'automaticXpCorrections',0,'requestId',p_request_id);
end;
$$;

create or replace function private.world_game_test_checklist_valid(p_checklist jsonb)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  item_count integer;
begin
  if p_checklist is null
     or jsonb_typeof(p_checklist) <> 'object'
     or pg_column_size(p_checklist) > 4096 then
    return false;
  end if;
  select count(*) into item_count from jsonb_object_keys(p_checklist);
  if item_count not between 1 and 20 then
    return false;
  end if;
  return not exists (
    select 1
    from jsonb_each(p_checklist) as item
    where item.key !~ '^[a-z][a-z0-9_]{1,62}$'
      or jsonb_typeof(item.value) <> 'boolean'
  );
end;
$$;

create or replace function private.progression_apply_objective_event(
  p_player_profile_id uuid,
  p_source_event_key text,
  p_source_entity_id uuid,
  p_target_reference_id uuid,
  p_target_reference_key text,
  p_quantity integer,
  p_dust_amount bigint,
  p_request_id text
)
returns integer
language plpgsql
volatile
security definer
set search_path=''
as $$
declare objective record; increment_value integer; updated_count integer:=0;
  progress public.player_quest_objective_progress%rowtype;
begin
  for objective in
    select instance.id as instance_id,instance.player_profile_id,definition.slug,
      objective_row.id as objective_id,objective_row.objective_key,objective_row.required_count,
      objective_row.target_reference_id,objective_row.target_reference_key
    from public.player_quest_instances instance
    join public.cozy_quest_versions version on version.id=instance.quest_version_id
    join public.cozy_quest_definitions definition on definition.id=instance.quest_definition_id
    join public.cozy_quest_objectives objective_row on objective_row.quest_version_id=version.id
    where instance.player_profile_id=p_player_profile_id and instance.status='active'
      and version.quest_kind='progression_chapter'
      and (
        (p_source_event_key='skill_level_reached' and objective_row.objective_key='reach_skill_level')
        or (p_source_event_key='player_level_reached' and objective_row.objective_key='reach_player_level')
        or (p_source_event_key='crop_harvested' and objective_row.objective_key='harvest_crop')
        or (p_source_event_key='crop_planted' and objective_row.objective_key='plant_crops')
        or (p_source_event_key='cooking_job_collected' and objective_row.objective_key='collect_cooking_recipe')
        or (p_source_event_key='crafting_job_collected' and objective_row.objective_key='collect_crafting_recipe')
        or (p_source_event_key='shop_purchase_completed' and objective_row.objective_key='buy_shop_item')
        or (p_source_event_key='shop_sale_completed' and objective_row.objective_key in ('sell_shop_item','earn_dust_from_shop_sales'))
        or (p_source_event_key='unlock_granted' and objective_row.objective_key='own_unlock')
        or (p_source_event_key='achievement_completed' and objective_row.objective_key='complete_achievement')
        or (p_source_event_key='npc_interacted' and objective_row.objective_key='interact_with_npc')
        or (p_source_event_key='world_visited' and objective_row.objective_key='visit_world')
        or (p_source_event_key='quest_completed' and objective_row.objective_key='complete_quest')
      )
      and (objective_row.target_reference_id is null or objective_row.target_reference_id=p_target_reference_id)
      and (objective_row.target_reference_key is null or objective_row.target_reference_key=p_target_reference_key)
    order by instance.accepted_at,objective_row.sequence_number
  loop
    increment_value:=case objective.objective_key
      when 'reach_skill_level' then greatest(0,coalesce(p_quantity,0))
      when 'reach_player_level' then greatest(0,coalesce(p_quantity,0))
      when 'earn_dust_from_shop_sales' then least(10000,greatest(0,coalesce(p_dust_amount,0))::integer)
      else 1 end;
    if increment_value=0 then continue; end if;

    update public.player_quest_objective_progress set
      current_count=case
        when objective.objective_key in ('reach_skill_level','reach_player_level')
          then least(objective.required_count,greatest(current_count,increment_value))
        else least(objective.required_count,current_count+increment_value) end,
      completed_at=case
        when (case when objective.objective_key in ('reach_skill_level','reach_player_level')
          then greatest(current_count,increment_value) else current_count+increment_value end)>=objective.required_count
          then coalesce(completed_at,now()) else completed_at end,
      state_version=state_version+1
    where player_quest_instance_id=objective.instance_id
      and quest_objective_id=objective.objective_id
      and current_count<objective.required_count
    returning * into progress;
    if not found then continue; end if;
    updated_count:=updated_count+1;
    update public.player_quest_instances set state_version=state_version+1
    where id=objective.instance_id;
    insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
    values(
      p_player_profile_id,'quest_progressed',objective.instance_id,
      jsonb_build_object('questSlug',objective.slug,'objectiveKey',objective.objective_key,
        'currentCount',progress.current_count,'requiredCount',objective.required_count,
        'sourceEntityId',p_source_entity_id,'requestId',p_request_id)
    );
  end loop;
  return updated_count;
end;
$$;

create or replace function private.progression_grant_trusted_xp(
  p_player_profile_id uuid,
  p_rule_key text,
  p_source_entity_id uuid,
  p_source_table text,
  p_quantity integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare definition public.progression_skill_definitions%rowtype;
  skill_version public.progression_skill_versions%rowtype;
  rule public.progression_xp_rule_versions%rowtype;
  progress public.player_skill_progress%rowtype;
  player_progress public.player_level_progress%rowtype;
  live_ops public.progression_live_ops%rowtype;
  skill_state jsonb; player_state jsonb; event public.progression_xp_events%rowtype;
  raw_xp integer; awarded_xp integer; player_xp integer;
  prior_level integer; next_level integer; prior_player_level integer; next_player_level integer;
  multiplier numeric:=1; daily_xp bigint;
begin
  if p_player_profile_id is null or p_rule_key is null or p_source_entity_id is null
     or p_source_table not in ('cozy_private_plot_events','player_quest_instances','progression_corrections')
     or p_quantity is null or p_quantity not between 1 and 10000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='XP_SOURCE_INVALID';
  end if;
  perform private.ensure_player_progression(p_player_profile_id);
  select rule_row.* into rule from public.progression_active_xp_rules active
  join public.progression_xp_rule_versions rule_row on rule_row.id=active.xp_rule_version_id
  where active.rule_key=p_rule_key and rule_row.lifecycle_status='active' and rule_row.enabled;
  if not found then return jsonb_build_object('status','xp_rule_disabled'); end if;
  select * into strict live_ops from public.progression_live_ops where singleton_key;
  if not live_ops.xp_grants_enabled then return jsonb_build_object('status','progression_disabled'); end if;

  if rule.skill_definition_id is null then
    select * into player_progress from public.player_level_progress
    where player_profile_id=p_player_profile_id for update;
    select * into event from public.progression_xp_events
    where player_profile_id=p_player_profile_id and source_event_key=rule.source_event_key
      and source_entity_id=p_source_entity_id and skill_definition_id is null;
    if found then return jsonb_build_object('status','replayed','eventId',event.id,'playerLevel',event.resulting_level); end if;
    raw_xp:=least(rule.event_xp_cap,rule.base_xp+rule.per_unit_xp*p_quantity);
    awarded_xp:=raw_xp;
    prior_player_level:=player_progress.current_level;
    player_state:=private.progression_level_state(player_progress.curve_version_id,player_progress.total_xp+awarded_xp);
    next_player_level:=(player_state->>'level')::integer;
    insert into public.progression_xp_events(
      player_profile_id,skill_definition_id,xp_rule_version_id,xp_delta,player_xp_delta,
      previous_total_xp,resulting_total_xp,previous_level,resulting_level,
      source_event_key,source_entity_id,source_table,request_id,idempotency_key,safe_metadata
    ) values(
      p_player_profile_id,null,rule.id,awarded_xp,awarded_xp,
      player_progress.total_xp,player_progress.total_xp+awarded_xp,
      prior_player_level,next_player_level,rule.source_event_key,p_source_entity_id,p_source_table,
      p_request_id,'progression-xp:'||rule.rule_key||':'||p_source_entity_id::text,
      jsonb_build_object('quantity',p_quantity,'multiplier',1)
    ) returning * into event;
    update public.player_level_progress set total_xp=total_xp+awarded_xp,
      milestone_xp=milestone_xp+awarded_xp,current_level=next_player_level,
      xp_in_level=(player_state->>'xpInLevel')::bigint,
      xp_for_next_level=(player_state->>'xpForNextLevel')::bigint,
      progression_revision=progression_revision+1,last_xp_event_at=now()
    where player_profile_id=p_player_profile_id;
    update public.player_profiles set public_level=next_player_level where id=p_player_profile_id;
    if next_player_level>prior_player_level then
      for direct_player_level_cursor in prior_player_level+1..next_player_level loop
        insert into public.progression_level_up_events(
          player_profile_id,xp_event_id,level_type,previous_level,reached_level
        ) values(p_player_profile_id,event.id,'player',direct_player_level_cursor-1,direct_player_level_cursor) on conflict do nothing;
        insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
        values(p_player_profile_id,'player_level_up',event.id,jsonb_build_object('level',direct_player_level_cursor));
      end loop;
      perform private.progression_apply_objective_event(
        p_player_profile_id,'player_level_reached',event.id,null,'player-level',next_player_level,0,p_request_id
      );
    end if;
    perform private.progression_apply_unlocks(p_player_profile_id,'player_level',event.id);
    return jsonb_build_object('status','granted','eventId',event.id,'xp',awarded_xp,'playerLevel',next_player_level);
  end if;

  select * into strict definition from public.progression_skill_definitions
  where id=rule.skill_definition_id;
  if not definition.enabled or not definition.released
     or (definition.skill_key='farming' and not live_ops.farming_xp_enabled)
     or (definition.skill_key='cooking' and not live_ops.cooking_xp_enabled)
     or (definition.skill_key='crafting' and not live_ops.crafting_xp_enabled) then
    return jsonb_build_object('status','skill_disabled');
  end if;
  select version.* into strict skill_version
  from public.progression_active_skill_versions active
  join public.progression_skill_versions version on version.id=active.skill_version_id
  where active.skill_definition_id=definition.id;
  select * into progress from public.player_skill_progress
  where player_profile_id=p_player_profile_id and skill_definition_id=definition.id for update;
  select * into player_progress from public.player_level_progress
  where player_profile_id=p_player_profile_id for update;
  select * into event from public.progression_xp_events
  where player_profile_id=p_player_profile_id and source_event_key=rule.source_event_key
    and source_entity_id=p_source_entity_id and skill_definition_id=definition.id;
  if found then return jsonb_build_object(
    'status','replayed','eventId',event.id,'skillKey',definition.skill_key,
    'xp',event.xp_delta,'skillLevel',event.resulting_level,'playerLevel',player_progress.current_level
  ); end if;

  if live_ops.multiplier<>1 and now()>=live_ops.multiplier_starts_at and now()<live_ops.multiplier_ends_at then
    multiplier:=live_ops.multiplier;
  end if;
  raw_xp:=least(rule.event_xp_cap,rule.base_xp+rule.per_unit_xp*p_quantity);
  awarded_xp:=least(rule.event_xp_cap,floor(raw_xp*multiplier)::integer);
  if awarded_xp<1 then return jsonb_build_object('status','xp_amount_invalid'); end if;
  player_xp:=floor(awarded_xp*0.5)::integer;
  prior_level:=progress.current_level;
  skill_state:=private.progression_level_state(skill_version.curve_version_id,progress.total_xp+awarded_xp);
  next_level:=(skill_state->>'level')::integer;
  prior_player_level:=player_progress.current_level;
  player_state:=private.progression_level_state(player_progress.curve_version_id,player_progress.total_xp+player_xp);
  next_player_level:=(player_state->>'level')::integer;

  insert into public.progression_xp_events(
    player_profile_id,skill_definition_id,xp_rule_version_id,xp_delta,player_xp_delta,
    previous_total_xp,resulting_total_xp,previous_level,resulting_level,
    source_event_key,source_entity_id,source_table,request_id,idempotency_key,safe_metadata
  ) values(
    p_player_profile_id,definition.id,rule.id,awarded_xp,player_xp,
    progress.total_xp,progress.total_xp+awarded_xp,prior_level,next_level,
    rule.source_event_key,p_source_entity_id,p_source_table,p_request_id,
    'progression-xp:'||rule.rule_key||':'||p_source_entity_id::text,
    jsonb_build_object('quantity',p_quantity,'baseXp',raw_xp,'multiplier',multiplier)
  ) returning * into event;

  update public.player_skill_progress set skill_version_id=skill_version.id,
    total_xp=total_xp+awarded_xp,current_level=next_level,
    xp_in_level=(skill_state->>'xpInLevel')::bigint,
    xp_for_next_level=(skill_state->>'xpForNextLevel')::bigint,
    progression_revision=progression_revision+1,last_xp_event_at=now()
  where player_profile_id=p_player_profile_id and skill_definition_id=definition.id;
  update public.player_level_progress set total_xp=total_xp+player_xp,
    skill_contribution_xp=skill_contribution_xp+player_xp,current_level=next_player_level,
    xp_in_level=(player_state->>'xpInLevel')::bigint,
    xp_for_next_level=(player_state->>'xpForNextLevel')::bigint,
    progression_revision=progression_revision+1,last_xp_event_at=now()
  where player_profile_id=p_player_profile_id;
  update public.player_profiles set public_level=next_player_level where id=p_player_profile_id;

  insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
  values(p_player_profile_id,'skill_xp_gained',event.id,
    jsonb_build_object('skillKey',definition.skill_key,'xp',awarded_xp,'totalXp',progress.total_xp+awarded_xp,
      'level',next_level,'multiplier',multiplier));
  if next_level>prior_level then
    for skill_level_cursor in prior_level+1..next_level loop
      insert into public.progression_level_up_events(
        player_profile_id,xp_event_id,level_type,skill_definition_id,previous_level,reached_level
      ) values(p_player_profile_id,event.id,'skill',definition.id,skill_level_cursor-1,skill_level_cursor) on conflict do nothing;
      insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
      values(p_player_profile_id,'skill_level_up',event.id,
        jsonb_build_object('skillKey',definition.skill_key,'displayName',definition.display_name,'level',skill_level_cursor));
    end loop;
    perform private.progression_apply_objective_event(
      p_player_profile_id,'skill_level_reached',event.id,definition.id,definition.skill_key,next_level,0,p_request_id
    );
  end if;
  if next_player_level>prior_player_level then
    for contribution_player_level_cursor in prior_player_level+1..next_player_level loop
      insert into public.progression_level_up_events(
        player_profile_id,xp_event_id,level_type,previous_level,reached_level
      ) values(p_player_profile_id,event.id,'player',contribution_player_level_cursor-1,contribution_player_level_cursor) on conflict do nothing;
      insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
      values(p_player_profile_id,'player_level_up',event.id,jsonb_build_object('level',contribution_player_level_cursor));
    end loop;
    perform private.progression_apply_objective_event(
      p_player_profile_id,'player_level_reached',event.id,null,'player-level',next_player_level,0,p_request_id
    );
  end if;
  perform private.progression_apply_unlocks(
    p_player_profile_id,case when next_level>prior_level then 'skill_level' else 'player_level' end,event.id
  );
  perform private.progression_evaluate_achievements(
    p_player_profile_id,'skill_level_reached',event.id,definition.id,definition.skill_key,next_level,0,p_request_id
  );

  select coalesce(sum(history.xp_delta),0) into daily_xp
  from public.progression_xp_events history
  where history.player_profile_id=p_player_profile_id and history.skill_definition_id=definition.id
    and history.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if rule.daily_warning_threshold is not null and daily_xp>rule.daily_warning_threshold
     and not exists(select 1 from public.progression_reconciliation_queue queue
       where queue.player_profile_id=p_player_profile_id and queue.reconciliation_type='velocity'
         and queue.status in ('pending','processing')) then
    insert into public.progression_reconciliation_queue(
      player_profile_id,reconciliation_type,priority,request_id,evidence
    ) values(p_player_profile_id,'velocity',70,p_request_id,
      jsonb_build_object('skillKey',definition.skill_key,'dailyXp',daily_xp,'warningThreshold',rule.daily_warning_threshold));
  end if;

  return jsonb_build_object(
    'status','granted','eventId',event.id,'skillKey',definition.skill_key,'xp',awarded_xp,
    'skillLevel',next_level,'playerXp',player_xp,'playerLevel',next_player_level,
    'skillLevelsGained',next_level-prior_level,'playerLevelsGained',next_player_level-prior_player_level
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
        'sourceEntityId',p_source_entity_id,'requestId',p_request_id
      ));
    end if;
  end loop;
  return updated_count;
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
  selected record; home public.player_homes%rowtype;
  head public.home_layout_heads%rowtype; inventory public.player_inventory_state%rowtype;
  storage public.home_storage_containers%rowtype; live_ops public.housing_live_ops%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; validation jsonb; entry jsonb;
  definition public.cozy_furniture_definitions%rowtype;
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


revoke all on function public.create_admin_recipe_successor(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_admin_recipe_successor(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text)
  to service_role;

revoke all on function public.transition_admin_progression_version(uuid,uuid,text,text,uuid,integer,text,text,text)
  from public,anon,authenticated;
grant execute on function public.transition_admin_progression_version(uuid,uuid,text,text,uuid,integer,text,text,text)
  to service_role;

revoke all on function public.request_admin_progression_correction(uuid,uuid,text,text,uuid,integer,integer,text,text)
  from public,anon,authenticated;
grant execute on function public.request_admin_progression_correction(uuid,uuid,text,text,uuid,integer,integer,text,text)
  to service_role;

revoke all on function public.run_progression_maintenance(integer,text)
  from public,anon,authenticated;
grant execute on function public.run_progression_maintenance(integer,text)
  to service_role;

revoke all on function private.world_game_test_checklist_valid(jsonb)
  from public,anon,authenticated,service_role;
revoke all on function private.progression_apply_objective_event(uuid,text,uuid,uuid,text,integer,bigint,text)
  from public,anon,authenticated,service_role;
revoke all on function private.progression_grant_trusted_xp(uuid,text,uuid,text,integer,text)
  from public,anon,authenticated,service_role;
revoke all on function private.housing_progress_event(uuid,text,uuid,text,text)
  from public,anon,authenticated,service_role;

revoke all on function public.save_player_home_layout(text,uuid,integer,integer,integer,integer,integer,jsonb,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.save_player_home_layout(text,uuid,integer,integer,integer,integer,integer,jsonb,uuid,text,text)
  to service_role;

