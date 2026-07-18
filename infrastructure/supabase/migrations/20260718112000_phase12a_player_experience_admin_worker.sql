-- Starville Phase 12A administrator projection, narrow corrections, bounded
-- recovery/reconciliation worker, and aggregate telemetry. No direct progress
-- editor or complete-everything operation exists.

create table public.player_experience_admin_rate_limits (
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  scope text not null check(scope in ('read','support','policy','reconciliation')),
  attempt_count integer not null check(attempt_count between 1 and 100000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  primary key(admin_user_id,scope),
  check(window_expires_at>window_started_at)
);
alter table public.player_experience_admin_rate_limits enable row level security;
alter table public.player_experience_admin_rate_limits force row level security;
revoke all on table public.player_experience_admin_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on table public.player_experience_admin_rate_limits to service_role;

create or replace function private.claim_player_experience_admin_rate_limit(
  p_admin_user_id uuid,p_scope text,p_limit integer
)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare allowed boolean;
begin
  if p_admin_user_id is null or p_scope not in ('read','support','policy','reconciliation')
     or p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_ADMIN_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('player-experience-admin:'||p_admin_user_id::text||':'||p_scope,0)
  );
  insert into public.player_experience_admin_rate_limits(
    admin_user_id,scope,attempt_count,window_started_at,window_expires_at
  ) values(p_admin_user_id,p_scope,1,now(),now()+interval '1 minute')
  on conflict(admin_user_id,scope) do update set
    attempt_count=case when player_experience_admin_rate_limits.window_expires_at<=now()
      then 1 else player_experience_admin_rate_limits.attempt_count+1 end,
    window_started_at=case when player_experience_admin_rate_limits.window_expires_at<=now()
      then now() else player_experience_admin_rate_limits.window_started_at end,
    window_expires_at=case when player_experience_admin_rate_limits.window_expires_at<=now()
      then now()+interval '1 minute' else player_experience_admin_rate_limits.window_expires_at end
  returning attempt_count<=p_limit into allowed;
  return allowed;
end;
$$;

create or replace function private.player_experience_guidance_target_ready(
  p_target public.player_experience_guidance_targets
)
returns boolean language sql stable security definer set search_path='' as $$
  select p_target.enabled and case p_target.semantic_key
    when 'location.lantern_square_spawn' then exists(
      select 1 from public.world_maps map
      join public.world_map_versions version on version.id=map.active_published_version_id
      where map.slug='lantern-square' and map.status='active' and version.lifecycle_status='published'
    )
    when 'interactable.willow_guide' then exists(
      select 1 from public.cozy_starter_npcs npc where npc.slug='willow-guide' and npc.active
    )
    when 'interactable.home_entrance' then exists(
      select 1 from public.cozy_home_entrances entrance
      where entrance.interaction_id=p_target.semantic_object_key and entrance.active
    )
    when 'interactable.farm_plot' then exists(
      select 1 from public.cozy_home_farm_tile_templates tile where tile.active
    )
    when 'interactable.cooking_hearth' then exists(
      select 1 from public.cozy_home_workstation_templates template
      join public.cozy_workstation_definitions definition on definition.id=template.workstation_definition_id
      where template.world_object_id=p_target.semantic_object_key and template.enabled and definition.enabled
    )
    when 'interactable.crafting_workbench' then exists(
      select 1 from public.cozy_home_workstation_templates template
      join public.cozy_workstation_definitions definition on definition.id=template.workstation_definition_id
      where template.world_object_id=p_target.semantic_object_key and template.enabled and definition.enabled
    )
    when 'interactable.general_store' then exists(
      select 1 from public.cozy_shop_interactions interaction
      where interaction.interaction_id=p_target.semantic_object_key and interaction.active
    )
    else true end;
$$;

