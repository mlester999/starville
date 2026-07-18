-- Starville Phase 11D authorized progression operations and bounded maintenance.

-- Active versions are immutable to ordinary edits, but the configuration authority
-- may move an active version to the terminal superseded state while activating a
-- reviewed successor. Direct table writes remain unavailable to browser roles.
alter table public.progression_curve_versions
  add column validation_results jsonb not null default '{}'::jsonb
  check (jsonb_typeof(validation_results)='object' and pg_column_size(validation_results)<=8192);

create or replace function private.protect_progression_version_immutability()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='DELETE' or old.lifecycle_status in ('superseded','archived')
     or (old.lifecycle_status='active' and new.lifecycle_status<>'superseded') then
    raise exception using errcode='55000',message='PROGRESSION_VERSION_IMMUTABLE';
  end if;
  return coalesce(new,old);
end;
$$;

create table public.progression_admin_rate_limits (
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  scope text not null check (scope in ('read','configuration_write','player_write','maintenance')),
  attempt_count integer not null check (attempt_count between 1 and 100000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(admin_user_id,scope),
  check (window_expires_at>window_started_at)
);
alter table public.progression_admin_rate_limits enable row level security;
alter table public.progression_admin_rate_limits force row level security;
revoke all on table public.progression_admin_rate_limits from public,anon,authenticated,service_role;

create or replace function private.claim_progression_admin_rate_limit(
  p_admin_user_id uuid,p_scope text,p_limit integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path=''
as $$
declare claimed boolean;
begin
  if p_admin_user_id is null or p_scope not in ('read','configuration_write','player_write','maintenance')
     or p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('progression-admin:'||p_admin_user_id::text||':'||p_scope,0));
  insert into public.progression_admin_rate_limits(
    admin_user_id,scope,attempt_count,window_started_at,window_expires_at
  ) values(p_admin_user_id,p_scope,1,now(),now()+interval '1 minute')
  on conflict(admin_user_id,scope) do update set
    attempt_count=case when progression_admin_rate_limits.window_expires_at<=now()
      then 1 else progression_admin_rate_limits.attempt_count+1 end,
    window_started_at=case when progression_admin_rate_limits.window_expires_at<=now()
      then now() else progression_admin_rate_limits.window_started_at end,
    window_expires_at=case when progression_admin_rate_limits.window_expires_at<=now()
      then now()+interval '1 minute' else progression_admin_rate_limits.window_expires_at end,
    updated_at=now()
  returning attempt_count<=p_limit into claimed;
  return claimed;
end;
$$;

create or replace function private.progression_admin_audit(
  p_actor_user_id uuid,p_admin_session_id uuid,p_action text,p_target_type text,
  p_target_id uuid,p_reason text,p_previous_value jsonb,p_new_value jsonb,p_request_id text
)
returns void
language sql
volatile
security definer
set search_path=''
as $$
  insert into public.progression_admin_audit_events(
    actor_user_id,admin_session_id,action,target_type,target_id,reason,
    previous_value,new_value,request_id
  ) values(
    p_actor_user_id,p_admin_session_id,p_action,p_target_type,p_target_id,p_reason,
    coalesce(p_previous_value,'{}'::jsonb),coalesce(p_new_value,'{}'::jsonb),p_request_id
  );
$$;

create or replace function public.get_admin_progression_workspace(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_player_wallet text,p_search text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; player_id uuid; player_json jsonb;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'progression.skills.inspect');
  if p_search is null or char_length(p_search)>128 or p_search<>btrim(p_search)
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_ADMIN_QUERY';
  end if;
  if not private.claim_progression_admin_rate_limit(p_user_id,'read',120) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_player_wallet is not null then
    if p_player_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
      raise exception using errcode='22023',message='INVALID_PROGRESSION_ADMIN_QUERY';
    end if;
    perform private.assert_verified_admin_permission(
      p_user_id,p_auth_session_id,p_assurance_level,'progression.players.inspect');
    select id into player_id from public.player_profiles where wallet_address=p_player_wallet;
    if player_id is not null then
      perform private.ensure_player_progression(player_id);
      player_json:=private.progression_workspace_json(player_id,50)||jsonb_build_object(
        'walletAddress',p_player_wallet,
        'reconciliation',coalesce((select jsonb_agg(jsonb_build_object(
          'id',queue.id,'type',queue.reconciliation_type,'status',queue.status,
          'findingCode',queue.finding_code,'createdAt',queue.created_at) order by queue.created_at desc)
          from (select * from public.progression_reconciliation_queue queue_row
            where queue_row.player_profile_id=player_id order by queue_row.created_at desc limit 50) queue),'[]'::jsonb),
        'corrections',coalesce((select jsonb_agg(jsonb_build_object(
          'id',correction.id,'skillId',correction.skill_definition_id,
          'delta',correction.requested_delta,'status',correction.status,
          'reason',correction.reason,'createdAt',correction.created_at) order by correction.created_at desc)
          from (select * from public.progression_corrections correction_row
            where correction_row.player_profile_id=player_id order by correction_row.created_at desc limit 50) correction),'[]'::jsonb)
      );
    end if;
  end if;
  return jsonb_build_object(
    'status','loaded','requestId',p_request_id,'adminSessionId',trusted_session_id,
    'skills',coalesce((select jsonb_agg(jsonb_build_object(
      'id',definition.id,'key',definition.skill_key,'name',definition.display_name,
      'description',definition.description,'enabled',definition.enabled,'released',definition.released,
      'displayOrder',definition.display_order,'configurationRevision',definition.configuration_revision,
      'activeVersion',jsonb_build_object('id',version.id,'version',version.version_number,
        'status',version.lifecycle_status,'maximumLevel',version.maximum_level,
        'curveVersionId',version.curve_version_id),
      'playerCount',(select count(*) from public.player_skill_progress progress
        where progress.skill_definition_id=definition.id),
      'levelDistribution',coalesce((select jsonb_object_agg(distribution.current_level,distribution.player_count)
        from (select progress.current_level,count(*) player_count
          from public.player_skill_progress progress where progress.skill_definition_id=definition.id
          group by progress.current_level) distribution),'{}'::jsonb)
    ) order by definition.display_order)
      from public.progression_skill_definitions definition
      left join public.progression_active_skill_versions active on active.skill_definition_id=definition.id
      left join public.progression_skill_versions version on version.id=active.skill_version_id
      where p_search='' or definition.skill_key ilike '%'||p_search||'%'
        or definition.display_name ilike '%'||p_search||'%'),'[]'::jsonb),
    'curves',coalesce((select jsonb_agg(jsonb_build_object(
      'id',curve.id,'key',curve.curve_key,'version',curve.version_number,'kind',curve.curve_kind,
      'status',curve.lifecycle_status,'name',curve.public_name,'maximumLevel',curve.maximum_level,
      'thresholds',(select jsonb_agg(jsonb_build_object('level',threshold.level,
        'cumulativeXp',threshold.cumulative_xp,'delta',threshold.cumulative_xp-lagged.previous_xp)
        order by threshold.level)
        from public.progression_curve_thresholds threshold
        join lateral (select coalesce((select prior.cumulative_xp from public.progression_curve_thresholds prior
          where prior.curve_version_id=threshold.curve_version_id and prior.level=threshold.level-1),0) previous_xp) lagged on true
        where threshold.curve_version_id=curve.id)
    ) order by curve.curve_kind,curve.curve_key,curve.version_number desc)
      from public.progression_curve_versions curve),'[]'::jsonb),
    'xpRules',coalesce((select jsonb_agg(jsonb_build_object(
      'id',rule.id,'key',rule.rule_key,'version',rule.version_number,'status',rule.lifecycle_status,
      'sourceEvent',rule.source_event_key,'skillId',rule.skill_definition_id,
      'baseXp',rule.base_xp,'perUnitXp',rule.per_unit_xp,'eventCap',rule.event_xp_cap,
      'enabled',rule.enabled,'recentGrantCount',(select count(*) from public.progression_xp_events event
        where event.xp_rule_version_id=rule.id and event.created_at>=now()-interval '7 days'))
      order by rule.rule_key,rule.version_number desc) from public.progression_xp_rule_versions rule),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object(
      'id',definition.id,'key',definition.unlock_key,'name',definition.display_name,
      'type',definition.unlock_type,'enabled',definition.enabled,'activeVersionId',version.id,
      'skillId',version.required_skill_definition_id,'skillLevel',version.required_skill_level,
      'playerLevel',version.required_player_level,'questId',version.required_quest_definition_id,
      'targetId',version.target_reference_id,'targetKey',version.target_reference_key,
      'grandfatherPolicy',version.grandfather_policy,'grantCount',(select count(*)
        from public.player_progression_unlocks owned where owned.unlock_definition_id=definition.id))
      order by definition.unlock_type,definition.display_name)
      from public.progression_unlock_definitions definition
      join public.progression_active_unlock_versions active on active.unlock_definition_id=definition.id
      join public.progression_unlock_versions version on version.id=active.unlock_version_id),'[]'::jsonb),
    'questChains',coalesce((select jsonb_agg(jsonb_build_object(
      'id',chain.id,'key',chain.chain_key,'name',chain.public_name,'enabled',chain.enabled,
      'activeVersionId',version.id,'version',version.version_number,'rewardSummary',version.reward_summary,
      'quests',(select jsonb_agg(jsonb_build_object('questId',entry.quest_definition_id,
        'sequence',entry.sequence_number,'prerequisiteQuestId',entry.prerequisite_quest_definition_id)
        order by entry.sequence_number) from public.progression_quest_chain_entries entry
        where entry.quest_chain_version_id=version.id)) order by chain.public_name)
      from public.progression_quest_chains chain
      join public.progression_active_quest_chain_versions active on active.quest_chain_id=chain.id
      join public.progression_quest_chain_versions version on version.id=active.quest_chain_version_id),'[]'::jsonb),
    'achievements',coalesce((select jsonb_agg(jsonb_build_object(
      'id',definition.id,'key',definition.achievement_key,'name',definition.display_name,
      'category',definition.category,'enabled',definition.enabled,'activeVersionId',version.id,
      'criteriaType',version.criteria_type,'target',version.target_value,'hidden',version.hidden,
      'progressVisible',version.progress_visible,'completionCount',(select count(*)
        from public.player_achievement_progress progress where progress.achievement_definition_id=definition.id
          and progress.status in ('completed','rewarded')),
      'blockedRewardCount',(select count(*) from public.player_progression_rewards reward
        join public.progression_reward_definitions reward_definition on reward_definition.id=reward.reward_definition_id
        where reward_definition.source_type='achievement' and reward_definition.source_version_id=version.id
          and reward.status<>'settled')) order by definition.category,definition.display_name)
      from public.progression_achievement_definitions definition
      join public.progression_active_achievement_versions active on active.achievement_definition_id=definition.id
      join public.progression_achievement_versions version on version.id=active.achievement_version_id),'[]'::jsonb),
    'titles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',title.id,'key',title.title_key,'name',title.display_name,'description',title.description,
      'rarity',title.rarity,'enabled',title.enabled,'visible',title.visible,
      'configurationRevision',title.configuration_revision,
      'ownerCount',(select count(*) from public.player_progression_titles owned where owned.title_id=title.id),
      'equippedCount',(select count(*) from public.player_progression_preferences preference where preference.equipped_title_id=title.id))
      order by title.display_name) from public.progression_titles title),'[]'::jsonb),
    'badges',coalesce((select jsonb_agg(jsonb_build_object(
      'id',badge.id,'key',badge.badge_key,'name',badge.display_name,'description',badge.description,
      'iconRef',badge.icon_ref,'enabled',badge.enabled,'visible',badge.visible,
      'configurationRevision',badge.configuration_revision,
      'ownerCount',(select count(*) from public.player_progression_badges owned where owned.badge_id=badge.id),
      'selectedCount',(select count(*) from public.player_progression_preferences preference where preference.selected_badge_id=badge.id))
      order by badge.display_name) from public.progression_badges badge),'[]'::jsonb),
    'liveOps',(select to_jsonb(live_ops)-'singleton_key' from public.progression_live_ops live_ops where singleton_key),
    'telemetry',jsonb_build_object(
      'xpEvents24h',(select count(*) from public.progression_xp_events where created_at>=now()-interval '24 hours'),
      'xpBySkill',coalesce((select jsonb_object_agg(skill.skill_key,total.total_xp)
        from (select skill_definition_id,sum(xp_delta) total_xp from public.progression_xp_events
          where created_at>=now()-interval '30 days' and skill_definition_id is not null group by skill_definition_id) total
        join public.progression_skill_definitions skill on skill.id=total.skill_definition_id),'{}'::jsonb),
      'playerLevelDistribution',coalesce((select jsonb_object_agg(levels.current_level,levels.player_count)
        from (select current_level,count(*) player_count from public.player_level_progress group by current_level) levels),'{}'::jsonb),
      'pendingRewards',(select count(*) from public.player_progression_rewards where status<>'settled'),
      'openReconciliation',(select count(*) from public.progression_reconciliation_queue where status in ('pending','processing','investigation')),
      'velocitySignals',(select count(*) from public.progression_reconciliation_queue where reconciliation_type='velocity' and status<>'resolved')
    ),
    'audit',coalesce((select jsonb_agg(jsonb_build_object(
      'id',event.id,'action',event.action,'targetType',event.target_type,
      'targetId',event.target_id,'reason',event.reason,'requestId',event.request_id,
      'createdAt',event.created_at) order by event.created_at desc)
      from (select * from public.progression_admin_audit_events audit_row
        order by audit_row.created_at desc limit 100) event),'[]'::jsonb),
    'player',player_json,'generatedAt',now()
  );
