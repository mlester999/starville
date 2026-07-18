-- Starville Phase 12A player authority, lazy UTC daily generation, canonical
-- gameplay-event adapters, reconnect-safe projection, and bounded recovery.

create or replace function private.player_experience_claim_rate_limit(
  p_player_profile_id uuid,p_scope text,p_limit integer,p_window_seconds integer
)
returns boolean
language plpgsql volatile security definer set search_path=''
as $$
declare claimed boolean;
begin
  if p_player_profile_id is null
     or p_scope not in ('start','resume','pause','preference','acknowledge','skip','recovery','daily_refresh')
     or p_limit not between 1 and 600 or p_window_seconds not between 1 and 3600 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('player-experience-rate:'||p_player_profile_id::text||':'||p_scope,0)
  );
  insert into public.player_experience_rate_limits(
    player_profile_id,scope,attempt_count,window_started_at,window_expires_at,updated_at
  ) values(p_player_profile_id,p_scope,1,now(),now()+make_interval(secs=>p_window_seconds),now())
  on conflict(player_profile_id,scope) do update set
    attempt_count=case when player_experience_rate_limits.window_expires_at<=now()
      then 1 else player_experience_rate_limits.attempt_count+1 end,
    window_started_at=case when player_experience_rate_limits.window_expires_at<=now()
      then now() else player_experience_rate_limits.window_started_at end,
    window_expires_at=case when player_experience_rate_limits.window_expires_at<=now()
      then now()+make_interval(secs=>p_window_seconds) else player_experience_rate_limits.window_expires_at end,
    updated_at=now()
  where player_experience_rate_limits.window_expires_at<=now()
     or player_experience_rate_limits.attempt_count<p_limit
  returning true into claimed;
  return coalesce(claimed,false);
end;
$$;

create or replace function private.ensure_player_daily_assignment(p_player_profile_id uuid)
returns uuid
language plpgsql volatile security definer set search_path=''
as $$
declare assignment public.player_daily_assignments%rowtype;
  policy public.player_experience_daily_policy_versions%rowtype;
  profile public.player_profiles%rowtype;
  selected_count integer;
begin
  select * into strict profile from public.player_profiles where id=p_player_profile_id;
  select version.* into strict policy
  from public.player_experience_active_daily_policy active
  join public.player_experience_daily_policy_versions version on version.id=active.policy_version_id
  where active.singleton_key and version.status='active' and version.effective_at<=now();
  select * into assignment from public.player_daily_assignments
  where player_profile_id=p_player_profile_id and game_day_key=(now() at time zone 'UTC')::date;
  if found then return assignment.id; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('player-daily:'||p_player_profile_id::text||':'||((now() at time zone 'UTC')::date)::text,0)
  );
  select * into assignment from public.player_daily_assignments
  where player_profile_id=p_player_profile_id and game_day_key=(now() at time zone 'UTC')::date;
  if found then return assignment.id; end if;

  insert into public.player_daily_assignments(
    player_profile_id,policy_version_id,game_day_key,generation_evidence
  ) values(
    p_player_profile_id,policy.id,(now() at time zone 'UTC')::date,
    jsonb_build_object(
      'selection','deterministic_player_day_hash','objectiveCount',3,'timezone','UTC',
      'maximumSocialObjectives',1,'soloSafeRequired',true,'playerLevel',coalesce(profile.public_level,1)
    )
  ) returning * into assignment;

  insert into public.player_daily_objective_progress(
    assignment_id,player_profile_id,objective_definition_id,sequence_number,required_count,safe_metadata
  )
  select assignment.id,p_player_profile_id,eligible.id,
    row_number() over(order by eligible.selection_group,eligible.selection_hash)::integer,
    eligible.required_count,
    jsonb_build_object('objectiveKey',eligible.objective_key,'category',eligible.category,
      'soloSafe',eligible.solo_safe,'social',eligible.social,'rewardPolicy',policy.reward_policy)
  from (
    select ranked.* from (
      select definition.*,
        case when definition.category='farming' then 0 else 1 end as selection_group,
        md5(p_player_profile_id::text||':'||assignment.game_day_key::text||':'||definition.objective_key) as selection_hash,
        row_number() over(
          partition by (definition.category='farming')
          order by md5(p_player_profile_id::text||':'||assignment.game_day_key::text||':'||definition.objective_key)
        ) as category_rank
      from public.player_experience_daily_objective_definitions definition
    where definition.policy_version_id=policy.id
      and definition.enabled and definition.minimum_player_level<=coalesce(profile.public_level,1)
      and (definition.objective_key<>'daily-plant-crop' or exists(
        select 1 from public.cozy_farming_settings settings
        where settings.singleton_key and settings.planting_enabled
      ))
      and (definition.objective_key<>'daily-water-crop' or exists(
        select 1 from public.cozy_farming_settings settings
        where settings.singleton_key and settings.planting_enabled
      ))
      and (definition.objective_key<>'daily-harvest-crop' or exists(
        select 1 from public.cozy_farming_settings settings
        where settings.singleton_key and settings.harvesting_enabled
      ))
      and (definition.required_feature_key<>'housing' or exists(
        select 1 from public.player_homes home where home.player_profile_id=p_player_profile_id
      ) and exists(
        select 1 from public.housing_live_ops live_ops
        where live_ops.singleton_key and live_ops.layout_saves_enabled
      ))
      and (definition.required_feature_key<>'production' or exists(
        select 1 from public.player_home_workstations station where station.player_profile_id=p_player_profile_id and station.enabled
      ) and exists(
        select 1 from public.cozy_crafting_settings settings
        where settings.singleton_key and settings.collection_enabled
      ))
      and (definition.required_feature_key<>'home_visits' or exists(
        select 1 from public.player_homes home where home.player_profile_id=p_player_profile_id
      ))
      and (definition.required_feature_key<>'general_store' or exists(
        select 1 from public.cozy_shop_definitions shop
        join public.economy_shop_live_ops live_ops on live_ops.shop_definition_id=shop.id
        join public.economy_active_policy active_policy on active_policy.singleton_key
        join public.economy_policy_versions economy_policy on economy_policy.id=active_policy.policy_version_id
        where shop.slug='lantern-general-store' and shop.active
          and live_ops.access_enabled and (live_ops.buying_enabled or live_ops.selling_enabled)
          and economy_policy.economy_enabled and economy_policy.purchases_enabled
      ))
      and (definition.required_feature_key<>'progression' or exists(
        select 1 from public.progression_live_ops live_ops
        where live_ops.singleton_key and live_ops.xp_grants_enabled
      ))
    ) ranked
    where (ranked.category='farming' and ranked.category_rank=1)
       or (ranked.category<>'farming' and ranked.category_rank<=2)
    order by ranked.selection_group,ranked.selection_hash
    limit 3
  ) eligible;
  get diagnostics selected_count=row_count;
  if selected_count<>3 then
    update public.player_daily_assignments set status='blocked',assignment_revision=assignment_revision+1
    where id=assignment.id;
    insert into public.player_experience_recovery_queue(
      player_profile_id,onboarding_version_id,reason_code,status,expected_state_revision,
      request_id,idempotency_key_hash,evidence
    ) select p_player_profile_id,active.onboarding_version_id,'state_out_of_sync','investigation_required',
      coalesce(state.state_revision,1),'daily-generation:'||assignment.id::text,
      encode(extensions.digest(convert_to('daily-generation:'||assignment.id::text,'UTF8'),'sha256'),'hex'),
      jsonb_build_object('assignmentId',assignment.id,'selectedCount',selected_count)
    from public.player_experience_active_onboarding active
    left join public.player_onboarding_states state on state.player_profile_id=p_player_profile_id
    where active.singleton_key
    on conflict(player_profile_id,idempotency_key_hash) do nothing;
  else
    insert into public.player_experience_owner_events(
      player_profile_id,event_key,priority,related_entity_id,title,message,safe_payload
    ) values(
      p_player_profile_id,'daily_objectives_generated','informational',assignment.id,
      'A new Daily Rhythm is ready','Three eligible UTC daily objectives are ready.',
      jsonb_build_object('gameDayKey',assignment.game_day_key,'policyVersion','starville_daily_rhythm_v1')
    );
    insert into public.player_experience_telemetry_events(
      player_profile_id,event_key,game_day_key,safe_dimensions
    ) values(p_player_profile_id,'daily_objectives_generated',assignment.game_day_key,
      jsonb_build_object('objectiveCount',3,'timezone','UTC'));
  end if;
  return assignment.id;