create or replace function public.get_admin_player_experience_workspace(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_search text,p_limit integer,p_offset integer,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; active_version public.player_experience_onboarding_versions%rowtype;
  active_policy public.player_experience_daily_policy_versions%rowtype;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'player_experience.inspect'
  );
  if p_search is null or p_search<>btrim(p_search) or char_length(p_search)>128
     or p_limit not between 1 and 100 or p_offset not between 0 and 10000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_ADMIN_QUERY';
  end if;
  if not private.claim_player_experience_admin_rate_limit(p_user_id,'read',120)
    then return jsonb_build_object('status','rate_limited'); end if;
  select version.* into strict active_version
  from public.player_experience_active_onboarding active
  join public.player_experience_onboarding_versions version on version.id=active.onboarding_version_id
  where active.singleton_key;
  select version.* into strict active_policy
  from public.player_experience_active_daily_policy active
  join public.player_experience_daily_policy_versions version on version.id=active.policy_version_id
  where active.singleton_key;
  return jsonb_build_object(
    'status','loaded','requestId',p_request_id,'adminSessionId',trusted_session_id,'generatedAt',now(),
    'onboardingVersion',jsonb_build_object(
      'id',active_version.id,'key',active_version.version_key,'version',active_version.version_number,
      'status',active_version.status,'revision',active_version.configuration_revision,
      'starterQuestChainKey',active_version.starter_quest_chain_key,'optionalSkipOnly',true
    ),
    'dailyPolicy',jsonb_build_object(
      'id',active_policy.id,'key',active_policy.policy_key,'version',active_policy.version_number,
      'status',active_policy.status,'timezone',active_policy.game_day_timezone,
      'objectiveCount',active_policy.objective_count,'maximumSocialObjectives',active_policy.maximum_social_objectives,
      'rewardPolicy',active_policy.reward_policy,'completionBonusPolicy',active_policy.completion_bonus_policy,
      'candidate','balanced-combination','candidatePublished',false
    ),
    'dailyPolicyVersions',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',version.id,'key',version.policy_key,'version',version.version_number,
      'status',version.status,'revision',version.configuration_revision,
      'effectiveAt',version.effective_at,'createdAt',version.created_at,
      'objectiveCount',(select count(*) from public.player_experience_daily_objective_definitions definition
        where definition.policy_version_id=version.id),
      'active',version.id=active_policy.id
    ) order by version.version_number desc),'[]'::jsonb)
    from public.player_experience_daily_policy_versions version),
    'starterQuestline',(select jsonb_build_object(
      'chainKey',chain.chain_key,'name',chain.public_name,'enabled',chain.enabled,
      'versionId',version.id,'version',version.version_number,'status',version.lifecycle_status,
      'revision',version.configuration_revision,'rewardSummary',version.reward_summary,
      'validationStatus',case when version.lifecycle_status='active' and count(entry.*)=6
        then 'valid' else 'review_required' end,
      'objectives',coalesce(jsonb_agg(jsonb_build_object(
        'sequence',entry.sequence_number,'questKey',quest.slug,
        'prerequisiteQuestId',entry.prerequisite_quest_definition_id,
        'requiredPlayerLevel',entry.required_player_level,
        'requiredSkillLevel',entry.required_skill_level
      ) order by entry.sequence_number) filter(where entry.quest_definition_id is not null),'[]'::jsonb)
    )
    from public.progression_quest_chains chain
    join public.progression_active_quest_chain_versions active on active.quest_chain_id=chain.id
    join public.progression_quest_chain_versions version on version.id=active.quest_chain_version_id
    left join public.progression_quest_chain_entries entry on entry.quest_chain_version_id=version.id
    left join public.cozy_quest_definitions quest on quest.id=entry.quest_definition_id
    where chain.chain_key=active_version.starter_quest_chain_key
    group by chain.id,version.id),
    'gameTest',jsonb_build_object(
      'status','available','fixtureKey','phase12a-new-player','scenarioCount',14,
      'fixtureCount',22,'persistence','isolated','worldKey','lantern-square','aal2LaunchRequired',true
    ),
    'funnel',jsonb_build_object(
      'totalStates',(select count(*) from public.player_onboarding_states),
      'notStarted',(select count(*) from public.player_onboarding_states where status='not_started'),
      'active',(select count(*) from public.player_onboarding_states where status='active'),
      'paused',(select count(*) from public.player_onboarding_states where status='paused'),
      'migrated',(select count(*) from public.player_onboarding_states where migrated_existing_player),
      'completed',(select count(*) from public.player_onboarding_states where status='completed'),
      'blocked',(select count(*) from public.player_onboarding_states where status='blocked'),
      'skippedOptional',(select count(*) from public.player_onboarding_states where skipped_at is not null),
      'medianCompletionSeconds',(select percentile_cont(0.5) within group(order by extract(epoch from completed_at-started_at))
        from public.player_onboarding_states where completed_at is not null and started_at is not null)
    ),
    'dropOff',(select coalesce(jsonb_agg(jsonb_build_object(
      'stepKey',step.step_key,'chapterKey',step.chapter_key,'sequence',step.sequence_number,
      'currentPlayers',coalesce(summary.current_players,0),'completionCount',coalesce(completion.completion_count,0)
    ) order by step.sequence_number),'[]'::jsonb)
    from public.player_experience_onboarding_steps step
    left join lateral (select count(*) current_players from public.player_onboarding_states state
      where state.current_step_key=step.step_key and state.status in ('active','paused','migrated','blocked')) summary on true
    left join lateral (select count(*) completion_count from public.player_onboarding_step_evidence evidence
      where evidence.onboarding_step_id=step.id) completion on true
    where step.onboarding_version_id=active_version.id),
    'players',(select coalesce(jsonb_agg(jsonb_build_object(
      'playerId',state.player_profile_id,'displayName',profile.display_name,'status',state.status,
      'chapterKey',state.current_chapter_key,'stepKey',state.current_step_key,
      'revision',state.state_revision,'migrated',state.migrated_existing_player,
      'startedAt',state.started_at,'lastProgressedAt',state.last_progressed_at,
      'completedAt',state.completed_at,'blockedReasonCode',state.blocked_reason_code,
      'rewardSettlementState',state.reward_settlement_state
    ) order by state.updated_at desc),'[]'::jsonb) from (
      select selected.* from public.player_onboarding_states selected
      join public.player_profiles profile_filter on profile_filter.id=selected.player_profile_id
      where p_search='' or selected.player_profile_id::text ilike '%'||p_search||'%'
        or profile_filter.display_name ilike '%'||p_search||'%'
      order by selected.updated_at desc limit p_limit offset p_offset
    ) state join public.player_profiles profile on profile.id=state.player_profile_id),
    'dailyObjectives',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',definition.id,'key',definition.objective_key,'category',definition.category,
      'title',definition.title,'eventKey',definition.authoritative_event_key,
      'required',definition.required_count,'soloSafe',definition.solo_safe,'social',definition.social,
      'enabled',definition.enabled,'revision',definition.configuration_revision,
      'semanticTargetKey',definition.semantic_target_key
    ) order by definition.category,definition.objective_key),'[]'::jsonb)
    from public.player_experience_daily_objective_definitions definition
    where definition.policy_version_id=active_policy.id),
    'guidanceReadiness',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',target.id,'semanticKey',target.semantic_key,'label',target.label,
      'semanticObjectKey',target.semantic_object_key,'worldKey',target.world_key,
      'status',case when private.player_experience_guidance_target_ready(target) then 'ready' else 'missing' end,
      'severity',target.severity,'fallbackHint',target.fallback_hint,
      'revision',target.configuration_revision,
      'worldRevision',case when target.world_key='lantern-square' then (
        select version.version_number from public.world_maps map
        join public.world_map_versions version on version.id=map.active_published_version_id
        where map.slug='lantern-square'
      ) when target.world_key='personal-home' then (
        select max(template.template_version) from public.cozy_home_templates template where template.active
      ) else target.configuration_revision end
    ) order by target.semantic_key),'[]'::jsonb) from public.player_experience_guidance_targets target),
    'recovery',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',recovery.id,'playerId',recovery.player_profile_id,'displayName',profile.display_name,
      'reasonCode',recovery.reason_code,'status',recovery.status,
      'expectedRevision',recovery.expected_state_revision,'attemptCount',recovery.attempt_count,
      'createdAt',recovery.created_at,'updatedAt',recovery.updated_at
    ) order by recovery.created_at desc),'[]'::jsonb) from (
      select selected.* from public.player_experience_recovery_queue selected
      order by selected.created_at desc limit 100
    ) recovery join public.player_profiles profile on profile.id=recovery.player_profile_id),
    'telemetry',jsonb_build_object(
      'events7d',(select count(*) from public.player_experience_telemetry_events where occurred_at>now()-interval '7 days'),
      'recoveriesPending',(select count(*) from public.player_experience_recovery_queue where status='pending'),
      'dailySetsToday',(select count(*) from public.player_daily_assignments where game_day_key=(now() at time zone 'UTC')::date),
      'dailyObjectivesCompletedToday',(select count(*) from public.player_daily_objective_progress progress
        join public.player_daily_assignments assignment on assignment.id=progress.assignment_id
        where assignment.game_day_key=(now() at time zone 'UTC')::date and progress.status='settled'),
      'dailySetsCompletedToday',(select count(*) from public.player_daily_assignments
        where game_day_key=(now() at time zone 'UTC')::date and status='completed'),
      'economicDailyRewardDust',0,'economicDailyRewardXp',0
    ),
    'audit',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',audit.id,'actorUserId',audit.actor_user_id,'actionKey',audit.action_key,
      'targetType',audit.target_type,'targetId',audit.target_id,'reason',audit.reason,
      'requestId',audit.request_id,'createdAt',audit.created_at
    ) order by audit.created_at desc),'[]'::jsonb) from (
      select selected.* from public.player_experience_admin_audit_events selected
      order by selected.created_at desc limit 100
    ) audit)
  );