end;
$$;

create or replace function public.create_admin_progression_curve_successor(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_expected_version_id uuid,p_public_name text,p_thresholds jsonb,
  p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; current_version public.progression_curve_versions%rowtype;
  successor_id uuid:=gen_random_uuid(); next_version integer; threshold_count integer;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'progression.curves.manage');
  if not private.claim_progression_admin_rate_limit(p_user_id,'configuration_write',30) then
    return jsonb_build_object('status','rate_limited'); end if;
  if p_expected_version_id is null or p_public_name is null
     or char_length(p_public_name) not between 3 and 80 or p_public_name<>btrim(p_public_name)
     or p_public_name ~ '[[:cntrl:]<>]' or jsonb_typeof(p_thresholds)<>'array'
     or jsonb_array_length(p_thresholds) not between 2 and 50
     or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='SKILL_CONFIGURATION_INVALID';
  end if;
  if exists(select 1 from public.progression_admin_audit_events where actor_user_id=p_user_id and request_id=p_request_id) then
    return jsonb_build_object('status','replayed'); end if;
  select * into current_version from public.progression_curve_versions
  where id=p_expected_version_id and lifecycle_status='active';
  if not found or not exists(select 1 from public.progression_active_curve_versions active
    where active.curve_version_id=current_version.id) then return jsonb_build_object('status','progression_conflict'); end if;
  select count(*) into threshold_count
  from jsonb_to_recordset(p_thresholds) as threshold(level integer,"cumulativeXp" bigint)
  where threshold.level between 1 and 50 and threshold."cumulativeXp" between 0 and 9000000000000000;
  if threshold_count<>jsonb_array_length(p_thresholds) then
    raise exception using errcode='22023',message='SKILL_CONFIGURATION_INVALID'; end if;
  select coalesce(max(version_number),0)+1 into next_version from public.progression_curve_versions
  where curve_key=current_version.curve_key;
  insert into public.progression_curve_versions(
    id,curve_key,version_number,curve_kind,lifecycle_status,public_name,maximum_level,
    effective_at,created_by,reason,safe_metadata
  ) values(successor_id,current_version.curve_key,next_version,current_version.curve_kind,'draft',
    p_public_name,jsonb_array_length(p_thresholds),now(),p_user_id,p_reason,
    jsonb_build_object('sourceVersionId',current_version.id,'simulationRequired',true));
  insert into public.progression_curve_thresholds(curve_version_id,level,cumulative_xp)
  select successor_id,threshold.level,threshold."cumulativeXp"
  from jsonb_to_recordset(p_thresholds) as threshold(level integer,"cumulativeXp" bigint);
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'successor_created','curve',
    successor_id,p_reason,to_jsonb(current_version),jsonb_build_object('version',next_version,'thresholds',p_thresholds),p_request_id);
  return jsonb_build_object('status','created','versionId',successor_id,'version',next_version,'revision',1);