end;
$$;

create or replace function private.player_experience_recompute_onboarding(p_player_profile_id uuid)
returns void
language plpgsql volatile security definer set search_path=''
as $$
declare state public.player_onboarding_states%rowtype; next_step public.player_experience_onboarding_steps%rowtype;
  missing_required integer;
begin
  select * into strict state from public.player_onboarding_states
  where player_profile_id=p_player_profile_id for update;
  select step.* into next_step
  from public.player_experience_onboarding_steps step
  where step.onboarding_version_id=state.onboarding_version_id
    and not exists(
      select 1 from public.player_onboarding_step_evidence evidence
      where evidence.player_profile_id=p_player_profile_id and evidence.onboarding_step_id=step.id
    )
    and not (step.optional and state.skipped_at is not null)
  order by step.sequence_number limit 1;
  select count(*) into missing_required
  from public.player_experience_onboarding_steps step
  where step.onboarding_version_id=state.onboarding_version_id and not step.optional
    and not exists(
      select 1 from public.player_onboarding_step_evidence evidence
      where evidence.player_profile_id=p_player_profile_id and evidence.onboarding_step_id=step.id
    );
  if missing_required=0 then
    update public.player_onboarding_states set
      status='completed',completed_at=coalesce(completed_at,now()),last_progressed_at=now(),
      reward_settlement_state='settled',state_revision=state_revision+1,updated_at=now(),
      current_step_key=coalesce(next_step.step_key,current_step_key),
      current_chapter_key=coalesce(next_step.chapter_key,current_chapter_key)
    where player_profile_id=p_player_profile_id and status<>'completed';
    if found then
      insert into public.player_experience_owner_events(
        player_profile_id,event_key,priority,title,message,safe_payload
      ) values(p_player_profile_id,'onboarding_completed','progress','Core journey complete',
        'You know the Starville basics. Your Daily Rhythm and Guide remain available.',
        jsonb_build_object('version','starville_core_onboarding_v1','economicReward',false));
      insert into public.player_experience_telemetry_events(
        player_profile_id,event_key,onboarding_version_key,safe_dimensions
      ) values(p_player_profile_id,'onboarding_completed','starville_core_onboarding_v1',
        jsonb_build_object('migratedExistingPlayer',state.migrated_existing_player));
    end if;
  elsif next_step.id is not null then
    update public.player_onboarding_states set
      current_step_key=next_step.step_key,current_chapter_key=next_step.chapter_key,
      last_progressed_at=now(),state_revision=state_revision+1,updated_at=now()
    where player_profile_id=p_player_profile_id
      and (current_step_key is distinct from next_step.step_key
        or current_chapter_key is distinct from next_step.chapter_key);
  end if;
end;
$$;