end;
$$;

create or replace function public.correct_admin_player_onboarding(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_player_profile_id uuid,
  p_action text,p_recovery_id uuid,p_expected_revision integer,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; state public.player_onboarding_states%rowtype;
  recovery public.player_experience_recovery_queue%rowtype; before_value jsonb; after_value jsonb;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'player_experience.support'
  );
  if p_assurance_level<>'aal2' then raise exception using errcode='42501',message='AAL2_REQUIRED'; end if;
  if p_player_profile_id is null or p_action not in ('resume_blocked','retry_recovery','reset_guide_preferences')
     or p_expected_revision<1 or p_reason is null or char_length(btrim(p_reason)) not between 20 and 1000
     or p_reason ~ '[[:cntrl:]<>]' or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_CORRECTION';
  end if;
  if not private.claim_player_experience_admin_rate_limit(p_user_id,'support',20)
    then return jsonb_build_object('status','rate_limited'); end if;
  if exists(select 1 from public.player_experience_admin_audit_events
    where actor_user_id=p_user_id and request_id=p_request_id) then
    return jsonb_build_object('status','request_already_processed');
  end if;
  select * into state from public.player_onboarding_states
    where player_profile_id=p_player_profile_id for update;
  if not found then return jsonb_build_object('status','onboarding_not_available'); end if;
  if state.state_revision<>p_expected_revision then return jsonb_build_object('status','expected_revision_conflict'); end if;
  before_value:=to_jsonb(state)-'safe_metadata';
  if p_action='resume_blocked' then
    if state.status<>'blocked' then return jsonb_build_object('status','onboarding_recovery_not_allowed'); end if;
    update public.player_onboarding_states set status='active',blocked_reason_code=null,
      state_revision=state_revision+1,updated_at=now() where player_profile_id=p_player_profile_id
      returning * into state;
  elsif p_action='reset_guide_preferences' then
    update public.player_onboarding_states set guide_minimized=false,reduced_guidance=false,
      state_revision=state_revision+1,updated_at=now() where player_profile_id=p_player_profile_id
      returning * into state;
  else
    if p_recovery_id is null then raise exception using errcode='22023',message='RECOVERY_ID_REQUIRED'; end if;
    select * into recovery from public.player_experience_recovery_queue
      where id=p_recovery_id and player_profile_id=p_player_profile_id for update;
    if not found or recovery.status not in ('investigation_required','rejected') then
      return jsonb_build_object('status','onboarding_recovery_not_allowed');
    end if;
    update public.player_experience_recovery_queue set status='pending',attempt_count=0,
      evidence=evidence||jsonb_build_object('retriedBy',p_user_id,'retryReason',btrim(p_reason)),updated_at=now()
      where id=recovery.id returning * into recovery;
  end if;
  after_value:=to_jsonb(state)-'safe_metadata';
  insert into public.player_experience_admin_audit_events(
    actor_user_id,admin_session_id,action_key,target_type,target_id,reason,request_id,before_state,after_state
  ) values(p_user_id,trusted_session_id,'player_experience.'||p_action,'player_onboarding',
    p_player_profile_id,btrim(p_reason),p_request_id,before_value,after_value);
  return jsonb_build_object('status','updated','playerId',p_player_profile_id,
    'stateRevision',state.state_revision,'recoveryId',p_recovery_id);