end;
$$;

create or replace function public.validate_admin_progression_curve(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_curve_version_id uuid,p_expected_revision integer,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; curve public.progression_curve_versions%rowtype;
  invalid_count integer; warning_list jsonb:='[]'::jsonb;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'progression.curves.manage');
  if p_expected_revision<1 or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='SKILL_CONFIGURATION_INVALID'; end if;
  select * into curve from public.progression_curve_versions where id=p_curve_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if curve.configuration_revision<>p_expected_revision then return jsonb_build_object('status','progression_conflict'); end if;
  if curve.lifecycle_status='validated' then return jsonb_build_object('status','replayed','versionId',curve.id); end if;
  if curve.lifecycle_status<>'draft' then return jsonb_build_object('status','immutable_version'); end if;
  select count(*) into invalid_count from (
    select threshold.level,threshold.cumulative_xp,
      lag(threshold.cumulative_xp) over(order by threshold.level) prior_xp
    from public.progression_curve_thresholds threshold where threshold.curve_version_id=curve.id
  ) thresholds where (level=1 and cumulative_xp<>0) or (level>1 and cumulative_xp<=prior_xp);
  if invalid_count>0 or (select count(*) from public.progression_curve_thresholds where curve_version_id=curve.id)<>curve.maximum_level
     or not exists(select 1 from public.progression_curve_thresholds where curve_version_id=curve.id and level=curve.maximum_level) then
    return jsonb_build_object('status','validation_failed','errors',jsonb_build_array('thresholds_not_strictly_increasing_or_incomplete'));
  end if;
  if (select cumulative_xp from public.progression_curve_thresholds where curve_version_id=curve.id and level=2)>200
    then warning_list:=warning_list||'"extreme_early_grind"'::jsonb; end if;
  if (select cumulative_xp from public.progression_curve_thresholds where curve_version_id=curve.id and level=curve.maximum_level)>1000000
    then warning_list:=warning_list||'"extreme_late_grind"'::jsonb; end if;
  update public.progression_curve_versions set lifecycle_status='validated',
    validation_results=jsonb_build_object('valid',true,'warnings',warning_list),
    configuration_revision=configuration_revision+1 where id=curve.id returning * into curve;
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'curve_validated','curve',curve.id,
    p_reason,'{}',jsonb_build_object('valid',true,'warnings',warning_list),p_request_id);
  return jsonb_build_object('status','validated','versionId',curve.id,
    'revision',curve.configuration_revision,'warnings',warning_list);
end;
$$;