create or replace function private.player_experience_apply_onboarding_event(
  p_player_profile_id uuid,p_event_key text,p_source_entity_id uuid,p_source_table text,
  p_quantity integer,p_request_id text,p_safe_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql volatile security definer set search_path=''
as $$
declare state public.player_onboarding_states%rowtype; step public.player_experience_onboarding_steps%rowtype;
  inserted_count integer:=0;
begin
  select * into state from public.player_onboarding_states where player_profile_id=p_player_profile_id;
  if not found then return 0; end if;
  select * into step from public.player_experience_onboarding_steps
  where onboarding_version_id=state.onboarding_version_id and authoritative_event_key=p_event_key
  order by sequence_number limit 1;
  if not found then return 0; end if;
  insert into public.player_onboarding_step_evidence(
    player_profile_id,onboarding_version_id,onboarding_step_id,source_event_key,source_entity_id,
    source_table,quantity,request_id,safe_metadata
  ) values(
    p_player_profile_id,state.onboarding_version_id,step.id,p_event_key,p_source_entity_id,
    p_source_table,greatest(1,p_quantity),p_request_id,p_safe_metadata
  ) on conflict(player_profile_id,onboarding_step_id,source_event_key,source_entity_id) do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count>0 then
    insert into public.player_experience_owner_events(
      player_profile_id,event_key,priority,related_entity_id,title,message,safe_payload
    ) values(
      p_player_profile_id,'onboarding_step_completed','progress',step.id,step.title,
      'Objective complete. Your next Starville step is ready.',
      jsonb_build_object('stepKey',step.step_key,'chapterKey',step.chapter_key,
        'sourceEventKey',p_event_key)
    );
    insert into public.player_experience_telemetry_events(
      player_profile_id,event_key,onboarding_version_key,chapter_key,step_key,safe_dimensions
    ) values(
      p_player_profile_id,'onboarding_step_completed','starville_core_onboarding_v1',
      step.chapter_key,step.step_key,jsonb_build_object('sourceTable',p_source_table)
    );
    perform private.player_experience_recompute_onboarding(p_player_profile_id);
  end if;
  return inserted_count;
end;
$$;

create or replace function private.player_experience_apply_daily_event(
  p_player_profile_id uuid,p_event_key text,p_source_entity_id uuid,p_quantity integer,p_request_id text
)
returns integer
language plpgsql volatile security definer set search_path=''
as $$
declare daily_assignment_id uuid; progress public.player_daily_objective_progress%rowtype;
  definition public.player_experience_daily_objective_definitions%rowtype;
  inserted_count integer:=0; completed_count integer; assignment public.player_daily_assignments%rowtype;
begin
  daily_assignment_id:=private.ensure_player_daily_assignment(p_player_profile_id);
  select objective_progress.* into progress
  from public.player_daily_objective_progress objective_progress
  join public.player_experience_daily_objective_definitions objective
    on objective.id=objective_progress.objective_definition_id
  where objective_progress.assignment_id=daily_assignment_id and objective.authoritative_event_key=p_event_key
    and objective_progress.status='active'
  order by objective_progress.sequence_number limit 1 for update of objective_progress;
  if not found then return 0; end if;
  select objective.* into strict definition
  from public.player_experience_daily_objective_definitions objective
  where objective.id=progress.objective_definition_id;
  insert into public.player_daily_objective_contributions(
    player_profile_id,progress_id,source_event_key,source_entity_id,progress_delta
  ) values(p_player_profile_id,progress.id,p_event_key,p_source_entity_id,greatest(1,p_quantity))
  on conflict do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count=0 then return 0; end if;
  update public.player_daily_objective_progress set
    current_count=least(required_count,current_count+greatest(1,p_quantity)),
    status=case when current_count+greatest(1,p_quantity)>=required_count then 'settled' else status end,
    completed_at=case when current_count+greatest(1,p_quantity)>=required_count then coalesce(completed_at,now()) else completed_at end,
    settled_at=case when current_count+greatest(1,p_quantity)>=required_count then coalesce(settled_at,now()) else settled_at end,
    last_source_event_key=p_event_key,last_source_entity_id=p_source_entity_id,
    progress_revision=progress_revision+1
  where id=progress.id returning * into progress;
  update public.player_daily_assignments set assignment_revision=assignment_revision+1 where id=daily_assignment_id;
  insert into public.player_experience_owner_events(
    player_profile_id,event_key,priority,related_entity_id,title,message,safe_payload
  ) values(
    p_player_profile_id,
    case when progress.status='settled' then 'daily_objective_completed' else 'daily_objective_progressed' end,
    'progress',progress.id,definition.title,
    case when progress.status='settled' then 'Daily objective complete. Non-economic progress settled exactly once.'
      else 'Daily objective progress updated.' end,
    jsonb_build_object('objectiveKey',definition.objective_key,'currentCount',progress.current_count,
      'requiredCount',progress.required_count,'rewardPolicy','non_economic_completion_progress')
  );
  if progress.status='settled' then
    perform private.player_experience_apply_onboarding_event(
      p_player_profile_id,'daily_objective_completed',progress.id,'player_daily_objective_progress',1,
      p_request_id,jsonb_build_object('gameDayKey',(now() at time zone 'UTC')::date)
    );
  end if;
  select count(*) into completed_count from public.player_daily_objective_progress
  where assignment_id=daily_assignment_id and status='settled';
  if completed_count=3 then
    update public.player_daily_assignments set status='completed',completed_at=coalesce(completed_at,now()),
      completion_settled_at=coalesce(completion_settled_at,now()),assignment_revision=assignment_revision+1
    where id=daily_assignment_id and status='active' returning * into assignment;
    if found then
      insert into public.player_experience_owner_events(
        player_profile_id,event_key,priority,related_entity_id,title,message,safe_payload
      ) values(p_player_profile_id,'daily_set_completed','progress',assignment.id,
        'Daily Rhythm complete','All three objectives are complete. The completion mark is non-economic.',
        jsonb_build_object('gameDayKey',assignment.game_day_key,'dustReward',0,'xpReward',0));
    end if;
  end if;
  return inserted_count;
end;
$$;

create or replace function private.player_experience_apply_trusted_event(
  p_player_profile_id uuid,p_event_key text,p_source_entity_id uuid,p_source_table text,
  p_quantity integer,p_request_id text,p_safe_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql volatile security definer set search_path=''
as $$
begin
  perform private.player_experience_apply_onboarding_event(
    p_player_profile_id,p_event_key,p_source_entity_id,p_source_table,p_quantity,p_request_id,p_safe_metadata
  );
  perform private.player_experience_apply_daily_event(
    p_player_profile_id,p_event_key,p_source_entity_id,p_quantity,p_request_id
  );
end;
$$;

create or replace function private.player_experience_backfill(p_player_profile_id uuid)
returns void
language plpgsql volatile security definer set search_path=''
as $$
declare evidence record;
begin
  perform private.player_experience_apply_onboarding_event(
    p_player_profile_id,'player_entered_lantern_square',p_player_profile_id,'player_profiles',1,
    'phase12a-backfill:arrival:'||p_player_profile_id::text,'{"derived":true}'::jsonb
  );
  if exists(select 1 from public.player_profiles profile where profile.id=p_player_profile_id
    and (abs(profile.safe_position_x-12)>0.5 or abs(profile.safe_position_y-7.5)>0.5)) then
    perform private.player_experience_apply_onboarding_event(
      p_player_profile_id,'player_movement_verified',p_player_profile_id,'player_profiles',1,
      'phase12a-backfill:movement:'||p_player_profile_id::text,'{"derived":true}'::jsonb
    );
  end if;
  for evidence in
    select event.id,event.event_key from public.player_quest_events event
    where event.player_profile_id=p_player_profile_id
      and event.event_key in ('quest_accepted','plot_entered') order by event.created_at
  loop
    perform private.player_experience_apply_onboarding_event(
      p_player_profile_id,case evidence.event_key when 'quest_accepted' then 'npc_interacted'
        else 'player_entered_personal_home' end,evidence.id,'player_quest_events',1,
      'phase12a-backfill:quest:'||evidence.id::text,'{"derived":true}'::jsonb
    );
  end loop;
  for evidence in
    select event.id,event.event_key from public.cozy_private_plot_events event
    where event.player_profile_id=p_player_profile_id
      and event.event_key in ('crop_planted','crop_watered','crop_harvested','crafting_job_collected','home_layout_saved')
    order by event.created_at
  loop
    perform private.player_experience_apply_onboarding_event(
      p_player_profile_id,case evidence.event_key
        when 'crafting_job_collected' then 'workstation_job_collected'
        when 'home_layout_saved' then 'decoration_layout_saved' else evidence.event_key end,
      evidence.id,'cozy_private_plot_events',1,'phase12a-backfill:plot:'||evidence.id::text,
      '{"derived":true}'::jsonb
    );
  end loop;
  for evidence in
    select event.related_entity_id as id,event.event_key,event.event_number
    from public.economy_shop_events event
    where event.player_profile_id=p_player_profile_id
      and event.event_key in ('shop_purchase_completed','shop_sale_completed')
    order by event.event_number
  loop
    perform private.player_experience_apply_onboarding_event(
      p_player_profile_id,'shop_transaction_completed',evidence.id,'economy_shop_events',1,
      'phase12a-backfill:shop:'||evidence.event_number::text,'{"derived":true}'::jsonb
    );
  end loop;
  for evidence in
    select acknowledgement.id,acknowledgement.acknowledgement_key
    from public.player_experience_acknowledgements acknowledgement
    where acknowledgement.player_profile_id=p_player_profile_id
  loop
    perform private.player_experience_apply_onboarding_event(
      p_player_profile_id,evidence.acknowledgement_key,evidence.id,'player_experience_acknowledgements',1,
      'phase12a-backfill:ack:'||evidence.id::text,'{"derived":true}'::jsonb
    );
  end loop;
end;
$$;

create or replace function private.ensure_player_onboarding(p_player_profile_id uuid)
returns void
language plpgsql volatile security definer set search_path=''
as $$
declare version public.player_experience_onboarding_versions%rowtype; first_step public.player_experience_onboarding_steps%rowtype;
  profile public.player_profiles%rowtype; created_count integer:=0;
begin
  select version_row.* into strict version
  from public.player_experience_active_onboarding active
  join public.player_experience_onboarding_versions version_row on version_row.id=active.onboarding_version_id
  where active.singleton_key and version_row.status='active' and version_row.effective_at<=now();
  select * into strict first_step from public.player_experience_onboarding_steps
  where onboarding_version_id=version.id order by sequence_number limit 1;
  select * into strict profile from public.player_profiles where id=p_player_profile_id;
  insert into public.player_onboarding_states(
    player_profile_id,onboarding_version_id,status,current_step_key,current_chapter_key,
    migrated_existing_player,safe_metadata
  ) values(
    p_player_profile_id,version.id,
    case when profile.created_at<version.created_at then 'migrated' else 'not_started' end,
    first_step.step_key,first_step.chapter_key,profile.created_at<version.created_at,
    jsonb_build_object('eligibility','real_account_state','starterRewardsOwnedByCanonicalSystems',true)
  ) on conflict(player_profile_id) do nothing;
  get diagnostics created_count=row_count;
  if created_count>0 then
    perform private.player_experience_backfill(p_player_profile_id);
    if profile.created_at<version.created_at then
      insert into public.player_experience_owner_events(
        player_profile_id,event_key,priority,title,message,safe_payload
      ) values(p_player_profile_id,'onboarding_migrated','informational',
        'Your Starville progress is preserved','Completed actions were recognized without duplicating starter rewards.',
        jsonb_build_object('version',version.version_key));
    end if;
  end if;
end;
$$;

create or replace function private.player_experience_step_json(
  p_player_profile_id uuid,p_state public.player_onboarding_states,p_step public.player_experience_onboarding_steps
)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'key',p_step.step_key,'chapter',p_step.chapter_key,'title',p_step.title,
    'instruction',p_step.instruction,'progress',case when evidence.id is null then 0 else p_step.required_count end,
    'required',p_step.required_count,
    'status',case
      when evidence.id is not null and coalesce((evidence.safe_metadata->>'skipped')::boolean,false) then 'skipped'
      when evidence.id is not null then 'completed'
      when p_state.status='blocked' and p_state.current_step_key=p_step.step_key then 'blocked'
      when p_state.current_step_key=p_step.step_key and p_state.status in ('active','migrated','not_started') then 'active'
      when p_step.sequence_number<current_step.sequence_number then 'available'
      else 'locked' end,
    'optional',p_step.optional,'completedAt',evidence.created_at,
    'evidenceEventKey',evidence.source_event_key,'guidanceTarget',p_step.semantic_target_key,
    'recoveryHint',p_step.recovery_hint
  )
  from public.player_experience_onboarding_steps current_step
  left join lateral (
    select selected.* from public.player_onboarding_step_evidence selected
    where selected.player_profile_id=p_player_profile_id and selected.onboarding_step_id=p_step.id
    order by selected.created_at limit 1
  ) evidence on true
  where current_step.onboarding_version_id=p_state.onboarding_version_id
    and current_step.step_key=p_state.current_step_key;
$$;

create or replace function private.player_experience_workspace_json(
  p_player_profile_id uuid,p_feedback_after bigint,p_feedback_limit integer
)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare state public.player_onboarding_states%rowtype; assignment public.player_daily_assignments%rowtype;
  current_step public.player_experience_onboarding_steps%rowtype; active_objective jsonb;
  completed_daily integer; quest_total integer; quest_completed integer; workspace_assignment_id uuid;
begin
  perform private.ensure_player_onboarding(p_player_profile_id);
  workspace_assignment_id:=private.ensure_player_daily_assignment(p_player_profile_id);
  select * into strict state from public.player_onboarding_states where player_profile_id=p_player_profile_id;
  select * into strict assignment from public.player_daily_assignments where id=workspace_assignment_id;
  select * into strict current_step from public.player_experience_onboarding_steps
    where onboarding_version_id=state.onboarding_version_id and step_key=state.current_step_key;
  select count(*) into completed_daily from public.player_daily_objective_progress
    where player_daily_objective_progress.assignment_id=assignment.id and status='settled';
  select count(*),count(*) filter(where instance.status='reward_claimed')
  into quest_total,quest_completed
  from public.progression_active_quest_chain_versions active
  join public.progression_quest_chains chain on chain.id=active.quest_chain_id and chain.chain_key='starville-beginnings'
  join public.progression_quest_chain_entries entry on entry.quest_chain_version_id=active.quest_chain_version_id
  left join public.player_quest_instances instance on instance.player_profile_id=p_player_profile_id
    and instance.quest_definition_id=entry.quest_definition_id;

  if state.status not in ('completed','skipped','paused') then
    select jsonb_build_object(
      'source','onboarding','key',current_step.step_key,'title',current_step.title,
      'instruction',current_step.instruction,'progress',0,'required',current_step.required_count,
      'guidanceTarget',current_step.semantic_target_key,'routeHint',coalesce(target.fallback_hint,current_step.recovery_hint)
    ) into active_objective
    from public.player_experience_guidance_targets target
    where target.semantic_key=current_step.semantic_target_key;
  else
    select jsonb_build_object(
      'source','daily','key',definition.objective_key,'title',definition.title,
      'instruction',definition.description,'progress',progress.current_count,'required',progress.required_count,
      'guidanceTarget',definition.semantic_target_key,'routeHint',coalesce(target.fallback_hint,definition.description)
    ) into active_objective
    from public.player_daily_objective_progress progress
    join public.player_experience_daily_objective_definitions definition on definition.id=progress.objective_definition_id
    left join public.player_experience_guidance_targets target on target.semantic_key=definition.semantic_target_key
    where progress.assignment_id=assignment.id and progress.status='active'
    order by progress.sequence_number limit 1;
  end if;

  return jsonb_build_object(
    'onboarding',jsonb_build_object(
      'version','starville_core_onboarding_v1','status',state.status,
      'currentChapter',state.current_chapter_key,'currentStep',state.current_step_key,
      'revision',state.state_revision,'startedAt',state.started_at,
      'lastProgressedAt',state.last_progressed_at,'completedAt',state.completed_at,
      'skippedAt',state.skipped_at,'migratedExistingPlayer',state.migrated_existing_player,
      'rewardSettlementState',state.reward_settlement_state,
      'steps',(select jsonb_agg(private.player_experience_step_json(p_player_profile_id,state,step)
        order by step.sequence_number) from public.player_experience_onboarding_steps step
        where step.onboarding_version_id=state.onboarding_version_id)
    ),
    'activeObjective',active_objective,
    'daily',jsonb_build_object(
      'policyVersion','starville_daily_rhythm_v1','gameDayKey',assignment.game_day_key,
      'timezone','UTC','resetAt',(assignment.game_day_key+1)::timestamp at time zone 'UTC',
      'assignmentRevision',assignment.assignment_revision,
      'objectives',(select jsonb_agg(jsonb_build_object(
        'assignmentId',progress.id,'objectiveKey',definition.objective_key,'category',definition.category,
        'title',definition.title,'description',definition.description,'progress',progress.current_count,
        'required',progress.required_count,'status',progress.status,'soloSafe',definition.solo_safe,
        'rewardLabel','Daily Rhythm progress (non-economic)','completedAt',progress.completed_at,
        'settledAt',progress.settled_at,'guidanceTarget',definition.semantic_target_key
      ) order by progress.sequence_number)
      from public.player_daily_objective_progress progress
      join public.player_experience_daily_objective_definitions definition on definition.id=progress.objective_definition_id
      where progress.assignment_id=assignment.id),
      'completedCount',completed_daily,
      'completionBonus',jsonb_build_object(
        'status',case when assignment.completion_settled_at is not null then 'settled'
          when completed_daily=3 then 'ready' else 'locked' end,
        'rewardLabel','Daily Rhythm completion mark (non-economic)',
        'settledAt',assignment.completion_settled_at
      )
    ),
    'guidanceTargets',(select jsonb_agg(jsonb_build_object(
      'key',target.semantic_key,'label',target.label,'semanticObjectKey',target.semantic_object_key,
      'worldKey',target.world_key,'status',case when target.enabled then 'ready' else 'unavailable' end,
      'severity',target.severity,'distance',null,'routeHint',target.fallback_hint,
      'accessibleHint',target.fallback_hint
    ) order by target.semantic_key) from public.player_experience_guidance_targets target),
    'guide',jsonb_build_array(
      jsonb_build_object('key','controls','title','Movement and controls','summary','Move in eight directions with WASD, arrow keys, or touch controls. Use E or the visible Interact prompt.','unlocked',true,'publicDocumentationPath','/how-to-play#controls'),
      jsonb_build_object('key','farming','title','Farming','summary','Prepare soil, plant a seed, water once to begin server-timed growth, then harvest when mature.','unlocked',true,'publicDocumentationPath','/how-to-play#farming'),
      jsonb_build_object('key','production','title','Cooking and crafting','summary','Jobs consume ingredients on start, continue while offline, and settle output exactly once on collection.','unlocked',true,'publicDocumentationPath','/how-to-play#cooking-and-crafting'),
      jsonb_build_object('key','general-store','title','General Store','summary','Prices, stock, limits, receipts, and DUST settlement are selected by the server.','unlocked',true,'publicDocumentationPath','/how-to-play#general-store'),
      jsonb_build_object('key','dust','title','DUST','summary','DUST is Starville’s off-chain in-game currency. It is not crypto and cannot be withdrawn.','unlocked',true,'publicDocumentationPath','/how-to-play#dust'),
      jsonb_build_object('key','progression','title','Progression','summary','Trusted gameplay grants Player Level and skill XP, quest progress, achievements, titles, badges, and unlocks.','unlocked',true,'publicDocumentationPath','/how-to-play#progression'),
      jsonb_build_object('key','housing','title','Housing','summary','Decoration Mode edits a private draft. Save a valid revision to make it active.','unlocked',true,'publicDocumentationPath','/how-to-play#housing'),
      jsonb_build_object('key','home-visits','title','Home visits','summary','Owners control visibility and View Only, Social, or Helper interactions.','unlocked',true,'publicDocumentationPath','/how-to-play#home-visits'),
      jsonb_build_object('key','daily-rhythm','title','Daily rhythm','summary','Three eligible objectives are selected for each UTC game day.','unlocked',true,'publicDocumentationPath','/how-to-play#daily-rhythm'),
      jsonb_build_object('key','troubleshooting','title','Troubleshooting','summary','Refresh authoritative state after a conflict. Pending settlements remain safe through reconnects.','unlocked',true,'publicDocumentationPath','/how-to-play#troubleshooting')
    ),
    'feedback',(select coalesce(jsonb_agg(jsonb_build_object(
      'eventNumber',event.event_number,'eventKey',event.event_key,'priority',event.priority,
      'title',event.title,'message',event.message,'relatedEntityId',event.related_entity_id,
      'createdAt',event.created_at
    ) order by event.event_number),'[]'::jsonb) from (
      select selected.* from public.player_experience_owner_events selected
      where selected.player_profile_id=p_player_profile_id and selected.event_number>p_feedback_after
      order by selected.event_number limit p_feedback_limit
    ) event),
    'feedbackCursor',coalesce((select max(event_number) from public.player_experience_owner_events
      where player_profile_id=p_player_profile_id),0),
    'guidePreferences',jsonb_build_object('minimized',state.guide_minimized,
      'reducedGuidance',state.reduced_guidance,'revision',state.state_revision),
    'starterQuestline',jsonb_build_object('chainKey','starville-beginnings','version',1,
      'canonicalQuestCount',quest_total,'completedQuestCount',quest_completed),
    'persistence','normal','serverTime',now()
  );
end;
$$;

create or replace function public.get_player_experience_workspace(
  p_wallet_address text,p_feedback_after bigint,p_feedback_limit integer,p_request_id text
)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype; selected record;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_feedback_after<0 or p_feedback_limit not between 1 and 20
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','onboarding_not_available'); end if;
  profile:=selected.profile_row;moderation:=selected.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  perform private.ensure_player_onboarding(profile.id);
  perform private.player_experience_apply_onboarding_event(
    profile.id,'player_entered_lantern_square',profile.id,'player_profiles',1,p_request_id,
    jsonb_build_object('currentMapId',profile.current_map_id)
  );
  return jsonb_build_object('status','loaded','experience',
    private.player_experience_workspace_json(profile.id,p_feedback_after,p_feedback_limit));
end;
$$;

create or replace function public.start_player_onboarding(
  p_wallet_address text,p_expected_revision integer,p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare profile public.player_profiles%rowtype; state public.player_onboarding_states%rowtype; key_hash text;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_expected_revision<1 or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','onboarding_not_available'); end if;
  perform private.ensure_player_onboarding(profile.id);
  if not private.player_experience_claim_rate_limit(profile.id,'start',10,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict state from public.player_onboarding_states where player_profile_id=profile.id for update;
  key_hash:=encode(extensions.digest(convert_to(p_idempotency_key,'UTF8'),'sha256'),'hex');
  if state.safe_metadata->>'startIdempotencyHash'=key_hash then
    return jsonb_build_object('status','started','experience',
      private.player_experience_workspace_json(profile.id,0,20));
  end if;
  if state.state_revision<>p_expected_revision then return jsonb_build_object('status','expected_revision_conflict'); end if;
  if state.status='completed' then return jsonb_build_object('status','onboarding_already_completed'); end if;
  if state.status='active' then
    return jsonb_build_object('status','started','experience',
      private.player_experience_workspace_json(profile.id,0,20));
  end if;
  update public.player_onboarding_states set status='active',started_at=coalesce(started_at,now()),
    safe_metadata=safe_metadata||jsonb_build_object('startIdempotencyHash',key_hash),
    state_revision=state_revision+1,updated_at=now() where player_profile_id=profile.id;
  insert into public.player_experience_owner_events(player_profile_id,event_key,priority,title,message,safe_payload)
  values(profile.id,'onboarding_started','informational','Welcome to Starville',
    'Follow the active objective to learn Starville through real gameplay.',
    jsonb_build_object('version','starville_core_onboarding_v1'));
  return jsonb_build_object('status','started','experience',
    private.player_experience_workspace_json(profile.id,0,20));
end;
$$;

create or replace function public.set_player_onboarding_activity(
  p_wallet_address text,p_action text,p_expected_revision integer,p_request_id text
)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare profile public.player_profiles%rowtype; state public.player_onboarding_states%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_action not in ('pause','resume') or p_expected_revision<1
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','onboarding_not_available'); end if;
  perform private.ensure_player_onboarding(profile.id);
  if not private.player_experience_claim_rate_limit(profile.id,p_action,20,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict state from public.player_onboarding_states where player_profile_id=profile.id for update;
  if state.state_revision<>p_expected_revision then return jsonb_build_object('status','expected_revision_conflict'); end if;
  if state.status='completed' then return jsonb_build_object('status','onboarding_already_completed'); end if;
  update public.player_onboarding_states set status=case when p_action='pause' then 'paused' else 'active' end,
    started_at=case when p_action='resume' then coalesce(started_at,now()) else started_at end,
    state_revision=state_revision+1,updated_at=now() where player_profile_id=profile.id;
  insert into public.player_experience_owner_events(player_profile_id,event_key,priority,title,message,safe_payload)
  values(profile.id,case when p_action='pause' then 'onboarding_paused' else 'onboarding_resumed' end,
    'informational',case when p_action='pause' then 'Guidance paused' else 'Guidance resumed' end,
    case when p_action='pause' then 'Your progress is saved. Resume from the Guide whenever you are ready.'
      else 'Your next authoritative objective is ready.' end,'{}');
  return jsonb_build_object('status',p_action||'d','experience',
    private.player_experience_workspace_json(profile.id,0,20));
end;
$$;

create or replace function public.update_player_guide_preferences(
  p_wallet_address text,p_minimized boolean,p_reduced_guidance boolean,
  p_expected_revision integer,p_request_id text
)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare profile public.player_profiles%rowtype; state public.player_onboarding_states%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_minimized is null or p_reduced_guidance is null or p_expected_revision<1
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','onboarding_not_available'); end if;
  perform private.ensure_player_onboarding(profile.id);
  if not private.player_experience_claim_rate_limit(profile.id,'preference',30,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict state from public.player_onboarding_states where player_profile_id=profile.id for update;
  if state.state_revision<>p_expected_revision then return jsonb_build_object('status','expected_revision_conflict'); end if;
  update public.player_onboarding_states set guide_minimized=p_minimized,reduced_guidance=p_reduced_guidance,
    state_revision=state_revision+1,updated_at=now() where player_profile_id=profile.id;
  insert into public.player_experience_owner_events(player_profile_id,event_key,priority,title,message,safe_payload)
  values(profile.id,'guide_preferences_updated','informational','Guide preference saved',
    'Your objective remains available with the selected guidance level.',
    jsonb_build_object('minimized',p_minimized,'reducedGuidance',p_reduced_guidance));
  return jsonb_build_object('status','updated','experience',
    private.player_experience_workspace_json(profile.id,0,20));
end;
$$;

create or replace function public.acknowledge_player_experience_step(
  p_wallet_address text,p_step_key text,p_expected_revision integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare profile public.player_profiles%rowtype; state public.player_onboarding_states%rowtype;
  acknowledgement public.player_experience_acknowledgements%rowtype; event_key text;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_step_key not in ('inspect_inventory','review_progression','review_home_visits')
     or p_expected_revision<1 or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','onboarding_not_available'); end if;
  perform private.ensure_player_onboarding(profile.id);
  if not private.player_experience_claim_rate_limit(profile.id,'acknowledge',30,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict state from public.player_onboarding_states where player_profile_id=profile.id for update;
  if state.state_revision<>p_expected_revision then return jsonb_build_object('status','expected_revision_conflict'); end if;
  event_key:=case p_step_key when 'inspect_inventory' then 'inventory_reviewed'
    when 'review_progression' then 'progression_reviewed' else 'home_visit_settings_reviewed' end;
  insert into public.player_experience_acknowledgements(
    player_profile_id,acknowledgement_key,onboarding_version_id,request_id,idempotency_key_hash
  ) values(profile.id,event_key,state.onboarding_version_id,p_request_id,
    encode(extensions.digest(convert_to(p_idempotency_key,'UTF8'),'sha256'),'hex'))
  on conflict(player_profile_id,onboarding_version_id,acknowledgement_key) do update set
    request_id=player_experience_acknowledgements.request_id
  returning * into acknowledgement;
  perform private.player_experience_apply_trusted_event(
    profile.id,event_key,acknowledgement.id,'player_experience_acknowledgements',1,p_request_id,
    jsonb_build_object('stepKey',p_step_key,'serverAcknowledged',true)
  );
  return jsonb_build_object('status','acknowledged','experience',
    private.player_experience_workspace_json(profile.id,0,20));
end;
$$;

create or replace function public.skip_player_optional_onboarding(
  p_wallet_address text,p_expected_revision integer,p_reason text,p_request_id text
)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare profile public.player_profiles%rowtype; state public.player_onboarding_states%rowtype;
  step public.player_experience_onboarding_steps%rowtype; source_id uuid:=gen_random_uuid();
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_expected_revision<1 or p_reason is null or char_length(btrim(p_reason)) not between 3 and 160
     or p_reason ~ '[[:cntrl:]<>]' or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','onboarding_not_available'); end if;
  perform private.ensure_player_onboarding(profile.id);
  if not private.player_experience_claim_rate_limit(profile.id,'skip',5,3600)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict state from public.player_onboarding_states where player_profile_id=profile.id for update;
  if state.state_revision<>p_expected_revision then return jsonb_build_object('status','expected_revision_conflict'); end if;
  if state.skipped_at is not null then
    return jsonb_build_object('status','skipped_optional','experience',
      private.player_experience_workspace_json(profile.id,0,20));
  end if;
  select * into strict step from public.player_experience_onboarding_steps
  where onboarding_version_id=state.onboarding_version_id and optional order by sequence_number limit 1;
  insert into public.player_onboarding_step_evidence(
    player_profile_id,onboarding_version_id,onboarding_step_id,source_event_key,source_entity_id,
    source_table,quantity,request_id,safe_metadata
  ) values(profile.id,state.onboarding_version_id,step.id,'home_visit_settings_reviewed',source_id,
    'player_experience_acknowledgements',1,p_request_id,jsonb_build_object('skipped',true,'reason',btrim(p_reason)))
  on conflict do nothing;
  update public.player_onboarding_states set skipped_at=coalesce(skipped_at,now()),
    state_revision=state_revision+1,updated_at=now() where player_profile_id=profile.id;
  insert into public.player_experience_owner_events(player_profile_id,event_key,priority,title,message,safe_payload)
  values(profile.id,'onboarding_optional_skipped','informational','Optional social guidance skipped',
    'No reward or gameplay progress was granted. Home visit help remains in the Guide.',
    jsonb_build_object('stepKey',step.step_key));
  perform private.player_experience_recompute_onboarding(profile.id);
  return jsonb_build_object('status','skipped_optional','experience',
    private.player_experience_workspace_json(profile.id,0,20));
end;
$$;

create or replace function public.request_player_experience_recovery(
  p_wallet_address text,p_reason_code text,p_expected_revision integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare profile public.player_profiles%rowtype; state public.player_onboarding_states%rowtype;
  recovery public.player_experience_recovery_queue%rowtype; key_hash text;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_reason_code not in ('starter_seed_missing','inventory_full','crop_target_invalid',
       'starter_recipe_unavailable','shop_unavailable','guidance_target_missing','state_out_of_sync')
     or p_expected_revision<1 or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','onboarding_not_available'); end if;
  perform private.ensure_player_onboarding(profile.id);
  if not private.player_experience_claim_rate_limit(profile.id,'recovery',5,3600)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict state from public.player_onboarding_states where player_profile_id=profile.id for update;
  if state.state_revision<>p_expected_revision then return jsonb_build_object('status','expected_revision_conflict'); end if;
  key_hash:=encode(extensions.digest(convert_to(p_idempotency_key,'UTF8'),'sha256'),'hex');
  insert into public.player_experience_recovery_queue(
    player_profile_id,onboarding_version_id,reason_code,expected_state_revision,
    request_id,idempotency_key_hash,evidence
  ) values(profile.id,state.onboarding_version_id,p_reason_code,p_expected_revision,p_request_id,key_hash,
    jsonb_build_object('currentStepKey',state.current_step_key,'requestedBy','player'))
  on conflict(player_profile_id,idempotency_key_hash) do nothing
  returning * into recovery;
  if not found then
    select * into strict recovery from public.player_experience_recovery_queue
    where player_profile_id=profile.id and idempotency_key_hash=key_hash;
    return jsonb_build_object('status','recovery_requested','recoveryId',recovery.id,'experience',
      private.player_experience_workspace_json(profile.id,0,20));
  end if;
  insert into public.player_experience_owner_events(
    player_profile_id,event_key,priority,related_entity_id,title,message,safe_payload
  ) values(profile.id,'recovery_requested','action_required',recovery.id,'Recovery requested',
    'Starville will verify canonical evidence before any narrow repair. No unlimited grant is available.',
    jsonb_build_object('reasonCode',p_reason_code));
  return jsonb_build_object('status','recovery_requested','recoveryId',recovery.id,'experience',
    private.player_experience_workspace_json(profile.id,0,20));
end;
$$;

create or replace function public.refresh_player_daily_objectives(
  p_wallet_address text,p_expected_assignment_revision integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare profile public.player_profiles%rowtype; assignment public.player_daily_assignments%rowtype;
  assignment_id uuid;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_expected_assignment_revision<1 or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_REQUEST';
  end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','onboarding_not_available'); end if;
  perform private.ensure_player_onboarding(profile.id);
  if not private.player_experience_claim_rate_limit(profile.id,'daily_refresh',6,3600)
    then return jsonb_build_object('status','rate_limited'); end if;
  assignment_id:=private.ensure_player_daily_assignment(profile.id);
  select * into strict assignment from public.player_daily_assignments where id=assignment_id;
  if assignment.assignment_revision<>p_expected_assignment_revision then
    return jsonb_build_object('status','expected_revision_conflict');
  end if;
  return jsonb_build_object('status','refreshed','gameDayKey',assignment.game_day_key,
    'idempotentRead',true,'experience',private.player_experience_workspace_json(profile.id,0,20));
end;
$$;

create or replace function private.player_experience_profile_movement_event()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.safe_position_x is distinct from new.safe_position_x or old.safe_position_y is distinct from new.safe_position_y then
    begin
      perform private.ensure_player_onboarding(new.id);
      if abs(new.safe_position_x-12)>0.5 or abs(new.safe_position_y-7.5)>0.5 then
        perform private.player_experience_apply_trusted_event(
          new.id,'player_movement_verified',new.id,'player_profiles',1,
          'phase12a-movement:'||new.id::text,jsonb_build_object('mapId',new.current_map_id)
        );
      end if;
    exception when others then null;
    end;
  end if;
  return new;
end;
$$;
create trigger player_profile_player_experience_movement
after update of safe_position_x,safe_position_y on public.player_profiles
for each row execute function private.player_experience_profile_movement_event();

create or replace function private.player_experience_quest_event()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  begin
    perform private.ensure_player_onboarding(new.player_profile_id);
    if new.event_key='quest_accepted' then
      perform private.player_experience_apply_trusted_event(new.player_profile_id,'npc_interacted',new.id,
        'player_quest_events',1,new.request_id,jsonb_build_object('questEvent',new.event_key));
    elsif new.event_key='plot_entered' then
      perform private.player_experience_apply_trusted_event(new.player_profile_id,'player_entered_personal_home',new.id,
        'player_quest_events',1,new.request_id,jsonb_build_object('questEvent',new.event_key));
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
create trigger player_quest_player_experience_event
after insert on public.player_quest_events
for each row execute function private.player_experience_quest_event();

create or replace function private.player_experience_private_plot_event()
returns trigger language plpgsql security definer set search_path=''
as $$
declare normalized_key text;
begin
  normalized_key:=case new.event_key
    when 'crafting_job_collected' then 'workstation_job_collected'
    when 'home_layout_saved' then 'decoration_layout_saved'
    else new.event_key end;
  if normalized_key not in ('crop_planted','crop_watered','crop_harvested','workstation_job_collected','decoration_layout_saved')
    then return new; end if;
  begin
    perform private.ensure_player_onboarding(new.player_profile_id);
    perform private.player_experience_apply_trusted_event(new.player_profile_id,normalized_key,new.id,
      'cozy_private_plot_events',1,'phase12a-plot:'||new.id::text,new.payload);
  exception when others then null;
  end;
  return new;
end;
$$;
create trigger cozy_private_plot_player_experience_event
after insert on public.cozy_private_plot_events
for each row execute function private.player_experience_private_plot_event();

create or replace function private.player_experience_shop_event()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.player_profile_id is null or new.related_entity_id is null
     or new.event_key not in ('shop_purchase_completed','shop_sale_completed') then return new; end if;
  begin
    perform private.ensure_player_onboarding(new.player_profile_id);
    perform private.player_experience_apply_trusted_event(new.player_profile_id,'shop_transaction_completed',
      new.related_entity_id,'economy_shop_events',1,'phase12a-shop:'||new.event_number::text,
      jsonb_build_object('sourceEventKey',new.event_key));
  exception when others then null;
  end;
  return new;
end;
$$;
create trigger economy_shop_player_experience_event
after insert on public.economy_shop_events
for each row execute function private.player_experience_shop_event();

create or replace function private.player_experience_progression_event()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.event_key<>'skill_xp_gained' or new.related_entity_id is null then return new; end if;
  begin
    perform private.ensure_player_onboarding(new.player_profile_id);
    perform private.player_experience_apply_daily_event(new.player_profile_id,'trusted_xp_gained',
      new.related_entity_id,greatest(1,coalesce((new.safe_payload->>'xp')::integer,1)),
      'phase12a-progression:'||new.event_number::text);
  exception when others then null;
  end;
  return new;
end;
$$;
create trigger progression_owner_player_experience_event
after insert on public.progression_owner_events
for each row execute function private.player_experience_progression_event();

revoke all on function private.player_experience_claim_rate_limit(uuid,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function private.ensure_player_daily_assignment(uuid) from public,anon,authenticated,service_role;
revoke all on function private.player_experience_recompute_onboarding(uuid) from public,anon,authenticated,service_role;
revoke all on function private.player_experience_apply_onboarding_event(uuid,text,uuid,text,integer,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.player_experience_apply_daily_event(uuid,text,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function private.player_experience_apply_trusted_event(uuid,text,uuid,text,integer,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.player_experience_backfill(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ensure_player_onboarding(uuid) from public,anon,authenticated,service_role;
revoke all on function private.player_experience_step_json(uuid,public.player_onboarding_states,public.player_experience_onboarding_steps) from public,anon,authenticated,service_role;
revoke all on function private.player_experience_workspace_json(uuid,bigint,integer) from public,anon,authenticated,service_role;
revoke all on function private.player_experience_profile_movement_event() from public,anon,authenticated,service_role;
revoke all on function private.player_experience_quest_event() from public,anon,authenticated,service_role;
revoke all on function private.player_experience_private_plot_event() from public,anon,authenticated,service_role;
revoke all on function private.player_experience_shop_event() from public,anon,authenticated,service_role;
revoke all on function private.player_experience_progression_event() from public,anon,authenticated,service_role;

revoke all on function public.get_player_experience_workspace(text,bigint,integer,text) from public,anon,authenticated;
revoke all on function public.start_player_onboarding(text,integer,text,text) from public,anon,authenticated;
revoke all on function public.set_player_onboarding_activity(text,text,integer,text) from public,anon,authenticated;
revoke all on function public.update_player_guide_preferences(text,boolean,boolean,integer,text) from public,anon,authenticated;
revoke all on function public.acknowledge_player_experience_step(text,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.skip_player_optional_onboarding(text,integer,text,text) from public,anon,authenticated;
revoke all on function public.request_player_experience_recovery(text,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.refresh_player_daily_objectives(text,integer,text,text) from public,anon,authenticated;

grant execute on function public.get_player_experience_workspace(text,bigint,integer,text) to service_role;
grant execute on function public.start_player_onboarding(text,integer,text,text) to service_role;
grant execute on function public.set_player_onboarding_activity(text,text,integer,text) to service_role;
grant execute on function public.update_player_guide_preferences(text,boolean,boolean,integer,text) to service_role;
grant execute on function public.acknowledge_player_experience_step(text,text,integer,text,text) to service_role;
grant execute on function public.skip_player_optional_onboarding(text,integer,text,text) to service_role;
grant execute on function public.request_player_experience_recovery(text,text,integer,text,text) to service_role;
grant execute on function public.refresh_player_daily_objectives(text,integer,text,text) to service_role;

comment on function public.get_player_experience_workspace(text,bigint,integer,text) is
  'Loads the server-authoritative onboarding, daily, guidance, guide, feedback, and canonical starter-quest projection.';
comment on function public.acknowledge_player_experience_step(text,text,integer,text,text) is
  'Acknowledges only bounded educational views; it cannot fake farming, shop, housing, XP, quests, or daily completion.';
comment on function public.refresh_player_daily_objectives(text,integer,text,text) is
  'Rate-limited, revision-bound authoritative reread; it cannot submit a game-day key or arbitrary objective definitions.';
