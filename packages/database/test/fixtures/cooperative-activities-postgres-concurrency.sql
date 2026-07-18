-- Persistent local-only helpers for Phase 8D-B real PostgreSQL concurrency races.
drop schema if exists phase8db_test cascade;
create schema phase8db_test;

create or replace function phase8db_test.reset()
returns void language plpgsql set search_path = '' as $$
begin
  update public.cooperative_activity_participants set
    connection_status = 'removed', reward_eligible = false,
    reconnect_deadline = null, removed_at = coalesce(removed_at, now()),
    removal_reason = coalesce(removal_reason, 'local_test_reset')
  where player_profile_id in (
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002'
  ) and connection_status in ('online', 'reconnecting');
  update public.cooperative_activity_instances instance set
    status = 'failed', completed_at = coalesce(instance.completed_at, now()),
    result_code = 'local_test_reset', reward_settlement_status = 'not_applicable',
    revision = instance.revision + 1
  where instance.status in ('preparing', 'waiting_for_players', 'active', 'paused')
    and exists (
      select 1 from public.cooperative_activity_participants participant
      where participant.instance_id = instance.id
        and participant.player_profile_id in (
          '82000000-0000-4000-8000-000000000001',
          '82000000-0000-4000-8000-000000000002'
        )
    );
  delete from public.cooperative_activity_cooldowns
  where player_profile_id in (
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002'
  );
  delete from public.cooperative_activity_idempotency
  where player_profile_id in (
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002'
  );
  delete from public.cooperative_activity_rate_limits
  where player_profile_id in (
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002'
  );
  update public.player_party_members set
    status = 'removed', role = 'member', ended_at = coalesce(ended_at, now())
  where player_profile_id in (
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002'
  ) and status = 'active';
  update public.player_parties set status = 'disbanded', closed_at = coalesce(closed_at, now()),
    leader_reconnect_deadline = null, dormant_deadline = null
  where status = 'active' and id in (
    select party_id from public.player_party_members
    where player_profile_id in (
      '82000000-0000-4000-8000-000000000001',
      '82000000-0000-4000-8000-000000000002'
    )
  );
  update public.player_moderation_states set
    status = 'active', suspension_reason = null, suspended_at = null,
    suspended_by_admin_id = null, rename_required = false, rename_reason = null,
    rename_required_at = null, rename_required_by_admin_id = null, version = version + 1
  where player_profile_id in (
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002'
  );
  update public.realtime_sessions set
    status = 'active', closed_at = null, close_reason = null,
    last_heartbeat_at = now(), last_position_x = 14, last_position_y = 9
  where id in (
    '82000000-0000-4000-8000-000000000007',
    '82000000-0000-4000-8000-000000000008'
  );
  update public.wallet_access_sessions set expires_at = now() + interval '30 minutes',
    status = 'active', revoked_at = null, revoke_reason = null
  where id in (
    select wallet_access_session_id from public.realtime_sessions where id in (
      '82000000-0000-4000-8000-000000000007',
      '82000000-0000-4000-8000-000000000008'
    )
  );
  update public.cooperative_activity_settings set
    module_enabled = true, public_queue_enabled = false,
    allow_existing_instances_to_finish = true
  where singleton_key;
end;
$$;

create or replace function phase8db_test.party()
returns uuid language plpgsql set search_path = '' as $$
declare party_id uuid := gen_random_uuid();
begin
  insert into public.player_parties (
    id, public_party_id, status, capacity, revision, leader_profile_id
  ) values (
    party_id, gen_random_uuid(), 'active', 4, 1,
    '82000000-0000-4000-8000-000000000001'
  );
  insert into public.player_party_members (
    party_id, player_profile_id, role, status, connection_status
  ) values
    (party_id, '82000000-0000-4000-8000-000000000001', 'leader', 'active', 'online'),
    (party_id, '82000000-0000-4000-8000-000000000002', 'member', 'active', 'online');
  return party_id;
end;
$$;