create or replace function public.create_admin_progression_successor(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_kind text,
  p_definition_id uuid,p_expected_version_id uuid,p_definition jsonb,
  p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; permission_key text; successor_id uuid:=gen_random_uuid();
  next_version integer; current_json jsonb; active_id uuid;
begin
  permission_key:=case p_kind when 'skill' then 'progression.skills.manage'
    when 'xp_rule' then 'progression.xp_rules.manage'
    when 'unlock' then 'progression.unlocks.manage'
    when 'quest_chain' then 'progression.quests.manage'
    when 'achievement' then 'progression.achievements.manage' else null end;
  if permission_key is null or p_definition_id is null or p_expected_version_id is null
     or jsonb_typeof(p_definition)<>'object' or p_reason is null
     or char_length(p_reason) not between 12 and 500 or p_reason<>btrim(p_reason)
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='SKILL_CONFIGURATION_INVALID'; end if;
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,permission_key);
  if not private.claim_progression_admin_rate_limit(p_user_id,'configuration_write',30) then
    return jsonb_build_object('status','rate_limited'); end if;
  if exists(select 1 from public.progression_admin_audit_events where actor_user_id=p_user_id and request_id=p_request_id) then
    return jsonb_build_object('status','replayed'); end if;

  if p_kind='skill' then
    select active.skill_version_id into active_id from public.progression_active_skill_versions active
      where active.skill_definition_id=p_definition_id;
    if active_id is distinct from p_expected_version_id then return jsonb_build_object('status','progression_conflict'); end if;
    select to_jsonb(version),version.version_number+1 into strict current_json,next_version
      from public.progression_skill_versions version where version.id=active_id;
    insert into public.progression_skill_versions(
      id,skill_definition_id,version_number,lifecycle_status,curve_version_id,maximum_level,
      configuration_revision,effective_at,created_by,reason,safe_metadata
    ) select successor_id,p_definition_id,next_version,'draft',
      coalesce((p_definition->>'curveVersionId')::uuid,version.curve_version_id),
      coalesce((p_definition->>'maximumLevel')::integer,version.maximum_level),1,now(),p_user_id,p_reason,
      jsonb_build_object('sourceVersionId',version.id)
      from public.progression_skill_versions version where version.id=active_id;
    update public.progression_skill_definitions set
      enabled=coalesce((p_definition->>'enabled')::boolean,enabled),
      released=coalesce((p_definition->>'released')::boolean,released),
      tutorial_visible=coalesce((p_definition->>'tutorialVisible')::boolean,tutorial_visible),
      configuration_revision=configuration_revision+1 where id=p_definition_id;
  elsif p_kind='xp_rule' then
    select active.xp_rule_version_id into active_id from public.progression_active_xp_rules active
      join public.progression_xp_rule_versions version on version.id=active.xp_rule_version_id
      where version.id=p_expected_version_id and version.rule_key=(select rule_key from public.progression_xp_rule_versions where id=p_expected_version_id);
    if active_id is distinct from p_expected_version_id then return jsonb_build_object('status','progression_conflict'); end if;
    select to_jsonb(version),version.version_number+1 into strict current_json,next_version
      from public.progression_xp_rule_versions version where version.id=active_id;
    insert into public.progression_xp_rule_versions(
      id,rule_key,version_number,lifecycle_status,source_event_key,skill_definition_id,
      base_xp,per_unit_xp,event_xp_cap,daily_warning_threshold,anti_repeat_policy,
      enabled,filter_payload,configuration_revision,effective_at,created_by,reason,safe_metadata
    ) select successor_id,version.rule_key,next_version,'draft',version.source_event_key,version.skill_definition_id,
      coalesce((p_definition->>'baseXp')::integer,version.base_xp),
      coalesce((p_definition->>'perUnitXp')::integer,version.per_unit_xp),
      coalesce((p_definition->>'eventXpCap')::integer,version.event_xp_cap),
      coalesce((p_definition->>'dailyWarningThreshold')::integer,version.daily_warning_threshold),
      version.anti_repeat_policy,coalesce((p_definition->>'enabled')::boolean,version.enabled),
      coalesce(p_definition->'filterPayload',version.filter_payload),1,now(),p_user_id,p_reason,
      jsonb_build_object('sourceVersionId',version.id)
      from public.progression_xp_rule_versions version where version.id=active_id;
  elsif p_kind='unlock' then
    select active.unlock_version_id into active_id from public.progression_active_unlock_versions active
      where active.unlock_definition_id=p_definition_id;
    if active_id is distinct from p_expected_version_id then return jsonb_build_object('status','progression_conflict'); end if;
    select to_jsonb(version),version.version_number+1 into strict current_json,next_version
      from public.progression_unlock_versions version where version.id=active_id;
    insert into public.progression_unlock_versions(
      id,unlock_definition_id,version_number,lifecycle_status,target_reference_id,target_reference_key,
      required_skill_definition_id,required_skill_level,required_player_level,required_quest_definition_id,
      required_achievement_definition_id,required_previous_unlock_definition_id,visible_before_unlock,
      notify_on_grant,grandfather_policy,configuration_revision,effective_at,created_by,reason,safe_metadata
    ) select successor_id,p_definition_id,next_version,'draft',
      coalesce((p_definition->>'targetReferenceId')::uuid,version.target_reference_id),
      coalesce(p_definition->>'targetReferenceKey',version.target_reference_key),
      coalesce((p_definition->>'requiredSkillDefinitionId')::uuid,version.required_skill_definition_id),
      coalesce((p_definition->>'requiredSkillLevel')::integer,version.required_skill_level),
      coalesce((p_definition->>'requiredPlayerLevel')::integer,version.required_player_level),
      coalesce((p_definition->>'requiredQuestDefinitionId')::uuid,version.required_quest_definition_id),
      version.required_achievement_definition_id,version.required_previous_unlock_definition_id,
      coalesce((p_definition->>'visibleBeforeUnlock')::boolean,version.visible_before_unlock),
      coalesce((p_definition->>'notifyOnGrant')::boolean,version.notify_on_grant),
      coalesce(p_definition->>'grandfatherPolicy',version.grandfather_policy),1,now(),p_user_id,p_reason,
      jsonb_build_object('sourceVersionId',version.id)
      from public.progression_unlock_versions version where version.id=active_id;
    update public.progression_unlock_definitions set enabled=coalesce((p_definition->>'enabled')::boolean,enabled)
      where id=p_definition_id;
  elsif p_kind='quest_chain' then
    select active.quest_chain_version_id into active_id from public.progression_active_quest_chain_versions active
      where active.quest_chain_id=p_definition_id;
    if active_id is distinct from p_expected_version_id then return jsonb_build_object('status','progression_conflict'); end if;
    select to_jsonb(version),version.version_number+1 into strict current_json,next_version
      from public.progression_quest_chain_versions version where version.id=active_id;
    insert into public.progression_quest_chain_versions(
      id,quest_chain_id,version_number,lifecycle_status,configuration_revision,reward_summary,
      effective_at,created_by,reason,safe_metadata
    ) select successor_id,p_definition_id,next_version,'draft',1,
      coalesce(p_definition->>'rewardSummary',version.reward_summary),now(),p_user_id,p_reason,
      jsonb_build_object('sourceVersionId',version.id)
      from public.progression_quest_chain_versions version where version.id=active_id;
    insert into public.progression_quest_chain_entries
    select successor_id,entry.quest_definition_id,entry.sequence_number,entry.prerequisite_quest_definition_id,
      entry.required_player_level,entry.required_skill_definition_id,entry.required_skill_level,
      entry.required_unlock_definition_id,entry.required_achievement_definition_id,entry.safe_metadata
    from public.progression_quest_chain_entries entry where entry.quest_chain_version_id=active_id;
    update public.progression_quest_chains set enabled=coalesce((p_definition->>'enabled')::boolean,enabled)
      where id=p_definition_id;
  else
    select active.achievement_version_id into active_id from public.progression_active_achievement_versions active
      where active.achievement_definition_id=p_definition_id;
    if active_id is distinct from p_expected_version_id then return jsonb_build_object('status','progression_conflict'); end if;
    select to_jsonb(version),version.version_number+1 into strict current_json,next_version
      from public.progression_achievement_versions version where version.id=active_id;
    insert into public.progression_achievement_versions(
      id,achievement_definition_id,version_number,lifecycle_status,criteria_type,source_event_key,
      target_value,target_reference_id,target_reference_key,hidden,progress_visible,repeatable,
      icon_ref,configuration_revision,effective_at,created_by,reason,safe_metadata
    ) select successor_id,p_definition_id,next_version,'draft',version.criteria_type,version.source_event_key,
      coalesce((p_definition->>'targetValue')::bigint,version.target_value),version.target_reference_id,
      version.target_reference_key,coalesce((p_definition->>'hidden')::boolean,version.hidden),
      coalesce((p_definition->>'progressVisible')::boolean,version.progress_visible),false,version.icon_ref,
      1,now(),p_user_id,p_reason,jsonb_build_object('sourceVersionId',version.id)
      from public.progression_achievement_versions version where version.id=active_id;
    update public.progression_achievement_definitions set enabled=coalesce((p_definition->>'enabled')::boolean,enabled)
      where id=p_definition_id;
  end if;
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'successor_created',p_kind,
    successor_id,p_reason,current_json,jsonb_build_object('version',next_version,'definition',p_definition),p_request_id);
  return jsonb_build_object('status','created','versionId',successor_id,'version',next_version,'revision',1);