end;
$$;

create or replace function public.create_admin_player_experience_daily_policy_successor(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_base_policy_version_id uuid,
  p_expected_configuration_revision integer,p_effective_at timestamptz,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; base public.player_experience_daily_policy_versions%rowtype;
  successor public.player_experience_daily_policy_versions%rowtype; next_version integer;
  prior public.player_experience_admin_audit_events%rowtype;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'player_experience.policy.manage'
  );
  if p_assurance_level<>'aal2' then raise exception using errcode='42501',message='AAL2_REQUIRED'; end if;
  if p_base_policy_version_id is null or p_expected_configuration_revision<1
     or p_effective_at is null or p_effective_at<now()-interval '5 minutes'
     or p_reason is null or char_length(p_reason) not between 20 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_POLICY_SUCCESSOR';
  end if;
  select * into prior from public.player_experience_admin_audit_events
    where actor_user_id=p_user_id and request_id=p_request_id;
  if found then
    return jsonb_build_object('status','replayed','versionId',prior.target_id,
      'activePolicyUnchanged',true);
  end if;
  if not private.claim_player_experience_admin_rate_limit(p_user_id,'policy',10)
    then return jsonb_build_object('status','rate_limited'); end if;
  select version.* into base
  from public.player_experience_daily_policy_versions version
  join public.player_experience_active_daily_policy active
    on active.policy_version_id=version.id and active.singleton_key
  where version.id=p_base_policy_version_id
    and version.configuration_revision=p_expected_configuration_revision
  for share of version;
  if not found then return jsonb_build_object('status','expected_revision_conflict'); end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('player-experience-daily-policy-successor',0)
  );
  select coalesce(max(version_number),0)+1 into next_version
  from public.player_experience_daily_policy_versions;
  insert into public.player_experience_daily_policy_versions(
    id,policy_key,version_number,status,game_day_timezone,objective_count,
    maximum_social_objectives,reward_policy,completion_bonus_policy,
    configuration_revision,effective_at,reason,safe_metadata,created_by
  ) values(
    gen_random_uuid(),'starville_daily_rhythm_v'||next_version::text,next_version,'draft',
    base.game_day_timezone,base.objective_count,base.maximum_social_objectives,
    base.reward_policy,base.completion_bonus_policy,1,p_effective_at,p_reason,
    jsonb_build_object('successorOf',base.id,'activePolicyUnchanged',true),p_user_id
  ) returning * into successor;
  insert into public.player_experience_daily_objective_definitions(
    id,policy_version_id,objective_key,category,title,description,authoritative_event_key,
    required_count,solo_safe,social,minimum_player_level,required_feature_key,
    semantic_target_key,enabled,configuration_revision,safe_metadata
  ) select gen_random_uuid(),successor.id,definition.objective_key,definition.category,
    definition.title,definition.description,definition.authoritative_event_key,
    definition.required_count,definition.solo_safe,definition.social,
    definition.minimum_player_level,definition.required_feature_key,
    definition.semantic_target_key,definition.enabled,1,
    definition.safe_metadata||jsonb_build_object('successorOf',definition.id)
  from public.player_experience_daily_objective_definitions definition
  where definition.policy_version_id=base.id;
  insert into public.player_experience_admin_audit_events(
    actor_user_id,admin_session_id,action_key,target_type,target_id,reason,request_id,before_state,after_state
  ) values(
    p_user_id,trusted_session_id,'player_experience.daily_policy_successor_created',
    'daily_policy',successor.id,p_reason,p_request_id,
    jsonb_build_object('baseVersionId',base.id,'configurationRevision',base.configuration_revision),
    jsonb_build_object('versionId',successor.id,'policyKey',successor.policy_key,
      'versionNumber',successor.version_number,'objectiveCount',(
        select count(*) from public.player_experience_daily_objective_definitions definition
        where definition.policy_version_id=successor.id
      ),'activePolicyUnchanged',true)
  );
  return jsonb_build_object('status','created','versionId',successor.id,
    'policyKey',successor.policy_key,'versionNumber',successor.version_number,
    'configurationRevision',successor.configuration_revision,'activePolicyUnchanged',true);
