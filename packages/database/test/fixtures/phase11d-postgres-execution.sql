\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.phase11d_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then
    raise exception 'PHASE11D_ASSERTION_FAILED: %',message;
  end if;
end;
$$;

select pg_temp.phase11d_assert(
  (select count(*)=2 from public.progression_curve_versions where lifecycle_status='active')
  and (select count(*)=8 from public.progression_skill_definitions)
  and (select count(*)=3 from public.progression_skill_definitions where released and enabled)
  and (select count(*)=7 from public.progression_xp_rule_versions where lifecycle_status='active')
  and (select count(*)=9 from public.progression_unlock_definitions)
  and (select count(*)=6 from public.progression_quest_chain_entries
    where quest_chain_version_id='d1100000-0000-4000-8000-000000000351')
  and (select count(*)=14 from public.progression_achievement_definitions)
  and (select count(*)=5 from public.progression_titles)
  and (select count(*)=3 from public.progression_badges),
  'bounded initial curves, skills, rules, unlocks, chain, achievements, titles, and badges exist'
);

select pg_temp.phase11d_assert(
  (select array_agg(cumulative_xp order by level)=array[0,40,100,180,280,400,550,730,940,1180,1450,1750,2080,2440,2830,3250,3700,4180,4690,5230]::bigint[]
    from public.progression_curve_thresholds where curve_version_id='d1100000-0000-4000-8000-000000000001')
  and (select array_agg(cumulative_xp order by level)=array[0,80,190,330,500,700,930,1190,1480,1800,2150,2530,2940,3380,3850,4350,4880,5440,6030,6650]::bigint[]
    from public.progression_curve_thresholds where curve_version_id='d1100000-0000-4000-8000-000000000002'),
  'explicit skill and hybrid Player Level curves are reviewable and capped at level 20'
);

select pg_temp.phase11d_assert(
  (select bool_and(procedure.provolatile='s')
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='private' and procedure.proname in (
      'progression_level_for_xp','progression_level_state','progression_unlock_requirement_met',
      'progression_quest_available','progression_quest_json','progression_workspace_json'))
  and (select bool_and(procedure.provolatile='v')
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.proname in (
      'get_player_progression_workspace','accept_player_progression_quest',
      'track_player_progression_quest','complete_player_progression_quest',
      'update_player_progression_identity','get_player_progression_events',
      'get_admin_progression_workspace','create_admin_progression_curve_successor',
      'validate_admin_progression_curve','activate_admin_progression_curve',
      'request_admin_progression_correction','apply_admin_progression_correction',
      'run_progression_maintenance')),
  'function volatility matches table reads, timestamps, rate limits, and mutations'
);

do $$
declare
  owner_wallet constant text:='11111111111111111111111111111195';
  other_wallet constant text:='11111111111111111111111111111196';
  owner_id uuid; other_id uuid; ledger_id uuid; event_id uuid; quest_instance_id uuid;
  result jsonb; replay jsonb; workspace jsonb; event_page jsonb;
  index integer; farming_revision integer;