end;
$$;

create or replace function public.activate_admin_progression_curve(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_curve_version_id uuid,p_expected_revision integer,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; curve public.progression_curve_versions%rowtype;
  previous_curve public.progression_curve_versions%rowtype;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'progression.curves.manage');
  if p_expected_revision<1 or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_reason<>btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='SKILL_CONFIGURATION_INVALID'; end if;
  if not private.claim_progression_admin_rate_limit(p_user_id,'configuration_write',30) then
    return jsonb_build_object('status','rate_limited'); end if;
  if exists(select 1 from public.progression_admin_audit_events
    where actor_user_id=p_user_id and request_id=p_request_id) then
    return jsonb_build_object('status','replayed'); end if;
  select * into curve from public.progression_curve_versions
    where id=p_curve_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if curve.configuration_revision<>p_expected_revision then
    return jsonb_build_object('status','progression_conflict'); end if;
  if curve.lifecycle_status<>'validated' then
    return jsonb_build_object('status','validation_required'); end if;
  select prior.* into strict previous_curve
  from public.progression_active_curve_versions active
  join public.progression_curve_versions prior on prior.id=active.curve_version_id
  where active.curve_key=curve.curve_key for update of active,prior;
  update public.progression_curve_versions set lifecycle_status='superseded'
    where id=previous_curve.id;
  update public.progression_curve_versions set lifecycle_status='active',activated_at=now(),
    configuration_revision=configuration_revision+1 where id=curve.id returning * into curve;
  update public.progression_active_curve_versions set curve_version_id=curve.id,activated_at=now()
    where curve_key=curve.curve_key;
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'curve_activated','curve',curve.id,
    p_reason,to_jsonb(previous_curve),jsonb_build_object(
      'status','active','priorVersionId',previous_curve.id,'playersMigrated',0),p_request_id);
  return jsonb_build_object('status','activated','versionId',curve.id,
    'priorVersionId',previous_curve.id,'revision',curve.configuration_revision,
    'playersMigrated',0,'existingProgressPolicy','pinned_to_earned_curve_version');
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
declare trusted_session_id uuid; permission_key text; current_status text; definition_id uuid;
  active_id uuid; configuration_revision integer; before_value jsonb;
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
    select lifecycle_status,skill_definition_id,configuration_revision,to_jsonb(version)
      into current_status,definition_id,configuration_revision,before_value
      from public.progression_skill_versions version where id=p_version_id for update;
  elsif p_kind='xp_rule' then
    select lifecycle_status,id,configuration_revision,to_jsonb(version)
      into current_status,definition_id,configuration_revision,before_value
      from public.progression_xp_rule_versions version where id=p_version_id for update;
  elsif p_kind='unlock' then
    select lifecycle_status,unlock_definition_id,configuration_revision,to_jsonb(version)
      into current_status,definition_id,configuration_revision,before_value
      from public.progression_unlock_versions version where id=p_version_id for update;
  elsif p_kind='quest_chain' then
    select lifecycle_status,quest_chain_id,configuration_revision,to_jsonb(version)
      into current_status,definition_id,configuration_revision,before_value
      from public.progression_quest_chain_versions version where id=p_version_id for update;
  else
    select lifecycle_status,achievement_definition_id,configuration_revision,to_jsonb(version)
      into current_status,definition_id,configuration_revision,before_value
      from public.progression_achievement_versions version where id=p_version_id for update;
  end if;
  if current_status is null then return jsonb_build_object('status','not_found'); end if;
  if configuration_revision<>p_expected_revision then return jsonb_build_object('status','progression_conflict'); end if;
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
    return jsonb_build_object('status','validated','versionId',p_version_id,'revision',configuration_revision+1);
  end if;
  if current_status<>'validated' then return jsonb_build_object('status','validation_required'); end if;
  if p_kind='skill' then
    select skill_version_id into active_id from public.progression_active_skill_versions where skill_definition_id=definition_id for update;
    update public.progression_skill_versions set lifecycle_status='superseded' where id=active_id;
    update public.progression_skill_versions set lifecycle_status='active',activated_at=now(),configuration_revision=configuration_revision+1 where id=p_version_id;
    update public.progression_active_skill_versions set skill_version_id=p_version_id,activated_at=now() where skill_definition_id=definition_id;
  elsif p_kind='xp_rule' then
    select active.xp_rule_version_id into active_id from public.progression_active_xp_rules active
      join public.progression_xp_rule_versions version on version.id=active.xp_rule_version_id
      where version.rule_key=(select rule_key from public.progression_xp_rule_versions where id=p_version_id) for update of active;
    update public.progression_xp_rule_versions set lifecycle_status='superseded' where id=active_id;
    update public.progression_xp_rule_versions set lifecycle_status='active',activated_at=now(),configuration_revision=configuration_revision+1 where id=p_version_id;
    update public.progression_active_xp_rules set xp_rule_version_id=p_version_id,activated_at=now()
      where xp_rule_version_id=active_id;
  elsif p_kind='unlock' then
    select unlock_version_id into active_id from public.progression_active_unlock_versions where unlock_definition_id=definition_id for update;
    update public.progression_unlock_versions set lifecycle_status='superseded' where id=active_id;
    update public.progression_unlock_versions set lifecycle_status='active',activated_at=now(),configuration_revision=configuration_revision+1 where id=p_version_id;
    update public.progression_active_unlock_versions set unlock_version_id=p_version_id,activated_at=now() where unlock_definition_id=definition_id;
  elsif p_kind='quest_chain' then
    select quest_chain_version_id into active_id from public.progression_active_quest_chain_versions where quest_chain_id=definition_id for update;
    update public.progression_quest_chain_versions set lifecycle_status='superseded' where id=active_id;
    update public.progression_quest_chain_versions set lifecycle_status='active',activated_at=now(),configuration_revision=configuration_revision+1 where id=p_version_id;
    update public.progression_active_quest_chain_versions set quest_chain_version_id=p_version_id,activated_at=now() where quest_chain_id=definition_id;
  else
    select achievement_version_id into active_id from public.progression_active_achievement_versions where achievement_definition_id=definition_id for update;
    update public.progression_achievement_versions set lifecycle_status='superseded' where id=active_id;
    update public.progression_achievement_versions set lifecycle_status='active',activated_at=now(),configuration_revision=configuration_revision+1 where id=p_version_id;
    update public.progression_active_achievement_versions set achievement_version_id=p_version_id,activated_at=now() where achievement_definition_id=definition_id;
  end if;
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'version_activated',p_kind,
    p_version_id,p_reason,before_value,jsonb_build_object('status','active','priorVersionId',active_id),p_request_id);
  return jsonb_build_object('status','activated','versionId',p_version_id,'priorVersionId',active_id,'revision',configuration_revision+1);
