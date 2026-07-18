\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.phase12a_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then
    raise exception 'PHASE12A_ASSERTION_FAILED: %',message;
  end if;
end;
$$;

select pg_temp.phase12a_assert(
  (select count(*)=4 from public.admin_permissions where key like 'player_experience.%')
  and (select count(*)=14 from public.player_experience_onboarding_steps)
  and (select count(*)=8 from public.player_experience_daily_objective_definitions)
  and (select count(*)=11 from public.player_experience_guidance_targets)
  and exists(select 1 from public.player_experience_active_onboarding)
  and exists(select 1 from public.player_experience_active_daily_policy),
  'the versioned onboarding, daily rhythm, semantic targets, and bounded permissions are seeded'
);

select pg_temp.phase12a_assert(
  (select bool_and(relation.relrowsecurity and relation.relforcerowsecurity)
   from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
   where namespace.nspname='public' and relation.relname in (
     'player_onboarding_states','player_onboarding_step_evidence',
     'player_daily_assignments','player_daily_objective_progress',
     'player_daily_objective_contributions','player_experience_recovery_queue',
     'player_experience_owner_events','player_experience_telemetry_events',
     'player_experience_admin_audit_events'
   ))
  and not has_table_privilege('authenticated','public.player_onboarding_states','select')
  and not has_table_privilege('authenticated','public.player_daily_assignments','insert')
  and not has_function_privilege('authenticated','public.start_player_onboarding(text,integer,text,text)','execute')
  and has_function_privilege('service_role','public.get_player_experience_workspace(text,bigint,integer,text)','execute'),
  'player experience state is RLS fail-closed and exposed only through the service-role RPC boundary'
);

do $$
declare
  wallet constant text:='11111111111111111111111111112321';
  player_id uuid; result jsonb; state_revision integer; dust_before numeric;
  source_id uuid:=gen_random_uuid(); daily_source_id uuid:=gen_random_uuid();
  daily_progress_id uuid; daily_event_key text; daily_required integer;