create or replace function phase8db_test.prepare(p_scenario text)
returns jsonb language plpgsql set search_path = '' as $$
declare party_id uuid;
declare instance public.cooperative_activity_instances%rowtype;
declare version public.cooperative_activity_versions%rowtype;
declare map_id uuid;
declare preparation jsonb;
declare ready jsonb;
declare objective jsonb;
declare sequence_number integer := 0;
begin
  perform phase8db_test.reset();
  party_id := phase8db_test.party();
  select activity_version.* into strict version
  from public.cooperative_activity_versions activity_version
  where id = '8d0b0000-0000-4000-8000-000000000001';
  select id into strict map_id from public.world_maps where slug = 'moonpetal-meadow';
  if p_scenario = 'entry' then
    preparation := public.prepare_realtime_cooperative_activity_entry(
      '82000000-0000-4000-8000-000000000007',
      'moonpetal-harvest-help', 1, 'phase8db-race-entry-prepare'
    );
    ready := public.respond_realtime_party_ready_check(
      '82000000-0000-4000-8000-000000000007',
      (preparation #>> '{preparation,readyCheckId}')::uuid,
      (preparation #>> '{preparation,partyRevision}')::integer,
      'ready', 'phase8db-race-entry-ready-a'
    );
    ready := public.respond_realtime_party_ready_check(
      '82000000-0000-4000-8000-000000000008',
      (preparation #>> '{preparation,readyCheckId}')::uuid,
      (ready #>> '{party,revision}')::integer,
      'ready', 'phase8db-race-entry-ready-b'
    );
    return jsonb_build_object(
      'partyId', party_id,
      'preparationId', preparation #>> '{preparation,preparationId}'
    );
  end if;
  insert into public.cooperative_activity_instances (
    activity_version_id, party_id, party_public_id, locked_party_revision,
    leader_profile_id, status, current_objective_key, revision,
    minimum_active_participants, waiting_expires_at, started_at, expires_at,
    return_world_map_id
  ) select
    version.id, party.id, party.public_party_id, party.revision,
    '82000000-0000-4000-8000-000000000001', 'active',
    'community-harvest-complete', 1, 2, now() + interval '2 minutes', now(),
    now() + interval '8 minutes', map_id
  from public.player_parties party where party.id = party_id
  returning * into instance;
  insert into public.cooperative_activity_participants (
    instance_id, player_profile_id, public_presence_id, connection_status,
    reward_eligible, contribution
  ) select instance.id, profile.id, profile.public_presence_id, 'online', true, 2
  from public.player_profiles profile
  where profile.id in (
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002'
  );
  for objective in select value from jsonb_array_elements(version.objective_definitions) loop
    sequence_number := sequence_number + 1;
    insert into public.cooperative_activity_objectives (
      instance_id, objective_key, sequence_number, objective_type, label,
      target, current_progress, status, started_at, completed_at
    ) values (
      instance.id, objective ->> 'key', sequence_number, objective ->> 'type',
      objective ->> 'label', (objective ->> 'target')::integer,
      case when objective ->> 'key' = 'community-harvest-complete'
        then 0 else (objective ->> 'target')::integer end,
      case when objective ->> 'key' = 'community-harvest-complete'
        then 'active' else 'completed' end,
      now(), case when objective ->> 'key' = 'community-harvest-complete'
        then null else now() end
    );
  end loop;
  return jsonb_build_object(
    'partyId', party_id,
    'instanceId', instance.public_instance_id,
    'internalInstanceId', instance.id,
    'revision', instance.revision
  );
end;
$$;

create or replace function phase8db_test.clone_for_daily_limit()
returns uuid language plpgsql set search_path = '' as $$
declare source public.cooperative_activity_instances%rowtype;
declare target public.cooperative_activity_instances%rowtype;
declare party_id uuid := gen_random_uuid();
begin
  select * into strict source from public.cooperative_activity_instances
  where status = 'active' order by created_at limit 1;
  update public.cooperative_activity_participants set connection_status = 'offline'
  where instance_id = source.id;
  insert into public.player_parties (
    id, public_party_id, status, capacity, revision, leader_profile_id
  ) values (
    party_id, gen_random_uuid(), 'active', 4, 1,
    '82000000-0000-4000-8000-000000000001'
  );
  insert into public.cooperative_activity_instances (
    activity_version_id, party_id, party_public_id, locked_party_revision,
    leader_profile_id, status, current_objective_key, revision,
    minimum_active_participants, waiting_expires_at, started_at, expires_at,
    return_world_map_id
  ) values (
    source.activity_version_id, party_id,
    (select public_party_id from public.player_parties where id = party_id),
    1, source.leader_profile_id, 'active', source.current_objective_key, 1, 2,
    now() + interval '2 minutes', now(), now() + interval '8 minutes',
    source.return_world_map_id
  ) returning * into target;
  insert into public.cooperative_activity_participants (
    instance_id, player_profile_id, public_presence_id, connection_status,
    reward_eligible, contribution
  ) select target.id, participant.player_profile_id, participant.public_presence_id,
    'offline', participant.reward_eligible, participant.contribution
  from public.cooperative_activity_participants participant
  where participant.instance_id = source.id;
  insert into public.cooperative_activity_objectives (
    instance_id, objective_key, sequence_number, objective_type, label,
    target, current_progress, status, started_at, completed_at, timer_ends_at
  ) select target.id, source_objective.objective_key,
    source_objective.sequence_number, source_objective.objective_type,
    source_objective.label, source_objective.target, source_objective.current_progress,
    source_objective.status, source_objective.started_at,
    source_objective.completed_at, source_objective.timer_ends_at
  from public.cooperative_activity_objectives source_objective
  where source_objective.instance_id = source.id;
  return target.id;
end;
$$;

select 'cooperative activity concurrency helpers prepared' as result;
