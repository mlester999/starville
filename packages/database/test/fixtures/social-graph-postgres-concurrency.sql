-- Test-only setup helpers for real multi-connection Phase 8D-A races.
create schema phase8d_test;

create function phase8d_test.reset_graph()
returns void language plpgsql as $$
begin
  update public.player_party_ready_checks
  set status = 'invalidated', completed_at = now()
  where status = 'active';
  update public.player_party_invitations
  set status = 'invalidated', resolved_at = now()
  where status = 'pending';
  update public.player_party_members
  set status = 'left', connection_status = 'offline', ended_at = now()
  where status = 'active';
  update public.player_parties
  set status = 'disbanded', revision = revision + 1, closed_at = now(),
    leader_reconnect_deadline = null, dormant_deadline = null
  where status = 'active';
  delete from public.multiplayer_chat_player_preferences
  where player_profile_id in (
      '82000000-0000-4000-8000-000000000001',
      '82000000-0000-4000-8000-000000000002',
      '83000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000002',
      '83000000-0000-4000-8000-000000000003'
    )
    or target_player_profile_id in (
      '82000000-0000-4000-8000-000000000001',
      '82000000-0000-4000-8000-000000000002',
      '83000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000002',
      '83000000-0000-4000-8000-000000000003'
    );
  update public.player_moderation_states
  set status = 'active', suspension_reason = null, suspended_at = null,
    suspended_by_admin_id = null, version = version + 1
  where player_profile_id = '83000000-0000-4000-8000-000000000002';
end;
$$;

create function phase8d_test.create_party(
  p_party_id uuid,
  p_public_party_id uuid,
  p_leader_profile_id uuid,
  p_member_profile_ids uuid[],
  p_invitation_target_ids uuid[] default array[]::uuid[],
  p_leader_reconnect_deadline timestamptz default null,
  p_leader_connection_status text default 'online',
  p_create_ready_check boolean default false
)
returns void language plpgsql as $$
declare
  ready_id uuid;
begin
  insert into public.player_parties (
    id, public_party_id, leader_profile_id, capacity, revision, leader_reconnect_deadline
  ) values (
    p_party_id, p_public_party_id, p_leader_profile_id, 4, 1, p_leader_reconnect_deadline
  );

  insert into public.player_party_members (
    party_id, player_profile_id, role, connection_status, last_world_map_id, last_channel_id,
    joined_at
  )
  select p_party_id, member.profile_id,
    case when member.profile_id = p_leader_profile_id then 'leader' else 'member' end,
    case when member.profile_id = p_leader_profile_id then p_leader_connection_status else 'online' end,
    session.world_map_id, session.channel_id,
    now() + make_interval(secs => member.ordinality::integer)
  from unnest(p_member_profile_ids) with ordinality as member(profile_id, ordinality)
  join lateral (
    select realtime.world_map_id, realtime.channel_id
    from public.realtime_sessions realtime
    where realtime.player_profile_id = member.profile_id and realtime.status = 'active'
    order by realtime.connected_at desc limit 1
  ) session on true;

  insert into public.player_party_invitations (
    party_id, inviter_profile_id, target_profile_id, party_revision, expires_at
  )
  select p_party_id, p_leader_profile_id, target.profile_id, 1, now() + interval '2 minutes'
  from unnest(p_invitation_target_ids) as target(profile_id);

  if p_create_ready_check then
    insert into public.player_party_ready_checks (
      party_id, party_revision, created_by_profile_id, expires_at
    ) values (p_party_id, 1, p_leader_profile_id, now() + interval '30 seconds')
    returning id into ready_id;
    insert into public.player_party_ready_responses (ready_check_id, player_profile_id)
    select ready_id, profile_id from unnest(p_member_profile_ids) as member(profile_id);
  end if;
end;
$$;

create function phase8d_test.prepare(p_scenario text)
returns void language plpgsql as $$
declare
  player_a constant uuid := '82000000-0000-4000-8000-000000000001';
  player_b constant uuid := '82000000-0000-4000-8000-000000000002';
  player_c constant uuid := '83000000-0000-4000-8000-000000000001';
  player_d constant uuid := '83000000-0000-4000-8000-000000000002';
begin
  perform phase8d_test.reset_graph();
  if p_scenario = 'same_target' then
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-000000000001', '86100000-0000-4000-8000-000000000001',
      player_a, array[player_a], array[player_d]
    );
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-000000000002', '86100000-0000-4000-8000-000000000002',
      player_c, array[player_c], array[player_d]
    );
  elsif p_scenario = 'promotion_leave' then
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-000000000003', '86100000-0000-4000-8000-000000000003',
      player_a, array[player_a, player_b]
    );
  elsif p_scenario = 'kick_leave' then
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-000000000008', '86100000-0000-4000-8000-000000000008',
      player_a, array[player_a, player_b]
    );
  elsif p_scenario = 'disband_accept' then
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-000000000004', '86100000-0000-4000-8000-000000000004',
      player_a, array[player_a, player_b], array[player_c]
    );
  elsif p_scenario = 'block_join' then
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-000000000005', '86100000-0000-4000-8000-000000000005',
      player_a, array[player_a], array[player_d]
    );
  elsif p_scenario = 'suspension_join' then
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-000000000009', '86100000-0000-4000-8000-000000000009',
      player_a, array[player_a], array[player_d]
    );
  elsif p_scenario = 'cleanup_reconnect' then
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-000000000006', '86100000-0000-4000-8000-000000000006',
      player_a, array[player_a, player_b], array[]::uuid[], now() - interval '1 second',
      'reconnecting'
    );
  elsif p_scenario = 'ready_response' then
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-000000000007', '86100000-0000-4000-8000-000000000007',
      player_a, array[player_a, player_b], array[]::uuid[], null, 'online', true
    );
  elsif p_scenario = 'ready_expired' then
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-00000000000a', '86100000-0000-4000-8000-00000000000a',
      player_a, array[player_a, player_b], array[]::uuid[], null, 'online', true
    );
  elsif p_scenario = 'ready_membership_changed' then
    perform phase8d_test.create_party(
      '86000000-0000-4000-8000-00000000000b', '86100000-0000-4000-8000-00000000000b',
      player_a, array[player_a, player_b], array[]::uuid[], null, 'online', true
    );
  else
    raise exception 'UNKNOWN_PHASE8D_RACE_SCENARIO';
  end if;
end;
$$;