end;
$$;

create or replace function public.update_admin_progression_live_ops(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_expected_revision integer,
  p_settings jsonb,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; settings public.progression_live_ops%rowtype; prior jsonb;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'progression.live_ops.manage');
  if p_expected_revision<1 or jsonb_typeof(p_settings)<>'object'
     or p_reason is null or char_length(p_reason) not between 12 and 500
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_LIVE_OPS'; end if;
  if not private.claim_progression_admin_rate_limit(p_user_id,'configuration_write',30) then
    return jsonb_build_object('status','rate_limited'); end if;
  select * into settings from public.progression_live_ops where singleton_key for update;
  if settings.configuration_revision<>p_expected_revision then return jsonb_build_object('status','progression_conflict'); end if;
  prior:=to_jsonb(settings)-'singleton_key';
  update public.progression_live_ops set
    xp_grants_enabled=coalesce((p_settings->>'xpGrantsEnabled')::boolean,xp_grants_enabled),
    farming_xp_enabled=coalesce((p_settings->>'farmingXpEnabled')::boolean,farming_xp_enabled),
    cooking_xp_enabled=coalesce((p_settings->>'cookingXpEnabled')::boolean,cooking_xp_enabled),
    crafting_xp_enabled=coalesce((p_settings->>'craftingXpEnabled')::boolean,crafting_xp_enabled),
    level_rewards_enabled=coalesce((p_settings->>'levelRewardsEnabled')::boolean,level_rewards_enabled),
    quest_rewards_enabled=coalesce((p_settings->>'questRewardsEnabled')::boolean,quest_rewards_enabled),
    achievement_rewards_enabled=coalesce((p_settings->>'achievementRewardsEnabled')::boolean,achievement_rewards_enabled),
    unlock_grants_enabled=coalesce((p_settings->>'unlockGrantsEnabled')::boolean,unlock_grants_enabled),
    multiplier=coalesce((p_settings->>'multiplier')::numeric,multiplier),
    multiplier_starts_at=case when p_settings ? 'multiplierStartsAt' then (p_settings->>'multiplierStartsAt')::timestamptz else multiplier_starts_at end,
    multiplier_ends_at=case when p_settings ? 'multiplierEndsAt' then (p_settings->>'multiplierEndsAt')::timestamptz else multiplier_ends_at end,
    maintenance_message=coalesce(p_settings->>'maintenanceMessage',maintenance_message),
    configuration_revision=configuration_revision+1
  where singleton_key returning * into settings;
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'live_ops_updated','live_ops',null,
    p_reason,prior,to_jsonb(settings)-'singleton_key',p_request_id);
  return jsonb_build_object('status','updated','settings',to_jsonb(settings)-'singleton_key');
end;
$$;

create or replace function public.request_admin_progression_reconciliation(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_player_wallet text,
  p_reconciliation_type text,p_priority integer,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; player_id uuid; queue_id uuid;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'progression.reconciliation.manage');
  if p_player_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_reconciliation_type not in ('full_player','skill_totals','levels','unlocks','quests','achievements','titles','pending_rewards','velocity')
     or p_priority not between 1 and 100 or p_reason is null or char_length(p_reason) not between 20 and 1000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_RECONCILIATION'; end if;
  select id into player_id from public.player_profiles where wallet_address=p_player_wallet;
  if player_id is null then return jsonb_build_object('status','progression_not_found'); end if;
  if exists(select 1 from public.progression_admin_audit_events where actor_user_id=p_user_id and request_id=p_request_id) then
    return jsonb_build_object('status','replayed'); end if;
  insert into public.progression_reconciliation_queue(
    player_profile_id,reconciliation_type,priority,request_id,evidence
  ) values(player_id,p_reconciliation_type,p_priority,p_request_id,
    jsonb_build_object('requestedBy',p_user_id,'reason',p_reason)) returning id into queue_id;
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'reconciliation_requested','player',
    player_id,p_reason,'{}',jsonb_build_object('queueId',queue_id,'type',p_reconciliation_type),p_request_id);
  return jsonb_build_object('status','queued','queueId',queue_id);
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
declare trusted_session_id uuid; player_id uuid; current_xp bigint; current_level integer;
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
    select total_xp,current_level,curve_version_id into current_xp,current_level,curve_id
      from public.player_level_progress where player_profile_id=player_id;
  else
    select progress.total_xp,progress.current_level,version.curve_version_id
      into current_xp,current_level,curve_id
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
      'previousLevel',current_level,'resultingLevel',(projected->>'level')::integer,
      'unlockImpact','grants_reconciled_no_automatic_revocation','rewardWarning','no_historical_reward_revocation'),p_request_id)
  returning id into correction_id;
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'correction_requested','player',
    player_id,p_reason,'{}',jsonb_build_object('correctionId',correction_id,'delta',p_delta,'impact',projected),p_request_id);
  return jsonb_build_object('status','previewed','correctionId',correction_id,
    'impact',jsonb_build_object('previousXp',current_xp,'resultingXp',current_xp+p_delta,
      'previousLevel',current_level,'resultingLevel',(projected->>'level')::integer,
      'unlockPolicy','permanent-grandfathering'));