begin
  insert into public.player_profiles(
    wallet_address,display_name,appearance_preset,current_map_id,current_map_version_id,
    safe_position_x,safe_position_y,facing_direction
  ) values(wallet,'P12A Explorer','moss','lantern-square',
    '79000000-0000-4000-8000-000000000001',12,7.5,'south')
  returning id into player_id;

  perform public.bootstrap_player_cozy_gameplay(
    wallet,'phase12a-bootstrap-0001','phase12a:bootstrap:0001'
  );
  select balance into strict dust_before from public.player_dust_accounts
  where player_profile_id=player_id;

  result:=public.get_player_experience_workspace(wallet,0,20,'phase12a:workspace:0001');
  perform pg_temp.phase12a_assert(
    result->>'status'='loaded'
      and jsonb_array_length(result#>'{experience,onboarding,steps}')=14
      and jsonb_array_length(result#>'{experience,daily,objectives}')=3
      and jsonb_array_length(result#>'{experience,guide}')=10
      and result#>>'{experience,persistence}'='normal'
      and result#>>'{experience,starterQuestline,chainKey}'='starville-beginnings',
    'the reconnect-safe workspace composes onboarding, daily, guide, feedback, and the canonical starter questline'
  );
  perform pg_temp.phase12a_assert(
    (select count(distinct definition.category)=3
      from public.player_daily_objective_progress progress
      join public.player_experience_daily_objective_definitions definition
        on definition.id=progress.objective_definition_id
      where progress.player_profile_id=player_id)
      and (select count(*)=1
        from public.player_daily_objective_progress progress
        join public.player_experience_daily_objective_definitions definition
          on definition.id=progress.objective_definition_id
        where progress.player_profile_id=player_id and definition.category='farming')
      and (select count(*)<=1
        from public.player_daily_objective_progress progress
        join public.player_experience_daily_objective_definitions definition
          on definition.id=progress.objective_definition_id
        where progress.player_profile_id=player_id and definition.social),
    'daily generation is deterministic, balanced, solo-safe, and bounded to at most one social objective'
  );
  result:=public.refresh_player_daily_objectives(
    wallet,1,'phase12a-daily-refresh-0001','phase12a:daily-refresh:0001'
  );
  perform pg_temp.phase12a_assert(
    result->>'status'='refreshed'
      and (select count(*)=1 from public.player_daily_assignments where player_profile_id=player_id)
      and (select count(*)=3 from public.player_daily_objective_progress where player_profile_id=player_id),
    'daily refresh is revision-bound and cannot submit arbitrary objectives or duplicate the UTC assignment'
  );

  select state.state_revision into strict state_revision from public.player_onboarding_states state
  where state.player_profile_id=player_id;
  result:=public.start_player_onboarding(
    wallet,state_revision,'phase12a-start-idempotency-0001','phase12a:start:0001'
  );
  perform public.start_player_onboarding(
    wallet,state_revision,'phase12a-start-idempotency-0001','phase12a:start:replay'
  );
  perform pg_temp.phase12a_assert(
    result->>'status'='started'
      and (select balance=dust_before from public.player_dust_accounts where player_profile_id=player_id)
      and (select count(*)=1 from public.progression_quest_chains where chain_key='starville-beginnings')
      and (select count(*)=1 from public.player_experience_owner_events
        where player_profile_id=player_id and event_key='onboarding_started'),
    'starting guidance creates no parallel quest engine and awards no duplicate DUST'
  );

  perform private.player_experience_apply_trusted_event(
    player_id,'crop_planted',source_id,'cozy_private_plot_events',1,
    'phase12a:event:plant:0001','{"fixture":true}'::jsonb
  );
  perform private.player_experience_apply_trusted_event(
    player_id,'crop_planted',source_id,'cozy_private_plot_events',1,
    'phase12a:event:plant:replay','{"fixture":true}'::jsonb
  );
  perform pg_temp.phase12a_assert(
    (select count(*)=1 from public.player_onboarding_step_evidence
      where player_profile_id=player_id and source_entity_id=source_id),
    'replayed authoritative onboarding evidence settles exactly once'
  );

  select progress.id,definition.authoritative_event_key,progress.required_count
  into strict daily_progress_id,daily_event_key,daily_required
  from public.player_daily_objective_progress progress
  join public.player_experience_daily_objective_definitions definition
    on definition.id=progress.objective_definition_id
  where progress.player_profile_id=player_id and progress.status='active'
  order by progress.sequence_number limit 1;
  perform private.player_experience_apply_daily_event(
    player_id,daily_event_key,daily_source_id,daily_required,'phase12a:daily:0001'
  );
  perform private.player_experience_apply_daily_event(
    player_id,daily_event_key,daily_source_id,daily_required,'phase12a:daily:replay'
  );
  perform pg_temp.phase12a_assert(
    (select count(*)=1 from public.player_daily_objective_contributions
      where progress_id=daily_progress_id and source_entity_id=daily_source_id)
      and (select status='settled' and current_count=required_count
        from public.player_daily_objective_progress where id=daily_progress_id),
    'daily contributions are authoritative, capped, and replay-safe without economic rewards'
  );

  select state.state_revision into strict state_revision from public.player_onboarding_states state
  where state.player_profile_id=player_id;
  result:=public.request_player_experience_recovery(
    wallet,'guidance_target_missing',state_revision,
    'phase12a-recovery-idempotency-0001','phase12a:recovery:0001'
  );
  perform public.request_player_experience_recovery(
    wallet,'guidance_target_missing',state_revision,
    'phase12a-recovery-idempotency-0001','phase12a:recovery:replay'
  );
  perform pg_temp.phase12a_assert(
    result->>'status'='recovery_requested'
      and (select count(*)=1 from public.player_experience_recovery_queue where player_profile_id=player_id)
      and (select count(*)=1 from public.player_experience_owner_events
        where player_profile_id=player_id and event_key='recovery_requested'),
    'recovery requests preserve evidence and replay without duplicate feedback or grants'
  );

  result:=public.reconcile_phase12a_player_experience(10,'phase12a:worker:0001');
  perform pg_temp.phase12a_assert(
    result->>'status'='completed' and (result->>'processed')::integer=1
      and (result->>'investigationRequired')::integer=1,
    'the bounded worker fails ambiguous recovery into investigation instead of guessing'
  );
end;
$$;

do $$
declare
  admin_user_id constant uuid:='12a00000-0000-4000-8000-000000000101';
  auth_session_id constant uuid:='12a00000-0000-4000-8000-000000000102';
  admin_session_id constant uuid:='12a00000-0000-4000-8000-000000000103';
  role_id uuid; permission_version integer; session_version integer;
  active_policy_id uuid; active_revision integer; successor_id uuid; result jsonb;
begin
  select id into strict role_id from public.admin_roles where key='game_administrator';
  insert into auth.users(id,email) values(admin_user_id,'phase12a-admin@example.invalid');
  insert into auth.sessions(id,user_id) values(auth_session_id,admin_user_id);
  insert into public.admin_users(user_id,role_id,status,display_name,mfa_required)
  values(admin_user_id,role_id,'active','Phase 12A Admin',true)
  returning admin_users.permission_version,admin_users.session_version
    into permission_version,session_version;
  insert into public.admin_sessions(
    id,user_id,auth_session_id,status,expires_at,permission_version_snapshot,session_version_snapshot
  ) values(admin_session_id,admin_user_id,auth_session_id,'active',now()+interval '1 hour',
    permission_version,session_version);
  select version.id,version.configuration_revision into strict active_policy_id,active_revision
  from public.player_experience_active_daily_policy active
  join public.player_experience_daily_policy_versions version on version.id=active.policy_version_id
  where active.singleton_key;
  begin
    perform public.create_admin_player_experience_daily_policy_successor(
      admin_user_id,auth_session_id,'aal1',active_policy_id,active_revision,now(),
      'A valid successor reason that still requires verified AAL2.',
      'phase12a:daily-policy:aal1'
    );
    raise exception 'PHASE12A_ASSERTION_FAILED: daily policy successor accepted AAL1';
  exception when insufficient_privilege then null;
  end;
  result:=public.create_admin_player_experience_daily_policy_successor(
    admin_user_id,auth_session_id,'aal2',active_policy_id,active_revision,now(),
    'Create a local reviewed Daily Rhythm successor without changing the active policy.',
    'phase12a:daily-policy:successor'
  );
  successor_id:=(result->>'versionId')::uuid;
  perform public.create_admin_player_experience_daily_policy_successor(
    admin_user_id,auth_session_id,'aal2',active_policy_id,active_revision,now(),
    'Create a local reviewed Daily Rhythm successor without changing the active policy.',
    'phase12a:daily-policy:successor'
  );
  perform pg_temp.phase12a_assert(
    result->>'status'='created' and (result->>'activePolicyUnchanged')::boolean
      and (select policy_version_id=active_policy_id from public.player_experience_active_daily_policy where singleton_key)
      and (select status='draft' from public.player_experience_daily_policy_versions where id=successor_id)
      and (select count(*)=8 from public.player_experience_daily_objective_definitions where policy_version_id=successor_id)
      and (select count(*)=1 from public.player_experience_admin_audit_events
        where actor_user_id=admin_user_id and request_id='phase12a:daily-policy:successor'),
    'daily policy management is AAL2, audited, idempotent, version-pinned, and successor-only'
  );
end;
$$;

select 'Phase 12A player-experience execution assertions passed' as result;

rollback;