begin
  insert into public.player_profiles(
    wallet_address,display_name,appearance_preset,current_map_id,current_map_version_id,
    safe_position_x,safe_position_y,facing_direction
  ) values
    (owner_wallet,'Phase Eleven D Owner','moss','lantern-square',
      '79000000-0000-4000-8000-000000000001',5.8,5.7,'south'),
    (other_wallet,'Phase Eleven D Other','moonberry','lantern-square',
      '79000000-0000-4000-8000-000000000001',5.8,5.7,'south');
  select id into strict owner_id from public.player_profiles where wallet_address=owner_wallet;
  select id into strict other_id from public.player_profiles where wallet_address=other_wallet;
  perform public.bootstrap_player_cozy_gameplay(owner_wallet,'phase11d-owner-bootstrap-0001','phase11d:bootstrap');
  perform public.bootstrap_player_cozy_gameplay(other_wallet,'phase11d-other-bootstrap-0001','phase11d:other:bootstrap');
  select id into strict ledger_id from public.player_dust_ledger
    where player_profile_id=owner_id order by created_at limit 1;

  workspace:=public.get_player_progression_workspace(owner_wallet,20,'phase11d:workspace:new');
  perform pg_temp.phase11d_assert(
    workspace->>'status'='loaded'
      and workspace#>>'{progression,playerLevel,level}'='1'
      and jsonb_array_length(workspace#>'{progression,skills}')=3
      and jsonb_array_length(workspace#>'{progression,futureSkills}')=5
      and workspace#>>'{progression,quests,available,0,questKind}'='farming_tutorial',
    'new-player workspace initializes released skills, future skills, and the reused tutorial chain');

  for index in 1..5 loop
    event_id:=gen_random_uuid();
    result:=private.progression_grant_trusted_xp(
      owner_id,'farming-crop-harvested',event_id,'cozy_private_plot_events',10,
      'phase11d:farming:'||index::text);
    if index=1 then
      replay:=private.progression_grant_trusted_xp(
        owner_id,'farming-crop-harvested',event_id,'cozy_private_plot_events',10,
        'phase11d:farming:replay');
      perform private.progression_evaluate_achievements(
        owner_id,'crop_harvested',event_id,null,null,1,0,'phase11d:achievement:first');
      perform private.progression_evaluate_achievements(
        owner_id,'crop_harvested',event_id,null,null,1,0,'phase11d:achievement:replay');
      perform pg_temp.phase11d_assert(
        result->>'status'='granted' and result->>'xp'='20'
          and replay->>'status'='replayed' and replay->>'eventId'=result->>'eventId',
        'one trusted harvest source grants bounded XP exactly once and replays the original event');
    end if;
  end loop;
  perform private.progression_grant_trusted_xp(
    owner_id,'cooking-job-collected',gen_random_uuid(),'cozy_private_plot_events',5,'phase11d:cooking:1');
  perform private.progression_grant_trusted_xp(
    owner_id,'cooking-job-collected',gen_random_uuid(),'cozy_private_plot_events',5,'phase11d:cooking:2');
  perform private.progression_grant_trusted_xp(
    owner_id,'crafting-job-collected',gen_random_uuid(),'cozy_private_plot_events',8,'phase11d:crafting:1');

  perform pg_temp.phase11d_assert(
    (select total_xp=100 and current_level=3 from public.player_skill_progress
      where player_profile_id=owner_id and skill_definition_id='d1100000-0000-4000-8000-000000000010')
    and (select total_xp=60 and current_level=2 from public.player_skill_progress
      where player_profile_id=owner_id and skill_definition_id='d1100000-0000-4000-8000-000000000011')
    and (select total_xp=40 and current_level=2 from public.player_skill_progress
      where player_profile_id=owner_id and skill_definition_id='d1100000-0000-4000-8000-000000000012')
    and (select total_xp=100 and current_level=2 and skill_contribution_xp=100
      from public.player_level_progress where player_profile_id=owner_id)
    and (select count(*)=8 from public.progression_xp_events where player_profile_id=owner_id)
    and (select status in ('completed','rewarded') from public.player_achievement_progress
      where player_profile_id=owner_id and achievement_definition_id='d1100000-0000-4000-8000-000000000401')
    and (select count(*)=1 from public.player_achievement_event_contributions
      where player_profile_id=owner_id and achievement_definition_id='d1100000-0000-4000-8000-000000000401'),
    'farming, cooking, crafting, hybrid Player XP, level-up, and achievement settlement are deterministic');

  perform pg_temp.phase11d_assert(
    exists(select 1 from public.player_progression_unlocks unlock
      join public.progression_unlock_definitions definition on definition.id=unlock.unlock_definition_id
      where unlock.player_profile_id=owner_id and definition.unlock_key in ('sunroot-seed-shop','cloudberry-seed-shop'))
    and private.cozy_shop_entry_is_unlocked(owner_id,'progression_farming_2')
    and private.cozy_shop_entry_is_unlocked(owner_id,'progression_farming_3'),
    'skill levels persist canonical unlock grants consumed by shop eligibility');

  insert into public.player_quest_instances(
    player_profile_id,quest_definition_id,quest_version_id,status,state_version,
    completed_at,reward_settled_at,reward_ledger_entry_id
  ) values
    (owner_id,'a1100000-0000-4000-8000-000000000031','a1100000-0000-4000-8000-000000000032','reward_claimed',2,now(),now(),ledger_id),
    (owner_id,'b1100000-0000-4000-8000-000000000201','b1100000-0000-4000-8000-000000000202','reward_claimed',2,now(),now(),ledger_id),
    (owner_id,'c1100000-0000-4000-8000-000000000210','c1100000-0000-4000-8000-000000000211','reward_claimed',2,now(),now(),ledger_id);

  result:=public.accept_player_progression_quest(
    owner_wallet,'d1100000-0000-4000-8000-000000000301',1,
    'phase11d-growing-roots-accept-0001','phase11d:quest:accept');
  quest_instance_id:=(result#>>'{quest,questInstanceId}')::uuid;
  replay:=public.accept_player_progression_quest(
    owner_wallet,'d1100000-0000-4000-8000-000000000301',1,
    'phase11d-growing-roots-accept-0001','phase11d:quest:accept:replay');
  perform pg_temp.phase11d_assert(
    result->>'status'='accepted' and result#>>'{quest,questKind}'='progression_chapter'
      and result#>>'{quest,configurationRevision}'='1' and replay->>'status'='replayed'
      and public.accept_player_progression_quest(
        other_wallet,'d1100000-0000-4000-8000-000000000301',1,
        'phase11d-other-growing-roots-0001','phase11d:quest:other')->>'status'='quest_prerequisite_not_met',
    'Growing Roots requires the reused tutorial chain and returns immutable UUID/revision identity');
  result:=public.track_player_progression_quest(owner_wallet,quest_instance_id,true,1,'phase11d:quest:track');
  perform pg_temp.phase11d_assert(
    result->>'status'='updated' and (result#>>'{quest,tracked}')::boolean
      and public.complete_player_progression_quest(owner_wallet,quest_instance_id,2,
        'phase11d-growing-roots-incomplete-0001','phase11d:quest:incomplete')->>'status'='quest_objective_incomplete',
    'tracking is owner-safe and incomplete objectives cannot be client-completed');
  perform private.progression_apply_objective_event(
    owner_id,'crop_harvested',gen_random_uuid(),null,null,1,0,
    'phase11d:objective:correlation'
  );
  perform pg_temp.phase11d_assert(
    exists(select 1 from public.progression_owner_events as event
      where event.player_profile_id=owner_id and event.event_key='quest_progressed'
        and event.safe_payload->>'requestId'='phase11d:objective:correlation'),
    'objective progress persists its authoritative request correlation'
  );
  update public.player_quest_objective_progress progress set current_count=objective.required_count,
    completed_at=now() from public.cozy_quest_objectives objective
    where progress.player_quest_instance_id=quest_instance_id and objective.id=progress.quest_objective_id;
  result:=public.complete_player_progression_quest(owner_wallet,quest_instance_id,3,
    'phase11d-growing-roots-complete-0001','phase11d:quest:complete');
  replay:=public.complete_player_progression_quest(owner_wallet,quest_instance_id,4,
    'phase11d-growing-roots-complete-0001','phase11d:quest:complete:replay');
  perform pg_temp.phase11d_assert(
    result->>'status'='completed' and replay->>'status'='replayed'
      and (select count(*)=2 from public.player_progression_rewards reward
        join public.progression_reward_definitions definition on definition.id=reward.reward_definition_id
        where reward.player_profile_id=owner_id and definition.source_version_id='d1100000-0000-4000-8000-000000000311')
      and (select count(*)=1 from public.player_progression_titles
        where player_profile_id=owner_id and title_id='d1100000-0000-4000-8000-000000000602'),
    'quest completion settles each configured reward once and replays without duplicate ownership');

  result:=public.update_player_progression_identity(
    owner_wallet,'d1100000-0000-4000-8000-000000000602',null,1,'phase11d:title:equip');
  perform pg_temp.phase11d_assert(
    result->>'status'='updated'
      and (select equipped_title_key='rooted-neighbor' from public.player_profiles where id=owner_id)
      and public.update_player_progression_identity(
        owner_wallet,'d1100000-0000-4000-8000-000000000604',null,2,
        'phase11d:title:unowned')->>'status'='title_not_owned',
    'only earned enabled titles can be equipped in the safe public profile projection');

  event_page:=public.get_player_progression_events(owner_wallet,0,50,'phase11d:events');
  perform pg_temp.phase11d_assert(
    event_page->>'status'='loaded' and jsonb_array_length(event_page->'events')>0
      and exists(select 1 from jsonb_array_elements(event_page->'events') event
        where event->>'eventKey'='skill_level_up')
      and exists(select 1 from jsonb_array_elements(event_page->'events') event
        where event->>'eventKey'='unlock_granted'),
    'bounded owner events carry reconnect-safe level and unlock notifications');

  select progression_revision into strict farming_revision from public.player_skill_progress
    where player_profile_id=owner_id and skill_definition_id='d1100000-0000-4000-8000-000000000010';
  perform pg_temp.phase11d_assert(farming_revision>1,'progression revisions advance with trusted events');
end;
$$;

do $$
declare
  admin_user_id constant uuid:='fd110000-0000-4000-8000-000000000001';
  auth_session_id constant uuid:='fd110000-0000-4000-8000-000000000002';
  admin_session_id constant uuid:='fd110000-0000-4000-8000-000000000003';
  owner_wallet constant text:='11111111111111111111111111111195';
  owner_id uuid; super_role_id uuid; permission_version integer; session_version integer;
  old_curve_id uuid; draft_curve_id uuid; active_skill_id uuid; draft_skill_id uuid;
  correction_id uuid; queue_id uuid;
  farming_revision integer; title_revision integer; thresholds jsonb;
  result jsonb; workspace jsonb;
begin
  select id into strict owner_id from public.player_profiles where wallet_address=owner_wallet;
  select id into strict super_role_id from public.admin_roles where key='super_admin';
  insert into auth.users(id,email) values(admin_user_id,'phase11d-admin@example.invalid');
  insert into auth.sessions(id,user_id) values(auth_session_id,admin_user_id);
  insert into public.admin_users(user_id,role_id,status,display_name,mfa_required)
    values(admin_user_id,super_role_id,'active','Phase 11D Admin',false)
    returning admin_users.permission_version,admin_users.session_version into permission_version,session_version;
  insert into public.admin_sessions(
    id,user_id,auth_session_id,status,expires_at,permission_version_snapshot,session_version_snapshot
  ) values(admin_session_id,admin_user_id,auth_session_id,'active',now()+interval '1 hour',permission_version,session_version);

  workspace:=public.get_admin_progression_workspace(
    admin_user_id,auth_session_id,'aal2',owner_wallet,'','phase11d:admin:workspace');
  perform pg_temp.phase11d_assert(
    workspace->>'status'='loaded' and jsonb_array_length(workspace->'skills')=8
      and jsonb_array_length(workspace->'badges')=3
      and workspace#>>'{player,playerLevel,level}' is not null,
    'authorized AAL2 operations can inspect bounded configuration and one private player projection');

  select curve_version_id into strict old_curve_id from public.progression_active_curve_versions
    where curve_key='starter-skill-curve';
  select jsonb_agg(jsonb_build_object('level',level,'cumulativeXp',cumulative_xp) order by level)
    into thresholds from public.progression_curve_thresholds where curve_version_id=old_curve_id;
  result:=public.create_admin_progression_curve_successor(
    admin_user_id,auth_session_id,'aal2',old_curve_id,'Phase 11D local successor',thresholds,
    'Validate reviewed curve lifecycle locally.','phase11d-admin-curve-create');
  draft_curve_id:=(result->>'versionId')::uuid;
  result:=public.validate_admin_progression_curve(
    admin_user_id,auth_session_id,'aal2',draft_curve_id,1,
    'Validate strict monotonic thresholds locally.','phase11d-admin-curve-validate');
  perform pg_temp.phase11d_assert(result->>'status'='validated' and result->>'revision'='2',
    'curve validation records immutable review evidence');
  result:=public.activate_admin_progression_curve(
    admin_user_id,auth_session_id,'aal2',draft_curve_id,2,
    'Activate reviewed local curve without migrating players.','phase11d-admin-curve-activate');
  perform pg_temp.phase11d_assert(
    result->>'status'='activated' and result->>'playersMigrated'='0'
      and (select curve_version_id=draft_curve_id from public.progression_active_curve_versions
        where curve_key='starter-skill-curve')
      and (select version.curve_version_id=old_curve_id from public.player_skill_progress progress
        join public.progression_skill_versions version on version.id=progress.skill_version_id
        where progress.player_profile_id=owner_id
          and progress.skill_definition_id='d1100000-0000-4000-8000-000000000010'),
    'reviewed curve activation moves only the canonical pointer and preserves pinned earned progress');

  select skill_version_id into strict active_skill_id
  from public.progression_active_skill_versions
  where skill_definition_id='d1100000-0000-4000-8000-000000000010';
  result:=public.create_admin_progression_successor(
    admin_user_id,auth_session_id,'aal2','skill',
    'd1100000-0000-4000-8000-000000000010',active_skill_id,'{}'::jsonb,
    'Create a local skill successor for generic transition validation.',
    'phase11d-admin-skill-successor'
  );
  draft_skill_id:=(result->>'versionId')::uuid;
  result:=public.transition_admin_progression_version(
    admin_user_id,auth_session_id,'aal2','skill',draft_skill_id,1,'validate',
    'Validate the generic skill lifecycle transition locally.',
    'phase11d-admin-skill-transition'
  );
  perform pg_temp.phase11d_assert(
    result->>'status'='validated' and result->>'revision'='2'
      and (select lifecycle_status='validated' and configuration_revision=2
        from public.progression_skill_versions where id=draft_skill_id),
    'generic progression transition uses qualified version revision state'
  );

  select progression_revision into strict farming_revision from public.player_skill_progress
    where player_profile_id=owner_id and skill_definition_id='d1100000-0000-4000-8000-000000000010';
  result:=public.request_admin_progression_correction(
    admin_user_id,auth_session_id,'aal2',owner_wallet,'d1100000-0000-4000-8000-000000000010',20,
    farming_revision,'Local evidence for a compensating XP correction.','phase11d-admin-correction-preview');
  correction_id:=(result->>'correctionId')::uuid;
  result:=public.apply_admin_progression_correction(
    admin_user_id,auth_session_id,'aal2',correction_id,farming_revision,
    'Reviewed local compensating event with preserved evidence.','phase11d-admin-correction-apply');
  perform pg_temp.phase11d_assert(
    result->>'status'='applied'
      and exists(select 1 from public.progression_xp_events where source_entity_id=correction_id
        and source_event_key='progression_correction' and environment='admin_correction')
      and (select status='applied' from public.progression_corrections where id=correction_id),
    'AAL2 corrections append a compensating event instead of rewriting XP history');

  result:=public.request_admin_progression_reconciliation(
    admin_user_id,auth_session_id,'aal2',owner_wallet,'full_player',80,
    'Verify the complete local player projection after correction.','phase11d-admin-reconcile');
  queue_id:=(result->>'queueId')::uuid;
  result:=public.run_progression_maintenance(50,'phase11d-worker-maintenance');
  perform pg_temp.phase11d_assert(
    result->>'status'='processed' and (select status='resolved' from public.progression_reconciliation_queue where id=queue_id)
      and result->>'automaticXpCorrections'='0',
    'bounded maintenance resolves projection checks without automatic XP corrections');

  select configuration_revision into strict title_revision from public.progression_titles
    where id='d1100000-0000-4000-8000-000000000602';
  result:=public.update_admin_progression_presentation(
    admin_user_id,auth_session_id,'aal2','title','d1100000-0000-4000-8000-000000000602',title_revision,
    '{"displayName":"Rooted Neighbor","description":"Earned by growing beyond the first Moonbean harvest.","rarity":"uncommon","enabled":false,"visible":true}'::jsonb,
    'Disable presentation locally while preserving ownership.','phase11d-admin-title-update');
  perform pg_temp.phase11d_assert(
    result->>'status'='updated' and (result->>'ownershipPreserved')::boolean
      and exists(select 1 from public.player_progression_titles where player_profile_id=owner_id
        and title_id='d1100000-0000-4000-8000-000000000602')
      and not exists(select 1 from public.player_progression_preferences where player_profile_id=owner_id
        and equipped_title_id='d1100000-0000-4000-8000-000000000602'),
    'title management preserves earned ownership and safely clears disabled presentation');

  result:=public.update_admin_progression_live_ops(
    admin_user_id,auth_session_id,'aal2',1,
    jsonb_build_object('multiplier',1.5,'multiplierStartsAt',now()-interval '1 minute',
      'multiplierEndsAt',now()+interval '1 hour','maintenanceMessage','Progression is available.'),
    'Exercise bounded local multiplier controls.','phase11d-admin-liveops');
  perform pg_temp.phase11d_assert(
    result->>'status'='updated' and (result#>>'{settings,multiplier}')::numeric=1.5
      and (select count(*)>=7 from public.progression_admin_audit_events where actor_user_id=admin_user_id),
    'live-ops multiplier is bounded, windowed, revision checked, and audited');
end;
$$;

do $$
declare blocked boolean:=false;
begin
  begin
    update public.progression_skill_versions set maximum_level=19
      where id=(select skill_version_id from public.progression_active_skill_versions limit 1);
  exception when sqlstate '55000' then blocked:=true;
  end;
  perform pg_temp.phase11d_assert(blocked,'active progression versions reject casual edits');
end;
$$;

select pg_temp.phase11d_assert(
  not has_table_privilege('authenticated','public.progression_xp_events','SELECT')
  and not has_table_privilege('authenticated','public.player_skill_progress','UPDATE')
  and not has_table_privilege('service_role','public.progression_xp_events','SELECT')
  and has_function_privilege('service_role','public.get_player_progression_workspace(text,integer,text)','EXECUTE')
  and has_function_privilege('service_role','public.complete_player_progression_quest(text,uuid,integer,text,text)','EXECUTE')
  and has_function_privilege('service_role','public.activate_admin_progression_curve(uuid,uuid,text,uuid,integer,text,text)','EXECUTE')
  and has_function_privilege('service_role','public.update_admin_progression_presentation(uuid,uuid,text,text,uuid,integer,jsonb,text,text)','EXECUTE')
  and has_function_privilege('service_role','public.run_progression_maintenance(integer,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.get_player_progression_workspace(text,integer,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.run_progression_maintenance(integer,text)','EXECUTE'),
  'RLS and grants expose only narrow service-authorized player, admin, and worker RPCs'
);

select 'Phase 11D progression execution assertions passed' as result;

rollback;