end;
$$;

create or replace function public.reconcile_phase12a_player_experience(
  p_limit integer,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare recovery public.player_experience_recovery_queue%rowtype; processed integer:=0;
  resolved integer:=0; investigation integer:=0; item_id uuid; added boolean; owned integer;
  state_candidate record; reconciled_states integer:=0; drift_repaired integer:=0;
  current_revision integer; locked_objectives integer:=0; missing_guidance_targets integer:=0;
begin
  if p_limit not between 1 and 100 or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PLAYER_EXPERIENCE_RECONCILIATION';
  end if;
  for recovery in
    select * from public.player_experience_recovery_queue selected
    where selected.status='pending' order by selected.created_at,selected.id
    for update skip locked limit p_limit
  loop
    processed:=processed+1;
    update public.player_experience_recovery_queue set status='processing',attempt_count=attempt_count+1,
      updated_at=now() where id=recovery.id;
    begin
      if recovery.reason_code='starter_seed_missing' then
        select item.id into strict item_id from public.cozy_item_definitions item
          where item.slug='moonbean-seed' and item.active;
        owned:=private.cozy_owned_quantity(recovery.player_profile_id,item_id);
        if owned>0 then
          update public.player_experience_recovery_queue set status='resolved',resolved_at=now(),updated_at=now(),
            evidence=evidence||jsonb_build_object('resolution','eligible_seed_already_owned','quantity',owned)
          where id=recovery.id;
          resolved:=resolved+1;
        elsif exists(select 1 from public.player_experience_recovery_queue prior
          where prior.player_profile_id=recovery.player_profile_id and prior.onboarding_version_id=recovery.onboarding_version_id
            and prior.reason_code='starter_seed_missing' and prior.status='resolved' and prior.id<>recovery.id) then
          update public.player_experience_recovery_queue set status='rejected',updated_at=now(),
            evidence=evidence||jsonb_build_object('resolution','recovery_grant_already_used') where id=recovery.id;
          investigation:=investigation+1;
        else
          added:=private.cozy_add_item(
            recovery.player_profile_id,item_id,1,'starter_grant','onboarding_recovery',recovery.id::text,
            'phase12a-recovery:'||recovery.id::text,p_request_id||':recovery:'||recovery.id::text
          );
          if added then
            update public.player_experience_recovery_queue set status='resolved',resolved_at=now(),updated_at=now(),
              evidence=evidence||jsonb_build_object('resolution','one_moonbean_seed_granted','quantity',1)
            where id=recovery.id;
            resolved:=resolved+1;
          else
            update public.player_experience_recovery_queue set status='investigation_required',updated_at=now(),
              evidence=evidence||jsonb_build_object('resolution','inventory_capacity_or_canonical_grant_failed')
            where id=recovery.id;
            investigation:=investigation+1;
          end if;
        end if;
      elsif recovery.reason_code='state_out_of_sync' then
        perform private.player_experience_backfill(recovery.player_profile_id);
        perform private.player_experience_recompute_onboarding(recovery.player_profile_id);
        update public.player_experience_recovery_queue set status='resolved',resolved_at=now(),updated_at=now(),
          evidence=evidence||jsonb_build_object('resolution','canonical_evidence_replayed') where id=recovery.id;
        resolved:=resolved+1;
      elsif recovery.reason_code in ('inventory_full','crop_target_invalid','shop_unavailable') then
        update public.player_experience_recovery_queue set status='resolved',resolved_at=now(),updated_at=now(),
          evidence=evidence||jsonb_build_object('resolution','guidance_only_no_mutation',
            'nextAction',case recovery.reason_code
              when 'inventory_full' then 'free_inventory_capacity_and_retry'
              when 'crop_target_invalid' then 'rehydrate_and_choose_another_eligible_tile'
              else 'continue_another_objective_until_shop_resumes' end)
        where id=recovery.id;
        resolved:=resolved+1;
      else
        update public.player_experience_recovery_queue set status='investigation_required',updated_at=now(),
          evidence=evidence||jsonb_build_object('resolution','owner_diagnostic_required') where id=recovery.id;
        investigation:=investigation+1;
      end if;
      if exists(select 1 from public.player_experience_recovery_queue current
        where current.id=recovery.id and current.status='resolved') then
        insert into public.player_experience_owner_events(
          player_profile_id,event_key,priority,related_entity_id,title,message,safe_payload
        ) values(recovery.player_profile_id,'recovery_resolved','informational',recovery.id,
          'Recovery check complete','Your authoritative state is ready to reload.',
          jsonb_build_object('reasonCode',recovery.reason_code));
      end if;
    exception when others then
      update public.player_experience_recovery_queue set status='investigation_required',updated_at=now(),
        evidence=evidence||jsonb_build_object('resolution','safe_worker_failure') where id=recovery.id;
      investigation:=investigation+1;
    end;
  end loop;
  for state_candidate in
    select state.player_profile_id,state.state_revision
    from public.player_onboarding_states state
    where state.status in ('active','paused','migrated','blocked')
    order by state.updated_at,state.player_profile_id
    for update of state skip locked limit p_limit
  loop
    reconciled_states:=reconciled_states+1;
    perform private.player_experience_backfill(state_candidate.player_profile_id);
    perform private.player_experience_recompute_onboarding(state_candidate.player_profile_id);
    select state.state_revision into strict current_revision
    from public.player_onboarding_states state
    where state.player_profile_id=state_candidate.player_profile_id;
    if current_revision<>state_candidate.state_revision then drift_repaired:=drift_repaired+1; end if;
  end loop;
  select count(*) into locked_objectives
  from public.player_daily_objective_progress progress
  join public.player_daily_assignments assignment on assignment.id=progress.assignment_id
  join public.player_experience_daily_objective_definitions definition
    on definition.id=progress.objective_definition_id
  where assignment.status='active' and progress.status='active' and (
    (definition.objective_key in ('daily-plant-crop','daily-water-crop') and not exists(
      select 1 from public.cozy_farming_settings settings where settings.singleton_key and settings.planting_enabled
    )) or (definition.objective_key='daily-harvest-crop' and not exists(
      select 1 from public.cozy_farming_settings settings where settings.singleton_key and settings.harvesting_enabled
    )) or (definition.required_feature_key='production' and not exists(
      select 1 from public.cozy_crafting_settings settings where settings.singleton_key and settings.collection_enabled
    )) or (definition.required_feature_key='housing' and not exists(
      select 1 from public.housing_live_ops live_ops where live_ops.singleton_key and live_ops.layout_saves_enabled
    )) or (definition.required_feature_key='progression' and not exists(
      select 1 from public.progression_live_ops live_ops where live_ops.singleton_key and live_ops.xp_grants_enabled
    )) or (definition.required_feature_key='general_store' and not exists(
      select 1 from public.cozy_shop_definitions shop
      join public.economy_shop_live_ops live_ops on live_ops.shop_definition_id=shop.id
      join public.economy_active_policy active_policy on active_policy.singleton_key
      join public.economy_policy_versions economy_policy on economy_policy.id=active_policy.policy_version_id
      where shop.slug='lantern-general-store' and shop.active and live_ops.access_enabled
        and (live_ops.buying_enabled or live_ops.selling_enabled)
        and economy_policy.economy_enabled and economy_policy.purchases_enabled
    ))
  );
  select count(*) into missing_guidance_targets
  from public.player_experience_guidance_targets target
  where target.enabled and not private.player_experience_guidance_target_ready(target);
  update public.player_daily_assignments set status='expired',assignment_revision=assignment_revision+1
  where status='active' and game_day_key<(now() at time zone 'UTC')::date;
  return jsonb_build_object('status','completed','processed',processed,'resolved',resolved,
    'investigationRequired',investigation,'reconciledStates',reconciled_states,
    'driftRepaired',drift_repaired,'lockedObjectives',locked_objectives,
    'missingGuidanceTargets',missing_guidance_targets,'requestId',p_request_id);
end;
$$;

revoke all on function private.claim_player_experience_admin_rate_limit(uuid,text,integer) from public,anon,authenticated,service_role;
revoke all on function private.player_experience_guidance_target_ready(public.player_experience_guidance_targets) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_player_experience_workspace(uuid,uuid,text,text,integer,integer,text) from public,anon,authenticated;
revoke all on function public.correct_admin_player_onboarding(uuid,uuid,text,uuid,text,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.create_admin_player_experience_daily_policy_successor(uuid,uuid,text,uuid,integer,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.reconcile_phase12a_player_experience(integer,text) from public,anon,authenticated;
grant execute on function public.get_admin_player_experience_workspace(uuid,uuid,text,text,integer,integer,text) to service_role;
grant execute on function public.correct_admin_player_onboarding(uuid,uuid,text,uuid,text,uuid,integer,text,text) to service_role;
grant execute on function public.create_admin_player_experience_daily_policy_successor(uuid,uuid,text,uuid,integer,timestamptz,text,text) to service_role;
grant execute on function public.reconcile_phase12a_player_experience(integer,text) to service_role;

comment on function public.correct_admin_player_onboarding(uuid,uuid,text,uuid,text,uuid,integer,text,text) is
  'Narrow AAL2 correction: resume blocked guidance, retry verified recovery, or reset UI-only guide preferences. No arbitrary completion.';
comment on function public.reconcile_phase12a_player_experience(integer,text) is
  'Bounded skip-locked reconciliation with at most one verified starter-seed recovery per onboarding version.';
comment on function public.create_admin_player_experience_daily_policy_successor(uuid,uuid,text,uuid,integer,timestamptz,text,text) is
  'Creates an AAL2-audited draft successor with cloned, version-pinned objectives and never changes the active daily policy.';
