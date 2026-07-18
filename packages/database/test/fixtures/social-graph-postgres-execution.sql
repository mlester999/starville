-- Exercises durable Phase 8D-A friend, party, party-chat, ready-check, and privacy authority.
begin;

create or replace function pg_temp.assert_true(condition boolean, assertion_message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception using errcode = 'P0001',
      message = 'SOCIAL_GRAPH_ASSERTION_FAILED: ' || assertion_message;
  end if;
end;
$$;

do $$
<<social_graph_fixture>>
declare
  player_a_id constant uuid := '82000000-0000-4000-8000-000000000001';
  player_b_id constant uuid := '82000000-0000-4000-8000-000000000002';
  player_c_id constant uuid := '83000000-0000-4000-8000-000000000001';
  player_d_id constant uuid := '83000000-0000-4000-8000-000000000002';
  player_e_id constant uuid := '83000000-0000-4000-8000-000000000003';
  realtime_a_id constant uuid := '82000000-0000-4000-8000-000000000007';
  realtime_b_id constant uuid := '82000000-0000-4000-8000-000000000008';
  realtime_c_id constant uuid := '83000000-0000-4000-8000-000000000031';
  realtime_d_id constant uuid := '83000000-0000-4000-8000-000000000032';
  realtime_e_id constant uuid := '83000000-0000-4000-8000-000000000033';
  config_id uuid; map_id uuid; map_version_id uuid; channel_id uuid;
  result jsonb; replay jsonb; request_id uuid; friendship_id uuid;
  party_id uuid; revision integer; invitation_id uuid; ready_check_id uuid;
  party_chat_id uuid;
begin
  select id into strict config_id from public.token_gate_configs
  where environment_key = 'development' and network = 'solana:devnet';
  select map.id, map.active_published_version_id into strict map_id, map_version_id
  from public.world_maps map where map.slug = 'lantern-square';
  select id into strict channel_id from public.realtime_channels
  where world_map_id = map_id and channel_number = 1;

  insert into public.wallet_auth_challenges (
    id, wallet_address, network, token_gate_config_id, config_version_snapshot,
    nonce_hash, message_hash, domain, uri, issued_at, expires_at, consumed_at, request_id, ip_hash
  ) values
    ('83000000-0000-4000-8000-000000000011', '11111111111111111111111111111116', 'solana:devnet', config_id, 1,
      repeat('a',64), repeat('b',64), 'localhost', 'http://localhost:3000', now()-interval '1 minute', now()+interval '4 minutes', now(), 'phase8d-c', repeat('c',64)),
    ('83000000-0000-4000-8000-000000000012', '11111111111111111111111111111117', 'solana:devnet', config_id, 1,
      repeat('d',64), repeat('e',64), 'localhost', 'http://localhost:3000', now()-interval '1 minute', now()+interval '4 minutes', now(), 'phase8d-d', repeat('f',64)),
    ('83000000-0000-4000-8000-000000000013', '11111111111111111111111111111118', 'solana:devnet', config_id, 1,
      repeat('1',63)||'a', repeat('2',63)||'b', 'localhost', 'http://localhost:3000', now()-interval '1 minute', now()+interval '4 minutes', now(), 'phase8d-e', repeat('3',63)||'c');
  insert into public.wallet_access_sessions (
    id, challenge_id, wallet_address, network, token_gate_config_id, config_version_snapshot,
    session_token_hash, observed_balance_raw, required_balance_raw, checked_slot,
    last_balance_check_at, expires_at
  ) values
    ('83000000-0000-4000-8000-000000000021','83000000-0000-4000-8000-000000000011','11111111111111111111111111111116','solana:devnet',config_id,1,repeat('a',64),1000,1000,1,now(),now()+interval '30 minutes'),
    ('83000000-0000-4000-8000-000000000022','83000000-0000-4000-8000-000000000012','11111111111111111111111111111117','solana:devnet',config_id,1,repeat('b',64),1000,1000,1,now(),now()+interval '30 minutes'),
    ('83000000-0000-4000-8000-000000000023','83000000-0000-4000-8000-000000000013','11111111111111111111111111111118','solana:devnet',config_id,1,repeat('c',64),1000,1000,1,now(),now()+interval '30 minutes');
  insert into public.player_profiles (
    id, wallet_address, display_name, appearance_preset, current_map_id,
    current_map_version_id, safe_position_x, safe_position_y, facing_direction
  ) values
    (player_c_id,'11111111111111111111111111111116','Party Player C','moonberry','lantern-square',map_version_id,13,8,'south'),
    (player_d_id,'11111111111111111111111111111117','Party Player D','marigold','lantern-square',map_version_id,13,9,'north'),
    (player_e_id,'11111111111111111111111111111118','Party Player E','river','lantern-square',map_version_id,12,9,'east');
  insert into public.realtime_sessions (
    id, player_profile_id, wallet_access_session_id, world_map_id, world_map_version_id,
    channel_id, connection_id, last_position_x, last_position_y, last_facing_direction
  ) values
    (realtime_c_id,player_c_id,'83000000-0000-4000-8000-000000000021',map_id,map_version_id,channel_id,'phase8d-c',13,8,'south'),
    (realtime_d_id,player_d_id,'83000000-0000-4000-8000-000000000022',map_id,map_version_id,channel_id,'phase8d-d',13,9,'north'),
    (realtime_e_id,player_e_id,'83000000-0000-4000-8000-000000000023',map_id,map_version_id,channel_id,'phase8d-e',12,9,'east');

  result := public.send_realtime_friend_request(
    realtime_a_id, (select public_presence_id from public.player_profiles where id=player_b_id),
    'phase8d-friend-a-b'
  );
  replay := public.send_realtime_friend_request(
    realtime_a_id, (select public_presence_id from public.player_profiles where id=player_b_id),
    'phase8d-friend-a-b'
  );
  request_id := (result #>> '{friendRequest,id}')::uuid;
  perform pg_temp.assert_true(result->>'status'='created' and replay=result,
    'friend request creation is idempotent');
  result := public.respond_realtime_friend_request(
    realtime_b_id, request_id, 'accept', 'phase8d-friend-accept'
  );
  select id into strict friendship_id from public.player_friendships
  where player_one_profile_id=least(player_a_id,player_b_id)
    and player_two_profile_id=greatest(player_a_id,player_b_id) and status='accepted';
  perform pg_temp.assert_true(result->>'status'='accepted' and friendship_id is not null,
    'friend acceptance creates one canonical durable friendship');
  result := public.get_realtime_social_graph_bootstrap(realtime_a_id);
  perform pg_temp.assert_true(jsonb_array_length(result->'friends')=1
      and not ((result->'friends'->0) ? 'walletAddress')
      and not ((result->'friends'->0) ? 'lastSeenAt'),
    'friend bootstrap returns bounded privacy-safe presence');

  result := public.create_realtime_party(realtime_a_id,'phase8d-party-create');
  replay := public.create_realtime_party(realtime_a_id,'phase8d-party-create');
  party_id := (result #>> '{party,partyId}')::uuid;
  revision := (result #>> '{party,revision}')::integer;
  perform pg_temp.assert_true(result->>'status'='created' and replay=result,
    'party creation is idempotent and returns an exact revision');
  result := public.send_realtime_party_invitation(
    realtime_a_id,(select public_presence_id from public.player_profiles where id=player_b_id),
    revision,'phase8d-party-invite-b'
  );
  invitation_id := (result #>> '{invitation,id}')::uuid;
  revision := (result #>> '{party,revision}')::integer;
  result := public.respond_realtime_party_invitation(
    realtime_b_id,invitation_id,revision,'accept','phase8d-party-accept-b'
  );
  revision := (result #>> '{party,revision}')::integer;
  perform pg_temp.assert_true(result->>'status'='accepted'
      and jsonb_array_length(result#>'{party,members}')=2,
    'accepted invitation creates exactly one membership');

  result := public.send_realtime_party_invitation(
    realtime_a_id,(select public_presence_id from public.player_profiles where id=player_e_id),
    revision,'phase8d-party-invite-e'
  );
  invitation_id := (result #>> '{invitation,id}')::uuid;
  revision := (result #>> '{party,revision}')::integer;
  result := public.respond_realtime_party_invitation(
    realtime_e_id,invitation_id,revision,'accept','phase8d-party-accept-e'
  );
  revision := (result #>> '{party,revision}')::integer;

  result := public.accept_realtime_chat_message(
    realtime_a_id,'phase8d-party-chat','party','Party hello',12,8
  );
  party_chat_id := (result #>> '{message,id}')::uuid;
  perform pg_temp.assert_true(result->>'status'='accepted'
      and result#>>'{message,partyId}'=party_id::text,
    'party chat is persisted against the active authoritative party');
  result := public.get_realtime_chat_history(realtime_b_id,'party',0);
  perform pg_temp.assert_true(result#>>'{messages,0,id}'=party_chat_id::text,
    'active party member receives private party history');

  result := public.start_realtime_party_ready_check(
    realtime_a_id,revision,'phase8d-ready-start'
  );
  ready_check_id := (result #>> '{party,readyCheck,id}')::uuid;
  revision := (result #>> '{party,revision}')::integer;
  perform pg_temp.assert_true(result->>'status'='started' and ready_check_id is not null,
    'leader starts one revision-bound ready check');
  result := public.respond_realtime_party_ready_check(
    realtime_b_id,ready_check_id,revision,'ready','phase8d-ready-b'
  );
  replay := public.respond_realtime_party_ready_check(
    realtime_b_id,ready_check_id,revision,'ready','phase8d-ready-b'
  );
  perform pg_temp.assert_true(result->>'status'='updated' and replay=result
      and (select count(*)=1 from public.player_party_ready_responses response
        join public.player_party_ready_checks ready on ready.id=response.ready_check_id
        where ready.public_ready_check_id=social_graph_fixture.ready_check_id
          and response.player_profile_id=player_b_id and response.state='ready')
      and (select count(*)=2 from public.player_party_ready_responses response
        join public.player_party_ready_checks ready on ready.id=response.ready_check_id
        where ready.public_ready_check_id=social_graph_fixture.ready_check_id
          and response.player_profile_id<>player_b_id and response.state='waiting'),
    'ready response changes only the actor response and duplicate request IDs replay exactly');
  revision := (result #>> '{party,revision}')::integer;
  result := public.respond_realtime_party_ready_check(
    realtime_b_id,ready_check_id,revision-1,'not_ready','phase8d-ready-stale-revision'
  );
  perform pg_temp.assert_true(result->>'status'='party_changed'
      and (select state='ready' from public.player_party_ready_responses response
        join public.player_party_ready_checks ready on ready.id=response.ready_check_id
        where ready.public_ready_check_id=social_graph_fixture.ready_check_id
          and response.player_profile_id=player_b_id),
    'stale ready-check revisions fail without changing the authoritative response');

  -- Prepare two candidates racing for the fourth and final slot.
  result := public.send_realtime_party_invitation(
    realtime_a_id,(select public_presence_id from public.player_profiles where id=player_c_id),
    revision,'phase8d-concurrent-invite-c'
  );
  perform pg_temp.assert_true(result->>'status'='created','candidate C invitation is prepared');
  revision := (result #>> '{party,revision}')::integer;
  result := public.send_realtime_party_invitation(
    realtime_a_id,(select public_presence_id from public.player_profiles where id=player_d_id),
    revision,'phase8d-concurrent-invite-d'
  );
  perform pg_temp.assert_true(result->>'status'='created','candidate D invitation is prepared');
  revision := (result #>> '{party,revision}')::integer;

  perform pg_temp.assert_true(
    (select count(*)=1 from public.player_party_members member where member.party_id=(select party.id from public.player_parties party where party.public_party_id=(result#>>'{party,partyId}')::uuid) and member.status='active' and member.role='leader')
      and (select count(*)=3 from public.player_party_members member where member.party_id=(select party.id from public.player_parties party where party.public_party_id=(result#>>'{party,partyId}')::uuid) and member.status='active'),
    'prepared party has one leader and exactly one final slot');
end;
$$;

commit;
select 'social graph execution setup passed' as result;
