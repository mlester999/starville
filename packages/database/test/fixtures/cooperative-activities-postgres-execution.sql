-- Exercises Phase 8D-B private-party entry, isolated objectives, timers, and exact-once rewards.
begin;

create or replace function pg_temp.activity_assert(condition boolean, assertion_message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception using errcode = 'P0001',
      message = 'COOPERATIVE_ACTIVITY_ASSERTION_FAILED: ' || assertion_message;
  end if;
end;
$$;

do $$
declare
  player_a constant uuid := '8d0c0000-0000-4000-8000-000000000001';
  player_b constant uuid := '8d0c0000-0000-4000-8000-000000000002';
  player_c constant uuid := '8d0c0000-0000-4000-8000-000000000003';
  player_d constant uuid := '8d0c0000-0000-4000-8000-000000000004';
  player_e constant uuid := '8d0c0000-0000-4000-8000-000000000005';
  realtime_a constant uuid := '8d0c0000-0000-4000-8000-000000000011';
  realtime_b constant uuid := '8d0c0000-0000-4000-8000-000000000012';
  challenge_a constant uuid := '8d0c0000-0000-4000-8000-000000000021';
  challenge_b constant uuid := '8d0c0000-0000-4000-8000-000000000022';
  access_a constant uuid := '8d0c0000-0000-4000-8000-000000000031';
  access_b constant uuid := '8d0c0000-0000-4000-8000-000000000032';
  config_id uuid; map_id uuid; map_version_id uuid; channel_id uuid;
  result jsonb; replay jsonb; party_revision integer; invitation_id uuid; active_party_id uuid;
  preparation_id uuid; ready_check_id uuid; activity_instance_public_id uuid; revision integer;
  guard_party_id uuid; guard_instance_id uuid; index_number integer; session_id uuid; object_key text;
  objectives jsonb;
  before_a bigint; before_b bigint; completion_count integer;
begin
  select id into strict config_id from public.token_gate_configs
  where environment_key = 'development' and network = 'solana:devnet';
  select map.id, map.active_published_version_id into strict map_id, map_version_id
  from public.world_maps map where map.slug = 'moonpetal-meadow';
  select id into strict channel_id from public.realtime_channels
  where world_map_id = map_id and channel_number = 1;

  insert into public.wallet_auth_challenges (
    id, wallet_address, network, token_gate_config_id, config_version_snapshot,
    nonce_hash, message_hash, domain, uri, issued_at, expires_at, consumed_at, request_id, ip_hash
  ) values
    (challenge_a, '11111111111111111111111111111121', 'solana:devnet', config_id, 1,
      repeat('4',64), repeat('5',64), 'localhost', 'http://localhost:3000', now()-interval '1 minute', now()+interval '4 minutes', now(), 'phase8db-a', repeat('6',64)),
    (challenge_b, '11111111111111111111111111111122', 'solana:devnet', config_id, 1,
      repeat('7',64), repeat('8',64), 'localhost', 'http://localhost:3000', now()-interval '1 minute', now()+interval '4 minutes', now(), 'phase8db-b', repeat('9',64));
  insert into public.wallet_access_sessions (
    id, challenge_id, wallet_address, network, token_gate_config_id, config_version_snapshot,
    session_token_hash, observed_balance_raw, required_balance_raw, checked_slot,
    last_balance_check_at, expires_at
  ) values
    (access_a,challenge_a,'11111111111111111111111111111121','solana:devnet',config_id,1,repeat('d',64),1000,1000,1,now(),now()+interval '30 minutes'),
    (access_b,challenge_b,'11111111111111111111111111111122','solana:devnet',config_id,1,repeat('e',64),1000,1000,1,now(),now()+interval '30 minutes');
  insert into public.player_profiles (
    id, wallet_address, display_name, appearance_preset, current_map_id,
    current_map_version_id, safe_position_x, safe_position_y, facing_direction
  ) values
    (player_a,'11111111111111111111111111111121','Activity Player A','moss','moonpetal-meadow',map_version_id,10,13,'north'),
    (player_b,'11111111111111111111111111111122','Activity Player B','river','moonpetal-meadow',map_version_id,10.5,13,'north'),
    (player_c,'11111111111111111111111111111123','Activity Extra C','moss','moonpetal-meadow',map_version_id,11,13,'north'),
    (player_d,'11111111111111111111111111111124','Activity Extra D','marigold','moonpetal-meadow',map_version_id,11.5,13,'north'),
    (player_e,'11111111111111111111111111111125','Activity Extra E','moonberry','moonpetal-meadow',map_version_id,12,13,'north');
  insert into public.realtime_sessions (
    id, player_profile_id, wallet_access_session_id, world_map_id, world_map_version_id,
    channel_id, connection_id, last_position_x, last_position_y, last_facing_direction
  ) values
    (realtime_a,player_a,access_a,map_id,map_version_id,channel_id,'phase8db-a',10,13,'north'),
    (realtime_b,player_b,access_b,map_id,map_version_id,channel_id,'phase8db-b',10.5,13,'north');

  perform public.bootstrap_player_cozy_gameplay(
    '11111111111111111111111111111121','phase8db-bootstrap-player-a','phase8db-bootstrap-a'
  );
  perform public.bootstrap_player_cozy_gameplay(
    '11111111111111111111111111111122','phase8db-bootstrap-player-b','phase8db-bootstrap-b'
  );
  select balance into strict before_a from public.player_dust_accounts where player_profile_id = player_a;
  select balance into strict before_b from public.player_dust_accounts where player_profile_id = player_b;

  select objective_definitions into strict objectives
  from public.cooperative_activity_versions
  where id = '8d0b0000-0000-4000-8000-000000000001';
  perform pg_temp.activity_assert(
    (select provolatile='v' and prosecdef and not proisstrict and proparallel='u'
      from pg_proc where oid='public.enter_realtime_cooperative_activity(uuid,uuid,text)'::regprocedure)
      and (select count(*)=1 from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace
        where namespace.nspname='public' and routine.proname='enter_realtime_cooperative_activity')
      and position('member record' in lower(pg_get_functiondef('public.enter_realtime_cooperative_activity(uuid,uuid,text)'::regprocedure)))=0
      and not has_function_privilege('public','public.enter_realtime_cooperative_activity(uuid,uuid,text)','execute')
      and not has_function_privilege('anon','public.enter_realtime_cooperative_activity(uuid,uuid,text)','execute')
      and not has_function_privilege('authenticated','public.enter_realtime_cooperative_activity(uuid,uuid,text)','execute')
      and has_function_privilege('service_role','public.enter_realtime_cooperative_activity(uuid,uuid,text)','execute'),
    'entry metadata, single signature, removed declaration, and narrow grant are preserved'
  );
  perform pg_temp.activity_assert(
    private.valid_cooperative_activity_objectives(objectives)
      and not private.valid_cooperative_activity_objectives(jsonb_set(objectives,'{1,key}',objectives->0->'key'))
      and not private.valid_cooperative_activity_objectives(jsonb_set(objectives,'{0,type}','"unknown_objective"'::jsonb))
      and not private.valid_cooperative_activity_objectives(jsonb_set(objectives,'{0,nextObjectiveKey}','"community-harvest-complete"'::jsonb))
      and not private.valid_cooperative_activity_objectives(jsonb_set(objectives,'{3,timeLimitSeconds}','901'::jsonb))
      and not private.valid_cooperative_activity_objectives(jsonb_set(objectives,'{0,target}','101'::jsonb))
      and not private.valid_cooperative_activity_objectives(jsonb_set(objectives,'{0,script}','"alert(1)"'::jsonb))
      and position('index_number' in pg_get_functiondef('private.valid_cooperative_activity_objectives(jsonb)'::regprocedure))=0
      and position('objective_index' in pg_get_functiondef('private.valid_cooperative_activity_objectives(jsonb)'::regprocedure))>0,
    'objective validation keeps its closed sequence, timer, target, field, and loop-variable boundaries'
  );

  result := public.prepare_realtime_cooperative_activity_entry(
    realtime_b,'moonpetal-harvest-help',1,'phase8db-entry-non-member'
  );
  perform pg_temp.activity_assert(result->>'status'='party_required','a non-member cannot prepare activity entry');

  result := public.create_realtime_party(realtime_a,'phase8db-party-create');
  party_revision := (result #>> '{party,revision}')::integer;
  result := public.send_realtime_party_invitation(
    realtime_a,(select public_presence_id from public.player_profiles where id=player_b),
    party_revision,'phase8db-party-invite'
  );
  invitation_id := (result #>> '{invitation,id}')::uuid;
  party_revision := (result #>> '{party,revision}')::integer;
  result := public.respond_realtime_party_invitation(
    realtime_b,invitation_id,party_revision,'accept','phase8db-party-accept'
  );
  party_revision := (result #>> '{party,revision}')::integer;
  select member.party_id into strict active_party_id from public.player_party_members member
  where member.player_profile_id=player_a and member.status='active';

  result := public.prepare_realtime_cooperative_activity_entry(
    realtime_b,'moonpetal-harvest-help',party_revision,'phase8db-entry-non-leader'
  );
  perform pg_temp.activity_assert(result->>'status'='leader_required','a non-leader cannot prepare activity entry');
  result := public.prepare_realtime_cooperative_activity_entry(
    realtime_a,'moonpetal-harvest-help',party_revision+1,'phase8db-entry-stale-party'
  );
  perform pg_temp.activity_assert(result->>'status'='party_changed','a stale party revision cannot prepare activity entry');

  update public.player_moderation_states set status='suspended',
    suspension_reason='Local activity entry guard test.', suspended_at=now(),
    suspended_by_admin_id='11111111-1111-4111-8111-111111111111'
  where player_profile_id=player_b;
  result := public.prepare_realtime_cooperative_activity_entry(
    realtime_a,'moonpetal-harvest-help',party_revision,'phase8db-entry-suspended'
  );
  perform pg_temp.activity_assert(result->>'status'='entry_conflict','a suspended participant blocks activity entry');
  update public.player_moderation_states set status='active', suspension_reason=null,
    suspended_at=null, suspended_by_admin_id=null where player_profile_id=player_b;

  update public.player_party_members set status='removed', ended_at=now()
  where party_id=active_party_id and player_profile_id=player_b and status='active';
  select selected_party.revision into strict party_revision
  from public.player_parties selected_party where selected_party.id=active_party_id;
  result := public.prepare_realtime_cooperative_activity_entry(
    realtime_a,'moonpetal-harvest-help',party_revision,'phase8db-entry-party-small'
  );
  perform pg_temp.activity_assert(result->>'status'='party_size','a party below the reviewed minimum is rejected');
  update public.player_party_members set status='active', ended_at=null
  where party_id=active_party_id and player_profile_id=player_b;

  insert into public.player_party_members (party_id,player_profile_id,role,status,connection_status)
  values
    (active_party_id,player_c,'member','active','online'),
    (active_party_id,player_d,'member','active','online'),
    (active_party_id,player_e,'member','active','online');
  select selected_party.revision into strict party_revision
  from public.player_parties selected_party where selected_party.id=active_party_id;
  result := public.prepare_realtime_cooperative_activity_entry(
    realtime_a,'moonpetal-harvest-help',party_revision,'phase8db-entry-party-large'
  );
  perform pg_temp.activity_assert(result->>'status'='party_size','a party above the reviewed maximum is rejected');
  update public.player_party_members set status='removed', ended_at=now()
  where party_id=active_party_id and player_profile_id in (player_d,player_e);

  guard_party_id := gen_random_uuid();
  insert into public.player_parties (id,public_party_id,status,capacity,revision,leader_profile_id)
  values (guard_party_id,gen_random_uuid(),'active',4,1,player_c);
  insert into public.cooperative_activity_instances (
    activity_version_id,party_id,party_public_id,locked_party_revision,leader_profile_id,
    status,current_objective_key,minimum_active_participants,waiting_expires_at,started_at,
    expires_at,return_world_map_id
  ) values (
    '8d0b0000-0000-4000-8000-000000000001',guard_party_id,
    (select public_party_id from public.player_parties where id=guard_party_id),1,player_c,
    'active','gather-seed-bundles',2,now()+interval '2 minutes',now(),now()+interval '8 minutes',map_id
  ) returning id into guard_instance_id;
  insert into public.cooperative_activity_participants (
    instance_id,player_profile_id,public_presence_id,connection_status
  ) select guard_instance_id,profile.id,profile.public_presence_id,'online'
    from public.player_profiles profile where profile.id=player_c;
  select selected_party.revision into strict party_revision
  from public.player_parties selected_party where selected_party.id=active_party_id;
  result := public.prepare_realtime_cooperative_activity_entry(
    realtime_a,'moonpetal-harvest-help',party_revision,'phase8db-entry-participant-active'
  );
  perform pg_temp.activity_assert(result->>'status'='entry_conflict','a participant already active elsewhere is rejected');
  update public.cooperative_activity_participants set connection_status='removed',reward_eligible=false,
    removed_at=now(),removal_reason='local_guard_complete' where instance_id=guard_instance_id;
  update public.cooperative_activity_instances set status='failed',completed_at=now(),
    result_code='local_guard_complete',reward_settlement_status='not_applicable' where id=guard_instance_id;
  update public.player_parties set status='disbanded',closed_at=now() where id=guard_party_id;
  update public.player_party_members set status='removed',ended_at=now()
  where party_id=active_party_id and player_profile_id=player_c;

  insert into public.cooperative_activity_instances (
    activity_version_id,party_id,party_public_id,locked_party_revision,leader_profile_id,
    status,current_objective_key,minimum_active_participants,waiting_expires_at,started_at,
    expires_at,return_world_map_id
  ) values (
    '8d0b0000-0000-4000-8000-000000000001',active_party_id,
    (select public_party_id from public.player_parties where id=active_party_id),party_revision,player_a,
    'active','gather-seed-bundles',2,now()+interval '2 minutes',now(),now()+interval '8 minutes',map_id
  ) returning id into guard_instance_id;
  insert into public.cooperative_activity_participants (
    instance_id,player_profile_id,public_presence_id,connection_status
  ) select guard_instance_id,profile.id,profile.public_presence_id,'online'
    from public.player_profiles profile where profile.id=player_b;
  result := public.prepare_realtime_cooperative_activity_entry(
    realtime_a,'moonpetal-harvest-help',party_revision,'phase8db-entry-party-active'
  );
  perform pg_temp.activity_assert(result->>'status'='entry_conflict','a party already owning an active instance is rejected');
  update public.cooperative_activity_participants set connection_status='removed',reward_eligible=false,
    removed_at=now(),removal_reason='local_guard_complete' where instance_id=guard_instance_id;
  update public.cooperative_activity_instances set status='failed',completed_at=now(),
    result_code='local_guard_complete',reward_settlement_status='not_applicable' where id=guard_instance_id;

  result := public.prepare_realtime_cooperative_activity_entry(
    realtime_a,'moonpetal-harvest-help',party_revision,'phase8db-entry-prepare'
  );
  preparation_id := (result #>> '{preparation,preparationId}')::uuid;
  ready_check_id := (result #>> '{preparation,readyCheckId}')::uuid;
  party_revision := (result #>> '{preparation,partyRevision}')::integer;
  perform pg_temp.activity_assert(
    result->>'status'='ready_check' and jsonb_array_length(result#>'{preparation,responses}')=2,
    'leader preparation creates one activity-specific ready check from the authoritative roster'
  );
  result := public.respond_realtime_party_ready_check(
    realtime_a,ready_check_id,party_revision,'ready','phase8db-ready-a'
  );
  party_revision := (result #>> '{party,revision}')::integer;
  result := public.respond_realtime_party_ready_check(
    realtime_b,ready_check_id,party_revision,'ready','phase8db-ready-b'
  );
  result := public.enter_realtime_cooperative_activity(
    realtime_a,preparation_id,'phase8db-entry-enter'
  );
  replay := public.enter_realtime_cooperative_activity(
    realtime_a,preparation_id,'phase8db-entry-enter'
  );
  activity_instance_public_id := (result #>> '{snapshot,instanceId}')::uuid;
  revision := (result #>> '{snapshot,revision}')::integer;
  perform pg_temp.activity_assert(
    result->>'status'='entered' and replay=result
      and jsonb_array_length(result#>'{snapshot,participants}')=2
      and result#>>'{snapshot,currentObjectiveKey}'='gather-seed-bundles',
    'entry is idempotent, locks two participants, and starts the first objective'
  );
  perform pg_temp.activity_assert(
    (select count(*)=1 from public.cooperative_activity_instances where public_instance_id=activity_instance_public_id and status='active')
      and (select count(*)=2 from public.cooperative_activity_participants participant
        join public.cooperative_activity_instances instance on instance.id=participant.instance_id
        where instance.public_instance_id=activity_instance_public_id),
    'one authoritative instance owns the locked roster'
  );

  -- Wrong objective and out-of-range attempts cannot mutate progress.
  result := public.interact_realtime_cooperative_activity(
    realtime_a,activity_instance_public_id,revision,'plant-shared-plots','shared-plot-1',7.5,8,
    'phase8db-wrong-objective'
  );
  perform pg_temp.activity_assert(result->>'status'='objective_changed','future objectives cannot be skipped');
  result := public.interact_realtime_cooperative_activity(
    realtime_a,activity_instance_public_id,revision,'gather-seed-bundles','seed-bundle-1',20,17,
    'phase8db-out-of-range'
  );
  perform pg_temp.activity_assert(result->>'status'='out_of_range','distance is checked against trusted realtime position');

  for index_number in 1..6 loop
    session_id := case when index_number % 2 = 1 then realtime_a else realtime_b end;
    object_key := 'seed-bundle-' || index_number::text;
    result := public.interact_realtime_cooperative_activity(
      session_id,activity_instance_public_id,revision,'gather-seed-bundles',object_key,
      6 + index_number,5,'phase8db-gather-'||index_number::text
    );
    revision := (result #>> '{snapshot,revision}')::integer;
  end loop;
  perform pg_temp.activity_assert(result#>>'{snapshot,currentObjectiveKey}'='plant-shared-plots',
    'six unique gathers transition atomically to planting');
  replay := public.interact_realtime_cooperative_activity(
    realtime_a,activity_instance_public_id,1,'gather-seed-bundles','seed-bundle-1',7,5,'phase8db-gather-1'
  );
  perform pg_temp.activity_assert(replay#>>'{snapshot,currentObjectiveKey}'='gather-seed-bundles',
    'an exact duplicate request returns its original response without new progress');

  for index_number in 1..6 loop
    session_id := case when index_number % 2 = 1 then realtime_a else realtime_b end;
    result := public.interact_realtime_cooperative_activity(
      session_id,activity_instance_public_id,revision,'plant-shared-plots','shared-plot-'||index_number::text,
      case when index_number <= 3 then 6 + index_number * 1.5 else 6 + (index_number-3) * 1.5 end,
      case when index_number <= 3 then 8 else 9.5 end,
      'phase8db-plant-'||index_number::text
    );
    revision := (result #>> '{snapshot,revision}')::integer;
  end loop;
  for index_number in 1..6 loop
    session_id := case when index_number % 2 = 1 then realtime_a else realtime_b end;
    result := public.interact_realtime_cooperative_activity(
      session_id,activity_instance_public_id,revision,'water-shared-crops','shared-crop-'||index_number::text,
      case when index_number <= 3 then 6 + index_number * 1.5 else 6 + (index_number-3) * 1.5 end,
      case when index_number <= 3 then 8 else 9.5 end,
      'phase8db-water-'||index_number::text
    );
    revision := (result #>> '{snapshot,revision}')::integer;
  end loop;
  perform pg_temp.activity_assert(result#>>'{snapshot,currentObjectiveKey}'='let-crops-grow'
    and result#>>'{snapshot,objectives,3,status}'='active','watering starts one server-time growth objective');
  update public.cooperative_activity_objectives set timer_ends_at = now() - interval '1 second'
  where instance_id=(select id from public.cooperative_activity_instances where public_instance_id=activity_instance_public_id)
    and objective_key='let-crops-grow';
  result := public.get_realtime_cooperative_activity_bootstrap(realtime_a);
  revision := (result #>> '{instance,revision}')::integer;
  perform pg_temp.activity_assert(result#>>'{instance,currentObjectiveKey}'='harvest-together'
    and result#>>'{instance,objectives,3,status}'='completed','server time alone completes bounded growth');

  for index_number in 1..6 loop
    session_id := case when index_number % 2 = 1 then realtime_a else realtime_b end;
    result := public.interact_realtime_cooperative_activity(
      session_id,activity_instance_public_id,revision,'harvest-together','ripe-crop-'||index_number::text,
      case when index_number <= 3 then 6 + index_number * 1.5 else 6 + (index_number-3) * 1.5 end,
      case when index_number <= 3 then 8 else 9.5 end,
      'phase8db-harvest-'||index_number::text
    );
    revision := (result #>> '{snapshot,revision}')::integer;
  end loop;
  for index_number in 1..6 loop
    session_id := case when index_number % 2 = 1 then realtime_a else realtime_b end;
    result := public.interact_realtime_cooperative_activity(
      session_id,activity_instance_public_id,revision,'deliver-community-harvest','delivery-'||index_number::text,
      14,10,'phase8db-deliver-'||index_number::text
    );
    revision := (result #>> '{snapshot,revision}')::integer;
  end loop;
  result := public.interact_realtime_cooperative_activity(
    realtime_a,activity_instance_public_id,revision,'community-harvest-complete','community-bell',14,9,
    'phase8db-complete'
  );
  replay := public.interact_realtime_cooperative_activity(
    realtime_a,activity_instance_public_id,revision,'community-harvest-complete','community-bell',14,9,
    'phase8db-complete'
  );
  select count(*)::integer into completion_count from public.cooperative_activity_completions completion
  join public.cooperative_activity_instances instance on instance.id=completion.instance_id
  where instance.public_instance_id=activity_instance_public_id;
  perform pg_temp.activity_assert(
    result->>'status'='completed' and replay=result and completion_count=1
      and (select count(*)=2 from public.cooperative_activity_reward_receipts receipt
        join public.cooperative_activity_completions completion on completion.id=receipt.completion_id
        join public.cooperative_activity_instances instance on instance.id=completion.instance_id
        where instance.public_instance_id=activity_instance_public_id and receipt.status='settled')
      and (select balance=before_a+15 from public.player_dust_accounts where player_profile_id=player_a)
      and (select balance=before_b+15 from public.player_dust_accounts where player_profile_id=player_b)
      and private.cozy_owned_quantity(player_a,(select id from public.cozy_item_definitions where slug='moonbean'))=2
      and private.cozy_owned_quantity(player_b,(select id from public.cozy_item_definitions where slug='moonbean'))=2,
    'completion and equal off-chain DUST and item rewards settle exactly once for both participants'
  );
  perform pg_temp.activity_assert(
    not exists (select 1 from public.cooperative_activity_temporary_items item
      join public.cooperative_activity_instances instance on instance.id=item.instance_id
      where instance.public_instance_id=activity_instance_public_id)
      and not exists (select 1 from public.player_dust_ledger where reason='cooperative_activity_reward' and reference_type<>'cooperative_activity'),
    'temporary activity items are cleared and no blockchain or unrelated reward authority is used'
  );
end;
$$;

rollback;
select 'cooperative activity execution assertions passed' as result;
