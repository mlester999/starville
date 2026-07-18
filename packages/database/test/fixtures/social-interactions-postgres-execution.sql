-- Executes Phase 8C settlement in committed state so the runner can follow with concurrent sessions.
begin;

create or replace function pg_temp.assert_true(condition boolean, assertion_message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception using errcode = 'P0001',
      message = 'SOCIAL_INTERACTION_ASSERTION_FAILED: ' || assertion_message;
  end if;
end;
$$;

do $$
declare
  player_a_id constant uuid := '82000000-0000-4000-8000-000000000001';
  player_b_id constant uuid := '82000000-0000-4000-8000-000000000002';
  challenge_a_id constant uuid := '82000000-0000-4000-8000-000000000003';
  challenge_b_id constant uuid := '82000000-0000-4000-8000-000000000004';
  access_a_id constant uuid := '82000000-0000-4000-8000-000000000005';
  access_b_id constant uuid := '82000000-0000-4000-8000-000000000006';
  realtime_a_id constant uuid := '82000000-0000-4000-8000-000000000007';
  realtime_b_id constant uuid := '82000000-0000-4000-8000-000000000008';
  config_id uuid; map_id uuid; map_version_id uuid; channel_id uuid;
  moonbean_id uuid; sunroot_id uuid; tool_id uuid;
  result jsonb; replay jsonb; gift_id uuid; trade_id uuid; revision integer;
  cleanup_result jsonb;
  a_moonbean_before integer; b_moonbean_before integer;
  receipt_mutation_denied boolean := false;
  invalid_batch_rejected boolean := false;
begin
  select id into strict config_id from public.token_gate_configs
  where environment_key = 'development' and network = 'solana:devnet';
  select map.id, map.active_published_version_id into strict map_id, map_version_id
  from public.world_maps map where map.slug = 'lantern-square';
  select id into strict channel_id from public.realtime_channels
  where world_map_id = map_id and channel_number = 1;
  select id into strict moonbean_id from public.cozy_item_definitions where slug = 'moonbean-seed';
  select id into strict sunroot_id from public.cozy_item_definitions where slug = 'sunroot-seed';
  select id into strict tool_id from public.cozy_item_definitions where slug = 'starter-watering-can';

  insert into public.wallet_auth_challenges (
    id, wallet_address, network, token_gate_config_id, config_version_snapshot,
    nonce_hash, message_hash, domain, uri, issued_at, expires_at, consumed_at,
    request_id, ip_hash
  ) values
    (challenge_a_id, '11111111111111111111111111111114', 'solana:devnet', config_id, 1,
      repeat('1', 64), repeat('2', 64), 'localhost', 'http://localhost:3000',
      now() - interval '1 minute', now() + interval '4 minutes', now(),
      'phase8c-challenge-a', repeat('3', 64)),
    (challenge_b_id, '11111111111111111111111111111115', 'solana:devnet', config_id, 1,
      repeat('4', 64), repeat('5', 64), 'localhost', 'http://localhost:3000',
      now() - interval '1 minute', now() + interval '4 minutes', now(),
      'phase8c-challenge-b', repeat('6', 64));

  insert into public.wallet_access_sessions (
    id, challenge_id, wallet_address, network, token_gate_config_id,
    config_version_snapshot, session_token_hash, observed_balance_raw,
    required_balance_raw, checked_slot, last_balance_check_at, expires_at
  ) values
    (access_a_id, challenge_a_id, '11111111111111111111111111111114', 'solana:devnet',
      config_id, 1, repeat('7', 64), 1000, 1000, 1, now(), now() + interval '30 minutes'),
    (access_b_id, challenge_b_id, '11111111111111111111111111111115', 'solana:devnet',
      config_id, 1, repeat('8', 64), 1000, 1000, 1, now(), now() + interval '30 minutes');

  insert into public.player_profiles (
    id, wallet_address, display_name, appearance_preset, current_map_id,
    current_map_version_id, safe_position_x, safe_position_y, facing_direction
  ) values
    (player_a_id, '11111111111111111111111111111114', 'Social Player A', 'moss',
      'lantern-square', map_version_id, 12, 8, 'south'),
    (player_b_id, '11111111111111111111111111111115', 'Social Player B', 'river',
      'lantern-square', map_version_id, 14, 8, 'north');

  perform public.bootstrap_player_cozy_gameplay(
    '11111111111111111111111111111114', 'phase8c-bootstrap-player-a', 'phase8c-bootstrap-a'
  );
  perform public.bootstrap_player_cozy_gameplay(
    '11111111111111111111111111111115', 'phase8c-bootstrap-player-b', 'phase8c-bootstrap-b'
  );
  perform pg_temp.assert_true(private.cozy_add_item(
    player_a_id, moonbean_id, 12, 'system_refund', 'phase8c-fixture',
    'phase8c-grant-a-moonbean', 'phase8c-grant-a-moonbean'
  ), 'fixture grants player A tradable inventory');
  perform pg_temp.assert_true(private.cozy_add_item(
    player_b_id, sunroot_id, 12, 'system_refund', 'phase8c-fixture',
    'phase8c-grant-b-sunroot', 'phase8c-grant-b-sunroot'
  ), 'fixture grants player B tradable inventory');

  insert into public.realtime_sessions (
    id, player_profile_id, wallet_access_session_id, world_map_id, world_map_version_id,
    channel_id, connection_id, last_position_x, last_position_y, last_facing_direction
  ) values
    (realtime_a_id, player_a_id, access_a_id, map_id, map_version_id,
      channel_id, 'phase8c-a', 12, 8, 'south'),
    (realtime_b_id, player_b_id, access_b_id, map_id, map_version_id,
      channel_id, 'phase8c-b', 14, 8, 'north');

  result := public.inspect_realtime_social_player(
    realtime_a_id, (select public_presence_id from public.player_profiles where id = player_b_id)
  );
  perform pg_temp.assert_true(
    result ->> 'status' = 'ok'
      and result #>> '{profile,displayName}' = 'Social Player B'
      and not (result -> 'profile' ? 'walletAddress')
      and not (result -> 'profile' ? 'inventory'),
    'inspect derives proximity and returns only public profile fields'
  );

  result := public.create_realtime_social_gift(
    realtime_a_id, (select public_presence_id from public.player_profiles where id = player_b_id),
    'starter-watering-can', 1, 'phase8c-tool-gift'
  );
  perform pg_temp.assert_true(result ->> 'status' = 'item_restricted',
    'permanent starter tools cannot be gifted');

  select private.cozy_owned_quantity(player_a_id, moonbean_id),
    private.cozy_owned_quantity(player_b_id, moonbean_id)
  into a_moonbean_before, b_moonbean_before;
  result := public.create_realtime_social_gift(
    realtime_a_id, (select public_presence_id from public.player_profiles where id = player_b_id),
    'moonbean-seed', 2, 'phase8c-gift-create'
  );
  gift_id := (result #>> '{interaction,id}')::uuid;
  perform pg_temp.assert_true(result ->> 'status' = 'created' and gift_id is not null,
    'eligible gift request is persisted');
  result := public.respond_realtime_social_gift(
    realtime_b_id, gift_id, 'accept', 'phase8c-gift-accept'
  );
  replay := public.respond_realtime_social_gift(
    realtime_b_id, gift_id, 'accept', 'phase8c-gift-accept-retry'
  );
  perform pg_temp.assert_true(
    result ->> 'status' = 'completed' and replay ->> 'status' = 'completed'
      and result #>> '{receipt,id}' = replay #>> '{receipt,id}'
      and private.cozy_owned_quantity(player_a_id, moonbean_id) = a_moonbean_before - 2
      and private.cozy_owned_quantity(player_b_id, moonbean_id) = b_moonbean_before + 2
      and (select count(*) = 1 from public.social_interaction_receipts where interaction_id = gift_id),
    'gift acceptance settles exactly once and retries return the immutable receipt'
  );

  begin
    update public.social_interaction_receipts set completed_at = now() where interaction_id = gift_id;
  exception when insufficient_privilege then
    receipt_mutation_denied := true;
  end;
  perform pg_temp.assert_true(receipt_mutation_denied, 'settlement receipts are append-only');

  result := public.create_realtime_social_trade(
    realtime_a_id, (select public_presence_id from public.player_profiles where id = player_b_id),
    'phase8c-trade-decline'
  );
  trade_id := (result #>> '{interaction,id}')::uuid;
  result := public.respond_realtime_social_trade(
    realtime_b_id, trade_id, 'decline', 'phase8c-trade-decline-response'
  );
  perform pg_temp.assert_true(result ->> 'status' = 'declined'
    and not exists(select 1 from public.player_inventory_reservations where interaction_id = trade_id),
    'declined trades mutate no inventory and retain no reservations');

  result := public.create_realtime_social_trade(
    realtime_a_id, (select public_presence_id from public.player_profiles where id = player_b_id),
    'phase8c-concurrent-trade'
  );
  trade_id := (result #>> '{interaction,id}')::uuid;
  result := public.respond_realtime_social_trade(
    realtime_b_id, trade_id, 'accept', 'phase8c-concurrent-accept'
  );
  revision := (result #>> '{interaction,revision}')::integer;
  result := public.update_realtime_social_trade_offer(
    realtime_a_id, trade_id, revision,
    '[{"itemSlug":"moonbean-seed","quantity":3}]'::jsonb,
    'phase8c-concurrent-offer-a'
  );
  revision := (result #>> '{interaction,revision}')::integer;
  result := public.update_realtime_social_trade_offer(
    realtime_b_id, trade_id, revision,
    '[{"itemSlug":"sunroot-seed","quantity":4}]'::jsonb,
    'phase8c-concurrent-offer-b'
  );
  perform pg_temp.assert_true(
    result ->> 'status' = 'updated'
      and (select count(*) = 2 from public.player_inventory_reservations where interaction_id = trade_id),
    'trade revision reserves both exact offers before confirmation'
  );

  perform pg_temp.assert_true(
    public.create_realtime_social_gift(
      realtime_a_id, (select public_presence_id from public.player_profiles where id = player_a_id),
      'moonbean-seed', 1, 'phase8c-self-gift'
    ) ->> 'status' in ('player_unavailable', 'access_changed'),
    'players cannot interact with themselves'
  );

  perform public.update_realtime_chat_preference(
    realtime_a_id, (select public_presence_id from public.player_profiles where id = player_b_id), 'block'
  );
  result := public.invalidate_realtime_social_pair(
    realtime_a_id, (select public_presence_id from public.player_profiles where id = player_b_id),
    'phase8c-block-invalidate'
  );
  perform pg_temp.assert_true(jsonb_array_length(result -> 'interactions') = 1
    and not exists(select 1 from public.player_inventory_reservations where interaction_id = trade_id),
    'block immediately invalidates an active trade and releases reservations');
  perform public.update_realtime_chat_preference(
    realtime_a_id, (select public_presence_id from public.player_profiles where id = player_b_id), 'unblock'
  );

  -- Recreate the final negotiating trade for two independent psql confirmation sessions.
  result := public.create_realtime_social_trade(
    realtime_a_id, (select public_presence_id from public.player_profiles where id = player_b_id),
    'phase8c-concurrency-final'
  );
  trade_id := (result #>> '{interaction,id}')::uuid;
  result := public.respond_realtime_social_trade(
    realtime_b_id, trade_id, 'accept', 'phase8c-concurrency-final-accept'
  );
  revision := (result #>> '{interaction,revision}')::integer;
  result := public.update_realtime_social_trade_offer(
    realtime_a_id, trade_id, revision,
    '[{"itemSlug":"moonbean-seed","quantity":3}]'::jsonb,
    'phase8c-concurrency-final-offer-a'
  );
  revision := (result #>> '{interaction,revision}')::integer;
  result := public.update_realtime_social_trade_offer(
    realtime_b_id, trade_id, revision,
    '[{"itemSlug":"sunroot-seed","quantity":4}]'::jsonb,
    'phase8c-concurrency-final-offer-b'
  );
  perform pg_temp.assert_true(result ->> 'status' = 'updated',
    'concurrency trade is prepared at one exact revision');

  insert into public.social_interaction_requests (
    id, interaction_type, sender_profile_id, target_profile_id, world_map_id,
    world_map_version_id, channel_id, client_request_id, request_hash, status,
    expires_at, reconnect_deadline, created_at
  ) values
    ('87000000-0000-4000-8000-000000000010', 'gift', player_a_id, player_b_id,
      map_id, map_version_id, channel_id, 'phase8-lint-expired-gift', repeat('a', 64),
      'pending', now() - interval '3 minutes', null, now() - interval '10 minutes'),
    ('87000000-0000-4000-8000-000000000011', 'trade', player_a_id, player_b_id,
      map_id, map_version_id, channel_id, 'phase8-lint-expired-trade', repeat('b', 64),
      'negotiating', now() - interval '2 minutes', null, now() - interval '10 minutes'),
    ('87000000-0000-4000-8000-000000000012', 'trade', player_a_id, player_b_id,
      map_id, map_version_id, channel_id, 'phase8-lint-reconnect-expired', repeat('c', 64),
      'negotiating', now() + interval '10 minutes', now() - interval '1 second',
      now() - interval '1 minute'),
    ('87000000-0000-4000-8000-000000000013', 'gift', player_a_id, player_b_id,
      map_id, map_version_id, channel_id, 'phase8-lint-active-gift', repeat('d', 64),
      'pending', now() + interval '10 minutes', null, now() - interval '1 minute'),
    ('87000000-0000-4000-8000-000000000014', 'trade', player_a_id, player_b_id,
      map_id, map_version_id, channel_id, 'phase8-lint-reconnect-active', repeat('e', 64),
      'negotiating', now() + interval '10 minutes', now() + interval '1 minute',
      now() - interval '1 minute');
  insert into public.player_gift_items (
    interaction_id, item_definition_id, quantity, content_version
  ) values
    ('87000000-0000-4000-8000-000000000010', moonbean_id, 1, 1),
    ('87000000-0000-4000-8000-000000000013', moonbean_id, 1, 1);
  insert into public.player_inventory_reservations (
    interaction_id, player_profile_id, item_definition_id, quantity, offer_revision, expires_at
  ) values
    ('87000000-0000-4000-8000-000000000011', player_a_id, moonbean_id, 1, 1,
      now() - interval '2 minutes'),
    ('87000000-0000-4000-8000-000000000012', player_b_id, sunroot_id, 1, 1,
      now() - interval '1 second');

  cleanup_result := public.cleanup_social_interactions(2, 'phase8-lint-cleanup-batch-one');
  perform pg_temp.assert_true(
    cleanup_result = jsonb_build_object('processed', 2, 'reservationsReleased', 1)
      and (select status = 'expired' and failure_code = 'request_expired'
        from public.social_interaction_requests where id = '87000000-0000-4000-8000-000000000010')
      and (select status = 'expired' and failure_code = 'request_expired'
        from public.social_interaction_requests where id = '87000000-0000-4000-8000-000000000011')
      and (select status = 'negotiating'
        from public.social_interaction_requests where id = '87000000-0000-4000-8000-000000000012'),
    'cleanup enforces its batch limit while expiring requests and releasing reservations'
  );

  cleanup_result := public.cleanup_social_interactions(100, 'phase8-lint-cleanup-batch-two');
  perform pg_temp.assert_true(
    cleanup_result = jsonb_build_object('processed', 1, 'reservationsReleased', 1)
      and (select status = 'expired' and reconnect_deadline is null
        from public.social_interaction_requests where id = '87000000-0000-4000-8000-000000000012')
      and not exists (select 1 from public.player_inventory_reservations
        where interaction_id in (
          '87000000-0000-4000-8000-000000000011',
          '87000000-0000-4000-8000-000000000012'
        )),
    'cleanup honors elapsed reconnect deadlines and releases every expired reservation'
  );

  cleanup_result := public.cleanup_social_interactions(100, 'phase8-lint-cleanup-repeat');
  perform pg_temp.assert_true(
    cleanup_result = jsonb_build_object('processed', 0, 'reservationsReleased', 0)
      and (select status = 'pending'
        from public.social_interaction_requests where id = '87000000-0000-4000-8000-000000000013')
      and (select status = 'negotiating' and reconnect_deadline > now()
        from public.social_interaction_requests where id = '87000000-0000-4000-8000-000000000014')
      and (select count(*) = 3 from public.social_interaction_audit
        where interaction_id in (
          '87000000-0000-4000-8000-000000000010',
          '87000000-0000-4000-8000-000000000011',
          '87000000-0000-4000-8000-000000000012'
        ) and action in ('gift_expired', 'trade_expired')),
    'repeated cleanup is idempotent and leaves active interactions untouched'
  );

  begin
    perform public.cleanup_social_interactions(0, 'phase8-lint-invalid-batch');
  exception when sqlstate '22023' then
    invalid_batch_rejected := true;
  end;
  perform pg_temp.assert_true(
    invalid_batch_rejected
      and (select receipt_retention_days = 180 and audit_retention_days = 180
        from public.social_interaction_settings where singleton_key),
    'cleanup rejects an out-of-range batch without altering reviewed retention settings'
  );
end;
$$;

commit;
select 'social interaction execution setup passed' as result;
