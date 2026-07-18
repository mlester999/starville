-- Executes the Phase 8B authority in the isolated local PostgreSQL cluster.
begin;

create or replace function pg_temp.assert_true(condition boolean, assertion_message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception using errcode = 'P0001',
      message = 'MULTIPLAYER_CHAT_ASSERTION_FAILED: ' || assertion_message;
  end if;
end;
$$;

do $$
declare
  player_a_id constant uuid := '81000000-0000-4000-8000-000000000001';
  player_b_id constant uuid := '81000000-0000-4000-8000-000000000002';
  challenge_a_id constant uuid := '81000000-0000-4000-8000-000000000003';
  challenge_b_id constant uuid := '81000000-0000-4000-8000-000000000004';
  access_a_id constant uuid := '81000000-0000-4000-8000-000000000005';
  access_b_id constant uuid := '81000000-0000-4000-8000-000000000006';
  realtime_a_id constant uuid := '81000000-0000-4000-8000-000000000007';
  realtime_b_id constant uuid := '81000000-0000-4000-8000-000000000008';
  admin_user_id constant uuid := '81000000-0000-4000-8000-000000000009';
  auth_session_id constant uuid := '81000000-0000-4000-8000-000000000010';
  admin_session_id constant uuid := '81000000-0000-4000-8000-000000000011';
  config_id uuid;
  map_id uuid;
  map_version_id uuid;
  channel_id uuid;
  admin_role_id uuid;
  permission_version integer;
  session_version integer;
  accepted jsonb;
  replayed jsonb;
  unreported jsonb;
  history jsonb;
  preference jsonb;
  reported jsonb;
  detail jsonb;
  action_result jsonb;
  cleanup_result jsonb;
  evidence_mutation_denied boolean := false;
  action_mutation_denied boolean := false;
begin
  select id into strict config_id from public.token_gate_configs
  where environment_key = 'development' and network = 'solana:devnet';
  select map.id, map.active_published_version_id into strict map_id, map_version_id
  from public.world_maps map where map.slug = 'lantern-square';
  select id into strict channel_id from public.realtime_channels
  where world_map_id = map_id and channel_number = 1;

  insert into public.wallet_auth_challenges (
    id, wallet_address, network, token_gate_config_id, config_version_snapshot,
    nonce_hash, message_hash, domain, uri, issued_at, expires_at, consumed_at,
    request_id, ip_hash
  ) values
    (challenge_a_id, '11111111111111111111111111111112', 'solana:devnet', config_id, 1,
      repeat('a', 64), repeat('b', 64), 'localhost', 'http://localhost:3000',
      now() - interval '1 minute', now() + interval '4 minutes', now(),
      'phase8b-challenge-a', repeat('c', 64)),
    (challenge_b_id, '11111111111111111111111111111113', 'solana:devnet', config_id, 1,
      repeat('d', 64), repeat('e', 64), 'localhost', 'http://localhost:3000',
      now() - interval '1 minute', now() + interval '4 minutes', now(),
      'phase8b-challenge-b', repeat('f', 64));

  insert into public.wallet_access_sessions (
    id, challenge_id, wallet_address, network, token_gate_config_id,
    config_version_snapshot, session_token_hash, observed_balance_raw,
    required_balance_raw, checked_slot, last_balance_check_at, expires_at
  ) values
    (access_a_id, challenge_a_id, '11111111111111111111111111111112', 'solana:devnet',
      config_id, 1, repeat('1', 64), 1000, 1000, 1, now(), now() + interval '30 minutes'),
    (access_b_id, challenge_b_id, '11111111111111111111111111111113', 'solana:devnet',
      config_id, 1, repeat('2', 64), 1000, 1000, 1, now(), now() + interval '30 minutes');

  insert into public.player_profiles (
    id, wallet_address, display_name, appearance_preset, current_map_id,
    current_map_version_id, safe_position_x, safe_position_y, facing_direction
  ) values
    (player_a_id, '11111111111111111111111111111112', 'Chat Player A', 'moss',
      'lantern-square', map_version_id, 12, 8, 'south'),
    (player_b_id, '11111111111111111111111111111113', 'Chat Player B', 'river',
      'lantern-square', map_version_id, 14, 8, 'north');

  insert into public.realtime_sessions (
    id, player_profile_id, wallet_access_session_id, world_map_id, world_map_version_id,
    channel_id, connection_id, last_position_x, last_position_y, last_facing_direction
  ) values
    (realtime_a_id, player_a_id, access_a_id, map_id, map_version_id,
      channel_id, 'phase8b-a', 12, 8, 'south'),
    (realtime_b_id, player_b_id, access_b_id, map_id, map_version_id,
      channel_id, 'phase8b-b', 14, 8, 'north');

  accepted := public.accept_realtime_chat_message(
    realtime_a_id, 'chat-message-a', 'channel', 'A safe fixture message', 12, 8
  );
  replayed := public.accept_realtime_chat_message(
    realtime_a_id, 'chat-message-a', 'channel', 'A safe fixture message', 12, 8
  );
  perform pg_temp.assert_true(
    accepted ->> 'status' = 'accepted'
      and replayed ->> 'status' = 'replayed'
      and accepted #>> '{message,id}' = replayed #>> '{message,id}',
    'same request ID returns the original server-issued message exactly once'
  );
  perform pg_temp.assert_true(
    (accepted #>> '{message,senderPresenceId}')::uuid =
      (select public_presence_id from public.player_profiles where id = player_a_id)
      and accepted #>> '{message,senderDisplayName}' = 'Chat Player A'
      and accepted #>> '{message,worldId}' = 'lantern-square',
    'sender identity and routing fields come from trusted session state'
  );

  history := public.get_realtime_chat_history(realtime_b_id, 'channel', 0);
  perform pg_temp.assert_true(
    jsonb_array_length(history -> 'messages') = 1
      and history #>> '{messages,0,id}' = accepted #>> '{message,id}',
    'same-channel bounded history contains the accepted message once'
  );

  preference := public.update_realtime_chat_preference(
    realtime_b_id,
    (select public_presence_id from public.player_profiles where id = player_a_id),
    'block'
  );
  perform pg_temp.assert_true(
    (preference ->> 'blocked')::boolean
      and jsonb_array_length(public.get_realtime_chat_bootstrap(realtime_b_id) -> 'preferences') = 1,
    'block preference persists through reconnect bootstrap'
  );

  reported := public.report_realtime_chat_message(
    realtime_b_id, (accepted #>> '{message,id}')::uuid, 'harassment',
    'Fixture report reason', 'phase8b-report-a'
  );
  perform pg_temp.assert_true(
    reported ->> 'status' = 'accepted'
      and (select evidence_text = 'A safe fixture message'
        from public.multiplayer_chat_reports where id = (reported ->> 'reportId')::uuid),
    'report captures exact server evidence without accepting player-authored evidence'
  );

  begin
    update public.multiplayer_chat_reports set evidence_text = 'changed'
    where id = (reported ->> 'reportId')::uuid;
  exception when insufficient_privilege then
    evidence_mutation_denied := true;
  end;
  perform pg_temp.assert_true(evidence_mutation_denied, 'reported evidence is immutable');

  unreported := public.accept_realtime_chat_message(
    realtime_a_id, 'chat-message-b', 'nearby', 'Temporary retained message', 12, 8
  );
  update public.multiplayer_chat_messages
  set created_at = now() - interval '2 days', visible_until = now() - interval '1 day'
  where id in (
    (accepted #>> '{message,id}')::uuid,
    (unreported #>> '{message,id}')::uuid
  );
  cleanup_result := public.cleanup_multiplayer_chat_retention(100);
  perform pg_temp.assert_true(
    (cleanup_result ->> 'removedMessages')::integer = 1
      and exists(select 1 from public.multiplayer_chat_messages
        where id = (accepted #>> '{message,id}')::uuid)
      and not exists(select 1 from public.multiplayer_chat_messages
        where id = (unreported #>> '{message,id}')::uuid),
    'cleanup removes expired history but preserves evidence for an active report'
  );

  insert into auth.users(id, email) values(admin_user_id, 'phase8b-admin@example.invalid');
  insert into auth.sessions(id, user_id) values(auth_session_id, admin_user_id);
  select id into strict admin_role_id from public.admin_roles where key = 'game_administrator';
  insert into public.admin_users(user_id, role_id, status, display_name, mfa_required)
  values(admin_user_id, admin_role_id, 'active', 'Phase 8B Moderator', false)
  returning admin_users.permission_version, admin_users.session_version
  into permission_version, session_version;
  insert into public.admin_sessions(
    id, user_id, auth_session_id, status, expires_at,
    permission_version_snapshot, session_version_snapshot
  ) values(
    admin_session_id, admin_user_id, auth_session_id, 'active', now() + interval '1 hour',
    permission_version, session_version
  );

  detail := public.get_admin_multiplayer_chat_report(
    admin_user_id, auth_session_id, 'aal2', (reported ->> 'reportId')::uuid
  );
  perform pg_temp.assert_true(
    detail #>> '{report,evidence,text}' = 'A safe fixture message'
      and not (detail -> 'report' ? 'walletAddress')
      and jsonb_array_length(detail -> 'relatedReports') <= 20,
    'authorized detail returns protected bounded evidence without private identity'
  );

  action_result := public.admin_act_on_multiplayer_chat_report(
    admin_user_id, auth_session_id, 'aal2', (reported ->> 'reportId')::uuid,
    'chat_mute', 'Reviewed fixture chat mute', 1, 'phase8b-action-a', 15
  );
  perform pg_temp.assert_true(
    action_result ->> 'status' = 'applied'
      and (select before_state #>> '{status}' = 'open'
        and after_state #>> '{status}' = 'actioned'
        from public.multiplayer_chat_moderation_actions
        where request_id = 'phase8b-action-a'),
    'moderation action uses expected revision and exact before/after state'
  );
  perform pg_temp.assert_true(
    public.accept_realtime_chat_message(
      realtime_a_id, 'chat-message-muted', 'channel', 'This must not send', 12, 8
    ) ->> 'status' = 'chat_muted',
    'active chat mute remains enforced through the persistence authority'
  );

  begin
    update public.multiplayer_chat_moderation_actions set reason = 'Changed action reason'
    where request_id = 'phase8b-action-a';
  exception when insufficient_privilege then
    action_mutation_denied := true;
  end;
  perform pg_temp.assert_true(action_mutation_denied, 'moderation action history is append-only');

  action_result := public.admin_act_on_multiplayer_chat_report(
    admin_user_id, auth_session_id, 'aal2', (reported ->> 'reportId')::uuid,
    'chat_unmute', 'Reviewed fixture unmute', 2, 'phase8b-action-b', null
  );
  perform pg_temp.assert_true(
    action_result ->> 'status' = 'applied'
      and not exists(select 1 from public.multiplayer_chat_mutes
        where player_profile_id = player_a_id and status = 'active'),
    'authorized unmute can safely follow an actioned mute report'
  );
end;
$$;

select 'multiplayer-chat execution assertions passed' as result;
rollback;