end;
$$;

create or replace function public.apply_admin_progression_correction(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_correction_id uuid,
  p_expected_revision integer,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; correction public.progression_corrections%rowtype;
  skill_progress public.player_skill_progress%rowtype; player_progress public.player_level_progress%rowtype;
  curve_id uuid; skill_state jsonb; player_state jsonb; player_delta integer:=0; event_id uuid;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'progression.corrections.manage');
  if p_expected_revision<1 or p_reason is null or char_length(p_reason) not between 20 and 1000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_CORRECTION'; end if;
  select * into correction from public.progression_corrections where id=p_correction_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if correction.status='applied' then return jsonb_build_object('status','replayed','eventId',correction.applied_event_id); end if;
  if correction.status<>'previewed' then return jsonb_build_object('status','correction_conflict'); end if;
  select * into player_progress from public.player_level_progress
    where player_profile_id=correction.player_profile_id for update;
  if correction.skill_definition_id is null then
    if player_progress.progression_revision<>p_expected_revision or player_progress.total_xp+correction.requested_delta<0
      then return jsonb_build_object('status','correction_conflict'); end if;
    player_delta:=correction.requested_delta;
    player_state:=private.progression_level_state(player_progress.curve_version_id,player_progress.total_xp+player_delta);
    insert into public.progression_xp_events(
      player_profile_id,skill_definition_id,xp_delta,player_xp_delta,previous_total_xp,resulting_total_xp,
      previous_level,resulting_level,source_event_key,source_entity_id,source_table,request_id,
      idempotency_key,environment,safe_metadata
    ) values(correction.player_profile_id,null,correction.requested_delta,player_delta,
      player_progress.total_xp,player_progress.total_xp+player_delta,player_progress.current_level,
      (player_state->>'level')::integer,'progression_correction',correction.id,'progression_corrections',
      p_request_id,'progression-correction:'||correction.id::text,'admin_correction',
      jsonb_build_object('reason',p_reason,'actor',p_user_id)) returning id into event_id;
    update public.player_level_progress set total_xp=total_xp+player_delta,
      milestone_xp=milestone_xp+player_delta,current_level=(player_state->>'level')::integer,
      xp_in_level=(player_state->>'xpInLevel')::bigint,xp_for_next_level=(player_state->>'xpForNextLevel')::bigint,
      progression_revision=progression_revision+1,last_xp_event_at=now()
      where player_profile_id=correction.player_profile_id;
  else
    select * into skill_progress from public.player_skill_progress where player_profile_id=correction.player_profile_id
      and skill_definition_id=correction.skill_definition_id for update;
    if skill_progress.progression_revision<>p_expected_revision or skill_progress.total_xp+correction.requested_delta<0
      then return jsonb_build_object('status','correction_conflict'); end if;
    select curve_version_id into curve_id from public.progression_skill_versions where id=skill_progress.skill_version_id;
    skill_state:=private.progression_level_state(curve_id,skill_progress.total_xp+correction.requested_delta);
    player_delta:=trunc(correction.requested_delta*0.5)::integer;
    if player_progress.total_xp+player_delta<0 then return jsonb_build_object('status','correction_conflict'); end if;
    player_state:=private.progression_level_state(player_progress.curve_version_id,player_progress.total_xp+player_delta);
    insert into public.progression_xp_events(
      player_profile_id,skill_definition_id,xp_delta,player_xp_delta,previous_total_xp,resulting_total_xp,
      previous_level,resulting_level,source_event_key,source_entity_id,source_table,request_id,
      idempotency_key,environment,safe_metadata
    ) values(correction.player_profile_id,correction.skill_definition_id,correction.requested_delta,player_delta,
      skill_progress.total_xp,skill_progress.total_xp+correction.requested_delta,skill_progress.current_level,
      (skill_state->>'level')::integer,'progression_correction',correction.id,'progression_corrections',
      p_request_id,'progression-correction:'||correction.id::text,'admin_correction',
      jsonb_build_object('reason',p_reason,'actor',p_user_id)) returning id into event_id;
    update public.player_skill_progress set total_xp=total_xp+correction.requested_delta,
      current_level=(skill_state->>'level')::integer,xp_in_level=(skill_state->>'xpInLevel')::bigint,
      xp_for_next_level=(skill_state->>'xpForNextLevel')::bigint,progression_revision=progression_revision+1,
      last_xp_event_at=now() where player_profile_id=correction.player_profile_id
        and skill_definition_id=correction.skill_definition_id;
    update public.player_level_progress set total_xp=total_xp+player_delta,
      skill_contribution_xp=skill_contribution_xp+player_delta,current_level=(player_state->>'level')::integer,
      xp_in_level=(player_state->>'xpInLevel')::bigint,xp_for_next_level=(player_state->>'xpForNextLevel')::bigint,
      progression_revision=progression_revision+1,last_xp_event_at=now()
      where player_profile_id=correction.player_profile_id;
  end if;
  update public.player_profiles set public_level=(player_state->>'level')::integer where id=correction.player_profile_id;
  update public.progression_corrections set status='applied',applied_event_id=event_id,applied_at=now()
    where id=correction.id;
  insert into public.progression_owner_events(player_profile_id,event_key,related_entity_id,safe_payload)
    values(correction.player_profile_id,'progression_corrected',event_id,
      jsonb_build_object('delta',correction.requested_delta,'skillId',correction.skill_definition_id));
  perform private.progression_apply_unlocks(correction.player_profile_id,'reconciliation',correction.id);
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'correction_applied','player',
    correction.player_profile_id,p_reason,correction.impact_preview,
    jsonb_build_object('eventId',event_id,'delta',correction.requested_delta),p_request_id);
  return jsonb_build_object('status','applied','eventId',event_id,
    'playerLevel',(player_state->>'level')::integer,'unlockPolicy','permanent-grandfathering');
end;
$$;

