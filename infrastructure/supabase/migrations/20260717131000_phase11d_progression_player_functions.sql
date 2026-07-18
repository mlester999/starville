-- Starville Phase 11D player progression authority and trusted-event adapters.

create or replace function private.claim_cozy_gameplay_rate_limit(
  p_player_profile_id uuid,p_scope text,p_limit integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path=''
as $$
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
       'title_write','progression_event_read'
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

create or replace function private.progression_level_for_xp(
  p_curve_version_id uuid,
  p_total_xp bigint
)
returns integer
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(max(threshold.level),1)::integer
  from public.progression_curve_thresholds threshold
  where threshold.curve_version_id=p_curve_version_id
    and threshold.cumulative_xp<=p_total_xp;
$$;

create or replace function private.progression_level_state(
  p_curve_version_id uuid,
  p_total_xp bigint
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  with current_threshold as (
    select threshold.level,threshold.cumulative_xp
    from public.progression_curve_thresholds threshold
    where threshold.curve_version_id=p_curve_version_id
      and threshold.cumulative_xp<=p_total_xp
    order by threshold.level desc limit 1
  ), next_threshold as (
    select threshold.cumulative_xp
    from public.progression_curve_thresholds threshold,current_threshold current
    where threshold.curve_version_id=p_curve_version_id
      and threshold.level=current.level+1
  )
  select jsonb_build_object(
    'level',current.level,
    'xpInLevel',p_total_xp-current.cumulative_xp,
    'xpForNextLevel',case when next.cumulative_xp is null then null
      else next.cumulative_xp-current.cumulative_xp end,
    'nextLevelTotalXp',next.cumulative_xp
  )
  from current_threshold current
  left join next_threshold next on true;
$$;

create or replace function private.ensure_player_progression(p_player_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path=''
as $$
declare player_curve public.progression_curve_versions%rowtype;
begin
  if p_player_profile_id is null or not exists(
    select 1 from public.player_profiles profile where profile.id=p_player_profile_id
  ) then
    raise exception using errcode='22023',message='PROGRESSION_NOT_FOUND';
  end if;

  select curve.* into strict player_curve
  from public.progression_active_curve_versions active
  join public.progression_curve_versions curve on curve.id=active.curve_version_id
  where active.curve_key='starter-player-curve';

  insert into public.player_level_progress(
    player_profile_id,curve_version_id,total_xp,skill_contribution_xp,milestone_xp,
    current_level,xp_in_level,xp_for_next_level
  )
  select p_player_profile_id,player_curve.id,0,0,0,1,0,
    (select cumulative_xp from public.progression_curve_thresholds
      where curve_version_id=player_curve.id and level=2)
  on conflict(player_profile_id) do nothing;

  insert into public.player_skill_progress(
    player_profile_id,skill_definition_id,skill_version_id,total_xp,current_level,
    xp_in_level,xp_for_next_level,safe_metadata
  )
  select p_player_profile_id,definition.id,version.id,0,1,0,
    (select cumulative_xp from public.progression_curve_thresholds
      where curve_version_id=version.curve_version_id and level=2),
    jsonb_build_object('skillKey',definition.skill_key)
  from public.progression_skill_definitions definition
  join public.progression_active_skill_versions active on active.skill_definition_id=definition.id
  join public.progression_skill_versions version on version.id=active.skill_version_id
  where definition.enabled and definition.released
  on conflict(player_profile_id,skill_definition_id) do nothing;

  insert into public.player_achievement_progress(
    player_profile_id,achievement_definition_id,achievement_version_id,
    current_progress,target_value,status
  )
  select p_player_profile_id,definition.id,version.id,0,version.target_value,'in_progress'
  from public.progression_achievement_definitions definition
  join public.progression_active_achievement_versions active
    on active.achievement_definition_id=definition.id
  join public.progression_achievement_versions version on version.id=active.achievement_version_id
  where definition.enabled
  on conflict(player_profile_id,achievement_definition_id) do nothing;

  insert into public.player_progression_preferences(player_profile_id)
  values(p_player_profile_id) on conflict(player_profile_id) do nothing;

  insert into public.player_progression_titles(
    player_profile_id,title_id,source_type,source_reference_id
  ) values(
    p_player_profile_id,'d1100000-0000-4000-8000-000000000601',
    'unlock','d1100000-0000-4000-8000-000000000601'
  ) on conflict do nothing;
end;
$$;

create or replace function private.progression_unlock_requirement_met(
  p_player_profile_id uuid,
  p_version public.progression_unlock_versions
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    (p_version.required_skill_definition_id is null or exists(
      select 1 from public.player_skill_progress progress
      where progress.player_profile_id=p_player_profile_id
        and progress.skill_definition_id=p_version.required_skill_definition_id
        and progress.current_level>=p_version.required_skill_level
    ))
    and (p_version.required_player_level is null or exists(
      select 1 from public.player_level_progress progress
      where progress.player_profile_id=p_player_profile_id
        and progress.current_level>=p_version.required_player_level
    ))
    and (p_version.required_quest_definition_id is null or exists(
      select 1 from public.player_quest_instances instance
      where instance.player_profile_id=p_player_profile_id
        and instance.quest_definition_id=p_version.required_quest_definition_id
        and instance.status='reward_claimed'
    ))
    and (p_version.required_achievement_definition_id is null or exists(
      select 1 from public.player_achievement_progress achievement
      where achievement.player_profile_id=p_player_profile_id
        and achievement.achievement_definition_id=p_version.required_achievement_definition_id
        and achievement.status in ('completed','rewarded')
    ))
    and (p_version.required_previous_unlock_definition_id is null or exists(
      select 1 from public.player_progression_unlocks unlock
      where unlock.player_profile_id=p_player_profile_id
        and unlock.unlock_definition_id=p_version.required_previous_unlock_definition_id
    ));
$$;

create or replace function private.progression_apply_unlocks(
  p_player_profile_id uuid,
  p_source_type text,
  p_source_reference_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path=''
as $$
declare candidate record; inserted_count integer:=0; inserted_rows integer;
  live_ops public.progression_live_ops%rowtype;
begin
  select * into strict live_ops from public.progression_live_ops where singleton_key;
  if not live_ops.unlock_grants_enabled then return 0; end if;

  for candidate in
    select definition.*,version.id as version_id,version.target_reference_id,
      version.target_reference_key,version.safe_metadata as version_metadata
    from public.progression_unlock_definitions definition
    join public.progression_active_unlock_versions active on active.unlock_definition_id=definition.id
    join public.progression_unlock_versions version on version.id=active.unlock_version_id
    where definition.enabled and version.lifecycle_status='active'
      and private.progression_unlock_requirement_met(p_player_profile_id,version)
      and not exists(
        select 1 from public.player_progression_unlocks owned
        where owned.player_profile_id=p_player_profile_id and owned.unlock_definition_id=definition.id
      )
    order by definition.unlock_key
  loop
    insert into public.player_progression_unlocks(
      player_profile_id,unlock_definition_id,unlock_version_id,source_type,
      source_reference_id,safe_metadata
    ) values(
      p_player_profile_id,candidate.id,candidate.version_id,
      case
        when candidate.unlock_type='quest' then 'tutorial_completion'
        when p_source_type in ('skill_level','player_level','quest_completion','achievement_completion','tutorial_completion','admin_grant_foundation','reconciliation') then p_source_type
        else 'skill_level'
      end,
      p_source_reference_id,jsonb_build_object('grandfathered',true)
    ) on conflict do nothing;
    get diagnostics inserted_rows=row_count;
    if inserted_rows=0 then continue; end if;
    inserted_count:=inserted_count+1;

    if candidate.unlock_type='recipe' and candidate.target_reference_id is not null then
      insert into public.player_recipe_unlocks(
        player_profile_id,recipe_definition_id,unlock_source,source_reference_id
      ) values(
        p_player_profile_id,candidate.target_reference_id,'skill_foundation',p_source_reference_id
      ) on conflict do nothing;
    end if;

    insert into public.progression_owner_events(
      player_profile_id,event_key,related_entity_id,safe_payload
    ) values(
      p_player_profile_id,'unlock_granted',candidate.id,
      jsonb_build_object(
        'unlockKey',candidate.unlock_key,'displayName',candidate.display_name,
        'unlockType',candidate.unlock_type,'targetKey',candidate.target_reference_key
      )
    );
  end loop;
  return inserted_count;
end;
$$;

create or replace function private.progression_settle_reward(
  p_reward_id uuid,
  p_request_id text
)
returns text
language plpgsql
volatile
security definer
set search_path=''
as $$
declare reward public.player_progression_rewards%rowtype;
  definition public.progression_reward_definitions%rowtype;
  live_ops public.progression_live_ops%rowtype;
  settled_reference uuid; settled boolean:=false; reason_key text; reference_type text;
begin
  if p_reward_id is null or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_REWARD_REQUEST';
  end if;
  select * into reward from public.player_progression_rewards where id=p_reward_id for update;
  if not found then return 'reward_not_found'; end if;
  if reward.status='settled' then return 'reward_already_settled'; end if;
  select * into strict definition from public.progression_reward_definitions
  where id=reward.reward_definition_id and enabled;
  select * into strict live_ops from public.progression_live_ops where singleton_key;
  if (definition.source_type='quest' and not live_ops.quest_rewards_enabled)
     or (definition.source_type='achievement' and not live_ops.achievement_rewards_enabled) then
    update public.player_progression_rewards set status='blocked',failure_code='SERVICE_UNAVAILABLE',
      attempt_count=attempt_count+1,next_attempt_at=now()+interval '5 minutes',
      progression_revision=progression_revision+1 where id=reward.id;
    return 'service_unavailable';
  end if;

  update public.player_progression_rewards set status='settling',failure_code=null,
    attempt_count=attempt_count+1,progression_revision=progression_revision+1 where id=reward.id;

  if definition.reward_type='dust' then
    reason_key:=case when definition.source_type='quest'
      then 'progression_quest_reward' else 'progression_achievement_reward' end;
    reference_type:=case when definition.source_type='quest'
      then 'progression_quest' else 'progression_achievement' end;
    settled:=private.cozy_apply_dust_delta(
      reward.player_profile_id,definition.amount,reason_key,reference_type,
      reward.id::text,'progression-reward:'||reward.id::text,p_request_id
    );
    if settled then
      select ledger.id into settled_reference from public.player_dust_ledger ledger
      where ledger.player_profile_id=reward.player_profile_id and ledger.reference_id=reward.id::text
        and ledger.reason=reason_key order by ledger.created_at desc limit 1;
    end if;
  elsif definition.reward_type='item' then
    if definition.target_reference_id is not null and private.cozy_can_add_item(
      reward.player_profile_id,definition.target_reference_id,definition.amount::integer
    ) then
      settled:=private.cozy_add_item(
        reward.player_profile_id,definition.target_reference_id,definition.amount::integer,
        case when definition.source_type='quest' then 'progression_quest_reward' else 'progression_achievement_reward' end,
        reward.id::text,'progression-reward:'||reward.id::text,p_request_id
      );
      if settled then
        select history.id into settled_reference from public.player_inventory_history history
        where history.player_profile_id=reward.player_profile_id and history.reference_id=reward.id::text
        order by history.created_at desc limit 1;
      end if;
    end if;
  elsif definition.reward_type='title' then
    insert into public.player_progression_titles(
      player_profile_id,title_id,source_type,source_reference_id
    ) values(
      reward.player_profile_id,definition.target_reference_id,definition.source_type,reward.source_completion_id
    ) on conflict do nothing;
    settled:=exists(select 1 from public.player_progression_titles owned
      where owned.player_profile_id=reward.player_profile_id and owned.title_id=definition.target_reference_id);
    settled_reference:=definition.target_reference_id;
    if settled then
      insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
      select reward.player_profile_id,'title_granted',title.id,jsonb_build_object('titleKey',title.title_key,'displayName',title.display_name)
      from public.progression_titles title where title.id=definition.target_reference_id;
    end if;
  elsif definition.reward_type='badge' then
    insert into public.player_progression_badges(
      player_profile_id,badge_id,source_type,source_reference_id
    ) values(
      reward.player_profile_id,definition.target_reference_id,definition.source_type,reward.source_completion_id
    ) on conflict do nothing;
    settled:=exists(select 1 from public.player_progression_badges owned
      where owned.player_profile_id=reward.player_profile_id and owned.badge_id=definition.target_reference_id);
    settled_reference:=definition.target_reference_id;
    if settled then
      insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
      select reward.player_profile_id,'badge_granted',badge.id,jsonb_build_object('badgeKey',badge.badge_key,'displayName',badge.display_name)
      from public.progression_badges badge where badge.id=definition.target_reference_id;
    end if;
  elsif definition.reward_type='unlock' then
    insert into public.player_progression_unlocks(
      player_profile_id,unlock_definition_id,unlock_version_id,source_type,source_reference_id
    )
    select reward.player_profile_id,unlock.id,active.unlock_version_id,
      case when definition.source_type='quest' then 'quest_completion' else 'achievement_completion' end,
      reward.source_completion_id
    from public.progression_unlock_definitions unlock
    join public.progression_active_unlock_versions active on active.unlock_definition_id=unlock.id
    where unlock.id=definition.target_reference_id
    on conflict do nothing;
    settled:=exists(select 1 from public.player_progression_unlocks owned
      where owned.player_profile_id=reward.player_profile_id and owned.unlock_definition_id=definition.target_reference_id);
    settled_reference:=definition.target_reference_id;
  else
    settled:=false;
  end if;

  if not settled then
    update public.player_progression_rewards set status='pending',
      failure_code=case when definition.reward_type='item' then 'INVENTORY_FULL' else 'REWARD_SETTLEMENT_FAILED' end,
      next_attempt_at=now()+interval '5 minutes',progression_revision=progression_revision+1
    where id=reward.id;
    insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
    values(reward.player_profile_id,'reward_pending',reward.id,
      jsonb_build_object('rewardType',definition.reward_type,'reason',case when definition.reward_type='item' then 'inventory_full' else 'settlement_failed' end));
    return case when definition.reward_type='item' then 'inventory_full' else 'reward_settlement_failed' end;
  end if;

  update public.player_progression_rewards set status='settled',settled_at=now(),
    settlement_reference_id=settled_reference,failure_code=null,next_attempt_at=null,
    progression_revision=progression_revision+1 where id=reward.id;
  insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
  values(reward.player_profile_id,'reward_settled',reward.id,
    jsonb_build_object('rewardType',definition.reward_type,'displayLabel',definition.display_label));
  return 'settled';
end;
$$;

create or replace function private.progression_evaluate_achievements(
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
declare candidate record; contribution bigint; inserted_rows integer; completed_count integer:=0;
  progress public.player_achievement_progress%rowtype; reward_row record;
begin
  perform private.ensure_player_progression(p_player_profile_id);
  for candidate in
    select definition.id as definition_id,definition.achievement_key,definition.display_name,
      version.id as version_id,version.criteria_type,version.target_value,
      version.target_reference_id,version.target_reference_key
    from public.progression_achievement_definitions definition
    join public.progression_active_achievement_versions active
      on active.achievement_definition_id=definition.id
    join public.progression_achievement_versions version on version.id=active.achievement_version_id
    where definition.enabled and version.lifecycle_status='active'
      and version.source_event_key=p_source_event_key
      and (version.target_reference_id is null or version.target_reference_id=p_target_reference_id)
      and (version.target_reference_key is null or version.target_reference_key=p_target_reference_key)
  loop
    contribution:=case candidate.criteria_type
      when 'cumulative_quantity' then greatest(1,coalesce(p_quantity,1))
      when 'dust_earned' then greatest(1,coalesce(p_dust_amount,0))
      else 1 end;
    insert into public.player_achievement_event_contributions(
      player_profile_id,achievement_definition_id,source_event_key,source_entity_id,progress_delta
    ) values(
      p_player_profile_id,candidate.definition_id,p_source_event_key,p_source_entity_id,contribution
    ) on conflict do nothing;
    get diagnostics inserted_rows=row_count;
    if inserted_rows=0 then continue; end if;

    update public.player_achievement_progress set
      current_progress=least(target_value,current_progress+contribution),
      status=case when current_progress+contribution>=target_value then 'completed' else 'in_progress' end,
      completed_at=case when current_progress+contribution>=target_value then coalesce(completed_at,now()) else completed_at end,
      progression_revision=progression_revision+1
    where player_profile_id=p_player_profile_id
      and achievement_definition_id=candidate.definition_id
      and status not in ('completed','rewarded')
    returning * into progress;
    if not found then continue; end if;

    insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
    values(
      p_player_profile_id,
      case when progress.status='completed' then 'achievement_completed' else 'achievement_progressed' end,
      candidate.definition_id,
      jsonb_build_object(
        'achievementKey',candidate.achievement_key,'displayName',candidate.display_name,
        'currentProgress',progress.current_progress,'target',progress.target_value
      )
    );

    if progress.status='completed' then
      completed_count:=completed_count+1;
      insert into public.player_progression_rewards(
        player_profile_id,reward_definition_id,source_completion_id,status
      )
      select p_player_profile_id,reward.id,progress.achievement_version_id,'pending'
      from public.progression_reward_definitions reward
      where reward.source_type='achievement' and reward.source_version_id=progress.achievement_version_id
        and reward.enabled
      on conflict do nothing;

      if not exists(
        select 1 from public.progression_reward_definitions reward
        where reward.source_type='achievement' and reward.source_version_id=progress.achievement_version_id
          and reward.enabled
      ) then
        update public.player_achievement_progress set status='rewarded',rewarded_at=now(),
          progression_revision=progression_revision+1
        where player_profile_id=p_player_profile_id and achievement_definition_id=candidate.definition_id;
      else
        for reward_row in
          select reward.id from public.player_progression_rewards reward
          where reward.player_profile_id=p_player_profile_id
            and reward.source_completion_id=progress.achievement_version_id
            and reward.status<>'settled'
        loop
          perform private.progression_settle_reward(reward_row.id,p_request_id);
        end loop;
        if not exists(
          select 1 from public.player_progression_rewards reward
          where reward.player_profile_id=p_player_profile_id
            and reward.source_completion_id=progress.achievement_version_id
            and reward.status<>'settled'
        ) then
          update public.player_achievement_progress set status='rewarded',rewarded_at=now(),
            progression_revision=progression_revision+1
          where player_profile_id=p_player_profile_id and achievement_definition_id=candidate.definition_id;
        end if;
      end if;
    end if;
  end loop;
  return completed_count;
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
        'sourceEntityId',p_source_entity_id)
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
  multiplier numeric:=1; daily_xp bigint; level_cursor integer;
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
      for level_cursor in prior_player_level+1..next_player_level loop
        insert into public.progression_level_up_events(
          player_profile_id,xp_event_id,level_type,previous_level,reached_level
        ) values(p_player_profile_id,event.id,'player',level_cursor-1,level_cursor) on conflict do nothing;
        insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
        values(p_player_profile_id,'player_level_up',event.id,jsonb_build_object('level',level_cursor));
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
    for level_cursor in prior_level+1..next_level loop
      insert into public.progression_level_up_events(
        player_profile_id,xp_event_id,level_type,skill_definition_id,previous_level,reached_level
      ) values(p_player_profile_id,event.id,'skill',definition.id,level_cursor-1,level_cursor) on conflict do nothing;
      insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
      values(p_player_profile_id,'skill_level_up',event.id,
        jsonb_build_object('skillKey',definition.skill_key,'displayName',definition.display_name,'level',level_cursor));
    end loop;
    perform private.progression_apply_objective_event(
      p_player_profile_id,'skill_level_reached',event.id,definition.id,definition.skill_key,next_level,0,p_request_id
    );
  end if;
  if next_player_level>prior_player_level then
    for level_cursor in prior_player_level+1..next_player_level loop
      insert into public.progression_level_up_events(
        player_profile_id,xp_event_id,level_type,previous_level,reached_level
      ) values(p_player_profile_id,event.id,'player',level_cursor-1,level_cursor) on conflict do nothing;
      insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
      values(p_player_profile_id,'player_level_up',event.id,jsonb_build_object('level',level_cursor));
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

create or replace function private.progression_process_private_plot_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare rule_key text; source_key text; quantity integer:=1;
  target_id uuid; target_key text; crop public.player_home_crop_instances%rowtype;
  job public.player_crafting_jobs%rowtype;
begin
  if new.event_key in ('soil_prepared','crop_planted','crop_watered','crop_harvested') then
    source_key:=new.event_key;
    rule_key:=case new.event_key
      when 'soil_prepared' then 'farming-soil-prepared'
      when 'crop_planted' then 'farming-crop-planted'
      when 'crop_watered' then 'farming-crop-watered'
      when 'crop_harvested' then 'farming-crop-harvested' end;
    if new.event_key in ('crop_planted','crop_watered','crop_harvested') then
      select * into crop from public.player_home_crop_instances where id=new.target_id;
      if found then
        quantity:=case when new.event_key='crop_harvested' then crop.deterministic_yield else 1 end;
        target_id:=case when new.event_key='crop_planted' then crop.seed_item_definition_id
          else crop.produce_item_definition_id end;
        target_key:=crop.crop_slug;
      end if;
    end if;
  elsif new.event_key='crafting_job_collected' then
    select * into job from public.player_crafting_jobs where id=new.target_id;
    if not found then return new; end if;
    source_key:=case when job.recipe_category='cooking'
      then 'cooking_job_collected' else 'crafting_job_collected' end;
    rule_key:=case when job.recipe_category='cooking'
      then 'cooking-job-collected' else 'crafting-job-collected' end;
    quantity:=job.output_quantity;
    target_id:=job.recipe_definition_id;
    target_key:=job.recipe_key;
  else
    return new;
  end if;

  perform private.progression_grant_trusted_xp(
    new.player_profile_id,rule_key,new.id,'cozy_private_plot_events',greatest(1,quantity),
    'phase11d-plot-event:'||new.id::text
  );
  perform private.progression_apply_objective_event(
    new.player_profile_id,source_key,new.id,target_id,target_key,greatest(1,quantity),0,
    'phase11d-plot-event:'||new.id::text
  );
  perform private.progression_evaluate_achievements(
    new.player_profile_id,source_key,new.id,target_id,target_key,greatest(1,quantity),0,
    'phase11d-plot-event:'||new.id::text
  );
  return new;
end;
$$;

create trigger cozy_private_plot_progression_event
after insert on public.cozy_private_plot_events
for each row execute function private.progression_process_private_plot_event();

create or replace function private.progression_process_shop_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare transaction_row public.economy_shop_transactions%rowtype; item_key text;
begin
  if new.player_profile_id is null
     or new.event_key not in ('shop_purchase_completed','shop_sale_completed') then return new; end if;
  select * into transaction_row from public.economy_shop_transactions where id=new.related_entity_id;
  if not found or transaction_row.status<>'completed' then return new; end if;
  select item.slug into item_key from public.cozy_item_definitions item
  where item.id=transaction_row.item_definition_id;
  perform private.progression_apply_objective_event(
    new.player_profile_id,new.event_key,transaction_row.id,transaction_row.item_definition_id,item_key,
    transaction_row.quantity,transaction_row.total_dust,'phase11d-shop-event:'||new.event_number::text
  );
  perform private.progression_evaluate_achievements(
    new.player_profile_id,new.event_key,transaction_row.id,transaction_row.item_definition_id,item_key,
    transaction_row.quantity,transaction_row.total_dust,'phase11d-shop-event:'||new.event_number::text
  );
  return new;
end;
$$;

create trigger economy_shop_progression_event
after insert on public.economy_shop_events
for each row execute function private.progression_process_shop_event();

create or replace function private.progression_process_quest_completion()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare definition_key text;
begin
  if new.status<>'reward_claimed' or old.status='reward_claimed' then return new; end if;
  select definition.slug into strict definition_key from public.cozy_quest_definitions definition
  where definition.id=new.quest_definition_id;
  perform private.progression_grant_trusted_xp(
    new.player_profile_id,'quest-completed',new.id,'player_quest_instances',1,
    'phase11d-quest-complete:'||new.id::text
  );
  perform private.progression_apply_objective_event(
    new.player_profile_id,'quest_completed',new.id,new.quest_definition_id,definition_key,1,0,
    'phase11d-quest-complete:'||new.id::text
  );
  perform private.progression_evaluate_achievements(
    new.player_profile_id,'quest_completed',new.id,new.quest_definition_id,definition_key,1,0,
    'phase11d-quest-complete:'||new.id::text
  );
  perform private.progression_apply_unlocks(
    new.player_profile_id,
    case when new.quest_definition_id in (
      'a1100000-0000-4000-8000-000000000031','b1100000-0000-4000-8000-000000000201',
      'c1100000-0000-4000-8000-000000000210'
    ) then 'tutorial_completion' else 'quest_completion' end,
    new.id
  );
  insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
  values(new.player_profile_id,'quest_completed',new.id,
    jsonb_build_object('questDefinitionId',new.quest_definition_id,'questSlug',definition_key));
  return new;
end;
$$;

create trigger player_quest_completion_progression
after update of status on public.player_quest_instances
for each row execute function private.progression_process_quest_completion();

create or replace function private.progression_process_legacy_quest_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.event_key='plot_entered' then
    perform private.progression_evaluate_achievements(
      new.player_profile_id,'plot_entered',new.id,null,'personal-home',1,0,
      'phase11d-quest-event:'||new.id::text
    );
  elsif new.event_key in ('shopkeeper_interacted','workstation_tutorial_returned','shopkeeper_returned') then
    perform private.progression_apply_objective_event(
      new.player_profile_id,'npc_interacted',new.id,new.related_entity_id,
      case when new.event_key='shopkeeper_interacted' then 'mira-general-store' else 'willow-guide' end,
      1,0,'phase11d-quest-event:'||new.id::text
    );
  end if;
  return new;
end;
$$;

create trigger player_quest_event_progression
after insert on public.player_quest_events
for each row execute function private.progression_process_legacy_quest_event();

-- Preserve the Phase 11B unlock rules, while progression-gated recipe targets
-- require an earned authoritative unlock.
create or replace function private.cozy_recipe_is_unlocked(
  p_player_profile_id uuid,
  p_version public.cozy_recipe_versions
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case
    when exists(
      select 1 from public.progression_unlock_definitions definition
      join public.progression_active_unlock_versions active on active.unlock_definition_id=definition.id
      join public.progression_unlock_versions unlock_version on unlock_version.id=active.unlock_version_id
      where definition.unlock_type='recipe' and definition.enabled
        and unlock_version.target_reference_id=p_version.recipe_definition_id
    ) then exists(
      select 1 from public.player_progression_unlocks owned
      join public.progression_unlock_definitions definition on definition.id=owned.unlock_definition_id
      join public.progression_unlock_versions unlock_version on unlock_version.id=owned.unlock_version_id
      where owned.player_profile_id=p_player_profile_id and definition.unlock_type='recipe'
        and unlock_version.target_reference_id=p_version.recipe_definition_id
    )
    else case p_version.unlock_rule
      when 'starter' then true
      when 'phase11a_complete' then exists(
        select 1 from public.player_quest_instances instance
        join public.cozy_quest_versions quest_version on quest_version.id=instance.quest_version_id
        where instance.player_profile_id=p_player_profile_id
          and quest_version.quest_kind='farming_tutorial' and instance.status='reward_claimed'
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
    end
  end;
$$;

create or replace function private.progression_enforce_crop_unlock()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare seed_id uuid;
begin
  select crop.seed_item_definition_id into strict seed_id
  from public.cozy_crop_definitions crop where crop.id=new.crop_definition_id;
  if exists(
    select 1 from public.progression_unlock_definitions definition
    join public.progression_active_unlock_versions active on active.unlock_definition_id=definition.id
    join public.progression_unlock_versions version on version.id=active.unlock_version_id
    where definition.unlock_type='crop' and definition.enabled and version.target_reference_id=seed_id
  ) and not exists(
    select 1 from public.player_progression_unlocks owned
    join public.progression_unlock_definitions definition on definition.id=owned.unlock_definition_id
    join public.progression_unlock_versions version on version.id=owned.unlock_version_id
    where owned.player_profile_id=new.player_profile_id and definition.unlock_type='crop'
      and version.target_reference_id=seed_id
  ) then
    raise exception using errcode='P0001',message='UNLOCK_REQUIREMENT_NOT_MET';
  end if;
  return new;
end;
$$;

create trigger player_home_crop_progression_unlock
before insert on public.player_home_crop_instances
for each row execute function private.progression_enforce_crop_unlock();

-- Publish a successor General Store catalog locally so player-specific skill
-- unlocks are visible and revalidated by the existing transaction function.
alter table public.economy_shop_version_offers
  drop constraint economy_shop_version_offers_eligibility_check;
alter table public.economy_shop_version_offers
  add constraint economy_shop_version_offers_eligibility_check check (
    eligibility_rule in (
      'ordinary_gameplay','phase11a_complete','phase11b_complete','tutorial_only',
      'progression_farming_2','progression_farming_3'
    )
  );

insert into public.economy_shop_versions(
  id,shop_definition_id,version_number,lifecycle_status,name,description,interaction_key,
  revision,effective_at,validation_results,created_by_admin_id,reviewed_by_admin_id,
  published_by_admin_id,reviewed_at,published_at,catalog_id,reason,superseded_at,safe_metadata
)
select 'd1100000-0000-4000-8000-000000000950',source.shop_definition_id,3,'draft',
  source.name,source.description,source.interaction_key,1,now(),
  jsonb_build_object('valid',true,'checks',jsonb_build_array(
    'positive-prices','bounded-quantities','direct-arbitrage-blocked','progression-unlocks-resolved'
  )),null,null,null,null,null,source.catalog_id,
  'Phase 11D successor adding authoritative Farming skill unlocks.',null,
  source.safe_metadata||jsonb_build_object('progressionIntegration','phase11d')
from public.economy_active_shop_versions active
join public.economy_shop_versions source on source.id=active.shop_version_id
where active.shop_definition_id='74000000-0000-4000-8000-000000000001';

insert into public.economy_shop_version_offers(
  shop_version_id,offer_id,unit_price,maximum_quantity,daily_limit,cooldown_seconds,
  inventory_capacity_cost,protected_item,enabled,revision,entry_id,buy_enabled,sell_enabled,
  buy_price,sell_price,currency_key,stock_mode,restock_mode,maximum_stock,restock_amount,
  restock_interval_seconds,player_buy_daily_limit,player_sell_daily_limit,availability_from,
  availability_until,eligibility_rule,display_order,safe_metadata
)
select 'd1100000-0000-4000-8000-000000000950',entry.offer_id,entry.unit_price,
  entry.maximum_quantity,entry.daily_limit,entry.cooldown_seconds,entry.inventory_capacity_cost,
  entry.protected_item,entry.enabled,1,entry.entry_id,entry.buy_enabled,entry.sell_enabled,
  entry.buy_price,entry.sell_price,entry.currency_key,entry.stock_mode,entry.restock_mode,
  entry.maximum_stock,entry.restock_amount,entry.restock_interval_seconds,
  entry.player_buy_daily_limit,entry.player_sell_daily_limit,entry.availability_from,
  entry.availability_until,
  case item.slug when 'sunroot-seed' then 'progression_farming_2'
    when 'cloudberry-seed' then 'progression_farming_3' else entry.eligibility_rule end,
  entry.display_order,entry.safe_metadata||jsonb_build_object('progressionIntegration','phase11d')
from public.economy_active_shop_versions active
join public.economy_shop_version_offers entry on entry.shop_version_id=active.shop_version_id
join public.cozy_shop_offers offer on offer.id=entry.offer_id
join public.cozy_item_definitions item on item.id=offer.item_definition_id
where active.shop_definition_id='74000000-0000-4000-8000-000000000001';

insert into public.economy_shop_stock(
  catalog_version_id,catalog_entry_id,current_stock,maximum_stock,next_restock_at,
  restock_paused,stock_revision,last_restock_at
)
select 'd1100000-0000-4000-8000-000000000950',stock.catalog_entry_id,
  stock.current_stock,stock.maximum_stock,stock.next_restock_at,stock.restock_paused,1,
  stock.last_restock_at
from public.economy_active_shop_versions active
join public.economy_shop_stock stock on stock.catalog_version_id=active.shop_version_id
where active.shop_definition_id='74000000-0000-4000-8000-000000000001';

update public.economy_shop_versions set lifecycle_status='published',published_at=now()
where id='d1100000-0000-4000-8000-000000000950';

insert into public.economy_active_shop_versions(shop_definition_id,shop_version_id,activated_at)
values('74000000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000950',now())
on conflict(shop_definition_id) do update set
  shop_version_id=excluded.shop_version_id,activated_at=excluded.activated_at;

create or replace function private.cozy_shop_entry_is_unlocked(
  p_player_profile_id uuid,
  p_eligibility_rule text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case p_eligibility_rule
    when 'ordinary_gameplay' then true
    when 'phase11a_complete' then exists(
      select 1 from public.player_quest_instances instance
      join public.cozy_quest_versions version on version.id=instance.quest_version_id
      where instance.player_profile_id=p_player_profile_id
        and version.quest_kind='farming_tutorial' and instance.status='reward_claimed'
    )
    when 'phase11b_complete' then exists(
      select 1 from public.player_quest_instances instance
      join public.cozy_quest_versions version on version.id=instance.quest_version_id
      where instance.player_profile_id=p_player_profile_id
        and version.quest_kind='workstation_tutorial' and instance.status='reward_claimed'
    )
    when 'tutorial_only' then exists(
      select 1 from public.player_quest_instances instance
      join public.cozy_quest_versions version on version.id=instance.quest_version_id
      where instance.player_profile_id=p_player_profile_id
        and version.quest_kind='shop_tutorial' and instance.status='active'
    )
    when 'progression_farming_2' then exists(
      select 1 from public.player_progression_unlocks owned
      join public.progression_unlock_definitions definition on definition.id=owned.unlock_definition_id
      where owned.player_profile_id=p_player_profile_id and definition.unlock_key='sunroot-seed-shop'
    )
    when 'progression_farming_3' then exists(
      select 1 from public.player_progression_unlocks owned
      join public.progression_unlock_definitions definition on definition.id=owned.unlock_definition_id
      where owned.player_profile_id=p_player_profile_id and definition.unlock_key='cloudberry-seed-shop'
    )
    else false
end;
$$;

create or replace function private.progression_quest_available(
  p_player_profile_id uuid,
  p_quest_definition_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.progression_active_quest_chain_versions active_chain
    join public.progression_quest_chain_entries entry
      on entry.quest_chain_version_id=active_chain.quest_chain_version_id
    where entry.quest_definition_id=p_quest_definition_id
      and not exists(
        select 1 from public.player_quest_instances instance
        where instance.player_profile_id=p_player_profile_id
          and instance.quest_definition_id=p_quest_definition_id
      )
      and (entry.prerequisite_quest_definition_id is null or exists(
        select 1 from public.player_quest_instances prerequisite
        where prerequisite.player_profile_id=p_player_profile_id
          and prerequisite.quest_definition_id=entry.prerequisite_quest_definition_id
          and prerequisite.status='reward_claimed'
      ))
      and (entry.required_player_level is null or exists(
        select 1 from public.player_level_progress level_progress
        where level_progress.player_profile_id=p_player_profile_id
          and level_progress.current_level>=entry.required_player_level
      ))
      and (entry.required_skill_definition_id is null or exists(
        select 1 from public.player_skill_progress skill_progress
        where skill_progress.player_profile_id=p_player_profile_id
          and skill_progress.skill_definition_id=entry.required_skill_definition_id
          and skill_progress.current_level>=entry.required_skill_level
      ))
      and (entry.required_unlock_definition_id is null or exists(
        select 1 from public.player_progression_unlocks unlock
        where unlock.player_profile_id=p_player_profile_id
          and unlock.unlock_definition_id=entry.required_unlock_definition_id
      ))
      and (entry.required_achievement_definition_id is null or exists(
        select 1 from public.player_achievement_progress achievement
        where achievement.player_profile_id=p_player_profile_id
          and achievement.achievement_definition_id=entry.required_achievement_definition_id
          and achievement.status in ('completed','rewarded')
      ))
  );
$$;

create or replace function private.progression_quest_json(
  p_player_profile_id uuid,
  p_quest_definition_id uuid,
  p_instance_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'questDefinitionId',definition.id,'questVersionId',version.id,
    'configurationRevision',version.configuration_revision,'questKind',version.quest_kind,
    'questSlug',definition.slug,
    'questInstanceId',instance.id,
    'name',version.name,'description',version.description,'status',coalesce(instance.status,'available'),
    'stateVersion',coalesce(instance.state_version,1),'tracked',coalesce(instance.tracked,false),
    'rewardState',coalesce(instance.reward_state,'not_ready'),
    'acceptedAt',instance.accepted_at,'completedAt',instance.completed_at,
    'chain',jsonb_build_object('chainKey',chain.chain_key,'name',chain.public_name,'sequence',entry.sequence_number),
    'prerequisites',jsonb_build_object(
      'questDefinitionId',entry.prerequisite_quest_definition_id,
      'playerLevel',entry.required_player_level,
      'skillKey',skill.skill_key,'skillLevel',entry.required_skill_level,
      'met',case when instance.id is not null then true else private.progression_quest_available(p_player_profile_id,definition.id) end
    ),
    'objectives',coalesce((
      select jsonb_agg(jsonb_build_object(
        'objectiveId',objective.id,'objectiveKey',objective.objective_key,
        'label',objective.label,'currentCount',coalesce(progress.current_count,0),
        'requiredCount',objective.required_count,'completedAt',progress.completed_at,
        'targetKey',objective.target_reference_key
      ) order by objective.sequence_number)
      from public.cozy_quest_objectives objective
      left join public.player_quest_objective_progress progress
        on progress.quest_objective_id=objective.id and progress.player_quest_instance_id=instance.id
      where objective.quest_version_id=version.id
    ),'[]'::jsonb),
    'rewards',coalesce((
      select jsonb_agg(jsonb_build_object(
        'rewardType',reward.reward_type,'displayLabel',reward.display_label,'amount',reward.amount
      ) order by reward.reward_type,reward.display_label)
      from public.progression_reward_definitions reward
      where reward.source_type='quest' and reward.source_version_id=version.id and reward.enabled
    ),'[]'::jsonb)
  )
  from public.cozy_quest_definitions definition
  join public.cozy_quest_versions version on version.quest_definition_id=definition.id
    and version.lifecycle_status in ('active','published') and version.active
  join public.progression_active_quest_chain_versions active_chain on true
  join public.progression_quest_chain_versions chain_version on chain_version.id=active_chain.quest_chain_version_id
  join public.progression_quest_chains chain on chain.id=chain_version.quest_chain_id
  join public.progression_quest_chain_entries entry on entry.quest_chain_version_id=chain_version.id
    and entry.quest_definition_id=definition.id
  left join public.progression_skill_definitions skill on skill.id=entry.required_skill_definition_id
  left join public.player_quest_instances instance on instance.id=p_instance_id
    and instance.player_profile_id=p_player_profile_id and instance.quest_definition_id=definition.id
  where definition.id=p_quest_definition_id
  order by version.version_number desc limit 1;
$$;

create or replace function private.progression_workspace_json(
  p_player_profile_id uuid,
  p_recent_xp_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare level_progress public.player_level_progress%rowtype;
  preferences public.player_progression_preferences%rowtype;
begin
  select * into strict level_progress from public.player_level_progress
  where player_profile_id=p_player_profile_id;
  select * into strict preferences from public.player_progression_preferences
  where player_profile_id=p_player_profile_id;
  return jsonb_build_object(
    'playerLevel',jsonb_build_object(
      'level',level_progress.current_level,'totalXp',level_progress.total_xp,
      'xpInLevel',level_progress.xp_in_level,'xpForNextLevel',level_progress.xp_for_next_level,
      'maximumLevel',(select maximum_level from public.progression_curve_versions where id=level_progress.curve_version_id),
      'revision',level_progress.progression_revision
    ),
    'skills',coalesce((
      select jsonb_agg(jsonb_build_object(
        'skillId',definition.id,'skillKey',definition.skill_key,'displayName',definition.display_name,
        'description',definition.description,'iconRef',definition.icon_ref,'category',definition.category,
        'released',definition.released,'enabled',definition.enabled,'level',coalesce(progress.current_level,1),
        'totalXp',coalesce(progress.total_xp,0),'xpInLevel',coalesce(progress.xp_in_level,0),
        'xpForNextLevel',progress.xp_for_next_level,'maximumLevel',coalesce(version.maximum_level,20),
        'revision',coalesce(progress.progression_revision,1),
        'recentUnlocks',coalesce((select jsonb_agg(unlock_definition.display_name order by owned.granted_at desc)
          from (select * from public.player_progression_unlocks owned_row
            where owned_row.player_profile_id=p_player_profile_id order by owned_row.granted_at desc limit 3) owned
          join public.progression_unlock_definitions unlock_definition on unlock_definition.id=owned.unlock_definition_id
          join public.progression_unlock_versions unlock_version on unlock_version.id=owned.unlock_version_id
          where unlock_version.required_skill_definition_id=definition.id),'[]'::jsonb),
        'nextUnlocks',coalesce((select jsonb_agg(jsonb_build_object(
            'unlockKey',unlock_definition.unlock_key,'displayName',unlock_definition.display_name,
            'requiredLevel',unlock_version.required_skill_level,'visible',unlock_version.visible_before_unlock
          ) order by unlock_version.required_skill_level,unlock_definition.display_name)
          from public.progression_unlock_definitions unlock_definition
          join public.progression_active_unlock_versions active_unlock on active_unlock.unlock_definition_id=unlock_definition.id
          join public.progression_unlock_versions unlock_version on unlock_version.id=active_unlock.unlock_version_id
          where unlock_version.required_skill_definition_id=definition.id
            and unlock_version.required_skill_level>coalesce(progress.current_level,1)
            and unlock_version.visible_before_unlock),'[]'::jsonb)
      ) order by definition.display_order)
      from public.progression_skill_definitions definition
      left join public.progression_active_skill_versions active on active.skill_definition_id=definition.id
      left join public.progression_skill_versions version on version.id=active.skill_version_id
      left join public.player_skill_progress progress on progress.player_profile_id=p_player_profile_id
        and progress.skill_definition_id=definition.id
      where definition.released or definition.tutorial_visible
    ),'[]'::jsonb),
    'futureSkills',coalesce((select jsonb_agg(jsonb_build_object(
      'skillKey',definition.skill_key,'displayName',definition.display_name,'description',definition.description,
      'released',false,'hidden',not definition.tutorial_visible
    ) order by definition.display_order) from public.progression_skill_definitions definition
      where not definition.released),'[]'::jsonb),
    'unlocks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'unlockId',definition.id,'unlockKey',definition.unlock_key,'displayName',definition.display_name,
        'description',definition.description,'unlockType',definition.unlock_type,
        'targetKey',version.target_reference_key,'owned',owned.unlock_definition_id is not null,
        'grantedAt',owned.granted_at,'visibleBeforeUnlock',version.visible_before_unlock,
        'requirementMet',private.progression_unlock_requirement_met(p_player_profile_id,version),
        'requiredSkillKey',skill.skill_key,'requiredSkillLevel',version.required_skill_level,
        'requiredPlayerLevel',version.required_player_level
      ) order by definition.unlock_type,definition.display_name)
      from public.progression_unlock_definitions definition
      join public.progression_active_unlock_versions active on active.unlock_definition_id=definition.id
      join public.progression_unlock_versions version on version.id=active.unlock_version_id
      left join public.progression_skill_definitions skill on skill.id=version.required_skill_definition_id
      left join public.player_progression_unlocks owned on owned.player_profile_id=p_player_profile_id
        and owned.unlock_definition_id=definition.id
      where definition.enabled and (version.visible_before_unlock or owned.unlock_definition_id is not null)
    ),'[]'::jsonb),
    'quests',jsonb_build_object(
      'available',coalesce((select jsonb_agg(private.progression_quest_json(p_player_profile_id,entry.quest_definition_id,null)
        order by entry.sequence_number)
        from public.progression_active_quest_chain_versions active_chain
        join public.progression_quest_chain_entries entry on entry.quest_chain_version_id=active_chain.quest_chain_version_id
        where private.progression_quest_available(p_player_profile_id,entry.quest_definition_id)),'[]'::jsonb),
      'active',coalesce((select jsonb_agg(private.progression_quest_json(p_player_profile_id,instance.quest_definition_id,instance.id)
        order by instance.tracked desc,instance.accepted_at)
        from public.player_quest_instances instance
        where instance.player_profile_id=p_player_profile_id and instance.status='active'
          and exists(select 1 from public.progression_active_quest_chain_versions active_chain
            join public.progression_quest_chain_entries entry
              on entry.quest_chain_version_id=active_chain.quest_chain_version_id
            where entry.quest_definition_id=instance.quest_definition_id)),'[]'::jsonb),
      'completed',coalesce((select jsonb_agg(private.progression_quest_json(p_player_profile_id,instance.quest_definition_id,instance.id)
        order by instance.completed_at desc)
        from (select * from public.player_quest_instances instance_row
          where instance_row.player_profile_id=p_player_profile_id and instance_row.status='reward_claimed'
          order by instance_row.completed_at desc limit 50) instance
        where exists(select 1 from public.progression_active_quest_chain_versions active_chain
          join public.progression_quest_chain_entries entry
            on entry.quest_chain_version_id=active_chain.quest_chain_version_id
          where entry.quest_definition_id=instance.quest_definition_id)),'[]'::jsonb)
    ),
    'achievements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'achievementId',definition.id,'achievementKey',definition.achievement_key,
        'displayName',case when version.hidden and progress.status not in ('completed','rewarded') then 'Hidden achievement' else definition.display_name end,
        'description',case when version.hidden and progress.status not in ('completed','rewarded') then 'Keep exploring Starville to reveal this milestone.' else definition.description end,
        'category',definition.category,'hidden',version.hidden and progress.status not in ('completed','rewarded'),
        'progressVisible',version.progress_visible or progress.status in ('completed','rewarded'),
        'currentProgress',case when version.hidden and progress.status not in ('completed','rewarded') then null else progress.current_progress end,
        'target',case when version.hidden and progress.status not in ('completed','rewarded') then null else progress.target_value end,
        'status',progress.status,'completedAt',progress.completed_at,'iconRef',version.icon_ref
      ) order by definition.category,definition.display_name)
      from public.progression_achievement_definitions definition
      join public.progression_active_achievement_versions active on active.achievement_definition_id=definition.id
      join public.progression_achievement_versions version on version.id=active.achievement_version_id
      join public.player_achievement_progress progress on progress.player_profile_id=p_player_profile_id
        and progress.achievement_definition_id=definition.id
      where definition.enabled
    ),'[]'::jsonb),
    'titles',coalesce((select jsonb_agg(jsonb_build_object(
      'titleId',title.id,'titleKey',title.title_key,'displayName',title.display_name,
      'description',title.description,'rarity',title.rarity,'source',owned.source_type,
      'equipped',preferences.equipped_title_id=title.id,'grantedAt',owned.granted_at
    ) order by title.rarity,title.display_name)
      from public.player_progression_titles owned
      join public.progression_titles title on title.id=owned.title_id
      where owned.player_profile_id=p_player_profile_id and title.visible),'[]'::jsonb),
    'badges',coalesce((select jsonb_agg(jsonb_build_object(
      'badgeId',badge.id,'badgeKey',badge.badge_key,'displayName',badge.display_name,
      'description',badge.description,'iconRef',badge.icon_ref,
      'selected',preferences.selected_badge_id=badge.id,'grantedAt',owned.granted_at
    ) order by badge.display_name)
      from public.player_progression_badges owned
      join public.progression_badges badge on badge.id=owned.badge_id
      where owned.player_profile_id=p_player_profile_id and badge.visible),'[]'::jsonb),
    'preferencesRevision',preferences.progression_revision,
    'pendingRewards',coalesce((select jsonb_agg(jsonb_build_object(
      'rewardId',reward.id,'rewardType',definition.reward_type,'displayLabel',definition.display_label,
      'status',reward.status,'failureCode',reward.failure_code,'revision',reward.progression_revision,
      'createdAt',reward.created_at
    ) order by reward.created_at)
      from public.player_progression_rewards reward
      join public.progression_reward_definitions definition on definition.id=reward.reward_definition_id
      where reward.player_profile_id=p_player_profile_id and reward.status<>'settled'),'[]'::jsonb),
    'recentXp',coalesce((select jsonb_agg(jsonb_build_object(
      'eventId',event.id,'skillKey',skill.skill_key,'xp',event.xp_delta,
      'playerXp',event.player_xp_delta,'sourceEvent',event.source_event_key,
      'previousLevel',event.previous_level,'resultingLevel',event.resulting_level,
      'createdAt',event.created_at
    ) order by event.created_at desc)
      from (select * from public.progression_xp_events event_row
        where event_row.player_profile_id=p_player_profile_id
        order by event_row.created_at desc,event_row.id desc limit p_recent_xp_limit) event
      left join public.progression_skill_definitions skill on skill.id=event.skill_definition_id),'[]'::jsonb),
    'lastEventNumber',coalesce((select max(event.event_number) from public.progression_owner_events event
      where event.player_profile_id=p_player_profile_id),0),
    'configurationVersion',jsonb_build_object('schema','phase11d','skillCurve',1,'playerCurve',1),
    'serverTime',now()
  );
end;
$$;

create or replace function public.get_player_progression_workspace(
  p_wallet_address text,
  p_recent_xp_limit integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected record;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_recent_xp_limit not between 1 and 50
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','progression_not_found'); end if;
  profile:=selected.profile_row;moderation:=selected.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'progression_read',120)
    then return jsonb_build_object('status','rate_limited'); end if;
  perform private.ensure_player_progression(profile.id);
  perform private.progression_apply_unlocks(profile.id,'reconciliation',profile.id);
  return jsonb_build_object('status','loaded','progression',private.progression_workspace_json(profile.id,p_recent_xp_limit));
end;
$$;

create or replace function public.accept_player_progression_quest(
  p_wallet_address text,
  p_quest_definition_id uuid,
  p_expected_configuration_revision integer,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected record; version public.cozy_quest_versions%rowtype;
  chain_entry public.progression_quest_chain_entries%rowtype;
  instance public.player_quest_instances%rowtype;
begin
  if p_quest_definition_id is null or p_expected_configuration_revision<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_QUEST_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','progression_not_found'); end if;
  profile:=selected.profile_row;moderation:=selected.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'progression_write',20)
    then return jsonb_build_object('status','rate_limited'); end if;
  perform private.ensure_player_progression(profile.id);
  select * into instance from public.player_quest_instances
  where player_profile_id=profile.id and quest_definition_id=p_quest_definition_id;
  if found then return jsonb_build_object('status','replayed','quest',private.progression_quest_json(profile.id,p_quest_definition_id,instance.id)); end if;
  if not private.progression_quest_available(profile.id,p_quest_definition_id)
    then return jsonb_build_object('status','quest_prerequisite_not_met'); end if;
  select * into strict version from public.cozy_quest_versions
  where quest_definition_id=p_quest_definition_id and lifecycle_status in ('active','published')
    and active order by version_number desc limit 1;
  if version.quest_kind<>'progression_chapter' then return jsonb_build_object('status','quest_not_available'); end if;
  if version.configuration_revision<>p_expected_configuration_revision
    then return jsonb_build_object('status','progression_conflict'); end if;
  select entry.* into strict chain_entry
  from public.progression_active_quest_chain_versions active
  join public.progression_quest_chain_entries entry on entry.quest_chain_version_id=active.quest_chain_version_id
  where entry.quest_definition_id=p_quest_definition_id;
  insert into public.player_quest_instances(
    player_profile_id,quest_definition_id,quest_version_id,status,chain_version_id,reward_state
  ) values(profile.id,p_quest_definition_id,version.id,'active',chain_entry.quest_chain_version_id,'not_ready')
  returning * into instance;
  insert into public.player_quest_objective_progress(player_quest_instance_id,quest_objective_id)
  select instance.id,objective.id from public.cozy_quest_objectives objective
  where objective.quest_version_id=version.id;
  -- Seed level objectives from current authoritative projections.
  update public.player_quest_objective_progress progress set
    current_count=least(objective.required_count,case objective.objective_key
      when 'reach_player_level' then (select current_level from public.player_level_progress where player_profile_id=profile.id)
      when 'reach_skill_level' then coalesce((select current_level from public.player_skill_progress
        where player_profile_id=profile.id and skill_definition_id=objective.target_reference_id),0)
      else 0 end),
    completed_at=case when case objective.objective_key
      when 'reach_player_level' then (select current_level from public.player_level_progress where player_profile_id=profile.id)
      when 'reach_skill_level' then coalesce((select current_level from public.player_skill_progress
        where player_profile_id=profile.id and skill_definition_id=objective.target_reference_id),0)
      else 0 end>=objective.required_count then now() else null end
  from public.cozy_quest_objectives objective
  where progress.player_quest_instance_id=instance.id and progress.quest_objective_id=objective.id;
  return jsonb_build_object('status','accepted','quest',private.progression_quest_json(profile.id,p_quest_definition_id,instance.id));
end;
$$;

create or replace function public.track_player_progression_quest(
  p_wallet_address text,
  p_quest_instance_id uuid,
  p_track boolean,
  p_expected_state_version integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare profile public.player_profiles%rowtype; instance public.player_quest_instances%rowtype;
begin
  if p_quest_instance_id is null or p_track is null or p_expected_state_version<1
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_QUEST_TRACK_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','progression_not_found'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'progression_write',30)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into instance from public.player_quest_instances
  where id=p_quest_instance_id and player_profile_id=profile.id and status='active' for update;
  if not found then return jsonb_build_object('status','quest_not_found'); end if;
  if instance.state_version<>p_expected_state_version
    then return jsonb_build_object('status','progression_conflict'); end if;
  if p_track then
    update public.player_quest_instances set tracked=false,state_version=state_version+1
    where player_profile_id=profile.id and tracked and status='active' and id<>instance.id;
  end if;
  update public.player_quest_instances set tracked=p_track,state_version=state_version+1
  where id=instance.id returning * into instance;
  return jsonb_build_object('status','updated','quest',private.progression_quest_json(profile.id,instance.quest_definition_id,instance.id));
end;
$$;

create or replace function public.complete_player_progression_quest(
  p_wallet_address text,
  p_quest_instance_id uuid,
  p_expected_state_version integer,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected record; instance public.player_quest_instances%rowtype;
  version public.cozy_quest_versions%rowtype; incomplete_count integer; completion_id uuid:=gen_random_uuid();
  reward_row record; pending_count integer; dust_ledger_id uuid;
begin
  if p_quest_instance_id is null or p_expected_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_QUEST_COMPLETION_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','progression_not_found'); end if;
  profile:=selected.profile_row;moderation:=selected.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'progression_write',20)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into instance from public.player_quest_instances
  where id=p_quest_instance_id and player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','quest_not_found'); end if;
  if instance.status='reward_claimed' then
    return jsonb_build_object('status','replayed','quest',private.progression_quest_json(profile.id,instance.quest_definition_id,instance.id));
  end if;
  if instance.state_version<>p_expected_state_version
    then return jsonb_build_object('status','progression_conflict'); end if;
  select * into strict version from public.cozy_quest_versions where id=instance.quest_version_id;
  if version.quest_kind<>'progression_chapter' then return jsonb_build_object('status','quest_not_available'); end if;
  select count(*) into incomplete_count
  from public.player_quest_objective_progress progress
  join public.cozy_quest_objectives objective on objective.id=progress.quest_objective_id
  where progress.player_quest_instance_id=instance.id and progress.current_count<objective.required_count;
  if incomplete_count>0 then return jsonb_build_object('status','quest_objective_incomplete'); end if;

  insert into public.player_progression_rewards(
    player_profile_id,reward_definition_id,source_completion_id,status
  )
  select profile.id,reward.id,completion_id,'pending'
  from public.progression_reward_definitions reward
  where reward.source_type='quest' and reward.source_version_id=version.id and reward.enabled
  on conflict do nothing;
  for reward_row in
    select reward.id from public.player_progression_rewards reward
    where reward.player_profile_id=profile.id and reward.source_completion_id=completion_id
  loop
    perform private.progression_settle_reward(reward_row.id,p_request_id);
  end loop;
  select count(*) into pending_count from public.player_progression_rewards reward
  where reward.player_profile_id=profile.id and reward.source_completion_id=completion_id
    and reward.status<>'settled';
  select ledger.id into dust_ledger_id from public.player_dust_ledger ledger
  join public.player_progression_rewards reward on reward.id::text=ledger.reference_id
  join public.progression_reward_definitions definition on definition.id=reward.reward_definition_id
  where reward.player_profile_id=profile.id and reward.source_completion_id=completion_id
    and definition.reward_type='dust' order by ledger.created_at desc limit 1;

  update public.player_quest_instances set status='reward_claimed',tracked=false,
    completed_at=now(),reward_settled_at=now(),reward_ledger_entry_id=dust_ledger_id,
    completion_event_id=completion_id,reward_state=case when pending_count=0 then 'settled' else 'pending' end,
    state_version=state_version+1,last_error_code=case when pending_count=0 then null else 'REWARD_PENDING' end
  where id=instance.id returning * into instance;
  return jsonb_build_object(
    'status',case when pending_count=0 then 'completed' else 'reward_pending' end,
    'quest',private.progression_quest_json(profile.id,instance.quest_definition_id,instance.id),
    'progression',private.progression_workspace_json(profile.id,20)
  );
end;
$$;

create or replace function public.update_player_progression_identity(
  p_wallet_address text,
  p_title_id uuid,
  p_badge_id uuid,
  p_expected_revision integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare profile public.player_profiles%rowtype; preferences public.player_progression_preferences%rowtype;
  title public.progression_titles%rowtype; badge public.progression_badges%rowtype;
begin
  if p_expected_revision<1 or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_TITLE_UPDATE_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address for update;
  if not found then return jsonb_build_object('status','progression_not_found'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'title_write',20)
    then return jsonb_build_object('status','rate_limited'); end if;
  perform private.ensure_player_progression(profile.id);
  select * into preferences from public.player_progression_preferences
  where player_profile_id=profile.id for update;
  if preferences.progression_revision<>p_expected_revision
    then return jsonb_build_object('status','progression_conflict'); end if;
  if p_title_id is not null then
    select * into title from public.progression_titles where id=p_title_id and enabled;
    if not found then return jsonb_build_object('status','title_disabled'); end if;
    if not exists(select 1 from public.player_progression_titles owned
      where owned.player_profile_id=profile.id and owned.title_id=p_title_id)
      then return jsonb_build_object('status','title_not_owned'); end if;
  end if;
  if p_badge_id is not null then
    select * into badge from public.progression_badges where id=p_badge_id and enabled;
    if not found then return jsonb_build_object('status','badge_disabled'); end if;
    if not exists(select 1 from public.player_progression_badges owned
      where owned.player_profile_id=profile.id and owned.badge_id=p_badge_id)
      then return jsonb_build_object('status','badge_not_owned'); end if;
  end if;
  update public.player_progression_preferences set equipped_title_id=p_title_id,
    selected_badge_id=p_badge_id,progression_revision=progression_revision+1
  where player_profile_id=profile.id returning * into preferences;
  update public.player_profiles set
    equipped_title_key=case when p_title_id is null then null else title.title_key end,
    selected_badge_key=case when p_badge_id is null then null else badge.badge_key end
  where id=profile.id;
  return jsonb_build_object('status','updated','progression',private.progression_workspace_json(profile.id,20));
end;
$$;

create or replace function public.retry_player_progression_reward(
  p_wallet_address text,
  p_reward_id uuid,
  p_expected_revision integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare profile public.player_profiles%rowtype; reward public.player_progression_rewards%rowtype;
  result text;
begin
  if p_reward_id is null or p_expected_revision<1 or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_REWARD_RETRY_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','progression_not_found'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'progression_write',20)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into reward from public.player_progression_rewards
  where id=p_reward_id and player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','reward_not_found'); end if;
  if reward.progression_revision<>p_expected_revision
    then return jsonb_build_object('status','progression_conflict'); end if;
  result:=private.progression_settle_reward(reward.id,p_request_id);
  return jsonb_build_object('status',result,'progression',private.progression_workspace_json(profile.id,20));
end;
$$;

create or replace function public.get_player_progression_events(
  p_wallet_address text,
  p_after_event_number bigint,
  p_limit integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare profile public.player_profiles%rowtype;
begin
  if p_after_event_number<0 or p_limit not between 1 and 50
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_EVENT_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','progression_not_found'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'progression_event_read',30)
    then return jsonb_build_object('status','rate_limited'); end if;
  return jsonb_build_object(
    'status','loaded',
    'events',coalesce((select jsonb_agg(jsonb_build_object(
      'eventNumber',page.event_number,'eventKey',page.event_key,
      'relatedEntityId',page.related_entity_id,'payload',page.safe_payload,'createdAt',page.created_at
    ) order by page.event_number) from (
      select * from public.progression_owner_events event
      where event.player_profile_id=profile.id and event.event_number>p_after_event_number
      order by event.event_number limit p_limit
    ) page),'[]'::jsonb),
    'lastEventNumber',coalesce((select max(page.event_number) from (
      select event.event_number from public.progression_owner_events event
      where event.player_profile_id=profile.id and event.event_number>p_after_event_number
      order by event.event_number limit p_limit
    ) page),p_after_event_number)
  );
end;
$$;

-- Only protected services may execute player progression RPCs. Browser roles
-- retain zero direct table or function authority.
revoke all on function public.get_player_progression_workspace(text,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.accept_player_progression_quest(text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.track_player_progression_quest(text,uuid,boolean,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.complete_player_progression_quest(text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.update_player_progression_identity(text,uuid,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.retry_player_progression_reward(text,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.get_player_progression_events(text,bigint,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.get_player_progression_workspace(text,integer,text) to service_role;
grant execute on function public.accept_player_progression_quest(text,uuid,integer,text,text) to service_role;
grant execute on function public.track_player_progression_quest(text,uuid,boolean,integer,text) to service_role;
grant execute on function public.complete_player_progression_quest(text,uuid,integer,text,text) to service_role;
grant execute on function public.update_player_progression_identity(text,uuid,uuid,integer,text) to service_role;
grant execute on function public.retry_player_progression_reward(text,uuid,integer,text) to service_role;
grant execute on function public.get_player_progression_events(text,bigint,integer,text) to service_role;