create or replace function public.retry_admin_progression_reward(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_reward_id uuid,
  p_expected_revision integer,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; reward public.player_progression_rewards%rowtype; result text;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'progression.reconciliation.manage');
  select * into reward from public.player_progression_rewards where id=p_reward_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if reward.progression_revision<>p_expected_revision then return jsonb_build_object('status','progression_conflict'); end if;
  result:=private.progression_settle_reward(reward.id,p_request_id);
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'reward_retried','reward',reward.id,
    p_reason,to_jsonb(reward),jsonb_build_object('result',result),p_request_id);
  return jsonb_build_object('status',result,'rewardId',reward.id);
end;
$$;

create or replace function public.update_admin_progression_presentation(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_kind text,p_definition_id uuid,
  p_expected_revision integer,p_definition jsonb,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare trusted_session_id uuid; prior jsonb; updated jsonb; disabled boolean;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'progression.titles.manage');
  if p_kind not in ('title','badge') or p_definition_id is null or p_expected_revision<1
     or jsonb_typeof(p_definition)<>'object' or p_reason is null
     or char_length(p_reason) not between 12 and 500 or p_reason<>btrim(p_reason)
     or p_reason ~ '[[:cntrl:]<>]' or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_PROGRESSION_PRESENTATION'; end if;
  if not private.claim_progression_admin_rate_limit(p_user_id,'configuration_write',30) then
    return jsonb_build_object('status','rate_limited'); end if;
  if exists(select 1 from public.progression_admin_audit_events
    where actor_user_id=p_user_id and request_id=p_request_id) then
    return jsonb_build_object('status','replayed'); end if;
  if p_kind='title' then
    select to_jsonb(title) into prior from public.progression_titles title
      where title.id=p_definition_id and title.configuration_revision=p_expected_revision for update;
    if not found then return jsonb_build_object('status','progression_conflict'); end if;
    update public.progression_titles set
      display_name=coalesce(p_definition->>'displayName',display_name),
      description=coalesce(p_definition->>'description',description),
      rarity=coalesce(p_definition->>'rarity',rarity),
      enabled=coalesce((p_definition->>'enabled')::boolean,enabled),
      visible=coalesce((p_definition->>'visible')::boolean,visible),
      configuration_revision=configuration_revision+1
      where id=p_definition_id returning to_jsonb(progression_titles) into updated;
    disabled:=not coalesce((updated->>'enabled')::boolean,false);
    if disabled then
      update public.player_progression_preferences set equipped_title_id=null,
        progression_revision=progression_revision+1 where equipped_title_id=p_definition_id;
      update public.player_profiles set equipped_title_key=null where equipped_title_key=prior->>'title_key';
    end if;
  else
    select to_jsonb(badge) into prior from public.progression_badges badge
      where badge.id=p_definition_id and badge.configuration_revision=p_expected_revision for update;
    if not found then return jsonb_build_object('status','progression_conflict'); end if;
    update public.progression_badges set
      display_name=coalesce(p_definition->>'displayName',display_name),
      description=coalesce(p_definition->>'description',description),
      icon_ref=coalesce(p_definition->>'iconRef',icon_ref),
      enabled=coalesce((p_definition->>'enabled')::boolean,enabled),
      visible=coalesce((p_definition->>'visible')::boolean,visible),
      configuration_revision=configuration_revision+1
      where id=p_definition_id returning to_jsonb(progression_badges) into updated;
    disabled:=not coalesce((updated->>'enabled')::boolean,false);
    if disabled then
      update public.player_progression_preferences set selected_badge_id=null,
        progression_revision=progression_revision+1 where selected_badge_id=p_definition_id;
      update public.player_profiles set selected_badge_key=null where selected_badge_key=prior->>'badge_key';
    end if;
  end if;
  perform private.progression_admin_audit(p_user_id,trusted_session_id,'presentation_updated',p_kind,
    p_definition_id,p_reason,prior,updated,p_request_id);
  return jsonb_build_object('status','updated','kind',p_kind,'definition',updated,
    'ownershipPreserved',true,'disabledSelectionsCleared',disabled);
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
  investigation_count integer:=0; result text;
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
    result:=private.progression_settle_reward(reward_row.id,p_request_id||':reward:'||reward_row.id::text);
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

revoke all on function public.get_admin_progression_workspace(uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.create_admin_progression_curve_successor(uuid,uuid,text,uuid,text,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.validate_admin_progression_curve(uuid,uuid,text,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.activate_admin_progression_curve(uuid,uuid,text,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.create_admin_progression_successor(uuid,uuid,text,text,uuid,uuid,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.transition_admin_progression_version(uuid,uuid,text,text,uuid,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.update_admin_progression_live_ops(uuid,uuid,text,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.request_admin_progression_reconciliation(uuid,uuid,text,text,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.request_admin_progression_correction(uuid,uuid,text,text,uuid,integer,integer,text,text) from public,anon,authenticated;
revoke all on function public.apply_admin_progression_correction(uuid,uuid,text,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.retry_admin_progression_reward(uuid,uuid,text,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.update_admin_progression_presentation(uuid,uuid,text,text,uuid,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.run_progression_maintenance(integer,text) from public,anon,authenticated;

grant execute on function public.get_admin_progression_workspace(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.create_admin_progression_curve_successor(uuid,uuid,text,uuid,text,jsonb,text,text) to service_role;
grant execute on function public.validate_admin_progression_curve(uuid,uuid,text,uuid,integer,text,text) to service_role;
grant execute on function public.activate_admin_progression_curve(uuid,uuid,text,uuid,integer,text,text) to service_role;
grant execute on function public.create_admin_progression_successor(uuid,uuid,text,text,uuid,uuid,jsonb,text,text) to service_role;
grant execute on function public.transition_admin_progression_version(uuid,uuid,text,text,uuid,integer,text,text,text) to service_role;
grant execute on function public.update_admin_progression_live_ops(uuid,uuid,text,integer,jsonb,text,text) to service_role;
grant execute on function public.request_admin_progression_reconciliation(uuid,uuid,text,text,text,integer,text,text) to service_role;
grant execute on function public.request_admin_progression_correction(uuid,uuid,text,text,uuid,integer,integer,text,text) to service_role;
grant execute on function public.apply_admin_progression_correction(uuid,uuid,text,uuid,integer,text,text) to service_role;
grant execute on function public.retry_admin_progression_reward(uuid,uuid,text,uuid,integer,text,text) to service_role;
grant execute on function public.update_admin_progression_presentation(uuid,uuid,text,text,uuid,integer,jsonb,text,text) to service_role;
grant execute on function public.run_progression_maintenance(integer,text) to service_role;
